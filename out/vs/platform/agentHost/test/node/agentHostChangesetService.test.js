import assert from "assert";
import { timeout } from "../../../../base/common/async.js";
import { DisposableStore, toDisposable } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agent.js";
import { AgentHostClientType } from "../../common/agentHostClientInfo.js";
import { AgentHostClientConnectionKind, AgentHostLaunchKind, AgentHostTransportKind } from "../../common/agentHostTelemetry.js";
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildTurnChangesetUri, buildUncommittedChangesetUri } from "../../common/changesetUri.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, FileEditKind, MessageKind, SessionStatus, withSessionGitState } from "../../common/state/sessionState.js";
import { AgentHostChangesetService } from "../../node/agentHostChangesetService.js";
import { META_CHANGES_SUMMARY } from "../../common/agentHostChangesetService.js";
import { NULL_CHECKPOINT_SERVICE } from "../../common/agentHostCheckpointService.js";
import { NULL_REVIEW_SERVICE } from "../../common/agentHostReviewService.js";
import { TelemetryLevel } from "../../../telemetry/common/telemetry.js";
import { NullTelemetryService } from "../../../telemetry/common/telemetryUtils.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { AgentConfigurationService } from "../../node/agentConfigurationService.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { createNoopGitService, createNullSessionDataService, createSessionDataService, encodeString, TestDiffComputeService, TestSessionDatabase } from "../common/sessionTestHelpers.js";
function createSubscriptionService(...changesets) {
  const subscriptions = new Set(changesets);
  return {
    _serviceBrand: void 0,
    subscriptions,
    getSessionSubscriptions: () => subscriptions,
    addSubscription: (_session, changeset) => {
      subscriptions.add(changeset);
    },
    removeSubscription: (_session, changeset) => {
      subscriptions.delete(changeset);
    },
    clearSessionSubscriptions: () => {
      subscriptions.clear();
    }
  };
}
function createOperationService() {
  return {
    _serviceBrand: void 0,
    registerContribution: () => toDisposable(() => {
    }),
    updateOperations: () => {
    },
    getOperations: () => void 0,
    invokeChangesetOperation: async () => {
      throw new Error("not implemented");
    },
    dispose: () => {
    }
  };
}
class CapturingTelemetryService {
  constructor() {
    this.telemetryLevel = TelemetryLevel.USAGE;
    this.sessionId = "test-session";
    this.machineId = "test-machine";
    this.sqmId = "test-sqm";
    this.devDeviceId = "test-dev-device";
    this.firstSessionDate = "test-first-session-date";
    this.sendErrorTelemetry = false;
    this.events = [];
  }
  publicLog() {
  }
  publicLog2(eventName, data) {
    this.events.push({ eventName, data: data ?? {} });
  }
  publicLogError() {
  }
  publicLogError2(eventName, data) {
    this.events.push({ eventName, data: data ?? {} });
  }
  setExperimentProperty() {
  }
  setCommonProperty() {
  }
}
suite.skip("AgentHostChangesetService", () => {
  const disposables = new DisposableStore();
  let stateManager;
  let changesetService;
  const sessionUri = AgentSession.uri("mock", "session-1");
  function setupSession(workingDirectory) {
    stateManager.createSession({
      resource: sessionUri.toString(),
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    });
    stateManager.setSessionChangesets(sessionUri.toString(), buildDefaultChangesetCatalog(sessionUri.toString()));
    stateManager.dispatchServerAction(sessionUri.toString(), { type: ActionType.SessionReady });
  }
  setup(() => {
    stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    changesetService = disposables.add(new AgentHostChangesetService(
      stateManager,
      new NullLogService(),
      createNullSessionDataService(),
      createNoopGitService(),
      NULL_CHECKPOINT_SERVICE,
      disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
      createOperationService(),
      createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
      NULL_REVIEW_SERVICE,
      NullTelemetryService
    ));
  });
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("registerStaticChangesets makes the two static changeset URIs subscribable with computing status", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
      { label: "Branch Changes", uriTemplate: `${sessionStr}/changeset/session`, changeKind: "session" },
      { label: "Uncommitted Changes", uriTemplate: `${sessionStr}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
    ]);
    changesetService.registerStaticChangesets(sessionStr);
    for (const id of ["uncommitted", "session"]) {
      const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/${id}`);
      assert.ok(snapshot, `expected ${id} changeset URI to be subscribable`);
      assert.strictEqual(snapshot.state.status, "computing");
    }
    assert.deepStrictEqual(stateManager.getSessionState(sessionStr)?.changesets, [
      { label: "Branch Changes", uriTemplate: `${sessionStr}/changeset/session`, changeKind: "session" },
      { label: "Uncommitted Changes", uriTemplate: `${sessionStr}/changeset/uncommitted`, description: "Show uncommitted changes in this session", changeKind: "uncommitted" }
    ]);
  });
  test("registerStaticChangesets is idempotent across repeated calls", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    changesetService.registerStaticChangesets(sessionStr);
    changesetService.registerStaticChangesets(sessionStr);
    changesetService.registerStaticChangesets(sessionStr);
    const changesets = stateManager.getSessionState(sessionStr)?.changesets;
    assert.strictEqual(changesets?.length, 5, "expected the three default catalogue entries");
  });
  test("restoreStaticChangeset publishes files in Ready and refreshes catalogue counts", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 5, removed: 2 }
      },
      {
        after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    const changesetUri = `${sessionStr}/changeset/session`;
    const snapshot = stateManager.getSnapshot(changesetUri);
    assert.ok(snapshot, "expected the changeset URI to be subscribable");
    const state = snapshot.state;
    assert.strictEqual(state.status, "ready");
    assert.deepStrictEqual(state.files.map((f) => f.id), ["file:///wd/a.ts", "file:///wd/b.ts"]);
    const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
    assert.deepStrictEqual(catalogue, [
      {
        label: "Branch Changes",
        uriTemplate: changesetUri,
        changeKind: "session"
      },
      {
        label: "Uncommitted Changes",
        uriTemplate: `${sessionStr}/changeset/uncommitted`,
        description: "Show uncommitted changes in this session",
        changeKind: "uncommitted"
      }
    ]);
  });
  test("restoreStaticChangeset catalogue counts only emitted unique files", () => {
    const sessionStr = sessionUri.toString();
    setupSession();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 100, removed: 50 }
      },
      {
        diff: { added: 20, removed: 10 }
      },
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 3, removed: 1 }
      },
      {
        after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    const changesetUri = `${sessionStr}/changeset/session`;
    const snapshot = stateManager.getSnapshot(changesetUri);
    const state = snapshot?.state;
    const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
    assert.deepStrictEqual({
      files: state?.files.map((f) => ({ id: f.id, diff: f.edit.diff })),
      catalogue
    }, {
      files: [
        { id: "file:///wd/a.ts", diff: { added: 3, removed: 1 } },
        { id: "file:///wd/b.ts", diff: { added: 1, removed: 0 } }
      ],
      catalogue: [
        {
          label: "Branch Changes",
          uriTemplate: changesetUri,
          changeKind: "session"
        },
        {
          label: "Uncommitted Changes",
          uriTemplate: `${sessionStr}/changeset/uncommitted`,
          description: "Show uncommitted changes in this session",
          changeKind: "uncommitted"
        }
      ]
    });
  });
  test("restoreStaticChangeset works without a live session state (seeds the changeset for unopened sessions)", () => {
    const sessionStr = sessionUri.toString();
    const diffs = [
      {
        after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } },
        diff: { added: 1, removed: 0 }
      }
    ];
    changesetService.restoreStaticChangeset(sessionStr, "session", diffs);
    assert.strictEqual(stateManager.getSessionState(sessionStr), void 0);
    const snapshot = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
    assert.ok(snapshot, "expected the changeset URI to be subscribable even without a session state");
    const state = snapshot.state;
    assert.strictEqual(state.status, "ready");
    assert.deepStrictEqual(state.files.map((f) => f.id), ["file:///wd/a.ts"]);
  });
  suite("session diff computation", () => {
    test("git-driven path is preferred when a git service is provided and the working dir is a git work tree", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const gitDiffs = [{
        after: { uri: "file:///wd/new.ts", content: { uri: "file:///wd/new.ts" } },
        diff: { added: 1, removed: 0 }
      }];
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (wd, opts) => {
          computeCalls.push({ workingDirectory: wd.toString(), sessionUri: opts.sessionUri, baseBranch: opts.baseBranch });
          return gitDiffs;
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await sessionDb.setMetadata("agentHost.diffBaseBranch", "main");
      const envelopes = [];
      disposables.add(localStateManager.onDidEmitEnvelope((e) => {
        envelopes.push(e);
      }));
      localChangesets.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 200 && computeCalls.length < 2; i++) {
        await timeout(2);
      }
      const sortedCalls = [...computeCalls].sort((a, b) => (a.baseBranch ?? "") < (b.baseBranch ?? "") ? -1 : 1);
      assert.deepStrictEqual(sortedCalls, [
        { workingDirectory: "file:///wd", sessionUri: sessionUri.toString(), baseBranch: void 0 },
        { workingDirectory: "file:///wd", sessionUri: sessionUri.toString(), baseBranch: "main" }
      ]);
      const contentChanges = envelopes.filter((e) => e.action.type === ActionType.ChangesetContentChanged);
      const sessionContent = contentChanges.filter((e) => e.channel === `${sessionUri.toString()}/changeset/session`);
      const uncommittedContent = contentChanges.filter((e) => e.channel === `${sessionUri.toString()}/changeset/uncommitted`);
      assert.deepStrictEqual(sessionContent.at(-1)?.action.files.map((f) => f.edit), gitDiffs);
      assert.deepStrictEqual(uncommittedContent.at(-1)?.action.files.map((f) => f.edit), gitDiffs);
      let persisted;
      for (let i = 0; i < 50 && !persisted; i++) {
        await timeout(2);
        persisted = await sessionDb.getMetadata("diffs");
      }
      assert.ok(persisted, "expected the compute pass to persist diffs to the session DB");
      assert.deepStrictEqual(JSON.parse(persisted), gitDiffs);
    });
    test("session changeset falls back to _meta.git base branch when persisted diff base is absent", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (_wd, opts) => {
          computeCalls.push({ baseBranch: opts.baseBranch });
          return [];
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      localStateManager.setSessionMeta(sessionStr, withSessionGitState(void 0, { baseBranchName: "main" }));
      localChangesets.refreshSessionChangeset(sessionStr);
      for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(computeCalls, [{ baseBranch: "main" }]);
    });
    test("session changeset keeps persisted diff base ahead of _meta.git base branch", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      await sessionDb.setMetadata("agentHost.diffBaseBranch", "release");
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computeCalls = [];
      const stubGit = {
        computeSessionFileDiffs: async (_wd, opts) => {
          computeCalls.push({ baseBranch: opts.baseBranch });
          return [];
        }
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      localStateManager.setSessionMeta(sessionStr, withSessionGitState(void 0, { baseBranchName: "main" }));
      localChangesets.refreshSessionChangeset(sessionStr);
      for (let i = 0; i < 50 && computeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(computeCalls, [{ baseBranch: "release" }]);
    });
    test("falls back to the edit-tracker aggregator when the git service returns undefined", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const stubGit = {
        computeSessionFileDiffs: async () => void 0
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      const envelopes = [];
      let resolveDiffs;
      const diffsEmitted = new Promise((r) => {
        resolveDiffs = r;
      });
      disposables.add(localStateManager.onDidEmitEnvelope((e) => {
        envelopes.push(e);
        if (e.action.type === ActionType.ChangesetStatusChanged) {
          resolveDiffs?.();
        }
      }));
      localChangesets.onTurnComplete(sessionUri.toString(), "turn-1");
      await diffsEmitted;
      const contentChanges = envelopes.map((e) => e.action).filter((a) => a.type === ActionType.ChangesetContentChanged);
      assert.deepStrictEqual(contentChanges.map((a) => a.files), [[]]);
      const statusAction = envelopes.map((e) => e.action).find((a) => a.type === ActionType.ChangesetStatusChanged);
      assert.ok(statusAction, "expected a changeset/statusChanged envelope from the fallback path");
    });
  });
  suite("computeUncommittedChangeset", () => {
    test("happy path: git returns diffs, state goes Ready with files, nothing persisted to the DB", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const sessionDataService = createSessionDataService(sessionDb);
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const gitDiffs = [
        { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 1, removed: 0 } },
        { after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } }, diff: { added: 2, removed: 1 } }
      ];
      const stubGit = {
        computeSessionFileDiffs: async () => gitDiffs
      };
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        sessionDataService,
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await localChangesets.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = localStateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        files: state?.files.map((f) => f.id).sort(),
        persistedUncommitted: await sessionDb.getMetadata("agentHost.changeset.uncommitted")
      }, {
        status: ChangesetStatus.Ready,
        files: ["file:///wd/a.ts", "file:///wd/b.ts"],
        persistedUncommitted: void 0
      });
    });
    test("no working directory: state goes Error with computeFailed", async () => {
      const sessionStr = sessionUri.toString();
      setupSession();
      await changesetService.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = stateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed"
      });
    });
    test("git returns undefined (not a git work tree): state goes Error with computeFailed", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      await changesetService.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = stateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed"
      });
    });
    test("git throws: state goes Error with original message", async () => {
      const stubGit = {
        computeSessionFileDiffs: async () => {
          throw new Error("git command failed");
        }
      };
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const localChangesets = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createNullSessionDataService(),
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildUncommittedChangesetUri(sessionUri.toString())),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      await localChangesets.computeUncommittedChangeset(sessionStr);
      const uncommittedUri = `${sessionStr}/changeset/uncommitted`;
      const snapshot = localStateManager.getSnapshot(uncommittedUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({
        status: state?.status,
        errorType: state?.error?.errorType,
        message: state?.error?.message
      }, {
        status: ChangesetStatus.Error,
        errorType: "computeFailed",
        message: "git command failed"
      });
    });
  });
  suite("deferred refresh (working directory unknown)", () => {
    function createDeferringService(subscriptions = []) {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const computes = [];
      const stubGit = {
        computeSessionFileDiffs: async () => {
          computes.push("session");
          return [];
        },
        computeUncommittedFileDiffs: async () => {
          computes.push("uncommitted");
          return [];
        }
      };
      const subscriptionService = createSubscriptionService(...subscriptions);
      const service = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createNullSessionDataService(),
        stubGit,
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        subscriptionService,
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      return { service, localStateManager, computes, subscriptions: subscriptionService.subscriptions };
    }
    function createSessionState(localStateManager, workingDirectory) {
      const sessionStr = sessionUri.toString();
      localStateManager.createSession({
        resource: sessionStr,
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: workingDirectory ? [workingDirectory] : void 0
      });
      localStateManager.setSessionChangesets(sessionStr, buildDefaultChangesetCatalog(sessionStr));
      return sessionStr;
    }
    test("refreshSessionChangeset / refreshBranchChangeset defer until the working directory is known, then drain the subscribed changesets", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([
        buildBranchChangesetUri(sessionStr),
        buildSessionChangesetUri(sessionStr)
      ]);
      createSessionState(localStateManager, void 0);
      service.refreshBranchChangeset(sessionStr);
      service.refreshSessionChangeset(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, [], "nothing computed while the working directory is unknown");
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes.sort(), ["session", "session"]);
    });
    test("computeUncommittedChangeset defers until the working directory is known, then drains", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([buildUncommittedChangesetUri(sessionStr)]);
      createSessionState(localStateManager, void 0);
      await service.computeUncommittedChangeset(sessionStr);
      assert.deepStrictEqual(computes, [], "uncommitted compute deferred while the working directory is unknown");
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, ["uncommitted"]);
    });
    test("a changeset unsubscribed before materialization is naturally skipped on drain", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes, subscriptions } = createDeferringService([buildSessionChangesetUri(sessionStr)]);
      createSessionState(localStateManager, void 0);
      service.refreshSessionChangeset(sessionStr);
      subscriptions.delete(buildSessionChangesetUri(sessionStr));
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, []);
    });
    test("onSessionDisposed clears every pending refresh for the session", async () => {
      const sessionStr = sessionUri.toString();
      const { service, localStateManager, computes } = createDeferringService([
        buildBranchChangesetUri(sessionStr),
        buildSessionChangesetUri(sessionStr),
        buildUncommittedChangesetUri(sessionStr)
      ]);
      createSessionState(localStateManager, void 0);
      service.refreshBranchChangeset(sessionStr);
      service.refreshSessionChangeset(sessionStr);
      await service.computeUncommittedChangeset(sessionStr);
      service.onSessionDisposed(sessionStr);
      const summary = localStateManager.getSessionSummary(sessionStr);
      localStateManager.markSessionPersisted(sessionStr, { ...summary, workingDirectories: ["file:///wd"] });
      service.onWorkingDirectoryAvailable(sessionStr);
      await timeout(0);
      assert.deepStrictEqual(computes, []);
    });
  });
  suite("restorePersistedStaticChangesets", () => {
    const aDiff = { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 1, removed: 0 } };
    const bDiff = { after: { uri: "file:///wd/b.ts", content: { uri: "file:///wd/b.ts" } }, diff: { added: 2, removed: 0 } };
    const sessionStr = sessionUri.toString();
    test("parsePersistedStaticChangesets parses without mutating state", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const result = changesetService.parsePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      assert.deepStrictEqual({
        session: result.session?.map((d) => d.after?.uri),
        sessionState: stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))
      }, {
        session: ["file:///wd/b.ts"],
        sessionState: { status: "computing", files: [] }
      });
    });
    test("applyPersistedStaticChangesets seeds parsed diffs", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const parsed = changesetService.parsePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      changesetService.applyPersistedStaticChangesets(sessionStr, parsed);
      const session = stateManager.getChangesetState(buildSessionChangesetUri(sessionStr));
      assert.deepStrictEqual(
        session && { status: session.status, files: session.files.map((f) => f.id) },
        { status: "ready", files: ["file:///wd/b.ts"] }
      );
    });
    test("new sessionRaw beats legacyRaw when both are present", () => {
      setupSession();
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([aDiff]),
        legacyRaw: JSON.stringify([bDiff])
        // would lose
      });
      assert.deepStrictEqual(result.session?.map((d) => d.after?.uri), ["file:///wd/a.ts"], "new key wins over legacy");
    });
    test("legacyRaw still restores session state when sessionRaw is absent", () => {
      setupSession();
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        legacyRaw: JSON.stringify([bDiff])
      });
      assert.deepStrictEqual(result.session?.map((d) => d.after?.uri), ["file:///wd/b.ts"]);
      const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.strictEqual((session?.state).status, "ready");
    });
    test("malformed JSON logs and returns undefined for that slot", () => {
      setupSession();
      changesetService.registerStaticChangesets(sessionStr);
      const result = changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: "{ not valid json"
      });
      assert.strictEqual(result.session, void 0, "malformed slot returns undefined");
      const session = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.strictEqual((session?.state).status, "computing");
    });
    test("seedIfEmpty honoured: live state with files is not overwritten", () => {
      setupSession();
      changesetService.restoreStaticChangeset(sessionStr, "session", [aDiff]);
      const before = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.deepStrictEqual((before?.state).files.map((f) => f.id), ["file:///wd/a.ts"]);
      changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([bDiff])
      });
      const after = stateManager.getSnapshot(`${sessionStr}/changeset/session`);
      assert.deepStrictEqual(
        (after?.state).files.map((f) => f.id),
        ["file:///wd/a.ts"],
        "live state must be preserved when persisted overlay tries to overwrite it"
      );
    });
    test("with live session state, restored diffs publish ready + catalogue counts", () => {
      setupSession();
      changesetService.restorePersistedStaticChangesets(sessionStr, {
        sessionRaw: JSON.stringify([aDiff, bDiff])
      });
      const catalogue = stateManager.getSessionState(sessionStr)?.changesets;
      const sessionEntry = catalogue?.find((c) => c.uriTemplate === `${sessionStr}/changeset/session`);
      assert.deepStrictEqual(sessionEntry, {
        label: "Branch Changes",
        uriTemplate: `${sessionStr}/changeset/session`,
        changeKind: "session"
      }, "catalogue counts must reflect restored files");
    });
  });
  suite("idle changeset LRU eviction", () => {
    const sessionStr = sessionUri.toString();
    test("idle changeset states are evicted over the soft limit", () => {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2 } }));
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      const third = `${sessionStr}/changeset/turn/turn-1`;
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      localStateManager.registerChangeset(third);
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first),
        second: localStateManager.getChangesetState(second)?.status,
        third: localStateManager.getChangesetState(third)?.status
      }, {
        first: void 0,
        second: "computing",
        third: "computing"
      });
    });
    test("evictability probe protects subscribed changesets", () => {
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      const third = `${sessionStr}/changeset/turn/turn-1`;
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 2, canEvict: (changeset) => changeset !== first } }));
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      localStateManager.registerChangeset(third);
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first)?.status,
        second: localStateManager.getChangesetState(second),
        third: localStateManager.getChangesetState(third)?.status
      }, {
        first: "computing",
        second: void 0,
        third: "computing"
      });
    });
    test("LRU eviction is silent and does not dispatch ChangesetCleared", () => {
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1 } }));
      const envelopes = [];
      const listener = disposables.add(localStateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      localStateManager.registerChangeset(`${sessionStr}/changeset/session`);
      localStateManager.registerChangeset(`${sessionStr}/changeset/uncommitted`);
      assert.deepStrictEqual(envelopes.map((e) => e.action.type), []);
      listener.dispose();
    });
    test("trimming reconsiders entries after they become evictable", () => {
      let canEvict = false;
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService(), { changesetStateRetention: { softLimit: 1, canEvict: () => canEvict } }));
      const first = `${sessionStr}/changeset/session`;
      const second = `${sessionStr}/changeset/uncommitted`;
      localStateManager.registerChangeset(first);
      localStateManager.registerChangeset(second);
      canEvict = true;
      localStateManager.onChangesetLivenessChanged();
      assert.deepStrictEqual({
        first: localStateManager.getChangesetState(first),
        second: localStateManager.getChangesetState(second)?.status
      }, {
        first: void 0,
        second: "computing"
      });
    });
  });
  suite("per-turn live streaming", () => {
    class CountingChangesetService extends AgentHostChangesetService {
      constructor() {
        super(...arguments);
        this.turnComputeCalls = [];
        this.uncommittedComputeCalls = [];
      }
      async computeTurnChangeset(session, turnId) {
        this.turnComputeCalls.push({ session, turnId });
        return super.computeTurnChangeset(session, turnId);
      }
      async computeUncommittedChangeset(session) {
        this.uncommittedComputeCalls.push(session);
        return super.computeUncommittedChangeset(session);
      }
    }
    let subscriptions;
    function makeService() {
      const subscriptionService = createSubscriptionService();
      subscriptions = subscriptionService.subscriptions;
      return disposables.add(new CountingChangesetService(
        stateManager,
        new NullLogService(),
        createNullSessionDataService(),
        createNoopGitService(),
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        subscriptionService,
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
    }
    test("onTurnComplete schedules a per-turn recompute when someone is subscribed", async () => {
      setupSession();
      const svc = makeService();
      subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), "turn-1"));
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 50 && svc.turnComputeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(
        svc.turnComputeCalls,
        [{ session: sessionUri.toString(), turnId: "turn-1" }],
        "expected exactly one per-turn compute for the completed turn"
      );
    });
    test("onTurnComplete does NOT schedule a per-turn recompute when nobody is subscribed", async () => {
      setupSession();
      const svc = makeService();
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      await timeout(20);
      assert.deepStrictEqual(svc.turnComputeCalls, [], "no per-turn compute when nothing observes the turn URI");
    });
    test("onTurnComplete schedules an uncommitted recompute when someone is subscribed", async () => {
      setupSession();
      const svc = makeService();
      subscriptions.add(buildUncommittedChangesetUri(sessionUri.toString()));
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 50 && svc.uncommittedComputeCalls.length === 0; i++) {
        await timeout(2);
      }
      assert.deepStrictEqual(
        svc.uncommittedComputeCalls,
        [sessionUri.toString()],
        "expected exactly one uncommitted compute for the completed turn"
      );
    });
    test("onTurnComplete does NOT schedule an uncommitted recompute when nobody is subscribed", async () => {
      setupSession();
      const svc = makeService();
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      await timeout(20);
      assert.deepStrictEqual(svc.uncommittedComputeCalls, [], "no uncommitted compute when nothing observes the uncommitted URI");
    });
    test("onToolCallEditsApplied fires the per-turn debounce only when subscribers exist; cancelled by onTurnComplete", () => {
      return runWithFakedTimers({ useFakeTimers: true, maxTaskCount: 1e4 }, async () => {
        setupSession();
        const svc = makeService();
        subscriptions.add(buildTurnChangesetUri(sessionUri.toString(), "turn-1"));
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(6e3);
        assert.strictEqual(svc.turnComputeCalls.length, 1, "debounce should fire one per-turn compute");
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(1e3);
        svc.onTurnComplete(sessionUri.toString(), "turn-1");
        await timeout(10);
        assert.strictEqual(svc.turnComputeCalls.length, 2, "onTurnComplete cancels pending debounce and runs exactly one final compute");
        subscriptions.clear();
        svc.onToolCallEditsApplied(sessionUri.toString(), "turn-1");
        await timeout(6e3);
        assert.strictEqual(svc.turnComputeCalls.length, 2, "unsubscribed turn must not get any further per-turn computes");
      });
    });
    test("per-turn URI streams a ChangesetContentChanged snapshot as the same turn is recomputed", async () => {
      const sessionDb = new SessionDatabase(":memory:");
      disposables.add(toDisposable(() => sessionDb.close()));
      const localStateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
      const svc = disposables.add(new AgentHostChangesetService(
        localStateManager,
        new NullLogService(),
        createSessionDataService(sessionDb),
        createNoopGitService(),
        NULL_CHECKPOINT_SERVICE,
        disposables.add(new AgentConfigurationService(localStateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(buildTurnChangesetUri(sessionUri.toString(), "turn-1")),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      localStateManager.createSession({
        resource: sessionUri.toString(),
        provider: "mock",
        title: "Test",
        status: SessionStatus.Idle,
        createdAt: (/* @__PURE__ */ new Date()).toISOString(),
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: ["file:///wd"]
      });
      const envelopes = [];
      disposables.add(localStateManager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const turnUri = `${sessionUri.toString()}/changeset/turn/turn-1`;
      await svc.computeTurnChangeset(sessionUri.toString(), "turn-1");
      const statusReady = envelopes.find((e) => e.action.type === ActionType.ChangesetStatusChanged && e.channel === turnUri);
      assert.ok(statusReady, "first per-turn compute must transition the URI to ready");
      envelopes.length = 0;
      svc.onTurnComplete(sessionUri.toString(), "turn-1");
      for (let i = 0; i < 100 && !envelopes.some((e) => e.action.type === ActionType.ChangesetStatusChanged && e.channel === `${sessionUri.toString()}/changeset/session`); i++) {
        await timeout(2);
      }
      assert.ok(
        envelopes.some((e) => e.action.type === ActionType.ChangesetStatusChanged),
        "onTurnComplete must drive at least one downstream changeset status transition"
      );
    });
  });
  suite("computeCompareTurnsChangeset", () => {
    function makeCheckpointService(pairs, baselineRef) {
      return {
        ...NULL_CHECKPOINT_SERVICE,
        getTurnCheckpointPair: async (_session, turnId) => pairs[turnId],
        getBaselineCheckpointRef: async () => baselineRef
      };
    }
    test("publishes diffs as Ready when both checkpoints resolve and git returns diffs", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const expectedDiffs = [
        { after: { uri: "file:///wd/a.ts", content: { uri: "file:///wd/a.ts" } }, diff: { added: 4, removed: 1 } }
      ];
      const calls = [];
      const gitService = createNoopGitService();
      gitService.computeFileDiffsBetweenRefs = async (_wd, opts) => {
        calls.push({ fromRef: opts.fromRef, toRef: opts.toRef });
        return expectedDiffs;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "ref-orig-parent", current: "ref-orig" },
          "mod": { parent: "ref-orig", current: "ref-mod" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      assert.strictEqual(compareUri, `${sessionStr}/changeset/compare/orig/mod`);
      assert.deepStrictEqual(calls, [{ fromRef: "ref-orig", toRef: "ref-mod" }]);
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({ status: state?.status, ids: state?.files.map((f) => f.id) }, {
        status: "ready",
        ids: ["file:///wd/a.ts"]
      });
    });
    test("transitions to Error when either checkpoint is missing", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      let gitCalls = 0;
      gitService.computeFileDiffsBetweenRefs = async () => {
        gitCalls++;
        return void 0;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "ref-orig-parent", current: "ref-orig" }
          // 'mod' is intentionally absent
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.strictEqual(state?.status, "error");
      assert.ok(state?.error?.message.includes("modified turn"), `expected error to name the missing side, got ${state?.error?.message}`);
      assert.strictEqual(gitCalls, 0, "git must not be invoked when a checkpoint is missing");
    });
    test("returns empty Ready snapshot when both checkpoints point at the same ref", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      let gitCalls = 0;
      gitService.computeFileDiffsBetweenRefs = async () => {
        gitCalls++;
        return void 0;
      };
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "p1", current: "same-ref" },
          "mod": { parent: "same-ref", current: "same-ref" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.deepStrictEqual({ status: state?.status, files: state?.files }, { status: "ready", files: [] });
      assert.strictEqual(gitCalls, 0, "git diff must be short-circuited when both refs match");
    });
    test("transitions to Error when the git diff returns undefined (git failure, not empty)", async () => {
      const sessionStr = sessionUri.toString();
      setupSession("file:///wd");
      const gitService = createNoopGitService();
      gitService.computeFileDiffsBetweenRefs = async () => void 0;
      const svc = disposables.add(new AgentHostChangesetService(
        stateManager,
        new NullLogService(),
        createSessionDataService(new TestSessionDatabase()),
        gitService,
        makeCheckpointService({
          "orig": { parent: "p", current: "ref-orig" },
          "mod": { parent: "ref-orig", current: "ref-mod" }
        }),
        disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
        createOperationService(),
        createSubscriptionService(),
        NULL_REVIEW_SERVICE,
        NullTelemetryService
      ));
      const compareUri = await svc.computeCompareTurnsChangeset(sessionStr, "orig", "mod");
      const snapshot = stateManager.getSnapshot(compareUri);
      const state = snapshot?.state;
      assert.strictEqual(state?.status, "error");
      assert.ok(state?.error?.message.includes("git"), `expected git-failure error message, got ${state?.error?.message}`);
    });
  });
});
class RecordingLogService extends NullLogService {
  constructor() {
    super(...arguments);
    this.errors = [];
    this.warnings = [];
  }
  error(message) {
    this.errors.push(message instanceof Error ? message.message : message);
  }
  warn(message) {
    this.warnings.push(message);
  }
}
suite("AgentHostChangesetService - multi-root turn changeset", () => {
  const disposables = new DisposableStore();
  const sessionStr = AgentSession.uri("mock", "session-mr").toString();
  teardown(() => {
    disposables.clear();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function gitDiff(path, added = 1, removed = 0) {
    const uri = URI.file(path).toString();
    return { after: { uri, content: { uri } }, diff: { added, removed } };
  }
  function makeCheckpoint(pairFor) {
    return {
      ...NULL_CHECKPOINT_SERVICE,
      getTurnCheckpointPair: async (_session, _turnId, workingDirectory) => pairFor(workingDirectory?.toString())
    };
  }
  function build(options) {
    const log = options.log ?? new RecordingLogService();
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const db = options.db ?? new TestSessionDatabase();
    const diffService = new TestDiffComputeService();
    class TestableChangesetService extends AgentHostChangesetService {
      _createDiffComputeService() {
        return diffService;
      }
    }
    const sessionDataService = createSessionDataService(db);
    const peerDataService = options.peer ? createSessionDataService(options.peer.db) : void 0;
    const svc = disposables.add(new TestableChangesetService(
      stateManager,
      log,
      {
        ...sessionDataService,
        openDatabase: (resource) => options.peer?.resource === resource.toString() ? peerDataService.openDatabase(resource) : sessionDataService.openDatabase(resource)
      },
      options.git,
      options.checkpoint,
      disposables.add(new AgentConfigurationService(stateManager, new NullLogService())),
      createOperationService(),
      createSubscriptionService(...options.subscriptions ?? []),
      NULL_REVIEW_SERVICE,
      options.telemetry ?? NullTelemetryService
    ));
    stateManager.createSession({
      resource: sessionStr,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      workingDirectories: options.workingDirectories
    });
    if (options.peer) {
      stateManager.addChat(sessionStr, options.peer.resource);
      stateManager.dispatchServerAction(options.peer.resource, {
        type: ActionType.ChatTurnStarted,
        turnId: options.peer.turnId,
        startedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
        message: { text: "peer", origin: { kind: MessageKind.User } }
      });
      stateManager.dispatchServerAction(options.peer.resource, {
        type: ActionType.ChatTurnComplete,
        turnId: options.peer.turnId,
        duration: 1
      });
    }
    return { svc, stateManager, log };
  }
  test("aggregates turn diffs across all folders of a multi-root session", async () => {
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
    git.computeFileDiffsBetweenRefs = async (wd) => {
      const root = wd.toString();
      if (root === "file:///repoA") {
        return [gitDiff("/repoA/a.ts")];
      }
      if (root === "file:///repoB") {
        return [gitDiff("/repoB/b.ts")];
      }
      return void 0;
    };
    const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready);
    assert.deepStrictEqual(
      new Set(state?.files.map((f) => f.id)),
      /* @__PURE__ */ new Set([URI.file("/repoA/a.ts").toString(), URI.file("/repoB/b.ts").toString()]),
      "the turn changeset must contain files from every folder"
    );
  });
  test("partitions git vs non-git folders so git-folder edits are not double-counted by the DB", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({ turnId: "turn-1", toolCallId: "tcX", filePath: "/folderA/x.txt", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("a"), afterContent: encodeString("a\nb") });
    db.addEdit({ turnId: "turn-1", toolCallId: "tcY", filePath: "/repoB/y.txt", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("c"), afterContent: encodeString("c\nd") });
    db.addEdit({ turnId: "turn-1", toolCallId: "tcZ", filePath: "/repoB/z.txt", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("e"), afterContent: encodeString("e\nf") });
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => wd.toString() === "file:///repoB" ? URI.parse("file:///repoB") : void 0;
    git.computeFileDiffsBetweenRefs = async () => [gitDiff("/repoB/y.txt", 2, 0)];
    const checkpoint = makeCheckpoint(() => ({ parent: "p", current: "c" }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///folderA", "file:///repoB"], git, checkpoint, db });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready);
    const ids = state.files.map((f) => f.id);
    assert.deepStrictEqual(
      [...ids].sort(),
      [URI.file("/folderA/x.txt").toString(), URI.file("/repoB/y.txt").toString()].sort(),
      "non-git folderA comes from the DB; repoB comes from git only (no leaked z.txt)"
    );
    assert.strictEqual(
      ids.filter((id) => id === URI.file("/repoB/y.txt").toString()).length,
      1,
      "the git-backed file must appear exactly once"
    );
  });
  test("uses the owning peer database for multi-root non-git fallback", async () => {
    const sessionDb = new TestSessionDatabase();
    const peerDb = new TestSessionDatabase();
    peerDb.addEdit({ turnId: "peer-turn", toolCallId: "tc1", filePath: "/folderA/peer.txt", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("a"), afterContent: encodeString("a\nb") });
    const peerResource = "ahp-chat://peer-1/session-mr";
    const { svc, stateManager } = build({
      workingDirectories: ["file:///folderA", "file:///folderB"],
      git: createNoopGitService(),
      checkpoint: NULL_CHECKPOINT_SERVICE,
      db: sessionDb,
      peer: { resource: peerResource, db: peerDb, turnId: "peer-turn" }
    });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "peer-turn");
    assert.deepStrictEqual(stateManager.getChangesetState(turnUri)?.files.map((file) => file.id), [
      URI.file("/folderA/peer.txt").toString()
    ]);
  });
  test("diffs a repository shared by two working directories exactly once (dedup by repo root)", async () => {
    const git = createNoopGitService();
    git.getRepositoryRoot = async () => URI.parse("file:///repo");
    let diffCalls = 0;
    git.computeFileDiffsBetweenRefs = async () => {
      diffCalls++;
      return [gitDiff("/repo/shared.ts")];
    };
    const checkpoint = makeCheckpoint(() => ({ parent: "p", current: "c" }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///repo", "file:///repo/sub"], git, checkpoint });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    assert.strictEqual(diffCalls, 1, "the shared repository is diffed exactly once");
    const state = stateManager.getChangesetState(turnUri);
    assert.deepStrictEqual(state?.files.map((f) => f.id), [URI.file("/repo/shared.ts").toString()]);
  });
  test("keeps the turn changeset ready and logs an error when one folder git diff throws", async () => {
    const log = new RecordingLogService();
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
    git.computeFileDiffsBetweenRefs = async (wd) => {
      if (wd.toString() === "file:///repoBad") {
        throw new Error("git exploded");
      }
      return [gitDiff("/repoGood/g.ts")];
    };
    const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///repoBad", "file:///repoGood"], git, checkpoint, log });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready, "one folder failure must not error the whole changeset");
    assert.deepStrictEqual(state?.files.map((f) => f.id), [URI.file("/repoGood/g.ts").toString()]);
    assert.ok(log.errors.some((e) => e.includes("repoBad")), `expected an error naming the failing repository, got ${JSON.stringify(log.errors)}`);
  });
  test("a git repository whose turn diff fails falls back to that folder's DB edits", async () => {
    const log = new RecordingLogService();
    const db = new TestSessionDatabase();
    db.addEdit({ turnId: "turn-1", toolCallId: "tcBad", filePath: "/repoBad/x.ts", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("a"), afterContent: encodeString("a\nb") });
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
    git.computeFileDiffsBetweenRefs = async (wd) => {
      if (wd.toString() === "file:///repoBad") {
        throw new Error("git exploded");
      }
      return [gitDiff("/repoGood/g.ts")];
    };
    const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///repoBad", "file:///repoGood"], git, checkpoint, db, log });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready);
    assert.deepStrictEqual(
      [...state.files.map((f) => f.id)].sort(),
      [URI.file("/repoBad/x.ts").toString(), URI.file("/repoGood/g.ts").toString()].sort(),
      "the failed git repo contributes its DB-tracked edits instead of dropping the folder"
    );
    assert.ok(log.errors.some((e) => e.includes("repoBad") && e.includes("falling back to tracked edits")), `expected a fallback error naming the repo, got ${JSON.stringify(log.errors)}`);
  });
  test("a folder whose repository-root lookup throws is treated as non-git (DB fallback) without dropping the whole turn", async () => {
    const log = new RecordingLogService();
    const db = new TestSessionDatabase();
    db.addEdit({ turnId: "turn-1", toolCallId: "tcBad", filePath: "/repoBad/x.ts", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("a"), afterContent: encodeString("a\nb") });
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => {
      if (wd.toString() === "file:///repoBad") {
        throw new Error("rev-parse exploded");
      }
      return URI.parse(wd.toString());
    };
    git.computeFileDiffsBetweenRefs = async () => [gitDiff("/repoGood/g.ts")];
    const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
    const { svc, stateManager } = build({ workingDirectories: ["file:///repoBad", "file:///repoGood"], git, checkpoint, db, log });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.deepStrictEqual({
      status: state?.status,
      files: [...state.files.map((f) => f.id)].sort(),
      loggedRepoBad: log.errors.some((e) => e.includes("repoBad"))
    }, {
      status: ChangesetStatus.Ready,
      files: [URI.file("/repoBad/x.ts").toString(), URI.file("/repoGood/g.ts").toString()].sort(),
      loggedRepoBad: true
    }, "the failed-root folder falls back to its DB edits; the healthy folder is unaffected");
  });
  test("multi-folder turn diffs fan out over every repository with bounded concurrency and no cap", async () => {
    const log = new RecordingLogService();
    const repoCount = 25;
    const workingDirectories = Array.from({ length: repoCount }, (_, i) => `file:///repo${i}`);
    const diffCalls = [];
    let active = 0;
    let maxActive = 0;
    const pending = [];
    const git = createNoopGitService();
    git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
    git.computeFileDiffsBetweenRefs = async (wd) => {
      diffCalls.push(wd.toString());
      active++;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => pending.push(() => {
        active--;
        resolve();
      }));
      return [];
    };
    const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
    const { svc, stateManager } = build({ workingDirectories, git, checkpoint, log });
    const turnPromise = svc.computeTurnChangeset(sessionStr, "turn-1");
    for (let i = 0; i < 500 && diffCalls.length < 5; i++) {
      await timeout(1);
    }
    await timeout(10);
    const dispatchedWhileGated = diffCalls.length;
    let settled = false;
    void turnPromise.then(() => {
      settled = true;
    });
    while (!settled) {
      pending.shift()?.();
      await timeout(0);
    }
    const turnUri = await turnPromise;
    assert.deepStrictEqual({
      dispatchedWhileGated,
      maxActive,
      totalDiffed: diffCalls.length,
      warnedAboutCapping: log.warnings.some((w) => w.includes("capping")),
      status: stateManager.getChangesetState(turnUri)?.status
    }, {
      dispatchedWhileGated: 5,
      maxActive: 5,
      totalDiffed: repoCount,
      warnedAboutCapping: false,
      status: ChangesetStatus.Ready
    });
  });
  test("single-folder checkpoint path is byte-for-byte unchanged", async () => {
    const checkpointCalls = [];
    const checkpoint = {
      ...NULL_CHECKPOINT_SERVICE,
      getTurnCheckpointPair: async (_session, turnId, workingDirectory) => {
        checkpointCalls.push({ turnId, workingDirectory: workingDirectory?.toString() });
        return { parent: "p", current: "c" };
      }
    };
    const git = createNoopGitService();
    let repoRootCalls = 0;
    git.getRepositoryRoot = async () => {
      repoRootCalls++;
      return void 0;
    };
    const diffCalls = [];
    git.computeFileDiffsBetweenRefs = async (wd, opts) => {
      diffCalls.push({ wd: wd.toString(), fromRef: opts.fromRef, toRef: opts.toRef });
      return [gitDiff("/wd/only.ts")];
    };
    const { svc, stateManager } = build({ workingDirectories: ["file:///wd"], git, checkpoint });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready);
    assert.deepStrictEqual(state?.files.map((f) => f.id), [URI.file("/wd/only.ts").toString()]);
    assert.strictEqual(repoRootCalls, 0, "single-folder path must not resolve per-folder repositories");
    assert.deepStrictEqual(checkpointCalls, [{ turnId: "turn-1", workingDirectory: void 0 }], "checkpoint pair is requested session-wide, not per-repo");
    assert.deepStrictEqual(diffCalls, [{ wd: "file:///wd", fromRef: "p", toRef: "c" }]);
  });
  test("single-folder DB fallback path is byte-for-byte unchanged", async () => {
    const db = new TestSessionDatabase();
    db.addEdit({ turnId: "turn-1", toolCallId: "tc1", filePath: "/wd/tracked.ts", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("1"), afterContent: encodeString("1\n2") });
    const checkpoint = { ...NULL_CHECKPOINT_SERVICE, getTurnCheckpointPair: async () => void 0 };
    const git = createNoopGitService();
    let repoRootCalls = 0;
    git.getRepositoryRoot = async () => {
      repoRootCalls++;
      return void 0;
    };
    const { svc, stateManager } = build({ workingDirectories: ["file:///wd"], git, checkpoint, db });
    const turnUri = await svc.computeTurnChangeset(sessionStr, "turn-1");
    const state = stateManager.getChangesetState(turnUri);
    assert.strictEqual(state?.status, ChangesetStatus.Ready);
    assert.deepStrictEqual(state?.files.map((f) => f.id), [URI.file("/wd/tracked.ts").toString()], "fallback returns all of the turn edits, exactly as today");
    assert.strictEqual(repoRootCalls, 0, "single-folder fallback must not resolve repositories");
  });
  suite("all-folder branch summary", () => {
    async function waitForSummaryChanges(stateManager) {
      for (let i = 0; i < 500; i++) {
        const changes = stateManager.getSessionSummary(sessionStr)?.changes;
        if (changes) {
          return changes;
        }
        await timeout(1);
      }
      return stateManager.getSessionSummary(sessionStr)?.changes;
    }
    async function waitForCount(count, target) {
      for (let i = 0; i < 500 && count() < target; i++) {
        await timeout(1);
      }
    }
    test("sums every repository branch diff, not just the primary", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 3, 1)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 5, 2), gitDiff("/repoB/c.ts", 1, 0)];
        }
        return void 0;
      };
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(changes, { additions: 9, deletions: 3, files: 3 }, "the chip counts every folder, not only the primary");
      assert.deepStrictEqual(
        JSON.parse(await db.getMetadata(META_CHANGES_SUMMARY)),
        { additions: 9, deletions: 3, files: 3 },
        "the persisted META_CHANGES_SUMMARY carries the all-folder aggregate for the inactive-list path"
      );
    });
    test("all-folder summary survives a subsequent branch recompute, reusing the primary diff (not clobbered, not re-diffed)", async () => {
      const calls = [];
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        calls.push(wd.toString());
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 1, 0)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 1, 0)];
        }
        return void 0;
      };
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE });
      svc.refreshBranchChangeset(sessionStr);
      const first = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(first, { additions: 2, deletions: 0, files: 2 }, "first recompute yields the all-folder aggregate");
      const callsAfterFirst = calls.length;
      svc.refreshBranchChangeset(sessionStr);
      await waitForCount(() => calls.length, callsAfterFirst + 2);
      await timeout(10);
      const secondRecompute = calls.slice(callsAfterFirst);
      assert.strictEqual(secondRecompute.filter((c) => c === "file:///repoA").length, 1, "the primary repo is diffed exactly once per recompute (reused by the summary, not re-diffed)");
      assert.strictEqual(secondRecompute.length, 2, "a 2-repo session issues 2 diffs per branch recompute, not 3");
      assert.deepStrictEqual(
        stateManager.getSessionSummary(sessionStr)?.changes,
        { additions: 2, deletions: 0, files: 2 },
        "branch recompute must not clobber the all-folder aggregate back to the primary-only count"
      );
    });
    test("all-folder chip survives idle eviction (evicted-but-warm): not clobbered to primary-only", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 3, 1)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 5, 2)];
        }
        return void 0;
      };
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      svc.refreshSessionChangeset(sessionStr);
      const warm = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(warm, { additions: 8, deletions: 3, files: 2 }, "all-folder chip while the session is warm");
      await waitForCount(() => stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))?.status === ChangesetStatus.Ready ? 1 : 0, 1);
      const persistedSummary = await db.getMetadata(META_CHANGES_SUMMARY);
      stateManager.removeSession(sessionStr);
      assert.strictEqual(stateManager.getSessionSummary(sessionStr)?.changes, void 0, "live summary is gone after eviction");
      assert.strictEqual(stateManager.getChangesetState(buildSessionChangesetUri(sessionStr))?.status, ChangesetStatus.Ready, "session changeset stays cached after eviction (LRU keeps the on-screen chip)");
      const keys = svc.getListMetadataKeys(sessionStr);
      assert.ok(keys && keys[META_CHANGES_SUMMARY], `getListMetadataKeys must request the persisted summary post-eviction, got ${JSON.stringify(keys)}`);
      const overlay = svc.computeListEntryChanges(sessionStr, { [META_CHANGES_SUMMARY]: persistedSummary });
      assert.deepStrictEqual(overlay, { additions: 8, deletions: 3, files: 2 }, "evicted chip stays all-folder, not primary-only");
      assert.deepStrictEqual(JSON.parse(await db.getMetadata(META_CHANGES_SUMMARY)), { additions: 8, deletions: 3, files: 2 }, "persisted all-folder summary is not clobbered");
    });
    test("multi-folder branch changeset DATA stays primary-only (AC-8 data fence)", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 1, 0)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 1, 0)];
        }
        return void 0;
      };
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE });
      svc.refreshBranchChangeset(sessionStr);
      await waitForSummaryChanges(stateManager);
      const branch = stateManager.getChangesetState(buildBranchChangesetUri(sessionStr));
      assert.deepStrictEqual(branch?.files.map((f) => f.id), [URI.file("/repoA/a.ts").toString()], "branch changeset data stays primary-only in a multi-root session");
    });
    test("single-folder summary stays branch-derived (characterization: byte-for-byte unchanged)", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async () => [gitDiff("/wd/only.ts", 4, 2)];
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///wd"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(changes, { additions: 4, deletions: 2, files: 1 });
      assert.deepStrictEqual(
        JSON.parse(await db.getMetadata(META_CHANGES_SUMMARY)),
        { additions: 4, deletions: 2, files: 1 }
      );
    });
    test("a repository whose branch diff throws is skipped and logged, without failing the aggregate", async () => {
      const log = new RecordingLogService();
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        const root = wd.toString();
        if (root === "file:///repoBad") {
          throw new Error("branch diff exploded");
        }
        if (root === "file:///repoGood1") {
          return [gitDiff("/repoGood1/a.ts", 2, 0)];
        }
        if (root === "file:///repoGood2") {
          return [gitDiff("/repoGood2/b.ts", 5, 1)];
        }
        return void 0;
      };
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoGood1", "file:///repoBad", "file:///repoGood2"], git, checkpoint: NULL_CHECKPOINT_SERVICE, log });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(changes, { additions: 7, deletions: 1, files: 2 }, "the failing repository is excluded, the rest still counted");
      assert.ok(log.errors.some((e) => e.includes("repoBad")), `expected an error naming the failing repository, got ${JSON.stringify(log.errors)}`);
    });
    test("threads a base branch per repository (primary uses the session base, secondaries their default)", async () => {
      const calls = [];
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.getDefaultBranch = async (wd) => wd.toString() === "file:///repoB" ? { name: "develop", startPoint: "origin/develop" } : void 0;
      git.computeSessionFileDiffs = async (wd, opts) => {
        calls.push({ wd: wd.toString(), baseBranch: opts.baseBranch });
        return wd.toString() === "file:///repoA" ? [gitDiff("/repoA/a.ts", 1, 0)] : [gitDiff("/repoB/b.ts", 1, 0)];
      };
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      stateManager.setSessionMeta(sessionStr, withSessionGitState(void 0, { baseBranchName: "main" }));
      svc.refreshBranchChangeset(sessionStr);
      await waitForSummaryChanges(stateManager);
      const repoA = calls.filter((c) => c.wd === "file:///repoA");
      const repoB = calls.filter((c) => c.wd === "file:///repoB");
      assert.ok(repoA.length > 0 && repoA.every((c) => c.baseBranch === "main"), `primary repo must use the session base branch, got ${JSON.stringify(repoA)}`);
      assert.ok(repoB.length > 0 && repoB.every((c) => c.baseBranch === "develop"), `secondary repo must use its own default branch (not HEAD), got ${JSON.stringify(repoB)}`);
    });
    test("all-folder summary is computed even when the primary branch diff is unavailable", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => wd.toString() === "file:///repoB" ? [gitDiff("/repoB/b.ts", 4, 1)] : void 0;
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(changes, { additions: 4, deletions: 1, files: 1 }, "the all-folder chip is independent of the primary branch changeset succeeding");
    });
    test("folds non-git folder edits into the all-folder chip", async () => {
      const db = new TestSessionDatabase();
      db.addEdit({ turnId: "turn-1", toolCallId: "tcA", filePath: "/folderA/x.txt", kind: FileEditKind.Edit, addedLines: void 0, removedLines: void 0, beforeContent: encodeString("a"), afterContent: encodeString("a\nb") });
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => wd.toString() === "file:///repoB" ? URI.parse("file:///repoB") : void 0;
      git.computeSessionFileDiffs = async (wd) => wd.toString() === "file:///repoB" ? [gitDiff("/repoB/y.txt", 5, 2)] : void 0;
      const { svc, stateManager } = build({ workingDirectories: ["file:///folderA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(changes, { additions: 6, deletions: 2, files: 2 }, "non-git folder DB edits count toward the chip alongside git repos");
    });
    test("total git failure preserves the cached all-folder summary (not clobbered to zero)", async () => {
      let available = true;
      const calls = [];
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async (wd) => {
        calls.push(wd.toString());
        if (!available) {
          return void 0;
        }
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 3, 1)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 5, 2)];
        }
        return void 0;
      };
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const warm = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual(warm, { additions: 8, deletions: 3, files: 2 }, "warm all-folder aggregate");
      await timeout(10);
      const callsAfterWarm = calls.length;
      available = false;
      svc.refreshBranchChangeset(sessionStr);
      await waitForCount(() => calls.length, callsAfterWarm + 1);
      await timeout(10);
      assert.deepStrictEqual({
        live: stateManager.getSessionSummary(sessionStr)?.changes,
        persisted: JSON.parse(await db.getMetadata(META_CHANGES_SUMMARY))
      }, {
        live: { additions: 8, deletions: 3, files: 2 },
        persisted: { additions: 8, deletions: 3, files: 2 }
      }, "total failure preserves the live and persisted summary instead of overwriting it with zeros");
    });
    test("all repositories succeeding with no changes writes a zero summary (no over-preserve)", async () => {
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeSessionFileDiffs = async () => [];
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual({
        live: changes,
        persisted: JSON.parse(await db.getMetadata(META_CHANGES_SUMMARY))
      }, {
        live: { additions: 0, deletions: 0, files: 0 },
        persisted: { additions: 0, deletions: 0, files: 0 }
      }, "a genuinely empty all-folder aggregate is written as zero, not preserved");
    });
    test("a secondary default-branch lookup rejection yields a partial summary and keeps the branch changeset Ready (never Error)", async () => {
      const log = new RecordingLogService();
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.getDefaultBranch = async (wd) => {
        if (wd.toString() === "file:///repoB") {
          throw new Error("default branch lookup exploded");
        }
        return void 0;
      };
      git.computeSessionFileDiffs = async (wd) => {
        const root = wd.toString();
        if (root === "file:///repoA") {
          return [gitDiff("/repoA/a.ts", 3, 1)];
        }
        if (root === "file:///repoB") {
          return [gitDiff("/repoB/b.ts", 5, 2)];
        }
        return void 0;
      };
      const db = new TestSessionDatabase();
      const { svc, stateManager } = build({ workingDirectories: ["file:///repoA", "file:///repoB"], git, checkpoint: NULL_CHECKPOINT_SERVICE, db, log });
      svc.refreshBranchChangeset(sessionStr);
      const changes = await waitForSummaryChanges(stateManager);
      assert.deepStrictEqual({
        changes,
        branchStatus: stateManager.getChangesetState(buildBranchChangesetUri(sessionStr))?.status,
        loggedRepoB: log.errors.some((e) => e.includes("repoB"))
      }, {
        // repoB is unavailable (its default-branch probe threw); only the
        // primary repoA contributes to the partial aggregate.
        changes: { additions: 3, deletions: 1, files: 1 },
        branchStatus: ChangesetStatus.Ready,
        loggedRepoB: true
      }, "a secondary default-branch failure must not flip the published branch changeset to Error");
    });
  });
  suite("telemetry emission", () => {
    async function waitForTelemetry(telemetry, eventName, match) {
      const find = () => telemetry.events.find((e) => e.eventName === eventName && (!match || match(e.data)));
      for (let i = 0; i < 200 && !find(); i++) {
        await timeout(0);
      }
      const event = find();
      assert.ok(event, `expected telemetry event ${eventName}`);
      return event.data;
    }
    test("changesetComputed (turn) carries correlation and omits multi-root fields for a single-root turn", async () => {
      const telemetry = new CapturingTelemetryService();
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeFileDiffsBetweenRefs = async () => [gitDiff("/repo/a.ts")];
      const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
      const { svc } = build({
        workingDirectories: ["file:///repo"],
        git,
        checkpoint,
        telemetry,
        subscriptions: [buildTurnChangesetUri(sessionStr, "turn-1")]
      });
      svc.onTurnComplete(sessionStr, "turn-1", {
        clientType: AgentHostClientType.EditorWindow,
        connectionKind: AgentHostClientConnectionKind.RemoteExtensionHost,
        transportKind: AgentHostTransportKind.MessagePort,
        hostLaunchKind: AgentHostLaunchKind.VSCodeMainProcess,
        machineId: "client-machine-id",
        devDeviceId: "client-dev-device-id"
      });
      const data = await waitForTelemetry(telemetry, "agentHost.changesetComputed", (d) => d.kind === "turn");
      assert.deepStrictEqual({
        provider: data.provider,
        agentSessionId: data.agentSessionId,
        turnId: data.turnId,
        initiatorClientType: data.initiatorClientType,
        initiatorConnectionKind: data.initiatorConnectionKind,
        initiatorTransportKind: data.initiatorTransportKind,
        hostLaunchKind: data.hostLaunchKind,
        initiatorMachineId: data.initiatorMachineId,
        initiatorDevDeviceId: data.initiatorDevDeviceId,
        kind: data.kind,
        outcome: data.outcome,
        isMultiRoot: data.isMultiRoot,
        folderCount: data.folderCount,
        hasFileCount: data.fileCount !== void 0,
        hasMultiRootFields: data.uniqueGitFolderCount !== void 0 || data.trackedEditFallbackFolderCount !== void 0
      }, {
        provider: URI.parse(sessionStr).scheme,
        agentSessionId: AgentSession.id(sessionStr),
        turnId: "turn-1",
        initiatorClientType: "editor_window",
        initiatorConnectionKind: "remote_extension_host",
        initiatorTransportKind: "message_port",
        hostLaunchKind: "vscode_main_process",
        initiatorMachineId: "client-machine-id",
        initiatorDevDeviceId: "client-dev-device-id",
        kind: "turn",
        outcome: "computed",
        isMultiRoot: false,
        folderCount: 1,
        hasFileCount: true,
        hasMultiRootFields: false
      });
    });
    test("changesetComputed (turn) carries the multi-root fan-out fields for a multi-root turn", async () => {
      const telemetry = new CapturingTelemetryService();
      const git = createNoopGitService();
      git.getRepositoryRoot = async (wd) => URI.parse(wd.toString());
      git.computeFileDiffsBetweenRefs = async (wd) => wd.toString() === "file:///repoA" ? [gitDiff("/repoA/a.ts")] : [gitDiff("/repoB/b.ts")];
      const checkpoint = makeCheckpoint((root) => ({ parent: `${root}~p`, current: `${root}~c` }));
      const { svc } = build({
        workingDirectories: ["file:///repoA", "file:///repoB"],
        git,
        checkpoint,
        telemetry,
        subscriptions: [buildTurnChangesetUri(sessionStr, "turn-1")]
      });
      svc.onTurnComplete(sessionStr, "turn-1");
      const data = await waitForTelemetry(telemetry, "agentHost.changesetComputed", (d) => d.kind === "turn");
      assert.deepStrictEqual({
        kind: data.kind,
        outcome: data.outcome,
        isMultiRoot: data.isMultiRoot,
        folderCount: data.folderCount,
        uniqueGitFolderCount: data.uniqueGitFolderCount,
        nonGitFolderCount: data.nonGitFolderCount,
        trackedEditFallbackFolderCount: data.trackedEditFallbackFolderCount
      }, {
        kind: "turn",
        outcome: "computed",
        isMultiRoot: true,
        folderCount: 2,
        uniqueGitFolderCount: 2,
        nonGitFolderCount: 0,
        trackedEditFallbackFolderCount: 0
      });
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyB0aW1lb3V0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZVN0b3JlLCB0b0Rpc3Bvc2FibGUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcnVuV2l0aEZha2VkVGltZXJzIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi90aW1lVHJhdmVsU2NoZWR1bGVyLmpzJztcbmltcG9ydCB7IE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENsaWVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2xpZW50SW5mby5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDbGllbnRDb25uZWN0aW9uS2luZCwgQWdlbnRIb3N0TGF1bmNoS2luZCwgQWdlbnRIb3N0VHJhbnNwb3J0S2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RUZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmksIGJ1aWxkRGVmYXVsdENoYW5nZXNldENhdGFsb2csIGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaSwgYnVpbGRUdXJuQ2hhbmdlc2V0VXJpLCBidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25FbnZlbG9wZSwgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGFuZ2VzZXRTdGF0dXMsIEZpbGVFZGl0S2luZCwgTWVzc2FnZUtpbmQsIFNlc3Npb25TdGF0dXMsIHdpdGhTZXNzaW9uR2l0U3RhdGUsIHR5cGUgQ2hhbmdlc2V0LCB0eXBlIElTZXNzaW9uRmlsZURpZmYgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTUVUQV9DSEFOR0VTX1NVTU1BUlkgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZS5qcyc7XG5pbXBvcnQgdHlwZSB7IENoYW5nZXNTdW1tYXJ5IH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgdHlwZSBJQWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hlY2twb2ludFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgTlVMTF9SRVZJRVdfU0VSVklDRSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudEhvc3RSZXZpZXdTZXJ2aWNlLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RHaXRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSVRlbGVtZXRyeVNlcnZpY2UsIFRlbGVtZXRyeUxldmVsIH0gZnJvbSAnLi4vLi4vLi4vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgTnVsbFRlbGVtZXRyeVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi90ZWxlbWV0cnkvY29tbW9uL3RlbGVtZXRyeVV0aWxzLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdFN0YXRlTWFuYWdlciB9IGZyb20gJy4uLy4uL25vZGUvYWdlbnRIb3N0U3RhdGVNYW5hZ2VyLmpzJztcbmltcG9ydCB7IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vLi4vbm9kZS9zZXNzaW9uRGF0YWJhc2UuanMnO1xuaW1wb3J0IHsgY3JlYXRlTm9vcEdpdFNlcnZpY2UsIGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UsIGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZSwgZW5jb2RlU3RyaW5nLCBUZXN0RGlmZkNvbXB1dGVTZXJ2aWNlLCBUZXN0U2Vzc2lvbkRhdGFiYXNlIH0gZnJvbSAnLi4vY29tbW9uL3Nlc3Npb25UZXN0SGVscGVycy5qcyc7XG5cbi8qKlxuICogQnVpbGRzIGEgdGVzdCBzdWJzY3JpcHRpb24gc2VydmljZSBiYWNrZWQgYnkgYSBtdXRhYmxlIHNldCBvZiBzdWJzY3JpYmVkXG4gKiBjaGFuZ2VzZXQgVVJJcywgc28gc2VydmljZSB0ZXN0cyBjYW4gc2ltdWxhdGUgc3Vic2NyaWJlIC8gdW5zdWJzY3JpYmVcbiAqIHdpdGhvdXQgd2lyaW5nIHVwIHRoZSBjb29yZGluYXRvci5cbiAqL1xuZnVuY3Rpb24gY3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZSguLi5jaGFuZ2VzZXRzOiBzdHJpbmdbXSk6IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlICYgeyByZWFkb25seSBzdWJzY3JpcHRpb25zOiBTZXQ8c3RyaW5nPiB9IHtcblx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IG5ldyBTZXQoY2hhbmdlc2V0cyk7XG5cdHJldHVybiB7XG5cdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdHN1YnNjcmlwdGlvbnMsXG5cdFx0Z2V0U2Vzc2lvblN1YnNjcmlwdGlvbnM6ICgpID0+IHN1YnNjcmlwdGlvbnMsXG5cdFx0YWRkU3Vic2NyaXB0aW9uOiAoX3Nlc3Npb24sIGNoYW5nZXNldCkgPT4geyBzdWJzY3JpcHRpb25zLmFkZChjaGFuZ2VzZXQpOyB9LFxuXHRcdHJlbW92ZVN1YnNjcmlwdGlvbjogKF9zZXNzaW9uLCBjaGFuZ2VzZXQpID0+IHsgc3Vic2NyaXB0aW9ucy5kZWxldGUoY2hhbmdlc2V0KTsgfSxcblx0XHRjbGVhclNlc3Npb25TdWJzY3JpcHRpb25zOiAoKSA9PiB7IHN1YnNjcmlwdGlvbnMuY2xlYXIoKTsgfSxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBuby1vcCBjaGFuZ2VzZXQgb3BlcmF0aW9uIHNlcnZpY2UgZm9yIHRlc3RzLiBJdCBhZHZlcnRpc2VzIG5vXG4gKiBvcGVyYXRpb25zLCB3aGljaCBtaXJyb3JzIHRoZSBkZWZhdWx0IGJlaGF2aW91ciBvZiBhIHNlc3Npb24gd2l0aG91dCBhbnlcbiAqIG9wZXJhdGlvbiBjb250cmlidXRpb25zLlxuICovXG5mdW5jdGlvbiBjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCk6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlIHtcblx0cmV0dXJuIHtcblx0XHRfc2VydmljZUJyYW5kOiB1bmRlZmluZWQsXG5cdFx0cmVnaXN0ZXJDb250cmlidXRpb246ICgpID0+IHRvRGlzcG9zYWJsZSgoKSA9PiB7IH0pLFxuXHRcdHVwZGF0ZU9wZXJhdGlvbnM6ICgpID0+IHsgfSxcblx0XHRnZXRPcGVyYXRpb25zOiAoKSA9PiB1bmRlZmluZWQsXG5cdFx0aW52b2tlQ2hhbmdlc2V0T3BlcmF0aW9uOiBhc3luYyAoKSA9PiB7IHRocm93IG5ldyBFcnJvcignbm90IGltcGxlbWVudGVkJyk7IH0sXG5cdFx0ZGlzcG9zZTogKCkgPT4geyB9LFxuXHR9O1xufVxuXG4vKiogQ2FwdHVyZXMgYHB1YmxpY0xvZzJgIHRlbGVtZXRyeSBldmVudHMgc28gdGVzdHMgY2FuIGFzc2VydCBvbiBlbWl0dGVkIGZpZWxkcy4gKi9cbmNsYXNzIENhcHR1cmluZ1RlbGVtZXRyeVNlcnZpY2UgaW1wbGVtZW50cyBJVGVsZW1ldHJ5U2VydmljZSB7XG5cdGRlY2xhcmUgcmVhZG9ubHkgX3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkO1xuXHRyZWFkb25seSB0ZWxlbWV0cnlMZXZlbCA9IFRlbGVtZXRyeUxldmVsLlVTQUdFO1xuXHRyZWFkb25seSBzZXNzaW9uSWQgPSAndGVzdC1zZXNzaW9uJztcblx0cmVhZG9ubHkgbWFjaGluZUlkID0gJ3Rlc3QtbWFjaGluZSc7XG5cdHJlYWRvbmx5IHNxbUlkID0gJ3Rlc3Qtc3FtJztcblx0cmVhZG9ubHkgZGV2RGV2aWNlSWQgPSAndGVzdC1kZXYtZGV2aWNlJztcblx0cmVhZG9ubHkgZmlyc3RTZXNzaW9uRGF0ZSA9ICd0ZXN0LWZpcnN0LXNlc3Npb24tZGF0ZSc7XG5cdHJlYWRvbmx5IHNlbmRFcnJvclRlbGVtZXRyeSA9IGZhbHNlO1xuXHRyZWFkb25seSBldmVudHM6IHsgZXZlbnROYW1lOiBzdHJpbmc7IGRhdGE6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH1bXSA9IFtdO1xuXG5cdHB1YmxpY0xvZygpOiB2b2lkIHsgfVxuXHRwdWJsaWNMb2cyKGV2ZW50TmFtZTogc3RyaW5nLCBkYXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiB2b2lkIHtcblx0XHR0aGlzLmV2ZW50cy5wdXNoKHsgZXZlbnROYW1lLCBkYXRhOiBkYXRhID8/IHt9IH0pO1xuXHR9XG5cdHB1YmxpY0xvZ0Vycm9yKCk6IHZvaWQgeyB9XG5cdHB1YmxpY0xvZ0Vycm9yMihldmVudE5hbWU6IHN0cmluZywgZGF0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+KTogdm9pZCB7XG5cdFx0dGhpcy5ldmVudHMucHVzaCh7IGV2ZW50TmFtZSwgZGF0YTogZGF0YSA/PyB7fSB9KTtcblx0fVxuXHRzZXRFeHBlcmltZW50UHJvcGVydHkoKTogdm9pZCB7IH1cblx0c2V0Q29tbW9uUHJvcGVydHkoKTogdm9pZCB7IH1cbn1cblxuc3VpdGUuc2tpcCgnQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZScsICgpID0+IHtcblxuXHRjb25zdCBkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0bGV0IHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRsZXQgY2hhbmdlc2V0U2VydmljZTogQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZTtcblxuXHRjb25zdCBzZXNzaW9uVXJpID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKTtcblxuXHRmdW5jdGlvbiBzZXR1cFNlc3Npb24od29ya2luZ0RpcmVjdG9yeT86IHN0cmluZyk6IHZvaWQge1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25DaGFuZ2VzZXRzKHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uVXJpLnRvU3RyaW5nKCkpKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaS50b1N0cmluZygpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0fVxuXG5cdHNldHVwKCgpID0+IHtcblx0XHRzdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdGNoYW5nZXNldFNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHROVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSksXG5cdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0KSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgncmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzIG1ha2VzIHRoZSB0d28gc3RhdGljIGNoYW5nZXNldCBVUklzIHN1YnNjcmliYWJsZSB3aXRoIGNvbXB1dGluZyBzdGF0dXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdC8vIENhdGFsb2d1ZSBpcyBzZWVkZWQgYnkgc2V0dXBTZXNzaW9uIChtaXJyb3JzIHdoYXQgYF9idWlsZEluaXRpYWxTdW1tYXJ5YFxuXHRcdC8vIGRvZXMgaW4gcHJvZHVjdGlvbikgXHUyMDE0IHNhbml0eSBjaGVjayBiZWZvcmUgZXhlcmNpc2luZyByZWdpc3RyYXRpb24uXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzLCBbXG5cdFx0XHR7IGxhYmVsOiAnQnJhbmNoIENoYW5nZXMnLCB1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gLCBjaGFuZ2VLaW5kOiAnc2Vzc2lvbicgfSxcblx0XHRcdHsgbGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJywgdXJpVGVtcGxhdGU6IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGAsIGRlc2NyaXB0aW9uOiAnU2hvdyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGluIHRoaXMgc2Vzc2lvbicsIGNoYW5nZUtpbmQ6ICd1bmNvbW1pdHRlZCcgfSxcblx0XHRdKTtcblxuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXG5cdFx0Ly8gQm90aCBzdGF0aWMgY2hhbmdlc2V0IFVSSXMgYXJlIG5vdyByZWdpc3RlcmVkIGFuZCBzdWJzY3JpYmFibGVcblx0XHQvLyB3aXRoIGBjb21wdXRpbmdgIHNuYXBzaG90cyBzbyBhIGNsaWVudCB0aGF0IHN1YnNjcmliZXMgYmVmb3JlXG5cdFx0Ly8gdGhlIGZpcnN0IGNvbXB1dGUgcGFzcyBzZWVzIGEgdmFsaWQgc3RhdGUuXG5cdFx0Zm9yIChjb25zdCBpZCBvZiBbJ3VuY29tbWl0dGVkJywgJ3Nlc3Npb24nXSkge1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0LyR7aWR9YCk7XG5cdFx0XHRhc3NlcnQub2soc25hcHNob3QsIGBleHBlY3RlZCAke2lkfSBjaGFuZ2VzZXQgVVJJIHRvIGJlIHN1YnNjcmliYWJsZWApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzbmFwc2hvdC5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cywgJ2NvbXB1dGluZycpO1xuXHRcdH1cblxuXHRcdC8vIFJlZ2lzdHJhdGlvbiBtdXN0IG5vdCBtdXRhdGUgdGhlIHNlZWRlZCBjYXRhbG9ndWUuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzLCBbXG5cdFx0XHR7IGxhYmVsOiAnQnJhbmNoIENoYW5nZXMnLCB1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gLCBjaGFuZ2VLaW5kOiAnc2Vzc2lvbicgfSxcblx0XHRcdHsgbGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJywgdXJpVGVtcGxhdGU6IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGAsIGRlc2NyaXB0aW9uOiAnU2hvdyB1bmNvbW1pdHRlZCBjaGFuZ2VzIGluIHRoaXMgc2Vzc2lvbicsIGNoYW5nZUtpbmQ6ICd1bmNvbW1pdHRlZCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzIGlzIGlkZW1wb3RlbnQgYWNyb3NzIHJlcGVhdGVkIGNhbGxzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyKTtcblx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyKTtcblx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyKTtcblxuXHRcdGNvbnN0IGNoYW5nZXNldHMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VzZXRzPy5sZW5ndGgsIDUsICdleHBlY3RlZCB0aGUgdGhyZWUgZGVmYXVsdCBjYXRhbG9ndWUgZW50cmllcycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU3RhdGljQ2hhbmdlc2V0IHB1Ymxpc2hlcyBmaWxlcyBpbiBSZWFkeSBhbmQgcmVmcmVzaGVzIGNhdGFsb2d1ZSBjb3VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdGNvbnN0IGRpZmZzID0gW1xuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiA1LCByZW1vdmVkOiAyIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2IudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3Nlc3Npb24nLCBkaWZmcyk7XG5cblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmA7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoY2hhbmdlc2V0VXJpKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QsICdleHBlY3RlZCB0aGUgY2hhbmdlc2V0IFVSSSB0byBiZSBzdWJzY3JpYmFibGUnKTtcblx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmc7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuc3RhdHVzLCAncmVhZHknKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLmZpbGVzLm1hcChmID0+IGYuaWQpLCBbJ2ZpbGU6Ly8vd2QvYS50cycsICdmaWxlOi8vL3dkL2IudHMnXSk7XG5cblx0XHRjb25zdCBjYXRhbG9ndWUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2F0YWxvZ3VlLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGxhYmVsOiAnQnJhbmNoIENoYW5nZXMnLFxuXHRcdFx0XHR1cmlUZW1wbGF0ZTogY2hhbmdlc2V0VXJpLFxuXHRcdFx0XHRjaGFuZ2VLaW5kOiAnc2Vzc2lvbicsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRsYWJlbDogJ1VuY29tbWl0dGVkIENoYW5nZXMnLFxuXHRcdFx0XHR1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdTaG93IHVuY29tbWl0dGVkIGNoYW5nZXMgaW4gdGhpcyBzZXNzaW9uJyxcblx0XHRcdFx0Y2hhbmdlS2luZDogJ3VuY29tbWl0dGVkJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTdGF0aWNDaGFuZ2VzZXQgY2F0YWxvZ3VlIGNvdW50cyBvbmx5IGVtaXR0ZWQgdW5pcXVlIGZpbGVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRjb25zdCBkaWZmcyA9IFtcblx0XHRcdHtcblx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMTAwLCByZW1vdmVkOiA1MCB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMjAsIHJlbW92ZWQ6IDEwIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAzLCByZW1vdmVkOiAxIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2IudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYi50cycgfSB9LFxuXHRcdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVTdGF0aWNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3Nlc3Npb24nLCBkaWZmcyk7XG5cblx0XHRjb25zdCBjaGFuZ2VzZXRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmA7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoY2hhbmdlc2V0VXJpKTtcblx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmc7IGVkaXQ6IHsgZGlmZj86IHsgYWRkZWQ/OiBudW1iZXI7IHJlbW92ZWQ/OiBudW1iZXIgfSB9IH0+IH0gfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgY2F0YWxvZ3VlID0gc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uU3RyKT8uY2hhbmdlc2V0cztcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpbGVzOiBzdGF0ZT8uZmlsZXMubWFwKGYgPT4gKHsgaWQ6IGYuaWQsIGRpZmY6IGYuZWRpdC5kaWZmIH0pKSxcblx0XHRcdGNhdGFsb2d1ZSxcblx0XHR9LCB7XG5cdFx0XHRmaWxlczogW1xuXHRcdFx0XHR7IGlkOiAnZmlsZTovLy93ZC9hLnRzJywgZGlmZjogeyBhZGRlZDogMywgcmVtb3ZlZDogMSB9IH0sXG5cdFx0XHRcdHsgaWQ6ICdmaWxlOi8vL3dkL2IudHMnLCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdF0sXG5cdFx0XHRjYXRhbG9ndWU6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGxhYmVsOiAnQnJhbmNoIENoYW5nZXMnLFxuXHRcdFx0XHRcdHVyaVRlbXBsYXRlOiBjaGFuZ2VzZXRVcmksXG5cdFx0XHRcdFx0Y2hhbmdlS2luZDogJ3Nlc3Npb24nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0bGFiZWw6ICdVbmNvbW1pdHRlZCBDaGFuZ2VzJyxcblx0XHRcdFx0XHR1cmlUZW1wbGF0ZTogYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1Nob3cgdW5jb21taXR0ZWQgY2hhbmdlcyBpbiB0aGlzIHNlc3Npb24nLFxuXHRcdFx0XHRcdGNoYW5nZUtpbmQ6ICd1bmNvbW1pdHRlZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU3RhdGljQ2hhbmdlc2V0IHdvcmtzIHdpdGhvdXQgYSBsaXZlIHNlc3Npb24gc3RhdGUgKHNlZWRzIHRoZSBjaGFuZ2VzZXQgZm9yIHVub3BlbmVkIHNlc3Npb25zKScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdC8vIE5vdGU6IHNldHVwU2Vzc2lvbiBpcyBpbnRlbnRpb25hbGx5IE5PVCBjYWxsZWQuXG5cblx0XHRjb25zdCBkaWZmcyA9IFtcblx0XHRcdHtcblx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSxcblx0XHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9LFxuXHRcdFx0fSxcblx0XHRdO1xuXHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uU3RyLCAnc2Vzc2lvbicsIGRpZmZzKTtcblxuXHRcdC8vIFNlc3Npb24gc3RhdGUgc3RpbGwgZG9lc24ndCBleGlzdCBcdTIwMTQgb25seSB0aGUgY2hhbmdlc2V0XG5cdFx0Ly8gc3RhdGUgaXMgcmVnaXN0ZXJlZCBzbyBhIGNsaWVudCBzdWJzY3JpcHRpb24gcmVzb2x2ZXMuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblN0ciksIHVuZGVmaW5lZCk7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QsICdleHBlY3RlZCB0aGUgY2hhbmdlc2V0IFVSSSB0byBiZSBzdWJzY3JpYmFibGUgZXZlbiB3aXRob3V0IGEgc2Vzc2lvbiBzdGF0ZScpO1xuXHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Quc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5zdGF0dXMsICdyZWFkeScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUuZmlsZXMubWFwKGYgPT4gZi5pZCksIFsnZmlsZTovLy93ZC9hLnRzJ10pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc2Vzc2lvbiBkaWZmIGNvbXB1dGF0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZ2l0LWRyaXZlbiBwYXRoIGlzIHByZWZlcnJlZCB3aGVuIGEgZ2l0IHNlcnZpY2UgaXMgcHJvdmlkZWQgYW5kIHRoZSB3b3JraW5nIGRpciBpcyBhIGdpdCB3b3JrIHRyZWUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGIgPSBuZXcgU2Vzc2lvbkRhdGFiYXNlKCc6bWVtb3J5OicpO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKHRvRGlzcG9zYWJsZSgoKSA9PiBzZXNzaW9uRGIuY2xvc2UoKSkpO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkRhdGFTZXJ2aWNlID0gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYik7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cblx0XHRcdGNvbnN0IGdpdERpZmZzID0gW3tcblx0XHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9uZXcudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvbmV3LnRzJyB9IH0sXG5cdFx0XHRcdGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSxcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgY29tcHV0ZUNhbGxzOiB7IHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZzsgc2Vzc2lvblVyaTogc3RyaW5nOyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKHdkOiBVUkksIG9wdHM6IHsgc2Vzc2lvblVyaTogc3RyaW5nOyBiYXNlQnJhbmNoPzogc3RyaW5nIH0pID0+IHtcblx0XHRcdFx0XHRjb21wdXRlQ2FsbHMucHVzaCh7IHdvcmtpbmdEaXJlY3Rvcnk6IHdkLnRvU3RyaW5nKCksIHNlc3Npb25Vcmk6IG9wdHMuc2Vzc2lvblVyaSwgYmFzZUJyYW5jaDogb3B0cy5iYXNlQnJhbmNoIH0pO1xuXHRcdFx0XHRcdHJldHVybiBnaXREaWZmcztcblx0XHRcdFx0fSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0R2l0U2VydmljZTtcblxuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSksIE5VTExfUkVWSUVXX1NFUlZJQ0UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgc2Vzc2lvbkRiLnNldE1ldGFkYXRhKCdhZ2VudEhvc3QuZGlmZkJhc2VCcmFuY2gnLCAnbWFpbicpO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IHtcblx0XHRcdFx0ZW52ZWxvcGVzLnB1c2goZSk7XG5cdFx0XHR9KSk7XG5cblx0XHRcdC8vIFRyaWdnZXIgYSB0dXJuLWNvbXBsZXRlICh3aGljaCBmaXJlcyB0aGUgaW1tZWRpYXRlIGRpZmYgcGF0aCkuXG5cdFx0XHQvLyBUaGUgdW5jb21taXR0ZWQgc3Vic2NyaXB0aW9uIG1ha2VzIG9uLXR1cm4tY29tcGxldGUgY29tcHV0ZSB0aGF0XG5cdFx0XHQvLyBzbG90IGFsb25nc2lkZSB0aGUgc2Vzc2lvbi13aWRlIG9uZS5cblx0XHRcdGxvY2FsQ2hhbmdlc2V0cy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0dXJuLTEnKTtcblxuXHRcdFx0Ly8gVHVybi1jb21wbGV0ZSByZWNvbXB1dGVzIGJvdGggdGhlIHVuY29tbWl0dGVkIGFuZCB0aGVcblx0XHRcdC8vIHNlc3Npb24td2lkZSBjaGFuZ2VzZXRzIHZpYSB0aGUgcGVyLWtleSBzZXF1ZW5jZXI7IHdhaXRcblx0XHRcdC8vIGRldGVybWluaXN0aWNhbGx5IHVudGlsIGJvdGggZ2l0IGNhbGxzIGhhdmUgYmVlbiBvYnNlcnZlZFxuXHRcdFx0Ly8gcmF0aGVyIHRoYW4gcmFjaW5nIG9uIHRoZSBmaXJzdCBkaXNwYXRjaGVkIGVudmVsb3BlLlxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCAyMDAgJiYgY29tcHV0ZUNhbGxzLmxlbmd0aCA8IDI7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBUdXJuLWNvbXBsZXRlIHJlY29tcHV0ZXMgYm90aCB0aGUgdW5jb21taXR0ZWQgKG5vXG5cdFx0XHQvLyBgYmFzZUJyYW5jaGApIGFuZCB0aGUgc2Vzc2lvbi13aWRlICh3aXRoIGBiYXNlQnJhbmNoYClcblx0XHRcdC8vIGNoYW5nZXNldHMgaW4gcGFyYWxsZWw7IGFzc2VydCBib3RoIHJhbiB3aXRoIHRoZSByaWdodFxuXHRcdFx0Ly8gb3B0aW9ucyByZWdhcmRsZXNzIG9mIG9yZGVyLlxuXHRcdFx0Y29uc3Qgc29ydGVkQ2FsbHMgPSBbLi4uY29tcHV0ZUNhbGxzXS5zb3J0KChhLCBiKSA9PlxuXHRcdFx0XHQoYS5iYXNlQnJhbmNoID8/ICcnKSA8IChiLmJhc2VCcmFuY2ggPz8gJycpID8gLTEgOiAxKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc29ydGVkQ2FsbHMsIFtcblx0XHRcdFx0eyB3b3JraW5nRGlyZWN0b3J5OiAnZmlsZTovLy93ZCcsIHNlc3Npb25Vcmk6IHNlc3Npb25VcmkudG9TdHJpbmcoKSwgYmFzZUJyYW5jaDogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHsgd29ya2luZ0RpcmVjdG9yeTogJ2ZpbGU6Ly8vd2QnLCBzZXNzaW9uVXJpOiBzZXNzaW9uVXJpLnRvU3RyaW5nKCksIGJhc2VCcmFuY2g6ICdtYWluJyB9LFxuXHRcdFx0XSk7XG5cdFx0XHQvLyBFYWNoIGNvbXB1dGUgcGFzcyBsYW5kcyBhcyBhIHNpbmdsZSBgY2hhbmdlc2V0L2NvbnRlbnRDaGFuZ2VkYFxuXHRcdFx0Ly8gZW52ZWxvcGUgY2FycnlpbmcgdGhlIGZ1bGwgZmlsZSBsaXN0LiBXYWxrIHRoZSBjYXB0dXJlZCBzdHJlYW1cblx0XHRcdC8vIGFuZCByZWNvbnN0cnVjdCB0aGUgcGVyLWNoYW5nZXNldCBmaWxlIGxpc3RzIHRvIGFzc2VydCBlYWNoXG5cdFx0XHQvLyBtYXRjaGVzIHRoZSBnaXQgc2VydmljZSBvdXRwdXQuXG5cdFx0XHRjb25zdCBjb250ZW50Q2hhbmdlcyA9IGVudmVsb3Blc1xuXHRcdFx0XHQuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRDb250ZW50Q2hhbmdlZCkgYXMgQXJyYXk8eyBjaGFubmVsOiBzdHJpbmc7IGFjdGlvbjogeyBmaWxlczogQXJyYXk8eyBlZGl0OiB1bmtub3duIH0+IH0gfT47XG5cdFx0XHRjb25zdCBzZXNzaW9uQ29udGVudCA9IGNvbnRlbnRDaGFuZ2VzLmZpbHRlcihlID0+IGUuY2hhbm5lbCA9PT0gYCR7c2Vzc2lvblVyaS50b1N0cmluZygpfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRDb250ZW50ID0gY29udGVudENoYW5nZXMuZmlsdGVyKGUgPT4gZS5jaGFubmVsID09PSBgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC91bmNvbW1pdHRlZGApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzZXNzaW9uQ29udGVudC5hdCgtMSk/LmFjdGlvbi5maWxlcy5tYXAoZiA9PiBmLmVkaXQpLCBnaXREaWZmcyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHVuY29tbWl0dGVkQ29udGVudC5hdCgtMSk/LmFjdGlvbi5maWxlcy5tYXAoZiA9PiBmLmVkaXQpLCBnaXREaWZmcyk7XG5cblx0XHRcdC8vIFRoZSBjb21wdXRlIHBhc3MgYWxzbyBwZXJzaXN0cyB0aGUgZmlsZSBsaXN0IHVuZGVyIHRoZVxuXHRcdFx0Ly8gbGVnYWN5IGAnZGlmZnMnYCBzbG90IHNvIGl0IHN1cnZpdmVzIHJlc3RhcnRzLiBUaGUgd3JpdGVcblx0XHRcdC8vIGlzIGZpcmUtYW5kLWZvcmdldCB0aHJvdWdoIHRoZSBtZXRhZGF0YSBzZXF1ZW5jZXI7IHBvbGxcblx0XHRcdC8vIGJyaWVmbHkgdW50aWwgaXQgbGFuZHMuXG5cdFx0XHRsZXQgcGVyc2lzdGVkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwICYmICFwZXJzaXN0ZWQ7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdFx0XHRwZXJzaXN0ZWQgPSBhd2FpdCBzZXNzaW9uRGIuZ2V0TWV0YWRhdGEoJ2RpZmZzJyk7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQub2socGVyc2lzdGVkLCAnZXhwZWN0ZWQgdGhlIGNvbXB1dGUgcGFzcyB0byBwZXJzaXN0IGRpZmZzIHRvIHRoZSBzZXNzaW9uIERCJyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UocGVyc2lzdGVkKSwgZ2l0RGlmZnMpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2Vzc2lvbiBjaGFuZ2VzZXQgZmFsbHMgYmFjayB0byBfbWV0YS5naXQgYmFzZSBicmFuY2ggd2hlbiBwZXJzaXN0ZWQgZGlmZiBiYXNlIGlzIGFic2VudCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogeyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKF93ZDogVVJJLCBvcHRzOiB7IHNlc3Npb25Vcmk6IHN0cmluZzsgYmFzZUJyYW5jaD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdFx0Y29tcHV0ZUNhbGxzLnB1c2goeyBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSksIE5VTExfUkVWSUVXX1NFUlZJQ0UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25TdHIsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uU3RyLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pKTtcblxuXHRcdFx0bG9jYWxDaGFuZ2VzZXRzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiBjb21wdXRlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2FsbHMsIFt7IGJhc2VCcmFuY2g6ICdtYWluJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uIGNoYW5nZXNldCBrZWVwcyBwZXJzaXN0ZWQgZGlmZiBiYXNlIGFoZWFkIG9mIF9tZXRhLmdpdCBiYXNlIGJyYW5jaCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRhd2FpdCBzZXNzaW9uRGIuc2V0TWV0YWRhdGEoJ2FnZW50SG9zdC5kaWZmQmFzZUJyYW5jaCcsICdyZWxlYXNlJyk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRcdGNvbnN0IGNvbXB1dGVDYWxsczogeyBiYXNlQnJhbmNoOiBzdHJpbmcgfCB1bmRlZmluZWQgfVtdID0gW107XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKF93ZDogVVJJLCBvcHRzOiB7IHNlc3Npb25Vcmk6IHN0cmluZzsgYmFzZUJyYW5jaD86IHN0cmluZyB9KSA9PiB7XG5cdFx0XHRcdFx0Y29tcHV0ZUNhbGxzLnB1c2goeyBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKCksIE5VTExfUkVWSUVXX1NFUlZJQ0UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25TdHIsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddLFxuXHRcdFx0fSk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5zZXRTZXNzaW9uTWV0YShzZXNzaW9uU3RyLCB3aXRoU2Vzc2lvbkdpdFN0YXRlKHVuZGVmaW5lZCwgeyBiYXNlQnJhbmNoTmFtZTogJ21haW4nIH0pKTtcblxuXHRcdFx0bG9jYWxDaGFuZ2VzZXRzLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiBjb21wdXRlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlQ2FsbHMsIFt7IGJhc2VCcmFuY2g6ICdyZWxlYXNlJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHRoZSBlZGl0LXRyYWNrZXIgYWdncmVnYXRvciB3aGVuIHRoZSBnaXQgc2VydmljZSByZXR1cm5zIHVuZGVmaW5lZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdFx0Y29uc3Qgc3R1YkdpdCA9IHtcblx0XHRcdFx0Y29tcHV0ZVNlc3Npb25GaWxlRGlmZnM6IGFzeW5jICgpID0+IHVuZGVmaW5lZCxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0R2l0U2VydmljZTtcblxuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIHNlc3Npb25EYXRhU2VydmljZSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKCksIE5VTExfUkVWSUVXX1NFUlZJQ0UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblVyaS50b1N0cmluZygpLFxuXHRcdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1vZGlmaWVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGxldCByZXNvbHZlRGlmZnM6ICgoKSA9PiB2b2lkKSB8IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IGRpZmZzRW1pdHRlZCA9IG5ldyBQcm9taXNlPHZvaWQ+KHIgPT4geyByZXNvbHZlRGlmZnMgPSByOyB9KTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChsb2NhbFN0YXRlTWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IHtcblx0XHRcdFx0ZW52ZWxvcGVzLnB1c2goZSk7XG5cdFx0XHRcdGlmIChlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQpIHtcblx0XHRcdFx0XHRyZXNvbHZlRGlmZnM/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHR9KSk7XG5cblx0XHRcdGxvY2FsQ2hhbmdlc2V0cy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0dXJuLTEnKTtcblxuXHRcdFx0YXdhaXQgZGlmZnNFbWl0dGVkO1xuXG5cdFx0XHQvLyBXaXRoIG5vIHJlY29yZGVkIGVkaXRzLCB0aGUgZWRpdC10cmFja2VyIGFnZ3JlZ2F0b3IgcmV0dXJucyBhblxuXHRcdFx0Ly8gZW1wdHkgYXJyYXkgXHUyMDE0IHRoZSBzaW5nbGUgYGNoYW5nZXNldC9jb250ZW50Q2hhbmdlZGAgZW52ZWxvcGVcblx0XHRcdC8vIGNhcnJpZXMgYW4gZW1wdHkgZmlsZSBsaXN0LiBUaGUgaW1wb3J0YW50IGFzc2VydGlvbiBpcyB0aGF0IHdlXG5cdFx0XHQvLyBzdGlsbCByYW4gdGhlIHByb2R1Y2VyIHRocm91Z2ggdG8gYSBgY2hhbmdlc2V0L3N0YXR1c0NoYW5nZWQgXHUyMTkyXG5cdFx0XHQvLyByZWFkeWAgZW52ZWxvcGUsIHdoaWNoIHByb3ZlcyB0aGUgZmFsbGJhY2sgcGF0aCBleGVjdXRlZCB3aXRob3V0XG5cdFx0XHQvLyB0aHJvd2luZy5cblx0XHRcdGNvbnN0IGNvbnRlbnRDaGFuZ2VzID0gZW52ZWxvcGVzXG5cdFx0XHRcdC5tYXAoZSA9PiBlLmFjdGlvbilcblx0XHRcdFx0LmZpbHRlcihhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRDb250ZW50Q2hhbmdlZCkgYXMgQXJyYXk8eyBmaWxlczogdW5rbm93bltdIH0+O1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb250ZW50Q2hhbmdlcy5tYXAoYSA9PiBhLmZpbGVzKSwgW1tdXSk7XG5cdFx0XHRjb25zdCBzdGF0dXNBY3Rpb24gPSBlbnZlbG9wZXNcblx0XHRcdFx0Lm1hcChlID0+IGUuYWN0aW9uKVxuXHRcdFx0XHQuZmluZChhID0+IGEudHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5vayhzdGF0dXNBY3Rpb24sICdleHBlY3RlZCBhIGNoYW5nZXNldC9zdGF0dXNDaGFuZ2VkIGVudmVsb3BlIGZyb20gdGhlIGZhbGxiYWNrIHBhdGgnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2NvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldCcsICgpID0+IHtcblxuXHRcdHRlc3QoJ2hhcHB5IHBhdGg6IGdpdCByZXR1cm5zIGRpZmZzLCBzdGF0ZSBnb2VzIFJlYWR5IHdpdGggZmlsZXMsIG5vdGhpbmcgcGVyc2lzdGVkIHRvIHRoZSBEQicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBzZXNzaW9uRGF0YVNlcnZpY2UgPSBjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2Uoc2Vzc2lvbkRiKTtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblxuXHRcdFx0Y29uc3QgZ2l0RGlmZnMgPSBbXG5cdFx0XHRcdHsgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSwgZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMCB9IH0sXG5cdFx0XHRcdHsgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2IudHMnIH0gfSwgZGlmZjogeyBhZGRlZDogMiwgcmVtb3ZlZDogMSB9IH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3Qgc3R1YkdpdCA9IHtcblx0XHRcdFx0Y29tcHV0ZVNlc3Npb25GaWxlRGlmZnM6IGFzeW5jICgpID0+IGdpdERpZmZzLFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXG5cdFx0XHRjb25zdCBsb2NhbENoYW5nZXNldHMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgc2Vzc2lvbkRhdGFTZXJ2aWNlLCBzdHViR2l0LCBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKGxvY2FsU3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLCBjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksIGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSwgTlVMTF9SRVZJRVdfU0VSVklDRSwgTnVsbFRlbGVtZXRyeVNlcnZpY2UpKTtcblxuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgbG9jYWxDaGFuZ2VzZXRzLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdCh1bmNvbW1pdHRlZFVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBmaWxlczogQXJyYXk8eyBpZDogc3RyaW5nIH0+IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0c3RhdHVzOiBzdGF0ZT8uc3RhdHVzLFxuXHRcdFx0XHRmaWxlczogc3RhdGU/LmZpbGVzLm1hcChmID0+IGYuaWQpLnNvcnQoKSxcblx0XHRcdFx0cGVyc2lzdGVkVW5jb21taXR0ZWQ6IGF3YWl0IHNlc3Npb25EYi5nZXRNZXRhZGF0YSgnYWdlbnRIb3N0LmNoYW5nZXNldC51bmNvbW1pdHRlZCcpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdFx0ZmlsZXM6IFsnZmlsZTovLy93ZC9hLnRzJywgJ2ZpbGU6Ly8vd2QvYi50cyddLFxuXHRcdFx0XHRwZXJzaXN0ZWRVbmNvbW1pdHRlZDogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdubyB3b3JraW5nIGRpcmVjdG9yeTogc3RhdGUgZ29lcyBFcnJvciB3aXRoIGNvbXB1dGVGYWlsZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGF3YWl0IGNoYW5nZXNldFNlcnZpY2UuY29tcHV0ZVVuY29tbWl0dGVkQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXG5cdFx0XHRjb25zdCB1bmNvbW1pdHRlZFVyaSA9IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC91bmNvbW1pdHRlZGA7XG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdCh1bmNvbW1pdHRlZFVyaSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IHNuYXBzaG90Py5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nOyBlcnJvcj86IHsgZXJyb3JUeXBlOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogc3RhdGU/LnN0YXR1cyxcblx0XHRcdFx0ZXJyb3JUeXBlOiBzdGF0ZT8uZXJyb3I/LmVycm9yVHlwZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuRXJyb3IsXG5cdFx0XHRcdGVycm9yVHlwZTogJ2NvbXB1dGVGYWlsZWQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnaXQgcmV0dXJucyB1bmRlZmluZWQgKG5vdCBhIGdpdCB3b3JrIHRyZWUpOiBzdGF0ZSBnb2VzIEVycm9yIHdpdGggY29tcHV0ZUZhaWxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Ly8gU2hhcmVkIGBjaGFuZ2VzZXRTZXJ2aWNlYCB1c2VzIGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCkgd2hvc2Vcblx0XHRcdC8vIGNvbXB1dGVTZXNzaW9uRmlsZURpZmZzIHJldHVybnMgdW5kZWZpbmVkIFx1MjAxNCBleGFjdGx5IHRoZVxuXHRcdFx0Ly8gXCJub3QgYSBnaXQgd29yayB0cmVlXCIgc2lnbmFsIHdlIHdhbnQgdG8gZXhlcmNpc2UuXG5cdFx0XHRhd2FpdCBjaGFuZ2VzZXRTZXJ2aWNlLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgdW5jb21taXR0ZWRVcmkgPSBgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHRcdFx0Y29uc3Qgc25hcHNob3QgPSBzdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QodW5jb21taXR0ZWRVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZXJyb3I/OiB7IGVycm9yVHlwZTogc3RyaW5nIH0gfSB8IHVuZGVmaW5lZDtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0dXM6IHN0YXRlPy5zdGF0dXMsXG5cdFx0XHRcdGVycm9yVHlwZTogc3RhdGU/LmVycm9yPy5lcnJvclR5cGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLkVycm9yLFxuXHRcdFx0XHRlcnJvclR5cGU6ICdjb21wdXRlRmFpbGVkJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZ2l0IHRocm93czogc3RhdGUgZ29lcyBFcnJvciB3aXRoIG9yaWdpbmFsIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKCkgPT4geyB0aHJvdyBuZXcgRXJyb3IoJ2dpdCBjb21tYW5kIGZhaWxlZCcpOyB9LFxuXHRcdFx0fSBhcyB1bmtub3duIGFzIElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgbG9jYWxDaGFuZ2VzZXRzID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCksIGNyZWF0ZU51bGxTZXNzaW9uRGF0YVNlcnZpY2UoKSwgc3R1YkdpdCwgTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShsb2NhbFN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSwgY3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLCBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSksIE5VTExfUkVWSUVXX1NFUlZJQ0UsIE51bGxUZWxlbWV0cnlTZXJ2aWNlKSk7XG5cblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25TdHIsXG5cdFx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddLFxuXHRcdFx0fSk7XG5cblx0XHRcdGF3YWl0IGxvY2FsQ2hhbmdlc2V0cy5jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cblx0XHRcdGNvbnN0IHVuY29tbWl0dGVkVXJpID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0U25hcHNob3QodW5jb21taXR0ZWRVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZXJyb3I/OiB7IGVycm9yVHlwZTogc3RyaW5nOyBtZXNzYWdlOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXR1czogc3RhdGU/LnN0YXR1cyxcblx0XHRcdFx0ZXJyb3JUeXBlOiBzdGF0ZT8uZXJyb3I/LmVycm9yVHlwZSxcblx0XHRcdFx0bWVzc2FnZTogc3RhdGU/LmVycm9yPy5tZXNzYWdlLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5FcnJvcixcblx0XHRcdFx0ZXJyb3JUeXBlOiAnY29tcHV0ZUZhaWxlZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdnaXQgY29tbWFuZCBmYWlsZWQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdkZWZlcnJlZCByZWZyZXNoICh3b3JraW5nIGRpcmVjdG9yeSB1bmtub3duKScsICgpID0+IHtcblxuXHRcdGZ1bmN0aW9uIGNyZWF0ZURlZmVycmluZ1NlcnZpY2Uoc3Vic2NyaXB0aW9uczogSXRlcmFibGU8c3RyaW5nPiA9IFtdKTogeyBzZXJ2aWNlOiBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlOyBsb2NhbFN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyOyBjb21wdXRlczogc3RyaW5nW107IHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+IH0ge1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSkpO1xuXHRcdFx0Y29uc3QgY29tcHV0ZXM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRjb25zdCBzdHViR2l0ID0ge1xuXHRcdFx0XHRjb21wdXRlU2Vzc2lvbkZpbGVEaWZmczogYXN5bmMgKCkgPT4geyBjb21wdXRlcy5wdXNoKCdzZXNzaW9uJyk7IHJldHVybiBbXTsgfSxcblx0XHRcdFx0Y29tcHV0ZVVuY29tbWl0dGVkRmlsZURpZmZzOiBhc3luYyAoKSA9PiB7IGNvbXB1dGVzLnB1c2goJ3VuY29tbWl0dGVkJyk7IHJldHVybiBbXTsgfSxcblx0XHRcdH0gYXMgdW5rbm93biBhcyBJQWdlbnRIb3N0R2l0U2VydmljZTtcblx0XHRcdGNvbnN0IHN1YnNjcmlwdGlvblNlcnZpY2UgPSBjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKC4uLnN1YnNjcmlwdGlvbnMpO1xuXHRcdFx0Y29uc3Qgc2VydmljZSA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZShcblx0XHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRjcmVhdGVOdWxsU2Vzc2lvbkRhdGFTZXJ2aWNlKCksXG5cdFx0XHRcdHN0dWJHaXQsXG5cdFx0XHRcdE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxTdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0c3Vic2NyaXB0aW9uU2VydmljZSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHQpKTtcblx0XHRcdHJldHVybiB7IHNlcnZpY2UsIGxvY2FsU3RhdGVNYW5hZ2VyLCBjb21wdXRlcywgc3Vic2NyaXB0aW9uczogc3Vic2NyaXB0aW9uU2VydmljZS5zdWJzY3JpcHRpb25zIH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlU2Vzc2lvblN0YXRlKGxvY2FsU3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0XHRyZXNvdXJjZTogc2Vzc2lvblN0cixcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIuc2V0U2Vzc2lvbkNoYW5nZXNldHMoc2Vzc2lvblN0ciwgYnVpbGREZWZhdWx0Q2hhbmdlc2V0Q2F0YWxvZyhzZXNzaW9uU3RyKSk7XG5cdFx0XHRyZXR1cm4gc2Vzc2lvblN0cjtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZWZyZXNoU2Vzc2lvbkNoYW5nZXNldCAvIHJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQgZGVmZXIgdW50aWwgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGtub3duLCB0aGVuIGRyYWluIHRoZSBzdWJzY3JpYmVkIGNoYW5nZXNldHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBsb2NhbFN0YXRlTWFuYWdlciwgY29tcHV0ZXMgfSA9IGNyZWF0ZURlZmVycmluZ1NlcnZpY2UoW1xuXHRcdFx0XHRidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSxcblx0XHRcdFx0YnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpLFxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVTZXNzaW9uU3RhdGUobG9jYWxTdGF0ZU1hbmFnZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHNlcnZpY2UucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdHNlcnZpY2UucmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlcywgW10sICdub3RoaW5nIGNvbXB1dGVkIHdoaWxlIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyB1bmtub3duJyk7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uU3RyKSE7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uU3RyLCB7IC4uLnN1bW1hcnksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10gfSk7XG5cdFx0XHRzZXJ2aWNlLm9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZShzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXB1dGVzLnNvcnQoKSwgWydzZXNzaW9uJywgJ3Nlc3Npb24nXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQgZGVmZXJzIHVudGlsIHRoZSB3b3JraW5nIGRpcmVjdG9yeSBpcyBrbm93biwgdGhlbiBkcmFpbnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBsb2NhbFN0YXRlTWFuYWdlciwgY29tcHV0ZXMgfSA9IGNyZWF0ZURlZmVycmluZ1NlcnZpY2UoW2J1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cildKTtcblx0XHRcdGNyZWF0ZVNlc3Npb25TdGF0ZShsb2NhbFN0YXRlTWFuYWdlciwgdW5kZWZpbmVkKTtcblxuXHRcdFx0YXdhaXQgc2VydmljZS5jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXB1dGVzLCBbXSwgJ3VuY29tbWl0dGVkIGNvbXB1dGUgZGVmZXJyZWQgd2hpbGUgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGlzIHVua25vd24nKTtcblxuXHRcdFx0Y29uc3Qgc3VtbWFyeSA9IGxvY2FsU3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25TdHIpITtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb25TdHIsIHsgLi4uc3VtbWFyeSwgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSB9KTtcblx0XHRcdHNlcnZpY2Uub25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKHNlc3Npb25TdHIpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgwKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcHV0ZXMsIFsndW5jb21taXR0ZWQnXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIGNoYW5nZXNldCB1bnN1YnNjcmliZWQgYmVmb3JlIG1hdGVyaWFsaXphdGlvbiBpcyBuYXR1cmFsbHkgc2tpcHBlZCBvbiBkcmFpbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCB7IHNlcnZpY2UsIGxvY2FsU3RhdGVNYW5hZ2VyLCBjb21wdXRlcywgc3Vic2NyaXB0aW9ucyB9ID0gY3JlYXRlRGVmZXJyaW5nU2VydmljZShbYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpXSk7XG5cdFx0XHRjcmVhdGVTZXNzaW9uU3RhdGUobG9jYWxTdGF0ZU1hbmFnZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHNlcnZpY2UucmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHQvLyBMYXN0IHN1YnNjcmliZXIgbGVhdmVzIGJlZm9yZSB0aGUgd29ya2luZyBkaXJlY3RvcnkgaXMga25vd24uXG5cdFx0XHRzdWJzY3JpcHRpb25zLmRlbGV0ZShidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cikhO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvblN0ciwgeyAuLi5zdW1tYXJ5LCB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddIH0pO1xuXHRcdFx0c2VydmljZS5vbldvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUoc2Vzc2lvblN0cik7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wdXRlcywgW10pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25TZXNzaW9uRGlzcG9zZWQgY2xlYXJzIGV2ZXJ5IHBlbmRpbmcgcmVmcmVzaCBmb3IgdGhlIHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0Y29uc3QgeyBzZXJ2aWNlLCBsb2NhbFN0YXRlTWFuYWdlciwgY29tcHV0ZXMgfSA9IGNyZWF0ZURlZmVycmluZ1NlcnZpY2UoW1xuXHRcdFx0XHRidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSxcblx0XHRcdFx0YnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpLFxuXHRcdFx0XHRidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpLFxuXHRcdFx0XSk7XG5cdFx0XHRjcmVhdGVTZXNzaW9uU3RhdGUobG9jYWxTdGF0ZU1hbmFnZXIsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHNlcnZpY2UucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdHNlcnZpY2UucmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRhd2FpdCBzZXJ2aWNlLmNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdHNlcnZpY2Uub25TZXNzaW9uRGlzcG9zZWQoc2Vzc2lvblN0cik7XG5cblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBsb2NhbFN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uU3RyKSE7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uU3RyLCB7IC4uLnN1bW1hcnksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10gfSk7XG5cdFx0XHRzZXJ2aWNlLm9uV29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZShzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXB1dGVzLCBbXSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdyZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cycsICgpID0+IHtcblxuXHRcdGNvbnN0IGFEaWZmID0geyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vd2QvYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfTtcblx0XHRjb25zdCBiRGlmZiA9IHsgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9iLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2IudHMnIH0gfSwgZGlmZjogeyBhZGRlZDogMiwgcmVtb3ZlZDogMCB9IH07XG5cdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblxuXHRcdHRlc3QoJ3BhcnNlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyBwYXJzZXMgd2l0aG91dCBtdXRhdGluZyBzdGF0ZScsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y2hhbmdlc2V0U2VydmljZS5yZWdpc3RlclN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0cik7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNoYW5nZXNldFNlcnZpY2UucGFyc2VQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIsIHtcblx0XHRcdFx0c2Vzc2lvblJhdzogSlNPTi5zdHJpbmdpZnkoW2JEaWZmXSksXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHNlc3Npb246IHJlc3VsdC5zZXNzaW9uPy5tYXAoZCA9PiBkLmFmdGVyPy51cmkpLFxuXHRcdFx0XHRzZXNzaW9uU3RhdGU6IHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzZXNzaW9uOiBbJ2ZpbGU6Ly8vd2QvYi50cyddLFxuXHRcdFx0XHRzZXNzaW9uU3RhdGU6IHsgc3RhdHVzOiAnY29tcHV0aW5nJywgZmlsZXM6IFtdIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyBzZWVkcyBwYXJzZWQgZGlmZnMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNoYW5nZXNldFNlcnZpY2UucmVnaXN0ZXJTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgcGFyc2VkID0gY2hhbmdlc2V0U2VydmljZS5wYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwge1xuXHRcdFx0XHRzZXNzaW9uUmF3OiBKU09OLnN0cmluZ2lmeShbYkRpZmZdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjaGFuZ2VzZXRTZXJ2aWNlLmFwcGx5UGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyLCBwYXJzZWQpO1xuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzZXNzaW9uICYmIHsgc3RhdHVzOiBzZXNzaW9uLnN0YXR1cywgZmlsZXM6IHNlc3Npb24uZmlsZXMubWFwKGYgPT4gZi5pZCkgfSxcblx0XHRcdFx0eyBzdGF0dXM6ICdyZWFkeScsIGZpbGVzOiBbJ2ZpbGU6Ly8vd2QvYi50cyddIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbmV3IHNlc3Npb25SYXcgYmVhdHMgbGVnYWN5UmF3IHdoZW4gYm90aCBhcmUgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBjaGFuZ2VzZXRTZXJ2aWNlLnJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKHNlc3Npb25TdHIsIHtcblx0XHRcdFx0c2Vzc2lvblJhdzogSlNPTi5zdHJpbmdpZnkoW2FEaWZmXSksXG5cdFx0XHRcdGxlZ2FjeVJhdzogSlNPTi5zdHJpbmdpZnkoW2JEaWZmXSksIC8vIHdvdWxkIGxvc2Vcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC5zZXNzaW9uPy5tYXAoZCA9PiBkLmFmdGVyPy51cmkpLCBbJ2ZpbGU6Ly8vd2QvYS50cyddLCAnbmV3IGtleSB3aW5zIG92ZXIgbGVnYWN5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdsZWdhY3lSYXcgc3RpbGwgcmVzdG9yZXMgc2Vzc2lvbiBzdGF0ZSB3aGVuIHNlc3Npb25SYXcgaXMgYWJzZW50JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwge1xuXHRcdFx0XHRsZWdhY3lSYXc6IEpTT04uc3RyaW5naWZ5KFtiRGlmZl0pLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnNlc3Npb24/Lm1hcChkID0+IGQuYWZ0ZXI/LnVyaSksIFsnZmlsZTovLy93ZC9iLnRzJ10pO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbiA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzZXNzaW9uPy5zdGF0ZSBhcyB7IHN0YXR1czogc3RyaW5nIH0pLnN0YXR1cywgJ3JlYWR5Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYWxmb3JtZWQgSlNPTiBsb2dzIGFuZCByZXR1cm5zIHVuZGVmaW5lZCBmb3IgdGhhdCBzbG90JywgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjaGFuZ2VzZXRTZXJ2aWNlLnJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyKTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gY2hhbmdlc2V0U2VydmljZS5yZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyLCB7XG5cdFx0XHRcdHNlc3Npb25SYXc6ICd7IG5vdCB2YWxpZCBqc29uJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LnNlc3Npb24sIHVuZGVmaW5lZCwgJ21hbGZvcm1lZCBzbG90IHJldHVybnMgdW5kZWZpbmVkJyk7XG5cdFx0XHQvLyBTZXNzaW9uIHNuYXBzaG90IHN0YXllZCBpbiBgY29tcHV0aW5nYCBiZWNhdXNlIG1hbGZvcm1lZCBpbnB1dFxuXHRcdFx0Ly8gd2FzIGRpc2NhcmRlZCBcdTIwMTQgbm90IHNlZWRlZCB3aXRoIGdhcmJhZ2UuXG5cdFx0XHRjb25zdCBzZXNzaW9uID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHNlc3Npb24/LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmcgfSkuc3RhdHVzLCAnY29tcHV0aW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWVkSWZFbXB0eSBob25vdXJlZDogbGl2ZSBzdGF0ZSB3aXRoIGZpbGVzIGlzIG5vdCBvdmVyd3JpdHRlbicsICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXG5cdFx0XHQvLyBTZWVkIGxpdmUgc2Vzc2lvbiBzdGF0ZSB2aWEgcmVzdG9yZVN0YXRpY0NoYW5nZXNldCB0byBtaW1pY1xuXHRcdFx0Ly8gYSBmcmVzaCByZWZyZXNoIHRoYXQgbGFuZGVkIGJlZm9yZSB0aGUgcGVyc2lzdGVkLW92ZXJsYXkgY2FsbC5cblx0XHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVN0YXRpY0NoYW5nZXNldChzZXNzaW9uU3RyLCAnc2Vzc2lvbicsIFthRGlmZl0pO1xuXHRcdFx0Y29uc3QgYmVmb3JlID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChiZWZvcmU/LnN0YXRlIGFzIHsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9KS5maWxlcy5tYXAoZiA9PiBmLmlkKSwgWydmaWxlOi8vL3dkL2EudHMnXSk7XG5cblx0XHRcdC8vIFBlcnNpc3RlZCBibG9iIHBvaW50cyBhdCBhIERJRkZFUkVOVCBmaWxlOyB3aXRob3V0IHRoZSBndWFyZCBpdFxuXHRcdFx0Ly8gd291bGQgY2xvYmJlciB0aGUgbGl2ZSBzdGF0ZS5cblx0XHRcdGNoYW5nZXNldFNlcnZpY2UucmVzdG9yZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoc2Vzc2lvblN0ciwge1xuXHRcdFx0XHRzZXNzaW9uUmF3OiBKU09OLnN0cmluZ2lmeShbYkRpZmZdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBhZnRlciA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0KGFmdGVyPy5zdGF0ZSBhcyB7IGZpbGVzOiBBcnJheTx7IGlkOiBzdHJpbmcgfT4gfSkuZmlsZXMubWFwKGYgPT4gZi5pZCksXG5cdFx0XHRcdFsnZmlsZTovLy93ZC9hLnRzJ10sXG5cdFx0XHRcdCdsaXZlIHN0YXRlIG11c3QgYmUgcHJlc2VydmVkIHdoZW4gcGVyc2lzdGVkIG92ZXJsYXkgdHJpZXMgdG8gb3ZlcndyaXRlIGl0Jyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3aXRoIGxpdmUgc2Vzc2lvbiBzdGF0ZSwgcmVzdG9yZWQgZGlmZnMgcHVibGlzaCByZWFkeSArIGNhdGFsb2d1ZSBjb3VudHMnLCAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblxuXHRcdFx0Y2hhbmdlc2V0U2VydmljZS5yZXN0b3JlUGVyc2lzdGVkU3RhdGljQ2hhbmdlc2V0cyhzZXNzaW9uU3RyLCB7XG5cdFx0XHRcdHNlc3Npb25SYXc6IEpTT04uc3RyaW5naWZ5KFthRGlmZiwgYkRpZmZdKSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBjYXRhbG9ndWUgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25TdHIpPy5jaGFuZ2VzZXRzO1xuXHRcdFx0Y29uc3Qgc2Vzc2lvbkVudHJ5ID0gY2F0YWxvZ3VlPy5maW5kKChjOiBDaGFuZ2VzZXQpID0+IGMudXJpVGVtcGxhdGUgPT09IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNlc3Npb25FbnRyeSwge1xuXHRcdFx0XHRsYWJlbDogJ0JyYW5jaCBDaGFuZ2VzJyxcblx0XHRcdFx0dXJpVGVtcGxhdGU6IGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9zZXNzaW9uYCxcblx0XHRcdFx0Y2hhbmdlS2luZDogJ3Nlc3Npb24nLFxuXHRcdFx0fSwgJ2NhdGFsb2d1ZSBjb3VudHMgbXVzdCByZWZsZWN0IHJlc3RvcmVkIGZpbGVzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdpZGxlIGNoYW5nZXNldCBMUlUgZXZpY3Rpb24nLCAoKSA9PiB7XG5cblx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXG5cdFx0dGVzdCgnaWRsZSBjaGFuZ2VzZXQgc3RhdGVzIGFyZSBldmljdGVkIG92ZXIgdGhlIHNvZnQgbGltaXQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpLCB7IGNoYW5nZXNldFN0YXRlUmV0ZW50aW9uOiB7IHNvZnRMaW1pdDogMiB9IH0pKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDtcblx0XHRcdGNvbnN0IHRoaXJkID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3R1cm4vdHVybi0xYDtcblxuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoZmlyc3QpO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoc2Vjb25kKTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KHRoaXJkKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGZpcnN0OiBsb2NhbFN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShmaXJzdCksXG5cdFx0XHRcdHNlY29uZDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoc2Vjb25kKT8uc3RhdHVzLFxuXHRcdFx0XHR0aGlyZDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodGhpcmQpPy5zdGF0dXMsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGZpcnN0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHNlY29uZDogJ2NvbXB1dGluZycsXG5cdFx0XHRcdHRoaXJkOiAnY29tcHV0aW5nJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZXZpY3RhYmlsaXR5IHByb2JlIHByb3RlY3RzIHN1YnNjcmliZWQgY2hhbmdlc2V0cycsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDtcblx0XHRcdGNvbnN0IHRoaXJkID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3R1cm4vdHVybi0xYDtcblx0XHRcdGNvbnN0IGxvY2FsU3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCksIHsgY2hhbmdlc2V0U3RhdGVSZXRlbnRpb246IHsgc29mdExpbWl0OiAyLCBjYW5FdmljdDogY2hhbmdlc2V0ID0+IGNoYW5nZXNldCAhPT0gZmlyc3QgfSB9KSk7XG5cblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGZpcnN0KTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KHNlY29uZCk7XG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldCh0aGlyZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoZmlyc3QpPy5zdGF0dXMsXG5cdFx0XHRcdHNlY29uZDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoc2Vjb25kKSxcblx0XHRcdFx0dGhpcmQ6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHRoaXJkKT8uc3RhdHVzLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRmaXJzdDogJ2NvbXB1dGluZycsXG5cdFx0XHRcdHNlY29uZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR0aGlyZDogJ2NvbXB1dGluZycsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ0xSVSBldmljdGlvbiBpcyBzaWxlbnQgYW5kIGRvZXMgbm90IGRpc3BhdGNoIENoYW5nZXNldENsZWFyZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpLCB7IGNoYW5nZXNldFN0YXRlUmV0ZW50aW9uOiB7IHNvZnRMaW1pdDogMSB9IH0pKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSBkaXNwb3NhYmxlcy5hZGQobG9jYWxTdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChgJHtzZXNzaW9uU3RyfS9jaGFuZ2VzZXQvc2Vzc2lvbmApO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52ZWxvcGVzLm1hcChlID0+IGUuYWN0aW9uLnR5cGUpLCBbXSk7XG5cdFx0XHRsaXN0ZW5lci5kaXNwb3NlKCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmltbWluZyByZWNvbnNpZGVycyBlbnRyaWVzIGFmdGVyIHRoZXkgYmVjb21lIGV2aWN0YWJsZScsICgpID0+IHtcblx0XHRcdGxldCBjYW5FdmljdCA9IGZhbHNlO1xuXHRcdFx0Y29uc3QgbG9jYWxTdGF0ZU1hbmFnZXIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdFN0YXRlTWFuYWdlcihuZXcgTnVsbExvZ1NlcnZpY2UoKSwgeyBjaGFuZ2VzZXRTdGF0ZVJldGVudGlvbjogeyBzb2Z0TGltaXQ6IDEsIGNhbkV2aWN0OiAoKSA9PiBjYW5FdmljdCB9IH0pKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXHRcdFx0Y29uc3Qgc2Vjb25kID0gYCR7c2Vzc2lvblN0cn0vY2hhbmdlc2V0L3VuY29tbWl0dGVkYDtcblxuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoZmlyc3QpO1xuXHRcdFx0bG9jYWxTdGF0ZU1hbmFnZXIucmVnaXN0ZXJDaGFuZ2VzZXQoc2Vjb25kKTtcblx0XHRcdGNhbkV2aWN0ID0gdHJ1ZTtcblx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLm9uQ2hhbmdlc2V0TGl2ZW5lc3NDaGFuZ2VkKCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRmaXJzdDogbG9jYWxTdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoZmlyc3QpLFxuXHRcdFx0XHRzZWNvbmQ6IGxvY2FsU3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHNlY29uZCk/LnN0YXR1cyxcblx0XHRcdH0sIHtcblx0XHRcdFx0Zmlyc3Q6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vjb25kOiAnY29tcHV0aW5nJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgncGVyLXR1cm4gbGl2ZSBzdHJlYW1pbmcnLCAoKSA9PiB7XG5cblx0XHQvLyBUZXN0IHJpZzogYSBzdWJjbGFzcyB0aGF0IGNvdW50cyBgY29tcHV0ZVR1cm5DaGFuZ2VzZXRgIGludm9jYXRpb25zXG5cdFx0Ly8gc28gd2UgY2FuIGFzc2VydCBnYXRpbmcgd2lyaW5nIHdpdGhvdXQgbmVlZGluZyByZWFsIHNlc3Npb24gREJcblx0XHQvLyBjb250ZW50IGZvciBgY29tcHV0ZVR1cm5EaWZmc2AgdG8gY2hldyBvbi4gVGhlIGJhc2UgY2xhc3MgYmVoYXZpb3VyXG5cdFx0Ly8gaXMgcHJlc2VydmVkIChzdXBlci1jYWxsIGlzIGF3YWl0ZWQpLCBzbyBhbnkgcGVyLWZpbGUgZGlzcGF0Y2ggdGhlXG5cdFx0Ly8gcHJvZHVjdGlvbiBwYXRoIHdvdWxkIGVtaXQgc3RpbGwgZmxvd3MgdGhyb3VnaCBub3JtYWxseS5cblx0XHRjbGFzcyBDb3VudGluZ0NoYW5nZXNldFNlcnZpY2UgZXh0ZW5kcyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0XHRcdHJlYWRvbmx5IHR1cm5Db21wdXRlQ2FsbHM6IHsgc2Vzc2lvbjogc3RyaW5nOyB0dXJuSWQ6IHN0cmluZyB9W10gPSBbXTtcblx0XHRcdHJlYWRvbmx5IHVuY29tbWl0dGVkQ29tcHV0ZUNhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdFx0b3ZlcnJpZGUgYXN5bmMgY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0XHRcdHRoaXMudHVybkNvbXB1dGVDYWxscy5wdXNoKHsgc2Vzc2lvbiwgdHVybklkIH0pO1xuXHRcdFx0XHRyZXR1cm4gc3VwZXIuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvbiwgdHVybklkKTtcblx0XHRcdH1cblx0XHRcdG92ZXJyaWRlIGFzeW5jIGNvbXB1dGVVbmNvbW1pdHRlZENoYW5nZXNldChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4ge1xuXHRcdFx0XHR0aGlzLnVuY29tbWl0dGVkQ29tcHV0ZUNhbGxzLnB1c2goc2Vzc2lvbik7XG5cdFx0XHRcdHJldHVybiBzdXBlci5jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbik7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0bGV0IHN1YnNjcmlwdGlvbnM6IFNldDxzdHJpbmc+O1xuXHRcdGZ1bmN0aW9uIG1ha2VTZXJ2aWNlKCk6IENvdW50aW5nQ2hhbmdlc2V0U2VydmljZSB7XG5cdFx0XHRjb25zdCBzdWJzY3JpcHRpb25TZXJ2aWNlID0gY3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZSgpO1xuXHRcdFx0c3Vic2NyaXB0aW9ucyA9IHN1YnNjcmlwdGlvblNlcnZpY2Uuc3Vic2NyaXB0aW9ucztcblx0XHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IENvdW50aW5nQ2hhbmdlc2V0U2VydmljZShcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlTnVsbFNlc3Npb25EYXRhU2VydmljZSgpLFxuXHRcdFx0XHRjcmVhdGVOb29wR2l0U2VydmljZSgpLFxuXHRcdFx0XHROVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSxcblx0XHRcdFx0Y3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRzdWJzY3JpcHRpb25TZXJ2aWNlLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdCkpO1xuXHRcdH1cblx0XHR0ZXN0KCdvblR1cm5Db21wbGV0ZSBzY2hlZHVsZXMgYSBwZXItdHVybiByZWNvbXB1dGUgd2hlbiBzb21lb25lIGlzIHN1YnNjcmliZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRzZXR1cFNlc3Npb24oKTtcblx0XHRcdGNvbnN0IHN2YyA9IG1ha2VTZXJ2aWNlKCk7XG5cdFx0XHRzdWJzY3JpcHRpb25zLmFkZChidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIFNlcXVlbmNlciBkcmFpbnMgYXN5bmM7IHdhaXQgYnJpZWZseSBmb3IgdGhlIHBlci10dXJuIGNhbGwuXG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwICYmIHN2Yy50dXJuQ29tcHV0ZUNhbGxzLmxlbmd0aCA9PT0gMDsgaSsrKSB7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMik7XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRzdmMudHVybkNvbXB1dGVDYWxscyxcblx0XHRcdFx0W3sgc2Vzc2lvbjogc2Vzc2lvblVyaS50b1N0cmluZygpLCB0dXJuSWQ6ICd0dXJuLTEnIH1dLFxuXHRcdFx0XHQnZXhwZWN0ZWQgZXhhY3RseSBvbmUgcGVyLXR1cm4gY29tcHV0ZSBmb3IgdGhlIGNvbXBsZXRlZCB0dXJuJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblR1cm5Db21wbGV0ZSBkb2VzIE5PVCBzY2hlZHVsZSBhIHBlci10dXJuIHJlY29tcHV0ZSB3aGVuIG5vYm9keSBpcyBzdWJzY3JpYmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIEdpdmUgdGhlIHN0YXRpYyBjb21wdXRlcyBhIGNoYW5jZSB0byBkcmFpbiBcdTIwMTQgdGhlIHBlci10dXJuXG5cdFx0XHQvLyBjYWxsIG11c3QgcmVtYWluIGFic2VudCB0aHJvdWdob3V0LlxuXHRcdFx0YXdhaXQgdGltZW91dCgyMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN2Yy50dXJuQ29tcHV0ZUNhbGxzLCBbXSwgJ25vIHBlci10dXJuIGNvbXB1dGUgd2hlbiBub3RoaW5nIG9ic2VydmVzIHRoZSB0dXJuIFVSSScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnb25UdXJuQ29tcGxldGUgc2NoZWR1bGVzIGFuIHVuY29tbWl0dGVkIHJlY29tcHV0ZSB3aGVuIHNvbWVvbmUgaXMgc3Vic2NyaWJlZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0Y29uc3Qgc3ZjID0gbWFrZVNlcnZpY2UoKTtcblx0XHRcdHN1YnNjcmlwdGlvbnMuYWRkKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cblx0XHRcdHN2Yy5vblR1cm5Db21wbGV0ZShzZXNzaW9uVXJpLnRvU3RyaW5nKCksICd0dXJuLTEnKTtcblxuXHRcdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MCAmJiBzdmMudW5jb21taXR0ZWRDb21wdXRlQ2FsbHMubGVuZ3RoID09PSAwOyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgyKTtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHN2Yy51bmNvbW1pdHRlZENvbXB1dGVDYWxscyxcblx0XHRcdFx0W3Nlc3Npb25VcmkudG9TdHJpbmcoKV0sXG5cdFx0XHRcdCdleHBlY3RlZCBleGFjdGx5IG9uZSB1bmNvbW1pdHRlZCBjb21wdXRlIGZvciB0aGUgY29tcGxldGVkIHR1cm4nLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ29uVHVybkNvbXBsZXRlIGRvZXMgTk9UIHNjaGVkdWxlIGFuIHVuY29tbWl0dGVkIHJlY29tcHV0ZSB3aGVuIG5vYm9keSBpcyBzdWJzY3JpYmVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0c2V0dXBTZXNzaW9uKCk7XG5cdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cblx0XHRcdC8vIEdpdmUgdGhlIHN0YXRpYyBjb21wdXRlcyBhIGNoYW5jZSB0byBkcmFpbiBcdTIwMTQgdGhlIHVuY29tbWl0dGVkXG5cdFx0XHQvLyBjYWxsIG11c3QgcmVtYWluIGFic2VudCB0aHJvdWdob3V0LlxuXHRcdFx0YXdhaXQgdGltZW91dCgyMCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN2Yy51bmNvbW1pdHRlZENvbXB1dGVDYWxscywgW10sICdubyB1bmNvbW1pdHRlZCBjb21wdXRlIHdoZW4gbm90aGluZyBvYnNlcnZlcyB0aGUgdW5jb21taXR0ZWQgVVJJJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvblRvb2xDYWxsRWRpdHNBcHBsaWVkIGZpcmVzIHRoZSBwZXItdHVybiBkZWJvdW5jZSBvbmx5IHdoZW4gc3Vic2NyaWJlcnMgZXhpc3Q7IGNhbmNlbGxlZCBieSBvblR1cm5Db21wbGV0ZScsICgpID0+IHtcblx0XHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlLCBtYXhUYXNrQ291bnQ6IDEwXzAwMCB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdHNldHVwU2Vzc2lvbigpO1xuXHRcdFx0XHRjb25zdCBzdmMgPSBtYWtlU2VydmljZSgpO1xuXHRcdFx0XHRzdWJzY3JpcHRpb25zLmFkZChidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpO1xuXG5cdFx0XHRcdC8vIDEpIGVkaXRzIHdpdGggc3Vic2NyaWJlciAtPiBhZnRlciBkZWJvdW5jZSwgZXhhY3RseSBvbmUgcGVyLXR1cm4gY29tcHV0ZSBmaXJlcy5cblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNl8wMDApOyAvLyBkZWJvdW5jZSBpcyA1c1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAxLCAnZGVib3VuY2Ugc2hvdWxkIGZpcmUgb25lIHBlci10dXJuIGNvbXB1dGUnKTtcblxuXHRcdFx0XHQvLyAyKSBhbm90aGVyIGVkaXQgYmF0Y2ggKyBvblR1cm5Db21wbGV0ZSBiZWZvcmUgdGhlIGRlYm91bmNlXG5cdFx0XHRcdC8vIGVsYXBzZXMgLT4gdGhlIGRlYm91bmNlIGlzIGNhbmNlbGxlZCBhbmQgdGhlIGZpbmFsIGNvbXB1dGVcblx0XHRcdFx0Ly8gaXMgc2NoZWR1bGVkIGRpcmVjdGx5IGJ5IG9uVHVybkNvbXBsZXRlIChvbmUgYWRkaXRpb25hbCBjYWxsKS5cblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMV8wMDApO1xuXHRcdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAyLCAnb25UdXJuQ29tcGxldGUgY2FuY2VscyBwZW5kaW5nIGRlYm91bmNlIGFuZCBydW5zIGV4YWN0bHkgb25lIGZpbmFsIGNvbXB1dGUnKTtcblxuXHRcdFx0XHQvLyAzKSBjbGVhcmluZyB0aGUgc3Vic2NyaXB0aW9uIG1pZC1zdHJlYW0gc2lsZW5jZXMgZnV0dXJlXG5cdFx0XHRcdC8vIHBlci10dXJuIGNvbXB1dGVzIGV2ZW4gaWYgbW9yZSBlZGl0cyBhcnJpdmUuXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnMuY2xlYXIoKTtcblx0XHRcdFx0c3ZjLm9uVG9vbENhbGxFZGl0c0FwcGxpZWQoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRcdGF3YWl0IHRpbWVvdXQoNl8wMDApO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ZjLnR1cm5Db21wdXRlQ2FsbHMubGVuZ3RoLCAyLCAndW5zdWJzY3JpYmVkIHR1cm4gbXVzdCBub3QgZ2V0IGFueSBmdXJ0aGVyIHBlci10dXJuIGNvbXB1dGVzJyk7XG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blci10dXJuIFVSSSBzdHJlYW1zIGEgQ2hhbmdlc2V0Q29udGVudENoYW5nZWQgc25hcHNob3QgYXMgdGhlIHNhbWUgdHVybiBpcyByZWNvbXB1dGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Ly8gRW5kLXRvLWVuZCB2YXJpYW50IGV4ZXJjaXNpbmcgdGhlIHJlYWwgYGNvbXB1dGVUdXJuRGlmZnNgIHBhdGhcblx0XHRcdC8vIFx1MjAxNCBwcm9kdWNlcyBhY3R1YWwgZGlmZiBwYXlsb2FkcyBmcm9tIHNlc3Npb24tREIgbWVzc2FnZXMgc29cblx0XHRcdC8vIGBfcHVibGlzaENoYW5nZXNldERpZmZzYCBlbWl0cyBhIGZ1bGwgY29udGVudCBzbmFwc2hvdCBvbiBlYWNoXG5cdFx0XHQvLyByZWNvbXB1dGUgcGFzcy5cblx0XHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBTZXNzaW9uRGF0YWJhc2UoJzptZW1vcnk6Jyk7XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHNlc3Npb25EYi5jbG9zZSgpKSk7XG5cdFx0XHRjb25zdCBsb2NhbFN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdGxvY2FsU3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKHNlc3Npb25EYiksXG5cdFx0XHRcdGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCksXG5cdFx0XHRcdE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UobG9jYWxTdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZShidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJykpLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRsb2NhbFN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdFx0cmVzb3VyY2U6IHNlc3Npb25VcmkudG9TdHJpbmcoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3dkJ10sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobG9jYWxTdGF0ZU1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdFx0Y29uc3QgdHVyblVyaSA9IGAke3Nlc3Npb25VcmkudG9TdHJpbmcoKX0vY2hhbmdlc2V0L3R1cm4vdHVybi0xYDtcblxuXHRcdFx0Ly8gRmlyc3QgY29tcHV0ZSBwYXNzIFx1MjAxNCBubyBlZGl0cyB5ZXQsIHNvIGp1c3QgZXN0YWJsaXNoZXMgdGhlXG5cdFx0XHQvLyBwZXItdHVybiBzdGF0ZSBhdCBzdGF0dXM6IHJlYWR5IHdpdGggYW4gZW1wdHkgZmlsZSBsaXN0LlxuXHRcdFx0YXdhaXQgc3ZjLmNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb25VcmkudG9TdHJpbmcoKSwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3Qgc3RhdHVzUmVhZHkgPSBlbnZlbG9wZXNcblx0XHRcdFx0LmZpbmQoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQgJiYgZS5jaGFubmVsID09PSB0dXJuVXJpKTtcblx0XHRcdGFzc2VydC5vayhzdGF0dXNSZWFkeSwgJ2ZpcnN0IHBlci10dXJuIGNvbXB1dGUgbXVzdCB0cmFuc2l0aW9uIHRoZSBVUkkgdG8gcmVhZHknKTtcblxuXHRcdFx0Ly8gU3Vic2VxdWVudCByZWNvbXB1dGVzIGFyZSBvYnNlcnZhYmxlIHZpYSBgX3B1Ymxpc2hDaGFuZ2VzZXREaWZmc2Bcblx0XHRcdC8vIGV2ZW4gd2l0aCBlbXB0eSBkaWZmcyBcdTIwMTQgdGhlIGRlbHRhIGRpZmZpbmcgaXMgd2hhdCBtYXR0ZXJzIGhlcmUuXG5cdFx0XHQvLyBTbW9rZS1jaGVjayB0aGF0IGNhbGxpbmcgYG9uVHVybkNvbXBsZXRlYCB0cmlnZ2VycyBhbm90aGVyXG5cdFx0XHQvLyBgY29tcHV0ZVR1cm5DaGFuZ2VzZXRgIGludm9jYXRpb24gdGhyb3VnaCB0aGUgc2VxdWVuY2VyLlxuXHRcdFx0ZW52ZWxvcGVzLmxlbmd0aCA9IDA7XG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblVyaS50b1N0cmluZygpLCAndHVybi0xJyk7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDEwMCAmJiAhZW52ZWxvcGVzLnNvbWUoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYW5nZXNldFN0YXR1c0NoYW5nZWQgJiYgZS5jaGFubmVsID09PSBgJHtzZXNzaW9uVXJpLnRvU3RyaW5nKCl9L2NoYW5nZXNldC9zZXNzaW9uYCk7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDIpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gUGVyLXR1cm4gcmVjb21wdXRlIHdhcyBzY2hlZHVsZWQgXHUyMDE0IGF0IG1pbmltdW0gaXRzIHByZXNlbmNlIGlzXG5cdFx0XHQvLyBwcm92ZW4gYnkgdGhlIHN0YXRpYy1zZXNzaW9uIHJlY29tcHV0ZSBhbHNvIGhhdmluZyBydW4gKGJvdGhcblx0XHRcdC8vIHNoYXJlIHRoZSBzYW1lIGBvblR1cm5Db21wbGV0ZWAgZGlzcGF0Y2ggcGF0aCkuXG5cdFx0XHRhc3NlcnQub2soXG5cdFx0XHRcdGVudmVsb3Blcy5zb21lKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRTdGF0dXNDaGFuZ2VkKSxcblx0XHRcdFx0J29uVHVybkNvbXBsZXRlIG11c3QgZHJpdmUgYXQgbGVhc3Qgb25lIGRvd25zdHJlYW0gY2hhbmdlc2V0IHN0YXR1cyB0cmFuc2l0aW9uJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0JywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gbWFrZUNoZWNrcG9pbnRTZXJ2aWNlKHBhaXJzOiBSZWNvcmQ8c3RyaW5nLCB7IHBhcmVudDogc3RyaW5nOyBjdXJyZW50OiBzdHJpbmcgfSB8IHVuZGVmaW5lZD4sIGJhc2VsaW5lUmVmPzogc3RyaW5nKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHQuLi5OVUxMX0NIRUNLUE9JTlRfU0VSVklDRSxcblx0XHRcdFx0Z2V0VHVybkNoZWNrcG9pbnRQYWlyOiBhc3luYyAoX3Nlc3Npb246IFVSSSwgdHVybklkOiBzdHJpbmcpID0+IHBhaXJzW3R1cm5JZF0sXG5cdFx0XHRcdGdldEJhc2VsaW5lQ2hlY2twb2ludFJlZjogYXN5bmMgKCkgPT4gYmFzZWxpbmVSZWYsXG5cdFx0XHR9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3B1Ymxpc2hlcyBkaWZmcyBhcyBSZWFkeSB3aGVuIGJvdGggY2hlY2twb2ludHMgcmVzb2x2ZSBhbmQgZ2l0IHJldHVybnMgZGlmZnMnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uU3RyID0gc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRcdFx0c2V0dXBTZXNzaW9uKCdmaWxlOi8vL3dkJyk7XG5cblx0XHRcdGNvbnN0IGV4cGVjdGVkRGlmZnMgPSBbXG5cdFx0XHRcdHsgYWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93ZC9hLnRzJywgY29udGVudDogeyB1cmk6ICdmaWxlOi8vL3dkL2EudHMnIH0gfSwgZGlmZjogeyBhZGRlZDogNCwgcmVtb3ZlZDogMSB9IH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgY2FsbHM6IEFycmF5PHsgZnJvbVJlZjogc3RyaW5nOyB0b1JlZjogc3RyaW5nIH0+ID0gW107XG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdFNlcnZpY2UuY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzID0gYXN5bmMgKF93ZCwgb3B0cykgPT4ge1xuXHRcdFx0XHRjYWxscy5wdXNoKHsgZnJvbVJlZjogb3B0cy5mcm9tUmVmLCB0b1JlZjogb3B0cy50b1JlZiB9KTtcblx0XHRcdFx0cmV0dXJuIGV4cGVjdGVkRGlmZnM7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlKFxuXHRcdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0XHRjcmVhdGVTZXNzaW9uRGF0YVNlcnZpY2UobmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKSksXG5cdFx0XHRcdGdpdFNlcnZpY2UsXG5cdFx0XHRcdG1ha2VDaGVja3BvaW50U2VydmljZSh7XG5cdFx0XHRcdFx0J29yaWcnOiB7IHBhcmVudDogJ3JlZi1vcmlnLXBhcmVudCcsIGN1cnJlbnQ6ICdyZWYtb3JpZycgfSxcblx0XHRcdFx0XHQnbW9kJzogeyBwYXJlbnQ6ICdyZWYtb3JpZycsIGN1cnJlbnQ6ICdyZWYtbW9kJyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSxcblx0XHRcdFx0Y3JlYXRlT3BlcmF0aW9uU2VydmljZSgpLFxuXHRcdFx0XHRjcmVhdGVTdWJzY3JpcHRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdE5VTExfUkVWSUVXX1NFUlZJQ0UsXG5cdFx0XHRcdE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdFx0KSk7XG5cblx0XHRcdGNvbnN0IGNvbXBhcmVVcmkgPSBhd2FpdCBzdmMuY29tcHV0ZUNvbXBhcmVUdXJuc0NoYW5nZXNldChzZXNzaW9uU3RyLCAnb3JpZycsICdtb2QnKTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBhcmVVcmksIGAke3Nlc3Npb25TdHJ9L2NoYW5nZXNldC9jb21wYXJlL29yaWcvbW9kYCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNhbGxzLCBbeyBmcm9tUmVmOiAncmVmLW9yaWcnLCB0b1JlZjogJ3JlZi1tb2QnIH1dKTtcblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGNvbXBhcmVVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZmlsZXM6IEFycmF5PHsgaWQ6IHN0cmluZyB9PiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1czogc3RhdGU/LnN0YXR1cywgaWRzOiBzdGF0ZT8uZmlsZXMubWFwKGYgPT4gZi5pZCkgfSwge1xuXHRcdFx0XHRzdGF0dXM6ICdyZWFkeScsXG5cdFx0XHRcdGlkczogWydmaWxlOi8vL3dkL2EudHMnXSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndHJhbnNpdGlvbnMgdG8gRXJyb3Igd2hlbiBlaXRoZXIgY2hlY2twb2ludCBpcyBtaXNzaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc2Vzc2lvblN0ciA9IHNlc3Npb25VcmkudG9TdHJpbmcoKTtcblx0XHRcdHNldHVwU2Vzc2lvbignZmlsZTovLy93ZCcpO1xuXG5cdFx0XHRjb25zdCBnaXRTZXJ2aWNlID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGxldCBnaXRDYWxscyA9IDA7XG5cdFx0XHRnaXRTZXJ2aWNlLmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jICgpID0+IHsgZ2l0Q2FsbHMrKzsgcmV0dXJuIHVuZGVmaW5lZDsgfTtcblx0XHRcdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZShcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCkpLFxuXHRcdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0XHRtYWtlQ2hlY2twb2ludFNlcnZpY2Uoe1xuXHRcdFx0XHRcdCdvcmlnJzogeyBwYXJlbnQ6ICdyZWYtb3JpZy1wYXJlbnQnLCBjdXJyZW50OiAncmVmLW9yaWcnIH0sXG5cdFx0XHRcdFx0Ly8gJ21vZCcgaXMgaW50ZW50aW9uYWxseSBhYnNlbnRcblx0XHRcdFx0fSksXG5cdFx0XHRcdGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZShzdGF0ZU1hbmFnZXIsIG5ldyBOdWxsTG9nU2VydmljZSgpKSksXG5cdFx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU3Vic2NyaXB0aW9uU2VydmljZSgpLFxuXHRcdFx0XHROVUxMX1JFVklFV19TRVJWSUNFLFxuXHRcdFx0XHROdWxsVGVsZW1ldHJ5U2VydmljZSxcblx0XHRcdCkpO1xuXG5cdFx0XHRjb25zdCBjb21wYXJlVXJpID0gYXdhaXQgc3ZjLmNvbXB1dGVDb21wYXJlVHVybnNDaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ29yaWcnLCAnbW9kJyk7XG5cblx0XHRcdGNvbnN0IHNuYXBzaG90ID0gc3RhdGVNYW5hZ2VyLmdldFNuYXBzaG90KGNvbXBhcmVVcmkpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdD8uc3RhdGUgYXMgeyBzdGF0dXM6IHN0cmluZzsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9IH0gfCB1bmRlZmluZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnN0YXR1cywgJ2Vycm9yJyk7XG5cdFx0XHRhc3NlcnQub2soc3RhdGU/LmVycm9yPy5tZXNzYWdlLmluY2x1ZGVzKCdtb2RpZmllZCB0dXJuJyksIGBleHBlY3RlZCBlcnJvciB0byBuYW1lIHRoZSBtaXNzaW5nIHNpZGUsIGdvdCAke3N0YXRlPy5lcnJvcj8ubWVzc2FnZX1gKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChnaXRDYWxscywgMCwgJ2dpdCBtdXN0IG5vdCBiZSBpbnZva2VkIHdoZW4gYSBjaGVja3BvaW50IGlzIG1pc3NpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgUmVhZHkgc25hcHNob3Qgd2hlbiBib3RoIGNoZWNrcG9pbnRzIHBvaW50IGF0IHRoZSBzYW1lIHJlZicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRsZXQgZ2l0Q2FsbHMgPSAwO1xuXHRcdFx0Z2l0U2VydmljZS5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyAoKSA9PiB7IGdpdENhbGxzKys7IHJldHVybiB1bmRlZmluZWQ7IH07XG5cdFx0XHRjb25zdCBzdmMgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRcdHN0YXRlTWFuYWdlcixcblx0XHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpKSxcblx0XHRcdFx0Z2l0U2VydmljZSxcblx0XHRcdFx0bWFrZUNoZWNrcG9pbnRTZXJ2aWNlKHtcblx0XHRcdFx0XHQnb3JpZyc6IHsgcGFyZW50OiAncDEnLCBjdXJyZW50OiAnc2FtZS1yZWYnIH0sXG5cdFx0XHRcdFx0J21vZCc6IHsgcGFyZW50OiAnc2FtZS1yZWYnLCBjdXJyZW50OiAnc2FtZS1yZWYnIH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgY29tcGFyZVVyaSA9IGF3YWl0IHN2Yy5jb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb25TdHIsICdvcmlnJywgJ21vZCcpO1xuXG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjb21wYXJlVXJpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Q/LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmc7IGZpbGVzOiBBcnJheTx1bmtub3duPiB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXR1czogc3RhdGU/LnN0YXR1cywgZmlsZXM6IHN0YXRlPy5maWxlcyB9LCB7IHN0YXR1czogJ3JlYWR5JywgZmlsZXM6IFtdIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGdpdENhbGxzLCAwLCAnZ2l0IGRpZmYgbXVzdCBiZSBzaG9ydC1jaXJjdWl0ZWQgd2hlbiBib3RoIHJlZnMgbWF0Y2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYW5zaXRpb25zIHRvIEVycm9yIHdoZW4gdGhlIGdpdCBkaWZmIHJldHVybnMgdW5kZWZpbmVkIChnaXQgZmFpbHVyZSwgbm90IGVtcHR5KScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHNlc3Npb25TdHIgPSBzZXNzaW9uVXJpLnRvU3RyaW5nKCk7XG5cdFx0XHRzZXR1cFNlc3Npb24oJ2ZpbGU6Ly8vd2QnKTtcblxuXHRcdFx0Y29uc3QgZ2l0U2VydmljZSA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXRTZXJ2aWNlLmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jICgpID0+IHVuZGVmaW5lZDtcblx0XHRcdGNvbnN0IHN2YyA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZShcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLFxuXHRcdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdFx0Y3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCkpLFxuXHRcdFx0XHRnaXRTZXJ2aWNlLFxuXHRcdFx0XHRtYWtlQ2hlY2twb2ludFNlcnZpY2Uoe1xuXHRcdFx0XHRcdCdvcmlnJzogeyBwYXJlbnQ6ICdwJywgY3VycmVudDogJ3JlZi1vcmlnJyB9LFxuXHRcdFx0XHRcdCdtb2QnOiB7IHBhcmVudDogJ3JlZi1vcmlnJywgY3VycmVudDogJ3JlZi1tb2QnIH0sXG5cdFx0XHRcdH0pLFxuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSkpLFxuXHRcdFx0XHRjcmVhdGVPcGVyYXRpb25TZXJ2aWNlKCksXG5cdFx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoKSxcblx0XHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdFx0TnVsbFRlbGVtZXRyeVNlcnZpY2UsXG5cdFx0XHQpKTtcblxuXHRcdFx0Y29uc3QgY29tcGFyZVVyaSA9IGF3YWl0IHN2Yy5jb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb25TdHIsICdvcmlnJywgJ21vZCcpO1xuXG5cdFx0XHRjb25zdCBzbmFwc2hvdCA9IHN0YXRlTWFuYWdlci5nZXRTbmFwc2hvdChjb21wYXJlVXJpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Q/LnN0YXRlIGFzIHsgc3RhdHVzOiBzdHJpbmc7IGVycm9yPzogeyBtZXNzYWdlOiBzdHJpbmcgfSB9IHwgdW5kZWZpbmVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5zdGF0dXMsICdlcnJvcicpO1xuXHRcdFx0YXNzZXJ0Lm9rKHN0YXRlPy5lcnJvcj8ubWVzc2FnZS5pbmNsdWRlcygnZ2l0JyksIGBleHBlY3RlZCBnaXQtZmFpbHVyZSBlcnJvciBtZXNzYWdlLCBnb3QgJHtzdGF0ZT8uZXJyb3I/Lm1lc3NhZ2V9YCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8qKlxuICogQSBsb2cgc2VydmljZSB0aGF0IHJlY29yZHMgZXZlcnkgd2FybmluZy9lcnJvciBtZXNzYWdlIHNvIG11bHRpLXJvb3QgdGVzdHNcbiAqIGNhbiBhc3NlcnQgdGhlIG5ldmVyLWhhcmQtZmFpbCBwYXRoIGxvZ2dlZCB0aGUgZXhwZWN0ZWQgcGVyLWZvbGRlciBmYWlsdXJlLlxuICovXG5jbGFzcyBSZWNvcmRpbmdMb2dTZXJ2aWNlIGV4dGVuZHMgTnVsbExvZ1NlcnZpY2Uge1xuXHRyZWFkb25seSBlcnJvcnM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IHdhcm5pbmdzOiBzdHJpbmdbXSA9IFtdO1xuXHRvdmVycmlkZSBlcnJvcihtZXNzYWdlOiBzdHJpbmcgfCBFcnJvcik6IHZvaWQge1xuXHRcdHRoaXMuZXJyb3JzLnB1c2gobWVzc2FnZSBpbnN0YW5jZW9mIEVycm9yID8gbWVzc2FnZS5tZXNzYWdlIDogbWVzc2FnZSk7XG5cdH1cblx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcpOiB2b2lkIHtcblx0XHR0aGlzLndhcm5pbmdzLnB1c2gobWVzc2FnZSk7XG5cdH1cbn1cblxuLyoqXG4gKiBNdWx0aS1yb290IHR1cm4gY2hhbmdlc2V0IGFnZ3JlZ2F0aW9uIChBQy0yKS4gQSBzZXBhcmF0ZSB0b3AtbGV2ZWwgc3VpdGUgc29cbiAqIHRoZXNlIHJ1biBhZ2FpbnN0IHRoZSBjdXJyZW50IHNlcnZpY2UgKHRoZSBvbGRlciBgQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZWBcbiAqIHN1aXRlIGFib3ZlIGlzIHNraXBwZWQgcGVuZGluZyBhbiB1bnJlbGF0ZWQgY2F0YWxvZ3VlIHJlZnJlc2gpLlxuICovXG5zdWl0ZSgnQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZSAtIG11bHRpLXJvb3QgdHVybiBjaGFuZ2VzZXQnLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdGNvbnN0IHNlc3Npb25TdHIgPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tbXInKS50b1N0cmluZygpO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5jbGVhcigpO1xuXHR9KTtcblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gZ2l0RGlmZihwYXRoOiBzdHJpbmcsIGFkZGVkID0gMSwgcmVtb3ZlZCA9IDApOiBJU2Vzc2lvbkZpbGVEaWZmIHtcblx0XHRjb25zdCB1cmkgPSBVUkkuZmlsZShwYXRoKS50b1N0cmluZygpO1xuXHRcdHJldHVybiB7IGFmdGVyOiB7IHVyaSwgY29udGVudDogeyB1cmkgfSB9LCBkaWZmOiB7IGFkZGVkLCByZW1vdmVkIH0gfTtcblx0fVxuXG5cdC8qKiBCdWlsZHMgYSBjaGVja3BvaW50IHNlcnZpY2Ugd2hvc2UgcGVyLXJlcG8gcGFpciBpcyBkZXJpdmVkIGZyb20gdGhlIHdvcmtpbmcgZGlyZWN0b3J5LiAqL1xuXHRmdW5jdGlvbiBtYWtlQ2hlY2twb2ludChwYWlyRm9yOiAod29ya2luZ0RpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkKSA9PiB7IHBhcmVudDogc3RyaW5nOyBjdXJyZW50OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCk6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0Z2V0VHVybkNoZWNrcG9pbnRQYWlyOiBhc3luYyAoX3Nlc3Npb246IFVSSSwgX3R1cm5JZDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5PzogVVJJKSA9PiBwYWlyRm9yKHdvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkpLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBidWlsZChvcHRpb25zOiB7XG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzdHJpbmdbXTtcblx0XHRnaXQ6IElBZ2VudEhvc3RHaXRTZXJ2aWNlO1xuXHRcdGNoZWNrcG9pbnQ6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZTtcblx0XHRkYj86IFRlc3RTZXNzaW9uRGF0YWJhc2U7XG5cdFx0bG9nPzogUmVjb3JkaW5nTG9nU2VydmljZTtcblx0XHR0ZWxlbWV0cnk/OiBJVGVsZW1ldHJ5U2VydmljZTtcblx0XHRzdWJzY3JpcHRpb25zPzogc3RyaW5nW107XG5cdFx0cGVlcj86IHsgcmVzb3VyY2U6IHN0cmluZzsgZGI6IFRlc3RTZXNzaW9uRGF0YWJhc2U7IHR1cm5JZDogc3RyaW5nIH07XG5cdH0pOiB7IHN2YzogQWdlbnRIb3N0Q2hhbmdlc2V0U2VydmljZTsgc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXI7IGxvZzogUmVjb3JkaW5nTG9nU2VydmljZSB9IHtcblx0XHRjb25zdCBsb2cgPSBvcHRpb25zLmxvZyA/PyBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlTWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdFx0Y29uc3QgZGIgPSBvcHRpb25zLmRiID8/IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Ly8gVGhlIHByb2R1Y3Rpb24gZGlmZi1jb3VudCB3b3JrZXIgcnVucyBhbiBFU00gbW9kdWxlIGluIGEgcmF3XG5cdFx0Ly8gd29ya2VyX3RocmVhZCwgd2hpY2ggdGhlIHVuaXQtdGVzdCBoYXJuZXNzIGNhbm5vdCBsb2FkLCBzbyBzdWJzdGl0dXRlXG5cdFx0Ly8gdGhlIHNoYXJlZCBzeW5jaHJvbm91cyBpbi1wcm9jZXNzIGNvbXB1dGVyIHZpYSB0aGUgZmFjdG9yeSBzZWFtLlxuXHRcdGNvbnN0IGRpZmZTZXJ2aWNlID0gbmV3IFRlc3REaWZmQ29tcHV0ZVNlcnZpY2UoKTtcblx0XHRjbGFzcyBUZXN0YWJsZUNoYW5nZXNldFNlcnZpY2UgZXh0ZW5kcyBBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0XHRcdHByb3RlY3RlZCBvdmVycmlkZSBfY3JlYXRlRGlmZkNvbXB1dGVTZXJ2aWNlKCkge1xuXHRcdFx0XHRyZXR1cm4gZGlmZlNlcnZpY2U7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdGNvbnN0IHNlc3Npb25EYXRhU2VydmljZSA9IGNyZWF0ZVNlc3Npb25EYXRhU2VydmljZShkYik7XG5cdFx0Y29uc3QgcGVlckRhdGFTZXJ2aWNlID0gb3B0aW9ucy5wZWVyID8gY3JlYXRlU2Vzc2lvbkRhdGFTZXJ2aWNlKG9wdGlvbnMucGVlci5kYikgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3Qgc3ZjID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0YWJsZUNoYW5nZXNldFNlcnZpY2UoXG5cdFx0XHRzdGF0ZU1hbmFnZXIsXG5cdFx0XHRsb2csXG5cdFx0XHR7XG5cdFx0XHRcdC4uLnNlc3Npb25EYXRhU2VydmljZSxcblx0XHRcdFx0b3BlbkRhdGFiYXNlOiByZXNvdXJjZSA9PiBvcHRpb25zLnBlZXI/LnJlc291cmNlID09PSByZXNvdXJjZS50b1N0cmluZygpXG5cdFx0XHRcdFx0PyBwZWVyRGF0YVNlcnZpY2UhLm9wZW5EYXRhYmFzZShyZXNvdXJjZSlcblx0XHRcdFx0XHQ6IHNlc3Npb25EYXRhU2VydmljZS5vcGVuRGF0YWJhc2UocmVzb3VyY2UpLFxuXHRcdFx0fSxcblx0XHRcdG9wdGlvbnMuZ2l0LFxuXHRcdFx0b3B0aW9ucy5jaGVja3BvaW50LFxuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudENvbmZpZ3VyYXRpb25TZXJ2aWNlKHN0YXRlTWFuYWdlciwgbmV3IE51bGxMb2dTZXJ2aWNlKCkpKSxcblx0XHRcdGNyZWF0ZU9wZXJhdGlvblNlcnZpY2UoKSxcblx0XHRcdGNyZWF0ZVN1YnNjcmlwdGlvblNlcnZpY2UoLi4uKG9wdGlvbnMuc3Vic2NyaXB0aW9ucyA/PyBbXSkpLFxuXHRcdFx0TlVMTF9SRVZJRVdfU0VSVklDRSxcblx0XHRcdG9wdGlvbnMudGVsZW1ldHJ5ID8/IE51bGxUZWxlbWV0cnlTZXJ2aWNlLFxuXHRcdCkpO1xuXHRcdHN0YXRlTWFuYWdlci5jcmVhdGVTZXNzaW9uKHtcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uU3RyLFxuXHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBvcHRpb25zLndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR9KTtcblx0XHRpZiAob3B0aW9ucy5wZWVyKSB7XG5cdFx0XHRzdGF0ZU1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uU3RyLCBvcHRpb25zLnBlZXIucmVzb3VyY2UpO1xuXHRcdFx0c3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKG9wdGlvbnMucGVlci5yZXNvdXJjZSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiBvcHRpb25zLnBlZXIudHVybklkLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG5ldyBEYXRlKDApLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3BlZXInLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihvcHRpb25zLnBlZXIucmVzb3VyY2UsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6IG9wdGlvbnMucGVlci50dXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiAxLFxuXHRcdFx0fSk7XG5cdFx0fVxuXHRcdHJldHVybiB7IHN2Yywgc3RhdGVNYW5hZ2VyLCBsb2cgfTtcblx0fVxuXG5cdHRlc3QoJ2FnZ3JlZ2F0ZXMgdHVybiBkaWZmcyBhY3Jvc3MgYWxsIGZvbGRlcnMgb2YgYSBtdWx0aS1yb290IHNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiBVUkkucGFyc2Uod2QudG9TdHJpbmcoKSk7XG5cdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jIHdkID0+IHtcblx0XHRcdGNvbnN0IHJvb3QgPSB3ZC50b1N0cmluZygpO1xuXHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9BJykgeyByZXR1cm4gW2dpdERpZmYoJy9yZXBvQS9hLnRzJyldOyB9XG5cdFx0XHRpZiAocm9vdCA9PT0gJ2ZpbGU6Ly8vcmVwb0InKSB7IHJldHVybiBbZ2l0RGlmZignL3JlcG9CL2IudHMnKV07IH1cblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fTtcblx0XHRjb25zdCBjaGVja3BvaW50ID0gbWFrZUNoZWNrcG9pbnQocm9vdCA9PiAoeyBwYXJlbnQ6IGAke3Jvb3R9fnBgLCBjdXJyZW50OiBgJHtyb290fX5jYCB9KSk7XG5cdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludCB9KTtcblxuXHRcdGNvbnN0IHR1cm5VcmkgPSBhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodHVyblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5zdGF0dXMsIENoYW5nZXNldFN0YXR1cy5SZWFkeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdG5ldyBTZXQoc3RhdGU/LmZpbGVzLm1hcChmID0+IGYuaWQpKSxcblx0XHRcdG5ldyBTZXQoW1VSSS5maWxlKCcvcmVwb0EvYS50cycpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvcmVwb0IvYi50cycpLnRvU3RyaW5nKCldKSxcblx0XHRcdCd0aGUgdHVybiBjaGFuZ2VzZXQgbXVzdCBjb250YWluIGZpbGVzIGZyb20gZXZlcnkgZm9sZGVyJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJ0aXRpb25zIGdpdCB2cyBub24tZ2l0IGZvbGRlcnMgc28gZ2l0LWZvbGRlciBlZGl0cyBhcmUgbm90IGRvdWJsZS1jb3VudGVkIGJ5IHRoZSBEQicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Ly8gVGhlIERCIGVkaXQgdHJhY2tlciBpcyBwYXRoLWJhc2VkIChubyBmb2xkZXIgY29sdW1uKSBzbyBpdCByZWNvcmRzXG5cdFx0Ly8gZWRpdHMgZnJvbSBCT1RIIGZvbGRlcnMsIGluY2x1ZGluZyB0d28gdW5kZXIgdGhlIGdpdC1iYWNrZWQgcmVwb0IuXG5cdFx0ZGIuYWRkRWRpdCh7IHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Y1gnLCBmaWxlUGF0aDogJy9mb2xkZXJBL3gudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsIGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsIGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYVxcbmInKSB9KTtcblx0XHRkYi5hZGRFZGl0KHsgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjWScsIGZpbGVQYXRoOiAnL3JlcG9CL3kudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsIGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsIGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYycpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnY1xcbmQnKSB9KTtcblx0XHRkYi5hZGRFZGl0KHsgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjWicsIGZpbGVQYXRoOiAnL3JlcG9CL3oudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsIGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsIGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnZScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnZVxcbmYnKSB9KTtcblxuXHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gd2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0InID8gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG9CJykgOiB1bmRlZmluZWQ7XG5cdFx0Ly8gZ2l0IHJlcG9ydHMgb25seSB5LnR4dCBmb3IgcmVwb0IgKG5vdCB6LnR4dCkgXHUyMDE0IGlmIHRoZSBEQiBwYXJ0aXRpb25cblx0XHQvLyBsZWFrZWQgZ2l0LWZvbGRlciBlZGl0cywgei50eHQgd291bGQgd3JvbmdseSBhcHBlYXIuXG5cdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jICgpID0+IFtnaXREaWZmKCcvcmVwb0IveS50eHQnLCAyLCAwKV07XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IG1ha2VDaGVja3BvaW50KCgpID0+ICh7IHBhcmVudDogJ3AnLCBjdXJyZW50OiAnYycgfSkpO1xuXHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vZm9sZGVyQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludCwgZGIgfSk7XG5cblx0XHRjb25zdCB0dXJuVXJpID0gYXdhaXQgc3ZjLmNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb25TdHIsICd0dXJuLTEnKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHR1cm5VcmkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZT8uc3RhdHVzLCBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkpO1xuXHRcdGNvbnN0IGlkcyA9IHN0YXRlIS5maWxlcy5tYXAoZiA9PiBmLmlkKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Wy4uLmlkc10uc29ydCgpLFxuXHRcdFx0W1VSSS5maWxlKCcvZm9sZGVyQS94LnR4dCcpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvcmVwb0IveS50eHQnKS50b1N0cmluZygpXS5zb3J0KCksXG5cdFx0XHQnbm9uLWdpdCBmb2xkZXJBIGNvbWVzIGZyb20gdGhlIERCOyByZXBvQiBjb21lcyBmcm9tIGdpdCBvbmx5IChubyBsZWFrZWQgei50eHQpJyxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGlkcy5maWx0ZXIoaWQgPT4gaWQgPT09IFVSSS5maWxlKCcvcmVwb0IveS50eHQnKS50b1N0cmluZygpKS5sZW5ndGgsXG5cdFx0XHQxLFxuXHRcdFx0J3RoZSBnaXQtYmFja2VkIGZpbGUgbXVzdCBhcHBlYXIgZXhhY3RseSBvbmNlJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VzIHRoZSBvd25pbmcgcGVlciBkYXRhYmFzZSBmb3IgbXVsdGktcm9vdCBub24tZ2l0IGZhbGxiYWNrJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25EYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0Y29uc3QgcGVlckRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRwZWVyRGIuYWRkRWRpdCh7IHR1cm5JZDogJ3BlZXItdHVybicsIHRvb2xDYWxsSWQ6ICd0YzEnLCBmaWxlUGF0aDogJy9mb2xkZXJBL3BlZXIudHh0Jywga2luZDogRmlsZUVkaXRLaW5kLkVkaXQsIGFkZGVkTGluZXM6IHVuZGVmaW5lZCwgcmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsIGJlZm9yZUNvbnRlbnQ6IGVuY29kZVN0cmluZygnYScpLCBhZnRlckNvbnRlbnQ6IGVuY29kZVN0cmluZygnYVxcbmInKSB9KTtcblx0XHRjb25zdCBwZWVyUmVzb3VyY2UgPSAnYWhwLWNoYXQ6Ly9wZWVyLTEvc2Vzc2lvbi1tcic7XG5cdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoe1xuXHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vZm9sZGVyQScsICdmaWxlOi8vL2ZvbGRlckInXSxcblx0XHRcdGdpdDogY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRcdGNoZWNrcG9pbnQ6IE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0ZGI6IHNlc3Npb25EYixcblx0XHRcdHBlZXI6IHsgcmVzb3VyY2U6IHBlZXJSZXNvdXJjZSwgZGI6IHBlZXJEYiwgdHVybklkOiAncGVlci10dXJuJyB9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHVyblVyaSA9IGF3YWl0IHN2Yy5jb21wdXRlVHVybkNoYW5nZXNldChzZXNzaW9uU3RyLCAncGVlci10dXJuJyk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZSh0dXJuVXJpKT8uZmlsZXMubWFwKGZpbGUgPT4gZmlsZS5pZCksIFtcblx0XHRcdFVSSS5maWxlKCcvZm9sZGVyQS9wZWVyLnR4dCcpLnRvU3RyaW5nKCksXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RpZmZzIGEgcmVwb3NpdG9yeSBzaGFyZWQgYnkgdHdvIHdvcmtpbmcgZGlyZWN0b3JpZXMgZXhhY3RseSBvbmNlIChkZWR1cCBieSByZXBvIHJvb3QpJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG8nKTtcblx0XHRsZXQgZGlmZkNhbGxzID0gMDtcblx0XHRnaXQuY29tcHV0ZUZpbGVEaWZmc0JldHdlZW5SZWZzID0gYXN5bmMgKCkgPT4geyBkaWZmQ2FsbHMrKzsgcmV0dXJuIFtnaXREaWZmKCcvcmVwby9zaGFyZWQudHMnKV07IH07XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IG1ha2VDaGVja3BvaW50KCgpID0+ICh7IHBhcmVudDogJ3AnLCBjdXJyZW50OiAnYycgfSkpO1xuXHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwbycsICdmaWxlOi8vL3JlcG8vc3ViJ10sIGdpdCwgY2hlY2twb2ludCB9KTtcblxuXHRcdGNvbnN0IHR1cm5VcmkgPSBhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRpZmZDYWxscywgMSwgJ3RoZSBzaGFyZWQgcmVwb3NpdG9yeSBpcyBkaWZmZWQgZXhhY3RseSBvbmNlJyk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodHVyblVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZT8uZmlsZXMubWFwKGYgPT4gZi5pZCksIFtVUkkuZmlsZSgnL3JlcG8vc2hhcmVkLnRzJykudG9TdHJpbmcoKV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyB0aGUgdHVybiBjaGFuZ2VzZXQgcmVhZHkgYW5kIGxvZ3MgYW4gZXJyb3Igd2hlbiBvbmUgZm9sZGVyIGdpdCBkaWZmIHRocm93cycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdGdpdC5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRpZiAod2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0JhZCcpIHsgdGhyb3cgbmV3IEVycm9yKCdnaXQgZXhwbG9kZWQnKTsgfVxuXHRcdFx0cmV0dXJuIFtnaXREaWZmKCcvcmVwb0dvb2QvZy50cycpXTtcblx0XHR9O1xuXHRcdGNvbnN0IGNoZWNrcG9pbnQgPSBtYWtlQ2hlY2twb2ludChyb290ID0+ICh7IHBhcmVudDogYCR7cm9vdH1+cGAsIGN1cnJlbnQ6IGAke3Jvb3R9fmNgIH0pKTtcblx0XHRjb25zdCB7IHN2Yywgc3RhdGVNYW5hZ2VyIH0gPSBidWlsZCh7IHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG9CYWQnLCAnZmlsZTovLy9yZXBvR29vZCddLCBnaXQsIGNoZWNrcG9pbnQsIGxvZyB9KTtcblxuXHRcdGNvbnN0IHR1cm5VcmkgPSBhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodHVyblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5zdGF0dXMsIENoYW5nZXNldFN0YXR1cy5SZWFkeSwgJ29uZSBmb2xkZXIgZmFpbHVyZSBtdXN0IG5vdCBlcnJvciB0aGUgd2hvbGUgY2hhbmdlc2V0Jyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZT8uZmlsZXMubWFwKGYgPT4gZi5pZCksIFtVUkkuZmlsZSgnL3JlcG9Hb29kL2cudHMnKS50b1N0cmluZygpXSk7XG5cdFx0YXNzZXJ0Lm9rKGxvZy5lcnJvcnMuc29tZShlID0+IGUuaW5jbHVkZXMoJ3JlcG9CYWQnKSksIGBleHBlY3RlZCBhbiBlcnJvciBuYW1pbmcgdGhlIGZhaWxpbmcgcmVwb3NpdG9yeSwgZ290ICR7SlNPTi5zdHJpbmdpZnkobG9nLmVycm9ycyl9YCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgZ2l0IHJlcG9zaXRvcnkgd2hvc2UgdHVybiBkaWZmIGZhaWxzIGZhbGxzIGJhY2sgdG8gdGhhdCBmb2xkZXJcXCdzIERCIGVkaXRzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIHJlcG9CYWQgaXMgZ2l0LWJhY2tlZCBidXQgaXRzIGdpdCB0dXJuIGRpZmYgdGhyb3dzOyB0aGUgZWRpdCB1bmRlciBpdCBpc1xuXHRcdC8vIHRyYWNrZWQgb25seSBpbiB0aGUgcGF0aC1iYXNlZCBEQiwgc28gdGhlIHBlci1mb2xkZXIgREIgZmFsbGJhY2sgbXVzdFxuXHRcdC8vIHN1cmZhY2UgaXQgaW5zdGVhZCBvZiB0aGUgZm9sZGVyIGJlaW5nIGRyb3BwZWQuXG5cdFx0ZGIuYWRkRWRpdCh7IHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Y0JhZCcsIGZpbGVQYXRoOiAnL3JlcG9CYWQveC50cycsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCBhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLCBiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FcXG5iJykgfSk7XG5cdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiBVUkkucGFyc2Uod2QudG9TdHJpbmcoKSk7XG5cdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jIHdkID0+IHtcblx0XHRcdGlmICh3ZC50b1N0cmluZygpID09PSAnZmlsZTovLy9yZXBvQmFkJykgeyB0aHJvdyBuZXcgRXJyb3IoJ2dpdCBleHBsb2RlZCcpOyB9XG5cdFx0XHRyZXR1cm4gW2dpdERpZmYoJy9yZXBvR29vZC9nLnRzJyldO1xuXHRcdH07XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IG1ha2VDaGVja3BvaW50KHJvb3QgPT4gKHsgcGFyZW50OiBgJHtyb290fX5wYCwgY3VycmVudDogYCR7cm9vdH1+Y2AgfSkpO1xuXHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwb0JhZCcsICdmaWxlOi8vL3JlcG9Hb29kJ10sIGdpdCwgY2hlY2twb2ludCwgZGIsIGxvZyB9KTtcblxuXHRcdGNvbnN0IHR1cm5VcmkgPSBhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodHVyblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlPy5zdGF0dXMsIENoYW5nZXNldFN0YXR1cy5SZWFkeSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFsuLi5zdGF0ZSEuZmlsZXMubWFwKGYgPT4gZi5pZCldLnNvcnQoKSxcblx0XHRcdFtVUkkuZmlsZSgnL3JlcG9CYWQveC50cycpLnRvU3RyaW5nKCksIFVSSS5maWxlKCcvcmVwb0dvb2QvZy50cycpLnRvU3RyaW5nKCldLnNvcnQoKSxcblx0XHRcdCd0aGUgZmFpbGVkIGdpdCByZXBvIGNvbnRyaWJ1dGVzIGl0cyBEQi10cmFja2VkIGVkaXRzIGluc3RlYWQgb2YgZHJvcHBpbmcgdGhlIGZvbGRlcicsXG5cdFx0KTtcblx0XHRhc3NlcnQub2sobG9nLmVycm9ycy5zb21lKGUgPT4gZS5pbmNsdWRlcygncmVwb0JhZCcpICYmIGUuaW5jbHVkZXMoJ2ZhbGxpbmcgYmFjayB0byB0cmFja2VkIGVkaXRzJykpLCBgZXhwZWN0ZWQgYSBmYWxsYmFjayBlcnJvciBuYW1pbmcgdGhlIHJlcG8sIGdvdCAke0pTT04uc3RyaW5naWZ5KGxvZy5lcnJvcnMpfWApO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGZvbGRlciB3aG9zZSByZXBvc2l0b3J5LXJvb3QgbG9va3VwIHRocm93cyBpcyB0cmVhdGVkIGFzIG5vbi1naXQgKERCIGZhbGxiYWNrKSB3aXRob3V0IGRyb3BwaW5nIHRoZSB3aG9sZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBSZWNvcmRpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdC8vIHJlcG9CYWQncyBST09UIHJlc29sdXRpb24gZmFpbHMgKG5vdCBpdHMgZ2l0IGRpZmYpLiBJdHMgZWRpdCBpcyB0cmFja2VkXG5cdFx0Ly8gb25seSBpbiB0aGUgcGF0aC1iYXNlZCBEQiwgc28gaXQgbXVzdCBzdXJmYWNlIHZpYSB0aGUgbm9uLWdpdCBmYWxsYmFja1xuXHRcdC8vIHdoaWxlIHJlcG9Hb29kIHN0aWxsIGNvbnRyaWJ1dGVzIGl0cyBnaXQgZGlmZiBcdTIwMTQgYmVmb3JlIElzc3VlIDEwIGEgc2luZ2xlXG5cdFx0Ly8gcm9vdC1yZXNvbHV0aW9uIGZhaWx1cmUgZHJvcHBlZCB0aGUgV0hPTEUgdHVybiB0byBhbiBlbXB0eSBjaGFuZ2VzZXQuXG5cdFx0ZGIuYWRkRWRpdCh7IHR1cm5JZDogJ3R1cm4tMScsIHRvb2xDYWxsSWQ6ICd0Y0JhZCcsIGZpbGVQYXRoOiAnL3JlcG9CYWQveC50cycsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCBhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLCBiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FcXG5iJykgfSk7XG5cdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRpZiAod2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0JhZCcpIHsgdGhyb3cgbmV3IEVycm9yKCdyZXYtcGFyc2UgZXhwbG9kZWQnKTsgfVxuXHRcdFx0cmV0dXJuIFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHR9O1xuXHRcdGdpdC5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyAoKSA9PiBbZ2l0RGlmZignL3JlcG9Hb29kL2cudHMnKV07XG5cdFx0Y29uc3QgY2hlY2twb2ludCA9IG1ha2VDaGVja3BvaW50KHJvb3QgPT4gKHsgcGFyZW50OiBgJHtyb290fX5wYCwgY3VycmVudDogYCR7cm9vdH1+Y2AgfSkpO1xuXHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwb0JhZCcsICdmaWxlOi8vL3JlcG9Hb29kJ10sIGdpdCwgY2hlY2twb2ludCwgZGIsIGxvZyB9KTtcblxuXHRcdGNvbnN0IHR1cm5VcmkgPSBhd2FpdCBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUodHVyblVyaSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0dXM6IHN0YXRlPy5zdGF0dXMsXG5cdFx0XHRmaWxlczogWy4uLnN0YXRlIS5maWxlcy5tYXAoZiA9PiBmLmlkKV0uc29ydCgpLFxuXHRcdFx0bG9nZ2VkUmVwb0JhZDogbG9nLmVycm9ycy5zb21lKGUgPT4gZS5pbmNsdWRlcygncmVwb0JhZCcpKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdGZpbGVzOiBbVVJJLmZpbGUoJy9yZXBvQmFkL3gudHMnKS50b1N0cmluZygpLCBVUkkuZmlsZSgnL3JlcG9Hb29kL2cudHMnKS50b1N0cmluZygpXS5zb3J0KCksXG5cdFx0XHRsb2dnZWRSZXBvQmFkOiB0cnVlLFxuXHRcdH0sICd0aGUgZmFpbGVkLXJvb3QgZm9sZGVyIGZhbGxzIGJhY2sgdG8gaXRzIERCIGVkaXRzOyB0aGUgaGVhbHRoeSBmb2xkZXIgaXMgdW5hZmZlY3RlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdtdWx0aS1mb2xkZXIgdHVybiBkaWZmcyBmYW4gb3V0IG92ZXIgZXZlcnkgcmVwb3NpdG9yeSB3aXRoIGJvdW5kZWQgY29uY3VycmVuY3kgYW5kIG5vIGNhcCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlcG9Db3VudCA9IDI1O1xuXHRcdGNvbnN0IHdvcmtpbmdEaXJlY3RvcmllcyA9IEFycmF5LmZyb20oeyBsZW5ndGg6IHJlcG9Db3VudCB9LCAoXywgaSkgPT4gYGZpbGU6Ly8vcmVwbyR7aX1gKTtcblx0XHRjb25zdCBkaWZmQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0bGV0IGFjdGl2ZSA9IDA7XG5cdFx0bGV0IG1heEFjdGl2ZSA9IDA7XG5cdFx0Y29uc3QgcGVuZGluZzogQXJyYXk8KCkgPT4gdm9pZD4gPSBbXTtcblx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdGdpdC5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdkID0+IFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHQvLyBFYWNoIGRpZmYgcGFya3Mgb24gaXRzIG93biBnYXRlIHNvIHdlIGNhbiBvYnNlcnZlIGhvdyBtYW55IHJ1biBhdCBvbmNlLlxuXHRcdGdpdC5jb21wdXRlRmlsZURpZmZzQmV0d2VlblJlZnMgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRkaWZmQ2FsbHMucHVzaCh3ZC50b1N0cmluZygpKTtcblx0XHRcdGFjdGl2ZSsrO1xuXHRcdFx0bWF4QWN0aXZlID0gTWF0aC5tYXgobWF4QWN0aXZlLCBhY3RpdmUpO1xuXHRcdFx0YXdhaXQgbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBwZW5kaW5nLnB1c2goKCkgPT4geyBhY3RpdmUtLTsgcmVzb2x2ZSgpOyB9KSk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fTtcblx0XHRjb25zdCBjaGVja3BvaW50ID0gbWFrZUNoZWNrcG9pbnQocm9vdCA9PiAoeyBwYXJlbnQ6IGAke3Jvb3R9fnBgLCBjdXJyZW50OiBgJHtyb290fX5jYCB9KSk7XG5cdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXMsIGdpdCwgY2hlY2twb2ludCwgbG9nIH0pO1xuXG5cdFx0Y29uc3QgdHVyblByb21pc2UgPSBzdmMuY29tcHV0ZVR1cm5DaGFuZ2VzZXQoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXG5cdFx0Ly8gV2l0aCBldmVyeSBkaWZmIGdhdGVkLCBvbmx5IHRoZSBjb25jdXJyZW5jeSBsaW1pdCBzdGFydCBhdCBvbmNlOyB0aGVcblx0XHQvLyByZXN0IHN0YXkgcXVldWVkIGluIHRoZSBsaW1pdGVyICh0aGV5IGFyZSBub3QgZHJvcHBlZCkuXG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCA1MDAgJiYgZGlmZkNhbGxzLmxlbmd0aCA8IDU7IGkrKykge1xuXHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHR9XG5cdFx0YXdhaXQgdGltZW91dCgxMCk7IC8vIGdpdmUgYSAod3JvbmdseSkgdW5ib3VuZGVkIDZ0aCBkaWZmIGEgY2hhbmNlIHRvIHN0YXJ0XG5cdFx0Y29uc3QgZGlzcGF0Y2hlZFdoaWxlR2F0ZWQgPSBkaWZmQ2FsbHMubGVuZ3RoO1xuXG5cdFx0Ly8gUmVsZWFzZSB0aGUgZ2F0ZWQgZGlmZnMgb25lIGF0IGEgdGltZSwgeWllbGRpbmcgc28gdGhlIGxpbWl0ZXIgc3RhcnRzXG5cdFx0Ly8gdGhlIG5leHQgcXVldWVkIGRpZmYsIHVudGlsIHRoZSB3aG9sZSB0dXJuIGNvbXB1dGUgc2V0dGxlcy5cblx0XHRsZXQgc2V0dGxlZCA9IGZhbHNlO1xuXHRcdHZvaWQgdHVyblByb21pc2UudGhlbigoKSA9PiB7IHNldHRsZWQgPSB0cnVlOyB9KTtcblx0XHR3aGlsZSAoIXNldHRsZWQpIHtcblx0XHRcdHBlbmRpbmcuc2hpZnQoKT8uKCk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdH1cblx0XHRjb25zdCB0dXJuVXJpID0gYXdhaXQgdHVyblByb21pc2U7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRpc3BhdGNoZWRXaGlsZUdhdGVkLFxuXHRcdFx0bWF4QWN0aXZlLFxuXHRcdFx0dG90YWxEaWZmZWQ6IGRpZmZDYWxscy5sZW5ndGgsXG5cdFx0XHR3YXJuZWRBYm91dENhcHBpbmc6IGxvZy53YXJuaW5ncy5zb21lKHcgPT4gdy5pbmNsdWRlcygnY2FwcGluZycpKSxcblx0XHRcdHN0YXR1czogc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKHR1cm5VcmkpPy5zdGF0dXMsXG5cdFx0fSwge1xuXHRcdFx0ZGlzcGF0Y2hlZFdoaWxlR2F0ZWQ6IDUsXG5cdFx0XHRtYXhBY3RpdmU6IDUsXG5cdFx0XHR0b3RhbERpZmZlZDogcmVwb0NvdW50LFxuXHRcdFx0d2FybmVkQWJvdXRDYXBwaW5nOiBmYWxzZSxcblx0XHRcdHN0YXR1czogQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzaW5nbGUtZm9sZGVyIGNoZWNrcG9pbnQgcGF0aCBpcyBieXRlLWZvci1ieXRlIHVuY2hhbmdlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBjaGVja3BvaW50Q2FsbHM6IEFycmF5PHsgdHVybklkOiBzdHJpbmc7IHdvcmtpbmdEaXJlY3Rvcnk6IHN0cmluZyB8IHVuZGVmaW5lZCB9PiA9IFtdO1xuXHRcdGNvbnN0IGNoZWNrcG9pbnQ6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSA9IHtcblx0XHRcdC4uLk5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLFxuXHRcdFx0Z2V0VHVybkNoZWNrcG9pbnRQYWlyOiBhc3luYyAoX3Nlc3Npb246IFVSSSwgdHVybklkOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkkpID0+IHtcblx0XHRcdFx0Y2hlY2twb2ludENhbGxzLnB1c2goeyB0dXJuSWQsIHdvcmtpbmdEaXJlY3Rvcnk6IHdvcmtpbmdEaXJlY3Rvcnk/LnRvU3RyaW5nKCkgfSk7XG5cdFx0XHRcdHJldHVybiB7IHBhcmVudDogJ3AnLCBjdXJyZW50OiAnYycgfTtcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdGxldCByZXBvUm9vdENhbGxzID0gMDtcblx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyAoKSA9PiB7IHJlcG9Sb290Q2FsbHMrKzsgcmV0dXJuIHVuZGVmaW5lZDsgfTtcblx0XHRjb25zdCBkaWZmQ2FsbHM6IEFycmF5PHsgd2Q6IHN0cmluZzsgZnJvbVJlZjogc3RyaW5nOyB0b1JlZjogc3RyaW5nIH0+ID0gW107XG5cdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jICh3ZCwgb3B0cykgPT4geyBkaWZmQ2FsbHMucHVzaCh7IHdkOiB3ZC50b1N0cmluZygpLCBmcm9tUmVmOiBvcHRzLmZyb21SZWYsIHRvUmVmOiBvcHRzLnRvUmVmIH0pOyByZXR1cm4gW2dpdERpZmYoJy93ZC9vbmx5LnRzJyldOyB9O1xuXHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSwgZ2l0LCBjaGVja3BvaW50IH0pO1xuXG5cdFx0Y29uc3QgdHVyblVyaSA9IGF3YWl0IHN2Yy5jb21wdXRlVHVybkNoYW5nZXNldChzZXNzaW9uU3RyLCAndHVybi0xJyk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZSh0dXJuVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLlJlYWR5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlPy5maWxlcy5tYXAoZiA9PiBmLmlkKSwgW1VSSS5maWxlKCcvd2Qvb25seS50cycpLnRvU3RyaW5nKCldKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwb1Jvb3RDYWxscywgMCwgJ3NpbmdsZS1mb2xkZXIgcGF0aCBtdXN0IG5vdCByZXNvbHZlIHBlci1mb2xkZXIgcmVwb3NpdG9yaWVzJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGVja3BvaW50Q2FsbHMsIFt7IHR1cm5JZDogJ3R1cm4tMScsIHdvcmtpbmdEaXJlY3Rvcnk6IHVuZGVmaW5lZCB9XSwgJ2NoZWNrcG9pbnQgcGFpciBpcyByZXF1ZXN0ZWQgc2Vzc2lvbi13aWRlLCBub3QgcGVyLXJlcG8nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRpZmZDYWxscywgW3sgd2Q6ICdmaWxlOi8vL3dkJywgZnJvbVJlZjogJ3AnLCB0b1JlZjogJ2MnIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnc2luZ2xlLWZvbGRlciBEQiBmYWxsYmFjayBwYXRoIGlzIGJ5dGUtZm9yLWJ5dGUgdW5jaGFuZ2VkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRkYi5hZGRFZGl0KHsgdHVybklkOiAndHVybi0xJywgdG9vbENhbGxJZDogJ3RjMScsIGZpbGVQYXRoOiAnL3dkL3RyYWNrZWQudHMnLCBraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCwgYWRkZWRMaW5lczogdW5kZWZpbmVkLCByZW1vdmVkTGluZXM6IHVuZGVmaW5lZCwgYmVmb3JlQ29udGVudDogZW5jb2RlU3RyaW5nKCcxJyksIGFmdGVyQ29udGVudDogZW5jb2RlU3RyaW5nKCcxXFxuMicpIH0pO1xuXHRcdGNvbnN0IGNoZWNrcG9pbnQ6IElBZ2VudEhvc3RDaGVja3BvaW50U2VydmljZSA9IHsgLi4uTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGdldFR1cm5DaGVja3BvaW50UGFpcjogYXN5bmMgKCkgPT4gdW5kZWZpbmVkIH07XG5cdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRsZXQgcmVwb1Jvb3RDYWxscyA9IDA7XG5cdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgKCkgPT4geyByZXBvUm9vdENhbGxzKys7IHJldHVybiB1bmRlZmluZWQ7IH07XG5cdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy93ZCddLCBnaXQsIGNoZWNrcG9pbnQsIGRiIH0pO1xuXG5cdFx0Y29uc3QgdHVyblVyaSA9IGF3YWl0IHN2Yy5jb21wdXRlVHVybkNoYW5nZXNldChzZXNzaW9uU3RyLCAndHVybi0xJyk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZSh0dXJuVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGU/LnN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLlJlYWR5KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlPy5maWxlcy5tYXAoZiA9PiBmLmlkKSwgW1VSSS5maWxlKCcvd2QvdHJhY2tlZC50cycpLnRvU3RyaW5nKCldLCAnZmFsbGJhY2sgcmV0dXJucyBhbGwgb2YgdGhlIHR1cm4gZWRpdHMsIGV4YWN0bHkgYXMgdG9kYXknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVwb1Jvb3RDYWxscywgMCwgJ3NpbmdsZS1mb2xkZXIgZmFsbGJhY2sgbXVzdCBub3QgcmVzb2x2ZSByZXBvc2l0b3JpZXMnKTtcblx0fSk7XG5cblx0LyoqXG5cdCAqIEFsbC1mb2xkZXIgYnJhbmNoIHN1bW1hcnkgKEFDLTMpLiBJbiBhIG11bHRpLWZvbGRlciBzZXNzaW9uIHRoZVxuXHQgKiBgc3VtbWFyeS5jaGFuZ2VzYCBjaGlwIG11c3QgcmVmbGVjdCBFVkVSWSBmb2xkZXIncyBicmFuY2ggZGVsdGEsIGNvbXB1dGVkXG5cdCAqIGluZGVwZW5kZW50bHkgb2YgdGhlIHByaW1hcnktb25seSBicmFuY2ggY2hhbmdlc2V0LCBhbmQgbXVzdCBzdXJ2aXZlIGFcblx0ICogc3Vic2VxdWVudCBicmFuY2ggcmVjb21wdXRlLiBTaW5nbGUtZm9sZGVyIHNlc3Npb25zIHN0YXkgYnJhbmNoLWRlcml2ZWRcblx0ICogKGJ5dGUtZm9yLWJ5dGUgdW5jaGFuZ2VkKS5cblx0ICovXG5cdHN1aXRlKCdhbGwtZm9sZGVyIGJyYW5jaCBzdW1tYXJ5JywgKCkgPT4ge1xuXG5cdFx0LyoqIFBvbGxzIHVudGlsIHRoZSBsaXZlIHNlc3Npb24gc3VtbWFyeSBjYXJyaWVzIGEgYGNoYW5nZXNgIGFnZ3JlZ2F0ZS4gKi9cblx0XHRhc3luYyBmdW5jdGlvbiB3YWl0Rm9yU3VtbWFyeUNoYW5nZXMoc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIpOiBQcm9taXNlPENoYW5nZXNTdW1tYXJ5IHwgdW5kZWZpbmVkPiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMDsgaSsrKSB7XG5cdFx0XHRcdGNvbnN0IGNoYW5nZXMgPSBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cik/LmNoYW5nZXM7XG5cdFx0XHRcdGlmIChjaGFuZ2VzKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNoYW5nZXM7XG5cdFx0XHRcdH1cblx0XHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cik/LmNoYW5nZXM7XG5cdFx0fVxuXG5cdFx0LyoqIFBvbGxzIHVudGlsIGBjb3VudCgpYCByZWFjaGVzIChhdCBsZWFzdCkgYHRhcmdldGAuICovXG5cdFx0YXN5bmMgZnVuY3Rpb24gd2FpdEZvckNvdW50KGNvdW50OiAoKSA9PiBudW1iZXIsIHRhcmdldDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDUwMCAmJiBjb3VudCgpIDwgdGFyZ2V0OyBpKyspIHtcblx0XHRcdFx0YXdhaXQgdGltZW91dCgxKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHR0ZXN0KCdzdW1zIGV2ZXJ5IHJlcG9zaXRvcnkgYnJhbmNoIGRpZmYsIG5vdCBqdXN0IHRoZSBwcmltYXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdC5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdkID0+IFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHRcdGdpdC5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyA9IGFzeW5jIHdkID0+IHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IHdkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChyb290ID09PSAnZmlsZTovLy9yZXBvQScpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0EvYS50cycsIDMsIDEpXTsgfVxuXHRcdFx0XHRpZiAocm9vdCA9PT0gJ2ZpbGU6Ly8vcmVwb0InKSB7IHJldHVybiBbZ2l0RGlmZignL3JlcG9CL2IudHMnLCA1LCAyKSwgZ2l0RGlmZignL3JlcG9CL2MudHMnLCAxLCAwKV07IH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCB7IHN2Yywgc3RhdGVNYW5hZ2VyIH0gPSBidWlsZCh7IHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG9BJywgJ2ZpbGU6Ly8vcmVwb0InXSwgZ2l0LCBjaGVja3BvaW50OiBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGIgfSk7XG5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHQvLyByZXBvQSA9PiAxIGZpbGUgLyArMyAvIC0xOyByZXBvQiA9PiAyIGZpbGVzIC8gKzYgLyAtMi5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY2hhbmdlcywgeyBhZGRpdGlvbnM6IDksIGRlbGV0aW9uczogMywgZmlsZXM6IDMgfSwgJ3RoZSBjaGlwIGNvdW50cyBldmVyeSBmb2xkZXIsIG5vdCBvbmx5IHRoZSBwcmltYXJ5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRKU09OLnBhcnNlKChhd2FpdCBkYi5nZXRNZXRhZGF0YShNRVRBX0NIQU5HRVNfU1VNTUFSWSkpISksXG5cdFx0XHRcdHsgYWRkaXRpb25zOiA5LCBkZWxldGlvbnM6IDMsIGZpbGVzOiAzIH0sXG5cdFx0XHRcdCd0aGUgcGVyc2lzdGVkIE1FVEFfQ0hBTkdFU19TVU1NQVJZIGNhcnJpZXMgdGhlIGFsbC1mb2xkZXIgYWdncmVnYXRlIGZvciB0aGUgaW5hY3RpdmUtbGlzdCBwYXRoJyxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGwtZm9sZGVyIHN1bW1hcnkgc3Vydml2ZXMgYSBzdWJzZXF1ZW50IGJyYW5jaCByZWNvbXB1dGUsIHJldXNpbmcgdGhlIHByaW1hcnkgZGlmZiAobm90IGNsb2JiZXJlZCwgbm90IHJlLWRpZmZlZCknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiBVUkkucGFyc2Uod2QudG9TdHJpbmcoKSk7XG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2god2QudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGNvbnN0IHJvb3QgPSB3ZC50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAocm9vdCA9PT0gJ2ZpbGU6Ly8vcmVwb0EnKSB7IHJldHVybiBbZ2l0RGlmZignL3JlcG9BL2EudHMnLCAxLCAwKV07IH1cblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9CJykgeyByZXR1cm4gW2dpdERpZmYoJy9yZXBvQi9iLnRzJywgMSwgMCldOyB9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludDogTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UgfSk7XG5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgZmlyc3QgPSBhd2FpdCB3YWl0Rm9yU3VtbWFyeUNoYW5nZXMoc3RhdGVNYW5hZ2VyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyc3QsIHsgYWRkaXRpb25zOiAyLCBkZWxldGlvbnM6IDAsIGZpbGVzOiAyIH0sICdmaXJzdCByZWNvbXB1dGUgeWllbGRzIHRoZSBhbGwtZm9sZGVyIGFnZ3JlZ2F0ZScpO1xuXG5cdFx0XHQvLyBGNzogdGhlIHByaW1hcnkgcmVwbydzIGJyYW5jaCBkaWZmIGlzIFJFVVNFRCBieSB0aGUgc3VtbWFyeSwgc28gZWFjaFxuXHRcdFx0Ly8gYnJhbmNoIHJlY29tcHV0ZSBpc3N1ZXMgZXhhY3RseSAyIGBjb21wdXRlU2Vzc2lvbkZpbGVEaWZmc2AgY2FsbHMgZm9yXG5cdFx0XHQvLyBhIDItcmVwbyBzZXNzaW9uIChwcmltYXJ5IG9uY2UgZm9yIHRoZSBicmFuY2ggY2hhbmdlc2V0ICsgc2Vjb25kYXJ5XG5cdFx0XHQvLyBvbmNlIGZvciB0aGUgY2hpcCksIG5vdCAzLiBEcmFpbiB0aGUgc2Vjb25kIHJlY29tcHV0ZSwgdGhlbiBhbGxvdyBhXG5cdFx0XHQvLyBiZWF0IGZvciBhbnkgKHVud2FudGVkKSBleHRyYSBkaWZmIHRvIHN1cmZhY2UuXG5cdFx0XHRjb25zdCBjYWxsc0FmdGVyRmlyc3QgPSBjYWxscy5sZW5ndGg7XG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JDb3VudCgoKSA9PiBjYWxscy5sZW5ndGgsIGNhbGxzQWZ0ZXJGaXJzdCArIDIpO1xuXHRcdFx0YXdhaXQgdGltZW91dCgxMCk7XG5cblx0XHRcdGNvbnN0IHNlY29uZFJlY29tcHV0ZSA9IGNhbGxzLnNsaWNlKGNhbGxzQWZ0ZXJGaXJzdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2Vjb25kUmVjb21wdXRlLmZpbHRlcihjID0+IGMgPT09ICdmaWxlOi8vL3JlcG9BJykubGVuZ3RoLCAxLCAndGhlIHByaW1hcnkgcmVwbyBpcyBkaWZmZWQgZXhhY3RseSBvbmNlIHBlciByZWNvbXB1dGUgKHJldXNlZCBieSB0aGUgc3VtbWFyeSwgbm90IHJlLWRpZmZlZCknKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZWNvbmRSZWNvbXB1dGUubGVuZ3RoLCAyLCAnYSAyLXJlcG8gc2Vzc2lvbiBpc3N1ZXMgMiBkaWZmcyBwZXIgYnJhbmNoIHJlY29tcHV0ZSwgbm90IDMnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0c3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25TdHIpPy5jaGFuZ2VzLFxuXHRcdFx0XHR7IGFkZGl0aW9uczogMiwgZGVsZXRpb25zOiAwLCBmaWxlczogMiB9LFxuXHRcdFx0XHQnYnJhbmNoIHJlY29tcHV0ZSBtdXN0IG5vdCBjbG9iYmVyIHRoZSBhbGwtZm9sZGVyIGFnZ3JlZ2F0ZSBiYWNrIHRvIHRoZSBwcmltYXJ5LW9ubHkgY291bnQnLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbC1mb2xkZXIgY2hpcCBzdXJ2aXZlcyBpZGxlIGV2aWN0aW9uIChldmljdGVkLWJ1dC13YXJtKTogbm90IGNsb2JiZXJlZCB0byBwcmltYXJ5LW9ubHknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Z2l0LmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzID0gYXN5bmMgd2QgPT4ge1xuXHRcdFx0XHRjb25zdCByb290ID0gd2QudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9BJykgeyByZXR1cm4gW2dpdERpZmYoJy9yZXBvQS9hLnRzJywgMywgMSldOyB9XG5cdFx0XHRcdGlmIChyb290ID09PSAnZmlsZTovLy9yZXBvQicpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0IvYi50cycsIDUsIDIpXTsgfVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwb0EnLCAnZmlsZTovLy9yZXBvQiddLCBnaXQsIGNoZWNrcG9pbnQ6IE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLCBkYiB9KTtcblxuXHRcdFx0Ly8gV2FybSB0aGUgc2Vzc2lvbjogcGVyc2lzdCB0aGUgYWxsLWZvbGRlciBzdW1tYXJ5IGFuZCBtYWtlIHRoZSBicmFuY2hcblx0XHRcdC8vICsgc2Vzc2lvbiBjaGFuZ2VzZXRzIFJlYWR5IChpZGxlIGV2aWN0aW9uIGtlZXBzIGNoYW5nZXNldHMgY2FjaGVkKS5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0c3ZjLnJlZnJlc2hTZXNzaW9uQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3Qgd2FybSA9IGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh3YXJtLCB7IGFkZGl0aW9uczogOCwgZGVsZXRpb25zOiAzLCBmaWxlczogMiB9LCAnYWxsLWZvbGRlciBjaGlwIHdoaWxlIHRoZSBzZXNzaW9uIGlzIHdhcm0nKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JDb3VudCgoKSA9PiBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpKHNlc3Npb25TdHIpKT8uc3RhdHVzID09PSBDaGFuZ2VzZXRTdGF0dXMuUmVhZHkgPyAxIDogMCwgMSk7XG5cdFx0XHRjb25zdCBwZXJzaXN0ZWRTdW1tYXJ5ID0gKGF3YWl0IGRiLmdldE1ldGFkYXRhKE1FVEFfQ0hBTkdFU19TVU1NQVJZKSkhO1xuXG5cdFx0XHQvLyBJZGxlIGV2aWN0aW9uOiBkcm9wcyB0aGUgbGl2ZSBzdW1tYXJ5IGJ1dCBLRUVQUyB0aGUgY2hhbmdlc2V0cyBjYWNoZWQuXG5cdFx0XHRzdGF0ZU1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uU3RyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvblN0cik/LmNoYW5nZXMsIHVuZGVmaW5lZCwgJ2xpdmUgc3VtbWFyeSBpcyBnb25lIGFmdGVyIGV2aWN0aW9uJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVNYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uU3RyKSk/LnN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLlJlYWR5LCAnc2Vzc2lvbiBjaGFuZ2VzZXQgc3RheXMgY2FjaGVkIGFmdGVyIGV2aWN0aW9uIChMUlUga2VlcHMgdGhlIG9uLXNjcmVlbiBjaGlwKScpO1xuXG5cdFx0XHQvLyBUaGUgbGlzdCBvdmVybGF5IG11c3Qgc3RpbGwgcmVxdWVzdCB0aGUgcGVyc2lzdGVkIHN1bW1hcnkga2V5IFx1MjAxNCBiZWZvcmVcblx0XHRcdC8vIHRoZSBmaXggaXQgcmV0dXJuZWQgdW5kZWZpbmVkIGhlcmUgKHNlc3Npb24gY2hhbmdlc2V0IFJlYWR5KSwgc2tpcHBpbmdcblx0XHRcdC8vIE1FVEFfQ0hBTkdFU19TVU1NQVJZIGFuZCBmYWxsaW5nIGJhY2sgdG8gdGhlIHByaW1hcnktb25seSBicmFuY2ggY291bnQuXG5cdFx0XHRjb25zdCBrZXlzID0gc3ZjLmdldExpc3RNZXRhZGF0YUtleXMoc2Vzc2lvblN0cik7XG5cdFx0XHRhc3NlcnQub2soa2V5cyAmJiBrZXlzW01FVEFfQ0hBTkdFU19TVU1NQVJZXSwgYGdldExpc3RNZXRhZGF0YUtleXMgbXVzdCByZXF1ZXN0IHRoZSBwZXJzaXN0ZWQgc3VtbWFyeSBwb3N0LWV2aWN0aW9uLCBnb3QgJHtKU09OLnN0cmluZ2lmeShrZXlzKX1gKTtcblxuXHRcdFx0Ly8gLi4uIGFuZCBwcmVmZXIgaXQgKGFsbC1mb2xkZXIpLCBuZXZlciBkZXJpdmluZytwZXJzaXN0aW5nIHRoZVxuXHRcdFx0Ly8gcHJpbWFyeS1vbmx5IGJyYW5jaCBjb3VudCAocmVwb0Etb25seSB3b3VsZCBiZSAzLzEvMSkuXG5cdFx0XHRjb25zdCBvdmVybGF5ID0gc3ZjLmNvbXB1dGVMaXN0RW50cnlDaGFuZ2VzKHNlc3Npb25TdHIsIHsgW01FVEFfQ0hBTkdFU19TVU1NQVJZXTogcGVyc2lzdGVkU3VtbWFyeSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3ZlcmxheSwgeyBhZGRpdGlvbnM6IDgsIGRlbGV0aW9uczogMywgZmlsZXM6IDIgfSwgJ2V2aWN0ZWQgY2hpcCBzdGF5cyBhbGwtZm9sZGVyLCBub3QgcHJpbWFyeS1vbmx5Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKEpTT04ucGFyc2UoKGF3YWl0IGRiLmdldE1ldGFkYXRhKE1FVEFfQ0hBTkdFU19TVU1NQVJZKSkhKSwgeyBhZGRpdGlvbnM6IDgsIGRlbGV0aW9uczogMywgZmlsZXM6IDIgfSwgJ3BlcnNpc3RlZCBhbGwtZm9sZGVyIHN1bW1hcnkgaXMgbm90IGNsb2JiZXJlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbXVsdGktZm9sZGVyIGJyYW5jaCBjaGFuZ2VzZXQgREFUQSBzdGF5cyBwcmltYXJ5LW9ubHkgKEFDLTggZGF0YSBmZW5jZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Z2l0LmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzID0gYXN5bmMgd2QgPT4ge1xuXHRcdFx0XHRjb25zdCByb290ID0gd2QudG9TdHJpbmcoKTtcblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9BJykgeyByZXR1cm4gW2dpdERpZmYoJy9yZXBvQS9hLnRzJywgMSwgMCldOyB9XG5cdFx0XHRcdGlmIChyb290ID09PSAnZmlsZTovLy9yZXBvQicpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0IvYi50cycsIDEsIDApXTsgfVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fTtcblx0XHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwb0EnLCAnZmlsZTovLy9yZXBvQiddLCBnaXQsIGNoZWNrcG9pbnQ6IE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFIH0pO1xuXG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHQvLyBUaGUgY2hpcCBhZ2dyZWdhdGVzIEFMTCBmb2xkZXJzLCBidXQgdGhlIGJyYW5jaCBDSEFOR0VTRVQgZGF0YSBpdHNlbGZcblx0XHRcdC8vIG11c3QgcmVtYWluIHByaW1hcnktb25seSBcdTIwMTQgQUMtODogb25seSB0aGUgdHVybiBjaGFuZ2VzZXQgYW5kIHRoZSBjaGlwXG5cdFx0XHQvLyBjaGFuZ2UgaW4gbXVsdGktZm9sZGVyIHNlc3Npb25zOyBicmFuY2gvc2Vzc2lvbi91bmNvbW1pdHRlZC9jb21wYXJlXG5cdFx0XHQvLyBkYXRhIGlzIHVudG91Y2hlZC5cblx0XHRcdGNvbnN0IGJyYW5jaCA9IHN0YXRlTWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uU3RyKSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGJyYW5jaD8uZmlsZXMubWFwKGYgPT4gZi5pZCksIFtVUkkuZmlsZSgnL3JlcG9BL2EudHMnKS50b1N0cmluZygpXSwgJ2JyYW5jaCBjaGFuZ2VzZXQgZGF0YSBzdGF5cyBwcmltYXJ5LW9ubHkgaW4gYSBtdWx0aS1yb290IHNlc3Npb24nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZS1mb2xkZXIgc3VtbWFyeSBzdGF5cyBicmFuY2gtZGVyaXZlZCAoY2hhcmFjdGVyaXphdGlvbjogYnl0ZS1mb3ItYnl0ZSB1bmNoYW5nZWQpJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdC5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdkID0+IFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHRcdGdpdC5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyA9IGFzeW5jICgpID0+IFtnaXREaWZmKCcvd2Qvb25seS50cycsIDQsIDIpXTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vd2QnXSwgZ2l0LCBjaGVja3BvaW50OiBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGIgfSk7XG5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHQvLyBUaGUgc2luZ2xlIHByaW1hcnkgYnJhbmNoIGRpZmYgSVMgdGhlIHdob2xlIHNlc3Npb24gZm9vdHByaW50LCBleGFjdGx5IGFzIHRvZGF5LlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCB7IGFkZGl0aW9uczogNCwgZGVsZXRpb25zOiAyLCBmaWxlczogMSB9KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdEpTT04ucGFyc2UoKGF3YWl0IGRiLmdldE1ldGFkYXRhKE1FVEFfQ0hBTkdFU19TVU1NQVJZKSkhKSxcblx0XHRcdFx0eyBhZGRpdGlvbnM6IDQsIGRlbGV0aW9uczogMiwgZmlsZXM6IDEgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHJlcG9zaXRvcnkgd2hvc2UgYnJhbmNoIGRpZmYgdGhyb3dzIGlzIHNraXBwZWQgYW5kIGxvZ2dlZCwgd2l0aG91dCBmYWlsaW5nIHRoZSBhZ2dyZWdhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdC5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdkID0+IFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHRcdGdpdC5jb21wdXRlU2Vzc2lvbkZpbGVEaWZmcyA9IGFzeW5jIHdkID0+IHtcblx0XHRcdFx0Y29uc3Qgcm9vdCA9IHdkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChyb290ID09PSAnZmlsZTovLy9yZXBvQmFkJykgeyB0aHJvdyBuZXcgRXJyb3IoJ2JyYW5jaCBkaWZmIGV4cGxvZGVkJyk7IH1cblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9Hb29kMScpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0dvb2QxL2EudHMnLCAyLCAwKV07IH1cblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9Hb29kMicpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0dvb2QyL2IudHMnLCA1LCAxKV07IH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cdFx0XHRjb25zdCB7IHN2Yywgc3RhdGVNYW5hZ2VyIH0gPSBidWlsZCh7IHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG9Hb29kMScsICdmaWxlOi8vL3JlcG9CYWQnLCAnZmlsZTovLy9yZXBvR29vZDInXSwgZ2l0LCBjaGVja3BvaW50OiBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgbG9nIH0pO1xuXG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCB3YWl0Rm9yU3VtbWFyeUNoYW5nZXMoc3RhdGVNYW5hZ2VyKTtcblxuXHRcdFx0Ly8gcmVwb0JhZCBpcyBza2lwcGVkOyB0aGUgYWdncmVnYXRlIGlzIHRoZSBzdW0gb2YgdGhlIHR3byBnb29kIHJlcG9zLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCB7IGFkZGl0aW9uczogNywgZGVsZXRpb25zOiAxLCBmaWxlczogMiB9LCAndGhlIGZhaWxpbmcgcmVwb3NpdG9yeSBpcyBleGNsdWRlZCwgdGhlIHJlc3Qgc3RpbGwgY291bnRlZCcpO1xuXHRcdFx0YXNzZXJ0Lm9rKGxvZy5lcnJvcnMuc29tZShlID0+IGUuaW5jbHVkZXMoJ3JlcG9CYWQnKSksIGBleHBlY3RlZCBhbiBlcnJvciBuYW1pbmcgdGhlIGZhaWxpbmcgcmVwb3NpdG9yeSwgZ290ICR7SlNPTi5zdHJpbmdpZnkobG9nLmVycm9ycyl9YCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0aHJlYWRzIGEgYmFzZSBicmFuY2ggcGVyIHJlcG9zaXRvcnkgKHByaW1hcnkgdXNlcyB0aGUgc2Vzc2lvbiBiYXNlLCBzZWNvbmRhcmllcyB0aGVpciBkZWZhdWx0KScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGNhbGxzOiB7IHdkOiBzdHJpbmc7IGJhc2VCcmFuY2g6IHN0cmluZyB8IHVuZGVmaW5lZCB9W10gPSBbXTtcblx0XHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiBVUkkucGFyc2Uod2QudG9TdHJpbmcoKSk7XG5cdFx0XHRnaXQuZ2V0RGVmYXVsdEJyYW5jaCA9IGFzeW5jIHdkID0+IHdkLnRvU3RyaW5nKCkgPT09ICdmaWxlOi8vL3JlcG9CJyA/IHsgbmFtZTogJ2RldmVsb3AnLCBzdGFydFBvaW50OiAnb3JpZ2luL2RldmVsb3AnIH0gOiB1bmRlZmluZWQ7XG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyAod2QsIG9wdHMpID0+IHtcblx0XHRcdFx0Y2FsbHMucHVzaCh7IHdkOiB3ZC50b1N0cmluZygpLCBiYXNlQnJhbmNoOiBvcHRzLmJhc2VCcmFuY2ggfSk7XG5cdFx0XHRcdHJldHVybiB3ZC50b1N0cmluZygpID09PSAnZmlsZTovLy9yZXBvQScgPyBbZ2l0RGlmZignL3JlcG9BL2EudHMnLCAxLCAwKV0gOiBbZ2l0RGlmZignL3JlcG9CL2IudHMnLCAxLCAwKV07XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludDogTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRiIH0pO1xuXHRcdFx0Ly8gVGhlIHNlc3Npb24ncyBjb25maWd1cmVkIGJhc2UgYnJhbmNoIGFwcGxpZXMgdG8gdGhlIFBSSU1BUlkgcmVwbyBvbmx5LlxuXHRcdFx0c3RhdGVNYW5hZ2VyLnNldFNlc3Npb25NZXRhKHNlc3Npb25TdHIsIHdpdGhTZXNzaW9uR2l0U3RhdGUodW5kZWZpbmVkLCB7IGJhc2VCcmFuY2hOYW1lOiAnbWFpbicgfSkpO1xuXG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHRjb25zdCByZXBvQSA9IGNhbGxzLmZpbHRlcihjID0+IGMud2QgPT09ICdmaWxlOi8vL3JlcG9BJyk7XG5cdFx0XHRjb25zdCByZXBvQiA9IGNhbGxzLmZpbHRlcihjID0+IGMud2QgPT09ICdmaWxlOi8vL3JlcG9CJyk7XG5cdFx0XHRhc3NlcnQub2socmVwb0EubGVuZ3RoID4gMCAmJiByZXBvQS5ldmVyeShjID0+IGMuYmFzZUJyYW5jaCA9PT0gJ21haW4nKSwgYHByaW1hcnkgcmVwbyBtdXN0IHVzZSB0aGUgc2Vzc2lvbiBiYXNlIGJyYW5jaCwgZ290ICR7SlNPTi5zdHJpbmdpZnkocmVwb0EpfWApO1xuXHRcdFx0YXNzZXJ0Lm9rKHJlcG9CLmxlbmd0aCA+IDAgJiYgcmVwb0IuZXZlcnkoYyA9PiBjLmJhc2VCcmFuY2ggPT09ICdkZXZlbG9wJyksIGBzZWNvbmRhcnkgcmVwbyBtdXN0IHVzZSBpdHMgb3duIGRlZmF1bHQgYnJhbmNoIChub3QgSEVBRCksIGdvdCAke0pTT04uc3RyaW5naWZ5KHJlcG9CKX1gKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FsbC1mb2xkZXIgc3VtbWFyeSBpcyBjb21wdXRlZCBldmVuIHdoZW4gdGhlIHByaW1hcnkgYnJhbmNoIGRpZmYgaXMgdW5hdmFpbGFibGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gVGhlIFBSSU1BUlkgcmVwbyAocmVwb0EpIGhhcyBubyByZXNvbHZhYmxlIGJyYW5jaCBkaWZmOyByZXBvQiBkb2VzLlxuXHRcdFx0Z2l0LmNvbXB1dGVTZXNzaW9uRmlsZURpZmZzID0gYXN5bmMgd2QgPT4gd2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0InID8gW2dpdERpZmYoJy9yZXBvQi9iLnRzJywgNCwgMSldIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludDogTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRiIH0pO1xuXG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGNvbnN0IGNoYW5nZXMgPSBhd2FpdCB3YWl0Rm9yU3VtbWFyeUNoYW5nZXMoc3RhdGVNYW5hZ2VyKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjaGFuZ2VzLCB7IGFkZGl0aW9uczogNCwgZGVsZXRpb25zOiAxLCBmaWxlczogMSB9LCAndGhlIGFsbC1mb2xkZXIgY2hpcCBpcyBpbmRlcGVuZGVudCBvZiB0aGUgcHJpbWFyeSBicmFuY2ggY2hhbmdlc2V0IHN1Y2NlZWRpbmcnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZvbGRzIG5vbi1naXQgZm9sZGVyIGVkaXRzIGludG8gdGhlIGFsbC1mb2xkZXIgY2hpcCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdC8vIGZvbGRlckEgaXMgbm90IGdpdC1iYWNrZWQ7IGl0cyBlZGl0cyBhcmUgdHJhY2tlZCBvbmx5IGluIHRoZSBEQi5cblx0XHRcdGRiLmFkZEVkaXQoeyB0dXJuSWQ6ICd0dXJuLTEnLCB0b29sQ2FsbElkOiAndGNBJywgZmlsZVBhdGg6ICcvZm9sZGVyQS94LnR4dCcsIGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LCBhZGRlZExpbmVzOiB1bmRlZmluZWQsIHJlbW92ZWRMaW5lczogdW5kZWZpbmVkLCBiZWZvcmVDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2EnKSwgYWZ0ZXJDb250ZW50OiBlbmNvZGVTdHJpbmcoJ2FcXG5iJykgfSk7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gd2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0InID8gVVJJLnBhcnNlKCdmaWxlOi8vL3JlcG9CJykgOiB1bmRlZmluZWQ7XG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyB3ZCA9PiB3ZC50b1N0cmluZygpID09PSAnZmlsZTovLy9yZXBvQicgPyBbZ2l0RGlmZignL3JlcG9CL3kudHh0JywgNSwgMildIDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9mb2xkZXJBJywgJ2ZpbGU6Ly8vcmVwb0InXSwgZ2l0LCBjaGVja3BvaW50OiBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGIgfSk7XG5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHQvLyByZXBvQiBnaXQgYnJhbmNoIGRpZmYgPT4gMSBmaWxlIC8gKzUgLyAtMjsgZm9sZGVyQSBEQiBlZGl0ID0+IDEgZmlsZSAvICsxIC8gLTAuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIHsgYWRkaXRpb25zOiA2LCBkZWxldGlvbnM6IDIsIGZpbGVzOiAyIH0sICdub24tZ2l0IGZvbGRlciBEQiBlZGl0cyBjb3VudCB0b3dhcmQgdGhlIGNoaXAgYWxvbmdzaWRlIGdpdCByZXBvcycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndG90YWwgZ2l0IGZhaWx1cmUgcHJlc2VydmVzIHRoZSBjYWNoZWQgYWxsLWZvbGRlciBzdW1tYXJ5IChub3QgY2xvYmJlcmVkIHRvIHplcm8pJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bGV0IGF2YWlsYWJsZSA9IHRydWU7XG5cdFx0XHRjb25zdCBjYWxsczogc3RyaW5nW10gPSBbXTtcblx0XHRcdGNvbnN0IGdpdCA9IGNyZWF0ZU5vb3BHaXRTZXJ2aWNlKCk7XG5cdFx0XHRnaXQuZ2V0UmVwb3NpdG9yeVJvb3QgPSBhc3luYyB3ZCA9PiBVUkkucGFyc2Uod2QudG9TdHJpbmcoKSk7XG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRcdGNhbGxzLnB1c2god2QudG9TdHJpbmcoKSk7XG5cdFx0XHRcdGlmICghYXZhaWxhYmxlKSB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0XHRcdFx0Y29uc3Qgcm9vdCA9IHdkLnRvU3RyaW5nKCk7XG5cdFx0XHRcdGlmIChyb290ID09PSAnZmlsZTovLy9yZXBvQScpIHsgcmV0dXJuIFtnaXREaWZmKCcvcmVwb0EvYS50cycsIDMsIDEpXTsgfVxuXHRcdFx0XHRpZiAocm9vdCA9PT0gJ2ZpbGU6Ly8vcmVwb0InKSB7IHJldHVybiBbZ2l0RGlmZignL3JlcG9CL2IudHMnLCA1LCAyKV07IH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBkYiA9IG5ldyBUZXN0U2Vzc2lvbkRhdGFiYXNlKCk7XG5cdFx0XHRjb25zdCB7IHN2Yywgc3RhdGVNYW5hZ2VyIH0gPSBidWlsZCh7IHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG9BJywgJ2ZpbGU6Ly8vcmVwb0InXSwgZ2l0LCBjaGVja3BvaW50OiBOVUxMX0NIRUNLUE9JTlRfU0VSVklDRSwgZGIgfSk7XG5cblx0XHRcdC8vIFdhcm0gdGhlIHN1bW1hcnkgdG8gUmVhZHkgd2l0aCBhIHJlYWwgYWxsLWZvbGRlciBhZ2dyZWdhdGUuXG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGNvbnN0IHdhcm0gPSBhd2FpdCB3YWl0Rm9yU3VtbWFyeUNoYW5nZXMoc3RhdGVNYW5hZ2VyKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwod2FybSwgeyBhZGRpdGlvbnM6IDgsIGRlbGV0aW9uczogMywgZmlsZXM6IDIgfSwgJ3dhcm0gYWxsLWZvbGRlciBhZ2dyZWdhdGUnKTtcblx0XHRcdGF3YWl0IHRpbWVvdXQoMTApO1xuXHRcdFx0Y29uc3QgY2FsbHNBZnRlcldhcm0gPSBjYWxscy5sZW5ndGg7XG5cblx0XHRcdC8vIEV2ZXJ5IHJlcG9zaXRvcnkgbm93IGZhaWxzOiByZWZyZXNoIGFuZCBsZXQgdGhlIHJlY29tcHV0ZSBzZXR0bGUuXG5cdFx0XHQvLyBPYnNlcnZlIGNvbXBsZXRpb24gdmlhIHRoZSBnaXQgY2FsbCBjb3VudCwgTk9UIHRoZSAoYWxyZWFkeS10cnV0aHkpXG5cdFx0XHQvLyBsaXZlIHN1bW1hcnksIHdoaWNoIHdvdWxkIGZhbHNlLXBvc2l0aXZlIG9uIHRoZSB3YXJtIHZhbHVlLlxuXHRcdFx0YXZhaWxhYmxlID0gZmFsc2U7XG5cdFx0XHRzdmMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uU3RyKTtcblx0XHRcdGF3YWl0IHdhaXRGb3JDb3VudCgoKSA9PiBjYWxscy5sZW5ndGgsIGNhbGxzQWZ0ZXJXYXJtICsgMSk7XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGxpdmU6IHN0YXRlTWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uU3RyKT8uY2hhbmdlcyxcblx0XHRcdFx0cGVyc2lzdGVkOiBKU09OLnBhcnNlKChhd2FpdCBkYi5nZXRNZXRhZGF0YShNRVRBX0NIQU5HRVNfU1VNTUFSWSkpISksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGxpdmU6IHsgYWRkaXRpb25zOiA4LCBkZWxldGlvbnM6IDMsIGZpbGVzOiAyIH0sXG5cdFx0XHRcdHBlcnNpc3RlZDogeyBhZGRpdGlvbnM6IDgsIGRlbGV0aW9uczogMywgZmlsZXM6IDIgfSxcblx0XHRcdH0sICd0b3RhbCBmYWlsdXJlIHByZXNlcnZlcyB0aGUgbGl2ZSBhbmQgcGVyc2lzdGVkIHN1bW1hcnkgaW5zdGVhZCBvZiBvdmVyd3JpdGluZyBpdCB3aXRoIHplcm9zJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhbGwgcmVwb3NpdG9yaWVzIHN1Y2NlZWRpbmcgd2l0aCBubyBjaGFuZ2VzIHdyaXRlcyBhIHplcm8gc3VtbWFyeSAobm8gb3Zlci1wcmVzZXJ2ZSknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Ly8gQm90aCByZXBvcyBzdWNjZWVkIHdpdGggYW4gRU1QVFkgZGlmZiAoZ2VudWluZWx5IG5vIGNoYW5nZXMpIFx1MjAxNCB0aGlzXG5cdFx0XHQvLyBpcyBhbiBhdmFpbGFibGUgc291cmNlLCBzbyB0aGUgYWdncmVnYXRlIG11c3QgYmUgd3JpdHRlbiBhcyB6ZXJvLFxuXHRcdFx0Ly8gbmV2ZXIgcHJlc2VydmVkIGFzIGlmIGl0IHdlcmUgdW5hdmFpbGFibGUuXG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyAoKSA9PiBbXTtcblx0XHRcdGNvbnN0IGRiID0gbmV3IFRlc3RTZXNzaW9uRGF0YWJhc2UoKTtcblx0XHRcdGNvbnN0IHsgc3ZjLCBzdGF0ZU1hbmFnZXIgfSA9IGJ1aWxkKHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwb0EnLCAnZmlsZTovLy9yZXBvQiddLCBnaXQsIGNoZWNrcG9pbnQ6IE5VTExfQ0hFQ0tQT0lOVF9TRVJWSUNFLCBkYiB9KTtcblxuXHRcdFx0c3ZjLnJlZnJlc2hCcmFuY2hDaGFuZ2VzZXQoc2Vzc2lvblN0cik7XG5cdFx0XHRjb25zdCBjaGFuZ2VzID0gYXdhaXQgd2FpdEZvclN1bW1hcnlDaGFuZ2VzKHN0YXRlTWFuYWdlcik7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRsaXZlOiBjaGFuZ2VzLFxuXHRcdFx0XHRwZXJzaXN0ZWQ6IEpTT04ucGFyc2UoKGF3YWl0IGRiLmdldE1ldGFkYXRhKE1FVEFfQ0hBTkdFU19TVU1NQVJZKSkhKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0bGl2ZTogeyBhZGRpdGlvbnM6IDAsIGRlbGV0aW9uczogMCwgZmlsZXM6IDAgfSxcblx0XHRcdFx0cGVyc2lzdGVkOiB7IGFkZGl0aW9uczogMCwgZGVsZXRpb25zOiAwLCBmaWxlczogMCB9LFxuXHRcdFx0fSwgJ2EgZ2VudWluZWx5IGVtcHR5IGFsbC1mb2xkZXIgYWdncmVnYXRlIGlzIHdyaXR0ZW4gYXMgemVybywgbm90IHByZXNlcnZlZCcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBzZWNvbmRhcnkgZGVmYXVsdC1icmFuY2ggbG9va3VwIHJlamVjdGlvbiB5aWVsZHMgYSBwYXJ0aWFsIHN1bW1hcnkgYW5kIGtlZXBzIHRoZSBicmFuY2ggY2hhbmdlc2V0IFJlYWR5IChuZXZlciBFcnJvciknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBsb2cgPSBuZXcgUmVjb3JkaW5nTG9nU2VydmljZSgpO1xuXHRcdFx0Y29uc3QgZ2l0ID0gY3JlYXRlTm9vcEdpdFNlcnZpY2UoKTtcblx0XHRcdGdpdC5nZXRSZXBvc2l0b3J5Um9vdCA9IGFzeW5jIHdkID0+IFVSSS5wYXJzZSh3ZC50b1N0cmluZygpKTtcblx0XHRcdC8vIFRoZSBTRUNPTkRBUlkgcmVwbydzIGRlZmF1bHQtYnJhbmNoIHByb2JlIHJlamVjdHMgKGdpdCBzcGF3biBmYWlsdXJlKS5cblx0XHRcdGdpdC5nZXREZWZhdWx0QnJhbmNoID0gYXN5bmMgd2QgPT4ge1xuXHRcdFx0XHRpZiAod2QudG9TdHJpbmcoKSA9PT0gJ2ZpbGU6Ly8vcmVwb0InKSB7IHRocm93IG5ldyBFcnJvcignZGVmYXVsdCBicmFuY2ggbG9va3VwIGV4cGxvZGVkJyk7IH1cblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH07XG5cdFx0XHRnaXQuY29tcHV0ZVNlc3Npb25GaWxlRGlmZnMgPSBhc3luYyB3ZCA9PiB7XG5cdFx0XHRcdGNvbnN0IHJvb3QgPSB3ZC50b1N0cmluZygpO1xuXHRcdFx0XHRpZiAocm9vdCA9PT0gJ2ZpbGU6Ly8vcmVwb0EnKSB7IHJldHVybiBbZ2l0RGlmZignL3JlcG9BL2EudHMnLCAzLCAxKV07IH1cblx0XHRcdFx0aWYgKHJvb3QgPT09ICdmaWxlOi8vL3JlcG9CJykgeyByZXR1cm4gW2dpdERpZmYoJy9yZXBvQi9iLnRzJywgNSwgMildOyB9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgZGIgPSBuZXcgVGVzdFNlc3Npb25EYXRhYmFzZSgpO1xuXHRcdFx0Y29uc3QgeyBzdmMsIHN0YXRlTWFuYWdlciB9ID0gYnVpbGQoeyB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvQScsICdmaWxlOi8vL3JlcG9CJ10sIGdpdCwgY2hlY2twb2ludDogTlVMTF9DSEVDS1BPSU5UX1NFUlZJQ0UsIGRiLCBsb2cgfSk7XG5cblx0XHRcdHN2Yy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb25TdHIpO1xuXHRcdFx0Y29uc3QgY2hhbmdlcyA9IGF3YWl0IHdhaXRGb3JTdW1tYXJ5Q2hhbmdlcyhzdGF0ZU1hbmFnZXIpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2hhbmdlcyxcblx0XHRcdFx0YnJhbmNoU3RhdHVzOiBzdGF0ZU1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoYnVpbGRCcmFuY2hDaGFuZ2VzZXRVcmkoc2Vzc2lvblN0cikpPy5zdGF0dXMsXG5cdFx0XHRcdGxvZ2dlZFJlcG9COiBsb2cuZXJyb3JzLnNvbWUoZSA9PiBlLmluY2x1ZGVzKCdyZXBvQicpKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Ly8gcmVwb0IgaXMgdW5hdmFpbGFibGUgKGl0cyBkZWZhdWx0LWJyYW5jaCBwcm9iZSB0aHJldyk7IG9ubHkgdGhlXG5cdFx0XHRcdC8vIHByaW1hcnkgcmVwb0EgY29udHJpYnV0ZXMgdG8gdGhlIHBhcnRpYWwgYWdncmVnYXRlLlxuXHRcdFx0XHRjaGFuZ2VzOiB7IGFkZGl0aW9uczogMywgZGVsZXRpb25zOiAxLCBmaWxlczogMSB9LFxuXHRcdFx0XHRicmFuY2hTdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdFx0bG9nZ2VkUmVwb0I6IHRydWUsXG5cdFx0XHR9LCAnYSBzZWNvbmRhcnkgZGVmYXVsdC1icmFuY2ggZmFpbHVyZSBtdXN0IG5vdCBmbGlwIHRoZSBwdWJsaXNoZWQgYnJhbmNoIGNoYW5nZXNldCB0byBFcnJvcicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGVsZW1ldHJ5IGVtaXNzaW9uJywgKCkgPT4ge1xuXHRcdGFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JUZWxlbWV0cnkodGVsZW1ldHJ5OiBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlLCBldmVudE5hbWU6IHN0cmluZywgbWF0Y2g/OiAoZGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pID0+IGJvb2xlYW4pOiBQcm9taXNlPFJlY29yZDxzdHJpbmcsIHVua25vd24+PiB7XG5cdFx0XHRjb25zdCBmaW5kID0gKCkgPT4gdGVsZW1ldHJ5LmV2ZW50cy5maW5kKGUgPT4gZS5ldmVudE5hbWUgPT09IGV2ZW50TmFtZSAmJiAoIW1hdGNoIHx8IG1hdGNoKGUuZGF0YSkpKTtcblx0XHRcdGZvciAobGV0IGkgPSAwOyBpIDwgMjAwICYmICFmaW5kKCk7IGkrKykge1xuXHRcdFx0XHRhd2FpdCB0aW1lb3V0KDApO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgZXZlbnQgPSBmaW5kKCk7XG5cdFx0XHRhc3NlcnQub2soZXZlbnQsIGBleHBlY3RlZCB0ZWxlbWV0cnkgZXZlbnQgJHtldmVudE5hbWV9YCk7XG5cdFx0XHRyZXR1cm4gZXZlbnQuZGF0YTtcblx0XHR9XG5cblx0XHR0ZXN0KCdjaGFuZ2VzZXRDb21wdXRlZCAodHVybikgY2FycmllcyBjb3JyZWxhdGlvbiBhbmQgb21pdHMgbXVsdGktcm9vdCBmaWVsZHMgZm9yIGEgc2luZ2xlLXJvb3QgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jICgpID0+IFtnaXREaWZmKCcvcmVwby9hLnRzJyldO1xuXHRcdFx0Y29uc3QgY2hlY2twb2ludCA9IG1ha2VDaGVja3BvaW50KHJvb3QgPT4gKHsgcGFyZW50OiBgJHtyb290fX5wYCwgY3VycmVudDogYCR7cm9vdH1+Y2AgfSkpO1xuXHRcdFx0Y29uc3QgeyBzdmMgfSA9IGJ1aWxkKHtcblx0XHRcdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vcmVwbyddLFxuXHRcdFx0XHRnaXQsXG5cdFx0XHRcdGNoZWNrcG9pbnQsXG5cdFx0XHRcdHRlbGVtZXRyeSxcblx0XHRcdFx0c3Vic2NyaXB0aW9uczogW2J1aWxkVHVybkNoYW5nZXNldFVyaShzZXNzaW9uU3RyLCAndHVybi0xJyldLFxuXHRcdFx0fSk7XG5cblx0XHRcdHN2Yy5vblR1cm5Db21wbGV0ZShzZXNzaW9uU3RyLCAndHVybi0xJywge1xuXHRcdFx0XHRjbGllbnRUeXBlOiBBZ2VudEhvc3RDbGllbnRUeXBlLkVkaXRvcldpbmRvdyxcblx0XHRcdFx0Y29ubmVjdGlvbktpbmQ6IEFnZW50SG9zdENsaWVudENvbm5lY3Rpb25LaW5kLlJlbW90ZUV4dGVuc2lvbkhvc3QsXG5cdFx0XHRcdHRyYW5zcG9ydEtpbmQ6IEFnZW50SG9zdFRyYW5zcG9ydEtpbmQuTWVzc2FnZVBvcnQsXG5cdFx0XHRcdGhvc3RMYXVuY2hLaW5kOiBBZ2VudEhvc3RMYXVuY2hLaW5kLlZTQ29kZU1haW5Qcm9jZXNzLFxuXHRcdFx0XHRtYWNoaW5lSWQ6ICdjbGllbnQtbWFjaGluZS1pZCcsXG5cdFx0XHRcdGRldkRldmljZUlkOiAnY2xpZW50LWRldi1kZXZpY2UtaWQnLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBkYXRhID0gYXdhaXQgd2FpdEZvclRlbGVtZXRyeSh0ZWxlbWV0cnksICdhZ2VudEhvc3QuY2hhbmdlc2V0Q29tcHV0ZWQnLCBkID0+IGQua2luZCA9PT0gJ3R1cm4nKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHByb3ZpZGVyOiBkYXRhLnByb3ZpZGVyLFxuXHRcdFx0XHRhZ2VudFNlc3Npb25JZDogZGF0YS5hZ2VudFNlc3Npb25JZCxcblx0XHRcdFx0dHVybklkOiBkYXRhLnR1cm5JZCxcblx0XHRcdFx0aW5pdGlhdG9yQ2xpZW50VHlwZTogZGF0YS5pbml0aWF0b3JDbGllbnRUeXBlLFxuXHRcdFx0XHRpbml0aWF0b3JDb25uZWN0aW9uS2luZDogZGF0YS5pbml0aWF0b3JDb25uZWN0aW9uS2luZCxcblx0XHRcdFx0aW5pdGlhdG9yVHJhbnNwb3J0S2luZDogZGF0YS5pbml0aWF0b3JUcmFuc3BvcnRLaW5kLFxuXHRcdFx0XHRob3N0TGF1bmNoS2luZDogZGF0YS5ob3N0TGF1bmNoS2luZCxcblx0XHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiBkYXRhLmluaXRpYXRvck1hY2hpbmVJZCxcblx0XHRcdFx0aW5pdGlhdG9yRGV2RGV2aWNlSWQ6IGRhdGEuaW5pdGlhdG9yRGV2RGV2aWNlSWQsXG5cdFx0XHRcdGtpbmQ6IGRhdGEua2luZCxcblx0XHRcdFx0b3V0Y29tZTogZGF0YS5vdXRjb21lLFxuXHRcdFx0XHRpc011bHRpUm9vdDogZGF0YS5pc011bHRpUm9vdCxcblx0XHRcdFx0Zm9sZGVyQ291bnQ6IGRhdGEuZm9sZGVyQ291bnQsXG5cdFx0XHRcdGhhc0ZpbGVDb3VudDogZGF0YS5maWxlQ291bnQgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0aGFzTXVsdGlSb290RmllbGRzOiBkYXRhLnVuaXF1ZUdpdEZvbGRlckNvdW50ICE9PSB1bmRlZmluZWQgfHwgZGF0YS50cmFja2VkRWRpdEZhbGxiYWNrRm9sZGVyQ291bnQgIT09IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0cHJvdmlkZXI6IFVSSS5wYXJzZShzZXNzaW9uU3RyKS5zY2hlbWUsXG5cdFx0XHRcdGFnZW50U2Vzc2lvbklkOiBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvblN0ciksXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGluaXRpYXRvckNsaWVudFR5cGU6ICdlZGl0b3Jfd2luZG93Jyxcblx0XHRcdFx0aW5pdGlhdG9yQ29ubmVjdGlvbktpbmQ6ICdyZW1vdGVfZXh0ZW5zaW9uX2hvc3QnLFxuXHRcdFx0XHRpbml0aWF0b3JUcmFuc3BvcnRLaW5kOiAnbWVzc2FnZV9wb3J0Jyxcblx0XHRcdFx0aG9zdExhdW5jaEtpbmQ6ICd2c2NvZGVfbWFpbl9wcm9jZXNzJyxcblx0XHRcdFx0aW5pdGlhdG9yTWFjaGluZUlkOiAnY2xpZW50LW1hY2hpbmUtaWQnLFxuXHRcdFx0XHRpbml0aWF0b3JEZXZEZXZpY2VJZDogJ2NsaWVudC1kZXYtZGV2aWNlLWlkJyxcblx0XHRcdFx0a2luZDogJ3R1cm4nLFxuXHRcdFx0XHRvdXRjb21lOiAnY29tcHV0ZWQnLFxuXHRcdFx0XHRpc011bHRpUm9vdDogZmFsc2UsXG5cdFx0XHRcdGZvbGRlckNvdW50OiAxLFxuXHRcdFx0XHRoYXNGaWxlQ291bnQ6IHRydWUsXG5cdFx0XHRcdGhhc011bHRpUm9vdEZpZWxkczogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NoYW5nZXNldENvbXB1dGVkICh0dXJuKSBjYXJyaWVzIHRoZSBtdWx0aS1yb290IGZhbi1vdXQgZmllbGRzIGZvciBhIG11bHRpLXJvb3QgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHRlbGVtZXRyeSA9IG5ldyBDYXB0dXJpbmdUZWxlbWV0cnlTZXJ2aWNlKCk7XG5cdFx0XHRjb25zdCBnaXQgPSBjcmVhdGVOb29wR2l0U2VydmljZSgpO1xuXHRcdFx0Z2l0LmdldFJlcG9zaXRvcnlSb290ID0gYXN5bmMgd2QgPT4gVVJJLnBhcnNlKHdkLnRvU3RyaW5nKCkpO1xuXHRcdFx0Z2l0LmNvbXB1dGVGaWxlRGlmZnNCZXR3ZWVuUmVmcyA9IGFzeW5jIHdkID0+IHdkLnRvU3RyaW5nKCkgPT09ICdmaWxlOi8vL3JlcG9BJyA/IFtnaXREaWZmKCcvcmVwb0EvYS50cycpXSA6IFtnaXREaWZmKCcvcmVwb0IvYi50cycpXTtcblx0XHRcdGNvbnN0IGNoZWNrcG9pbnQgPSBtYWtlQ2hlY2twb2ludChyb290ID0+ICh7IHBhcmVudDogYCR7cm9vdH1+cGAsIGN1cnJlbnQ6IGAke3Jvb3R9fmNgIH0pKTtcblx0XHRcdGNvbnN0IHsgc3ZjIH0gPSBidWlsZCh7XG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG9BJywgJ2ZpbGU6Ly8vcmVwb0InXSxcblx0XHRcdFx0Z2l0LFxuXHRcdFx0XHRjaGVja3BvaW50LFxuXHRcdFx0XHR0ZWxlbWV0cnksXG5cdFx0XHRcdHN1YnNjcmlwdGlvbnM6IFtidWlsZFR1cm5DaGFuZ2VzZXRVcmkoc2Vzc2lvblN0ciwgJ3R1cm4tMScpXSxcblx0XHRcdH0pO1xuXG5cdFx0XHRzdmMub25UdXJuQ29tcGxldGUoc2Vzc2lvblN0ciwgJ3R1cm4tMScpO1xuXHRcdFx0Y29uc3QgZGF0YSA9IGF3YWl0IHdhaXRGb3JUZWxlbWV0cnkodGVsZW1ldHJ5LCAnYWdlbnRIb3N0LmNoYW5nZXNldENvbXB1dGVkJywgZCA9PiBkLmtpbmQgPT09ICd0dXJuJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRraW5kOiBkYXRhLmtpbmQsXG5cdFx0XHRcdG91dGNvbWU6IGRhdGEub3V0Y29tZSxcblx0XHRcdFx0aXNNdWx0aVJvb3Q6IGRhdGEuaXNNdWx0aVJvb3QsXG5cdFx0XHRcdGZvbGRlckNvdW50OiBkYXRhLmZvbGRlckNvdW50LFxuXHRcdFx0XHR1bmlxdWVHaXRGb2xkZXJDb3VudDogZGF0YS51bmlxdWVHaXRGb2xkZXJDb3VudCxcblx0XHRcdFx0bm9uR2l0Rm9sZGVyQ291bnQ6IGRhdGEubm9uR2l0Rm9sZGVyQ291bnQsXG5cdFx0XHRcdHRyYWNrZWRFZGl0RmFsbGJhY2tGb2xkZXJDb3VudDogZGF0YS50cmFja2VkRWRpdEZhbGxiYWNrRm9sZGVyQ291bnQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGtpbmQ6ICd0dXJuJyxcblx0XHRcdFx0b3V0Y29tZTogJ2NvbXB1dGVkJyxcblx0XHRcdFx0aXNNdWx0aVJvb3Q6IHRydWUsXG5cdFx0XHRcdGZvbGRlckNvdW50OiAyLFxuXHRcdFx0XHR1bmlxdWVHaXRGb2xkZXJDb3VudDogMixcblx0XHRcdFx0bm9uR2l0Rm9sZGVyQ291bnQ6IDAsXG5cdFx0XHRcdHRyYWNrZWRFZGl0RmFsbGJhY2tGb2xkZXJDb3VudDogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsZUFBZTtBQUN4QixTQUFTLGlCQUFpQixvQkFBb0I7QUFDOUMsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsMEJBQTBCO0FBQ25DLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsK0JBQStCLHFCQUFxQiw4QkFBOEI7QUFDM0YsU0FBUyx5QkFBeUIsOEJBQThCLDBCQUEwQix1QkFBdUIsb0NBQW9DO0FBQ3JKLFNBQXlCLGtCQUFrQjtBQUMzQyxTQUFTLGlCQUFpQixjQUFjLGFBQWEsZUFBZSwyQkFBa0U7QUFDdEksU0FBUyxpQ0FBaUM7QUFDMUMsU0FBUyw0QkFBNEI7QUFJckMsU0FBUywrQkFBaUU7QUFDMUUsU0FBUywyQkFBMkI7QUFFcEMsU0FBNEIsc0JBQXNCO0FBQ2xELFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsc0JBQXNCLDhCQUE4QiwwQkFBMEIs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
