import assert from "assert";
import { DeferredPromise, timeout } from "../../../../../base/common/async.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { Disposable, DisposableStore } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { upcastPartial } from "../../../../../base/test/common/mock.js";
import { runWithFakedTimers } from "../../../../../base/test/common/timeTravelScheduler.js";
import { IActionWidgetService } from "../../../../../platform/actionWidget/browser/actionWidget.js";
import { ActionListItemKind } from "../../../../../platform/actionWidget/browser/actionList.js";
import { RemoteAgentHostConnectionStatus, IRemoteAgentHostService, RemoteAgentHostsEnabledSettingId } from "../../../../../platform/agentHost/common/remoteAgentHostService.js";
import { IClipboardService } from "../../../../../platform/clipboard/common/clipboardService.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { IQuickInputService } from "../../../../../platform/quickinput/common/quickInput.js";
import { IStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../../../platform/telemetry/common/telemetryUtils.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { IPreferencesService } from "../../../../../workbench/services/preferences/common/preferences.js";
import { IOutputService } from "../../../../../workbench/services/output/common/output.js";
import { IUriIdentityService } from "../../../../../platform/uriIdentity/common/uriIdentity.js";
import { extUri } from "../../../../../base/common/resources.js";
import { ISessionsProvidersService } from "../../../../services/sessions/browser/sessionsProvidersService.js";
import { SESSION_WORKSPACE_GROUP_GITHUB, SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE } from "../../../../services/sessions/common/session.js";
import { WorkspacePicker } from "../../browser/sessionWorkspacePicker.js";
import { NewSessionWorkspacePreselectionSource } from "../../browser/newSessionComposerService.js";
import { ISessionsRecentWorkspacesService, SessionsRecentWorkspacesService } from "../../../../services/sessions/browser/sessionsRecentWorkspacesService.js";
import { AutomationsWorkspacePicker } from "../../../automations/browser/automationDialog.js";
import { AutomationIsolationModel } from "../../../automations/common/isolationGroupModel.js";
import { buildMobileWorkspacePickerRows, showMobileWorkspacePickerSheet } from "../../browser/mobile/mobileWorkspacePickerSheet.js";
import { IWorkspacesService } from "../../../../../platform/workspaces/common/workspaces.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { TestConfigurationService } from "../../../../../platform/configuration/test/common/testConfigurationService.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IContextViewService } from "../../../../../platform/contextview/browser/contextView.js";
import { IFileDialogService } from "../../../../../platform/dialogs/common/dialogs.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { INotificationService, NoOpNotification } from "../../../../../platform/notification/common/notification.js";
import { TestNotificationService } from "../../../../../platform/notification/test/common/testNotificationService.js";
import { AGENTIC_SIGN_IN_COMMAND_ID } from "../../../../common/sessionCommands.js";
const STORAGE_KEY_RECENT_WORKSPACES = "sessions.recentlyPickedWorkspaces";
const MOCK_PROVIDER_PATH_PREFIXES = {
  "agenthost-remote-1": "/remote",
  "local-1": "/local",
  "default-copilot": "/copilot",
  "local-agent-host": "/agent-host"
};
function createMockProvider(id, opts) {
  const pathPrefix = MOCK_PROVIDER_PATH_PREFIXES[id];
  const canResolve = (uri) => !pathPrefix || uri.path === pathPrefix || uri.path.startsWith(`${pathPrefix}/`);
  const base = {
    id,
    label: `Provider ${id}`,
    icon: Codicon.remote,
    order: 0,
    sessionTypes: [],
    onDidChangeSessionTypes: Event.None,
    browseActions: opts?.browseActions ?? [],
    resolveWorkspace: (uri) => {
      if (!canResolve(uri)) {
        return void 0;
      }
      return {
        uri,
        label: uri.path.substring(1) || uri.path,
        icon: Codicon.folder,
        folders: [{
          root: uri,
          workingDirectory: uri,
          name: uri.path.substring(1) || uri.path,
          description: void 0,
          gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      };
    },
    onDidChangeSessions: opts?.onDidChangeSessions ?? Event.None,
    getSessions: opts?.getSessions ?? (() => []),
    createNewSession: () => {
      throw new Error("Not implemented");
    },
    createQuickChat: () => {
      throw new Error("Not implemented");
    },
    deleteNewSession: () => {
    },
    getSessionTypes: () => [],
    renameChat: async () => {
    },
    renameSession: async () => {
    },
    getModelsSnapshot: () => ({ models: [], desiredModelResolution: { kind: "notRequested" }, modelTarget: void 0 }),
    getModelPickerOptions: () => ({ useGroupedModelPicker: true, showFeatured: true, showUnavailableFeatured: false, showManageModelsAction: false }),
    onDidChangeModels: Event.None,
    setModel: () => {
    },
    archiveSession: async () => {
    },
    unarchiveSession: async () => {
    },
    setSessionReadState: async () => {
    },
    deleteSession: async () => {
    },
    deleteSessions: async () => {
    },
    deleteChat: async () => true,
    createNewChat: async () => {
      throw new Error("Not implemented");
    },
    forkChat: async () => {
      throw new Error("Not implemented");
    },
    createSideChat: async () => {
      throw new Error("Not implemented");
    },
    sendRequest: async (_sessionId, _chatResource, _options) => {
      throw new Error("Not implemented");
    }
  };
  if (opts?.connectionStatus) {
    return {
      ...base,
      canConnectOnDemand: opts.canConnectOnDemand,
      connect: opts.connect,
      connectionStatus: opts.connectionStatus,
      onDidReportConnectProgress: opts.onDidReportConnectProgress,
      remoteAddress: opts.remoteAddress,
      onDidChangeSessionConfig: Event.None,
      getSessionConfig: () => void 0,
      setSessionConfigValue: async () => {
      },
      replaceSessionConfig: async () => {
      },
      getSessionConfigCompletions: async () => [],
      getCreateSessionConfig: () => void 0,
      clearSessionConfig: () => {
      },
      onDidChangeRootConfig: Event.None,
      getRootConfig: () => void 0,
      setRootConfigValue: async () => {
      },
      replaceRootConfig: async () => {
      }
    };
  }
  return base;
}
class MockSessionsProvidersService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidChangeProviders = this._register(new Emitter());
    this.onDidChangeProviders = this._onDidChangeProviders.event;
    this._providers = [];
  }
  setProviders(providers) {
    const oldProviders = this._providers;
    this._providers = providers;
    const oldIds = new Set(oldProviders.map((p) => p.id));
    const newIds = new Set(providers.map((p) => p.id));
    this._onDidChangeProviders.fire({
      added: providers.filter((p) => !oldIds.has(p.id)),
      removed: oldProviders.filter((p) => !newIds.has(p.id))
    });
  }
  getProviders() {
    return this._providers;
  }
  getProvider(providerId) {
    return this._providers.find((p) => p.id === providerId);
  }
  resolveWorkspace(folderUri, preferredProviderId) {
    if (preferredProviderId) {
      const preferred = this.getProvider(preferredProviderId);
      const workspace = preferred?.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: preferredProviderId, workspace };
      }
    }
    for (const provider of this.getProviders()) {
      const workspace = provider.resolveWorkspace(folderUri);
      if (workspace) {
        return { providerId: provider.id, workspace };
      }
    }
    return void 0;
  }
}
class RecordingNotificationHandle extends NoOpNotification {
  constructor(message) {
    super();
    this.closed = false;
    this.messages = [];
    this.messages.push(message);
  }
  updateMessage(message) {
    this.messages.push(message);
  }
  close() {
    this.closed = true;
  }
}
class RecordingNotificationService extends TestNotificationService {
  constructor() {
    super(...arguments);
    this.handles = [];
    this.errors = [];
  }
  notify(notification) {
    const handle = new RecordingNotificationHandle(notification.message);
    this.handles.push(handle);
    return handle;
  }
  error(error) {
    this.errors.push(error);
    return super.error(error);
  }
}
class DispatchingWorkspacePicker extends WorkspacePicker {
  dispatchFolder(folderUri, providerId) {
    return this._dispatchPickerItem({ folderUri, providerId });
  }
  dispatchItem(item) {
    return this._dispatchPickerItem(item);
  }
}
class TestAutomationsWorkspacePicker extends AutomationsWorkspacePicker {
  getItems() {
    return this._buildItems();
  }
  getItemStates() {
    return this.getItems().filter((entry) => entry.item).map((entry) => ({ label: entry.label ?? "", checked: entry.item?.checked === true }));
  }
  async select(label) {
    const entry = this.getItems().find((candidate) => candidate.label === label);
    assert.ok(entry?.item, `Expected picker item '${label}'`);
    await this._dispatchPickerItem(entry.item);
  }
}
function seedStorage(storageService, entries) {
  const stored = entries.map((e) => ({
    uri: e.uri.toJSON(),
    providerId: e.providerId,
    checked: e.checked
  }));
  storageService.store(STORAGE_KEY_RECENT_WORKSPACES, JSON.stringify(stored), StorageScope.PROFILE, StorageTarget.MACHINE);
}
function createTestPicker(disposables, providersService, storageService, notificationService = new TestNotificationService(), pickerCtor = WorkspacePicker, fileDialogService = {}, workspacesService = { getRecentlyOpened: async () => ({ workspaces: [], files: [] }), onDidChangeRecentlyOpened: Event.None }, recentWorkspacesService, options, fileService = upcastPartial({
  onDidChangeFileSystemProviderRegistrations: Event.None,
  hasProvider: () => true,
  exists: async () => true
})) {
  const instantiationService = disposables.add(new TestInstantiationService());
  const storage = storageService ?? disposables.add(new TestStorageService());
  instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
  }, show: () => {
  } });
  instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
  } }), hideContextView: () => {
  }, layout: () => {
  } });
  instantiationService.stub(IStorageService, storage);
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(ISessionsProvidersService, providersService);
  instantiationService.stub(IRemoteAgentHostService, {});
  instantiationService.stub(IQuickInputService, {});
  instantiationService.stub(IClipboardService, {});
  instantiationService.stub(IPreferencesService, {});
  instantiationService.stub(IOutputService, {});
  instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
  instantiationService.stub(ICommandService, { executeCommand: async () => {
  } });
  instantiationService.stub(IFileDialogService, fileDialogService);
  instantiationService.stub(IFileService, fileService);
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IMenuService, {
    createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
    } }),
    getMenuActions: () => []
  });
  instantiationService.stub(INotificationService, notificationService);
  instantiationService.stub(IWorkspacesService, workspacesService);
  instantiationService.stub(ISessionsRecentWorkspacesService, recentWorkspacesService ?? disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  return disposables.add(instantiationService.createInstance(pickerCtor, options ?? {}));
}
function createMockSession(provider, folderUri, updatedAt, options) {
  const workspace = provider.resolveWorkspace(folderUri);
  if (!workspace) {
    throw new Error(`Provider ${provider.id} cannot resolve ${folderUri.toString()}`);
  }
  const firstFolder = workspace.folders[0];
  const sessionWorkspace = options?.workTreeUri && firstFolder?.gitRepository ? {
    ...workspace,
    folders: [
      { ...firstFolder, gitRepository: { ...firstFolder.gitRepository, workTreeUri: options.workTreeUri } },
      ...workspace.folders.slice(1)
    ]
  } : workspace;
  return upcastPartial({
    providerId: provider.id,
    updatedAt: constObservable(new Date(updatedAt)),
    workspace: constObservable(sessionWorkspace),
    isQuickChat: constObservable(false),
    worktreePending: constObservable(options?.worktreePending ?? false)
  });
}
async function createResolvedRecentWorkspacesService(disposables, storageService, providersService, workspacesService) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IStorageService, storageService);
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(IWorkspacesService, workspacesService);
  instantiationService.stub(ISessionsProvidersService, providersService);
  const recentWorkspacesService = disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService));
  await new Promise((resolve) => {
    const listener = recentWorkspacesService.onDidChangeRecentWorkspaces(() => {
      listener.dispose();
      resolve();
    });
  });
  return recentWorkspacesService;
}
function assertSelectedProvider(picker, expectedProviderId, message) {
  assert.strictEqual(picker.selectedResolved?.providerId, expectedProviderId, message);
}
suite("WorkspacePicker - Connection Status", () => {
  const disposables = new DisposableStore();
  let providersService;
  setup(() => {
    providersService = new MockSessionsProvidersService();
    disposables.add(providersService);
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("restore picks checked entry even when remote is disconnected (before grace period)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assert.deepStrictEqual({
      providerId: picker.selectedResolved?.providerId,
      source: picker.preselectionSource
    }, {
      providerId: "agenthost-remote-1",
      source: NewSessionWorkspacePreselectionSource.CheckedWorkspace
    });
  });
  test("restore prioritizes the sessions' own history over VS Code's global recents", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const ownUri = URI.file("/local/own-project");
    const globalUri = URI.file("/local/global-only-project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: ownUri, providerId: "local-1", checked: false }]);
    const workspacesService = { getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }), onDidChangeRecentlyOpened: Event.None };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces().map((r) => r.workspace.uri.toString()),
      [ownUri.toString(), globalUri.toString()]
    );
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces(false).map((r) => r.workspace.uri.toString()),
      [ownUri.toString()]
    );
    const picker = createTestPicker(disposables, providersService, storage, void 0, void 0, void 0, workspacesService, recentWorkspacesService);
    assert.deepStrictEqual({
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      folderUri: ownUri.toString(),
      source: NewSessionWorkspacePreselectionSource.RecentWorkspace
    });
  });
  test("restore selects the most recent VS Code workspace when own history is empty", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const mostRecentGlobalUri = URI.file("/local/most-recent-global-project");
    const olderGlobalUri = URI.file("/local/older-global-project");
    const storage = disposables.add(new TestStorageService());
    const workspacesService = {
      getRecentlyOpened: async () => ({
        workspaces: [{ folderUri: mostRecentGlobalUri }, { folderUri: olderGlobalUri }],
        files: []
      }),
      onDidChangeRecentlyOpened: Event.None
    };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    const picker = createTestPicker(disposables, providersService, storage, void 0, void 0, void 0, workspacesService, recentWorkspacesService);
    assert.strictEqual(picker.selectedFolderUri?.toString(), mostRecentGlobalUri.toString());
  });
  test("restore selects a VS Code recent that finishes loading after picker creation", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const globalUri = URI.file("/local/global-project");
    const recentlyOpened = new DeferredPromise();
    const workspacesService = {
      getRecentlyOpened: () => recentlyOpened.p,
      onDidChangeRecentlyOpened: Event.None
    };
    const picker = createTestPicker(disposables, providersService, void 0, void 0, void 0, void 0, workspacesService);
    const initialSelection = picker.selectedFolderUri;
    assert.strictEqual(initialSelection, void 0);
    await recentlyOpened.complete({ workspaces: [{ folderUri: globalUri }], files: [] });
    assert.strictEqual(picker.selectedFolderUri?.toString(), globalUri.toString());
  });
  test("late VS Code recents do not override an explicit workspace selection", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const selectedUri = URI.file("/local/selected-project");
    const globalUri = URI.file("/local/global-project");
    const recentlyOpened = new DeferredPromise();
    const workspacesService = {
      getRecentlyOpened: () => recentlyOpened.p,
      onDidChangeRecentlyOpened: Event.None
    };
    const picker = createTestPicker(disposables, providersService, void 0, void 0, void 0, void 0, workspacesService);
    picker.setSelectedWorkspace(selectedUri, { fireEvent: false });
    await recentlyOpened.complete({ workspaces: [{ folderUri: globalUri }], files: [] });
    assert.strictEqual(picker.selectedFolderUri?.toString(), selectedUri.toString());
  });
  test("restore chooses the most frequent workspace among the 15 most recent sessions", async () => {
    let sessions = [];
    const provider = createMockProvider("local-1", { getSessions: () => sessions });
    providersService.setProviders([provider]);
    const mostFrequentRecent = URI.file("/local/recent-a");
    const mostFrequentOverall = URI.file("/local/older-b");
    const recentFolders = [
      mostFrequentRecent,
      mostFrequentOverall,
      mostFrequentRecent,
      URI.file("/local/recent-c"),
      mostFrequentRecent,
      mostFrequentOverall,
      URI.file("/local/recent-d"),
      URI.file("/local/recent-e"),
      URI.file("/local/recent-f"),
      URI.file("/local/recent-g"),
      URI.file("/local/recent-h"),
      URI.file("/local/recent-i"),
      URI.file("/local/recent-j"),
      URI.file("/local/recent-k"),
      URI.file("/local/recent-l")
    ];
    const recentSessions = recentFolders.map((folderUri, index) => createMockSession(provider, folderUri, 100 - index));
    const olderSessions = Array.from({ length: 10 }, (_, index) => createMockSession(provider, mostFrequentOverall, 50 - index));
    sessions = [...olderSessions, ...recentSessions];
    const picker = createTestPicker(disposables, providersService);
    await timeout(0);
    assert.deepStrictEqual({
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      folderUri: mostFrequentRecent.toString(),
      source: NewSessionWorkspacePreselectionSource.ExistingSessions
    });
  });
  test("restore skips missing session workspaces in frequency order", async () => {
    let sessions = [];
    const provider = createMockProvider("local-1", { getSessions: () => sessions });
    providersService.setProviders([provider]);
    const missing = URI.file("/local/missing");
    const existing = URI.file("/local/existing");
    sessions = [
      createMockSession(provider, missing, 5),
      createMockSession(provider, existing, 4),
      createMockSession(provider, missing, 3),
      createMockSession(provider, existing, 2),
      createMockSession(provider, missing, 1)
    ];
    const checked = [];
    const fileService = upcastPartial({
      onDidChangeFileSystemProviderRegistrations: Event.None,
      hasProvider: () => true,
      exists: async (resource) => {
        checked.push(resource.toString());
        return extUri.isEqual(resource, existing);
      }
    });
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      fileService
    );
    await timeout(0);
    assert.deepStrictEqual({
      checked: [...new Set(checked)],
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      checked: [missing.toString(), existing.toString()],
      folderUri: existing.toString(),
      source: NewSessionWorkspacePreselectionSource.ExistingSessions
    });
  });
  test("restore excludes pending and resolved worktree sessions using session metadata", async () => {
    let sessions = [];
    const provider = createMockProvider("local-1", { getSessions: () => sessions });
    providersService.setProviders([provider]);
    const pendingCheckout = URI.file("/local/pending-checkout");
    const resolvedWorktree = URI.file("/local/feature-checkout");
    const regularWorkspace = URI.file("/local/regular");
    sessions = [
      createMockSession(provider, pendingCheckout, 7, { worktreePending: true }),
      createMockSession(provider, pendingCheckout, 6, { worktreePending: true }),
      createMockSession(provider, pendingCheckout, 5, { worktreePending: true }),
      createMockSession(provider, resolvedWorktree, 4, { workTreeUri: resolvedWorktree }),
      createMockSession(provider, resolvedWorktree, 3, { workTreeUri: resolvedWorktree }),
      createMockSession(provider, resolvedWorktree, 2, { workTreeUri: resolvedWorktree }),
      createMockSession(provider, regularWorkspace, 1)
    ];
    const picker = createTestPicker(disposables, providersService);
    await timeout(0);
    assert.deepStrictEqual({
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      folderUri: regularWorkspace.toString(),
      source: NewSessionWorkspacePreselectionSource.ExistingSessions
    });
  });
  test("restore discards a session fallback that completes while restoration is disabled", async () => {
    let sessions = [];
    const provider = createMockProvider("local-1", { getSessions: () => sessions });
    providersService.setProviders([provider]);
    const folderUri = URI.file("/local/project");
    sessions = [createMockSession(provider, folderUri, 1)];
    const firstExists = new DeferredPromise();
    let existsCallCount = 0;
    const fileService = upcastPartial({
      hasProvider: () => true,
      exists: async () => ++existsCallCount === 1 ? firstExists.p : true
    });
    let canRestoreWorkspace = true;
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      void 0,
      { canRestoreWorkspace: () => canRestoreWorkspace },
      fileService
    );
    canRestoreWorkspace = false;
    await firstExists.complete(true);
    await timeout(0);
    const disabledSelection = picker.selectedFolderUri;
    canRestoreWorkspace = true;
    picker.refreshAutomaticSelection();
    await timeout(0);
    assert.deepStrictEqual({
      disabledSelection,
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      disabledSelection: void 0,
      folderUri: folderUri.toString(),
      source: NewSessionWorkspacePreselectionSource.ExistingSessions
    });
  });
  test("restore retries when a provider reports sessions after picker creation", async () => {
    const sessionsChanged = disposables.add(new Emitter());
    let sessions = [];
    const provider = createMockProvider("local-1", {
      getSessions: () => sessions,
      onDidChangeSessions: sessionsChanged.event
    });
    providersService.setProviders([provider]);
    const folderUri = URI.file("/local/late-session");
    const picker = createTestPicker(disposables, providersService);
    await timeout(0);
    sessions = [createMockSession(provider, folderUri, 1)];
    sessionsChanged.fire({ added: sessions, removed: [], changed: [] });
    await timeout(0);
    assert.deepStrictEqual({
      folderUri: picker.selectedFolderUri?.toString(),
      source: picker.preselectionSource
    }, {
      folderUri: folderUri.toString(),
      source: NewSessionWorkspacePreselectionSource.ExistingSessions
    });
  });
  test("shows manually picked worktree folders but filters them from VS Code recents", async () => {
    const provider = createMockProvider("provider");
    providersService.setProviders([provider]);
    const ownWorktreeUri = URI.file("/code/owned.worktrees/feature");
    const ownCopilotWorktreeUri = URI.file("/tmp/copilot-worktrees/owned-feature");
    const ownRegularUri = URI.file("/code/owned-feature");
    const globalWorktreeUri = URI.file("/code/vscode.worktrees/feature");
    const globalUppercaseWorktreeUri = URI.file("/code/VSCode.WORKTREES/other-feature");
    const globalCopilotWorktreeUri = URI.file("/tmp/copilot-worktrees/global-feature");
    const globalUppercaseCopilotWorktreeUri = URI.file("/tmp/COPILOT-WORKTREES/other-global-feature");
    const globalSimilarUri = URI.file("/code/vscode.worktrees-backup/feature");
    const globalRegularUri = URI.file("/code/vscode/feature");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: ownWorktreeUri, providerId: "provider", checked: false },
      { uri: ownCopilotWorktreeUri, providerId: "provider", checked: false },
      { uri: ownRegularUri, providerId: "provider", checked: false }
    ]);
    const workspacesService = {
      getRecentlyOpened: async () => ({
        workspaces: [
          { folderUri: globalWorktreeUri },
          { folderUri: globalUppercaseWorktreeUri },
          { folderUri: globalCopilotWorktreeUri },
          { folderUri: globalUppercaseCopilotWorktreeUri },
          { folderUri: globalSimilarUri },
          { folderUri: globalRegularUri }
        ],
        files: []
      }),
      onDidChangeRecentlyOpened: Event.None
    };
    const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
    assert.deepStrictEqual(
      recentWorkspacesService.getRecentWorkspaces().map((recent) => recent.workspace.uri.toString()),
      [ownWorktreeUri, ownCopilotWorktreeUri, ownRegularUri, globalSimilarUri, globalRegularUri].map((uri) => uri.toString())
    );
  });
  test("restore never preselects a worktree folder", async () => {
    const localProvider = createMockProvider("local-1");
    providersService.setProviders([localProvider]);
    const globalUri = URI.file("/local/global-project");
    const selected = [];
    for (const excludedUri of [
      URI.file("/local/project.worktrees/feature"),
      URI.file("/local/copilot-worktrees/feature")
    ]) {
      const storage = disposables.add(new TestStorageService());
      seedStorage(storage, [{ uri: excludedUri, providerId: "local-1", checked: true }]);
      const workspacesService = {
        getRecentlyOpened: async () => ({ workspaces: [{ folderUri: globalUri }], files: [] }),
        onDidChangeRecentlyOpened: Event.None
      };
      const recentWorkspacesService = await createResolvedRecentWorkspacesService(disposables, storage, providersService, workspacesService);
      const picker = createTestPicker(disposables, providersService, storage, void 0, void 0, void 0, workspacesService, recentWorkspacesService);
      selected.push(picker.selectedFolderUri?.toString() ?? "");
    }
    assert.deepStrictEqual(selected, [globalUri.toString(), globalUri.toString()]);
  });
  test("restored remote that never connects falls back after grace period", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection is restored synchronously");
    const events = [];
    disposables.add(picker.onDidSelectWorkspace((e) => events.push(e)));
    await timeout(1e4);
    assertSelectedProvider(picker, void 0, "Selection cleared after grace period");
    assert.deepStrictEqual(events, [void 0], "onDidSelectWorkspace fired with undefined");
  }));
  test("restored remote that connects within grace period keeps selection", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    await timeout(100);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    await timeout(500);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    await timeout(1e4);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection preserved after successful connect");
  }));
  test("user pick during connect cancels the fallback", () => runWithFakedTimers({ useFakeTimers: true }, async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    picker.setSelectedWorkspace(URI.file("/local/picked"), { fireEvent: false });
    await timeout(1e4);
    assertSelectedProvider(picker, "local-1", "User pick preserved across grace-period elapse");
  }));
  test("restore picks checked entry while remote is connecting (no fallback flicker)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
  });
  test("connecting provider that fails falls back to no selection", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection is restored while connecting");
    const events = [];
    disposables.add(picker.onDidSelectWorkspace((e) => events.push(e)));
    remoteStatus.set(RemoteAgentHostConnectionStatus.connecting, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection preserved while connecting");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    assertSelectedProvider(picker, void 0, "Selection cleared after connection failure");
    assert.deepStrictEqual(events, [void 0], "onDidSelectWorkspace fired with undefined");
  });
  test("restore picks connected remote provider", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
  });
  test("disconnect preserves selection (renders grayed; no auto-clear)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1", "Selection should be preserved on disconnect");
  });
  test("failed on-demand recent connect closes progress notification and reports error", async () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.disconnected);
    const progress = new Emitter();
    disposables.add(progress);
    let connectCalls = 0;
    const remoteProvider = createMockProvider("agenthost-remote-1", {
      connectionStatus: remoteStatus,
      canConnectOnDemand: true,
      remoteAddress: "wsl:Ubuntu-24.04",
      onDidReportConnectProgress: progress.event,
      connect: async () => {
        connectCalls++;
        progress.fire({ connectionKey: "wsl:Ubuntu-24.04", message: "Opening WSL..." });
        throw new Error("boom");
      }
    });
    const notifications = new RecordingNotificationService();
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, void 0, notifications, DispatchingWorkspacePicker);
    await picker.dispatchFolder(URI.file("/remote/project"), "agenthost-remote-1");
    assert.deepStrictEqual({
      connectCalls,
      progressClosed: notifications.handles[0]?.closed,
      progressMessages: notifications.handles[0]?.messages,
      errors: notifications.errors.map((error) => String(error)),
      selectedProvider: picker.selectedResolved?.providerId
    }, {
      connectCalls: 1,
      progressClosed: true,
      progressMessages: ["Connecting to Provider agenthost-remote-1...", "Opening WSL..."],
      errors: ["Failed to connect to Provider agenthost-remote-1."],
      selectedProvider: void 0
    });
  });
  test("preserves the chosen provider when multiple providers resolve the same URI", async () => {
    const folderUri = URI.file("/shared/project");
    const firstProvider = createMockProvider("first");
    const secondBaseProvider = createMockProvider("second");
    const secondProvider = {
      ...secondBaseProvider,
      browseActions: [{
        label: "Select...",
        group: SESSION_WORKSPACE_GROUP_GITHUB,
        icon: Codicon.folderOpened,
        providerId: "second",
        run: async () => secondBaseProvider.resolveWorkspace(folderUri)
      }]
    };
    providersService.setProviders([firstProvider, secondProvider]);
    const picker = createTestPicker(disposables, providersService, void 0, void 0, DispatchingWorkspacePicker);
    await picker.dispatchFolder(folderUri, "second");
    const directProvider = picker.selectedResolved?.providerId;
    await picker.dispatchItem({ browseActionIndex: 0 });
    assert.deepStrictEqual({
      directProvider,
      browseProvider: picker.selectedResolved?.providerId
    }, {
      directProvider: "second",
      browseProvider: "second"
    });
  });
  test("reconnect keeps the selection (no extra event fires)", () => {
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true }
    ]);
    providersService.setProviders([remoteProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "agenthost-remote-1");
    remoteStatus.set(RemoteAgentHostConnectionStatus.disconnected, void 0);
    remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
    assertSelectedProvider(picker, "agenthost-remote-1");
    assert.strictEqual(
      picker.selectedResolved?.workspace.folders[0]?.root.path,
      "/remote/project"
    );
  });
  test("checked is globally unique after persist", () => {
    const localProvider = createMockProvider("local-1");
    const remoteStatus = observableValue("status", RemoteAgentHostConnectionStatus.connected);
    const remoteProvider = createMockProvider("agenthost-remote-1", { connectionStatus: remoteStatus });
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/remote/project"), providerId: "agenthost-remote-1", checked: true },
      { uri: URI.file("/local/project"), providerId: "local-1", checked: false }
    ]);
    providersService.setProviders([remoteProvider, localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const resolvedWorkspace = localProvider.resolveWorkspace(URI.file("/local/project"));
    assert.ok(resolvedWorkspace, "resolveWorkspace should resolve file:// URIs");
    picker.setSelectedWorkspace(URI.file("/local/project"), { fireEvent: false });
    const raw = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
    assert.ok(raw, "Storage should have recent workspaces");
    const stored = JSON.parse(raw);
    const checkedEntries = stored.filter((e) => e.checked);
    assert.strictEqual(checkedEntries.length, 1, "Only one entry should be checked");
    assert.strictEqual(checkedEntries[0].uri.path, "/local/project", "The local entry should be checked");
  });
  test("programmatic workspace initialization can avoid persisting recents", () => {
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    providersService.setProviders([localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const folder = URI.file("/local/proposed");
    picker.setSelectedWorkspace(folder, { fireEvent: false, persist: false });
    assert.deepStrictEqual({
      selected: picker.selectedFolderUri?.toString(),
      stored: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE)
    }, {
      selected: folder.toString(),
      stored: void 0
    });
  });
  test("local provider is never treated as unavailable", () => {
    const localProvider = createMockProvider("local-1");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/local/project"), providerId: "local-1", checked: true }
    ]);
    providersService.setProviders([localProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, "local-1", "Local provider workspace should always be selectable");
  });
  test("restore picks the stored workspace when its provider registers after another provider", () => {
    const copilotProvider = createMockProvider("default-copilot");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/copilot/old-project"), providerId: "default-copilot", checked: false },
      { uri: URI.file("/agent-host/project"), providerId: "local-agent-host", checked: true }
    ]);
    providersService.setProviders([copilotProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    const agentHostProvider = createMockProvider("local-agent-host");
    providersService.setProviders([copilotProvider, agentHostProvider]);
    assertSelectedProvider(picker, "local-agent-host", "Stored workspace should be restored once its provider registers");
  });
  test("late-registering provider does not move selection out from under user", () => {
    const copilotProvider = createMockProvider("default-copilot");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: URI.file("/agent-host/project"), providerId: "local-agent-host", checked: true }
    ]);
    providersService.setProviders([copilotProvider]);
    const picker = createTestPicker(disposables, providersService, storage);
    assertSelectedProvider(picker, void 0, "No fallback while checked entry pending");
    picker.setSelectedWorkspace(URI.file("/copilot/picked"), { fireEvent: false });
    assertSelectedProvider(picker, "default-copilot", "User pick is honored");
    const agentHostProvider = createMockProvider("local-agent-host");
    providersService.setProviders([copilotProvider, agentHostProvider]);
    assertSelectedProvider(picker, "default-copilot", "User selection is preserved across late provider registration");
  });
});
suite("AutomationsWorkspacePicker", () => {
  const disposables = new DisposableStore();
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("selects No workspace and restores a folder through the same picker", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const folderUri = URI.file("/local/project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: folderUri, providerId: provider.id, checked: true }]);
    providersService.setProviders([provider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const state = {
      isQuickChat: false,
      folderUri,
      isolationMode: "workspace",
      branch: void 0
    };
    const model = new AutomationIsolationModel(state);
    picker.setTargetModel(model);
    const container = document.createElement("div");
    picker.render(container);
    const readPresentation = () => ({
      triggerLabel: container.querySelector(".sessions-chat-dropdown-label")?.textContent,
      triggerAriaLabel: container.querySelector(".action-label")?.getAttribute("aria-label"),
      items: picker.getItemStates().filter((item) => item.label === "No workspace" || item.label === "local/project"),
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri?.toString()
    });
    const workspace = readPresentation();
    await picker.select("No workspace");
    const noWorkspace = readPresentation();
    await picker.select("local/project");
    assert.deepStrictEqual({
      workspace,
      noWorkspace,
      restoredWorkspace: readPresentation()
    }, {
      workspace: {
        triggerLabel: "local/project",
        triggerAriaLabel: "Automation target, local/project",
        items: [
          { label: "No workspace", checked: false },
          { label: "local/project", checked: true }
        ],
        isQuickChat: false,
        folderUri: folderUri.toString()
      },
      noWorkspace: {
        triggerLabel: "No workspace",
        triggerAriaLabel: "Automation target, No workspace",
        items: [
          { label: "No workspace", checked: true },
          { label: "local/project", checked: false }
        ],
        isQuickChat: true,
        folderUri: void 0
      },
      restoredWorkspace: {
        triggerLabel: "local/project",
        triggerAriaLabel: "Automation target, local/project",
        items: [
          { label: "No workspace", checked: false },
          { label: "local/project", checked: true }
        ],
        isQuickChat: false,
        folderUri: folderUri.toString()
      }
    });
  });
  test("user workspace selections do not update recent workspaces", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const originalFolder = URI.file("/local/original");
    const proposedFolder = URI.file("/local/proposed");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: originalFolder, providerId: provider.id, checked: true },
      { uri: proposedFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const before = storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    picker.setTargetModel(new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: originalFolder,
      isolationMode: "workspace",
      branch: void 0
    }));
    await picker.select("local/proposed");
    assert.deepStrictEqual({
      selected: picker.selectedFolderUri?.toString(),
      storageUnchanged: storage.get(STORAGE_KEY_RECENT_WORKSPACES, StorageScope.PROFILE) === before
    }, {
      selected: proposedFolder.toString(),
      storageUnchanged: true
    });
  });
  test("keeps the previous workspace when trust is declined", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const selectedFolder = URI.file("/local/selected");
    const candidateFolder = URI.file("/local/candidate");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: selectedFolder, providerId: provider.id, checked: true },
      { uri: candidateFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const trustRequests = [];
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      {},
      void 0,
      void 0,
      {
        canSelectWorkspace: async (folderUri, providerId) => {
          trustRequests.push({ folderUri: folderUri.toString(), providerId });
          return false;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: selectedFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("local/candidate");
    assert.deepStrictEqual({
      trustRequests,
      modelFolderUri: model.folderUri?.toString(),
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      trustRequests: [{ folderUri: candidateFolder.toString(), providerId: provider.id }],
      modelFolderUri: selectedFolder.toString(),
      pickerFolderUri: selectedFolder.toString()
    });
  });
  test("a stale trust grant cannot override a newer No workspace choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = createMockProvider("local-1");
    const selectedFolder = URI.file("/local/selected");
    const candidateFolder = URI.file("/local/candidate");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: selectedFolder, providerId: provider.id, checked: true },
      { uri: candidateFolder, providerId: provider.id, checked: false }
    ]);
    providersService.setProviders([provider]);
    const trustResult = new DeferredPromise();
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      {},
      void 0,
      void 0,
      { canSelectWorkspace: () => trustResult.p }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: selectedFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("local/candidate");
    await picker.select("No workspace");
    await trustResult.complete(true);
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: selectedFolder.toString()
    });
  });
  test("a stale remote selection cannot override a newer No workspace choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const localProvider = createMockProvider("local-1");
    const remoteStatus = observableValue("remoteStatus", RemoteAgentHostConnectionStatus.disconnected);
    const connectStarted = new DeferredPromise();
    const finishConnect = new DeferredPromise();
    const remoteProvider = createMockProvider("agenthost-remote-1", {
      connectionStatus: remoteStatus,
      canConnectOnDemand: true,
      connect: async () => {
        await connectStarted.complete();
        await finishConnect.p;
        remoteStatus.set(RemoteAgentHostConnectionStatus.connected, void 0);
      }
    });
    const localFolder = URI.file("/local/project");
    const remoteFolder = URI.file("/remote/project");
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [
      { uri: localFolder, providerId: localProvider.id, checked: true },
      { uri: remoteFolder, providerId: remoteProvider.id, checked: false }
    ]);
    providersService.setProviders([localProvider, remoteProvider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      storage,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const model = new AutomationIsolationModel({
      isQuickChat: false,
      folderUri: localFolder,
      isolationMode: "workspace",
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("remote/project");
    await connectStarted.p;
    await picker.select("No workspace");
    await finishConnect.complete();
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri?.toString()
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: localFolder.toString()
    });
  });
  test("browsing to a folder exits No workspace mode", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const fallbackProvider = createMockProvider("fallback");
    const localProvider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const producingProvider = { ...createMockProvider("local-agent-host"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/agent-host/browsed");
    providersService.setProviders([fallbackProvider, localProvider, producingProvider]);
    const trustRequests = [];
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: async () => [browsedFolder] },
      void 0,
      void 0,
      {
        canSelectWorkspace: async (folderUri, providerId) => {
          trustRequests.push({ folderUri: folderUri.toString(), providerId });
          return true;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("Select...");
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri?.toString(),
      pickerFolderUri: picker.selectedFolderUri?.toString(),
      trustRequests
    }, {
      isQuickChat: false,
      folderUri: browsedFolder.toString(),
      pickerFolderUri: browsedFolder.toString(),
      trustRequests: [{ folderUri: browsedFolder.toString(), providerId: producingProvider.id }]
    });
  });
  test("stays in No workspace mode when trust is declined for a browsed folder", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/local/browsed");
    providersService.setProviders([provider]);
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: async () => [browsedFolder] },
      void 0,
      void 0,
      { canSelectWorkspace: async () => false }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    await picker.select("Select...");
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: void 0
    });
  });
  test("a stale browse result does not request trust after a newer choice", async () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const provider = { ...createMockProvider("local-1"), supportsLocalWorkspaces: true };
    const browsedFolder = URI.file("/local/browsed");
    const browseResult = new DeferredPromise();
    providersService.setProviders([provider]);
    let trustRequestCount = 0;
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker,
      { showOpenDialog: () => browseResult.p },
      void 0,
      void 0,
      {
        canSelectWorkspace: async () => {
          trustRequestCount++;
          return true;
        }
      }
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    const staleSelection = picker.select("Select...");
    await picker.select("No workspace");
    await browseResult.complete([browsedFolder]);
    await staleSelection;
    assert.deepStrictEqual({
      isQuickChat: model.isQuickChat,
      folderUri: model.folderUri,
      pickerFolderUri: picker.selectedFolderUri,
      trustRequestCount
    }, {
      isQuickChat: true,
      folderUri: void 0,
      pickerFolderUri: void 0,
      trustRequestCount: 0
    });
  });
  test("No workspace is represented as a checked mobile sheet row", () => {
    const providersService = disposables.add(new MockSessionsProvidersService());
    const picker = createTestPicker(
      disposables,
      providersService,
      void 0,
      new TestNotificationService(),
      TestAutomationsWorkspacePicker
    );
    const model = new AutomationIsolationModel({
      isQuickChat: true,
      folderUri: void 0,
      isolationMode: void 0,
      branch: void 0
    });
    picker.setTargetModel(model);
    const rows = buildMobileWorkspacePickerRows(picker.getItems(), () => {
    });
    assert.deepStrictEqual(rows.map((row) => row.sheetItem), [{
      id: "item:0",
      label: "No workspace",
      description: "Run without a backing workspace",
      icon: Codicon.commentDiscussion,
      checked: true,
      disabled: void 0,
      sectionTitle: void 0
    }]);
  });
  test("mobile workspace header action dispatches browsing after the sheet closes", async () => {
    const workbench = document.createElement("div");
    document.body.append(workbench);
    disposables.add({ dispose: () => workbench.remove() });
    const trigger = workbench.appendChild(document.createElement("button"));
    const dispatched = [];
    const sheet = showMobileWorkspacePickerSheet(
      upcastPartial({ mainContainer: workbench }),
      trigger,
      [
        {
          kind: ActionListItemKind.Action,
          label: "No workspace",
          group: { title: "", icon: Codicon.commentDiscussion },
          item: { run: () => {
          } }
        },
        {
          kind: ActionListItemKind.Action,
          label: "Select...",
          group: { title: "", icon: Codicon.folderOpened },
          item: { browseActionIndex: 0 }
        }
      ],
      (item) => dispatched.push(item),
      [makeBrowseAction("local-1", SESSION_WORKSPACE_GROUP_LOCAL, "Select...")]
    );
    const headerAction = workbench.querySelector(".mobile-picker-sheet-header-action");
    assert.ok(headerAction);
    headerAction.click();
    await sheet;
    assert.deepStrictEqual(dispatched, [{ browseActionIndex: 0 }]);
  });
});
class TestablePicker extends WorkspacePicker {
  getAvailableTabs() {
    return this._getAvailableTabs().map((t) => t.id);
  }
  selectWorkspaceGroup(group) {
    this._selectWorkspaceGroup(group);
  }
  getItems() {
    return this._buildItems();
  }
  getItemLabels() {
    return this.getItems().flatMap((entry) => entry.label ? [entry.label] : []);
  }
  async select(label) {
    const entry = this.getItems().find((candidate) => candidate.label === label);
    assert.ok(entry?.item, `Expected picker item '${label}'`);
    await this._dispatchPickerItem(entry.item);
  }
}
function makeBrowseAction(providerId, group, label = "browse") {
  return {
    label,
    group,
    icon: Codicon.folder,
    providerId,
    run: async () => void 0
  };
}
function createTestablePicker(disposables, providersService, remoteAgentHostsEnabled = true, options = {}, commandService = { executeCommand: async () => {
} }, storageService = disposables.add(new TestStorageService())) {
  const instantiationService = disposables.add(new TestInstantiationService());
  instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
  }, show: () => {
  } });
  instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
  } }), hideContextView: () => {
  }, layout: () => {
  } });
  instantiationService.stub(IStorageService, storageService);
  instantiationService.stub(IUriIdentityService, { extUri });
  instantiationService.stub(ISessionsProvidersService, providersService);
  instantiationService.stub(IRemoteAgentHostService, {});
  instantiationService.stub(IQuickInputService, {});
  instantiationService.stub(IClipboardService, {});
  instantiationService.stub(IPreferencesService, {});
  instantiationService.stub(IOutputService, {});
  instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: remoteAgentHostsEnabled }));
  instantiationService.stub(ICommandService, commandService);
  instantiationService.stub(IFileDialogService, {});
  instantiationService.stub(IFileService, upcastPartial({
    onDidChangeFileSystemProviderRegistrations: Event.None,
    hasProvider: () => true,
    exists: async () => true
  }));
  instantiationService.stub(IContextKeyService, new MockContextKeyService());
  instantiationService.stub(IMenuService, {
    createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
    } }),
    getMenuActions: () => []
  });
  instantiationService.stub(INotificationService, new TestNotificationService());
  instantiationService.stub(IWorkspacesService, {
    getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
    onDidChangeRecentlyOpened: Event.None
  });
  instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
  instantiationService.stub(ITelemetryService, NullTelemetryService);
  return disposables.add(instantiationService.createInstance(TestablePicker, options));
}
suite("WorkspacePicker - Tab discovery", () => {
  const disposables = new DisposableStore();
  let providersService;
  setup(() => {
    providersService = new MockSessionsProvidersService();
    disposables.add(providersService);
  });
  teardown(() => disposables.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("returns Remote group even when no providers contribute groups", () => {
    providersService.setProviders([createMockProvider("p1")]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("hides Remote group when remote agent hosts are disabled", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_REMOTE)] })
    ]);
    const picker = createTestablePicker(disposables, providersService, false);
    assert.deepStrictEqual(picker.getAvailableTabs(), []);
  });
  test("orders well-known groups Local first, then alphabetical", () => {
    providersService.setProviders([
      createMockProvider("remote", { browseActions: [makeBrowseAction("remote", SESSION_WORKSPACE_GROUP_REMOTE)] }),
      createMockProvider("cloud", { browseActions: [makeBrowseAction("cloud", "Cloud")] }),
      createMockProvider("local", { browseActions: [makeBrowseAction("local", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, "Cloud", SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("deduplicates groups contributed by multiple providers / actions", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] }),
      createMockProvider("p2", { browseActions: [makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_LOCAL), makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("appends custom group labels after Local", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", "Custom A"), makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] }),
      createMockProvider("p2", { browseActions: [makeBrowseAction("p2", "Custom B"), makeBrowseAction("p2", SESSION_WORKSPACE_GROUP_REMOTE)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    const tabs = picker.getAvailableTabs();
    assert.strictEqual(tabs[0], SESSION_WORKSPACE_GROUP_LOCAL);
    assert.deepStrictEqual(tabs.slice(1).sort(), ["Custom A", "Custom B", SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("ignores browse actions without a group", () => {
    providersService.setProviders([
      createMockProvider("p1", { browseActions: [makeBrowseAction("p1", void 0), makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_LOCAL)] })
    ]);
    const picker = createTestablePicker(disposables, providersService);
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_LOCAL, SESSION_WORKSPACE_GROUP_REMOTE]);
  });
  test("shows a sign-in action in the GitHub group", async () => {
    const executedCommands = [];
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: URI.file("/recent-repository"), providerId: "p1", checked: true }]);
    const baseProvider = createMockProvider("p1", { browseActions: [makeBrowseAction("p1", SESSION_WORKSPACE_GROUP_GITHUB)] });
    providersService.setProviders([
      {
        ...baseProvider,
        resolveWorkspace: (uri) => {
          const workspace = baseProvider.resolveWorkspace(uri);
          return workspace ? { ...workspace, group: SESSION_WORKSPACE_GROUP_GITHUB } : void 0;
        }
      }
    ]);
    const picker = createTestablePicker(disposables, providersService, false, {
      restoreFromSessions: false,
      getWorkspaceGroupAction: (group) => group === SESSION_WORKSPACE_GROUP_GITHUB ? {
        label: "Sign in to GitHub",
        icon: Codicon.signIn,
        commandId: AGENTIC_SIGN_IN_COMMAND_ID,
        hideWorkspaceItems: true
      } : void 0
    }, {
      executeCommand: async (commandId) => {
        executedCommands.push(commandId);
      }
    }, storage);
    picker.selectWorkspaceGroup(SESSION_WORKSPACE_GROUP_GITHUB);
    await picker.select("Sign in to GitHub");
    assert.deepStrictEqual({
      tabs: picker.getAvailableTabs(),
      itemLabels: picker.getItemLabels(),
      executedCommands
    }, {
      tabs: [SESSION_WORKSPACE_GROUP_GITHUB],
      itemLabels: ["Sign in to GitHub"],
      executedCommands: [AGENTIC_SIGN_IN_COMMAND_ID]
    });
  });
  test("discovers groups from recent workspaces does not add extra tabs", () => {
    const provider = {
      ...createMockProvider("p1"),
      resolveWorkspace: (uri) => ({
        uri,
        label: uri.path,
        icon: Codicon.folder,
        group: "Cloud",
        folders: [{
          root: uri,
          workingDirectory: uri,
          name: uri.path,
          description: void 0,
          gitRepository: { uri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: constObservable(void 0) }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      })
    };
    const storage = disposables.add(new TestStorageService());
    seedStorage(storage, [{ uri: URI.file("/repo"), providerId: "p1", checked: false }]);
    providersService.setProviders([provider]);
    const instantiationService = disposables.add(new TestInstantiationService());
    instantiationService.stub(IActionWidgetService, { isVisible: false, hide: () => {
    }, show: () => {
    } });
    instantiationService.stub(IContextViewService, { showContextView: () => ({ close: () => {
    } }), hideContextView: () => {
    }, layout: () => {
    } });
    instantiationService.stub(IStorageService, storage);
    instantiationService.stub(IUriIdentityService, { extUri });
    instantiationService.stub(ISessionsProvidersService, providersService);
    instantiationService.stub(IRemoteAgentHostService, {});
    instantiationService.stub(IQuickInputService, {});
    instantiationService.stub(IClipboardService, {});
    instantiationService.stub(IPreferencesService, {});
    instantiationService.stub(IOutputService, {});
    instantiationService.stub(IConfigurationService, new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true }));
    instantiationService.stub(ICommandService, { executeCommand: async () => {
    } });
    instantiationService.stub(IFileDialogService, {});
    instantiationService.stub(IFileService, upcastPartial({
      onDidChangeFileSystemProviderRegistrations: Event.None,
      hasProvider: () => true,
      exists: async () => true
    }));
    instantiationService.stub(IContextKeyService, new MockContextKeyService());
    instantiationService.stub(IMenuService, { createMenu: () => ({ onDidChange: Event.None, getActions: () => [], dispose: () => {
    } }) });
    instantiationService.stub(IWorkspacesService, {
      getRecentlyOpened: async () => ({ workspaces: [], files: [] }),
      onDidChangeRecentlyOpened: Event.None
    });
    instantiationService.stub(ISessionsRecentWorkspacesService, disposables.add(instantiationService.createInstance(SessionsRecentWorkspacesService)));
    instantiationService.stub(ITelemetryService, NullTelemetryService);
    const picker = disposables.add(instantiationService.createInstance(TestablePicker, {}));
    assert.deepStrictEqual(picker.getAvailableTabs(), [SESSION_WORKSPACE_GROUP_REMOTE]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhdFxcdGVzdFxcYnJvd3Nlclxcc2Vzc2lvbldvcmtzcGFjZVBpY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlLCB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZVN0b3JlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyB1cGNhc3RQYXJ0aWFsIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IHJ1bldpdGhGYWtlZFRpbWVycyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdGltZVRyYXZlbFNjaGVkdWxlci5qcyc7XG5pbXBvcnQgeyBJQWN0aW9uV2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbldpZGdldC9icm93c2VyL2FjdGlvbldpZGdldC5qcyc7XG5pbXBvcnQgeyBBY3Rpb25MaXN0SXRlbUtpbmQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25XaWRnZXQvYnJvd3Nlci9hY3Rpb25MaXN0LmpzJztcbmltcG9ydCB7IFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMsIElSZW1vdGVBZ2VudEhvc3RTZXJ2aWNlLCBSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vcmVtb3RlQWdlbnRIb3N0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ2xpcGJvYXJkU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NsaXBib2FyZC9jb21tb24vY2xpcGJvYXJkU2VydmljZS5qcyc7XG5pbXBvcnQgeyBUZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL3Rlc3QvY29tbW9uL2luc3RhbnRpYXRpb25TZXJ2aWNlTW9jay5qcyc7XG5pbXBvcnQgeyBJUXVpY2tJbnB1dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9xdWlja2lucHV0L2NvbW1vbi9xdWlja0lucHV0LmpzJztcbmltcG9ydCB7IElTdG9yYWdlU2VydmljZSwgU3RvcmFnZVNjb3BlLCBTdG9yYWdlVGFyZ2V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vc3RvcmFnZS9jb21tb24vc3RvcmFnZS5qcyc7XG5pbXBvcnQgeyBJVGVsZW1ldHJ5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RlbGVtZXRyeS9jb21tb24vdGVsZW1ldHJ5LmpzJztcbmltcG9ydCB7IE51bGxUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnlVdGlscy5qcyc7XG5pbXBvcnQgeyBUZXN0U3RvcmFnZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvdGVzdC9jb21tb24vd29ya2JlbmNoVGVzdFNlcnZpY2VzLmpzJztcbmltcG9ydCB7IElQcmVmZXJlbmNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi93b3JrYmVuY2gvc2VydmljZXMvcHJlZmVyZW5jZXMvY29tbW9uL3ByZWZlcmVuY2VzLmpzJztcbmltcG9ydCB7IElPdXRwdXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vd29ya2JlbmNoL3NlcnZpY2VzL291dHB1dC9jb21tb24vb3V0cHV0LmpzJztcbmltcG9ydCB7IElVcmlJZGVudGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS91cmlJZGVudGl0eS9jb21tb24vdXJpSWRlbnRpdHkuanMnO1xuaW1wb3J0IHsgZXh0VXJpIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcmVzb3VyY2VzLmpzJztcbmltcG9ydCB7IElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50LCBJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlbmRSZXF1ZXN0T3B0aW9ucywgSVNlc3Npb25DaGFuZ2VFdmVudCwgSVNlc3Npb25zUHJvdmlkZXIgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNQcm92aWRlci5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlciB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RTZXNzaW9uc1Byb3ZpZGVyLmpzJztcbmltcG9ydCB7IElTZXNzaW9uLCBJU2Vzc2lvbldvcmtzcGFjZSwgSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24sIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiwgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VQaWNrZXJJdGVtLCBJV29ya3NwYWNlUGlja2VyT3B0aW9ucywgV29ya3NwYWNlUGlja2VyIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9zZXNzaW9uV29ya3NwYWNlUGlja2VyLmpzJztcbmltcG9ydCB7IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UgfSBmcm9tICcuLi8uLi9icm93c2VyL25ld1Nlc3Npb25Db21wb3NlclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsIFNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9icm93c2VyL3Nlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIgfSBmcm9tICcuLi8uLi8uLi9hdXRvbWF0aW9ucy9icm93c2VyL2F1dG9tYXRpb25EaWFsb2cuanMnO1xuaW1wb3J0IHsgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsIH0gZnJvbSAnLi4vLi4vLi4vYXV0b21hdGlvbnMvY29tbW9uL2lzb2xhdGlvbkdyb3VwTW9kZWwuanMnO1xuaW1wb3J0IHsgYnVpbGRNb2JpbGVXb3Jrc3BhY2VQaWNrZXJSb3dzLCBzaG93TW9iaWxlV29ya3NwYWNlUGlja2VyU2hlZXQgfSBmcm9tICcuLi8uLi9icm93c2VyL21vYmlsZS9tb2JpbGVXb3Jrc3BhY2VQaWNrZXJTaGVldC5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoTGF5b3V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2VzU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZXMvY29tbW9uL3dvcmtzcGFjZXMuanMnO1xuaW1wb3J0IHsgSUNvbmZpZ3VyYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29uZmlndXJhdGlvbi9jb21tb24vY29uZmlndXJhdGlvbi5qcyc7XG5pbXBvcnQgeyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb25maWd1cmF0aW9uL3Rlc3QvY29tbW9uL3Rlc3RDb25maWd1cmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29tbWFuZFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9jb21tYW5kcy9jb21tb24vY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbnRleHR2aWV3L2Jyb3dzZXIvY29udGV4dFZpZXcuanMnO1xuaW1wb3J0IHsgSUZpbGVEaWFsb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vZGlhbG9ncy9jb21tb24vZGlhbG9ncy5qcyc7XG5pbXBvcnQgeyBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBNb2NrQ29udGV4dEtleVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9rZXliaW5kaW5nL3Rlc3QvY29tbW9uL21vY2tLZXliaW5kaW5nU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJTWVudVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY3Rpb25zL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IElOb3RpZmljYXRpb24sIElOb3RpZmljYXRpb25IYW5kbGUsIElOb3RpZmljYXRpb25TZXJ2aWNlLCBOb09wTm90aWZpY2F0aW9uLCBOb3RpZmljYXRpb25NZXNzYWdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbm90aWZpY2F0aW9uL2NvbW1vbi9ub3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHsgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9ub3RpZmljYXRpb24vdGVzdC9jb21tb24vdGVzdE5vdGlmaWNhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQUdFTlRJQ19TSUdOX0lOX0NPTU1BTkRfSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbW1hbmRzLmpzJztcblxuLy8gLS0tLSBTdG9yYWdlIGtleSAobXVzdCBtYXRjaCB0aGUgb25lIGluIHNlc3Npb25Xb3Jrc3BhY2VQaWNrZXIudHMpIC0tLS0tLS0tLS1cbmNvbnN0IFNUT1JBR0VfS0VZX1JFQ0VOVF9XT1JLU1BBQ0VTID0gJ3Nlc3Npb25zLnJlY2VudGx5UGlja2VkV29ya3NwYWNlcyc7XG5cbi8vIC0tLS0gTW9jayBwcm92aWRlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8vIE1hcHMgbW9jayBwcm92aWRlciBpZCBcdTIxOTIgVVJJIHBhdGggcHJlZml4IGl0IHJlc29sdmVzLiBJbiBwcm9kdWN0aW9uLCB0aGVcbi8vIFVSSSdzIGF1dGhvcml0eS9zY2hlbWUgZGV0ZXJtaW5lcyB3aGljaCBwcm92aWRlciBjYW4gcmVzb2x2ZSBpdDsgdGhlXG4vLyB0ZXN0cyB1c2UgZmlsZSBVUklzIG9ubHksIHNvIHdlIG1hcCBwcm92aWRlciBpZHMgdG8gdGhlaXIgY29udmVudGlvbmFsXG4vLyBwYXRoIHJvb3RzIChlLmcuIC9yZW1vdGUsIC9sb2NhbCwgL2NvcGlsb3QsIC9hZ2VudC1ob3N0KS5cbmNvbnN0IE1PQ0tfUFJPVklERVJfUEFUSF9QUkVGSVhFUzogUmVjb3JkPHN0cmluZywgc3RyaW5nPiA9IHtcblx0J2FnZW50aG9zdC1yZW1vdGUtMSc6ICcvcmVtb3RlJyxcblx0J2xvY2FsLTEnOiAnL2xvY2FsJyxcblx0J2RlZmF1bHQtY29waWxvdCc6ICcvY29waWxvdCcsXG5cdCdsb2NhbC1hZ2VudC1ob3N0JzogJy9hZ2VudC1ob3N0Jyxcbn07XG5cbmZ1bmN0aW9uIGNyZWF0ZU1vY2tQcm92aWRlcihpZDogc3RyaW5nLCBvcHRzPzoge1xuXHRjb25uZWN0aW9uU3RhdHVzPzogSVNldHRhYmxlT2JzZXJ2YWJsZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPjtcblx0YnJvd3NlQWN0aW9ucz86IHJlYWRvbmx5IElTZXNzaW9uV29ya3NwYWNlQnJvd3NlQWN0aW9uW107XG5cdGNhbkNvbm5lY3RPbkRlbWFuZD86IGJvb2xlYW47XG5cdGNvbm5lY3Q/OiAoKSA9PiBQcm9taXNlPHZvaWQ+O1xuXHRvbkRpZFJlcG9ydENvbm5lY3RQcm9ncmVzcz86IEV2ZW50PHsgcmVhZG9ubHkgY29ubmVjdGlvbktleTogc3RyaW5nOyByZWFkb25seSBtZXNzYWdlOiBzdHJpbmcgfT47XG5cdHJlbW90ZUFkZHJlc3M/OiBzdHJpbmc7XG5cdGdldFNlc3Npb25zPzogKCkgPT4gSVNlc3Npb25bXTtcblx0b25EaWRDaGFuZ2VTZXNzaW9ucz86IEV2ZW50PElTZXNzaW9uQ2hhbmdlRXZlbnQ+O1xufSk6IElTZXNzaW9uc1Byb3ZpZGVyIHtcblx0Y29uc3QgcGF0aFByZWZpeCA9IE1PQ0tfUFJPVklERVJfUEFUSF9QUkVGSVhFU1tpZF07XG5cdGNvbnN0IGNhblJlc29sdmUgPSAodXJpOiBVUkkpID0+ICFwYXRoUHJlZml4IHx8IHVyaS5wYXRoID09PSBwYXRoUHJlZml4IHx8IHVyaS5wYXRoLnN0YXJ0c1dpdGgoYCR7cGF0aFByZWZpeH0vYCk7XG5cdGNvbnN0IGJhc2UgPSB7XG5cdFx0aWQsXG5cdFx0bGFiZWw6IGBQcm92aWRlciAke2lkfWAsXG5cdFx0aWNvbjogQ29kaWNvbi5yZW1vdGUsXG5cdFx0b3JkZXI6IDAsXG5cdFx0c2Vzc2lvblR5cGVzOiBbXSxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25UeXBlczogRXZlbnQuTm9uZSxcblx0XHRicm93c2VBY3Rpb25zOiBvcHRzPy5icm93c2VBY3Rpb25zID8/IFtdLFxuXHRcdHJlc29sdmVXb3Jrc3BhY2U6ICh1cmk6IFVSSSk6IElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkID0+IHtcblx0XHRcdGlmICghY2FuUmVzb2x2ZSh1cmkpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGxhYmVsOiB1cmkucGF0aC5zdWJzdHJpbmcoMSkgfHwgdXJpLnBhdGgsXG5cdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0XHRcdFx0bmFtZTogdXJpLnBhdGguc3Vic3RyaW5nKDEpIHx8IHVyaS5wYXRoLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmksIHdvcmtUcmVlVXJpOiB1bmRlZmluZWQsIGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsIGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpIH0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHRcdH07XG5cdFx0fSxcblx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBvcHRzPy5vbkRpZENoYW5nZVNlc3Npb25zID8/IEV2ZW50Lk5vbmUsXG5cdFx0Z2V0U2Vzc2lvbnM6IG9wdHM/LmdldFNlc3Npb25zID8/ICgoKSA9PiBbXSksXG5cdFx0Y3JlYXRlTmV3U2Vzc2lvbjogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGNyZWF0ZVF1aWNrQ2hhdDogKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGRlbGV0ZU5ld1Nlc3Npb246ICgpID0+IHsgfSxcblx0XHRnZXRTZXNzaW9uVHlwZXM6ICgpID0+IFtdLFxuXHRcdHJlbmFtZUNoYXQ6IGFzeW5jICgpID0+IHsgfSxcblx0XHRyZW5hbWVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0Z2V0TW9kZWxzU25hcHNob3Q6ICgpID0+ICh7IG1vZGVsczogW10sIGRlc2lyZWRNb2RlbFJlc29sdXRpb246IHsga2luZDogJ25vdFJlcXVlc3RlZCcgYXMgY29uc3QgfSwgbW9kZWxUYXJnZXQ6IHVuZGVmaW5lZCB9KSxcblx0XHRnZXRNb2RlbFBpY2tlck9wdGlvbnM6ICgpID0+ICh7IHVzZUdyb3VwZWRNb2RlbFBpY2tlcjogdHJ1ZSwgc2hvd0ZlYXR1cmVkOiB0cnVlLCBzaG93VW5hdmFpbGFibGVGZWF0dXJlZDogZmFsc2UsIHNob3dNYW5hZ2VNb2RlbHNBY3Rpb246IGZhbHNlIH0pLFxuXHRcdG9uRGlkQ2hhbmdlTW9kZWxzOiBFdmVudC5Ob25lLFxuXHRcdHNldE1vZGVsOiAoKSA9PiB7IH0sXG5cdFx0YXJjaGl2ZVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHR1bmFyY2hpdmVTZXNzaW9uOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0c2V0U2Vzc2lvblJlYWRTdGF0ZTogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGRlbGV0ZVNlc3Npb246IGFzeW5jICgpID0+IHsgfSxcblx0XHRkZWxldGVTZXNzaW9uczogYXN5bmMgKCkgPT4geyB9LFxuXHRcdGRlbGV0ZUNoYXQ6IGFzeW5jICgpID0+IHRydWUsXG5cdFx0Y3JlYXRlTmV3Q2hhdDogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHRcdGZvcmtDaGF0OiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignTm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0Y3JlYXRlU2lkZUNoYXQ6IGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQnKTsgfSxcblx0XHRzZW5kUmVxdWVzdDogYXN5bmMgKF9zZXNzaW9uSWQ6IHN0cmluZywgX2NoYXRSZXNvdXJjZTogVVJJLCBfb3B0aW9uczogSVNlbmRSZXF1ZXN0T3B0aW9ucykgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCcpOyB9LFxuXHR9O1xuXHRpZiAob3B0cz8uY29ubmVjdGlvblN0YXR1cykge1xuXHRcdHJldHVybiB7XG5cdFx0XHQuLi5iYXNlLFxuXHRcdFx0Y2FuQ29ubmVjdE9uRGVtYW5kOiBvcHRzLmNhbkNvbm5lY3RPbkRlbWFuZCxcblx0XHRcdGNvbm5lY3Q6IG9wdHMuY29ubmVjdCxcblx0XHRcdGNvbm5lY3Rpb25TdGF0dXM6IG9wdHMuY29ubmVjdGlvblN0YXR1cyxcblx0XHRcdG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBvcHRzLm9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzLFxuXHRcdFx0cmVtb3RlQWRkcmVzczogb3B0cy5yZW1vdGVBZGRyZXNzLFxuXHRcdFx0b25EaWRDaGFuZ2VTZXNzaW9uQ29uZmlnOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2V0U2Vzc2lvbkNvbmZpZ1ZhbHVlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXBsYWNlU2Vzc2lvbkNvbmZpZzogYXN5bmMgKCkgPT4geyB9LFxuXHRcdFx0Z2V0U2Vzc2lvbkNvbmZpZ0NvbXBsZXRpb25zOiBhc3luYyAoKSA9PiBbXSxcblx0XHRcdGdldENyZWF0ZVNlc3Npb25Db25maWc6ICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdGNsZWFyU2Vzc2lvbkNvbmZpZzogKCkgPT4geyB9LFxuXHRcdFx0b25EaWRDaGFuZ2VSb290Q29uZmlnOiBFdmVudC5Ob25lLFxuXHRcdFx0Z2V0Um9vdENvbmZpZzogKCkgPT4gdW5kZWZpbmVkLFxuXHRcdFx0c2V0Um9vdENvbmZpZ1ZhbHVlOiBhc3luYyAoKSA9PiB7IH0sXG5cdFx0XHRyZXBsYWNlUm9vdENvbmZpZzogYXN5bmMgKCkgPT4geyB9LFxuXHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0U2Vzc2lvbnNQcm92aWRlcjtcblx0fVxuXHRyZXR1cm4gYmFzZTtcbn1cblxuY2xhc3MgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVByb3ZpZGVycyA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PigpKTtcblx0cmVhZG9ubHkgb25EaWRDaGFuZ2VQcm92aWRlcnM6IEV2ZW50PElTZXNzaW9uc1Byb3ZpZGVyc0NoYW5nZUV2ZW50PiA9IHRoaXMuX29uRGlkQ2hhbmdlUHJvdmlkZXJzLmV2ZW50O1xuXG5cdHByaXZhdGUgX3Byb3ZpZGVyczogSVNlc3Npb25zUHJvdmlkZXJbXSA9IFtdO1xuXG5cdHNldFByb3ZpZGVycyhwcm92aWRlcnM6IElTZXNzaW9uc1Byb3ZpZGVyW10pOiB2b2lkIHtcblx0XHRjb25zdCBvbGRQcm92aWRlcnMgPSB0aGlzLl9wcm92aWRlcnM7XG5cdFx0dGhpcy5fcHJvdmlkZXJzID0gcHJvdmlkZXJzO1xuXHRcdGNvbnN0IG9sZElkcyA9IG5ldyBTZXQob2xkUHJvdmlkZXJzLm1hcChwID0+IHAuaWQpKTtcblx0XHRjb25zdCBuZXdJZHMgPSBuZXcgU2V0KHByb3ZpZGVycy5tYXAocCA9PiBwLmlkKSk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VQcm92aWRlcnMuZmlyZSh7XG5cdFx0XHRhZGRlZDogcHJvdmlkZXJzLmZpbHRlcihwID0+ICFvbGRJZHMuaGFzKHAuaWQpKSxcblx0XHRcdHJlbW92ZWQ6IG9sZFByb3ZpZGVycy5maWx0ZXIocCA9PiAhbmV3SWRzLmhhcyhwLmlkKSksXG5cdFx0fSk7XG5cdH1cblxuXHRnZXRQcm92aWRlcnMoKTogSVNlc3Npb25zUHJvdmlkZXJbXSB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycztcblx0fVxuXG5cdGdldFByb3ZpZGVyPFQgZXh0ZW5kcyBJU2Vzc2lvbnNQcm92aWRlcj4ocHJvdmlkZXJJZDogc3RyaW5nKTogVCB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX3Byb3ZpZGVycy5maW5kKHAgPT4gcC5pZCA9PT0gcHJvdmlkZXJJZCkgYXMgVCB8IHVuZGVmaW5lZDtcblx0fVxuXG5cdHJlc29sdmVXb3Jrc3BhY2UoZm9sZGVyVXJpOiBVUkksIHByZWZlcnJlZFByb3ZpZGVySWQ/OiBzdHJpbmcpIHtcblx0XHRpZiAocHJlZmVycmVkUHJvdmlkZXJJZCkge1xuXHRcdFx0Y29uc3QgcHJlZmVycmVkID0gdGhpcy5nZXRQcm92aWRlcihwcmVmZXJyZWRQcm92aWRlcklkKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IHByZWZlcnJlZD8ucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpO1xuXHRcdFx0aWYgKHdvcmtzcGFjZSkge1xuXHRcdFx0XHRyZXR1cm4geyBwcm92aWRlcklkOiBwcmVmZXJyZWRQcm92aWRlcklkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwcm92aWRlciBvZiB0aGlzLmdldFByb3ZpZGVycygpKSB7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdFx0XHRpZiAod29ya3NwYWNlKSB7XG5cdFx0XHRcdHJldHVybiB7IHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCB3b3Jrc3BhY2UgfTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5jbGFzcyBSZWNvcmRpbmdOb3RpZmljYXRpb25IYW5kbGUgZXh0ZW5kcyBOb09wTm90aWZpY2F0aW9uIHtcblx0Y2xvc2VkID0gZmFsc2U7XG5cdG1lc3NhZ2VzOiBOb3RpZmljYXRpb25NZXNzYWdlW10gPSBbXTtcblxuXHRjb25zdHJ1Y3RvcihtZXNzYWdlOiBOb3RpZmljYXRpb25NZXNzYWdlKSB7XG5cdFx0c3VwZXIoKTtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRvdmVycmlkZSB1cGRhdGVNZXNzYWdlKG1lc3NhZ2U6IE5vdGlmaWNhdGlvbk1lc3NhZ2UpOiB2b2lkIHtcblx0XHR0aGlzLm1lc3NhZ2VzLnB1c2gobWVzc2FnZSk7XG5cdH1cblxuXHRvdmVycmlkZSBjbG9zZSgpOiB2b2lkIHtcblx0XHR0aGlzLmNsb3NlZCA9IHRydWU7XG5cdH1cbn1cblxuY2xhc3MgUmVjb3JkaW5nTm90aWZpY2F0aW9uU2VydmljZSBleHRlbmRzIFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlIHtcblx0cmVhZG9ubHkgaGFuZGxlczogUmVjb3JkaW5nTm90aWZpY2F0aW9uSGFuZGxlW10gPSBbXTtcblx0cmVhZG9ubHkgZXJyb3JzOiBBcnJheTxzdHJpbmcgfCBFcnJvcj4gPSBbXTtcblxuXHRvdmVycmlkZSBub3RpZnkobm90aWZpY2F0aW9uOiBJTm90aWZpY2F0aW9uKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0Y29uc3QgaGFuZGxlID0gbmV3IFJlY29yZGluZ05vdGlmaWNhdGlvbkhhbmRsZShub3RpZmljYXRpb24ubWVzc2FnZSk7XG5cdFx0dGhpcy5oYW5kbGVzLnB1c2goaGFuZGxlKTtcblx0XHRyZXR1cm4gaGFuZGxlO1xuXHR9XG5cblx0b3ZlcnJpZGUgZXJyb3IoZXJyb3I6IHN0cmluZyB8IEVycm9yKTogSU5vdGlmaWNhdGlvbkhhbmRsZSB7XG5cdFx0dGhpcy5lcnJvcnMucHVzaChlcnJvcik7XG5cdFx0cmV0dXJuIHN1cGVyLmVycm9yKGVycm9yKTtcblx0fVxufVxuXG5jbGFzcyBEaXNwYXRjaGluZ1dvcmtzcGFjZVBpY2tlciBleHRlbmRzIFdvcmtzcGFjZVBpY2tlciB7XG5cdGRpc3BhdGNoRm9sZGVyKGZvbGRlclVyaTogVVJJLCBwcm92aWRlcklkOiBzdHJpbmcpOiBQcm9taXNlPGJvb2xlYW4+IHtcblx0XHRyZXR1cm4gdGhpcy5fZGlzcGF0Y2hQaWNrZXJJdGVtKHsgZm9sZGVyVXJpLCBwcm92aWRlcklkIH0pO1xuXHR9XG5cblx0ZGlzcGF0Y2hJdGVtKGl0ZW06IElXb3Jrc3BhY2VQaWNrZXJJdGVtKTogUHJvbWlzZTxib29sZWFuPiB7XG5cdFx0cmV0dXJuIHRoaXMuX2Rpc3BhdGNoUGlja2VySXRlbShpdGVtKTtcblx0fVxufVxuXG5jbGFzcyBUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIgZXh0ZW5kcyBBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlciB7XG5cdGdldEl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZEl0ZW1zKCk7XG5cdH1cblxuXHRnZXRJdGVtU3RhdGVzKCk6IEFycmF5PHsgcmVhZG9ubHkgbGFiZWw6IHN0cmluZzsgcmVhZG9ubHkgY2hlY2tlZDogYm9vbGVhbiB9PiB7XG5cdFx0cmV0dXJuIHRoaXMuZ2V0SXRlbXMoKVxuXHRcdFx0LmZpbHRlcihlbnRyeSA9PiBlbnRyeS5pdGVtKVxuXHRcdFx0Lm1hcChlbnRyeSA9PiAoeyBsYWJlbDogZW50cnkubGFiZWwgPz8gJycsIGNoZWNrZWQ6IGVudHJ5Lml0ZW0/LmNoZWNrZWQgPT09IHRydWUgfSkpO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0KGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0SXRlbXMoKS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubGFiZWwgPT09IGxhYmVsKTtcblx0XHRhc3NlcnQub2soZW50cnk/Lml0ZW0sIGBFeHBlY3RlZCBwaWNrZXIgaXRlbSAnJHtsYWJlbH0nYCk7XG5cdFx0YXdhaXQgdGhpcy5fZGlzcGF0Y2hQaWNrZXJJdGVtKGVudHJ5Lml0ZW0pO1xuXHR9XG59XG5cbi8vIC0tLS0gVGVzdCBoZWxwZXJzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIHNlZWRTdG9yYWdlKHN0b3JhZ2VTZXJ2aWNlOiBJU3RvcmFnZVNlcnZpY2UsIGVudHJpZXM6IHsgdXJpOiBVUkk7IHByb3ZpZGVySWQ6IHN0cmluZzsgY2hlY2tlZDogYm9vbGVhbiB9W10pOiB2b2lkIHtcblx0Y29uc3Qgc3RvcmVkID0gZW50cmllcy5tYXAoZSA9PiAoe1xuXHRcdHVyaTogZS51cmkudG9KU09OKCksXG5cdFx0cHJvdmlkZXJJZDogZS5wcm92aWRlcklkLFxuXHRcdGNoZWNrZWQ6IGUuY2hlY2tlZCxcblx0fSkpO1xuXHRzdG9yYWdlU2VydmljZS5zdG9yZShTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgSlNPTi5zdHJpbmdpZnkoc3RvcmVkKSwgU3RvcmFnZVNjb3BlLlBST0ZJTEUsIFN0b3JhZ2VUYXJnZXQuTUFDSElORSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RQaWNrZXIoXG5cdGRpc3Bvc2FibGVzOiBEaXNwb3NhYmxlU3RvcmUsXG5cdHByb3ZpZGVyc1NlcnZpY2U6IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsXG5cdHN0b3JhZ2VTZXJ2aWNlPzogSVN0b3JhZ2VTZXJ2aWNlLFxuXHRub3RpZmljYXRpb25TZXJ2aWNlOiBJTm90aWZpY2F0aW9uU2VydmljZSA9IG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRwaWNrZXJDdG9yOiB0eXBlb2YgV29ya3NwYWNlUGlja2VyID0gV29ya3NwYWNlUGlja2VyLFxuXHRmaWxlRGlhbG9nU2VydmljZTogUGFydGlhbDxJRmlsZURpYWxvZ1NlcnZpY2U+ID0ge30sXG5cdHdvcmtzcGFjZXNTZXJ2aWNlOiBJV29ya3NwYWNlc1NlcnZpY2UgPSB7IGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbXSwgZmlsZXM6IFtdIH0pLCBvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlc1NlcnZpY2UsXG5cdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlPzogSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsXG5cdG9wdGlvbnM/OiBJV29ya3NwYWNlUGlja2VyT3B0aW9ucyxcblx0ZmlsZVNlcnZpY2U6IElGaWxlU2VydmljZSA9IHVwY2FzdFBhcnRpYWw8SUZpbGVTZXJ2aWNlPih7XG5cdFx0b25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zOiBFdmVudC5Ob25lLFxuXHRcdGhhc1Byb3ZpZGVyOiAoKSA9PiB0cnVlLFxuXHRcdGV4aXN0czogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0fSksXG4pOiBXb3Jrc3BhY2VQaWNrZXIge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRjb25zdCBzdG9yYWdlID0gc3RvcmFnZVNlcnZpY2UgPz8gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQWN0aW9uV2lkZ2V0U2VydmljZSwgeyBpc1Zpc2libGU6IGZhbHNlLCBoaWRlOiAoKSA9PiB7IH0sIHNob3c6ICgpID0+IHsgfSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dFZpZXdTZXJ2aWNlLCB7IHNob3dDb250ZXh0VmlldzogKCkgPT4gKHsgY2xvc2U6ICgpID0+IHsgfSB9KSwgaGlkZUNvbnRleHRWaWV3OiAoKSA9PiB7IH0sIGxheW91dDogKCkgPT4geyB9IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2xpcGJvYXJkU2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcmVmZXJlbmNlc1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJT3V0cHV0U2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZF06IHRydWUgfSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4geyB9IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlRGlhbG9nU2VydmljZSwgZmlsZURpYWxvZ1NlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElGaWxlU2VydmljZSwgZmlsZVNlcnZpY2UpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWVudVNlcnZpY2UsIHtcblx0XHRjcmVhdGVNZW51OiAoKSA9PiAoeyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZ2V0QWN0aW9uczogKCkgPT4gW10sIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRnZXRNZW51QWN0aW9uczogKCkgPT4gW10sXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBub3RpZmljYXRpb25TZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlc1NlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSwgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPz8gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UpKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVRlbGVtZXRyeVNlcnZpY2UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKTtcblxuXHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKHBpY2tlckN0b3IsIG9wdGlvbnMgPz8ge30pKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlTW9ja1Nlc3Npb24oXG5cdHByb3ZpZGVyOiBJU2Vzc2lvbnNQcm92aWRlcixcblx0Zm9sZGVyVXJpOiBVUkksXG5cdHVwZGF0ZWRBdDogbnVtYmVyLFxuXHRvcHRpb25zPzogeyByZWFkb25seSB3b3JrdHJlZVBlbmRpbmc/OiBib29sZWFuOyByZWFkb25seSB3b3JrVHJlZVVyaT86IFVSSSB9LFxuKTogSVNlc3Npb24ge1xuXHRjb25zdCB3b3Jrc3BhY2UgPSBwcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKGZvbGRlclVyaSk7XG5cdGlmICghd29ya3NwYWNlKSB7XG5cdFx0dGhyb3cgbmV3IEVycm9yKGBQcm92aWRlciAke3Byb3ZpZGVyLmlkfSBjYW5ub3QgcmVzb2x2ZSAke2ZvbGRlclVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cdGNvbnN0IGZpcnN0Rm9sZGVyID0gd29ya3NwYWNlLmZvbGRlcnNbMF07XG5cdGNvbnN0IHNlc3Npb25Xb3Jrc3BhY2UgPSBvcHRpb25zPy53b3JrVHJlZVVyaSAmJiBmaXJzdEZvbGRlcj8uZ2l0UmVwb3NpdG9yeVxuXHRcdD8ge1xuXHRcdFx0Li4ud29ya3NwYWNlLFxuXHRcdFx0Zm9sZGVyczogW1xuXHRcdFx0XHR7IC4uLmZpcnN0Rm9sZGVyLCBnaXRSZXBvc2l0b3J5OiB7IC4uLmZpcnN0Rm9sZGVyLmdpdFJlcG9zaXRvcnksIHdvcmtUcmVlVXJpOiBvcHRpb25zLndvcmtUcmVlVXJpIH0gfSxcblx0XHRcdFx0Li4ud29ya3NwYWNlLmZvbGRlcnMuc2xpY2UoMSksXG5cdFx0XHRdLFxuXHRcdH1cblx0XHQ6IHdvcmtzcGFjZTtcblx0cmV0dXJuIHVwY2FzdFBhcnRpYWw8SVNlc3Npb24+KHtcblx0XHRwcm92aWRlcklkOiBwcm92aWRlci5pZCxcblx0XHR1cGRhdGVkQXQ6IGNvbnN0T2JzZXJ2YWJsZShuZXcgRGF0ZSh1cGRhdGVkQXQpKSxcblx0XHR3b3Jrc3BhY2U6IGNvbnN0T2JzZXJ2YWJsZShzZXNzaW9uV29ya3NwYWNlKSxcblx0XHRpc1F1aWNrQ2hhdDogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHR3b3JrdHJlZVBlbmRpbmc6IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zPy53b3JrdHJlZVBlbmRpbmcgPz8gZmFsc2UpLFxuXHR9KTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSB7QGxpbmsgU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZX0gYW5kIHdhaXRzIGZvciBpdHMgaW5pdGlhbFxuICogKGFzeW5jaHJvbm91cykgVlMgQ29kZSByZWNlbnRzIGZldGNoIHRvIGNvbXBsZXRlLCBzbyBhIHBpY2tlciBjb25zdHJ1Y3RlZFxuICogYWdhaW5zdCBpdCBhZnRlcndhcmRzIHJlc3RvcmVzIGFnYWluc3QgYSBmdWxseS1wb3B1bGF0ZWQgcmVjZW50cyBsaXN0XG4gKiBpbnN0ZWFkIG9mIHJhY2luZyB0aGUgZmV0Y2ggKGFzIGhhcHBlbnMgd2hlbiB7QGxpbmsgY3JlYXRlVGVzdFBpY2tlcn1cbiAqIGJ1aWxkcyBpdHMgb3duIHNlcnZpY2UgaW5saW5lKS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gY3JlYXRlUmVzb2x2ZWRSZWNlbnRXb3Jrc3BhY2VzU2VydmljZShcblx0ZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSxcblx0c3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSxcblx0cHJvdmlkZXJzU2VydmljZTogTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSxcblx0d29ya3NwYWNlc1NlcnZpY2U6IElXb3Jrc3BhY2VzU2VydmljZSxcbik6IFByb21pc2U8SVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2U+IHtcblx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU3RvcmFnZVNlcnZpY2UsIHN0b3JhZ2VTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaSB9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlc1NlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0Y29uc3QgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSkpO1xuXHRhd2FpdCBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHtcblx0XHRjb25zdCBsaXN0ZW5lciA9IHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLm9uRGlkQ2hhbmdlUmVjZW50V29ya3NwYWNlcygoKSA9PiB7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0XHRyZXNvbHZlKCk7XG5cdFx0fSk7XG5cdH0pO1xuXHRyZXR1cm4gcmVjZW50V29ya3NwYWNlc1NlcnZpY2U7XG59XG5cbi8vIC0tLS0gQXNzZXJ0aW9uIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmZ1bmN0aW9uIGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyOiBXb3Jrc3BhY2VQaWNrZXIsIGV4cGVjdGVkUHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBtZXNzYWdlPzogc3RyaW5nKTogdm9pZCB7XG5cdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRSZXNvbHZlZD8ucHJvdmlkZXJJZCwgZXhwZWN0ZWRQcm92aWRlcklkLCBtZXNzYWdlKTtcbn1cblxuLy8gLS0tLSBUZXN0cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuc3VpdGUoJ1dvcmtzcGFjZVBpY2tlciAtIENvbm5lY3Rpb24gU3RhdHVzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgcHJvdmlkZXJzU2VydmljZTogTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0cHJvdmlkZXJzU2VydmljZSA9IG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHByb3ZpZGVyc1NlcnZpY2UpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVzdG9yZSBwaWNrcyBjaGVja2VkIGVudHJ5IGV2ZW4gd2hlbiByZW1vdGUgaXMgZGlzY29ubmVjdGVkIChiZWZvcmUgZ3JhY2UgcGVyaW9kKScsICgpID0+IHtcblx0XHQvLyBSZXN0b3JlIGlzIGhvbm9yZWQgc3luY2hyb25vdXNseTogdGhlIHBpY2tlciBzaG93cyB0aGUgY2hlY2tlZCBlbnRyeVxuXHRcdC8vIHdoaWxlIHdlIHdhaXQgdG8gc2VlIGlmIHRoZSBjb25uZWN0aW9uIGNvbWVzIHVwLiBUaGUgZ3JhY2UtcGVyaW9kXG5cdFx0Ly8gZmFsbGJhY2sgKGNvdmVyZWQgaW4gYSBzZXBhcmF0ZSB0ZXN0KSBvbmx5IGZpcmVzIGxhdGVyLlxuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1yZW1vdGUtMScsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyLCBsb2NhbFByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHByb3ZpZGVySWQ6IHBpY2tlci5zZWxlY3RlZFJlc29sdmVkPy5wcm92aWRlcklkLFxuXHRcdFx0c291cmNlOiBwaWNrZXIucHJlc2VsZWN0aW9uU291cmNlLFxuXHRcdH0sIHtcblx0XHRcdHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLFxuXHRcdFx0c291cmNlOiBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLkNoZWNrZWRXb3Jrc3BhY2UsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcHJpb3JpdGl6ZXMgdGhlIHNlc3Npb25zXFwnIG93biBoaXN0b3J5IG92ZXIgVlMgQ29kZVxcJ3MgZ2xvYmFsIHJlY2VudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtsb2NhbFByb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBvd25VcmkgPSBVUkkuZmlsZSgnL2xvY2FsL293bi1wcm9qZWN0Jyk7XG5cdFx0Y29uc3QgZ2xvYmFsVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9nbG9iYWwtb25seS1wcm9qZWN0Jyk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBvd25VcmksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogZmFsc2UgfV0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSB7IGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbeyBmb2xkZXJVcmk6IGdsb2JhbFVyaSB9XSwgZmlsZXM6IFtdIH0pLCBvbkRpZENoYW5nZVJlY2VudGx5T3BlbmVkOiBFdmVudC5Ob25lIH0gYXMgdW5rbm93biBhcyBJV29ya3NwYWNlc1NlcnZpY2U7XG5cdFx0Y29uc3QgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPSBhd2FpdCBjcmVhdGVSZXNvbHZlZFJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKGRpc3Bvc2FibGVzLCBzdG9yYWdlLCBwcm92aWRlcnNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cblx0XHQvLyBTYW5pdHk6IHRoZSBtZXJnZWQgKGRpc3BsYXkpIGxpc3QgaW5jbHVkZXMgYm90aCBlbnRyaWVzLi4uXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudFdvcmtzcGFjZXMoKS5tYXAociA9PiByLndvcmtzcGFjZS51cmkudG9TdHJpbmcoKSksXG5cdFx0XHRbb3duVXJpLnRvU3RyaW5nKCksIGdsb2JhbFVyaS50b1N0cmluZygpXSxcblx0XHQpO1xuXHRcdC8vIC4uLmJ1dCB0aGUgb3duLW9ubHkgcXVlcnkgdXNlZCBmb3IgcmVzdG9yYXRpb24gZXhjbHVkZXMgdGhlIGdsb2JhbCBvbmUuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLmdldFJlY2VudFdvcmtzcGFjZXMoZmFsc2UpLm1hcChyID0+IHIud29ya3NwYWNlLnVyaS50b1N0cmluZygpKSxcblx0XHRcdFtvd25VcmkudG9TdHJpbmcoKV0sXG5cdFx0KTtcblxuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHdvcmtzcGFjZXNTZXJ2aWNlLCByZWNlbnRXb3Jrc3BhY2VzU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0c291cmNlOiBwaWNrZXIucHJlc2VsZWN0aW9uU291cmNlLFxuXHRcdH0sIHtcblx0XHRcdGZvbGRlclVyaTogb3duVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuUmVjZW50V29ya3NwYWNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIHNlbGVjdHMgdGhlIG1vc3QgcmVjZW50IFZTIENvZGUgd29ya3NwYWNlIHdoZW4gb3duIGhpc3RvcnkgaXMgZW1wdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtsb2NhbFByb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBtb3N0UmVjZW50R2xvYmFsVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9tb3N0LXJlY2VudC1nbG9iYWwtcHJvamVjdCcpO1xuXHRcdGNvbnN0IG9sZGVyR2xvYmFsVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9vbGRlci1nbG9iYWwtcHJvamVjdCcpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblxuXHRcdGNvbnN0IHdvcmtzcGFjZXNTZXJ2aWNlID0ge1xuXHRcdFx0Z2V0UmVjZW50bHlPcGVuZWQ6IGFzeW5jICgpID0+ICh7XG5cdFx0XHRcdHdvcmtzcGFjZXM6IFt7IGZvbGRlclVyaTogbW9zdFJlY2VudEdsb2JhbFVyaSB9LCB7IGZvbGRlclVyaTogb2xkZXJHbG9iYWxVcmkgfV0sXG5cdFx0XHRcdGZpbGVzOiBbXSxcblx0XHRcdH0pLFxuXHRcdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZXNTZXJ2aWNlO1xuXHRcdGNvbnN0IHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlID0gYXdhaXQgY3JlYXRlUmVzb2x2ZWRSZWNlbnRXb3Jrc3BhY2VzU2VydmljZShkaXNwb3NhYmxlcywgc3RvcmFnZSwgcHJvdmlkZXJzU2VydmljZSwgd29ya3NwYWNlc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgd29ya3NwYWNlc1NlcnZpY2UsIHJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksIG1vc3RSZWNlbnRHbG9iYWxVcmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgc2VsZWN0cyBhIFZTIENvZGUgcmVjZW50IHRoYXQgZmluaXNoZXMgbG9hZGluZyBhZnRlciBwaWNrZXIgY3JlYXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtsb2NhbFByb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBnbG9iYWxVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL2dsb2JhbC1wcm9qZWN0Jyk7XG5cdFx0Y29uc3QgcmVjZW50bHlPcGVuZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTxJV29ya3NwYWNlc1NlcnZpY2VbJ2dldFJlY2VudGx5T3BlbmVkJ10+Pj4oKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IHtcblx0XHRcdGdldFJlY2VudGx5T3BlbmVkOiAoKSA9PiByZWNlbnRseU9wZW5lZC5wLFxuXHRcdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZXNTZXJ2aWNlO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgd29ya3NwYWNlc1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgaW5pdGlhbFNlbGVjdGlvbiA9IHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW5pdGlhbFNlbGVjdGlvbiwgdW5kZWZpbmVkKTtcblx0XHRhd2FpdCByZWNlbnRseU9wZW5lZC5jb21wbGV0ZSh7IHdvcmtzcGFjZXM6IFt7IGZvbGRlclVyaTogZ2xvYmFsVXJpIH1dLCBmaWxlczogW10gfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLCBnbG9iYWxVcmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhdGUgVlMgQ29kZSByZWNlbnRzIGRvIG5vdCBvdmVycmlkZSBhbiBleHBsaWNpdCB3b3Jrc3BhY2Ugc2VsZWN0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbbG9jYWxQcm92aWRlcl0pO1xuXG5cdFx0Y29uc3Qgc2VsZWN0ZWRVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL3NlbGVjdGVkLXByb2plY3QnKTtcblx0XHRjb25zdCBnbG9iYWxVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL2dsb2JhbC1wcm9qZWN0Jyk7XG5cdFx0Y29uc3QgcmVjZW50bHlPcGVuZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPEF3YWl0ZWQ8UmV0dXJuVHlwZTxJV29ya3NwYWNlc1NlcnZpY2VbJ2dldFJlY2VudGx5T3BlbmVkJ10+Pj4oKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IHtcblx0XHRcdGdldFJlY2VudGx5T3BlbmVkOiAoKSA9PiByZWNlbnRseU9wZW5lZC5wLFxuXHRcdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZXNTZXJ2aWNlO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgd29ya3NwYWNlc1NlcnZpY2UpO1xuXHRcdHBpY2tlci5zZXRTZWxlY3RlZFdvcmtzcGFjZShzZWxlY3RlZFVyaSwgeyBmaXJlRXZlbnQ6IGZhbHNlIH0pO1xuXG5cdFx0YXdhaXQgcmVjZW50bHlPcGVuZWQuY29tcGxldGUoeyB3b3Jrc3BhY2VzOiBbeyBmb2xkZXJVcmk6IGdsb2JhbFVyaSB9XSwgZmlsZXM6IFtdIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSwgc2VsZWN0ZWRVcmkudG9TdHJpbmcoKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgY2hvb3NlcyB0aGUgbW9zdCBmcmVxdWVudCB3b3Jrc3BhY2UgYW1vbmcgdGhlIDE1IG1vc3QgcmVjZW50IHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJywgeyBnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMgfSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBtb3N0RnJlcXVlbnRSZWNlbnQgPSBVUkkuZmlsZSgnL2xvY2FsL3JlY2VudC1hJyk7XG5cdFx0Y29uc3QgbW9zdEZyZXF1ZW50T3ZlcmFsbCA9IFVSSS5maWxlKCcvbG9jYWwvb2xkZXItYicpO1xuXHRcdGNvbnN0IHJlY2VudEZvbGRlcnMgPSBbXG5cdFx0XHRtb3N0RnJlcXVlbnRSZWNlbnQsXG5cdFx0XHRtb3N0RnJlcXVlbnRPdmVyYWxsLFxuXHRcdFx0bW9zdEZyZXF1ZW50UmVjZW50LFxuXHRcdFx0VVJJLmZpbGUoJy9sb2NhbC9yZWNlbnQtYycpLFxuXHRcdFx0bW9zdEZyZXF1ZW50UmVjZW50LFxuXHRcdFx0bW9zdEZyZXF1ZW50T3ZlcmFsbCxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWQnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWUnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWYnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWcnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWgnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWknKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWonKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWsnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvcmVjZW50LWwnKSxcblx0XHRdO1xuXHRcdGNvbnN0IHJlY2VudFNlc3Npb25zID0gcmVjZW50Rm9sZGVycy5tYXAoKGZvbGRlclVyaSwgaW5kZXgpID0+IGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCBmb2xkZXJVcmksIDEwMCAtIGluZGV4KSk7XG5cdFx0Y29uc3Qgb2xkZXJTZXNzaW9ucyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IDEwIH0sIChfLCBpbmRleCkgPT4gY3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIG1vc3RGcmVxdWVudE92ZXJhbGwsIDUwIC0gaW5kZXgpKTtcblx0XHRzZXNzaW9ucyA9IFsuLi5vbGRlclNlc3Npb25zLCAuLi5yZWNlbnRTZXNzaW9uc107XG5cblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmb2xkZXJVcmk6IHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRcdHNvdXJjZTogcGlja2VyLnByZXNlbGVjdGlvblNvdXJjZSxcblx0XHR9LCB7XG5cdFx0XHRmb2xkZXJVcmk6IG1vc3RGcmVxdWVudFJlY2VudC50b1N0cmluZygpLFxuXHRcdFx0c291cmNlOiBOZXdTZXNzaW9uV29ya3NwYWNlUHJlc2VsZWN0aW9uU291cmNlLkV4aXN0aW5nU2Vzc2lvbnMsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgc2tpcHMgbWlzc2luZyBzZXNzaW9uIHdvcmtzcGFjZXMgaW4gZnJlcXVlbmN5IG9yZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJywgeyBnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMgfSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgbWlzc2luZyA9IFVSSS5maWxlKCcvbG9jYWwvbWlzc2luZycpO1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gVVJJLmZpbGUoJy9sb2NhbC9leGlzdGluZycpO1xuXHRcdHNlc3Npb25zID0gW1xuXHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIG1pc3NpbmcsIDUpLFxuXHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIGV4aXN0aW5nLCA0KSxcblx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCBtaXNzaW5nLCAzKSxcblx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCBleGlzdGluZywgMiksXG5cdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbihwcm92aWRlciwgbWlzc2luZywgMSksXG5cdFx0XTtcblx0XHRjb25zdCBjaGVja2VkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IGZpbGVTZXJ2aWNlID0gdXBjYXN0UGFydGlhbDxJRmlsZVNlcnZpY2U+KHtcblx0XHRcdG9uRGlkQ2hhbmdlRmlsZVN5c3RlbVByb3ZpZGVyUmVnaXN0cmF0aW9uczogRXZlbnQuTm9uZSxcblx0XHRcdGhhc1Byb3ZpZGVyOiAoKSA9PiB0cnVlLFxuXHRcdFx0ZXhpc3RzOiBhc3luYyByZXNvdXJjZSA9PiB7XG5cdFx0XHRcdGNoZWNrZWQucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdFx0cmV0dXJuIGV4dFVyaS5pc0VxdWFsKHJlc291cmNlLCBleGlzdGluZyk7XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cHJvdmlkZXJzU2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y2hlY2tlZDogWy4uLm5ldyBTZXQoY2hlY2tlZCldLFxuXHRcdFx0Zm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHBpY2tlci5wcmVzZWxlY3Rpb25Tb3VyY2UsXG5cdFx0fSwge1xuXHRcdFx0Y2hlY2tlZDogW21pc3NpbmcudG9TdHJpbmcoKSwgZXhpc3RpbmcudG9TdHJpbmcoKV0sXG5cdFx0XHRmb2xkZXJVcmk6IGV4aXN0aW5nLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuRXhpc3RpbmdTZXNzaW9ucyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZSBleGNsdWRlcyBwZW5kaW5nIGFuZCByZXNvbHZlZCB3b3JrdHJlZSBzZXNzaW9ucyB1c2luZyBzZXNzaW9uIG1ldGFkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdGxldCBzZXNzaW9uczogSVNlc3Npb25bXSA9IFtdO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJywgeyBnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMgfSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGVuZGluZ0NoZWNrb3V0ID0gVVJJLmZpbGUoJy9sb2NhbC9wZW5kaW5nLWNoZWNrb3V0Jyk7XG5cdFx0Y29uc3QgcmVzb2x2ZWRXb3JrdHJlZSA9IFVSSS5maWxlKCcvbG9jYWwvZmVhdHVyZS1jaGVja291dCcpO1xuXHRcdGNvbnN0IHJlZ3VsYXJXb3Jrc3BhY2UgPSBVUkkuZmlsZSgnL2xvY2FsL3JlZ3VsYXInKTtcblx0XHRzZXNzaW9ucyA9IFtcblx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCBwZW5kaW5nQ2hlY2tvdXQsIDcsIHsgd29ya3RyZWVQZW5kaW5nOiB0cnVlIH0pLFxuXHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIHBlbmRpbmdDaGVja291dCwgNiwgeyB3b3JrdHJlZVBlbmRpbmc6IHRydWUgfSksXG5cdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbihwcm92aWRlciwgcGVuZGluZ0NoZWNrb3V0LCA1LCB7IHdvcmt0cmVlUGVuZGluZzogdHJ1ZSB9KSxcblx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCByZXNvbHZlZFdvcmt0cmVlLCA0LCB7IHdvcmtUcmVlVXJpOiByZXNvbHZlZFdvcmt0cmVlIH0pLFxuXHRcdFx0Y3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIHJlc29sdmVkV29ya3RyZWUsIDMsIHsgd29ya1RyZWVVcmk6IHJlc29sdmVkV29ya3RyZWUgfSksXG5cdFx0XHRjcmVhdGVNb2NrU2Vzc2lvbihwcm92aWRlciwgcmVzb2x2ZWRXb3JrdHJlZSwgMiwgeyB3b3JrVHJlZVVyaTogcmVzb2x2ZWRXb3JrdHJlZSB9KSxcblx0XHRcdGNyZWF0ZU1vY2tTZXNzaW9uKHByb3ZpZGVyLCByZWd1bGFyV29ya3NwYWNlLCAxKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHBpY2tlci5wcmVzZWxlY3Rpb25Tb3VyY2UsXG5cdFx0fSwge1xuXHRcdFx0Zm9sZGVyVXJpOiByZWd1bGFyV29ya3NwYWNlLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuRXhpc3RpbmdTZXNzaW9ucyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZSBkaXNjYXJkcyBhIHNlc3Npb24gZmFsbGJhY2sgdGhhdCBjb21wbGV0ZXMgd2hpbGUgcmVzdG9yYXRpb24gaXMgZGlzYWJsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnLCB7IGdldFNlc3Npb25zOiAoKSA9PiBzZXNzaW9ucyB9KTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKTtcblx0XHRzZXNzaW9ucyA9IFtjcmVhdGVNb2NrU2Vzc2lvbihwcm92aWRlciwgZm9sZGVyVXJpLCAxKV07XG5cdFx0Y29uc3QgZmlyc3RFeGlzdHMgPSBuZXcgRGVmZXJyZWRQcm9taXNlPGJvb2xlYW4+KCk7XG5cdFx0bGV0IGV4aXN0c0NhbGxDb3VudCA9IDA7XG5cdFx0Y29uc3QgZmlsZVNlcnZpY2UgPSB1cGNhc3RQYXJ0aWFsPElGaWxlU2VydmljZT4oe1xuXHRcdFx0aGFzUHJvdmlkZXI6ICgpID0+IHRydWUsXG5cdFx0XHRleGlzdHM6IGFzeW5jICgpID0+ICsrZXhpc3RzQ2FsbENvdW50ID09PSAxID8gZmlyc3RFeGlzdHMucCA6IHRydWUsXG5cdFx0fSk7XG5cdFx0bGV0IGNhblJlc3RvcmVXb3Jrc3BhY2UgPSB0cnVlO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGNhblJlc3RvcmVXb3Jrc3BhY2U6ICgpID0+IGNhblJlc3RvcmVXb3Jrc3BhY2UgfSxcblx0XHRcdGZpbGVTZXJ2aWNlLFxuXHRcdCk7XG5cdFx0Y2FuUmVzdG9yZVdvcmtzcGFjZSA9IGZhbHNlO1xuXHRcdGF3YWl0IGZpcnN0RXhpc3RzLmNvbXBsZXRlKHRydWUpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0Y29uc3QgZGlzYWJsZWRTZWxlY3Rpb24gPSBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk7XG5cblx0XHRjYW5SZXN0b3JlV29ya3NwYWNlID0gdHJ1ZTtcblx0XHRwaWNrZXIucmVmcmVzaEF1dG9tYXRpY1NlbGVjdGlvbigpO1xuXHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc2FibGVkU2VsZWN0aW9uLFxuXHRcdFx0Zm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHBpY2tlci5wcmVzZWxlY3Rpb25Tb3VyY2UsXG5cdFx0fSwge1xuXHRcdFx0ZGlzYWJsZWRTZWxlY3Rpb246IHVuZGVmaW5lZCxcblx0XHRcdGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IE5ld1Nlc3Npb25Xb3Jrc3BhY2VQcmVzZWxlY3Rpb25Tb3VyY2UuRXhpc3RpbmdTZXNzaW9ucyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZSByZXRyaWVzIHdoZW4gYSBwcm92aWRlciByZXBvcnRzIHNlc3Npb25zIGFmdGVyIHBpY2tlciBjcmVhdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uc0NoYW5nZWQgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb25DaGFuZ2VFdmVudD4oKSk7XG5cdFx0bGV0IHNlc3Npb25zOiBJU2Vzc2lvbltdID0gW107XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnLCB7XG5cdFx0XHRnZXRTZXNzaW9uczogKCkgPT4gc2Vzc2lvbnMsXG5cdFx0XHRvbkRpZENoYW5nZVNlc3Npb25zOiBzZXNzaW9uc0NoYW5nZWQuZXZlbnQsXG5cdFx0fSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgZm9sZGVyVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9sYXRlLXNlc3Npb24nKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXG5cdFx0c2Vzc2lvbnMgPSBbY3JlYXRlTW9ja1Nlc3Npb24ocHJvdmlkZXIsIGZvbGRlclVyaSwgMSldO1xuXHRcdHNlc3Npb25zQ2hhbmdlZC5maXJlKHsgYWRkZWQ6IHNlc3Npb25zLCByZW1vdmVkOiBbXSwgY2hhbmdlZDogW10gfSk7XG5cdFx0YXdhaXQgdGltZW91dCgwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Zm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzb3VyY2U6IHBpY2tlci5wcmVzZWxlY3Rpb25Tb3VyY2UsXG5cdFx0fSwge1xuXHRcdFx0Zm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSxcblx0XHRcdHNvdXJjZTogTmV3U2Vzc2lvbldvcmtzcGFjZVByZXNlbGVjdGlvblNvdXJjZS5FeGlzdGluZ1Nlc3Npb25zLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBtYW51YWxseSBwaWNrZWQgd29ya3RyZWUgZm9sZGVycyBidXQgZmlsdGVycyB0aGVtIGZyb20gVlMgQ29kZSByZWNlbnRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdwcm92aWRlcicpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtwcm92aWRlcl0pO1xuXG5cdFx0Y29uc3Qgb3duV29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL2NvZGUvb3duZWQud29ya3RyZWVzL2ZlYXR1cmUnKTtcblx0XHRjb25zdCBvd25Db3BpbG90V29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3RtcC9jb3BpbG90LXdvcmt0cmVlcy9vd25lZC1mZWF0dXJlJyk7XG5cdFx0Y29uc3Qgb3duUmVndWxhclVyaSA9IFVSSS5maWxlKCcvY29kZS9vd25lZC1mZWF0dXJlJyk7XG5cdFx0Y29uc3QgZ2xvYmFsV29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL2NvZGUvdnNjb2RlLndvcmt0cmVlcy9mZWF0dXJlJyk7XG5cdFx0Y29uc3QgZ2xvYmFsVXBwZXJjYXNlV29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL2NvZGUvVlNDb2RlLldPUktUUkVFUy9vdGhlci1mZWF0dXJlJyk7XG5cdFx0Y29uc3QgZ2xvYmFsQ29waWxvdFdvcmt0cmVlVXJpID0gVVJJLmZpbGUoJy90bXAvY29waWxvdC13b3JrdHJlZXMvZ2xvYmFsLWZlYXR1cmUnKTtcblx0XHRjb25zdCBnbG9iYWxVcHBlcmNhc2VDb3BpbG90V29ya3RyZWVVcmkgPSBVUkkuZmlsZSgnL3RtcC9DT1BJTE9ULVdPUktUUkVFUy9vdGhlci1nbG9iYWwtZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFNpbWlsYXJVcmkgPSBVUkkuZmlsZSgnL2NvZGUvdnNjb2RlLndvcmt0cmVlcy1iYWNrdXAvZmVhdHVyZScpO1xuXHRcdGNvbnN0IGdsb2JhbFJlZ3VsYXJVcmkgPSBVUkkuZmlsZSgnL2NvZGUvdnNjb2RlL2ZlYXR1cmUnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IG93bldvcmt0cmVlVXJpLCBwcm92aWRlcklkOiAncHJvdmlkZXInLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0eyB1cmk6IG93bkNvcGlsb3RXb3JrdHJlZVVyaSwgcHJvdmlkZXJJZDogJ3Byb3ZpZGVyJywgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRcdHsgdXJpOiBvd25SZWd1bGFyVXJpLCBwcm92aWRlcklkOiAncHJvdmlkZXInLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXG5cdFx0Y29uc3Qgd29ya3NwYWNlc1NlcnZpY2UgPSB7XG5cdFx0XHRnZXRSZWNlbnRseU9wZW5lZDogYXN5bmMgKCkgPT4gKHtcblx0XHRcdFx0d29ya3NwYWNlczogW1xuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxXb3JrdHJlZVVyaSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxVcHBlcmNhc2VXb3JrdHJlZVVyaSB9LFxuXHRcdFx0XHRcdHsgZm9sZGVyVXJpOiBnbG9iYWxDb3BpbG90V29ya3RyZWVVcmkgfSxcblx0XHRcdFx0XHR7IGZvbGRlclVyaTogZ2xvYmFsVXBwZXJjYXNlQ29waWxvdFdvcmt0cmVlVXJpIH0sXG5cdFx0XHRcdFx0eyBmb2xkZXJVcmk6IGdsb2JhbFNpbWlsYXJVcmkgfSxcblx0XHRcdFx0XHR7IGZvbGRlclVyaTogZ2xvYmFsUmVndWxhclVyaSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRmaWxlczogW10sXG5cdFx0XHR9KSxcblx0XHRcdG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0fSBhcyB1bmtub3duIGFzIElXb3Jrc3BhY2VzU2VydmljZTtcblx0XHRjb25zdCByZWNlbnRXb3Jrc3BhY2VzU2VydmljZSA9IGF3YWl0IGNyZWF0ZVJlc29sdmVkUmVjZW50V29ya3NwYWNlc1NlcnZpY2UoZGlzcG9zYWJsZXMsIHN0b3JhZ2UsIHByb3ZpZGVyc1NlcnZpY2UsIHdvcmtzcGFjZXNTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRyZWNlbnRXb3Jrc3BhY2VzU2VydmljZS5nZXRSZWNlbnRXb3Jrc3BhY2VzKCkubWFwKHJlY2VudCA9PiByZWNlbnQud29ya3NwYWNlLnVyaS50b1N0cmluZygpKSxcblx0XHRcdFtvd25Xb3JrdHJlZVVyaSwgb3duQ29waWxvdFdvcmt0cmVlVXJpLCBvd25SZWd1bGFyVXJpLCBnbG9iYWxTaW1pbGFyVXJpLCBnbG9iYWxSZWd1bGFyVXJpXS5tYXAodXJpID0+IHVyaS50b1N0cmluZygpKSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlIG5ldmVyIHByZXNlbGVjdHMgYSB3b3JrdHJlZSBmb2xkZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtsb2NhbFByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgZ2xvYmFsVXJpID0gVVJJLmZpbGUoJy9sb2NhbC9nbG9iYWwtcHJvamVjdCcpO1xuXHRcdGNvbnN0IHNlbGVjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXG5cdFx0Zm9yIChjb25zdCBleGNsdWRlZFVyaSBvZiBbXG5cdFx0XHRVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3Qud29ya3RyZWVzL2ZlYXR1cmUnKSxcblx0XHRcdFVSSS5maWxlKCcvbG9jYWwvY29waWxvdC13b3JrdHJlZXMvZmVhdHVyZScpLFxuXHRcdF0pIHtcblx0XHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFt7IHVyaTogZXhjbHVkZWRVcmksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogdHJ1ZSB9XSk7XG5cdFx0XHRjb25zdCB3b3Jrc3BhY2VzU2VydmljZSA9IHtcblx0XHRcdFx0Z2V0UmVjZW50bHlPcGVuZWQ6IGFzeW5jICgpID0+ICh7IHdvcmtzcGFjZXM6IFt7IGZvbGRlclVyaTogZ2xvYmFsVXJpIH1dLCBmaWxlczogW10gfSksXG5cdFx0XHRcdG9uRGlkQ2hhbmdlUmVjZW50bHlPcGVuZWQ6IEV2ZW50Lk5vbmUsXG5cdFx0XHR9IGFzIHVua25vd24gYXMgSVdvcmtzcGFjZXNTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UgPSBhd2FpdCBjcmVhdGVSZXNvbHZlZFJlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKGRpc3Bvc2FibGVzLCBzdG9yYWdlLCBwcm92aWRlcnNTZXJ2aWNlLCB3b3Jrc3BhY2VzU2VydmljZSk7XG5cdFx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB3b3Jrc3BhY2VzU2VydmljZSwgcmVjZW50V29ya3NwYWNlc1NlcnZpY2UpO1xuXHRcdFx0c2VsZWN0ZWQucHVzaChwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCkgPz8gJycpO1xuXHRcdH1cblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2VsZWN0ZWQsIFtnbG9iYWxVcmkudG9TdHJpbmcoKSwgZ2xvYmFsVXJpLnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZWQgcmVtb3RlIHRoYXQgbmV2ZXIgY29ubmVjdHMgZmFsbHMgYmFjayBhZnRlciBncmFjZSBwZXJpb2QnLCAoKSA9PiBydW5XaXRoRmFrZWRUaW1lcnM8dm9pZD4oeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHQvLyBUaGUgcHJvdmlkZXIgaXMgcmVnaXN0ZXJlZCBhcyBEaXNjb25uZWN0ZWQgYW5kIG5ldmVyIHRyYW5zaXRpb25zIFx1MjAxNFxuXHRcdC8vIGUuZy4gU1NIIGhvc3QgaXMgdW5yZWFjaGFibGUgYW5kIHRoZSBzdGF0dXMgd2FzIHNldCBiZWZvcmUgdGhlIHBpY2tlclxuXHRcdC8vIGNvdWxkIHN1YnNjcmliZS4gVGhlIHBpY2tlciBzaG91bGQgZmFsbCBiYWNrIHRvIG5vIHNlbGVjdGlvbiBhZnRlclxuXHRcdC8vIHRoZSBncmFjZSBwZXJpb2Qgc28gdGhlIHZpZXcgcGFuZSBkcm9wcyB0aGUgc3RhbGUgc2Vzc2lvbi5cblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1yZW1vdGUtMScsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnLCAnU2VsZWN0aW9uIGlzIHJlc3RvcmVkIHN5bmNocm9ub3VzbHknKTtcblxuXHRcdGNvbnN0IGV2ZW50czogQXJyYXk8VVJJIHwgdW5kZWZpbmVkPiA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwaWNrZXIub25EaWRTZWxlY3RXb3Jrc3BhY2UoZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0Ly8gQWR2YW5jZSBwYXN0IHRoZSBncmFjZSBwZXJpb2QuXG5cdFx0YXdhaXQgdGltZW91dCgxMF8wMDApO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsIHVuZGVmaW5lZCwgJ1NlbGVjdGlvbiBjbGVhcmVkIGFmdGVyIGdyYWNlIHBlcmlvZCcpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbdW5kZWZpbmVkXSwgJ29uRGlkU2VsZWN0V29ya3NwYWNlIGZpcmVkIHdpdGggdW5kZWZpbmVkJyk7XG5cdH0pKTtcblxuXHR0ZXN0KCdyZXN0b3JlZCByZW1vdGUgdGhhdCBjb25uZWN0cyB3aXRoaW4gZ3JhY2UgcGVyaW9kIGtlZXBzIHNlbGVjdGlvbicsICgpID0+IHJ1bldpdGhGYWtlZFRpbWVyczx2b2lkPih7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHQvLyBDb25uZWN0aW9uIHN1Y2NlZWRzIHF1aWNrbHkuXG5cdFx0YXdhaXQgdGltZW91dCgxMDApO1xuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nLCB1bmRlZmluZWQpO1xuXHRcdGF3YWl0IHRpbWVvdXQoNTAwKTtcblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXG5cdFx0Ly8gQWR2YW5jZSBwYXN0IHRoZSBncmFjZSBwZXJpb2QgXHUyMDE0IHNob3VsZCBub3QgZmFsbCBiYWNrIHNpbmNlIHdlIGNvbm5lY3RlZC5cblx0XHRhd2FpdCB0aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScsICdTZWxlY3Rpb24gcHJlc2VydmVkIGFmdGVyIHN1Y2Nlc3NmdWwgY29ubmVjdCcpO1xuXHR9KSk7XG5cblx0dGVzdCgndXNlciBwaWNrIGR1cmluZyBjb25uZWN0IGNhbmNlbHMgdGhlIGZhbGxiYWNrJywgKCkgPT4gcnVuV2l0aEZha2VkVGltZXJzPHZvaWQ+KHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0Ly8gSWYgdGhlIHVzZXIgcGlja3MgYSBkaWZmZXJlbnQgd29ya3NwYWNlIHdoaWxlIHRoZSByZXN0b3JlLWdyYWNlLXBlcmlvZFxuXHRcdC8vIHRpbWVyIGlzIHJ1bm5pbmcsIHRoZSB0aW1lciBtdXN0IG5vdCBsYXRlciBjbGVhciB0aGUgdXNlcidzIHNlbGVjdGlvbi5cblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXIsIGxvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFVzZXIgcGlja3MgYSBsb2NhbCB3b3Jrc3BhY2Ugd2hpbGUgdGhlIHJlbW90ZSBpcyBzdGlsbCB0cnlpbmcgdG8gY29ubmVjdC5cblx0XHRwaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoVVJJLmZpbGUoJy9sb2NhbC9waWNrZWQnKSwgeyBmaXJlRXZlbnQ6IGZhbHNlIH0pO1xuXG5cdFx0Ly8gR3JhY2UgcGVyaW9kIGVsYXBzZXM7IHJlbW90ZSBzdGlsbCBkaXNjb25uZWN0ZWQgXHUyMDE0IG11c3Qgbm90IGFmZmVjdCB1c2VyIHBpY2suXG5cdFx0YXdhaXQgdGltZW91dCgxMF8wMDApO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdsb2NhbC0xJywgJ1VzZXIgcGljayBwcmVzZXJ2ZWQgYWNyb3NzIGdyYWNlLXBlcmlvZCBlbGFwc2UnKTtcblx0fSkpO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcGlja3MgY2hlY2tlZCBlbnRyeSB3aGlsZSByZW1vdGUgaXMgY29ubmVjdGluZyAobm8gZmFsbGJhY2sgZmxpY2tlciknLCAoKSA9PiB7XG5cdFx0Ly8gU1NIIHJlbW90ZTogcHJvdmlkZXIgcmVnaXN0ZXJzIGluIERpc2Nvbm5lY3RlZCBzdGF0ZSBhbmQgaW1tZWRpYXRlbHlcblx0XHQvLyBzdGFydHMgY29ubmVjdGluZy4gV2UgcmVzdG9yZSB0aGUgY2hlY2tlZCBlbnRyeSBpbW1lZGlhdGVseSByYXRoZXIgdGhhblxuXHRcdC8vIGZhbGxpbmcgYmFjayB0byBhIGRpZmZlcmVudCB3b3Jrc3BhY2UgYW5kIHN3YXBwaW5nIGxhdGVyLlxuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1yZW1vdGUtMScsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2xvY2FsLTEnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyLCBsb2NhbFByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScpO1xuXG5cdFx0Ly8gQ29ubmVjdGlvbiBhdHRlbXB0IHN0YXJ0cyAobm8gZmFsbGJhY2sgd2hpbGUgY29ubmVjdGluZykuXG5cdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RpbmcsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdC8vIEFmdGVyIGNvbm5lY3Rpb24gY29tcGxldGVzLCBzZWxlY3Rpb24gaXMgdW5jaGFuZ2VkLlxuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblx0fSk7XG5cblx0dGVzdCgnY29ubmVjdGluZyBwcm92aWRlciB0aGF0IGZhaWxzIGZhbGxzIGJhY2sgdG8gbm8gc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdC8vIFJlYWwgU1NIIHJlbW90ZSBsaWZlY3ljbGU6IHN0YXJ0cyBEaXNjb25uZWN0ZWQsIHRyYW5zaXRpb25zIENvbm5lY3RpbmcsXG5cdFx0Ly8gdGhlbiBmYWlscyBiYWNrIHRvIERpc2Nvbm5lY3RlZC4gVGhlIHBpY2tlciBtdXN0IGNsZWFyIHRoZSBzZWxlY3Rpb25cblx0XHQvLyBhbmQgZmlyZSBvbkRpZFNlbGVjdFdvcmtzcGFjZSh1bmRlZmluZWQpIHNvIHRoZSB2aWV3IHBhbmUgY2FsbHMgdW5zZXROZXdTZXNzaW9uKCkuXG5cdFx0Y29uc3QgcmVtb3RlU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmRpc2Nvbm5lY3RlZCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHsgY29ubmVjdGlvblN0YXR1czogcmVtb3RlU3RhdHVzIH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJywgJ1NlbGVjdGlvbiBpcyByZXN0b3JlZCB3aGlsZSBjb25uZWN0aW5nJyk7XG5cblx0XHRjb25zdCBldmVudHM6IEFycmF5PFVSSSB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocGlja2VyLm9uRGlkU2VsZWN0V29ya3NwYWNlKGUgPT4gZXZlbnRzLnB1c2goZSkpKTtcblxuXHRcdC8vIFNTSCB0dW5uZWwgYmVnaW5zLlxuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0aW5nLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJywgJ1NlbGVjdGlvbiBwcmVzZXJ2ZWQgd2hpbGUgY29ubmVjdGluZycpO1xuXG5cdFx0Ly8gU1NIIHR1bm5lbCBmYWlscy5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsIHVuZGVmaW5lZCwgJ1NlbGVjdGlvbiBjbGVhcmVkIGFmdGVyIGNvbm5lY3Rpb24gZmFpbHVyZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbdW5kZWZpbmVkXSwgJ29uRGlkU2VsZWN0V29ya3NwYWNlIGZpcmVkIHdpdGggdW5kZWZpbmVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcGlja3MgY29ubmVjdGVkIHJlbW90ZSBwcm92aWRlcicsICgpID0+IHtcblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3N0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuY29ubmVjdGVkKTtcblx0XHRjb25zdCByZW1vdGVQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignYWdlbnRob3N0LXJlbW90ZS0xJywgeyBjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMgfSk7XG5cblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW1xuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC1yZW1vdGUtMScsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHN0b3JhZ2UpO1xuXG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzY29ubmVjdCBwcmVzZXJ2ZXMgc2VsZWN0aW9uIChyZW5kZXJzIGdyYXllZDsgbm8gYXV0by1jbGVhciknLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVtb3RlU3RhdHVzID0gb2JzZXJ2YWJsZVZhbHVlPFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXM+KCdzdGF0dXMnLCBSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCk7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHsgY29ubmVjdGlvblN0YXR1czogcmVtb3RlU3RhdHVzIH0pO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtcmVtb3RlLTEnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2FnZW50aG9zdC1yZW1vdGUtMScpO1xuXG5cdFx0Ly8gRGlzY29ubmVjdCBcdTIwMTQgc2VsZWN0aW9uIGlzIHByZXNlcnZlZCAodGhlIHVzZXIgcGlja2VkIGl0OyB3ZSBrZWVwIGhvbm9yaW5nIGl0KS5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnYWdlbnRob3N0LXJlbW90ZS0xJywgJ1NlbGVjdGlvbiBzaG91bGQgYmUgcHJlc2VydmVkIG9uIGRpc2Nvbm5lY3QnKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIG9uLWRlbWFuZCByZWNlbnQgY29ubmVjdCBjbG9zZXMgcHJvZ3Jlc3Mgbm90aWZpY2F0aW9uIGFuZCByZXBvcnRzIGVycm9yJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5kaXNjb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHByb2dyZXNzID0gbmV3IEVtaXR0ZXI8eyByZWFkb25seSBjb25uZWN0aW9uS2V5OiBzdHJpbmc7IHJlYWRvbmx5IG1lc3NhZ2U6IHN0cmluZyB9PigpO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChwcm9ncmVzcyk7XG5cdFx0bGV0IGNvbm5lY3RDYWxscyA9IDA7XG5cdFx0Y29uc3QgcmVtb3RlUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2FnZW50aG9zdC1yZW1vdGUtMScsIHtcblx0XHRcdGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyxcblx0XHRcdGNhbkNvbm5lY3RPbkRlbWFuZDogdHJ1ZSxcblx0XHRcdHJlbW90ZUFkZHJlc3M6ICd3c2w6VWJ1bnR1LTI0LjA0Jyxcblx0XHRcdG9uRGlkUmVwb3J0Q29ubmVjdFByb2dyZXNzOiBwcm9ncmVzcy5ldmVudCxcblx0XHRcdGNvbm5lY3Q6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0Y29ubmVjdENhbGxzKys7XG5cdFx0XHRcdHByb2dyZXNzLmZpcmUoeyBjb25uZWN0aW9uS2V5OiAnd3NsOlVidW50dS0yNC4wNCcsIG1lc3NhZ2U6ICdPcGVuaW5nIFdTTC4uLicgfSk7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignYm9vbScpO1xuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zID0gbmV3IFJlY29yZGluZ05vdGlmaWNhdGlvblNlcnZpY2UoKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtyZW1vdGVQcm92aWRlcl0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UsIHVuZGVmaW5lZCwgbm90aWZpY2F0aW9ucywgRGlzcGF0Y2hpbmdXb3Jrc3BhY2VQaWNrZXIpIGFzIERpc3BhdGNoaW5nV29ya3NwYWNlUGlja2VyO1xuXG5cdFx0YXdhaXQgcGlja2VyLmRpc3BhdGNoRm9sZGVyKFVSSS5maWxlKCcvcmVtb3RlL3Byb2plY3QnKSwgJ2FnZW50aG9zdC1yZW1vdGUtMScpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjb25uZWN0Q2FsbHMsXG5cdFx0XHRwcm9ncmVzc0Nsb3NlZDogbm90aWZpY2F0aW9ucy5oYW5kbGVzWzBdPy5jbG9zZWQsXG5cdFx0XHRwcm9ncmVzc01lc3NhZ2VzOiBub3RpZmljYXRpb25zLmhhbmRsZXNbMF0/Lm1lc3NhZ2VzLFxuXHRcdFx0ZXJyb3JzOiBub3RpZmljYXRpb25zLmVycm9ycy5tYXAoZXJyb3IgPT4gU3RyaW5nKGVycm9yKSksXG5cdFx0XHRzZWxlY3RlZFByb3ZpZGVyOiBwaWNrZXIuc2VsZWN0ZWRSZXNvbHZlZD8ucHJvdmlkZXJJZCxcblx0XHR9LCB7XG5cdFx0XHRjb25uZWN0Q2FsbHM6IDEsXG5cdFx0XHRwcm9ncmVzc0Nsb3NlZDogdHJ1ZSxcblx0XHRcdHByb2dyZXNzTWVzc2FnZXM6IFsnQ29ubmVjdGluZyB0byBQcm92aWRlciBhZ2VudGhvc3QtcmVtb3RlLTEuLi4nLCAnT3BlbmluZyBXU0wuLi4nXSxcblx0XHRcdGVycm9yczogWydGYWlsZWQgdG8gY29ubmVjdCB0byBQcm92aWRlciBhZ2VudGhvc3QtcmVtb3RlLTEuJ10sXG5cdFx0XHRzZWxlY3RlZFByb3ZpZGVyOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyB0aGUgY2hvc2VuIHByb3ZpZGVyIHdoZW4gbXVsdGlwbGUgcHJvdmlkZXJzIHJlc29sdmUgdGhlIHNhbWUgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZvbGRlclVyaSA9IFVSSS5maWxlKCcvc2hhcmVkL3Byb2plY3QnKTtcblx0XHRjb25zdCBmaXJzdFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdmaXJzdCcpO1xuXHRcdGNvbnN0IHNlY29uZEJhc2VQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignc2Vjb25kJyk7XG5cdFx0Y29uc3Qgc2Vjb25kUHJvdmlkZXIgPSB7XG5cdFx0XHQuLi5zZWNvbmRCYXNlUHJvdmlkZXIsXG5cdFx0XHRicm93c2VBY3Rpb25zOiBbe1xuXHRcdFx0XHRsYWJlbDogJ1NlbGVjdC4uLicsXG5cdFx0XHRcdGdyb3VwOiBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9HSVRIVUIsXG5cdFx0XHRcdGljb246IENvZGljb24uZm9sZGVyT3BlbmVkLFxuXHRcdFx0XHRwcm92aWRlcklkOiAnc2Vjb25kJyxcblx0XHRcdFx0cnVuOiBhc3luYyAoKSA9PiBzZWNvbmRCYXNlUHJvdmlkZXIucmVzb2x2ZVdvcmtzcGFjZShmb2xkZXJVcmkpLFxuXHRcdFx0fV0sXG5cdFx0fSBzYXRpc2ZpZXMgSVNlc3Npb25zUHJvdmlkZXI7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2ZpcnN0UHJvdmlkZXIsIHNlY29uZFByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIERpc3BhdGNoaW5nV29ya3NwYWNlUGlja2VyKSBhcyBEaXNwYXRjaGluZ1dvcmtzcGFjZVBpY2tlcjtcblxuXHRcdGF3YWl0IHBpY2tlci5kaXNwYXRjaEZvbGRlcihmb2xkZXJVcmksICdzZWNvbmQnKTtcblx0XHRjb25zdCBkaXJlY3RQcm92aWRlciA9IHBpY2tlci5zZWxlY3RlZFJlc29sdmVkPy5wcm92aWRlcklkO1xuXHRcdGF3YWl0IHBpY2tlci5kaXNwYXRjaEl0ZW0oeyBicm93c2VBY3Rpb25JbmRleDogMCB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGlyZWN0UHJvdmlkZXIsXG5cdFx0XHRicm93c2VQcm92aWRlcjogcGlja2VyLnNlbGVjdGVkUmVzb2x2ZWQ/LnByb3ZpZGVySWQsXG5cdFx0fSwge1xuXHRcdFx0ZGlyZWN0UHJvdmlkZXI6ICdzZWNvbmQnLFxuXHRcdFx0YnJvd3NlUHJvdmlkZXI6ICdzZWNvbmQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNvbm5lY3Qga2VlcHMgdGhlIHNlbGVjdGlvbiAobm8gZXh0cmEgZXZlbnQgZmlyZXMpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3JlbW90ZVByb3ZpZGVyXSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblxuXHRcdC8vIERpc2Nvbm5lY3QgLyByZWNvbm5lY3QgY3ljbGUgXHUyMDE0IHNlbGVjdGlvbiBwcmVzZXJ2ZWQgdGhyb3VnaG91dC5cblx0XHRyZW1vdGVTdGF0dXMuc2V0KFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkLCB1bmRlZmluZWQpO1xuXHRcdHJlbW90ZVN0YXR1cy5zZXQoUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQsIHVuZGVmaW5lZCk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdhZ2VudGhvc3QtcmVtb3RlLTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoXG5cdFx0XHRwaWNrZXIuc2VsZWN0ZWRSZXNvbHZlZD8ud29ya3NwYWNlLmZvbGRlcnNbMF0/LnJvb3QucGF0aCxcblx0XHRcdCcvcmVtb3RlL3Byb2plY3QnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NoZWNrZWQgaXMgZ2xvYmFsbHkgdW5pcXVlIGFmdGVyIHBlcnNpc3QnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9jYWxQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdGNvbnN0IHJlbW90ZVN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzPignc3RhdHVzJywgUmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cy5jb25uZWN0ZWQpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7IGNvbm5lY3Rpb25TdGF0dXM6IHJlbW90ZVN0YXR1cyB9KTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9yZW1vdGUvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnYWdlbnRob3N0LXJlbW90ZS0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0eyB1cmk6IFVSSS5maWxlKCcvbG9jYWwvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnbG9jYWwtMScsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcmVtb3RlUHJvdmlkZXIsIGxvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFNlbGVjdCB0aGUgbG9jYWwgd29ya3NwYWNlXG5cdFx0Y29uc3QgcmVzb2x2ZWRXb3Jrc3BhY2UgPSBsb2NhbFByb3ZpZGVyLnJlc29sdmVXb3Jrc3BhY2UoVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JykpO1xuXHRcdGFzc2VydC5vayhyZXNvbHZlZFdvcmtzcGFjZSwgJ3Jlc29sdmVXb3Jrc3BhY2Ugc2hvdWxkIHJlc29sdmUgZmlsZTovLyBVUklzJyk7XG5cdFx0cGlja2VyLnNldFNlbGVjdGVkV29ya3NwYWNlKFVSSS5maWxlKCcvbG9jYWwvcHJvamVjdCcpLCB7IGZpcmVFdmVudDogZmFsc2UgfSk7XG5cblx0XHQvLyBWZXJpZnkgc3RvcmFnZTogb25seSB0aGUgbG9jYWwgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWRcblx0XHRjb25zdCByYXcgPSBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpO1xuXHRcdGFzc2VydC5vayhyYXcsICdTdG9yYWdlIHNob3VsZCBoYXZlIHJlY2VudCB3b3Jrc3BhY2VzJyk7XG5cdFx0Y29uc3Qgc3RvcmVkID0gSlNPTi5wYXJzZShyYXchKSBhcyB7IHVyaTogeyBwYXRoOiBzdHJpbmcgfTsgY2hlY2tlZDogYm9vbGVhbiB9W107XG5cdFx0Y29uc3QgY2hlY2tlZEVudHJpZXMgPSBzdG9yZWQuZmlsdGVyKGUgPT4gZS5jaGVja2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tlZEVudHJpZXMubGVuZ3RoLCAxLCAnT25seSBvbmUgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hlY2tlZEVudHJpZXNbMF0udXJpLnBhdGgsICcvbG9jYWwvcHJvamVjdCcsICdUaGUgbG9jYWwgZW50cnkgc2hvdWxkIGJlIGNoZWNrZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvZ3JhbW1hdGljIHdvcmtzcGFjZSBpbml0aWFsaXphdGlvbiBjYW4gYXZvaWQgcGVyc2lzdGluZyByZWNlbnRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblx0XHRjb25zdCBmb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb3Bvc2VkJyk7XG5cblx0XHRwaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoZm9sZGVyLCB7IGZpcmVFdmVudDogZmFsc2UsIHBlcnNpc3Q6IGZhbHNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZWxlY3RlZDogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0c3RvcmVkOiBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpLFxuXHRcdH0sIHtcblx0XHRcdHNlbGVjdGVkOiBmb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHN0b3JlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBwcm92aWRlciBpcyBuZXZlciB0cmVhdGVkIGFzIHVuYXZhaWxhYmxlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblxuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9sb2NhbC9wcm9qZWN0JyksIHByb3ZpZGVySWQ6ICdsb2NhbC0xJywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdF0pO1xuXG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnbG9jYWwtMScsICdMb2NhbCBwcm92aWRlciB3b3Jrc3BhY2Ugc2hvdWxkIGFsd2F5cyBiZSBzZWxlY3RhYmxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmUgcGlja3MgdGhlIHN0b3JlZCB3b3Jrc3BhY2Ugd2hlbiBpdHMgcHJvdmlkZXIgcmVnaXN0ZXJzIGFmdGVyIGFub3RoZXIgcHJvdmlkZXInLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogcHJldmlvdXNseSB0aGUgcGlja2VyIGZpbHRlcmVkIHJlc3RvcmUgdGhyb3VnaCBgYWN0aXZlUHJvdmlkZXJJZGAsXG5cdFx0Ly8gd2hpY2ggYXV0by1sb2NrZWQgdG8gd2hpY2hldmVyIHByb3ZpZGVyIHJlZ2lzdGVyZWQgZmlyc3QuIElmIHRoZSBzdG9yZWRcblx0XHQvLyB3b3Jrc3BhY2UgYmVsb25nZWQgdG8gYSBwcm92aWRlciB0aGF0IHJlZ2lzdGVyZWQgbGF0ZXIgdGhhbiBhbm90aGVyIGF2YWlsYWJsZVxuXHRcdC8vIHByb3ZpZGVyIChmb3IgZXhhbXBsZSwgbG9jYWwtYWdlbnQtaG9zdCByZWdpc3RlcmluZyBhZnRlciBkZWZhdWx0LWNvcGlsb3QpLFxuXHRcdC8vIHRoZSBzdG9yZWQgZW50cnkgd2FzIGZpbHRlcmVkIG91dCBhbmQgbmV2ZXIgcmVzdG9yZWQuXG5cdFx0Ly9cblx0XHQvLyBSZWFsaXN0aWMgc2hhcGU6IHN0b3JhZ2UgaG9sZHMgQk9USCBhIChub24tY2hlY2tlZCkgcmVjZW50IGZvciB0aGVcblx0XHQvLyBlYXJseS1yZWdpc3RlcmluZyBwcm92aWRlciBhbmQgYSAoY2hlY2tlZCkgcmVjZW50IGZvciB0aGUgbGF0ZS1yZWdpc3RlcmluZ1xuXHRcdC8vIHByb3ZpZGVyLiBUaGUgcGlja2VyIG1heSBicmllZmx5IHNob3cgdGhlIGVhcmx5IHJlY2VudCBhcyBhIGZhbGxiYWNrLCBidXRcblx0XHQvLyBvbmNlIHRoZSBjaGVja2VkIGVudHJ5J3MgcHJvdmlkZXIgcmVnaXN0ZXJzLCB0aGUgcGlja2VyIG11c3QgdXBncmFkZSB0byBpdC5cblx0XHRjb25zdCBjb3BpbG90UHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2RlZmF1bHQtY29waWxvdCcpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2NvcGlsb3Qvb2xkLXByb2plY3QnKSwgcHJvdmlkZXJJZDogJ2RlZmF1bHQtY29waWxvdCcsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XHR7IHVyaTogVVJJLmZpbGUoJy9hZ2VudC1ob3N0L3Byb2plY3QnKSwgcHJvdmlkZXJJZDogJ2xvY2FsLWFnZW50LWhvc3QnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XSk7XG5cblx0XHQvLyBDb25zdHJ1Y3QgcGlja2VyIHdpdGggb25seSB0aGUgZWFybHktcmVnaXN0ZXJpbmcgcHJvdmlkZXIgYXZhaWxhYmxlLlxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFRoZSBmYWxsYmFjayBtYXkgYmUgc2VsZWN0ZWQgaW5pdGlhbGx5IChlYXJseSBwcm92aWRlcidzIHJlY2VudCksXG5cdFx0Ly8gc2luY2UgdGhlIHVzZXIncyBjaGVja2VkIGVudHJ5J3MgcHJvdmlkZXIgaXNuJ3QgcmVhZHkgeWV0LlxuXHRcdC8vIE5vdyB0aGUgbGF0ZSBwcm92aWRlciBhcnJpdmVzLlxuXHRcdGNvbnN0IGFnZW50SG9zdFByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC1hZ2VudC1ob3N0Jyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2NvcGlsb3RQcm92aWRlciwgYWdlbnRIb3N0UHJvdmlkZXJdKTtcblxuXHRcdGFzc2VydFNlbGVjdGVkUHJvdmlkZXIocGlja2VyLCAnbG9jYWwtYWdlbnQtaG9zdCcsICdTdG9yZWQgd29ya3NwYWNlIHNob3VsZCBiZSByZXN0b3JlZCBvbmNlIGl0cyBwcm92aWRlciByZWdpc3RlcnMnKTtcblx0fSk7XG5cblx0dGVzdCgnbGF0ZS1yZWdpc3RlcmluZyBwcm92aWRlciBkb2VzIG5vdCBtb3ZlIHNlbGVjdGlvbiBvdXQgZnJvbSB1bmRlciB1c2VyJywgKCkgPT4ge1xuXHRcdC8vIEFmdGVyIHRoZSB1c2VyIGhhcyBleHBsaWNpdGx5IHBpY2tlZCBhIHdvcmtzcGFjZSwgYSBwcm92aWRlclxuXHRcdC8vIHJlZ2lzdGVyaW5nIGxhdGVyIGluIHRoZSBzZXNzaW9uIG11c3Qgbm90IHN3aXRjaCB0aGUgc2VsZWN0aW9uIHRvIGl0c1xuXHRcdC8vIHN0b3JlZCBcImNoZWNrZWRcIiBlbnRyeS4gV2Ugb25seSBkbyB0aGF0IGF1dG8tdXBncmFkZSBkdXJpbmcgaW5pdGlhbFxuXHRcdC8vIHN0YXJ0dXAgYmVmb3JlIHRoZSB1c2VyIGhhcyBhY3RlZC5cblx0XHRjb25zdCBjb3BpbG90UHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2RlZmF1bHQtY29waWxvdCcpO1xuXG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBVUkkuZmlsZSgnL2FnZW50LWhvc3QvcHJvamVjdCcpLCBwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRdKTtcblxuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBzdG9yYWdlKTtcblxuXHRcdC8vIFN1cHByZXNzaW9uIGtpY2tlZCBpbjogbm8gZmFsbGJhY2sgc2VsZWN0aW9uIHdoaWxlIGNoZWNrZWQgZW50cnkgaXMgcGVuZGluZy5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgdW5kZWZpbmVkLCAnTm8gZmFsbGJhY2sgd2hpbGUgY2hlY2tlZCBlbnRyeSBwZW5kaW5nJyk7XG5cblx0XHQvLyBVc2VyIGV4cGxpY2l0bHkgcGlja3MgYSBDb3BpbG90IHdvcmtzcGFjZS5cblx0XHRwaWNrZXIuc2V0U2VsZWN0ZWRXb3Jrc3BhY2UoVVJJLmZpbGUoJy9jb3BpbG90L3BpY2tlZCcpLCB7IGZpcmVFdmVudDogZmFsc2UgfSk7XG5cdFx0YXNzZXJ0U2VsZWN0ZWRQcm92aWRlcihwaWNrZXIsICdkZWZhdWx0LWNvcGlsb3QnLCAnVXNlciBwaWNrIGlzIGhvbm9yZWQnKTtcblxuXHRcdC8vIE5vdyB0aGUgbGF0ZSBwcm92aWRlciBmb3IgdGhlIChzdGlsbC1zdG9yZWQpIGNoZWNrZWQgZW50cnkgYXJyaXZlcy5cblx0XHRjb25zdCBhZ2VudEhvc3RQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtYWdlbnQtaG9zdCcpO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtjb3BpbG90UHJvdmlkZXIsIGFnZW50SG9zdFByb3ZpZGVyXSk7XG5cblx0XHRhc3NlcnRTZWxlY3RlZFByb3ZpZGVyKHBpY2tlciwgJ2RlZmF1bHQtY29waWxvdCcsICdVc2VyIHNlbGVjdGlvbiBpcyBwcmVzZXJ2ZWQgYWNyb3NzIGxhdGUgcHJvdmlkZXIgcmVnaXN0cmF0aW9uJyk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcicsICgpID0+IHtcblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cblx0dGVhcmRvd24oKCkgPT4gZGlzcG9zYWJsZXMuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc2VsZWN0cyBObyB3b3Jrc3BhY2UgYW5kIHJlc3RvcmVzIGEgZm9sZGVyIHRocm91Z2ggdGhlIHNhbWUgcGlja2VyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBmb2xkZXJVcmkgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBmb2xkZXJVcmksIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiB0cnVlIH1dKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblxuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0KSBhcyBUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXI7XG5cdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmksXG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH07XG5cdFx0Y29uc3QgbW9kZWwgPSBuZXcgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsKHN0YXRlKTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXHRcdGNvbnN0IGNvbnRhaW5lciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdHBpY2tlci5yZW5kZXIoY29udGFpbmVyKTtcblx0XHRjb25zdCByZWFkUHJlc2VudGF0aW9uID0gKCkgPT4gKHtcblx0XHRcdHRyaWdnZXJMYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5zZXNzaW9ucy1jaGF0LWRyb3Bkb3duLWxhYmVsJyk/LnRleHRDb250ZW50LFxuXHRcdFx0dHJpZ2dlckFyaWFMYWJlbDogY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoJy5hY3Rpb24tbGFiZWwnKT8uZ2V0QXR0cmlidXRlKCdhcmlhLWxhYmVsJyksXG5cdFx0XHRpdGVtczogcGlja2VyLmdldEl0ZW1TdGF0ZXMoKS5maWx0ZXIoaXRlbSA9PiBpdGVtLmxhYmVsID09PSAnTm8gd29ya3NwYWNlJyB8fCBpdGVtLmxhYmVsID09PSAnbG9jYWwvcHJvamVjdCcpLFxuXHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0LFxuXHRcdFx0Zm9sZGVyVXJpOiBtb2RlbC5mb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cblx0XHRjb25zdCB3b3Jrc3BhY2UgPSByZWFkUHJlc2VudGF0aW9uKCk7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnTm8gd29ya3NwYWNlJyk7XG5cdFx0Y29uc3Qgbm9Xb3Jrc3BhY2UgPSByZWFkUHJlc2VudGF0aW9uKCk7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnbG9jYWwvcHJvamVjdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR3b3Jrc3BhY2UsXG5cdFx0XHRub1dvcmtzcGFjZSxcblx0XHRcdHJlc3RvcmVkV29ya3NwYWNlOiByZWFkUHJlc2VudGF0aW9uKCksXG5cdFx0fSwge1xuXHRcdFx0d29ya3NwYWNlOiB7XG5cdFx0XHRcdHRyaWdnZXJMYWJlbDogJ2xvY2FsL3Byb2plY3QnLFxuXHRcdFx0XHR0cmlnZ2VyQXJpYUxhYmVsOiAnQXV0b21hdGlvbiB0YXJnZXQsIGxvY2FsL3Byb2plY3QnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdObyB3b3Jrc3BhY2UnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsgbGFiZWw6ICdsb2NhbC9wcm9qZWN0JywgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRcdGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksXG5cdFx0XHR9LFxuXHRcdFx0bm9Xb3Jrc3BhY2U6IHtcblx0XHRcdFx0dHJpZ2dlckxhYmVsOiAnTm8gd29ya3NwYWNlJyxcblx0XHRcdFx0dHJpZ2dlckFyaWFMYWJlbDogJ0F1dG9tYXRpb24gdGFyZ2V0LCBObyB3b3Jrc3BhY2UnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgbGFiZWw6ICdObyB3b3Jrc3BhY2UnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ2xvY2FsL3Byb2plY3QnLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdFx0cmVzdG9yZWRXb3Jrc3BhY2U6IHtcblx0XHRcdFx0dHJpZ2dlckxhYmVsOiAnbG9jYWwvcHJvamVjdCcsXG5cdFx0XHRcdHRyaWdnZXJBcmlhTGFiZWw6ICdBdXRvbWF0aW9uIHRhcmdldCwgbG9jYWwvcHJvamVjdCcsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyBsYWJlbDogJ05vIHdvcmtzcGFjZScsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XHRcdFx0eyBsYWJlbDogJ2xvY2FsL3Byb2plY3QnLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0XHRcdFx0Zm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXIgd29ya3NwYWNlIHNlbGVjdGlvbnMgZG8gbm90IHVwZGF0ZSByZWNlbnQgd29ya3NwYWNlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyk7XG5cdFx0Y29uc3Qgb3JpZ2luYWxGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL29yaWdpbmFsJyk7XG5cdFx0Y29uc3QgcHJvcG9zZWRGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb3Bvc2VkJyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBvcmlnaW5hbEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBwcm9wb3NlZEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgYmVmb3JlID0gc3RvcmFnZS5nZXQoU1RPUkFHRV9LRVlfUkVDRU5UX1dPUktTUEFDRVMsIFN0b3JhZ2VTY29wZS5QUk9GSUxFKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChuZXcgQXV0b21hdGlvbklzb2xhdGlvbk1vZGVsKHtcblx0XHRcdGlzUXVpY2tDaGF0OiBmYWxzZSxcblx0XHRcdGZvbGRlclVyaTogb3JpZ2luYWxGb2xkZXIsXG5cdFx0XHRpc29sYXRpb25Nb2RlOiAnd29ya3NwYWNlJyxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ2xvY2FsL3Byb3Bvc2VkJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlbGVjdGVkOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0XHRzdG9yYWdlVW5jaGFuZ2VkOiBzdG9yYWdlLmdldChTVE9SQUdFX0tFWV9SRUNFTlRfV09SS1NQQUNFUywgU3RvcmFnZVNjb3BlLlBST0ZJTEUpID09PSBiZWZvcmUsXG5cdFx0fSwge1xuXHRcdFx0c2VsZWN0ZWQ6IHByb3Bvc2VkRm9sZGVyLnRvU3RyaW5nKCksXG5cdFx0XHRzdG9yYWdlVW5jaGFuZ2VkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgcHJldmlvdXMgd29ya3NwYWNlIHdoZW4gdHJ1c3QgaXMgZGVjbGluZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpO1xuXHRcdGNvbnN0IHNlbGVjdGVkRm9sZGVyID0gVVJJLmZpbGUoJy9sb2NhbC9zZWxlY3RlZCcpO1xuXHRcdGNvbnN0IGNhbmRpZGF0ZUZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvY2FuZGlkYXRlJyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBzZWxlY3RlZEZvbGRlciwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQsIGNoZWNrZWQ6IHRydWUgfSxcblx0XHRcdHsgdXJpOiBjYW5kaWRhdGVGb2xkZXIsIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiBmYWxzZSB9LFxuXHRcdF0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtwcm92aWRlcl0pO1xuXHRcdGNvbnN0IHRydXN0UmVxdWVzdHM6IEFycmF5PHsgZm9sZGVyVXJpOiBzdHJpbmc7IHByb3ZpZGVySWQ6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHRzdG9yYWdlLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7fSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHtcblx0XHRcdFx0Y2FuU2VsZWN0V29ya3NwYWNlOiBhc3luYyAoZm9sZGVyVXJpLCBwcm92aWRlcklkKSA9PiB7XG5cdFx0XHRcdFx0dHJ1c3RSZXF1ZXN0cy5wdXNoKHsgZm9sZGVyVXJpOiBmb2xkZXJVcmkudG9TdHJpbmcoKSwgcHJvdmlkZXJJZCB9KTtcblx0XHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IHNlbGVjdGVkRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnbG9jYWwvY2FuZGlkYXRlJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRydXN0UmVxdWVzdHMsXG5cdFx0XHRtb2RlbEZvbGRlclVyaTogbW9kZWwuZm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0cGlja2VyRm9sZGVyVXJpOiBwaWNrZXIuc2VsZWN0ZWRGb2xkZXJVcmk/LnRvU3RyaW5nKCksXG5cdFx0fSwge1xuXHRcdFx0dHJ1c3RSZXF1ZXN0czogW3sgZm9sZGVyVXJpOiBjYW5kaWRhdGVGb2xkZXIudG9TdHJpbmcoKSwgcHJvdmlkZXJJZDogcHJvdmlkZXIuaWQgfV0sXG5cdFx0XHRtb2RlbEZvbGRlclVyaTogc2VsZWN0ZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogc2VsZWN0ZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdGFsZSB0cnVzdCBncmFudCBjYW5ub3Qgb3ZlcnJpZGUgYSBuZXdlciBObyB3b3Jrc3BhY2UgY2hvaWNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCBzZWxlY3RlZEZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvc2VsZWN0ZWQnKTtcblx0XHRjb25zdCBjYW5kaWRhdGVGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL2NhbmRpZGF0ZScpO1xuXHRcdGNvbnN0IHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RTdG9yYWdlU2VydmljZSgpKTtcblx0XHRzZWVkU3RvcmFnZShzdG9yYWdlLCBbXG5cdFx0XHR7IHVyaTogc2VsZWN0ZWRGb2xkZXIsIHByb3ZpZGVySWQ6IHByb3ZpZGVyLmlkLCBjaGVja2VkOiB0cnVlIH0sXG5cdFx0XHR7IHVyaTogY2FuZGlkYXRlRm9sZGVyLCBwcm92aWRlcklkOiBwcm92aWRlci5pZCwgY2hlY2tlZDogZmFsc2UgfSxcblx0XHRdKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblx0XHRjb25zdCB0cnVzdFJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8Ym9vbGVhbj4oKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdFx0e30sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7IGNhblNlbGVjdFdvcmtzcGFjZTogKCkgPT4gdHJ1c3RSZXN1bHQucCB9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IHNlbGVjdGVkRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0Y29uc3Qgc3RhbGVTZWxlY3Rpb24gPSBwaWNrZXIuc2VsZWN0KCdsb2NhbC9jYW5kaWRhdGUnKTtcblx0XHRhd2FpdCBwaWNrZXIuc2VsZWN0KCdObyB3b3Jrc3BhY2UnKTtcblx0XHRhd2FpdCB0cnVzdFJlc3VsdC5jb21wbGV0ZSh0cnVlKTtcblx0XHRhd2FpdCBzdGFsZVNlbGVjdGlvbjtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IG1vZGVsLmlzUXVpY2tDaGF0LFxuXHRcdFx0Zm9sZGVyVXJpOiBtb2RlbC5mb2xkZXJVcmksXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IHBpY2tlci5zZWxlY3RlZEZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHR9LCB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0cGlja2VyRm9sZGVyVXJpOiBzZWxlY3RlZEZvbGRlci50b1N0cmluZygpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHN0YWxlIHJlbW90ZSBzZWxlY3Rpb24gY2Fubm90IG92ZXJyaWRlIGEgbmV3ZXIgTm8gd29ya3NwYWNlIGNob2ljZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGxvY2FsUHJvdmlkZXIgPSBjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKTtcblx0XHRjb25zdCByZW1vdGVTdGF0dXMgPSBvYnNlcnZhYmxlVmFsdWU8UmVtb3RlQWdlbnRIb3N0Q29ubmVjdGlvblN0YXR1cz4oJ3JlbW90ZVN0YXR1cycsIFJlbW90ZUFnZW50SG9zdENvbm5lY3Rpb25TdGF0dXMuZGlzY29ubmVjdGVkKTtcblx0XHRjb25zdCBjb25uZWN0U3RhcnRlZCA9IG5ldyBEZWZlcnJlZFByb21pc2U8dm9pZD4oKTtcblx0XHRjb25zdCBmaW5pc2hDb25uZWN0ID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdGNvbnN0IHJlbW90ZVByb3ZpZGVyID0gY3JlYXRlTW9ja1Byb3ZpZGVyKCdhZ2VudGhvc3QtcmVtb3RlLTEnLCB7XG5cdFx0XHRjb25uZWN0aW9uU3RhdHVzOiByZW1vdGVTdGF0dXMsXG5cdFx0XHRjYW5Db25uZWN0T25EZW1hbmQ6IHRydWUsXG5cdFx0XHRjb25uZWN0OiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdGF3YWl0IGNvbm5lY3RTdGFydGVkLmNvbXBsZXRlKCk7XG5cdFx0XHRcdGF3YWl0IGZpbmlzaENvbm5lY3QucDtcblx0XHRcdFx0cmVtb3RlU3RhdHVzLnNldChSZW1vdGVBZ2VudEhvc3RDb25uZWN0aW9uU3RhdHVzLmNvbm5lY3RlZCwgdW5kZWZpbmVkKTtcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0Y29uc3QgbG9jYWxGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL3Byb2plY3QnKTtcblx0XHRjb25zdCByZW1vdGVGb2xkZXIgPSBVUkkuZmlsZSgnL3JlbW90ZS9wcm9qZWN0Jyk7XG5cdFx0Y29uc3Qgc3RvcmFnZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpO1xuXHRcdHNlZWRTdG9yYWdlKHN0b3JhZ2UsIFtcblx0XHRcdHsgdXJpOiBsb2NhbEZvbGRlciwgcHJvdmlkZXJJZDogbG9jYWxQcm92aWRlci5pZCwgY2hlY2tlZDogdHJ1ZSB9LFxuXHRcdFx0eyB1cmk6IHJlbW90ZUZvbGRlciwgcHJvdmlkZXJJZDogcmVtb3RlUHJvdmlkZXIuaWQsIGNoZWNrZWQ6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2xvY2FsUHJvdmlkZXIsIHJlbW90ZVByb3ZpZGVyXSk7XG5cblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0c3RvcmFnZSxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IGxvY2FsRm9sZGVyLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogJ3dvcmtzcGFjZScsXG5cdFx0XHRicmFuY2g6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0XHRwaWNrZXIuc2V0VGFyZ2V0TW9kZWwobW9kZWwpO1xuXG5cdFx0Y29uc3Qgc3RhbGVTZWxlY3Rpb24gPSBwaWNrZXIuc2VsZWN0KCdyZW1vdGUvcHJvamVjdCcpO1xuXHRcdGF3YWl0IGNvbm5lY3RTdGFydGVkLnA7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnTm8gd29ya3NwYWNlJyk7XG5cdFx0YXdhaXQgZmluaXNoQ29ubmVjdC5jb21wbGV0ZSgpO1xuXHRcdGF3YWl0IHN0YWxlU2VsZWN0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdH0sIHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IGxvY2FsRm9sZGVyLnRvU3RyaW5nKCksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Jyb3dzaW5nIHRvIGEgZm9sZGVyIGV4aXRzIE5vIHdvcmtzcGFjZSBtb2RlJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmFsbGJhY2tQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcignZmFsbGJhY2snKTtcblx0XHRjb25zdCBsb2NhbFByb3ZpZGVyID0geyAuLi5jcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsLTEnKSwgc3VwcG9ydHNMb2NhbFdvcmtzcGFjZXM6IHRydWUgfTtcblx0XHRjb25zdCBwcm9kdWNpbmdQcm92aWRlciA9IHsgLi4uY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC1hZ2VudC1ob3N0JyksIHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzOiB0cnVlIH07XG5cdFx0Y29uc3QgYnJvd3NlZEZvbGRlciA9IFVSSS5maWxlKCcvYWdlbnQtaG9zdC9icm93c2VkJyk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2ZhbGxiYWNrUHJvdmlkZXIsIGxvY2FsUHJvdmlkZXIsIHByb2R1Y2luZ1Byb3ZpZGVyXSk7XG5cdFx0Y29uc3QgdHJ1c3RSZXF1ZXN0czogQXJyYXk8eyBmb2xkZXJVcmk6IHN0cmluZzsgcHJvdmlkZXJJZDogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdFBpY2tlcihcblx0XHRcdGRpc3Bvc2FibGVzLFxuXHRcdFx0cHJvdmlkZXJzU2VydmljZSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdG5ldyBUZXN0Tm90aWZpY2F0aW9uU2VydmljZSgpLFxuXHRcdFx0VGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyLFxuXHRcdFx0eyBzaG93T3BlbkRpYWxvZzogYXN5bmMgKCkgPT4gW2Jyb3dzZWRGb2xkZXJdIH0sXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR7XG5cdFx0XHRcdGNhblNlbGVjdFdvcmtzcGFjZTogYXN5bmMgKGZvbGRlclVyaSwgcHJvdmlkZXJJZCkgPT4ge1xuXHRcdFx0XHRcdHRydXN0UmVxdWVzdHMucHVzaCh7IGZvbGRlclVyaTogZm9sZGVyVXJpLnRvU3RyaW5nKCksIHByb3ZpZGVySWQgfSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cGlja2VyLnNldFRhcmdldE1vZGVsKG1vZGVsKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaT8udG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpPy50b1N0cmluZygpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0cyxcblx0XHR9LCB7XG5cdFx0XHRpc1F1aWNrQ2hhdDogZmFsc2UsXG5cdFx0XHRmb2xkZXJVcmk6IGJyb3dzZWRGb2xkZXIudG9TdHJpbmcoKSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogYnJvd3NlZEZvbGRlci50b1N0cmluZygpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0czogW3sgZm9sZGVyVXJpOiBicm93c2VkRm9sZGVyLnRvU3RyaW5nKCksIHByb3ZpZGVySWQ6IHByb2R1Y2luZ1Byb3ZpZGVyLmlkIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGF5cyBpbiBObyB3b3Jrc3BhY2UgbW9kZSB3aGVuIHRydXN0IGlzIGRlY2xpbmVkIGZvciBhIGJyb3dzZWQgZm9sZGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3ZpZGVyc1NlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKSk7XG5cdFx0Y29uc3QgcHJvdmlkZXIgPSB7IC4uLmNyZWF0ZU1vY2tQcm92aWRlcignbG9jYWwtMScpLCBzdXBwb3J0c0xvY2FsV29ya3NwYWNlczogdHJ1ZSB9O1xuXHRcdGNvbnN0IGJyb3dzZWRGb2xkZXIgPSBVUkkuZmlsZSgnL2xvY2FsL2Jyb3dzZWQnKTtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbcHJvdmlkZXJdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7IHNob3dPcGVuRGlhbG9nOiBhc3luYyAoKSA9PiBbYnJvd3NlZEZvbGRlcl0gfSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdHsgY2FuU2VsZWN0V29ya3NwYWNlOiBhc3luYyAoKSA9PiBmYWxzZSB9LFxuXHRcdCkgYXMgVGVzdEF1dG9tYXRpb25zV29ya3NwYWNlUGlja2VyO1xuXHRcdGNvbnN0IG1vZGVsID0gbmV3IEF1dG9tYXRpb25Jc29sYXRpb25Nb2RlbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogdHJ1ZSxcblx0XHRcdGZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0aXNvbGF0aW9uTW9kZTogdW5kZWZpbmVkLFxuXHRcdFx0YnJhbmNoOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0cGlja2VyLnNldFRhcmdldE1vZGVsKG1vZGVsKTtcblxuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpLFxuXHRcdH0sIHtcblx0XHRcdGlzUXVpY2tDaGF0OiB0cnVlLFxuXHRcdFx0Zm9sZGVyVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRwaWNrZXJGb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSBzdGFsZSBicm93c2UgcmVzdWx0IGRvZXMgbm90IHJlcXVlc3QgdHJ1c3QgYWZ0ZXIgYSBuZXdlciBjaG9pY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcHJvdmlkZXJzU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgTW9ja1Nlc3Npb25zUHJvdmlkZXJzU2VydmljZSgpKTtcblx0XHRjb25zdCBwcm92aWRlciA9IHsgLi4uY3JlYXRlTW9ja1Byb3ZpZGVyKCdsb2NhbC0xJyksIHN1cHBvcnRzTG9jYWxXb3Jrc3BhY2VzOiB0cnVlIH07XG5cdFx0Y29uc3QgYnJvd3NlZEZvbGRlciA9IFVSSS5maWxlKCcvbG9jYWwvYnJvd3NlZCcpO1xuXHRcdGNvbnN0IGJyb3dzZVJlc3VsdCA9IG5ldyBEZWZlcnJlZFByb21pc2U8VVJJW10gfCB1bmRlZmluZWQ+KCk7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW3Byb3ZpZGVyXSk7XG5cdFx0bGV0IHRydXN0UmVxdWVzdENvdW50ID0gMDtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0UGlja2VyKFxuXHRcdFx0ZGlzcG9zYWJsZXMsXG5cdFx0XHRwcm92aWRlcnNTZXJ2aWNlLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0bmV3IFRlc3ROb3RpZmljYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRUZXN0QXV0b21hdGlvbnNXb3Jrc3BhY2VQaWNrZXIsXG5cdFx0XHR7IHNob3dPcGVuRGlhbG9nOiAoKSA9PiBicm93c2VSZXN1bHQucCB9LFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0e1xuXHRcdFx0XHRjYW5TZWxlY3RXb3Jrc3BhY2U6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHR0cnVzdFJlcXVlc3RDb3VudCsrO1xuXHRcdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHQpIGFzIFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcjtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChtb2RlbCk7XG5cblx0XHRjb25zdCBzdGFsZVNlbGVjdGlvbiA9IHBpY2tlci5zZWxlY3QoJ1NlbGVjdC4uLicpO1xuXHRcdGF3YWl0IHBpY2tlci5zZWxlY3QoJ05vIHdvcmtzcGFjZScpO1xuXHRcdGF3YWl0IGJyb3dzZVJlc3VsdC5jb21wbGV0ZShbYnJvd3NlZEZvbGRlcl0pO1xuXHRcdGF3YWl0IHN0YWxlU2VsZWN0aW9uO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc1F1aWNrQ2hhdDogbW9kZWwuaXNRdWlja0NoYXQsXG5cdFx0XHRmb2xkZXJVcmk6IG1vZGVsLmZvbGRlclVyaSxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogcGlja2VyLnNlbGVjdGVkRm9sZGVyVXJpLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQsXG5cdFx0fSwge1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdHBpY2tlckZvbGRlclVyaTogdW5kZWZpbmVkLFxuXHRcdFx0dHJ1c3RSZXF1ZXN0Q291bnQ6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ05vIHdvcmtzcGFjZSBpcyByZXByZXNlbnRlZCBhcyBhIGNoZWNrZWQgbW9iaWxlIHNoZWV0IHJvdycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcnNTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RQaWNrZXIoXG5cdFx0XHRkaXNwb3NhYmxlcyxcblx0XHRcdHByb3ZpZGVyc1NlcnZpY2UsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHRuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSxcblx0XHRcdFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcixcblx0XHQpIGFzIFRlc3RBdXRvbWF0aW9uc1dvcmtzcGFjZVBpY2tlcjtcblx0XHRjb25zdCBtb2RlbCA9IG5ldyBBdXRvbWF0aW9uSXNvbGF0aW9uTW9kZWwoe1xuXHRcdFx0aXNRdWlja0NoYXQ6IHRydWUsXG5cdFx0XHRmb2xkZXJVcmk6IHVuZGVmaW5lZCxcblx0XHRcdGlzb2xhdGlvbk1vZGU6IHVuZGVmaW5lZCxcblx0XHRcdGJyYW5jaDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHRcdHBpY2tlci5zZXRUYXJnZXRNb2RlbChtb2RlbCk7XG5cblx0XHRjb25zdCByb3dzID0gYnVpbGRNb2JpbGVXb3Jrc3BhY2VQaWNrZXJSb3dzKHBpY2tlci5nZXRJdGVtcygpLCAoKSA9PiB7IH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb3dzLm1hcChyb3cgPT4gcm93LnNoZWV0SXRlbSksIFt7XG5cdFx0XHRpZDogJ2l0ZW06MCcsXG5cdFx0XHRsYWJlbDogJ05vIHdvcmtzcGFjZScsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ1J1biB3aXRob3V0IGEgYmFja2luZyB3b3Jrc3BhY2UnLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbixcblx0XHRcdGNoZWNrZWQ6IHRydWUsXG5cdFx0XHRkaXNhYmxlZDogdW5kZWZpbmVkLFxuXHRcdFx0c2VjdGlvblRpdGxlOiB1bmRlZmluZWQsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtb2JpbGUgd29ya3NwYWNlIGhlYWRlciBhY3Rpb24gZGlzcGF0Y2hlcyBicm93c2luZyBhZnRlciB0aGUgc2hlZXQgY2xvc2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtiZW5jaCA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2RpdicpO1xuXHRcdGRvY3VtZW50LmJvZHkuYXBwZW5kKHdvcmtiZW5jaCk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHsgZGlzcG9zZTogKCkgPT4gd29ya2JlbmNoLnJlbW92ZSgpIH0pO1xuXHRcdGNvbnN0IHRyaWdnZXIgPSB3b3JrYmVuY2guYXBwZW5kQ2hpbGQoZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnYnV0dG9uJykpO1xuXHRcdGNvbnN0IGRpc3BhdGNoZWQ6IElXb3Jrc3BhY2VQaWNrZXJJdGVtW10gPSBbXTtcblx0XHRjb25zdCBzaGVldCA9IHNob3dNb2JpbGVXb3Jrc3BhY2VQaWNrZXJTaGVldChcblx0XHRcdHVwY2FzdFBhcnRpYWw8SVdvcmtiZW5jaExheW91dFNlcnZpY2U+KHsgbWFpbkNvbnRhaW5lcjogd29ya2JlbmNoIH0pLFxuXHRcdFx0dHJpZ2dlcixcblx0XHRcdFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6ICdObyB3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5jb21tZW50RGlzY3Vzc2lvbiB9LFxuXHRcdFx0XHRcdGl0ZW06IHsgcnVuOiAoKSA9PiB7IH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IEFjdGlvbkxpc3RJdGVtS2luZC5BY3Rpb24sXG5cdFx0XHRcdFx0bGFiZWw6ICdTZWxlY3QuLi4nLFxuXHRcdFx0XHRcdGdyb3VwOiB7IHRpdGxlOiAnJywgaWNvbjogQ29kaWNvbi5mb2xkZXJPcGVuZWQgfSxcblx0XHRcdFx0XHRpdGVtOiB7IGJyb3dzZUFjdGlvbkluZGV4OiAwIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdFx0aXRlbSA9PiBkaXNwYXRjaGVkLnB1c2goaXRlbSksXG5cdFx0XHRbbWFrZUJyb3dzZUFjdGlvbignbG9jYWwtMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCAnU2VsZWN0Li4uJyldLFxuXHRcdCk7XG5cdFx0Y29uc3QgaGVhZGVyQWN0aW9uID0gd29ya2JlbmNoLnF1ZXJ5U2VsZWN0b3I8SFRNTEJ1dHRvbkVsZW1lbnQ+KCcubW9iaWxlLXBpY2tlci1zaGVldC1oZWFkZXItYWN0aW9uJyk7XG5cdFx0YXNzZXJ0Lm9rKGhlYWRlckFjdGlvbik7XG5cblx0XHRoZWFkZXJBY3Rpb24uY2xpY2soKTtcblx0XHRhd2FpdCBzaGVldDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGlzcGF0Y2hlZCwgW3sgYnJvd3NlQWN0aW9uSW5kZXg6IDAgfV0pO1xuXHR9KTtcbn0pO1xuXG4vLyAtLS0tIFRhYiBkaXNjb3ZlcnkgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogTWluaW1hbCBzdWJjbGFzcyB0aGF0IGV4cG9zZXMgdGhlIHByb3RlY3RlZCBgX2dldEF2YWlsYWJsZVRhYnNgIGZvciB0ZXN0aW5nLiAqL1xuY2xhc3MgVGVzdGFibGVQaWNrZXIgZXh0ZW5kcyBXb3Jrc3BhY2VQaWNrZXIge1xuXHRnZXRBdmFpbGFibGVUYWJzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5fZ2V0QXZhaWxhYmxlVGFicygpLm1hcCh0ID0+IHQuaWQpO1xuXHR9XG5cblx0c2VsZWN0V29ya3NwYWNlR3JvdXAoZ3JvdXA6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX3NlbGVjdFdvcmtzcGFjZUdyb3VwKGdyb3VwKTtcblx0fVxuXG5cdGdldEl0ZW1zKCkge1xuXHRcdHJldHVybiB0aGlzLl9idWlsZEl0ZW1zKCk7XG5cdH1cblxuXHRnZXRJdGVtTGFiZWxzKCk6IHN0cmluZ1tdIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRJdGVtcygpLmZsYXRNYXAoZW50cnkgPT4gZW50cnkubGFiZWwgPyBbZW50cnkubGFiZWxdIDogW10pO1xuXHR9XG5cblx0YXN5bmMgc2VsZWN0KGxhYmVsOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMuZ2V0SXRlbXMoKS5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUubGFiZWwgPT09IGxhYmVsKTtcblx0XHRhc3NlcnQub2soZW50cnk/Lml0ZW0sIGBFeHBlY3RlZCBwaWNrZXIgaXRlbSAnJHtsYWJlbH0nYCk7XG5cdFx0YXdhaXQgdGhpcy5fZGlzcGF0Y2hQaWNrZXJJdGVtKGVudHJ5Lml0ZW0pO1xuXHR9XG59XG5cbmZ1bmN0aW9uIG1ha2VCcm93c2VBY3Rpb24ocHJvdmlkZXJJZDogc3RyaW5nLCBncm91cDogc3RyaW5nIHwgdW5kZWZpbmVkLCBsYWJlbCA9ICdicm93c2UnKTogSVNlc3Npb25Xb3Jrc3BhY2VCcm93c2VBY3Rpb24ge1xuXHRyZXR1cm4ge1xuXHRcdGxhYmVsLFxuXHRcdGdyb3VwLFxuXHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdHByb3ZpZGVySWQsXG5cdFx0cnVuOiBhc3luYyAoKSA9PiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVRlc3RhYmxlUGlja2VyKFxuXHRkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlLFxuXHRwcm92aWRlcnNTZXJ2aWNlOiBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlLFxuXHRyZW1vdGVBZ2VudEhvc3RzRW5hYmxlZCA9IHRydWUsXG5cdG9wdGlvbnM6IElXb3Jrc3BhY2VQaWNrZXJPcHRpb25zID0ge30sXG5cdGNvbW1hbmRTZXJ2aWNlOiBQYXJ0aWFsPElDb21tYW5kU2VydmljZT4gPSB7IGV4ZWN1dGVDb21tYW5kOiBhc3luYyAoKSA9PiB7IH0gfSxcblx0c3RvcmFnZVNlcnZpY2U6IElTdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpLFxuKTogVGVzdGFibGVQaWNrZXIge1xuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCB7IGlzVmlzaWJsZTogZmFsc2UsIGhpZGU6ICgpID0+IHsgfSwgc2hvdzogKCkgPT4geyB9IH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0Vmlld1NlcnZpY2UsIHsgc2hvd0NvbnRleHRWaWV3OiAoKSA9PiAoeyBjbG9zZTogKCkgPT4geyB9IH0pLCBoaWRlQ29udGV4dFZpZXc6ICgpID0+IHsgfSwgbGF5b3V0OiAoKSA9PiB7IH0gfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVN0b3JhZ2VTZXJ2aWNlLCBzdG9yYWdlU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVVyaUlkZW50aXR5U2VydmljZSwgeyBleHRVcmkgfSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUHJvdmlkZXJzU2VydmljZSwgcHJvdmlkZXJzU2VydmljZSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJUXVpY2tJbnB1dFNlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ2xpcGJvYXJkU2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcmVmZXJlbmNlc1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJT3V0cHV0U2VydmljZSwge30pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb25maWd1cmF0aW9uU2VydmljZSwgbmV3IFRlc3RDb25maWd1cmF0aW9uU2VydmljZSh7IFtSZW1vdGVBZ2VudEhvc3RzRW5hYmxlZFNldHRpbmdJZF06IHJlbW90ZUFnZW50SG9zdHNFbmFibGVkIH0pKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29tbWFuZFNlcnZpY2UsIGNvbW1hbmRTZXJ2aWNlKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZURpYWxvZ1NlcnZpY2UsIHt9KTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUZpbGVTZXJ2aWNlPih7XG5cdFx0b25EaWRDaGFuZ2VGaWxlU3lzdGVtUHJvdmlkZXJSZWdpc3RyYXRpb25zOiBFdmVudC5Ob25lLFxuXHRcdGhhc1Byb3ZpZGVyOiAoKSA9PiB0cnVlLFxuXHRcdGV4aXN0czogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0fSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb250ZXh0S2V5U2VydmljZSwgbmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKTtcblx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWVudVNlcnZpY2UsIHtcblx0XHRjcmVhdGVNZW51OiAoKSA9PiAoeyBvbkRpZENoYW5nZTogRXZlbnQuTm9uZSwgZ2V0QWN0aW9uczogKCkgPT4gW10sIGRpc3Bvc2U6ICgpID0+IHsgfSB9KSxcblx0XHRnZXRNZW51QWN0aW9uczogKCkgPT4gW10sXG5cdH0pO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElOb3RpZmljYXRpb25TZXJ2aWNlLCBuZXcgVGVzdE5vdGlmaWNhdGlvblNlcnZpY2UoKSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVdvcmtzcGFjZXNTZXJ2aWNlLCB7XG5cdFx0Z2V0UmVjZW50bHlPcGVuZWQ6IGFzeW5jICgpID0+ICh7IHdvcmtzcGFjZXM6IFtdLCBmaWxlczogW10gfSksXG5cdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0fSk7XG5cdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zUmVjZW50V29ya3NwYWNlc1NlcnZpY2UsIGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlKSkpO1xuXHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdHJldHVybiBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoVGVzdGFibGVQaWNrZXIsIG9wdGlvbnMpKTtcbn1cblxuc3VpdGUoJ1dvcmtzcGFjZVBpY2tlciAtIFRhYiBkaXNjb3ZlcnknLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBwcm92aWRlcnNTZXJ2aWNlOiBNb2NrU2Vzc2lvbnNQcm92aWRlcnNTZXJ2aWNlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRwcm92aWRlcnNTZXJ2aWNlID0gbmV3IE1vY2tTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UoKTtcblx0XHRkaXNwb3NhYmxlcy5hZGQocHJvdmlkZXJzU2VydmljZSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IGRpc3Bvc2FibGVzLmNsZWFyKCkpO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ3JldHVybnMgUmVtb3RlIGdyb3VwIGV2ZW4gd2hlbiBubyBwcm92aWRlcnMgY29udHJpYnV0ZSBncm91cHMnLCAoKSA9PiB7XG5cdFx0cHJvdmlkZXJzU2VydmljZS5zZXRQcm92aWRlcnMoW2NyZWF0ZU1vY2tQcm92aWRlcigncDEnKV0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksIFtTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgnaGlkZXMgUmVtb3RlIGdyb3VwIHdoZW4gcmVtb3RlIGFnZW50IGhvc3RzIGFyZSBkaXNhYmxlZCcsICgpID0+IHtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ3AxJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbigncDEnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUpXSB9KSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0YWJsZVBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSwgZmFsc2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldEF2YWlsYWJsZVRhYnMoKSwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdvcmRlcnMgd2VsbC1rbm93biBncm91cHMgTG9jYWwgZmlyc3QsIHRoZW4gYWxwaGFiZXRpY2FsJywgKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncmVtb3RlJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbigncmVtb3RlJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFKV0gfSksXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ2Nsb3VkJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbignY2xvdWQnLCAnQ2xvdWQnKV0gfSksXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ2xvY2FsJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbignbG9jYWwnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCldIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksIFtTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCwgJ0Nsb3VkJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlZHVwbGljYXRlcyBncm91cHMgY29udHJpYnV0ZWQgYnkgbXVsdGlwbGUgcHJvdmlkZXJzIC8gYWN0aW9ucycsICgpID0+IHtcblx0XHRwcm92aWRlcnNTZXJ2aWNlLnNldFByb3ZpZGVycyhbXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ3AxJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbigncDEnLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9MT0NBTCldIH0pLFxuXHRcdFx0Y3JlYXRlTW9ja1Byb3ZpZGVyKCdwMicsIHsgYnJvd3NlQWN0aW9uczogW21ha2VCcm93c2VBY3Rpb24oJ3AyJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpLCBtYWtlQnJvd3NlQWN0aW9uKCdwMicsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKV0gfSksXG5cdFx0XSk7XG5cdFx0Y29uc3QgcGlja2VyID0gY3JlYXRlVGVzdGFibGVQaWNrZXIoZGlzcG9zYWJsZXMsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGlja2VyLmdldEF2YWlsYWJsZVRhYnMoKSwgW1NFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwZW5kcyBjdXN0b20gZ3JvdXAgbGFiZWxzIGFmdGVyIExvY2FsJywgKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncDEnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMScsICdDdXN0b20gQScpLCBtYWtlQnJvd3NlQWN0aW9uKCdwMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKV0gfSksXG5cdFx0XHRjcmVhdGVNb2NrUHJvdmlkZXIoJ3AyJywgeyBicm93c2VBY3Rpb25zOiBbbWFrZUJyb3dzZUFjdGlvbigncDInLCAnQ3VzdG9tIEInKSwgbWFrZUJyb3dzZUFjdGlvbigncDInLCBTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEUpXSB9KSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0YWJsZVBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSk7XG5cdFx0Y29uc3QgdGFicyA9IHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRhYnNbMF0sIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0xPQ0FMKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRhYnMuc2xpY2UoMSkuc29ydCgpLCBbJ0N1c3RvbSBBJywgJ0N1c3RvbSBCJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfUkVNT1RFXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgYnJvd3NlIGFjdGlvbnMgd2l0aG91dCBhIGdyb3VwJywgKCkgPT4ge1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdGNyZWF0ZU1vY2tQcm92aWRlcigncDEnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMScsIHVuZGVmaW5lZCksIG1ha2VCcm93c2VBY3Rpb24oJ3AxJywgU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwpXSB9KSxcblx0XHRdKTtcblx0XHRjb25zdCBwaWNrZXIgPSBjcmVhdGVUZXN0YWJsZVBpY2tlcihkaXNwb3NhYmxlcywgcHJvdmlkZXJzU2VydmljZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwaWNrZXIuZ2V0QXZhaWxhYmxlVGFicygpLCBbU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfTE9DQUwsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX1JFTU9URV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaG93cyBhIHNpZ24taW4gYWN0aW9uIGluIHRoZSBHaXRIdWIgZ3JvdXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXhlY3V0ZWRDb21tYW5kczogc3RyaW5nW10gPSBbXTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBVUkkuZmlsZSgnL3JlY2VudC1yZXBvc2l0b3J5JyksIHByb3ZpZGVySWQ6ICdwMScsIGNoZWNrZWQ6IHRydWUgfV0pO1xuXHRcdGNvbnN0IGJhc2VQcm92aWRlciA9IGNyZWF0ZU1vY2tQcm92aWRlcigncDEnLCB7IGJyb3dzZUFjdGlvbnM6IFttYWtlQnJvd3NlQWN0aW9uKCdwMScsIFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQildIH0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtcblx0XHRcdHtcblx0XHRcdFx0Li4uYmFzZVByb3ZpZGVyLFxuXHRcdFx0XHRyZXNvbHZlV29ya3NwYWNlOiB1cmkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHdvcmtzcGFjZSA9IGJhc2VQcm92aWRlci5yZXNvbHZlV29ya3NwYWNlKHVyaSk7XG5cdFx0XHRcdFx0cmV0dXJuIHdvcmtzcGFjZSA/IHsgLi4ud29ya3NwYWNlLCBncm91cDogU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHRcdGNvbnN0IHBpY2tlciA9IGNyZWF0ZVRlc3RhYmxlUGlja2VyKGRpc3Bvc2FibGVzLCBwcm92aWRlcnNTZXJ2aWNlLCBmYWxzZSwge1xuXHRcdFx0cmVzdG9yZUZyb21TZXNzaW9uczogZmFsc2UsXG5cdFx0XHRnZXRXb3Jrc3BhY2VHcm91cEFjdGlvbjogZ3JvdXAgPT4gZ3JvdXAgPT09IFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQiA/IHtcblx0XHRcdFx0bGFiZWw6ICdTaWduIGluIHRvIEdpdEh1YicsXG5cdFx0XHRcdGljb246IENvZGljb24uc2lnbkluLFxuXHRcdFx0XHRjb21tYW5kSWQ6IEFHRU5USUNfU0lHTl9JTl9DT01NQU5EX0lELFxuXHRcdFx0XHRoaWRlV29ya3NwYWNlSXRlbXM6IHRydWUsXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGV4ZWN1dGVDb21tYW5kOiBhc3luYyBjb21tYW5kSWQgPT4ge1xuXHRcdFx0XHRleGVjdXRlZENvbW1hbmRzLnB1c2goY29tbWFuZElkKTtcblx0XHRcdH0sXG5cdFx0fSwgc3RvcmFnZSk7XG5cdFx0cGlja2VyLnNlbGVjdFdvcmtzcGFjZUdyb3VwKFNFU1NJT05fV09SS1NQQUNFX0dST1VQX0dJVEhVQik7XG5cdFx0YXdhaXQgcGlja2VyLnNlbGVjdCgnU2lnbiBpbiB0byBHaXRIdWInKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRhYnM6IHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksXG5cdFx0XHRpdGVtTGFiZWxzOiBwaWNrZXIuZ2V0SXRlbUxhYmVscygpLFxuXHRcdFx0ZXhlY3V0ZWRDb21tYW5kcyxcblx0XHR9LCB7XG5cdFx0XHR0YWJzOiBbU0VTU0lPTl9XT1JLU1BBQ0VfR1JPVVBfR0lUSFVCXSxcblx0XHRcdGl0ZW1MYWJlbHM6IFsnU2lnbiBpbiB0byBHaXRIdWInXSxcblx0XHRcdGV4ZWN1dGVkQ29tbWFuZHM6IFtBR0VOVElDX1NJR05fSU5fQ09NTUFORF9JRF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc2NvdmVycyBncm91cHMgZnJvbSByZWNlbnQgd29ya3NwYWNlcyBkb2VzIG5vdCBhZGQgZXh0cmEgdGFicycsICgpID0+IHtcblx0XHRjb25zdCBwcm92aWRlcjogSVNlc3Npb25zUHJvdmlkZXIgPSB7XG5cdFx0XHQuLi5jcmVhdGVNb2NrUHJvdmlkZXIoJ3AxJyksXG5cdFx0XHRyZXNvbHZlV29ya3NwYWNlOiAodXJpOiBVUkkpOiBJU2Vzc2lvbldvcmtzcGFjZSA9PiAoe1xuXHRcdFx0XHR1cmksXG5cdFx0XHRcdGxhYmVsOiB1cmkucGF0aCxcblx0XHRcdFx0aWNvbjogQ29kaWNvbi5mb2xkZXIsXG5cdFx0XHRcdGdyb3VwOiAnQ2xvdWQnLFxuXHRcdFx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0XHRcdHJvb3Q6IHVyaSxcblx0XHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0XHRcdFx0bmFtZTogdXJpLnBhdGgsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaSwgd29ya1RyZWVVcmk6IHVuZGVmaW5lZCwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCkgfSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdFx0fSksXG5cdFx0fTtcblx0XHRjb25zdCBzdG9yYWdlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0c2VlZFN0b3JhZ2Uoc3RvcmFnZSwgW3sgdXJpOiBVUkkuZmlsZSgnL3JlcG8nKSwgcHJvdmlkZXJJZDogJ3AxJywgY2hlY2tlZDogZmFsc2UgfV0pO1xuXHRcdHByb3ZpZGVyc1NlcnZpY2Uuc2V0UHJvdmlkZXJzKFtwcm92aWRlcl0pO1xuXG5cdFx0Y29uc3QgaW5zdGFudGlhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElBY3Rpb25XaWRnZXRTZXJ2aWNlLCB7IGlzVmlzaWJsZTogZmFsc2UsIGhpZGU6ICgpID0+IHsgfSwgc2hvdzogKCkgPT4geyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNvbnRleHRWaWV3U2VydmljZSwgeyBzaG93Q29udGV4dFZpZXc6ICgpID0+ICh7IGNsb3NlOiAoKSA9PiB7IH0gfSksIGhpZGVDb250ZXh0VmlldzogKCkgPT4geyB9LCBsYXlvdXQ6ICgpID0+IHsgfSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTdG9yYWdlU2VydmljZSwgc3RvcmFnZSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJVXJpSWRlbnRpdHlTZXJ2aWNlLCB7IGV4dFVyaSB9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1Byb3ZpZGVyc1NlcnZpY2UsIHByb3ZpZGVyc1NlcnZpY2UpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVJlbW90ZUFnZW50SG9zdFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElRdWlja0lucHV0U2VydmljZSwge30pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNsaXBib2FyZFNlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElQcmVmZXJlbmNlc1NlcnZpY2UsIHt9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElPdXRwdXRTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29uZmlndXJhdGlvblNlcnZpY2UsIG5ldyBUZXN0Q29uZmlndXJhdGlvblNlcnZpY2UoeyBbUmVtb3RlQWdlbnRIb3N0c0VuYWJsZWRTZXR0aW5nSWRdOiB0cnVlIH0pKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElDb21tYW5kU2VydmljZSwgeyBleGVjdXRlQ29tbWFuZDogYXN5bmMgKCkgPT4geyB9IH0pO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUZpbGVEaWFsb2dTZXJ2aWNlLCB7fSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJRmlsZVNlcnZpY2UsIHVwY2FzdFBhcnRpYWw8SUZpbGVTZXJ2aWNlPih7XG5cdFx0XHRvbkRpZENoYW5nZUZpbGVTeXN0ZW1Qcm92aWRlclJlZ2lzdHJhdGlvbnM6IEV2ZW50Lk5vbmUsXG5cdFx0XHRoYXNQcm92aWRlcjogKCkgPT4gdHJ1ZSxcblx0XHRcdGV4aXN0czogYXN5bmMgKCkgPT4gdHJ1ZSxcblx0XHR9KSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJQ29udGV4dEtleVNlcnZpY2UsIG5ldyBNb2NrQ29udGV4dEtleVNlcnZpY2UoKSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJTWVudVNlcnZpY2UsIHsgY3JlYXRlTWVudTogKCkgPT4gKHsgb25EaWRDaGFuZ2U6IEV2ZW50Lk5vbmUsIGdldEFjdGlvbnM6ICgpID0+IFtdLCBkaXNwb3NlOiAoKSA9PiB7IH0gfSkgfSk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJV29ya3NwYWNlc1NlcnZpY2UsIHtcblx0XHRcdGdldFJlY2VudGx5T3BlbmVkOiBhc3luYyAoKSA9PiAoeyB3b3Jrc3BhY2VzOiBbXSwgZmlsZXM6IFtdIH0pLFxuXHRcdFx0b25EaWRDaGFuZ2VSZWNlbnRseU9wZW5lZDogRXZlbnQuTm9uZSxcblx0XHR9KTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc1JlY2VudFdvcmtzcGFjZXNTZXJ2aWNlLCBkaXNwb3NhYmxlcy5hZGQoaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoU2Vzc2lvbnNSZWNlbnRXb3Jrc3BhY2VzU2VydmljZSkpKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElUZWxlbWV0cnlTZXJ2aWNlLCBOdWxsVGVsZW1ldHJ5U2VydmljZSk7XG5cdFx0Y29uc3QgcGlja2VyID0gZGlzcG9zYWJsZXMuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRlc3RhYmxlUGlja2VyLCB7fSkpO1xuXHRcdC8vIFJlY2VudCB3b3Jrc3BhY2UgZ3JvdXAgKCdDbG91ZCcpIGlzIG5vdCBhZGRlZCBhcyBhIHRhYiBcdTIwMTQgb25seVxuXHRcdC8vIGJyb3dzZSBhY3Rpb25zIGFuZCB0aGUgYWx3YXlzLXByZXNlbnQgUmVtb3RlIGdyb3VwIGNvbnRyaWJ1dGUgdGFicy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBpY2tlci5nZXRBdmFpbGFibGVUYWJzKCksIFtTRVNTSU9OX1dPUktTUEFDRV9HUk9VUF9SRU1PVEVdKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGlCQUFpQixlQUFlO0FBQ3pDLFNBQVMsZUFBZTtBQUN4QixTQUFTLFNBQVMsYUFBYTtBQUMvQixTQUFTLFlBQVksdUJBQXVCO0FBQzVDLFNBQVMsaUJBQXNDLHVCQUF1QjtBQUN0RSxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxxQkFBcUI7QUFDOUIsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyw0QkFBNEI7QUFDckMsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxpQ0FBaUMseUJBQXlCLHdDQUF3QztBQUMzRyxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLGdDQUFnQztBQUN6QyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLGlCQUFpQixjQUFjLHFCQUFxQjtBQUM3RCxTQUFTLHlCQUF5QjtBQUNsQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDBCQUEwQjtBQUNuQyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLHNCQUFzQjtBQUMv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
