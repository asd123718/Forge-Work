import assert from "assert";
import { renderAsPlaintext } from "../../../../../../base/browser/markdownRenderer.js";
import { DeferredPromise, raceTimeout, timeout } from "../../../../../../base/common/async.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { autorun, constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { URI } from "../../../../../../base/common/uri.js";
import { isEqual } from "../../../../../../base/common/resources.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../../base/test/common/timeTravelScheduler.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agent.js";
import { AgentHostCodexAgentEnabledSettingId, IAgentHostService } from "../../../../../../platform/agentHost/common/agentService.js";
import { ChatInteractivity as ProtocolChatInteractivity, ChatOriginKind as ProtocolChatOriginKind, CustomizationEnablementKind, CustomizationLoadStatus, CustomizationType, McpServerStatus, MessageKind, SessionLifecycle } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { buildChatUri, buildDefaultChatUri, buildSubagentChatUri, ChangesetStatus, SessionSourceControlOutcome, SessionStatus as ProtocolSessionStatus, withSessionEhcliAdoptable, withSessionGitHubState, withSessionGitState, withSessionMultiRootMetadata, withSessionSourceControlState, withSessionWorkspaceless } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ActionType, NotificationType } from "../../../../../../platform/agentHost/common/state/sessionActions.js";
import { SessionConfigKey } from "../../../../../../platform/agentHost/common/sessionConfigKeys.js";
import { ConfigurationTarget, IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from "../../../../../../platform/storage/common/storage.js";
import { IProgressService } from "../../../../../../platform/progress/common/progress.js";
import { ITelemetryService } from "../../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../../platform/telemetry/common/telemetryUtils.js";
import { IWorkspaceTrustManagementService } from "../../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatWidgetService } from "../../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatSessionsService, isIChatSessionFileChange2 } from "../../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { ChatModeKind } from "../../../../../../workbench/contrib/chat/common/constants.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { ChatInteractivity, ChatOriginKind, getChatCapabilities, SessionStatus } from "../../../../../services/sessions/common/session.js";
import { ISessionsService } from "../../../../../services/sessions/browser/sessionsService.js";
import { IAgentHostActiveClientService } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentHost/agentHostActiveClientService.js";
import { LocalAgentHostSessionsProvider } from "../../browser/localAgentHostSessionsProvider.js";
import { IAutomationStorageService } from "../../../../automations/common/automationStorageService.js";
import { TestAutomationStorageService } from "../../../../automations/test/browser/automationTestUtils.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { IGitHubService } from "../../../../github/browser/githubService.js";
import { IPullRequestIconCache, PullRequestIconCache } from "../../../../github/browser/pullRequestIconCache.js";
import { computePullRequestIcon, GitHubPullRequestState } from "../../../../github/common/types.js";
import { IWorkbenchEnvironmentService } from "../../../../../../workbench/services/environment/common/environmentService.js";
const STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES = "sessions.agentHost.sessionConfigPicker.selectedValues";
class MockAgentHostService extends mock() {
  constructor() {
    super();
    this._onDidAction = new Emitter();
    this._onDidNotification = new Emitter();
    this._rootStateListenerCount = 0;
    this._onDidRootStateChange = new Emitter({
      onDidAddListener: () => this._rootStateListenerCount++,
      onWillRemoveListener: () => this._rootStateListenerCount--
    });
    this._onDidRootStateError = new Emitter();
    this._rootStateValue = { agents: [{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }] };
    this._onAgentHostStart = new Emitter();
    this.onAgentHostStart = this._onAgentHostStart.event;
    this.clientId = "test-local-client";
    this._sessions = /* @__PURE__ */ new Map();
    this.disposedSessions = [];
    this.dispatchedActions = [];
    this.failResolveSessionConfig = false;
    this.resolveSessionConfigResult = { schema: { type: "object", properties: {} }, values: { isolation: "worktree" } };
    this.resolveSessionConfigRequests = [];
    this._authenticationPending = observableValue("authenticationPending", false);
    this.authenticationPending = this._authenticationPending;
    this._nextSeq = 0;
    /**
     * Number of upcoming `listSessions()` calls that should reject, used to
     * simulate the agent throwing `AHP_AUTH_REQUIRED` (or a transient offline
     * error) before its token is effective server-side. Decremented per call.
     */
    this.failListSessionsCount = 0;
    this.listSessionsCallCount = 0;
    this.disposedChats = [];
    this.createdChats = [];
    this.createdSessionUris = [];
    this.createSessionConfigs = [];
    /**
     * Ordered log of wire-level operations: useful for asserting that
     * `createSession` strictly precedes `subscribe` for a given session URI.
     * Each entry is `${op}:${uri}`.
     */
    this.wireOps = [];
    // ---- Session-state subscriptions ---------------------------------------
    this._sessionStateEmitters = /* @__PURE__ */ new Map();
    this._sessionStateValues = /* @__PURE__ */ new Map();
    this.sessionSubscribeCounts = /* @__PURE__ */ new Map();
    this.sessionUnsubscribeCounts = /* @__PURE__ */ new Map();
    const self = this;
    this._rootStateSubscription = {
      get value() {
        return self._rootStateValue;
      },
      get verifiedValue() {
        return self._rootStateValue instanceof Error ? void 0 : self._rootStateValue;
      },
      onDidChange: self._onDidRootStateChange.event,
      onDidError: self._onDidRootStateError.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
  }
  get onDidAction() {
    return this._onDidAction.event;
  }
  get onDidNotification() {
    return this._onDidNotification.event;
  }
  get rootState() {
    return this._rootStateSubscription;
  }
  get rootStateListenerCount() {
    return this._rootStateListenerCount;
  }
  setAuthenticationPending(pending) {
    this._authenticationPending.set(pending, void 0);
  }
  nextClientSeq() {
    return this._nextSeq++;
  }
  async listSessions() {
    this.listSessionsCallCount++;
    await this.listSessionsBarrier?.p;
    if (this.failListSessionsCount > 0) {
      this.failListSessionsCount--;
      throw new Error("AHP_AUTH_REQUIRED");
    }
    return [...this._sessions.values()];
  }
  async disposeSession(session) {
    this.disposedSessions.push(session);
    const rawId = AgentSession.id(session);
    if (rawId === this.failDisposeSessionFor) {
      throw new Error(`Failed to dispose ${rawId}`);
    }
    this._sessions.delete(rawId);
    this.onDisposeSession?.(session);
  }
  async disposeChat(chat) {
    this.disposedChats.push(chat);
  }
  async createChat(session, chat, options) {
    this.createdChats.push({ session, chat, options });
    const key = session.toString();
    const existing = this._sessionStateValues.get(key);
    if (existing && Array.isArray(existing.chats)) {
      const newChat = {
        resource: chat.toString(),
        title: options?.title ?? "",
        status: ProtocolSessionStatus.Idle,
        modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString()
      };
      this.setSessionState(AgentSession.id(session), AgentSession.provider(session), {
        ...existing,
        chats: [...existing.chats, newChat]
      });
    }
  }
  async createSession(config) {
    const uri = config?.session ?? URI.parse("copilotcli:///auto-" + this._nextSeq);
    this.createSessionConfigs.push({
      config: config?.config,
      ...config?._meta ? { metadata: config._meta } : {},
      workingDirectory: config?.workingDirectories?.[0]
    });
    this.wireOps.push(`createSession:${uri.toString()}`);
    this.createdSessionUris.push(uri);
    const hook = this.onCreateSession;
    this.onCreateSession = void 0;
    if (hook) {
      await hook(uri);
    }
    return uri;
  }
  async resolveSessionConfig(request) {
    this.resolveSessionConfigRequests.push(request);
    await this.resolveSessionConfigBarrier?.p;
    await Promise.resolve();
    if (this.failResolveSessionConfig) {
      throw new Error("resolveSessionConfig unavailable");
    }
    return this.resolveSessionConfigResult;
  }
  dispatchAction(channel, action, clientId, clientSeq) {
    this.dispatchedActions.push({ channel, action, clientId, clientSeq });
  }
  dispatch(channel, action) {
    this.dispatchedActions.push({ channel, action, clientId: this.clientId, clientSeq: this._nextSeq++ });
  }
  // Test helpers
  addSession(meta) {
    this._sessions.set(AgentSession.id(meta.session), meta);
  }
  /**
   * Drop a session from what `listSessions()` reports, without going through
   * `disposeSession`. Simulates an agent that cannot enumerate its sessions
   * yet (auth token or SDK still loading) and so contributes nothing to the
   * host's aggregated listing.
   */
  stopListingSessions(...ids) {
    for (const id of ids) {
      this._sessions.delete(id);
    }
  }
  getSubscription(_kind, resource) {
    const key = resource.toString();
    this.wireOps.push(`subscribe:${key}`);
    this.sessionSubscribeCounts.set(key, (this.sessionSubscribeCounts.get(key) ?? 0) + 1);
    let emitter = this._sessionStateEmitters.get(key);
    if (!emitter) {
      emitter = new Emitter();
      this._sessionStateEmitters.set(key, emitter);
    }
    const self = this;
    const sub = {
      get value() {
        return self._sessionStateValues.get(key);
      },
      get verifiedValue() {
        return self._sessionStateValues.get(key);
      },
      onDidChange: emitter.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    return {
      object: sub,
      dispose: () => {
        this.sessionUnsubscribeCounts.set(key, (this.sessionUnsubscribeCounts.get(key) ?? 0) + 1);
      }
    };
  }
  setSessionState(rawId, provider, state) {
    const key = AgentSession.uri(provider, rawId).toString();
    this._sessionStateValues.set(key, state);
    this._sessionStateEmitters.get(key)?.fire(state);
  }
  setChangesetState(changesetUri, state) {
    this._sessionStateValues.set(changesetUri, state);
    this._sessionStateEmitters.get(changesetUri)?.fire(state);
  }
  setChatState(chatUri, state) {
    this._sessionStateValues.set(chatUri, state);
    this._sessionStateEmitters.get(chatUri)?.fire(state);
  }
  setAgents(agents) {
    this._rootStateValue = { agents };
    this._onDidRootStateChange.fire(this._rootStateValue);
  }
  /**
   * Fires a root state change that preserves the current `agents` reference,
   * simulating non-agent root deltas (e.g. `RootActiveSessionsChanged` on
   * every turn start/complete) that the real reducer emits without
   * replacing the `agents` slice.
   */
  fireNonAgentRootStateChange() {
    if (!this._rootStateValue || this._rootStateValue instanceof Error) {
      throw new Error("rootState not initialized; call setAgents first");
    }
    this._rootStateValue = { ...this._rootStateValue };
    this._onDidRootStateChange.fire(this._rootStateValue);
  }
  clearRootState() {
    this._rootStateValue = void 0;
  }
  replaceRootStateOnStart(agents) {
    const self = this;
    const previousEmitter = this._onDidRootStateChange;
    const previousActionEmitter = this._onDidAction;
    const previousNotificationEmitter = this._onDidNotification;
    const onDidChange = new Emitter({
      onDidAddListener: () => this._rootStateListenerCount++,
      onWillRemoveListener: () => this._rootStateListenerCount--
    });
    const value = { agents };
    this._onDidRootStateChange = onDidChange;
    this._onDidAction = new Emitter();
    this._onDidNotification = new Emitter();
    this._rootStateValue = value;
    this._rootStateSubscription = {
      get value() {
        return self._rootStateValue;
      },
      get verifiedValue() {
        return self._rootStateValue instanceof Error ? void 0 : self._rootStateValue;
      },
      onDidChange: onDidChange.event,
      onDidError: this._onDidRootStateError.event,
      onWillApplyAction: Event.None,
      onDidApplyAction: Event.None
    };
    this._onAgentHostStart.fire();
    previousEmitter.dispose();
    previousActionEmitter.dispose();
    previousNotificationEmitter.dispose();
  }
  fireAgentHostStart() {
    this._onAgentHostStart.fire();
  }
  setRootStateError() {
    const error = new Error("root state failed");
    this._rootStateValue = error;
    this._onDidRootStateError.fire(error);
  }
  fireNotification(n) {
    this._onDidNotification.fire(n);
  }
  fireAction(envelope) {
    this._onDidAction.fire(envelope);
  }
  dispose() {
    this._onDidAction.dispose();
    this._onDidNotification.dispose();
    this._onDidRootStateChange.dispose();
    this._onDidRootStateError.dispose();
    this._onAgentHostStart.dispose();
    for (const emitter of this._sessionStateEmitters.values()) {
      emitter.dispose();
    }
    this._sessionStateEmitters.clear();
  }
}
function createSession(id, opts) {
  let _meta = opts?.quickChat ? withSessionWorkspaceless(void 0, true) : void 0;
  _meta = withSessionMultiRootMetadata(_meta, opts?.multiRoot);
  if (opts?.adoptable) {
    _meta = withSessionEhcliAdoptable(_meta);
  }
  return {
    session: AgentSession.uri(opts?.provider ?? "copilotcli", id),
    startTime: opts?.startTime ?? 1e3,
    modifiedTime: opts?.modifiedTime ?? 2e3,
    summary: opts?.summary,
    project: opts?.project,
    workingDirectories: opts?.workingDirectory ? [opts?.workingDirectory] : void 0,
    _meta
  };
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
function createSchemaDefaultConfigurationService() {
  return new class extends TestConfigurationService {
    inspect(key) {
      const base = super.inspect(key);
      if (key === "chat.defaultConfiguration" && base.userValue === void 0) {
        const schemaDefault = { mode: "interactive", approvals: "manual" };
        return { ...base, value: schemaDefault, defaultValue: schemaDefault };
      }
      return base;
    }
  }();
}
function createProvider(disposables, agentHostService, contributions = [
  { type: "agent-host-copilotcli", name: "copilot", displayName: "Copilot", description: "test", icon: void 0 }
], options) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IAgentHostService, agentHostService);
  const configurationService = options?.configurationService ?? new TestConfigurationService();
  instantiationService.stub(IConfigurationService, configurationService);
  instantiationService.stub(IWorkspaceTrustManagementService, new class extends mock() {
    isWorkspaceTrusted() {
      return options?.workspaceTrusted ?? true;
    }
    async getUriTrustInfo(uri) {
      await options?.workspaceTrustBarrier?.p;
      if (options?.workspaceTrustError) {
        throw options.workspaceTrustError;
      }
      return { uri, trusted: options?.workspaceTrusted ?? true };
    }
  }());
  instantiationService.stub(IWorkbenchEnvironmentService, { isSessionsWindow: options?.isSessionsWindow ?? true });
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, { confirm: async () => ({ confirmed: options?.confirmDelete ?? true }) });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: (chatSessionType) => contributions.find((c) => c.type === chatSessionType),
    getAllChatSessionContributions: () => contributions,
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } })
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: options?.acquireOrLoadSession ?? (async () => void 0),
    sendRequest: options?.sendRequest ?? (async () => ({ kind: "sent", data: {} }))
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => options?.openSession ? new class extends mock() {
    }() : void 0
  });
  instantiationService.stub(ILanguageModelsService, {
    getLanguageModelIds: () => options?.languageModelIds ?? [],
    lookupLanguageModel: options?.lookupLanguageModel ?? (() => void 0),
    hasResolvedVendor: () => true,
    isModelHidden: (modelId) => options?.hiddenLanguageModelIds?.has(modelId) ?? false,
    onDidChangeLanguageModels: Event.None,
    onDidChangeModelVisibility: options?.languageModelVisibilityChanges ?? Event.None
  });
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(ILogService, new NullLogService());
  const storageService = options?.storageService ?? disposables.add(new InMemoryStorageService());
  instantiationService.stub(IStorageService, storageService);
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  instantiationService.stub(IAutomationStorageService, new TestAutomationStorageService(storageService));
  instantiationService.stub(IProgressService, {});
  instantiationService.stub(IGitHubService, options?.gitHubService ?? new class extends mock() {
    constructor() {
      super(...arguments);
      this.findPullRequestNumberByHeadBranch = async () => void 0;
    }
  }());
  instantiationService.stub(IPullRequestIconCache, instantiationService.createInstance(PullRequestIconCache));
  const activeSessionObs = options?.activeSession ?? constObservable(void 0);
  const visibleSessionsObs = options?.visibleSessions ?? constObservable([]);
  instantiationService.stub(ISessionsService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSession = activeSessionObs;
      this.visibleSessions = visibleSessionsObs;
    }
  }());
  instantiationService.stub(IAgentHostActiveClientService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.acquireScope = (sessionType, roots) => options?.activeClientScope?.(sessionType, roots) ?? {
        customizations: constObservable(options?.activeClient?.customizations ?? []),
        customAgents: options?.activeClientAgents ?? constObservable([]),
        tools: constObservable(options?.activeClient?.tools ?? []),
        isResolved: constObservable(true),
        whenResolved: () => Promise.resolve(),
        activeClient: (clientId) => constObservable({ clientId, ...options?.activeClient ?? { tools: [], customizations: [] } }),
        dispose: () => {
        }
      };
    }
  }());
  return disposables.add(instantiationService.createInstance(LocalAgentHostSessionsProvider));
}
function createTestLanguageModel(id) {
  return {
    extension: new ExtensionIdentifier("test.agentHost"),
    id,
    vendor: "agent-host-copilotcli",
    name: id,
    version: "1.0",
    family: id,
    maxInputTokens: 1,
    maxOutputTokens: 1,
    isDefaultForLocation: {}
  };
}
async function waitForSessionConfig(provider, sessionId, predicate) {
  if (predicate(provider.getSessionConfig(sessionId))) {
    return;
  }
  await new Promise((resolve) => {
    const disposable = provider.onDidChangeSessionConfig((changedSessionId) => {
      if (changedSessionId === sessionId && predicate(provider.getSessionConfig(sessionId))) {
        disposable.dispose();
        resolve();
      }
    });
  });
}
function fireSessionAdded(agentHost, rawId, opts) {
  const provider = opts?.provider ?? "copilotcli";
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionAdded,
    summary: {
      resource: sessionUri.toString(),
      provider,
      title: opts?.title ?? `Session ${rawId}`,
      status: ProtocolSessionStatus.Idle,
      createdAt: opts?.createdAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: opts?.modifiedAt ?? (/* @__PURE__ */ new Date()).toISOString(),
      project: opts?.project,
      workingDirectories: opts?.workingDirectory ? [opts.workingDirectory] : void 0,
      changes: opts?.changes,
      ...opts?.workspaceless ? { _meta: withSessionWorkspaceless(void 0, true) } : {}
    }
  });
}
function fireSessionMetaChanged(agentHost, rawId, meta, provider = "copilotcli") {
  agentHost.fireAction({
    channel: AgentSession.uri(provider, rawId).toString(),
    action: {
      type: ActionType.SessionMetaChanged,
      _meta: meta
    },
    serverSeq: 1,
    origin: void 0
  });
}
function fireSessionRemoved(agentHost, rawId, provider = "copilotcli") {
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionRemoved,
    session: sessionUri.toString()
  });
}
function fireSessionSummaryChanged(agentHost, rawId, changes, provider = "copilotcli") {
  const sessionUri = AgentSession.uri(provider, rawId);
  agentHost.fireNotification({
    channel: "ahp-root://",
    type: NotificationType.SessionSummaryChanged,
    session: sessionUri.toString(),
    changes
  });
}
async function persistCachedSessions(disposables, storageService, sessions) {
  const host = new MockAgentHostService();
  disposables.add(toDisposable(() => host.dispose()));
  for (const session of sessions) {
    host.addSession(session);
  }
  createProvider(disposables, host, void 0, { storageService });
  await timeout(0);
  await storageService.flush();
}
suite("LocalAgentHostSessionsProvider", () => {
  const disposables = new DisposableStore();
  let agentHost;
  setup(() => {
    agentHost = new MockAgentHostService();
    disposables.add(toDisposable(() => agentHost.dispose()));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("has correct id, label, and sessionType from rootState agents", () => {
    const provider = createProvider(disposables, agentHost);
    assert.strictEqual(provider.id, "local-agent-host");
    assert.ok(provider.label.length > 0);
    assert.strictEqual(provider.sessionTypes.length, 1);
    assert.strictEqual(provider.sessionTypes[0].id, "copilotcli");
    assert.strictEqual(provider.sessionTypes[0].label, "Copilot");
  });
  test("session types update when the local host advertises additional agents", () => {
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: "copilotcli", label: "Copilot" }
    ]);
    let changes = 0;
    disposables.add(provider.onDidChangeSessionTypes(() => changes++));
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] }
    ]);
    assert.strictEqual(changes, 1);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => ({ id: t.id, label: t.label })), [
      { id: "copilotcli", label: "Copilot" },
      { id: "openai", label: "OpenAI" }
    ]);
  });
  test("shares the root-state listener across session adapters", () => {
    agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: {} }]);
    const provider = createProvider(disposables, agentHost);
    const listenerCountBeforeSessions = agentHost.rootStateListenerCount;
    for (let i = 0; i < 200; i++) {
      fireSessionAdded(agentHost, `listener-${i}`);
    }
    const listenerCountAfterSessions = agentHost.rootStateListenerCount;
    agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }]);
    const supportsMultipleChatsAfterHydration = provider.getSessions()[0].capabilities.get().supportsMultipleChats;
    agentHost.setRootStateError();
    assert.deepStrictEqual({
      listenerCountBeforeSessions,
      listenerCountAfterSessions,
      sessionCount: provider.getSessions().length,
      supportsMultipleChatsAfterHydration,
      supportsMultipleChatsAfterError: provider.getSessions()[0].capabilities.get().supportsMultipleChats
    }, {
      listenerCountBeforeSessions: 1,
      listenerCountAfterSessions: 1,
      sessionCount: 200,
      supportsMultipleChatsAfterHydration: true,
      supportsMultipleChatsAfterError: false
    });
  });
  test("reports no session types before rootState hydrates", () => {
    agentHost.clearRootState();
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("rebinds session types when Agent Host starts with a new root subscription", () => {
    agentHost.clearRootState();
    const provider = createProvider(disposables, agentHost);
    let addedSessions = 0;
    disposables.add(provider.onDidChangeSessions((event) => addedSessions += event.added.length));
    agentHost.replaceRootStateOnStart([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] }
    ]);
    fireSessionAdded(agentHost, "after-rebind");
    assert.deepStrictEqual({
      sessionTypes: provider.sessionTypes.map((type) => ({ id: type.id, label: type.label })),
      rootStateListenerCount: agentHost.rootStateListenerCount,
      addedSessions
    }, {
      sessionTypes: [{ id: "copilotcli", label: "Copilot" }],
      rootStateListenerCount: 1,
      addedSessions: 1
    });
  });
  test("does not duplicate listeners when Agent Host starts after listeners bind", () => {
    const provider = createProvider(disposables, agentHost);
    let addedSessions = 0;
    disposables.add(provider.onDidChangeSessions((event) => addedSessions += event.added.length));
    agentHost.fireAgentHostStart();
    fireSessionAdded(agentHost, "after-start");
    assert.deepStrictEqual({
      rootStateListenerCount: agentHost.rootStateListenerCount,
      addedSessions
    }, {
      rootStateListenerCount: 1,
      addedSessions: 1
    });
  });
  test("reports no session types when rootState advertises no agents", () => {
    agentHost.setAgents([]);
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("reports no session types after rootState resolves to an error", () => {
    agentHost.clearRootState();
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes, []);
    agentHost.setRootStateError();
    assert.deepStrictEqual(provider.sessionTypes, []);
  });
  test("session type icons use per-agent codicons", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] },
      { provider: "openai", displayName: "OpenAI", description: "", models: [] },
      { provider: "unknown-agent", displayName: "Unknown", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(
      provider.sessionTypes.map((t) => ({ id: t.id, icon: t.icon.id })),
      [
        { id: "copilotcli", icon: "copilot" },
        { id: "claude", icon: "claude" },
        { id: "openai", icon: "openai" },
        { id: "unknown-agent", icon: "vm" }
      ]
    );
  });
  function fireConfigChange(configService, settingId) {
    configService.onDidChangeConfigurationEmitter.fire({
      source: ConfigurationTarget.USER,
      affectedKeys: /* @__PURE__ */ new Set([settingId]),
      change: { keys: [settingId], overrides: [] },
      affectsConfiguration: (key) => key === settingId
    });
  }
  test("recomputes protection for a selected non-default base branch when configuration changes", async () => {
    const configService = new TestConfigurationService();
    await configService.setUserConfiguration("git.branchProtection", []);
    agentHost.addSession(createSession("branch-protection", {
      summary: "Branch Protection",
      project: { uri: URI.file("/repo"), displayName: "repo" },
      workingDirectory: URI.file("/repo.worktrees/session")
    }));
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((candidate) => candidate.title.get() === "Branch Protection");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("branch-protection", "copilotcli", {
      provider: "copilotcli",
      title: "Branch Protection",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: withSessionGitState(void 0, { branchName: "agents/session", baseBranchName: "release" })
    });
    const repository = session.workspace.get()?.folders[0]?.gitRepository;
    const before = repository?.baseBranchProtected;
    await configService.setUserConfiguration("git.branchProtection", ["release"]);
    fireConfigChange(configService, "git.branchProtection");
    assert.deepStrictEqual({
      before,
      after: session.workspace.get()?.folders[0]?.gitRepository?.baseBranchProtected
    }, {
      before: false,
      after: true
    });
  });
  test("always advertises agent-host Claude", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli", "claude"]);
  });
  test("gates agent-host Codex in the Agents window on the provider enablement setting", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "codex", displayName: "Codex", description: "", models: [] }
    ]);
    const configService = new TestConfigurationService();
    configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, false);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService, isSessionsWindow: true });
    assert.deepStrictEqual(provider.sessionTypes.map((t) => t.id), ["copilotcli"]);
    let sessionTypesChanged = false;
    disposables.add(provider.onDidChangeSessionTypes(() => {
      sessionTypesChanged = true;
    }));
    configService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    fireConfigChange(configService, AgentHostCodexAgentEnabledSettingId);
    assert.deepStrictEqual({
      sessionTypesChanged,
      sessionTypes: provider.sessionTypes.map((t) => t.id)
    }, {
      sessionTypesChanged: true,
      sessionTypes: ["copilotcli", "codex"]
    });
  });
  test("getSessions includes agent-host Claude sessions", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    assert.deepStrictEqual(
      provider.getSessions().map((s) => s.sessionType).sort(),
      ["claude", "copilotcli"]
    );
  });
  test("session icons match the session type icon", () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] },
      { provider: "unknown-agent", displayName: "Unknown", description: "", models: [] }
    ]);
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "cli-sess", { title: "CLI", provider: "copilotcli" });
    fireSessionAdded(agentHost, "claude-sess", { title: "Claude", provider: "claude" });
    fireSessionAdded(agentHost, "unknown-sess", { title: "Unknown", provider: "unknown-agent" });
    assert.deepStrictEqual(
      provider.getSessions().map((s) => ({ sessionType: s.sessionType, icon: s.icon.id })).sort((a, b) => a.sessionType.localeCompare(b.sessionType)),
      [
        { sessionType: "claude", icon: "claude" },
        { sessionType: "copilotcli", icon: "copilot" },
        { sessionType: "unknown-agent", icon: "vm" }
      ]
    );
  });
  test("resolveWorkspace builds workspace from URI", () => {
    const provider = createProvider(disposables, agentHost);
    const uri = URI.parse("file:///home/user/project");
    const ws = provider.resolveWorkspace(uri);
    assert.ok(ws, "resolveWorkspace should resolve file:// URIs");
    assert.strictEqual(ws.label, "project");
    assert.strictEqual(ws.folders.length, 1);
    assert.strictEqual(ws.folders[0].root.toString(), uri.toString());
    assert.strictEqual(ws.requiresWorkspaceTrust, true);
  });
  test("has no browse actions", () => {
    const provider = createProvider(disposables, agentHost);
    assert.strictEqual(provider.browseActions.length, 0);
  });
  test("onDidChangeSessions fires when session added notification arrives", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionAdded(agentHost, "notif-1", { title: "Notif Session" });
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].added.length, 1);
    assert.strictEqual(changes[0].added[0].title.get(), "Notif Session");
  });
  test("session removed notification clears cache and metadata", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "to-remove", { title: "Removed" });
    const metadata = Reflect.get(provider, "_metaByRawId");
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(agentHost, "to-remove");
    assert.deepStrictEqual({
      removed: changes[0]?.removed.length,
      session: provider.getSessions().find((s) => s.title.get() === "Removed"),
      metadata: metadata.get("to-remove")
    }, {
      removed: 1,
      session: void 0,
      metadata: void 0
    });
  });
  test("identical session added notification is ignored", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const timestamp = (/* @__PURE__ */ new Date(0)).toISOString();
    fireSessionAdded(agentHost, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    fireSessionAdded(agentHost, "dup-sess", { title: "Dup", createdAt: timestamp, modifiedAt: timestamp });
    assert.strictEqual(changes.length, 1);
  });
  test("removing non-existent session is no-op", () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    fireSessionRemoved(agentHost, "does-not-exist");
    assert.strictEqual(changes.length, 0);
  });
  test("session added authoritatively updates a listed session in place", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const originalProject = URI.parse("file:///Users/me/project");
    const originalWorkingDirectory = URI.parse("file:///Users/me/project");
    agentHost.addSession(createSession("worktree-upsert", {
      summary: "Worktree Session",
      project: { uri: originalProject, displayName: "project" },
      workingDirectory: originalWorkingDirectory,
      modifiedTime: 1e3
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const originalWorkspace = session.workspace.get();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const worktreeProject = "file:///Users/me/project.worktrees/session";
    const worktreeWorkingDirectory = "file:///Users/me/project.worktrees/session/src";
    fireSessionAdded(agentHost, "worktree-upsert", {
      title: "Worktree Session",
      project: { uri: worktreeProject, displayName: "project-worktree" },
      workingDirectory: worktreeWorkingDirectory,
      createdAt: (/* @__PURE__ */ new Date(1e3)).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date(2e3)).toISOString()
    });
    fireSessionSummaryChanged(agentHost, "worktree-upsert", {
      _meta: { git: { branchName: "agents/worktree-session", baseBranchName: "main" } }
    });
    const current = provider.getSessions()[0];
    const currentWorkspace = current.workspace.get();
    assert.deepStrictEqual({
      sameAdapter: current === session,
      originalWorkingDirectory: originalWorkspace.folders[0].workingDirectory.toString(),
      workingDirectory: currentWorkspace.folders[0].workingDirectory.toString(),
      branchName: currentWorkspace.folders[0].gitRepository?.branchName,
      changedEvents: changes.map((change) => change.changed.map((changed) => changed === session))
    }, {
      sameAdapter: true,
      originalWorkingDirectory: originalWorkingDirectory.toString(),
      workingDirectory: worktreeWorkingDirectory,
      branchName: "agents/worktree-session",
      changedEvents: [[true], [true]]
    });
  }));
  test("session metadata changes notify when observable git fields change", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("git-meta", {
      summary: "Git Session",
      project: { uri: URI.parse("file:///Users/me/project"), displayName: "project" }
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const meta = {
      git: {
        branchName: "feature/worktree",
        baseBranchName: "main",
        hasGitHubRemote: true,
        upstreamBranchName: "origin/feature/worktree",
        incomingChanges: 2,
        outgoingChanges: 3,
        uncommittedChanges: 4
      }
    };
    fireSessionMetaChanged(agentHost, "git-meta", meta);
    fireSessionMetaChanged(agentHost, "git-meta", meta);
    const gitRepository = session.workspace.get().folders[0].gitRepository;
    assert.deepStrictEqual({
      branchName: gitRepository.branchName,
      uncommittedChanges: gitRepository.uncommittedChanges,
      changedEvents: changes.map((change) => change.changed.map((changed) => changed === session))
    }, {
      branchName: "feature/worktree",
      uncommittedChanges: 4,
      changedEvents: [[true]]
    });
  }));
  test("getSessions populates from listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("list-1", { summary: "First" }));
    agentHost.addSession(createSession("list-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    provider.getSessions();
    await timeout(0);
    assert.ok(changes.length > 0);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  }));
  test("eagerly populates and fires onDidChangeSessions after construction without a getSessions() call", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("eager-1", { summary: "First" }));
    agentHost.addSession(createSession("eager-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      removed: changes[0]?.removed.length,
      changed: changes[0]?.changed.length,
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      removed: 0,
      changed: 0,
      cachedTitles: ["First", "Second"]
    });
  }));
  test("defers eager session list fetch until authentication settles", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(changes.length, 0, "no event should fire while authentication is pending");
    assert.strictEqual(provider.getSessions().length, 0, "no sessions should be cached while authentication is pending");
    agentHost.addSession(createSession("after-auth-1", { summary: "First" }));
    agentHost.addSession(createSession("after-auth-2", { summary: "Second" }));
    agentHost.setAuthenticationPending(false);
    await timeout(0);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      cachedTitles: ["First", "Second"]
    });
  }));
  test("recovers an empty list when the initial listSessions fails, without needing a new session", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.failListSessionsCount = 1;
    agentHost.addSession(createSession("heal-1", { summary: "First" }));
    agentHost.addSession(createSession("heal-2", { summary: "Second" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(changes.length, 0, "no event should fire after a failed initial refresh");
    assert.strictEqual(provider.getSessions().length, 0, "cache stays empty after a failed initial refresh");
    await timeout(1100);
    assert.deepStrictEqual({
      eventCount: changes.length,
      added: changes[0]?.added.map((s) => s.title.get()).sort(),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      added: ["First", "Second"],
      cachedTitles: ["First", "Second"]
    });
  }));
  test("a session whose agent reports nothing survives the refresh", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
      { provider: "codex", displayName: "Codex", description: "", models: [] }
    ]);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    agentHost.addSession(createSession("codex-1", { provider: "codex", summary: "Codex One" }));
    agentHost.addSession(createSession("cli-1", { provider: "copilotcli", summary: "CLI One" }));
    const provider = createProvider(disposables, agentHost, void 0, { configurationService });
    await timeout(0);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.stopListingSessions("codex-1");
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "cli-1").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual({
      removed: changes.flatMap((c) => c.removed.map((s) => s.title.get())),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      removed: [],
      cachedTitles: ["CLI One", "Codex One"]
    });
  }));
  test("a session missing while its agent still reports others is evicted", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cli-gone", { provider: "copilotcli", summary: "Gone" }));
    agentHost.addSession(createSession("cli-kept", { provider: "copilotcli", summary: "Kept" }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.stopListingSessions("cli-gone");
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "cli-kept").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual({
      removed: changes.flatMap((c) => c.removed.map((s) => s.title.get())),
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      removed: ["Gone"],
      cachedTitles: ["Kept"]
    });
  }));
  test("a successful empty listSessions arms no retry", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    const callsAfterEagerLoad = agentHost.listSessionsCallCount;
    assert.strictEqual(callsAfterEagerLoad, 1, "exactly one eager listSessions call");
    await timeout(6e4);
    assert.strictEqual(agentHost.listSessionsCallCount, callsAfterEagerLoad, "no retry should be scheduled after a successful empty list");
    assert.strictEqual(changes.length, 0, "no change event for an empty list");
    assert.strictEqual(provider.getSessions().length, 0);
  }));
  test("retries with backoff until listSessions succeeds", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.failListSessionsCount = 2;
    agentHost.addSession(createSession("backoff-1", { summary: "Only" }));
    const provider = createProvider(disposables, agentHost);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    await timeout(0);
    assert.strictEqual(provider.getSessions().length, 0, "empty after first failure");
    await timeout(1100);
    assert.strictEqual(provider.getSessions().length, 0, "empty after second failure");
    await timeout(2200);
    assert.deepStrictEqual({
      eventCount: changes.length,
      cachedTitles: provider.getSessions().map((s) => s.title.get()).sort()
    }, {
      eventCount: 1,
      cachedTitles: ["Only"]
    });
  }));
  test("hydrates persisted sessions on startup before the live list is available", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("cached-1", { summary: "Cached One" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    assert.deepStrictEqual({
      listSessionsCalls: nextHost.listSessionsCallCount,
      cachedTitles: provider.getSessions().map((s) => s.title.get())
    }, {
      listSessionsCalls: 0,
      cachedTitles: ["Cached One"]
    });
  }));
  test("discards a legacy cache entry so read state is rebuilt from the host", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const LEGACY_KEY = "localAgentHost.cachedSessions";
    const CURRENT_KEY = "localAgentHost.cachedSessions.v2";
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("legacy-1", { summary: "Legacy One" })]);
    const snapshot = storageService.get(CURRENT_KEY, StorageScope.APPLICATION);
    assert.ok(snapshot, "precondition: current-key snapshot should exist");
    storageService.store(LEGACY_KEY, snapshot, StorageScope.APPLICATION, StorageTarget.USER);
    storageService.remove(CURRENT_KEY, StorageScope.APPLICATION);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    assert.deepStrictEqual({
      cachedSessions: provider.getSessions().length,
      legacyKeyPresent: storageService.get(LEGACY_KEY, StorageScope.APPLICATION) !== void 0
    }, {
      cachedSessions: 0,
      legacyKeyPresent: false
    });
  }));
  test("caches session-scoped flags but never transient activity bits", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [{
      ...createSession("busy-1", { summary: "Busy One" }),
      status: ProtocolSessionStatus.InProgress | ProtocolSessionStatus.IsArchived
    }]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const restored = provider.getSessions()[0];
    assert.deepStrictEqual({
      status: restored.status.get(),
      isArchived: restored.isArchived.get(),
      isRead: restored.isRead.get()
    }, {
      status: SessionStatus.Completed,
      isArchived: true,
      isRead: false
    });
  }));
  test("hydrated quick chat stays workspace-less after reload despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [
      createSession("quick-cached", {
        summary: "Quick Chat",
        workingDirectory: URI.file("/tmp/copilot-scratch/quick-cached"),
        quickChat: true
      })
    ]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "quick-cached");
    assert.deepStrictEqual({
      workspace: session?.workspace.get(),
      isQuickChat: session?.isQuickChat?.get()
    }, {
      workspace: void 0,
      isQuickChat: true
    });
  }));
  test("hydrated session preserves multi-root metadata after reload", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const multiRoot = {
      workspaceFile: "vscode-remote://ssh-remote+host/work/demo.code-workspace"
    };
    await persistCachedSessions(disposables, storageService, [
      createSession("multi-root-cached", { summary: "Multi Root", multiRoot })
    ]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const session = createProvider(disposables, nextHost, void 0, { storageService }).getSessions()[0];
    nextHost.fireAction({
      channel: AgentSession.uri("copilotcli", "multi-root-cached").toString(),
      action: { type: ActionType.SessionTitleChanged, title: "Updated after hydration" },
      serverSeq: 1,
      origin: void 0
    });
    await storageService.flush();
    const repersisted = JSON.parse(storageService.get("localAgentHost.cachedSessions.v2", StorageScope.APPLICATION));
    assert.deepStrictEqual({
      repersisted: repersisted[0].multiRoot,
      hydratedTitle: session.title.get()
    }, {
      repersisted: multiRoot,
      hydratedTitle: "Updated after hydration"
    });
  }));
  test("a refresh publishes _meta and summary fields as one atomic update", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("atomic-1", { summary: "One", workingDirectory: URI.file("/repo") }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const session = provider.getSessions()[0];
    const observed = [];
    disposables.add(autorun((reader) => {
      observed.push({
        branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
        isArchived: session.isArchived.read(reader)
      });
    }));
    agentHost.addSession({
      ...createSession("atomic-1", { summary: "One", workingDirectory: URI.file("/repo") }),
      status: ProtocolSessionStatus.Idle | ProtocolSessionStatus.IsArchived,
      _meta: withSessionGitState(void 0, { branchName: "feature" })
    });
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "atomic-1").toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.deepStrictEqual(observed, [
      { branch: void 0, isArchived: false },
      { branch: "feature", isArchived: true }
    ]);
  }));
  test("a summaryChanged notification publishes the change chip and _meta as one atomic update", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("atomic-2", { summary: "Two", workingDirectory: URI.file("/repo") }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const session = provider.getSessions()[0];
    const observed = [];
    disposables.add(autorun((reader) => {
      observed.push({
        branch: session.workspace.read(reader)?.folders[0]?.gitRepository?.branchName,
        files: session.changesSummary?.read(reader)?.files
      });
    }));
    fireSessionSummaryChanged(agentHost, "atomic-2", {
      changes: { additions: 3, deletions: 1, files: 2 },
      _meta: withSessionGitState(void 0, { branchName: "feature" })
    });
    await timeout(0);
    assert.deepStrictEqual(observed, [
      { branch: void 0, files: void 0 },
      { branch: "feature", files: 2 }
    ]);
  }));
  test("a summaryChanged delta clearing the adoptable marker opens the passive state subscription", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("adopt-sub", { summary: "Legacy", adoptable: true }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const session = provider.getSessions()[0];
    const lastStates = provider._lastSessionStates;
    const state = {
      provider: "copilotcli",
      title: "Legacy",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: []
    };
    agentHost.setSessionState("adopt-sub", "copilotcli", state);
    assert.strictEqual(lastStates.get(session.sessionId), void 0, "no passive subscription while adoptable");
    fireSessionSummaryChanged(agentHost, "adopt-sub", { _meta: void 0 });
    await timeout(0);
    assert.strictEqual(lastStates.get(session.sessionId), state, "subscription opens and applies the state once the marker clears");
  }));
  test("reconciles hydrated sessions against the authoritative list, pruning stale entries", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("stale-1", { summary: "Stale" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const beforeRefresh = provider.getSessions().map((s) => s.title.get());
    await timeout(0);
    const afterRefresh = provider.getSessions().map((s) => s.title.get());
    assert.deepStrictEqual({ beforeRefresh, afterRefresh }, { beforeRefresh: ["Stale"], afterRefresh: [] });
  }));
  test("hydrated sessions survive a failed initial listSessions", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    await persistCachedSessions(disposables, storageService, [createSession("resilient-1", { summary: "Resilient" })]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.failListSessionsCount = 1;
    nextHost.addSession(createSession("resilient-1", { summary: "Resilient" }));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    await timeout(0);
    const afterFailedList = provider.getSessions().map((s) => s.title.get());
    await timeout(1100);
    const afterRetry = provider.getSessions().map((s) => s.title.get());
    assert.deepStrictEqual({ afterFailedList, afterRetry }, { afterFailedList: ["Resilient"], afterRetry: ["Resilient"] });
  }));
  test("uses project metadata as workspace group source", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const projectUri = URI.file("/home/user/vscode");
    const workingDirectory = URI.file("/tmp/copilot-worktrees/vscode-feature");
    agentHost.addSession(createSession("project-1", {
      summary: "Project Session",
      project: { uri: projectUri, displayName: "vscode" },
      workingDirectory
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const workspace = provider.getSessions()[0].workspace.get();
    assert.deepStrictEqual({
      label: workspace?.label,
      repository: workspace?.folders[0]?.root.toString(),
      workingDirectory: workspace?.folders[0]?.workingDirectory?.toString()
    }, {
      label: "vscode",
      repository: projectUri.toString(),
      workingDirectory: workingDirectory.toString()
    });
  }));
  test("listed session with only workingDirectory (no project) shows folder name", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const workingDirectory = URI.file("/home/user/standalone-folder");
    agentHost.addSession(createSession("wd-only-1", {
      summary: "WD-only Session",
      workingDirectory
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const workspace = provider.getSessions()[0].workspace.get();
    assert.strictEqual(workspace?.label, "standalone-folder");
  }));
  test("session added notification does not carry model metadata", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "notif-model", { title: "Notif Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Notif Model Session");
    assert.strictEqual(session?.modelId.get(), void 0);
  });
  test("getModels returns only models targeting the session resource scheme", () => {
    const matchingModel = { ...createTestLanguageModel("matching"), targetChatSessionType: "agent-host-copilotcli" };
    const otherModel = { ...createTestLanguageModel("other"), targetChatSessionType: "agent-host-other" };
    const provider = createProvider(disposables, agentHost, void 0, {
      languageModelIds: ["matching", "other", "missing"],
      lookupLanguageModel: (id) => id === "matching" ? matchingModel : id === "other" ? otherModel : void 0
    });
    fireSessionAdded(agentHost, "model-catalog", { title: "Model Catalog Session" });
    const session = provider.getSessions().find((session2) => session2.title.get() === "Model Catalog Session");
    assert.ok(session);
    const snapshot = provider.getModelsSnapshot(session.sessionId);
    assert.deepStrictEqual({
      models: snapshot.models.map((model) => model.identifier),
      modelTarget: snapshot.modelTarget
    }, {
      models: ["matching"],
      modelTarget: "agent-host-copilotcli"
    });
  });
  test("getModelsSnapshot excludes hidden models and announces visibility changes", () => {
    const matchingModel = { ...createTestLanguageModel("matching"), targetChatSessionType: "agent-host-copilotcli" };
    const hiddenLanguageModelIds = /* @__PURE__ */ new Set(["matching"]);
    const visibilityChanges = disposables.add(new Emitter());
    const provider = createProvider(disposables, agentHost, void 0, {
      languageModelIds: ["matching"],
      lookupLanguageModel: (id) => id === "matching" ? matchingModel : void 0,
      hiddenLanguageModelIds,
      languageModelVisibilityChanges: visibilityChanges.event
    });
    fireSessionAdded(agentHost, "hidden-model-catalog", { title: "Hidden Model Catalog Session" });
    const session = provider.getSessions().find((session2) => session2.title.get() === "Hidden Model Catalog Session");
    assert.ok(session);
    let changes = 0;
    disposables.add(provider.onDidChangeModels(() => changes++));
    assert.deepStrictEqual(provider.getModelsSnapshot(session.sessionId).models, []);
    hiddenLanguageModelIds.delete("matching");
    visibilityChanges.fire();
    assert.strictEqual(changes, 1);
    assert.deepStrictEqual(provider.getModelsSnapshot(session.sessionId).models.map((model) => model.identifier), ["matching"]);
  });
  test("getModelsSnapshot canonicalizes a matching logical-session model identifier", () => {
    const modelId = "gpt-5.6-sol";
    const logicalIdentifier = `copilotcli/${modelId}`;
    const unrelatedIdentifier = `other/${modelId}`;
    const targetIdentifier = `agent-host-copilotcli:${modelId}`;
    const languageModelIds = [logicalIdentifier, unrelatedIdentifier];
    const languageModels = /* @__PURE__ */ new Map([
      [logicalIdentifier, { ...createTestLanguageModel(modelId), vendor: "copilotcli", targetChatSessionType: "copilotcli" }],
      [unrelatedIdentifier, { ...createTestLanguageModel(modelId), vendor: "other", targetChatSessionType: "other" }],
      [targetIdentifier, { ...createTestLanguageModel(modelId), targetChatSessionType: "agent-host-copilotcli" }]
    ]);
    const provider = createProvider(disposables, agentHost, void 0, {
      languageModelIds,
      lookupLanguageModel: (id) => languageModels.get(id)
    });
    fireSessionAdded(agentHost, "model-alias", { title: "Model Alias Session" });
    const session = provider.getSessions().find((session2) => session2.title.get() === "Model Alias Session");
    assert.ok(session);
    const pending = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;
    const unrelated = provider.getModelsSnapshot(session.sessionId, unrelatedIdentifier).desiredModelResolution;
    languageModelIds.push(targetIdentifier);
    const available = provider.getModelsSnapshot(session.sessionId, logicalIdentifier).desiredModelResolution;
    assert.deepStrictEqual({
      pending,
      unrelated,
      available: available.kind === "available" ? { kind: available.kind, identifier: available.model.identifier } : available
    }, {
      pending: { kind: "pending", identifier: targetIdentifier },
      unrelated: { kind: "unavailable", identifier: unrelatedIdentifier },
      available: { kind: "available", identifier: targetIdentifier }
    });
  });
  test("setModel updates existing session model and lets draft debounce persist it", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-model", { title: "Set Model Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:new-model");
    assert.strictEqual(session.modelId.get(), "agent-host-copilotcli:new-model");
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setModel updates cached selection for later message-level selection", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-model-config", { title: "Set Model Config Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Model Config Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:configured-model");
    assert.strictEqual(session.modelId.get(), "agent-host-copilotcli:configured-model");
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setAgent updates existing session agent and lets draft debounce persist it", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "set-agent", { title: "Set Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Set Agent Session");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://review", kind: "agent" });
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("setAgent with undefined clears the cached agent selection", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "clear-agent", { title: "Clear Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Clear Agent Session");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    provider.setAgent?.(session.sessionId, void 0);
    assert.strictEqual(session.mode.get(), void 0);
    assert.deepStrictEqual(agentHost.dispatchedActions, []);
  });
  test("restores the selected agent from the default chat draft on resume", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "resume-agent", { title: "Resume Agent Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Resume Agent Session");
    assert.ok(session);
    assert.strictEqual(session.mode.get(), void 0);
    provider.getSessionConfig(session.sessionId);
    const defaultChatUri = buildDefaultChatUri(AgentSession.uri("copilotcli", "resume-agent"));
    agentHost.setChatState(defaultChatUri, {
      resource: defaultChatUri,
      title: "Resume Agent Session",
      status: ProtocolSessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [],
      draft: { text: "", origin: { kind: MessageKind.User }, agent: { uri: "agent://resumed" } }
    });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://resumed", kind: "agent" });
  });
  test("does not override a live agent selection with the persisted draft agent", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "resume-nooverride", { title: "Resume No Override" });
    const session = provider.getSessions().find((s) => s.title.get() === "Resume No Override");
    assert.ok(session);
    provider.setAgent?.(session.sessionId, { uri: "agent://live", name: "live" });
    provider.getSessionConfig(session.sessionId);
    const defaultChatUri = buildDefaultChatUri(AgentSession.uri("copilotcli", "resume-nooverride"));
    agentHost.setChatState(defaultChatUri, {
      resource: defaultChatUri,
      title: "Resume No Override",
      status: ProtocolSessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      turns: [],
      draft: { text: "", origin: { kind: MessageKind.User }, agent: { uri: "agent://resumed" } }
    });
    assert.deepStrictEqual(session.mode.get(), { id: "agent://live", kind: "agent" });
  });
  test("rebases the selected agent to its worktree twin from the agent list before the working directory flips", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rebase-worktree", { title: "Rebase Worktree", workingDirectory: "file:///Users/me/vscode" });
    const session = provider.getSessions().find((s) => s.title.get() === "Rebase Worktree");
    assert.ok(session);
    const folderAgent = "file:///Users/me/vscode/.github/agents/sessions.md";
    const worktreeAgent = "file:///Users/me/vscode.worktrees/rebase-worktree/.github/agents/sessions.md";
    provider.setAgent?.(session.sessionId, { uri: folderAgent, name: "sessions" });
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("rebase-worktree", "copilotcli", {
      provider: "copilotcli",
      title: "Rebase Worktree",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://worktree",
        uri: "plugin://worktree",
        name: "worktree plugin",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: worktreeAgent, uri: worktreeAgent, name: "sessions" }]
      }]
    });
    assert.deepStrictEqual(session.mode.get(), { id: worktreeAgent, kind: "agent" });
  });
  test("leaves the selected agent untouched when the agent list has no relocated twin", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rebase-none", { title: "Rebase None", workingDirectory: "file:///Users/me/vscode" });
    const session = provider.getSessions().find((s) => s.title.get() === "Rebase None");
    assert.ok(session);
    const folderAgent = "file:///Users/me/vscode/.github/agents/sessions.md";
    provider.setAgent?.(session.sessionId, { uri: folderAgent, name: "sessions" });
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("rebase-none", "copilotcli", {
      provider: "copilotcli",
      title: "Rebase None",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://other",
        uri: "plugin://other",
        name: "other plugin",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md", uri: "file:///Users/me/vscode.worktrees/rebase-none/.github/agents/other.md", name: "other" }]
      }]
    });
    assert.deepStrictEqual(session.mode.get(), { id: folderAgent, kind: "agent" });
  });
  test("carries the picked custom agent onto the committed session when a new session graduates", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => {
        agentHost.addSession(createSession("graduated", { summary: "Graduated Session" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    provider.setAgent?.(session.sessionId, { uri: "agent://picked", name: "picked" });
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.deepStrictEqual(committed.mode.get(), { id: "agent://picked", kind: "agent" });
  });
  test("getCustomAgents collects agents from session customizations, coalesced by URI and sorted by name", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "agents-merge", { title: "Merge Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Merge Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Merge Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://session-1",
        uri: "plugin://session-1",
        name: "session plugin",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [
          { type: CustomizationType.Agent, id: "agent://shared", uri: "agent://shared", name: "shared", description: "from session" },
          { type: CustomizationType.Agent, id: "agent://session-only", uri: "agent://session-only", name: "session-only" }
        ]
      }, {
        type: CustomizationType.Plugin,
        id: "plugin://session-2",
        uri: "plugin://session-2",
        name: "second session plugin",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [
          { type: CustomizationType.Agent, id: "agent://another", uri: "agent://another", name: "another" },
          // Duplicate URI — must NOT replace the first-seen entry.
          { type: CustomizationType.Agent, id: "agent://shared-dup", uri: "agent://shared", name: "shared (duplicate)" }
        ]
      }, {
        // Disabled customizations are skipped entirely.
        type: CustomizationType.Plugin,
        id: "plugin://disabled",
        uri: "plugin://disabled",
        name: "disabled plugin",
        // TODO: Step 2 selects the persisted enablement scope.
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: false }],
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://disabled", uri: "agent://disabled", name: "disabled" }]
      }, {
        // Customizations with `children === undefined` are treated as
        // "unknown" (host not yet finished parsing) and skipped.
        type: CustomizationType.Plugin,
        id: "plugin://unparsed",
        uri: "plugin://unparsed",
        name: "unparsed plugin",
        load: { kind: CustomizationLoadStatus.Loading }
      }]
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("agents-merge", "copilotcli", fakeState);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://another", uri: "agent://another", name: "another" },
      { type: CustomizationType.Agent, id: "agent://session-only", uri: "agent://session-only", name: "session-only" },
      // First-seen wins for the duplicate `agent://shared` URI.
      { type: CustomizationType.Agent, id: "agent://shared", uri: "agent://shared", name: "shared", description: "from session" }
    ]);
  });
  test("getMcpServers dispatches MCP lifecycle requests", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "mcp-lifecycle", { title: "MCP Lifecycle" });
    const session = provider.getSessions().find((s) => s.title.get() === "MCP Lifecycle");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "MCP Lifecycle",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.McpServer,
        id: "mcp://docs",
        uri: "mcp://docs",
        name: "Docs",
        state: { kind: McpServerStatus.Stopped }
      }]
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("mcp-lifecycle", "copilotcli", fakeState);
    const servers = provider.getMcpServers(session.sessionId);
    assert.strictEqual(servers.length, 1);
    await servers[0].start();
    await servers[0].stop();
    const actions = agentHost.dispatchedActions.slice(-2);
    assert.deepStrictEqual(actions.map(({ action }) => action.type), [
      ActionType.SessionMcpServerStartRequested,
      ActionType.SessionMcpServerStopRequested
    ]);
    assert.deepStrictEqual(actions.map(({ action }) => action.id), ["mcp://docs", "mcp://docs"]);
  });
  test("getBackendChatResource looks up the host-supplied backend chat URI", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "chat-lookup", { title: "Chat Lookup" });
    fireSessionAdded(agentHost, "no-state", { title: "No State" });
    const session = provider.getSessions().find((s) => s.title.get() === "Chat Lookup");
    const unhydrated = provider.getSessions().find((s) => s.title.get() === "No State");
    assert.ok(session);
    assert.ok(unhydrated);
    const backendSession = AgentSession.uri("copilotcli", "backend-abc").toString();
    const defaultBackend = buildDefaultChatUri(backendSession);
    const peerBackend = buildChatUri(backendSession, "peer-1");
    const fakeState = {
      provider: "copilotcli",
      title: "Chat Lookup",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [
        { resource: defaultBackend, title: "Default", status: ProtocolSessionStatus.Idle, modifiedAt: "2025-01-01T00:00:00.000Z" },
        { resource: peerBackend, title: "Peer", status: ProtocolSessionStatus.Idle, modifiedAt: "2025-01-01T00:00:00.000Z" }
      ],
      defaultChat: defaultBackend
    };
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("chat-lookup", "copilotcli", fakeState);
    assert.deepStrictEqual({
      // Default chat (client resource has no fragment) resolves via `defaultChat`.
      defaultChat: provider.getBackendChatResource(session.resource)?.toString(),
      // Peer chat (client fragment) resolves via its `ChatSummary.resource`.
      peerChat: provider.getBackendChatResource(session.resource.with({ fragment: "peer-1" }))?.toString(),
      // A peer chat absent from hydrated state has no backend URI.
      missingPeer: provider.getBackendChatResource(session.resource.with({ fragment: "ghost" }))?.toString(),
      // A session whose state has not hydrated yields nothing.
      notHydrated: provider.getBackendChatResource(unhydrated.resource)
    }, {
      defaultChat: URI.parse(defaultBackend).toString(),
      peerChat: URI.parse(peerBackend).toString(),
      missingPeer: void 0,
      notHydrated: void 0
    });
  });
  test("getCustomAgents returns no agents when the session has no SessionState", () => {
    const provider = createProvider(disposables, agentHost);
    agentHost.setAgents([
      {
        provider: "copilotcli",
        displayName: "Copilot",
        description: "",
        models: [],
        customizations: [{
          type: CustomizationType.Plugin,
          id: "plugin://root",
          uri: "plugin://root",
          name: "root plugin"
        }]
      }
    ]);
    fireSessionAdded(agentHost, "root-only", { title: "Root Only" });
    const session = provider.getSessions().find((s) => s.title.get() === "Root Only");
    assert.ok(session);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), []);
  });
  test("new session exposes client custom agents before SessionState and updates the picker", () => {
    const activeClientAgents = observableValue("activeClientAgents", []);
    const provider = createProvider(disposables, agentHost, void 0, { activeClientAgents });
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), provider.sessionTypes[0].id);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => fired++));
    activeClientAgents.set([{
      type: CustomizationType.Agent,
      id: "inbox",
      uri: "file:///plugins/github-inbox/agents/inbox.agent.md",
      name: "Inbox"
    }], void 0);
    assert.deepStrictEqual({
      agents: provider.getCustomAgents(session.sessionId),
      fired
    }, {
      agents: [{
        type: CustomizationType.Agent,
        id: "inbox",
        uri: "file:///plugins/github-inbox/agents/inbox.agent.md",
        name: "Inbox"
      }],
      fired: 1
    });
  });
  test("onDidChangeCustomAgents fires on root state and session state changes", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "cust-events", { title: "Cust Events" });
    const session = provider.getSessions().find((s) => s.title.get() === "Cust Events");
    assert.ok(session);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    agentHost.setAgents([
      { provider: "copilotcli", displayName: "Copilot", description: "", models: [] }
    ]);
    const afterRoot = fired;
    assert.ok(afterRoot > 0, "expected event to fire when the agents reference is replaced");
    agentHost.fireNonAgentRootStateChange();
    assert.strictEqual(fired, afterRoot, "expected event NOT to fire on non-agent root deltas (preserved agents reference)");
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("cust-events", "copilotcli", {
      provider: "copilotcli",
      title: "Cust Events",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://s",
        uri: "plugin://s",
        name: "session plugin",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://s", uri: "agent://s", name: "s" }]
      }]
    });
    assert.ok(fired > afterRoot, "expected event to fire on session state customization change");
    const afterFirstCustomization = fired;
    agentHost.setSessionState("cust-events", "copilotcli", {
      provider: "copilotcli",
      title: "Cust Events Updated",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      // Same identity as before:
      customizations: provider._lastSessionStates.get(session.sessionId)?.customizations
    });
    assert.strictEqual(fired, afterFirstCustomization, "expected event NOT to fire when customizations are unchanged");
  });
  test("NewSession forwards SessionState into _lastSessionStates so the picker sees customizations before first message", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), sessionTypeId);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    const customizations = [{
      type: CustomizationType.Plugin,
      id: "plugin://new-session",
      uri: "plugin://new-session",
      name: "p",
      load: { kind: CustomizationLoadStatus.Loaded },
      children: [
        { type: CustomizationType.Agent, id: "agent://reviewer", uri: "agent://reviewer", name: "reviewer" },
        { type: CustomizationType.Agent, id: "agent://triage", uri: "agent://triage", name: "triage" }
      ]
    }];
    const state = {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations
    };
    agentHost.setSessionState(rawId, sessionTypeId, state);
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://reviewer", uri: "agent://reviewer", name: "reviewer" },
      { type: CustomizationType.Agent, id: "agent://triage", uri: "agent://triage", name: "triage" }
    ]);
    assert.ok(fired > 0, "expected onDidChangeCustomAgents to fire when SessionState arrives");
    const after = fired;
    agentHost.setSessionState(rawId, sessionTypeId, {
      ...state,
      customizations: [{
        ...customizations[0],
        children: [{ type: CustomizationType.Agent, id: "agent://only", uri: "agent://only", name: "only" }]
      }]
    });
    assert.deepStrictEqual(provider.getCustomAgents(session.sessionId), [
      { type: CustomizationType.Agent, id: "agent://only", uri: "agent://only", name: "only" }
    ]);
    assert.ok(fired > after, "expected onDidChangeCustomAgents to fire again on a second update");
  });
  test("NewSession publishes Agent Host git metadata before the first message", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), sessionTypeId);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    agentHost.setSessionState(rawId, sessionTypeId, {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [],
      _meta: {
        github: {
          owner: "partial-owner"
        },
        git: {
          hasGitHubRemote: true,
          githubOwner: "microsoft",
          githubRepo: "vscode",
          branchName: "main"
        }
      }
    });
    const gitRepository = session.workspace.get()?.folders[0]?.gitRepository;
    assert.deepStrictEqual({
      hasGitHubRemote: gitRepository?.hasGitHubRemote,
      branchName: gitRepository?.branchName,
      gitHubInfo: gitRepository?.gitHubInfo.get()
    }, {
      hasGitHubRemote: true,
      branchName: "main",
      gitHubInfo: {
        owner: "microsoft",
        repo: "vscode",
        pullRequests: void 0,
        pullRequest: void 0,
        issues: void 0
      }
    });
  });
  test("NewSession releases observed changeset subscriptions when inactive", async () => {
    const activeSession = observableValue("test.activeSession", void 0);
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const sessionTypeId = provider.sessionTypes[0].id;
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), sessionTypeId);
    await timeout(0);
    activeSession.set(new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = session.resource;
      }
    }(), void 0);
    disposables.add(autorun((reader) => {
      for (const changeset of session.changesets?.read(reader) ?? []) {
        changeset.changes.read(reader);
      }
    }));
    const backendUri = agentHost.createdSessionUris.at(-1);
    const changesetUri = `${backendUri}/changeset/uncommitted`;
    agentHost.setSessionState(AgentSession.id(backendUri), sessionTypeId, {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      changesets: [
        { label: "Uncommitted Changes", uriTemplate: changesetUri, changeKind: "uncommitted" }
      ]
    });
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(changesetUri), 1);
    activeSession.set(void 0, void 0);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(changesetUri), 1);
  });
  test("NewSession dispose clears _lastSessionStates entry and fires onDidChangeCustomAgents", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const rawId = first.resource.path.substring(1);
    agentHost.setSessionState(rawId, sessionTypeId, {
      provider: sessionTypeId,
      title: "",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "plugin://x",
        uri: "plugin://x",
        name: "p",
        load: { kind: CustomizationLoadStatus.Loaded },
        children: [{ type: CustomizationType.Agent, id: "agent://x", uri: "agent://x", name: "x" }]
      }]
    });
    assert.strictEqual(provider.getCustomAgents(first.sessionId).length, 1);
    let fired = 0;
    disposables.add(provider.onDidChangeCustomAgents(() => {
      fired++;
    }));
    provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    assert.deepStrictEqual(provider.getCustomAgents(first.sessionId), []);
    assert.ok(fired > 0, "expected onDidChangeCustomAgents to fire on NewSession dispose");
  });
  test("createNewSession returns session with correct fields", () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      providerId: session.providerId,
      status: session.status.get(),
      workspaceLabel: session.workspace.get()?.label,
      sessionType: session.sessionType,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      providerId: provider.id,
      status: SessionStatus.Untitled,
      workspaceLabel: "my-project",
      sessionType: provider.sessionTypes[0].id,
      config: { schema: { type: "object", properties: {} }, values: {} }
    });
  });
  test("startNewSessionRequest exposes session activity until disposed", () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/my-project"), provider.sessionTypes[0].id);
    const activity = "Fetching pull request...";
    const preparation = provider.startNewSessionRequest(session.sessionId, activity);
    const duringDescription = session.description.get();
    const during = duringDescription ? renderAsPlaintext(duringDescription) : void 0;
    preparation.dispose();
    assert.deepStrictEqual({
      status: session.status.get(),
      during,
      after: session.description.get()?.value
    }, {
      status: SessionStatus.InProgress,
      during: activity,
      after: void 0
    });
  });
  test("createNewSession forwards initial metadata to the agent host", async () => {
    const provider = createProvider(disposables, agentHost);
    provider.createNewSession(URI.parse("file:///home/user/my-project"), provider.sessionTypes[0].id, {
      metadata: { github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/42" } }
    });
    await timeout(0);
    assert.deepStrictEqual(agentHost.createSessionConfigs.at(-1)?.metadata, {
      github: { owner: "microsoft", repo: "vscode", pullRequestUrl: "https://github.com/microsoft/vscode/pull/42" }
    });
  });
  test("declares quick chat support", () => {
    const provider = createProvider(disposables, agentHost);
    assert.strictEqual(provider.supportsQuickChats, true);
  });
  test("createQuickChat returns a workspace-less untitled session", () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createQuickChat(provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      providerId: session.providerId,
      status: session.status.get(),
      workspace: session.workspace.get(),
      sessionType: session.sessionType,
      isQuickChat: session.isQuickChat?.get()
    }, {
      providerId: provider.id,
      status: SessionStatus.Untitled,
      workspace: void 0,
      sessionType: provider.sessionTypes[0].id,
      isQuickChat: true
    });
  });
  test("createQuickChat eagerly creates the backend session with no working directory (inferred workspace-less)", async () => {
    const provider = createProvider(disposables, agentHost);
    provider.createQuickChat(provider.sessionTypes[0].id);
    await timeout(0);
    const created = agentHost.createSessionConfigs.at(-1);
    assert.strictEqual(created?.workingDirectory, void 0);
  });
  test("createQuickChat throws when no agents are advertised", () => {
    agentHost.setAgents([]);
    const provider = createProvider(disposables, agentHost);
    assert.throws(() => provider.createQuickChat("copilotcli"));
  });
  test("derives automation provenance from the provider run ledger", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("automation-1", { summary: "Automation" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const changed = [];
    disposables.add(provider.onDidChangeSessions((event) => {
      if (event.changed.includes(session)) {
        changed.push(session.isAutomation?.get() ?? false);
      }
    }));
    const automation = await provider.automations.createAutomation({
      name: "Automation",
      prompt: "Run",
      schedule: { interval: "manual", scheduleHour: 0, scheduleMinute: 0, scheduleDay: 0 },
      target: { kind: "quickChat", providerId: provider.id, sessionTypeId: "copilotcli" }
    });
    const claim = await provider.automations.recordRunStart(automation.id, "manual", 1);
    await provider.automations.updateRun(claim.run.id, { sessionResource: session.resource });
    const marked = session.isAutomation?.get();
    await provider.automations.deleteRun(claim.run.id);
    assert.deepStrictEqual({
      marked,
      afterDelete: session.isAutomation?.get(),
      changed
    }, {
      marked: true,
      afterDelete: false,
      changed: [true, false]
    });
  }));
  test("restores a quick chat from listSessions as workspace-less despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-1", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-1"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    assert.deepStrictEqual({
      title: session?.title.get(),
      workspace: session?.workspace.get()
    }, {
      title: "Quick Chat",
      workspace: void 0
    });
  }));
  test("restored quick chat reports supportsMultipleChats === false", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-1", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-1"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    assert.deepStrictEqual(session?.capabilities.get(), { supportsMultipleChats: false, supportsFork: true, supportsSideChat: false, supportsRename: true, supportsDelete: true });
  }));
  test("restored quick chat collapses to a single chat even when state advertises peer chats", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-multi", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-multi"),
      quickChat: true
    }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    provider.getSessionConfig(session.sessionId);
    const sessionUri = AgentSession.uri("copilotcli", "quick-multi").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-multi", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [
        { resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() },
        { resource: buildChatUri(sessionUri, "peer-1"), title: "Peer One", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() },
        { resource: buildChatUri(sessionUri, "peer-2"), title: "Peer Two", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }
      ]
    });
    assert.deepStrictEqual({
      workspace: session.workspace.get(),
      supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
      chatFragments: session.chats.get().map((c) => c.resource.fragment),
      chatTitles: session.chats.get().map((c) => c.title.get())
    }, {
      workspace: void 0,
      supportsMultipleChats: false,
      chatFragments: [""],
      chatTitles: ["Quick Chat"]
    });
  }));
  test("promotes an untagged session to a quick chat once state reports it workspace-less, and persists the promotion", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    agentHost.addSession(createSession("quick-untagged", {
      summary: "Quick Chat",
      workingDirectory: URI.file("/home/user/.copilot/chats/quick-untagged")
    }));
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    const beforePromotion = { hasWorkspace: session.workspace.get() !== void 0, isQuickChat: session.isQuickChat?.get() };
    provider.getSessionConfig(session.sessionId);
    const sessionUri = AgentSession.uri("copilotcli", "quick-untagged").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-untagged", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [{ resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }]
    });
    await storageService.flush();
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.setAuthenticationPending(true);
    const hydrated = createProvider(disposables, nextHost, void 0, { storageService }).getSessions()[0];
    assert.deepStrictEqual({
      beforePromotion,
      afterPromotion: { workspace: session.workspace.get(), isQuickChat: session.isQuickChat?.get() },
      afterReload: { workspace: hydrated?.workspace.get(), isQuickChat: hydrated?.isQuickChat?.get() }
    }, {
      beforePromotion: { hasWorkspace: true, isQuickChat: false },
      afterPromotion: { workspace: void 0, isQuickChat: true },
      afterReload: { workspace: void 0, isQuickChat: true }
    });
  }));
  test("reports a kind-only promotion so the list regroups a session that never had a workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("quick-no-cwd", { summary: "Quick Chat" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    provider.getSessionConfig(session.sessionId);
    const changed = [];
    disposables.add(provider.onDidChangeSessions((e) => changed.push(...e.changed.map((s) => s.sessionId))));
    const sessionUri = AgentSession.uri("copilotcli", "quick-no-cwd").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    agentHost.setSessionState("quick-no-cwd", "copilotcli", {
      provider: "copilotcli",
      title: "Quick Chat",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      _meta: withSessionWorkspaceless(void 0, true),
      chats: [{ resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() }]
    });
    assert.deepStrictEqual({
      isQuickChat: session.isQuickChat?.get(),
      announced: changed.includes(session.sessionId)
    }, {
      isQuickChat: true,
      announced: true
    });
  }));
  test("listing reconcile promotes a cached adapter in place and announces the regroup", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const scratchDir = URI.file("/home/user/.copilot/chats/quick-poisoned");
    await persistCachedSessions(disposables, storageService, [
      createSession("quick-poisoned", { summary: "Quick Chat", workingDirectory: scratchDir })
    ]);
    const nextHost = new MockAgentHostService();
    disposables.add(toDisposable(() => nextHost.dispose()));
    nextHost.addSession(createSession("quick-poisoned", { summary: "Quick Chat", workingDirectory: scratchDir, quickChat: true }));
    const provider = createProvider(disposables, nextHost, void 0, { storageService });
    const hydrated = provider.getSessions()[0];
    const fromCache = { hasWorkspace: hydrated.workspace.get() !== void 0, isQuickChat: hydrated.isQuickChat?.get() };
    const changed = [];
    disposables.add(provider.onDidChangeSessions((e) => changed.push(...e.changed.map((s) => s.sessionId))));
    await timeout(0);
    assert.deepStrictEqual({
      fromCache,
      afterListing: { workspace: hydrated.workspace.get(), isQuickChat: hydrated.isQuickChat?.get() },
      announced: changed.includes(hydrated.sessionId),
      healedInPlace: provider.getSessions()[0] === hydrated
    }, {
      fromCache: { hasWorkspace: true, isQuickChat: false },
      afterListing: { workspace: void 0, isQuickChat: true },
      announced: true,
      healedInPlace: true
    });
  }));
  test("committed quick chat announced via sessionAdded stays workspace-less despite a scratch working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    fireSessionAdded(agentHost, "quick-committed", {
      title: "Quick Chat",
      workingDirectory: URI.file("/tmp/copilot-scratch/quick-committed").toString(),
      workspaceless: true
    });
    const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "quick-committed");
    assert.deepStrictEqual({
      workspace: session?.workspace.get(),
      isQuickChat: session?.isQuickChat?.get()
    }, {
      workspace: void 0,
      isQuickChat: true
    });
  }));
  test("createNewSession clears session config when resolving config is unavailable", async () => {
    agentHost.failResolveSessionConfig = true;
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config === void 0);
    assert.strictEqual(provider.getSessionConfig(session.sessionId), void 0);
  });
  test("createNewSession maps allowAll from chat.defaultConfiguration to autoApprove", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: { autoApprove: { type: "string", enum: ["default", "autoApprove"], title: "Auto-approve" } } },
      values: { autoApprove: "autoApprove" }
    };
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "autoApprove");
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      seededImmediately: "autoApprove",
      forwardedToAgentHost: "autoApprove"
    });
  });
  test("createNewSession seeds mode from chat.defaultConfiguration and forwards it to resolveSessionConfig", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.mode === "autopilot");
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.mode,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode
    }, {
      seededImmediately: "autopilot",
      forwardedToAgentHost: "autopilot"
    });
  });
  test("createNewSession forwards seeded config to eager createSession", async () => {
    const config = new TestConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { autoApprove: "autoApprove" }
    };
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.createSessionConfigs[0]?.config, { autoApprove: "autoApprove" });
  });
  test("createNewSession does not seed autoApprove when chat.defaultConfiguration approvals is manual", () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      initialValues: provider.getSessionConfig(session.sessionId)?.values,
      forwardedAutoApprove: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      initialValues: {},
      forwardedAutoApprove: void 0
    });
  });
  test("createNewSession clamps seeded autoApprove to default when policy disables global auto-approve", async () => {
    const config = createPolicyRestrictedConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values.autoApprove,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      seededImmediately: "default",
      forwardedToAgentHost: "default"
    });
  });
  test("setSessionConfigValue remembers portable string picks and drops non-remembered keys", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Branch]: "legacy-branch"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, () => !provider.isSessionConfigResolving(session.sessionId).get());
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, "folder");
    await provider.setSessionConfigValue(session.sessionId, "__proto__", "polluted");
    assert.deepStrictEqual(
      storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      { [SessionConfigKey.Isolation]: "folder" }
    );
  });
  test("draft config refresh stays local and send waits for the resolved values", async () => {
    let sendCalls = 0;
    let sentConfig;
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async (_resource, _message, options) => {
        sendCalls++;
        sentConfig = options?.agentHostSessionConfig;
        agentHost.addSession(createSession("config-resolved-send", { summary: "Config Resolved" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder" }
    };
    const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise();
    const configRefresh = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, "folder");
    const send = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    const pending = {
      loading: session.loading.get(),
      resolving: provider.isSessionConfigResolving(session.sessionId).get(),
      sendCalls
    };
    await barrier.complete();
    await configRefresh;
    const committed = await send;
    assert.deepStrictEqual({
      pending,
      resolved: {
        sendCalls,
        sentConfig,
        title: committed.title.get()
      }
    }, {
      pending: {
        loading: false,
        resolving: true,
        sendCalls: 0
      },
      resolved: {
        sendCalls: 1,
        sentConfig: { isolation: "folder" },
        title: "Config Resolved"
      }
    });
  });
  test("first send waits for trusted eager backend creation", async () => {
    const workspaceTrustBarrier = new DeferredPromise();
    let sendCalls = 0;
    let statusAtLoad;
    let wireOpsAtLoad;
    let wireOpsAtSend = [];
    const sessionRef = {};
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      workspaceTrustBarrier,
      acquireOrLoadSession: async () => {
        statusAtLoad = sessionRef.value?.status.get();
        wireOpsAtLoad = [...agentHost.wireOps];
        return void 0;
      },
      sendRequest: async () => {
        sendCalls++;
        wireOpsAtSend = [...agentHost.wireOps];
        agentHost.addSession(createSession("eager-created-send", { summary: "Eager Created" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    sessionRef.value = session;
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    const send = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await timeout(0);
    const pending = {
      sendCalls,
      statusAtLoad,
      wireOpsAtLoad,
      wireOps: [...agentHost.wireOps]
    };
    workspaceTrustBarrier.complete();
    const committed = await send;
    const backendKey = AgentSession.uri(provider.sessionTypes[0].id, session.resource.path.substring(1)).toString();
    assert.deepStrictEqual({
      pending,
      resolved: {
        sendCalls,
        statusAtLoad,
        wireOpsAtLoad: wireOpsAtLoad?.filter((op) => op.endsWith(backendKey)),
        wireOpsAtSend: wireOpsAtSend.filter((op) => op.endsWith(backendKey)),
        title: committed.title.get()
      }
    }, {
      pending: {
        sendCalls: 0,
        statusAtLoad: void 0,
        wireOpsAtLoad: void 0,
        wireOps: []
      },
      resolved: {
        sendCalls: 1,
        statusAtLoad: SessionStatus.InProgress,
        wireOpsAtLoad: [`createSession:${backendKey}`, `subscribe:${backendKey}`],
        wireOpsAtSend: [`createSession:${backendKey}`, `subscribe:${backendKey}`],
        title: "Eager Created"
      }
    });
  });
  test("first send falls back when eager workspace trust lookup fails", async () => {
    let sendCalls = 0;
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      workspaceTrustError: new Error("trust lookup failed"),
      sendRequest: async () => {
        sendCalls++;
        agentHost.addSession(createSession("trust-fallback-send", { summary: "Trust Fallback" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.deepStrictEqual({
      sendCalls,
      eagerCreateCalls: agentHost.createdSessionUris.length,
      title: committed.title.get()
    }, {
      sendCalls: 1,
      eagerCreateCalls: 0,
      title: "Trust Fallback"
    });
  });
  test("draft disposal cancels a send waiting for config resolution", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise();
    const configRefresh = provider.setSessionConfigValue(session.sessionId, SessionConfigKey.Isolation, "folder");
    const send = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await Promise.resolve();
    provider.deleteNewSession(session.sessionId);
    try {
      await assert.rejects(raceTimeout(send, 100), /Canceled/);
    } finally {
      await barrier.complete();
      await configRefresh;
    }
  });
  test("maps the existing isolation setter to agent-host config without remembering it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "main" }
    };
    await provider.setIsolationMode(session.sessionId, "workspace");
    assert.deepStrictEqual({
      supportsWorktreeConfiguration: provider.sessionTypes[0].supportsWorktreeConfiguration,
      requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map((request) => request.config),
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {})
    }, {
      supportsWorktreeConfiguration: true,
      requests: [
        { isolation: "folder" }
      ],
      remembered: {}
    });
  });
  test("maps the programmatic branch tracking setter to hidden agent-host config without remembering it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    const firstAutomationRequest = agentHost.resolveSessionConfigRequests.length;
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { [SessionConfigKey.WorktreeBranchTrack]: false }
    };
    await provider.setWorktreeBranchTrack(session.sessionId, false);
    assert.deepStrictEqual({
      requests: agentHost.resolveSessionConfigRequests.slice(firstAutomationRequest).map((request) => request.config),
      createSessionConfig: provider.getCreateSessionConfig(session.sessionId),
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {})
    }, {
      requests: [
        {
          [SessionConfigKey.Isolation]: "worktree",
          [SessionConfigKey.WorktreeBranchTrack]: false
        }
      ],
      createSessionConfig: { [SessionConfigKey.WorktreeBranchTrack]: false },
      remembered: {}
    });
  });
  test("applies programmatic worktree configuration in one resolve without waiting for the startup resolve", async () => {
    const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise();
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.WorktreeBranchTrack]: true,
        [SessionConfigKey.Branch]: "feature/pull-request"
      }
    };
    const setting = provider.setWorktreeConfiguration(session.sessionId, {
      isolationMode: "worktree",
      worktreeBranchTrack: true,
      branch: "feature/pull-request"
    });
    await timeout(0);
    const requestsBeforeResolve = agentHost.resolveSessionConfigRequests.map((request) => request.config);
    await barrier.complete();
    await setting;
    assert.deepStrictEqual({
      requestsBeforeResolve,
      config: provider.getCreateSessionConfig(session.sessionId)
    }, {
      requestsBeforeResolve: [
        {},
        {
          [SessionConfigKey.Isolation]: "worktree",
          [SessionConfigKey.WorktreeBranchTrack]: true,
          [SessionConfigKey.Branch]: "feature/pull-request"
        }
      ],
      config: {
        [SessionConfigKey.Isolation]: "worktree",
        [SessionConfigKey.WorktreeBranchTrack]: true,
        [SessionConfigKey.Branch]: "feature/pull-request"
      }
    });
  });
  test("rejects branch configuration when agent-host resolution fails", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    agentHost.failResolveSessionConfig = true;
    await assert.rejects(() => provider.setBranch(session.sessionId, "feature/automation"), /resolveSessionConfig unavailable/);
    assert.strictEqual(provider.getCreateSessionConfig(session.sessionId), void 0);
  });
  test("rejects isolation configuration when the final resolve changes the requested value", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "feature/automation" }
    };
    await assert.rejects(() => provider.setIsolationMode(session.sessionId, "worktree"), /did not apply session config 'isolation'/);
  });
  test("cancels repository configuration when the draft is disposed during initial resolve", async () => {
    const barrier = agentHost.resolveSessionConfigBarrier = new DeferredPromise();
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const setting = provider.setIsolationMode(session.sessionId, "worktree");
    await Promise.resolve();
    provider.deleteNewSession(session.sessionId);
    try {
      await assert.rejects(raceTimeout(setting, 100), /Canceled/);
    } finally {
      await barrier.complete();
    }
  });
  test("waits for authentication and startup config resolution before repository configuration", async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "worktree", branch: "feature/automation" }
    };
    const setting = provider.setBranch(session.sessionId, "feature/automation");
    await Promise.resolve();
    assert.strictEqual(agentHost.resolveSessionConfigRequests.length, 0);
    agentHost.setAuthenticationPending(false);
    await setting;
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.map((request) => request.config), [
      {},
      { isolation: "worktree", branch: "feature/automation" }
    ]);
  });
  test("setSessionConfigValue clamps autoApprove to default when policy disables global auto-approve", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    const config = createPolicyRestrictedConfigurationService();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, "autopilot");
    assert.deepStrictEqual({
      remembered: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      remembered: { [SessionConfigKey.AutoApprove]: "default" },
      forwardedToAgentHost: "default"
    });
  });
  test("branch selection stays on the current workspace and the next workspace resolves its own branch", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "worktree", branch: "main-a" }
    };
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    const sessionA = provider.createNewSession(URI.parse("file:///workspace-a"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, sessionA.sessionId, (config) => config?.values.branch === "main-a");
    await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Branch, "feature-a");
    const branchSelectionRequest = agentHost.resolveSessionConfigRequests.at(-1)?.config;
    await provider.setSessionConfigValue(sessionA.sessionId, SessionConfigKey.Isolation, "folder");
    provider.deleteNewSession(sessionA.sessionId);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", properties: {} },
      values: { isolation: "folder", branch: "current-b" }
    };
    const requestCountBeforeWorkspaceB = agentHost.resolveSessionConfigRequests.length;
    const sessionB = provider.createNewSession(URI.parse("file:///workspace-b"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, sessionB.sessionId, (config) => config?.values.branch === "current-b");
    assert.deepStrictEqual({
      branchSelectionRequest,
      rememberedValues: storageService.getObject(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, StorageScope.PROFILE, {}),
      workspaceBRequest: agentHost.resolveSessionConfigRequests[requestCountBeforeWorkspaceB]?.config,
      workspaceBResolved: provider.getSessionConfig(sessionB.sessionId)?.values
    }, {
      branchSelectionRequest: { isolation: "worktree", branch: "feature-a" },
      rememberedValues: { isolation: "folder" },
      workspaceBRequest: { isolation: "folder" },
      workspaceBResolved: { isolation: "folder", branch: "current-b" }
    });
  });
  test("caches resolved isolation/branch schema and seeds it into the next draft", async () => {
    agentHost.resolveSessionConfigResult = {
      schema: {
        type: "object",
        properties: {
          [SessionConfigKey.Isolation]: { title: "Isolation", type: "string", enum: ["folder", "worktree"], default: "worktree" },
          [SessionConfigKey.Branch]: { title: "Base Branch", type: "string", enum: ["main"] }
        }
      },
      values: { [SessionConfigKey.Isolation]: "worktree" }
    };
    const provider = createProvider(disposables, agentHost);
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.ok(first);
    agentHost.resolveSessionConfigResult = { schema: { type: "object", properties: {} }, values: {} };
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), provider.sessionTypes[0].id);
    const seededKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {}).sort();
    await timeout(0);
    const afterResolveKeys = Object.keys(provider.getSessionConfig(second.sessionId)?.schema.properties ?? {});
    const third = provider.createNewSession(URI.parse("file:///home/user/c"), provider.sessionTypes[0].id);
    const thirdSeededKeys = Object.keys(provider.getSessionConfig(third.sessionId)?.schema.properties ?? {});
    assert.deepStrictEqual({ seededKeys, afterResolveKeys, thirdSeededKeys }, {
      seededKeys: [SessionConfigKey.Branch, SessionConfigKey.Isolation],
      afterResolveKeys: [],
      thirdSeededKeys: []
    });
  });
  test("createNewSession forwards git.worktreeIncludeFiles as derived session config", () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.worktreeIncludeFiles", ["product.overrides.json", "**/node_modules/**"]);
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    assert.deepStrictEqual({
      seededImmediately: provider.getSessionConfig(session.sessionId)?.values,
      forwardedToAgentHost: agentHost.resolveSessionConfigRequests.at(-1)?.config
    }, {
      seededImmediately: { worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"] },
      forwardedToAgentHost: { worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"] }
    });
  });
  test("createNewSession gives remembered autoApprove precedence over a configured setting while policy still clamps", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const policyRestrictedConfig = createPolicyRestrictedConfigurationService();
    await policyRestrictedConfig.setUserConfiguration("chat.defaultConfiguration", { approvals: "allowAll" });
    const policyRestrictedProvider = createProvider(disposables, agentHost, void 0, { configurationService: policyRestrictedConfig, storageService });
    policyRestrictedProvider.createNewSession(URI.parse("file:///home/user/project"), policyRestrictedProvider.sessionTypes[0].id);
    const configuredDefaultConfig = new TestConfigurationService();
    await configuredDefaultConfig.setUserConfiguration("chat.defaultConfiguration", { approvals: "manual" });
    const configuredDefaultProvider = createProvider(disposables, agentHost, void 0, { configurationService: configuredDefaultConfig, storageService });
    configuredDefaultProvider.createNewSession(URI.parse("file:///home/user/project"), configuredDefaultProvider.sessionTypes[0].id);
    assert.deepStrictEqual({
      policyRestricted: agentHost.resolveSessionConfigRequests.at(-2)?.config?.autoApprove,
      configuredDefault: agentHost.resolveSessionConfigRequests.at(-1)?.config?.autoApprove
    }, {
      policyRestricted: "default",
      configuredDefault: "autoApprove"
    });
  });
  test("createNewSession migrates a remembered legacy autoApprove=autopilot to mode=autopilot", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.AutoApprove]: "autopilot"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "default"
    });
  });
  test("createNewSession drops an invalid remembered mode instead of forwarding it", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "bogus"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, { storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.strictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config?.mode, void 0);
  });
  test("createNewSession seeds remembered mode/approvals when chat.defaultConfiguration is at its schema default", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const provider = createProvider(disposables, agentHost, void 0, {
      configurationService: createSchemaDefaultConfigurationService(),
      storageService
    });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "plan",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession keeps remembered picks over an ordinary configured chat.defaultConfiguration setting", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const config = createSchemaDefaultConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "plan",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession uses configured chat.defaultConfiguration when there is no remembered pick", async () => {
    const config = createSchemaDefaultConfigurationService();
    await config.setUserConfiguration("chat.defaultConfiguration", { mode: "autopilot", approvals: "allowAll" });
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "autoApprove"
    });
  });
  test("createNewSession lets an enterprise policy chat.defaultConfiguration override remembered picks", async () => {
    const storageService = disposables.add(new InMemoryStorageService());
    storageService.store(STORAGE_KEY_REMEMBERED_SESSION_CONFIG_VALUES, JSON.stringify({
      [SessionConfigKey.Mode]: "plan",
      [SessionConfigKey.AutoApprove]: "autoApprove"
    }), StorageScope.PROFILE, StorageTarget.MACHINE);
    const config = new class extends TestConfigurationService {
      inspect(key) {
        const base = super.inspect(key);
        if (key === "chat.defaultConfiguration") {
          return { ...base, policyValue: { mode: "autopilot", approvals: "manual" } };
        }
        return base;
      }
    }();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: config, storageService });
    provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(agentHost.resolveSessionConfigRequests.at(-1)?.config, {
      mode: "autopilot",
      autoApprove: "default"
    });
  });
  test("getSessionByResource resolves current new session without listing it", () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    const resolved = provider.getSessionByResource(session.resource);
    assert.deepStrictEqual({
      listedSessions: provider.getSessions().length,
      resolvedResource: resolved?.resource.toString(),
      resolvedWorkspaceLabel: resolved?.workspace.get()?.label
    }, {
      listedSessions: 0,
      resolvedResource: session.resource.toString(),
      resolvedWorkspaceLabel: "my-project"
    });
  });
  test("joins the active client with customizations when opening an existing session", async () => {
    const activeSession = observableValue("activeSession", void 0);
    const activeClient = {
      tools: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "file:///customizations/test",
        uri: "file:///customizations/test",
        name: "Test Customization"
      }]
    };
    agentHost.addSession(createSession("active-client"));
    const provider = createProvider(disposables, agentHost, void 0, { activeSession, activeClient });
    provider.getSessions();
    await timeout(0);
    agentHost.dispatchedActions.length = 0;
    const resource = URI.from({ scheme: "agent-host-copilotcli", path: "/active-client" });
    activeSession.set({
      providerId: provider.id,
      sessionId: `${provider.id}:${resource.toString()}`,
      resource
    }, void 0);
    await timeout(0);
    assert.deepStrictEqual(agentHost.dispatchedActions.filter((dispatch) => dispatch.action.type === ActionType.SessionActiveClientSet), [{
      channel: AgentSession.uri("copilotcli", "active-client").toString(),
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: { clientId: "test-local-client", ...activeClient }
      },
      clientId: "test-local-client",
      clientSeq: 0
    }]);
  });
  test("does not publish empty customizations while resolving an unobserved active session scope", async () => {
    const activeSession = observableValue("activeSession", void 0);
    const resolution = new DeferredPromise();
    let scopeRequests = 0;
    let activeClientReads = 0;
    const activeClient = {
      tools: [],
      customizations: [{
        type: CustomizationType.Plugin,
        id: "file:///customizations/resolved",
        uri: "file:///customizations/resolved",
        name: "Resolved Customization",
        enablement: [{ kind: CustomizationEnablementKind.Global, enabled: true }]
      }]
    };
    const scope = {
      customizations: constObservable(activeClient.customizations),
      customAgents: constObservable([]),
      tools: constObservable(activeClient.tools),
      isResolved: constObservable(true),
      whenResolved: () => resolution.p,
      activeClient: (clientId) => {
        activeClientReads++;
        return constObservable({ clientId, ...activeClient });
      },
      dispose: () => {
      }
    };
    agentHost.addSession(createSession("delayed-active-client", {
      workingDirectory: URI.file("/home/user/delayed-active-client")
    }));
    const provider = createProvider(disposables, agentHost, void 0, {
      activeSession,
      activeClientScope: () => {
        scopeRequests++;
        return scope;
      }
    });
    provider.getSessions();
    await timeout(0);
    agentHost.dispatchedActions.length = 0;
    const resource = URI.from({ scheme: "agent-host-copilotcli", path: "/delayed-active-client" });
    activeSession.set({
      providerId: provider.id,
      sessionId: `${provider.id}:${resource.toString()}`,
      resource
    }, void 0);
    await timeout(0);
    assert.deepStrictEqual({
      scopeRequests,
      activeClientReads,
      actions: agentHost.dispatchedActions.filter((dispatch) => dispatch.action.type === ActionType.SessionActiveClientSet)
    }, {
      scopeRequests: 1,
      activeClientReads: 0,
      actions: []
    });
    resolution.complete();
    await timeout(0);
    assert.deepStrictEqual({
      scopeRequests,
      activeClientReads,
      actions: agentHost.dispatchedActions.filter((dispatch) => dispatch.action.type === ActionType.SessionActiveClientSet)
    }, {
      scopeRequests: 1,
      activeClientReads: 1,
      actions: [{
        channel: AgentSession.uri("copilotcli", "delayed-active-client").toString(),
        action: {
          type: ActionType.SessionActiveClientSet,
          activeClient: { clientId: "test-local-client", ...activeClient }
        },
        clientId: "test-local-client",
        clientSeq: 0
      }]
    });
  });
  test("createNewSession eagerly creates the backend session with the client-allocated URI", async () => {
    const provider = createProvider(disposables, agentHost);
    const workspaceUri = URI.parse("file:///home/user/my-project");
    const session = provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const expectedBackendUri = AgentSession.uri(provider.sessionTypes[0].id, rawId);
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [expectedBackendUri.toString()],
      "eager createSession should be invoked with the client-allocated URI"
    );
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(expectedBackendUri.toString()),
      1,
      "a state subscription should be held while the new session view is active"
    );
  });
  test("createNewSession does not eagerly create the backend session in an untrusted folder", async () => {
    const provider = createProvider(disposables, agentHost, void 0, { workspaceTrusted: false });
    const workspaceUri = URI.parse("file:///home/user/untrusted-project");
    provider.createNewSession(workspaceUri, provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [],
      "no eager createSession should be invoked for an untrusted folder"
    );
  });
  test("createNewSession disposes the previous eager backend session on workspace switch", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const firstRawId = first.resource.path.substring(1);
    const firstBackendUri = AgentSession.uri(sessionTypeId, firstRawId);
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    const secondRawId = second.resource.path.substring(1);
    const secondBackendUri = AgentSession.uri(sessionTypeId, secondRawId);
    assert.deepStrictEqual(
      agentHost.disposedSessions.map((u) => u.toString()),
      [firstBackendUri.toString()],
      "first backend session should be disposed when the workspace switches"
    );
    assert.deepStrictEqual(
      agentHost.createdSessionUris.map((u) => u.toString()),
      [firstBackendUri.toString(), secondBackendUri.toString()],
      "a fresh backend session should be created for the new workspace"
    );
  });
  test("eager createSession completes on the wire before getSubscription opens", async () => {
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
    const ops = agentHost.wireOps.filter((op) => op.endsWith(backendKey));
    assert.deepStrictEqual(
      ops,
      [`createSession:${backendKey}`, `subscribe:${backendKey}`],
      "createSession must complete before subscribe is issued"
    );
  });
  test("no subscription is opened if eager createSession fails", async () => {
    const provider = createProvider(disposables, agentHost);
    agentHost.onCreateSession = async () => {
      throw new Error("auth required");
    };
    const session = provider.createNewSession(URI.parse("file:///home/user/proj"), provider.sessionTypes[0].id);
    await timeout(0);
    const rawId = session.resource.path.substring(1);
    const backendKey = AgentSession.uri(provider.sessionTypes[0].id, rawId).toString();
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(backendKey),
      void 0,
      "no subscription should be opened when createSession rejects"
    );
  });
  test("workspace switch mid-createSession does not open a stale subscription", async () => {
    const provider = createProvider(disposables, agentHost);
    const sessionTypeId = provider.sessionTypes[0].id;
    const firstCreateGate = new DeferredPromise();
    agentHost.onCreateSession = () => firstCreateGate.p;
    const first = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    await timeout(0);
    const second = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    provider.deleteNewSession(first.sessionId);
    await timeout(0);
    firstCreateGate.complete();
    await timeout(0);
    const firstBackendKey = AgentSession.uri(sessionTypeId, first.resource.path.substring(1)).toString();
    const secondBackendKey = AgentSession.uri(sessionTypeId, second.resource.path.substring(1)).toString();
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(firstBackendKey),
      void 0,
      "no subscription should be opened for the abandoned first session"
    );
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(secondBackendKey),
      1,
      "second session should still get its eager subscription"
    );
  });
  test("deleteSession releases all cached provider state", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "del-sess", { title: "To Delete" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "To Delete");
    assert.ok(target);
    const state = {
      provider: "copilotcli",
      title: "To Delete",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: []
    };
    agentHost.setSessionState("del-sess", "copilotcli", state);
    provider.getSessionConfig(target.sessionId);
    const metadata = Reflect.get(provider, "_metaByRawId");
    const lastStates = Reflect.get(provider, "_lastSessionStates");
    const subscriptions = Reflect.get(provider, "_sessionStateSubscriptions");
    const idleTimers = Reflect.get(provider, "_sessionStateIdleTimers");
    assert.deepStrictEqual({
      metadata: metadata.has("del-sess"),
      state: lastStates.has(target.sessionId),
      subscription: subscriptions.has(target.sessionId),
      timer: idleTimers.has(target.sessionId)
    }, {
      metadata: true,
      state: true,
      subscription: true,
      timer: true
    });
    await provider.deleteSession(target.sessionId);
    assert.deepStrictEqual({
      disposedSessions: agentHost.disposedSessions.map((uri) => ({
        provider: AgentSession.provider(uri),
        id: AgentSession.id(uri)
      })),
      session: provider.getSessions().find((s) => s.title.get() === "To Delete"),
      metadata: metadata.get("del-sess"),
      state: lastStates.get(target.sessionId),
      subscription: subscriptions.has(target.sessionId),
      timer: idleTimers.has(target.sessionId),
      unsubscribeCount: agentHost.sessionUnsubscribeCounts.get(AgentSession.uri("copilotcli", "del-sess").toString())
    }, {
      disposedSessions: [{ provider: "copilotcli", id: "del-sess" }],
      session: void 0,
      metadata: void 0,
      state: void 0,
      subscription: false,
      timer: false,
      unsubscribeCount: 1
    });
  }));
  test("deleteSession does not remove a session twice when the host also notifies", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "delete-notified", { title: "Delete Notified" });
    const target = provider.getSessions().find((s) => s.title.get() === "Delete Notified");
    assert.ok(target);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.onDisposeSession = (session) => fireSessionRemoved(agentHost, AgentSession.id(session));
    await provider.deleteSession(target.sessionId);
    assert.deepStrictEqual({
      disposedSessions: agentHost.disposedSessions.length,
      removedEvents: changes.filter((change) => change.removed.length > 0).length,
      session: provider.getSessions().find((s) => s.title.get() === "Delete Notified")
    }, {
      disposedSessions: 1,
      removedEvents: 1,
      session: void 0
    });
  });
  test("deleteSessions disposes all sessions and removes them from cache", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "del-1", { title: "First" });
    fireSessionAdded(agentHost, "del-2", { title: "Second" });
    const first = provider.getSessions().find((s) => s.title.get() === "First");
    const second = provider.getSessions().find((s) => s.title.get() === "Second");
    assert.ok(first);
    assert.ok(second);
    await provider.deleteSessions([first.sessionId, second.sessionId]);
    assert.strictEqual(agentHost.disposedSessions.length, 2);
    assert.deepStrictEqual(agentHost.disposedSessions.map((uri) => AgentSession.id(uri)).sort(), ["del-1", "del-2"]);
    assert.strictEqual(provider.getSessions().find((s) => s.title.get() === "First"), void 0);
    assert.strictEqual(provider.getSessions().find((s) => s.title.get() === "Second"), void 0);
  });
  test("deleteSessions publishes successful removals before propagating a later failure", async () => {
    agentHost.addSession(createSession("delete-success", { summary: "Delete Success" }));
    agentHost.addSession(createSession("delete-failure", { summary: "Delete Failure" }));
    const provider = createProvider(disposables, agentHost);
    await timeout(0);
    const successful = provider.getSessions().find((s) => s.title.get() === "Delete Success");
    const failing = provider.getSessions().find((s) => s.title.get() === "Delete Failure");
    assert.ok(successful);
    assert.ok(failing);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.failDisposeSessionFor = "delete-failure";
    await assert.rejects(provider.deleteSessions([successful.sessionId, failing.sessionId]), /Failed to dispose delete-failure/);
    assert.deepStrictEqual({
      removed: changes.flatMap((change) => change.removed.map((session) => session.title.get())),
      successful: provider.getSessions().find((s) => s.title.get() === "Delete Success"),
      failing: provider.getSessions().find((s) => s.title.get() === "Delete Failure")?.title.get()
    }, {
      removed: ["Delete Success"],
      successful: void 0,
      failing: "Delete Failure"
    });
  });
  test("renameSession dispatches SessionTitleChanged on the session channel", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-sess", { title: "Old Title" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Old Title");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "New Title");
    assert.strictEqual(agentHost.dispatchedActions.length, 1);
    const dispatched = agentHost.dispatchedActions[0];
    assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
    assert.strictEqual(dispatched.action.title, "New Title");
    const actionSession = dispatched.channel.toString();
    assert.strictEqual(AgentSession.provider(actionSession), "copilotcli");
    assert.strictEqual(AgentSession.id(actionSession), "rename-sess");
    assert.strictEqual(dispatched.clientId, "test-local-client");
  });
  test("renameSession updates the session title optimistically", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-opt", { title: "Before" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Before");
    assert.ok(target);
    await provider.renameSession(target.sessionId, "After");
    assert.strictEqual(target.title.get(), "After");
  });
  test("renameChat on the default chat renames the chat tab, not the session", async () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "rename-default-chat", { title: "Session Title" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Session Title");
    assert.ok(target);
    await provider.renameChat(target.sessionId, target.mainChat.get().resource, "Chat Title");
    assert.strictEqual(target.title.get(), "Session Title");
    assert.strictEqual(target.mainChat.get().title.get(), "Chat Title");
    assert.strictEqual(agentHost.dispatchedActions.length, 1);
    const dispatched = agentHost.dispatchedActions[0];
    assert.strictEqual(dispatched.action.type, ActionType.SessionTitleChanged);
    assert.strictEqual(dispatched.channel.toString(), buildDefaultChatUri(AgentSession.uri("copilotcli", "rename-default-chat").toString()));
  });
  test("renameChat is no-op for unknown session", async () => {
    const provider = createProvider(disposables, agentHost);
    await provider.renameChat("nonexistent-id", URI.parse("test://nonexistent"), "Ignored");
    assert.strictEqual(agentHost.dispatchedActions.length, 0);
  });
  suite("multi-chat catalog", () => {
    function makeChatSummary(resource, title, status = ProtocolSessionStatus.Idle) {
      return { resource, title, status, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    }
    function makeState(chats, opts) {
      return {
        provider: "copilotcli",
        title: opts?.sessionTitle ?? "Session",
        status: ProtocolSessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        chats,
        ...opts?.defaultChat ? { defaultChat: opts.defaultChat } : {}
      };
    }
    function setupMultiChatSession(provider, rawId) {
      fireSessionAdded(agentHost, rawId, { title: "Session" });
      const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === rawId);
      assert.ok(session);
      provider.getSessionConfig(session.sessionId);
      return session;
    }
    test("default + peer catalog surfaces both chats with the default as mainChat", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-1");
      const sessionUri = AgentSession.uri("copilotcli", "multi-1").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-1", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      assert.deepStrictEqual({
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment),
        mainIsDefault: session.mainChat.get() === session.chats.get()[0],
        peerTitle: session.chats.get()[1].title.get()
      }, {
        supportsMultipleChats: true,
        chatFragments: ["", "peer-1"],
        mainIsDefault: true,
        peerTitle: "Peer"
      });
    });
    test("equivalent chat catalogs do not notify chat observers", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-stable");
      const sessionUri = AgentSession.uri("copilotcli", "multi-stable").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      const makeCatalog = () => makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat });
      agentHost.setSessionState("multi-stable", "copilotcli", makeCatalog());
      let updateCount = 0;
      disposables.add(autorun((reader) => {
        session.chats.read(reader);
        updateCount++;
      }));
      agentHost.setSessionState("multi-stable", "copilotcli", makeCatalog());
      assert.strictEqual(updateCount, 1);
    });
    test("equivalent peer chat values do not notify observers", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-values");
      const sessionUri = AgentSession.uri("copilotcli", "multi-values").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      const makeCatalog = () => makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(peerChat, "Peer"), activity: "Working" }
      ], { defaultChat });
      agentHost.setSessionState("multi-values", "copilotcli", makeCatalog());
      const peer = session.chats.get()[1];
      let updateCount = 0;
      disposables.add(autorun((reader) => {
        peer.updatedAt.read(reader);
        peer.description.read(reader);
        peer.lastTurnEnd.read(reader);
        updateCount++;
      }));
      agentHost.setSessionState("multi-values", "copilotcli", makeCatalog());
      assert.strictEqual(updateCount, 1);
    });
    test("peer chats map protocol interactivity to the provider-agnostic tri-state", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-ro");
      const sessionUri = AgentSession.uri("copilotcli", "multi-ro").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const readOnlyPeer = buildChatUri(sessionUri, "peer-ro");
      const hiddenPeer = buildChatUri(sessionUri, "peer-hidden");
      agentHost.setSessionState("multi-ro", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(readOnlyPeer, "Worker"), interactivity: ProtocolChatInteractivity.ReadOnly },
        { ...makeChatSummary(hiddenPeer, "Hidden Worker"), interactivity: ProtocolChatInteractivity.Hidden }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual(chats.map((c) => c.interactivity.get()), [
        ChatInteractivity.Full,
        ChatInteractivity.ReadOnly,
        ChatInteractivity.Hidden
      ]);
    });
    test("subagent (tool-origin) chats surface as read-only peers", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-sub");
      const sessionUri = AgentSession.uri("copilotcli", "multi-sub").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const subagentChat = buildSubagentChatUri(sessionUri, "tc-1");
      agentHost.setSessionState("multi-sub", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(subagentChat, "Code Reviewer"), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: "tc-1" }, interactivity: ProtocolChatInteractivity.ReadOnly }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual({
        titles: chats.map((c) => c.title.get()),
        interactivity: chats.map((c) => c.interactivity.get()),
        subagentOrigin: chats[1]?.origin?.kind,
        // The subagent records its parent chat (the default chat) so the
        // "Agents" row can list it under the chat that spawned it.
        subagentParentIsMain: !!chats[1]?.origin?.parentChat && isEqual(chats[1].origin.parentChat, chats[0].resource),
        // A subagent worker chat is neither renameable nor deletable.
        subagentCapabilities: getChatCapabilities(chats[1], session, void 0)
      }, {
        titles: ["Session", "Code Reviewer"],
        interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly],
        subagentOrigin: ChatOriginKind.Tool,
        subagentParentIsMain: true,
        subagentCapabilities: { canRename: false, canDelete: false }
      });
    });
    test("the main chat is renameable but never deletable via capabilities", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "main-caps");
      const sessionUri = AgentSession.uri("copilotcli", "main-caps").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("main-caps", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        { ...makeChatSummary(peerChat, "Peer"), origin: { kind: ProtocolChatOriginKind.User } }
      ], { defaultChat }));
      const chats = session.chats.get();
      assert.deepStrictEqual({
        // The main (default) chat: renameable, never deletable.
        main: getChatCapabilities(chats[0], session, void 0),
        // A regular user peer chat: fully manageable.
        peer: getChatCapabilities(chats[1], session, void 0)
      }, {
        main: { canRename: true, canDelete: false },
        peer: { canRename: true, canDelete: true }
      });
    });
    test("subagent chats surface as read-only peers even without multi-chat support, but user peers do not", () => {
      agentHost.setAgents([
        { provider: "copilotcli", displayName: "Copilot", description: "", models: [] },
        { provider: "claude", displayName: "Claude", description: "", models: [] }
      ]);
      const provider = createProvider(disposables, agentHost);
      fireSessionAdded(agentHost, "claude-sub", { title: "Claude", provider: "claude" });
      const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "claude-sub");
      assert.ok(session);
      provider.getSessionConfig(session.sessionId);
      const sessionUri = AgentSession.uri("claude", "claude-sub").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const subagentChat = buildSubagentChatUri(sessionUri, "tc-1");
      const userPeer = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("claude-sub", "claude", {
        provider: "claude",
        title: "Claude",
        status: ProtocolSessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        defaultChat,
        chats: [
          makeChatSummary(defaultChat, ""),
          { ...makeChatSummary(subagentChat, "Code Reviewer"), origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId: "tc-1" }, interactivity: ProtocolChatInteractivity.ReadOnly },
          { ...makeChatSummary(userPeer, "User Peer"), origin: { kind: ProtocolChatOriginKind.User } }
        ]
      });
      const chats = session.chats.get();
      assert.deepStrictEqual({
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        titles: chats.map((c) => c.title.get()),
        interactivity: chats.map((c) => c.interactivity.get())
      }, {
        supportsMultipleChats: false,
        // The user peer is not surfaced (no multi-chat support); the subagent is.
        titles: ["Claude", "Code Reviewer"],
        interactivity: [ChatInteractivity.Full, ChatInteractivity.ReadOnly]
      });
    });
    test("a new peer chat is presented as Untitled until its first request is sent", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-new");
      const sessionUri = AgentSession.uri("copilotcli", "multi-new").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      session.markChatAsNew("peer-1");
      agentHost.setSessionState("multi-new", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = () => session.chats.get().find((c) => c.resource.fragment === "peer-1");
      const whileNew = peer().status.get();
      session.markChatAsSent("peer-1");
      const afterSent = peer().status.get();
      assert.deepStrictEqual({ whileNew, afterSent }, {
        whileNew: SessionStatus.Untitled,
        afterSent: SessionStatus.Completed
      });
    });
    test("a peer catalog collapsed while capabilities were absent re-expands when they hydrate", () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: {} }]);
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-late-caps");
      const sessionUri = AgentSession.uri("copilotcli", "multi-late-caps").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-late-caps", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const collapsed = {
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment)
      };
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true } } }]);
      const hydrated = {
        supportsMultipleChats: session.capabilities.get().supportsMultipleChats,
        chatFragments: session.chats.get().map((c) => c.resource.fragment)
      };
      assert.deepStrictEqual({ collapsed, hydrated }, {
        collapsed: { supportsMultipleChats: false, chatFragments: [""] },
        hydrated: { supportsMultipleChats: true, chatFragments: ["", "peer-1"] }
      });
    });
    test("forkChat forwards the source chat and turn to the host and surfaces a new peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-fork");
      const sessionUri = AgentSession.uri("copilotcli", "multi-fork").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-fork", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      const forked = await provider.forkChat(session.sessionId, session.resource, "turn-1");
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        forkSource: call?.options?.fork?.source.toString(),
        forkTurnId: call?.options?.fork?.turnId,
        forkedIsPeer: !!forked.resource.fragment,
        forkedInCatalog: session.chats.get().some((c) => c.resource.toString() === forked.resource.toString())
      }, {
        forkSource: defaultChat,
        forkTurnId: "turn-1",
        forkedIsPeer: true,
        forkedInCatalog: true
      });
    }));
    test("createSideChat forwards the source chat and turn to the host and surfaces a new peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } }]);
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-side-chat");
      const sessionUri = AgentSession.uri("copilotcli", "multi-side-chat").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-side-chat", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.strictEqual(session.capabilities.get().supportsSideChat, true);
      const selection = { text: "  selected text  " };
      const sideChat = await provider.createSideChat(session.sessionId, session.resource, "turn-1", selection);
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        sideChatSource: call?.options?.sideChat?.source.toString(),
        sideChatTurnId: call?.options?.sideChat?.turnId,
        sideChatSelection: call?.options?.sideChat?.selection,
        sideChatIsPeer: !!sideChat.resource.fragment,
        sideChatInCatalog: session.chats.get().some((c) => c.resource.toString() === sideChat.resource.toString())
      }, {
        sideChatSource: defaultChat,
        sideChatTurnId: "turn-1",
        sideChatSelection: selection,
        sideChatIsPeer: true,
        sideChatInCatalog: true
      });
    }));
    test("createSideChat inherits model and agent selection from the source peer chat", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      agentHost.setAgents([{ provider: "copilotcli", displayName: "Copilot", description: "", models: [], capabilities: { multipleChats: { fork: true, sideChat: true } } }]);
      const activeSession = observableValue("test.activeSession", void 0);
      const inputStates = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        activeSession,
        lookupLanguageModel: createTestLanguageModel,
        acquireOrLoadSession: async (resource) => {
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(state) {
              inputStates.push({ resource: resource.toString(), state });
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
            }
          };
        }
      });
      const session = setupMultiChatSession(provider, "multi-side-chat-peer-selection");
      const sessionUri = AgentSession.uri("copilotcli", "multi-side-chat-peer-selection").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-side-chat-peer-selection", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer) }, void 0);
      provider.setModel(session.sessionId, "agent-host-copilotcli:peer-model");
      provider.setAgent?.(session.sessionId, { uri: "agent://peer", name: "peer" });
      const sideChat = await provider.createSideChat(session.sessionId, peer.resource, "turn-1");
      const call = agentHost.createdChats.at(-1);
      assert.deepStrictEqual({
        sideChatSource: call?.options?.sideChat?.source.toString(),
        createdModel: call?.options?.model,
        peerInputSelectedModels: inputStates.filter((entry) => entry.resource === sideChat.resource.toString()).map((entry) => entry.state.selectedModel?.identifier).filter((id) => id !== void 0),
        peerInputModes: inputStates.filter((entry) => entry.resource === sideChat.resource.toString()).map((entry) => entry.state.mode?.id).filter((id) => id !== void 0)
      }, {
        sideChatSource: peerChat,
        createdModel: { id: "peer-model" },
        peerInputSelectedModels: ["agent-host-copilotcli:peer-model"],
        peerInputModes: ["agent://peer"]
      });
    }));
    test("createSideChat rejects when the session capability is not advertised", async () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-side-chat-unsupported");
      await assert.rejects(() => provider.createSideChat(session.sessionId, session.resource, "turn-1"), /does not support side chats/);
    });
    test("createNewChat forwards the selected model to the host and seeds the chat input state", async () => {
      const inputStates = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        lookupLanguageModel: createTestLanguageModel,
        acquireOrLoadSession: async (resource) => {
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(state) {
              inputStates.push({ resource: resource.toString(), state });
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
            }
          };
        }
      });
      const session = setupMultiChatSession(provider, "multi-model");
      const sessionUri = AgentSession.uri("copilotcli", "multi-model").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-model", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      provider.setModel(session.sessionId, "agent-host-copilotcli:selected-model");
      const chat = await provider.createNewChat(session.sessionId);
      assert.deepStrictEqual({
        createdModel: agentHost.createdChats.at(-1)?.options?.model,
        peerInputSelectedModels: inputStates.filter((entry) => entry.resource === chat.resource.toString()).map((entry) => entry.state.selectedModel?.identifier).filter((id) => id !== void 0)
      }, {
        createdModel: { id: "selected-model" },
        peerInputSelectedModels: ["agent-host-copilotcli:selected-model"]
      });
    });
    test("sendRequest keeps a peer chat model loaded while dispatching", async () => {
      const loadedResources = /* @__PURE__ */ new Set();
      const disposedResources = [];
      const sendSawLoaded = [];
      const provider = createProvider(disposables, agentHost, void 0, {
        acquireOrLoadSession: async (resource) => {
          const resourceKey = resource.toString();
          loadedResources.add(resourceKey);
          const inputModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.state = constObservable(void 0);
            }
            setState(_state) {
            }
            clearState() {
            }
            toJSON() {
              return void 0;
            }
          }();
          const chatModel = new class extends mock() {
            constructor() {
              super(...arguments);
              this.inputModel = inputModel;
            }
          }();
          return {
            object: chatModel,
            dispose() {
              loadedResources.delete(resourceKey);
              disposedResources.push(resourceKey);
            }
          };
        },
        sendRequest: async (resource) => {
          sendSawLoaded.push(loadedResources.has(resource.toString()));
          return { kind: "sent", data: {} };
        }
      });
      const session = setupMultiChatSession(provider, "multi-send-peer");
      const sessionUri = AgentSession.uri("copilotcli", "multi-send-peer").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-send-peer", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.sendRequest(session.sessionId, peer.resource, { query: "hello" });
      assert.deepStrictEqual({
        sendSawLoaded,
        loadedResources: [...loadedResources],
        disposedResources
      }, {
        sendSawLoaded: [true],
        loadedResources: [],
        disposedResources: [peer.resource.toString()]
      });
    });
    test("setModel updates the active peer chat model without changing the default chat model", () => {
      const activeSession = observableValue("test.activeSession", void 0);
      const provider = createProvider(disposables, agentHost, void 0, { activeSession });
      const session = setupMultiChatSession(provider, "multi-active-model");
      const sessionUri = AgentSession.uri("copilotcli", "multi-active-model").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-active-model", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      activeSession.set({ sessionId: session.sessionId, activeChat: constObservable(peer) }, void 0);
      provider.setModel(session.sessionId, "agent-host-copilotcli:peer-model");
      assert.deepStrictEqual({
        defaultModelId: session.mainChat.get().modelId.get(),
        peerModelId: peer.modelId.get()
      }, {
        defaultModelId: void 0,
        peerModelId: "agent-host-copilotcli:peer-model"
      });
    });
    test("deleteChat prompts for confirmation and disposes the peer chat when confirmed", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost, void 0, { confirmDelete: true });
      const session = setupMultiChatSession(provider, "multi-del");
      const sessionUri = AgentSession.uri("copilotcli", "multi-del").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-del", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.deleteChat(session.sessionId, peer.resource);
      assert.deepStrictEqual(agentHost.disposedChats.map((u) => u.toString()), [peerChat]);
    }));
    test("deleteChat does not dispose the peer chat when the confirmation is cancelled", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
      const provider = createProvider(disposables, agentHost, void 0, { confirmDelete: false });
      const session = setupMultiChatSession(provider, "multi-del-cancel");
      const sessionUri = AgentSession.uri("copilotcli", "multi-del-cancel").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-del-cancel", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const peer = session.chats.get().find((c) => c.resource.fragment === "peer-1");
      assert.ok(peer);
      await provider.deleteChat(session.sessionId, peer.resource);
      assert.deepStrictEqual(agentHost.disposedChats, []);
    }));
    test("single-chat catalog degrades to the default chat only", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-single");
      const sessionUri = AgentSession.uri("copilotcli", "multi-single").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      agentHost.setSessionState("multi-single", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.deepStrictEqual({
        chatCount: session.chats.get().length,
        mainIsOnlyChat: session.mainChat.get() === session.chats.get()[0]
      }, {
        chatCount: 1,
        mainIsOnlyChat: true
      });
    });
    test("removing a peer from the catalog drops it back to the default chat", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-remove");
      const sessionUri = AgentSession.uri("copilotcli", "multi-remove").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-remove", "copilotcli", makeState([
        makeChatSummary(defaultChat, ""),
        makeChatSummary(peerChat, "Peer")
      ], { defaultChat }));
      const afterAdd = session.chats.get().length;
      agentHost.setSessionState("multi-remove", "copilotcli", makeState([
        makeChatSummary(defaultChat, "")
      ], { defaultChat }));
      assert.deepStrictEqual({
        afterAdd,
        afterRemove: session.chats.get().map((c) => c.resource.fragment)
      }, {
        afterAdd: 2,
        afterRemove: [""]
      });
    });
    test("default chat title diverges from the session title when renamed in the catalog", () => {
      const provider = createProvider(disposables, agentHost);
      const session = setupMultiChatSession(provider, "multi-title");
      const sessionUri = AgentSession.uri("copilotcli", "multi-title").toString();
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat = buildChatUri(sessionUri, "peer-1");
      agentHost.setSessionState("multi-title", "copilotcli", makeState([
        makeChatSummary(defaultChat, "Renamed Default"),
        makeChatSummary(peerChat, "Peer")
      ], { sessionTitle: "Session", defaultChat }));
      assert.deepStrictEqual({
        sessionTitle: session.title.get(),
        defaultChatTitle: session.mainChat.get().title.get()
      }, {
        sessionTitle: "Session",
        defaultChatTitle: "Renamed Default"
      });
    });
  });
  test("server-echoed SessionTitleChanged updates cached title", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "echo-sess", { title: "Original" });
    const sessions = provider.getSessions();
    const target = sessions.find((s) => s.title.get() === "Original");
    assert.ok(target);
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "echo-sess").toString(),
      action: {
        type: ActionType.SessionTitleChanged,
        title: "Server Title"
      },
      serverSeq: 1,
      origin: void 0
    });
    assert.strictEqual(target.title.get(), "Server Title");
    assert.strictEqual(changes.length, 1);
    assert.strictEqual(changes[0].changed.length, 1);
  });
  test("server-echoed ChatTurnStarted model does not update cached session model", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "model-change", { title: "Model Change" });
    const target = provider.getSessions().find((s) => s.title.get() === "Model Change");
    assert.ok(target);
    provider.setModel(target.sessionId, "agent-host-copilotcli:old-model");
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "model-change").toString(),
      action: {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "new-model" } }
      },
      serverSeq: 1,
      origin: void 0
    });
    assert.strictEqual(target.modelId.get(), "agent-host-copilotcli:old-model");
    assert.strictEqual(changes.length, 0);
  });
  test("turnComplete action triggers session refresh", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("turn-sess", { summary: "Before", modifiedTime: 1e3 }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    agentHost.addSession(createSession("turn-sess", { summary: "After", modifiedTime: 5e3 }));
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", "turn-sess").toString()),
      action: {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    assert.ok(changes.length > 0);
    const updatedSession = provider.getSessions().find((s) => s.title.get() === "After");
    assert.ok(updatedSession);
  }));
  test("session adapter has correct workspace from working directory", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("ws-sess", { summary: "WS Test", workingDirectory: URI.parse("file:///home/user/myrepo") }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const wsSession = sessions.find((s) => s.title.get() === "WS Test");
    assert.ok(wsSession);
    const workspace = wsSession.workspace.get();
    assert.ok(workspace);
    assert.strictEqual(workspace.label, "myrepo");
  }));
  test("session adapter without working directory has no workspace", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("no-ws-sess", { summary: "No WS" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions.find((s) => s.title.get() === "No WS");
    assert.ok(session);
    assert.strictEqual(session.workspace.get(), void 0);
  }));
  test("session adapter uses raw ID as fallback title", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("abcdef1234567890"));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const sessions = provider.getSessions();
    const session = sessions[0];
    assert.ok(session);
    assert.strictEqual(session.title.get(), "Session abcdef12");
  }));
  test("new session stays loading when required config is missing", async () => {
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
      values: {}
    };
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.schema.required?.includes("branch") === true);
    assert.strictEqual(session.loading.get(), true);
  });
  test("cached session loading reflects authenticationPending", async () => {
    agentHost.setAuthenticationPending(true);
    agentHost.addSession(createSession("cached-auth-loading", { summary: "Cached" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Cached");
    assert.ok(session);
    assert.strictEqual(session.loading.get(), true);
    agentHost.setAuthenticationPending(false);
    assert.strictEqual(session.loading.get(), false);
  });
  test("new session defers backend startup until authentication settles", async () => {
    agentHost.setAuthenticationPending(true);
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 0,
      resolveRequests: 0,
      config: { schema: { type: "object", properties: {} }, values: {} }
    });
    agentHost.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: false,
      createdSessions: 1,
      resolveRequests: 1,
      config: { schema: { type: "object", properties: {} }, values: { isolation: "worktree" } }
    });
  });
  test("new session stays loading after authentication settles when required config is missing", async () => {
    agentHost.setAuthenticationPending(true);
    agentHost.resolveSessionConfigResult = {
      schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
      values: {}
    };
    const provider = createProvider(disposables, agentHost);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await timeout(0);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 0,
      resolveRequests: 0,
      config: { schema: { type: "object", properties: {} }, values: {} }
    });
    agentHost.setAuthenticationPending(false);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.schema.required?.includes("branch") === true);
    assert.deepStrictEqual({
      loading: session.loading.get(),
      createdSessions: agentHost.createdSessionUris.length,
      resolveRequests: agentHost.resolveSessionConfigRequests.length,
      config: provider.getSessionConfig(session.sessionId)
    }, {
      loading: true,
      createdSessions: 1,
      resolveRequests: 1,
      config: {
        schema: { type: "object", required: ["branch"], properties: { branch: { type: "string", title: "Branch", enum: ["main"] } } },
        values: {}
      }
    });
  });
  test("sendRequest throws for unknown session", async () => {
    const provider = createProvider(disposables, agentHost);
    await assert.rejects(
      () => provider.sendRequest("nonexistent", URI.parse("untitled:chat"), { query: "test" }),
      /not found/
    );
  });
  test("sendRequest only commits a session of the same type, ignoring a foreign-type session that appears mid-send", async () => {
    const codexAndClaude = [
      { type: "agent-host-codex", name: "codex", displayName: "Codex", description: "test", icon: void 0 },
      { type: "agent-host-claude", name: "claude", displayName: "Claude", description: "test", icon: void 0 }
    ];
    agentHost.setAgents([
      { provider: "codex", displayName: "Codex", description: "", models: [] },
      { provider: "claude", displayName: "Claude", description: "", models: [] }
    ]);
    const configurationService = new TestConfigurationService();
    configurationService.setUserConfiguration(AgentHostCodexAgentEnabledSettingId, true);
    const provider = createProvider(disposables, agentHost, codexAndClaude, {
      openSession: true,
      configurationService,
      sendRequest: async () => {
        agentHost.addSession(createSession("foreign-claude", { provider: "claude", summary: "Foreign Claude" }));
        agentHost.addSession(createSession("real-codex", { provider: "codex", summary: "Real Codex" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), "codex");
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    assert.strictEqual(committed.resource.scheme, "agent-host-codex", `expected the committed session to be the codex session, got ${committed.resource.toString()}`);
  });
  test("sendRequest waits beyond 30 seconds for the backend session to commit", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const request = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await timeout(0);
    await timeout(30001);
    agentHost.addSession(createSession(session.sessionId, { summary: "Committed Late" }));
    agentHost.fireAction({
      channel: buildDefaultChatUri(AgentSession.uri("copilotcli", session.sessionId).toString()),
      action: { type: ActionType.ChatTurnComplete },
      serverSeq: 1,
      origin: void 0
    });
    await timeout(0);
    const committed = await request;
    assert.strictEqual(committed.title.get(), "Committed Late");
  }));
  test("sendRequest does not advertise a cached committed session alongside its draft", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async (resource) => {
        const rawId = AgentSession.id(resource);
        agentHost.addSession(createSession(rawId, { summary: "Committed Session" }));
        fireSessionAdded(agentHost, rawId, { title: "Committed Session" });
        return { kind: "sent", data: {} };
      }
    });
    await timeout(0);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const draftAdvertised = new DeferredPromise();
    disposables.add(provider.onDidChangeSessions((e) => {
      if (e.added.includes(session)) {
        draftAdvertised.complete();
      }
    }));
    agentHost.listSessionsBarrier = new DeferredPromise();
    const request = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await draftAdvertised.p;
    const advertised = provider.getSessions().filter((candidate) => isEqual(candidate.resource, session.resource));
    agentHost.listSessionsBarrier.complete();
    await request;
    assert.deepStrictEqual({
      count: advertised.length,
      isDraft: advertised[0] === session,
      resources: advertised.map((candidate) => candidate.resource.toString())
    }, {
      count: 1,
      isDraft: true,
      resources: [session.resource.toString()]
    });
  });
  test("sessionAdded does not advertise a committed session alongside its pending draft", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    await timeout(0);
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const draftAdvertised = new DeferredPromise();
    disposables.add(provider.onDidChangeSessions((e) => {
      if (e.added.includes(session)) {
        draftAdvertised.complete();
      }
    }));
    agentHost.listSessionsBarrier = new DeferredPromise();
    const request = provider.sendRequest(session.sessionId, chat.resource, { query: "hello" });
    await draftAdvertised.p;
    const rawId = AgentSession.id(session.resource);
    agentHost.addSession(createSession(rawId, { summary: "Committed Session" }));
    fireSessionAdded(agentHost, rawId, { title: "Committed Session" });
    const advertised = provider.getSessions().filter((candidate) => isEqual(candidate.resource, session.resource));
    agentHost.listSessionsBarrier.complete();
    await request;
    assert.deepStrictEqual({
      count: advertised.length,
      isDraft: advertised[0] === session,
      resources: advertised.map((candidate) => candidate.resource.toString())
    }, {
      count: 1,
      isDraft: true,
      resources: [session.resource.toString()]
    });
  });
  test("sendRequest rejects when the provisional session is abandoned before commit", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    const chat = await provider.createNewChat(session.sessionId);
    const rejection = assert.rejects(
      provider.sendRequest(session.sessionId, chat.resource, { query: "hello" }),
      /session was not committed/
    );
    await timeout(0);
    provider.deleteNewSession(session.sessionId);
    await rejection;
    assert.deepStrictEqual(changes.map((change) => ({
      added: change.added.map((session2) => session2.resource.toString()),
      removed: change.removed.map((session2) => session2.resource.toString())
    })), [
      { added: [session.resource.toString()], removed: [] },
      { added: [], removed: [session.resource.toString()] }
    ]);
  });
  test("two concurrent same-type new-session sends each commit to their own session (no swap during a shared download window)", async () => {
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async () => ({ kind: "sent", data: {} })
    });
    const sessionTypeId = provider.sessionTypes[0].id;
    const sessionA = provider.createNewSession(URI.parse("file:///home/user/a"), sessionTypeId);
    const chatA = await provider.createNewChat(sessionA.sessionId);
    const ownA = AgentSession.id(chatA.resource.toString());
    const sessionB = provider.createNewSession(URI.parse("file:///home/user/b"), sessionTypeId);
    const chatB = await provider.createNewChat(sessionB.sessionId);
    const ownB = AgentSession.id(chatB.resource.toString());
    const sendA = provider.sendRequest(sessionA.sessionId, chatA.resource, { query: "A" });
    const sendB = provider.sendRequest(sessionB.sessionId, chatB.resource, { query: "B" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireSessionAdded(agentHost, ownB, { title: "B" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    fireSessionAdded(agentHost, ownA, { title: "A" });
    const [committedA, committedB] = await Promise.all([sendA, sendB]);
    assert.deepStrictEqual(
      { a: AgentSession.id(committedA.resource.toString()), b: AgentSession.id(committedB.resource.toString()) },
      { a: ownA, b: ownB }
    );
  });
  test("sendRequest forwards resolved session config to chat service", async () => {
    const sendOptions = [];
    const provider = createProvider(disposables, agentHost, void 0, {
      openSession: true,
      sendRequest: async (_resource, _message, options) => {
        if (options) {
          sendOptions.push(options);
        }
        agentHost.addSession(createSession("created-from-send", { summary: "Created From Send" }));
        return { kind: "sent", data: {} };
      }
    });
    const session = provider.createNewSession(URI.parse("file:///home/user/project"), provider.sessionTypes[0].id);
    await waitForSessionConfig(provider, session.sessionId, (config) => config?.values.isolation === "worktree");
    const chat = await provider.createNewChat(session.sessionId);
    const committed = await provider.sendRequest(session.sessionId, chat.resource, { query: "hello", title: "Pull Request", hideFromTranscript: true });
    assert.deepStrictEqual({
      sendOptions: sendOptions.map((options) => ({
        agentHostSessionConfig: options.agentHostSessionConfig,
        hideFromTranscript: options.hideFromTranscript
      })),
      title: committed.title.get()
    }, {
      sendOptions: [{ agentHostSessionConfig: { isolation: "worktree" }, hideFromTranscript: true }],
      title: "Pull Request"
    });
  });
  test("sendRequest clears chat input draft while preserving selected model and agent", async () => {
    const inputStates = [];
    const languageModel = createTestLanguageModel("selected-model");
    const provider = createProvider(disposables, agentHost, void 0, {
      lookupLanguageModel: (modelId) => modelId === "agent-host-copilotcli:selected-model" ? languageModel : void 0,
      acquireOrLoadSession: async () => {
        const inputModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.state = constObservable(void 0);
          }
          setState(state) {
            inputStates.push(state);
          }
          clearState() {
          }
          toJSON() {
            return void 0;
          }
        }();
        const chatModel = new class extends mock() {
          constructor() {
            super(...arguments);
            this.inputModel = inputModel;
          }
        }();
        return {
          object: chatModel,
          dispose() {
          }
        };
      }
    });
    fireSessionAdded(agentHost, "send-draft", { title: "Send Draft Session" });
    const session = provider.getSessions().find((s) => s.title.get() === "Send Draft Session");
    assert.ok(session);
    provider.setModel(session.sessionId, "agent-host-copilotcli:selected-model");
    provider.setAgent?.(session.sessionId, { uri: "agent://review", name: "review" });
    agentHost.dispatchedActions.length = 0;
    inputStates.length = 0;
    await provider.sendRequest(session.sessionId, session.resource, { query: "hello" });
    assert.deepStrictEqual({
      protocolDraftActions: agentHost.dispatchedActions.filter((d) => d.action.type === ActionType.ChatDraftChanged).length,
      hasSelectedModelUpdate: inputStates.some((state) => state.selectedModel?.identifier === "agent-host-copilotcli:selected-model"),
      lastInputState: inputStates.at(-1)
    }, {
      protocolDraftActions: 0,
      hasSelectedModelUpdate: true,
      lastInputState: {
        mode: { id: "agent://review", kind: ChatModeKind.Agent },
        inputText: "",
        attachments: [],
        selections: []
      }
    });
  });
  test("getSessionConfig seeds running config from session state subscription with full schema", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-1", { summary: "Seeded Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Seeded Session");
    assert.ok(session);
    assert.strictEqual(provider.getSessionConfig(session.sessionId), void 0);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"], readOnly: true }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Seeded Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("seed-1", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    const seeded = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual({
      properties: Object.keys(seeded?.schema.properties ?? {}).sort(),
      values: seeded?.values
    }, {
      properties: ["autoApprove", "isolation"],
      values: { autoApprove: "default", isolation: "worktree" }
    });
  }));
  test("running config state seeding preserves already-resolved schema properties", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-schema", { summary: "Schema Preserve Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Schema Preserve Session");
    assert.ok(session);
    const fullState = {
      provider: "copilotcli",
      title: "Schema Preserve Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true },
            "codex.networkAccessEnabled": { type: "boolean", title: "Network", default: false, sessionMutable: true }
          }
        },
        values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
      }
    };
    agentHost.setSessionState("seed-schema", "copilotcli", fullState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.schema.properties["codex.networkAccessEnabled"] !== void 0);
    agentHost.setSessionState("seed-schema", "copilotcli", {
      ...fullState,
      config: {
        schema: {
          type: "object",
          properties: {
            "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true }
          }
        },
        values: { "codex.sandboxMode": "workspace-write" }
      }
    });
    assert.deepStrictEqual({
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      properties: ["codex.networkAccessEnabled", "codex.sandboxMode"],
      values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
    });
  }));
  test("removing a session disposes its session-state subscription", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("seed-2", { summary: "Sub Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Sub Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    const sessionUriStr = AgentSession.uri("copilotcli", "seed-2").toString();
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    fireSessionRemoved(agentHost, "seed-2");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1);
  }));
  test("session-state subscription auto-releases after the idle window", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("idle-1", { summary: "Idle Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Idle Session");
    assert.ok(session);
    const sessionUriStr = AgentSession.uri("copilotcli", "idle-1").toString();
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0);
    await timeout(2e4);
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 1, "still one wire subscribe");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr) ?? 0, 0, "no unsubscribe yet (timer reset)");
    await timeout(31e3);
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(sessionUriStr), 1, "wire unsubscribe after idle window");
    provider.getSessionConfig(session.sessionId);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(sessionUriStr), 2, "fresh subscribe after release");
  }));
  test("equivalent session descriptions do not notify observers", () => {
    const provider = createProvider(disposables, agentHost);
    fireSessionAdded(agentHost, "description-stable", { title: "Session" });
    const session = provider.getSessions().find((s) => AgentSession.id(s.resource.toString()) === "description-stable");
    assert.ok(session);
    session.status.set(SessionStatus.InProgress, void 0);
    session.setActivity("Working");
    let updateCount = 0;
    disposables.add(autorun((reader) => {
      session.description.read(reader);
      updateCount++;
    }));
    session.status.set(SessionStatus.NeedsInput, void 0);
    assert.strictEqual(updateCount, 1);
  });
  test("equivalent GitHub info does not notify observers", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const makePullRequest = () => ({
      number: 42,
      title: "PR",
      body: "",
      state: GitHubPullRequestState.Closed,
      author: { login: "author", avatarUrl: "" },
      headRef: "feature",
      headSha: "head",
      baseRef: "main",
      isDraft: false,
      createdAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      updatedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      mergedAt: void 0,
      mergeable: false,
      mergeableState: "blocked"
    });
    const pullRequest = observableValue("pullRequest", makePullRequest());
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this._model = { pullRequest };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("github-stable", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("github-stable", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: { github: { owner: "owner", repo: "repo", pullRequestUrl: "https://github.com/owner/repo/pull/42" } }
    });
    const gitHubInfo = session.workspace.get().folders[0].gitRepository.gitHubInfo;
    let updateCount = 0;
    disposables.add(autorun((reader) => {
      gitHubInfo.read(reader);
      updateCount++;
    }));
    pullRequest.set(makePullRequest(), void 0);
    assert.strictEqual(updateCount, 1);
  }));
  test.skip("keeps a resolved PR number sticky across gitHubInfo recomputes (no re-lookup / icon flap)", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.lookupCalls = 0;
        this._model = { pullRequest: constObservable(void 0) };
        this.findPullRequestNumberByHeadBranch = async () => {
          this.lookupCalls++;
          return 42;
        };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("pr-sticky", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("pr-sticky", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: { git: { hasGitHubRemote: true, githubOwner: "owner", githubRepo: "repo", branchName: "feature" } }
    });
    const gitHubInfoObs = session.workspace.get().folders[0].gitRepository.gitHubInfo;
    const sub1 = autorun((reader) => {
      gitHubInfoObs.read(reader);
    });
    await timeout(0);
    assert.strictEqual(gitHubInfoObs.get()?.pullRequest?.number, 42, "PR number resolves while observed");
    assert.strictEqual(gitHubService.lookupCalls, 1, "one PR-number lookup after first resolution");
    sub1.dispose();
    let firstReObservedNumber;
    let captured = false;
    const sub2 = autorun((reader) => {
      const number = gitHubInfoObs.read(reader)?.pullRequest?.number;
      if (!captured) {
        firstReObservedNumber = number;
        captured = true;
      }
    });
    assert.strictEqual(firstReObservedNumber, 42, "PR number stays sticky across unobserve/reobserve");
    assert.strictEqual(gitHubService.lookupCalls, 1, "no extra PR-number lookup on recompute");
    sub2.dispose();
  }));
  test("surfaces a default open-PR icon immediately when a PR is detected before the live model loads", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this._model = { pullRequest: constObservable(void 0) };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("pr-default-icon", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("pr-default-icon", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: {
        github: {
          owner: "owner",
          repo: "repo",
          pullRequestUrls: [
            "https://github.com/owner/repo/pull/42",
            "https://github.com/owner/repo/pull/41"
          ]
        }
      }
    });
    const gitHubInfoObs = session.workspace.get().folders[0].gitRepository.gitHubInfo;
    const sub = autorun((reader) => {
      gitHubInfoObs.read(reader);
    });
    await timeout(0);
    const gitHubInfo = gitHubInfoObs.get();
    assert.deepStrictEqual({
      activePullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        icon: gitHubInfo.pullRequest.icon
      },
      pullRequests: gitHubInfo?.pullRequests?.map((pullRequest) => ({
        number: pullRequest.number,
        uri: pullRequest.uri.toString(),
        icon: pullRequest.icon
      }))
    }, {
      activePullRequest: {
        number: 42,
        icon: computePullRequestIcon(GitHubPullRequestState.Open)
      },
      pullRequests: [
        {
          number: 42,
          uri: "https://github.com/owner/repo/pull/42",
          icon: computePullRequestIcon(GitHubPullRequestState.Open)
        },
        {
          number: 41,
          uri: "https://github.com/owner/repo/pull/41",
          icon: void 0
        }
      ]
    });
    sub.dispose();
  }));
  test("uses the latest merge or pull-request outcome as the completed-state icon", async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this._model = { pullRequest: constObservable(void 0) };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("completed-state-icon", { summary: "Completed Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((candidate) => candidate.title.get() === "Completed Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    const mergeState = withSessionSourceControlState(void 0, {
      merge: { commit: "merge-commit" },
      latestOutcome: SessionSourceControlOutcome.Merge
    });
    agentHost.setSessionState("completed-state-icon", "copilotcli", {
      provider: "copilotcli",
      title: "Completed Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: mergeState
    });
    const mergeIcon = session.completedStateIcon?.get();
    const pullRequestState = withSessionSourceControlState(withSessionGitHubState(mergeState, {
      owner: "owner",
      repo: "repo",
      pullRequestUrls: ["https://github.com/owner/repo/pull/42"],
      pullRequestBranchName: "feature"
    }), {
      merge: { commit: "merge-commit" },
      latestOutcome: SessionSourceControlOutcome.PullRequest
    });
    agentHost.setSessionState("completed-state-icon", "copilotcli", {
      provider: "copilotcli",
      title: "Completed Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: pullRequestState
    });
    const pullRequestIcon = session.completedStateIcon?.get();
    assert.deepStrictEqual({
      merge: { id: mergeIcon?.id, color: mergeIcon?.color?.id },
      pullRequest: { id: pullRequestIcon?.id, color: pullRequestIcon?.color?.id }
    }, {
      merge: { id: Codicon.gitMerge.id, color: "charts.purple" },
      pullRequest: {
        id: computePullRequestIcon(GitHubPullRequestState.Open).id,
        color: computePullRequestIcon(GitHubPullRequestState.Open).color?.id
      }
    });
  });
  test("filters folder-session baseline pull requests from GitHub info", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const gitHubService = new class extends mock() {
      constructor() {
        super(...arguments);
        this._model = { pullRequest: constObservable(void 0) };
        this.createPullRequestModelReference = () => new ImmortalReference(this._model);
      }
    }();
    agentHost.addSession(createSession("pr-baseline", { summary: "PR Session", project: { uri: URI.parse("file:///repo"), displayName: "repo" } }));
    const provider = createProvider(disposables, agentHost, void 0, { gitHubService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "PR Session");
    assert.ok(session);
    provider.getSessionConfig(session.sessionId);
    agentHost.setSessionState("pr-baseline", "copilotcli", {
      provider: "copilotcli",
      title: "PR Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      _meta: {
        github: {
          owner: "owner",
          repo: "repo",
          pullRequestUrls: [
            "https://github.com/owner/repo/pull/42",
            "https://github.com/owner/repo/pull/41"
          ],
          initialPullRequestUrls: ["https://github.com/owner/repo/pull/42"]
        }
      }
    });
    const gitHubInfo = session.workspace.get().folders[0].gitRepository.gitHubInfo.get();
    assert.deepStrictEqual({
      activePullRequest: gitHubInfo?.pullRequest?.number,
      pullRequests: gitHubInfo?.pullRequests?.map((pullRequest) => pullRequest.number)
    }, {
      activePullRequest: 41,
      pullRequests: [41]
    });
  }));
  test("replaceSessionConfig only replaces sessionMutable, non-readOnly values and preserves everything else", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("rep-1", { summary: "Replace Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Replace Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] },
          // non-mutable
          branch: { type: "string", title: "Branch", enum: ["main"], sessionMutable: true, readOnly: true }
          // readOnly
        }
      },
      values: { autoApprove: "default", isolation: "worktree", branch: "main" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Replace Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("rep-1", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    await provider.replaceSessionConfig(session.sessionId, {
      autoApprove: "autoApprove",
      isolation: "folder",
      branch: "other",
      rogue: "ignored"
    });
    const sessionUri = AgentSession.uri("copilotcli", "rep-1").toString();
    const configChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    assert.ok(configChanged, "a SessionConfigChanged action should be dispatched");
    assert.deepStrictEqual(configChanged.action, {
      type: ActionType.SessionConfigChanged,
      config: { autoApprove: "autoApprove", isolation: "worktree", branch: "main" },
      replace: true
    });
    const latest = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(latest?.values, { autoApprove: "autoApprove", isolation: "worktree", branch: "main" });
  }));
  test("running session config writes clamp autoApprove to default when policy disables global auto-approve", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("policy-write", { summary: "Policy Write Session" }));
    const configService = createPolicyRestrictedConfigurationService();
    const provider = createProvider(disposables, agentHost, void 0, { configurationService: configService });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Policy Write Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove", "autopilot"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"], sessionMutable: true }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Policy Write Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("policy-write", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    await provider.setSessionConfigValue(session.sessionId, SessionConfigKey.AutoApprove, "autopilot");
    const sessionUri = AgentSession.uri("copilotcli", "policy-write").toString();
    const setConfigChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    agentHost.dispatchedActions.length = 0;
    await provider.replaceSessionConfig(session.sessionId, {
      autoApprove: "autoApprove",
      isolation: "folder"
    });
    const replaceConfigChanged = agentHost.dispatchedActions.find((d) => d.action.type === ActionType.SessionConfigChanged && d.channel === sessionUri);
    assert.deepStrictEqual({
      setAction: setConfigChanged?.action,
      replaceAction: replaceConfigChanged?.action,
      latestValues: provider.getSessionConfig(session.sessionId)?.values
    }, {
      setAction: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "default" }
      },
      replaceAction: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "default", isolation: "folder" },
        replace: true
      },
      latestValues: { autoApprove: "default", isolation: "folder" }
    });
  }));
  test("running session config write re-resolves schema-dependent properties", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("schema-write", { summary: "Schema Write Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Schema Write Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true },
          "codex.networkAccessEnabled": { type: "boolean", title: "Network", default: false, sessionMutable: true }
        }
      },
      values: { "codex.sandboxMode": "workspace-write", "codex.networkAccessEnabled": false }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "Schema Write Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("schema-write", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values["codex.sandboxMode"] === "workspace-write");
    agentHost.resolveSessionConfigResult = {
      schema: {
        type: "object",
        properties: {
          "codex.sandboxMode": { type: "string", title: "Sandbox", enum: ["read-only", "workspace-write"], sessionMutable: true }
        }
      },
      values: { "codex.sandboxMode": "read-only" }
    };
    await provider.setSessionConfigValue(session.sessionId, "codex.sandboxMode", "read-only");
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.schema.properties["codex.networkAccessEnabled"] === void 0);
    assert.deepStrictEqual({
      resolveConfig: agentHost.resolveSessionConfigRequests.at(-1)?.config,
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      resolveConfig: { "codex.sandboxMode": "read-only", "codex.networkAccessEnabled": false },
      properties: ["codex.sandboxMode"],
      values: { "codex.sandboxMode": "read-only" }
    });
    agentHost.setSessionState("schema-write", "copilotcli", {
      ...fakeState,
      config: {
        ...config,
        values: { "codex.sandboxMode": "read-only", "codex.networkAccessEnabled": true }
      }
    });
    assert.deepStrictEqual({
      properties: Object.keys(provider.getSessionConfig(session.sessionId)?.schema.properties ?? {}).sort(),
      values: provider.getSessionConfig(session.sessionId)?.values
    }, {
      properties: ["codex.sandboxMode"],
      values: { "codex.sandboxMode": "read-only" }
    });
  }));
  test("replaceSessionConfig is a no-op when nothing editable actually changes", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("rep-2", { summary: "No-op Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "No-op Session");
    assert.ok(session);
    const config = {
      schema: {
        type: "object",
        properties: {
          autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
          isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
        }
      },
      values: { autoApprove: "default", isolation: "worktree" }
    };
    const fakeState = {
      provider: "copilotcli",
      title: "No-op Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config
    };
    agentHost.setSessionState("rep-2", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    const before = agentHost.dispatchedActions.length;
    await provider.replaceSessionConfig(session.sessionId, { autoApprove: "default" });
    assert.strictEqual(agentHost.dispatchedActions.length, before, "no action should be dispatched");
  }));
  test("server-echoed SessionConfigChanged merges config values into the running cache by default", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cfg-merge", { summary: "Merge Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Merge Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Merge Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
            isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
          }
        },
        values: { autoApprove: "default", isolation: "worktree" }
      }
    };
    agentHost.setSessionState("cfg-merge", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "cfg-merge").toString(),
      action: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove" }
      },
      serverSeq: 1,
      origin: void 0
    });
    const updated = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(updated?.values, { autoApprove: "autoApprove", isolation: "worktree" });
  }));
  test("server-echoed SessionConfigChanged with replace:true overwrites the running cache", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("cfg-replace", { summary: "Replace Session" }));
    const provider = createProvider(disposables, agentHost);
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions().find((s) => s.title.get() === "Replace Session");
    assert.ok(session);
    const fakeState = {
      provider: "copilotcli",
      title: "Replace Session",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      chats: [],
      config: {
        schema: {
          type: "object",
          properties: {
            autoApprove: { type: "string", title: "Auto Approve", enum: ["default", "autoApprove"], sessionMutable: true },
            mode: { type: "string", title: "Mode", enum: ["a", "b"], sessionMutable: true },
            isolation: { type: "string", title: "Isolation", enum: ["folder", "worktree"] }
          }
        },
        values: { autoApprove: "default", mode: "a", isolation: "worktree" }
      }
    };
    agentHost.setSessionState("cfg-replace", "copilotcli", fakeState);
    await waitForSessionConfig(provider, session.sessionId, (c) => c?.values.autoApprove === "default");
    agentHost.fireAction({
      channel: AgentSession.uri("copilotcli", "cfg-replace").toString(),
      action: {
        type: ActionType.SessionConfigChanged,
        config: { autoApprove: "autoApprove", isolation: "worktree" },
        replace: true
      },
      serverSeq: 1,
      origin: void 0
    });
    const updated = provider.getSessionConfig(session.sessionId);
    assert.deepStrictEqual(updated?.values, { autoApprove: "autoApprove", isolation: "worktree" });
  }));
  test("keeps a visible session subscribed so host-spawned subagent chats keep reaching the catalog", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    agentHost.addSession(createSession("subagent-live", { summary: "Lead" }));
    const visibleSessions = observableValue("visible", []);
    const provider = createProvider(disposables, agentHost, void 0, { visibleSessions });
    provider.getSessions();
    await timeout(0);
    const session = provider.getSessions()[0];
    visibleSessions.set([new class extends mock() {
      constructor() {
        super(...arguments);
        this.resource = session.resource;
      }
    }()], void 0);
    const sessionUri = AgentSession.uri("copilotcli", "subagent-live").toString();
    const defaultChat = buildDefaultChatUri(sessionUri);
    const subagentOne = buildSubagentChatUri(sessionUri, "tc-1");
    const subagentTwo = buildSubagentChatUri(sessionUri, "tc-2");
    const toolChat = (resource, toolCallId, title) => ({
      resource,
      title,
      status: ProtocolSessionStatus.InProgress,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      origin: { kind: ProtocolChatOriginKind.Tool, chat: defaultChat, toolCallId }
    });
    const stateWith = (chats) => ({
      provider: "copilotcli",
      title: "Lead",
      status: ProtocolSessionStatus.Idle,
      lifecycle: SessionLifecycle.Ready,
      activeClients: [],
      defaultChat,
      chats
    });
    const defaultSummary = { resource: defaultChat, title: "", status: ProtocolSessionStatus.Idle, modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString() };
    agentHost.setSessionState("subagent-live", "copilotcli", stateWith([defaultSummary, toolChat(subagentOne, "tc-1", "Add name to README")]));
    assert.ok(session.chats.get().some((c) => c.resource.fragment === "subagent/tc-1"), "first subagent should reach the catalog while visible");
    await timeout(12e4);
    agentHost.setSessionState("subagent-live", "copilotcli", stateWith([
      defaultSummary,
      toolChat(subagentOne, "tc-1", "Add name to README"),
      toolChat(subagentTwo, "tc-2", "Add description to package.json")
    ]));
    assert.deepStrictEqual(
      session.chats.get().map((c) => c.resource.fragment).filter((f) => f.startsWith("subagent/")).sort(),
      ["subagent/tc-1", "subagent/tc-2"],
      "both subagents should reach the catalog after the idle window while the session stays visible"
    );
  }));
});
suite.skip("LocalAgentHostSessionsProvider - active-session branch changeset subscription", () => {
  const disposables = new DisposableStore();
  let agentHost;
  let activeSession;
  setup(() => {
    agentHost = disposables.add(new MockAgentHostService());
    activeSession = observableValue("test.activeSession", void 0);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeActive(rawId, sessionType = "copilotcli", status = SessionStatus.Completed) {
    return {
      // providerId: 'unused',
      sessionType,
      resource: URI.from({ scheme: `agent-host-${sessionType}`, path: `/${rawId}` }),
      status: constObservable(status)
    };
  }
  function branchChangesKeyFor(rawId, sessionType = "copilotcli") {
    return `${AgentSession.uri(sessionType, rawId).toString()}/changeset/branch`;
  }
  function observeSession(session) {
    disposables.add(autorun((reader) => {
      session.changes.read(reader);
      session.changesSummary?.read(reader);
    }));
  }
  function addAndObserve(provider, rawId, opts) {
    fireSessionAdded(agentHost, rawId, { title: `Session ${rawId}`, changes: opts?.changes });
    const session = provider.getSessions().find((s) => s.title.get() === `Session ${rawId}`);
    assert.ok(session, `expected session ${rawId}`);
    observeSession(session);
    return session;
  }
  test("subscribes to the branch changeset when the session becomes active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const key = branchChangesKeyFor("sess-A");
    assert.ok(
      agentHost.wireOps.includes(`subscribe:${key}`),
      `expected a subscribe for ${key}, got wireOps=${JSON.stringify(agentHost.wireOps)}`
    );
  });
  test("rotates the subscription when the active session changes", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    addAndObserve(provider, "sess-B");
    activeSession.set(makeActive("sess-A"), void 0);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0, 1, "A should be subscribed once on activation");
    activeSession.set(makeActive("sess-B"), void 0);
    assert.strictEqual(agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-B")) ?? 0, 1, "B should be subscribed once on activation");
    assert.strictEqual(agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0, 1, "A should be unsubscribed when no longer active");
  });
  test("switching back to a previously-active session re-subscribes", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    addAndObserve(provider, "sess-B");
    activeSession.set(makeActive("sess-A"), void 0);
    activeSession.set(makeActive("sess-B"), void 0);
    activeSession.set(makeActive("sess-A"), void 0);
    const subsForA = agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0;
    assert.strictEqual(subsForA, 2, "switching back to A must open a fresh subscription");
  });
  test("does NOT subscribe when a different session is active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-other"), void 0);
    assert.strictEqual(
      agentHost.sessionSubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0,
      0,
      "no branch changeset subscription should open while a different session is active"
    );
  });
  test("does NOT subscribe to uncommitted changes for an untitled active session", () => {
    createProvider(disposables, agentHost, void 0, { activeSession });
    activeSession.set(makeActive("sess-new", "copilotcli", SessionStatus.Untitled), void 0);
    const subKeys = [...agentHost.sessionSubscribeCounts.keys()].filter((k) => k.endsWith("/changeset/uncommitted"));
    assert.deepStrictEqual(subKeys, [], "new-session composer should not restore the backend session just to refresh changes");
  });
  test("releases the subscription when no session is active", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    activeSession.set(void 0, void 0);
    const unsubsForA = agentHost.sessionUnsubscribeCounts.get(branchChangesKeyFor("sess-A")) ?? 0;
    assert.strictEqual(unsubsForA, 1, "leaving the agents window (no active session) must release the subscription");
  });
  test("active branch changeset uses before content URI as the diff original", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    agentHost.setChangesetState(branchChangesKeyFor("sess-A"), {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///repo/file.ts",
        edit: {
          before: { uri: "file:///repo/file.ts", content: { uri: "session-db:///before/file.ts" } },
          after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
          diff: { added: 2, removed: 1 }
        }
      }]
    });
    const changes = session.changes.get();
    assert.deepStrictEqual(changes.map((change) => {
      assert.ok(isIChatSessionFileChange2(change));
      return {
        uri: change.uri.toString(),
        originalUri: change.originalUri?.toString(),
        modifiedUri: change.modifiedUri?.toString(),
        insertions: change.insertions,
        deletions: change.deletions
      };
    }), [{
      uri: "file:///repo/file.ts",
      originalUri: "vscode-agent-host://local/before/file.ts?_ah%3DeyJzY2hlbWUiOiJzZXNzaW9uLWRiIn0",
      modifiedUri: "file:///repo/file.ts",
      insertions: 2,
      deletions: 1
    }]);
  }));
  test("changes summary tracks the live branch changeset while active and the catalogue once inactive", () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    agentHost.setChangesetState(branchChangesKeyFor("sess-A"), {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///repo/file.ts",
        edit: {
          before: { uri: "file:///repo/file.ts", content: { uri: "session-db:///before/file.ts" } },
          after: { uri: "file:///repo/file.ts", content: { uri: "file:///repo/file.ts" } },
          diff: { added: 2, removed: 1 }
        }
      }]
    });
    activeSession.set(makeActive("sess-A"), void 0);
    assert.deepStrictEqual(session.changesSummary?.get(), { additions: 2, deletions: 1, files: 1 });
    activeSession.set(makeActive("sess-B"), void 0);
    fireSessionSummaryChanged(agentHost, "sess-A", { changes: { additions: 5, deletions: 3, files: 1 } });
    assert.deepStrictEqual(session.changesSummary?.get(), { additions: 5, deletions: 3, files: 1 });
  });
  function makeChangesetFile(index, version) {
    const path = `file:///repo/src/file-${index}.ts`;
    return {
      id: path,
      edit: {
        before: { uri: path, content: { uri: `session-db:///before/file-${index}.ts` } },
        after: { uri: path, content: { uri: path } },
        diff: { added: version, removed: 0 }
      }
    };
  }
  test("rebuilds only the changed file across many changeset updates (O(changed), not O(all))", () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e3 }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const FILE_COUNT = 200;
    const UPDATE_COUNT = 100;
    const key = branchChangesKeyFor("sess-A");
    const files = [];
    for (let i = 0; i < FILE_COUNT; i++) {
      files.push(makeChangesetFile(i, 0));
    }
    agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
    let previous = session.changes.get();
    assert.strictEqual(previous.length, FILE_COUNT, "every file should surface as a change");
    for (let update = 0; update < UPDATE_COUNT; update++) {
      const changedIndex = update % FILE_COUNT;
      files[changedIndex] = makeChangesetFile(changedIndex, update + 1);
      agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
      const next = session.changes.get();
      let rebuilt = 0;
      for (let i = 0; i < FILE_COUNT; i++) {
        if (next[i] !== previous[i]) {
          rebuilt++;
        }
      }
      assert.strictEqual(rebuilt, 1, `update ${update}: exactly one change object should be rebuilt, but ${rebuilt} of ${FILE_COUNT} were`);
      previous = next;
    }
  }));
  test("an untouched file keeps its change-object identity while another file streams updates", () => runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e3 }, async () => {
    const provider = createProvider(disposables, agentHost, void 0, { activeSession });
    const session = addAndObserve(provider, "sess-A");
    activeSession.set(makeActive("sess-A"), void 0);
    const FILE_COUNT = 50;
    const UPDATE_COUNT = 100;
    const key = branchChangesKeyFor("sess-A");
    const files = [];
    for (let i = 0; i < FILE_COUNT; i++) {
      files.push(makeChangesetFile(i, 0));
    }
    agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
    const untouchedChangeBefore = session.changes.get()[0];
    assert.ok(untouchedChangeBefore, "the untouched file should have a change object to begin with");
    const lastIndex = FILE_COUNT - 1;
    for (let update = 0; update < UPDATE_COUNT; update++) {
      files[lastIndex] = makeChangesetFile(lastIndex, update + 1);
      agentHost.setChangesetState(key, { status: ChangesetStatus.Ready, files: [...files] });
      session.changes.get();
    }
    const untouchedChangeAfter = session.changes.get()[0];
    assert.strictEqual(untouchedChangeAfter, untouchedChangeBefore, "an unchanged file must reuse its change object across all updates");
  }));
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxhZ2VudEhvc3RcXHRlc3RcXGJyb3dzZXJcXGxvY2FsQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgcmVuZGVyQXNQbGFpbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UsIHJhY2VUaW1lb3V0LCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJbW1vcnRhbFJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlLCB0eXBlIElSZWZlcmVuY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUsIHR5cGUgSU9ic2VydmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBpc0VxdWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uLCB0eXBlIElBZ2VudENyZWF0ZUNoYXRPcHRpb25zLCB0eXBlIElBZ2VudENyZWF0ZVNlc3Npb25Db25maWcsIHR5cGUgSUFnZW50U2Vzc2lvbk1ldGFkYXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgSUFnZW50SG9zdFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IElBZ2VudFN1YnNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHkgYXMgUHJvdG9jb2xDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQgYXMgUHJvdG9jb2xDaGF0T3JpZ2luS2luZCwgQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cywgQ3VzdG9taXphdGlvblR5cGUsIE1jcFNlcnZlclN0YXR1cywgTWVzc2FnZUtpbmQsIFNlc3Npb25MaWZlY3ljbGUsIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIEFnZW50SW5mbywgdHlwZSBDaGFuZ2VzU3VtbWFyeSwgdHlwZSBDdXN0b21pemF0aW9uLCB0eXBlIFJvb3RTdGF0ZSwgdHlwZSBTZXNzaW9uQWN0aXZlQ2xpZW50LCB0eXBlIFNlc3Npb25Db25maWdTdGF0ZSwgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgU2Vzc2lvblN1bW1hcnkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdFVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaSwgYnVpbGRTdWJhZ2VudENoYXRVcmksIENoYW5nZXNldFN0YXR1cywgU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lLCBTZXNzaW9uU3RhdHVzIGFzIFByb3RvY29sU2Vzc2lvblN0YXR1cywgU3RhdGVDb21wb25lbnRzLCB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlLCB3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlLCB3aXRoU2Vzc2lvbkdpdFN0YXRlLCB3aXRoU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhLCB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSwgd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzLCB0eXBlIENoYW5nZXNldFN0YXRlLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBDaGF0U3VtbWFyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIE5vdGlmaWNhdGlvblR5cGUsIHR5cGUgQWN0aW9uRW52ZWxvcGUsIHR5cGUgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uLCB0eXBlIENoYXRBY3Rpb24sIHR5cGUgU2Vzc2lvbkFjdGlvbiwgdHlwZSBUZXJtaW5hbEFjdGlvbiwgdHlwZSBJTm90aWZpY2F0aW9uLCB0eXBlIENsaWVudEFubm90YXRpb25zQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uQ29uZmlnS2V5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zZXNzaW9uQ29uZmlnS2V5cy5qcyc7XG5pbXBvcnQgeyBDb25maWd1cmF0aW9uVGFyZ2V0LCBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IElEaWFsb2dTZXJ2aWNlLCBJRmlsZURpYWxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9kaWFsb2dzL2NvbW1vbi9kaWFsb2dzLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UsIElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJUHJvZ3Jlc3NTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vcHJvZ3Jlc3MvY29tbW9uL3Byb2dyZXNzLmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFdpZGdldCwgSUNoYXRXaWRnZXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2NoYXQuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCB0eXBlIENoYXRTZW5kUmVzdWx0LCB0eXBlIElDaGF0TW9kZWxSZWZlcmVuY2UsIHR5cGUgSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25zU2VydmljZSwgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdE1vZGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY29uc3RhbnRzLmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHR5cGUgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9sYW5ndWFnZU1vZGVscy5qcyc7XG5pbXBvcnQgdHlwZSB7IElDaGF0TW9kZWwsIElDaGF0TW9kZWxJbnB1dFN0YXRlLCBJSW5wdXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZUV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgQ2hhdEludGVyYWN0aXZpdHksIENoYXRPcmlnaW5LaW5kLCBnZXRDaGF0Q2FwYWJpbGl0aWVzLCBJU2Vzc2lvbiwgU2Vzc2lvblN0YXR1cyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50Q3VzdG9taXphdGlvblNjb3BlLCBJQWdlbnRIb3N0QWN0aXZlQ2xpZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9hZ2VudEhvc3RBY3RpdmVDbGllbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IExvY2FsQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFNlc3Npb25BZGFwdGVyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9iYXNlQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYXV0b21hdGlvbnMvY29tbW9uL2F1dG9tYXRpb25TdG9yYWdlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0QXV0b21hdGlvblN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYXV0b21hdGlvbnMvdGVzdC9icm93c2VyL2F1dG9tYXRpb25UZXN0VXRpbHMuanMnO1xuaW1wb3J0IHsgSUxhYmVsU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xhYmVsL2NvbW1vbi9sYWJlbC5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdE1vZGVsLmpzJztcbmltcG9ydCB7IElQdWxsUmVxdWVzdEljb25DYWNoZSwgUHVsbFJlcXVlc3RJY29uQ2FjaGUgfSBmcm9tICcuLi8uLi8uLi8uLi9naXRodWIvYnJvd3Nlci9wdWxsUmVxdWVzdEljb25DYWNoZS5qcyc7XG5pbXBvcnQgeyBjb21wdXRlUHVsbFJlcXVlc3RJY29uLCBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLCB0eXBlIElHaXRIdWJQdWxsUmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9lbnZpcm9ubWVudC9jb21tb24vZW52aXJvbm1lbnRTZXJ2aWNlLmpzJztcblxuLy8gLS0tLSBNb2NrIElBZ2VudEhvc3RTZXJ2aWNlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuY29uc3QgU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMgPSAnc2Vzc2lvbnMuYWdlbnRIb3N0LnNlc3Npb25Db25maWdQaWNrZXIuc2VsZWN0ZWRWYWx1ZXMnO1xuXG50eXBlIFN1YnNjcmlwdGlvblN0YXRlID0gU2Vzc2lvblN0YXRlIHwgQ2hhbmdlc2V0U3RhdGUgfCBDaGF0U3RhdGU7XG5cbmNsYXNzIE1vY2tBZ2VudEhvc3RTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQWdlbnRIb3N0U2VydmljZT4oKSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgX29uRGlkQWN0aW9uID0gbmV3IEVtaXR0ZXI8QWN0aW9uRW52ZWxvcGU+KCk7XG5cdG92ZXJyaWRlIGdldCBvbkRpZEFjdGlvbigpOiBFdmVudDxBY3Rpb25FbnZlbG9wZT4geyByZXR1cm4gdGhpcy5fb25EaWRBY3Rpb24uZXZlbnQ7IH1cblx0cHJpdmF0ZSBfb25EaWROb3RpZmljYXRpb24gPSBuZXcgRW1pdHRlcjxJTm90aWZpY2F0aW9uPigpO1xuXHRvdmVycmlkZSBnZXQgb25EaWROb3RpZmljYXRpb24oKTogRXZlbnQ8SU5vdGlmaWNhdGlvbj4geyByZXR1cm4gdGhpcy5fb25EaWROb3RpZmljYXRpb24uZXZlbnQ7IH1cblx0cHJpdmF0ZSBfcm9vdFN0YXRlTGlzdGVuZXJDb3VudCA9IDA7XG5cdHByaXZhdGUgX29uRGlkUm9vdFN0YXRlQ2hhbmdlID0gbmV3IEVtaXR0ZXI8Um9vdFN0YXRlPih7XG5cdFx0b25EaWRBZGRMaXN0ZW5lcjogKCkgPT4gdGhpcy5fcm9vdFN0YXRlTGlzdGVuZXJDb3VudCsrLFxuXHRcdG9uV2lsbFJlbW92ZUxpc3RlbmVyOiAoKSA9PiB0aGlzLl9yb290U3RhdGVMaXN0ZW5lckNvdW50LS0sXG5cdH0pO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJvb3RTdGF0ZUVycm9yID0gbmV3IEVtaXR0ZXI8RXJyb3I+KCk7XG5cdHByaXZhdGUgX3Jvb3RTdGF0ZVZhbHVlOiBSb290U3RhdGUgfCBFcnJvciB8IHVuZGVmaW5lZCA9IHsgYWdlbnRzOiBbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczogeyBtdWx0aXBsZUNoYXRzOiB7IGZvcms6IHRydWUgfSB9IH0gYXMgQWdlbnRJbmZvXSB9O1xuXHRwcml2YXRlIF9yb290U3RhdGVTdWJzY3JpcHRpb246IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+O1xuXHRvdmVycmlkZSBnZXQgcm9vdFN0YXRlKCk6IElBZ2VudFN1YnNjcmlwdGlvbjxSb290U3RhdGU+IHsgcmV0dXJuIHRoaXMuX3Jvb3RTdGF0ZVN1YnNjcmlwdGlvbjsgfVxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkFnZW50SG9zdFN0YXJ0ID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25BZ2VudEhvc3RTdGFydCA9IHRoaXMuX29uQWdlbnRIb3N0U3RhcnQuZXZlbnQ7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgY2xpZW50SWQgPSAndGVzdC1sb2NhbC1jbGllbnQnO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGE+KCk7XG5cdHB1YmxpYyBkaXNwb3NlZFNlc3Npb25zOiBVUklbXSA9IFtdO1xuXHRwdWJsaWMgb25EaXNwb3NlU2Vzc2lvbjogKChzZXNzaW9uOiBVUkkpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRwdWJsaWMgZmFpbERpc3Bvc2VTZXNzaW9uRm9yOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHB1YmxpYyBkaXNwYXRjaGVkQWN0aW9uczogeyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24gfCBUZXJtaW5hbEFjdGlvbiB8IENsaWVudEFubm90YXRpb25zQWN0aW9uIHwgSVJvb3RDb25maWdDaGFuZ2VkQWN0aW9uOyBjbGllbnRJZDogc3RyaW5nOyBjbGllbnRTZXE6IG51bWJlciB9W10gPSBbXTtcblx0cHVibGljIGZhaWxSZXNvbHZlU2Vzc2lvbkNvbmZpZyA9IGZhbHNlO1xuXHRwdWJsaWMgcmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQ6IFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSB9O1xuXHRwdWJsaWMgcmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0czogeyBjb25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9W10gPSBbXTtcblx0cHVibGljIHJlc29sdmVTZXNzaW9uQ29uZmlnQmFycmllcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRnZXQgcm9vdFN0YXRlTGlzdGVuZXJDb3VudCgpOiBudW1iZXIgeyByZXR1cm4gdGhpcy5fcm9vdFN0YXRlTGlzdGVuZXJDb3VudDsgfVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2F1dGhlbnRpY2F0aW9uUGVuZGluZzogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiA9IG9ic2VydmFibGVWYWx1ZSgnYXV0aGVudGljYXRpb25QZW5kaW5nJywgZmFsc2UpO1xuXHRvdmVycmlkZSByZWFkb25seSBhdXRoZW50aWNhdGlvblBlbmRpbmc6IElPYnNlcnZhYmxlPGJvb2xlYW4+ID0gdGhpcy5fYXV0aGVudGljYXRpb25QZW5kaW5nO1xuXHRvdmVycmlkZSBzZXRBdXRoZW50aWNhdGlvblBlbmRpbmcocGVuZGluZzogYm9vbGVhbik6IHZvaWQge1xuXHRcdHRoaXMuX2F1dGhlbnRpY2F0aW9uUGVuZGluZy5zZXQocGVuZGluZywgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHByaXZhdGUgX25leHRTZXEgPSAwO1xuXG5cdGNvbnN0cnVjdG9yKCkge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0dGhpcy5fcm9vdFN0YXRlU3Vic2NyaXB0aW9uID0ge1xuXHRcdFx0Z2V0IHZhbHVlKCkgeyByZXR1cm4gc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRnZXQgdmVyaWZpZWRWYWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlIGluc3RhbmNlb2YgRXJyb3IgPyB1bmRlZmluZWQgOiBzZWxmLl9yb290U3RhdGVWYWx1ZTsgfSxcblx0XHRcdG9uRGlkQ2hhbmdlOiBzZWxmLl9vbkRpZFJvb3RTdGF0ZUNoYW5nZS5ldmVudCxcblx0XHRcdG9uRGlkRXJyb3I6IHNlbGYuX29uRGlkUm9vdFN0YXRlRXJyb3IuZXZlbnQsXG5cdFx0XHRvbldpbGxBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHRcdG9uRGlkQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0fTtcblx0fVxuXG5cdG5leHRDbGllbnRTZXEoKTogbnVtYmVyIHtcblx0XHRyZXR1cm4gdGhpcy5fbmV4dFNlcSsrO1xuXHR9XG5cblx0LyoqXG5cdCAqIE51bWJlciBvZiB1cGNvbWluZyBgbGlzdFNlc3Npb25zKClgIGNhbGxzIHRoYXQgc2hvdWxkIHJlamVjdCwgdXNlZCB0b1xuXHQgKiBzaW11bGF0ZSB0aGUgYWdlbnQgdGhyb3dpbmcgYEFIUF9BVVRIX1JFUVVJUkVEYCAob3IgYSB0cmFuc2llbnQgb2ZmbGluZVxuXHQgKiBlcnJvcikgYmVmb3JlIGl0cyB0b2tlbiBpcyBlZmZlY3RpdmUgc2VydmVyLXNpZGUuIERlY3JlbWVudGVkIHBlciBjYWxsLlxuXHQgKi9cblx0cHVibGljIGZhaWxMaXN0U2Vzc2lvbnNDb3VudCA9IDA7XG5cdHB1YmxpYyBsaXN0U2Vzc2lvbnNDYWxsQ291bnQgPSAwO1xuXHRwdWJsaWMgbGlzdFNlc3Npb25zQmFycmllcjogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IHwgdW5kZWZpbmVkO1xuXHRvdmVycmlkZSBhc3luYyBsaXN0U2Vzc2lvbnMoKTogUHJvbWlzZTxJQWdlbnRTZXNzaW9uTWV0YWRhdGFbXT4ge1xuXHRcdHRoaXMubGlzdFNlc3Npb25zQ2FsbENvdW50Kys7XG5cdFx0YXdhaXQgdGhpcy5saXN0U2Vzc2lvbnNCYXJyaWVyPy5wO1xuXHRcdGlmICh0aGlzLmZhaWxMaXN0U2Vzc2lvbnNDb3VudCA+IDApIHtcblx0XHRcdHRoaXMuZmFpbExpc3RTZXNzaW9uc0NvdW50LS07XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ0FIUF9BVVRIX1JFUVVJUkVEJyk7XG5cdFx0fVxuXHRcdHJldHVybiBbLi4udGhpcy5fc2Vzc2lvbnMudmFsdWVzKCldO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgZGlzcG9zZVNlc3Npb24oc2Vzc2lvbjogVVJJKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5kaXNwb3NlZFNlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdFx0aWYgKHJhd0lkID09PSB0aGlzLmZhaWxEaXNwb3NlU2Vzc2lvbkZvcikge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKGBGYWlsZWQgdG8gZGlzcG9zZSAke3Jhd0lkfWApO1xuXHRcdH1cblx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUocmF3SWQpO1xuXHRcdHRoaXMub25EaXNwb3NlU2Vzc2lvbj8uKHNlc3Npb24pO1xuXHR9XG5cblx0cHVibGljIGRpc3Bvc2VkQ2hhdHM6IFVSSVtdID0gW107XG5cdG92ZXJyaWRlIGFzeW5jIGRpc3Bvc2VDaGF0KGNoYXQ6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuZGlzcG9zZWRDaGF0cy5wdXNoKGNoYXQpO1xuXHR9XG5cblx0cHVibGljIGNyZWF0ZWRDaGF0czogeyBzZXNzaW9uOiBVUkk7IGNoYXQ6IFVSSTsgb3B0aW9ucz86IElBZ2VudENyZWF0ZUNoYXRPcHRpb25zIH1bXSA9IFtdO1xuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVDaGF0KHNlc3Npb246IFVSSSwgY2hhdDogVVJJLCBvcHRpb25zPzogSUFnZW50Q3JlYXRlQ2hhdE9wdGlvbnMpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHR0aGlzLmNyZWF0ZWRDaGF0cy5wdXNoKHsgc2Vzc2lvbiwgY2hhdCwgb3B0aW9ucyB9KTtcblx0XHRjb25zdCBrZXkgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSB0aGlzLl9zZXNzaW9uU3RhdGVWYWx1ZXMuZ2V0KGtleSkgYXMgU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkO1xuXHRcdGlmIChleGlzdGluZyAmJiBBcnJheS5pc0FycmF5KGV4aXN0aW5nLmNoYXRzKSkge1xuXHRcdFx0Y29uc3QgbmV3Q2hhdDogQ2hhdFN1bW1hcnkgPSB7XG5cdFx0XHRcdHJlc291cmNlOiBjaGF0LnRvU3RyaW5nKCksXG5cdFx0XHRcdHRpdGxlOiBvcHRpb25zPy50aXRsZSA/PyAnJyxcblx0XHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdH07XG5cdFx0XHR0aGlzLnNldFNlc3Npb25TdGF0ZShBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbiksIEFnZW50U2Vzc2lvbi5wcm92aWRlcihzZXNzaW9uKSEsIHtcblx0XHRcdFx0Li4uZXhpc3RpbmcsXG5cdFx0XHRcdGNoYXRzOiBbLi4uZXhpc3RpbmcuY2hhdHMsIG5ld0NoYXRdLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0cHVibGljIGNyZWF0ZWRTZXNzaW9uVXJpczogVVJJW10gPSBbXTtcblx0cHVibGljIGNyZWF0ZVNlc3Npb25Db25maWdzOiB7IGNvbmZpZz86IFJlY29yZDxzdHJpbmcsIHVua25vd24+OyBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+OyB3b3JraW5nRGlyZWN0b3J5PzogVVJJIH1bXSA9IFtdO1xuXHQvKipcblx0ICogUGVyLWNhbGwgaG9vayB1c2VkIGJ5IHRlc3RzIHRvIGludGVybGVhdmUgb3BlcmF0aW9ucyBhY3Jvc3MgdGhlXG5cdCAqIGBjcmVhdGVTZXNzaW9uYCBhd2FpdCBcdTIwMTQgZS5nLiB0byB2ZXJpZnkgdGhhdCBubyBzdWJzY3JpcHRpb24gaXMgb3BlbmVkXG5cdCAqIGJlZm9yZSB0aGUgY3JlYXRlIGNvbXBsZXRlcywgb3IgdG8gc2ltdWxhdGUgYSB3b3Jrc3BhY2Ugc3dpdGNoIGxhbmRpbmdcblx0ICogbWlkLWNhbGwuIENsZWFyZWQgYWZ0ZXIgdGhlIG5leHQgY3JlYXRlU2Vzc2lvbiBjYWxsIGludm9rZXMgaXQuXG5cdCAqL1xuXHRwdWJsaWMgb25DcmVhdGVTZXNzaW9uOiAoKHVyaTogVVJJKSA9PiB2b2lkIHwgUHJvbWlzZTx2b2lkPikgfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBPcmRlcmVkIGxvZyBvZiB3aXJlLWxldmVsIG9wZXJhdGlvbnM6IHVzZWZ1bCBmb3IgYXNzZXJ0aW5nIHRoYXRcblx0ICogYGNyZWF0ZVNlc3Npb25gIHN0cmljdGx5IHByZWNlZGVzIGBzdWJzY3JpYmVgIGZvciBhIGdpdmVuIHNlc3Npb24gVVJJLlxuXHQgKiBFYWNoIGVudHJ5IGlzIGAke29wfToke3VyaX1gLlxuXHQgKi9cblx0cHVibGljIHdpcmVPcHM6IHN0cmluZ1tdID0gW107XG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZVNlc3Npb24oY29uZmlnPzogSUFnZW50Q3JlYXRlU2Vzc2lvbkNvbmZpZyk6IFByb21pc2U8VVJJPiB7XG5cdFx0Y29uc3QgdXJpID0gY29uZmlnPy5zZXNzaW9uID8/IFVSSS5wYXJzZSgnY29waWxvdGNsaTovLy9hdXRvLScgKyB0aGlzLl9uZXh0U2VxKTtcblx0XHR0aGlzLmNyZWF0ZVNlc3Npb25Db25maWdzLnB1c2goe1xuXHRcdFx0Y29uZmlnOiBjb25maWc/LmNvbmZpZyxcblx0XHRcdC4uLihjb25maWc/Ll9tZXRhID8geyBtZXRhZGF0YTogY29uZmlnLl9tZXRhIH0gOiB7fSksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjb25maWc/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdH0pO1xuXHRcdHRoaXMud2lyZU9wcy5wdXNoKGBjcmVhdGVTZXNzaW9uOiR7dXJpLnRvU3RyaW5nKCl9YCk7XG5cdFx0dGhpcy5jcmVhdGVkU2Vzc2lvblVyaXMucHVzaCh1cmkpO1xuXHRcdGNvbnN0IGhvb2sgPSB0aGlzLm9uQ3JlYXRlU2Vzc2lvbjtcblx0XHR0aGlzLm9uQ3JlYXRlU2Vzc2lvbiA9IHVuZGVmaW5lZDtcblx0XHRpZiAoaG9vaykge1xuXHRcdFx0YXdhaXQgaG9vayh1cmkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgcmVzb2x2ZVNlc3Npb25Db25maWcocmVxdWVzdDogeyBjb25maWc/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9KTogUHJvbWlzZTxSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdD4ge1xuXHRcdHRoaXMucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5wdXNoKHJlcXVlc3QpO1xuXHRcdGF3YWl0IHRoaXMucmVzb2x2ZVNlc3Npb25Db25maWdCYXJyaWVyPy5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGlmICh0aGlzLmZhaWxSZXNvbHZlU2Vzc2lvbkNvbmZpZykge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdyZXNvbHZlU2Vzc2lvbkNvbmZpZyB1bmF2YWlsYWJsZScpO1xuXHRcdH1cblx0XHRyZXR1cm4gdGhpcy5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcblx0fVxuXG5cdGRpc3BhdGNoQWN0aW9uKGNoYW5uZWw6IHN0cmluZywgYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IFRlcm1pbmFsQWN0aW9uIHwgQ2xpZW50QW5ub3RhdGlvbnNBY3Rpb24gfCBJUm9vdENvbmZpZ0NoYW5nZWRBY3Rpb24sIGNsaWVudElkOiBzdHJpbmcsIGNsaWVudFNlcTogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwYXRjaGVkQWN0aW9ucy5wdXNoKHsgY2hhbm5lbCwgYWN0aW9uLCBjbGllbnRJZCwgY2xpZW50U2VxIH0pO1xuXHR9XG5cblx0b3ZlcnJpZGUgZGlzcGF0Y2goY2hhbm5lbDogc3RyaW5nLCBhY3Rpb246IFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uIHwgVGVybWluYWxBY3Rpb24gfCBDbGllbnRBbm5vdGF0aW9uc0FjdGlvbiB8IElSb290Q29uZmlnQ2hhbmdlZEFjdGlvbik6IHZvaWQge1xuXHRcdHRoaXMuZGlzcGF0Y2hlZEFjdGlvbnMucHVzaCh7IGNoYW5uZWwsIGFjdGlvbiwgY2xpZW50SWQ6IHRoaXMuY2xpZW50SWQsIGNsaWVudFNlcTogdGhpcy5fbmV4dFNlcSsrIH0pO1xuXHR9XG5cblx0Ly8gVGVzdCBoZWxwZXJzXG5cdGFkZFNlc3Npb24obWV0YTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KEFnZW50U2Vzc2lvbi5pZChtZXRhLnNlc3Npb24pLCBtZXRhKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGEgc2Vzc2lvbiBmcm9tIHdoYXQgYGxpc3RTZXNzaW9ucygpYCByZXBvcnRzLCB3aXRob3V0IGdvaW5nIHRocm91Z2hcblx0ICogYGRpc3Bvc2VTZXNzaW9uYC4gU2ltdWxhdGVzIGFuIGFnZW50IHRoYXQgY2Fubm90IGVudW1lcmF0ZSBpdHMgc2Vzc2lvbnNcblx0ICogeWV0IChhdXRoIHRva2VuIG9yIFNESyBzdGlsbCBsb2FkaW5nKSBhbmQgc28gY29udHJpYnV0ZXMgbm90aGluZyB0byB0aGVcblx0ICogaG9zdCdzIGFnZ3JlZ2F0ZWQgbGlzdGluZy5cblx0ICovXG5cdHN0b3BMaXN0aW5nU2Vzc2lvbnMoLi4uaWRzOiBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgaWQgb2YgaWRzKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUoaWQpO1xuXHRcdH1cblx0fVxuXG5cdC8vIC0tLS0gU2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb25zIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX3Nlc3Npb25TdGF0ZUVtaXR0ZXJzID0gbmV3IE1hcDxzdHJpbmcsIEVtaXR0ZXI8U3Vic2NyaXB0aW9uU3RhdGU+PigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uU3RhdGVWYWx1ZXMgPSBuZXcgTWFwPHN0cmluZywgU3Vic2NyaXB0aW9uU3RhdGU+KCk7XG5cdHB1YmxpYyBzZXNzaW9uU3Vic2NyaWJlQ291bnRzID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0cHVibGljIHNlc3Npb25VbnN1YnNjcmliZUNvdW50cyA9IG5ldyBNYXA8c3RyaW5nLCBudW1iZXI+KCk7XG5cblx0b3ZlcnJpZGUgZ2V0U3Vic2NyaXB0aW9uPFQ+KF9raW5kOiBTdGF0ZUNvbXBvbmVudHMsIHJlc291cmNlOiBVUkkpOiBJUmVmZXJlbmNlPElBZ2VudFN1YnNjcmlwdGlvbjxUPj4ge1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0dGhpcy53aXJlT3BzLnB1c2goYHN1YnNjcmliZToke2tleX1gKTtcblx0XHR0aGlzLnNlc3Npb25TdWJzY3JpYmVDb3VudHMuc2V0KGtleSwgKHRoaXMuc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoa2V5KSA/PyAwKSArIDEpO1xuXHRcdGxldCBlbWl0dGVyID0gdGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuZ2V0KGtleSk7XG5cdFx0aWYgKCFlbWl0dGVyKSB7XG5cdFx0XHRlbWl0dGVyID0gbmV3IEVtaXR0ZXI8U3Vic2NyaXB0aW9uU3RhdGU+KCk7XG5cdFx0XHR0aGlzLl9zZXNzaW9uU3RhdGVFbWl0dGVycy5zZXQoa2V5LCBlbWl0dGVyKTtcblx0XHR9XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3Qgc3ViOiBJQWdlbnRTdWJzY3JpcHRpb248VD4gPSB7XG5cdFx0XHRnZXQgdmFsdWUoKSB7IHJldHVybiBzZWxmLl9zZXNzaW9uU3RhdGVWYWx1ZXMuZ2V0KGtleSkgYXMgdW5rbm93biBhcyBUIHwgdW5kZWZpbmVkOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9zZXNzaW9uU3RhdGVWYWx1ZXMuZ2V0KGtleSkgYXMgdW5rbm93biBhcyBUIHwgdW5kZWZpbmVkOyB9LFxuXHRcdFx0b25EaWRDaGFuZ2U6IGVtaXR0ZXIuZXZlbnQgYXMgdW5rbm93biBhcyBFdmVudDxUPixcblx0XHRcdG9uV2lsbEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdFx0b25EaWRBcHBseUFjdGlvbjogRXZlbnQuTm9uZSxcblx0XHR9O1xuXHRcdHJldHVybiB7XG5cdFx0XHRvYmplY3Q6IHN1Yixcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHtcblx0XHRcdFx0dGhpcy5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuc2V0KGtleSwgKHRoaXMuc2Vzc2lvblVuc3Vic2NyaWJlQ291bnRzLmdldChrZXkpID8/IDApICsgMSk7XG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHRzZXRTZXNzaW9uU3RhdGUocmF3SWQ6IHN0cmluZywgcHJvdmlkZXI6IHN0cmluZywgc3RhdGU6IFNlc3Npb25TdGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IGtleSA9IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIHJhd0lkKS50b1N0cmluZygpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVZhbHVlcy5zZXQoa2V5LCBzdGF0ZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuZ2V0KGtleSk/LmZpcmUoc3RhdGUpO1xuXHR9XG5cblx0c2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0VXJpOiBzdHJpbmcsIHN0YXRlOiBDaGFuZ2VzZXRTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVZhbHVlcy5zZXQoY2hhbmdlc2V0VXJpLCBzdGF0ZSk7XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuZ2V0KGNoYW5nZXNldFVyaSk/LmZpcmUoc3RhdGUpO1xuXHR9XG5cblx0c2V0Q2hhdFN0YXRlKGNoYXRVcmk6IHN0cmluZywgc3RhdGU6IENoYXRTdGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZVZhbHVlcy5zZXQoY2hhdFVyaSwgc3RhdGUpO1xuXHRcdHRoaXMuX3Nlc3Npb25TdGF0ZUVtaXR0ZXJzLmdldChjaGF0VXJpKT8uZmlyZShzdGF0ZSk7XG5cdH1cblxuXHRzZXRBZ2VudHMoYWdlbnRzOiBBZ2VudEluZm9bXSk6IHZvaWQge1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0geyBhZ2VudHMgfTtcblx0XHR0aGlzLl9vbkRpZFJvb3RTdGF0ZUNoYW5nZS5maXJlKHRoaXMuX3Jvb3RTdGF0ZVZhbHVlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBGaXJlcyBhIHJvb3Qgc3RhdGUgY2hhbmdlIHRoYXQgcHJlc2VydmVzIHRoZSBjdXJyZW50IGBhZ2VudHNgIHJlZmVyZW5jZSxcblx0ICogc2ltdWxhdGluZyBub24tYWdlbnQgcm9vdCBkZWx0YXMgKGUuZy4gYFJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWRgIG9uXG5cdCAqIGV2ZXJ5IHR1cm4gc3RhcnQvY29tcGxldGUpIHRoYXQgdGhlIHJlYWwgcmVkdWNlciBlbWl0cyB3aXRob3V0XG5cdCAqIHJlcGxhY2luZyB0aGUgYGFnZW50c2Agc2xpY2UuXG5cdCAqL1xuXHRmaXJlTm9uQWdlbnRSb290U3RhdGVDaGFuZ2UoKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9yb290U3RhdGVWYWx1ZSB8fCB0aGlzLl9yb290U3RhdGVWYWx1ZSBpbnN0YW5jZW9mIEVycm9yKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3Jvb3RTdGF0ZSBub3QgaW5pdGlhbGl6ZWQ7IGNhbGwgc2V0QWdlbnRzIGZpcnN0Jyk7XG5cdFx0fVxuXHRcdHRoaXMuX3Jvb3RTdGF0ZVZhbHVlID0geyAuLi50aGlzLl9yb290U3RhdGVWYWx1ZSB9O1xuXHRcdHRoaXMuX29uRGlkUm9vdFN0YXRlQ2hhbmdlLmZpcmUodGhpcy5fcm9vdFN0YXRlVmFsdWUpO1xuXHR9XG5cblx0Y2xlYXJSb290U3RhdGUoKTogdm9pZCB7XG5cdFx0dGhpcy5fcm9vdFN0YXRlVmFsdWUgPSB1bmRlZmluZWQ7XG5cdH1cblxuXHRyZXBsYWNlUm9vdFN0YXRlT25TdGFydChhZ2VudHM6IEFnZW50SW5mb1tdKTogdm9pZCB7XG5cdFx0Y29uc3Qgc2VsZiA9IHRoaXM7XG5cdFx0Y29uc3QgcHJldmlvdXNFbWl0dGVyID0gdGhpcy5fb25EaWRSb290U3RhdGVDaGFuZ2U7XG5cdFx0Y29uc3QgcHJldmlvdXNBY3Rpb25FbWl0dGVyID0gdGhpcy5fb25EaWRBY3Rpb247XG5cdFx0Y29uc3QgcHJldmlvdXNOb3RpZmljYXRpb25FbWl0dGVyID0gdGhpcy5fb25EaWROb3RpZmljYXRpb247XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2UgPSBuZXcgRW1pdHRlcjxSb290U3RhdGU+KHtcblx0XHRcdG9uRGlkQWRkTGlzdGVuZXI6ICgpID0+IHRoaXMuX3Jvb3RTdGF0ZUxpc3RlbmVyQ291bnQrKyxcblx0XHRcdG9uV2lsbFJlbW92ZUxpc3RlbmVyOiAoKSA9PiB0aGlzLl9yb290U3RhdGVMaXN0ZW5lckNvdW50LS0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgdmFsdWU6IFJvb3RTdGF0ZSA9IHsgYWdlbnRzIH07XG5cdFx0dGhpcy5fb25EaWRSb290U3RhdGVDaGFuZ2UgPSBvbkRpZENoYW5nZTtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbiA9IG5ldyBFbWl0dGVyPEFjdGlvbkVudmVsb3BlPigpO1xuXHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uID0gbmV3IEVtaXR0ZXI8SU5vdGlmaWNhdGlvbj4oKTtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IHZhbHVlO1xuXHRcdHRoaXMuX3Jvb3RTdGF0ZVN1YnNjcmlwdGlvbiA9IHtcblx0XHRcdGdldCB2YWx1ZSgpIHsgcmV0dXJuIHNlbGYuX3Jvb3RTdGF0ZVZhbHVlOyB9LFxuXHRcdFx0Z2V0IHZlcmlmaWVkVmFsdWUoKSB7IHJldHVybiBzZWxmLl9yb290U3RhdGVWYWx1ZSBpbnN0YW5jZW9mIEVycm9yID8gdW5kZWZpbmVkIDogc2VsZi5fcm9vdFN0YXRlVmFsdWU7IH0sXG5cdFx0XHRvbkRpZENoYW5nZTogb25EaWRDaGFuZ2UuZXZlbnQsXG5cdFx0XHRvbkRpZEVycm9yOiB0aGlzLl9vbkRpZFJvb3RTdGF0ZUVycm9yLmV2ZW50LFxuXHRcdFx0b25XaWxsQXBwbHlBY3Rpb246IEV2ZW50Lk5vbmUsXG5cdFx0XHRvbkRpZEFwcGx5QWN0aW9uOiBFdmVudC5Ob25lLFxuXHRcdH07XG5cdFx0dGhpcy5fb25BZ2VudEhvc3RTdGFydC5maXJlKCk7XG5cdFx0cHJldmlvdXNFbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHRwcmV2aW91c0FjdGlvbkVtaXR0ZXIuZGlzcG9zZSgpO1xuXHRcdHByZXZpb3VzTm90aWZpY2F0aW9uRW1pdHRlci5kaXNwb3NlKCk7XG5cdH1cblxuXHRmaXJlQWdlbnRIb3N0U3RhcnQoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25BZ2VudEhvc3RTdGFydC5maXJlKCk7XG5cdH1cblxuXHRzZXRSb290U3RhdGVFcnJvcigpOiB2b2lkIHtcblx0XHRjb25zdCBlcnJvciA9IG5ldyBFcnJvcigncm9vdCBzdGF0ZSBmYWlsZWQnKTtcblx0XHR0aGlzLl9yb290U3RhdGVWYWx1ZSA9IGVycm9yO1xuXHRcdHRoaXMuX29uRGlkUm9vdFN0YXRlRXJyb3IuZmlyZShlcnJvcik7XG5cdH1cblxuXHRmaXJlTm90aWZpY2F0aW9uKG46IElOb3RpZmljYXRpb24pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZE5vdGlmaWNhdGlvbi5maXJlKG4pO1xuXHR9XG5cblx0ZmlyZUFjdGlvbihlbnZlbG9wZTogQWN0aW9uRW52ZWxvcGUpOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZEFjdGlvbi5maXJlKGVudmVsb3BlKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRBY3Rpb24uZGlzcG9zZSgpO1xuXHRcdHRoaXMuX29uRGlkTm90aWZpY2F0aW9uLmRpc3Bvc2UoKTtcblx0XHR0aGlzLl9vbkRpZFJvb3RTdGF0ZUNoYW5nZS5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25EaWRSb290U3RhdGVFcnJvci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5fb25BZ2VudEhvc3RTdGFydC5kaXNwb3NlKCk7XG5cdFx0Zm9yIChjb25zdCBlbWl0dGVyIG9mIHRoaXMuX3Nlc3Npb25TdGF0ZUVtaXR0ZXJzLnZhbHVlcygpKSB7XG5cdFx0XHRlbWl0dGVyLmRpc3Bvc2UoKTtcblx0XHR9XG5cdFx0dGhpcy5fc2Vzc2lvblN0YXRlRW1pdHRlcnMuY2xlYXIoKTtcblx0fVxufVxuXG4vLyAtLS0tIFRlc3QgaGVscGVycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKGlkOiBzdHJpbmcsIG9wdHM/OiB7IHByb3ZpZGVyPzogc3RyaW5nOyBzdW1tYXJ5Pzogc3RyaW5nOyBwcm9qZWN0PzogeyB1cmk6IFVSSTsgZGlzcGxheU5hbWU6IHN0cmluZyB9OyB3b3JraW5nRGlyZWN0b3J5PzogVVJJOyBzdGFydFRpbWU/OiBudW1iZXI7IG1vZGlmaWVkVGltZT86IG51bWJlcjsgcXVpY2tDaGF0PzogYm9vbGVhbjsgbXVsdGlSb290PzogeyB3b3Jrc3BhY2VGaWxlOiBzdHJpbmcgfTsgYWRvcHRhYmxlPzogYm9vbGVhbiB9KTogSUFnZW50U2Vzc2lvbk1ldGFkYXRhIHtcblx0bGV0IF9tZXRhID0gb3B0cz8ucXVpY2tDaGF0ID8gd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSkgOiB1bmRlZmluZWQ7XG5cdF9tZXRhID0gd2l0aFNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YShfbWV0YSwgb3B0cz8ubXVsdGlSb290KTtcblx0aWYgKG9wdHM/LmFkb3B0YWJsZSkge1xuXHRcdF9tZXRhID0gd2l0aFNlc3Npb25FaGNsaUFkb3B0YWJsZShfbWV0YSk7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKG9wdHM/LnByb3ZpZGVyID8/ICdjb3BpbG90Y2xpJywgaWQpLFxuXHRcdHN0YXJ0VGltZTogb3B0cz8uc3RhcnRUaW1lID8/IDEwMDAsXG5cdFx0bW9kaWZpZWRUaW1lOiBvcHRzPy5tb2RpZmllZFRpbWUgPz8gMjAwMCxcblx0XHRzdW1tYXJ5OiBvcHRzPy5zdW1tYXJ5LFxuXHRcdHByb2plY3Q6IG9wdHM/LnByb2plY3QsXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBvcHRzPy53b3JraW5nRGlyZWN0b3J5ID8gW29wdHM/LndvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdF9tZXRhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB7XG5cdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZykge1xuXHRcdFx0Y29uc3QgYmFzZSA9IHN1cGVyLmluc3BlY3Q8VD4oa2V5KTtcblx0XHRcdGlmIChrZXkgPT09ICdjaGF0LnRvb2xzLmdsb2JhbC5hdXRvQXBwcm92ZScpIHtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgcG9saWN5VmFsdWU6IGZhbHNlIGFzIHVua25vd24gYXMgVCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJhc2U7XG5cdFx0fVxuXHR9KCk7XG59XG5cbi8qKlxuICogTWltaWNzIHByb2R1Y3Rpb24sIHdoZXJlIGBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uYCBzaGlwcyB3aXRoIGEgc2NoZW1hXG4gKiBkZWZhdWx0IChgeyBtb2RlOiAnaW50ZXJhY3RpdmUnLCBhcHByb3ZhbHM6ICdtYW51YWwnIH1gKSwgc28gYW4gdW50b3VjaGVkXG4gKiBzZXR0aW5nIGlzIHJlcG9ydGVkIGJ5IGBpbnNwZWN0YCBvbmx5IGFzIGBkZWZhdWx0VmFsdWVgIChubyB1c2VyIGxheWVyKS5cbiAqIFRoZSBwbGFpbiB7QGxpbmsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlfSBkb2VzIG5vdCByZWdpc3RlciBzY2hlbWEgZGVmYXVsdHMsXG4gKiBzbyBpdCBjYW5ub3QgcmVwcm9kdWNlIHRoZSBcImNvbmZpZ3VyZWQgZGVmYXVsdCBtYXNrcyByZW1lbWJlcmVkIHBpY2tcIiBidWcuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVNjaGVtYURlZmF1bHRDb25maWd1cmF0aW9uU2VydmljZSgpOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRvdmVycmlkZSBpbnNwZWN0PFQ+KGtleTogc3RyaW5nKSB7XG5cdFx0XHRjb25zdCBiYXNlID0gc3VwZXIuaW5zcGVjdDxUPihrZXkpO1xuXHRcdFx0aWYgKGtleSA9PT0gJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nICYmIGJhc2UudXNlclZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29uc3Qgc2NoZW1hRGVmYXVsdCA9IHsgbW9kZTogJ2ludGVyYWN0aXZlJywgYXBwcm92YWxzOiAnbWFudWFsJyB9IGFzIHVua25vd24gYXMgVDtcblx0XHRcdFx0cmV0dXJuIHsgLi4uYmFzZSwgdmFsdWU6IHNjaGVtYURlZmF1bHQsIGRlZmF1bHRWYWx1ZTogc2NoZW1hRGVmYXVsdCB9O1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIGJhc2U7XG5cdFx0fVxuXHR9KCk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsIGFnZW50SG9zdFNlcnZpY2U6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCBjb250cmlidXRpb25zID0gW1xuXHR7IHR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBuYW1lOiAnY29waWxvdCcsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAndGVzdCcsIGljb246IHVuZGVmaW5lZCB9LFxuXSwgb3B0aW9ucz86IHsgc2VuZFJlcXVlc3Q/OiAocmVzb3VyY2U6IFVSSSwgbWVzc2FnZTogc3RyaW5nLCBvcHRpb25zPzogSUNoYXRTZW5kUmVxdWVzdE9wdGlvbnMpID0+IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+OyBhY3F1aXJlT3JMb2FkU2Vzc2lvbj86IChyZXNvdXJjZTogVVJJKSA9PiBQcm9taXNlPElDaGF0TW9kZWxSZWZlcmVuY2UgfCB1bmRlZmluZWQ+OyBsYW5ndWFnZU1vZGVsSWRzPzogc3RyaW5nW107IGxvb2t1cExhbmd1YWdlTW9kZWw/OiAobW9kZWxJZDogc3RyaW5nKSA9PiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YSB8IHVuZGVmaW5lZDsgaGlkZGVuTGFuZ3VhZ2VNb2RlbElkcz86IFJlYWRvbmx5U2V0PHN0cmluZz47IGxhbmd1YWdlTW9kZWxWaXNpYmlsaXR5Q2hhbmdlcz86IEV2ZW50PHZvaWQ+OyBvcGVuU2Vzc2lvbj86IGJvb2xlYW47IGNvbmZpZ3VyYXRpb25TZXJ2aWNlPzogSUNvbmZpZ3VyYXRpb25TZXJ2aWNlOyBhY3RpdmVTZXNzaW9uPzogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+OyB2aXNpYmxlU2Vzc2lvbnM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+OyBhY3RpdmVDbGllbnQ/OiBPbWl0PFNlc3Npb25BY3RpdmVDbGllbnQsICdjbGllbnRJZCc+OyBhY3RpdmVDbGllbnRBZ2VudHM/OiBJT2JzZXJ2YWJsZTxyZWFkb25seSBBZ2VudEN1c3RvbWl6YXRpb25bXT47IGFjdGl2ZUNsaWVudFNjb3BlPzogKHNlc3Npb25UeXBlOiBzdHJpbmcsIHJvb3RzOiByZWFkb25seSBVUklbXSkgPT4gSUFnZW50Q3VzdG9taXphdGlvblNjb3BlIHwgdW5kZWZpbmVkOyBzdG9yYWdlU2VydmljZT86IElTdG9yYWdlU2VydmljZTsgaXNTZXNzaW9uc1dpbmRvdz86IGJvb2xlYW47IGNvbmZpcm1EZWxldGU/OiBib29sZWFuOyB3b3Jrc3BhY2VUcnVzdGVkPzogYm9vbGVhbjsgd29ya3NwYWNlVHJ1c3RCYXJyaWVyPzogRGVmZXJyZWRQcm9taXNlPHZvaWQ+OyB3b3Jrc3BhY2VUcnVzdEVycm9yPzogRXJyb3I7IGdpdEh1YlNlcnZpY2U/OiBJR2l0SHViU2VydmljZSB9KTogTG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudEhvc3RTZXJ2aWNlLCBhZ2VudEhvc3RTZXJ2aWNlKTtcblx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBvcHRpb25zPy5jb25maWd1cmF0aW9uU2VydmljZSA/PyBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWd1cmF0aW9uU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGlzV29ya3NwYWNlVHJ1c3RlZCgpOiBib29sZWFuIHsgcmV0dXJuIG9wdGlvbnM/LndvcmtzcGFjZVRydXN0ZWQgPz8gdHJ1ZTsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldFVyaVRydXN0SW5mbyh1cmk6IFVSSSkge1xuXHRcdFx0YXdhaXQgb3B0aW9ucz8ud29ya3NwYWNlVHJ1c3RCYXJyaWVyPy5wO1xuXHRcdFx0aWYgKG9wdGlvbnM/LndvcmtzcGFjZVRydXN0RXJyb3IpIHtcblx0XHRcdFx0dGhyb3cgb3B0aW9ucy53b3Jrc3BhY2VUcnVzdEVycm9yO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgdXJpLCB0cnVzdGVkOiBvcHRpb25zPy53b3Jrc3BhY2VUcnVzdGVkID8/IHRydWUgfTtcblx0XHR9XG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3JrYmVuY2hFbnZpcm9ubWVudFNlcnZpY2UsIHsgaXNTZXNzaW9uc1dpbmRvdzogb3B0aW9ucz8uaXNTZXNzaW9uc1dpbmRvdyA/PyB0cnVlIH0gYXMgSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIHsgY29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiBvcHRpb25zPy5jb25maXJtRGVsZXRlID8/IHRydWUgfSkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRnZXRDaGF0U2Vzc2lvbkNvbnRyaWJ1dGlvbjogKGNoYXRTZXNzaW9uVHlwZTogc3RyaW5nKSA9PiBjb250cmlidXRpb25zLmZpbmQoYyA9PiBjLnR5cGUgPT09IGNoYXRTZXNzaW9uVHlwZSksXG5cdFx0Z2V0QWxsQ2hhdFNlc3Npb25Db250cmlidXRpb25zOiAoKSA9PiBjb250cmlidXRpb25zLFxuXHRcdGdldE9yQ3JlYXRlQ2hhdFNlc3Npb246IGFzeW5jICgpID0+ICh7IG9uV2lsbERpc3Bvc2U6ICgpID0+ICh7IGRpc3Bvc2UoKSB7IH0gfSksIHNlc3Npb25SZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0JyB9KSwgaGlzdG9yeTogW10sIGRpc3Bvc2UoKSB7IH0gfSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBvcHRpb25zPy5hY3F1aXJlT3JMb2FkU2Vzc2lvbiA/PyAoYXN5bmMgKCkgPT4gdW5kZWZpbmVkKSxcblx0XHRzZW5kUmVxdWVzdDogb3B0aW9ucz8uc2VuZFJlcXVlc3QgPz8gKGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9KSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiBvcHRpb25zPy5vcGVuU2Vzc2lvbiA/IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXQ+KCkgeyB9KCkgOiB1bmRlZmluZWQsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsc1NlcnZpY2UsIHtcblx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBvcHRpb25zPy5sYW5ndWFnZU1vZGVsSWRzID8/IFtdLFxuXHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IG9wdGlvbnM/Lmxvb2t1cExhbmd1YWdlTW9kZWwgPz8gKCgpID0+IHVuZGVmaW5lZCksXG5cdFx0aGFzUmVzb2x2ZWRWZW5kb3I6ICgpID0+IHRydWUsXG5cdFx0aXNNb2RlbEhpZGRlbjogKG1vZGVsSWQ6IHN0cmluZykgPT4gb3B0aW9ucz8uaGlkZGVuTGFuZ3VhZ2VNb2RlbElkcz8uaGFzKG1vZGVsSWQpID8/IGZhbHNlLFxuXHRcdG9uRGlkQ2hhbmdlTGFuZ3VhZ2VNb2RlbHM6IEV2ZW50Lk5vbmUsXG5cdFx0b25EaWRDaGFuZ2VNb2RlbFZpc2liaWxpdHk6IG9wdGlvbnM/Lmxhbmd1YWdlTW9kZWxWaXNpYmlsaXR5Q2hhbmdlcyA/PyBFdmVudC5Ob25lLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFiZWxTZXJ2aWNlLCB7XG5cdFx0Z2V0VXJpTGFiZWw6ICh1cmk6IFVSSSkgPT4gdXJpLnBhdGgsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gb3B0aW9ucz8uc3RvcmFnZVNlcnZpY2UgPz8gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUF1dG9tYXRpb25TdG9yYWdlU2VydmljZSwgbmV3IFRlc3RBdXRvbWF0aW9uU3RvcmFnZVNlcnZpY2Uoc3RvcmFnZVNlcnZpY2UpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdpdEh1YlNlcnZpY2UsIG9wdGlvbnM/LmdpdEh1YlNlcnZpY2UgPz8gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoID0gYXN5bmMgKCkgPT4gdW5kZWZpbmVkO1xuXHR9KCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQdWxsUmVxdWVzdEljb25DYWNoZSwgaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoUHVsbFJlcXVlc3RJY29uQ2FjaGUpKTtcblx0Y29uc3QgYWN0aXZlU2Vzc2lvbk9icyA9IG9wdGlvbnM/LmFjdGl2ZVNlc3Npb24gPz8gY29uc3RPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRjb25zdCB2aXNpYmxlU2Vzc2lvbnNPYnMgPSBvcHRpb25zPy52aXNpYmxlU2Vzc2lvbnMgPz8gY29uc3RPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4oW10pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+ID0gYWN0aXZlU2Vzc2lvbk9icztcblx0XHRvdmVycmlkZSByZWFkb25seSB2aXNpYmxlU2Vzc2lvbnM6IElPYnNlcnZhYmxlPHJlYWRvbmx5IChJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZClbXT4gPSB2aXNpYmxlU2Vzc2lvbnNPYnM7XG5cdH0oKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50SG9zdEFjdGl2ZUNsaWVudFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIGFjcXVpcmVTY29wZSA9IChzZXNzaW9uVHlwZTogc3RyaW5nLCByb290czogcmVhZG9ubHkgVVJJW10pID0+IG9wdGlvbnM/LmFjdGl2ZUNsaWVudFNjb3BlPy4oc2Vzc2lvblR5cGUsIHJvb3RzKSA/PyAoe1xuXHRcdFx0Y3VzdG9taXphdGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zPy5hY3RpdmVDbGllbnQ/LmN1c3RvbWl6YXRpb25zID8/IFtdKSxcblx0XHRcdGN1c3RvbUFnZW50czogb3B0aW9ucz8uYWN0aXZlQ2xpZW50QWdlbnRzID8/IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0XHR0b29sczogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnM/LmFjdGl2ZUNsaWVudD8udG9vbHMgPz8gW10pLFxuXHRcdFx0aXNSZXNvbHZlZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0d2hlblJlc29sdmVkOiAoKSA9PiBQcm9taXNlLnJlc29sdmUoKSxcblx0XHRcdGFjdGl2ZUNsaWVudDogKGNsaWVudElkOiBzdHJpbmcpID0+IGNvbnN0T2JzZXJ2YWJsZSh7IGNsaWVudElkLCAuLi4ob3B0aW9ucz8uYWN0aXZlQ2xpZW50ID8/IHsgdG9vbHM6IFtdLCBjdXN0b21pemF0aW9uczogW10gfSkgfSksXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fSk7XG5cdH0oKSk7XG5cblx0cmV0dXJuIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIpKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwoaWQ6IHN0cmluZyk6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhIHtcblx0cmV0dXJuIHtcblx0XHRleHRlbnNpb246IG5ldyBFeHRlbnNpb25JZGVudGlmaWVyKCd0ZXN0LmFnZW50SG9zdCcpLFxuXHRcdGlkLFxuXHRcdHZlbmRvcjogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0bmFtZTogaWQsXG5cdFx0dmVyc2lvbjogJzEuMCcsXG5cdFx0ZmFtaWx5OiBpZCxcblx0XHRtYXhJbnB1dFRva2VuczogMSxcblx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHR9O1xufVxuXG5hc3luYyBmdW5jdGlvbiB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlcjogTG9jYWxBZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLCBzZXNzaW9uSWQ6IHN0cmluZywgcHJlZGljYXRlOiAoY29uZmlnOiBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCB8IHVuZGVmaW5lZCkgPT4gYm9vbGVhbik6IFByb21pc2U8dm9pZD4ge1xuXHRpZiAocHJlZGljYXRlKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbklkKSkpIHtcblx0XHRyZXR1cm47XG5cdH1cblxuXHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gcHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnKGNoYW5nZWRTZXNzaW9uSWQgPT4ge1xuXHRcdFx0aWYgKGNoYW5nZWRTZXNzaW9uSWQgPT09IHNlc3Npb25JZCAmJiBwcmVkaWNhdGUocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uSWQpKSkge1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcbn1cblxuZnVuY3Rpb24gZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBvcHRzPzogeyBwcm92aWRlcj86IHN0cmluZzsgdGl0bGU/OiBzdHJpbmc7IHByb2plY3Q/OiB7IHVyaTogc3RyaW5nOyBkaXNwbGF5TmFtZTogc3RyaW5nIH07IHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmc7IGNoYW5nZXM/OiBDaGFuZ2VzU3VtbWFyeTsgd29ya3NwYWNlbGVzcz86IGJvb2xlYW47IGNyZWF0ZWRBdD86IHN0cmluZzsgbW9kaWZpZWRBdD86IHN0cmluZyB9KTogdm9pZCB7XG5cdGNvbnN0IHByb3ZpZGVyID0gb3B0cz8ucHJvdmlkZXIgPz8gJ2NvcGlsb3RjbGknO1xuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpO1xuXHRhZ2VudEhvc3QuZmlyZU5vdGlmaWNhdGlvbih7XG5cdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHR0eXBlOiBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25BZGRlZCxcblx0XHRzdW1tYXJ5OiB7XG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0cHJvdmlkZXIsXG5cdFx0XHR0aXRsZTogb3B0cz8udGl0bGUgPz8gYFNlc3Npb24gJHtyYXdJZH1gLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogb3B0cz8uY3JlYXRlZEF0ID8/IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1vZGlmaWVkQXQ6IG9wdHM/Lm1vZGlmaWVkQXQgPz8gbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogb3B0cz8ucHJvamVjdCxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogb3B0cz8ud29ya2luZ0RpcmVjdG9yeSA/IFtvcHRzLndvcmtpbmdEaXJlY3RvcnldIDogdW5kZWZpbmVkLFxuXHRcdFx0Y2hhbmdlczogb3B0cz8uY2hhbmdlcyxcblx0XHRcdC4uLihvcHRzPy53b3Jrc3BhY2VsZXNzID8geyBfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSkgfSA6IHt9KSxcblx0XHR9LFxuXHR9KTtcbn1cblxuZnVuY3Rpb24gZmlyZVNlc3Npb25NZXRhQ2hhbmdlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBtZXRhOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZCwgcHJvdmlkZXIgPSAnY29waWxvdGNsaScpOiB2b2lkIHtcblx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIsIHJhd0lkKS50b1N0cmluZygpLFxuXHRcdGFjdGlvbjoge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uTWV0YUNoYW5nZWQsXG5cdFx0XHRfbWV0YTogbWV0YSxcblx0XHR9LFxuXHRcdHNlcnZlclNlcTogMSxcblx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpcmVTZXNzaW9uUmVtb3ZlZChhZ2VudEhvc3Q6IE1vY2tBZ2VudEhvc3RTZXJ2aWNlLCByYXdJZDogc3RyaW5nLCBwcm92aWRlciA9ICdjb3BpbG90Y2xpJyk6IHZvaWQge1xuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlciwgcmF3SWQpO1xuXHRhZ2VudEhvc3QuZmlyZU5vdGlmaWNhdGlvbih7XG5cdFx0Y2hhbm5lbDogJ2FocC1yb290Oi8vJyxcblx0XHR0eXBlOiBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkLFxuXHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0OiBNb2NrQWdlbnRIb3N0U2VydmljZSwgcmF3SWQ6IHN0cmluZywgY2hhbmdlczogUGFydGlhbDxTZXNzaW9uU3VtbWFyeT4sIHByb3ZpZGVyID0gJ2NvcGlsb3RjbGknKTogdm9pZCB7XG5cdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKHByb3ZpZGVyLCByYXdJZCk7XG5cdGFnZW50SG9zdC5maXJlTm90aWZpY2F0aW9uKHtcblx0XHRjaGFubmVsOiAnYWhwLXJvb3Q6Ly8nLFxuXHRcdHR5cGU6IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkLFxuXHRcdHNlc3Npb246IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRjaGFuZ2VzLFxuXHR9KTtcbn1cblxuLyoqXG4gKiBTZWVkIGBzdG9yYWdlU2VydmljZWAgd2l0aCBwZXJzaXN0ZWQgc2Vzc2lvbiBzdW1tYXJpZXMgYnkgcnVubmluZyBhIHRocm93YXdheVxuICogcHJvdmlkZXIgb3ZlciBhIGZyZXNoIGFnZW50IGhvc3QgdGhhdCBsaXN0cyBgc2Vzc2lvbnNgLCB0aGVuIGZsdXNoaW5nIHNvIHRoZVxuICogYmFzZSBwcm92aWRlcidzIGBvbldpbGxTYXZlU3RhdGVgIHdyaXRlcyB0aGUgY2FjaGUgdG8gc3RvcmFnZS4gVXNlZCB0b1xuICogc2ltdWxhdGUgd2hhdCBhIHByZXZpb3VzIHdpbmRvdyBsZWZ0IGJlaGluZCBmb3IgdGhlIG5leHQgbGF1bmNoIHRvIGh5ZHJhdGUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIHBlcnNpc3RDYWNoZWRTZXNzaW9ucyhkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLCBzdG9yYWdlU2VydmljZTogSVN0b3JhZ2VTZXJ2aWNlLCBzZXNzaW9uczogSUFnZW50U2Vzc2lvbk1ldGFkYXRhW10pOiBQcm9taXNlPHZvaWQ+IHtcblx0Y29uc3QgaG9zdCA9IG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpO1xuXHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IGhvc3QuZGlzcG9zZSgpKSk7XG5cdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBzZXNzaW9ucykge1xuXHRcdGhvc3QuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0fVxuXHRjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgaG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHQvLyBMZXQgdGhlIGVhZ2VyIHJlZnJlc2ggcGljayB1cCB0aGUgc2Vzc2lvbnMgKG1hcmtpbmcgdGhlIGNhY2hlIGRpcnR5KSB0aGVuXG5cdC8vIGZsdXNoIHNvIHRoZSBjYWNoZSBpcyBwZXJzaXN0ZWQuXG5cdGF3YWl0IHRpbWVvdXQoMCk7XG5cdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmZsdXNoKCk7XG59XG5cbnN1aXRlKCdMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgYWdlbnRIb3N0OiBNb2NrQWdlbnRIb3N0U2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0YWdlbnRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBhZ2VudEhvc3QuZGlzcG9zZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIFByb3ZpZGVyIGlkZW50aXR5IC0tLS0tLS1cblxuXHR0ZXN0KCdoYXMgY29ycmVjdCBpZCwgbGFiZWwsIGFuZCBzZXNzaW9uVHlwZSBmcm9tIHJvb3RTdGF0ZSBhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5pZCwgJ2xvY2FsLWFnZW50LWhvc3QnKTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIubGFiZWwubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcy5sZW5ndGgsIDEpO1xuXHRcdC8vIFRoZSBsb2dpY2FsIHNlc3Npb25UeXBlIGlkIGlzIHRoZSBhZ2VudCBwcm92aWRlciBuYW1lIGl0c2VsZiwgc29cblx0XHQvLyB0aGUgc2FtZSBhZ2VudCAoZS5nLiBgY29waWxvdGNsaWApIHNoYXJlcyBvbmUgc2Vzc2lvbiB0eXBlIGFjcm9zc1xuXHRcdC8vIGxvY2FsIGFuZCByZW1vdGUgaG9zdHMgYW5kIHRoZSBzdGFuZGFsb25lIENvcGlsb3QgQ0xJIHByb3ZpZGVyLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsICdjb3BpbG90Y2xpJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5sYWJlbCwgJ0NvcGlsb3QnKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB0eXBlcyB1cGRhdGUgd2hlbiB0aGUgbG9jYWwgaG9zdCBhZHZlcnRpc2VzIGFkZGl0aW9uYWwgYWdlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGxhYmVsOiB0LmxhYmVsIH0pKSwgW1xuXHRcdFx0eyBpZDogJ2NvcGlsb3RjbGknLCBsYWJlbDogJ0NvcGlsb3QnIH0sXG5cdFx0XSk7XG5cblx0XHRsZXQgY2hhbmdlcyA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzISgoKSA9PiBjaGFuZ2VzKyspKTtcblxuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnb3BlbmFpJywgZGlzcGxheU5hbWU6ICdPcGVuQUknLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcywgMSk7XG5cdFx0Ly8gVGhlIGxvZ2ljYWwgc2Vzc2lvblR5cGUgaWQgaXMgdGhlIGFnZW50IHByb3ZpZGVyIG5hbWUgaXRzZWxmLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLm1hcCh0ID0+ICh7IGlkOiB0LmlkLCBsYWJlbDogdC5sYWJlbCB9KSksIFtcblx0XHRcdHsgaWQ6ICdjb3BpbG90Y2xpJywgbGFiZWw6ICdDb3BpbG90JyB9LFxuXHRcdFx0eyBpZDogJ29wZW5haScsIGxhYmVsOiAnT3BlbkFJJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaGFyZXMgdGhlIHJvb3Qtc3RhdGUgbGlzdGVuZXIgYWNyb3NzIHNlc3Npb24gYWRhcHRlcnMnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczoge30gfSBhcyBBZ2VudEluZm9dKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGxpc3RlbmVyQ291bnRCZWZvcmVTZXNzaW9ucyA9IGFnZW50SG9zdC5yb290U3RhdGVMaXN0ZW5lckNvdW50O1xuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDA7IGkrKykge1xuXHRcdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIGBsaXN0ZW5lci0ke2l9YCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnMgPSBhZ2VudEhvc3Qucm9vdFN0YXRlTGlzdGVuZXJDb3VudDtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFt7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSB9IH0gfSBhcyBBZ2VudEluZm9dKTtcblx0XHRjb25zdCBzdXBwb3J0c011bHRpcGxlQ2hhdHNBZnRlckh5ZHJhdGlvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uY2FwYWJpbGl0aWVzLmdldCgpLnN1cHBvcnRzTXVsdGlwbGVDaGF0cztcblx0XHRhZ2VudEhvc3Quc2V0Um9vdFN0YXRlRXJyb3IoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdGVuZXJDb3VudEJlZm9yZVNlc3Npb25zLFxuXHRcdFx0bGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnMsXG5cdFx0XHRzZXNzaW9uQ291bnQ6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJIeWRyYXRpb24sXG5cdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHNBZnRlckVycm9yOiBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsXG5cdFx0fSwge1xuXHRcdFx0bGlzdGVuZXJDb3VudEJlZm9yZVNlc3Npb25zOiAxLFxuXHRcdFx0bGlzdGVuZXJDb3VudEFmdGVyU2Vzc2lvbnM6IDEsXG5cdFx0XHRzZXNzaW9uQ291bnQ6IDIwMCxcblx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0c0FmdGVySHlkcmF0aW9uOiB0cnVlLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzQWZ0ZXJFcnJvcjogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm8gc2Vzc2lvbiB0eXBlcyBiZWZvcmUgcm9vdFN0YXRlIGh5ZHJhdGVzJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5jbGVhclJvb3RTdGF0ZSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLnNlc3Npb25UeXBlcywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWJpbmRzIHNlc3Npb24gdHlwZXMgd2hlbiBBZ2VudCBIb3N0IHN0YXJ0cyB3aXRoIGEgbmV3IHJvb3Qgc3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5jbGVhclJvb3RTdGF0ZSgpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0bGV0IGFkZGVkU2Vzc2lvbnMgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGV2ZW50ID0+IGFkZGVkU2Vzc2lvbnMgKz0gZXZlbnQuYWRkZWQubGVuZ3RoKSk7XG5cblx0XHRhZ2VudEhvc3QucmVwbGFjZVJvb3RTdGF0ZU9uU3RhcnQoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdhZnRlci1yZWJpbmQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvblR5cGVzOiBwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHR5cGUgPT4gKHsgaWQ6IHR5cGUuaWQsIGxhYmVsOiB0eXBlLmxhYmVsIH0pKSxcblx0XHRcdHJvb3RTdGF0ZUxpc3RlbmVyQ291bnQ6IGFnZW50SG9zdC5yb290U3RhdGVMaXN0ZW5lckNvdW50LFxuXHRcdFx0YWRkZWRTZXNzaW9ucyxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uVHlwZXM6IFt7IGlkOiAnY29waWxvdGNsaScsIGxhYmVsOiAnQ29waWxvdCcgfV0sXG5cdFx0XHRyb290U3RhdGVMaXN0ZW5lckNvdW50OiAxLFxuXHRcdFx0YWRkZWRTZXNzaW9uczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZHVwbGljYXRlIGxpc3RlbmVycyB3aGVuIEFnZW50IEhvc3Qgc3RhcnRzIGFmdGVyIGxpc3RlbmVycyBiaW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0bGV0IGFkZGVkU2Vzc2lvbnMgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGV2ZW50ID0+IGFkZGVkU2Vzc2lvbnMgKz0gZXZlbnQuYWRkZWQubGVuZ3RoKSk7XG5cblx0XHRhZ2VudEhvc3QuZmlyZUFnZW50SG9zdFN0YXJ0KCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdhZnRlci1zdGFydCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyb290U3RhdGVMaXN0ZW5lckNvdW50OiBhZ2VudEhvc3Qucm9vdFN0YXRlTGlzdGVuZXJDb3VudCxcblx0XHRcdGFkZGVkU2Vzc2lvbnMsXG5cdFx0fSwge1xuXHRcdFx0cm9vdFN0YXRlTGlzdGVuZXJDb3VudDogMSxcblx0XHRcdGFkZGVkU2Vzc2lvbnM6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlcG9ydHMgbm8gc2Vzc2lvbiB0eXBlcyB3aGVuIHJvb3RTdGF0ZSBhZHZlcnRpc2VzIG5vIGFnZW50cycsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVwb3J0cyBubyBzZXNzaW9uIHR5cGVzIGFmdGVyIHJvb3RTdGF0ZSByZXNvbHZlcyB0byBhbiBlcnJvcicsICgpID0+IHtcblx0XHRhZ2VudEhvc3QuY2xlYXJSb290U3RhdGUoKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLCBbXSk7XG5cblx0XHRhZ2VudEhvc3Quc2V0Um9vdFN0YXRlRXJyb3IoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gdHlwZSBpY29ucyB1c2UgcGVyLWFnZW50IGNvZGljb25zJywgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnb3BlbmFpJywgZGlzcGxheU5hbWU6ICdPcGVuQUknLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAndW5rbm93bi1hZ2VudCcsIGRpc3BsYXlOYW1lOiAnVW5rbm93bicsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gKHsgaWQ6IHQuaWQsIGljb246IHQuaWNvbi5pZCB9KSksXG5cdFx0XHRbXG5cdFx0XHRcdHsgaWQ6ICdjb3BpbG90Y2xpJywgaWNvbjogJ2NvcGlsb3QnIH0sXG5cdFx0XHRcdHsgaWQ6ICdjbGF1ZGUnLCBpY29uOiAnY2xhdWRlJyB9LFxuXHRcdFx0XHR7IGlkOiAnb3BlbmFpJywgaWNvbjogJ29wZW5haScgfSxcblx0XHRcdFx0eyBpZDogJ3Vua25vd24tYWdlbnQnLCBpY29uOiAndm0nIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIGZpcmVDb25maWdDaGFuZ2UoY29uZmlnU2VydmljZTogVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLCBzZXR0aW5nSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdGNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uRW1pdHRlci5maXJlKHtcblx0XHRcdHNvdXJjZTogQ29uZmlndXJhdGlvblRhcmdldC5VU0VSLFxuXHRcdFx0YWZmZWN0ZWRLZXlzOiBuZXcgU2V0KFtzZXR0aW5nSWRdKSxcblx0XHRcdGNoYW5nZTogeyBrZXlzOiBbc2V0dGluZ0lkXSwgb3ZlcnJpZGVzOiBbXSB9LFxuXHRcdFx0YWZmZWN0c0NvbmZpZ3VyYXRpb246IChrZXk6IHN0cmluZykgPT4ga2V5ID09PSBzZXR0aW5nSWQsXG5cdFx0fSk7XG5cdH1cblxuXHR0ZXN0KCdyZWNvbXB1dGVzIHByb3RlY3Rpb24gZm9yIGEgc2VsZWN0ZWQgbm9uLWRlZmF1bHQgYmFzZSBicmFuY2ggd2hlbiBjb25maWd1cmF0aW9uIGNoYW5nZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdnaXQuYnJhbmNoUHJvdGVjdGlvbicsIFtdKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdicmFuY2gtcHJvdGVjdGlvbicsIHtcblx0XHRcdHN1bW1hcnk6ICdCcmFuY2ggUHJvdGVjdGlvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLmZpbGUoJy9yZXBvJyksIGRpc3BsYXlOYW1lOiAncmVwbycgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFVSSS5maWxlKCcvcmVwby53b3JrdHJlZXMvc2Vzc2lvbicpLFxuXHRcdH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnRpdGxlLmdldCgpID09PSAnQnJhbmNoIFByb3RlY3Rpb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnYnJhbmNoLXByb3RlY3Rpb24nLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0JyYW5jaCBQcm90ZWN0aW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBicmFuY2hOYW1lOiAnYWdlbnRzL3Nlc3Npb24nLCBiYXNlQnJhbmNoTmFtZTogJ3JlbGVhc2UnIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlcG9zaXRvcnkgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeTtcblx0XHRjb25zdCBiZWZvcmUgPSByZXBvc2l0b3J5Py5iYXNlQnJhbmNoUHJvdGVjdGVkO1xuXG5cdFx0YXdhaXQgY29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZ2l0LmJyYW5jaFByb3RlY3Rpb24nLCBbJ3JlbGVhc2UnXSk7XG5cdFx0ZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlLCAnZ2l0LmJyYW5jaFByb3RlY3Rpb24nKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YmVmb3JlLFxuXHRcdFx0YWZ0ZXI6IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5iYXNlQnJhbmNoUHJvdGVjdGVkLFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZTogZmFsc2UsXG5cdFx0XHRhZnRlcjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWx3YXlzIGFkdmVydGlzZXMgYWdlbnQtaG9zdCBDbGF1ZGUnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubWFwKHQgPT4gdC5pZCksIFsnY29waWxvdGNsaScsICdjbGF1ZGUnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dhdGVzIGFnZW50LWhvc3QgQ29kZXggaW4gdGhlIEFnZW50cyB3aW5kb3cgb24gdGhlIHByb3ZpZGVyIGVuYWJsZW1lbnQgc2V0dGluZycsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NvZGV4JywgZGlzcGxheU5hbWU6ICdDb2RleCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIGZhbHNlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSwgaXNTZXNzaW9uc1dpbmRvdzogdHJ1ZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuc2Vzc2lvblR5cGVzLm1hcCh0ID0+IHQuaWQpLCBbJ2NvcGlsb3RjbGknXSk7XG5cblx0XHRsZXQgc2Vzc2lvblR5cGVzQ2hhbmdlZCA9IGZhbHNlO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25UeXBlcygoKSA9PiB7IHNlc3Npb25UeXBlc0NoYW5nZWQgPSB0cnVlOyB9KSk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbihBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCwgdHJ1ZSk7XG5cdFx0ZmlyZUNvbmZpZ0NoYW5nZShjb25maWdTZXJ2aWNlLCBBZ2VudEhvc3RDb2RleEFnZW50RW5hYmxlZFNldHRpbmdJZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25UeXBlc0NoYW5nZWQsXG5cdFx0XHRzZXNzaW9uVHlwZXM6IHByb3ZpZGVyLnNlc3Npb25UeXBlcy5tYXAodCA9PiB0LmlkKSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uVHlwZXNDaGFuZ2VkOiB0cnVlLFxuXHRcdFx0c2Vzc2lvblR5cGVzOiBbJ2NvcGlsb3RjbGknLCAnY29kZXgnXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbnMgaW5jbHVkZXMgYWdlbnQtaG9zdCBDbGF1ZGUgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRcdHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBkaXNwbGF5TmFtZTogJ0NsYXVkZScsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSB9IGFzIEFnZW50SW5mbyxcblx0XHRdKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xpLXNlc3MnLCB7IHRpdGxlOiAnQ0xJJywgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zZXNzJywgeyB0aXRsZTogJ0NsYXVkZScsIHByb3ZpZGVyOiAnY2xhdWRlJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpLm1hcChzID0+IHMuc2Vzc2lvblR5cGUpLnNvcnQoKSxcblx0XHRcdFsnY2xhdWRlJywgJ2NvcGlsb3RjbGknXSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGljb25zIG1hdGNoIHRoZSBzZXNzaW9uIHR5cGUgaWNvbicsICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0eyBwcm92aWRlcjogJ3Vua25vd24tYWdlbnQnLCBkaXNwbGF5TmFtZTogJ1Vua25vd24nLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsaS1zZXNzJywgeyB0aXRsZTogJ0NMSScsIHByb3ZpZGVyOiAnY29waWxvdGNsaScgfSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdjbGF1ZGUtc2VzcycsIHsgdGl0bGU6ICdDbGF1ZGUnLCBwcm92aWRlcjogJ2NsYXVkZScgfSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICd1bmtub3duLXNlc3MnLCB7IHRpdGxlOiAnVW5rbm93bicsIHByb3ZpZGVyOiAndW5rbm93bi1hZ2VudCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiAoeyBzZXNzaW9uVHlwZTogcy5zZXNzaW9uVHlwZSwgaWNvbjogcy5pY29uLmlkIH0pKS5zb3J0KChhLCBiKSA9PiBhLnNlc3Npb25UeXBlLmxvY2FsZUNvbXBhcmUoYi5zZXNzaW9uVHlwZSkpLFxuXHRcdFx0W1xuXHRcdFx0XHR7IHNlc3Npb25UeXBlOiAnY2xhdWRlJywgaWNvbjogJ2NsYXVkZScgfSxcblx0XHRcdFx0eyBzZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknLCBpY29uOiAnY29waWxvdCcgfSxcblx0XHRcdFx0eyBzZXNzaW9uVHlwZTogJ3Vua25vd24tYWdlbnQnLCBpY29uOiAndm0nIH0sXG5cdFx0XHRdLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gV29ya3NwYWNlIHJlc29sdXRpb24gLS0tLS0tLVxuXG5cdHRlc3QoJ3Jlc29sdmVXb3Jrc3BhY2UgYnVpbGRzIHdvcmtzcGFjZSBmcm9tIFVSSScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpO1xuXHRcdGNvbnN0IHdzID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZSh1cmkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdzLCAncmVzb2x2ZVdvcmtzcGFjZSBzaG91bGQgcmVzb2x2ZSBmaWxlOi8vIFVSSXMnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MubGFiZWwsICdwcm9qZWN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdzLmZvbGRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MuZm9sZGVyc1swXS5yb290LnRvU3RyaW5nKCksIHVyaS50b1N0cmluZygpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod3MucmVxdWlyZXNXb3Jrc3BhY2VUcnVzdCwgdHJ1ZSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gQnJvd3NlIGFjdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ2hhcyBubyBicm93c2UgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmJyb3dzZUFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpc3RpbmcgdmlhIG5vdGlmaWNhdGlvbnMgLS0tLS0tLVxuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlU2Vzc2lvbnMgZmlyZXMgd2hlbiBzZXNzaW9uIGFkZGVkIG5vdGlmaWNhdGlvbiBhcnJpdmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbm90aWYtMScsIHsgdGl0bGU6ICdOb3RpZiBTZXNzaW9uJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMF0uYWRkZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS5hZGRlZFswXS50aXRsZS5nZXQoKSwgJ05vdGlmIFNlc3Npb24nKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiByZW1vdmVkIG5vdGlmaWNhdGlvbiBjbGVhcnMgY2FjaGUgYW5kIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICd0by1yZW1vdmUnLCB7IHRpdGxlOiAnUmVtb3ZlZCcgfSk7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSBSZWZsZWN0LmdldChwcm92aWRlciwgJ19tZXRhQnlSYXdJZCcpIGFzIE1hcDxzdHJpbmcsIElBZ2VudFNlc3Npb25NZXRhZGF0YT47XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0ZmlyZVNlc3Npb25SZW1vdmVkKGFnZW50SG9zdCwgJ3RvLXJlbW92ZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1vdmVkOiBjaGFuZ2VzWzBdPy5yZW1vdmVkLmxlbmd0aCxcblx0XHRcdHNlc3Npb246IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZW1vdmVkJyksXG5cdFx0XHRtZXRhZGF0YTogbWV0YWRhdGEuZ2V0KCd0by1yZW1vdmUnKSxcblx0XHR9LCB7XG5cdFx0XHRyZW1vdmVkOiAxLFxuXHRcdFx0c2Vzc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0bWV0YWRhdGE6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaWRlbnRpY2FsIHNlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGlzIGlnbm9yZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2R1cC1zZXNzJywgeyB0aXRsZTogJ0R1cCcsIGNyZWF0ZWRBdDogdGltZXN0YW1wLCBtb2RpZmllZEF0OiB0aW1lc3RhbXAgfSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdkdXAtc2VzcycsIHsgdGl0bGU6ICdEdXAnLCBjcmVhdGVkQXQ6IHRpbWVzdGFtcCwgbW9kaWZpZWRBdDogdGltZXN0YW1wIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3Zpbmcgbm9uLWV4aXN0ZW50IHNlc3Npb24gaXMgbm8tb3AnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0ZmlyZVNlc3Npb25SZW1vdmVkKGFnZW50SG9zdCwgJ2RvZXMtbm90LWV4aXN0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gbGlzdGluZyB2aWEgcmVmcmVzaCAtLS0tLS0tXG5cblx0dGVzdCgnc2Vzc2lvbiBhZGRlZCBhdXRob3JpdGF0aXZlbHkgdXBkYXRlcyBhIGxpc3RlZCBzZXNzaW9uIGluIHBsYWNlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgb3JpZ2luYWxQcm9qZWN0ID0gVVJJLnBhcnNlKCdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnKTtcblx0XHRjb25zdCBvcmlnaW5hbFdvcmtpbmdEaXJlY3RvcnkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vVXNlcnMvbWUvcHJvamVjdCcpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dvcmt0cmVlLXVwc2VydCcsIHtcblx0XHRcdHN1bW1hcnk6ICdXb3JrdHJlZSBTZXNzaW9uJyxcblx0XHRcdHByb2plY3Q6IHsgdXJpOiBvcmlnaW5hbFByb2plY3QsIGRpc3BsYXlOYW1lOiAncHJvamVjdCcgfSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IG9yaWdpbmFsV29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdG1vZGlmaWVkVGltZTogMTAwMCxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXSE7XG5cdFx0Y29uc3Qgb3JpZ2luYWxXb3Jrc3BhY2UgPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSE7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IHdvcmt0cmVlUHJvamVjdCA9ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3Qud29ya3RyZWVzL3Nlc3Npb24nO1xuXHRcdGNvbnN0IHdvcmt0cmVlV29ya2luZ0RpcmVjdG9yeSA9ICdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3Qud29ya3RyZWVzL3Nlc3Npb24vc3JjJztcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3dvcmt0cmVlLXVwc2VydCcsIHtcblx0XHRcdHRpdGxlOiAnV29ya3RyZWUgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogd29ya3RyZWVQcm9qZWN0LCBkaXNwbGF5TmFtZTogJ3Byb2plY3Qtd29ya3RyZWUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3JrdHJlZVdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDEwMDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgyMDAwKS50b0lTT1N0cmluZygpLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uU3VtbWFyeUNoYW5nZWQoYWdlbnRIb3N0LCAnd29ya3RyZWUtdXBzZXJ0Jywge1xuXHRcdFx0X21ldGE6IHsgZ2l0OiB7IGJyYW5jaE5hbWU6ICdhZ2VudHMvd29ya3RyZWUtc2Vzc2lvbicsIGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY3VycmVudCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0hO1xuXHRcdGNvbnN0IGN1cnJlbnRXb3Jrc3BhY2UgPSBjdXJyZW50LndvcmtzcGFjZS5nZXQoKSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYW1lQWRhcHRlcjogY3VycmVudCA9PT0gc2Vzc2lvbixcblx0XHRcdG9yaWdpbmFsV29ya2luZ0RpcmVjdG9yeTogb3JpZ2luYWxXb3Jrc3BhY2UuZm9sZGVyc1swXS53b3JraW5nRGlyZWN0b3J5LnRvU3RyaW5nKCksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBjdXJyZW50V29ya3NwYWNlLmZvbGRlcnNbMF0ud29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpLFxuXHRcdFx0YnJhbmNoTmFtZTogY3VycmVudFdvcmtzcGFjZS5mb2xkZXJzWzBdLmdpdFJlcG9zaXRvcnk/LmJyYW5jaE5hbWUsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gY2hhbmdlLmNoYW5nZWQubWFwKGNoYW5nZWQgPT4gY2hhbmdlZCA9PT0gc2Vzc2lvbikpLFxuXHRcdH0sIHtcblx0XHRcdHNhbWVBZGFwdGVyOiB0cnVlLFxuXHRcdFx0b3JpZ2luYWxXb3JraW5nRGlyZWN0b3J5OiBvcmlnaW5hbFdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmt0cmVlV29ya2luZ0RpcmVjdG9yeSxcblx0XHRcdGJyYW5jaE5hbWU6ICdhZ2VudHMvd29ya3RyZWUtc2Vzc2lvbicsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBbW3RydWVdLCBbdHJ1ZV1dLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBtZXRhZGF0YSBjaGFuZ2VzIG5vdGlmeSB3aGVuIG9ic2VydmFibGUgZ2l0IGZpZWxkcyBjaGFuZ2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdnaXQtbWV0YScsIHtcblx0XHRcdHN1bW1hcnk6ICdHaXQgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL1VzZXJzL21lL3Byb2plY3QnKSwgZGlzcGxheU5hbWU6ICdwcm9qZWN0JyB9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdITtcblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRnaXQ6IHtcblx0XHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvd29ya3RyZWUnLFxuXHRcdFx0XHRiYXNlQnJhbmNoTmFtZTogJ21haW4nLFxuXHRcdFx0XHRoYXNHaXRIdWJSZW1vdGU6IHRydWUsXG5cdFx0XHRcdHVwc3RyZWFtQnJhbmNoTmFtZTogJ29yaWdpbi9mZWF0dXJlL3dvcmt0cmVlJyxcblx0XHRcdFx0aW5jb21pbmdDaGFuZ2VzOiAyLFxuXHRcdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDMsXG5cdFx0XHRcdHVuY29tbWl0dGVkQ2hhbmdlczogNCxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGZpcmVTZXNzaW9uTWV0YUNoYW5nZWQoYWdlbnRIb3N0LCAnZ2l0LW1ldGEnLCBtZXRhKTtcblx0XHRmaXJlU2Vzc2lvbk1ldGFDaGFuZ2VkKGFnZW50SG9zdCwgJ2dpdC1tZXRhJywgbWV0YSk7XG5cblx0XHRjb25zdCBnaXRSZXBvc2l0b3J5ID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0uZ2l0UmVwb3NpdG9yeSE7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRicmFuY2hOYW1lOiBnaXRSZXBvc2l0b3J5LmJyYW5jaE5hbWUsXG5cdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IGdpdFJlcG9zaXRvcnkudW5jb21taXR0ZWRDaGFuZ2VzLFxuXHRcdFx0Y2hhbmdlZEV2ZW50czogY2hhbmdlcy5tYXAoY2hhbmdlID0+IGNoYW5nZS5jaGFuZ2VkLm1hcChjaGFuZ2VkID0+IGNoYW5nZWQgPT09IHNlc3Npb24pKSxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS93b3JrdHJlZScsXG5cdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDQsXG5cdFx0XHRjaGFuZ2VkRXZlbnRzOiBbW3RydWVdXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25zIHBvcHVsYXRlcyBmcm9tIGxpc3RTZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2xpc3QtMScsIHsgc3VtbWFyeTogJ0ZpcnN0JyB9KSk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignbGlzdC0yJywgeyBzdW1tYXJ5OiAnU2Vjb25kJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cdH0pKTtcblxuXHR0ZXN0KCdlYWdlcmx5IHBvcHVsYXRlcyBhbmQgZmlyZXMgb25EaWRDaGFuZ2VTZXNzaW9ucyBhZnRlciBjb25zdHJ1Y3Rpb24gd2l0aG91dCBhIGdldFNlc3Npb25zKCkgY2FsbCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2VhZ2VyLTEnLCB7IHN1bW1hcnk6ICdGaXJzdCcgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2VhZ2VyLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBlYWdlciBsaXN0U2Vzc2lvbnMoKSB0cmlnZ2VyZWQgYnkgdGhlIGNvbnN0cnVjdG9yLlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdHJlbW92ZWQ6IGNoYW5nZXNbMF0/LnJlbW92ZWQubGVuZ3RoLFxuXHRcdFx0Y2hhbmdlZDogY2hhbmdlc1swXT8uY2hhbmdlZC5sZW5ndGgsXG5cdFx0XHRjYWNoZWRUaXRsZXM6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSkuc29ydCgpLFxuXHRcdH0sIHtcblx0XHRcdGV2ZW50Q291bnQ6IDEsXG5cdFx0XHRhZGRlZDogWydGaXJzdCcsICdTZWNvbmQnXSxcblx0XHRcdHJlbW92ZWQ6IDAsXG5cdFx0XHRjaGFuZ2VkOiAwLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnZGVmZXJzIGVhZ2VyIHNlc3Npb24gbGlzdCBmZXRjaCB1bnRpbCBhdXRoZW50aWNhdGlvbiBzZXR0bGVzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gU2ltdWxhdGUgZnJlc2ggbGF1bmNoOiBhdXRoIGlzIHBlbmRpbmcgYW5kIHRoZSBhZ2VudCBob3N0IGhhcyBub1xuXHRcdC8vIHNlc3Npb25zIHlldCAocmV0dXJucyBbXSksIHRoZW4gYXV0aCBjb21wbGV0ZXMgYW5kIHRoZSByZWFsIHNlc3Npb25cblx0XHQvLyBsaXN0IGJlY29tZXMgYXZhaWxhYmxlLlxuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gZXZlbnQgc2hvdWxkIGZpcmUgd2hpbGUgYXV0aGVudGljYXRpb24gaXMgcGVuZGluZycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ25vIHNlc3Npb25zIHNob3VsZCBiZSBjYWNoZWQgd2hpbGUgYXV0aGVudGljYXRpb24gaXMgcGVuZGluZycpO1xuXG5cdFx0Ly8gQXV0aCBjb21wbGV0ZXM7IHNlc3Npb25zIGJlY29tZSBhdmFpbGFibGUgb24gdGhlIGFnZW50IGhvc3QuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignYWZ0ZXItYXV0aC0xJywgeyBzdW1tYXJ5OiAnRmlyc3QnIH0pKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhZnRlci1hdXRoLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGFkZGVkOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVjb3ZlcnMgYW4gZW1wdHkgbGlzdCB3aGVuIHRoZSBpbml0aWFsIGxpc3RTZXNzaW9ucyBmYWlscywgd2l0aG91dCBuZWVkaW5nIGEgbmV3IHNlc3Npb24nLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBGcmVzaCBsYXVuY2g6IHRoZSBhZ2VudCB0aHJvd3Mgb24gdGhlIGZpcnN0IGxpc3RTZXNzaW9ucygpIChlLmcuXG5cdFx0Ly8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIGl0cyB0b2tlbiBpcyBlZmZlY3RpdmUsIG9yIGEgdHJhbnNpZW50XG5cdFx0Ly8gb2ZmbGluZSBlcnJvcikuIFRoZSBzZXNzaW9ucyByZWFsbHkgZXhpc3Qgb24gdGhlIGhvc3QuXG5cdFx0YWdlbnRIb3N0LmZhaWxMaXN0U2Vzc2lvbnNDb3VudCA9IDE7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignaGVhbC0xJywgeyBzdW1tYXJ5OiAnRmlyc3QnIH0pKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdoZWFsLTInLCB7IHN1bW1hcnk6ICdTZWNvbmQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdC8vIFRoZSBlYWdlciByZWZyZXNoIGZpcmVzIGFuZCBmYWlsczsgbm90aGluZyBpcyBjYWNoZWQgeWV0LlxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gZXZlbnQgc2hvdWxkIGZpcmUgYWZ0ZXIgYSBmYWlsZWQgaW5pdGlhbCByZWZyZXNoJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwLCAnY2FjaGUgc3RheXMgZW1wdHkgYWZ0ZXIgYSBmYWlsZWQgaW5pdGlhbCByZWZyZXNoJyk7XG5cblx0XHQvLyBUaGUgYmFja29mZiByZXRyeSAobWluIDFzKSBmaXJlcyBvbiBpdHMgb3duIFx1MjAxNCBubyBDaGF0VHVybkNvbXBsZXRlXG5cdFx0Ly8gb3Igc2Vzc2lvbkFkZGVkIG5lZWRlZCBcdTIwMTQgYW5kIHRoZSBsaXN0IHNlbGYtaGVhbHMuXG5cdFx0YXdhaXQgdGltZW91dCgxXzEwMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGV2ZW50Q291bnQ6IGNoYW5nZXMubGVuZ3RoLFxuXHRcdFx0YWRkZWQ6IGNoYW5nZXNbMF0/LmFkZGVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpLnNvcnQoKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGFkZGVkOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdFx0Y2FjaGVkVGl0bGVzOiBbJ0ZpcnN0JywgJ1NlY29uZCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSBzZXNzaW9uIHdob3NlIGFnZW50IHJlcG9ydHMgbm90aGluZyBzdXJ2aXZlcyB0aGUgcmVmcmVzaCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFRoZSBob3N0IGFnZ3JlZ2F0ZXMgb25lIGxpc3RpbmcgYWNyb3NzIGFsbCBvZiBpdHMgYWdlbnRzLCBhbmQgYW5cblx0XHQvLyBhZ2VudCB0aGF0IGNhbm5vdCBlbnVtZXJhdGUgeWV0IChTREsgbm90IGRvd25sb2FkZWQpIGNvbnRyaWJ1dGVzIGFuXG5cdFx0Ly8gZW1wdHkgbGlzdCBpbnN0ZWFkIG9mIGZhaWxpbmcuIENvZGV4IGdvaW5nIHF1aWV0IG11c3Qgbm90IGV2aWN0IGl0c1xuXHRcdC8vIHNlc3Npb25zOiBgcmVtb3ZlZGAgaXMgdHJlYXRlZCBhcyBhIGRlZmluaXRpdmUgZGVsZXRpb24gZG93bnN0cmVhbVxuXHRcdC8vIGFuZCB3b3VsZCBkaXNjYXJkIHRoZSB1c2VyJ3MgcGlucyBhbmQgZ3JvdXBzLlxuXHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW1xuXHRcdFx0eyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY29kZXgnLCBkaXNwbGF5TmFtZTogJ0NvZGV4JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKEFnZW50SG9zdENvZGV4QWdlbnRFbmFibGVkU2V0dGluZ0lkLCB0cnVlKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjb2RleC0xJywgeyBwcm92aWRlcjogJ2NvZGV4Jywgc3VtbWFyeTogJ0NvZGV4IE9uZScgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS0xJywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnQ0xJIE9uZScgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2UgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhZ2VudEhvc3Quc3RvcExpc3RpbmdTZXNzaW9ucygnY29kZXgtMScpO1xuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjbGktMScpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlZDogY2hhbmdlcy5mbGF0TWFwKGMgPT4gYy5yZW1vdmVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlZDogW10sXG5cdFx0XHRjYWNoZWRUaXRsZXM6IFsnQ0xJIE9uZScsICdDb2RleCBPbmUnXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Egc2Vzc2lvbiBtaXNzaW5nIHdoaWxlIGl0cyBhZ2VudCBzdGlsbCByZXBvcnRzIG90aGVycyBpcyBldmljdGVkJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhlIGFnZW50IGFuc3dlcmVkIGFuZCBsaXN0ZWQgYSBzaWJsaW5nIHNlc3Npb24sIHNvIGl0cyBuYW1lc3BhY2UgaXNcblx0XHQvLyBrbm93bjogdGhlIG1pc3Npbmcgc2Vzc2lvbiByZWFsbHkgaXMgZ29uZSBhbmQgbXVzdCBiZSBldmljdGVkLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS1nb25lJywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnR29uZScgfSkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2NsaS1rZXB0JywgeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBzdW1tYXJ5OiAnS2VwdCcgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGFnZW50SG9zdC5zdG9wTGlzdGluZ1Nlc3Npb25zKCdjbGktZ29uZScpO1xuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjbGkta2VwdCcpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVtb3ZlZDogY2hhbmdlcy5mbGF0TWFwKGMgPT4gYy5yZW1vdmVkLm1hcChzID0+IHMudGl0bGUuZ2V0KCkpKSxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVtb3ZlZDogWydHb25lJ10sXG5cdFx0XHRjYWNoZWRUaXRsZXM6IFsnS2VwdCddLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSBzdWNjZXNzZnVsIGVtcHR5IGxpc3RTZXNzaW9ucyBhcm1zIG5vIHJldHJ5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gTm8gc2Vzc2lvbnMgb24gdGhlIGhvc3Q6IGxpc3RTZXNzaW9ucygpIHN1Y2NlZWRzIHdpdGggW10uIFRoaXMgaXMgYVxuXHRcdC8vIHZhbGlkIHJlc3VsdCwgbm90IGEgZmFpbHVyZSBcdTIwMTQgdGhlIGNhY2hlIHNob3VsZCBiZSBtYXJrZWQgaW5pdGlhbGl6ZWRcblx0XHQvLyBhbmQgbm8gYmFja2dyb3VuZCByZXRyeSBzaG91bGQgYmUgc2NoZWR1bGVkLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgY2FsbHNBZnRlckVhZ2VyTG9hZCA9IGFnZW50SG9zdC5saXN0U2Vzc2lvbnNDYWxsQ291bnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNhbGxzQWZ0ZXJFYWdlckxvYWQsIDEsICdleGFjdGx5IG9uZSBlYWdlciBsaXN0U2Vzc2lvbnMgY2FsbCcpO1xuXG5cdFx0Ly8gQWR2YW5jZSB3ZWxsIHBhc3QgdGhlIG1heCBiYWNrb2ZmIHdpbmRvdzsgbm8gcmV0cnkgc2hvdWxkIGZpcmUuXG5cdFx0YXdhaXQgdGltZW91dCg2MF8wMDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5saXN0U2Vzc2lvbnNDYWxsQ291bnQsIGNhbGxzQWZ0ZXJFYWdlckxvYWQsICdubyByZXRyeSBzaG91bGQgYmUgc2NoZWR1bGVkIGFmdGVyIGEgc3VjY2Vzc2Z1bCBlbXB0eSBsaXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMubGVuZ3RoLCAwLCAnbm8gY2hhbmdlIGV2ZW50IGZvciBhbiBlbXB0eSBsaXN0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JldHJpZXMgd2l0aCBiYWNrb2ZmIHVudGlsIGxpc3RTZXNzaW9ucyBzdWNjZWVkcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEZpcnN0IHR3byBhdHRlbXB0cyBmYWlsLCB0aGlyZCBzdWNjZWVkcy4gVmVyaWZpZXMgdGhlIHJldHJ5IGtlZXBzXG5cdFx0Ly8gcmUtYXJtaW5nIHJhdGhlciB0aGFuIGdpdmluZyB1cCBhZnRlciBhIHNpbmdsZSBmYWlsZWQgYXR0ZW1wdC5cblx0XHRhZ2VudEhvc3QuZmFpbExpc3RTZXNzaW9uc0NvdW50ID0gMjtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdiYWNrb2ZmLTEnLCB7IHN1bW1hcnk6ICdPbmx5JyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ2VtcHR5IGFmdGVyIGZpcnN0IGZhaWx1cmUnKTtcblxuXHRcdC8vIEZpcnN0IHJldHJ5ICh+MXMpIFx1MjAxNCBzdGlsbCBmYWlsaW5nLlxuXHRcdGF3YWl0IHRpbWVvdXQoMV8xMDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMCwgJ2VtcHR5IGFmdGVyIHNlY29uZCBmYWlsdXJlJyk7XG5cblx0XHQvLyBTZWNvbmQgcmV0cnkgKH4ycyBiYWNrb2ZmKSBcdTIwMTQgbm93IHN1Y2NlZWRzLlxuXHRcdGF3YWl0IHRpbWVvdXQoMl8yMDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRldmVudENvdW50OiBjaGFuZ2VzLmxlbmd0aCxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRDb3VudDogMSxcblx0XHRcdGNhY2hlZFRpdGxlczogWydPbmx5J10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIFN0YXJ0dXAgc2Vzc2lvbiBjYWNoZSAocGVyc2lzdGVuY2UpIC0tLS0tLS1cblxuXHR0ZXN0KCdoeWRyYXRlcyBwZXJzaXN0ZWQgc2Vzc2lvbnMgb24gc3RhcnR1cCBiZWZvcmUgdGhlIGxpdmUgbGlzdCBpcyBhdmFpbGFibGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignY2FjaGVkLTEnLCB7IHN1bW1hcnk6ICdDYWNoZWQgT25lJyB9KV0pO1xuXG5cdFx0Ly8gRnJlc2ggbGF1bmNoOiBhdXRoZW50aWNhdGlvbiBpcyBzdGlsbCBwZW5kaW5nIHNvIHRoZSBlYWdlciByZWZyZXNoIGlzXG5cdFx0Ly8gZGVmZXJyZWQsIHlldCB0aGUgcGVyc2lzdGVkIHNlc3Npb24gbXVzdCBzdXJmYWNlIGltbWVkaWF0ZWx5LlxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bGlzdFNlc3Npb25zQ2FsbHM6IG5leHRIb3N0Lmxpc3RTZXNzaW9uc0NhbGxDb3VudCxcblx0XHRcdGNhY2hlZFRpdGxlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKSxcblx0XHR9LCB7XG5cdFx0XHRsaXN0U2Vzc2lvbnNDYWxsczogMCxcblx0XHRcdGNhY2hlZFRpdGxlczogWydDYWNoZWQgT25lJ10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkaXNjYXJkcyBhIGxlZ2FjeSBjYWNoZSBlbnRyeSBzbyByZWFkIHN0YXRlIGlzIHJlYnVpbHQgZnJvbSB0aGUgaG9zdCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFN0b3JhZ2Uta2V5IGxpdGVyYWxzIG9mIHRoZSBwcmUtYC52MmAgY2FjaGUgc2NoZW1hLCB3aG9zZSBlbnRyaWVzXG5cdFx0Ly8gY2FycmllZCBhIHN0YWxlIGBpc1JlYWQ6IHRydWVgIHdyaXR0ZW4gYnkgdGhlIG9sZCBhbHdheXMtcmVhZCBhZGFwdGVyLlxuXHRcdGNvbnN0IExFR0FDWV9LRVkgPSAnbG9jYWxBZ2VudEhvc3QuY2FjaGVkU2Vzc2lvbnMnO1xuXHRcdGNvbnN0IENVUlJFTlRfS0VZID0gJ2xvY2FsQWdlbnRIb3N0LmNhY2hlZFNlc3Npb25zLnYyJztcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdC8vIFNpbXVsYXRlIGEgcHJldmlvdXMgKG9sZC1zY2hlbWEpIHdpbmRvdzogcGVyc2lzdCBhIHNlc3Npb24sIHRoZW4gbW92ZVxuXHRcdC8vIHRoZSBzbmFwc2hvdCB0byB0aGUgbGVnYWN5IGtleSBhcyB0aGUgb2xkIGJ1aWxkIHdvdWxkIGhhdmUgd3JpdHRlbiBpdC5cblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignbGVnYWN5LTEnLCB7IHN1bW1hcnk6ICdMZWdhY3kgT25lJyB9KV0pO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gc3RvcmFnZVNlcnZpY2UuZ2V0KENVUlJFTlRfS0VZLCBTdG9yYWdlU2NvcGUuQVBQTElDQVRJT04pO1xuXHRcdGFzc2VydC5vayhzbmFwc2hvdCwgJ3ByZWNvbmRpdGlvbjogY3VycmVudC1rZXkgc25hcHNob3Qgc2hvdWxkIGV4aXN0Jyk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoTEVHQUNZX0tFWSwgc25hcHNob3QsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5VU0VSKTtcblx0XHRzdG9yYWdlU2VydmljZS5yZW1vdmUoQ1VSUkVOVF9LRVksIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTik7XG5cblx0XHQvLyBGcmVzaCBsYXVuY2ggd2l0aCBhdXRoZW50aWNhdGlvbiBwZW5kaW5nIHNvIG5vIGxpdmUgcmVmcmVzaCBydW5zOiB0aGVcblx0XHQvLyBsZWdhY3kgZW50cnkgbXVzdCBiZSBkaXNjYXJkZWQgcmF0aGVyIHRoYW4gaHlkcmF0ZWQsIGFuZCBpdHMga2V5IHJlbW92ZWQuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBuZXh0SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYWNoZWRTZXNzaW9uczogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsXG5cdFx0XHRsZWdhY3lLZXlQcmVzZW50OiBzdG9yYWdlU2VydmljZS5nZXQoTEVHQUNZX0tFWSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSAhPT0gdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGNhY2hlZFNlc3Npb25zOiAwLFxuXHRcdFx0bGVnYWN5S2V5UHJlc2VudDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjYWNoZXMgc2Vzc2lvbi1zY29wZWQgZmxhZ3MgYnV0IG5ldmVyIHRyYW5zaWVudCBhY3Rpdml0eSBiaXRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Ly8gQSBzZXNzaW9uIHRoYXQgd2FzIG1pZC10dXJuIChhbmQgdW5yZWFkKSB3aGVuIHRoZSBjYWNoZSB3YXMgZmx1c2hlZC5cblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbe1xuXHRcdFx0Li4uY3JlYXRlU2Vzc2lvbignYnVzeS0xJywgeyBzdW1tYXJ5OiAnQnVzeSBPbmUnIH0pLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyB8IFByb3RvY29sU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkLFxuXHRcdH1dKTtcblxuXHRcdC8vIEF1dGhlbnRpY2F0aW9uIHBlbmRpbmcsIHNvIG5vdGhpbmcgY29ycmVjdHMgdGhlIGh5ZHJhdGVkIHN0YXRlIFx1MjAxNCBhIHN0YWxlXG5cdFx0Ly8gc3Bpbm5lciBoZXJlIHdvdWxkIHN0aWNrIGFyb3VuZCBpbmRlZmluaXRlbHkgZm9yIGFuIHVucmVhY2hhYmxlIHJlbW90ZSBob3N0LlxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHJlc3RvcmVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogcmVzdG9yZWQuc3RhdHVzLmdldCgpLFxuXHRcdFx0aXNBcmNoaXZlZDogcmVzdG9yZWQuaXNBcmNoaXZlZC5nZXQoKSxcblx0XHRcdGlzUmVhZDogcmVzdG9yZWQuaXNSZWFkLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRpc0FyY2hpdmVkOiB0cnVlLFxuXHRcdFx0aXNSZWFkOiBmYWxzZSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2h5ZHJhdGVkIHF1aWNrIGNoYXQgc3RheXMgd29ya3NwYWNlLWxlc3MgYWZ0ZXIgcmVsb2FkIGRlc3BpdGUgYSBzY3JhdGNoIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiAjMzI0NTgxOiBhIGNvbW1pdHRlZCBxdWljayBjaGF0IHBlcnNpc3RlZCBpbnRvIHRoZSBzdGFydHVwXG5cdFx0Ly8gY2FjaGUgY2FycmllcyBhIHNjcmF0Y2ggY3dkLiBUaGUgYWRhcHRlciBzZWVkcyBpdHMgc2Vzc2lvbi1raW5kIGF0XG5cdFx0Ly8gY29uc3RydWN0aW9uIGZyb20gYF9tZXRhLndvcmtzcGFjZWxlc3NgLCBzbyB0aGUgdGFnIG11c3Qgc3Vydml2ZSB0aGVcblx0XHQvLyBzZXJpYWxpemUvZGVzZXJpYWxpemUgcm91bmQtdHJpcCBcdTIwMTQgb3RoZXJ3aXNlIHRoZSByZXN0b3JlZCBzZXNzaW9uXG5cdFx0Ly8gbGVha3MgdGhlIHNjcmF0Y2ggZGlyIGFzIGEgd29ya3NwYWNlIGZvbGRlci5cblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdxdWljay1jYWNoZWQnLCB7XG5cdFx0XHRcdHN1bW1hcnk6ICdRdWljayBDaGF0Jyxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy90bXAvY29waWxvdC1zY3JhdGNoL3F1aWNrLWNhY2hlZCcpLFxuXHRcdFx0XHRxdWlja0NoYXQ6IHRydWUsXG5cdFx0XHR9KSxcblx0XHRdKTtcblxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBBZ2VudFNlc3Npb24uaWQocy5yZXNvdXJjZS50b1N0cmluZygpKSA9PT0gJ3F1aWNrLWNhY2hlZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d29ya3NwYWNlOiBzZXNzaW9uPy53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRpc1F1aWNrQ2hhdDogc2Vzc2lvbj8uaXNRdWlja0NoYXQ/LmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdoeWRyYXRlZCBzZXNzaW9uIHByZXNlcnZlcyBtdWx0aS1yb290IG1ldGFkYXRhIGFmdGVyIHJlbG9hZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IG11bHRpUm9vdCA9IHtcblx0XHRcdHdvcmtzcGFjZUZpbGU6ICd2c2NvZGUtcmVtb3RlOi8vc3NoLXJlbW90ZStob3N0L3dvcmsvZGVtby5jb2RlLXdvcmtzcGFjZScsXG5cdFx0fTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdtdWx0aS1yb290LWNhY2hlZCcsIHsgc3VtbWFyeTogJ011bHRpIFJvb3QnLCBtdWx0aVJvb3QgfSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KS5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdG5leHRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1yb290LWNhY2hlZCcpLnRvU3RyaW5nKCksXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1VwZGF0ZWQgYWZ0ZXIgaHlkcmF0aW9uJyB9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cdFx0YXdhaXQgc3RvcmFnZVNlcnZpY2UuZmx1c2goKTtcblx0XHRjb25zdCByZXBlcnNpc3RlZCA9IEpTT04ucGFyc2Uoc3RvcmFnZVNlcnZpY2UuZ2V0KCdsb2NhbEFnZW50SG9zdC5jYWNoZWRTZXNzaW9ucy52MicsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTikhKSBhcyBBcnJheTx7IG11bHRpUm9vdD86IHR5cGVvZiBtdWx0aVJvb3QgfT47XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcGVyc2lzdGVkOiByZXBlcnNpc3RlZFswXS5tdWx0aVJvb3QsXG5cdFx0XHRoeWRyYXRlZFRpdGxlOiBzZXNzaW9uLnRpdGxlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlcGVyc2lzdGVkOiBtdWx0aVJvb3QsXG5cdFx0XHRoeWRyYXRlZFRpdGxlOiAnVXBkYXRlZCBhZnRlciBoeWRyYXRpb24nLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnYSByZWZyZXNoIHB1Ymxpc2hlcyBfbWV0YSBhbmQgc3VtbWFyeSBmaWVsZHMgYXMgb25lIGF0b21pYyB1cGRhdGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIudXBkYXRlYCBhcHBsaWVzIGBfbWV0YWAgdGhyb3VnaCBgc2V0TWV0YWAsXG5cdFx0Ly8gd2hpY2ggbXVzdCBqb2luIHRoZSBjYWxsZXIncyB0cmFuc2FjdGlvbi4gQSBwbGFpbiBgdHJhbnNhY3Rpb24oKWBcblx0XHQvLyBmaW5pc2hlcyBcdTIwMTQgYW5kIHRoZXJlZm9yZSBub3RpZmllcyBcdTIwMTQgYmVmb3JlIGB1cGRhdGVgIGhhcyBhcHBsaWVkIHRoZVxuXHRcdC8vIHJlc3Qgb2YgdGhlIHNuYXBzaG90LCBzbyBvYnNlcnZlcnMgd291bGQgc2VlIGEgdG9ybiBzdGF0ZTogdGhlIG5ld1xuXHRcdC8vIHdvcmtzcGFjZSAob3IgYSBmcmVzaCBxdWljay1jaGF0IHByb21vdGlvbikgYWxvbmdzaWRlIHRoZSBwcmV2aW91c1xuXHRcdC8vIGFyY2hpdmVkL3JlYWQgZmxhZ3MuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignYXRvbWljLTEnLCB7IHN1bW1hcnk6ICdPbmUnLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8nKSB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3Qgb2JzZXJ2ZWQ6IHsgYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGlzQXJjaGl2ZWQ6IGJvb2xlYW4gfVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdG9ic2VydmVkLnB1c2goe1xuXHRcdFx0XHRicmFuY2g6IHNlc3Npb24ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uYnJhbmNoTmFtZSxcblx0XHRcdFx0aXNBcmNoaXZlZDogc2Vzc2lvbi5pc0FyY2hpdmVkLnJlYWQocmVhZGVyKSxcblx0XHRcdH0pO1xuXHRcdH0pKTtcblxuXHRcdC8vIE9uZSByZWZyZXNoIHRoYXQgbW92ZXMgYm90aCB0aGUgYF9tZXRhYC1kZXJpdmVkIHdvcmtzcGFjZSBhbmQgYVxuXHRcdC8vIHBsYWluIHN1bW1hcnkgZmllbGQuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oe1xuXHRcdFx0Li4uY3JlYXRlU2Vzc2lvbignYXRvbWljLTEnLCB7IHN1bW1hcnk6ICdPbmUnLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8nKSB9KSxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUgfCBQcm90b2NvbFNlc3Npb25TdGF0dXMuSXNBcmNoaXZlZCxcblx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBicmFuY2hOYW1lOiAnZmVhdHVyZScgfSksXG5cdFx0fSk7XG5cdFx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2F0b21pYy0xJykudG9TdHJpbmcoKSksXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlIH0sXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHR9IGFzIEFjdGlvbkVudmVsb3BlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvYnNlcnZlZCwgW1xuXHRcdFx0eyBicmFuY2g6IHVuZGVmaW5lZCwgaXNBcmNoaXZlZDogZmFsc2UgfSxcblx0XHRcdHsgYnJhbmNoOiAnZmVhdHVyZScsIGlzQXJjaGl2ZWQ6IHRydWUgfSxcblx0XHRdKTtcblx0fSkpO1xuXG5cdHRlc3QoJ2Egc3VtbWFyeUNoYW5nZWQgbm90aWZpY2F0aW9uIHB1Ymxpc2hlcyB0aGUgY2hhbmdlIGNoaXAgYW5kIF9tZXRhIGFzIG9uZSBhdG9taWMgdXBkYXRlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gYF9oYW5kbGVTZXNzaW9uU3VtbWFyeUNoYW5nZWRgIGJhdGNoZXMgaW50byBhIHRyYW5zYWN0aW9uLCBidXQgYVxuXHRcdC8vIHNldHRlciB0aGF0IHdyaXRlcyBpdHMgb2JzZXJ2YWJsZSB3aXRob3V0IG9uZSBidWlsZHMgYW5kIGZpbmlzaGVzIGFcblx0XHQvLyB0cmFuc2FjdGlvbiBvZiBpdHMgb3duLCBub3RpZnlpbmcgaW1tZWRpYXRlbHkuIGBjaGFuZ2VzYCBpcyBhcHBsaWVkXG5cdFx0Ly8gYmVmb3JlIGBfbWV0YWAsIHNvIGFuIG9ic2VydmVyIG9mIGJvdGggd291bGQgb3RoZXJ3aXNlIHJ1biBvbmNlIG9uXG5cdFx0Ly8gdGhlIG5ldyBjaGlwIHdpdGggdGhlIHN0YWxlIHdvcmtzcGFjZSwgdGhlbiBhZ2FpbiBhdCB0aGUgb3V0ZXJcblx0XHQvLyBmaW5pc2guXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignYXRvbWljLTInLCB7IHN1bW1hcnk6ICdUd28nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3JlcG8nKSB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3Qgb2JzZXJ2ZWQ6IHsgYnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQ7IGZpbGVzOiBudW1iZXIgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdG9ic2VydmVkLnB1c2goe1xuXHRcdFx0XHRicmFuY2g6IHNlc3Npb24ud29ya3NwYWNlLnJlYWQocmVhZGVyKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uYnJhbmNoTmFtZSxcblx0XHRcdFx0ZmlsZXM6IHNlc3Npb24uY2hhbmdlc1N1bW1hcnk/LnJlYWQocmVhZGVyKT8uZmlsZXMsXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHRmaXJlU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKGFnZW50SG9zdCwgJ2F0b21pYy0yJywge1xuXHRcdFx0Y2hhbmdlczogeyBhZGRpdGlvbnM6IDMsIGRlbGV0aW9uczogMSwgZmlsZXM6IDIgfSxcblx0XHRcdF9tZXRhOiB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBicmFuY2hOYW1lOiAnZmVhdHVyZScgfSksXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2JzZXJ2ZWQsIFtcblx0XHRcdHsgYnJhbmNoOiB1bmRlZmluZWQsIGZpbGVzOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgYnJhbmNoOiAnZmVhdHVyZScsIGZpbGVzOiAyIH0sXG5cdFx0XSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdhIHN1bW1hcnlDaGFuZ2VkIGRlbHRhIGNsZWFyaW5nIHRoZSBhZG9wdGFibGUgbWFya2VyIG9wZW5zIHRoZSBwYXNzaXZlIHN0YXRlIHN1YnNjcmlwdGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgc3VyZmFjZWQtYnV0LXVuLWFkb3B0ZWQgbGVnYWN5IENvcGlsb3QgQ0xJIHNlc3Npb24gaXMgbm90IHN1YnNjcmliZWRcblx0XHQvLyBwYXNzaXZlbHkgKHN1YnNjcmliaW5nIHdvdWxkIHRyaWdnZXIgYW4gYWRvcHRpbmcgcmVzdG9yZSkuIE9uY2UgaXQgaXNcblx0XHQvLyBhZG9wdGVkLCB0aGUgaG9zdCBlbWl0cyBhIGBzdW1tYXJ5Q2hhbmdlZGAgY2xlYXJpbmcgdGhlIG1hcmtlcjsgdGhlXG5cdFx0Ly8gY2xpZW50IG11c3QgdGhlbiBvcGVuIHRoZSBzdGF0ZSBzdWJzY3JpcHRpb24gaXQgcHJldmlvdXNseSBza2lwcGVkLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2Fkb3B0LXN1YicsIHsgc3VtbWFyeTogJ0xlZ2FjeScsIGFkb3B0YWJsZTogdHJ1ZSB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0Y29uc3QgbGFzdFN0YXRlcyA9IChwcm92aWRlciBhcyB1bmtub3duIGFzIHsgX2xhc3RTZXNzaW9uU3RhdGVzOiBNYXA8c3RyaW5nLCBTZXNzaW9uU3RhdGU+IH0pLl9sYXN0U2Vzc2lvblN0YXRlcztcblxuXHRcdGNvbnN0IHN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdMZWdhY3knLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdH07XG5cdFx0Ly8gV2hpbGUgYWRvcHRhYmxlIHRoZSBjaGFubmVsIGhhcyBubyBzdWJzY3JpYmVyLCBzbyBwdXNoaW5nIGEgc3RhdGUgaGFzXG5cdFx0Ly8gbm8gZWZmZWN0IG9uIHRoZSBjbGllbnQuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnYWRvcHQtc3ViJywgJ2NvcGlsb3RjbGknLCBzdGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTdGF0ZXMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSwgdW5kZWZpbmVkLCAnbm8gcGFzc2l2ZSBzdWJzY3JpcHRpb24gd2hpbGUgYWRvcHRhYmxlJyk7XG5cblx0XHRmaXJlU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKGFnZW50SG9zdCwgJ2Fkb3B0LXN1YicsIHsgX21ldGE6IHVuZGVmaW5lZCB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxhc3RTdGF0ZXMuZ2V0KHNlc3Npb24uc2Vzc2lvbklkKSwgc3RhdGUsICdzdWJzY3JpcHRpb24gb3BlbnMgYW5kIGFwcGxpZXMgdGhlIHN0YXRlIG9uY2UgdGhlIG1hcmtlciBjbGVhcnMnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3JlY29uY2lsZXMgaHlkcmF0ZWQgc2Vzc2lvbnMgYWdhaW5zdCB0aGUgYXV0aG9yaXRhdGl2ZSBsaXN0LCBwcnVuaW5nIHN0YWxlIGVudHJpZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRhd2FpdCBwZXJzaXN0Q2FjaGVkU2Vzc2lvbnMoZGlzcG9zYWJsZXMsIHN0b3JhZ2VTZXJ2aWNlLCBbY3JlYXRlU2Vzc2lvbignc3RhbGUtMScsIHsgc3VtbWFyeTogJ1N0YWxlJyB9KV0pO1xuXG5cdFx0Ly8gRnJlc2ggbGF1bmNoIHdpdGggYW4gYXV0aG9yaXRhdGl2ZSAoZW1wdHkpIGxpc3Q6IHRoZSBoeWRyYXRlZCBzZXNzaW9uXG5cdFx0Ly8gc2hvd3MgaW1tZWRpYXRlbHksIHRoZW4gaXMgcHJ1bmVkIG9uY2UgdGhlIGZpcnN0IHJlZnJlc2ggc3VjY2VlZHMuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG5leHRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cblx0XHRjb25zdCBiZWZvcmVSZWZyZXNoID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnRpdGxlLmdldCgpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGFmdGVyUmVmcmVzaCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYmVmb3JlUmVmcmVzaCwgYWZ0ZXJSZWZyZXNoIH0sIHsgYmVmb3JlUmVmcmVzaDogWydTdGFsZSddLCBhZnRlclJlZnJlc2g6IFtdIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnaHlkcmF0ZWQgc2Vzc2lvbnMgc3Vydml2ZSBhIGZhaWxlZCBpbml0aWFsIGxpc3RTZXNzaW9ucycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGF3YWl0IHBlcnNpc3RDYWNoZWRTZXNzaW9ucyhkaXNwb3NhYmxlcywgc3RvcmFnZVNlcnZpY2UsIFtjcmVhdGVTZXNzaW9uKCdyZXNpbGllbnQtMScsIHsgc3VtbWFyeTogJ1Jlc2lsaWVudCcgfSldKTtcblxuXHRcdC8vIEZyZXNoIGxhdW5jaCB3aGVyZSB0aGUgZmlyc3QgbGlzdFNlc3Npb25zKCkgdGhyb3dzIChlLmcuXG5cdFx0Ly8gQUhQX0FVVEhfUkVRVUlSRUQgYmVmb3JlIHRoZSB0b2tlbiBpcyBlZmZlY3RpdmUpLiBXaXRob3V0IGNhY2hpbmcgdGhlXG5cdFx0Ly8gbGlzdCB3b3VsZCBiZSBlbXB0eSB1bnRpbCB0aGUgcmV0cnkgaGVhbHM7IHRoZSBwZXJzaXN0ZWQgc2Vzc2lvbiBtdXN0XG5cdFx0Ly8gc3RheSB2aXNpYmxlIHRocm91Z2hvdXQuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LmZhaWxMaXN0U2Vzc2lvbnNDb3VudCA9IDE7XG5cdFx0bmV4dEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdyZXNpbGllbnQtMScsIHsgc3VtbWFyeTogJ1Jlc2lsaWVudCcgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG5leHRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGFmdGVyRmFpbGVkTGlzdCA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHQvLyBUaGUgYmFja29mZiByZXRyeSAobWluIDFzKSBoZWFsczsgdGhlIHNlc3Npb24gcmVtYWlucyBsaXN0ZWQuXG5cdFx0YXdhaXQgdGltZW91dCgxXzEwMCk7XG5cdFx0Y29uc3QgYWZ0ZXJSZXRyeSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkubWFwKHMgPT4gcy50aXRsZS5nZXQoKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWZ0ZXJGYWlsZWRMaXN0LCBhZnRlclJldHJ5IH0sIHsgYWZ0ZXJGYWlsZWRMaXN0OiBbJ1Jlc2lsaWVudCddLCBhZnRlclJldHJ5OiBbJ1Jlc2lsaWVudCddIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgndXNlcyBwcm9qZWN0IG1ldGFkYXRhIGFzIHdvcmtzcGFjZSBncm91cCBzb3VyY2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm9qZWN0VXJpID0gVVJJLmZpbGUoJy9ob21lL3VzZXIvdnNjb2RlJyk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IFVSSS5maWxlKCcvdG1wL2NvcGlsb3Qtd29ya3RyZWVzL3ZzY29kZS1mZWF0dXJlJyk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncHJvamVjdC0xJywge1xuXHRcdFx0c3VtbWFyeTogJ1Byb2plY3QgU2Vzc2lvbicsXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogcHJvamVjdFVyaSwgZGlzcGxheU5hbWU6ICd2c2NvZGUnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsYWJlbDogd29ya3NwYWNlPy5sYWJlbCxcblx0XHRcdHJlcG9zaXRvcnk6IHdvcmtzcGFjZT8uZm9sZGVyc1swXT8ucm9vdC50b1N0cmluZygpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya3NwYWNlPy5mb2xkZXJzWzBdPy53b3JraW5nRGlyZWN0b3J5Py50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGxhYmVsOiAndnNjb2RlJyxcblx0XHRcdHJlcG9zaXRvcnk6IHByb2plY3RVcmkudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ2xpc3RlZCBzZXNzaW9uIHdpdGggb25seSB3b3JraW5nRGlyZWN0b3J5IChubyBwcm9qZWN0KSBzaG93cyBmb2xkZXIgbmFtZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcnkgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci9zdGFuZGFsb25lLWZvbGRlcicpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3dkLW9ubHktMScsIHtcblx0XHRcdHN1bW1hcnk6ICdXRC1vbmx5IFNlc3Npb24nLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0ud29ya3NwYWNlLmdldCgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh3b3Jrc3BhY2U/LmxhYmVsLCAnc3RhbmRhbG9uZS1mb2xkZXInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nlc3Npb24gYWRkZWQgbm90aWZpY2F0aW9uIGRvZXMgbm90IGNhcnJ5IG1vZGVsIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdub3RpZi1tb2RlbCcsIHsgdGl0bGU6ICdOb3RpZiBNb2RlbCBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnTm90aWYgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5tb2RlbElkLmdldCgpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNb2RlbHMgcmV0dXJucyBvbmx5IG1vZGVscyB0YXJnZXRpbmcgdGhlIHNlc3Npb24gcmVzb3VyY2Ugc2NoZW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hdGNoaW5nTW9kZWwgPSB7IC4uLmNyZWF0ZVRlc3RMYW5ndWFnZU1vZGVsKCdtYXRjaGluZycpLCB0YXJnZXRDaGF0U2Vzc2lvblR5cGU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknIH07XG5cdFx0Y29uc3Qgb3RoZXJNb2RlbCA9IHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwoJ290aGVyJyksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3Qtb3RoZXInIH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxJZHM6IFsnbWF0Y2hpbmcnLCAnb3RoZXInLCAnbWlzc2luZyddLFxuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogaWQgPT4gaWQgPT09ICdtYXRjaGluZycgPyBtYXRjaGluZ01vZGVsIDogaWQgPT09ICdvdGhlcicgPyBvdGhlck1vZGVsIDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbW9kZWwtY2F0YWxvZycsIHsgdGl0bGU6ICdNb2RlbCBDYXRhbG9nIFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLnRpdGxlLmdldCgpID09PSAnTW9kZWwgQ2F0YWxvZyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtb2RlbHM6IHNuYXBzaG90Lm1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciksXG5cdFx0XHRtb2RlbFRhcmdldDogc25hcHNob3QubW9kZWxUYXJnZXQsXG5cdFx0fSwge1xuXHRcdFx0bW9kZWxzOiBbJ21hdGNoaW5nJ10sXG5cdFx0XHRtb2RlbFRhcmdldDogJ2FnZW50LWhvc3QtY29waWxvdGNsaScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE1vZGVsc1NuYXBzaG90IGV4Y2x1ZGVzIGhpZGRlbiBtb2RlbHMgYW5kIGFubm91bmNlcyB2aXNpYmlsaXR5IGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWF0Y2hpbmdNb2RlbCA9IHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwoJ21hdGNoaW5nJyksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfTtcblx0XHRjb25zdCBoaWRkZW5MYW5ndWFnZU1vZGVsSWRzID0gbmV3IFNldChbJ21hdGNoaW5nJ10pO1xuXHRcdGNvbnN0IHZpc2liaWxpdHlDaGFuZ2VzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRsYW5ndWFnZU1vZGVsSWRzOiBbJ21hdGNoaW5nJ10sXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZCA9PiBpZCA9PT0gJ21hdGNoaW5nJyA/IG1hdGNoaW5nTW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRoaWRkZW5MYW5ndWFnZU1vZGVsSWRzLFxuXHRcdFx0bGFuZ3VhZ2VNb2RlbFZpc2liaWxpdHlDaGFuZ2VzOiB2aXNpYmlsaXR5Q2hhbmdlcy5ldmVudCxcblx0XHR9KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2hpZGRlbi1tb2RlbC1jYXRhbG9nJywgeyB0aXRsZTogJ0hpZGRlbiBNb2RlbCBDYXRhbG9nIFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQoc2Vzc2lvbiA9PiBzZXNzaW9uLnRpdGxlLmdldCgpID09PSAnSGlkZGVuIE1vZGVsIENhdGFsb2cgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGxldCBjaGFuZ2VzID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VNb2RlbHMoKCkgPT4gY2hhbmdlcysrKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCkubW9kZWxzLCBbXSk7XG5cblx0XHRoaWRkZW5MYW5ndWFnZU1vZGVsSWRzLmRlbGV0ZSgnbWF0Y2hpbmcnKTtcblx0XHR2aXNpYmlsaXR5Q2hhbmdlcy5maXJlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXMsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQpLm1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciksIFsnbWF0Y2hpbmcnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldE1vZGVsc1NuYXBzaG90IGNhbm9uaWNhbGl6ZXMgYSBtYXRjaGluZyBsb2dpY2FsLXNlc3Npb24gbW9kZWwgaWRlbnRpZmllcicsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbElkID0gJ2dwdC01LjYtc29sJztcblx0XHRjb25zdCBsb2dpY2FsSWRlbnRpZmllciA9IGBjb3BpbG90Y2xpLyR7bW9kZWxJZH1gO1xuXHRcdGNvbnN0IHVucmVsYXRlZElkZW50aWZpZXIgPSBgb3RoZXIvJHttb2RlbElkfWA7XG5cdFx0Y29uc3QgdGFyZ2V0SWRlbnRpZmllciA9IGBhZ2VudC1ob3N0LWNvcGlsb3RjbGk6JHttb2RlbElkfWA7XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbElkcyA9IFtsb2dpY2FsSWRlbnRpZmllciwgdW5yZWxhdGVkSWRlbnRpZmllcl07XG5cdFx0Y29uc3QgbGFuZ3VhZ2VNb2RlbHMgPSBuZXcgTWFwKFtcblx0XHRcdFtsb2dpY2FsSWRlbnRpZmllciwgeyAuLi5jcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbChtb2RlbElkKSwgdmVuZG9yOiAnY29waWxvdGNsaScsIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH1dLFxuXHRcdFx0W3VucmVsYXRlZElkZW50aWZpZXIsIHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwobW9kZWxJZCksIHZlbmRvcjogJ290aGVyJywgdGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiAnb3RoZXInIH1dLFxuXHRcdFx0W3RhcmdldElkZW50aWZpZXIsIHsgLi4uY3JlYXRlVGVzdExhbmd1YWdlTW9kZWwobW9kZWxJZCksIHRhcmdldENoYXRTZXNzaW9uVHlwZTogJ2FnZW50LWhvc3QtY29waWxvdGNsaScgfV0sXG5cdFx0XSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxJZHMsXG5cdFx0XHRsb29rdXBMYW5ndWFnZU1vZGVsOiBpZCA9PiBsYW5ndWFnZU1vZGVscy5nZXQoaWQpLFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbW9kZWwtYWxpYXMnLCB7IHRpdGxlOiAnTW9kZWwgQWxpYXMgU2Vzc2lvbicgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzZXNzaW9uID0+IHNlc3Npb24udGl0bGUuZ2V0KCkgPT09ICdNb2RlbCBBbGlhcyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgcGVuZGluZyA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCBsb2dpY2FsSWRlbnRpZmllcikuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjtcblx0XHRjb25zdCB1bnJlbGF0ZWQgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgdW5yZWxhdGVkSWRlbnRpZmllcikuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjtcblx0XHRsYW5ndWFnZU1vZGVsSWRzLnB1c2godGFyZ2V0SWRlbnRpZmllcik7XG5cdFx0Y29uc3QgYXZhaWxhYmxlID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGxvZ2ljYWxJZGVudGlmaWVyKS5kZXNpcmVkTW9kZWxSZXNvbHV0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwZW5kaW5nLFxuXHRcdFx0dW5yZWxhdGVkLFxuXHRcdFx0YXZhaWxhYmxlOiBhdmFpbGFibGUua2luZCA9PT0gJ2F2YWlsYWJsZScgPyB7IGtpbmQ6IGF2YWlsYWJsZS5raW5kLCBpZGVudGlmaWVyOiBhdmFpbGFibGUubW9kZWwuaWRlbnRpZmllciB9IDogYXZhaWxhYmxlLFxuXHRcdH0sIHtcblx0XHRcdHBlbmRpbmc6IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiB0YXJnZXRJZGVudGlmaWVyIH0sXG5cdFx0XHR1bnJlbGF0ZWQ6IHsga2luZDogJ3VuYXZhaWxhYmxlJywgaWRlbnRpZmllcjogdW5yZWxhdGVkSWRlbnRpZmllciB9LFxuXHRcdFx0YXZhaWxhYmxlOiB7IGtpbmQ6ICdhdmFpbGFibGUnLCBpZGVudGlmaWVyOiB0YXJnZXRJZGVudGlmaWVyIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIHVwZGF0ZXMgZXhpc3Rpbmcgc2Vzc2lvbiBtb2RlbCBhbmQgbGV0cyBkcmFmdCBkZWJvdW5jZSBwZXJzaXN0IGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdzZXQtbW9kZWwnLCB7IHRpdGxlOiAnU2V0IE1vZGVsIFNlc3Npb24nIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTZXQgTW9kZWwgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpuZXctbW9kZWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlbElkLmdldCgpLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm5ldy1tb2RlbCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIHVwZGF0ZXMgY2FjaGVkIHNlbGVjdGlvbiBmb3IgbGF0ZXIgbWVzc2FnZS1sZXZlbCBzZWxlY3Rpb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3NldC1tb2RlbC1jb25maWcnLCB7IHRpdGxlOiAnU2V0IE1vZGVsIENvbmZpZyBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2V0IE1vZGVsIENvbmZpZyBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbiEuc2Vzc2lvbklkLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmNvbmZpZ3VyZWQtbW9kZWwnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlbElkLmdldCgpLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOmNvbmZpZ3VyZWQtbW9kZWwnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXRBZ2VudCB1cGRhdGVzIGV4aXN0aW5nIHNlc3Npb24gYWdlbnQgYW5kIGxldHMgZHJhZnQgZGVib3VuY2UgcGVyc2lzdCBpdCcsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnc2V0LWFnZW50JywgeyB0aXRsZTogJ1NldCBBZ2VudCBTZXNzaW9uJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2V0IEFnZW50IFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3JldmlldycsIG5hbWU6ICdyZXZpZXcnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB7IGlkOiAnYWdlbnQ6Ly9yZXZpZXcnLCBraW5kOiAnYWdlbnQnIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldEFnZW50IHdpdGggdW5kZWZpbmVkIGNsZWFycyB0aGUgY2FjaGVkIGFnZW50IHNlbGVjdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2xlYXItYWdlbnQnLCB7IHRpdGxlOiAnQ2xlYXIgQWdlbnQgU2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0NsZWFyIEFnZW50IFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3JldmlldycsIG5hbWU6ICdyZXZpZXcnIH0pO1xuXHRcdHByb3ZpZGVyLnNldEFnZW50Py4oc2Vzc2lvbiEuc2Vzc2lvbklkLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdGhlIHNlbGVjdGVkIGFnZW50IGZyb20gdGhlIGRlZmF1bHQgY2hhdCBkcmFmdCBvbiByZXN1bWUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3Jlc3VtZS1hZ2VudCcsIHsgdGl0bGU6ICdSZXN1bWUgQWdlbnQgU2Vzc2lvbicgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jlc3VtZSBBZ2VudCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gYGdldFNlc3Npb25Db25maWdgIG9wZW5zIHRoZSBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbiwgd2hpY2ggYWxzbyBvcGVuc1xuXHRcdC8vIHRoZSBkZWZhdWx0IGNoYXQgc3Vic2NyaXB0aW9uIHVzZWQgdG8gcmVhZCB0aGUgcGVyc2lzdGVkIGRyYWZ0IGFnZW50LlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IGRlZmF1bHRDaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3Jlc3VtZS1hZ2VudCcpKTtcblx0XHRhZ2VudEhvc3Quc2V0Q2hhdFN0YXRlKGRlZmF1bHRDaGF0VXJpLCB7XG5cdFx0XHRyZXNvdXJjZTogZGVmYXVsdENoYXRVcmksXG5cdFx0XHR0aXRsZTogJ1Jlc3VtZSBBZ2VudCBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0dHVybnM6IFtdLFxuXHRcdFx0ZHJhZnQ6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sIGFnZW50OiB7IHVyaTogJ2FnZW50Oi8vcmVzdW1lZCcgfSB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uIS5tb2RlLmdldCgpLCB7IGlkOiAnYWdlbnQ6Ly9yZXN1bWVkJywga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3Qgb3ZlcnJpZGUgYSBsaXZlIGFnZW50IHNlbGVjdGlvbiB3aXRoIHRoZSBwZXJzaXN0ZWQgZHJhZnQgYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3Jlc3VtZS1ub292ZXJyaWRlJywgeyB0aXRsZTogJ1Jlc3VtZSBObyBPdmVycmlkZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jlc3VtZSBObyBPdmVycmlkZScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIEEgbGl2ZSBwaWNrIHdpbnM7IGEgbGF0ZXIgZHJhZnQgc25hcHNob3QgbXVzdCBub3QgY2xvYmJlciBpdC5cblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL2xpdmUnLCBuYW1lOiAnbGl2ZScgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgZGVmYXVsdENoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncmVzdW1lLW5vb3ZlcnJpZGUnKSk7XG5cdFx0YWdlbnRIb3N0LnNldENoYXRTdGF0ZShkZWZhdWx0Q2hhdFVyaSwge1xuXHRcdFx0cmVzb3VyY2U6IGRlZmF1bHRDaGF0VXJpLFxuXHRcdFx0dGl0bGU6ICdSZXN1bWUgTm8gT3ZlcnJpZGUnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHR0dXJuczogW10sXG5cdFx0XHRkcmFmdDogeyB0ZXh0OiAnJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSwgYWdlbnQ6IHsgdXJpOiAnYWdlbnQ6Ly9yZXN1bWVkJyB9IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHsgaWQ6ICdhZ2VudDovL2xpdmUnLCBraW5kOiAnYWdlbnQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWJhc2VzIHRoZSBzZWxlY3RlZCBhZ2VudCB0byBpdHMgd29ya3RyZWUgdHdpbiBmcm9tIHRoZSBhZ2VudCBsaXN0IGJlZm9yZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgZmxpcHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3JlYmFzZS13b3JrdHJlZScsIHsgdGl0bGU6ICdSZWJhc2UgV29ya3RyZWUnLCB3b3JraW5nRGlyZWN0b3J5OiAnZmlsZTovLy9Vc2Vycy9tZS92c2NvZGUnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdSZWJhc2UgV29ya3RyZWUnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBBIGZvbGRlciBhZ2VudCBpcyBwaWNrZWQgd2hpbGUgdGhlIHNlc3Npb24gc3RpbGwgcnVucyBpbiB0aGUgcmVwby5cblx0XHRjb25zdCBmb2xkZXJBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS8uZ2l0aHViL2FnZW50cy9zZXNzaW9ucy5tZCc7XG5cdFx0Y29uc3Qgd29ya3RyZWVBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLXdvcmt0cmVlLy5naXRodWIvYWdlbnRzL3Nlc3Npb25zLm1kJztcblx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24hLnNlc3Npb25JZCwgeyB1cmk6IGZvbGRlckFnZW50LCBuYW1lOiAnc2Vzc2lvbnMnIH0pO1xuXG5cdFx0Ly8gVGhlIGhvc3QgcmVwb3J0cyB0aGUgd29ya3RyZWUtcGF0aGVkIGFnZW50cyAodGhlIGZvbGRlciB0d2luIGlzIGdvbmUpXG5cdFx0Ly8gd2VsbCBiZWZvcmUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGZsaXBzIHRvIHRoZSB3b3JrdHJlZS4gVGhlIHJlYmFzZVxuXHRcdC8vIG11c3QgZGVyaXZlIHRoZSB3b3JrdHJlZSByb290IGZyb20gdGhlIGFnZW50IGxpc3QsIG5vdCB0aGUgKHN0aWxsXG5cdFx0Ly8gZm9sZGVyKSB3b3JraW5nIGRpcmVjdG9yeSwgc28gdGhlIHNlbGVjdGlvbiBpcyByZS1wb2ludGVkIGluIHRpbWUuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3JlYmFzZS13b3JrdHJlZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUmViYXNlIFdvcmt0cmVlJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vd29ya3RyZWUnLFxuXHRcdFx0XHR1cmk6ICdwbHVnaW46Ly93b3JrdHJlZScsXG5cdFx0XHRcdG5hbWU6ICd3b3JrdHJlZSBwbHVnaW4nLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiB3b3JrdHJlZUFnZW50LCB1cmk6IHdvcmt0cmVlQWdlbnQsIG5hbWU6ICdzZXNzaW9ucycgfV0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbiEubW9kZS5nZXQoKSwgeyBpZDogd29ya3RyZWVBZ2VudCwga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHRoZSBzZWxlY3RlZCBhZ2VudCB1bnRvdWNoZWQgd2hlbiB0aGUgYWdlbnQgbGlzdCBoYXMgbm8gcmVsb2NhdGVkIHR3aW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3JlYmFzZS1ub25lJywgeyB0aXRsZTogJ1JlYmFzZSBOb25lJywgd29ya2luZ0RpcmVjdG9yeTogJ2ZpbGU6Ly8vVXNlcnMvbWUvdnNjb2RlJyB9KTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUmViYXNlIE5vbmUnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBmb2xkZXJBZ2VudCA9ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS8uZ2l0aHViL2FnZW50cy9zZXNzaW9ucy5tZCc7XG5cdFx0cHJvdmlkZXIuc2V0QWdlbnQ/LihzZXNzaW9uIS5zZXNzaW9uSWQsIHsgdXJpOiBmb2xkZXJBZ2VudCwgbmFtZTogJ3Nlc3Npb25zJyB9KTtcblxuXHRcdC8vIEFuIHVucmVsYXRlZCBhZ2VudCAoZGlmZmVyZW50IHJlcG8tcmVsYXRpdmUgZmlsZSkgbXVzdCBub3QgYmUgdHJlYXRlZFxuXHRcdC8vIGFzIGEgcmVsb2NhdGlvbiBvZiB0aGUgc2VsZWN0aW9uLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdyZWJhc2Utbm9uZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUmViYXNlIE5vbmUnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFt7XG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9vdGhlcicsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL290aGVyJyxcblx0XHRcdFx0bmFtZTogJ290aGVyIHBsdWdpbicsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLW5vbmUvLmdpdGh1Yi9hZ2VudHMvb3RoZXIubWQnLCB1cmk6ICdmaWxlOi8vL1VzZXJzL21lL3ZzY29kZS53b3JrdHJlZXMvcmViYXNlLW5vbmUvLmdpdGh1Yi9hZ2VudHMvb3RoZXIubWQnLCBuYW1lOiAnb3RoZXInIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24hLm1vZGUuZ2V0KCksIHsgaWQ6IGZvbGRlckFnZW50LCBraW5kOiAnYWdlbnQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYXJyaWVzIHRoZSBwaWNrZWQgY3VzdG9tIGFnZW50IG9udG8gdGhlIGNvbW1pdHRlZCBzZXNzaW9uIHdoZW4gYSBuZXcgc2Vzc2lvbiBncmFkdWF0ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUGFydCAxIHJlZ3Jlc3Npb246IHdoZW4gYSBuZXcgKHVudGl0bGVkKSBzZXNzaW9uIGdyYWR1YXRlcyBpbnRvIGEgcmVhbFxuXHRcdC8vIHJ1bm5pbmcgc2Vzc2lvbiBvbiBmaXJzdCBzZW5kLCB0aGUgcGlja2VkIGFnZW50IG11c3QgdHJhdmVsIG9udG8gdGhlXG5cdFx0Ly8gY29tbWl0dGVkIHNlc3Npb24ncyBgbW9kZWAuIE90aGVyd2lzZSB0aGUgcGlja2VyIFx1MjAxNCB3aGljaCBtaXJyb3JzXG5cdFx0Ly8gYHNlc3Npb24ubW9kZWAgXHUyMDE0IHJlc2V0cyB0byB0aGUgZGVmYXVsdCB0aGUgbW9tZW50IHRoZSBhY3RpdmUgc2Vzc2lvbiBpc1xuXHRcdC8vIHN3YXBwZWQgZm9yIHRoZSBmcmVzaGx5IGNvbW1pdHRlZCBvbmUuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2dyYWR1YXRlZCcsIHsgc3VtbWFyeTogJ0dyYWR1YXRlZCBTZXNzaW9uJyB9KSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0cHJvdmlkZXIuc2V0QWdlbnQ/LihzZXNzaW9uLnNlc3Npb25JZCwgeyB1cmk6ICdhZ2VudDovL3BpY2tlZCcsIG5hbWU6ICdwaWNrZWQnIH0pO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8nIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21taXR0ZWQubW9kZS5nZXQoKSwgeyBpZDogJ2FnZW50Oi8vcGlja2VkJywga2luZDogJ2FnZW50JyB9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBnZXRDdXN0b21BZ2VudHMgLyBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyAtLS0tLS0tXG5cblx0dGVzdCgnZ2V0Q3VzdG9tQWdlbnRzIGNvbGxlY3RzIGFnZW50cyBmcm9tIHNlc3Npb24gY3VzdG9taXphdGlvbnMsIGNvYWxlc2NlZCBieSBVUkkgYW5kIHNvcnRlZCBieSBuYW1lJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2FnZW50cy1tZXJnZScsIHsgdGl0bGU6ICdNZXJnZSBTZXNzaW9uJyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01lcmdlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBDdXN0b20gYWdlbnRzIGxpdmUgZXhjbHVzaXZlbHkgb24gYFNlc3Npb25DdXN0b21pemF0aW9uLmFnZW50c2Bcblx0XHQvLyAocG9wdWxhdGVkIGJ5IHRoZSBob3N0IGFmdGVyIHBhcnNpbmcgZWFjaCBjdXN0b21pemF0aW9uKS4gVGhlIGhvc3Rcblx0XHQvLyBtZXJnZXMgaG9zdC0vY2xpZW50LS9zZXNzaW9uLWxldmVsIGN1c3RvbWl6YXRpb25zIGludG9cblx0XHQvLyBgc3RhdGUuY3VzdG9taXphdGlvbnNgIGZvciB1cywgc28gdGhlIHBpY2tlciBvbmx5IG5lZWRzIHRvIHJlYWRcblx0XHQvLyBmcm9tIHRoZXJlLiBBIGR1cGxpY2F0ZSBgdXJpYCBhY3Jvc3MgY3VzdG9taXphdGlvbnMgaXMgY29hbGVzY2VkXG5cdFx0Ly8gKGZpcnN0IHNlZW4gd2lucykuXG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdNZXJnZSBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vc2Vzc2lvbi0xJyxcblx0XHRcdFx0dXJpOiAncGx1Z2luOi8vc2Vzc2lvbi0xJyxcblx0XHRcdFx0bmFtZTogJ3Nlc3Npb24gcGx1Z2luJyxcblx0XHRcdFx0bG9hZDogeyBraW5kOiBDdXN0b21pemF0aW9uTG9hZFN0YXR1cy5Mb2FkZWQgfSxcblx0XHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vc2hhcmVkJywgdXJpOiAnYWdlbnQ6Ly9zaGFyZWQnLCBuYW1lOiAnc2hhcmVkJywgZGVzY3JpcHRpb246ICdmcm9tIHNlc3Npb24nIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3Nlc3Npb24tb25seScsIHVyaTogJ2FnZW50Oi8vc2Vzc2lvbi1vbmx5JywgbmFtZTogJ3Nlc3Npb24tb25seScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0XHRpZDogJ3BsdWdpbjovL3Nlc3Npb24tMicsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL3Nlc3Npb24tMicsXG5cdFx0XHRcdG5hbWU6ICdzZWNvbmQgc2Vzc2lvbiBwbHVnaW4nLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW1xuXHRcdFx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9hbm90aGVyJywgdXJpOiAnYWdlbnQ6Ly9hbm90aGVyJywgbmFtZTogJ2Fub3RoZXInIH0sXG5cdFx0XHRcdFx0Ly8gRHVwbGljYXRlIFVSSSBcdTIwMTQgbXVzdCBOT1QgcmVwbGFjZSB0aGUgZmlyc3Qtc2VlbiBlbnRyeS5cblx0XHRcdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vc2hhcmVkLWR1cCcsIHVyaTogJ2FnZW50Oi8vc2hhcmVkJywgbmFtZTogJ3NoYXJlZCAoZHVwbGljYXRlKScgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Ly8gRGlzYWJsZWQgY3VzdG9taXphdGlvbnMgYXJlIHNraXBwZWQgZW50aXJlbHkuXG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9kaXNhYmxlZCcsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL2Rpc2FibGVkJyxcblx0XHRcdFx0bmFtZTogJ2Rpc2FibGVkIHBsdWdpbicsXG5cdFx0XHRcdC8vIFRPRE86IFN0ZXAgMiBzZWxlY3RzIHRoZSBwZXJzaXN0ZWQgZW5hYmxlbWVudCBzY29wZS5cblx0XHRcdFx0ZW5hYmxlbWVudDogW3sga2luZDogQ3VzdG9taXphdGlvbkVuYWJsZW1lbnRLaW5kLkdsb2JhbCwgZW5hYmxlZDogZmFsc2UgfV0sXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL2Rpc2FibGVkJywgdXJpOiAnYWdlbnQ6Ly9kaXNhYmxlZCcsIG5hbWU6ICdkaXNhYmxlZCcgfV0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdC8vIEN1c3RvbWl6YXRpb25zIHdpdGggYGNoaWxkcmVuID09PSB1bmRlZmluZWRgIGFyZSB0cmVhdGVkIGFzXG5cdFx0XHRcdC8vIFwidW5rbm93blwiIChob3N0IG5vdCB5ZXQgZmluaXNoZWQgcGFyc2luZykgYW5kIHNraXBwZWQuXG5cdFx0XHRcdHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLlBsdWdpbixcblx0XHRcdFx0aWQ6ICdwbHVnaW46Ly91bnBhcnNlZCcsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL3VucGFyc2VkJyxcblx0XHRcdFx0bmFtZTogJ3VucGFyc2VkIHBsdWdpbicsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGluZyB9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHQvLyBGb3JjZSBhIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIHNvIGBfbGFzdFNlc3Npb25TdGF0ZXNgIGdldHNcblx0XHQvLyBwb3B1bGF0ZWQgd2hlbiB3ZSBwdXNoIHRoZSBmYWtlIHN0YXRlIGJlbG93LiBgZ2V0U2Vzc2lvbkNvbmZpZ2Bcblx0XHQvLyBpcyB0aGUgcHVibGljIGhvb2sgdGhhdCBjYWxscyBgX2tlZXBTZXNzaW9uU3RhdGVBbGl2ZWAuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2FnZW50cy1tZXJnZScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb24hLnNlc3Npb25JZCksIFtcblx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9hbm90aGVyJywgdXJpOiAnYWdlbnQ6Ly9hbm90aGVyJywgbmFtZTogJ2Fub3RoZXInIH0sXG5cdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vc2Vzc2lvbi1vbmx5JywgdXJpOiAnYWdlbnQ6Ly9zZXNzaW9uLW9ubHknLCBuYW1lOiAnc2Vzc2lvbi1vbmx5JyB9LFxuXHRcdFx0Ly8gRmlyc3Qtc2VlbiB3aW5zIGZvciB0aGUgZHVwbGljYXRlIGBhZ2VudDovL3NoYXJlZGAgVVJJLlxuXHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3NoYXJlZCcsIHVyaTogJ2FnZW50Oi8vc2hhcmVkJywgbmFtZTogJ3NoYXJlZCcsIGRlc2NyaXB0aW9uOiAnZnJvbSBzZXNzaW9uJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRNY3BTZXJ2ZXJzIGRpc3BhdGNoZXMgTUNQIGxpZmVjeWNsZSByZXF1ZXN0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdtY3AtbGlmZWN5Y2xlJywgeyB0aXRsZTogJ01DUCBMaWZlY3ljbGUnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnTUNQIExpZmVjeWNsZScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnTUNQIExpZmVjeWNsZScsXG5cdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjdXN0b21pemF0aW9uczogW3tcblx0XHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuTWNwU2VydmVyLFxuXHRcdFx0XHRpZDogJ21jcDovL2RvY3MnLFxuXHRcdFx0XHR1cmk6ICdtY3A6Ly9kb2NzJyxcblx0XHRcdFx0bmFtZTogJ0RvY3MnLFxuXHRcdFx0XHRzdGF0ZTogeyBraW5kOiBNY3BTZXJ2ZXJTdGF0dXMuU3RvcHBlZCB9LFxuXHRcdFx0fV0sXG5cdFx0fTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbWNwLWxpZmVjeWNsZScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGNvbnN0IHNlcnZlcnMgPSBwcm92aWRlci5nZXRNY3BTZXJ2ZXJzKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcnZlcnMubGVuZ3RoLCAxKTtcblx0XHRhd2FpdCBzZXJ2ZXJzWzBdLnN0YXJ0KCk7XG5cdFx0YXdhaXQgc2VydmVyc1swXS5zdG9wKCk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLnNsaWNlKC0yKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKCh7IGFjdGlvbiB9KSA9PiBhY3Rpb24udHlwZSksIFtcblx0XHRcdEFjdGlvblR5cGUuU2Vzc2lvbk1jcFNlcnZlclN0YXJ0UmVxdWVzdGVkLFxuXHRcdFx0QWN0aW9uVHlwZS5TZXNzaW9uTWNwU2VydmVyU3RvcFJlcXVlc3RlZCxcblx0XHRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMubWFwKCh7IGFjdGlvbiB9KSA9PiAoYWN0aW9uIGFzIHsgaWQ6IHN0cmluZyB9KS5pZCksIFsnbWNwOi8vZG9jcycsICdtY3A6Ly9kb2NzJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRCYWNrZW5kQ2hhdFJlc291cmNlIGxvb2tzIHVwIHRoZSBob3N0LXN1cHBsaWVkIGJhY2tlbmQgY2hhdCBVUkknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblxuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY2hhdC1sb29rdXAnLCB7IHRpdGxlOiAnQ2hhdCBMb29rdXAnIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnbm8tc3RhdGUnLCB7IHRpdGxlOiAnTm8gU3RhdGUnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnQ2hhdCBMb29rdXAnKTtcblx0XHRjb25zdCB1bmh5ZHJhdGVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ05vIFN0YXRlJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5vayh1bmh5ZHJhdGVkKTtcblxuXHRcdC8vIFRoZSBiYWNrZW5kIGNoYXQgVVJJcyBhcmUgaG9zdC1zdXBwbGllZCBhbmQgaW5kZXBlbmRlbnQgb2YgdGhlIGNsaWVudFxuXHRcdC8vIHJlc291cmNlczsgdGhlIGxvb2t1cCByZXR1cm5zIHRoZW0gdmVyYmF0aW0gcmF0aGVyIHRoYW4gY29uc3RydWN0aW5nIHRoZW0uXG5cdFx0Ly8gT24gdGhlIHdpcmUgdGhleSBhcmUgc3RyaW5ncy5cblx0XHRjb25zdCBiYWNrZW5kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnYmFja2VuZC1hYmMnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGRlZmF1bHRCYWNrZW5kID0gYnVpbGREZWZhdWx0Q2hhdFVyaShiYWNrZW5kU2Vzc2lvbik7XG5cdFx0Y29uc3QgcGVlckJhY2tlbmQgPSBidWlsZENoYXRVcmkoYmFja2VuZFNlc3Npb24sICdwZWVyLTEnKTtcblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0NoYXQgTG9va3VwJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGRlZmF1bHRCYWNrZW5kLCB0aXRsZTogJ0RlZmF1bHQnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyB9IHNhdGlzZmllcyBDaGF0U3VtbWFyeSxcblx0XHRcdFx0eyByZXNvdXJjZTogcGVlckJhY2tlbmQsIHRpdGxlOiAnUGVlcicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsIG1vZGlmaWVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonIH0gc2F0aXNmaWVzIENoYXRTdW1tYXJ5LFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRDaGF0OiBkZWZhdWx0QmFja2VuZCxcblx0XHR9O1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2NoYXQtbG9va3VwJywgJ2NvcGlsb3RjbGknLCBmYWtlU3RhdGUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHQvLyBEZWZhdWx0IGNoYXQgKGNsaWVudCByZXNvdXJjZSBoYXMgbm8gZnJhZ21lbnQpIHJlc29sdmVzIHZpYSBgZGVmYXVsdENoYXRgLlxuXHRcdFx0ZGVmYXVsdENoYXQ6IHByb3ZpZGVyLmdldEJhY2tlbmRDaGF0UmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk/LnRvU3RyaW5nKCksXG5cdFx0XHQvLyBQZWVyIGNoYXQgKGNsaWVudCBmcmFnbWVudCkgcmVzb2x2ZXMgdmlhIGl0cyBgQ2hhdFN1bW1hcnkucmVzb3VyY2VgLlxuXHRcdFx0cGVlckNoYXQ6IHByb3ZpZGVyLmdldEJhY2tlbmRDaGF0UmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZS53aXRoKHsgZnJhZ21lbnQ6ICdwZWVyLTEnIH0pKT8udG9TdHJpbmcoKSxcblx0XHRcdC8vIEEgcGVlciBjaGF0IGFic2VudCBmcm9tIGh5ZHJhdGVkIHN0YXRlIGhhcyBubyBiYWNrZW5kIFVSSS5cblx0XHRcdG1pc3NpbmdQZWVyOiBwcm92aWRlci5nZXRCYWNrZW5kQ2hhdFJlc291cmNlKHNlc3Npb24ucmVzb3VyY2Uud2l0aCh7IGZyYWdtZW50OiAnZ2hvc3QnIH0pKT8udG9TdHJpbmcoKSxcblx0XHRcdC8vIEEgc2Vzc2lvbiB3aG9zZSBzdGF0ZSBoYXMgbm90IGh5ZHJhdGVkIHlpZWxkcyBub3RoaW5nLlxuXHRcdFx0bm90SHlkcmF0ZWQ6IHByb3ZpZGVyLmdldEJhY2tlbmRDaGF0UmVzb3VyY2UodW5oeWRyYXRlZC5yZXNvdXJjZSksXG5cdFx0fSwge1xuXHRcdFx0ZGVmYXVsdENoYXQ6IFVSSS5wYXJzZShkZWZhdWx0QmFja2VuZCkudG9TdHJpbmcoKSxcblx0XHRcdHBlZXJDaGF0OiBVUkkucGFyc2UocGVlckJhY2tlbmQpLnRvU3RyaW5nKCksXG5cdFx0XHRtaXNzaW5nUGVlcjogdW5kZWZpbmVkLFxuXHRcdFx0bm90SHlkcmF0ZWQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0Q3VzdG9tQWdlbnRzIHJldHVybnMgbm8gYWdlbnRzIHdoZW4gdGhlIHNlc3Npb24gaGFzIG5vIFNlc3Npb25TdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXG5cdFx0Ly8gUm9vdC1sZXZlbCBjdXN0b21pemF0aW9ucyBvbiBgQWdlbnRJbmZvYCBubyBsb25nZXIgY29udHJpYnV0ZVxuXHRcdC8vIGFnZW50cyBkaXJlY3RseSB0byB0aGUgcGlja2VyIFx1MjAxNCBvbmx5IGBTZXNzaW9uQ3VzdG9taXphdGlvbi5hZ2VudHNgXG5cdFx0Ly8gZG9lcyBcdTIwMTQgc28gYSBzZXNzaW9uIHdpdGhvdXQgYSBgU2Vzc2lvblN0YXRlYCByZXNvbHZlcyB0byBlbXB0eS5cblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdDb3BpbG90Jyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICcnLFxuXHRcdFx0XHRtb2RlbHM6IFtdLFxuXHRcdFx0XHRjdXN0b21pemF0aW9uczogW3tcblx0XHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdFx0aWQ6ICdwbHVnaW46Ly9yb290Jyxcblx0XHRcdFx0XHR1cmk6ICdwbHVnaW46Ly9yb290Jyxcblx0XHRcdFx0XHRuYW1lOiAncm9vdCBwbHVnaW4nLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdyb290LW9ubHknLCB7IHRpdGxlOiAnUm9vdCBPbmx5JyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1Jvb3QgT25seScpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3VzdG9tQWdlbnRzKHNlc3Npb24hLnNlc3Npb25JZCksIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbmV3IHNlc3Npb24gZXhwb3NlcyBjbGllbnQgY3VzdG9tIGFnZW50cyBiZWZvcmUgU2Vzc2lvblN0YXRlIGFuZCB1cGRhdGVzIHRoZSBwaWNrZXInLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlQ2xpZW50QWdlbnRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IEFnZW50Q3VzdG9taXphdGlvbltdPignYWN0aXZlQ2xpZW50QWdlbnRzJywgW10pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZUNsaWVudEFnZW50cyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2onKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiBmaXJlZCsrKSk7XG5cblx0XHRhY3RpdmVDbGllbnRBZ2VudHMuc2V0KFt7XG5cdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRcdGlkOiAnaW5ib3gnLFxuXHRcdFx0dXJpOiAnZmlsZTovLy9wbHVnaW5zL2dpdGh1Yi1pbmJveC9hZ2VudHMvaW5ib3guYWdlbnQubWQnLFxuXHRcdFx0bmFtZTogJ0luYm94Jyxcblx0XHR9XSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWdlbnRzOiBwcm92aWRlci5nZXRDdXN0b21BZ2VudHMoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdFx0ZmlyZWQsXG5cdFx0fSwge1xuXHRcdFx0YWdlbnRzOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCxcblx0XHRcdFx0aWQ6ICdpbmJveCcsXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vcGx1Z2lucy9naXRodWItaW5ib3gvYWdlbnRzL2luYm94LmFnZW50Lm1kJyxcblx0XHRcdFx0bmFtZTogJ0luYm94Jyxcblx0XHRcdH1dLFxuXHRcdFx0ZmlyZWQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzIGZpcmVzIG9uIHJvb3Qgc3RhdGUgYW5kIHNlc3Npb24gc3RhdGUgY2hhbmdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnY3VzdC1ldmVudHMnLCB7IHRpdGxlOiAnQ3VzdCBFdmVudHMnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnQ3VzdCBFdmVudHMnKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRsZXQgZmlyZWQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZUN1c3RvbUFnZW50cygoKSA9PiB7IGZpcmVkKys7IH0pKTtcblxuXHRcdC8vIEEgcm9vdCBzdGF0ZSBjaGFuZ2UgdGhhdCByZXBsYWNlcyB0aGUgYWdlbnRzIHJlZmVyZW5jZSBzaG91bGRcblx0XHQvLyBmaXJlIHRoZSBldmVudC4gVGhpcyBpcyB0aGUgb25seSBwYXRoIHRoYXQgbXV0YXRlcyBhZ2VudHMgaW4gdGhlXG5cdFx0Ly8gcmVhbCByZWR1Y2VyIChgUm9vdEFnZW50c0NoYW5nZWRgKS5cblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdF0pO1xuXHRcdGNvbnN0IGFmdGVyUm9vdCA9IGZpcmVkO1xuXHRcdGFzc2VydC5vayhhZnRlclJvb3QgPiAwLCAnZXhwZWN0ZWQgZXZlbnQgdG8gZmlyZSB3aGVuIHRoZSBhZ2VudHMgcmVmZXJlbmNlIGlzIHJlcGxhY2VkJyk7XG5cblx0XHQvLyBBIHN1YnNlcXVlbnQgcm9vdCBzdGF0ZSBjaGFuZ2UgdGhhdCBwcmVzZXJ2ZXMgdGhlIGFnZW50cyByZWZlcmVuY2Vcblx0XHQvLyAoZS5nLiBgYWN0aXZlU2Vzc2lvbnNDaGFuZ2VkYCBvbiBldmVyeSB0dXJuIHN0YXJ0L2NvbXBsZXRlKSBtdXN0XG5cdFx0Ly8gTk9UIGZpcmUgXHUyMDE0IGZpcmluZyBvbiB0aG9zZSBjYXVzZWQgY2hhdCBzZXNzaW9uIGJ1YmJsZXMgdG8gYmVcblx0XHQvLyByZS1oeWRyYXRlZCBtaWQtdHVybiwgZHJvcHBpbmcgc3RyZWFtZWQgcmVzcG9uc2VzLlxuXHRcdGFnZW50SG9zdC5maXJlTm9uQWdlbnRSb290U3RhdGVDaGFuZ2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQsIGFmdGVyUm9vdCwgJ2V4cGVjdGVkIGV2ZW50IE5PVCB0byBmaXJlIG9uIG5vbi1hZ2VudCByb290IGRlbHRhcyAocHJlc2VydmVkIGFnZW50cyByZWZlcmVuY2UpJyk7XG5cblx0XHQvLyBTZXNzaW9uLXN0YXRlIHVwZGF0ZSB3aXRoIG5ldyBjdXN0b21pemF0aW9ucyBzaG91bGQgZmlyZSBpdCBhZ2Fpbi5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY3VzdC1ldmVudHMnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0N1c3QgRXZlbnRzJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8vcycsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL3MnLFxuXHRcdFx0XHRuYW1lOiAnc2Vzc2lvbiBwbHVnaW4nLFxuXHRcdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9zJywgdXJpOiAnYWdlbnQ6Ly9zJywgbmFtZTogJ3MnIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcmVkID4gYWZ0ZXJSb290LCAnZXhwZWN0ZWQgZXZlbnQgdG8gZmlyZSBvbiBzZXNzaW9uIHN0YXRlIGN1c3RvbWl6YXRpb24gY2hhbmdlJyk7XG5cblx0XHQvLyBBIHNlY29uZCBzdGF0ZSB1cGRhdGUgd2l0aCB0aGUgU0FNRSBjdXN0b21pemF0aW9ucyByZWZlcmVuY2UgbXVzdFxuXHRcdC8vIE5PVCBmaXJlIFx1MjAxNCBvbmx5IGNodXJuIGluIGBjdXN0b21pemF0aW9uc2AgLyBgYWN0aXZlQ2xpZW50c1tdLmN1c3RvbWl6YXRpb25zYFxuXHRcdC8vIGNvdW50cy5cblx0XHRjb25zdCBhZnRlckZpcnN0Q3VzdG9taXphdGlvbiA9IGZpcmVkO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2N1c3QtZXZlbnRzJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdDdXN0IEV2ZW50cyBVcGRhdGVkJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdC8vIFNhbWUgaWRlbnRpdHkgYXMgYmVmb3JlOlxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IChwcm92aWRlciBhcyB1bmtub3duIGFzIHsgX2xhc3RTZXNzaW9uU3RhdGVzOiBNYXA8c3RyaW5nLCBTZXNzaW9uU3RhdGU+IH0pLl9sYXN0U2Vzc2lvblN0YXRlcy5nZXQoc2Vzc2lvbiEuc2Vzc2lvbklkKT8uY3VzdG9taXphdGlvbnMsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcmVkLCBhZnRlckZpcnN0Q3VzdG9taXphdGlvbiwgJ2V4cGVjdGVkIGV2ZW50IE5PVCB0byBmaXJlIHdoZW4gY3VzdG9taXphdGlvbnMgYXJlIHVuY2hhbmdlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdOZXdTZXNzaW9uIGZvcndhcmRzIFNlc3Npb25TdGF0ZSBpbnRvIF9sYXN0U2Vzc2lvblN0YXRlcyBzbyB0aGUgcGlja2VyIHNlZXMgY3VzdG9taXphdGlvbnMgYmVmb3JlIGZpcnN0IG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvaicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBsZXQgZWFnZXJDcmVhdGUgY29tcGxldGUgYW5kIHRoZSBzdWJzY3JpcHRpb24gc2VlZFxuXG5cdFx0Y29uc3QgcmF3SWQgPSBzZXNzaW9uLnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXG5cdFx0bGV0IGZpcmVkID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VDdXN0b21BZ2VudHMoKCkgPT4geyBmaXJlZCsrOyB9KSk7XG5cblx0XHQvLyBQdXNoIGEgU2Vzc2lvblN0YXRlIGNhcnJ5aW5nIGN1c3RvbWl6YXRpb25zIGFzIGlmIHRoZSBob3N0IGhhZFxuXHRcdC8vIHJlc29sdmVkIHRoZW0gYW5kIGRpc3BhdGNoZWQgYSBTZXNzaW9uQ3VzdG9taXphdGlvbnNDaGFuZ2VkLlxuXHRcdGNvbnN0IGN1c3RvbWl6YXRpb25zOiBDdXN0b21pemF0aW9uW10gPSBbe1xuXHRcdFx0dHlwZTogQ3VzdG9taXphdGlvblR5cGUuUGx1Z2luLFxuXHRcdFx0aWQ6ICdwbHVnaW46Ly9uZXctc2Vzc2lvbicsXG5cdFx0XHR1cmk6ICdwbHVnaW46Ly9uZXctc2Vzc2lvbicsXG5cdFx0XHRuYW1lOiAncCcsXG5cdFx0XHRsb2FkOiB7IGtpbmQ6IEN1c3RvbWl6YXRpb25Mb2FkU3RhdHVzLkxvYWRlZCB9LFxuXHRcdFx0Y2hpbGRyZW46IFtcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3Jldmlld2VyJywgdXJpOiAnYWdlbnQ6Ly9yZXZpZXdlcicsIG5hbWU6ICdyZXZpZXdlcicgfSxcblx0XHRcdFx0eyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3RyaWFnZScsIHVyaTogJ2FnZW50Oi8vdHJpYWdlJywgbmFtZTogJ3RyaWFnZScgfSxcblx0XHRcdF0sXG5cdFx0fV07XG5cdFx0Y29uc3Qgc3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiBzZXNzaW9uVHlwZUlkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnMsXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKHJhd0lkLCBzZXNzaW9uVHlwZUlkLCBzdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEN1c3RvbUFnZW50cyhzZXNzaW9uLnNlc3Npb25JZCksIFtcblx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9yZXZpZXdlcicsIHVyaTogJ2FnZW50Oi8vcmV2aWV3ZXInLCBuYW1lOiAncmV2aWV3ZXInIH0sXG5cdFx0XHR7IHR5cGU6IEN1c3RvbWl6YXRpb25UeXBlLkFnZW50LCBpZDogJ2FnZW50Oi8vdHJpYWdlJywgdXJpOiAnYWdlbnQ6Ly90cmlhZ2UnLCBuYW1lOiAndHJpYWdlJyB9LFxuXHRcdF0pO1xuXHRcdGFzc2VydC5vayhmaXJlZCA+IDAsICdleHBlY3RlZCBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyB0byBmaXJlIHdoZW4gU2Vzc2lvblN0YXRlIGFycml2ZXMnKTtcblxuXHRcdC8vIEEgc2Vjb25kIHVwZGF0ZSB3aXRoIGEgZGlmZmVyZW50IGN1c3RvbWl6YXRpb25zIGlkZW50aXR5IHNob3VsZFxuXHRcdC8vIHJlLWZpcmUgYW5kIHVwZGF0ZSB0aGUgcGlja2VyLlxuXHRcdGNvbnN0IGFmdGVyID0gZmlyZWQ7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZShyYXdJZCwgc2Vzc2lvblR5cGVJZCwge1xuXHRcdFx0Li4uc3RhdGUsXG5cdFx0XHRjdXN0b21pemF0aW9uczogW3tcblx0XHRcdFx0Li4uKGN1c3RvbWl6YXRpb25zWzBdIGFzIEV4dHJhY3Q8Q3VzdG9taXphdGlvbiwgeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4gfT4pLFxuXHRcdFx0XHRjaGlsZHJlbjogW3sgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9vbmx5JywgdXJpOiAnYWdlbnQ6Ly9vbmx5JywgbmFtZTogJ29ubHknIH1dLFxuXHRcdFx0fV0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEN1c3RvbUFnZW50cyhzZXNzaW9uLnNlc3Npb25JZCksIFtcblx0XHRcdHsgdHlwZTogQ3VzdG9taXphdGlvblR5cGUuQWdlbnQsIGlkOiAnYWdlbnQ6Ly9vbmx5JywgdXJpOiAnYWdlbnQ6Ly9vbmx5JywgbmFtZTogJ29ubHknIH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcmVkID4gYWZ0ZXIsICdleHBlY3RlZCBvbkRpZENoYW5nZUN1c3RvbUFnZW50cyB0byBmaXJlIGFnYWluIG9uIGEgc2Vjb25kIHVwZGF0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCdOZXdTZXNzaW9uIHB1Ymxpc2hlcyBBZ2VudCBIb3N0IGdpdCBtZXRhZGF0YSBiZWZvcmUgdGhlIGZpcnN0IG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uVHlwZUlkID0gcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvaicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHJhd0lkID0gc2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblxuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUocmF3SWQsIHNlc3Npb25UeXBlSWQsIHtcblx0XHRcdHByb3ZpZGVyOiBzZXNzaW9uVHlwZUlkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y3VzdG9taXphdGlvbnM6IFtdLFxuXHRcdFx0X21ldGE6IHtcblx0XHRcdFx0Z2l0aHViOiB7XG5cdFx0XHRcdFx0b3duZXI6ICdwYXJ0aWFsLW93bmVyJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0Z2l0OiB7XG5cdFx0XHRcdFx0aGFzR2l0SHViUmVtb3RlOiB0cnVlLFxuXHRcdFx0XHRcdGdpdGh1Yk93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0XHRnaXRodWJSZXBvOiAndnNjb2RlJyxcblx0XHRcdFx0XHRicmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZ2l0UmVwb3NpdG9yeSA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzR2l0SHViUmVtb3RlOiBnaXRSZXBvc2l0b3J5Py5oYXNHaXRIdWJSZW1vdGUsXG5cdFx0XHRicmFuY2hOYW1lOiBnaXRSZXBvc2l0b3J5Py5icmFuY2hOYW1lLFxuXHRcdFx0Z2l0SHViSW5mbzogZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRoYXNHaXRIdWJSZW1vdGU6IHRydWUsXG5cdFx0XHRicmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHRnaXRIdWJJbmZvOiB7XG5cdFx0XHRcdG93bmVyOiAnbWljcm9zb2Z0Jyxcblx0XHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0czogdW5kZWZpbmVkLFxuXHRcdFx0XHRwdWxsUmVxdWVzdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc3N1ZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05ld1Nlc3Npb24gcmVsZWFzZXMgb2JzZXJ2ZWQgY2hhbmdlc2V0IHN1YnNjcmlwdGlvbnMgd2hlbiBpbmFjdGl2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVTZXNzaW9uPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gc2Vzc2lvbi5yZXNvdXJjZTtcblx0XHR9KCksIHVuZGVmaW5lZCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGZvciAoY29uc3QgY2hhbmdlc2V0IG9mIHNlc3Npb24uY2hhbmdlc2V0cz8ucmVhZChyZWFkZXIpID8/IFtdKSB7XG5cdFx0XHRcdGNoYW5nZXNldC5jaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBiYWNrZW5kVXJpID0gYWdlbnRIb3N0LmNyZWF0ZWRTZXNzaW9uVXJpcy5hdCgtMSkhO1xuXHRcdGNvbnN0IGNoYW5nZXNldFVyaSA9IGAke2JhY2tlbmRVcml9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZShBZ2VudFNlc3Npb24uaWQoYmFja2VuZFVyaSksIHNlc3Npb25UeXBlSWQsIHtcblx0XHRcdHByb3ZpZGVyOiBzZXNzaW9uVHlwZUlkLFxuXHRcdFx0dGl0bGU6ICcnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y2hhbmdlc2V0czogW1xuXHRcdFx0XHR7IGxhYmVsOiAnVW5jb21taXR0ZWQgQ2hhbmdlcycsIHVyaVRlbXBsYXRlOiBjaGFuZ2VzZXRVcmksIGNoYW5nZUtpbmQ6ICd1bmNvbW1pdHRlZCcgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChjaGFuZ2VzZXRVcmkpLCAxKTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHVuZGVmaW5lZCwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoY2hhbmdlc2V0VXJpKSwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05ld1Nlc3Npb24gZGlzcG9zZSBjbGVhcnMgX2xhc3RTZXNzaW9uU3RhdGVzIGVudHJ5IGFuZCBmaXJlcyBvbkRpZENoYW5nZUN1c3RvbUFnZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cdFx0Y29uc3QgZmlyc3QgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYScpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgcmF3SWQgPSBmaXJzdC5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKHJhd0lkLCBzZXNzaW9uVHlwZUlkLCB7XG5cdFx0XHRwcm92aWRlcjogc2Vzc2lvblR5cGVJZCxcblx0XHRcdHRpdGxlOiAnJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAncGx1Z2luOi8veCcsXG5cdFx0XHRcdHVyaTogJ3BsdWdpbjovL3gnLFxuXHRcdFx0XHRuYW1lOiAncCcsXG5cdFx0XHRcdGxvYWQ6IHsga2luZDogQ3VzdG9taXphdGlvbkxvYWRTdGF0dXMuTG9hZGVkIH0sXG5cdFx0XHRcdGNoaWxkcmVuOiBbeyB0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5BZ2VudCwgaWQ6ICdhZ2VudDovL3gnLCB1cmk6ICdhZ2VudDovL3gnLCBuYW1lOiAneCcgfV0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3VzdG9tQWdlbnRzKGZpcnN0LnNlc3Npb25JZCkubGVuZ3RoLCAxKTtcblxuXHRcdGxldCBmaXJlZCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzKCgpID0+IHsgZmlyZWQrKzsgfSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciBkaXNwb3NhbCBvZiB0aGUgZmlyc3QgTmV3U2Vzc2lvbiBleHBsaWNpdGx5LiBQcm92aWRlcnMgbm9cblx0XHQvLyBsb25nZXIgZGlzcG9zZSBkcmFmdHMgaW1wbGljaXRseSB3aGVuIGEgbmV3IG9uZSBpcyBjcmVhdGVkLCBzbyB0aGVcblx0XHQvLyBtYW5hZ2VtZW50IGxheWVyIChtb2RlbGVkIGhlcmUpIGRpc3Bvc2VzIHRoZSBhYmFuZG9uZWQgZHJhZnQuXG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2InKSwgc2Vzc2lvblR5cGVJZCk7XG5cdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihmaXJzdC5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyLmdldEN1c3RvbUFnZW50cyhmaXJzdC5zZXNzaW9uSWQpLCBbXSk7XG5cdFx0YXNzZXJ0Lm9rKGZpcmVkID4gMCwgJ2V4cGVjdGVkIG9uRGlkQ2hhbmdlQ3VzdG9tQWdlbnRzIHRvIGZpcmUgb24gTmV3U2Vzc2lvbiBkaXNwb3NlJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBsaWZlY3ljbGUgLS0tLS0tLVxuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gcmV0dXJucyBzZXNzaW9uIHdpdGggY29ycmVjdCBmaWVsZHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL215LXByb2plY3QnKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2VVcmksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVySWQ6IHNlc3Npb24ucHJvdmlkZXJJZCxcblx0XHRcdHN0YXR1czogc2Vzc2lvbi5zdGF0dXMuZ2V0KCksXG5cdFx0XHR3b3Jrc3BhY2VMYWJlbDogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk/LmxhYmVsLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHNlc3Npb24uc2Vzc2lvblR5cGUsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLFxuXHRcdFx0d29ya3NwYWNlTGFiZWw6ICdteS1wcm9qZWN0Jyxcblx0XHRcdHNlc3Npb25UeXBlOiBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsXG5cdFx0XHRjb25maWc6IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0TmV3U2Vzc2lvblJlcXVlc3QgZXhwb3NlcyBzZXNzaW9uIGFjdGl2aXR5IHVudGlsIGRpc3Bvc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9teS1wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHRjb25zdCBhY3Rpdml0eSA9ICdGZXRjaGluZyBwdWxsIHJlcXVlc3QuLi4nO1xuXHRcdGNvbnN0IHByZXBhcmF0aW9uID0gcHJvdmlkZXIuc3RhcnROZXdTZXNzaW9uUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgYWN0aXZpdHkpO1xuXHRcdGNvbnN0IGR1cmluZ0Rlc2NyaXB0aW9uID0gc2Vzc2lvbi5kZXNjcmlwdGlvbi5nZXQoKTtcblx0XHRjb25zdCBkdXJpbmcgPSBkdXJpbmdEZXNjcmlwdGlvbiA/IHJlbmRlckFzUGxhaW50ZXh0KGR1cmluZ0Rlc2NyaXB0aW9uKSA6IHVuZGVmaW5lZDtcblx0XHRwcmVwYXJhdGlvbi5kaXNwb3NlKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXR1czogc2Vzc2lvbi5zdGF0dXMuZ2V0KCksXG5cdFx0XHRkdXJpbmcsXG5cdFx0XHRhZnRlcjogc2Vzc2lvbi5kZXNjcmlwdGlvbi5nZXQoKT8udmFsdWUsXG5cdFx0fSwge1xuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRkdXJpbmc6IGFjdGl2aXR5LFxuXHRcdFx0YWZ0ZXI6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBmb3J3YXJkcyBpbml0aWFsIG1ldGFkYXRhIHRvIHRoZSBhZ2VudCBob3N0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL215LXByb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkLCB7XG5cdFx0XHRtZXRhZGF0YTogeyBnaXRodWI6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9wdWxsLzQyJyB9IH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmNyZWF0ZVNlc3Npb25Db25maWdzLmF0KC0xKT8ubWV0YWRhdGEsIHtcblx0XHRcdGdpdGh1YjogeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86ICd2c2NvZGUnLCBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvNDInIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gUXVpY2sgY2hhdHMgKHdvcmtzcGFjZS1sZXNzIHNlc3Npb25zKSAtLS0tLS0tXG5cblx0dGVzdCgnZGVjbGFyZXMgcXVpY2sgY2hhdCBzdXBwb3J0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLnN1cHBvcnRzUXVpY2tDaGF0cywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVF1aWNrQ2hhdCByZXR1cm5zIGEgd29ya3NwYWNlLWxlc3MgdW50aXRsZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVRdWlja0NoYXQocHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvdmlkZXJJZDogc2Vzc2lvbi5wcm92aWRlcklkLFxuXHRcdFx0c3RhdHVzOiBzZXNzaW9uLnN0YXR1cy5nZXQoKSxcblx0XHRcdHdvcmtzcGFjZTogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCksXG5cdFx0XHRzZXNzaW9uVHlwZTogc2Vzc2lvbi5zZXNzaW9uVHlwZSxcblx0XHRcdGlzUXVpY2tDaGF0OiBzZXNzaW9uLmlzUXVpY2tDaGF0Py5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRwcm92aWRlcklkOiBwcm92aWRlci5pZCxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCxcblx0XHRcdHdvcmtzcGFjZTogdW5kZWZpbmVkLFxuXHRcdFx0c2Vzc2lvblR5cGU6IHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCxcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVRdWlja0NoYXQgZWFnZXJseSBjcmVhdGVzIHRoZSBiYWNrZW5kIHNlc3Npb24gd2l0aCBubyB3b3JraW5nIGRpcmVjdG9yeSAoaW5mZXJyZWQgd29ya3NwYWNlLWxlc3MpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlUXVpY2tDaGF0KHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IGVhZ2VyQ3JlYXRlIGNvbXBsZXRlXG5cblx0XHQvLyBUaGUgcHJvdmlkZXIgbm8gbG9uZ2VyIHBhc3NlcyBhbiBleHBsaWNpdCBxdWljay1jaGF0IGZsYWc7IHRoZSBob3N0XG5cdFx0Ly8gaW5mZXJzIHdvcmtzcGFjZS1sZXNzIGZyb20gdGhlIGFic2VudCBgd29ya2luZ0RpcmVjdG9yeWAuXG5cdFx0Y29uc3QgY3JlYXRlZCA9IGFnZW50SG9zdC5jcmVhdGVTZXNzaW9uQ29uZmlncy5hdCgtMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNyZWF0ZWQ/LndvcmtpbmdEaXJlY3RvcnksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVF1aWNrQ2hhdCB0aHJvd3Mgd2hlbiBubyBhZ2VudHMgYXJlIGFkdmVydGlzZWQnLCAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhc3NlcnQudGhyb3dzKCgpID0+IHByb3ZpZGVyLmNyZWF0ZVF1aWNrQ2hhdCgnY29waWxvdGNsaScpKTtcblx0fSk7XG5cblx0dGVzdCgnZGVyaXZlcyBhdXRvbWF0aW9uIHByb3ZlbmFuY2UgZnJvbSB0aGUgcHJvdmlkZXIgcnVuIGxlZGdlcicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2F1dG9tYXRpb24tMScsIHsgc3VtbWFyeTogJ0F1dG9tYXRpb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdGNvbnN0IGNoYW5nZWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGV2ZW50ID0+IHtcblx0XHRcdGlmIChldmVudC5jaGFuZ2VkLmluY2x1ZGVzKHNlc3Npb24pKSB7XG5cdFx0XHRcdGNoYW5nZWQucHVzaChzZXNzaW9uLmlzQXV0b21hdGlvbj8uZ2V0KCkgPz8gZmFsc2UpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IGF1dG9tYXRpb24gPSBhd2FpdCBwcm92aWRlci5hdXRvbWF0aW9ucy5jcmVhdGVBdXRvbWF0aW9uKHtcblx0XHRcdG5hbWU6ICdBdXRvbWF0aW9uJyxcblx0XHRcdHByb21wdDogJ1J1bicsXG5cdFx0XHRzY2hlZHVsZTogeyBpbnRlcnZhbDogJ21hbnVhbCcsIHNjaGVkdWxlSG91cjogMCwgc2NoZWR1bGVNaW51dGU6IDAsIHNjaGVkdWxlRGF5OiAwIH0sXG5cdFx0XHR0YXJnZXQ6IHsga2luZDogJ3F1aWNrQ2hhdCcsIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfSxcblx0XHR9KTtcblx0XHRjb25zdCBjbGFpbSA9IGF3YWl0IHByb3ZpZGVyLmF1dG9tYXRpb25zLnJlY29yZFJ1blN0YXJ0KGF1dG9tYXRpb24uaWQsICdtYW51YWwnLCAxKTtcblx0XHRhd2FpdCBwcm92aWRlci5hdXRvbWF0aW9ucy51cGRhdGVSdW4oY2xhaW0ucnVuLmlkLCB7IHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbi5yZXNvdXJjZSB9KTtcblx0XHRjb25zdCBtYXJrZWQgPSBzZXNzaW9uLmlzQXV0b21hdGlvbj8uZ2V0KCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5hdXRvbWF0aW9ucy5kZWxldGVSdW4oY2xhaW0ucnVuLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWFya2VkLFxuXHRcdFx0YWZ0ZXJEZWxldGU6IHNlc3Npb24uaXNBdXRvbWF0aW9uPy5nZXQoKSxcblx0XHRcdGNoYW5nZWQsXG5cdFx0fSwge1xuXHRcdFx0bWFya2VkOiB0cnVlLFxuXHRcdFx0YWZ0ZXJEZWxldGU6IGZhbHNlLFxuXHRcdFx0Y2hhbmdlZDogW3RydWUsIGZhbHNlXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIGEgcXVpY2sgY2hhdCBmcm9tIGxpc3RTZXNzaW9ucyBhcyB3b3Jrc3BhY2UtbGVzcyBkZXNwaXRlIGEgc2NyYXRjaCB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIE9uIHJlbG9hZCB0aGUgaG9zdCByZS1hZHZlcnRpc2VzIHRoZSBxdWljayBjaGF0IHRhZ2dlZCB2aWFcblx0XHQvLyBgX21ldGEud29ya3NwYWNlbGVzc2AsIGJ1dCB3aXRoIHRoZSB0aHJvd2F3YXkgc2NyYXRjaCBjd2QgaXQgYXNzaWduZWQuXG5cdFx0Ly8gVGhlIHJlc3RvcmVkIHNlc3Npb24gbXVzdCBzdGF5IHdvcmtzcGFjZS1sZXNzIHNvIGl0IGdyb3VwcyB1bmRlclxuXHRcdC8vIFwiUXVpY2sgQ2hhdHNcIiBhbmQgc2tpcHMgd29ya3NwYWNlIHRydXN0LlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3F1aWNrLTEnLCB7XG5cdFx0XHRzdW1tYXJ5OiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3RtcC9jb3BpbG90LXNjcmF0Y2gvcXVpY2stMScpLFxuXHRcdFx0cXVpY2tDaGF0OiB0cnVlLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0aXRsZTogc2Vzc2lvbj8udGl0bGUuZ2V0KCksXG5cdFx0XHR3b3Jrc3BhY2U6IHNlc3Npb24/LndvcmtzcGFjZS5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHR0aXRsZTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya3NwYWNlOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXN0b3JlZCBxdWljayBjaGF0IHJlcG9ydHMgc3VwcG9ydHNNdWx0aXBsZUNoYXRzID09PSBmYWxzZScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgcXVpY2sgY2hhdCBpcyBhIHNpbmdsZS1jaGF0IHNlc3Npb24gcmVnYXJkbGVzcyBvZiBzZXNzaW9uIHR5cGU6XG5cdFx0Ly8gdGhlIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCB0YWcgZm9yY2VzIGBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlYC5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdxdWljay0xJywge1xuXHRcdFx0c3VtbWFyeTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy90bXAvY29waWxvdC1zY3JhdGNoL3F1aWNrLTEnKSxcblx0XHRcdHF1aWNrQ2hhdDogdHJ1ZSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbj8uY2FwYWJpbGl0aWVzLmdldCgpLCB7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsIHN1cHBvcnRzRm9yazogdHJ1ZSwgc3VwcG9ydHNTaWRlQ2hhdDogZmFsc2UsIHN1cHBvcnRzUmVuYW1lOiB0cnVlLCBzdXBwb3J0c0RlbGV0ZTogdHJ1ZSB9KTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Jlc3RvcmVkIHF1aWNrIGNoYXQgY29sbGFwc2VzIHRvIGEgc2luZ2xlIGNoYXQgZXZlbiB3aGVuIHN0YXRlIGFkdmVydGlzZXMgcGVlciBjaGF0cycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgcXVpY2sgY2hhdCBpcyBzaW5nbGUtY2hhdDogZXZlbiBpZiBhIHJlc3RvcmVkIGBTZXNzaW9uU3RhdGVgXG5cdFx0Ly8gYWR2ZXJ0aXNlcyBwZWVyIGNoYXRzLCBgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZWAgY29sbGFwc2VzIHRoZVxuXHRcdC8vIGNhdGFsb2cgdG8gdGhlIGRlZmF1bHQgY2hhdC4gVGhlIHN0YXRlIHN1YnNjcmlwdGlvbidzIGBfbWV0YWAgKHdoaWNoXG5cdFx0Ly8gdGhlIGhvc3QgY29waWVzIGZyb20gdGhlIHN1bW1hcnkpIG11c3Qga2VlcCB0aGUgd29ya3NwYWNlLWxlc3MgdGFnLlxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3F1aWNrLW11bHRpJywge1xuXHRcdFx0c3VtbWFyeTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy90bXAvY29waWxvdC1zY3JhdGNoL3F1aWNrLW11bHRpJyksXG5cdFx0XHRxdWlja0NoYXQ6IHRydWUsXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHQvLyBTdWJzY3JpYmUgdG8gc2Vzc2lvbiBzdGF0ZSBzbyB0aGUgcmVzdG9yZWQgc25hcHNob3QgcmVhY2hlcyB0aGUgYWRhcHRlci5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3F1aWNrLW11bHRpJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgncXVpY2stbXVsdGknLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0c3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0ZGVmYXVsdENoYXQsXG5cdFx0XHRfbWV0YTogd2l0aFNlc3Npb25Xb3Jrc3BhY2VsZXNzKHVuZGVmaW5lZCwgdHJ1ZSksXG5cdFx0XHRjaGF0czogW1xuXHRcdFx0XHR7IHJlc291cmNlOiBkZWZhdWx0Q2hhdCwgdGl0bGU6ICcnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyksIHRpdGxlOiAnUGVlciBPbmUnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH0sXG5cdFx0XHRcdHsgcmVzb3VyY2U6IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0yJyksIHRpdGxlOiAnUGVlciBUd28nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3Jrc3BhY2U6IHNlc3Npb24ud29ya3NwYWNlLmdldCgpLFxuXHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsXG5cdFx0XHRjaGF0RnJhZ21lbnRzOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLFxuXHRcdFx0Y2hhdFRpdGxlczogc2Vzc2lvbi5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHR9LCB7XG5cdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UsXG5cdFx0XHRjaGF0RnJhZ21lbnRzOiBbJyddLFxuXHRcdFx0Y2hhdFRpdGxlczogWydRdWljayBDaGF0J10sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdwcm9tb3RlcyBhbiB1bnRhZ2dlZCBzZXNzaW9uIHRvIGEgcXVpY2sgY2hhdCBvbmNlIHN0YXRlIHJlcG9ydHMgaXQgd29ya3NwYWNlLWxlc3MsIGFuZCBwZXJzaXN0cyB0aGUgcHJvbW90aW9uJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogYSBzZXNzaW9uIHdob3NlIGZpcnN0IHNpZ2h0aW5nIGNhcnJpZWQgbm8gYF9tZXRhYCAoYVxuXHRcdC8vIHBlcnNpc3RlZCBjYWNoZSBlbnRyeSB3cml0dGVuIGJlZm9yZSB0aGUgdGFnIHdhcyBwbHVtYmVkIHRocm91Z2gsIG9yIGFcblx0XHQvLyBob3N0IHRoYXQgZHJvcHBlZCBgX21ldGFgIGZyb20gaXRzIGxpc3RpbmcpIGlzIGJvcm4gd29ya3NwYWNlLWJvdW5kLFxuXHRcdC8vIHNvIHRoZSBob3N0J3MgdGhyb3dhd2F5IHNjcmF0Y2ggY3dkIHN1cmZhY2VzIGFzIGEgd29ya3NwYWNlIGZvbGRlclxuXHRcdC8vIG5hbWVkIGFmdGVyIHRoZSBzZXNzaW9uIGlkLiBUaGUga2luZCBtdXN0IGhlYWwgaXRzZWxmIGFzIHNvb24gYXMgYW5cblx0XHQvLyBhdXRob3JpdGF0aXZlIGBfbWV0YS53b3Jrc3BhY2VsZXNzYCBhcnJpdmVzIFx1MjAxNCBhbmQgdGhlIGhlYWxlZCBraW5kIG11c3Rcblx0XHQvLyByZWFjaCB0aGUgcGVyc2lzdGVkIGNhY2hlLCBvdGhlcndpc2UgdGhlIG5leHQgbGF1bmNoIHJlc3VycmVjdHMgdGhlXG5cdFx0Ly8gbWlzLWNsYXNzaWZpY2F0aW9uIGZyb20gdGhlIHN0YWxlIHNuYXBzaG90LlxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3F1aWNrLXVudGFnZ2VkJywge1xuXHRcdFx0c3VtbWFyeTogJ1F1aWNrIENoYXQnLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeTogVVJJLmZpbGUoJy9ob21lL3VzZXIvLmNvcGlsb3QvY2hhdHMvcXVpY2stdW50YWdnZWQnKSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRjb25zdCBiZWZvcmVQcm9tb3Rpb24gPSB7IGhhc1dvcmtzcGFjZTogc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCkgIT09IHVuZGVmaW5lZCwgaXNRdWlja0NoYXQ6IHNlc3Npb24uaXNRdWlja0NoYXQ/LmdldCgpIH07XG5cblx0XHQvLyBTdWJzY3JpYmUgdG8gc2Vzc2lvbiBzdGF0ZSBzbyB0aGUgaG9zdCdzIHNuYXBzaG90IHJlYWNoZXMgdGhlIGFkYXB0ZXIuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdxdWljay11bnRhZ2dlZCcpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3F1aWNrLXVudGFnZ2VkJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdRdWljayBDaGF0Jyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGRlZmF1bHRDaGF0LFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0Y2hhdHM6IFt7IHJlc291cmNlOiBkZWZhdWx0Q2hhdCwgdGl0bGU6ICcnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH1dLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHN0b3JhZ2VTZXJ2aWNlLmZsdXNoKCk7XG5cblx0XHQvLyBOZXh0IGxhdW5jaCBoeWRyYXRlcyBmcm9tIHRoZSBwZXJzaXN0ZWQgY2FjaGUgKGF1dGhlbnRpY2F0aW9uIHBlbmRpbmcsXG5cdFx0Ly8gc28gbm8gbGlzdGluZyBjYW4gcmUtc3VwcGx5IHRoZSB0YWcpLlxuXHRcdGNvbnN0IG5leHRIb3N0ID0gbmV3IE1vY2tBZ2VudEhvc3RTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBuZXh0SG9zdC5kaXNwb3NlKCkpKTtcblx0XHRuZXh0SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0Y29uc3QgaHlkcmF0ZWQgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbmV4dEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KS5nZXRTZXNzaW9ucygpWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRiZWZvcmVQcm9tb3Rpb24sXG5cdFx0XHRhZnRlclByb21vdGlvbjogeyB3b3Jrc3BhY2U6IHNlc3Npb24ud29ya3NwYWNlLmdldCgpLCBpc1F1aWNrQ2hhdDogc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KCkgfSxcblx0XHRcdGFmdGVyUmVsb2FkOiB7IHdvcmtzcGFjZTogaHlkcmF0ZWQ/LndvcmtzcGFjZS5nZXQoKSwgaXNRdWlja0NoYXQ6IGh5ZHJhdGVkPy5pc1F1aWNrQ2hhdD8uZ2V0KCkgfSxcblx0XHR9LCB7XG5cdFx0XHRiZWZvcmVQcm9tb3Rpb246IHsgaGFzV29ya3NwYWNlOiB0cnVlLCBpc1F1aWNrQ2hhdDogZmFsc2UgfSxcblx0XHRcdGFmdGVyUHJvbW90aW9uOiB7IHdvcmtzcGFjZTogdW5kZWZpbmVkLCBpc1F1aWNrQ2hhdDogdHJ1ZSB9LFxuXHRcdFx0YWZ0ZXJSZWxvYWQ6IHsgd29ya3NwYWNlOiB1bmRlZmluZWQsIGlzUXVpY2tDaGF0OiB0cnVlIH0sXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXBvcnRzIGEga2luZC1vbmx5IHByb21vdGlvbiBzbyB0aGUgbGlzdCByZWdyb3VwcyBhIHNlc3Npb24gdGhhdCBuZXZlciBoYWQgYSB3b3Jrc3BhY2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBwcm9tb3Rpb24gbXVzdCBiZSBhbm5vdW5jZWQgZXZlbiB3aGVuIHRoZSB3b3Jrc3BhY2UgZG9lc1xuXHRcdC8vIG5vdCBjaGFuZ2UuIEFuIHVudGFnZ2VkIHNlc3Npb24gd2l0aCBubyB3b3JraW5nIGRpcmVjdG9yeSBhbHJlYWR5IGhhc1xuXHRcdC8vIGB3b3Jrc3BhY2UgPT09IHVuZGVmaW5lZGAsIHNvIGtleWluZyB0aGUgY2hhbmdlIGV2ZW50IG9mZiB0aGVcblx0XHQvLyB3b3Jrc3BhY2UgYWxvbmUgd291bGQgc2lsZW50bHkgcHJvbW90ZSBpdCBhbmQgbGVhdmUgdGhlIHNpZGViYXJcblx0XHQvLyBzaG93aW5nIGl0IG91dHNpZGUgdGhlIFwiQ2hhdHNcIiBzZWN0aW9uIHVudGlsIHNvbWUgdW5yZWxhdGVkIGV2ZW50XG5cdFx0Ly8gZm9yY2VkIGEgcmVncm91cC5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdxdWljay1uby1jd2QnLCB7IHN1bW1hcnk6ICdRdWljayBDaGF0JyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0Y29uc3QgY2hhbmdlZDogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZWQucHVzaCguLi5lLmNoYW5nZWQubWFwKHMgPT4gcy5zZXNzaW9uSWQpKSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncXVpY2stbm8tY3dkJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgncXVpY2stbm8tY3dkJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLFxuXHRcdFx0dGl0bGU6ICdRdWljayBDaGF0Jyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGRlZmF1bHRDaGF0LFxuXHRcdFx0X21ldGE6IHdpdGhTZXNzaW9uV29ya3NwYWNlbGVzcyh1bmRlZmluZWQsIHRydWUpLFxuXHRcdFx0Y2hhdHM6IFt7IHJlc291cmNlOiBkZWZhdWx0Q2hhdCwgdGl0bGU6ICcnLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH1dLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogc2Vzc2lvbi5pc1F1aWNrQ2hhdD8uZ2V0KCksXG5cdFx0XHRhbm5vdW5jZWQ6IGNoYW5nZWQuaW5jbHVkZXMoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0YW5ub3VuY2VkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnbGlzdGluZyByZWNvbmNpbGUgcHJvbW90ZXMgYSBjYWNoZWQgYWRhcHRlciBpbiBwbGFjZSBhbmQgYW5ub3VuY2VzIHRoZSByZWdyb3VwJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogYSBzdGFydHVwLWNhY2hlIGVudHJ5IHdyaXR0ZW4gd2hpbGUgdGhlIGBsaXN0U2Vzc2lvbnNgXG5cdFx0Ly8gd2lyZSBkcm9wcGVkIGBfbWV0YWAgaXMgaHlkcmF0ZWQgYXMgd29ya3NwYWNlLWJvdW5kLiBUaGUgZmlyc3Rcblx0XHQvLyBhdXRob3JpdGF0aXZlIGxpc3RpbmcgbXVzdCBwcm9tb3RlIHRoYXQgKnNhbWUqIGFkYXB0ZXIgaW4gcGxhY2UgYW5kXG5cdFx0Ly8gcmVwb3J0IGl0IGluIGBjaGFuZ2VkYCwgc2luY2UgdGhlIGxpc3QgcmVncm91cHMgaW1wZXJhdGl2ZWx5LlxuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHNjcmF0Y2hEaXIgPSBVUkkuZmlsZSgnL2hvbWUvdXNlci8uY29waWxvdC9jaGF0cy9xdWljay1wb2lzb25lZCcpO1xuXHRcdGF3YWl0IHBlcnNpc3RDYWNoZWRTZXNzaW9ucyhkaXNwb3NhYmxlcywgc3RvcmFnZVNlcnZpY2UsIFtcblx0XHRcdGNyZWF0ZVNlc3Npb24oJ3F1aWNrLXBvaXNvbmVkJywgeyBzdW1tYXJ5OiAnUXVpY2sgQ2hhdCcsIHdvcmtpbmdEaXJlY3Rvcnk6IHNjcmF0Y2hEaXIgfSksXG5cdFx0XSk7XG5cblx0XHQvLyBOZXh0IGxhdW5jaDogdGhlIGhvc3Qgbm93IHJlcG9ydHMgdGhlIHNlc3Npb24gYXMgd29ya3NwYWNlLWxlc3MuXG5cdFx0Y29uc3QgbmV4dEhvc3QgPSBuZXcgTW9ja0FnZW50SG9zdFNlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG5leHRIb3N0LmRpc3Bvc2UoKSkpO1xuXHRcdG5leHRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncXVpY2stcG9pc29uZWQnLCB7IHN1bW1hcnk6ICdRdWljayBDaGF0Jywgd29ya2luZ0RpcmVjdG9yeTogc2NyYXRjaERpciwgcXVpY2tDaGF0OiB0cnVlIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG5leHRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3QgaHlkcmF0ZWQgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdGNvbnN0IGZyb21DYWNoZSA9IHsgaGFzV29ya3NwYWNlOiBoeWRyYXRlZC53b3Jrc3BhY2UuZ2V0KCkgIT09IHVuZGVmaW5lZCwgaXNRdWlja0NoYXQ6IGh5ZHJhdGVkLmlzUXVpY2tDaGF0Py5nZXQoKSB9O1xuXG5cdFx0Y29uc3QgY2hhbmdlZDogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZWQucHVzaCguLi5lLmNoYW5nZWQubWFwKHMgPT4gcy5zZXNzaW9uSWQpKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZyb21DYWNoZSxcblx0XHRcdGFmdGVyTGlzdGluZzogeyB3b3Jrc3BhY2U6IGh5ZHJhdGVkLndvcmtzcGFjZS5nZXQoKSwgaXNRdWlja0NoYXQ6IGh5ZHJhdGVkLmlzUXVpY2tDaGF0Py5nZXQoKSB9LFxuXHRcdFx0YW5ub3VuY2VkOiBjaGFuZ2VkLmluY2x1ZGVzKGh5ZHJhdGVkLnNlc3Npb25JZCksXG5cdFx0XHRoZWFsZWRJblBsYWNlOiBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdID09PSBoeWRyYXRlZCxcblx0XHR9LCB7XG5cdFx0XHRmcm9tQ2FjaGU6IHsgaGFzV29ya3NwYWNlOiB0cnVlLCBpc1F1aWNrQ2hhdDogZmFsc2UgfSxcblx0XHRcdGFmdGVyTGlzdGluZzogeyB3b3Jrc3BhY2U6IHVuZGVmaW5lZCwgaXNRdWlja0NoYXQ6IHRydWUgfSxcblx0XHRcdGFubm91bmNlZDogdHJ1ZSxcblx0XHRcdGhlYWxlZEluUGxhY2U6IHRydWUsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjb21taXR0ZWQgcXVpY2sgY2hhdCBhbm5vdW5jZWQgdmlhIHNlc3Npb25BZGRlZCBzdGF5cyB3b3Jrc3BhY2UtbGVzcyBkZXNwaXRlIGEgc2NyYXRjaCB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHdoZW4gYSBxdWljay1jaGF0IGRyYWZ0IGdyYWR1YXRlcywgdGhlIGhvc3QgYW5ub3VuY2VzIHRoZVxuXHRcdC8vIGNvbW1pdHRlZCBzZXNzaW9uIHZpYSBhIGBzZXNzaW9uQWRkZWRgIG5vdGlmaWNhdGlvbiB3aG9zZSBzdW1tYXJ5XG5cdFx0Ly8gY2FycmllcyBgX21ldGEud29ya3NwYWNlbGVzc2AgXHUyMDE0IGJ1dCBhbHNvIHRoZSBzY3JhdGNoIGN3ZCB0aGUgaG9zdFxuXHRcdC8vIGFzc2lnbmVkLiBUaGUgYWRhcHRlciBzZWVkcyBpdHMgc2Vzc2lvbi1raW5kIGF0IGNvbnN0cnVjdGlvbiwgc28gdGhlXG5cdFx0Ly8gdGFnIHNob3VsZCByZWFjaCBpdCBoZXJlIChub3QganVzdCB2aWEgdGhlIGxhdGVyIGxpc3RTZXNzaW9ucy9zdGF0ZVxuXHRcdC8vIGNoYW5uZWxzKSwgb3RoZXJ3aXNlIGB3b3Jrc3BhY2VgIGxlYWtzIHRoZSBzY3JhdGNoIGZvbGRlciB1bnRpbCBhXG5cdFx0Ly8gbGF0ZXIgYF9tZXRhYCBoZWFscyBpdCBhbmQgdGhlIGFyY2hpdmUtb24tZGVsZXRlIGZhbGxiYWNrIHByZS1maWxscyBhXG5cdFx0Ly8gbmV3IHNlc3Npb24gd2l0aCBpdC5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3F1aWNrLWNvbW1pdHRlZCcsIHtcblx0XHRcdHRpdGxlOiAnUXVpY2sgQ2hhdCcsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL3RtcC9jb3BpbG90LXNjcmF0Y2gvcXVpY2stY29tbWl0dGVkJykudG9TdHJpbmcoKSxcblx0XHRcdHdvcmtzcGFjZWxlc3M6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gQWdlbnRTZXNzaW9uLmlkKHMucmVzb3VyY2UudG9TdHJpbmcoKSkgPT09ICdxdWljay1jb21taXR0ZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtzcGFjZTogc2Vzc2lvbj8ud29ya3NwYWNlLmdldCgpLFxuXHRcdFx0aXNRdWlja0NoYXQ6IHNlc3Npb24/LmlzUXVpY2tDaGF0Py5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHR3b3Jrc3BhY2U6IHVuZGVmaW5lZCxcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBjbGVhcnMgc2Vzc2lvbiBjb25maWcgd2hlbiByZXNvbHZpbmcgY29uZmlnIGlzIHVuYXZhaWxhYmxlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5mYWlsUmVzb2x2ZVNlc3Npb25Db25maWcgPSB0cnVlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjb25maWcgPT4gY29uZmlnID09PSB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIG1hcHMgYWxsb3dBbGwgZnJvbSBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIHRvIGF1dG9BcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nLCB7IGFwcHJvdmFsczogJ2FsbG93QWxsJyB9KTtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHsgYXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddLCB0aXRsZTogJ0F1dG8tYXBwcm92ZScgfSB9IH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdhdXRvQXBwcm92ZScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWcgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlcy5hdXRvQXBwcm92ZSA9PT0gJ2F1dG9BcHByb3ZlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKT8udmFsdWVzLmF1dG9BcHByb3ZlLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5hdXRvQXBwcm92ZSxcblx0XHR9LCB7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogJ2F1dG9BcHByb3ZlJyxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIHNlZWRzIG1vZGUgZnJvbSBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIGFuZCBmb3J3YXJkcyBpdCB0byByZXNvbHZlU2Vzc2lvbkNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBtb2RlOiAnYXV0b3BpbG90JyB9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXMubW9kZSA9PT0gJ2F1dG9waWxvdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk/LnZhbHVlcy5tb2RlLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5tb2RlLFxuXHRcdH0sIHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiAnYXV0b3BpbG90Jyxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiAnYXV0b3BpbG90Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBmb3J3YXJkcyBzZWVkZWQgY29uZmlnIHRvIGVhZ2VyIGNyZWF0ZVNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGF3YWl0IGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsIHsgYXBwcm92YWxzOiAnYWxsb3dBbGwnIH0pO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZyB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5jcmVhdGVTZXNzaW9uQ29uZmlnc1swXT8uY29uZmlnLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGRvZXMgbm90IHNlZWQgYXV0b0FwcHJvdmUgd2hlbiBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIGFwcHJvdmFscyBpcyBtYW51YWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aW5pdGlhbFZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk/LnZhbHVlcyxcblx0XHRcdGZvcndhcmRlZEF1dG9BcHByb3ZlOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZz8uYXV0b0FwcHJvdmUsXG5cdFx0fSwge1xuXHRcdFx0aW5pdGlhbFZhbHVlczoge30sXG5cdFx0XHRmb3J3YXJkZWRBdXRvQXBwcm92ZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGNsYW1wcyBzZWVkZWQgYXV0b0FwcHJvdmUgdG8gZGVmYXVsdCB3aGVuIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZyA9IGNyZWF0ZVBvbGljeVJlc3RyaWN0ZWRDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGF3YWl0IGNvbmZpZy5zZXRVc2VyQ29uZmlndXJhdGlvbignY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicsIHsgYXBwcm92YWxzOiAnYWxsb3dBbGwnIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWcgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlZWRlZEltbWVkaWF0ZWx5OiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKT8udmFsdWVzLmF1dG9BcHByb3ZlLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5hdXRvQXBwcm92ZSxcblx0XHR9LCB7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogJ2RlZmF1bHQnLFxuXHRcdFx0Zm9yd2FyZGVkVG9BZ2VudEhvc3Q6ICdkZWZhdWx0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlIHJlbWVtYmVycyBwb3J0YWJsZSBzdHJpbmcgcGlja3MgYW5kIGRyb3BzIG5vbi1yZW1lbWJlcmVkIGtleXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZVNlcnZpY2Uuc3RvcmUoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdsZWdhY3ktYnJhbmNoJyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCAoKSA9PiAhcHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb24uc2Vzc2lvbklkKS5nZXQoKSk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbi5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCAnZm9sZGVyJyk7XG5cdFx0YXdhaXQgcHJvdmlkZXIuc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlKHNlc3Npb24uc2Vzc2lvbklkLCAnX19wcm90b19fJywgJ3BvbGx1dGVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c3RvcmFnZVNlcnZpY2UuZ2V0T2JqZWN0KFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwge30pLFxuXHRcdFx0eyBbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnZm9sZGVyJyB9LFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RyYWZ0IGNvbmZpZyByZWZyZXNoIHN0YXlzIGxvY2FsIGFuZCBzZW5kIHdhaXRzIGZvciB0aGUgcmVzb2x2ZWQgdmFsdWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZW5kQ2FsbHMgPSAwO1xuXHRcdGxldCBzZW50Q29uZmlnOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKF9yZXNvdXJjZSwgX21lc3NhZ2UsIG9wdGlvbnMpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdHNlbmRDYWxscysrO1xuXHRcdFx0XHRzZW50Q29uZmlnID0gb3B0aW9ucz8uYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZztcblx0XHRcdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignY29uZmlnLXJlc29sdmVkLXNlbmQnLCB7IHN1bW1hcnk6ICdDb25maWcgUmVzb2x2ZWQnIH0pKTtcblx0XHRcdFx0cmV0dXJuIHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBDaGF0U2VuZFJlc3VsdCBleHRlbmRzIHsga2luZDogJ3NlbnQnOyBkYXRhOiBpbmZlciBEIH0gPyBEIDogbmV2ZXIgfTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24uc2Vzc2lvbklkLCBjb25maWcgPT4gY29uZmlnPy52YWx1ZXMuaXNvbGF0aW9uID09PSAnd29ya3RyZWUnKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHR2YWx1ZXM6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgYmFycmllciA9IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ0JhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY29uZmlnUmVmcmVzaCA9IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uLnNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb24sICdmb2xkZXInKTtcblx0XHRjb25zdCBzZW5kID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHtcblx0XHRcdGxvYWRpbmc6IHNlc3Npb24ubG9hZGluZy5nZXQoKSxcblx0XHRcdHJlc29sdmluZzogcHJvdmlkZXIuaXNTZXNzaW9uQ29uZmlnUmVzb2x2aW5nKHNlc3Npb24uc2Vzc2lvbklkKS5nZXQoKSxcblx0XHRcdHNlbmRDYWxscyxcblx0XHR9O1xuXG5cdFx0YXdhaXQgYmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IGNvbmZpZ1JlZnJlc2g7XG5cdFx0Y29uc3QgY29tbWl0dGVkID0gYXdhaXQgc2VuZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGVuZGluZyxcblx0XHRcdHJlc29sdmVkOiB7XG5cdFx0XHRcdHNlbmRDYWxscyxcblx0XHRcdFx0c2VudENvbmZpZyxcblx0XHRcdFx0dGl0bGU6IGNvbW1pdHRlZC50aXRsZS5nZXQoKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0cGVuZGluZzoge1xuXHRcdFx0XHRsb2FkaW5nOiBmYWxzZSxcblx0XHRcdFx0cmVzb2x2aW5nOiB0cnVlLFxuXHRcdFx0XHRzZW5kQ2FsbHM6IDAsXG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZWQ6IHtcblx0XHRcdFx0c2VuZENhbGxzOiAxLFxuXHRcdFx0XHRzZW50Q29uZmlnOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicgfSxcblx0XHRcdFx0dGl0bGU6ICdDb25maWcgUmVzb2x2ZWQnLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3Qgc2VuZCB3YWl0cyBmb3IgdHJ1c3RlZCBlYWdlciBiYWNrZW5kIGNyZWF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVRydXN0QmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRsZXQgc2VuZENhbGxzID0gMDtcblx0XHRsZXQgc3RhdHVzQXRMb2FkOiBTZXNzaW9uU3RhdHVzIHwgdW5kZWZpbmVkO1xuXHRcdGxldCB3aXJlT3BzQXRMb2FkOiBzdHJpbmdbXSB8IHVuZGVmaW5lZDtcblx0XHRsZXQgd2lyZU9wc0F0U2VuZDogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzZXNzaW9uUmVmOiB7IHZhbHVlPzogSVNlc3Npb24gfSA9IHt9O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRvcGVuU2Vzc2lvbjogdHJ1ZSxcblx0XHRcdHdvcmtzcGFjZVRydXN0QmFycmllcixcblx0XHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHN0YXR1c0F0TG9hZCA9IHNlc3Npb25SZWYudmFsdWU/LnN0YXR1cy5nZXQoKTtcblx0XHRcdFx0d2lyZU9wc0F0TG9hZCA9IFsuLi5hZ2VudEhvc3Qud2lyZU9wc107XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdHNlbmRDYWxscysrO1xuXHRcdFx0XHR3aXJlT3BzQXRTZW5kID0gWy4uLmFnZW50SG9zdC53aXJlT3BzXTtcblx0XHRcdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignZWFnZXItY3JlYXRlZC1zZW5kJywgeyBzdW1tYXJ5OiAnRWFnZXIgQ3JlYXRlZCcgfSkpO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRzZXNzaW9uUmVmLnZhbHVlID0gc2Vzc2lvbjtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBzZW5kID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHBlbmRpbmcgPSB7XG5cdFx0XHRzZW5kQ2FsbHMsXG5cdFx0XHRzdGF0dXNBdExvYWQsXG5cdFx0XHR3aXJlT3BzQXRMb2FkLFxuXHRcdFx0d2lyZU9wczogWy4uLmFnZW50SG9zdC53aXJlT3BzXSxcblx0XHR9O1xuXG5cdFx0d29ya3NwYWNlVHJ1c3RCYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0Y29uc3QgY29tbWl0dGVkID0gYXdhaXQgc2VuZDtcblx0XHRjb25zdCBiYWNrZW5kS2V5ID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsIHNlc3Npb24ucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSkpLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBlbmRpbmcsXG5cdFx0XHRyZXNvbHZlZDoge1xuXHRcdFx0XHRzZW5kQ2FsbHMsXG5cdFx0XHRcdHN0YXR1c0F0TG9hZCxcblx0XHRcdFx0d2lyZU9wc0F0TG9hZDogd2lyZU9wc0F0TG9hZD8uZmlsdGVyKG9wID0+IG9wLmVuZHNXaXRoKGJhY2tlbmRLZXkpKSxcblx0XHRcdFx0d2lyZU9wc0F0U2VuZDogd2lyZU9wc0F0U2VuZC5maWx0ZXIob3AgPT4gb3AuZW5kc1dpdGgoYmFja2VuZEtleSkpLFxuXHRcdFx0XHR0aXRsZTogY29tbWl0dGVkLnRpdGxlLmdldCgpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRwZW5kaW5nOiB7XG5cdFx0XHRcdHNlbmRDYWxsczogMCxcblx0XHRcdFx0c3RhdHVzQXRMb2FkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHdpcmVPcHNBdExvYWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0d2lyZU9wczogW10sXG5cdFx0XHR9LFxuXHRcdFx0cmVzb2x2ZWQ6IHtcblx0XHRcdFx0c2VuZENhbGxzOiAxLFxuXHRcdFx0XHRzdGF0dXNBdExvYWQ6IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyxcblx0XHRcdFx0d2lyZU9wc0F0TG9hZDogW2BjcmVhdGVTZXNzaW9uOiR7YmFja2VuZEtleX1gLCBgc3Vic2NyaWJlOiR7YmFja2VuZEtleX1gXSxcblx0XHRcdFx0d2lyZU9wc0F0U2VuZDogW2BjcmVhdGVTZXNzaW9uOiR7YmFja2VuZEtleX1gLCBgc3Vic2NyaWJlOiR7YmFja2VuZEtleX1gXSxcblx0XHRcdFx0dGl0bGU6ICdFYWdlciBDcmVhdGVkJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpcnN0IHNlbmQgZmFsbHMgYmFjayB3aGVuIGVhZ2VyIHdvcmtzcGFjZSB0cnVzdCBsb29rdXAgZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlbmRDYWxscyA9IDA7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0d29ya3NwYWNlVHJ1c3RFcnJvcjogbmV3IEVycm9yKCd0cnVzdCBsb29rdXAgZmFpbGVkJyksXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+IHtcblx0XHRcdFx0c2VuZENhbGxzKys7XG5cdFx0XHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3RydXN0LWZhbGxiYWNrLXNlbmQnLCB7IHN1bW1hcnk6ICdUcnVzdCBGYWxsYmFjaycgfSkpO1xuXHRcdFx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9O1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjb21taXR0ZWQgPSBhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2VuZENhbGxzLFxuXHRcdFx0ZWFnZXJDcmVhdGVDYWxsczogYWdlbnRIb3N0LmNyZWF0ZWRTZXNzaW9uVXJpcy5sZW5ndGgsXG5cdFx0XHR0aXRsZTogY29tbWl0dGVkLnRpdGxlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHNlbmRDYWxsczogMSxcblx0XHRcdGVhZ2VyQ3JlYXRlQ2FsbHM6IDAsXG5cdFx0XHR0aXRsZTogJ1RydXN0IEZhbGxiYWNrJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZHJhZnQgZGlzcG9zYWwgY2FuY2VscyBhIHNlbmQgd2FpdGluZyBmb3IgY29uZmlnIHJlc29sdXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IGJhcnJpZXIgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGNvbmZpZ1JlZnJlc2ggPSBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbi5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCAnZm9sZGVyJyk7XG5cdFx0Y29uc3Qgc2VuZCA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24uc2Vzc2lvbklkLCBjaGF0LnJlc291cmNlLCB7IHF1ZXJ5OiAnaGVsbG8nIH0pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJhY2VUaW1lb3V0KHNlbmQsIDEwMCksIC9DYW5jZWxlZC8pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBiYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0XHRhd2FpdCBjb25maWdSZWZyZXNoO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnbWFwcyB0aGUgZXhpc3RpbmcgaXNvbGF0aW9uIHNldHRlciB0byBhZ2VudC1ob3N0IGNvbmZpZyB3aXRob3V0IHJlbWVtYmVyaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgZmlyc3RBdXRvbWF0aW9uUmVxdWVzdCA9IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmxlbmd0aDtcblxuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdH07XG5cdFx0YXdhaXQgcHJvdmlkZXIuc2V0SXNvbGF0aW9uTW9kZShzZXNzaW9uLnNlc3Npb25JZCwgJ3dvcmtzcGFjZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLnN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uLFxuXHRcdFx0cmVxdWVzdHM6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLnNsaWNlKGZpcnN0QXV0b21hdGlvblJlcXVlc3QpLm1hcChyZXF1ZXN0ID0+IHJlcXVlc3QuY29uZmlnKSxcblx0XHRcdHJlbWVtYmVyZWQ6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHR9LCB7XG5cdFx0XHRzdXBwb3J0c1dvcmt0cmVlQ29uZmlndXJhdGlvbjogdHJ1ZSxcblx0XHRcdHJlcXVlc3RzOiBbXG5cdFx0XHRcdHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdFx0XSxcblx0XHRcdHJlbWVtYmVyZWQ6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRoZSBwcm9ncmFtbWF0aWMgYnJhbmNoIHRyYWNraW5nIHNldHRlciB0byBoaWRkZW4gYWdlbnQtaG9zdCBjb25maWcgd2l0aG91dCByZW1lbWJlcmluZyBpdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGZpcnN0QXV0b21hdGlvblJlcXVlc3QgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGg7XG5cblx0XHRhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sXG5cdFx0XHR2YWx1ZXM6IHsgW1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IGZhbHNlIH0sXG5cdFx0fTtcblx0XHRhd2FpdCBwcm92aWRlci5zZXRXb3JrdHJlZUJyYW5jaFRyYWNrKHNlc3Npb24uc2Vzc2lvbklkLCBmYWxzZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5zbGljZShmaXJzdEF1dG9tYXRpb25SZXF1ZXN0KS5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNvbmZpZyksXG5cdFx0XHRjcmVhdGVTZXNzaW9uQ29uZmlnOiBwcm92aWRlci5nZXRDcmVhdGVTZXNzaW9uQ29uZmlnKHNlc3Npb24uc2Vzc2lvbklkKSxcblx0XHRcdHJlbWVtYmVyZWQ6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHR9LCB7XG5cdFx0XHRyZXF1ZXN0czogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogZmFsc2UsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0Y3JlYXRlU2Vzc2lvbkNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogZmFsc2UgfSxcblx0XHRcdHJlbWVtYmVyZWQ6IHt9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhcHBsaWVzIHByb2dyYW1tYXRpYyB3b3JrdHJlZSBjb25maWd1cmF0aW9uIGluIG9uZSByZXNvbHZlIHdpdGhvdXQgd2FpdGluZyBmb3IgdGhlIHN0YXJ0dXAgcmVzb2x2ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBiYXJyaWVyID0gYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnQmFycmllciA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczoge1xuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Jc29sYXRpb25dOiAnd29ya3RyZWUnLFxuXHRcdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Xb3JrdHJlZUJyYW5jaFRyYWNrXTogdHJ1ZSxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ2ZlYXR1cmUvcHVsbC1yZXF1ZXN0Jyxcblx0XHRcdH0sXG5cdFx0fTtcblxuXHRcdGNvbnN0IHNldHRpbmcgPSBwcm92aWRlci5zZXRXb3JrdHJlZUNvbmZpZ3VyYXRpb24oc2Vzc2lvbi5zZXNzaW9uSWQsIHtcblx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHR3b3JrdHJlZUJyYW5jaFRyYWNrOiB0cnVlLFxuXHRcdFx0YnJhbmNoOiAnZmVhdHVyZS9wdWxsLXJlcXVlc3QnLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgcmVxdWVzdHNCZWZvcmVSZXNvbHZlID0gYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMubWFwKHJlcXVlc3QgPT4gcmVxdWVzdC5jb25maWcpO1xuXHRcdGF3YWl0IGJhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCBzZXR0aW5nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXF1ZXN0c0JlZm9yZVJlc29sdmUsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldENyZWF0ZVNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RzQmVmb3JlUmVzb2x2ZTogW1xuXHRcdFx0XHR7fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScsXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IHRydWUsXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogJ2ZlYXR1cmUvcHVsbC1yZXF1ZXN0Jyxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuV29ya3RyZWVCcmFuY2hUcmFja106IHRydWUsXG5cdFx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkJyYW5jaF06ICdmZWF0dXJlL3B1bGwtcmVxdWVzdCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGJyYW5jaCBjb25maWd1cmF0aW9uIHdoZW4gYWdlbnQtaG9zdCByZXNvbHV0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhZ2VudEhvc3QuZmFpbFJlc29sdmVTZXNzaW9uQ29uZmlnID0gdHJ1ZTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3ZpZGVyLnNldEJyYW5jaChzZXNzaW9uLnNlc3Npb25JZCwgJ2ZlYXR1cmUvYXV0b21hdGlvbicpLCAvcmVzb2x2ZVNlc3Npb25Db25maWcgdW5hdmFpbGFibGUvKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0Q3JlYXRlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdHMgaXNvbGF0aW9uIGNvbmZpZ3VyYXRpb24gd2hlbiB0aGUgZmluYWwgcmVzb2x2ZSBjaGFuZ2VzIHRoZSByZXF1ZXN0ZWQgdmFsdWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSxcblx0XHRcdHZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInLCBicmFuY2g6ICdmZWF0dXJlL2F1dG9tYXRpb24nIH0sXG5cdFx0fTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3ZpZGVyLnNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbi5zZXNzaW9uSWQsICd3b3JrdHJlZScpLCAvZGlkIG5vdCBhcHBseSBzZXNzaW9uIGNvbmZpZyAnaXNvbGF0aW9uJy8pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxzIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbiB3aGVuIHRoZSBkcmFmdCBpcyBkaXNwb3NlZCBkdXJpbmcgaW5pdGlhbCByZXNvbHZlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGJhcnJpZXIgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0Y29uc3Qgc2V0dGluZyA9IHByb3ZpZGVyLnNldElzb2xhdGlvbk1vZGUoc2Vzc2lvbi5zZXNzaW9uSWQsICd3b3JrdHJlZScpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHByb3ZpZGVyLmRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJhY2VUaW1lb3V0KHNldHRpbmcsIDEwMCksIC9DYW5jZWxlZC8pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBiYXJyaWVyLmNvbXBsZXRlKCk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCd3YWl0cyBmb3IgYXV0aGVudGljYXRpb24gYW5kIHN0YXJ0dXAgY29uZmlnIHJlc29sdXRpb24gYmVmb3JlIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS9hdXRvbWF0aW9uJyB9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzZXR0aW5nID0gcHJvdmlkZXIuc2V0QnJhbmNoKHNlc3Npb24uc2Vzc2lvbklkLCAnZmVhdHVyZS9hdXRvbWF0aW9uJyk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmxlbmd0aCwgMCk7XG5cblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRhd2FpdCBzZXR0aW5nO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5tYXAocmVxdWVzdCA9PiByZXF1ZXN0LmNvbmZpZyksIFtcblx0XHRcdHt9LFxuXHRcdFx0eyBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ2ZlYXR1cmUvYXV0b21hdGlvbicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlIGNsYW1wcyBhdXRvQXBwcm92ZSB0byBkZWZhdWx0IHdoZW4gcG9saWN5IGRpc2FibGVzIGdsb2JhbCBhdXRvLWFwcHJvdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY29uZmlnID0gY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZywgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uLnNlc3Npb25JZCwgU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZSwgJ2F1dG9waWxvdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1lbWJlcmVkOiBzdG9yYWdlU2VydmljZS5nZXRPYmplY3QoU1RPUkFHRV9LRVlfUkVNRU1CRVJFRF9TRVNTSU9OX0NPTkZJR19WQUxVRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFLCB7fSksXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdH0sIHtcblx0XHRcdHJlbWVtYmVyZWQ6IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnZGVmYXVsdCcgfSxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiAnZGVmYXVsdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2JyYW5jaCBzZWxlY3Rpb24gc3RheXMgb24gdGhlIGN1cnJlbnQgd29ya3NwYWNlIGFuZCB0aGUgbmV4dCB3b3Jrc3BhY2UgcmVzb2x2ZXMgaXRzIG93biBicmFuY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RvcmFnZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbi1hJyB9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UtYScpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uQS5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5icmFuY2ggPT09ICdtYWluLWEnKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uQS5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuQnJhbmNoLCAnZmVhdHVyZS1hJyk7XG5cdFx0Y29uc3QgYnJhbmNoU2VsZWN0aW9uUmVxdWVzdCA9IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnNldFNlc3Npb25Db25maWdWYWx1ZShzZXNzaW9uQS5zZXNzaW9uSWQsIFNlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uLCAnZm9sZGVyJyk7XG5cdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uQS5zZXNzaW9uSWQpO1xuXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LFxuXHRcdFx0dmFsdWVzOiB7IGlzb2xhdGlvbjogJ2ZvbGRlcicsIGJyYW5jaDogJ2N1cnJlbnQtYicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IHJlcXVlc3RDb3VudEJlZm9yZVdvcmtzcGFjZUIgPSBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGg7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2UtYicpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uQi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5icmFuY2ggPT09ICdjdXJyZW50LWInKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YnJhbmNoU2VsZWN0aW9uUmVxdWVzdCxcblx0XHRcdHJlbWVtYmVyZWRWYWx1ZXM6IHN0b3JhZ2VTZXJ2aWNlLmdldE9iamVjdChTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIHt9KSxcblx0XHRcdHdvcmtzcGFjZUJSZXF1ZXN0OiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0c1tyZXF1ZXN0Q291bnRCZWZvcmVXb3Jrc3BhY2VCXT8uY29uZmlnLFxuXHRcdFx0d29ya3NwYWNlQlJlc29sdmVkOiBwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb25CLnNlc3Npb25JZCk/LnZhbHVlcyxcblx0XHR9LCB7XG5cdFx0XHRicmFuY2hTZWxlY3Rpb25SZXF1ZXN0OiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnZmVhdHVyZS1hJyB9LFxuXHRcdFx0cmVtZW1iZXJlZFZhbHVlczogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHR3b3Jrc3BhY2VCUmVxdWVzdDogeyBpc29sYXRpb246ICdmb2xkZXInIH0sXG5cdFx0XHR3b3Jrc3BhY2VCUmVzb2x2ZWQ6IHsgaXNvbGF0aW9uOiAnZm9sZGVyJywgYnJhbmNoOiAnY3VycmVudC1iJyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYWNoZXMgcmVzb2x2ZWQgaXNvbGF0aW9uL2JyYW5jaCBzY2hlbWEgYW5kIHNlZWRzIGl0IGludG8gdGhlIG5leHQgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuSXNvbGF0aW9uXTogeyB0aXRsZTogJ0lzb2xhdGlvbicsIHR5cGU6ICdzdHJpbmcnLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCBkZWZhdWx0OiAnd29ya3RyZWUnIH0sXG5cdFx0XHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQnJhbmNoXTogeyB0aXRsZTogJ0Jhc2UgQnJhbmNoJywgdHlwZTogJ3N0cmluZycsIGVudW06IFsnbWFpbiddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IFtTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl06ICd3b3JrdHJlZScgfSxcblx0XHR9IGFzIFJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0O1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cblx0XHRjb25zdCBmaXJzdCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTsgLy8gbGV0IHRoZSBmaXJzdCBkcmFmdCByZXNvbHZlIHNvIHRoZSBwcm92aWRlciBjYWNoZXMgdGhlIGNoaXBzXG5cdFx0YXNzZXJ0Lm9rKGZpcnN0KTtcblxuXHRcdC8vIFRoZSBuZXh0IGRyYWZ0IG1vbWVudGFyaWx5IHJlcG9ydHMgYW4gZW1wdHkgc2NoZW1hIHdoaWxlIGl0IHJlLXJlc29sdmVzLi4uXG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0geyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczoge30gfSBhcyBSZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdDtcblx0XHRjb25zdCBzZWNvbmQgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0Ly8gLi4uYnV0IGlzIHNlZWRlZCB3aXRoIHRoZSBjYWNoZWQgY2hpcHMgc28gdGhleSBzdGF5IHZpc2libGUgaW5zdGVhZCBvZiBibGFua2luZy5cblx0XHRjb25zdCBzZWVkZWRLZXlzID0gT2JqZWN0LmtleXMocHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZWNvbmQuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCB0aGUgZW1wdHkgcmVzb2x2ZSBsYW5kLCByZXBsYWNpbmcgdGhlIHNlZWQgYW5kIHBydW5pbmcgdGhlIGNhY2hlXG5cdFx0Y29uc3QgYWZ0ZXJSZXNvbHZlS2V5cyA9IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vjb25kLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KTtcblxuXHRcdC8vIEEgc3Vic2VxdWVudCBkcmFmdCBpcyBubyBsb25nZXIgc2VlZGVkIFx1MjAxNCB0aGUgZW1wdHkgcmVzb2x2ZSBwcnVuZWQgdGhlIGNhY2hlLlxuXHRcdGNvbnN0IHRoaXJkID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2MnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCB0aGlyZFNlZWRlZEtleXMgPSBPYmplY3Qua2V5cyhwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHRoaXJkLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBzZWVkZWRLZXlzLCBhZnRlclJlc29sdmVLZXlzLCB0aGlyZFNlZWRlZEtleXMgfSwge1xuXHRcdFx0c2VlZGVkS2V5czogW1Nlc3Npb25Db25maWdLZXkuQnJhbmNoLCBTZXNzaW9uQ29uZmlnS2V5Lklzb2xhdGlvbl0sXG5cdFx0XHRhZnRlclJlc29sdmVLZXlzOiBbXSxcblx0XHRcdHRoaXJkU2VlZGVkS2V5czogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZm9yd2FyZHMgZ2l0Lndvcmt0cmVlSW5jbHVkZUZpbGVzIGFzIGRlcml2ZWQgc2Vzc2lvbiBjb25maWcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29uZmlnU2VydmljZSA9IG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdnaXQud29ya3RyZWVJbmNsdWRlRmlsZXMnLCBbJ3Byb2R1Y3Qub3ZlcnJpZGVzLmpzb24nLCAnKiovbm9kZV9tb2R1bGVzLyoqJ10pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjb25maWdTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk/LnZhbHVlcyxcblx0XHRcdGZvcndhcmRlZFRvQWdlbnRIb3N0OiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMSk/LmNvbmZpZyxcblx0XHR9LCB7XG5cdFx0XHRzZWVkZWRJbW1lZGlhdGVseTogeyB3b3JrdHJlZUluY2x1ZGVGaWxlczogWydwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJywgJyoqL25vZGVfbW9kdWxlcy8qKiddIH0sXG5cdFx0XHRmb3J3YXJkZWRUb0FnZW50SG9zdDogeyB3b3JrdHJlZUluY2x1ZGVGaWxlczogWydwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJywgJyoqL25vZGVfbW9kdWxlcy8qKiddIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZ2l2ZXMgcmVtZW1iZXJlZCBhdXRvQXBwcm92ZSBwcmVjZWRlbmNlIG92ZXIgYSBjb25maWd1cmVkIHNldHRpbmcgd2hpbGUgcG9saWN5IHN0aWxsIGNsYW1wcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdC8vIENhc2UgMTogcG9saWN5IHJlc3RyaWN0cyBhdXRvLWFwcHJvdmUgXHUyMDE0IHJlbWVtYmVyZWQgJ2F1dG9BcHByb3ZlJyBpcyBjbGFtcGVkIHRvICdkZWZhdWx0J1xuXHRcdGNvbnN0IHBvbGljeVJlc3RyaWN0ZWRDb25maWcgPSBjcmVhdGVQb2xpY3lSZXN0cmljdGVkQ29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBwb2xpY3lSZXN0cmljdGVkQ29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBhcHByb3ZhbHM6ICdhbGxvd0FsbCcgfSk7XG5cdFx0Y29uc3QgcG9saWN5UmVzdHJpY3RlZFByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBwb2xpY3lSZXN0cmljdGVkQ29uZmlnLCBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwb2xpY3lSZXN0cmljdGVkUHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcG9saWN5UmVzdHJpY3RlZFByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cblx0XHQvLyBDYXNlIDI6IGFuIG9yZGluYXJ5IGNvbmZpZ3VyZWQgc2V0dGluZyBpcyBhIHBsYWluIGRlZmF1bHQgXHUyMDE0IHRoZSByZW1lbWJlcmVkIHBpY2sgd2lucyBvdmVyIGl0XG5cdFx0Y29uc3QgY29uZmlndXJlZERlZmF1bHRDb25maWcgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0YXdhaXQgY29uZmlndXJlZERlZmF1bHRDb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nLCB7IGFwcHJvdmFsczogJ21hbnVhbCcgfSk7XG5cdFx0Y29uc3QgY29uZmlndXJlZERlZmF1bHRQcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlndXJlZERlZmF1bHRDb25maWcsIHN0b3JhZ2VTZXJ2aWNlIH0pO1xuXHRcdGNvbmZpZ3VyZWREZWZhdWx0UHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgY29uZmlndXJlZERlZmF1bHRQcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwb2xpY3lSZXN0cmljdGVkOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5hdCgtMik/LmNvbmZpZz8uYXV0b0FwcHJvdmUsXG5cdFx0XHRjb25maWd1cmVkRGVmYXVsdDogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWc/LmF1dG9BcHByb3ZlLFxuXHRcdH0sIHtcblx0XHRcdHBvbGljeVJlc3RyaWN0ZWQ6ICdkZWZhdWx0Jyxcblx0XHRcdGNvbmZpZ3VyZWREZWZhdWx0OiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIG1pZ3JhdGVzIGEgcmVtZW1iZXJlZCBsZWdhY3kgYXV0b0FwcHJvdmU9YXV0b3BpbG90IHRvIG1vZGU9YXV0b3BpbG90JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhdXRvcGlsb3QnLFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnLCB7XG5cdFx0XHRtb2RlOiAnYXV0b3BpbG90Jyxcblx0XHRcdGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZHJvcHMgYW4gaW52YWxpZCByZW1lbWJlcmVkIG1vZGUgaW5zdGVhZCBvZiBmb3J3YXJkaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogJ2JvZ3VzJyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgc3RvcmFnZVNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnPy5tb2RlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIHNlZWRzIHJlbWVtYmVyZWQgbW9kZS9hcHByb3ZhbHMgd2hlbiBjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uIGlzIGF0IGl0cyBzY2hlbWEgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdwbGFuJyxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGNvbmZpZ3VyYXRpb25TZXJ2aWNlOiBjcmVhdGVTY2hlbWFEZWZhdWx0Q29uZmlndXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdH0pO1xuXHRcdHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWcsIHtcblx0XHRcdG1vZGU6ICdwbGFuJyxcblx0XHRcdGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGtlZXBzIHJlbWVtYmVyZWQgcGlja3Mgb3ZlciBhbiBvcmRpbmFyeSBjb25maWd1cmVkIGNoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24gc2V0dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRU1FTUJFUkVEX1NFU1NJT05fQ09ORklHX1ZBTFVFUywgSlNPTi5zdHJpbmdpZnkoe1xuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuTW9kZV06ICdwbGFuJyxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG5cdFx0Y29uc3QgY29uZmlnID0gY3JlYXRlU2NoZW1hRGVmYXVsdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Ly8gQW4gb3JkaW5hcnkgY29uZmlndXJlZCBzZXR0aW5nIGFjdHMgYXMgYSBkZWZhdWx0IHRoYXQgdGhlIHJlbWVtYmVyZWQgcGljayBvdmVycmlkZXMuXG5cdFx0YXdhaXQgY29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKCdjaGF0LmRlZmF1bHRDb25maWd1cmF0aW9uJywgeyBtb2RlOiAnYXV0b3BpbG90JyB9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnLCBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnLCB7XG5cdFx0XHRtb2RlOiAncGxhbicsXG5cdFx0XHRhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiB1c2VzIGNvbmZpZ3VyZWQgY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbiB3aGVuIHRoZXJlIGlzIG5vIHJlbWVtYmVyZWQgcGljaycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWcgPSBjcmVhdGVTY2hlbWFEZWZhdWx0Q29uZmlndXJhdGlvblNlcnZpY2UoKTtcblx0XHRhd2FpdCBjb25maWcuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2NoYXQuZGVmYXVsdENvbmZpZ3VyYXRpb24nLCB7IG1vZGU6ICdhdXRvcGlsb3QnLCBhcHByb3ZhbHM6ICdhbGxvd0FsbCcgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZyB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnLCB7XG5cdFx0XHRtb2RlOiAnYXV0b3BpbG90Jyxcblx0XHRcdGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGxldHMgYW4gZW50ZXJwcmlzZSBwb2xpY3kgY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbiBvdmVycmlkZSByZW1lbWJlcmVkIHBpY2tzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHN0b3JhZ2VTZXJ2aWNlLnN0b3JlKFNUT1JBR0VfS0VZX1JFTUVNQkVSRURfU0VTU0lPTl9DT05GSUdfVkFMVUVTLCBKU09OLnN0cmluZ2lmeSh7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5Nb2RlXTogJ3BsYW4nLFxuXHRcdFx0W1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnYXV0b0FwcHJvdmUnLFxuXHRcdH0pLCBTdG9yYWdlU2NvcGUuUFJPRklMRSwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblx0XHRjb25zdCBjb25maWcgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZykge1xuXHRcdFx0XHRjb25zdCBiYXNlID0gc3VwZXIuaW5zcGVjdDxUPihrZXkpO1xuXHRcdFx0XHRpZiAoa2V5ID09PSAnY2hhdC5kZWZhdWx0Q29uZmlndXJhdGlvbicpIHtcblx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBwb2xpY3lWYWx1ZTogeyBtb2RlOiAnYXV0b3BpbG90JywgYXBwcm92YWxzOiAnbWFudWFsJyB9IGFzIHVua25vd24gYXMgVCB9O1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBiYXNlO1xuXHRcdFx0fVxuXHRcdH0oKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnLCBzdG9yYWdlU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmF0KC0xKT8uY29uZmlnLCB7XG5cdFx0XHRtb2RlOiAnYXV0b3BpbG90Jyxcblx0XHRcdGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25CeVJlc291cmNlIHJlc29sdmVzIGN1cnJlbnQgbmV3IHNlc3Npb24gd2l0aG91dCBsaXN0aW5nIGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9teS1wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlVXJpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGNvbnN0IHJlc29sdmVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkJ5UmVzb3VyY2Uoc2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxpc3RlZFNlc3Npb25zOiBwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCxcblx0XHRcdHJlc29sdmVkUmVzb3VyY2U6IHJlc29sdmVkPy5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0cmVzb2x2ZWRXb3Jrc3BhY2VMYWJlbDogcmVzb2x2ZWQ/LndvcmtzcGFjZS5nZXQoKT8ubGFiZWwsXG5cdFx0fSwge1xuXHRcdFx0bGlzdGVkU2Vzc2lvbnM6IDAsXG5cdFx0XHRyZXNvbHZlZFJlc291cmNlOiBzZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRyZXNvbHZlZFdvcmtzcGFjZUxhYmVsOiAnbXktcHJvamVjdCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2pvaW5zIHRoZSBhY3RpdmUgY2xpZW50IHdpdGggY3VzdG9taXphdGlvbnMgd2hlbiBvcGVuaW5nIGFuIGV4aXN0aW5nIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ2FjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHtcblx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAnZmlsZTovLy9jdXN0b21pemF0aW9ucy90ZXN0Jyxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy9jdXN0b21pemF0aW9ucy90ZXN0Jyxcblx0XHRcdFx0bmFtZTogJ1Rlc3QgQ3VzdG9taXphdGlvbicsXG5cdFx0XHR9XSxcblx0XHR9IHNhdGlzZmllcyBPbWl0PFNlc3Npb25BY3RpdmVDbGllbnQsICdjbGllbnRJZCc+O1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2FjdGl2ZS1jbGllbnQnKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiwgYWN0aXZlQ2xpZW50IH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpJywgcGF0aDogJy9hY3RpdmUtY2xpZW50JyB9KTtcblx0XHRhY3RpdmVTZXNzaW9uLnNldCh7XG5cdFx0XHRwcm92aWRlcklkOiBwcm92aWRlci5pZCxcblx0XHRcdHNlc3Npb25JZDogYCR7cHJvdmlkZXIuaWR9OiR7cmVzb3VyY2UudG9TdHJpbmcoKX1gLFxuXHRcdFx0cmVzb3VyY2UsXG5cdFx0fSBhcyBJQWN0aXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGRpc3BhdGNoID0+IGRpc3BhdGNoLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQpLCBbe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdhY3RpdmUtY2xpZW50JykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ3Rlc3QtbG9jYWwtY2xpZW50JywgLi4uYWN0aXZlQ2xpZW50IH0sXG5cdFx0XHR9LFxuXHRcdFx0Y2xpZW50SWQ6ICd0ZXN0LWxvY2FsLWNsaWVudCcsXG5cdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBwdWJsaXNoIGVtcHR5IGN1c3RvbWl6YXRpb25zIHdoaWxlIHJlc29sdmluZyBhbiB1bm9ic2VydmVkIGFjdGl2ZSBzZXNzaW9uIHNjb3BlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCdhY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRjb25zdCByZXNvbHV0aW9uID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBzY29wZVJlcXVlc3RzID0gMDtcblx0XHRsZXQgYWN0aXZlQ2xpZW50UmVhZHMgPSAwO1xuXHRcdGNvbnN0IGFjdGl2ZUNsaWVudCA9IHtcblx0XHRcdHRvb2xzOiBbXSxcblx0XHRcdGN1c3RvbWl6YXRpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBDdXN0b21pemF0aW9uVHlwZS5QbHVnaW4sXG5cdFx0XHRcdGlkOiAnZmlsZTovLy9jdXN0b21pemF0aW9ucy9yZXNvbHZlZCcsXG5cdFx0XHRcdHVyaTogJ2ZpbGU6Ly8vY3VzdG9taXphdGlvbnMvcmVzb2x2ZWQnLFxuXHRcdFx0XHRuYW1lOiAnUmVzb2x2ZWQgQ3VzdG9taXphdGlvbicsXG5cdFx0XHRcdGVuYWJsZW1lbnQ6IFt7IGtpbmQ6IEN1c3RvbWl6YXRpb25FbmFibGVtZW50S2luZC5HbG9iYWwsIGVuYWJsZWQ6IHRydWUgfV0sXG5cdFx0XHR9XSxcblx0XHR9IHNhdGlzZmllcyBPbWl0PFNlc3Npb25BY3RpdmVDbGllbnQsICdjbGllbnRJZCc+O1xuXHRcdGNvbnN0IHNjb3BlOiBJQWdlbnRDdXN0b21pemF0aW9uU2NvcGUgPSB7XG5cdFx0XHRjdXN0b21pemF0aW9uczogY29uc3RPYnNlcnZhYmxlKGFjdGl2ZUNsaWVudC5jdXN0b21pemF0aW9ucyksXG5cdFx0XHRjdXN0b21BZ2VudHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0XHR0b29sczogY29uc3RPYnNlcnZhYmxlKGFjdGl2ZUNsaWVudC50b29scyksXG5cdFx0XHRpc1Jlc29sdmVkOiBjb25zdE9ic2VydmFibGUodHJ1ZSksXG5cdFx0XHR3aGVuUmVzb2x2ZWQ6ICgpID0+IHJlc29sdXRpb24ucCxcblx0XHRcdGFjdGl2ZUNsaWVudDogY2xpZW50SWQgPT4ge1xuXHRcdFx0XHRhY3RpdmVDbGllbnRSZWFkcysrO1xuXHRcdFx0XHRyZXR1cm4gY29uc3RPYnNlcnZhYmxlKHsgY2xpZW50SWQsIC4uLmFjdGl2ZUNsaWVudCB9KTtcblx0XHRcdH0sXG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdkZWxheWVkLWFjdGl2ZS1jbGllbnQnLCB7XG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZSgnL2hvbWUvdXNlci9kZWxheWVkLWFjdGl2ZS1jbGllbnQnKSxcblx0XHR9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdGFjdGl2ZVNlc3Npb24sXG5cdFx0XHRhY3RpdmVDbGllbnRTY29wZTogKCkgPT4ge1xuXHRcdFx0XHRzY29wZVJlcXVlc3RzKys7XG5cdFx0XHRcdHJldHVybiBzY29wZTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5sZW5ndGggPSAwO1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGknLCBwYXRoOiAnL2RlbGF5ZWQtYWN0aXZlLWNsaWVudCcgfSk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQoe1xuXHRcdFx0cHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsXG5cdFx0XHRzZXNzaW9uSWQ6IGAke3Byb3ZpZGVyLmlkfToke3Jlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdHJlc291cmNlLFxuXHRcdH0gYXMgSUFjdGl2ZVNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2NvcGVSZXF1ZXN0cyxcblx0XHRcdGFjdGl2ZUNsaWVudFJlYWRzLFxuXHRcdFx0YWN0aW9uczogYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmZpbHRlcihkaXNwYXRjaCA9PiBkaXNwYXRjaC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0KSxcblx0XHR9LCB7XG5cdFx0XHRzY29wZVJlcXVlc3RzOiAxLFxuXHRcdFx0YWN0aXZlQ2xpZW50UmVhZHM6IDAsXG5cdFx0XHRhY3Rpb25zOiBbXSxcblx0XHR9KTtcblxuXHRcdHJlc29sdXRpb24uY29tcGxldGUoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzY29wZVJlcXVlc3RzLFxuXHRcdFx0YWN0aXZlQ2xpZW50UmVhZHMsXG5cdFx0XHRhY3Rpb25zOiBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGRpc3BhdGNoID0+IGRpc3BhdGNoLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQpLFxuXHRcdH0sIHtcblx0XHRcdHNjb3BlUmVxdWVzdHM6IDEsXG5cdFx0XHRhY3RpdmVDbGllbnRSZWFkczogMSxcblx0XHRcdGFjdGlvbnM6IFt7XG5cdFx0XHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnZGVsYXllZC1hY3RpdmUtY2xpZW50JykudG9TdHJpbmcoKSxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZDogJ3Rlc3QtbG9jYWwtY2xpZW50JywgLi4uYWN0aXZlQ2xpZW50IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGNsaWVudElkOiAndGVzdC1sb2NhbC1jbGllbnQnLFxuXHRcdFx0XHRjbGllbnRTZXE6IDAsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBlYWdlcmx5IGNyZWF0ZXMgdGhlIGJhY2tlbmQgc2Vzc2lvbiB3aXRoIHRoZSBjbGllbnQtYWxsb2NhdGVkIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvbXktcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZVVyaSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApOyAvLyBsZXQgdGhlIGVhZ2VyIGNyZWF0ZVNlc3Npb24gcHJvbWlzZSByZXNvbHZlXG5cblx0XHRjb25zdCByYXdJZCA9IHNlc3Npb24ucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0Y29uc3QgZXhwZWN0ZWRCYWNrZW5kVXJpID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsIHJhd0lkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LmNyZWF0ZWRTZXNzaW9uVXJpcy5tYXAodSA9PiB1LnRvU3RyaW5nKCkpLFxuXHRcdFx0W2V4cGVjdGVkQmFja2VuZFVyaS50b1N0cmluZygpXSxcblx0XHRcdCdlYWdlciBjcmVhdGVTZXNzaW9uIHNob3VsZCBiZSBpbnZva2VkIHdpdGggdGhlIGNsaWVudC1hbGxvY2F0ZWQgVVJJJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChleHBlY3RlZEJhY2tlbmRVcmkudG9TdHJpbmcoKSksXG5cdFx0XHQxLFxuXHRcdFx0J2Egc3RhdGUgc3Vic2NyaXB0aW9uIHNob3VsZCBiZSBoZWxkIHdoaWxlIHRoZSBuZXcgc2Vzc2lvbiB2aWV3IGlzIGFjdGl2ZScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiBkb2VzIG5vdCBlYWdlcmx5IGNyZWF0ZSB0aGUgYmFja2VuZCBzZXNzaW9uIGluIGFuIHVudHJ1c3RlZCBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgd29ya3NwYWNlVHJ1c3RlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci91bnRydXN0ZWQtcHJvamVjdCcpO1xuXHRcdHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlVXJpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7IC8vIGxldCB0aGUgKHN1cHByZXNzZWQpIGVhZ2VyIGNyZWF0ZVNlc3Npb24gcGF0aCBzZXR0bGVcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3QuY3JlYXRlZFNlc3Npb25VcmlzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksXG5cdFx0XHRbXSxcblx0XHRcdCdubyBlYWdlciBjcmVhdGVTZXNzaW9uIHNob3VsZCBiZSBpbnZva2VkIGZvciBhbiB1bnRydXN0ZWQgZm9sZGVyJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGRpc3Bvc2VzIHRoZSBwcmV2aW91cyBlYWdlciBiYWNrZW5kIHNlc3Npb24gb24gd29ya3NwYWNlIHN3aXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cblx0XHRjb25zdCBmaXJzdCA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgZmlyc3RSYXdJZCA9IGZpcnN0LnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpO1xuXHRcdGNvbnN0IGZpcnN0QmFja2VuZFVyaSA9IEFnZW50U2Vzc2lvbi51cmkoc2Vzc2lvblR5cGVJZCwgZmlyc3RSYXdJZCk7XG5cblx0XHQvLyBTd2l0Y2ggd29ya3NwYWNlOiB0aGUgbWFuYWdlbWVudCBsYXllciBkaXNwb3NlcyB0aGUgYWJhbmRvbmVkIGRyYWZ0XG5cdFx0Ly8gKHByb3ZpZGVycyBubyBsb25nZXIgZG8gc28gaW1wbGljaXRseSksIHdoaWNoIGRpc3Bvc2VzIHRoZSBmaXJzdFxuXHRcdC8vIGJhY2tlbmQgc2Vzc2lvbiBhbmQgcmVsZWFzZXMgaXRzIHN1YnNjcmlwdGlvbi5cblx0XHRjb25zdCBzZWNvbmQgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRwcm92aWRlci5kZWxldGVOZXdTZXNzaW9uKGZpcnN0LnNlc3Npb25JZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZWNvbmRSYXdJZCA9IHNlY29uZC5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRjb25zdCBzZWNvbmRCYWNrZW5kVXJpID0gQWdlbnRTZXNzaW9uLnVyaShzZXNzaW9uVHlwZUlkLCBzZWNvbmRSYXdJZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0YWdlbnRIb3N0LmRpc3Bvc2VkU2Vzc2lvbnMubWFwKHUgPT4gdS50b1N0cmluZygpKSxcblx0XHRcdFtmaXJzdEJhY2tlbmRVcmkudG9TdHJpbmcoKV0sXG5cdFx0XHQnZmlyc3QgYmFja2VuZCBzZXNzaW9uIHNob3VsZCBiZSBkaXNwb3NlZCB3aGVuIHRoZSB3b3Jrc3BhY2Ugc3dpdGNoZXMnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubWFwKHUgPT4gdS50b1N0cmluZygpKSxcblx0XHRcdFtmaXJzdEJhY2tlbmRVcmkudG9TdHJpbmcoKSwgc2Vjb25kQmFja2VuZFVyaS50b1N0cmluZygpXSxcblx0XHRcdCdhIGZyZXNoIGJhY2tlbmQgc2Vzc2lvbiBzaG91bGQgYmUgY3JlYXRlZCBmb3IgdGhlIG5ldyB3b3Jrc3BhY2UnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2VhZ2VyIGNyZWF0ZVNlc3Npb24gY29tcGxldGVzIG9uIHRoZSB3aXJlIGJlZm9yZSBnZXRTdWJzY3JpcHRpb24gb3BlbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gVGhpcyBndWFyZHMgYWdhaW5zdCBhIHJlZ3Jlc3Npb24gd2hlcmUgdGhlIG9yZGVyIHdhcyBmbGlwcGVkOlxuXHRcdC8vIGBnZXRTdWJzY3JpcHRpb25gIGZpcnN0IFx1MjE5MiBzZXJ2ZXIgc2F3IGBzdWJzY3JpYmVgIGZvciBhbiB1bmtub3duXG5cdFx0Ly8gc2Vzc2lvbiBcdTIxOTIgcmV0dXJuZWQgYEFIUF9TRVNTSU9OX05PVF9GT1VORGAgXHUyMTkyIHRoZSBjbGllbnQgc3Vic2NyaXB0aW9uXG5cdFx0Ly8gZW50ZXJlZCBhbiBlcnJvciBzdGF0ZSBcdTIxOTIgdGhlIGNoYXQgaGFuZGxlciBsYXRlciB0cmVhdGVkIHRoZSBzZXNzaW9uXG5cdFx0Ly8gYXMgbWlzc2luZyBhbmQgcmUtaXNzdWVkIGBjcmVhdGVTZXNzaW9uYCwgcHJvZHVjaW5nIGEgZHVwbGljYXRlLlxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qJyksIHByb3ZpZGVyLnNlc3Npb25UeXBlc1swXS5pZCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGNvbnN0IHJhd0lkID0gc2Vzc2lvbi5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKTtcblx0XHRjb25zdCBiYWNrZW5kS2V5ID0gQWdlbnRTZXNzaW9uLnVyaShwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQsIHJhd0lkKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IG9wcyA9IGFnZW50SG9zdC53aXJlT3BzLmZpbHRlcihvcCA9PiBvcC5lbmRzV2l0aChiYWNrZW5kS2V5KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG9wcyxcblx0XHRcdFtgY3JlYXRlU2Vzc2lvbjoke2JhY2tlbmRLZXl9YCwgYHN1YnNjcmliZToke2JhY2tlbmRLZXl9YF0sXG5cdFx0XHQnY3JlYXRlU2Vzc2lvbiBtdXN0IGNvbXBsZXRlIGJlZm9yZSBzdWJzY3JpYmUgaXMgaXNzdWVkJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdubyBzdWJzY3JpcHRpb24gaXMgb3BlbmVkIGlmIGVhZ2VyIGNyZWF0ZVNlc3Npb24gZmFpbHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHQvLyBSZXBsYWNlIHRoZSBuZXh0IGNyZWF0ZVNlc3Npb24gY2FsbCB3aXRoIGEgcmVqZWN0aW5nIG9uZS4gVGhlIG1vY2snc1xuXHRcdC8vIG9uQ3JlYXRlU2Vzc2lvbiBob29rIHJ1bnMgYWZ0ZXIgdGhlIFVSSSBpcyBsb2dnZWQsIHNvIHdlIHRocm93IGZyb21cblx0XHQvLyB0aGUgaG9vayB0byBtb2RlbCBhbiBhdXRoLXJlcXVpcmVkIC8gbmV0d29yayBlcnJvciByZXNwb25zZS5cblx0XHRhZ2VudEhvc3Qub25DcmVhdGVTZXNzaW9uID0gYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2F1dGggcmVxdWlyZWQnKTsgfTtcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvaicpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCByYXdJZCA9IHNlc3Npb24ucmVzb3VyY2UucGF0aC5zdWJzdHJpbmcoMSk7XG5cdFx0Y29uc3QgYmFja2VuZEtleSA9IEFnZW50U2Vzc2lvbi51cmkocHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkLCByYXdJZCkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3Quc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoYmFja2VuZEtleSksXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQnbm8gc3Vic2NyaXB0aW9uIHNob3VsZCBiZSBvcGVuZWQgd2hlbiBjcmVhdGVTZXNzaW9uIHJlamVjdHMnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dvcmtzcGFjZSBzd2l0Y2ggbWlkLWNyZWF0ZVNlc3Npb24gZG9lcyBub3Qgb3BlbiBhIHN0YWxlIHN1YnNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHQvLyBNb2RlbHMgdGhlIHJhY2Ugd2hlcmUgdGhlIHVzZXIgc3dpdGNoZXMgd29ya3NwYWNlcyB3aGlsZSB0aGUgZWFnZXJcblx0XHQvLyBgY3JlYXRlU2Vzc2lvbmAgZm9yIHRoZSBwcmV2aW91cyB3b3Jrc3BhY2UgaXMgc3RpbGwgaW4gZmxpZ2h0IG9uXG5cdFx0Ly8gdGhlIHdpcmUuIFByb3ZpZGVycyBub3cgdHJhY2sgbXVsdGlwbGUgbmV3IHNlc3Npb25zLCBzbyBhYmFuZG9uaW5nXG5cdFx0Ly8gdGhlIHByZXZpb3VzIGRyYWZ0IGlzIGV4cGxpY2l0OiB0aGUgbWFuYWdlbWVudCBsYXllciBjYWxsc1xuXHRcdC8vIGBkZWxldGVOZXdTZXNzaW9uYCBvbiB3b3Jrc3BhY2Ugc3dpdGNoLiBPbmNlIHRoZSBwYXJrZWQgY3JlYXRlXG5cdFx0Ly8gZXZlbnR1YWxseSByZXNvbHZlcywgd2UgbXVzdCBub3Qgb3BlbiBhIHN1YnNjcmlwdGlvbiBmb3IgaXQgXHUyMDE0IGl0IGhhc1xuXHRcdC8vIGFscmVhZHkgYmVlbiBkaXNwb3NlZC5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cblx0XHRjb25zdCBmaXJzdENyZWF0ZUdhdGUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0YWdlbnRIb3N0Lm9uQ3JlYXRlU2Vzc2lvbiA9ICgpID0+IGZpcnN0Q3JlYXRlR2F0ZS5wO1xuXG5cdFx0Y29uc3QgZmlyc3QgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYScpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHQvLyBZaWVsZCBvbmNlIHNvIHRoZSBlYWdlciBjcmVhdGVTZXNzaW9uIHByb21pc2Ugc3RhcnRzIGFuZCBwYXJrcyBhdFxuXHRcdC8vIHRoZSBnYXRlOyBub3RoaW5nIGVsc2UgaGFzIGhhcHBlbmVkIHlldC5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Ly8gU3dpdGNoIHdvcmtzcGFjZSB3aGlsZSB0aGUgZmlyc3QgY3JlYXRlU2Vzc2lvbiBpcyBzdGlsbCBwYXJrZWQuXG5cdFx0Y29uc3Qgc2Vjb25kID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL2InKSwgc2Vzc2lvblR5cGVJZCk7XG5cdFx0Ly8gQWJhbmRvbiB0aGUgZmlyc3QgZHJhZnQgKHdoYXQgdGhlIG1hbmFnZW1lbnQgbGF5ZXIgZG9lcyBvbiBhXG5cdFx0Ly8gd29ya3NwYWNlIHN3aXRjaCkuIERpc3Bvc2luZyB0aGUgZmlyc3QgTmV3U2Vzc2lvbiBjbGVhcnMgaXRzIGJhY2tlbmRcblx0XHQvLyBVUkkgYmVmb3JlIHRoZSBzZWNvbmQgZWFnZXItY3JlYXRlIHJ1bnMuXG5cdFx0cHJvdmlkZXIuZGVsZXRlTmV3U2Vzc2lvbihmaXJzdC5zZXNzaW9uSWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHQvLyBOb3cgcmVsZWFzZSB0aGUgZmlyc3QgY3JlYXRlU2Vzc2lvbi4gVGhlIGFzeW5jIElJRkUgaW5cblx0XHQvLyBgTmV3U2Vzc2lvbi5lYWdlckNyZWF0ZWAgc2hvdWxkIG9ic2VydmUgdGhhdCB0aGUgYmFja2VuZCBVUkkgbm9cblx0XHQvLyBsb25nZXIgbWF0Y2hlcyBhbmQgYmFpbCB3aXRob3V0IHN1YnNjcmliaW5nLlxuXHRcdGZpcnN0Q3JlYXRlR2F0ZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBmaXJzdEJhY2tlbmRLZXkgPSBBZ2VudFNlc3Npb24udXJpKHNlc3Npb25UeXBlSWQsIGZpcnN0LnJlc291cmNlLnBhdGguc3Vic3RyaW5nKDEpKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlY29uZEJhY2tlbmRLZXkgPSBBZ2VudFNlc3Npb24udXJpKHNlc3Npb25UeXBlSWQsIHNlY29uZC5yZXNvdXJjZS5wYXRoLnN1YnN0cmluZygxKSkudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3Quc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoZmlyc3RCYWNrZW5kS2V5KSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdCdubyBzdWJzY3JpcHRpb24gc2hvdWxkIGJlIG9wZW5lZCBmb3IgdGhlIGFiYW5kb25lZCBmaXJzdCBzZXNzaW9uJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChzZWNvbmRCYWNrZW5kS2V5KSxcblx0XHRcdDEsXG5cdFx0XHQnc2Vjb25kIHNlc3Npb24gc2hvdWxkIHN0aWxsIGdldCBpdHMgZWFnZXIgc3Vic2NyaXB0aW9uJyxcblx0XHQpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gYWN0aW9ucyAtLS0tLS0tXG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbiByZWxlYXNlcyBhbGwgY2FjaGVkIHByb3ZpZGVyIHN0YXRlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2RlbC1zZXNzJywgeyB0aXRsZTogJ1RvIERlbGV0ZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdUbyBEZWxldGUnKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0KTtcblx0XHRjb25zdCBzdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnVG8gRGVsZXRlJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2RlbC1zZXNzJywgJ2NvcGlsb3RjbGknLCBzdGF0ZSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyh0YXJnZXQuc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IG1ldGFkYXRhID0gUmVmbGVjdC5nZXQocHJvdmlkZXIsICdfbWV0YUJ5UmF3SWQnKSBhcyBNYXA8c3RyaW5nLCBJQWdlbnRTZXNzaW9uTWV0YWRhdGE+O1xuXHRcdGNvbnN0IGxhc3RTdGF0ZXMgPSBSZWZsZWN0LmdldChwcm92aWRlciwgJ19sYXN0U2Vzc2lvblN0YXRlcycpIGFzIE1hcDxzdHJpbmcsIFNlc3Npb25TdGF0ZT47XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IFJlZmxlY3QuZ2V0KHByb3ZpZGVyLCAnX3Nlc3Npb25TdGF0ZVN1YnNjcmlwdGlvbnMnKSBhcyBEaXNwb3NhYmxlTWFwPHN0cmluZywgRGlzcG9zYWJsZVN0b3JlPjtcblx0XHRjb25zdCBpZGxlVGltZXJzID0gUmVmbGVjdC5nZXQocHJvdmlkZXIsICdfc2Vzc2lvblN0YXRlSWRsZVRpbWVycycpIGFzIERpc3Bvc2FibGVNYXA8c3RyaW5nPjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1ldGFkYXRhOiBtZXRhZGF0YS5oYXMoJ2RlbC1zZXNzJyksXG5cdFx0XHRzdGF0ZTogbGFzdFN0YXRlcy5oYXModGFyZ2V0LnNlc3Npb25JZCksXG5cdFx0XHRzdWJzY3JpcHRpb246IHN1YnNjcmlwdGlvbnMuaGFzKHRhcmdldC5zZXNzaW9uSWQpLFxuXHRcdFx0dGltZXI6IGlkbGVUaW1lcnMuaGFzKHRhcmdldC5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdG1ldGFkYXRhOiB0cnVlLFxuXHRcdFx0c3RhdGU6IHRydWUsXG5cdFx0XHRzdWJzY3JpcHRpb246IHRydWUsXG5cdFx0XHR0aW1lcjogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24odGFyZ2V0LnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3Bvc2VkU2Vzc2lvbnM6IGFnZW50SG9zdC5kaXNwb3NlZFNlc3Npb25zLm1hcCh1cmkgPT4gKHtcblx0XHRcdFx0cHJvdmlkZXI6IEFnZW50U2Vzc2lvbi5wcm92aWRlcih1cmkpLFxuXHRcdFx0XHRpZDogQWdlbnRTZXNzaW9uLmlkKHVyaSksXG5cdFx0XHR9KSksXG5cdFx0XHRzZXNzaW9uOiBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnVG8gRGVsZXRlJyksXG5cdFx0XHRtZXRhZGF0YTogbWV0YWRhdGEuZ2V0KCdkZWwtc2VzcycpLFxuXHRcdFx0c3RhdGU6IGxhc3RTdGF0ZXMuZ2V0KHRhcmdldC5zZXNzaW9uSWQpLFxuXHRcdFx0c3Vic2NyaXB0aW9uOiBzdWJzY3JpcHRpb25zLmhhcyh0YXJnZXQuc2Vzc2lvbklkKSxcblx0XHRcdHRpbWVyOiBpZGxlVGltZXJzLmhhcyh0YXJnZXQuc2Vzc2lvbklkKSxcblx0XHRcdHVuc3Vic2NyaWJlQ291bnQ6IGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnZGVsLXNlc3MnKS50b1N0cmluZygpKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNwb3NlZFNlc3Npb25zOiBbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBpZDogJ2RlbC1zZXNzJyB9XSxcblx0XHRcdHNlc3Npb246IHVuZGVmaW5lZCxcblx0XHRcdG1ldGFkYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0c3Vic2NyaXB0aW9uOiBmYWxzZSxcblx0XHRcdHRpbWVyOiBmYWxzZSxcblx0XHRcdHVuc3Vic2NyaWJlQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIGRvZXMgbm90IHJlbW92ZSBhIHNlc3Npb24gdHdpY2Ugd2hlbiB0aGUgaG9zdCBhbHNvIG5vdGlmaWVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdkZWxldGUtbm90aWZpZWQnLCB7IHRpdGxlOiAnRGVsZXRlIE5vdGlmaWVkJyB9KTtcblx0XHRjb25zdCB0YXJnZXQgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnRGVsZXRlIE5vdGlmaWVkJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXHRcdGFnZW50SG9zdC5vbkRpc3Bvc2VTZXNzaW9uID0gc2Vzc2lvbiA9PiBmaXJlU2Vzc2lvblJlbW92ZWQoYWdlbnRIb3N0LCBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbikpO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbih0YXJnZXQuc2Vzc2lvbklkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlzcG9zZWRTZXNzaW9uczogYWdlbnRIb3N0LmRpc3Bvc2VkU2Vzc2lvbnMubGVuZ3RoLFxuXHRcdFx0cmVtb3ZlZEV2ZW50czogY2hhbmdlcy5maWx0ZXIoY2hhbmdlID0+IGNoYW5nZS5yZW1vdmVkLmxlbmd0aCA+IDApLmxlbmd0aCxcblx0XHRcdHNlc3Npb246IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdEZWxldGUgTm90aWZpZWQnKSxcblx0XHR9LCB7XG5cdFx0XHRkaXNwb3NlZFNlc3Npb25zOiAxLFxuXHRcdFx0cmVtb3ZlZEV2ZW50czogMSxcblx0XHRcdHNlc3Npb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVsZXRlU2Vzc2lvbnMgZGlzcG9zZXMgYWxsIHNlc3Npb25zIGFuZCByZW1vdmVzIHRoZW0gZnJvbSBjYWNoZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnZGVsLTEnLCB7IHRpdGxlOiAnRmlyc3QnIH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnZGVsLTInLCB7IHRpdGxlOiAnU2Vjb25kJyB9KTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0ZpcnN0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlY29uZCcpO1xuXHRcdGFzc2VydC5vayhmaXJzdCk7XG5cdFx0YXNzZXJ0Lm9rKHNlY29uZCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVTZXNzaW9ucyhbZmlyc3QhLnNlc3Npb25JZCwgc2Vjb25kIS5zZXNzaW9uSWRdKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcG9zZWRTZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3Bvc2VkU2Vzc2lvbnMubWFwKHVyaSA9PiBBZ2VudFNlc3Npb24uaWQodXJpKSkuc29ydCgpLCBbJ2RlbC0xJywgJ2RlbC0yJ10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnRmlyc3QnKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NlY29uZCcpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9ucyBwdWJsaXNoZXMgc3VjY2Vzc2Z1bCByZW1vdmFscyBiZWZvcmUgcHJvcGFnYXRpbmcgYSBsYXRlciBmYWlsdXJlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ2RlbGV0ZS1zdWNjZXNzJywgeyBzdW1tYXJ5OiAnRGVsZXRlIFN1Y2Nlc3MnIH0pKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdkZWxldGUtZmFpbHVyZScsIHsgc3VtbWFyeTogJ0RlbGV0ZSBGYWlsdXJlJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHN1Y2Nlc3NmdWwgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnRGVsZXRlIFN1Y2Nlc3MnKTtcblx0XHRjb25zdCBmYWlsaW5nID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0RlbGV0ZSBGYWlsdXJlJyk7XG5cdFx0YXNzZXJ0Lm9rKHN1Y2Nlc3NmdWwpO1xuXHRcdGFzc2VydC5vayhmYWlsaW5nKTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cdFx0YWdlbnRIb3N0LmZhaWxEaXNwb3NlU2Vzc2lvbkZvciA9ICdkZWxldGUtZmFpbHVyZSc7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhwcm92aWRlci5kZWxldGVTZXNzaW9ucyhbc3VjY2Vzc2Z1bC5zZXNzaW9uSWQsIGZhaWxpbmcuc2Vzc2lvbklkXSksIC9GYWlsZWQgdG8gZGlzcG9zZSBkZWxldGUtZmFpbHVyZS8pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZW1vdmVkOiBjaGFuZ2VzLmZsYXRNYXAoY2hhbmdlID0+IGNoYW5nZS5yZW1vdmVkLm1hcChzZXNzaW9uID0+IHNlc3Npb24udGl0bGUuZ2V0KCkpKSxcblx0XHRcdHN1Y2Nlc3NmdWw6IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdEZWxldGUgU3VjY2VzcycpLFxuXHRcdFx0ZmFpbGluZzogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0RlbGV0ZSBGYWlsdXJlJyk/LnRpdGxlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHJlbW92ZWQ6IFsnRGVsZXRlIFN1Y2Nlc3MnXSxcblx0XHRcdHN1Y2Nlc3NmdWw6IHVuZGVmaW5lZCxcblx0XHRcdGZhaWxpbmc6ICdEZWxldGUgRmFpbHVyZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gUmVuYW1lIC0tLS0tLS1cblxuXHR0ZXN0KCdyZW5hbWVTZXNzaW9uIGRpc3BhdGNoZXMgU2Vzc2lvblRpdGxlQ2hhbmdlZCBvbiB0aGUgc2Vzc2lvbiBjaGFubmVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdyZW5hbWUtc2VzcycsIHsgdGl0bGU6ICdPbGQgVGl0bGUnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnT2xkIFRpdGxlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVTZXNzaW9uKHRhcmdldCEuc2Vzc2lvbklkLCAnTmV3IFRpdGxlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgZGlzcGF0Y2hlZCA9IGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9uc1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzcGF0Y2hlZC5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRpc3BhdGNoZWQuYWN0aW9uIGFzIHsgdGl0bGU6IHN0cmluZyB9KS50aXRsZSwgJ05ldyBUaXRsZScpO1xuXHRcdGNvbnN0IGFjdGlvblNlc3Npb24gPSBkaXNwYXRjaGVkLmNoYW5uZWwudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoQWdlbnRTZXNzaW9uLnByb3ZpZGVyKGFjdGlvblNlc3Npb24pLCAnY29waWxvdGNsaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChBZ2VudFNlc3Npb24uaWQoYWN0aW9uU2Vzc2lvbiksICdyZW5hbWUtc2VzcycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwYXRjaGVkLmNsaWVudElkLCAndGVzdC1sb2NhbC1jbGllbnQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lU2Vzc2lvbiB1cGRhdGVzIHRoZSBzZXNzaW9uIHRpdGxlIG9wdGltaXN0aWNhbGx5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdyZW5hbWUtb3B0JywgeyB0aXRsZTogJ0JlZm9yZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdCZWZvcmUnKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0KTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnJlbmFtZVNlc3Npb24odGFyZ2V0IS5zZXNzaW9uSWQsICdBZnRlcicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0YXJnZXQhLnRpdGxlLmdldCgpLCAnQWZ0ZXInKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lQ2hhdCBvbiB0aGUgZGVmYXVsdCBjaGF0IHJlbmFtZXMgdGhlIGNoYXQgdGFiLCBub3QgdGhlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ3JlbmFtZS1kZWZhdWx0LWNoYXQnLCB7IHRpdGxlOiAnU2Vzc2lvbiBUaXRsZScgfSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3QgdGFyZ2V0ID0gc2Vzc2lvbnMuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTZXNzaW9uIFRpdGxlJyk7XG5cdFx0YXNzZXJ0Lm9rKHRhcmdldCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5yZW5hbWVDaGF0KHRhcmdldCEuc2Vzc2lvbklkLCB0YXJnZXQhLm1haW5DaGF0LmdldCgpLnJlc291cmNlLCAnQ2hhdCBUaXRsZScpO1xuXG5cdFx0Ly8gU2Vzc2lvbiB0aXRsZSBpcyB1bnRvdWNoZWQ7IHRoZSBkZWZhdWx0IGNoYXQgdGFiIHRpdGxlIGNoYW5nZXMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEudGl0bGUuZ2V0KCksICdTZXNzaW9uIFRpdGxlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEubWFpbkNoYXQuZ2V0KCkudGl0bGUuZ2V0KCksICdDaGF0IFRpdGxlJyk7XG5cdFx0Ly8gRGlzcGF0Y2hlZCBvbiB0aGUgZGVmYXVsdCBjaGF0IGNoYW5uZWwsIG5vdCB0aGUgc2Vzc2lvbiBjaGFubmVsLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBkaXNwYXRjaGVkID0gYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwYXRjaGVkLmFjdGlvbi50eXBlLCBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkaXNwYXRjaGVkLmNoYW5uZWwudG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3JlbmFtZS1kZWZhdWx0LWNoYXQnKS50b1N0cmluZygpKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbmFtZUNoYXQgaXMgbm8tb3AgZm9yIHVua25vd24gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGF3YWl0IHByb3ZpZGVyLnJlbmFtZUNoYXQoJ25vbmV4aXN0ZW50LWlkJywgVVJJLnBhcnNlKCd0ZXN0Oi8vbm9uZXhpc3RlbnQnKSwgJ0lnbm9yZWQnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCAwKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBNdWx0aS1jaGF0IGNhdGFsb2cgKGFwcGx5Q2hhdENhdGFsb2cgcmVjb25jaWxpYXRpb24pIC0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnbXVsdGktY2hhdCBjYXRhbG9nJywgKCkgPT4ge1xuXHRcdGZ1bmN0aW9uIG1ha2VDaGF0U3VtbWFyeShyZXNvdXJjZTogc3RyaW5nLCB0aXRsZTogc3RyaW5nLCBzdGF0dXMgPSBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSk6IENoYXRTdW1tYXJ5IHtcblx0XHRcdHJldHVybiB7IHJlc291cmNlLCB0aXRsZSwgc3RhdHVzLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpIH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWFrZVN0YXRlKGNoYXRzOiBDaGF0U3VtbWFyeVtdLCBvcHRzPzogeyBzZXNzaW9uVGl0bGU/OiBzdHJpbmc7IGRlZmF1bHRDaGF0Pzogc3RyaW5nIH0pOiBTZXNzaW9uU3RhdGUge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdFx0dGl0bGU6IG9wdHM/LnNlc3Npb25UaXRsZSA/PyAnU2Vzc2lvbicsXG5cdFx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRcdGNoYXRzLFxuXHRcdFx0XHQuLi4ob3B0cz8uZGVmYXVsdENoYXQgPyB7IGRlZmF1bHRDaGF0OiBvcHRzLmRlZmF1bHRDaGF0IH0gOiB7fSksXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlcjogUmV0dXJuVHlwZTx0eXBlb2YgY3JlYXRlUHJvdmlkZXI+LCByYXdJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIHJhd0lkLCB7IHRpdGxlOiAnU2Vzc2lvbicgfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gQWdlbnRTZXNzaW9uLmlkKHMucmVzb3VyY2UudG9TdHJpbmcoKSkgPT09IHJhd0lkKTtcblx0XHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRcdC8vIEZvcmNlIGEgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gc28gcHVzaGVkIHN0YXRlcyByZWFjaCB0aGUgYWRhcHRlci5cblx0XHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRcdHJldHVybiBzZXNzaW9uITtcblx0XHR9XG5cblx0XHR0ZXN0KCdkZWZhdWx0ICsgcGVlciBjYXRhbG9nIHN1cmZhY2VzIGJvdGggY2hhdHMgd2l0aCB0aGUgZGVmYXVsdCBhcyBtYWluQ2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktMScpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktMScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLTEnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdFx0XHRjaGF0RnJhZ21lbnRzOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLFxuXHRcdFx0XHRtYWluSXNEZWZhdWx0OiBzZXNzaW9uLm1haW5DaGF0LmdldCgpID09PSBzZXNzaW9uLmNoYXRzLmdldCgpWzBdLFxuXHRcdFx0XHRwZWVyVGl0bGU6IHNlc3Npb24uY2hhdHMuZ2V0KClbMV0udGl0bGUuZ2V0KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSxcblx0XHRcdFx0Y2hhdEZyYWdtZW50czogWycnLCAncGVlci0xJ10sXG5cdFx0XHRcdG1haW5Jc0RlZmF1bHQ6IHRydWUsXG5cdFx0XHRcdHBlZXJUaXRsZTogJ1BlZXInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcXVpdmFsZW50IGNoYXQgY2F0YWxvZ3MgZG8gbm90IG5vdGlmeSBjaGF0IG9ic2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktc3RhYmxlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1zdGFibGUnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXHRcdFx0Y29uc3QgbWFrZUNhdGFsb2cgPSAoKSA9PiBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktc3RhYmxlJywgJ2NvcGlsb3RjbGknLCBtYWtlQ2F0YWxvZygpKTtcblx0XHRcdGxldCB1cGRhdGVDb3VudCA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRzZXNzaW9uLmNoYXRzLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dXBkYXRlQ291bnQrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktc3RhYmxlJywgJ2NvcGlsb3RjbGknLCBtYWtlQ2F0YWxvZygpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZUNvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2VxdWl2YWxlbnQgcGVlciBjaGF0IHZhbHVlcyBkbyBub3Qgbm90aWZ5IG9ic2VydmVycycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktdmFsdWVzJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS12YWx1ZXMnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXHRcdFx0Y29uc3QgbWFrZUNhdGFsb2cgPSAoKSA9PiBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0eyAuLi5tYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksIGFjdGl2aXR5OiAnV29ya2luZycgfSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXZhbHVlcycsICdjb3BpbG90Y2xpJywgbWFrZUNhdGFsb2coKSk7XG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKVsxXTtcblx0XHRcdGxldCB1cGRhdGVDb3VudCA9IDA7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0XHRwZWVyLnVwZGF0ZWRBdC5yZWFkKHJlYWRlcik7XG5cdFx0XHRcdHBlZXIuZGVzY3JpcHRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRwZWVyLmxhc3RUdXJuRW5kLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0dXBkYXRlQ291bnQrKztcblx0XHRcdH0pKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktdmFsdWVzJywgJ2NvcGlsb3RjbGknLCBtYWtlQ2F0YWxvZygpKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZUNvdW50LCAxKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3BlZXIgY2hhdHMgbWFwIHByb3RvY29sIGludGVyYWN0aXZpdHkgdG8gdGhlIHByb3ZpZGVyLWFnbm9zdGljIHRyaS1zdGF0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktcm8nKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLXJvJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHJlYWRPbmx5UGVlciA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1ybycpO1xuXHRcdFx0Y29uc3QgaGlkZGVuUGVlciA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci1oaWRkZW4nKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktcm8nLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeShyZWFkT25seVBlZXIsICdXb3JrZXInKSwgaW50ZXJhY3Rpdml0eTogUHJvdG9jb2xDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSB9LFxuXHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeShoaWRkZW5QZWVyLCAnSGlkZGVuIFdvcmtlcicpLCBpbnRlcmFjdGl2aXR5OiBQcm90b2NvbENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbiB9LFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvbi5jaGF0cy5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhdHMubWFwKGMgPT4gYy5pbnRlcmFjdGl2aXR5LmdldCgpKSwgW1xuXHRcdFx0XHRDaGF0SW50ZXJhY3Rpdml0eS5GdWxsLFxuXHRcdFx0XHRDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSxcblx0XHRcdFx0Q2hhdEludGVyYWN0aXZpdHkuSGlkZGVuLFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJhZ2VudCAodG9vbC1vcmlnaW4pIGNoYXRzIHN1cmZhY2UgYXMgcmVhZC1vbmx5IHBlZXJzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1zdWInKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLXN1YicpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBzdWJhZ2VudENoYXQgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLCAndGMtMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1zdWInLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeShzdWJhZ2VudENoYXQsICdDb2RlIFJldmlld2VyJyksIG9yaWdpbjogeyBraW5kOiBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IGRlZmF1bHRDaGF0LCB0b29sQ2FsbElkOiAndGMtMScgfSwgaW50ZXJhY3Rpdml0eTogUHJvdG9jb2xDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSB9LFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvbi5jaGF0cy5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0aXRsZXM6IGNoYXRzLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiBjaGF0cy5tYXAoYyA9PiBjLmludGVyYWN0aXZpdHkuZ2V0KCkpLFxuXHRcdFx0XHRzdWJhZ2VudE9yaWdpbjogY2hhdHNbMV0/Lm9yaWdpbj8ua2luZCxcblx0XHRcdFx0Ly8gVGhlIHN1YmFnZW50IHJlY29yZHMgaXRzIHBhcmVudCBjaGF0ICh0aGUgZGVmYXVsdCBjaGF0KSBzbyB0aGVcblx0XHRcdFx0Ly8gXCJBZ2VudHNcIiByb3cgY2FuIGxpc3QgaXQgdW5kZXIgdGhlIGNoYXQgdGhhdCBzcGF3bmVkIGl0LlxuXHRcdFx0XHRzdWJhZ2VudFBhcmVudElzTWFpbjogISFjaGF0c1sxXT8ub3JpZ2luPy5wYXJlbnRDaGF0ICYmIGlzRXF1YWwoY2hhdHNbMV0ub3JpZ2luLnBhcmVudENoYXQsIGNoYXRzWzBdLnJlc291cmNlKSxcblx0XHRcdFx0Ly8gQSBzdWJhZ2VudCB3b3JrZXIgY2hhdCBpcyBuZWl0aGVyIHJlbmFtZWFibGUgbm9yIGRlbGV0YWJsZS5cblx0XHRcdFx0c3ViYWdlbnRDYXBhYmlsaXRpZXM6IGdldENoYXRDYXBhYmlsaXRpZXMoY2hhdHNbMV0sIHNlc3Npb24sIHVuZGVmaW5lZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRpdGxlczogWydTZXNzaW9uJywgJ0NvZGUgUmV2aWV3ZXInXSxcblx0XHRcdFx0aW50ZXJhY3Rpdml0eTogW0NoYXRJbnRlcmFjdGl2aXR5LkZ1bGwsIENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5XSxcblx0XHRcdFx0c3ViYWdlbnRPcmlnaW46IENoYXRPcmlnaW5LaW5kLlRvb2wsXG5cdFx0XHRcdHN1YmFnZW50UGFyZW50SXNNYWluOiB0cnVlLFxuXHRcdFx0XHRzdWJhZ2VudENhcGFiaWxpdGllczogeyBjYW5SZW5hbWU6IGZhbHNlLCBjYW5EZWxldGU6IGZhbHNlIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RoZSBtYWluIGNoYXQgaXMgcmVuYW1lYWJsZSBidXQgbmV2ZXIgZGVsZXRhYmxlIHZpYSBjYXBhYmlsaXRpZXMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ21haW4tY2FwcycpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbWFpbi1jYXBzJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbWFpbi1jYXBzJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0eyAuLi5tYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksIG9yaWdpbjogeyBraW5kOiBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9LFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvbi5jaGF0cy5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQvLyBUaGUgbWFpbiAoZGVmYXVsdCkgY2hhdDogcmVuYW1lYWJsZSwgbmV2ZXIgZGVsZXRhYmxlLlxuXHRcdFx0XHRtYWluOiBnZXRDaGF0Q2FwYWJpbGl0aWVzKGNoYXRzWzBdLCBzZXNzaW9uLCB1bmRlZmluZWQpLFxuXHRcdFx0XHQvLyBBIHJlZ3VsYXIgdXNlciBwZWVyIGNoYXQ6IGZ1bGx5IG1hbmFnZWFibGUuXG5cdFx0XHRcdHBlZXI6IGdldENoYXRDYXBhYmlsaXRpZXMoY2hhdHNbMV0sIHNlc3Npb24sIHVuZGVmaW5lZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG1haW46IHsgY2FuUmVuYW1lOiB0cnVlLCBjYW5EZWxldGU6IGZhbHNlIH0sXG5cdFx0XHRcdHBlZXI6IHsgY2FuUmVuYW1lOiB0cnVlLCBjYW5EZWxldGU6IHRydWUgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc3ViYWdlbnQgY2hhdHMgc3VyZmFjZSBhcyByZWFkLW9ubHkgcGVlcnMgZXZlbiB3aXRob3V0IG11bHRpLWNoYXQgc3VwcG9ydCwgYnV0IHVzZXIgcGVlcnMgZG8gbm90JywgKCkgPT4ge1xuXHRcdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbXG5cdFx0XHRcdHsgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdIH0gYXMgQWdlbnRJbmZvLFxuXHRcdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ2NsYXVkZS1zdWInLCB7IHRpdGxlOiAnQ2xhdWRlJywgcHJvdmlkZXI6ICdjbGF1ZGUnIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IEFnZW50U2Vzc2lvbi5pZChzLnJlc291cmNlLnRvU3RyaW5nKCkpID09PSAnY2xhdWRlLXN1YicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY2xhdWRlJywgJ2NsYXVkZS1zdWInKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3Qgc3ViYWdlbnRDaGF0ID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaSwgJ3RjLTEnKTtcblx0XHRcdGNvbnN0IHVzZXJQZWVyID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY2xhdWRlLXN1YicsICdjbGF1ZGUnLCB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY2xhdWRlJyxcblx0XHRcdFx0dGl0bGU6ICdDbGF1ZGUnLFxuXHRcdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0XHRkZWZhdWx0Q2hhdCxcblx0XHRcdFx0Y2hhdHM6IFtcblx0XHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0XHR7IC4uLm1ha2VDaGF0U3VtbWFyeShzdWJhZ2VudENoYXQsICdDb2RlIFJldmlld2VyJyksIG9yaWdpbjogeyBraW5kOiBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlRvb2wsIGNoYXQ6IGRlZmF1bHRDaGF0LCB0b29sQ2FsbElkOiAndGMtMScgfSwgaW50ZXJhY3Rpdml0eTogUHJvdG9jb2xDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seSB9LFxuXHRcdFx0XHRcdHsgLi4ubWFrZUNoYXRTdW1tYXJ5KHVzZXJQZWVyLCAnVXNlciBQZWVyJyksIG9yaWdpbjogeyBraW5kOiBQcm90b2NvbENoYXRPcmlnaW5LaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGNoYXRzID0gc2Vzc2lvbiEuY2hhdHMuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBzZXNzaW9uIS5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdFx0XHR0aXRsZXM6IGNoYXRzLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdFx0XHRpbnRlcmFjdGl2aXR5OiBjaGF0cy5tYXAoYyA9PiBjLmludGVyYWN0aXZpdHkuZ2V0KCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLFxuXHRcdFx0XHQvLyBUaGUgdXNlciBwZWVyIGlzIG5vdCBzdXJmYWNlZCAobm8gbXVsdGktY2hhdCBzdXBwb3J0KTsgdGhlIHN1YmFnZW50IGlzLlxuXHRcdFx0XHR0aXRsZXM6IFsnQ2xhdWRlJywgJ0NvZGUgUmV2aWV3ZXInXSxcblx0XHRcdFx0aW50ZXJhY3Rpdml0eTogW0NoYXRJbnRlcmFjdGl2aXR5LkZ1bGwsIENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBuZXcgcGVlciBjaGF0IGlzIHByZXNlbnRlZCBhcyBVbnRpdGxlZCB1bnRpbCBpdHMgZmlyc3QgcmVxdWVzdCBpcyBzZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1uZXcnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLW5ldycpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdChzZXNzaW9uIGFzIEFnZW50SG9zdFNlc3Npb25BZGFwdGVyKS5tYXJrQ2hhdEFzTmV3KCdwZWVyLTEnKTtcblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLW5ldycsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyID0gKCkgPT4gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0Y29uc3Qgd2hpbGVOZXcgPSBwZWVyKCkhLnN0YXR1cy5nZXQoKTtcblxuXHRcdFx0KHNlc3Npb24gYXMgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXIpLm1hcmtDaGF0QXNTZW50KCdwZWVyLTEnKTtcblx0XHRcdGNvbnN0IGFmdGVyU2VudCA9IHBlZXIoKSEuc3RhdHVzLmdldCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgd2hpbGVOZXcsIGFmdGVyU2VudCB9LCB7XG5cdFx0XHRcdHdoaWxlTmV3OiBTZXNzaW9uU3RhdHVzLlVudGl0bGVkLFxuXHRcdFx0XHRhZnRlclNlbnQ6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHBlZXIgY2F0YWxvZyBjb2xsYXBzZWQgd2hpbGUgY2FwYWJpbGl0aWVzIHdlcmUgYWJzZW50IHJlLWV4cGFuZHMgd2hlbiB0aGV5IGh5ZHJhdGUnLCAoKSA9PiB7XG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgcmFjZSB3aGVyZSBhIG11bHRpLWNoYXQgU2Vzc2lvblN0YXRlIGlzIHByb2Nlc3NlZCBiZWZvcmVcblx0XHRcdC8vIHRoZSBhZ2VudCBob3N0J3Mgcm9vdCBzdGF0ZSBhZHZlcnRpc2VzIGBzdXBwb3J0c011bHRpcGxlQ2hhdHNgLlxuXHRcdFx0YWdlbnRIb3N0LnNldEFnZW50cyhbeyBwcm92aWRlcjogJ2NvcGlsb3RjbGknLCBkaXNwbGF5TmFtZTogJ0NvcGlsb3QnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10sIGNhcGFiaWxpdGllczoge30gfSBhcyBBZ2VudEluZm9dKTtcblxuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1sYXRlLWNhcHMnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLWxhdGUtY2FwcycpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLWxhdGUtY2FwcycsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBjb2xsYXBzZWQgPSB7XG5cdFx0XHRcdHN1cHBvcnRzTXVsdGlwbGVDaGF0czogc2Vzc2lvbi5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLFxuXHRcdFx0XHRjaGF0RnJhZ21lbnRzOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gQ2FwYWJpbGl0aWVzIGh5ZHJhdGUgbGF0ZTsgdGhlIGNhdGFsb2cgbXVzdCByZS1leHBhbmQgd2l0aG91dCBhbm90aGVyXG5cdFx0XHQvLyBzZXNzaW9uLXN0YXRlIHVwZGF0ZS5cblx0XHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW3sgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdLCBjYXBhYmlsaXRpZXM6IHsgbXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlIH0gfSB9IGFzIEFnZW50SW5mb10pO1xuXG5cdFx0XHRjb25zdCBoeWRyYXRlZCA9IHtcblx0XHRcdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsXG5cdFx0XHRcdGNoYXRGcmFnbWVudHM6IHNlc3Npb24uY2hhdHMuZ2V0KCkubWFwKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCksXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29sbGFwc2VkLCBoeWRyYXRlZCB9LCB7XG5cdFx0XHRcdGNvbGxhcHNlZDogeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlLCBjaGF0RnJhZ21lbnRzOiBbJyddIH0sXG5cdFx0XHRcdGh5ZHJhdGVkOiB7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSwgY2hhdEZyYWdtZW50czogWycnLCAncGVlci0xJ10gfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9ya0NoYXQgZm9yd2FyZHMgdGhlIHNvdXJjZSBjaGF0IGFuZCB0dXJuIHRvIHRoZSBob3N0IGFuZCBzdXJmYWNlcyBhIG5ldyBwZWVyIGNoYXQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktZm9yaycpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktZm9yaycpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLWZvcmsnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IGZvcmtlZCA9IGF3YWl0IHByb3ZpZGVyLmZvcmtDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnJlc291cmNlLCAndHVybi0xJyk7XG5cblx0XHRcdGNvbnN0IGNhbGwgPSBhZ2VudEhvc3QuY3JlYXRlZENoYXRzLmF0KC0xKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmb3JrU291cmNlOiBjYWxsPy5vcHRpb25zPy5mb3JrPy5zb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Zm9ya1R1cm5JZDogY2FsbD8ub3B0aW9ucz8uZm9yaz8udHVybklkLFxuXHRcdFx0XHRmb3JrZWRJc1BlZXI6ICEhZm9ya2VkLnJlc291cmNlLmZyYWdtZW50LFxuXHRcdFx0XHRmb3JrZWRJbkNhdGFsb2c6IHNlc3Npb24uY2hhdHMuZ2V0KCkuc29tZShjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gZm9ya2VkLnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmb3JrU291cmNlOiBkZWZhdWx0Q2hhdCxcblx0XHRcdFx0Zm9ya1R1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGZvcmtlZElzUGVlcjogdHJ1ZSxcblx0XHRcdFx0Zm9ya2VkSW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2lkZUNoYXQgZm9yd2FyZHMgdGhlIHNvdXJjZSBjaGF0IGFuZCB0dXJuIHRvIHRoZSBob3N0IGFuZCBzdXJmYWNlcyBhIG5ldyBwZWVyIGNoYXQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGFnZW50SG9zdC5zZXRBZ2VudHMoW3sgcHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgZGlzcGxheU5hbWU6ICdDb3BpbG90JywgZGVzY3JpcHRpb246ICcnLCBtb2RlbHM6IFtdLCBjYXBhYmlsaXRpZXM6IHsgbXVsdGlwbGVDaGF0czogeyBmb3JrOiB0cnVlLCBzaWRlQ2hhdDogdHJ1ZSB9IH0gfSBhcyBBZ2VudEluZm9dKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktc2lkZS1jaGF0Jyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1zaWRlLWNoYXQnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1zaWRlLWNoYXQnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c1NpZGVDaGF0LCB0cnVlKTtcblxuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnIH07XG5cdFx0XHRjb25zdCBzaWRlQ2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZVNpZGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnJlc291cmNlLCAndHVybi0xJywgc2VsZWN0aW9uKTtcblxuXHRcdFx0Y29uc3QgY2FsbCA9IGFnZW50SG9zdC5jcmVhdGVkQ2hhdHMuYXQoLTEpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNpZGVDaGF0U291cmNlOiBjYWxsPy5vcHRpb25zPy5zaWRlQ2hhdD8uc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdHNpZGVDaGF0VHVybklkOiBjYWxsPy5vcHRpb25zPy5zaWRlQ2hhdD8udHVybklkLFxuXHRcdFx0XHRzaWRlQ2hhdFNlbGVjdGlvbjogY2FsbD8ub3B0aW9ucz8uc2lkZUNoYXQ/LnNlbGVjdGlvbixcblx0XHRcdFx0c2lkZUNoYXRJc1BlZXI6ICEhc2lkZUNoYXQucmVzb3VyY2UuZnJhZ21lbnQsXG5cdFx0XHRcdHNpZGVDaGF0SW5DYXRhbG9nOiBzZXNzaW9uLmNoYXRzLmdldCgpLnNvbWUoYyA9PiBjLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNpZGVDaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzaWRlQ2hhdFNvdXJjZTogZGVmYXVsdENoYXQsXG5cdFx0XHRcdHNpZGVDaGF0VHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c2lkZUNoYXRTZWxlY3Rpb246IHNlbGVjdGlvbixcblx0XHRcdFx0c2lkZUNoYXRJc1BlZXI6IHRydWUsXG5cdFx0XHRcdHNpZGVDaGF0SW5DYXRhbG9nOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSkpO1xuXG5cdFx0dGVzdCgnY3JlYXRlU2lkZUNoYXQgaW5oZXJpdHMgbW9kZWwgYW5kIGFnZW50IHNlbGVjdGlvbiBmcm9tIHRoZSBzb3VyY2UgcGVlciBjaGF0JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFt7IHByb3ZpZGVyOiAnY29waWxvdGNsaScsIGRpc3BsYXlOYW1lOiAnQ29waWxvdCcsIGRlc2NyaXB0aW9uOiAnJywgbW9kZWxzOiBbXSwgY2FwYWJpbGl0aWVzOiB7IG11bHRpcGxlQ2hhdHM6IHsgZm9yazogdHJ1ZSwgc2lkZUNoYXQ6IHRydWUgfSB9IH0gYXMgQWdlbnRJbmZvXSk7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IGlucHV0U3RhdGVzOiB7IHJlc291cmNlOiBzdHJpbmc7IHN0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGFjdGl2ZVNlc3Npb24sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IGNyZWF0ZVRlc3RMYW5ndWFnZU1vZGVsLFxuXHRcdFx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnB1dE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gY29uc3RPYnNlcnZhYmxlPElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdGlucHV0U3RhdGVzLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgc3RhdGUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBjbGVhclN0YXRlKCk6IHZvaWQgeyB9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSB0b0pTT04oKTogdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0TW9kZWw+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXRNb2RlbCA9IGlucHV0TW9kZWw7XG5cdFx0XHRcdFx0fSgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvYmplY3Q6IGNoYXRNb2RlbCxcblx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRNb2RlbFJlZmVyZW5jZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLXNpZGUtY2hhdC1wZWVyLXNlbGVjdGlvbicpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbXVsdGktc2lkZS1jaGF0LXBlZXItc2VsZWN0aW9uJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXNpZGUtY2hhdC1wZWVyLXNlbGVjdGlvbicsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlZXIpO1xuXHRcdFx0YWN0aXZlU2Vzc2lvbi5zZXQoeyBzZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLCBhY3RpdmVDaGF0OiBjb25zdE9ic2VydmFibGUocGVlciEpIH0gYXMgSUFjdGl2ZVNlc3Npb24sIHVuZGVmaW5lZCk7XG5cdFx0XHRwcm92aWRlci5zZXRNb2RlbChzZXNzaW9uLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpwZWVyLW1vZGVsJyk7XG5cdFx0XHRwcm92aWRlci5zZXRBZ2VudD8uKHNlc3Npb24uc2Vzc2lvbklkLCB7IHVyaTogJ2FnZW50Oi8vcGVlcicsIG5hbWU6ICdwZWVyJyB9KTtcblxuXHRcdFx0Y29uc3Qgc2lkZUNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVTaWRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgcGVlciEucmVzb3VyY2UsICd0dXJuLTEnKTtcblx0XHRcdGNvbnN0IGNhbGwgPSBhZ2VudEhvc3QuY3JlYXRlZENoYXRzLmF0KC0xKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNpZGVDaGF0U291cmNlOiBjYWxsPy5vcHRpb25zPy5zaWRlQ2hhdD8uc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNyZWF0ZWRNb2RlbDogY2FsbD8ub3B0aW9ucz8ubW9kZWwsXG5cdFx0XHRcdHBlZXJJbnB1dFNlbGVjdGVkTW9kZWxzOiBpbnB1dFN0YXRlc1xuXHRcdFx0XHRcdC5maWx0ZXIoZW50cnkgPT4gZW50cnkucmVzb3VyY2UgPT09IHNpZGVDaGF0LnJlc291cmNlLnRvU3RyaW5nKCkpXG5cdFx0XHRcdFx0Lm1hcChlbnRyeSA9PiBlbnRyeS5zdGF0ZS5zZWxlY3RlZE1vZGVsPy5pZGVudGlmaWVyKVxuXHRcdFx0XHRcdC5maWx0ZXIoKGlkKTogaWQgaXMgc3RyaW5nID0+IGlkICE9PSB1bmRlZmluZWQpLFxuXHRcdFx0XHRwZWVySW5wdXRNb2RlczogaW5wdXRTdGF0ZXNcblx0XHRcdFx0XHQuZmlsdGVyKGVudHJ5ID0+IGVudHJ5LnJlc291cmNlID09PSBzaWRlQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpKVxuXHRcdFx0XHRcdC5tYXAoZW50cnkgPT4gZW50cnkuc3RhdGUubW9kZT8uaWQpXG5cdFx0XHRcdFx0LmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gaWQgIT09IHVuZGVmaW5lZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNpZGVDaGF0U291cmNlOiBwZWVyQ2hhdCxcblx0XHRcdFx0Y3JlYXRlZE1vZGVsOiB7IGlkOiAncGVlci1tb2RlbCcgfSxcblx0XHRcdFx0cGVlcklucHV0U2VsZWN0ZWRNb2RlbHM6IFsnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnBlZXItbW9kZWwnXSxcblx0XHRcdFx0cGVlcklucHV0TW9kZXM6IFsnYWdlbnQ6Ly9wZWVyJ10sXG5cdFx0XHR9KTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVTaWRlQ2hhdCByZWplY3RzIHdoZW4gdGhlIHNlc3Npb24gY2FwYWJpbGl0eSBpcyBub3QgYWR2ZXJ0aXNlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktc2lkZS1jaGF0LXVuc3VwcG9ydGVkJyk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKCgpID0+IHByb3ZpZGVyLmNyZWF0ZVNpZGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBzZXNzaW9uLnJlc291cmNlLCAndHVybi0xJyksIC9kb2VzIG5vdCBzdXBwb3J0IHNpZGUgY2hhdHMvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZU5ld0NoYXQgZm9yd2FyZHMgdGhlIHNlbGVjdGVkIG1vZGVsIHRvIHRoZSBob3N0IGFuZCBzZWVkcyB0aGUgY2hhdCBpbnB1dCBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGlucHV0U3RhdGVzOiB7IHJlc291cmNlOiBzdHJpbmc7IHN0YXRlOiBQYXJ0aWFsPElDaGF0TW9kZWxJbnB1dFN0YXRlPiB9W10gPSBbXTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IGNyZWF0ZVRlc3RMYW5ndWFnZU1vZGVsLFxuXHRcdFx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgcmVzb3VyY2UgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGlucHV0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElJbnB1dE1vZGVsPigpIHtcblx0XHRcdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXRlID0gY29uc3RPYnNlcnZhYmxlPElDaGF0TW9kZWxJbnB1dFN0YXRlIHwgdW5kZWZpbmVkPih1bmRlZmluZWQpO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgc2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRcdGlucHV0U3RhdGVzLnB1c2goeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgc3RhdGUgfSk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBjbGVhclN0YXRlKCk6IHZvaWQgeyB9XG5cdFx0XHRcdFx0XHRvdmVycmlkZSB0b0pTT04oKTogdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRcdFx0XHRcdH0oKTtcblx0XHRcdFx0XHRjb25zdCBjaGF0TW9kZWwgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0TW9kZWw+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaW5wdXRNb2RlbCA9IGlucHV0TW9kZWw7XG5cdFx0XHRcdFx0fSgpO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRvYmplY3Q6IGNoYXRNb2RlbCxcblx0XHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgSUNoYXRNb2RlbFJlZmVyZW5jZTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLW1vZGVsJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1tb2RlbCcpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1tb2RlbCcsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRdLCB7IGRlZmF1bHRDaGF0IH0pKTtcblxuXHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6c2VsZWN0ZWQtbW9kZWwnKTtcblxuXHRcdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y3JlYXRlZE1vZGVsOiBhZ2VudEhvc3QuY3JlYXRlZENoYXRzLmF0KC0xKT8ub3B0aW9ucz8ubW9kZWwsXG5cdFx0XHRcdHBlZXJJbnB1dFNlbGVjdGVkTW9kZWxzOiBpbnB1dFN0YXRlc1xuXHRcdFx0XHRcdC5maWx0ZXIoZW50cnkgPT4gZW50cnkucmVzb3VyY2UgPT09IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSlcblx0XHRcdFx0XHQubWFwKGVudHJ5ID0+IGVudHJ5LnN0YXRlLnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIpXG5cdFx0XHRcdFx0LmZpbHRlcigoaWQpOiBpZCBpcyBzdHJpbmcgPT4gaWQgIT09IHVuZGVmaW5lZCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNyZWF0ZWRNb2RlbDogeyBpZDogJ3NlbGVjdGVkLW1vZGVsJyB9LFxuXHRcdFx0XHRwZWVySW5wdXRTZWxlY3RlZE1vZGVsczogWydhZ2VudC1ob3N0LWNvcGlsb3RjbGk6c2VsZWN0ZWQtbW9kZWwnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VuZFJlcXVlc3Qga2VlcHMgYSBwZWVyIGNoYXQgbW9kZWwgbG9hZGVkIHdoaWxlIGRpc3BhdGNoaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbG9hZGVkUmVzb3VyY2VzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdFx0XHRjb25zdCBkaXNwb3NlZFJlc291cmNlczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IHNlbmRTYXdMb2FkZWQ6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jIHJlc291cmNlID0+IHtcblx0XHRcdFx0XHRjb25zdCByZXNvdXJjZUtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0bG9hZGVkUmVzb3VyY2VzLmFkZChyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0Y29uc3QgaW5wdXRNb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUlucHV0TW9kZWw+KCkge1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBjb25zdE9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSBzZXRTdGF0ZShfc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIGNsZWFyU3RhdGUoKTogdm9pZCB7IH1cblx0XHRcdFx0XHRcdG92ZXJyaWRlIHRvSlNPTigpOiB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdFx0fSgpO1xuXHRcdFx0XHRcdGNvbnN0IGNoYXRNb2RlbCA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRNb2RlbD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnB1dE1vZGVsID0gaW5wdXRNb2RlbDtcblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdG9iamVjdDogY2hhdE1vZGVsLFxuXHRcdFx0XHRcdFx0ZGlzcG9zZSgpIHtcblx0XHRcdFx0XHRcdFx0bG9hZGVkUmVzb3VyY2VzLmRlbGV0ZShyZXNvdXJjZUtleSk7XG5cdFx0XHRcdFx0XHRcdGRpc3Bvc2VkUmVzb3VyY2VzLnB1c2gocmVzb3VyY2VLZXkpO1xuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9IHNhdGlzZmllcyBJQ2hhdE1vZGVsUmVmZXJlbmNlO1xuXHRcdFx0XHR9LFxuXHRcdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKHJlc291cmNlKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4ge1xuXHRcdFx0XHRcdHNlbmRTYXdMb2FkZWQucHVzaChsb2FkZWRSZXNvdXJjZXMuaGFzKHJlc291cmNlLnRvU3RyaW5nKCkpKTtcblx0XHRcdFx0XHRyZXR1cm4geyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIENoYXRTZW5kUmVzdWx0IGV4dGVuZHMgeyBraW5kOiAnc2VudCc7IGRhdGE6IGluZmVyIEQgfSA/IEQgOiBuZXZlciB9O1xuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktc2VuZC1wZWVyJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1zZW5kLXBlZXInKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktc2VuZC1wZWVyJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlZXIpO1xuXG5cdFx0XHRhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgcGVlci5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlbmRTYXdMb2FkZWQsXG5cdFx0XHRcdGxvYWRlZFJlc291cmNlczogWy4uLmxvYWRlZFJlc291cmNlc10sXG5cdFx0XHRcdGRpc3Bvc2VkUmVzb3VyY2VzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZW5kU2F3TG9hZGVkOiBbdHJ1ZV0sXG5cdFx0XHRcdGxvYWRlZFJlc291cmNlczogW10sXG5cdFx0XHRcdGRpc3Bvc2VkUmVzb3VyY2VzOiBbcGVlci5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0TW9kZWwgdXBkYXRlcyB0aGUgYWN0aXZlIHBlZXIgY2hhdCBtb2RlbCB3aXRob3V0IGNoYW5naW5nIHRoZSBkZWZhdWx0IGNoYXQgbW9kZWwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktYWN0aXZlLW1vZGVsJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1hY3RpdmUtbW9kZWwnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktYWN0aXZlLW1vZGVsJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IHBlZXIgPSBzZXNzaW9uLmNoYXRzLmdldCgpLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSAncGVlci0xJyk7XG5cdFx0XHRhc3NlcnQub2socGVlcik7XG5cdFx0XHRhY3RpdmVTZXNzaW9uLnNldCh7IHNlc3Npb25JZDogc2Vzc2lvbi5zZXNzaW9uSWQsIGFjdGl2ZUNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShwZWVyISkgfSBhcyBJQWN0aXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblxuXHRcdFx0cHJvdmlkZXIuc2V0TW9kZWwoc2Vzc2lvbi5zZXNzaW9uSWQsICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6cGVlci1tb2RlbCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0ZGVmYXVsdE1vZGVsSWQ6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkubW9kZWxJZC5nZXQoKSxcblx0XHRcdFx0cGVlck1vZGVsSWQ6IHBlZXIhLm1vZGVsSWQuZ2V0KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGRlZmF1bHRNb2RlbElkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlZXJNb2RlbElkOiAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnBlZXItbW9kZWwnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxldGVDaGF0IHByb21wdHMgZm9yIGNvbmZpcm1hdGlvbiBhbmQgZGlzcG9zZXMgdGhlIHBlZXIgY2hhdCB3aGVuIGNvbmZpcm1lZCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlybURlbGV0ZTogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1kZWwnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLWRlbCcpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLWRlbCcsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyID0gc2Vzc2lvbi5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy5yZXNvdXJjZS5mcmFnbWVudCA9PT0gJ3BlZXItMScpO1xuXHRcdFx0YXNzZXJ0Lm9rKHBlZXIpO1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgcGVlciEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFnZW50SG9zdC5kaXNwb3NlZENoYXRzLm1hcCh1ID0+IHUudG9TdHJpbmcoKSksIFtwZWVyQ2hhdF0pO1xuXHRcdH0pKTtcblxuXHRcdHRlc3QoJ2RlbGV0ZUNoYXQgZG9lcyBub3QgZGlzcG9zZSB0aGUgcGVlciBjaGF0IHdoZW4gdGhlIGNvbmZpcm1hdGlvbiBpcyBjYW5jZWxsZWQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGNvbmZpcm1EZWxldGU6IGZhbHNlIH0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHNldHVwTXVsdGlDaGF0U2Vzc2lvbihwcm92aWRlciwgJ211bHRpLWRlbC1jYW5jZWwnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLWRlbC1jYW5jZWwnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1kZWwtY2FuY2VsJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KHBlZXJDaGF0LCAnUGVlcicpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGNvbnN0IHBlZXIgPSBzZXNzaW9uLmNoYXRzLmdldCgpLmZpbmQoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSAncGVlci0xJyk7XG5cdFx0XHRhc3NlcnQub2socGVlcik7XG5cdFx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCBwZWVyIS5yZXNvdXJjZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWdlbnRIb3N0LmRpc3Bvc2VkQ2hhdHMsIFtdKTtcblx0XHR9KSk7XG5cblx0XHR0ZXN0KCdzaW5nbGUtY2hhdCBjYXRhbG9nIGRlZ3JhZGVzIHRvIHRoZSBkZWZhdWx0IGNoYXQgb25seScsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktc2luZ2xlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdtdWx0aS1zaW5nbGUnKS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdtdWx0aS1zaW5nbGUnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJycpLFxuXHRcdFx0XSwgeyBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjaGF0Q291bnQ6IHNlc3Npb24uY2hhdHMuZ2V0KCkubGVuZ3RoLFxuXHRcdFx0XHRtYWluSXNPbmx5Q2hhdDogc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKSA9PT0gc2Vzc2lvbi5jaGF0cy5nZXQoKVswXSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2hhdENvdW50OiAxLFxuXHRcdFx0XHRtYWluSXNPbmx5Q2hhdDogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZpbmcgYSBwZWVyIGZyb20gdGhlIGNhdGFsb2cgZHJvcHMgaXQgYmFjayB0byB0aGUgZGVmYXVsdCBjaGF0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzZXR1cE11bHRpQ2hhdFNlc3Npb24ocHJvdmlkZXIsICdtdWx0aS1yZW1vdmUnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLXJlbW92ZScpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ211bHRpLXJlbW92ZScsICdjb3BpbG90Y2xpJywgbWFrZVN0YXRlKFtcblx0XHRcdFx0bWFrZUNoYXRTdW1tYXJ5KGRlZmF1bHRDaGF0LCAnJyksXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShwZWVyQ2hhdCwgJ1BlZXInKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJBZGQgPSBzZXNzaW9uLmNoYXRzLmdldCgpLmxlbmd0aDtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktcmVtb3ZlJywgJ2NvcGlsb3RjbGknLCBtYWtlU3RhdGUoW1xuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkoZGVmYXVsdENoYXQsICcnKSxcblx0XHRcdF0sIHsgZGVmYXVsdENoYXQgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0YWZ0ZXJBZGQsXG5cdFx0XHRcdGFmdGVyUmVtb3ZlOiBzZXNzaW9uLmNoYXRzLmdldCgpLm1hcChjID0+IGMucmVzb3VyY2UuZnJhZ21lbnQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRhZnRlckFkZDogMixcblx0XHRcdFx0YWZ0ZXJSZW1vdmU6IFsnJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHQgY2hhdCB0aXRsZSBkaXZlcmdlcyBmcm9tIHRoZSBzZXNzaW9uIHRpdGxlIHdoZW4gcmVuYW1lZCBpbiB0aGUgY2F0YWxvZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2V0dXBNdWx0aUNoYXRTZXNzaW9uKHByb3ZpZGVyLCAnbXVsdGktdGl0bGUnKTtcblx0XHRcdGNvbnN0IHNlc3Npb25VcmkgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ211bHRpLXRpdGxlJykudG9TdHJpbmcoKTtcblx0XHRcdGNvbnN0IGRlZmF1bHRDaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblx0XHRcdGNvbnN0IHBlZXJDaGF0ID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTEnKTtcblxuXHRcdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnbXVsdGktdGl0bGUnLCAnY29waWxvdGNsaScsIG1ha2VTdGF0ZShbXG5cdFx0XHRcdG1ha2VDaGF0U3VtbWFyeShkZWZhdWx0Q2hhdCwgJ1JlbmFtZWQgRGVmYXVsdCcpLFxuXHRcdFx0XHRtYWtlQ2hhdFN1bW1hcnkocGVlckNoYXQsICdQZWVyJyksXG5cdFx0XHRdLCB7IHNlc3Npb25UaXRsZTogJ1Nlc3Npb24nLCBkZWZhdWx0Q2hhdCB9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzZXNzaW9uVGl0bGU6IHNlc3Npb24udGl0bGUuZ2V0KCksXG5cdFx0XHRcdGRlZmF1bHRDaGF0VGl0bGU6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkudGl0bGUuZ2V0KCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHNlc3Npb25UaXRsZTogJ1Nlc3Npb24nLFxuXHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiAnUmVuYW1lZCBEZWZhdWx0Jyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFRpdGxlIGNoYW5nZSBmcm9tIHNlcnZlciAtLS0tLS0tXG5cblx0dGVzdCgnc2VydmVyLWVjaG9lZCBTZXNzaW9uVGl0bGVDaGFuZ2VkIHVwZGF0ZXMgY2FjaGVkIHRpdGxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdlY2hvLXNlc3MnLCB7IHRpdGxlOiAnT3JpZ2luYWwnIH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHRhcmdldCA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnT3JpZ2luYWwnKTtcblx0XHRhc3NlcnQub2sodGFyZ2V0KTtcblxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2VjaG8tc2VzcycpLnRvU3RyaW5nKCksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0XHR0aXRsZTogJ1NlcnZlciBUaXRsZScsXG5cdFx0XHR9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGFyZ2V0IS50aXRsZS5nZXQoKSwgJ1NlcnZlciBUaXRsZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZXNbMF0uY2hhbmdlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXItZWNob2VkIENoYXRUdXJuU3RhcnRlZCBtb2RlbCBkb2VzIG5vdCB1cGRhdGUgY2FjaGVkIHNlc3Npb24gbW9kZWwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgJ21vZGVsLWNoYW5nZScsIHsgdGl0bGU6ICdNb2RlbCBDaGFuZ2UnIH0pO1xuXG5cdFx0Y29uc3QgdGFyZ2V0ID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ01vZGVsIENoYW5nZScpO1xuXHRcdGFzc2VydC5vayh0YXJnZXQpO1xuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHRhcmdldCEuc2Vzc2lvbklkLCAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOm9sZC1tb2RlbCcpO1xuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnbW9kZWwtY2hhbmdlJykudG9TdHJpbmcoKSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogJ25ldy1tb2RlbCcgfSB9LFxuXHRcdFx0fSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhcmdldCEubW9kZWxJZC5nZXQoKSwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpvbGQtbW9kZWwnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlcy5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlZnJlc2ggb24gdHVybkNvbXBsZXRlIC0tLS0tLS1cblxuXHR0ZXN0KCd0dXJuQ29tcGxldGUgYWN0aW9uIHRyaWdnZXJzIHNlc3Npb24gcmVmcmVzaCcsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3R1cm4tc2VzcycsIHsgc3VtbWFyeTogJ0JlZm9yZScsIG1vZGlmaWVkVGltZTogMTAwMCB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFVwZGF0ZSBvbiBjb25uZWN0aW9uIHNpZGVcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCd0dXJuLXNlc3MnLCB7IHN1bW1hcnk6ICdBZnRlcicsIG1vZGlmaWVkVGltZTogNTAwMCB9KSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogYnVpbGREZWZhdWx0Q2hhdFVyaShBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ3R1cm4tc2VzcycpLnRvU3RyaW5nKCkpLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0Lm9rKGNoYW5nZXMubGVuZ3RoID4gMCk7XG5cdFx0Y29uc3QgdXBkYXRlZFNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnQWZ0ZXInKTtcblx0XHRhc3NlcnQub2sodXBkYXRlZFNlc3Npb24pO1xuXHR9KSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGRhdGEgYWRhcHRlciAtLS0tLS0tXG5cblx0dGVzdCgnc2Vzc2lvbiBhZGFwdGVyIGhhcyBjb3JyZWN0IHdvcmtzcGFjZSBmcm9tIHdvcmtpbmcgZGlyZWN0b3J5JywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignd3Mtc2VzcycsIHsgc3VtbWFyeTogJ1dTIFRlc3QnLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL215cmVwbycpIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHdzU2Vzc2lvbiA9IHNlc3Npb25zLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnV1MgVGVzdCcpO1xuXHRcdGFzc2VydC5vayh3c1Nlc3Npb24pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gd3NTZXNzaW9uIS53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZSEubGFiZWwsICdteXJlcG8nKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Nlc3Npb24gYWRhcHRlciB3aXRob3V0IHdvcmtpbmcgZGlyZWN0b3J5IGhhcyBubyB3b3Jrc3BhY2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCduby13cy1zZXNzJywgeyBzdW1tYXJ5OiAnTm8gV1MnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9ucy5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ05vIFdTJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uIS53b3Jrc3BhY2UuZ2V0KCksIHVuZGVmaW5lZCk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXNzaW9uIGFkYXB0ZXIgdXNlcyByYXcgSUQgYXMgZmFsbGJhY2sgdGl0bGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdhYmNkZWYxMjM0NTY3ODkwJykpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zWzBdO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbi50aXRsZS5nZXQoKSwgJ1Nlc3Npb24gYWJjZGVmMTInKTtcblx0fSkpO1xuXG5cdHRlc3QoJ25ldyBzZXNzaW9uIHN0YXlzIGxvYWRpbmcgd2hlbiByZXF1aXJlZCBjb25maWcgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXN1bHQgPSB7XG5cdFx0XHRzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHJlcXVpcmVkOiBbJ2JyYW5jaCddLCBwcm9wZXJ0aWVzOiB7IGJyYW5jaDogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdCcmFuY2gnLCBlbnVtOiBbJ21haW4nXSB9IH0gfSxcblx0XHRcdHZhbHVlczoge30sXG5cdFx0fTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uLnNlc3Npb25JZCwgY29uZmlnID0+IGNvbmZpZz8uc2NoZW1hLnJlcXVpcmVkPy5pbmNsdWRlcygnYnJhbmNoJykgPT09IHRydWUpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24ubG9hZGluZy5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NhY2hlZCBzZXNzaW9uIGxvYWRpbmcgcmVmbGVjdHMgYXV0aGVudGljYXRpb25QZW5kaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignY2FjaGVkLWF1dGgtbG9hZGluZycsIHsgc3VtbWFyeTogJ0NhY2hlZCcgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0NhY2hlZCcpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbiEubG9hZGluZy5nZXQoKSwgdHJ1ZSk7XG5cblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbiEubG9hZGluZy5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCduZXcgc2Vzc2lvbiBkZWZlcnMgYmFja2VuZCBzdGFydHVwIHVudGlsIGF1dGhlbnRpY2F0aW9uIHNldHRsZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LnNldEF1dGhlbnRpY2F0aW9uUGVuZGluZyh0cnVlKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdC8vIFdoaWxlIGF1dGggaXMgcGVuZGluZywgY29uZmlnL2JhY2tlbmQgd29yayBpcyBpbnRlbnRpb25hbGx5IGRlZmVycmVkLlxuXHRcdC8vIFByb3ZpZGVycyBzdWNoIGFzIENvZGV4IHJlamVjdCB0aG9zZSBjYWxscyB3aXRoIEF1dGhSZXF1aXJlZCBiZWZvcmUgdGhlXG5cdFx0Ly8gZmlyc3QgYXV0aCBwYXNzIHNldHRsZXMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkaW5nOiBzZXNzaW9uLmxvYWRpbmcuZ2V0KCksXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubGVuZ3RoLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRpbmc6IHRydWUsXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IDAsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IDAsXG5cdFx0XHRjb25maWc6IHsgc2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSB9LCB2YWx1ZXM6IHt9IH0sXG5cdFx0fSk7XG5cblx0XHRhZ2VudEhvc3Quc2V0QXV0aGVudGljYXRpb25QZW5kaW5nKGZhbHNlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbi5zZXNzaW9uSWQsIGNvbmZpZyA9PiBjb25maWc/LnZhbHVlcy5pc29sYXRpb24gPT09ICd3b3JrdHJlZScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkaW5nOiBzZXNzaW9uLmxvYWRpbmcuZ2V0KCksXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubGVuZ3RoLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRpbmc6IGZhbHNlLFxuXHRcdFx0Y3JlYXRlZFNlc3Npb25zOiAxLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiAxLFxuXHRcdFx0Y29uZmlnOiB7IHNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30gfSwgdmFsdWVzOiB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyBzZXNzaW9uIHN0YXlzIGxvYWRpbmcgYWZ0ZXIgYXV0aGVudGljYXRpb24gc2V0dGxlcyB3aGVuIHJlcXVpcmVkIGNvbmZpZyBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcodHJ1ZSk7XG5cdFx0YWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVzdWx0ID0ge1xuXHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydicmFuY2gnXSwgcHJvcGVydGllczogeyBicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgZW51bTogWydtYWluJ10gfSB9IH0sXG5cdFx0XHR2YWx1ZXM6IHt9LFxuXHRcdH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblxuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvYWRpbmc6IHNlc3Npb24ubG9hZGluZy5nZXQoKSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogYWdlbnRIb3N0LmNyZWF0ZWRTZXNzaW9uVXJpcy5sZW5ndGgsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1JlcXVlc3RzLmxlbmd0aCxcblx0XHRcdGNvbmZpZzogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCksXG5cdFx0fSwge1xuXHRcdFx0bG9hZGluZzogdHJ1ZSxcblx0XHRcdGNyZWF0ZWRTZXNzaW9uczogMCxcblx0XHRcdHJlc29sdmVSZXF1ZXN0czogMCxcblx0XHRcdGNvbmZpZzogeyBzY2hlbWE6IHsgdHlwZTogJ29iamVjdCcsIHByb3BlcnRpZXM6IHt9IH0sIHZhbHVlczoge30gfSxcblx0XHR9KTtcblxuXHRcdGFnZW50SG9zdC5zZXRBdXRoZW50aWNhdGlvblBlbmRpbmcoZmFsc2UpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uLnNlc3Npb25JZCwgY29uZmlnID0+IGNvbmZpZz8uc2NoZW1hLnJlcXVpcmVkPy5pbmNsdWRlcygnYnJhbmNoJykgPT09IHRydWUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkaW5nOiBzZXNzaW9uLmxvYWRpbmcuZ2V0KCksXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IGFnZW50SG9zdC5jcmVhdGVkU2Vzc2lvblVyaXMubGVuZ3RoLFxuXHRcdFx0cmVzb2x2ZVJlcXVlc3RzOiBhZ2VudEhvc3QucmVzb2x2ZVNlc3Npb25Db25maWdSZXF1ZXN0cy5sZW5ndGgsXG5cdFx0XHRjb25maWc6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRpbmc6IHRydWUsXG5cdFx0XHRjcmVhdGVkU2Vzc2lvbnM6IDEsXG5cdFx0XHRyZXNvbHZlUmVxdWVzdHM6IDEsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCByZXF1aXJlZDogWydicmFuY2gnXSwgcHJvcGVydGllczogeyBicmFuY2g6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQnJhbmNoJywgZW51bTogWydtYWluJ10gfSB9IH0sXG5cdFx0XHRcdHZhbHVlczoge30sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIHNlbmRSZXF1ZXN0IC0tLS0tLS1cblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCB0aHJvd3MgZm9yIHVua25vd24gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gcHJvdmlkZXIuc2VuZFJlcXVlc3QoJ25vbmV4aXN0ZW50JywgVVJJLnBhcnNlKCd1bnRpdGxlZDpjaGF0JyksIHsgcXVlcnk6ICd0ZXN0JyB9KSxcblx0XHRcdC9ub3QgZm91bmQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IG9ubHkgY29tbWl0cyBhIHNlc3Npb24gb2YgdGhlIHNhbWUgdHlwZSwgaWdub3JpbmcgYSBmb3JlaWduLXR5cGUgc2Vzc2lvbiB0aGF0IGFwcGVhcnMgbWlkLXNlbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbiB0ZXN0OiB0aGUgbG9jYWwgYWdlbnQgaG9zdCBydW5zIGEgc2luZ2xlIHByb3ZpZGVyIHdob3NlXG5cdFx0Ly8gc2Vzc2lvbiBjYWNoZSBob2xkcyBldmVyeSBhZ2VudC1ob3N0IHNlc3Npb24gdHlwZSAoY29kZXgsIGNsYXVkZSxcblx0XHQvLyBjb3BpbG90KS4gV2hlbiBhIHNsb3cgc2Vzc2lvbiAoZS5nLiBjb2RleCBjb2xkIHN0YXJ0KSBpcyBzZW50IHdoaWxlIGFcblx0XHQvLyBzZXNzaW9uIG9mIGEgRElGRkVSRU5UIHR5cGUgYXBwZWFycyBpbiB0aGUgY2FjaGUsIGBfd2FpdEZvck5ld1Nlc3Npb25gXG5cdFx0Ly8gbXVzdCBub3QgbGF0Y2ggb250byB0aGF0IGZvcmVpZ24gc2Vzc2lvbiBhbmQgcmV0dXJuIGl0IGFzIHRoZSBjb2RleFxuXHRcdC8vIGNvbW1pdCBcdTIwMTQgb3RoZXJ3aXNlIHRoZSBhY3RpdmUgc2Vzc2lvbiBpcyBzd2FwcGVkIHRvIHRoZSB3cm9uZyB0eXBlLlxuXHRcdGNvbnN0IGNvZGV4QW5kQ2xhdWRlID0gW1xuXHRcdFx0eyB0eXBlOiAnYWdlbnQtaG9zdC1jb2RleCcsIG5hbWU6ICdjb2RleCcsIGRpc3BsYXlOYW1lOiAnQ29kZXgnLCBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBpY29uOiB1bmRlZmluZWQgfSxcblx0XHRcdHsgdHlwZTogJ2FnZW50LWhvc3QtY2xhdWRlJywgbmFtZTogJ2NsYXVkZScsIGRpc3BsYXlOYW1lOiAnQ2xhdWRlJywgZGVzY3JpcHRpb246ICd0ZXN0JywgaWNvbjogdW5kZWZpbmVkIH0sXG5cdFx0XTtcblx0XHRhZ2VudEhvc3Quc2V0QWdlbnRzKFtcblx0XHRcdHsgcHJvdmlkZXI6ICdjb2RleCcsIGRpc3BsYXlOYW1lOiAnQ29kZXgnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XHR7IHByb3ZpZGVyOiAnY2xhdWRlJywgZGlzcGxheU5hbWU6ICdDbGF1ZGUnLCBkZXNjcmlwdGlvbjogJycsIG1vZGVsczogW10gfSBhcyBBZ2VudEluZm8sXG5cdFx0XSk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlndXJhdGlvblNlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oQWdlbnRIb3N0Q29kZXhBZ2VudEVuYWJsZWRTZXR0aW5nSWQsIHRydWUpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgY29kZXhBbmRDbGF1ZGUsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0Y29uZmlndXJhdGlvblNlcnZpY2UsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+IHtcblx0XHRcdFx0Ly8gV2hpbGUgdGhlIGNvZGV4IHNlbmQgaXMgaW4gZmxpZ2h0LCBhIGZvcmVpZ24tdHlwZSAoY2xhdWRlKVxuXHRcdFx0XHQvLyBzZXNzaW9uIHNob3dzIHVwIGluIHRoZSBob3N0J3MgbGlzdCAoZS5nLiByZXN0b3JlZCBmcm9tIGFuXG5cdFx0XHRcdC8vIGVhcmxpZXIgcnVuKSwgYW5kIHRoZSByZWFsIGNvZGV4IHNlc3Npb24gYWxzbyBjb21taXRzLlxuXHRcdFx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdmb3JlaWduLWNsYXVkZScsIHsgcHJvdmlkZXI6ICdjbGF1ZGUnLCBzdW1tYXJ5OiAnRm9yZWlnbiBDbGF1ZGUnIH0pKTtcblx0XHRcdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncmVhbC1jb2RleCcsIHsgcHJvdmlkZXI6ICdjb2RleCcsIHN1bW1hcnk6ICdSZWFsIENvZGV4JyB9KSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9wcm9qZWN0JyksICdjb2RleCcpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRjb25zdCBjb21taXR0ZWQgPSBhd2FpdCBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21taXR0ZWQucmVzb3VyY2Uuc2NoZW1lLCAnYWdlbnQtaG9zdC1jb2RleCcsIGBleHBlY3RlZCB0aGUgY29tbWl0dGVkIHNlc3Npb24gdG8gYmUgdGhlIGNvZGV4IHNlc3Npb24sIGdvdCAke2NvbW1pdHRlZC5yZXNvdXJjZS50b1N0cmluZygpfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCB3YWl0cyBiZXlvbmQgMzAgc2Vjb25kcyBmb3IgdGhlIGJhY2tlbmQgc2Vzc2lvbiB0byBjb21taXQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGF3YWl0IHRpbWVvdXQoMzBfMDAxKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCB7IHN1bW1hcnk6ICdDb21taXR0ZWQgTGF0ZScgfSkpO1xuXHRcdGFnZW50SG9zdC5maXJlQWN0aW9uKHtcblx0XHRcdGNoYW5uZWw6IGJ1aWxkRGVmYXVsdENoYXRVcmkoQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsIHNlc3Npb24uc2Vzc2lvbklkKS50b1N0cmluZygpKSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUgfSxcblx0XHRcdHNlcnZlclNlcTogMSxcblx0XHRcdG9yaWdpbjogdW5kZWZpbmVkLFxuXHRcdH0gYXMgQWN0aW9uRW52ZWxvcGUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBjb21taXR0ZWQgPSBhd2FpdCByZXF1ZXN0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21taXR0ZWQudGl0bGUuZ2V0KCksICdDb21taXR0ZWQgTGF0ZScpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgZG9lcyBub3QgYWR2ZXJ0aXNlIGEgY2FjaGVkIGNvbW1pdHRlZCBzZXNzaW9uIGFsb25nc2lkZSBpdHMgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHtcblx0XHRcdG9wZW5TZXNzaW9uOiB0cnVlLFxuXHRcdFx0c2VuZFJlcXVlc3Q6IGFzeW5jIChyZXNvdXJjZSk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+IHtcblx0XHRcdFx0Y29uc3QgcmF3SWQgPSBBZ2VudFNlc3Npb24uaWQocmVzb3VyY2UpO1xuXHRcdFx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKHJhd0lkLCB7IHN1bW1hcnk6ICdDb21taXR0ZWQgU2Vzc2lvbicgfSkpO1xuXHRcdFx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgcmF3SWQsIHsgdGl0bGU6ICdDb21taXR0ZWQgU2Vzc2lvbicgfSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZHJhZnRBZHZlcnRpc2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWRkZWQuaW5jbHVkZXMoc2Vzc2lvbikpIHtcblx0XHRcdFx0ZHJhZnRBZHZlcnRpc2VkLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGFnZW50SG9zdC5saXN0U2Vzc2lvbnNCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdGF3YWl0IGRyYWZ0QWR2ZXJ0aXNlZC5wO1xuXHRcdGNvbnN0IGFkdmVydGlzZWQgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbHRlcihjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUucmVzb3VyY2UsIHNlc3Npb24ucmVzb3VyY2UpKTtcblx0XHRhZ2VudEhvc3QubGlzdFNlc3Npb25zQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHJlcXVlc3Q7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvdW50OiBhZHZlcnRpc2VkLmxlbmd0aCxcblx0XHRcdGlzRHJhZnQ6IGFkdmVydGlzZWRbMF0gPT09IHNlc3Npb24sXG5cdFx0XHRyZXNvdXJjZXM6IGFkdmVydGlzZWQubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRpc0RyYWZ0OiB0cnVlLFxuXHRcdFx0cmVzb3VyY2VzOiBbc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbkFkZGVkIGRvZXMgbm90IGFkdmVydGlzZSBhIGNvbW1pdHRlZCBzZXNzaW9uIGFsb25nc2lkZSBpdHMgcGVuZGluZyBkcmFmdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH0pLFxuXHRcdH0pO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgZHJhZnRBZHZlcnRpc2VkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWRkZWQuaW5jbHVkZXMoc2Vzc2lvbikpIHtcblx0XHRcdFx0ZHJhZnRBZHZlcnRpc2VkLmNvbXBsZXRlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGFnZW50SG9zdC5saXN0U2Vzc2lvbnNCYXJyaWVyID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlcXVlc3QgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KTtcblxuXHRcdGF3YWl0IGRyYWZ0QWR2ZXJ0aXNlZC5wO1xuXHRcdGNvbnN0IHJhd0lkID0gQWdlbnRTZXNzaW9uLmlkKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24ocmF3SWQsIHsgc3VtbWFyeTogJ0NvbW1pdHRlZCBTZXNzaW9uJyB9KSk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIHJhd0lkLCB7IHRpdGxlOiAnQ29tbWl0dGVkIFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IGFkdmVydGlzZWQgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbHRlcihjYW5kaWRhdGUgPT4gaXNFcXVhbChjYW5kaWRhdGUucmVzb3VyY2UsIHNlc3Npb24ucmVzb3VyY2UpKTtcblx0XHRhZ2VudEhvc3QubGlzdFNlc3Npb25zQmFycmllci5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHJlcXVlc3Q7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvdW50OiBhZHZlcnRpc2VkLmxlbmd0aCxcblx0XHRcdGlzRHJhZnQ6IGFkdmVydGlzZWRbMF0gPT09IHNlc3Npb24sXG5cdFx0XHRyZXNvdXJjZXM6IGFkdmVydGlzZWQubWFwKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0fSwge1xuXHRcdFx0Y291bnQ6IDEsXG5cdFx0XHRpc0RyYWZ0OiB0cnVlLFxuXHRcdFx0cmVzb3VyY2VzOiBbc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZFJlcXVlc3QgcmVqZWN0cyB3aGVuIHRoZSBwcm92aXNpb25hbCBzZXNzaW9uIGlzIGFiYW5kb25lZCBiZWZvcmUgY29tbWl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7XG5cdFx0XHRvcGVuU2Vzc2lvbjogdHJ1ZSxcblx0XHRcdHNlbmRSZXF1ZXN0OiBhc3luYyAoKTogUHJvbWlzZTxDaGF0U2VuZFJlc3VsdD4gPT4gKHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBDaGF0U2VuZFJlc3VsdCBleHRlbmRzIHsga2luZDogJ3NlbnQnOyBkYXRhOiBpbmZlciBEIH0gPyBEIDogbmV2ZXIgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vaG9tZS91c2VyL3Byb2plY3QnKSwgcHJvdmlkZXIuc2Vzc2lvblR5cGVzWzBdLmlkKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgcmVqZWN0aW9uID0gYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHRwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hlbGxvJyB9KSxcblx0XHRcdC9zZXNzaW9uIHdhcyBub3QgY29tbWl0dGVkLyxcblx0XHQpO1xuXG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRwcm92aWRlci5kZWxldGVOZXdTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHRhd2FpdCByZWplY3Rpb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gKHtcblx0XHRcdGFkZGVkOiBjaGFuZ2UuYWRkZWQubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdHJlbW92ZWQ6IGNoYW5nZS5yZW1vdmVkLm1hcChzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0fSkpLCBbXG5cdFx0XHR7IGFkZGVkOiBbc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpXSwgcmVtb3ZlZDogW10gfSxcblx0XHRcdHsgYWRkZWQ6IFtdLCByZW1vdmVkOiBbc2Vzc2lvbi5yZXNvdXJjZS50b1N0cmluZygpXSB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0d28gY29uY3VycmVudCBzYW1lLXR5cGUgbmV3LXNlc3Npb24gc2VuZHMgZWFjaCBjb21taXQgdG8gdGhlaXIgb3duIHNlc3Npb24gKG5vIHN3YXAgZHVyaW5nIGEgc2hhcmVkIGRvd25sb2FkIHdpbmRvdyknLCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogd2hlbiB0aGUgZmlyc3Qgc2VuZCBvZiBhIHNlc3Npb24gdHlwZSB0cmlnZ2VycyBhIGxlbmd0aHlcblx0XHQvLyBicmluZy11cCAoZS5nLiB0aGUgQ2xhdWRlIFNESyBkb3dubG9hZCkgYW5kIGEgU0VDT05EIHNlc3Npb24gb2YgdGhlXG5cdFx0Ly8gc2FtZSB0eXBlIGlzIHN0YXJ0ZWQgYW5kIHNlbnQgYmVmb3JlIGl0IGZpbmlzaGVzLCBib3RoIHNlbmRzIHBhcmsgaW5cblx0XHQvLyBgX3dhaXRGb3JOZXdTZXNzaW9uYC4gQSBjb21taXR0ZWQgYmFja2VuZCBzZXNzaW9uIGtlZXBzIHRoZSBlYWdlciBpZFxuXHRcdC8vIGl0cyBzZW5kIGNyZWF0ZWQgaXQgd2l0aCwgc28gZWFjaCBzZW5kIG11c3QgZ3JhZHVhdGUgb250byBpdHMgT1dOIGlkLlxuXHRcdC8vIE1hdGNoaW5nIHB1cmVseSBieSBub3ZlbHR5ICsgc2NoZW1lIHdvdWxkIGxldCB0aGUgdHdvIHdhaXRlcnMgU1dBUFxuXHRcdC8vIHNlc3Npb25zIFx1MjAxNCB3aGljaGV2ZXIgbWF0ZXJpYWxpemVzIGZpcnN0IGlzIGdyYWJiZWQgYnkgdGhlIHNlbmQgdGhhdFxuXHRcdC8vIHBhcmtlZCBmaXJzdCwgcmVnYXJkbGVzcyBvZiBvd25lcnNoaXAgXHUyMDE0IGxlYXZpbmcgdGhlIHVzZXIgb24gdGhlIHdyb25nXG5cdFx0Ly8gc2Vzc2lvbi4gSGVyZSB0aGUgU0VDT05EIHNlc3Npb24gKEIpIG1hdGVyaWFsaXplcyBCRUZPUkUgdGhlIGZpcnN0XG5cdFx0Ly8gKEEpLCB3aGljaCBpcyBleGFjdGx5IHRoZSBvcmRlcmluZyB0aGF0IHRyaWdnZXJlZCB0aGUgc3dhcC5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKCk6IFByb21pc2U8Q2hhdFNlbmRSZXN1bHQ+ID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH0pLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb25UeXBlSWQgPSBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQ7XG5cblx0XHRjb25zdCBzZXNzaW9uQSA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCdmaWxlOi8vL2hvbWUvdXNlci9hJyksIHNlc3Npb25UeXBlSWQpO1xuXHRcdGNvbnN0IGNoYXRBID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uQS5zZXNzaW9uSWQpO1xuXHRcdGNvbnN0IG93bkEgPSBBZ2VudFNlc3Npb24uaWQoY2hhdEEucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkIgPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvYicpLCBzZXNzaW9uVHlwZUlkKTtcblx0XHRjb25zdCBjaGF0QiA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbkIuc2Vzc2lvbklkKTtcblx0XHRjb25zdCBvd25CID0gQWdlbnRTZXNzaW9uLmlkKGNoYXRCLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXG5cdFx0Ly8gU3RhcnQgYm90aCBzZW5kczsgZWFjaCBwYXJrcyBpbiBgX3dhaXRGb3JOZXdTZXNzaW9uYCAobGlzdFNlc3Npb25zIGlzXG5cdFx0Ly8gZW1wdHkgYmVjYXVzZSBuZWl0aGVyIHNlc3Npb24gaGFzIG1hdGVyaWFsaXplZCB5ZXQpLlxuXHRcdGNvbnN0IHNlbmRBID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbkEuc2Vzc2lvbklkLCBjaGF0QS5yZXNvdXJjZSwgeyBxdWVyeTogJ0EnIH0pO1xuXHRcdGNvbnN0IHNlbmRCID0gcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbkIuc2Vzc2lvbklkLCBjaGF0Qi5yZXNvdXJjZSwgeyBxdWVyeTogJ0InIH0pO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMCkpO1xuXG5cdFx0Ly8gVGhlIGNvbW1pdHRlZCBzZXNzaW9uIGtlZXBzIGVhY2ggc2VuZCdzIG93biAoZWFnZXIpIGlkLiBNYXRlcmlhbGl6ZSBCXG5cdFx0Ly8gRklSU1QsIHRoZW4gQSBcdTIwMTQgdGhlIG9yZGVyaW5nIHRoYXQgbWFkZSBBIGdyYWIgQidzIHNlc3Npb24uXG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsIG93bkIsIHsgdGl0bGU6ICdCJyB9KTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTApKTtcblx0XHRmaXJlU2Vzc2lvbkFkZGVkKGFnZW50SG9zdCwgb3duQSwgeyB0aXRsZTogJ0EnIH0pO1xuXG5cdFx0Y29uc3QgW2NvbW1pdHRlZEEsIGNvbW1pdHRlZEJdID0gYXdhaXQgUHJvbWlzZS5hbGwoW3NlbmRBLCBzZW5kQl0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgYTogQWdlbnRTZXNzaW9uLmlkKGNvbW1pdHRlZEEucmVzb3VyY2UudG9TdHJpbmcoKSksIGI6IEFnZW50U2Vzc2lvbi5pZChjb21taXR0ZWRCLnJlc291cmNlLnRvU3RyaW5nKCkpIH0sXG5cdFx0XHR7IGE6IG93bkEsIGI6IG93bkIgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBmb3J3YXJkcyByZXNvbHZlZCBzZXNzaW9uIGNvbmZpZyB0byBjaGF0IHNlcnZpY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VuZE9wdGlvbnM6IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0b3BlblNlc3Npb246IHRydWUsXG5cdFx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKF9yZXNvdXJjZSwgX21lc3NhZ2UsIG9wdGlvbnMpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiB7XG5cdFx0XHRcdGlmIChvcHRpb25zKSB7XG5cdFx0XHRcdFx0c2VuZE9wdGlvbnMucHVzaChvcHRpb25zKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjcmVhdGVkLWZyb20tc2VuZCcsIHsgc3VtbWFyeTogJ0NyZWF0ZWQgRnJvbSBTZW5kJyB9KSk7XG5cdFx0XHRcdHJldHVybiB7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgQ2hhdFNlbmRSZXN1bHQgZXh0ZW5kcyB7IGtpbmQ6ICdzZW50JzsgZGF0YTogaW5mZXIgRCB9ID8gRCA6IG5ldmVyIH07XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgnZmlsZTovLy9ob21lL3VzZXIvcHJvamVjdCcpLCBwcm92aWRlci5zZXNzaW9uVHlwZXNbMF0uaWQpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uLnNlc3Npb25JZCwgY29uZmlnID0+IGNvbmZpZz8udmFsdWVzLmlzb2xhdGlvbiA9PT0gJ3dvcmt0cmVlJyk7XG5cblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgY29tbWl0dGVkID0gYXdhaXQgcHJvdmlkZXIuc2VuZFJlcXVlc3Qoc2Vzc2lvbi5zZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycsIHRpdGxlOiAnUHVsbCBSZXF1ZXN0JywgaGlkZUZyb21UcmFuc2NyaXB0OiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZW5kT3B0aW9uczogc2VuZE9wdGlvbnMubWFwKG9wdGlvbnMgPT4gKHtcblx0XHRcdFx0YWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogb3B0aW9ucy5hZ2VudEhvc3RTZXNzaW9uQ29uZmlnLFxuXHRcdFx0XHRoaWRlRnJvbVRyYW5zY3JpcHQ6IG9wdGlvbnMuaGlkZUZyb21UcmFuc2NyaXB0LFxuXHRcdFx0fSkpLFxuXHRcdFx0dGl0bGU6IGNvbW1pdHRlZC50aXRsZS5nZXQoKSxcblx0XHR9LCB7XG5cdFx0XHRzZW5kT3B0aW9uczogW3sgYWdlbnRIb3N0U2Vzc2lvbkNvbmZpZzogeyBpc29sYXRpb246ICd3b3JrdHJlZScgfSwgaGlkZUZyb21UcmFuc2NyaXB0OiB0cnVlIH1dLFxuXHRcdFx0dGl0bGU6ICdQdWxsIFJlcXVlc3QnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCBjbGVhcnMgY2hhdCBpbnB1dCBkcmFmdCB3aGlsZSBwcmVzZXJ2aW5nIHNlbGVjdGVkIG1vZGVsIGFuZCBhZ2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpbnB1dFN0YXRlczogUGFydGlhbDxJQ2hhdE1vZGVsSW5wdXRTdGF0ZT5bXSA9IFtdO1xuXHRcdGNvbnN0IGxhbmd1YWdlTW9kZWwgPSBjcmVhdGVUZXN0TGFuZ3VhZ2VNb2RlbCgnc2VsZWN0ZWQtbW9kZWwnKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwge1xuXHRcdFx0bG9va3VwTGFuZ3VhZ2VNb2RlbDogbW9kZWxJZCA9PiBtb2RlbElkID09PSAnYWdlbnQtaG9zdC1jb3BpbG90Y2xpOnNlbGVjdGVkLW1vZGVsJyA/IGxhbmd1YWdlTW9kZWwgOiB1bmRlZmluZWQsXG5cdFx0XHRhY3F1aXJlT3JMb2FkU2Vzc2lvbjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnB1dE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJSW5wdXRNb2RlbD4oKSB7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdGUgPSBjb25zdE9ic2VydmFibGU8SUNoYXRNb2RlbElucHV0U3RhdGUgfCB1bmRlZmluZWQ+KHVuZGVmaW5lZCk7XG5cdFx0XHRcdFx0b3ZlcnJpZGUgc2V0U3RhdGUoc3RhdGU6IFBhcnRpYWw8SUNoYXRNb2RlbElucHV0U3RhdGU+KTogdm9pZCB7XG5cdFx0XHRcdFx0XHRpbnB1dFN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0b3ZlcnJpZGUgY2xlYXJTdGF0ZSgpOiB2b2lkIHsgfVxuXHRcdFx0XHRcdG92ZXJyaWRlIHRvSlNPTigpOiB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG5cdFx0XHRcdH0oKTtcblx0XHRcdFx0Y29uc3QgY2hhdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdE1vZGVsPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpbnB1dE1vZGVsID0gaW5wdXRNb2RlbDtcblx0XHRcdFx0fSgpO1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdG9iamVjdDogY2hhdE1vZGVsLFxuXHRcdFx0XHRcdGRpc3Bvc2UoKSB7IH0sXG5cdFx0XHRcdH0gc2F0aXNmaWVzIElDaGF0TW9kZWxSZWZlcmVuY2U7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCAnc2VuZC1kcmFmdCcsIHsgdGl0bGU6ICdTZW5kIERyYWZ0IFNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2VuZCBEcmFmdCBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24hLnNlc3Npb25JZCwgJ2FnZW50LWhvc3QtY29waWxvdGNsaTpzZWxlY3RlZC1tb2RlbCcpO1xuXHRcdHByb3ZpZGVyLnNldEFnZW50Py4oc2Vzc2lvbiEuc2Vzc2lvbklkLCB7IHVyaTogJ2FnZW50Oi8vcmV2aWV3JywgbmFtZTogJ3JldmlldycgfSk7XG5cdFx0YWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdFx0aW5wdXRTdGF0ZXMubGVuZ3RoID0gMDtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb24hLnNlc3Npb25JZCwgc2Vzc2lvbiEucmVzb3VyY2UsIHsgcXVlcnk6ICdoZWxsbycgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3RvY29sRHJhZnRBY3Rpb25zOiBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmlsdGVyKGQgPT4gZC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkKS5sZW5ndGgsXG5cdFx0XHRoYXNTZWxlY3RlZE1vZGVsVXBkYXRlOiBpbnB1dFN0YXRlcy5zb21lKHN0YXRlID0+IHN0YXRlLnNlbGVjdGVkTW9kZWw/LmlkZW50aWZpZXIgPT09ICdhZ2VudC1ob3N0LWNvcGlsb3RjbGk6c2VsZWN0ZWQtbW9kZWwnKSxcblx0XHRcdGxhc3RJbnB1dFN0YXRlOiBpbnB1dFN0YXRlcy5hdCgtMSksXG5cdFx0fSwge1xuXHRcdFx0cHJvdG9jb2xEcmFmdEFjdGlvbnM6IDAsXG5cdFx0XHRoYXNTZWxlY3RlZE1vZGVsVXBkYXRlOiB0cnVlLFxuXHRcdFx0bGFzdElucHV0U3RhdGU6IHtcblx0XHRcdFx0bW9kZTogeyBpZDogJ2FnZW50Oi8vcmV2aWV3Jywga2luZDogQ2hhdE1vZGVLaW5kLkFnZW50IH0sXG5cdFx0XHRcdGlucHV0VGV4dDogJycsXG5cdFx0XHRcdGF0dGFjaG1lbnRzOiBbXSxcblx0XHRcdFx0c2VsZWN0aW9uczogW10sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJ1bm5pbmcgc2Vzc2lvbiBjb25maWcgc2VlZGluZyAoZnJvbSBTZXNzaW9uU3RhdGUuY29uZmlnKSAtLS0tLS0tXG5cblx0dGVzdCgnZ2V0U2Vzc2lvbkNvbmZpZyBzZWVkcyBydW5uaW5nIGNvbmZpZyBmcm9tIHNlc3Npb24gc3RhdGUgc3Vic2NyaXB0aW9uIHdpdGggZnVsbCBzY2hlbWEnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdzZWVkLTEnLCB7IHN1bW1hcnk6ICdTZWVkZWQgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2VlZGVkIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBJbml0aWFsbHkgdGhlIGNhY2hlIGhhcyBub3RoaW5nIGZvciB0aGlzIHNlc3Npb24gXHUyMDE0IHRoZSBwaWNrZXIgcmVhZHNcblx0XHQvLyBgdW5kZWZpbmVkYCB3aGlsZSB0aGUgc3Vic2NyaXB0aW9uIGtpY2tzIG9mZiAoYW5kIHN0YXJ0cyBzdWJzY3JpYmluZykuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vdyBoYXZlIHRoZSBmYWtlIGhvc3QgaHlkcmF0ZSB0aGUgc2Vzc2lvbi1zdGF0ZSBzbmFwc2hvdCB3aXRoIGFcblx0XHQvLyBjb25maWcgY29udGFpbmluZyBvbmUgbXV0YWJsZSBhbmQgb25lIHJlYWQtb25seSBwcm9wZXJ0eS5cblx0XHRjb25zdCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdGlzb2xhdGlvbjogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdJc29sYXRpb24nLCBlbnVtOiBbJ2ZvbGRlcicsICd3b3JrdHJlZSddLCByZWFkT25seTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdTZWVkZWQgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3NlZWQtMScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblxuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0Ly8gVGhlIGZ1bGwgc2NoZW1hICsgdmFsdWVzIGFyZSByZXRhaW5lZCAobm9uLW11dGFibGUgdmFsdWVzIGFyZVxuXHRcdC8vIHJlcXVpcmVkIGJ5IHRoZSBKU09OQyBzZXR0aW5ncyBlZGl0b3IgdG8gcm91bmQtdHJpcCB2aWEgcmVwbGFjZVxuXHRcdC8vIHNlbWFudGljcyB3aXRob3V0IGRyb3BwaW5nIHNlcnZlci1zaWRlIGNvbmZpZykuXG5cdFx0Y29uc3Qgc2VlZGVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cHJvcGVydGllczogT2JqZWN0LmtleXMoc2VlZGVkPy5zY2hlbWEucHJvcGVydGllcyA/PyB7fSkuc29ydCgpLFxuXHRcdFx0dmFsdWVzOiBzZWVkZWQ/LnZhbHVlcyxcblx0XHR9LCB7XG5cdFx0XHRwcm9wZXJ0aWVzOiBbJ2F1dG9BcHByb3ZlJywgJ2lzb2xhdGlvbiddLFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncnVubmluZyBjb25maWcgc3RhdGUgc2VlZGluZyBwcmVzZXJ2ZXMgYWxyZWFkeS1yZXNvbHZlZCBzY2hlbWEgcHJvcGVydGllcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NlZWQtc2NoZW1hJywgeyBzdW1tYXJ5OiAnU2NoZW1hIFByZXNlcnZlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1NjaGVtYSBQcmVzZXJ2ZSBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZnVsbFN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1NjaGVtYSBQcmVzZXJ2ZSBTZXNzaW9uJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGxpZmVjeWNsZTogU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSxcblx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0Y2hhdHM6IFtdLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRcdCdjb2RleC5zYW5kYm94TW9kZSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2FuZGJveCcsIGVudW06IFsncmVhZC1vbmx5JywgJ3dvcmtzcGFjZS13cml0ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdFx0J2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogeyB0eXBlOiAnYm9vbGVhbicsIHRpdGxlOiAnTmV0d29yaycsIGRlZmF1bHQ6IGZhbHNlLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAnd29ya3NwYWNlLXdyaXRlJywgJ2NvZGV4Lm5ldHdvcmtBY2Nlc3NFbmFibGVkJzogZmFsc2UgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdzZWVkLXNjaGVtYScsICdjb3BpbG90Y2xpJywgZnVsbFN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnNjaGVtYS5wcm9wZXJ0aWVzWydjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCddICE9PSB1bmRlZmluZWQpO1xuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnc2VlZC1zY2hlbWEnLCAnY29waWxvdGNsaScsIHtcblx0XHRcdC4uLmZ1bGxTdGF0ZSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHQnY29kZXguc2FuZGJveE1vZGUnOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ1NhbmRib3gnLCBlbnVtOiBbJ3JlYWQtb25seScsICd3b3Jrc3BhY2Utd3JpdGUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR2YWx1ZXM6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3dvcmtzcGFjZS13cml0ZScgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3BlcnRpZXM6IE9iamVjdC5rZXlzKHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8uc2NoZW1hLnByb3BlcnRpZXMgPz8ge30pLnNvcnQoKSxcblx0XHRcdHZhbHVlczogcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpPy52YWx1ZXMsXG5cdFx0fSwge1xuXHRcdFx0cHJvcGVydGllczogWydjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCcsICdjb2RleC5zYW5kYm94TW9kZSddLFxuXHRcdFx0dmFsdWVzOiB7ICdjb2RleC5zYW5kYm94TW9kZSc6ICd3b3Jrc3BhY2Utd3JpdGUnLCAnY29kZXgubmV0d29ya0FjY2Vzc0VuYWJsZWQnOiBmYWxzZSB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVtb3ZpbmcgYSBzZXNzaW9uIGRpc3Bvc2VzIGl0cyBzZXNzaW9uLXN0YXRlIHN1YnNjcmlwdGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3NlZWQtMicsIHsgc3VtbWFyeTogJ1N1YiBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdTdWIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIFRyaWdnZXIgbGF6eSBzdWJzY3JpcHRpb25cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaVN0ciA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAnc2VlZC0yJykudG9TdHJpbmcoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0cikgPz8gMCwgMCk7XG5cblx0XHRmaXJlU2Vzc2lvblJlbW92ZWQoYWdlbnRIb3N0LCAnc2VlZC0yJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0ciksIDEpO1xuXHR9KSk7XG5cblx0dGVzdCgnc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYXV0by1yZWxlYXNlcyBhZnRlciB0aGUgaWRsZSB3aW5kb3cnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdpZGxlLTEnLCB7IHN1bW1hcnk6ICdJZGxlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ0lkbGUgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmlTdHIgPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2lkbGUtMScpLnRvU3RyaW5nKCk7XG5cblx0XHQvLyBJbml0aWFsIGFjY2VzcyBzdWJzY3JpYmVzLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoc2Vzc2lvblVyaVN0cikgPz8gMCwgMCk7XG5cblx0XHQvLyBSZXBlYXRlZCBhY2Nlc3Mgd2l0aGluIHRoZSBpZGxlIHdpbmRvdyBkb2VzIG5vdCByZS1zdWJzY3JpYmUuXG5cdFx0YXdhaXQgdGltZW91dCgyMF8wMDApO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxLCAnc3RpbGwgb25lIHdpcmUgc3Vic2NyaWJlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpID8/IDAsIDAsICdubyB1bnN1YnNjcmliZSB5ZXQgKHRpbWVyIHJlc2V0KScpO1xuXG5cdFx0Ly8gSWRsZSBwYXN0IHRoZSAzMCBzIHdpbmRvdyBcdTIwMTQgd2lyZSB1bnN1YnNjcmliZSBmaXJlcy5cblx0XHRhd2FpdCB0aW1lb3V0KDMxXzAwMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KHNlc3Npb25VcmlTdHIpLCAxLCAnd2lyZSB1bnN1YnNjcmliZSBhZnRlciBpZGxlIHdpbmRvdycpO1xuXG5cdFx0Ly8gUmUtYWNjZXNzIGFmdGVyIHJlbGVhc2UgcmUtc3Vic2NyaWJlcy5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChzZXNzaW9uVXJpU3RyKSwgMiwgJ2ZyZXNoIHN1YnNjcmliZSBhZnRlciByZWxlYXNlJyk7XG5cdH0pKTtcblxuXHQvLyAtLS0tIGdpdEh1YkluZm8gLyBQUiBpY29uIC0tLS0tLS1cblxuXHR0ZXN0KCdlcXVpdmFsZW50IHNlc3Npb24gZGVzY3JpcHRpb25zIGRvIG5vdCBub3RpZnkgb2JzZXJ2ZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0ZmlyZVNlc3Npb25BZGRlZChhZ2VudEhvc3QsICdkZXNjcmlwdGlvbi1zdGFibGUnLCB7IHRpdGxlOiAnU2Vzc2lvbicgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IEFnZW50U2Vzc2lvbi5pZChzLnJlc291cmNlLnRvU3RyaW5nKCkpID09PSAnZGVzY3JpcHRpb24tc3RhYmxlJykgYXMgQWdlbnRIb3N0U2Vzc2lvbkFkYXB0ZXI7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXHRcdHNlc3Npb24uc3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsIHVuZGVmaW5lZCk7XG5cdFx0c2Vzc2lvbi5zZXRBY3Rpdml0eSgnV29ya2luZycpO1xuXHRcdGxldCB1cGRhdGVDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHNlc3Npb24uZGVzY3JpcHRpb24ucmVhZChyZWFkZXIpO1xuXHRcdFx0dXBkYXRlQ291bnQrKztcblx0XHR9KSk7XG5cblx0XHRzZXNzaW9uLnN0YXR1cy5zZXQoU2Vzc2lvblN0YXR1cy5OZWVkc0lucHV0LCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVwZGF0ZUNvdW50LCAxKTtcblx0fSk7XG5cblx0dGVzdCgnZXF1aXZhbGVudCBHaXRIdWIgaW5mbyBkb2VzIG5vdCBub3RpZnkgb2JzZXJ2ZXJzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFrZVB1bGxSZXF1ZXN0ID0gKCk6IElHaXRIdWJQdWxsUmVxdWVzdCA9PiAoe1xuXHRcdFx0bnVtYmVyOiA0Mixcblx0XHRcdHRpdGxlOiAnUFInLFxuXHRcdFx0Ym9keTogJycsXG5cdFx0XHRzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5DbG9zZWQsXG5cdFx0XHRhdXRob3I6IHsgbG9naW46ICdhdXRob3InLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0XHRoZWFkUmVmOiAnZmVhdHVyZScsXG5cdFx0XHRoZWFkU2hhOiAnaGVhZCcsXG5cdFx0XHRiYXNlUmVmOiAnbWFpbicsXG5cdFx0XHRpc0RyYWZ0OiBmYWxzZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdHVwZGF0ZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1lcmdlZEF0OiB1bmRlZmluZWQsXG5cdFx0XHRtZXJnZWFibGU6IGZhbHNlLFxuXHRcdFx0bWVyZ2VhYmxlU3RhdGU6ICdibG9ja2VkJyxcblx0XHR9KTtcblx0XHRjb25zdCBwdWxsUmVxdWVzdCA9IG9ic2VydmFibGVWYWx1ZTxJR2l0SHViUHVsbFJlcXVlc3QgfCB1bmRlZmluZWQ+KCdwdWxsUmVxdWVzdCcsIG1ha2VQdWxsUmVxdWVzdCgpKTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cdFx0XHRwcml2YXRlIHJlYWRvbmx5IF9tb2RlbCA9IHsgcHVsbFJlcXVlc3QgfSBhcyB1bmtub3duIGFzIEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWw7XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlID0gKCkgPT4gbmV3IEltbW9ydGFsUmVmZXJlbmNlKHRoaXMuX21vZGVsKTtcblx0XHR9KCk7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbignZ2l0aHViLXN0YWJsZScsIHsgc3VtbWFyeTogJ1BSIFNlc3Npb24nLCBwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKSwgZGlzcGxheU5hbWU6ICdyZXBvJyB9IH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBnaXRIdWJTZXJ2aWNlIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1BSIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnZ2l0aHViLXN0YWJsZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJyxcblx0XHRcdHRpdGxlOiAnUFIgU2Vzc2lvbicsXG5cdFx0XHRzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRfbWV0YTogeyBnaXRodWI6IHsgb3duZXI6ICdvd25lcicsIHJlcG86ICdyZXBvJywgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyB9IH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgZ2l0SHViSW5mbyA9IHNlc3Npb24ud29ya3NwYWNlLmdldCgpIS5mb2xkZXJzWzBdIS5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvO1xuXHRcdGxldCB1cGRhdGVDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGdpdEh1YkluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0dXBkYXRlQ291bnQrKztcblx0XHR9KSk7XG5cblx0XHRwdWxsUmVxdWVzdC5zZXQobWFrZVB1bGxSZXF1ZXN0KCksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXBkYXRlQ291bnQsIDEpO1xuXHR9KSk7XG5cblx0dGVzdC5za2lwKCdrZWVwcyBhIHJlc29sdmVkIFBSIG51bWJlciBzdGlja3kgYWNyb3NzIGdpdEh1YkluZm8gcmVjb21wdXRlcyAobm8gcmUtbG9va3VwIC8gaWNvbiBmbGFwKScsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEEgR2l0SHViIHNlcnZpY2UgdGhhdCByZXNvbHZlcyBhIFBSIG51bWJlciBhc3luY2hyb25vdXNseSAobWlycm9yaW5nIHRoZVxuXHRcdC8vIHJlYWwgYGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaGAgUkVTVCBsb29rdXApIGFuZCBoYW5kcyBvdXQgYVxuXHRcdC8vIGxpdmUgUFIgbW9kZWwuIFdlIGNvdW50IGxvb2t1cHMgc28gd2UgY2FuIGFzc2VydCB0aGUgbnVtYmVyIGlzIHJlc29sdmVkXG5cdFx0Ly8gZXhhY3RseSBvbmNlIGFuZCB0aGVuIHJldXNlZCwgcmF0aGVyIHRoYW4gcmUtcXVlcmllZCAoYW5kIHJlc2V0IHRvXG5cdFx0Ly8gYHVuZGVmaW5lZGApIGV2ZXJ5IHRpbWUgYGdpdEh1YkluZm9gIHJlY29tcHV0ZXMuXG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0bG9va3VwQ2FsbHMgPSAwO1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWwgPSB7IHB1bGxSZXF1ZXN0OiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9IGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RNb2RlbDtcblx0XHRcdG92ZXJyaWRlIGZpbmRQdWxsUmVxdWVzdE51bWJlckJ5SGVhZEJyYW5jaCA9IGFzeW5jICgpID0+IHtcblx0XHRcdFx0dGhpcy5sb29rdXBDYWxscysrO1xuXHRcdFx0XHRyZXR1cm4gNDI7XG5cdFx0XHR9O1xuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZSA9ICgpID0+IG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLl9tb2RlbCk7XG5cdFx0fSgpO1xuXG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncHItc3RpY2t5JywgeyBzdW1tYXJ5OiAnUFIgU2Vzc2lvbicsIHByb2plY3Q6IHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwbycpLCBkaXNwbGF5TmFtZTogJ3JlcG8nIH0gfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGdpdEh1YlNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUFIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdC8vIEZvcmNlIGEgc2Vzc2lvbi1zdGF0ZSBzdWJzY3JpcHRpb24gYW5kIHB1c2ggZ2l0IGNvb3JkcyBzbyB0aGUgc2Vzc2lvblxuXHRcdC8vIHJlc29sdmVzIG93bmVyL3JlcG8vYnJhbmNoIGFuZCBsb29rcyB1cCBpdHMgUFIgbnVtYmVyLlxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdwci1zdGlja3knLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnUFIgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdF9tZXRhOiB7IGdpdDogeyBoYXNHaXRIdWJSZW1vdGU6IHRydWUsIGdpdGh1Yk93bmVyOiAnb3duZXInLCBnaXRodWJSZXBvOiAncmVwbycsIGJyYW5jaE5hbWU6ICdmZWF0dXJlJyB9IH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBnaXRIdWJJbmZvT2JzID0gc2Vzc2lvbiEud29ya3NwYWNlLmdldCgpIS5mb2xkZXJzWzBdIS5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvO1xuXG5cdFx0Ly8gT2JzZXJ2ZSB1bnRpbCB0aGUgYXN5bmMgUFItbnVtYmVyIGxvb2t1cCByZXNvbHZlcy5cblx0XHRjb25zdCBzdWIxID0gYXV0b3J1bihyZWFkZXIgPT4geyBnaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKTsgfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3Q/Lm51bWJlciwgNDIsICdQUiBudW1iZXIgcmVzb2x2ZXMgd2hpbGUgb2JzZXJ2ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5sb29rdXBDYWxscywgMSwgJ29uZSBQUi1udW1iZXIgbG9va3VwIGFmdGVyIGZpcnN0IHJlc29sdXRpb24nKTtcblx0XHRzdWIxLmRpc3Bvc2UoKTtcblxuXHRcdC8vIFVub2JzZXJ2ZSB0aGVuIHJlLW9ic2VydmUgXHUyMDE0IHRoaXMgbWlycm9ycyBhIHNlc3Npb24gc3dpdGNoIC8gc2Vzc2lvbnMtbGlzdFxuXHRcdC8vIHJlLXJlbmRlciwgd2hpY2ggcHJldmlvdXNseSByZWNyZWF0ZWQgYSBmcmVzaCAodW5yZXNvbHZlZCkgcHJvbWlzZVxuXHRcdC8vIG9ic2VydmFibGUgYW5kIGZsYXBwZWQgdGhlIFBSIG51bWJlciBiYWNrIHRvIGB1bmRlZmluZWRgLCBkaXNwb3NpbmcgdGhlXG5cdFx0Ly8gc2hhcmVkIGxpdmUgbW9kZWwgYW5kIGJsYW5raW5nIHRoZSBpY29uLiBUaGUgbnVtYmVyIG11c3Qgc3RheSByZXNvbHZlZFxuXHRcdC8vIG9uIHRoZSB2ZXJ5IGZpcnN0IHN5bmNocm9ub3VzIHJlLXJlYWQsIGFuZCBubyBuZXcgbG9va3VwIG1heSBiZSBpc3N1ZWQuXG5cdFx0bGV0IGZpcnN0UmVPYnNlcnZlZE51bWJlcjogbnVtYmVyIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBjYXB0dXJlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHN1YjIgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBudW1iZXIgPSBnaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKT8ucHVsbFJlcXVlc3Q/Lm51bWJlcjtcblx0XHRcdGlmICghY2FwdHVyZWQpIHtcblx0XHRcdFx0Zmlyc3RSZU9ic2VydmVkTnVtYmVyID0gbnVtYmVyO1xuXHRcdFx0XHRjYXB0dXJlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0UmVPYnNlcnZlZE51bWJlciwgNDIsICdQUiBudW1iZXIgc3RheXMgc3RpY2t5IGFjcm9zcyB1bm9ic2VydmUvcmVvYnNlcnZlJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2UubG9va3VwQ2FsbHMsIDEsICdubyBleHRyYSBQUi1udW1iZXIgbG9va3VwIG9uIHJlY29tcHV0ZScpO1xuXHRcdHN1YjIuZGlzcG9zZSgpO1xuXHR9KSk7XG5cblx0dGVzdCgnc3VyZmFjZXMgYSBkZWZhdWx0IG9wZW4tUFIgaWNvbiBpbW1lZGlhdGVseSB3aGVuIGEgUFIgaXMgZGV0ZWN0ZWQgYmVmb3JlIHRoZSBsaXZlIG1vZGVsIGxvYWRzJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gQSBHaXRIdWIgc2VydmljZSB3aG9zZSBsaXZlIFBSIG1vZGVsIGlzIG5ldmVyIHBvcHVsYXRlZCAoYHB1bGxSZXF1ZXN0YCBzdGF5c1xuXHRcdC8vIHVuZGVmaW5lZCksIG1pcnJvcmluZyB0aGUgd2luZG93IHJpZ2h0IGFmdGVyIGEgUFIgaXMgZmlyc3QgZGV0ZWN0ZWQgYnV0IGJlZm9yZVxuXHRcdC8vIHRoZSBmaXJzdCBsaXZlIGZldGNoIGNvbXBsZXRlcy4gV2l0aG91dCBhIGZhbGxiYWNrIHRoZSBzZXNzaW9uIGxpc3Qgcm93IHdvdWxkXG5cdFx0Ly8ga2VlcCB0aGUgcmVhZC91bnJlYWQgZG90IGluc3RlYWQgb2YgYSBQUiBpY29uIHVudGlsIHRoYXQgZmV0Y2ggbGFuZHMuXG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWwgPSB7IHB1bGxSZXF1ZXN0OiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9IGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RNb2RlbDtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2UgPSAoKSA9PiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UodGhpcy5fbW9kZWwpO1xuXHRcdH0oKTtcblxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3ByLWRlZmF1bHQtaWNvbicsIHsgc3VtbWFyeTogJ1BSIFNlc3Npb24nLCBwcm9qZWN0OiB7IHVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKSwgZGlzcGxheU5hbWU6ICdyZXBvJyB9IH0pKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBnaXRIdWJTZXJ2aWNlIH0pO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5maW5kKHMgPT4gcy50aXRsZS5nZXQoKSA9PT0gJ1BSIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHQvLyBGb3JjZSBhIHNlc3Npb24tc3RhdGUgc3Vic2NyaXB0aW9uIGFuZCBwdXNoIEdpdEh1YiBzdGF0ZSBjYXJyeWluZyBhIFBSIFVSTCBzb1xuXHRcdC8vIHRoZSBzZXNzaW9uIGRldGVjdHMgdGhlIHB1bGwgcmVxdWVzdCB3aGlsZSBpdHMgbGl2ZSBtb2RlbCBpcyBzdGlsbCBlbXB0eS5cblx0XHRwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgncHItZGVmYXVsdC1pY29uJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1BSIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRfbWV0YToge1xuXHRcdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0XHRyZXBvOiAncmVwbycsXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbXG5cdFx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MScsXG5cdFx0XHRcdFx0XVxuXHRcdFx0XHR9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgZ2l0SHViSW5mb09icyA9IHNlc3Npb24hLndvcmtzcGFjZS5nZXQoKSEuZm9sZGVyc1swXSEuZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbztcblx0XHRjb25zdCBzdWIgPSBhdXRvcnVuKHJlYWRlciA9PiB7IGdpdEh1YkluZm9PYnMucmVhZChyZWFkZXIpOyB9KTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0Y29uc3QgZ2l0SHViSW5mbyA9IGdpdEh1YkluZm9PYnMuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRhY3RpdmVQdWxsUmVxdWVzdDogZ2l0SHViSW5mbz8ucHVsbFJlcXVlc3QgJiYge1xuXHRcdFx0XHRudW1iZXI6IGdpdEh1YkluZm8ucHVsbFJlcXVlc3QubnVtYmVyLFxuXHRcdFx0XHRpY29uOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lmljb24sXG5cdFx0XHR9LFxuXHRcdFx0cHVsbFJlcXVlc3RzOiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdHM/Lm1hcChwdWxsUmVxdWVzdCA9PiAoe1xuXHRcdFx0XHRudW1iZXI6IHB1bGxSZXF1ZXN0Lm51bWJlcixcblx0XHRcdFx0dXJpOiBwdWxsUmVxdWVzdC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0aWNvbjogcHVsbFJlcXVlc3QuaWNvbixcblx0XHRcdH0pKVxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdGljb246IGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKSxcblx0XHRcdH0sXG5cdFx0XHRwdWxsUmVxdWVzdHM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdFx0dXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdFx0aWNvbjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bnVtYmVyOiA0MSxcblx0XHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQxJyxcblx0XHRcdFx0XHRpY29uOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRdXG5cdFx0fSk7XG5cdFx0c3ViLmRpc3Bvc2UoKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3VzZXMgdGhlIGxhdGVzdCBtZXJnZSBvciBwdWxsLXJlcXVlc3Qgb3V0Y29tZSBhcyB0aGUgY29tcGxldGVkLXN0YXRlIGljb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWwgPSB7IHB1bGxSZXF1ZXN0OiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9IGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RNb2RlbDtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2UgPSAoKSA9PiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UodGhpcy5fbW9kZWwpO1xuXHRcdH0oKTtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjb21wbGV0ZWQtc3RhdGUtaWNvbicsIHsgc3VtbWFyeTogJ0NvbXBsZXRlZCBTZXNzaW9uJywgcHJvamVjdDogeyB1cmk6IFVSSS5wYXJzZSgnZmlsZTovLy9yZXBvJyksIGRpc3BsYXlOYW1lOiAncmVwbycgfSB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnRpdGxlLmdldCgpID09PSAnQ29tcGxldGVkIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRjb25zdCBtZXJnZVN0YXRlID0gd2l0aFNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUodW5kZWZpbmVkLCB7XG5cdFx0XHRtZXJnZTogeyBjb21taXQ6ICdtZXJnZS1jb21taXQnIH0sXG5cdFx0XHRsYXRlc3RPdXRjb21lOiBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuTWVyZ2UsXG5cdFx0fSk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY29tcGxldGVkLXN0YXRlLWljb24nLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0NvbXBsZXRlZCBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdF9tZXRhOiBtZXJnZVN0YXRlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IG1lcmdlSWNvbiA9IHNlc3Npb24uY29tcGxldGVkU3RhdGVJY29uPy5nZXQoKTtcblxuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0U3RhdGUgPSB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSh3aXRoU2Vzc2lvbkdpdEh1YlN0YXRlKG1lcmdlU3RhdGUsIHtcblx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInXSxcblx0XHRcdHB1bGxSZXF1ZXN0QnJhbmNoTmFtZTogJ2ZlYXR1cmUnLFxuXHRcdH0pLCB7XG5cdFx0XHRtZXJnZTogeyBjb21taXQ6ICdtZXJnZS1jb21taXQnIH0sXG5cdFx0XHRsYXRlc3RPdXRjb21lOiBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuUHVsbFJlcXVlc3QsXG5cdFx0fSk7XG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnY29tcGxldGVkLXN0YXRlLWljb24nLCAnY29waWxvdGNsaScsIHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsXG5cdFx0XHR0aXRsZTogJ0NvbXBsZXRlZCBTZXNzaW9uJyxcblx0XHRcdHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdF9tZXRhOiBwdWxsUmVxdWVzdFN0YXRlLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHB1bGxSZXF1ZXN0SWNvbiA9IHNlc3Npb24uY29tcGxldGVkU3RhdGVJY29uPy5nZXQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVyZ2U6IHsgaWQ6IG1lcmdlSWNvbj8uaWQsIGNvbG9yOiBtZXJnZUljb24/LmNvbG9yPy5pZCB9LFxuXHRcdFx0cHVsbFJlcXVlc3Q6IHsgaWQ6IHB1bGxSZXF1ZXN0SWNvbj8uaWQsIGNvbG9yOiBwdWxsUmVxdWVzdEljb24/LmNvbG9yPy5pZCB9LFxuXHRcdH0sIHtcblx0XHRcdG1lcmdlOiB7IGlkOiBDb2RpY29uLmdpdE1lcmdlLmlkLCBjb2xvcjogJ2NoYXJ0cy5wdXJwbGUnIH0sXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRpZDogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4pLmlkLFxuXHRcdFx0XHRjb2xvcjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4pLmNvbG9yPy5pZCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbHRlcnMgZm9sZGVyLXNlc3Npb24gYmFzZWxpbmUgcHVsbCByZXF1ZXN0cyBmcm9tIEdpdEh1YiBpbmZvJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdFx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWwgPSB7IHB1bGxSZXF1ZXN0OiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSB9IGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RNb2RlbDtcblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2UgPSAoKSA9PiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UodGhpcy5fbW9kZWwpO1xuXHRcdH0oKTtcblxuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3ByLWJhc2VsaW5lJywgeyBzdW1tYXJ5OiAnUFIgU2Vzc2lvbicsIHByb2plY3Q6IHsgdXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vcmVwbycpLCBkaXNwbGF5TmFtZTogJ3JlcG8nIH0gfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGdpdEh1YlNlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUFIgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3ByLWJhc2VsaW5lJywgJ2NvcGlsb3RjbGknLCB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1BSIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRfbWV0YToge1xuXHRcdFx0XHRnaXRodWI6IHtcblx0XHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0XHRyZXBvOiAncmVwbycsXG5cdFx0XHRcdFx0cHVsbFJlcXVlc3RVcmxzOiBbXG5cdFx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdFx0XHQnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MScsXG5cdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBbJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInXSxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGdpdEh1YkluZm8gPSBzZXNzaW9uLndvcmtzcGFjZS5nZXQoKSEuZm9sZGVyc1swXSEuZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mby5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZVB1bGxSZXF1ZXN0OiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdD8ubnVtYmVyLFxuXHRcdFx0cHVsbFJlcXVlc3RzOiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdHM/Lm1hcChwdWxsUmVxdWVzdCA9PiBwdWxsUmVxdWVzdC5udW1iZXIpLFxuXHRcdH0sIHtcblx0XHRcdGFjdGl2ZVB1bGxSZXF1ZXN0OiA0MSxcblx0XHRcdHB1bGxSZXF1ZXN0czogWzQxXSxcblx0XHR9KTtcblx0fSkpO1xuXG5cdC8vIC0tLS0gcmVwbGFjZVNlc3Npb25Db25maWcgLS0tLS0tLVxuXG5cdHRlc3QoJ3JlcGxhY2VTZXNzaW9uQ29uZmlnIG9ubHkgcmVwbGFjZXMgc2Vzc2lvbk11dGFibGUsIG5vbi1yZWFkT25seSB2YWx1ZXMgYW5kIHByZXNlcnZlcyBldmVyeXRoaW5nIGVsc2UnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdyZXAtMScsIHsgc3VtbWFyeTogJ1JlcGxhY2UgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUmVwbGFjZSBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgY29uZmlnOiBTZXNzaW9uQ29uZmlnU3RhdGUgPSB7XG5cdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdHByb3BlcnRpZXM6IHtcblx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSB9LCAvLyBub24tbXV0YWJsZVxuXHRcdFx0XHRcdGJyYW5jaDogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdCcmFuY2gnLCBlbnVtOiBbJ21haW4nXSwgc2Vzc2lvbk11dGFibGU6IHRydWUsIHJlYWRPbmx5OiB0cnVlIH0sIC8vIHJlYWRPbmx5XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0dmFsdWVzOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGZha2VTdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Y2xpJywgdGl0bGU6ICdSZXBsYWNlIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjb25maWcsXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdyZXAtMScsICdjb3BpbG90Y2xpJywgZmFrZVN0YXRlKTtcblx0XHRhd2FpdCB3YWl0Rm9yU2Vzc2lvbkNvbmZpZyhwcm92aWRlciwgc2Vzc2lvbiEuc2Vzc2lvbklkLCBjID0+IGM/LnZhbHVlcy5hdXRvQXBwcm92ZSA9PT0gJ2RlZmF1bHQnKTtcblxuXHRcdC8vIENhbGxlciBhdHRlbXB0cyB0byBjaGFuZ2UgZXZlcnl0aGluZyBcdTIwMTQgaW5jbHVkaW5nIG5vbi1tdXRhYmxlXG5cdFx0Ly8gYGlzb2xhdGlvbmAsIHJlYWRPbmx5IGBicmFuY2hgLCBhbmQgYW4gdW5rbm93biBgcm9ndWVgIGtleS4gT25seVxuXHRcdC8vIGBhdXRvQXBwcm92ZWAgc2hvdWxkIGFjdHVhbGx5IGNoYW5nZTsgYWxsIG90aGVyIHZhbHVlcyBtdXN0IGJlXG5cdFx0Ly8gY2FycmllZCB0aHJvdWdoIHVuY2hhbmdlZCBhbmQgYHJvZ3VlYCBtdXN0IGJlIGRyb3BwZWQuXG5cdFx0YXdhaXQgcHJvdmlkZXIucmVwbGFjZVNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkLCB7XG5cdFx0XHRhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJyxcblx0XHRcdGlzb2xhdGlvbjogJ2ZvbGRlcicsXG5cdFx0XHRicmFuY2g6ICdvdGhlcicsXG5cdFx0XHRyb2d1ZTogJ2lnbm9yZWQnLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncmVwLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGNvbmZpZ0NoYW5nZWQgPSBhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMuZmluZChkID0+IGQuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgJiYgZC5jaGFubmVsID09PSBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQub2soY29uZmlnQ2hhbmdlZCwgJ2EgU2Vzc2lvbkNvbmZpZ0NoYW5nZWQgYWN0aW9uIHNob3VsZCBiZSBkaXNwYXRjaGVkJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb25maWdDaGFuZ2VkLmFjdGlvbiwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGxhdGVzdCA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVzdD8udmFsdWVzLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScsIGJyYW5jaDogJ21haW4nIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncnVubmluZyBzZXNzaW9uIGNvbmZpZyB3cml0ZXMgY2xhbXAgYXV0b0FwcHJvdmUgdG8gZGVmYXVsdCB3aGVuIHBvbGljeSBkaXNhYmxlcyBnbG9iYWwgYXV0by1hcHByb3ZlJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0YWdlbnRIb3N0LmFkZFNlc3Npb24oY3JlYXRlU2Vzc2lvbigncG9saWN5LXdyaXRlJywgeyBzdW1tYXJ5OiAnUG9saWN5IFdyaXRlIFNlc3Npb24nIH0pKTtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gY3JlYXRlUG9saWN5UmVzdHJpY3RlZENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UgfSk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUG9saWN5IFdyaXRlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdGF1dG9BcHByb3ZlOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0F1dG8gQXBwcm92ZScsIGVudW06IFsnZGVmYXVsdCcsICdhdXRvQXBwcm92ZScsICdhdXRvcGlsb3QnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0sXG5cdFx0fTtcblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnUG9saWN5IFdyaXRlIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjb25maWcsXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdwb2xpY3ktd3JpdGUnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXMuYXV0b0FwcHJvdmUgPT09ICdkZWZhdWx0Jyk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbiEuc2Vzc2lvbklkLCBTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlLCAnYXV0b3BpbG90Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3RjbGknLCAncG9saWN5LXdyaXRlJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZXRDb25maWdDaGFuZ2VkID0gYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmZpbmQoZCA9PiBkLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkICYmIGQuY2hhbm5lbCA9PT0gc2Vzc2lvblVyaSk7XG5cblx0XHRhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoID0gMDtcblx0XHRhd2FpdCBwcm92aWRlci5yZXBsYWNlU2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQsIHtcblx0XHRcdGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLFxuXHRcdFx0aXNvbGF0aW9uOiAnZm9sZGVyJyxcblx0XHR9KTtcblx0XHRjb25zdCByZXBsYWNlQ29uZmlnQ2hhbmdlZCA9IGFnZW50SG9zdC5kaXNwYXRjaGVkQWN0aW9ucy5maW5kKGQgPT4gZC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCAmJiBkLmNoYW5uZWwgPT09IHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXRBY3Rpb246IHNldENvbmZpZ0NoYW5nZWQ/LmFjdGlvbixcblx0XHRcdHJlcGxhY2VBY3Rpb246IHJlcGxhY2VDb25maWdDaGFuZ2VkPy5hY3Rpb24sXG5cdFx0XHRsYXRlc3RWYWx1ZXM6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8udmFsdWVzLFxuXHRcdH0sIHtcblx0XHRcdHNldEFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLFxuXHRcdFx0XHRjb25maWc6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JyB9LFxuXHRcdFx0fSxcblx0XHRcdHJlcGxhY2VBY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnZGVmYXVsdCcsIGlzb2xhdGlvbjogJ2ZvbGRlcicgfSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRsYXRlc3RWYWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnZm9sZGVyJyB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncnVubmluZyBzZXNzaW9uIGNvbmZpZyB3cml0ZSByZS1yZXNvbHZlcyBzY2hlbWEtZGVwZW5kZW50IHByb3BlcnRpZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdzY2hlbWEtd3JpdGUnLCB7IHN1bW1hcnk6ICdTY2hlbWEgV3JpdGUgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnU2NoZW1hIFdyaXRlIFNlc3Npb24nKTtcblx0XHRhc3NlcnQub2soc2Vzc2lvbik7XG5cblx0XHRjb25zdCBjb25maWc6IFNlc3Npb25Db25maWdTdGF0ZSA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdCdjb2RleC5zYW5kYm94TW9kZSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2FuZGJveCcsIGVudW06IFsncmVhZC1vbmx5JywgJ3dvcmtzcGFjZS13cml0ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHRcdCdjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCc6IHsgdHlwZTogJ2Jvb2xlYW4nLCB0aXRsZTogJ05ldHdvcmsnLCBkZWZhdWx0OiBmYWxzZSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3dvcmtzcGFjZS13cml0ZScsICdjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCc6IGZhbHNlIH0sXG5cdFx0fTtcblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnU2NoZW1hIFdyaXRlIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjb25maWcsXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdzY2hlbWEtd3JpdGUnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXNbJ2NvZGV4LnNhbmRib3hNb2RlJ10gPT09ICd3b3Jrc3BhY2Utd3JpdGUnKTtcblxuXHRcdGFnZW50SG9zdC5yZXNvbHZlU2Vzc2lvbkNvbmZpZ1Jlc3VsdCA9IHtcblx0XHRcdHNjaGVtYToge1xuXHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdCdjb2RleC5zYW5kYm94TW9kZSc6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnU2FuZGJveCcsIGVudW06IFsncmVhZC1vbmx5JywgJ3dvcmtzcGFjZS13cml0ZSddLCBzZXNzaW9uTXV0YWJsZTogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAncmVhZC1vbmx5JyB9LFxuXHRcdH07XG5cblx0XHRhd2FpdCBwcm92aWRlci5zZXRTZXNzaW9uQ29uZmlnVmFsdWUoc2Vzc2lvbiEuc2Vzc2lvbklkLCAnY29kZXguc2FuZGJveE1vZGUnLCAncmVhZC1vbmx5Jyk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy5zY2hlbWEucHJvcGVydGllc1snY29kZXgubmV0d29ya0FjY2Vzc0VuYWJsZWQnXSA9PT0gdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzb2x2ZUNvbmZpZzogYWdlbnRIb3N0LnJlc29sdmVTZXNzaW9uQ29uZmlnUmVxdWVzdHMuYXQoLTEpPy5jb25maWcsXG5cdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3Qua2V5cyhwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KS5zb3J0KCksXG5cdFx0XHR2YWx1ZXM6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8udmFsdWVzLFxuXHRcdH0sIHtcblx0XHRcdHJlc29sdmVDb25maWc6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3JlYWQtb25seScsICdjb2RleC5uZXR3b3JrQWNjZXNzRW5hYmxlZCc6IGZhbHNlIH0sXG5cdFx0XHRwcm9wZXJ0aWVzOiBbJ2NvZGV4LnNhbmRib3hNb2RlJ10sXG5cdFx0XHR2YWx1ZXM6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3JlYWQtb25seScgfSxcblx0XHR9KTtcblxuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3NjaGVtYS13cml0ZScsICdjb3BpbG90Y2xpJywge1xuXHRcdFx0Li4uZmFrZVN0YXRlLFxuXHRcdFx0Y29uZmlnOiB7XG5cdFx0XHRcdC4uLmNvbmZpZyxcblx0XHRcdFx0dmFsdWVzOiB7ICdjb2RleC5zYW5kYm94TW9kZSc6ICdyZWFkLW9ubHknLCAnY29kZXgubmV0d29ya0FjY2Vzc0VuYWJsZWQnOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwcm9wZXJ0aWVzOiBPYmplY3Qua2V5cyhwcm92aWRlci5nZXRTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCk/LnNjaGVtYS5wcm9wZXJ0aWVzID8/IHt9KS5zb3J0KCksXG5cdFx0XHR2YWx1ZXM6IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKT8udmFsdWVzLFxuXHRcdH0sIHtcblx0XHRcdHByb3BlcnRpZXM6IFsnY29kZXguc2FuZGJveE1vZGUnXSxcblx0XHRcdHZhbHVlczogeyAnY29kZXguc2FuZGJveE1vZGUnOiAncmVhZC1vbmx5JyB9LFxuXHRcdH0pO1xuXHR9KSk7XG5cblx0dGVzdCgncmVwbGFjZVNlc3Npb25Db25maWcgaXMgYSBuby1vcCB3aGVuIG5vdGhpbmcgZWRpdGFibGUgYWN0dWFsbHkgY2hhbmdlcycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGFnZW50SG9zdC5hZGRTZXNzaW9uKGNyZWF0ZVNlc3Npb24oJ3JlcC0yJywgeyBzdW1tYXJ5OiAnTm8tb3AgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnTm8tb3AgU2Vzc2lvbicpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGNvbmZpZzogU2Vzc2lvbkNvbmZpZ1N0YXRlID0ge1xuXHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdHR5cGU6ICdvYmplY3QnLFxuXHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0aXNvbGF0aW9uOiB7IHR5cGU6ICdzdHJpbmcnLCB0aXRsZTogJ0lzb2xhdGlvbicsIGVudW06IFsnZm9sZGVyJywgJ3dvcmt0cmVlJ10gfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR2YWx1ZXM6IHsgYXV0b0FwcHJvdmU6ICdkZWZhdWx0JywgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0sXG5cdFx0fTtcblx0XHRjb25zdCBmYWtlU3RhdGU6IFNlc3Npb25TdGF0ZSA9IHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnTm8tb3AgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZyxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ3JlcC0yJywgJ2NvcGlsb3RjbGknLCBmYWtlU3RhdGUpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0Y29uc3QgYmVmb3JlID0gYWdlbnRIb3N0LmRpc3BhdGNoZWRBY3Rpb25zLmxlbmd0aDtcblx0XHQvLyBDYWxsZXIgcmUtYXNzZXJ0cyB0aGUgc2FtZSBlZGl0YWJsZSB2YWx1ZTsgZXZlcnl0aGluZyBlbHNlIGVpdGhlclxuXHRcdC8vIG1hdGNoZXMgb3IgaXMgbm9uLWVkaXRhYmxlLlxuXHRcdGF3YWl0IHByb3ZpZGVyLnJlcGxhY2VTZXNzaW9uQ29uZmlnKHNlc3Npb24hLnNlc3Npb25JZCwgeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudEhvc3QuZGlzcGF0Y2hlZEFjdGlvbnMubGVuZ3RoLCBiZWZvcmUsICdubyBhY3Rpb24gc2hvdWxkIGJlIGRpc3BhdGNoZWQnKTtcblx0fSkpO1xuXG5cdC8vIC0tLS0gU2VydmVyLWVjaG9lZCBTZXNzaW9uQ29uZmlnQ2hhbmdlZCAtLS0tLS0tXG5cblx0dGVzdCgnc2VydmVyLWVjaG9lZCBTZXNzaW9uQ29uZmlnQ2hhbmdlZCBtZXJnZXMgY29uZmlnIHZhbHVlcyBpbnRvIHRoZSBydW5uaW5nIGNhY2hlIGJ5IGRlZmF1bHQnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjZmctbWVyZ2UnLCB7IHN1bW1hcnk6ICdNZXJnZSBTZXNzaW9uJyB9KSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCkuZmluZChzID0+IHMudGl0bGUuZ2V0KCkgPT09ICdNZXJnZSBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ01lcmdlIFNlc3Npb24nLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdFx0YWN0aXZlQ2xpZW50czogW10sXG5cdFx0XHRjaGF0czogW10sXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c2NoZW1hOiB7XG5cdFx0XHRcdFx0dHlwZTogJ29iamVjdCcsXG5cdFx0XHRcdFx0cHJvcGVydGllczoge1xuXHRcdFx0XHRcdFx0YXV0b0FwcHJvdmU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnQXV0byBBcHByb3ZlJywgZW51bTogWydkZWZhdWx0JywgJ2F1dG9BcHByb3ZlJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRhZ2VudEhvc3Quc2V0U2Vzc2lvblN0YXRlKCdjZmctbWVyZ2UnLCAnY29waWxvdGNsaScsIGZha2VTdGF0ZSk7XG5cdFx0YXdhaXQgd2FpdEZvclNlc3Npb25Db25maWcocHJvdmlkZXIsIHNlc3Npb24hLnNlc3Npb25JZCwgYyA9PiBjPy52YWx1ZXMuYXV0b0FwcHJvdmUgPT09ICdkZWZhdWx0Jyk7XG5cblx0XHRhZ2VudEhvc3QuZmlyZUFjdGlvbih7XG5cdFx0XHRjaGFubmVsOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90Y2xpJywgJ2NmZy1tZXJnZScpLnRvU3RyaW5nKCksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnIH0sXG5cdFx0XHR9LFxuXHRcdFx0c2VydmVyU2VxOiAxLFxuXHRcdFx0b3JpZ2luOiB1bmRlZmluZWQsXG5cdFx0fSBhcyBBY3Rpb25FbnZlbG9wZSk7XG5cblx0XHRjb25zdCB1cGRhdGVkID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbkNvbmZpZyhzZXNzaW9uIS5zZXNzaW9uSWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodXBkYXRlZD8udmFsdWVzLCB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdzZXJ2ZXItZWNob2VkIFNlc3Npb25Db25maWdDaGFuZ2VkIHdpdGggcmVwbGFjZTp0cnVlIG92ZXJ3cml0ZXMgdGhlIHJ1bm5pbmcgY2FjaGUnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdjZmctcmVwbGFjZScsIHsgc3VtbWFyeTogJ1JlcGxhY2UgU2Vzc2lvbicgfSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSAnUmVwbGFjZSBTZXNzaW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb24pO1xuXG5cdFx0Y29uc3QgZmFrZVN0YXRlOiBTZXNzaW9uU3RhdGUgPSB7XG5cdFx0XHRwcm92aWRlcjogJ2NvcGlsb3RjbGknLCB0aXRsZTogJ1JlcGxhY2UgU2Vzc2lvbicsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRhY3RpdmVDbGllbnRzOiBbXSxcblx0XHRcdGNoYXRzOiBbXSxcblx0XHRcdGNvbmZpZzoge1xuXHRcdFx0XHRzY2hlbWE6IHtcblx0XHRcdFx0XHR0eXBlOiAnb2JqZWN0Jyxcblx0XHRcdFx0XHRwcm9wZXJ0aWVzOiB7XG5cdFx0XHRcdFx0XHRhdXRvQXBwcm92ZTogeyB0eXBlOiAnc3RyaW5nJywgdGl0bGU6ICdBdXRvIEFwcHJvdmUnLCBlbnVtOiBbJ2RlZmF1bHQnLCAnYXV0b0FwcHJvdmUnXSwgc2Vzc2lvbk11dGFibGU6IHRydWUgfSxcblx0XHRcdFx0XHRcdG1vZGU6IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnTW9kZScsIGVudW06IFsnYScsICdiJ10sIHNlc3Npb25NdXRhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRpc29sYXRpb246IHsgdHlwZTogJ3N0cmluZycsIHRpdGxlOiAnSXNvbGF0aW9uJywgZW51bTogWydmb2xkZXInLCAnd29ya3RyZWUnXSB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHZhbHVlczogeyBhdXRvQXBwcm92ZTogJ2RlZmF1bHQnLCBtb2RlOiAnYScsIGlzb2xhdGlvbjogJ3dvcmt0cmVlJyB9LFxuXHRcdFx0fSxcblx0XHR9O1xuXHRcdGFnZW50SG9zdC5zZXRTZXNzaW9uU3RhdGUoJ2NmZy1yZXBsYWNlJywgJ2NvcGlsb3RjbGknLCBmYWtlU3RhdGUpO1xuXHRcdGF3YWl0IHdhaXRGb3JTZXNzaW9uQ29uZmlnKHByb3ZpZGVyLCBzZXNzaW9uIS5zZXNzaW9uSWQsIGMgPT4gYz8udmFsdWVzLmF1dG9BcHByb3ZlID09PSAnZGVmYXVsdCcpO1xuXG5cdFx0YWdlbnRIb3N0LmZpcmVBY3Rpb24oe1xuXHRcdFx0Y2hhbm5lbDogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdjZmctcmVwbGFjZScpLnRvU3RyaW5nKCksXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdFx0Y29uZmlnOiB7IGF1dG9BcHByb3ZlOiAnYXV0b0FwcHJvdmUnLCBpc29sYXRpb246ICd3b3JrdHJlZScgfSxcblx0XHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0XHRzZXJ2ZXJTZXE6IDEsXG5cdFx0XHRvcmlnaW46IHVuZGVmaW5lZCxcblx0XHR9IGFzIEFjdGlvbkVudmVsb3BlKTtcblxuXHRcdC8vIGBtb2RlYCBpcyBkcm9wcGVkIGJlY2F1c2UgaXQgd2Fzbid0IHJlLWFzc2VydGVkIGluIHRoZSByZXBsYWNlIHBheWxvYWQuXG5cdFx0Y29uc3QgdXBkYXRlZCA9IHByb3ZpZGVyLmdldFNlc3Npb25Db25maWcoc2Vzc2lvbiEuc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVwZGF0ZWQ/LnZhbHVlcywgeyBhdXRvQXBwcm92ZTogJ2F1dG9BcHByb3ZlJywgaXNvbGF0aW9uOiAnd29ya3RyZWUnIH0pO1xuXHR9KSk7XG5cblx0dGVzdCgna2VlcHMgYSB2aXNpYmxlIHNlc3Npb24gc3Vic2NyaWJlZCBzbyBob3N0LXNwYXduZWQgc3ViYWdlbnQgY2hhdHMga2VlcCByZWFjaGluZyB0aGUgY2F0YWxvZycsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb24gZm9yIHRoZSBcIk9wZW4gU3ViYWdlbnRcIiBwaWxsOiBhIHBhc3NpdmVseS13YXRjaGVkIHNlc3Npb25cblx0XHQvLyBtdXN0IHN0YXkgc3Vic2NyaWJlZCBzbyBhIGhvc3Qtc3Bhd25lZCBzdWJhZ2VudCdzIGBjaGF0QWRkZWRgIGtlZXBzXG5cdFx0Ly8gcmVhY2hpbmcgdGhlIGNhdGFsb2cgcGFzdCB0aGUgaWRsZS1yZWxlYXNlIHdpbmRvdy5cblx0XHRhZ2VudEhvc3QuYWRkU2Vzc2lvbihjcmVhdGVTZXNzaW9uKCdzdWJhZ2VudC1saXZlJywgeyBzdW1tYXJ5OiAnTGVhZCcgfSkpO1xuXHRcdGNvbnN0IHZpc2libGVTZXNzaW9ucyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSAoSUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQpW10+KCd2aXNpYmxlJywgW10pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IHZpc2libGVTZXNzaW9ucyB9KTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cblx0XHQvLyBUaGUgc2Vzc2lvbidzIHZpZXcgaXMgb24gc2NyZWVuOiBpdHMgc3RhdGUgc3Vic2NyaXB0aW9uIG11c3QgYmUgcGlubmVkLlxuXHRcdHZpc2libGVTZXNzaW9ucy5zZXQoW25ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFjdGl2ZVNlc3Npb24+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgcmVzb3VyY2UgPSBzZXNzaW9uLnJlc291cmNlO1xuXHRcdH0oKV0sIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdGNsaScsICdzdWJhZ2VudC1saXZlJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRPbmUgPSBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uVXJpLCAndGMtMScpO1xuXHRcdGNvbnN0IHN1YmFnZW50VHdvID0gYnVpbGRTdWJhZ2VudENoYXRVcmkoc2Vzc2lvblVyaSwgJ3RjLTInKTtcblx0XHRjb25zdCB0b29sQ2hhdCA9IChyZXNvdXJjZTogc3RyaW5nLCB0b29sQ2FsbElkOiBzdHJpbmcsIHRpdGxlOiBzdHJpbmcpOiBDaGF0U3VtbWFyeSA9PiAoe1xuXHRcdFx0cmVzb3VyY2UsIHRpdGxlLCBzdGF0dXM6IFByb3RvY29sU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCBtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0b3JpZ2luOiB7IGtpbmQ6IFByb3RvY29sQ2hhdE9yaWdpbktpbmQuVG9vbCwgY2hhdDogZGVmYXVsdENoYXQsIHRvb2xDYWxsSWQgfSxcblx0XHR9KTtcblx0XHRjb25zdCBzdGF0ZVdpdGggPSAoY2hhdHM6IENoYXRTdW1tYXJ5W10pOiBTZXNzaW9uU3RhdGUgPT4gKHtcblx0XHRcdHByb3ZpZGVyOiAnY29waWxvdGNsaScsIHRpdGxlOiAnTGVhZCcsIHN0YXR1czogUHJvdG9jb2xTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksIGFjdGl2ZUNsaWVudHM6IFtdLCBkZWZhdWx0Q2hhdCwgY2hhdHMsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZGVmYXVsdFN1bW1hcnk6IENoYXRTdW1tYXJ5ID0geyByZXNvdXJjZTogZGVmYXVsdENoYXQsIHRpdGxlOiAnJywgc3RhdHVzOiBQcm90b2NvbFNlc3Npb25TdGF0dXMuSWRsZSwgbW9kaWZpZWRBdDogbmV3IERhdGUoMCkudG9JU09TdHJpbmcoKSB9O1xuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnc3ViYWdlbnQtbGl2ZScsICdjb3BpbG90Y2xpJywgc3RhdGVXaXRoKFtkZWZhdWx0U3VtbWFyeSwgdG9vbENoYXQoc3ViYWdlbnRPbmUsICd0Yy0xJywgJ0FkZCBuYW1lIHRvIFJFQURNRScpXSkpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLmNoYXRzLmdldCgpLnNvbWUoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50ID09PSAnc3ViYWdlbnQvdGMtMScpLCAnZmlyc3Qgc3ViYWdlbnQgc2hvdWxkIHJlYWNoIHRoZSBjYXRhbG9nIHdoaWxlIHZpc2libGUnKTtcblxuXHRcdC8vIEFkdmFuY2Ugd2VsbCBwYXN0IHRoZSBpZGxlLXJlbGVhc2Ugd2luZG93OyBhIHBhc3NpdmVseS13YXRjaGVkIHNlc3Npb25cblx0XHQvLyB1c2VkIHRvIGRyb3AgaXRzIHN0YXRlIGxpc3RlbmVyIGhlcmUuXG5cdFx0YXdhaXQgdGltZW91dCgxMjBfMDAwKTtcblxuXHRcdC8vIEEgc2Vjb25kIHN1YmFnZW50IHNwYXducyBsYXRlciBpbiB0aGUgc2FtZSBydW47IGl0IG11c3Qgc3RpbGwgcmVhY2ggdGhlXG5cdFx0Ly8gY2F0YWxvZyBiZWNhdXNlIHRoZSB2aXNpYmxlIHNlc3Npb24gc3RheWVkIHN1YnNjcmliZWQuXG5cdFx0YWdlbnRIb3N0LnNldFNlc3Npb25TdGF0ZSgnc3ViYWdlbnQtbGl2ZScsICdjb3BpbG90Y2xpJywgc3RhdGVXaXRoKFtcblx0XHRcdGRlZmF1bHRTdW1tYXJ5LFxuXHRcdFx0dG9vbENoYXQoc3ViYWdlbnRPbmUsICd0Yy0xJywgJ0FkZCBuYW1lIHRvIFJFQURNRScpLFxuXHRcdFx0dG9vbENoYXQoc3ViYWdlbnRUd28sICd0Yy0yJywgJ0FkZCBkZXNjcmlwdGlvbiB0byBwYWNrYWdlLmpzb24nKSxcblx0XHRdKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2Vzc2lvbi5jaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnJlc291cmNlLmZyYWdtZW50KS5maWx0ZXIoZiA9PiBmLnN0YXJ0c1dpdGgoJ3N1YmFnZW50LycpKS5zb3J0KCksXG5cdFx0XHRbJ3N1YmFnZW50L3RjLTEnLCAnc3ViYWdlbnQvdGMtMiddLFxuXHRcdFx0J2JvdGggc3ViYWdlbnRzIHNob3VsZCByZWFjaCB0aGUgY2F0YWxvZyBhZnRlciB0aGUgaWRsZSB3aW5kb3cgd2hpbGUgdGhlIHNlc3Npb24gc3RheXMgdmlzaWJsZScsXG5cdFx0KTtcblx0fSkpO1xufSk7XG5cbnN1aXRlLnNraXAoJ0xvY2FsQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciAtIGFjdGl2ZS1zZXNzaW9uIGJyYW5jaCBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IGFnZW50SG9zdDogTW9ja0FnZW50SG9zdFNlcnZpY2U7XG5cdGxldCBhY3RpdmVTZXNzaW9uOiBJU2V0dGFibGVPYnNlcnZhYmxlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPjtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0YWdlbnRIb3N0ID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQWdlbnRIb3N0U2VydmljZSgpKTtcblx0XHRhY3RpdmVTZXNzaW9uID0gb2JzZXJ2YWJsZVZhbHVlPElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkPigndGVzdC5hY3RpdmVTZXNzaW9uJywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VBY3RpdmUocmF3SWQ6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyA9ICdjb3BpbG90Y2xpJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzID0gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpOiBJQWN0aXZlU2Vzc2lvbiB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC8vIHByb3ZpZGVySWQ6ICd1bnVzZWQnLFxuXHRcdFx0c2Vzc2lvblR5cGUsXG5cdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IGBhZ2VudC1ob3N0LSR7c2Vzc2lvblR5cGV9YCwgcGF0aDogYC8ke3Jhd0lkfWAgfSksXG5cdFx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShzdGF0dXMpLFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWN0aXZlU2Vzc2lvbjtcblx0fVxuXG5cdGZ1bmN0aW9uIGJyYW5jaENoYW5nZXNLZXlGb3IocmF3SWQ6IHN0cmluZywgc2Vzc2lvblR5cGU6IHN0cmluZyA9ICdjb3BpbG90Y2xpJyk6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGAke0FnZW50U2Vzc2lvbi51cmkoc2Vzc2lvblR5cGUsIHJhd0lkKS50b1N0cmluZygpfS9jaGFuZ2VzZXQvYnJhbmNoYDtcblx0fVxuXG5cdC8vIFRoZSBhZGFwdGVyIHN1YnNjcmliZXMgdG8gaXRzIGJyYW5jaCBjaGFuZ2VzZXQgbGF6aWx5IFx1MjAxNCBvbmx5IHdoaWxlIHRoZVxuXHQvLyBzZXNzaW9uIGlzIGFjdGl2ZSBBTkQgaXRzIGBjaGFuZ2VzYCAvIGBjaGFuZ2VzU3VtbWFyeWAgb2JzZXJ2YWJsZSBpcyBiZWluZ1xuXHQvLyBvYnNlcnZlZC4gS2VlcCBhbiBhdXRvcnVuIGFsaXZlIHNvIHRoYXQgdGhlIHN1YnNjcmlwdGlvbiBpcyBlc3RhYmxpc2hlZC5cblx0ZnVuY3Rpb24gb2JzZXJ2ZVNlc3Npb24oc2Vzc2lvbjogSVNlc3Npb24pOiB2b2lkIHtcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0c2Vzc2lvbi5jaGFuZ2VzLnJlYWQocmVhZGVyKTtcblx0XHRcdHNlc3Npb24uY2hhbmdlc1N1bW1hcnk/LnJlYWQocmVhZGVyKTtcblx0XHR9KSk7XG5cdH1cblxuXHRmdW5jdGlvbiBhZGRBbmRPYnNlcnZlKHByb3ZpZGVyOiBMb2NhbEFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIsIHJhd0lkOiBzdHJpbmcsIG9wdHM/OiB7IGNoYW5nZXM/OiBDaGFuZ2VzU3VtbWFyeSB9KTogSVNlc3Npb24ge1xuXHRcdGZpcmVTZXNzaW9uQWRkZWQoYWdlbnRIb3N0LCByYXdJZCwgeyB0aXRsZTogYFNlc3Npb24gJHtyYXdJZH1gLCBjaGFuZ2VzOiBvcHRzPy5jaGFuZ2VzIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpLmZpbmQocyA9PiBzLnRpdGxlLmdldCgpID09PSBgU2Vzc2lvbiAke3Jhd0lkfWApO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLCBgZXhwZWN0ZWQgc2Vzc2lvbiAke3Jhd0lkfWApO1xuXHRcdG9ic2VydmVTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHJldHVybiBzZXNzaW9uO1xuXHR9XG5cblx0dGVzdCgnc3Vic2NyaWJlcyB0byB0aGUgYnJhbmNoIGNoYW5nZXNldCB3aGVuIHRoZSBzZXNzaW9uIGJlY29tZXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0YWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBrZXkgPSBicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKTtcblx0XHRhc3NlcnQub2soXG5cdFx0XHRhZ2VudEhvc3Qud2lyZU9wcy5pbmNsdWRlcyhgc3Vic2NyaWJlOiR7a2V5fWApLFxuXHRcdFx0YGV4cGVjdGVkIGEgc3Vic2NyaWJlIGZvciAke2tleX0sIGdvdCB3aXJlT3BzPSR7SlNPTi5zdHJpbmdpZnkoYWdlbnRIb3N0LndpcmVPcHMpfWAsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncm90YXRlcyB0aGUgc3Vic2NyaXB0aW9uIHdoZW4gdGhlIGFjdGl2ZSBzZXNzaW9uIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cdFx0YWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQicpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmdldChicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKSkgPz8gMCwgMSwgJ0Egc2hvdWxkIGJlIHN1YnNjcmliZWQgb25jZSBvbiBhY3RpdmF0aW9uJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUInKSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25TdWJzY3JpYmVDb3VudHMuZ2V0KGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQicpKSA/PyAwLCAxLCAnQiBzaG91bGQgYmUgc3Vic2NyaWJlZCBvbmNlIG9uIGFjdGl2YXRpb24nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRIb3N0LnNlc3Npb25VbnN1YnNjcmliZUNvdW50cy5nZXQoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJykpID8/IDAsIDEsICdBIHNob3VsZCBiZSB1bnN1YnNjcmliZWQgd2hlbiBubyBsb25nZXIgYWN0aXZlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N3aXRjaGluZyBiYWNrIHRvIGEgcHJldmlvdXNseS1hY3RpdmUgc2Vzc2lvbiByZS1zdWJzY3JpYmVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0YWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXHRcdGFkZEFuZE9ic2VydmUocHJvdmlkZXIsICdzZXNzLUInKTtcblxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQScpLCB1bmRlZmluZWQpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQicpLCB1bmRlZmluZWQpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQScpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3Qgc3Vic0ZvckEgPSBhZ2VudEhvc3Quc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJykpID8/IDA7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1YnNGb3JBLCAyLCAnc3dpdGNoaW5nIGJhY2sgdG8gQSBtdXN0IG9wZW4gYSBmcmVzaCBzdWJzY3JpcHRpb24nKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBOT1Qgc3Vic2NyaWJlIHdoZW4gYSBkaWZmZXJlbnQgc2Vzc2lvbiBpcyBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLW90aGVyJyksIHVuZGVmaW5lZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRhZ2VudEhvc3Quc2Vzc2lvblN1YnNjcmliZUNvdW50cy5nZXQoYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJykpID8/IDAsXG5cdFx0XHQwLFxuXHRcdFx0J25vIGJyYW5jaCBjaGFuZ2VzZXQgc3Vic2NyaXB0aW9uIHNob3VsZCBvcGVuIHdoaWxlIGEgZGlmZmVyZW50IHNlc3Npb24gaXMgYWN0aXZlJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIE5PVCBzdWJzY3JpYmUgdG8gdW5jb21taXR0ZWQgY2hhbmdlcyBmb3IgYW4gdW50aXRsZWQgYWN0aXZlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLW5ldycsICdjb3BpbG90Y2xpJywgU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBzdWJLZXlzID0gWy4uLmFnZW50SG9zdC5zZXNzaW9uU3Vic2NyaWJlQ291bnRzLmtleXMoKV0uZmlsdGVyKGsgPT4gay5lbmRzV2l0aCgnL2NoYW5nZXNldC91bmNvbW1pdHRlZCcpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1YktleXMsIFtdLCAnbmV3LXNlc3Npb24gY29tcG9zZXIgc2hvdWxkIG5vdCByZXN0b3JlIHRoZSBiYWNrZW5kIHNlc3Npb24ganVzdCB0byByZWZyZXNoIGNoYW5nZXMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVsZWFzZXMgdGhlIHN1YnNjcmlwdGlvbiB3aGVuIG5vIHNlc3Npb24gaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIGFnZW50SG9zdCwgdW5kZWZpbmVkLCB7IGFjdGl2ZVNlc3Npb24gfSk7XG5cdFx0YWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQodW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgdW5zdWJzRm9yQSA9IGFnZW50SG9zdC5zZXNzaW9uVW5zdWJzY3JpYmVDb3VudHMuZ2V0KGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpKSA/PyAwO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnN1YnNGb3JBLCAxLCAnbGVhdmluZyB0aGUgYWdlbnRzIHdpbmRvdyAobm8gYWN0aXZlIHNlc3Npb24pIG11c3QgcmVsZWFzZSB0aGUgc3Vic2NyaXB0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSBicmFuY2ggY2hhbmdlc2V0IHVzZXMgYmVmb3JlIGNvbnRlbnQgVVJJIGFzIHRoZSBkaWZmIG9yaWdpbmFsJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cdFx0YWdlbnRIb3N0LnNldENoYW5nZXNldFN0YXRlKGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpLCB7XG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdGZpbGVzOiBbe1xuXHRcdFx0XHRpZDogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyxcblx0XHRcdFx0ZWRpdDoge1xuXHRcdFx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9iZWZvcmUvZmlsZS50cycgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycgfSB9LFxuXHRcdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDIsIHJlbW92ZWQ6IDEgfSxcblx0XHRcdFx0fSxcblx0XHRcdH1dLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgY2hhbmdlcyA9IHNlc3Npb24uY2hhbmdlcy5nZXQoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMubWFwKGNoYW5nZSA9PiB7XG5cdFx0XHRhc3NlcnQub2soaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMihjaGFuZ2UpKTtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHVyaTogY2hhbmdlLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRvcmlnaW5hbFVyaTogY2hhbmdlLm9yaWdpbmFsVXJpPy50b1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZFVyaTogY2hhbmdlLm1vZGlmaWVkVXJpPy50b1N0cmluZygpLFxuXHRcdFx0XHRpbnNlcnRpb25zOiBjaGFuZ2UuaW5zZXJ0aW9ucyxcblx0XHRcdFx0ZGVsZXRpb25zOiBjaGFuZ2UuZGVsZXRpb25zLFxuXHRcdFx0fTtcblx0XHR9KSwgW3tcblx0XHRcdHVyaTogJ2ZpbGU6Ly8vcmVwby9maWxlLnRzJyxcblx0XHRcdG9yaWdpbmFsVXJpOiAndnNjb2RlLWFnZW50LWhvc3Q6Ly9sb2NhbC9iZWZvcmUvZmlsZS50cz9fYWglM0RleUp6WTJobGJXVWlPaUp6WlhOemFXOXVMV1JpSW4wJyxcblx0XHRcdG1vZGlmaWVkVXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLFxuXHRcdFx0aW5zZXJ0aW9uczogMixcblx0XHRcdGRlbGV0aW9uczogMSxcblx0XHR9XSk7XG5cdH0pKTtcblxuXHR0ZXN0KCdjaGFuZ2VzIHN1bW1hcnkgdHJhY2tzIHRoZSBsaXZlIGJyYW5jaCBjaGFuZ2VzZXQgd2hpbGUgYWN0aXZlIGFuZCB0aGUgY2F0YWxvZ3VlIG9uY2UgaW5hY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXG5cdFx0Ly8gU2VlZCB0aGUgbGl2ZSBjaGFuZ2VzZXQgYmVmb3JlIGFjdGl2YXRpbmcgdGhlIHNlc3Npb24uIFdoZW4gdGhlXG5cdFx0Ly8gc3Vic2NyaXB0aW9uIGlzIGZpcnN0IG9ic2VydmVkLCB0aGlzIGlzIHRoZSBpbml0aWFsIHZhbHVlIG9mIHRoZVxuXHRcdC8vIHRocm90dGxlZCBvYnNlcnZhYmxlLCBzbyBubyB0aHJvdHRsZSB0aW1lciBoYXMgdG8gZWxhcHNlLlxuXHRcdGFnZW50SG9zdC5zZXRDaGFuZ2VzZXRTdGF0ZShicmFuY2hDaGFuZ2VzS2V5Rm9yKCdzZXNzLUEnKSwge1xuXHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHRmaWxlczogW3tcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycsXG5cdFx0XHRcdGVkaXQ6IHtcblx0XHRcdFx0XHRiZWZvcmU6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnLCBjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6Ly8vYmVmb3JlL2ZpbGUudHMnIH0gfSxcblx0XHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3JlcG8vZmlsZS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9yZXBvL2ZpbGUudHMnIH0gfSxcblx0XHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAyLCByZW1vdmVkOiAxIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUEnKSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIFdoaWxlIGFjdGl2ZSwgdGhlIHN1bW1hcnkgcmVmbGVjdHMgdGhlIGxpdmUgYnJhbmNoIGNoYW5nZXNldC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb24uY2hhbmdlc1N1bW1hcnk/LmdldCgpLCB7IGFkZGl0aW9uczogMiwgZGVsZXRpb25zOiAxLCBmaWxlczogMSB9KTtcblxuXHRcdC8vIE9uY2UgYW5vdGhlciBzZXNzaW9uIGJlY29tZXMgYWN0aXZlLCB0aGUgY2F0YWxvZ3VlLXNlZWRlZCBzdW1tYXJ5XG5cdFx0Ly8gdGFrZXMgb3ZlciBhZ2Fpbi5cblx0XHRhY3RpdmVTZXNzaW9uLnNldChtYWtlQWN0aXZlKCdzZXNzLUInKSwgdW5kZWZpbmVkKTtcblx0XHRmaXJlU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKGFnZW50SG9zdCwgJ3Nlc3MtQScsIHsgY2hhbmdlczogeyBhZGRpdGlvbnM6IDUsIGRlbGV0aW9uczogMywgZmlsZXM6IDEgfSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vzc2lvbi5jaGFuZ2VzU3VtbWFyeT8uZ2V0KCksIHsgYWRkaXRpb25zOiA1LCBkZWxldGlvbnM6IDMsIGZpbGVzOiAxIH0pO1xuXHR9KTtcblxuXHQvLyBCdWlsZHMgb25lIGNoYW5nZXNldCBmaWxlLiBgdmVyc2lvbmAgZHJpdmVzIHRoZSBkaWZmIHNvIHRoYXQgXCJjaGFuZ2luZ1wiIGFcblx0Ly8gZmlsZSAoYnVtcGluZyBpdHMgdmVyc2lvbikgcHJvZHVjZXMgYSBnZW51aW5lbHkgZGlmZmVyZW50IGZpbGUgb2JqZWN0LFxuXHQvLyBtaXJyb3Jpbmcgd2hhdCB0aGUgc2VydmVyIHJlZHVjZXIgZW1pdHMgdmlhIGEgYENoYW5nZXNldEZpbGVTZXRgIGFjdGlvbi5cblx0ZnVuY3Rpb24gbWFrZUNoYW5nZXNldEZpbGUoaW5kZXg6IG51bWJlciwgdmVyc2lvbjogbnVtYmVyKTogQ2hhbmdlc2V0U3RhdGVbJ2ZpbGVzJ11bbnVtYmVyXSB7XG5cdFx0Y29uc3QgcGF0aCA9IGBmaWxlOi8vL3JlcG8vc3JjL2ZpbGUtJHtpbmRleH0udHNgO1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZDogcGF0aCxcblx0XHRcdGVkaXQ6IHtcblx0XHRcdFx0YmVmb3JlOiB7IHVyaTogcGF0aCwgY29udGVudDogeyB1cmk6IGBzZXNzaW9uLWRiOi8vL2JlZm9yZS9maWxlLSR7aW5kZXh9LnRzYCB9IH0sXG5cdFx0XHRcdGFmdGVyOiB7IHVyaTogcGF0aCwgY29udGVudDogeyB1cmk6IHBhdGggfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiB2ZXJzaW9uLCByZW1vdmVkOiAwIH0sXG5cdFx0XHR9LFxuXHRcdH07XG5cdH1cblxuXHQvLyBQZXJmb3JtYW5jZS1yZWdyZXNzaW9uIGd1YXJkIGZvciB0aGUgcGVyLWZpbGUgY2hhbmdlIGNhY2hlLlxuXHQvL1xuXHQvLyBUaGUgc2VydmVyIHJlZHVjZXIgcHJlc2VydmVzIHRoZSByZWZlcmVuY2Ugb2YgZXZlcnkgYENoYW5nZXNldEZpbGVgIHRoYXRcblx0Ly8gZGlkbid0IGNoYW5nZSBhY3Jvc3MgYW4gdXBkYXRlOyB0aGUgcHJvdmlkZXIgbXVzdCBleHBsb2l0IHRoYXQgYW5kIG9ubHlcblx0Ly8gcmVidWlsZCB0aGUgY2hhbmdlIG9iamVjdCBmb3IgdGhlIGZpbGUocykgdGhhdCBhY3R1YWxseSBjaGFuZ2VkLiBIZXJlIHdlXG5cdC8vIHN0cmVhbSBtYW55IHNpbmdsZS1maWxlIHVwZGF0ZXMgb3ZlciBhIGxhcmdlIGZpbGUgc2V0IGFuZCBhc3NlcnQgdGhhdCBlYWNoXG5cdC8vIHVwZGF0ZSByZWJ1aWxkcyBleGFjdGx5IE9ORSBjaGFuZ2Ugb2JqZWN0IChpZGVudGl0eS13aXNlKSwgbm90IGFsbCBvZiB0aGVtLlxuXHQvL1xuXHQvLyBSZXZlcnRpbmcgdGhlIHBlci1maWxlIGNhY2hpbmcgKGkuZS4gcmVidWlsZGluZy9gLi4uc3ByZWFkYC1pbmcgZXZlcnkgZmlsZVxuXHQvLyBvbiBldmVyeSB1cGRhdGUpIG1ha2VzIHRoaXMgZmFpbCBpbW1lZGlhdGVseTogYWxsIEZJTEVfQ09VTlQgb2JqZWN0cyBhcmVcblx0Ly8gZnJlc2hseSBidWlsdCBvbiB0aGUgZmlyc3QgdXBkYXRlLlxuXHR0ZXN0KCdyZWJ1aWxkcyBvbmx5IHRoZSBjaGFuZ2VkIGZpbGUgYWNyb3NzIG1hbnkgY2hhbmdlc2V0IHVwZGF0ZXMgKE8oY2hhbmdlZCksIG5vdCBPKGFsbCkpJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSwgbWF4VGFza0NvdW50OiAxXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgYWdlbnRIb3N0LCB1bmRlZmluZWQsIHsgYWN0aXZlU2Vzc2lvbiB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYWRkQW5kT2JzZXJ2ZShwcm92aWRlciwgJ3Nlc3MtQScpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KG1ha2VBY3RpdmUoJ3Nlc3MtQScpLCB1bmRlZmluZWQpO1xuXG5cdFx0Y29uc3QgRklMRV9DT1VOVCA9IDIwMDtcblx0XHRjb25zdCBVUERBVEVfQ09VTlQgPSAxMDA7XG5cdFx0Y29uc3Qga2V5ID0gYnJhbmNoQ2hhbmdlc0tleUZvcignc2Vzcy1BJyk7XG5cblx0XHQvLyBBIHN0YWJsZSBwb29sIG9mIGZpbGUgb2JqZWN0cy4gRWFjaCB1cGRhdGUgYmVsb3cgcmVwbGFjZXMgZXhhY3RseSBvbmVcblx0XHQvLyBlbnRyeSBhbmQga2VlcHMgZXZlcnkgb3RoZXIgcmVmZXJlbmNlLCBleGFjdGx5IGFzIHRoZSByZWR1Y2VyIGRvZXMuXG5cdFx0Y29uc3QgZmlsZXM6IENoYW5nZXNldFN0YXRlWydmaWxlcyddID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBGSUxFX0NPVU5UOyBpKyspIHtcblx0XHRcdGZpbGVzLnB1c2gobWFrZUNoYW5nZXNldEZpbGUoaSwgMCkpO1xuXHRcdH1cblx0XHRhZ2VudEhvc3Quc2V0Q2hhbmdlc2V0U3RhdGUoa2V5LCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogWy4uLmZpbGVzXSB9KTtcblxuXHRcdGxldCBwcmV2aW91cyA9IHNlc3Npb24uY2hhbmdlcy5nZXQoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJldmlvdXMubGVuZ3RoLCBGSUxFX0NPVU5ULCAnZXZlcnkgZmlsZSBzaG91bGQgc3VyZmFjZSBhcyBhIGNoYW5nZScpO1xuXG5cdFx0Zm9yIChsZXQgdXBkYXRlID0gMDsgdXBkYXRlIDwgVVBEQVRFX0NPVU5UOyB1cGRhdGUrKykge1xuXHRcdFx0Y29uc3QgY2hhbmdlZEluZGV4ID0gdXBkYXRlICUgRklMRV9DT1VOVDtcblx0XHRcdGZpbGVzW2NoYW5nZWRJbmRleF0gPSBtYWtlQ2hhbmdlc2V0RmlsZShjaGFuZ2VkSW5kZXgsIHVwZGF0ZSArIDEpO1xuXHRcdFx0YWdlbnRIb3N0LnNldENoYW5nZXNldFN0YXRlKGtleSwgeyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSwgZmlsZXM6IFsuLi5maWxlc10gfSk7XG5cblx0XHRcdGNvbnN0IG5leHQgPSBzZXNzaW9uLmNoYW5nZXMuZ2V0KCk7XG5cblx0XHRcdGxldCByZWJ1aWx0ID0gMDtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgRklMRV9DT1VOVDsgaSsrKSB7XG5cdFx0XHRcdGlmIChuZXh0W2ldICE9PSBwcmV2aW91c1tpXSkge1xuXHRcdFx0XHRcdHJlYnVpbHQrKztcblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVidWlsdCwgMSwgYHVwZGF0ZSAke3VwZGF0ZX06IGV4YWN0bHkgb25lIGNoYW5nZSBvYmplY3Qgc2hvdWxkIGJlIHJlYnVpbHQsIGJ1dCAke3JlYnVpbHR9IG9mICR7RklMRV9DT1VOVH0gd2VyZWApO1xuXHRcdFx0cHJldmlvdXMgPSBuZXh0O1xuXHRcdH1cblx0fSkpO1xuXG5cdC8vIENvbXBhbmlvbiB0byB0aGUgdGVzdCBhYm92ZSwgc3RhdGVkIGFzIGEgc2ltcGxlIGlkZW50aXR5IGludmFyaWFudDogYSBmaWxlXG5cdC8vIHRoYXQgaXMgbmV2ZXIgdG91Y2hlZCBtdXN0IGtlZXAgdGhlICpzYW1lKiBjaGFuZ2Ugb2JqZWN0IGluc3RhbmNlIG5vIG1hdHRlclxuXHQvLyBob3cgbWFueSB1cGRhdGVzIHN0cmVhbSBpbiBmb3Igb3RoZXIgZmlsZXMuIFJldmVydGluZyB0aGUgY2FjaGUgcmVidWlsZHNcblx0Ly8gZXZlcnkgY2hhbmdlIG9iamVjdCBvbiBldmVyeSB1cGRhdGUsIHNvIHRoaXMgaWRlbnRpdHkgY2hlY2sgZmFpbHMuXG5cdHRlc3QoJ2FuIHVudG91Y2hlZCBmaWxlIGtlZXBzIGl0cyBjaGFuZ2Utb2JqZWN0IGlkZW50aXR5IHdoaWxlIGFub3RoZXIgZmlsZSBzdHJlYW1zIHVwZGF0ZXMnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDFfMDAwIH0sIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBhZ2VudEhvc3QsIHVuZGVmaW5lZCwgeyBhY3RpdmVTZXNzaW9uIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhZGRBbmRPYnNlcnZlKHByb3ZpZGVyLCAnc2Vzcy1BJyk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQobWFrZUFjdGl2ZSgnc2Vzcy1BJyksIHVuZGVmaW5lZCk7XG5cblx0XHRjb25zdCBGSUxFX0NPVU5UID0gNTA7XG5cdFx0Y29uc3QgVVBEQVRFX0NPVU5UID0gMTAwO1xuXHRcdGNvbnN0IGtleSA9IGJyYW5jaENoYW5nZXNLZXlGb3IoJ3Nlc3MtQScpO1xuXG5cdFx0Y29uc3QgZmlsZXM6IENoYW5nZXNldFN0YXRlWydmaWxlcyddID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBGSUxFX0NPVU5UOyBpKyspIHtcblx0XHRcdGZpbGVzLnB1c2gobWFrZUNoYW5nZXNldEZpbGUoaSwgMCkpO1xuXHRcdH1cblx0XHRhZ2VudEhvc3Quc2V0Q2hhbmdlc2V0U3RhdGUoa2V5LCB7IHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCBmaWxlczogWy4uLmZpbGVzXSB9KTtcblxuXHRcdC8vIEluZGV4IDAgaXMgbmV2ZXIgdG91Y2hlZDsgb25seSB0aGUgbGFzdCBmaWxlIFwic3RyZWFtc1wiIHVwZGF0ZXMuXG5cdFx0Y29uc3QgdW50b3VjaGVkQ2hhbmdlQmVmb3JlID0gc2Vzc2lvbi5jaGFuZ2VzLmdldCgpWzBdO1xuXHRcdGFzc2VydC5vayh1bnRvdWNoZWRDaGFuZ2VCZWZvcmUsICd0aGUgdW50b3VjaGVkIGZpbGUgc2hvdWxkIGhhdmUgYSBjaGFuZ2Ugb2JqZWN0IHRvIGJlZ2luIHdpdGgnKTtcblxuXHRcdGNvbnN0IGxhc3RJbmRleCA9IEZJTEVfQ09VTlQgLSAxO1xuXHRcdGZvciAobGV0IHVwZGF0ZSA9IDA7IHVwZGF0ZSA8IFVQREFURV9DT1VOVDsgdXBkYXRlKyspIHtcblx0XHRcdGZpbGVzW2xhc3RJbmRleF0gPSBtYWtlQ2hhbmdlc2V0RmlsZShsYXN0SW5kZXgsIHVwZGF0ZSArIDEpO1xuXHRcdFx0YWdlbnRIb3N0LnNldENoYW5nZXNldFN0YXRlKGtleSwgeyBzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSwgZmlsZXM6IFsuLi5maWxlc10gfSk7XG5cdFx0XHRzZXNzaW9uLmNoYW5nZXMuZ2V0KCk7IC8vIGZvcmNlIHRoZSBkZXJpdmVkIGNoYWluIHRvIHJlY29tcHV0ZVxuXHRcdH1cblxuXHRcdGNvbnN0IHVudG91Y2hlZENoYW5nZUFmdGVyID0gc2Vzc2lvbi5jaGFuZ2VzLmdldCgpWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1bnRvdWNoZWRDaGFuZ2VBZnRlciwgdW50b3VjaGVkQ2hhbmdlQmVmb3JlLCAnYW4gdW5jaGFuZ2VkIGZpbGUgbXVzdCByZXVzZSBpdHMgY2hhbmdlIG9iamVjdCBhY3Jvc3MgYWxsIHVwZGF0ZXMnKTtcblx0fSkpO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxpQkFBaUIsYUFBYSxlQUFlO0FBQ3RELFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUF3QixpQkFBaUIsbUJBQW1CLG9CQUFxQztBQUNqRyxTQUFTLFNBQVMsaUJBQXNDLHVCQUF5QztBQUNqRyxTQUFTLFdBQVc7QUFDcEIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUE4RztBQUN2SCxTQUFTLHFDQUFxQyx5QkFBeUI7QUFHdkUsU0FBUyxxQkFBcUIsMkJBQTJCLGtCQUFrQix3QkFBd0IsNkJBQTZCLHlCQUF5QixtQkFBbUIsaUJBQWlCLGFBQWEsd0JBQXFOO0FBQy9aLFNBQVMs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QUVqQyxVQUFJLFVBQVU7QUFDZCxlQUFTLElBQUksR0FBRyxJQUFJLFlBQVksS0FBSztBQUNwQyxZQUFJLEtBQUssQ0FBQyxNQUFNLFNBQVMsQ0FBQyxHQUFHO0FBQzVCO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFFQSxhQUFPLFlBQVksU0FBUyxHQUFHLFVBQVUsTUFBTSxzREFBc0QsT0FBTyxPQUFPLFVBQVUsT0FBTztBQUNwSSxpQkFBVztBQUFBLElBQ1o7QUFBQSxFQUNELENBQUMsQ0FBQztBQU1GLE9BQUsseUZBQXlGLE1BQU0sbUJBQXlCLEVBQUUsZUFBZSxNQUFNLGNBQWMsSUFBTSxHQUFHLFlBQVk7QUFDdEwsVUFBTSxXQUFXLGVBQWUsYUFBYSxXQUFXLFFBQVcsRUFBRSxjQUFjLENBQUM7QUFDcEYsVUFBTSxVQUFVLGNBQWMsVUFBVSxRQUFRO0FBQ2hELGtCQUFjLElBQUksV0FBVyxRQUFRLEdBQUcsTUFBUztBQUVqRCxVQUFNLGFBQWE7QUFDbkIsVUFBTSxlQUFlO0FBQ3JCLFVBQU0sTUFBTSxvQkFBb0IsUUFBUTtBQUV4QyxVQUFNLFFBQWlDLENBQUM7QUFDeEMsYUFBUyxJQUFJLEdBQUcsSUFBSSxZQUFZLEtBQUs7QUFDcEMsWUFBTSxLQUFLLGtCQUFrQixHQUFHLENBQUMsQ0FBQztBQUFBLElBQ25DO0FBQ0EsY0FBVSxrQkFBa0IsS0FBSyxFQUFFLFFBQVEsZ0JBQWdCLE9BQU8sT0FBTyxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFHckYsVUFBTSx3QkFBd0IsUUFBUSxRQUFRLElBQUksRUFBRSxDQUFDO0FBQ3JELFdBQU8sR0FBRyx1QkFBdUIsOERBQThEO0FBRS9GLFVBQU0sWUFBWSxhQUFhO0FBQy9CLGFBQVMsU0FBUyxHQUFHLFNBQVMsY0FBYyxVQUFVO0FBQ3JELFlBQU0sU0FBUyxJQUFJLGtCQUFrQixXQUFXLFNBQVMsQ0FBQztBQUMxRCxnQkFBVSxrQkFBa0IsS0FBSyxFQUFFLFFBQVEsZ0JBQWdCLE9BQU8sT0FBTyxDQUFDLEdBQUcsS0FBSyxFQUFFLENBQUM7QUFDckYsY0FBUSxRQUFRLElBQUk7QUFBQSxJQUNyQjtBQUVBLFVBQU0sdUJBQXVCLFFBQVEsUUFBUSxJQUFJLEVBQUUsQ0FBQztBQUNwRCxXQUFPLFlBQVksc0JBQXNCLHVCQUF1QixtRUFBbUU7QUFBQSxFQUNwSSxDQUFDLENBQUM7QUFDSCxDQUFDOyIsCiAgIm5hbWVzIjogWyJzZXNzaW9uIl0KfQo=
