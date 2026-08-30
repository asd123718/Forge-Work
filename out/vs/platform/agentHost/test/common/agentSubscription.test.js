import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ChangesetStatus, MessageKind, SessionLifecycle, SessionStatus, TerminalClaimKind, TurnState } from "../../common/state/protocol/state.js";
import { buildDefaultChatUri, createChatState, createDefaultChatSummary, ROOT_STATE_URI, StateComponents } from "../../common/state/sessionState.js";
import { AgentSubscriptionManager, ChangesetStateSubscription, ChatStateSubscription, isActionEnvelopeRelevantToSubscriptionUris, RootStateSubscription, SessionStateSubscription, TerminalStateSubscription } from "../../common/state/agentSubscription.js";
function makeRootState(overrides) {
  return {
    agents: [],
    activeSessions: 0,
    terminals: [],
    ...overrides
  };
}
function makeSessionSummary(sessionUri2) {
  return {
    resource: sessionUri2,
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    createdAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    modifiedAt: (/* @__PURE__ */ new Date(1)).toISOString(),
    project: { uri: "file:///test-project", displayName: "Test Project" }
  };
}
function makeSessionState(sessionUri2, overrides) {
  return {
    provider: "copilot",
    title: "Test",
    status: SessionStatus.Idle,
    project: { uri: "file:///test-project", displayName: "Test Project" },
    lifecycle: SessionLifecycle.Ready,
    activeClients: [],
    chats: [],
    ...overrides
  };
}
function makeChatState(chatUri2, sessionSummary = makeSessionSummary(sessionUri), overrides) {
  return {
    ...createChatState(createDefaultChatSummary(sessionSummary, chatUri2)),
    ...overrides
  };
}
function makeTerminalState(overrides) {
  return {
    title: "bash",
    content: [],
    claim: { kind: TerminalClaimKind.Client, clientId: "c1" },
    ...overrides
  };
}
function makeEnvelope(action, serverSeq, origin, rejectionReason, channel) {
  const resolvedChannel = channel ?? (action.type.startsWith("root/") ? ROOT_STATE_URI : action.type.startsWith("chat/") ? chatUri : action.type.startsWith("terminal/") ? terminalUri : action.type.startsWith("changeset/") ? changesetUri : sessionUri);
  return { channel: resolvedChannel, action, serverSeq, origin, rejectionReason };
}
const noop = () => {
};
const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
const terminalUri = URI.from({ scheme: "agenthost-terminal", path: "/term1" }).toString();
const chatUri = buildDefaultChatUri(sessionUri);
const changesetUri = `${sessionUri}/changeset/session`;
suite("ChangesetStateSubscription", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  test("optimistically applies and reconciles file review state", () => {
    const state = {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///test.txt",
        edit: {
          before: { uri: "file:///test.txt", content: { uri: "file:///before.txt" } },
          after: { uri: "file:///test.txt", content: { uri: "file:///after.txt" } }
        }
      }]
    };
    const subscription = disposables.add(new ChangesetStateSubscription(changesetUri, "c1", () => 1, noop));
    subscription.handleSnapshot(state, 0);
    const action = {
      type: ActionType.ChangesetFilesReviewChanged,
      files: ["file:///test.txt"],
      reviewed: true
    };
    const clientSeq = subscription.applyOptimistic(action);
    const optimisticState = subscription.value;
    subscription.receiveEnvelope(makeEnvelope(action, 1, { clientId: "c1", clientSeq }));
    assert.deepStrictEqual({
      optimisticReviewed: optimisticState.files[0].reviewed,
      verifiedBeforeEcho: state.files[0].reviewed,
      verifiedAfterEcho: subscription.verifiedValue?.files[0].reviewed,
      pendingCleared: subscription.value === subscription.verifiedValue
    }, {
      optimisticReviewed: true,
      verifiedBeforeEcho: void 0,
      verifiedAfterEcho: true,
      pendingCleared: true
    });
  });
});
suite("RootStateSubscription", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("value is undefined before snapshot", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    assert.strictEqual(sub.value, void 0);
    assert.strictEqual(sub.verifiedValue, void 0);
  });
  test("handleSnapshot sets value and verifiedValue", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const state = makeRootState({ activeSessions: 3 });
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
    assert.deepStrictEqual(sub.verifiedValue, state);
  });
  test("handleSnapshot fires onDidChange", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const fired = [];
    disposables.add(sub.onDidChange((s) => fired.push(s)));
    sub.handleSnapshot(makeRootState(), 0);
    assert.strictEqual(fired.length, 1);
  });
  test("receiveEnvelope updates state for root actions", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
      1
    ));
    assert.strictEqual(sub.value.activeSessions, 5);
  });
  test("ignores non-root actions", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    const state = makeRootState();
    sub.handleSnapshot(state, 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionReady },
      1
    ));
    assert.deepStrictEqual(sub.value, state);
  });
  test("fires onWillApplyAction and onDidApplyAction around envelope", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    const events = [];
    disposables.add(sub.onWillApplyAction(() => events.push("will")));
    disposables.add(sub.onDidApplyAction(() => events.push("did")));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 1 },
      1
    ));
    assert.deepStrictEqual(events, ["will", "did"]);
  });
  test("buffers envelopes before snapshot and replays after", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 7 },
      2
    ));
    assert.strictEqual(sub.value, void 0);
    sub.handleSnapshot(makeRootState(), 1);
    assert.strictEqual(sub.value.activeSessions, 7);
  });
  test("buffered envelopes with serverSeq <= fromSeq are discarded", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 99 },
      1
    ));
    sub.handleSnapshot(makeRootState({ activeSessions: 0 }), 1);
    assert.strictEqual(sub.value.activeSessions, 0);
  });
  test("setError makes value return the error", () => {
    const sub = disposables.add(new RootStateSubscription("c1", noop));
    sub.handleSnapshot(makeRootState(), 0);
    const err = new Error("failed");
    const errors = [];
    disposables.add(sub.onDidError((error) => errors.push(error)));
    sub.setError(err);
    assert.deepStrictEqual({
      value: sub.value,
      verifiedValueExists: !!sub.verifiedValue,
      errors
    }, {
      value: err,
      verifiedValueExists: true,
      errors: [err]
    });
  });
});
suite("SessionStateSubscription", () => {
  let disposables;
  let seq;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSub(uri = sessionUri, clientId = "c1") {
    return disposables.add(new SessionStateSubscription(uri, clientId, () => ++seq, noop));
  }
  test("value is undefined before snapshot", () => {
    const sub = createSub();
    assert.strictEqual(sub.value, void 0);
  });
  test("handleSnapshot sets value and verifiedValue", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
    assert.deepStrictEqual(sub.verifiedValue, state);
  });
  test("applyOptimistic returns clientSeq and updates value but not verifiedValue", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    assert.strictEqual(clientSeq, 1);
    assert.strictEqual(sub.value.title, "Optimistic");
    assert.strictEqual(sub.verifiedValue.title, "Test");
  });
  test("confirmed own action removes pending and updates confirmed", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Optimistic" },
      1,
      { clientId: "c1", clientSeq }
    ));
    assert.strictEqual(sub.verifiedValue.title, "Optimistic");
    assert.strictEqual(sub.value.title, "Optimistic");
  });
  test("rejected own action removes pending without updating confirmed", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Optimistic"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Optimistic" },
      1,
      { clientId: "c1", clientSeq },
      "denied"
    ));
    assert.strictEqual(sub.verifiedValue.title, "Test");
    assert.strictEqual(sub.value.title, "Test");
  });
  test("foreign action updates confirmed and recomputes optimistic", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Local"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionReady },
      1,
      { clientId: "other-client", clientSeq: 1 }
    ));
    assert.strictEqual(sub.verifiedValue.lifecycle, SessionLifecycle.Ready);
    assert.strictEqual(sub.value.title, "Local");
  });
  test("server terminal turn action remains ignored by session subscription", () => {
    const sub = createSub();
    const state = makeSessionState(sessionUri);
    sub.handleSnapshot(state, 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
      1,
      void 0
    ));
    assert.deepStrictEqual(sub.value, state);
  });
  test("after all pending cleared, value falls through to verifiedValue", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const clientSeq = sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Temp"
    });
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Temp" },
      1,
      { clientId: "c1", clientSeq }
    ));
    assert.strictEqual(sub.value, sub.verifiedValue);
  });
  test("clearPending resets optimistic state", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Pending"
    });
    assert.strictEqual(sub.value.title, "Pending");
    sub.clearPending();
    assert.strictEqual(sub.value.title, "Test");
  });
  test("ignores actions for different session", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Other" },
      1,
      void 0,
      void 0,
      "copilot:/other-session"
    ));
    assert.strictEqual(sub.value.title, "Test");
  });
  test("buffers envelopes before snapshot and replays after", () => {
    const sub = createSub();
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Buffered" },
      2
    ));
    assert.strictEqual(sub.value, void 0);
    sub.handleSnapshot(makeSessionState(sessionUri), 1);
    assert.strictEqual(sub.value.title, "Buffered");
  });
  test("fires onDidChange on optimistic apply", () => {
    const sub = createSub();
    sub.handleSnapshot(makeSessionState(sessionUri), 0);
    const fired = [];
    disposables.add(sub.onDidChange((s) => fired.push(s)));
    sub.applyOptimistic({
      type: ActionType.SessionTitleChanged,
      title: "Changed"
    });
    assert.strictEqual(fired.length, 1);
    assert.strictEqual(fired[0].title, "Changed");
  });
  suite("ordinary optimistic working-directory actions", () => {
    test("accepted action moves the optimistic directory into confirmed state", () => {
      const sub = createSub();
      sub.handleSnapshot(makeSessionState(sessionUri), 0);
      const action = { type: ActionType.SessionWorkingDirectorySet, directory: "file:///ws2" };
      const clientSeq = sub.applyOptimistic(action);
      assert.deepStrictEqual(sub.value.workingDirectories, ["file:///ws2"]);
      assert.strictEqual(sub.verifiedValue?.workingDirectories, void 0);
      sub.receiveEnvelope(makeEnvelope(action, 1, { clientId: "c1", clientSeq }));
      assert.deepStrictEqual(sub.verifiedValue?.workingDirectories, ["file:///ws2"]);
      assert.strictEqual(sub.value, sub.verifiedValue);
    });
    test("rejected action rolls optimistic working directories back", () => {
      const sub = createSub();
      sub.handleSnapshot(makeSessionState(sessionUri), 0);
      const action = { type: ActionType.SessionWorkingDirectorySet, directory: "file:///ws2" };
      const clientSeq = sub.applyOptimistic(action);
      sub.receiveEnvelope(makeEnvelope(action, 1, { clientId: "c1", clientSeq }, "denied"));
      assert.strictEqual(sub.verifiedValue?.workingDirectories, void 0);
      assert.strictEqual(sub.value.workingDirectories, void 0);
    });
  });
});
suite("ChatStateSubscription", () => {
  let disposables;
  let seq;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createSub(uri = chatUri, clientId = "c1") {
    return disposables.add(new ChatStateSubscription(uri, clientId, () => ++seq, noop));
  }
  test("server terminal turn action drops stale optimistic turn start", () => {
    const sub = createSub();
    sub.handleSnapshot(makeChatState(chatUri), 0);
    sub.applyOptimistic({
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(sub.value?.activeTurn?.id, "turn-1");
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1e3 },
      1,
      void 0
    ));
    assert.deepStrictEqual({
      activeTurn: sub.value?.activeTurn,
      turns: sub.value?.turns.map((turn) => ({ id: turn.id, state: turn.state }))
    }, {
      activeTurn: void 0,
      turns: [{ id: "turn-1", state: TurnState.Complete }]
    });
  });
});
suite("TerminalStateSubscription", () => {
  let disposables;
  setup(() => {
    disposables = new DisposableStore();
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("accepts terminal actions matching its URI", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "hello" },
      1
    ));
    assert.deepStrictEqual(sub.value.content, [
      { type: "unclassified", value: "hello" }
    ]);
  });
  test("data between command executed and finished is attributed to the command", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalCommandExecuted, commandId: "cmd-1", commandLine: "echo hi", timestamp: 1e3 },
      1
    ));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "hi\r\n" },
      2
    ));
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalCommandFinished, commandId: "cmd-1", exitCode: 0, durationMs: 5 },
      3
    ));
    assert.deepStrictEqual(sub.value.content, [{
      type: "command",
      commandId: "cmd-1",
      commandLine: "echo hi",
      output: "hi\r\n",
      timestamp: 1e3,
      isComplete: true,
      exitCode: 0,
      durationMs: 5
    }]);
  });
  test("ignores terminal actions for other URIs", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.TerminalData, data: "nope" },
      1,
      void 0,
      void 0,
      "agenthost-terminal:/other-term"
    ));
    assert.deepStrictEqual(sub.value.content, []);
  });
  test("ignores non-terminal actions", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    sub.handleSnapshot(makeTerminalState(), 0);
    sub.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 5 },
      1
    ));
    assert.deepStrictEqual(sub.value.content, []);
  });
  test("handleSnapshot sets value", () => {
    const sub = disposables.add(new TerminalStateSubscription(terminalUri, "c1", noop));
    const state = makeTerminalState({ title: "zsh" });
    sub.handleSnapshot(state, 0);
    assert.deepStrictEqual(sub.value, state);
  });
});
suite("AgentSubscriptionManager", () => {
  let disposables;
  let seq;
  let subscribedResources;
  let unsubscribedResources;
  setup(() => {
    disposables = new DisposableStore();
    seq = 0;
    subscribedResources = [];
    unsubscribedResources = [];
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  function createManager(subscribe = async (resource) => {
    subscribedResources.push(resource.toString());
    const key = resource.toString();
    if (key.startsWith("copilot:")) {
      return { resource: key, state: makeSessionState(key), fromSeq: 0 };
    }
    return { resource: key, state: makeTerminalState(), fromSeq: 0 };
  }) {
    return disposables.add(new AgentSubscriptionManager(
      "c1",
      () => ++seq,
      noop,
      subscribe,
      (resource) => {
        unsubscribedResources.push(resource.toString());
      }
    ));
  }
  test("rootState is available immediately", () => {
    const mgr = createManager();
    assert.ok(mgr.rootState);
    assert.strictEqual(mgr.rootState.value, void 0);
  });
  test("handleRootSnapshot initializes root state", () => {
    const mgr = createManager();
    const state = makeRootState({ activeSessions: 2 });
    mgr.handleRootSnapshot(state, 0);
    assert.deepStrictEqual(mgr.rootState.value, state);
  });
  test("getSubscription returns IReference with subscription", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    assert.ok(ref.object);
    assert.strictEqual(ref.object.value, void 0);
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    ref.dispose();
  });
  test("second call for same resource increments refcount", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref1 = mgr.getSubscription(StateComponents.Session, uri, "test");
    const ref2 = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.strictEqual(ref1.object, ref2.object);
    ref1.dispose();
    assert.strictEqual(unsubscribedResources.length, 0);
    ref2.dispose();
    assert.strictEqual(unsubscribedResources.length, 1);
  });
  test("disposing last ref calls unsubscribe callback", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    ref.dispose();
    assert.ok(unsubscribedResources.includes(sessionUri));
  });
  test("receiveEnvelope routes to root and all active subscriptions", async () => {
    const mgr = createManager();
    mgr.handleRootSnapshot(makeRootState(), 0);
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    mgr.receiveEnvelope(makeEnvelope(
      { type: ActionType.RootActiveSessionsChanged, activeSessions: 10 },
      1
    ));
    assert.strictEqual(mgr.rootState.value.activeSessions, 10);
    mgr.receiveEnvelope(makeEnvelope(
      { type: ActionType.SessionTitleChanged, title: "Routed" },
      2
    ));
    assert.strictEqual(ref.object.value.title, "Routed");
    ref.dispose();
  });
  test("isActionEnvelopeRelevantToSubscriptionUris filters by subscribed channel", () => {
    assert.deepStrictEqual({
      rootVariant: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.RootActiveSessionsChanged, activeSessions: 1 }, 1, void 0, void 0, ROOT_STATE_URI),
        ["ahp-root:"]
      ),
      rootOnlyGetsSession: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.SessionTitleChanged, title: "Nope" }, 2),
        ["ahp-root:"]
      ),
      exactSession: isActionEnvelopeRelevantToSubscriptionUris(
        makeEnvelope({ type: ActionType.SessionTitleChanged, title: "Yep" }, 3),
        ["ahp-root:", sessionUri]
      )
    }, {
      rootVariant: true,
      rootOnlyGetsSession: false,
      exactSession: true
    });
  });
  test("creating session subscription for copilot: URI", async () => {
    const mgr = createManager();
    const mySessionUri = URI.from({ scheme: "copilot", path: "/my-session" });
    const ref = mgr.getSubscription(StateComponents.Session, mySessionUri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    assert.ok(subscribedResources.includes(mySessionUri.toString()));
    ref.dispose();
  });
  test("creating terminal subscription for terminal URI", async () => {
    const mgr = createManager();
    const uri = URI.parse(terminalUri);
    const ref = mgr.getSubscription(StateComponents.Terminal, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(ref.object.value);
    assert.ok(subscribedResources.includes(terminalUri));
    ref.dispose();
  });
  test("dispatchOptimistic applies to matching session subscription", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
      type: ActionType.SessionTitleChanged,
      title: "Dispatched"
    });
    assert.ok(clientSeq > 0);
    assert.strictEqual(ref.object.value.title, "Dispatched");
    assert.strictEqual(ref.object.verifiedValue.title, "Test");
    ref.dispose();
  });
  test("dispatchOptimistic applies to matching changeset subscription", async () => {
    const state = {
      status: ChangesetStatus.Ready,
      files: [{
        id: "file:///test.txt",
        edit: {
          after: { uri: "file:///test.txt", content: { uri: "file:///after.txt" } }
        }
      }]
    };
    const mgr = createManager(async (resource) => ({ resource: resource.toString(), state, fromSeq: 0 }));
    const uri = URI.parse(changesetUri);
    const ref = mgr.getSubscription(StateComponents.Changeset, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const clientSeq = mgr.dispatchOptimistic(uri.toString(), {
      type: ActionType.ChangesetFilesReviewChanged,
      files: ["file:///test.txt"],
      reviewed: true
    });
    assert.deepStrictEqual({
      clientSeq,
      optimisticReviewed: ref.object.value.files[0].reviewed,
      verifiedReviewed: ref.object.verifiedValue?.files[0].reviewed
    }, {
      clientSeq: 1,
      optimisticReviewed: true,
      verifiedReviewed: void 0
    });
    ref.dispose();
  });
  test("dispose clears all subscriptions and calls unsubscribe for each", async () => {
    const mgr = createManager();
    const ref1 = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
    const ref2 = mgr.getSubscription(StateComponents.Terminal, URI.parse(terminalUri), "test");
    await new Promise((r) => setTimeout(r, 0));
    disposables.delete(mgr);
    mgr.dispose();
    assert.ok(unsubscribedResources.includes(sessionUri));
    assert.ok(unsubscribedResources.includes(terminalUri));
    ref1.dispose();
    ref2.dispose();
  });
  test("getSubscriptionUnmanaged returns undefined when no subscription exists", () => {
    const mgr = createManager();
    const result = mgr.getSubscriptionUnmanaged(URI.parse("copilot:/nonexistent"));
    assert.strictEqual(result, void 0);
  });
  test("getSubscriptionUnmanaged returns existing subscription without affecting refcount", async () => {
    const mgr = createManager();
    const uri = URI.parse(sessionUri);
    const ref = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    const unmanaged = mgr.getSubscriptionUnmanaged(uri);
    assert.ok(unmanaged);
    assert.strictEqual(unmanaged, ref.object);
    ref.dispose();
    const after = mgr.getSubscriptionUnmanaged(uri);
    assert.strictEqual(after, void 0);
  });
  test("getSubscription retries after a failed subscribe for the same resource", async () => {
    let subscribeAttempts = 0;
    const mgr = createManager(async (resource) => {
      subscribedResources.push(resource.toString());
      subscribeAttempts++;
      if (subscribeAttempts === 1) {
        throw new Error("not found yet");
      }
      return { resource: resource.toString(), state: makeSessionState(resource.toString(), { title: "Retried" }), fromSeq: 0 };
    });
    const uri = URI.parse(sessionUri);
    const failedRef = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.ok(failedRef.object.value instanceof Error);
    const retryRef = mgr.getSubscription(StateComponents.Session, uri, "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual({
      subscribeAttempts,
      retriedTitle: retryRef.object.value.title,
      unmanagedIsRetry: mgr.getSubscriptionUnmanaged(uri) === retryRef.object
    }, {
      subscribeAttempts: 2,
      retriedTitle: "Retried",
      unmanagedIsRetry: true
    });
    failedRef.dispose();
    assert.strictEqual(mgr.getSubscriptionUnmanaged(uri), retryRef.object);
    retryRef.dispose();
    assert.strictEqual(mgr.getSubscriptionUnmanaged(uri), void 0);
  });
  test("getActiveSubscriptions reports kind, refCount, holders and status per active subscription", async () => {
    const mgr = createManager();
    const sUri = URI.parse(sessionUri);
    const tUri = URI.parse(terminalUri);
    const sessionRef = mgr.getSubscription(StateComponents.Session, sUri, "SessionHolder");
    const sessionRef2 = mgr.getSubscription(StateComponents.Session, sUri, "SessionHolder");
    const terminalRef = mgr.getSubscription(StateComponents.Terminal, tUri, "TerminalHolder");
    const map = () => mgr.getActiveSubscriptions().map((s) => ({ resource: s.resource.toString(), kind: s.kind, refCount: s.refCount, holders: s.holders, status: s.status }));
    const pending = map();
    await new Promise((r) => setTimeout(r, 0));
    const active = map();
    assert.deepStrictEqual({ pending, active }, {
      pending: [
        { resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: "SessionHolder", count: 2 }], status: "pending" },
        { resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: "TerminalHolder", count: 1 }], status: "pending" }
      ],
      active: [
        { resource: sessionUri, kind: StateComponents.Session, refCount: 2, holders: [{ owner: "SessionHolder", count: 2 }], status: "snapshot" },
        { resource: terminalUri, kind: StateComponents.Terminal, refCount: 1, holders: [{ owner: "TerminalHolder", count: 1 }], status: "snapshot" }
      ]
    });
    sessionRef.dispose();
    sessionRef2.dispose();
    terminalRef.dispose();
    assert.strictEqual(mgr.getActiveSubscriptions().length, 0);
  });
  test("getActiveSubscriptions tracks distinct holders and drops them as references are disposed", async () => {
    const mgr = createManager();
    const sUri = URI.parse(sessionUri);
    const refA = mgr.getSubscription(StateComponents.Session, sUri, "HolderA");
    const refB = mgr.getSubscription(StateComponents.Session, sUri, "HolderB");
    const refB2 = mgr.getSubscription(StateComponents.Session, sUri, "HolderB");
    await new Promise((r) => setTimeout(r, 0));
    const withAll = mgr.getActiveSubscriptions()[0].holders;
    refB.dispose();
    const afterOneB = mgr.getActiveSubscriptions()[0].holders;
    refB.dispose();
    const afterDoubleDispose = mgr.getActiveSubscriptions()[0].holders;
    refA.dispose();
    refB2.dispose();
    assert.deepStrictEqual({ withAll, afterOneB, afterDoubleDispose, remaining: mgr.getActiveSubscriptions().length }, {
      // Sorted by descending count, so HolderB (2) precedes HolderA (1).
      withAll: [{ owner: "HolderB", count: 2 }, { owner: "HolderA", count: 1 }],
      afterOneB: [{ owner: "HolderA", count: 1 }, { owner: "HolderB", count: 1 }],
      afterDoubleDispose: [{ owner: "HolderA", count: 1 }, { owner: "HolderB", count: 1 }],
      remaining: 0
    });
  });
  test("getActiveSubscriptions reports error status for a failed subscription", async () => {
    const mgr = createManager(async () => {
      throw new Error("nope");
    });
    const ref = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(
      mgr.getActiveSubscriptions().map((s) => ({ kind: s.kind, status: s.status })),
      [{ kind: StateComponents.Session, status: "error" }]
    );
    ref.dispose();
  });
  suite("ordinary optimistic reconnect state", () => {
    test("applyReconnectSnapshot clears pending actions and applies the fresh state", async () => {
      const mgr = createManager();
      const ref = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
      await new Promise((r) => setTimeout(r, 0));
      mgr.dispatchOptimistic(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///ws2" });
      assert.deepStrictEqual(ref.object.value.workingDirectories, ["file:///ws2"]);
      mgr.applyReconnectSnapshot(sessionUri, makeSessionState(sessionUri, { workingDirectories: ["file:///fresh"] }), 5);
      assert.deepStrictEqual(ref.object.value.workingDirectories, ["file:///fresh"]);
      assert.deepStrictEqual(mgr.getPendingSessionActions(), []);
      ref.dispose();
    });
    test("markSubscriptionsMissing clears pending actions and exposes an error", async () => {
      const mgr = createManager();
      const ref = mgr.getSubscription(StateComponents.Session, URI.parse(sessionUri), "test");
      await new Promise((r) => setTimeout(r, 0));
      mgr.dispatchOptimistic(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///ws2" });
      mgr.markSubscriptionsMissing([URI.parse(sessionUri)]);
      assert.ok(ref.object.value instanceof Error);
      assert.deepStrictEqual(mgr.getPendingSessionActions(), []);
      ref.dispose();
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxjb21tb25cXGFnZW50U3Vic2NyaXB0aW9uLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBEaXNwb3NhYmxlU3RvcmUgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9saWZlY3ljbGUuanMnO1xuaW1wb3J0IHsgVVJJIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXJpLmpzJztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBBY3Rpb25FbnZlbG9wZSwgdHlwZSBDbGllbnRDaGFuZ2VzZXRBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgQ2hhbmdlc2V0U3RhdHVzLCBNZXNzYWdlS2luZCwgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgVGVybWluYWxDbGFpbUtpbmQsIFR1cm5TdGF0ZSwgdHlwZSBDaGFuZ2VzZXRTdGF0ZSwgdHlwZSBSb290U3RhdGUsIHR5cGUgU2Vzc2lvblN0YXRlLCB0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFRlcm1pbmFsU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgY3JlYXRlQ2hhdFN0YXRlLCBjcmVhdGVEZWZhdWx0Q2hhdFN1bW1hcnksIFJPT1RfU1RBVEVfVVJJLCBTdGF0ZUNvbXBvbmVudHMsIHR5cGUgQ2hhdFN0YXRlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXIsIENoYW5nZXNldFN0YXRlU3Vic2NyaXB0aW9uLCBDaGF0U3RhdGVTdWJzY3JpcHRpb24sIGlzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcywgUm9vdFN0YXRlU3Vic2NyaXB0aW9uLCBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24sIFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvYWdlbnRTdWJzY3JpcHRpb24uanMnO1xuXG4vLyBIZWxwZXJzXG5cbmZ1bmN0aW9uIG1ha2VSb290U3RhdGUob3ZlcnJpZGVzPzogUGFydGlhbDxSb290U3RhdGU+KTogUm9vdFN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRhZ2VudHM6IFtdLFxuXHRcdGFjdGl2ZVNlc3Npb25zOiAwLFxuXHRcdHRlcm1pbmFsczogW10sXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaTogc3RyaW5nKTogU2Vzc2lvblN1bW1hcnkge1xuXHRyZXR1cm4ge1xuXHRcdHJlc291cmNlOiBzZXNzaW9uVXJpLFxuXHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRjcmVhdGVkQXQ6IG5ldyBEYXRlKDEpLnRvSVNPU3RyaW5nKCksXG5cdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoMSkudG9JU09TdHJpbmcoKSxcblx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaTogc3RyaW5nLCBvdmVycmlkZXM/OiBQYXJ0aWFsPFNlc3Npb25TdGF0ZT4pOiBTZXNzaW9uU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0dGl0bGU6ICdUZXN0Jyxcblx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRwcm9qZWN0OiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC1wcm9qZWN0JywgZGlzcGxheU5hbWU6ICdUZXN0IFByb2plY3QnIH0sXG5cdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLlJlYWR5LFxuXHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdGNoYXRzOiBbXSxcblx0XHQuLi5vdmVycmlkZXMsXG5cdH07XG59XG5cbmZ1bmN0aW9uIG1ha2VDaGF0U3RhdGUoY2hhdFVyaTogc3RyaW5nLCBzZXNzaW9uU3VtbWFyeTogU2Vzc2lvblN1bW1hcnkgPSBtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaSksIG92ZXJyaWRlcz86IFBhcnRpYWw8Q2hhdFN0YXRlPik6IENoYXRTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0Li4uY3JlYXRlQ2hhdFN0YXRlKGNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeShzZXNzaW9uU3VtbWFyeSwgY2hhdFVyaSkpLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZVRlcm1pbmFsU3RhdGUob3ZlcnJpZGVzPzogUGFydGlhbDxUZXJtaW5hbFN0YXRlPik6IFRlcm1pbmFsU3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdHRpdGxlOiAnYmFzaCcsXG5cdFx0Y29udGVudDogW10sXG5cdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZDogJ2MxJyB9LFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fTtcbn1cblxuZnVuY3Rpb24gbWFrZUVudmVsb3BlKGFjdGlvbjogQWN0aW9uRW52ZWxvcGVbJ2FjdGlvbiddLCBzZXJ2ZXJTZXE6IG51bWJlciwgb3JpZ2luPzogQWN0aW9uRW52ZWxvcGVbJ29yaWdpbiddLCByZWplY3Rpb25SZWFzb24/OiBzdHJpbmcsIGNoYW5uZWw/OiBzdHJpbmcpOiBBY3Rpb25FbnZlbG9wZSB7XG5cdGNvbnN0IHJlc29sdmVkQ2hhbm5lbCA9IGNoYW5uZWwgPz8gKFxuXHRcdGFjdGlvbi50eXBlLnN0YXJ0c1dpdGgoJ3Jvb3QvJykgPyBST09UX1NUQVRFX1VSSVxuXHRcdFx0OiBhY3Rpb24udHlwZS5zdGFydHNXaXRoKCdjaGF0LycpID8gY2hhdFVyaVxuXHRcdFx0XHQ6IGFjdGlvbi50eXBlLnN0YXJ0c1dpdGgoJ3Rlcm1pbmFsLycpID8gdGVybWluYWxVcmlcblx0XHRcdFx0XHQ6IGFjdGlvbi50eXBlLnN0YXJ0c1dpdGgoJ2NoYW5nZXNldC8nKSA/IGNoYW5nZXNldFVyaVxuXHRcdFx0XHRcdFx0OiBzZXNzaW9uVXJpXG5cdCk7XG5cdHJldHVybiB7IGNoYW5uZWw6IHJlc29sdmVkQ2hhbm5lbCwgYWN0aW9uLCBzZXJ2ZXJTZXEsIG9yaWdpbiwgcmVqZWN0aW9uUmVhc29uIH07XG59XG5cbmNvbnN0IG5vb3AgPSAoKSA9PiB7IH07XG5jb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy90ZXN0LXNlc3Npb24nIH0pLnRvU3RyaW5nKCk7XG5jb25zdCB0ZXJtaW5hbFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnYWdlbnRob3N0LXRlcm1pbmFsJywgcGF0aDogJy90ZXJtMScgfSkudG9TdHJpbmcoKTtcbmNvbnN0IGNoYXRVcmkgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuY29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L3Nlc3Npb25gO1xuXG5zdWl0ZSgnQ2hhbmdlc2V0U3RhdGVTdWJzY3JpcHRpb24nLCAoKSA9PiB7XG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgnb3B0aW1pc3RpY2FsbHkgYXBwbGllcyBhbmQgcmVjb25jaWxlcyBmaWxlIHJldmlldyBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZTogQ2hhbmdlc2V0U3RhdGUgPSB7XG5cdFx0XHRzdGF0dXM6IENoYW5nZXNldFN0YXR1cy5SZWFkeSxcblx0XHRcdGZpbGVzOiBbe1xuXHRcdFx0XHRpZDogJ2ZpbGU6Ly8vdGVzdC50eHQnLFxuXHRcdFx0XHRlZGl0OiB7XG5cdFx0XHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC50eHQnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYmVmb3JlLnR4dCcgfSB9LFxuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC50eHQnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWZ0ZXIudHh0JyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGNvbnN0IHN1YnNjcmlwdGlvbiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQ2hhbmdlc2V0U3RhdGVTdWJzY3JpcHRpb24oY2hhbmdlc2V0VXJpLCAnYzEnLCAoKSA9PiAxLCBub29wKSk7XG5cdFx0c3Vic2NyaXB0aW9uLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblxuXHRcdGNvbnN0IGFjdGlvbjogQ2xpZW50Q2hhbmdlc2V0QWN0aW9uID0ge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGFuZ2VzZXRGaWxlc1Jldmlld0NoYW5nZWQsXG5cdFx0XHRmaWxlczogWydmaWxlOi8vL3Rlc3QudHh0J10sXG5cdFx0XHRyZXZpZXdlZDogdHJ1ZSxcblx0XHR9O1xuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1YnNjcmlwdGlvbi5hcHBseU9wdGltaXN0aWMoYWN0aW9uKTtcblx0XHRjb25zdCBvcHRpbWlzdGljU3RhdGUgPSBzdWJzY3JpcHRpb24udmFsdWUgYXMgQ2hhbmdlc2V0U3RhdGU7XG5cdFx0c3Vic2NyaXB0aW9uLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoYWN0aW9uLCAxLCB7IGNsaWVudElkOiAnYzEnLCBjbGllbnRTZXEgfSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRvcHRpbWlzdGljUmV2aWV3ZWQ6IG9wdGltaXN0aWNTdGF0ZS5maWxlc1swXS5yZXZpZXdlZCxcblx0XHRcdHZlcmlmaWVkQmVmb3JlRWNobzogc3RhdGUuZmlsZXNbMF0ucmV2aWV3ZWQsXG5cdFx0XHR2ZXJpZmllZEFmdGVyRWNobzogc3Vic2NyaXB0aW9uLnZlcmlmaWVkVmFsdWU/LmZpbGVzWzBdLnJldmlld2VkLFxuXHRcdFx0cGVuZGluZ0NsZWFyZWQ6IHN1YnNjcmlwdGlvbi52YWx1ZSA9PT0gc3Vic2NyaXB0aW9uLnZlcmlmaWVkVmFsdWUsXG5cdFx0fSwge1xuXHRcdFx0b3B0aW1pc3RpY1Jldmlld2VkOiB0cnVlLFxuXHRcdFx0dmVyaWZpZWRCZWZvcmVFY2hvOiB1bmRlZmluZWQsXG5cdFx0XHR2ZXJpZmllZEFmdGVyRWNobzogdHJ1ZSxcblx0XHRcdHBlbmRpbmdDbGVhcmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxufSk7XG5cbi8vIFJvb3RTdGF0ZVN1YnNjcmlwdGlvblxuXG5zdWl0ZSgnUm9vdFN0YXRlU3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0dGVzdCgndmFsdWUgaXMgdW5kZWZpbmVkIGJlZm9yZSBzbmFwc2hvdCcsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgdW5kZWZpbmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZlcmlmaWVkVmFsdWUsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVNuYXBzaG90IHNldHMgdmFsdWUgYW5kIHZlcmlmaWVkVmFsdWUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oJ2MxJywgbm9vcCkpO1xuXHRcdGNvbnN0IHN0YXRlID0gbWFrZVJvb3RTdGF0ZSh7IGFjdGl2ZVNlc3Npb25zOiAzIH0pO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChzdGF0ZSwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmFsdWUsIHN0YXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlLCBzdGF0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2hhbmRsZVNuYXBzaG90IGZpcmVzIG9uRGlkQ2hhbmdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHRjb25zdCBmaXJlZDogUm9vdFN0YXRlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3ViLm9uRGlkQ2hhbmdlKHMgPT4gZmlyZWQucHVzaChzKSkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlUm9vdFN0YXRlKCksIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaXJlZC5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNlaXZlRW52ZWxvcGUgdXBkYXRlcyBzdGF0ZSBmb3Igcm9vdCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVJvb3RTdGF0ZSgpLCAwKTtcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogNSB9LFxuXHRcdFx0MSxcblx0XHQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBSb290U3RhdGUpLmFjdGl2ZVNlc3Npb25zLCA1KTtcblx0fSk7XG5cblx0dGVzdCgnaWdub3JlcyBub24tcm9vdCBhY3Rpb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VSb290U3RhdGUoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3Qoc3RhdGUsIDApO1xuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSxcblx0XHRcdDEsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmFsdWUsIHN0YXRlKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyZXMgb25XaWxsQXBwbHlBY3Rpb24gYW5kIG9uRGlkQXBwbHlBY3Rpb24gYXJvdW5kIGVudmVsb3BlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgUm9vdFN0YXRlU3Vic2NyaXB0aW9uKCdjMScsIG5vb3ApKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVJvb3RTdGF0ZSgpLCAwKTtcblx0XHRjb25zdCBldmVudHM6IHN0cmluZ1tdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1Yi5vbldpbGxBcHBseUFjdGlvbigoKSA9PiBldmVudHMucHVzaCgnd2lsbCcpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKHN1Yi5vbkRpZEFwcGx5QWN0aW9uKCgpID0+IGV2ZW50cy5wdXNoKCdkaWQnKSkpO1xuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlJvb3RBY3RpdmVTZXNzaW9uc0NoYW5nZWQsIGFjdGl2ZVNlc3Npb25zOiAxIH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLCBbJ3dpbGwnLCAnZGlkJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdidWZmZXJzIGVudmVsb3BlcyBiZWZvcmUgc25hcHNob3QgYW5kIHJlcGxheXMgYWZ0ZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBSb290U3RhdGVTdWJzY3JpcHRpb24oJ2MxJywgbm9vcCkpO1xuXHRcdC8vIFNlbmQgZW52ZWxvcGUgYmVmb3JlIHNuYXBzaG90XG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDcgfSxcblx0XHRcdDIsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgdW5kZWZpbmVkKTtcblxuXHRcdC8vIE5vdyBhcHBseSBzbmFwc2hvdCB3aXRoIGZyb21TZXE9MTsgZW52ZWxvcGUgYXQgc2VxIDIgc2hvdWxkIHJlcGxheVxuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlUm9vdFN0YXRlKCksIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc3ViLnZhbHVlISBhcyBSb290U3RhdGUpLmFjdGl2ZVNlc3Npb25zLCA3KTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVyZWQgZW52ZWxvcGVzIHdpdGggc2VydmVyU2VxIDw9IGZyb21TZXEgYXJlIGRpc2NhcmRlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDk5IH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlUm9vdFN0YXRlKHsgYWN0aXZlU2Vzc2lvbnM6IDAgfSksIDEpO1xuXHRcdC8vIEVudmVsb3BlIGF0IHNlcSAxIHNob3VsZCBub3QgcmVwbGF5IHNpbmNlIGZyb21TZXEgPT09IDFcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBSb290U3RhdGUpLmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2V0RXJyb3IgbWFrZXMgdmFsdWUgcmV0dXJuIHRoZSBlcnJvcicsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFJvb3RTdGF0ZVN1YnNjcmlwdGlvbignYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VSb290U3RhdGUoKSwgMCk7XG5cdFx0Y29uc3QgZXJyID0gbmV3IEVycm9yKCdmYWlsZWQnKTtcblx0XHRjb25zdCBlcnJvcnM6IEVycm9yW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQoc3ViLm9uRGlkRXJyb3IoZXJyb3IgPT4gZXJyb3JzLnB1c2goZXJyb3IpKSk7XG5cdFx0c3ViLnNldEVycm9yKGVycik7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR2YWx1ZTogc3ViLnZhbHVlLFxuXHRcdFx0dmVyaWZpZWRWYWx1ZUV4aXN0czogISFzdWIudmVyaWZpZWRWYWx1ZSxcblx0XHRcdGVycm9ycyxcblx0XHR9LCB7XG5cdFx0XHR2YWx1ZTogZXJyLFxuXHRcdFx0dmVyaWZpZWRWYWx1ZUV4aXN0czogdHJ1ZSxcblx0XHRcdGVycm9yczogW2Vycl0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8vIFNlc3Npb25TdGF0ZVN1YnNjcmlwdGlvblxuXG5zdWl0ZSgnU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VxOiBudW1iZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHNlcSA9IDA7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN1Yih1cmk6IHN0cmluZyA9IHNlc3Npb25VcmksIGNsaWVudElkOiBzdHJpbmcgPSAnYzEnKTogU2Vzc2lvblN0YXRlU3Vic2NyaXB0aW9uIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBTZXNzaW9uU3RhdGVTdWJzY3JpcHRpb24odXJpLCBjbGllbnRJZCwgKCkgPT4gKytzZXEsIG5vb3ApKTtcblx0fVxuXG5cdHRlc3QoJ3ZhbHVlIGlzIHVuZGVmaW5lZCBiZWZvcmUgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaGFuZGxlU25hcHNob3Qgc2V0cyB2YWx1ZSBhbmQgdmVyaWZpZWRWYWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgc3RhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3ViLnZlcmlmaWVkVmFsdWUsIHN0YXRlKTtcblx0fSk7XG5cblx0dGVzdCgnYXBwbHlPcHRpbWlzdGljIHJldHVybnMgY2xpZW50U2VxIGFuZCB1cGRhdGVzIHZhbHVlIGJ1dCBub3QgdmVyaWZpZWRWYWx1ZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdPcHRpbWlzdGljJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGllbnRTZXEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc3ViLnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdPcHRpbWlzdGljJyk7XG5cdFx0Ly8gdmVyaWZpZWRWYWx1ZSBzaG91bGQgcmVtYWluIHVuY2hhbmdlZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmVyaWZpZWRWYWx1ZSEudGl0bGUsICdUZXN0Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmZpcm1lZCBvd24gYWN0aW9uIHJlbW92ZXMgcGVuZGluZyBhbmQgdXBkYXRlcyBjb25maXJtZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSksIDApO1xuXG5cdFx0Y29uc3QgY2xpZW50U2VxID0gc3ViLmFwcGx5T3B0aW1pc3RpYyh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogJ09wdGltaXN0aWMnLFxuXHRcdH0pO1xuXG5cdFx0Ly8gU2VydmVyIGNvbmZpcm1zIHRoZSBhY3Rpb25cblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ09wdGltaXN0aWMnIH0sXG5cdFx0XHQxLFxuXHRcdFx0eyBjbGllbnRJZDogJ2MxJywgY2xpZW50U2VxIH0sXG5cdFx0KSk7XG5cblx0XHQvLyBBZnRlciBjb25maXJtYXRpb24sIHZlcmlmaWVkVmFsdWUgc2hvdWxkIG1hdGNoXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlIS50aXRsZSwgJ09wdGltaXN0aWMnKTtcblx0XHQvLyBObyBwZW5kaW5nLCB2YWx1ZSBmYWxscyB0aHJvdWdoIHRvIGNvbmZpcm1lZFxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc3ViLnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdPcHRpbWlzdGljJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlamVjdGVkIG93biBhY3Rpb24gcmVtb3ZlcyBwZW5kaW5nIHdpdGhvdXQgdXBkYXRpbmcgY29uZmlybWVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdPcHRpbWlzdGljJyxcblx0XHR9KTtcblxuXHRcdC8vIFNlcnZlciByZWplY3RzIHRoZSBhY3Rpb25cblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ09wdGltaXN0aWMnIH0sXG5cdFx0XHQxLFxuXHRcdFx0eyBjbGllbnRJZDogJ2MxJywgY2xpZW50U2VxIH0sXG5cdFx0XHQnZGVuaWVkJyxcblx0XHQpKTtcblxuXHRcdC8vIENvbmZpcm1lZCBzdGF0ZSB1bmNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZlcmlmaWVkVmFsdWUhLnRpdGxlLCAnVGVzdCcpO1xuXHRcdC8vIE5vIG1vcmUgcGVuZGluZywgdmFsdWUgPSBjb25maXJtZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnVGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JlaWduIGFjdGlvbiB1cGRhdGVzIGNvbmZpcm1lZCBhbmQgcmVjb21wdXRlcyBvcHRpbWlzdGljJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdC8vIExvY2FsIG9wdGltaXN0aWMgYWN0aW9uXG5cdFx0c3ViLmFwcGx5T3B0aW1pc3RpYyh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsXG5cdFx0XHR0aXRsZTogJ0xvY2FsJyxcblx0XHR9KTtcblxuXHRcdC8vIEZvcmVpZ24gYWN0aW9uIGFycml2ZXNcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0sXG5cdFx0XHQxLFxuXHRcdFx0eyBjbGllbnRJZDogJ290aGVyLWNsaWVudCcsIGNsaWVudFNlcTogMSB9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gQ29uZmlybWVkIHN0YXRlIHNob3VsZCBoYXZlIFNlc3Npb25SZWFkeSBhcHBsaWVkXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlIS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuUmVhZHkpO1xuXHRcdC8vIE9wdGltaXN0aWMgc2hvdWxkIHN0aWxsIGhhdmUgJ0xvY2FsJyB0aXRsZSBvbiB0b3Bcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnTG9jYWwnKTtcblx0fSk7XG5cblx0dGVzdCgnc2VydmVyIHRlcm1pbmFsIHR1cm4gYWN0aW9uIHJlbWFpbnMgaWdub3JlZCBieSBzZXNzaW9uIHN1YnNjcmlwdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm4tMScsIGR1cmF0aW9uOiAxMDAwIH0sXG5cdFx0XHQxLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdWIudmFsdWUsIHN0YXRlKTtcblx0fSk7XG5cblx0dGVzdCgnYWZ0ZXIgYWxsIHBlbmRpbmcgY2xlYXJlZCwgdmFsdWUgZmFsbHMgdGhyb3VnaCB0byB2ZXJpZmllZFZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1Yi5hcHBseU9wdGltaXN0aWMoe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLFxuXHRcdFx0dGl0bGU6ICdUZW1wJyxcblx0XHR9KTtcblxuXHRcdC8vIENvbmZpcm0gdGhlIHBlbmRpbmcgYWN0aW9uXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdUZW1wJyB9LFxuXHRcdFx0MSxcblx0XHRcdHsgY2xpZW50SWQ6ICdjMScsIGNsaWVudFNlcSB9LFxuXHRcdCkpO1xuXG5cdFx0Ly8gdmFsdWUgYW5kIHZlcmlmaWVkVmFsdWUgc2hvdWxkIGJlIHRoZSBzYW1lIG9iamVjdCByZWZlcmVuY2Vcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZhbHVlLCBzdWIudmVyaWZpZWRWYWx1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NsZWFyUGVuZGluZyByZXNldHMgb3B0aW1pc3RpYyBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cblx0XHRzdWIuYXBwbHlPcHRpbWlzdGljKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnUGVuZGluZycsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnUGVuZGluZycpO1xuXG5cdFx0c3ViLmNsZWFyUGVuZGluZygpO1xuXG5cdFx0Ly8gU2hvdWxkIGZhbGwgYmFjayB0byBjb25maXJtZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLCAnVGVzdCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGFjdGlvbnMgZm9yIGRpZmZlcmVudCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnT3RoZXInIH0sXG5cdFx0XHQxLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdFx0J2NvcGlsb3Q6L290aGVyLXNlc3Npb24nLFxuXHRcdCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ1Rlc3QnKTtcblx0fSk7XG5cblx0dGVzdCgnYnVmZmVycyBlbnZlbG9wZXMgYmVmb3JlIHNuYXBzaG90IGFuZCByZXBsYXlzIGFmdGVyJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdCdWZmZXJlZCcgfSxcblx0XHRcdDIsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZhbHVlLCB1bmRlZmluZWQpO1xuXG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSksIDEpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUhIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdCdWZmZXJlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdmaXJlcyBvbkRpZENoYW5nZSBvbiBvcHRpbWlzdGljIGFwcGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGNyZWF0ZVN1YigpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblxuXHRcdGNvbnN0IGZpcmVkOiBTZXNzaW9uU3RhdGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChzdWIub25EaWRDaGFuZ2UocyA9PiBmaXJlZC5wdXNoKHMpKSk7XG5cblx0XHRzdWIuYXBwbHlPcHRpbWlzdGljKHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnQ2hhbmdlZCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlyZWRbMF0udGl0bGUsICdDaGFuZ2VkJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvcmRpbmFyeSBvcHRpbWlzdGljIHdvcmtpbmctZGlyZWN0b3J5IGFjdGlvbnMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdhY2NlcHRlZCBhY3Rpb24gbW92ZXMgdGhlIG9wdGltaXN0aWMgZGlyZWN0b3J5IGludG8gY29uZmlybWVkIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSwgMCk7XG5cdFx0XHRjb25zdCBhY3Rpb24gPSB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbldvcmtpbmdEaXJlY3RvcnlTZXQgYXMgY29uc3QsIGRpcmVjdG9yeTogJ2ZpbGU6Ly8vd3MyJyB9O1xuXG5cdFx0XHRjb25zdCBjbGllbnRTZXEgPSBzdWIuYXBwbHlPcHRpbWlzdGljKGFjdGlvbik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS53b3JraW5nRGlyZWN0b3JpZXMsIFsnZmlsZTovLy93czInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZlcmlmaWVkVmFsdWU/LndvcmtpbmdEaXJlY3RvcmllcywgdW5kZWZpbmVkKTtcblxuXHRcdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoYWN0aW9uLCAxLCB7IGNsaWVudElkOiAnYzEnLCBjbGllbnRTZXEgfSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1Yi52ZXJpZmllZFZhbHVlPy53b3JraW5nRGlyZWN0b3JpZXMsIFsnZmlsZTovLy93czInXSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3ViLnZhbHVlLCBzdWIudmVyaWZpZWRWYWx1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWplY3RlZCBhY3Rpb24gcm9sbHMgb3B0aW1pc3RpYyB3b3JraW5nIGRpcmVjdG9yaWVzIGJhY2snLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdWIgPSBjcmVhdGVTdWIoKTtcblx0XHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCAwKTtcblx0XHRcdGNvbnN0IGFjdGlvbiA9IHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCBhcyBjb25zdCwgZGlyZWN0b3J5OiAnZmlsZTovLy93czInIH07XG5cblx0XHRcdGNvbnN0IGNsaWVudFNlcSA9IHN1Yi5hcHBseU9wdGltaXN0aWMoYWN0aW9uKTtcblx0XHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKGFjdGlvbiwgMSwgeyBjbGllbnRJZDogJ2MxJywgY2xpZW50U2VxIH0sICdkZW5pZWQnKSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWIudmVyaWZpZWRWYWx1ZT8ud29ya2luZ0RpcmVjdG9yaWVzLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS53b3JraW5nRGlyZWN0b3JpZXMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG5cbi8vIENoYXRTdGF0ZVN1YnNjcmlwdGlvblxuXG5zdWl0ZSgnQ2hhdFN0YXRlU3Vic2NyaXB0aW9uJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgc2VxOiBudW1iZXI7XG5cblx0c2V0dXAoKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRcdHNlcSA9IDA7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIGNyZWF0ZVN1Yih1cmk6IHN0cmluZyA9IGNoYXRVcmksIGNsaWVudElkOiBzdHJpbmcgPSAnYzEnKTogQ2hhdFN0YXRlU3Vic2NyaXB0aW9uIHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBDaGF0U3RhdGVTdWJzY3JpcHRpb24odXJpLCBjbGllbnRJZCwgKCkgPT4gKytzZXEsIG5vb3ApKTtcblx0fVxuXG5cdHRlc3QoJ3NlcnZlciB0ZXJtaW5hbCB0dXJuIGFjdGlvbiBkcm9wcyBzdGFsZSBvcHRpbWlzdGljIHR1cm4gc3RhcnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gY3JlYXRlU3ViKCk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VDaGF0U3RhdGUoY2hhdFVyaSksIDApO1xuXG5cdFx0c3ViLmFwcGx5T3B0aW1pc3RpYyh7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBDaGF0U3RhdGUgfCB1bmRlZmluZWQpPy5hY3RpdmVUdXJuPy5pZCwgJ3R1cm4tMScpO1xuXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRcdDEsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGl2ZVR1cm46IChzdWIudmFsdWUgYXMgQ2hhdFN0YXRlIHwgdW5kZWZpbmVkKT8uYWN0aXZlVHVybixcblx0XHRcdHR1cm5zOiAoc3ViLnZhbHVlIGFzIENoYXRTdGF0ZSB8IHVuZGVmaW5lZCk/LnR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCBzdGF0ZTogdHVybi5zdGF0ZSB9KSksXG5cdFx0fSwge1xuXHRcdFx0YWN0aXZlVHVybjogdW5kZWZpbmVkLFxuXHRcdFx0dHVybnM6IFt7IGlkOiAndHVybi0xJywgc3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSB9XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuLy8gVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvblxuXG5zdWl0ZSgnVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2FjY2VwdHMgdGVybWluYWwgYWN0aW9ucyBtYXRjaGluZyBpdHMgVVJJJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbih0ZXJtaW5hbFVyaSwgJ2MxJywgbm9vcCkpO1xuXHRcdHN1Yi5oYW5kbGVTbmFwc2hvdChtYWtlVGVybWluYWxTdGF0ZSgpLCAwKTtcblxuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2hlbGxvJyB9LFxuXHRcdFx0MSxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBUZXJtaW5hbFN0YXRlKS5jb250ZW50LCBbXG5cdFx0XHR7IHR5cGU6ICd1bmNsYXNzaWZpZWQnLCB2YWx1ZTogJ2hlbGxvJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkYXRhIGJldHdlZW4gY29tbWFuZCBleGVjdXRlZCBhbmQgZmluaXNoZWQgaXMgYXR0cmlidXRlZCB0byB0aGUgY29tbWFuZCcsICgpID0+IHtcblx0XHRjb25zdCBzdWIgPSBkaXNwb3NhYmxlcy5hZGQobmV3IFRlcm1pbmFsU3RhdGVTdWJzY3JpcHRpb24odGVybWluYWxVcmksICdjMScsIG5vb3ApKTtcblx0XHRzdWIuaGFuZGxlU25hcHNob3QobWFrZVRlcm1pbmFsU3RhdGUoKSwgMCk7XG5cblx0XHQvLyBUaGUgc2VydmVyIGRpc3BhdGNoZXMgZGF0YSBpbiBzdHJlYW0gb3JkZXIgcmVsYXRpdmUgdG8gY29tbWFuZFxuXHRcdC8vIGV2ZW50cywgc28gYSBjb21tYW5kJ3Mgb3V0cHV0IGFycml2ZXMgYmV0d2VlbiB0aGUgZXhlY3V0ZWQgYW5kXG5cdFx0Ly8gZmluaXNoZWQgYWN0aW9ucyBhbmQgbXVzdCBsYW5kIGluIHRoZSBjb21tYW5kIHBhcnQsIG5vdCBpbiBhXG5cdFx0Ly8gdHJhaWxpbmcgdW5jbGFzc2lmaWVkIHBhcnQuXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxDb21tYW5kRXhlY3V0ZWQsIGNvbW1hbmRJZDogJ2NtZC0xJywgY29tbWFuZExpbmU6ICdlY2hvIGhpJywgdGltZXN0YW1wOiAxMDAwIH0sXG5cdFx0XHQxLFxuXHRcdCkpO1xuXHRcdHN1Yi5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsRGF0YSwgZGF0YTogJ2hpXFxyXFxuJyB9LFxuXHRcdFx0Mixcblx0XHQpKTtcblx0XHRzdWIucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENvbW1hbmRGaW5pc2hlZCwgY29tbWFuZElkOiAnY21kLTEnLCBleGl0Q29kZTogMCwgZHVyYXRpb25NczogNSB9LFxuXHRcdFx0Myxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBUZXJtaW5hbFN0YXRlKS5jb250ZW50LCBbe1xuXHRcdFx0dHlwZTogJ2NvbW1hbmQnLFxuXHRcdFx0Y29tbWFuZElkOiAnY21kLTEnLFxuXHRcdFx0Y29tbWFuZExpbmU6ICdlY2hvIGhpJyxcblx0XHRcdG91dHB1dDogJ2hpXFxyXFxuJyxcblx0XHRcdHRpbWVzdGFtcDogMTAwMCxcblx0XHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0XHRleGl0Q29kZTogMCxcblx0XHRcdGR1cmF0aW9uTXM6IDUsXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIHRlcm1pbmFsIGFjdGlvbnMgZm9yIG90aGVyIFVSSXMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uKHRlcm1pbmFsVXJpLCAnYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VUZXJtaW5hbFN0YXRlKCksIDApO1xuXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxEYXRhLCBkYXRhOiAnbm9wZScgfSxcblx0XHRcdDEsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHR1bmRlZmluZWQsXG5cdFx0XHQnYWdlbnRob3N0LXRlcm1pbmFsOi9vdGhlci10ZXJtJyxcblx0XHQpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHN1Yi52YWx1ZSBhcyBUZXJtaW5hbFN0YXRlKS5jb250ZW50LCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgbm9uLXRlcm1pbmFsIGFjdGlvbnMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3ViID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBUZXJtaW5hbFN0YXRlU3Vic2NyaXB0aW9uKHRlcm1pbmFsVXJpLCAnYzEnLCBub29wKSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KG1ha2VUZXJtaW5hbFN0YXRlKCksIDApO1xuXG5cdFx0c3ViLnJlY2VpdmVFbnZlbG9wZShtYWtlRW52ZWxvcGUoXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCwgYWN0aXZlU2Vzc2lvbnM6IDUgfSxcblx0XHRcdDEsXG5cdFx0KSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChzdWIudmFsdWUgYXMgVGVybWluYWxTdGF0ZSkuY29udGVudCwgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVTbmFwc2hvdCBzZXRzIHZhbHVlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN1YiA9IGRpc3Bvc2FibGVzLmFkZChuZXcgVGVybWluYWxTdGF0ZVN1YnNjcmlwdGlvbih0ZXJtaW5hbFVyaSwgJ2MxJywgbm9vcCkpO1xuXHRcdGNvbnN0IHN0YXRlID0gbWFrZVRlcm1pbmFsU3RhdGUoeyB0aXRsZTogJ3pzaCcgfSk7XG5cdFx0c3ViLmhhbmRsZVNuYXBzaG90KHN0YXRlLCAwKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN1Yi52YWx1ZSwgc3RhdGUpO1xuXHR9KTtcbn0pO1xuXG4vLyBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXJcblxuc3VpdGUoJ0FnZW50U3Vic2NyaXB0aW9uTWFuYWdlcicsICgpID0+IHtcblxuXHRsZXQgZGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0bGV0IHNlcTogbnVtYmVyO1xuXHRsZXQgc3Vic2NyaWJlZFJlc291cmNlczogc3RyaW5nW107XG5cdGxldCB1bnN1YnNjcmliZWRSZXNvdXJjZXM6IHN0cmluZ1tdO1xuXG5cdHNldHVwKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRzZXEgPSAwO1xuXHRcdHN1YnNjcmliZWRSZXNvdXJjZXMgPSBbXTtcblx0XHR1bnN1YnNjcmliZWRSZXNvdXJjZXMgPSBbXTtcblx0fSk7XG5cblx0dGVhcmRvd24oKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0ZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0ZnVuY3Rpb24gY3JlYXRlTWFuYWdlcihzdWJzY3JpYmU6IChyZXNvdXJjZTogVVJJKSA9PiBQcm9taXNlPHsgcmVzb3VyY2U6IHN0cmluZzsgc3RhdGU6IFNlc3Npb25TdGF0ZSB8IFRlcm1pbmFsU3RhdGUgfCBDaGFuZ2VzZXRTdGF0ZTsgZnJvbVNlcTogbnVtYmVyIH0+ID0gYXN5bmMgKHJlc291cmNlKSA9PiB7XG5cdFx0c3Vic2NyaWJlZFJlc291cmNlcy5wdXNoKHJlc291cmNlLnRvU3RyaW5nKCkpO1xuXHRcdGNvbnN0IGtleSA9IHJlc291cmNlLnRvU3RyaW5nKCk7XG5cdFx0aWYgKGtleS5zdGFydHNXaXRoKCdjb3BpbG90OicpKSB7XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZToga2V5LCBzdGF0ZTogbWFrZVNlc3Npb25TdGF0ZShrZXkpLCBmcm9tU2VxOiAwIH07XG5cdFx0fVxuXHRcdHJldHVybiB7IHJlc291cmNlOiBrZXksIHN0YXRlOiBtYWtlVGVybWluYWxTdGF0ZSgpLCBmcm9tU2VxOiAwIH07XG5cdH0pOiBBZ2VudFN1YnNjcmlwdGlvbk1hbmFnZXIge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IEFnZW50U3Vic2NyaXB0aW9uTWFuYWdlcihcblx0XHRcdCdjMScsXG5cdFx0XHQoKSA9PiArK3NlcSxcblx0XHRcdG5vb3AsXG5cdFx0XHRzdWJzY3JpYmUsXG5cdFx0XHQocmVzb3VyY2UpID0+IHtcblx0XHRcdFx0dW5zdWJzY3JpYmVkUmVzb3VyY2VzLnB1c2gocmVzb3VyY2UudG9TdHJpbmcoKSk7XG5cdFx0XHR9LFxuXHRcdCkpO1xuXHR9XG5cblx0dGVzdCgncm9vdFN0YXRlIGlzIGF2YWlsYWJsZSBpbW1lZGlhdGVseScsICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0YXNzZXJ0Lm9rKG1nci5yb290U3RhdGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZ3Iucm9vdFN0YXRlLnZhbHVlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdoYW5kbGVSb290U25hcHNob3QgaW5pdGlhbGl6ZXMgcm9vdCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBtYWtlUm9vdFN0YXRlKHsgYWN0aXZlU2Vzc2lvbnM6IDIgfSk7XG5cdFx0bWdyLmhhbmRsZVJvb3RTbmFwc2hvdChzdGF0ZSwgMCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZ3Iucm9vdFN0YXRlLnZhbHVlLCBzdGF0ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFN1YnNjcmlwdGlvbiByZXR1cm5zIElSZWZlcmVuY2Ugd2l0aCBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHVyaSwgJ3Rlc3QnKTtcblxuXHRcdGFzc2VydC5vayhyZWYub2JqZWN0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmLm9iamVjdC52YWx1ZSwgdW5kZWZpbmVkKTsgLy8gbm90IHlldCBpbml0aWFsaXplZCAoYXN5bmMpXG5cblx0XHQvLyBXYWl0IGZvciBhc3luYyBzdWJzY3JpYmVcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlZi5vYmplY3QudmFsdWUpO1xuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlY29uZCBjYWxsIGZvciBzYW1lIHJlc291cmNlIGluY3JlbWVudHMgcmVmY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCByZWYxID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cdFx0Y29uc3QgcmVmMiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdC8vIFNob3VsZCBiZSB0aGUgc2FtZSBzdWJzY3JpcHRpb24gb2JqZWN0XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlZjEub2JqZWN0LCByZWYyLm9iamVjdCk7XG5cblx0XHQvLyBEaXNwb3Npbmcgb25lIHJlZiBzaG91bGQgbm90IHRyaWdnZXIgdW5zdWJzY3JpYmVcblx0XHRyZWYxLmRpc3Bvc2UoKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5zdWJzY3JpYmVkUmVzb3VyY2VzLmxlbmd0aCwgMCk7XG5cblx0XHQvLyBEaXNwb3NpbmcgdGhlIGxhc3QgcmVmIHNob3VsZCB0cmlnZ2VyIHVuc3Vic2NyaWJlXG5cdFx0cmVmMi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVuc3Vic2NyaWJlZFJlc291cmNlcy5sZW5ndGgsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NpbmcgbGFzdCByZWYgY2FsbHMgdW5zdWJzY3JpYmUgY2FsbGJhY2snLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHVyaSwgJ3Rlc3QnKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5vayh1bnN1YnNjcmliZWRSZXNvdXJjZXMuaW5jbHVkZXMoc2Vzc2lvblVyaSkpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZWNlaXZlRW52ZWxvcGUgcm91dGVzIHRvIHJvb3QgYW5kIGFsbCBhY3RpdmUgc3Vic2NyaXB0aW9ucycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0bWdyLmhhbmRsZVJvb3RTbmFwc2hvdChtYWtlUm9vdFN0YXRlKCksIDApO1xuXG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHNlc3Npb25VcmkpO1xuXHRcdGNvbnN0IHJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHQvLyBTZW5kIGEgcm9vdCBhY3Rpb25cblx0XHRtZ3IucmVjZWl2ZUVudmVsb3BlKG1ha2VFbnZlbG9wZShcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogMTAgfSxcblx0XHRcdDEsXG5cdFx0KSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChtZ3Iucm9vdFN0YXRlLnZhbHVlIGFzIFJvb3RTdGF0ZSkuYWN0aXZlU2Vzc2lvbnMsIDEwKTtcblxuXHRcdC8vIFNlbmQgYSBzZXNzaW9uIGFjdGlvblxuXHRcdG1nci5yZWNlaXZlRW52ZWxvcGUobWFrZUVudmVsb3BlKFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnUm91dGVkJyB9LFxuXHRcdFx0Mixcblx0XHQpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlZi5vYmplY3QudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS50aXRsZSwgJ1JvdXRlZCcpO1xuXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblx0fSk7XG5cblx0dGVzdCgnaXNBY3Rpb25FbnZlbG9wZVJlbGV2YW50VG9TdWJzY3JpcHRpb25VcmlzIGZpbHRlcnMgYnkgc3Vic2NyaWJlZCBjaGFubmVsJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cm9vdFZhcmlhbnQ6IGlzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcyhcblx0XHRcdFx0bWFrZUVudmVsb3BlKHsgdHlwZTogQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkLCBhY3RpdmVTZXNzaW9uczogMSB9LCAxLCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgUk9PVF9TVEFURV9VUkkpLFxuXHRcdFx0XHRbJ2FocC1yb290OiddLFxuXHRcdFx0KSxcblx0XHRcdHJvb3RPbmx5R2V0c1Nlc3Npb246IGlzQWN0aW9uRW52ZWxvcGVSZWxldmFudFRvU3Vic2NyaXB0aW9uVXJpcyhcblx0XHRcdFx0bWFrZUVudmVsb3BlKHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ05vcGUnIH0sIDIpLFxuXHRcdFx0XHRbJ2FocC1yb290OiddLFxuXHRcdFx0KSxcblx0XHRcdGV4YWN0U2Vzc2lvbjogaXNBY3Rpb25FbnZlbG9wZVJlbGV2YW50VG9TdWJzY3JpcHRpb25VcmlzKFxuXHRcdFx0XHRtYWtlRW52ZWxvcGUoeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnWWVwJyB9LCAzKSxcblx0XHRcdFx0WydhaHAtcm9vdDonLCBzZXNzaW9uVXJpXSxcblx0XHRcdCksXG5cdFx0fSwge1xuXHRcdFx0cm9vdFZhcmlhbnQ6IHRydWUsXG5cdFx0XHRyb290T25seUdldHNTZXNzaW9uOiBmYWxzZSxcblx0XHRcdGV4YWN0U2Vzc2lvbjogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY3JlYXRpbmcgc2Vzc2lvbiBzdWJzY3JpcHRpb24gZm9yIGNvcGlsb3Q6IFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgbXlTZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy9teS1zZXNzaW9uJyB9KTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIG15U2Vzc2lvblVyaSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0Lm9rKHJlZi5vYmplY3QudmFsdWUpO1xuXHRcdGFzc2VydC5vayhzdWJzY3JpYmVkUmVzb3VyY2VzLmluY2x1ZGVzKG15U2Vzc2lvblVyaS50b1N0cmluZygpKSk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdjcmVhdGluZyB0ZXJtaW5hbCBzdWJzY3JpcHRpb24gZm9yIHRlcm1pbmFsIFVSSScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHRlcm1pbmFsVXJpKTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFRlcm1pbmFsU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgdXJpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQub2socmVmLm9iamVjdC52YWx1ZSk7XG5cdFx0YXNzZXJ0Lm9rKHN1YnNjcmliZWRSZXNvdXJjZXMuaW5jbHVkZXModGVybWluYWxVcmkpKTtcblxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoT3B0aW1pc3RpYyBhcHBsaWVzIHRvIG1hdGNoaW5nIHNlc3Npb24gc3Vic2NyaXB0aW9uJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IG1nci5kaXNwYXRjaE9wdGltaXN0aWModXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCxcblx0XHRcdHRpdGxlOiAnRGlzcGF0Y2hlZCcsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQub2soY2xpZW50U2VxID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChyZWYub2JqZWN0LnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkudGl0bGUsICdEaXNwYXRjaGVkJyk7XG5cdFx0Ly8gdmVyaWZpZWRWYWx1ZSB1bmNoYW5nZWRcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVmLm9iamVjdC52ZXJpZmllZFZhbHVlIS50aXRsZSwgJ1Rlc3QnKTtcblxuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Rpc3BhdGNoT3B0aW1pc3RpYyBhcHBsaWVzIHRvIG1hdGNoaW5nIGNoYW5nZXNldCBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGU6IENoYW5nZXNldFN0YXRlID0ge1xuXHRcdFx0c3RhdHVzOiBDaGFuZ2VzZXRTdGF0dXMuUmVhZHksXG5cdFx0XHRmaWxlczogW3tcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3Rlc3QudHh0Jyxcblx0XHRcdFx0ZWRpdDoge1xuXHRcdFx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdGVzdC50eHQnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYWZ0ZXIudHh0JyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHR9O1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoYXN5bmMgcmVzb3VyY2UgPT4gKHsgcmVzb3VyY2U6IHJlc291cmNlLnRvU3RyaW5nKCksIHN0YXRlLCBmcm9tU2VxOiAwIH0pKTtcblx0XHRjb25zdCB1cmkgPSBVUkkucGFyc2UoY2hhbmdlc2V0VXJpKTtcblx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPENoYW5nZXNldFN0YXRlPihTdGF0ZUNvbXBvbmVudHMuQ2hhbmdlc2V0LCB1cmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGNvbnN0IGNsaWVudFNlcSA9IG1nci5kaXNwYXRjaE9wdGltaXN0aWModXJpLnRvU3RyaW5nKCksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZXNSZXZpZXdDaGFuZ2VkLFxuXHRcdFx0ZmlsZXM6IFsnZmlsZTovLy90ZXN0LnR4dCddLFxuXHRcdFx0cmV2aWV3ZWQ6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNsaWVudFNlcSxcblx0XHRcdG9wdGltaXN0aWNSZXZpZXdlZDogKHJlZi5vYmplY3QudmFsdWUgYXMgQ2hhbmdlc2V0U3RhdGUpLmZpbGVzWzBdLnJldmlld2VkLFxuXHRcdFx0dmVyaWZpZWRSZXZpZXdlZDogcmVmLm9iamVjdC52ZXJpZmllZFZhbHVlPy5maWxlc1swXS5yZXZpZXdlZCxcblx0XHR9LCB7XG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRvcHRpbWlzdGljUmV2aWV3ZWQ6IHRydWUsXG5cdFx0XHR2ZXJpZmllZFJldmlld2VkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cblx0XHRyZWYuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwb3NlIGNsZWFycyBhbGwgc3Vic2NyaXB0aW9ucyBhbmQgY2FsbHMgdW5zdWJzY3JpYmUgZm9yIGVhY2gnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXG5cdFx0Y29uc3QgcmVmMSA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgVVJJLnBhcnNlKHNlc3Npb25VcmkpLCAndGVzdCcpO1xuXHRcdGNvbnN0IHJlZjIgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFRlcm1pbmFsU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgVVJJLnBhcnNlKHRlcm1pbmFsVXJpKSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0Ly8gUmVtb3ZlIHRoZSBtYW5hZ2VyIGZyb20gZGlzcG9zYWJsZXMgc28gd2UgY2FuIGRpc3Bvc2UgaXQgbWFudWFsbHlcblx0XHQvLyB3aXRob3V0IGRvdWJsZS1kaXNwb3NlXG5cdFx0ZGlzcG9zYWJsZXMuZGVsZXRlKG1ncik7XG5cdFx0bWdyLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5vayh1bnN1YnNjcmliZWRSZXNvdXJjZXMuaW5jbHVkZXMoc2Vzc2lvblVyaSkpO1xuXHRcdGFzc2VydC5vayh1bnN1YnNjcmliZWRSZXNvdXJjZXMuaW5jbHVkZXModGVybWluYWxVcmkpKTtcblxuXHRcdC8vIENsZWFuIHVwIHJlZnMgKGFscmVhZHkgZGlzcG9zZWQgd2l0aCBtYW5hZ2VyLCBidXQgc2FmZSB0byBjYWxsKVxuXHRcdHJlZjEuZGlzcG9zZSgpO1xuXHRcdHJlZjIuZGlzcG9zZSgpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQgcmV0dXJucyB1bmRlZmluZWQgd2hlbiBubyBzdWJzY3JpcHRpb24gZXhpc3RzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1nciA9IGNyZWF0ZU1hbmFnZXIoKTtcblx0XHRjb25zdCByZXN1bHQgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFNlc3Npb25TdGF0ZT4oVVJJLnBhcnNlKCdjb3BpbG90Oi9ub25leGlzdGVudCcpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQgcmV0dXJucyBleGlzdGluZyBzdWJzY3JpcHRpb24gd2l0aG91dCBhZmZlY3RpbmcgcmVmY291bnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHVyaSA9IFVSSS5wYXJzZShzZXNzaW9uVXJpKTtcblxuXHRcdC8vIENyZWF0ZSBhIHN1YnNjcmlwdGlvbiB2aWEgZ2V0U3Vic2NyaXB0aW9uXG5cdFx0Y29uc3QgcmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdC8vIEdldCBpdCB1bm1hbmFnZWRcblx0XHRjb25zdCB1bm1hbmFnZWQgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFNlc3Npb25TdGF0ZT4odXJpKTtcblx0XHRhc3NlcnQub2sodW5tYW5hZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodW5tYW5hZ2VkLCByZWYub2JqZWN0KTtcblxuXHRcdC8vIERpc3Bvc2UgdGhlIHJlZi4gU3Vic2NyaXB0aW9uIHNob3VsZCBiZSByZWxlYXNlZCAocmVmY291bnQgd2FzIDEpXG5cdFx0cmVmLmRpc3Bvc2UoKTtcblxuXHRcdC8vIE5vdyB1bm1hbmFnZWQgc2hvdWxkIHJldHVybiB1bmRlZmluZWQgc2luY2UgaXQgd2FzIHJlbGVhc2VkXG5cdFx0Y29uc3QgYWZ0ZXIgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFNlc3Npb25TdGF0ZT4odXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXIsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFN1YnNjcmlwdGlvbiByZXRyaWVzIGFmdGVyIGEgZmFpbGVkIHN1YnNjcmliZSBmb3IgdGhlIHNhbWUgcmVzb3VyY2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0bGV0IHN1YnNjcmliZUF0dGVtcHRzID0gMDtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKGFzeW5jIHJlc291cmNlID0+IHtcblx0XHRcdHN1YnNjcmliZWRSZXNvdXJjZXMucHVzaChyZXNvdXJjZS50b1N0cmluZygpKTtcblx0XHRcdHN1YnNjcmliZUF0dGVtcHRzKys7XG5cdFx0XHRpZiAoc3Vic2NyaWJlQXR0ZW1wdHMgPT09IDEpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdub3QgZm91bmQgeWV0Jyk7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4geyByZXNvdXJjZTogcmVzb3VyY2UudG9TdHJpbmcoKSwgc3RhdGU6IG1ha2VTZXNzaW9uU3RhdGUocmVzb3VyY2UudG9TdHJpbmcoKSwgeyB0aXRsZTogJ1JldHJpZWQnIH0pLCBmcm9tU2VxOiAwIH07XG5cdFx0fSk7XG5cdFx0Y29uc3QgdXJpID0gVVJJLnBhcnNlKHNlc3Npb25VcmkpO1xuXG5cdFx0Y29uc3QgZmFpbGVkUmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCB1cmksICd0ZXN0Jyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGFzc2VydC5vayhmYWlsZWRSZWYub2JqZWN0LnZhbHVlIGluc3RhbmNlb2YgRXJyb3IpO1xuXG5cdFx0Y29uc3QgcmV0cnlSZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHVyaSwgJ3Rlc3QnKTtcblx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMCkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdWJzY3JpYmVBdHRlbXB0cyxcblx0XHRcdHJldHJpZWRUaXRsZTogKHJldHJ5UmVmLm9iamVjdC52YWx1ZSBhcyBTZXNzaW9uU3RhdGUpLnRpdGxlLFxuXHRcdFx0dW5tYW5hZ2VkSXNSZXRyeTogbWdyLmdldFN1YnNjcmlwdGlvblVubWFuYWdlZDxTZXNzaW9uU3RhdGU+KHVyaSkgPT09IHJldHJ5UmVmLm9iamVjdCxcblx0XHR9LCB7XG5cdFx0XHRzdWJzY3JpYmVBdHRlbXB0czogMixcblx0XHRcdHJldHJpZWRUaXRsZTogJ1JldHJpZWQnLFxuXHRcdFx0dW5tYW5hZ2VkSXNSZXRyeTogdHJ1ZSxcblx0XHR9KTtcblxuXHRcdGZhaWxlZFJlZi5kaXNwb3NlKCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1nci5nZXRTdWJzY3JpcHRpb25Vbm1hbmFnZWQ8U2Vzc2lvblN0YXRlPih1cmkpLCByZXRyeVJlZi5vYmplY3QpO1xuXG5cdFx0cmV0cnlSZWYuZGlzcG9zZSgpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZ3IuZ2V0U3Vic2NyaXB0aW9uVW5tYW5hZ2VkPFNlc3Npb25TdGF0ZT4odXJpKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucyByZXBvcnRzIGtpbmQsIHJlZkNvdW50LCBob2xkZXJzIGFuZCBzdGF0dXMgcGVyIGFjdGl2ZSBzdWJzY3JpcHRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHNVcmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cdFx0Y29uc3QgdFVyaSA9IFVSSS5wYXJzZSh0ZXJtaW5hbFVyaSk7XG5cblx0XHRjb25zdCBzZXNzaW9uUmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzVXJpLCAnU2Vzc2lvbkhvbGRlcicpO1xuXHRcdGNvbnN0IHNlc3Npb25SZWYyID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzVXJpLCAnU2Vzc2lvbkhvbGRlcicpO1xuXHRcdGNvbnN0IHRlcm1pbmFsUmVmID0gbWdyLmdldFN1YnNjcmlwdGlvbjxUZXJtaW5hbFN0YXRlPihTdGF0ZUNvbXBvbmVudHMuVGVybWluYWwsIHRVcmksICdUZXJtaW5hbEhvbGRlcicpO1xuXG5cdFx0Y29uc3QgbWFwID0gKCkgPT4gbWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKS5tYXAocyA9PiAoeyByZXNvdXJjZTogcy5yZXNvdXJjZS50b1N0cmluZygpLCBraW5kOiBzLmtpbmQsIHJlZkNvdW50OiBzLnJlZkNvdW50LCBob2xkZXJzOiBzLmhvbGRlcnMsIHN0YXR1czogcy5zdGF0dXMgfSkpO1xuXHRcdGNvbnN0IHBlbmRpbmcgPSBtYXAoKTtcblxuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRjb25zdCBhY3RpdmUgPSBtYXAoKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoeyBwZW5kaW5nLCBhY3RpdmUgfSwge1xuXHRcdFx0cGVuZGluZzogW1xuXHRcdFx0XHR7IHJlc291cmNlOiBzZXNzaW9uVXJpLCBraW5kOiBTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgcmVmQ291bnQ6IDIsIGhvbGRlcnM6IFt7IG93bmVyOiAnU2Vzc2lvbkhvbGRlcicsIGNvdW50OiAyIH1dLCBzdGF0dXM6ICdwZW5kaW5nJyB9LFxuXHRcdFx0XHR7IHJlc291cmNlOiB0ZXJtaW5hbFVyaSwga2luZDogU3RhdGVDb21wb25lbnRzLlRlcm1pbmFsLCByZWZDb3VudDogMSwgaG9sZGVyczogW3sgb3duZXI6ICdUZXJtaW5hbEhvbGRlcicsIGNvdW50OiAxIH1dLCBzdGF0dXM6ICdwZW5kaW5nJyB9LFxuXHRcdFx0XSxcblx0XHRcdGFjdGl2ZTogW1xuXHRcdFx0XHR7IHJlc291cmNlOiBzZXNzaW9uVXJpLCBraW5kOiBTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgcmVmQ291bnQ6IDIsIGhvbGRlcnM6IFt7IG93bmVyOiAnU2Vzc2lvbkhvbGRlcicsIGNvdW50OiAyIH1dLCBzdGF0dXM6ICdzbmFwc2hvdCcgfSxcblx0XHRcdFx0eyByZXNvdXJjZTogdGVybWluYWxVcmksIGtpbmQ6IFN0YXRlQ29tcG9uZW50cy5UZXJtaW5hbCwgcmVmQ291bnQ6IDEsIGhvbGRlcnM6IFt7IG93bmVyOiAnVGVybWluYWxIb2xkZXInLCBjb3VudDogMSB9XSwgc3RhdHVzOiAnc25hcHNob3QnIH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXG5cdFx0c2Vzc2lvblJlZi5kaXNwb3NlKCk7XG5cdFx0c2Vzc2lvblJlZjIuZGlzcG9zZSgpO1xuXHRcdHRlcm1pbmFsUmVmLmRpc3Bvc2UoKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZ3IuZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVN1YnNjcmlwdGlvbnMgdHJhY2tzIGRpc3RpbmN0IGhvbGRlcnMgYW5kIGRyb3BzIHRoZW0gYXMgcmVmZXJlbmNlcyBhcmUgZGlzcG9zZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgbWdyID0gY3JlYXRlTWFuYWdlcigpO1xuXHRcdGNvbnN0IHNVcmkgPSBVUkkucGFyc2Uoc2Vzc2lvblVyaSk7XG5cblx0XHRjb25zdCByZWZBID0gbWdyLmdldFN1YnNjcmlwdGlvbjxTZXNzaW9uU3RhdGU+KFN0YXRlQ29tcG9uZW50cy5TZXNzaW9uLCBzVXJpLCAnSG9sZGVyQScpO1xuXHRcdGNvbnN0IHJlZkIgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNVcmksICdIb2xkZXJCJyk7XG5cdFx0Y29uc3QgcmVmQjIgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHNVcmksICdIb2xkZXJCJyk7XG5cdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDApKTtcblxuXHRcdGNvbnN0IHdpdGhBbGwgPSBtZ3IuZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpWzBdLmhvbGRlcnM7XG5cblx0XHRyZWZCLmRpc3Bvc2UoKTtcblx0XHRjb25zdCBhZnRlck9uZUIgPSBtZ3IuZ2V0QWN0aXZlU3Vic2NyaXB0aW9ucygpWzBdLmhvbGRlcnM7XG5cblx0XHQvLyBEaXNwb3NpbmcgdGhlIHNhbWUgcmVmZXJlbmNlIHR3aWNlIG11c3Qgbm90IG92ZXItcmVtb3ZlIGhvbGRlcnMuXG5cdFx0cmVmQi5kaXNwb3NlKCk7XG5cdFx0Y29uc3QgYWZ0ZXJEb3VibGVEaXNwb3NlID0gbWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKVswXS5ob2xkZXJzO1xuXG5cdFx0cmVmQS5kaXNwb3NlKCk7XG5cdFx0cmVmQjIuZGlzcG9zZSgpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHdpdGhBbGwsIGFmdGVyT25lQiwgYWZ0ZXJEb3VibGVEaXNwb3NlLCByZW1haW5pbmc6IG1nci5nZXRBY3RpdmVTdWJzY3JpcHRpb25zKCkubGVuZ3RoIH0sIHtcblx0XHRcdC8vIFNvcnRlZCBieSBkZXNjZW5kaW5nIGNvdW50LCBzbyBIb2xkZXJCICgyKSBwcmVjZWRlcyBIb2xkZXJBICgxKS5cblx0XHRcdHdpdGhBbGw6IFt7IG93bmVyOiAnSG9sZGVyQicsIGNvdW50OiAyIH0sIHsgb3duZXI6ICdIb2xkZXJBJywgY291bnQ6IDEgfV0sXG5cdFx0XHRhZnRlck9uZUI6IFt7IG93bmVyOiAnSG9sZGVyQScsIGNvdW50OiAxIH0sIHsgb3duZXI6ICdIb2xkZXJCJywgY291bnQ6IDEgfV0sXG5cdFx0XHRhZnRlckRvdWJsZURpc3Bvc2U6IFt7IG93bmVyOiAnSG9sZGVyQScsIGNvdW50OiAxIH0sIHsgb3duZXI6ICdIb2xkZXJCJywgY291bnQ6IDEgfV0sXG5cdFx0XHRyZW1haW5pbmc6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVN1YnNjcmlwdGlvbnMgcmVwb3J0cyBlcnJvciBzdGF0dXMgZm9yIGEgZmFpbGVkIHN1YnNjcmlwdGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKGFzeW5jICgpID0+IHsgdGhyb3cgbmV3IEVycm9yKCdub3BlJyk7IH0pO1xuXHRcdGNvbnN0IHJlZiA9IG1nci5nZXRTdWJzY3JpcHRpb248U2Vzc2lvblN0YXRlPihTdGF0ZUNvbXBvbmVudHMuU2Vzc2lvbiwgVVJJLnBhcnNlKHNlc3Npb25VcmkpLCAndGVzdCcpO1xuXHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0bWdyLmdldEFjdGl2ZVN1YnNjcmlwdGlvbnMoKS5tYXAocyA9PiAoeyBraW5kOiBzLmtpbmQsIHN0YXR1czogcy5zdGF0dXMgfSkpLFxuXHRcdFx0W3sga2luZDogU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIHN0YXR1czogJ2Vycm9yJyB9XSxcblx0XHQpO1xuXHRcdHJlZi5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdvcmRpbmFyeSBvcHRpbWlzdGljIHJlY29ubmVjdCBzdGF0ZScsICgpID0+IHtcblxuXHRcdHRlc3QoJ2FwcGx5UmVjb25uZWN0U25hcHNob3QgY2xlYXJzIHBlbmRpbmcgYWN0aW9ucyBhbmQgYXBwbGllcyB0aGUgZnJlc2ggc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgJ3Rlc3QnKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRcdG1nci5kaXNwYXRjaE9wdGltaXN0aWMoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3dzMicgfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChyZWYub2JqZWN0LnZhbHVlIGFzIFNlc3Npb25TdGF0ZSkud29ya2luZ0RpcmVjdG9yaWVzLCBbJ2ZpbGU6Ly8vd3MyJ10pO1xuXG5cdFx0XHRtZ3IuYXBwbHlSZWNvbm5lY3RTbmFwc2hvdChzZXNzaW9uVXJpLCBtYWtlU2Vzc2lvblN0YXRlKHNlc3Npb25VcmksIHsgd29ya2luZ0RpcmVjdG9yaWVzOiBbJ2ZpbGU6Ly8vZnJlc2gnXSB9KSwgNSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKHJlZi5vYmplY3QudmFsdWUgYXMgU2Vzc2lvblN0YXRlKS53b3JraW5nRGlyZWN0b3JpZXMsIFsnZmlsZTovLy9mcmVzaCddKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWdyLmdldFBlbmRpbmdTZXNzaW9uQWN0aW9ucygpLCBbXSk7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbWFya1N1YnNjcmlwdGlvbnNNaXNzaW5nIGNsZWFycyBwZW5kaW5nIGFjdGlvbnMgYW5kIGV4cG9zZXMgYW4gZXJyb3InLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBtZ3IgPSBjcmVhdGVNYW5hZ2VyKCk7XG5cdFx0XHRjb25zdCByZWYgPSBtZ3IuZ2V0U3Vic2NyaXB0aW9uPFNlc3Npb25TdGF0ZT4oU3RhdGVDb21wb25lbnRzLlNlc3Npb24sIFVSSS5wYXJzZShzZXNzaW9uVXJpKSwgJ3Rlc3QnKTtcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAwKSk7XG5cblx0XHRcdG1nci5kaXNwYXRjaE9wdGltaXN0aWMoc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL3dzMicgfSk7XG5cblx0XHRcdG1nci5tYXJrU3Vic2NyaXB0aW9uc01pc3NpbmcoW1VSSS5wYXJzZShzZXNzaW9uVXJpKV0pO1xuXG5cdFx0XHRhc3NlcnQub2socmVmLm9iamVjdC52YWx1ZSBpbnN0YW5jZW9mIEVycm9yKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWdyLmdldFBlbmRpbmdTZXNzaW9uQWN0aW9ucygpLCBbXSk7XG5cdFx0XHRyZWYuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGtCQUFtRTtBQUM1RSxTQUFTLGlCQUFpQixhQUFhLGtCQUFrQixlQUFlLG1CQUFtQixpQkFBa0g7QUFDN00sU0FBUyxxQkFBcUIsaUJBQWlCLDBCQUEwQixnQkFBZ0IsdUJBQXVDO0FBQ2hJLFNBQVMsMEJBQTBCLDRCQUE0Qix1QkFBdUIsNENBQTRDLHVCQUF1QiwwQkFBMEIsaUNBQWlDO0FBSXBOLFNBQVMsY0FBYyxXQUEyQztBQUNqRSxTQUFPO0FBQUEsSUFDTixRQUFRLENBQUM7QUFBQSxJQUNULGdCQUFnQjtBQUFBLElBQ2hCLFdBQVcsQ0FBQztBQUFBLElBQ1osR0FBRztBQUFBLEVBQ0o7QUFDRDtBQUVBLFNBQVMsbUJBQW1CQSxhQUFvQztBQUMvRCxTQUFPO0FBQUEsSUFDTixVQUFVQTtBQUFBLElBQ1YsVUFBVTtBQUFBLElBQ1YsT0FBTztBQUFBLElBQ1AsUUFBUSxjQUFjO0FBQUEsSUFDdEIsWUFBVyxvQkFBSSxLQUFLLENBQUMsR0FBRSxZQUFZO0FBQUEsSUFDbkMsYUFBWSxvQkFBSSxLQUFLLENBQUMsR0FBRSxZQUFZO0FBQUEsSUFDcEMsU0FBUyxFQUFFLEtBQUssd0JBQXdCLGFBQWEsZUFBZTtBQUFBLEVBQ3JFO0FBQ0Q7QUFFQSxTQUFTLGlCQUFpQkEsYUFBb0IsV0FBaUQ7QUFDOUYsU0FBTztBQUFBLElBQ04sVUFBVTtBQUFBLElBQ1YsT0FBTztBQUFBLElBQ1AsUUFBUSxjQUFjO0FBQUEsSUFDdEIsU0FBUyxFQUFFLEtBQUssd0JBQXdCLGFBQWEsZUFBZTtBQUFBLElBQ3BFLFdBQVcsaUJBQWlCO0FBQUEsSUFDNUIsZUFBZSxDQUFDO0FBQUEsSUFDaEIsT0FBTyxDQUFDO0FBQUEsSUFDUixHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsU0FBUyxjQUFjQyxVQUFpQixpQkFBaUMsbUJBQW1CLFVBQVUsR0FBRyxXQUEyQztBQUNuSixTQUFPO0FBQUEsSUFDTixHQUFHLGdCQUFnQix5QkFBeUIsZ0JBQWdCQSxRQUFPLENBQUM7QUFBQSxJQUNwRSxHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsU0FBUyxrQkFBa0IsV0FBbUQ7QUFDN0UsU0FBTztBQUFBLElBQ04sT0FBTztBQUFBLElBQ1AsU0FBUyxDQUFDO0FBQUEsSUFDVixPQUFPLEVBQUUsTUFBTSxrQkFBa0IsUUFBUSxVQUFVLEtBQUs7QUFBQSxJQUN4RCxHQUFHO0FBQUEsRUFDSjtBQUNEO0FBRUEsU0FBUyxhQUFhLFFBQWtDLFdBQW1CLFFBQW1DLGlCQUEwQixTQUFrQztBQUN6SyxRQUFNLGtCQUFrQixZQUN2QixPQUFPLEtBQUssV0FBVyxPQUFPLElBQUksaUJBQy9CLE9BQU8sS0FBSyxXQUFXLE9BQU8sSUFBSSxVQUNqQyxPQUFPLEtBQUssV0FBVyxXQUFXLElBQUksY0FDckMsT0FBTyxLQUFLLFdBQVcsWUFBWSxJQUFJLGVBQ3RDO0FBRVAsU0FBTyxFQUFFLFNBQVMsaUJBQWlCLFFBQVEsV0FBVyxRQUFRLGdCQUFnQjtBQUMvRTtBQUVBLE1BQU0sT0FBTyxNQUFNO0FBQUU7QUFDckIsTUFBTSxhQUFhLElBQUksS0FBSyxFQUFFLFFBQVEsV0FBVyxNQUFNLGdCQUFnQixDQUFDLEVBQUUsU0FBUztBQUNuRixNQUFNLGNBQWMsSUFBSSxLQUFLLEVBQUUsUUFBUSxzQkFBc0IsTUFBTSxTQUFTLENBQUMsRUFBRSxTQUFTO0FBQ3hGLE1BQU0sVUFBVSxvQkFBb0IsVUFBVTtBQUM5QyxNQUFNLGVBQWUsR0FBRyxVQUFVO0FBRWxDLE1BQU0sOEJBQThCLE1BQU07QUFDekMsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxPQUFLLDJEQUEyRCxNQUFNO0FBQ3JFLFVBQU0sUUFBd0I7QUFBQSxNQUM3QixRQUFRLGdCQUFnQjtBQUFBLE1BQ3hCLE9BQU8sQ0FBQztBQUFBLFFBQ1AsSUFBSTtBQUFBLFFBQ0osTUFBTTtBQUFBLFVBQ0wsUUFBUSxFQUFFLEtBQUssb0JBQW9CLFNBQVMsRUFBRSxLQUFLLHFCQUFxQixFQUFFO0FBQUEsVUFDMUUsT0FBTyxFQUFFLEtBQUssb0JBQW9CLFNBQVMsRUFBRSxLQUFLLG9CQUFvQixFQUFFO0FBQUEsUUFDekU7QUFBQSxNQUNELENBQUM7QUFBQSxJQUNGO0FBQ0EsVUFBTSxlQUFlLFlBQVksSUFBSSxJQUFJLDJCQUEyQixjQUFjLE1BQU0sTUFBTSxHQUFHLElBQUksQ0FBQztBQUN0RyxpQkFBYSxlQUFlLE9BQU8sQ0FBQztBQUVwQyxVQUFNLFNBQWdDO0FBQUEsTUFDckMsTUFBTSxXQUFXO0FBQUEsTUFDakIsT0FBTyxDQUFDLGtCQUFrQjtBQUFBLE1BQzFCLFVBQVU7QUFBQSxJQUNYO0FBQ0EsVUFBTSxZQUFZLGFBQWEsZ0JBQWdCLE1BQU07QUFDckQsVUFBTSxrQkFBa0IsYUFBYTtBQUNyQyxpQkFBYSxnQkFBZ0IsYUFBYSxRQUFRLEdBQUcsRUFBRSxVQUFVLE1BQU0sVUFBVSxDQUFDLENBQUM7QUFFbkYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixvQkFBb0IsZ0JBQWdCLE1BQU0sQ0FBQyxFQUFFO0FBQUEsTUFDN0Msb0JBQW9CLE1BQU0sTUFBTSxDQUFDLEVBQUU7QUFBQSxNQUNuQyxtQkFBbUIsYUFBYSxlQUFlLE1BQU0sQ0FBQyxFQUFFO0FBQUEsTUFDeEQsZ0JBQWdCLGFBQWEsVUFBVSxhQUFhO0FBQUEsSUFDckQsR0FBRztBQUFBLE1BQ0Ysb0JBQW9CO0FBQUEsTUFDcEIsb0JBQW9CO0FBQUEsTUFDcEIsbUJBQW1CO0FBQUEsTUFDbkIsZ0JBQWdCO0FBQUEsSUFDakIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVGLENBQUM7QUFJRCxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUFBLEVBQ25DLENBQUM7QUFFRCxXQUFTLE1BQU07QUFDZCxnQkFBWSxRQUFRO0FBQUEsRUFDckIsQ0FBQztBQUVELDBDQUF3QztBQUV4QyxPQUFLLHNDQUFzQyxNQUFNO0FBQ2hELFVBQU0sTUFBTSxZQUFZLElBQUksSUFBSSxzQkFBc0IsTUFBTSxJQUFJLENBQUM7QUFDakUsV0FBTyxZQUFZLElBQUksT0FBTyxNQUFTO0FBQ3ZDLFdBQU8sWUFBWSxJQUFJLGVBQWUsTUFBUztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLCtDQUErQyxNQUFNO0FBQ3pELFVBQU0sTUFBTSxZQUFZLElBQUksSUFBSSxzQkFBc0IsTUFBTSxJQUFJLENBQUM7QUFDakUsVUFBTSxRQUFRLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDO0FBQ2pELFFBQUksZUFBZSxPQUFPLENBQUM7QUFDM0IsV0FBTyxnQkFBZ0IsSUFBSSxPQUFPLEtBQUs7QUFDdkMsV0FBTyxnQkFBZ0IsSUFBSSxlQUFlLEtBQUs7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyxvQ0FBb0MsTUFBTTtBQUM5QyxVQUFNLE1BQU0sWUFBWSxJQUFJLElBQUksc0JBQXNCLE1BQU0sSUFBSSxDQUFDO0FBQ2pFLFVBQU0sUUFBcUIsQ0FBQztBQUM1QixnQkFBWSxJQUFJLElBQUksWUFBWSxPQUFLLE1BQU0sS0FBSyxDQUFDLENBQUMsQ0FBQztBQUNuRCxRQUFJLGVBQWUsY0FBYyxHQUFHLENBQUM7QUFDckMsV0FBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQUEsRUFDbkMsQ0FBQztBQUVELE9BQUssa0RBQWtELE1BQU07QUFDNUQsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHNCQUFzQixNQUFNLElBQUksQ0FBQztBQUNqRSxRQUFJLGVBQWUsY0FBYyxHQUFHLENBQUM7QUFDckMsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixFQUFFLE1BQU0sV0FBVywyQkFBMkIsZ0JBQWdCLEVBQUU7QUFBQSxNQUNoRTtBQUFBLElBQ0QsQ0FBQztBQUNELFdBQU8sWUFBYSxJQUFJLE1BQW9CLGdCQUFnQixDQUFDO0FBQUEsRUFDOUQsQ0FBQztBQUVELE9BQUssNEJBQTRCLE1BQU07QUFDdEMsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHNCQUFzQixNQUFNLElBQUksQ0FBQztBQUNqRSxVQUFNLFFBQVEsY0FBYztBQUM1QixRQUFJLGVBQWUsT0FBTyxDQUFDO0FBQzNCLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsYUFBYztBQUFBLE1BQ2pDO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsSUFBSSxPQUFPLEtBQUs7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSyxnRUFBZ0UsTUFBTTtBQUMxRSxVQUFNLE1BQU0sWUFBWSxJQUFJLElBQUksc0JBQXNCLE1BQU0sSUFBSSxDQUFDO0FBQ2pFLFFBQUksZUFBZSxjQUFjLEdBQUcsQ0FBQztBQUNyQyxVQUFNLFNBQW1CLENBQUM7QUFDMUIsZ0JBQVksSUFBSSxJQUFJLGtCQUFrQixNQUFNLE9BQU8sS0FBSyxNQUFNLENBQUMsQ0FBQztBQUNoRSxnQkFBWSxJQUFJLElBQUksaUJBQWlCLE1BQU0sT0FBTyxLQUFLLEtBQUssQ0FBQyxDQUFDO0FBQzlELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsMkJBQTJCLGdCQUFnQixFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLGdCQUFnQixRQUFRLENBQUMsUUFBUSxLQUFLLENBQUM7QUFBQSxFQUMvQyxDQUFDO0FBRUQsT0FBSyx1REFBdUQsTUFBTTtBQUNqRSxVQUFNLE1BQU0sWUFBWSxJQUFJLElBQUksc0JBQXNCLE1BQU0sSUFBSSxDQUFDO0FBRWpFLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsMkJBQTJCLGdCQUFnQixFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLFlBQVksSUFBSSxPQUFPLE1BQVM7QUFHdkMsUUFBSSxlQUFlLGNBQWMsR0FBRyxDQUFDO0FBQ3JDLFdBQU8sWUFBYSxJQUFJLE1BQXFCLGdCQUFnQixDQUFDO0FBQUEsRUFDL0QsQ0FBQztBQUVELE9BQUssOERBQThELE1BQU07QUFDeEUsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLHNCQUFzQixNQUFNLElBQUksQ0FBQztBQUNqRSxRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLDJCQUEyQixnQkFBZ0IsR0FBRztBQUFBLE1BQ2pFO0FBQUEsSUFDRCxDQUFDO0FBQ0QsUUFBSSxlQUFlLGNBQWMsRUFBRSxnQkFBZ0IsRUFBRSxDQUFDLEdBQUcsQ0FBQztBQUUxRCxXQUFPLFlBQWEsSUFBSSxNQUFvQixnQkFBZ0IsQ0FBQztBQUFBLEVBQzlELENBQUM7QUFFRCxPQUFLLHlDQUF5QyxNQUFNO0FBQ25ELFVBQU0sTUFBTSxZQUFZLElBQUksSUFBSSxzQkFBc0IsTUFBTSxJQUFJLENBQUM7QUFDakUsUUFBSSxlQUFlLGNBQWMsR0FBRyxDQUFDO0FBQ3JDLFVBQU0sTUFBTSxJQUFJLE1BQU0sUUFBUTtBQUM5QixVQUFNLFNBQWtCLENBQUM7QUFDekIsZ0JBQVksSUFBSSxJQUFJLFdBQVcsV0FBUyxPQUFPLEtBQUssS0FBSyxDQUFDLENBQUM7QUFDM0QsUUFBSSxTQUFTLEdBQUc7QUFDaEIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixPQUFPLElBQUk7QUFBQSxNQUNYLHFCQUFxQixDQUFDLENBQUMsSUFBSTtBQUFBLE1BQzNCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxxQkFBcUI7QUFBQSxNQUNyQixRQUFRLENBQUMsR0FBRztBQUFBLElBQ2IsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUNGLENBQUM7QUFJRCxNQUFNLDRCQUE0QixNQUFNO0FBRXZDLE1BQUk7QUFDSixNQUFJO0FBRUosUUFBTSxNQUFNO0FBQ1gsa0JBQWMsSUFBSSxnQkFBZ0I7QUFDbEMsVUFBTTtBQUFBLEVBQ1AsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLFdBQVMsVUFBVSxNQUFjLFlBQVksV0FBbUIsTUFBZ0M7QUFDL0YsV0FBTyxZQUFZLElBQUksSUFBSSx5QkFBeUIsS0FBSyxVQUFVLE1BQU0sRUFBRSxLQUFLLElBQUksQ0FBQztBQUFBLEVBQ3RGO0FBRUEsT0FBSyxzQ0FBc0MsTUFBTTtBQUNoRCxVQUFNLE1BQU0sVUFBVTtBQUN0QixXQUFPLFlBQVksSUFBSSxPQUFPLE1BQVM7QUFBQSxFQUN4QyxDQUFDO0FBRUQsT0FBSywrQ0FBK0MsTUFBTTtBQUN6RCxVQUFNLE1BQU0sVUFBVTtBQUN0QixVQUFNLFFBQVEsaUJBQWlCLFVBQVU7QUFDekMsUUFBSSxlQUFlLE9BQU8sQ0FBQztBQUMzQixXQUFPLGdCQUFnQixJQUFJLE9BQU8sS0FBSztBQUN2QyxXQUFPLGdCQUFnQixJQUFJLGVBQWUsS0FBSztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLDZFQUE2RSxNQUFNO0FBQ3ZGLFVBQU0sTUFBTSxVQUFVO0FBQ3RCLFVBQU0sUUFBUSxpQkFBaUIsVUFBVTtBQUN6QyxRQUFJLGVBQWUsT0FBTyxDQUFDO0FBRTNCLFVBQU0sWUFBWSxJQUFJLGdCQUFnQjtBQUFBLE1BQ3JDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLE9BQU87QUFBQSxJQUNSLENBQUM7QUFFRCxXQUFPLFlBQVksV0FBVyxDQUFDO0FBQy9CLFdBQU8sWUFBYSxJQUFJLE1BQXVCLE9BQU8sWUFBWTtBQUVsRSxXQUFPLFlBQVksSUFBSSxjQUFlLE9BQU8sTUFBTTtBQUFBLEVBQ3BELENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sTUFBTSxVQUFVO0FBQ3RCLFFBQUksZUFBZSxpQkFBaUIsVUFBVSxHQUFHLENBQUM7QUFFbEQsVUFBTSxZQUFZLElBQUksZ0JBQWdCO0FBQUEsTUFDckMsTUFBTSxXQUFXO0FBQUEsTUFDakIsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUdELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcscUJBQXFCLE9BQU8sYUFBYTtBQUFBLE1BQzVEO0FBQUEsTUFDQSxFQUFFLFVBQVUsTUFBTSxVQUFVO0FBQUEsSUFDN0IsQ0FBQztBQUdELFdBQU8sWUFBWSxJQUFJLGNBQWUsT0FBTyxZQUFZO0FBRXpELFdBQU8sWUFBYSxJQUFJLE1BQXVCLE9BQU8sWUFBWTtBQUFBLEVBQ25FLENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sTUFBTSxVQUFVO0FBQ3RCLFFBQUksZUFBZSxpQkFBaUIsVUFBVSxHQUFHLENBQUM7QUFFbEQsVUFBTSxZQUFZLElBQUksZ0JBQWdCO0FBQUEsTUFDckMsTUFBTSxXQUFXO0FBQUEsTUFDakIsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUdELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcscUJBQXFCLE9BQU8sYUFBYTtBQUFBLE1BQzVEO0FBQUEsTUFDQSxFQUFFLFVBQVUsTUFBTSxVQUFVO0FBQUEsTUFDNUI7QUFBQSxJQUNELENBQUM7QUFHRCxXQUFPLFlBQVksSUFBSSxjQUFlLE9BQU8sTUFBTTtBQUVuRCxXQUFPLFlBQWEsSUFBSSxNQUF1QixPQUFPLE1BQU07QUFBQSxFQUM3RCxDQUFDO0FBRUQsT0FBSyw4REFBOEQsTUFBTTtBQUN4RSxVQUFNLE1BQU0sVUFBVTtBQUN0QixRQUFJLGVBQWUsaUJBQWlCLFVBQVUsR0FBRyxDQUFDO0FBR2xELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsTUFBTSxXQUFXO0FBQUEsTUFDakIsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUdELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsYUFBYztBQUFBLE1BQ2pDO0FBQUEsTUFDQSxFQUFFLFVBQVUsZ0JBQWdCLFdBQVcsRUFBRTtBQUFBLElBQzFDLENBQUM7QUFHRCxXQUFPLFlBQVksSUFBSSxjQUFlLFdBQVcsaUJBQWlCLEtBQUs7QUFFdkUsV0FBTyxZQUFhLElBQUksTUFBdUIsT0FBTyxPQUFPO0FBQUEsRUFDOUQsQ0FBQztBQUVELE9BQUssdUVBQXVFLE1BQU07QUFDakYsVUFBTSxNQUFNLFVBQVU7QUFDdEIsVUFBTSxRQUFRLGlCQUFpQixVQUFVO0FBQ3pDLFFBQUksZUFBZSxPQUFPLENBQUM7QUFFM0IsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixFQUFFLE1BQU0sV0FBVyxrQkFBa0IsUUFBUSxVQUFVLFVBQVUsSUFBSztBQUFBLE1BQ3RFO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLElBQUksT0FBTyxLQUFLO0FBQUEsRUFDeEMsQ0FBQztBQUVELE9BQUssbUVBQW1FLE1BQU07QUFDN0UsVUFBTSxNQUFNLFVBQVU7QUFDdEIsUUFBSSxlQUFlLGlCQUFpQixVQUFVLEdBQUcsQ0FBQztBQUVsRCxVQUFNLFlBQVksSUFBSSxnQkFBZ0I7QUFBQSxNQUNyQyxNQUFNLFdBQVc7QUFBQSxNQUNqQixPQUFPO0FBQUEsSUFDUixDQUFDO0FBR0QsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixFQUFFLE1BQU0sV0FBVyxxQkFBcUIsT0FBTyxPQUFPO0FBQUEsTUFDdEQ7QUFBQSxNQUNBLEVBQUUsVUFBVSxNQUFNLFVBQVU7QUFBQSxJQUM3QixDQUFDO0FBR0QsV0FBTyxZQUFZLElBQUksT0FBTyxJQUFJLGFBQWE7QUFBQSxFQUNoRCxDQUFDO0FBRUQsT0FBSyx3Q0FBd0MsTUFBTTtBQUNsRCxVQUFNLE1BQU0sVUFBVTtBQUN0QixRQUFJLGVBQWUsaUJBQWlCLFVBQVUsR0FBRyxDQUFDO0FBRWxELFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsTUFBTSxXQUFXO0FBQUEsTUFDakIsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUVELFdBQU8sWUFBYSxJQUFJLE1BQXVCLE9BQU8sU0FBUztBQUUvRCxRQUFJLGFBQWE7QUFHakIsV0FBTyxZQUFhLElBQUksTUFBdUIsT0FBTyxNQUFNO0FBQUEsRUFDN0QsQ0FBQztBQUVELE9BQUsseUNBQXlDLE1BQU07QUFDbkQsVUFBTSxNQUFNLFVBQVU7QUFDdEIsUUFBSSxlQUFlLGlCQUFpQixVQUFVLEdBQUcsQ0FBQztBQUVsRCxRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLHFCQUFxQixPQUFPLFFBQVE7QUFBQSxNQUN2RDtBQUFBLE1BQ0E7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sWUFBYSxJQUFJLE1BQXVCLE9BQU8sTUFBTTtBQUFBLEVBQzdELENBQUM7QUFFRCxPQUFLLHVEQUF1RCxNQUFNO0FBQ2pFLFVBQU0sTUFBTSxVQUFVO0FBRXRCLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcscUJBQXFCLE9BQU8sV0FBVztBQUFBLE1BQzFEO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxZQUFZLElBQUksT0FBTyxNQUFTO0FBRXZDLFFBQUksZUFBZSxpQkFBaUIsVUFBVSxHQUFHLENBQUM7QUFFbEQsV0FBTyxZQUFhLElBQUksTUFBd0IsT0FBTyxVQUFVO0FBQUEsRUFDbEUsQ0FBQztBQUVELE9BQUsseUNBQXlDLE1BQU07QUFDbkQsVUFBTSxNQUFNLFVBQVU7QUFDdEIsUUFBSSxlQUFlLGlCQUFpQixVQUFVLEdBQUcsQ0FBQztBQUVsRCxVQUFNLFFBQXdCLENBQUM7QUFDL0IsZ0JBQVksSUFBSSxJQUFJLFlBQVksT0FBSyxNQUFNLEtBQUssQ0FBQyxDQUFDLENBQUM7QUFFbkQsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixNQUFNLFdBQVc7QUFBQSxNQUNqQixPQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTyxZQUFZLE1BQU0sUUFBUSxDQUFDO0FBQ2xDLFdBQU8sWUFBWSxNQUFNLENBQUMsRUFBRSxPQUFPLFNBQVM7QUFBQSxFQUM3QyxDQUFDO0FBRUQsUUFBTSxpREFBaUQsTUFBTTtBQUU1RCxTQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFlBQU0sTUFBTSxVQUFVO0FBQ3RCLFVBQUksZUFBZSxpQkFBaUIsVUFBVSxHQUFHLENBQUM7QUFDbEQsWUFBTSxTQUFTLEVBQUUsTUFBTSxXQUFXLDRCQUFxQyxXQUFXLGNBQWM7QUFFaEcsWUFBTSxZQUFZLElBQUksZ0JBQWdCLE1BQU07QUFDNUMsYUFBTyxnQkFBaUIsSUFBSSxNQUF1QixvQkFBb0IsQ0FBQyxhQUFhLENBQUM7QUFDdEYsYUFBTyxZQUFZLElBQUksZUFBZSxvQkFBb0IsTUFBUztBQUVuRSxVQUFJLGdCQUFnQixhQUFhLFFBQVEsR0FBRyxFQUFFLFVBQVUsTUFBTSxVQUFVLENBQUMsQ0FBQztBQUUxRSxhQUFPLGdCQUFnQixJQUFJLGVBQWUsb0JBQW9CLENBQUMsYUFBYSxDQUFDO0FBQzdFLGFBQU8sWUFBWSxJQUFJLE9BQU8sSUFBSSxhQUFhO0FBQUEsSUFDaEQsQ0FBQztBQUVELFNBQUssNkRBQTZELE1BQU07QUFDdkUsWUFBTSxNQUFNLFVBQVU7QUFDdEIsVUFBSSxlQUFlLGlCQUFpQixVQUFVLEdBQUcsQ0FBQztBQUNsRCxZQUFNLFNBQVMsRUFBRSxNQUFNLFdBQVcsNEJBQXFDLFdBQVcsY0FBYztBQUVoRyxZQUFNLFlBQVksSUFBSSxnQkFBZ0IsTUFBTTtBQUM1QyxVQUFJLGdCQUFnQixhQUFhLFFBQVEsR0FBRyxFQUFFLFVBQVUsTUFBTSxVQUFVLEdBQUcsUUFBUSxDQUFDO0FBRXBGLGFBQU8sWUFBWSxJQUFJLGVBQWUsb0JBQW9CLE1BQVM7QUFDbkUsYUFBTyxZQUFhLElBQUksTUFBdUIsb0JBQW9CLE1BQVM7QUFBQSxJQUM3RSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUlELE1BQU0seUJBQXlCLE1BQU07QUFFcEMsTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNO0FBQUEsRUFDUCxDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsV0FBUyxVQUFVLE1BQWMsU0FBUyxXQUFtQixNQUE2QjtBQUN6RixXQUFPLFlBQVksSUFBSSxJQUFJLHNCQUFzQixLQUFLLFVBQVUsTUFBTSxFQUFFLEtBQUssSUFBSSxDQUFDO0FBQUEsRUFDbkY7QUFFQSxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sTUFBTSxVQUFVO0FBQ3RCLFFBQUksZUFBZSxjQUFjLE9BQU8sR0FBRyxDQUFDO0FBRTVDLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1IsV0FBVztBQUFBLE1BQ1gsU0FBUyxFQUFFLE1BQU0sU0FBUyxRQUFRLEVBQUUsTUFBTSxZQUFZLEtBQUssRUFBRTtBQUFBLElBQzlELENBQUM7QUFFRCxXQUFPLFlBQWEsSUFBSSxPQUFpQyxZQUFZLElBQUksUUFBUTtBQUVqRixRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixRQUFRLFVBQVUsVUFBVSxJQUFLO0FBQUEsTUFDdEU7QUFBQSxNQUNBO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFhLElBQUksT0FBaUM7QUFBQSxNQUNsRCxPQUFRLElBQUksT0FBaUMsTUFBTSxJQUFJLFdBQVMsRUFBRSxJQUFJLEtBQUssSUFBSSxPQUFPLEtBQUssTUFBTSxFQUFFO0FBQUEsSUFDcEcsR0FBRztBQUFBLE1BQ0YsWUFBWTtBQUFBLE1BQ1osT0FBTyxDQUFDLEVBQUUsSUFBSSxVQUFVLE9BQU8sVUFBVSxTQUFTLENBQUM7QUFBQSxJQUNwRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBQ0YsQ0FBQztBQUlELE1BQU0sNkJBQTZCLE1BQU07QUFFeEMsTUFBSTtBQUVKLFFBQU0sTUFBTTtBQUNYLGtCQUFjLElBQUksZ0JBQWdCO0FBQUEsRUFDbkMsQ0FBQztBQUVELFdBQVMsTUFBTTtBQUNkLGdCQUFZLFFBQVE7QUFBQSxFQUNyQixDQUFDO0FBRUQsMENBQXdDO0FBRXhDLE9BQUssNkNBQTZDLE1BQU07QUFDdkQsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLDBCQUEwQixhQUFhLE1BQU0sSUFBSSxDQUFDO0FBQ2xGLFFBQUksZUFBZSxrQkFBa0IsR0FBRyxDQUFDO0FBRXpDLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsY0FBYyxNQUFNLFFBQVE7QUFBQSxNQUMvQztBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWlCLElBQUksTUFBd0IsU0FBUztBQUFBLE1BQzVELEVBQUUsTUFBTSxnQkFBZ0IsT0FBTyxRQUFRO0FBQUEsSUFDeEMsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssMkVBQTJFLE1BQU07QUFDckYsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLDBCQUEwQixhQUFhLE1BQU0sSUFBSSxDQUFDO0FBQ2xGLFFBQUksZUFBZSxrQkFBa0IsR0FBRyxDQUFDO0FBTXpDLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcseUJBQXlCLFdBQVcsU0FBUyxhQUFhLFdBQVcsV0FBVyxJQUFLO0FBQUEsTUFDeEc7QUFBQSxJQUNELENBQUM7QUFDRCxRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLGNBQWMsTUFBTSxTQUFTO0FBQUEsTUFDaEQ7QUFBQSxJQUNELENBQUM7QUFDRCxRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLHlCQUF5QixXQUFXLFNBQVMsVUFBVSxHQUFHLFlBQVksRUFBRTtBQUFBLE1BQzNGO0FBQUEsSUFDRCxDQUFDO0FBRUQsV0FBTyxnQkFBaUIsSUFBSSxNQUF3QixTQUFTLENBQUM7QUFBQSxNQUM3RCxNQUFNO0FBQUEsTUFDTixXQUFXO0FBQUEsTUFDWCxhQUFhO0FBQUEsTUFDYixRQUFRO0FBQUEsTUFDUixXQUFXO0FBQUEsTUFDWCxZQUFZO0FBQUEsTUFDWixVQUFVO0FBQUEsTUFDVixZQUFZO0FBQUEsSUFDYixDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDJDQUEyQyxNQUFNO0FBQ3JELFVBQU0sTUFBTSxZQUFZLElBQUksSUFBSSwwQkFBMEIsYUFBYSxNQUFNLElBQUksQ0FBQztBQUNsRixRQUFJLGVBQWUsa0JBQWtCLEdBQUcsQ0FBQztBQUV6QyxRQUFJLGdCQUFnQjtBQUFBLE1BQ25CLEVBQUUsTUFBTSxXQUFXLGNBQWMsTUFBTSxPQUFPO0FBQUEsTUFDOUM7QUFBQSxNQUNBO0FBQUEsTUFDQTtBQUFBLE1BQ0E7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGdCQUFpQixJQUFJLE1BQXdCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDaEUsQ0FBQztBQUVELE9BQUssZ0NBQWdDLE1BQU07QUFDMUMsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLDBCQUEwQixhQUFhLE1BQU0sSUFBSSxDQUFDO0FBQ2xGLFFBQUksZUFBZSxrQkFBa0IsR0FBRyxDQUFDO0FBRXpDLFFBQUksZ0JBQWdCO0FBQUEsTUFDbkIsRUFBRSxNQUFNLFdBQVcsMkJBQTJCLGdCQUFnQixFQUFFO0FBQUEsTUFDaEU7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGdCQUFpQixJQUFJLE1BQXdCLFNBQVMsQ0FBQyxDQUFDO0FBQUEsRUFDaEUsQ0FBQztBQUVELE9BQUssNkJBQTZCLE1BQU07QUFDdkMsVUFBTSxNQUFNLFlBQVksSUFBSSxJQUFJLDBCQUEwQixhQUFhLE1BQU0sSUFBSSxDQUFDO0FBQ2xGLFVBQU0sUUFBUSxrQkFBa0IsRUFBRSxPQUFPLE1BQU0sQ0FBQztBQUNoRCxRQUFJLGVBQWUsT0FBTyxDQUFDO0FBQzNCLFdBQU8sZ0JBQWdCLElBQUksT0FBTyxLQUFLO0FBQUEsRUFDeEMsQ0FBQztBQUNGLENBQUM7QUFJRCxNQUFNLDRCQUE0QixNQUFNO0FBRXZDLE1BQUk7QUFDSixNQUFJO0FBQ0osTUFBSTtBQUNKLE1BQUk7QUFFSixRQUFNLE1BQU07QUFDWCxrQkFBYyxJQUFJLGdCQUFnQjtBQUNsQyxVQUFNO0FBQ04sMEJBQXNCLENBQUM7QUFDdkIsNEJBQXdCLENBQUM7QUFBQSxFQUMxQixDQUFDO0FBRUQsV0FBUyxNQUFNO0FBQ2QsZ0JBQVksUUFBUTtBQUFBLEVBQ3JCLENBQUM7QUFFRCwwQ0FBd0M7QUFFeEMsV0FBUyxjQUFjLFlBQXFJLE9BQU8sYUFBYTtBQUMvSyx3QkFBb0IsS0FBSyxTQUFTLFNBQVMsQ0FBQztBQUM1QyxVQUFNLE1BQU0sU0FBUyxTQUFTO0FBQzlCLFFBQUksSUFBSSxXQUFXLFVBQVUsR0FBRztBQUMvQixhQUFPLEVBQUUsVUFBVSxLQUFLLE9BQU8saUJBQWlCLEdBQUcsR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUNsRTtBQUNBLFdBQU8sRUFBRSxVQUFVLEtBQUssT0FBTyxrQkFBa0IsR0FBRyxTQUFTLEVBQUU7QUFBQSxFQUNoRSxHQUE2QjtBQUM1QixXQUFPLFlBQVksSUFBSSxJQUFJO0FBQUEsTUFDMUI7QUFBQSxNQUNBLE1BQU0sRUFBRTtBQUFBLE1BQ1I7QUFBQSxNQUNBO0FBQUEsTUFDQSxDQUFDLGFBQWE7QUFDYiw4QkFBc0IsS0FBSyxTQUFTLFNBQVMsQ0FBQztBQUFBLE1BQy9DO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLE9BQUssc0NBQXNDLE1BQU07QUFDaEQsVUFBTSxNQUFNLGNBQWM7QUFDMUIsV0FBTyxHQUFHLElBQUksU0FBUztBQUN2QixXQUFPLFlBQVksSUFBSSxVQUFVLE9BQU8sTUFBUztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLDZDQUE2QyxNQUFNO0FBQ3ZELFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sUUFBUSxjQUFjLEVBQUUsZ0JBQWdCLEVBQUUsQ0FBQztBQUNqRCxRQUFJLG1CQUFtQixPQUFPLENBQUM7QUFDL0IsV0FBTyxnQkFBZ0IsSUFBSSxVQUFVLE9BQU8sS0FBSztBQUFBLEVBQ2xELENBQUM7QUFFRCxPQUFLLHdEQUF3RCxZQUFZO0FBQ3hFLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sTUFBTSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxVQUFNLE1BQU0sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsS0FBSyxNQUFNO0FBRWxGLFdBQU8sR0FBRyxJQUFJLE1BQU07QUFDcEIsV0FBTyxZQUFZLElBQUksT0FBTyxPQUFPLE1BQVM7QUFHOUMsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFdBQU8sR0FBRyxJQUFJLE9BQU8sS0FBSztBQUMxQixRQUFJLFFBQVE7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLHFEQUFxRCxZQUFZO0FBQ3JFLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sTUFBTSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxVQUFNLE9BQU8sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsS0FBSyxNQUFNO0FBQ25GLFVBQU0sT0FBTyxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxLQUFLLE1BQU07QUFFbkYsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBR3ZDLFdBQU8sWUFBWSxLQUFLLFFBQVEsS0FBSyxNQUFNO0FBRzNDLFNBQUssUUFBUTtBQUNiLFdBQU8sWUFBWSxzQkFBc0IsUUFBUSxDQUFDO0FBR2xELFNBQUssUUFBUTtBQUNiLFdBQU8sWUFBWSxzQkFBc0IsUUFBUSxDQUFDO0FBQUEsRUFDbkQsQ0FBQztBQUVELE9BQUssaURBQWlELFlBQVk7QUFDakUsVUFBTSxNQUFNLGNBQWM7QUFDMUIsVUFBTSxNQUFNLElBQUksTUFBTSxVQUFVO0FBQ2hDLFVBQU0sTUFBTSxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxLQUFLLE1BQU07QUFFbEYsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFFBQUksUUFBUTtBQUNaLFdBQU8sR0FBRyxzQkFBc0IsU0FBUyxVQUFVLENBQUM7QUFBQSxFQUNyRCxDQUFDO0FBRUQsT0FBSywrREFBK0QsWUFBWTtBQUMvRSxVQUFNLE1BQU0sY0FBYztBQUMxQixRQUFJLG1CQUFtQixjQUFjLEdBQUcsQ0FBQztBQUV6QyxVQUFNLE1BQU0sSUFBSSxNQUFNLFVBQVU7QUFDaEMsVUFBTSxNQUFNLElBQUksZ0JBQThCLGdCQUFnQixTQUFTLEtBQUssTUFBTTtBQUNsRixVQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFHdkMsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixFQUFFLE1BQU0sV0FBVywyQkFBMkIsZ0JBQWdCLEdBQUc7QUFBQSxNQUNqRTtBQUFBLElBQ0QsQ0FBQztBQUNELFdBQU8sWUFBYSxJQUFJLFVBQVUsTUFBb0IsZ0JBQWdCLEVBQUU7QUFHeEUsUUFBSSxnQkFBZ0I7QUFBQSxNQUNuQixFQUFFLE1BQU0sV0FBVyxxQkFBcUIsT0FBTyxTQUFTO0FBQUEsTUFDeEQ7QUFBQSxJQUNELENBQUM7QUFDRCxXQUFPLFlBQWEsSUFBSSxPQUFPLE1BQXVCLE9BQU8sUUFBUTtBQUVyRSxRQUFJLFFBQVE7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLDRFQUE0RSxNQUFNO0FBQ3RGLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsYUFBYTtBQUFBLFFBQ1osYUFBYSxFQUFFLE1BQU0sV0FBVywyQkFBMkIsZ0JBQWdCLEVBQUUsR0FBRyxHQUFHLFFBQVcsUUFBVyxjQUFjO0FBQUEsUUFDdkgsQ0FBQyxXQUFXO0FBQUEsTUFDYjtBQUFBLE1BQ0EscUJBQXFCO0FBQUEsUUFDcEIsYUFBYSxFQUFFLE1BQU0sV0FBVyxxQkFBcUIsT0FBTyxPQUFPLEdBQUcsQ0FBQztBQUFBLFFBQ3ZFLENBQUMsV0FBVztBQUFBLE1BQ2I7QUFBQSxNQUNBLGNBQWM7QUFBQSxRQUNiLGFBQWEsRUFBRSxNQUFNLFdBQVcscUJBQXFCLE9BQU8sTUFBTSxHQUFHLENBQUM7QUFBQSxRQUN0RSxDQUFDLGFBQWEsVUFBVTtBQUFBLE1BQ3pCO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixhQUFhO0FBQUEsTUFDYixxQkFBcUI7QUFBQSxNQUNyQixjQUFjO0FBQUEsSUFDZixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrREFBa0QsWUFBWTtBQUNsRSxVQUFNLE1BQU0sY0FBYztBQUMxQixVQUFNLGVBQWUsSUFBSSxLQUFLLEVBQUUsUUFBUSxXQUFXLE1BQU0sY0FBYyxDQUFDO0FBQ3hFLFVBQU0sTUFBTSxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxjQUFjLE1BQU07QUFDM0YsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFdBQU8sR0FBRyxJQUFJLE9BQU8sS0FBSztBQUMxQixXQUFPLEdBQUcsb0JBQW9CLFNBQVMsYUFBYSxTQUFTLENBQUMsQ0FBQztBQUUvRCxRQUFJLFFBQVE7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLG1EQUFtRCxZQUFZO0FBQ25FLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sTUFBTSxJQUFJLE1BQU0sV0FBVztBQUNqQyxVQUFNLE1BQU0sSUFBSSxnQkFBK0IsZ0JBQWdCLFVBQVUsS0FBSyxNQUFNO0FBQ3BGLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV2QyxXQUFPLEdBQUcsSUFBSSxPQUFPLEtBQUs7QUFDMUIsV0FBTyxHQUFHLG9CQUFvQixTQUFTLFdBQVcsQ0FBQztBQUVuRCxRQUFJLFFBQVE7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLCtEQUErRCxZQUFZO0FBQy9FLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sTUFBTSxJQUFJLE1BQU0sVUFBVTtBQUNoQyxVQUFNLE1BQU0sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsS0FBSyxNQUFNO0FBQ2xGLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV2QyxVQUFNLFlBQVksSUFBSSxtQkFBbUIsSUFBSSxTQUFTLEdBQUc7QUFBQSxNQUN4RCxNQUFNLFdBQVc7QUFBQSxNQUNqQixPQUFPO0FBQUEsSUFDUixDQUFDO0FBRUQsV0FBTyxHQUFHLFlBQVksQ0FBQztBQUN2QixXQUFPLFlBQWEsSUFBSSxPQUFPLE1BQXVCLE9BQU8sWUFBWTtBQUV6RSxXQUFPLFlBQVksSUFBSSxPQUFPLGNBQWUsT0FBTyxNQUFNO0FBRTFELFFBQUksUUFBUTtBQUFBLEVBQ2IsQ0FBQztBQUVELE9BQUssaUVBQWlFLFlBQVk7QUFDakYsVUFBTSxRQUF3QjtBQUFBLE1BQzdCLFFBQVEsZ0JBQWdCO0FBQUEsTUFDeEIsT0FBTyxDQUFDO0FBQUEsUUFDUCxJQUFJO0FBQUEsUUFDSixNQUFNO0FBQUEsVUFDTCxPQUFPLEVBQUUsS0FBSyxvQkFBb0IsU0FBUyxFQUFFLEtBQUssb0JBQW9CLEVBQUU7QUFBQSxRQUN6RTtBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFDQSxVQUFNLE1BQU0sY0FBYyxPQUFNLGNBQWEsRUFBRSxVQUFVLFNBQVMsU0FBUyxHQUFHLE9BQU8sU0FBUyxFQUFFLEVBQUU7QUFDbEcsVUFBTSxNQUFNLElBQUksTUFBTSxZQUFZO0FBQ2xDLFVBQU0sTUFBTSxJQUFJLGdCQUFnQyxnQkFBZ0IsV0FBVyxLQUFLLE1BQU07QUFDdEYsVUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFVBQU0sWUFBWSxJQUFJLG1CQUFtQixJQUFJLFNBQVMsR0FBRztBQUFBLE1BQ3hELE1BQU0sV0FBVztBQUFBLE1BQ2pCLE9BQU8sQ0FBQyxrQkFBa0I7QUFBQSxNQUMxQixVQUFVO0FBQUEsSUFDWCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QjtBQUFBLE1BQ0Esb0JBQXFCLElBQUksT0FBTyxNQUF5QixNQUFNLENBQUMsRUFBRTtBQUFBLE1BQ2xFLGtCQUFrQixJQUFJLE9BQU8sZUFBZSxNQUFNLENBQUMsRUFBRTtBQUFBLElBQ3RELEdBQUc7QUFBQSxNQUNGLFdBQVc7QUFBQSxNQUNYLG9CQUFvQjtBQUFBLE1BQ3BCLGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFFRCxRQUFJLFFBQVE7QUFBQSxFQUNiLENBQUM7QUFFRCxPQUFLLG1FQUFtRSxZQUFZO0FBQ25GLFVBQU0sTUFBTSxjQUFjO0FBRTFCLFVBQU0sT0FBTyxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxJQUFJLE1BQU0sVUFBVSxHQUFHLE1BQU07QUFDckcsVUFBTSxPQUFPLElBQUksZ0JBQStCLGdCQUFnQixVQUFVLElBQUksTUFBTSxXQUFXLEdBQUcsTUFBTTtBQUN4RyxVQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFJdkMsZ0JBQVksT0FBTyxHQUFHO0FBQ3RCLFFBQUksUUFBUTtBQUVaLFdBQU8sR0FBRyxzQkFBc0IsU0FBUyxVQUFVLENBQUM7QUFDcEQsV0FBTyxHQUFHLHNCQUFzQixTQUFTLFdBQVcsQ0FBQztBQUdyRCxTQUFLLFFBQVE7QUFDYixTQUFLLFFBQVE7QUFBQSxFQUNkLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sU0FBUyxJQUFJLHlCQUF1QyxJQUFJLE1BQU0sc0JBQXNCLENBQUM7QUFDM0YsV0FBTyxZQUFZLFFBQVEsTUFBUztBQUFBLEVBQ3JDLENBQUM7QUFFRCxPQUFLLHFGQUFxRixZQUFZO0FBQ3JHLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sTUFBTSxJQUFJLE1BQU0sVUFBVTtBQUdoQyxVQUFNLE1BQU0sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsS0FBSyxNQUFNO0FBQ2xGLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUd2QyxVQUFNLFlBQVksSUFBSSx5QkFBdUMsR0FBRztBQUNoRSxXQUFPLEdBQUcsU0FBUztBQUNuQixXQUFPLFlBQVksV0FBVyxJQUFJLE1BQU07QUFHeEMsUUFBSSxRQUFRO0FBR1osVUFBTSxRQUFRLElBQUkseUJBQXVDLEdBQUc7QUFDNUQsV0FBTyxZQUFZLE9BQU8sTUFBUztBQUFBLEVBQ3BDLENBQUM7QUFFRCxPQUFLLDBFQUEwRSxZQUFZO0FBQzFGLFFBQUksb0JBQW9CO0FBQ3hCLFVBQU0sTUFBTSxjQUFjLE9BQU0sYUFBWTtBQUMzQywwQkFBb0IsS0FBSyxTQUFTLFNBQVMsQ0FBQztBQUM1QztBQUNBLFVBQUksc0JBQXNCLEdBQUc7QUFDNUIsY0FBTSxJQUFJLE1BQU0sZUFBZTtBQUFBLE1BQ2hDO0FBQ0EsYUFBTyxFQUFFLFVBQVUsU0FBUyxTQUFTLEdBQUcsT0FBTyxpQkFBaUIsU0FBUyxTQUFTLEdBQUcsRUFBRSxPQUFPLFVBQVUsQ0FBQyxHQUFHLFNBQVMsRUFBRTtBQUFBLElBQ3hILENBQUM7QUFDRCxVQUFNLE1BQU0sSUFBSSxNQUFNLFVBQVU7QUFFaEMsVUFBTSxZQUFZLElBQUksZ0JBQThCLGdCQUFnQixTQUFTLEtBQUssTUFBTTtBQUN4RixVQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFFdkMsV0FBTyxHQUFHLFVBQVUsT0FBTyxpQkFBaUIsS0FBSztBQUVqRCxVQUFNLFdBQVcsSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsS0FBSyxNQUFNO0FBQ3ZGLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV2QyxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCO0FBQUEsTUFDQSxjQUFlLFNBQVMsT0FBTyxNQUF1QjtBQUFBLE1BQ3RELGtCQUFrQixJQUFJLHlCQUF1QyxHQUFHLE1BQU0sU0FBUztBQUFBLElBQ2hGLEdBQUc7QUFBQSxNQUNGLG1CQUFtQjtBQUFBLE1BQ25CLGNBQWM7QUFBQSxNQUNkLGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFFRCxjQUFVLFFBQVE7QUFDbEIsV0FBTyxZQUFZLElBQUkseUJBQXVDLEdBQUcsR0FBRyxTQUFTLE1BQU07QUFFbkYsYUFBUyxRQUFRO0FBQ2pCLFdBQU8sWUFBWSxJQUFJLHlCQUF1QyxHQUFHLEdBQUcsTUFBUztBQUFBLEVBQzlFLENBQUM7QUFFRCxPQUFLLDZGQUE2RixZQUFZO0FBQzdHLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sT0FBTyxJQUFJLE1BQU0sVUFBVTtBQUNqQyxVQUFNLE9BQU8sSUFBSSxNQUFNLFdBQVc7QUFFbEMsVUFBTSxhQUFhLElBQUksZ0JBQThCLGdCQUFnQixTQUFTLE1BQU0sZUFBZTtBQUNuRyxVQUFNLGNBQWMsSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsTUFBTSxlQUFlO0FBQ3BHLFVBQU0sY0FBYyxJQUFJLGdCQUErQixnQkFBZ0IsVUFBVSxNQUFNLGdCQUFnQjtBQUV2RyxVQUFNLE1BQU0sTUFBTSxJQUFJLHVCQUF1QixFQUFFLElBQUksUUFBTSxFQUFFLFVBQVUsRUFBRSxTQUFTLFNBQVMsR0FBRyxNQUFNLEVBQUUsTUFBTSxVQUFVLEVBQUUsVUFBVSxTQUFTLEVBQUUsU0FBUyxRQUFRLEVBQUUsT0FBTyxFQUFFO0FBQ3ZLLFVBQU0sVUFBVSxJQUFJO0FBRXBCLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV2QyxVQUFNLFNBQVMsSUFBSTtBQUVuQixXQUFPLGdCQUFnQixFQUFFLFNBQVMsT0FBTyxHQUFHO0FBQUEsTUFDM0MsU0FBUztBQUFBLFFBQ1IsRUFBRSxVQUFVLFlBQVksTUFBTSxnQkFBZ0IsU0FBUyxVQUFVLEdBQUcsU0FBUyxDQUFDLEVBQUUsT0FBTyxpQkFBaUIsT0FBTyxFQUFFLENBQUMsR0FBRyxRQUFRLFVBQVU7QUFBQSxRQUN2SSxFQUFFLFVBQVUsYUFBYSxNQUFNLGdCQUFnQixVQUFVLFVBQVUsR0FBRyxTQUFTLENBQUMsRUFBRSxPQUFPLGtCQUFrQixPQUFPLEVBQUUsQ0FBQyxHQUFHLFFBQVEsVUFBVTtBQUFBLE1BQzNJO0FBQUEsTUFDQSxRQUFRO0FBQUEsUUFDUCxFQUFFLFVBQVUsWUFBWSxNQUFNLGdCQUFnQixTQUFTLFVBQVUsR0FBRyxTQUFTLENBQUMsRUFBRSxPQUFPLGlCQUFpQixPQUFPLEVBQUUsQ0FBQyxHQUFHLFFBQVEsV0FBVztBQUFBLFFBQ3hJLEVBQUUsVUFBVSxhQUFhLE1BQU0sZ0JBQWdCLFVBQVUsVUFBVSxHQUFHLFNBQVMsQ0FBQyxFQUFFLE9BQU8sa0JBQWtCLE9BQU8sRUFBRSxDQUFDLEdBQUcsUUFBUSxXQUFXO0FBQUEsTUFDNUk7QUFBQSxJQUNELENBQUM7QUFFRCxlQUFXLFFBQVE7QUFDbkIsZ0JBQVksUUFBUTtBQUNwQixnQkFBWSxRQUFRO0FBRXBCLFdBQU8sWUFBWSxJQUFJLHVCQUF1QixFQUFFLFFBQVEsQ0FBQztBQUFBLEVBQzFELENBQUM7QUFFRCxPQUFLLDRGQUE0RixZQUFZO0FBQzVHLFVBQU0sTUFBTSxjQUFjO0FBQzFCLFVBQU0sT0FBTyxJQUFJLE1BQU0sVUFBVTtBQUVqQyxVQUFNLE9BQU8sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsTUFBTSxTQUFTO0FBQ3ZGLFVBQU0sT0FBTyxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxNQUFNLFNBQVM7QUFDdkYsVUFBTSxRQUFRLElBQUksZ0JBQThCLGdCQUFnQixTQUFTLE1BQU0sU0FBUztBQUN4RixVQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFFdkMsVUFBTSxVQUFVLElBQUksdUJBQXVCLEVBQUUsQ0FBQyxFQUFFO0FBRWhELFNBQUssUUFBUTtBQUNiLFVBQU0sWUFBWSxJQUFJLHVCQUF1QixFQUFFLENBQUMsRUFBRTtBQUdsRCxTQUFLLFFBQVE7QUFDYixVQUFNLHFCQUFxQixJQUFJLHVCQUF1QixFQUFFLENBQUMsRUFBRTtBQUUzRCxTQUFLLFFBQVE7QUFDYixVQUFNLFFBQVE7QUFFZCxXQUFPLGdCQUFnQixFQUFFLFNBQVMsV0FBVyxvQkFBb0IsV0FBVyxJQUFJLHVCQUF1QixFQUFFLE9BQU8sR0FBRztBQUFBO0FBQUEsTUFFbEgsU0FBUyxDQUFDLEVBQUUsT0FBTyxXQUFXLE9BQU8sRUFBRSxHQUFHLEVBQUUsT0FBTyxXQUFXLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDeEUsV0FBVyxDQUFDLEVBQUUsT0FBTyxXQUFXLE9BQU8sRUFBRSxHQUFHLEVBQUUsT0FBTyxXQUFXLE9BQU8sRUFBRSxDQUFDO0FBQUEsTUFDMUUsb0JBQW9CLENBQUMsRUFBRSxPQUFPLFdBQVcsT0FBTyxFQUFFLEdBQUcsRUFBRSxPQUFPLFdBQVcsT0FBTyxFQUFFLENBQUM7QUFBQSxNQUNuRixXQUFXO0FBQUEsSUFDWixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RUFBeUUsWUFBWTtBQUN6RixVQUFNLE1BQU0sY0FBYyxZQUFZO0FBQUUsWUFBTSxJQUFJLE1BQU0sTUFBTTtBQUFBLElBQUcsQ0FBQztBQUNsRSxVQUFNLE1BQU0sSUFBSSxnQkFBOEIsZ0JBQWdCLFNBQVMsSUFBSSxNQUFNLFVBQVUsR0FBRyxNQUFNO0FBQ3BHLFVBQU0sSUFBSSxRQUFRLE9BQUssV0FBVyxHQUFHLENBQUMsQ0FBQztBQUV2QyxXQUFPO0FBQUEsTUFDTixJQUFJLHVCQUF1QixFQUFFLElBQUksUUFBTSxFQUFFLE1BQU0sRUFBRSxNQUFNLFFBQVEsRUFBRSxPQUFPLEVBQUU7QUFBQSxNQUMxRSxDQUFDLEVBQUUsTUFBTSxnQkFBZ0IsU0FBUyxRQUFRLFFBQVEsQ0FBQztBQUFBLElBQ3BEO0FBQ0EsUUFBSSxRQUFRO0FBQUEsRUFDYixDQUFDO0FBRUQsUUFBTSx1Q0FBdUMsTUFBTTtBQUVsRCxTQUFLLDZFQUE2RSxZQUFZO0FBQzdGLFlBQU0sTUFBTSxjQUFjO0FBQzFCLFlBQU0sTUFBTSxJQUFJLGdCQUE4QixnQkFBZ0IsU0FBUyxJQUFJLE1BQU0sVUFBVSxHQUFHLE1BQU07QUFDcEcsWUFBTSxJQUFJLFFBQVEsT0FBSyxXQUFXLEdBQUcsQ0FBQyxDQUFDO0FBRXZDLFVBQUksbUJBQW1CLFlBQVksRUFBRSxNQUFNLFdBQVcsNEJBQTRCLFdBQVcsY0FBYyxDQUFDO0FBQzVHLGFBQU8sZ0JBQWlCLElBQUksT0FBTyxNQUF1QixvQkFBb0IsQ0FBQyxhQUFhLENBQUM7QUFFN0YsVUFBSSx1QkFBdUIsWUFBWSxpQkFBaUIsWUFBWSxFQUFFLG9CQUFvQixDQUFDLGVBQWUsRUFBRSxDQUFDLEdBQUcsQ0FBQztBQUVqSCxhQUFPLGdCQUFpQixJQUFJLE9BQU8sTUFBdUIsb0JBQW9CLENBQUMsZUFBZSxDQUFDO0FBQy9GLGFBQU8sZ0JBQWdCLElBQUkseUJBQXlCLEdBQUcsQ0FBQyxDQUFDO0FBQ3pELFVBQUksUUFBUTtBQUFBLElBQ2IsQ0FBQztBQUVELFNBQUssd0VBQXdFLFlBQVk7QUFDeEYsWUFBTSxNQUFNLGNBQWM7QUFDMUIsWUFBTSxNQUFNLElBQUksZ0JBQThCLGdCQUFnQixTQUFTLElBQUksTUFBTSxVQUFVLEdBQUcsTUFBTTtBQUNwRyxZQUFNLElBQUksUUFBUSxPQUFLLFdBQVcsR0FBRyxDQUFDLENBQUM7QUFFdkMsVUFBSSxtQkFBbUIsWUFBWSxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsV0FBVyxjQUFjLENBQUM7QUFFNUcsVUFBSSx5QkFBeUIsQ0FBQyxJQUFJLE1BQU0sVUFBVSxDQUFDLENBQUM7QUFFcEQsYUFBTyxHQUFHLElBQUksT0FBTyxpQkFBaUIsS0FBSztBQUMzQyxhQUFPLGdCQUFnQixJQUFJLHlCQUF5QixHQUFHLENBQUMsQ0FBQztBQUN6RCxVQUFJLFFBQVE7QUFBQSxJQUNiLENBQUM7QUFBQSxFQUNGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogWyJzZXNzaW9uVXJpIiwgImNoYXRVcmkiXQp9Cg==
