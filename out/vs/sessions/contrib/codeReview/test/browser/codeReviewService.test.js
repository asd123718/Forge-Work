import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { URI } from "../../../../../base/common/uri.js";
import { constObservable, derived, observableValue } from "../../../../../base/common/observable.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { isIMenuItem, MenuId, MenuRegistry } from "../../../../../platform/actions/common/actions.js";
import { TestInstantiationService } from "../../../../../platform/instantiation/test/common/instantiationServiceMock.js";
import { CommandsRegistry } from "../../../../../platform/commands/common/commands.js";
import { DisposableStore, ImmortalReference } from "../../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../../base/common/event.js";
import { mock } from "../../../../../base/test/common/mock.js";
import { ILogService, NullLogService } from "../../../../../platform/log/common/log.js";
import { ActiveEditorContext, IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext, MainEditorAreaVisibleContext } from "../../../../../workbench/common/contextkeys.js";
import { Menus } from "../../../../browser/menus.js";
import { SessionHasChangesContext, SessionIsCreatedContext, SinglePaneLayoutEnabledContext } from "../../../../common/contextkeys.js";
import { IGitHubService } from "../../../github/browser/githubService.js";
import { GitHubPullRequestReviewThreadsModel } from "../../../github/browser/models/githubPullRequestReviewThreadsModel.js";
import { SessionChangesEditorInput } from "../../../changes/browser/sessionChangesEditorInput.js";
import { CodeReviewService, PRReviewStateKind } from "../../browser/codeReviewService.js";
import { ISessionsService } from "../../../../services/sessions/browser/sessionsService.js";
import { ISessionsManagementService } from "../../../../services/sessions/common/sessionsManagement.js";
import { IChatWidgetService } from "../../../../../workbench/contrib/chat/browser/chat.js";
import { ISessionChangesService } from "../../../changes/browser/sessionChangesService.js";
import "../../browser/codeReview.contributions.js";
suite("CodeReviewService", () => {
  const store = new DisposableStore();
  let instantiationService;
  let service;
  let gitHubService;
  let sessionsManagement;
  let session;
  class MockSessionsManagementService extends mock() {
    constructor(disposables) {
      super();
      this._sessions = /* @__PURE__ */ new Map();
      this._onDidChangeSessions = disposables.add(new Emitter());
      this.onDidChangeSessions = this._onDidChangeSessions.event;
      this._activeSession = observableValue("test.activeSession", void 0);
      this.activeSession = this._activeSession;
    }
    getSession(resource) {
      return this._sessions.get(resource.toString());
    }
    addSession(resource, changes, archived = false) {
      const changesObs = observableValue(
        "test.changes",
        (changes ?? []).map((c) => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions }))
      );
      const isArchivedObs = observableValue("test.isArchived", archived);
      const gitHubInfoObs = observableValue("test.gitHubInfo", void 0);
      const workspaceUri = URI.file("/workspace");
      const workspaceObs = observableValue("test.workspace", {
        uri: workspaceUri,
        label: "workspace",
        icon: Codicon.folder,
        folders: [{
          root: workspaceUri,
          workingDirectory: workspaceUri,
          name: "workspace",
          description: void 0,
          gitRepository: { uri: workspaceUri, workTreeUri: void 0, baseBranchName: void 0, gitHubInfo: gitHubInfoObs }
        }],
        requiresWorkspaceTrust: false,
        isVirtualWorkspace: false
      });
      const sessionData = {
        sessionId: `test:${resource.toString()}`,
        resource,
        workspace: workspaceObs,
        changes: changesObs,
        isArchived: isArchivedObs
      };
      this._sessions.set(resource.toString(), sessionData);
      return sessionData;
    }
    setGitHubInfo(resource, gitHubInfo) {
      const session2 = this._sessions.get(resource.toString());
      if (session2) {
        const workspace = session2.workspace.get();
        const folder = workspace?.folders[0];
        if (folder) {
          folder.gitRepository.gitHubInfo.set(gitHubInfo, void 0);
        }
      }
    }
    setActiveSession(session2) {
      this._activeSession.set(session2, void 0);
    }
    updateSessionChanges(resource, changes) {
      const session2 = this._sessions.get(resource.toString());
      if (session2) {
        const obs = session2.changes;
        obs.set(
          (changes ?? []).map((c) => ({ modifiedUri: c.modifiedUri ?? c.uri, originalUri: c.originalUri, insertions: c.insertions, deletions: c.deletions })),
          void 0
        );
      }
    }
    removeSession(resource) {
      this._sessions.delete(resource.toString());
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
  class MockReviewThreadsFetcher {
    constructor() {
      this.nextThreads = [];
      this.getReviewThreadsCalls = 0;
      this.resolveThreadCalls = [];
    }
    async getReviewThreads(_owner, _repo, _prNumber) {
      this.getReviewThreadsCalls++;
      return this.nextThreads;
    }
    async postReviewComment(_owner, _repo, _prNumber, body, inReplyTo) {
      return makePRComment(inReplyTo, body);
    }
    async resolveThread(_owner, _repo, threadId) {
      this.resolveThreadCalls.push({ threadId });
    }
  }
  class MockGitHubService extends mock() {
    constructor(sessionsManagementService) {
      super();
      this.legacyFetcher = new MockReviewThreadsFetcher();
      this.reviewThreadsFetcher = new MockReviewThreadsFetcher();
      this._reviewThreadsModels = /* @__PURE__ */ new Map();
      this._reviewThreadsFetchers = /* @__PURE__ */ new Map();
      this.getPullRequestCalls = 0;
      this.getPullRequestReviewThreadsCalls = 0;
      this._reviewThreadsFetchers.set(this._key("owner", "repo", 1), this.reviewThreadsFetcher);
      this.activeSessionPullRequestReviewThreadsObs = derived((reader) => {
        const session2 = sessionsManagementService.activeSession.read(reader);
        const gitHubInfo = session2?.workspace.read(reader)?.folders[0]?.gitRepository?.gitHubInfo.read(reader);
        if (!gitHubInfo?.pullRequest) {
          return void 0;
        }
        return this.getReviewThreadsModel(gitHubInfo.owner, gitHubInfo.repo, gitHubInfo.pullRequest.number);
      });
    }
    getReviewThreadsFetcher(owner, repo, prNumber) {
      const key = this._key(owner, repo, prNumber);
      let fetcher = this._reviewThreadsFetchers.get(key);
      if (!fetcher) {
        fetcher = new MockReviewThreadsFetcher();
        this._reviewThreadsFetchers.set(key, fetcher);
      }
      return fetcher;
    }
    getReviewThreadsModel(owner, repo, prNumber) {
      const key = this._key(owner, repo, prNumber);
      let model = this._reviewThreadsModels.get(key);
      if (!model) {
        model = store.add(new GitHubPullRequestReviewThreadsModel(owner, repo, prNumber, this.getReviewThreadsFetcher(owner, repo, prNumber), new NullLogService()));
        this._reviewThreadsModels.set(key, model);
      }
      return model;
    }
    createPullRequestReviewThreadsModelReference(owner, repo, prNumber) {
      this.getPullRequestReviewThreadsCalls++;
      return new ImmortalReference(this.getReviewThreadsModel(owner, repo, prNumber));
    }
    _key(owner, repo, prNumber) {
      return `${owner}/${repo}#${prNumber}`;
    }
  }
  setup(() => {
    instantiationService = store.add(new TestInstantiationService());
    const logService = new NullLogService();
    instantiationService.stub(ILogService, logService);
    sessionsManagement = new MockSessionsManagementService(store);
    instantiationService.stub(ISessionsManagementService, sessionsManagement);
    instantiationService.stub(ISessionsService, { activeSession: sessionsManagement.activeSession });
    gitHubService = new MockGitHubService(sessionsManagement);
    instantiationService.stub(IGitHubService, gitHubService);
    service = store.add(instantiationService.createInstance(CodeReviewService));
    session = URI.parse("test://session/1");
  });
  teardown(() => {
    store.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("PR review state uses dedicated review threads model", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread("thread-100", "src/a.ts")];
    sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
    await tick();
    await gitHubService.getReviewThreadsModel("owner", "repo", 1).refresh();
    await tick();
    const state = service.getPRReviewState(session).get();
    assert.strictEqual(state.kind, PRReviewStateKind.Loaded);
    if (state.kind === PRReviewStateKind.Loaded) {
      assert.deepStrictEqual({
        comments: state.comments.map((comment) => ({ id: comment.id, uri: comment.uri.toString(), body: comment.body, author: comment.author })),
        getPullRequestCalls: gitHubService.getPullRequestCalls,
        getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
        legacyThreadRefreshes: gitHubService.legacyFetcher.getReviewThreadsCalls,
        reviewThreadRefreshes: gitHubService.reviewThreadsFetcher.getReviewThreadsCalls
      }, {
        comments: [{ id: "thread-100", uri: "file:///workspace/src/a.ts", body: "Comment on src/a.ts", author: "reviewer" }],
        getPullRequestCalls: 0,
        getPullRequestReviewThreadsCalls: 0,
        legacyThreadRefreshes: 0,
        reviewThreadRefreshes: 1
      });
    }
  });
  test("resolvePRReviewThread uses dedicated review threads model", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    await service.resolvePRReviewThread(session, "thread-100");
    assert.deepStrictEqual({
      getPullRequestCalls: gitHubService.getPullRequestCalls,
      getPullRequestReviewThreadsCalls: gitHubService.getPullRequestReviewThreadsCalls,
      legacyResolveThreadCalls: gitHubService.legacyFetcher.resolveThreadCalls,
      reviewResolveThreadCalls: gitHubService.reviewThreadsFetcher.resolveThreadCalls
    }, {
      getPullRequestCalls: 0,
      getPullRequestReviewThreadsCalls: 1,
      legacyResolveThreadCalls: [],
      reviewResolveThreadCalls: [{ threadId: "thread-100" }]
    });
  });
  test("dismissPRReviewComment filters the comment from the loaded review state", async () => {
    sessionsManagement.addSession(session);
    sessionsManagement.setGitHubInfo(session, makeGitHubInfo());
    gitHubService.reviewThreadsFetcher.nextThreads = [makePRThread("thread-100", "src/a.ts"), makePRThread("thread-200", "src/b.ts")];
    sessionsManagement.setActiveSession(sessionsManagement.getSession(session));
    await tick();
    await gitHubService.getReviewThreadsModel("owner", "repo", 1).refresh();
    await tick();
    service.dismissPRReviewComment(session, "thread-100");
    const state = service.getPRReviewState(session).get();
    assert.deepStrictEqual(
      state.kind === PRReviewStateKind.Loaded ? state.comments.map((c) => c.id) : state.kind,
      ["thread-200"]
    );
  });
});
suite("Code Review Contributions", () => {
  const store = ensureNoDisposablesAreLeakedInTestSuite();
  test("Run Code Review is right-inline when visible and first in overflow when collapsed", () => {
    const primaryItem = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderPrimary).filter(isIMenuItem).find((item) => item.command.id === "sessions.codeReview.run");
    const rightItems = MenuRegistry.getMenuItems(Menus.SessionsEditorHeaderSecondary).filter(isIMenuItem).filter((item) => item.command.id === "sessions.codeReview.run");
    const inlineItem = rightItems.find((item) => item.group === "0_codeReview");
    const overflowItem = rightItems.find((item) => item.group === "secondary/1_codeReview");
    assert.strictEqual(primaryItem, void 0, "Run Code Review should not render inline in the primary header");
    assert.ok(inlineItem, "expected Run Code Review inline on the right while the editor is visible");
    assert.ok(overflowItem, "expected Run Code Review in overflow while the editor is collapsed");
    const inlineWhen = inlineItem.when?.serialize() ?? "";
    const overflowWhen = overflowItem.when?.serialize() ?? "";
    assert.deepStrictEqual({
      inline: {
        group: inlineItem.group,
        order: inlineItem.order,
        editorAreaGate: inlineWhen.includes(MainEditorAreaVisibleContext.key)
      },
      overflow: {
        group: overflowItem.group,
        order: overflowItem.order,
        editorAreaGate: overflowWhen.includes(`!${MainEditorAreaVisibleContext.key}`)
      },
      hasSessionsWindowGate: inlineWhen.includes(IsSessionsWindowContext.key),
      hasActiveEditorGate: inlineWhen.includes(ActiveEditorContext.key) && inlineWhen.includes(SessionChangesEditorInput.EDITOR_ID),
      hasSinglePaneLayoutGate: inlineWhen.includes(SinglePaneLayoutEnabledContext.key),
      hasAuxiliaryWindowGate: inlineWhen.includes(IsAuxiliaryWindowContext.key),
      hasTopRightEditorGroupGate: inlineWhen.includes(IsTopRightEditorGroupContext.key),
      hasChangesGate: inlineWhen.includes(SessionHasChangesContext.key),
      hasCreatedGate: inlineWhen.includes(SessionIsCreatedContext.key)
    }, {
      inline: {
        group: "0_codeReview",
        order: 10,
        editorAreaGate: true
      },
      overflow: {
        group: "secondary/1_codeReview",
        order: 10,
        editorAreaGate: true
      },
      hasSessionsWindowGate: true,
      hasActiveEditorGate: true,
      hasSinglePaneLayoutGate: true,
      hasAuxiliaryWindowGate: true,
      hasTopRightEditorGroupGate: true,
      hasChangesGate: true,
      hasCreatedGate: true
    });
  });
  test("Run Code Review is shown in the classic Changes toolbar only for created sessions", () => {
    const item = MenuRegistry.getMenuItems(MenuId.AgentsChangesToolbar).filter(isIMenuItem).find((item2) => item2.command.id === "sessions.codeReview.run");
    assert.ok(item, "expected Run Code Review action on the classic Changes toolbar");
    assert.strictEqual(
      item.when?.serialize().includes(SessionIsCreatedContext.key),
      true
    );
  });
  test("Run Code Review resolves a Changes editor resource to its owning session", async () => {
    const sessionResource = URI.parse("session:test");
    const editorResource = URI.parse("changes-multi-diff-source:test");
    const session = {
      resource: sessionResource,
      capabilities: constObservable({ supportsMultipleChats: true })
    };
    let sentQuery;
    const testInstantiationService = store.add(new TestInstantiationService());
    testInstantiationService.stub(ISessionsManagementService, new class extends mock() {
      getSession(resource) {
        return resource.toString() === sessionResource.toString() ? session : void 0;
      }
      async sendNewChatRequest(_session, options) {
        sentQuery = options.query;
      }
    }());
    testInstantiationService.stub(ISessionsService, new class extends mock() {
    }());
    testInstantiationService.stub(IChatWidgetService, new class extends mock() {
    }());
    testInstantiationService.stub(ISessionChangesService, new class extends mock() {
      getSessionResource(resource) {
        return resource.toString() === editorResource.toString() ? sessionResource : void 0;
      }
    }());
    const command = CommandsRegistry.getCommand("sessions.codeReview.run");
    assert.ok(command);
    await testInstantiationService.invokeFunction((accessor) => command.handler(accessor, editorResource));
    assert.strictEqual(sentQuery, "/code-review");
  });
});
function makeGitHubInfo(prNumber = 1) {
  return {
    owner: "owner",
    repo: "repo",
    pullRequest: {
      number: prNumber,
      uri: URI.parse(`https://github.com/owner/repo/pull/${prNumber}`)
    }
  };
}
function makePRThread(id, path) {
  return {
    id,
    isResolved: false,
    path,
    line: 10,
    comments: [makePRComment(100, `Comment on ${path}`, id)]
  };
}
function makePRComment(id, body, threadId = String(id)) {
  return {
    id,
    body,
    author: { login: "reviewer", avatarUrl: "" },
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
    path: void 0,
    line: void 0,
    threadId,
    inReplyToId: void 0
  };
}
function tick() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcY29kZVJldmlld1xcdGVzdFxcYnJvd3NlclxcY29kZVJldmlld1NlcnZpY2UudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgSU9ic2VydmFibGUsIGNvbnN0T2JzZXJ2YWJsZSwgZGVyaXZlZCwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3V0aWxzLmpzJztcbmltcG9ydCB7IGlzSU1lbnVJdGVtLCBNZW51SWQsIE1lbnVSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi90ZXN0L2NvbW1vbi9pbnN0YW50aWF0aW9uU2VydmljZU1vY2suanMnO1xuaW1wb3J0IHsgQ29tbWFuZHNSZWdpc3RyeSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbW1hbmRzL2NvbW1vbi9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBTZXJ2aWNlc0FjY2Vzc29yIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvbi5qcyc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUsIEltbW9ydGFsUmVmZXJlbmNlLCBJUmVmZXJlbmNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vbGlmZWN5Y2xlLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgbW9jayB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vbW9jay5qcyc7XG5pbXBvcnQgeyBJTG9nU2VydmljZSwgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlLCBJQ2hhdFNlc3Npb25GaWxlQ2hhbmdlMiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWN0aXZlRWRpdG9yQ29udGV4dCwgSXNBdXhpbGlhcnlXaW5kb3dDb250ZXh0LCBJc1Nlc3Npb25zV2luZG93Q29udGV4dCwgSXNUb3BSaWdodEVkaXRvckdyb3VwQ29udGV4dCwgTWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb21tb24vY29udGV4dGtleXMuanMnO1xuaW1wb3J0IHsgTWVudXMgfSBmcm9tICcuLi8uLi8uLi8uLi9icm93c2VyL21lbnVzLmpzJztcbmltcG9ydCB7IFNlc3Npb25IYXNDaGFuZ2VzQ29udGV4dCwgU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQsIFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9jb250ZXh0a2V5cy5qcyc7XG5pbXBvcnQgeyBJR2l0SHViU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9icm93c2VyL2dpdGh1YlNlcnZpY2UuanMnO1xuaW1wb3J0IHsgR2l0SHViUFJGZXRjaGVyIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvZmV0Y2hlcnMvZ2l0aHViUFJGZXRjaGVyLmpzJztcbmltcG9ydCB7IEdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsIH0gZnJvbSAnLi4vLi4vLi4vZ2l0aHViL2Jyb3dzZXIvbW9kZWxzL2dpdGh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsLmpzJztcbmltcG9ydCB7IElHaXRIdWJQUkNvbW1lbnQsIElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZCB9IGZyb20gJy4uLy4uLy4uL2dpdGh1Yi9jb21tb24vdHlwZXMuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkNoYW5nZXNFZGl0b3JJbnB1dCB9IGZyb20gJy4uLy4uLy4uL2NoYW5nZXMvYnJvd3Nlci9zZXNzaW9uQ2hhbmdlc0VkaXRvcklucHV0LmpzJztcbmltcG9ydCB7IElHaXRIdWJJbmZvLCBJU2Vzc2lvbiwgSVNlc3Npb25Xb3Jrc3BhY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBJQ29kZVJldmlld1NlcnZpY2UsIENvZGVSZXZpZXdTZXJ2aWNlLCBQUlJldmlld1N0YXRlS2luZCB9IGZyb20gJy4uLy4uL2Jyb3dzZXIvY29kZVJldmlld1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVNlc3Npb25zU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uL3NlcnZpY2VzL3Nlc3Npb25zL2Jyb3dzZXIvc2Vzc2lvbnNTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBY3RpdmVTZXNzaW9uLCBJU2VuZFJlcXVlc3RPcHRpb25zLCBJU2Vzc2lvbnNDaGFuZ2VFdmVudCwgSVNlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbnNNYW5hZ2VtZW50LmpzJztcbmltcG9ydCB7IElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3dvcmtiZW5jaC9jb250cmliL2NoYXQvYnJvd3Nlci9jaGF0LmpzJztcbmltcG9ydCB7IElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9jaGFuZ2VzL2Jyb3dzZXIvc2Vzc2lvbkNoYW5nZXNTZXJ2aWNlLmpzJztcbmltcG9ydCAnLi4vLi4vYnJvd3Nlci9jb2RlUmV2aWV3LmNvbnRyaWJ1dGlvbnMuanMnO1xuXG5zdWl0ZSgnQ29kZVJldmlld1NlcnZpY2UnLCAoKSA9PiB7XG5cblx0Y29uc3Qgc3RvcmUgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGxldCBpbnN0YW50aWF0aW9uU2VydmljZTogVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlO1xuXHRsZXQgc2VydmljZTogSUNvZGVSZXZpZXdTZXJ2aWNlO1xuXHRsZXQgZ2l0SHViU2VydmljZTogTW9ja0dpdEh1YlNlcnZpY2U7XG5cdGxldCBzZXNzaW9uc01hbmFnZW1lbnQ6IE1vY2tTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlO1xuXG5cdGxldCBzZXNzaW9uOiBVUkk7XG5cblx0Y2xhc3MgTW9ja1Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UgZXh0ZW5kcyBtb2NrPElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlPigpIHtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25zOiBFbWl0dGVyPElTZXNzaW9uc0NoYW5nZUV2ZW50Pjtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9hY3RpdmVTZXNzaW9uOiBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+Pjtcblx0XHRvdmVycmlkZSByZWFkb25seSBvbkRpZENoYW5nZVNlc3Npb25zOiBFdmVudDxJU2Vzc2lvbnNDaGFuZ2VFdmVudD47XG5cdFx0cmVhZG9ubHkgYWN0aXZlU2Vzc2lvbjogSU9ic2VydmFibGU8SUFjdGl2ZVNlc3Npb24gfCB1bmRlZmluZWQ+O1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbnMgPSBuZXcgTWFwPHN0cmluZywgSVNlc3Npb24+KCk7XG5cblx0XHRjb25zdHJ1Y3RvcihkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlKSB7XG5cdFx0XHRzdXBlcigpO1xuXHRcdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9ucyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgRW1pdHRlcjxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4oKSk7XG5cdFx0XHR0aGlzLm9uRGlkQ2hhbmdlU2Vzc2lvbnMgPSB0aGlzLl9vbkRpZENoYW5nZVNlc3Npb25zLmV2ZW50O1xuXHRcdFx0dGhpcy5fYWN0aXZlU2Vzc2lvbiA9IG9ic2VydmFibGVWYWx1ZTxJQWN0aXZlU2Vzc2lvbiB8IHVuZGVmaW5lZD4oJ3Rlc3QuYWN0aXZlU2Vzc2lvbicsIHVuZGVmaW5lZCk7XG5cdFx0XHR0aGlzLmFjdGl2ZVNlc3Npb24gPSB0aGlzLl9hY3RpdmVTZXNzaW9uO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGdldFNlc3Npb24ocmVzb3VyY2U6IFVSSSk6IElTZXNzaW9uIHwgdW5kZWZpbmVkIHtcblx0XHRcdHJldHVybiB0aGlzLl9zZXNzaW9ucy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0YWRkU2Vzc2lvbihyZXNvdXJjZTogVVJJLCBjaGFuZ2VzPzogcmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZTJbXSwgYXJjaGl2ZWQgPSBmYWxzZSk6IElTZXNzaW9uIHtcblx0XHRcdGNvbnN0IGNoYW5nZXNPYnMgPSBvYnNlcnZhYmxlVmFsdWU8cmVhZG9ubHkgSUNoYXRTZXNzaW9uRmlsZUNoYW5nZVtdPigndGVzdC5jaGFuZ2VzJyxcblx0XHRcdFx0KGNoYW5nZXMgPz8gW10pLm1hcChjID0+ICh7IG1vZGlmaWVkVXJpOiBjLm1vZGlmaWVkVXJpID8/IGMudXJpLCBvcmlnaW5hbFVyaTogYy5vcmlnaW5hbFVyaSwgaW5zZXJ0aW9uczogYy5pbnNlcnRpb25zLCBkZWxldGlvbnM6IGMuZGVsZXRpb25zIH0pKVxuXHRcdFx0KTtcblx0XHRcdGNvbnN0IGlzQXJjaGl2ZWRPYnMgPSBvYnNlcnZhYmxlVmFsdWU8Ym9vbGVhbj4oJ3Rlc3QuaXNBcmNoaXZlZCcsIGFyY2hpdmVkKTtcblx0XHRcdGNvbnN0IGdpdEh1YkluZm9PYnMgPSBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+KCd0ZXN0LmdpdEh1YkluZm8nLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UnKTtcblx0XHRcdGNvbnN0IHdvcmtzcGFjZU9icyA9IG9ic2VydmFibGVWYWx1ZTxJU2Vzc2lvbldvcmtzcGFjZSB8IHVuZGVmaW5lZD4oJ3Rlc3Qud29ya3NwYWNlJywge1xuXHRcdFx0XHR1cmk6IHdvcmtzcGFjZVVyaSxcblx0XHRcdFx0bGFiZWw6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRpY29uOiBDb2RpY29uLmZvbGRlcixcblx0XHRcdFx0Zm9sZGVyczogW3tcblx0XHRcdFx0XHRyb290OiB3b3Jrc3BhY2VVcmksXG5cdFx0XHRcdFx0d29ya2luZ0RpcmVjdG9yeTogd29ya3NwYWNlVXJpLFxuXHRcdFx0XHRcdG5hbWU6ICd3b3Jrc3BhY2UnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0Z2l0UmVwb3NpdG9yeTogeyB1cmk6IHdvcmtzcGFjZVVyaSwgd29ya1RyZWVVcmk6IHVuZGVmaW5lZCwgYmFzZUJyYW5jaE5hbWU6IHVuZGVmaW5lZCwgZ2l0SHViSW5mbzogZ2l0SHViSW5mb09icyB9LFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0cmVxdWlyZXNXb3Jrc3BhY2VUcnVzdDogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHNlc3Npb25EYXRhOiBJU2Vzc2lvbiA9IHtcblx0XHRcdFx0c2Vzc2lvbklkOiBgdGVzdDoke3Jlc291cmNlLnRvU3RyaW5nKCl9YCxcblx0XHRcdFx0cmVzb3VyY2UsXG5cdFx0XHRcdHdvcmtzcGFjZTogd29ya3NwYWNlT2JzLFxuXHRcdFx0XHRjaGFuZ2VzOiBjaGFuZ2VzT2JzLFxuXHRcdFx0XHRpc0FyY2hpdmVkOiBpc0FyY2hpdmVkT2JzLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElTZXNzaW9uO1xuXHRcdFx0dGhpcy5fc2Vzc2lvbnMuc2V0KHJlc291cmNlLnRvU3RyaW5nKCksIHNlc3Npb25EYXRhKTtcblx0XHRcdHJldHVybiBzZXNzaW9uRGF0YTtcblx0XHR9XG5cblx0XHRzZXRHaXRIdWJJbmZvKHJlc291cmNlOiBVUkksIGdpdEh1YkluZm86IElHaXRIdWJJbmZvIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHRjb25zdCBzZXNzaW9uID0gdGhpcy5fc2Vzc2lvbnMuZ2V0KHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdFx0aWYgKHNlc3Npb24pIHtcblx0XHRcdFx0Y29uc3Qgd29ya3NwYWNlID0gc2Vzc2lvbi53b3Jrc3BhY2UuZ2V0KCk7XG5cdFx0XHRcdGNvbnN0IGZvbGRlciA9IHdvcmtzcGFjZT8uZm9sZGVyc1swXTtcblx0XHRcdFx0aWYgKGZvbGRlcikge1xuXHRcdFx0XHRcdChmb2xkZXIuZ2l0UmVwb3NpdG9yeSEuZ2l0SHViSW5mbyBhcyBSZXR1cm5UeXBlPHR5cGVvZiBvYnNlcnZhYmxlVmFsdWU8SUdpdEh1YkluZm8gfCB1bmRlZmluZWQ+Pikuc2V0KGdpdEh1YkluZm8sIHVuZGVmaW5lZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHRzZXRBY3RpdmVTZXNzaW9uKHNlc3Npb246IElTZXNzaW9uIHwgdW5kZWZpbmVkKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9hY3RpdmVTZXNzaW9uLnNldChzZXNzaW9uIGFzIElBY3RpdmVTZXNzaW9uIHwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH1cblxuXHRcdHVwZGF0ZVNlc3Npb25DaGFuZ2VzKHJlc291cmNlOiBVUkksIGNoYW5nZXM6IHJlYWRvbmx5IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2UyW10gfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHRcdGNvbnN0IHNlc3Npb24gPSB0aGlzLl9zZXNzaW9ucy5nZXQocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHRpZiAoc2Vzc2lvbikge1xuXHRcdFx0XHRjb25zdCBvYnMgPSBzZXNzaW9uLmNoYW5nZXMgYXMgUmV0dXJuVHlwZTx0eXBlb2Ygb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0U2Vzc2lvbkZpbGVDaGFuZ2VbXT4+O1xuXHRcdFx0XHRvYnMuc2V0KFxuXHRcdFx0XHRcdChjaGFuZ2VzID8/IFtdKS5tYXAoYyA9PiAoeyBtb2RpZmllZFVyaTogYy5tb2RpZmllZFVyaSA/PyBjLnVyaSwgb3JpZ2luYWxVcmk6IGMub3JpZ2luYWxVcmksIGluc2VydGlvbnM6IGMuaW5zZXJ0aW9ucywgZGVsZXRpb25zOiBjLmRlbGV0aW9ucyB9KSksXG5cdFx0XHRcdFx0dW5kZWZpbmVkXG5cdFx0XHRcdCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmVtb3ZlU2Vzc2lvbihyZXNvdXJjZTogVVJJKTogdm9pZCB7XG5cdFx0XHR0aGlzLl9zZXNzaW9ucy5kZWxldGUocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0fVxuXG5cdFx0b3ZlcnJpZGUgZ2V0U2Vzc2lvbnMoKTogSVNlc3Npb25bXSB7XG5cdFx0XHRyZXR1cm4gWy4uLnRoaXMuX3Nlc3Npb25zLnZhbHVlcygpXTtcblx0XHR9XG5cblx0XHRmaXJlU2Vzc2lvbnNDaGFuZ2VkKGV2ZW50PzogUGFydGlhbDxJU2Vzc2lvbnNDaGFuZ2VFdmVudD4pOiB2b2lkIHtcblx0XHRcdHRoaXMuX29uRGlkQ2hhbmdlU2Vzc2lvbnMuZmlyZSh7XG5cdFx0XHRcdGFkZGVkOiBldmVudD8uYWRkZWQgPz8gW10sXG5cdFx0XHRcdHJlbW92ZWQ6IGV2ZW50Py5yZW1vdmVkID8/IFtdLFxuXHRcdFx0XHRjaGFuZ2VkOiBldmVudD8uY2hhbmdlZCA/PyBbXSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGNsYXNzIE1vY2tSZXZpZXdUaHJlYWRzRmV0Y2hlciB7XG5cdFx0bmV4dFRocmVhZHM6IElHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZFtdID0gW107XG5cdFx0Z2V0UmV2aWV3VGhyZWFkc0NhbGxzID0gMDtcblx0XHRyZXNvbHZlVGhyZWFkQ2FsbHM6IHsgdGhyZWFkSWQ6IHN0cmluZyB9W10gPSBbXTtcblxuXHRcdGFzeW5jIGdldFJldmlld1RocmVhZHMoX293bmVyOiBzdHJpbmcsIF9yZXBvOiBzdHJpbmcsIF9wck51bWJlcjogbnVtYmVyKTogUHJvbWlzZTxJR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRbXT4ge1xuXHRcdFx0dGhpcy5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMrKztcblx0XHRcdHJldHVybiB0aGlzLm5leHRUaHJlYWRzO1xuXHRcdH1cblxuXHRcdGFzeW5jIHBvc3RSZXZpZXdDb21tZW50KF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCBfcHJOdW1iZXI6IG51bWJlciwgYm9keTogc3RyaW5nLCBpblJlcGx5VG86IG51bWJlcik6IFByb21pc2U8SUdpdEh1YlBSQ29tbWVudD4ge1xuXHRcdFx0cmV0dXJuIG1ha2VQUkNvbW1lbnQoaW5SZXBseVRvLCBib2R5KTtcblx0XHR9XG5cblx0XHRhc3luYyByZXNvbHZlVGhyZWFkKF9vd25lcjogc3RyaW5nLCBfcmVwbzogc3RyaW5nLCB0aHJlYWRJZDogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHR0aGlzLnJlc29sdmVUaHJlYWRDYWxscy5wdXNoKHsgdGhyZWFkSWQgfSk7XG5cdFx0fVxuXHR9XG5cblx0Y2xhc3MgTW9ja0dpdEh1YlNlcnZpY2UgZXh0ZW5kcyBtb2NrPElHaXRIdWJTZXJ2aWNlPigpIHtcblx0XHRyZWFkb25seSBsZWdhY3lGZXRjaGVyID0gbmV3IE1vY2tSZXZpZXdUaHJlYWRzRmV0Y2hlcigpO1xuXHRcdHJlYWRvbmx5IHJldmlld1RocmVhZHNGZXRjaGVyID0gbmV3IE1vY2tSZXZpZXdUaHJlYWRzRmV0Y2hlcigpO1xuXG5cdFx0cHJpdmF0ZSByZWFkb25seSBfcmV2aWV3VGhyZWFkc01vZGVscyA9IG5ldyBNYXA8c3RyaW5nLCBHaXRIdWJQdWxsUmVxdWVzdFJldmlld1RocmVhZHNNb2RlbD4oKTtcblx0XHRwcml2YXRlIHJlYWRvbmx5IF9yZXZpZXdUaHJlYWRzRmV0Y2hlcnMgPSBuZXcgTWFwPHN0cmluZywgTW9ja1Jldmlld1RocmVhZHNGZXRjaGVyPigpO1xuXG5cdFx0Z2V0UHVsbFJlcXVlc3RDYWxscyA9IDA7XG5cdFx0Z2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHMgPSAwO1xuXG5cdFx0b3ZlcnJpZGUgcmVhZG9ubHkgYWN0aXZlU2Vzc2lvblB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc09iczogSU9ic2VydmFibGU8R2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwgfCB1bmRlZmluZWQ+O1xuXG5cdFx0Y29uc3RydWN0b3Ioc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZTogTW9ja1Nlc3Npb25zTWFuYWdlbWVudFNlcnZpY2UpIHtcblx0XHRcdHN1cGVyKCk7XG5cdFx0XHR0aGlzLl9yZXZpZXdUaHJlYWRzRmV0Y2hlcnMuc2V0KHRoaXMuX2tleSgnb3duZXInLCAncmVwbycsIDEpLCB0aGlzLnJldmlld1RocmVhZHNGZXRjaGVyKTtcblxuXHRcdFx0dGhpcy5hY3RpdmVTZXNzaW9uUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzT2JzID0gZGVyaXZlZChyZWFkZXIgPT4ge1xuXHRcdFx0XHRjb25zdCBzZXNzaW9uID0gc2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZS5hY3RpdmVTZXNzaW9uLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0Y29uc3QgZ2l0SHViSW5mbyA9IHNlc3Npb24/LndvcmtzcGFjZS5yZWFkKHJlYWRlcik/LmZvbGRlcnNbMF0/LmdpdFJlcG9zaXRvcnk/LmdpdEh1YkluZm8ucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoIWdpdEh1YkluZm8/LnB1bGxSZXF1ZXN0KSB7XG5cdFx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpcy5nZXRSZXZpZXdUaHJlYWRzTW9kZWwoZ2l0SHViSW5mby5vd25lciwgZ2l0SHViSW5mby5yZXBvLCBnaXRIdWJJbmZvLnB1bGxSZXF1ZXN0Lm51bWJlcik7XG5cdFx0XHR9KTtcblx0XHR9XG5cblx0XHRnZXRSZXZpZXdUaHJlYWRzRmV0Y2hlcihvd25lcjogc3RyaW5nLCByZXBvOiBzdHJpbmcsIHByTnVtYmVyOiBudW1iZXIpOiBNb2NrUmV2aWV3VGhyZWFkc0ZldGNoZXIge1xuXHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KG93bmVyLCByZXBvLCBwck51bWJlcik7XG5cdFx0XHRsZXQgZmV0Y2hlciA9IHRoaXMuX3Jldmlld1RocmVhZHNGZXRjaGVycy5nZXQoa2V5KTtcblx0XHRcdGlmICghZmV0Y2hlcikge1xuXHRcdFx0XHRmZXRjaGVyID0gbmV3IE1vY2tSZXZpZXdUaHJlYWRzRmV0Y2hlcigpO1xuXHRcdFx0XHR0aGlzLl9yZXZpZXdUaHJlYWRzRmV0Y2hlcnMuc2V0KGtleSwgZmV0Y2hlcik7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gZmV0Y2hlcjtcblx0XHR9XG5cblx0XHRnZXRSZXZpZXdUaHJlYWRzTW9kZWwob3duZXI6IHN0cmluZywgcmVwbzogc3RyaW5nLCBwck51bWJlcjogbnVtYmVyKTogR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwge1xuXHRcdFx0Y29uc3Qga2V5ID0gdGhpcy5fa2V5KG93bmVyLCByZXBvLCBwck51bWJlcik7XG5cdFx0XHRsZXQgbW9kZWwgPSB0aGlzLl9yZXZpZXdUaHJlYWRzTW9kZWxzLmdldChrZXkpO1xuXHRcdFx0aWYgKCFtb2RlbCkge1xuXHRcdFx0XHRtb2RlbCA9IHN0b3JlLmFkZChuZXcgR2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWwob3duZXIsIHJlcG8sIHByTnVtYmVyLCB0aGlzLmdldFJldmlld1RocmVhZHNGZXRjaGVyKG93bmVyLCByZXBvLCBwck51bWJlcikgYXMgdW5rbm93biBhcyBHaXRIdWJQUkZldGNoZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRcdHRoaXMuX3Jldmlld1RocmVhZHNNb2RlbHMuc2V0KGtleSwgbW9kZWwpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIG1vZGVsO1xuXHRcdH1cblxuXHRcdG92ZXJyaWRlIGNyZWF0ZVB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc01vZGVsUmVmZXJlbmNlKG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IElSZWZlcmVuY2U8R2l0SHViUHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzTW9kZWw+IHtcblx0XHRcdHRoaXMuZ2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHMrKztcblx0XHRcdHJldHVybiBuZXcgSW1tb3J0YWxSZWZlcmVuY2UodGhpcy5nZXRSZXZpZXdUaHJlYWRzTW9kZWwob3duZXIsIHJlcG8sIHByTnVtYmVyKSk7XG5cdFx0fVxuXG5cdFx0cHJpdmF0ZSBfa2V5KG93bmVyOiBzdHJpbmcsIHJlcG86IHN0cmluZywgcHJOdW1iZXI6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0XHRyZXR1cm4gYCR7b3duZXJ9LyR7cmVwb30jJHtwck51bWJlcn1gO1xuXHRcdH1cblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZSA9IHN0b3JlLmFkZChuZXcgVGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlKCkpO1xuXG5cdFx0Y29uc3QgbG9nU2VydmljZSA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2UpO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50ID0gbmV3IE1vY2tTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlKHN0b3JlKTtcblx0XHRpbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uc01hbmFnZW1lbnRTZXJ2aWNlLCBzZXNzaW9uc01hbmFnZW1lbnQpO1xuXHRcdGluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgeyBhY3RpdmVTZXNzaW9uOiBzZXNzaW9uc01hbmFnZW1lbnQuYWN0aXZlU2Vzc2lvbiB9IGFzIHVua25vd24gYXMgSVNlc3Npb25zU2VydmljZSk7XG5cblx0XHRnaXRIdWJTZXJ2aWNlID0gbmV3IE1vY2tHaXRIdWJTZXJ2aWNlKHNlc3Npb25zTWFuYWdlbWVudCk7XG5cdFx0aW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJR2l0SHViU2VydmljZSwgZ2l0SHViU2VydmljZSk7XG5cblx0XHRzZXJ2aWNlID0gc3RvcmUuYWRkKGluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGVSZXZpZXdTZXJ2aWNlKSk7XG5cdFx0c2Vzc2lvbiA9IFVSSS5wYXJzZSgndGVzdDovL3Nlc3Npb24vMScpO1xuXHR9KTtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0c3RvcmUuY2xlYXIoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnUFIgcmV2aWV3IHN0YXRlIHVzZXMgZGVkaWNhdGVkIHJldmlldyB0aHJlYWRzIG1vZGVsJywgYXN5bmMgKCkgPT4ge1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5hZGRTZXNzaW9uKHNlc3Npb24pO1xuXHRcdHNlc3Npb25zTWFuYWdlbWVudC5zZXRHaXRIdWJJbmZvKHNlc3Npb24sIG1ha2VHaXRIdWJJbmZvKCkpO1xuXHRcdGdpdEh1YlNlcnZpY2UucmV2aWV3VGhyZWFkc0ZldGNoZXIubmV4dFRocmVhZHMgPSBbbWFrZVBSVGhyZWFkKCd0aHJlYWQtMTAwJywgJ3NyYy9hLnRzJyldO1xuXG5cdFx0c2Vzc2lvbnNNYW5hZ2VtZW50LnNldEFjdGl2ZVNlc3Npb24oc2Vzc2lvbnNNYW5hZ2VtZW50LmdldFNlc3Npb24oc2Vzc2lvbikpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdC8vIFBvbGxpbmcgaXMgb3duZWQgYnkgR2l0SHViUHVsbFJlcXVlc3RQb2xsaW5nQ29udHJpYnV0aW9uOyByZWZyZXNoXG5cdFx0Ly8gbWFudWFsbHkgaGVyZSB0byBzZWVkIHRoZSByZXZpZXcgdGhyZWFkcyBtb2RlbCB3aXRoIGRhdGEuXG5cdFx0YXdhaXQgZ2l0SHViU2VydmljZS5nZXRSZXZpZXdUaHJlYWRzTW9kZWwoJ293bmVyJywgJ3JlcG8nLCAxKS5yZWZyZXNoKCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLmdldFBSUmV2aWV3U3RhdGUoc2Vzc2lvbikuZ2V0KCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmtpbmQsIFBSUmV2aWV3U3RhdGVLaW5kLkxvYWRlZCk7XG5cdFx0aWYgKHN0YXRlLmtpbmQgPT09IFBSUmV2aWV3U3RhdGVLaW5kLkxvYWRlZCkge1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbW1lbnRzOiBzdGF0ZS5jb21tZW50cy5tYXAoY29tbWVudCA9PiAoeyBpZDogY29tbWVudC5pZCwgdXJpOiBjb21tZW50LnVyaS50b1N0cmluZygpLCBib2R5OiBjb21tZW50LmJvZHksIGF1dGhvcjogY29tbWVudC5hdXRob3IgfSkpLFxuXHRcdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiBnaXRIdWJTZXJ2aWNlLmdldFB1bGxSZXF1ZXN0Q2FsbHMsXG5cdFx0XHRcdGdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc0NhbGxzOiBnaXRIdWJTZXJ2aWNlLmdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc0NhbGxzLFxuXHRcdFx0XHRsZWdhY3lUaHJlYWRSZWZyZXNoZXM6IGdpdEh1YlNlcnZpY2UubGVnYWN5RmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0XHRcdHJldmlld1RocmVhZFJlZnJlc2hlczogZ2l0SHViU2VydmljZS5yZXZpZXdUaHJlYWRzRmV0Y2hlci5nZXRSZXZpZXdUaHJlYWRzQ2FsbHMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvbW1lbnRzOiBbeyBpZDogJ3RocmVhZC0xMDAnLCB1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZS9zcmMvYS50cycsIGJvZHk6ICdDb21tZW50IG9uIHNyYy9hLnRzJywgYXV0aG9yOiAncmV2aWV3ZXInIH1dLFxuXHRcdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiAwLFxuXHRcdFx0XHRnZXRQdWxsUmVxdWVzdFJldmlld1RocmVhZHNDYWxsczogMCxcblx0XHRcdFx0bGVnYWN5VGhyZWFkUmVmcmVzaGVzOiAwLFxuXHRcdFx0XHRyZXZpZXdUaHJlYWRSZWZyZXNoZXM6IDEsXG5cdFx0XHR9KTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVQUlJldmlld1RocmVhZCB1c2VzIGRlZGljYXRlZCByZXZpZXcgdGhyZWFkcyBtb2RlbCcsIGFzeW5jICgpID0+IHtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuc2V0R2l0SHViSW5mbyhzZXNzaW9uLCBtYWtlR2l0SHViSW5mbygpKTtcblxuXHRcdGF3YWl0IHNlcnZpY2UucmVzb2x2ZVBSUmV2aWV3VGhyZWFkKHNlc3Npb24sICd0aHJlYWQtMTAwJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGdldFB1bGxSZXF1ZXN0Q2FsbHM6IGdpdEh1YlNlcnZpY2UuZ2V0UHVsbFJlcXVlc3RDYWxscyxcblx0XHRcdGdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc0NhbGxzOiBnaXRIdWJTZXJ2aWNlLmdldFB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkc0NhbGxzLFxuXHRcdFx0bGVnYWN5UmVzb2x2ZVRocmVhZENhbGxzOiBnaXRIdWJTZXJ2aWNlLmxlZ2FjeUZldGNoZXIucmVzb2x2ZVRocmVhZENhbGxzLFxuXHRcdFx0cmV2aWV3UmVzb2x2ZVRocmVhZENhbGxzOiBnaXRIdWJTZXJ2aWNlLnJldmlld1RocmVhZHNGZXRjaGVyLnJlc29sdmVUaHJlYWRDYWxscyxcblx0XHR9LCB7XG5cdFx0XHRnZXRQdWxsUmVxdWVzdENhbGxzOiAwLFxuXHRcdFx0Z2V0UHVsbFJlcXVlc3RSZXZpZXdUaHJlYWRzQ2FsbHM6IDEsXG5cdFx0XHRsZWdhY3lSZXNvbHZlVGhyZWFkQ2FsbHM6IFtdLFxuXHRcdFx0cmV2aWV3UmVzb2x2ZVRocmVhZENhbGxzOiBbeyB0aHJlYWRJZDogJ3RocmVhZC0xMDAnIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNtaXNzUFJSZXZpZXdDb21tZW50IGZpbHRlcnMgdGhlIGNvbW1lbnQgZnJvbSB0aGUgbG9hZGVkIHJldmlldyBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuYWRkU2Vzc2lvbihzZXNzaW9uKTtcblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuc2V0R2l0SHViSW5mbyhzZXNzaW9uLCBtYWtlR2l0SHViSW5mbygpKTtcblx0XHRnaXRIdWJTZXJ2aWNlLnJldmlld1RocmVhZHNGZXRjaGVyLm5leHRUaHJlYWRzID0gW21ha2VQUlRocmVhZCgndGhyZWFkLTEwMCcsICdzcmMvYS50cycpLCBtYWtlUFJUaHJlYWQoJ3RocmVhZC0yMDAnLCAnc3JjL2IudHMnKV07XG5cblx0XHRzZXNzaW9uc01hbmFnZW1lbnQuc2V0QWN0aXZlU2Vzc2lvbihzZXNzaW9uc01hbmFnZW1lbnQuZ2V0U2Vzc2lvbihzZXNzaW9uKSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGF3YWl0IGdpdEh1YlNlcnZpY2UuZ2V0UmV2aWV3VGhyZWFkc01vZGVsKCdvd25lcicsICdyZXBvJywgMSkucmVmcmVzaCgpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdHNlcnZpY2UuZGlzbWlzc1BSUmV2aWV3Q29tbWVudChzZXNzaW9uLCAndGhyZWFkLTEwMCcpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzZXJ2aWNlLmdldFBSUmV2aWV3U3RhdGUoc2Vzc2lvbikuZ2V0KCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHN0YXRlLmtpbmQgPT09IFBSUmV2aWV3U3RhdGVLaW5kLkxvYWRlZCA/IHN0YXRlLmNvbW1lbnRzLm1hcChjID0+IGMuaWQpIDogc3RhdGUua2luZCxcblx0XHRcdFsndGhyZWFkLTIwMCddLFxuXHRcdCk7XG5cdH0pO1xufSk7XG5cbnN1aXRlKCdDb2RlIFJldmlldyBDb250cmlidXRpb25zJywgKCkgPT4ge1xuXG5cdGNvbnN0IHN0b3JlID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnUnVuIENvZGUgUmV2aWV3IGlzIHJpZ2h0LWlubGluZSB3aGVuIHZpc2libGUgYW5kIGZpcnN0IGluIG92ZXJmbG93IHdoZW4gY29sbGFwc2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHByaW1hcnlJdGVtID0gTWVudVJlZ2lzdHJ5LmdldE1lbnVJdGVtcyhNZW51cy5TZXNzaW9uc0VkaXRvckhlYWRlclByaW1hcnkpXG5cdFx0XHQuZmlsdGVyKGlzSU1lbnVJdGVtKVxuXHRcdFx0LmZpbmQoaXRlbSA9PiBpdGVtLmNvbW1hbmQuaWQgPT09ICdzZXNzaW9ucy5jb2RlUmV2aWV3LnJ1bicpO1xuXHRcdGNvbnN0IHJpZ2h0SXRlbXMgPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVzLlNlc3Npb25zRWRpdG9ySGVhZGVyU2Vjb25kYXJ5KVxuXHRcdFx0LmZpbHRlcihpc0lNZW51SXRlbSlcblx0XHRcdC5maWx0ZXIoaXRlbSA9PiBpdGVtLmNvbW1hbmQuaWQgPT09ICdzZXNzaW9ucy5jb2RlUmV2aWV3LnJ1bicpO1xuXHRcdGNvbnN0IGlubGluZUl0ZW0gPSByaWdodEl0ZW1zLmZpbmQoaXRlbSA9PiBpdGVtLmdyb3VwID09PSAnMF9jb2RlUmV2aWV3Jyk7XG5cdFx0Y29uc3Qgb3ZlcmZsb3dJdGVtID0gcmlnaHRJdGVtcy5maW5kKGl0ZW0gPT4gaXRlbS5ncm91cCA9PT0gJ3NlY29uZGFyeS8xX2NvZGVSZXZpZXcnKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmltYXJ5SXRlbSwgdW5kZWZpbmVkLCAnUnVuIENvZGUgUmV2aWV3IHNob3VsZCBub3QgcmVuZGVyIGlubGluZSBpbiB0aGUgcHJpbWFyeSBoZWFkZXInKTtcblx0XHRhc3NlcnQub2soaW5saW5lSXRlbSwgJ2V4cGVjdGVkIFJ1biBDb2RlIFJldmlldyBpbmxpbmUgb24gdGhlIHJpZ2h0IHdoaWxlIHRoZSBlZGl0b3IgaXMgdmlzaWJsZScpO1xuXHRcdGFzc2VydC5vayhvdmVyZmxvd0l0ZW0sICdleHBlY3RlZCBSdW4gQ29kZSBSZXZpZXcgaW4gb3ZlcmZsb3cgd2hpbGUgdGhlIGVkaXRvciBpcyBjb2xsYXBzZWQnKTtcblx0XHRjb25zdCBpbmxpbmVXaGVuID0gaW5saW5lSXRlbS53aGVuPy5zZXJpYWxpemUoKSA/PyAnJztcblx0XHRjb25zdCBvdmVyZmxvd1doZW4gPSBvdmVyZmxvd0l0ZW0ud2hlbj8uc2VyaWFsaXplKCkgPz8gJyc7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbmxpbmU6IHtcblx0XHRcdFx0Z3JvdXA6IGlubGluZUl0ZW0uZ3JvdXAsXG5cdFx0XHRcdG9yZGVyOiBpbmxpbmVJdGVtLm9yZGVyLFxuXHRcdFx0XHRlZGl0b3JBcmVhR2F0ZTogaW5saW5lV2hlbi5pbmNsdWRlcyhNYWluRWRpdG9yQXJlYVZpc2libGVDb250ZXh0LmtleSksXG5cdFx0XHR9LFxuXHRcdFx0b3ZlcmZsb3c6IHtcblx0XHRcdFx0Z3JvdXA6IG92ZXJmbG93SXRlbS5ncm91cCxcblx0XHRcdFx0b3JkZXI6IG92ZXJmbG93SXRlbS5vcmRlcixcblx0XHRcdFx0ZWRpdG9yQXJlYUdhdGU6IG92ZXJmbG93V2hlbi5pbmNsdWRlcyhgISR7TWFpbkVkaXRvckFyZWFWaXNpYmxlQ29udGV4dC5rZXl9YCksXG5cdFx0XHR9LFxuXHRcdFx0aGFzU2Vzc2lvbnNXaW5kb3dHYXRlOiBpbmxpbmVXaGVuLmluY2x1ZGVzKElzU2Vzc2lvbnNXaW5kb3dDb250ZXh0LmtleSksXG5cdFx0XHRoYXNBY3RpdmVFZGl0b3JHYXRlOiBpbmxpbmVXaGVuLmluY2x1ZGVzKEFjdGl2ZUVkaXRvckNvbnRleHQua2V5KSAmJiBpbmxpbmVXaGVuLmluY2x1ZGVzKFNlc3Npb25DaGFuZ2VzRWRpdG9ySW5wdXQuRURJVE9SX0lEKSxcblx0XHRcdGhhc1NpbmdsZVBhbmVMYXlvdXRHYXRlOiBpbmxpbmVXaGVuLmluY2x1ZGVzKFNpbmdsZVBhbmVMYXlvdXRFbmFibGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0aGFzQXV4aWxpYXJ5V2luZG93R2F0ZTogaW5saW5lV2hlbi5pbmNsdWRlcyhJc0F1eGlsaWFyeVdpbmRvd0NvbnRleHQua2V5KSxcblx0XHRcdGhhc1RvcFJpZ2h0RWRpdG9yR3JvdXBHYXRlOiBpbmxpbmVXaGVuLmluY2x1ZGVzKElzVG9wUmlnaHRFZGl0b3JHcm91cENvbnRleHQua2V5KSxcblx0XHRcdGhhc0NoYW5nZXNHYXRlOiBpbmxpbmVXaGVuLmluY2x1ZGVzKFNlc3Npb25IYXNDaGFuZ2VzQ29udGV4dC5rZXkpLFxuXHRcdFx0aGFzQ3JlYXRlZEdhdGU6IGlubGluZVdoZW4uaW5jbHVkZXMoU2Vzc2lvbklzQ3JlYXRlZENvbnRleHQua2V5KSxcblx0XHR9LCB7XG5cdFx0XHRpbmxpbmU6IHtcblx0XHRcdFx0Z3JvdXA6ICcwX2NvZGVSZXZpZXcnLFxuXHRcdFx0XHRvcmRlcjogMTAsXG5cdFx0XHRcdGVkaXRvckFyZWFHYXRlOiB0cnVlLFxuXHRcdFx0fSxcblx0XHRcdG92ZXJmbG93OiB7XG5cdFx0XHRcdGdyb3VwOiAnc2Vjb25kYXJ5LzFfY29kZVJldmlldycsXG5cdFx0XHRcdG9yZGVyOiAxMCxcblx0XHRcdFx0ZWRpdG9yQXJlYUdhdGU6IHRydWUsXG5cdFx0XHR9LFxuXHRcdFx0aGFzU2Vzc2lvbnNXaW5kb3dHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQWN0aXZlRWRpdG9yR2F0ZTogdHJ1ZSxcblx0XHRcdGhhc1NpbmdsZVBhbmVMYXlvdXRHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQXV4aWxpYXJ5V2luZG93R2F0ZTogdHJ1ZSxcblx0XHRcdGhhc1RvcFJpZ2h0RWRpdG9yR3JvdXBHYXRlOiB0cnVlLFxuXHRcdFx0aGFzQ2hhbmdlc0dhdGU6IHRydWUsXG5cdFx0XHRoYXNDcmVhdGVkR2F0ZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUnVuIENvZGUgUmV2aWV3IGlzIHNob3duIGluIHRoZSBjbGFzc2ljIENoYW5nZXMgdG9vbGJhciBvbmx5IGZvciBjcmVhdGVkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGl0ZW0gPSBNZW51UmVnaXN0cnkuZ2V0TWVudUl0ZW1zKE1lbnVJZC5BZ2VudHNDaGFuZ2VzVG9vbGJhcilcblx0XHRcdC5maWx0ZXIoaXNJTWVudUl0ZW0pXG5cdFx0XHQuZmluZChpdGVtID0+IGl0ZW0uY29tbWFuZC5pZCA9PT0gJ3Nlc3Npb25zLmNvZGVSZXZpZXcucnVuJyk7XG5cblx0XHRhc3NlcnQub2soaXRlbSwgJ2V4cGVjdGVkIFJ1biBDb2RlIFJldmlldyBhY3Rpb24gb24gdGhlIGNsYXNzaWMgQ2hhbmdlcyB0b29sYmFyJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0aXRlbS53aGVuPy5zZXJpYWxpemUoKS5pbmNsdWRlcyhTZXNzaW9uSXNDcmVhdGVkQ29udGV4dC5rZXkpLFxuXHRcdFx0dHJ1ZSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdSdW4gQ29kZSBSZXZpZXcgcmVzb2x2ZXMgYSBDaGFuZ2VzIGVkaXRvciByZXNvdXJjZSB0byBpdHMgb3duaW5nIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlc291cmNlID0gVVJJLnBhcnNlKCdzZXNzaW9uOnRlc3QnKTtcblx0XHRjb25zdCBlZGl0b3JSZXNvdXJjZSA9IFVSSS5wYXJzZSgnY2hhbmdlcy1tdWx0aS1kaWZmLXNvdXJjZTp0ZXN0Jyk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uUmVzb3VyY2UsXG5cdFx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogdHJ1ZSB9KSxcblx0XHR9IGFzIElTZXNzaW9uO1xuXHRcdGxldCBzZW50UXVlcnk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCB0ZXN0SW5zdGFudGlhdGlvblNlcnZpY2UgPSBzdG9yZS5hZGQobmV3IFRlc3RJbnN0YW50aWF0aW9uU2VydmljZSgpKTtcblx0XHR0ZXN0SW5zdGFudGlhdGlvblNlcnZpY2Uuc3R1YihJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNNYW5hZ2VtZW50U2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uKHJlc291cmNlOiBVUkkpOiBJU2Vzc2lvbiB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpID09PSBzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSA/IHNlc3Npb24gOiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0XHRvdmVycmlkZSBhc3luYyBzZW5kTmV3Q2hhdFJlcXVlc3QoX3Nlc3Npb246IElTZXNzaW9uLCBvcHRpb25zOiBJU2VuZFJlcXVlc3RPcHRpb25zKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRcdHNlbnRRdWVyeSA9IG9wdGlvbnMucXVlcnk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cdFx0dGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSVNlc3Npb25zU2VydmljZSwgbmV3IGNsYXNzIGV4dGVuZHMgbW9jazxJU2Vzc2lvbnNTZXJ2aWNlPigpIHsgfSk7XG5cdFx0dGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLnN0dWIoSUNoYXRXaWRnZXRTZXJ2aWNlLCBuZXcgY2xhc3MgZXh0ZW5kcyBtb2NrPElDaGF0V2lkZ2V0U2VydmljZT4oKSB7IH0pO1xuXHRcdHRlc3RJbnN0YW50aWF0aW9uU2VydmljZS5zdHViKElTZXNzaW9uQ2hhbmdlc1NlcnZpY2UsIG5ldyBjbGFzcyBleHRlbmRzIG1vY2s8SVNlc3Npb25DaGFuZ2VzU2VydmljZT4oKSB7XG5cdFx0XHRvdmVycmlkZSBnZXRTZXNzaW9uUmVzb3VyY2UocmVzb3VyY2U6IFVSSSk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdFx0XHRcdHJldHVybiByZXNvdXJjZS50b1N0cmluZygpID09PSBlZGl0b3JSZXNvdXJjZS50b1N0cmluZygpID8gc2Vzc2lvblJlc291cmNlIDogdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSBDb21tYW5kc1JlZ2lzdHJ5LmdldENvbW1hbmQoJ3Nlc3Npb25zLmNvZGVSZXZpZXcucnVuJyk7XG5cdFx0YXNzZXJ0Lm9rKGNvbW1hbmQpO1xuXG5cdFx0YXdhaXQgdGVzdEluc3RhbnRpYXRpb25TZXJ2aWNlLmludm9rZUZ1bmN0aW9uKChhY2Nlc3NvcjogU2VydmljZXNBY2Nlc3NvcikgPT4gY29tbWFuZC5oYW5kbGVyKGFjY2Vzc29yLCBlZGl0b3JSZXNvdXJjZSkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlbnRRdWVyeSwgJy9jb2RlLXJldmlldycpO1xuXHR9KTtcbn0pO1xuXG5mdW5jdGlvbiBtYWtlR2l0SHViSW5mbyhwck51bWJlciA9IDEpOiBJR2l0SHViSW5mbyB7XG5cdHJldHVybiB7XG5cdFx0b3duZXI6ICdvd25lcicsXG5cdFx0cmVwbzogJ3JlcG8nLFxuXHRcdHB1bGxSZXF1ZXN0OiB7XG5cdFx0XHRudW1iZXI6IHByTnVtYmVyLFxuXHRcdFx0dXJpOiBVUkkucGFyc2UoYGh0dHBzOi8vZ2l0aHViLmNvbS9vd25lci9yZXBvL3B1bGwvJHtwck51bWJlcn1gKSxcblx0XHR9LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUFJUaHJlYWQoaWQ6IHN0cmluZywgcGF0aDogc3RyaW5nKTogSUdpdEh1YlB1bGxSZXF1ZXN0UmV2aWV3VGhyZWFkIHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRpc1Jlc29sdmVkOiBmYWxzZSxcblx0XHRwYXRoLFxuXHRcdGxpbmU6IDEwLFxuXHRcdGNvbW1lbnRzOiBbbWFrZVBSQ29tbWVudCgxMDAsIGBDb21tZW50IG9uICR7cGF0aH1gLCBpZCldLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlUFJDb21tZW50KGlkOiBudW1iZXIsIGJvZHk6IHN0cmluZywgdGhyZWFkSWQ6IHN0cmluZyA9IFN0cmluZyhpZCkpOiBJR2l0SHViUFJDb21tZW50IHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRib2R5LFxuXHRcdGF1dGhvcjogeyBsb2dpbjogJ3Jldmlld2VyJywgYXZhdGFyVXJsOiAnJyB9LFxuXHRcdGNyZWF0ZWRBdDogJzIwMjQtMDEtMDFUMDA6MDA6MDBaJyxcblx0XHR1cGRhdGVkQXQ6ICcyMDI0LTAxLTAxVDAwOjAwOjAwWicsXG5cdFx0cGF0aDogdW5kZWZpbmVkLFxuXHRcdGxpbmU6IHVuZGVmaW5lZCxcblx0XHR0aHJlYWRJZCxcblx0XHRpblJlcGx5VG9JZDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5mdW5jdGlvbiB0aWNrKCk6IFByb21pc2U8dm9pZD4ge1xuXHRyZXR1cm4gbmV3IFByb21pc2UocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIDApKTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxXQUFXO0FBQ3BCLFNBQXNCLGlCQUFpQixTQUFTLHVCQUF1QjtBQUN2RSxTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsUUFBUSxvQkFBb0I7QUFDbEQsU0FBUyxnQ0FBZ0M7QUFDekMsU0FBUyx3QkFBd0I7QUFFakMsU0FBUyxpQkFBaUIseUJBQXFDO0FBQy9ELFNBQVMsZUFBc0I7QUFDL0IsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsYUFBYSxzQkFBc0I7QUFFNUMsU0FBUyxxQkFBcUIsMEJBQTBCLHlCQUF5Qiw4QkFBOEIsb0NBQW9DO0FBQ25KLFNBQVMsYUFBYTtBQUN0QixTQUFTLDBCQUEwQix5QkFBeUIsc0NBQXNDO0FBQ2xHLFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsMkNBQTJDO0FBRXBELFNBQVMsaUNBQWlDO0FBRTFDLFNBQTZCLG1CQUFtQix5QkFBeUI7QUFDekUsU0FBUyx3QkFBd0I7QUFDakMsU0FBb0Usa0NBQWtDO0FBQ3RHLFNBQVMsMEJBQTBCO0FBQ25D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
