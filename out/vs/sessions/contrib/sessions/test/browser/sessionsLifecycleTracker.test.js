import assert from "assert";
import { Codicon } from "../../../../../base/common/codicons.js";
import { hash } from "../../../../../base/common/hash.js";
import { constObservable, observableValue } from "../../../../../base/common/observable.js";
import { URI } from "../../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { InMemoryStorageService, StorageScope, StorageTarget } from "../../../../../platform/storage/common/storage.js";
import { SessionStatus } from "../../../../services/sessions/common/session.js";
import { MAX_TRACKED_SESSIONS, SESSIONS_KEY, SessionsLifecycleTracker } from "../../browser/sessionsLifecycleTracker.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
function createSession(id, opts = {}) {
  const providerId = opts.providerId ?? "test-provider";
  const sessionType = opts.sessionType ?? "test-type";
  return {
    sessionId: id,
    resource: URI.parse(`session://${id}`),
    providerId,
    sessionType,
    icon: Codicon.account,
    createdAt: /* @__PURE__ */ new Date(),
    workspace: observableValue(`workspace-${id}`, opts.workspace),
    title: observableValue(`title-${id}`, id),
    updatedAt: observableValue(`updatedAt-${id}`, /* @__PURE__ */ new Date()),
    status: observableValue(`status-${id}`, SessionStatus.Completed),
    changesets: observableValue(`changesets-${id}`, []),
    changes: observableValue(`changes-${id}`, opts.changes ?? []),
    changesSummary: opts.changesSummary !== void 0 ? observableValue(`changesSummary-${id}`, opts.changesSummary) : void 0,
    modelId: observableValue(`modelId-${id}`, void 0),
    mode: observableValue(`mode-${id}`, void 0),
    loading: observableValue(`loading-${id}`, false),
    isArchived: observableValue(`isArchived-${id}`, false),
    isRead: observableValue(`isRead-${id}`, true),
    description: observableValue(`description-${id}`, void 0),
    lastTurnEnd: observableValue(`lastTurnEnd-${id}`, void 0),
    chats: observableValue(`chats-${id}`, []),
    mainChat: constObservable(void 0),
    capabilities: constObservable({ supportsMultipleChats: false })
  };
}
function createWorkspace(uri, folders) {
  return {
    uri,
    label: "ws",
    icon: ThemeIcon.fromId("folder"),
    folders,
    requiresWorkspaceTrust: false,
    isVirtualWorkspace: uri.scheme !== "file"
  };
}
function createFolder(uri, opts = {}) {
  return {
    root: uri,
    workingDirectory: uri,
    name: "folder",
    description: void 0,
    gitRepository: opts.withGitRepository || opts.workTreeUri ? {
      uri,
      workTreeUri: opts.workTreeUri,
      baseBranchName: void 0,
      gitHubInfo: constObservable(void 0)
    } : void 0
  };
}
suite("SessionsLifecycleTracker", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  let storage;
  let tracker;
  setup(() => {
    storage = disposables.add(new InMemoryStorageService());
    tracker = disposables.add(new SessionsLifecycleTracker(storage));
  });
  test("starts untracked until a user interaction is recorded", () => {
    const session = createSession("s1");
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
    tracker.recordNewChatRequestSent(session);
    assert.strictEqual(tracker.isTracked(session.sessionId), true);
  });
  test("finalize emits summary and removes tracking entry", () => {
    const session = createSession("s1", { providerId: "agenthost-example.internal:1234" });
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.bumpCounter(session, "commit");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.agentSessionId, "640d87e741e6aa4c669a82a4cd304787960513ab");
    assert.strictEqual(summary.providerId, "remote-agent-host");
    assert.strictEqual(summary.providerType, "test-type");
    assert.strictEqual(summary.doneReason, "archived");
    assert.strictEqual(summary.requestsSent, 1);
    assert.strictEqual(summary.feedbackAdded, 2);
    assert.strictEqual(summary.commit, 1);
    assert.strictEqual(summary.firstRequestSentInThisClient, true);
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("finalize returns undefined when session is not tracked", () => {
    const summary = tracker.finalize("does-not-exist", "deletedRemotely");
    assert.strictEqual(summary, void 0);
  });
  test("state persists across tracker instances and app launch count grows", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.strictEqual(secondTracker.isTracked(session.sessionId), true);
    const summary = secondTracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.feedbackAdded, 1);
    assert.strictEqual(summary.requestsSent, 1);
    assert.strictEqual(summary.appLaunchesSinceFirstObserved, 1);
  });
  test("chatCount increments once per recordRequestSent call", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordNewChatRequestSent(session);
    tracker.bumpCounter(session, "feedbackAdded");
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.chatCount, 3);
    assert.strictEqual(summary.requestsSent, 3);
  });
  test("getTrackedEntries returns sessionId plus providerId for each entry", () => {
    const a = createSession("a", { providerId: "provider-a" });
    const b = createSession("b", { providerId: "provider-b" });
    tracker.recordNewChatRequestSent(a);
    tracker.bumpCounter(b, "commit");
    const entries = tracker.getTrackedEntries().map((e) => `${e.providerId}:${e.sessionId}`).sort();
    assert.deepStrictEqual(entries, ["provider-a:a", "provider-b:b"]);
  });
  test("local archive then deferred remote signal yields a single summary", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    const localSummary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(localSummary);
    assert.strictEqual(localSummary.doneReason, "archived");
    const deferredSummary = tracker.finalize(session.sessionId, "archivedRemotely", session);
    assert.strictEqual(deferredSummary, void 0);
  });
  test("bumpCounter creates a tracking entry for previously untracked sessions", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "commit");
    assert.strictEqual(tracker.isTracked(session.sessionId), true);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.strictEqual(summary.commit, 1);
    assert.strictEqual(summary.requestsSent, 0);
    assert.strictEqual(summary.firstRequestSentInThisClient, false);
  });
  test("bumpCounter increments distinct counter keys independently", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "chatRenamed");
    tracker.bumpCounter(session, "chatRenamed");
    tracker.bumpCounter(session, "taskRun");
    tracker.bumpCounter(session, "mergePullRequest");
    tracker.bumpCounter(session, "fixCIChecks");
    tracker.bumpCounter(session, "fixCIChecks");
    tracker.bumpCounter(session, "fixCIChecks");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      chatRenamed: summary.chatRenamed,
      taskRun: summary.taskRun,
      mergePullRequest: summary.mergePullRequest,
      fixCIChecks: summary.fixCIChecks,
      commit: summary.commit
    }, {
      chatRenamed: 2,
      taskRun: 1,
      mergePullRequest: 1,
      fixCIChecks: 3,
      commit: 0
    });
  });
  test("updateSessionState is a no-op for untracked sessions", () => {
    const session = createSession("s1", { changes: [{ modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 }] });
    tracker.updateSessionState(session);
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("changesSummary observable takes precedence over the changes list", () => {
    const session = createSession("s1", {
      changes: [
        { modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 },
        { modifiedUri: URI.parse("file:///b"), insertions: 2, deletions: 3 }
      ],
      changesSummary: { files: 17, additions: 99, deletions: 88 }
    });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      filesChanged: summary.filesChanged,
      linesAdded: summary.linesAdded,
      linesDeleted: summary.linesDeleted
    }, {
      filesChanged: 17,
      linesAdded: 99,
      linesDeleted: 88
    });
  });
  test("falls back to aggregating changes when changesSummary is absent", () => {
    const session = createSession("s1", {
      changes: [
        { modifiedUri: URI.parse("file:///a"), insertions: 5, deletions: 1 },
        { modifiedUri: URI.parse("file:///b"), insertions: 2, deletions: 3 }
      ]
    });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      filesChanged: summary.filesChanged,
      linesAdded: summary.linesAdded,
      linesDeleted: summary.linesDeleted
    }, {
      filesChanged: 2,
      linesAdded: 7,
      linesDeleted: 4
    });
  });
  test("summary derives workspace fields from the session workspace at first observation", () => {
    const workspaceUri = URI.parse("vscode-remote://host/repo");
    const repoUri = URI.parse("file:///repo");
    const workspace = createWorkspace(workspaceUri, [
      createFolder(repoUri, { workTreeUri: URI.parse("file:///repo/.git/worktrees/feature") })
    ]);
    const session = createSession("s1", { workspace });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      isolationKind: summary.isolationKind,
      hasGitRepository: summary.hasGitRepository,
      isVirtualWorkspace: summary.isVirtualWorkspace,
      workspaceHash: summary.workspaceHash
    }, {
      isolationKind: "worktree",
      hasGitRepository: true,
      isVirtualWorkspace: true,
      workspaceHash: hash(workspaceUri.toString()).toString(16)
    });
  });
  test("summary reports folder isolation for a plain file workspace with no worktree", () => {
    const workspaceUri = URI.parse("file:///repo");
    const workspace = createWorkspace(workspaceUri, [
      createFolder(workspaceUri, { withGitRepository: true })
    ]);
    const session = createSession("s1", { workspace });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      isolationKind: summary.isolationKind,
      hasGitRepository: summary.hasGitRepository,
      isVirtualWorkspace: summary.isVirtualWorkspace
    }, {
      isolationKind: "folder",
      hasGitRepository: true,
      isVirtualWorkspace: false
    });
  });
  test("summary reports the multi-root workspace topology captured at first observation", () => {
    const workspaceUri = URI.parse("file:///repo");
    const gitFolder = URI.parse("file:///repo/app");
    const nonGitFolder = URI.parse("file:///repo/notes");
    const workspace = createWorkspace(workspaceUri, [
      createFolder(gitFolder, { withGitRepository: true }),
      createFolder(nonGitFolder)
    ]);
    const session = createSession("s1", { workspace });
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      isMultiRoot: summary.isMultiRoot,
      folderCount: summary.folderCount,
      gitFolderCount: summary.gitFolderCount,
      nonGitFolderCount: summary.nonGitFolderCount
    }, {
      isMultiRoot: true,
      folderCount: 2,
      gitFolderCount: 1,
      nonGitFolderCount: 1
    });
  });
  test("recordFirstRequestTaskInfo is a no-op when the session is not tracked", () => {
    const session = createSession("s1");
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 3 });
    assert.strictEqual(tracker.isTracked(session.sessionId), false);
  });
  test("recordFirstRequestTaskInfo only records the first call per session", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: true, configuredTasksCount: 4 });
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 0 });
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: true,
      configuredTasksCount: 4
    });
  });
  test("recordFirstRequestTaskInfo persists across tracker instances", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    tracker.recordFirstRequestTaskInfo(session, { hasWorktreeCreatedTask: false, configuredTasksCount: 2 });
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    const summary = secondTracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: false,
      configuredTasksCount: 2
    });
  });
  test("summary reports task info as undefined when never recorded", () => {
    const session = createSession("s1");
    tracker.recordNewChatRequestSent(session);
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      hasWorktreeCreatedTask: summary.hasWorktreeCreatedTask,
      configuredTasksCount: summary.configuredTasksCount
    }, {
      hasWorktreeCreatedTask: void 0,
      configuredTasksCount: void 0
    });
  });
  test("incrementAndGetUserRequestCounters returns post-increment values per provider, workspace and total", () => {
    const workspaceA = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const workspaceB = createWorkspace(URI.parse("file:///ws/b"), [createFolder(URI.parse("file:///ws/b"))]);
    const a1 = createSession("a1", { providerId: "agenthost-first.example:1234", workspace: workspaceA });
    const a2 = createSession("a2", { providerId: "agenthost-second.example:5678", workspace: workspaceA });
    const b = createSession("b", { providerId: "default-copilot", workspace: workspaceB });
    const noWorkspace = createSession("n", { providerId: "agenthost-third.example:9012" });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a1), { userSessionsTotal: 1, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(a2), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(b), { userSessionsTotal: 3, userSessionsInWorkspace: 1, userSessionsForProvider: 1 });
    assert.deepStrictEqual(tracker.incrementAndGetUserRequestCounters(noWorkspace), { userSessionsTotal: 4, userSessionsInWorkspace: 0, userSessionsForProvider: 3 });
  });
  test("provider counters migrate raw provider IDs into bounded categories", () => {
    storage.store("agentSessions.telemetry.providerSessions", JSON.stringify({
      "agenthost-first.example:1234": 2,
      "agenthost-second.example:5678": 3,
      "default-copilot": 4
    }), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const remoteSession = createSession("remote", { providerId: "agenthost-third.example:9012" });
    const copilotSession = createSession("copilot", { providerId: "default-copilot" });
    assert.deepStrictEqual([
      tracker.incrementAndGetUserRequestCounters(remoteSession),
      tracker.getUserRequestCounters(copilotSession),
      JSON.parse(storage.get("agentSessions.telemetry.providerSessions", StorageScope.APPLICATION) ?? "")
    ], [
      { userSessionsTotal: 1, userSessionsInWorkspace: 0, userSessionsForProvider: 6 },
      { userSessionsTotal: 1, userSessionsInWorkspace: 0, userSessionsForProvider: 4 },
      { "remote-agent-host": 6, "default-copilot": 4 }
    ]);
  });
  test("summary includes the request counters as observed at finalize time", () => {
    const workspaceA = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const workspaceB = createWorkspace(URI.parse("file:///ws/b"), [createFolder(URI.parse("file:///ws/b"))]);
    const sessionToFinalize = createSession("a1", { providerId: "agenthost-first.example:1234", workspace: workspaceA });
    const otherSameWorkspace = createSession("a2", { providerId: "agenthost-second.example:5678", workspace: workspaceA });
    const otherDifferentEverything = createSession("b", { providerId: "default-copilot", workspace: workspaceB });
    tracker.recordNewChatRequestSent(sessionToFinalize);
    tracker.incrementAndGetUserRequestCounters(sessionToFinalize);
    tracker.incrementAndGetUserRequestCounters(otherSameWorkspace);
    tracker.incrementAndGetUserRequestCounters(otherDifferentEverything);
    const summary = tracker.finalize(sessionToFinalize.sessionId, "archived", sessionToFinalize);
    assert.ok(summary);
    assert.deepStrictEqual({
      userSessionsTotal: summary.userSessionsTotal,
      userSessionsInWorkspace: summary.userSessionsInWorkspace,
      userSessionsForProvider: summary.userSessionsForProvider
    }, {
      userSessionsTotal: 3,
      userSessionsInWorkspace: 2,
      userSessionsForProvider: 2
    });
  });
  test("request counters persist across tracker instances", () => {
    const workspace = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const session = createSession("a1", { providerId: "p1", workspace });
    tracker.incrementAndGetUserRequestCounters(session);
    tracker.incrementAndGetUserRequestCounters(session);
    const secondTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.deepStrictEqual(secondTracker.incrementAndGetUserRequestCounters(session), { userSessionsTotal: 3, userSessionsInWorkspace: 3, userSessionsForProvider: 3 });
  });
  test("getUserRequestCounters returns current values without incrementing", () => {
    const workspace = createWorkspace(URI.parse("file:///ws/a"), [createFolder(URI.parse("file:///ws/a"))]);
    const session = createSession("a1", { providerId: "p1", workspace });
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 0, userSessionsInWorkspace: 0, userSessionsForProvider: 0 });
    tracker.incrementAndGetUserRequestCounters(session);
    tracker.incrementAndGetUserRequestCounters(session);
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
    assert.deepStrictEqual(tracker.getUserRequestCounters(session), { userSessionsTotal: 2, userSessionsInWorkspace: 2, userSessionsForProvider: 2 });
  });
  test("summary reports zero request counters for an untouched provider/workspace", () => {
    const session = createSession("s1");
    tracker.bumpCounter(session, "commit");
    const summary = tracker.finalize(session.sessionId, "archived", session);
    assert.ok(summary);
    assert.deepStrictEqual({
      userSessionsTotal: summary.userSessionsTotal,
      userSessionsInWorkspace: summary.userSessionsInWorkspace,
      userSessionsForProvider: summary.userSessionsForProvider
    }, {
      userSessionsTotal: 0,
      userSessionsInWorkspace: 0,
      userSessionsForProvider: 0
    });
  });
  test("getTrackedIds returns ids of all tracked sessions", () => {
    const a = createSession("a");
    const b = createSession("b");
    tracker.recordNewChatRequestSent(a);
    tracker.bumpCounter(b, "commit");
    assert.deepStrictEqual(tracker.getTrackedIds().sort(), ["a", "b"]);
  });
  test("tracker treats corrupted storage as empty", () => {
    storage.store(SESSIONS_KEY, "{not valid json", StorageScope.APPLICATION, StorageTarget.MACHINE);
    const recoveredTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.deepStrictEqual(recoveredTracker.getTrackedIds(), []);
  });
  test("evicts the oldest entry when capacity is exceeded", () => {
    const now = Date.now();
    const stored = {};
    for (let i = 0; i < MAX_TRACKED_SESSIONS; i++) {
      stored[`existing-${i}`] = {
        providerId: "p",
        providerType: "t",
        sessionResourceUri: `session://existing-${i}`,
        workspaceUriString: "",
        isolationKind: "folder",
        hasGitRepository: false,
        isVirtualWorkspace: false,
        firstRequestSentInThisClient: false,
        hasWorktreeCreatedTask: void 0,
        configuredTasksCount: void 0,
        firstObservedAt: now + i,
        // existing-0 is oldest
        firstRequestSentAt: 0,
        appLaunchCountAtFirstObserved: 1,
        requestsSent: 0,
        chatCount: 0,
        feedbackAdded: 0,
        feedbackConverted: 0,
        feedbackReplyAdded: 0,
        feedbackSubmitted: 0,
        createPullRequest: 0,
        createDraftPullRequest: 0,
        updatePullRequest: 0,
        mergePullRequest: 0,
        checkoutPullRequest: 0,
        initializeRepository: 0,
        commit: 0,
        commitAndSync: 0,
        sessionRestored: 0,
        stickinessToggled: 0,
        maximizeToggled: 0,
        chatDeleted: 0,
        chatRenamed: 0,
        fixCIChecks: 0,
        taskRun: 0,
        filesChanged: 0,
        linesAdded: 0,
        linesDeleted: 0
      };
    }
    storage.store(SESSIONS_KEY, JSON.stringify(stored), StorageScope.APPLICATION, StorageTarget.MACHINE);
    const capTracker = disposables.add(new SessionsLifecycleTracker(storage));
    assert.strictEqual(capTracker.getTrackedIds().length, MAX_TRACKED_SESSIONS);
    const newSession = createSession("brand-new");
    capTracker.recordNewChatRequestSent(newSession);
    const ids = capTracker.getTrackedIds();
    assert.strictEqual(ids.length, MAX_TRACKED_SESSIONS);
    assert.strictEqual(ids.includes("brand-new"), true);
    assert.strictEqual(ids.includes("existing-0"), false, "oldest entry should have been evicted");
    assert.strictEqual(ids.includes("existing-1"), true, "second-oldest entry should still be tracked");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxzZXNzaW9uc1xcY29udHJpYlxcc2Vzc2lvbnNcXHRlc3RcXGJyb3dzZXJcXHNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgQ29kaWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2NvZGljb25zLmpzJztcbmltcG9ydCB7IGhhc2ggfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9oYXNoLmpzJztcbmltcG9ydCB7IGNvbnN0T2JzZXJ2YWJsZSwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBJbk1lbW9yeVN0b3JhZ2VTZXJ2aWNlLCBTdG9yYWdlU2NvcGUsIFN0b3JhZ2VUYXJnZXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9zdG9yYWdlL2NvbW1vbi9zdG9yYWdlLmpzJztcbmltcG9ydCB7IElDaGF0LCBJU2Vzc2lvbiwgSVNlc3Npb25DaGFuZ2VzU3VtbWFyeSwgSVNlc3Npb25GaWxlQ2hhbmdlLCBJU2Vzc2lvbkZvbGRlciwgSVNlc3Npb25Xb3Jrc3BhY2UsIFNlc3Npb25TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9zZXNzaW9ucy9jb21tb24vc2Vzc2lvbi5qcyc7XG5pbXBvcnQgeyBNQVhfVFJBQ0tFRF9TRVNTSU9OUywgU0VTU0lPTlNfS0VZLCBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIgfSBmcm9tICcuLi8uLi9icm93c2VyL3Nlc3Npb25zTGlmZWN5Y2xlVHJhY2tlci5qcyc7XG5pbXBvcnQgeyBUaGVtZUljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90aGVtYWJsZXMuanMnO1xuXG5pbnRlcmZhY2UgSUNyZWF0ZVNlc3Npb25PcHRpb25zIHtcblx0cHJvdmlkZXJJZD86IHN0cmluZztcblx0c2Vzc2lvblR5cGU/OiBzdHJpbmc7XG5cdHdvcmtzcGFjZT86IElTZXNzaW9uV29ya3NwYWNlO1xuXHRjaGFuZ2VzPzogcmVhZG9ubHkgSVNlc3Npb25GaWxlQ2hhbmdlW107XG5cdGNoYW5nZXNTdW1tYXJ5PzogSVNlc3Npb25DaGFuZ2VzU3VtbWFyeTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlU2Vzc2lvbihpZDogc3RyaW5nLCBvcHRzOiBJQ3JlYXRlU2Vzc2lvbk9wdGlvbnMgPSB7fSk6IElTZXNzaW9uIHtcblx0Y29uc3QgcHJvdmlkZXJJZCA9IG9wdHMucHJvdmlkZXJJZCA/PyAndGVzdC1wcm92aWRlcic7XG5cdGNvbnN0IHNlc3Npb25UeXBlID0gb3B0cy5zZXNzaW9uVHlwZSA/PyAndGVzdC10eXBlJztcblx0cmV0dXJuIHtcblx0XHRzZXNzaW9uSWQ6IGlkLFxuXHRcdHJlc291cmNlOiBVUkkucGFyc2UoYHNlc3Npb246Ly8ke2lkfWApLFxuXHRcdHByb3ZpZGVySWQsXG5cdFx0c2Vzc2lvblR5cGUsXG5cdFx0aWNvbjogQ29kaWNvbi5hY2NvdW50LFxuXHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKSxcblx0XHR3b3Jrc3BhY2U6IG9ic2VydmFibGVWYWx1ZShgd29ya3NwYWNlLSR7aWR9YCwgb3B0cy53b3Jrc3BhY2UpLFxuXHRcdHRpdGxlOiBvYnNlcnZhYmxlVmFsdWUoYHRpdGxlLSR7aWR9YCwgaWQpLFxuXHRcdHVwZGF0ZWRBdDogb2JzZXJ2YWJsZVZhbHVlKGB1cGRhdGVkQXQtJHtpZH1gLCBuZXcgRGF0ZSgpKSxcblx0XHRzdGF0dXM6IG9ic2VydmFibGVWYWx1ZShgc3RhdHVzLSR7aWR9YCwgU2Vzc2lvblN0YXR1cy5Db21wbGV0ZWQpLFxuXHRcdGNoYW5nZXNldHM6IG9ic2VydmFibGVWYWx1ZShgY2hhbmdlc2V0cy0ke2lkfWAsIFtdKSxcblx0XHRjaGFuZ2VzOiBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXMtJHtpZH1gLCBvcHRzLmNoYW5nZXMgPz8gW10pLFxuXHRcdGNoYW5nZXNTdW1tYXJ5OiBvcHRzLmNoYW5nZXNTdW1tYXJ5ICE9PSB1bmRlZmluZWQgPyBvYnNlcnZhYmxlVmFsdWUoYGNoYW5nZXNTdW1tYXJ5LSR7aWR9YCwgb3B0cy5jaGFuZ2VzU3VtbWFyeSBhcyBJU2Vzc2lvbkNoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkKSA6IHVuZGVmaW5lZCxcblx0XHRtb2RlbElkOiBvYnNlcnZhYmxlVmFsdWUoYG1vZGVsSWQtJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdG1vZGU6IG9ic2VydmFibGVWYWx1ZShgbW9kZS0ke2lkfWAsIHVuZGVmaW5lZCksXG5cdFx0bG9hZGluZzogb2JzZXJ2YWJsZVZhbHVlKGBsb2FkaW5nLSR7aWR9YCwgZmFsc2UpLFxuXHRcdGlzQXJjaGl2ZWQ6IG9ic2VydmFibGVWYWx1ZShgaXNBcmNoaXZlZC0ke2lkfWAsIGZhbHNlKSxcblx0XHRpc1JlYWQ6IG9ic2VydmFibGVWYWx1ZShgaXNSZWFkLSR7aWR9YCwgdHJ1ZSksXG5cdFx0ZGVzY3JpcHRpb246IG9ic2VydmFibGVWYWx1ZShgZGVzY3JpcHRpb24tJHtpZH1gLCB1bmRlZmluZWQpLFxuXHRcdGxhc3RUdXJuRW5kOiBvYnNlcnZhYmxlVmFsdWUoYGxhc3RUdXJuRW5kLSR7aWR9YCwgdW5kZWZpbmVkKSxcblx0XHRjaGF0czogb2JzZXJ2YWJsZVZhbHVlPHJlYWRvbmx5IElDaGF0W10+KGBjaGF0cy0ke2lkfWAsIFtdKSxcblx0XHRtYWluQ2hhdDogY29uc3RPYnNlcnZhYmxlPElDaGF0Pih1bmRlZmluZWQhKSxcblx0XHRjYXBhYmlsaXRpZXM6IGNvbnN0T2JzZXJ2YWJsZSh7IHN1cHBvcnRzTXVsdGlwbGVDaGF0czogZmFsc2UgfSksXG5cdH07XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVdvcmtzcGFjZSh1cmk6IFVSSSwgZm9sZGVyczogSVNlc3Npb25Gb2xkZXJbXSk6IElTZXNzaW9uV29ya3NwYWNlIHtcblx0cmV0dXJuIHtcblx0XHR1cmksXG5cdFx0bGFiZWw6ICd3cycsXG5cdFx0aWNvbjogVGhlbWVJY29uLmZyb21JZCgnZm9sZGVyJyksXG5cdFx0Zm9sZGVycyxcblx0XHRyZXF1aXJlc1dvcmtzcGFjZVRydXN0OiBmYWxzZSxcblx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHVyaS5zY2hlbWUgIT09ICdmaWxlJyxcblx0fTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRm9sZGVyKHVyaTogVVJJLCBvcHRzOiB7IHJlYWRvbmx5IHdvcmtUcmVlVXJpPzogVVJJOyByZWFkb25seSB3aXRoR2l0UmVwb3NpdG9yeT86IGJvb2xlYW4gfSA9IHt9KTogSVNlc3Npb25Gb2xkZXIge1xuXHRyZXR1cm4ge1xuXHRcdHJvb3Q6IHVyaSxcblx0XHR3b3JraW5nRGlyZWN0b3J5OiB1cmksXG5cdFx0bmFtZTogJ2ZvbGRlcicsXG5cdFx0ZGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHRnaXRSZXBvc2l0b3J5OiAob3B0cy53aXRoR2l0UmVwb3NpdG9yeSB8fCBvcHRzLndvcmtUcmVlVXJpKVxuXHRcdFx0PyB7XG5cdFx0XHRcdHVyaSxcblx0XHRcdFx0d29ya1RyZWVVcmk6IG9wdHMud29ya1RyZWVVcmksXG5cdFx0XHRcdGJhc2VCcmFuY2hOYW1lOiB1bmRlZmluZWQsXG5cdFx0XHRcdGdpdEh1YkluZm86IGNvbnN0T2JzZXJ2YWJsZSh1bmRlZmluZWQpLFxuXHRcdFx0fVxuXHRcdFx0OiB1bmRlZmluZWQsXG5cdH07XG59XG5cbnN1aXRlKCdTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXInLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblx0bGV0IHN0b3JhZ2U6IEluTWVtb3J5U3RvcmFnZVNlcnZpY2U7XG5cdGxldCB0cmFja2VyOiBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdHN0b3JhZ2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEluTWVtb3J5U3RvcmFnZVNlcnZpY2UoKSk7XG5cdFx0dHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyKHN0b3JhZ2UpKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhcnRzIHVudHJhY2tlZCB1bnRpbCBhIHVzZXIgaW50ZXJhY3Rpb24gaXMgcmVjb3JkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRyYWNrZXIuaXNUcmFja2VkKHNlc3Npb24uc2Vzc2lvbklkKSwgZmFsc2UpO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWxpemUgZW1pdHMgc3VtbWFyeSBhbmQgcmVtb3ZlcyB0cmFja2luZyBlbnRyeScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7IHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtZXhhbXBsZS5pbnRlcm5hbDoxMjM0JyB9KTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdmZWVkYmFja0FkZGVkJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZmVlZGJhY2tBZGRlZCcpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2NvbW1pdCcpO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5hZ2VudFNlc3Npb25JZCwgJzY0MGQ4N2U3NDFlNmFhNGM2NjlhODJhNGNkMzA0Nzg3OTYwNTEzYWInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucHJvdmlkZXJJZCwgJ3JlbW90ZS1hZ2VudC1ob3N0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLnByb3ZpZGVyVHlwZSwgJ3Rlc3QtdHlwZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5kb25lUmVhc29uLCAnYXJjaGl2ZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuZmVlZGJhY2tBZGRlZCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLmNvbW1pdCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1bW1hcnkhLmZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQsIHRydWUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzVHJhY2tlZChzZXNzaW9uLnNlc3Npb25JZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnZmluYWxpemUgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBzZXNzaW9uIGlzIG5vdCB0cmFja2VkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKCdkb2VzLW5vdC1leGlzdCcsICdkZWxldGVkUmVtb3RlbHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnc3RhdGUgcGVyc2lzdHMgYWNyb3NzIHRyYWNrZXIgaW5zdGFuY2VzIGFuZCBhcHAgbGF1bmNoIGNvdW50IGdyb3dzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2ZlZWRiYWNrQWRkZWQnKTtcblxuXHRcdGNvbnN0IHNlY29uZFRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlcihzdG9yYWdlKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kVHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gc2Vjb25kVHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5mZWVkYmFja0FkZGVkLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuYXBwTGF1bmNoZXNTaW5jZUZpcnN0T2JzZXJ2ZWQsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdjaGF0Q291bnQgaW5jcmVtZW50cyBvbmNlIHBlciByZWNvcmRSZXF1ZXN0U2VudCBjYWxsJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZmVlZGJhY2tBZGRlZCcpOyAvLyBidW1wQ291bnRlciBzaG91bGQgbm90IGFmZmVjdCBjaGF0Q291bnRcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEuY2hhdENvdW50LCAzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3VtbWFyeSEucmVxdWVzdHNTZW50LCAzKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0VHJhY2tlZEVudHJpZXMgcmV0dXJucyBzZXNzaW9uSWQgcGx1cyBwcm92aWRlcklkIGZvciBlYWNoIGVudHJ5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVTZXNzaW9uKCdhJywgeyBwcm92aWRlcklkOiAncHJvdmlkZXItYScgfSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVNlc3Npb24oJ2InLCB7IHByb3ZpZGVySWQ6ICdwcm92aWRlci1iJyB9KTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KGEpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoYiwgJ2NvbW1pdCcpO1xuXG5cdFx0Y29uc3QgZW50cmllcyA9IHRyYWNrZXIuZ2V0VHJhY2tlZEVudHJpZXMoKVxuXHRcdFx0Lm1hcChlID0+IGAke2UucHJvdmlkZXJJZH06JHtlLnNlc3Npb25JZH1gKVxuXHRcdFx0LnNvcnQoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW50cmllcywgWydwcm92aWRlci1hOmEnLCAncHJvdmlkZXItYjpiJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdsb2NhbCBhcmNoaXZlIHRoZW4gZGVmZXJyZWQgcmVtb3RlIHNpZ25hbCB5aWVsZHMgYSBzaW5nbGUgc3VtbWFyeScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblxuXHRcdGNvbnN0IGxvY2FsU3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXHRcdGFzc2VydC5vayhsb2NhbFN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChsb2NhbFN1bW1hcnkhLmRvbmVSZWFzb24sICdhcmNoaXZlZCcpO1xuXG5cdFx0Y29uc3QgZGVmZXJyZWRTdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkUmVtb3RlbHknLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVmZXJyZWRTdW1tYXJ5LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidW1wQ291bnRlciBjcmVhdGVzIGEgdHJhY2tpbmcgZW50cnkgZm9yIHByZXZpb3VzbHkgdW50cmFja2VkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnY29tbWl0Jyk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHJhY2tlci5pc1RyYWNrZWQoc2Vzc2lvbi5zZXNzaW9uSWQpLCB0cnVlKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5jb21taXQsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5yZXF1ZXN0c1NlbnQsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdW1tYXJ5IS5maXJzdFJlcXVlc3RTZW50SW5UaGlzQ2xpZW50LCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1bXBDb3VudGVyIGluY3JlbWVudHMgZGlzdGluY3QgY291bnRlciBrZXlzIGluZGVwZW5kZW50bHknLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdjaGF0UmVuYW1lZCcpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2NoYXRSZW5hbWVkJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAndGFza1J1bicpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ21lcmdlUHVsbFJlcXVlc3QnKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdmaXhDSUNoZWNrcycpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoc2Vzc2lvbiwgJ2ZpeENJQ2hlY2tzJyk7XG5cdFx0dHJhY2tlci5idW1wQ291bnRlcihzZXNzaW9uLCAnZml4Q0lDaGVja3MnKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRjaGF0UmVuYW1lZDogc3VtbWFyeSEuY2hhdFJlbmFtZWQsXG5cdFx0XHR0YXNrUnVuOiBzdW1tYXJ5IS50YXNrUnVuLFxuXHRcdFx0bWVyZ2VQdWxsUmVxdWVzdDogc3VtbWFyeSEubWVyZ2VQdWxsUmVxdWVzdCxcblx0XHRcdGZpeENJQ2hlY2tzOiBzdW1tYXJ5IS5maXhDSUNoZWNrcyxcblx0XHRcdGNvbW1pdDogc3VtbWFyeSEuY29tbWl0LFxuXHRcdH0sIHtcblx0XHRcdGNoYXRSZW5hbWVkOiAyLFxuXHRcdFx0dGFza1J1bjogMSxcblx0XHRcdG1lcmdlUHVsbFJlcXVlc3Q6IDEsXG5cdFx0XHRmaXhDSUNoZWNrczogMyxcblx0XHRcdGNvbW1pdDogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndXBkYXRlU2Vzc2lvblN0YXRlIGlzIGEgbm8tb3AgZm9yIHVudHJhY2tlZCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7IGNoYW5nZXM6IFt7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYScpLCBpbnNlcnRpb25zOiA1LCBkZWxldGlvbnM6IDEgfV0gfSk7XG5cblx0XHR0cmFja2VyLnVwZGF0ZVNlc3Npb25TdGF0ZShzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzVHJhY2tlZChzZXNzaW9uLnNlc3Npb25JZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgnY2hhbmdlc1N1bW1hcnkgb2JzZXJ2YWJsZSB0YWtlcyBwcmVjZWRlbmNlIG92ZXIgdGhlIGNoYW5nZXMgbGlzdCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7XG5cdFx0XHRjaGFuZ2VzOiBbXG5cdFx0XHRcdHsgbW9kaWZpZWRVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9hJyksIGluc2VydGlvbnM6IDUsIGRlbGV0aW9uczogMSB9LFxuXHRcdFx0XHR7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYicpLCBpbnNlcnRpb25zOiAyLCBkZWxldGlvbnM6IDMgfSxcblx0XHRcdF0sXG5cdFx0XHRjaGFuZ2VzU3VtbWFyeTogeyBmaWxlczogMTcsIGFkZGl0aW9uczogOTksIGRlbGV0aW9uczogODggfSxcblx0XHR9KTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblxuXHRcdGFzc2VydC5vayhzdW1tYXJ5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGVzQ2hhbmdlZDogc3VtbWFyeSEuZmlsZXNDaGFuZ2VkLFxuXHRcdFx0bGluZXNBZGRlZDogc3VtbWFyeSEubGluZXNBZGRlZCxcblx0XHRcdGxpbmVzRGVsZXRlZDogc3VtbWFyeSEubGluZXNEZWxldGVkLFxuXHRcdH0sIHtcblx0XHRcdGZpbGVzQ2hhbmdlZDogMTcsXG5cdFx0XHRsaW5lc0FkZGVkOiA5OSxcblx0XHRcdGxpbmVzRGVsZXRlZDogODgsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gYWdncmVnYXRpbmcgY2hhbmdlcyB3aGVuIGNoYW5nZXNTdW1tYXJ5IGlzIGFic2VudCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnLCB7XG5cdFx0XHRjaGFuZ2VzOiBbXG5cdFx0XHRcdHsgbW9kaWZpZWRVcmk6IFVSSS5wYXJzZSgnZmlsZTovLy9hJyksIGluc2VydGlvbnM6IDUsIGRlbGV0aW9uczogMSB9LFxuXHRcdFx0XHR7IG1vZGlmaWVkVXJpOiBVUkkucGFyc2UoJ2ZpbGU6Ly8vYicpLCBpbnNlcnRpb25zOiAyLCBkZWxldGlvbnM6IDMgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaWxlc0NoYW5nZWQ6IHN1bW1hcnkhLmZpbGVzQ2hhbmdlZCxcblx0XHRcdGxpbmVzQWRkZWQ6IHN1bW1hcnkhLmxpbmVzQWRkZWQsXG5cdFx0XHRsaW5lc0RlbGV0ZWQ6IHN1bW1hcnkhLmxpbmVzRGVsZXRlZCxcblx0XHR9LCB7XG5cdFx0XHRmaWxlc0NoYW5nZWQ6IDIsXG5cdFx0XHRsaW5lc0FkZGVkOiA3LFxuXHRcdFx0bGluZXNEZWxldGVkOiA0LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdW1tYXJ5IGRlcml2ZXMgd29ya3NwYWNlIGZpZWxkcyBmcm9tIHRoZSBzZXNzaW9uIHdvcmtzcGFjZSBhdCBmaXJzdCBvYnNlcnZhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VVcmkgPSBVUkkucGFyc2UoJ3ZzY29kZS1yZW1vdGU6Ly9ob3N0L3JlcG8nKTtcblx0XHRjb25zdCByZXBvVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCBbXG5cdFx0XHRjcmVhdGVGb2xkZXIocmVwb1VyaSwgeyB3b3JrVHJlZVVyaTogVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vLmdpdC93b3JrdHJlZXMvZmVhdHVyZScpIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIHsgd29ya3NwYWNlIH0pO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNvbGF0aW9uS2luZDogc3VtbWFyeSEuaXNvbGF0aW9uS2luZCxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHN1bW1hcnkhLmhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHN1bW1hcnkhLmlzVmlydHVhbFdvcmtzcGFjZSxcblx0XHRcdHdvcmtzcGFjZUhhc2g6IHN1bW1hcnkhLndvcmtzcGFjZUhhc2gsXG5cdFx0fSwge1xuXHRcdFx0aXNvbGF0aW9uS2luZDogJ3dvcmt0cmVlJyxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHRydWUsXG5cdFx0XHR3b3Jrc3BhY2VIYXNoOiBoYXNoKHdvcmtzcGFjZVVyaS50b1N0cmluZygpKS50b1N0cmluZygxNiksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcnkgcmVwb3J0cyBmb2xkZXIgaXNvbGF0aW9uIGZvciBhIHBsYWluIGZpbGUgd29ya3NwYWNlIHdpdGggbm8gd29ya3RyZWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgd29ya3NwYWNlVXJpID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCBbXG5cdFx0XHRjcmVhdGVGb2xkZXIod29ya3NwYWNlVXJpLCB7IHdpdGhHaXRSZXBvc2l0b3J5OiB0cnVlIH0pLFxuXHRcdF0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScsIHsgd29ya3NwYWNlIH0pO1xuXG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvbi5zZXNzaW9uSWQsICdhcmNoaXZlZCcsIHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aXNvbGF0aW9uS2luZDogc3VtbWFyeSEuaXNvbGF0aW9uS2luZCxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHN1bW1hcnkhLmhhc0dpdFJlcG9zaXRvcnksXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IHN1bW1hcnkhLmlzVmlydHVhbFdvcmtzcGFjZSxcblx0XHR9LCB7XG5cdFx0XHRpc29sYXRpb25LaW5kOiAnZm9sZGVyJyxcblx0XHRcdGhhc0dpdFJlcG9zaXRvcnk6IHRydWUsXG5cdFx0XHRpc1ZpcnR1YWxXb3Jrc3BhY2U6IGZhbHNlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzdW1tYXJ5IHJlcG9ydHMgdGhlIG11bHRpLXJvb3Qgd29ya3NwYWNlIHRvcG9sb2d5IGNhcHR1cmVkIGF0IGZpcnN0IG9ic2VydmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZVVyaSA9IFVSSS5wYXJzZSgnZmlsZTovLy9yZXBvJyk7XG5cdFx0Y29uc3QgZ2l0Rm9sZGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vYXBwJyk7XG5cdFx0Y29uc3Qgbm9uR2l0Rm9sZGVyID0gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8vbm90ZXMnKTtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2Uod29ya3NwYWNlVXJpLCBbXG5cdFx0XHRjcmVhdGVGb2xkZXIoZ2l0Rm9sZGVyLCB7IHdpdGhHaXRSZXBvc2l0b3J5OiB0cnVlIH0pLFxuXHRcdFx0Y3JlYXRlRm9sZGVyKG5vbkdpdEZvbGRlciksXG5cdFx0XSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJywgeyB3b3Jrc3BhY2UgfSk7XG5cblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpc011bHRpUm9vdDogc3VtbWFyeSEuaXNNdWx0aVJvb3QsXG5cdFx0XHRmb2xkZXJDb3VudDogc3VtbWFyeSEuZm9sZGVyQ291bnQsXG5cdFx0XHRnaXRGb2xkZXJDb3VudDogc3VtbWFyeSEuZ2l0Rm9sZGVyQ291bnQsXG5cdFx0XHRub25HaXRGb2xkZXJDb3VudDogc3VtbWFyeSEubm9uR2l0Rm9sZGVyQ291bnQsXG5cdFx0fSwge1xuXHRcdFx0aXNNdWx0aVJvb3Q6IHRydWUsXG5cdFx0XHRmb2xkZXJDb3VudDogMixcblx0XHRcdGdpdEZvbGRlckNvdW50OiAxLFxuXHRcdFx0bm9uR2l0Rm9sZGVyQ291bnQ6IDEsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvIGlzIGEgbm8tb3Agd2hlbiB0aGUgc2Vzc2lvbiBpcyBub3QgdHJhY2tlZCcsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblxuXHRcdHRyYWNrZXIucmVjb3JkRmlyc3RSZXF1ZXN0VGFza0luZm8oc2Vzc2lvbiwgeyBoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiB0cnVlLCBjb25maWd1cmVkVGFza3NDb3VudDogMyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0cmFja2VyLmlzVHJhY2tlZChzZXNzaW9uLnNlc3Npb25JZCksIGZhbHNlKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb3JkRmlyc3RSZXF1ZXN0VGFza0luZm8gb25seSByZWNvcmRzIHRoZSBmaXJzdCBjYWxsIHBlciBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdzMScpO1xuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb24pO1xuXG5cdFx0dHJhY2tlci5yZWNvcmRGaXJzdFJlcXVlc3RUYXNrSW5mbyhzZXNzaW9uLCB7IGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IHRydWUsIGNvbmZpZ3VyZWRUYXNrc0NvdW50OiA0IH0pO1xuXHRcdHRyYWNrZXIucmVjb3JkRmlyc3RSZXF1ZXN0VGFza0luZm8oc2Vzc2lvbiwgeyBoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiBmYWxzZSwgY29uZmlndXJlZFRhc2tzQ291bnQ6IDAgfSk7XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogc3VtbWFyeSEuaGFzV29ya3RyZWVDcmVhdGVkVGFzayxcblx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiBzdW1tYXJ5IS5jb25maWd1cmVkVGFza3NDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiB0cnVlLFxuXHRcdFx0Y29uZmlndXJlZFRhc2tzQ291bnQ6IDQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvIHBlcnNpc3RzIGFjcm9zcyB0cmFja2VyIGluc3RhbmNlcycsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLnJlY29yZE5ld0NoYXRSZXF1ZXN0U2VudChzZXNzaW9uKTtcblx0XHR0cmFja2VyLnJlY29yZEZpcnN0UmVxdWVzdFRhc2tJbmZvKHNlc3Npb24sIHsgaGFzV29ya3RyZWVDcmVhdGVkVGFzazogZmFsc2UsIGNvbmZpZ3VyZWRUYXNrc0NvdW50OiAyIH0pO1xuXG5cdFx0Y29uc3Qgc2Vjb25kVHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyKHN0b3JhZ2UpKTtcblx0XHRjb25zdCBzdW1tYXJ5ID0gc2Vjb25kVHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiBzdW1tYXJ5IS5oYXNXb3JrdHJlZUNyZWF0ZWRUYXNrLFxuXHRcdFx0Y29uZmlndXJlZFRhc2tzQ291bnQ6IHN1bW1hcnkhLmNvbmZpZ3VyZWRUYXNrc0NvdW50LFxuXHRcdH0sIHtcblx0XHRcdGhhc1dvcmt0cmVlQ3JlYXRlZFRhc2s6IGZhbHNlLFxuXHRcdFx0Y29uZmlndXJlZFRhc2tzQ291bnQ6IDIsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1bW1hcnkgcmVwb3J0cyB0YXNrIGluZm8gYXMgdW5kZWZpbmVkIHdoZW4gbmV2ZXIgcmVjb3JkZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3MxJyk7XG5cdFx0dHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQoc2Vzc2lvbik7XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gdHJhY2tlci5maW5hbGl6ZShzZXNzaW9uLnNlc3Npb25JZCwgJ2FyY2hpdmVkJywgc2Vzc2lvbik7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0aGFzV29ya3RyZWVDcmVhdGVkVGFzazogc3VtbWFyeSEuaGFzV29ya3RyZWVDcmVhdGVkVGFzayxcblx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiBzdW1tYXJ5IS5jb25maWd1cmVkVGFza3NDb3VudCxcblx0XHR9LCB7XG5cdFx0XHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiB1bmRlZmluZWQsXG5cdFx0XHRjb25maWd1cmVkVGFza3NDb3VudDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzIHJldHVybnMgcG9zdC1pbmNyZW1lbnQgdmFsdWVzIHBlciBwcm92aWRlciwgd29ya3NwYWNlIGFuZCB0b3RhbCcsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2VBID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9hJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSldKTtcblx0XHRjb25zdCB3b3Jrc3BhY2VCID0gY3JlYXRlV29ya3NwYWNlKFVSSS5wYXJzZSgnZmlsZTovLy93cy9iJyksIFtjcmVhdGVGb2xkZXIoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2InKSldKTtcblx0XHRjb25zdCBhMSA9IGNyZWF0ZVNlc3Npb24oJ2ExJywgeyBwcm92aWRlcklkOiAnYWdlbnRob3N0LWZpcnN0LmV4YW1wbGU6MTIzNCcsIHdvcmtzcGFjZTogd29ya3NwYWNlQSB9KTtcblx0XHRjb25zdCBhMiA9IGNyZWF0ZVNlc3Npb24oJ2EyJywgeyBwcm92aWRlcklkOiAnYWdlbnRob3N0LXNlY29uZC5leGFtcGxlOjU2NzgnLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZUEgfSk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVNlc3Npb24oJ2InLCB7IHByb3ZpZGVySWQ6ICdkZWZhdWx0LWNvcGlsb3QnLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZUIgfSk7XG5cdFx0Y29uc3Qgbm9Xb3Jrc3BhY2UgPSBjcmVhdGVTZXNzaW9uKCduJywgeyBwcm92aWRlcklkOiAnYWdlbnRob3N0LXRoaXJkLmV4YW1wbGU6OTAxMicgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhhMSksIHsgdXNlclNlc3Npb25zVG90YWw6IDEsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAxLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhhMiksIHsgdXNlclNlc3Npb25zVG90YWw6IDIsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAyLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMiB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhiKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogMywgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDEsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAxIH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKG5vV29ya3NwYWNlKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogNCwgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDAsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAzIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwcm92aWRlciBjb3VudGVycyBtaWdyYXRlIHJhdyBwcm92aWRlciBJRHMgaW50byBib3VuZGVkIGNhdGVnb3JpZXMnLCAoKSA9PiB7XG5cdFx0c3RvcmFnZS5zdG9yZSgnYWdlbnRTZXNzaW9ucy50ZWxlbWV0cnkucHJvdmlkZXJTZXNzaW9ucycsIEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdCdhZ2VudGhvc3QtZmlyc3QuZXhhbXBsZToxMjM0JzogMixcblx0XHRcdCdhZ2VudGhvc3Qtc2Vjb25kLmV4YW1wbGU6NTY3OCc6IDMsXG5cdFx0XHQnZGVmYXVsdC1jb3BpbG90JzogNCxcblx0XHR9KSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgcmVtb3RlU2Vzc2lvbiA9IGNyZWF0ZVNlc3Npb24oJ3JlbW90ZScsIHsgcHJvdmlkZXJJZDogJ2FnZW50aG9zdC10aGlyZC5leGFtcGxlOjkwMTInIH0pO1xuXHRcdGNvbnN0IGNvcGlsb3RTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignY29waWxvdCcsIHsgcHJvdmlkZXJJZDogJ2RlZmF1bHQtY29waWxvdCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFtcblx0XHRcdHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhyZW1vdGVTZXNzaW9uKSxcblx0XHRcdHRyYWNrZXIuZ2V0VXNlclJlcXVlc3RDb3VudGVycyhjb3BpbG90U2Vzc2lvbiksXG5cdFx0XHRKU09OLnBhcnNlKHN0b3JhZ2UuZ2V0KCdhZ2VudFNlc3Npb25zLnRlbGVtZXRyeS5wcm92aWRlclNlc3Npb25zJywgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OKSA/PyAnJyksXG5cdFx0XSwgW1xuXHRcdFx0eyB1c2VyU2Vzc2lvbnNUb3RhbDogMSwgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDAsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiA2IH0sXG5cdFx0XHR7IHVzZXJTZXNzaW9uc1RvdGFsOiAxLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMCwgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDQgfSxcblx0XHRcdHsgJ3JlbW90ZS1hZ2VudC1ob3N0JzogNiwgJ2RlZmF1bHQtY29waWxvdCc6IDQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3VtbWFyeSBpbmNsdWRlcyB0aGUgcmVxdWVzdCBjb3VudGVycyBhcyBvYnNlcnZlZCBhdCBmaW5hbGl6ZSB0aW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IHdvcmtzcGFjZUEgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSwgW2NyZWF0ZUZvbGRlcihVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYScpKV0pO1xuXHRcdGNvbnN0IHdvcmtzcGFjZUIgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2InKSwgW2NyZWF0ZUZvbGRlcihVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYicpKV0pO1xuXHRcdGNvbnN0IHNlc3Npb25Ub0ZpbmFsaXplID0gY3JlYXRlU2Vzc2lvbignYTEnLCB7IHByb3ZpZGVySWQ6ICdhZ2VudGhvc3QtZmlyc3QuZXhhbXBsZToxMjM0Jywgd29ya3NwYWNlOiB3b3Jrc3BhY2VBIH0pO1xuXHRcdGNvbnN0IG90aGVyU2FtZVdvcmtzcGFjZSA9IGNyZWF0ZVNlc3Npb24oJ2EyJywgeyBwcm92aWRlcklkOiAnYWdlbnRob3N0LXNlY29uZC5leGFtcGxlOjU2NzgnLCB3b3Jrc3BhY2U6IHdvcmtzcGFjZUEgfSk7XG5cdFx0Y29uc3Qgb3RoZXJEaWZmZXJlbnRFdmVyeXRoaW5nID0gY3JlYXRlU2Vzc2lvbignYicsIHsgcHJvdmlkZXJJZDogJ2RlZmF1bHQtY29waWxvdCcsIHdvcmtzcGFjZTogd29ya3NwYWNlQiB9KTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KHNlc3Npb25Ub0ZpbmFsaXplKTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvblRvRmluYWxpemUpO1xuXHRcdHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhvdGhlclNhbWVXb3Jrc3BhY2UpO1xuXHRcdHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhvdGhlckRpZmZlcmVudEV2ZXJ5dGhpbmcpO1xuXG5cdFx0Y29uc3Qgc3VtbWFyeSA9IHRyYWNrZXIuZmluYWxpemUoc2Vzc2lvblRvRmluYWxpemUuc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uVG9GaW5hbGl6ZSk7XG5cdFx0YXNzZXJ0Lm9rKHN1bW1hcnkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dXNlclNlc3Npb25zVG90YWw6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc1RvdGFsLFxuXHRcdFx0dXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc0luV29ya3NwYWNlLFxuXHRcdFx0dXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IHN1bW1hcnkhLnVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyLFxuXHRcdH0sIHtcblx0XHRcdHVzZXJTZXNzaW9uc1RvdGFsOiAzLFxuXHRcdFx0dXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDIsXG5cdFx0XHR1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMixcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVxdWVzdCBjb3VudGVycyBwZXJzaXN0IGFjcm9zcyB0cmFja2VyIGluc3RhbmNlcycsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSwgW2NyZWF0ZUZvbGRlcihVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYScpKV0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdhMScsIHsgcHJvdmlkZXJJZDogJ3AxJywgd29ya3NwYWNlIH0pO1xuXHRcdHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhzZXNzaW9uKTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbik7XG5cblx0XHRjb25zdCBzZWNvbmRUcmFja2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uc0xpZmVjeWNsZVRyYWNrZXIoc3RvcmFnZSkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kVHJhY2tlci5pbmNyZW1lbnRBbmRHZXRVc2VyUmVxdWVzdENvdW50ZXJzKHNlc3Npb24pLCB7IHVzZXJTZXNzaW9uc1RvdGFsOiAzLCB1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMywgdXNlclNlc3Npb25zRm9yUHJvdmlkZXI6IDMgfSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFVzZXJSZXF1ZXN0Q291bnRlcnMgcmV0dXJucyBjdXJyZW50IHZhbHVlcyB3aXRob3V0IGluY3JlbWVudGluZycsICgpID0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBjcmVhdGVXb3Jrc3BhY2UoVVJJLnBhcnNlKCdmaWxlOi8vL3dzL2EnKSwgW2NyZWF0ZUZvbGRlcihVUkkucGFyc2UoJ2ZpbGU6Ly8vd3MvYScpKV0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBjcmVhdGVTZXNzaW9uKCdhMScsIHsgcHJvdmlkZXJJZDogJ3AxJywgd29ya3NwYWNlIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFja2VyLmdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbiksIHsgdXNlclNlc3Npb25zVG90YWw6IDAsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAwLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMCB9KTtcblxuXHRcdHRyYWNrZXIuaW5jcmVtZW50QW5kR2V0VXNlclJlcXVlc3RDb3VudGVycyhzZXNzaW9uKTtcblx0XHR0cmFja2VyLmluY3JlbWVudEFuZEdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRyYWNrZXIuZ2V0VXNlclJlcXVlc3RDb3VudGVycyhzZXNzaW9uKSwgeyB1c2VyU2Vzc2lvbnNUb3RhbDogMiwgdXNlclNlc3Npb25zSW5Xb3Jrc3BhY2U6IDIsIHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAyIH0pO1xuXHRcdC8vIFJlcGVhdGVkIHJlYWRzIGRvIG5vdCBtdXRhdGUgc3RhdGUuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFja2VyLmdldFVzZXJSZXF1ZXN0Q291bnRlcnMoc2Vzc2lvbiksIHsgdXNlclNlc3Npb25zVG90YWw6IDIsIHVzZXJTZXNzaW9uc0luV29ya3NwYWNlOiAyLCB1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogMiB9KTtcblx0fSk7XG5cblx0dGVzdCgnc3VtbWFyeSByZXBvcnRzIHplcm8gcmVxdWVzdCBjb3VudGVycyBmb3IgYW4gdW50b3VjaGVkIHByb3ZpZGVyL3dvcmtzcGFjZScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignczEnKTtcblx0XHR0cmFja2VyLmJ1bXBDb3VudGVyKHNlc3Npb24sICdjb21taXQnKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSB0cmFja2VyLmZpbmFsaXplKHNlc3Npb24uc2Vzc2lvbklkLCAnYXJjaGl2ZWQnLCBzZXNzaW9uKTtcblx0XHRhc3NlcnQub2soc3VtbWFyeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR1c2VyU2Vzc2lvbnNUb3RhbDogc3VtbWFyeSEudXNlclNlc3Npb25zVG90YWwsXG5cdFx0XHR1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogc3VtbWFyeSEudXNlclNlc3Npb25zSW5Xb3Jrc3BhY2UsXG5cdFx0XHR1c2VyU2Vzc2lvbnNGb3JQcm92aWRlcjogc3VtbWFyeSEudXNlclNlc3Npb25zRm9yUHJvdmlkZXIsXG5cdFx0fSwge1xuXHRcdFx0dXNlclNlc3Npb25zVG90YWw6IDAsXG5cdFx0XHR1c2VyU2Vzc2lvbnNJbldvcmtzcGFjZTogMCxcblx0XHRcdHVzZXJTZXNzaW9uc0ZvclByb3ZpZGVyOiAwLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRUcmFja2VkSWRzIHJldHVybnMgaWRzIG9mIGFsbCB0cmFja2VkIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IGEgPSBjcmVhdGVTZXNzaW9uKCdhJyk7XG5cdFx0Y29uc3QgYiA9IGNyZWF0ZVNlc3Npb24oJ2InKTtcblxuXHRcdHRyYWNrZXIucmVjb3JkTmV3Q2hhdFJlcXVlc3RTZW50KGEpO1xuXHRcdHRyYWNrZXIuYnVtcENvdW50ZXIoYiwgJ2NvbW1pdCcpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0cmFja2VyLmdldFRyYWNrZWRJZHMoKS5zb3J0KCksIFsnYScsICdiJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCd0cmFja2VyIHRyZWF0cyBjb3JydXB0ZWQgc3RvcmFnZSBhcyBlbXB0eScsICgpID0+IHtcblx0XHRzdG9yYWdlLnN0b3JlKFNFU1NJT05TX0tFWSwgJ3tub3QgdmFsaWQganNvbicsIFN0b3JhZ2VTY29wZS5BUFBMSUNBVElPTiwgU3RvcmFnZVRhcmdldC5NQUNISU5FKTtcblxuXHRcdGNvbnN0IHJlY292ZXJlZFRyYWNrZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFNlc3Npb25zTGlmZWN5Y2xlVHJhY2tlcihzdG9yYWdlKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlY292ZXJlZFRyYWNrZXIuZ2V0VHJhY2tlZElkcygpLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2V2aWN0cyB0aGUgb2xkZXN0IGVudHJ5IHdoZW4gY2FwYWNpdHkgaXMgZXhjZWVkZWQnLCAoKSA9PiB7XG5cdFx0Ly8gUHJlLXBvcHVsYXRlIHN0b3JhZ2Ugd2l0aCBNQVhfVFJBQ0tFRF9TRVNTSU9OUyBlbnRyaWVzOyB0aGUgb2xkZXN0XG5cdFx0Ly8gZW50cnkgaGFzIHRoZSBzbWFsbGVzdCBmaXJzdE9ic2VydmVkQXQgc28gaXQgc2hvdWxkIGJlIGV2aWN0ZWQgd2hlblxuXHRcdC8vIG9uZSBtb3JlIHNlc3Npb24gaXMgYWRkZWQuXG5cdFx0Y29uc3Qgbm93ID0gRGF0ZS5ub3coKTtcblx0XHRjb25zdCBzdG9yZWQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0ge307XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBNQVhfVFJBQ0tFRF9TRVNTSU9OUzsgaSsrKSB7XG5cdFx0XHRzdG9yZWRbYGV4aXN0aW5nLSR7aX1gXSA9IHtcblx0XHRcdFx0cHJvdmlkZXJJZDogJ3AnLFxuXHRcdFx0XHRwcm92aWRlclR5cGU6ICd0Jyxcblx0XHRcdFx0c2Vzc2lvblJlc291cmNlVXJpOiBgc2Vzc2lvbjovL2V4aXN0aW5nLSR7aX1gLFxuXHRcdFx0XHR3b3Jrc3BhY2VVcmlTdHJpbmc6ICcnLFxuXHRcdFx0XHRpc29sYXRpb25LaW5kOiAnZm9sZGVyJyxcblx0XHRcdFx0aGFzR2l0UmVwb3NpdG9yeTogZmFsc2UsXG5cdFx0XHRcdGlzVmlydHVhbFdvcmtzcGFjZTogZmFsc2UsXG5cdFx0XHRcdGZpcnN0UmVxdWVzdFNlbnRJblRoaXNDbGllbnQ6IGZhbHNlLFxuXHRcdFx0XHRoYXNXb3JrdHJlZUNyZWF0ZWRUYXNrOiB1bmRlZmluZWQsXG5cdFx0XHRcdGNvbmZpZ3VyZWRUYXNrc0NvdW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdGZpcnN0T2JzZXJ2ZWRBdDogbm93ICsgaSwgLy8gZXhpc3RpbmctMCBpcyBvbGRlc3Rcblx0XHRcdFx0Zmlyc3RSZXF1ZXN0U2VudEF0OiAwLFxuXHRcdFx0XHRhcHBMYXVuY2hDb3VudEF0Rmlyc3RPYnNlcnZlZDogMSxcblx0XHRcdFx0cmVxdWVzdHNTZW50OiAwLCBjaGF0Q291bnQ6IDAsXG5cdFx0XHRcdGZlZWRiYWNrQWRkZWQ6IDAsIGZlZWRiYWNrQ29udmVydGVkOiAwLCBmZWVkYmFja1JlcGx5QWRkZWQ6IDAsIGZlZWRiYWNrU3VibWl0dGVkOiAwLFxuXHRcdFx0XHRjcmVhdGVQdWxsUmVxdWVzdDogMCwgY3JlYXRlRHJhZnRQdWxsUmVxdWVzdDogMCwgdXBkYXRlUHVsbFJlcXVlc3Q6IDAsIG1lcmdlUHVsbFJlcXVlc3Q6IDAsIGNoZWNrb3V0UHVsbFJlcXVlc3Q6IDAsXG5cdFx0XHRcdGluaXRpYWxpemVSZXBvc2l0b3J5OiAwLCBjb21taXQ6IDAsIGNvbW1pdEFuZFN5bmM6IDAsXG5cdFx0XHRcdHNlc3Npb25SZXN0b3JlZDogMCwgc3RpY2tpbmVzc1RvZ2dsZWQ6IDAsIG1heGltaXplVG9nZ2xlZDogMCxcblx0XHRcdFx0Y2hhdERlbGV0ZWQ6IDAsIGNoYXRSZW5hbWVkOiAwLCBmaXhDSUNoZWNrczogMCwgdGFza1J1bjogMCxcblx0XHRcdFx0ZmlsZXNDaGFuZ2VkOiAwLCBsaW5lc0FkZGVkOiAwLCBsaW5lc0RlbGV0ZWQ6IDAsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRzdG9yYWdlLnN0b3JlKFNFU1NJT05TX0tFWSwgSlNPTi5zdHJpbmdpZnkoc3RvcmVkKSwgU3RvcmFnZVNjb3BlLkFQUExJQ0FUSU9OLCBTdG9yYWdlVGFyZ2V0Lk1BQ0hJTkUpO1xuXG5cdFx0Y29uc3QgY2FwVHJhY2tlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgU2Vzc2lvbnNMaWZlY3ljbGVUcmFja2VyKHN0b3JhZ2UpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2FwVHJhY2tlci5nZXRUcmFja2VkSWRzKCkubGVuZ3RoLCBNQVhfVFJBQ0tFRF9TRVNTSU9OUyk7XG5cblx0XHRjb25zdCBuZXdTZXNzaW9uID0gY3JlYXRlU2Vzc2lvbignYnJhbmQtbmV3Jyk7XG5cdFx0Y2FwVHJhY2tlci5yZWNvcmROZXdDaGF0UmVxdWVzdFNlbnQobmV3U2Vzc2lvbik7XG5cblx0XHRjb25zdCBpZHMgPSBjYXBUcmFja2VyLmdldFRyYWNrZWRJZHMoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRzLmxlbmd0aCwgTUFYX1RSQUNLRURfU0VTU0lPTlMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZHMuaW5jbHVkZXMoJ2JyYW5kLW5ldycpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaWRzLmluY2x1ZGVzKCdleGlzdGluZy0wJyksIGZhbHNlLCAnb2xkZXN0IGVudHJ5IHNob3VsZCBoYXZlIGJlZW4gZXZpY3RlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpZHMuaW5jbHVkZXMoJ2V4aXN0aW5nLTEnKSwgdHJ1ZSwgJ3NlY29uZC1vbGRlc3QgZW50cnkgc2hvdWxkIHN0aWxsIGJlIHRyYWNrZWQnKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLGVBQWU7QUFDeEIsU0FBUyxZQUFZO0FBQ3JCLFNBQVMsaUJBQWlCLHVCQUF1QjtBQUNqRCxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyx3QkFBd0IsY0FBYyxxQkFBcUI7QUFDcEUsU0FBeUcscUJBQXFCO0FBQzlILFNBQVMsc0JBQXNCLGNBQWMsZ0NBQWdDO0FBQzdFLFNBQVMsaUJBQWlCO0FBVTFCLFNBQVMsY0FBYyxJQUFZLE9BQThCLENBQUMsR0FBYTtBQUM5RSxRQUFNLGFBQWEsS0FBSyxjQUFjO0FBQ3RDLFFBQU0sY0FBYyxLQUFLLGVBQWU7QUFDeEMsU0FBTztBQUFBLElBQ04sV0FBVztBQUFBLElBQ1gsVUFBVSxJQUFJLE1BQU0sYUFBYSxFQUFFLEVBQUU7QUFBQSxJQUNyQztBQUFBLElBQ0E7QUFBQSxJQUNBLE1BQU0sUUFBUTtBQUFBLElBQ2QsV0FBVyxvQkFBSSxLQUFLO0FBQUEsSUFDcEIsV0FBVyxnQkFBZ0IsYUFBYSxFQUFFLElBQUksS0FBSyxTQUFTO0FBQUEsSUFDNUQsT0FBTyxnQkFBZ0IsU0FBUyxFQUFFLElBQUksRUFBRTtBQUFBLElBQ3hDLFdBQVcsZ0JBQWdCLGFBQWEsRUFBRSxJQUFJLG9CQUFJLEtBQUssQ0FBQztBQUFBLElBQ3hELFFBQVEsZ0JBQWdCLFVBQVUsRUFBRSxJQUFJLGNBQWMsU0FBUztBQUFBLElBQy9ELFlBQVksZ0JBQWdCLGNBQWMsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUFBLElBQ2xELFNBQVMsZ0JBQWdCLFdBQVcsRUFBRSxJQUFJLEtBQUssV0FBVyxDQUFDLENBQUM7QUFBQSxJQUM1RCxnQkFBZ0IsS0FBSyxtQkFBbUIsU0FBWSxnQkFBZ0Isa0JBQWtCLEVBQUUsSUFBSSxLQUFLLGNBQW9ELElBQUk7QUFBQSxJQUN6SixTQUFTLGdCQUFnQixXQUFXLEVBQUUsSUFBSSxNQUFTO0FBQUEsSUFDbkQsTUFBTSxnQkFBZ0IsUUFBUSxFQUFFLElBQUksTUFBUztBQUFBLElBQzdDLFNBQVMsZ0JBQWdCLFdBQVcsRUFBRSxJQUFJLEtBQUs7QUFBQSxJQUMvQyxZQUFZLGdCQUFnQixjQUFjLEVBQUUsSUFBSSxLQUFLO0FBQUEsSUFDckQsUUFBUSxnQkFBZ0IsVUFBVSxFQUFFLElBQUksSUFBSTtBQUFBLElBQzVDLGFBQWEsZ0JBQWdCLGVBQWUsRUFBRSxJQUFJLE1BQVM7QUFBQSxJQUMzRCxhQUFhLGdCQUFnQixlQUFlLEVBQUUsSUFBSSxNQUFTO0FBQUEsSUFDM0QsT0FBTyxnQkFBa0MsU0FBUyxFQUFFLElBQUksQ0FBQyxDQUFDO0FBQUEsSUFDMUQsVUFBVSxnQkFBdUIsTUFBVTtBQUFBLElBQzNDLGNBQWMsZ0JBQWdCLEVBQUUsdUJBQXVCLE1BQU0sQ0FBQztBQUFBLEVBQy9EO0FBQ0Q7QUFFQSxTQUFTLGdCQUFnQixLQUFVLFNBQThDO0FBQ2hGLFNBQU87QUFBQSxJQUNOO0FBQUEsSUFDQSxPQUFPO0FBQUEsSUFDUCxNQUFNLFVBQVUsT0FBTyxRQUFRO0FBQUEsSUFDL0I7QUFBQSxJQUNBLHdCQUF3QjtBQUFBLElBQ3hCLG9CQUFvQixJQUFJLFdBQVc7QUFBQSxFQUNwQztBQUNEO0FBRUEsU0FBUyxhQUFhLEtBQVUsT0FBNkUsQ0FBQyxHQUFtQjtBQUNoSSxTQUFPO0FBQUEsSUFDTixNQUFNO0FBQUEsSUFDTixrQkFBa0I7QUFBQSxJQUNsQixNQUFNO0FBQUEsSUFDTixhQUFhO0FBQUEsSUFDYixlQUFnQixLQUFLLHFCQUFxQixLQUFLLGNBQzVDO0FBQUEsTUFDRDtBQUFBLE1BQ0EsYUFBYSxLQUFLO0FBQUEsTUFDbEIsZ0JBQWdCO0FBQUEsTUFDaEIsWUFBWSxnQkFBZ0IsTUFBUztBQUFBLElBQ3RDLElBQ0U7QUFBQSxFQUNKO0FBQ0Q7QUFFQSxNQUFNLDRCQUE0QixNQUFNO0FBRXZDLFFBQU0sY0FBYyx3Q0FBd0M7QUFDNUQsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxjQUFVLFlBQVksSUFBSSxJQUFJLHVCQUF1QixDQUFDO0FBQ3RELGNBQVUsWUFBWSxJQUFJLElBQUkseUJBQXlCLE9BQU8sQ0FBQztBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsV0FBTyxZQUFZLFFBQVEsVUFBVSxRQUFRLFNBQVMsR0FBRyxLQUFLO0FBRTlELFlBQVEseUJBQXlCLE9BQU87QUFFeEMsV0FBTyxZQUFZLFFBQVEsVUFBVSxRQUFRLFNBQVMsR0FBRyxJQUFJO0FBQUEsRUFDOUQsQ0FBQztBQUVELE9BQUsscURBQXFELE1BQU07QUFDL0QsVUFBTSxVQUFVLGNBQWMsTUFBTSxFQUFFLFlBQVksa0NBQWtDLENBQUM7QUFDckYsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLFlBQVksU0FBUyxlQUFlO0FBQzVDLFlBQVEsWUFBWSxTQUFTLGVBQWU7QUFDNUMsWUFBUSxZQUFZLFNBQVMsUUFBUTtBQUVyQyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxZQUFZLFFBQVMsZ0JBQWdCLDBDQUEwQztBQUN0RixXQUFPLFlBQVksUUFBUyxZQUFZLG1CQUFtQjtBQUMzRCxXQUFPLFlBQVksUUFBUyxjQUFjLFdBQVc7QUFDckQsV0FBTyxZQUFZLFFBQVMsWUFBWSxVQUFVO0FBQ2xELFdBQU8sWUFBWSxRQUFTLGNBQWMsQ0FBQztBQUMzQyxXQUFPLFlBQVksUUFBUyxlQUFlLENBQUM7QUFDNUMsV0FBTyxZQUFZLFFBQVMsUUFBUSxDQUFDO0FBQ3JDLFdBQU8sWUFBWSxRQUFTLDhCQUE4QixJQUFJO0FBQzlELFdBQU8sWUFBWSxRQUFRLFVBQVUsUUFBUSxTQUFTLEdBQUcsS0FBSztBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLDBEQUEwRCxNQUFNO0FBQ3BFLFVBQU0sVUFBVSxRQUFRLFNBQVMsa0JBQWtCLGlCQUFpQjtBQUNwRSxXQUFPLFlBQVksU0FBUyxNQUFTO0FBQUEsRUFDdEMsQ0FBQztBQUVELE9BQUssc0VBQXNFLE1BQU07QUFDaEYsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUNsQyxZQUFRLHlCQUF5QixPQUFPO0FBQ3hDLFlBQVEsWUFBWSxTQUFTLGVBQWU7QUFFNUMsVUFBTSxnQkFBZ0IsWUFBWSxJQUFJLElBQUkseUJBQXlCLE9BQU8sQ0FBQztBQUUzRSxXQUFPLFlBQVksY0FBYyxVQUFVLFFBQVEsU0FBUyxHQUFHLElBQUk7QUFDbkUsVUFBTSxVQUFVLGNBQWMsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQzdFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sWUFBWSxRQUFTLGVBQWUsQ0FBQztBQUM1QyxXQUFPLFlBQVksUUFBUyxjQUFjLENBQUM7QUFDM0MsV0FBTyxZQUFZLFFBQVMsK0JBQStCLENBQUM7QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBRWxDLFlBQVEseUJBQXlCLE9BQU87QUFDeEMsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLFlBQVksU0FBUyxlQUFlO0FBQzVDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBRXZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sWUFBWSxRQUFTLFdBQVcsQ0FBQztBQUN4QyxXQUFPLFlBQVksUUFBUyxjQUFjLENBQUM7QUFBQSxFQUM1QyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLElBQUksY0FBYyxLQUFLLEVBQUUsWUFBWSxhQUFhLENBQUM7QUFDekQsVUFBTSxJQUFJLGNBQWMsS0FBSyxFQUFFLFlBQVksYUFBYSxDQUFDO0FBRXpELFlBQVEseUJBQXlCLENBQUM7QUFDbEMsWUFBUSxZQUFZLEdBQUcsUUFBUTtBQUUvQixVQUFNLFVBQVUsUUFBUSxrQkFBa0IsRUFDeEMsSUFBSSxPQUFLLEdBQUcsRUFBRSxVQUFVLElBQUksRUFBRSxTQUFTLEVBQUUsRUFDekMsS0FBSztBQUVQLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxnQkFBZ0IsY0FBYyxDQUFDO0FBQUEsRUFDakUsQ0FBQztBQUVELE9BQUsscUVBQXFFLE1BQU07QUFDL0UsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUNsQyxZQUFRLHlCQUF5QixPQUFPO0FBRXhDLFVBQU0sZUFBZSxRQUFRLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUM1RSxXQUFPLEdBQUcsWUFBWTtBQUN0QixXQUFPLFlBQVksYUFBYyxZQUFZLFVBQVU7QUFFdkQsVUFBTSxrQkFBa0IsUUFBUSxTQUFTLFFBQVEsV0FBVyxvQkFBb0IsT0FBTztBQUN2RixXQUFPLFlBQVksaUJBQWlCLE1BQVM7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixVQUFNLFVBQVUsY0FBYyxJQUFJO0FBRWxDLFlBQVEsWUFBWSxTQUFTLFFBQVE7QUFFckMsV0FBTyxZQUFZLFFBQVEsVUFBVSxRQUFRLFNBQVMsR0FBRyxJQUFJO0FBQzdELFVBQU0sVUFBVSxRQUFRLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUN2RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLFlBQVksUUFBUyxRQUFRLENBQUM7QUFDckMsV0FBTyxZQUFZLFFBQVMsY0FBYyxDQUFDO0FBQzNDLFdBQU8sWUFBWSxRQUFTLDhCQUE4QixLQUFLO0FBQUEsRUFDaEUsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUVsQyxZQUFRLFlBQVksU0FBUyxhQUFhO0FBQzFDLFlBQVEsWUFBWSxTQUFTLGFBQWE7QUFDMUMsWUFBUSxZQUFZLFNBQVMsU0FBUztBQUN0QyxZQUFRLFlBQVksU0FBUyxrQkFBa0I7QUFDL0MsWUFBUSxZQUFZLFNBQVMsYUFBYTtBQUMxQyxZQUFRLFlBQVksU0FBUyxhQUFhO0FBQzFDLFlBQVEsWUFBWSxTQUFTLGFBQWE7QUFFMUMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsYUFBYSxRQUFTO0FBQUEsTUFDdEIsU0FBUyxRQUFTO0FBQUEsTUFDbEIsa0JBQWtCLFFBQVM7QUFBQSxNQUMzQixhQUFhLFFBQVM7QUFBQSxNQUN0QixRQUFRLFFBQVM7QUFBQSxJQUNsQixHQUFHO0FBQUEsTUFDRixhQUFhO0FBQUEsTUFDYixTQUFTO0FBQUEsTUFDVCxrQkFBa0I7QUFBQSxNQUNsQixhQUFhO0FBQUEsTUFDYixRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLFVBQVUsY0FBYyxNQUFNLEVBQUUsU0FBUyxDQUFDLEVBQUUsYUFBYSxJQUFJLE1BQU0sV0FBVyxHQUFHLFlBQVksR0FBRyxXQUFXLEVBQUUsQ0FBQyxFQUFFLENBQUM7QUFFdkgsWUFBUSxtQkFBbUIsT0FBTztBQUVsQyxXQUFPLFlBQVksUUFBUSxVQUFVLFFBQVEsU0FBUyxHQUFHLEtBQUs7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyxvRUFBb0UsTUFBTTtBQUM5RSxVQUFNLFVBQVUsY0FBYyxNQUFNO0FBQUEsTUFDbkMsU0FBUztBQUFBLFFBQ1IsRUFBRSxhQUFhLElBQUksTUFBTSxXQUFXLEdBQUcsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLFFBQ25FLEVBQUUsYUFBYSxJQUFJLE1BQU0sV0FBVyxHQUFHLFlBQVksR0FBRyxXQUFXLEVBQUU7QUFBQSxNQUNwRTtBQUFBLE1BQ0EsZ0JBQWdCLEVBQUUsT0FBTyxJQUFJLFdBQVcsSUFBSSxXQUFXLEdBQUc7QUFBQSxJQUMzRCxDQUFDO0FBRUQsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixjQUFjLFFBQVM7QUFBQSxNQUN2QixZQUFZLFFBQVM7QUFBQSxNQUNyQixjQUFjLFFBQVM7QUFBQSxJQUN4QixHQUFHO0FBQUEsTUFDRixjQUFjO0FBQUEsTUFDZCxZQUFZO0FBQUEsTUFDWixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLFVBQVUsY0FBYyxNQUFNO0FBQUEsTUFDbkMsU0FBUztBQUFBLFFBQ1IsRUFBRSxhQUFhLElBQUksTUFBTSxXQUFXLEdBQUcsWUFBWSxHQUFHLFdBQVcsRUFBRTtBQUFBLFFBQ25FLEVBQUUsYUFBYSxJQUFJLE1BQU0sV0FBVyxHQUFHLFlBQVksR0FBRyxXQUFXLEVBQUU7QUFBQSxNQUNwRTtBQUFBLElBQ0QsQ0FBQztBQUVELFlBQVEseUJBQXlCLE9BQU87QUFDeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBRXZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsY0FBYyxRQUFTO0FBQUEsTUFDdkIsWUFBWSxRQUFTO0FBQUEsTUFDckIsY0FBYyxRQUFTO0FBQUEsSUFDeEIsR0FBRztBQUFBLE1BQ0YsY0FBYztBQUFBLE1BQ2QsWUFBWTtBQUFBLE1BQ1osY0FBYztBQUFBLElBQ2YsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxlQUFlLElBQUksTUFBTSwyQkFBMkI7QUFDMUQsVUFBTSxVQUFVLElBQUksTUFBTSxjQUFjO0FBQ3hDLFVBQU0sWUFBWSxnQkFBZ0IsY0FBYztBQUFBLE1BQy9DLGFBQWEsU0FBUyxFQUFFLGFBQWEsSUFBSSxNQUFNLHFDQUFxQyxFQUFFLENBQUM7QUFBQSxJQUN4RixDQUFDO0FBQ0QsVUFBTSxVQUFVLGNBQWMsTUFBTSxFQUFFLFVBQVUsQ0FBQztBQUVqRCxZQUFRLHlCQUF5QixPQUFPO0FBQ3hDLFVBQU0sVUFBVSxRQUFRLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUV2RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLGVBQWUsUUFBUztBQUFBLE1BQ3hCLGtCQUFrQixRQUFTO0FBQUEsTUFDM0Isb0JBQW9CLFFBQVM7QUFBQSxNQUM3QixlQUFlLFFBQVM7QUFBQSxJQUN6QixHQUFHO0FBQUEsTUFDRixlQUFlO0FBQUEsTUFDZixrQkFBa0I7QUFBQSxNQUNsQixvQkFBb0I7QUFBQSxNQUNwQixlQUFlLEtBQUssYUFBYSxTQUFTLENBQUMsRUFBRSxTQUFTLEVBQUU7QUFBQSxJQUN6RCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUMxRixVQUFNLGVBQWUsSUFBSSxNQUFNLGNBQWM7QUFDN0MsVUFBTSxZQUFZLGdCQUFnQixjQUFjO0FBQUEsTUFDL0MsYUFBYSxjQUFjLEVBQUUsbUJBQW1CLEtBQUssQ0FBQztBQUFBLElBQ3ZELENBQUM7QUFDRCxVQUFNLFVBQVUsY0FBYyxNQUFNLEVBQUUsVUFBVSxDQUFDO0FBRWpELFlBQVEseUJBQXlCLE9BQU87QUFDeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBRXZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsZUFBZSxRQUFTO0FBQUEsTUFDeEIsa0JBQWtCLFFBQVM7QUFBQSxNQUMzQixvQkFBb0IsUUFBUztBQUFBLElBQzlCLEdBQUc7QUFBQSxNQUNGLGVBQWU7QUFBQSxNQUNmLGtCQUFrQjtBQUFBLE1BQ2xCLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG1GQUFtRixNQUFNO0FBQzdGLFVBQU0sZUFBZSxJQUFJLE1BQU0sY0FBYztBQUM3QyxVQUFNLFlBQVksSUFBSSxNQUFNLGtCQUFrQjtBQUM5QyxVQUFNLGVBQWUsSUFBSSxNQUFNLG9CQUFvQjtBQUNuRCxVQUFNLFlBQVksZ0JBQWdCLGNBQWM7QUFBQSxNQUMvQyxhQUFhLFdBQVcsRUFBRSxtQkFBbUIsS0FBSyxDQUFDO0FBQUEsTUFDbkQsYUFBYSxZQUFZO0FBQUEsSUFDMUIsQ0FBQztBQUNELFVBQU0sVUFBVSxjQUFjLE1BQU0sRUFBRSxVQUFVLENBQUM7QUFFakQsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFFdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixhQUFhLFFBQVM7QUFBQSxNQUN0QixhQUFhLFFBQVM7QUFBQSxNQUN0QixnQkFBZ0IsUUFBUztBQUFBLE1BQ3pCLG1CQUFtQixRQUFTO0FBQUEsSUFDN0IsR0FBRztBQUFBLE1BQ0YsYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLE1BQ2IsZ0JBQWdCO0FBQUEsTUFDaEIsbUJBQW1CO0FBQUEsSUFDcEIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseUVBQXlFLE1BQU07QUFDbkYsVUFBTSxVQUFVLGNBQWMsSUFBSTtBQUVsQyxZQUFRLDJCQUEyQixTQUFTLEVBQUUsd0JBQXdCLE1BQU0sc0JBQXNCLEVBQUUsQ0FBQztBQUVyRyxXQUFPLFlBQVksUUFBUSxVQUFVLFFBQVEsU0FBUyxHQUFHLEtBQUs7QUFBQSxFQUMvRCxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsWUFBUSwyQkFBMkIsU0FBUyxFQUFFLHdCQUF3QixNQUFNLHNCQUFzQixFQUFFLENBQUM7QUFDckcsWUFBUSwyQkFBMkIsU0FBUyxFQUFFLHdCQUF3QixPQUFPLHNCQUFzQixFQUFFLENBQUM7QUFFdEcsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsd0JBQXdCLFFBQVM7QUFBQSxNQUNqQyxzQkFBc0IsUUFBUztBQUFBLElBQ2hDLEdBQUc7QUFBQSxNQUNGLHdCQUF3QjtBQUFBLE1BQ3hCLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGdFQUFnRSxNQUFNO0FBQzFFLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsWUFBUSx5QkFBeUIsT0FBTztBQUN4QyxZQUFRLDJCQUEyQixTQUFTLEVBQUUsd0JBQXdCLE9BQU8sc0JBQXNCLEVBQUUsQ0FBQztBQUV0RyxVQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSSx5QkFBeUIsT0FBTyxDQUFDO0FBQzNFLFVBQU0sVUFBVSxjQUFjLFNBQVMsUUFBUSxXQUFXLFlBQVksT0FBTztBQUU3RSxXQUFPLEdBQUcsT0FBTztBQUNqQixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLHdCQUF3QixRQUFTO0FBQUEsTUFDakMsc0JBQXNCLFFBQVM7QUFBQSxJQUNoQyxHQUFHO0FBQUEsTUFDRix3QkFBd0I7QUFBQSxNQUN4QixzQkFBc0I7QUFBQSxJQUN2QixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLFVBQVUsY0FBYyxJQUFJO0FBQ2xDLFlBQVEseUJBQXlCLE9BQU87QUFFeEMsVUFBTSxVQUFVLFFBQVEsU0FBUyxRQUFRLFdBQVcsWUFBWSxPQUFPO0FBQ3ZFLFdBQU8sR0FBRyxPQUFPO0FBQ2pCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsd0JBQXdCLFFBQVM7QUFBQSxNQUNqQyxzQkFBc0IsUUFBUztBQUFBLElBQ2hDLEdBQUc7QUFBQSxNQUNGLHdCQUF3QjtBQUFBLE1BQ3hCLHNCQUFzQjtBQUFBLElBQ3ZCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHNHQUFzRyxNQUFNO0FBQ2hILFVBQU0sYUFBYSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdkcsVUFBTSxhQUFhLGdCQUFnQixJQUFJLE1BQU0sY0FBYyxHQUFHLENBQUMsYUFBYSxJQUFJLE1BQU0sY0FBYyxDQUFDLENBQUMsQ0FBQztBQUN2RyxVQUFNLEtBQUssY0FBYyxNQUFNLEVBQUUsWUFBWSxnQ0FBZ0MsV0FBVyxXQUFXLENBQUM7QUFDcEcsVUFBTSxLQUFLLGNBQWMsTUFBTSxFQUFFLFlBQVksaUNBQWlDLFdBQVcsV0FBVyxDQUFDO0FBQ3JHLFVBQU0sSUFBSSxjQUFjLEtBQUssRUFBRSxZQUFZLG1CQUFtQixXQUFXLFdBQVcsQ0FBQztBQUNyRixVQUFNLGNBQWMsY0FBYyxLQUFLLEVBQUUsWUFBWSwrQkFBK0IsQ0FBQztBQUVyRixXQUFPLGdCQUFnQixRQUFRLG1DQUFtQyxFQUFFLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyx5QkFBeUIsR0FBRyx5QkFBeUIsRUFBRSxDQUFDO0FBQ3ZKLFdBQU8sZ0JBQWdCLFFBQVEsbUNBQW1DLEVBQUUsR0FBRyxFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFLENBQUM7QUFDdkosV0FBTyxnQkFBZ0IsUUFBUSxtQ0FBbUMsQ0FBQyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUN0SixXQUFPLGdCQUFnQixRQUFRLG1DQUFtQyxXQUFXLEdBQUcsRUFBRSxtQkFBbUIsR0FBRyx5QkFBeUIsR0FBRyx5QkFBeUIsRUFBRSxDQUFDO0FBQUEsRUFDakssQ0FBQztBQUVELE9BQUssc0VBQXNFLE1BQU07QUFDaEYsWUFBUSxNQUFNLDRDQUE0QyxLQUFLLFVBQVU7QUFBQSxNQUN4RSxnQ0FBZ0M7QUFBQSxNQUNoQyxpQ0FBaUM7QUFBQSxNQUNqQyxtQkFBbUI7QUFBQSxJQUNwQixDQUFDLEdBQUcsYUFBYSxhQUFhLGNBQWMsT0FBTztBQUVuRCxVQUFNLGdCQUFnQixjQUFjLFVBQVUsRUFBRSxZQUFZLCtCQUErQixDQUFDO0FBQzVGLFVBQU0saUJBQWlCLGNBQWMsV0FBVyxFQUFFLFlBQVksa0JBQWtCLENBQUM7QUFFakYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixRQUFRLG1DQUFtQyxhQUFhO0FBQUEsTUFDeEQsUUFBUSx1QkFBdUIsY0FBYztBQUFBLE1BQzdDLEtBQUssTUFBTSxRQUFRLElBQUksNENBQTRDLGFBQWEsV0FBVyxLQUFLLEVBQUU7QUFBQSxJQUNuRyxHQUFHO0FBQUEsTUFDRixFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFO0FBQUEsTUFDL0UsRUFBRSxtQkFBbUIsR0FBRyx5QkFBeUIsR0FBRyx5QkFBeUIsRUFBRTtBQUFBLE1BQy9FLEVBQUUscUJBQXFCLEdBQUcsbUJBQW1CLEVBQUU7QUFBQSxJQUNoRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLGFBQWEsZ0JBQWdCLElBQUksTUFBTSxjQUFjLEdBQUcsQ0FBQyxhQUFhLElBQUksTUFBTSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBQ3ZHLFVBQU0sYUFBYSxnQkFBZ0IsSUFBSSxNQUFNLGNBQWMsR0FBRyxDQUFDLGFBQWEsSUFBSSxNQUFNLGNBQWMsQ0FBQyxDQUFDLENBQUM7QUFDdkcsVUFBTSxvQkFBb0IsY0FBYyxNQUFNLEVBQUUsWUFBWSxnQ0FBZ0MsV0FBVyxXQUFXLENBQUM7QUFDbkgsVUFBTSxxQkFBcUIsY0FBYyxNQUFNLEVBQUUsWUFBWSxpQ0FBaUMsV0FBVyxXQUFXLENBQUM7QUFDckgsVUFBTSwyQkFBMkIsY0FBYyxLQUFLLEVBQUUsWUFBWSxtQkFBbUIsV0FBVyxXQUFXLENBQUM7QUFFNUcsWUFBUSx5QkFBeUIsaUJBQWlCO0FBQ2xELFlBQVEsbUNBQW1DLGlCQUFpQjtBQUM1RCxZQUFRLG1DQUFtQyxrQkFBa0I7QUFDN0QsWUFBUSxtQ0FBbUMsd0JBQXdCO0FBRW5FLFVBQU0sVUFBVSxRQUFRLFNBQVMsa0JBQWtCLFdBQVcsWUFBWSxpQkFBaUI7QUFDM0YsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixtQkFBbUIsUUFBUztBQUFBLE1BQzVCLHlCQUF5QixRQUFTO0FBQUEsTUFDbEMseUJBQXlCLFFBQVM7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQix5QkFBeUI7QUFBQSxNQUN6Qix5QkFBeUI7QUFBQSxJQUMxQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFlBQVksZ0JBQWdCLElBQUksTUFBTSxjQUFjLEdBQUcsQ0FBQyxhQUFhLElBQUksTUFBTSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBQ3RHLFVBQU0sVUFBVSxjQUFjLE1BQU0sRUFBRSxZQUFZLE1BQU0sVUFBVSxDQUFDO0FBQ25FLFlBQVEsbUNBQW1DLE9BQU87QUFDbEQsWUFBUSxtQ0FBbUMsT0FBTztBQUVsRCxVQUFNLGdCQUFnQixZQUFZLElBQUksSUFBSSx5QkFBeUIsT0FBTyxDQUFDO0FBQzNFLFdBQU8sZ0JBQWdCLGNBQWMsbUNBQW1DLE9BQU8sR0FBRyxFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFLENBQUM7QUFBQSxFQUNuSyxDQUFDO0FBRUQsT0FBSyxzRUFBc0UsTUFBTTtBQUNoRixVQUFNLFlBQVksZ0JBQWdCLElBQUksTUFBTSxjQUFjLEdBQUcsQ0FBQyxhQUFhLElBQUksTUFBTSxjQUFjLENBQUMsQ0FBQyxDQUFDO0FBQ3RHLFVBQU0sVUFBVSxjQUFjLE1BQU0sRUFBRSxZQUFZLE1BQU0sVUFBVSxDQUFDO0FBRW5FLFdBQU8sZ0JBQWdCLFFBQVEsdUJBQXVCLE9BQU8sR0FBRyxFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFLENBQUM7QUFFaEosWUFBUSxtQ0FBbUMsT0FBTztBQUNsRCxZQUFRLG1DQUFtQyxPQUFPO0FBRWxELFdBQU8sZ0JBQWdCLFFBQVEsdUJBQXVCLE9BQU8sR0FBRyxFQUFFLG1CQUFtQixHQUFHLHlCQUF5QixHQUFHLHlCQUF5QixFQUFFLENBQUM7QUFFaEosV0FBTyxnQkFBZ0IsUUFBUSx1QkFBdUIsT0FBTyxHQUFHLEVBQUUsbUJBQW1CLEdBQUcseUJBQXlCLEdBQUcseUJBQXlCLEVBQUUsQ0FBQztBQUFBLEVBQ2pKLENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFVBQU0sVUFBVSxjQUFjLElBQUk7QUFDbEMsWUFBUSxZQUFZLFNBQVMsUUFBUTtBQUVyQyxVQUFNLFVBQVUsUUFBUSxTQUFTLFFBQVEsV0FBVyxZQUFZLE9BQU87QUFDdkUsV0FBTyxHQUFHLE9BQU87QUFDakIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixtQkFBbUIsUUFBUztBQUFBLE1BQzVCLHlCQUF5QixRQUFTO0FBQUEsTUFDbEMseUJBQXlCLFFBQVM7QUFBQSxJQUNuQyxHQUFHO0FBQUEsTUFDRixtQkFBbUI7QUFBQSxNQUNuQix5QkFBeUI7QUFBQSxNQUN6Qix5QkFBeUI7QUFBQSxJQUMxQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLElBQUksY0FBYyxHQUFHO0FBQzNCLFVBQU0sSUFBSSxjQUFjLEdBQUc7QUFFM0IsWUFBUSx5QkFBeUIsQ0FBQztBQUNsQyxZQUFRLFlBQVksR0FBRyxRQUFRO0FBRS9CLFdBQU8sZ0JBQWdCLFFBQVEsY0FBYyxFQUFFLEtBQUssR0FBRyxDQUFDLEtBQUssR0FBRyxDQUFDO0FBQUEsRUFDbEUsQ0FBQztBQUVELE9BQUssNkNBQTZDLE1BQU07QUFDdkQsWUFBUSxNQUFNLGNBQWMsbUJBQW1CLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFFOUYsVUFBTSxtQkFBbUIsWUFBWSxJQUFJLElBQUkseUJBQXlCLE9BQU8sQ0FBQztBQUU5RSxXQUFPLGdCQUFnQixpQkFBaUIsY0FBYyxHQUFHLENBQUMsQ0FBQztBQUFBLEVBQzVELENBQUM7QUFFRCxPQUFLLHFEQUFxRCxNQUFNO0FBSS9ELFVBQU0sTUFBTSxLQUFLLElBQUk7QUFDckIsVUFBTSxTQUFrQyxDQUFDO0FBQ3pDLGFBQVMsSUFBSSxHQUFHLElBQUksc0JBQXNCLEtBQUs7QUFDOUMsYUFBTyxZQUFZLENBQUMsRUFBRSxJQUFJO0FBQUEsUUFDekIsWUFBWTtBQUFBLFFBQ1osY0FBYztBQUFBLFFBQ2Qsb0JBQW9CLHNCQUFzQixDQUFDO0FBQUEsUUFDM0Msb0JBQW9CO0FBQUEsUUFDcEIsZUFBZTtBQUFBLFFBQ2Ysa0JBQWtCO0FBQUEsUUFDbEIsb0JBQW9CO0FBQUEsUUFDcEIsOEJBQThCO0FBQUEsUUFDOUIsd0JBQXdCO0FBQUEsUUFDeEIsc0JBQXNCO0FBQUEsUUFDdEIsaUJBQWlCLE1BQU07QUFBQTtBQUFBLFFBQ3ZCLG9CQUFvQjtBQUFBLFFBQ3BCLCtCQUErQjtBQUFBLFFBQy9CLGNBQWM7QUFBQSxRQUFHLFdBQVc7QUFBQSxRQUM1QixlQUFlO0FBQUEsUUFBRyxtQkFBbUI7QUFBQSxRQUFHLG9CQUFvQjtBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFDbEYsbUJBQW1CO0FBQUEsUUFBRyx3QkFBd0I7QUFBQSxRQUFHLG1CQUFtQjtBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFBRyxxQkFBcUI7QUFBQSxRQUNqSCxzQkFBc0I7QUFBQSxRQUFHLFFBQVE7QUFBQSxRQUFHLGVBQWU7QUFBQSxRQUNuRCxpQkFBaUI7QUFBQSxRQUFHLG1CQUFtQjtBQUFBLFFBQUcsaUJBQWlCO0FBQUEsUUFDM0QsYUFBYTtBQUFBLFFBQUcsYUFBYTtBQUFBLFFBQUcsYUFBYTtBQUFBLFFBQUcsU0FBUztBQUFBLFFBQ3pELGNBQWM7QUFBQSxRQUFHLFlBQVk7QUFBQSxRQUFHLGNBQWM7QUFBQSxNQUMvQztBQUFBLElBQ0Q7QUFDQSxZQUFRLE1BQU0sY0FBYyxLQUFLLFVBQVUsTUFBTSxHQUFHLGFBQWEsYUFBYSxjQUFjLE9BQU87QUFFbkcsVUFBTSxhQUFhLFlBQVksSUFBSSxJQUFJLHlCQUF5QixPQUFPLENBQUM7QUFDeEUsV0FBTyxZQUFZLFdBQVcsY0FBYyxFQUFFLFFBQVEsb0JBQW9CO0FBRTFFLFVBQU0sYUFBYSxjQUFjLFdBQVc7QUFDNUMsZUFBVyx5QkFBeUIsVUFBVTtBQUU5QyxVQUFNLE1BQU0sV0FBVyxjQUFjO0FBQ3JDLFdBQU8sWUFBWSxJQUFJLFFBQVEsb0JBQW9CO0FBQ25ELFdBQU8sWUFBWSxJQUFJLFNBQVMsV0FBVyxHQUFHLElBQUk7QUFDbEQsV0FBTyxZQUFZLElBQUksU0FBUyxZQUFZLEdBQUcsT0FBTyx1Q0FBdUM7QUFDN0YsV0FBTyxZQUFZLElBQUksU0FBUyxZQUFZLEdBQUcsTUFBTSw2Q0FBNkM7QUFBQSxFQUNuRyxDQUFDO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
