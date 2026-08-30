import assert from "assert";
import { DeferredPromise } from "../../../../base/common/async.js";
import { Disposable, toDisposable } from "../../../../base/common/lifecycle.js";
import { Emitter } from "../../../../base/common/event.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ILogService, NullLogService } from "../../../log/common/log.js";
import { AgentSession } from "../../common/agent.js";
import { buildBranchChangesetUri, buildDefaultChangesetCatalog, buildSessionChangesetUri, buildUncommittedChangesetUri, ChangesetKind, parseChangesetUri } from "../../common/changesetUri.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { buildSubagentSessionUri, SessionStatus } from "../../common/state/sessionState.js";
import { AgentConfigurationService, IAgentConfigurationService } from "../../node/agentConfigurationService.js";
import { AgentHostChangesetCoordinator } from "../../node/agentHostChangesetCoordinator.js";
import { IAgentHostChangesetService } from "../../common/agentHostChangesetService.js";
import { IAgentHostChangesetOperationService } from "../../common/agentHostChangesetOperationService.js";
import { IAgentHostFileMonitorService } from "../../node/agentHostFileMonitorService.js";
import { IAgentHostGitService } from "../../common/agentHostGitService.js";
import { IAgentHostGitStateService } from "../../common/agentHostGitStateService.js";
import { AgentHostStateManager, IAgentHostStateManager } from "../../node/agentHostStateManager.js";
import { createNoopGitService } from "../common/sessionTestHelpers.js";
import { IAgentHostChangesetSubscriptionService } from "../../common/agentHostChangesetSubscriptionService.js";
import { AgentHostChangesetSubscriptionService } from "../../node/agentHostChangesetSubscriptionService.js";
import { InstantiationService } from "../../../instantiation/common/instantiationService.js";
import { ServiceCollection } from "../../../instantiation/common/serviceCollection.js";
suite("ChangesetSessionCoordinator", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  function createSession(stateManager, session, workingDirectory, emitNotification = true) {
    stateManager.createSession({
      resource: session,
      provider: "mock",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" },
      workingDirectories: workingDirectory ? [workingDirectory] : void 0
    }, { emitNotification });
    stateManager.setSessionChangesets(session, buildDefaultChangesetCatalog(session));
    stateManager.dispatchServerAction(session, { type: ActionType.SessionReady });
  }
  function createMultiRootSession(stateManager, session, workingDirectories) {
    createSession(stateManager, session, workingDirectories[0]);
    for (const workingDirectory of workingDirectories.slice(1)) {
      stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: workingDirectory });
    }
  }
  function createEnvironment(root = URI.file("/repo"), gitServiceOverride) {
    const stateManager = disposables.add(new AgentHostStateManager(new NullLogService()));
    const logService = new NullLogService();
    const configurationService = disposables.add(new AgentConfigurationService(stateManager, logService));
    const subscriptions = new AgentHostChangesetSubscriptionService();
    const changesets = new TestChangesetService(subscriptions);
    const monitor = disposables.add(new TestFileMonitorService());
    const gitService = gitServiceOverride ?? createGitService(root);
    const gitStateService = disposables.add(new TestGitStateService());
    const updateOperationsCalls = [];
    const operationContributionService = {
      _serviceBrand: void 0,
      registerContribution: () => Disposable.None,
      getOperations: () => [],
      updateOperations: (sessionKey) => {
        updateOperationsCalls.push(sessionKey);
      },
      invokeChangesetOperation: async () => ({}),
      dispose: () => {
      }
    };
    const instantiationService = disposables.add(new InstantiationService(
      new ServiceCollection(
        [ILogService, logService],
        [IAgentHostStateManager, stateManager],
        [IAgentConfigurationService, configurationService],
        [IAgentHostChangesetOperationService, operationContributionService],
        [IAgentHostChangesetService, changesets],
        [IAgentHostChangesetSubscriptionService, subscriptions],
        [IAgentHostFileMonitorService, monitor],
        [IAgentHostGitService, gitService],
        [IAgentHostGitStateService, gitStateService]
      ),
      /*strict*/
      true
    ));
    const coordinator = disposables.add(instantiationService.createInstance(AgentHostChangesetCoordinator));
    return { stateManager, changesets, subscriptions, monitor, gitService, gitStateService, coordinator, updateOperationsCalls };
  }
  test("refreshes changeset operations when a session gains or loses a working directory", () => {
    const session = AgentSession.uri("mock", "session-wd").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repoA");
    const baseline = environment.updateOperationsCalls.length;
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///repoB" });
    assert.deepStrictEqual(environment.updateOperationsCalls.slice(baseline), [session], "adding a root refreshes the session operations");
    const afterAdd = environment.updateOperationsCalls.length;
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///repoB" });
    assert.strictEqual(environment.updateOperationsCalls.length, afterAdd, "a no-op working-directory action does not refresh");
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: "file:///repoB" });
    assert.deepStrictEqual(environment.updateOperationsCalls.slice(afterAdd), [session], "removing a root refreshes the session operations");
  });
  test("refreshes changeset operations when GitHub state changes", () => {
    const session = AgentSession.uri("mock", "session-github").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo");
    const baseline = environment.updateOperationsCalls.length;
    environment.gitStateService.fireGitHubStateChanged(session);
    assert.deepStrictEqual(environment.updateOperationsCalls.slice(baseline), [session]);
  });
  test("a parent working-directory change also refreshes inheriting subagent sessions", () => {
    const parentSession = AgentSession.uri("mock", "session-parent").toString();
    const subagentSession = buildSubagentSessionUri(parentSession, "tool-1");
    const environment = createEnvironment();
    createSession(environment.stateManager, parentSession, "file:///repoA");
    createSession(environment.stateManager, subagentSession);
    const baseline = environment.updateOperationsCalls.length;
    environment.stateManager.dispatchServerAction(parentSession, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///repoB" });
    assert.deepStrictEqual(
      [...environment.updateOperationsCalls.slice(baseline)].sort(),
      [parentSession, subagentSession].sort(),
      "a parent root change refreshes both the parent and its inheriting subagent"
    );
  });
  test("shares root watchers across sessions and fans out root changes to static refreshes", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({
      acquisitions: environment.monitor.acquisitions,
      branchRefreshes: environment.changesets.branchRefreshes,
      uncommittedRefreshes: environment.changesets.uncommittedRefreshes,
      gitStateRefreshes: environment.gitStateService.refreshed
    }, {
      acquisitions: ["file:///repo"],
      branchRefreshes: [firstSession],
      uncommittedRefreshes: [secondSession],
      gitStateRefreshes: [firstSession, secondSession]
    });
  });
  test("releases a root watcher after the last interested session unsubscribes", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onLastSubscriber(URI.parse(firstSession));
    assert.deepStrictEqual(environment.monitor.disposals, []);
    environment.coordinator.onLastSubscriber(URI.parse(buildUncommittedChangesetUri(secondSession)));
    assert.deepStrictEqual(environment.monitor.disposals, ["file:///repo"]);
  });
  test("attaches deferred watch interest on materialization without re-querying an unchanged root", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(buildUncommittedChangesetUri(session)));
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, { acquisitions: [], rootLookups: [] });
    const summary = environment.stateManager.getSessionSummary(session);
    environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ["file:///repo/worktree"] });
    environment.coordinator.onSessionMaterialized(session);
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionMaterialized(session);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, rootLookups: environment.gitService.rootLookupCalls }, {
      acquisitions: ["file:///repo"],
      rootLookups: ["file:///repo/worktree"]
    });
  });
  test("forwards session changeset refresh to the changeset service and drains pending work on materialization", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(buildSessionChangesetUri(session)));
    await tick();
    const summary = environment.stateManager.getSessionSummary(session);
    environment.stateManager.markSessionPersisted(session, { ...summary, workingDirectories: ["file:///repo/worktree"] });
    environment.coordinator.onSessionMaterialized(session);
    await tick();
    assert.deepStrictEqual({
      sessionRefreshes: environment.changesets.sessionRefreshes,
      workingDirectoryAvailable: environment.changesets.workingDirectoryAvailable
    }, {
      sessionRefreshes: [session],
      workingDirectoryAvailable: [session]
    });
  });
  test("exposes subscriptions and drops them when the last subscriber leaves", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    const changeset = buildSessionChangesetUri(session);
    createSession(environment.stateManager, session, void 0, false);
    environment.coordinator.onFirstSubscriber(URI.parse(changeset));
    const subscribed = [...environment.subscriptions.getSessionSubscriptions(session)];
    environment.coordinator.onLastSubscriber(URI.parse(changeset));
    const afterUnsubscribe = [...environment.subscriptions.getSessionSubscriptions(session)];
    assert.deepStrictEqual({ subscribed, afterUnsubscribe }, {
      subscribed: [changeset],
      afterUnsubscribe: []
    });
  });
  test("does not attach root state when watcher acquisition fails", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.monitor.failAcquire = true;
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.gitService.waitForRootLookups(1);
    await tick();
    environment.monitor.fire(URI.file("/repo"));
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo"],
      refreshes: []
    });
  });
  test("active turn suspends and resumes root watcher when interest remains", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(session, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      refreshes: []
    });
  });
  test("active session sharing a root suspends watcher for other subscribed sessions", async () => {
    const firstSession = AgentSession.uri("mock", "session-1").toString();
    const secondSession = AgentSession.uri("mock", "session-2").toString();
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, firstSession, "file:///repo/worktree-a");
    createSession(environment.stateManager, secondSession, "file:///repo/worktree-b");
    environment.coordinator.onFirstSubscriber(URI.parse(firstSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onFirstSubscriber(URI.parse(secondSession));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(secondSession, true);
    await environment.gitService.waitForRootLookups(3);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(secondSession, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, uncommittedRefreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      uncommittedRefreshes: []
    });
  });
  test("active subagent maps to parent root and suspends watcher until subagent completes", async () => {
    const parentSession = AgentSession.uri("mock", "session-1").toString();
    const subagentSession = buildSubagentSessionUri(parentSession, "tool-1");
    const root = URI.file("/repo");
    const environment = createEnvironment(root);
    createSession(environment.stateManager, parentSession, "file:///repo/worktree");
    createSession(environment.stateManager, subagentSession, void 0);
    environment.coordinator.onFirstSubscriber(URI.parse(parentSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(subagentSession, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(root);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(subagentSession, false);
    await environment.monitor.waitForAcquisitions(2);
    environment.monitor.fire(root);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals, refreshes: environment.changesets.uncommittedRefreshes }, {
      acquisitions: ["file:///repo", "file:///repo"],
      disposals: ["file:///repo"],
      refreshes: []
    });
  });
  test("turn ending after unsubscribe or dispose does not reattach watcher", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(2);
    await tick();
    environment.coordinator.onLastSubscriber(URI.parse(session));
    environment.coordinator.onSessionDisposed(session);
    environment.coordinator.onSessionTurnActiveChanged(session, false);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals }, {
      acquisitions: ["file:///repo"],
      disposals: ["file:///repo"]
    });
  });
  test("watches every git repository root in a multi-root session", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    assert.deepStrictEqual([...environment.monitor.acquisitions].sort(), [rootA.toString(), rootB.toString()].sort());
  });
  test("a secondary-root external edit refreshes the summary using the primary working directory", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const primaryRoot = URI.file("/projects/repoA");
    const secondaryRoot = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [primaryRoot.toString(), primaryRoot],
      [secondaryRoot.toString(), secondaryRoot]
    ])));
    createMultiRootSession(environment.stateManager, session, [primaryRoot.toString(), secondaryRoot.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    environment.changesets.clearRefreshes();
    environment.monitor.fire(secondaryRoot);
    await tick();
    assert.deepStrictEqual({
      refreshedWith: environment.gitStateService.refreshedWith,
      recomputed: environment.changesets.recomputed,
      branchRefreshes: environment.changesets.branchRefreshes
    }, {
      refreshedWith: [{ sessionKey: session, workingDirectory: primaryRoot.toString() }],
      recomputed: [session],
      branchRefreshes: [session]
    });
  });
  test("a turn suspends and re-attaches every repository root", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(3);
    await tick();
    environment.coordinator.onSessionTurnActiveChanged(session, false);
    await environment.monitor.waitForAcquisitions(4);
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      disposals: [...environment.monitor.disposals].sort()
    }, {
      acquisitions: [rootA.toString(), rootA.toString(), rootB.toString(), rootB.toString()].sort(),
      disposals: [rootA.toString(), rootB.toString()].sort()
    });
  });
  test("deduplicates working directories that resolve to the same repository", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const sharedRoot = URI.file("/projects/mono");
    const dirA = "file:///projects/mono/packages/a";
    const dirB = "file:///projects/mono/packages/b";
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [dirA, sharedRoot],
      [dirB, sharedRoot]
    ])));
    createMultiRootSession(environment.stateManager, session, [dirA, dirB]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.gitService.waitForRootLookups(2);
    await tick();
    assert.deepStrictEqual(environment.monitor.acquisitions, [sharedRoot.toString()]);
  });
  test("releases every repository root when the last subscriber leaves", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    environment.coordinator.onLastSubscriber(URI.parse(session));
    await tick();
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      disposals: [...environment.monitor.disposals].sort()
    }, {
      acquisitions: [rootA.toString(), rootB.toString()].sort(),
      disposals: [rootA.toString(), rootB.toString()].sort()
    });
  });
  test("watches secondary git repositories even when the primary folder is not a git repository", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const nonGitPrimary = "file:///projects";
    const secondaryRoot = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [nonGitPrimary, void 0],
      [secondaryRoot.toString(), secondaryRoot]
    ])));
    createMultiRootSession(environment.stateManager, session, [nonGitPrimary, secondaryRoot.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.changesets.clearRefreshes();
    environment.monitor.fire(secondaryRoot);
    await tick();
    assert.deepStrictEqual({
      acquisitions: environment.monitor.acquisitions,
      refreshedWith: environment.gitStateService.refreshedWith,
      recomputed: environment.changesets.recomputed
    }, {
      acquisitions: [secondaryRoot.toString()],
      refreshedWith: [{ sessionKey: session, workingDirectory: nonGitPrimary }],
      recomputed: [session]
    });
  });
  test("does not refresh from any root while a turn is active", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    environment.coordinator.onSessionTurnActiveChanged(session, true);
    await environment.gitService.waitForRootLookups(3);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(rootA);
    environment.monitor.fire(rootB);
    await tick();
    assert.deepStrictEqual({
      recomputed: environment.changesets.recomputed,
      refreshed: environment.gitStateService.refreshed
    }, {
      recomputed: [],
      refreshed: []
    });
  });
  test("does not refresh an idle session sharing a secondary root while another session runs a turn", async () => {
    const sessionA = AgentSession.uri("mock", "session-a").toString();
    const sessionB = AgentSession.uri("mock", "session-b").toString();
    const sharedRoot = URI.file("/projects/shared");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [sharedRoot.toString(), sharedRoot],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, sessionA, [sharedRoot.toString()]);
    createMultiRootSession(environment.stateManager, sessionB, [rootB.toString(), sharedRoot.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(sessionA));
    environment.coordinator.onFirstSubscriber(URI.parse(sessionB));
    await environment.monitor.waitForAcquisitions(2);
    environment.coordinator.onSessionTurnActiveChanged(sessionA, true);
    await environment.gitService.waitForRootLookups(4);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(sharedRoot);
    await tick();
    assert.deepStrictEqual(environment.changesets.recomputed, []);
  });
  test("disposing a session with a live branch subscription clears watch interest", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const environment = createEnvironment();
    createSession(environment.stateManager, session, "file:///repo/worktree");
    environment.coordinator.onFirstSubscriber(URI.parse(buildBranchChangesetUri(session)));
    await environment.monitor.waitForAcquisitions(1);
    environment.coordinator.onSessionDisposed(session);
    environment.coordinator.onSessionMaterialized(session);
    await tick();
    assert.deepStrictEqual({ acquisitions: environment.monitor.acquisitions, disposals: environment.monitor.disposals }, {
      acquisitions: ["file:///repo"],
      disposals: ["file:///repo"]
    });
  });
  test("detaches a repository root watcher when a session stops resolving to it", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: rootB.toString() });
    environment.coordinator.onSessionMaterialized(session);
    await environment.gitService.waitForRootLookups(3);
    await tick();
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      disposals: environment.monitor.disposals
    }, {
      acquisitions: [rootA.toString(), rootB.toString()].sort(),
      disposals: [rootB.toString()]
    });
  });
  test("keeps a shared secondary root watched for an idle session while another session runs a turn", async () => {
    const sessionA = AgentSession.uri("mock", "session-a").toString();
    const sessionB = AgentSession.uri("mock", "session-b").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const sharedRoot = URI.file("/projects/shared");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB],
      [sharedRoot.toString(), sharedRoot]
    ])));
    createMultiRootSession(environment.stateManager, sessionA, [rootA.toString(), sharedRoot.toString()]);
    createMultiRootSession(environment.stateManager, sessionB, [rootB.toString(), sharedRoot.toString()]);
    environment.coordinator.onFirstSubscriber(URI.parse(sessionA));
    environment.coordinator.onFirstSubscriber(URI.parse(sessionB));
    await environment.monitor.waitForAcquisitions(3);
    environment.coordinator.onSessionTurnActiveChanged(sessionA, true);
    await environment.gitService.waitForRootLookups(5);
    await tick();
    environment.changesets.clearRefreshes();
    environment.monitor.fire(sharedRoot);
    await tick();
    assert.deepStrictEqual(environment.changesets.recomputed, [sessionB]);
  });
  test("retries a repository root whose watcher acquisition failed on the next re-attach", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createMultiRootSession(environment.stateManager, session, [rootA.toString(), rootB.toString()]);
    environment.monitor.failAcquireFor.add(rootB.toString());
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(2);
    await tick();
    environment.monitor.failAcquireFor.delete(rootB.toString());
    environment.coordinator.onSessionMaterialized(session);
    await environment.monitor.waitForAcquisitions(3);
    environment.changesets.clearRefreshes();
    environment.monitor.fire(rootB);
    await tick();
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      recomputed: environment.changesets.recomputed
    }, {
      acquisitions: [rootA.toString(), rootB.toString(), rootB.toString()].sort(),
      recomputed: [session]
    });
  });
  test("re-attaches root watchers when a working directory is added or removed mid-session", async () => {
    const session = AgentSession.uri("mock", "session-1").toString();
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createSession(environment.stateManager, session, rootA.toString());
    environment.coordinator.onFirstSubscriber(URI.parse(session));
    await environment.monitor.waitForAcquisitions(1);
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectorySet, directory: rootB.toString() });
    await environment.monitor.waitForAcquisitions(2);
    environment.stateManager.dispatchServerAction(session, { type: ActionType.SessionWorkingDirectoryRemoved, directory: rootB.toString() });
    await environment.monitor.waitForDisposals(1);
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      disposals: [...environment.monitor.disposals]
    }, {
      acquisitions: [rootA.toString(), rootB.toString()].sort(),
      disposals: [rootB.toString()]
    });
  });
  test("a subagent inheriting a multi-root parent watches every parent root and refreshes via the parent primary", async () => {
    const parentSession = AgentSession.uri("mock", "session-parent").toString();
    const subagentSession = buildSubagentSessionUri(parentSession, "tool-1");
    const primaryRoot = URI.file("/projects/repoA");
    const secondaryRoot = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [primaryRoot.toString(), primaryRoot],
      [secondaryRoot.toString(), secondaryRoot]
    ])));
    createMultiRootSession(environment.stateManager, parentSession, [primaryRoot.toString(), secondaryRoot.toString()]);
    createSession(environment.stateManager, subagentSession);
    environment.coordinator.onFirstSubscriber(URI.parse(subagentSession));
    await environment.monitor.waitForAcquisitions(2);
    environment.changesets.clearRefreshes();
    environment.monitor.fire(secondaryRoot);
    await tick();
    assert.deepStrictEqual({
      acquisitions: [...environment.monitor.acquisitions].sort(),
      refreshedWith: environment.gitStateService.refreshedWith,
      recomputed: environment.changesets.recomputed
    }, {
      acquisitions: [primaryRoot.toString(), secondaryRoot.toString()].sort(),
      refreshedWith: [{ sessionKey: subagentSession, workingDirectory: primaryRoot.toString() }],
      recomputed: [subagentSession]
    });
  });
  test("re-attaches an inheriting subagent when the parent gains a working directory mid-session", async () => {
    const parentSession = AgentSession.uri("mock", "session-parent").toString();
    const subagentSession = buildSubagentSessionUri(parentSession, "tool-1");
    const rootA = URI.file("/projects/repoA");
    const rootB = URI.file("/projects/repoB");
    const environment = createEnvironment(void 0, createRoutingGitService(/* @__PURE__ */ new Map([
      [rootA.toString(), rootA],
      [rootB.toString(), rootB]
    ])));
    createSession(environment.stateManager, parentSession, rootA.toString());
    createSession(environment.stateManager, subagentSession);
    environment.coordinator.onFirstSubscriber(URI.parse(subagentSession));
    await environment.monitor.waitForAcquisitions(1);
    environment.stateManager.dispatchServerAction(parentSession, { type: ActionType.SessionWorkingDirectorySet, directory: rootB.toString() });
    await environment.monitor.waitForAcquisitions(2);
    assert.deepStrictEqual([...environment.monitor.acquisitions].sort(), [rootA.toString(), rootB.toString()].sort());
  });
});
function createGitService(root) {
  return createGitServiceFromResolver(() => root);
}
function createRoutingGitService(routes) {
  return createGitServiceFromResolver((workingDirectory) => routes.get(workingDirectory.toString()));
}
function createGitServiceFromResolver(resolveRoot) {
  const rootLookupCalls = [];
  const waiters = [];
  const releaseWaiters = () => {
    for (const waiter of [...waiters]) {
      if (rootLookupCalls.length >= waiter.count) {
        waiters.splice(waiters.indexOf(waiter), 1);
        void waiter.deferred.complete(void 0);
      }
    }
  };
  return {
    ...createNoopGitService(),
    rootLookupCalls,
    async getRepositoryRoot(workingDirectory) {
      rootLookupCalls.push(workingDirectory.toString());
      releaseWaiters();
      return resolveRoot(workingDirectory);
    },
    waitForRootLookups(count) {
      if (rootLookupCalls.length >= count) {
        return Promise.resolve();
      }
      const deferred = new DeferredPromise();
      waiters.push({ count, deferred });
      return deferred.p;
    }
  };
}
class TestGitStateService extends Disposable {
  constructor() {
    super(...arguments);
    this._onDidRefreshSessionGitState = this._register(new Emitter());
    this.onDidRefreshSessionGitState = this._onDidRefreshSessionGitState.event;
    this._onDidChangeSessionGitHubState = this._register(new Emitter());
    this.onDidChangeSessionGitHubState = this._onDidChangeSessionGitHubState.event;
    this.refreshed = [];
    this.refreshedWith = [];
  }
  async refreshSessionGitState(sessionKey, workingDirectory) {
    this.refreshed.push(sessionKey);
    this.refreshedWith.push({ sessionKey, workingDirectory: workingDirectory?.toString() });
    this._onDidRefreshSessionGitState.fire(sessionKey);
  }
  async resolveSessionBaseBranchName() {
    return void 0;
  }
  async setSessionGitHubState(_sessionKey, _state) {
  }
  async recordSessionMerge(_sessionKey, _commit) {
  }
  async attachSessionGitHubPullRequest(_sessionKey) {
  }
  async attachSessionGitHubReferences(_sessionKey, _text) {
  }
  fireGitHubStateChanged(sessionKey) {
    this._onDidChangeSessionGitHubState.fire(sessionKey);
  }
}
class TestFileMonitorService extends Disposable {
  constructor() {
    super(...arguments);
    this.acquisitions = [];
    this.disposals = [];
    this.failAcquire = false;
    this.failAcquireFor = /* @__PURE__ */ new Set();
    this._callbacks = /* @__PURE__ */ new Map();
    this._acquisitionWaiters = [];
    this._disposalWaiters = [];
  }
  acquire(folder, callback, _options) {
    const root = folder.toString();
    this.acquisitions.push(root);
    if (this.failAcquire || this.failAcquireFor.has(root)) {
      this._releaseAcquisitionWaiters();
      return void 0;
    }
    let callbacks = this._callbacks.get(root);
    if (!callbacks) {
      callbacks = /* @__PURE__ */ new Set();
      this._callbacks.set(root, callbacks);
    }
    callbacks.add(callback);
    this._releaseAcquisitionWaiters();
    return toDisposable(() => {
      callbacks.delete(callback);
      this.disposals.push(root);
      this._releaseDisposalWaiters();
    });
  }
  fire(root) {
    for (const callback of this._callbacks.get(root.toString()) ?? []) {
      callback();
    }
  }
  waitForAcquisitions(count) {
    if (this.acquisitions.length >= count) {
      return Promise.resolve();
    }
    const deferred = new DeferredPromise();
    this._acquisitionWaiters.push({ count, deferred });
    return deferred.p;
  }
  _releaseAcquisitionWaiters() {
    for (const waiter of [...this._acquisitionWaiters]) {
      if (this.acquisitions.length >= waiter.count) {
        this._acquisitionWaiters.splice(this._acquisitionWaiters.indexOf(waiter), 1);
        void waiter.deferred.complete(void 0);
      }
    }
  }
  waitForDisposals(count) {
    if (this.disposals.length >= count) {
      return Promise.resolve();
    }
    const deferred = new DeferredPromise();
    this._disposalWaiters.push({ count, deferred });
    return deferred.p;
  }
  _releaseDisposalWaiters() {
    for (const waiter of [...this._disposalWaiters]) {
      if (this.disposals.length >= waiter.count) {
        this._disposalWaiters.splice(this._disposalWaiters.indexOf(waiter), 1);
        void waiter.deferred.complete(void 0);
      }
    }
  }
}
class TestChangesetService {
  constructor(_subscriptions) {
    this._subscriptions = _subscriptions;
    this.branchRefreshes = [];
    this.uncommittedRefreshes = [];
    this.sessionRefreshes = [];
    this.workingDirectoryAvailable = [];
    this.recomputed = [];
    this.disposed = [];
  }
  registerStaticChangesets(_session) {
  }
  restoreStaticChangeset(_session, _kind, _diffs) {
  }
  parsePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  applyPersistedStaticChangesets(_sessionUri, _diffs) {
  }
  restorePersistedStaticChangesets(_sessionUri, _metadata) {
    return {};
  }
  persistChangesSummary(_sessionUri, _summary) {
  }
  isStaticChangesetComputeActive(_changesetUri) {
    return false;
  }
  refreshChangesetCatalog(_session) {
  }
  refreshBranchChangeset(session) {
    this.branchRefreshes.push(session);
  }
  refreshSessionChangeset(session) {
    this.sessionRefreshes.push(session);
  }
  onWorkingDirectoryAvailable(session) {
    this.workingDirectoryAvailable.push(session);
  }
  recomputeSubscribedChangesets(session) {
    this.recomputed.push(session);
    for (const changeset of this._subscriptions.getSessionSubscriptions(session)) {
      const parsed = parseChangesetUri(changeset);
      switch (parsed?.kind) {
        case ChangesetKind.Branch:
          this.refreshBranchChangeset(session);
          break;
        case ChangesetKind.Session:
          this.refreshSessionChangeset(session);
          break;
        case ChangesetKind.Uncommitted:
          void this.computeUncommittedChangeset(session);
          break;
        default:
          if (changeset === session) {
            this.refreshBranchChangeset(session);
            this.refreshSessionChangeset(session);
          }
          break;
      }
    }
  }
  onSessionDisposed(session) {
    this.disposed.push(session);
  }
  async computeUncommittedChangeset(session) {
    if (this._subscriptions.getSessionSubscriptions(session).has(URI.parse(buildUncommittedChangesetUri(session)).toString())) {
      this.uncommittedRefreshes.push(session);
    }
    return `${session}/changeset/uncommitted`;
  }
  async computeTurnChangeset(session, turnId) {
    return `${session}/changeset/turn/${turnId}`;
  }
  async computeCompareTurnsChangeset(session, originalTurnId, modifiedTurnId) {
    return `${session}/changeset/compare/${originalTurnId}/${modifiedTurnId}`;
  }
  onToolCallEditsApplied(_session, _turnId) {
  }
  onTurnComplete(_session, _turnId) {
  }
  onSessionTruncated(_session) {
  }
  clearRefreshes() {
    this.branchRefreshes.length = 0;
    this.uncommittedRefreshes.length = 0;
    this.sessionRefreshes.length = 0;
    this.recomputed.length = 0;
  }
  getListMetadataKeys(_sessionStr) {
    return void 0;
  }
  computeListEntryChanges(_sessionUri, _metadata) {
    return void 0;
  }
}
function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvci50ZXN0LnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgRGVmZXJyZWRQcm9taXNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXN5bmMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgSURpc3Bvc2FibGUsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBFbWl0dGVyIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UsIE51bGxMb2dTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vbG9nL2NvbW1vbi9sb2cuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IGJ1aWxkQnJhbmNoQ2hhbmdlc2V0VXJpLCBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nLCBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmksIGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmksIENoYW5nZXNldEtpbmQsIHBhcnNlQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBTZXNzaW9uU3RhdHVzLCB0eXBlIElTZXNzaW9uRmlsZURpZmYsIHR5cGUgSVNlc3Npb25HaXRIdWJTdGF0ZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgQWdlbnRDb25maWd1cmF0aW9uU2VydmljZSwgSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50Q29uZmlndXJhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q2hhbmdlc2V0Q29vcmRpbmF0b3IgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdENoYW5nZXNldENvb3JkaW5hdG9yLmpzJztcbmltcG9ydCB7IElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlLCBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEsIElSZXN0b3JlZENoYW5nZXNldERpZmZzLCBTdGF0aWNDaGFuZ2VzZXRLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdENoYW5nZXNldFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldE9wZXJhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0RmlsZU1vbml0b3JPcHRpb25zLCBJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2UuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdEdpdFNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0R2l0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50SG9zdEdpdFN0YXRlU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIElBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVOb29wR2l0U2VydmljZSB9IGZyb20gJy4uL2NvbW1vbi9zZXNzaW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc1N1bW1hcnkgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRIb3N0Q2hhbmdlc2V0U3Vic2NyaXB0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vbm9kZS9hZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlLmpzJztcbmltcG9ydCB7IEluc3RhbnRpYXRpb25TZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vaW5zdGFudGlhdGlvbi9jb21tb24vaW5zdGFudGlhdGlvblNlcnZpY2UuanMnO1xuaW1wb3J0IHsgU2VydmljZUNvbGxlY3Rpb24gfSBmcm9tICcuLi8uLi8uLi9pbnN0YW50aWF0aW9uL2NvbW1vbi9zZXJ2aWNlQ29sbGVjdGlvbi5qcyc7XG5cbnN1aXRlKCdDaGFuZ2VzZXRTZXNzaW9uQ29vcmRpbmF0b3InLCAoKSA9PiB7XG5cblx0Y29uc3QgZGlzcG9zYWJsZXMgPSBlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRmdW5jdGlvbiBjcmVhdGVTZXNzaW9uKHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyLCBzZXNzaW9uOiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk/OiBzdHJpbmcsIGVtaXROb3RpZmljYXRpb24gPSB0cnVlKTogdm9pZCB7XG5cdFx0c3RhdGVNYW5hZ2VyLmNyZWF0ZVNlc3Npb24oe1xuXHRcdFx0cmVzb3VyY2U6IHNlc3Npb24sXG5cdFx0XHRwcm92aWRlcjogJ21vY2snLFxuXHRcdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0Y3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0XHR3b3JraW5nRGlyZWN0b3JpZXM6IHdvcmtpbmdEaXJlY3RvcnkgPyBbd29ya2luZ0RpcmVjdG9yeV0gOiB1bmRlZmluZWQsXG5cdFx0fSwgeyBlbWl0Tm90aWZpY2F0aW9uIH0pO1xuXHRcdHN0YXRlTWFuYWdlci5zZXRTZXNzaW9uQ2hhbmdlc2V0cyhzZXNzaW9uLCBidWlsZERlZmF1bHRDaGFuZ2VzZXRDYXRhbG9nKHNlc3Npb24pKTtcblx0XHRzdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSB9KTtcblx0fVxuXG5cdGZ1bmN0aW9uIGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oc3RhdGVNYW5hZ2VyOiBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIHNlc3Npb246IHN0cmluZywgd29ya2luZ0RpcmVjdG9yaWVzOiByZWFkb25seSBzdHJpbmdbXSk6IHZvaWQge1xuXHRcdGNyZWF0ZVNlc3Npb24oc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCB3b3JraW5nRGlyZWN0b3JpZXNbMF0pO1xuXHRcdGZvciAoY29uc3Qgd29ya2luZ0RpcmVjdG9yeSBvZiB3b3JraW5nRGlyZWN0b3JpZXMuc2xpY2UoMSkpIHtcblx0XHRcdHN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogd29ya2luZ0RpcmVjdG9yeSB9KTtcblx0XHR9XG5cdH1cblxuXHRmdW5jdGlvbiBjcmVhdGVFbnZpcm9ubWVudChyb290OiBVUkkgPSBVUkkuZmlsZSgnL3JlcG8nKSwgZ2l0U2VydmljZU92ZXJyaWRlPzogSUFnZW50SG9zdEdpdFNlcnZpY2UgJiB7IHJlYWRvbmx5IHJvb3RMb29rdXBDYWxsczogc3RyaW5nW107IHdhaXRGb3JSb290TG9va3Vwcyhjb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB9KToge1xuXHRcdHN0YXRlTWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRcdGNoYW5nZXNldHM6IFRlc3RDaGFuZ2VzZXRTZXJ2aWNlO1xuXHRcdHN1YnNjcmlwdGlvbnM6IElBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlO1xuXHRcdG1vbml0b3I6IFRlc3RGaWxlTW9uaXRvclNlcnZpY2U7XG5cdFx0Z2l0U2VydmljZTogSUFnZW50SG9zdEdpdFNlcnZpY2UgJiB7IHJlYWRvbmx5IHJvb3RMb29rdXBDYWxsczogc3RyaW5nW107IHdhaXRGb3JSb290TG9va3Vwcyhjb3VudDogbnVtYmVyKTogUHJvbWlzZTx2b2lkPiB9O1xuXHRcdGdpdFN0YXRlU2VydmljZTogVGVzdEdpdFN0YXRlU2VydmljZTtcblx0XHRjb29yZGluYXRvcjogQWdlbnRIb3N0Q2hhbmdlc2V0Q29vcmRpbmF0b3I7XG5cdFx0dXBkYXRlT3BlcmF0aW9uc0NhbGxzOiBzdHJpbmdbXTtcblx0fSB7XG5cdFx0Y29uc3Qgc3RhdGVNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCkpKTtcblx0XHRjb25zdCBsb2dTZXJ2aWNlID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY29uZmlndXJhdGlvblNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50Q29uZmlndXJhdGlvblNlcnZpY2Uoc3RhdGVNYW5hZ2VyLCBsb2dTZXJ2aWNlKSk7XG5cdFx0Y29uc3Qgc3Vic2NyaXB0aW9ucyA9IG5ldyBBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlKCk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0cyA9IG5ldyBUZXN0Q2hhbmdlc2V0U2VydmljZShzdWJzY3JpcHRpb25zKTtcblx0XHRjb25zdCBtb25pdG9yID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXN0RmlsZU1vbml0b3JTZXJ2aWNlKCkpO1xuXHRcdGNvbnN0IGdpdFNlcnZpY2UgPSBnaXRTZXJ2aWNlT3ZlcnJpZGUgPz8gY3JlYXRlR2l0U2VydmljZShyb290KTtcblx0XHRjb25zdCBnaXRTdGF0ZVNlcnZpY2UgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlc3RHaXRTdGF0ZVNlcnZpY2UoKSk7XG5cdFx0Y29uc3QgdXBkYXRlT3BlcmF0aW9uc0NhbGxzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGNvbnN0IG9wZXJhdGlvbkNvbnRyaWJ1dGlvblNlcnZpY2U6IElBZ2VudEhvc3RDaGFuZ2VzZXRPcGVyYXRpb25TZXJ2aWNlID0ge1xuXHRcdFx0X3NlcnZpY2VCcmFuZDogdW5kZWZpbmVkLFxuXHRcdFx0cmVnaXN0ZXJDb250cmlidXRpb246ICgpID0+IERpc3Bvc2FibGUuTm9uZSxcblx0XHRcdGdldE9wZXJhdGlvbnM6ICgpID0+IFtdLFxuXHRcdFx0dXBkYXRlT3BlcmF0aW9uczogKHNlc3Npb25LZXk6IHN0cmluZykgPT4geyB1cGRhdGVPcGVyYXRpb25zQ2FsbHMucHVzaChzZXNzaW9uS2V5KTsgfSxcblx0XHRcdGludm9rZUNoYW5nZXNldE9wZXJhdGlvbjogYXN5bmMgKCkgPT4gKHt9KSxcblx0XHRcdGRpc3Bvc2U6ICgpID0+IHsgfSxcblx0XHR9O1xuXHRcdGNvbnN0IGluc3RhbnRpYXRpb25TZXJ2aWNlID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBJbnN0YW50aWF0aW9uU2VydmljZShuZXcgU2VydmljZUNvbGxlY3Rpb24oXG5cdFx0XHRbSUxvZ1NlcnZpY2UsIGxvZ1NlcnZpY2VdLFxuXHRcdFx0W0lBZ2VudEhvc3RTdGF0ZU1hbmFnZXIsIHN0YXRlTWFuYWdlcl0sXG5cdFx0XHRbSUFnZW50Q29uZmlndXJhdGlvblNlcnZpY2UsIGNvbmZpZ3VyYXRpb25TZXJ2aWNlXSxcblx0XHRcdFtJQWdlbnRIb3N0Q2hhbmdlc2V0T3BlcmF0aW9uU2VydmljZSwgb3BlcmF0aW9uQ29udHJpYnV0aW9uU2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdENoYW5nZXNldFNlcnZpY2UsIGNoYW5nZXNldHNdLFxuXHRcdFx0W0lBZ2VudEhvc3RDaGFuZ2VzZXRTdWJzY3JpcHRpb25TZXJ2aWNlLCBzdWJzY3JpcHRpb25zXSxcblx0XHRcdFtJQWdlbnRIb3N0RmlsZU1vbml0b3JTZXJ2aWNlLCBtb25pdG9yXSxcblx0XHRcdFtJQWdlbnRIb3N0R2l0U2VydmljZSwgZ2l0U2VydmljZV0sXG5cdFx0XHRbSUFnZW50SG9zdEdpdFN0YXRlU2VydmljZSwgZ2l0U3RhdGVTZXJ2aWNlXSxcblx0XHQpLCAvKnN0cmljdCovIHRydWUpKTtcblx0XHRjb25zdCBjb29yZGluYXRvciA9IGRpc3Bvc2FibGVzLmFkZChpbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShBZ2VudEhvc3RDaGFuZ2VzZXRDb29yZGluYXRvcikpO1xuXHRcdHJldHVybiB7IHN0YXRlTWFuYWdlciwgY2hhbmdlc2V0cywgc3Vic2NyaXB0aW9ucywgbW9uaXRvciwgZ2l0U2VydmljZSwgZ2l0U3RhdGVTZXJ2aWNlLCBjb29yZGluYXRvciwgdXBkYXRlT3BlcmF0aW9uc0NhbGxzIH07XG5cdH1cblxuXHR0ZXN0KCdyZWZyZXNoZXMgY2hhbmdlc2V0IG9wZXJhdGlvbnMgd2hlbiBhIHNlc3Npb24gZ2FpbnMgb3IgbG9zZXMgYSB3b3JraW5nIGRpcmVjdG9yeScsICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLXdkJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sICdmaWxlOi8vL3JlcG9BJyk7XG5cdFx0Y29uc3QgYmFzZWxpbmUgPSBlbnZpcm9ubWVudC51cGRhdGVPcGVyYXRpb25zQ2FsbHMubGVuZ3RoO1xuXG5cdFx0Ly8gRWRpdG9yIFdpbmRvdyBhZGRzIGEgc2Vjb25kIHJvb3QgLT4gbXVsdGktcm9vdDogb3BlcmF0aW9ucyBtdXN0IHJlZnJlc2guXG5cdFx0ZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiAnZmlsZTovLy9yZXBvQicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC51cGRhdGVPcGVyYXRpb25zQ2FsbHMuc2xpY2UoYmFzZWxpbmUpLCBbc2Vzc2lvbl0sICdhZGRpbmcgYSByb290IHJlZnJlc2hlcyB0aGUgc2Vzc2lvbiBvcGVyYXRpb25zJyk7XG5cblx0XHQvLyBBIG5vLW9wIHdvcmtpbmctZGlyZWN0b3J5IGFjdGlvbiAoc2FtZSByb290KSBtdXN0IG5vdCByZWZyZXNoIGFnYWluLlxuXHRcdGNvbnN0IGFmdGVyQWRkID0gZW52aXJvbm1lbnQudXBkYXRlT3BlcmF0aW9uc0NhbGxzLmxlbmd0aDtcblx0XHRlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3JlcG9CJyB9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52aXJvbm1lbnQudXBkYXRlT3BlcmF0aW9uc0NhbGxzLmxlbmd0aCwgYWZ0ZXJBZGQsICdhIG5vLW9wIHdvcmtpbmctZGlyZWN0b3J5IGFjdGlvbiBkb2VzIG5vdCByZWZyZXNoJyk7XG5cblx0XHQvLyBSZW1vdmluZyB0aGUgc2Vjb25kIHJvb3QgLT4gYmFjayB0byBzaW5nbGUtcm9vdDogb3BlcmF0aW9ucyByZWZyZXNoIGFnYWluIChyZXN0b3JlKS5cblx0XHRlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiAnZmlsZTovLy9yZXBvQicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC51cGRhdGVPcGVyYXRpb25zQ2FsbHMuc2xpY2UoYWZ0ZXJBZGQpLCBbc2Vzc2lvbl0sICdyZW1vdmluZyBhIHJvb3QgcmVmcmVzaGVzIHRoZSBzZXNzaW9uIG9wZXJhdGlvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVmcmVzaGVzIGNoYW5nZXNldCBvcGVyYXRpb25zIHdoZW4gR2l0SHViIHN0YXRlIGNoYW5nZXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi1naXRodWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwbycpO1xuXHRcdGNvbnN0IGJhc2VsaW5lID0gZW52aXJvbm1lbnQudXBkYXRlT3BlcmF0aW9uc0NhbGxzLmxlbmd0aDtcblxuXHRcdGVudmlyb25tZW50LmdpdFN0YXRlU2VydmljZS5maXJlR2l0SHViU3RhdGVDaGFuZ2VkKHNlc3Npb24pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC51cGRhdGVPcGVyYXRpb25zQ2FsbHMuc2xpY2UoYmFzZWxpbmUpLCBbc2Vzc2lvbl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHBhcmVudCB3b3JraW5nLWRpcmVjdG9yeSBjaGFuZ2UgYWxzbyByZWZyZXNoZXMgaW5oZXJpdGluZyBzdWJhZ2VudCBzZXNzaW9ucycsICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLXBhcmVudCcpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRTZXNzaW9uID0gYnVpbGRTdWJhZ2VudFNlc3Npb25VcmkocGFyZW50U2Vzc2lvbiwgJ3Rvb2wtMScpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgcGFyZW50U2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwb0EnKTtcblx0XHQvLyBBIHN1YmFnZW50IHdpdGggTk8gb3duIHdvcmtpbmcgZGlyZWN0b3JpZXMgaW5oZXJpdHMgdGhlIHBhcmVudCdzIHNldCxcblx0XHQvLyBzbyBhIHBhcmVudCByb290IGNoYW5nZSBmbGlwcyBpdHMgbXVsdGktcm9vdCBzdGF0ZSB0b28uXG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHN1YmFnZW50U2Vzc2lvbik7XG5cdFx0Y29uc3QgYmFzZWxpbmUgPSBlbnZpcm9ubWVudC51cGRhdGVPcGVyYXRpb25zQ2FsbHMubGVuZ3RoO1xuXG5cdFx0ZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBhcmVudFNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiAnZmlsZTovLy9yZXBvQicgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0Wy4uLmVudmlyb25tZW50LnVwZGF0ZU9wZXJhdGlvbnNDYWxscy5zbGljZShiYXNlbGluZSldLnNvcnQoKSxcblx0XHRcdFtwYXJlbnRTZXNzaW9uLCBzdWJhZ2VudFNlc3Npb25dLnNvcnQoKSxcblx0XHRcdCdhIHBhcmVudCByb290IGNoYW5nZSByZWZyZXNoZXMgYm90aCB0aGUgcGFyZW50IGFuZCBpdHMgaW5oZXJpdGluZyBzdWJhZ2VudCcsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgnc2hhcmVzIHJvb3Qgd2F0Y2hlcnMgYWNyb3NzIHNlc3Npb25zIGFuZCBmYW5zIG91dCByb290IGNoYW5nZXMgdG8gc3RhdGljIHJlZnJlc2hlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0yJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudChyb290KTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgZmlyc3RTZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlLWEnKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vjb25kU2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZS1iJyk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UoZmlyc3RTZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlY29uZFNlc3Npb24pKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMik7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblxuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsXG5cdFx0XHRicmFuY2hSZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMuYnJhbmNoUmVmcmVzaGVzLFxuXHRcdFx0dW5jb21taXR0ZWRSZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMudW5jb21taXR0ZWRSZWZyZXNoZXMsXG5cdFx0XHRnaXRTdGF0ZVJlZnJlc2hlczogZW52aXJvbm1lbnQuZ2l0U3RhdGVTZXJ2aWNlLnJlZnJlc2hlZCxcblx0XHR9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRicmFuY2hSZWZyZXNoZXM6IFtmaXJzdFNlc3Npb25dLFxuXHRcdFx0dW5jb21taXR0ZWRSZWZyZXNoZXM6IFtzZWNvbmRTZXNzaW9uXSxcblx0XHRcdGdpdFN0YXRlUmVmcmVzaGVzOiBbZmlyc3RTZXNzaW9uLCBzZWNvbmRTZXNzaW9uXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVsZWFzZXMgYSByb290IHdhdGNoZXIgYWZ0ZXIgdGhlIGxhc3QgaW50ZXJlc3RlZCBzZXNzaW9uIHVuc3Vic2NyaWJlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBmaXJzdFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3Qgc2Vjb25kU2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0yJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIGZpcnN0U2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZS1hJyk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlY29uZFNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUtYicpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGZpcnN0U2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UoYnVpbGRVbmNvbW1pdHRlZENoYW5nZXNldFVyaShzZWNvbmRTZXNzaW9uKSkpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uTGFzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGZpcnN0U2Vzc2lvbikpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52aXJvbm1lbnQubW9uaXRvci5kaXNwb3NhbHMsIFtdKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkxhc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlY29uZFNlc3Npb24pKSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscywgWydmaWxlOi8vL3JlcG8nXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F0dGFjaGVzIGRlZmVycmVkIHdhdGNoIGludGVyZXN0IG9uIG1hdGVyaWFsaXphdGlvbiB3aXRob3V0IHJlLXF1ZXJ5aW5nIGFuIHVuY2hhbmdlZCByb290JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCgpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCB1bmRlZmluZWQsIGZhbHNlKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShidWlsZFVuY29tbWl0dGVkQ2hhbmdlc2V0VXJpKHNlc3Npb24pKSk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCByb290TG9va3VwczogZW52aXJvbm1lbnQuZ2l0U2VydmljZS5yb290TG9va3VwQ2FsbHMgfSwgeyBhY3F1aXNpdGlvbnM6IFtdLCByb290TG9va3VwczogW10gfSk7XG5cblx0XHRjb25zdCBzdW1tYXJ5ID0gZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb24pITtcblx0XHRlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIubWFya1Nlc3Npb25QZXJzaXN0ZWQoc2Vzc2lvbiwgeyAuLi5zdW1tYXJ5LCB3b3JraW5nRGlyZWN0b3JpZXM6IFsnZmlsZTovLy9yZXBvL3dvcmt0cmVlJ10gfSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uTWF0ZXJpYWxpemVkKHNlc3Npb24pO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvbk1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucywgcm9vdExvb2t1cHM6IGVudmlyb25tZW50LmdpdFNlcnZpY2Uucm9vdExvb2t1cENhbGxzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdHJvb3RMb29rdXBzOiBbJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZSddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3J3YXJkcyBzZXNzaW9uIGNoYW5nZXNldCByZWZyZXNoIHRvIHRoZSBjaGFuZ2VzZXQgc2VydmljZSBhbmQgZHJhaW5zIHBlbmRpbmcgd29yayBvbiBtYXRlcmlhbGl6YXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KCk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uKSkpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGNvbnN0IHN1bW1hcnkgPSBlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIuZ2V0U2Vzc2lvblN1bW1hcnkoc2Vzc2lvbikhO1xuXHRcdGVudmlyb25tZW50LnN0YXRlTWFuYWdlci5tYXJrU2Vzc2lvblBlcnNpc3RlZChzZXNzaW9uLCB7IC4uLnN1bW1hcnksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3JlcG8vd29ya3RyZWUnXSB9KTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25NYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzZXNzaW9uUmVmcmVzaGVzOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnNlc3Npb25SZWZyZXNoZXMsXG5cdFx0XHR3b3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLndvcmtpbmdEaXJlY3RvcnlBdmFpbGFibGUsXG5cdFx0fSwge1xuXHRcdFx0c2Vzc2lvblJlZnJlc2hlczogW3Nlc3Npb25dLFxuXHRcdFx0d29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZTogW3Nlc3Npb25dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdleHBvc2VzIHN1YnNjcmlwdGlvbnMgYW5kIGRyb3BzIHRoZW0gd2hlbiB0aGUgbGFzdCBzdWJzY3JpYmVyIGxlYXZlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvbik7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIHVuZGVmaW5lZCwgZmFsc2UpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKGNoYW5nZXNldCkpO1xuXHRcdGNvbnN0IHN1YnNjcmliZWQgPSBbLi4uZW52aXJvbm1lbnQuc3Vic2NyaXB0aW9ucy5nZXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhzZXNzaW9uKV07XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkxhc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShjaGFuZ2VzZXQpKTtcblx0XHRjb25zdCBhZnRlclVuc3Vic2NyaWJlID0gWy4uLmVudmlyb25tZW50LnN1YnNjcmlwdGlvbnMuZ2V0U2Vzc2lvblN1YnNjcmlwdGlvbnMoc2Vzc2lvbildO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN1YnNjcmliZWQsIGFmdGVyVW5zdWJzY3JpYmUgfSwge1xuXHRcdFx0c3Vic2NyaWJlZDogW2NoYW5nZXNldF0sXG5cdFx0XHRhZnRlclVuc3Vic2NyaWJlOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgYXR0YWNoIHJvb3Qgc3RhdGUgd2hlbiB3YXRjaGVyIGFjcXVpc2l0aW9uIGZhaWxzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCgpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlJyk7XG5cblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZhaWxBY3F1aXJlID0gdHJ1ZTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDEpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUoVVJJLmZpbGUoJy9yZXBvJykpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCByZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMudW5jb21taXR0ZWRSZWZyZXNoZXMgfSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbJ2ZpbGU6Ly8vcmVwbyddLFxuXHRcdFx0cmVmcmVzaGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIHR1cm4gc3VzcGVuZHMgYW5kIHJlc3VtZXMgcm9vdCB3YXRjaGVyIHdoZW4gaW50ZXJlc3QgcmVtYWlucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHJvb3QpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlJyk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZXNzaW9uLCB0cnVlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygyKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZXNzaW9uLCBmYWxzZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDIpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShyb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucywgZGlzcG9zYWxzOiBlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscywgcmVmcmVzaGVzOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnVuY29tbWl0dGVkUmVmcmVzaGVzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nLCAnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRkaXNwb3NhbHM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRyZWZyZXNoZXM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmUgc2Vzc2lvbiBzaGFyaW5nIGEgcm9vdCBzdXNwZW5kcyB3YXRjaGVyIGZvciBvdGhlciBzdWJzY3JpYmVkIHNlc3Npb25zJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGZpcnN0U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZWNvbmRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3QgPSBVUkkuZmlsZSgnL3JlcG8nKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHJvb3QpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBmaXJzdFNlc3Npb24sICdmaWxlOi8vL3JlcG8vd29ya3RyZWUtYScpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZWNvbmRTZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlLWInKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShmaXJzdFNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlY29uZFNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygyKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vjb25kU2Vzc2lvbiwgdHJ1ZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMyk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vjb25kU2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygyKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsIGRpc3Bvc2FsczogZW52aXJvbm1lbnQubW9uaXRvci5kaXNwb3NhbHMsIHVuY29tbWl0dGVkUmVmcmVzaGVzOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnVuY29tbWl0dGVkUmVmcmVzaGVzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nLCAnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRkaXNwb3NhbHM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHR1bmNvbW1pdHRlZFJlZnJlc2hlczogW10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSBzdWJhZ2VudCBtYXBzIHRvIHBhcmVudCByb290IGFuZCBzdXNwZW5kcyB3YXRjaGVyIHVudGlsIHN1YmFnZW50IGNvbXBsZXRlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBwYXJlbnRTZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHN1YmFnZW50U2Vzc2lvbiA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFNlc3Npb24sICd0b29sLTEnKTtcblx0XHRjb25zdCByb290ID0gVVJJLmZpbGUoJy9yZXBvJyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudChyb290KTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgcGFyZW50U2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZScpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzdWJhZ2VudFNlc3Npb24sIHVuZGVmaW5lZCk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2UocGFyZW50U2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzdWJhZ2VudFNlc3Npb24sIHRydWUpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLmNsZWFyUmVmcmVzaGVzKCk7XG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHN1YmFnZW50U2Vzc2lvbiwgZmFsc2UpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygyKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsIGRpc3Bvc2FsczogZW52aXJvbm1lbnQubW9uaXRvci5kaXNwb3NhbHMsIHJlZnJlc2hlczogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy51bmNvbW1pdHRlZFJlZnJlc2hlcyB9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFsnZmlsZTovLy9yZXBvJywgJ2ZpbGU6Ly8vcmVwbyddLFxuXHRcdFx0ZGlzcG9zYWxzOiBbJ2ZpbGU6Ly8vcmVwbyddLFxuXHRcdFx0cmVmcmVzaGVzOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHVybiBlbmRpbmcgYWZ0ZXIgdW5zdWJzY3JpYmUgb3IgZGlzcG9zZSBkb2VzIG5vdCByZWF0dGFjaCB3YXRjaGVyJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCgpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCAnZmlsZTovLy9yZXBvL3dvcmt0cmVlJyk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25UdXJuQWN0aXZlQ2hhbmdlZChzZXNzaW9uLCB0cnVlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygyKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25MYXN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvbkRpc3Bvc2VkKHNlc3Npb24pO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWNxdWlzaXRpb25zOiBlbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9ucywgZGlzcG9zYWxzOiBlbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2FscyB9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0XHRkaXNwb3NhbHM6IFsnZmlsZTovLy9yZXBvJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dhdGNoZXMgZXZlcnkgZ2l0IHJlcG9zaXRvcnkgcm9vdCBpbiBhIG11bHRpLXJvb3Qgc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQScpO1xuXHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQicpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQodW5kZWZpbmVkLCBjcmVhdGVSb3V0aW5nR2l0U2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtyb290QS50b1N0cmluZygpLCByb290QV0sXG5cdFx0XHRbcm9vdEIudG9TdHJpbmcoKSwgcm9vdEJdLFxuXHRcdF0pKSk7XG5cdFx0Y3JlYXRlTXVsdGlSb290U2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIFtyb290QS50b1N0cmluZygpLCByb290Qi50b1N0cmluZygpXSk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygyKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoWy4uLmVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zXS5zb3J0KCksIFtyb290QS50b1N0cmluZygpLCByb290Qi50b1N0cmluZygpXS5zb3J0KCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHNlY29uZGFyeS1yb290IGV4dGVybmFsIGVkaXQgcmVmcmVzaGVzIHRoZSBzdW1tYXJ5IHVzaW5nIHRoZSBwcmltYXJ5IHdvcmtpbmcgZGlyZWN0b3J5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tMScpLnRvU3RyaW5nKCk7XG5cdFx0Y29uc3QgcHJpbWFyeVJvb3QgPSBVUkkuZmlsZSgnL3Byb2plY3RzL3JlcG9BJyk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5Um9vdCA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcHJpbWFyeVJvb3QudG9TdHJpbmcoKSwgcHJpbWFyeVJvb3RdLFxuXHRcdFx0W3NlY29uZGFyeVJvb3QudG9TdHJpbmcoKSwgc2Vjb25kYXJ5Um9vdF0sXG5cdFx0XSkpKTtcblx0XHRjcmVhdGVNdWx0aVJvb3RTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgW3ByaW1hcnlSb290LnRvU3RyaW5nKCksIHNlY29uZGFyeVJvb3QudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXG5cdFx0Ly8gQW4gZXh0ZXJuYWwgZWRpdCBpbiB0aGUgU0VDT05EQVJZIHJlcG8gbXVzdCByZWZyZXNoIHRoZSBhbGwtZm9sZGVyXG5cdFx0Ly8gc3VtbWFyeSwgc291cmNpbmcgZ2l0IHN0YXRlIGZyb20gdGhlIFBSSU1BUlkgd29ya2luZyBkaXJlY3RvcnkgKG5ldmVyXG5cdFx0Ly8gdGhlIHNlY29uZGFyeSByb290IHRoYXQgY2hhbmdlZCkuXG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHNlY29uZGFyeVJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVmcmVzaGVkV2l0aDogZW52aXJvbm1lbnQuZ2l0U3RhdGVTZXJ2aWNlLnJlZnJlc2hlZFdpdGgsXG5cdFx0XHRyZWNvbXB1dGVkOiBlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnJlY29tcHV0ZWQsXG5cdFx0XHRicmFuY2hSZWZyZXNoZXM6IGVudmlyb25tZW50LmNoYW5nZXNldHMuYnJhbmNoUmVmcmVzaGVzLFxuXHRcdH0sIHtcblx0XHRcdHJlZnJlc2hlZFdpdGg6IFt7IHNlc3Npb25LZXk6IHNlc3Npb24sIHdvcmtpbmdEaXJlY3Rvcnk6IHByaW1hcnlSb290LnRvU3RyaW5nKCkgfV0sXG5cdFx0XHRyZWNvbXB1dGVkOiBbc2Vzc2lvbl0sXG5cdFx0XHRicmFuY2hSZWZyZXNoZXM6IFtzZXNzaW9uXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnYSB0dXJuIHN1c3BlbmRzIGFuZCByZS1hdHRhY2hlcyBldmVyeSByZXBvc2l0b3J5IHJvb3QnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vzc2lvbiwgdHJ1ZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMyk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb24sIGZhbHNlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoNCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjcXVpc2l0aW9uczogWy4uLmVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zXS5zb3J0KCksXG5cdFx0XHRkaXNwb3NhbHM6IFsuLi5lbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2Fsc10uc29ydCgpLFxuXHRcdH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogW3Jvb3RBLnRvU3RyaW5nKCksIHJvb3RBLnRvU3RyaW5nKCksIHJvb3RCLnRvU3RyaW5nKCksIHJvb3RCLnRvU3RyaW5nKCldLnNvcnQoKSxcblx0XHRcdGRpc3Bvc2FsczogW3Jvb3RBLnRvU3RyaW5nKCksIHJvb3RCLnRvU3RyaW5nKCldLnNvcnQoKSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGVkdXBsaWNhdGVzIHdvcmtpbmcgZGlyZWN0b3JpZXMgdGhhdCByZXNvbHZlIHRvIHRoZSBzYW1lIHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzaGFyZWRSb290ID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9tb25vJyk7XG5cdFx0Y29uc3QgZGlyQSA9ICdmaWxlOi8vL3Byb2plY3RzL21vbm8vcGFja2FnZXMvYSc7XG5cdFx0Y29uc3QgZGlyQiA9ICdmaWxlOi8vL3Byb2plY3RzL21vbm8vcGFja2FnZXMvYic7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCh1bmRlZmluZWQsIGNyZWF0ZVJvdXRpbmdHaXRTZXJ2aWNlKG5ldyBNYXAoW1xuXHRcdFx0W2RpckEsIHNoYXJlZFJvb3RdLFxuXHRcdFx0W2RpckIsIHNoYXJlZFJvb3RdLFxuXHRcdF0pKSk7XG5cdFx0Y3JlYXRlTXVsdGlSb290U2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIFtkaXJBLCBkaXJCXSk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsIFtzaGFyZWRSb290LnRvU3RyaW5nKCldKTtcblx0fSk7XG5cblx0dGVzdCgncmVsZWFzZXMgZXZlcnkgcmVwb3NpdG9yeSByb290IHdoZW4gdGhlIGxhc3Qgc3Vic2NyaWJlciBsZWF2ZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25MYXN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbikpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbLi4uZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnNdLnNvcnQoKSxcblx0XHRcdGRpc3Bvc2FsczogWy4uLmVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzXS5zb3J0KCksXG5cdFx0fSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0uc29ydCgpLFxuXHRcdFx0ZGlzcG9zYWxzOiBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0uc29ydCgpLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd3YXRjaGVzIHNlY29uZGFyeSBnaXQgcmVwb3NpdG9yaWVzIGV2ZW4gd2hlbiB0aGUgcHJpbWFyeSBmb2xkZXIgaXMgbm90IGEgZ2l0IHJlcG9zaXRvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBub25HaXRQcmltYXJ5ID0gJ2ZpbGU6Ly8vcHJvamVjdHMnO1xuXHRcdGNvbnN0IHNlY29uZGFyeVJvb3QgPSBVUkkuZmlsZSgnL3Byb2plY3RzL3JlcG9CJyk7XG5cdFx0Y29uc3QgZW52aXJvbm1lbnQgPSBjcmVhdGVFbnZpcm9ubWVudCh1bmRlZmluZWQsIGNyZWF0ZVJvdXRpbmdHaXRTZXJ2aWNlKG5ldyBNYXA8c3RyaW5nLCBVUkkgfCB1bmRlZmluZWQ+KFtcblx0XHRcdFtub25HaXRQcmltYXJ5LCB1bmRlZmluZWRdLFxuXHRcdFx0W3NlY29uZGFyeVJvb3QudG9TdHJpbmcoKSwgc2Vjb25kYXJ5Um9vdF0sXG5cdFx0XSkpKTtcblx0XHRjcmVhdGVNdWx0aVJvb3RTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgW25vbkdpdFByaW1hcnksIHNlY29uZGFyeVJvb3QudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMSk7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXHRcdGVudmlyb25tZW50Lm1vbml0b3IuZmlyZShzZWNvbmRhcnlSb290KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjcXVpc2l0aW9uczogZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnMsXG5cdFx0XHRyZWZyZXNoZWRXaXRoOiBlbnZpcm9ubWVudC5naXRTdGF0ZVNlcnZpY2UucmVmcmVzaGVkV2l0aCxcblx0XHRcdHJlY29tcHV0ZWQ6IGVudmlyb25tZW50LmNoYW5nZXNldHMucmVjb21wdXRlZCxcblx0XHR9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFtzZWNvbmRhcnlSb290LnRvU3RyaW5nKCldLFxuXHRcdFx0cmVmcmVzaGVkV2l0aDogW3sgc2Vzc2lvbktleTogc2Vzc2lvbiwgd29ya2luZ0RpcmVjdG9yeTogbm9uR2l0UHJpbWFyeSB9XSxcblx0XHRcdHJlY29tcHV0ZWQ6IFtzZXNzaW9uXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVmcmVzaCBmcm9tIGFueSByb290IHdoaWxlIGEgdHVybiBpcyBhY3RpdmUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vzc2lvbiwgdHJ1ZSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQuZ2l0U2VydmljZS53YWl0Rm9yUm9vdExvb2t1cHMoMyk7XG5cdFx0YXdhaXQgdGljaygpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblxuXHRcdC8vIFdoaWxlIHRoZSB0dXJuIHJ1bnMsIGV2ZXJ5IHJvb3Qgd2F0Y2hlciBpcyByZWxlYXNlZDsgZXh0ZXJuYWwgZWRpdHMgdG9cblx0XHQvLyBhbnkgcm9vdCBtdXN0IG5vdCB0cmlnZ2VyIGEgbWlkLXR1cm4gcmVmcmVzaCAodHVybiBlZGl0cyBhcmUgY2FwdHVyZWRcblx0XHQvLyBieSB0aGUgdHVybiBsaWZlY3ljbGUgaW5zdGVhZCkuXG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHJvb3RBKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdEIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmVjb21wdXRlZDogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5yZWNvbXB1dGVkLFxuXHRcdFx0cmVmcmVzaGVkOiBlbnZpcm9ubWVudC5naXRTdGF0ZVNlcnZpY2UucmVmcmVzaGVkLFxuXHRcdH0sIHtcblx0XHRcdHJlY29tcHV0ZWQ6IFtdLFxuXHRcdFx0cmVmcmVzaGVkOiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVmcmVzaCBhbiBpZGxlIHNlc3Npb24gc2hhcmluZyBhIHNlY29uZGFyeSByb290IHdoaWxlIGFub3RoZXIgc2Vzc2lvbiBydW5zIGEgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uQSA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi1hJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzZXNzaW9uQiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi1iJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzaGFyZWRSb290ID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9zaGFyZWQnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbc2hhcmVkUm9vdC50b1N0cmluZygpLCBzaGFyZWRSb290XSxcblx0XHRcdFtyb290Qi50b1N0cmluZygpLCByb290Ql0sXG5cdFx0XSkpKTtcblx0XHQvLyBBJ3MgcHJpbWFyeSBpcyB0aGUgc2hhcmVkIHJlcG87IEIgd2F0Y2hlcyB0aGUgc2hhcmVkIHJlcG8gYXMgYSBzZWNvbmRhcnkuXG5cdFx0Y3JlYXRlTXVsdGlSb290U2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb25BLCBbc2hhcmVkUm9vdC50b1N0cmluZygpXSk7XG5cdFx0Y3JlYXRlTXVsdGlSb290U2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb25CLCBbcm9vdEIudG9TdHJpbmcoKSwgc2hhcmVkUm9vdC50b1N0cmluZygpXSk7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbkEpKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc2Vzc2lvbkIpKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uVHVybkFjdGl2ZUNoYW5nZWQoc2Vzc2lvbkEsIHRydWUpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50LmdpdFNlcnZpY2Uud2FpdEZvclJvb3RMb29rdXBzKDQpO1xuXHRcdGF3YWl0IHRpY2soKTtcblx0XHRlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLmNsZWFyUmVmcmVzaGVzKCk7XG5cblx0XHQvLyBXaGlsZSBBIHJ1bnMgYSB0dXJuIHRoZSBzaGFyZWQgcm9vdCBpcyBhY3RpdmUsIHNvIGFuIGV4dGVybmFsIGVkaXRcblx0XHQvLyB0aGVyZSBtdXN0IE5PVCByZWZyZXNoIHRoZSBpZGxlIHNoYXJlciBCIChkb2N1bWVudGVkLCBhY2NlcHRlZFxuXHRcdC8vIHNoYXJlZC1yb290IHN1c3BlbnNpb24gXHUyMDE0IGRlY2lzaW9uIEQ0KS5cblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUoc2hhcmVkUm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnJlY29tcHV0ZWQsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZGlzcG9zaW5nIGEgc2Vzc2lvbiB3aXRoIGEgbGl2ZSBicmFuY2ggc3Vic2NyaXB0aW9uIGNsZWFycyB3YXRjaCBpbnRlcmVzdCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQoKTtcblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgc2Vzc2lvbiwgJ2ZpbGU6Ly8vcmVwby93b3JrdHJlZScpO1xuXG5cdFx0Ly8gU3Vic2NyaWJlIHZpYSB0aGUgQlJBTkNIIGNoYW5nZXNldCBVUkkgKHRyYWNrcyB0aGUgYnJhbmNoIHN1YnNjcmlwdGlvbiBrZXkpLlxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShidWlsZEJyYW5jaENoYW5nZXNldFVyaShzZXNzaW9uKSkpO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygxKTtcblxuXHRcdC8vIEFuIGFicnVwdCBkaXNwb3NlIChubyBvbkxhc3RTdWJzY3JpYmVyKSBtdXN0IGNsZWFyIHRoZSBicmFuY2ggd2F0Y2hcblx0XHQvLyBpbnRlcmVzdCwgc28gYSBsYXRlciBtYXRlcmlhbGl6YXRpb24gcmV0cnkgY2Fubm90IHJlc3VycmVjdCBhIHdhdGNoZXIuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uRGlzcG9zZWQoc2Vzc2lvbik7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25TZXNzaW9uTWF0ZXJpYWxpemVkKHNlc3Npb24pO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBhY3F1aXNpdGlvbnM6IGVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zLCBkaXNwb3NhbHM6IGVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzIH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHRcdGRpc3Bvc2FsczogWydmaWxlOi8vL3JlcG8nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZGV0YWNoZXMgYSByZXBvc2l0b3J5IHJvb3Qgd2F0Y2hlciB3aGVuIGEgc2Vzc2lvbiBzdG9wcyByZXNvbHZpbmcgdG8gaXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cblx0XHQvLyByZXBvQiBkcm9wcyBvdXQgb2YgdGhlIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yaWVzOyB0aGUgbmV4dFxuXHRcdC8vIHJlLWF0dGFjaCBtdXN0IGRldGFjaCBhbmQgZGlzcG9zZSBvbmx5IHJlcG9CJ3Mgd2F0Y2hlci5cblx0XHRlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbiwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiByb290Qi50b1N0cmluZygpIH0pO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvbk1hdGVyaWFsaXplZChzZXNzaW9uKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3VwcygzKTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjcXVpc2l0aW9uczogWy4uLmVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zXS5zb3J0KCksXG5cdFx0XHRkaXNwb3NhbHM6IGVudmlyb25tZW50Lm1vbml0b3IuZGlzcG9zYWxzLFxuXHRcdH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogW3Jvb3RBLnRvU3RyaW5nKCksIHJvb3RCLnRvU3RyaW5nKCldLnNvcnQoKSxcblx0XHRcdGRpc3Bvc2FsczogW3Jvb3RCLnRvU3RyaW5nKCldLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBhIHNoYXJlZCBzZWNvbmRhcnkgcm9vdCB3YXRjaGVkIGZvciBhbiBpZGxlIHNlc3Npb24gd2hpbGUgYW5vdGhlciBzZXNzaW9uIHJ1bnMgYSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb25BID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLWEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHNlc3Npb25CID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLWInKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQScpO1xuXHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQicpO1xuXHRcdGNvbnN0IHNoYXJlZFJvb3QgPSBVUkkuZmlsZSgnL3Byb2plY3RzL3NoYXJlZCcpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQodW5kZWZpbmVkLCBjcmVhdGVSb3V0aW5nR2l0U2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtyb290QS50b1N0cmluZygpLCByb290QV0sXG5cdFx0XHRbcm9vdEIudG9TdHJpbmcoKSwgcm9vdEJdLFxuXHRcdFx0W3NoYXJlZFJvb3QudG9TdHJpbmcoKSwgc2hhcmVkUm9vdF0sXG5cdFx0XSkpKTtcblx0XHQvLyBUaGUgc2hhcmVkIHJlcG8gaXMgYSBTRUNPTkRBUlkgcm9vdCBmb3IgQSAocHJpbWFyeSByZXBvQSkgYW5kIGZvciBCLlxuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uQSwgW3Jvb3RBLnRvU3RyaW5nKCksIHNoYXJlZFJvb3QudG9TdHJpbmcoKV0pO1xuXHRcdGNyZWF0ZU11bHRpUm9vdFNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uQiwgW3Jvb3RCLnRvU3RyaW5nKCksIHNoYXJlZFJvb3QudG9TdHJpbmcoKV0pO1xuXG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb25BKSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb25CKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDMpO1xuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uU2Vzc2lvblR1cm5BY3RpdmVDaGFuZ2VkKHNlc3Npb25BLCB0cnVlKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5naXRTZXJ2aWNlLndhaXRGb3JSb290TG9va3Vwcyg1KTtcblx0XHRhd2FpdCB0aWNrKCk7XG5cdFx0ZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5jbGVhclJlZnJlc2hlcygpO1xuXG5cdFx0Ly8gQSdzIGFjdGl2ZSByb290IGlzIGl0cyBQUklNQVJZIChyZXBvQSk7IHRoZSBzaGFyZWQgc2Vjb25kYXJ5IHN0YXlzXG5cdFx0Ly8gd2F0Y2hlZCBmb3IgdGhlIGlkbGUgc2hhcmVyIEIsIHNvIGFuIGVkaXQgdGhlcmUgc3RpbGwgcmVmcmVzaGVzIEIgKEQ0KS5cblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUoc2hhcmVkUm9vdCk7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChlbnZpcm9ubWVudC5jaGFuZ2VzZXRzLnJlY29tcHV0ZWQsIFtzZXNzaW9uQl0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXRyaWVzIGEgcmVwb3NpdG9yeSByb290IHdob3NlIHdhdGNoZXIgYWNxdWlzaXRpb24gZmFpbGVkIG9uIHRoZSBuZXh0IHJlLWF0dGFjaCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnbW9jaycsICdzZXNzaW9uLTEnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHJvb3RBID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQScpO1xuXHRcdGNvbnN0IHJvb3RCID0gVVJJLmZpbGUoJy9wcm9qZWN0cy9yZXBvQicpO1xuXHRcdGNvbnN0IGVudmlyb25tZW50ID0gY3JlYXRlRW52aXJvbm1lbnQodW5kZWZpbmVkLCBjcmVhdGVSb3V0aW5nR2l0U2VydmljZShuZXcgTWFwKFtcblx0XHRcdFtyb290QS50b1N0cmluZygpLCByb290QV0sXG5cdFx0XHRbcm9vdEIudG9TdHJpbmcoKSwgcm9vdEJdLFxuXHRcdF0pKSk7XG5cdFx0Y3JlYXRlTXVsdGlSb290U2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHNlc3Npb24sIFtyb290QS50b1N0cmluZygpLCByb290Qi50b1N0cmluZygpXSk7XG5cblx0XHQvLyByZXBvQidzIHdhdGNoZXIgYWNxdWlzaXRpb24gZmFpbHMgb24gdGhlIGZpcnN0IGF0dGVtcHQuXG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5mYWlsQWNxdWlyZUZvci5hZGQocm9vdEIudG9TdHJpbmcoKSk7XG5cdFx0ZW52aXJvbm1lbnQuY29vcmRpbmF0b3Iub25GaXJzdFN1YnNjcmliZXIoVVJJLnBhcnNlKHNlc3Npb24pKTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cdFx0YXdhaXQgdGljaygpO1xuXG5cdFx0Ly8gVGhlIGZhaWx1cmUgY2xlYXJzOyBhIHJlLWF0dGFjaCBtdXN0IHJldHJ5IHJlcG9CIChub3Qgc2hvcnQtY2lyY3VpdCBvblxuXHRcdC8vIGEgY2FjaGVkIHNpZ25hdHVyZSkgc28gYW4gZWRpdCB0aGVyZSB0aGVuIHJlZnJlc2hlcyB0aGUgc3VtbWFyeS5cblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZhaWxBY3F1aXJlRm9yLmRlbGV0ZShyb290Qi50b1N0cmluZygpKTtcblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vblNlc3Npb25NYXRlcmlhbGl6ZWQoc2Vzc2lvbik7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDMpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblx0XHRlbnZpcm9ubWVudC5tb25pdG9yLmZpcmUocm9vdEIpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbLi4uZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnNdLnNvcnQoKSxcblx0XHRcdHJlY29tcHV0ZWQ6IGVudmlyb25tZW50LmNoYW5nZXNldHMucmVjb21wdXRlZCxcblx0XHR9LCB7XG5cdFx0XHRhY3F1aXNpdGlvbnM6IFtyb290QS50b1N0cmluZygpLCByb290Qi50b1N0cmluZygpLCByb290Qi50b1N0cmluZygpXS5zb3J0KCksXG5cdFx0XHRyZWNvbXB1dGVkOiBbc2Vzc2lvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWF0dGFjaGVzIHJvb3Qgd2F0Y2hlcnMgd2hlbiBhIHdvcmtpbmcgZGlyZWN0b3J5IGlzIGFkZGVkIG9yIHJlbW92ZWQgbWlkLXNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi0xJykudG9TdHJpbmcoKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdGNyZWF0ZVNlc3Npb24oZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLCBzZXNzaW9uLCByb290QS50b1N0cmluZygpKTtcblxuXHRcdGVudmlyb25tZW50LmNvb3JkaW5hdG9yLm9uRmlyc3RTdWJzY3JpYmVyKFVSSS5wYXJzZShzZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXG5cdFx0Ly8gQWRkaW5nIGEgc2Vjb25kIHJvb3QgbWlkLXNlc3Npb24gbXVzdCBzdGFydCB3YXRjaGluZyBpdCAobm8gbGlmZWN5Y2xlXG5cdFx0Ly8gZXZlbnQgcmVxdWlyZWQpIHNvIGV4dGVybmFsIGVkaXRzIHRoZXJlIHJlZnJlc2ggdGhlIHN1bW1hcnkuXG5cdFx0ZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiByb290Qi50b1N0cmluZygpIH0pO1xuXHRcdGF3YWl0IGVudmlyb25tZW50Lm1vbml0b3Iud2FpdEZvckFjcXVpc2l0aW9ucygyKTtcblxuXHRcdC8vIFJlbW92aW5nIGl0IGFnYWluIG11c3Qgc3RvcCB3YXRjaGluZyB0aGF0IHJvb3QuXG5cdFx0ZW52aXJvbm1lbnQuc3RhdGVNYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24sIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVJlbW92ZWQsIGRpcmVjdG9yeTogcm9vdEIudG9TdHJpbmcoKSB9KTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JEaXNwb3NhbHMoMSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjcXVpc2l0aW9uczogWy4uLmVudmlyb25tZW50Lm1vbml0b3IuYWNxdWlzaXRpb25zXS5zb3J0KCksXG5cdFx0XHRkaXNwb3NhbHM6IFsuLi5lbnZpcm9ubWVudC5tb25pdG9yLmRpc3Bvc2Fsc10sXG5cdFx0fSwge1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0uc29ydCgpLFxuXHRcdFx0ZGlzcG9zYWxzOiBbcm9vdEIudG9TdHJpbmcoKV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Egc3ViYWdlbnQgaW5oZXJpdGluZyBhIG11bHRpLXJvb3QgcGFyZW50IHdhdGNoZXMgZXZlcnkgcGFyZW50IHJvb3QgYW5kIHJlZnJlc2hlcyB2aWEgdGhlIHBhcmVudCBwcmltYXJ5JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcmVudFNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdtb2NrJywgJ3Nlc3Npb24tcGFyZW50JykudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzdWJhZ2VudFNlc3Npb24gPSBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnRTZXNzaW9uLCAndG9vbC0xJyk7XG5cdFx0Y29uc3QgcHJpbWFyeVJvb3QgPSBVUkkuZmlsZSgnL3Byb2plY3RzL3JlcG9BJyk7XG5cdFx0Y29uc3Qgc2Vjb25kYXJ5Um9vdCA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcHJpbWFyeVJvb3QudG9TdHJpbmcoKSwgcHJpbWFyeVJvb3RdLFxuXHRcdFx0W3NlY29uZGFyeVJvb3QudG9TdHJpbmcoKSwgc2Vjb25kYXJ5Um9vdF0sXG5cdFx0XSkpKTtcblx0XHRjcmVhdGVNdWx0aVJvb3RTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgcGFyZW50U2Vzc2lvbiwgW3ByaW1hcnlSb290LnRvU3RyaW5nKCksIHNlY29uZGFyeVJvb3QudG9TdHJpbmcoKV0pO1xuXHRcdC8vIFRoZSBzdWJhZ2VudCBoYXMgTk8gb3duIHdvcmtpbmcgZGlyZWN0b3JpZXMsIHNvIGl0IGluaGVyaXRzIHRoZSBwYXJlbnQncyBzZXQuXG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHN1YmFnZW50U2Vzc2lvbik7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc3ViYWdlbnRTZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDIpO1xuXHRcdGVudmlyb25tZW50LmNoYW5nZXNldHMuY2xlYXJSZWZyZXNoZXMoKTtcblxuXHRcdC8vIEFuIGV4dGVybmFsIGVkaXQgaW4gdGhlIHBhcmVudCdzIFNFQ09OREFSWSByZXBvIHJlZnJlc2hlcyB0aGUgc3ViYWdlbnQsXG5cdFx0Ly8gc291cmNpbmcgZ2l0IHN0YXRlIGZyb20gdGhlIHBhcmVudCdzIFBSSU1BUlkgd29ya2luZyBkaXJlY3RvcnkuXG5cdFx0ZW52aXJvbm1lbnQubW9uaXRvci5maXJlKHNlY29uZGFyeVJvb3QpO1xuXHRcdGF3YWl0IHRpY2soKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0YWNxdWlzaXRpb25zOiBbLi4uZW52aXJvbm1lbnQubW9uaXRvci5hY3F1aXNpdGlvbnNdLnNvcnQoKSxcblx0XHRcdHJlZnJlc2hlZFdpdGg6IGVudmlyb25tZW50LmdpdFN0YXRlU2VydmljZS5yZWZyZXNoZWRXaXRoLFxuXHRcdFx0cmVjb21wdXRlZDogZW52aXJvbm1lbnQuY2hhbmdlc2V0cy5yZWNvbXB1dGVkLFxuXHRcdH0sIHtcblx0XHRcdGFjcXVpc2l0aW9uczogW3ByaW1hcnlSb290LnRvU3RyaW5nKCksIHNlY29uZGFyeVJvb3QudG9TdHJpbmcoKV0uc29ydCgpLFxuXHRcdFx0cmVmcmVzaGVkV2l0aDogW3sgc2Vzc2lvbktleTogc3ViYWdlbnRTZXNzaW9uLCB3b3JraW5nRGlyZWN0b3J5OiBwcmltYXJ5Um9vdC50b1N0cmluZygpIH1dLFxuXHRcdFx0cmVjb21wdXRlZDogW3N1YmFnZW50U2Vzc2lvbl0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlLWF0dGFjaGVzIGFuIGluaGVyaXRpbmcgc3ViYWdlbnQgd2hlbiB0aGUgcGFyZW50IGdhaW5zIGEgd29ya2luZyBkaXJlY3RvcnkgbWlkLXNlc3Npb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGFyZW50U2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ21vY2snLCAnc2Vzc2lvbi1wYXJlbnQnKS50b1N0cmluZygpO1xuXHRcdGNvbnN0IHN1YmFnZW50U2Vzc2lvbiA9IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHBhcmVudFNlc3Npb24sICd0b29sLTEnKTtcblx0XHRjb25zdCByb290QSA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0EnKTtcblx0XHRjb25zdCByb290QiA9IFVSSS5maWxlKCcvcHJvamVjdHMvcmVwb0InKTtcblx0XHRjb25zdCBlbnZpcm9ubWVudCA9IGNyZWF0ZUVudmlyb25tZW50KHVuZGVmaW5lZCwgY3JlYXRlUm91dGluZ0dpdFNlcnZpY2UobmV3IE1hcChbXG5cdFx0XHRbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEFdLFxuXHRcdFx0W3Jvb3RCLnRvU3RyaW5nKCksIHJvb3RCXSxcblx0XHRdKSkpO1xuXHRcdC8vIFRoZSBwYXJlbnQgc3RhcnRzIHNpbmdsZS1yb290OyB0aGUgc3ViYWdlbnQgaW5oZXJpdHMgaXRzIHNldC5cblx0XHRjcmVhdGVTZXNzaW9uKGVudmlyb25tZW50LnN0YXRlTWFuYWdlciwgcGFyZW50U2Vzc2lvbiwgcm9vdEEudG9TdHJpbmcoKSk7XG5cdFx0Y3JlYXRlU2Vzc2lvbihlbnZpcm9ubWVudC5zdGF0ZU1hbmFnZXIsIHN1YmFnZW50U2Vzc2lvbik7XG5cblx0XHRlbnZpcm9ubWVudC5jb29yZGluYXRvci5vbkZpcnN0U3Vic2NyaWJlcihVUkkucGFyc2Uoc3ViYWdlbnRTZXNzaW9uKSk7XG5cdFx0YXdhaXQgZW52aXJvbm1lbnQubW9uaXRvci53YWl0Rm9yQWNxdWlzaXRpb25zKDEpO1xuXG5cdFx0Ly8gVGhlIFBBUkVOVCBnYWlucyBhIHNlY29uZCByb290IG1pZC1zZXNzaW9uOiB0aGUgaW5oZXJpdGluZyBzdWJhZ2VudCBtdXN0XG5cdFx0Ly8gc3RhcnQgd2F0Y2hpbmcgaXQgdG9vIChmYW4tb3V0IHRvIHN1YmFnZW50cyBvbiBhIHBhcmVudCBjaGFuZ2UpLlxuXHRcdGVudmlyb25tZW50LnN0YXRlTWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwYXJlbnRTZXNzaW9uLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQsIGRpcmVjdG9yeTogcm9vdEIudG9TdHJpbmcoKSB9KTtcblx0XHRhd2FpdCBlbnZpcm9ubWVudC5tb25pdG9yLndhaXRGb3JBY3F1aXNpdGlvbnMoMik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5lbnZpcm9ubWVudC5tb25pdG9yLmFjcXVpc2l0aW9uc10uc29ydCgpLCBbcm9vdEEudG9TdHJpbmcoKSwgcm9vdEIudG9TdHJpbmcoKV0uc29ydCgpKTtcblx0fSk7XG59KTtcblxuZnVuY3Rpb24gY3JlYXRlR2l0U2VydmljZShyb290OiBVUkkpOiBJQWdlbnRIb3N0R2l0U2VydmljZSAmIHsgcmVhZG9ubHkgcm9vdExvb2t1cENhbGxzOiBzdHJpbmdbXTsgd2FpdEZvclJvb3RMb29rdXBzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IH0ge1xuXHRyZXR1cm4gY3JlYXRlR2l0U2VydmljZUZyb21SZXNvbHZlcigoKSA9PiByb290KTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlUm91dGluZ0dpdFNlcnZpY2Uocm91dGVzOiBSZWFkb25seU1hcDxzdHJpbmcsIFVSSSB8IHVuZGVmaW5lZD4pOiBJQWdlbnRIb3N0R2l0U2VydmljZSAmIHsgcmVhZG9ubHkgcm9vdExvb2t1cENhbGxzOiBzdHJpbmdbXTsgd2FpdEZvclJvb3RMb29rdXBzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IH0ge1xuXHRyZXR1cm4gY3JlYXRlR2l0U2VydmljZUZyb21SZXNvbHZlcih3b3JraW5nRGlyZWN0b3J5ID0+IHJvdXRlcy5nZXQod29ya2luZ0RpcmVjdG9yeS50b1N0cmluZygpKSk7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZUdpdFNlcnZpY2VGcm9tUmVzb2x2ZXIocmVzb2x2ZVJvb3Q6ICh3b3JraW5nRGlyZWN0b3J5OiBVUkkpID0+IFVSSSB8IHVuZGVmaW5lZCk6IElBZ2VudEhvc3RHaXRTZXJ2aWNlICYgeyByZWFkb25seSByb290TG9va3VwQ2FsbHM6IHN0cmluZ1tdOyB3YWl0Rm9yUm9vdExvb2t1cHMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4gfSB7XG5cdGNvbnN0IHJvb3RMb29rdXBDYWxsczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3Qgd2FpdGVyczogQXJyYXk8eyBjb3VudDogbnVtYmVyOyBkZWZlcnJlZDogRGVmZXJyZWRQcm9taXNlPHZvaWQ+IH0+ID0gW107XG5cdGNvbnN0IHJlbGVhc2VXYWl0ZXJzID0gKCkgPT4ge1xuXHRcdGZvciAoY29uc3Qgd2FpdGVyIG9mIFsuLi53YWl0ZXJzXSkge1xuXHRcdFx0aWYgKHJvb3RMb29rdXBDYWxscy5sZW5ndGggPj0gd2FpdGVyLmNvdW50KSB7XG5cdFx0XHRcdHdhaXRlcnMuc3BsaWNlKHdhaXRlcnMuaW5kZXhPZih3YWl0ZXIpLCAxKTtcblx0XHRcdFx0dm9pZCB3YWl0ZXIuZGVmZXJyZWQuY29tcGxldGUodW5kZWZpbmVkKTtcblx0XHRcdH1cblx0XHR9XG5cdH07XG5cdHJldHVybiB7XG5cdFx0Li4uY3JlYXRlTm9vcEdpdFNlcnZpY2UoKSxcblx0XHRyb290TG9va3VwQ2FsbHMsXG5cdFx0YXN5bmMgZ2V0UmVwb3NpdG9yeVJvb3Qod29ya2luZ0RpcmVjdG9yeTogVVJJKTogUHJvbWlzZTxVUkkgfCB1bmRlZmluZWQ+IHtcblx0XHRcdHJvb3RMb29rdXBDYWxscy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkudG9TdHJpbmcoKSk7XG5cdFx0XHRyZWxlYXNlV2FpdGVycygpO1xuXHRcdFx0cmV0dXJuIHJlc29sdmVSb290KHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdH0sXG5cdFx0d2FpdEZvclJvb3RMb29rdXBzKGNvdW50OiBudW1iZXIpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRcdGlmIChyb290TG9va3VwQ2FsbHMubGVuZ3RoID49IGNvdW50KSB7XG5cdFx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRlZmVycmVkID0gbmV3IERlZmVycmVkUHJvbWlzZTx2b2lkPigpO1xuXHRcdFx0d2FpdGVycy5wdXNoKHsgY291bnQsIGRlZmVycmVkIH0pO1xuXHRcdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdFx0fSxcblx0fTtcbn1cblxuY2xhc3MgVGVzdEdpdFN0YXRlU2VydmljZSBleHRlbmRzIERpc3Bvc2FibGUgaW1wbGVtZW50cyBJQWdlbnRIb3N0R2l0U3RhdGVTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8c3RyaW5nPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlID0gdGhpcy5fb25EaWRSZWZyZXNoU2Vzc2lvbkdpdFN0YXRlLmV2ZW50O1xuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZENoYW5nZVNlc3Npb25HaXRIdWJTdGF0ZSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHN0cmluZz4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2hhbmdlU2Vzc2lvbkdpdEh1YlN0YXRlID0gdGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uR2l0SHViU3RhdGUuZXZlbnQ7XG5cblx0cmVhZG9ubHkgcmVmcmVzaGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSByZWZyZXNoZWRXaXRoOiBBcnJheTx7IHJlYWRvbmx5IHNlc3Npb25LZXk6IHN0cmluZzsgcmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeTogc3RyaW5nIHwgdW5kZWZpbmVkIH0+ID0gW107XG5cblx0YXN5bmMgcmVmcmVzaFNlc3Npb25HaXRTdGF0ZShzZXNzaW9uS2V5OiBzdHJpbmcsIHdvcmtpbmdEaXJlY3Rvcnk/OiBVUkkpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHQvLyBNaXJyb3IgdGhlIHByb2R1Y3Rpb24gc2VydmljZTogcmVjb3JkIHRoZSByZWZyZXNoIChhbmQgdGhlIHdvcmtpbmdcblx0XHQvLyBkaXJlY3RvcnkgaXQgd2FzIGFza2VkIHRvIHJlZnJlc2ggZnJvbSkgYW5kIG5vdGlmeSBsaXN0ZW5lcnMgc28gdGhlXG5cdFx0Ly8gY29vcmRpbmF0b3IgcmVjb21wdXRlcyB0aGUgc3Vic2NyaWJlZCBjaGFuZ2VzZXRzLlxuXHRcdHRoaXMucmVmcmVzaGVkLnB1c2goc2Vzc2lvbktleSk7XG5cdFx0dGhpcy5yZWZyZXNoZWRXaXRoLnB1c2goeyBzZXNzaW9uS2V5LCB3b3JraW5nRGlyZWN0b3J5OiB3b3JraW5nRGlyZWN0b3J5Py50b1N0cmluZygpIH0pO1xuXHRcdHRoaXMuX29uRGlkUmVmcmVzaFNlc3Npb25HaXRTdGF0ZS5maXJlKHNlc3Npb25LZXkpO1xuXHR9XG5cdGFzeW5jIHJlc29sdmVTZXNzaW9uQmFzZUJyYW5jaE5hbWUoKTogUHJvbWlzZTxzdHJpbmcgfCB1bmRlZmluZWQ+IHsgcmV0dXJuIHVuZGVmaW5lZDsgfVxuXHRhc3luYyBzZXRTZXNzaW9uR2l0SHViU3RhdGUoX3Nlc3Npb25LZXk6IHN0cmluZywgX3N0YXRlOiBJU2Vzc2lvbkdpdEh1YlN0YXRlKTogUHJvbWlzZTx2b2lkPiB7IH1cblx0YXN5bmMgcmVjb3JkU2Vzc2lvbk1lcmdlKF9zZXNzaW9uS2V5OiBzdHJpbmcsIF9jb21taXQ/OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXHRhc3luYyBhdHRhY2hTZXNzaW9uR2l0SHViUHVsbFJlcXVlc3QoX3Nlc3Npb25LZXk6IHN0cmluZyk6IFByb21pc2U8dm9pZD4geyB9XG5cdGFzeW5jIGF0dGFjaFNlc3Npb25HaXRIdWJSZWZlcmVuY2VzKF9zZXNzaW9uS2V5OiBzdHJpbmcsIF90ZXh0OiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHsgfVxuXG5cdGZpcmVHaXRIdWJTdGF0ZUNoYW5nZWQoc2Vzc2lvbktleTogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5fb25EaWRDaGFuZ2VTZXNzaW9uR2l0SHViU3RhdGUuZmlyZShzZXNzaW9uS2V5KTtcblx0fVxufVxuXG5jbGFzcyBUZXN0RmlsZU1vbml0b3JTZXJ2aWNlIGV4dGVuZHMgRGlzcG9zYWJsZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RGaWxlTW9uaXRvclNlcnZpY2Uge1xuXHRkZWNsYXJlIHJlYWRvbmx5IF9zZXJ2aWNlQnJhbmQ6IHVuZGVmaW5lZDtcblxuXHRyZWFkb25seSBhY3F1aXNpdGlvbnM6IHN0cmluZ1tdID0gW107XG5cdHJlYWRvbmx5IGRpc3Bvc2Fsczogc3RyaW5nW10gPSBbXTtcblx0ZmFpbEFjcXVpcmUgPSBmYWxzZTtcblx0cmVhZG9ubHkgZmFpbEFjcXVpcmVGb3IgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfY2FsbGJhY2tzID0gbmV3IE1hcDxzdHJpbmcsIFNldDwoKSA9PiB2b2lkPj4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBfYWNxdWlzaXRpb25XYWl0ZXJzOiBBcnJheTx7IGNvdW50OiBudW1iZXI7IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfT4gPSBbXTtcblx0cHJpdmF0ZSByZWFkb25seSBfZGlzcG9zYWxXYWl0ZXJzOiBBcnJheTx7IGNvdW50OiBudW1iZXI7IGRlZmVycmVkOiBEZWZlcnJlZFByb21pc2U8dm9pZD4gfT4gPSBbXTtcblxuXHRhY3F1aXJlKGZvbGRlcjogVVJJLCBjYWxsYmFjazogKCkgPT4gdm9pZCwgX29wdGlvbnM/OiBJQWdlbnRIb3N0RmlsZU1vbml0b3JPcHRpb25zKTogSURpc3Bvc2FibGUgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IHJvb3QgPSBmb2xkZXIudG9TdHJpbmcoKTtcblx0XHR0aGlzLmFjcXVpc2l0aW9ucy5wdXNoKHJvb3QpO1xuXHRcdGlmICh0aGlzLmZhaWxBY3F1aXJlIHx8IHRoaXMuZmFpbEFjcXVpcmVGb3IuaGFzKHJvb3QpKSB7XG5cdFx0XHR0aGlzLl9yZWxlYXNlQWNxdWlzaXRpb25XYWl0ZXJzKCk7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRsZXQgY2FsbGJhY2tzID0gdGhpcy5fY2FsbGJhY2tzLmdldChyb290KTtcblx0XHRpZiAoIWNhbGxiYWNrcykge1xuXHRcdFx0Y2FsbGJhY2tzID0gbmV3IFNldDwoKSA9PiB2b2lkPigpO1xuXHRcdFx0dGhpcy5fY2FsbGJhY2tzLnNldChyb290LCBjYWxsYmFja3MpO1xuXHRcdH1cblx0XHRjYWxsYmFja3MuYWRkKGNhbGxiYWNrKTtcblx0XHR0aGlzLl9yZWxlYXNlQWNxdWlzaXRpb25XYWl0ZXJzKCk7XG5cdFx0cmV0dXJuIHRvRGlzcG9zYWJsZSgoKSA9PiB7XG5cdFx0XHRjYWxsYmFja3MuZGVsZXRlKGNhbGxiYWNrKTtcblx0XHRcdHRoaXMuZGlzcG9zYWxzLnB1c2gocm9vdCk7XG5cdFx0XHR0aGlzLl9yZWxlYXNlRGlzcG9zYWxXYWl0ZXJzKCk7XG5cdFx0fSk7XG5cdH1cblxuXHRmaXJlKHJvb3Q6IFVSSSk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgY2FsbGJhY2sgb2YgdGhpcy5fY2FsbGJhY2tzLmdldChyb290LnRvU3RyaW5nKCkpID8/IFtdKSB7XG5cdFx0XHRjYWxsYmFjaygpO1xuXHRcdH1cblx0fVxuXG5cdHdhaXRGb3JBY3F1aXNpdGlvbnMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmFjcXVpc2l0aW9ucy5sZW5ndGggPj0gY291bnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0dGhpcy5fYWNxdWlzaXRpb25XYWl0ZXJzLnB1c2goeyBjb3VudCwgZGVmZXJyZWQgfSk7XG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlQWNxdWlzaXRpb25XYWl0ZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2FpdGVyIG9mIFsuLi50aGlzLl9hY3F1aXNpdGlvbldhaXRlcnNdKSB7XG5cdFx0XHRpZiAodGhpcy5hY3F1aXNpdGlvbnMubGVuZ3RoID49IHdhaXRlci5jb3VudCkge1xuXHRcdFx0XHR0aGlzLl9hY3F1aXNpdGlvbldhaXRlcnMuc3BsaWNlKHRoaXMuX2FjcXVpc2l0aW9uV2FpdGVycy5pbmRleE9mKHdhaXRlciksIDEpO1xuXHRcdFx0XHR2b2lkIHdhaXRlci5kZWZlcnJlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHdhaXRGb3JEaXNwb3NhbHMoY291bnQ6IG51bWJlcik6IFByb21pc2U8dm9pZD4ge1xuXHRcdGlmICh0aGlzLmRpc3Bvc2Fscy5sZW5ndGggPj0gY291bnQpIHtcblx0XHRcdHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcblx0XHR9XG5cdFx0Y29uc3QgZGVmZXJyZWQgPSBuZXcgRGVmZXJyZWRQcm9taXNlPHZvaWQ+KCk7XG5cdFx0dGhpcy5fZGlzcG9zYWxXYWl0ZXJzLnB1c2goeyBjb3VudCwgZGVmZXJyZWQgfSk7XG5cdFx0cmV0dXJuIGRlZmVycmVkLnA7XG5cdH1cblxuXHRwcml2YXRlIF9yZWxlYXNlRGlzcG9zYWxXYWl0ZXJzKCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3Qgd2FpdGVyIG9mIFsuLi50aGlzLl9kaXNwb3NhbFdhaXRlcnNdKSB7XG5cdFx0XHRpZiAodGhpcy5kaXNwb3NhbHMubGVuZ3RoID49IHdhaXRlci5jb3VudCkge1xuXHRcdFx0XHR0aGlzLl9kaXNwb3NhbFdhaXRlcnMuc3BsaWNlKHRoaXMuX2Rpc3Bvc2FsV2FpdGVycy5pbmRleE9mKHdhaXRlciksIDEpO1xuXHRcdFx0XHR2b2lkIHdhaXRlci5kZWZlcnJlZC5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxufVxuXG5jbGFzcyBUZXN0Q2hhbmdlc2V0U2VydmljZSBpbXBsZW1lbnRzIElBZ2VudEhvc3RDaGFuZ2VzZXRTZXJ2aWNlIHtcblx0ZGVjbGFyZSByZWFkb25seSBfc2VydmljZUJyYW5kOiB1bmRlZmluZWQ7XG5cblx0cmVhZG9ubHkgYnJhbmNoUmVmcmVzaGVzOiBzdHJpbmdbXSA9IFtdO1xuXHRyZWFkb25seSB1bmNvbW1pdHRlZFJlZnJlc2hlczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgc2Vzc2lvblJlZnJlc2hlczogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgd29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZTogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgcmVjb21wdXRlZDogc3RyaW5nW10gPSBbXTtcblx0cmVhZG9ubHkgZGlzcG9zZWQ6IHN0cmluZ1tdID0gW107XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfc3Vic2NyaXB0aW9uczogSUFnZW50SG9zdENoYW5nZXNldFN1YnNjcmlwdGlvblNlcnZpY2UpIHsgfVxuXG5cdHJlZ2lzdGVyU3RhdGljQ2hhbmdlc2V0cyhfc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7IH1cblx0cmVzdG9yZVN0YXRpY0NoYW5nZXNldChfc2Vzc2lvbjogc3RyaW5nLCBfa2luZDogU3RhdGljQ2hhbmdlc2V0S2luZCwgX2RpZmZzOiByZWFkb25seSBJU2Vzc2lvbkZpbGVEaWZmW10pOiB2b2lkIHsgfVxuXHRwYXJzZVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX21ldGFkYXRhOiBJUGVyc2lzdGVkQ2hhbmdlc2V0TWV0YWRhdGEpOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyB7IHJldHVybiB7fTsgfVxuXHRhcHBseVBlcnNpc3RlZFN0YXRpY0NoYW5nZXNldHMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX2RpZmZzOiBJUmVzdG9yZWRDaGFuZ2VzZXREaWZmcyk6IHZvaWQgeyB9XG5cdHJlc3RvcmVQZXJzaXN0ZWRTdGF0aWNDaGFuZ2VzZXRzKF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9tZXRhZGF0YTogSVBlcnNpc3RlZENoYW5nZXNldE1ldGFkYXRhKTogSVJlc3RvcmVkQ2hhbmdlc2V0RGlmZnMgeyByZXR1cm4ge307IH1cblx0cGVyc2lzdENoYW5nZXNTdW1tYXJ5KF9zZXNzaW9uVXJpOiBzdHJpbmcsIF9zdW1tYXJ5OiBDaGFuZ2VzU3VtbWFyeSk6IHZvaWQgeyB9XG5cdGlzU3RhdGljQ2hhbmdlc2V0Q29tcHV0ZUFjdGl2ZShfY2hhbmdlc2V0VXJpOiBzdHJpbmcpOiBib29sZWFuIHsgcmV0dXJuIGZhbHNlOyB9XG5cdHJlZnJlc2hDaGFuZ2VzZXRDYXRhbG9nKF9zZXNzaW9uOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRyZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuYnJhbmNoUmVmcmVzaGVzLnB1c2goc2Vzc2lvbik7XG5cdH1cblx0cmVmcmVzaFNlc3Npb25DaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogdm9pZCB7XG5cdFx0dGhpcy5zZXNzaW9uUmVmcmVzaGVzLnB1c2goc2Vzc2lvbik7XG5cdH1cblx0b25Xb3JraW5nRGlyZWN0b3J5QXZhaWxhYmxlKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMud29ya2luZ0RpcmVjdG9yeUF2YWlsYWJsZS5wdXNoKHNlc3Npb24pO1xuXHR9XG5cdHJlY29tcHV0ZVN1YnNjcmliZWRDaGFuZ2VzZXRzKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMucmVjb21wdXRlZC5wdXNoKHNlc3Npb24pO1xuXHRcdGZvciAoY29uc3QgY2hhbmdlc2V0IG9mIHRoaXMuX3N1YnNjcmlwdGlvbnMuZ2V0U2Vzc2lvblN1YnNjcmlwdGlvbnMoc2Vzc2lvbikpIHtcblx0XHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlQ2hhbmdlc2V0VXJpKGNoYW5nZXNldCk7XG5cdFx0XHRzd2l0Y2ggKHBhcnNlZD8ua2luZCkge1xuXHRcdFx0XHRjYXNlIENoYW5nZXNldEtpbmQuQnJhbmNoOlxuXHRcdFx0XHRcdHRoaXMucmVmcmVzaEJyYW5jaENoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VzZXRLaW5kLlNlc3Npb246XG5cdFx0XHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBDaGFuZ2VzZXRLaW5kLlVuY29tbWl0dGVkOlxuXHRcdFx0XHRcdHZvaWQgdGhpcy5jb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdFx0aWYgKGNoYW5nZXNldCA9PT0gc2Vzc2lvbikge1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoQnJhbmNoQ2hhbmdlc2V0KHNlc3Npb24pO1xuXHRcdFx0XHRcdFx0dGhpcy5yZWZyZXNoU2Vzc2lvbkNoYW5nZXNldChzZXNzaW9uKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdG9uU2Vzc2lvbkRpc3Bvc2VkKHNlc3Npb246IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuZGlzcG9zZWQucHVzaChzZXNzaW9uKTtcblx0fVxuXHRhc3luYyBjb21wdXRlVW5jb21taXR0ZWRDaGFuZ2VzZXQoc2Vzc2lvbjogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcblx0XHRpZiAodGhpcy5fc3Vic2NyaXB0aW9ucy5nZXRTZXNzaW9uU3Vic2NyaXB0aW9ucyhzZXNzaW9uKS5oYXMoVVJJLnBhcnNlKGJ1aWxkVW5jb21taXR0ZWRDaGFuZ2VzZXRVcmkoc2Vzc2lvbikpLnRvU3RyaW5nKCkpKSB7XG5cdFx0XHR0aGlzLnVuY29tbWl0dGVkUmVmcmVzaGVzLnB1c2goc2Vzc2lvbik7XG5cdFx0fVxuXHRcdHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvdW5jb21taXR0ZWRgO1xuXHR9XG5cdGFzeW5jIGNvbXB1dGVUdXJuQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZywgdHVybklkOiBzdHJpbmcpOiBQcm9taXNlPHN0cmluZz4geyByZXR1cm4gYCR7c2Vzc2lvbn0vY2hhbmdlc2V0L3R1cm4vJHt0dXJuSWR9YDsgfVxuXHRhc3luYyBjb21wdXRlQ29tcGFyZVR1cm5zQ2hhbmdlc2V0KHNlc3Npb246IHN0cmluZywgb3JpZ2luYWxUdXJuSWQ6IHN0cmluZywgbW9kaWZpZWRUdXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7IHJldHVybiBgJHtzZXNzaW9ufS9jaGFuZ2VzZXQvY29tcGFyZS8ke29yaWdpbmFsVHVybklkfS8ke21vZGlmaWVkVHVybklkfWA7IH1cblx0b25Ub29sQ2FsbEVkaXRzQXBwbGllZChfc2Vzc2lvbjogc3RyaW5nLCBfdHVybklkOiBzdHJpbmcpOiB2b2lkIHsgfVxuXHRvblR1cm5Db21wbGV0ZShfc2Vzc2lvbjogc3RyaW5nLCBfdHVybklkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiB2b2lkIHsgfVxuXHRvblNlc3Npb25UcnVuY2F0ZWQoX3Nlc3Npb246IHN0cmluZyk6IHZvaWQgeyB9XG5cblx0Y2xlYXJSZWZyZXNoZXMoKTogdm9pZCB7XG5cdFx0dGhpcy5icmFuY2hSZWZyZXNoZXMubGVuZ3RoID0gMDtcblx0XHR0aGlzLnVuY29tbWl0dGVkUmVmcmVzaGVzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5zZXNzaW9uUmVmcmVzaGVzLmxlbmd0aCA9IDA7XG5cdFx0dGhpcy5yZWNvbXB1dGVkLmxlbmd0aCA9IDA7XG5cdH1cblxuXHRnZXRMaXN0TWV0YWRhdGFLZXlzKF9zZXNzaW9uU3RyOiBzdHJpbmcpOiBSZWNvcmQ8c3RyaW5nLCB0cnVlPiB8IHVuZGVmaW5lZCB7IHJldHVybiB1bmRlZmluZWQ7IH1cblx0Y29tcHV0ZUxpc3RFbnRyeUNoYW5nZXMoX3Nlc3Npb25Vcmk6IHN0cmluZywgX21ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+KTogQ2hhbmdlc1N1bW1hcnkgfCB1bmRlZmluZWQgeyByZXR1cm4gdW5kZWZpbmVkOyB9XG59XG5cbmZ1bmN0aW9uIHRpY2soKTogUHJvbWlzZTx2b2lkPiB7XG5cdHJldHVybiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldEltbWVkaWF0ZShyZXNvbHZlKSk7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyx1QkFBdUI7QUFDaEMsU0FBUyxZQUF5QixvQkFBb0I7QUFDdEQsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGFBQWEsc0JBQXNCO0FBQzVDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMseUJBQXlCLDhCQUE4QiwwQkFBMEIsOEJBQThCLGVBQWUseUJBQXlCO0FBQ2hLLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMseUJBQXlCLHFCQUFzRTtBQUN4RyxTQUFTLDJCQUEyQixrQ0FBa0M7QUFDdEUsU0FBUyxxQ0FBcUM7QUFDOUMsU0FBUyxrQ0FBNkc7QUFDdEgsU0FBUywyQ0FBMkM7QUFDcEQsU0FBdUMsb0NBQW9DO0FBQzNFLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsaUNBQWlDO0FBQzFDLFNBQVMsdUJBQXVCLDhCQUE4QjtBQUM5RCxTQUFTLDRCQUE0QjtBQUVyQyxTQUFTLDhDQUE4QztBQUN2RCxTQUFTLDZDQUE2QztBQUN0RCxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLHlCQUF5QjtBQUVsQyxNQUFNLCtCQUErQixNQUFNO0FBRTFDLFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsV0FBUyxjQUFj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QUFBQSxRQUNyQixLQUFLLGNBQWM7QUFDbEIsZUFBSyx1QkFBdUIsT0FBTztBQUNuQztBQUFBLFFBQ0QsS0FBSyxjQUFjO0FBQ2xCLGVBQUssd0JBQXdCLE9BQU87QUFDcEM7QUFBQSxRQUNELEtBQUssY0FBYztBQUNsQixlQUFLLEtBQUssNEJBQTRCLE9BQU87QUFDN0M7QUFBQSxRQUNEO0FBQ0MsY0FBSSxjQUFjLFNBQVM7QUFDMUIsaUJBQUssdUJBQXVCLE9BQU87QUFDbkMsaUJBQUssd0JBQXdCLE9BQU87QUFBQSxVQUNyQztBQUNBO0FBQUEsTUFDRjtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQUEsRUFDQSxrQkFBa0IsU0FBdUI7QUFDeEMsU0FBSyxTQUFTLEtBQUssT0FBTztBQUFBLEVBQzNCO0FBQUEsRUFDQSxNQUFNLDRCQUE0QixTQUFrQztBQUNuRSxRQUFJLEtBQUssZUFBZSx3QkFBd0IsT0FBTyxFQUFFLElBQUksSUFBSSxNQUFNLDZCQUE2QixPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsR0FBRztBQUMxSCxXQUFLLHFCQUFxQixLQUFLLE9BQU87QUFBQSxJQUN2QztBQUNBLFdBQU8sR0FBRyxPQUFPO0FBQUEsRUFDbEI7QUFBQSxFQUNBLE1BQU0scUJBQXFCLFNBQWlCLFFBQWlDO0FBQUUsV0FBTyxHQUFHLE9BQU8sbUJBQW1CLE1BQU07QUFBQSxFQUFJO0FBQUEsRUFDN0gsTUFBTSw2QkFBNkIsU0FBaUIsZ0JBQXdCLGdCQUF5QztBQUFFLFdBQU8sR0FBRyxPQUFPLHNCQUFzQixjQUFjLElBQUksY0FBYztBQUFBLEVBQUk7QUFBQSxFQUNsTSx1QkFBdUIsVUFBa0IsU0FBdUI7QUFBQSxFQUFFO0FBQUEsRUFDbEUsZUFBZSxVQUFrQixTQUFtQztBQUFBLEVBQUU7QUFBQSxFQUN0RSxtQkFBbUIsVUFBd0I7QUFBQSxFQUFFO0FBQUEsRUFFN0MsaUJBQXVCO0FBQ3RCLFNBQUssZ0JBQWdCLFNBQVM7QUFDOUIsU0FBSyxxQkFBcUIsU0FBUztBQUNuQyxTQUFLLGlCQUFpQixTQUFTO0FBQy9CLFNBQUssV0FBVyxTQUFTO0FBQUEsRUFDMUI7QUFBQSxFQUVBLG9CQUFvQixhQUF1RDtBQUFFLFdBQU87QUFBQSxFQUFXO0FBQUEsRUFDL0Ysd0JBQXdCLGFBQXFCLFdBQTJFO0FBQUUsV0FBTztBQUFBLEVBQVc7QUFDN0k7QUFFQSxTQUFTLE9BQXNCO0FBQzlCLFNBQU8sSUFBSSxRQUFRLGFBQVcsYUFBYSxPQUFPLENBQUM7QUFDcEQ7IiwKICAibmFtZXMiOiBbXQp9Cg==
