import assert from "assert";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { mock, upcastPartial } from "../../../../../base/test/common/mock.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { MockContextKeyService } from "../../../../../platform/keybinding/test/common/mockKeybindingService.js";
import { TestStorageService } from "../../../../../workbench/test/common/workbenchTestServices.js";
import { SessionChangesetOperationScope, SessionChangesetOperationStatus } from "../../../../services/sessions/common/session.js";
import { PRReviewStateKind } from "../../../codeReview/browser/codeReviewService.js";
import { ChangesViewService } from "../../browser/changesViewService.js";
import { ChangesViewMode } from "../../common/changes.js";
suite("ChangesViewService", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(id, options) {
    const workspace = options?.baseBranchProtected === void 0 ? void 0 : upcastPartial({
      folders: [upcastPartial({
        root: URI.file("/repo"),
        name: "repo",
        gitRepository: upcastPartial({
          uri: URI.file("/repo"),
          workTreeUri: URI.file("/repo.worktrees/session"),
          baseBranchName: "main",
          baseBranchProtected: options.baseBranchProtected,
          gitHubInfo: constObservable(void 0)
        })
      })]
    });
    return upcastPartial({
      resource: URI.from({ scheme: "test-session", path: `/${id}` }),
      providerId: "local-agent-host",
      sessionType: "test",
      loading: constObservable(false),
      changesets: constObservable(options?.changesets ?? []),
      workspace: constObservable(workspace)
    });
  }
  function createChangeset(operations) {
    return upcastPartial({
      id: "branch",
      label: "Branch Changes",
      isDefault: constObservable(true),
      isEnabled: constObservable(true),
      isLoadingChanges: constObservable(false),
      operations: constObservable(operations),
      changes: constObservable([])
    });
  }
  function createTransientChangeset() {
    return upcastPartial({
      id: "turn:request",
      label: "Turn Changes",
      isDefault: constObservable(false),
      isEnabled: constObservable(true),
      isLoadingChanges: constObservable(false),
      operations: constObservable([]),
      changes: constObservable([])
    });
  }
  function createHarness(initialSession, storageService = disposables.add(new TestStorageService())) {
    const activeSession = observableValue("test.activeSession", initialSession);
    const onDidReplaceSession = disposables.add(new Emitter());
    const onDidDeleteSession = disposables.add(new Emitter());
    const onDidDiscardNewSession = disposables.add(new Emitter());
    const onDidReplaceNewDraftSession = disposables.add(new Emitter());
    const sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = activeSession;
      }
    }();
    const sessionsManagementService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidReplaceSession = onDidReplaceSession.event;
        this.onDidDeleteSession = onDidDeleteSession.event;
        this.onDidDiscardNewSession = onDidDiscardNewSession.event;
        this.onDidReplaceNewDraftSession = onDidReplaceNewDraftSession.event;
      }
    }();
    const agentFeedbackService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.onDidChangeFeedback = Event.None;
        this.activeFeedbackSessionResource = constObservable(URI.from({ scheme: "test-feedback" }));
      }
      getFeedback() {
        return [];
      }
    }();
    const codeReviewService = new class extends mock() {
      getPRReviewState() {
        return constObservable({ kind: PRReviewStateKind.None });
      }
    }();
    const service = disposables.add(new ChangesViewService(
      agentFeedbackService,
      codeReviewService,
      disposables.add(new MockContextKeyService()),
      sessionsService,
      storageService,
      sessionsManagementService
    ));
    return { activeSession, onDidDeleteSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, onDidReplaceSession, service, storageService };
  }
  test("restores section collapse state independently per session", () => {
    const sessionA = createSession("a");
    const sessionB = createSession("b");
    const { activeSession, service } = createHarness(sessionA);
    const states = [service.activeSessionSectionCollapseStateObs.get()];
    service.setSectionCollapsed(sessionA.resource, "otherFiles", true);
    service.setSectionCollapsed(sessionA.resource, "checks", false);
    states.push(service.activeSessionSectionCollapseStateObs.get());
    activeSession.set(sessionB, void 0);
    states.push(service.activeSessionSectionCollapseStateObs.get());
    service.setSectionCollapsed(sessionB.resource, "checks", false);
    states.push(service.activeSessionSectionCollapseStateObs.get());
    activeSession.set(sessionA, void 0);
    states.push(service.activeSessionSectionCollapseStateObs.get());
    assert.deepStrictEqual(states, [
      { otherFiles: false, checks: true },
      { otherFiles: true, checks: false },
      { otherFiles: false, checks: true },
      { otherFiles: false, checks: false },
      { otherFiles: true, checks: false }
    ]);
  });
  test("transfers collapse state on replacement and removes it on deletion", () => {
    const draft = createSession("draft");
    const committed = createSession("committed");
    const { activeSession, onDidDeleteSession, onDidReplaceSession, service } = createHarness(draft);
    const detailsViewState = {
      focus: [],
      selection: [],
      expanded: {},
      scrollTop: 40
    };
    service.setSectionCollapsed(draft.resource, "otherFiles", true);
    service.setDetailsViewState(draft.resource, ChangesViewMode.List, detailsViewState);
    activeSession.set(committed, void 0);
    onDidReplaceSession.fire({ from: draft, to: committed });
    const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
    const detailsAfterReplacement = service.getDetailsViewState(committed.resource, ChangesViewMode.List);
    const detailsViewStateTransfer = service.detailsViewStateTransferObs.get();
    onDidDeleteSession.fire(committed);
    const afterDeletion = service.activeSessionSectionCollapseStateObs.get();
    const detailsAfterDeletion = service.getDetailsViewState(committed.resource, ChangesViewMode.List);
    assert.deepStrictEqual({ afterReplacement, detailsAfterReplacement, detailsViewStateTransfer, afterDeletion, detailsAfterDeletion }, {
      afterReplacement: { otherFiles: true, checks: true },
      detailsAfterReplacement: detailsViewState,
      detailsViewStateTransfer: { from: draft.resource, to: committed.resource },
      afterDeletion: { otherFiles: false, checks: true },
      detailsAfterDeletion: void 0
    });
  });
  test("removes collapse state when a draft is discarded or replaced by another draft", () => {
    const firstDraft = createSession("first-draft");
    const secondDraft = createSession("second-draft");
    const { activeSession, onDidDiscardNewSession, onDidReplaceNewDraftSession, service } = createHarness(firstDraft);
    service.setSectionCollapsed(firstDraft.resource, "otherFiles", true);
    activeSession.set(secondDraft, void 0);
    onDidReplaceNewDraftSession.fire({ from: firstDraft, to: secondDraft });
    const afterReplacement = service.activeSessionSectionCollapseStateObs.get();
    service.setSectionCollapsed(secondDraft.resource, "otherFiles", true);
    onDidDiscardNewSession.fire(secondDraft);
    const afterDiscard = service.activeSessionSectionCollapseStateObs.get();
    assert.deepStrictEqual({ afterReplacement, afterDiscard }, {
      afterReplacement: { otherFiles: false, checks: true },
      afterDiscard: { otherFiles: false, checks: true }
    });
  });
  test("restores details view state independently per session and view mode", () => {
    const sessionA = createSession("a");
    const sessionB = createSession("b");
    const { service } = createHarness(sessionA);
    const listState = {
      focus: ["file:///repo/a.ts"],
      selection: ["file:///repo/a.ts"],
      expanded: {},
      scrollTop: 80
    };
    const treeState = {
      focus: [],
      selection: [],
      expanded: { "file:///repo/src": 0 },
      scrollTop: 120
    };
    service.setDetailsViewState(sessionA.resource, ChangesViewMode.List, listState);
    service.setDetailsViewState(sessionA.resource, ChangesViewMode.Tree, treeState);
    assert.deepStrictEqual({
      sessionAList: service.getDetailsViewState(sessionA.resource, ChangesViewMode.List),
      sessionATree: service.getDetailsViewState(sessionA.resource, ChangesViewMode.Tree),
      sessionBList: service.getDetailsViewState(sessionB.resource, ChangesViewMode.List)
    }, {
      sessionAList: listState,
      sessionATree: treeState,
      sessionBList: void 0
    });
  });
  test("retains details view state for the 100 most recently used sessions", () => {
    const firstSession = createSession("0");
    const { service } = createHarness(firstSession);
    const state = {
      focus: [],
      selection: [],
      expanded: {},
      scrollTop: 0
    };
    for (let i = 0; i <= 100; i++) {
      service.setDetailsViewState(createSession(`${i}`).resource, ChangesViewMode.List, state);
    }
    assert.deepStrictEqual({
      first: service.getDetailsViewState(firstSession.resource, ChangesViewMode.List),
      last: service.getDetailsViewState(createSession("100").resource, ChangesViewMode.List)
    }, {
      first: void 0,
      last: state
    });
  });
  test("persists Changes view state mutations immediately", () => {
    const draft = createSession("draft");
    const committed = createSession("committed");
    const storageService = disposables.add(new TestStorageService());
    const firstHarness = createHarness(draft, storageService);
    const detailsViewState = {
      focus: ["file:///repo/a.ts"],
      selection: ["file:///repo/a.ts"],
      expanded: { "file:///repo/src": 0 },
      scrollTop: 64
    };
    firstHarness.service.setDetailsViewState(draft.resource, ChangesViewMode.Tree, detailsViewState);
    firstHarness.onDidReplaceSession.fire({ from: draft, to: committed });
    firstHarness.service.dispose();
    const restoredService = createHarness(committed, storageService).service;
    assert.deepStrictEqual({
      detailsViewState: restoredService.getDetailsViewState(committed.resource, ChangesViewMode.Tree),
      draftDetailsViewState: restoredService.getDetailsViewState(draft.resource, ChangesViewMode.Tree)
    }, {
      detailsViewState,
      draftDetailsViewState: void 0
    });
  });
  test("scopes a transient changeset to its session and clears it on provider selection", () => {
    const branchChangeset = createChangeset([]);
    const transientChangeset = createTransientChangeset();
    const sessionA = createSession("a", { changesets: [branchChangeset] });
    const sessionB = createSession("b", { changesets: [branchChangeset] });
    const { activeSession, service } = createHarness(sessionA);
    service.showChangeset(transientChangeset);
    const transientSelection = {
      changesets: service.activeSessionChangesetsObs.get()?.map((changeset) => changeset.id),
      selected: service.activeSessionChangesetObs.get()?.id
    };
    service.setChangesetId(branchChangeset.id);
    const providerSelection = {
      changesets: service.activeSessionChangesetsObs.get()?.map((changeset) => changeset.id),
      selected: service.activeSessionChangesetObs.get()?.id
    };
    service.showChangeset(transientChangeset);
    activeSession.set(sessionB, void 0);
    const afterSessionSwitch = {
      changesets: service.activeSessionChangesetsObs.get()?.map((changeset) => changeset.id),
      selected: service.activeSessionChangesetObs.get()?.id
    };
    assert.deepStrictEqual({ transientSelection, providerSelection, afterSessionSwitch }, {
      transientSelection: {
        changesets: ["branch", "turn:request"],
        selected: "turn:request"
      },
      providerSelection: {
        changesets: ["branch"],
        selected: "branch"
      },
      afterSessionSwitch: {
        changesets: ["branch"],
        selected: "branch"
      }
    });
  });
  test("hides the Agent Host merge operation when the base branch is protected", () => {
    const operations = [
      {
        id: "merge",
        label: "Merge Changes",
        scopes: [SessionChangesetOperationScope.Changeset],
        status: SessionChangesetOperationStatus.Idle
      },
      {
        id: "create-pr",
        label: "Create PR",
        scopes: [SessionChangesetOperationScope.Changeset],
        status: SessionChangesetOperationStatus.Idle
      }
    ];
    const changeset = createChangeset(operations);
    const unprotected = createSession("unprotected", { changesets: [changeset], baseBranchProtected: false });
    const protectedSession = createSession("protected", { changesets: [changeset], baseBranchProtected: true });
    const unknown = createSession("unknown", { changesets: [changeset] });
    const { activeSession, service } = createHarness(unprotected);
    const visibleOperations = [service.activeSessionChangesetOperationsObs.get().map((operation) => operation.id)];
    activeSession.set(protectedSession, void 0);
    visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map((operation) => operation.id));
    activeSession.set(unknown, void 0);
    visibleOperations.push(service.activeSessionChangesetOperationsObs.get().map((operation) => operation.id));
    assert.deepStrictEqual(visibleOperations, [
      ["merge", "create-pr"],
      ["create-pr"],
      ["merge", "create-pr"]
    ]);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY2hhbmdlc1xcdGVzdFxcYnJvd3NlclxcY2hhbmdlc1ZpZXdTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbW9jaywgdXBjYXN0UGFydGlhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IE1vY2tDb250ZXh0S2V5U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2tleWJpbmRpbmcvdGVzdC9jb21tb24vbW9ja0tleWJpbmRpbmdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IFRlc3RTdG9yYWdlU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC90ZXN0L2NvbW1vbi93b3JrYmVuY2hUZXN0U2VydmljZXMuanMnO1xuaW1wb3J0IHsgSUFjdGl2ZVNlc3Npb24sIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbiwgSVNlc3Npb25DaGFuZ2VzZXQsIElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uLCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25HaXRSZXBvc2l0b3J5LCBJU2Vzc2lvbldvcmtzcGFjZSwgU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLCBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb24uanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEZlZWRiYWNrU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2FnZW50RmVlZGJhY2svYnJvd3Nlci9hZ2VudEZlZWRiYWNrU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UsIFBSUmV2aWV3U3RhdGVLaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29kZVJldmlldy9icm93c2VyL2NvZGVSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYW5nZXNWaWV3U2VydmljZSB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY2hhbmdlc1ZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYW5nZXNWaWV3TW9kZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGFuZ2VzLmpzJztcblxuc3VpdGUoJ0NoYW5nZXNWaWV3U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24oaWQ6IHN0cmluZywgb3B0aW9ucz86IHsgcmVhZG9ubHkgY2hhbmdlc2V0cz86IHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W107IHJlYWRvbmx5IGJhc2VCcmFuY2hQcm90ZWN0ZWQ/OiBib29sZWFuIH0pOiBJQWN0aXZlU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gb3B0aW9ucz8uYmFzZUJyYW5jaFByb3RlY3RlZCA9PT0gdW5kZWZpbmVkXG5cdFx0XHQ/IHVuZGVmaW5lZFxuXHRcdFx0OiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uV29ya3NwYWNlPih7XG5cdFx0XHRcdGZvbGRlcnM6IFt1cGNhc3RQYXJ0aWFsPElTZXNzaW9uRm9sZGVyPih7XG5cdFx0XHRcdFx0cm9vdDogVVJJLmZpbGUoJy9yZXBvJyksXG5cdFx0XHRcdFx0bmFtZTogJ3JlcG8nLFxuXHRcdFx0XHRcdGdpdFJlcG9zaXRvcnk6IHVwY2FzdFBhcnRpYWw8SVNlc3Npb25HaXRSZXBvc2l0b3J5Pih7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvcmVwbycpLFxuXHRcdFx0XHRcdFx0d29ya1RyZWVVcmk6IFVSSS5maWxlKCcvcmVwby53b3JrdHJlZXMvc2Vzc2lvbicpLFxuXHRcdFx0XHRcdFx0YmFzZUJyYW5jaE5hbWU6ICdtYWluJyxcblx0XHRcdFx0XHRcdGJhc2VCcmFuY2hQcm90ZWN0ZWQ6IG9wdGlvbnMuYmFzZUJyYW5jaFByb3RlY3RlZCxcblx0XHRcdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9KV0sXG5cdFx0XHR9KTtcblx0XHRyZXR1cm4gdXBjYXN0UGFydGlhbDxJQWN0aXZlU2Vzc2lvbj4oe1xuXHRcdFx0cmVzb3VyY2U6IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdC1zZXNzaW9uJywgcGF0aDogYC8ke2lkfWAgfSksXG5cdFx0XHRwcm92aWRlcklkOiAnbG9jYWwtYWdlbnQtaG9zdCcsXG5cdFx0XHRzZXNzaW9uVHlwZTogJ3Rlc3QnLFxuXHRcdFx0bG9hZGluZzogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdGNoYW5nZXNldHM6IGNvbnN0T2JzZXJ2YWJsZShvcHRpb25zPy5jaGFuZ2VzZXRzID8/IFtdKSxcblx0XHRcdHdvcmtzcGFjZTogY29uc3RPYnNlcnZhYmxlKHdvcmtzcGFjZSksXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVDaGFuZ2VzZXQob3BlcmF0aW9uczogcmVhZG9ubHkgSVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25bXSk6IElTZXNzaW9uQ2hhbmdlc2V0IHtcblx0XHRyZXR1cm4gdXBjYXN0UGFydGlhbDxJU2Vzc2lvbkNoYW5nZXNldD4oe1xuXHRcdFx0aWQ6ICdicmFuY2gnLFxuXHRcdFx0bGFiZWw6ICdCcmFuY2ggQ2hhbmdlcycsXG5cdFx0XHRpc0RlZmF1bHQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGlzRW5hYmxlZDogY29uc3RPYnNlcnZhYmxlKHRydWUpLFxuXHRcdFx0aXNMb2FkaW5nQ2hhbmdlczogY29uc3RPYnNlcnZhYmxlKGZhbHNlKSxcblx0XHRcdG9wZXJhdGlvbnM6IGNvbnN0T2JzZXJ2YWJsZShvcGVyYXRpb25zKSxcblx0XHRcdGNoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShbXSksXG5cdFx0fSk7XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVUcmFuc2llbnRDaGFuZ2VzZXQoKTogSVNlc3Npb25DaGFuZ2VzZXQge1xuXHRcdHJldHVybiB1cGNhc3RQYXJ0aWFsPElTZXNzaW9uQ2hhbmdlc2V0Pih7XG5cdFx0XHRpZDogJ3R1cm46cmVxdWVzdCcsXG5cdFx0XHRsYWJlbDogJ1R1cm4gQ2hhbmdlcycsXG5cdFx0XHRpc0RlZmF1bHQ6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0XHRpc0VuYWJsZWQ6IGNvbnN0T2JzZXJ2YWJsZSh0cnVlKSxcblx0XHRcdGlzTG9hZGluZ0NoYW5nZXM6IGNvbnN0T2JzZXJ2YWJsZShmYWxzZSksXG5cdFx0XHRvcGVyYXRpb25zOiBjb25zdE9ic2VydmFibGUoW10pLFxuXHRcdFx0Y2hhbmdlczogY29uc3RPYnNlcnZhYmxlKFtdKSxcblx0XHR9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZUhhcm5lc3MoaW5pdGlhbFNlc3Npb246IElBY3RpdmVTZXNzaW9uLCBzdG9yYWdlU2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVzdFN0b3JhZ2VTZXJ2aWNlKCkpKSB7XG5cdFx0Y29uc3QgYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Rlc3QuYWN0aXZlU2Vzc2lvbicsIGluaXRpYWxTZXNzaW9uKTtcblx0XHRjb25zdCBvbkRpZFJlcGxhY2VTZXNzaW9uID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBFbWl0dGVyPHsgcmVhZG9ubHkgZnJvbTogSVNlc3Npb247IHJlYWRvbmx5IHRvOiBJU2Vzc2lvbiB9PigpKTtcblx0XHRjb25zdCBvbkRpZERlbGV0ZVNlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRcdGNvbnN0IG9uRGlkRGlzY2FyZE5ld1Nlc3Npb24gPSBkaXNwb3NhYmxlcy5hZGQobmV3IEVtaXR0ZXI8SVNlc3Npb24+KCkpO1xuXHRcdGNvbnN0IG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjx7IHJlYWRvbmx5IGZyb206IElTZXNzaW9uOyByZWFkb25seSB0bzogSVNlc3Npb24gfT4oKSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbnNTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb24gPSBhY3RpdmVTZXNzaW9uO1xuXHRcdH0oKTtcblx0XHRjb25zdCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZFJlcGxhY2VTZXNzaW9uID0gb25EaWRSZXBsYWNlU2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRGVsZXRlU2Vzc2lvbiA9IG9uRGlkRGVsZXRlU2Vzc2lvbi5ldmVudDtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkRGlzY2FyZE5ld1Nlc3Npb24gPSBvbkRpZERpc2NhcmROZXdTZXNzaW9uLmV2ZW50O1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uID0gb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLmV2ZW50O1xuXHRcdH0oKTtcblx0XHRjb25zdCBhZ2VudEZlZWRiYWNrU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SUFnZW50RmVlZGJhY2tTZXJ2aWNlPigpIHtcblx0XHRcdG92ZXJyaWRlIHJlYWRvbmx5IG9uRGlkQ2hhbmdlRmVlZGJhY2sgPSBFdmVudC5Ob25lO1xuXHRcdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlRmVlZGJhY2tTZXNzaW9uUmVzb3VyY2UgPSBjb25zdE9ic2VydmFibGUoVVJJLmZyb20oeyBzY2hlbWU6ICd0ZXN0LWZlZWRiYWNrJyB9KSk7XG5cdFx0XHRvdmVycmlkZSBnZXRGZWVkYmFjaygpIHsgcmV0dXJuIFtdOyB9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IGNvZGVSZXZpZXdTZXJ2aWNlID0gbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJQ29kZVJldmlld1NlcnZpY2U+KCkge1xuXHRcdFx0b3ZlcnJpZGUgZ2V0UFJSZXZpZXdTdGF0ZSgpIHtcblx0XHRcdFx0cmV0dXJuIGNvbnN0T2JzZXJ2YWJsZSh7IGtpbmQ6IFBSUmV2aWV3U3RhdGVLaW5kLk5vbmUgfSBhcyBjb25zdCk7XG5cdFx0XHR9XG5cdFx0fSgpO1xuXHRcdGNvbnN0IHNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IENoYW5nZXNWaWV3U2VydmljZShcblx0XHRcdGFnZW50RmVlZGJhY2tTZXJ2aWNlLFxuXHRcdFx0Y29kZVJldmlld1NlcnZpY2UsXG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IE1vY2tDb250ZXh0S2V5U2VydmljZSgpKSxcblx0XHRcdHNlc3Npb25zU2VydmljZSxcblx0XHRcdHN0b3JhZ2VTZXJ2aWNlLFxuXHRcdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSxcblx0XHQpKTtcblxuXHRcdHJldHVybiB7IGFjdGl2ZVNlc3Npb24sIG9uRGlkRGVsZXRlU2Vzc2lvbiwgb25EaWREaXNjYXJkTmV3U2Vzc2lvbiwgb25EaWRSZXBsYWNlTmV3RHJhZnRTZXNzaW9uLCBvbkRpZFJlcGxhY2VTZXNzaW9uLCBzZXJ2aWNlLCBzdG9yYWdlU2VydmljZSB9O1xuXHR9XG5cblx0dGVzdCgncmVzdG9yZXMgc2VjdGlvbiBjb2xsYXBzZSBzdGF0ZSBpbmRlcGVuZGVudGx5IHBlciBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25BID0gY3JlYXRlU2Vzc2lvbignYScpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gY3JlYXRlU2Vzc2lvbignYicpO1xuXHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbiwgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhzZXNzaW9uQSk7XG5cblx0XHRjb25zdCBzdGF0ZXMgPSBbc2VydmljZS5hY3RpdmVTZXNzaW9uU2VjdGlvbkNvbGxhcHNlU3RhdGVPYnMuZ2V0KCldO1xuXHRcdHNlcnZpY2Uuc2V0U2VjdGlvbkNvbGxhcHNlZChzZXNzaW9uQS5yZXNvdXJjZSwgJ290aGVyRmlsZXMnLCB0cnVlKTtcblx0XHRzZXJ2aWNlLnNldFNlY3Rpb25Db2xsYXBzZWQoc2Vzc2lvbkEucmVzb3VyY2UsICdjaGVja3MnLCBmYWxzZSk7XG5cdFx0c3RhdGVzLnB1c2goc2VydmljZS5hY3RpdmVTZXNzaW9uU2VjdGlvbkNvbGxhcHNlU3RhdGVPYnMuZ2V0KCkpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHNlc3Npb25CLCB1bmRlZmluZWQpO1xuXHRcdHN0YXRlcy5wdXNoKHNlcnZpY2UuYWN0aXZlU2Vzc2lvblNlY3Rpb25Db2xsYXBzZVN0YXRlT2JzLmdldCgpKTtcblx0XHRzZXJ2aWNlLnNldFNlY3Rpb25Db2xsYXBzZWQoc2Vzc2lvbkIucmVzb3VyY2UsICdjaGVja3MnLCBmYWxzZSk7XG5cdFx0c3RhdGVzLnB1c2goc2VydmljZS5hY3RpdmVTZXNzaW9uU2VjdGlvbkNvbGxhcHNlU3RhdGVPYnMuZ2V0KCkpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHNlc3Npb25BLCB1bmRlZmluZWQpO1xuXHRcdHN0YXRlcy5wdXNoKHNlcnZpY2UuYWN0aXZlU2Vzc2lvblNlY3Rpb25Db2xsYXBzZVN0YXRlT2JzLmdldCgpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGVzLCBbXG5cdFx0XHR7IG90aGVyRmlsZXM6IGZhbHNlLCBjaGVja3M6IHRydWUgfSxcblx0XHRcdHsgb3RoZXJGaWxlczogdHJ1ZSwgY2hlY2tzOiBmYWxzZSB9LFxuXHRcdFx0eyBvdGhlckZpbGVzOiBmYWxzZSwgY2hlY2tzOiB0cnVlIH0sXG5cdFx0XHR7IG90aGVyRmlsZXM6IGZhbHNlLCBjaGVja3M6IGZhbHNlIH0sXG5cdFx0XHR7IG90aGVyRmlsZXM6IHRydWUsIGNoZWNrczogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHJhbnNmZXJzIGNvbGxhcHNlIHN0YXRlIG9uIHJlcGxhY2VtZW50IGFuZCByZW1vdmVzIGl0IG9uIGRlbGV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGRyYWZ0ID0gY3JlYXRlU2Vzc2lvbignZHJhZnQnKTtcblx0XHRjb25zdCBjb21taXR0ZWQgPSBjcmVhdGVTZXNzaW9uKCdjb21taXR0ZWQnKTtcblx0XHRjb25zdCB7IGFjdGl2ZVNlc3Npb24sIG9uRGlkRGVsZXRlU2Vzc2lvbiwgb25EaWRSZXBsYWNlU2Vzc2lvbiwgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhkcmFmdCk7XG5cdFx0Y29uc3QgZGV0YWlsc1ZpZXdTdGF0ZSA9IHtcblx0XHRcdGZvY3VzOiBbXSxcblx0XHRcdHNlbGVjdGlvbjogW10sXG5cdFx0XHRleHBhbmRlZDoge30sXG5cdFx0XHRzY3JvbGxUb3A6IDQwLFxuXHRcdH07XG5cblx0XHRzZXJ2aWNlLnNldFNlY3Rpb25Db2xsYXBzZWQoZHJhZnQucmVzb3VyY2UsICdvdGhlckZpbGVzJywgdHJ1ZSk7XG5cdFx0c2VydmljZS5zZXREZXRhaWxzVmlld1N0YXRlKGRyYWZ0LnJlc291cmNlLCBDaGFuZ2VzVmlld01vZGUuTGlzdCwgZGV0YWlsc1ZpZXdTdGF0ZSk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQoY29tbWl0dGVkLCB1bmRlZmluZWQpO1xuXHRcdG9uRGlkUmVwbGFjZVNlc3Npb24uZmlyZSh7IGZyb206IGRyYWZ0LCB0bzogY29tbWl0dGVkIH0pO1xuXHRcdGNvbnN0IGFmdGVyUmVwbGFjZW1lbnQgPSBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icy5nZXQoKTtcblx0XHRjb25zdCBkZXRhaWxzQWZ0ZXJSZXBsYWNlbWVudCA9IHNlcnZpY2UuZ2V0RGV0YWlsc1ZpZXdTdGF0ZShjb21taXR0ZWQucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblx0XHRjb25zdCBkZXRhaWxzVmlld1N0YXRlVHJhbnNmZXIgPSBzZXJ2aWNlLmRldGFpbHNWaWV3U3RhdGVUcmFuc2Zlck9icy5nZXQoKTtcblx0XHRvbkRpZERlbGV0ZVNlc3Npb24uZmlyZShjb21taXR0ZWQpO1xuXHRcdGNvbnN0IGFmdGVyRGVsZXRpb24gPSBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icy5nZXQoKTtcblx0XHRjb25zdCBkZXRhaWxzQWZ0ZXJEZWxldGlvbiA9IHNlcnZpY2UuZ2V0RGV0YWlsc1ZpZXdTdGF0ZShjb21taXR0ZWQucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5MaXN0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZnRlclJlcGxhY2VtZW50LCBkZXRhaWxzQWZ0ZXJSZXBsYWNlbWVudCwgZGV0YWlsc1ZpZXdTdGF0ZVRyYW5zZmVyLCBhZnRlckRlbGV0aW9uLCBkZXRhaWxzQWZ0ZXJEZWxldGlvbiB9LCB7XG5cdFx0XHRhZnRlclJlcGxhY2VtZW50OiB7IG90aGVyRmlsZXM6IHRydWUsIGNoZWNrczogdHJ1ZSB9LFxuXHRcdFx0ZGV0YWlsc0FmdGVyUmVwbGFjZW1lbnQ6IGRldGFpbHNWaWV3U3RhdGUsXG5cdFx0XHRkZXRhaWxzVmlld1N0YXRlVHJhbnNmZXI6IHsgZnJvbTogZHJhZnQucmVzb3VyY2UsIHRvOiBjb21taXR0ZWQucmVzb3VyY2UgfSxcblx0XHRcdGFmdGVyRGVsZXRpb246IHsgb3RoZXJGaWxlczogZmFsc2UsIGNoZWNrczogdHJ1ZSB9LFxuXHRcdFx0ZGV0YWlsc0FmdGVyRGVsZXRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlcyBjb2xsYXBzZSBzdGF0ZSB3aGVuIGEgZHJhZnQgaXMgZGlzY2FyZGVkIG9yIHJlcGxhY2VkIGJ5IGFub3RoZXIgZHJhZnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZmlyc3REcmFmdCA9IGNyZWF0ZVNlc3Npb24oJ2ZpcnN0LWRyYWZ0Jyk7XG5cdFx0Y29uc3Qgc2Vjb25kRHJhZnQgPSBjcmVhdGVTZXNzaW9uKCdzZWNvbmQtZHJhZnQnKTtcblx0XHRjb25zdCB7IGFjdGl2ZVNlc3Npb24sIG9uRGlkRGlzY2FyZE5ld1Nlc3Npb24sIG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbiwgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhmaXJzdERyYWZ0KTtcblxuXHRcdHNlcnZpY2Uuc2V0U2VjdGlvbkNvbGxhcHNlZChmaXJzdERyYWZ0LnJlc291cmNlLCAnb3RoZXJGaWxlcycsIHRydWUpO1xuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHNlY29uZERyYWZ0LCB1bmRlZmluZWQpO1xuXHRcdG9uRGlkUmVwbGFjZU5ld0RyYWZ0U2Vzc2lvbi5maXJlKHsgZnJvbTogZmlyc3REcmFmdCwgdG86IHNlY29uZERyYWZ0IH0pO1xuXHRcdGNvbnN0IGFmdGVyUmVwbGFjZW1lbnQgPSBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icy5nZXQoKTtcblx0XHRzZXJ2aWNlLnNldFNlY3Rpb25Db2xsYXBzZWQoc2Vjb25kRHJhZnQucmVzb3VyY2UsICdvdGhlckZpbGVzJywgdHJ1ZSk7XG5cdFx0b25EaWREaXNjYXJkTmV3U2Vzc2lvbi5maXJlKHNlY29uZERyYWZ0KTtcblx0XHRjb25zdCBhZnRlckRpc2NhcmQgPSBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25TZWN0aW9uQ29sbGFwc2VTdGF0ZU9icy5nZXQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhZnRlclJlcGxhY2VtZW50LCBhZnRlckRpc2NhcmQgfSwge1xuXHRcdFx0YWZ0ZXJSZXBsYWNlbWVudDogeyBvdGhlckZpbGVzOiBmYWxzZSwgY2hlY2tzOiB0cnVlIH0sXG5cdFx0XHRhZnRlckRpc2NhcmQ6IHsgb3RoZXJGaWxlczogZmFsc2UsIGNoZWNrczogdHJ1ZSB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBkZXRhaWxzIHZpZXcgc3RhdGUgaW5kZXBlbmRlbnRseSBwZXIgc2Vzc2lvbiBhbmQgdmlldyBtb2RlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25BID0gY3JlYXRlU2Vzc2lvbignYScpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gY3JlYXRlU2Vzc2lvbignYicpO1xuXHRcdGNvbnN0IHsgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhzZXNzaW9uQSk7XG5cdFx0Y29uc3QgbGlzdFN0YXRlID0ge1xuXHRcdFx0Zm9jdXM6IFsnZmlsZTovLy9yZXBvL2EudHMnXSxcblx0XHRcdHNlbGVjdGlvbjogWydmaWxlOi8vL3JlcG8vYS50cyddLFxuXHRcdFx0ZXhwYW5kZWQ6IHt9LFxuXHRcdFx0c2Nyb2xsVG9wOiA4MCxcblx0XHR9O1xuXHRcdGNvbnN0IHRyZWVTdGF0ZSA9IHtcblx0XHRcdGZvY3VzOiBbXSxcblx0XHRcdHNlbGVjdGlvbjogW10sXG5cdFx0XHRleHBhbmRlZDogeyAnZmlsZTovLy9yZXBvL3NyYyc6IDAgYXMgY29uc3QgfSxcblx0XHRcdHNjcm9sbFRvcDogMTIwLFxuXHRcdH07XG5cblx0XHRzZXJ2aWNlLnNldERldGFpbHNWaWV3U3RhdGUoc2Vzc2lvbkEucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5MaXN0LCBsaXN0U3RhdGUpO1xuXHRcdHNlcnZpY2Uuc2V0RGV0YWlsc1ZpZXdTdGF0ZShzZXNzaW9uQS5yZXNvdXJjZSwgQ2hhbmdlc1ZpZXdNb2RlLlRyZWUsIHRyZWVTdGF0ZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb25BTGlzdDogc2VydmljZS5nZXREZXRhaWxzVmlld1N0YXRlKHNlc3Npb25BLnJlc291cmNlLCBDaGFuZ2VzVmlld01vZGUuTGlzdCksXG5cdFx0XHRzZXNzaW9uQVRyZWU6IHNlcnZpY2UuZ2V0RGV0YWlsc1ZpZXdTdGF0ZShzZXNzaW9uQS5yZXNvdXJjZSwgQ2hhbmdlc1ZpZXdNb2RlLlRyZWUpLFxuXHRcdFx0c2Vzc2lvbkJMaXN0OiBzZXJ2aWNlLmdldERldGFpbHNWaWV3U3RhdGUoc2Vzc2lvbkIucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5MaXN0KSxcblx0XHR9LCB7XG5cdFx0XHRzZXNzaW9uQUxpc3Q6IGxpc3RTdGF0ZSxcblx0XHRcdHNlc3Npb25BVHJlZTogdHJlZVN0YXRlLFxuXHRcdFx0c2Vzc2lvbkJMaXN0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JldGFpbnMgZGV0YWlscyB2aWV3IHN0YXRlIGZvciB0aGUgMTAwIG1vc3QgcmVjZW50bHkgdXNlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCcwJyk7XG5cdFx0Y29uc3QgeyBzZXJ2aWNlIH0gPSBjcmVhdGVIYXJuZXNzKGZpcnN0U2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3RhdGUgPSB7XG5cdFx0XHRmb2N1czogW10sXG5cdFx0XHRzZWxlY3Rpb246IFtdLFxuXHRcdFx0ZXhwYW5kZWQ6IHt9LFxuXHRcdFx0c2Nyb2xsVG9wOiAwLFxuXHRcdH07XG5cblx0XHRmb3IgKGxldCBpID0gMDsgaSA8PSAxMDA7IGkrKykge1xuXHRcdFx0c2VydmljZS5zZXREZXRhaWxzVmlld1N0YXRlKGNyZWF0ZVNlc3Npb24oYCR7aX1gKS5yZXNvdXJjZSwgQ2hhbmdlc1ZpZXdNb2RlLkxpc3QsIHN0YXRlKTtcblx0XHR9XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBzZXJ2aWNlLmdldERldGFpbHNWaWV3U3RhdGUoZmlyc3RTZXNzaW9uLnJlc291cmNlLCBDaGFuZ2VzVmlld01vZGUuTGlzdCksXG5cdFx0XHRsYXN0OiBzZXJ2aWNlLmdldERldGFpbHNWaWV3U3RhdGUoY3JlYXRlU2Vzc2lvbignMTAwJykucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5MaXN0KSxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdDogdW5kZWZpbmVkLFxuXHRcdFx0bGFzdDogc3RhdGUsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3BlcnNpc3RzIENoYW5nZXMgdmlldyBzdGF0ZSBtdXRhdGlvbnMgaW1tZWRpYXRlbHknLCAoKSA9PiB7XG5cdFx0Y29uc3QgZHJhZnQgPSBjcmVhdGVTZXNzaW9uKCdkcmFmdCcpO1xuXHRcdGNvbnN0IGNvbW1pdHRlZCA9IGNyZWF0ZVNlc3Npb24oJ2NvbW1pdHRlZCcpO1xuXHRcdGNvbnN0IHN0b3JhZ2VTZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgZmlyc3RIYXJuZXNzID0gY3JlYXRlSGFybmVzcyhkcmFmdCwgc3RvcmFnZVNlcnZpY2UpO1xuXHRcdGNvbnN0IGRldGFpbHNWaWV3U3RhdGUgPSB7XG5cdFx0XHRmb2N1czogWydmaWxlOi8vL3JlcG8vYS50cyddLFxuXHRcdFx0c2VsZWN0aW9uOiBbJ2ZpbGU6Ly8vcmVwby9hLnRzJ10sXG5cdFx0XHRleHBhbmRlZDogeyAnZmlsZTovLy9yZXBvL3NyYyc6IDAgYXMgY29uc3QgfSxcblx0XHRcdHNjcm9sbFRvcDogNjQsXG5cdFx0fTtcblxuXHRcdGZpcnN0SGFybmVzcy5zZXJ2aWNlLnNldERldGFpbHNWaWV3U3RhdGUoZHJhZnQucmVzb3VyY2UsIENoYW5nZXNWaWV3TW9kZS5UcmVlLCBkZXRhaWxzVmlld1N0YXRlKTtcblx0XHRmaXJzdEhhcm5lc3Mub25EaWRSZXBsYWNlU2Vzc2lvbi5maXJlKHsgZnJvbTogZHJhZnQsIHRvOiBjb21taXR0ZWQgfSk7XG5cdFx0Zmlyc3RIYXJuZXNzLnNlcnZpY2UuZGlzcG9zZSgpO1xuXG5cdFx0Y29uc3QgcmVzdG9yZWRTZXJ2aWNlID0gY3JlYXRlSGFybmVzcyhjb21taXR0ZWQsIHN0b3JhZ2VTZXJ2aWNlKS5zZXJ2aWNlO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZGV0YWlsc1ZpZXdTdGF0ZTogcmVzdG9yZWRTZXJ2aWNlLmdldERldGFpbHNWaWV3U3RhdGUoY29tbWl0dGVkLnJlc291cmNlLCBDaGFuZ2VzVmlld01vZGUuVHJlZSksXG5cdFx0XHRkcmFmdERldGFpbHNWaWV3U3RhdGU6IHJlc3RvcmVkU2VydmljZS5nZXREZXRhaWxzVmlld1N0YXRlKGRyYWZ0LnJlc291cmNlLCBDaGFuZ2VzVmlld01vZGUuVHJlZSksXG5cdFx0fSwge1xuXHRcdFx0ZGV0YWlsc1ZpZXdTdGF0ZSxcblx0XHRcdGRyYWZ0RGV0YWlsc1ZpZXdTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzY29wZXMgYSB0cmFuc2llbnQgY2hhbmdlc2V0IHRvIGl0cyBzZXNzaW9uIGFuZCBjbGVhcnMgaXQgb24gcHJvdmlkZXIgc2VsZWN0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IGJyYW5jaENoYW5nZXNldCA9IGNyZWF0ZUNoYW5nZXNldChbXSk7XG5cdFx0Y29uc3QgdHJhbnNpZW50Q2hhbmdlc2V0ID0gY3JlYXRlVHJhbnNpZW50Q2hhbmdlc2V0KCk7XG5cdFx0Y29uc3Qgc2Vzc2lvbkEgPSBjcmVhdGVTZXNzaW9uKCdhJywgeyBjaGFuZ2VzZXRzOiBbYnJhbmNoQ2hhbmdlc2V0XSB9KTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IGNyZWF0ZVNlc3Npb24oJ2InLCB7IGNoYW5nZXNldHM6IFticmFuY2hDaGFuZ2VzZXRdIH0pO1xuXHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbiwgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyhzZXNzaW9uQSk7XG5cblx0XHRzZXJ2aWNlLnNob3dDaGFuZ2VzZXQodHJhbnNpZW50Q2hhbmdlc2V0KTtcblx0XHRjb25zdCB0cmFuc2llbnRTZWxlY3Rpb24gPSB7XG5cdFx0XHRjaGFuZ2VzZXRzOiBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRzT2JzLmdldCgpPy5tYXAoY2hhbmdlc2V0ID0+IGNoYW5nZXNldC5pZCksXG5cdFx0XHRzZWxlY3RlZDogc2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T2JzLmdldCgpPy5pZCxcblx0XHR9O1xuXHRcdHNlcnZpY2Uuc2V0Q2hhbmdlc2V0SWQoYnJhbmNoQ2hhbmdlc2V0LmlkKTtcblx0XHRjb25zdCBwcm92aWRlclNlbGVjdGlvbiA9IHtcblx0XHRcdGNoYW5nZXNldHM6IHNlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldHNPYnMuZ2V0KCk/Lm1hcChjaGFuZ2VzZXQgPT4gY2hhbmdlc2V0LmlkKSxcblx0XHRcdHNlbGVjdGVkOiBzZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPYnMuZ2V0KCk/LmlkLFxuXHRcdH07XG5cdFx0c2VydmljZS5zaG93Q2hhbmdlc2V0KHRyYW5zaWVudENoYW5nZXNldCk7XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQoc2Vzc2lvbkIsIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3QgYWZ0ZXJTZXNzaW9uU3dpdGNoID0ge1xuXHRcdFx0Y2hhbmdlc2V0czogc2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0c09icy5nZXQoKT8ubWFwKGNoYW5nZXNldCA9PiBjaGFuZ2VzZXQuaWQpLFxuXHRcdFx0c2VsZWN0ZWQ6IHNlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9icy5nZXQoKT8uaWQsXG5cdFx0fTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyB0cmFuc2llbnRTZWxlY3Rpb24sIHByb3ZpZGVyU2VsZWN0aW9uLCBhZnRlclNlc3Npb25Td2l0Y2ggfSwge1xuXHRcdFx0dHJhbnNpZW50U2VsZWN0aW9uOiB7XG5cdFx0XHRcdGNoYW5nZXNldHM6IFsnYnJhbmNoJywgJ3R1cm46cmVxdWVzdCddLFxuXHRcdFx0XHRzZWxlY3RlZDogJ3R1cm46cmVxdWVzdCcsXG5cdFx0XHR9LFxuXHRcdFx0cHJvdmlkZXJTZWxlY3Rpb246IHtcblx0XHRcdFx0Y2hhbmdlc2V0czogWydicmFuY2gnXSxcblx0XHRcdFx0c2VsZWN0ZWQ6ICdicmFuY2gnLFxuXHRcdFx0fSxcblx0XHRcdGFmdGVyU2Vzc2lvblN3aXRjaDoge1xuXHRcdFx0XHRjaGFuZ2VzZXRzOiBbJ2JyYW5jaCddLFxuXHRcdFx0XHRzZWxlY3RlZDogJ2JyYW5jaCcsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdoaWRlcyB0aGUgQWdlbnQgSG9zdCBtZXJnZSBvcGVyYXRpb24gd2hlbiB0aGUgYmFzZSBicmFuY2ggaXMgcHJvdGVjdGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9wZXJhdGlvbnM6IHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uW10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAnbWVyZ2UnLFxuXHRcdFx0XHRsYWJlbDogJ01lcmdlIENoYW5nZXMnLFxuXHRcdFx0XHRzY29wZXM6IFtTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUuQ2hhbmdlc2V0XSxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uU3RhdHVzLklkbGUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ2NyZWF0ZS1wcicsXG5cdFx0XHRcdGxhYmVsOiAnQ3JlYXRlIFBSJyxcblx0XHRcdFx0c2NvcGVzOiBbU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblNjb3BlLkNoYW5nZXNldF0sXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvblN0YXR1cy5JZGxlLFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdGNvbnN0IGNoYW5nZXNldCA9IGNyZWF0ZUNoYW5nZXNldChvcGVyYXRpb25zKTtcblx0XHRjb25zdCB1bnByb3RlY3RlZCA9IGNyZWF0ZVNlc3Npb24oJ3VucHJvdGVjdGVkJywgeyBjaGFuZ2VzZXRzOiBbY2hhbmdlc2V0XSwgYmFzZUJyYW5jaFByb3RlY3RlZDogZmFsc2UgfSk7XG5cdFx0Y29uc3QgcHJvdGVjdGVkU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3Byb3RlY3RlZCcsIHsgY2hhbmdlc2V0czogW2NoYW5nZXNldF0sIGJhc2VCcmFuY2hQcm90ZWN0ZWQ6IHRydWUgfSk7XG5cdFx0Y29uc3QgdW5rbm93biA9IGNyZWF0ZVNlc3Npb24oJ3Vua25vd24nLCB7IGNoYW5nZXNldHM6IFtjaGFuZ2VzZXRdIH0pO1xuXHRcdGNvbnN0IHsgYWN0aXZlU2Vzc2lvbiwgc2VydmljZSB9ID0gY3JlYXRlSGFybmVzcyh1bnByb3RlY3RlZCk7XG5cblx0XHRjb25zdCB2aXNpYmxlT3BlcmF0aW9ucyA9IFtzZXJ2aWNlLmFjdGl2ZVNlc3Npb25DaGFuZ2VzZXRPcGVyYXRpb25zT2JzLmdldCgpLm1hcChvcGVyYXRpb24gPT4gb3BlcmF0aW9uLmlkKV07XG5cdFx0YWN0aXZlU2Vzc2lvbi5zZXQocHJvdGVjdGVkU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHR2aXNpYmxlT3BlcmF0aW9ucy5wdXNoKHNlcnZpY2UuYWN0aXZlU2Vzc2lvbkNoYW5nZXNldE9wZXJhdGlvbnNPYnMuZ2V0KCkubWFwKG9wZXJhdGlvbiA9PiBvcGVyYXRpb24uaWQpKTtcblx0XHRhY3RpdmVTZXNzaW9uLnNldCh1bmtub3duLCB1bmRlZmluZWQpO1xuXHRcdHZpc2libGVPcGVyYXRpb25zLnB1c2goc2VydmljZS5hY3RpdmVTZXNzaW9uQ2hhbmdlc2V0T3BlcmF0aW9uc09icy5nZXQoKS5tYXAob3BlcmF0aW9uID0+IG9wZXJhdGlvbi5pZCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh2aXNpYmxlT3BlcmF0aW9ucywgW1xuXHRcdFx0WydtZXJnZScsICdjcmVhdGUtcHInXSxcblx0XHRcdFsnY3JlYXRlLXByJ10sXG5cdFx0XHRbJ21lcmdlJywgJ2NyZWF0ZS1wciddLFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsU0FBUyxhQUFhO0FBQy9CLFNB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bUJBQW1CO0FBQUEsUUFDbEIsWUFBWSxDQUFDLFFBQVE7QUFBQSxRQUNyQixVQUFVO0FBQUEsTUFDWDtBQUFBLE1BQ0Esb0JBQW9CO0FBQUEsUUFDbkIsWUFBWSxDQUFDLFFBQVE7QUFBQSxRQUNyQixVQUFVO0FBQUEsTUFDWDtBQUFBLElBQ0QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMEVBQTBFLE1BQU07QUFDcEYsVUFBTSxhQUFvRDtBQUFBLE1BQ3pEO0FBQUEsUUFDQyxJQUFJO0FBQUEsUUFDSixPQUFPO0FBQUEsUUFDUCxRQUFRLENBQUMsK0JBQStCLFNBQVM7QUFBQSxRQUNqRCxRQUFRLGdDQUFnQztBQUFBLE1BQ3pDO0FBQUEsTUFDQTtBQUFBLFFBQ0MsSUFBSTtBQUFBLFFBQ0osT0FBTztBQUFBLFFBQ1AsUUFBUSxDQUFDLCtCQUErQixTQUFTO0FBQUEsUUFDakQsUUFBUSxnQ0FBZ0M7QUFBQSxNQUN6QztBQUFBLElBQ0Q7QUFDQSxVQUFNLFlBQVksZ0JBQWdCLFVBQVU7QUFDNUMsVUFBTSxjQUFjLGNBQWMsZUFBZSxFQUFFLFlBQVksQ0FBQyxTQUFTLEdBQUcscUJBQXFCLE1BQU0sQ0FBQztBQUN4RyxVQUFNLG1CQUFtQixjQUFjLGFBQWEsRUFBRSxZQUFZLENBQUMsU0FBUyxHQUFHLHFCQUFxQixLQUFLLENBQUM7QUFDMUcsVUFBTSxVQUFVLGNBQWMsV0FBVyxFQUFFLFlBQVksQ0FBQyxTQUFTLEVBQUUsQ0FBQztBQUNwRSxVQUFNLEVBQUUsZUFBZSxRQUFRLElBQUksY0FBYyxXQUFXO0FBRTVELFVBQU0sb0JBQW9CLENBQUMsUUFBUSxvQ0FBb0MsSUFBSSxFQUFFLElBQUksZUFBYSxVQUFVLEVBQUUsQ0FBQztBQUMzRyxrQkFBYyxJQUFJLGtCQUFrQixNQUFTO0FBQzdDLHNCQUFrQixLQUFLLFFBQVEsb0NBQW9DLElBQUksRUFBRSxJQUFJLGVBQWEsVUFBVSxFQUFFLENBQUM7QUFDdkcsa0JBQWMsSUFBSSxTQUFTLE1BQVM7QUFDcEMsc0JBQWtCLEtBQUssUUFBUSxvQ0FBb0MsSUFBSSxFQUFFLElBQUksZUFBYSxVQUFVLEVBQUUsQ0FBQztBQUV2RyxXQUFPLGdCQUFnQixtQkFBbUI7QUFBQSxNQUN6QyxDQUFDLFNBQVMsV0FBVztBQUFBLE1BQ3JCLENBQUMsV0FBVztBQUFBLE1BQ1osQ0FBQyxTQUFTLFdBQVc7QUFBQSxJQUN0QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
