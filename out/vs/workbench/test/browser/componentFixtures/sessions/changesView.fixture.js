import * as dom from "../../../../../base/browser/dom.js";
import { VSBuffer } from "../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Event } from "../../../../../base/common/event.js";
import { Disposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { localize2 } from "../../../../../nls.js";
import { IMenuService } from "../../../../../platform/actions/common/actions.js";
import { IFileService } from "../../../../../platform/files/common/files.js";
import { SyncDescriptor } from "../../../../../platform/instantiation/common/descriptors.js";
import { IListService, ListService } from "../../../../../platform/list/browser/listService.js";
import { IWorkspaceContextService } from "../../../../../platform/workspace/common/workspace.js";
import { IViewDescriptorService, ViewContainerLocation } from "../../../../common/views.js";
import { isIChatSessionFileChange2 } from "../../../../contrib/chat/common/chatSessionsService.js";
import { IDecorationsService } from "../../../../services/decorations/common/decorations.js";
import { IEditorService } from "../../../../services/editor/common/editorService.js";
import { IExtensionService } from "../../../../services/extensions/common/extensions.js";
import { ILifecycleService, LifecyclePhase, StartupKind } from "../../../../services/lifecycle/common/lifecycle.js";
import { IWorkbenchLayoutService } from "../../../../services/layout/browser/layoutService.js";
import { INotebookDocumentService } from "../../../../services/notebook/common/notebookDocumentService.js";
import { ITextFileService } from "../../../../services/textfile/common/textfiles.js";
import { IWorkspaceFolderLabelService } from "../../../../services/workspaces/common/workspaceFolderLabelService.js";
import { FixtureMenuService } from "../chat/chatFixtureUtils.js";
import { createEditorServices, defineComponentFixture, defineThemedFixtureGroup, registerWorkbenchServices } from "../fixtureUtils.js";
import { IChangesViewService } from "../../../../../sessions/contrib/changes/common/changesViewService.js";
import { CHANGES_VIEW_CONTAINER_ID, CHANGES_VIEW_ID, ChangesViewMode, IsolationMode } from "../../../../../sessions/contrib/changes/common/changes.js";
import { ChangesViewPane } from "../../../../../sessions/contrib/changes/browser/changesView.js";
import { ISessionChangesService, SessionChangesService } from "../../../../../sessions/contrib/changes/browser/sessionChangesService.js";
import { IGitHubService } from "../../../../../sessions/contrib/github/browser/githubService.js";
import { GitHubCheckConclusion, GitHubCheckStatus, GitHubCIOverallStatus } from "../../../../../sessions/contrib/github/common/types.js";
import { ISessionsService } from "../../../../../sessions/services/sessions/browser/sessionsService.js";
import { BRANCH_CHANGES_CHANGESET_ID, SessionFileOperation, SessionStatus } from "../../../../../sessions/services/sessions/common/session.js";
const WORKSPACE_URI = URI.file("/workspace/vscode");
const VIEW_WIDTH = 380;
const VIEW_HEIGHT = 520;
class FixtureChangesViewService extends Disposable {
  constructor(session, options) {
    super();
    this.detailsViewStateTransferObs = constObservable(void 0);
    this.viewModeObs = observableValue(this, ChangesViewMode.List);
    const changeset = createChangeset(options.changes);
    this.viewModeObs.set(options.viewMode, void 0);
    this.activeSessionResourceObs = constObservable(session.resource);
    this.activeSessionTypeObs = constObservable(session.sessionType);
    this.activeSessionIsVirtualWorkspaceObs = constObservable(false);
    this.activeSessionChangesObs = constObservable(options.changes);
    this.activeSessionChangesetsObs = constObservable([changeset]);
    this.activeSessionChangesetsLoadingObs = constObservable(false);
    this.activeSessionChangesetObs = constObservable(changeset);
    this.activeSessionChangesetLoadingObs = constObservable(false);
    this.activeSessionChangesetOperationsObs = constObservable([]);
    this.activeSessionHasGitRepositoryObs = constObservable(true);
    this.activeSessionReviewCommentCountByFileObs = constObservable(new Map(options.reviewCommentCounts));
    this.activeSessionAgentFeedbackCountByFileObs = constObservable(new Map(options.agentFeedbackCounts));
    this.activeSessionSectionCollapseStateObs = constObservable(options.sectionCollapseState ?? { otherFiles: false, checks: false });
    this.activeSessionStateObs = constObservable({
      isolationMode: IsolationMode.Worktree,
      hasGitRepository: true,
      branchName: "feature/changes-view-fixtures",
      baseBranchName: "main",
      upstreamBranchName: "origin/feature/changes-view-fixtures",
      isMergeBaseBranchProtected: true,
      incomingChanges: 0,
      outgoingChanges: 2,
      uncommittedChanges: 0,
      hasBranchChanges: options.changes.length > 0,
      hasGitHubRemote: true,
      hasPullRequest: (options.checks?.length ?? 0) > 0,
      hasOpenPullRequest: (options.checks?.length ?? 0) > 0,
      hasGitOperationInProgress: false
    });
    this.activeSessionLoadingObs = constObservable(false);
  }
  setSectionCollapsed(_sessionResource, _section, _collapsed) {
  }
  getDetailsViewState(_sessionResource, _viewMode) {
    return void 0;
  }
  setDetailsViewState(_sessionResource, _viewMode, _state) {
  }
  setChangesetId(_changesetId) {
  }
  showChangeset(_changeset) {
  }
  setChangesetFilesReviewState(_resources, _reviewed) {
  }
  setViewMode(mode) {
    this.viewModeObs.set(mode, void 0);
  }
}
class FixtureViewPaneContainer extends mock() {
}
const changesViewContainer = {
  id: CHANGES_VIEW_CONTAINER_ID,
  title: localize2("fixtureChangesContainer", "Changes"),
  ctorDescriptor: new SyncDescriptor(FixtureViewPaneContainer)
};
const changesViewDescriptor = {
  id: CHANGES_VIEW_ID,
  name: localize2("fixtureChangesView", "Changes"),
  ctorDescriptor: new SyncDescriptor(ChangesViewPane),
  containerIcon: Codicon.gitCompare
};
class FixtureViewContainerModel extends mock() {
  constructor() {
    super(...arguments);
    this.viewContainer = changesViewContainer;
    this.title = "Changes";
    this.icon = Codicon.gitCompare;
    this.keybindingId = void 0;
    this.onDidChangeContainerInfo = Event.None;
    this.allViewDescriptors = [changesViewDescriptor];
    this.onDidChangeAllViewDescriptors = Event.None;
    this.activeViewDescriptors = [changesViewDescriptor];
    this.onDidChangeActiveViewDescriptors = Event.None;
    this.visibleViewDescriptors = [changesViewDescriptor];
    this.onDidAddVisibleViewDescriptors = Event.None;
    this.onDidRemoveVisibleViewDescriptors = Event.None;
    this.onDidMoveVisibleViewDescriptors = Event.None;
  }
  isVisible() {
    return true;
  }
  setVisible() {
  }
  isCollapsed() {
    return false;
  }
  setCollapsed() {
  }
  getSize() {
    return void 0;
  }
  setSizes() {
  }
  move() {
  }
}
class FixtureViewDescriptorService extends mock() {
  constructor() {
    super(...arguments);
    this.viewContainers = [changesViewContainer];
    this.onDidChangeViewContainers = Event.None;
    this.onDidChangeContainerLocation = Event.None;
    this.onDidChangeContainer = Event.None;
    this.onDidChangeLocation = Event.None;
    this._model = new FixtureViewContainerModel();
  }
  getDefaultViewContainer() {
    return changesViewContainer;
  }
  getViewContainerById() {
    return changesViewContainer;
  }
  isViewContainerRemovedPermanently() {
    return false;
  }
  getDefaultViewContainerLocation() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  getViewContainerLocation() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  getViewContainersByLocation() {
    return [changesViewContainer];
  }
  getViewContainerModel() {
    return this._model;
  }
  moveViewContainerToLocation() {
  }
  getViewContainerBadgeEnablementState() {
    return true;
  }
  setViewContainerBadgeEnablementState() {
  }
  getViewDescriptorById() {
    return changesViewDescriptor;
  }
  getViewContainerByViewId() {
    return changesViewContainer;
  }
  getDefaultContainerById() {
    return changesViewContainer;
  }
  getViewLocationById() {
    return ViewContainerLocation.AuxiliaryBar;
  }
  canMoveViews() {
    return false;
  }
  moveViewsToContainer() {
  }
  moveViewToLocation() {
  }
  reset() {
  }
}
function createChangeset(changes) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.id = BRANCH_CHANGES_CHANGESET_ID;
      this.label = "Branch Changes";
      this.isEnabled = constObservable(true);
      this.isDefault = constObservable(true);
      this.isLoadingChanges = constObservable(false);
      this.changes = constObservable(changes);
      this.operations = constObservable([]);
      this.originalCheckpointRef = constObservable(void 0);
      this.modifiedCheckpointRef = constObservable(void 0);
    }
    async invokeOperation() {
    }
  }();
}
function createWorkspace() {
  const gitRepository = {
    uri: WORKSPACE_URI,
    workTreeUri: URI.file("/workspace/.worktrees/changes-view-fixtures"),
    branchName: "feature/changes-view-fixtures",
    baseBranchName: "main",
    baseBranchProtected: true,
    hasGitHubRemote: true,
    upstreamBranchName: "origin/feature/changes-view-fixtures",
    outgoingChanges: 2,
    uncommittedChanges: 0,
    gitHubInfo: constObservable({
      owner: "microsoft",
      repo: "vscode",
      pullRequest: {
        number: 293163,
        uri: URI.parse("https://github.com/microsoft/vscode/pull/293163"),
        icon: Codicon.gitPullRequest
      }
    })
  };
  return {
    uri: WORKSPACE_URI,
    label: "vscode",
    icon: Codicon.folder,
    folders: [{
      root: WORKSPACE_URI,
      workingDirectory: WORKSPACE_URI,
      name: "vscode",
      description: void 0,
      gitRepository
    }],
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: false
  };
}
function createSession(options) {
  const capabilities = {
    supportsMultipleChats: false,
    supportsRename: true
  };
  const changesets = [createChangeset(options.changes)];
  const chat = new class extends mock() {
  }();
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.sessionId = "fixture:changes-view";
      this.resource = URI.parse("fixture-session://changes-view");
      this.providerId = "fixture";
      this.sessionType = "fixture";
      this.icon = Codicon.account;
      this.createdAt = /* @__PURE__ */ new Date("2026-05-14T12:00:00Z");
      this.workspace = constObservable(createWorkspace());
      this.title = constObservable("Changes view fixture");
      this.updatedAt = constObservable(/* @__PURE__ */ new Date("2026-05-14T12:30:00Z"));
      this.status = constObservable(SessionStatus.Completed);
      this.changes = constObservable(options.changes);
      this.changesets = constObservable(changesets);
      this.externalChanges = constObservable(options.otherFiles ?? []);
      this.modelId = constObservable(void 0);
      this.mode = constObservable(void 0);
      this.loading = constObservable(false);
      this.isArchived = constObservable(false);
      this.isRead = constObservable(true);
      this.description = constObservable(void 0);
      this.lastTurnEnd = constObservable(void 0);
      this.chats = constObservable([chat]);
      this.mainChat = constObservable(chat);
      this.capabilities = constObservable(capabilities);
      this.activeChat = constObservable(chat);
      this.isCreated = constObservable(true);
      this.sticky = constObservable(false);
      this.openChats = constObservable([chat]);
      this.closedChats = constObservable([]);
      this.lastClosedChat = void 0;
      this.visibleChatTabs = constObservable([chat]);
      this.shouldShowChatTabs = constObservable(false);
    }
  }();
}
function createFileChange(path, kind, insertions, deletions) {
  const uri = URI.file(`/workspace/vscode/${path}`);
  return {
    uri,
    originalUri: kind === "added" ? void 0 : URI.file(`/workspace/vscode/.baseline/${path}`),
    modifiedUri: kind === "deleted" ? void 0 : uri,
    insertions,
    deletions
  };
}
function createOtherFile(path, operation) {
  return {
    uri: URI.file(path),
    operation,
    originalUri: operation === SessionFileOperation.Modified ? URI.file(`${path}.before`) : void 0
  };
}
function createCheck(id, name, status, conclusion) {
  return {
    id,
    name,
    status,
    conclusion,
    startedAt: "2026-05-14T12:00:00Z",
    completedAt: status === GitHubCheckStatus.Completed ? "2026-05-14T12:05:00Z" : void 0,
    detailsUrl: `https://github.com/microsoft/vscode/actions/runs/${id}`
  };
}
function createCIModel(checks) {
  if (!checks?.length) {
    return void 0;
  }
  const visibleChecks = checks;
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.owner = "microsoft";
      this.repo = "vscode";
      this.prNumber = 293163;
      this.headSha = "abcdef1234567890";
      this.checks = constObservable(visibleChecks);
      this.overallStatus = constObservable(GitHubCIOverallStatus.Failure);
      this.fixRequested = constObservable(false);
    }
    markFixRequested() {
    }
    async refresh() {
    }
    async rerunFailedCheck() {
    }
    async getCheckRunAnnotations() {
      return "";
    }
    startPolling() {
      return { dispose() {
      } };
    }
  }();
}
function createGitHubService(checks) {
  return new class extends mock() {
    constructor() {
      super(...arguments);
      this.activeSessionPullRequestObs = constObservable(void 0);
      this.activeSessionPullRequestCIObs = constObservable(createCIModel(checks));
      this.activeSessionPullRequestReviewThreadsObs = constObservable(void 0);
    }
    createRepositoryModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestReviewThreadsModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    createPullRequestCIModelReference() {
      throw new Error("Not implemented in fixture.");
    }
    async getChangedFiles() {
      return [];
    }
    async findPullRequestNumberByHeadBranch() {
      return void 0;
    }
  }();
}
function getChangeUri(change) {
  return isIChatSessionFileChange2(change) ? change.uri : change.modifiedUri;
}
function renderChangesView(ctx, options) {
  const { container, disposableStore, theme } = ctx;
  const height = options.height ?? VIEW_HEIGHT;
  const session = createSession(options);
  const changesViewService = disposableStore.add(new FixtureChangesViewService(session, options));
  container.style.width = `${VIEW_WIDTH}px`;
  container.style.height = `${height}px`;
  container.style.backgroundColor = "var(--vscode-sideBar-background)";
  const host = dom.append(container, dom.$(".part.auxiliarybar"));
  host.style.width = "100%";
  host.style.height = "100%";
  const paneView = dom.append(host, dom.$(".monaco-pane-view"));
  paneView.style.width = "100%";
  paneView.style.height = "100%";
  const instantiationService = createEditorServices(disposableStore, {
    colorTheme: theme,
    additionalServices: (reg) => {
      registerWorkbenchServices(reg);
      reg.define(IMenuService, FixtureMenuService);
      reg.define(IListService, ListService);
      reg.define(ISessionChangesService, SessionChangesService);
      reg.defineInstance(IChangesViewService, changesViewService);
      reg.defineInstance(IGitHubService, createGitHubService(options.checks));
      reg.defineInstance(IViewDescriptorService, new FixtureViewDescriptorService());
      reg.defineInstance(ISessionsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.activeSession = constObservable(session);
          this.visibleSessions = constObservable([session]);
          this.onDidToggleSessionStickiness = Event.None;
        }
      }());
      reg.defineInstance(IDecorationsService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeDecorations = Event.None;
        }
      }());
      reg.defineInstance(ITextFileService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.untitled = new class extends mock() {
            constructor() {
              super(...arguments);
              this.onDidChangeLabel = Event.None;
            }
          }();
        }
      }());
      reg.defineInstance(IWorkspaceContextService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeWorkspaceFolders = Event.None;
        }
        getWorkspace() {
          return { id: "fixture", folders: [], configuration: void 0 };
        }
      }());
      reg.defineInstance(IWorkspaceFolderLabelService, new class extends mock() {
        getWorkspaceFolderLabel() {
          return "vscode (feature/changes-view-fixtures)";
        }
      }());
      reg.defineInstance(INotebookDocumentService, new class extends mock() {
        getNotebook() {
          return void 0;
        }
      }());
      reg.defineInstance(IFileService, new class extends mock() {
        async readFile(resource) {
          return new class extends mock() {
            constructor() {
              super(...arguments);
              this.resource = resource;
              this.value = VSBuffer.fromString("before");
            }
          }();
        }
      }());
      reg.defineInstance(IEditorService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidActiveEditorChange = Event.None;
          this.onDidVisibleEditorsChange = Event.None;
          this.onDidEditorsChange = Event.None;
        }
        async openEditor() {
          return void 0;
        }
      }());
      reg.defineInstance(IExtensionService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.onDidChangeExtensions = Event.None;
        }
      }());
      reg.defineInstance(IWorkbenchLayoutService, new class extends mock() {
      }());
      reg.defineInstance(ILifecycleService, new class extends mock() {
        constructor() {
          super(...arguments);
          this.startupKind = StartupKind.NewWindow;
          this.phase = LifecyclePhase.Restored;
          this.onBeforeShutdown = Event.None;
          this.onShutdownVeto = Event.None;
          this.onBeforeShutdownError = Event.None;
          this.onWillShutdown = Event.None;
          this.willShutdown = false;
          this.onDidShutdown = Event.None;
        }
        async when() {
        }
        async shutdown() {
        }
      }());
    }
  });
  const view = disposableStore.add(instantiationService.createInstance(ChangesViewPane, {
    id: CHANGES_VIEW_ID,
    title: "Changes",
    minimumBodySize: 0,
    maximumBodySize: Number.POSITIVE_INFINITY
  }));
  view.render();
  paneView.appendChild(view.element);
  view.setVisible(true);
  view.orthogonalSize = VIEW_WIDTH;
  view.layout(height);
}
const SAMPLE_CHANGES = [
  createFileChange("src/vs/sessions/contrib/changes/browser/changesView.ts", "modified", 42, 18),
  createFileChange("src/vs/sessions/contrib/changes/browser/sessionFilesWidget.ts", "modified", 24, 9),
  createFileChange("src/vs/sessions/contrib/changes/browser/media/sessionFilesWidget.css", "modified", 6, 2),
  createFileChange("src/vs/sessions/contrib/changes/test/browser/changesView.fixture.ts", "added", 132, 0),
  createFileChange("src/vs/sessions/contrib/changes/browser/oldChangesLayout.ts", "deleted", 0, 47)
];
const MANY_CHANGES = Array.from(
  { length: 40 },
  (_, index) => createFileChange(`src/feature/changed-file-${String(index + 1).padStart(2, "0")}.ts`, "modified", index + 1, index % 4)
);
const SAMPLE_OTHER_FILES = [
  createOtherFile("/home/user/.config/code/settings.json", SessionFileOperation.Modified),
  createOtherFile("/home/user/.config/copilot/agents/inbox.agent.md", SessionFileOperation.Created),
  createOtherFile("/home/user/.cache/copilot/session.log", SessionFileOperation.Deleted),
  createOtherFile("/tmp/session-notes.md", SessionFileOperation.Created),
  createOtherFile("/home/user/.gitconfig", SessionFileOperation.Modified),
  createOtherFile("/home/user/.ssh/config", SessionFileOperation.Modified),
  createOtherFile("/home/user/.local/share/copilot/state.json", SessionFileOperation.Created),
  createOtherFile("/home/user/.vscode-insiders/argv.json", SessionFileOperation.Modified)
];
const SAMPLE_CHECKS = [
  createCheck(1001, "Linux / Unit Tests", GitHubCheckStatus.Completed, GitHubCheckConclusion.Success),
  createCheck(1002, "Windows / Unit Tests", GitHubCheckStatus.Completed, GitHubCheckConclusion.Failure),
  createCheck(1003, "macOS / Smoke Tests", GitHubCheckStatus.InProgress),
  createCheck(1004, "Hygiene", GitHubCheckStatus.Queued),
  createCheck(1005, "Compile", GitHubCheckStatus.Completed, GitHubCheckConclusion.Success)
];
var changesView_fixture_default = defineThemedFixtureGroup({ path: "sessions/changes/" }, {
  AllSections_List: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: SAMPLE_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS,
      reviewCommentCounts: /* @__PURE__ */ new Map([[getChangeUri(SAMPLE_CHANGES[0]).fsPath, 2]]),
      agentFeedbackCounts: /* @__PURE__ */ new Map([[getChangeUri(SAMPLE_CHANGES[1]).fsPath, 1]])
    })
  }),
  TreeMode: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.Tree,
      changes: SAMPLE_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES.slice(0, 3),
      checks: SAMPLE_CHECKS.slice(0, 3)
    })
  }),
  FilesAndChecksOnly: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: SAMPLE_CHANGES,
      checks: SAMPLE_CHECKS,
      height: 440
    })
  }),
  ManyChanges: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: MANY_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS,
      height: 1252
    })
  }),
  CollapsedSections: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: SAMPLE_CHANGES,
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS,
      sectionCollapseState: { otherFiles: true, checks: true },
      height: 440
    })
  }),
  NoFileChangesWithOtherFiles: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: [],
      otherFiles: SAMPLE_OTHER_FILES,
      checks: SAMPLE_CHECKS.slice(0, 2),
      height: 440
    })
  }),
  Empty: defineComponentFixture({
    labels: { kind: "screenshot" },
    render: (ctx) => renderChangesView(ctx, {
      viewMode: ChangesViewMode.List,
      changes: [],
      otherFiles: [],
      checks: [],
      height: 280
    })
  })
});
export {
  changesView_fixture_default as default
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXHRlc3RcXGJyb3dzZXJcXGNvbXBvbmVudEZpeHR1cmVzXFxzZXNzaW9uc1xcY2hhbmdlc1ZpZXcuZml4dHVyZS50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IFZTQnVmZmVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IG1vY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL21vY2suanMnO1xuaW1wb3J0IHsgbG9jYWxpemUyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IElNZW51U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUZpbGVDb250ZW50LCBJRmlsZVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9maWxlcy9jb21tb24vZmlsZXMuanMnO1xuaW1wb3J0IHsgU3luY0Rlc2NyaXB0b3IgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9kZXNjcmlwdG9ycy5qcyc7XG5pbXBvcnQgeyBJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vbGlzdC9icm93c2VyL2xpc3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElXb3Jrc3BhY2UsIElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3dvcmtzcGFjZS9jb21tb24vd29ya3NwYWNlLmpzJztcbmltcG9ydCB7IElWaWV3UGFuZU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL3BhcnRzL3ZpZXdzL3ZpZXdQYW5lLmpzJztcbmltcG9ydCB7IElWaWV3Q29udGFpbmVyTW9kZWwsIElWaWV3RGVzY3JpcHRvciwgSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgSVZpZXdQYW5lQ29udGFpbmVyLCBWaWV3Q29udGFpbmVyLCBWaWV3Q29udGFpbmVyTG9jYXRpb24gfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vdmlld3MuanMnO1xuaW1wb3J0IHsgaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbnRyaWIvY2hhdC9jb21tb24vY2hhdFNlc3Npb25zU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJRGVjb3JhdGlvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZGVjb3JhdGlvbnMvY29tbW9uL2RlY29yYXRpb25zLmpzJztcbmltcG9ydCB7IElFZGl0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZWRpdG9yL2NvbW1vbi9lZGl0b3JTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElFeHRlbnNpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZXh0ZW5zaW9ucy9jb21tb24vZXh0ZW5zaW9ucy5qcyc7XG5pbXBvcnQgeyBJTGlmZWN5Y2xlU2VydmljZSwgTGlmZWN5Y2xlUGhhc2UsIFN0YXJ0dXBLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvbGlmZWN5Y2xlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgSVdvcmtiZW5jaExheW91dFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9sYXlvdXQvYnJvd3Nlci9sYXlvdXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElOb3RlYm9va0RvY3VtZW50U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL25vdGVib29rL2NvbW1vbi9ub3RlYm9va0RvY3VtZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJVGV4dEZpbGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvdGV4dGZpbGUvY29tbW9uL3RleHRmaWxlcy5qcyc7XG5pbXBvcnQgeyBJV29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvd29ya3NwYWNlcy9jb21tb24vd29ya3NwYWNlRm9sZGVyTGFiZWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IEZpeHR1cmVNZW51U2VydmljZSB9IGZyb20gJy4uL2NoYXQvY2hhdEZpeHR1cmVVdGlscy5qcyc7XG5pbXBvcnQgeyBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgY3JlYXRlRWRpdG9yU2VydmljZXMsIGRlZmluZUNvbXBvbmVudEZpeHR1cmUsIGRlZmluZVRoZW1lZEZpeHR1cmVHcm91cCwgcmVnaXN0ZXJXb3JrYmVuY2hTZXJ2aWNlcyB9IGZyb20gJy4uL2ZpeHR1cmVVdGlscy5qcyc7XG5cbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgQWN0aXZlU2Vzc2lvblN0YXRlLCBDaGFuZ2VzVmlld1NlY3Rpb24sIElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZSwgSUNoYW5nZXNWaWV3U2VjdGlvbkNvbGxhcHNlU3RhdGUsIElDaGFuZ2VzVmlld1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvY29tbW9uL2NoYW5nZXNWaWV3U2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IENIQU5HRVNfVklFV19DT05UQUlORVJfSUQsIENIQU5HRVNfVklFV19JRCwgQ2hhbmdlc1ZpZXdNb2RlLCBJc29sYXRpb25Nb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2NvbW1vbi9jaGFuZ2VzLmpzJztcbi8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBsb2NhbC9jb2RlLWltcG9ydC1wYXR0ZXJuc1xuaW1wb3J0IHsgQ2hhbmdlc1ZpZXdQYW5lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvY2hhbmdlc1ZpZXcuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLCBTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uQ2hhbmdlc1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdENJTW9kZWwuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL2NvbnRyaWIvZ2l0aHViL2Jyb3dzZXIvZ2l0aHViU2VydmljZS5qcyc7XG4vLyBlc2xpbnQtZGlzYWJsZS1uZXh0LWxpbmUgbG9jYWwvY29kZS1pbXBvcnQtcGF0dGVybnNcbmltcG9ydCB7IEdpdEh1YkNoZWNrQ29uY2x1c2lvbiwgR2l0SHViQ2hlY2tTdGF0dXMsIEdpdEh1YkNJT3ZlcmFsbFN0YXR1cywgSUdpdEh1YkNJQ2hlY2sgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9zZXNzaW9ucy9jb250cmliL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3Nlc3Npb25zL3NlcnZpY2VzL3Nlc3Npb25zL2NvbW1vbi9zZXNzaW9uc01hbmFnZW1lbnQuanMnO1xuLy8gZXNsaW50LWRpc2FibGUtbmV4dC1saW5lIGxvY2FsL2NvZGUtaW1wb3J0LXBhdHRlcm5zXG5pbXBvcnQgeyBCUkFOQ0hfQ0hBTkdFU19DSEFOR0VTRVRfSUQsIElDaGF0LCBJR2l0SHViSW5mbywgSVNlc3Npb25DYXBhYmlsaXRpZXMsIElTZXNzaW9uQ2hhbmdlc2V0LCBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbiwgSVNlc3Npb25GaWxlLCBJU2Vzc2lvbkZpbGVDaGFuZ2UsIElTZXNzaW9uR2l0UmVwb3NpdG9yeSwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25GaWxlT3BlcmF0aW9uLCBTZXNzaW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vc2Vzc2lvbnMvc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuXG5pbnRlcmZhY2UgSUNoYW5nZXNWaWV3Rml4dHVyZU9wdGlvbnMge1xuXHRyZWFkb25seSB2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlO1xuXHRyZWFkb25seSBjaGFuZ2VzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXTtcblx0cmVhZG9ubHkgb3RoZXJGaWxlcz86IHJlYWRvbmx5IElTZXNzaW9uRmlsZVtdO1xuXHRyZWFkb25seSBjaGVja3M/OiByZWFkb25seSBJR2l0SHViQ0lDaGVja1tdO1xuXHRyZWFkb25seSByZXZpZXdDb21tZW50Q291bnRzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRyZWFkb25seSBhZ2VudEZlZWRiYWNrQ291bnRzPzogUmVhZG9ubHlNYXA8c3RyaW5nLCBudW1iZXI+O1xuXHRyZWFkb25seSBzZWN0aW9uQ29sbGFwc2VTdGF0ZT86IElDaGFuZ2VzVmlld1NlY3Rpb25Db2xsYXBzZVN0YXRlO1xuXHRyZWFkb25seSBoZWlnaHQ/OiBudW1iZXI7XG59XG5cbmNvbnN0IFdPUktTUEFDRV9VUkkgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS92c2NvZGUnKTtcbmNvbnN0IFZJRVdfV0lEVEggPSAzODA7XG5jb25zdCBWSUVXX0hFSUdIVCA9IDUyMDtcblxuY2xhc3MgRml4dHVyZUNoYW5nZXNWaWV3U2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQ2hhbmdlc1ZpZXdTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzOiBJT2JzZXJ2YWJsZTxVUkkgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uVHlwZU9iczogSU9ic2VydmFibGU8c3RyaW5nIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbklzVmlydHVhbFdvcmtzcGFjZU9iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldFtdIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNMb2FkaW5nT2JzOiBJT2JzZXJ2YWJsZTxib29sZWFuPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9iczogSU9ic2VydmFibGU8SVNlc3Npb25DaGFuZ2VzZXQgfCB1bmRlZmluZWQ+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uQ2hhbmdlc2V0TG9hZGluZ09iczogSU9ic2VydmFibGU8Ym9vbGVhbj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25zT2JzOiBJT2JzZXJ2YWJsZTxyZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbltdPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkhhc0dpdFJlcG9zaXRvcnlPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uUmV2aWV3Q29tbWVudENvdW50QnlGaWxlT2JzOiBJT2JzZXJ2YWJsZTxNYXA8c3RyaW5nLCBudW1iZXI+Pjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkFnZW50RmVlZGJhY2tDb3VudEJ5RmlsZU9iczogSU9ic2VydmFibGU8TWFwPHN0cmluZywgbnVtYmVyPj47XG5cdHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25TdGF0ZU9iczogSU9ic2VydmFibGU8QWN0aXZlU2Vzc2lvblN0YXRlIHwgdW5kZWZpbmVkPjtcblx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnM6IElPYnNlcnZhYmxlPGJvb2xlYW4+O1xuXHRyZWFkb25seSBhY3RpdmVTZXNzaW9uU2VjdGlvbkNvbGxhcHNlU3RhdGVPYnM6IElPYnNlcnZhYmxlPElDaGFuZ2VzVmlld1NlY3Rpb25Db2xsYXBzZVN0YXRlPjtcblx0cmVhZG9ubHkgZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyT2JzID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdHJlYWRvbmx5IHZpZXdNb2RlT2JzID0gb2JzZXJ2YWJsZVZhbHVlPENoYW5nZXNWaWV3TW9kZT4odGhpcywgQ2hhbmdlc1ZpZXdNb2RlLkxpc3QpO1xuXG5cdGNvbnN0cnVjdG9yKHNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBvcHRpb25zOiBJQ2hhbmdlc1ZpZXdGaXh0dXJlT3B0aW9ucykge1xuXHRcdHN1cGVyKCk7XG5cblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBjcmVhdGVDaGFuZ2VzZXQob3B0aW9ucy5jaGFuZ2VzKTtcblx0XHR0aGlzLnZpZXdNb2RlT2JzLnNldChvcHRpb25zLnZpZXdNb2RlLCB1bmRlZmluZWQpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblJlc291cmNlT2JzID0gY29uc3RPYnNlcnZhYmxlKHNlc3Npb24ucmVzb3VyY2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblR5cGVPYnMgPSBjb25zdE9ic2VydmFibGUoc2Vzc2lvbi5zZXNzaW9uVHlwZSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uSXNWaXJ0dWFsV29ya3NwYWNlT2JzID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHR0aGlzLmFjdGl2ZVNlc3Npb25DaGFuZ2VzT2JzID0gY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMuY2hhbmdlcyk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c09icyA9IGNvbnN0T2JzZXJ2YWJsZShbY2hhbmdlc2V0XSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c0xvYWRpbmdPYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icyA9IGNvbnN0T2JzZXJ2YWJsZShjaGFuZ2VzZXQpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldExvYWRpbmdPYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbnNPYnMgPSBjb25zdE9ic2VydmFibGU8cmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXT4oW10pO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkhhc0dpdFJlcG9zaXRvcnlPYnMgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uUmV2aWV3Q29tbWVudENvdW50QnlGaWxlT2JzID0gY29uc3RPYnNlcnZhYmxlKG5ldyBNYXAob3B0aW9ucy5yZXZpZXdDb21tZW50Q291bnRzKSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uQWdlbnRGZWVkYmFja0NvdW50QnlGaWxlT2JzID0gY29uc3RPYnNlcnZhYmxlKG5ldyBNYXAob3B0aW9ucy5hZ2VudEZlZWRiYWNrQ291bnRzKSk7XG5cdFx0dGhpcy5hY3RpdmVTZXNzaW9uU2VjdGlvbkNvbGxhcHNlU3RhdGVPYnMgPSBjb25zdE9ic2VydmFibGUob3B0aW9ucy5zZWN0aW9uQ29sbGFwc2VTdGF0ZSA/PyB7IG90aGVyRmlsZXM6IGZhbHNlLCBjaGVja3M6IGZhbHNlIH0pO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvblN0YXRlT2JzID0gY29uc3RPYnNlcnZhYmxlKHtcblx0XHRcdGlzb2xhdGlvbk1vZGU6IElzb2xhdGlvbk1vZGUuV29ya3RyZWUsXG5cdFx0XHRoYXNHaXRSZXBvc2l0b3J5OiB0cnVlLFxuXHRcdFx0YnJhbmNoTmFtZTogJ2ZlYXR1cmUvY2hhbmdlcy12aWV3LWZpeHR1cmVzJyxcblx0XHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0XHR1cHN0cmVhbUJyYW5jaE5hbWU6ICdvcmlnaW4vZmVhdHVyZS9jaGFuZ2VzLXZpZXctZml4dHVyZXMnLFxuXHRcdFx0aXNNZXJnZUJhc2VCcmFuY2hQcm90ZWN0ZWQ6IHRydWUsXG5cdFx0XHRpbmNvbWluZ0NoYW5nZXM6IDAsXG5cdFx0XHRvdXRnb2luZ0NoYW5nZXM6IDIsXG5cdFx0XHR1bmNvbW1pdHRlZENoYW5nZXM6IDAsXG5cdFx0XHRoYXNCcmFuY2hDaGFuZ2VzOiBvcHRpb25zLmNoYW5nZXMubGVuZ3RoID4gMCxcblx0XHRcdGhhc0dpdEh1YlJlbW90ZTogdHJ1ZSxcblx0XHRcdGhhc1B1bGxSZXF1ZXN0OiAob3B0aW9ucy5jaGVja3M/Lmxlbmd0aCA/PyAwKSA+IDAsXG5cdFx0XHRoYXNPcGVuUHVsbFJlcXVlc3Q6IChvcHRpb25zLmNoZWNrcz8ubGVuZ3RoID8/IDApID4gMCxcblx0XHRcdGhhc0dpdE9wZXJhdGlvbkluUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdH0pO1xuXHRcdHRoaXMuYWN0aXZlU2Vzc2lvbkxvYWRpbmdPYnMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHR9XG5cblx0c2V0U2VjdGlvbkNvbGxhcHNlZChfc2Vzc2lvblJlc291cmNlOiBVUkksIF9zZWN0aW9uOiBDaGFuZ2VzVmlld1NlY3Rpb24sIF9jb2xsYXBzZWQ6IGJvb2xlYW4pOiB2b2lkIHsgfVxuXG5cdGdldERldGFpbHNWaWV3U3RhdGUoX3Nlc3Npb25SZXNvdXJjZTogVVJJLCBfdmlld01vZGU6IENoYW5nZXNWaWV3TW9kZSk6IElDaGFuZ2VzRGV0YWlsc1ZpZXdTdGF0ZSB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblxuXHRzZXREZXRhaWxzVmlld1N0YXRlKF9zZXNzaW9uUmVzb3VyY2U6IFVSSSwgX3ZpZXdNb2RlOiBDaGFuZ2VzVmlld01vZGUsIF9zdGF0ZTogSUNoYW5nZXNEZXRhaWxzVmlld1N0YXRlKTogdm9pZCB7IH1cblxuXHRzZXRDaGFuZ2VzZXRJZChfY2hhbmdlc2V0SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQgeyB9XG5cdHNob3dDaGFuZ2VzZXQoX2NoYW5nZXNldDogSVNlc3Npb25DaGFuZ2VzZXQpOiB2b2lkIHsgfVxuXG5cdHNldENoYW5nZXNldEZpbGVzUmV2aWV3U3RhdGUoX3Jlc291cmNlczogcmVhZG9ubHkgVVJJW10sIF9yZXZpZXdlZDogYm9vbGVhbik6IHZvaWQgeyB9XG5cblx0c2V0Vmlld01vZGUobW9kZTogQ2hhbmdlc1ZpZXdNb2RlKTogdm9pZCB7XG5cdFx0dGhpcy52aWV3TW9kZU9icy5zZXQobW9kZSwgdW5kZWZpbmVkKTtcblx0fVxufVxuXG5jbGFzcyBGaXh0dXJlVmlld1BhbmVDb250YWluZXIgZXh0ZW5kcyBtb2NrPElWaWV3UGFuZUNvbnRhaW5lcj4oKSB7IH1cblxuY29uc3QgY2hhbmdlc1ZpZXdDb250YWluZXI6IFZpZXdDb250YWluZXIgPSB7XG5cdGlkOiBDSEFOR0VTX1ZJRVdfQ09OVEFJTkVSX0lELFxuXHR0aXRsZTogbG9jYWxpemUyKCdmaXh0dXJlQ2hhbmdlc0NvbnRhaW5lcicsICdDaGFuZ2VzJyksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoRml4dHVyZVZpZXdQYW5lQ29udGFpbmVyKSxcbn07XG5cbmNvbnN0IGNoYW5nZXNWaWV3RGVzY3JpcHRvcjogSVZpZXdEZXNjcmlwdG9yID0ge1xuXHRpZDogQ0hBTkdFU19WSUVXX0lELFxuXHRuYW1lOiBsb2NhbGl6ZTIoJ2ZpeHR1cmVDaGFuZ2VzVmlldycsICdDaGFuZ2VzJyksXG5cdGN0b3JEZXNjcmlwdG9yOiBuZXcgU3luY0Rlc2NyaXB0b3IoQ2hhbmdlc1ZpZXdQYW5lKSxcblx0Y29udGFpbmVySWNvbjogQ29kaWNvbi5naXRDb21wYXJlLFxufTtcblxuY2xhc3MgRml4dHVyZVZpZXdDb250YWluZXJNb2RlbCBleHRlbmRzIG1vY2s8SVZpZXdDb250YWluZXJNb2RlbD4oKSB7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IHZpZXdDb250YWluZXIgPSBjaGFuZ2VzVmlld0NvbnRhaW5lcjtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgdGl0bGUgPSAnQ2hhbmdlcyc7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGljb246IFRoZW1lSWNvbiB8IFVSSSB8IHVuZGVmaW5lZCA9IENvZGljb24uZ2l0Q29tcGFyZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkga2V5YmluZGluZ0lkID0gdW5kZWZpbmVkO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUNvbnRhaW5lckluZm8gPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBhbGxWaWV3RGVzY3JpcHRvcnMgPSBbY2hhbmdlc1ZpZXdEZXNjcmlwdG9yXTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VBbGxWaWV3RGVzY3JpcHRvcnMgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVWaWV3RGVzY3JpcHRvcnMgPSBbY2hhbmdlc1ZpZXdEZXNjcmlwdG9yXTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VBY3RpdmVWaWV3RGVzY3JpcHRvcnMgPSBFdmVudC5Ob25lO1xuXHRvdmVycmlkZSByZWFkb25seSB2aXNpYmxlVmlld0Rlc2NyaXB0b3JzID0gW2NoYW5nZXNWaWV3RGVzY3JpcHRvcl07XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQWRkVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkUmVtb3ZlVmlzaWJsZVZpZXdEZXNjcmlwdG9ycyA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkTW92ZVZpc2libGVWaWV3RGVzY3JpcHRvcnMgPSBFdmVudC5Ob25lO1xuXG5cdG92ZXJyaWRlIGlzVmlzaWJsZSgpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgc2V0VmlzaWJsZSgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBpc0NvbGxhcHNlZCgpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdG92ZXJyaWRlIHNldENvbGxhcHNlZCgpOiB2b2lkIHsgfVxuXHRvdmVycmlkZSBnZXRTaXplKCk6IG51bWJlciB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0b3ZlcnJpZGUgc2V0U2l6ZXMoKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgbW92ZSgpOiB2b2lkIHsgfVxufVxuXG5jbGFzcyBGaXh0dXJlVmlld0Rlc2NyaXB0b3JTZXJ2aWNlIGV4dGVuZHMgbW9jazxJVmlld0Rlc2NyaXB0b3JTZXJ2aWNlPigpIHtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlld0NvbnRhaW5lcnMgPSBbY2hhbmdlc1ZpZXdDb250YWluZXJdO1xuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVZpZXdDb250YWluZXJzID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VDb250YWluZXJMb2NhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlQ29udGFpbmVyID0gRXZlbnQuTm9uZTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRDaGFuZ2VMb2NhdGlvbiA9IEV2ZW50Lk5vbmU7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWwgPSBuZXcgRml4dHVyZVZpZXdDb250YWluZXJNb2RlbCgpO1xuXG5cdG92ZXJyaWRlIGdldERlZmF1bHRWaWV3Q29udGFpbmVyKCk6IFZpZXdDb250YWluZXIgfCB1bmRlZmluZWQgeyByZXR1cm4gY2hhbmdlc1ZpZXdDb250YWluZXI7IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lckJ5SWQoKTogVmlld0NvbnRhaW5lciB8IG51bGwgeyByZXR1cm4gY2hhbmdlc1ZpZXdDb250YWluZXI7IH1cblx0b3ZlcnJpZGUgaXNWaWV3Q29udGFpbmVyUmVtb3ZlZFBlcm1hbmVudGx5KCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0b3ZlcnJpZGUgZ2V0RGVmYXVsdFZpZXdDb250YWluZXJMb2NhdGlvbigpOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsIHsgcmV0dXJuIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI7IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lckxvY2F0aW9uKCk6IFZpZXdDb250YWluZXJMb2NhdGlvbiB8IG51bGwgeyByZXR1cm4gVmlld0NvbnRhaW5lckxvY2F0aW9uLkF1eGlsaWFyeUJhcjsgfVxuXHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyc0J5TG9jYXRpb24oKTogVmlld0NvbnRhaW5lcltdIHsgcmV0dXJuIFtjaGFuZ2VzVmlld0NvbnRhaW5lcl07IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0NvbnRhaW5lck1vZGVsKCk6IElWaWV3Q29udGFpbmVyTW9kZWwgeyByZXR1cm4gdGhpcy5fbW9kZWw7IH1cblx0b3ZlcnJpZGUgbW92ZVZpZXdDb250YWluZXJUb0xvY2F0aW9uKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGdldFZpZXdDb250YWluZXJCYWRnZUVuYWJsZW1lbnRTdGF0ZSgpOiBib29sZWFuIHsgcmV0dXJuIHRydWU7IH1cblx0b3ZlcnJpZGUgc2V0Vmlld0NvbnRhaW5lckJhZGdlRW5hYmxlbWVudFN0YXRlKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIGdldFZpZXdEZXNjcmlwdG9yQnlJZCgpOiBJVmlld0Rlc2NyaXB0b3IgfCBudWxsIHsgcmV0dXJuIGNoYW5nZXNWaWV3RGVzY3JpcHRvcjsgfVxuXHRvdmVycmlkZSBnZXRWaWV3Q29udGFpbmVyQnlWaWV3SWQoKTogVmlld0NvbnRhaW5lciB8IG51bGwgeyByZXR1cm4gY2hhbmdlc1ZpZXdDb250YWluZXI7IH1cblx0b3ZlcnJpZGUgZ2V0RGVmYXVsdENvbnRhaW5lckJ5SWQoKTogVmlld0NvbnRhaW5lciB8IG51bGwgeyByZXR1cm4gY2hhbmdlc1ZpZXdDb250YWluZXI7IH1cblx0b3ZlcnJpZGUgZ2V0Vmlld0xvY2F0aW9uQnlJZCgpOiBWaWV3Q29udGFpbmVyTG9jYXRpb24gfCBudWxsIHsgcmV0dXJuIFZpZXdDb250YWluZXJMb2NhdGlvbi5BdXhpbGlhcnlCYXI7IH1cblx0b3ZlcnJpZGUgY2FuTW92ZVZpZXdzKCk6IGJvb2xlYW4geyByZXR1cm4gZmFsc2U7IH1cblx0b3ZlcnJpZGUgbW92ZVZpZXdzVG9Db250YWluZXIoKTogdm9pZCB7IH1cblx0b3ZlcnJpZGUgbW92ZVZpZXdUb0xvY2F0aW9uKCk6IHZvaWQgeyB9XG5cdG92ZXJyaWRlIHJlc2V0KCk6IHZvaWQgeyB9XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoYW5nZXNldChjaGFuZ2VzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXSk6IElTZXNzaW9uQ2hhbmdlc2V0IHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzZXQ+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlkID0gQlJBTkNIX0NIQU5HRVNfQ0hBTkdFU0VUX0lEO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGxhYmVsID0gJ0JyYW5jaCBDaGFuZ2VzJztcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0VuYWJsZWQgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgaXNEZWZhdWx0ID0gY29uc3RPYnNlcnZhYmxlKHRydWUpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGlzTG9hZGluZ0NoYW5nZXMgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXMgPSBjb25zdE9ic2VydmFibGUoY2hhbmdlcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3BlcmF0aW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb3JpZ2luYWxDaGVja3BvaW50UmVmID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kaWZpZWRDaGVja3BvaW50UmVmID0gY29uc3RPYnNlcnZhYmxlKHVuZGVmaW5lZCk7XG5cdFx0b3ZlcnJpZGUgYXN5bmMgaW52b2tlT3BlcmF0aW9uKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdH0oKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlV29ya3NwYWNlKCk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0Y29uc3QgZ2l0UmVwb3NpdG9yeTogSVNlc3Npb25HaXRSZXBvc2l0b3J5ID0ge1xuXHRcdHVyaTogV09SS1NQQUNFX1VSSSxcblx0XHR3b3JrVHJlZVVyaTogVVJJLmZpbGUoJy93b3Jrc3BhY2UvLndvcmt0cmVlcy9jaGFuZ2VzLXZpZXctZml4dHVyZXMnKSxcblx0XHRicmFuY2hOYW1lOiAnZmVhdHVyZS9jaGFuZ2VzLXZpZXctZml4dHVyZXMnLFxuXHRcdGJhc2VCcmFuY2hOYW1lOiAnbWFpbicsXG5cdFx0YmFzZUJyYW5jaFByb3RlY3RlZDogdHJ1ZSxcblx0XHRoYXNHaXRIdWJSZW1vdGU6IHRydWUsXG5cdFx0dXBzdHJlYW1CcmFuY2hOYW1lOiAnb3JpZ2luL2ZlYXR1cmUvY2hhbmdlcy12aWV3LWZpeHR1cmVzJyxcblx0XHRvdXRnb2luZ0NoYW5nZXM6IDIsXG5cdFx0dW5jb21taXR0ZWRDaGFuZ2VzOiAwLFxuXHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZTxJR2l0SHViSW5mbyB8IHVuZGVmaW5lZD4oe1xuXHRcdFx0b3duZXI6ICdtaWNyb3NvZnQnLFxuXHRcdFx0cmVwbzogJ3ZzY29kZScsXG5cdFx0XHRwdWxsUmVxdWVzdDoge1xuXHRcdFx0XHRudW1iZXI6IDI5MzE2Myxcblx0XHRcdFx0dXJpOiBVUkkucGFyc2UoJ2h0dHBzOi8vZ2l0aHViLmNvbS9taWNyb3NvZnQvdnNjb2RlL3B1bGwvMjkzMTYzJyksXG5cdFx0XHRcdGljb246IENvZGljb24uZ2l0UHVsbFJlcXVlc3QsXG5cdFx0XHR9LFxuXHRcdH0pLFxuXHR9O1xuXG5cdHJldHVybiB7XG5cdFx0dXJpOiBXT1JLU1BBQ0VfVVJJLFxuXHRcdGxhYmVsOiAndnNjb2RlJyxcblx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRmb2xkZXJzOiBbe1xuXHRcdFx0cm9vdDogV09SS1NQQUNFX1VSSSxcblx0XHRcdHdvcmtpbmdEaXJlY3Rvcnk6IFdPUktTUEFDRV9VUkksXG5cdFx0XHRuYW1lOiAndnNjb2RlJyxcblx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRnaXRSZXBvc2l0b3J5LFxuXHRcdH1dLFxuXHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24ob3B0aW9uczogSUNoYW5nZXNWaWV3Rml4dHVyZU9wdGlvbnMpOiBJQWN0aXZlU2Vzc2lvbiB7XG5cdGNvbnN0IGNhcGFiaWxpdGllczogSVNlc3Npb25DYXBhYmlsaXRpZXMgPSB7XG5cdFx0c3VwcG9ydHNNdWx0aXBsZUNoYXRzOiBmYWxzZSxcblx0XHRzdXBwb3J0c1JlbmFtZTogdHJ1ZSxcblx0fTtcblx0Y29uc3QgY2hhbmdlc2V0cyA9IFtjcmVhdGVDaGFuZ2VzZXQob3B0aW9ucy5jaGFuZ2VzKV07XG5cdGNvbnN0IGNoYXQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0PigpIHsgfSgpO1xuXG5cdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElBY3RpdmVTZXNzaW9uPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBzZXNzaW9uSWQgPSAnZml4dHVyZTpjaGFuZ2VzLXZpZXcnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlc291cmNlID0gVVJJLnBhcnNlKCdmaXh0dXJlLXNlc3Npb246Ly9jaGFuZ2VzLXZpZXcnKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBwcm92aWRlcklkID0gJ2ZpeHR1cmUnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHNlc3Npb25UeXBlID0gJ2ZpeHR1cmUnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGljb24gPSBDb2RpY29uLmFjY291bnQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY3JlYXRlZEF0ID0gbmV3IERhdGUoJzIwMjYtMDUtMTRUMTI6MDA6MDBaJyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgd29ya3NwYWNlID0gY29uc3RPYnNlcnZhYmxlKGNyZWF0ZVdvcmtzcGFjZSgpKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB0aXRsZSA9IGNvbnN0T2JzZXJ2YWJsZSgnQ2hhbmdlcyB2aWV3IGZpeHR1cmUnKTtcblx0XHRvdmVycmlkZSByZWFkb25seSB1cGRhdGVkQXQgPSBjb25zdE9ic2VydmFibGUobmV3IERhdGUoJzIwMjYtMDUtMTRUMTI6MzA6MDBaJykpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXR1cyA9IGNvbnN0T2JzZXJ2YWJsZShTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2hhbmdlcyA9IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zLmNoYW5nZXMpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYW5nZXNldHMgPSBjb25zdE9ic2VydmFibGUoY2hhbmdlc2V0cyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZXh0ZXJuYWxDaGFuZ2VzID0gY29uc3RPYnNlcnZhYmxlKG9wdGlvbnMub3RoZXJGaWxlcyA/PyBbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbW9kZWxJZCA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IG1vZGUgPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBsb2FkaW5nID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0FyY2hpdmVkID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc1JlYWQgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgZGVzY3JpcHRpb24gPSBjb25zdE9ic2VydmFibGUodW5kZWZpbmVkKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBsYXN0VHVybkVuZCA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoYXRzID0gY29uc3RPYnNlcnZhYmxlKFtjaGF0XSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbWFpbkNoYXQgPSBjb25zdE9ic2VydmFibGUoY2hhdCk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgY2FwYWJpbGl0aWVzID0gY29uc3RPYnNlcnZhYmxlKGNhcGFiaWxpdGllcyk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlQ2hhdCA9IGNvbnN0T2JzZXJ2YWJsZShjaGF0KTtcblx0XHRvdmVycmlkZSByZWFkb25seSBpc0NyZWF0ZWQgPSBjb25zdE9ic2VydmFibGUodHJ1ZSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc3RpY2t5ID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvcGVuQ2hhdHMgPSBjb25zdE9ic2VydmFibGUoW2NoYXRdKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBjbG9zZWRDaGF0cyA9IGNvbnN0T2JzZXJ2YWJsZShbXSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgbGFzdENsb3NlZENoYXQgPSB1bmRlZmluZWQ7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmlzaWJsZUNoYXRUYWJzID0gY29uc3RPYnNlcnZhYmxlKFtjaGF0XSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgc2hvdWxkU2hvd0NoYXRUYWJzID0gY29uc3RPYnNlcnZhYmxlKGZhbHNlKTtcblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVGaWxlQ2hhbmdlKHBhdGg6IHN0cmluZywga2luZDogJ2FkZGVkJyB8ICdtb2RpZmllZCcgfCAnZGVsZXRlZCcsIGluc2VydGlvbnM6IG51bWJlciwgZGVsZXRpb25zOiBudW1iZXIpOiBJU2Vzc2lvbkZpbGVDaGFuZ2Uge1xuXHRjb25zdCB1cmkgPSBVUkkuZmlsZShgL3dvcmtzcGFjZS92c2NvZGUvJHtwYXRofWApO1xuXHRyZXR1cm4ge1xuXHRcdHVyaSxcblx0XHRvcmlnaW5hbFVyaToga2luZCA9PT0gJ2FkZGVkJyA/IHVuZGVmaW5lZCA6IFVSSS5maWxlKGAvd29ya3NwYWNlL3ZzY29kZS8uYmFzZWxpbmUvJHtwYXRofWApLFxuXHRcdG1vZGlmaWVkVXJpOiBraW5kID09PSAnZGVsZXRlZCcgPyB1bmRlZmluZWQgOiB1cmksXG5cdFx0aW5zZXJ0aW9ucyxcblx0XHRkZWxldGlvbnMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZU90aGVyRmlsZShwYXRoOiBzdHJpbmcsIG9wZXJhdGlvbjogU2Vzc2lvbkZpbGVPcGVyYXRpb24pOiBJU2Vzc2lvbkZpbGUge1xuXHRyZXR1cm4ge1xuXHRcdHVyaTogVVJJLmZpbGUocGF0aCksXG5cdFx0b3BlcmF0aW9uLFxuXHRcdG9yaWdpbmFsVXJpOiBvcGVyYXRpb24gPT09IFNlc3Npb25GaWxlT3BlcmF0aW9uLk1vZGlmaWVkID8gVVJJLmZpbGUoYCR7cGF0aH0uYmVmb3JlYCkgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUNoZWNrKGlkOiBudW1iZXIsIG5hbWU6IHN0cmluZywgc3RhdHVzOiBHaXRIdWJDaGVja1N0YXR1cywgY29uY2x1c2lvbj86IEdpdEh1YkNoZWNrQ29uY2x1c2lvbik6IElHaXRIdWJDSUNoZWNrIHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRuYW1lLFxuXHRcdHN0YXR1cyxcblx0XHRjb25jbHVzaW9uLFxuXHRcdHN0YXJ0ZWRBdDogJzIwMjYtMDUtMTRUMTI6MDA6MDBaJyxcblx0XHRjb21wbGV0ZWRBdDogc3RhdHVzID09PSBHaXRIdWJDaGVja1N0YXR1cy5Db21wbGV0ZWQgPyAnMjAyNi0wNS0xNFQxMjowNTowMFonIDogdW5kZWZpbmVkLFxuXHRcdGRldGFpbHNVcmw6IGBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L3ZzY29kZS9hY3Rpb25zL3J1bnMvJHtpZH1gLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDSU1vZGVsKGNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSB8IHVuZGVmaW5lZCk6IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB8IHVuZGVmaW5lZCB7XG5cdGlmICghY2hlY2tzPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHZpc2libGVDaGVja3M6IHJlYWRvbmx5IElHaXRIdWJDSUNoZWNrW10gPSBjaGVja3M7XG5cblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8R2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsPigpIHtcblx0XHRvdmVycmlkZSByZWFkb25seSBvd25lciA9ICdtaWNyb3NvZnQnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IHJlcG8gPSAndnNjb2RlJztcblx0XHRvdmVycmlkZSByZWFkb25seSBwck51bWJlciA9IDI5MzE2Mztcblx0XHRvdmVycmlkZSByZWFkb25seSBoZWFkU2hhID0gJ2FiY2RlZjEyMzQ1Njc4OTAnO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGNoZWNrcyA9IGNvbnN0T2JzZXJ2YWJsZSh2aXNpYmxlQ2hlY2tzKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBvdmVyYWxsU3RhdHVzID0gY29uc3RPYnNlcnZhYmxlKEdpdEh1YkNJT3ZlcmFsbFN0YXR1cy5GYWlsdXJlKTtcblx0XHRvdmVycmlkZSByZWFkb25seSBmaXhSZXF1ZXN0ZWQgPSBjb25zdE9ic2VydmFibGUoZmFsc2UpO1xuXHRcdG92ZXJyaWRlIG1hcmtGaXhSZXF1ZXN0ZWQoKTogdm9pZCB7IH1cblx0XHRvdmVycmlkZSBhc3luYyByZWZyZXNoKCk6IFByb21pc2U8dm9pZD4geyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgcmVydW5GYWlsZWRDaGVjaygpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdG92ZXJyaWRlIGFzeW5jIGdldENoZWNrUnVuQW5ub3RhdGlvbnMoKTogUHJvbWlzZTxzdHJpbmc+IHsgcmV0dXJuICcnOyB9XG5cdFx0b3ZlcnJpZGUgc3RhcnRQb2xsaW5nKCkgeyByZXR1cm4geyBkaXNwb3NlKCkgeyB9IH07IH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBjcmVhdGVHaXRIdWJTZXJ2aWNlKGNoZWNrczogcmVhZG9ubHkgSUdpdEh1YkNJQ2hlY2tbXSB8IHVuZGVmaW5lZCk6IElHaXRIdWJTZXJ2aWNlIHtcblx0cmV0dXJuIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUdpdEh1YlNlcnZpY2U+KCkge1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdE9icyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdENJT2JzID0gY29uc3RPYnNlcnZhYmxlKGNyZWF0ZUNJTW9kZWwoY2hlY2tzKSk7XG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc09icyA9IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpO1xuXHRcdG92ZXJyaWRlIGNyZWF0ZVJlcG9zaXRvcnlNb2RlbFJlZmVyZW5jZSgpOiBSZXR1cm5UeXBlPElHaXRIdWJTZXJ2aWNlWydjcmVhdGVSZXBvc2l0b3J5TW9kZWxSZWZlcmVuY2UnXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBmaXh0dXJlLicpOyB9XG5cdFx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RNb2RlbFJlZmVyZW5jZSgpOiBSZXR1cm5UeXBlPElHaXRIdWJTZXJ2aWNlWydjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlJ10+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgaW4gZml4dHVyZS4nKTsgfVxuXHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsUmVmZXJlbmNlKCk6IFJldHVyblR5cGU8SUdpdEh1YlNlcnZpY2VbJ2NyZWF0ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsUmVmZXJlbmNlJ10+IHsgdGhyb3cgbmV3IEVycm9yKCdOb3QgaW1wbGVtZW50ZWQgaW4gZml4dHVyZS4nKTsgfVxuXHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZSgpOiBSZXR1cm5UeXBlPElHaXRIdWJTZXJ2aWNlWydjcmVhdGVQdWxsUmVxdWVzdENJTW9kZWxSZWZlcmVuY2UnXT4geyB0aHJvdyBuZXcgRXJyb3IoJ05vdCBpbXBsZW1lbnRlZCBpbiBmaXh0dXJlLicpOyB9XG5cdFx0b3ZlcnJpZGUgYXN5bmMgZ2V0Q2hhbmdlZEZpbGVzKCkgeyByZXR1cm4gW107IH1cblx0XHRvdmVycmlkZSBhc3luYyBmaW5kUHVsbFJlcXVlc3ROdW1iZXJCeUhlYWRCcmFuY2goKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0fSgpO1xufVxuXG5mdW5jdGlvbiBnZXRDaGFuZ2VVcmkoY2hhbmdlOiBJU2Vzc2lvbkZpbGVDaGFuZ2UpOiBVUkkge1xuXHRyZXR1cm4gaXNJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMihjaGFuZ2UpID8gY2hhbmdlLnVyaSA6IGNoYW5nZS5tb2RpZmllZFVyaTtcbn1cblxuZnVuY3Rpb24gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4OiBDb21wb25lbnRGaXh0dXJlQ29udGV4dCwgb3B0aW9uczogSUNoYW5nZXNWaWV3Rml4dHVyZU9wdGlvbnMpOiB2b2lkIHtcblx0Y29uc3QgeyBjb250YWluZXIsIGRpc3Bvc2FibGVTdG9yZSwgdGhlbWUgfSA9IGN0eDtcblx0Y29uc3QgaGVpZ2h0ID0gb3B0aW9ucy5oZWlnaHQgPz8gVklFV19IRUlHSFQ7XG5cdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKG9wdGlvbnMpO1xuXHRjb25zdCBjaGFuZ2VzVmlld1NlcnZpY2UgPSBkaXNwb3NhYmxlU3RvcmUuYWRkKG5ldyBGaXh0dXJlQ2hhbmdlc1ZpZXdTZXJ2aWNlKHNlc3Npb24sIG9wdGlvbnMpKTtcblxuXHRjb250YWluZXIuc3R5bGUud2lkdGggPSBgJHtWSUVXX1dJRFRIfXB4YDtcblx0Y29udGFpbmVyLnN0eWxlLmhlaWdodCA9IGAke2hlaWdodH1weGA7XG5cdGNvbnRhaW5lci5zdHlsZS5iYWNrZ3JvdW5kQ29sb3IgPSAndmFyKC0tdnNjb2RlLXNpZGVCYXItYmFja2dyb3VuZCknO1xuXG5cdGNvbnN0IGhvc3QgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgZG9tLiQoJy5wYXJ0LmF1eGlsaWFyeWJhcicpKTtcblx0aG9zdC5zdHlsZS53aWR0aCA9ICcxMDAlJztcblx0aG9zdC5zdHlsZS5oZWlnaHQgPSAnMTAwJSc7XG5cblx0Y29uc3QgcGFuZVZpZXcgPSBkb20uYXBwZW5kKGhvc3QsIGRvbS4kKCcubW9uYWNvLXBhbmUtdmlldycpKTtcblx0cGFuZVZpZXcuc3R5bGUud2lkdGggPSAnMTAwJSc7XG5cdHBhbmVWaWV3LnN0eWxlLmhlaWdodCA9ICcxMDAlJztcblxuXHRjb25zdCBpbnN0YW50aWF0aW9uU2VydmljZSA9IGNyZWF0ZUVkaXRvclNlcnZpY2VzKGRpc3Bvc2FibGVTdG9yZSwge1xuXHRcdGNvbG9yVGhlbWU6IHRoZW1lLFxuXHRcdGFkZGl0aW9uYWxTZXJ2aWNlczogcmVnID0+IHtcblx0XHRcdHJlZ2lzdGVyV29ya2JlbmNoU2VydmljZXMocmVnKTtcblx0XHRcdHJlZy5kZWZpbmUoSU1lbnVTZXJ2aWNlLCBGaXh0dXJlTWVudVNlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZShJTGlzdFNlcnZpY2UsIExpc3RTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmUoSVNlc3Npb25DaGFuZ2VzU2VydmljZSwgU2Vzc2lvbkNoYW5nZXNTZXJ2aWNlKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJQ2hhbmdlc1ZpZXdTZXJ2aWNlLCBjaGFuZ2VzVmlld1NlcnZpY2UpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElHaXRIdWJTZXJ2aWNlLCBjcmVhdGVHaXRIdWJTZXJ2aWNlKG9wdGlvbnMuY2hlY2tzKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVZpZXdEZXNjcmlwdG9yU2VydmljZSwgbmV3IEZpeHR1cmVWaWV3RGVzY3JpcHRvclNlcnZpY2UoKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvbiA9IGNvbnN0T2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oc2Vzc2lvbik7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHZpc2libGVTZXNzaW9ucyA9IGNvbnN0T2JzZXJ2YWJsZShbc2Vzc2lvbl0pO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFRvZ2dsZVNlc3Npb25TdGlja2luZXNzID0gRXZlbnQuTm9uZTtcblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSURlY29yYXRpb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJRGVjb3JhdGlvbnNTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgb25EaWRDaGFuZ2VEZWNvcmF0aW9ucyA9IEV2ZW50Lk5vbmU7IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSVRleHRGaWxlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJVGV4dEZpbGVTZXJ2aWNlPigpIHsgb3ZlcnJpZGUgcmVhZG9ubHkgdW50aXRsZWQgPSBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElUZXh0RmlsZVNlcnZpY2VbJ3VudGl0bGVkJ10+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUxhYmVsID0gRXZlbnQuTm9uZTsgfSgpOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3Jrc3BhY2VDb250ZXh0U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJV29ya3NwYWNlQ29udGV4dFNlcnZpY2U+KCkgeyBvdmVycmlkZSBvbkRpZENoYW5nZVdvcmtzcGFjZUZvbGRlcnMgPSBFdmVudC5Ob25lOyBvdmVycmlkZSBnZXRXb3Jrc3BhY2UoKTogSVdvcmtzcGFjZSB7IHJldHVybiB7IGlkOiAnZml4dHVyZScsIGZvbGRlcnM6IFtdLCBjb25maWd1cmF0aW9uOiB1bmRlZmluZWQgfTsgfSB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3Jrc3BhY2VGb2xkZXJMYWJlbFNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVdvcmtzcGFjZUZvbGRlckxhYmVsU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGdldFdvcmtzcGFjZUZvbGRlckxhYmVsKCk6IHN0cmluZyB7XG5cdFx0XHRcdFx0cmV0dXJuICd2c2NvZGUgKGZlYXR1cmUvY2hhbmdlcy12aWV3LWZpeHR1cmVzKSc7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSU5vdGVib29rRG9jdW1lbnRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElOb3RlYm9va0RvY3VtZW50U2VydmljZT4oKSB7IG92ZXJyaWRlIGdldE5vdGVib29rKCkgeyByZXR1cm4gdW5kZWZpbmVkOyB9IH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUZpbGVTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIGFzeW5jIHJlYWRGaWxlKHJlc291cmNlOiBVUkkpOiBQcm9taXNlPElGaWxlQ29udGVudD4ge1xuXHRcdFx0XHRcdHJldHVybiBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElGaWxlQ29udGVudD4oKSB7XG5cdFx0XHRcdFx0XHRvdmVycmlkZSByZWFkb25seSByZXNvdXJjZSA9IHJlc291cmNlO1xuXHRcdFx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgdmFsdWUgPSBWU0J1ZmZlci5mcm9tU3RyaW5nKCdiZWZvcmUnKTtcblx0XHRcdFx0XHR9KCk7XG5cdFx0XHRcdH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUVkaXRvclNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUVkaXRvclNlcnZpY2U+KCkge1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEFjdGl2ZUVkaXRvckNoYW5nZSA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkVmlzaWJsZUVkaXRvcnNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZEVkaXRvcnNDaGFuZ2UgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBvcGVuRWRpdG9yKCk6IFByb21pc2U8dW5kZWZpbmVkPiB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdH0oKSk7XG5cdFx0XHRyZWcuZGVmaW5lSW5zdGFuY2UoSUV4dGVuc2lvblNlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUV4dGVuc2lvblNlcnZpY2U+KCkgeyBvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZUV4dGVuc2lvbnMgPSBFdmVudC5Ob25lOyB9KCkpO1xuXHRcdFx0cmVnLmRlZmluZUluc3RhbmNlKElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElXb3JrYmVuY2hMYXlvdXRTZXJ2aWNlPigpIHsgfSgpKTtcblx0XHRcdHJlZy5kZWZpbmVJbnN0YW5jZShJTGlmZWN5Y2xlU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJTGlmZWN5Y2xlU2VydmljZT4oKSB7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHN0YXJ0dXBLaW5kID0gU3RhcnR1cEtpbmQuTmV3V2luZG93O1xuXHRcdFx0XHRvdmVycmlkZSBwaGFzZSA9IExpZmVjeWNsZVBoYXNlLlJlc3RvcmVkO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkJlZm9yZVNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25TaHV0ZG93blZldG8gPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkJlZm9yZVNodXRkb3duRXJyb3IgPSBFdmVudC5Ob25lO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbldpbGxTaHV0ZG93biA9IEV2ZW50Lk5vbmU7XG5cdFx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IHdpbGxTaHV0ZG93biA9IGZhbHNlO1xuXHRcdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFNodXRkb3duID0gRXZlbnQuTm9uZTtcblx0XHRcdFx0b3ZlcnJpZGUgYXN5bmMgd2hlbigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0XHRvdmVycmlkZSBhc3luYyBzaHV0ZG93bigpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRcdFx0fSgpKTtcblx0XHR9LFxuXHR9KTtcblxuXHRjb25zdCB2aWV3ID0gZGlzcG9zYWJsZVN0b3JlLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGFuZ2VzVmlld1BhbmUsIHtcblx0XHRpZDogQ0hBTkdFU19WSUVXX0lELFxuXHRcdHRpdGxlOiAnQ2hhbmdlcycsXG5cdFx0bWluaW11bUJvZHlTaXplOiAwLFxuXHRcdG1heGltdW1Cb2R5U2l6ZTogTnVtYmVyLlBPU0lUSVZFX0lORklOSVRZLFxuXHR9IHNhdGlzZmllcyBJVmlld1BhbmVPcHRpb25zKSk7XG5cblx0dmlldy5yZW5kZXIoKTtcblx0cGFuZVZpZXcuYXBwZW5kQ2hpbGQodmlldy5lbGVtZW50KTtcblx0dmlldy5zZXRWaXNpYmxlKHRydWUpO1xuXHR2aWV3Lm9ydGhvZ29uYWxTaXplID0gVklFV19XSURUSDtcblx0dmlldy5sYXlvdXQoaGVpZ2h0KTtcbn1cblxuY29uc3QgU0FNUExFX0NIQU5HRVMgPSBbXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9jaGFuZ2VzVmlldy50cycsICdtb2RpZmllZCcsIDQyLCAxOCksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uRmlsZXNXaWRnZXQudHMnLCAnbW9kaWZpZWQnLCAyNCwgOSksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvYnJvd3Nlci9tZWRpYS9zZXNzaW9uRmlsZXNXaWRnZXQuY3NzJywgJ21vZGlmaWVkJywgNiwgMiksXG5cdGNyZWF0ZUZpbGVDaGFuZ2UoJ3NyYy92cy9zZXNzaW9ucy9jb250cmliL2NoYW5nZXMvdGVzdC9icm93c2VyL2NoYW5nZXNWaWV3LmZpeHR1cmUudHMnLCAnYWRkZWQnLCAxMzIsIDApLFxuXHRjcmVhdGVGaWxlQ2hhbmdlKCdzcmMvdnMvc2Vzc2lvbnMvY29udHJpYi9jaGFuZ2VzL2Jyb3dzZXIvb2xkQ2hhbmdlc0xheW91dC50cycsICdkZWxldGVkJywgMCwgNDcpLFxuXTtcblxuY29uc3QgTUFOWV9DSEFOR0VTID0gQXJyYXkuZnJvbSh7IGxlbmd0aDogNDAgfSwgKF8sIGluZGV4KSA9PlxuXHRjcmVhdGVGaWxlQ2hhbmdlKGBzcmMvZmVhdHVyZS9jaGFuZ2VkLWZpbGUtJHtTdHJpbmcoaW5kZXggKyAxKS5wYWRTdGFydCgyLCAnMCcpfS50c2AsICdtb2RpZmllZCcsIGluZGV4ICsgMSwgaW5kZXggJSA0KVxuKTtcblxuY29uc3QgU0FNUExFX09USEVSX0ZJTEVTID0gW1xuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmNvbmZpZy9jb2RlL3NldHRpbmdzLmpzb24nLCBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCksXG5cdGNyZWF0ZU90aGVyRmlsZSgnL2hvbWUvdXNlci8uY29uZmlnL2NvcGlsb3QvYWdlbnRzL2luYm94LmFnZW50Lm1kJywgU2Vzc2lvbkZpbGVPcGVyYXRpb24uQ3JlYXRlZCksXG5cdGNyZWF0ZU90aGVyRmlsZSgnL2hvbWUvdXNlci8uY2FjaGUvY29waWxvdC9zZXNzaW9uLmxvZycsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkRlbGV0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy90bXAvc2Vzc2lvbi1ub3Rlcy5tZCcsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmdpdGNvbmZpZycsIFNlc3Npb25GaWxlT3BlcmF0aW9uLk1vZGlmaWVkKSxcblx0Y3JlYXRlT3RoZXJGaWxlKCcvaG9tZS91c2VyLy5zc2gvY29uZmlnJywgU2Vzc2lvbkZpbGVPcGVyYXRpb24uTW9kaWZpZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLmxvY2FsL3NoYXJlL2NvcGlsb3Qvc3RhdGUuanNvbicsIFNlc3Npb25GaWxlT3BlcmF0aW9uLkNyZWF0ZWQpLFxuXHRjcmVhdGVPdGhlckZpbGUoJy9ob21lL3VzZXIvLnZzY29kZS1pbnNpZGVycy9hcmd2Lmpzb24nLCBTZXNzaW9uRmlsZU9wZXJhdGlvbi5Nb2RpZmllZCksXG5dO1xuXG5jb25zdCBTQU1QTEVfQ0hFQ0tTID0gW1xuXHRjcmVhdGVDaGVjaygxMDAxLCAnTGludXggLyBVbml0IFRlc3RzJywgR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyksXG5cdGNyZWF0ZUNoZWNrKDEwMDIsICdXaW5kb3dzIC8gVW5pdCBUZXN0cycsIEdpdEh1YkNoZWNrU3RhdHVzLkNvbXBsZXRlZCwgR2l0SHViQ2hlY2tDb25jbHVzaW9uLkZhaWx1cmUpLFxuXHRjcmVhdGVDaGVjaygxMDAzLCAnbWFjT1MgLyBTbW9rZSBUZXN0cycsIEdpdEh1YkNoZWNrU3RhdHVzLkluUHJvZ3Jlc3MpLFxuXHRjcmVhdGVDaGVjaygxMDA0LCAnSHlnaWVuZScsIEdpdEh1YkNoZWNrU3RhdHVzLlF1ZXVlZCksXG5cdGNyZWF0ZUNoZWNrKDEwMDUsICdDb21waWxlJywgR2l0SHViQ2hlY2tTdGF0dXMuQ29tcGxldGVkLCBHaXRIdWJDaGVja0NvbmNsdXNpb24uU3VjY2VzcyksXG5dO1xuXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVUaGVtZWRGaXh0dXJlR3JvdXAoeyBwYXRoOiAnc2Vzc2lvbnMvY2hhbmdlcy8nIH0sIHtcblx0QWxsU2VjdGlvbnNfTGlzdDogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYW5nZXNWaWV3KGN0eCwge1xuXHRcdFx0dmlld01vZGU6IENoYW5nZXNWaWV3TW9kZS5MaXN0LFxuXHRcdFx0Y2hhbmdlczogU0FNUExFX0NIQU5HRVMsXG5cdFx0XHRvdGhlckZpbGVzOiBTQU1QTEVfT1RIRVJfRklMRVMsXG5cdFx0XHRjaGVja3M6IFNBTVBMRV9DSEVDS1MsXG5cdFx0XHRyZXZpZXdDb21tZW50Q291bnRzOiBuZXcgTWFwKFtbZ2V0Q2hhbmdlVXJpKFNBTVBMRV9DSEFOR0VTWzBdKS5mc1BhdGgsIDJdXSksXG5cdFx0XHRhZ2VudEZlZWRiYWNrQ291bnRzOiBuZXcgTWFwKFtbZ2V0Q2hhbmdlVXJpKFNBTVBMRV9DSEFOR0VTWzFdKS5mc1BhdGgsIDFdXSksXG5cdFx0fSksXG5cdH0pLFxuXG5cdFRyZWVNb2RlOiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLlRyZWUsXG5cdFx0XHRjaGFuZ2VzOiBTQU1QTEVfQ0hBTkdFUyxcblx0XHRcdG90aGVyRmlsZXM6IFNBTVBMRV9PVEhFUl9GSUxFUy5zbGljZSgwLCAzKSxcblx0XHRcdGNoZWNrczogU0FNUExFX0NIRUNLUy5zbGljZSgwLCAzKSxcblx0XHR9KSxcblx0fSksXG5cblx0RmlsZXNBbmRDaGVja3NPbmx5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLkxpc3QsXG5cdFx0XHRjaGFuZ2VzOiBTQU1QTEVfQ0hBTkdFUyxcblx0XHRcdGNoZWNrczogU0FNUExFX0NIRUNLUyxcblx0XHRcdGhlaWdodDogNDQwLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRNYW55Q2hhbmdlczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYW5nZXNWaWV3KGN0eCwge1xuXHRcdFx0dmlld01vZGU6IENoYW5nZXNWaWV3TW9kZS5MaXN0LFxuXHRcdFx0Y2hhbmdlczogTUFOWV9DSEFOR0VTLFxuXHRcdFx0b3RoZXJGaWxlczogU0FNUExFX09USEVSX0ZJTEVTLFxuXHRcdFx0Y2hlY2tzOiBTQU1QTEVfQ0hFQ0tTLFxuXHRcdFx0aGVpZ2h0OiAxMjUyLFxuXHRcdH0pLFxuXHR9KSxcblxuXHRDb2xsYXBzZWRTZWN0aW9uczogZGVmaW5lQ29tcG9uZW50Rml4dHVyZSh7XG5cdFx0bGFiZWxzOiB7IGtpbmQ6ICdzY3JlZW5zaG90JyB9LFxuXHRcdHJlbmRlcjogY3R4ID0+IHJlbmRlckNoYW5nZXNWaWV3KGN0eCwge1xuXHRcdFx0dmlld01vZGU6IENoYW5nZXNWaWV3TW9kZS5MaXN0LFxuXHRcdFx0Y2hhbmdlczogU0FNUExFX0NIQU5HRVMsXG5cdFx0XHRvdGhlckZpbGVzOiBTQU1QTEVfT1RIRVJfRklMRVMsXG5cdFx0XHRjaGVja3M6IFNBTVBMRV9DSEVDS1MsXG5cdFx0XHRzZWN0aW9uQ29sbGFwc2VTdGF0ZTogeyBvdGhlckZpbGVzOiB0cnVlLCBjaGVja3M6IHRydWUgfSxcblx0XHRcdGhlaWdodDogNDQwLFxuXHRcdH0pLFxuXHR9KSxcblxuXHROb0ZpbGVDaGFuZ2VzV2l0aE90aGVyRmlsZXM6IGRlZmluZUNvbXBvbmVudEZpeHR1cmUoe1xuXHRcdGxhYmVsczogeyBraW5kOiAnc2NyZWVuc2hvdCcgfSxcblx0XHRyZW5kZXI6IGN0eCA9PiByZW5kZXJDaGFuZ2VzVmlldyhjdHgsIHtcblx0XHRcdHZpZXdNb2RlOiBDaGFuZ2VzVmlld01vZGUuTGlzdCxcblx0XHRcdGNoYW5nZXM6IFtdLFxuXHRcdFx0b3RoZXJGaWxlczogU0FNUExFX09USEVSX0ZJTEVTLFxuXHRcdFx0Y2hlY2tzOiBTQU1QTEVfQ0hFQ0tTLnNsaWNlKDAsIDIpLFxuXHRcdFx0aGVpZ2h0OiA0NDAsXG5cdFx0fSksXG5cdH0pLFxuXG5cdEVtcHR5OiBkZWZpbmVDb21wb25lbnRGaXh0dXJlKHtcblx0XHRsYWJlbHM6IHsga2luZDogJ3NjcmVlbnNob3QnIH0sXG5cdFx0cmVuZGVyOiBjdHggPT4gcmVuZGVyQ2hhbmdlc1ZpZXcoY3R4LCB7XG5cdFx0XHR2aWV3TW9kZTogQ2hhbmdlc1ZpZXdNb2RlLkxpc3QsXG5cdFx0XHRjaGFuZ2VzOiBbXSxcblx0XHRcdG90aGVyRmlsZXM6IFtdLFxuXHRcdFx0Y2hlY2tzOiBbXSxcblx0XHRcdGhlaWdodDogMjgwLFxuXHRcdH0pLFxuXHR9KSxcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsWUFBWSxTQUFTO0FBQ3JCLFNBQVMsZ0JBQWdCO0FBQ3pCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGFBQWE7QUFDdEIsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyxpQkFBOEIsdUJBQXVCO0FBRTlELFNBQVMsV0FBVztBQUNwQixTQUFTLFlBQVk7QUFDckIsU0FBUyxpQkFBaUI7QUFDMUIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBdUIsb0JBQW9CO0FBQzNDLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsY0FBYyxtQkFBbUI7QUFDMUMsU0FBcUIsZ0NBQWdDO0FBRXJELFNBQStDLHdCQUEyRCw2QkFBNkI7QUFDdkksU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUywyQkFBMkI7QUFDcEMsU0FBUyxzQkFBc0I7QUFDL0Is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
