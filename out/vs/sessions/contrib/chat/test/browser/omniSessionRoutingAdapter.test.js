import assert from "assert";
import { CancellationToken, CancellationTokenSource } from "../../../../../base/common/cancellation.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { UriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentityService.js";
import { ChatModeKind, ChatPermissionLevel } from "../../../../../workbench/contrib/chat/common/constants.js";
import { TestFileService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { SessionStatus, ChatInteractivity, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { OmniSessionRoutingAdapter } from "../../browser/omniSessionRoutingAdapter.contribution.js";
suite("OmniSessionRoutingAdapter", () => {
  const store = new DisposableStore();
  let managementService;
  let providersService;
  let recentWorkspacesService;
  let opened;
  let adapter;
  let selectedLocalFolder;
  let history;
  setup(() => {
    managementService = store.add(new TestSessionsManagementService());
    providersService = store.add(new TestSessionsProvidersService());
    recentWorkspacesService = store.add(new TestRecentWorkspacesService());
    providersService.setProviders([createProvider("provider", { supportsLocalWorkspaces: true })]);
    opened = [];
    selectedLocalFolder = void 0;
    history = [];
    const fileService = store.add(new TestFileService());
    adapter = store.add(new OmniSessionRoutingAdapter(
      managementService,
      upcastPartial({
        openSession: async (resource) => {
          opened.push(resource);
        }
      }),
      upcastPartial({
        getChatSessionHistory: async () => history
      }),
      providersService,
      recentWorkspacesService,
      new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }),
      upcastPartial({
        showOpenDialog: async () => selectedLocalFolder
      }),
      fileService,
      store.add(new UriIdentityService(fileService)),
      upcastPartial({
        error: () => {
        }
      }),
      upcastPartial({
        error: () => void 0
      })
    ));
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("aggregates provider-neutral sessions and filters drafts, archived, and non-routable chats", () => {
    managementService.sessions = [
      createSession("provider-a:one", { providerId: "provider-a", title: "One", description: "First session", repository: "vscode", status: SessionStatus.InProgress }),
      createSession("provider-b:two", { providerId: "provider-b", title: "Two", status: SessionStatus.Completed }),
      createSession("provider-a:draft", { status: SessionStatus.Untitled }),
      createSession("provider-a:archived", { archived: true }),
      createSession("provider-a:readonly", { interactivity: ChatInteractivity.ReadOnly })
    ];
    assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None), [
      {
        sessionId: "provider-a:one",
        resource: URI.from({ scheme: "session", path: "/provider-a:one" }),
        label: "One",
        repo: "microsoft/vscode",
        cwd: "/work/vscode",
        status: "working",
        lastActivity: Date.parse("2026-08-13T12:00:00Z"),
        description: "First session"
      },
      {
        sessionId: "provider-b:two",
        resource: URI.from({ scheme: "session", path: "/provider-b:two" }),
        label: "Two",
        repo: "microsoft/repo",
        cwd: "/work/repo",
        status: "idle",
        lastActivity: Date.parse("2026-08-13T12:00:00Z"),
        description: void 0
      }
    ]);
  });
  test("refreshes on lifecycle changes and rejects a removed provider session", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    managementService.fireSessionsChanged({ added: [session], removed: [], changed: [] });
    assert.deepStrictEqual(adapter.getCandidateSessions(CancellationToken.None).map((candidate) => ({
      sessionId: candidate.sessionId,
      resource: candidate.resource?.toString()
    })), [{
      sessionId: "provider:session",
      resource: session.resource.toString()
    }]);
    assert.strictEqual(adapter.resolveSessionResource(session.sessionId)?.toString(), session.mainChat.get().resource.toString());
    managementService.sessions = [];
    managementService.fireSessionsChanged({ added: [], removed: [session], changed: [] });
    assert.deepStrictEqual({
      candidates: adapter.getCandidateSessions(CancellationToken.None),
      dispatch: await adapter.dispatchToSession(session.sessionId, "Continue", {}, CancellationToken.None)
    }, {
      candidates: [],
      dispatch: {
        status: "rejected",
        reasonCode: "providerRemoved",
        reason: "The selected session is no longer available."
      }
    });
  });
  test("publishes live title, status, and response snapshots", async () => {
    const title = observableValue("title", "New session");
    const status = observableValue("status", SessionStatus.InProgress);
    const original = {
      ...createSession("provider:session", { title: "New session", status: SessionStatus.InProgress }),
      title,
      status
    };
    managementService.sessions = [original];
    history = [{
      type: "response",
      parts: [
        { kind: "markdownContent", content: { value: "Renaming this session to match your request, then I will make the change." } },
        { kind: "markdownContent", content: { value: "Implemented the requested change." } }
      ],
      participant: "assistant"
    }];
    let changeCount = 0;
    store.add(adapter.onDidChangeSessions(() => changeCount++));
    let watchedCount = 0;
    store.add(adapter.watchSession(original.resource, () => watchedCount++));
    title.set("Update routing badge", void 0);
    status.set(SessionStatus.Completed, void 0);
    const snapshot = await adapter.getSessionSnapshot(original.resource, CancellationToken.None);
    assert.deepStrictEqual({ changeCount, watchedCount, snapshot }, {
      changeCount: 0,
      watchedCount: 3,
      snapshot: {
        sessionId: "provider:session",
        resource: original.resource,
        label: "Update routing badge",
        repo: "microsoft/repo",
        cwd: "/work/repo",
        status: "idle",
        lastActivity: Date.parse("2026-08-13T12:00:00Z"),
        description: void 0,
        lastResponse: "Implemented the requested change."
      }
    });
  });
  test("follows a new session from its provisional resource to the committed session", async () => {
    const provisional = createSession("provider:provisional", { title: "New session", status: SessionStatus.InProgress });
    const committed = createSession("provider:committed", { title: "Adding repository README", status: SessionStatus.Completed });
    managementService.sessions = [provisional];
    history = [{
      type: "response",
      parts: [{ kind: "markdownContent", content: { value: "Added the repository README." } }],
      participant: "assistant"
    }];
    let watchedCount = 0;
    store.add(adapter.watchSession(provisional.mainChat.get().resource, () => watchedCount++));
    managementService.fireSessionReplaced(provisional, committed);
    const snapshot = await adapter.getSessionSnapshot(provisional.mainChat.get().resource, CancellationToken.None);
    await adapter.revealSession(provisional.mainChat.get().resource);
    assert.deepStrictEqual({
      watchedCount,
      label: snapshot?.label,
      status: snapshot?.status,
      lastResponse: snapshot?.lastResponse,
      opened: opened.map((resource) => resource.toString())
    }, {
      watchedCount: 2,
      label: "Adding repository README",
      status: "idle",
      lastResponse: "Added the repository README.",
      opened: [committed.resource.toString()]
    });
  });
  test("publishes canonical grouped recents, browse actions, and restored provider selection", async () => {
    const shared = URI.file("/work/shared");
    const local = createProvider("local", { supportsLocalWorkspaces: true, group: SESSION_WORKSPACE_GROUP_LOCAL });
    const github = createProvider("github", {
      group: SESSION_WORKSPACE_GROUP_GITHUB,
      browseActions: [createBrowseAction("github", SESSION_WORKSPACE_GROUP_GITHUB, workspace(shared, "GitHub shared", SESSION_WORKSPACE_GROUP_GITHUB))]
    });
    const remote = createProvider("remote", {
      group: SESSION_WORKSPACE_GROUP_REMOTE,
      browseActions: [createBrowseAction("remote", SESSION_WORKSPACE_GROUP_REMOTE, void 0)]
    });
    providersService.setProviders([local, github, remote]);
    recentWorkspacesService.recents = [
      recent(workspace(shared, "GitHub shared", SESSION_WORKSPACE_GROUP_GITHUB), "github", true),
      recent(workspace(URI.file("/work/local"), "Local repo", SESSION_WORKSPACE_GROUP_LOCAL), "local", false)
    ];
    recentWorkspacesService.ownRecents = [recentWorkspacesService.recents[0]];
    const catalog = await adapter.getNewSessionWorkspaceCatalog();
    assert.deepStrictEqual({
      groups: catalog.groups.map((group) => group.id),
      workspaces: catalog.workspaces.map((entry) => [entry.label, entry.providerId, entry.group]),
      browseActions: catalog.browseActions.map((action) => [action.id, action.providerId, action.group, action.label]),
      defaultWorkspace: catalog.defaultWorkspace && [catalog.defaultWorkspace.label, catalog.defaultWorkspace.providerId]
    }, {
      groups: [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_REMOTE],
      workspaces: [
        ["GitHub shared", "github", SESSION_WORKSPACE_GROUP_GITHUB],
        ["Local repo", "local", SESSION_WORKSPACE_GROUP_LOCAL]
      ],
      browseActions: [
        ["local", void 0, SESSION_WORKSPACE_GROUP_LOCAL, "Select..."],
        ["provider:github:0", "github", SESSION_WORKSPACE_GROUP_GITHUB, "Select..."],
        ["provider:remote:0", "remote", SESSION_WORKSPACE_GROUP_REMOTE, "Select..."]
      ],
      defaultWorkspace: ["GitHub shared", "github"]
    });
  });
  test("falls back to the most frequent recent session workspace when no workspace is checked", async () => {
    const first = createSession("provider:first", { repository: "frequent" });
    const second = createSession("provider:second", { repository: "other" });
    const third = createSession("provider:third", { repository: "frequent" });
    providersService.setProviders([createProvider("provider", {
      supportsLocalWorkspaces: true,
      sessions: [first, second, third]
    })]);
    const catalog = await adapter.getNewSessionWorkspaceCatalog();
    assert.deepStrictEqual(
      catalog.defaultWorkspace && [catalog.defaultWorkspace.label, catalog.defaultWorkspace.providerId, catalog.defaultWorkspace.uri.toString()],
      ["frequent", "provider", URI.file("/work/frequent").toString()]
    );
  });
  test("refreshes workspace catalog lifecycle and persists exact provider selections", () => {
    let changes = 0;
    store.add(adapter.onDidChangeNewSessionWorkspaceCatalog(() => changes++));
    const selected = workspace(URI.file("/work/shared"), "Shared", SESSION_WORKSPACE_GROUP_GITHUB);
    const github = createProvider("github", { group: SESSION_WORKSPACE_GROUP_GITHUB });
    providersService.setProviders([github]);
    recentWorkspacesService.fireChanged();
    adapter.selectNewSessionWorkspace({
      uri: selected.folders[0].root,
      providerId: "github",
      group: selected.group,
      label: selected.label,
      icon: selected.icon
    });
    assert.deepStrictEqual({
      changes,
      added: recentWorkspacesService.added.map((entry) => [entry.uri.toString(), entry.providerId, entry.checked])
    }, {
      changes: 3,
      added: [[selected.folders[0].root.toString(), "github", true]]
    });
  });
  test("returns exact local and provider browse selections", async () => {
    const shared = URI.file("/work/shared");
    const localFolder = URI.file("/work/local");
    const local = createProvider("local", { supportsLocalWorkspaces: true, group: SESSION_WORKSPACE_GROUP_LOCAL });
    const github = createProvider("github", {
      group: SESSION_WORKSPACE_GROUP_GITHUB,
      browseActions: [createBrowseAction("github", SESSION_WORKSPACE_GROUP_GITHUB, workspace(shared, "GitHub shared", SESSION_WORKSPACE_GROUP_GITHUB))]
    });
    providersService.setProviders([local, github]);
    selectedLocalFolder = [localFolder];
    const catalog = await adapter.getNewSessionWorkspaceCatalog();
    const githubAction = catalog.browseActions.find((action) => action.providerId === "github");
    const localSelection = await adapter.browseNewSessionWorkspace("local", CancellationToken.None);
    const githubSelection = await adapter.browseNewSessionWorkspace(githubAction.id, CancellationToken.None);
    assert.deepStrictEqual({
      local: localSelection && [localSelection.uri.toString(), localSelection.providerId, localSelection.group],
      github: githubSelection && [githubSelection.uri.toString(), githubSelection.providerId, githubSelection.group]
    }, {
      local: [localFolder.toString(), "local", SESSION_WORKSPACE_GROUP_LOCAL],
      github: [shared.toString(), "github", SESSION_WORKSPACE_GROUP_GITHUB]
    });
  });
  test("returns an explicit rejection when the owning provider disappears during dispatch", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    managementService.sendError = new Error(`Sessions provider 'provider' not found`);
    const result = await adapter.dispatchToSession(session.sessionId, "Continue", {}, CancellationToken.None);
    assert.deepStrictEqual(result, {
      status: "rejected",
      resource: session.mainChat.get().resource,
      reason: `Sessions provider 'provider' not found`
    });
  });
  test("sends existing sessions through Sessions management with attachments in the background", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    const attachment = upcastPartial({ id: "file", name: "file" });
    const result = await adapter.dispatchToSession(session.sessionId, "Continue", {
      attachedContext: [attachment],
      userSelectedTools: constObservable({ tool: true })
    }, CancellationToken.None);
    assert.deepStrictEqual({
      result,
      send: managementService.existingSend
    }, {
      result: {
        status: "sent",
        resource: session.mainChat.get().resource,
        activityBaseline: session.lastTurnEnd.get().getTime()
      },
      send: {
        session,
        chat: session.mainChat.get(),
        options: { query: "Continue", attachedContext: [attachment], background: true }
      }
    });
  });
  test("creates and sends a folder session with supported model, mode, permission, and attachments", async () => {
    const created = createSession("provider:created");
    managementService.createdSession = created;
    const folder = URI.file("/work/repo");
    const attachment = upcastPartial({ id: "file", name: "file" });
    const result = await adapter.dispatchToNewSession({ folder, providerId: "provider" }, "Build it", {
      attachedContext: [attachment],
      userSelectedModelId: "model",
      modeInfo: {
        kind: ChatModeKind.Agent,
        isBuiltin: true,
        modeInstructions: void 0,
        telemetryModeId: "agent",
        applyCodeBlockSuggestionId: void 0,
        permissionLevel: ChatPermissionLevel.AutoApprove
      }
    }, CancellationToken.None);
    assert.deepStrictEqual({
      result,
      folderSend: managementService.folderSend
    }, {
      result: {
        status: "sent",
        resource: created.mainChat.get().resource,
        activityBaseline: created.createdAt.getTime()
      },
      folderSend: {
        folder,
        options: { query: "Build it", attachedContext: [attachment], background: true },
        createOptions: { providerId: "provider", modelId: "model", modeId: "agent", permissionLevel: ChatPermissionLevel.AutoApprove }
      }
    });
  });
  test("creates and sends a quick chat when no folder is selected", async () => {
    const created = createSession("provider:quick");
    managementService.createdSession = created;
    const result = await adapter.dispatchToNewSession({}, "Explain this", {}, CancellationToken.None);
    assert.deepStrictEqual({
      result,
      quickSend: managementService.quickSend
    }, {
      result: {
        status: "sent",
        resource: created.mainChat.get().resource,
        activityBaseline: created.createdAt.getTime()
      },
      quickSend: {
        options: { query: "Explain this", attachedContext: void 0, background: true },
        createOptions: void 0
      }
    });
    test("rejects a missing selected workspace provider instead of rerouting", async () => {
      const result2 = await adapter.dispatchToNewSession({
        folder: URI.file("/work/repo"),
        providerId: "missing"
      }, "Build it", {}, CancellationToken.None);
      assert.deepStrictEqual(result2, {
        status: "rejected",
        reasonCode: "providerRemoved",
        reason: "The selected workspace provider is no longer available."
      });
      assert.strictEqual(managementService.folderSend, void 0);
    });
  });
  test("rejects unsupported request context instead of dropping it", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    const result = await adapter.dispatchToSession(session.sessionId, "Continue", {
      userSelectedTools: constObservable({ tool: false })
    }, CancellationToken.None);
    assert.deepStrictEqual(result, {
      status: "rejected",
      reasonCode: "unsupportedOptions",
      reason: "The selected tool configuration cannot be sent through Sessions."
    });
    assert.strictEqual(managementService.existingSend, void 0);
  });
  test("sends with the selected model when its configuration cannot be forwarded", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    const result = await adapter.dispatchToSession(session.sessionId, "Continue", {
      userSelectedModelId: "model",
      userSelectedModelConfiguration: { reasoningEffort: "high", contextSize: 1e6 }
    }, CancellationToken.None);
    assert.deepStrictEqual({
      result,
      send: managementService.existingSend
    }, {
      result: {
        status: "sent",
        resource: session.mainChat.get().resource,
        activityBaseline: session.lastTurnEnd.get().getTime()
      },
      send: {
        session,
        chat: session.mainChat.get(),
        options: { query: "Continue", attachedContext: void 0, background: true }
      }
    });
  });
  test("rejects cancelled sends before dispatch", async () => {
    const session = createSession("provider:session");
    managementService.sessions = [session];
    const cts = new CancellationTokenSource();
    cts.cancel();
    const result = await adapter.dispatchToSession(session.sessionId, "Continue", {}, cts.token);
    assert.deepStrictEqual(result, {
      status: "rejected",
      resource: void 0,
      reasonCode: "cancelled",
      reason: "The request was cancelled."
    });
    assert.strictEqual(managementService.existingSend, void 0);
    cts.dispose();
  });
  test("opens adapter results through Sessions service", async () => {
    const resource = URI.parse("session:/provider/session");
    await adapter.revealSession(resource);
    assert.deepStrictEqual(opened, [resource]);
  });
});
class TestSessionsProvidersService extends Disposable {
  constructor() {
    super(...arguments);
    this.changeEmitter = this._register(new Emitter());
    this.onDidChangeProviders = this.changeEmitter.event;
    this.providers = [];
  }
  setProviders(providers) {
    const removed = this.providers;
    this.providers = providers;
    this.changeEmitter.fire({ added: providers, removed });
  }
  registerProvider(provider) {
    this.setProviders([...this.providers, provider]);
    return toDisposable(() => this.setProviders(this.providers.filter((candidate) => candidate !== provider)));
  }
  getProviders() {
    return [...this.providers];
  }
  getProvider(providerId) {
    return this.providers.find((provider) => provider.id === providerId);
  }
}
class TestRecentWorkspacesService extends Disposable {
  constructor() {
    super(...arguments);
    this.changeEmitter = this._register(new Emitter());
    this.onDidChangeRecentWorkspaces = this.changeEmitter.event;
    this.recents = [];
    this.ownRecents = [];
    this.added = [];
  }
  getRecentWorkspaces(includeVSCodeRecents = true) {
    return [...includeVSCodeRecents ? this.recents : this.ownRecents];
  }
  addRecentWorkspace(uri, providerId, checked) {
    this.added.push({ uri, providerId, checked });
    this.changeEmitter.fire();
  }
  removeRecentWorkspace() {
  }
  clearCheckedWorkspace() {
  }
  fireChanged() {
    this.changeEmitter.fire();
  }
}
class TestSessionsManagementService extends mock() {
  constructor() {
    super(...arguments);
    this.sessionsChangedEmitter = new Emitter();
    this.sessionTypesChangedEmitter = new Emitter();
    this.sessionReplacedEmitter = new Emitter();
    this.onDidChangeSessions = this.sessionsChangedEmitter.event;
    this.onDidChangeSessionTypes = this.sessionTypesChangedEmitter.event;
    this.onDidReplaceSession = this.sessionReplacedEmitter.event;
    this.sessions = [];
  }
  getSessions() {
    return this.sessions;
  }
  getSession(resource) {
    return this.sessions.find((session) => session.resource.toString() === resource.toString());
  }
  getSessionForChatResource(resource) {
    for (const session of this.sessions) {
      const chat = session.chats.get().find((candidate) => candidate.resource.toString() === resource.toString());
      if (chat) {
        return { session, chat };
      }
    }
    return void 0;
  }
  async sendRequest(session, chat, options) {
    if (this.sendError) {
      throw this.sendError;
    }
    this.existingSend = { session, chat, options };
  }
  async createAndSendNewChatRequest(folder, options, createOptions) {
    this.folderSend = { folder, options, createOptions };
    return this.createdSession;
  }
  async createAndSendQuickChatRequest(options, createOptions) {
    this.quickSend = { options, createOptions };
    return this.createdSession;
  }
  fireSessionsChanged(event) {
    this.sessionsChangedEmitter.fire(event);
  }
  fireSessionReplaced(from, to) {
    this.sessions = this.sessions.filter((session) => session !== from);
    this.sessions.push(to);
    this.sessionReplacedEmitter.fire({ from, to });
  }
  dispose() {
    this.sessionsChangedEmitter.dispose();
    this.sessionTypesChangedEmitter.dispose();
    this.sessionReplacedEmitter.dispose();
  }
}
function createSession(sessionId, options = {}) {
  const providerId = options.providerId ?? "provider";
  const status = options.status ?? SessionStatus.Completed;
  const repository = options.repository ?? "repo";
  const resource = URI.parse(`session:/${sessionId}`);
  const chat = upcastPartial({
    resource: URI.parse(`chat:/${sessionId}`),
    createdAt: /* @__PURE__ */ new Date("2026-08-13T10:00:00Z"),
    title: constObservable(options.title ?? sessionId),
    updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T12:00:00Z")),
    status: constObservable(status),
    isArchived: constObservable(options.archived ?? false),
    interactivity: constObservable(options.interactivity ?? ChatInteractivity.Full)
  });
  return upcastPartial({
    sessionId,
    resource,
    providerId,
    sessionType: "test",
    createdAt: /* @__PURE__ */ new Date("2026-08-13T10:00:00Z"),
    title: constObservable(options.title ?? sessionId),
    updatedAt: constObservable(/* @__PURE__ */ new Date("2026-08-13T12:00:00Z")),
    status: constObservable(status),
    isArchived: constObservable(options.archived ?? false),
    isAutomation: constObservable(false),
    description: constObservable(options.description ? { value: options.description } : void 0),
    lastTurnEnd: constObservable(/* @__PURE__ */ new Date("2026-08-13T12:00:00Z")),
    workspace: constObservable({
      uri: URI.file(`/work/${repository}`),
      label: repository,
      icon: { id: "folder" },
      folders: [{
        root: URI.file(`/work/${repository}`),
        workingDirectory: URI.file(`/work/${repository}`),
        name: repository,
        description: void 0,
        gitRepository: {
          uri: URI.file(`/work/${repository}`),
          workTreeUri: void 0,
          baseBranchName: void 0,
          gitHubInfo: constObservable({ owner: "microsoft", repo: repository })
        }
      }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    }),
    chats: constObservable([chat]),
    mainChat: constObservable(chat)
  });
}
function createProvider(id, options = {}) {
  return upcastPartial({
    id,
    label: id,
    order: 0,
    supportsLocalWorkspaces: options.supportsLocalWorkspaces,
    browseActions: options.browseActions ?? [],
    onDidChangeSessions: Event.None,
    getSessions: () => [...options.sessions ?? []],
    resolveWorkspace: (uri) => workspace(uri, uri.path.split("/").filter(Boolean).at(-1) ?? uri.path, options.group)
  });
}
function createBrowseAction(providerId, group, selection) {
  return {
    label: "Provider action",
    group,
    icon: { id: "folder-opened" },
    providerId,
    run: async () => selection
  };
}
function workspace(uri, label, group) {
  return {
    uri,
    label,
    group,
    icon: { id: "folder" },
    folders: [{
      root: uri,
      workingDirectory: uri,
      name: label,
      description: void 0
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
}
function recent(workspace2, providerId, checked) {
  return { workspace: workspace2, providerId, checked };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcb21uaVNlc3Npb25Sb3V0aW5nQWRhcHRlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ2FuY2VsbGF0aW9uVG9rZW4sIENhbmNlbGxhdGlvblRva2VuU291cmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY2FuY2VsbGF0aW9uLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBvYnNlcnZhYmxlVmFsdWUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9vYnNlcnZhYmxlLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBtb2NrLCB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi90ZXN0L2NvbW1vbi90ZXN0Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVXJpSWRlbnRpdHlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdXJpSWRlbnRpdHkvY29tbW9uL3VyaUlkZW50aXR5U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vYXR0YWNobWVudHMvY2hhdFZhcmlhYmxlRW50cmllcy5qcyc7XG5pbXBvcnQgeyBDaGF0TW9kZUtpbmQsIENoYXRQZXJtaXNzaW9uTGV2ZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvY29udHJpYi9jaGF0L2NvbW1vbi9jb25zdGFudHMuanMnO1xuaW1wb3J0IHsgSUNoYXRTZXNzaW9uSGlzdG9yeUl0ZW0sIElDaGF0U2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0RmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVJlY2VudFdvcmtzcGFjZSwgSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQ2hhdCwgSVNlc3Npb24sIFNlc3Npb25TdGF0dXMsIENoYXRJbnRlcmFjdGl2aXR5LCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24sIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucywgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgT21uaVNlc3Npb25Sb3V0aW5nQWRhcHRlciB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvb21uaVNlc3Npb25Sb3V0aW5nQWRhcHRlci5jb250cmlidXRpb24uanMnO1xuXG5zdWl0ZSgnT21uaVNlc3Npb25Sb3V0aW5nQWRhcHRlcicsICgpID0+IHtcblxuXHRjb25zdCBzdG9yZSA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IG1hbmFnZW1lbnRTZXJ2aWNlOiBUZXN0U2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTtcblx0bGV0IHByb3ZpZGVyc1NlcnZpY2U6IFRlc3RTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2U7XG5cdGxldCByZWNlbnRXb3Jrc3BhY2VzU2VydmljZTogVGVzdFJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlO1xuXHRsZXQgb3BlbmVkOiBVUklbXTtcblx0bGV0IGFkYXB0ZXI6IE9tbmlTZXNzaW9uUm91dGluZ0FkYXB0ZXI7XG5cdGxldCBzZWxlY3RlZExvY2FsRm9sZGVyOiBVUklbXSB8IHVuZGVmaW5lZDtcblx0bGV0IGhpc3Rvcnk6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW107XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSgpKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlID0gc3RvcmUuYWRkKG5ldyBUZXN0UmVjZW50V29ya3NwYWNlc1NlcnZpY2UoKSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2NyZWF0ZVByb3ZpZGVyKCdwcm92aWRlcicsIHsgc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXM6IHRydWUgfSldKTtcblx0XHRvcGVuZWQgPSBbXTtcblx0XHRzZWxlY3RlZExvY2FsRm9sZGVyID0gdW5kZWZpbmVkO1xuXHRcdGhpc3RvcnkgPSBbXTtcblx0XHRjb25zdCBmaWxlU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEZpbGVTZXJ2aWNlKCkpO1xuXHRcdGFkYXB0ZXIgPSBzdG9yZS5hZGQobmV3IE9tbmlTZXNzaW9uUm91dGluZ0FkYXB0ZXIoXG5cdFx0XHRtYW5hZ2VtZW50U2VydmljZSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zU2VydmljZT4oe1xuXHRcdFx0XHRvcGVuU2Vzc2lvbjogYXN5bmMgcmVzb3VyY2UgPT4geyBvcGVuZWQucHVzaChyZXNvdXJjZSk7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SUNoYXRTZXNzaW9uc1NlcnZpY2U+KHtcblx0XHRcdFx0Z2V0Q2hhdFNlc3Npb25IaXN0b3J5OiBhc3luYyAoKSA9PiBoaXN0b3J5LFxuXHRcdFx0fSksXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2UsXG5cdFx0XHRuZXcgVGVzdENvbmZpZ3VyYXRpb25TZXJ2aWNlKHsgW1JlbW90ZUFnZW50SG9zdHNFbmFibGVkU2V0dGluZ0lkXTogdHJ1ZSB9KSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SUZpbGVEaWFsb2dTZXJ2aWNlPih7XG5cdFx0XHRcdHNob3dPcGVuRGlhbG9nOiBhc3luYyAoKSA9PiBzZWxlY3RlZExvY2FsRm9sZGVyLFxuXHRcdFx0fSksXG5cdFx0XHRmaWxlU2VydmljZSxcblx0XHRcdHN0b3JlLmFkZChuZXcgVXJpSWRlbnRpdHlTZXJ2aWNlKGZpbGVTZXJ2aWNlKSksXG5cdFx0XHR1cGNhc3RQYXJ0aWFsPElMb2dTZXJ2aWNlPih7XG5cdFx0XHRcdGVycm9yOiAoKSA9PiB7IH0sXG5cdFx0XHR9KSxcblx0XHRcdHVwY2FzdFBhcnRpYWw8SU5vdGlmaWNhdGlvblNlcnZpY2U+KHtcblx0XHRcdFx0ZXJyb3I6ICgpID0+IHVuZGVmaW5lZCEsXG5cdFx0XHR9KSxcblx0XHQpKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FnZ3JlZ2F0ZXMgcHJvdmlkZXItbmV1dHJhbCBzZXNzaW9ucyBhbmQgZmlsdGVycyBkcmFmdHMsIGFyY2hpdmVkLCBhbmQgbm9uLXJvdXRhYmxlIGNoYXRzJywgKCkgPT4ge1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25zID0gW1xuXHRcdFx0Y3JlYXRlU2Vzc2lvbigncHJvdmlkZXItYTpvbmUnLCB7IHByb3ZpZGVySWQ6ICdwcm92aWRlci1hJywgdGl0bGU6ICdPbmUnLCBkZXNjcmlwdGlvbjogJ0ZpcnN0IHNlc3Npb24nLCByZXBvc2l0b3J5OiAndnNjb2RlJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfSksXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdwcm92aWRlci1iOnR3bycsIHsgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyLWInLCB0aXRsZTogJ1R3bycsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQgfSksXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdwcm92aWRlci1hOmRyYWZ0JywgeyBzdGF0dXM6IFNlc3Npb25TdGF0dXMuVW50aXRsZWQgfSksXG5cdFx0XHRjcmVhdGVTZXNzaW9uKCdwcm92aWRlci1hOmFyY2hpdmVkJywgeyBhcmNoaXZlZDogdHJ1ZSB9KSxcblx0XHRcdGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyLWE6cmVhZG9ubHknLCB7IGludGVyYWN0aXZpdHk6IENoYXRJbnRlcmFjdGl2aXR5LlJlYWRPbmx5IH0pLFxuXHRcdF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFkYXB0ZXIuZ2V0Q2FuZGlkYXRlU2Vzc2lvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksIFtcblx0XHRcdHtcblx0XHRcdFx0c2Vzc2lvbklkOiAncHJvdmlkZXItYTpvbmUnLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICdzZXNzaW9uJywgcGF0aDogJy9wcm92aWRlci1hOm9uZScgfSksXG5cdFx0XHRcdGxhYmVsOiAnT25lJyxcblx0XHRcdFx0cmVwbzogJ21pY3Jvc29mdC92c2NvZGUnLFxuXHRcdFx0XHRjd2Q6ICcvd29yay92c2NvZGUnLFxuXHRcdFx0XHRzdGF0dXM6ICd3b3JraW5nJyxcblx0XHRcdFx0bGFzdEFjdGl2aXR5OiBEYXRlLnBhcnNlKCcyMDI2LTA4LTEzVDEyOjAwOjAwWicpLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0ZpcnN0IHNlc3Npb24nLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0c2Vzc2lvbklkOiAncHJvdmlkZXItYjp0d28nLFxuXHRcdFx0XHRyZXNvdXJjZTogVVJJLmZyb20oeyBzY2hlbWU6ICdzZXNzaW9uJywgcGF0aDogJy9wcm92aWRlci1iOnR3bycgfSksXG5cdFx0XHRcdGxhYmVsOiAnVHdvJyxcblx0XHRcdFx0cmVwbzogJ21pY3Jvc29mdC9yZXBvJyxcblx0XHRcdFx0Y3dkOiAnL3dvcmsvcmVwbycsXG5cdFx0XHRcdHN0YXR1czogJ2lkbGUnLFxuXHRcdFx0XHRsYXN0QWN0aXZpdHk6IERhdGUucGFyc2UoJzIwMjYtMDgtMTNUMTI6MDA6MDBaJyksXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWZyZXNoZXMgb24gbGlmZWN5Y2xlIGNoYW5nZXMgYW5kIHJlamVjdHMgYSByZW1vdmVkIHByb3ZpZGVyIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnNlc3Npb24nKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5maXJlU2Vzc2lvbnNDaGFuZ2VkKHsgYWRkZWQ6IFtzZXNzaW9uXSwgcmVtb3ZlZDogW10sIGNoYW5nZWQ6IFtdIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWRhcHRlci5nZXRDYW5kaWRhdGVTZXNzaW9ucyhDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKS5tYXAoY2FuZGlkYXRlID0+ICh7XG5cdFx0XHRzZXNzaW9uSWQ6IGNhbmRpZGF0ZS5zZXNzaW9uSWQsXG5cdFx0XHRyZXNvdXJjZTogY2FuZGlkYXRlLnJlc291cmNlPy50b1N0cmluZygpLFxuXHRcdH0pKSwgW3tcblx0XHRcdHNlc3Npb25JZDogJ3Byb3ZpZGVyOnNlc3Npb24nLFxuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFkYXB0ZXIucmVzb2x2ZVNlc3Npb25SZXNvdXJjZShzZXNzaW9uLnNlc3Npb25JZCk/LnRvU3RyaW5nKCksIHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtdO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyBhZGRlZDogW10sIHJlbW92ZWQ6IFtzZXNzaW9uXSwgY2hhbmdlZDogW10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNhbmRpZGF0ZXM6IGFkYXB0ZXIuZ2V0Q2FuZGlkYXRlU2Vzc2lvbnMoQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSksXG5cdFx0XHRkaXNwYXRjaDogYXdhaXQgYWRhcHRlci5kaXNwYXRjaFRvU2Vzc2lvbihzZXNzaW9uLnNlc3Npb25JZCwgJ0NvbnRpbnVlJywge30sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpLFxuXHRcdH0sIHtcblx0XHRcdGNhbmRpZGF0ZXM6IFtdLFxuXHRcdFx0ZGlzcGF0Y2g6IHtcblx0XHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0XHRyZWFzb25Db2RlOiAncHJvdmlkZXJSZW1vdmVkJyxcblx0XHRcdFx0cmVhc29uOiAnVGhlIHNlbGVjdGVkIHNlc3Npb24gaXMgbm8gbG9uZ2VyIGF2YWlsYWJsZS4nLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncHVibGlzaGVzIGxpdmUgdGl0bGUsIHN0YXR1cywgYW5kIHJlc3BvbnNlIHNuYXBzaG90cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0aXRsZSA9IG9ic2VydmFibGVWYWx1ZSgndGl0bGUnLCAnTmV3IHNlc3Npb24nKTtcblx0XHRjb25zdCBzdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWUoJ3N0YXR1cycsIFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcyk7XG5cdFx0Y29uc3Qgb3JpZ2luYWwgPSB7XG5cdFx0XHQuLi5jcmVhdGVTZXNzaW9uKCdwcm92aWRlcjpzZXNzaW9uJywgeyB0aXRsZTogJ05ldyBzZXNzaW9uJywgc3RhdHVzOiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MgfSksXG5cdFx0XHR0aXRsZSxcblx0XHRcdHN0YXR1cyxcblx0XHR9O1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25zID0gW29yaWdpbmFsXTtcblx0XHRoaXN0b3J5ID0gW3tcblx0XHRcdHR5cGU6ICdyZXNwb25zZScsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnUmVuYW1pbmcgdGhpcyBzZXNzaW9uIHRvIG1hdGNoIHlvdXIgcmVxdWVzdCwgdGhlbiBJIHdpbGwgbWFrZSB0aGUgY2hhbmdlLicgfSB9LFxuXHRcdFx0XHR7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiB7IHZhbHVlOiAnSW1wbGVtZW50ZWQgdGhlIHJlcXVlc3RlZCBjaGFuZ2UuJyB9IH0sXG5cdFx0XHRdLFxuXHRcdFx0cGFydGljaXBhbnQ6ICdhc3Npc3RhbnQnLFxuXHRcdH1dO1xuXHRcdGxldCBjaGFuZ2VDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKGFkYXB0ZXIub25EaWRDaGFuZ2VTZXNzaW9ucygoKSA9PiBjaGFuZ2VDb3VudCsrKSk7XG5cdFx0bGV0IHdhdGNoZWRDb3VudCA9IDA7XG5cdFx0c3RvcmUuYWRkKGFkYXB0ZXIud2F0Y2hTZXNzaW9uKG9yaWdpbmFsLnJlc291cmNlLCAoKSA9PiB3YXRjaGVkQ291bnQrKykpO1xuXG5cdFx0dGl0bGUuc2V0KCdVcGRhdGUgcm91dGluZyBiYWRnZScsIHVuZGVmaW5lZCk7XG5cdFx0c3RhdHVzLnNldChTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCwgdW5kZWZpbmVkKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IGF3YWl0IGFkYXB0ZXIuZ2V0U2Vzc2lvblNuYXBzaG90KG9yaWdpbmFsLnJlc291cmNlLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBjaGFuZ2VDb3VudCwgd2F0Y2hlZENvdW50LCBzbmFwc2hvdCB9LCB7XG5cdFx0XHRjaGFuZ2VDb3VudDogMCxcblx0XHRcdHdhdGNoZWRDb3VudDogMyxcblx0XHRcdHNuYXBzaG90OiB7XG5cdFx0XHRcdHNlc3Npb25JZDogJ3Byb3ZpZGVyOnNlc3Npb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogb3JpZ2luYWwucmVzb3VyY2UsXG5cdFx0XHRcdGxhYmVsOiAnVXBkYXRlIHJvdXRpbmcgYmFkZ2UnLFxuXHRcdFx0XHRyZXBvOiAnbWljcm9zb2Z0L3JlcG8nLFxuXHRcdFx0XHRjd2Q6ICcvd29yay9yZXBvJyxcblx0XHRcdFx0c3RhdHVzOiAnaWRsZScsXG5cdFx0XHRcdGxhc3RBY3Rpdml0eTogRGF0ZS5wYXJzZSgnMjAyNi0wOC0xM1QxMjowMDowMFonKSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFzdFJlc3BvbnNlOiAnSW1wbGVtZW50ZWQgdGhlIHJlcXVlc3RlZCBjaGFuZ2UuJyxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvbGxvd3MgYSBuZXcgc2Vzc2lvbiBmcm9tIGl0cyBwcm92aXNpb25hbCByZXNvdXJjZSB0byB0aGUgY29tbWl0dGVkIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlzaW9uYWwgPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcjpwcm92aXNpb25hbCcsIHsgdGl0bGU6ICdOZXcgc2Vzc2lvbicsIHN0YXR1czogU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzIH0pO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOmNvbW1pdHRlZCcsIHsgdGl0bGU6ICdBZGRpbmcgcmVwb3NpdG9yeSBSRUFETUUnLCBzdGF0dXM6IFNlc3Npb25TdGF0dXMuQ29tcGxldGVkIH0pO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLnNlc3Npb25zID0gW3Byb3Zpc2lvbmFsXTtcblx0XHRoaXN0b3J5ID0gW3tcblx0XHRcdHR5cGU6ICdyZXNwb25zZScsXG5cdFx0XHRwYXJ0czogW3sga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IHsgdmFsdWU6ICdBZGRlZCB0aGUgcmVwb3NpdG9yeSBSRUFETUUuJyB9IH1dLFxuXHRcdFx0cGFydGljaXBhbnQ6ICdhc3Npc3RhbnQnLFxuXHRcdH1dO1xuXHRcdGxldCB3YXRjaGVkQ291bnQgPSAwO1xuXHRcdHN0b3JlLmFkZChhZGFwdGVyLndhdGNoU2Vzc2lvbihwcm92aXNpb25hbC5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSwgKCkgPT4gd2F0Y2hlZENvdW50KyspKTtcblxuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uUmVwbGFjZWQocHJvdmlzaW9uYWwsIGNvbW1pdHRlZCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBhZGFwdGVyLmdldFNlc3Npb25TbmFwc2hvdChwcm92aXNpb25hbC5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cdFx0YXdhaXQgYWRhcHRlci5yZXZlYWxTZXNzaW9uKHByb3Zpc2lvbmFsLm1haW5DaGF0LmdldCgpLnJlc291cmNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0d2F0Y2hlZENvdW50LFxuXHRcdFx0bGFiZWw6IHNuYXBzaG90Py5sYWJlbCxcblx0XHRcdHN0YXR1czogc25hcHNob3Q/LnN0YXR1cyxcblx0XHRcdGxhc3RSZXNwb25zZTogc25hcHNob3Q/Lmxhc3RSZXNwb25zZSxcblx0XHRcdG9wZW5lZDogb3BlbmVkLm1hcChyZXNvdXJjZSA9PiByZXNvdXJjZS50b1N0cmluZygpKSxcblx0XHR9LCB7XG5cdFx0XHR3YXRjaGVkQ291bnQ6IDIsXG5cdFx0XHRsYWJlbDogJ0FkZGluZyByZXBvc2l0b3J5IFJFQURNRScsXG5cdFx0XHRzdGF0dXM6ICdpZGxlJyxcblx0XHRcdGxhc3RSZXNwb25zZTogJ0FkZGVkIHRoZSByZXBvc2l0b3J5IFJFQURNRS4nLFxuXHRcdFx0b3BlbmVkOiBbY29tbWl0dGVkLnJlc291cmNlLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwdWJsaXNoZXMgY2Fub25pY2FsIGdyb3VwZWQgcmVjZW50cywgYnJvd3NlIGFjdGlvbnMsIGFuZCByZXN0b3JlZCBwcm92aWRlciBzZWxlY3Rpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2hhcmVkID0gVVJJLmZpbGUoJy93b3JrL3NoYXJlZCcpO1xuXHRcdGNvbnN0IGxvY2FsID0gY3JlYXRlUHJvdmlkZXIoJ2xvY2FsJywgeyBzdXBwb3J0c0xvY2FsV29ya3NwYWNlczogdHJ1ZSwgZ3JvdXA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMIH0pO1xuXHRcdGNvbnN0IGdpdGh1YiA9IGNyZWF0ZVByb3ZpZGVyKCdnaXRodWInLCB7XG5cdFx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogW2NyZWF0ZUJyb3dzZUFjdGlvbignZ2l0aHViJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCLCB3b3Jrc3BhY2Uoc2hhcmVkLCAnR2l0SHViIHNoYXJlZCcsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQikpXSxcblx0XHR9KTtcblx0XHRjb25zdCByZW1vdGUgPSBjcmVhdGVQcm92aWRlcigncmVtb3RlJywge1xuXHRcdFx0Z3JvdXA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSxcblx0XHRcdGJyb3dzZUFjdGlvbnM6IFtjcmVhdGVCcm93c2VBY3Rpb24oJ3JlbW90ZScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSwgdW5kZWZpbmVkKV0sXG5cdFx0fSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsLCBnaXRodWIsIHJlbW90ZV0pO1xuXHRcdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLnJlY2VudHMgPSBbXG5cdFx0XHRyZWNlbnQod29ya3NwYWNlKHNoYXJlZCwgJ0dpdEh1YiBzaGFyZWQnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIpLCAnZ2l0aHViJywgdHJ1ZSksXG5cdFx0XHRyZWNlbnQod29ya3NwYWNlKFVSSS5maWxlKCcvd29yay9sb2NhbCcpLCAnTG9jYWwgcmVwbycsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKSwgJ2xvY2FsJywgZmFsc2UpLFxuXHRcdF07XG5cdFx0cmVjZW50V29ya3NwYWNlc1NlcnZpY2Uub3duUmVjZW50cyA9IFtyZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5yZWNlbnRzWzBdXTtcblxuXHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCBhZGFwdGVyLmdldE5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdyb3VwczogY2F0YWxvZy5ncm91cHMubWFwKGdyb3VwID0+IGdyb3VwLmlkKSxcblx0XHRcdHdvcmtzcGFjZXM6IGNhdGFsb2cud29ya3NwYWNlcy5tYXAoZW50cnkgPT4gW2VudHJ5LmxhYmVsLCBlbnRyeS5wcm92aWRlcklkLCBlbnRyeS5ncm91cF0pLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogY2F0YWxvZy5icm93c2VBY3Rpb25zLm1hcChhY3Rpb24gPT4gW2FjdGlvbi5pZCwgYWN0aW9uLnByb3ZpZGVySWQsIGFjdGlvbi5ncm91cCwgYWN0aW9uLmxhYmVsXSksXG5cdFx0XHRkZWZhdWx0V29ya3NwYWNlOiBjYXRhbG9nLmRlZmF1bHRXb3Jrc3BhY2UgJiYgW2NhdGFsb2cuZGVmYXVsdFdvcmtzcGFjZS5sYWJlbCwgY2F0YWxvZy5kZWZhdWx0V29ya3NwYWNlLnByb3ZpZGVySWRdLFxuXHRcdH0sIHtcblx0XHRcdGdyb3VwczogW1NFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URV0sXG5cdFx0XHR3b3Jrc3BhY2VzOiBbXG5cdFx0XHRcdFsnR2l0SHViIHNoYXJlZCcsICdnaXRodWInLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUJdLFxuXHRcdFx0XHRbJ0xvY2FsIHJlcG8nLCAnbG9jYWwnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTF0sXG5cdFx0XHRdLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogW1xuXHRcdFx0XHRbJ2xvY2FsJywgdW5kZWZpbmVkLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgJ1NlbGVjdC4uLiddLFxuXHRcdFx0XHRbJ3Byb3ZpZGVyOmdpdGh1YjowJywgJ2dpdGh1YicsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiwgJ1NlbGVjdC4uLiddLFxuXHRcdFx0XHRbJ3Byb3ZpZGVyOnJlbW90ZTowJywgJ3JlbW90ZScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSwgJ1NlbGVjdC4uLiddLFxuXHRcdFx0XSxcblx0XHRcdGRlZmF1bHRXb3Jrc3BhY2U6IFsnR2l0SHViIHNoYXJlZCcsICdnaXRodWInXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgbW9zdCBmcmVxdWVudCByZWNlbnQgc2Vzc2lvbiB3b3Jrc3BhY2Ugd2hlbiBubyB3b3Jrc3BhY2UgaXMgY2hlY2tlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdCA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOmZpcnN0JywgeyByZXBvc2l0b3J5OiAnZnJlcXVlbnQnIH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnNlY29uZCcsIHsgcmVwb3NpdG9yeTogJ290aGVyJyB9KTtcblx0XHRjb25zdCB0aGlyZCA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnRoaXJkJywgeyByZXBvc2l0b3J5OiAnZnJlcXVlbnQnIH0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjcmVhdGVQcm92aWRlcigncHJvdmlkZXInLCB7XG5cdFx0XHRzdXBwb3J0c0xvY2FsV29ya3NwYWNlczogdHJ1ZSxcblx0XHRcdHNlc3Npb25zOiBbZmlyc3QsIHNlY29uZCwgdGhpcmRdLFxuXHRcdH0pXSk7XG5cblx0XHRjb25zdCBjYXRhbG9nID0gYXdhaXQgYWRhcHRlci5nZXROZXdTZXNzaW9uV29ya3NwYWNlQ2F0YWxvZygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdGNhdGFsb2cuZGVmYXVsdFdvcmtzcGFjZSAmJiBbY2F0YWxvZy5kZWZhdWx0V29ya3NwYWNlLmxhYmVsLCBjYXRhbG9nLmRlZmF1bHRXb3Jrc3BhY2UucHJvdmlkZXJJZCwgY2F0YWxvZy5kZWZhdWx0V29ya3NwYWNlLnVyaS50b1N0cmluZygpXSxcblx0XHRcdFsnZnJlcXVlbnQnLCAncHJvdmlkZXInLCBVUkkuZmlsZSgnL3dvcmsvZnJlcXVlbnQnKS50b1N0cmluZygpXVxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlZnJlc2hlcyB3b3Jrc3BhY2UgY2F0YWxvZyBsaWZlY3ljbGUgYW5kIHBlcnNpc3RzIGV4YWN0IHByb3ZpZGVyIHNlbGVjdGlvbnMnLCAoKSA9PiB7XG5cdFx0bGV0IGNoYW5nZXMgPSAwO1xuXHRcdHN0b3JlLmFkZChhZGFwdGVyLm9uRGlkQ2hhbmdlTmV3U2Vzc2lvbldvcmtzcGFjZUNhdGFsb2coKCkgPT4gY2hhbmdlcysrKSk7XG5cdFx0Y29uc3Qgc2VsZWN0ZWQgPSB3b3Jrc3BhY2UoVVJJLmZpbGUoJy93b3JrL3NoYXJlZCcpLCAnU2hhcmVkJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCKTtcblx0XHRjb25zdCBnaXRodWIgPSBjcmVhdGVQcm92aWRlcignZ2l0aHViJywgeyBncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCIH0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtnaXRodWJdKTtcblx0XHRyZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5maXJlQ2hhbmdlZCgpO1xuXG5cdFx0YWRhcHRlci5zZWxlY3ROZXdTZXNzaW9uV29ya3NwYWNlKHtcblx0XHRcdHVyaTogc2VsZWN0ZWQuZm9sZGVyc1swXS5yb290LFxuXHRcdFx0cHJvdmlkZXJJZDogJ2dpdGh1YicsXG5cdFx0XHRncm91cDogc2VsZWN0ZWQuZ3JvdXAsXG5cdFx0XHRsYWJlbDogc2VsZWN0ZWQubGFiZWwsXG5cdFx0XHRpY29uOiBzZWxlY3RlZC5pY29uLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGFuZ2VzLFxuXHRcdFx0YWRkZWQ6IHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmFkZGVkLm1hcChlbnRyeSA9PiBbZW50cnkudXJpLnRvU3RyaW5nKCksIGVudHJ5LnByb3ZpZGVySWQsIGVudHJ5LmNoZWNrZWRdKSxcblx0XHR9LCB7XG5cdFx0XHRjaGFuZ2VzOiAzLFxuXHRcdFx0YWRkZWQ6IFtbc2VsZWN0ZWQuZm9sZGVyc1swXS5yb290LnRvU3RyaW5nKCksICdnaXRodWInLCB0cnVlXV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldHVybnMgZXhhY3QgbG9jYWwgYW5kIHByb3ZpZGVyIGJyb3dzZSBzZWxlY3Rpb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNoYXJlZCA9IFVSSS5maWxlKCcvd29yay9zaGFyZWQnKTtcblx0XHRjb25zdCBsb2NhbEZvbGRlciA9IFVSSS5maWxlKCcvd29yay9sb2NhbCcpO1xuXHRcdGNvbnN0IGxvY2FsID0gY3JlYXRlUHJvdmlkZXIoJ2xvY2FsJywgeyBzdXBwb3J0c0xvY2FsV29ya3NwYWNlczogdHJ1ZSwgZ3JvdXA6IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMIH0pO1xuXHRcdGNvbnN0IGdpdGh1YiA9IGNyZWF0ZVByb3ZpZGVyKCdnaXRodWInLCB7XG5cdFx0XHRncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCLFxuXHRcdFx0YnJvd3NlQWN0aW9uczogW2NyZWF0ZUJyb3dzZUFjdGlvbignZ2l0aHViJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCLCB3b3Jrc3BhY2Uoc2hhcmVkLCAnR2l0SHViIHNoYXJlZCcsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQikpXSxcblx0XHR9KTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbbG9jYWwsIGdpdGh1Yl0pO1xuXHRcdHNlbGVjdGVkTG9jYWxGb2xkZXIgPSBbbG9jYWxGb2xkZXJdO1xuXHRcdGNvbnN0IGNhdGFsb2cgPSBhd2FpdCBhZGFwdGVyLmdldE5ld1Nlc3Npb25Xb3Jrc3BhY2VDYXRhbG9nKCk7XG5cdFx0Y29uc3QgZ2l0aHViQWN0aW9uID0gY2F0YWxvZy5icm93c2VBY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5wcm92aWRlcklkID09PSAnZ2l0aHViJyk7XG5cblx0XHRjb25zdCBsb2NhbFNlbGVjdGlvbiA9IGF3YWl0IGFkYXB0ZXIuYnJvd3NlTmV3U2Vzc2lvbldvcmtzcGFjZSgnbG9jYWwnLCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblx0XHRjb25zdCBnaXRodWJTZWxlY3Rpb24gPSBhd2FpdCBhZGFwdGVyLmJyb3dzZU5ld1Nlc3Npb25Xb3Jrc3BhY2UoZ2l0aHViQWN0aW9uIS5pZCwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGxvY2FsOiBsb2NhbFNlbGVjdGlvbiAmJiBbbG9jYWxTZWxlY3Rpb24udXJpLnRvU3RyaW5nKCksIGxvY2FsU2VsZWN0aW9uLnByb3ZpZGVySWQsIGxvY2FsU2VsZWN0aW9uLmdyb3VwXSxcblx0XHRcdGdpdGh1YjogZ2l0aHViU2VsZWN0aW9uICYmIFtnaXRodWJTZWxlY3Rpb24udXJpLnRvU3RyaW5nKCksIGdpdGh1YlNlbGVjdGlvbi5wcm92aWRlcklkLCBnaXRodWJTZWxlY3Rpb24uZ3JvdXBdLFxuXHRcdH0sIHtcblx0XHRcdGxvY2FsOiBbbG9jYWxGb2xkZXIudG9TdHJpbmcoKSwgJ2xvY2FsJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUxdLFxuXHRcdFx0Z2l0aHViOiBbc2hhcmVkLnRvU3RyaW5nKCksICdnaXRodWInLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUJdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXR1cm5zIGFuIGV4cGxpY2l0IHJlamVjdGlvbiB3aGVuIHRoZSBvd25pbmcgcHJvdmlkZXIgZGlzYXBwZWFycyBkdXJpbmcgZGlzcGF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnNlc3Npb24nKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZW5kRXJyb3IgPSBuZXcgRXJyb3IoYFNlc3Npb25zIHByb3ZpZGVyICdwcm92aWRlcicgbm90IGZvdW5kYCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZGFwdGVyLmRpc3BhdGNoVG9TZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCAnQ29udGludWUnLCB7fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsXG5cdFx0XHRyZWFzb246IGBTZXNzaW9ucyBwcm92aWRlciAncHJvdmlkZXInIG5vdCBmb3VuZGAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlbmRzIGV4aXN0aW5nIHNlc3Npb25zIHRocm91Z2ggU2Vzc2lvbnMgbWFuYWdlbWVudCB3aXRoIGF0dGFjaG1lbnRzIGluIHRoZSBiYWNrZ3JvdW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcjpzZXNzaW9uJyk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2Uuc2Vzc2lvbnMgPSBbc2Vzc2lvbl07XG5cdFx0Y29uc3QgYXR0YWNobWVudCA9IHVwY2FzdFBhcnRpYWw8SUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeT4oeyBpZDogJ2ZpbGUnLCBuYW1lOiAnZmlsZScgfSk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZGFwdGVyLmRpc3BhdGNoVG9TZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCAnQ29udGludWUnLCB7XG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IFthdHRhY2htZW50XSxcblx0XHRcdHVzZXJTZWxlY3RlZFRvb2xzOiBjb25zdE9ic2VydmFibGUoeyB0b29sOiB0cnVlIH0pLFxuXHRcdH0sIENhbmNlbGxhdGlvblRva2VuLk5vbmUpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRyZXN1bHQsXG5cdFx0XHRzZW5kOiBtYW5hZ2VtZW50U2VydmljZS5leGlzdGluZ1NlbmQsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ3NlbnQnLFxuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZpdHlCYXNlbGluZTogc2Vzc2lvbi5sYXN0VHVybkVuZC5nZXQoKSEuZ2V0VGltZSgpLFxuXHRcdFx0fSxcblx0XHRcdHNlbmQ6IHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0Y2hhdDogc2Vzc2lvbi5tYWluQ2hhdC5nZXQoKSxcblx0XHRcdFx0b3B0aW9uczogeyBxdWVyeTogJ0NvbnRpbnVlJywgYXR0YWNoZWRDb250ZXh0OiBbYXR0YWNobWVudF0sIGJhY2tncm91bmQ6IHRydWUgfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZXMgYW5kIHNlbmRzIGEgZm9sZGVyIHNlc3Npb24gd2l0aCBzdXBwb3J0ZWQgbW9kZWwsIG1vZGUsIHBlcm1pc3Npb24sIGFuZCBhdHRhY2htZW50cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjcmVhdGVkID0gY3JlYXRlU2Vzc2lvbigncHJvdmlkZXI6Y3JlYXRlZCcpO1xuXHRcdG1hbmFnZW1lbnRTZXJ2aWNlLmNyZWF0ZWRTZXNzaW9uID0gY3JlYXRlZDtcblx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL3dvcmsvcmVwbycpO1xuXHRcdGNvbnN0IGF0dGFjaG1lbnQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnk+KHsgaWQ6ICdmaWxlJywgbmFtZTogJ2ZpbGUnIH0pO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWRhcHRlci5kaXNwYXRjaFRvTmV3U2Vzc2lvbih7IGZvbGRlciwgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyJyB9LCAnQnVpbGQgaXQnLCB7XG5cdFx0XHRhdHRhY2hlZENvbnRleHQ6IFthdHRhY2htZW50XSxcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHRtb2RlSW5mbzoge1xuXHRcdFx0XHRraW5kOiBDaGF0TW9kZUtpbmQuQWdlbnQsXG5cdFx0XHRcdGlzQnVpbHRpbjogdHJ1ZSxcblx0XHRcdFx0bW9kZUluc3RydWN0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0XHR0ZWxlbWV0cnlNb2RlSWQ6ICdhZ2VudCcsXG5cdFx0XHRcdGFwcGx5Q29kZUJsb2NrU3VnZ2VzdGlvbklkOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBlcm1pc3Npb25MZXZlbDogQ2hhdFBlcm1pc3Npb25MZXZlbC5BdXRvQXBwcm92ZSxcblx0XHRcdH0sXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHJlc3VsdCxcblx0XHRcdGZvbGRlclNlbmQ6IG1hbmFnZW1lbnRTZXJ2aWNlLmZvbGRlclNlbmQsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ3NlbnQnLFxuXHRcdFx0XHRyZXNvdXJjZTogY3JlYXRlZC5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZpdHlCYXNlbGluZTogY3JlYXRlZC5jcmVhdGVkQXQuZ2V0VGltZSgpLFxuXHRcdFx0fSxcblx0XHRcdGZvbGRlclNlbmQ6IHtcblx0XHRcdFx0Zm9sZGVyLFxuXHRcdFx0XHRvcHRpb25zOiB7IHF1ZXJ5OiAnQnVpbGQgaXQnLCBhdHRhY2hlZENvbnRleHQ6IFthdHRhY2htZW50XSwgYmFja2dyb3VuZDogdHJ1ZSB9LFxuXHRcdFx0XHRjcmVhdGVPcHRpb25zOiB7IHByb3ZpZGVySWQ6ICdwcm92aWRlcicsIG1vZGVsSWQ6ICdtb2RlbCcsIG1vZGVJZDogJ2FnZW50JywgcGVybWlzc2lvbkxldmVsOiBDaGF0UGVybWlzc2lvbkxldmVsLkF1dG9BcHByb3ZlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGVzIGFuZCBzZW5kcyBhIHF1aWNrIGNoYXQgd2hlbiBubyBmb2xkZXIgaXMgc2VsZWN0ZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgY3JlYXRlZCA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnF1aWNrJyk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2UuY3JlYXRlZFNlc3Npb24gPSBjcmVhdGVkO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgYWRhcHRlci5kaXNwYXRjaFRvTmV3U2Vzc2lvbih7fSwgJ0V4cGxhaW4gdGhpcycsIHt9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0cXVpY2tTZW5kOiBtYW5hZ2VtZW50U2VydmljZS5xdWlja1NlbmQsXG5cdFx0fSwge1xuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN0YXR1czogJ3NlbnQnLFxuXHRcdFx0XHRyZXNvdXJjZTogY3JlYXRlZC5tYWluQ2hhdC5nZXQoKS5yZXNvdXJjZSxcblx0XHRcdFx0YWN0aXZpdHlCYXNlbGluZTogY3JlYXRlZC5jcmVhdGVkQXQuZ2V0VGltZSgpLFxuXHRcdFx0fSxcblx0XHRcdHF1aWNrU2VuZDoge1xuXHRcdFx0XHRvcHRpb25zOiB7IHF1ZXJ5OiAnRXhwbGFpbiB0aGlzJywgYXR0YWNoZWRDb250ZXh0OiB1bmRlZmluZWQsIGJhY2tncm91bmQ6IHRydWUgfSxcblx0XHRcdFx0Y3JlYXRlT3B0aW9uczogdW5kZWZpbmVkLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlamVjdHMgYSBtaXNzaW5nIHNlbGVjdGVkIHdvcmtzcGFjZSBwcm92aWRlciBpbnN0ZWFkIG9mIHJlcm91dGluZycsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFkYXB0ZXIuZGlzcGF0Y2hUb05ld1Nlc3Npb24oe1xuXHRcdFx0XHRmb2xkZXI6IFVSSS5maWxlKCcvd29yay9yZXBvJyksXG5cdFx0XHRcdHByb3ZpZGVySWQ6ICdtaXNzaW5nJyxcblx0XHRcdH0sICdCdWlsZCBpdCcsIHt9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0XHRyZWFzb25Db2RlOiAncHJvdmlkZXJSZW1vdmVkJyxcblx0XHRcdFx0cmVhc29uOiAnVGhlIHNlbGVjdGVkIHdvcmtzcGFjZSBwcm92aWRlciBpcyBubyBsb25nZXIgYXZhaWxhYmxlLicsXG5cdFx0XHR9KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VtZW50U2VydmljZS5mb2xkZXJTZW5kLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIHVuc3VwcG9ydGVkIHJlcXVlc3QgY29udGV4dCBpbnN0ZWFkIG9mIGRyb3BwaW5nIGl0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdwcm92aWRlcjpzZXNzaW9uJyk7XG5cdFx0bWFuYWdlbWVudFNlcnZpY2Uuc2Vzc2lvbnMgPSBbc2Vzc2lvbl07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZGFwdGVyLmRpc3BhdGNoVG9TZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCAnQ29udGludWUnLCB7XG5cdFx0XHR1c2VyU2VsZWN0ZWRUb29sczogY29uc3RPYnNlcnZhYmxlKHsgdG9vbDogZmFsc2UgfSksXG5cdFx0fSwgQ2FuY2VsbGF0aW9uVG9rZW4uTm9uZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0c3RhdHVzOiAncmVqZWN0ZWQnLFxuXHRcdFx0cmVhc29uQ29kZTogJ3Vuc3VwcG9ydGVkT3B0aW9ucycsXG5cdFx0XHRyZWFzb246ICdUaGUgc2VsZWN0ZWQgdG9vbCBjb25maWd1cmF0aW9uIGNhbm5vdCBiZSBzZW50IHRocm91Z2ggU2Vzc2lvbnMuJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlbWVudFNlcnZpY2UuZXhpc3RpbmdTZW5kLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdzZW5kcyB3aXRoIHRoZSBzZWxlY3RlZCBtb2RlbCB3aGVuIGl0cyBjb25maWd1cmF0aW9uIGNhbm5vdCBiZSBmb3J3YXJkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnNlc3Npb24nKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtzZXNzaW9uXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFkYXB0ZXIuZGlzcGF0Y2hUb1Nlc3Npb24oc2Vzc2lvbi5zZXNzaW9uSWQsICdDb250aW51ZScsIHtcblx0XHRcdHVzZXJTZWxlY3RlZE1vZGVsSWQ6ICdtb2RlbCcsXG5cdFx0XHR1c2VyU2VsZWN0ZWRNb2RlbENvbmZpZ3VyYXRpb246IHsgcmVhc29uaW5nRWZmb3J0OiAnaGlnaCcsIGNvbnRleHRTaXplOiAxXzAwMF8wMDAgfSxcblx0XHR9LCBDYW5jZWxsYXRpb25Ub2tlbi5Ob25lKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVzdWx0LFxuXHRcdFx0c2VuZDogbWFuYWdlbWVudFNlcnZpY2UuZXhpc3RpbmdTZW5kLFxuXHRcdH0sIHtcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdGF0dXM6ICdzZW50Jyxcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCkucmVzb3VyY2UsXG5cdFx0XHRcdGFjdGl2aXR5QmFzZWxpbmU6IHNlc3Npb24ubGFzdFR1cm5FbmQuZ2V0KCkhLmdldFRpbWUoKSxcblx0XHRcdH0sXG5cdFx0XHRzZW5kOiB7XG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdGNoYXQ6IHNlc3Npb24ubWFpbkNoYXQuZ2V0KCksXG5cdFx0XHRcdG9wdGlvbnM6IHsgcXVlcnk6ICdDb250aW51ZScsIGF0dGFjaGVkQ29udGV4dDogdW5kZWZpbmVkLCBiYWNrZ3JvdW5kOiB0cnVlIH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWplY3RzIGNhbmNlbGxlZCBzZW5kcyBiZWZvcmUgZGlzcGF0Y2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3ZpZGVyOnNlc3Npb24nKTtcblx0XHRtYW5hZ2VtZW50U2VydmljZS5zZXNzaW9ucyA9IFtzZXNzaW9uXTtcblx0XHRjb25zdCBjdHMgPSBuZXcgQ2FuY2VsbGF0aW9uVG9rZW5Tb3VyY2UoKTtcblx0XHRjdHMuY2FuY2VsKCk7XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBhZGFwdGVyLmRpc3BhdGNoVG9TZXNzaW9uKHNlc3Npb24uc2Vzc2lvbklkLCAnQ29udGludWUnLCB7fSwgY3RzLnRva2VuKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRzdGF0dXM6ICdyZWplY3RlZCcsXG5cdFx0XHRyZXNvdXJjZTogdW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uQ29kZTogJ2NhbmNlbGxlZCcsXG5cdFx0XHRyZWFzb246ICdUaGUgcmVxdWVzdCB3YXMgY2FuY2VsbGVkLicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZW1lbnRTZXJ2aWNlLmV4aXN0aW5nU2VuZCwgdW5kZWZpbmVkKTtcblx0XHRjdHMuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdvcGVucyBhZGFwdGVyIHJlc3VsdHMgdGhyb3VnaCBTZXNzaW9ucyBzZXJ2aWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc291cmNlID0gVVJJLnBhcnNlKCdzZXNzaW9uOi9wcm92aWRlci9zZXNzaW9uJyk7XG5cblx0XHRhd2FpdCBhZGFwdGVyLnJldmVhbFNlc3Npb24ocmVzb3VyY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChvcGVuZWQsIFtyZXNvdXJjZV0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0U2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IGNoYW5nZUVtaXR0ZXIgPSB0aGlzLl9yZWdpc3RlcihuZXcgRW1pdHRlcjxJU2Vzc2lvbnNQcm92aWRlcnNDaGFuZ2VFdmVudD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlUHJvdmlkZXJzID0gdGhpcy5jaGFuZ2VFbWl0dGVyLmV2ZW50O1xuXHRwcml2YXRlIHByb3ZpZGVyczogSVNlc3Npb25zUHJvdmlkZXJbXSA9IFtdO1xuXG5cdHNldFByb3ZpZGVycyhwcm92aWRlcnM6IElTZXNzaW9uc1Byb3ZpZGVyW10pOiB2b2lkIHtcblx0XHRjb25zdCByZW1vdmVkID0gdGhpcy5wcm92aWRlcnM7XG5cdFx0dGhpcy5wcm92aWRlcnMgPSBwcm92aWRlcnM7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoeyBhZGRlZDogcHJvdmlkZXJzLCByZW1vdmVkIH0pO1xuXHR9XG5cblx0cmVnaXN0ZXJQcm92aWRlcihwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIpIHtcblx0XHR0aGlzLnNldFByb3ZpZGVycyhbLi4udGhpcy5wcm92aWRlcnMsIHByb3ZpZGVyXSk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnNldFByb3ZpZGVycyh0aGlzLnByb3ZpZGVycy5maWx0ZXIoY2FuZGlkYXRlID0+IGNhbmRpZGF0ZSAhPT0gcHJvdmlkZXIpKSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLnByb3ZpZGVyc107XG5cdH1cblxuXHRnZXRQcm92aWRlcjxUIGV4dGVuZHMgSVNlc3Npb25zUHJvdmlkZXI+KHByb3ZpZGVySWQ6IHN0cmluZyk6IFQgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLnByb3ZpZGVycy5maW5kKHByb3ZpZGVyID0+IHByb3ZpZGVyLmlkID09PSBwcm92aWRlcklkKSBhcyBUIHwgdW5kZWZpbmVkO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhbmdlRW1pdHRlciA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZVJlY2VudFdvcmtzcGFjZXMgPSB0aGlzLmNoYW5nZUVtaXR0ZXIuZXZlbnQ7XG5cdHJlY2VudHM6IElSZWNlbnRXb3Jrc3BhY2VbXSA9IFtdO1xuXHRvd25SZWNlbnRzOiBJUmVjZW50V29ya3NwYWNlW10gPSBbXTtcblx0cmVhZG9ubHkgYWRkZWQ6IEFycmF5PHsgdXJpOiBVUkk7IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZDsgY2hlY2tlZDogYm9vbGVhbiB9PiA9IFtdO1xuXG5cdGdldFJlY2VudFdvcmtzcGFjZXMoaW5jbHVkZVZTQ29kZVJlY2VudHMgPSB0cnVlKTogSVJlY2VudFdvcmtzcGFjZVtdIHtcblx0XHRyZXR1cm4gWy4uLihpbmNsdWRlVlNDb2RlUmVjZW50cyA/IHRoaXMucmVjZW50cyA6IHRoaXMub3duUmVjZW50cyldO1xuXHR9XG5cblx0YWRkUmVjZW50V29ya3NwYWNlKHVyaTogVVJJLCBwcm92aWRlcklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIGNoZWNrZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLmFkZGVkLnB1c2goeyB1cmksIHByb3ZpZGVySWQsIGNoZWNrZWQgfSk7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxuXG5cdHJlbW92ZVJlY2VudFdvcmtzcGFjZSgpOiB2b2lkIHsgfVxuXHRjbGVhckNoZWNrZWRXb3Jrc3BhY2UoKTogdm9pZCB7IH1cblx0ZmlyZUNoYW5nZWQoKTogdm9pZCB7XG5cdFx0dGhpcy5jaGFuZ2VFbWl0dGVyLmZpcmUoKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0U2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIgPSBuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBzZXNzaW9uVHlwZXNDaGFuZ2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHZvaWQ+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgc2Vzc2lvblJlcGxhY2VkRW1pdHRlciA9IG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5zZXNzaW9uc0NoYW5nZWRFbWl0dGVyLmV2ZW50O1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25UeXBlcyA9IHRoaXMuc2Vzc2lvblR5cGVzQ2hhbmdlZEVtaXR0ZXIuZXZlbnQ7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVwbGFjZVNlc3Npb24gPSB0aGlzLnNlc3Npb25SZXBsYWNlZEVtaXR0ZXIuZXZlbnQ7XG5cblx0c2Vzc2lvbnM6IElTZXNzaW9uW10gPSBbXTtcblx0Y3JlYXRlZFNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkO1xuXHRzZW5kRXJyb3I6IEVycm9yIHwgdW5kZWZpbmVkO1xuXHRleGlzdGluZ1NlbmQ6IHsgc2Vzc2lvbjogSVNlc3Npb247IGNoYXQ6IElDaGF0OyBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zIH0gfCB1bmRlZmluZWQ7XG5cdGZvbGRlclNlbmQ6IHsgZm9sZGVyOiBVUkk7IG9wdGlvbnM6IElTZW5kUmVxdWVzdE9wdGlvbnM7IGNyZWF0ZU9wdGlvbnM6IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyB8IHVuZGVmaW5lZCB9IHwgdW5kZWZpbmVkO1xuXHRxdWlja1NlbmQ6IHsgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9uczsgY3JlYXRlT3B0aW9uczogSUNyZWF0ZU5ld1Nlc3Npb25PcHRpb25zIHwgdW5kZWZpbmVkIH0gfCB1bmRlZmluZWQ7XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnM7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuc2Vzc2lvbnMuZmluZChzZXNzaW9uID0+IHNlc3Npb24ucmVzb3VyY2UudG9TdHJpbmcoKSA9PT0gcmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdH1cblxuXHRvdmVycmlkZSBnZXRTZXNzaW9uRm9yQ2hhdFJlc291cmNlKHJlc291cmNlOiBVUkkpOiB7IHNlc3Npb246IElTZXNzaW9uOyBjaGF0OiBJQ2hhdCB9IHwgdW5kZWZpbmVkIHtcblx0XHRmb3IgKGNvbnN0IHNlc3Npb24gb2YgdGhpcy5zZXNzaW9ucykge1xuXHRcdFx0Y29uc3QgY2hhdCA9IHNlc3Npb24uY2hhdHMuZ2V0KCkuZmluZChjYW5kaWRhdGUgPT4gY2FuZGlkYXRlLnJlc291cmNlLnRvU3RyaW5nKCkgPT09IHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKGNoYXQpIHtcblx0XHRcdFx0cmV0dXJuIHsgc2Vzc2lvbiwgY2hhdCB9O1xuXHRcdFx0fVxuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgc2VuZFJlcXVlc3Qoc2Vzc2lvbjogSVNlc3Npb24sIGNoYXQ6IElDaGF0LCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0aWYgKHRoaXMuc2VuZEVycm9yKSB7XG5cdFx0XHR0aHJvdyB0aGlzLnNlbmRFcnJvcjtcblx0XHR9XG5cdFx0dGhpcy5leGlzdGluZ1NlbmQgPSB7IHNlc3Npb24sIGNoYXQsIG9wdGlvbnMgfTtcblx0fVxuXG5cdG92ZXJyaWRlIGFzeW5jIGNyZWF0ZUFuZFNlbmROZXdDaGF0UmVxdWVzdChmb2xkZXI6IFVSSSwgb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgY3JlYXRlT3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLmZvbGRlclNlbmQgPSB7IGZvbGRlciwgb3B0aW9ucywgY3JlYXRlT3B0aW9ucyB9O1xuXHRcdHJldHVybiB0aGlzLmNyZWF0ZWRTZXNzaW9uO1xuXHR9XG5cblx0b3ZlcnJpZGUgYXN5bmMgY3JlYXRlQW5kU2VuZFF1aWNrQ2hhdFJlcXVlc3Qob3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucywgY3JlYXRlT3B0aW9ucz86IElDcmVhdGVOZXdTZXNzaW9uT3B0aW9ucyk6IFByb21pc2U8SVNlc3Npb24gfCB1bmRlZmluZWQ+IHtcblx0XHR0aGlzLnF1aWNrU2VuZCA9IHsgb3B0aW9ucywgY3JlYXRlT3B0aW9ucyB9O1xuXHRcdHJldHVybiB0aGlzLmNyZWF0ZWRTZXNzaW9uO1xuXHR9XG5cblx0ZmlyZVNlc3Npb25zQ2hhbmdlZChldmVudDogSVNlc3Npb25zQ2hhbmdlRXZlbnQpOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25zQ2hhbmdlZEVtaXR0ZXIuZmlyZShldmVudCk7XG5cdH1cblxuXHRmaXJlU2Vzc2lvblJlcGxhY2VkKGZyb206IElTZXNzaW9uLCB0bzogSVNlc3Npb24pOiB2b2lkIHtcblx0XHR0aGlzLnNlc3Npb25zID0gdGhpcy5zZXNzaW9ucy5maWx0ZXIoc2Vzc2lvbiA9PiBzZXNzaW9uICE9PSBmcm9tKTtcblx0XHR0aGlzLnNlc3Npb25zLnB1c2godG8pO1xuXHRcdHRoaXMuc2Vzc2lvblJlcGxhY2VkRW1pdHRlci5maXJlKHsgZnJvbSwgdG8gfSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQge1xuXHRcdHRoaXMuc2Vzc2lvbnNDaGFuZ2VkRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXNzaW9uVHlwZXNDaGFuZ2VkRW1pdHRlci5kaXNwb3NlKCk7XG5cdFx0dGhpcy5zZXNzaW9uUmVwbGFjZWRFbWl0dGVyLmRpc3Bvc2UoKTtcblx0fVxufVxuXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHNlc3Npb25JZDogc3RyaW5nLCBvcHRpb25zOiB7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRpdGxlPzogc3RyaW5nO1xuXHRyZWFkb25seSBkZXNjcmlwdGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgcmVwb3NpdG9yeT86IHN0cmluZztcblx0cmVhZG9ubHkgc3RhdHVzPzogU2Vzc2lvblN0YXR1cztcblx0cmVhZG9ubHkgYXJjaGl2ZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBpbnRlcmFjdGl2aXR5PzogQ2hhdEludGVyYWN0aXZpdHk7XG59ID0ge30pOiBJU2Vzc2lvbiB7XG5cdGNvbnN0IHByb3ZpZGVySWQgPSBvcHRpb25zLnByb3ZpZGVySWQgPz8gJ3Byb3ZpZGVyJztcblx0Y29uc3Qgc3RhdHVzID0gb3B0aW9ucy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQ7XG5cdGNvbnN0IHJlcG9zaXRvcnkgPSBvcHRpb25zLnJlcG9zaXRvcnkgPz8gJ3JlcG8nO1xuXHRjb25zdCByZXNvdXJjZSA9IFVSSS5wYXJzZShgc2Vzc2lvbjovJHtzZXNzaW9uSWR9YCk7XG5cdGNvbnN0IGNoYXQgPSB1cGNhc3RQYXJ0aWFsPElDaGF0Pih7XG5cdFx0cmVzb3VyY2U6IFVSSS5wYXJzZShgY2hhdDovJHtzZXNzaW9uSWR9YCksXG5cdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgnMjAyNi0wOC0xM1QxMDowMDowMFonKSxcblx0XHR0aXRsZTogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMudGl0bGUgPz8gc2Vzc2lvbklkKSxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSgnMjAyNi0wOC0xM1QxMjowMDowMFonKSksXG5cdFx0c3RhdHVzOiBjb25zdE9ic2VydmFibGUoc3RhdHVzKSxcblx0XHRpc0FyY2hpdmVkOiBjb25zdE9ic2VydmFibGUob3B0aW9ucy5hcmNoaXZlZCA/PyBmYWxzZSksXG5cdFx0aW50ZXJhY3Rpdml0eTogY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMuaW50ZXJhY3Rpdml0eSA/PyBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsKSxcblx0fSk7XG5cdHJldHVybiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uPih7XG5cdFx0c2Vzc2lvbklkLFxuXHRcdHJlc291cmNlLFxuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGU6ICd0ZXN0Jyxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCcyMDI2LTA4LTEzVDEwOjAwOjAwWicpLFxuXHRcdHRpdGxlOiBjb25zdE9ic2VydmFibGUob3B0aW9ucy50aXRsZSA/PyBzZXNzaW9uSWQpLFxuXHRcdHVwZGF0ZWRBdDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCcyMDI2LTA4LTEzVDEyOjAwOjAwWicpKSxcblx0XHRzdGF0dXM6IGNvbnN0T2JzZXJ2YWJsZShzdGF0dXMpLFxuXHRcdGlzQXJjaGl2ZWQ6IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLmFyY2hpdmVkID8/IGZhbHNlKSxcblx0XHRpc0F1dG9tYXRpb246IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0ZGVzY3JpcHRpb246IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLmRlc2NyaXB0aW9uID8geyB2YWx1ZTogb3B0aW9ucy5kZXNjcmlwdGlvbiB9IDogdW5kZWZpbmVkKSxcblx0XHRsYXN0VHVybkVuZDogY29uc3RPYnNlcnZhYmxlKG5ldyBEYXRlKCcyMDI2LTA4LTEzVDEyOjAwOjAwWicpKSxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZSh7XG5cdFx0XHR1cmk6IFVSSS5maWxlKGAvd29yay8ke3JlcG9zaXRvcnl9YCksXG5cdFx0XHRsYWJlbDogcmVwb3NpdG9yeSxcblx0XHRcdGljb246IHsgaWQ6ICdmb2xkZXInIH0sXG5cdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRyb290OiBVUkkuZmlsZShgL3dvcmsvJHtyZXBvc2l0b3J5fWApLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiBVUkkuZmlsZShgL3dvcmsvJHtyZXBvc2l0b3J5fWApLFxuXHRcdFx0XHRuYW1lOiByZXBvc2l0b3J5LFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7XG5cdFx0XHRcdFx0dXJpOiBVUkkuZmlsZShgL3dvcmsvJHtyZXBvc2l0b3J5fWApLFxuXHRcdFx0XHRcdHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRnaXRIdWJJbmZvOiBjb25zdE9ic2VydmFibGUoeyBvd25lcjogJ21pY3Jvc29mdCcsIHJlcG86IHJlcG9zaXRvcnkgfSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KSxcblx0XHRjaGF0czogY29uc3RPYnNlcnZhYmxlKFtjaGF0XSksXG5cdFx0bWFpbkNoYXQ6IGNvbnN0T2JzZXJ2YWJsZShjaGF0KSxcblx0fSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVByb3ZpZGVyKGlkOiBzdHJpbmcsIG9wdGlvbnM6IHtcblx0cmVhZG9ubHkgc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXM/OiBib29sZWFuO1xuXHRyZWFkb25seSBncm91cD86IHN0cmluZztcblx0cmVhZG9ubHkgYnJvd3NlQWN0aW9ucz86IHJlYWRvbmx5IElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uW107XG5cdHJlYWRvbmx5IHNlc3Npb25zPzogcmVhZG9ubHkgSVNlc3Npb25bXTtcbn0gPSB7fSk6IElTZXNzaW9uc1Byb3ZpZGVyIHtcblx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8SVNlc3Npb25zUHJvdmlkZXI+KHtcblx0XHRpZCxcblx0XHRsYWJlbDogaWQsXG5cdFx0b3JkZXI6IDAsXG5cdFx0c3VwcG9ydHNMb2NhbFdvcmtzcGFjZXM6IG9wdGlvbnMuc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXMsXG5cdFx0YnJvd3NlQWN0aW9uczogb3B0aW9ucy5icm93c2VBY3Rpb25zID8/IFtdLFxuXHRcdG9uRGlkQ2hhbmdlU2Vzc2lvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0U2Vzc2lvbnM6ICgpID0+IFsuLi5vcHRpb25zLnNlc3Npb25zID8/IFtdXSxcblx0XHRyZXNvbHZlV29ya3NwYWNlOiAodXJpOiBVUkkpID0+IHdvcmtzcGFjZSh1cmksIHVyaS5wYXRoLnNwbGl0KCcvJykuZmlsdGVyKEJvb2xlYW4pLmF0KC0xKSA/PyB1cmkucGF0aCwgb3B0aW9ucy5ncm91cCksXG5cdH0pO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVCcm93c2VBY3Rpb24ocHJvdmlkZXJJZDogc3RyaW5nLCBncm91cDogc3RyaW5nLCBzZWxlY3Rpb246IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGxhYmVsOiAnUHJvdmlkZXIgYWN0aW9uJyxcblx0XHRncm91cCxcblx0XHRpY29uOiB7IGlkOiAnZm9sZGVyLW9wZW5lZCcgfSxcblx0XHRwcm92aWRlcklkLFxuXHRcdHJ1bjogYXN5bmMgKCkgPT4gc2VsZWN0aW9uLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB3b3Jrc3BhY2UodXJpOiBVUkksIGxhYmVsOiBzdHJpbmcsIGdyb3VwPzogc3RyaW5nKTogSVNlc3Npb25Xb3Jrc3BhY2Uge1xuXHRyZXR1cm4ge1xuXHRcdHVyaSxcblx0XHRsYWJlbCxcblx0XHRncm91cCxcblx0XHRpY29uOiB7IGlkOiAnZm9sZGVyJyB9LFxuXHRcdGZvbGRlcnM6IFt7XG5cdFx0XHRyb290OiB1cmksXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0XHRuYW1lOiBsYWJlbCxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0fV0sXG5cdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVjZW50KHdvcmtzcGFjZTogSVNlc3Npb25Xb3Jrc3BhY2UsIHByb3ZpZGVySWQ6IHN0cmluZywgY2hlY2tlZDogYm9vbGVhbik6IElSZWNlbnRXb3Jrc3BhY2Uge1xuXHRyZXR1cm4geyB3b3Jrc3BhY2UsIHByb3ZpZGVySWQsIGNoZWNrZWQgfTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQiwrQkFBK0I7QUFDM0QsU0FBUyxTQUFTLGFBQWE7QUFDL0IsU0FBUyxZQUFZLGlCQUFpQixvQkFBb0I7QUFDMUQsU0FBUyxpQkFBaUIsdUJBQXVCO0FBQ2pELFNBQVMsV0FBVztBQUNwQixTQUFTLE1BQU0scUJBQXFCO0FBQ3BDLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBRXpDLFNBQVMsd0NBQXdDO0FBR2pELFNBQVMsMEJBQTBCO0FBRW5DLFNBQVMsY0FBYywyQkFBMkI7QUFFbEQsU0FBUyx1QkFBdUI7QUFJaEMsU0FBMEIsZUFBZSxtQkFBcUUsZ0NBQWdDLCtCQUErQixzQ0FBc0M7QUFHbk4sU0FBUyxpQ0FBaUM7QUFFMUMsTUFBTSw2QkFBNkIsTUFBTTtBQUV4QyxRQUFNLFFBQVEsSUFBSSxnQkFBZ0I7QUFDbEMsTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLHdCQUFvQixNQUFNLElBQUksSUFBSSw4QkFBOEIsQ0FBQztBQUNq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
