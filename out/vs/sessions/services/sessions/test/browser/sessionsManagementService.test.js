import assert from "assert";
import { DeferredPromise } from "../../../../../base/common/async.js";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { autorun, constObservable, observableValue } from "../../../../../base/common/observable.js";
import { extUriBiasedIgnorePathCase } from "../../../../../base/common/resources.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { IProgressService } from "../../../../../platform/progress/common/progress.js";
import { InMemoryStorageService, IStorageService } from "../../../../../platform/storage/common/storage.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { IWorkspaceTrustManagementService, IWorkspaceTrustRequestService } from "../../../../../platform/workspace/common/workspaceTrust.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { IChatService } from "../../../../../workbench/contrib/chat/common/chatService/chatService.js";
import { IChatWidgetHistoryService } from "../../../../../workbench/contrib/chat/common/widget/chatWidgetHistoryService.js";
import { nullExtensionDescription } from "../../../../../workbench/services/extensions/common/extensions.js";
import { SessionTypeAuthRequirement, ChatInteractivity, ChatOriginKind, SessionStatus } from "../../common/session.js";
import { SessionsManagementService } from "../../browser/sessionsManagementService.js";
import { ISessionsManagementService, inheritableSessionTarget, WorkspaceNotTrustedError } from "../../common/sessionsManagement.js";
import { SessionsService } from "../../browser/sessionsService.js";
import { ISessionsPartService } from "../../browser/sessionsPartService.js";
import { CustomViewService, ICustomViewService } from "../../../customView/browser/customViewService.js";
import { ISessionsProvidersService } from "../../browser/sessionsProvidersService.js";
import { LOCAL_AGENT_HOST_PROVIDER_ID } from "../../../../common/agentHostSessionsProvider.js";
import { SessionsHasClosedItemContext } from "../../../../common/contextkeys.js";
import { COPILOT_CLI_EH_SCHEME, COPILOT_CLI_LOCAL_AH_SCHEME } from "../../../../../workbench/contrib/chat/browser/copilotCliEventsUri.js";
const stubChat = {
  resource: URI.parse("test:///chat"),
  createdAt: /* @__PURE__ */ new Date(),
  title: constObservable("Chat"),
  updatedAt: constObservable(/* @__PURE__ */ new Date()),
  status: constObservable(0),
  changes: constObservable([]),
  checkpoints: constObservable(void 0),
  modelId: constObservable(void 0),
  mode: constObservable(void 0),
  isArchived: constObservable(false),
  isRead: constObservable(true),
  interactivity: constObservable(ChatInteractivity.Full),
  description: constObservable(void 0),
  lastTurnEnd: constObservable(void 0)
};
function stubSession(overrides) {
  return {
    resource: URI.parse(`test:///${overrides.sessionId}`),
    sessionType: "test",
    icon: Codicon.vm,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: constObservable(void 0),
    title: constObservable("Test"),
    updatedAt: constObservable(/* @__PURE__ */ new Date()),
    status: constObservable(0),
    changesets: constObservable([]),
    changes: constObservable([]),
    modelId: constObservable(void 0),
    mode: constObservable(void 0),
    loading: constObservable(false),
    isArchived: constObservable(false),
    isRead: constObservable(true),
    description: constObservable(void 0),
    lastTurnEnd: constObservable(void 0),
    chats: constObservable([]),
    mainChat: constObservable(stubChat),
    capabilities: constObservable({ supportsMultipleChats: false }),
    ...overrides
  };
}
class TestChatWidgetService extends mock() {
  constructor() {
    super(...arguments);
    this.opened = [];
    this._widgetSessionResources = /* @__PURE__ */ new Set();
  }
  async openSession(sessionResource, _target, _options) {
    this.opened.push(sessionResource);
    return void 0;
  }
  /** Simulate a session being displayed in a chat widget. */
  setWidgetSessionResource(resource) {
    this._widgetSessionResources.add(resource.toString());
  }
  clearWidgetSessionResources() {
    this._widgetSessionResources.clear();
  }
  getWidgetBySessionResource(sessionResource) {
    if (this._widgetSessionResources.has(sessionResource.toString())) {
      return {};
    }
    return void 0;
  }
}
class TestChatService extends mock() {
  constructor() {
    super(...arguments);
    this._onDidSubmitRequest = new Emitter();
    this.onDidSubmitRequest = this._onDidSubmitRequest.event;
    this.cancelledResources = [];
    this.loadedResources = [];
    this.disposedModelRefs = 0;
    this.modelRefAvailable = true;
  }
  async acquireOrLoadSession(sessionResource) {
    this.loadedResources.push(sessionResource);
    if (!this.modelRefAvailable) {
      return void 0;
    }
    return { object: {}, dispose: () => {
      this.disposedModelRefs++;
    } };
  }
  submitRequest(event) {
    this._onDidSubmitRequest.fire(event);
  }
  dispose() {
    this._onDidSubmitRequest.dispose();
  }
  async cancelCurrentRequestForSession(sessionResource) {
    this.cancelledResources.push(sessionResource);
    if (this.cancelError) {
      throw this.cancelError;
    }
  }
}
class TestProgressService extends mock() {
  async withProgress(_options, task) {
    return task({ report() {
    } });
  }
}
class TestWorkspaceTrustManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.trusted = true;
    this.requestedUris = [];
  }
  async getUriTrustInfo(uri) {
    this.requestedUris.push(uri);
    return { uri, trusted: this.trusted };
  }
}
class TestSessionsProvidersService extends mock() {
  constructor(_providers) {
    super();
    this._providers = _providers;
    this.onDidChangeProviders = Event.None;
  }
  registerProvider() {
    throw new Error("not implemented");
  }
  getProviders() {
    return [...this._providers].sort((a, b) => a.order - b.order);
  }
  getProvider(providerId) {
    return this._providers.find((provider) => provider.id === providerId);
  }
}
class TestSessionsProvider extends mock() {
  constructor(_session) {
    super();
    this._session = _session;
    this.id = "test";
    this.label = "Test";
    this.icon = Codicon.vm;
    this.order = 0;
    this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "test", label: "Test", icon: Codicon.vm, supportsWorktreeConfiguration: true }];
    this.onDidChangeSessionTypes = Event.None;
    this.onDidChangeSessions = Event.None;
    this.browseActions = [];
    this.onDidChangeModels = Event.None;
  }
  getSessions() {
    return [this._session];
  }
  resolveWorkspace(_folderUri) {
    return void 0;
  }
  createNewSession(_folderUri, _sessionTypeId) {
    return this._session;
  }
  getSessionTypes(_folderUri) {
    return [...this.sessionTypes];
  }
  async renameChat() {
  }
  getModelsSnapshot() {
    return { models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 };
  }
  getModelPickerOptions() {
    return { useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false };
  }
  setModel(_sessionId, _modelId) {
  }
  async archiveSession() {
  }
  async unarchiveSession() {
  }
  async deleteSession() {
  }
  async deleteSessions(_sessionIds) {
  }
  async deleteChat() {
    return true;
  }
  deleteNewSession(_sessionId) {
  }
  async sendRequest(_sessionId, _chatResource, _options) {
    return this._session;
  }
  async createNewChat() {
    return this._session.mainChat.get();
  }
  async forkChat(_sessionId, _sourceChat, _turnId) {
    throw new Error("not implemented");
  }
  async createSideChat(_sessionId, _sourceChat, _turnId, _selection) {
    throw new Error("not implemented");
  }
}
function createSessionsManagementService(session, disposables, provider = new TestSessionsProvider(session), workspaceTrustManagementService = new TestWorkspaceTrustManagementService(), workspaceTrustRequestService) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const chatWidgetService = new TestChatWidgetService();
  const chatService = disposables.add(new TestChatService());
  const providers = Array.isArray(provider) ? provider : [provider];
  const contextKeyService = disposables.add(new MockContextKeyService());
  instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IContextKeyService, contextKeyService);
  instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
  instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
  instantiationService.stub(IChatWidgetService, chatWidgetService);
  instantiationService.stub(IProgressService, new TestProgressService());
  instantiationService.stub(IChatService, chatService);
  instantiationService.stub(IChatWidgetHistoryService, new class extends mock() {
    moveHistory() {
    }
  }());
  instantiationService.stub(IWorkspaceTrustManagementService, workspaceTrustManagementService);
  if (workspaceTrustRequestService) {
    instantiationService.stub(IWorkspaceTrustRequestService, workspaceTrustRequestService);
  }
  const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
  const view = createView(instantiationService, service, disposables);
  return { service, view, chatWidgetService, chatService, contextKeyService };
}
class TestSessionsPartService extends mock() {
  constructor() {
    super(...arguments);
    this.onDidFocusSession = Event.None;
    this.onDidToggleMaximizeSession = Event.None;
  }
  updateVisibleSessions() {
  }
  focusSession() {
  }
}
function createView(instantiationService, service, disposables) {
  instantiationService.stub(ISessionsManagementService, service);
  instantiationService.stub(ISessionsPartService, new TestSessionsPartService());
  instantiationService.stub(ICustomViewService, disposables.add(new CustomViewService(new NullLogService(), disposables.add(new InMemoryStorageService()))));
  instantiationService.stub(IConfigurationService, new TestConfigurationService());
  return disposables.add(instantiationService.createInstance(SessionsService));
}
suite("SessionsManagementService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("cancelCurrentRequest loads the chat model then cancels the main chat request", async () => {
    const session = stubSession({ sessionId: "session", providerId: "test" });
    const { service, chatService } = createSessionsManagementService(session, disposables);
    await service.cancelCurrentRequest(session);
    assert.deepStrictEqual({
      loaded: chatService.loadedResources,
      cancelled: chatService.cancelledResources,
      disposedModelRefs: chatService.disposedModelRefs
    }, {
      loaded: [stubChat.resource],
      cancelled: [stubChat.resource],
      disposedModelRefs: 1
    });
  });
  test("cancelCurrentRequest disposes the loaded model when cancellation fails", async () => {
    const session = stubSession({ sessionId: "session", providerId: "test" });
    const { service, chatService } = createSessionsManagementService(session, disposables);
    chatService.cancelError = new Error("cancel failed");
    await assert.rejects(() => service.cancelCurrentRequest(session), /cancel failed/);
    assert.deepStrictEqual({
      loaded: chatService.loadedResources,
      cancelled: chatService.cancelledResources,
      disposedModelRefs: chatService.disposedModelRefs
    }, {
      loaded: [stubChat.resource],
      cancelled: [stubChat.resource],
      disposedModelRefs: 1
    });
  });
  test("cancelCurrentRequest rejects when the chat model cannot be loaded", async () => {
    const session = stubSession({ sessionId: "session", providerId: "test" });
    const { service, chatService } = createSessionsManagementService(session, disposables);
    chatService.modelRefAvailable = false;
    await assert.rejects(() => service.cancelCurrentRequest(session), /Failed to load chat session for cancellation/);
    assert.deepStrictEqual({
      loaded: chatService.loadedResources,
      cancelled: chatService.cancelledResources,
      disposedModelRefs: chatService.disposedModelRefs
    }, {
      loaded: [stubChat.resource],
      cancelled: [],
      disposedModelRefs: 0
    });
  });
  test("openSession waits for a loading session before opening chat content", async () => {
    const loading = observableValue("loading", true);
    const session = stubSession({ sessionId: "loading", providerId: "test", loading });
    const { view } = createSessionsManagementService(session, disposables);
    let resolved = false;
    const openPromise = view.openSession(session.resource).then(() => {
      resolved = true;
    });
    await Promise.resolve();
    assert.deepStrictEqual({ resolved }, { resolved: false });
    loading.set(false, void 0);
    await openPromise;
    assert.deepStrictEqual({ resolved }, { resolved: true });
  });
  test("marks the active session as read via its provider even when its provider state was unread", async () => {
    const isRead = observableValue("isRead", false);
    const session = stubSession({ sessionId: "unread", providerId: "test", isRead });
    const provider = new class extends TestSessionsProvider {
      async setSessionReadState(_sessionId, read) {
        isRead.set(read, void 0);
      }
    }(session);
    const { view } = createSessionsManagementService(session, disposables, provider);
    const readBeforeActive = session.isRead.get();
    await view.openSession(session.resource);
    const readWhileActive = session.isRead.get();
    assert.deepStrictEqual(
      { readBeforeActive, readWhileActive, activeId: view.activeSession.get()?.sessionId },
      { readBeforeActive: false, readWhileActive: true, activeId: "unread" }
    );
  });
  test("leaves a non-active session in its provider read state", () => {
    const active = stubSession({ sessionId: "active", providerId: "test" });
    const other = stubSession({ sessionId: "other", providerId: "test", isRead: constObservable(false) });
    const { view } = createSessionsManagementService(active, disposables);
    assert.deepStrictEqual(
      { activeId: view.activeSession.get()?.sessionId, otherRead: other.isRead.get() },
      { activeId: void 0, otherRead: false }
    );
  });
  test("does not change active session when added session is not displayed in any widget", async () => {
    const originalSession = stubSession({ sessionId: "original", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(originalSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const chatWidgetService = new TestChatWidgetService();
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, chatWidgetService);
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.openSession(originalSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "original");
    const otherSession = stubSession({ sessionId: "other", providerId: "test" });
    onDidChangeSessions.fire({ added: [otherSession], removed: [], changed: [] });
    assert.strictEqual(view.activeSession.get()?.sessionId, "original");
  });
  test("getSessionForChatResource returns the session that owns the chat", () => {
    const chatA = { ...stubChat, resource: URI.parse("test:///chat-a") };
    const chatB = { ...stubChat, resource: URI.parse("test:///CHAT-B") };
    const sessionA = stubSession({
      sessionId: "a",
      providerId: "test",
      chats: constObservable([chatA]),
      mainChat: constObservable(chatA)
    });
    const sessionB = stubSession({
      sessionId: "b",
      providerId: "test",
      chats: constObservable([chatB]),
      mainChat: constObservable(chatB)
    });
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return [sessionA, sessionB];
      }
    }();
    const { service } = createSessionsManagementService(sessionA, disposables, provider);
    const ownedChat = service.getSessionForChatResource(URI.parse("test:///chat-b"));
    assert.deepStrictEqual({
      sessionId: ownedChat?.session.sessionId,
      chat: ownedChat?.chat,
      missing: service.getSessionForChatResource(URI.parse("test:///missing"))
    }, {
      sessionId: "b",
      chat: chatB,
      missing: void 0
    });
  });
  test("restoreVisibleSessions waits for session to appear via onDidChangeSessions", async () => {
    const targetSession = stubSession({ sessionId: "target", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    let sessions = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(targetSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const chatWidgetService = new TestChatWidgetService();
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, chatWidgetService);
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const restorePromise = view.restoreVisibleSessions();
    await Promise.resolve();
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().filter((s) => !!s).map((s) => s.sessionId),
      restoreComplete: view.initialRestoreComplete.get()
    }, {
      visible: [],
      restoreComplete: false
    });
    sessions = [targetSession];
    onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
    await restorePromise;
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId),
      restoreComplete: view.initialRestoreComplete.get()
    }, {
      visible: [targetSession.sessionId],
      restoreComplete: true
    });
  });
  test("ROUNDTRIP: opened session is retained across save + restore", async () => {
    const createdChat = { ...stubChat, resource: URI.parse("test:///chat-x"), status: constObservable(1) };
    const session = stubSession({
      sessionId: "x",
      providerId: "test",
      status: constObservable(1),
      chats: constObservable([createdChat]),
      mainChat: constObservable(createdChat)
    });
    const provider = new TestSessionsProvider(session);
    const storage = disposables.add(new InMemoryStorageService());
    const makeService = () => {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, storage);
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
      const view = createView(instantiationService, service, disposables);
      return { service, view };
    };
    const first = makeService();
    await first.view.openSession(session.resource);
    assert.strictEqual(first.view.activeSession.get()?.sessionId, "x");
    await storage.flush();
    const second = makeService();
    await second.view.restoreVisibleSessions();
    assert.deepStrictEqual({
      visible: second.view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: second.view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["x"],
      active: "x"
    });
  });
  test("RACE: a new session created during restore does not drop the restored session", async () => {
    const targetSession = stubSession({ sessionId: "target", providerId: "test" });
    const newSession = stubSession({ sessionId: "fresh", providerId: "test" });
    const onDidChangeSessions = disposables.add(new Emitter());
    let sessions = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(targetSession);
        this.onDidChangeSessions = onDidChangeSessions.event;
      }
      getSessions() {
        return sessions;
      }
      createNewSession() {
        return newSession;
      }
      resolveWorkspace() {
        return { folders: [], isVirtualWorkspace: false };
      }
    }();
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([{ sessionResource: targetSession.resource.toString(), visibleOrder: 0, isActive: true }]),
      1,
      1
    );
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const restorePromise = view.restoreVisibleSessions();
    await Promise.resolve();
    service.createNewSession(URI.parse("file:///folder"));
    sessions = [targetSession];
    onDidChangeSessions.fire({ added: [targetSession], removed: [], changed: [] });
    await restorePromise;
    assert.deepStrictEqual({
      hasTarget: view.visibleSessions.get().some((s) => s?.sessionId === "target"),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      hasTarget: true,
      active: "target"
    });
  });
  test.skip("openNewSession inherits the active session workspace when requested", async () => {
    const makeWorkspace = (uri) => ({
      uri,
      label: "ws",
      icon: Codicon.vm,
      folders: [{ root: uri, workingDirectory: uri, name: "ws", description: void 0 }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    const workspaceB = URI.parse("file:///workspaceB");
    const openSession = stubSession({ sessionId: "open", providerId: "test", workspace: constObservable(makeWorkspace(workspaceB)) });
    let createdFolderUri;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession(folderUri) {
        createdFolderUri = folderUri;
        return stubSession({ sessionId: "inherited", providerId: "test", workspace: constObservable(makeWorkspace(folderUri)) });
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createdFor: createdFolderUri?.toString() ?? null,
      activeSession: view.activeSession.get()?.sessionId ?? null,
      activeWorkspace: view.activeSession.get()?.workspace.get()?.folders[0]?.root.toString() ?? null
    }, {
      createdFor: workspaceB.toString(),
      activeSession: "inherited",
      activeWorkspace: workspaceB.toString()
    });
  });
  test("openNewSession does not inherit the active session workspace by default", async () => {
    const workspaceB = URI.parse("file:///workspaceB");
    const openSession = stubSession({
      sessionId: "open",
      providerId: "test",
      workspace: constObservable({
        uri: workspaceB,
        label: "ws",
        icon: Codicon.vm,
        folders: [{ root: workspaceB, workingDirectory: workspaceB, name: "ws", description: void 0 }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      })
    });
    let createNewSessionCalled = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      createNewSession() {
        createNewSessionCalled = true;
        return openSession;
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createNewSessionCalled,
      activeSession: view.activeSession.get()?.sessionId ?? null
    }, {
      createNewSessionCalled: false,
      activeSession: null
    });
  });
  test("cancelled openNewSession does not replace a newer draft after workspace trust resolves", async () => {
    const staleFolder = URI.file("/stale");
    const latestFolder = URI.file("/latest");
    const makeWorkspace = (uri) => ({
      uri,
      label: uri.path,
      icon: Codicon.folder,
      folders: [{ root: uri, workingDirectory: uri, name: uri.path, description: void 0 }],
      requiresWorkspaceTrust: true,
      isVirtualWorkspace: false
    });
    const staleSession = stubSession({ sessionId: "stale", providerId: "test", workspace: constObservable(makeWorkspace(staleFolder)) });
    const latestSession = stubSession({ sessionId: "latest", providerId: "test", workspace: constObservable(makeWorkspace(latestFolder)) });
    const createdFolders = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(latestSession);
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession(folderUri) {
        createdFolders.push(folderUri.toString());
        return folderUri.toString() === staleFolder.toString() ? staleSession : latestSession;
      }
    }();
    const staleTrust = new DeferredPromise();
    let trustRequestCount = 0;
    const trustRequestService = new class extends mock() {
      requestResourcesTrust() {
        trustRequestCount++;
        return trustRequestCount === 1 ? staleTrust.p : Promise.resolve(true);
      }
    }();
    const { view } = createSessionsManagementService(
      latestSession,
      disposables,
      provider,
      new TestWorkspaceTrustManagementService(),
      trustRequestService
    );
    const staleCts = disposables.add(new CancellationTokenSource());
    const staleOpen = view.openNewSession({ folderUri: staleFolder }, staleCts.token);
    await Promise.resolve();
    staleCts.cancel();
    const latestResult = await view.openNewSession({ folderUri: latestFolder });
    staleTrust.complete(true);
    const staleResult = await staleOpen;
    assert.deepStrictEqual({
      createdFolders,
      activeSessionId: view.activeSession.get()?.sessionId,
      latestSessionId: latestResult.session?.sessionId,
      staleSessionId: staleResult.session?.sessionId
    }, {
      createdFolders: [latestFolder.toString()],
      activeSessionId: "latest",
      latestSessionId: "latest",
      staleSessionId: void 0
    });
  });
  test.skip("openNewSession recreates a draft for the active session workspace when inheriting", async () => {
    const makeWorkspace = (uri) => ({
      uri,
      label: "ws",
      icon: Codicon.vm,
      folders: [{ root: uri, workingDirectory: uri, name: "ws", description: void 0 }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    const workspaceA = URI.parse("file:///workspaceA");
    const openSession = stubSession({ sessionId: "open", providerId: "test", workspace: constObservable(makeWorkspace(workspaceA)) });
    const pendingSession = stubSession({ sessionId: "pending", providerId: "test", workspace: constObservable(makeWorkspace(workspaceA)) });
    let createNewSessionCount = 0;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(openSession);
      }
      getSessions() {
        return [openSession];
      }
      resolveWorkspace(folderUri) {
        return makeWorkspace(folderUri);
      }
      createNewSession() {
        createNewSessionCount++;
        return pendingSession;
      }
    }();
    const { view } = createSessionsManagementService(openSession, disposables, provider);
    view.openNewSession({ folderUri: workspaceA });
    assert.strictEqual(view.activeSession.get()?.sessionId, "pending");
    await view.openSession(openSession.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "open");
    view.openNewSession();
    assert.deepStrictEqual({
      createNewSessionCount,
      activeSession: view.activeSession.get()?.sessionId ?? null
    }, {
      createNewSessionCount: 2,
      activeSession: "pending"
    });
  });
  test("restoreVisibleSessions restores the grid order, sticky and active state", async () => {
    const sessionA = stubSession({ sessionId: "a", providerId: "test" });
    const sessionB = stubSession({ sessionId: "b", providerId: "test" });
    const sessionC = stubSession({ sessionId: "c", providerId: "test" });
    const sessions = [sessionA, sessionB, sessionC];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([
        { sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: true, isActive: false },
        { sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true },
        { sessionResource: sessionC.resource.toString(), visibleOrder: 2, isSticky: false, isActive: false }
      ]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.restoreVisibleSessions();
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      sticky: view.visibleSessions.get().map((s) => s?.sticky.get() ?? false),
      active: view.activeSession.get()?.sessionId
    }, {
      visible: ["a", "b", "c"],
      sticky: [true, false, false],
      active: "b"
    });
  });
  test("restoreVisibleSessions lays out the grid atomically without intermediate single-session states", async () => {
    const sessionA = stubSession({ sessionId: "a", providerId: "test" });
    const sessionB = stubSession({ sessionId: "b", providerId: "test" });
    const sessions = [sessionA, sessionB];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(sessionA);
      }
      getSessions() {
        return sessions;
      }
    }();
    const instantiationService = disposables.add(new TestInstantiationService());
    const storage = disposables.add(new InMemoryStorageService());
    storage.store(
      "agentSessions.activeSessionStates",
      JSON.stringify([
        { sessionResource: sessionA.resource.toString(), visibleOrder: 0, isSticky: false, isActive: false },
        { sessionResource: sessionB.resource.toString(), visibleOrder: 1, isSticky: false, isActive: true }
      ]),
      1,
      1
    );
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidSubmitRequest = Event.None;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    const states = [];
    disposables.add(autorun((reader) => {
      states.push(view.visibleSessions.read(reader).map((s) => s?.sessionId ?? null));
    }));
    await view.restoreVisibleSessions();
    const showedActiveAlone = states.some((s) => s.length === 1 && s[0] === "b");
    assert.deepStrictEqual({
      showedActiveAlone,
      final: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId
    }, {
      showedActiveAlone: false,
      final: ["a", "b"],
      active: "b"
    });
  });
  test("sendNewChatRequest keeps the started session active for a foreground send", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const { service, view } = createSessionsManagementService(session, disposables);
    await view.openSession(session.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "s1");
    await service.sendNewChatRequest(session, { query: "hi" });
    assert.strictEqual(view.activeSession.get()?.sessionId, "s1");
  });
  test("sendNewChatRequest with background resolves before provider send commits", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let completeSendRequest;
    let sendRequestStarted = false;
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, _chatResource, _options) {
        sendRequestStarted = true;
        await new Promise((resolve) => {
          completeSendRequest = resolve;
        });
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const sendPromise = service.sendNewChatRequest(session, { query: "hi", background: true });
    await sendPromise;
    assert.strictEqual(sendRequestStarted, true);
    completeSendRequest?.();
  });
  test("sendRequest with background is fire-and-forget and does not fire onWillSendRequest", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat"), status: constObservable(SessionStatus.Untitled) };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let completeSendRequest;
    let sentChatResource;
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, chatResource, _options) {
        sentChatResource = chatResource;
        await new Promise((resolve) => {
          completeSendRequest = resolve;
        });
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    let willSendCount = 0;
    disposables.add(service.onWillSendRequest(() => willSendCount++));
    await service.sendRequest(session, chat, { query: "hi", background: true });
    assert.deepStrictEqual({
      sentChatResource: sentChatResource?.toString(),
      willSendCount
    }, {
      sentChatResource: chat.resource.toString(),
      willSendCount: 0
    });
    completeSendRequest?.();
  });
  test("mirrored follow-up requests preserve submitted attachments", () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const { service, chatService } = createSessionsManagementService(session, disposables);
    const attachedContext = [{ kind: "generic", id: "context", name: "Context", value: "value" }];
    let sentEvent;
    disposables.add(service.onDidSendRequest((event) => sentEvent = event));
    chatService.submitRequest({
      chatSessionResource: chat.resource,
      message: { text: "follow up", parts: [] },
      attachedContext
    });
    assert.deepStrictEqual(sentEvent && {
      query: sentEvent.options.query,
      attachedContext: sentEvent.options.attachedContext,
      isNewSession: sentEvent.isNewSession,
      isNewChat: sentEvent.isNewChat
    }, {
      query: "follow up",
      attachedContext,
      isNewSession: false,
      isNewChat: false
    });
  });
  test("send-follow activates only visible chat tabs", async () => {
    const mainChat = { ...stubChat, resource: URI.parse("test:///chat/main"), title: constObservable("main") };
    const sideChat = { ...stubChat, resource: URI.parse("test:///chat/side"), title: constObservable("side"), origin: { kind: ChatOriginKind.SideChat } };
    const toolChat = { ...stubChat, resource: URI.parse("test:///chat/tool"), title: constObservable("tool"), origin: { kind: ChatOriginKind.Tool }, interactivity: constObservable(ChatInteractivity.ReadOnly) };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([mainChat, sideChat, toolChat]),
      mainChat: constObservable(mainChat),
      capabilities: constObservable({ supportsMultipleChats: true })
    });
    const provider = new class extends TestSessionsProvider {
      async sendRequest(_sessionId, _chatResource, _options) {
        return session;
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    await view.openSession(session.resource);
    await view.openChat(session, sideChat.resource);
    await service.sendRequest(session, toolChat, { query: "hidden tool" });
    await Promise.resolve();
    const afterHiddenSend = view.activeSession.get()?.activeChat.get().resource.toString();
    await view.openChat(session, toolChat.resource);
    await service.sendRequest(session, toolChat, { query: "visible tool" });
    await Promise.resolve();
    const afterVisibleSend = view.activeSession.get()?.activeChat.get().resource.toString();
    assert.deepStrictEqual({
      visibleTabs: view.activeSession.get()?.visibleChatTabs.get().map((chat) => chat.title.get()),
      afterHiddenSend,
      afterVisibleSend
    }, {
      visibleTabs: ["main", "side", "tool"],
      afterHiddenSend: sideChat.resource.toString(),
      afterVisibleSend: toolChat.resource.toString()
    });
  });
  test("createAndSendNewChatRequest sends without changing the active view", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let sendRequestStarted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        sendRequestStarted = true;
        return session;
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    assert.strictEqual(view.activeSession.get(), void 0);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" });
    assert.strictEqual(sendRequestStarted, true);
    assert.strictEqual(view.activeSession.get(), void 0);
  });
  test("createAndSendNewChatRequest prepares request options while configuring the provisional session", async () => {
    const session = stubSession({
      sessionId: "s1",
      providerId: "test"
    });
    const requestOptionsBarrier = new DeferredPromise();
    const requestPreparationStarted = new DeferredPromise();
    const configurationCompleted = new DeferredPromise();
    const events = [];
    let createMetadata;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return {
          uri: URI.parse("test:///folder"),
          label: "Test",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        };
      }
      createNewSession(_folderUri, _sessionTypeId, options) {
        createMetadata = options?.metadata;
        events.push("create");
        return session;
      }
      startNewSessionRequest(_sessionId, activity) {
        events.push(`start:${activity}`);
        return { dispose: () => events.push("clear") };
      }
      async setWorktreeConfiguration() {
        events.push("configure");
        configurationCompleted.complete();
      }
      async sendRequest(_sessionId, _chatResource, options) {
        events.push(`send:${options.query}`);
        return session;
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    const sendPromise = service.createAndSendNewChatRequest(URI.parse("test:///folder"), {
      kind: "deferred",
      activity: "Fetching pull request...",
      async resolve() {
        events.push("prepare");
        requestPreparationStarted.complete();
        await requestOptionsBarrier.p;
        return { query: "prepared" };
      }
    }, {
      isolationMode: "worktree",
      metadata: { github: { pullRequestUrl: "https://github.com/owner/repo/pull/42" } },
      onSessionCreated: (created) => {
        view.showSession(created.resource);
        events.push(`show:${view.activeSession.get()?.sessionId}`);
      }
    });
    await Promise.all([requestPreparationStarted.p, configurationCompleted.p]);
    const eventsWhilePreparingRequest = [...events];
    requestOptionsBarrier.complete();
    await sendPromise;
    assert.deepStrictEqual({
      eventsWhilePreparingRequest,
      events,
      createMetadata
    }, {
      eventsWhilePreparingRequest: ["create", "start:Fetching pull request...", "show:s1", "prepare", "configure"],
      events: ["create", "start:Fetching pull request...", "show:s1", "prepare", "configure", "clear", "send:prepared"],
      createMetadata: { github: { pullRequestUrl: "https://github.com/owner/repo/pull/42" } }
    });
  });
  test("createAndSendNewChatRequest clears request activity when already cancelled", async () => {
    const session = stubSession({
      sessionId: "s1",
      providerId: "test"
    });
    let requestOptionsResolved = false;
    let activityCleared = 0;
    let deleted = 0;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return {
          uri: URI.parse("test:///folder"),
          label: "Test",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        };
      }
      startNewSessionRequest() {
        return { dispose: () => activityCleared++ };
      }
      deleteNewSession() {
        deleted++;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await assert.rejects(service.createAndSendNewChatRequest(URI.parse("test:///folder"), {
      kind: "deferred",
      activity: "Fetching pull request...",
      async resolve() {
        requestOptionsResolved = true;
        return { query: "prepared" };
      }
    }, void 0, CancellationToken.Cancelled), /Canceled/);
    assert.deepStrictEqual({
      requestOptionsResolved,
      activityCleared,
      deleted
    }, {
      requestOptionsResolved: false,
      activityCleared: 1,
      deleted: 1
    });
  });
  test("createAndSendNewChatRequest disposes the draft when request activity startup fails", async () => {
    const session = stubSession({
      sessionId: "s1",
      providerId: "test"
    });
    let deleted = 0;
    const provider = new class extends TestSessionsProvider {
      getSessions() {
        return [];
      }
      resolveWorkspace() {
        return {
          uri: URI.parse("test:///folder"),
          label: "Test",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        };
      }
      startNewSessionRequest() {
        throw new Error("start failed");
      }
      deleteNewSession() {
        deleted++;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await assert.rejects(service.createAndSendNewChatRequest(URI.parse("test:///folder"), {
      kind: "deferred",
      activity: "Fetching pull request...",
      async resolve() {
        return { query: "prepared" };
      }
    }), /start failed/);
    assert.deepStrictEqual({
      deleted,
      session: service.getSession(session.resource)
    }, {
      deleted: 1,
      session: void 0
    });
  });
  test("createAndSendNewChatRequest refuses an untrusted required workspace before creating a session", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const folderUri = URI.parse("test:///folder");
    let resolveCount = 0;
    let createCount = 0;
    let sendCount = 0;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(uri) {
        resolveCount++;
        return {
          uri,
          label: "Test",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: true,
          isVirtualWorkspace: false
        };
      }
      createNewSession() {
        createCount++;
        return session;
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        sendCount++;
        return session;
      }
    }(session);
    const workspaceTrustManagementService = new TestWorkspaceTrustManagementService();
    workspaceTrustManagementService.trusted = false;
    const { service } = createSessionsManagementService(session, disposables, provider, workspaceTrustManagementService);
    await assert.rejects(
      service.createAndSendNewChatRequest(folderUri, { query: "hi" }),
      WorkspaceNotTrustedError
    );
    workspaceTrustManagementService.trusted = true;
    await service.createAndSendNewChatRequest(folderUri, { query: "hi" });
    assert.deepStrictEqual({
      requestedUris: workspaceTrustManagementService.requestedUris.map((uri) => uri.toString()),
      resolveCount,
      createCount,
      sendCount
    }, {
      requestedUris: [folderUri.toString(), folderUri.toString()],
      resolveCount: 2,
      createCount: 1,
      sendCount: 1
    });
  });
  test("target availability requires the requested provider and session type to be advertised", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const availableFolder = URI.parse("test:///available");
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
        this.sessionTypes = [
          { authRequirement: SessionTypeAuthRequirement.GitHub, id: "workspace-agent", label: "Workspace Agent", icon: Codicon.vm },
          { authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick-agent", label: "Quick Agent", icon: Codicon.vm }
        ];
      }
      resolveWorkspace(folderUri) {
        return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? { folderUri } : void 0;
      }
      getSessionTypes(folderUri) {
        return extUriBiasedIgnorePathCase.isEqual(folderUri, availableFolder) ? [this.sessionTypes[0]] : [];
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    assert.deepStrictEqual({
      defaultWorkspace: service.isNewSessionTargetAvailable(availableFolder),
      exactWorkspace: service.isNewSessionTargetAvailable(availableFolder, { providerId: "test", sessionTypeId: "workspace-agent" }),
      wrongWorkspaceType: service.isNewSessionTargetAvailable(availableFolder, { providerId: "test", sessionTypeId: "quick-agent" }),
      missingWorkspace: service.isNewSessionTargetAvailable(URI.parse("test:///missing")),
      exactQuickChat: service.isQuickChatTargetAvailable({ providerId: "test", sessionTypeId: "quick-agent" }),
      wrongQuickChatProvider: service.isQuickChatTargetAvailable({ providerId: "other", sessionTypeId: "quick-agent" })
    }, {
      defaultWorkspace: true,
      exactWorkspace: true,
      wrongWorkspaceType: false,
      missingWorkspace: false,
      exactQuickChat: true,
      wrongQuickChatProvider: false
    });
  });
  test("createNewSession rejects a pinned session type that is not advertised", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    assert.throws(
      () => service.createNewSession(URI.parse("test:///folder"), { providerId: "test", sessionTypeId: "missing" }),
      /does not advertise session type 'missing'/
    );
  });
  test("inheritableSessionTarget drops a harness the folder no longer offers", () => {
    const folderUri = URI.parse("test:///folder");
    const hiddenHarnessSession = stubSession({ sessionId: "s1", providerId: "test", sessionType: "copilotcli" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "test", label: "Test", icon: Codicon.vm }];
      }
    }(hiddenHarnessSession);
    const { service } = createSessionsManagementService(hiddenHarnessSession, disposables, provider);
    const stillOfferedSession = stubSession({ sessionId: "s2", providerId: "test", sessionType: "test" });
    assert.deepStrictEqual({
      hiddenHarness: inheritableSessionTarget(service, hiddenHarnessSession, folderUri),
      offeredHarness: inheritableSessionTarget(service, stillOfferedSession, folderUri),
      noFolder: inheritableSessionTarget(service, stillOfferedSession, void 0),
      noSession: inheritableSessionTarget(service, void 0, folderUri)
    }, {
      hiddenHarness: {},
      offeredHarness: { providerId: "test", sessionTypeId: "test" },
      noFolder: {},
      noSession: {}
    });
  });
  test("a New Session gesture whose harness is hidden still creates on the fallback provider", async () => {
    const folderUri = URI.parse("test:///folder");
    const extHostSession = stubSession({ sessionId: "exthost-1", providerId: "copilot", sessionType: "copilotcli" });
    const created = [];
    const copilot = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = "copilot";
        this.order = 0;
        this.sessionTypes = [];
      }
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [];
      }
      getSessions() {
        return [extHostSession];
      }
    }(extHostSession);
    const agentHostSession = stubSession({ sessionId: "ah-draft", providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionType: "copilotcli" });
    const agentHost = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
        this.order = -1;
        this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "copilotcli", label: "Copilot", icon: Codicon.vm }];
      }
      resolveWorkspace(_folderUri) {
        return { folderUri: _folderUri };
      }
      getSessionTypes() {
        return [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "copilotcli", label: "Copilot", icon: Codicon.vm }];
      }
      getSessions() {
        return [];
      }
      createNewSession(_folderUri, sessionTypeId) {
        created.push({ providerId: this.id, sessionTypeId });
        return agentHostSession;
      }
    }(agentHostSession);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
    instantiationService.stub(ILogService, new NullLogService());
    instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
    instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilot, agentHost]));
    instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
    instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
    instantiationService.stub(IProgressService, new TestProgressService());
    instantiationService.stub(IChatService, new TestChatService());
    instantiationService.stub(IWorkspaceTrustRequestService, new class extends mock() {
      async requestResourcesTrust() {
        return true;
      }
    }());
    const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
    const view = createView(instantiationService, service, disposables);
    await view.openSession(extHostSession.resource);
    const active = view.activeSession.get();
    const result = await view.openNewSession({
      folderUri,
      ...inheritableSessionTarget(service, active, folderUri)
    });
    assert.deepStrictEqual({
      created,
      resultProviderId: result.session?.providerId,
      trustDeclined: result.trustDeclined
    }, {
      created: [{ providerId: LOCAL_AGENT_HOST_PROVIDER_ID, sessionTypeId: "copilotcli" }],
      resultProviderId: LOCAL_AGENT_HOST_PROVIDER_ID,
      trustDeclined: false
    });
  });
  test("createAndSendQuickChatRequest uses the quick-chat contract without navigation or repository configuration", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///quick-chat") };
    const activeSession = stubSession({ sessionId: "active", providerId: "test" });
    const quickChat = stubSession({
      sessionId: "quick-1",
      providerId: "test",
      isQuickChat: constObservable(true),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
      }
      getSessions() {
        return [activeSession];
      }
      createQuickChat(sessionTypeId) {
        calls.push(`createQuickChat:${sessionTypeId}`);
        return quickChat;
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      setIsolationMode() {
        throw new Error("isolation should not be configured");
      }
      setBranch() {
        throw new Error("branch should not be configured");
      }
      async sendRequest() {
        calls.push("send");
        return quickChat;
      }
    }(quickChat);
    const { service, view } = createSessionsManagementService(activeSession, disposables, provider);
    await view.openSession(activeSession.resource);
    const result = await service.createAndSendQuickChatRequest({ query: "hi" }, {
      providerId: "test",
      sessionTypeId: "test",
      modelId: "gpt-4o",
      isolationMode: "worktree",
      branch: "stale"
    });
    assert.deepStrictEqual({
      sessionId: result?.sessionId,
      activeSession: view.activeSession.get()?.sessionId,
      newSession: service.newSession.get(),
      calls
    }, {
      sessionId: "quick-1",
      activeSession: "active",
      newSession: void 0,
      calls: ["createQuickChat:test", "setModel:gpt-4o", "send"]
    });
  });
  test("createAndSendQuickChatRequest cancels commit detection and disposes the provisional draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///quick-chat") };
    const session = stubSession({
      sessionId: "quick-1",
      providerId: "test",
      isQuickChat: constObservable(true),
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const sendStarted = new DeferredPromise();
    const sendDone = new DeferredPromise();
    const sendReturned = new DeferredPromise();
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
      }
      createQuickChat() {
        return session;
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        await sendStarted.complete();
        await sendDone.p;
        await sendReturned.complete();
        return session;
      }
    }(session);
    const { service, chatService } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    let started = 0;
    let sent = 0;
    disposables.add(service.onDidStartSession(() => started++));
    disposables.add(service.onDidSendRequest(() => sent++));
    const request = service.createAndSendQuickChatRequest({ query: "hi" }, {
      providerId: "test",
      sessionTypeId: "test"
    }, cts.token);
    await sendStarted.p;
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
    await sendDone.complete();
    await sendReturned.p;
    await Promise.resolve();
    await Promise.resolve();
    assert.deepStrictEqual({
      cancelledResources: chatService.cancelledResources.map((resource) => resource.toString()),
      started,
      sent
    }, {
      cancelledResources: [chat.resource.toString()],
      started: 0,
      sent: 0
    });
  });
  test("createAndSendNewChatRequest invokes configuration setters from createOptions", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const calls = [];
    let sentOptions;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      setModel(_sessionId, _modelId) {
        calls.push(`setModel:${_modelId}`);
      }
      setMode(_sessionId, _modeId) {
        calls.push(`setMode:${_modeId}`);
      }
      setPermissionLevel(_sessionId, _level) {
        calls.push(`setPermissionLevel:${_level}`);
      }
      async setIsolationMode(_sessionId, _mode) {
        calls.push(`setIsolationMode:${_mode}`);
      }
      async setBranch(_sessionId, _branch) {
        calls.push(`setBranch:${_branch}`);
      }
      async setWorktreeBranchTrack(_sessionId, _enabled) {
        calls.push(`setWorktreeBranchTrack:${_enabled}`);
      }
      async sendRequest(_sessionId, _chatResource, options) {
        sentOptions = options;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const createOptions = {
      modelId: "gpt-4o",
      modeId: "agent",
      permissionLevel: "allowedTools",
      isolationMode: "worktree",
      worktreeBranchTrack: false,
      branch: "main"
    };
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi", title: "Pull Request", hideFromTranscript: true }, createOptions);
    assert.deepStrictEqual({
      sessionId: result?.sessionId,
      calls,
      sentOptions
    }, {
      sessionId: "s1",
      calls: [
        "setModel:gpt-4o",
        "setMode:agent",
        "setPermissionLevel:allowedTools",
        "setIsolationMode:worktree",
        "setWorktreeBranchTrack:false",
        "setBranch:main"
      ],
      sentOptions: { query: "hi", title: "Pull Request", hideFromTranscript: true }
    });
  });
  test("createAndSendNewChatRequest prefers atomic worktree configuration", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      getSessions() {
        return [];
      }
      async setWorktreeConfiguration(_sessionId, configuration) {
        calls.push(`setWorktreeConfiguration:${JSON.stringify(configuration)}`);
      }
      async setIsolationMode() {
        calls.push("setIsolationMode");
      }
      async setWorktreeBranchTrack() {
        calls.push("setWorktreeBranchTrack");
      }
      async setBranch() {
        calls.push("setBranch");
      }
    }(session);
    const { service, view } = createSessionsManagementService(session, disposables, provider);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      worktreeBranchTrack: true,
      branch: "feature",
      onSessionCreated: (created) => {
        calls.push(`created:${created.sessionId}:${service.getSession(created.resource)?.sessionId}`);
        void view.openSession(created.resource);
      }
    });
    assert.deepStrictEqual({
      calls,
      activeSession: view.activeSession.get()?.sessionId
    }, {
      calls: [
        "created:s1:s1",
        'setWorktreeConfiguration:{"isolationMode":"worktree","worktreeBranchTrack":true,"branch":"feature"}'
      ],
      activeSession: "s1"
    });
  });
  test("createAndSendNewChatRequest skips providers without worktree configuration support", async () => {
    const cloudSession = stubSession({ sessionId: "cloud", providerId: "cloud" });
    const localSession = stubSession({ sessionId: "local", providerId: "local" });
    const cloudProvider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = "cloud";
        this.order = 0;
        this.sessionTypes = [{ id: "cloud", label: "Cloud", icon: Codicon.cloud, supportsWorktreeConfiguration: false, authRequirement: SessionTypeAuthRequirement.None }];
      }
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
    }(cloudSession);
    let configuredBranch;
    const localProvider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.id = "local";
        this.order = 1;
      }
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async setWorktreeConfiguration(_sessionId, configuration) {
        configuredBranch = configuration.branch;
      }
    }(localSession);
    const { service } = createSessionsManagementService(localSession, disposables, [cloudProvider, localProvider]);
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      worktreeBranchTrack: true,
      branch: "feature"
    });
    assert.deepStrictEqual({
      providerId: result?.providerId,
      configuredBranch
    }, {
      providerId: "local",
      configuredBranch: "feature"
    });
  });
  test("createAndSendNewChatRequest uses an immediately resolved model identifier", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const resolvedModel = {
      identifier: "target:gpt-4o",
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "GPT-4o",
        vendor: "target",
        family: "gpt-4o",
        version: "1",
        id: "gpt-4o",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      }
    };
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [resolvedModel], desiredModelResolution: { kind: "available", model: resolvedModel }, modelTarget: "target" };
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "legacy/gpt-4o" });
    assert.deepStrictEqual(calls, ["setModel:target:gpt-4o", "send"]);
  });
  test("createAndSendNewChatRequest waits for and uses the resolved model identifier", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let resolution = { kind: "pending", identifier: "target:gpt-4o" };
    const calls = [];
    const model = {
      identifier: "target:gpt-4o",
      metadata: {
        extension: nullExtensionDescription.identifier,
        name: "GPT-4o",
        vendor: "target",
        family: "gpt-4o",
        version: "1",
        id: "gpt-4o",
        maxInputTokens: 100,
        maxOutputTokens: 100,
        isDefaultForLocation: {}
      }
    };
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: resolution, modelTarget: void 0 };
      }
      setModel(_sessionId, modelId) {
        calls.push(`setModel:${modelId}`);
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "legacy/gpt-4o" });
    await Promise.resolve();
    assert.deepStrictEqual(calls, []);
    resolution = { kind: "available", model };
    onDidChangeModels.fire();
    await request;
    assert.deepStrictEqual(calls, ["setModel:target:gpt-4o", "send"]);
  });
  test("createAndSendNewChatRequest rejects a pending model that becomes unavailable and disposes the draft", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let resolution = { kind: "pending", identifier: "removed-model" };
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: resolution, modelTarget: void 0 };
      }
      setModel() {
        throw new Error("setModel should not be called");
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "removed-model" });
    await Promise.resolve();
    resolution = { kind: "unavailable", identifier: "removed-model" };
    onDidChangeModels.fire();
    await assert.rejects(request, /Model 'removed-model' is unavailable/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest rejects when the workspace stops advertising the session type", async () => {
    const folderUri = URI.parse("test:///folder");
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeSessionTypes = disposables.add(new Emitter());
    let folderTypeAvailable = true;
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeSessionTypes = onDidChangeSessionTypes.event;
      }
      resolveWorkspace() {
        return { uri: folderUri };
      }
      getSessionTypes(candidate) {
        return folderTypeAvailable && extUriBiasedIgnorePathCase.isEqual(candidate, folderUri) ? [...this.sessionTypes] : [];
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: { kind: "pending", identifier: "gpt-4o" }, modelTarget: void 0 };
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(folderUri, { query: "hi" }, { modelId: "gpt-4o" });
    await Promise.resolve();
    folderTypeAvailable = false;
    onDidChangeSessionTypes.fire();
    await assert.rejects(request, /Session type 'test' is no longer available/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest cancels while waiting for model resolution and disposes the draft", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const onDidChangeModels = disposables.add(new Emitter());
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.onDidChangeModels = onDidChangeModels.event;
      }
      resolveWorkspace(folderUri) {
        return { folderUri };
      }
      getModelsSnapshot() {
        return { models: [], desiredModelResolution: { kind: "pending", identifier: "gpt-4o" }, modelTarget: void 0 };
      }
      deleteNewSession() {
        deleted = true;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "gpt-4o" }, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest awaits asynchronous repository configuration setters", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const isolationDone = new DeferredPromise();
    const branchTrackStarted = new DeferredPromise();
    const branchTrackDone = new DeferredPromise();
    const branchStarted = new DeferredPromise();
    const branchDone = new DeferredPromise();
    const calls = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async setIsolationMode() {
        calls.push("isolation:start");
        await isolationDone.p;
        calls.push("isolation:end");
      }
      async setWorktreeBranchTrack() {
        calls.push("branchTrack:start");
        await branchTrackStarted.complete();
        await branchTrackDone.p;
        calls.push("branchTrack:end");
      }
      async setBranch() {
        calls.push("branch:start");
        await branchStarted.complete();
        await branchDone.p;
        calls.push("branch:end");
      }
      async sendRequest() {
        calls.push("send");
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      worktreeBranchTrack: false,
      branch: "main"
    });
    await Promise.resolve();
    assert.deepStrictEqual(calls, ["isolation:start"]);
    await isolationDone.complete();
    await branchTrackStarted.p;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start"]);
    await branchTrackDone.complete();
    await branchStarted.p;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start", "branchTrack:end", "branch:start"]);
    await branchDone.complete();
    await request;
    assert.deepStrictEqual(calls, ["isolation:start", "isolation:end", "branchTrack:start", "branchTrack:end", "branch:start", "branch:end", "send"]);
  });
  test("createAndSendNewChatRequest cancels pending repository configuration and disposes the draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const configurationDone = new DeferredPromise();
    let deleted = false;
    let sent = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async setIsolationMode() {
        await configurationDone.p;
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        sent = true;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "worktree",
      branch: "main"
    }, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.deepStrictEqual({ deleted, sent }, { deleted: true, sent: false });
    await configurationDone.complete();
  });
  test("createAndSendNewChatRequest cancels a pending send and disposes the draft", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const sendDone = new DeferredPromise();
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest() {
        await sendDone.p;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const cts = disposables.add(new CancellationTokenSource());
    const request = service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, void 0, cts.token);
    await Promise.resolve();
    cts.cancel();
    await assert.rejects(request, /Canceled/);
    assert.strictEqual(deleted, true);
    await sendDone.complete();
  });
  test("createAndSendNewChatRequest rejects worktree configuration for unsupported session types", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let created = false;
    let sent = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "test", label: "Test", icon: Codicon.vm }];
      }
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      createNewSession() {
        created = true;
        return session;
      }
      async sendRequest() {
        sent = true;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await assert.rejects(
      () => service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
        isolationMode: "worktree",
        branch: "legacy-branch"
      }),
      /No sessions provider supports worktree configuration/
    );
    assert.deepStrictEqual({ created, sent }, { created: false, sent: false });
  });
  test("createAndSendNewChatRequest permits folder isolation for unsupported worktree session types", async () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    let sent = false;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "test", label: "Test", icon: Codicon.vm }];
      }
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async sendRequest() {
        sent = true;
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, {
      isolationMode: "workspace"
    });
    assert.deepStrictEqual({ providerId: result?.providerId, sent }, { providerId: "test", sent: true });
  });
  test("createAndSendNewChatRequest disposes stranded draft when a setter throws", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    let deleted = false;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      setModel() {
        throw new Error("model not found");
      }
      deleteNewSession() {
        deleted = true;
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    await assert.rejects(
      () => service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" }, { modelId: "bad" }),
      /model not found/
    );
    assert.strictEqual(deleted, true);
  });
  test("createAndSendNewChatRequest returns undefined when service is disposed mid-send", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const serviceRef = {};
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      async sendRequest(_sessionId, _chatResource, _options) {
        serviceRef.current.dispose();
        return session;
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    serviceRef.current = service;
    const result = await service.createAndSendNewChatRequest(URI.parse("test:///folder"), { query: "hi" });
    assert.strictEqual(result, void 0);
  });
  test("discardNewSession fires onDidDiscardNewSession with the discarded draft", () => {
    const session = stubSession({ sessionId: "s1", providerId: "test" });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    const discarded = [];
    disposables.add(service.onDidDiscardNewSession((s) => discarded.push(s.sessionId)));
    service.createNewSession(URI.parse("test:///folder"));
    service.discardNewSession();
    assert.deepStrictEqual(discarded, ["s1"]);
  });
  test("createNewSession fires replacement before publishing the new draft", () => {
    const drafts = [
      stubSession({ sessionId: "s1", providerId: "test" }),
      stubSession({ sessionId: "s2", providerId: "test" })
    ];
    const deleted = [];
    let createIndex = 0;
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      createNewSession() {
        return drafts[createIndex++];
      }
      deleteNewSession(sessionId) {
        deleted.push(sessionId);
      }
    }(drafts[0]);
    const { service } = createSessionsManagementService(drafts[0], disposables, provider);
    const replacements = [];
    disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => {
      replacements.push({ from: from.sessionId, to: to.sessionId, currentDraft: service.newSession.get()?.sessionId });
    }));
    service.createNewSession(URI.parse("test:///folder"));
    service.createNewSession(URI.parse("test:///folder"));
    assert.deepStrictEqual({
      replacements,
      deleted,
      currentDraft: service.newSession.get()?.sessionId
    }, {
      replacements: [{ from: "s1", to: "s2", currentDraft: "s1" }],
      deleted: ["s1"],
      currentDraft: "s2"
    });
  });
  test("createNewSession keeps the previous draft when replacement creation fails", () => {
    const draft = stubSession({ sessionId: "s1", providerId: "test" });
    let createCount = 0;
    const deleted = [];
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
      createNewSession() {
        if (createCount++ > 0) {
          throw new Error("create failed");
        }
        return draft;
      }
      deleteNewSession(sessionId) {
        deleted.push(sessionId);
      }
    }(draft);
    const { service } = createSessionsManagementService(draft, disposables, provider);
    const replacements = [];
    disposables.add(service.onDidReplaceNewDraftSession(({ from, to }) => replacements.push(`${from.sessionId}->${to.sessionId}`)));
    service.createNewSession(URI.parse("test:///folder"));
    assert.throws(() => service.createNewSession(URI.parse("test:///folder")), /create failed/);
    assert.deepStrictEqual({
      currentDraft: service.newSession.get()?.sessionId,
      replacements,
      deleted
    }, {
      currentDraft: "s1",
      replacements: [],
      deleted: []
    });
  });
  test("automation draft lifecycle is isolated from the new-session draft", () => {
    const drafts = [
      stubSession({ sessionId: "automation-workspace", providerId: "test" }),
      stubSession({ sessionId: "new-session", providerId: "test" }),
      stubSession({ sessionId: "automation-quick-chat", providerId: "test" }),
      stubSession({ sessionId: "automation-replacement", providerId: "test" })
    ];
    const deleted = [];
    let createIndex = 0;
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(...arguments);
        this.supportsQuickChats = true;
      }
      resolveWorkspace(folderUri2) {
        return {
          uri: folderUri2,
          label: "Workspace",
          icon: Codicon.folder,
          folders: [],
          requiresWorkspaceTrust: false,
          isVirtualWorkspace: false
        };
      }
      createNewSession() {
        return drafts[createIndex++];
      }
      createQuickChat() {
        return drafts[createIndex++];
      }
      deleteNewSession(sessionId) {
        deleted.push(sessionId);
      }
    }(drafts[0]);
    const { service } = createSessionsManagementService(drafts[0], disposables, provider);
    const folderUri = URI.parse("test:///folder");
    const firstAutomationSession = service.createAutomationSession(folderUri);
    service.createNewSession(folderUri);
    service.createAutomationQuickChat();
    service.discardAutomationSession(firstAutomationSession);
    service.createAutomationSession(folderUri);
    service.discardAutomationSession();
    assert.deepStrictEqual({
      newSession: service.newSession.get()?.sessionId,
      automationSession: service.automationSession.get()?.sessionId,
      deleted
    }, {
      newSession: "new-session",
      automationSession: void 0,
      deleted: ["automation-workspace", "automation-quick-chat", "automation-replacement"]
    });
  });
  test("sendNewChatRequest clears the draft without firing onDidDiscardNewSession", async () => {
    const chat = { ...stubChat, resource: URI.parse("test:///chat") };
    const session = stubSession({
      sessionId: "s1",
      providerId: "test",
      chats: constObservable([chat]),
      mainChat: constObservable(chat)
    });
    const provider = new class extends TestSessionsProvider {
      resolveWorkspace() {
        return { folderUri: URI.parse("test:///folder") };
      }
    }(session);
    const { service } = createSessionsManagementService(session, disposables, provider);
    let discardCount = 0;
    disposables.add(service.onDidDiscardNewSession(() => discardCount++));
    const draft = service.createNewSession(URI.parse("test:///folder"));
    await service.sendNewChatRequest(draft, { query: "hi" });
    assert.strictEqual(discardCount, 0);
  });
  test("getAllSessionTypes orders providers by their order property (lower first)", () => {
    const service = createOrderedTypesService(disposables, 0, 1);
    assert.deepStrictEqual(service.getAllSessionTypes().map((type) => type.id), ["copilot", "agent-host"]);
  });
  test("getAllSessionTypes surfaces local agent host types first when it has lower order", () => {
    const service = createOrderedTypesService(disposables, 0, -1);
    assert.deepStrictEqual(service.getAllSessionTypes().map((type) => type.id), ["agent-host", "copilot"]);
  });
  test("replacing the active session promotes the committed session to active", async () => {
    const draft = stubSession({ sessionId: "draft", providerId: "test" });
    const committed = stubSession({ sessionId: "committed", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(draft);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [draft, committed];
      }
    }();
    const { view } = createSessionsManagementService(draft, disposables, provider);
    await view.openSession(draft.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "draft");
    onDidReplaceSession.fire({ from: draft, to: committed });
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["committed"],
      active: "committed"
    });
  });
  test("replacing the active session in place (same id, new resource) re-points the active session", async () => {
    const before = stubSession({ sessionId: "same", providerId: "test", resource: URI.parse("test:///before") });
    const after = stubSession({ sessionId: "same", providerId: "test", resource: URI.parse("test:///after") });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(before);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [before];
      }
    }();
    const { view } = createSessionsManagementService(before, disposables, provider);
    await view.openSession(before.resource);
    assert.strictEqual(view.activeSession.get()?.resource.toString(), before.resource.toString());
    onDidReplaceSession.fire({ from: before, to: after });
    assert.strictEqual(view.activeSession.get()?.resource.toString(), after.resource.toString());
  });
  test("replacing a non-active session leaves the active session unchanged", async () => {
    const active = stubSession({ sessionId: "active", providerId: "test" });
    const draft = stubSession({ sessionId: "draft", providerId: "test" });
    const committed = stubSession({ sessionId: "committed", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(active);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [active, draft, committed];
      }
    }();
    const { view } = createSessionsManagementService(active, disposables, provider);
    await view.openSession(active.resource);
    view.insertAt(draft, "active", "right", false);
    assert.strictEqual(view.activeSession.get()?.sessionId, "active");
    onDidReplaceSession.fire({ from: draft, to: committed });
    assert.deepStrictEqual({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      active: view.activeSession.get()?.sessionId ?? null
    }, {
      visible: ["active", "committed"],
      active: "active"
    });
  });
  test("replacing a session only swaps the active session when it matches `from`", async () => {
    const a = stubSession({ sessionId: "a", providerId: "test" });
    const b = stubSession({ sessionId: "b", providerId: "test" });
    const other = stubSession({ sessionId: "other", providerId: "test" });
    const onDidReplaceSession = disposables.add(new Emitter());
    const provider = new class extends TestSessionsProvider {
      constructor() {
        super(a);
        this.onDidReplaceSession = onDidReplaceSession.event;
      }
      getSessions() {
        return [a, b, other];
      }
    }();
    const { view } = createSessionsManagementService(a, disposables, provider);
    await view.openSession(a.resource);
    assert.strictEqual(view.activeSession.get()?.sessionId, "a");
    onDidReplaceSession.fire({ from: other, to: b });
    assert.strictEqual(view.activeSession.get()?.sessionId, "a");
    onDidReplaceSession.fire({ from: a, to: b });
    assert.strictEqual(view.activeSession.get()?.sessionId, "b");
  });
  suite("deleteSessions", () => {
    class RecordingProvider extends TestSessionsProvider {
      constructor(id, _fail, session) {
        super(session);
        this.id = id;
        this._fail = _fail;
        this.deleted = [];
      }
      async deleteSessions(sessionIds) {
        this.deleted.push([...sessionIds]);
        if (this._fail) {
          throw new Error(`${this.id} failed`);
        }
      }
    }
    function createService(providers) {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      instantiationService.stub(IChatWidgetHistoryService, new class extends mock() {
        moveHistory() {
        }
      }());
      return disposables.add(instantiationService.createInstance(SessionsManagementService));
    }
    test("groups sessions by provider and continues when one provider fails (best-effort)", async () => {
      const s1 = stubSession({ sessionId: "s1", providerId: "p1" });
      const s2 = stubSession({ sessionId: "s2", providerId: "p2" });
      const failing = new RecordingProvider("p1", true, s1);
      const succeeding = new RecordingProvider("p2", false, s2);
      const service = createService([failing, succeeding]);
      const deleted = [];
      disposables.add(service.onDidDeleteSession((session) => deleted.push(session.sessionId)));
      await assert.rejects(service.deleteSessions([s1, s2]), /p1 failed/);
      assert.deepStrictEqual({
        failingDeleted: failing.deleted,
        succeedingDeleted: succeeding.deleted,
        eventsFired: deleted
      }, {
        failingDeleted: [["s1"]],
        succeedingDeleted: [["s2"]],
        eventsFired: ["s2"]
      });
    });
  });
  suite("createNewChatInSession", () => {
    test("reuses an existing untitled chat instead of creating a new one", async () => {
      const untitledChat = { ...stubChat, resource: URI.parse("test:///untitled"), status: constObservable(SessionStatus.Untitled) };
      const session = stubSession({ sessionId: "reuse", providerId: "test", chats: constObservable([untitledChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return stubChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.deepStrictEqual({
        reused: result === untitledChat,
        createNewChatCalls
      }, {
        reused: true,
        createNewChatCalls: 0
      });
    });
    test("asks the provider to create a chat when none are untitled", async () => {
      const activeChat = { ...stubChat, resource: URI.parse("test:///active"), status: constObservable(SessionStatus.InProgress) };
      const createdChat = { ...stubChat, resource: URI.parse("test:///created") };
      const session = stubSession({ sessionId: "create", providerId: "test", chats: constObservable([activeChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return createdChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.deepStrictEqual({
        result: result?.resource.toString(),
        createNewChatCalls
      }, {
        result: createdChat.resource.toString(),
        createNewChatCalls: 1
      });
    });
    test("forceNew creates a fresh chat even when an untitled one exists", async () => {
      const untitledChat = { ...stubChat, resource: URI.parse("test:///untitled"), status: constObservable(SessionStatus.Untitled) };
      const createdChat = { ...stubChat, resource: URI.parse("test:///created") };
      const session = stubSession({ sessionId: "force-new", providerId: "test", chats: constObservable([untitledChat]) });
      let createNewChatCalls = 0;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createNewChat() {
          createNewChatCalls++;
          return createdChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session, { forceNew: true });
      assert.deepStrictEqual({
        result: result?.resource.toString(),
        createNewChatCalls
      }, {
        result: createdChat.resource.toString(),
        createNewChatCalls: 1
      });
    });
    test("returns undefined when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider" });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createNewChatInSession(session);
      assert.strictEqual(result, void 0);
    });
  });
  suite("forkChatInSession", () => {
    test("asks the provider to fork the chat when the session supports multiple chats", async () => {
      const sourceChat = URI.parse("test:///source");
      const forkedChat = { ...stubChat, resource: URI.parse("test:///forked") };
      const session = stubSession({ sessionId: "fork", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true }) });
      let forkChatArgs;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async forkChat(sessionId, sourceChat2, turnId) {
          forkChatArgs = [sessionId, sourceChat2, turnId];
          return forkedChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.forkChatInSession(session, sourceChat, "turn-1");
      assert.deepStrictEqual({
        result: result.resource.toString(),
        args: forkChatArgs?.map((arg) => URI.isUri(arg) ? arg.toString() : arg)
      }, {
        result: forkedChat.resource.toString(),
        args: ["fork", sourceChat.toString(), "turn-1"]
      });
    });
    test("throws when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider", capabilities: constObservable({ supportsMultipleChats: true }) });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      await assert.rejects(() => service.forkChatInSession(session, URI.parse("test:///source"), "turn-1"), /Provider 'missing-provider' not found/);
    });
    test("throws when the session does not support multiple chats", async () => {
      const session = stubSession({ sessionId: "single-chat", providerId: "test", capabilities: constObservable({ supportsMultipleChats: false }) });
      const { service } = createSessionsManagementService(session, disposables);
      await assert.rejects(() => service.forkChatInSession(session, URI.parse("test:///source"), "turn-1"), /does not support forking into a chat/);
    });
  });
  suite("createSideChatInSession", () => {
    test("asks the provider to create the side chat when the session supports it", async () => {
      const sourceChat = URI.parse("test:///source");
      const sideChat = { ...stubChat, resource: URI.parse("test:///side") };
      const session = stubSession({ sessionId: "side", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
      const selection = { text: "  selected text  " };
      let createSideChatArgs;
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(session);
        }
        async createSideChat(sessionId, sourceChat2, turnId, selection2) {
          createSideChatArgs = [sessionId, sourceChat2, turnId, selection2];
          return sideChat;
        }
      }();
      const { service } = createSessionsManagementService(session, disposables, provider);
      const result = await service.createSideChatInSession(session, sourceChat, "turn-1", selection);
      assert.deepStrictEqual({
        result: result.resource.toString(),
        args: createSideChatArgs?.map((arg) => URI.isUri(arg) ? arg.toString() : arg)
      }, {
        result: sideChat.resource.toString(),
        args: ["side", sourceChat.toString(), "turn-1", selection]
      });
    });
    test("throws when the provider is not found", async () => {
      const session = stubSession({ sessionId: "orphan", providerId: "missing-provider", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: true }) });
      const provider = new TestSessionsProvider(stubSession({ sessionId: "other", providerId: "test" }));
      const { service } = createSessionsManagementService(session, disposables, provider);
      await assert.rejects(() => service.createSideChatInSession(session, URI.parse("test:///source"), "turn-1"), /Provider 'missing-provider' not found/);
    });
    test("throws when the session does not support side chats", async () => {
      const session = stubSession({ sessionId: "no-side-chat", providerId: "test", capabilities: constObservable({ supportsMultipleChats: true, supportsSideChat: false }) });
      const { service } = createSessionsManagementService(session, disposables);
      await assert.rejects(() => service.createSideChatInSession(session, URI.parse("test:///source"), "turn-1"), /does not support side chats/);
    });
  });
  suite("closed chats persistence", () => {
    function chat(id, status = SessionStatus.Completed, origin) {
      return {
        ...stubChat,
        resource: URI.parse(`test:///chat/${id}`),
        title: constObservable(id),
        status: constObservable(status),
        origin: origin ? { kind: origin } : void 0
      };
    }
    function multiChatSession(id, chats) {
      return stubSession({
        sessionId: id,
        providerId: "test",
        chats: constObservable(chats),
        mainChat: constObservable(chats[0]),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
    }
    function setup(sessions) {
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessions[0]);
        }
        getSessions() {
          return sessions;
        }
      }();
      return createSessionsManagementService(sessions[0], disposables, provider);
    }
    const closedTitles = (view) => (view.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get());
    test("a chat closed in one session stays closed after switching away and back", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(activeA, chatB);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
    });
    test("closing the middle of three chats persists across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("c1"), chat("c2"), chat("c3")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const middle = sessionA.chats.get().find((c) => c.title.get() === "c2");
      await view.closeChat(activeA, middle);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      const reActiveA = view.activeSession.get();
      assert.deepStrictEqual({
        open: reActiveA.openChats.get().map((c) => c.title.get()),
        closed: reActiveA.closedChats.get().map((c) => c.title.get())
      }, {
        open: ["c1", "c3"],
        closed: ["c2"]
      });
    });
    test("closing the active chat persists across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.openChat(sessionA, chatB.resource);
      await view.closeChat(view.activeSession.get(), chatB);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["b"]);
    });
    test("reopening a closed chat is also persisted across a switch", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(activeA, chatB);
      await view.openChat(sessionA, chatB.resource);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), []);
    });
    test("a closed side chat stays closed after switching away and back", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("side", SessionStatus.Completed, ChatOriginKind.SideChat)]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const activeA = view.activeSession.get();
      const sideChat = sessionA.chats.get().find((c) => c.title.get() === "side");
      await view.closeChat(activeA, sideChat);
      assert.deepStrictEqual(closedTitles(view), ["side"]);
      await view.openSession(sessionB.resource);
      await view.openSession(sessionA.resource);
      assert.deepStrictEqual(closedTitles(view), ["side"]);
    });
    test("a closed chat stays closed across a restart", async () => {
      const mainA = chat("mainA");
      const chatB = chat("b");
      const sessionA = stubSession({
        sessionId: "A",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainA, chatB]),
        mainChat: constObservable(mainA),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const storage = disposables.add(new InMemoryStorageService());
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessionA);
        }
        getSessions() {
          return [sessionA];
        }
      }();
      const makeView = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
        instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
        instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
        instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
        instantiationService.stub(IProgressService, new TestProgressService());
        instantiationService.stub(IChatService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidSubmitRequest = Event.None;
          }
        }());
        const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
        return createView(instantiationService, service, disposables);
      };
      const first = makeView();
      await first.openSession(sessionA.resource);
      await first.closeChat(first.activeSession.get(), chatB);
      await storage.flush();
      const second = makeView();
      await second.restoreVisibleSessions();
      assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get()), ["b"]);
    });
    test("a chat closed in a non-active session stays closed across a restart", async () => {
      const mainA = chat("mainA");
      const chatA2 = chat("a2");
      const sessionA = stubSession({
        sessionId: "A",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainA, chatA2]),
        mainChat: constObservable(mainA),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const mainB = chat("mainB");
      const chatB2 = chat("b2");
      const sessionB = stubSession({
        sessionId: "B",
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable([mainB, chatB2]),
        mainChat: constObservable(mainB),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
      const storage = disposables.add(new InMemoryStorageService());
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessionA);
        }
        getSessions() {
          return [sessionA, sessionB];
        }
      }();
      const makeView = () => {
        const instantiationService = disposables.add(new TestInstantiationService());
        instantiationService.stub(IStorageService, storage);
        instantiationService.stub(ILogService, new NullLogService());
        instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
        instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([provider]));
        instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
        instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
        instantiationService.stub(IProgressService, new TestProgressService());
        instantiationService.stub(IChatService, new class extends mock() {
          constructor() {
            super(...arguments);
            this.onDidSubmitRequest = Event.None;
          }
        }());
        const service = disposables.add(instantiationService.createInstance(SessionsManagementService));
        return createView(instantiationService, service, disposables);
      };
      const first = makeView();
      await first.openSession(sessionB.resource);
      await first.closeChat(first.activeSession.get(), chatB2);
      await first.openSession(sessionA.resource);
      await first.closeChat(first.activeSession.get(), chatA2);
      await storage.flush();
      const second = makeView();
      await second.restoreVisibleSessions();
      await second.openSession(sessionB.resource);
      assert.deepStrictEqual((second.activeSession.get()?.closedChats.get() ?? []).map((c) => c.title.get()), ["b2"]);
    });
  });
  suite("reopenLastClosedItem", () => {
    function chat(title) {
      return {
        ...stubChat,
        resource: URI.parse(`test:///chat/${title}`),
        title: constObservable(title),
        status: constObservable(SessionStatus.Completed)
      };
    }
    function multiChatSession(id, chats) {
      return stubSession({
        sessionId: id,
        providerId: "test",
        status: constObservable(SessionStatus.Completed),
        chats: constObservable(chats),
        mainChat: constObservable(chats[0]),
        capabilities: constObservable({ supportsMultipleChats: true })
      });
    }
    function setup(sessions) {
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessions[0]);
        }
        getSessions() {
          return sessions;
        }
      }();
      const { view, contextKeyService } = createSessionsManagementService(sessions[0], disposables, provider);
      return { view, canReopen: () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true };
    }
    const grid = (view) => ({
      visible: view.visibleSessions.get().map((s) => s?.sessionId ?? null),
      sticky: view.visibleSessions.get().map((s) => s?.sticky.get() ?? false),
      active: view.activeSession.get()?.sessionId ?? null
    });
    test("reopens a closed chat, consuming the entry", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const { view, canReopen } = setup([sessionA]);
      await view.openSession(sessionA.resource);
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(view.activeSession.get(), chatB);
      const afterClose = canReopen();
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({
        afterClose,
        closed: view.activeSession.get().closedChats.get().map((c) => c.title.get()),
        open: view.activeSession.get().openChats.get().map((c) => c.title.get()),
        canReopenAgain: canReopen()
      }, {
        afterClose: true,
        closed: [],
        open: ["mainA", "b"],
        canReopenAgain: false
      });
    });
    test("an explicitly closed session returns to its grid index", async () => {
      const sessionA = multiChatSession("A", [chat("mainA")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      view.toggleSessionStickiness(sessionA);
      await view.openSession(sessionB.resource);
      view.closeSession(sessionA);
      const afterClose = grid(view);
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({ afterClose, afterReopen: grid(view) }, {
        afterClose: { visible: ["B"], sticky: [false], active: "B" },
        afterReopen: { visible: ["A", "B"], sticky: [true, false], active: "A" }
      });
    });
    test("a session pushed out of the grid takes its slot back", async () => {
      const sessionA = multiChatSession("A", [chat("mainA")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      await view.openSession(sessionB.resource);
      const afterReplace = grid(view);
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({ afterReplace, afterReopen: grid(view) }, {
        afterReplace: { visible: ["B"], sticky: [false], active: "B" },
        afterReopen: { visible: ["A"], sticky: [false], active: "A" }
      });
    });
    test("remembers only the most recently closed item", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const { view } = setup([sessionA, sessionB]);
      await view.openSession(sessionA.resource);
      const chatB = sessionA.chats.get().find((c) => c.title.get() === "b");
      await view.closeChat(view.activeSession.get(), chatB);
      await view.openSession(sessionB.resource);
      await view.reopenLastClosedItem();
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({
        ...grid(view),
        closedChats: view.activeSession.get().closedChats.get().map((c) => c.title.get())
      }, {
        visible: ["A"],
        sticky: [false],
        active: "A",
        closedChats: ["b"]
      });
    });
    test("a batch close is not offered for reopening", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b"), chat("c")]);
      const { view, canReopen } = setup([sessionA]);
      await view.openSession(sessionA.resource);
      const active = view.activeSession.get();
      for (const target of ["b", "c"]) {
        await view.closeChat(active, sessionA.chats.get().find((c) => c.title.get() === target), { skipHistory: true });
      }
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({
        canReopen: canReopen(),
        closed: view.activeSession.get().closedChats.get().map((c) => c.title.get())
      }, {
        canReopen: false,
        closed: ["b", "c"]
      });
    });
    test("a stale entry is dropped when its session vanished without a delete event", async () => {
      const sessionA = multiChatSession("A", [chat("mainA"), chat("b")]);
      const sessionB = multiChatSession("B", [chat("mainB")]);
      const sessions = [sessionA, sessionB];
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessionA);
        }
        getSessions() {
          return sessions;
        }
      }();
      const { view, contextKeyService } = createSessionsManagementService(sessionA, disposables, provider);
      const canReopen = () => contextKeyService.getContextKeyValue(SessionsHasClosedItemContext.key) === true;
      await view.openSession(sessionA.resource);
      await view.closeChat(view.activeSession.get(), sessionA.chats.get().find((c) => c.title.get() === "b"));
      sessions.splice(0, 1);
      await view.reopenLastClosedItem();
      assert.deepStrictEqual({ canReopen: canReopen() }, { canReopen: false });
    });
  });
  suite("createQuickChat", () => {
    class QuickChatProvider extends TestSessionsProvider {
      constructor(seed, id = "quick-provider", order = 0, sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick", label: "Quick", icon: Codicon.vm }]) {
        super(seed);
        this.id = id;
        this.order = order;
        this.sessionTypes = sessionTypes;
        this.createQuickChatCalls = 0;
        this.supportsQuickChats = true;
      }
      createQuickChat(sessionTypeId) {
        this.createQuickChatCalls++;
        this.lastQuickChatType = sessionTypeId;
        return stubSession({ sessionId: `q${this.createQuickChatCalls}`, providerId: this.id });
      }
    }
    function setupQuickChat(providers) {
      const instantiationService = disposables.add(new TestInstantiationService());
      instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
      instantiationService.stub(ILogService, new NullLogService());
      instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
      instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService(providers));
      instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
      instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
      instantiationService.stub(IProgressService, new TestProgressService());
      instantiationService.stub(IChatService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidSubmitRequest = Event.None;
        }
      }());
      return disposables.add(instantiationService.createInstance(SessionsManagementService));
    }
    test("creates a session via the first capable provider (by order) and defaults the type", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
          this.order = 0;
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 1);
      const service = setupQuickChat([plain, quick]);
      const session = service.createQuickChat();
      assert.deepStrictEqual({
        createdSessionId: session.sessionId,
        requestedType: quick.lastQuickChatType,
        draft: service.newSession.get()?.sessionId
      }, {
        createdSessionId: "q1",
        requestedType: "quick",
        draft: "q1"
      });
    });
    test("mints a new quick-chat session on each call", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }));
      const service = setupQuickChat([quick]);
      const first = service.createQuickChat();
      const second = service.createQuickChat();
      assert.deepStrictEqual({
        first: first.sessionId,
        second: second.sessionId,
        createQuickChatCalls: quick.createQuickChatCalls,
        draft: service.newSession.get()?.sessionId
      }, {
        first: "q1",
        second: "q2",
        createQuickChatCalls: 2,
        draft: "q2"
      });
    });
    test("throws when no provider supports quick chats", () => {
      const plain = new TestSessionsProvider(stubSession({ sessionId: "p1", providerId: "test" }));
      const service = setupQuickChat([plain]);
      assert.throws(() => service.createQuickChat(), /No sessions provider supports quick chats/);
    });
    test("honours options.providerId and the requested session type", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick", label: "Quick", icon: Codicon.vm },
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ providerId: "quick-provider", sessionTypeId: "other" });
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("honours an explicit sessionTypeId without a providerId", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick", label: "Quick", icon: Codicon.vm },
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ sessionTypeId: "other" });
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("defaults to the last-used session type on the next call", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 0, [
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick", label: "Quick", icon: Codicon.vm },
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([quick]);
      service.createQuickChat({ sessionTypeId: "other" });
      service.createQuickChat();
      assert.strictEqual(quick.lastQuickChatType, "other");
    });
    test("throws when the requested provider does not advertise the session type", () => {
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }));
      const service = setupQuickChat([quick]);
      assert.throws(() => service.createQuickChat({ providerId: "quick-provider", sessionTypeId: "missing" }), /does not advertise session type/);
    });
    test("throws when the requested provider does not support quick chats", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const service = setupQuickChat([plain]);
      assert.throws(() => service.createQuickChat({ providerId: "plain" }), /does not support quick chats/);
    });
    test("getQuickChatSessionTypes returns every advertised type from quick-chat-capable providers only", () => {
      const plain = new class extends TestSessionsProvider {
        constructor() {
          super(...arguments);
          this.id = "plain";
          this.order = 0;
        }
      }(stubSession({ sessionId: "p1", providerId: "plain" }));
      const quick = new QuickChatProvider(stubSession({ sessionId: "seed", providerId: "quick-provider" }), "quick-provider", 1, [
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "quick", label: "Quick", icon: Codicon.vm },
        { authRequirement: SessionTypeAuthRequirement.GitHub, id: "other", label: "Other", icon: Codicon.vm }
      ]);
      const service = setupQuickChat([plain, quick]);
      assert.deepStrictEqual(
        service.getQuickChatSessionTypes().map((t) => ({ providerId: t.providerId, sessionTypeId: t.sessionType.id })),
        [
          { providerId: "quick-provider", sessionTypeId: "quick" },
          { providerId: "quick-provider", sessionTypeId: "other" }
        ]
      );
    });
  });
  suite("legacy Copilot CLI migration", () => {
    const RAW_ID = "sess-abc";
    function legacyCliSession() {
      return stubSession({
        sessionId: `legacy-${RAW_ID}`,
        providerId: "default-copilot",
        sessionType: COPILOT_CLI_EH_SCHEME,
        resource: URI.from({ scheme: COPILOT_CLI_EH_SCHEME, path: `/${RAW_ID}` })
      });
    }
    function migratedCliSession() {
      return stubSession({
        sessionId: `migrated-${RAW_ID}`,
        providerId: LOCAL_AGENT_HOST_PROVIDER_ID,
        sessionType: COPILOT_CLI_EH_SCHEME,
        resource: URI.from({ scheme: COPILOT_CLI_LOCAL_AH_SCHEME, path: `/${RAW_ID}` })
      });
    }
    function serviceWithSessions(sessions) {
      const provider = new class extends TestSessionsProvider {
        constructor() {
          super(sessions[0]);
        }
        getSessions() {
          return [...sessions];
        }
      }();
      return createSessionsManagementService(sessions[0], disposables, provider).service;
    }
    test("getSessions hides the legacy entry once its migrated agent-host entry exists", () => {
      const legacy = legacyCliSession();
      const migrated = migratedCliSession();
      const service = serviceWithSessions([legacy, migrated]);
      assert.deepStrictEqual(
        service.getSessions().map((s) => s.sessionId),
        [migrated.sessionId]
      );
    });
    test("getSessions keeps the legacy entry visible when no migrated entry exists", () => {
      const legacy = legacyCliSession();
      const service = serviceWithSessions([legacy]);
      assert.deepStrictEqual(
        service.getSessions().map((s) => s.sessionId),
        [legacy.sessionId]
      );
    });
    test("getSession still resolves the hidden legacy entry so it can be migrated on open", () => {
      const legacy = legacyCliSession();
      const migrated = migratedCliSession();
      const service = serviceWithSessions([legacy, migrated]);
      assert.deepStrictEqual(
        {
          listed: service.getSessions().some((s) => s.sessionId === legacy.sessionId),
          resolved: service.getSession(legacy.resource)?.sessionId ?? null
        },
        { listed: false, resolved: legacy.sessionId }
      );
    });
  });
});
function createOrderedTypesService(disposables, copilotOrder, agentHostOrder) {
  const copilotProvider = new class extends TestSessionsProvider {
    constructor() {
      super(...arguments);
      this.id = "default-copilot";
      this.order = copilotOrder;
      this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "copilot", label: "Copilot", icon: Codicon.vm }];
    }
  }(stubSession({ sessionId: "c1", providerId: "default-copilot" }));
  const agentHostProvider = new class extends TestSessionsProvider {
    constructor() {
      super(...arguments);
      this.id = LOCAL_AGENT_HOST_PROVIDER_ID;
      this.order = agentHostOrder;
      this.sessionTypes = [{ authRequirement: SessionTypeAuthRequirement.GitHub, id: "agent-host", label: "Agent Host", icon: Codicon.vm }];
    }
  }(stubSession({ sessionId: "a1", providerId: LOCAL_AGENT_HOST_PROVIDER_ID }));
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IStorageService, disposables.add(new InMemoryStorageService()));
  instantiationService.stub(ILogService, new NullLogService());
  instantiationService.stub(IContextKeyService, disposables.add(new MockContextKeyService()));
  instantiationService.stub(ISessionsProvidersService, new TestSessionsProvidersService([copilotProvider, agentHostProvider]));
  instantiationService.stub(IUriIdentityService, { extUri: extUriBiasedIgnorePathCase });
  instantiationService.stub(IChatWidgetService, new TestChatWidgetService());
  instantiationService.stub(IProgressService, new TestProgressService());
  instantiationService.stub(IChatService, new class extends mock() {
    constructor() {
      super(...arguments);
      this.onDidSubmitRequest = Event.None;
    }
  }());
  return disposables.add(instantiationService.createInstance(SessionsManagementService));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcc2VydmljZXNcXHNlc3Npb25zXFx0ZXN0XFxicm93c2VyXFxzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEZWZlcnJlZFByb21pc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBDYW5jZWxsYXRpb25Ub2tlbiwgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jYW5jZWxsYXRpb24uanMnO1xuaW1wb3J0IHsgRW1pdHRlciwgRXZlbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9ldmVudC5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuLCBjb25zdE9ic2VydmFibGUsIG9ic2VydmFibGVWYWx1ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL29ic2VydmFibGUuanMnO1xuaW1wb3J0IHsgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9yZXNvdXJjZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJQ29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL2NvbW1vbi9jb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vdGVzdC9jb21tb24vdGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2luc3RhbnRpYXRpb24vdGVzdC9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2VNb2NrLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElMb2dTZXJ2aWNlLCBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElQcm9ncmVzcywgSVByb2dyZXNzU2VydmljZSwgSVByb2dyZXNzU3RlcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3Byb2dyZXNzL2NvbW1vbi9wcm9ncmVzcy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBJU3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vd29ya3NwYWNlL2NvbW1vbi93b3Jrc3BhY2VUcnVzdC5qcyc7XG5pbXBvcnQgeyBDaGF0Vmlld1BhbmVUYXJnZXQsIElDaGF0V2lkZ2V0LCBJQ2hhdFdpZGdldFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBJQ2hhdE1vZGVsUmVmZXJlbmNlLCBJQ2hhdFJlcXVlc3RTdWJtaXR0ZWRFdmVudCwgSUNoYXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlcnZpY2UvY2hhdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUNoYXRNb2RlbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL21vZGVsL2NoYXRNb2RlbC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEVkaXRvck9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvd2lkZ2V0SG9zdHMvZWRpdG9yL2NoYXRFZGl0b3IuanMnO1xuaW1wb3J0IHsgSUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL3dpZGdldC9jaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgUHJlZmVycmVkR3JvdXAgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9leHRlbnNpb25zL2NvbW1vbi9leHRlbnNpb25zLmpzJztcbmltcG9ydCB7IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LCBDaGF0SW50ZXJhY3Rpdml0eSwgQ2hhdE9yaWdpbktpbmQsIElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25UeXBlLCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNpZGVDaGF0U2VsZWN0aW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSUxhbmd1YWdlTW9kZWxDaGF0TWV0YWRhdGFBbmRJZGVudGlmaWVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vbGFuZ3VhZ2VNb2RlbHMuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25Nb2RlbHNTbmFwc2hvdCwgSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMsIElTZXNzaW9uc1Byb3ZpZGVyLCBJU2Vzc2lvbnNQcm92aWRlckNyZWF0ZVNlc3Npb25PcHRpb25zLCBJU2Vzc2lvbldvcmt0cmVlQ29uZmlndXJhdGlvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgaW5oZXJpdGFibGVTZXNzaW9uVGFyZ2V0LCBJU2VuZFJlcXVlc3RTZW50RXZlbnQsIFdvcmtzcGFjZU5vdFRydXN0ZWRFcnJvciB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUGFydFNlcnZpY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zUGFydFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ3VzdG9tVmlld1NlcnZpY2UsIElDdXN0b21WaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2N1c3RvbVZpZXcvYnJvd3Nlci9jdXN0b21WaWV3U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IFNlc3Npb25zSGFzQ2xvc2VkSXRlbUNvbnRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgQ09QSUxPVF9DTElfRUhfU0NIRU1FLCBDT1BJTE9UX0NMSV9MT0NBTF9BSF9TQ0hFTUUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2Jyb3dzZXIvY29waWxvdENsaUV2ZW50c1VyaS5qcyc7XG5cbmNvbnN0IHN0dWJDaGF0ID0ge1xuXHRyZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSxcblx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLFxuXHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdDaGF0JyksXG5cdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCkpLFxuXHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0Y2hlY2twb2ludHM6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRtb2RlbElkOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdGlzUmVhZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0bGFzdFR1cm5FbmQ6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxufSBzYXRpc2ZpZXMgSUNoYXQ7XG5cbmZ1bmN0aW9uIHN0dWJTZXNzaW9uKG92ZXJyaWRlczogUGFydGlhbDxJU2Vzc2lvbj4gJiBQaWNrPElTZXNzaW9uLCAnc2Vzc2lvbklkJyB8ICdwcm92aWRlcklkJz4pOiBJU2Vzc2lvbiB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgdGVzdDovLy8ke292ZXJyaWRlcy5zZXNzaW9uSWR9YCksXG5cdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHRpY29uOiBDb2RpY29uLnZtLFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUoJ1Rlc3QnKSxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZSgwKSxcblx0XHRjaGFuZ2VzZXRzOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdGNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bW9kZWxJZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bW9kZTogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRpc0FyY2hpdmVkOiBjb25zdE9ic2VydmFibGUoZmFsc2UpLFxuXHRcdGlzUmVhZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdGRlc2NyaXB0aW9uOiBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCksXG5cdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShzdHViQ2hhdCksXG5cdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IGZhbHNlIH0pLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuY2xhc3MgVGVzdENoYXRXaWRnZXRTZXJ2aWNlIGV4dGVuZHMgbW9jazxJQ2hhdFdpZGdldFNlcnZpY2U+KCkge1xuXHRyZWFkb25seSBvcGVuZWQ6IFVSSVtdID0gW107XG5cdHByaXZhdGUgX3dpZGdldFNlc3Npb25SZXNvdXJjZXMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblxuXHRvdmVycmlkZSBhc3luYyBvcGVuU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3RhcmdldD86IHR5cGVvZiBDaGF0Vmlld1BhbmVUYXJnZXQgfCBQcmVmZXJyZWRHcm91cCwgX29wdGlvbnM/OiBJQ2hhdEVkaXRvck9wdGlvbnMpOiBQcm9taXNlPElDaGF0V2lkZ2V0IHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5vcGVuZWQucHVzaChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKiogU2ltdWxhdGUgYSBzZXNzaW9uIGJlaW5nIGRpc3BsYXllZCBpbiBhIGNoYXQgd2lkZ2V0LiAqL1xuXHRzZXRXaWRnZXRTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldFNlc3Npb25SZXNvdXJjZXMuYWRkKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9XG5cblx0Y2xlYXJXaWRnZXRTZXNzaW9uUmVzb3VyY2VzKCk6IHZvaWQge1xuXHRcdHRoaXMuX3dpZGdldFNlc3Npb25SZXNvdXJjZXMuY2xlYXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKHNlc3Npb25SZXNvdXJjZTogVVJJKTogSUNoYXRXaWRnZXQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl93aWRnZXRTZXNzaW9uUmVzb3VyY2VzLmhhcyhzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSkpIHtcblx0XHRcdHJldHVybiB7fSBhcyBJQ2hhdFdpZGdldDsgLy8gdHJ1dGh5IHN0dWJcblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhdFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkU3VibWl0UmVxdWVzdCA9IG5ldyBFbWl0dGVyPElDaGF0UmVxdWVzdFN1Ym1pdHRlZEV2ZW50PigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSB0aGlzLl9vbkRpZFN1Ym1pdFJlcXVlc3QuZXZlbnQ7XG5cdHJlYWRvbmx5IGNhbmNlbGxlZFJlc291cmNlczogVVJJW10gPSBbXTtcblx0cmVhZG9ubHkgbG9hZGVkUmVzb3VyY2VzOiBVUklbXSA9IFtdO1xuXHRkaXNwb3NlZE1vZGVsUmVmcyA9IDA7XG5cdGNhbmNlbEVycm9yOiBFcnJvciB8IHVuZGVmaW5lZDtcblx0bW9kZWxSZWZBdmFpbGFibGUgPSB0cnVlO1xuXG5cdG92ZXJyaWRlIGFzeW5jIGFjcXVpcmVPckxvYWRTZXNzaW9uKHNlc3Npb25SZXNvdXJjZTogVVJJKTogUHJvbWlzZTxJQ2hhdE1vZGVsUmVmZXJlbmNlIHwgdW5kZWZpbmVkPiB7XG5cdFx0dGhpcy5sb2FkZWRSZXNvdXJjZXMucHVzaChzZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghdGhpcy5tb2RlbFJlZkF2YWlsYWJsZSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIHsgb2JqZWN0OiB7fSBhcyBJQ2hhdE1vZGVsLCBkaXNwb3NlOiAoKSA9PiB7IHRoaXMuZGlzcG9zZWRNb2RlbFJlZnMrKzsgfSB9IGFzIElDaGF0TW9kZWxSZWZlcmVuY2U7XG5cdH1cblxuXHRzdWJtaXRSZXF1ZXN0KGV2ZW50OiBJQ2hhdFJlcXVlc3RTdWJtaXR0ZWRFdmVudCk6IHZvaWQge1xuXHRcdHRoaXMuX29uRGlkU3VibWl0UmVxdWVzdC5maXJlKGV2ZW50KTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRTdWJtaXRSZXF1ZXN0LmRpc3Bvc2UoKTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNhbmNlbEN1cnJlbnRSZXF1ZXN0Rm9yU2Vzc2lvbihzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHRoaXMuY2FuY2VsbGVkUmVzb3VyY2VzLnB1c2goc2Vzc2lvblJlc291cmNlKTtcblx0XHRpZiAodGhpcy5jYW5jZWxFcnJvcikge1xuXHRcdFx0dGhyb3cgdGhpcy5jYW5jZWxFcnJvcjtcblx0XHR9XG5cdH1cbn1cblxuY2xhc3MgVGVzdFByb2dyZXNzU2VydmljZSBleHRlbmRzIG1vY2s8SVByb2dyZXNzU2VydmljZT4oKSB7XG5cdG92ZXJyaWRlIGFzeW5jIHdpdGhQcm9ncmVzczxSPihfb3B0aW9uczogUGFyYW1ldGVyczxJUHJvZ3Jlc3NTZXJ2aWNlWyd3aXRoUHJvZ3Jlc3MnXT5bMF0sIHRhc2s6IChwcm9ncmVzczogSVByb2dyZXNzPElQcm9ncmVzc1N0ZXA+KSA9PiBQcm9taXNlPFI+KTogUHJvbWlzZTxSPiB7XG5cdFx0cmV0dXJuIHRhc2soeyByZXBvcnQoKSB7IH0gfSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0dHJ1c3RlZCA9IHRydWU7XG5cdHJlYWRvbmx5IHJlcXVlc3RlZFVyaXM6IFVSSVtdID0gW107XG5cblx0b3ZlcnJpZGUgYXN5bmMgZ2V0VXJpVHJ1c3RJbmZvKHVyaTogVVJJKSB7XG5cdFx0dGhpcy5yZXF1ZXN0ZWRVcmlzLnB1c2godXJpKTtcblx0XHRyZXR1cm4geyB1cmksIHRydXN0ZWQ6IHRoaXMudHJ1c3RlZCB9O1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVByb3ZpZGVycyA9IEV2ZW50Lk5vbmU7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfcHJvdmlkZXJzOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdKSB7XG5cdFx0c3VwZXIoKTtcblx0fVxuXG5cdG92ZXJyaWRlIHJlZ2lzdGVyUHJvdmlkZXIoKTogbmV2ZXIge1xuXHRcdHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9wcm92aWRlcnNdLnNvcnQoKGEsIGIpID0+IGEub3JkZXIgLSBiLm9yZGVyKTtcblx0fVxuXG5cdG92ZXJyaWRlIGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5maW5kKHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkID09PSBwcm92aWRlcklkKSBhcyBUIHwgdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNQcm92aWRlcj4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGlkOiBzdHJpbmcgPSAndGVzdCc7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsID0gJ1Rlc3QnO1xuXHRvdmVycmlkZSByZWFkb25seSBpY29uID0gQ29kaWNvbi52bTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXI6IG51bWJlciA9IDA7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICd0ZXN0JywgbGFiZWw6ICdUZXN0JywgaWNvbjogQ29kaWNvbi52bSwgc3VwcG9ydHNXb3JrdHJlZUNvbmZpZ3VyYXRpb246IHRydWUgfV07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VTZXNzaW9ucyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGJyb3dzZUFjdGlvbnMgPSBbXTtcblxuXHRjb25zdHJ1Y3Rvcihwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9uOiBJU2Vzc2lvbikge1xuXHRcdHN1cGVyKCk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFt0aGlzLl9zZXNzaW9uXTsgfVxuXHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKF9mb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkIHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKF9mb2xkZXJVcmk/OiBVUkksIF9zZXNzaW9uVHlwZUlkPzogc3RyaW5nKTogSVNlc3Npb24geyByZXR1cm4gdGhpcy5fc2Vzc2lvbjsgfVxuXHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXMoX2ZvbGRlclVyaTogVVJJKTogSVNlc3Npb25UeXBlW10geyByZXR1cm4gWy4uLnRoaXMuc2Vzc2lvblR5cGVzXTsgfVxuXHRvdmVycmlkZSBhc3luYyByZW5hbWVDaGF0KCk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGdldE1vZGVsc1NuYXBzaG90KCk6IElTZXNzaW9uTW9kZWxzU25hcHNob3QgeyByZXR1cm4geyBtb2RlbHM6IFtdLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiB7IGtpbmQ6ICdub3RSZXF1ZXN0ZWQnIH0sIG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQgfTsgfVxuXHRvdmVycmlkZSBnZXRNb2RlbFBpY2tlck9wdGlvbnMoKTogSVNlc3Npb25Nb2RlbFBpY2tlck9wdGlvbnMgeyByZXR1cm4geyB1c2VHcm91cGVkTW9kZWxQaWNrZXI6IHRydWUsIHNob3dGZWF0dXJlZDogdHJ1ZSwgc2hvd1VuYXZhaWxhYmxlRmVhdHVyZWQ6IGZhbHNlLCBzaG93TWFuYWdlTW9kZWxzQWN0aW9uOiBmYWxzZSB9OyB9XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgc2V0TW9kZWwoX3Nlc3Npb25JZDogc3RyaW5nLCBfbW9kZWxJZDogc3RyaW5nKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgYXJjaGl2ZVNlc3Npb24oKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgdW5hcmNoaXZlU2Vzc2lvbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRvdmVycmlkZSBhc3luYyBkZWxldGVTZXNzaW9uKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZVNlc3Npb25zKF9zZXNzaW9uSWRzOiByZWFkb25seSBzdHJpbmdbXSk6IFByb21pc2U8dm9pZD4geyB9XG5cdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZUNoYXQoKTogUHJvbWlzZTxib29sZWFuPiB7IHJldHVybiB0cnVlOyB9XG5cdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oX3Nlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4geyByZXR1cm4gdGhpcy5fc2Vzc2lvbjsgfVxuXHRvdmVycmlkZSBhc3luYyBjcmVhdGVOZXdDaGF0KCk6IFByb21pc2U8SUNoYXQ+IHsgcmV0dXJuIHRoaXMuX3Nlc3Npb24ubWFpbkNoYXQuZ2V0KCk7IH1cblx0b3ZlcnJpZGUgYXN5bmMgZm9ya0NoYXQoX3Nlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPElDaGF0PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2lkZUNoYXQoX3Nlc3Npb25JZDogc3RyaW5nLCBfc291cmNlQ2hhdDogVVJJLCBfdHVybklkOiBzdHJpbmcsIF9zZWxlY3Rpb24/OiBJU2lkZUNoYXRTZWxlY3Rpb24pOiBQcm9taXNlPElDaGF0PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH1cbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShcblx0c2Vzc2lvbjogSVNlc3Npb24sXG5cdGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LFxuXHRwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgfCByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdID0gbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyKHNlc3Npb24pLFxuXHR3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKCksXG5cdHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2U/OiBJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSxcbik6IHsgc2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U7IHZpZXc6IFNlc3Npb25zU2VydmljZTsgY2hhdFdpZGdldFNlcnZpY2U6IFRlc3RDaGF0V2lkZ2V0U2VydmljZTsgY2hhdFNlcnZpY2U6IFRlc3RDaGF0U2VydmljZTsgY29udGV4dEtleVNlcnZpY2U6IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCk7XG5cdGNvbnN0IGNoYXRTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0Q2hhdFNlcnZpY2UoKSk7XG5cdGNvbnN0IHByb3ZpZGVycyA9IEFycmF5LmlzQXJyYXkocHJvdmlkZXIpID8gcHJvdmlkZXIgOiBbcHJvdmlkZXJdO1xuXHRjb25zdCBjb250ZXh0S2V5U2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpO1xuXG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UocHJvdmlkZXJzKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgY2hhdFNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRXaWRnZXRIaXN0b3J5U2VydmljZT4oKSB7XG5cdFx0b3ZlcnJpZGUgbW92ZUhpc3RvcnkoKTogdm9pZCB7IH1cblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UpO1xuXHRpZiAod29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZSkge1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UsIHdvcmtzcGFjZVRydXN0UmVxdWVzdFNlcnZpY2UpO1xuXHR9XG5cblx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdHJldHVybiB7IHNlcnZpY2UsIHZpZXcsIGNoYXRXaWRnZXRTZXJ2aWNlLCBjaGF0U2VydmljZSwgY29udGV4dEtleVNlcnZpY2UgfTtcbn1cblxuLyoqXG4gKiBQYXNzaXZlIHNlc3Npb25zIHBhcnQgc3R1Yi4gVGhlIHZpZXcgc2VydmljZSBkcml2ZXMgaXQgYnV0IHRoZSB0ZXN0cyBvbmx5XG4gKiBleGVyY2lzZSB0aGUgdmlldy9tb2RlbCBiZWhhdmlvdXIsIHNvIHRoZSBjYWxscyBhcmUgbm8tb3BzLlxuICovXG5jbGFzcyBUZXN0U2Vzc2lvbnNQYXJ0U2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zUGFydFNlcnZpY2U+KCkge1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZEZvY3VzU2Vzc2lvbiA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVG9nZ2xlTWF4aW1pemVTZXNzaW9uID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgdXBkYXRlVmlzaWJsZVNlc3Npb25zKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGZvY3VzU2Vzc2lvbigpOiB2b2lkIHsgfVxufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHtAbGluayBTZXNzaW9uc1NlcnZpY2V9IG92ZXIgYW4gYWxyZWFkeS1jcmVhdGVkIG1hbmFnZW1lbnRcbiAqIHNlcnZpY2UsIHN0dWJiaW5nIHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UgaW5zdGFuY2UgYW5kIGEgcGFzc2l2ZSBwYXJ0IHNvIHRoZVxuICogdmlldydzIG9wZW5pbmcvcmVzdG9yZS92aXNpYmxlLXNlc3Npb24gYmVoYXZpb3VyIGNhbiBiZSB0ZXN0ZWQuXG4gKi9cbmZ1bmN0aW9uIGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2U6IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSwgc2VydmljZTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+KTogU2Vzc2lvbnNTZXJ2aWNlIHtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUGFydFNlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQYXJ0U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ3VzdG9tVmlld1NlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQ3VzdG9tVmlld1NlcnZpY2UobmV3IE51bGxMb2dTZXJ2aWNlKCksIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoKSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNTZXJ2aWNlKSk7XG59XG5cbnN1aXRlKCdTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnY2FuY2VsQ3VycmVudFJlcXVlc3QgbG9hZHMgdGhlIGNoYXQgbW9kZWwgdGhlbiBjYW5jZWxzIHRoZSBtYWluIGNoYXQgcmVxdWVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzZXNzaW9uJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jYW5jZWxDdXJyZW50UmVxdWVzdChzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGVkOiBjaGF0U2VydmljZS5sb2FkZWRSZXNvdXJjZXMsXG5cdFx0XHRjYW5jZWxsZWQ6IGNoYXRTZXJ2aWNlLmNhbmNlbGxlZFJlc291cmNlcyxcblx0XHRcdGRpc3Bvc2VkTW9kZWxSZWZzOiBjaGF0U2VydmljZS5kaXNwb3NlZE1vZGVsUmVmcyxcblx0XHR9LCB7XG5cdFx0XHRsb2FkZWQ6IFtzdHViQ2hhdC5yZXNvdXJjZV0sXG5cdFx0XHRjYW5jZWxsZWQ6IFtzdHViQ2hhdC5yZXNvdXJjZV0sXG5cdFx0XHRkaXNwb3NlZE1vZGVsUmVmczogMSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2FuY2VsQ3VycmVudFJlcXVlc3QgZGlzcG9zZXMgdGhlIGxvYWRlZCBtb2RlbCB3aGVuIGNhbmNlbGxhdGlvbiBmYWlscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzZXNzaW9uJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXHRcdGNoYXRTZXJ2aWNlLmNhbmNlbEVycm9yID0gbmV3IEVycm9yKCdjYW5jZWwgZmFpbGVkJyk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0KHNlc3Npb24pLCAvY2FuY2VsIGZhaWxlZC8pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRsb2FkZWQ6IGNoYXRTZXJ2aWNlLmxvYWRlZFJlc291cmNlcyxcblx0XHRcdGNhbmNlbGxlZDogY2hhdFNlcnZpY2UuY2FuY2VsbGVkUmVzb3VyY2VzLFxuXHRcdFx0ZGlzcG9zZWRNb2RlbFJlZnM6IGNoYXRTZXJ2aWNlLmRpc3Bvc2VkTW9kZWxSZWZzLFxuXHRcdH0sIHtcblx0XHRcdGxvYWRlZDogW3N0dWJDaGF0LnJlc291cmNlXSxcblx0XHRcdGNhbmNlbGxlZDogW3N0dWJDaGF0LnJlc291cmNlXSxcblx0XHRcdGRpc3Bvc2VkTW9kZWxSZWZzOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxDdXJyZW50UmVxdWVzdCByZWplY3RzIHdoZW4gdGhlIGNoYXQgbW9kZWwgY2Fubm90IGJlIGxvYWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzZXNzaW9uJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXHRcdGNoYXRTZXJ2aWNlLm1vZGVsUmVmQXZhaWxhYmxlID0gZmFsc2U7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNhbmNlbEN1cnJlbnRSZXF1ZXN0KHNlc3Npb24pLCAvRmFpbGVkIHRvIGxvYWQgY2hhdCBzZXNzaW9uIGZvciBjYW5jZWxsYXRpb24vKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bG9hZGVkOiBjaGF0U2VydmljZS5sb2FkZWRSZXNvdXJjZXMsXG5cdFx0XHRjYW5jZWxsZWQ6IGNoYXRTZXJ2aWNlLmNhbmNlbGxlZFJlc291cmNlcyxcblx0XHRcdGRpc3Bvc2VkTW9kZWxSZWZzOiBjaGF0U2VydmljZS5kaXNwb3NlZE1vZGVsUmVmcyxcblx0XHR9LCB7XG5cdFx0XHRsb2FkZWQ6IFtzdHViQ2hhdC5yZXNvdXJjZV0sXG5cdFx0XHRjYW5jZWxsZWQ6IFtdLFxuXHRcdFx0ZGlzcG9zZWRNb2RlbFJlZnM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ29wZW5TZXNzaW9uIHdhaXRzIGZvciBhIGxvYWRpbmcgc2Vzc2lvbiBiZWZvcmUgb3BlbmluZyBjaGF0IGNvbnRlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9hZGluZyA9IG9ic2VydmFibGVWYWx1ZSgnbG9hZGluZycsIHRydWUpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2xvYWRpbmcnLCBwcm92aWRlcklkOiAndGVzdCcsIGxvYWRpbmcgfSk7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzKTtcblxuXHRcdGxldCByZXNvbHZlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IG9wZW5Qcm9taXNlID0gdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKS50aGVuKCgpID0+IHsgcmVzb2x2ZWQgPSB0cnVlOyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyByZXNvbHZlZCB9LCB7IHJlc29sdmVkOiBmYWxzZSB9KTtcblxuXHRcdGxvYWRpbmcuc2V0KGZhbHNlLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IG9wZW5Qcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc29sdmVkIH0sIHsgcmVzb2x2ZWQ6IHRydWUgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcmtzIHRoZSBhY3RpdmUgc2Vzc2lvbiBhcyByZWFkIHZpYSBpdHMgcHJvdmlkZXIgZXZlbiB3aGVuIGl0cyBwcm92aWRlciBzdGF0ZSB3YXMgdW5yZWFkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGlzUmVhZCA9IG9ic2VydmFibGVWYWx1ZSgnaXNSZWFkJywgZmFsc2UpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3VucmVhZCcsIHByb3ZpZGVySWQ6ICd0ZXN0JywgaXNSZWFkIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2V0U2Vzc2lvblJlYWRTdGF0ZShfc2Vzc2lvbklkOiBzdHJpbmcsIHJlYWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdFx0aXNSZWFkLnNldChyZWFkLCB1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBXaGlsZSBub3QgYWN0aXZlLCB0aGUgcHJvdmlkZXItb3duZWQgdW5yZWFkIHN0YXRlIGlzIHVudG91Y2hlZC5cblx0XHRjb25zdCByZWFkQmVmb3JlQWN0aXZlID0gc2Vzc2lvbi5pc1JlYWQuZ2V0KCk7XG5cblx0XHQvLyBPcGVuaW5nIHRoZSBzZXNzaW9uIG1ha2VzIGl0IGFjdGl2ZTsgaXQgbXVzdCB0aGVuIGJlIG1hcmtlZCByZWFkLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0Y29uc3QgcmVhZFdoaWxlQWN0aXZlID0gc2Vzc2lvbi5pc1JlYWQuZ2V0KCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyByZWFkQmVmb3JlQWN0aXZlLCByZWFkV2hpbGVBY3RpdmUsIGFjdGl2ZUlkOiB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCB9LFxuXHRcdFx0eyByZWFkQmVmb3JlQWN0aXZlOiBmYWxzZSwgcmVhZFdoaWxlQWN0aXZlOiB0cnVlLCBhY3RpdmVJZDogJ3VucmVhZCcgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdsZWF2ZXMgYSBub24tYWN0aXZlIHNlc3Npb24gaW4gaXRzIHByb3ZpZGVyIHJlYWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhY3RpdmUnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb3RoZXIgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBpc1JlYWQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSkgfSk7XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGFjdGl2ZSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gTm90aGluZyBpcyBvcGVuZWQsIHNvIGBvdGhlcmAgc3RheXMgbm9uLWFjdGl2ZSBhbmQga2VlcHMgaXRzIHVucmVhZCBzdGF0ZS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyBhY3RpdmVJZDogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsIG90aGVyUmVhZDogb3RoZXIuaXNSZWFkLmdldCgpIH0sXG5cdFx0XHR7IGFjdGl2ZUlkOiB1bmRlZmluZWQsIG90aGVyUmVhZDogZmFsc2UgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBjaGFuZ2UgYWN0aXZlIHNlc3Npb24gd2hlbiBhZGRlZCBzZXNzaW9uIGlzIG5vdCBkaXNwbGF5ZWQgaW4gYW55IHdpZGdldCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBvcmlnaW5hbFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29yaWdpbmFsJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25DaGFuZ2VFdmVudD4oKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihvcmlnaW5hbFNlc3Npb24pOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgY2hhdFdpZGdldFNlcnZpY2UgPSBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCk7XG5cblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgY2hhdFdpZGdldFNlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cblx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRjb25zdCB2aWV3ID0gY3JlYXRlVmlldyhpbnN0YW50aWF0aW9uU2VydmljZSwgc2VydmljZSwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgb3JpZ2luYWwgc2Vzc2lvbiBzbyBpdCBiZWNvbWVzIHRoZSBhY3RpdmUgc2Vzc2lvblxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24ob3JpZ2luYWxTZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdvcmlnaW5hbCcpO1xuXG5cdFx0Ly8gQSBuZXcgc2Vzc2lvbiBhcHBlYXJzIGJ1dCBpcyBOT1QgZGlzcGxheWVkIGluIGFueSB3aWRnZXRcblx0XHRjb25zdCBvdGhlclNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdC8vIE5vdGU6IG5vdCBjYWxsaW5nIGNoYXRXaWRnZXRTZXJ2aWNlLnNldFdpZGdldFNlc3Npb25SZXNvdXJjZSgpXG5cblx0XHRvbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoeyBhZGRlZDogW290aGVyU2Vzc2lvbl0sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdC8vIFRoZSBhY3RpdmUgc2Vzc2lvbiBzaG91bGQgcmVtYWluIHVuY2hhbmdlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ29yaWdpbmFsJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2UgcmV0dXJucyB0aGUgc2Vzc2lvbiB0aGF0IG93bnMgdGhlIGNoYXQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdEE6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0LWEnKSB9O1xuXHRcdGNvbnN0IGNoYXRCOiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vQ0hBVC1CJykgfTtcblx0XHRjb25zdCBzZXNzaW9uQSA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ2EnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdEFdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdEEpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnYicsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0Ql0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0QiksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtzZXNzaW9uQSwgc2Vzc2lvbkJdOyB9XG5cdFx0fTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbkEsIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRjb25zdCBvd25lZENoYXQgPSBzZXJ2aWNlLmdldFNlc3Npb25Gb3JDaGF0UmVzb3VyY2UoVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQtYicpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbklkOiBvd25lZENoYXQ/LnNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0Y2hhdDogb3duZWRDaGF0Py5jaGF0LFxuXHRcdFx0bWlzc2luZzogc2VydmljZS5nZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKFVSSS5wYXJzZSgndGVzdDovLy9taXNzaW5nJykpLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb25JZDogJ2InLFxuXHRcdFx0Y2hhdDogY2hhdEIsXG5cdFx0XHRtaXNzaW5nOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVWaXNpYmxlU2Vzc2lvbnMgd2FpdHMgZm9yIHNlc3Npb24gdG8gYXBwZWFyIHZpYSBvbkRpZENoYW5nZVNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3RhcmdldCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdFx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcih0YXJnZXRTZXNzaW9uKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBzZXNzaW9uczsgfVxuXHRcdH07XG5cblx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGNoYXRXaWRnZXRTZXJ2aWNlID0gbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpO1xuXG5cdFx0Ly8gU2VlZCBzdG9yYWdlIHNvIHRoZSBtYW5hZ2VtZW50IHNlcnZpY2UgdHJlYXRzIGB0YXJnZXRTZXNzaW9uYCBhcyB0aGVcblx0XHQvLyBsYXN0IGFjdGl2ZSBzZXNzaW9uIGFuZCB0cmllcyB0byByZXN0b3JlIGl0IG9uIHN0YXJ0dXAuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzdG9yYWdlLnN0b3JlKFxuXHRcdFx0J2FnZW50U2Vzc2lvbnMuYWN0aXZlU2Vzc2lvblN0YXRlcycsXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbeyBzZXNzaW9uUmVzb3VyY2U6IHRhcmdldFNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSwgdmlzaWJsZU9yZGVyOiAwLCBpc0FjdGl2ZTogdHJ1ZSB9XSksXG5cdFx0XHQxIC8qIFN0b3JhZ2VTY29wZS5XT1JLU1BBQ0UgKi8sXG5cdFx0XHQxIC8qIFN0b3JhZ2VUYXJnZXQuTUFDSElORSAqLyxcblx0XHQpO1xuXG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBjaGF0V2lkZ2V0U2VydmljZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTdWJtaXRSZXF1ZXN0ID0gRXZlbnQuTm9uZTtcblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cblx0XHQvLyBBdCB0aGlzIHBvaW50IHRoZSBwcm92aWRlciBkb2VzIG5vdCB5ZXQga25vdyBhYm91dCB0aGUgc2Vzc2lvblxuXHRcdC8vIChtaW1pY2tpbmcgYW4gYWdlbnQgaG9zdCBwcm92aWRlciB3aG9zZSBjYWNoZSBoYXMgbm90IGxvYWRlZCB5ZXQpLlxuXHRcdGNvbnN0IHJlc3RvcmVQcm9taXNlID0gdmlldy5yZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5maWx0ZXIoKHMpOiBzIGlzIE5vbk51bGxhYmxlPHR5cGVvZiBzPiA9PiAhIXMpLm1hcChzID0+IHMuc2Vzc2lvbklkKSxcblx0XHRcdHJlc3RvcmVDb21wbGV0ZTogdmlldy5pbml0aWFsUmVzdG9yZUNvbXBsZXRlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFtdLFxuXHRcdFx0cmVzdG9yZUNvbXBsZXRlOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdC8vIE5vdyB0aGUgcHJvdmlkZXIgbGVhcm5zIGFib3V0IHRoZSBzZXNzaW9uIGFuZCBmaXJlcyBpdHMgY2hhbmdlIGV2ZW50LlxuXHRcdC8vIGBvbkRpZENoYW5nZVByb3ZpZGVyc2AgZG9lcyBOT1QgZmlyZSBoZXJlIFx1MjAxNCBvbmx5IHRoZSBwZXItcHJvdmlkZXJcblx0XHQvLyBzZXNzaW9uIGNoYW5nZSBldmVudCBcdTIwMTQgc28gdGhlIGZpeCBtdXN0IHN1YnNjcmliZSB0byBpdCBhcyB3ZWxsLlxuXHRcdHNlc3Npb25zID0gW3RhcmdldFNlc3Npb25dO1xuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7IGFkZGVkOiBbdGFyZ2V0U2Vzc2lvbl0sIHJlbW92ZWQ6IFtdLCBjaGFuZ2VkOiBbXSB9KTtcblxuXHRcdGF3YWl0IHJlc3RvcmVQcm9taXNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmlzaWJsZTogdmlldy52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkubWFwKHMgPT4gcz8uc2Vzc2lvbklkKSxcblx0XHRcdHJlc3RvcmVDb21wbGV0ZTogdmlldy5pbml0aWFsUmVzdG9yZUNvbXBsZXRlLmdldCgpLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFt0YXJnZXRTZXNzaW9uLnNlc3Npb25JZF0sXG5cdFx0XHRyZXN0b3JlQ29tcGxldGU6IHRydWUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JPVU5EVFJJUDogb3BlbmVkIHNlc3Npb24gaXMgcmV0YWluZWQgYWNyb3NzIHNhdmUgKyByZXN0b3JlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNyZWF0ZWRDaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdC14JyksIHN0YXR1czogY29uc3RPYnNlcnZhYmxlKDEpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3gnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoMSksXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjcmVhdGVkQ2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjcmVhdGVkQ2hhdCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzZXNzaW9uKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgbWFrZVNlcnZpY2UgPSAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHRcdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHRyZXR1cm4geyBzZXJ2aWNlLCB2aWV3IH07XG5cdFx0fTtcblxuXHRcdC8vIEZpcnN0IHdpbmRvdzogb3BlbiB0aGUgc2Vzc2lvbiwgdGhlbiBzaW11bGF0ZSBzaHV0ZG93biAoZmx1c2ggc3RvcmFnZSkuXG5cdFx0Y29uc3QgZmlyc3QgPSBtYWtlU2VydmljZSgpO1xuXHRcdGF3YWl0IGZpcnN0LnZpZXcub3BlblNlc3Npb24oc2Vzc2lvbi5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpcnN0LnZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAneCcpO1xuXHRcdGF3YWl0IHN0b3JhZ2UuZmx1c2goKTtcblxuXHRcdC8vIFNlY29uZCB3aW5kb3c6IHJlc3RvcmUgZnJvbSBwZXJzaXN0ZWQgc3RhdGUuXG5cdFx0Y29uc3Qgc2Vjb25kID0gbWFrZVNlcnZpY2UoKTtcblx0XHRhd2FpdCBzZWNvbmQudmlldy5yZXN0b3JlVmlzaWJsZVNlc3Npb25zKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZpc2libGU6IHNlY29uZC52aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRhY3RpdmU6IHNlY29uZC52aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCA/PyBudWxsLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsneCddLFxuXHRcdFx0YWN0aXZlOiAneCcsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1JBQ0U6IGEgbmV3IHNlc3Npb24gY3JlYXRlZCBkdXJpbmcgcmVzdG9yZSBkb2VzIG5vdCBkcm9wIHRoZSByZXN0b3JlZCBzZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHRhcmdldFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3RhcmdldCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBuZXdTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdmcmVzaCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZENoYW5nZVNlc3Npb25zID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPElTZXNzaW9uQ2hhbmdlRXZlbnQ+KCkpO1xuXG5cdFx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcih0YXJnZXRTZXNzaW9uKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBzZXNzaW9uczsgfVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbigpOiBJU2Vzc2lvbiB7IHJldHVybiBuZXdTZXNzaW9uOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyczogW10sIGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c3RvcmFnZS5zdG9yZShcblx0XHRcdCdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW3sgc2Vzc2lvblJlc291cmNlOiB0YXJnZXRTZXNzaW9uLnJlc291cmNlLnRvU3RyaW5nKCksIHZpc2libGVPcmRlcjogMCwgaXNBY3RpdmU6IHRydWUgfV0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoW3Byb3ZpZGVyXSkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVByb2dyZXNzU2VydmljZSwgbmV3IFRlc3RQcm9ncmVzc1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0fSk7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFJlc3RvcmUgc3RhcnRzIGJ1dCB0aGUgcHJvdmlkZXIgaGFzIG5vdCB5ZXQgc3VyZmFjZWQgdGhlIHNlc3Npb24uXG5cdFx0Y29uc3QgcmVzdG9yZVByb21pc2UgPSB2aWV3LnJlc3RvcmVWaXNpYmxlU2Vzc2lvbnMoKTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblxuXHRcdC8vIFRoZSBuZXctY2hhdCB3aWRnZXQgZWFnZXJseSBjcmVhdGVzIGEgc2Vzc2lvbiBmb3IgdGhlIHJlc3RvcmVkXG5cdFx0Ly8gd29ya3NwYWNlIGZvbGRlciB3aGlsZSByZXN0b3JlIGlzIHN0aWxsIHdhaXRpbmcgZm9yIGl0cyBzZXNzaW9uLlxuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ2ZpbGU6Ly8vZm9sZGVyJykpO1xuXG5cdFx0Ly8gVGhlIHByb3ZpZGVyIG5vdyBzdXJmYWNlcyB0aGUgcGVyc2lzdGVkIHNlc3Npb24uXG5cdFx0c2Vzc2lvbnMgPSBbdGFyZ2V0U2Vzc2lvbl07XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9ucy5maXJlKHsgYWRkZWQ6IFt0YXJnZXRTZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGF3YWl0IHJlc3RvcmVQcm9taXNlO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNUYXJnZXQ6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLnNvbWUocyA9PiBzPy5zZXNzaW9uSWQgPT09ICd0YXJnZXQnKSxcblx0XHRcdGFjdGl2ZTogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRoYXNUYXJnZXQ6IHRydWUsXG5cdFx0XHRhY3RpdmU6ICd0YXJnZXQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ29wZW5OZXdTZXNzaW9uIGluaGVyaXRzIHRoZSBhY3RpdmUgc2Vzc2lvbiB3b3Jrc3BhY2Ugd2hlbiByZXF1ZXN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWFrZVdvcmtzcGFjZSA9ICh1cmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlID0+ICh7XG5cdFx0XHR1cmksXG5cdFx0XHRsYWJlbDogJ3dzJyxcblx0XHRcdGljb246IENvZGljb24udm0sXG5cdFx0XHRmb2xkZXJzOiBbeyByb290OiB1cmksIHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSwgbmFtZTogJ3dzJywgZGVzY3JpcHRpb246IHVuZGVmaW5lZCB9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZUIgPSBVUkkucGFyc2UoJ2ZpbGU6Ly8vd29ya3NwYWNlQicpO1xuXHRcdGNvbnN0IG9wZW5TZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvcGVuJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHdvcmtzcGFjZUIpKSB9KTtcblxuXHRcdGxldCBjcmVhdGVkRm9sZGVyVXJpOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIob3BlblNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtvcGVuU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpPzogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4gbWFrZVdvcmtzcGFjZShmb2xkZXJVcmkhKTsgfVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmk/OiBVUkkpOiBJU2Vzc2lvbiB7XG5cdFx0XHRcdGNyZWF0ZWRGb2xkZXJVcmkgPSBmb2xkZXJVcmk7XG5cdFx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2luaGVyaXRlZCcsIHByb3ZpZGVySWQ6ICd0ZXN0Jywgd29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUobWFrZVdvcmtzcGFjZShmb2xkZXJVcmkhKSkgfSk7XG5cdFx0XHR9XG5cdFx0fTtcblxuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShvcGVuU2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdC8vIE1ha2UgdGhlIGVzdGFibGlzaGVkIHNlc3Npb24gYWN0aXZlLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24ob3BlblNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ29wZW4nKTtcblxuXHRcdC8vIE9wZW5pbmcgYSBuZXcgc2Vzc2lvbiB2aWV3IGluaGVyaXRzIHRoZSBhY3RpdmUgc2Vzc2lvbidzIHdvcmtzcGFjZS5cblx0XHR2aWV3Lm9wZW5OZXdTZXNzaW9uKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNyZWF0ZWRGb3I6IGNyZWF0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPz8gbnVsbCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0XHRhY3RpdmVXb3Jrc3BhY2U6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8ud29ya3NwYWNlLmdldCgpPy5mb2xkZXJzWzBdPy5yb290LnRvU3RyaW5nKCkgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkRm9yOiB3b3Jrc3BhY2VCLnRvU3RyaW5nKCksXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAnaW5oZXJpdGVkJyxcblx0XHRcdGFjdGl2ZVdvcmtzcGFjZTogd29ya3NwYWNlQi50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVuTmV3U2Vzc2lvbiBkb2VzIG5vdCBpbmhlcml0IHRoZSBhY3RpdmUgc2Vzc2lvbiB3b3Jrc3BhY2UgYnkgZGVmYXVsdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VCID0gVVJJLnBhcnNlKCdmaWxlOi8vL3dvcmtzcGFjZUInKTtcblx0XHRjb25zdCBvcGVuU2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ29wZW4nLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0d29ya3NwYWNlOiBjb25zdE9ic2VydmFibGUoe1xuXHRcdFx0XHR1cmk6IHdvcmtzcGFjZUIsXG5cdFx0XHRcdGxhYmVsOiAnd3MnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLnZtLFxuXHRcdFx0XHRmb2xkZXJzOiBbeyByb290OiB3b3Jrc3BhY2VCLCB3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2VCLCBuYW1lOiAnd3MnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH0gc2F0aXNmaWVzIElTZXNzaW9uV29ya3NwYWNlKSxcblx0XHR9KTtcblxuXHRcdGxldCBjcmVhdGVOZXdTZXNzaW9uQ2FsbGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIob3BlblNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtvcGVuU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ2FsbGVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIG9wZW5TZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uob3BlblNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKG9wZW5TZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdvcGVuJyk7XG5cblx0XHQvLyBXaXRob3V0IHRoZSBpbmhlcml0IG9wdGlvbiwgbm8gbmV3IHNlc3Npb24gaXMgY3JlYXRlZCBmcm9tIHRoZSBhY3RpdmVcblx0XHQvLyBzZXNzaW9uJ3Mgd29ya3NwYWNlOyB0aGUgZW1wdHkgbmV3LXNlc3Npb24gdmlldyBpcyBzaG93biBpbnN0ZWFkLlxuXHRcdHZpZXcub3Blbk5ld1Nlc3Npb24oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNhbGxlZCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0fSwge1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNhbGxlZDogZmFsc2UsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiBudWxsLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5jZWxsZWQgb3Blbk5ld1Nlc3Npb24gZG9lcyBub3QgcmVwbGFjZSBhIG5ld2VyIGRyYWZ0IGFmdGVyIHdvcmtzcGFjZSB0cnVzdCByZXNvbHZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzdGFsZUZvbGRlciA9IFVSSS5maWxlKCcvc3RhbGUnKTtcblx0XHRjb25zdCBsYXRlc3RGb2xkZXIgPSBVUkkuZmlsZSgnL2xhdGVzdCcpO1xuXHRcdGNvbnN0IG1ha2VXb3Jrc3BhY2UgPSAodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSA9PiAoe1xuXHRcdFx0dXJpLFxuXHRcdFx0bGFiZWw6IHVyaS5wYXRoLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRmb2xkZXJzOiBbeyByb290OiB1cmksIHdvcmtpbmdEaXJlY3Rvcnk6IHVyaSwgbmFtZTogdXJpLnBhdGgsIGRlc2NyaXB0aW9uOiB1bmRlZmluZWQgfV0sXG5cdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KTtcblx0XHRjb25zdCBzdGFsZVNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3N0YWxlJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHN0YWxlRm9sZGVyKSkgfSk7XG5cdFx0Y29uc3QgbGF0ZXN0U2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnbGF0ZXN0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKGxhdGVzdEZvbGRlcikpIH0pO1xuXHRcdGNvbnN0IGNyZWF0ZWRGb2xkZXJzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKGxhdGVzdFNlc3Npb24pOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4gbWFrZVdvcmtzcGFjZShmb2xkZXJVcmkpOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVkRm9sZGVycy5wdXNoKGZvbGRlclVyaS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIGZvbGRlclVyaS50b1N0cmluZygpID09PSBzdGFsZUZvbGRlci50b1N0cmluZygpID8gc3RhbGVTZXNzaW9uIDogbGF0ZXN0U2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHN0YWxlVHJ1c3QgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0bGV0IHRydXN0UmVxdWVzdENvdW50ID0gMDtcblx0XHRjb25zdCB0cnVzdFJlcXVlc3RTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlVHJ1c3RSZXF1ZXN0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZXF1ZXN0UmVzb3VyY2VzVHJ1c3QoKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0XHRcdHRydXN0UmVxdWVzdENvdW50Kys7XG5cdFx0XHRcdHJldHVybiB0cnVzdFJlcXVlc3RDb3VudCA9PT0gMSA/IHN0YWxlVHJ1c3QucCA6IFByb21pc2UucmVzb2x2ZSh0cnVlKTtcblx0XHRcdH1cblx0XHR9O1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShcblx0XHRcdGxhdGVzdFNlc3Npb24sXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyLFxuXHRcdFx0bmV3IFRlc3RXb3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKCksXG5cdFx0XHR0cnVzdFJlcXVlc3RTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0Y29uc3Qgc3RhbGVDdHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENhbmNlbGxhdGlvblRva2VuU291cmNlKCkpO1xuXG5cdFx0Y29uc3Qgc3RhbGVPcGVuID0gdmlldy5vcGVuTmV3U2Vzc2lvbih7IGZvbGRlclVyaTogc3RhbGVGb2xkZXIgfSwgc3RhbGVDdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdHN0YWxlQ3RzLmNhbmNlbCgpO1xuXHRcdGNvbnN0IGxhdGVzdFJlc3VsdCA9IGF3YWl0IHZpZXcub3Blbk5ld1Nlc3Npb24oeyBmb2xkZXJVcmk6IGxhdGVzdEZvbGRlciB9KTtcblx0XHRzdGFsZVRydXN0LmNvbXBsZXRlKHRydWUpO1xuXHRcdGNvbnN0IHN0YWxlUmVzdWx0ID0gYXdhaXQgc3RhbGVPcGVuO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkRm9sZGVycyxcblx0XHRcdGFjdGl2ZVNlc3Npb25JZDogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0XHRsYXRlc3RTZXNzaW9uSWQ6IGxhdGVzdFJlc3VsdC5zZXNzaW9uPy5zZXNzaW9uSWQsXG5cdFx0XHRzdGFsZVNlc3Npb25JZDogc3RhbGVSZXN1bHQuc2Vzc2lvbj8uc2Vzc2lvbklkLFxuXHRcdH0sIHtcblx0XHRcdGNyZWF0ZWRGb2xkZXJzOiBbbGF0ZXN0Rm9sZGVyLnRvU3RyaW5nKCldLFxuXHRcdFx0YWN0aXZlU2Vzc2lvbklkOiAnbGF0ZXN0Jyxcblx0XHRcdGxhdGVzdFNlc3Npb25JZDogJ2xhdGVzdCcsXG5cdFx0XHRzdGFsZVNlc3Npb25JZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0LnNraXAoJ29wZW5OZXdTZXNzaW9uIHJlY3JlYXRlcyBhIGRyYWZ0IGZvciB0aGUgYWN0aXZlIHNlc3Npb24gd29ya3NwYWNlIHdoZW4gaW5oZXJpdGluZycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYWtlV29ya3NwYWNlID0gKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgPT4gKHtcblx0XHRcdHVyaSxcblx0XHRcdGxhYmVsOiAnd3MnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi52bSxcblx0XHRcdGZvbGRlcnM6IFt7IHJvb3Q6IHVyaSwgd29ya2luZ0RpcmVjdG9yeTogdXJpLCBuYW1lOiAnd3MnLCBkZXNjcmlwdGlvbjogdW5kZWZpbmVkIH1dLFxuXHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlQSA9IFVSSS5wYXJzZSgnZmlsZTovLy93b3Jrc3BhY2VBJyk7XG5cdFx0Y29uc3Qgb3BlblNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29wZW4nLCBwcm92aWRlcklkOiAndGVzdCcsIHdvcmtzcGFjZTogY29uc3RPYnNlcnZhYmxlKG1ha2VXb3Jrc3BhY2Uod29ya3NwYWNlQSkpIH0pO1xuXHRcdGNvbnN0IHBlbmRpbmdTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdwZW5kaW5nJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCB3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShtYWtlV29ya3NwYWNlKHdvcmtzcGFjZUEpKSB9KTtcblxuXHRcdGxldCBjcmVhdGVOZXdTZXNzaW9uQ291bnQgPSAwO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKG9wZW5TZXNzaW9uKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbb3BlblNlc3Npb25dOyB9XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaT86IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIG1ha2VXb3Jrc3BhY2UoZm9sZGVyVXJpISk7IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHBlbmRpbmdTZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH07XG5cblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uob3BlblNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBDb21wb3NlIGFuIGluLXByb2dyZXNzIG5ldyBzZXNzaW9uIChwZW5kaW5nIGRyYWZ0KSBmb3Igd29ya3NwYWNlIEEuXG5cdFx0dmlldy5vcGVuTmV3U2Vzc2lvbih7IGZvbGRlclVyaTogd29ya3NwYWNlQSB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdwZW5kaW5nJyk7XG5cblx0XHQvLyBOYXZpZ2F0ZSB0byB0aGUgZXN0YWJsaXNoZWQgc2Vzc2lvbiwgd2hpY2ggc2hhcmVzIHdvcmtzcGFjZSBBLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24ob3BlblNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ29wZW4nKTtcblxuXHRcdC8vIE9wZW5pbmcgYSBuZXcgc2Vzc2lvbiB2aWV3IGluaGVyaXRzIHdvcmtzcGFjZSBBIGFuZCBhbHdheXMgY3JlYXRlcyBhXG5cdFx0Ly8gZnJlc2ggZHJhZnQgZm9yIGl0IChubyB3b3Jrc3BhY2UgZGUtZHVwbGljYXRpb24pLlxuXHRcdHZpZXcub3Blbk5ld1Nlc3Npb24oKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3JlYXRlTmV3U2Vzc2lvbkNvdW50LFxuXHRcdFx0YWN0aXZlU2Vzc2lvbjogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQgPz8gbnVsbCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVOZXdTZXNzaW9uQ291bnQ6IDIsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAncGVuZGluZycsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVWaXNpYmxlU2Vzc2lvbnMgcmVzdG9yZXMgdGhlIGdyaWQgb3JkZXIsIHN0aWNreSBhbmQgYWN0aXZlIHN0YXRlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25BID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdiJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25DID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdjJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHNlc3Npb25zID0gW3Nlc3Npb25BLCBzZXNzaW9uQiwgc2Vzc2lvbkNdO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHQvLyBQZXJzaXN0ZWQgZ3JpZDogW0EgKHN0aWNreSksIEIgKGFjdGl2ZSksIENdXG5cdFx0c3RvcmFnZS5zdG9yZShcblx0XHRcdCdhZ2VudFNlc3Npb25zLmFjdGl2ZVNlc3Npb25TdGF0ZXMnLFxuXHRcdFx0SlNPTi5zdHJpbmdpZnkoW1xuXHRcdFx0XHR7IHNlc3Npb25SZXNvdXJjZTogc2Vzc2lvbkEucmVzb3VyY2UudG9TdHJpbmcoKSwgdmlzaWJsZU9yZGVyOiAwLCBpc1N0aWNreTogdHJ1ZSwgaXNBY3RpdmU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQi5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDEsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IHRydWUgfSxcblx0XHRcdFx0eyBzZXNzaW9uUmVzb3VyY2U6IHNlc3Npb25DLnJlc291cmNlLnRvU3RyaW5nKCksIHZpc2libGVPcmRlcjogMiwgaXNTdGlja3k6IGZhbHNlLCBpc0FjdGl2ZTogZmFsc2UgfSxcblx0XHRcdF0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdGF3YWl0IHZpZXcucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRzdGlja3k6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLm1hcChzID0+IHM/LnN0aWNreS5nZXQoKSA/PyBmYWxzZSksXG5cdFx0XHRhY3RpdmU6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsnYScsICdiJywgJ2MnXSxcblx0XHRcdHN0aWNreTogW3RydWUsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHRhY3RpdmU6ICdiJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVZpc2libGVTZXNzaW9ucyBsYXlzIG91dCB0aGUgZ3JpZCBhdG9taWNhbGx5IHdpdGhvdXQgaW50ZXJtZWRpYXRlIHNpbmdsZS1zZXNzaW9uIHN0YXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uQSA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uQSwgc2Vzc2lvbkJdO1xuXG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0fTtcblxuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UoKSk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHQvLyBQZXJzaXN0ZWQgZ3JpZDogW0EsIEIgKGFjdGl2ZSldIFx1MjAxNCB0aGUgYWN0aXZlIHNlc3Npb24gaXMgTk9UIHRoZVxuXHRcdC8vIGxlZnQtbW9zdCBvbmUsIHdoaWNoIHVzZWQgdG8gc3VyZmFjZSBCIGFsb25lIGJlZm9yZSBBIHdhcyBpbnNlcnRlZC5cblx0XHRzdG9yYWdlLnN0b3JlKFxuXHRcdFx0J2FnZW50U2Vzc2lvbnMuYWN0aXZlU2Vzc2lvblN0YXRlcycsXG5cdFx0XHRKU09OLnN0cmluZ2lmeShbXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQS5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDAsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IGZhbHNlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvblJlc291cmNlOiBzZXNzaW9uQi5yZXNvdXJjZS50b1N0cmluZygpLCB2aXNpYmxlT3JkZXI6IDEsIGlzU3RpY2t5OiBmYWxzZSwgaXNBY3RpdmU6IHRydWUgfSxcblx0XHRcdF0pLFxuXHRcdFx0MSAvKiBTdG9yYWdlU2NvcGUuV09SS1NQQUNFICovLFxuXHRcdFx0MSAvKiBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUgKi8sXG5cdFx0KTtcblxuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtwcm92aWRlcl0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdH0pO1xuXG5cdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0Y29uc3QgdmlldyA9IGNyZWF0ZVZpZXcoaW5zdGFudGlhdGlvblNlcnZpY2UsIHNlcnZpY2UsIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIFJlY29yZCBldmVyeSBncmlkIHN0YXRlIHB1Ymxpc2hlZCB3aGlsZSByZXN0b3JpbmcuXG5cdFx0Y29uc3Qgc3RhdGVzOiAoc3RyaW5nIHwgbnVsbClbXVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdHN0YXRlcy5wdXNoKHZpZXcudmlzaWJsZVNlc3Npb25zLnJlYWQocmVhZGVyKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCkpO1xuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHZpZXcucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXG5cdFx0Ly8gVGhlIGdyaWQgbXVzdCBuZXZlciBnbyB0aHJvdWdoIGEgc3RhdGUgc2hvd2luZyBvbmx5IHRoZSBhY3RpdmVcblx0XHQvLyBzZXNzaW9uICdiJyBvbiBpdHMgb3duIFx1MjAxNCB0aGF0IGludGVybWVkaWF0ZSBsYXlvdXQgaXMgdGhlIGZsaWNrZXIuXG5cdFx0Y29uc3Qgc2hvd2VkQWN0aXZlQWxvbmUgPSBzdGF0ZXMuc29tZShzID0+IHMubGVuZ3RoID09PSAxICYmIHNbMF0gPT09ICdiJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNob3dlZEFjdGl2ZUFsb25lLFxuXHRcdFx0ZmluYWw6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLm1hcChzID0+IHM/LnNlc3Npb25JZCA/PyBudWxsKSxcblx0XHRcdGFjdGl2ZTogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0fSwge1xuXHRcdFx0c2hvd2VkQWN0aXZlQWxvbmU6IGZhbHNlLFxuXHRcdFx0ZmluYWw6IFsnYScsICdiJ10sXG5cdFx0XHRhY3RpdmU6ICdiJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VuZE5ld0NoYXRSZXF1ZXN0IGtlZXBzIHRoZSBzdGFydGVkIHNlc3Npb24gYWN0aXZlIGZvciBhIGZvcmVncm91bmQgc2VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzKTtcblxuXHRcdC8vIE9wZW4gdGhlIHNlc3Npb24gc28gaXQgYmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdzMScpO1xuXG5cdFx0Ly8gQSBmb3JlZ3JvdW5kIG5ldy1jaGF0IHNlbmQga2VlcHMgdGhlIHN0YXJ0ZWQgc2Vzc2lvbiBhY3RpdmUgKHRoZSB2aWV3XG5cdFx0Ly8gZm9sbG93cyB0aGUgc2VuZCBhbmQgbmV2ZXIgcmVzZXRzIHRoZSBhY3RpdmUgc2xvdCkuXG5cdFx0YXdhaXQgc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgeyBxdWVyeTogJ2hpJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdzMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTmV3Q2hhdFJlcXVlc3Qgd2l0aCBiYWNrZ3JvdW5kIHJlc29sdmVzIGJlZm9yZSBwcm92aWRlciBzZW5kIGNvbW1pdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGxldCBjb21wbGV0ZVNlbmRSZXF1ZXN0OiAoKCkgPT4gdm9pZCkgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNlbmRSZXF1ZXN0U3RhcnRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdFx0XHRzZW5kUmVxdWVzdFN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRcdFx0XHRjb21wbGV0ZVNlbmRSZXF1ZXN0ID0gcmVzb2x2ZTtcblx0XHRcdFx0fSk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHQvLyBUaGUgYmFja2dyb3VuZCBzZW5kIGlzIGZpcmUtYW5kLWZvcmdldDogdGhlIHByb21pc2UgcmVzb2x2ZXMgYmVmb3JlXG5cdFx0Ly8gdGhlIHByb3ZpZGVyJ3MgYHNlbmRSZXF1ZXN0YCBjb21taXRzLlxuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3Qoc2Vzc2lvbiwgeyBxdWVyeTogJ2hpJywgYmFja2dyb3VuZDogdHJ1ZSB9KTtcblx0XHRhd2FpdCBzZW5kUHJvbWlzZTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW5kUmVxdWVzdFN0YXJ0ZWQsIHRydWUpO1xuXG5cdFx0Y29tcGxldGVTZW5kUmVxdWVzdD8uKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRSZXF1ZXN0IHdpdGggYmFja2dyb3VuZCBpcyBmaXJlLWFuZC1mb3JnZXQgYW5kIGRvZXMgbm90IGZpcmUgb25XaWxsU2VuZFJlcXVlc3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSwgc3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5VbnRpdGxlZCkgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRsZXQgY29tcGxldGVTZW5kUmVxdWVzdDogKCgpID0+IHZvaWQpIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBzZW50Q2hhdFJlc291cmNlOiBVUkkgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIGNoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudENoYXRSZXNvdXJjZSA9IGNoYXRSZXNvdXJjZTtcblx0XHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiB7XG5cdFx0XHRcdFx0Y29tcGxldGVTZW5kUmVxdWVzdCA9IHJlc29sdmU7XG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0bGV0IHdpbGxTZW5kQ291bnQgPSAwO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzZXJ2aWNlLm9uV2lsbFNlbmRSZXF1ZXN0KCgpID0+IHdpbGxTZW5kQ291bnQrKykpO1xuXG5cdFx0Ly8gVGhlIGJhY2tncm91bmQgc2VuZCBpcyBmaXJlLWFuZC1mb3JnZXQgKGl0IHJlc29sdmVzIGJlZm9yZSB0aGVcblx0XHQvLyBwcm92aWRlciBjb21taXRzKSBhbmQgbmV2ZXIgZmlyZXMgYG9uV2lsbFNlbmRSZXF1ZXN0YCwgc28gdGhlIHZpZXcnc1xuXHRcdC8vIHNlbmQtZm9sbG93IGNhbm5vdCBuYXZpZ2F0ZSBpbnRvIHRoZSBzZW50IGNoYXQuXG5cdFx0YXdhaXQgc2VydmljZS5zZW5kUmVxdWVzdChzZXNzaW9uLCBjaGF0LCB7IHF1ZXJ5OiAnaGknLCBiYWNrZ3JvdW5kOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZW50Q2hhdFJlc291cmNlOiBzZW50Q2hhdFJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdFx0d2lsbFNlbmRDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRzZW50Q2hhdFJlc291cmNlOiBjaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHR3aWxsU2VuZENvdW50OiAwLFxuXHRcdH0pO1xuXG5cdFx0Y29tcGxldGVTZW5kUmVxdWVzdD8uKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ21pcnJvcmVkIGZvbGxvdy11cCByZXF1ZXN0cyBwcmVzZXJ2ZSBzdWJtaXR0ZWQgYXR0YWNobWVudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgY2hhdFNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXHRcdGNvbnN0IGF0dGFjaGVkQ29udGV4dDogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeVtdID0gW3sga2luZDogJ2dlbmVyaWMnLCBpZDogJ2NvbnRleHQnLCBuYW1lOiAnQ29udGV4dCcsIHZhbHVlOiAndmFsdWUnIH1dO1xuXHRcdGxldCBzZW50RXZlbnQ6IElTZW5kUmVxdWVzdFNlbnRFdmVudCB8IHVuZGVmaW5lZDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFNlbmRSZXF1ZXN0KGV2ZW50ID0+IHNlbnRFdmVudCA9IGV2ZW50KSk7XG5cblx0XHRjaGF0U2VydmljZS5zdWJtaXRSZXF1ZXN0KHtcblx0XHRcdGNoYXRTZXNzaW9uUmVzb3VyY2U6IGNoYXQucmVzb3VyY2UsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdmb2xsb3cgdXAnLCBwYXJ0czogW10gfSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VudEV2ZW50ICYmIHtcblx0XHRcdHF1ZXJ5OiBzZW50RXZlbnQub3B0aW9ucy5xdWVyeSxcblx0XHRcdGF0dGFjaGVkQ29udGV4dDogc2VudEV2ZW50Lm9wdGlvbnMuYXR0YWNoZWRDb250ZXh0LFxuXHRcdFx0aXNOZXdTZXNzaW9uOiBzZW50RXZlbnQuaXNOZXdTZXNzaW9uLFxuXHRcdFx0aXNOZXdDaGF0OiBzZW50RXZlbnQuaXNOZXdDaGF0LFxuXHRcdH0sIHtcblx0XHRcdHF1ZXJ5OiAnZm9sbG93IHVwJyxcblx0XHRcdGF0dGFjaGVkQ29udGV4dCxcblx0XHRcdGlzTmV3U2Vzc2lvbjogZmFsc2UsXG5cdFx0XHRpc05ld0NoYXQ6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kLWZvbGxvdyBhY3RpdmF0ZXMgb25seSB2aXNpYmxlIGNoYXQgdGFicycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtYWluQ2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvbWFpbicpLCB0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdtYWluJykgfTtcblx0XHRjb25zdCBzaWRlQ2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQvc2lkZScpLCB0aXRsZTogY29uc3RPYnNlcnZhYmxlKCdzaWRlJyksIG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5TaWRlQ2hhdCB9IH07XG5cdFx0Y29uc3QgdG9vbENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0L3Rvb2wnKSwgdGl0bGU6IGNvbnN0T2JzZXJ2YWJsZSgndG9vbCcpLCBvcmlnaW46IHsga2luZDogQ2hhdE9yaWdpbktpbmQuVG9vbCB9LCBpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuUmVhZE9ubHkpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW21haW5DaGF0LCBzaWRlQ2hhdCwgdG9vbENoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbkNoYXQpLFxuXHRcdFx0Y2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUgfSksXG5cdFx0fSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIF9jaGF0UmVzb3VyY2U6IFVSSSwgX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHZpZXcub3BlbkNoYXQoc2Vzc2lvbiwgc2lkZUNoYXQucmVzb3VyY2UpO1xuXHRcdGF3YWl0IHNlcnZpY2Uuc2VuZFJlcXVlc3Qoc2Vzc2lvbiwgdG9vbENoYXQsIHsgcXVlcnk6ICdoaWRkZW4gdG9vbCcgfSk7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y29uc3QgYWZ0ZXJIaWRkZW5TZW5kID0gdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHRhd2FpdCB2aWV3Lm9wZW5DaGF0KHNlc3Npb24sIHRvb2xDaGF0LnJlc291cmNlKTtcblx0XHRhd2FpdCBzZXJ2aWNlLnNlbmRSZXF1ZXN0KHNlc3Npb24sIHRvb2xDaGF0LCB7IHF1ZXJ5OiAndmlzaWJsZSB0b29sJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRjb25zdCBhZnRlclZpc2libGVTZW5kID0gdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5hY3RpdmVDaGF0LmdldCgpLnJlc291cmNlLnRvU3RyaW5nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHZpc2libGVUYWJzOiB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnZpc2libGVDaGF0VGFicy5nZXQoKS5tYXAoY2hhdCA9PiBjaGF0LnRpdGxlLmdldCgpKSxcblx0XHRcdGFmdGVySGlkZGVuU2VuZCxcblx0XHRcdGFmdGVyVmlzaWJsZVNlbmQsXG5cdFx0fSwge1xuXHRcdFx0dmlzaWJsZVRhYnM6IFsnbWFpbicsICdzaWRlJywgJ3Rvb2wnXSxcblx0XHRcdGFmdGVySGlkZGVuU2VuZDogc2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdGFmdGVyVmlzaWJsZVNlbmQ6IHRvb2xDaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBzZW5kcyB3aXRob3V0IGNoYW5naW5nIHRoZSBhY3RpdmUgdmlldycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0bGV0IHNlbmRSZXF1ZXN0U3RhcnRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIF9vcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdFx0XHRzZW5kUmVxdWVzdFN0YXJ0ZWQgPSB0cnVlO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Ly8gTm8gYWN0aXZlIHNlc3Npb24gYW5kIG5vIHBlbmRpbmcgY29tcG9zZXIgYmVmb3JlIHRoZSBoZWFkbGVzcyBzZW5kLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCksIHVuZGVmaW5lZCk7XG5cblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSk7XG5cblx0XHQvLyBUaGUgcmVxdWVzdCB3YXMgc2VudCwgYnV0IHRoZSB1c2VyJ3MgdmlldyB3YXMgbm90IG5hdmlnYXRlZCBpbnRvIHRoZSBzZXNzaW9uLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZW5kUmVxdWVzdFN0YXJ0ZWQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBwcmVwYXJlcyByZXF1ZXN0IG9wdGlvbnMgd2hpbGUgY29uZmlndXJpbmcgdGhlIHByb3Zpc2lvbmFsIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHR9KTtcblx0XHRjb25zdCByZXF1ZXN0T3B0aW9uc0JhcnJpZXIgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgcmVxdWVzdFByZXBhcmF0aW9uU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBjb25maWd1cmF0aW9uQ29tcGxldGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGV2ZW50czogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgY3JlYXRlTWV0YWRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksXG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbihfZm9sZGVyVXJpPzogVVJJLCBfc2Vzc2lvblR5cGVJZD86IHN0cmluZywgb3B0aW9ucz86IElTZXNzaW9uc1Byb3ZpZGVyQ3JlYXRlU2Vzc2lvbk9wdGlvbnMpOiBJU2Vzc2lvbiB7XG5cdFx0XHRcdGNyZWF0ZU1ldGFkYXRhID0gb3B0aW9ucz8ubWV0YWRhdGE7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKCdjcmVhdGUnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzdGFydE5ld1Nlc3Npb25SZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgYWN0aXZpdHk/OiBzdHJpbmcpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goYHN0YXJ0OiR7YWN0aXZpdHl9YCk7XG5cdFx0XHRcdHJldHVybiB7IGRpc3Bvc2U6ICgpID0+IGV2ZW50cy5wdXNoKCdjbGVhcicpIH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUNvbmZpZ3VyYXRpb24oKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKCdjb25maWd1cmUnKTtcblx0XHRcdFx0Y29uZmlndXJhdGlvbkNvbXBsZXRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoX3Nlc3Npb25JZDogc3RyaW5nLCBfY2hhdFJlc291cmNlOiBVUkksIG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdGV2ZW50cy5wdXNoKGBzZW5kOiR7b3B0aW9ucy5xdWVyeX1gKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IHNlbmRQcm9taXNlID0gc2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLCB7XG5cdFx0XHRraW5kOiAnZGVmZXJyZWQnLFxuXHRcdFx0YWN0aXZpdHk6ICdGZXRjaGluZyBwdWxsIHJlcXVlc3QuLi4nLFxuXHRcdFx0YXN5bmMgcmVzb2x2ZSgpIHtcblx0XHRcdFx0ZXZlbnRzLnB1c2goJ3ByZXBhcmUnKTtcblx0XHRcdFx0cmVxdWVzdFByZXBhcmF0aW9uU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCByZXF1ZXN0T3B0aW9uc0JhcnJpZXIucDtcblx0XHRcdFx0cmV0dXJuIHsgcXVlcnk6ICdwcmVwYXJlZCcgfTtcblx0XHRcdH0sXG5cdFx0fSwge1xuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdG1ldGFkYXRhOiB7IGdpdGh1YjogeyBwdWxsUmVxdWVzdFVybDogJ2h0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvNDInIH0gfSxcblx0XHRcdG9uU2Vzc2lvbkNyZWF0ZWQ6IGNyZWF0ZWQgPT4ge1xuXHRcdFx0XHR2aWV3LnNob3dTZXNzaW9uKGNyZWF0ZWQucmVzb3VyY2UpO1xuXHRcdFx0XHRldmVudHMucHVzaChgc2hvdzoke3ZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkfWApO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLmFsbChbcmVxdWVzdFByZXBhcmF0aW9uU3RhcnRlZC5wLCBjb25maWd1cmF0aW9uQ29tcGxldGVkLnBdKTtcblx0XHRjb25zdCBldmVudHNXaGlsZVByZXBhcmluZ1JlcXVlc3QgPSBbLi4uZXZlbnRzXTtcblx0XHRyZXF1ZXN0T3B0aW9uc0JhcnJpZXIuY29tcGxldGUoKTtcblx0XHRhd2FpdCBzZW5kUHJvbWlzZTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZXZlbnRzV2hpbGVQcmVwYXJpbmdSZXF1ZXN0LFxuXHRcdFx0ZXZlbnRzLFxuXHRcdFx0Y3JlYXRlTWV0YWRhdGEsXG5cdFx0fSwge1xuXHRcdFx0ZXZlbnRzV2hpbGVQcmVwYXJpbmdSZXF1ZXN0OiBbJ2NyZWF0ZScsICdzdGFydDpGZXRjaGluZyBwdWxsIHJlcXVlc3QuLi4nLCAnc2hvdzpzMScsICdwcmVwYXJlJywgJ2NvbmZpZ3VyZSddLFxuXHRcdFx0ZXZlbnRzOiBbJ2NyZWF0ZScsICdzdGFydDpGZXRjaGluZyBwdWxsIHJlcXVlc3QuLi4nLCAnc2hvdzpzMScsICdwcmVwYXJlJywgJ2NvbmZpZ3VyZScsICdjbGVhcicsICdzZW5kOnByZXBhcmVkJ10sXG5cdFx0XHRjcmVhdGVNZXRhZGF0YTogeyBnaXRodWI6IHsgcHVsbFJlcXVlc3RVcmw6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBjbGVhcnMgcmVxdWVzdCBhY3Rpdml0eSB3aGVuIGFscmVhZHkgY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0fSk7XG5cdFx0bGV0IHJlcXVlc3RPcHRpb25zUmVzb2x2ZWQgPSBmYWxzZTtcblx0XHRsZXQgYWN0aXZpdHlDbGVhcmVkID0gMDtcblx0XHRsZXQgZGVsZXRlZCA9IDA7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSxcblx0XHRcdFx0XHRsYWJlbDogJ1Rlc3QnLFxuXHRcdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0XHRcdGZvbGRlcnM6IFtdLFxuXHRcdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzdGFydE5ld1Nlc3Npb25SZXF1ZXN0KCkge1xuXHRcdFx0XHRyZXR1cm4geyBkaXNwb3NlOiAoKSA9PiBhY3Rpdml0eUNsZWFyZWQrKyB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdFx0ZGVsZXRlZCsrO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHtcblx0XHRcdGtpbmQ6ICdkZWZlcnJlZCcsXG5cdFx0XHRhY3Rpdml0eTogJ0ZldGNoaW5nIHB1bGwgcmVxdWVzdC4uLicsXG5cdFx0XHRhc3luYyByZXNvbHZlKCkge1xuXHRcdFx0XHRyZXF1ZXN0T3B0aW9uc1Jlc29sdmVkID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHsgcXVlcnk6ICdwcmVwYXJlZCcgfTtcblx0XHRcdH0sXG5cdFx0fSwgdW5kZWZpbmVkLCBDYW5jZWxsYXRpb25Ub2tlbi5DYW5jZWxsZWQpLCAvQ2FuY2VsZWQvKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVxdWVzdE9wdGlvbnNSZXNvbHZlZCxcblx0XHRcdGFjdGl2aXR5Q2xlYXJlZCxcblx0XHRcdGRlbGV0ZWQsXG5cdFx0fSwge1xuXHRcdFx0cmVxdWVzdE9wdGlvbnNSZXNvbHZlZDogZmFsc2UsXG5cdFx0XHRhY3Rpdml0eUNsZWFyZWQ6IDEsXG5cdFx0XHRkZWxldGVkOiAxLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgZGlzcG9zZXMgdGhlIGRyYWZ0IHdoZW4gcmVxdWVzdCBhY3Rpdml0eSBzdGFydHVwIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0fSk7XG5cdFx0bGV0IGRlbGV0ZWQgPSAwO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLFxuXHRcdFx0XHRcdGxhYmVsOiAnVGVzdCcsXG5cdFx0XHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRcdFx0Zm9sZGVyczogW10sXG5cdFx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIHN0YXJ0TmV3U2Vzc2lvblJlcXVlc3QoKTogbmV2ZXIge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ3N0YXJ0IGZhaWxlZCcpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdFx0ZGVsZXRlZCsrO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHtcblx0XHRcdGtpbmQ6ICdkZWZlcnJlZCcsXG5cdFx0XHRhY3Rpdml0eTogJ0ZldGNoaW5nIHB1bGwgcmVxdWVzdC4uLicsXG5cdFx0XHRhc3luYyByZXNvbHZlKCkge1xuXHRcdFx0XHRyZXR1cm4geyBxdWVyeTogJ3ByZXBhcmVkJyB9O1xuXHRcdFx0fSxcblx0XHR9KSwgL3N0YXJ0IGZhaWxlZC8pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZWxldGVkLFxuXHRcdFx0c2Vzc2lvbjogc2VydmljZS5nZXRTZXNzaW9uKHNlc3Npb24ucmVzb3VyY2UpLFxuXHRcdH0sIHtcblx0XHRcdGRlbGV0ZWQ6IDEsXG5cdFx0XHRzZXNzaW9uOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCByZWZ1c2VzIGFuIHVudHJ1c3RlZCByZXF1aXJlZCB3b3Jrc3BhY2UgYmVmb3JlIGNyZWF0aW5nIGEgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vY2hhdCcpIH07XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3MxJyxcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpO1xuXHRcdGxldCByZXNvbHZlQ291bnQgPSAwO1xuXHRcdGxldCBjcmVhdGVDb3VudCA9IDA7XG5cdFx0bGV0IHNlbmRDb3VudCA9IDA7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKHVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdFx0XHRyZXNvbHZlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR1cmksXG5cdFx0XHRcdFx0bGFiZWw6ICdUZXN0Jyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiB0cnVlLFxuXHRcdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHRcdH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0XHRcdFx0Y3JlYXRlQ291bnQrKztcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIF9jaGF0UmVzb3VyY2U6IFVSSSwgX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdHNlbmRDb3VudCsrO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UgPSBuZXcgVGVzdFdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UoKTtcblx0XHR3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlLnRydXN0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyLCB3b3Jrc3BhY2VUcnVzdE1hbmFnZW1lbnRTZXJ2aWNlKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0c2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoZm9sZGVyVXJpLCB7IHF1ZXJ5OiAnaGknIH0pLFxuXHRcdFx0V29ya3NwYWNlTm90VHJ1c3RlZEVycm9yLFxuXHRcdCk7XG5cdFx0d29ya3NwYWNlVHJ1c3RNYW5hZ2VtZW50U2VydmljZS50cnVzdGVkID0gdHJ1ZTtcblx0XHRhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXJVcmksIHsgcXVlcnk6ICdoaScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlcXVlc3RlZFVyaXM6IHdvcmtzcGFjZVRydXN0TWFuYWdlbWVudFNlcnZpY2UucmVxdWVzdGVkVXJpcy5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHRcdHJlc29sdmVDb3VudCxcblx0XHRcdGNyZWF0ZUNvdW50LFxuXHRcdFx0c2VuZENvdW50LFxuXHRcdH0sIHtcblx0XHRcdHJlcXVlc3RlZFVyaXM6IFtmb2xkZXJVcmkudG9TdHJpbmcoKSwgZm9sZGVyVXJpLnRvU3RyaW5nKCldLFxuXHRcdFx0cmVzb2x2ZUNvdW50OiAyLFxuXHRcdFx0Y3JlYXRlQ291bnQ6IDEsXG5cdFx0XHRzZW5kQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RhcmdldCBhdmFpbGFiaWxpdHkgcmVxdWlyZXMgdGhlIHJlcXVlc3RlZCBwcm92aWRlciBhbmQgc2Vzc2lvbiB0eXBlIHRvIGJlIGFkdmVydGlzZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3QgYXZhaWxhYmxlRm9sZGVyID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL2F2YWlsYWJsZScpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3VwcG9ydHNRdWlja0NoYXRzID0gdHJ1ZTtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAnd29ya3NwYWNlLWFnZW50JywgbGFiZWw6ICdXb3Jrc3BhY2UgQWdlbnQnLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAncXVpY2stYWdlbnQnLCBsYWJlbDogJ1F1aWNrIEFnZW50JywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XTtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZS5pc0VxdWFsKGZvbGRlclVyaSwgYXZhaWxhYmxlRm9sZGVyKSA/IHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZSA6IHVuZGVmaW5lZDtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlcyhmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRcdFx0cmV0dXJuIGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlLmlzRXF1YWwoZm9sZGVyVXJpLCBhdmFpbGFibGVGb2xkZXIpID8gW3RoaXMuc2Vzc2lvblR5cGVzWzBdXSA6IFtdO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlZmF1bHRXb3Jrc3BhY2U6IHNlcnZpY2UuaXNOZXdTZXNzaW9uVGFyZ2V0QXZhaWxhYmxlKGF2YWlsYWJsZUZvbGRlciksXG5cdFx0XHRleGFjdFdvcmtzcGFjZTogc2VydmljZS5pc05ld1Nlc3Npb25UYXJnZXRBdmFpbGFibGUoYXZhaWxhYmxlRm9sZGVyLCB7IHByb3ZpZGVySWQ6ICd0ZXN0Jywgc2Vzc2lvblR5cGVJZDogJ3dvcmtzcGFjZS1hZ2VudCcgfSksXG5cdFx0XHR3cm9uZ1dvcmtzcGFjZVR5cGU6IHNlcnZpY2UuaXNOZXdTZXNzaW9uVGFyZ2V0QXZhaWxhYmxlKGF2YWlsYWJsZUZvbGRlciwgeyBwcm92aWRlcklkOiAndGVzdCcsIHNlc3Npb25UeXBlSWQ6ICdxdWljay1hZ2VudCcgfSksXG5cdFx0XHRtaXNzaW5nV29ya3NwYWNlOiBzZXJ2aWNlLmlzTmV3U2Vzc2lvblRhcmdldEF2YWlsYWJsZShVUkkucGFyc2UoJ3Rlc3Q6Ly8vbWlzc2luZycpKSxcblx0XHRcdGV4YWN0UXVpY2tDaGF0OiBzZXJ2aWNlLmlzUXVpY2tDaGF0VGFyZ2V0QXZhaWxhYmxlKHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZUlkOiAncXVpY2stYWdlbnQnIH0pLFxuXHRcdFx0d3JvbmdRdWlja0NoYXRQcm92aWRlcjogc2VydmljZS5pc1F1aWNrQ2hhdFRhcmdldEF2YWlsYWJsZSh7IHByb3ZpZGVySWQ6ICdvdGhlcicsIHNlc3Npb25UeXBlSWQ6ICdxdWljay1hZ2VudCcgfSksXG5cdFx0fSwge1xuXHRcdFx0ZGVmYXVsdFdvcmtzcGFjZTogdHJ1ZSxcblx0XHRcdGV4YWN0V29ya3NwYWNlOiB0cnVlLFxuXHRcdFx0d3JvbmdXb3Jrc3BhY2VUeXBlOiBmYWxzZSxcblx0XHRcdG1pc3NpbmdXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0ZXhhY3RRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHR3cm9uZ1F1aWNrQ2hhdFByb3ZpZGVyOiBmYWxzZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlTmV3U2Vzc2lvbiByZWplY3RzIGEgcGlubmVkIHNlc3Npb24gdHlwZSB0aGF0IGlzIG5vdCBhZHZlcnRpc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0XHRcdFx0cmV0dXJuIHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXNzZXJ0LnRocm93cyhcblx0XHRcdCgpID0+IHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZUlkOiAnbWlzc2luZycgfSksXG5cdFx0XHQvZG9lcyBub3QgYWR2ZXJ0aXNlIHNlc3Npb24gdHlwZSAnbWlzc2luZycvLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2luaGVyaXRhYmxlU2Vzc2lvblRhcmdldCBkcm9wcyBhIGhhcm5lc3MgdGhlIGZvbGRlciBubyBsb25nZXIgb2ZmZXJzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKTtcblx0XHQvLyBUaGUgcHJvdmlkZXIgc3RpbGwgcmVzb2x2ZXMgdGhlIGZvbGRlciAoaXRzIGV4aXN0aW5nIHNlc3Npb25zIHN0YXlcblx0XHQvLyB1c2FibGUpIGJ1dCBubyBsb25nZXIgYWR2ZXJ0aXNlcyB0aGUgdHlwZSB0aGV5IHdlcmUgY3JlYXRlZCB3aXRoLlxuXHRcdGNvbnN0IGhpZGRlbkhhcm5lc3NTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0Jywgc2Vzc2lvblR5cGU6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoX2ZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdFx0XHRyZXR1cm4geyBmb2xkZXJVcmk6IF9mb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRcdFx0cmV0dXJuIFt7IGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLCBpZDogJ3Rlc3QnLCBsYWJlbDogJ1Rlc3QnLCBpY29uOiBDb2RpY29uLnZtIH1dO1xuXHRcdFx0fVxuXHRcdH0oaGlkZGVuSGFybmVzc1Nlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShoaWRkZW5IYXJuZXNzU2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IHN0aWxsT2ZmZXJlZFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MyJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZXNzaW9uVHlwZTogJ3Rlc3QnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoaWRkZW5IYXJuZXNzOiBpbmhlcml0YWJsZVNlc3Npb25UYXJnZXQoc2VydmljZSwgaGlkZGVuSGFybmVzc1Nlc3Npb24sIGZvbGRlclVyaSksXG5cdFx0XHRvZmZlcmVkSGFybmVzczogaW5oZXJpdGFibGVTZXNzaW9uVGFyZ2V0KHNlcnZpY2UsIHN0aWxsT2ZmZXJlZFNlc3Npb24sIGZvbGRlclVyaSksXG5cdFx0XHRub0ZvbGRlcjogaW5oZXJpdGFibGVTZXNzaW9uVGFyZ2V0KHNlcnZpY2UsIHN0aWxsT2ZmZXJlZFNlc3Npb24sIHVuZGVmaW5lZCksXG5cdFx0XHRub1Nlc3Npb246IGluaGVyaXRhYmxlU2Vzc2lvblRhcmdldChzZXJ2aWNlLCB1bmRlZmluZWQsIGZvbGRlclVyaSksXG5cdFx0fSwge1xuXHRcdFx0aGlkZGVuSGFybmVzczoge30sXG5cdFx0XHRvZmZlcmVkSGFybmVzczogeyBwcm92aWRlcklkOiAndGVzdCcsIHNlc3Npb25UeXBlSWQ6ICd0ZXN0JyB9LFxuXHRcdFx0bm9Gb2xkZXI6IHt9LFxuXHRcdFx0bm9TZXNzaW9uOiB7fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBOZXcgU2Vzc2lvbiBnZXN0dXJlIHdob3NlIGhhcm5lc3MgaXMgaGlkZGVuIHN0aWxsIGNyZWF0ZXMgb24gdGhlIGZhbGxiYWNrIHByb3ZpZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdC8vIEVuZC10by1lbmQgc2hhcGUgb2YgdGhlIEFnZW50cy13aW5kb3cgYnVnOiBhbiBleHRlbnNpb24taG9zdCBzZXNzaW9uIGlzXG5cdFx0Ly8gb3BlbiwgaXRzIGhhcm5lc3MgaGFzIHNpbmNlIGJlZW4gaGlkZGVuIChgaGlkZUV4dGVuc2lvbkhvc3RgKSwgYW5kIHRoZVxuXHRcdC8vIHVzZXIgcHJlc3NlcyBOZXcuIFRoZSBnZXN0dXJlIHNwcmVhZHMgYGluaGVyaXRhYmxlU2Vzc2lvblRhcmdldGAgaW50b1xuXHRcdC8vIHRoZSBvcHRpb25zLCBzbyB0aGlzIGFsc28gY292ZXJzIHRoZSBlbXB0eS10YXJnZXQgcGF0aCBhdCBhIGNhbGwgc2l0ZS5cblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyk7XG5cdFx0Y29uc3QgZXh0SG9zdFNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2V4dGhvc3QtMScsIHByb3ZpZGVySWQ6ICdjb3BpbG90Jywgc2Vzc2lvblR5cGU6ICdjb3BpbG90Y2xpJyB9KTtcblx0XHRjb25zdCBjcmVhdGVkOiB7IHByb3ZpZGVySWQ6IHN0cmluZzsgc2Vzc2lvblR5cGVJZDogc3RyaW5nIH1bXSA9IFtdO1xuXG5cdFx0Ly8gU3RpbGwgcmVzb2x2ZXMgdGhlIGZvbGRlciAoaXRzIGV4aXN0aW5nIHNlc3Npb25zIHN0YXkgdXNhYmxlKSBidXRcblx0XHQvLyBhZHZlcnRpc2VzIG5vdGhpbmcgZm9yIGl0LlxuXHRcdGNvbnN0IGNvcGlsb3QgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdjb3BpbG90Jztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gMDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbXTtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoX2ZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IF9mb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uVHlwZXMoKTogSVNlc3Npb25UeXBlW10geyByZXR1cm4gW107IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gW2V4dEhvc3RTZXNzaW9uXTsgfVxuXHRcdH0oZXh0SG9zdFNlc3Npb24pO1xuXG5cdFx0Ly8gVGhlIGFnZW50IGhvc3Qgc29ydHMgZmlyc3QuXG5cdFx0Y29uc3QgYWdlbnRIb3N0U2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYWgtZHJhZnQnLCBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uVHlwZTogJ2NvcGlsb3RjbGknIH0pO1xuXHRcdGNvbnN0IGFnZW50SG9zdCA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gLTE7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdID0gW3sgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAnY29waWxvdGNsaScsIGxhYmVsOiAnQ29waWxvdCcsIGljb246IENvZGljb24udm0gfV07XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKF9mb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBfZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvblR5cGVzKCk6IElTZXNzaW9uVHlwZVtdIHsgcmV0dXJuIFt7IGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLCBpZDogJ2NvcGlsb3RjbGknLCBsYWJlbDogJ0NvcGlsb3QnLCBpY29uOiBDb2RpY29uLnZtIH1dOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtdOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKF9mb2xkZXJVcmk6IFVSSSwgc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdFx0XHRjcmVhdGVkLnB1c2goeyBwcm92aWRlcklkOiB0aGlzLmlkLCBzZXNzaW9uVHlwZUlkIH0pO1xuXHRcdFx0XHRyZXR1cm4gYWdlbnRIb3N0U2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KGFnZW50SG9zdFNlc3Npb24pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKFtjb3BpbG90LCBhZ2VudEhvc3RdKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IFRlc3RDaGF0U2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3Jrc3BhY2VUcnVzdFJlcXVlc3RTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlcXVlc3RSZXNvdXJjZXNUcnVzdCgpOiBQcm9taXNlPGJvb2xlYW4+IHsgcmV0dXJuIHRydWU7IH1cblx0XHR9KTtcblxuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdGNvbnN0IHZpZXcgPSBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihleHRIb3N0U2Vzc2lvbi5yZXNvdXJjZSk7XG5cblx0XHRjb25zdCBhY3RpdmUgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgdmlldy5vcGVuTmV3U2Vzc2lvbih7XG5cdFx0XHRmb2xkZXJVcmksXG5cdFx0XHQuLi5pbmhlcml0YWJsZVNlc3Npb25UYXJnZXQoc2VydmljZSwgYWN0aXZlLCBmb2xkZXJVcmkpLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjcmVhdGVkLFxuXHRcdFx0cmVzdWx0UHJvdmlkZXJJZDogcmVzdWx0LnNlc3Npb24/LnByb3ZpZGVySWQsXG5cdFx0XHR0cnVzdERlY2xpbmVkOiByZXN1bHQudHJ1c3REZWNsaW5lZCxcblx0XHR9LCB7XG5cdFx0XHRjcmVhdGVkOiBbeyBwcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELCBzZXNzaW9uVHlwZUlkOiAnY29waWxvdGNsaScgfV0sXG5cdFx0XHRyZXN1bHRQcm92aWRlcklkOiBMT0NBTF9BR0VOVF9IT1NUX1BST1ZJREVSX0lELFxuXHRcdFx0dHJ1c3REZWNsaW5lZDogZmFsc2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmRRdWlja0NoYXRSZXF1ZXN0IHVzZXMgdGhlIHF1aWNrLWNoYXQgY29udHJhY3Qgd2l0aG91dCBuYXZpZ2F0aW9uIG9yIHJlcG9zaXRvcnkgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGF0OiBJQ2hhdCA9IHsgLi4uc3R1YkNoYXQsIHJlc291cmNlOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vcXVpY2stY2hhdCcpIH07XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYWN0aXZlJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IHF1aWNrQ2hhdCA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdHNlc3Npb25JZDogJ3F1aWNrLTEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0aXNRdWlja0NoYXQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW2NoYXRdKSxcblx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdCksXG5cdFx0fSk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzdXBwb3J0c1F1aWNrQ2hhdHMgPSB0cnVlO1xuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbYWN0aXZlU2Vzc2lvbl07IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVF1aWNrQ2hhdChzZXNzaW9uVHlwZUlkOiBzdHJpbmcpOiBJU2Vzc2lvbiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYGNyZWF0ZVF1aWNrQ2hhdDoke3Nlc3Npb25UeXBlSWR9YCk7XG5cdFx0XHRcdHJldHVybiBxdWlja0NoYXQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlbDoke21vZGVsSWR9YCk7IH1cblx0XHRcdG92ZXJyaWRlIHNldElzb2xhdGlvbk1vZGUoKTogbmV2ZXIgeyB0aHJvdyBuZXcgRXJyb3IoJ2lzb2xhdGlvbiBzaG91bGQgbm90IGJlIGNvbmZpZ3VyZWQnKTsgfVxuXHRcdFx0b3ZlcnJpZGUgc2V0QnJhbmNoKCk6IG5ldmVyIHsgdGhyb3cgbmV3IEVycm9yKCdicmFuY2ggc2hvdWxkIG5vdCBiZSBjb25maWd1cmVkJyk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gcXVpY2tDaGF0O1xuXHRcdFx0fVxuXHRcdH0ocXVpY2tDaGF0KTtcblx0XHRjb25zdCB7IHNlcnZpY2UsIHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoYWN0aXZlU2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKGFjdGl2ZVNlc3Npb24ucmVzb3VyY2UpO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVBbmRTZW5kUXVpY2tDaGF0UmVxdWVzdCh7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdHNlc3Npb25UeXBlSWQ6ICd0ZXN0Jyxcblx0XHRcdG1vZGVsSWQ6ICdncHQtNG8nLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ3N0YWxlJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2Vzc2lvbklkOiByZXN1bHQ/LnNlc3Npb25JZCxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdFx0bmV3U2Vzc2lvbjogc2VydmljZS5uZXdTZXNzaW9uLmdldCgpLFxuXHRcdFx0Y2FsbHMsXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvbklkOiAncXVpY2stMScsXG5cdFx0XHRhY3RpdmVTZXNzaW9uOiAnYWN0aXZlJyxcblx0XHRcdG5ld1Nlc3Npb246IHVuZGVmaW5lZCxcblx0XHRcdGNhbGxzOiBbJ2NyZWF0ZVF1aWNrQ2hhdDp0ZXN0JywgJ3NldE1vZGVsOmdwdC00bycsICdzZW5kJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmRRdWlja0NoYXRSZXF1ZXN0IGNhbmNlbHMgY29tbWl0IGRldGVjdGlvbiBhbmQgZGlzcG9zZXMgdGhlIHByb3Zpc2lvbmFsIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9xdWljay1jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAncXVpY2stMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZW5kU3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzZW5kRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBzZW5kUmV0dXJuZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0bGV0IGRlbGV0ZWQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN1cHBvcnRzUXVpY2tDaGF0cyA9IHRydWU7XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVRdWlja0NoYXQoKTogSVNlc3Npb24geyByZXR1cm4gc2Vzc2lvbjsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHsgZGVsZXRlZCA9IHRydWU7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0YXdhaXQgc2VuZFN0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgc2VuZERvbmUucDtcblx0XHRcdFx0YXdhaXQgc2VuZFJldHVybmVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlLCBjaGF0U2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXHRcdGNvbnN0IGN0cyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKSk7XG5cdFx0bGV0IHN0YXJ0ZWQgPSAwO1xuXHRcdGxldCBzZW50ID0gMDtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFN0YXJ0U2Vzc2lvbigoKSA9PiBzdGFydGVkKyspKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFNlbmRSZXF1ZXN0KCgpID0+IHNlbnQrKykpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3QoeyBxdWVyeTogJ2hpJyB9LCB7XG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRzZXNzaW9uVHlwZUlkOiAndGVzdCcsXG5cdFx0fSwgY3RzLnRva2VuKTtcblx0XHRhd2FpdCBzZW5kU3RhcnRlZC5wO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0XHRhd2FpdCBzZW5kRG9uZS5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHNlbmRSZXR1cm5lZC5wO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2FuY2VsbGVkUmVzb3VyY2VzOiBjaGF0U2VydmljZS5jYW5jZWxsZWRSZXNvdXJjZXMubWFwKHJlc291cmNlID0+IHJlc291cmNlLnRvU3RyaW5nKCkpLFxuXHRcdFx0c3RhcnRlZCxcblx0XHRcdHNlbnQsXG5cdFx0fSwge1xuXHRcdFx0Y2FuY2VsbGVkUmVzb3VyY2VzOiBbY2hhdC5yZXNvdXJjZS50b1N0cmluZygpXSxcblx0XHRcdHN0YXJ0ZWQ6IDAsXG5cdFx0XHRzZW50OiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgaW52b2tlcyBjb25maWd1cmF0aW9uIHNldHRlcnMgZnJvbSBjcmVhdGVPcHRpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRsZXQgc2VudE9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIF9tb2RlbElkOiBzdHJpbmcpOiB2b2lkIHsgY2FsbHMucHVzaChgc2V0TW9kZWw6JHtfbW9kZWxJZH1gKTsgfVxuXHRcdFx0b3ZlcnJpZGUgc2V0TW9kZShfc2Vzc2lvbklkOiBzdHJpbmcsIF9tb2RlSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlOiR7X21vZGVJZH1gKTsgfVxuXHRcdFx0b3ZlcnJpZGUgc2V0UGVybWlzc2lvbkxldmVsKF9zZXNzaW9uSWQ6IHN0cmluZywgX2xldmVsOiBzdHJpbmcpOiB2b2lkIHsgY2FsbHMucHVzaChgc2V0UGVybWlzc2lvbkxldmVsOiR7X2xldmVsfWApOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRJc29sYXRpb25Nb2RlKF9zZXNzaW9uSWQ6IHN0cmluZywgX21vZGU6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyBjYWxscy5wdXNoKGBzZXRJc29sYXRpb25Nb2RlOiR7X21vZGV9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldEJyYW5jaChfc2Vzc2lvbklkOiBzdHJpbmcsIF9icmFuY2g6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyBjYWxscy5wdXNoKGBzZXRCcmFuY2g6JHtfYnJhbmNofWApOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrKF9zZXNzaW9uSWQ6IHN0cmluZywgX2VuYWJsZWQ6IGJvb2xlYW4pOiBQcm9taXNlPHZvaWQ+IHsgY2FsbHMucHVzaChgc2V0V29ya3RyZWVCcmFuY2hUcmFjazoke19lbmFibGVkfWApOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIF9jaGF0UmVzb3VyY2U6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudE9wdGlvbnMgPSBvcHRpb25zO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgY3JlYXRlT3B0aW9uczogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zID0ge1xuXHRcdFx0bW9kZWxJZDogJ2dwdC00bycsXG5cdFx0XHRtb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRwZXJtaXNzaW9uTGV2ZWw6ICdhbGxvd2VkVG9vbHMnLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdHdvcmt0cmVlQnJhbmNoVHJhY2s6IGZhbHNlLFxuXHRcdFx0YnJhbmNoOiAnbWFpbicsXG5cdFx0fTtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScsIHRpdGxlOiAnUHVsbCBSZXF1ZXN0JywgaGlkZUZyb21UcmFuc2NyaXB0OiB0cnVlIH0sIGNyZWF0ZU9wdGlvbnMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uSWQ6IHJlc3VsdD8uc2Vzc2lvbklkLFxuXHRcdFx0Y2FsbHMsXG5cdFx0XHRzZW50T3B0aW9ucyxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRjYWxsczogW1xuXHRcdFx0XHQnc2V0TW9kZWw6Z3B0LTRvJyxcblx0XHRcdFx0J3NldE1vZGU6YWdlbnQnLFxuXHRcdFx0XHQnc2V0UGVybWlzc2lvbkxldmVsOmFsbG93ZWRUb29scycsXG5cdFx0XHRcdCdzZXRJc29sYXRpb25Nb2RlOndvcmt0cmVlJyxcblx0XHRcdFx0J3NldFdvcmt0cmVlQnJhbmNoVHJhY2s6ZmFsc2UnLFxuXHRcdFx0XHQnc2V0QnJhbmNoOm1haW4nLFxuXHRcdFx0XSxcblx0XHRcdHNlbnRPcHRpb25zOiB7IHF1ZXJ5OiAnaGknLCB0aXRsZTogJ1B1bGwgUmVxdWVzdCcsIGhpZGVGcm9tVHJhbnNjcmlwdDogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcHJlZmVycyBhdG9taWMgd29ya3RyZWUgY29uZmlndXJhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gW107IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldFdvcmt0cmVlQ29uZmlndXJhdGlvbihfc2Vzc2lvbklkOiBzdHJpbmcsIGNvbmZpZ3VyYXRpb246IElTZXNzaW9uV29ya3RyZWVDb25maWd1cmF0aW9uKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goYHNldFdvcmt0cmVlQ29uZmlndXJhdGlvbjoke0pTT04uc3RyaW5naWZ5KGNvbmZpZ3VyYXRpb24pfWApO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2V0SXNvbGF0aW9uTW9kZSgpOiBQcm9taXNlPHZvaWQ+IHsgY2FsbHMucHVzaCgnc2V0SXNvbGF0aW9uTW9kZScpOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrKCk6IFByb21pc2U8dm9pZD4geyBjYWxscy5wdXNoKCdzZXRXb3JrdHJlZUJyYW5jaFRyYWNrJyk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldEJyYW5jaCgpOiBQcm9taXNlPHZvaWQ+IHsgY2FsbHMucHVzaCgnc2V0QnJhbmNoJyk7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSwgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgc2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLCB7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHR3b3JrdHJlZUJyYW5jaFRyYWNrOiB0cnVlLFxuXHRcdFx0YnJhbmNoOiAnZmVhdHVyZScsXG5cdFx0XHRvblNlc3Npb25DcmVhdGVkOiBjcmVhdGVkID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaChgY3JlYXRlZDoke2NyZWF0ZWQuc2Vzc2lvbklkfToke3NlcnZpY2UuZ2V0U2Vzc2lvbihjcmVhdGVkLnJlc291cmNlKT8uc2Vzc2lvbklkfWApO1xuXHRcdFx0XHR2b2lkIHZpZXcub3BlblNlc3Npb24oY3JlYXRlZC5yZXNvdXJjZSk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjYWxscyxcblx0XHRcdGFjdGl2ZVNlc3Npb246IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdH0sIHtcblx0XHRcdGNhbGxzOiBbXG5cdFx0XHRcdCdjcmVhdGVkOnMxOnMxJyxcblx0XHRcdFx0J3NldFdvcmt0cmVlQ29uZmlndXJhdGlvbjp7XCJpc29sYXRpb25Nb2RlXCI6XCJ3b3JrdHJlZVwiLFwid29ya3RyZWVCcmFuY2hUcmFja1wiOnRydWUsXCJicmFuY2hcIjpcImZlYXR1cmVcIn0nLFxuXHRcdFx0XSxcblx0XHRcdGFjdGl2ZVNlc3Npb246ICdzMScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBza2lwcyBwcm92aWRlcnMgd2l0aG91dCB3b3JrdHJlZSBjb25maWd1cmF0aW9uIHN1cHBvcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2xvdWRTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdjbG91ZCcsIHByb3ZpZGVySWQ6ICdjbG91ZCcgfSk7XG5cdFx0Y29uc3QgbG9jYWxTZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdsb2NhbCcsIHByb3ZpZGVySWQ6ICdsb2NhbCcgfSk7XG5cdFx0Y29uc3QgY2xvdWRQcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2Nsb3VkJztcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gMDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBpZDogJ2Nsb3VkJywgbGFiZWw6ICdDbG91ZCcsIGljb246IENvZGljb24uY2xvdWQsIHN1cHBvcnRzV29ya3RyZWVDb25maWd1cmF0aW9uOiBmYWxzZSwgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5Ob25lIH1dO1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdH0oY2xvdWRTZXNzaW9uKTtcblx0XHRsZXQgY29uZmlndXJlZEJyYW5jaDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdsb2NhbCc7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvcmRlciA9IDE7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUNvbmZpZ3VyYXRpb24oX3Nlc3Npb25JZDogc3RyaW5nLCBjb25maWd1cmF0aW9uOiBJU2Vzc2lvbldvcmt0cmVlQ29uZmlndXJhdGlvbik6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjb25maWd1cmVkQnJhbmNoID0gY29uZmlndXJhdGlvbi5icmFuY2g7XG5cdFx0XHR9XG5cdFx0fShsb2NhbFNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShsb2NhbFNlc3Npb24sIGRpc3Bvc2FibGVzLCBbY2xvdWRQcm92aWRlciwgbG9jYWxQcm92aWRlcl0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLCB7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdGlzb2xhdGlvbk1vZGU6ICd3b3JrdHJlZScsXG5cdFx0XHR3b3JrdHJlZUJyYW5jaFRyYWNrOiB0cnVlLFxuXHRcdFx0YnJhbmNoOiAnZmVhdHVyZScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVySWQ6IHJlc3VsdD8ucHJvdmlkZXJJZCxcblx0XHRcdGNvbmZpZ3VyZWRCcmFuY2gsXG5cdFx0fSwge1xuXHRcdFx0cHJvdmlkZXJJZDogJ2xvY2FsJyxcblx0XHRcdGNvbmZpZ3VyZWRCcmFuY2g6ICdmZWF0dXJlJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IHVzZXMgYW4gaW1tZWRpYXRlbHkgcmVzb2x2ZWQgbW9kZWwgaWRlbnRpZmllcicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCByZXNvbHZlZE1vZGVsOiBJTGFuZ3VhZ2VNb2RlbENoYXRNZXRhZGF0YUFuZElkZW50aWZpZXIgPSB7XG5cdFx0XHRpZGVudGlmaWVyOiAndGFyZ2V0OmdwdC00bycsXG5cdFx0XHRtZXRhZGF0YToge1xuXHRcdFx0XHRleHRlbnNpb246IG51bGxFeHRlbnNpb25EZXNjcmlwdGlvbi5pZGVudGlmaWVyLFxuXHRcdFx0XHRuYW1lOiAnR1BULTRvJyxcblx0XHRcdFx0dmVuZG9yOiAndGFyZ2V0Jyxcblx0XHRcdFx0ZmFtaWx5OiAnZ3B0LTRvJyxcblx0XHRcdFx0dmVyc2lvbjogJzEnLFxuXHRcdFx0XHRpZDogJ2dwdC00bycsXG5cdFx0XHRcdG1heElucHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdG1heE91dHB1dFRva2VuczogMTAwLFxuXHRcdFx0XHRpc0RlZmF1bHRGb3JMb2NhdGlvbjoge30sXG5cdFx0XHR9LFxuXHRcdH07XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBbcmVzb2x2ZWRNb2RlbF0sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ2F2YWlsYWJsZScsIG1vZGVsOiByZXNvbHZlZE1vZGVsIH0sIG1vZGVsVGFyZ2V0OiAndGFyZ2V0JyB9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgc2V0TW9kZWwoX3Nlc3Npb25JZDogc3RyaW5nLCBtb2RlbElkOiBzdHJpbmcpOiB2b2lkIHsgY2FsbHMucHVzaChgc2V0TW9kZWw6JHttb2RlbElkfWApOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdCgpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ3NlbmQnKTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdsZWdhY3kvZ3B0LTRvJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnc2V0TW9kZWw6dGFyZ2V0OmdwdC00bycsICdzZW5kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3Qgd2FpdHMgZm9yIGFuZCB1c2VzIHRoZSByZXNvbHZlZCBtb2RlbCBpZGVudGlmaWVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCByZXNvbHV0aW9uOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90WydkZXNpcmVkTW9kZWxSZXNvbHV0aW9uJ10gPSB7IGtpbmQ6ICdwZW5kaW5nJywgaWRlbnRpZmllcjogJ3RhcmdldDpncHQtNG8nIH07XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgbW9kZWw6IElMYW5ndWFnZU1vZGVsQ2hhdE1ldGFkYXRhQW5kSWRlbnRpZmllciA9IHtcblx0XHRcdGlkZW50aWZpZXI6ICd0YXJnZXQ6Z3B0LTRvJyxcblx0XHRcdG1ldGFkYXRhOiB7XG5cdFx0XHRcdGV4dGVuc2lvbjogbnVsbEV4dGVuc2lvbkRlc2NyaXB0aW9uLmlkZW50aWZpZXIsXG5cdFx0XHRcdG5hbWU6ICdHUFQtNG8nLFxuXHRcdFx0XHR2ZW5kb3I6ICd0YXJnZXQnLFxuXHRcdFx0XHRmYW1pbHk6ICdncHQtNG8nLFxuXHRcdFx0XHR2ZXJzaW9uOiAnMScsXG5cdFx0XHRcdGlkOiAnZ3B0LTRvJyxcblx0XHRcdFx0bWF4SW5wdXRUb2tlbnM6IDEwMCxcblx0XHRcdFx0bWF4T3V0cHV0VG9rZW5zOiAxMDAsXG5cdFx0XHRcdGlzRGVmYXVsdEZvckxvY2F0aW9uOiB7fSxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlTW9kZWxzID0gb25EaWRDaGFuZ2VNb2RlbHMuZXZlbnQ7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmkgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHsgcmV0dXJuIHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogcmVzb2x1dGlvbiwgbW9kZWxUYXJnZXQ6IHVuZGVmaW5lZCB9OyB9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbChfc2Vzc2lvbklkOiBzdHJpbmcsIG1vZGVsSWQ6IHN0cmluZyk6IHZvaWQgeyBjYWxscy5wdXNoKGBzZXRNb2RlbDoke21vZGVsSWR9YCk7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdsZWdhY3kvZ3B0LTRvJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbXSk7XG5cblx0XHRyZXNvbHV0aW9uID0geyBraW5kOiAnYXZhaWxhYmxlJywgbW9kZWwgfTtcblx0XHRvbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cdFx0YXdhaXQgcmVxdWVzdDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnc2V0TW9kZWw6dGFyZ2V0OmdwdC00bycsICdzZW5kJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmVqZWN0cyBhIHBlbmRpbmcgbW9kZWwgdGhhdCBiZWNvbWVzIHVuYXZhaWxhYmxlIGFuZCBkaXNwb3NlcyB0aGUgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VNb2RlbHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IHJlc29sdXRpb246IElTZXNzaW9uTW9kZWxzU25hcHNob3RbJ2Rlc2lyZWRNb2RlbFJlc29sdXRpb24nXSA9IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1tb2RlbCcgfTtcblx0XHRsZXQgZGVsZXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VNb2RlbHMgPSBvbkRpZENoYW5nZU1vZGVscy5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldE1vZGVsc1NuYXBzaG90KCk6IElTZXNzaW9uTW9kZWxzU25hcHNob3Qge1xuXHRcdFx0XHRyZXR1cm4geyBtb2RlbHM6IFtdLCBkZXNpcmVkTW9kZWxSZXNvbHV0aW9uOiByZXNvbHV0aW9uLCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbCgpOiBuZXZlciB7IHRocm93IG5ldyBFcnJvcignc2V0TW9kZWwgc2hvdWxkIG5vdCBiZSBjYWxsZWQnKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHsgZGVsZXRlZCA9IHRydWU7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7IG1vZGVsSWQ6ICdyZW1vdmVkLW1vZGVsJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRyZXNvbHV0aW9uID0geyBraW5kOiAndW5hdmFpbGFibGUnLCBpZGVudGlmaWVyOiAncmVtb3ZlZC1tb2RlbCcgfTtcblx0XHRvbkRpZENoYW5nZU1vZGVscy5maXJlKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhyZXF1ZXN0LCAvTW9kZWwgJ3JlbW92ZWQtbW9kZWwnIGlzIHVuYXZhaWxhYmxlLyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmVqZWN0cyB3aGVuIHRoZSB3b3Jrc3BhY2Ugc3RvcHMgYWR2ZXJ0aXNpbmcgdGhlIHNlc3Npb24gdHlwZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3Qgb25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdFx0bGV0IGZvbGRlclR5cGVBdmFpbGFibGUgPSB0cnVlO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IG9uRGlkQ2hhbmdlU2Vzc2lvblR5cGVzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IHVyaTogZm9sZGVyVXJpIH0gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25UeXBlcyhjYW5kaWRhdGU6IFVSSSk6IElTZXNzaW9uVHlwZVtdIHtcblx0XHRcdFx0cmV0dXJuIGZvbGRlclR5cGVBdmFpbGFibGUgJiYgZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UuaXNFcXVhbChjYW5kaWRhdGUsIGZvbGRlclVyaSkgPyBbLi4udGhpcy5zZXNzaW9uVHlwZXNdIDogW107XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBnZXRNb2RlbHNTbmFwc2hvdCgpOiBJU2Vzc2lvbk1vZGVsc1NuYXBzaG90IHtcblx0XHRcdFx0cmV0dXJuIHsgbW9kZWxzOiBbXSwgZGVzaXJlZE1vZGVsUmVzb2x1dGlvbjogeyBraW5kOiAncGVuZGluZycsIGlkZW50aWZpZXI6ICdncHQtNG8nIH0sIG1vZGVsVGFyZ2V0OiB1bmRlZmluZWQgfTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oKTogdm9pZCB7IGRlbGV0ZWQgPSB0cnVlOyB9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXJVcmksIHsgcXVlcnk6ICdoaScgfSwgeyBtb2RlbElkOiAnZ3B0LTRvJyB9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRmb2xkZXJUeXBlQXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0b25EaWRDaGFuZ2VTZXNzaW9uVHlwZXMuZmlyZSgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdCwgL1Nlc3Npb24gdHlwZSAndGVzdCcgaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZS8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IGNhbmNlbHMgd2hpbGUgd2FpdGluZyBmb3IgbW9kZWwgcmVzb2x1dGlvbiBhbmQgZGlzcG9zZXMgdGhlIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkQ2hhbmdlTW9kZWxzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZU1vZGVscyA9IG9uRGlkQ2hhbmdlTW9kZWxzLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0TW9kZWxzU25hcHNob3QoKTogSVNlc3Npb25Nb2RlbHNTbmFwc2hvdCB7XG5cdFx0XHRcdHJldHVybiB7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ3BlbmRpbmcnLCBpZGVudGlmaWVyOiAnZ3B0LTRvJyB9LCBtb2RlbFRhcmdldDogdW5kZWZpbmVkIH07XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKCk6IHZvaWQgeyBkZWxldGVkID0gdHJ1ZTsgfVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgeyBtb2RlbElkOiAnZ3B0LTRvJyB9LCBjdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0IGF3YWl0cyBhc3luY2hyb25vdXMgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIHNldHRlcnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGlzb2xhdGlvbkRvbmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgYnJhbmNoVHJhY2tTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGJyYW5jaFRyYWNrRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBicmFuY2hTdGFydGVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IGJyYW5jaERvbmUgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0Y29uc3QgY2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRJc29sYXRpb25Nb2RlKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdpc29sYXRpb246c3RhcnQnKTtcblx0XHRcdFx0YXdhaXQgaXNvbGF0aW9uRG9uZS5wO1xuXHRcdFx0XHRjYWxscy5wdXNoKCdpc29sYXRpb246ZW5kJyk7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZXRXb3JrdHJlZUJyYW5jaFRyYWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdicmFuY2hUcmFjazpzdGFydCcpO1xuXHRcdFx0XHRhd2FpdCBicmFuY2hUcmFja1N0YXJ0ZWQuY29tcGxldGUoKTtcblx0XHRcdFx0YXdhaXQgYnJhbmNoVHJhY2tEb25lLnA7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ2JyYW5jaFRyYWNrOmVuZCcpO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2V0QnJhbmNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKCdicmFuY2g6c3RhcnQnKTtcblx0XHRcdFx0YXdhaXQgYnJhbmNoU3RhcnRlZC5jb21wbGV0ZSgpO1xuXHRcdFx0XHRhd2FpdCBicmFuY2hEb25lLnA7XG5cdFx0XHRcdGNhbGxzLnB1c2goJ2JyYW5jaDplbmQnKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCgnc2VuZCcpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Y29uc3QgcmVxdWVzdCA9IHNlcnZpY2UuY3JlYXRlQW5kU2VuZE5ld0NoYXRSZXF1ZXN0KFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSwgeyBxdWVyeTogJ2hpJyB9LCB7XG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3RyZWUnLFxuXHRcdFx0d29ya3RyZWVCcmFuY2hUcmFjazogZmFsc2UsXG5cdFx0XHRicmFuY2g6ICdtYWluJyxcblx0XHR9KTtcblx0XHRhd2FpdCBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2lzb2xhdGlvbjpzdGFydCddKTtcblxuXHRcdGF3YWl0IGlzb2xhdGlvbkRvbmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCBicmFuY2hUcmFja1N0YXJ0ZWQucDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbJ2lzb2xhdGlvbjpzdGFydCcsICdpc29sYXRpb246ZW5kJywgJ2JyYW5jaFRyYWNrOnN0YXJ0J10pO1xuXG5cdFx0YXdhaXQgYnJhbmNoVHJhY2tEb25lLmNvbXBsZXRlKCk7XG5cdFx0YXdhaXQgYnJhbmNoU3RhcnRlZC5wO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnaXNvbGF0aW9uOnN0YXJ0JywgJ2lzb2xhdGlvbjplbmQnLCAnYnJhbmNoVHJhY2s6c3RhcnQnLCAnYnJhbmNoVHJhY2s6ZW5kJywgJ2JyYW5jaDpzdGFydCddKTtcblxuXHRcdGF3YWl0IGJyYW5jaERvbmUuY29tcGxldGUoKTtcblx0XHRhd2FpdCByZXF1ZXN0O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2FsbHMsIFsnaXNvbGF0aW9uOnN0YXJ0JywgJ2lzb2xhdGlvbjplbmQnLCAnYnJhbmNoVHJhY2s6c3RhcnQnLCAnYnJhbmNoVHJhY2s6ZW5kJywgJ2JyYW5jaDpzdGFydCcsICdicmFuY2g6ZW5kJywgJ3NlbmQnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBjYW5jZWxzIHBlbmRpbmcgcmVwb3NpdG9yeSBjb25maWd1cmF0aW9uIGFuZCBkaXNwb3NlcyB0aGUgZHJhZnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbmZpZ3VyYXRpb25Eb25lID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0bGV0IHNlbnQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNldElzb2xhdGlvbk1vZGUoKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdGF3YWl0IGNvbmZpZ3VyYXRpb25Eb25lLnA7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKCk6IHZvaWQge1xuXHRcdFx0XHRkZWxldGVkID0gdHJ1ZTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwge1xuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdGJyYW5jaDogJ21haW4nLFxuXHRcdH0sIGN0cy50b2tlbik7XG5cdFx0YXdhaXQgUHJvbWlzZS5yZXNvbHZlKCk7XG5cdFx0Y3RzLmNhbmNlbCgpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMocmVxdWVzdCwgL0NhbmNlbGVkLyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGRlbGV0ZWQsIHNlbnQgfSwgeyBkZWxldGVkOiB0cnVlLCBzZW50OiBmYWxzZSB9KTtcblx0XHRhd2FpdCBjb25maWd1cmF0aW9uRG9uZS5jb21wbGV0ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgY2FuY2VscyBhIHBlbmRpbmcgc2VuZCBhbmQgZGlzcG9zZXMgdGhlIGRyYWZ0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZW5kRG9uZSA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRsZXQgZGVsZXRlZCA9IGZhbHNlO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVzb2x2ZVdvcmtzcGFjZSgpOiBJU2Vzc2lvbldvcmtzcGFjZSB7IHJldHVybiB7IGZvbGRlclVyaTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpIH0gYXMgdW5rbm93biBhcyBJU2Vzc2lvbldvcmtzcGFjZTsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHtcblx0XHRcdFx0ZGVsZXRlZCA9IHRydWU7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdCgpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdGF3YWl0IHNlbmREb25lLnA7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0Y29uc3QgY3RzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBDYW5jZWxsYXRpb25Ub2tlblNvdXJjZSgpKTtcblxuXHRcdGNvbnN0IHJlcXVlc3QgPSBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgdW5kZWZpbmVkLCBjdHMudG9rZW4pO1xuXHRcdGF3YWl0IFByb21pc2UucmVzb2x2ZSgpO1xuXHRcdGN0cy5jYW5jZWwoKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHJlcXVlc3QsIC9DYW5jZWxlZC8pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZWxldGVkLCB0cnVlKTtcblx0XHRhd2FpdCBzZW5kRG9uZS5jb21wbGV0ZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmVqZWN0cyB3b3JrdHJlZSBjb25maWd1cmF0aW9uIGZvciB1bnN1cHBvcnRlZCBzZXNzaW9uIHR5cGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRsZXQgY3JlYXRlZCA9IGZhbHNlO1xuXHRcdGxldCBzZW50ID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uVHlwZXM6IHJlYWRvbmx5IElTZXNzaW9uVHlwZVtdID0gW3sgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAndGVzdCcsIGxhYmVsOiAnVGVzdCcsIGljb246IENvZGljb24udm0gfV07XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0XHRcdFx0Y3JlYXRlZCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3QoKTogUHJvbWlzZTxJU2Vzc2lvbj4ge1xuXHRcdFx0XHRzZW50ID0gdHJ1ZTtcblx0XHRcdFx0cmV0dXJuIHNlc3Npb247XG5cdFx0XHR9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKFxuXHRcdFx0KCkgPT4gc2VydmljZS5jcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QoVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpLCB7IHF1ZXJ5OiAnaGknIH0sIHtcblx0XHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmt0cmVlJyxcblx0XHRcdFx0YnJhbmNoOiAnbGVnYWN5LWJyYW5jaCcsXG5cdFx0XHR9KSxcblx0XHRcdC9ObyBzZXNzaW9ucyBwcm92aWRlciBzdXBwb3J0cyB3b3JrdHJlZSBjb25maWd1cmF0aW9uLyxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGNyZWF0ZWQsIHNlbnQgfSwgeyBjcmVhdGVkOiBmYWxzZSwgc2VudDogZmFsc2UgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdCBwZXJtaXRzIGZvbGRlciBpc29sYXRpb24gZm9yIHVuc3VwcG9ydGVkIHdvcmt0cmVlIHNlc3Npb24gdHlwZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0bGV0IHNlbnQgPSBmYWxzZTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICd0ZXN0JywgbGFiZWw6ICdUZXN0JywgaWNvbjogQ29kaWNvbi52bSB9XTtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KCk6IFByb21pc2U8SVNlc3Npb24+IHtcblx0XHRcdFx0c2VudCA9IHRydWU7XG5cdFx0XHRcdHJldHVybiBzZXNzaW9uO1xuXHRcdFx0fVxuXHRcdH0oc2Vzc2lvbik7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwge1xuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcHJvdmlkZXJJZDogcmVzdWx0Py5wcm92aWRlcklkLCBzZW50IH0sIHsgcHJvdmlkZXJJZDogJ3Rlc3QnLCBzZW50OiB0cnVlIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgZGlzcG9zZXMgc3RyYW5kZWQgZHJhZnQgd2hlbiBhIHNldHRlciB0aHJvd3MnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2NoYXQnKSB9O1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRzZXNzaW9uSWQ6ICdzMScsXG5cdFx0XHRwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlKGNoYXQpLFxuXHRcdH0pO1xuXHRcdGxldCBkZWxldGVkID0gZmFsc2U7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBzZXRNb2RlbCgpOiB2b2lkIHsgdGhyb3cgbmV3IEVycm9yKCdtb2RlbCBub3QgZm91bmQnKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbigpOiB2b2lkIHsgZGVsZXRlZCA9IHRydWU7IH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIHNlbmRSZXF1ZXN0KF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24+IHsgcmV0dXJuIHNlc3Npb247IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoXG5cdFx0XHQoKSA9PiBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSwgeyBtb2RlbElkOiAnYmFkJyB9KSxcblx0XHRcdC9tb2RlbCBub3QgZm91bmQvLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRlbGV0ZWQsIHRydWUpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVBbmRTZW5kTmV3Q2hhdFJlcXVlc3QgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBzZXJ2aWNlIGlzIGRpc3Bvc2VkIG1pZC1zZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBzZXJ2aWNlUmVmOiB7IGN1cnJlbnQ/OiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB9ID0ge307XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kUmVxdWVzdChfc2Vzc2lvbklkOiBzdHJpbmcsIF9jaGF0UmVzb3VyY2U6IFVSSSwgX29wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnMpOiBQcm9taXNlPElTZXNzaW9uPiB7XG5cdFx0XHRcdC8vIERpc3Bvc2UgdGhlIHNlcnZpY2Ugd2hpbGUgdGhlIHNlbmQgaXMgaW4tZmxpZ2h0LlxuXHRcdFx0XHQoc2VydmljZVJlZi5jdXJyZW50IGFzIHVua25vd24gYXMgeyBkaXNwb3NlKCk6IHZvaWQgfSkuZGlzcG9zZSgpO1xuXHRcdFx0XHRyZXR1cm4gc2Vzc2lvbjtcblx0XHRcdH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXHRcdHNlcnZpY2VSZWYuY3VycmVudCA9IHNlcnZpY2U7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyksIHsgcXVlcnk6ICdoaScgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY2FyZE5ld1Nlc3Npb24gZmlyZXMgb25EaWREaXNjYXJkTmV3U2Vzc2lvbiB3aXRoIHRoZSBkaXNjYXJkZWQgZHJhZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnczEnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0fShzZXNzaW9uKTtcblx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdGNvbnN0IGRpc2NhcmRlZDogc3RyaW5nW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZERpc2NhcmROZXdTZXNzaW9uKHMgPT4gZGlzY2FyZGVkLnB1c2gocy5zZXNzaW9uSWQpKSk7XG5cblx0XHQvLyBFc3RhYmxpc2ggYSBwZW5kaW5nIGRyYWZ0LCB0aGVuIGFiYW5kb24gaXQuXG5cdFx0c2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSk7XG5cdFx0c2VydmljZS5kaXNjYXJkTmV3U2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkaXNjYXJkZWQsIFsnczEnXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZU5ld1Nlc3Npb24gZmlyZXMgcmVwbGFjZW1lbnQgYmVmb3JlIHB1Ymxpc2hpbmcgdGhlIG5ldyBkcmFmdCcsICgpID0+IHtcblx0XHRjb25zdCBkcmFmdHMgPSBbXG5cdFx0XHRzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pLFxuXHRcdFx0c3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGNyZWF0ZUluZGV4ID0gMDtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZU5ld1Nlc3Npb24oKTogSVNlc3Npb24geyByZXR1cm4gZHJhZnRzW2NyZWF0ZUluZGV4KytdOyB9XG5cdFx0XHRvdmVycmlkZSBkZWxldGVOZXdTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nKTogdm9pZCB7IGRlbGV0ZWQucHVzaChzZXNzaW9uSWQpOyB9XG5cdFx0fShkcmFmdHNbMF0pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShkcmFmdHNbMF0sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRjb25zdCByZXBsYWNlbWVudHM6IHsgZnJvbTogc3RyaW5nOyB0bzogc3RyaW5nOyBjdXJyZW50RHJhZnQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZFJlcGxhY2VOZXdEcmFmdFNlc3Npb24oKHsgZnJvbSwgdG8gfSkgPT4ge1xuXHRcdFx0cmVwbGFjZW1lbnRzLnB1c2goeyBmcm9tOiBmcm9tLnNlc3Npb25JZCwgdG86IHRvLnNlc3Npb25JZCwgY3VycmVudERyYWZ0OiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCB9KTtcblx0XHR9KSk7XG5cblx0XHRzZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpKTtcblx0XHRzZXJ2aWNlLmNyZWF0ZU5ld1Nlc3Npb24oVVJJLnBhcnNlKCd0ZXN0Oi8vL2ZvbGRlcicpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVwbGFjZW1lbnRzLFxuXHRcdFx0ZGVsZXRlZCxcblx0XHRcdGN1cnJlbnREcmFmdDogc2VydmljZS5uZXdTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0fSwge1xuXHRcdFx0cmVwbGFjZW1lbnRzOiBbeyBmcm9tOiAnczEnLCB0bzogJ3MyJywgY3VycmVudERyYWZ0OiAnczEnIH1dLFxuXHRcdFx0ZGVsZXRlZDogWydzMSddLFxuXHRcdFx0Y3VycmVudERyYWZ0OiAnczInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVOZXdTZXNzaW9uIGtlZXBzIHRoZSBwcmV2aW91cyBkcmFmdCB3aGVuIHJlcGxhY2VtZW50IGNyZWF0aW9uIGZhaWxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRyYWZ0ID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRsZXQgY3JlYXRlQ291bnQgPSAwO1xuXHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHsgcmV0dXJuIHsgZm9sZGVyVXJpOiBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykgfSBhcyB1bmtub3duIGFzIElTZXNzaW9uV29ya3NwYWNlOyB9XG5cdFx0XHRvdmVycmlkZSBjcmVhdGVOZXdTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0XHRcdFx0aWYgKGNyZWF0ZUNvdW50KysgPiAwKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjcmVhdGUgZmFpbGVkJyk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIGRyYWZ0O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgZGVsZXRlTmV3U2Vzc2lvbihzZXNzaW9uSWQ6IHN0cmluZyk6IHZvaWQgeyBkZWxldGVkLnB1c2goc2Vzc2lvbklkKTsgfVxuXHRcdH0oZHJhZnQpO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShkcmFmdCwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblx0XHRjb25zdCByZXBsYWNlbWVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uKCh7IGZyb20sIHRvIH0pID0+IHJlcGxhY2VtZW50cy5wdXNoKGAke2Zyb20uc2Vzc2lvbklkfS0+JHt0by5zZXNzaW9uSWR9YCkpKTtcblxuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJykpO1xuXHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSksIC9jcmVhdGUgZmFpbGVkLyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGN1cnJlbnREcmFmdDogc2VydmljZS5uZXdTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0XHRyZXBsYWNlbWVudHMsXG5cdFx0XHRkZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdGN1cnJlbnREcmFmdDogJ3MxJyxcblx0XHRcdHJlcGxhY2VtZW50czogW10sXG5cdFx0XHRkZWxldGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYXV0b21hdGlvbiBkcmFmdCBsaWZlY3ljbGUgaXMgaXNvbGF0ZWQgZnJvbSB0aGUgbmV3LXNlc3Npb24gZHJhZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnRzID0gW1xuXHRcdFx0c3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhdXRvbWF0aW9uLXdvcmtzcGFjZScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KSxcblx0XHRcdHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnbmV3LXNlc3Npb24nLCBwcm92aWRlcklkOiAndGVzdCcgfSksXG5cdFx0XHRzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2F1dG9tYXRpb24tcXVpY2stY2hhdCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KSxcblx0XHRcdHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYXV0b21hdGlvbi1yZXBsYWNlbWVudCcsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KSxcblx0XHRdO1xuXHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGNyZWF0ZUluZGV4ID0gMDtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN1cHBvcnRzUXVpY2tDaGF0cyA9IHRydWU7XG5cdFx0XHRvdmVycmlkZSByZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaTogVVJJKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdHVyaTogZm9sZGVyVXJpLFxuXHRcdFx0XHRcdGxhYmVsOiAnV29ya3NwYWNlJyxcblx0XHRcdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0XHRmb2xkZXJzOiBbXSxcblx0XHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdFx0b3ZlcnJpZGUgY3JlYXRlTmV3U2Vzc2lvbigpOiBJU2Vzc2lvbiB7IHJldHVybiBkcmFmdHNbY3JlYXRlSW5kZXgrK107IH1cblx0XHRcdG92ZXJyaWRlIGNyZWF0ZVF1aWNrQ2hhdCgpOiBJU2Vzc2lvbiB7IHJldHVybiBkcmFmdHNbY3JlYXRlSW5kZXgrK107IH1cblx0XHRcdG92ZXJyaWRlIGRlbGV0ZU5ld1Nlc3Npb24oc2Vzc2lvbklkOiBzdHJpbmcpOiB2b2lkIHsgZGVsZXRlZC5wdXNoKHNlc3Npb25JZCk7IH1cblx0XHR9KGRyYWZ0c1swXSk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRyYWZ0c1swXSwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkucGFyc2UoJ3Rlc3Q6Ly8vZm9sZGVyJyk7XG5cblx0XHRjb25zdCBmaXJzdEF1dG9tYXRpb25TZXNzaW9uID0gc2VydmljZS5jcmVhdGVBdXRvbWF0aW9uU2Vzc2lvbihmb2xkZXJVcmkpO1xuXHRcdHNlcnZpY2UuY3JlYXRlTmV3U2Vzc2lvbihmb2xkZXJVcmkpO1xuXHRcdHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvblF1aWNrQ2hhdCgpO1xuXHRcdHNlcnZpY2UuZGlzY2FyZEF1dG9tYXRpb25TZXNzaW9uKGZpcnN0QXV0b21hdGlvblNlc3Npb24pO1xuXHRcdHNlcnZpY2UuY3JlYXRlQXV0b21hdGlvblNlc3Npb24oZm9sZGVyVXJpKTtcblx0XHRzZXJ2aWNlLmRpc2NhcmRBdXRvbWF0aW9uU2Vzc2lvbigpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRuZXdTZXNzaW9uOiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHRcdGF1dG9tYXRpb25TZXNzaW9uOiBzZXJ2aWNlLmF1dG9tYXRpb25TZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsXG5cdFx0XHRkZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdG5ld1Nlc3Npb246ICduZXctc2Vzc2lvbicsXG5cdFx0XHRhdXRvbWF0aW9uU2Vzc2lvbjogdW5kZWZpbmVkLFxuXHRcdFx0ZGVsZXRlZDogWydhdXRvbWF0aW9uLXdvcmtzcGFjZScsICdhdXRvbWF0aW9uLXF1aWNrLWNoYXQnLCAnYXV0b21hdGlvbi1yZXBsYWNlbWVudCddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kTmV3Q2hhdFJlcXVlc3QgY2xlYXJzIHRoZSBkcmFmdCB3aXRob3V0IGZpcmluZyBvbkRpZERpc2NhcmROZXdTZXNzaW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jaGF0JykgfTtcblx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0c2Vzc2lvbklkOiAnczEnLFxuXHRcdFx0cHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbY2hhdF0pLFxuXHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0XHR9KTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlc29sdmVXb3Jrc3BhY2UoKTogSVNlc3Npb25Xb3Jrc3BhY2UgeyByZXR1cm4geyBmb2xkZXJVcmk6IFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSB9IGFzIHVua25vd24gYXMgSVNlc3Npb25Xb3Jrc3BhY2U7IH1cblx0XHR9KHNlc3Npb24pO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0bGV0IGRpc2NhcmRDb3VudCA9IDA7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHNlcnZpY2Uub25EaWREaXNjYXJkTmV3U2Vzc2lvbigoKSA9PiBkaXNjYXJkQ291bnQrKykpO1xuXG5cdFx0Ly8gU2VuZGluZyB0aGUgY29tcG9zZWQgZHJhZnQgZ3JhZHVhdGVzIGl0IGludG8gdGhlIGxpc3QgcmF0aGVyIHRoYW5cblx0XHQvLyBkaXNjYXJkaW5nIGl0LCBzbyB0aGUgZGlzY2FyZCBldmVudCBtdXN0IG5vdCBmaXJlLlxuXHRcdGNvbnN0IGRyYWZ0ID0gc2VydmljZS5jcmVhdGVOZXdTZXNzaW9uKFVSSS5wYXJzZSgndGVzdDovLy9mb2xkZXInKSk7XG5cdFx0YXdhaXQgc2VydmljZS5zZW5kTmV3Q2hhdFJlcXVlc3QoZHJhZnQsIHsgcXVlcnk6ICdoaScgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGlzY2FyZENvdW50LCAwKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsU2Vzc2lvblR5cGVzIG9yZGVycyBwcm92aWRlcnMgYnkgdGhlaXIgb3JkZXIgcHJvcGVydHkgKGxvd2VyIGZpcnN0KScsICgpID0+IHtcblx0XHRjb25zdCBzZXJ2aWNlID0gY3JlYXRlT3JkZXJlZFR5cGVzU2VydmljZShkaXNwb3NhYmxlcywgMCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXJ2aWNlLmdldEFsbFNlc3Npb25UeXBlcygpLm1hcCh0eXBlID0+IHR5cGUuaWQpLCBbJ2NvcGlsb3QnLCAnYWdlbnQtaG9zdCddKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWxsU2Vzc2lvblR5cGVzIHN1cmZhY2VzIGxvY2FsIGFnZW50IGhvc3QgdHlwZXMgZmlyc3Qgd2hlbiBpdCBoYXMgbG93ZXIgb3JkZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2VydmljZSA9IGNyZWF0ZU9yZGVyZWRUeXBlc1NlcnZpY2UoZGlzcG9zYWJsZXMsIDAsIC0xKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlcnZpY2UuZ2V0QWxsU2Vzc2lvblR5cGVzKCkubWFwKHR5cGUgPT4gdHlwZS5pZCksIFsnYWdlbnQtaG9zdCcsICdjb3BpbG90J10pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uIHByb21vdGVzIHRoZSBjb21taXR0ZWQgc2Vzc2lvbiB0byBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnQgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2RyYWZ0JywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnY29tbWl0dGVkJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IG9uRGlkUmVwbGFjZVNlc3Npb24uZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoZHJhZnQpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtkcmFmdCwgY29tbWl0dGVkXTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGRyYWZ0LCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0Ly8gT3BlbiB0aGUgZHJhZnQgc28gaXQgYmVjb21lcyB0aGUgYWN0aXZlIHNlc3Npb24uXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihkcmFmdC5yZXNvdXJjZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAnZHJhZnQnKTtcblxuXHRcdC8vIFRoZSBwcm92aWRlciBhdG9taWNhbGx5IHJlcGxhY2VzIHRoZSBkcmFmdCB3aXRoIGEgY29tbWl0dGVkIHNlc3Npb25cblx0XHQvLyAoZS5nLiBhZnRlciB0aGUgZmlyc3QgdHVybikuIFRoZSBjb21wbGV0ZSBmbG93IG11c3Q6IHN3YXAgdGhlIHZpc2libGVcblx0XHQvLyBncmlkIHNsb3QsIG1ha2UgdGhlIGNvbW1pdHRlZCBzZXNzaW9uIGFjdGl2ZSBpbiB0aGUgdmlldywgYW5kIHVwZGF0ZVxuXHRcdC8vIHRoZSBjYW5vbmljYWwgYWN0aXZlIHNlc3Npb24gaW4gdGhlIG1hbmFnZW1lbnQgc2VydmljZS5cblx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiBkcmFmdCwgdG86IGNvbW1pdHRlZCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dmlzaWJsZTogdmlldy52aXNpYmxlU2Vzc2lvbnMuZ2V0KCkubWFwKHMgPT4gcz8uc2Vzc2lvbklkID8/IG51bGwpLFxuXHRcdFx0YWN0aXZlOiB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCA/PyBudWxsLFxuXHRcdH0sIHtcblx0XHRcdHZpc2libGU6IFsnY29tbWl0dGVkJ10sXG5cdFx0XHRhY3RpdmU6ICdjb21taXR0ZWQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgdGhlIGFjdGl2ZSBzZXNzaW9uIGluIHBsYWNlIChzYW1lIGlkLCBuZXcgcmVzb3VyY2UpIHJlLXBvaW50cyB0aGUgYWN0aXZlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYmVmb3JlID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzYW1lJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2JlZm9yZScpIH0pO1xuXHRcdGNvbnN0IGFmdGVyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzYW1lJywgcHJvdmlkZXJJZDogJ3Rlc3QnLCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL2FmdGVyJykgfSk7XG5cdFx0Y29uc3Qgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uID0gb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihiZWZvcmUpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFtiZWZvcmVdOyB9XG5cdFx0fTtcblx0XHRjb25zdCB7IHZpZXcgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UoYmVmb3JlLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihiZWZvcmUucmVzb3VyY2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCksIGJlZm9yZS5yZXNvdXJjZS50b1N0cmluZygpKTtcblxuXHRcdC8vIEEgc2FtZS1pZCByZXBsYWNlbWVudCBzdGlsbCBuZWVkcyB0byBmb3JjZSB0aGUgYWN0aXZlIHNlc3Npb24gdXBkYXRlXG5cdFx0Ly8gc28gY29uc3VtZXJzIG9ic2VydmUgdGhlIG5ldyByZXNvdXJjZS5cblx0XHRvbkRpZFJlcGxhY2VTZXNzaW9uLmZpcmUoeyBmcm9tOiBiZWZvcmUsIHRvOiBhZnRlciB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnJlc291cmNlLnRvU3RyaW5nKCksIGFmdGVyLnJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgYSBub24tYWN0aXZlIHNlc3Npb24gbGVhdmVzIHRoZSBhY3RpdmUgc2Vzc2lvbiB1bmNoYW5nZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aXZlID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdhY3RpdmUnLCBwcm92aWRlcklkOiAndGVzdCcgfSk7XG5cdFx0Y29uc3QgZHJhZnQgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2RyYWZ0JywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnY29tbWl0dGVkJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8eyByZWFkb25seSBmcm9tOiBJU2Vzc2lvbjsgcmVhZG9ubHkgdG86IElTZXNzaW9uIH0+KCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlU2Vzc2lvbiA9IG9uRGlkUmVwbGFjZVNlc3Npb24uZXZlbnQ7XG5cdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoYWN0aXZlKTsgfVxuXHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbYWN0aXZlLCBkcmFmdCwgY29tbWl0dGVkXTsgfVxuXHRcdH07XG5cdFx0Y29uc3QgeyB2aWV3IH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKGFjdGl2ZSwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdC8vIE9wZW4gYGFjdGl2ZWAgYW5kIGFkZCBgZHJhZnRgIHRvIHRoZSBncmlkIGFsb25nc2lkZSBpdCB3aXRob3V0XG5cdFx0Ly8gYWN0aXZhdGluZywgc28gYGRyYWZ0YCBpcyB2aXNpYmxlIGJ1dCBub3QgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oYWN0aXZlLnJlc291cmNlKTtcblx0XHR2aWV3Lmluc2VydEF0KGRyYWZ0LCAnYWN0aXZlJywgJ3JpZ2h0JywgZmFsc2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCwgJ2FjdGl2ZScpO1xuXG5cdFx0Ly8gUmVwbGFjaW5nIHRoZSBub24tYWN0aXZlIGBkcmFmdGAgc3dhcHMgaXRzIGdyaWQgc2xvdCB0byBgY29tbWl0dGVkYFxuXHRcdC8vIGJ1dCBtdXN0IG5vdCBoaWphY2sgdGhlIGFjdGl2ZSBzZXNzaW9uLlxuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY29tbWl0dGVkIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRhY3RpdmU6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0fSwge1xuXHRcdFx0dmlzaWJsZTogWydhY3RpdmUnLCAnY29tbWl0dGVkJ10sXG5cdFx0XHRhY3RpdmU6ICdhY3RpdmUnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXBsYWNpbmcgYSBzZXNzaW9uIG9ubHkgc3dhcHMgdGhlIGFjdGl2ZSBzZXNzaW9uIHdoZW4gaXQgbWF0Y2hlcyBgZnJvbWAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgYSA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYScsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBiID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdiJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pO1xuXHRcdGNvbnN0IG90aGVyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdvdGhlcicsIHByb3ZpZGVySWQ6ICd0ZXN0JyB9KTtcblx0XHRjb25zdCBvbkRpZFJlcGxhY2VTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgZnJvbTogSVNlc3Npb247IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVwbGFjZVNlc3Npb24gPSBvbkRpZFJlcGxhY2VTZXNzaW9uLmV2ZW50O1xuXHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKGEpOyB9XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIFthLCBiLCBvdGhlcl07IH1cblx0XHR9O1xuXHRcdGNvbnN0IHsgdmlldyB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShhLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihhLnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdhJyk7XG5cblx0XHQvLyBgZnJvbWAgZG9lcyBub3QgbWF0Y2ggdGhlIGFjdGl2ZSBzZXNzaW9uOiBhY3RpdmUgc3RheXMgcHV0LlxuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IG90aGVyLCB0bzogYiB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpPy5zZXNzaW9uSWQsICdhJyk7XG5cblx0XHQvLyBgZnJvbWAgbWF0Y2hlcyB0aGUgYWN0aXZlIHNlc3Npb246IGFjdGl2ZSBpcyByZXBsYWNlZCB3aXRoIGB0b2AuXG5cdFx0b25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogYSwgdG86IGIgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLCAnYicpO1xuXHR9KTtcblxuXHRzdWl0ZSgnZGVsZXRlU2Vzc2lvbnMnLCAoKSA9PiB7XG5cblx0XHRjbGFzcyBSZWNvcmRpbmdQcm92aWRlciBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdHJlYWRvbmx5IGRlbGV0ZWQ6IHN0cmluZ1tdW10gPSBbXTtcblx0XHRcdGNvbnN0cnVjdG9yKHB1YmxpYyBvdmVycmlkZSByZWFkb25seSBpZDogc3RyaW5nLCBwcml2YXRlIHJlYWRvbmx5IF9mYWlsOiBib29sZWFuLCBzZXNzaW9uOiBJU2Vzc2lvbikge1xuXHRcdFx0XHRzdXBlcihzZXNzaW9uKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGRlbGV0ZVNlc3Npb25zKHNlc3Npb25JZHM6IHJlYWRvbmx5IHN0cmluZ1tdKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHRoaXMuZGVsZXRlZC5wdXNoKFsuLi5zZXNzaW9uSWRzXSk7XG5cdFx0XHRcdGlmICh0aGlzLl9mYWlsKSB7XG5cdFx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKGAke3RoaXMuaWR9IGZhaWxlZGApO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2VydmljZShwcm92aWRlcnM6IElTZXNzaW9uc1Byb3ZpZGVyW10pOiBJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSB7XG5cdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElMb2dTZXJ2aWNlLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShwcm92aWRlcnMpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldFNlcnZpY2UsIG5ldyBUZXN0Q2hhdFdpZGdldFNlcnZpY2UoKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRTdWJtaXRSZXF1ZXN0ID0gRXZlbnQuTm9uZTtcblx0XHRcdH0pO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFdpZGdldEhpc3RvcnlTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0SGlzdG9yeVNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSBtb3ZlSGlzdG9yeSgpOiB2b2lkIHsgfVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpKTtcblx0XHR9XG5cblx0XHR0ZXN0KCdncm91cHMgc2Vzc2lvbnMgYnkgcHJvdmlkZXIgYW5kIGNvbnRpbnVlcyB3aGVuIG9uZSBwcm92aWRlciBmYWlscyAoYmVzdC1lZmZvcnQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgczEgPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3MxJywgcHJvdmlkZXJJZDogJ3AxJyB9KTtcblx0XHRcdGNvbnN0IHMyID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzMicsIHByb3ZpZGVySWQ6ICdwMicgfSk7XG5cdFx0XHRjb25zdCBmYWlsaW5nID0gbmV3IFJlY29yZGluZ1Byb3ZpZGVyKCdwMScsIHRydWUsIHMxKTtcblx0XHRcdGNvbnN0IHN1Y2NlZWRpbmcgPSBuZXcgUmVjb3JkaW5nUHJvdmlkZXIoJ3AyJywgZmFsc2UsIHMyKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBjcmVhdGVTZXJ2aWNlKFtmYWlsaW5nLCBzdWNjZWVkaW5nXSk7XG5cblx0XHRcdGNvbnN0IGRlbGV0ZWQ6IHN0cmluZ1tdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQoc2VydmljZS5vbkRpZERlbGV0ZVNlc3Npb24oc2Vzc2lvbiA9PiBkZWxldGVkLnB1c2goc2Vzc2lvbi5zZXNzaW9uSWQpKSk7XG5cblx0XHRcdGF3YWl0IGFzc2VydC5yZWplY3RzKHNlcnZpY2UuZGVsZXRlU2Vzc2lvbnMoW3MxLCBzMl0pLCAvcDEgZmFpbGVkLyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmYWlsaW5nRGVsZXRlZDogZmFpbGluZy5kZWxldGVkLFxuXHRcdFx0XHRzdWNjZWVkaW5nRGVsZXRlZDogc3VjY2VlZGluZy5kZWxldGVkLFxuXHRcdFx0XHRldmVudHNGaXJlZDogZGVsZXRlZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0ZmFpbGluZ0RlbGV0ZWQ6IFtbJ3MxJ11dLFxuXHRcdFx0XHRzdWNjZWVkaW5nRGVsZXRlZDogW1snczInXV0sXG5cdFx0XHRcdGV2ZW50c0ZpcmVkOiBbJ3MyJ10sXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZU5ld0NoYXRJblNlc3Npb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXVzZXMgYW4gZXhpc3RpbmcgdW50aXRsZWQgY2hhdCBpbnN0ZWFkIG9mIGNyZWF0aW5nIGEgbmV3IG9uZScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHVudGl0bGVkQ2hhdDogSUNoYXQgPSB7IC4uLnN0dWJDaGF0LCByZXNvdXJjZTogVVJJLnBhcnNlKCd0ZXN0Oi8vL3VudGl0bGVkJyksIHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuVW50aXRsZWQpIH07XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdyZXVzZScsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbdW50aXRsZWRDaGF0XSkgfSk7XG5cdFx0XHRsZXQgY3JlYXRlTmV3Q2hhdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTmV3Q2hhdCgpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIHN0dWJDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJldXNlZDogcmVzdWx0ID09PSB1bnRpdGxlZENoYXQsXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmV1c2VkOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVOZXdDaGF0Q2FsbHM6IDAsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Fza3MgdGhlIHByb3ZpZGVyIHRvIGNyZWF0ZSBhIGNoYXQgd2hlbiBub25lIGFyZSB1bnRpdGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGFjdGl2ZUNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9hY3RpdmUnKSwgc3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSB9O1xuXHRcdFx0Y29uc3QgY3JlYXRlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jcmVhdGVkJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2NyZWF0ZScsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbYWN0aXZlQ2hhdF0pIH0pO1xuXHRcdFx0bGV0IGNyZWF0ZU5ld0NoYXRDYWxscyA9IDA7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb24pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZU5ld0NoYXQoKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscysrO1xuXHRcdFx0XHRcdHJldHVybiBjcmVhdGVkQ2hhdDtcblx0XHRcdFx0fVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBzZXJ2aWNlLmNyZWF0ZU5ld0NoYXRJblNlc3Npb24oc2Vzc2lvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdD8ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN1bHQ6IGNyZWF0ZWRDaGF0LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxsczogMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZm9yY2VOZXcgY3JlYXRlcyBhIGZyZXNoIGNoYXQgZXZlbiB3aGVuIGFuIHVudGl0bGVkIG9uZSBleGlzdHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCB1bnRpdGxlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy91bnRpdGxlZCcpLCBzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLlVudGl0bGVkKSB9O1xuXHRcdFx0Y29uc3QgY3JlYXRlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9jcmVhdGVkJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2ZvcmNlLW5ldycsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbdW50aXRsZWRDaGF0XSkgfSk7XG5cdFx0XHRsZXQgY3JlYXRlTmV3Q2hhdENhbGxzID0gMDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlTmV3Q2hhdCgpOiBQcm9taXNlPElDaGF0PiB7XG5cdFx0XHRcdFx0Y3JlYXRlTmV3Q2hhdENhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIGNyZWF0ZWRDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uLCB7IGZvcmNlTmV3OiB0cnVlIH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVzdWx0OiByZXN1bHQ/LnJlc291cmNlLnRvU3RyaW5nKCksXG5cdFx0XHRcdGNyZWF0ZU5ld0NoYXRDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0cmVzdWx0OiBjcmVhdGVkQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRjcmVhdGVOZXdDaGF0Q2FsbHM6IDEsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgdW5kZWZpbmVkIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJyB9KTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnb3RoZXInLCBwcm92aWRlcklkOiAndGVzdCcgfSkpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlTmV3Q2hhdEluU2Vzc2lvbihzZXNzaW9uKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZvcmtDaGF0SW5TZXNzaW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnYXNrcyB0aGUgcHJvdmlkZXIgdG8gZm9yayB0aGUgY2hhdCB3aGVuIHRoZSBzZXNzaW9uIHN1cHBvcnRzIG11bHRpcGxlIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc291cmNlQ2hhdCA9IFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKTtcblx0XHRcdGNvbnN0IGZvcmtlZENoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9mb3JrZWQnKSB9O1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnZm9yaycsIHByb3ZpZGVySWQ6ICd0ZXN0JywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUgfSkgfSk7XG5cdFx0XHRsZXQgZm9ya0NoYXRBcmdzOiByZWFkb25seSBbc3RyaW5nLCBVUkksIHN0cmluZ10gfCB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb24pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIGZvcmtDaGF0KHNlc3Npb25JZDogc3RyaW5nLCBzb3VyY2VDaGF0OiBVUkksIHR1cm5JZDogc3RyaW5nKTogUHJvbWlzZTxJQ2hhdD4ge1xuXHRcdFx0XHRcdGZvcmtDaGF0QXJncyA9IFtzZXNzaW9uSWQsIHNvdXJjZUNoYXQsIHR1cm5JZF07XG5cdFx0XHRcdFx0cmV0dXJuIGZvcmtlZENoYXQ7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMsIHByb3ZpZGVyKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgc2VydmljZS5mb3JrQ2hhdEluU2Vzc2lvbihzZXNzaW9uLCBzb3VyY2VDaGF0LCAndHVybi0xJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBmb3JrQ2hhdEFyZ3M/Lm1hcChhcmcgPT4gVVJJLmlzVXJpKGFyZykgPyBhcmcudG9TdHJpbmcoKSA6IGFyZyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogZm9ya2VkQ2hhdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBbJ2ZvcmsnLCBzb3VyY2VDaGF0LnRvU3RyaW5nKCksICd0dXJuLTEnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUgfSkgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmZvcmtDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvUHJvdmlkZXIgJ21pc3NpbmctcHJvdmlkZXInIG5vdCBmb3VuZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBtdWx0aXBsZSBjaGF0cycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NpbmdsZS1jaGF0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSkgfSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmZvcmtDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvZG9lcyBub3Qgc3VwcG9ydCBmb3JraW5nIGludG8gYSBjaGF0Lyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjcmVhdGVTaWRlQ2hhdEluU2Vzc2lvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ2Fza3MgdGhlIHByb3ZpZGVyIHRvIGNyZWF0ZSB0aGUgc2lkZSBjaGF0IHdoZW4gdGhlIHNlc3Npb24gc3VwcG9ydHMgaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb3VyY2VDaGF0ID0gVVJJLnBhcnNlKCd0ZXN0Oi8vL3NvdXJjZScpO1xuXHRcdFx0Y29uc3Qgc2lkZUNoYXQ6IElDaGF0ID0geyAuLi5zdHViQ2hhdCwgcmVzb3VyY2U6IFVSSS5wYXJzZSgndGVzdDovLy9zaWRlJykgfTtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NpZGUnLCBwcm92aWRlcklkOiAndGVzdCcsIGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlLCBzdXBwb3J0c1NpZGVDaGF0OiB0cnVlIH0pIH0pO1xuXHRcdFx0Y29uc3Qgc2VsZWN0aW9uID0geyB0ZXh0OiAnICBzZWxlY3RlZCB0ZXh0ICAnIH07XG5cdFx0XHRsZXQgY3JlYXRlU2lkZUNoYXRBcmdzOiByZWFkb25seSBbc3RyaW5nLCBVUkksIHN0cmluZywgSVNpZGVDaGF0U2VsZWN0aW9uIHwgdW5kZWZpbmVkXSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbik7IH1cblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlU2lkZUNoYXQoc2Vzc2lvbklkOiBzdHJpbmcsIHNvdXJjZUNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcsIHNlbGVjdGlvbj86IElTaWRlQ2hhdFNlbGVjdGlvbik6IFByb21pc2U8SUNoYXQ+IHtcblx0XHRcdFx0XHRjcmVhdGVTaWRlQ2hhdEFyZ3MgPSBbc2Vzc2lvbklkLCBzb3VyY2VDaGF0LCB0dXJuSWQsIHNlbGVjdGlvbl07XG5cdFx0XHRcdFx0cmV0dXJuIHNpZGVDaGF0O1xuXHRcdFx0XHR9XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb24sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IHNlcnZpY2UuY3JlYXRlU2lkZUNoYXRJblNlc3Npb24oc2Vzc2lvbiwgc291cmNlQ2hhdCwgJ3R1cm4tMScsIHNlbGVjdGlvbik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdC5yZXNvdXJjZS50b1N0cmluZygpLFxuXHRcdFx0XHRhcmdzOiBjcmVhdGVTaWRlQ2hhdEFyZ3M/Lm1hcChhcmcgPT4gVVJJLmlzVXJpKGFyZykgPyBhcmcudG9TdHJpbmcoKSA6IGFyZyksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlc3VsdDogc2lkZUNoYXQucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHRcdFx0YXJnczogWydzaWRlJywgc291cmNlQ2hhdC50b1N0cmluZygpLCAndHVybi0xJywgc2VsZWN0aW9uXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHByb3ZpZGVyIGlzIG5vdCBmb3VuZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSBzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ29ycGhhbicsIHByb3ZpZGVySWQ6ICdtaXNzaW5nLXByb3ZpZGVyJywgY2FwYWJpbGl0aWVzOiBjb25zdE9ic2VydmFibGUoeyBzdXBwb3J0c011bHRpcGxlQ2hhdHM6IHRydWUsIHN1cHBvcnRzU2lkZUNoYXQ6IHRydWUgfSkgfSk7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ290aGVyJywgcHJvdmlkZXJJZDogJ3Rlc3QnIH0pKTtcblx0XHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZShzZXNzaW9uLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvUHJvdmlkZXIgJ21pc3NpbmctcHJvdmlkZXInIG5vdCBmb3VuZC8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHNlc3Npb24gZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnbm8tc2lkZS1jaGF0JywgcHJvdmlkZXJJZDogJ3Rlc3QnLCBjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSwgc3VwcG9ydHNTaWRlQ2hhdDogZmFsc2UgfSkgfSk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbiwgZGlzcG9zYWJsZXMpO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVNpZGVDaGF0SW5TZXNzaW9uKHNlc3Npb24sIFVSSS5wYXJzZSgndGVzdDovLy9zb3VyY2UnKSwgJ3R1cm4tMScpLCAvZG9lcyBub3Qgc3VwcG9ydCBzaWRlIGNoYXRzLyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjbG9zZWQgY2hhdHMgcGVyc2lzdGVuY2UnLCAoKSA9PiB7XG5cblx0XHRmdW5jdGlvbiBjaGF0KGlkOiBzdHJpbmcsIHN0YXR1czogU2Vzc2lvblN0YXR1cyA9IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkLCBvcmlnaW4/OiBDaGF0T3JpZ2luS2luZCk6IElDaGF0IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHtpZH1gKSxcblx0XHRcdFx0dGl0bGU6IGNvbnN0T2JzZXJ2YWJsZShpZCksXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKHN0YXR1cyksXG5cdFx0XHRcdG9yaWdpbjogb3JpZ2luID8geyBraW5kOiBvcmlnaW4gfSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbXVsdGlDaGF0U2Vzc2lvbihpZDogc3RyaW5nLCBjaGF0czogSUNoYXRbXSk6IElTZXNzaW9uIHtcblx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogaWQsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShjaGF0cyksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUoY2hhdHNbMF0pLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdH1cblxuXHRcdGZ1bmN0aW9uIHNldHVwKHNlc3Npb25zOiBJU2Vzc2lvbltdKSB7XG5cdFx0XHRjb25zdCBwcm92aWRlciA9IG5ldyBjbGFzcyBleHRlbmRzIFRlc3RTZXNzaW9uc1Byb3ZpZGVyIHtcblx0XHRcdFx0Y29uc3RydWN0b3IoKSB7IHN1cGVyKHNlc3Npb25zWzBdKTsgfVxuXHRcdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9ucygpOiBJU2Vzc2lvbltdIHsgcmV0dXJuIHNlc3Npb25zOyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbnNbMF0sIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0fVxuXG5cdFx0Y29uc3QgY2xvc2VkVGl0bGVzID0gKHZpZXc6IFNlc3Npb25zU2VydmljZSkgPT5cblx0XHRcdCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmNsb3NlZENoYXRzLmdldCgpID8/IFtdKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKTtcblxuXHRcdHRlc3QoJ2EgY2hhdCBjbG9zZWQgaW4gb25lIHNlc3Npb24gc3RheXMgY2xvc2VkIGFmdGVyIHN3aXRjaGluZyBhd2F5IGFuZCBiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3QgY2hhdEIgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2InKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBjaGF0Qik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXG5cdFx0XHQvLyBTd2l0Y2hpbmcgYXdheSBkaXNwb3NlcyBzZXNzaW9uIEEncyB3cmFwcGVyIChhbmQgaXRzIGluLW1lbW9yeSBjbG9zZWRcblx0XHRcdC8vIHNldCk7IHN3aXRjaGluZyBiYWNrIG11c3QgcmVzdG9yZSB0aGUgY2xvc2VkIGNoYXQgZnJvbSBwZXJzaXN0ZWQgc3RhdGUuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xvc2luZyB0aGUgbWlkZGxlIG9mIHRocmVlIGNoYXRzIHBlcnNpc3RzIGFjcm9zcyBhIHN3aXRjaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdjMScpLCBjaGF0KCdjMicpLCBjaGF0KCdjMycpXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQiA9IG11bHRpQ2hhdFNlc3Npb24oJ0InLCBbY2hhdCgnbWFpbkInKV0pO1xuXHRcdFx0Y29uc3QgeyB2aWV3IH0gPSBzZXR1cChbc2Vzc2lvbkEsIHNlc3Npb25CXSk7XG5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYWN0aXZlQSA9IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSE7XG5cdFx0XHRjb25zdCBtaWRkbGUgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2MyJykhO1xuXHRcdFx0YXdhaXQgdmlldy5jbG9zZUNoYXQoYWN0aXZlQSwgbWlkZGxlKTtcblxuXHRcdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uQi5yZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblxuXHRcdFx0Y29uc3QgcmVBY3RpdmVBID0gdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpITtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRvcGVuOiByZUFjdGl2ZUEub3BlbkNoYXRzLmdldCgpLm1hcChjID0+IGMudGl0bGUuZ2V0KCkpLFxuXHRcdFx0XHRjbG9zZWQ6IHJlQWN0aXZlQS5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0b3BlbjogWydjMScsICdjMyddLFxuXHRcdFx0XHRjbG9zZWQ6IFsnYzInXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY2xvc2luZyB0aGUgYWN0aXZlIGNoYXQgcGVyc2lzdHMgYWNyb3NzIGEgc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGNoYXRCID0gc2Vzc2lvbkEuY2hhdHMuZ2V0KCkuZmluZChjID0+IGMudGl0bGUuZ2V0KCkgPT09ICdiJykhO1xuXHRcdFx0YXdhaXQgdmlldy5vcGVuQ2hhdChzZXNzaW9uQSwgY2hhdEIucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgdmlldy5jbG9zZUNoYXQodmlldy5hY3RpdmVTZXNzaW9uLmdldCgpISwgY2hhdEIpO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVvcGVuaW5nIGEgY2xvc2VkIGNoYXQgaXMgYWxzbyBwZXJzaXN0ZWQgYWNyb3NzIGEgc3dpdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3QgY2hhdEIgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2InKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBjaGF0Qik7XG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5DaGF0KHNlc3Npb25BLCBjaGF0Qi5yZXNvdXJjZSk7IC8vIHJlb3BlblxuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjbG9zZWQgc2lkZSBjaGF0IHN0YXlzIGNsb3NlZCBhZnRlciBzd2l0Y2hpbmcgYXdheSBhbmQgYmFjaycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdtYWluQScpLCBjaGF0KCdzaWRlJywgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQsIENoYXRPcmlnaW5LaW5kLlNpZGVDaGF0KV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGNvbnN0IGFjdGl2ZUEgPSB2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhO1xuXHRcdFx0Y29uc3Qgc2lkZUNoYXQgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ3NpZGUnKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdChhY3RpdmVBLCBzaWRlQ2hhdCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydzaWRlJ10pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNsb3NlZFRpdGxlcyh2aWV3KSwgWydzaWRlJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjbG9zZWQgY2hhdCBzdGF5cyBjbG9zZWQgYWNyb3NzIGEgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5BID0gY2hhdCgnbWFpbkEnKTtcblx0XHRcdGNvbnN0IGNoYXRCID0gY2hhdCgnYicpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogJ0EnLCBwcm92aWRlcklkOiAndGVzdCcsXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdFx0Y2hhdHM6IGNvbnN0T2JzZXJ2YWJsZShbbWFpbkEsIGNoYXRCXSksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbkEpLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbkEpOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gW3Nlc3Npb25BXTsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ha2VWaWV3ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB3aW5kb3c6IGNsb3NlIGNoYXQgQiwgdGhlbiBzaW11bGF0ZSBzaHV0ZG93biAoZmx1c2ggc3RvcmFnZSkuXG5cdFx0XHRjb25zdCBmaXJzdCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBmaXJzdC5vcGVuU2Vzc2lvbihzZXNzaW9uQS5yZXNvdXJjZSk7XG5cdFx0XHRhd2FpdCBmaXJzdC5jbG9zZUNoYXQoZmlyc3QuYWN0aXZlU2Vzc2lvbi5nZXQoKSEsIGNoYXRCKTtcblx0XHRcdGF3YWl0IHN0b3JhZ2UuZmx1c2goKTtcblxuXHRcdFx0Ly8gU2Vjb25kIHdpbmRvdzogcmVzdG9yZSBhbmQgY29uZmlybSBCIGlzIHN0aWxsIGNsb3NlZC5cblx0XHRcdGNvbnN0IHNlY29uZCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBzZWNvbmQucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc2Vjb25kLmFjdGl2ZVNlc3Npb24uZ2V0KCk/LmNsb3NlZENoYXRzLmdldCgpID8/IFtdKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSwgWydiJ10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBjaGF0IGNsb3NlZCBpbiBhIG5vbi1hY3RpdmUgc2Vzc2lvbiBzdGF5cyBjbG9zZWQgYWNyb3NzIGEgcmVzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IG1haW5BID0gY2hhdCgnbWFpbkEnKTtcblx0XHRcdGNvbnN0IGNoYXRBMiA9IGNoYXQoJ2EyJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uQSA9IHN0dWJTZXNzaW9uKHtcblx0XHRcdFx0c2Vzc2lvbklkOiAnQScsIHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFttYWluQSwgY2hhdEEyXSksXG5cdFx0XHRcdG1haW5DaGF0OiBjb25zdE9ic2VydmFibGUobWFpbkEpLFxuXHRcdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgbWFpbkIgPSBjaGF0KCdtYWluQicpO1xuXHRcdFx0Y29uc3QgY2hhdEIyID0gY2hhdCgnYjInKTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gc3R1YlNlc3Npb24oe1xuXHRcdFx0XHRzZXNzaW9uSWQ6ICdCJywgcHJvdmlkZXJJZDogJ3Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCksXG5cdFx0XHRcdGNoYXRzOiBjb25zdE9ic2VydmFibGUoW21haW5CLCBjaGF0QjJdKSxcblx0XHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShtYWluQiksXG5cdFx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlIH0pLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihzZXNzaW9uQSk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbc2Vzc2lvbkEsIHNlc3Npb25CXTsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IG1ha2VWaWV3ID0gKCkgPT4ge1xuXHRcdFx0XHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbcHJvdmlkZXJdKSk7XG5cdFx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmk6IGV4dFVyaUJpYXNlZElnbm9yZVBhdGhDYXNlIH0pO1xuXHRcdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0V2lkZ2V0U2VydmljZSwgbmV3IFRlc3RDaGF0V2lkZ2V0U2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2hhdFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUNoYXRTZXJ2aWNlPigpIHtcblx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFN1Ym1pdFJlcXVlc3QgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHR9KTtcblx0XHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKSk7XG5cdFx0XHRcdHJldHVybiBjcmVhdGVWaWV3KGluc3RhbnRpYXRpb25TZXJ2aWNlLCBzZXJ2aWNlLCBkaXNwb3NhYmxlcyk7XG5cdFx0XHR9O1xuXG5cdFx0XHQvLyBGaXJzdCB3aW5kb3c6IGNsb3NlIGEgY2hhdCBpbiBlYWNoIHNlc3Npb24sIGVuZCBvbiBzZXNzaW9uIEEgc28gQiBpc1xuXHRcdFx0Ly8gbm8gbG9uZ2VyIHZpc2libGUsIHRoZW4gc2ltdWxhdGUgc2h1dGRvd24gKGZsdXNoIHN0b3JhZ2UpLlxuXHRcdFx0Y29uc3QgZmlyc3QgPSBtYWtlVmlldygpO1xuXHRcdFx0YXdhaXQgZmlyc3Qub3BlblNlc3Npb24oc2Vzc2lvbkIucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgZmlyc3QuY2xvc2VDaGF0KGZpcnN0LmFjdGl2ZVNlc3Npb24uZ2V0KCkhLCBjaGF0QjIpO1xuXHRcdFx0YXdhaXQgZmlyc3Qub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0YXdhaXQgZmlyc3QuY2xvc2VDaGF0KGZpcnN0LmFjdGl2ZVNlc3Npb24uZ2V0KCkhLCBjaGF0QTIpO1xuXHRcdFx0YXdhaXQgc3RvcmFnZS5mbHVzaCgpO1xuXG5cdFx0XHQvLyBTZWNvbmQgd2luZG93OiByZXN0b3JlLCB0aGVuIHN3aXRjaCB0byBCIGFuZCBjb25maXJtIGl0cyBjaGF0IGlzIHN0aWxsIGNsb3NlZC5cblx0XHRcdGNvbnN0IHNlY29uZCA9IG1ha2VWaWV3KCk7XG5cdFx0XHRhd2FpdCBzZWNvbmQucmVzdG9yZVZpc2libGVTZXNzaW9ucygpO1xuXHRcdFx0YXdhaXQgc2Vjb25kLm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHNlY29uZC5hY3RpdmVTZXNzaW9uLmdldCgpPy5jbG9zZWRDaGF0cy5nZXQoKSA/PyBbXSkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksIFsnYjInXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZW9wZW5MYXN0Q2xvc2VkSXRlbScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNoYXQodGl0bGU6IHN0cmluZyk6IElDaGF0IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdC4uLnN0dWJDaGF0LFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLnBhcnNlKGB0ZXN0Oi8vL2NoYXQvJHt0aXRsZX1gKSxcblx0XHRcdFx0dGl0bGU6IGNvbnN0T2JzZXJ2YWJsZSh0aXRsZSksXG5cdFx0XHRcdHN0YXR1czogY29uc3RPYnNlcnZhYmxlKFNlc3Npb25TdGF0dXMuQ29tcGxldGVkKSxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbXVsdGlDaGF0U2Vzc2lvbihpZDogc3RyaW5nLCBjaGF0czogSUNoYXRbXSk6IElTZXNzaW9uIHtcblx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogaWQsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICd0ZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdFx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKGNoYXRzKSxcblx0XHRcdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0c1swXSksXG5cdFx0XHRcdGNhcGFiaWxpdGllczogY29uc3RPYnNlcnZhYmxlKHsgc3VwcG9ydHNNdWx0aXBsZUNoYXRzOiB0cnVlIH0pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0dXAoc2Vzc2lvbnM6IElTZXNzaW9uW10pIHtcblx0XHRcdGNvbnN0IHByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRjb25zdHJ1Y3RvcigpIHsgc3VwZXIoc2Vzc2lvbnNbMF0pOyB9XG5cdFx0XHRcdG92ZXJyaWRlIGdldFNlc3Npb25zKCk6IElTZXNzaW9uW10geyByZXR1cm4gc2Vzc2lvbnM7IH1cblx0XHRcdH07XG5cdFx0XHRjb25zdCB7IHZpZXcsIGNvbnRleHRLZXlTZXJ2aWNlIH0gPSBjcmVhdGVTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHNlc3Npb25zWzBdLCBkaXNwb3NhYmxlcywgcHJvdmlkZXIpO1xuXHRcdFx0Ly8gVGhlIGNvbnRleHQga2V5IGRyaXZlcyB0aGUgY29tbWFuZCdzIHBhbGV0dGUgdmlzaWJpbGl0eSwgYW5kIGlzIHRoZVxuXHRcdFx0Ly8gb25seSBleHRlcm5hbCBzaWduYWwgb2Ygd2hldGhlciBhbiBlbnRyeSBpcyByZW1lbWJlcmVkLlxuXHRcdFx0cmV0dXJuIHsgdmlldywgY2FuUmVvcGVuOiAoKSA9PiBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2Vzc2lvbnNIYXNDbG9zZWRJdGVtQ29udGV4dC5rZXkpID09PSB0cnVlIH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgZ3JpZCA9ICh2aWV3OiBTZXNzaW9uc1NlcnZpY2UpID0+ICh7XG5cdFx0XHR2aXNpYmxlOiB2aWV3LnZpc2libGVTZXNzaW9ucy5nZXQoKS5tYXAocyA9PiBzPy5zZXNzaW9uSWQgPz8gbnVsbCksXG5cdFx0XHRzdGlja3k6IHZpZXcudmlzaWJsZVNlc3Npb25zLmdldCgpLm1hcChzID0+IHM/LnN0aWNreS5nZXQoKSA/PyBmYWxzZSksXG5cdFx0XHRhY3RpdmU6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkID8/IG51bGwsXG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW9wZW5zIGEgY2xvc2VkIGNoYXQsIGNvbnN1bWluZyB0aGUgZW50cnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQSA9IG11bHRpQ2hhdFNlc3Npb24oJ0EnLCBbY2hhdCgnbWFpbkEnKSwgY2hhdCgnYicpXSk7XG5cdFx0XHRjb25zdCB7IHZpZXcsIGNhblJlb3BlbiB9ID0gc2V0dXAoW3Nlc3Npb25BXSk7XG5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgY2hhdEIgPSBzZXNzaW9uQS5jaGF0cy5nZXQoKS5maW5kKGMgPT4gYy50aXRsZS5nZXQoKSA9PT0gJ2InKSE7XG5cdFx0XHRhd2FpdCB2aWV3LmNsb3NlQ2hhdCh2aWV3LmFjdGl2ZVNlc3Npb24uZ2V0KCkhLCBjaGF0Qik7XG5cdFx0XHRjb25zdCBhZnRlckNsb3NlID0gY2FuUmVvcGVuKCk7XG5cblx0XHRcdGF3YWl0IHZpZXcucmVvcGVuTGFzdENsb3NlZEl0ZW0oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGFmdGVyQ2xvc2UsXG5cdFx0XHRcdGNsb3NlZDogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpIS5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdFx0b3Blbjogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpIS5vcGVuQ2hhdHMuZ2V0KCkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksXG5cdFx0XHRcdGNhblJlb3BlbkFnYWluOiBjYW5SZW9wZW4oKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YWZ0ZXJDbG9zZTogdHJ1ZSxcblx0XHRcdFx0Y2xvc2VkOiBbXSxcblx0XHRcdFx0b3BlbjogWydtYWluQScsICdiJ10sXG5cdFx0XHRcdGNhblJlb3BlbkFnYWluOiBmYWxzZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYW4gZXhwbGljaXRseSBjbG9zZWQgc2Vzc2lvbiByZXR1cm5zIHRvIGl0cyBncmlkIGluZGV4JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyldKTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gbXVsdGlDaGF0U2Vzc2lvbignQicsIFtjaGF0KCdtYWluQicpXSk7XG5cdFx0XHRjb25zdCB7IHZpZXcgfSA9IHNldHVwKFtzZXNzaW9uQSwgc2Vzc2lvbkJdKTtcblxuXHRcdFx0Ly8gUGluIEEgc28gb3BlbmluZyBCIGFkZHMgYSBzZWNvbmQgc2xvdCBpbnN0ZWFkIG9mIHJlcGxhY2luZyBpdC5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0dmlldy50b2dnbGVTZXNzaW9uU3RpY2tpbmVzcyhzZXNzaW9uQSk7XG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25CLnJlc291cmNlKTtcblxuXHRcdFx0dmlldy5jbG9zZVNlc3Npb24oc2Vzc2lvbkEpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJDbG9zZSA9IGdyaWQodmlldyk7XG5cblx0XHRcdGF3YWl0IHZpZXcucmVvcGVuTGFzdENsb3NlZEl0ZW0oKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFmdGVyQ2xvc2UsIGFmdGVyUmVvcGVuOiBncmlkKHZpZXcpIH0sIHtcblx0XHRcdFx0YWZ0ZXJDbG9zZTogeyB2aXNpYmxlOiBbJ0InXSwgc3RpY2t5OiBbZmFsc2VdLCBhY3RpdmU6ICdCJyB9LFxuXHRcdFx0XHRhZnRlclJlb3BlbjogeyB2aXNpYmxlOiBbJ0EnLCAnQiddLCBzdGlja3k6IFt0cnVlLCBmYWxzZV0sIGFjdGl2ZTogJ0EnIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Egc2Vzc2lvbiBwdXNoZWQgb3V0IG9mIHRoZSBncmlkIHRha2VzIGl0cyBzbG90IGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uQSA9IG11bHRpQ2hhdFNlc3Npb24oJ0EnLCBbY2hhdCgnbWFpbkEnKV0pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkIgPSBtdWx0aUNoYXRTZXNzaW9uKCdCJywgW2NoYXQoJ21haW5CJyldKTtcblx0XHRcdGNvbnN0IHsgdmlldyB9ID0gc2V0dXAoW3Nlc3Npb25BLCBzZXNzaW9uQl0pO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkIucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJSZXBsYWNlID0gZ3JpZCh2aWV3KTtcblxuXHRcdFx0YXdhaXQgdmlldy5yZW9wZW5MYXN0Q2xvc2VkSXRlbSgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWZ0ZXJSZXBsYWNlLCBhZnRlclJlb3BlbjogZ3JpZCh2aWV3KSB9LCB7XG5cdFx0XHRcdGFmdGVyUmVwbGFjZTogeyB2aXNpYmxlOiBbJ0InXSwgc3RpY2t5OiBbZmFsc2VdLCBhY3RpdmU6ICdCJyB9LFxuXHRcdFx0XHRhZnRlclJlb3BlbjogeyB2aXNpYmxlOiBbJ0EnXSwgc3RpY2t5OiBbZmFsc2VdLCBhY3RpdmU6ICdBJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1lbWJlcnMgb25seSB0aGUgbW9zdCByZWNlbnRseSBjbG9zZWQgaXRlbScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdtYWluQScpLCBjaGF0KCdiJyldKTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gbXVsdGlDaGF0U2Vzc2lvbignQicsIFtjaGF0KCdtYWluQicpXSk7XG5cdFx0XHRjb25zdCB7IHZpZXcgfSA9IHNldHVwKFtzZXNzaW9uQSwgc2Vzc2lvbkJdKTtcblxuXHRcdFx0YXdhaXQgdmlldy5vcGVuU2Vzc2lvbihzZXNzaW9uQS5yZXNvdXJjZSk7XG5cdFx0XHRjb25zdCBjaGF0QiA9IHNlc3Npb25BLmNoYXRzLmdldCgpLmZpbmQoYyA9PiBjLnRpdGxlLmdldCgpID09PSAnYicpITtcblx0XHRcdGF3YWl0IHZpZXcuY2xvc2VDaGF0KHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSEsIGNoYXRCKTtcblx0XHRcdC8vIE9wZW5pbmcgQiBwdXNoZXMgQSBvdXQgb2YgdGhlIGdyaWQsIHN1cGVyc2VkaW5nIHRoZSBjbG9zZWQtY2hhdCBlbnRyeS5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkIucmVzb3VyY2UpO1xuXG5cdFx0XHRhd2FpdCB2aWV3LnJlb3Blbkxhc3RDbG9zZWRJdGVtKCk7XG5cdFx0XHQvLyBUaGUgZW50cnkgaXMgY29uc3VtZWQsIHNvIHByZXNzaW5nIGFnYWluIG11c3Qgbm90IHdhbGsgYmFjayB0byB0aGVcblx0XHRcdC8vIHN1cGVyc2VkZWQgY2xvc2VkIGNoYXQuXG5cdFx0XHRhd2FpdCB2aWV3LnJlb3Blbkxhc3RDbG9zZWRJdGVtKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHQuLi5ncmlkKHZpZXcpLFxuXHRcdFx0XHRjbG9zZWRDaGF0czogdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpIS5jbG9zZWRDaGF0cy5nZXQoKS5tYXAoYyA9PiBjLnRpdGxlLmdldCgpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0dmlzaWJsZTogWydBJ10sXG5cdFx0XHRcdHN0aWNreTogW2ZhbHNlXSxcblx0XHRcdFx0YWN0aXZlOiAnQScsXG5cdFx0XHRcdGNsb3NlZENoYXRzOiBbJ2InXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBiYXRjaCBjbG9zZSBpcyBub3Qgb2ZmZXJlZCBmb3IgcmVvcGVuaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkEgPSBtdWx0aUNoYXRTZXNzaW9uKCdBJywgW2NoYXQoJ21haW5BJyksIGNoYXQoJ2InKSwgY2hhdCgnYycpXSk7XG5cdFx0XHRjb25zdCB7IHZpZXcsIGNhblJlb3BlbiB9ID0gc2V0dXAoW3Nlc3Npb25BXSk7XG5cblx0XHRcdGF3YWl0IHZpZXcub3BlblNlc3Npb24oc2Vzc2lvbkEucmVzb3VyY2UpO1xuXHRcdFx0Y29uc3QgYWN0aXZlID0gdmlldy5hY3RpdmVTZXNzaW9uLmdldCgpITtcblx0XHRcdC8vIE1pcnJvcnMgXCJDbG9zZSBBbGwgQ2hhdHNcIiwgd2hpY2ggY2xvc2VzIGV2ZXJ5IG5vbi1tYWluIGNoYXQuXG5cdFx0XHRmb3IgKGNvbnN0IHRhcmdldCBvZiBbJ2InLCAnYyddKSB7XG5cdFx0XHRcdGF3YWl0IHZpZXcuY2xvc2VDaGF0KGFjdGl2ZSwgc2Vzc2lvbkEuY2hhdHMuZ2V0KCkuZmluZChjID0+IGMudGl0bGUuZ2V0KCkgPT09IHRhcmdldCkhLCB7IHNraXBIaXN0b3J5OiB0cnVlIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHRhd2FpdCB2aWV3LnJlb3Blbkxhc3RDbG9zZWRJdGVtKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYW5SZW9wZW46IGNhblJlb3BlbigpLFxuXHRcdFx0XHRjbG9zZWQ6IHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSEuY2xvc2VkQ2hhdHMuZ2V0KCkubWFwKGMgPT4gYy50aXRsZS5nZXQoKSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhblJlb3BlbjogZmFsc2UsXG5cdFx0XHRcdGNsb3NlZDogWydiJywgJ2MnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzdGFsZSBlbnRyeSBpcyBkcm9wcGVkIHdoZW4gaXRzIHNlc3Npb24gdmFuaXNoZWQgd2l0aG91dCBhIGRlbGV0ZSBldmVudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25BID0gbXVsdGlDaGF0U2Vzc2lvbignQScsIFtjaGF0KCdtYWluQScpLCBjaGF0KCdiJyldKTtcblx0XHRcdGNvbnN0IHNlc3Npb25CID0gbXVsdGlDaGF0U2Vzc2lvbignQicsIFtjaGF0KCdtYWluQicpXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9ucyA9IFtzZXNzaW9uQSwgc2Vzc2lvbkJdO1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihzZXNzaW9uQSk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBzZXNzaW9uczsgfVxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgdmlldywgY29udGV4dEtleVNlcnZpY2UgfSA9IGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbkEsIGRpc3Bvc2FibGVzLCBwcm92aWRlcik7XG5cdFx0XHRjb25zdCBjYW5SZW9wZW4gPSAoKSA9PiBjb250ZXh0S2V5U2VydmljZS5nZXRDb250ZXh0S2V5VmFsdWUoU2Vzc2lvbnNIYXNDbG9zZWRJdGVtQ29udGV4dC5rZXkpID09PSB0cnVlO1xuXG5cdFx0XHRhd2FpdCB2aWV3Lm9wZW5TZXNzaW9uKHNlc3Npb25BLnJlc291cmNlKTtcblx0XHRcdGF3YWl0IHZpZXcuY2xvc2VDaGF0KHZpZXcuYWN0aXZlU2Vzc2lvbi5nZXQoKSEsIHNlc3Npb25BLmNoYXRzLmdldCgpLmZpbmQoYyA9PiBjLnRpdGxlLmdldCgpID09PSAnYicpISk7XG5cblx0XHRcdC8vIFRoZSBwcm92aWRlciBkcm9wcyB0aGUgc2Vzc2lvbiBmcm9tIGl0cyBjYXRhbG9nIHdpdGhvdXQgZmlyaW5nXG5cdFx0XHQvLyBvbkRpZERlbGV0ZVNlc3Npb24sIHNvIHRoZSByZWNvcmRlZCBlbnRyeSBjYW4gbmV2ZXIgYmUgcmVvcGVuZWQuXG5cdFx0XHRzZXNzaW9ucy5zcGxpY2UoMCwgMSk7XG5cdFx0XHRhd2FpdCB2aWV3LnJlb3Blbkxhc3RDbG9zZWRJdGVtKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjYW5SZW9wZW46IGNhblJlb3BlbigpIH0sIHsgY2FuUmVvcGVuOiBmYWxzZSB9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NyZWF0ZVF1aWNrQ2hhdCcsICgpID0+IHtcblxuXHRcdC8qKlxuXHRcdCAqIFByb3ZpZGVyIHRoYXQgc3VwcG9ydHMgcXVpY2sgY2hhdHMgYW5kIG1pbnRzIGEgZnJlc2ggZHJhZnQgc2Vzc2lvbiBvblxuXHRcdCAqIGVhY2ggYGNyZWF0ZVF1aWNrQ2hhdGAsIHJlY29yZGluZyB0aGUgcmVxdWVzdGVkIHR5cGUgYW5kIGNhbGwgY291bnQuXG5cdFx0ICovXG5cdFx0Y2xhc3MgUXVpY2tDaGF0UHJvdmlkZXIgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRsYXN0UXVpY2tDaGF0VHlwZTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0Y3JlYXRlUXVpY2tDaGF0Q2FsbHMgPSAwO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3VwcG9ydHNRdWlja0NoYXRzID0gdHJ1ZTtcblxuXHRcdFx0Y29uc3RydWN0b3IoXG5cdFx0XHRcdHNlZWQ6IElTZXNzaW9uLFxuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpZDogc3RyaW5nID0gJ3F1aWNrLXByb3ZpZGVyJyxcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXI6IG51bWJlciA9IDAsXG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH1dLFxuXHRcdFx0KSB7XG5cdFx0XHRcdHN1cGVyKHNlZWQpO1xuXHRcdFx0fVxuXG5cdFx0XHRvdmVycmlkZSBjcmVhdGVRdWlja0NoYXQoc2Vzc2lvblR5cGVJZDogc3RyaW5nKTogSVNlc3Npb24ge1xuXHRcdFx0XHR0aGlzLmNyZWF0ZVF1aWNrQ2hhdENhbGxzKys7XG5cdFx0XHRcdHRoaXMubGFzdFF1aWNrQ2hhdFR5cGUgPSBzZXNzaW9uVHlwZUlkO1xuXHRcdFx0XHRyZXR1cm4gc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6IGBxJHt0aGlzLmNyZWF0ZVF1aWNrQ2hhdENhbGxzfWAsIHByb3ZpZGVySWQ6IHRoaXMuaWQgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gc2V0dXBRdWlja0NoYXQocHJvdmlkZXJzOiByZWFkb25seSBJU2Vzc2lvbnNQcm92aWRlcltdKTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTG9nU2VydmljZSwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UocHJvdmlkZXJzKSk7XG5cdFx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElVcmlJZGVudGl0eVNlcnZpY2UsIHsgZXh0VXJpOiBleHRVcmlCaWFzZWRJZ25vcmVQYXRoQ2FzZSB9KTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRcdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUHJvZ3Jlc3NTZXJ2aWNlLCBuZXcgVGVzdFByb2dyZXNzU2VydmljZSgpKTtcblx0XHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0U2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xuXHRcdH1cblxuXHRcdHRlc3QoJ2NyZWF0ZXMgYSBzZXNzaW9uIHZpYSB0aGUgZmlyc3QgY2FwYWJsZSBwcm92aWRlciAoYnkgb3JkZXIpIGFuZCBkZWZhdWx0cyB0aGUgdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdwbGFpbic7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9yZGVyID0gMDtcblx0XHRcdH0oc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdwMScsIHByb3ZpZGVySWQ6ICdwbGFpbicgfSkpO1xuXHRcdFx0Y29uc3QgcXVpY2sgPSBuZXcgUXVpY2tDaGF0UHJvdmlkZXIoc3R1YlNlc3Npb24oeyBzZXNzaW9uSWQ6ICdzZWVkJywgcHJvdmlkZXJJZDogJ3F1aWNrLXByb3ZpZGVyJyB9KSwgJ3F1aWNrLXByb3ZpZGVyJywgMSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcGxhaW4sIHF1aWNrXSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc2VydmljZS5jcmVhdGVRdWlja0NoYXQoKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNyZWF0ZWRTZXNzaW9uSWQ6IHNlc3Npb24uc2Vzc2lvbklkLFxuXHRcdFx0XHRyZXF1ZXN0ZWRUeXBlOiBxdWljay5sYXN0UXVpY2tDaGF0VHlwZSxcblx0XHRcdFx0ZHJhZnQ6IHNlcnZpY2UubmV3U2Vzc2lvbi5nZXQoKT8uc2Vzc2lvbklkLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjcmVhdGVkU2Vzc2lvbklkOiAncTEnLFxuXHRcdFx0XHRyZXF1ZXN0ZWRUeXBlOiAncXVpY2snLFxuXHRcdFx0XHRkcmFmdDogJ3ExJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWludHMgYSBuZXcgcXVpY2stY2hhdCBzZXNzaW9uIG9uIGVhY2ggY2FsbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSkpO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3F1aWNrXSk7XG5cdFx0XHRjb25zdCBmaXJzdCA9IHNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0KCk7XG5cdFx0XHRjb25zdCBzZWNvbmQgPSBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Zmlyc3Q6IGZpcnN0LnNlc3Npb25JZCxcblx0XHRcdFx0c2Vjb25kOiBzZWNvbmQuc2Vzc2lvbklkLFxuXHRcdFx0XHRjcmVhdGVRdWlja0NoYXRDYWxsczogcXVpY2suY3JlYXRlUXVpY2tDaGF0Q2FsbHMsXG5cdFx0XHRcdGRyYWZ0OiBzZXJ2aWNlLm5ld1Nlc3Npb24uZ2V0KCk/LnNlc3Npb25JZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6ICdxMScsXG5cdFx0XHRcdHNlY29uZDogJ3EyJyxcblx0XHRcdFx0Y3JlYXRlUXVpY2tDaGF0Q2FsbHM6IDIsXG5cdFx0XHRcdGRyYWZ0OiAncTInLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJvd3Mgd2hlbiBubyBwcm92aWRlciBzdXBwb3J0cyBxdWljayBjaGF0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IFRlc3RTZXNzaW9uc1Byb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAncDEnLCBwcm92aWRlcklkOiAndGVzdCcgfSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtwbGFpbl0pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpLCAvTm8gc2Vzc2lvbnMgcHJvdmlkZXIgc3VwcG9ydHMgcXVpY2sgY2hhdHMvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm91cnMgb3B0aW9ucy5wcm92aWRlcklkIGFuZCB0aGUgcmVxdWVzdGVkIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSksICdxdWljay1wcm92aWRlcicsIDAsIFtcblx0XHRcdFx0eyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAnb3RoZXInLCBsYWJlbDogJ090aGVyJywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcXVpY2tdKTtcblx0XHRcdHNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0KHsgcHJvdmlkZXJJZDogJ3F1aWNrLXByb3ZpZGVyJywgc2Vzc2lvblR5cGVJZDogJ290aGVyJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrLmxhc3RRdWlja0NoYXRUeXBlLCAnb3RoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hvbm91cnMgYW4gZXhwbGljaXQgc2Vzc2lvblR5cGVJZCB3aXRob3V0IGEgcHJvdmlkZXJJZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSksICdxdWljay1wcm92aWRlcicsIDAsIFtcblx0XHRcdFx0eyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICdxdWljaycsIGxhYmVsOiAnUXVpY2snLCBpY29uOiBDb2RpY29uLnZtIH0sXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAnb3RoZXInLCBsYWJlbDogJ090aGVyJywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XSk7XG5cblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcXVpY2tdKTtcblx0XHRcdHNlcnZpY2UuY3JlYXRlUXVpY2tDaGF0KHsgc2Vzc2lvblR5cGVJZDogJ290aGVyJyB9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHF1aWNrLmxhc3RRdWlja0NoYXRUeXBlLCAnb3RoZXInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RlZmF1bHRzIHRvIHRoZSBsYXN0LXVzZWQgc2Vzc2lvbiB0eXBlIG9uIHRoZSBuZXh0IGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBxdWljayA9IG5ldyBRdWlja0NoYXRQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NlZWQnLCBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInIH0pLCAncXVpY2stcHJvdmlkZXInLCAwLCBbXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAncXVpY2snLCBsYWJlbDogJ1F1aWNrJywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XHR7IGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLCBpZDogJ290aGVyJywgbGFiZWw6ICdPdGhlcicsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3F1aWNrXSk7XG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCh7IHNlc3Npb25UeXBlSWQ6ICdvdGhlcicgfSk7XG5cdFx0XHRzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCgpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocXVpY2subGFzdFF1aWNrQ2hhdFR5cGUsICdvdGhlcicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyb3dzIHdoZW4gdGhlIHJlcXVlc3RlZCBwcm92aWRlciBkb2VzIG5vdCBhZHZlcnRpc2UgdGhlIHNlc3Npb24gdHlwZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHF1aWNrID0gbmV3IFF1aWNrQ2hhdFByb3ZpZGVyKHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnc2VlZCcsIHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicgfSkpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNldHVwUXVpY2tDaGF0KFtxdWlja10pO1xuXHRcdFx0YXNzZXJ0LnRocm93cygoKSA9PiBzZXJ2aWNlLmNyZWF0ZVF1aWNrQ2hhdCh7IHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICdtaXNzaW5nJyB9KSwgL2RvZXMgbm90IGFkdmVydGlzZSBzZXNzaW9uIHR5cGUvKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rocm93cyB3aGVuIHRoZSByZXF1ZXN0ZWQgcHJvdmlkZXIgZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IHBsYWluID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBpZCA9ICdwbGFpbic7XG5cdFx0XHR9KHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAncDEnLCBwcm92aWRlcklkOiAncGxhaW4nIH0pKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXR1cFF1aWNrQ2hhdChbcGxhaW5dKTtcblx0XHRcdGFzc2VydC50aHJvd3MoKCkgPT4gc2VydmljZS5jcmVhdGVRdWlja0NoYXQoeyBwcm92aWRlcklkOiAncGxhaW4nIH0pLCAvZG9lcyBub3Qgc3VwcG9ydCBxdWljayBjaGF0cy8pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2V0UXVpY2tDaGF0U2Vzc2lvblR5cGVzIHJldHVybnMgZXZlcnkgYWR2ZXJ0aXNlZCB0eXBlIGZyb20gcXVpY2stY2hhdC1jYXBhYmxlIHByb3ZpZGVycyBvbmx5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcGxhaW4gPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ3BsYWluJztcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXIgPSAwO1xuXHRcdFx0fShzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3AxJywgcHJvdmlkZXJJZDogJ3BsYWluJyB9KSk7XG5cdFx0XHRjb25zdCBxdWljayA9IG5ldyBRdWlja0NoYXRQcm92aWRlcihzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ3NlZWQnLCBwcm92aWRlcklkOiAncXVpY2stcHJvdmlkZXInIH0pLCAncXVpY2stcHJvdmlkZXInLCAxLCBbXG5cdFx0XHRcdHsgYXV0aFJlcXVpcmVtZW50OiBTZXNzaW9uVHlwZUF1dGhSZXF1aXJlbWVudC5HaXRIdWIsIGlkOiAncXVpY2snLCBsYWJlbDogJ1F1aWNrJywgaWNvbjogQ29kaWNvbi52bSB9LFxuXHRcdFx0XHR7IGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLCBpZDogJ290aGVyJywgbGFiZWw6ICdPdGhlcicsIGljb246IENvZGljb24udm0gfSxcblx0XHRcdF0pO1xuXG5cdFx0XHRjb25zdCBzZXJ2aWNlID0gc2V0dXBRdWlja0NoYXQoW3BsYWluLCBxdWlja10pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXJ2aWNlLmdldFF1aWNrQ2hhdFNlc3Npb25UeXBlcygpLm1hcCh0ID0+ICh7IHByb3ZpZGVySWQ6IHQucHJvdmlkZXJJZCwgc2Vzc2lvblR5cGVJZDogdC5zZXNzaW9uVHlwZS5pZCB9KSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7IHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICdxdWljaycgfSxcblx0XHRcdFx0XHR7IHByb3ZpZGVySWQ6ICdxdWljay1wcm92aWRlcicsIHNlc3Npb25UeXBlSWQ6ICdvdGhlcicgfSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdsZWdhY3kgQ29waWxvdCBDTEkgbWlncmF0aW9uJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgUkFXX0lEID0gJ3Nlc3MtYWJjJztcblxuXHRcdGZ1bmN0aW9uIGxlZ2FjeUNsaVNlc3Npb24oKTogSVNlc3Npb24ge1xuXHRcdFx0cmV0dXJuIHN0dWJTZXNzaW9uKHtcblx0XHRcdFx0c2Vzc2lvbklkOiBgbGVnYWN5LSR7UkFXX0lEfWAsXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdkZWZhdWx0LWNvcGlsb3QnLFxuXHRcdFx0XHRzZXNzaW9uVHlwZTogQ09QSUxPVF9DTElfRUhfU0NIRU1FLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6IENPUElMT1RfQ0xJX0VIX1NDSEVNRSwgcGF0aDogYC8ke1JBV19JRH1gIH0pLFxuXHRcdFx0fSk7XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWlncmF0ZWRDbGlTZXNzaW9uKCk6IElTZXNzaW9uIHtcblx0XHRcdHJldHVybiBzdHViU2Vzc2lvbih7XG5cdFx0XHRcdHNlc3Npb25JZDogYG1pZ3JhdGVkLSR7UkFXX0lEfWAsXG5cdFx0XHRcdHByb3ZpZGVySWQ6IExPQ0FMX0FHRU5UX0hPU1RfUFJPVklERVJfSUQsXG5cdFx0XHRcdHNlc3Npb25UeXBlOiBDT1BJTE9UX0NMSV9FSF9TQ0hFTUUsXG5cdFx0XHRcdHJlc291cmNlOiBVUkkuZnJvbSh7IHNjaGVtZTogQ09QSUxPVF9DTElfTE9DQUxfQUhfU0NIRU1FLCBwYXRoOiBgLyR7UkFXX0lEfWAgfSksXG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBzZXJ2aWNlV2l0aFNlc3Npb25zKHNlc3Npb25zOiByZWFkb25seSBJU2Vzc2lvbltdKTogSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uge1xuXHRcdFx0Y29uc3QgcHJvdmlkZXIgPSBuZXcgY2xhc3MgZXh0ZW5kcyBUZXN0U2Vzc2lvbnNQcm92aWRlciB7XG5cdFx0XHRcdGNvbnN0cnVjdG9yKCkgeyBzdXBlcihzZXNzaW9uc1swXSk7IH1cblx0XHRcdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7IHJldHVybiBbLi4uc2Vzc2lvbnNdOyB9XG5cdFx0XHR9O1xuXHRcdFx0cmV0dXJuIGNyZWF0ZVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc2Vzc2lvbnNbMF0sIGRpc3Bvc2FibGVzLCBwcm92aWRlcikuc2VydmljZTtcblx0XHR9XG5cblx0XHR0ZXN0KCdnZXRTZXNzaW9ucyBoaWRlcyB0aGUgbGVnYWN5IGVudHJ5IG9uY2UgaXRzIG1pZ3JhdGVkIGFnZW50LWhvc3QgZW50cnkgZXhpc3RzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbGVnYWN5ID0gbGVnYWN5Q2xpU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3QgbWlncmF0ZWQgPSBtaWdyYXRlZENsaVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXJ2aWNlV2l0aFNlc3Npb25zKFtsZWdhY3ksIG1pZ3JhdGVkXSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHNlcnZpY2UuZ2V0U2Vzc2lvbnMoKS5tYXAocyA9PiBzLnNlc3Npb25JZCksXG5cdFx0XHRcdFttaWdyYXRlZC5zZXNzaW9uSWRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFNlc3Npb25zIGtlZXBzIHRoZSBsZWdhY3kgZW50cnkgdmlzaWJsZSB3aGVuIG5vIG1pZ3JhdGVkIGVudHJ5IGV4aXN0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGxlZ2FjeSA9IGxlZ2FjeUNsaVNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHNlcnZpY2UgPSBzZXJ2aWNlV2l0aFNlc3Npb25zKFtsZWdhY3ldKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c2VydmljZS5nZXRTZXNzaW9ucygpLm1hcChzID0+IHMuc2Vzc2lvbklkKSxcblx0XHRcdFx0W2xlZ2FjeS5zZXNzaW9uSWRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dldFNlc3Npb24gc3RpbGwgcmVzb2x2ZXMgdGhlIGhpZGRlbiBsZWdhY3kgZW50cnkgc28gaXQgY2FuIGJlIG1pZ3JhdGVkIG9uIG9wZW4nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsZWdhY3kgPSBsZWdhY3lDbGlTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBtaWdyYXRlZCA9IG1pZ3JhdGVkQ2xpU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IHNlcnZpY2VXaXRoU2Vzc2lvbnMoW2xlZ2FjeSwgbWlncmF0ZWRdKTtcblxuXHRcdFx0Ly8gSGlkZGVuIGZyb20gdGhlIGRpc3BsYXllZCBsaXN0LCB5ZXQgc3RpbGwgcmVzb2x2YWJsZSBieSByZXNvdXJjZSBzb1xuXHRcdFx0Ly8gYW4gZXhwbGljaXQgb3BlbiBjYW4gdHJpZ2dlciBtaWdyYXRpb24uXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGlzdGVkOiBzZXJ2aWNlLmdldFNlc3Npb25zKCkuc29tZShzID0+IHMuc2Vzc2lvbklkID09PSBsZWdhY3kuc2Vzc2lvbklkKSxcblx0XHRcdFx0XHRyZXNvbHZlZDogc2VydmljZS5nZXRTZXNzaW9uKGxlZ2FjeS5yZXNvdXJjZSk/LnNlc3Npb25JZCA/PyBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7IGxpc3RlZDogZmFsc2UsIHJlc29sdmVkOiBsZWdhY3kuc2Vzc2lvbklkIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG4vKipcbiAqIEJ1aWxkcyBhIG1hbmFnZW1lbnQgc2VydmljZSB3aXRoIGEgQ29waWxvdC1zdHlsZSBwcm92aWRlciBhbmQgYVxuICogbG9jYWwtYWdlbnQtaG9zdCBwcm92aWRlciwgZWFjaCB3aXRoIGFuIGV4cGxpY2l0IHtAbGluayBJU2Vzc2lvbnNQcm92aWRlci5vcmRlcn0uXG4gKiBVc2VkIHRvIGFzc2VydCB0aGF0IHRoZSBtYW5hZ2VtZW50IHNlcnZpY2Ugc3VyZmFjZXMgc2Vzc2lvbiB0eXBlcyBvcmRlcmVkIGJ5XG4gKiBwcm92aWRlciBvcmRlciAobG93ZXIgZmlyc3QpLlxuICovXG5mdW5jdGlvbiBjcmVhdGVPcmRlcmVkVHlwZXNTZXJ2aWNlKGRpc3Bvc2FibGVzOiBSZXR1cm5UeXBlPHR5cGVvZiBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGU+LCBjb3BpbG90T3JkZXI6IG51bWJlciwgYWdlbnRIb3N0T3JkZXI6IG51bWJlcik6IElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIHtcblx0Y29uc3QgY29waWxvdFByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gJ2RlZmF1bHQtY29waWxvdCc7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JkZXIgPSBjb3BpbG90T3JkZXI7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2Vzc2lvblR5cGVzOiByZWFkb25seSBJU2Vzc2lvblR5cGVbXSA9IFt7IGF1dGhSZXF1aXJlbWVudDogU2Vzc2lvblR5cGVBdXRoUmVxdWlyZW1lbnQuR2l0SHViLCBpZDogJ2NvcGlsb3QnLCBsYWJlbDogJ0NvcGlsb3QnLCBpY29uOiBDb2RpY29uLnZtIH1dO1xuXHR9KHN0dWJTZXNzaW9uKHsgc2Vzc2lvbklkOiAnYzEnLCBwcm92aWRlcklkOiAnZGVmYXVsdC1jb3BpbG90JyB9KSk7XG5cdGNvbnN0IGFnZW50SG9zdFByb3ZpZGVyID0gbmV3IGNsYXNzIGV4dGVuZHMgVGVzdFNlc3Npb25zUHJvdmlkZXIge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRDtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcmRlciA9IGFnZW50SG9zdE9yZGVyO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlczogcmVhZG9ubHkgSVNlc3Npb25UeXBlW10gPSBbeyBhdXRoUmVxdWlyZW1lbnQ6IFNlc3Npb25UeXBlQXV0aFJlcXVpcmVtZW50LkdpdEh1YiwgaWQ6ICdhZ2VudC1ob3N0JywgbGFiZWw6ICdBZ2VudCBIb3N0JywgaWNvbjogQ29kaWNvbi52bSB9XTtcblx0fShzdHViU2Vzc2lvbih7IHNlc3Npb25JZDogJ2ExJywgcHJvdmlkZXJJZDogTE9DQUxfQUdFTlRfSE9TVF9QUk9WSURFUl9JRCB9KSk7XG5cblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgSW5NZW1vcnlTdG9yYWdlU2VydmljZSgpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIG5ldyBOdWxsTG9nU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja0NvbnRleHRLZXlTZXJ2aWNlKCkpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBuZXcgVGVzdFNlc3Npb25zUHJvdmlkZXJzU2VydmljZShbY29waWxvdFByb3ZpZGVyLCBhZ2VudEhvc3RQcm92aWRlcl0pKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaTogZXh0VXJpQmlhc2VkSWdub3JlUGF0aENhc2UgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgVGVzdENoYXRXaWRnZXRTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcm9ncmVzc1NlcnZpY2UsIG5ldyBUZXN0UHJvZ3Jlc3NTZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDaGF0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ2hhdFNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkU3VibWl0UmVxdWVzdCA9IEV2ZW50Lk5vbmU7XG5cdH0pO1xuXG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSkpO1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsbUJBQW1CLCtCQUErQjtBQUMzRCxTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUMxRCxTQUFTLGtDQUFrQztBQUMzQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsWUFBWTtBQUNyQixTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDZCQUE2QjtBQUN0QyxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQW9CLHdCQUF1QztBQUMzRCxTQUFTLHdCQUF3Qix1QkFBdUI7QUFDeEQsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxrQ0FBa0MscUNBQXFDO0FBQ2hGLFNBQTBDLDBCQUEwQjtBQUVwRSxTQUEwRCxvQkFBb0I7QUFHOUUsU0FBUyxpQ0FBaUM7QUFFMUMsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyw0QkFBNEIsbUJBQW1CLGdCQUFzRixxQkFBcUI7QUFHbkssU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBc0QsMEJBQWlELGdDQUFnQztBQUNoSixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLG1CQUFtQiwwQkFBMEI7QUFDdEQsU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyxvQ0FBb0M7QUFDN0MsU0FBUyx1QkFBdUIsbUNBQW1DO0FBRW5FLE1BQU0sV0FBVztBQUFBLEVBQ2hCLFVBQVUsSUFBSSxNQUFNLGNBQWM7QUFBQSxFQUNsQyxXQUFXLG9CQUFJLEtBQUs7QUFBQSxFQUNwQixPQUFPLGdCQUFnQixNQUFNO0FBQUEsRUFDN0IsV0FBVyxnQkFBZ0Isb0JBQUksS0FBSyxDQUFDO0FBQUEsRUFDckMsUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLEVBQ3pCLFNBQVMsZ0JBQWdCLENBQUMsQ0FBQztBQUFBLEVBQzNCLGFBQWEsZ0JBQWdCLE1BQVM7QUFBQSxFQUN0QyxTQUFTLGdCQUFnQixNQUFTO0FBQUEsRUFDbEMsTUFBTSxnQkFBZ0IsTUFBUztBQUFBLEVBQy9CLFlBQVksZ0JBQWdCLEtBQUs7QUFBQSxFQUNqQyxRQUFRLGdCQUFnQixJQUFJO0FBQUEsRUFDNUIsZUFBZSxnQkFBZ0Isa0JBQWtCLElBQUk7QUFBQSxFQUNyRCxhQUFhLGdCQUFnQixNQUFTO0FBQUEsRUFDdEMsYUFBYSxnQkFBZ0IsTUFBUztBQUN2QztBQUVBLFNBQVMsWUFBWSxXQUFxRjtBQUN6RyxTQUFPO0FBQUEsSUFDTixVQUFVLElBQUksTUFBTSxXQUFXLFVBQVUsU0FBUyxFQUFFO0FBQUEsSUFDcEQsYUFBYTtBQUFBLElBQ2IsTUFBTSxRQUFRO0FBQUEsSUFDZCxXQUFXLG9CQUFJLEtBQUs7QUFBQSxJQUNwQixXQUFXLGdCQUFnQixNQUFTO0FBQUEsSUFDcEMsT0FBTyxnQkFBZ0IsTUFBTTtBQUFBLElBQzdCLFdBQVcsZ0JBQWdCLG9CQUFJLEtBQUssQ0FBQztBQUFBLElBQ3JDLFFBQVEsZ0JBQWdCLENBQUM7QUFBQSxJQUN6QixZQUFZLGdCQUFnQixDQUFDLENBQUM7QUFBQSxJQUM5QixTQUFTLGdCQUFnQixDQUFDLENBQUM7QUFBQSxJQUMzQixTQUFTLGdCQUFnQixNQUFTO0FBQUEsSUFDbEMsTUFBTSxnQkFBZ0IsTUFBUztBQUFBLElBQy9CLFNBQVMsZ0JBQWdCLEtBQUs7QUFBQSxJQUM5QixZQUFZLGdCQUFnQixLQUFLO0FBQUEsSUFDakMsUUFBUSxnQkFBZ0IsSUFBSTtBQUFBLElBQzVCLGFBQWEsZ0JBQWdCLE1BQVM7QUFBQSxJQUN0QyxhQUFhLGdCQUFnQixNQUFTO0FBQUEsSUFDdEMsT0FBTyxnQkFBZ0IsQ0FBQyxDQUFDO0FBQUEsSUFDekIsVUFBVSxnQkFBZ0IsUUFBUTtBQUFBLElBQ2xDLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLE1BQU0sQ0FBQztBQUFBLElBQzlELEdBQUc7QUFBQSxFQUNKO0FBQ0Q7QUFFQSxNQUFNLDhCQUE4QixLQUF5QixFQUFFO0FBQUEsRUFBL0Q7QUFBQTtBQUNDLFNBQVMsU0FBZ0IsQ0FBQztBQUMxQixTQUFRLDBCQUEwQixvQkFBSSxJQUFZO0FBQUE7QUFBQSxFQUVsRCxNQUFlLFlBQVksaUJBQXNCLFNBQXNELFVBQWlFO0FBQ3ZLLFNBQUssT0FBTyxLQUFLLGVBQWU7QUFDaEMsV0FBTztBQUFBLEVBQ1I7QUFBQTtBQUFBLEVBR0EseUJBQXlCLFVBQXFCO0FBQzdDLFNBQUssd0JBQXdCLElBQUksU0FBUyxTQUFTLENBQUM7QUFBQSxFQUNyRDtBQUFBLEVBRUEsOEJBQW9DO0FBQ25DLFNBQUssd0JBQXdCLE1BQU07QUFBQSxFQUNwQztBQUFBLEVBRVMsMkJBQTJCLGlCQUErQztBQUNsRixRQUFJLEtBQUssd0JBQXdCLElBQUksZ0JBQWdCLFNBQVMsQ0FBQyxHQUFHO0FBQ2pFLGFBQU8sQ0FBQztBQUFBLElBQ1Q7QUFDQSxXQUFPO0FBQUEsRUFDUjtBQUNEO0FBRUEsTUFBTSx3QkFBd0IsS0FBbUIsRUFBRTtBQUFBLEVBQW5EO0FBQUE7QUFDQyxTQUFpQixzQkFBc0IsSUFBSSxRQUFvQztBQUMvRSxTQUFrQixxQkFBcUIsS0FBSyxvQkFBb0I7QUFDaEUsU0FBUyxxQkFBNEIsQ0FBQztBQUN0QyxTQUFTLGtCQUF5QixDQUFDO0FBQ25DLDZCQUFvQjtBQUVwQiw2QkFBb0I7QUFBQTtBQUFBLEVBRXBCLE1BQWUscUJBQXFCLGlCQUFnRTtBQUNuRyxTQUFLLGdCQUFnQixLQUFLLGVBQWU7QUFDekMsUUFBSSxDQUFDLEtBQUssbUJBQW1CO0FBQzVCLGFBQU87QUFBQSxJQUNSO0FBQ0EsV0FBTyxFQUFFLFFBQVEsQ0FBQyxHQUFpQixTQUFTLE1BQU07QUFBRSxXQUFLO0FBQUEsSUFBcUIsRUFBRTtBQUFBLEVBQ2pGO0FBQUEsRUFFQSxjQUFjLE9BQXlDO0FBQ3RELFNBQUssb0JBQW9CLEtBQUssS0FBSztBQUFBLEVBQ3BDO0FBQUEsRUFFQSxVQUFnQjtBQUNmLFNBQUssb0JBQW9CLFFBQVE7QUFBQSxFQUNsQztBQUFBLEVBRUEsTUFBZSwrQkFBK0IsaUJBQXFDO0FBQ2xGLFNBQUssbUJBQW1CLEtBQUssZUFBZTtBQUM1QyxRQUFJLEtBQUssYUFBYTtBQUNyQixZQUFNLEtBQUs7QUFBQSxJQUNaO0FBQUEsRUFDRDtBQUNEO0FBRUEsTUFBTSw0QkFBNEIsS0FBdUIsRUFBRTtBQUFBLEVBQzFELE1BQWUsYUFBZ0IsVUFBMkQsTUFBc0U7QUFDL0osV0FBTyxLQUFLLEVBQUUsU0FBUztBQUFBLElBQUUsRUFBRSxDQUFDO0FBQUEsRUFDN0I7QUFDRDtBQUVBLE1BQU0sNENBQTRDLEtBQXVDLEVBQUU7QUFBQSxFQUEzRjtBQUFBO0FBQ0MsbUJBQVU7QUFDVixTQUFTLGdCQUF1QixDQUFDO0FBQUE7QUFBQSxFQUVqQyxNQUFlLGdCQUFnQixLQUFVO0FBQ3hDLFNBQUssY0FBYyxLQUFLLEdBQUc7QUFDM0IsV0FBTyxFQUFFLEtBQUssU0FBUyxLQUFLLFFBQVE7QUFBQSxFQUNyQztBQUNEO0FBRUEsTUFBTSxxQ0FBcUMsS0FBZ0MsRUFBRTtBQUFBLEVBRzVFLFlBQTZCLFlBQTBDO0FBQ3RFLFVBQU07QUFEc0I7QUFGN0IsU0FBa0IsdUJBQXVCLE1BQU07QUFBQSxFQUkvQztBQUFBLEVBRVMsbUJBQTBCO0FBQ2xDLFVBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLEVBQ2xDO0FBQUEsRUFFUyxlQUFvQztBQUM1QyxXQUFPLENBQUMsR0FBRyxLQUFLLFVBQVUsRUFBRSxLQUFLLENBQUMsR0FBRyxNQUFNLEVBQUUsUUFBUSxFQUFFLEtBQUs7QUFBQSxFQUM3RDtBQUFBLEVBRVMsWUFBeUMsWUFBbUM7QUFDcEYsV0FBTyxLQUFLLFdBQVcsS0FBSyxjQUFZLFNBQVMsT0FBTyxVQUFVO0FBQUEsRUFDbkU7QUFDRDtBQUVBLE1BQU0sNkJBQTZCLEtBQXdCLEVBQUU7QUFBQSxFQVU1RCxZQUE2QixVQUFvQjtBQUNoRCxVQUFNO0FBRHNCO0FBVDdCLFNBQWtCLEtBQWE7QUFDL0IsU0FBa0IsUUFBUTtBQUMxQixTQUFrQixPQUFPLFFBQVE7QUFDakMsU0FBa0IsUUFBZ0I7QUFDbEMsU0FBa0IsZUFBd0MsQ0FBQyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFFBQVEsT0FBTyxRQUFRLE1BQU0sUUFBUSxJQUFJLCtCQUErQixLQUFLLENBQUM7QUFDbk0sU0FBa0IsMEJBQTBCLE1BQU07QUFDbEQsU0FBa0Isc0JBQXNCLE1BQU07QUFDOUMsU0FBa0IsZ0JBQWdCLENBQUM7QUFhbkMsU0FBa0Isb0JBQW9CLE1BQU07QUFBQSxFQVQ1QztBQUFBLEVBRVMsY0FBMEI7QUFBRSxXQUFPLENBQUMsS0FBSyxRQUFRO0FBQUEsRUFBRztBQUFBLEVBQ3BELGlCQUFpQixZQUFnRDtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDckYsaUJBQWlCLFlBQWtCLGdCQUFtQztBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVU7QUFBQSxFQUM5RixnQkFBZ0IsWUFBaUM7QUFBRSxXQUFPLENBQUMsR0FBRyxLQUFLLFlBQVk7QUFBQSxFQUFHO0FBQUEsRUFDM0YsTUFBZSxhQUE0QjtBQUFBLEVBQUU7QUFBQSxFQUNwQyxvQkFBNEM7QUFBRSxXQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsd0JBQXdCLEVBQUUsTUFBTSxlQUFlLEdBQUcsYUFBYSxPQUFVO0FBQUEsRUFBRztBQUFBLEVBQy9JLHdCQUFvRDtBQUFFLFdBQU8sRUFBRSx1QkFBdUIsTUFBTSxjQUFjLE1BQU0seUJBQXlCLE9BQU8sd0JBQXdCLE1BQU07QUFBQSxFQUFHO0FBQUEsRUFFakwsU0FBUyxZQUFvQixVQUF3QjtBQUFBLEVBQUU7QUFBQSxFQUNoRSxNQUFlLGlCQUFnQztBQUFBLEVBQUU7QUFBQSxFQUNqRCxNQUFlLG1CQUFrQztBQUFBLEVBQUU7QUFBQSxFQUNuRCxNQUFlLGdCQUErQjtBQUFBLEVBQUU7QUFBQSxFQUNoRCxNQUFlLGVBQWUsYUFBK0M7QUFBQSxFQUFFO0FBQUEsRUFDL0UsTUFBZSxhQUErQjtBQUFFLFdBQU87QUFBQSxFQUFNO0FBQUEsRUFDcEQsaUJBQWlCLFlBQTBCO0FBQUEsRUFBRTtBQUFBLEVBQ3RELE1BQWUsWUFBWSxZQUFvQixlQUFvQixVQUFrRDtBQUFFLFdBQU8sS0FBSztBQUFBLEVBQVU7QUFBQSxFQUM3SSxNQUFlLGdCQUFnQztBQUFFLFdBQU8sS0FBSyxTQUFTLFNBQVMsSUFBSTtBQUFBLEVBQUc7QUFBQSxFQUN0RixNQUFlLFNBQVMsWUFBb0IsYUFBa0IsU0FBaUM7QUFBRSxVQUFNLElBQUksTUFBTSxpQkFBaUI7QUFBQSxFQUFHO0FBQUEsRUFDckksTUFBZSxlQUFlLFlBQW9CLGFBQWtCLFNBQWlCLFlBQWlEO0FBQUUsVUFBTSxJQUFJLE1BQU0saUJBQWlCO0FBQUEsRUFBRztBQUM3SztBQUVBLFNBQVMsZ0NBQ1IsU0FDQSxhQUNBLFdBQTZELElBQUkscUJBQXFCLE9BQU8sR0FDN0Ysa0NBQWtDLElBQUksb0NBQW9DLEdBQzFFLDhCQUNtTDtBQUNuTCxRQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSxRQUFNLG9CQUFvQixJQUFJLHNCQUFzQjtBQUNwRCxRQUFNLGNBQWMsWUFBWSxJQUFJLElBQUksZ0JBQWdCLENBQUM7QUFDekQsUUFBTSxZQUFZLE1BQU0sUUFBUSxRQUFRLElBQUksV0FBVyxDQUFDLFFBQVE7QUFDaEUsUUFBTSxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUM7QUFFckUsdUJBQXFCLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDeEYsdUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx1QkFBcUIsS0FBSyxvQkFBb0IsaUJBQWlCO0FBQy9ELHVCQUFxQixLQUFLLDJCQUEyQixJQUFJLDZCQUE2QixTQUFTLENBQUM7QUFDaEcsdUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsUUFBUSwyQkFBMkIsQ0FBQztBQUNyRix1QkFBcUIsS0FBSyxvQkFBb0IsaUJBQWlCO0FBQy9ELHVCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLHVCQUFxQixLQUFLLGNBQWMsV0FBVztBQUNuRCx1QkFBcUIsS0FBSywyQkFBMkIsSUFBSSxjQUFjLEtBQWdDLEVBQUU7QUFBQSxJQUMvRixjQUFvQjtBQUFBLElBQUU7QUFBQSxFQUNoQyxHQUFDO0FBQ0QsdUJBQXFCLEtBQUssa0NBQWtDLCtCQUErQjtBQUMzRixNQUFJLDhCQUE4QjtBQUNqQyx5QkFBcUIsS0FBSywrQkFBK0IsNEJBQTRCO0FBQUEsRUFDdEY7QUFFQSxRQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQzlGLFFBQU0sT0FBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFDbEUsU0FBTyxFQUFFLFNBQVMsTUFBTSxtQkFBbUIsYUFBYSxrQkFBa0I7QUFDM0U7QUFNQSxNQUFNLGdDQUFnQyxLQUEyQixFQUFFO0FBQUEsRUFBbkU7QUFBQTtBQUNDLFNBQWtCLG9CQUFvQixNQUFNO0FBQzVDLFNBQWtCLDZCQUE2QixNQUFNO0FBQUE7QUFBQSxFQUM1Qyx3QkFBOEI7QUFBQSxFQUFFO0FBQUEsRUFDaEMsZUFBcUI7QUFBQSxFQUFFO0FBQ2pDO0FBT0EsU0FBUyxXQUFXLHNCQUFnRCxTQUFxQyxhQUEwRjtBQUNsTSx1QkFBcUIsS0FBSyw0QkFBNEIsT0FBTztBQUM3RCx1QkFBcUIsS0FBSyxzQkFBc0IsSUFBSSx3QkFBd0IsQ0FBQztBQUM3RSx1QkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksa0JBQWtCLElBQUksZUFBZSxHQUFHLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUMsQ0FBQyxDQUFDO0FBQ3pKLHVCQUFxQixLQUFLLHVCQUF1QixJQUFJLHlCQUF5QixDQUFDO0FBQy9FLFNBQU8sWUFBWSxJQUFJLHFCQUFxQixlQUFlLGVBQWUsQ0FBQztBQUM1RTtBQUVBLE1BQU0sNkJBQTZCLE1BQU07QUFFeEMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFVBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxXQUFXLFlBQVksT0FBTyxDQUFDO0FBQ3hFLFVBQU0sRUFBRSxTQUFTLFlBQVksSUFBSSxnQ0FBZ0MsU0FBUyxXQUFXO0FBRXJGLFVBQU0sUUFBUSxxQkFBcUIsT0FBTztBQUUxQyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsWUFBWTtBQUFBLE1BQ3BCLFdBQVcsWUFBWTtBQUFBLE1BQ3ZCLG1CQUFtQixZQUFZO0FBQUEsSUFDaEMsR0FBRztBQUFBLE1BQ0YsUUFBUSxDQUFDLFNBQVMsUUFBUTtBQUFBLE1BQzFCLFdBQVcsQ0FBQyxTQUFTLFFBQVE7QUFBQSxNQUM3QixtQkFBbUI7QUFBQSxJQUNwQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwRUFBMEUsWUFBWTtBQUMxRixVQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsV0FBVyxZQUFZLE9BQU8sQ0FBQztBQUN4RSxVQUFNLEVBQUUsU0FBUyxZQUFZLElBQUksZ0NBQWdDLFNBQVMsV0FBVztBQUNyRixnQkFBWSxjQUFjLElBQUksTUFBTSxlQUFlO0FBRW5ELFVBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxxQkFBcUIsT0FBTyxHQUFHLGVBQWU7QUFFakYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLFlBQVk7QUFBQSxNQUNwQixXQUFXLFlBQVk7QUFBQSxNQUN2QixtQkFBbUIsWUFBWTtBQUFBLElBQ2hDLEdBQUc7QUFBQSxNQUNGLFFBQVEsQ0FBQyxTQUFTLFFBQVE7QUFBQSxNQUMxQixXQUFXLENBQUMsU0FBUyxRQUFRO0FBQUEsTUFDN0IsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsscUVBQXFFLFlBQVk7QUFDckYsVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLFdBQVcsWUFBWSxPQUFPLENBQUM7QUFDeEUsVUFBTSxFQUFFLFNBQVMsWUFBWSxJQUFJLGdDQUFnQyxTQUFTLFdBQVc7QUFDckYsZ0JBQVksb0JBQW9CO0FBRWhDLFVBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxxQkFBcUIsT0FBTyxHQUFHLDhDQUE4QztBQUVoSCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFFBQVEsWUFBWTtBQUFBLE1BQ3BCLFdBQVcsWUFBWTtBQUFBLE1BQ3ZCLG1CQUFtQixZQUFZO0FBQUEsSUFDaEMsR0FBRztBQUFBLE1BQ0YsUUFBUSxDQUFDLFNBQVMsUUFBUTtBQUFBLE1BQzFCLFdBQVcsQ0FBQztBQUFBLE1BQ1osbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssdUVBQXVFLFlBQVk7QUFDdkYsVUFBTSxVQUFVLGdCQUFnQixXQUFXLElBQUk7QUFDL0MsVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLFdBQVcsWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNqRixVQUFNLEVBQUUsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLFdBQVc7QUFFckUsUUFBSSxXQUFXO0FBQ2YsVUFBTSxjQUFjLEtBQUssWUFBWSxRQUFRLFFBQVEsRUFBRSxLQUFLLE1BQU07QUFBRSxpQkFBVztBQUFBLElBQU0sQ0FBQztBQUN0RixVQUFNLFFBQVEsUUFBUTtBQUV0QixXQUFPLGdCQUFnQixFQUFFLFNBQVMsR0FBRyxFQUFFLFVBQVUsTUFBTSxDQUFDO0FBRXhELFlBQVEsSUFBSSxPQUFPLE1BQVM7QUFDNUIsVUFBTTtBQUVOLFdBQU8sZ0JBQWdCLEVBQUUsU0FBUyxHQUFHLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFBQSxFQUN4RCxDQUFDO0FBRUQsT0FBSyw2RkFBNkYsWUFBWTtBQUM3RyxVQUFNLFNBQVMsZ0JBQWdCLFVBQVUsS0FBSztBQUM5QyxVQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsVUFBVSxZQUFZLFFBQVEsT0FBTyxDQUFDO0FBQy9FLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDdkQsTUFBZSxvQkFBb0IsWUFBb0IsTUFBOEI7QUFDcEYsZUFBTyxJQUFJLE1BQU0sTUFBUztBQUFBLE1BQzNCO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUcvRSxVQUFNLG1CQUFtQixRQUFRLE9BQU8sSUFBSTtBQUc1QyxVQUFNLEtBQUssWUFBWSxRQUFRLFFBQVE7QUFDdkMsVUFBTSxrQkFBa0IsUUFBUSxPQUFPLElBQUk7QUFFM0MsV0FBTztBQUFBLE1BQ04sRUFBRSxrQkFBa0IsaUJBQWlCLFVBQVUsS0FBSyxjQUFjLElBQUksR0FBRyxVQUFVO0FBQUEsTUFDbkYsRUFBRSxrQkFBa0IsT0FBTyxpQkFBaUIsTUFBTSxVQUFVLFNBQVM7QUFBQSxJQUN0RTtBQUFBLEVBQ0QsQ0FBQztBQUVELE9BQUssMERBQTBELE1BQU07QUFDcEUsVUFBTSxTQUFTLFlBQVksRUFBRSxXQUFXLFVBQVUsWUFBWSxPQUFPLENBQUM7QUFDdEUsVUFBTSxRQUFRLFlBQVksRUFBRSxXQUFXLFNBQVMsWUFBWSxRQUFRLFFBQVEsZ0JBQWdCLEtBQUssRUFBRSxDQUFDO0FBQ3BHLFVBQU0sRUFBRSxLQUFLLElBQUksZ0NBQWdDLFFBQVEsV0FBVztBQUdwRSxXQUFPO0FBQUEsTUFDTixFQUFFLFVBQVUsS0FBSyxjQUFjLElBQUksR0FBRyxXQUFXLFdBQVcsTUFBTSxPQUFPLElBQUksRUFBRTtBQUFBLE1BQy9FLEVBQUUsVUFBVSxRQUFXLFdBQVcsTUFBTTtBQUFBLElBQ3pDO0FBQUEsRUFDRCxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsWUFBWTtBQUNwRyxVQUFNLGtCQUFrQixZQUFZLEVBQUUsV0FBVyxZQUFZLFlBQVksT0FBTyxDQUFDO0FBQ2pGLFVBQU0sc0JBQXNCLFlBQVksSUFBSSxJQUFJLFFBQTZCLENBQUM7QUFDOUUsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUV2RCxjQUFjO0FBQUUsY0FBTSxlQUFlO0FBRHJDLGFBQWtCLHNCQUFzQixvQkFBb0I7QUFBQSxNQUNwQjtBQUFBLElBQ3pDO0FBRUEsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFFcEQseUJBQXFCLEtBQUssaUJBQWlCLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDLENBQUM7QUFDeEYseUJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCx5QkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMxRix5QkFBcUIsS0FBSywyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRyx5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLHlCQUFxQixLQUFLLG9CQUFvQixpQkFBaUI7QUFDL0QseUJBQXFCLEtBQUssa0JBQWtCLElBQUksb0JBQW9CLENBQUM7QUFDckUseUJBQXFCLEtBQUssY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLE1BQW5DO0FBQUE7QUFDM0MsYUFBa0IscUJBQXFCLE1BQU07QUFBQTtBQUFBLElBQzlDLEdBQUM7QUFFRCxVQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQzlGLFVBQU0sT0FBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFHbEUsVUFBTSxLQUFLLFlBQVksZ0JBQWdCLFFBQVE7QUFDL0MsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxVQUFVO0FBR2xFLFVBQU0sZUFBZSxZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDO0FBRzNFLHdCQUFvQixLQUFLLEVBQUUsT0FBTyxDQUFDLFlBQVksR0FBRyxTQUFTLENBQUMsR0FBRyxTQUFTLENBQUMsRUFBRSxDQUFDO0FBRzVFLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsVUFBVTtBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sUUFBZSxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUMxRSxVQUFNLFFBQWUsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sZ0JBQWdCLEVBQUU7QUFDMUUsVUFBTSxXQUFXLFlBQVk7QUFBQSxNQUM1QixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLEtBQUssQ0FBQztBQUFBLE1BQzlCLFVBQVUsZ0JBQWdCLEtBQUs7QUFBQSxJQUNoQyxDQUFDO0FBQ0QsVUFBTSxXQUFXLFlBQVk7QUFBQSxNQUM1QixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLEtBQUssQ0FBQztBQUFBLE1BQzlCLFVBQVUsZ0JBQWdCLEtBQUs7QUFBQSxJQUNoQyxDQUFDO0FBQ0QsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUN2RCxjQUFjO0FBQUUsY0FBTSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQ3hCLGNBQTBCO0FBQUUsZUFBTyxDQUFDLFVBQVUsUUFBUTtBQUFBLE1BQUc7QUFBQSxJQUNuRTtBQUNBLFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFVBQVUsYUFBYSxRQUFRO0FBRW5GLFVBQU0sWUFBWSxRQUFRLDBCQUEwQixJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFFL0UsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixXQUFXLFdBQVcsUUFBUTtBQUFBLE1BQzlCLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFNBQVMsUUFBUSwwQkFBMEIsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsSUFDeEUsR0FBRztBQUFBLE1BQ0YsV0FBVztBQUFBLE1BQ1gsTUFBTTtBQUFBLE1BQ04sU0FBUztBQUFBLElBQ1YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxnQkFBZ0IsWUFBWSxFQUFFLFdBQVcsVUFBVSxZQUFZLE9BQU8sQ0FBQztBQUM3RSxVQUFNLHNCQUFzQixZQUFZLElBQUksSUFBSSxRQUE2QixDQUFDO0FBRTlFLFFBQUksV0FBdUIsQ0FBQztBQUM1QixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BRXZELGNBQWM7QUFBRSxjQUFNLGFBQWE7QUFEbkMsYUFBa0Isc0JBQXNCLG9CQUFvQjtBQUFBLE1BQ3RCO0FBQUEsTUFDN0IsY0FBMEI7QUFBRSxlQUFPO0FBQUEsTUFBVTtBQUFBLElBQ3ZEO0FBRUEsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsVUFBTSxvQkFBb0IsSUFBSSxzQkFBc0I7QUFJcEQsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQzVELFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFDQSxLQUFLLFVBQVUsQ0FBQyxFQUFFLGlCQUFpQixjQUFjLFNBQVMsU0FBUyxHQUFHLGNBQWMsR0FBRyxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDeEc7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLHlCQUFxQixLQUFLLGlCQUFpQixPQUFPO0FBQ2xELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssb0JBQW9CLFlBQVksSUFBSSxJQUFJLHNCQUFzQixDQUFDLENBQUM7QUFDMUYseUJBQXFCLEtBQUssMkJBQTJCLElBQUksNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakcseUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsUUFBUSwyQkFBMkIsQ0FBQztBQUNyRix5QkFBcUIsS0FBSyxvQkFBb0IsaUJBQWlCO0FBQy9ELHlCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxNQUFuQztBQUFBO0FBQzNDLGFBQWtCLHFCQUFxQixNQUFNO0FBQUE7QUFBQSxJQUM5QyxHQUFDO0FBRUQsVUFBTSxVQUFVLFlBQVksSUFBSSxxQkFBcUIsZUFBZSx5QkFBeUIsQ0FBQztBQUM5RixVQUFNLE9BQU8sV0FBVyxzQkFBc0IsU0FBUyxXQUFXO0FBSWxFLFVBQU0saUJBQWlCLEtBQUssdUJBQXVCO0FBQ25ELFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsT0FBTyxDQUFDLE1BQWtDLENBQUMsQ0FBQyxDQUFDLEVBQUUsSUFBSSxPQUFLLEVBQUUsU0FBUztBQUFBLE1BQ3ZHLGlCQUFpQixLQUFLLHVCQUF1QixJQUFJO0FBQUEsSUFDbEQsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDO0FBQUEsTUFDVixpQkFBaUI7QUFBQSxJQUNsQixDQUFDO0FBS0QsZUFBVyxDQUFDLGFBQWE7QUFDekIsd0JBQW9CLEtBQUssRUFBRSxPQUFPLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFFN0UsVUFBTTtBQUNOLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEdBQUcsU0FBUztBQUFBLE1BQ3pELGlCQUFpQixLQUFLLHVCQUF1QixJQUFJO0FBQUEsSUFDbEQsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDLGNBQWMsU0FBUztBQUFBLE1BQ2pDLGlCQUFpQjtBQUFBLElBQ2xCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtEQUErRCxZQUFZO0FBQy9FLFVBQU0sY0FBcUIsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxnQkFBZ0IsQ0FBQyxFQUFFO0FBQzVHLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osUUFBUSxnQkFBZ0IsQ0FBQztBQUFBLE1BQ3pCLE9BQU8sZ0JBQWdCLENBQUMsV0FBVyxDQUFDO0FBQUEsTUFDcEMsVUFBVSxnQkFBZ0IsV0FBVztBQUFBLElBQ3RDLENBQUM7QUFFRCxVQUFNLFdBQVcsSUFBSSxxQkFBcUIsT0FBTztBQUNqRCxVQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFFNUQsVUFBTSxjQUFjLE1BQU07QUFDekIsWUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsMkJBQXFCLEtBQUssaUJBQWlCLE9BQU87QUFDbEQsMkJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCwyQkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMxRiwyQkFBcUIsS0FBSywyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRywyQkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLDJCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLDJCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLDJCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxRQUFuQztBQUFBO0FBQzNDLGVBQWtCLHFCQUFxQixNQUFNO0FBQUE7QUFBQSxNQUM5QyxHQUFDO0FBQ0QsWUFBTSxVQUFVLFlBQVksSUFBSSxxQkFBcUIsZUFBZSx5QkFBeUIsQ0FBQztBQUM5RixZQUFNLE9BQU8sV0FBVyxzQkFBc0IsU0FBUyxXQUFXO0FBQ2xFLGFBQU8sRUFBRSxTQUFTLEtBQUs7QUFBQSxJQUN4QjtBQUdBLFVBQU0sUUFBUSxZQUFZO0FBQzFCLFVBQU0sTUFBTSxLQUFLLFlBQVksUUFBUSxRQUFRO0FBQzdDLFdBQU8sWUFBWSxNQUFNLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxHQUFHO0FBQ2pFLFVBQU0sUUFBUSxNQUFNO0FBR3BCLFVBQU0sU0FBUyxZQUFZO0FBQzNCLFVBQU0sT0FBTyxLQUFLLHVCQUF1QjtBQUV6QyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsT0FBTyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEdBQUcsYUFBYSxJQUFJO0FBQUEsTUFDeEUsUUFBUSxPQUFPLEtBQUssY0FBYyxJQUFJLEdBQUcsYUFBYTtBQUFBLElBQ3ZELEdBQUc7QUFBQSxNQUNGLFNBQVMsQ0FBQyxHQUFHO0FBQUEsTUFDYixRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxpRkFBaUYsWUFBWTtBQUNqRyxVQUFNLGdCQUFnQixZQUFZLEVBQUUsV0FBVyxVQUFVLFlBQVksT0FBTyxDQUFDO0FBQzdFLFVBQU0sYUFBYSxZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDO0FBQ3pFLFVBQU0sc0JBQXNCLFlBQVksSUFBSSxJQUFJLFFBQTZCLENBQUM7QUFFOUUsUUFBSSxXQUF1QixDQUFDO0FBQzVCLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFFdkQsY0FBYztBQUFFLGNBQU0sYUFBYTtBQURuQyxhQUFrQixzQkFBc0Isb0JBQW9CO0FBQUEsTUFDdEI7QUFBQSxNQUM3QixjQUEwQjtBQUFFLGVBQU87QUFBQSxNQUFVO0FBQUEsTUFDN0MsbUJBQTZCO0FBQUUsZUFBTztBQUFBLE1BQVk7QUFBQSxNQUNsRCxtQkFBc0M7QUFBRSxlQUFPLEVBQUUsU0FBUyxDQUFDLEdBQUcsb0JBQW9CLE1BQU07QUFBQSxNQUFtQztBQUFBLElBQ3JJO0FBRUEsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQzVELFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFDQSxLQUFLLFVBQVUsQ0FBQyxFQUFFLGlCQUFpQixjQUFjLFNBQVMsU0FBUyxHQUFHLGNBQWMsR0FBRyxVQUFVLEtBQUssQ0FBQyxDQUFDO0FBQUEsTUFDeEc7QUFBQSxNQUNBO0FBQUEsSUFDRDtBQUVBLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLGlCQUFpQixPQUFPO0FBQ2xELHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssb0JBQW9CLFlBQVksSUFBSSxJQUFJLHNCQUFzQixDQUFDLENBQUM7QUFDMUYseUJBQXFCLEtBQUssMkJBQTJCLElBQUksNkJBQTZCLENBQUMsUUFBUSxDQUFDLENBQUM7QUFDakcseUJBQXFCLEtBQUsscUJBQXFCLEVBQUUsUUFBUSwyQkFBMkIsQ0FBQztBQUNyRix5QkFBcUIsS0FBSyxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQztBQUN6RSx5QkFBcUIsS0FBSyxrQkFBa0IsSUFBSSxvQkFBb0IsQ0FBQztBQUNyRSx5QkFBcUIsS0FBSyxjQUFjLElBQUksY0FBYyxLQUFtQixFQUFFO0FBQUEsTUFBbkM7QUFBQTtBQUMzQyxhQUFrQixxQkFBcUIsTUFBTTtBQUFBO0FBQUEsSUFDOUMsR0FBQztBQUNELFVBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUseUJBQXlCLENBQUM7QUFDOUYsVUFBTSxPQUFPLFdBQVcsc0JBQXNCLFNBQVMsV0FBVztBQUdsRSxVQUFNLGlCQUFpQixLQUFLLHVCQUF1QjtBQUNuRCxVQUFNLFFBQVEsUUFBUTtBQUl0QixZQUFRLGlCQUFpQixJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFHcEQsZUFBVyxDQUFDLGFBQWE7QUFDekIsd0JBQW9CLEtBQUssRUFBRSxPQUFPLENBQUMsYUFBYSxHQUFHLFNBQVMsQ0FBQyxHQUFHLFNBQVMsQ0FBQyxFQUFFLENBQUM7QUFDN0UsVUFBTTtBQUVOLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsV0FBVyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsS0FBSyxPQUFLLEdBQUcsY0FBYyxRQUFRO0FBQUEsTUFDekUsUUFBUSxLQUFLLGNBQWMsSUFBSSxHQUFHLGFBQWE7QUFBQSxJQUNoRCxHQUFHO0FBQUEsTUFDRixXQUFXO0FBQUEsTUFDWCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxLQUFLLHVFQUF1RSxZQUFZO0FBQzVGLFVBQU0sZ0JBQWdCLENBQUMsU0FBaUM7QUFBQSxNQUN2RDtBQUFBLE1BQ0EsT0FBTztBQUFBLE1BQ1AsTUFBTSxRQUFRO0FBQUEsTUFDZCxTQUFTLENBQUMsRUFBRSxNQUFNLEtBQUssa0JBQWtCLEtBQUssTUFBTSxNQUFNLGFBQWEsT0FBVSxDQUFDO0FBQUEsTUFDbEYsd0JBQXdCO0FBQUEsTUFDeEIsb0JBQW9CO0FBQUEsSUFDckI7QUFFQSxVQUFNLGFBQWEsSUFBSSxNQUFNLG9CQUFvQjtBQUNqRCxVQUFNLGNBQWMsWUFBWSxFQUFFLFdBQVcsUUFBUSxZQUFZLFFBQVEsV0FBVyxnQkFBZ0IsY0FBYyxVQUFVLENBQUMsRUFBRSxDQUFDO0FBRWhJLFFBQUk7QUFDSixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQ3ZELGNBQWM7QUFBRSxjQUFNLFdBQVc7QUFBQSxNQUFHO0FBQUEsTUFDM0IsY0FBMEI7QUFBRSxlQUFPLENBQUMsV0FBVztBQUFBLE1BQUc7QUFBQSxNQUNsRCxpQkFBaUIsV0FBb0M7QUFBRSxlQUFPLGNBQWMsU0FBVTtBQUFBLE1BQUc7QUFBQSxNQUN6RixpQkFBaUIsV0FBMkI7QUFDcEQsMkJBQW1CO0FBQ25CLGVBQU8sWUFBWSxFQUFFLFdBQVcsYUFBYSxZQUFZLFFBQVEsV0FBVyxnQkFBZ0IsY0FBYyxTQUFVLENBQUMsRUFBRSxDQUFDO0FBQUEsTUFDekg7QUFBQSxJQUNEO0FBRUEsVUFBTSxFQUFFLEtBQUssSUFBSSxnQ0FBZ0MsYUFBYSxhQUFhLFFBQVE7QUFHbkYsVUFBTSxLQUFLLFlBQVksWUFBWSxRQUFRO0FBQzNDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsTUFBTTtBQUc5RCxTQUFLLGVBQWU7QUFFcEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLGtCQUFrQixTQUFTLEtBQUs7QUFBQSxNQUM1QyxlQUFlLEtBQUssY0FBYyxJQUFJLEdBQUcsYUFBYTtBQUFBLE1BQ3RELGlCQUFpQixLQUFLLGNBQWMsSUFBSSxHQUFHLFVBQVUsSUFBSSxHQUFHLFFBQVEsQ0FBQyxHQUFHLEtBQUssU0FBUyxLQUFLO0FBQUEsSUFDNUYsR0FBRztBQUFBLE1BQ0YsWUFBWSxXQUFXLFNBQVM7QUFBQSxNQUNoQyxlQUFlO0FBQUEsTUFDZixpQkFBaUIsV0FBVyxTQUFTO0FBQUEsSUFDdEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkVBQTJFLFlBQVk7QUFDM0YsVUFBTSxhQUFhLElBQUksTUFBTSxvQkFBb0I7QUFDakQsVUFBTSxjQUFjLFlBQVk7QUFBQSxNQUMvQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixXQUFXLGdCQUFnQjtBQUFBLFFBQzFCLEtBQUs7QUFBQSxRQUNMLE9BQU87QUFBQSxRQUNQLE1BQU0sUUFBUTtBQUFBLFFBQ2QsU0FBUyxDQUFDLEVBQUUsTUFBTSxZQUFZLGtCQUFrQixZQUFZLE1BQU0sTUFBTSxhQUFhLE9BQVUsQ0FBQztBQUFBLFFBQ2hHLHdCQUF3QjtBQUFBLFFBQ3hCLG9CQUFvQjtBQUFBLE1BQ3JCLENBQTZCO0FBQUEsSUFDOUIsQ0FBQztBQUVELFFBQUkseUJBQXlCO0FBQzdCLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDdkQsY0FBYztBQUFFLGNBQU0sV0FBVztBQUFBLE1BQUc7QUFBQSxNQUMzQixjQUEwQjtBQUFFLGVBQU8sQ0FBQyxXQUFXO0FBQUEsTUFBRztBQUFBLE1BQ2xELG1CQUE2QjtBQUNyQyxpQ0FBeUI7QUFDekIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNEO0FBRUEsVUFBTSxFQUFFLEtBQUssSUFBSSxnQ0FBZ0MsYUFBYSxhQUFhLFFBQVE7QUFFbkYsVUFBTSxLQUFLLFlBQVksWUFBWSxRQUFRO0FBQzNDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsTUFBTTtBQUk5RCxTQUFLLGVBQWU7QUFFcEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0EsZUFBZSxLQUFLLGNBQWMsSUFBSSxHQUFHLGFBQWE7QUFBQSxJQUN2RCxHQUFHO0FBQUEsTUFDRix3QkFBd0I7QUFBQSxNQUN4QixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEZBQTBGLFlBQVk7QUFDMUcsVUFBTSxjQUFjLElBQUksS0FBSyxRQUFRO0FBQ3JDLFVBQU0sZUFBZSxJQUFJLEtBQUssU0FBUztBQUN2QyxVQUFNLGdCQUFnQixDQUFDLFNBQWlDO0FBQUEsTUFDdkQ7QUFBQSxNQUNBLE9BQU8sSUFBSTtBQUFBLE1BQ1gsTUFBTSxRQUFRO0FBQUEsTUFDZCxTQUFTLENBQUMsRUFBRSxNQUFNLEtBQUssa0JBQWtCLEtBQUssTUFBTSxJQUFJLE1BQU0sYUFBYSxPQUFVLENBQUM7QUFBQSxNQUN0Rix3QkFBd0I7QUFBQSxNQUN4QixvQkFBb0I7QUFBQSxJQUNyQjtBQUNBLFVBQU0sZUFBZSxZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksUUFBUSxXQUFXLGdCQUFnQixjQUFjLFdBQVcsQ0FBQyxFQUFFLENBQUM7QUFDbkksVUFBTSxnQkFBZ0IsWUFBWSxFQUFFLFdBQVcsVUFBVSxZQUFZLFFBQVEsV0FBVyxnQkFBZ0IsY0FBYyxZQUFZLENBQUMsRUFBRSxDQUFDO0FBQ3RJLFVBQU0saUJBQTJCLENBQUM7QUFDbEMsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUN2RCxjQUFjO0FBQUUsY0FBTSxhQUFhO0FBQUEsTUFBRztBQUFBLE1BQzdCLGlCQUFpQixXQUFtQztBQUFFLGVBQU8sY0FBYyxTQUFTO0FBQUEsTUFBRztBQUFBLE1BQ3ZGLGlCQUFpQixXQUEwQjtBQUNuRCx1QkFBZSxLQUFLLFVBQVUsU0FBUyxDQUFDO0FBQ3hDLGVBQU8sVUFBVSxTQUFTLE1BQU0sWUFBWSxTQUFTLElBQUksZUFBZTtBQUFBLE1BQ3pFO0FBQUEsSUFDRDtBQUNBLFVBQU0sYUFBYSxJQUFJLGdCQUF5QjtBQUNoRCxRQUFJLG9CQUFvQjtBQUN4QixVQUFNLHNCQUFzQixJQUFJLGNBQWMsS0FBb0MsRUFBRTtBQUFBLE1BQzFFLHdCQUEwQztBQUNsRDtBQUNBLGVBQU8sc0JBQXNCLElBQUksV0FBVyxJQUFJLFFBQVEsUUFBUSxJQUFJO0FBQUEsTUFDckU7QUFBQSxJQUNEO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSTtBQUFBLE1BQ2hCO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxNQUNBLElBQUksb0NBQW9DO0FBQUEsTUFDeEM7QUFBQSxJQUNEO0FBQ0EsVUFBTSxXQUFXLFlBQVksSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBRTlELFVBQU0sWUFBWSxLQUFLLGVBQWUsRUFBRSxXQUFXLFlBQVksR0FBRyxTQUFTLEtBQUs7QUFDaEYsVUFBTSxRQUFRLFFBQVE7QUFDdEIsYUFBUyxPQUFPO0FBQ2hCLFVBQU0sZUFBZSxNQUFNLEtBQUssZUFBZSxFQUFFLFdBQVcsYUFBYSxDQUFDO0FBQzFFLGVBQVcsU0FBUyxJQUFJO0FBQ3hCLFVBQU0sY0FBYyxNQUFNO0FBRTFCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGlCQUFpQixLQUFLLGNBQWMsSUFBSSxHQUFHO0FBQUEsTUFDM0MsaUJBQWlCLGFBQWEsU0FBUztBQUFBLE1BQ3ZDLGdCQUFnQixZQUFZLFNBQVM7QUFBQSxJQUN0QyxHQUFHO0FBQUEsTUFDRixnQkFBZ0IsQ0FBQyxhQUFhLFNBQVMsQ0FBQztBQUFBLE1BQ3hDLGlCQUFpQjtBQUFBLE1BQ2pCLGlCQUFpQjtBQUFBLE1BQ2pCLGdCQUFnQjtBQUFBLElBQ2pCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLEtBQUsscUZBQXFGLFlBQVk7QUFDMUcsVUFBTSxnQkFBZ0IsQ0FBQyxTQUFpQztBQUFBLE1BQ3ZEO0FBQUEsTUFDQSxPQUFPO0FBQUEsTUFDUCxNQUFNLFFBQVE7QUFBQSxNQUNkLFNBQVMsQ0FBQyxFQUFFLE1BQU0sS0FBSyxrQkFBa0IsS0FBSyxNQUFNLE1BQU0sYUFBYSxPQUFVLENBQUM7QUFBQSxNQUNsRix3QkFBd0I7QUFBQSxNQUN4QixvQkFBb0I7QUFBQSxJQUNyQjtBQUVBLFVBQU0sYUFBYSxJQUFJLE1BQU0sb0JBQW9CO0FBQ2pELFVBQU0sY0FBYyxZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksUUFBUSxXQUFXLGdCQUFnQixjQUFjLFVBQVUsQ0FBQyxFQUFFLENBQUM7QUFDaEksVUFBTSxpQkFBaUIsWUFBWSxFQUFFLFdBQVcsV0FBVyxZQUFZLFFBQVEsV0FBVyxnQkFBZ0IsY0FBYyxVQUFVLENBQUMsRUFBRSxDQUFDO0FBRXRJLFFBQUksd0JBQXdCO0FBQzVCLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDdkQsY0FBYztBQUFFLGNBQU0sV0FBVztBQUFBLE1BQUc7QUFBQSxNQUMzQixjQUEwQjtBQUFFLGVBQU8sQ0FBQyxXQUFXO0FBQUEsTUFBRztBQUFBLE1BQ2xELGlCQUFpQixXQUFvQztBQUFFLGVBQU8sY0FBYyxTQUFVO0FBQUEsTUFBRztBQUFBLE1BQ3pGLG1CQUE2QjtBQUNyQztBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRDtBQUVBLFVBQU0sRUFBRSxLQUFLLElBQUksZ0NBQWdDLGFBQWEsYUFBYSxRQUFRO0FBR25GLFNBQUssZUFBZSxFQUFFLFdBQVcsV0FBVyxDQUFDO0FBQzdDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsU0FBUztBQUdqRSxVQUFNLEtBQUssWUFBWSxZQUFZLFFBQVE7QUFDM0MsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxNQUFNO0FBSTlELFNBQUssZUFBZTtBQUVwQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxlQUFlLEtBQUssY0FBYyxJQUFJLEdBQUcsYUFBYTtBQUFBLElBQ3ZELEdBQUc7QUFBQSxNQUNGLHVCQUF1QjtBQUFBLE1BQ3ZCLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywyRUFBMkUsWUFBWTtBQUMzRixVQUFNLFdBQVcsWUFBWSxFQUFFLFdBQVcsS0FBSyxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLFdBQVcsWUFBWSxFQUFFLFdBQVcsS0FBSyxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLFdBQVcsWUFBWSxFQUFFLFdBQVcsS0FBSyxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLFdBQVcsQ0FBQyxVQUFVLFVBQVUsUUFBUTtBQUU5QyxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQ3ZELGNBQWM7QUFBRSxjQUFNLFFBQVE7QUFBQSxNQUFHO0FBQUEsTUFDeEIsY0FBMEI7QUFBRSxlQUFPO0FBQUEsTUFBVTtBQUFBLElBQ3ZEO0FBRUEsVUFBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsVUFBTSxVQUFVLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBRTVELFlBQVE7QUFBQSxNQUNQO0FBQUEsTUFDQSxLQUFLLFVBQVU7QUFBQSxRQUNkLEVBQUUsaUJBQWlCLFNBQVMsU0FBUyxTQUFTLEdBQUcsY0FBYyxHQUFHLFVBQVUsTUFBTSxVQUFVLE1BQU07QUFBQSxRQUNsRyxFQUFFLGlCQUFpQixTQUFTLFNBQVMsU0FBUyxHQUFHLGNBQWMsR0FBRyxVQUFVLE9BQU8sVUFBVSxLQUFLO0FBQUEsUUFDbEcsRUFBRSxpQkFBaUIsU0FBUyxTQUFTLFNBQVMsR0FBRyxjQUFjLEdBQUcsVUFBVSxPQUFPLFVBQVUsTUFBTTtBQUFBLE1BQ3BHLENBQUM7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx5QkFBcUIsS0FBSyxpQkFBaUIsT0FBTztBQUNsRCx5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLG9CQUFvQixZQUFZLElBQUksSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQzFGLHlCQUFxQixLQUFLLDJCQUEyQixJQUFJLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2pHLHlCQUFxQixLQUFLLHFCQUFxQixFQUFFLFFBQVEsMkJBQTJCLENBQUM7QUFDckYseUJBQXFCLEtBQUssb0JBQW9CLElBQUksc0JBQXNCLENBQUM7QUFDekUseUJBQXFCLEtBQUssa0JBQWtCLElBQUksb0JBQW9CLENBQUM7QUFDckUseUJBQXFCLEtBQUssY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLE1BQW5DO0FBQUE7QUFDM0MsYUFBa0IscUJBQXFCLE1BQU07QUFBQTtBQUFBLElBQzlDLEdBQUM7QUFFRCxVQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQzlGLFVBQU0sT0FBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFFbEUsVUFBTSxLQUFLLHVCQUF1QjtBQUVsQyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsS0FBSyxnQkFBZ0IsSUFBSSxFQUFFLElBQUksT0FBSyxHQUFHLGFBQWEsSUFBSTtBQUFBLE1BQ2pFLFFBQVEsS0FBSyxnQkFBZ0IsSUFBSSxFQUFFLElBQUksT0FBSyxHQUFHLE9BQU8sSUFBSSxLQUFLLEtBQUs7QUFBQSxNQUNwRSxRQUFRLEtBQUssY0FBYyxJQUFJLEdBQUc7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixTQUFTLENBQUMsS0FBSyxLQUFLLEdBQUc7QUFBQSxNQUN2QixRQUFRLENBQUMsTUFBTSxPQUFPLEtBQUs7QUFBQSxNQUMzQixRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrR0FBa0csWUFBWTtBQUNsSCxVQUFNLFdBQVcsWUFBWSxFQUFFLFdBQVcsS0FBSyxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLFdBQVcsWUFBWSxFQUFFLFdBQVcsS0FBSyxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLFdBQVcsQ0FBQyxVQUFVLFFBQVE7QUFFcEMsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUN2RCxjQUFjO0FBQUUsY0FBTSxRQUFRO0FBQUEsTUFBRztBQUFBLE1BQ3hCLGNBQTBCO0FBQUUsZUFBTztBQUFBLE1BQVU7QUFBQSxJQUN2RDtBQUVBLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLFVBQU0sVUFBVSxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUc1RCxZQUFRO0FBQUEsTUFDUDtBQUFBLE1BQ0EsS0FBSyxVQUFVO0FBQUEsUUFDZCxFQUFFLGlCQUFpQixTQUFTLFNBQVMsU0FBUyxHQUFHLGNBQWMsR0FBRyxVQUFVLE9BQU8sVUFBVSxNQUFNO0FBQUEsUUFDbkcsRUFBRSxpQkFBaUIsU0FBUyxTQUFTLFNBQVMsR0FBRyxjQUFjLEdBQUcsVUFBVSxPQUFPLFVBQVUsS0FBSztBQUFBLE1BQ25HLENBQUM7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUFBLElBQ0Q7QUFFQSx5QkFBcUIsS0FBSyxpQkFBaUIsT0FBTztBQUNsRCx5QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHlCQUFxQixLQUFLLG9CQUFvQixZQUFZLElBQUksSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQzFGLHlCQUFxQixLQUFLLDJCQUEyQixJQUFJLDZCQUE2QixDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBQ2pHLHlCQUFxQixLQUFLLHFCQUFxQixFQUFFLFFBQVEsMkJBQTJCLENBQUM7QUFDckYseUJBQXFCLEtBQUssb0JBQW9CLElBQUksc0JBQXNCLENBQUM7QUFDekUseUJBQXFCLEtBQUssa0JBQWtCLElBQUksb0JBQW9CLENBQUM7QUFDckUseUJBQXFCLEtBQUssY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLE1BQW5DO0FBQUE7QUFDM0MsYUFBa0IscUJBQXFCLE1BQU07QUFBQTtBQUFBLElBQzlDLEdBQUM7QUFFRCxVQUFNLFVBQVUsWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQzlGLFVBQU0sT0FBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFHbEUsVUFBTSxTQUE4QixDQUFDO0FBQ3JDLGdCQUFZLElBQUksUUFBUSxZQUFVO0FBQ2pDLGFBQU8sS0FBSyxLQUFLLGdCQUFnQixLQUFLLE1BQU0sRUFBRSxJQUFJLE9BQUssR0FBRyxhQUFhLElBQUksQ0FBQztBQUFBLElBQzdFLENBQUMsQ0FBQztBQUVGLFVBQU0sS0FBSyx1QkFBdUI7QUFJbEMsVUFBTSxvQkFBb0IsT0FBTyxLQUFLLE9BQUssRUFBRSxXQUFXLEtBQUssRUFBRSxDQUFDLE1BQU0sR0FBRztBQUV6RSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxPQUFPLEtBQUssZ0JBQWdCLElBQUksRUFBRSxJQUFJLE9BQUssR0FBRyxhQUFhLElBQUk7QUFBQSxNQUMvRCxRQUFRLEtBQUssY0FBYyxJQUFJLEdBQUc7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQixPQUFPLENBQUMsS0FBSyxHQUFHO0FBQUEsTUFDaEIsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkVBQTZFLFlBQVk7QUFDN0YsVUFBTSxPQUFjLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGNBQWMsRUFBRTtBQUN2RSxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDN0IsVUFBVSxnQkFBZ0IsSUFBSTtBQUFBLElBQy9CLENBQUM7QUFDRCxVQUFNLEVBQUUsU0FBUyxLQUFLLElBQUksZ0NBQWdDLFNBQVMsV0FBVztBQUc5RSxVQUFNLEtBQUssWUFBWSxRQUFRLFFBQVE7QUFDdkMsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxJQUFJO0FBSTVELFVBQU0sUUFBUSxtQkFBbUIsU0FBUyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBQ3pELFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsSUFBSTtBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsUUFBSTtBQUNKLFFBQUkscUJBQXFCO0FBQ3pCLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDdkQsTUFBZSxZQUFZLFlBQW9CLGVBQW9CLFVBQWtEO0FBQ3BILDZCQUFxQjtBQUNyQixjQUFNLElBQUksUUFBYyxhQUFXO0FBQ2xDLGdDQUFzQjtBQUFBLFFBQ3ZCLENBQUM7QUFDRCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFJbEYsVUFBTSxjQUFjLFFBQVEsbUJBQW1CLFNBQVMsRUFBRSxPQUFPLE1BQU0sWUFBWSxLQUFLLENBQUM7QUFDekYsVUFBTTtBQUVOLFdBQU8sWUFBWSxvQkFBb0IsSUFBSTtBQUUzQywwQkFBc0I7QUFBQSxFQUN2QixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLE9BQWMsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sY0FBYyxHQUFHLFFBQVEsZ0JBQWdCLGNBQWMsUUFBUSxFQUFFO0FBQ3hILFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUM3QixVQUFVLGdCQUFnQixJQUFJO0FBQUEsSUFDL0IsQ0FBQztBQUNELFFBQUk7QUFDSixRQUFJO0FBQ0osVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUN2RCxNQUFlLFlBQVksWUFBb0IsY0FBbUIsVUFBa0Q7QUFDbkgsMkJBQW1CO0FBQ25CLGNBQU0sSUFBSSxRQUFjLGFBQVc7QUFDbEMsZ0NBQXNCO0FBQUEsUUFDdkIsQ0FBQztBQUNELGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixRQUFJLGdCQUFnQjtBQUNwQixnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE1BQU0sZUFBZSxDQUFDO0FBS2hFLFVBQU0sUUFBUSxZQUFZLFNBQVMsTUFBTSxFQUFFLE9BQU8sTUFBTSxZQUFZLEtBQUssQ0FBQztBQUUxRSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGtCQUFrQixrQkFBa0IsU0FBUztBQUFBLE1BQzdDO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixrQkFBa0IsS0FBSyxTQUFTLFNBQVM7QUFBQSxNQUN6QyxlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUVELDBCQUFzQjtBQUFBLEVBQ3ZCLENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxFQUFFLFNBQVMsWUFBWSxJQUFJLGdDQUFnQyxTQUFTLFdBQVc7QUFDckYsVUFBTSxrQkFBK0MsQ0FBQyxFQUFFLE1BQU0sV0FBVyxJQUFJLFdBQVcsTUFBTSxXQUFXLE9BQU8sUUFBUSxDQUFDO0FBQ3pILFFBQUk7QUFDSixnQkFBWSxJQUFJLFFBQVEsaUJBQWlCLFdBQVMsWUFBWSxLQUFLLENBQUM7QUFFcEUsZ0JBQVksY0FBYztBQUFBLE1BQ3pCLHFCQUFxQixLQUFLO0FBQUEsTUFDMUIsU0FBUyxFQUFFLE1BQU0sYUFBYSxPQUFPLENBQUMsRUFBRTtBQUFBLE1BQ3hDO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsYUFBYTtBQUFBLE1BQ25DLE9BQU8sVUFBVSxRQUFRO0FBQUEsTUFDekIsaUJBQWlCLFVBQVUsUUFBUTtBQUFBLE1BQ25DLGNBQWMsVUFBVTtBQUFBLE1BQ3hCLFdBQVcsVUFBVTtBQUFBLElBQ3RCLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxNQUNQO0FBQUEsTUFDQSxjQUFjO0FBQUEsTUFDZCxXQUFXO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxVQUFNLFdBQWtCLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sZ0JBQWdCLE1BQU0sRUFBRTtBQUNoSCxVQUFNLFdBQWtCLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sZ0JBQWdCLE1BQU0sR0FBRyxRQUFRLEVBQUUsTUFBTSxlQUFlLFNBQVMsRUFBRTtBQUMzSixVQUFNLFdBQWtCLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLG1CQUFtQixHQUFHLE9BQU8sZ0JBQWdCLE1BQU0sR0FBRyxRQUFRLEVBQUUsTUFBTSxlQUFlLEtBQUssR0FBRyxlQUFlLGdCQUFnQixrQkFBa0IsUUFBUSxFQUFFO0FBQ25OLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osT0FBTyxnQkFBZ0IsQ0FBQyxVQUFVLFVBQVUsUUFBUSxDQUFDO0FBQUEsTUFDckQsVUFBVSxnQkFBZ0IsUUFBUTtBQUFBLE1BQ2xDLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLEtBQUssQ0FBQztBQUFBLElBQzlELENBQUM7QUFDRCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQ3ZELE1BQWUsWUFBWSxZQUFvQixlQUFvQixVQUFrRDtBQUNwSCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUV4RixVQUFNLEtBQUssWUFBWSxRQUFRLFFBQVE7QUFDdkMsVUFBTSxLQUFLLFNBQVMsU0FBUyxTQUFTLFFBQVE7QUFDOUMsVUFBTSxRQUFRLFlBQVksU0FBUyxVQUFVLEVBQUUsT0FBTyxjQUFjLENBQUM7QUFDckUsVUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBTSxrQkFBa0IsS0FBSyxjQUFjLElBQUksR0FBRyxXQUFXLElBQUksRUFBRSxTQUFTLFNBQVM7QUFFckYsVUFBTSxLQUFLLFNBQVMsU0FBUyxTQUFTLFFBQVE7QUFDOUMsVUFBTSxRQUFRLFlBQVksU0FBUyxVQUFVLEVBQUUsT0FBTyxlQUFlLENBQUM7QUFDdEUsVUFBTSxRQUFRLFFBQVE7QUFDdEIsVUFBTSxtQkFBbUIsS0FBSyxjQUFjLElBQUksR0FBRyxXQUFXLElBQUksRUFBRSxTQUFTLFNBQVM7QUFFdEYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixhQUFhLEtBQUssY0FBYyxJQUFJLEdBQUcsZ0JBQWdCLElBQUksRUFBRSxJQUFJLFVBQVEsS0FBSyxNQUFNLElBQUksQ0FBQztBQUFBLE1BQ3pGO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsYUFBYSxDQUFDLFFBQVEsUUFBUSxNQUFNO0FBQUEsTUFDcEMsaUJBQWlCLFNBQVMsU0FBUyxTQUFTO0FBQUEsTUFDNUMsa0JBQWtCLFNBQVMsU0FBUyxTQUFTO0FBQUEsSUFDOUMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0VBQXNFLFlBQVk7QUFDdEYsVUFBTSxPQUFjLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGNBQWMsRUFBRTtBQUN2RSxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDN0IsVUFBVSxnQkFBZ0IsSUFBSTtBQUFBLElBQy9CLENBQUM7QUFDRCxRQUFJLHFCQUFxQjtBQUN6QixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQzlDLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsTUFDcEksTUFBZSxZQUFZLFlBQW9CLGVBQW9CLFVBQWtEO0FBQ3BILDZCQUFxQjtBQUNyQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUd4RixXQUFPLFlBQVksS0FBSyxjQUFjLElBQUksR0FBRyxNQUFTO0FBRXRELFVBQU0sUUFBUSw0QkFBNEIsSUFBSSxNQUFNLGdCQUFnQixHQUFHLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFHdEYsV0FBTyxZQUFZLG9CQUFvQixJQUFJO0FBQzNDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLE1BQVM7QUFBQSxFQUN2RCxDQUFDO0FBRUQsT0FBSyxrR0FBa0csWUFBWTtBQUNsSCxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFDRCxVQUFNLHdCQUF3QixJQUFJLGdCQUFzQjtBQUN4RCxVQUFNLDRCQUE0QixJQUFJLGdCQUFzQjtBQUM1RCxVQUFNLHlCQUF5QixJQUFJLGdCQUFzQjtBQUN6RCxVQUFNLFNBQW1CLENBQUM7QUFDMUIsUUFBSTtBQUNKLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQzlDLGVBQU87QUFBQSxVQUNOLEtBQUssSUFBSSxNQUFNLGdCQUFnQjtBQUFBLFVBQy9CLE9BQU87QUFBQSxVQUNQLE1BQU0sUUFBUTtBQUFBLFVBQ2QsU0FBUyxDQUFDO0FBQUEsVUFDVix3QkFBd0I7QUFBQSxVQUN4QixvQkFBb0I7QUFBQSxRQUNyQjtBQUFBLE1BQ0Q7QUFBQSxNQUNTLGlCQUFpQixZQUFrQixnQkFBeUIsU0FBMkQ7QUFDL0gseUJBQWlCLFNBQVM7QUFDMUIsZUFBTyxLQUFLLFFBQVE7QUFDcEIsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNTLHVCQUF1QixZQUFvQixVQUFtQjtBQUN0RSxlQUFPLEtBQUssU0FBUyxRQUFRLEVBQUU7QUFDL0IsZUFBTyxFQUFFLFNBQVMsTUFBTSxPQUFPLEtBQUssT0FBTyxFQUFFO0FBQUEsTUFDOUM7QUFBQSxNQUNBLE1BQWUsMkJBQTBDO0FBQ3hELGVBQU8sS0FBSyxXQUFXO0FBQ3ZCLCtCQUF1QixTQUFTO0FBQUEsTUFDakM7QUFBQSxNQUNBLE1BQWUsWUFBWSxZQUFvQixlQUFvQixTQUFpRDtBQUNuSCxlQUFPLEtBQUssUUFBUSxRQUFRLEtBQUssRUFBRTtBQUNuQyxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUV4RixVQUFNLGNBQWMsUUFBUSw0QkFBNEIsSUFBSSxNQUFNLGdCQUFnQixHQUFHO0FBQUEsTUFDcEYsTUFBTTtBQUFBLE1BQ04sVUFBVTtBQUFBLE1BQ1YsTUFBTSxVQUFVO0FBQ2YsZUFBTyxLQUFLLFNBQVM7QUFDckIsa0NBQTBCLFNBQVM7QUFDbkMsY0FBTSxzQkFBc0I7QUFDNUIsZUFBTyxFQUFFLE9BQU8sV0FBVztBQUFBLE1BQzVCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixlQUFlO0FBQUEsTUFDZixVQUFVLEVBQUUsUUFBUSxFQUFFLGdCQUFnQix3Q0FBd0MsRUFBRTtBQUFBLE1BQ2hGLGtCQUFrQixhQUFXO0FBQzVCLGFBQUssWUFBWSxRQUFRLFFBQVE7QUFDakMsZUFBTyxLQUFLLFFBQVEsS0FBSyxjQUFjLElBQUksR0FBRyxTQUFTLEVBQUU7QUFBQSxNQUMxRDtBQUFBLElBQ0QsQ0FBQztBQUNELFVBQU0sUUFBUSxJQUFJLENBQUMsMEJBQTBCLEdBQUcsdUJBQXVCLENBQUMsQ0FBQztBQUN6RSxVQUFNLDhCQUE4QixDQUFDLEdBQUcsTUFBTTtBQUM5QywwQkFBc0IsU0FBUztBQUMvQixVQUFNO0FBRU4sV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRiw2QkFBNkIsQ0FBQyxVQUFVLGtDQUFrQyxXQUFXLFdBQVcsV0FBVztBQUFBLE1BQzNHLFFBQVEsQ0FBQyxVQUFVLGtDQUFrQyxXQUFXLFdBQVcsYUFBYSxTQUFTLGVBQWU7QUFBQSxNQUNoSCxnQkFBZ0IsRUFBRSxRQUFRLEVBQUUsZ0JBQWdCLHdDQUF3QyxFQUFFO0FBQUEsSUFDdkYsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssOEVBQThFLFlBQVk7QUFDOUYsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsSUFDYixDQUFDO0FBQ0QsUUFBSSx5QkFBeUI7QUFDN0IsUUFBSSxrQkFBa0I7QUFDdEIsUUFBSSxVQUFVO0FBQ2QsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxtQkFBc0M7QUFDOUMsZUFBTztBQUFBLFVBQ04sS0FBSyxJQUFJLE1BQU0sZ0JBQWdCO0FBQUEsVUFDL0IsT0FBTztBQUFBLFVBQ1AsTUFBTSxRQUFRO0FBQUEsVUFDZCxTQUFTLENBQUM7QUFBQSxVQUNWLHdCQUF3QjtBQUFBLFVBQ3hCLG9CQUFvQjtBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLE1BQ1MseUJBQXlCO0FBQ2pDLGVBQU8sRUFBRSxTQUFTLE1BQU0sa0JBQWtCO0FBQUEsTUFDM0M7QUFBQSxNQUNTLG1CQUF5QjtBQUNqQztBQUFBLE1BQ0Q7QUFBQSxJQUNELEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sT0FBTyxRQUFRLFFBQVEsNEJBQTRCLElBQUksTUFBTSxnQkFBZ0IsR0FBRztBQUFBLE1BQ3JGLE1BQU07QUFBQSxNQUNOLFVBQVU7QUFBQSxNQUNWLE1BQU0sVUFBVTtBQUNmLGlDQUF5QjtBQUN6QixlQUFPLEVBQUUsT0FBTyxXQUFXO0FBQUEsTUFDNUI7QUFBQSxJQUNELEdBQUcsUUFBVyxrQkFBa0IsU0FBUyxHQUFHLFVBQVU7QUFFdEQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRix3QkFBd0I7QUFBQSxNQUN4QixpQkFBaUI7QUFBQSxNQUNqQixTQUFTO0FBQUEsSUFDVixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxJQUNiLENBQUM7QUFDRCxRQUFJLFVBQVU7QUFDZCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQzlDLGNBQTBCO0FBQ2xDLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFBQSxNQUNTLG1CQUFzQztBQUM5QyxlQUFPO0FBQUEsVUFDTixLQUFLLElBQUksTUFBTSxnQkFBZ0I7QUFBQSxVQUMvQixPQUFPO0FBQUEsVUFDUCxNQUFNLFFBQVE7QUFBQSxVQUNkLFNBQVMsQ0FBQztBQUFBLFVBQ1Ysd0JBQXdCO0FBQUEsVUFDeEIsb0JBQW9CO0FBQUEsUUFDckI7QUFBQSxNQUNEO0FBQUEsTUFDUyx5QkFBZ0M7QUFDeEMsY0FBTSxJQUFJLE1BQU0sY0FBYztBQUFBLE1BQy9CO0FBQUEsTUFDUyxtQkFBeUI7QUFDakM7QUFBQSxNQUNEO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixVQUFNLE9BQU8sUUFBUSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUc7QUFBQSxNQUNyRixNQUFNO0FBQUEsTUFDTixVQUFVO0FBQUEsTUFDVixNQUFNLFVBQVU7QUFDZixlQUFPLEVBQUUsT0FBTyxXQUFXO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUMsR0FBRyxjQUFjO0FBRWxCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLFNBQVMsUUFBUSxXQUFXLFFBQVEsUUFBUTtBQUFBLElBQzdDLEdBQUc7QUFBQSxNQUNGLFNBQVM7QUFBQSxNQUNULFNBQVM7QUFBQSxJQUNWLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlHQUFpRyxZQUFZO0FBQ2pILFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxZQUFZLElBQUksTUFBTSxnQkFBZ0I7QUFDNUMsUUFBSSxlQUFlO0FBQ25CLFFBQUksY0FBYztBQUNsQixRQUFJLFlBQVk7QUFDaEIsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxpQkFBaUIsS0FBNkI7QUFDdEQ7QUFDQSxlQUFPO0FBQUEsVUFDTjtBQUFBLFVBQ0EsT0FBTztBQUFBLFVBQ1AsTUFBTSxRQUFRO0FBQUEsVUFDZCxTQUFTLENBQUM7QUFBQSxVQUNWLHdCQUF3QjtBQUFBLFVBQ3hCLG9CQUFvQjtBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLE1BQ1MsbUJBQTZCO0FBQ3JDO0FBQ0EsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLE1BQWUsWUFBWSxZQUFvQixlQUFvQixVQUFrRDtBQUNwSDtBQUNBLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLGtDQUFrQyxJQUFJLG9DQUFvQztBQUNoRixvQ0FBZ0MsVUFBVTtBQUMxQyxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsVUFBVSwrQkFBK0I7QUFFbkgsVUFBTSxPQUFPO0FBQUEsTUFDWixRQUFRLDRCQUE0QixXQUFXLEVBQUUsT0FBTyxLQUFLLENBQUM7QUFBQSxNQUM5RDtBQUFBLElBQ0Q7QUFDQSxvQ0FBZ0MsVUFBVTtBQUMxQyxVQUFNLFFBQVEsNEJBQTRCLFdBQVcsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUVwRSxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGVBQWUsZ0NBQWdDLGNBQWMsSUFBSSxTQUFPLElBQUksU0FBUyxDQUFDO0FBQUEsTUFDdEY7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsZUFBZSxDQUFDLFVBQVUsU0FBUyxHQUFHLFVBQVUsU0FBUyxDQUFDO0FBQUEsTUFDMUQsY0FBYztBQUFBLE1BQ2QsYUFBYTtBQUFBLE1BQ2IsV0FBVztBQUFBLElBQ1osQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUZBQXlGLE1BQU07QUFDbkcsVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxPQUFPLENBQUM7QUFDbkUsVUFBTSxrQkFBa0IsSUFBSSxNQUFNLG1CQUFtQjtBQUNyRCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0IscUJBQXFCO0FBQ3ZDLGFBQWtCLGVBQXdDO0FBQUEsVUFDekQsRUFBRSxpQkFBaUIsMkJBQTJCLFFBQVEsSUFBSSxtQkFBbUIsT0FBTyxtQkFBbUIsTUFBTSxRQUFRLEdBQUc7QUFBQSxVQUN4SCxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLGVBQWUsT0FBTyxlQUFlLE1BQU0sUUFBUSxHQUFHO0FBQUEsUUFDakg7QUFBQTtBQUFBLE1BQ1MsaUJBQWlCLFdBQStDO0FBQ3hFLGVBQU8sMkJBQTJCLFFBQVEsV0FBVyxlQUFlLElBQUksRUFBRSxVQUFVLElBQW9DO0FBQUEsTUFDekg7QUFBQSxNQUNTLGdCQUFnQixXQUFnQztBQUN4RCxlQUFPLDJCQUEyQixRQUFRLFdBQVcsZUFBZSxJQUFJLENBQUMsS0FBSyxhQUFhLENBQUMsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUNuRztBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFFbEYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixrQkFBa0IsUUFBUSw0QkFBNEIsZUFBZTtBQUFBLE1BQ3JFLGdCQUFnQixRQUFRLDRCQUE0QixpQkFBaUIsRUFBRSxZQUFZLFFBQVEsZUFBZSxrQkFBa0IsQ0FBQztBQUFBLE1BQzdILG9CQUFvQixRQUFRLDRCQUE0QixpQkFBaUIsRUFBRSxZQUFZLFFBQVEsZUFBZSxjQUFjLENBQUM7QUFBQSxNQUM3SCxrQkFBa0IsUUFBUSw0QkFBNEIsSUFBSSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsTUFDbEYsZ0JBQWdCLFFBQVEsMkJBQTJCLEVBQUUsWUFBWSxRQUFRLGVBQWUsY0FBYyxDQUFDO0FBQUEsTUFDdkcsd0JBQXdCLFFBQVEsMkJBQTJCLEVBQUUsWUFBWSxTQUFTLGVBQWUsY0FBYyxDQUFDO0FBQUEsSUFDakgsR0FBRztBQUFBLE1BQ0Ysa0JBQWtCO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsb0JBQW9CO0FBQUEsTUFDcEIsa0JBQWtCO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsd0JBQXdCO0FBQUEsSUFDekIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxPQUFPLENBQUM7QUFDbkUsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxpQkFBaUIsV0FBbUM7QUFDNUQsZUFBTyxFQUFFLFVBQVU7QUFBQSxNQUNwQjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFFbEYsV0FBTztBQUFBLE1BQ04sTUFBTSxRQUFRLGlCQUFpQixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxZQUFZLFFBQVEsZUFBZSxVQUFVLENBQUM7QUFBQSxNQUM1RztBQUFBLElBQ0Q7QUFBQSxFQUNELENBQUM7QUFFRCxPQUFLLHdFQUF3RSxNQUFNO0FBQ2xGLFVBQU0sWUFBWSxJQUFJLE1BQU0sZ0JBQWdCO0FBRzVDLFVBQU0sdUJBQXVCLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxRQUFRLGFBQWEsYUFBYSxDQUFDO0FBQzNHLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsaUJBQWlCLFlBQW9DO0FBQzdELGVBQU8sRUFBRSxXQUFXLFdBQVc7QUFBQSxNQUNoQztBQUFBLE1BQ1Msa0JBQWtDO0FBQzFDLGVBQU8sQ0FBQyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFFBQVEsT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQSxNQUM1RztBQUFBLElBQ0QsRUFBRSxvQkFBb0I7QUFDdEIsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0Msc0JBQXNCLGFBQWEsUUFBUTtBQUUvRixVQUFNLHNCQUFzQixZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksUUFBUSxhQUFhLE9BQU8sQ0FBQztBQUVwRyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGVBQWUseUJBQXlCLFNBQVMsc0JBQXNCLFNBQVM7QUFBQSxNQUNoRixnQkFBZ0IseUJBQXlCLFNBQVMscUJBQXFCLFNBQVM7QUFBQSxNQUNoRixVQUFVLHlCQUF5QixTQUFTLHFCQUFxQixNQUFTO0FBQUEsTUFDMUUsV0FBVyx5QkFBeUIsU0FBUyxRQUFXLFNBQVM7QUFBQSxJQUNsRSxHQUFHO0FBQUEsTUFDRixlQUFlLENBQUM7QUFBQSxNQUNoQixnQkFBZ0IsRUFBRSxZQUFZLFFBQVEsZUFBZSxPQUFPO0FBQUEsTUFDNUQsVUFBVSxDQUFDO0FBQUEsTUFDWCxXQUFXLENBQUM7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHdGQUF3RixZQUFZO0FBS3hHLFVBQU0sWUFBWSxJQUFJLE1BQU0sZ0JBQWdCO0FBQzVDLFVBQU0saUJBQWlCLFlBQVksRUFBRSxXQUFXLGFBQWEsWUFBWSxXQUFXLGFBQWEsYUFBYSxDQUFDO0FBQy9HLFVBQU0sVUFBMkQsQ0FBQztBQUlsRSxVQUFNLFVBQVUsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDbkIsYUFBa0IsS0FBSztBQUN2QixhQUFrQixRQUFRO0FBQzFCLGFBQWtCLGVBQXdDLENBQUM7QUFBQTtBQUFBLE1BQ2xELGlCQUFpQixZQUFvQztBQUFFLGVBQU8sRUFBRSxXQUFXLFdBQVc7QUFBQSxNQUFtQztBQUFBLE1BQ3pILGtCQUFrQztBQUFFLGVBQU8sQ0FBQztBQUFBLE1BQUc7QUFBQSxNQUMvQyxjQUEwQjtBQUFFLGVBQU8sQ0FBQyxjQUFjO0FBQUEsTUFBRztBQUFBLElBQy9ELEVBQUUsY0FBYztBQUdoQixVQUFNLG1CQUFtQixZQUFZLEVBQUUsV0FBVyxZQUFZLFlBQVksOEJBQThCLGFBQWEsYUFBYSxDQUFDO0FBQ25JLFVBQU0sWUFBWSxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFBbkM7QUFBQTtBQUNyQixhQUFrQixLQUFLO0FBQ3ZCLGFBQWtCLFFBQVE7QUFDMUIsYUFBa0IsZUFBd0MsQ0FBQyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLGNBQWMsT0FBTyxXQUFXLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQTtBQUFBLE1BQzlKLGlCQUFpQixZQUFvQztBQUFFLGVBQU8sRUFBRSxXQUFXLFdBQVc7QUFBQSxNQUFtQztBQUFBLE1BQ3pILGtCQUFrQztBQUFFLGVBQU8sQ0FBQyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLGNBQWMsT0FBTyxXQUFXLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQSxNQUFHO0FBQUEsTUFDM0osY0FBMEI7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQUEsTUFDdkMsaUJBQWlCLFlBQWlCLGVBQWlDO0FBQzNFLGdCQUFRLEtBQUssRUFBRSxZQUFZLEtBQUssSUFBSSxjQUFjLENBQUM7QUFDbkQsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEVBQUUsZ0JBQWdCO0FBRWxCLFVBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLHlCQUFxQixLQUFLLGlCQUFpQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3hGLHlCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QseUJBQXFCLEtBQUssb0JBQW9CLFlBQVksSUFBSSxJQUFJLHNCQUFzQixDQUFDLENBQUM7QUFDMUYseUJBQXFCLEtBQUssMkJBQTJCLElBQUksNkJBQTZCLENBQUMsU0FBUyxTQUFTLENBQUMsQ0FBQztBQUMzRyx5QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLHlCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLHlCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLHlCQUFxQixLQUFLLGNBQWMsSUFBSSxnQkFBZ0IsQ0FBQztBQUM3RCx5QkFBcUIsS0FBSywrQkFBK0IsSUFBSSxjQUFjLEtBQW9DLEVBQUU7QUFBQSxNQUNoSCxNQUFlLHdCQUEwQztBQUFFLGVBQU87QUFBQSxNQUFNO0FBQUEsSUFDekUsR0FBQztBQUVELFVBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUseUJBQXlCLENBQUM7QUFDOUYsVUFBTSxPQUFPLFdBQVcsc0JBQXNCLFNBQVMsV0FBVztBQUNsRSxVQUFNLEtBQUssWUFBWSxlQUFlLFFBQVE7QUFFOUMsVUFBTSxTQUFTLEtBQUssY0FBYyxJQUFJO0FBQ3RDLFVBQU0sU0FBUyxNQUFNLEtBQUssZUFBZTtBQUFBLE1BQ3hDO0FBQUEsTUFDQSxHQUFHLHlCQUF5QixTQUFTLFFBQVEsU0FBUztBQUFBLElBQ3ZELENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxrQkFBa0IsT0FBTyxTQUFTO0FBQUEsTUFDbEMsZUFBZSxPQUFPO0FBQUEsSUFDdkIsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDLEVBQUUsWUFBWSw4QkFBOEIsZUFBZSxhQUFhLENBQUM7QUFBQSxNQUNuRixrQkFBa0I7QUFBQSxNQUNsQixlQUFlO0FBQUEsSUFDaEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNkdBQTZHLFlBQVk7QUFDN0gsVUFBTSxPQUFjLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLG9CQUFvQixFQUFFO0FBQzdFLFVBQU0sZ0JBQWdCLFlBQVksRUFBRSxXQUFXLFVBQVUsWUFBWSxPQUFPLENBQUM7QUFDN0UsVUFBTSxZQUFZLFlBQVk7QUFBQSxNQUM3QixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixhQUFhLGdCQUFnQixJQUFJO0FBQUEsTUFDakMsT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUM3QixVQUFVLGdCQUFnQixJQUFJO0FBQUEsSUFDL0IsQ0FBQztBQUNELFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0IscUJBQXFCO0FBQUE7QUFBQSxNQUM5QixjQUEwQjtBQUFFLGVBQU8sQ0FBQyxhQUFhO0FBQUEsTUFBRztBQUFBLE1BQ3BELGdCQUFnQixlQUFpQztBQUN6RCxjQUFNLEtBQUssbUJBQW1CLGFBQWEsRUFBRTtBQUM3QyxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ1MsU0FBUyxZQUFvQixTQUF1QjtBQUFFLGNBQU0sS0FBSyxZQUFZLE9BQU8sRUFBRTtBQUFBLE1BQUc7QUFBQSxNQUN6RixtQkFBMEI7QUFBRSxjQUFNLElBQUksTUFBTSxvQ0FBb0M7QUFBQSxNQUFHO0FBQUEsTUFDbkYsWUFBbUI7QUFBRSxjQUFNLElBQUksTUFBTSxpQ0FBaUM7QUFBQSxNQUFHO0FBQUEsTUFDbEYsTUFBZSxjQUFpQztBQUMvQyxjQUFNLEtBQUssTUFBTTtBQUNqQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxTQUFTO0FBQ1gsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxlQUFlLGFBQWEsUUFBUTtBQUM5RixVQUFNLEtBQUssWUFBWSxjQUFjLFFBQVE7QUFFN0MsVUFBTSxTQUFTLE1BQU0sUUFBUSw4QkFBOEIsRUFBRSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQzNFLFlBQVk7QUFBQSxNQUNaLGVBQWU7QUFBQSxNQUNmLFNBQVM7QUFBQSxNQUNULGVBQWU7QUFBQSxNQUNmLFFBQVE7QUFBQSxJQUNULENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFdBQVcsUUFBUTtBQUFBLE1BQ25CLGVBQWUsS0FBSyxjQUFjLElBQUksR0FBRztBQUFBLE1BQ3pDLFlBQVksUUFBUSxXQUFXLElBQUk7QUFBQSxNQUNuQztBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsV0FBVztBQUFBLE1BQ1gsZUFBZTtBQUFBLE1BQ2YsWUFBWTtBQUFBLE1BQ1osT0FBTyxDQUFDLHdCQUF3QixtQkFBbUIsTUFBTTtBQUFBLElBQzFELENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZGQUE2RixZQUFZO0FBQzdHLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxvQkFBb0IsRUFBRTtBQUM3RSxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLGFBQWEsZ0JBQWdCLElBQUk7QUFBQSxNQUNqQyxPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxjQUFjLElBQUksZ0JBQXNCO0FBQzlDLFVBQU0sV0FBVyxJQUFJLGdCQUFzQjtBQUMzQyxVQUFNLGVBQWUsSUFBSSxnQkFBc0I7QUFDL0MsUUFBSSxVQUFVO0FBQ2QsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUFuQztBQUFBO0FBQ3BCLGFBQWtCLHFCQUFxQjtBQUFBO0FBQUEsTUFDOUIsa0JBQTRCO0FBQUUsZUFBTztBQUFBLE1BQVM7QUFBQSxNQUM5QyxtQkFBeUI7QUFBRSxrQkFBVTtBQUFBLE1BQU07QUFBQSxNQUNwRCxNQUFlLGNBQWlDO0FBQy9DLGNBQU0sWUFBWSxTQUFTO0FBQzNCLGNBQU0sU0FBUztBQUNmLGNBQU0sYUFBYSxTQUFTO0FBQzVCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsU0FBUyxZQUFZLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBQy9GLFVBQU0sTUFBTSxZQUFZLElBQUksSUFBSSx3QkFBd0IsQ0FBQztBQUN6RCxRQUFJLFVBQVU7QUFDZCxRQUFJLE9BQU87QUFDWCxnQkFBWSxJQUFJLFFBQVEsa0JBQWtCLE1BQU0sU0FBUyxDQUFDO0FBQzFELGdCQUFZLElBQUksUUFBUSxpQkFBaUIsTUFBTSxNQUFNLENBQUM7QUFFdEQsVUFBTSxVQUFVLFFBQVEsOEJBQThCLEVBQUUsT0FBTyxLQUFLLEdBQUc7QUFBQSxNQUN0RSxZQUFZO0FBQUEsTUFDWixlQUFlO0FBQUEsSUFDaEIsR0FBRyxJQUFJLEtBQUs7QUFDWixVQUFNLFlBQVk7QUFDbEIsUUFBSSxPQUFPO0FBRVgsVUFBTSxPQUFPLFFBQVEsU0FBUyxVQUFVO0FBQ3hDLFdBQU8sWUFBWSxTQUFTLElBQUk7QUFDaEMsVUFBTSxTQUFTLFNBQVM7QUFDeEIsVUFBTSxhQUFhO0FBQ25CLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsb0JBQW9CLFlBQVksbUJBQW1CLElBQUksY0FBWSxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQ3RGO0FBQUEsTUFDQTtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0Ysb0JBQW9CLENBQUMsS0FBSyxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQzdDLFNBQVM7QUFBQSxNQUNULE1BQU07QUFBQSxJQUNQLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxRQUFrQixDQUFDO0FBQ3pCLFFBQUk7QUFDSixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQzlDLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsTUFDM0gsU0FBUyxZQUFvQixVQUF3QjtBQUFFLGNBQU0sS0FBSyxZQUFZLFFBQVEsRUFBRTtBQUFBLE1BQUc7QUFBQSxNQUMzRixRQUFRLFlBQW9CLFNBQXVCO0FBQUUsY0FBTSxLQUFLLFdBQVcsT0FBTyxFQUFFO0FBQUEsTUFBRztBQUFBLE1BQ3ZGLG1CQUFtQixZQUFvQixRQUFzQjtBQUFFLGNBQU0sS0FBSyxzQkFBc0IsTUFBTSxFQUFFO0FBQUEsTUFBRztBQUFBLE1BQ3BILE1BQWUsaUJBQWlCLFlBQW9CLE9BQThCO0FBQUUsY0FBTSxLQUFLLG9CQUFvQixLQUFLLEVBQUU7QUFBQSxNQUFHO0FBQUEsTUFDN0gsTUFBZSxVQUFVLFlBQW9CLFNBQWdDO0FBQUUsY0FBTSxLQUFLLGFBQWEsT0FBTyxFQUFFO0FBQUEsTUFBRztBQUFBLE1BQ25ILE1BQWUsdUJBQXVCLFlBQW9CLFVBQWtDO0FBQUUsY0FBTSxLQUFLLDBCQUEwQixRQUFRLEVBQUU7QUFBQSxNQUFHO0FBQUEsTUFDaEosTUFBZSxZQUFZLFlBQW9CLGVBQW9CLFNBQWlEO0FBQ25ILHNCQUFjO0FBQ2QsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sZ0JBQTBDO0FBQUEsTUFDL0MsU0FBUztBQUFBLE1BQ1QsUUFBUTtBQUFBLE1BQ1IsaUJBQWlCO0FBQUEsTUFDakIsZUFBZTtBQUFBLE1BQ2YscUJBQXFCO0FBQUEsTUFDckIsUUFBUTtBQUFBLElBQ1Q7QUFDQSxVQUFNLFNBQVMsTUFBTSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLE1BQU0sT0FBTyxnQkFBZ0Isb0JBQW9CLEtBQUssR0FBRyxhQUFhO0FBRXJLLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsV0FBVyxRQUFRO0FBQUEsTUFDbkI7QUFBQSxNQUNBO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixXQUFXO0FBQUEsTUFDWCxPQUFPO0FBQUEsUUFDTjtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxFQUFFLE9BQU8sTUFBTSxPQUFPLGdCQUFnQixvQkFBb0IsS0FBSztBQUFBLElBQzdFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHFFQUFxRSxZQUFZO0FBQ3JGLFVBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksT0FBTyxDQUFDO0FBQ25FLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQzlDLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsTUFDM0gsY0FBMEI7QUFBRSxlQUFPLENBQUM7QUFBQSxNQUFHO0FBQUEsTUFDaEQsTUFBZSx5QkFBeUIsWUFBb0IsZUFBNkQ7QUFDeEgsY0FBTSxLQUFLLDRCQUE0QixLQUFLLFVBQVUsYUFBYSxDQUFDLEVBQUU7QUFBQSxNQUN2RTtBQUFBLE1BQ0EsTUFBZSxtQkFBa0M7QUFBRSxjQUFNLEtBQUssa0JBQWtCO0FBQUEsTUFBRztBQUFBLE1BQ25GLE1BQWUseUJBQXdDO0FBQUUsY0FBTSxLQUFLLHdCQUF3QjtBQUFBLE1BQUc7QUFBQSxNQUMvRixNQUFlLFlBQTJCO0FBQUUsY0FBTSxLQUFLLFdBQVc7QUFBQSxNQUFHO0FBQUEsSUFDdEUsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFNBQVMsS0FBSyxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUV4RixVQUFNLFFBQVEsNEJBQTRCLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLE9BQU8sS0FBSyxHQUFHO0FBQUEsTUFDdkYsZUFBZTtBQUFBLE1BQ2YscUJBQXFCO0FBQUEsTUFDckIsUUFBUTtBQUFBLE1BQ1Isa0JBQWtCLGFBQVc7QUFDNUIsY0FBTSxLQUFLLFdBQVcsUUFBUSxTQUFTLElBQUksUUFBUSxXQUFXLFFBQVEsUUFBUSxHQUFHLFNBQVMsRUFBRTtBQUM1RixhQUFLLEtBQUssWUFBWSxRQUFRLFFBQVE7QUFBQSxNQUN2QztBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLGVBQWUsS0FBSyxjQUFjLElBQUksR0FBRztBQUFBLElBQzFDLEdBQUc7QUFBQSxNQUNGLE9BQU87QUFBQSxRQUNOO0FBQUEsUUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRkFBc0YsWUFBWTtBQUN0RyxVQUFNLGVBQWUsWUFBWSxFQUFFLFdBQVcsU0FBUyxZQUFZLFFBQVEsQ0FBQztBQUM1RSxVQUFNLGVBQWUsWUFBWSxFQUFFLFdBQVcsU0FBUyxZQUFZLFFBQVEsQ0FBQztBQUM1RSxVQUFNLGdCQUFnQixJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFBbkM7QUFBQTtBQUN6QixhQUFrQixLQUFLO0FBQ3ZCLGFBQWtCLFFBQVE7QUFDMUIsYUFBa0IsZUFBd0MsQ0FBQyxFQUFFLElBQUksU0FBUyxPQUFPLFNBQVMsTUFBTSxRQUFRLE9BQU8sK0JBQStCLE9BQU8saUJBQWlCLDJCQUEyQixLQUFLLENBQUM7QUFBQTtBQUFBLE1BQzlMLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsSUFDckksRUFBRSxZQUFZO0FBQ2QsUUFBSTtBQUNKLFVBQU0sZ0JBQWdCLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUFuQztBQUFBO0FBQ3pCLGFBQWtCLEtBQUs7QUFDdkIsYUFBa0IsUUFBUTtBQUFBO0FBQUEsTUFDakIsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUNwSSxNQUFlLHlCQUF5QixZQUFvQixlQUE2RDtBQUN4SCwyQkFBbUIsY0FBYztBQUFBLE1BQ2xDO0FBQUEsSUFDRCxFQUFFLFlBQVk7QUFDZCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxjQUFjLGFBQWEsQ0FBQyxlQUFlLGFBQWEsQ0FBQztBQUU3RyxVQUFNLFNBQVMsTUFBTSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ3RHLGVBQWU7QUFBQSxNQUNmLHFCQUFxQjtBQUFBLE1BQ3JCLFFBQVE7QUFBQSxJQUNULENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksUUFBUTtBQUFBLE1BQ3BCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixrQkFBa0I7QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLGdCQUF5RDtBQUFBLE1BQzlELFlBQVk7QUFBQSxNQUNaLFVBQVU7QUFBQSxRQUNULFdBQVcseUJBQXlCO0FBQUEsUUFDcEMsTUFBTTtBQUFBLFFBQ04sUUFBUTtBQUFBLFFBQ1IsUUFBUTtBQUFBLFFBQ1IsU0FBUztBQUFBLFFBQ1QsSUFBSTtBQUFBLFFBQ0osZ0JBQWdCO0FBQUEsUUFDaEIsaUJBQWlCO0FBQUEsUUFDakIsc0JBQXNCLENBQUM7QUFBQSxNQUN4QjtBQUFBLElBQ0Q7QUFDQSxVQUFNLFFBQWtCLENBQUM7QUFDekIsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxpQkFBaUIsV0FBbUM7QUFBRSxlQUFPLEVBQUUsVUFBVTtBQUFBLE1BQW1DO0FBQUEsTUFDNUcsb0JBQTRDO0FBQ3BELGVBQU8sRUFBRSxRQUFRLENBQUMsYUFBYSxHQUFHLHdCQUF3QixFQUFFLE1BQU0sYUFBYSxPQUFPLGNBQWMsR0FBRyxhQUFhLFNBQVM7QUFBQSxNQUM5SDtBQUFBLE1BQ1MsU0FBUyxZQUFvQixTQUF1QjtBQUFFLGNBQU0sS0FBSyxZQUFZLE9BQU8sRUFBRTtBQUFBLE1BQUc7QUFBQSxNQUNsRyxNQUFlLGNBQWlDO0FBQy9DLGNBQU0sS0FBSyxNQUFNO0FBQ2pCLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixVQUFNLFFBQVEsNEJBQTRCLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLE9BQU8sS0FBSyxHQUFHLEVBQUUsU0FBUyxnQkFBZ0IsQ0FBQztBQUVwSCxXQUFPLGdCQUFnQixPQUFPLENBQUMsMEJBQTBCLE1BQU0sQ0FBQztBQUFBLEVBQ2pFLENBQUM7QUFFRCxPQUFLLGdGQUFnRixZQUFZO0FBQ2hHLFVBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksT0FBTyxDQUFDO0FBQ25FLFVBQU0sb0JBQW9CLFlBQVksSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUM3RCxRQUFJLGFBQStELEVBQUUsTUFBTSxXQUFXLFlBQVksZ0JBQWdCO0FBQ2xILFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFFBQWlEO0FBQUEsTUFDdEQsWUFBWTtBQUFBLE1BQ1osVUFBVTtBQUFBLFFBQ1QsV0FBVyx5QkFBeUI7QUFBQSxRQUNwQyxNQUFNO0FBQUEsUUFDTixRQUFRO0FBQUEsUUFDUixRQUFRO0FBQUEsUUFDUixTQUFTO0FBQUEsUUFDVCxJQUFJO0FBQUEsUUFDSixnQkFBZ0I7QUFBQSxRQUNoQixpQkFBaUI7QUFBQSxRQUNqQixzQkFBc0IsQ0FBQztBQUFBLE1BQ3hCO0FBQUEsSUFDRDtBQUNBLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFBbkM7QUFBQTtBQUNwQixhQUFrQixvQkFBb0Isa0JBQWtCO0FBQUE7QUFBQSxNQUMvQyxpQkFBaUIsV0FBbUM7QUFBRSxlQUFPLEVBQUUsVUFBVTtBQUFBLE1BQW1DO0FBQUEsTUFDNUcsb0JBQTRDO0FBQUUsZUFBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLHdCQUF3QixZQUFZLGFBQWEsT0FBVTtBQUFBLE1BQUc7QUFBQSxNQUNqSSxTQUFTLFlBQW9CLFNBQXVCO0FBQUUsY0FBTSxLQUFLLFlBQVksT0FBTyxFQUFFO0FBQUEsTUFBRztBQUFBLE1BQ2xHLE1BQWUsY0FBaUM7QUFDL0MsY0FBTSxLQUFLLE1BQU07QUFDakIsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sVUFBVSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRyxFQUFFLFNBQVMsZ0JBQWdCLENBQUM7QUFDOUgsVUFBTSxRQUFRLFFBQVE7QUFDdEIsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFFaEMsaUJBQWEsRUFBRSxNQUFNLGFBQWEsTUFBTTtBQUN4QyxzQkFBa0IsS0FBSztBQUN2QixVQUFNO0FBRU4sV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLDBCQUEwQixNQUFNLENBQUM7QUFBQSxFQUNqRSxDQUFDO0FBRUQsT0FBSyx1R0FBdUcsWUFBWTtBQUN2SCxVQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLG9CQUFvQixZQUFZLElBQUksSUFBSSxRQUFjLENBQUM7QUFDN0QsUUFBSSxhQUErRCxFQUFFLE1BQU0sV0FBVyxZQUFZLGdCQUFnQjtBQUNsSCxRQUFJLFVBQVU7QUFDZCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0Isb0JBQW9CLGtCQUFrQjtBQUFBO0FBQUEsTUFDL0MsaUJBQWlCLFdBQW1DO0FBQUUsZUFBTyxFQUFFLFVBQVU7QUFBQSxNQUFtQztBQUFBLE1BQzVHLG9CQUE0QztBQUNwRCxlQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsd0JBQXdCLFlBQVksYUFBYSxPQUFVO0FBQUEsTUFDakY7QUFBQSxNQUNTLFdBQWtCO0FBQUUsY0FBTSxJQUFJLE1BQU0sK0JBQStCO0FBQUEsTUFBRztBQUFBLE1BQ3RFLG1CQUF5QjtBQUFFLGtCQUFVO0FBQUEsTUFBTTtBQUFBLElBQ3JELEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sVUFBVSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRyxFQUFFLFNBQVMsZ0JBQWdCLENBQUM7QUFDOUgsVUFBTSxRQUFRLFFBQVE7QUFDdEIsaUJBQWEsRUFBRSxNQUFNLGVBQWUsWUFBWSxnQkFBZ0I7QUFDaEUsc0JBQWtCLEtBQUs7QUFFdkIsVUFBTSxPQUFPLFFBQVEsU0FBUyxzQ0FBc0M7QUFDcEUsV0FBTyxZQUFZLFNBQVMsSUFBSTtBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLDZGQUE2RixZQUFZO0FBQzdHLFVBQU0sWUFBWSxJQUFJLE1BQU0sZ0JBQWdCO0FBQzVDLFVBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksT0FBTyxDQUFDO0FBQ25FLFVBQU0sMEJBQTBCLFlBQVksSUFBSSxJQUFJLFFBQWMsQ0FBQztBQUNuRSxRQUFJLHNCQUFzQjtBQUMxQixRQUFJLFVBQVU7QUFDZCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0IsMEJBQTBCLHdCQUF3QjtBQUFBO0FBQUEsTUFDM0QsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLEtBQUssVUFBVTtBQUFBLE1BQXdCO0FBQUEsTUFDeEYsZ0JBQWdCLFdBQWdDO0FBQ3hELGVBQU8sdUJBQXVCLDJCQUEyQixRQUFRLFdBQVcsU0FBUyxJQUFJLENBQUMsR0FBRyxLQUFLLFlBQVksSUFBSSxDQUFDO0FBQUEsTUFDcEg7QUFBQSxNQUNTLG9CQUE0QztBQUNwRCxlQUFPLEVBQUUsUUFBUSxDQUFDLEdBQUcsd0JBQXdCLEVBQUUsTUFBTSxXQUFXLFlBQVksU0FBUyxHQUFHLGFBQWEsT0FBVTtBQUFBLE1BQ2hIO0FBQUEsTUFDUyxtQkFBeUI7QUFBRSxrQkFBVTtBQUFBLE1BQU07QUFBQSxJQUNyRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixVQUFNLFVBQVUsUUFBUSw0QkFBNEIsV0FBVyxFQUFFLE9BQU8sS0FBSyxHQUFHLEVBQUUsU0FBUyxTQUFTLENBQUM7QUFDckcsVUFBTSxRQUFRLFFBQVE7QUFDdEIsMEJBQXNCO0FBQ3RCLDRCQUF3QixLQUFLO0FBRTdCLFVBQU0sT0FBTyxRQUFRLFNBQVMsNENBQTRDO0FBQzFFLFdBQU8sWUFBWSxTQUFTLElBQUk7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyxpR0FBaUcsWUFBWTtBQUNqSCxVQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLE9BQU8sQ0FBQztBQUNuRSxVQUFNLG9CQUFvQixZQUFZLElBQUksSUFBSSxRQUFjLENBQUM7QUFDN0QsUUFBSSxVQUFVO0FBQ2QsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUFuQztBQUFBO0FBQ3BCLGFBQWtCLG9CQUFvQixrQkFBa0I7QUFBQTtBQUFBLE1BQy9DLGlCQUFpQixXQUFtQztBQUFFLGVBQU8sRUFBRSxVQUFVO0FBQUEsTUFBbUM7QUFBQSxNQUM1RyxvQkFBNEM7QUFDcEQsZUFBTyxFQUFFLFFBQVEsQ0FBQyxHQUFHLHdCQUF3QixFQUFFLE1BQU0sV0FBVyxZQUFZLFNBQVMsR0FBRyxhQUFhLE9BQVU7QUFBQSxNQUNoSDtBQUFBLE1BQ1MsbUJBQXlCO0FBQUUsa0JBQVU7QUFBQSxNQUFNO0FBQUEsSUFDckQsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFDbEYsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBRXpELFVBQU0sVUFBVSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRyxFQUFFLFNBQVMsU0FBUyxHQUFHLElBQUksS0FBSztBQUNsSSxVQUFNLFFBQVEsUUFBUTtBQUN0QixRQUFJLE9BQU87QUFFWCxVQUFNLE9BQU8sUUFBUSxTQUFTLFVBQVU7QUFDeEMsV0FBTyxZQUFZLFNBQVMsSUFBSTtBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLG9GQUFvRixZQUFZO0FBQ3BHLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxnQkFBZ0IsSUFBSSxnQkFBc0I7QUFDaEQsVUFBTSxxQkFBcUIsSUFBSSxnQkFBc0I7QUFDckQsVUFBTSxrQkFBa0IsSUFBSSxnQkFBc0I7QUFDbEQsVUFBTSxnQkFBZ0IsSUFBSSxnQkFBc0I7QUFDaEQsVUFBTSxhQUFhLElBQUksZ0JBQXNCO0FBQzdDLFVBQU0sUUFBa0IsQ0FBQztBQUN6QixVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQzlDLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsTUFDcEksTUFBZSxtQkFBa0M7QUFDaEQsY0FBTSxLQUFLLGlCQUFpQjtBQUM1QixjQUFNLGNBQWM7QUFDcEIsY0FBTSxLQUFLLGVBQWU7QUFBQSxNQUMzQjtBQUFBLE1BQ0EsTUFBZSx5QkFBd0M7QUFDdEQsY0FBTSxLQUFLLG1CQUFtQjtBQUM5QixjQUFNLG1CQUFtQixTQUFTO0FBQ2xDLGNBQU0sZ0JBQWdCO0FBQ3RCLGNBQU0sS0FBSyxpQkFBaUI7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsTUFBZSxZQUEyQjtBQUN6QyxjQUFNLEtBQUssY0FBYztBQUN6QixjQUFNLGNBQWMsU0FBUztBQUM3QixjQUFNLFdBQVc7QUFDakIsY0FBTSxLQUFLLFlBQVk7QUFBQSxNQUN4QjtBQUFBLE1BQ0EsTUFBZSxjQUFpQztBQUMvQyxjQUFNLEtBQUssTUFBTTtBQUNqQixlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFFbEYsVUFBTSxVQUFVLFFBQVEsNEJBQTRCLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLE9BQU8sS0FBSyxHQUFHO0FBQUEsTUFDakcsZUFBZTtBQUFBLE1BQ2YscUJBQXFCO0FBQUEsTUFDckIsUUFBUTtBQUFBLElBQ1QsQ0FBQztBQUNELFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFdBQU8sZ0JBQWdCLE9BQU8sQ0FBQyxpQkFBaUIsQ0FBQztBQUVqRCxVQUFNLGNBQWMsU0FBUztBQUM3QixVQUFNLG1CQUFtQjtBQUN6QixXQUFPLGdCQUFnQixPQUFPLENBQUMsbUJBQW1CLGlCQUFpQixtQkFBbUIsQ0FBQztBQUV2RixVQUFNLGdCQUFnQixTQUFTO0FBQy9CLFVBQU0sY0FBYztBQUNwQixXQUFPLGdCQUFnQixPQUFPLENBQUMsbUJBQW1CLGlCQUFpQixxQkFBcUIsbUJBQW1CLGNBQWMsQ0FBQztBQUUxSCxVQUFNLFdBQVcsU0FBUztBQUMxQixVQUFNO0FBQ04sV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLG1CQUFtQixpQkFBaUIscUJBQXFCLG1CQUFtQixnQkFBZ0IsY0FBYyxNQUFNLENBQUM7QUFBQSxFQUNqSixDQUFDO0FBRUQsT0FBSywrRkFBK0YsWUFBWTtBQUMvRyxVQUFNLE9BQWMsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sY0FBYyxFQUFFO0FBQ3ZFLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUM3QixVQUFVLGdCQUFnQixJQUFJO0FBQUEsSUFDL0IsQ0FBQztBQUNELFVBQU0sb0JBQW9CLElBQUksZ0JBQXNCO0FBQ3BELFFBQUksVUFBVTtBQUNkLFFBQUksT0FBTztBQUNYLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUNwSSxNQUFlLG1CQUFrQztBQUNoRCxjQUFNLGtCQUFrQjtBQUFBLE1BQ3pCO0FBQUEsTUFDUyxtQkFBeUI7QUFDakMsa0JBQVU7QUFBQSxNQUNYO0FBQUEsTUFDQSxNQUFlLGNBQWlDO0FBQy9DLGVBQU87QUFDUCxlQUFPO0FBQUEsTUFDUjtBQUFBLElBQ0QsRUFBRSxPQUFPO0FBQ1QsVUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFDbEYsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHdCQUF3QixDQUFDO0FBRXpELFVBQU0sVUFBVSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ2pHLGVBQWU7QUFBQSxNQUNmLFFBQVE7QUFBQSxJQUNULEdBQUcsSUFBSSxLQUFLO0FBQ1osVUFBTSxRQUFRLFFBQVE7QUFDdEIsUUFBSSxPQUFPO0FBRVgsVUFBTSxPQUFPLFFBQVEsU0FBUyxVQUFVO0FBQ3hDLFdBQU8sZ0JBQWdCLEVBQUUsU0FBUyxLQUFLLEdBQUcsRUFBRSxTQUFTLE1BQU0sTUFBTSxNQUFNLENBQUM7QUFDeEUsVUFBTSxrQkFBa0IsU0FBUztBQUFBLEVBQ2xDLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxXQUFXLElBQUksZ0JBQXNCO0FBQzNDLFFBQUksVUFBVTtBQUNkLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUMzSCxtQkFBeUI7QUFDakMsa0JBQVU7QUFBQSxNQUNYO0FBQUEsTUFDQSxNQUFlLGNBQWlDO0FBQy9DLGNBQU0sU0FBUztBQUNmLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUNsRixVQUFNLE1BQU0sWUFBWSxJQUFJLElBQUksd0JBQXdCLENBQUM7QUFFekQsVUFBTSxVQUFVLFFBQVEsNEJBQTRCLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxFQUFFLE9BQU8sS0FBSyxHQUFHLFFBQVcsSUFBSSxLQUFLO0FBQ3RILFVBQU0sUUFBUSxRQUFRO0FBQ3RCLFFBQUksT0FBTztBQUVYLFVBQU0sT0FBTyxRQUFRLFNBQVMsVUFBVTtBQUN4QyxXQUFPLFlBQVksU0FBUyxJQUFJO0FBQ2hDLFVBQU0sU0FBUyxTQUFTO0FBQUEsRUFDekIsQ0FBQztBQUVELE9BQUssNEZBQTRGLFlBQVk7QUFDNUcsVUFBTSxPQUFjLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGNBQWMsRUFBRTtBQUN2RSxVQUFNLFVBQVUsWUFBWTtBQUFBLE1BQzNCLFdBQVc7QUFBQSxNQUNYLFlBQVk7QUFBQSxNQUNaLE9BQU8sZ0JBQWdCLENBQUMsSUFBSSxDQUFDO0FBQUEsTUFDN0IsVUFBVSxnQkFBZ0IsSUFBSTtBQUFBLElBQy9CLENBQUM7QUFDRCxRQUFJLFVBQVU7QUFDZCxRQUFJLE9BQU87QUFDWCxVQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLE1BQW5DO0FBQUE7QUFDcEIsYUFBa0IsZUFBd0MsQ0FBQyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFFBQVEsT0FBTyxRQUFRLE1BQU0sUUFBUSxHQUFHLENBQUM7QUFBQTtBQUFBLE1BQ3JKLG1CQUFzQztBQUFFLGVBQU8sRUFBRSxXQUFXLElBQUksTUFBTSxnQkFBZ0IsRUFBRTtBQUFBLE1BQW1DO0FBQUEsTUFDM0gsbUJBQTZCO0FBQ3JDLGtCQUFVO0FBQ1YsZUFBTztBQUFBLE1BQ1I7QUFBQSxNQUNBLE1BQWUsY0FBaUM7QUFDL0MsZUFBTztBQUNQLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixVQUFNLE9BQU87QUFBQSxNQUNaLE1BQU0sUUFBUSw0QkFBNEIsSUFBSSxNQUFNLGdCQUFnQixHQUFHLEVBQUUsT0FBTyxLQUFLLEdBQUc7QUFBQSxRQUN2RixlQUFlO0FBQUEsUUFDZixRQUFRO0FBQUEsTUFDVCxDQUFDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFFQSxXQUFPLGdCQUFnQixFQUFFLFNBQVMsS0FBSyxHQUFHLEVBQUUsU0FBUyxPQUFPLE1BQU0sTUFBTSxDQUFDO0FBQUEsRUFDMUUsQ0FBQztBQUVELE9BQUssK0ZBQStGLFlBQVk7QUFDL0csVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxPQUFPLENBQUM7QUFDbkUsUUFBSSxPQUFPO0FBQ1gsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUFuQztBQUFBO0FBQ3BCLGFBQWtCLGVBQXdDLENBQUMsRUFBRSxpQkFBaUIsMkJBQTJCLFFBQVEsSUFBSSxRQUFRLE9BQU8sUUFBUSxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQUE7QUFBQSxNQUNySixtQkFBc0M7QUFBRSxlQUFPLEVBQUUsV0FBVyxJQUFJLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxNQUFtQztBQUFBLE1BQ3BJLE1BQWUsY0FBaUM7QUFDL0MsZUFBTztBQUNQLGVBQU87QUFBQSxNQUNSO0FBQUEsSUFDRCxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixVQUFNLFNBQVMsTUFBTSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRztBQUFBLE1BQ3RHLGVBQWU7QUFBQSxJQUNoQixDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsRUFBRSxZQUFZLFFBQVEsWUFBWSxLQUFLLEdBQUcsRUFBRSxZQUFZLFFBQVEsTUFBTSxLQUFLLENBQUM7QUFBQSxFQUNwRyxDQUFDO0FBRUQsT0FBSyw0RUFBNEUsWUFBWTtBQUM1RixVQUFNLE9BQWMsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sY0FBYyxFQUFFO0FBQ3ZFLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUM3QixVQUFVLGdCQUFnQixJQUFJO0FBQUEsSUFDL0IsQ0FBQztBQUNELFFBQUksVUFBVTtBQUNkLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUMzSCxXQUFpQjtBQUFFLGNBQU0sSUFBSSxNQUFNLGlCQUFpQjtBQUFBLE1BQUc7QUFBQSxNQUN2RCxtQkFBeUI7QUFBRSxrQkFBVTtBQUFBLE1BQU07QUFBQSxNQUNwRCxNQUFlLFlBQVksWUFBb0IsZUFBb0IsVUFBa0Q7QUFBRSxlQUFPO0FBQUEsTUFBUztBQUFBLElBQ3hJLEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sT0FBTztBQUFBLE1BQ1osTUFBTSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssR0FBRyxFQUFFLFNBQVMsTUFBTSxDQUFDO0FBQUEsTUFDMUc7QUFBQSxJQUNEO0FBQ0EsV0FBTyxZQUFZLFNBQVMsSUFBSTtBQUFBLEVBQ2pDLENBQUM7QUFFRCxPQUFLLG1GQUFtRixZQUFZO0FBQ25HLFVBQU0sT0FBYyxFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDdkUsVUFBTSxVQUFVLFlBQVk7QUFBQSxNQUMzQixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixPQUFPLGdCQUFnQixDQUFDLElBQUksQ0FBQztBQUFBLE1BQzdCLFVBQVUsZ0JBQWdCLElBQUk7QUFBQSxJQUMvQixDQUFDO0FBQ0QsVUFBTSxhQUF1RCxDQUFDO0FBQzlELFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUNwSSxNQUFlLFlBQVksWUFBb0IsZUFBb0IsVUFBa0Q7QUFFcEgsUUFBQyxXQUFXLFFBQTJDLFFBQVE7QUFDL0QsZUFBTztBQUFBLE1BQ1I7QUFBQSxJQUNELEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBQ2xGLGVBQVcsVUFBVTtBQUVyQixVQUFNLFNBQVMsTUFBTSxRQUFRLDRCQUE0QixJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsRUFBRSxPQUFPLEtBQUssQ0FBQztBQUNyRyxXQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsRUFDckMsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxPQUFPLENBQUM7QUFDbkUsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxtQkFBc0M7QUFBRSxlQUFPLEVBQUUsV0FBVyxJQUFJLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxNQUFtQztBQUFBLElBQ3JJLEVBQUUsT0FBTztBQUNULFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFVBQU0sWUFBc0IsQ0FBQztBQUM3QixnQkFBWSxJQUFJLFFBQVEsdUJBQXVCLE9BQUssVUFBVSxLQUFLLEVBQUUsU0FBUyxDQUFDLENBQUM7QUFHaEYsWUFBUSxpQkFBaUIsSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBQ3BELFlBQVEsa0JBQWtCO0FBRTFCLFdBQU8sZ0JBQWdCLFdBQVcsQ0FBQyxJQUFJLENBQUM7QUFBQSxFQUN6QyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFNBQVM7QUFBQSxNQUNkLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxPQUFPLENBQUM7QUFBQSxNQUNuRCxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksT0FBTyxDQUFDO0FBQUEsSUFDcEQ7QUFDQSxVQUFNLFVBQW9CLENBQUM7QUFDM0IsUUFBSSxjQUFjO0FBQ2xCLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxNQUMzSCxtQkFBNkI7QUFBRSxlQUFPLE9BQU8sYUFBYTtBQUFBLE1BQUc7QUFBQSxNQUM3RCxpQkFBaUIsV0FBeUI7QUFBRSxnQkFBUSxLQUFLLFNBQVM7QUFBQSxNQUFHO0FBQUEsSUFDL0UsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUNYLFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLE9BQU8sQ0FBQyxHQUFHLGFBQWEsUUFBUTtBQUVwRixVQUFNLGVBQWlGLENBQUM7QUFDeEYsZ0JBQVksSUFBSSxRQUFRLDRCQUE0QixDQUFDLEVBQUUsTUFBTSxHQUFHLE1BQU07QUFDckUsbUJBQWEsS0FBSyxFQUFFLE1BQU0sS0FBSyxXQUFXLElBQUksR0FBRyxXQUFXLGNBQWMsUUFBUSxXQUFXLElBQUksR0FBRyxVQUFVLENBQUM7QUFBQSxJQUNoSCxDQUFDLENBQUM7QUFFRixZQUFRLGlCQUFpQixJQUFJLE1BQU0sZ0JBQWdCLENBQUM7QUFDcEQsWUFBUSxpQkFBaUIsSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBRXBELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBO0FBQUEsTUFDQSxjQUFjLFFBQVEsV0FBVyxJQUFJLEdBQUc7QUFBQSxJQUN6QyxHQUFHO0FBQUEsTUFDRixjQUFjLENBQUMsRUFBRSxNQUFNLE1BQU0sSUFBSSxNQUFNLGNBQWMsS0FBSyxDQUFDO0FBQUEsTUFDM0QsU0FBUyxDQUFDLElBQUk7QUFBQSxNQUNkLGNBQWM7QUFBQSxJQUNmLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFVBQU0sUUFBUSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksT0FBTyxDQUFDO0FBQ2pFLFFBQUksY0FBYztBQUNsQixVQUFNLFVBQW9CLENBQUM7QUFDM0IsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUM5QyxtQkFBc0M7QUFBRSxlQUFPLEVBQUUsV0FBVyxJQUFJLE1BQU0sZ0JBQWdCLEVBQUU7QUFBQSxNQUFtQztBQUFBLE1BQzNILG1CQUE2QjtBQUNyQyxZQUFJLGdCQUFnQixHQUFHO0FBQ3RCLGdCQUFNLElBQUksTUFBTSxlQUFlO0FBQUEsUUFDaEM7QUFDQSxlQUFPO0FBQUEsTUFDUjtBQUFBLE1BQ1MsaUJBQWlCLFdBQXlCO0FBQUUsZ0JBQVEsS0FBSyxTQUFTO0FBQUEsTUFBRztBQUFBLElBQy9FLEVBQUUsS0FBSztBQUNQLFVBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLE9BQU8sYUFBYSxRQUFRO0FBQ2hGLFVBQU0sZUFBeUIsQ0FBQztBQUNoQyxnQkFBWSxJQUFJLFFBQVEsNEJBQTRCLENBQUMsRUFBRSxNQUFNLEdBQUcsTUFBTSxhQUFhLEtBQUssR0FBRyxLQUFLLFNBQVMsS0FBSyxHQUFHLFNBQVMsRUFBRSxDQUFDLENBQUM7QUFFOUgsWUFBUSxpQkFBaUIsSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBQ3BELFdBQU8sT0FBTyxNQUFNLFFBQVEsaUJBQWlCLElBQUksTUFBTSxnQkFBZ0IsQ0FBQyxHQUFHLGVBQWU7QUFFMUYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixjQUFjLFFBQVEsV0FBVyxJQUFJLEdBQUc7QUFBQSxNQUN4QztBQUFBLE1BQ0E7QUFBQSxJQUNELEdBQUc7QUFBQSxNQUNGLGNBQWM7QUFBQSxNQUNkLGNBQWMsQ0FBQztBQUFBLE1BQ2YsU0FBUyxDQUFDO0FBQUEsSUFDWCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxRUFBcUUsTUFBTTtBQUMvRSxVQUFNLFNBQVM7QUFBQSxNQUNkLFlBQVksRUFBRSxXQUFXLHdCQUF3QixZQUFZLE9BQU8sQ0FBQztBQUFBLE1BQ3JFLFlBQVksRUFBRSxXQUFXLGVBQWUsWUFBWSxPQUFPLENBQUM7QUFBQSxNQUM1RCxZQUFZLEVBQUUsV0FBVyx5QkFBeUIsWUFBWSxPQUFPLENBQUM7QUFBQSxNQUN0RSxZQUFZLEVBQUUsV0FBVywwQkFBMEIsWUFBWSxPQUFPLENBQUM7QUFBQSxJQUN4RTtBQUNBLFVBQU0sVUFBb0IsQ0FBQztBQUMzQixRQUFJLGNBQWM7QUFDbEIsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUFuQztBQUFBO0FBQ3BCLGFBQWtCLHFCQUFxQjtBQUFBO0FBQUEsTUFDOUIsaUJBQWlCQSxZQUFtQztBQUM1RCxlQUFPO0FBQUEsVUFDTixLQUFLQTtBQUFBLFVBQ0wsT0FBTztBQUFBLFVBQ1AsTUFBTSxRQUFRO0FBQUEsVUFDZCxTQUFTLENBQUM7QUFBQSxVQUNWLHdCQUF3QjtBQUFBLFVBQ3hCLG9CQUFvQjtBQUFBLFFBQ3JCO0FBQUEsTUFDRDtBQUFBLE1BQ1MsbUJBQTZCO0FBQUUsZUFBTyxPQUFPLGFBQWE7QUFBQSxNQUFHO0FBQUEsTUFDN0Qsa0JBQTRCO0FBQUUsZUFBTyxPQUFPLGFBQWE7QUFBQSxNQUFHO0FBQUEsTUFDNUQsaUJBQWlCLFdBQXlCO0FBQUUsZ0JBQVEsS0FBSyxTQUFTO0FBQUEsTUFBRztBQUFBLElBQy9FLEVBQUUsT0FBTyxDQUFDLENBQUM7QUFDWCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxPQUFPLENBQUMsR0FBRyxhQUFhLFFBQVE7QUFDcEYsVUFBTSxZQUFZLElBQUksTUFBTSxnQkFBZ0I7QUFFNUMsVUFBTSx5QkFBeUIsUUFBUSx3QkFBd0IsU0FBUztBQUN4RSxZQUFRLGlCQUFpQixTQUFTO0FBQ2xDLFlBQVEsMEJBQTBCO0FBQ2xDLFlBQVEseUJBQXlCLHNCQUFzQjtBQUN2RCxZQUFRLHdCQUF3QixTQUFTO0FBQ3pDLFlBQVEseUJBQXlCO0FBRWpDLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxRQUFRLFdBQVcsSUFBSSxHQUFHO0FBQUEsTUFDdEMsbUJBQW1CLFFBQVEsa0JBQWtCLElBQUksR0FBRztBQUFBLE1BQ3BEO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixZQUFZO0FBQUEsTUFDWixtQkFBbUI7QUFBQSxNQUNuQixTQUFTLENBQUMsd0JBQXdCLHlCQUF5Qix3QkFBd0I7QUFBQSxJQUNwRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2RUFBNkUsWUFBWTtBQUM3RixVQUFNLE9BQWMsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sY0FBYyxFQUFFO0FBQ3ZFLFVBQU0sVUFBVSxZQUFZO0FBQUEsTUFDM0IsV0FBVztBQUFBLE1BQ1gsWUFBWTtBQUFBLE1BQ1osT0FBTyxnQkFBZ0IsQ0FBQyxJQUFJLENBQUM7QUFBQSxNQUM3QixVQUFVLGdCQUFnQixJQUFJO0FBQUEsSUFDL0IsQ0FBQztBQUNELFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFDOUMsbUJBQXNDO0FBQUUsZUFBTyxFQUFFLFdBQVcsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQUEsTUFBbUM7QUFBQSxJQUNySSxFQUFFLE9BQU87QUFDVCxVQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixRQUFJLGVBQWU7QUFDbkIsZ0JBQVksSUFBSSxRQUFRLHVCQUF1QixNQUFNLGNBQWMsQ0FBQztBQUlwRSxVQUFNLFFBQVEsUUFBUSxpQkFBaUIsSUFBSSxNQUFNLGdCQUFnQixDQUFDO0FBQ2xFLFVBQU0sUUFBUSxtQkFBbUIsT0FBTyxFQUFFLE9BQU8sS0FBSyxDQUFDO0FBRXZELFdBQU8sWUFBWSxjQUFjLENBQUM7QUFBQSxFQUNuQyxDQUFDO0FBRUQsT0FBSyw2RUFBNkUsTUFBTTtBQUN2RixVQUFNLFVBQVUsMEJBQTBCLGFBQWEsR0FBRyxDQUFDO0FBQzNELFdBQU8sZ0JBQWdCLFFBQVEsbUJBQW1CLEVBQUUsSUFBSSxVQUFRLEtBQUssRUFBRSxHQUFHLENBQUMsV0FBVyxZQUFZLENBQUM7QUFBQSxFQUNwRyxDQUFDO0FBRUQsT0FBSyxvRkFBb0YsTUFBTTtBQUM5RixVQUFNLFVBQVUsMEJBQTBCLGFBQWEsR0FBRyxFQUFFO0FBQzVELFdBQU8sZ0JBQWdCLFFBQVEsbUJBQW1CLEVBQUUsSUFBSSxVQUFRLEtBQUssRUFBRSxHQUFHLENBQUMsY0FBYyxTQUFTLENBQUM7QUFBQSxFQUNwRyxDQUFDO0FBRUQsT0FBSyx5RUFBeUUsWUFBWTtBQUN6RixVQUFNLFFBQVEsWUFBWSxFQUFFLFdBQVcsU0FBUyxZQUFZLE9BQU8sQ0FBQztBQUNwRSxVQUFNLFlBQVksWUFBWSxFQUFFLFdBQVcsYUFBYSxZQUFZLE9BQU8sQ0FBQztBQUM1RSxVQUFNLHNCQUFzQixZQUFZLElBQUksSUFBSSxRQUE0RCxDQUFDO0FBQzdHLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFFdkQsY0FBYztBQUFFLGNBQU0sS0FBSztBQUQzQixhQUFrQixzQkFBc0Isb0JBQW9CO0FBQUEsTUFDOUI7QUFBQSxNQUNyQixjQUEwQjtBQUFFLGVBQU8sQ0FBQyxPQUFPLFNBQVM7QUFBQSxNQUFHO0FBQUEsSUFDakU7QUFDQSxVQUFNLEVBQUUsS0FBSyxJQUFJLGdDQUFnQyxPQUFPLGFBQWEsUUFBUTtBQUc3RSxVQUFNLEtBQUssWUFBWSxNQUFNLFFBQVE7QUFDckMsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxPQUFPO0FBTS9ELHdCQUFvQixLQUFLLEVBQUUsTUFBTSxPQUFPLElBQUksVUFBVSxDQUFDO0FBRXZELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsU0FBUyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEdBQUcsYUFBYSxJQUFJO0FBQUEsTUFDakUsUUFBUSxLQUFLLGNBQWMsSUFBSSxHQUFHLGFBQWE7QUFBQSxJQUNoRCxHQUFHO0FBQUEsTUFDRixTQUFTLENBQUMsV0FBVztBQUFBLE1BQ3JCLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDhGQUE4RixZQUFZO0FBQzlHLFVBQU0sU0FBUyxZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksUUFBUSxVQUFVLElBQUksTUFBTSxnQkFBZ0IsRUFBRSxDQUFDO0FBQzNHLFVBQU0sUUFBUSxZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksUUFBUSxVQUFVLElBQUksTUFBTSxlQUFlLEVBQUUsQ0FBQztBQUN6RyxVQUFNLHNCQUFzQixZQUFZLElBQUksSUFBSSxRQUE0RCxDQUFDO0FBQzdHLFVBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsTUFFdkQsY0FBYztBQUFFLGNBQU0sTUFBTTtBQUQ1QixhQUFrQixzQkFBc0Isb0JBQW9CO0FBQUEsTUFDN0I7QUFBQSxNQUN0QixjQUEwQjtBQUFFLGVBQU8sQ0FBQyxNQUFNO0FBQUEsTUFBRztBQUFBLElBQ3ZEO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSSxnQ0FBZ0MsUUFBUSxhQUFhLFFBQVE7QUFFOUUsVUFBTSxLQUFLLFlBQVksT0FBTyxRQUFRO0FBQ3RDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFNBQVMsU0FBUyxHQUFHLE9BQU8sU0FBUyxTQUFTLENBQUM7QUFJNUYsd0JBQW9CLEtBQUssRUFBRSxNQUFNLFFBQVEsSUFBSSxNQUFNLENBQUM7QUFFcEQsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsU0FBUyxTQUFTLEdBQUcsTUFBTSxTQUFTLFNBQVMsQ0FBQztBQUFBLEVBQzVGLENBQUM7QUFFRCxPQUFLLHNFQUFzRSxZQUFZO0FBQ3RGLFVBQU0sU0FBUyxZQUFZLEVBQUUsV0FBVyxVQUFVLFlBQVksT0FBTyxDQUFDO0FBQ3RFLFVBQU0sUUFBUSxZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDO0FBQ3BFLFVBQU0sWUFBWSxZQUFZLEVBQUUsV0FBVyxhQUFhLFlBQVksT0FBTyxDQUFDO0FBQzVFLFVBQU0sc0JBQXNCLFlBQVksSUFBSSxJQUFJLFFBQTRELENBQUM7QUFDN0csVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUV2RCxjQUFjO0FBQUUsY0FBTSxNQUFNO0FBRDVCLGFBQWtCLHNCQUFzQixvQkFBb0I7QUFBQSxNQUM3QjtBQUFBLE1BQ3RCLGNBQTBCO0FBQUUsZUFBTyxDQUFDLFFBQVEsT0FBTyxTQUFTO0FBQUEsTUFBRztBQUFBLElBQ3pFO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSSxnQ0FBZ0MsUUFBUSxhQUFhLFFBQVE7QUFJOUUsVUFBTSxLQUFLLFlBQVksT0FBTyxRQUFRO0FBQ3RDLFNBQUssU0FBUyxPQUFPLFVBQVUsU0FBUyxLQUFLO0FBQzdDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsUUFBUTtBQUloRSx3QkFBb0IsS0FBSyxFQUFFLE1BQU0sT0FBTyxJQUFJLFVBQVUsQ0FBQztBQUV2RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVMsS0FBSyxnQkFBZ0IsSUFBSSxFQUFFLElBQUksT0FBSyxHQUFHLGFBQWEsSUFBSTtBQUFBLE1BQ2pFLFFBQVEsS0FBSyxjQUFjLElBQUksR0FBRyxhQUFhO0FBQUEsSUFDaEQsR0FBRztBQUFBLE1BQ0YsU0FBUyxDQUFDLFVBQVUsV0FBVztBQUFBLE1BQy9CLFFBQVE7QUFBQSxJQUNULENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxZQUFZO0FBQzVGLFVBQU0sSUFBSSxZQUFZLEVBQUUsV0FBVyxLQUFLLFlBQVksT0FBTyxDQUFDO0FBQzVELFVBQU0sSUFBSSxZQUFZLEVBQUUsV0FBVyxLQUFLLFlBQVksT0FBTyxDQUFDO0FBQzVELFVBQU0sUUFBUSxZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDO0FBQ3BFLFVBQU0sc0JBQXNCLFlBQVksSUFBSSxJQUFJLFFBQTBDLENBQUM7QUFDM0YsVUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxNQUV2RCxjQUFjO0FBQUUsY0FBTSxDQUFDO0FBRHZCLGFBQWtCLHNCQUFzQixvQkFBb0I7QUFBQSxNQUNsQztBQUFBLE1BQ2pCLGNBQTBCO0FBQUUsZUFBTyxDQUFDLEdBQUcsR0FBRyxLQUFLO0FBQUEsTUFBRztBQUFBLElBQzVEO0FBQ0EsVUFBTSxFQUFFLEtBQUssSUFBSSxnQ0FBZ0MsR0FBRyxhQUFhLFFBQVE7QUFFekUsVUFBTSxLQUFLLFlBQVksRUFBRSxRQUFRO0FBQ2pDLFdBQU8sWUFBWSxLQUFLLGNBQWMsSUFBSSxHQUFHLFdBQVcsR0FBRztBQUczRCx3QkFBb0IsS0FBSyxFQUFFLE1BQU0sT0FBTyxJQUFJLEVBQUUsQ0FBQztBQUMvQyxXQUFPLFlBQVksS0FBSyxjQUFjLElBQUksR0FBRyxXQUFXLEdBQUc7QUFHM0Qsd0JBQW9CLEtBQUssRUFBRSxNQUFNLEdBQUcsSUFBSSxFQUFFLENBQUM7QUFDM0MsV0FBTyxZQUFZLEtBQUssY0FBYyxJQUFJLEdBQUcsV0FBVyxHQUFHO0FBQUEsRUFDNUQsQ0FBQztBQUVELFFBQU0sa0JBQWtCLE1BQU07QUFBQSxJQUU3QixNQUFNLDBCQUEwQixxQkFBcUI7QUFBQSxNQUVwRCxZQUFxQyxJQUE2QixPQUFnQixTQUFtQjtBQUNwRyxjQUFNLE9BQU87QUFEdUI7QUFBNkI7QUFEbEUsYUFBUyxVQUFzQixDQUFDO0FBQUEsTUFHaEM7QUFBQSxNQUNBLE1BQWUsZUFBZSxZQUE4QztBQUMzRSxhQUFLLFFBQVEsS0FBSyxDQUFDLEdBQUcsVUFBVSxDQUFDO0FBQ2pDLFlBQUksS0FBSyxPQUFPO0FBQ2YsZ0JBQU0sSUFBSSxNQUFNLEdBQUcsS0FBSyxFQUFFLFNBQVM7QUFBQSxRQUNwQztBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBRUEsYUFBUyxjQUFjLFdBQTREO0FBQ2xGLFlBQU0sdUJBQXVCLFlBQVksSUFBSSxJQUFJLHlCQUF5QixDQUFDO0FBQzNFLDJCQUFxQixLQUFLLGlCQUFpQixZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQyxDQUFDO0FBQ3hGLDJCQUFxQixLQUFLLGFBQWEsSUFBSSxlQUFlLENBQUM7QUFDM0QsMkJBQXFCLEtBQUssb0JBQW9CLFlBQVksSUFBSSxJQUFJLHNCQUFzQixDQUFDLENBQUM7QUFDMUYsMkJBQXFCLEtBQUssMkJBQTJCLElBQUksNkJBQTZCLFNBQVMsQ0FBQztBQUNoRywyQkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLDJCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLDJCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLDJCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxRQUFuQztBQUFBO0FBQzNDLGVBQWtCLHFCQUFxQixNQUFNO0FBQUE7QUFBQSxNQUM5QyxHQUFDO0FBQ0QsMkJBQXFCLEtBQUssMkJBQTJCLElBQUksY0FBYyxLQUFnQyxFQUFFO0FBQUEsUUFDL0YsY0FBb0I7QUFBQSxRQUFFO0FBQUEsTUFDaEMsR0FBQztBQUNELGFBQU8sWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQUEsSUFDdEY7QUFFQSxTQUFLLG1GQUFtRixZQUFZO0FBQ25HLFlBQU0sS0FBSyxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksS0FBSyxDQUFDO0FBQzVELFlBQU0sS0FBSyxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksS0FBSyxDQUFDO0FBQzVELFlBQU0sVUFBVSxJQUFJLGtCQUFrQixNQUFNLE1BQU0sRUFBRTtBQUNwRCxZQUFNLGFBQWEsSUFBSSxrQkFBa0IsTUFBTSxPQUFPLEVBQUU7QUFDeEQsWUFBTSxVQUFVLGNBQWMsQ0FBQyxTQUFTLFVBQVUsQ0FBQztBQUVuRCxZQUFNLFVBQW9CLENBQUM7QUFDM0Isa0JBQVksSUFBSSxRQUFRLG1CQUFtQixhQUFXLFFBQVEsS0FBSyxRQUFRLFNBQVMsQ0FBQyxDQUFDO0FBRXRGLFlBQU0sT0FBTyxRQUFRLFFBQVEsZUFBZSxDQUFDLElBQUksRUFBRSxDQUFDLEdBQUcsV0FBVztBQUVsRSxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGdCQUFnQixRQUFRO0FBQUEsUUFDeEIsbUJBQW1CLFdBQVc7QUFBQSxRQUM5QixhQUFhO0FBQUEsTUFDZCxHQUFHO0FBQUEsUUFDRixnQkFBZ0IsQ0FBQyxDQUFDLElBQUksQ0FBQztBQUFBLFFBQ3ZCLG1CQUFtQixDQUFDLENBQUMsSUFBSSxDQUFDO0FBQUEsUUFDMUIsYUFBYSxDQUFDLElBQUk7QUFBQSxNQUNuQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSwwQkFBMEIsTUFBTTtBQUVyQyxTQUFLLGtFQUFrRSxZQUFZO0FBQ2xGLFlBQU0sZUFBc0IsRUFBRSxHQUFHLFVBQVUsVUFBVSxJQUFJLE1BQU0sa0JBQWtCLEdBQUcsUUFBUSxnQkFBZ0IsY0FBYyxRQUFRLEVBQUU7QUFDcEksWUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLFNBQVMsWUFBWSxRQUFRLE9BQU8sZ0JBQWdCLENBQUMsWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUM5RyxVQUFJLHFCQUFxQjtBQUN6QixZQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLFFBQ3ZELGNBQWM7QUFBRSxnQkFBTSxPQUFPO0FBQUEsUUFBRztBQUFBLFFBQ2hDLE1BQWUsZ0JBQWdDO0FBQzlDO0FBQ0EsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUNBLFlBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFlBQU0sU0FBUyxNQUFNLFFBQVEsdUJBQXVCLE9BQU87QUFFM0QsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixRQUFRLFdBQVc7QUFBQSxRQUNuQjtBQUFBLE1BQ0QsR0FBRztBQUFBLFFBQ0YsUUFBUTtBQUFBLFFBQ1Isb0JBQW9CO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssNkRBQTZELFlBQVk7QUFDN0UsWUFBTSxhQUFvQixFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLGdCQUFnQixjQUFjLFVBQVUsRUFBRTtBQUNsSSxZQUFNLGNBQXFCLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGlCQUFpQixFQUFFO0FBQ2pGLFlBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxVQUFVLFlBQVksUUFBUSxPQUFPLGdCQUFnQixDQUFDLFVBQVUsQ0FBQyxFQUFFLENBQUM7QUFDN0csVUFBSSxxQkFBcUI7QUFDekIsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sT0FBTztBQUFBLFFBQUc7QUFBQSxRQUNoQyxNQUFlLGdCQUFnQztBQUM5QztBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixZQUFNLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixPQUFPO0FBRTNELGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsUUFBUSxRQUFRLFNBQVMsU0FBUztBQUFBLFFBQ2xDO0FBQUEsTUFDRCxHQUFHO0FBQUEsUUFDRixRQUFRLFlBQVksU0FBUyxTQUFTO0FBQUEsUUFDdEMsb0JBQW9CO0FBQUEsTUFDckIsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssa0VBQWtFLFlBQVk7QUFDbEYsWUFBTSxlQUFzQixFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxrQkFBa0IsR0FBRyxRQUFRLGdCQUFnQixjQUFjLFFBQVEsRUFBRTtBQUNwSSxZQUFNLGNBQXFCLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGlCQUFpQixFQUFFO0FBQ2pGLFlBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxhQUFhLFlBQVksUUFBUSxPQUFPLGdCQUFnQixDQUFDLFlBQVksQ0FBQyxFQUFFLENBQUM7QUFDbEgsVUFBSSxxQkFBcUI7QUFDekIsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sT0FBTztBQUFBLFFBQUc7QUFBQSxRQUNoQyxNQUFlLGdCQUFnQztBQUM5QztBQUNBLGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixZQUFNLFNBQVMsTUFBTSxRQUFRLHVCQUF1QixTQUFTLEVBQUUsVUFBVSxLQUFLLENBQUM7QUFFL0UsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixRQUFRLFFBQVEsU0FBUyxTQUFTO0FBQUEsUUFDbEM7QUFBQSxNQUNELEdBQUc7QUFBQSxRQUNGLFFBQVEsWUFBWSxTQUFTLFNBQVM7QUFBQSxRQUN0QyxvQkFBb0I7QUFBQSxNQUNyQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxvREFBb0QsWUFBWTtBQUNwRSxZQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsVUFBVSxZQUFZLG1CQUFtQixDQUFDO0FBQ25GLFlBQU0sV0FBVyxJQUFJLHFCQUFxQixZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDLENBQUM7QUFDakcsWUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFFbEYsWUFBTSxTQUFTLE1BQU0sUUFBUSx1QkFBdUIsT0FBTztBQUUzRCxhQUFPLFlBQVksUUFBUSxNQUFTO0FBQUEsSUFDckMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0scUJBQXFCLE1BQU07QUFFaEMsU0FBSywrRUFBK0UsWUFBWTtBQUMvRixZQUFNLGFBQWEsSUFBSSxNQUFNLGdCQUFnQjtBQUM3QyxZQUFNLGFBQW9CLEVBQUUsR0FBRyxVQUFVLFVBQVUsSUFBSSxNQUFNLGdCQUFnQixFQUFFO0FBQy9FLFlBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksUUFBUSxjQUFjLGdCQUFnQixFQUFFLHVCQUF1QixLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ3JJLFVBQUk7QUFDSixZQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLFFBQ3ZELGNBQWM7QUFBRSxnQkFBTSxPQUFPO0FBQUEsUUFBRztBQUFBLFFBQ2hDLE1BQWUsU0FBUyxXQUFtQkMsYUFBaUIsUUFBZ0M7QUFDM0YseUJBQWUsQ0FBQyxXQUFXQSxhQUFZLE1BQU07QUFDN0MsaUJBQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUNBLFlBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFlBQU0sU0FBUyxNQUFNLFFBQVEsa0JBQWtCLFNBQVMsWUFBWSxRQUFRO0FBRTVFLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsUUFBUSxPQUFPLFNBQVMsU0FBUztBQUFBLFFBQ2pDLE1BQU0sY0FBYyxJQUFJLFNBQU8sSUFBSSxNQUFNLEdBQUcsSUFBSSxJQUFJLFNBQVMsSUFBSSxHQUFHO0FBQUEsTUFDckUsR0FBRztBQUFBLFFBQ0YsUUFBUSxXQUFXLFNBQVMsU0FBUztBQUFBLFFBQ3JDLE1BQU0sQ0FBQyxRQUFRLFdBQVcsU0FBUyxHQUFHLFFBQVE7QUFBQSxNQUMvQyxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx5Q0FBeUMsWUFBWTtBQUN6RCxZQUFNLFVBQVUsWUFBWSxFQUFFLFdBQVcsVUFBVSxZQUFZLG9CQUFvQixjQUFjLGdCQUFnQixFQUFFLHVCQUF1QixLQUFLLENBQUMsRUFBRSxDQUFDO0FBQ25KLFlBQU0sV0FBVyxJQUFJLHFCQUFxQixZQUFZLEVBQUUsV0FBVyxTQUFTLFlBQVksT0FBTyxDQUFDLENBQUM7QUFDakcsWUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxhQUFhLFFBQVE7QUFFbEYsWUFBTSxPQUFPLFFBQVEsTUFBTSxRQUFRLGtCQUFrQixTQUFTLElBQUksTUFBTSxnQkFBZ0IsR0FBRyxRQUFRLEdBQUcsdUNBQXVDO0FBQUEsSUFDOUksQ0FBQztBQUVELFNBQUssMkRBQTJELFlBQVk7QUFDM0UsWUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLGVBQWUsWUFBWSxRQUFRLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDN0ksWUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxXQUFXO0FBRXhFLFlBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSxrQkFBa0IsU0FBUyxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxHQUFHLHNDQUFzQztBQUFBLElBQzdJLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDJCQUEyQixNQUFNO0FBRXRDLFNBQUssMEVBQTBFLFlBQVk7QUFDMUYsWUFBTSxhQUFhLElBQUksTUFBTSxnQkFBZ0I7QUFDN0MsWUFBTSxXQUFrQixFQUFFLEdBQUcsVUFBVSxVQUFVLElBQUksTUFBTSxjQUFjLEVBQUU7QUFDM0UsWUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLFFBQVEsWUFBWSxRQUFRLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLE1BQU0sa0JBQWtCLEtBQUssQ0FBQyxFQUFFLENBQUM7QUFDN0osWUFBTSxZQUFZLEVBQUUsTUFBTSxvQkFBb0I7QUFDOUMsVUFBSTtBQUNKLFlBQU0sV0FBVyxJQUFJLGNBQWMscUJBQXFCO0FBQUEsUUFDdkQsY0FBYztBQUFFLGdCQUFNLE9BQU87QUFBQSxRQUFHO0FBQUEsUUFDaEMsTUFBZSxlQUFlLFdBQW1CQSxhQUFpQixRQUFnQkMsWUFBZ0Q7QUFDakksK0JBQXFCLENBQUMsV0FBV0QsYUFBWSxRQUFRQyxVQUFTO0FBQzlELGlCQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFDQSxZQUFNLEVBQUUsUUFBUSxJQUFJLGdDQUFnQyxTQUFTLGFBQWEsUUFBUTtBQUVsRixZQUFNLFNBQVMsTUFBTSxRQUFRLHdCQUF3QixTQUFTLFlBQVksVUFBVSxTQUFTO0FBRTdGLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsUUFBUSxPQUFPLFNBQVMsU0FBUztBQUFBLFFBQ2pDLE1BQU0sb0JBQW9CLElBQUksU0FBTyxJQUFJLE1BQU0sR0FBRyxJQUFJLElBQUksU0FBUyxJQUFJLEdBQUc7QUFBQSxNQUMzRSxHQUFHO0FBQUEsUUFDRixRQUFRLFNBQVMsU0FBUyxTQUFTO0FBQUEsUUFDbkMsTUFBTSxDQUFDLFFBQVEsV0FBVyxTQUFTLEdBQUcsVUFBVSxTQUFTO0FBQUEsTUFDMUQsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUsseUNBQXlDLFlBQVk7QUFDekQsWUFBTSxVQUFVLFlBQVksRUFBRSxXQUFXLFVBQVUsWUFBWSxvQkFBb0IsY0FBYyxnQkFBZ0IsRUFBRSx1QkFBdUIsTUFBTSxrQkFBa0IsS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUMzSyxZQUFNLFdBQVcsSUFBSSxxQkFBcUIsWUFBWSxFQUFFLFdBQVcsU0FBUyxZQUFZLE9BQU8sQ0FBQyxDQUFDO0FBQ2pHLFlBQU0sRUFBRSxRQUFRLElBQUksZ0NBQWdDLFNBQVMsYUFBYSxRQUFRO0FBRWxGLFlBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSx3QkFBd0IsU0FBUyxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxHQUFHLHVDQUF1QztBQUFBLElBQ3BKLENBQUM7QUFFRCxTQUFLLHVEQUF1RCxZQUFZO0FBQ3ZFLFlBQU0sVUFBVSxZQUFZLEVBQUUsV0FBVyxnQkFBZ0IsWUFBWSxRQUFRLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLE1BQU0sa0JBQWtCLE1BQU0sQ0FBQyxFQUFFLENBQUM7QUFDdEssWUFBTSxFQUFFLFFBQVEsSUFBSSxnQ0FBZ0MsU0FBUyxXQUFXO0FBRXhFLFlBQU0sT0FBTyxRQUFRLE1BQU0sUUFBUSx3QkFBd0IsU0FBUyxJQUFJLE1BQU0sZ0JBQWdCLEdBQUcsUUFBUSxHQUFHLDZCQUE2QjtBQUFBLElBQzFJLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxRQUFNLDRCQUE0QixNQUFNO0FBRXZDLGFBQVMsS0FBSyxJQUFZLFNBQXdCLGNBQWMsV0FBVyxRQUFnQztBQUMxRyxhQUFPO0FBQUEsUUFDTixHQUFHO0FBQUEsUUFDSCxVQUFVLElBQUksTUFBTSxnQkFBZ0IsRUFBRSxFQUFFO0FBQUEsUUFDeEMsT0FBTyxnQkFBZ0IsRUFBRTtBQUFBLFFBQ3pCLFFBQVEsZ0JBQWdCLE1BQU07QUFBQSxRQUM5QixRQUFRLFNBQVMsRUFBRSxNQUFNLE9BQU8sSUFBSTtBQUFBLE1BQ3JDO0FBQUEsSUFDRDtBQUVBLGFBQVMsaUJBQWlCLElBQVksT0FBMEI7QUFDL0QsYUFBTyxZQUFZO0FBQUEsUUFDbEIsV0FBVztBQUFBLFFBQ1gsWUFBWTtBQUFBLFFBQ1osT0FBTyxnQkFBZ0IsS0FBSztBQUFBLFFBQzVCLFVBQVUsZ0JBQWdCLE1BQU0sQ0FBQyxDQUFDO0FBQUEsUUFDbEMsY0FBYyxnQkFBZ0IsRUFBRSx1QkFBdUIsS0FBSyxDQUFDO0FBQUEsTUFDOUQsQ0FBQztBQUFBLElBQ0Y7QUFFQSxhQUFTLE1BQU0sVUFBc0I7QUFDcEMsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDM0IsY0FBMEI7QUFBRSxpQkFBTztBQUFBLFFBQVU7QUFBQSxNQUN2RDtBQUNBLGFBQU8sZ0NBQWdDLFNBQVMsQ0FBQyxHQUFHLGFBQWEsUUFBUTtBQUFBLElBQzFFO0FBRUEsVUFBTSxlQUFlLENBQUMsVUFDcEIsS0FBSyxjQUFjLElBQUksR0FBRyxZQUFZLElBQUksS0FBSyxDQUFDLEdBQUcsSUFBSSxPQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFFM0UsU0FBSywyRUFBMkUsWUFBWTtBQUMzRixZQUFNLFdBQVcsaUJBQWlCLEtBQUssQ0FBQyxLQUFLLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQ2pFLFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxRQUFRLENBQUM7QUFFM0MsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sVUFBVSxLQUFLLGNBQWMsSUFBSTtBQUN2QyxZQUFNLFFBQVEsU0FBUyxNQUFNLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxNQUFNLElBQUksTUFBTSxHQUFHO0FBQ2xFLFlBQU0sS0FBSyxVQUFVLFNBQVMsS0FBSztBQUNuQyxhQUFPLGdCQUFnQixhQUFhLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUloRCxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFDeEMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBRXhDLGFBQU8sZ0JBQWdCLGFBQWEsSUFBSSxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDakQsQ0FBQztBQUVELFNBQUssOERBQThELFlBQVk7QUFDOUUsWUFBTSxXQUFXLGlCQUFpQixLQUFLLENBQUMsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLEdBQUcsS0FBSyxJQUFJLENBQUMsQ0FBQztBQUMzRSxZQUFNLFdBQVcsaUJBQWlCLEtBQUssQ0FBQyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQ3RELFlBQU0sRUFBRSxLQUFLLElBQUksTUFBTSxDQUFDLFVBQVUsUUFBUSxDQUFDO0FBRTNDLFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUN4QyxZQUFNLFVBQVUsS0FBSyxjQUFjLElBQUk7QUFDdkMsWUFBTSxTQUFTLFNBQVMsTUFBTSxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsTUFBTSxJQUFJLE1BQU0sSUFBSTtBQUNwRSxZQUFNLEtBQUssVUFBVSxTQUFTLE1BQU07QUFFcEMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUV4QyxZQUFNLFlBQVksS0FBSyxjQUFjLElBQUk7QUFDekMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixNQUFNLFVBQVUsVUFBVSxJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxRQUN0RCxRQUFRLFVBQVUsWUFBWSxJQUFJLEVBQUUsSUFBSSxPQUFLLEVBQUUsTUFBTSxJQUFJLENBQUM7QUFBQSxNQUMzRCxHQUFHO0FBQUEsUUFDRixNQUFNLENBQUMsTUFBTSxJQUFJO0FBQUEsUUFDakIsUUFBUSxDQUFDLElBQUk7QUFBQSxNQUNkLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLG9EQUFvRCxZQUFZO0FBQ3BFLFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDakUsWUFBTSxXQUFXLGlCQUFpQixLQUFLLENBQUMsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUN0RCxZQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQyxVQUFVLFFBQVEsQ0FBQztBQUUzQyxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFDeEMsWUFBTSxRQUFRLFNBQVMsTUFBTSxJQUFJLEVBQUUsS0FBSyxPQUFLLEVBQUUsTUFBTSxJQUFJLE1BQU0sR0FBRztBQUNsRSxZQUFNLEtBQUssU0FBUyxVQUFVLE1BQU0sUUFBUTtBQUM1QyxZQUFNLEtBQUssVUFBVSxLQUFLLGNBQWMsSUFBSSxHQUFJLEtBQUs7QUFFckQsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUV4QyxhQUFPLGdCQUFnQixhQUFhLElBQUksR0FBRyxDQUFDLEdBQUcsQ0FBQztBQUFBLElBQ2pELENBQUM7QUFFRCxTQUFLLDZEQUE2RCxZQUFZO0FBQzdFLFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDakUsWUFBTSxXQUFXLGlCQUFpQixLQUFLLENBQUMsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUN0RCxZQUFNLEVBQUUsS0FBSyxJQUFJLE1BQU0sQ0FBQyxVQUFVLFFBQVEsQ0FBQztBQUUzQyxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFDeEMsWUFBTSxVQUFVLEtBQUssY0FBYyxJQUFJO0FBQ3ZDLFlBQU0sUUFBUSxTQUFTLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDbEUsWUFBTSxLQUFLLFVBQVUsU0FBUyxLQUFLO0FBQ25DLFlBQU0sS0FBSyxTQUFTLFVBQVUsTUFBTSxRQUFRO0FBRTVDLFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUN4QyxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFFeEMsYUFBTyxnQkFBZ0IsYUFBYSxJQUFJLEdBQUcsQ0FBQyxDQUFDO0FBQUEsSUFDOUMsQ0FBQztBQUVELFNBQUssaUVBQWlFLFlBQVk7QUFDakYsWUFBTSxXQUFXLGlCQUFpQixLQUFLLENBQUMsS0FBSyxPQUFPLEdBQUcsS0FBSyxRQUFRLGNBQWMsV0FBVyxlQUFlLFFBQVEsQ0FBQyxDQUFDO0FBQ3RILFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxRQUFRLENBQUM7QUFFM0MsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sVUFBVSxLQUFLLGNBQWMsSUFBSTtBQUN2QyxZQUFNLFdBQVcsU0FBUyxNQUFNLElBQUksRUFBRSxLQUFLLE9BQUssRUFBRSxNQUFNLElBQUksTUFBTSxNQUFNO0FBQ3hFLFlBQU0sS0FBSyxVQUFVLFNBQVMsUUFBUTtBQUN0QyxhQUFPLGdCQUFnQixhQUFhLElBQUksR0FBRyxDQUFDLE1BQU0sQ0FBQztBQUVuRCxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFDeEMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBRXhDLGFBQU8sZ0JBQWdCLGFBQWEsSUFBSSxHQUFHLENBQUMsTUFBTSxDQUFDO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssK0NBQStDLFlBQVk7QUFDL0QsWUFBTSxRQUFRLEtBQUssT0FBTztBQUMxQixZQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3RCLFlBQU0sV0FBVyxZQUFZO0FBQUEsUUFDNUIsV0FBVztBQUFBLFFBQUssWUFBWTtBQUFBLFFBQzVCLFFBQVEsZ0JBQWdCLGNBQWMsU0FBUztBQUFBLFFBQy9DLE9BQU8sZ0JBQWdCLENBQUMsT0FBTyxLQUFLLENBQUM7QUFBQSxRQUNyQyxVQUFVLGdCQUFnQixLQUFLO0FBQUEsUUFDL0IsY0FBYyxnQkFBZ0IsRUFBRSx1QkFBdUIsS0FBSyxDQUFDO0FBQUEsTUFDOUQsQ0FBQztBQUNELFlBQU0sVUFBVSxZQUFZLElBQUksSUFBSSx1QkFBdUIsQ0FBQztBQUM1RCxZQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLFFBQ3ZELGNBQWM7QUFBRSxnQkFBTSxRQUFRO0FBQUEsUUFBRztBQUFBLFFBQ3hCLGNBQTBCO0FBQUUsaUJBQU8sQ0FBQyxRQUFRO0FBQUEsUUFBRztBQUFBLE1BQ3pEO0FBQ0EsWUFBTSxXQUFXLE1BQU07QUFDdEIsY0FBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsNkJBQXFCLEtBQUssaUJBQWlCLE9BQU87QUFDbEQsNkJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCw2QkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMxRiw2QkFBcUIsS0FBSywyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRyw2QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLDZCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLDZCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLDZCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxVQUFuQztBQUFBO0FBQzNDLGlCQUFrQixxQkFBcUIsTUFBTTtBQUFBO0FBQUEsUUFDOUMsR0FBQztBQUNELGNBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUseUJBQXlCLENBQUM7QUFDOUYsZUFBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFBQSxNQUM3RDtBQUdBLFlBQU0sUUFBUSxTQUFTO0FBQ3ZCLFlBQU0sTUFBTSxZQUFZLFNBQVMsUUFBUTtBQUN6QyxZQUFNLE1BQU0sVUFBVSxNQUFNLGNBQWMsSUFBSSxHQUFJLEtBQUs7QUFDdkQsWUFBTSxRQUFRLE1BQU07QUFHcEIsWUFBTSxTQUFTLFNBQVM7QUFDeEIsWUFBTSxPQUFPLHVCQUF1QjtBQUNwQyxhQUFPLGlCQUFpQixPQUFPLGNBQWMsSUFBSSxHQUFHLFlBQVksSUFBSSxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQUssRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDO0FBQUEsSUFDNUcsQ0FBQztBQUVELFNBQUssdUVBQXVFLFlBQVk7QUFDdkYsWUFBTSxRQUFRLEtBQUssT0FBTztBQUMxQixZQUFNLFNBQVMsS0FBSyxJQUFJO0FBQ3hCLFlBQU0sV0FBVyxZQUFZO0FBQUEsUUFDNUIsV0FBVztBQUFBLFFBQUssWUFBWTtBQUFBLFFBQzVCLFFBQVEsZ0JBQWdCLGNBQWMsU0FBUztBQUFBLFFBQy9DLE9BQU8sZ0JBQWdCLENBQUMsT0FBTyxNQUFNLENBQUM7QUFBQSxRQUN0QyxVQUFVLGdCQUFnQixLQUFLO0FBQUEsUUFDL0IsY0FBYyxnQkFBZ0IsRUFBRSx1QkFBdUIsS0FBSyxDQUFDO0FBQUEsTUFDOUQsQ0FBQztBQUNELFlBQU0sUUFBUSxLQUFLLE9BQU87QUFDMUIsWUFBTSxTQUFTLEtBQUssSUFBSTtBQUN4QixZQUFNLFdBQVcsWUFBWTtBQUFBLFFBQzVCLFdBQVc7QUFBQSxRQUFLLFlBQVk7QUFBQSxRQUM1QixRQUFRLGdCQUFnQixjQUFjLFNBQVM7QUFBQSxRQUMvQyxPQUFPLGdCQUFnQixDQUFDLE9BQU8sTUFBTSxDQUFDO0FBQUEsUUFDdEMsVUFBVSxnQkFBZ0IsS0FBSztBQUFBLFFBQy9CLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLEtBQUssQ0FBQztBQUFBLE1BQzlELENBQUM7QUFDRCxZQUFNLFVBQVUsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUM7QUFDNUQsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sUUFBUTtBQUFBLFFBQUc7QUFBQSxRQUN4QixjQUEwQjtBQUFFLGlCQUFPLENBQUMsVUFBVSxRQUFRO0FBQUEsUUFBRztBQUFBLE1BQ25FO0FBQ0EsWUFBTSxXQUFXLE1BQU07QUFDdEIsY0FBTSx1QkFBdUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLENBQUM7QUFDM0UsNkJBQXFCLEtBQUssaUJBQWlCLE9BQU87QUFDbEQsNkJBQXFCLEtBQUssYUFBYSxJQUFJLGVBQWUsQ0FBQztBQUMzRCw2QkFBcUIsS0FBSyxvQkFBb0IsWUFBWSxJQUFJLElBQUksc0JBQXNCLENBQUMsQ0FBQztBQUMxRiw2QkFBcUIsS0FBSywyQkFBMkIsSUFBSSw2QkFBNkIsQ0FBQyxRQUFRLENBQUMsQ0FBQztBQUNqRyw2QkFBcUIsS0FBSyxxQkFBcUIsRUFBRSxRQUFRLDJCQUEyQixDQUFDO0FBQ3JGLDZCQUFxQixLQUFLLG9CQUFvQixJQUFJLHNCQUFzQixDQUFDO0FBQ3pFLDZCQUFxQixLQUFLLGtCQUFrQixJQUFJLG9CQUFvQixDQUFDO0FBQ3JFLDZCQUFxQixLQUFLLGNBQWMsSUFBSSxjQUFjLEtBQW1CLEVBQUU7QUFBQSxVQUFuQztBQUFBO0FBQzNDLGlCQUFrQixxQkFBcUIsTUFBTTtBQUFBO0FBQUEsUUFDOUMsR0FBQztBQUNELGNBQU0sVUFBVSxZQUFZLElBQUkscUJBQXFCLGVBQWUseUJBQXlCLENBQUM7QUFDOUYsZUFBTyxXQUFXLHNCQUFzQixTQUFTLFdBQVc7QUFBQSxNQUM3RDtBQUlBLFlBQU0sUUFBUSxTQUFTO0FBQ3ZCLFlBQU0sTUFBTSxZQUFZLFNBQVMsUUFBUTtBQUN6QyxZQUFNLE1BQU0sVUFBVSxNQUFNLGNBQWMsSUFBSSxHQUFJLE1BQU07QUFDeEQsWUFBTSxNQUFNLFlBQVksU0FBUyxRQUFRO0FBQ3pDLFlBQU0sTUFBTSxVQUFVLE1BQU0sY0FBYyxJQUFJLEdBQUksTUFBTTtBQUN4RCxZQUFNLFFBQVEsTUFBTTtBQUdwQixZQUFNLFNBQVMsU0FBUztBQUN4QixZQUFNLE9BQU8sdUJBQXVCO0FBQ3BDLFlBQU0sT0FBTyxZQUFZLFNBQVMsUUFBUTtBQUMxQyxhQUFPLGlCQUFpQixPQUFPLGNBQWMsSUFBSSxHQUFHLFlBQVksSUFBSSxLQUFLLENBQUMsR0FBRyxJQUFJLE9BQUssRUFBRSxNQUFNLElBQUksQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDO0FBQUEsSUFDN0csQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sd0JBQXdCLE1BQU07QUFFbkMsYUFBUyxLQUFLLE9BQXNCO0FBQ25DLGFBQU87QUFBQSxRQUNOLEdBQUc7QUFBQSxRQUNILFVBQVUsSUFBSSxNQUFNLGdCQUFnQixLQUFLLEVBQUU7QUFBQSxRQUMzQyxPQUFPLGdCQUFnQixLQUFLO0FBQUEsUUFDNUIsUUFBUSxnQkFBZ0IsY0FBYyxTQUFTO0FBQUEsTUFDaEQ7QUFBQSxJQUNEO0FBRUEsYUFBUyxpQkFBaUIsSUFBWSxPQUEwQjtBQUMvRCxhQUFPLFlBQVk7QUFBQSxRQUNsQixXQUFXO0FBQUEsUUFDWCxZQUFZO0FBQUEsUUFDWixRQUFRLGdCQUFnQixjQUFjLFNBQVM7QUFBQSxRQUMvQyxPQUFPLGdCQUFnQixLQUFLO0FBQUEsUUFDNUIsVUFBVSxnQkFBZ0IsTUFBTSxDQUFDLENBQUM7QUFBQSxRQUNsQyxjQUFjLGdCQUFnQixFQUFFLHVCQUF1QixLQUFLLENBQUM7QUFBQSxNQUM5RCxDQUFDO0FBQUEsSUFDRjtBQUVBLGFBQVMsTUFBTSxVQUFzQjtBQUNwQyxZQUFNLFdBQVcsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLFFBQ3ZELGNBQWM7QUFBRSxnQkFBTSxTQUFTLENBQUMsQ0FBQztBQUFBLFFBQUc7QUFBQSxRQUMzQixjQUEwQjtBQUFFLGlCQUFPO0FBQUEsUUFBVTtBQUFBLE1BQ3ZEO0FBQ0EsWUFBTSxFQUFFLE1BQU0sa0JBQWtCLElBQUksZ0NBQWdDLFNBQVMsQ0FBQyxHQUFHLGFBQWEsUUFBUTtBQUd0RyxhQUFPLEVBQUUsTUFBTSxXQUFXLE1BQU0sa0JBQWtCLG1CQUFtQiw2QkFBNkIsR0FBRyxNQUFNLEtBQUs7QUFBQSxJQUNqSDtBQUVBLFVBQU0sT0FBTyxDQUFDLFVBQTJCO0FBQUEsTUFDeEMsU0FBUyxLQUFLLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEdBQUcsYUFBYSxJQUFJO0FBQUEsTUFDakUsUUFBUSxLQUFLLGdCQUFnQixJQUFJLEVBQUUsSUFBSSxPQUFLLEdBQUcsT0FBTyxJQUFJLEtBQUssS0FBSztBQUFBLE1BQ3BFLFFBQVEsS0FBSyxjQUFjLElBQUksR0FBRyxhQUFhO0FBQUEsSUFDaEQ7QUFFQSxTQUFLLDhDQUE4QyxZQUFZO0FBQzlELFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDakUsWUFBTSxFQUFFLE1BQU0sVUFBVSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFFNUMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sUUFBUSxTQUFTLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDbEUsWUFBTSxLQUFLLFVBQVUsS0FBSyxjQUFjLElBQUksR0FBSSxLQUFLO0FBQ3JELFlBQU0sYUFBYSxVQUFVO0FBRTdCLFlBQU0sS0FBSyxxQkFBcUI7QUFFaEMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QjtBQUFBLFFBQ0EsUUFBUSxLQUFLLGNBQWMsSUFBSSxFQUFHLFlBQVksSUFBSSxFQUFFLElBQUksT0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDMUUsTUFBTSxLQUFLLGNBQWMsSUFBSSxFQUFHLFVBQVUsSUFBSSxFQUFFLElBQUksT0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsUUFDdEUsZ0JBQWdCLFVBQVU7QUFBQSxNQUMzQixHQUFHO0FBQUEsUUFDRixZQUFZO0FBQUEsUUFDWixRQUFRLENBQUM7QUFBQSxRQUNULE1BQU0sQ0FBQyxTQUFTLEdBQUc7QUFBQSxRQUNuQixnQkFBZ0I7QUFBQSxNQUNqQixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSywwREFBMEQsWUFBWTtBQUMxRSxZQUFNLFdBQVcsaUJBQWlCLEtBQUssQ0FBQyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQ3RELFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxRQUFRLENBQUM7QUFHM0MsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFdBQUssd0JBQXdCLFFBQVE7QUFDckMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBRXhDLFdBQUssYUFBYSxRQUFRO0FBQzFCLFlBQU0sYUFBYSxLQUFLLElBQUk7QUFFNUIsWUFBTSxLQUFLLHFCQUFxQjtBQUVoQyxhQUFPLGdCQUFnQixFQUFFLFlBQVksYUFBYSxLQUFLLElBQUksRUFBRSxHQUFHO0FBQUEsUUFDL0QsWUFBWSxFQUFFLFNBQVMsQ0FBQyxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLElBQUk7QUFBQSxRQUMzRCxhQUFhLEVBQUUsU0FBUyxDQUFDLEtBQUssR0FBRyxHQUFHLFFBQVEsQ0FBQyxNQUFNLEtBQUssR0FBRyxRQUFRLElBQUk7QUFBQSxNQUN4RSxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyx3REFBd0QsWUFBWTtBQUN4RSxZQUFNLFdBQVcsaUJBQWlCLEtBQUssQ0FBQyxLQUFLLE9BQU8sQ0FBQyxDQUFDO0FBQ3RELFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxRQUFRLENBQUM7QUFFM0MsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUN4QyxZQUFNLGVBQWUsS0FBSyxJQUFJO0FBRTlCLFlBQU0sS0FBSyxxQkFBcUI7QUFFaEMsYUFBTyxnQkFBZ0IsRUFBRSxjQUFjLGFBQWEsS0FBSyxJQUFJLEVBQUUsR0FBRztBQUFBLFFBQ2pFLGNBQWMsRUFBRSxTQUFTLENBQUMsR0FBRyxHQUFHLFFBQVEsQ0FBQyxLQUFLLEdBQUcsUUFBUSxJQUFJO0FBQUEsUUFDN0QsYUFBYSxFQUFFLFNBQVMsQ0FBQyxHQUFHLEdBQUcsUUFBUSxDQUFDLEtBQUssR0FBRyxRQUFRLElBQUk7QUFBQSxNQUM3RCxDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnREFBZ0QsWUFBWTtBQUNoRSxZQUFNLFdBQVcsaUJBQWlCLEtBQUssQ0FBQyxLQUFLLE9BQU8sR0FBRyxLQUFLLEdBQUcsQ0FBQyxDQUFDO0FBQ2pFLFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxDQUFDLENBQUM7QUFDdEQsWUFBTSxFQUFFLEtBQUssSUFBSSxNQUFNLENBQUMsVUFBVSxRQUFRLENBQUM7QUFFM0MsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sUUFBUSxTQUFTLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUc7QUFDbEUsWUFBTSxLQUFLLFVBQVUsS0FBSyxjQUFjLElBQUksR0FBSSxLQUFLO0FBRXJELFlBQU0sS0FBSyxZQUFZLFNBQVMsUUFBUTtBQUV4QyxZQUFNLEtBQUsscUJBQXFCO0FBR2hDLFlBQU0sS0FBSyxxQkFBcUI7QUFFaEMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixHQUFHLEtBQUssSUFBSTtBQUFBLFFBQ1osYUFBYSxLQUFLLGNBQWMsSUFBSSxFQUFHLFlBQVksSUFBSSxFQUFFLElBQUksT0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDaEYsR0FBRztBQUFBLFFBQ0YsU0FBUyxDQUFDLEdBQUc7QUFBQSxRQUNiLFFBQVEsQ0FBQyxLQUFLO0FBQUEsUUFDZCxRQUFRO0FBQUEsUUFDUixhQUFhLENBQUMsR0FBRztBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDhDQUE4QyxZQUFZO0FBQzlELFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxHQUFHLEtBQUssR0FBRyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDNUUsWUFBTSxFQUFFLE1BQU0sVUFBVSxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUM7QUFFNUMsWUFBTSxLQUFLLFlBQVksU0FBUyxRQUFRO0FBQ3hDLFlBQU0sU0FBUyxLQUFLLGNBQWMsSUFBSTtBQUV0QyxpQkFBVyxVQUFVLENBQUMsS0FBSyxHQUFHLEdBQUc7QUFDaEMsY0FBTSxLQUFLLFVBQVUsUUFBUSxTQUFTLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLE1BQU0sR0FBSSxFQUFFLGFBQWEsS0FBSyxDQUFDO0FBQUEsTUFDOUc7QUFFQSxZQUFNLEtBQUsscUJBQXFCO0FBRWhDLGFBQU8sZ0JBQWdCO0FBQUEsUUFDdEIsV0FBVyxVQUFVO0FBQUEsUUFDckIsUUFBUSxLQUFLLGNBQWMsSUFBSSxFQUFHLFlBQVksSUFBSSxFQUFFLElBQUksT0FBSyxFQUFFLE1BQU0sSUFBSSxDQUFDO0FBQUEsTUFDM0UsR0FBRztBQUFBLFFBQ0YsV0FBVztBQUFBLFFBQ1gsUUFBUSxDQUFDLEtBQUssR0FBRztBQUFBLE1BQ2xCLENBQUM7QUFBQSxJQUNGLENBQUM7QUFFRCxTQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFlBQU0sV0FBVyxpQkFBaUIsS0FBSyxDQUFDLEtBQUssT0FBTyxHQUFHLEtBQUssR0FBRyxDQUFDLENBQUM7QUFDakUsWUFBTSxXQUFXLGlCQUFpQixLQUFLLENBQUMsS0FBSyxPQUFPLENBQUMsQ0FBQztBQUN0RCxZQUFNLFdBQVcsQ0FBQyxVQUFVLFFBQVE7QUFDcEMsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sUUFBUTtBQUFBLFFBQUc7QUFBQSxRQUN4QixjQUEwQjtBQUFFLGlCQUFPO0FBQUEsUUFBVTtBQUFBLE1BQ3ZEO0FBQ0EsWUFBTSxFQUFFLE1BQU0sa0JBQWtCLElBQUksZ0NBQWdDLFVBQVUsYUFBYSxRQUFRO0FBQ25HLFlBQU0sWUFBWSxNQUFNLGtCQUFrQixtQkFBbUIsNkJBQTZCLEdBQUcsTUFBTTtBQUVuRyxZQUFNLEtBQUssWUFBWSxTQUFTLFFBQVE7QUFDeEMsWUFBTSxLQUFLLFVBQVUsS0FBSyxjQUFjLElBQUksR0FBSSxTQUFTLE1BQU0sSUFBSSxFQUFFLEtBQUssT0FBSyxFQUFFLE1BQU0sSUFBSSxNQUFNLEdBQUcsQ0FBRTtBQUl0RyxlQUFTLE9BQU8sR0FBRyxDQUFDO0FBQ3BCLFlBQU0sS0FBSyxxQkFBcUI7QUFFaEMsYUFBTyxnQkFBZ0IsRUFBRSxXQUFXLFVBQVUsRUFBRSxHQUFHLEVBQUUsV0FBVyxNQUFNLENBQUM7QUFBQSxJQUN4RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsUUFBTSxtQkFBbUIsTUFBTTtBQUFBLElBTTlCLE1BQU0sMEJBQTBCLHFCQUFxQjtBQUFBLE1BS3BELFlBQ0MsTUFDa0IsS0FBYSxrQkFDYixRQUFnQixHQUNoQixlQUF3QyxDQUFDLEVBQUUsaUJBQWlCLDJCQUEyQixRQUFRLElBQUksU0FBUyxPQUFPLFNBQVMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxHQUMvSjtBQUNELGNBQU0sSUFBSTtBQUpRO0FBQ0E7QUFDQTtBQVBuQixvQ0FBdUI7QUFDdkIsYUFBa0IscUJBQXFCO0FBQUEsTUFTdkM7QUFBQSxNQUVTLGdCQUFnQixlQUFpQztBQUN6RCxhQUFLO0FBQ0wsYUFBSyxvQkFBb0I7QUFDekIsZUFBTyxZQUFZLEVBQUUsV0FBVyxJQUFJLEtBQUssb0JBQW9CLElBQUksWUFBWSxLQUFLLEdBQUcsQ0FBQztBQUFBLE1BQ3ZGO0FBQUEsSUFDRDtBQUVBLGFBQVMsZUFBZSxXQUFxRTtBQUM1RixZQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSwyQkFBcUIsS0FBSyxpQkFBaUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUN4RiwyQkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELDJCQUFxQixLQUFLLG9CQUFvQixZQUFZLElBQUksSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQzFGLDJCQUFxQixLQUFLLDJCQUEyQixJQUFJLDZCQUE2QixTQUFTLENBQUM7QUFDaEcsMkJBQXFCLEtBQUsscUJBQXFCLEVBQUUsUUFBUSwyQkFBMkIsQ0FBQztBQUNyRiwyQkFBcUIsS0FBSyxvQkFBb0IsSUFBSSxzQkFBc0IsQ0FBQztBQUN6RSwyQkFBcUIsS0FBSyxrQkFBa0IsSUFBSSxvQkFBb0IsQ0FBQztBQUNyRSwyQkFBcUIsS0FBSyxjQUFjLElBQUksY0FBYyxLQUFtQixFQUFFO0FBQUEsUUFBbkM7QUFBQTtBQUMzQyxlQUFrQixxQkFBcUIsTUFBTTtBQUFBO0FBQUEsTUFDOUMsR0FBQztBQUNELGFBQU8sWUFBWSxJQUFJLHFCQUFxQixlQUFlLHlCQUF5QixDQUFDO0FBQUEsSUFDdEY7QUFFQSxTQUFLLHFGQUFxRixNQUFNO0FBQy9GLFlBQU0sUUFBUSxJQUFJLGNBQWMscUJBQXFCO0FBQUEsUUFBbkM7QUFBQTtBQUNqQixlQUFrQixLQUFLO0FBQ3ZCLGVBQWtCLFFBQVE7QUFBQTtBQUFBLE1BQzNCLEVBQUUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZELFlBQU0sUUFBUSxJQUFJLGtCQUFrQixZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksaUJBQWlCLENBQUMsR0FBRyxrQkFBa0IsQ0FBQztBQUV6SCxZQUFNLFVBQVUsZUFBZSxDQUFDLE9BQU8sS0FBSyxDQUFDO0FBQzdDLFlBQU0sVUFBVSxRQUFRLGdCQUFnQjtBQUV4QyxhQUFPLGdCQUFnQjtBQUFBLFFBQ3RCLGtCQUFrQixRQUFRO0FBQUEsUUFDMUIsZUFBZSxNQUFNO0FBQUEsUUFDckIsT0FBTyxRQUFRLFdBQVcsSUFBSSxHQUFHO0FBQUEsTUFDbEMsR0FBRztBQUFBLFFBQ0Ysa0JBQWtCO0FBQUEsUUFDbEIsZUFBZTtBQUFBLFFBQ2YsT0FBTztBQUFBLE1BQ1IsQ0FBQztBQUFBLElBQ0YsQ0FBQztBQUVELFNBQUssK0NBQStDLE1BQU07QUFDekQsWUFBTSxRQUFRLElBQUksa0JBQWtCLFlBQVksRUFBRSxXQUFXLFFBQVEsWUFBWSxpQkFBaUIsQ0FBQyxDQUFDO0FBRXBHLFlBQU0sVUFBVSxlQUFlLENBQUMsS0FBSyxDQUFDO0FBQ3RDLFlBQU0sUUFBUSxRQUFRLGdCQUFnQjtBQUN0QyxZQUFNLFNBQVMsUUFBUSxnQkFBZ0I7QUFFdkMsYUFBTyxnQkFBZ0I7QUFBQSxRQUN0QixPQUFPLE1BQU07QUFBQSxRQUNiLFFBQVEsT0FBTztBQUFBLFFBQ2Ysc0JBQXNCLE1BQU07QUFBQSxRQUM1QixPQUFPLFFBQVEsV0FBVyxJQUFJLEdBQUc7QUFBQSxNQUNsQyxHQUFHO0FBQUEsUUFDRixPQUFPO0FBQUEsUUFDUCxRQUFRO0FBQUEsUUFDUixzQkFBc0I7QUFBQSxRQUN0QixPQUFPO0FBQUEsTUFDUixDQUFDO0FBQUEsSUFDRixDQUFDO0FBRUQsU0FBSyxnREFBZ0QsTUFBTTtBQUMxRCxZQUFNLFFBQVEsSUFBSSxxQkFBcUIsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLE9BQU8sQ0FBQyxDQUFDO0FBQzNGLFlBQU0sVUFBVSxlQUFlLENBQUMsS0FBSyxDQUFDO0FBQ3RDLGFBQU8sT0FBTyxNQUFNLFFBQVEsZ0JBQWdCLEdBQUcsMkNBQTJDO0FBQUEsSUFDM0YsQ0FBQztBQUVELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxRQUFRLElBQUksa0JBQWtCLFlBQVksRUFBRSxXQUFXLFFBQVEsWUFBWSxpQkFBaUIsQ0FBQyxHQUFHLGtCQUFrQixHQUFHO0FBQUEsUUFDMUgsRUFBRSxpQkFBaUIsMkJBQTJCLFFBQVEsSUFBSSxTQUFTLE9BQU8sU0FBUyxNQUFNLFFBQVEsR0FBRztBQUFBLFFBQ3BHLEVBQUUsaUJBQWlCLDJCQUEyQixRQUFRLElBQUksU0FBUyxPQUFPLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFBQSxNQUNyRyxDQUFDO0FBRUQsWUFBTSxVQUFVLGVBQWUsQ0FBQyxLQUFLLENBQUM7QUFDdEMsY0FBUSxnQkFBZ0IsRUFBRSxZQUFZLGtCQUFrQixlQUFlLFFBQVEsQ0FBQztBQUVoRixhQUFPLFlBQVksTUFBTSxtQkFBbUIsT0FBTztBQUFBLElBQ3BELENBQUM7QUFFRCxTQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFlBQU0sUUFBUSxJQUFJLGtCQUFrQixZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksaUJBQWlCLENBQUMsR0FBRyxrQkFBa0IsR0FBRztBQUFBLFFBQzFILEVBQUUsaUJBQWlCLDJCQUEyQixRQUFRLElBQUksU0FBUyxPQUFPLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFBQSxRQUNwRyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFNBQVMsT0FBTyxTQUFTLE1BQU0sUUFBUSxHQUFHO0FBQUEsTUFDckcsQ0FBQztBQUVELFlBQU0sVUFBVSxlQUFlLENBQUMsS0FBSyxDQUFDO0FBQ3RDLGNBQVEsZ0JBQWdCLEVBQUUsZUFBZSxRQUFRLENBQUM7QUFFbEQsYUFBTyxZQUFZLE1BQU0sbUJBQW1CLE9BQU87QUFBQSxJQUNwRCxDQUFDO0FBRUQsU0FBSywyREFBMkQsTUFBTTtBQUNyRSxZQUFNLFFBQVEsSUFBSSxrQkFBa0IsWUFBWSxFQUFFLFdBQVcsUUFBUSxZQUFZLGlCQUFpQixDQUFDLEdBQUcsa0JBQWtCLEdBQUc7QUFBQSxRQUMxSCxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFNBQVMsT0FBTyxTQUFTLE1BQU0sUUFBUSxHQUFHO0FBQUEsUUFDcEcsRUFBRSxpQkFBaUIsMkJBQTJCLFFBQVEsSUFBSSxTQUFTLE9BQU8sU0FBUyxNQUFNLFFBQVEsR0FBRztBQUFBLE1BQ3JHLENBQUM7QUFFRCxZQUFNLFVBQVUsZUFBZSxDQUFDLEtBQUssQ0FBQztBQUN0QyxjQUFRLGdCQUFnQixFQUFFLGVBQWUsUUFBUSxDQUFDO0FBQ2xELGNBQVEsZ0JBQWdCO0FBRXhCLGFBQU8sWUFBWSxNQUFNLG1CQUFtQixPQUFPO0FBQUEsSUFDcEQsQ0FBQztBQUVELFNBQUssMEVBQTBFLE1BQU07QUFDcEYsWUFBTSxRQUFRLElBQUksa0JBQWtCLFlBQVksRUFBRSxXQUFXLFFBQVEsWUFBWSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ3BHLFlBQU0sVUFBVSxlQUFlLENBQUMsS0FBSyxDQUFDO0FBQ3RDLGFBQU8sT0FBTyxNQUFNLFFBQVEsZ0JBQWdCLEVBQUUsWUFBWSxrQkFBa0IsZUFBZSxVQUFVLENBQUMsR0FBRyxpQ0FBaUM7QUFBQSxJQUMzSSxDQUFDO0FBRUQsU0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxZQUFNLFFBQVEsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLFFBQW5DO0FBQUE7QUFDakIsZUFBa0IsS0FBSztBQUFBO0FBQUEsTUFDeEIsRUFBRSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksUUFBUSxDQUFDLENBQUM7QUFDdkQsWUFBTSxVQUFVLGVBQWUsQ0FBQyxLQUFLLENBQUM7QUFDdEMsYUFBTyxPQUFPLE1BQU0sUUFBUSxnQkFBZ0IsRUFBRSxZQUFZLFFBQVEsQ0FBQyxHQUFHLDhCQUE4QjtBQUFBLElBQ3JHLENBQUM7QUFFRCxTQUFLLGlHQUFpRyxNQUFNO0FBQzNHLFlBQU0sUUFBUSxJQUFJLGNBQWMscUJBQXFCO0FBQUEsUUFBbkM7QUFBQTtBQUNqQixlQUFrQixLQUFLO0FBQ3ZCLGVBQWtCLFFBQVE7QUFBQTtBQUFBLE1BQzNCLEVBQUUsWUFBWSxFQUFFLFdBQVcsTUFBTSxZQUFZLFFBQVEsQ0FBQyxDQUFDO0FBQ3ZELFlBQU0sUUFBUSxJQUFJLGtCQUFrQixZQUFZLEVBQUUsV0FBVyxRQUFRLFlBQVksaUJBQWlCLENBQUMsR0FBRyxrQkFBa0IsR0FBRztBQUFBLFFBQzFILEVBQUUsaUJBQWlCLDJCQUEyQixRQUFRLElBQUksU0FBUyxPQUFPLFNBQVMsTUFBTSxRQUFRLEdBQUc7QUFBQSxRQUNwRyxFQUFFLGlCQUFpQiwyQkFBMkIsUUFBUSxJQUFJLFNBQVMsT0FBTyxTQUFTLE1BQU0sUUFBUSxHQUFHO0FBQUEsTUFDckcsQ0FBQztBQUVELFlBQU0sVUFBVSxlQUFlLENBQUMsT0FBTyxLQUFLLENBQUM7QUFFN0MsYUFBTztBQUFBLFFBQ04sUUFBUSx5QkFBeUIsRUFBRSxJQUFJLFFBQU0sRUFBRSxZQUFZLEVBQUUsWUFBWSxlQUFlLEVBQUUsWUFBWSxHQUFHLEVBQUU7QUFBQSxRQUMzRztBQUFBLFVBQ0MsRUFBRSxZQUFZLGtCQUFrQixlQUFlLFFBQVE7QUFBQSxVQUN2RCxFQUFFLFlBQVksa0JBQWtCLGVBQWUsUUFBUTtBQUFBLFFBQ3hEO0FBQUEsTUFDRDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELFFBQU0sZ0NBQWdDLE1BQU07QUFFM0MsVUFBTSxTQUFTO0FBRWYsYUFBUyxtQkFBNkI7QUFDckMsYUFBTyxZQUFZO0FBQUEsUUFDbEIsV0FBVyxVQUFVLE1BQU07QUFBQSxRQUMzQixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsdUJBQXVCLE1BQU0sSUFBSSxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQ3pFLENBQUM7QUFBQSxJQUNGO0FBRUEsYUFBUyxxQkFBK0I7QUFDdkMsYUFBTyxZQUFZO0FBQUEsUUFDbEIsV0FBVyxZQUFZLE1BQU07QUFBQSxRQUM3QixZQUFZO0FBQUEsUUFDWixhQUFhO0FBQUEsUUFDYixVQUFVLElBQUksS0FBSyxFQUFFLFFBQVEsNkJBQTZCLE1BQU0sSUFBSSxNQUFNLEdBQUcsQ0FBQztBQUFBLE1BQy9FLENBQUM7QUFBQSxJQUNGO0FBRUEsYUFBUyxvQkFBb0IsVUFBMkQ7QUFDdkYsWUFBTSxXQUFXLElBQUksY0FBYyxxQkFBcUI7QUFBQSxRQUN2RCxjQUFjO0FBQUUsZ0JBQU0sU0FBUyxDQUFDLENBQUM7QUFBQSxRQUFHO0FBQUEsUUFDM0IsY0FBMEI7QUFBRSxpQkFBTyxDQUFDLEdBQUcsUUFBUTtBQUFBLFFBQUc7QUFBQSxNQUM1RDtBQUNBLGFBQU8sZ0NBQWdDLFNBQVMsQ0FBQyxHQUFHLGFBQWEsUUFBUSxFQUFFO0FBQUEsSUFDNUU7QUFFQSxTQUFLLGdGQUFnRixNQUFNO0FBQzFGLFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxXQUFXLG1CQUFtQjtBQUNwQyxZQUFNLFVBQVUsb0JBQW9CLENBQUMsUUFBUSxRQUFRLENBQUM7QUFFdEQsYUFBTztBQUFBLFFBQ04sUUFBUSxZQUFZLEVBQUUsSUFBSSxPQUFLLEVBQUUsU0FBUztBQUFBLFFBQzFDLENBQUMsU0FBUyxTQUFTO0FBQUEsTUFDcEI7QUFBQSxJQUNELENBQUM7QUFFRCxTQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFlBQU0sU0FBUyxpQkFBaUI7QUFDaEMsWUFBTSxVQUFVLG9CQUFvQixDQUFDLE1BQU0sQ0FBQztBQUU1QyxhQUFPO0FBQUEsUUFDTixRQUFRLFlBQVksRUFBRSxJQUFJLE9BQUssRUFBRSxTQUFTO0FBQUEsUUFDMUMsQ0FBQyxPQUFPLFNBQVM7QUFBQSxNQUNsQjtBQUFBLElBQ0QsQ0FBQztBQUVELFNBQUssbUZBQW1GLE1BQU07QUFDN0YsWUFBTSxTQUFTLGlCQUFpQjtBQUNoQyxZQUFNLFdBQVcsbUJBQW1CO0FBQ3BDLFlBQU0sVUFBVSxvQkFBb0IsQ0FBQyxRQUFRLFFBQVEsQ0FBQztBQUl0RCxhQUFPO0FBQUEsUUFDTjtBQUFBLFVBQ0MsUUFBUSxRQUFRLFlBQVksRUFBRSxLQUFLLE9BQUssRUFBRSxjQUFjLE9BQU8sU0FBUztBQUFBLFVBQ3hFLFVBQVUsUUFBUSxXQUFXLE9BQU8sUUFBUSxHQUFHLGFBQWE7QUFBQSxRQUM3RDtBQUFBLFFBQ0EsRUFBRSxRQUFRLE9BQU8sVUFBVSxPQUFPLFVBQVU7QUFBQSxNQUM3QztBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFRRCxTQUFTLDBCQUEwQixhQUF5RSxjQUFzQixnQkFBb0Q7QUFDckwsUUFBTSxrQkFBa0IsSUFBSSxjQUFjLHFCQUFxQjtBQUFBLElBQW5DO0FBQUE7QUFDM0IsV0FBa0IsS0FBSztBQUN2QixXQUFrQixRQUFRO0FBQzFCLFdBQWtCLGVBQXdDLENBQUMsRUFBRSxpQkFBaUIsMkJBQTJCLFFBQVEsSUFBSSxXQUFXLE9BQU8sV0FBVyxNQUFNLFFBQVEsR0FBRyxDQUFDO0FBQUE7QUFBQSxFQUNySyxFQUFFLFlBQVksRUFBRSxXQUFXLE1BQU0sWUFBWSxrQkFBa0IsQ0FBQyxDQUFDO0FBQ2pFLFFBQU0sb0JBQW9CLElBQUksY0FBYyxxQkFBcUI7QUFBQSxJQUFuQztBQUFBO0FBQzdCLFdBQWtCLEtBQUs7QUFDdkIsV0FBa0IsUUFBUTtBQUMxQixXQUFrQixlQUF3QyxDQUFDLEVBQUUsaUJBQWlCLDJCQUEyQixRQUFRLElBQUksY0FBYyxPQUFPLGNBQWMsTUFBTSxRQUFRLEdBQUcsQ0FBQztBQUFBO0FBQUEsRUFDM0ssRUFBRSxZQUFZLEVBQUUsV0FBVyxNQUFNLFlBQVksNkJBQTZCLENBQUMsQ0FBQztBQUU1RSxRQUFNLHVCQUF1QixZQUFZLElBQUksSUFBSSx5QkFBeUIsQ0FBQztBQUMzRSx1QkFBcUIsS0FBSyxpQkFBaUIsWUFBWSxJQUFJLElBQUksdUJBQXVCLENBQUMsQ0FBQztBQUN4Rix1QkFBcUIsS0FBSyxhQUFhLElBQUksZUFBZSxDQUFDO0FBQzNELHVCQUFxQixLQUFLLG9CQUFvQixZQUFZLElBQUksSUFBSSxzQkFBc0IsQ0FBQyxDQUFDO0FBQzFGLHVCQUFxQixLQUFLLDJCQUEyQixJQUFJLDZCQUE2QixDQUFDLGlCQUFpQixpQkFBaUIsQ0FBQyxDQUFDO0FBQzNILHVCQUFxQixLQUFLLHFCQUFxQixFQUFFLFFBQVEsMkJBQTJCLENBQUM7QUFDckYsdUJBQXFCLEtBQUssb0JBQW9CLElBQUksc0JBQXNCLENBQUM7QUFDekUsdUJBQXFCLEtBQUssa0JBQWtCLElBQUksb0JBQW9CLENBQUM7QUFDckUsdUJBQXFCLEtBQUssY0FBYyxJQUFJLGNBQWMsS0FBbUIsRUFBRTtBQUFBLElBQW5DO0FBQUE7QUFDM0MsV0FBa0IscUJBQXFCLE1BQU07QUFBQTtBQUFBLEVBQzlDLEdBQUM7QUFFRCxTQUFPLFlBQVksSUFBSSxxQkFBcUIsZUFBZSx5QkFBeUIsQ0FBQztBQUN0RjsiLAogICJuYW1lcyI6IFsiZm9sZGVyVXJpIiwgInNvdXJjZUNoYXQiLCAic2VsZWN0aW9uIl0KfQo=
