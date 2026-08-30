import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { Emitter } from "../../../../../base/common/event.js";
import { DisposableStore, ImmortalReference, toDisposable } from "../../../../../base/common/lifecycle.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { NullLogService } from "../../../../../platform/log/common/log.js";
import { GitHubPullRequestState } from "../../common/types.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { GitHubPullRequestPollingContribution } from "../../browser/github.contribution.js";
import { GitHubReferenceList } from "../../browser/githubReferenceList.js";
import { ChatInteractivity, SessionStatus } from "../../../../services/sessions/common/session.js";
suite("GitHubReferenceList", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("updates rows in place so focus is preserved", () => {
    const list = new GitHubReferenceList([{
      number: 12345,
      title: void 0,
      icon: Codicon.gitPullRequest,
      ariaLabel: "Pull Request #12345"
    }, {
      number: 1,
      title: "Short number",
      icon: Codicon.gitPullRequest,
      ariaLabel: "Pull Request #1: Short number"
    }], () => {
    });
    document.body.appendChild(list.element);
    try {
      const button = list.element.querySelector("button");
      const initialNumberWidth = button.querySelector(".sessions-github-reference-list-entry-number").style.width;
      button.focus();
      list.update([{
        number: 1,
        title: "Updated title",
        icon: Codicon.gitPullRequestDraft,
        ariaLabel: "Draft Pull Request #1: Updated title"
      }]);
      assert.deepStrictEqual({
        sameButton: list.element.querySelector("button") === button,
        focused: document.activeElement === button,
        text: button.textContent,
        ariaLabel: button.getAttribute("aria-label"),
        iconClasses: [...button.querySelector(".sessions-github-reference-list-entry-icon").classList],
        initialNumberWidth,
        numberWidth: button.querySelector(".sessions-github-reference-list-entry-number").style.width
      }, {
        sameButton: true,
        focused: true,
        text: "#1Updated title",
        ariaLabel: "Draft Pull Request #1: Updated title",
        iconClasses: ["sessions-github-reference-list-entry-icon", "codicon", "codicon-git-pull-request-draft"],
        initialNumberWidth: "calc(5ch + 1em)",
        numberWidth: "calc(1ch + 1em)"
      });
    } finally {
      list.element.remove();
    }
  });
});
suite("GitHubPullRequestPollingContribution", () => {
  const store = new DisposableStore();
  const logService = new NullLogService();
  let sessionsManagementService;
  let sessionsService;
  let gitHubService;
  let activeSession;
  setup(() => {
    sessionsManagementService = new TestSessionsManagementService(store);
    activeSession = observableValue("test.activeSession", void 0);
    sessionsService = new class extends mock() {
      constructor() {
        super(...arguments);
        this.activeSession = activeSession;
      }
    }();
    gitHubService = new TestGitHubService();
  });
  teardown(() => store.clear());
  ensureNoDisposablesAreLeakedInTestSuite();
  test("starts polling existing and added pull request sessions", () => {
    const existingSession = sessionsManagementService.addSession("existing", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    const addedSession = sessionsManagementService.addSession("added", makeGitHubInfo(2));
    sessionsManagementService.fireSessionsChanged({ added: [addedSession] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 },
      "owner/repo/2": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
    assert.strictEqual(existingSession.isArchived.get(), false);
  });
  test("rebinds polling when a session is replaced under the same session id", () => {
    const provisionalSession = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    const committedSession = sessionsManagementService.addSession("session", makeGitHubInfo(2));
    sessionsManagementService.fireSessionsChanged({ changed: [committedSession] });
    sessionsManagementService.fireSessionsChanged({ removed: [provisionalSession] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 },
      "owner/repo/2": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
  });
  test("stops polling when a session is archived, then resumes when unarchived", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    sessionsManagementService.setArchived(session, true);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    sessionsManagementService.setArchived(session, false);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 }
    });
  });
  test("does not poll archived sessions until they are unarchived", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1), true);
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.snapshot(), {});
    sessionsManagementService.setArchived(session, false);
    sessionsManagementService.fireSessionsChanged({ changed: [session] });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
  });
  test("stops polling tracked pull requests when disposed", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    const contribution = store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    contribution.dispose();
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    assert.strictEqual(session.isArchived.get(), false);
  });
  test("polls CI checks and review threads once an open pull request resolves", () => {
    sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), {
      ci: { "owner/repo/1/sha1": { startPollingCalls: 1, refreshCalls: 1 } },
      reviewThreads: { "owner/repo/1": { startPollingCalls: 1, refreshCalls: 1 } }
    });
  });
  test("does not poll CI checks or review threads for draft pull requests", () => {
    sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: true, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.statusModelSnapshot(), { ci: {}, reviewThreads: {} });
  });
  test("starts polling once an asynchronously resolved PR number appears", () => {
    const session = sessionsManagementService.addSession("async", { owner: "owner", repo: "repo" });
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    assert.deepStrictEqual(gitHubService.snapshot(), {});
    sessionsManagementService.setGitHubInfo(session, makeGitHubInfo(1));
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
  });
  test("stops polling a merged pull request unless it is the active session", () => {
    const session = sessionsManagementService.addSession("session", makeGitHubInfo(1));
    store.add(new GitHubPullRequestPollingContribution(gitHubService, sessionsManagementService, sessionsService, logService));
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Open, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 0, disposeCalls: 0 }
    });
    gitHubService.setPullRequestDetails("owner", "repo", 1, { state: GitHubPullRequestState.Merged, isDraft: false, headSha: "sha1" });
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 1, stopPollingCalls: 1, disposeCalls: 0 }
    });
    activeSession.set(session, void 0);
    assert.deepStrictEqual(gitHubService.snapshot(), {
      "owner/repo/1": { startPollingCalls: 2, stopPollingCalls: 1, disposeCalls: 0 }
    });
  });
});
class TestSessionsManagementService extends mock() {
  constructor(disposables) {
    super();
    this._sessions = /* @__PURE__ */ new Map();
    this._onDidChangeSessions = disposables.add(new Emitter());
    this.onDidChangeSessions = this._onDidChangeSessions.event;
  }
  addSession(id, gitHubInfo, archived = false) {
    const session = new TestSession(id, gitHubInfo, archived);
    this._sessions.set(session.sessionId, session);
    return session;
  }
  removeSession(session) {
    this._sessions.delete(session.sessionId);
    this.fireSessionsChanged({ removed: [session] });
  }
  setArchived(session, archived) {
    session.isArchived.set(archived, void 0);
  }
  setGitHubInfo(session, gitHubInfo) {
    const workspace = session.workspace.get();
    const folder = workspace?.folders[0];
    if (folder) {
      folder.gitRepository.gitHubInfo.set(gitHubInfo, void 0);
    }
  }
  getSessions() {
    return [...this._sessions.values()];
  }
  fireSessionsChanged(event) {
    this._onDidChangeSessions.fire({
      added: event?.added ?? [],
      removed: event?.removed ?? [],
      changed: event?.changed ?? []
    });
  }
}
class TestSession {
  constructor(id, gitHubInfo, archived) {
    this.providerId = "test";
    this.sessionType = "test";
    this.icon = Codicon.comment;
    this.createdAt = /* @__PURE__ */ new Date(0);
    this.capabilities = constObservable({ supportsMultipleChats: false });
    this.sessionId = `test:${id}`;
    this.resource = URI.from({ scheme: "test", path: `/${id}` });
    const gitHubInfoObs = observableValue(`test.gitHubInfo.${id}`, gitHubInfo);
    const workspaceUri = URI.from({ scheme: "test", path: `/workspace/${id}` });
    this.title = observableValue(`test.title.${id}`, id);
    this.updatedAt = observableValue(`test.updatedAt.${id}`, /* @__PURE__ */ new Date(0));
    this.status = observableValue(`test.status.${id}`, SessionStatus.Completed);
    this.changesets = observableValue(`test.changesets.${id}`, []);
    this.changes = observableValue(`test.changes.${id}`, []);
    this.workspace = observableValue(`test.workspace.${id}`, {
      uri: workspaceUri,
      label: id,
      icon: Codicon.folder,
      folders: [{
        root: workspaceUri,
        workingDirectory: workspaceUri,
        name: id,
        description: void 0,
        gitRepository: { uri: workspaceUri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: gitHubInfoObs }
      }],
      requiresWorkspaceTrust: false,
      isVirtualWorkspace: false
    });
    this.modelId = observableValue(`test.modelId.${id}`, void 0);
    this.mode = observableValue(`test.mode.${id}`, void 0);
    this.loading = observableValue(`test.loading.${id}`, false);
    this.isArchived = observableValue(`test.isArchived.${id}`, archived);
    this.isRead = observableValue(`test.isRead.${id}`, true);
    this.description = observableValue(`test.description.${id}`, void 0);
    this.lastTurnEnd = observableValue(`test.lastTurnEnd.${id}`, void 0);
    const checkpoints = observableValue(`test.checkpoints.${id}`, void 0);
    const mainChat = {
      resource: this.resource,
      createdAt: this.createdAt,
      title: this.title,
      updatedAt: this.updatedAt,
      status: this.status,
      changes: this.changes,
      checkpoints,
      modelId: this.modelId,
      mode: this.mode,
      isArchived: this.isArchived,
      isRead: this.isRead,
      interactivity: constObservable(ChatInteractivity.Full),
      description: this.description,
      lastTurnEnd: this.lastTurnEnd
    };
    this.mainChat = constObservable(mainChat);
    this.chats = observableValue(`test.chats.${id}`, [mainChat]);
  }
}
class TestGitHubService extends mock() {
  constructor() {
    super(...arguments);
    this._models = /* @__PURE__ */ new Map();
    this._ciModels = /* @__PURE__ */ new Map();
    this._threadModels = /* @__PURE__ */ new Map();
    this.activeSessionPullRequestObs = observableValue("test.activePR", void 0);
    this.activeSessionPullRequestCIObs = observableValue("test.activePRCI", void 0);
    this.activeSessionPullRequestReviewThreadsObs = observableValue("test.activePRReviewThreads", void 0);
  }
  createPullRequestModelReference(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._models.get(key);
    if (!model) {
      model = new TestPullRequestModel();
      this._models.set(key, model);
    }
    return new ImmortalReference(model);
  }
  createPullRequestCIModelReference(owner, repo, prNumber, headSha) {
    const key = `${owner}/${repo}/${prNumber}/${headSha}`;
    let model = this._ciModels.get(key);
    if (!model) {
      model = new TestStatusModel();
      this._ciModels.set(key, model);
    }
    return new ImmortalReference(model);
  }
  createPullRequestReviewThreadsModelReference(owner, repo, prNumber) {
    const key = `${owner}/${repo}/${prNumber}`;
    let model = this._threadModels.get(key);
    if (!model) {
      model = new TestStatusModel();
      this._threadModels.set(key, model);
    }
    return new ImmortalReference(model);
  }
  setPullRequestDetails(owner, repo, prNumber, details) {
    const model = this._models.get(`${owner}/${repo}/${prNumber}`);
    model?.setPullRequest(makePullRequest(details));
  }
  snapshot() {
    const entries = [...this._models.entries()].map(([key, model]) => [key, {
      startPollingCalls: model.startPollingCalls,
      stopPollingCalls: model.stopPollingCalls,
      disposeCalls: model.disposeCalls
    }]);
    return Object.fromEntries(entries);
  }
  statusModelSnapshot() {
    const toRecord = (models) => Object.fromEntries(
      [...models.entries()].map(([key, model]) => [key, { startPollingCalls: model.startPollingCalls, refreshCalls: model.refreshCalls }])
    );
    return { ci: toRecord(this._ciModels), reviewThreads: toRecord(this._threadModels) };
  }
}
class TestPullRequestModel {
  constructor() {
    this.startPollingCalls = 0;
    this.stopPollingCalls = 0;
    this.disposeCalls = 0;
    this._pullRequest = observableValue("test.pullRequest", void 0);
    this.pullRequest = this._pullRequest;
  }
  setPullRequest(pullRequest) {
    this._pullRequest.set(pullRequest, void 0);
  }
  startPolling() {
    this.startPollingCalls++;
    return toDisposable(() => this.stopPollingCalls++);
  }
  refresh() {
    return Promise.resolve();
  }
  dispose() {
    this.disposeCalls++;
  }
}
class TestStatusModel {
  constructor() {
    this.startPollingCalls = 0;
    this.refreshCalls = 0;
  }
  refresh() {
    this.refreshCalls++;
    return Promise.resolve();
  }
  startPolling() {
    this.startPollingCalls++;
    return toDisposable(() => {
    });
  }
  dispose() {
  }
}
function makePullRequest(overrides) {
  return {
    number: 1,
    title: "",
    body: "",
    state: overrides.state,
    author: { login: "", avatarUrl: "" },
    headRef: "",
    headSha: overrides.headSha,
    baseRef: "",
    isDraft: overrides.isDraft,
    createdAt: "",
    updatedAt: "",
    mergedAt: void 0,
    mergeable: void 0,
    mergeableState: ""
  };
}
function makeGitHubInfo(prNumber) {
  return {
    owner: "owner",
    repo: "repo",
    pullRequest: {
      number: prNumber,
      uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`)
    }
  };
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcZ2l0aHViXFx0ZXN0XFxicm93c2VyXFxnaXRodWJDb250cmlidXRpb24udGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyLCBFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2V2ZW50LmpzJztcbmltcG9ydCB7IElNYXJrZG93blN0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2h0bWxDb250ZW50LmpzJztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSwgSURpc3Bvc2FibGUsIEltbW9ydGFsUmVmZXJlbmNlLCBJUmVmZXJlbmNlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgY29uc3RPYnNlcnZhYmxlLCBJT2JzZXJ2YWJsZSwgSVNldHRhYmxlT2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0TW9kZWwgfSBmcm9tICcuLi8uLi9icm93c2VyL21vZGVscy9naXRodWJQdWxsUmVxdWVzdE1vZGVsLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0Q0lNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0Q0lNb2RlbC5qcyc7XG5pbXBvcnQgeyBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGUsIElHaXRIdWJQdWxsUmVxdWVzdCB9IGZyb20gJy4uLy4uL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBtb2NrIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi9tb2NrLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbiB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvZ2l0aHViLmNvbnRyaWJ1dGlvbi5qcyc7XG5pbXBvcnQgeyBHaXRIdWJSZWZlcmVuY2VMaXN0LCBJR2l0SHViUmVmZXJlbmNlTGlzdEVudHJ5IH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9naXRodWJSZWZlcmVuY2VMaXN0LmpzJztcbmltcG9ydCB7IElHaXRIdWJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vYnJvd3Nlci9naXRodWJTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENoYXRJbnRlcmFjdGl2aXR5LCBJQ2hhdCwgSUdpdEh1YkluZm8sIElTZXNzaW9uLCBJU2Vzc2lvbkNhcGFiaWxpdGllcywgSVNlc3Npb25DaGFuZ2VzZXQsIElDaGF0Q2hlY2twb2ludHMsIElTZXNzaW9uRmlsZUNoYW5nZSwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQWN0aXZlU2Vzc2lvbiwgSVNlc3Npb25zQ2hhbmdlRXZlbnQsIElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvY29tbW9uL3Nlc3Npb25zTWFuYWdlbWVudC5qcyc7XG5pbXBvcnQgeyBJU2Vzc2lvbnNTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvc2Vzc2lvbnMvYnJvd3Nlci9zZXNzaW9uc1NlcnZpY2UuanMnO1xuXG5zdWl0ZSgnR2l0SHViUmVmZXJlbmNlTGlzdCcsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCd1cGRhdGVzIHJvd3MgaW4gcGxhY2Ugc28gZm9jdXMgaXMgcHJlc2VydmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxpc3QgPSBuZXcgR2l0SHViUmVmZXJlbmNlTGlzdDxJR2l0SHViUmVmZXJlbmNlTGlzdEVudHJ5Pihbe1xuXHRcdFx0bnVtYmVyOiAxMjM0NSxcblx0XHRcdHRpdGxlOiB1bmRlZmluZWQsXG5cdFx0XHRpY29uOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0YXJpYUxhYmVsOiAnUHVsbCBSZXF1ZXN0ICMxMjM0NScsXG5cdFx0fSwge1xuXHRcdFx0bnVtYmVyOiAxLFxuXHRcdFx0dGl0bGU6ICdTaG9ydCBudW1iZXInLFxuXHRcdFx0aWNvbjogQ29kaWNvbi5naXRQdWxsUmVxdWVzdCxcblx0XHRcdGFyaWFMYWJlbDogJ1B1bGwgUmVxdWVzdCAjMTogU2hvcnQgbnVtYmVyJyxcblx0XHR9XSwgKCkgPT4geyB9KTtcblx0XHRkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGxpc3QuZWxlbWVudCk7XG5cblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgYnV0dG9uID0gbGlzdC5lbGVtZW50LnF1ZXJ5U2VsZWN0b3IoJ2J1dHRvbicpITtcblx0XHRcdGNvbnN0IGluaXRpYWxOdW1iZXJXaWR0aCA9IGJ1dHRvbi5xdWVyeVNlbGVjdG9yPEhUTUxFbGVtZW50PignLnNlc3Npb25zLWdpdGh1Yi1yZWZlcmVuY2UtbGlzdC1lbnRyeS1udW1iZXInKSEuc3R5bGUud2lkdGg7XG5cdFx0XHRidXR0b24uZm9jdXMoKTtcblxuXHRcdFx0bGlzdC51cGRhdGUoW3tcblx0XHRcdFx0bnVtYmVyOiAxLFxuXHRcdFx0XHR0aXRsZTogJ1VwZGF0ZWQgdGl0bGUnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0RHJhZnQsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0RyYWZ0IFB1bGwgUmVxdWVzdCAjMTogVXBkYXRlZCB0aXRsZScsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzYW1lQnV0dG9uOiBsaXN0LmVsZW1lbnQucXVlcnlTZWxlY3RvcignYnV0dG9uJykgPT09IGJ1dHRvbixcblx0XHRcdFx0Zm9jdXNlZDogZG9jdW1lbnQuYWN0aXZlRWxlbWVudCA9PT0gYnV0dG9uLFxuXHRcdFx0XHR0ZXh0OiBidXR0b24udGV4dENvbnRlbnQsXG5cdFx0XHRcdGFyaWFMYWJlbDogYnV0dG9uLmdldEF0dHJpYnV0ZSgnYXJpYS1sYWJlbCcpLFxuXHRcdFx0XHRpY29uQ2xhc3NlczogWy4uLmJ1dHRvbi5xdWVyeVNlbGVjdG9yKCcuc2Vzc2lvbnMtZ2l0aHViLXJlZmVyZW5jZS1saXN0LWVudHJ5LWljb24nKSEuY2xhc3NMaXN0XSxcblx0XHRcdFx0aW5pdGlhbE51bWJlcldpZHRoLFxuXHRcdFx0XHRudW1iZXJXaWR0aDogYnV0dG9uLnF1ZXJ5U2VsZWN0b3I8SFRNTEVsZW1lbnQ+KCcuc2Vzc2lvbnMtZ2l0aHViLXJlZmVyZW5jZS1saXN0LWVudHJ5LW51bWJlcicpIS5zdHlsZS53aWR0aCxcblx0XHRcdH0sIHtcblx0XHRcdFx0c2FtZUJ1dHRvbjogdHJ1ZSxcblx0XHRcdFx0Zm9jdXNlZDogdHJ1ZSxcblx0XHRcdFx0dGV4dDogJyMxVXBkYXRlZCB0aXRsZScsXG5cdFx0XHRcdGFyaWFMYWJlbDogJ0RyYWZ0IFB1bGwgUmVxdWVzdCAjMTogVXBkYXRlZCB0aXRsZScsXG5cdFx0XHRcdGljb25DbGFzc2VzOiBbJ3Nlc3Npb25zLWdpdGh1Yi1yZWZlcmVuY2UtbGlzdC1lbnRyeS1pY29uJywgJ2NvZGljb24nLCAnY29kaWNvbi1naXQtcHVsbC1yZXF1ZXN0LWRyYWZ0J10sXG5cdFx0XHRcdGluaXRpYWxOdW1iZXJXaWR0aDogJ2NhbGMoNWNoICsgMWVtKScsXG5cdFx0XHRcdG51bWJlcldpZHRoOiAnY2FsYygxY2ggKyAxZW0pJyxcblx0XHRcdH0pO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRsaXN0LmVsZW1lbnQucmVtb3ZlKCk7XG5cdFx0fVxuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdGxldCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlOiBUZXN0U2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTtcblx0bGV0IHNlc3Npb25zU2VydmljZTogSVNlc3Npb25zU2VydmljZTtcblx0bGV0IGdpdEh1YlNlcnZpY2U6IFRlc3RHaXRIdWJTZXJ2aWNlO1xuXHRsZXQgYWN0aXZlU2Vzc2lvbjogSVNldHRhYmxlT2JzZXJ2YWJsZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD47XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgPSBuZXcgVGVzdFNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2Uoc3RvcmUpO1xuXHRcdGFjdGl2ZVNlc3Npb24gPSBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+KCd0ZXN0LmFjdGl2ZVNlc3Npb24nLCB1bmRlZmluZWQpO1xuXHRcdHNlc3Npb25zU2VydmljZSA9IG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25zU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSByZWFkb25seSBhY3RpdmVTZXNzaW9uID0gYWN0aXZlU2Vzc2lvbjtcblx0XHR9O1xuXHRcdGdpdEh1YlNlcnZpY2UgPSBuZXcgVGVzdEdpdEh1YlNlcnZpY2UoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4gc3RvcmUuY2xlYXIoKSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnc3RhcnRzIHBvbGxpbmcgZXhpc3RpbmcgYW5kIGFkZGVkIHB1bGwgcmVxdWVzdCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZ1Nlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ2V4aXN0aW5nJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXG5cdFx0c3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRjb25zdCBhZGRlZFNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ2FkZGVkJywgbWFrZUdpdEh1YkluZm8oMikpO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZmlyZVNlc3Npb25zQ2hhbmdlZCh7IGFkZGVkOiBbYWRkZWRTZXNzaW9uXSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7XG5cdFx0XHQnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgc3RvcFBvbGxpbmdDYWxsczogMCwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0XHQnb3duZXIvcmVwby8yJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgc3RvcFBvbGxpbmdDYWxsczogMCwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4aXN0aW5nU2Vzc2lvbi5pc0FyY2hpdmVkLmdldCgpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlYmluZHMgcG9sbGluZyB3aGVuIGEgc2Vzc2lvbiBpcyByZXBsYWNlZCB1bmRlciB0aGUgc2FtZSBzZXNzaW9uIGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByb3Zpc2lvbmFsU2Vzc2lvbiA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYWRkU2Vzc2lvbignc2Vzc2lvbicsIG1ha2VHaXRIdWJJbmZvKDEpKTtcblx0XHRzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbihnaXRIdWJTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdGNvbnN0IGNvbW1pdHRlZFNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ3Nlc3Npb24nLCBtYWtlR2l0SHViSW5mbygyKSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5maXJlU2Vzc2lvbnNDaGFuZ2VkKHsgY2hhbmdlZDogW2NvbW1pdHRlZFNlc3Npb25dIH0pO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuZmlyZVNlc3Npb25zQ2hhbmdlZCh7IHJlbW92ZWQ6IFtwcm92aXNpb25hbFNlc3Npb25dIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAxLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHRcdCdvd25lci9yZXBvLzInOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAwLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgcG9sbGluZyB3aGVuIGEgc2Vzc2lvbiBpcyBhcmNoaXZlZCwgdGhlbiByZXN1bWVzIHdoZW4gdW5hcmNoaXZlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdzZXNzaW9uJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXRBcmNoaXZlZChzZXNzaW9uLCB0cnVlKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyBjaGFuZ2VkOiBbc2Vzc2lvbl0gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHN0b3BQb2xsaW5nQ2FsbHM6IDEsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXRBcmNoaXZlZChzZXNzaW9uLCBmYWxzZSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5maXJlU2Vzc2lvbnNDaGFuZ2VkKHsgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAyLCBzdG9wUG9sbGluZ0NhbGxzOiAxLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcG9sbCBhcmNoaXZlZCBzZXNzaW9ucyB1bnRpbCB0aGV5IGFyZSB1bmFyY2hpdmVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ3Nlc3Npb24nLCBtYWtlR2l0SHViSW5mbygxKSwgdHJ1ZSk7XG5cdFx0c3RvcmUuYWRkKG5ldyBHaXRIdWJQdWxsUmVxdWVzdFBvbGxpbmdDb250cmlidXRpb24oZ2l0SHViU2VydmljZSwgc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgc2Vzc2lvbnNTZXJ2aWNlLCBsb2dTZXJ2aWNlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge30pO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXRBcmNoaXZlZChzZXNzaW9uLCBmYWxzZSk7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5maXJlU2Vzc2lvbnNDaGFuZ2VkKHsgY2hhbmdlZDogW3Nlc3Npb25dIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAwLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3RvcHMgcG9sbGluZyB0cmFja2VkIHB1bGwgcmVxdWVzdHMgd2hlbiBkaXNwb3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdzZXNzaW9uJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXHRcdGNvbnN0IGNvbnRyaWJ1dGlvbiA9IHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Y29udHJpYnV0aW9uLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7XG5cdFx0XHQnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgc3RvcFBvbGxpbmdDYWxsczogMSwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlc3Npb24uaXNBcmNoaXZlZC5nZXQoKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdwb2xscyBDSSBjaGVja3MgYW5kIHJldmlldyB0aHJlYWRzIG9uY2UgYW4gb3BlbiBwdWxsIHJlcXVlc3QgcmVzb2x2ZXMnLCAoKSA9PiB7XG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hZGRTZXNzaW9uKCdzZXNzaW9uJywgbWFrZUdpdEh1YkluZm8oMSkpO1xuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gVW50aWwgdGhlIFBSIGRldGFpbHMgbG9hZCwgb25seSB0aGUgUFIgbW9kZWwgaXMgcG9sbGVkLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zdGF0dXNNb2RlbFNuYXBzaG90KCksIHsgY2k6IHt9LCByZXZpZXdUaHJlYWRzOiB7fSB9KTtcblxuXHRcdGdpdEh1YlNlcnZpY2Uuc2V0UHVsbFJlcXVlc3REZXRhaWxzKCdvd25lcicsICdyZXBvJywgMSwgeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiBmYWxzZSwgaGVhZFNoYTogJ3NoYTEnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnN0YXR1c01vZGVsU25hcHNob3QoKSwge1xuXHRcdFx0Y2k6IHsgJ293bmVyL3JlcG8vMS9zaGExJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgcmVmcmVzaENhbGxzOiAxIH0gfSxcblx0XHRcdHJldmlld1RocmVhZHM6IHsgJ293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDEsIHJlZnJlc2hDYWxsczogMSB9IH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RvZXMgbm90IHBvbGwgQ0kgY2hlY2tzIG9yIHJldmlldyB0aHJlYWRzIGZvciBkcmFmdCBwdWxsIHJlcXVlc3RzJywgKCkgPT4ge1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYWRkU2Vzc2lvbignc2Vzc2lvbicsIG1ha2VHaXRIdWJJbmZvKDEpKTtcblx0XHRzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbihnaXRIdWJTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdGdpdEh1YlNlcnZpY2Uuc2V0UHVsbFJlcXVlc3REZXRhaWxzKCdvd25lcicsICdyZXBvJywgMSwgeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5PcGVuLCBpc0RyYWZ0OiB0cnVlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc3RhdHVzTW9kZWxTbmFwc2hvdCgpLCB7IGNpOiB7fSwgcmV2aWV3VGhyZWFkczoge30gfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0YXJ0cyBwb2xsaW5nIG9uY2UgYW4gYXN5bmNocm9ub3VzbHkgcmVzb2x2ZWQgUFIgbnVtYmVyIGFwcGVhcnMnLCAoKSA9PiB7XG5cdFx0Ly8gTWlycm9ycyB0aGUgYWdlbnQtaG9zdCBwcm92aWRlciwgd2hvc2UgYGdpdEh1YkluZm9gIGluaXRpYWxseSBoYXMgbm8gUFJcblx0XHQvLyBudW1iZXIgKGl0IGlzIHJlc29sdmVkIGFzeW5jaHJvbm91c2x5IHZpYSBmaW5kUHVsbFJlcXVlc3ROdW1iZXJCeUhlYWRCcmFuY2gpLlxuXHRcdGNvbnN0IHNlc3Npb24gPSBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLmFkZFNlc3Npb24oJ2FzeW5jJywgeyBvd25lcjogJ293bmVyJywgcmVwbzogJ3JlcG8nIH0pO1xuXHRcdHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uKGdpdEh1YlNlcnZpY2UsIHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UsIHNlc3Npb25zU2VydmljZSwgbG9nU2VydmljZSkpO1xuXG5cdFx0Ly8gTm8gUFIgbnVtYmVyIHlldCBcdTIxOTIgbm90aGluZyBpcyBwb2xsZWQuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHt9KTtcblxuXHRcdC8vIFRoZSBQUiBudW1iZXIgcmVzb2x2ZXMgbGF0ZXIuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5zZXRHaXRIdWJJbmZvKHNlc3Npb24sIG1ha2VHaXRIdWJJbmZvKDEpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZ2l0SHViU2VydmljZS5zbmFwc2hvdCgpLCB7XG5cdFx0XHQnb3duZXIvcmVwby8xJzogeyBzdGFydFBvbGxpbmdDYWxsczogMSwgc3RvcFBvbGxpbmdDYWxsczogMCwgZGlzcG9zZUNhbGxzOiAwIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0b3BzIHBvbGxpbmcgYSBtZXJnZWQgcHVsbCByZXF1ZXN0IHVubGVzcyBpdCBpcyB0aGUgYWN0aXZlIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UuYWRkU2Vzc2lvbignc2Vzc2lvbicsIG1ha2VHaXRIdWJJbmZvKDEpKTtcblx0XHRzdG9yZS5hZGQobmV3IEdpdEh1YlB1bGxSZXF1ZXN0UG9sbGluZ0NvbnRyaWJ1dGlvbihnaXRIdWJTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc1NlcnZpY2UsIGxvZ1NlcnZpY2UpKTtcblxuXHRcdC8vIE9wZW4gUFIgXHUyMTkyIHBvbGxpbmcuXG5cdFx0Z2l0SHViU2VydmljZS5zZXRQdWxsUmVxdWVzdERldGFpbHMoJ293bmVyJywgJ3JlcG8nLCAxLCB7IHN0YXRlOiBHaXRIdWJQdWxsUmVxdWVzdFN0YXRlLk9wZW4sIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAwLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblxuXHRcdC8vIE1lcmdlcyB3aGlsZSBub3QgdGhlIGFjdGl2ZSBzZXNzaW9uIFx1MjE5MiB0aGUgcmVwZWF0aW5nIHBvbGwgbG9vcCBzdG9wcyAodGhlXG5cdFx0Ly8gc2luZ2xlIGluaXRpYWwgZmV0Y2ggYWxyZWFkeSBwcm9kdWNlZCB0aGUgbWVyZ2VkIGljb24pLlxuXHRcdGdpdEh1YlNlcnZpY2Uuc2V0UHVsbFJlcXVlc3REZXRhaWxzKCdvd25lcicsICdyZXBvJywgMSwgeyBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZS5NZXJnZWQsIGlzRHJhZnQ6IGZhbHNlLCBoZWFkU2hhOiAnc2hhMScgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChnaXRIdWJTZXJ2aWNlLnNuYXBzaG90KCksIHtcblx0XHRcdCdvd25lci9yZXBvLzEnOiB7IHN0YXJ0UG9sbGluZ0NhbGxzOiAxLCBzdG9wUG9sbGluZ0NhbGxzOiAxLCBkaXNwb3NlQ2FsbHM6IDAgfSxcblx0XHR9KTtcblxuXHRcdC8vIEJlY29tZXMgdGhlIGFjdGl2ZSBzZXNzaW9uIFx1MjE5MiBwb2xsaW5nIHJlc3VtZXMgZXZlbiB0aG91Z2ggaXQgaXMgbWVyZ2VkLlxuXHRcdGFjdGl2ZVNlc3Npb24uc2V0KHNlc3Npb24gYXMgdW5rbm93biBhcyBJQWN0aXZlU2Vzc2lvbiwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGdpdEh1YlNlcnZpY2Uuc25hcHNob3QoKSwge1xuXHRcdFx0J293bmVyL3JlcG8vMSc6IHsgc3RhcnRQb2xsaW5nQ2FsbHM6IDIsIHN0b3BQb2xsaW5nQ2FsbHM6IDEsIGRpc3Bvc2VDYWxsczogMCB9LFxuXHRcdH0pO1xuXHR9KTtcbn0pO1xuXG5jbGFzcyBUZXN0U2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSBleHRlbmRzIG1vY2s8SVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2U+KCkge1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2hhbmdlU2Vzc2lvbnM6IEVtaXR0ZXI8SVNlc3Npb25zQ2hhbmdlRXZlbnQ+O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9zZXNzaW9ucyA9IG5ldyBNYXA8c3RyaW5nLCBJU2Vzc2lvbj4oKTtcblxuXHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cblx0Y29uc3RydWN0b3IoZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZSkge1xuXHRcdHN1cGVyKCk7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKSk7XG5cdFx0dGhpcy5vbkRpZENoYW5nZVNlc3Npb25zID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucy5ldmVudDtcblx0fVxuXG5cdGFkZFNlc3Npb24oaWQ6IHN0cmluZywgZ2l0SHViSW5mbzogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQsIGFyY2hpdmVkID0gZmFsc2UpOiBJU2Vzc2lvbiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IG5ldyBUZXN0U2Vzc2lvbihpZCwgZ2l0SHViSW5mbywgYXJjaGl2ZWQpO1xuXHRcdHRoaXMuX3Nlc3Npb25zLnNldChzZXNzaW9uLnNlc3Npb25JZCwgc2Vzc2lvbik7XG5cdFx0cmV0dXJuIHNlc3Npb247XG5cdH1cblxuXHRyZW1vdmVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uKTogdm9pZCB7XG5cdFx0dGhpcy5fc2Vzc2lvbnMuZGVsZXRlKHNlc3Npb24uc2Vzc2lvbklkKTtcblx0XHR0aGlzLmZpcmVTZXNzaW9uc0NoYW5nZWQoeyByZW1vdmVkOiBbc2Vzc2lvbl0gfSk7XG5cdH1cblxuXHRzZXRBcmNoaXZlZChzZXNzaW9uOiBJU2Vzc2lvbiwgYXJjaGl2ZWQ6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHQoc2Vzc2lvbi5pc0FyY2hpdmVkIGFzIFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj4pLnNldChhcmNoaXZlZCwgdW5kZWZpbmVkKTtcblx0fVxuXG5cdHNldEdpdEh1YkluZm8oc2Vzc2lvbjogSVNlc3Npb24sIGdpdEh1YkluZm86IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0Y29uc3QgZm9sZGVyID0gd29ya3NwYWNlPy5mb2xkZXJzWzBdO1xuXHRcdGlmIChmb2xkZXIpIHtcblx0XHRcdChmb2xkZXIuZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbyBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+Pikuc2V0KGdpdEh1YkluZm8sIHVuZGVmaW5lZCk7XG5cdFx0fVxuXHR9XG5cblx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0cmV0dXJuIFsuLi50aGlzLl9zZXNzaW9ucy52YWx1ZXMoKV07XG5cdH1cblxuXHRmaXJlU2Vzc2lvbnNDaGFuZ2VkKGV2ZW50PzogUGFydGlhbDxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4pOiB2b2lkIHtcblx0XHR0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmZpcmUoe1xuXHRcdFx0YWRkZWQ6IGV2ZW50Py5hZGRlZCA/PyBbXSxcblx0XHRcdHJlbW92ZWQ6IGV2ZW50Py5yZW1vdmVkID8/IFtdLFxuXHRcdFx0Y2hhbmdlZDogZXZlbnQ/LmNoYW5nZWQgPz8gW10sXG5cdFx0fSk7XG5cdH1cbn1cblxuY2xhc3MgVGVzdFNlc3Npb24gaW1wbGVtZW50cyBJU2Vzc2lvbiB7XG5cblx0cmVhZG9ubHkgc2Vzc2lvbklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc291cmNlOiBVUkk7XG5cdHJlYWRvbmx5IHByb3ZpZGVySWQgPSAndGVzdCc7XG5cdHJlYWRvbmx5IHNlc3Npb25UeXBlID0gJ3Rlc3QnO1xuXHRyZWFkb25seSBpY29uID0gQ29kaWNvbi5jb21tZW50O1xuXHRyZWFkb25seSBjcmVhdGVkQXQgPSBuZXcgRGF0ZSgwKTtcblx0cmVhZG9ubHkgdGl0bGU6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+Pjtcblx0cmVhZG9ubHkgdXBkYXRlZEF0OiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8RGF0ZT4+O1xuXHRyZWFkb25seSBzdGF0dXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPj47XG5cdHJlYWRvbmx5IGNoYW5nZXNldHM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbkNoYW5nZXNldFtdPj47XG5cdHJlYWRvbmx5IGNoYW5nZXM6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJU2Vzc2lvbkZpbGVDaGFuZ2VbXT4+O1xuXHRyZWFkb25seSB3b3Jrc3BhY2U6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4+O1xuXHRyZWFkb25seSBtb2RlbElkOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IG1vZGU6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTx7IHJlYWRvbmx5IGlkOiBzdHJpbmc7IHJlYWRvbmx5IGtpbmQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGxvYWRpbmc6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj47XG5cdHJlYWRvbmx5IGlzQXJjaGl2ZWQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxib29sZWFuPj47XG5cdHJlYWRvbmx5IGlzUmVhZDogUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+Pjtcblx0cmVhZG9ubHkgZGVzY3JpcHRpb246IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgbGFzdFR1cm5FbmQ6IFJldHVyblR5cGU8dHlwZW9mIG9ic2VydmFibGVWYWx1ZTxEYXRlIHwgdW5kZWZpbmVkPj47XG5cdHJlYWRvbmx5IGNoYXRzOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRbXT4+O1xuXHRyZWFkb25seSBtYWluQ2hhdDogSU9ic2VydmFibGU8SUNoYXQ+O1xuXHRyZWFkb25seSBjYXBhYmlsaXRpZXM6IElPYnNlcnZhYmxlPElTZXNzaW9uQ2FwYWJpbGl0aWVzPiA9IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSk7XG5cblx0Y29uc3RydWN0b3IoaWQ6IHN0cmluZywgZ2l0SHViSW5mbzogSUdpdEh1YkluZm8gfCB1bmRlZmluZWQsIGFyY2hpdmVkOiBib29sZWFuKSB7XG5cdFx0dGhpcy5zZXNzaW9uSWQgPSBgdGVzdDoke2lkfWA7XG5cdFx0dGhpcy5yZXNvdXJjZSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAndGVzdCcsIHBhdGg6IGAvJHtpZH1gIH0pO1xuXHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KGB0ZXN0LmdpdEh1YkluZm8uJHtpZH1gLCBnaXRIdWJJbmZvKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ3Rlc3QnLCBwYXRoOiBgL3dvcmtzcGFjZS8ke2lkfWAgfSk7XG5cdFx0dGhpcy50aXRsZSA9IG9ic2VydmFibGVWYWx1ZTxzdHJpbmc+KGB0ZXN0LnRpdGxlLiR7aWR9YCwgaWQpO1xuXHRcdHRoaXMudXBkYXRlZEF0ID0gb2JzZXJ2YWJsZVZhbHVlPERhdGU+KGB0ZXN0LnVwZGF0ZWRBdC4ke2lkfWAsIG5ldyBEYXRlKDApKTtcblx0XHR0aGlzLnN0YXR1cyA9IG9ic2VydmFibGVWYWx1ZTxTZXNzaW9uU3RhdHVzPihgdGVzdC5zdGF0dXMuJHtpZH1gLCBTZXNzaW9uU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0dGhpcy5jaGFuZ2VzZXRzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uQ2hhbmdlc2V0W10+KGB0ZXN0LmNoYW5nZXNldHMuJHtpZH1gLCBbXSk7XG5cdFx0dGhpcy5jaGFuZ2VzID0gb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElTZXNzaW9uRmlsZUNoYW5nZVtdPihgdGVzdC5jaGFuZ2VzLiR7aWR9YCwgW10pO1xuXHRcdHRoaXMud29ya3NwYWNlID0gb2JzZXJ2YWJsZVZhbHVlPElTZXNzaW9uV29ya3NwYWNlIHwgdW5kZWZpbmVkPihgdGVzdC53b3Jrc3BhY2UuJHtpZH1gLCB7XG5cdFx0XHR1cmk6IHdvcmtzcGFjZVVyaSxcblx0XHRcdGxhYmVsOiBpZCxcblx0XHRcdGljb246IENvZGljb24uZm9sZGVyLFxuXHRcdFx0Zm9sZGVyczogW3tcblx0XHRcdFx0cm9vdDogd29ya3NwYWNlVXJpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3J5OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRcdG5hbWU6IGlkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogdW5kZWZpbmVkLFxuXHRcdFx0XHRnaXRSZXBvc2l0b3J5OiB7IHVyaTogd29ya3NwYWNlVXJpLCB3b3JrVHJlZVVyaTogdW5kZWZpbmVkLCBiYXNlQnJhbmNoTmFtZTogdW5kZWZpbmVkLCBnaXRIdWJJbmZvOiBnaXRIdWJJbmZvT2JzIH0sXG5cdFx0XHR9XSxcblx0XHRcdHJlcXVpcmVzV29ya3NwYWNlVHJ1c3Q6IGZhbHNlLFxuXHRcdFx0aXNWaXJ0dWFsV29ya3NwYWNlOiBmYWxzZSxcblx0XHR9KTtcblx0XHR0aGlzLm1vZGVsSWQgPSBvYnNlcnZhYmxlVmFsdWU8c3RyaW5nIHwgdW5kZWZpbmVkPihgdGVzdC5tb2RlbElkLiR7aWR9YCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLm1vZGUgPSBvYnNlcnZhYmxlVmFsdWU8eyByZWFkb25seSBpZDogc3RyaW5nOyByZWFkb25seSBraW5kOiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4oYHRlc3QubW9kZS4ke2lkfWAsIHVuZGVmaW5lZCk7XG5cdFx0dGhpcy5sb2FkaW5nID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KGB0ZXN0LmxvYWRpbmcuJHtpZH1gLCBmYWxzZSk7XG5cdFx0dGhpcy5pc0FyY2hpdmVkID0gb2JzZXJ2YWJsZVZhbHVlPGJvb2xlYW4+KGB0ZXN0LmlzQXJjaGl2ZWQuJHtpZH1gLCBhcmNoaXZlZCk7XG5cdFx0dGhpcy5pc1JlYWQgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oYHRlc3QuaXNSZWFkLiR7aWR9YCwgdHJ1ZSk7XG5cdFx0dGhpcy5kZXNjcmlwdGlvbiA9IG9ic2VydmFibGVWYWx1ZTxJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ+KGB0ZXN0LmRlc2NyaXB0aW9uLiR7aWR9YCwgdW5kZWZpbmVkKTtcblx0XHR0aGlzLmxhc3RUdXJuRW5kID0gb2JzZXJ2YWJsZVZhbHVlPERhdGUgfCB1bmRlZmluZWQ+KGB0ZXN0Lmxhc3RUdXJuRW5kLiR7aWR9YCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGNoZWNrcG9pbnRzID0gb2JzZXJ2YWJsZVZhbHVlPElDaGF0Q2hlY2twb2ludHMgfCB1bmRlZmluZWQ+KGB0ZXN0LmNoZWNrcG9pbnRzLiR7aWR9YCwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IG1haW5DaGF0OiBJQ2hhdCA9IHtcblx0XHRcdHJlc291cmNlOiB0aGlzLnJlc291cmNlLFxuXHRcdFx0Y3JlYXRlZEF0OiB0aGlzLmNyZWF0ZWRBdCxcblx0XHRcdHRpdGxlOiB0aGlzLnRpdGxlLFxuXHRcdFx0dXBkYXRlZEF0OiB0aGlzLnVwZGF0ZWRBdCxcblx0XHRcdHN0YXR1czogdGhpcy5zdGF0dXMsXG5cdFx0XHRjaGFuZ2VzOiB0aGlzLmNoYW5nZXMsXG5cdFx0XHRjaGVja3BvaW50cyxcblx0XHRcdG1vZGVsSWQ6IHRoaXMubW9kZWxJZCxcblx0XHRcdG1vZGU6IHRoaXMubW9kZSxcblx0XHRcdGlzQXJjaGl2ZWQ6IHRoaXMuaXNBcmNoaXZlZCxcblx0XHRcdGlzUmVhZDogdGhpcy5pc1JlYWQsXG5cdFx0XHRpbnRlcmFjdGl2aXR5OiBjb25zdE9ic2VydmFibGUoQ2hhdEludGVyYWN0aXZpdHkuRnVsbCksXG5cdFx0XHRkZXNjcmlwdGlvbjogdGhpcy5kZXNjcmlwdGlvbixcblx0XHRcdGxhc3RUdXJuRW5kOiB0aGlzLmxhc3RUdXJuRW5kLFxuXHRcdH07XG5cdFx0dGhpcy5tYWluQ2hhdCA9IGNvbnN0T2JzZXJ2YWJsZShtYWluQ2hhdCk7XG5cdFx0dGhpcy5jaGF0cyA9IG9ic2VydmFibGVWYWx1ZTxyZWFkb25seSBJQ2hhdFtdPihgdGVzdC5jaGF0cy4ke2lkfWAsIFttYWluQ2hhdF0pO1xuXHR9XG59XG5cbmNsYXNzIFRlc3RHaXRIdWJTZXJ2aWNlIGV4dGVuZHMgbW9jazxJR2l0SHViU2VydmljZT4oKSB7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfbW9kZWxzID0gbmV3IE1hcDxzdHJpbmcsIFRlc3RQdWxsUmVxdWVzdE1vZGVsPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9jaU1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0U3RhdHVzTW9kZWw+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RocmVhZE1vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBUZXN0U3RhdHVzTW9kZWw+KCk7XG5cblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0T2JzID0gb2JzZXJ2YWJsZVZhbHVlKCd0ZXN0LmFjdGl2ZVBSJywgdW5kZWZpbmVkKTtcblx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0Q0lPYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuYWN0aXZlUFJDSScsIHVuZGVmaW5lZCk7XG5cdG92ZXJyaWRlIHJlYWRvbmx5IGFjdGl2ZVNlc3Npb25QdWxsUmVxdWVzdFJldmlld1RocmVhZHNPYnMgPSBvYnNlcnZhYmxlVmFsdWUoJ3Rlc3QuYWN0aXZlUFJSZXZpZXdUaHJlYWRzJywgdW5kZWZpbmVkKTtcblxuXHRvdmVycmlkZSBjcmVhdGVQdWxsUmVxdWVzdE1vZGVsUmVmZXJlbmNlKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IElSZWZlcmVuY2U8R2l0SHViUHVsbFJlcXVlc3RNb2RlbD4ge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99LyR7cHJOdW1iZXJ9YDtcblx0XHRsZXQgbW9kZWwgPSB0aGlzLl9tb2RlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBuZXcgVGVzdFB1bGxSZXF1ZXN0TW9kZWwoKTtcblx0XHRcdHRoaXMuX21vZGVscy5zZXQoa2V5LCBtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UobW9kZWwgYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdE1vZGVsKTtcblx0fVxuXG5cdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0Q0lNb2RlbFJlZmVyZW5jZShvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIsIGhlYWRTaGE6IHN0cmluZyk6IElSZWZlcmVuY2U8R2l0SHViUHVsbFJlcXVlc3RDSU1vZGVsPiB7XG5cdFx0Y29uc3Qga2V5ID0gYCR7b3duZXJ9LyR7cmVwb30vJHtwck51bWJlcn0vJHtoZWFkU2hhfWA7XG5cdFx0bGV0IG1vZGVsID0gdGhpcy5fY2lNb2RlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBuZXcgVGVzdFN0YXR1c01vZGVsKCk7XG5cdFx0XHR0aGlzLl9jaU1vZGVscy5zZXQoa2V5LCBtb2RlbCk7XG5cdFx0fVxuXHRcdHJldHVybiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UobW9kZWwgYXMgdW5rbm93biBhcyBHaXRIdWJQdWxsUmVxdWVzdENJTW9kZWwpO1xuXHR9XG5cblx0b3ZlcnJpZGUgY3JlYXRlUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWxSZWZlcmVuY2Uob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogSVJlZmVyZW5jZTxHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbD4ge1xuXHRcdGNvbnN0IGtleSA9IGAke293bmVyfS8ke3JlcG99LyR7cHJOdW1iZXJ9YDtcblx0XHRsZXQgbW9kZWwgPSB0aGlzLl90aHJlYWRNb2RlbHMuZ2V0KGtleSk7XG5cdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0bW9kZWwgPSBuZXcgVGVzdFN0YXR1c01vZGVsKCk7XG5cdFx0XHR0aGlzLl90aHJlYWRNb2RlbHMuc2V0KGtleSwgbW9kZWwpO1xuXHRcdH1cblx0XHRyZXR1cm4gbmV3IEltbW9ydGFsUmVmZXJlbmNlKG1vZGVsIGFzIHVua25vd24gYXMgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwpO1xuXHR9XG5cblx0c2V0UHVsbFJlcXVlc3REZXRhaWxzKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlciwgZGV0YWlsczogeyByZWFkb25seSBzdGF0ZTogR2l0SHViUHVsbFJlcXVlc3RTdGF0ZTsgcmVhZG9ubHkgaXNEcmFmdDogYm9vbGVhbjsgcmVhZG9ubHkgaGVhZFNoYTogc3RyaW5nIH0pOiB2b2lkIHtcblx0XHRjb25zdCBtb2RlbCA9IHRoaXMuX21vZGVscy5nZXQoYCR7b3duZXJ9LyR7cmVwb30vJHtwck51bWJlcn1gKTtcblx0XHRtb2RlbD8uc2V0UHVsbFJlcXVlc3QobWFrZVB1bGxSZXF1ZXN0KGRldGFpbHMpKTtcblx0fVxuXG5cdHNuYXBzaG90KCk6IFJlY29yZDxzdHJpbmcsIHsgc3RhcnRQb2xsaW5nQ2FsbHM6IG51bWJlcjsgc3RvcFBvbGxpbmdDYWxsczogbnVtYmVyOyBkaXNwb3NlQ2FsbHM6IG51bWJlciB9PiB7XG5cdFx0Y29uc3QgZW50cmllcyA9IFsuLi50aGlzLl9tb2RlbHMuZW50cmllcygpXS5tYXAoKFtrZXksIG1vZGVsXSkgPT4gW2tleSwge1xuXHRcdFx0c3RhcnRQb2xsaW5nQ2FsbHM6IG1vZGVsLnN0YXJ0UG9sbGluZ0NhbGxzLFxuXHRcdFx0c3RvcFBvbGxpbmdDYWxsczogbW9kZWwuc3RvcFBvbGxpbmdDYWxscyxcblx0XHRcdGRpc3Bvc2VDYWxsczogbW9kZWwuZGlzcG9zZUNhbGxzLFxuXHRcdH1dIGFzIGNvbnN0KTtcblx0XHRyZXR1cm4gT2JqZWN0LmZyb21FbnRyaWVzKGVudHJpZXMpO1xuXHR9XG5cblx0c3RhdHVzTW9kZWxTbmFwc2hvdCgpOiB7IGNpOiBSZWNvcmQ8c3RyaW5nLCB7IHN0YXJ0UG9sbGluZ0NhbGxzOiBudW1iZXI7IHJlZnJlc2hDYWxsczogbnVtYmVyIH0+OyByZXZpZXdUaHJlYWRzOiBSZWNvcmQ8c3RyaW5nLCB7IHN0YXJ0UG9sbGluZ0NhbGxzOiBudW1iZXI7IHJlZnJlc2hDYWxsczogbnVtYmVyIH0+IH0ge1xuXHRcdGNvbnN0IHRvUmVjb3JkID0gKG1vZGVsczogTWFwPHN0cmluZywgVGVzdFN0YXR1c01vZGVsPikgPT4gT2JqZWN0LmZyb21FbnRyaWVzKFxuXHRcdFx0Wy4uLm1vZGVscy5lbnRyaWVzKCldLm1hcCgoW2tleSwgbW9kZWxdKSA9PiBba2V5LCB7IHN0YXJ0UG9sbGluZ0NhbGxzOiBtb2RlbC5zdGFydFBvbGxpbmdDYWxscywgcmVmcmVzaENhbGxzOiBtb2RlbC5yZWZyZXNoQ2FsbHMgfV0gYXMgY29uc3QpXG5cdFx0KTtcblx0XHRyZXR1cm4geyBjaTogdG9SZWNvcmQodGhpcy5fY2lNb2RlbHMpLCByZXZpZXdUaHJlYWRzOiB0b1JlY29yZCh0aGlzLl90aHJlYWRNb2RlbHMpIH07XG5cdH1cbn1cblxuY2xhc3MgVGVzdFB1bGxSZXF1ZXN0TW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0c3RhcnRQb2xsaW5nQ2FsbHMgPSAwO1xuXHRzdG9wUG9sbGluZ0NhbGxzID0gMDtcblx0ZGlzcG9zZUNhbGxzID0gMDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9wdWxsUmVxdWVzdCA9IG9ic2VydmFibGVWYWx1ZTxJR2l0SHViUHVsbFJlcXVlc3QgfCB1bmRlZmluZWQ+KCd0ZXN0LnB1bGxSZXF1ZXN0JywgdW5kZWZpbmVkKTtcblx0cmVhZG9ubHkgcHVsbFJlcXVlc3Q6IElPYnNlcnZhYmxlPElHaXRIdWJQdWxsUmVxdWVzdCB8IHVuZGVmaW5lZD4gPSB0aGlzLl9wdWxsUmVxdWVzdDtcblxuXHRzZXRQdWxsUmVxdWVzdChwdWxsUmVxdWVzdDogSUdpdEh1YlB1bGxSZXF1ZXN0KTogdm9pZCB7XG5cdFx0dGhpcy5fcHVsbFJlcXVlc3Quc2V0KHB1bGxSZXF1ZXN0LCB1bmRlZmluZWQpO1xuXHR9XG5cblx0c3RhcnRQb2xsaW5nKCk6IElEaXNwb3NhYmxlIHtcblx0XHR0aGlzLnN0YXJ0UG9sbGluZ0NhbGxzKys7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB0aGlzLnN0b3BQb2xsaW5nQ2FsbHMrKyk7XG5cdH1cblxuXHRyZWZyZXNoKCk6IFByb21pc2U8dm9pZD4ge1xuXHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0fVxuXG5cdGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5kaXNwb3NlQ2FsbHMrKztcblx0fVxufVxuXG5jbGFzcyBUZXN0U3RhdHVzTW9kZWwgaW1wbGVtZW50cyBJRGlzcG9zYWJsZSB7XG5cblx0c3RhcnRQb2xsaW5nQ2FsbHMgPSAwO1xuXHRyZWZyZXNoQ2FsbHMgPSAwO1xuXG5cdHJlZnJlc2goKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0dGhpcy5yZWZyZXNoQ2FsbHMrKztcblx0XHRyZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG5cdH1cblxuXHRzdGFydFBvbGxpbmcoKTogSURpc3Bvc2FibGUge1xuXHRcdHRoaXMuc3RhcnRQb2xsaW5nQ2FsbHMrKztcblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHsgfSk7XG5cdH1cblxuXHRkaXNwb3NlKCk6IHZvaWQgeyB9XG59XG5cbmZ1bmN0aW9uIG1ha2VQdWxsUmVxdWVzdChvdmVycmlkZXM6IHsgcmVhZG9ubHkgc3RhdGU6IEdpdEh1YlB1bGxSZXF1ZXN0U3RhdGU7IHJlYWRvbmx5IGlzRHJhZnQ6IGJvb2xlYW47IHJlYWRvbmx5IGhlYWRTaGE6IHN0cmluZyB9KTogSUdpdEh1YlB1bGxSZXF1ZXN0IHtcblx0cmV0dXJuIHtcblx0XHRudW1iZXI6IDEsXG5cdFx0dGl0bGU6ICcnLFxuXHRcdGJvZHk6ICcnLFxuXHRcdHN0YXRlOiBvdmVycmlkZXMuc3RhdGUsXG5cdFx0YXV0aG9yOiB7IGxvZ2luOiAnJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGhlYWRSZWY6ICcnLFxuXHRcdGhlYWRTaGE6IG92ZXJyaWRlcy5oZWFkU2hhLFxuXHRcdGJhc2VSZWY6ICcnLFxuXHRcdGlzRHJhZnQ6IG92ZXJyaWRlcy5pc0RyYWZ0LFxuXHRcdGNyZWF0ZWRBdDogJycsXG5cdFx0dXBkYXRlZEF0OiAnJyxcblx0XHRtZXJnZWRBdDogdW5kZWZpbmVkLFxuXHRcdG1lcmdlYWJsZTogdW5kZWZpbmVkLFxuXHRcdG1lcmdlYWJsZVN0YXRlOiAnJyxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUdpdEh1YkluZm8ocHJOdW1iZXI6IG51bWJlcik6IElHaXRIdWJJbmZvIHtcblx0cmV0dXJuIHtcblx0XHRvd25lcjogJ293bmVyJyxcblx0XHRyZXBvOiAncmVwbycsXG5cdFx0cHVsbFJlcXVlc3Q6IHtcblx0XHRcdG51bWJlcjogcHJOdW1iZXIsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZShgaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC8ke3ByTnVtYmVyfWApLFxuXHRcdH0sXG5cdH07XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBc0I7QUFFL0IsU0FBUyxpQkFBOEIsbUJBQStCLG9CQUFvQjtBQUMxRixTQUFTLGlCQUFtRCx1QkFBdUI7QUFDbkYsU0FBUyxzQkFBc0I7QUFJL0IsU0FBUyw4QkFBa0Q7QUFDM0QsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsWUFBWTtBQUNyQixTQUFTLDRDQUE0QztBQUNyRCxTQUFTLDJCQUFzRDtBQUUvRCxTQUFTLG1CQUFtSixxQkFBcUI7QUFJakwsTUFBTSx1QkFBdUIsTUFBTTtBQUVsQywwQ0FBd0M7QUFFeEMsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxVQUFNLE9BQU8sSUFBSSxvQkFBK0MsQ0FBQztBQUFBLE1BQ2hFLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxNQUNQLE1BQU0sUUFBUTtBQUFBLE1BQ2QsV0FBVztBQUFBLElBQ1osR0FBRztBQUFBLE1BQ0YsUUFBUTtBQUFBLE1BQ1IsT0FBTztBQUFBLE1BQ1AsTUFBTSxRQUFRO0FBQUEsTUFDZCxXQUFXO0FBQUEsSUFDWixDQUFDLEdBQUcsTUFBTTtBQUFBLElBQUUsQ0FBQztBQUNiLGFBQVMsS0FBSyxZQUFZLEtBQUssT0FBTztBQUV0QyxRQUFJO0FBQ0gsWUFBTSxTQUFTLEtBQUssUUFBUSxjQUFjLFFBQVE7QUFDbEQsWUFBTSxxQkFBcUIsT0FBTyxjQUEyQiw4Q0FBOEMsRUFBRyxNQUFNO0FBQ3BILGFBQU8sTUFBTTtBQUViLFdBQUssT0FBTyxDQUFDO0FBQUEsUUFDWixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxNQUFNLFFBQVE7QUFBQSxRQUNkLFdBQVc7QUFBQSxNQUNaLENB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
