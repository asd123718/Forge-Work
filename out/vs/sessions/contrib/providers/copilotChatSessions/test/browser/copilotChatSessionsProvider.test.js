import assert from "assert";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../../base/common/event.js";
import { timeout } from "../../../../../../base/common/async.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../../base/common/lifecycle.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { mock } from "../../../../../../base/test/common/mock.js";
import { autorun, constObservable, observableValue } from "../../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { IConfigurationService } from "../../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ICommandService } from "../../../../../../platform/commands/common/commands.js";
import { IContextKeyService } from "../../../../../../platform/contextkey/common/contextkey.js";
import { IDialogService, IFileDialogService } from "../../../../../../platform/dialogs/common/dialogs.js";
import { TestInstantiationService } from "../../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IInstantiationService } from "../../../../../../platform/instantiation/common/instantiation.js";
import { ExtensionIdentifier } from "../../../../../../platform/extensions/common/extensions.js";
import { TestStorageService } from "../../../../../../workbench/test/common/workbenchTestServices.js";
import { IStorageService } from "../../../../../../platform/storage/common/storage.js";
import { IAgentSessionsService } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js";
import { AgentSessionProviders } from "../../../../../../workbench/contrib/chat/browser/agentSessions/agentSessions.js";
import { IChatService } from "../../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { ChatSessionStatus, IChatSessionsService, SessionType } from "../../../../../../workbench/contrib/chat/common/chatSessionsService.js";
import { IChatWidgetService } from "../../../../../../workbench/contrib/chat/browser/chat.js";
import { ILanguageModelsService } from "../../../../../../workbench/contrib/chat/common/languageModels.js";
import { ILanguageModelToolsService } from "../../../../../../workbench/contrib/chat/common/tools/languageModelToolsService.js";
import { IGitService } from "../../../../../../workbench/contrib/git/common/gitService.js";
import { GITHUB_REMOTE_FILE_SCHEME, SessionStatus } from "../../../../../services/sessions/common/session.js";
import { ChatConfiguration, ChatPermissionLevel } from "../../../../../../workbench/contrib/chat/common/constants.js";
import { CopilotChatSessionsProvider, COPILOT_PROVIDER_ID, CopilotCloudSessionType } from "../../browser/copilotChatSessionsProvider.js";
import { ILogService, NullLogService } from "../../../../../../platform/log/common/log.js";
import { ILabelService } from "../../../../../../platform/label/common/label.js";
import { IUriIdentityService } from "../../../../../../platform/uriIdentity/common/uriIdentity.js";
import { extUri } from "../../../../../../base/common/resources.js";
import { CopilotCLISessionType } from "../../../agentHost/browser/baseAgentHostSessionsProvider.js";
import { IAgentHostEnablementService } from "../../../../../../platform/agentHost/common/agentHostEnablementService.js";
import { MockContextKeyService } from "../../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IGitHubService } from "../../../../github/browser/githubService.js";
import { IPullRequestIconCache } from "../../../../github/browser/pullRequestIconCache.js";
import { computePullRequestIcon, GitHubPullRequestState } from "../../../../github/common/types.js";
function createMockAgentSession(resource, opts) {
  const providerType = opts?.providerType ?? AgentSessionProviders.Background;
  let archived = opts?.archived ?? false;
  let read = opts?.read ?? true;
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.resource = resource;
      this.providerType = providerType;
      this.providerLabel = "Copilot";
      this.label = opts?.title ?? "Test Session";
      this.status = opts?.status ?? ChatSessionStatus.Completed;
      this.icon = Codicon.copilot;
      this.timing = { created: opts?.createdAt ?? Date.now(), lastRequestStarted: void 0, lastRequestEnded: void 0 };
      this.metadata = opts?.metadata ?? { repositoryPath: "/test/repo" };
    }
    isArchived() {
      return archived;
    }
    setArchived(value) {
      archived = value;
    }
    isPinned() {
      return false;
    }
    setPinned() {
    }
    isRead() {
      return read;
    }
    isMarkedUnread() {
      return false;
    }
    setRead(value) {
      read = value;
      opts?.onSetRead?.();
    }
  }();
}
class MockAgentSessionsModel {
  constructor() {
    this._sessions = [];
    this._onDidChangeSessions = new Emitter();
    this.onDidChangeSessions = this._onDidChangeSessions.event;
    this.onWillResolve = Event.None;
    this.onDidResolve = Event.None;
    this.onDidChangeSessionArchivedState = Event.None;
    this.resolved = true;
  }
  get sessions() {
    return [...this._sessions];
  }
  getSession(resource) {
    return this._sessions.find((s) => s.resource.toString() === resource.toString());
  }
  addSession(session) {
    this._sessions.push(session);
    this._onDidChangeSessions.fire();
  }
  removeSession(resource) {
    const idx = this._sessions.findIndex((s) => s.resource.toString() === resource.toString());
    if (idx !== -1) {
      this._sessions.splice(idx, 1);
      this._onDidChangeSessions.fire();
    }
  }
  replaceSession(session) {
    const idx = this._sessions.findIndex((s) => s.resource.toString() === session.resource.toString());
    assert.ok(idx >= 0, "session should exist before replacing");
    this._sessions.splice(idx, 1, session);
    this._onDidChangeSessions.fire();
  }
  fireDidChangeSessions() {
    this._onDidChangeSessions.fire();
  }
  async resolve() {
  }
  dispose() {
    this._onDidChangeSessions.dispose();
  }
}
function isCommandSessionItem(item) {
  return typeof item === "object" && item !== null && "resource" in item && URI.isUri(item.resource);
}
class TestPullRequestIconCache {
  constructor() {
    this._icons = /* @__PURE__ */ new Map();
  }
  get(prLink) {
    return this._icons.get(prLink);
  }
  set(prLink, icon) {
    this._icons.set(prLink, icon);
  }
}
class TestGitHubService extends mock() {
  constructor(_pullRequestNumber) {
    super();
    this._pullRequestNumber = _pullRequestNumber;
    this._pullRequest = observableValue(this, void 0);
    this.lookupCalls = 0;
    this.pullRequestModelReferenceCalls = 0;
    this.findPullRequestNumberByHeadBranch = async () => {
      this.lookupCalls++;
      return this._pullRequestNumber;
    };
    this.createPullRequestModelReference = () => {
      this.pullRequestModelReferenceCalls++;
      return new ImmortalReference(this._pullRequestModel);
    };
    const pullRequest = this._pullRequest;
    this._pullRequestModel = new class extends mock() {
      constructor() {
        super(...arguments);
        this.pullRequest = pullRequest;
      }
    }();
  }
  setPullRequest(pullRequest) {
    this._pullRequest.set(pullRequest, void 0);
  }
}
function createPullRequest(state, isDraft = false) {
  return {
    number: 42,
    title: "Cloud PR",
    body: "",
    state,
    author: { login: "owner", avatarUrl: "" },
    headRef: "feature",
    headSha: "head",
    baseRef: "main",
    isDraft,
    createdAt: "",
    updatedAt: "",
    mergedAt: state === GitHubPullRequestState.Merged ? "" : void 0,
    mergeable: void 0,
    mergeableState: ""
  };
}
function createProvider(disposables, model, opts) {
  return createProviderWithConfig(disposables, model, opts).provider;
}
function createProviderWithConfig(disposables, model, opts) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const configService = new TestConfigurationService();
  configService.setUserConfiguration("sessions.github.copilot.multiChatSessions", opts?.multiChatEnabled ?? true);
  const agentHostEnabled = observableValue("agentHostEnabled", opts?.agentHostEnabled ?? true);
  instantiationService.stub(IConfigurationService, configService);
  instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: agentHostEnabled });
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, {
    confirm: async () => ({ confirmed: true })
  });
  instantiationService.stub(ICommandService, {
    executeCommand: async (id, ...args) => {
      opts?.commandExecutions?.push({ id, args });
      const items = args[0];
      if (Array.isArray(items)) {
        for (const item of items) {
          if (isCommandSessionItem(item)) {
            model.removeSession(item.resource);
          }
        }
      } else if (isCommandSessionItem(items)) {
        model.removeSession(items.resource);
      }
      return void 0;
    }
  });
  instantiationService.stub(IAgentSessionsService, {
    model,
    onDidChangeSessionArchivedState: Event.None,
    getSession: (resource) => model.getSession(resource)
  });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: () => ({ type: "test-copilot", name: "test", displayName: "Test", description: "test", icon: void 0 }),
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } }),
    onDidCommitSession: Event.None,
    updateSessionOptions: () => true,
    setSessionOption: () => true,
    getSessionOption: () => void 0,
    getOptionGroupsForSessionType: () => opts?.getOptionGroups?.(),
    onDidChangeOptionGroups: Event.None
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: async () => void 0,
    sendRequest: async () => ({ kind: "sent", data: {} }),
    removeHistoryEntry: async (resource) => {
      model.removeSession(resource);
    },
    setChatSessionTitle: () => {
    }
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => void 0,
    lastFocusedWidget: void 0,
    onDidChangeFocusedSession: Event.None
  });
  instantiationService.stub(ILanguageModelsService, opts?.languageModelsService ?? { lookupLanguageModel: () => void 0 });
  instantiationService.stub(ILanguageModelToolsService, {
    toToolReferences: () => []
  });
  instantiationService.stub(IInstantiationService, instantiationService);
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IGitHubService, opts?.gitHubService ?? new TestGitHubService());
  instantiationService.stub(IPullRequestIconCache, opts?.pullRequestIconCache ?? new TestPullRequestIconCache());
  const provider = disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
  return { provider, configService, agentHostEnabled };
}
function createProviderForSendTests(disposables, model, sendRequest, opts) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const configService = opts?.configurationService ?? new TestConfigurationService();
  configService.setUserConfiguration("sessions.github.copilot.multiChatSessions", true);
  instantiationService.stub(ILogService, NullLogService);
  instantiationService.stub(IConfigurationService, configService);
  instantiationService.stub(IStorageService, disposables.add(new TestStorageService()));
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IDialogService, {
    confirm: async () => ({ confirmed: true })
  });
  instantiationService.stub(ICommandService, { executeCommand: async () => void 0 });
  instantiationService.stub(IAgentSessionsService, {
    model,
    onDidChangeSessionArchivedState: Event.None,
    getSession: (resource) => model.getSession(resource)
  });
  instantiationService.stub(IChatSessionsService, {
    getChatSessionContribution: () => ({ type: "test-copilot", name: "test", displayName: "Test", description: "test", icon: void 0 }),
    getOrCreateChatSession: async () => ({ onWillDispose: () => ({ dispose() {
    } }), sessionResource: URI.from({ scheme: "test" }), history: [], dispose() {
    } }),
    onDidCommitSession: opts?.onDidCommitSession ?? Event.None,
    getOptionGroupsForSessionType: () => void 0,
    updateSessionOptions: () => true,
    setSessionOption: () => true,
    getSessionOption: () => void 0,
    onDidChangeOptionGroups: Event.None
  });
  instantiationService.stub(IChatService, {
    acquireOrLoadSession: async () => void 0,
    sendRequest,
    removeHistoryEntry: async (resource) => {
      model.removeSession(resource);
    },
    setChatSessionTitle: () => {
    }
  });
  instantiationService.stub(IChatWidgetService, {
    openSession: async () => new class extends mock() {
      constructor() {
        super(...arguments);
        this.input = new class extends mock() {
          constructor() {
            super(...arguments);
            this.setPermissionLevel = () => {
            };
          }
        }();
      }
    }(),
    lastFocusedWidget: void 0,
    onDidChangeFocusedSession: Event.None
  });
  instantiationService.stub(ILanguageModelsService, { lookupLanguageModel: () => void 0 });
  instantiationService.stub(ILanguageModelToolsService, { toToolReferences: () => [] });
  instantiationService.stub(IGitService, { openRepository: async () => void 0 });
  instantiationService.stub(IInstantiationService, instantiationService);
  instantiationService.stub(ILabelService, {
    getUriLabel: (uri) => uri.path
  });
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IAgentHostEnablementService, { _serviceBrand: void 0, enabled: constObservable(opts?.agentHostEnabled ?? true) });
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IGitHubService, new TestGitHubService());
  instantiationService.stub(IPullRequestIconCache, new TestPullRequestIconCache());
  return disposables.add(instantiationService.createInstance(CopilotChatSessionsProvider));
}
suite("CopilotChatSessionsProvider", () => {
  const disposables = new DisposableStore();
  let model;
  setup(() => {
    model = new MockAgentSessionsModel();
    disposables.add(toDisposable(() => model.dispose()));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("has correct id and label", () => {
    const provider = createProvider(disposables, model);
    assert.strictEqual(provider.id, COPILOT_PROVIDER_ID);
    assert.strictEqual(provider.sessionTypes.length, 1);
  });
  test("sessionTypes excludes Local", () => {
    const provider = createProvider(disposables, model);
    assert.ok(!provider.sessionTypes.some((type) => type.id === SessionType.Local));
  });
  test("sessionTypes excludes Extension Host Copilot CLI when Agent Host is available", () => {
    const provider = createProvider(disposables, model);
    assert.ok(!provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("sessionTypes includes Extension Host Copilot CLI when Agent Host is unavailable", () => {
    const provider = createProvider(disposables, model, { agentHostEnabled: false });
    assert.ok(provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id));
  });
  test("Agent Host availability is observed in both directions after the provider is created", () => {
    const { provider, agentHostEnabled } = createProviderWithConfig(disposables, model, { agentHostEnabled: false });
    let changeCount = 0;
    disposables.add(provider.onDidChangeSessionTypes(() => changeCount++));
    const visibleBeforeAvailability = provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id);
    agentHostEnabled.set(true, void 0);
    const visibleWhileAvailable = provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id);
    agentHostEnabled.set(false, void 0);
    assert.deepStrictEqual({
      visibleBeforeAvailability,
      visibleWhileAvailable,
      visibleAfterDisablement: provider.sessionTypes.some((t) => t.id === CopilotCLISessionType.id),
      changeCount
    }, {
      visibleBeforeAvailability: true,
      visibleWhileAvailable: false,
      visibleAfterDisablement: true,
      changeCount: 2
    });
  });
  test("getSessionTypes returns only Cloud for a remote workspace", () => {
    const provider = createProvider(disposables, model);
    const types = provider.getSessionTypes(URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repo" }));
    assert.strictEqual(types.length, 1);
  });
  test("getSessions returns empty array initially", () => {
    const provider = createProvider(disposables, model);
    assert.strictEqual(provider.getSessions().length, 0);
  });
  test("getSessions returns adapted sessions from agent model", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  });
  test("getSessions does not emit session changes while reading the initial cache", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model, { agentHostEnabled: false });
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const sessions = provider.getSessions();
    assert.deepStrictEqual({ sessionCount: sessions.length, changes }, { sessionCount: 1, changes: [] });
  });
  test("getSessions excludes Local sessions", () => {
    const bgResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/bg-session" });
    const localResource = URI.from({ scheme: AgentSessionProviders.Local, path: "/local-session" });
    model.addSession(createMockAgentSession(bgResource));
    model.addSession(createMockAgentSession(localResource, { providerType: AgentSessionProviders.Local }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
  });
  test("getSessions excludes Claude extension-host sessions", () => {
    const claudeResource = URI.from({ scheme: "claude-code", path: "/claude-session" });
    model.addSession(createMockAgentSession(claudeResource, { providerType: "claude-code" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 0);
  });
  test("onDidChangeSessions fires when agent model changes", () => {
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/new-session" });
    model.addSession(createMockAgentSession(resource, { title: "New Session" }));
    assert.ok(changes.length > 0);
    assert.strictEqual(changes[0].added.length, 1);
  });
  test("onDidChangeSessions does not fire when cached agent session is unchanged", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/existing-session" });
    model.addSession(createMockAgentSession(resource, { title: "Existing Session", createdAt: 1 }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.fireDidChangeSessions();
    assert.deepStrictEqual(changes, []);
  });
  test("onDidChangeSessions fires changed session when cached agent session changes", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/existing-session" });
    model.addSession(createMockAgentSession(resource, { title: "Existing Session", createdAt: 1 }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.replaceSession(createMockAgentSession(resource, { title: "Updated Session", createdAt: 1 }));
    assert.deepStrictEqual(changes.map((e) => ({
      added: e.added.length,
      removed: e.removed.length,
      changed: e.changed.map((session) => session.title.get())
    })), [{
      added: 0,
      removed: 0,
      changed: ["Updated Session"]
    }]);
  });
  test("marks a session unread when its turn completes (InProgress \u2192 terminal)", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/turn-session" });
    model.addSession(createMockAgentSession(resource, { title: "Turn Session", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    model.replaceSession(createMockAgentSession(resource, { title: "Turn Session", createdAt: 1, status: ChatSessionStatus.Completed, read: true, onSetRead: () => model.fireDidChangeSessions() }));
    assert.strictEqual(provider.getSessions()[0].isRead.get(), false);
  });
  test("does not mark unread when status stays in progress", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/still-running" });
    model.addSession(createMockAgentSession(resource, { title: "Running", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    model.replaceSession(createMockAgentSession(resource, { title: "Running (updated)", createdAt: 1, status: ChatSessionStatus.InProgress, read: true }));
    assert.strictEqual(provider.getSessions()[0].isRead.get(), true);
  });
  test("setSessionReadState clears unread across every chat in the group", async () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const childResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session" });
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 1, read: true, onSetRead: () => model.fireDidChangeSessions() }));
    model.addSession(createMockAgentSession(childResource, {
      title: "Child",
      createdAt: 2,
      read: false,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" },
      onSetRead: () => model.fireDidChangeSessions()
    }));
    const provider = createProvider(disposables, model);
    const session = provider.getSessions()[0];
    const readBefore = session.isRead.get();
    await provider.setSessionReadState(session.sessionId, true);
    assert.deepStrictEqual({
      readBefore,
      readAfter: provider.getSessions()[0].isRead.get()
    }, {
      readBefore: false,
      readAfter: true
    });
  });
  test("cloud models resolve arbitrary restored ids with option groups", () => {
    const modelsState = { optionGroups: void 0 };
    const provider = createProvider(disposables, model, { getOptionGroups: () => modelsState.optionGroups });
    const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repository" });
    const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
    const beforeResolve = provider.getModelsSnapshot(session.sessionId, "removed-cloud-model");
    modelsState.optionGroups = [{
      id: "models",
      name: "Models",
      items: [{ id: "synthetic-cloud-model", name: "Synthetic Cloud Model" }]
    }];
    const afterResolve = provider.getModelsSnapshot(session.sessionId, "removed-cloud-model");
    assert.deepStrictEqual({
      beforeResolve: { models: beforeResolve.models.map((model2) => model2.identifier), desiredModelResolution: beforeResolve.desiredModelResolution, modelTarget: beforeResolve.modelTarget },
      afterResolve: { models: afterResolve.models.map((model2) => model2.identifier), desiredModelResolution: afterResolve.desiredModelResolution, modelTarget: afterResolve.modelTarget }
    }, {
      beforeResolve: { models: [], desiredModelResolution: { kind: "pending", identifier: "removed-cloud-model" }, modelTarget: AgentSessionProviders.Cloud },
      afterResolve: { models: ["synthetic-cloud-model"], desiredModelResolution: { kind: "unavailable", identifier: "removed-cloud-model" }, modelTarget: AgentSessionProviders.Cloud }
    });
  });
  test("Copilot CLI keeps an empty Copilot catalog pending until live models arrive", () => {
    const models = /* @__PURE__ */ new Map();
    const provider = createProvider(disposables, model, {
      languageModelsService: {
        getLanguageModelIds: () => [...models.keys()],
        lookupLanguageModel: (identifier) => models.get(identifier),
        hasResolvedVendor: () => true
      }
    });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const empty = provider.getModelsSnapshot(session.sessionId, "copilot/remembered");
    models.set("copilot/other", {
      extension: new ExtensionIdentifier("test.extension"),
      id: "other",
      name: "Other",
      vendor: "copilot",
      version: "1.0",
      family: "other",
      maxInputTokens: 1,
      maxOutputTokens: 1,
      isUserSelectable: true,
      isDefaultForLocation: {},
      targetChatSessionType: CopilotCLISessionType.id
    });
    const live = provider.getModelsSnapshot(session.sessionId, "copilot/remembered");
    assert.deepStrictEqual({
      empty: { resolution: empty.desiredModelResolution, modelTarget: empty.modelTarget },
      live: { resolution: live.desiredModelResolution, modelTarget: live.modelTarget }
    }, {
      empty: { resolution: { kind: "pending", identifier: "copilot/remembered" }, modelTarget: CopilotCLISessionType.id },
      live: { resolution: { kind: "unavailable", identifier: "copilot/remembered" }, modelTarget: CopilotCLISessionType.id }
    });
  });
  test("Copilot CLI session maps workspace selection to Agent Host folder config", async () => {
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }));
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("workspace");
    assert.strictEqual(providerSession.isolationMode.get(), "workspace");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "folder" });
    providerSession.dispose();
  });
  test("Copilot CLI session maps worktree selection to Agent Host config", async () => {
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }));
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "worktree", branch: "main" });
    providerSession.dispose();
  });
  test("Copilot CLI session forwards git.branchPrefix as worktreeBranchPrefix for worktree isolation", async () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.branchPrefix", "users/alice/");
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }), { configurationService: configService });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), { isolation: "worktree", branch: "main", worktreeBranchPrefix: "users/alice/" });
    providerSession.dispose();
  });
  test("Copilot CLI session forwards git.worktreeIncludeFiles for worktree isolation", async () => {
    const configService = new TestConfigurationService();
    configService.setUserConfiguration("git.worktreeIncludeFiles", ["product.overrides.json", "**/node_modules/**"]);
    const provider = createProviderForSendTests(disposables, model, async () => ({ kind: "sent", data: {} }), { configurationService: configService });
    const session = provider.createNewSession(URI.file("/test/project"), CopilotCLISessionType.id);
    const providerSession = provider.getSession(session.sessionId);
    providerSession.setIsolationMode("worktree");
    providerSession.setBranch("main");
    assert.deepStrictEqual(providerSession.getAgentHostSessionConfig(), {
      isolation: "worktree",
      branch: "main",
      worktreeIncludeFiles: ["product.overrides.json", "**/node_modules/**"]
    });
    providerSession.dispose();
  });
  test("archiveSession sets archived state", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const agentSession = createMockAgentSession(resource);
    model.addSession(agentSession);
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const session = provider.getSessions()[0];
    provider.archiveSession(session.sessionId);
    assert.strictEqual(agentSession.isArchived(), true);
  });
  test("unarchiveSession clears archived state", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const agentSession = createMockAgentSession(resource, { archived: true });
    model.addSession(agentSession);
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const session = provider.getSessions()[0];
    provider.unarchiveSession(session.sessionId);
    assert.strictEqual(agentSession.isArchived(), false);
  });
  test("copilot CLI sessions have supportsMultipleChats capability", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, true);
  });
  test("copilot cloud sessions do not have supportsMultipleChats capability", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
  });
  test("cloud session reports the provider pull request and uses the cached icon while live data loads", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(7);
    const iconCache = new TestPullRequestIconCache();
    const prUri = URI.parse("https://github.com/owner/repo/pull/42");
    const cachedIcon = computePullRequestIcon(GitHubPullRequestState.Merged);
    iconCache.set(prUri.toString(), cachedIcon);
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "wrong-owner",
        name: "wrong-repo",
        branch: "feature",
        pullRequestNumber: 7,
        pullRequestUrl: prUri.toString(),
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
    const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString(),
        icon: gitHubInfo.pullRequest.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls
    }, {
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: prUri.toString(),
        icon: cachedIcon
      },
      lookupCalls: 0,
      pullRequestModelReferenceCalls: 1
    });
  });
  test("cloud session accepts pull request URL-only metadata without creating an invalid workspace URI", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService();
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        pullRequestUrl: "https://github.com/owner/repo/pull/42",
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const workspace = provider.getSessions()[0].workspace.get();
    const gitHubInfo = workspace?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      workspaceRoot: workspace?.folders[0]?.root.toString(),
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString()
      }
    }, {
      workspaceRoot: URI.parse("unknown:///").toString(),
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42"
      }
    });
  });
  test("cloud session keeps provider-reported enterprise PR identity without public GitHub polling", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(7);
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "wrong-owner",
        name: "wrong-repo",
        host: "github.example.com",
        branch: "feature",
        pullRequestNumber: 7,
        pullRequestUrl: "https://github.example.com/owner/repo/pull/42",
        pullRequestState: GitHubPullRequestState.Open
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfo = provider.getSessions()[0].workspace.get()?.folders[0]?.gitRepository?.gitHubInfo.get();
    assert.deepStrictEqual({
      owner: gitHubInfo?.owner,
      repo: gitHubInfo?.repo,
      pullRequest: gitHubInfo?.pullRequest && {
        number: gitHubInfo.pullRequest.number,
        uri: gitHubInfo.pullRequest.uri.toString(),
        icon: gitHubInfo.pullRequest.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      pullRequestModelReferenceCalls: gitHubService.pullRequestModelReferenceCalls
    }, {
      owner: "owner",
      repo: "repo",
      pullRequest: {
        number: 42,
        uri: "https://github.example.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Open)
      },
      lookupCalls: 0,
      pullRequestModelReferenceCalls: 0
    });
  });
  test("cloud session infers a provider-omitted pull request from its branch and updates the live icon", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService(42);
    const iconCache = new TestPullRequestIconCache();
    model.addSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService, pullRequestIconCache: iconCache });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    const firstObservation = disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    const beforeLiveUpdate = gitHubInfoObs.get()?.pullRequest;
    gitHubService.setPullRequest(createPullRequest(GitHubPullRequestState.Merged));
    const afterLiveUpdate = gitHubInfoObs.get()?.pullRequest;
    firstObservation.dispose();
    let firstReobservedNumber;
    let captured = false;
    const secondObservation = autorun((reader) => {
      const pullRequestNumber = gitHubInfoObs.read(reader)?.pullRequest?.number;
      if (!captured) {
        firstReobservedNumber = pullRequestNumber;
        captured = true;
      }
    });
    disposables.add(secondObservation);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      title: "Updated Cloud Session",
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    assert.deepStrictEqual({
      beforeLiveUpdate: beforeLiveUpdate && {
        number: beforeLiveUpdate.number,
        uri: beforeLiveUpdate.uri.toString(),
        icon: beforeLiveUpdate.icon
      },
      afterLiveUpdate: afterLiveUpdate && {
        number: afterLiveUpdate.number,
        uri: afterLiveUpdate.uri.toString(),
        icon: afterLiveUpdate.icon
      },
      lookupCalls: gitHubService.lookupCalls,
      cachedIcon: iconCache.get("https://github.com/owner/repo/pull/42"),
      firstReobservedNumber,
      numberAfterUpdate: gitHubInfoObs.get()?.pullRequest?.number
    }, {
      beforeLiveUpdate: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Open)
      },
      afterLiveUpdate: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42",
        icon: computePullRequestIcon(GitHubPullRequestState.Merged)
      },
      lookupCalls: 1,
      cachedIcon: computePullRequestIcon(GitHubPullRequestState.Merged),
      firstReobservedNumber: 42,
      numberAfterUpdate: 42
    });
  });
  test("cloud session waits for provider PR metadata after an unsuccessful branch lookup without polling on unrelated updates", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    const gitHubService = new TestGitHubService();
    const metadata = {
      owner: "owner",
      name: "repo",
      branch: "feature"
    };
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud, metadata }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      title: "Updated Cloud Session",
      metadata
    }));
    await timeout(0);
    model.replaceSession(createMockAgentSession(resource, {
      providerType: AgentSessionProviders.Cloud,
      metadata: {
        ...metadata,
        pullRequestUrl: "https://github.com/owner/repo/pull/42"
      }
    }));
    assert.deepStrictEqual({
      lookupCalls: gitHubService.lookupCalls,
      pullRequest: gitHubInfoObs.get()?.pullRequest && {
        number: gitHubInfoObs.get().pullRequest.number,
        uri: gitHubInfoObs.get().pullRequest.uri.toString()
      }
    }, {
      lookupCalls: 1,
      pullRequest: {
        number: 42,
        uri: "https://github.com/owner/repo/pull/42"
      }
    });
  });
  test("non-cloud sessions do not infer pull requests from branch metadata", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const gitHubService = new TestGitHubService(42);
    model.addSession(createMockAgentSession(resource, {
      metadata: {
        owner: "owner",
        name: "repo",
        branch: "feature"
      }
    }));
    const provider = createProvider(disposables, model, { gitHubService });
    const gitHubInfoObs = provider.getSessions()[0].workspace.get().folders[0].gitRepository.gitHubInfo;
    disposables.add(autorun((reader) => gitHubInfoObs.read(reader)));
    await timeout(0);
    assert.deepStrictEqual({
      lookupCalls: gitHubService.lookupCalls,
      pullRequest: gitHubInfoObs.get()?.pullRequest
    }, {
      lookupCalls: 0,
      pullRequest: void 0
    });
  });
  test("copilot CLI sessions do not have supportsMultipleChats when setting is disabled", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model, { multiChatEnabled: false });
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].capabilities.get().supportsMultipleChats, false);
  });
  test("each session has exactly one chat initially", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].chats.get().length, 1);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
  });
  test("setModel applies to existing sessions and their new chats", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const session = provider.getSessions()[0];
    provider.setModel(session.sessionId, "copilot/gpt-4o");
    assert.strictEqual(session.modelId.get(), "copilot/gpt-4o");
    const chat = await provider.createNewChat(session.sessionId);
    try {
      assert.strictEqual(chat.modelId.get(), "copilot/gpt-4o");
    } finally {
      await provider.deleteChat(session.sessionId, chat.resource);
    }
  });
  test("sendRequest throws for unknown session", async () => {
    const provider = createProvider(disposables, model);
    await assert.rejects(
      () => provider.sendRequest("nonexistent", URI.parse("untitled:chat"), { query: "test" }),
      /not found/
    );
  });
  test("getSessions groups chats by session group", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
  });
  test("groups committed chats using metadata.sessionParentId", () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const child1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session-1" });
    const child2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/child-session-2" });
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 1 }));
    model.addSession(createMockAgentSession(child1Resource, {
      title: "Child 1",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    model.addSession(createMockAgentSession(child2Resource, {
      title: "Child 2",
      createdAt: 3,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].chats.get().length, 3);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), rootResource.toString());
  });
  test("orders chats within a grouped session by createdAt", () => {
    const rootResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-session" });
    const olderChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/older-child" });
    const newerChildResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/newer-child" });
    model.addSession(createMockAgentSession(newerChildResource, {
      title: "Newer Child",
      createdAt: 30,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    model.addSession(createMockAgentSession(rootResource, { title: "Root", createdAt: 10 }));
    model.addSession(createMockAgentSession(olderChildResource, {
      title: "Older Child",
      createdAt: 20,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [rootResource.toString(), olderChildResource.toString(), newerChildResource.toString()]
    );
  });
  test("groups child sessions even when the parent/root session is missing", () => {
    const orphan1Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/orphan-child-1" });
    const orphan2Resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/orphan-child-2" });
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.addSession(createMockAgentSession(orphan1Resource, {
      title: "Orphan Child 1",
      createdAt: 1,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    model.addSession(createMockAgentSession(orphan2Resource, {
      title: "Orphan Child 2",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [orphan1Resource.toString(), orphan2Resource.toString()]
    );
    assert.deepStrictEqual(changes.map((e) => ({ added: e.added.length, changed: e.changed.length })), [
      { added: 1, changed: 0 },
      { added: 0, changed: 1 }
    ]);
  });
  test("groups nested parent chains under the ultimate root", () => {
    const middleResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/middle-session" });
    const leafResource = URI.from({ scheme: AgentSessionProviders.Background, path: "/leaf-session" });
    model.addSession(createMockAgentSession(middleResource, {
      title: "Middle Session",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "missing-root" }
    }));
    model.addSession(createMockAgentSession(leafResource, {
      title: "Leaf Session",
      createdAt: 3,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "middle-session" }
    }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.deepStrictEqual(
      sessions[0].chats.get().map((chat) => chat.resource.toString()),
      [middleResource.toString(), leafResource.toString()]
    );
  });
  test("session title comes from primary (first) chat", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { title: "Primary Title" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].title.get(), "Primary Title");
  });
  test("session has mainChat set to the first chat", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.ok(sessions[0].mainChat);
    assert.strictEqual(sessions[0].mainChat.get().resource.toString(), resource.toString());
  });
  test("deleteSession removes session from model and list", async () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    await provider.deleteSession(sessions[0].sessionId);
    const remainingSessions = provider.getSessions();
    assert.strictEqual(remainingSessions.length, 1);
    assert.strictEqual(remainingSessions[0].title.get(), "Session 2");
  });
  test("deleteSession passes Copilot CLI session label to delete command", async () => {
    const resource = URI.from({ scheme: CopilotCLISessionType.id, path: "/session-1" });
    const commandExecutions = [];
    model.addSession(createMockAgentSession(resource, { providerType: CopilotCLISessionType.id, title: "Fix Build" }));
    const provider = createProvider(disposables, model, { commandExecutions });
    const sessions = provider.getSessions();
    await provider.deleteSession(sessions[0].sessionId);
    assert.deepStrictEqual(commandExecutions.map((command) => ({
      id: command.id,
      items: Array.isArray(command.args[0]) ? command.args[0].map((item) => isCommandSessionItem(item) ? { resource: item.resource.toString(), label: item.label } : void 0) : void 0,
      options: command.args[1]
    })), [{
      id: "agents.github.copilot.cli.deleteSessions",
      items: [{ resource: resource.toString(), label: "Fix Build" }],
      options: { skipConfirmation: true }
    }]);
  });
  test("deleteChat with single chat delegates to deleteSession", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const session = sessions[0];
    await provider.deleteChat(session.sessionId, resource);
    assert.strictEqual(model.sessions.length, 0);
  });
  test("deleteChat throws when session does not support multi-chat", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const session = sessions[0];
    await assert.rejects(
      () => provider.deleteChat(session.sessionId, resource),
      /not supported when multi-chat is disabled/
    );
  });
  test("session group cache is invalidated on session removal", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    let sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    model.removeSession(resource1);
    sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 1);
    assert.strictEqual(sessions[0].title.get(), "Session 2");
  });
  test("chats observable updates when group model changes", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    const session1 = sessions[0];
    assert.strictEqual(session1.chats.get().length, 1);
  });
  test("session status aggregates across chats", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.ok(sessions[0].status.get() !== void 0);
  });
  test("session isRead aggregates across all chats", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { read: true }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].isRead.get(), true);
  });
  test("session isRead is false when any chat is unread", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource, { read: false }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions[0].isRead.get(), false);
  });
  test("removing a chat from a group fires changed (not removed) with correct sessionId", async () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Chat 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Chat 2" }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, 2);
    const chat2Id = sessions[1].sessionId;
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.removeSession(resource2);
    assert.ok(changes.length > 0);
    const lastChange = changes[changes.length - 1];
    assert.strictEqual(lastChange.removed.length, 1);
    assert.strictEqual(lastChange.removed[0].sessionId, chat2Id);
  });
  test("observing many grouped sessions keeps one membership listener and recomputes only the affected group", () => {
    const sessionCount = 8;
    for (let i = 0; i < sessionCount; i++) {
      const resource = URI.from({ scheme: AgentSessionProviders.Background, path: `/root-${i}` });
      model.addSession(createMockAgentSession(resource, { title: `Root ${i}`, createdAt: 1 }));
    }
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    assert.strictEqual(sessions.length, sessionCount);
    const chatCounts = sessions.map(() => 0);
    sessions.forEach((session, i) => {
      disposables.add(autorun((reader) => {
        session.chats.read(reader);
        chatCounts[i]++;
      }));
    });
    const membershipEmitter = provider._onDidGroupMembershipChange;
    assert.strictEqual(membershipEmitter._size, 1);
    assert.deepStrictEqual(chatCounts, sessions.map(() => 1));
    const child = URI.from({ scheme: AgentSessionProviders.Background, path: "/root-0-child" });
    model.addSession(createMockAgentSession(child, {
      title: "Child",
      createdAt: 2,
      metadata: { repositoryPath: "/test/repo", sessionParentId: "root-0" }
    }));
    assert.strictEqual(membershipEmitter._size, 1);
    assert.strictEqual(sessions[0].chats.get().length, 2);
    assert.deepStrictEqual(chatCounts, [2, ...sessions.slice(1).map(() => 1)]);
  });
  test("getSessions does not create duplicate groups on repeated calls", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    model.addSession(createMockAgentSession(resource));
    const provider = createProvider(disposables, model);
    const sessions1 = provider.getSessions();
    const sessions2 = provider.getSessions();
    assert.strictEqual(sessions1.length, 1);
    assert.strictEqual(sessions2.length, 1);
    assert.strictEqual(sessions1[0], sessions2[0]);
  });
  test("changed events are not duplicated when multiple chats update", () => {
    const resource1 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-1" });
    const resource2 = URI.from({ scheme: AgentSessionProviders.Background, path: "/session-2" });
    model.addSession(createMockAgentSession(resource1, { title: "Session 1" }));
    model.addSession(createMockAgentSession(resource2, { title: "Session 2" }));
    const provider = createProvider(disposables, model);
    provider.getSessions();
    const changes = [];
    disposables.add(provider.onDidChangeSessions((e) => changes.push(e)));
    model.addSession(createMockAgentSession(
      URI.from({ scheme: AgentSessionProviders.Background, path: "/session-3" }),
      { title: "Session 3" }
    ));
    for (const change of changes) {
      const changedIds = change.changed.map((s) => s.sessionId);
      const uniqueIds = new Set(changedIds);
      assert.strictEqual(changedIds.length, uniqueIds.size, "Changed events should not have duplicates");
    }
  });
  test("resolveWorkspace creates proper workspace structure", () => {
    const provider = createProvider(disposables, model);
    const uri = URI.file("/test/project");
    const workspace = provider.resolveWorkspace(uri);
    assert.ok(workspace, "resolveWorkspace should resolve file:// URIs");
    assert.strictEqual(workspace.label, "project");
    assert.strictEqual(workspace.folders.length, 1);
    assert.strictEqual(workspace.folders[0].root.toString(), uri.toString());
    assert.strictEqual(workspace.requiresWorkspaceTrust, true);
  });
  test("builds an unknown workspace fallback when repository metadata is missing", () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Background, path: "/unknown-workspace-session" });
    model.addSession(createMockAgentSession(resource, { metadata: {} }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    const workspace = sessions[0].workspace.get();
    assert.ok(workspace);
    assert.strictEqual(workspace.folders.length, 1);
    assert.strictEqual(workspace.folders[0].root.toString(), URI.parse("unknown:///").toString());
    assert.strictEqual(workspace.requiresWorkspaceTrust, true);
    assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, ".vscode", "settings.json"));
    assert.doesNotThrow(() => URI.joinPath(workspace.folders[0].root, ".vscode/extensions.json"));
  });
  test("renameChat throws for unsupported session type", async () => {
    const resource = URI.from({ scheme: AgentSessionProviders.Cloud, path: "/cloud-session" });
    model.addSession(createMockAgentSession(resource, { providerType: AgentSessionProviders.Cloud }));
    const provider = createProvider(disposables, model);
    const sessions = provider.getSessions();
    await assert.rejects(
      () => provider.renameChat(sessions[0].sessionId, resource, "New Title"),
      /not supported/
    );
  });
  suite("uncommitted temp session cleanup", () => {
    const workspace = URI.file("/test/repo");
    function makeInFlightProvider() {
      let resolveComplete;
      let resolveCreated;
      const responseCompletePromise = new Promise((r) => {
        resolveComplete = r;
      });
      const responseCreatedPromise = new Promise((r) => {
        resolveCreated = r;
      });
      const provider = createProviderForSendTests(disposables, model, async () => ({
        kind: "sent",
        data: {
          responseCompletePromise,
          responseCreatedPromise,
          agent: new class extends mock() {
          }()
        }
      }));
      return {
        provider,
        cancelRequest: () => {
          resolveCreated({ isCanceled: true });
          resolveComplete();
        }
      };
    }
    function waitForSessionAdded2(provider) {
      return new Promise((resolve) => {
        const d = provider.onDidChangeSessions((e) => {
          if (e.added.length > 0) {
            d.dispose();
            resolve();
          }
        });
      });
    }
    test("deleteSession removes a temp session that is awaiting commit", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      assert.strictEqual(provider.getSessions().length, 1, "session should appear while in-flight");
      await provider.deleteSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 0, "session should be removed after deleteSession");
      cancelRequest();
      await assert.doesNotReject(sendPromise);
    });
    test("archiveSession archives a temp session that is awaiting commit", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      assert.strictEqual(provider.getSessions().length, 1, "session should appear while in-flight");
      await provider.archiveSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 1, "session should still be in the list after archiveSession");
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, "session should be archived");
      cancelRequest();
      await assert.doesNotReject(sendPromise);
      await provider.deleteSession(sessionId);
    });
    test("archiveSession archives a stopped session that was never committed", async () => {
      const { provider, cancelRequest } = makeInFlightProvider();
      const newSession = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const sessionId = newSession.sessionId;
      const added = waitForSessionAdded2(provider);
      const chat = await provider.createNewChat(sessionId);
      const sendPromise = provider.sendRequest(sessionId, chat.resource, { query: "test" });
      await added;
      cancelRequest();
      await sendPromise;
      assert.strictEqual(provider.getSessions().length, 1, "stopped session should remain in the list");
      assert.strictEqual(provider.getSessions()[0].status.get(), SessionStatus.Completed, "session should be completed");
      await provider.archiveSession(sessionId);
      assert.strictEqual(provider.getSessions().length, 1, "session should still be in the list after archiving");
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), true, "session should be archived");
      await provider.unarchiveSession(sessionId);
      assert.strictEqual(provider.getSessions()[0].isArchived.get(), false, "session should be unarchived");
      await provider.deleteSession(sessionId);
    });
  });
  suite("new session default permission level", () => {
    const workspace = URI.file("/test/repo");
    function makeConfig(opts) {
      const config = new class extends TestConfigurationService {
        inspect(key) {
          const base = super.inspect(key);
          if (opts.policyRestricted && key === ChatConfiguration.GlobalAutoApprove) {
            return { ...base, policyValue: false };
          }
          return base;
        }
      }();
      if (opts.defaultLevel) {
        config.setUserConfiguration(ChatConfiguration.DefaultPermissionLevel, opts.defaultLevel);
      }
      return config;
    }
    test("CLI session seeds permission level from chat.permissions.default", () => {
      const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot });
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Autopilot);
    });
    test("clamps to Default when chat.tools.global.autoApprove policy is false", () => {
      const configurationService = makeConfig({ defaultLevel: ChatPermissionLevel.Autopilot, policyRestricted: true });
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
    });
    test("falls back to Default when chat.permissions.default is unset", () => {
      const configurationService = makeConfig({});
      const provider = createProviderForSendTests(disposables, model, () => new Promise(() => {
      }), { configurationService });
      const sessionInfo = provider.createNewSession(workspace, CopilotCLISessionType.id);
      const session = provider.getSession(sessionInfo.sessionId);
      assert.strictEqual(session?.permissionLevel.get(), ChatPermissionLevel.Default);
    });
  });
  function waitForSessionAdded(provider) {
    return new Promise((resolve) => {
      const disposable = provider.onDidChangeSessions((e) => {
        if (e.added.length > 0) {
          disposable.dispose();
          resolve();
        }
      });
    });
  }
  test("cloud session that commits a new resource resolves without timing out", async () => {
    const committedResource = URI.from({ scheme: AgentSessionProviders.Cloud, path: `/task/${generateUuid()}` });
    const onDidCommit = disposables.add(new Emitter());
    let resolveComplete;
    const responseCompletePromise = new Promise((r) => {
      resolveComplete = r;
    });
    const responseCreatedPromise = new Promise(() => {
    });
    const provider = createProviderForSendTests(disposables, model, async () => ({
      kind: "sent",
      data: {
        responseCompletePromise,
        responseCreatedPromise,
        agent: new class extends mock() {
        }()
      }
    }), { onDidCommitSession: onDidCommit.event });
    const workspace = URI.from({ scheme: GITHUB_REMOTE_FILE_SCHEME, path: "/owner/repo/HEAD" });
    const session = provider.createNewSession(workspace, CopilotCloudSessionType.id);
    const removals = [];
    disposables.add(provider.onDidChangeSessions((e) => {
      for (const r of e.removed) {
        removals.push(r.resource.toString());
      }
    }));
    const added = waitForSessionAdded(provider);
    const chat = await provider.createNewChat(session.sessionId);
    const untitledResource = chat.resource;
    const sendPromise = provider.sendRequest(session.sessionId, chat.resource, { query: "hi" });
    await added;
    resolveComplete();
    model.addSession(createMockAgentSession(committedResource, { providerType: AgentSessionProviders.Cloud }));
    let sendSettled = false;
    const fireCommitUntilSettled = async () => {
      while (!sendSettled) {
        onDidCommit.fire({ original: untitledResource, committed: committedResource });
        await timeout(5);
      }
    };
    const commitLoop = fireCommitUntilSettled();
    try {
      await assert.doesNotReject(sendPromise);
    } finally {
      sendSettled = true;
      await commitLoop;
    }
    assert.ok(
      !removals.includes(untitledResource.toString()),
      `Cloud session should not be removed after committing. Removals seen: [${removals.join(", ")}]`
    );
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxccHJvdmlkZXJzXFxjb3BpbG90Q2hhdFNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxjb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIElEaXNwb3NhYmxlLCBJbW1vcnRhbFJlZmVyZW5jZSwgdG9EaXNwb3NhYmxlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgY29uc3RPYnNlcnZhYmxlLCBJU2V0dGFibGVPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBJQ29uZmlndXJhdGlvblZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJRGlhbG9nU2VydmljZSwgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IEV4dGVuc2lvbklkZW50aWZpZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSVN0b3JhZ2VTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRTZXNzaW9uLCBJQWdlbnRTZXNzaW9uc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9icm93c2VyL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9uc01vZGVsLmpzJztcbmltcG9ydCB7IElBZ2VudFNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvblByb3ZpZGVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50U2Vzc2lvbnMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXJ2aWNlLCBDaGF0U2VuZFJlc3VsdCwgSUNoYXRTZW5kUmVxdWVzdERhdGEsIElDaGF0U2VuZFJlcXVlc3RPcHRpb25zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFNlc3Npb25TdGF0dXMsIElDaGF0U2Vzc2lvblByb3ZpZGVyT3B0aW9uR3JvdXAsIElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCBTZXNzaW9uVHlwZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXQsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhLCBJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi90b29scy9sYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElDaGF0UmVzcG9uc2VNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50RGF0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3BhcnRpY2lwYW50cy9jaGF0QWdlbnRzLmpzJztcbmltcG9ydCB7IElHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvZ2l0L2NvbW1vbi9naXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgQ2hhdENvbmZpZ3VyYXRpb24sIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLCBDT1BJTE9UX1BST1ZJREVSX0lELCBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZSwgSUNvcGlsb3RDaGF0U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElMYWJlbFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sYWJlbC9jb21tb24vbGFiZWwuanMnO1xuaW1wb3J0IHsgSVVyaUlkZW50aXR5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3VyaUlkZW50aXR5L2NvbW1vbi91cmlJZGVudGl0eS5qcyc7XG5pbXBvcnQgeyBleHRVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgQ29waWxvdENMSVNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vLi4vYWdlbnRIb3N0L2Jyb3dzZXIvYmFzZUFnZW50SG9zdFNlc3Npb25zUHJvdmlkZXIuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RFbmFibGVtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUHVsbFJlcXVlc3RNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdE1vZGVsLmpzJztcbmltcG9ydCB7IElQdWxsUmVxdWVzdEljb25DYWNoZSB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL3B1bGxSZXF1ZXN0SWNvbkNhY2hlLmpzJztcbmltcG9ydCB7IGNvbXB1dGVQdWxsUmVxdWVzdEljb24sIEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUsIElHaXRIdWJQdWxsUmVxdWVzdCB9IGZyb20gJy4uLy4uLy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuXG4vLyAtLS0tIEhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5mdW5jdGlvbiBjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlOiBVUkksIG9wdHM/OiB7XG5cdHByb3ZpZGVyVHlwZT86IHN0cmluZztcblx0dGl0bGU/OiBzdHJpbmc7XG5cdGFyY2hpdmVkPzogYm9vbGVhbjtcblx0cmVhZD86IGJvb2xlYW47XG5cdGNyZWF0ZWRBdD86IG51bWJlcjtcblx0c3RhdHVzPzogQ2hhdFNlc3Npb25TdGF0dXM7XG5cdG1ldGFkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdG9uU2V0UmVhZD86ICgpID0+IHZvaWQ7XG59KTogSUFnZW50U2Vzc2lvbiB7XG5cdGNvbnN0IHByb3ZpZGVyVHlwZSA9IG9wdHM/LnByb3ZpZGVyVHlwZSA/PyBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZDtcblx0bGV0IGFyY2hpdmVkID0gb3B0cz8uYXJjaGl2ZWQgPz8gZmFsc2U7XG5cdGxldCByZWFkID0gb3B0cz8ucmVhZCA/PyB0cnVlO1xuXHRyZXR1cm4gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQWdlbnRTZXNzaW9uPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHByb3ZpZGVyVHlwZSA9IHByb3ZpZGVyVHlwZTtcblx0XHRvdmVycmlkZSByZWFkb25seSBwcm92aWRlckxhYmVsID0gJ0NvcGlsb3QnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsID0gb3B0cz8udGl0bGUgPz8gJ1Rlc3QgU2Vzc2lvbic7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RhdHVzID0gb3B0cz8uc3RhdHVzID8/IENoYXRTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZDtcblx0XHRvdmVycmlkZSByZWFkb25seSBpY29uID0gQ29kaWNvbi5jb3BpbG90O1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHRpbWluZyA9IHsgY3JlYXRlZDogb3B0cz8uY3JlYXRlZEF0ID8/IERhdGUubm93KCksIGxhc3RSZXF1ZXN0U3RhcnRlZDogdW5kZWZpbmVkLCBsYXN0UmVxdWVzdEVuZGVkOiB1bmRlZmluZWQgfTtcblx0XHRvdmVycmlkZSByZWFkb25seSBtZXRhZGF0YSA9IG9wdHM/Lm1ldGFkYXRhID8/IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJyB9O1xuXHRcdG92ZXJyaWRlIGlzQXJjaGl2ZWQoKTogYm9vbGVhbiB7IHJldHVybiBhcmNoaXZlZDsgfVxuXHRcdG92ZXJyaWRlIHNldEFyY2hpdmVkKHZhbHVlOiBib29sZWFuKTogdm9pZCB7IGFyY2hpdmVkID0gdmFsdWU7IH1cblx0XHRvdmVycmlkZSBpc1Bpbm5lZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdFx0b3ZlcnJpZGUgc2V0UGlubmVkKCk6IHZvaWQgeyB9XG5cdFx0b3ZlcnJpZGUgaXNSZWFkKCk6IGJvb2xlYW4geyByZXR1cm4gcmVhZDsgfVxuXHRcdG92ZXJyaWRlIGlzTWFya2VkVW5yZWFkKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0XHRvdmVycmlkZSBzZXRSZWFkKHZhbHVlOiBib29sZWFuKTogdm9pZCB7XG5cdFx0XHRyZWFkID0gdmFsdWU7XG5cdFx0XHQvLyBUaGUgcmVhbCBtb2RlbCBmaXJlcyBpdHMgY2hhbmdlIGV2ZW50IGZyb20gYHNldFJlYWRgLCB3aGljaCBpcyBob3dcblx0XHRcdC8vIHRoZSBwcm92aWRlciBtaXJyb3JzIHRoZSBuZXcgcmVhZCBzdGF0ZSBiYWNrIG9udG8gdGhlIGFkYXB0ZXIuXG5cdFx0XHRvcHRzPy5vblNldFJlYWQ/LigpO1xuXHRcdH1cblx0fSgpO1xufVxuXG4vLyAtLS0tIE1vY2sgQWdlbnQgU2Vzc2lvbnMgU2VydmljZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5jbGFzcyBNb2NrQWdlbnRTZXNzaW9uc01vZGVsIHtcblx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnM6IElBZ2VudFNlc3Npb25bXSA9IFtdO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zID0gbmV3IEVtaXR0ZXI8dm9pZD4oKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZXZlbnQ7XG5cdHJlYWRvbmx5IG9uV2lsbFJlc29sdmUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZFJlc29sdmUgPSBFdmVudC5Ob25lO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25BcmNoaXZlZFN0YXRlID0gRXZlbnQuTm9uZTtcblx0cmVhZG9ubHkgcmVzb2x2ZWQgPSB0cnVlO1xuXG5cdGdldCBzZXNzaW9ucygpOiBJQWdlbnRTZXNzaW9uW10geyByZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zXTsgfVxuXG5cdGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElBZ2VudFNlc3Npb24gfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5maW5kKHMgPT4gcy5yZXNvdXJjZS50b1N0cmluZygpID09PSByZXNvdXJjZS50b1N0cmluZygpKTtcblx0fVxuXG5cdGFkZFNlc3Npb24oc2Vzc2lvbjogSUFnZW50U2Vzc2lvbik6IHZvaWQge1xuXHRcdHRoaXMuX3Nlc3Npb25zLnB1c2goc2Vzc2lvbik7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKCk7XG5cdH1cblxuXHRyZW1vdmVTZXNzaW9uKHJlc291cmNlOiBVUkkpOiB2b2lkIHtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9zZXNzaW9ucy5maW5kSW5kZXgocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGlmIChpZHggIT09IC0xKSB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5zcGxpY2UoaWR4LCAxKTtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHRcdH1cblx0fVxuXG5cdHJlcGxhY2VTZXNzaW9uKHNlc3Npb246IElBZ2VudFNlc3Npb24pOiB2b2lkIHtcblx0XHRjb25zdCBpZHggPSB0aGlzLl9zZXNzaW9ucy5maW5kSW5kZXgocyA9PiBzLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0Lm9rKGlkeCA+PSAwLCAnc2Vzc2lvbiBzaG91bGQgZXhpc3QgYmVmb3JlIHJlcGxhY2luZycpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLnNwbGljZShpZHgsIDEsIHNlc3Npb24pO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHR9XG5cblx0ZmlyZURpZENoYW5nZVNlc3Npb25zKCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSgpO1xuXHR9XG5cblx0YXN5bmMgcmVzb2x2ZSgpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5kaXNwb3NlKCk7XG5cdH1cbn1cblxuaW50ZXJmYWNlIElFeGVjdXRlZENvbW1hbmQge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBhcmdzOiByZWFkb25seSB1bmtub3duW107XG59XG5cbmludGVyZmFjZSBJQ3JlYXRlUHJvdmlkZXJPcHRpb25zIHtcblx0cmVhZG9ubHkgbXVsdGlDaGF0RW5hYmxlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IGFnZW50SG9zdEVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBjb21tYW5kRXhlY3V0aW9ucz86IElFeGVjdXRlZENvbW1hbmRbXTtcblx0cmVhZG9ubHkgZ2V0T3B0aW9uR3JvdXBzPzogKCkgPT4gSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBsYW5ndWFnZU1vZGVsc1NlcnZpY2U/OiBQYXJ0aWFsPElMYW5ndWFnZU1vZGVsc1NlcnZpY2U+O1xuXHRyZWFkb25seSBnaXRIdWJTZXJ2aWNlPzogSUdpdEh1YlNlcnZpY2U7XG5cdHJlYWRvbmx5IHB1bGxSZXF1ZXN0SWNvbkNhY2hlPzogSVB1bGxSZXF1ZXN0SWNvbkNhY2hlO1xufVxuXG5mdW5jdGlvbiBpc0NvbW1hbmRTZXNzaW9uSXRlbShpdGVtOiB1bmtub3duKTogaXRlbSBpcyB7IHJlYWRvbmx5IHJlc291cmNlOiBVUkk7IHJlYWRvbmx5IGxhYmVsPzogc3RyaW5nIH0ge1xuXHRyZXR1cm4gdHlwZW9mIGl0ZW0gPT09ICdvYmplY3QnICYmIGl0ZW0gIT09IG51bGwgJiYgJ3Jlc291cmNlJyBpbiBpdGVtICYmIFVSSS5pc1VyaShpdGVtLnJlc291cmNlKTtcbn1cblxuY2xhc3MgVGVzdFB1bGxSZXF1ZXN0SWNvbkNhY2hlIGltcGxlbWVudHMgSVB1bGxSZXF1ZXN0SWNvbkNhY2hlIHtcblxuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9pY29ucyA9IG5ldyBNYXA8c3RyaW5nLCBSZXR1cm5UeXBlPHR5cGVvZiBjb21wdXRlUHVsbFJlcXVlc3RJY29uPj4oKTtcblxuXHRnZXQocHJMaW5rOiBzdHJpbmcpOiBSZXR1cm5UeXBlPHR5cGVvZiBjb21wdXRlUHVsbFJlcXVlc3RJY29uPiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2ljb25zLmdldChwckxpbmspO1xuXHR9XG5cblx0c2V0KHByTGluazogc3RyaW5nLCBpY29uOiBSZXR1cm5UeXBlPHR5cGVvZiBjb21wdXRlUHVsbFJlcXVlc3RJY29uPik6IHZvaWQge1xuXHRcdHRoaXMuX2ljb25zLnNldChwckxpbmssIGljb24pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RHaXRIdWJTZXJ2aWNlIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfcHVsbFJlcXVlc3QgPSBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YlB1bGxSZXF1ZXN0IHwgdW5kZWZpbmVkPih0aGlzLCB1bmRlZmluZWQpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdE1vZGVsOiBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsO1xuXG5cdGxvb2t1cENhbGxzID0gMDtcblx0cHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzID0gMDtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdE51bWJlcj86IG51bWJlcikge1xuXHRcdHN1cGVyKCk7XG5cdFx0Y29uc3QgcHVsbFJlcXVlc3QgPSB0aGlzLl9wdWxsUmVxdWVzdDtcblx0XHR0aGlzLl9wdWxsUmVxdWVzdE1vZGVsID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxHaXRIdWJQdWxsUmVxdWVzdE1vZGVsPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHB1bGxSZXF1ZXN0ID0gcHVsbFJlcXVlc3Q7XG5cdFx0fSgpO1xuXHR9XG5cblx0b3ZlcnJpZGUgZmluZFB1bGxSZXF1ZXN0TnVtYmVyQnlIZWFkQnJhbmNoID0gYXN5bmMgKCk6IFByb21pc2U8bnVtYmVyIHwgdW5kZWZpbmVkPiA9PiB7XG5cdFx0dGhpcy5sb29rdXBDYWxscysrO1xuXHRcdHJldHVybiB0aGlzLl9wdWxsUmVxdWVzdE51bWJlcjtcblx0fTtcblxuXHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlID0gKCkgPT4ge1xuXHRcdHRoaXMucHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzKys7XG5cdFx0cmV0dXJuIG5ldyBJbW1vcnRhbFJlZmVyZW5jZSh0aGlzLl9wdWxsUmVxdWVzdE1vZGVsKTtcblx0fTtcblxuXHRzZXRQdWxsUmVxdWVzdChwdWxsUmVxdWVzdDogSUdpdEh1YlB1bGxSZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5fcHVsbFJlcXVlc3Quc2V0KHB1bGxSZXF1ZXN0LCB1bmRlZmluZWQpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVB1bGxSZXF1ZXN0KHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLCBpc0RyYWZ0ID0gZmFsc2UpOiBJR2l0SHViUHVsbFJlcXVlc3Qge1xuXHRyZXR1cm4ge1xuXHRcdG51bWJlcjogNDIsXG5cdFx0dGl0bGU6ICdDbG91ZCBQUicsXG5cdFx0Ym9keTogJycsXG5cdFx0c3RhdGUsXG5cdFx0YXV0aG9yOiB7IGxvZ2luOiAnb3duZXInLCBhdmF0YXJVcmw6ICcnIH0sXG5cdFx0aGVhZFJlZjogJ2ZlYXR1cmUnLFxuXHRcdGhlYWRTaGE6ICdoZWFkJyxcblx0XHRiYXNlUmVmOiAnbWFpbicsXG5cdFx0aXNEcmFmdCxcblx0XHRjcmVhdGVkQXQ6ICcnLFxuXHRcdHVwZGF0ZWRBdDogJycsXG5cdFx0bWVyZ2VkQXQ6IHN0YXRlID09PSBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCA/ICcnIDogdW5kZWZpbmVkLFxuXHRcdG1lcmdlYWJsZTogdW5kZWZpbmVkLFxuXHRcdG1lcmdlYWJsZVN0YXRlOiAnJyxcblx0fTtcbn1cblxuLy8gLS0tLSBQcm92aWRlciBmYWN0b3J5IC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXIoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdG1vZGVsOiBNb2NrQWdlbnRTZXNzaW9uc01vZGVsLFxuXHRvcHRzPzogSUNyZWF0ZVByb3ZpZGVyT3B0aW9ucyxcbik6IENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlciB7XG5cdHJldHVybiBjcmVhdGVQcm92aWRlcldpdGhDb25maWcoZGlzcG9zYWJsZXMsIG1vZGVsLCBvcHRzKS5wcm92aWRlcjtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXJXaXRoQ29uZmlnKFxuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRtb2RlbDogTW9ja0FnZW50U2Vzc2lvbnNNb2RlbCxcblx0b3B0cz86IElDcmVhdGVQcm92aWRlck9wdGlvbnMsXG4pOiB7IHByb3ZpZGVyOiBDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXI7IGNvbmZpZ1NlcnZpY2U6IFRlc3RDb25maWd1cmF0aW9uU2VydmljZTsgYWdlbnRIb3N0RW5hYmxlZDogSVNldHRhYmxlT2JzZXJ2YWJsZTxib29sZWFuPiB9IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblxuXHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRjb25maWdTZXJ2aWNlLnNldFVzZXJDb25maWd1cmF0aW9uKCdzZXNzaW9ucy5naXRodWIuY29waWxvdC5tdWx0aUNoYXRTZXNzaW9ucycsIG9wdHM/Lm11bHRpQ2hhdEVuYWJsZWQgPz8gdHJ1ZSk7XG5cdGNvbnN0IGFnZW50SG9zdEVuYWJsZWQgPSBvYnNlcnZhYmxlVmFsdWUoJ2FnZW50SG9zdEVuYWJsZWQnLCBvcHRzPy5hZ2VudEhvc3RFbmFibGVkID8/IHRydWUpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbmZpZ3VyYXRpb25TZXJ2aWNlLCBjb25maWdTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRIb3N0RW5hYmxlbWVudFNlcnZpY2UsIHsgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLCBlbmFibGVkOiBhZ2VudEhvc3RFbmFibGVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlRGlhbG9nU2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElEaWFsb2dTZXJ2aWNlLCB7XG5cdFx0Y29uZmlybTogYXN5bmMgKCkgPT4gKHsgY29uZmlybWVkOiB0cnVlIH0pLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIHtcblx0XHRleGVjdXRlQ29tbWFuZDogYXN5bmMgKGlkOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSkgPT4ge1xuXHRcdFx0b3B0cz8uY29tbWFuZEV4ZWN1dGlvbnM/LnB1c2goeyBpZCwgYXJncyB9KTtcblx0XHRcdC8vIFNpbXVsYXRlICdhZ2VudHMuZ2l0aHViLmNvcGlsb3QuY2xpLmRlbGV0ZVNlc3Npb25zJyByZW1vdmluZyBzZXNzaW9uc1xuXHRcdFx0Y29uc3QgaXRlbXMgPSBhcmdzWzBdO1xuXHRcdFx0aWYgKEFycmF5LmlzQXJyYXkoaXRlbXMpKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBpdGVtcykge1xuXHRcdFx0XHRcdGlmIChpc0NvbW1hbmRTZXNzaW9uSXRlbShpdGVtKSkge1xuXHRcdFx0XHRcdFx0bW9kZWwucmVtb3ZlU2Vzc2lvbihpdGVtLnJlc291cmNlKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0gZWxzZSBpZiAoaXNDb21tYW5kU2Vzc2lvbkl0ZW0oaXRlbXMpKSB7XG5cdFx0XHRcdG1vZGVsLnJlbW92ZVNlc3Npb24oaXRlbXMucmVzb3VyY2UpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9LFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWdlbnRTZXNzaW9uc1NlcnZpY2UsIHtcblx0XHRtb2RlbDogbW9kZWwgYXMgdW5rbm93biBhcyBJQWdlbnRTZXNzaW9uc01vZGVsLFxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbkFyY2hpdmVkU3RhdGU6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0U2Vzc2lvbjogKHJlc291cmNlOiBVUkkpID0+IG1vZGVsLmdldFNlc3Npb24ocmVzb3VyY2UpLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlc3Npb25zU2VydmljZSwge1xuXHRcdGdldENoYXRTZXNzaW9uQ29udHJpYnV0aW9uOiAoKSA9PiAoeyB0eXBlOiAndGVzdC1jb3BpbG90JywgbmFtZTogJ3Rlc3QnLCBkaXNwbGF5TmFtZTogJ1Rlc3QnLCBkZXNjcmlwdGlvbjogJ3Rlc3QnLCBpY29uOiB1bmRlZmluZWQgfSksXG5cdFx0Z2V0T3JDcmVhdGVDaGF0U2Vzc2lvbjogYXN5bmMgKCkgPT4gKHsgb25XaWxsRGlzcG9zZTogKCkgPT4gKHsgZGlzcG9zZSgpIHsgfSB9KSwgc2Vzc2lvblJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnIH0pLCBoaXN0b3J5OiBbXSwgZGlzcG9zZSgpIHsgfSB9KSxcblx0XHRvbkRpZENvbW1pdFNlc3Npb246IEV2ZW50Lk5vbmUsXG5cdFx0dXBkYXRlU2Vzc2lvbk9wdGlvbnM6ICgpID0+IHRydWUsXG5cdFx0c2V0U2Vzc2lvbk9wdGlvbjogKCkgPT4gdHJ1ZSxcblx0XHRnZXRTZXNzaW9uT3B0aW9uOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0Z2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGU6ICgpID0+IG9wdHM/LmdldE9wdGlvbkdyb3Vwcz8uKCksXG5cdFx0b25EaWRDaGFuZ2VPcHRpb25Hcm91cHM6IEV2ZW50Lk5vbmUsXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwge1xuXHRcdGFjcXVpcmVPckxvYWRTZXNzaW9uOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdFx0c2VuZFJlcXVlc3Q6IGFzeW5jICgpOiBQcm9taXNlPENoYXRTZW5kUmVzdWx0PiA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIElDaGF0U2VuZFJlcXVlc3REYXRhIH0pLFxuXHRcdHJlbW92ZUhpc3RvcnlFbnRyeTogYXN5bmMgKHJlc291cmNlOiBVUkkpID0+IHsgbW9kZWwucmVtb3ZlU2Vzc2lvbihyZXNvdXJjZSk7IH0sXG5cdFx0c2V0Q2hhdFNlc3Npb25UaXRsZTogKCkgPT4geyB9LFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIHtcblx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkLFxuXHRcdGxhc3RGb2N1c2VkV2lkZ2V0OiB1bmRlZmluZWQsXG5cdFx0b25EaWRDaGFuZ2VGb2N1c2VkU2Vzc2lvbjogRXZlbnQuTm9uZSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxhbmd1YWdlTW9kZWxzU2VydmljZSwgb3B0cz8ubGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlID8/IHsgbG9va3VwTGFuZ3VhZ2VNb2RlbDogKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYW5ndWFnZU1vZGVsVG9vbHNTZXJ2aWNlLCB7XG5cdFx0dG9Ub29sUmVmZXJlbmNlczogKCkgPT4gW10sXG5cdH0pO1xuXHQvLyBTdHViIElJbnN0YW50aWF0aW9uU2VydmljZSBzbyBwcm92aWRlciBjYW4gdXNlIGNyZWF0ZUluc3RhbmNlIGZvciBDb3BpbG90Q0xJU2Vzc2lvblxuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHtcblx0XHRnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUdpdEh1YlNlcnZpY2UsIG9wdHM/LmdpdEh1YlNlcnZpY2UgPz8gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQdWxsUmVxdWVzdEljb25DYWNoZSwgb3B0cz8ucHVsbFJlcXVlc3RJY29uQ2FjaGUgPz8gbmV3IFRlc3RQdWxsUmVxdWVzdEljb25DYWNoZSgpKTtcblxuXHRjb25zdCBwcm92aWRlciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIpKTtcblx0cmV0dXJuIHsgcHJvdmlkZXIsIGNvbmZpZ1NlcnZpY2UsIGFnZW50SG9zdEVuYWJsZWQgfTtcbn1cblxuLy8gLS0tLSBQcm92aWRlciBmYWN0b3J5IGZvciBzZW5kL2NhbmNlbCB0ZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBDcmVhdGVzIGEgcHJvdmlkZXIgc3VpdGFibGUgZm9yIHRlc3Rpbmcgc2VuZENoYXQgZmxvd3MuIFN0dWJzIGFsbCBzZXJ2aWNlc1xuICogbmVlZGVkIGJ5IENvcGlsb3RDTElTZXNzaW9uIGFuZCBfc2VuZEZpcnN0Q2hhdCwgaW5jbHVkaW5nIElHaXRTZXJ2aWNlIGFuZCBhXG4gKiBub24tbnVsbCBJQ2hhdFdpZGdldCBtb2NrLlxuICpcbiAqIFRoZSBjYWxsZXIgY2FuIHBhc3MgYSBjdXN0b20gYHNlbmRSZXF1ZXN0YCBpbXBsZW1lbnRhdGlvbiB0byBjb250cm9sIHRoZVxuICogbGlmZWN5Y2xlIG9mIHRoZSBpbi1mbGlnaHQgcmVxdWVzdC5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlUHJvdmlkZXJGb3JTZW5kVGVzdHMoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdG1vZGVsOiBNb2NrQWdlbnRTZXNzaW9uc01vZGVsLFxuXHRzZW5kUmVxdWVzdDogKHJlc291cmNlOiBVUkksIG1lc3NhZ2U6IHN0cmluZywgb3B0aW9ucz86IElDaGF0U2VuZFJlcXVlc3RPcHRpb25zKSA9PiBQcm9taXNlPENoYXRTZW5kUmVzdWx0Pixcblx0b3B0cz86IHsgb25EaWRDb21taXRTZXNzaW9uPzogRXZlbnQ8eyBvcmlnaW5hbDogVVJJOyBjb21taXR0ZWQ6IFVSSSB9PjsgY29uZmlndXJhdGlvblNlcnZpY2U/OiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2U7IGFnZW50SG9zdEVuYWJsZWQ/OiBib29sZWFuIH0sXG4pOiBDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXIge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBvcHRzPy5jb25maWd1cmF0aW9uU2VydmljZSA/PyBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ3Nlc3Npb25zLmdpdGh1Yi5jb3BpbG90Lm11bHRpQ2hhdFNlc3Npb25zJywgdHJ1ZSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgY29uZmlnU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSURpYWxvZ1NlcnZpY2UsIHtcblx0XHRjb25maXJtOiBhc3luYyAoKSA9PiAoeyBjb25maXJtZWQ6IHRydWUgfSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBZ2VudFNlc3Npb25zU2VydmljZSwge1xuXHRcdG1vZGVsOiBtb2RlbCBhcyB1bmtub3duIGFzIElBZ2VudFNlc3Npb25zTW9kZWwsXG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uQXJjaGl2ZWRTdGF0ZTogRXZlbnQuTm9uZSxcblx0XHRnZXRTZXNzaW9uOiAocmVzb3VyY2U6IFVSSSkgPT4gbW9kZWwuZ2V0U2Vzc2lvbihyZXNvdXJjZSksXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2Vzc2lvbnNTZXJ2aWNlLCB7XG5cdFx0Z2V0Q2hhdFNlc3Npb25Db250cmlidXRpb246ICgpID0+ICh7IHR5cGU6ICd0ZXN0LWNvcGlsb3QnLCBuYW1lOiAndGVzdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCcsIGRlc2NyaXB0aW9uOiAndGVzdCcsIGljb246IHVuZGVmaW5lZCB9KSxcblx0XHRnZXRPckNyZWF0ZUNoYXRTZXNzaW9uOiBhc3luYyAoKSA9PiAoeyBvbldpbGxEaXNwb3NlOiAoKSA9PiAoeyBkaXNwb3NlKCkgeyB9IH0pLCBzZXNzaW9uUmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcgfSksIGhpc3Rvcnk6IFtdLCBkaXNwb3NlKCkgeyB9IH0pLFxuXHRcdG9uRGlkQ29tbWl0U2Vzc2lvbjogb3B0cz8ub25EaWRDb21taXRTZXNzaW9uID8/IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0T3B0aW9uR3JvdXBzRm9yU2Vzc2lvblR5cGU6ICgpID0+IHVuZGVmaW5lZCxcblx0XHR1cGRhdGVTZXNzaW9uT3B0aW9uczogKCkgPT4gdHJ1ZSxcblx0XHRzZXRTZXNzaW9uT3B0aW9uOiAoKSA9PiB0cnVlLFxuXHRcdGdldFNlc3Npb25PcHRpb246ICgpID0+IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZU9wdGlvbkdyb3VwczogRXZlbnQuTm9uZSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCB7XG5cdFx0YWNxdWlyZU9yTG9hZFNlc3Npb246IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRzZW5kUmVxdWVzdDogc2VuZFJlcXVlc3QsXG5cdFx0cmVtb3ZlSGlzdG9yeUVudHJ5OiBhc3luYyAocmVzb3VyY2U6IFVSSSkgPT4geyBtb2RlbC5yZW1vdmVTZXNzaW9uKHJlc291cmNlKTsgfSxcblx0XHRzZXRDaGF0U2Vzc2lvblRpdGxlOiAoKSA9PiB7IH0sXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwge1xuXHRcdG9wZW5TZXNzaW9uOiBhc3luYyAoKSA9PiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0PigpIHtcblx0XHRcdG92ZXJyaWRlIGlucHV0ID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFsnaW5wdXQnXT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHNldFBlcm1pc3Npb25MZXZlbCA9ICgpID0+IHsgfTtcblx0XHRcdH0oKTtcblx0XHR9KCksXG5cdFx0bGFzdEZvY3VzZWRXaWRnZXQ6IHVuZGVmaW5lZCxcblx0XHRvbkRpZENoYW5nZUZvY3VzZWRTZXNzaW9uOiBFdmVudC5Ob25lLFxuXHR9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbHNTZXJ2aWNlLCB7IGxvb2t1cExhbmd1YWdlTW9kZWw6ICgpID0+IHVuZGVmaW5lZCB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTGFuZ3VhZ2VNb2RlbFRvb2xzU2VydmljZSwgeyB0b1Rvb2xSZWZlcmVuY2VzOiAoKSA9PiBbXSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJR2l0U2VydmljZSwgeyBvcGVuUmVwb3NpdG9yeTogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElJbnN0YW50aWF0aW9uU2VydmljZSwgaW5zdGFudGlhdGlvblNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMYWJlbFNlcnZpY2UsIHtcblx0XHRnZXRVcmlMYWJlbDogKHVyaTogVVJJKSA9PiB1cmkucGF0aCxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUFnZW50SG9zdEVuYWJsZW1lbnRTZXJ2aWNlLCB7IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZCwgZW5hYmxlZDogY29uc3RPYnNlcnZhYmxlKG9wdHM/LmFnZW50SG9zdEVuYWJsZWQgPz8gdHJ1ZSkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElHaXRIdWJTZXJ2aWNlLCBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVB1bGxSZXF1ZXN0SWNvbkNhY2hlLCBuZXcgVGVzdFB1bGxSZXF1ZXN0SWNvbkNhY2hlKCkpO1xuXG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyKSk7XG59XG5cbnN1aXRlKCdDb3BpbG90Q2hhdFNlc3Npb25zUHJvdmlkZXInLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgbW9kZWw6IE1vY2tBZ2VudFNlc3Npb25zTW9kZWw7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1vZGVsID0gbmV3IE1vY2tBZ2VudFNlc3Npb25zTW9kZWwoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IG1vZGVsLmRpc3Bvc2UoKSkpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Ly8gLS0tLSBQcm92aWRlciBpZGVudGl0eSAtLS0tLS0tXG5cblx0dGVzdCgnaGFzIGNvcnJlY3QgaWQgYW5kIGxhYmVsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuaWQsIENPUElMT1RfUFJPVklERVJfSUQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5zZXNzaW9uVHlwZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvblR5cGVzIGV4Y2x1ZGVzIExvY2FsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRhc3NlcnQub2soIXByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHR5cGUgPT4gdHlwZS5pZCA9PT0gU2Vzc2lvblR5cGUuTG9jYWwpKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvblR5cGVzIGV4Y2x1ZGVzIEV4dGVuc2lvbiBIb3N0IENvcGlsb3QgQ0xJIHdoZW4gQWdlbnQgSG9zdCBpcyBhdmFpbGFibGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGFzc2VydC5vayghcHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvblR5cGVzIGluY2x1ZGVzIEV4dGVuc2lvbiBIb3N0IENvcGlsb3QgQ0xJIHdoZW4gQWdlbnQgSG9zdCBpcyB1bmF2YWlsYWJsZScsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBhZ2VudEhvc3RFbmFibGVkOiBmYWxzZSB9KTtcblx0XHRhc3NlcnQub2socHJvdmlkZXIuc2Vzc2lvblR5cGVzLnNvbWUodCA9PiB0LmlkID09PSBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpKTtcblx0fSk7XG5cblx0dGVzdCgnQWdlbnQgSG9zdCBhdmFpbGFiaWxpdHkgaXMgb2JzZXJ2ZWQgaW4gYm90aCBkaXJlY3Rpb25zIGFmdGVyIHRoZSBwcm92aWRlciBpcyBjcmVhdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHsgcHJvdmlkZXIsIGFnZW50SG9zdEVuYWJsZWQgfSA9IGNyZWF0ZVByb3ZpZGVyV2l0aENvbmZpZyhkaXNwb3NhYmxlcywgbW9kZWwsIHsgYWdlbnRIb3N0RW5hYmxlZDogZmFsc2UgfSk7XG5cdFx0bGV0IGNoYW5nZUNvdW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMoKCkgPT4gY2hhbmdlQ291bnQrKykpO1xuXHRcdGNvbnN0IHZpc2libGVCZWZvcmVBdmFpbGFiaWxpdHkgPSBwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cblx0XHRhZ2VudEhvc3RFbmFibGVkLnNldCh0cnVlLCB1bmRlZmluZWQpO1xuXHRcdGNvbnN0IHZpc2libGVXaGlsZUF2YWlsYWJsZSA9IHByb3ZpZGVyLnNlc3Npb25UeXBlcy5zb21lKHQgPT4gdC5pZCA9PT0gQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRhZ2VudEhvc3RFbmFibGVkLnNldChmYWxzZSwgdW5kZWZpbmVkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmlzaWJsZUJlZm9yZUF2YWlsYWJpbGl0eSxcblx0XHRcdHZpc2libGVXaGlsZUF2YWlsYWJsZSxcblx0XHRcdHZpc2libGVBZnRlckRpc2FibGVtZW50OiBwcm92aWRlci5zZXNzaW9uVHlwZXMuc29tZSh0ID0+IHQuaWQgPT09IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCksXG5cdFx0XHRjaGFuZ2VDb3VudCxcblx0XHR9LCB7XG5cdFx0XHR2aXNpYmxlQmVmb3JlQXZhaWxhYmlsaXR5OiB0cnVlLFxuXHRcdFx0dmlzaWJsZVdoaWxlQXZhaWxhYmxlOiBmYWxzZSxcblx0XHRcdHZpc2libGVBZnRlckRpc2FibGVtZW50OiB0cnVlLFxuXHRcdFx0Y2hhbmdlQ291bnQ6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gZ2V0U2Vzc2lvblR5cGVzIC0tLS0tLS1cblxuXHR0ZXN0KCdnZXRTZXNzaW9uVHlwZXMgcmV0dXJucyBvbmx5IENsb3VkIGZvciBhIHJlbW90ZSB3b3Jrc3BhY2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHR5cGVzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvblR5cGVzKFVSSS5mcm9tKHsgc2NoZW1lOiBHSVRIVUJfUkVNT1RFX0ZJTEVfU0NIRU1FLCBwYXRoOiAnL293bmVyL3JlcG8nIH0pKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHlwZXMubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTZXNzaW9uIGxpc3RpbmcgLS0tLS0tLVxuXG5cdHRlc3QoJ2dldFNlc3Npb25zIHJldHVybnMgZW1wdHkgYXJyYXkgaW5pdGlhbGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyByZXR1cm5zIGFkYXB0ZWQgc2Vzc2lvbnMgZnJvbSBhZ2VudCBtb2RlbCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0yJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UxLCB7IHRpdGxlOiAnU2Vzc2lvbiAxJyB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMiwgeyB0aXRsZTogJ1Nlc3Npb24gMicgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDIpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBkb2VzIG5vdCBlbWl0IHNlc3Npb24gY2hhbmdlcyB3aGlsZSByZWFkaW5nIHRoZSBpbml0aWFsIGNhY2hlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGFnZW50SG9zdEVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgc2Vzc2lvbkNvdW50OiBzZXNzaW9ucy5sZW5ndGgsIGNoYW5nZXMgfSwgeyBzZXNzaW9uQ291bnQ6IDEsIGNoYW5nZXM6IFtdIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBleGNsdWRlcyBMb2NhbCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBiZ1Jlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL2JnLXNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IGxvY2FsUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkxvY2FsLCBwYXRoOiAnL2xvY2FsLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihiZ1Jlc291cmNlKSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGxvY2FsUmVzb3VyY2UsIHsgcHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuTG9jYWwgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBleGNsdWRlcyBDbGF1ZGUgZXh0ZW5zaW9uLWhvc3Qgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2xhdWRlUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NsYXVkZS1jb2RlJywgcGF0aDogJy9jbGF1ZGUtc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNsYXVkZVJlc291cmNlLCB7IHByb3ZpZGVyVHlwZTogJ2NsYXVkZS1jb2RlJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlU2Vzc2lvbnMgZmlyZXMgd2hlbiBhZ2VudCBtb2RlbCBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpOyAvLyBJbml0aWFsaXplIGNhY2hlXG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvbmV3LXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ05ldyBTZXNzaW9uJyB9KSk7XG5cblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlc1swXS5hZGRlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25zIGRvZXMgbm90IGZpcmUgd2hlbiBjYWNoZWQgYWdlbnQgc2Vzc2lvbiBpcyB1bmNoYW5nZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvZXhpc3Rpbmctc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiAnRXhpc3RpbmcgU2Vzc2lvbicsIGNyZWF0ZWRBdDogMSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gSW5pdGlhbGl6ZSBjYWNoZVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdG1vZGVsLmZpcmVEaWRDaGFuZ2VTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29uRGlkQ2hhbmdlU2Vzc2lvbnMgZmlyZXMgY2hhbmdlZCBzZXNzaW9uIHdoZW4gY2FjaGVkIGFnZW50IHNlc3Npb24gY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9leGlzdGluZy1zZXNzaW9uJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdFeGlzdGluZyBTZXNzaW9uJywgY3JlYXRlZEF0OiAxIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpOyAvLyBJbml0aWFsaXplIGNhY2hlXG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0bW9kZWwucmVwbGFjZVNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ1VwZGF0ZWQgU2Vzc2lvbicsIGNyZWF0ZWRBdDogMSB9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMubWFwKGUgPT4gKHtcblx0XHRcdGFkZGVkOiBlLmFkZGVkLmxlbmd0aCxcblx0XHRcdHJlbW92ZWQ6IGUucmVtb3ZlZC5sZW5ndGgsXG5cdFx0XHRjaGFuZ2VkOiBlLmNoYW5nZWQubWFwKHNlc3Npb24gPT4gc2Vzc2lvbi50aXRsZS5nZXQoKSksXG5cdFx0fSkpLCBbe1xuXHRcdFx0YWRkZWQ6IDAsXG5cdFx0XHRyZW1vdmVkOiAwLFxuXHRcdFx0Y2hhbmdlZDogWydVcGRhdGVkIFNlc3Npb24nXSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIGEgc2Vzc2lvbiB1bnJlYWQgd2hlbiBpdHMgdHVybiBjb21wbGV0ZXMgKEluUHJvZ3Jlc3MgXHUyMTkyIHRlcm1pbmFsKScsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy90dXJuLXNlc3Npb24nIH0pO1xuXHRcdC8vIFNlc3Npb24gc3RhcnRzIGEgdHVybiAoaW4gcHJvZ3Jlc3MpIGFuZCBpcyBjdXJyZW50bHkgcmVhZC5cblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdUdXJuIFNlc3Npb24nLCBjcmVhdGVkQXQ6IDEsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgcmVhZDogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gSW5pdGlhbGl6ZSBjYWNoZSB3aXRoIHRoZSBpbi1wcm9ncmVzcyBzZXNzaW9uXG5cblx0XHQvLyBUaGUgdHVybiBjb21wbGV0ZXM6IHRoZSB1bmRlcmx5aW5nIHNlc3Npb24gZmxpcHMgdG8gYSB0ZXJtaW5hbCBzdGF0dXMuXG5cdFx0bW9kZWwucmVwbGFjZVNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ1R1cm4gU2Vzc2lvbicsIGNyZWF0ZWRBdDogMSwgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIHJlYWQ6IHRydWUsIG9uU2V0UmVhZDogKCkgPT4gbW9kZWwuZmlyZURpZENoYW5nZVNlc3Npb25zKCkgfSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uaXNSZWFkLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IG1hcmsgdW5yZWFkIHdoZW4gc3RhdHVzIHN0YXlzIGluIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3N0aWxsLXJ1bm5pbmcnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyB0aXRsZTogJ1J1bm5pbmcnLCBjcmVhdGVkQXQ6IDEsIHN0YXR1czogQ2hhdFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcywgcmVhZDogdHJ1ZSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdC8vIEEgcmVmcmVzaCB0aGF0IGRvZXMgbm90IGNvbXBsZXRlIHRoZSB0dXJuIG11c3Qgbm90IG1hcmsgaXQgdW5yZWFkLlxuXHRcdG1vZGVsLnJlcGxhY2VTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6ICdSdW5uaW5nICh1cGRhdGVkKScsIGNyZWF0ZWRBdDogMSwgc3RhdHVzOiBDaGF0U2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLCByZWFkOiB0cnVlIH0pKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzUmVhZC5nZXQoKSwgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldFNlc3Npb25SZWFkU3RhdGUgY2xlYXJzIHVucmVhZCBhY3Jvc3MgZXZlcnkgY2hhdCBpbiB0aGUgZ3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgcm9vdFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Jvb3Qtc2Vzc2lvbicgfSk7XG5cdFx0Y29uc3QgY2hpbGRSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9jaGlsZC1zZXNzaW9uJyB9KTtcblxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyb290UmVzb3VyY2UsIHsgdGl0bGU6ICdSb290JywgY3JlYXRlZEF0OiAxLCByZWFkOiB0cnVlLCBvblNldFJlYWQ6ICgpID0+IG1vZGVsLmZpcmVEaWRDaGFuZ2VTZXNzaW9ucygpIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oY2hpbGRSZXNvdXJjZSwge1xuXHRcdFx0dGl0bGU6ICdDaGlsZCcsIGNyZWF0ZWRBdDogMiwgcmVhZDogZmFsc2UsXG5cdFx0XHRtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nLCBzZXNzaW9uUGFyZW50SWQ6ICdyb290LXNlc3Npb24nIH0sXG5cdFx0XHRvblNldFJlYWQ6ICgpID0+IG1vZGVsLmZpcmVEaWRDaGFuZ2VTZXNzaW9ucygpLFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXTtcblx0XHRjb25zdCByZWFkQmVmb3JlID0gc2Vzc2lvbi5pc1JlYWQuZ2V0KCk7XG5cblx0XHRhd2FpdCBwcm92aWRlci5zZXRTZXNzaW9uUmVhZFN0YXRlKHNlc3Npb24uc2Vzc2lvbklkLCB0cnVlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVhZEJlZm9yZSxcblx0XHRcdHJlYWRBZnRlcjogcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc1JlYWQuZ2V0KCksXG5cdFx0fSwge1xuXHRcdFx0cmVhZEJlZm9yZTogZmFsc2UsXG5cdFx0XHRyZWFkQWZ0ZXI6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cblx0Ly8gLS0tLSBTZXNzaW9uIGNyZWF0aW9uIC0tLS0tLS1cblxuXHQvLyBOb3RlOiBjcmVhdGVOZXdTZXNzaW9uIHRlc3RzIGFyZSBsaW1pdGVkIGJlY2F1c2UgQ29waWxvdENMSVNlc3Npb25cblx0Ly8gcmVxdWlyZXMgSUdpdFNlcnZpY2UgYW5kIGNyZWF0ZXMgZGlzcG9zYWJsZXMgdGhhdCBhcmUgaGFyZCB0byBjbGVhblxuXHQvLyB1cCBpbiBpc29sYXRpb24uIEZ1bGwgaW50ZWdyYXRpb24gdGVzdHMgc2hvdWxkIGNvdmVyIHNlc3Npb24gY3JlYXRpb24uXG5cdHRlc3QoJ2Nsb3VkIG1vZGVscyByZXNvbHZlIGFyYml0cmFyeSByZXN0b3JlZCBpZHMgd2l0aCBvcHRpb24gZ3JvdXBzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1vZGVsc1N0YXRlOiB7IG9wdGlvbkdyb3VwczogSUNoYXRTZXNzaW9uUHJvdmlkZXJPcHRpb25Hcm91cFtdIHwgdW5kZWZpbmVkIH0gPSB7IG9wdGlvbkdyb3VwczogdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2V0T3B0aW9uR3JvdXBzOiAoKSA9PiBtb2RlbHNTdGF0ZS5vcHRpb25Hcm91cHMgfSk7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIHBhdGg6ICcvb3duZXIvcmVwb3NpdG9yeScgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q2xvdWRTZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgYmVmb3JlUmVzb2x2ZSA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCAncmVtb3ZlZC1jbG91ZC1tb2RlbCcpO1xuXG5cdFx0bW9kZWxzU3RhdGUub3B0aW9uR3JvdXBzID0gW3tcblx0XHRcdGlkOiAnbW9kZWxzJyxcblx0XHRcdG5hbWU6ICdNb2RlbHMnLFxuXHRcdFx0aXRlbXM6IFt7IGlkOiAnc3ludGhldGljLWNsb3VkLW1vZGVsJywgbmFtZTogJ1N5bnRoZXRpYyBDbG91ZCBNb2RlbCcgfV0sXG5cdFx0fV07XG5cdFx0Y29uc3QgYWZ0ZXJSZXNvbHZlID0gcHJvdmlkZXIuZ2V0TW9kZWxzU25hcHNob3Qoc2Vzc2lvbi5zZXNzaW9uSWQsICdyZW1vdmVkLWNsb3VkLW1vZGVsJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZVJlc29sdmU6IHsgbW9kZWxzOiBiZWZvcmVSZXNvbHZlLm1vZGVscy5tYXAobW9kZWwgPT4gbW9kZWwuaWRlbnRpZmllciksIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IGJlZm9yZVJlc29sdmUuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbiwgbW9kZWxUYXJnZXQ6IGJlZm9yZVJlc29sdmUubW9kZWxUYXJnZXQgfSxcblx0XHRcdGFmdGVyUmVzb2x2ZTogeyBtb2RlbHM6IGFmdGVyUmVzb2x2ZS5tb2RlbHMubWFwKG1vZGVsID0+IG1vZGVsLmlkZW50aWZpZXIpLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiBhZnRlclJlc29sdmUuZGVzaXJlZE1vZGVsUmVzb2x1dGlvbiwgbW9kZWxUYXJnZXQ6IGFmdGVyUmVzb2x2ZS5tb2RlbFRhcmdldCB9LFxuXHRcdH0sIHtcblx0XHRcdGJlZm9yZVJlc29sdmU6IHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICdyZW1vdmVkLWNsb3VkLW1vZGVsJyB9LCBtb2RlbFRhcmdldDogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0sXG5cdFx0XHRhZnRlclJlc29sdmU6IHsgbW9kZWxzOiBbJ3N5bnRoZXRpYy1jbG91ZC1tb2RlbCddLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICd1bmF2YWlsYWJsZScsIGlkZW50aWZpZXI6ICdyZW1vdmVkLWNsb3VkLW1vZGVsJyB9LCBtb2RlbFRhcmdldDogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcGlsb3QgQ0xJIGtlZXBzIGFuIGVtcHR5IENvcGlsb3QgY2F0YWxvZyBwZW5kaW5nIHVudGlsIGxpdmUgbW9kZWxzIGFycml2ZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbHMgPSBuZXcgTWFwPHN0cmluZywgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGE+KCk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHtcblx0XHRcdGxhbmd1YWdlTW9kZWxzU2VydmljZToge1xuXHRcdFx0XHRnZXRMYW5ndWFnZU1vZGVsSWRzOiAoKSA9PiBbLi4ubW9kZWxzLmtleXMoKV0sXG5cdFx0XHRcdGxvb2t1cExhbmd1YWdlTW9kZWw6IGlkZW50aWZpZXIgPT4gbW9kZWxzLmdldChpZGVudGlmaWVyKSxcblx0XHRcdFx0aGFzUmVzb2x2ZWRWZW5kb3I6ICgpID0+IHRydWUsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKFVSSS5maWxlKCcvdGVzdC9wcm9qZWN0JyksIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0Y29uc3QgZW1wdHkgPSBwcm92aWRlci5nZXRNb2RlbHNTbmFwc2hvdChzZXNzaW9uLnNlc3Npb25JZCwgJ2NvcGlsb3QvcmVtZW1iZXJlZCcpO1xuXG5cdFx0bW9kZWxzLnNldCgnY29waWxvdC9vdGhlcicsIHtcblx0XHRcdGV4dGVuc2lvbjogbmV3IEV4dGVuc2lvbklkZW50aWZpZXIoJ3Rlc3QuZXh0ZW5zaW9uJyksXG5cdFx0XHRpZDogJ290aGVyJyxcblx0XHRcdG5hbWU6ICdPdGhlcicsXG5cdFx0XHR2ZW5kb3I6ICdjb3BpbG90Jyxcblx0XHRcdHZlcnNpb246ICcxLjAnLFxuXHRcdFx0ZmFtaWx5OiAnb3RoZXInLFxuXHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEsXG5cdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDEsXG5cdFx0XHRpc1VzZXJTZWxlY3RhYmxlOiB0cnVlLFxuXHRcdFx0aXNEZWZhdWx0Rm9yTG9jYXRpb246IHt9LFxuXHRcdFx0dGFyZ2V0Q2hhdFNlc3Npb25UeXBlOiBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQsXG5cdFx0fSk7XG5cdFx0Y29uc3QgbGl2ZSA9IHByb3ZpZGVyLmdldE1vZGVsc1NuYXBzaG90KHNlc3Npb24uc2Vzc2lvbklkLCAnY29waWxvdC9yZW1lbWJlcmVkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGVtcHR5OiB7IHJlc29sdXRpb246IGVtcHR5LmRlc2lyZWRNb2RlbFJlc29sdXRpb24sIG1vZGVsVGFyZ2V0OiBlbXB0eS5tb2RlbFRhcmdldCB9LFxuXHRcdFx0bGl2ZTogeyByZXNvbHV0aW9uOiBsaXZlLmRlc2lyZWRNb2RlbFJlc29sdXRpb24sIG1vZGVsVGFyZ2V0OiBsaXZlLm1vZGVsVGFyZ2V0IH0sXG5cdFx0fSwge1xuXHRcdFx0ZW1wdHk6IHsgcmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICdjb3BpbG90L3JlbWVtYmVyZWQnIH0sIG1vZGVsVGFyZ2V0OiBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQgfSxcblx0XHRcdGxpdmU6IHsgcmVzb2x1dGlvbjogeyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiAnY29waWxvdC9yZW1lbWJlcmVkJyB9LCBtb2RlbFRhcmdldDogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NvcGlsb3QgQ0xJIHNlc3Npb24gbWFwcyB3b3Jrc3BhY2Ugc2VsZWN0aW9uIHRvIEFnZW50IEhvc3QgZm9sZGVyIGNvbmZpZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgYXN5bmMgKCkgPT4gKHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSB9KSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRjb25zdCBwcm92aWRlclNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKSBhcyBJQ29waWxvdENoYXRTZXNzaW9uICYgSURpc3Bvc2FibGUgJiB7IGdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRwcm92aWRlclNlc3Npb24uc2V0SXNvbGF0aW9uTW9kZSgnd29ya3NwYWNlJyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXJTZXNzaW9uLmlzb2xhdGlvbk1vZGUuZ2V0KCksICd3b3Jrc3BhY2UnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyU2Vzc2lvbi5nZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCksIHsgaXNvbGF0aW9uOiAnZm9sZGVyJyB9KTtcblx0XHRwcm92aWRlclNlc3Npb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3BpbG90IENMSSBzZXNzaW9uIG1hcHMgd29ya3RyZWUgc2VsZWN0aW9uIHRvIEFnZW50IEhvc3QgY29uZmlnJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXJGb3JTZW5kVGVzdHMoZGlzcG9zYWJsZXMsIG1vZGVsLCBhc3luYyAoKSA9PiAoeyBraW5kOiAnc2VudCcgYXMgY29uc3QsIGRhdGE6IHt9IGFzIElDaGF0U2VuZFJlcXVlc3REYXRhIH0pKTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpISBhcyBJQ29waWxvdENoYXRTZXNzaW9uICYgSURpc3Bvc2FibGUgJiB7IGdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRwcm92aWRlclNlc3Npb24uc2V0SXNvbGF0aW9uTW9kZSgnd29ya3RyZWUnKTtcblx0XHRwcm92aWRlclNlc3Npb24uc2V0QnJhbmNoKCdtYWluJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyU2Vzc2lvbi5nZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCksIHsgaXNvbGF0aW9uOiAnd29ya3RyZWUnLCBicmFuY2g6ICdtYWluJyB9KTtcblx0XHRwcm92aWRlclNlc3Npb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3BpbG90IENMSSBzZXNzaW9uIGZvcndhcmRzIGdpdC5icmFuY2hQcmVmaXggYXMgd29ya3RyZWVCcmFuY2hQcmVmaXggZm9yIHdvcmt0cmVlIGlzb2xhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjb25maWdTZXJ2aWNlID0gbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSgpO1xuXHRcdGNvbmZpZ1NlcnZpY2Uuc2V0VXNlckNvbmZpZ3VyYXRpb24oJ2dpdC5icmFuY2hQcmVmaXgnLCAndXNlcnMvYWxpY2UvJyk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlckZvclNlbmRUZXN0cyhkaXNwb3NhYmxlcywgbW9kZWwsIGFzeW5jICgpID0+ICh7IGtpbmQ6ICdzZW50JyBhcyBjb25zdCwgZGF0YToge30gYXMgSUNoYXRTZW5kUmVxdWVzdERhdGEgfSksIHsgY29uZmlndXJhdGlvblNlcnZpY2U6IGNvbmZpZ1NlcnZpY2UgfSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLmZpbGUoJy90ZXN0L3Byb2plY3QnKSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRjb25zdCBwcm92aWRlclNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKSEgYXMgSUNvcGlsb3RDaGF0U2Vzc2lvbiAmIElEaXNwb3NhYmxlICYgeyBnZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCk6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH07XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldElzb2xhdGlvbk1vZGUoJ3dvcmt0cmVlJyk7XG5cdFx0cHJvdmlkZXJTZXNzaW9uLnNldEJyYW5jaCgnbWFpbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm92aWRlclNlc3Npb24uZ2V0QWdlbnRIb3N0U2Vzc2lvbkNvbmZpZygpLCB7IGlzb2xhdGlvbjogJ3dvcmt0cmVlJywgYnJhbmNoOiAnbWFpbicsIHdvcmt0cmVlQnJhbmNoUHJlZml4OiAndXNlcnMvYWxpY2UvJyB9KTtcblx0XHRwcm92aWRlclNlc3Npb24uZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdDb3BpbG90IENMSSBzZXNzaW9uIGZvcndhcmRzIGdpdC53b3JrdHJlZUluY2x1ZGVGaWxlcyBmb3Igd29ya3RyZWUgaXNvbGF0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbmZpZ1NlcnZpY2UgPSBuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uZmlnU2VydmljZS5zZXRVc2VyQ29uZmlndXJhdGlvbignZ2l0Lndvcmt0cmVlSW5jbHVkZUZpbGVzJywgWydwcm9kdWN0Lm92ZXJyaWRlcy5qc29uJywgJyoqL25vZGVfbW9kdWxlcy8qKiddKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgYXN5bmMgKCkgPT4gKHsga2luZDogJ3NlbnQnIGFzIGNvbnN0LCBkYXRhOiB7fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSB9KSwgeyBjb25maWd1cmF0aW9uU2VydmljZTogY29uZmlnU2VydmljZSB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbihVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdGNvbnN0IHByb3ZpZGVyU2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQpISBhcyBJQ29waWxvdENoYXRTZXNzaW9uICYgSURpc3Bvc2FibGUgJiB7IGdldEFnZW50SG9zdFNlc3Npb25Db25maWcoKTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfTtcblx0XHRwcm92aWRlclNlc3Npb24uc2V0SXNvbGF0aW9uTW9kZSgnd29ya3RyZWUnKTtcblx0XHRwcm92aWRlclNlc3Npb24uc2V0QnJhbmNoKCdtYWluJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb3ZpZGVyU2Vzc2lvbi5nZXRBZ2VudEhvc3RTZXNzaW9uQ29uZmlnKCksIHtcblx0XHRcdGlzb2xhdGlvbjogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ21haW4nLFxuXHRcdFx0d29ya3RyZWVJbmNsdWRlRmlsZXM6IFsncHJvZHVjdC5vdmVycmlkZXMuanNvbicsICcqKi9ub2RlX21vZHVsZXMvKionXVxuXHRcdH0pO1xuXHRcdHByb3ZpZGVyU2Vzc2lvbi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBhY3Rpb25zIC0tLS0tLS1cblxuXHR0ZXN0KCdhcmNoaXZlU2Vzc2lvbiBzZXRzIGFyY2hpdmVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgYWdlbnRTZXNzaW9uID0gY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihhZ2VudFNlc3Npb24pO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdHByb3ZpZGVyLmdldFNlc3Npb25zKCk7IC8vIEluaXRpYWxpemUgY2FjaGVcblxuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdHByb3ZpZGVyLmFyY2hpdmVTZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhZ2VudFNlc3Npb24uaXNBcmNoaXZlZCgpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgndW5hcmNoaXZlU2Vzc2lvbiBjbGVhcnMgYXJjaGl2ZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBhZ2VudFNlc3Npb24gPSBjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IGFyY2hpdmVkOiB0cnVlIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oYWdlbnRTZXNzaW9uKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF07XG5cdFx0cHJvdmlkZXIudW5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWdlbnRTZXNzaW9uLmlzQXJjaGl2ZWQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFNlc3Npb24gY2FwYWJpbGl0aWVzIC0tLS0tLS1cblxuXHR0ZXN0KCdjb3BpbG90IENMSSBzZXNzaW9ucyBoYXZlIHN1cHBvcnRzTXVsdGlwbGVDaGF0cyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb3BpbG90IGNsb3VkIHNlc3Npb25zIGRvIG5vdCBoYXZlIHN1cHBvcnRzTXVsdGlwbGVDaGF0cyBjYXBhYmlsaXR5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmNhcGFiaWxpdGllcy5nZXQoKS5zdXBwb3J0c011bHRpcGxlQ2hhdHMsIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWQgc2Vzc2lvbiByZXBvcnRzIHRoZSBwcm92aWRlciBwdWxsIHJlcXVlc3QgYW5kIHVzZXMgdGhlIGNhY2hlZCBpY29uIHdoaWxlIGxpdmUgZGF0YSBsb2FkcycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKDcpO1xuXHRcdGNvbnN0IGljb25DYWNoZSA9IG5ldyBUZXN0UHVsbFJlcXVlc3RJY29uQ2FjaGUoKTtcblx0XHRjb25zdCBwclVyaSA9IFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicpO1xuXHRcdGNvbnN0IGNhY2hlZEljb24gPSBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuTWVyZ2VkKTtcblx0XHRpY29uQ2FjaGUuc2V0KHByVXJpLnRvU3RyaW5nKCksIGNhY2hlZEljb24pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRvd25lcjogJ3dyb25nLW93bmVyJyxcblx0XHRcdFx0bmFtZTogJ3dyb25nLXJlcG8nLFxuXHRcdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdFx0cHVsbFJlcXVlc3ROdW1iZXI6IDcsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0VXJsOiBwclVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwdWxsUmVxdWVzdFN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGdpdEh1YlNlcnZpY2UsIHB1bGxSZXF1ZXN0SWNvbkNhY2hlOiBpY29uQ2FjaGUgfSk7XG5cdFx0Y29uc3QgZ2l0SHViSW5mbyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5naXRSZXBvc2l0b3J5Py5naXRIdWJJbmZvLmdldCgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvd25lcjogZ2l0SHViSW5mbz8ub3duZXIsXG5cdFx0XHRyZXBvOiBnaXRIdWJJbmZvPy5yZXBvLFxuXHRcdFx0cHVsbFJlcXVlc3Q6IGdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0ICYmIHtcblx0XHRcdFx0bnVtYmVyOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lm51bWJlcixcblx0XHRcdFx0dXJpOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0LnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRpY29uOiBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lmljb24sXG5cdFx0XHR9LFxuXHRcdFx0bG9va3VwQ2FsbHM6IGdpdEh1YlNlcnZpY2UubG9va3VwQ2FsbHMsXG5cdFx0XHRwdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlQ2FsbHM6IGdpdEh1YlNlcnZpY2UucHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzLFxuXHRcdH0sIHtcblx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0cmVwbzogJ3JlcG8nLFxuXHRcdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdFx0bnVtYmVyOiA0Mixcblx0XHRcdFx0dXJpOiBwclVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRpY29uOiBjYWNoZWRJY29uLFxuXHRcdFx0fSxcblx0XHRcdGxvb2t1cENhbGxzOiAwLFxuXHRcdFx0cHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbG91ZCBzZXNzaW9uIGFjY2VwdHMgcHVsbCByZXF1ZXN0IFVSTC1vbmx5IG1ldGFkYXRhIHdpdGhvdXQgY3JlYXRpbmcgYW4gaW52YWxpZCB3b3Jrc3BhY2UgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0cHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdFx0cHVsbFJlcXVlc3RTdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBnaXRIdWJTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0ud29ya3NwYWNlLmdldCgpO1xuXHRcdGNvbnN0IGdpdEh1YkluZm8gPSB3b3Jrc3BhY2U/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8uZ2V0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHdvcmtzcGFjZVJvb3Q6IHdvcmtzcGFjZT8uZm9sZGVyc1swXT8ucm9vdC50b1N0cmluZygpLFxuXHRcdFx0b3duZXI6IGdpdEh1YkluZm8/Lm93bmVyLFxuXHRcdFx0cmVwbzogZ2l0SHViSW5mbz8ucmVwbyxcblx0XHRcdHB1bGxSZXF1ZXN0OiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdCAmJiB7XG5cdFx0XHRcdG51bWJlcjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5udW1iZXIsXG5cdFx0XHRcdHVyaTogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC51cmkudG9TdHJpbmcoKSxcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0d29ya3NwYWNlUm9vdDogVVJJLnBhcnNlKCd1bmtub3duOi8vLycpLnRvU3RyaW5nKCksXG5cdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdHJlcG86ICdyZXBvJyxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdHVyaTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWQgc2Vzc2lvbiBrZWVwcyBwcm92aWRlci1yZXBvcnRlZCBlbnRlcnByaXNlIFBSIGlkZW50aXR5IHdpdGhvdXQgcHVibGljIEdpdEh1YiBwb2xsaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoNyk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdG93bmVyOiAnd3Jvbmctb3duZXInLFxuXHRcdFx0XHRuYW1lOiAnd3JvbmctcmVwbycsXG5cdFx0XHRcdGhvc3Q6ICdnaXRodWIuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdFx0cHVsbFJlcXVlc3ROdW1iZXI6IDcsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuZXhhbXBsZS5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdFx0cHVsbFJlcXVlc3RTdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBnaXRIdWJTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IGdpdEh1YkluZm8gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKT8uZm9sZGVyc1swXT8uZ2l0UmVwb3NpdG9yeT8uZ2l0SHViSW5mby5nZXQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0b3duZXI6IGdpdEh1YkluZm8/Lm93bmVyLFxuXHRcdFx0cmVwbzogZ2l0SHViSW5mbz8ucmVwbyxcblx0XHRcdHB1bGxSZXF1ZXN0OiBnaXRIdWJJbmZvPy5wdWxsUmVxdWVzdCAmJiB7XG5cdFx0XHRcdG51bWJlcjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5udW1iZXIsXG5cdFx0XHRcdHVyaTogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC51cmkudG9TdHJpbmcoKSxcblx0XHRcdFx0aWNvbjogZ2l0SHViSW5mby5wdWxsUmVxdWVzdC5pY29uLFxuXHRcdFx0fSxcblx0XHRcdGxvb2t1cENhbGxzOiBnaXRIdWJTZXJ2aWNlLmxvb2t1cENhbGxzLFxuXHRcdFx0cHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZUNhbGxzOiBnaXRIdWJTZXJ2aWNlLnB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2VDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdHJlcG86ICdyZXBvJyxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdHVyaTogJ2h0dHBzOi8vZ2l0aHViLmV4YW1wbGUuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdGljb246IGNvbXB1dGVQdWxsUmVxdWVzdEljb24oR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuKSxcblx0XHRcdH0sXG5cdFx0XHRsb29rdXBDYWxsczogMCxcblx0XHRcdHB1bGxSZXF1ZXN0TW9kZWxSZWZlcmVuY2VDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xvdWQgc2Vzc2lvbiBpbmZlcnMgYSBwcm92aWRlci1vbWl0dGVkIHB1bGwgcmVxdWVzdCBmcm9tIGl0cyBicmFuY2ggYW5kIHVwZGF0ZXMgdGhlIGxpdmUgaWNvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKDQyKTtcblx0XHRjb25zdCBpY29uQ2FjaGUgPSBuZXcgVGVzdFB1bGxSZXF1ZXN0SWNvbkNhY2hlKCk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRcdGJyYW5jaDogJ2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBnaXRIdWJTZXJ2aWNlLCBwdWxsUmVxdWVzdEljb25DYWNoZTogaWNvbkNhY2hlIH0pO1xuXHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKSEuZm9sZGVyc1swXS5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvO1xuXHRcdGNvbnN0IGZpcnN0T2JzZXJ2YXRpb24gPSBkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4gZ2l0SHViSW5mb09icy5yZWFkKHJlYWRlcikpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdGNvbnN0IGJlZm9yZUxpdmVVcGRhdGUgPSBnaXRIdWJJbmZvT2JzLmdldCgpPy5wdWxsUmVxdWVzdDtcblxuXHRcdGdpdEh1YlNlcnZpY2Uuc2V0UHVsbFJlcXVlc3QoY3JlYXRlUHVsbFJlcXVlc3QoR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5NZXJnZWQpKTtcblx0XHRjb25zdCBhZnRlckxpdmVVcGRhdGUgPSBnaXRIdWJJbmZvT2JzLmdldCgpPy5wdWxsUmVxdWVzdDtcblx0XHRmaXJzdE9ic2VydmF0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGxldCBmaXJzdFJlb2JzZXJ2ZWROdW1iZXI6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0XHRsZXQgY2FwdHVyZWQgPSBmYWxzZTtcblx0XHRjb25zdCBzZWNvbmRPYnNlcnZhdGlvbiA9IGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdGNvbnN0IHB1bGxSZXF1ZXN0TnVtYmVyID0gZ2l0SHViSW5mb09icy5yZWFkKHJlYWRlcik/LnB1bGxSZXF1ZXN0Py5udW1iZXI7XG5cdFx0XHRpZiAoIWNhcHR1cmVkKSB7XG5cdFx0XHRcdGZpcnN0UmVvYnNlcnZlZE51bWJlciA9IHB1bGxSZXF1ZXN0TnVtYmVyO1xuXHRcdFx0XHRjYXB0dXJlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlY29uZE9ic2VydmF0aW9uKTtcblx0XHRtb2RlbC5yZXBsYWNlU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCxcblx0XHRcdHRpdGxlOiAnVXBkYXRlZCBDbG91ZCBTZXNzaW9uJyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdG93bmVyOiAnb3duZXInLFxuXHRcdFx0XHRuYW1lOiAncmVwbycsXG5cdFx0XHRcdGJyYW5jaDogJ2ZlYXR1cmUnLFxuXHRcdFx0fSxcblx0XHR9KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGJlZm9yZUxpdmVVcGRhdGU6IGJlZm9yZUxpdmVVcGRhdGUgJiYge1xuXHRcdFx0XHRudW1iZXI6IGJlZm9yZUxpdmVVcGRhdGUubnVtYmVyLFxuXHRcdFx0XHR1cmk6IGJlZm9yZUxpdmVVcGRhdGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGljb246IGJlZm9yZUxpdmVVcGRhdGUuaWNvbixcblx0XHRcdH0sXG5cdFx0XHRhZnRlckxpdmVVcGRhdGU6IGFmdGVyTGl2ZVVwZGF0ZSAmJiB7XG5cdFx0XHRcdG51bWJlcjogYWZ0ZXJMaXZlVXBkYXRlLm51bWJlcixcblx0XHRcdFx0dXJpOiBhZnRlckxpdmVVcGRhdGUudXJpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGljb246IGFmdGVyTGl2ZVVwZGF0ZS5pY29uLFxuXHRcdFx0fSxcblx0XHRcdGxvb2t1cENhbGxzOiBnaXRIdWJTZXJ2aWNlLmxvb2t1cENhbGxzLFxuXHRcdFx0Y2FjaGVkSWNvbjogaWNvbkNhY2hlLmdldCgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicpLFxuXHRcdFx0Zmlyc3RSZW9ic2VydmVkTnVtYmVyLFxuXHRcdFx0bnVtYmVyQWZ0ZXJVcGRhdGU6IGdpdEh1YkluZm9PYnMuZ2V0KCk/LnB1bGxSZXF1ZXN0Py5udW1iZXIsXG5cdFx0fSwge1xuXHRcdFx0YmVmb3JlTGl2ZVVwZGF0ZToge1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdFx0aWNvbjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4pLFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyTGl2ZVVwZGF0ZToge1xuXHRcdFx0XHRudW1iZXI6IDQyLFxuXHRcdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdFx0aWNvbjogY29tcHV0ZVB1bGxSZXF1ZXN0SWNvbihHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk1lcmdlZCksXG5cdFx0XHR9LFxuXHRcdFx0bG9va3VwQ2FsbHM6IDEsXG5cdFx0XHRjYWNoZWRJY29uOiBjb21wdXRlUHVsbFJlcXVlc3RJY29uKEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUuTWVyZ2VkKSxcblx0XHRcdGZpcnN0UmVvYnNlcnZlZE51bWJlcjogNDIsXG5cdFx0XHRudW1iZXJBZnRlclVwZGF0ZTogNDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Nsb3VkIHNlc3Npb24gd2FpdHMgZm9yIHByb3ZpZGVyIFBSIG1ldGFkYXRhIGFmdGVyIGFuIHVuc3VjY2Vzc2Z1bCBicmFuY2ggbG9va3VwIHdpdGhvdXQgcG9sbGluZyBvbiB1bnJlbGF0ZWQgdXBkYXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCBnaXRIdWJTZXJ2aWNlID0gbmV3IFRlc3RHaXRIdWJTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgbWV0YWRhdGEgPSB7XG5cdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdG5hbWU6ICdyZXBvJyxcblx0XHRcdGJyYW5jaDogJ2ZlYXR1cmUnLFxuXHRcdH07XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBtZXRhZGF0YSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCwgeyBnaXRIdWJTZXJ2aWNlIH0pO1xuXHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLndvcmtzcGFjZS5nZXQoKSEuZm9sZGVyc1swXS5naXRSZXBvc2l0b3J5IS5naXRIdWJJbmZvO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiBnaXRIdWJJbmZvT2JzLnJlYWQocmVhZGVyKSkpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0bW9kZWwucmVwbGFjZVNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwge1xuXHRcdFx0cHJvdmlkZXJUeXBlOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsXG5cdFx0XHR0aXRsZTogJ1VwZGF0ZWQgQ2xvdWQgU2Vzc2lvbicsXG5cdFx0XHRtZXRhZGF0YSxcblx0XHR9KSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdG1vZGVsLnJlcGxhY2VTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHtcblx0XHRcdHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLFxuXHRcdFx0bWV0YWRhdGE6IHtcblx0XHRcdFx0Li4ubWV0YWRhdGEsXG5cdFx0XHRcdHB1bGxSZXF1ZXN0VXJsOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9va3VwQ2FsbHM6IGdpdEh1YlNlcnZpY2UubG9va3VwQ2FsbHMsXG5cdFx0XHRwdWxsUmVxdWVzdDogZ2l0SHViSW5mb09icy5nZXQoKT8ucHVsbFJlcXVlc3QgJiYge1xuXHRcdFx0XHRudW1iZXI6IGdpdEh1YkluZm9PYnMuZ2V0KCkhLnB1bGxSZXF1ZXN0IS5udW1iZXIsXG5cdFx0XHRcdHVyaTogZ2l0SHViSW5mb09icy5nZXQoKSEucHVsbFJlcXVlc3QhLnVyaS50b1N0cmluZygpLFxuXHRcdFx0fSxcblx0XHR9LCB7XG5cdFx0XHRsb29rdXBDYWxsczogMSxcblx0XHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRcdG51bWJlcjogNDIsXG5cdFx0XHRcdHVyaTogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbm9uLWNsb3VkIHNlc3Npb25zIGRvIG5vdCBpbmZlciBwdWxsIHJlcXVlc3RzIGZyb20gYnJhbmNoIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgZ2l0SHViU2VydmljZSA9IG5ldyBUZXN0R2l0SHViU2VydmljZSg0Mik7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7XG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRvd25lcjogJ293bmVyJyxcblx0XHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0XHRicmFuY2g6ICdmZWF0dXJlJyxcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwsIHsgZ2l0SHViU2VydmljZSB9KTtcblx0XHRjb25zdCBnaXRIdWJJbmZvT2JzID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS53b3Jrc3BhY2UuZ2V0KCkhLmZvbGRlcnNbMF0uZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbztcblx0XHRkaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyZWFkZXIgPT4gZ2l0SHViSW5mb09icy5yZWFkKHJlYWRlcikpKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb29rdXBDYWxsczogZ2l0SHViU2VydmljZS5sb29rdXBDYWxscyxcblx0XHRcdHB1bGxSZXF1ZXN0OiBnaXRIdWJJbmZvT2JzLmdldCgpPy5wdWxsUmVxdWVzdCxcblx0XHR9LCB7XG5cdFx0XHRsb29rdXBDYWxsczogMCxcblx0XHRcdHB1bGxSZXF1ZXN0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvcGlsb3QgQ0xJIHNlc3Npb25zIGRvIG5vdCBoYXZlIHN1cHBvcnRzTXVsdGlwbGVDaGF0cyB3aGVuIHNldHRpbmcgaXMgZGlzYWJsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IG11bHRpQ2hhdEVuYWJsZWQ6IGZhbHNlIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jYXBhYmlsaXRpZXMuZ2V0KCkuc3VwcG9ydHNNdWx0aXBsZUNoYXRzLCBmYWxzZSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBsaXN0aW5nICYgZ3JvdXBpbmcgLS0tLS0tLVxuXG5cdHRlc3QoJ2VhY2ggc2Vzc2lvbiBoYXMgZXhhY3RseSBvbmUgY2hhdCBpbml0aWFsbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0uY2hhdHMuZ2V0KCkubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NldE1vZGVsIGFwcGxpZXMgdG8gZXhpc3Rpbmcgc2Vzc2lvbnMgYW5kIHRoZWlyIG5ldyBjaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdO1xuXHRcdHByb3ZpZGVyLnNldE1vZGVsKHNlc3Npb24uc2Vzc2lvbklkLCAnY29waWxvdC9ncHQtNG8nKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLm1vZGVsSWQuZ2V0KCksICdjb3BpbG90L2dwdC00bycpO1xuXG5cdFx0Y29uc3QgY2hhdCA9IGF3YWl0IHByb3ZpZGVyLmNyZWF0ZU5ld0NoYXQoc2Vzc2lvbi5zZXNzaW9uSWQpO1xuXHRcdHRyeSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdC5tb2RlbElkLmdldCgpLCAnY29waWxvdC9ncHQtNG8nKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSk7XG5cdFx0fVxuXHR9KTtcblxuXHR0ZXN0KCdzZW5kUmVxdWVzdCB0aHJvd3MgZm9yIHVua25vd24gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBwcm92aWRlci5zZW5kUmVxdWVzdCgnbm9uZXhpc3RlbnQnLCBVUkkucGFyc2UoJ3VudGl0bGVkOmNoYXQnKSwgeyBxdWVyeTogJ3Rlc3QnIH0pLFxuXHRcdFx0L25vdCBmb3VuZC8sXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0U2Vzc2lvbnMgZ3JvdXBzIGNoYXRzIGJ5IHNlc3Npb24gZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMSwgeyB0aXRsZTogJ0NoYXQgMScgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTIsIHsgdGl0bGU6ICdDaGF0IDInIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHQvLyBXaXRob3V0IGV4cGxpY2l0IGdyb3VwaW5nLCBlYWNoIGNoYXQgaXMgaXRzIG93biBzZXNzaW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwcyBjb21taXR0ZWQgY2hhdHMgdXNpbmcgbWV0YWRhdGEuc2Vzc2lvblBhcmVudElkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9yb290LXNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IGNoaWxkMVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL2NoaWxkLXNlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgY2hpbGQyUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvY2hpbGQtc2Vzc2lvbi0yJyB9KTtcblxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyb290UmVzb3VyY2UsIHsgdGl0bGU6ICdSb290JywgY3JlYXRlZEF0OiAxIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oY2hpbGQxUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnQ2hpbGQgMScsXG5cdFx0XHRjcmVhdGVkQXQ6IDIsXG5cdFx0XHRtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nLCBzZXNzaW9uUGFyZW50SWQ6ICdyb290LXNlc3Npb24nIH1cblx0XHR9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGNoaWxkMlJlc291cmNlLCB7XG5cdFx0XHR0aXRsZTogJ0NoaWxkIDInLFxuXHRcdFx0Y3JlYXRlZEF0OiAzLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAncm9vdC1zZXNzaW9uJyB9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZS50b1N0cmluZygpLCByb290UmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29yZGVycyBjaGF0cyB3aXRoaW4gYSBncm91cGVkIHNlc3Npb24gYnkgY3JlYXRlZEF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9yb290LXNlc3Npb24nIH0pO1xuXHRcdGNvbnN0IG9sZGVyQ2hpbGRSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9vbGRlci1jaGlsZCcgfSk7XG5cdFx0Y29uc3QgbmV3ZXJDaGlsZFJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL25ld2VyLWNoaWxkJyB9KTtcblxuXHRcdC8vIEFkZCBvdXQgb2Ygb3JkZXIgdG8gZW5zdXJlIGdyb3VwaW5nIG9yZGVyIGlzIGRyaXZlbiBieSBjcmVhdGVkQXQgcmF0aGVyIHRoYW4gaW5zZXJ0aW9uIG9yZGVyLlxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihuZXdlckNoaWxkUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnTmV3ZXIgQ2hpbGQnLFxuXHRcdFx0Y3JlYXRlZEF0OiAzMCxcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ3Jvb3Qtc2Vzc2lvbicgfVxuXHRcdH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocm9vdFJlc291cmNlLCB7IHRpdGxlOiAnUm9vdCcsIGNyZWF0ZWRBdDogMTAgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihvbGRlckNoaWxkUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnT2xkZXIgQ2hpbGQnLFxuXHRcdFx0Y3JlYXRlZEF0OiAyMCxcblx0XHRcdG1ldGFkYXRhOiB7IHJlcG9zaXRvcnlQYXRoOiAnL3Rlc3QvcmVwbycsIHNlc3Npb25QYXJlbnRJZDogJ3Jvb3Qtc2Vzc2lvbicgfVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0c2Vzc2lvbnNbMF0uY2hhdHMuZ2V0KCkubWFwKGNoYXQgPT4gY2hhdC5yZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHRcdFtyb290UmVzb3VyY2UudG9TdHJpbmcoKSwgb2xkZXJDaGlsZFJlc291cmNlLnRvU3RyaW5nKCksIG5ld2VyQ2hpbGRSZXNvdXJjZS50b1N0cmluZygpXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dyb3VwcyBjaGlsZCBzZXNzaW9ucyBldmVuIHdoZW4gdGhlIHBhcmVudC9yb290IHNlc3Npb24gaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRjb25zdCBvcnBoYW4xUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvb3JwaGFuLWNoaWxkLTEnIH0pO1xuXHRcdGNvbnN0IG9ycGhhbjJSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9vcnBoYW4tY2hpbGQtMicgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXG5cdFx0cHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTsgLy8gaW5pdGlhbGl6ZSBjYWNoZVxuXG5cdFx0Y29uc3QgY2hhbmdlczogSVNlc3Npb25DaGFuZ2VFdmVudFtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyLm9uRGlkQ2hhbmdlU2Vzc2lvbnMoZSA9PiBjaGFuZ2VzLnB1c2goZSkpKTtcblxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihvcnBoYW4xUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnT3JwaGFuIENoaWxkIDEnLFxuXHRcdFx0Y3JlYXRlZEF0OiAxLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAnbWlzc2luZy1yb290JyB9XG5cdFx0fSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihvcnBoYW4yUmVzb3VyY2UsIHtcblx0XHRcdHRpdGxlOiAnT3JwaGFuIENoaWxkIDInLFxuXHRcdFx0Y3JlYXRlZEF0OiAyLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAnbWlzc2luZy1yb290JyB9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNlc3Npb25zWzBdLmNoYXRzLmdldCgpLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRbb3JwaGFuMVJlc291cmNlLnRvU3RyaW5nKCksIG9ycGhhbjJSZXNvdXJjZS50b1N0cmluZygpXVxuXHRcdCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLm1hcChlID0+ICh7IGFkZGVkOiBlLmFkZGVkLmxlbmd0aCwgY2hhbmdlZDogZS5jaGFuZ2VkLmxlbmd0aCB9KSksIFtcblx0XHRcdHsgYWRkZWQ6IDEsIGNoYW5nZWQ6IDAgfSxcblx0XHRcdHsgYWRkZWQ6IDAsIGNoYW5nZWQ6IDEgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZ3JvdXBzIG5lc3RlZCBwYXJlbnQgY2hhaW5zIHVuZGVyIHRoZSB1bHRpbWF0ZSByb290JywgKCkgPT4ge1xuXHRcdGNvbnN0IG1pZGRsZVJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL21pZGRsZS1zZXNzaW9uJyB9KTtcblx0XHRjb25zdCBsZWFmUmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvbGVhZi1zZXNzaW9uJyB9KTtcblxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihtaWRkbGVSZXNvdXJjZSwge1xuXHRcdFx0dGl0bGU6ICdNaWRkbGUgU2Vzc2lvbicsXG5cdFx0XHRjcmVhdGVkQXQ6IDIsXG5cdFx0XHRtZXRhZGF0YTogeyByZXBvc2l0b3J5UGF0aDogJy90ZXN0L3JlcG8nLCBzZXNzaW9uUGFyZW50SWQ6ICdtaXNzaW5nLXJvb3QnIH1cblx0XHR9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKGxlYWZSZXNvdXJjZSwge1xuXHRcdFx0dGl0bGU6ICdMZWFmIFNlc3Npb24nLFxuXHRcdFx0Y3JlYXRlZEF0OiAzLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAnbWlkZGxlLXNlc3Npb24nIH1cblx0XHR9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHNlc3Npb25zWzBdLmNoYXRzLmdldCgpLm1hcChjaGF0ID0+IGNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRbbWlkZGxlUmVzb3VyY2UudG9TdHJpbmcoKSwgbGVhZlJlc291cmNlLnRvU3RyaW5nKCldXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiB0aXRsZSBjb21lcyBmcm9tIHByaW1hcnkgKGZpcnN0KSBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHRpdGxlOiAnUHJpbWFyeSBUaXRsZScgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS50aXRsZS5nZXQoKSwgJ1ByaW1hcnkgVGl0bGUnKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBoYXMgbWFpbkNoYXQgc2V0IHRvIHRoZSBmaXJzdCBjaGF0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25zWzBdLm1haW5DaGF0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSwgcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gcmVtb3ZlcyBzZXNzaW9uIGZyb20gbW9kZWwgYW5kIGxpc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMSwgeyB0aXRsZTogJ1Nlc3Npb24gMScgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTIsIHsgdGl0bGU6ICdTZXNzaW9uIDInIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgMik7XG5cblx0XHRhd2FpdCBwcm92aWRlci5kZWxldGVTZXNzaW9uKHNlc3Npb25zWzBdLnNlc3Npb25JZCk7XG5cblx0XHRjb25zdCByZW1haW5pbmdTZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZ1Nlc3Npb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlbWFpbmluZ1Nlc3Npb25zWzBdLnRpdGxlLmdldCgpLCAnU2Vzc2lvbiAyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gcGFzc2VzIENvcGlsb3QgQ0xJIHNlc3Npb24gbGFiZWwgdG8gZGVsZXRlIGNvbW1hbmQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQ29waWxvdENMSVNlc3Npb25UeXBlLmlkLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgY29tbWFuZEV4ZWN1dGlvbnM6IElFeGVjdXRlZENvbW1hbmRbXSA9IFtdO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCwgdGl0bGU6ICdGaXggQnVpbGQnIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsLCB7IGNvbW1hbmRFeGVjdXRpb25zIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGF3YWl0IHByb3ZpZGVyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvbnNbMF0uc2Vzc2lvbklkKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tbWFuZEV4ZWN1dGlvbnMubWFwKGNvbW1hbmQgPT4gKHtcblx0XHRcdGlkOiBjb21tYW5kLmlkLFxuXHRcdFx0aXRlbXM6IEFycmF5LmlzQXJyYXkoY29tbWFuZC5hcmdzWzBdKVxuXHRcdFx0XHQ/IGNvbW1hbmQuYXJnc1swXS5tYXAoaXRlbSA9PiBpc0NvbW1hbmRTZXNzaW9uSXRlbShpdGVtKSA/IHsgcmVzb3VyY2U6IGl0ZW0ucmVzb3VyY2UudG9TdHJpbmcoKSwgbGFiZWw6IGl0ZW0ubGFiZWwgfSA6IHVuZGVmaW5lZClcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRvcHRpb25zOiBjb21tYW5kLmFyZ3NbMV0sXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICdhZ2VudHMuZ2l0aHViLmNvcGlsb3QuY2xpLmRlbGV0ZVNlc3Npb25zJyxcblx0XHRcdGl0ZW1zOiBbeyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgbGFiZWw6ICdGaXggQnVpbGQnIH1dLFxuXHRcdFx0b3B0aW9uczogeyBza2lwQ29uZmlybWF0aW9uOiB0cnVlIH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVDaGF0IHdpdGggc2luZ2xlIGNoYXQgZGVsZWdhdGVzIHRvIGRlbGV0ZVNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UpKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zWzBdO1xuXG5cdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlQ2hhdChzZXNzaW9uLnNlc3Npb25JZCwgcmVzb3VyY2UpO1xuXG5cdFx0Ly8gTW9kZWwgc2hvdWxkIG5vIGxvbmdlciBoYXZlIHRoZSBzZXNzaW9uXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1vZGVsLnNlc3Npb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZUNoYXQgdGhyb3dzIHdoZW4gc2Vzc2lvbiBkb2VzIG5vdCBzdXBwb3J0IG11bHRpLWNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zWzBdO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBwcm92aWRlci5kZWxldGVDaGF0KHNlc3Npb24uc2Vzc2lvbklkLCByZXNvdXJjZSksXG5cdFx0XHQvbm90IHN1cHBvcnRlZCB3aGVuIG11bHRpLWNoYXQgaXMgZGlzYWJsZWQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gZ3JvdXAgY2FjaGUgaXMgaW52YWxpZGF0ZWQgb24gc2Vzc2lvbiByZW1vdmFsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTInIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTEsIHsgdGl0bGU6ICdTZXNzaW9uIDEnIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UyLCB7IHRpdGxlOiAnU2Vzc2lvbiAyJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cblx0XHQvLyBJbml0aWFsaXplIHNlc3Npb25zXG5cdFx0bGV0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIFJlbW92ZSBvbmUgZnJvbSB0aGUgbW9kZWxcblx0XHRtb2RlbC5yZW1vdmVTZXNzaW9uKHJlc291cmNlMSk7XG5cblx0XHQvLyBSZS1mZXRjaFxuXHRcdHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnNbMF0udGl0bGUuZ2V0KCksICdTZXNzaW9uIDInKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhdHMgb2JzZXJ2YWJsZSB1cGRhdGVzIHdoZW4gZ3JvdXAgbW9kZWwgY2hhbmdlcycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZTEgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0xJyB9KTtcblx0XHRjb25zdCByZXNvdXJjZTIgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0yJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UxLCB7IHRpdGxlOiAnQ2hhdCAxJyB9KSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMiwgeyB0aXRsZTogJ0NoYXQgMicgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMubGVuZ3RoLCAyKTtcblxuXHRcdC8vIEJvdGggYXJlIHNlcGFyYXRlIHNlc3Npb25zIGluaXRpYWxseVxuXHRcdGNvbnN0IHNlc3Npb24xID0gc2Vzc2lvbnNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24xLmNoYXRzLmdldCgpLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Nlc3Npb24gc3RhdHVzIGFnZ3JlZ2F0ZXMgYWNyb3NzIGNoYXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlKSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0Ly8gV2l0aCBhIHNpbmdsZSBjaGF0LCBzZXNzaW9uIHN0YXR1cyBzaG91bGQgbWF0Y2ggdGhlIGNoYXQgc3RhdHVzXG5cdFx0YXNzZXJ0Lm9rKHNlc3Npb25zWzBdLnN0YXR1cy5nZXQoKSAhPT0gdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vzc2lvbiBpc1JlYWQgYWdncmVnYXRlcyBhY3Jvc3MgYWxsIGNoYXRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHJlYWQ6IHRydWUgfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5pc1JlYWQuZ2V0KCksIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXNzaW9uIGlzUmVhZCBpcyBmYWxzZSB3aGVuIGFueSBjaGF0IGlzIHVucmVhZCcsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyByZWFkOiBmYWxzZSB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zWzBdLmlzUmVhZC5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmluZyBhIGNoYXQgZnJvbSBhIGdyb3VwIGZpcmVzIGNoYW5nZWQgKG5vdCByZW1vdmVkKSB3aXRoIGNvcnJlY3Qgc2Vzc2lvbklkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlMSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdGNvbnN0IHJlc291cmNlMiA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTInIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTEsIHsgdGl0bGU6ICdDaGF0IDEnIH0pKTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UyLCB7IHRpdGxlOiAnQ2hhdCAyJyB9KSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyKGRpc3Bvc2FibGVzLCBtb2RlbCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMgPSBwcm92aWRlci5nZXRTZXNzaW9ucygpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9ucy5sZW5ndGgsIDIpO1xuXG5cdFx0Ly8gTWFudWFsbHkgZ3JvdXAgYm90aCBjaGF0cyB1bmRlciB0aGUgZmlyc3Qgc2Vzc2lvblxuXHRcdGNvbnN0IGNoYXQySWQgPSBzZXNzaW9uc1sxXS5zZXNzaW9uSWQ7XG5cdFx0Ly8gQWNjZXNzIHRoZSBncm91cCBtb2RlbCBpbmRpcmVjdGx5IGJ5IGRlbGV0aW5nIHRoZSBzZWNvbmQgc2Vzc2lvbidzIGdyb3VwXG5cdFx0Ly8gYW5kIHJlLWFkZGluZyBpdHMgY2hhdCB0byB0aGUgZmlyc3QgZ3JvdXAgdmlhIGRlbGV0ZUNoYXQgZmxvd1xuXHRcdC8vIEluc3RlYWQsIHNpbXVsYXRlIGJ5IHJlbW92aW5nIHRoZSBzZWNvbmQgY2hhdCBmcm9tIHRoZSBtb2RlbFxuXHRcdGNvbnN0IGNoYW5nZXM6IElTZXNzaW9uQ2hhbmdlRXZlbnRbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRtb2RlbC5yZW1vdmVTZXNzaW9uKHJlc291cmNlMik7XG5cblx0XHQvLyBUaGUgcmVtb3ZlZCBjaGF0IHdhcyBzdGFuZGFsb25lLCBzbyBpdCBzaG91bGQgZmlyZSBhIHJlbW92ZWQgZXZlbnRcblx0XHRhc3NlcnQub2soY2hhbmdlcy5sZW5ndGggPiAwKTtcblx0XHRjb25zdCBsYXN0Q2hhbmdlID0gY2hhbmdlc1tjaGFuZ2VzLmxlbmd0aCAtIDFdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsYXN0Q2hhbmdlLnJlbW92ZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobGFzdENoYW5nZS5yZW1vdmVkWzBdLnNlc3Npb25JZCwgY2hhdDJJZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ29ic2VydmluZyBtYW55IGdyb3VwZWQgc2Vzc2lvbnMga2VlcHMgb25lIG1lbWJlcnNoaXAgbGlzdGVuZXIgYW5kIHJlY29tcHV0ZXMgb25seSB0aGUgYWZmZWN0ZWQgZ3JvdXAnLCAoKSA9PiB7XG5cdFx0Ly8gU2V2ZXJhbCBpbmRlcGVuZGVudCByb290IGdyb3VwcywgZWFjaCBvYnNlcnZlZCBmb3IgaXRzIGNoYXQgbGlzdC5cblx0XHRjb25zdCBzZXNzaW9uQ291bnQgPSA4O1xuXHRcdGZvciAobGV0IGkgPSAwOyBpIDwgc2Vzc2lvbkNvdW50OyBpKyspIHtcblx0XHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiBgL3Jvb3QtJHtpfWAgfSk7XG5cdFx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24ocmVzb3VyY2UsIHsgdGl0bGU6IGBSb290ICR7aX1gLCBjcmVhdGVkQXQ6IDEgfSkpO1xuXHRcdH1cblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb25zLmxlbmd0aCwgc2Vzc2lvbkNvdW50KTtcblxuXHRcdC8vIE9ic2VydmUgZXZlcnkgc2Vzc2lvbidzIGNoYXQgbGlzdC4gQmVmb3JlIHRoZSBmaXggZWFjaCBvYnNlcnZlZCBzZXNzaW9uIGFkZGVkXG5cdFx0Ly8gaXRzIG93biBmaWx0ZXJlZCBsaXN0ZW5lciB0byB0aGUgc2hhcmVkIG1lbWJlcnNoaXAgZW1pdHRlciwgc28gbGlzdGVuZXJzIGdyZXdcblx0XHQvLyB3aXRoIHRoZSBzZXNzaW9uIGNvdW50OyBub3cgYSBzaW5nbGUgcHJvdmlkZXItd2lkZSBmYW4tb3V0IHNlcnZlcyBhbGwgb2YgdGhlbS5cblx0XHRjb25zdCBjaGF0Q291bnRzID0gc2Vzc2lvbnMubWFwKCgpID0+IDApO1xuXHRcdHNlc3Npb25zLmZvckVhY2goKHNlc3Npb24sIGkpID0+IHtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRcdHNlc3Npb24uY2hhdHMucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRjaGF0Q291bnRzW2ldKys7XG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cblx0XHQvLyBFeGFjdGx5IG9uZSBsaXN0ZW5lciBvbiB0aGUgbWVtYmVyc2hpcCBlbWl0dGVyIHJlZ2FyZGxlc3Mgb2YgaG93IG1hbnkgc2Vzc2lvbnNcblx0XHQvLyBhcmUgb2JzZXJ2ZWQgKHRoZSBwcm92aWRlci13aWRlIGZhbi1vdXQpLCBhbmQgZWFjaCBhdXRvcnVuIHJhbiBvbmNlIGluaXRpYWxseS5cblx0XHRjb25zdCBtZW1iZXJzaGlwRW1pdHRlciA9IChwcm92aWRlciBhcyB1bmtub3duIGFzIHsgX29uRGlkR3JvdXBNZW1iZXJzaGlwQ2hhbmdlOiB7IF9zaXplOiBudW1iZXIgfSB9KS5fb25EaWRHcm91cE1lbWJlcnNoaXBDaGFuZ2U7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lbWJlcnNoaXBFbWl0dGVyLl9zaXplLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYXRDb3VudHMsIHNlc3Npb25zLm1hcCgoKSA9PiAxKSk7XG5cblx0XHQvLyBBZGQgYSBjaGlsZCBjaGF0IGludG8gdGhlIEZJUlNUIGdyb3VwIG9ubHksIGNoYW5naW5nIGp1c3QgdGhhdCBncm91cCdzIG1lbWJlcnNoaXAuXG5cdFx0Y29uc3QgY2hpbGQgPSBVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvcm9vdC0wLWNoaWxkJyB9KTtcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oY2hpbGQsIHtcblx0XHRcdHRpdGxlOiAnQ2hpbGQnLFxuXHRcdFx0Y3JlYXRlZEF0OiAyLFxuXHRcdFx0bWV0YWRhdGE6IHsgcmVwb3NpdG9yeVBhdGg6ICcvdGVzdC9yZXBvJywgc2Vzc2lvblBhcmVudElkOiAncm9vdC0wJyB9LFxuXHRcdH0pKTtcblxuXHRcdC8vIExpc3RlbmVyIGNvdW50IGlzIHN0aWxsIG9uZSwgb25seSB0aGUgZmlyc3QgZ3JvdXAgcmVjb21wdXRlZCAoaXRzIGNoYXQgbGlzdCBncmV3XG5cdFx0Ly8gdG8gdHdvKSwgYW5kIG5vIG90aGVyIHNlc3Npb24ncyBjaGF0cyBvYnNlcnZhYmxlIHB1Ymxpc2hlZCBhIGNoYW5nZS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWVtYmVyc2hpcEVtaXR0ZXIuX3NpemUsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uc1swXS5jaGF0cy5nZXQoKS5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhdENvdW50cywgWzIsIC4uLnNlc3Npb25zLnNsaWNlKDEpLm1hcCgoKSA9PiAxKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTZXNzaW9ucyBkb2VzIG5vdCBjcmVhdGUgZHVwbGljYXRlIGdyb3VwcyBvbiByZXBlYXRlZCBjYWxscycsICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQmFja2dyb3VuZCwgcGF0aDogJy9zZXNzaW9uLTEnIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXG5cdFx0Ly8gQ2FsbCBnZXRTZXNzaW9ucyBtdWx0aXBsZSB0aW1lc1xuXHRcdGNvbnN0IHNlc3Npb25zMSA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnMyID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uczEubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMyLmxlbmd0aCwgMSk7XG5cdFx0Ly8gU2hvdWxkIHJldHVybiB0aGUgc2FtZSBjYWNoZWQgc2Vzc2lvbiBvYmplY3Rcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vzc2lvbnMxWzBdLCBzZXNzaW9uczJbMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGFuZ2VkIGV2ZW50cyBhcmUgbm90IGR1cGxpY2F0ZWQgd2hlbiBtdWx0aXBsZSBjaGF0cyB1cGRhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzb3VyY2UxID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMScgfSk7XG5cdFx0Y29uc3QgcmVzb3VyY2UyID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Nlc3Npb24tMicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlMSwgeyB0aXRsZTogJ1Nlc3Npb24gMScgfSkpO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZTIsIHsgdGl0bGU6ICdTZXNzaW9uIDInIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRwcm92aWRlci5nZXRTZXNzaW9ucygpOyAvLyBJbml0aWFsaXplXG5cblx0XHRjb25zdCBjaGFuZ2VzOiBJU2Vzc2lvbkNoYW5nZUV2ZW50W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXIub25EaWRDaGFuZ2VTZXNzaW9ucyhlID0+IGNoYW5nZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gVHJpZ2dlciBhIHJlZnJlc2ggdGhhdCB1cGRhdGVzIGJvdGggc2Vzc2lvbnNcblx0XHRtb2RlbC5hZGRTZXNzaW9uKGNyZWF0ZU1vY2tBZ2VudFNlc3Npb24oXG5cdFx0XHRVUkkuZnJvbSh7IHNjaGVtZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkJhY2tncm91bmQsIHBhdGg6ICcvc2Vzc2lvbi0zJyB9KSxcblx0XHRcdHsgdGl0bGU6ICdTZXNzaW9uIDMnIH1cblx0XHQpKTtcblxuXHRcdC8vIEVhY2ggZXZlbnQgc2hvdWxkIG5vdCBoYXZlIGR1cGxpY2F0ZXMgaW4gdGhlIGNoYW5nZWQgYXJyYXlcblx0XHRmb3IgKGNvbnN0IGNoYW5nZSBvZiBjaGFuZ2VzKSB7XG5cdFx0XHRjb25zdCBjaGFuZ2VkSWRzID0gY2hhbmdlLmNoYW5nZWQubWFwKHMgPT4gcy5zZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3QgdW5pcXVlSWRzID0gbmV3IFNldChjaGFuZ2VkSWRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkSWRzLmxlbmd0aCwgdW5pcXVlSWRzLnNpemUsICdDaGFuZ2VkIGV2ZW50cyBzaG91bGQgbm90IGhhdmUgZHVwbGljYXRlcycpO1xuXHRcdH1cblx0fSk7XG5cblx0Ly8gLS0tLSBCcm93c2UgYWN0aW9ucyAtLS0tLS0tXG5cblx0dGVzdCgncmVzb2x2ZVdvcmtzcGFjZSBjcmVhdGVzIHByb3BlciB3b3Jrc3BhY2Ugc3RydWN0dXJlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZSgnL3Rlc3QvcHJvamVjdCcpO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gcHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZSh1cmkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHdvcmtzcGFjZSwgJ3Jlc29sdmVXb3Jrc3BhY2Ugc2hvdWxkIHJlc29sdmUgZmlsZTovLyBVUklzJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5sYWJlbCwgJ3Byb2plY3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlLmZvbGRlcnNbMF0ucm9vdC50b1N0cmluZygpLCB1cmkudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5yZXF1aXJlc1dvcmtzcGFjZVRydXN0LCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnYnVpbGRzIGFuIHVua25vd24gd29ya3NwYWNlIGZhbGxiYWNrIHdoZW4gcmVwb3NpdG9yeSBtZXRhZGF0YSBpcyBtaXNzaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5CYWNrZ3JvdW5kLCBwYXRoOiAnL3Vua25vd24td29ya3NwYWNlLXNlc3Npb24nIH0pO1xuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihyZXNvdXJjZSwgeyBtZXRhZGF0YToge30gfSkpO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVQcm92aWRlcihkaXNwb3NhYmxlcywgbW9kZWwpO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gcHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBzZXNzaW9uc1swXS53b3Jrc3BhY2UuZ2V0KCk7XG5cblx0XHRhc3NlcnQub2sod29ya3NwYWNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlLmZvbGRlcnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwod29ya3NwYWNlLmZvbGRlcnNbMF0ucm9vdC50b1N0cmluZygpLCBVUkkucGFyc2UoJ3Vua25vd246Ly8vJykudG9TdHJpbmcoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHdvcmtzcGFjZS5yZXF1aXJlc1dvcmtzcGFjZVRydXN0LCB0cnVlKTtcblxuXHRcdC8vIFRoZSBjb3JlIHN5bXB0b20gb2YgIzMxMDc3NzogYW55IG9mIHRoZXNlIGNhbGxzIG11c3Qgbm90IHRocm93LlxuXHRcdGFzc2VydC5kb2VzTm90VGhyb3coKCkgPT4gVVJJLmpvaW5QYXRoKHdvcmtzcGFjZS5mb2xkZXJzWzBdLnJvb3QsICcudnNjb2RlJywgJ3NldHRpbmdzLmpzb24nKSk7XG5cdFx0YXNzZXJ0LmRvZXNOb3RUaHJvdygoKSA9PiBVUkkuam9pblBhdGgod29ya3NwYWNlLmZvbGRlcnNbMF0ucm9vdCwgJy52c2NvZGUvZXh0ZW5zaW9ucy5qc29uJykpO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlbmFtZSAtLS0tLS0tXG5cblx0dGVzdCgncmVuYW1lQ2hhdCB0aHJvd3MgZm9yIHVuc3VwcG9ydGVkIHNlc3Npb24gdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCByZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6ICcvY2xvdWQtc2Vzc2lvbicgfSk7XG5cdFx0bW9kZWwuYWRkU2Vzc2lvbihjcmVhdGVNb2NrQWdlbnRTZXNzaW9uKHJlc291cmNlLCB7IHByb3ZpZGVyVHlwZTogQWdlbnRTZXNzaW9uUHJvdmlkZXJzLkNsb3VkIH0pKTtcblxuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXIoZGlzcG9zYWJsZXMsIG1vZGVsKTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IHByb3ZpZGVyLmdldFNlc3Npb25zKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhcblx0XHRcdCgpID0+IHByb3ZpZGVyLnJlbmFtZUNoYXQoc2Vzc2lvbnNbMF0uc2Vzc2lvbklkLCByZXNvdXJjZSwgJ05ldyBUaXRsZScpLFxuXHRcdFx0L25vdCBzdXBwb3J0ZWQvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gVW5jb21taXR0ZWQgdGVtcCBzZXNzaW9uIGNsZWFudXAgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3VuY29tbWl0dGVkIHRlbXAgc2Vzc2lvbiBjbGVhbnVwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZSA9IFVSSS5maWxlKCcvdGVzdC9yZXBvJyk7XG5cblx0XHQvKipcblx0XHQgKiBSZXR1cm5zIGEgcHJvdmlkZXIgd2lyZWQgdXAgc28gdGhhdCBzZW5kUmVxdWVzdCBrZWVwcyB0aGUgcmVxdWVzdFxuXHRcdCAqIGluLWZsaWdodCBpbmRlZmluaXRlbHkuIEFsc28gcmV0dXJucyBoZWxwZXJzIHRvIHJlc29sdmUgdGhlIHJlcXVlc3Rcblx0XHQgKiBhcyBhIGNhbmNlbGxhdGlvbiAoc28gdGhlIHByb3ZpZGVyIGNsZWFucyB1cCBwcm9tcHRseSBpbiB0ZXN0cykuXG5cdFx0ICovXG5cdFx0ZnVuY3Rpb24gbWFrZUluRmxpZ2h0UHJvdmlkZXIoKToge1xuXHRcdFx0cHJvdmlkZXI6IENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcjtcblx0XHRcdGNhbmNlbFJlcXVlc3Q6ICgpID0+IHZvaWQ7XG5cdFx0fSB7XG5cdFx0XHRsZXQgcmVzb2x2ZUNvbXBsZXRlITogKCkgPT4gdm9pZDtcblx0XHRcdGxldCByZXNvbHZlQ3JlYXRlZCE6IChyOiBJQ2hhdFJlc3BvbnNlTW9kZWwpID0+IHZvaWQ7XG5cdFx0XHRjb25zdCByZXNwb25zZUNvbXBsZXRlUHJvbWlzZSA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geyByZXNvbHZlQ29tcGxldGUgPSByOyB9KTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQ3JlYXRlZFByb21pc2UgPSBuZXcgUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWw+KHIgPT4geyByZXNvbHZlQ3JlYXRlZCA9IHI7IH0pO1xuXG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0a2luZDogJ3NlbnQnIGFzIGNvbnN0LFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0cmVzcG9uc2VDb21wbGV0ZVByb21pc2UsXG5cdFx0XHRcdFx0cmVzcG9uc2VDcmVhdGVkUHJvbWlzZSxcblx0XHRcdFx0XHRhZ2VudDogbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdEFnZW50RGF0YT4oKSB7IH0oKSxcblx0XHRcdFx0fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSxcblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0cHJvdmlkZXIsXG5cdFx0XHRcdGNhbmNlbFJlcXVlc3Q6ICgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlQ3JlYXRlZCh7IGlzQ2FuY2VsZWQ6IHRydWUgfSBhcyB1bmtub3duIGFzIElDaGF0UmVzcG9uc2VNb2RlbCk7XG5cdFx0XHRcdFx0cmVzb2x2ZUNvbXBsZXRlKCk7XG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdC8qKiBXYWl0IGZvciB0aGUgcHJvdmlkZXIgdG8gZmlyZSBhbiBcImFkZGVkXCIgc2Vzc2lvbiBjaGFuZ2UgZXZlbnQuICovXG5cdFx0ZnVuY3Rpb24gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcjogQ29waWxvdENoYXRTZXNzaW9uc1Byb3ZpZGVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRyZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdGNvbnN0IGQgPSBwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0XHRcdGlmIChlLmFkZGVkLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdGQuZGlzcG9zZSgpO1xuXHRcdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHR0ZXN0KCdkZWxldGVTZXNzaW9uIHJlbW92ZXMgYSB0ZW1wIHNlc3Npb24gdGhhdCBpcyBhd2FpdGluZyBjb21taXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHByb3ZpZGVyLCBjYW5jZWxSZXF1ZXN0IH0gPSBtYWtlSW5GbGlnaHRQcm92aWRlcigpO1xuXG5cdFx0XHRjb25zdCBuZXdTZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBuZXdTZXNzaW9uLnNlc3Npb25JZDtcblxuXHRcdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBzZW5kUHJvbWlzZSA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ3Rlc3QnIH0pO1xuXHRcdFx0YXdhaXQgYWRkZWQ7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIGFwcGVhciB3aGlsZSBpbi1mbGlnaHQnKTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAwLCAnc2Vzc2lvbiBzaG91bGQgYmUgcmVtb3ZlZCBhZnRlciBkZWxldGVTZXNzaW9uJyk7XG5cblx0XHRcdC8vIENhbmNlbGxhdGlvbiBhZnRlciBkZWxldGUgc2hvdWxkIHJlc29sdmUgY2xlYW5seVxuXHRcdFx0Y2FuY2VsUmVxdWVzdCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3Qoc2VuZFByb21pc2UpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXJjaGl2ZVNlc3Npb24gYXJjaGl2ZXMgYSB0ZW1wIHNlc3Npb24gdGhhdCBpcyBhd2FpdGluZyBjb21taXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB7IHByb3ZpZGVyLCBjYW5jZWxSZXF1ZXN0IH0gPSBtYWtlSW5GbGlnaHRQcm92aWRlcigpO1xuXG5cdFx0XHRjb25zdCBuZXdTZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENvcGlsb3RDTElTZXNzaW9uVHlwZS5pZCk7XG5cdFx0XHRjb25zdCBzZXNzaW9uSWQgPSBuZXdTZXNzaW9uLnNlc3Npb25JZDtcblxuXHRcdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRcdGNvbnN0IGNoYXQgPSBhd2FpdCBwcm92aWRlci5jcmVhdGVOZXdDaGF0KHNlc3Npb25JZCk7XG5cdFx0XHRjb25zdCBzZW5kUHJvbWlzZSA9IHByb3ZpZGVyLnNlbmRSZXF1ZXN0KHNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ3Rlc3QnIH0pO1xuXHRcdFx0YXdhaXQgYWRkZWQ7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIGFwcGVhciB3aGlsZSBpbi1mbGlnaHQnKTtcblxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpLmxlbmd0aCwgMSwgJ3Nlc3Npb24gc2hvdWxkIHN0aWxsIGJlIGluIHRoZSBsaXN0IGFmdGVyIGFyY2hpdmVTZXNzaW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc0FyY2hpdmVkLmdldCgpLCB0cnVlLCAnc2Vzc2lvbiBzaG91bGQgYmUgYXJjaGl2ZWQnKTtcblxuXHRcdFx0Ly8gQ2FuY2VsbGF0aW9uIGFmdGVyIGFyY2hpdmUgc2hvdWxkIHJlc29sdmUgY2xlYW5seVxuXHRcdFx0Y2FuY2VsUmVxdWVzdCgpO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LmRvZXNOb3RSZWplY3Qoc2VuZFByb21pc2UpO1xuXG5cdFx0XHQvLyBDbGVhbiB1cCB0byBhdm9pZCBsZWFrZWQgZGlzcG9zYWJsZVxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYXJjaGl2ZVNlc3Npb24gYXJjaGl2ZXMgYSBzdG9wcGVkIHNlc3Npb24gdGhhdCB3YXMgbmV2ZXIgY29tbWl0dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgeyBwcm92aWRlciwgY2FuY2VsUmVxdWVzdCB9ID0gbWFrZUluRmxpZ2h0UHJvdmlkZXIoKTtcblxuXHRcdFx0Y29uc3QgbmV3U2Vzc2lvbiA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbklkID0gbmV3U2Vzc2lvbi5zZXNzaW9uSWQ7XG5cblx0XHRcdGNvbnN0IGFkZGVkID0gd2FpdEZvclNlc3Npb25BZGRlZChwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uSWQpO1xuXHRcdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uSWQsIGNoYXQucmVzb3VyY2UsIHsgcXVlcnk6ICd0ZXN0JyB9KTtcblx0XHRcdGF3YWl0IGFkZGVkO1xuXG5cdFx0XHQvLyBTdG9wIGJlZm9yZSBjb21taXQgYXJyaXZlcyBcdTIwMTQgc2Vzc2lvbiBzaG91bGQgc3RheSBhcyBjb21wbGV0ZWRcblx0XHRcdGNhbmNlbFJlcXVlc3QoKTtcblx0XHRcdGF3YWl0IHNlbmRQcm9taXNlO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKS5sZW5ndGgsIDEsICdzdG9wcGVkIHNlc3Npb24gc2hvdWxkIHJlbWFpbiBpbiB0aGUgbGlzdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKClbMF0uc3RhdHVzLmdldCgpLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgJ3Nlc3Npb24gc2hvdWxkIGJlIGNvbXBsZXRlZCcpO1xuXG5cdFx0XHRhd2FpdCBwcm92aWRlci5hcmNoaXZlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHByb3ZpZGVyLmdldFNlc3Npb25zKCkubGVuZ3RoLCAxLCAnc2Vzc2lvbiBzaG91bGQgc3RpbGwgYmUgaW4gdGhlIGxpc3QgYWZ0ZXIgYXJjaGl2aW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvdmlkZXIuZ2V0U2Vzc2lvbnMoKVswXS5pc0FyY2hpdmVkLmdldCgpLCB0cnVlLCAnc2Vzc2lvbiBzaG91bGQgYmUgYXJjaGl2ZWQnKTtcblxuXHRcdFx0Ly8gVW5hcmNoaXZlIHNob3VsZCBhbHNvIHdvcmtcblx0XHRcdGF3YWl0IHByb3ZpZGVyLnVuYXJjaGl2ZVNlc3Npb24oc2Vzc2lvbklkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm92aWRlci5nZXRTZXNzaW9ucygpWzBdLmlzQXJjaGl2ZWQuZ2V0KCksIGZhbHNlLCAnc2Vzc2lvbiBzaG91bGQgYmUgdW5hcmNoaXZlZCcpO1xuXG5cdFx0XHQvLyBDbGVhbiB1cCB0byBhdm9pZCBsZWFrZWQgZGlzcG9zYWJsZVxuXHRcdFx0YXdhaXQgcHJvdmlkZXIuZGVsZXRlU2Vzc2lvbihzZXNzaW9uSWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIE5ldyBzZXNzaW9uIGRlZmF1bHQgcGVybWlzc2lvbiBsZXZlbCBzZWVkaW5nIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ25ldyBzZXNzaW9uIGRlZmF1bHQgcGVybWlzc2lvbiBsZXZlbCcsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBVUkkuZmlsZSgnL3Rlc3QvcmVwbycpO1xuXG5cdFx0ZnVuY3Rpb24gbWFrZUNvbmZpZyhvcHRzOiB7IGRlZmF1bHRMZXZlbD86IENoYXRQZXJtaXNzaW9uTGV2ZWw7IHBvbGljeVJlc3RyaWN0ZWQ/OiBib29sZWFuIH0pOiBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2Uge1xuXHRcdFx0Y29uc3QgY29uZmlnID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIHtcblx0XHRcdFx0b3ZlcnJpZGUgaW5zcGVjdDxUPihrZXk6IHN0cmluZyk6IElDb25maWd1cmF0aW9uVmFsdWU8VD4ge1xuXHRcdFx0XHRcdGNvbnN0IGJhc2UgPSBzdXBlci5pbnNwZWN0PFQ+KGtleSk7XG5cdFx0XHRcdFx0aWYgKG9wdHMucG9saWN5UmVzdHJpY3RlZCAmJiBrZXkgPT09IENoYXRDb25maWd1cmF0aW9uLkdsb2JhbEF1dG9BcHByb3ZlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyAuLi5iYXNlLCBwb2xpY3lWYWx1ZTogZmFsc2UgYXMgdW5rbm93biBhcyBUIH07XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdHJldHVybiBiYXNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KCk7XG5cdFx0XHRpZiAob3B0cy5kZWZhdWx0TGV2ZWwpIHtcblx0XHRcdFx0Y29uZmlnLnNldFVzZXJDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLkRlZmF1bHRQZXJtaXNzaW9uTGV2ZWwsIG9wdHMuZGVmYXVsdExldmVsKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBjb25maWc7XG5cdFx0fVxuXG5cdFx0dGVzdCgnQ0xJIHNlc3Npb24gc2VlZHMgcGVybWlzc2lvbiBsZXZlbCBmcm9tIGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbWFrZUNvbmZpZyh7IGRlZmF1bHRMZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvcGlsb3QgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgKCkgPT4gbmV3IFByb21pc2UoKCkgPT4geyB9KSwgeyBjb25maWd1cmF0aW9uU2VydmljZSB9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb25JbmZvLnNlc3Npb25JZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5wZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuQXV0b3BpbG90KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NsYW1wcyB0byBEZWZhdWx0IHdoZW4gY2hhdC50b29scy5nbG9iYWwuYXV0b0FwcHJvdmUgcG9saWN5IGlzIGZhbHNlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBtYWtlQ29uZmlnKHsgZGVmYXVsdExldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9waWxvdCwgcG9saWN5UmVzdHJpY3RlZDogdHJ1ZSB9KTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlUHJvdmlkZXJGb3JTZW5kVGVzdHMoZGlzcG9zYWJsZXMsIG1vZGVsLCAoKSA9PiBuZXcgUHJvbWlzZSgoKSA9PiB7IH0pLCB7IGNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0pO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uSW5mbyA9IHByb3ZpZGVyLmNyZWF0ZU5ld1Nlc3Npb24od29ya3NwYWNlLCBDb3BpbG90Q0xJU2Vzc2lvblR5cGUuaWQpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHByb3ZpZGVyLmdldFNlc3Npb24oc2Vzc2lvbkluZm8uc2Vzc2lvbklkKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24/LnBlcm1pc3Npb25MZXZlbC5nZXQoKSwgQ2hhdFBlcm1pc3Npb25MZXZlbC5EZWZhdWx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gRGVmYXVsdCB3aGVuIGNoYXQucGVybWlzc2lvbnMuZGVmYXVsdCBpcyB1bnNldCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25TZXJ2aWNlID0gbWFrZUNvbmZpZyh7fSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgKCkgPT4gbmV3IFByb21pc2UoKCkgPT4geyB9KSwgeyBjb25maWd1cmF0aW9uU2VydmljZSB9KTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvbkluZm8gPSBwcm92aWRlci5jcmVhdGVOZXdTZXNzaW9uKHdvcmtzcGFjZSwgQ29waWxvdENMSVNlc3Npb25UeXBlLmlkKTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBwcm92aWRlci5nZXRTZXNzaW9uKHNlc3Npb25JbmZvLnNlc3Npb25JZCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uPy5wZXJtaXNzaW9uTGV2ZWwuZ2V0KCksIENoYXRQZXJtaXNzaW9uTGV2ZWwuRGVmYXVsdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGZ1bmN0aW9uIHdhaXRGb3JTZXNzaW9uQWRkZWQocHJvdmlkZXI6IENvcGlsb3RDaGF0U2Vzc2lvbnNQcm92aWRlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0XHRpZiAoZS5hZGRlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0ZGlzcG9zYWJsZS5kaXNwb3NlKCk7XG5cdFx0XHRcdFx0cmVzb2x2ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fVxuXG5cdHRlc3QoJ2Nsb3VkIHNlc3Npb24gdGhhdCBjb21taXRzIGEgbmV3IHJlc291cmNlIHJlc29sdmVzIHdpdGhvdXQgdGltaW5nIG91dCcsIGFzeW5jICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBhIGNsb3VkIHNlc3Npb24gY29tbWl0cyBhIGRpZmZlcmVudCByZXNvdXJjZSBtaWQtcmVxdWVzdFxuXHRcdC8vICh1bnRpdGxlZCBcdTIxOTIgL3Rhc2svPGlkPiksIHNvIF9zZW5kRmlyc3RDaGF0IG11c3Qgd2FpdCBmb3IgdGhlIGNvbW1pdHRlZFxuXHRcdC8vIHJlc291cmNlLCBub3QgdGhlIHVudGl0bGVkIG9uZSwgb3RoZXJ3aXNlIGl0IHRpbWVzIG91dCBhbmQgcmVtb3ZlcyB0aGUgc2Vzc2lvbi5cblx0XHRjb25zdCBjb21taXR0ZWRSZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiBBZ2VudFNlc3Npb25Qcm92aWRlcnMuQ2xvdWQsIHBhdGg6IGAvdGFzay8ke2dlbmVyYXRlVXVpZCgpfWAgfSk7XG5cdFx0Y29uc3Qgb25EaWRDb21taXQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyBvcmlnaW5hbDogVVJJOyBjb21taXR0ZWQ6IFVSSSB9PigpKTtcblxuXHRcdGxldCByZXNvbHZlQ29tcGxldGUhOiAoKSA9PiB2b2lkO1xuXHRcdGNvbnN0IHJlc3BvbnNlQ29tcGxldGVQcm9taXNlID0gbmV3IFByb21pc2U8dm9pZD4ociA9PiB7IHJlc29sdmVDb21wbGV0ZSA9IHI7IH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlQ3JlYXRlZFByb21pc2UgPSBuZXcgUHJvbWlzZTxJQ2hhdFJlc3BvbnNlTW9kZWw+KCgpID0+IHsgLyogbmV2ZXIgcmVzb2x2ZXMgKi8gfSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZVByb3ZpZGVyRm9yU2VuZFRlc3RzKGRpc3Bvc2FibGVzLCBtb2RlbCwgYXN5bmMgKCkgPT4gKHtcblx0XHRcdGtpbmQ6ICdzZW50JyBhcyBjb25zdCxcblx0XHRcdGRhdGE6IHtcblx0XHRcdFx0cmVzcG9uc2VDb21wbGV0ZVByb21pc2UsXG5cdFx0XHRcdHJlc3BvbnNlQ3JlYXRlZFByb21pc2UsXG5cdFx0XHRcdGFnZW50OiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0QWdlbnREYXRhPigpIHsgfSgpLFxuXHRcdFx0fSBhcyBJQ2hhdFNlbmRSZXF1ZXN0RGF0YSxcblx0XHR9KSwgeyBvbkRpZENvbW1pdFNlc3Npb246IG9uRGlkQ29tbWl0LmV2ZW50IH0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gVVJJLmZyb20oeyBzY2hlbWU6IEdJVEhVQl9SRU1PVEVfRklMRV9TQ0hFTUUsIHBhdGg6ICcvb3duZXIvcmVwby9IRUFEJyB9KTtcblx0XHRjb25zdCBzZXNzaW9uID0gcHJvdmlkZXIuY3JlYXRlTmV3U2Vzc2lvbih3b3Jrc3BhY2UsIENvcGlsb3RDbG91ZFNlc3Npb25UeXBlLmlkKTtcblxuXHRcdGNvbnN0IHJlbW92YWxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm92aWRlci5vbkRpZENoYW5nZVNlc3Npb25zKGUgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCByIG9mIGUucmVtb3ZlZCkge1xuXHRcdFx0XHRyZW1vdmFscy5wdXNoKHIucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Y29uc3QgYWRkZWQgPSB3YWl0Rm9yU2Vzc2lvbkFkZGVkKHByb3ZpZGVyKTtcblx0XHRjb25zdCBjaGF0ID0gYXdhaXQgcHJvdmlkZXIuY3JlYXRlTmV3Q2hhdChzZXNzaW9uLnNlc3Npb25JZCk7XG5cdFx0Y29uc3QgdW50aXRsZWRSZXNvdXJjZSA9IGNoYXQucmVzb3VyY2U7XG5cdFx0Y29uc3Qgc2VuZFByb21pc2UgPSBwcm92aWRlci5zZW5kUmVxdWVzdChzZXNzaW9uLnNlc3Npb25JZCwgY2hhdC5yZXNvdXJjZSwgeyBxdWVyeTogJ2hpJyB9KTtcblx0XHRhd2FpdCBhZGRlZDtcblxuXHRcdC8vIFRoZSByZXNwb25zZSBjb21wbGV0ZXMgZWFybHkgKGNsb3VkIHJldHVybnMgYSBjb25maXJtYXRpb24pIGJlZm9yZSB0aGVcblx0XHQvLyBjb21taXQgbGFuZHMgXHUyMDE0IHRoaXMgbXVzdCBub3QgY2F1c2UgdGhlIHdhaXQgdG8gZ2l2ZSB1cC5cblx0XHRyZXNvbHZlQ29tcGxldGUoKTtcblxuXHRcdG1vZGVsLmFkZFNlc3Npb24oY3JlYXRlTW9ja0FnZW50U2Vzc2lvbihjb21taXR0ZWRSZXNvdXJjZSwgeyBwcm92aWRlclR5cGU6IEFnZW50U2Vzc2lvblByb3ZpZGVycy5DbG91ZCB9KSk7XG5cblx0XHQvLyBfd2FpdEZvckNvbW1pdHRlZFNlc3Npb24gc3Vic2NyaWJlcyB0byBvbkRpZENvbW1pdFNlc3Npb24gb25seSBhZnRlclxuXHRcdC8vIHNlbmRSZXF1ZXN0IHJlc29sdmVzLCBzbyByZS1maXJlIHVudGlsIHRoZSBzZW5kIHNldHRsZXMgdG8gYXZvaWQgdGhlIHJhY2UuXG5cdFx0bGV0IHNlbmRTZXR0bGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgZmlyZUNvbW1pdFVudGlsU2V0dGxlZCA9IGFzeW5jICgpID0+IHtcblx0XHRcdHdoaWxlICghc2VuZFNldHRsZWQpIHtcblx0XHRcdFx0b25EaWRDb21taXQuZmlyZSh7IG9yaWdpbmFsOiB1bnRpdGxlZFJlc291cmNlLCBjb21taXR0ZWQ6IGNvbW1pdHRlZFJlc291cmNlIH0pO1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDUpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgY29tbWl0TG9vcCA9IGZpcmVDb21taXRVbnRpbFNldHRsZWQoKTtcblxuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBhc3NlcnQuZG9lc05vdFJlamVjdChzZW5kUHJvbWlzZSk7XG5cdFx0fSBmaW5hbGx5IHtcblx0XHRcdHNlbmRTZXR0bGVkID0gdHJ1ZTtcblx0XHRcdGF3YWl0IGNvbW1pdExvb3A7XG5cdFx0fVxuXG5cdFx0YXNzZXJ0Lm9rKFxuXHRcdFx0IXJlbW92YWxzLmluY2x1ZGVzKHVudGl0bGVkUmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRgQ2xvdWQgc2Vzc2lvbiBzaG91bGQgbm90IGJlIHJlbW92ZWQgYWZ0ZXIgY29tbWl0dGluZy4gUmVtb3ZhbHMgc2VlbjogWyR7cmVtb3ZhbHMuam9pbignLCAnKX1dYCxcblx0XHQpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFB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
