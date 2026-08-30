import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { runWithFakedTimers } from "../../../../base/test/common/timeTravelScheduler.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType, NotificationType } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ROOT_STATE_URI, SessionLifecycle, SessionStatus, TurnState, buildChatUri, buildDefaultChatUri, buildSubagentSessionUri, buildSubagentSessionUriPrefix, isSubagentSession, mergeSessionWithDefaultChat, parseSubagentSessionUri, readHostBuildInfo, readSessionEhcliAdoptable, withSessionEhcliAdoptable } from "../../common/state/sessionState.js";
import { AgentHostStateManager } from "../../node/agentHostStateManager.js";
import { buildChangesetUri, buildSessionChangesetUri } from "../../common/changesetUri.js";
import { withAgentCustomizationSettings } from "../../common/agentCustomizationSettings.js";
suite("AgentHostStateManager", () => {
  let disposables;
  let manager;
  const sessionUri = URI.from({ scheme: "copilot", path: "/test-session" }).toString();
  const sessionChatUri = buildDefaultChatUri(sessionUri);
  function makeSessionSummary(resource) {
    return {
      resource: resource ?? sessionUri,
      provider: "copilot",
      title: "Test",
      status: SessionStatus.Idle,
      createdAt: (/* @__PURE__ */ new Date()).toISOString(),
      modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
      project: { uri: "file:///test-project", displayName: "Test Project" }
    };
  }
  setup(() => {
    disposables = new DisposableStore();
    manager = disposables.add(new AgentHostStateManager(new NullLogService()));
  });
  teardown(() => {
    disposables.dispose();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("createSession creates initial state with lifecycle Creating", () => {
    const state = manager.createSession(makeSessionSummary());
    assert.strictEqual(state.lifecycle, SessionLifecycle.Creating);
    const chatState = manager.getDefaultChatState(sessionUri);
    assert.strictEqual(chatState?.turns.length, 0);
    assert.strictEqual(chatState?.activeTurn, void 0);
    assert.strictEqual(manager.getSessionSummary(sessionUri)?.resource.toString(), sessionUri.toString());
  });
  test("onDidChangeSessionWorkingDirectories fires only when the working-directory set changes", () => {
    manager.createSession(makeSessionSummary());
    const fired = [];
    disposables.add(manager.onDidChangeSessionWorkingDirectories(({ session }) => fired.push(session)));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///a" });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///a" });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectorySet, directory: "file:///b" });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionWorkingDirectoryRemoved, directory: "file:///b" });
    assert.deepStrictEqual(fired, [sessionUri, sessionUri, sessionUri]);
  });
  test("getSnapshot returns undefined for unknown session", () => {
    const unknown = URI.from({ scheme: "copilot", path: "/unknown" }).toString();
    const snapshot = manager.getSnapshot(unknown);
    assert.strictEqual(snapshot, void 0);
  });
  test("getSnapshot returns root snapshot", () => {
    const snapshot = manager.getSnapshot(ROOT_STATE_URI);
    assert.ok(snapshot);
    assert.strictEqual(snapshot.resource.toString(), ROOT_STATE_URI.toString());
    const root = snapshot.state;
    assert.deepStrictEqual(root.agents, []);
    assert.strictEqual(root.activeSessions, 0);
    assert.ok(root.config, "root state should include a seeded config");
  });
  test("seeds host build info into root state _meta when provided", () => {
    const buildInfo = { version: "1.96.0", commit: "abc1234", date: "2024-01-02T03:04:05Z", quality: "insider" };
    const localManager = disposables.add(new AgentHostStateManager(new NullLogService(), { hostBuildInfo: buildInfo }));
    assert.deepStrictEqual(readHostBuildInfo(localManager.rootState), buildInfo);
  });
  test("omits host build info from root state _meta when not provided", () => {
    assert.strictEqual(readHostBuildInfo(manager.rootState), void 0);
  });
  test("getSnapshot returns session snapshot after creation", () => {
    manager.createSession(makeSessionSummary());
    const snapshot = manager.getSnapshot(sessionUri);
    assert.ok(snapshot);
    assert.strictEqual(snapshot.resource.toString(), sessionUri.toString());
    assert.strictEqual(snapshot.state.lifecycle, SessionLifecycle.Creating);
  });
  test("dispatchServerAction applies action and emits envelope", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionUri, {
      type: ActionType.SessionReady
    });
    const state = manager.getSessionState(sessionUri);
    assert.ok(state);
    assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(envelopes[0].action.type, ActionType.SessionReady);
    assert.strictEqual(envelopes[0].serverSeq, 1);
    assert.strictEqual(envelopes[0].origin, void 0);
  });
  test("emits session title changes and suppresses no-op assignments", () => {
    manager.createSession(makeSessionSummary());
    const changes = [];
    disposables.add(manager.onDidChangeSessionTitle((e) => changes.push(e)));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    assert.deepStrictEqual(changes, [{ session: sessionUri, title: "Updated" }]);
  });
  test("serverSeq increments monotonically", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Updated" });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(envelopes[0].serverSeq, 1);
    assert.strictEqual(envelopes[1].serverSeq, 2);
    assert.ok(envelopes[1].serverSeq > envelopes[0].serverSeq);
  });
  test("dispatchClientAction includes origin in envelope", () => {
    manager.createSession(makeSessionSummary());
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    const origin = { clientId: "renderer-1", clientSeq: 42 };
    manager.dispatchClientAction(
      sessionUri,
      { type: ActionType.SessionReady },
      origin
    );
    assert.strictEqual(envelopes.length, 1);
    assert.deepStrictEqual(envelopes[0].origin, origin);
  });
  test("root action that does not change state is not emitted", () => {
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-a" }
    });
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(manager.serverSeq, 1);
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-a" }
    });
    assert.strictEqual(envelopes.length, 1);
    assert.strictEqual(manager.serverSeq, 1, "serverSeq must not advance on a no-op");
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.nested": { allow: ["x"], deny: [] } }
    });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(manager.serverSeq, 2);
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.nested": { allow: ["x"], deny: [] } }
    });
    assert.strictEqual(envelopes.length, 2);
    assert.strictEqual(manager.serverSeq, 2, "serverSeq must not advance on a no-op");
    manager.dispatchServerAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { "my.setting": "value-b" }
    });
    assert.strictEqual(envelopes.length, 3);
    assert.strictEqual(manager.serverSeq, 3);
  });
  test("root config replacement preserves provider-backed values", () => {
    const rootState = manager.rootState;
    assert.ok(rootState.config);
    rootState.config.values["codex.personality"] = "friendly";
    rootState._meta = withAgentCustomizationSettings(rootState, [{
      provider: "codex",
      title: "Codex",
      description: "Codex settings",
      settings: [{ key: "codex.personality", group: "Personalization" }]
    }]);
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchClientAction(ROOT_STATE_URI, {
      type: ActionType.RootConfigChanged,
      config: { someProviderSetting: "openai" },
      replace: true
    }, { clientId: "renderer-1", clientSeq: 1 });
    assert.deepStrictEqual(manager.rootState.config?.values, {
      someProviderSetting: "openai",
      "codex.personality": "friendly"
    });
    assert.deepStrictEqual(envelopes[0].action, {
      type: ActionType.RootConfigChanged,
      config: {
        someProviderSetting: "openai",
        "codex.personality": "friendly"
      },
      replace: true
    });
  });
  test("removeSession clears state without notification", () => {
    manager.createSession(makeSessionSummary());
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.removeSession(sessionUri);
    assert.strictEqual(manager.getSessionState(sessionUri), void 0);
    assert.strictEqual(manager.getSnapshot(sessionUri), void 0);
    assert.strictEqual(notifications.length, 0);
  });
  test("deleteSession clears state and emits notification", () => {
    manager.createSession(makeSessionSummary());
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.deleteSession(sessionUri);
    assert.strictEqual(manager.getSessionState(sessionUri), void 0);
    assert.strictEqual(manager.getSnapshot(sessionUri), void 0);
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, NotificationType.SessionRemoved);
  });
  test("createSession emits sessionAdded notification", () => {
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.createSession(makeSessionSummary());
    assert.strictEqual(notifications.length, 1);
    assert.strictEqual(notifications[0].type, NotificationType.SessionAdded);
  });
  test("default chat inherits the session working directory resolved at materialization", () => {
    manager.createSession({ ...makeSessionSummary(), workingDirectories: ["file:///provisional"] }, { emitNotification: false });
    manager.markSessionPersisted(sessionUri, { ...makeSessionSummary(), workingDirectories: ["file:///resolved-worktree"] });
    assert.deepStrictEqual({
      session: manager.getSessionState(sessionUri)?.workingDirectories?.[0],
      defaultChat: manager.getSessionState(sessionChatUri)?.workingDirectories?.[0]
    }, {
      session: "file:///resolved-worktree",
      defaultChat: "file:///resolved-worktree"
    });
  });
  test("getActiveTurnId returns active turn id after turnStarted", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    assert.strictEqual(manager.getActiveTurnId(sessionUri), void 0);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.getActiveTurnId(sessionUri), "turn-1");
  });
  test("root state starts with activeSessions: 0", () => {
    const snapshot = manager.getSnapshot(ROOT_STATE_URI);
    assert.ok(snapshot);
    const root = snapshot.state;
    assert.deepStrictEqual(root.agents, []);
    assert.strictEqual(root.activeSessions, 0);
  });
  test("turnStarted dispatches root/activeSessionsChanged with correct count", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 1);
    assert.strictEqual(manager.rootState.activeSessions, 1);
  });
  test("turnComplete dispatches root/activeSessionsChanged back to 0", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 1e3
    });
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 0);
    assert.strictEqual(manager.rootState.activeSessions, 0);
  });
  test("activeSessions reflects concurrent turn count across sessions", () => {
    const session2Uri = URI.from({ scheme: "copilot", path: "/test-session-2" }).toString();
    manager.createSession(makeSessionSummary(sessionUri));
    manager.createSession(makeSessionSummary(session2Uri));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "a", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "b", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 2);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-1",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-2",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 0);
  });
  test("removeSession decrements active sessions when an active turn is stranded", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    assert.strictEqual(manager.rootState.activeSessions, 0);
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 1);
    assert.strictEqual(activeChanged[0].action.activeSessions, 0);
  });
  test("removeSession does not dispatch active-sessions change when no turn is active", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    const activeChanged = envelopes.filter((e) => e.action.type === ActionType.RootActiveSessionsChanged);
    assert.strictEqual(activeChanged.length, 0);
  });
  test("stale ChatTurnComplete (wrong turnId) does not decrement active sessions", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "stale-turn",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    assert.strictEqual(manager.hasActiveSessions, true);
  });
  test("concurrent ChatTurnStarted on same session keeps active count at one", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "a", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "b", origin: { kind: MessageKind.User } }
    });
    assert.strictEqual(manager.rootState.activeSessions, 1);
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "turn-2",
      duration: 1e3
    });
    assert.strictEqual(manager.rootState.activeSessions, 0);
    assert.strictEqual(manager.hasActiveSessions, false);
  });
  test("active turn event follows reducer-derived active state transitions", () => {
    manager.createSession(makeSessionSummary());
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    const events = [];
    disposables.add(manager.onDidChangeSessionActiveTurn((e) => events.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnComplete,
      turnId: "stale-turn",
      duration: 1e3
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatError,
      turnId: "turn-1",
      duration: 1e3,
      error: { errorType: "failed", message: "boom" }
    });
    assert.deepStrictEqual(events, [
      { session: sessionUri, active: true },
      { session: sessionUri, active: false }
    ]);
  });
  test("active turn event covers cancellation and removal while active", () => {
    const session2Uri = URI.from({ scheme: "copilot", path: "/test-session-2" }).toString();
    manager.createSession(makeSessionSummary(sessionUri));
    manager.createSession(makeSessionSummary(session2Uri));
    manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
    manager.dispatchServerAction(session2Uri, { type: ActionType.SessionReady });
    const events = [];
    disposables.add(manager.onDidChangeSessionActiveTurn((e) => events.push(e)));
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-1",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    });
    manager.dispatchServerAction(sessionChatUri, {
      type: ActionType.ChatTurnCancelled,
      turnId: "turn-1",
      duration: 1e3
    });
    manager.dispatchServerAction(buildDefaultChatUri(session2Uri), {
      type: ActionType.ChatTurnStarted,
      turnId: "turn-2",
      startedAt: "2025-01-01T00:00:00.000Z",
      message: { text: "hi", origin: { kind: MessageKind.User } }
    });
    manager.removeSession(session2Uri);
    assert.deepStrictEqual(events, [
      { session: sessionUri, active: true },
      { session: sessionUri, active: false },
      { session: session2Uri, active: true },
      { session: session2Uri, active: false }
    ]);
  });
  test("restoreSession creates session in Ready state with pre-populated turns", () => {
    const turns = [
      {
        id: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "world" }],
        usage: void 0,
        state: TurnState.Complete
      }
    ];
    const state = manager.restoreSession(makeSessionSummary(), turns);
    assert.strictEqual(state.lifecycle, SessionLifecycle.Ready);
    const chatState = manager.getDefaultChatState(sessionUri);
    assert.strictEqual(chatState?.turns.length, 1);
    assert.strictEqual(chatState?.turns[0].message.text, "hello");
    assert.strictEqual((chatState?.turns[0].responseParts[0]).content, "world");
  });
  test("restoreSession returns existing state for duplicate session", () => {
    const existing = manager.createSession(makeSessionSummary());
    const state = manager.restoreSession(makeSessionSummary(), []);
    assert.strictEqual(state, existing);
  });
  test("restoreSession does not emit sessionAdded notification", () => {
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.restoreSession(makeSessionSummary(), []);
    assert.strictEqual(notifications.length, 0, "should not emit notification for restored sessions");
  });
  test("restoreSession emits sessionSummaryChanged clearing the adoptable marker for a previously surfaced session", () => {
    manager.announceSurfacedSession({ ...makeSessionSummary(), _meta: withSessionEhcliAdoptable(void 0) });
    const notifications = [];
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.restoreSession(makeSessionSummary(), []);
    const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
    assert.strictEqual(changed.length, 1);
    assert.strictEqual(changed[0].session, sessionUri);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(changed[0].changes, "_meta"), true);
    assert.strictEqual(readSessionEhcliAdoptable(changed[0].changes._meta), false);
  });
  suite("unused-draft tracking", () => {
    test("reports draft status by origin, addressable by session or chat URI", () => {
      const restoredUri = URI.from({ scheme: "copilot", path: "/restored-session" }).toString();
      manager.createSession(makeSessionSummary());
      manager.restoreSession(makeSessionSummary(restoredUri), []);
      assert.deepStrictEqual({
        created: manager.isUnusedDraft(sessionUri),
        createdViaChatUri: manager.isUnusedDraft(sessionChatUri),
        restored: manager.isUnusedDraft(restoredUri),
        restoredViaChatUri: manager.isUnusedDraft(buildDefaultChatUri(restoredUri)),
        unknown: manager.isUnusedDraft(URI.from({ scheme: "copilot", path: "/nope" }).toString())
      }, {
        created: true,
        createdViaChatUri: true,
        restored: false,
        restoredViaChatUri: false,
        unknown: void 0
      });
    });
    test("a restored session that was first created is no longer a draft", () => {
      manager.createSession(makeSessionSummary());
      manager.restoreSession(makeSessionSummary(), []);
      assert.strictEqual(manager.isUnusedDraft(sessionUri), true);
    });
    test("draft status is retired by a turn and does not come back on truncate", () => {
      manager.createSession(makeSessionSummary());
      const observed = [manager.isUnusedDraft(sessionUri)];
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      observed.push(manager.isUnusedDraft(sessionUri));
      manager.dispatchServerAction(sessionChatUri, { type: ActionType.ChatTurnComplete, turnId: "turn-1", duration: 1 });
      observed.push(manager.isUnusedDraft(sessionUri));
      manager.dispatchServerAction(sessionChatUri, { type: ActionType.ChatTruncated });
      observed.push(manager.isUnusedDraft(sessionUri));
      assert.deepStrictEqual({
        observed,
        turnsAfterTruncate: manager.getDefaultChatState(sessionUri)?.turns.length
      }, {
        observed: [true, false, false, false],
        turnsAfterTruncate: 0
      });
    });
    test("seeding turns for a fork retires draft status", () => {
      manager.createSession(makeSessionSummary());
      manager.seedDefaultChatTurns(sessionUri, [{
        id: "turn-1",
        message: { text: "hello", origin: { kind: MessageKind.User } },
        responseParts: [],
        usage: void 0,
        state: TurnState.Complete
      }]);
      assert.strictEqual(manager.isUnusedDraft(sessionUri), false);
    });
  });
  test("emits sessionSummaryChanged when summary changes", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "New Title" });
      assert.strictEqual(notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged).length, 0);
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1);
      const notification = changed[0];
      assert.strictEqual(notification.session, sessionUri);
      assert.strictEqual(notification.changes.title, "New Title");
      assert.strictEqual(notification.changes.status, void 0, "unchanged fields should be omitted");
    });
  });
  test("coalesces multiple summary changes into one notification", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "First" });
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Second" });
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1, "should coalesce into one notification");
      assert.strictEqual(changed[0].changes.title, "Second");
    });
  });
  test("does not emit sessionSummaryChanged when summary is unchanged", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 0);
    });
  });
  test("does not emit sessionSummaryChanged for deleted session", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "New Title" });
      manager.deleteSession(sessionUri);
      await new Promise((r) => setTimeout(r, 150));
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 0, "should not emit for deleted sessions");
    });
  });
  test("removeSession flushes pending status=Idle notification before eviction", () => {
    return runWithFakedTimers({ useFakeTimers: true }, async () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      });
      await new Promise((r) => setTimeout(r, 150));
      const notifications = [];
      disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      manager.removeSession(sessionUri);
      const changed = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
      assert.strictEqual(changed.length, 1, "should emit SessionSummaryChanged synchronously in removeSession");
      assert.strictEqual(changed[0].changes.status, SessionStatus.Idle, "status should be Idle so the spinner clears");
    });
  });
  test("disposeChangeset emits ChangesetCleared and removes the state", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.disposeChangeset(changeset);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    assert.strictEqual(cleared.length, 1, "expected exactly one cleared envelope");
    assert.strictEqual(cleared[0].channel, changeset);
    assert.strictEqual(manager.getChangesetState(changeset), void 0, "state should be deleted");
  });
  test("producer-emitted ChangesetCleared keeps the state alive (recompute path)", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1);
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetCleared
    });
    const after = manager.getChangesetState(changeset);
    assert.ok(after, "state should still exist");
    assert.strictEqual(after.files.length, 0, "files should be cleared");
  });
  test("removeSession does NOT dispose per-session changesets (LRU eviction must not clear list-view chip)", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    manager.removeSession(sessionUri);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    assert.strictEqual(cleared.length, 0, "removeSession must not emit ChangesetCleared");
    assert.strictEqual(manager.getChangesetState(changeset)?.files.length, 1, "changeset state should survive eviction");
  });
  test("deleteSession disposes per-session changesets before emitting SessionRemoved", () => {
    manager.createSession(makeSessionSummary());
    const changeset = manager.registerChangeset(buildSessionChangesetUri(sessionUri));
    manager.dispatchServerAction(changeset, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///a.ts",
        edit: { after: { uri: "file:///a.ts", content: { uri: "file:///a.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    const envelopes = [];
    const notifications = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
    manager.deleteSession(sessionUri);
    const cleared = envelopes.filter((e) => e.action.type === ActionType.ChangesetCleared);
    const removed = notifications.filter((n) => n.type === NotificationType.SessionRemoved);
    assert.strictEqual(cleared.length, 1, "deleteSession should emit ChangesetCleared");
    assert.strictEqual(removed.length, 1, "deleteSession should emit SessionRemoved");
    assert.strictEqual(manager.getChangesetState(changeset), void 0, "changeset state should be gone after delete");
  });
  test("unknown changeset action is ignored without emitting an envelope", () => {
    manager.createSession(makeSessionSummary());
    const changesetUri = `${sessionUri}/changeset/missing`;
    const envelopes = [];
    disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
    const seqBefore = manager.serverSeq;
    manager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///x.ts",
        edit: { after: { uri: "file:///x.ts", content: { uri: "file:///x.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.deepStrictEqual(
      {
        envelopeCount: envelopes.length,
        seqAdvanced: manager.serverSeq - seqBefore,
        changesetState: manager.getChangesetState(changesetUri)
      },
      {
        envelopeCount: 0,
        seqAdvanced: 0,
        changesetState: void 0
      }
    );
    const registered = manager.registerChangeset(buildChangesetUri(sessionUri, "missing"));
    assert.strictEqual(registered, changesetUri);
    manager.dispatchServerAction(changesetUri, {
      type: ActionType.ChangesetFileSet,
      file: {
        id: "file:///x.ts",
        edit: { after: { uri: "file:///x.ts", content: { uri: "file:///x.ts" } }, diff: { added: 1, removed: 0 } }
      }
    });
    assert.strictEqual(envelopes.length, 1, "registered changeset action should emit an envelope");
    assert.strictEqual(manager.serverSeq - seqBefore, 1, "serverSeq should advance for registered changeset action");
  });
  suite("multi-chat catalog", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("addChat grows the catalog, creates chat state and emits SessionChatAdded", () => {
      manager.createSession(makeSessionSummary());
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const summary = manager.addChat(sessionUri, peerChat, { title: "Peer" });
      assert.deepStrictEqual(
        {
          addedTitle: summary?.title,
          chatResources: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()).sort(),
          peerTurns: manager.getChatState(peerChat)?.turns.length,
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          addedTitle: "Peer",
          chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
          peerTurns: 0,
          chatAddedEvents: 1
        }
      );
    });
    test("catalog-only SessionChatAdded does not create chat state", () => {
      manager.createSession(makeSessionSummary());
      manager.dispatchServerAction(sessionUri, {
        type: ActionType.SessionChatAdded,
        summary: {
          resource: peerChat,
          title: "Catalog only",
          status: SessionStatus.Idle,
          modifiedAt: "2025-01-01T00:00:00.000Z"
        }
      });
      assert.deepStrictEqual({
        catalogTitle: manager.getSessionState(sessionUri)?.chats.find((chat) => chat.resource === peerChat)?.title,
        chatState: manager.getChatState(peerChat)
      }, {
        catalogTitle: "Catalog only",
        chatState: void 0
      });
    });
    test("removeChat shrinks the catalog and refuses the default chat", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat);
      manager.removeChat(sessionUri, buildDefaultChatUri(sessionUri));
      const afterDefaultRemoval = manager.getSessionState(sessionUri)?.chats.length;
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          afterDefaultRemoval,
          afterPeerRemoval: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()),
          peerState: manager.getChatState(peerChat)
        },
        {
          afterDefaultRemoval: 2,
          afterPeerRemoval: [buildDefaultChatUri(sessionUri)],
          peerState: void 0
        }
      );
    });
    test("session title and default chat title stay independent once multi-chat", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat);
      const afterAdd = manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === defaultChat)?.title;
      manager.updateChatTitle(sessionUri, defaultChat, "Chat A");
      manager.dispatchServerAction(sessionUri, { type: ActionType.SessionTitleChanged, title: "Session B" });
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          afterAdd,
          sessionTitle: state?.title,
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title
        },
        {
          afterAdd: "Test",
          sessionTitle: "Session B",
          defaultChatTitle: "Chat A"
        }
      );
    });
    test("addChat is idempotent for an existing chat URI", () => {
      manager.createSession(makeSessionSummary());
      const first = manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const second = manager.addChat(sessionUri, peerChat, { title: "Ignored" });
      assert.deepStrictEqual(
        {
          sameSummary: first === second,
          title: second?.title,
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          sameSummary: true,
          title: "Peer",
          chatCount: 2,
          chatAddedEvents: 0
        }
      );
    });
    test("addChat for an unknown session is a no-op", () => {
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const summary = manager.addChat("copilot:/missing", peerChat);
      assert.deepStrictEqual(
        {
          summary,
          events: envelopes.length
        },
        {
          summary: void 0,
          events: 0
        }
      );
    });
    test("addChat supports multiple peers and only snapshots the default title once", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      const peerChat2 = buildChatUri(sessionUri, "peer-2");
      manager.addChat(sessionUri, peerChat);
      manager.updateChatTitle(sessionUri, defaultChat, "Renamed Default");
      manager.addChat(sessionUri, peerChat2);
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          chatResources: state?.chats.map((c) => c.resource.toString()).sort(),
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title
        },
        {
          chatResources: [defaultChat, peerChat, peerChat2].sort(),
          defaultChatTitle: "Renamed Default"
        }
      );
    });
    test("updateChatTitle on a peer leaves the session and default titles untouched", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      manager.updateChatTitle(sessionUri, peerChat, "Peer Renamed");
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          sessionTitle: state?.title,
          defaultChatTitle: state?.chats.find((c) => c.resource === defaultChat)?.title,
          peerTitle: state?.chats.find((c) => c.resource === peerChat)?.title,
          peerStateTitle: manager.getChatState(peerChat)?.title
        },
        {
          sessionTitle: "Test",
          defaultChatTitle: "Test",
          peerTitle: "Peer Renamed",
          peerStateTitle: "Peer Renamed"
        }
      );
    });
    test("removeChat of an unknown chat is a no-op", () => {
      manager.createSession(makeSessionSummary());
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      manager.removeChat(sessionUri, buildChatUri(sessionUri, "never-added"));
      assert.deepStrictEqual(
        {
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          removedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatRemoved).length
        },
        {
          chatCount: 1,
          removedEvents: 0
        }
      );
    });
    test("removeChat emits SessionChatRemoved for a peer", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat);
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          removed: envelopes.filter((e) => e.action.type === ActionType.SessionChatRemoved).map((e) => e.action.chat),
          chatState: manager.getChatState(peerChat)
        },
        {
          removed: [peerChat],
          chatState: void 0
        }
      );
    });
    test("hasActiveTurn reflects a chat turn lifecycle", () => {
      manager.createSession(makeSessionSummary());
      const idle = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      const afterStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      const afterComplete = manager.hasActiveTurn(sessionUri);
      assert.deepStrictEqual(
        { idle, afterStart, afterComplete },
        { idle: false, afterStart: true, afterComplete: false }
      );
    });
    test("active-turn event observers see the updated active-turn state", () => {
      manager.createSession(makeSessionSummary());
      const observed = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => {
        observed.push({ active: e.active, hasActiveTurn: manager.hasActiveTurn(sessionUri) });
      }));
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-1",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(sessionChatUri, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-1",
        duration: 1e3
      });
      assert.deepStrictEqual(observed, [
        { active: true, hasActiveTurn: true },
        { active: false, hasActiveTurn: false }
      ]);
    });
    test("hasActiveTurn stays true until all concurrent chat turns finish", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const idle = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      const afterDefaultStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const afterBothStart = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      const afterDefaultComplete = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      const afterBothComplete = manager.hasActiveTurn(sessionUri);
      assert.deepStrictEqual(
        { idle, afterDefaultStart, afterBothStart, afterDefaultComplete, afterBothComplete },
        { idle: false, afterDefaultStart: true, afterBothStart: true, afterDefaultComplete: true, afterBothComplete: false }
      );
    });
    test("a running peer chat promotes the session summary to InProgress while the default chat is idle", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const idle = manager.getSessionState(sessionUri)?.status;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const whilePeerRuns = manager.getSessionState(sessionUri)?.status;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      const afterPeerComplete = manager.getSessionState(sessionUri)?.status;
      assert.deepStrictEqual(
        {
          idleHasInProgress: ((idle ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          whilePeerRunsHasInProgress: ((whilePeerRuns ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          afterPeerCompleteHasInProgress: ((afterPeerComplete ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
          defaultChatStillIdle: ((manager.getChatState(defaultChat)?.status ?? SessionStatus.Idle) & SessionStatus.InProgress) === 0
        },
        {
          idleHasInProgress: false,
          whilePeerRunsHasInProgress: true,
          afterPeerCompleteHasInProgress: false,
          defaultChatStillIdle: true
        }
      );
    });
    test("a running peer chat forwards its own status to the session catalog so its tab can show progress", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const peerCatalogStatus = () => manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.status ?? SessionStatus.Idle;
      const chatUpdatesForPeer = () => envelopes.filter((e) => e.action.type === ActionType.SessionChatUpdated && e.action.chat === peerChat).length;
      const idleCatalog = peerCatalogStatus();
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const runningCatalog = peerCatalogStatus();
      const updatesAfterStart = chatUpdatesForPeer();
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          idleCatalogInProgress: (idleCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
          runningCatalogInProgress: (runningCatalog & SessionStatus.InProgress) === SessionStatus.InProgress,
          finalCatalogInProgress: (peerCatalogStatus() & SessionStatus.InProgress) === SessionStatus.InProgress,
          emittedChatUpdateOnStart: updatesAfterStart >= 1
        },
        {
          idleCatalogInProgress: false,
          runningCatalogInProgress: true,
          finalCatalogInProgress: false,
          emittedChatUpdateOnStart: true
        }
      );
    });
    test("active-turn event and active-session count flip once per session across concurrent chats", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhileBothRun = manager.rootState.activeSessions;
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      const activeAfterFirstCompletes = manager.rootState.activeSessions;
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-peer",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhileBothRun,
          activeAfterFirstCompletes,
          activeAfterBothComplete: manager.rootState.activeSessions
        },
        {
          // Exactly one true (first chat starts) and one false (last chat ends).
          turnEvents: [true, false],
          activeWhileBothRun: 1,
          activeAfterFirstCompletes: 1,
          activeAfterBothComplete: 0
        }
      );
    });
    test("removeChat clears a peer chat that is removed mid-turn", () => {
      manager.createSession(makeSessionSummary());
      const defaultChat = buildDefaultChatUri(sessionUri);
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-default",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "a", origin: { kind: MessageKind.User } }
      });
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhileBothRun = manager.hasActiveTurn(sessionUri);
      manager.removeChat(sessionUri, peerChat);
      const activeAfterPeerRemoved = manager.hasActiveTurn(sessionUri);
      manager.dispatchServerAction(defaultChat, {
        type: ActionType.ChatTurnComplete,
        turnId: "turn-default",
        duration: 1e3
      });
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhileBothRun,
          activeAfterPeerRemoved,
          activeAfterDefaultComplete: manager.hasActiveTurn(sessionUri),
          activeSessions: manager.rootState.activeSessions
        },
        {
          turnEvents: [true, false],
          activeWhileBothRun: true,
          activeAfterPeerRemoved: true,
          activeAfterDefaultComplete: false,
          activeSessions: 0
        }
      );
    });
    test("removeChat flips the session idle when the removed peer held the last active turn", () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      const turnEvents = [];
      disposables.add(manager.onDidChangeSessionActiveTurn((e) => turnEvents.push(e.active)));
      manager.dispatchServerAction(peerChat, {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-peer",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "b", origin: { kind: MessageKind.User } }
      });
      const activeWhilePeerRuns = manager.hasActiveTurn(sessionUri);
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual(
        {
          turnEvents,
          activeWhilePeerRuns,
          activeAfterPeerRemoved: manager.hasActiveTurn(sessionUri),
          activeSessions: manager.rootState.activeSessions
        },
        {
          turnEvents: [true, false],
          activeWhilePeerRuns: true,
          activeAfterPeerRemoved: false,
          activeSessions: 0
        }
      );
    });
  });
  suite("catalog characterization (A3)", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    test("_ensureDefaultChat seeds a single inheriting default chat and points defaultChat at it on createSession", () => {
      manager.createSession(makeSessionSummary());
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          defaultChat: state?.defaultChat,
          defaultChatIsDeterministic: state?.defaultChat === buildDefaultChatUri(sessionUri),
          chatResources: state?.chats.map((c) => c.resource.toString()),
          // Empty title => the default chat inherits the session title for display.
          defaultChatTitle: state?.chats[0]?.title,
          defaultChatStatePresent: manager.getDefaultChatState(sessionUri) !== void 0
        },
        {
          defaultChat: buildDefaultChatUri(sessionUri),
          defaultChatIsDeterministic: true,
          chatResources: [buildDefaultChatUri(sessionUri)],
          defaultChatTitle: "",
          defaultChatStatePresent: true
        }
      );
    });
    test("_ensureDefaultChat seeds the default-chat pointer on restoreSession too", () => {
      const turns = [
        {
          id: "turn-1",
          message: { text: "hello", origin: { kind: MessageKind.User } },
          responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "world" }],
          usage: void 0,
          state: TurnState.Complete
        }
      ];
      manager.restoreSession(makeSessionSummary(), turns);
      const state = manager.getSessionState(sessionUri);
      assert.deepStrictEqual(
        {
          defaultChat: state?.defaultChat,
          chatResources: state?.chats.map((c) => c.resource.toString()),
          defaultChatTurns: manager.getDefaultChatState(sessionUri)?.turns.length
        },
        {
          defaultChat: buildDefaultChatUri(sessionUri),
          chatResources: [buildDefaultChatUri(sessionUri)],
          defaultChatTurns: 1
        }
      );
    });
    test("registerRestoredChatSummary and resolveChatState hydrate a peer without dispatching SessionChatAdded", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      const envelopes = [];
      disposables.add(manager.onDidEmitEnvelope((e) => envelopes.push(e)));
      const turns = [
        {
          id: "peer-turn-1",
          message: { text: "restored", origin: { kind: MessageKind.User } },
          responseParts: [{ kind: ResponsePartKind.Markdown, id: "p1", content: "history" }],
          usage: void 0,
          state: TurnState.Complete
        }
      ];
      const draft = { text: "work in progress", origin: { kind: MessageKind.User } };
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        title: "Restored Peer",
        draft,
        resolver: async () => ({ turns })
      });
      const peerState = await manager.resolveChatState(peerChat);
      assert.deepStrictEqual(
        {
          chatResources: manager.getSessionState(sessionUri)?.chats.map((c) => c.resource.toString()).sort(),
          restoredTitle: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
          peerTurns: peerState?.turns.length,
          peerDraft: peerState?.draft?.text,
          chatAddedEvents: envelopes.filter((e) => e.action.type === ActionType.SessionChatAdded).length
        },
        {
          chatResources: [buildDefaultChatUri(sessionUri), peerChat].sort(),
          restoredTitle: "Restored Peer",
          peerTurns: 1,
          peerDraft: "work in progress",
          chatAddedEvents: 0
        }
      );
    });
    test("resolveChatState coalesces restored peer resolution and atomically installs its state", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let resolverCalls = 0;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        title: "Restored Peer",
        draft: { text: "work in progress", origin: { kind: MessageKind.User } },
        resolver: async () => {
          resolverCalls++;
          return {
            turns: [{
              id: "peer-turn-1",
              message: { text: "restored", origin: { kind: MessageKind.User } },
              responseParts: [],
              usage: void 0,
              state: TurnState.Complete
            }]
          };
        }
      });
      const beforeHydration = {
        summary: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
        state: manager.getChatState(peerChat)
      };
      const [first, second] = await Promise.all([
        manager.resolveChatState(peerChat),
        manager.resolveChatState(peerChat)
      ]);
      const state = manager.getChatState(peerChat);
      assert.deepStrictEqual({
        beforeHydration,
        sameState: first === second,
        resolverCalls,
        afterHydration: state && { title: state.title, turns: state.turns.map((turn) => turn.id), draft: state.draft?.text }
      }, {
        beforeHydration: { summary: "Restored Peer", state: void 0 },
        sameState: true,
        resolverCalls: 1,
        afterHydration: { title: "Restored Peer", turns: ["peer-turn-1"], draft: "work in progress" }
      });
    });
    test("resolveChatState retries failed restored peer resolution", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let resolverCalls = 0;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        resolver: async () => {
          resolverCalls++;
          if (resolverCalls === 1) {
            throw new Error("history unavailable");
          }
          return { turns: [] };
        }
      });
      await assert.rejects(() => manager.resolveChatState(peerChat), /history unavailable/);
      const state = await manager.resolveChatState(peerChat);
      assert.deepStrictEqual({
        resolverCalls,
        state: state && { title: state.title, turns: state.turns.length }
      }, {
        resolverCalls: 2,
        state: { title: "", turns: 0 }
      });
    });
    test("uses the latest unresolved summary when resolving a restored peer chat", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let resolveHistory;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        title: "Original title",
        resolver: () => new Promise((resolve) => {
          resolveHistory = resolve;
        })
      });
      const resolving = manager.resolveChatState(peerChat);
      manager.updateChatTitle(sessionUri, peerChat, "Updated title");
      resolveHistory({ turns: [] });
      const state = await resolving;
      assert.deepStrictEqual({
        catalogTitle: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
        stateTitle: state?.title
      }, {
        catalogTitle: "Updated title",
        stateTitle: "Updated title"
      });
    });
    test("invalidates a pending restored peer resolver before same-URI reuse", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let resolveHistory;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        resolver: () => new Promise((resolve) => {
          resolveHistory = resolve;
        })
      });
      const resolving = manager.resolveChatState(peerChat);
      manager.removeChat(sessionUri, peerChat);
      manager.addChat(sessionUri, peerChat, { title: "Replacement" });
      resolveHistory({ turns: [] });
      await assert.rejects(() => resolving, /invalidated/);
      assert.deepStrictEqual({
        replacement: manager.getChatState(peerChat) && { title: manager.getChatState(peerChat)?.title, turns: manager.getChatState(peerChat)?.turns.length }
      }, {
        replacement: { title: "Replacement", turns: 0 }
      });
    });
    test("registerRestoredChatSummary does not replace an already-hydrated chat URI", async () => {
      manager.createSession(makeSessionSummary());
      manager.addChat(sessionUri, peerChat, { title: "Peer" });
      let resolverCalls = 0;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        title: "Ignored",
        resolver: async () => {
          resolverCalls++;
          return { turns: [] };
        }
      });
      await manager.resolveChatState(peerChat);
      assert.deepStrictEqual(
        {
          chatCount: manager.getSessionState(sessionUri)?.chats.length,
          title: manager.getSessionState(sessionUri)?.chats.find((c) => c.resource === peerChat)?.title,
          peerTurns: manager.getChatState(peerChat)?.turns.length,
          resolverCalls
        },
        {
          chatCount: 2,
          title: "Peer",
          peerTurns: 0,
          resolverCalls: 0
        }
      );
    });
    test("registerRestoredChatSummary does not register a peer for an unknown session", async () => {
      const summary = manager.registerRestoredChatSummary("copilot:/missing", peerChat, {
        resolver: async () => ({ turns: [] })
      });
      assert.deepStrictEqual({
        summary,
        state: await manager.resolveChatState(peerChat)
      }, {
        summary: void 0,
        state: void 0
      });
    });
    test("SessionSummaryNotifier rolls a running peer chat up onto the session summary and emits one coalesced SessionSummaryChanged", () => {
      return runWithFakedTimers({ useFakeTimers: true }, async () => {
        manager.createSession(makeSessionSummary());
        manager.dispatchServerAction(sessionUri, { type: ActionType.SessionReady });
        manager.addChat(sessionUri, peerChat, { title: "Peer" });
        const notifications = [];
        disposables.add(manager.onDidEmitNotification((n) => notifications.push(n)));
        const summaryHasInProgress = () => ((manager.getSessionSummary(sessionUri)?.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress;
        const idleRollup = summaryHasInProgress();
        manager.dispatchServerAction(peerChat, {
          type: ActionType.ChatTurnStarted,
          turnId: "turn-peer",
          startedAt: "2025-01-01T00:00:00.000Z",
          message: { text: "b", origin: { kind: MessageKind.User } }
        });
        const runningRollup = summaryHasInProgress();
        await new Promise((r) => setTimeout(r, 150));
        const summaryChanges = notifications.filter((n) => n.type === NotificationType.SessionSummaryChanged);
        assert.deepStrictEqual(
          {
            idleRollup,
            runningRollup,
            summaryChangedCount: summaryChanges.length,
            notifiedStatusHasInProgress: ((summaryChanges[0]?.changes.status ?? 0) & SessionStatus.InProgress) === SessionStatus.InProgress,
            notifiedSession: summaryChanges[0]?.session
          },
          {
            idleRollup: false,
            runningRollup: true,
            summaryChangedCount: 1,
            notifiedStatusHasInProgress: true,
            notifiedSession: sessionUri
          }
        );
      });
    });
  });
  suite("providerData (G-B1)", () => {
    const peerChat = buildChatUri(sessionUri, "peer-1");
    const peerChat2 = buildChatUri(sessionUri, "peer-2");
    test("passes initial providerData verbatim to a restored peer resolver", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      const blob = '{"sdkSessionId":"abc-123","model":{"id":"x\\"y"}}';
      let received;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        providerData: blob,
        resolver: async (providerData) => {
          received = providerData;
          return { turns: [] };
        }
      });
      await manager.resolveChatState(peerChat);
      assert.strictEqual(received, blob);
    });
    test("passes providerData updated before resolution to the resolver", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let received;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        providerData: "v1",
        resolver: async (providerData) => {
          received = providerData;
          return { turns: [] };
        }
      });
      manager.updateChatProviderData(peerChat, "v2");
      await manager.resolveChatState(peerChat);
      assert.strictEqual(received, "v2");
    });
    test("retries resolution with current providerData", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      const received = [];
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        providerData: "v1",
        resolver: async (providerData) => {
          received.push(providerData);
          if (received.length === 1) {
            throw new Error("materialization failed");
          }
          return { turns: [] };
        }
      });
      await assert.rejects(() => manager.resolveChatState(peerChat), /materialization failed/);
      manager.updateChatProviderData(peerChat, "v2");
      await manager.resolveChatState(peerChat);
      assert.deepStrictEqual(received, ["v1", "v2"]);
    });
    test("removeChat prevents an unresolved peer resolver from observing stale providerData", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      let resolverCalls = 0;
      manager.registerRestoredChatSummary(sessionUri, peerChat, {
        providerData: "blob",
        resolver: async () => {
          resolverCalls++;
          return { turns: [] };
        }
      });
      manager.removeChat(sessionUri, peerChat);
      assert.deepStrictEqual({
        state: await manager.resolveChatState(peerChat),
        resolverCalls
      }, {
        state: void 0,
        resolverCalls: 0
      });
    });
    test("removeSession prevents unresolved peer resolvers from observing stale providerData", async () => {
      manager.restoreSession(makeSessionSummary(), []);
      const resolverCalls = [];
      for (const chat of [peerChat, peerChat2]) {
        manager.registerRestoredChatSummary(sessionUri, chat, {
          providerData: `blob-${chat}`,
          resolver: async () => {
            resolverCalls.push(chat);
            return { turns: [] };
          }
        });
      }
      manager.removeSession(sessionUri);
      assert.deepStrictEqual(
        {
          peer1: await manager.resolveChatState(peerChat),
          peer2: await manager.resolveChatState(peerChat2),
          resolverCalls
        },
        {
          peer1: void 0,
          peer2: void 0,
          resolverCalls: []
        }
      );
    });
  });
});
suite("Subagent URI helpers", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("buildSubagentSessionUri creates correct URI", () => {
    assert.strictEqual(
      buildSubagentSessionUri("copilot:/session-1", "tc-1"),
      "copilot:/session-1/subagent/tc-1"
    );
  });
  test("buildSubagentSessionUri preserves parent URI path shape", () => {
    assert.strictEqual(
      buildSubagentSessionUri("copilot:/session-1//nested/../kept", "tc-1"),
      "copilot:/session-1//nested/../kept/subagent/tc-1"
    );
  });
  test("parseSubagentSessionUri extracts parent and toolCallId", () => {
    const parsed = parseSubagentSessionUri("copilot:/session-1/subagent/tc-1");
    assert.deepStrictEqual(parsed && {
      parentSession: parsed.parentSession.toString(),
      toolCallId: parsed.toolCallId
    }, {
      parentSession: "copilot:/session-1",
      toolCallId: "tc-1"
    });
  });
  test("parseSubagentSessionUri handles nested subagent URIs", () => {
    const parsed = parseSubagentSessionUri("copilot:/session-1/subagent/tc-1/subagent/tc-2");
    assert.deepStrictEqual(parsed && {
      parentSession: parsed.parentSession.toString(),
      toolCallId: parsed.toolCallId
    }, {
      parentSession: "copilot:/session-1/subagent/tc-1",
      toolCallId: "tc-2"
    });
  });
  test("parseSubagentSessionUri returns undefined for non-subagent URIs", () => {
    assert.strictEqual(parseSubagentSessionUri("copilot:/session-1"), void 0);
  });
  test("isSubagentSession identifies subagent URIs", () => {
    assert.strictEqual(isSubagentSession("copilot:/session-1/subagent/tc-1"), true);
    assert.strictEqual(isSubagentSession("copilot:/session-1"), false);
  });
  test("buildSubagentSessionUriPrefix creates state manager prefix", () => {
    assert.strictEqual(
      buildSubagentSessionUriPrefix("copilot:/session-1"),
      "copilot:/session-1/subagent/"
    );
  });
  test("buildSubagentSessionUriPrefix preserves parent URI path shape", () => {
    assert.strictEqual(
      buildSubagentSessionUriPrefix("copilot:/session-1//nested/../kept"),
      "copilot:/session-1//nested/../kept/subagent/"
    );
  });
  suite("mergeSessionWithDefaultChat", () => {
    function makeSessionState(workingDirectory) {
      return {
        provider: "copilot",
        title: "Session",
        status: SessionStatus.Idle,
        lifecycle: SessionLifecycle.Ready,
        activeClients: [],
        chats: [],
        workingDirectories: workingDirectory ? [workingDirectory] : void 0
      };
    }
    function makeChatState(workingDirectory) {
      return {
        resource: "copilot:/test-session/chat/peer",
        title: "Peer",
        status: SessionStatus.Idle,
        modifiedAt: (/* @__PURE__ */ new Date()).toISOString(),
        workingDirectories: workingDirectory ? [workingDirectory] : void 0,
        turns: []
      };
    }
    test("resolves the per-chat working directory override over the session default", () => {
      const merged = mergeSessionWithDefaultChat(
        makeSessionState("file:///session-wd"),
        makeChatState("file:///peer-worktree")
      );
      assert.strictEqual(merged.workingDirectories?.[0], "file:///peer-worktree");
    });
    test("falls back to the session working directory when the chat does not override it", () => {
      const merged = mergeSessionWithDefaultChat(
        makeSessionState("file:///session-wd"),
        makeChatState(void 0)
      );
      assert.strictEqual(merged.workingDirectories?.[0], "file:///session-wd");
    });
    test("falls back to the session working directory when no chat state is hydrated", () => {
      const merged = mergeSessionWithDefaultChat(makeSessionState("file:///session-wd"), void 0);
      assert.strictEqual(merged.workingDirectories?.[0], "file:///session-wd");
      assert.deepStrictEqual(merged.turns, []);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxhZ2VudEhvc3RTdGF0ZU1hbmFnZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBydW5XaXRoRmFrZWRUaW1lcnMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL3Rlc3QvY29tbW9uL3RpbWVUcmF2ZWxTY2hlZHVsZXIuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBBY3Rpb25UeXBlLCBOb3RpZmljYXRpb25UeXBlLCB0eXBlIEFjdGlvbkVudmVsb3BlLCB0eXBlIElOb3RpZmljYXRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFNlc3Npb25TdW1tYXJ5LCBSZXNwb25zZVBhcnRLaW5kLCBST09UX1NUQVRFX1VSSSwgU2Vzc2lvbkxpZmVjeWNsZSwgU2Vzc2lvblN0YXR1cywgVHVyblN0YXRlLCBidWlsZENoYXRVcmksIGJ1aWxkRGVmYXVsdENoYXRVcmksIGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeCwgaXNTdWJhZ2VudFNlc3Npb24sIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCwgcGFyc2VTdWJhZ2VudFNlc3Npb25VcmksIHJlYWRIb3N0QnVpbGRJbmZvLCByZWFkU2Vzc2lvbkVoY2xpQWRvcHRhYmxlLCB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlLCB0eXBlIENoYXRTdGF0ZSwgdHlwZSBNYXJrZG93blJlc3BvbnNlUGFydCwgdHlwZSBTZXNzaW9uU3RhdGUsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgdHlwZSBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvbm90aWZpY2F0aW9ucy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIgfSBmcm9tICcuLi8uLi9ub2RlL2FnZW50SG9zdFN0YXRlTWFuYWdlci5qcyc7XG5pbXBvcnQgeyBidWlsZENoYW5nZXNldFVyaSwgYnVpbGRTZXNzaW9uQ2hhbmdlc2V0VXJpIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYW5nZXNldFVyaS5qcyc7XG5pbXBvcnQgeyB3aXRoQWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnRDdXN0b21pemF0aW9uU2V0dGluZ3MuanMnO1xuXG5zdWl0ZSgnQWdlbnRIb3N0U3RhdGVNYW5hZ2VyJywgKCkgPT4ge1xuXG5cdGxldCBkaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRsZXQgbWFuYWdlcjogQWdlbnRIb3N0U3RhdGVNYW5hZ2VyO1xuXHRjb25zdCBzZXNzaW9uVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy90ZXN0LXNlc3Npb24nIH0pLnRvU3RyaW5nKCk7XG5cdGNvbnN0IHNlc3Npb25DaGF0VXJpID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKTtcblxuXHRmdW5jdGlvbiBtYWtlU2Vzc2lvblN1bW1hcnkocmVzb3VyY2U/OiBzdHJpbmcpOiBTZXNzaW9uU3VtbWFyeSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHJlc291cmNlOiByZXNvdXJjZSA/PyBzZXNzaW9uVXJpLFxuXHRcdFx0cHJvdmlkZXI6ICdjb3BpbG90Jyxcblx0XHRcdHRpdGxlOiAnVGVzdCcsXG5cdFx0XHRzdGF0dXM6IFNlc3Npb25TdGF0dXMuSWRsZSxcblx0XHRcdGNyZWF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0bW9kaWZpZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuXHRcdFx0cHJvamVjdDogeyB1cmk6ICdmaWxlOi8vL3Rlc3QtcHJvamVjdCcsIGRpc3BsYXlOYW1lOiAnVGVzdCBQcm9qZWN0JyB9LFxuXHRcdH07XG5cdH1cblxuXHRzZXR1cCgoKSA9PiB7XG5cdFx0ZGlzcG9zYWJsZXMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0bWFuYWdlciA9IGRpc3Bvc2FibGVzLmFkZChuZXcgQWdlbnRIb3N0U3RhdGVNYW5hZ2VyKG5ldyBOdWxsTG9nU2VydmljZSgpKSk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKCgpID0+IHtcblx0XHRkaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH0pO1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2NyZWF0ZVNlc3Npb24gY3JlYXRlcyBpbml0aWFsIHN0YXRlIHdpdGggbGlmZWN5Y2xlIENyZWF0aW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubGlmZWN5Y2xlLCBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nKTtcblx0XHRjb25zdCBjaGF0U3RhdGUgPSBtYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUoc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYXRTdGF0ZT8udHVybnMubGVuZ3RoLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFN0YXRlPy5hY3RpdmVUdXJuLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkpPy5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHR9KTtcblxuXHR0ZXN0KCdvbkRpZENoYW5nZVNlc3Npb25Xb3JraW5nRGlyZWN0b3JpZXMgZmlyZXMgb25seSB3aGVuIHRoZSB3b3JraW5nLWRpcmVjdG9yeSBzZXQgY2hhbmdlcycsICgpID0+IHtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdGNvbnN0IGZpcmVkOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbldvcmtpbmdEaXJlY3RvcmllcygoeyBzZXNzaW9uIH0pID0+IGZpcmVkLnB1c2goc2Vzc2lvbikpKTtcblxuXHRcdC8vIEFkZGluZyBhIHJvb3QgY2hhbmdlcyB0aGUgc2V0IC0+IGZpcmVzLlxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL2EnIH0pO1xuXHRcdC8vIFJlLWFkZGluZyB0aGUgc2FtZSByb290IGlzIGEgcmVkdWNlciBuby1vcCAtPiBkb2VzIG5vdCBmaXJlLlxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5U2V0LCBkaXJlY3Rvcnk6ICdmaWxlOi8vL2EnIH0pO1xuXHRcdC8vIEFkZGluZyBhIHNlY29uZCByb290IGNoYW5nZXMgdGhlIHNldCAtPiBmaXJlcy5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uV29ya2luZ0RpcmVjdG9yeVNldCwgZGlyZWN0b3J5OiAnZmlsZTovLy9iJyB9KTtcblx0XHQvLyBSZW1vdmluZyBhIHJvb3QgY2hhbmdlcyB0aGUgc2V0IC0+IGZpcmVzLlxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Xb3JraW5nRGlyZWN0b3J5UmVtb3ZlZCwgZGlyZWN0b3J5OiAnZmlsZTovLy9iJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZmlyZWQsIFtzZXNzaW9uVXJpLCBzZXNzaW9uVXJpLCBzZXNzaW9uVXJpXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuYXBzaG90IHJldHVybnMgdW5kZWZpbmVkIGZvciB1bmtub3duIHNlc3Npb24nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdW5rbm93biA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvdW5rbm93bicgfSkudG9TdHJpbmcoKTtcblx0XHRjb25zdCBzbmFwc2hvdCA9IG1hbmFnZXIuZ2V0U25hcHNob3QodW5rbm93bik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdnZXRTbmFwc2hvdCByZXR1cm5zIHJvb3Qgc25hcHNob3QnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc25hcHNob3QgPSBtYW5hZ2VyLmdldFNuYXBzaG90KFJPT1RfU1RBVEVfVVJJKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZXNvdXJjZS50b1N0cmluZygpLCBST09UX1NUQVRFX1VSSS50b1N0cmluZygpKTtcblx0XHRjb25zdCByb290ID0gc25hcHNob3Quc3RhdGUgYXMgeyBhZ2VudHM6IHVua25vd25bXTsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlcjsgY29uZmlnPzogeyB2YWx1ZXM/OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyb290LmFnZW50cywgW10pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyb290LmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHQvLyBIb3N0IGNvbmZpZyBpcyBzZWVkZWQgd2l0aCB0aGUgcGxhdGZvcm0gcm9vdCBzY2hlbWEgYW5kIGRlZmF1bHRzLlxuXHRcdGFzc2VydC5vayhyb290LmNvbmZpZywgJ3Jvb3Qgc3RhdGUgc2hvdWxkIGluY2x1ZGUgYSBzZWVkZWQgY29uZmlnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NlZWRzIGhvc3QgYnVpbGQgaW5mbyBpbnRvIHJvb3Qgc3RhdGUgX21ldGEgd2hlbiBwcm92aWRlZCcsICgpID0+IHtcblx0XHRjb25zdCBidWlsZEluZm8gPSB7IHZlcnNpb246ICcxLjk2LjAnLCBjb21taXQ6ICdhYmMxMjM0JywgZGF0ZTogJzIwMjQtMDEtMDJUMDM6MDQ6MDVaJywgcXVhbGl0eTogJ2luc2lkZXInIH07XG5cdFx0Y29uc3QgbG9jYWxNYW5hZ2VyID0gZGlzcG9zYWJsZXMuYWRkKG5ldyBBZ2VudEhvc3RTdGF0ZU1hbmFnZXIobmV3IE51bGxMb2dTZXJ2aWNlKCksIHsgaG9zdEJ1aWxkSW5mbzogYnVpbGRJbmZvIH0pKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlYWRIb3N0QnVpbGRJbmZvKGxvY2FsTWFuYWdlci5yb290U3RhdGUpLCBidWlsZEluZm8pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBob3N0IGJ1aWxkIGluZm8gZnJvbSByb290IHN0YXRlIF9tZXRhIHdoZW4gbm90IHByb3ZpZGVkJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWFkSG9zdEJ1aWxkSW5mbyhtYW5hZ2VyLnJvb3RTdGF0ZSksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldFNuYXBzaG90IHJldHVybnMgc2Vzc2lvbiBzbmFwc2hvdCBhZnRlciBjcmVhdGlvbicsICgpID0+IHtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbWFuYWdlci5nZXRTbmFwc2hvdChzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQub2soc25hcHNob3QpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzbmFwc2hvdC5yZXNvdXJjZS50b1N0cmluZygpLCBzZXNzaW9uVXJpLnRvU3RyaW5nKCkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoc25hcHNob3Quc3RhdGUgYXMgU2Vzc2lvblN0YXRlKS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuQ3JlYXRpbmcpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaFNlcnZlckFjdGlvbiBhcHBsaWVzIGFjdGlvbiBhbmQgZW1pdHMgZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksXG5cdFx0fSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5vayhzdGF0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLmxpZmVjeWNsZSwgU2Vzc2lvbkxpZmVjeWNsZS5SZWFkeSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5hY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXNbMF0uc2VydmVyU2VxLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzWzBdLm9yaWdpbiwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc2Vzc2lvbiB0aXRsZSBjaGFuZ2VzIGFuZCBzdXBwcmVzc2VzIG5vLW9wIGFzc2lnbm1lbnRzJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBjaGFuZ2VzOiBBcnJheTx7IHNlc3Npb246IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9PiA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvblRpdGxlKGUgPT4gY2hhbmdlcy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ1VwZGF0ZWQnIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVXBkYXRlZCcgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNoYW5nZXMsIFt7IHNlc3Npb246IHNlc3Npb25VcmksIHRpdGxlOiAnVXBkYXRlZCcgfV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXJTZXEgaW5jcmVtZW50cyBtb25vdG9uaWNhbGx5JywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnVXBkYXRlZCcgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5zZXJ2ZXJTZXEsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXNbMV0uc2VydmVyU2VxLCAyKTtcblx0XHRhc3NlcnQub2soZW52ZWxvcGVzWzFdLnNlcnZlclNlcSA+IGVudmVsb3Blc1swXS5zZXJ2ZXJTZXEpO1xuXHR9KTtcblxuXHR0ZXN0KCdkaXNwYXRjaENsaWVudEFjdGlvbiBpbmNsdWRlcyBvcmlnaW4gaW4gZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdGNvbnN0IG9yaWdpbiA9IHsgY2xpZW50SWQ6ICdyZW5kZXJlci0xJywgY2xpZW50U2VxOiA0MiB9O1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hDbGllbnRBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSxcblx0XHRcdG9yaWdpbixcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZW52ZWxvcGVzWzBdLm9yaWdpbiwgb3JpZ2luKTtcblx0fSk7XG5cblx0dGVzdCgncm9vdCBhY3Rpb24gdGhhdCBkb2VzIG5vdCBjaGFuZ2Ugc3RhdGUgaXMgbm90IGVtaXR0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gRmlyc3QgZGlzcGF0Y2g6IGludHJvZHVjZXMgYSBuZXcgdmFsdWUsIHNob3VsZCBlbWl0LlxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oUk9PVF9TVEFURV9VUkksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgJ215LnNldHRpbmcnOiAndmFsdWUtYScgfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuc2VydmVyU2VxLCAxKTtcblxuXHRcdC8vIFNlY29uZCBkaXNwYXRjaCB3aXRoIHRoZSBzYW1lIHZhbHVlOiBzaG91bGQgYmUgZGVkdXBlZCBhbmQgbm90IGVtaXQuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyAnbXkuc2V0dGluZyc6ICd2YWx1ZS1hJyB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5zZXJ2ZXJTZXEsIDEsICdzZXJ2ZXJTZXEgbXVzdCBub3QgYWR2YW5jZSBvbiBhIG5vLW9wJyk7XG5cblx0XHQvLyBUaGlyZCBkaXNwYXRjaCB3aXRoIGEgZGVlcGx5LWVxdWFsIGJ1dCBuZXdseSBhbGxvY2F0ZWQgb2JqZWN0IHZhbHVlOlxuXHRcdC8vIHNob3VsZCBhbHNvIGJlIGRlZHVwZWQuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyAnbXkubmVzdGVkJzogeyBhbGxvdzogWyd4J10sIGRlbnk6IFtdIH0gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuc2VydmVyU2VxLCAyKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7ICdteS5uZXN0ZWQnOiB7IGFsbG93OiBbJ3gnXSwgZGVueTogW10gfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChlbnZlbG9wZXMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5zZXJ2ZXJTZXEsIDIsICdzZXJ2ZXJTZXEgbXVzdCBub3QgYWR2YW5jZSBvbiBhIG5vLW9wJyk7XG5cblx0XHQvLyBSZWFsIGNoYW5nZSBzdGlsbCBlbWl0cy5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKFJPT1RfU1RBVEVfVVJJLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlJvb3RDb25maWdDaGFuZ2VkLFxuXHRcdFx0Y29uZmlnOiB7ICdteS5zZXR0aW5nJzogJ3ZhbHVlLWInIH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudmVsb3Blcy5sZW5ndGgsIDMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnNlcnZlclNlcSwgMyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jvb3QgY29uZmlnIHJlcGxhY2VtZW50IHByZXNlcnZlcyBwcm92aWRlci1iYWNrZWQgdmFsdWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJvb3RTdGF0ZSA9IG1hbmFnZXIucm9vdFN0YXRlO1xuXHRcdGFzc2VydC5vayhyb290U3RhdGUuY29uZmlnKTtcblx0XHRyb290U3RhdGUuY29uZmlnLnZhbHVlc1snY29kZXgucGVyc29uYWxpdHknXSA9ICdmcmllbmRseSc7XG5cdFx0cm9vdFN0YXRlLl9tZXRhID0gd2l0aEFnZW50Q3VzdG9taXphdGlvblNldHRpbmdzKHJvb3RTdGF0ZSwgW3tcblx0XHRcdHByb3ZpZGVyOiAnY29kZXgnLFxuXHRcdFx0dGl0bGU6ICdDb2RleCcsXG5cdFx0XHRkZXNjcmlwdGlvbjogJ0NvZGV4IHNldHRpbmdzJyxcblx0XHRcdHNldHRpbmdzOiBbeyBrZXk6ICdjb2RleC5wZXJzb25hbGl0eScsIGdyb3VwOiAnUGVyc29uYWxpemF0aW9uJyB9XSxcblx0XHR9XSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaENsaWVudEFjdGlvbihST09UX1NUQVRFX1VSSSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5Sb290Q29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBzb21lUHJvdmlkZXJTZXR0aW5nOiAnb3BlbmFpJyB9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9LCB7IGNsaWVudElkOiAncmVuZGVyZXItMScsIGNsaWVudFNlcTogMSB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuY29uZmlnPy52YWx1ZXMsIHtcblx0XHRcdHNvbWVQcm92aWRlclNldHRpbmc6ICdvcGVuYWknLFxuXHRcdFx0J2NvZGV4LnBlcnNvbmFsaXR5JzogJ2ZyaWVuZGx5Jyxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGVudmVsb3Blc1swXS5hY3Rpb24sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuUm9vdENvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHtcblx0XHRcdFx0c29tZVByb3ZpZGVyU2V0dGluZzogJ29wZW5haScsXG5cdFx0XHRcdCdjb2RleC5wZXJzb25hbGl0eSc6ICdmcmllbmRseScsXG5cdFx0XHR9LFxuXHRcdFx0cmVwbGFjZTogdHJ1ZSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBjbGVhcnMgc3RhdGUgd2l0aG91dCBub3RpZmljYXRpb24nLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFNuYXBzaG90KHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2RlbGV0ZVNlc3Npb24gY2xlYXJzIHN0YXRlIGFuZCBlbWl0cyBub3RpZmljYXRpb24nLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5kZWxldGVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldFNuYXBzaG90KHNlc3Npb25VcmkpLCB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnNbMF0udHlwZSwgTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uUmVtb3ZlZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NyZWF0ZVNlc3Npb24gZW1pdHMgc2Vzc2lvbkFkZGVkIG5vdGlmaWNhdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChub3RpZmljYXRpb25zWzBdLnR5cGUsIE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvbkFkZGVkKTtcblx0fSk7XG5cblx0dGVzdCgnZGVmYXVsdCBjaGF0IGluaGVyaXRzIHRoZSBzZXNzaW9uIHdvcmtpbmcgZGlyZWN0b3J5IHJlc29sdmVkIGF0IG1hdGVyaWFsaXphdGlvbicsICgpID0+IHtcblx0XHQvLyBBIGRlZmVycmVkIChwcm92aXNpb25hbCkgc2Vzc2lvbiBpcyBjcmVhdGVkIHdpdGggYSBwcmUtbWF0ZXJpYWxpemF0aW9uXG5cdFx0Ly8gd29ya2luZyBkaXJlY3Rvcnk7IG1hdGVyaWFsaXphdGlvbiBsYXRlciByZXNvbHZlcyBpdCB0byBhIGRpZmZlcmVudFxuXHRcdC8vIG9uZSAoZS5nLiBhIGdpdCB3b3JrdHJlZSkgdmlhIG1hcmtTZXNzaW9uUGVyc2lzdGVkLiBUaGUgZGVmYXVsdCBjaGF0XG5cdFx0Ly8gaGFzIG5vIHBlci1jaGF0IHdvcmtpbmctZGlyZWN0b3J5IG92ZXJyaWRlLCBzbyBnZXRTZXNzaW9uU3RhdGUgbXVzdFxuXHRcdC8vIHByb2plY3QgdGhlIFJFU09MVkVEIHNlc3Npb24gd29ya2luZyBkaXJlY3RvcnksIG5ldmVyIHRoZSBzdGFsZVxuXHRcdC8vIGNyZWF0ZS10aW1lIHZhbHVlIHRoYXQgd2FzIHNlZWRlZCBvbnRvIHRoZSBkZWZhdWx0IGNoYXQuXG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKHsgLi4ubWFrZVNlc3Npb25TdW1tYXJ5KCksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3Byb3Zpc2lvbmFsJ10gfSwgeyBlbWl0Tm90aWZpY2F0aW9uOiBmYWxzZSB9KTtcblx0XHRtYW5hZ2VyLm1hcmtTZXNzaW9uUGVyc2lzdGVkKHNlc3Npb25VcmksIHsgLi4ubWFrZVNlc3Npb25TdW1tYXJ5KCksIHdvcmtpbmdEaXJlY3RvcmllczogWydmaWxlOi8vL3Jlc29sdmVkLXdvcmt0cmVlJ10gfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHNlc3Npb246IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy53b3JraW5nRGlyZWN0b3JpZXM/LlswXSxcblx0XHRcdGRlZmF1bHRDaGF0OiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uQ2hhdFVyaSk/LndvcmtpbmdEaXJlY3Rvcmllcz8uWzBdLFxuXHRcdH0sIHtcblx0XHRcdHNlc3Npb246ICdmaWxlOi8vL3Jlc29sdmVkLXdvcmt0cmVlJyxcblx0XHRcdGRlZmF1bHRDaGF0OiAnZmlsZTovLy9yZXNvbHZlZC13b3JrdHJlZScsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2dldEFjdGl2ZVR1cm5JZCByZXR1cm5zIGFjdGl2ZSB0dXJuIGlkIGFmdGVyIHR1cm5TdGFydGVkJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpKSwgdW5kZWZpbmVkKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldEFjdGl2ZVR1cm5JZChzZXNzaW9uVXJpKSwgJ3R1cm4tMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdyb290IHN0YXRlIHN0YXJ0cyB3aXRoIGFjdGl2ZVNlc3Npb25zOiAwJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNuYXBzaG90ID0gbWFuYWdlci5nZXRTbmFwc2hvdChST09UX1NUQVRFX1VSSSk7XG5cdFx0YXNzZXJ0Lm9rKHNuYXBzaG90KTtcblx0XHRjb25zdCByb290ID0gc25hcHNob3Quc3RhdGUgYXMgeyBhZ2VudHM6IHVua25vd25bXTsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlciB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocm9vdC5hZ2VudHMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocm9vdC5hY3RpdmVTZXNzaW9ucywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm5TdGFydGVkIGRpc3BhdGNoZXMgcm9vdC9hY3RpdmVTZXNzaW9uc0NoYW5nZWQgd2l0aCBjb3JyZWN0IGNvdW50JywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aXZlQ2hhbmdlZFswXS5hY3Rpb24gYXMgeyBhY3RpdmVTZXNzaW9uczogbnVtYmVyIH0pLmFjdGl2ZVNlc3Npb25zLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuQ29tcGxldGUgZGlzcGF0Y2hlcyByb290L2FjdGl2ZVNlc3Npb25zQ2hhbmdlZCBiYWNrIHRvIDAnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYWN0aXZlQ2hhbmdlZFswXS5hY3Rpb24gYXMgeyBhY3RpdmVTZXNzaW9uczogbnVtYmVyIH0pLmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdhY3RpdmVTZXNzaW9ucyByZWZsZWN0cyBjb25jdXJyZW50IHR1cm4gY291bnQgYWNyb3NzIHNlc3Npb25zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHNlc3Npb24yVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdjb3BpbG90JywgcGF0aDogJy90ZXN0LXNlc3Npb24tMicgfSkudG9TdHJpbmcoKTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb25VcmkpKTtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KHNlc3Npb24yVXJpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb24yVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uMlVyaSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0yJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdiJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMik7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAxKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uMlVyaSksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdyZW1vdmVTZXNzaW9uIGRlY3JlbWVudHMgYWN0aXZlIHNlc3Npb25zIHdoZW4gYW4gYWN0aXZlIHR1cm4gaXMgc3RyYW5kZWQnLCAoKSA9PiB7XG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDEpO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0Ly8gRXZpY3QgdGhlIHNlc3Npb24gd2hpbGUgYSB0dXJuIGlzIHN0aWxsIGFjdGl2ZS4gVGhlIGFjdGl2ZS1zZXNzaW9uc1xuXHRcdC8vIGNvdW50IG11c3QgZHJvcCB0byB6ZXJvIHNvIHRoYXQgdGhlIHNlcnZlciBsaWZldGltZSB0cmFja2VyIChkcml2aW5nXG5cdFx0Ly8gYC0tZW5hYmxlLXJlbW90ZS1hdXRvLXNodXRkb3duYCkgcmVsZWFzZXMgaXRzIGhvbGQuXG5cdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAwKTtcblx0XHRjb25zdCBhY3RpdmVDaGFuZ2VkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuUm9vdEFjdGl2ZVNlc3Npb25zQ2hhbmdlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGl2ZUNoYW5nZWQubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGFjdGl2ZUNoYW5nZWRbMF0uYWN0aW9uIGFzIHsgYWN0aXZlU2Vzc2lvbnM6IG51bWJlciB9KS5hY3RpdmVTZXNzaW9ucywgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3JlbW92ZVNlc3Npb24gZG9lcyBub3QgZGlzcGF0Y2ggYWN0aXZlLXNlc3Npb25zIGNoYW5nZSB3aGVuIG5vIHR1cm4gaXMgYWN0aXZlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdGNvbnN0IGFjdGl2ZUNoYW5nZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5Sb290QWN0aXZlU2Vzc2lvbnNDaGFuZ2VkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aXZlQ2hhbmdlZC5sZW5ndGgsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdzdGFsZSBDaGF0VHVybkNvbXBsZXRlICh3cm9uZyB0dXJuSWQpIGRvZXMgbm90IGRlY3JlbWVudCBhY3RpdmUgc2Vzc2lvbnMnLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIHJlZHVjZXIncyBgZW5kVHVybmAgbm8tb3BzIHdoZW4gdGhlIGFjdGlvbidzIHR1cm5JZCBkb2Vzbid0IG1hdGNoXG5cdFx0Ly8gYHN0YXRlLmFjdGl2ZVR1cm4uaWRgLiBUaGUgYWN0aXZlLXNlc3Npb24gY291bnQgbXVzdCBmb2xsb3cgc3VpdCBzb1xuXHRcdC8vIHRoZSBsaWZldGltZSB0cmFja2VyIGRvZXNuJ3QgcmVsZWFzZSBpdHMgaG9sZCB3aGlsZSBhIHR1cm4gaXMgc3RpbGxcblx0XHQvLyBnZW51aW5lbHkgcnVubmluZy5cblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICdzdGFsZS10dXJuJyxcblx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5oYXNBY3RpdmVTZXNzaW9ucywgdHJ1ZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbmN1cnJlbnQgQ2hhdFR1cm5TdGFydGVkIG9uIHNhbWUgc2Vzc2lvbiBrZWVwcyBhY3RpdmUgY291bnQgYXQgb25lJywgKCkgPT4ge1xuXHRcdC8vIFRoZSByZWR1Y2VyIHVuY29uZGl0aW9uYWxseSBvdmVyd3JpdGVzIGBhY3RpdmVUdXJuYCwgc28gdHdvIHN0YXJ0c1xuXHRcdC8vIHdpdGhvdXQgYW4gaW50ZXJ2ZW5pbmcgY29tcGxldGUgc3RpbGwgcmVwcmVzZW50IGEgc2luZ2xlIGFjdGl2ZSB0dXJuXG5cdFx0Ly8gZnJvbSBzdGF0ZSdzIHBvaW50IG9mIHZpZXcuIFRoZSBjb3VudCBtdXN0IG1pcnJvciB0aGF0LlxuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMicsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucywgMSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsIDApO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmhhc0FjdGl2ZVNlc3Npb25zLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FjdGl2ZSB0dXJuIGV2ZW50IGZvbGxvd3MgcmVkdWNlci1kZXJpdmVkIGFjdGl2ZSBzdGF0ZSB0cmFuc2l0aW9ucycsICgpID0+IHtcblx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25SZWFkeSwgfSk7XG5cdFx0Y29uc3QgZXZlbnRzOiBBcnJheTx7IHNlc3Npb246IHN0cmluZzsgYWN0aXZlOiBib29sZWFuIH0+ID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybihlID0+IGV2ZW50cy5wdXNoKGUpKSk7XG5cblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0fSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAnc3RhbGUtdHVybicsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHR9KTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdGVycm9yOiB7IGVycm9yVHlwZTogJ2ZhaWxlZCcsIG1lc3NhZ2U6ICdib29tJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChldmVudHMsIFtcblx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0XHR7IHNlc3Npb246IHNlc3Npb25VcmksIGFjdGl2ZTogZmFsc2UgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYWN0aXZlIHR1cm4gZXZlbnQgY292ZXJzIGNhbmNlbGxhdGlvbiBhbmQgcmVtb3ZhbCB3aGlsZSBhY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2Vzc2lvbjJVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL3Rlc3Qtc2Vzc2lvbi0yJyB9KS50b1N0cmluZygpO1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoc2Vzc2lvbjJVcmkpKTtcblx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbjJVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXHRcdGNvbnN0IGV2ZW50czogQXJyYXk8eyBzZXNzaW9uOiBzdHJpbmc7IGFjdGl2ZTogYm9vbGVhbiB9PiA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkQ2hhbmdlU2Vzc2lvbkFjdGl2ZVR1cm4oZSA9PiBldmVudHMucHVzaChlKSkpO1xuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0fSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24yVXJpKSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuLTInLFxuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hpJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdH0pO1xuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uMlVyaSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cywgW1xuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uVXJpLCBhY3RpdmU6IHRydWUgfSxcblx0XHRcdHsgc2Vzc2lvbjogc2Vzc2lvblVyaSwgYWN0aXZlOiBmYWxzZSB9LFxuXHRcdFx0eyBzZXNzaW9uOiBzZXNzaW9uMlVyaSwgYWN0aXZlOiB0cnVlIH0sXG5cdFx0XHR7IHNlc3Npb246IHNlc3Npb24yVXJpLCBhY3RpdmU6IGZhbHNlIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVTZXNzaW9uIGNyZWF0ZXMgc2Vzc2lvbiBpbiBSZWFkeSBzdGF0ZSB3aXRoIHByZS1wb3B1bGF0ZWQgdHVybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSBbXG5cdFx0XHR7XG5cdFx0XHRcdGlkOiAndHVybi0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnd29ybGQnIH0gc2F0aXNmaWVzIE1hcmtkb3duUmVzcG9uc2VQYXJ0XSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgdHVybnMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5saWZlY3ljbGUsIFNlc3Npb25MaWZlY3ljbGUuUmVhZHkpO1xuXHRcdGNvbnN0IGNoYXRTdGF0ZSA9IG1hbmFnZXIuZ2V0RGVmYXVsdENoYXRTdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhdFN0YXRlPy50dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGF0U3RhdGU/LnR1cm5zWzBdLm1lc3NhZ2UudGV4dCwgJ2hlbGxvJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChjaGF0U3RhdGU/LnR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgTWFya2Rvd25SZXNwb25zZVBhcnQpLmNvbnRlbnQsICd3b3JsZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlU2Vzc2lvbiByZXR1cm5zIGV4aXN0aW5nIHN0YXRlIGZvciBkdXBsaWNhdGUgc2Vzc2lvbicsICgpID0+IHtcblx0XHRjb25zdCBleGlzdGluZyA9IG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUsIGV4aXN0aW5nKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVNlc3Npb24gZG9lcyBub3QgZW1pdCBzZXNzaW9uQWRkZWQgbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbnMubGVuZ3RoLCAwLCAnc2hvdWxkIG5vdCBlbWl0IG5vdGlmaWNhdGlvbiBmb3IgcmVzdG9yZWQgc2Vzc2lvbnMnKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZVNlc3Npb24gZW1pdHMgc2Vzc2lvblN1bW1hcnlDaGFuZ2VkIGNsZWFyaW5nIHRoZSBhZG9wdGFibGUgbWFya2VyIGZvciBhIHByZXZpb3VzbHkgc3VyZmFjZWQgc2Vzc2lvbicsICgpID0+IHtcblx0XHQvLyBBIHN1cmZhY2VkIGFkb3B0YWJsZS1sZWdhY3kgc2Vzc2lvbiBpcyBhbm5vdW5jZWQgd2l0aCB0aGUgbWFya2VyOyBhZG9wdGluZ1xuXHRcdC8vIGl0IHZpYSByZXN0b3JlU2Vzc2lvbiBtdXN0IG5vdGlmeSBjbGllbnRzIHRoZSBtYXJrZXIgd2FzIGNsZWFyZWQgc28gdGhleVxuXHRcdC8vIHVwZGF0ZSB0aGUgZW50cnkgaW4gcGxhY2UgaW5zdGVhZCBvZiBkcm9wcGluZyB0aGUganVzdC1vcGVuZWQgc2Vzc2lvbi5cblx0XHRtYW5hZ2VyLmFubm91bmNlU3VyZmFjZWRTZXNzaW9uKHsgLi4ubWFrZVNlc3Npb25TdW1tYXJ5KCksIF9tZXRhOiB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlKHVuZGVmaW5lZCkgfSk7XG5cblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblxuXHRcdGNvbnN0IGNoYW5nZWQgPSBub3RpZmljYXRpb25zLmZpbHRlcihuID0+IG4udHlwZSA9PT0gTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uU3VtbWFyeUNoYW5nZWQpIGFzIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZFBhcmFtc1tdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNoYW5nZWRbMF0uc2Vzc2lvbiwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKE9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChjaGFuZ2VkWzBdLmNoYW5nZXMsICdfbWV0YScpLCB0cnVlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVhZFNlc3Npb25FaGNsaUFkb3B0YWJsZShjaGFuZ2VkWzBdLmNoYW5nZXMuX21ldGEpLCBmYWxzZSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1bnVzZWQtZHJhZnQgdHJhY2tpbmcnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXBvcnRzIGRyYWZ0IHN0YXR1cyBieSBvcmlnaW4sIGFkZHJlc3NhYmxlIGJ5IHNlc3Npb24gb3IgY2hhdCBVUkknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN0b3JlZFVyaSA9IFVSSS5mcm9tKHsgc2NoZW1lOiAnY29waWxvdCcsIHBhdGg6ICcvcmVzdG9yZWQtc2Vzc2lvbicgfSkudG9TdHJpbmcoKTtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeShyZXN0b3JlZFVyaSksIFtdKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNyZWF0ZWQ6IG1hbmFnZXIuaXNVbnVzZWREcmFmdChzZXNzaW9uVXJpKSxcblx0XHRcdFx0Y3JlYXRlZFZpYUNoYXRVcmk6IG1hbmFnZXIuaXNVbnVzZWREcmFmdChzZXNzaW9uQ2hhdFVyaSksXG5cdFx0XHRcdHJlc3RvcmVkOiBtYW5hZ2VyLmlzVW51c2VkRHJhZnQocmVzdG9yZWRVcmkpLFxuXHRcdFx0XHRyZXN0b3JlZFZpYUNoYXRVcmk6IG1hbmFnZXIuaXNVbnVzZWREcmFmdChidWlsZERlZmF1bHRDaGF0VXJpKHJlc3RvcmVkVXJpKSksXG5cdFx0XHRcdHVua25vd246IG1hbmFnZXIuaXNVbnVzZWREcmFmdChVUkkuZnJvbSh7IHNjaGVtZTogJ2NvcGlsb3QnLCBwYXRoOiAnL25vcGUnIH0pLnRvU3RyaW5nKCkpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRjcmVhdGVkOiB0cnVlLFxuXHRcdFx0XHRjcmVhdGVkVmlhQ2hhdFVyaTogdHJ1ZSxcblx0XHRcdFx0cmVzdG9yZWQ6IGZhbHNlLFxuXHRcdFx0XHRyZXN0b3JlZFZpYUNoYXRVcmk6IGZhbHNlLFxuXHRcdFx0XHR1bmtub3duOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2EgcmVzdG9yZWQgc2Vzc2lvbiB0aGF0IHdhcyBmaXJzdCBjcmVhdGVkIGlzIG5vIGxvbmdlciBhIGRyYWZ0JywgKCkgPT4ge1xuXHRcdFx0Ly8gYHJlc3RvcmVTZXNzaW9uYCBzaG9ydC1jaXJjdWl0cyB3aGVuIHRoZSBzZXNzaW9uIGlzIGFscmVhZHkgaW4gc3RhdGUuXG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWFuYWdlci5pc1VudXNlZERyYWZ0KHNlc3Npb25VcmkpLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RyYWZ0IHN0YXR1cyBpcyByZXRpcmVkIGJ5IGEgdHVybiBhbmQgZG9lcyBub3QgY29tZSBiYWNrIG9uIHRydW5jYXRlJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IG9ic2VydmVkOiAoYm9vbGVhbiB8IHVuZGVmaW5lZClbXSA9IFttYW5hZ2VyLmlzVW51c2VkRHJhZnQoc2Vzc2lvblVyaSldO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0b2JzZXJ2ZWQucHVzaChtYW5hZ2VyLmlzVW51c2VkRHJhZnQoc2Vzc2lvblVyaSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybi0xJywgZHVyYXRpb246IDEgfSk7XG5cdFx0XHRvYnNlcnZlZC5wdXNoKG1hbmFnZXIuaXNVbnVzZWREcmFmdChzZXNzaW9uVXJpKSk7XG5cblx0XHRcdC8vIFRydW5jYXRlLXRvLXplcm8gZW1wdGllcyB0aGUgY2hhdCBidXQgbXVzdCBub3QgcmVzdXJyZWN0IHRoZSBkcmFmdC5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvbkNoYXRVcmksIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkIH0pO1xuXHRcdFx0b2JzZXJ2ZWQucHVzaChtYW5hZ2VyLmlzVW51c2VkRHJhZnQoc2Vzc2lvblVyaSkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0b2JzZXJ2ZWQsXG5cdFx0XHRcdHR1cm5zQWZ0ZXJUcnVuY2F0ZTogbWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb25VcmkpPy50dXJucy5sZW5ndGgsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG9ic2VydmVkOiBbdHJ1ZSwgZmFsc2UsIGZhbHNlLCBmYWxzZV0sXG5cdFx0XHRcdHR1cm5zQWZ0ZXJUcnVuY2F0ZTogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2VlZGluZyB0dXJucyBmb3IgYSBmb3JrIHJldGlyZXMgZHJhZnQgc3RhdHVzJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuc2VlZERlZmF1bHRDaGF0VHVybnMoc2Vzc2lvblVyaSwgW3tcblx0XHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHR9XSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmlzVW51c2VkRHJhZnQoc2Vzc2lvblVyaSksIGZhbHNlKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc2Vzc2lvblN1bW1hcnlDaGFuZ2VkIHdoZW4gc3VtbWFyeSBjaGFuZ2VzJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ05ldyBUaXRsZScgfSk7XG5cblx0XHRcdC8vIFNob3VsZCBub3QgZmlyZSBzeW5jaHJvbm91c2x5IChkZWJvdW5jZWQpXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKS5sZW5ndGgsIDApO1xuXG5cdFx0XHQvLyBBZHZhbmNlIHBhc3QgZGVib3VuY2Vcblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDEpO1xuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uID0gY2hhbmdlZFswXSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXM7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLnNlc3Npb24sIHNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG5vdGlmaWNhdGlvbi5jaGFuZ2VzLnRpdGxlLCAnTmV3IFRpdGxlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobm90aWZpY2F0aW9uLmNoYW5nZXMuc3RhdHVzLCB1bmRlZmluZWQsICd1bmNoYW5nZWQgZmllbGRzIHNob3VsZCBiZSBvbWl0dGVkJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvYWxlc2NlcyBtdWx0aXBsZSBzdW1tYXJ5IGNoYW5nZXMgaW50byBvbmUgbm90aWZpY2F0aW9uJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ0ZpcnN0JyB9KTtcblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25UaXRsZUNoYW5nZWQsIHRpdGxlOiAnU2Vjb25kJyB9KTtcblxuXHRcdFx0YXdhaXQgbmV3IFByb21pc2UociA9PiBzZXRUaW1lb3V0KHIsIDE1MCkpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gbm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSwgJ3Nob3VsZCBjb2FsZXNjZSBpbnRvIG9uZSBub3RpZmljYXRpb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoY2hhbmdlZFswXSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXMpLmNoYW5nZXMudGl0bGUsICdTZWNvbmQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgZW1pdCBzZXNzaW9uU3VtbWFyeUNoYW5nZWQgd2hlbiBzdW1tYXJ5IGlzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRyZXR1cm4gcnVuV2l0aEZha2VkVGltZXJzKHsgdXNlRmFrZVRpbWVyczogdHJ1ZSB9LCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblJlYWR5LCB9KTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0Ly8gU2Vzc2lvblJlYWR5IGNoYW5nZXMgbGlmZWN5Y2xlLCBub3Qgc3VtbWFyeSBcdTIwMTQgc28gbm8gc3VtbWFyeSBub3RpZmljYXRpb25cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkb2VzIG5vdCBlbWl0IHNlc3Npb25TdW1tYXJ5Q2hhbmdlZCBmb3IgZGVsZXRlZCBzZXNzaW9uJywgKCkgPT4ge1xuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdE5vdGlmaWNhdGlvbihuID0+IG5vdGlmaWNhdGlvbnMucHVzaChuKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uVGl0bGVDaGFuZ2VkLCB0aXRsZTogJ05ldyBUaXRsZScgfSk7XG5cdFx0XHRtYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3QgY2hhbmdlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25TdW1tYXJ5Q2hhbmdlZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2hhbmdlZC5sZW5ndGgsIDAsICdzaG91bGQgbm90IGVtaXQgZm9yIGRlbGV0ZWQgc2Vzc2lvbnMnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBmbHVzaGVzIHBlbmRpbmcgc3RhdHVzPUlkbGUgbm90aWZpY2F0aW9uIGJlZm9yZSBldmljdGlvbicsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiB3aGVuIF9tYXliZUV2aWN0SWRsZVNlc3Npb24gY2FsbHMgcmVtb3ZlU2Vzc2lvbiB3aXRoaW4gdGhlXG5cdFx0Ly8gMTAwIG1zIHNjaGVkdWxlciB3aW5kb3cgYWZ0ZXIgYSB0dXJuIGNvbXBsZXRlcywgdGhlIGNsaWVudCBtdXN0IHN0aWxsXG5cdFx0Ly8gcmVjZWl2ZSBhIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZCB3aXRoIHN0YXR1cz1JZGxlIHNvIHRoZSBzcGlubmVyIGNsZWFycy5cblx0XHQvL1xuXHRcdC8vIFRoZSBrZXkgcHJlY29uZGl0aW9uIGlzIHRoYXQgX2xhc3ROb3RpZmllZFN1bW1hcmllcyBhbHJlYWR5IGhhc1xuXHRcdC8vIHN0YXR1cz1JblByb2dyZXNzICh0aGUgc2NoZWR1bGVyIG11c3QgaGF2ZSBmaXJlZCBhZnRlciBUdXJuU3RhcnRlZCBzb1xuXHRcdC8vIHRoZSBjbGllbnQga25vd3MgdGhlIHNlc3Npb24gaXMgYnVzeSkuIFRoZW4gVHVybkNvbXBsZXRlIGZsaXBzIHRoZVxuXHRcdC8vIHN1bW1hcnkgYmFjayB0byBJZGxlIGFuZCBzY2hlZHVsZXMgYW5vdGhlciBmbHVzaC4gSWYgcmVtb3ZlU2Vzc2lvblxuXHRcdC8vIHJhY2VzIHdpdGggdGhhdCAxMDAgbXMgd2luZG93IHRoZSBmbHVzaCBtdXN0IGhhcHBlbiBzeW5jaHJvbm91c2x5LlxuXHRcdHJldHVybiBydW5XaXRoRmFrZWRUaW1lcnMoeyB1c2VGYWtlVGltZXJzOiB0cnVlIH0sIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHksIH0pO1xuXG5cdFx0XHQvLyBTdGFydCBhIHR1cm4gXHUyMTkyIHN0YXR1cyBiZWNvbWVzIEluUHJvZ3Jlc3MuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXG5cdFx0XHQvLyBMZXQgdGhlIHNjaGVkdWxlciBmaXJlIHNvIF9sYXN0Tm90aWZpZWRTdW1tYXJpZXMgbm93IGhhcyBzdGF0dXM9SW5Qcm9ncmVzcy5cblx0XHRcdGF3YWl0IG5ldyBQcm9taXNlKHIgPT4gc2V0VGltZW91dChyLCAxNTApKTtcblxuXHRcdFx0Y29uc3Qgbm90aWZpY2F0aW9uczogSU5vdGlmaWNhdGlvbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0Ly8gVHVybiBjb21wbGV0ZXMgXHUyMDE0IHN0YXR1cyBmbGlwcyBiYWNrIHRvIElkbGUuIFRoaXMgc2NoZWR1bGVzIGEgc3VtbWFyeVxuXHRcdFx0Ly8gZmx1c2ggMTAwIG1zIGxhdGVyIGJ1dCB3ZSB3aWxsIGNhbGwgcmVtb3ZlU2Vzc2lvbiBiZWZvcmUgaXQgZmlyZXMuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25DaGF0VXJpLCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgZXZpY3Rpb24gd2l0aGluIHRoZSAxMDAgbXMgZGVib3VuY2Ugd2luZG93LlxuXHRcdFx0bWFuYWdlci5yZW1vdmVTZXNzaW9uKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRjb25zdCBjaGFuZ2VkID0gbm90aWZpY2F0aW9ucy5maWx0ZXIobiA9PiBuLnR5cGUgPT09IE5vdGlmaWNhdGlvblR5cGUuU2Vzc2lvblN1bW1hcnlDaGFuZ2VkKSBhcyBTZXNzaW9uU3VtbWFyeUNoYW5nZWRQYXJhbXNbXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkLmxlbmd0aCwgMSwgJ3Nob3VsZCBlbWl0IFNlc3Npb25TdW1tYXJ5Q2hhbmdlZCBzeW5jaHJvbm91c2x5IGluIHJlbW92ZVNlc3Npb24nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjaGFuZ2VkWzBdLmNoYW5nZXMuc3RhdHVzLCBTZXNzaW9uU3RhdHVzLklkbGUsICdzdGF0dXMgc2hvdWxkIGJlIElkbGUgc28gdGhlIHNwaW5uZXIgY2xlYXJzJyk7XG5cdFx0fSk7XG5cdH0pO1xuXHR0ZXN0KCdkaXNwb3NlQ2hhbmdlc2V0IGVtaXRzIENoYW5nZXNldENsZWFyZWQgYW5kIHJlbW92ZXMgdGhlIHN0YXRlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0bWFuYWdlci5kaXNwb3NlQ2hhbmdlc2V0KGNoYW5nZXNldCk7XG5cblx0XHRjb25zdCBjbGVhcmVkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNsZWFyZWQubGVuZ3RoLCAxLCAnZXhwZWN0ZWQgZXhhY3RseSBvbmUgY2xlYXJlZCBlbnZlbG9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjbGVhcmVkWzBdLmNoYW5uZWwsIGNoYW5nZXNldCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KSwgdW5kZWZpbmVkLCAnc3RhdGUgc2hvdWxkIGJlIGRlbGV0ZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncHJvZHVjZXItZW1pdHRlZCBDaGFuZ2VzZXRDbGVhcmVkIGtlZXBzIHRoZSBzdGF0ZSBhbGl2ZSAocmVjb21wdXRlIHBhdGgpJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy9hLnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KT8uZmlsZXMubGVuZ3RoLCAxKTtcblxuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldENsZWFyZWQsXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhZnRlciA9IG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KTtcblx0XHRhc3NlcnQub2soYWZ0ZXIsICdzdGF0ZSBzaG91bGQgc3RpbGwgZXhpc3QnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWZ0ZXIuZmlsZXMubGVuZ3RoLCAwLCAnZmlsZXMgc2hvdWxkIGJlIGNsZWFyZWQnKTtcblx0fSk7XG5cblx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBkb2VzIE5PVCBkaXNwb3NlIHBlci1zZXNzaW9uIGNoYW5nZXNldHMgKExSVSBldmljdGlvbiBtdXN0IG5vdCBjbGVhciBsaXN0LXZpZXcgY2hpcCknLCAoKSA9PiB7XG5cdFx0Ly8gUmVncmVzc2lvbjogX21heWJlRXZpY3RJZGxlU2Vzc2lvbiBjYWxscyByZW1vdmVTZXNzaW9uIHRvIGRyb3AgYW5cblx0XHQvLyBpZGxlIHNlc3Npb24gZnJvbSB0aGUgaW4tbWVtb3J5IGNhY2hlLiBUaGUgQWdlbnRzIFdpbmRvdyBsaXN0IHZpZXdcblx0XHQvLyBrZWVwcyBhIHBlci1yb3cgY2hhbmdlc2V0IHN1YnNjcmlwdGlvbiBvcGVuIHRvIHJlbmRlciB0aGUgZGlmZlxuXHRcdC8vIGNoaXAsIHNvIGNhc2NhZGluZyBkaXNwb3NlU2Vzc2lvbkNoYW5nZXNldHMgaGVyZSB3b3VsZCBlbWl0IGFcblx0XHQvLyBDaGFuZ2VzZXRDbGVhcmVkIGVudmVsb3BlIHRoYXQgZW1wdGllcyB0aGUgY2hpcCB3aGlsZSB0aGUgcm93IGlzXG5cdFx0Ly8gc3RpbGwgb24gc2NyZWVuLiBUaGUgY2hpcCB0aGVuIHZpc2libHkgdmFuaXNoZXMgYW5kIG9ubHkgcmVhcHBlYXJzXG5cdFx0Ly8gd2hlbiB0aGUgdXNlciBjbGlja3MgYmFjayBpbnRvIHRoZSBzZXNzaW9uIGFuZCB0aGUgbGlzdCByZS1zZWVkc1xuXHRcdC8vIHRoZSBjaGFuZ2VzZXQuXG5cdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRjb25zdCBjaGFuZ2VzZXQgPSBtYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkU2Vzc2lvbkNoYW5nZXNldFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXQsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL2EudHMnLFxuXHRcdFx0XHRlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy9hLnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdGNvbnN0IGNsZWFyZWQgPSBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGFuZ2VzZXRDbGVhcmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZC5sZW5ndGgsIDAsICdyZW1vdmVTZXNzaW9uIG11c3Qgbm90IGVtaXQgQ2hhbmdlc2V0Q2xlYXJlZCcpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLmdldENoYW5nZXNldFN0YXRlKGNoYW5nZXNldCk/LmZpbGVzLmxlbmd0aCwgMSwgJ2NoYW5nZXNldCBzdGF0ZSBzaG91bGQgc3Vydml2ZSBldmljdGlvbicpO1xuXHR9KTtcblxuXHR0ZXN0KCdkZWxldGVTZXNzaW9uIGRpc3Bvc2VzIHBlci1zZXNzaW9uIGNoYW5nZXNldHMgYmVmb3JlIGVtaXR0aW5nIFNlc3Npb25SZW1vdmVkJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0ID0gbWFuYWdlci5yZWdpc3RlckNoYW5nZXNldChidWlsZFNlc3Npb25DaGFuZ2VzZXRVcmkoc2Vzc2lvblVyaSkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy9hLnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8vYS50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRjb25zdCBub3RpZmljYXRpb25zOiBJTm90aWZpY2F0aW9uW10gPSBbXTtcblx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0Tm90aWZpY2F0aW9uKG4gPT4gbm90aWZpY2F0aW9ucy5wdXNoKG4pKSk7XG5cblx0XHRtYW5hZ2VyLmRlbGV0ZVNlc3Npb24oc2Vzc2lvblVyaSk7XG5cblx0XHRjb25zdCBjbGVhcmVkID0gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhbmdlc2V0Q2xlYXJlZCk7XG5cdFx0Y29uc3QgcmVtb3ZlZCA9IG5vdGlmaWNhdGlvbnMuZmlsdGVyKG4gPT4gbi50eXBlID09PSBOb3RpZmljYXRpb25UeXBlLlNlc3Npb25SZW1vdmVkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2xlYXJlZC5sZW5ndGgsIDEsICdkZWxldGVTZXNzaW9uIHNob3VsZCBlbWl0IENoYW5nZXNldENsZWFyZWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVtb3ZlZC5sZW5ndGgsIDEsICdkZWxldGVTZXNzaW9uIHNob3VsZCBlbWl0IFNlc3Npb25SZW1vdmVkJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hbmFnZXIuZ2V0Q2hhbmdlc2V0U3RhdGUoY2hhbmdlc2V0KSwgdW5kZWZpbmVkLCAnY2hhbmdlc2V0IHN0YXRlIHNob3VsZCBiZSBnb25lIGFmdGVyIGRlbGV0ZScpO1xuXHR9KTtcblxuXHR0ZXN0KCd1bmtub3duIGNoYW5nZXNldCBhY3Rpb24gaXMgaWdub3JlZCB3aXRob3V0IGVtaXR0aW5nIGFuIGVudmVsb3BlJywgKCkgPT4ge1xuXHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0Y29uc3QgY2hhbmdlc2V0VXJpID0gYCR7c2Vzc2lvblVyaX0vY2hhbmdlc2V0L21pc3NpbmdgO1xuXG5cdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXHRcdGNvbnN0IHNlcUJlZm9yZSA9IG1hbmFnZXIuc2VydmVyU2VxO1xuXG5cdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihjaGFuZ2VzZXRVcmksIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhbmdlc2V0RmlsZVNldCxcblx0XHRcdGZpbGU6IHtcblx0XHRcdFx0aWQ6ICdmaWxlOi8vL3gudHMnLFxuXHRcdFx0XHRlZGl0OiB7IGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8veC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnZmlsZTovLy94LnRzJyB9IH0sIGRpZmY6IHsgYWRkZWQ6IDEsIHJlbW92ZWQ6IDAgfSB9XG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHtcblx0XHRcdFx0ZW52ZWxvcGVDb3VudDogZW52ZWxvcGVzLmxlbmd0aCxcblx0XHRcdFx0c2VxQWR2YW5jZWQ6IG1hbmFnZXIuc2VydmVyU2VxIC0gc2VxQmVmb3JlLFxuXHRcdFx0XHRjaGFuZ2VzZXRTdGF0ZTogbWFuYWdlci5nZXRDaGFuZ2VzZXRTdGF0ZShjaGFuZ2VzZXRVcmkpLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0ZW52ZWxvcGVDb3VudDogMCxcblx0XHRcdFx0c2VxQWR2YW5jZWQ6IDAsXG5cdFx0XHRcdGNoYW5nZXNldFN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHR9LFxuXHRcdCk7XG5cblx0XHQvLyBTYW5pdHk6IHJlZ2lzdGVyaW5nIHRoZSBzYW1lIFVSSSBhbmQgcmUtZGlzcGF0Y2hpbmcgcHJvZHVjZXMgYW5cblx0XHQvLyBlbnZlbG9wZSBhbmQgYWR2YW5jZXMgdGhlIHNlcSwgcHJvdmluZyB0aGUgZWFybHkgcmV0dXJuIGRvZXNuJ3Rcblx0XHQvLyBicmVhayB2YWxpZCBjaGFuZ2VzZXRzLlxuXHRcdGNvbnN0IHJlZ2lzdGVyZWQgPSBtYW5hZ2VyLnJlZ2lzdGVyQ2hhbmdlc2V0KGJ1aWxkQ2hhbmdlc2V0VXJpKHNlc3Npb25VcmksICdtaXNzaW5nJykpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZWdpc3RlcmVkLCBjaGFuZ2VzZXRVcmkpO1xuXHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oY2hhbmdlc2V0VXJpLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYW5nZXNldEZpbGVTZXQsXG5cdFx0XHRmaWxlOiB7XG5cdFx0XHRcdGlkOiAnZmlsZTovLy94LnRzJyxcblx0XHRcdFx0ZWRpdDogeyBhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3gudHMnLCBjb250ZW50OiB7IHVyaTogJ2ZpbGU6Ly8veC50cycgfSB9LCBkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAwIH0gfVxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZW52ZWxvcGVzLmxlbmd0aCwgMSwgJ3JlZ2lzdGVyZWQgY2hhbmdlc2V0IGFjdGlvbiBzaG91bGQgZW1pdCBhbiBlbnZlbG9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYW5hZ2VyLnNlcnZlclNlcSAtIHNlcUJlZm9yZSwgMSwgJ3NlcnZlclNlcSBzaG91bGQgYWR2YW5jZSBmb3IgcmVnaXN0ZXJlZCBjaGFuZ2VzZXQgYWN0aW9uJyk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtdWx0aS1jaGF0IGNhdGFsb2cnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcGVlckNoYXQgPSBidWlsZENoYXRVcmkoc2Vzc2lvblVyaSwgJ3BlZXItMScpO1xuXG5cdFx0dGVzdCgnYWRkQ2hhdCBncm93cyB0aGUgY2F0YWxvZywgY3JlYXRlcyBjaGF0IHN0YXRlIGFuZCBlbWl0cyBTZXNzaW9uQ2hhdEFkZGVkJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZGRlZFRpdGxlOiBzdW1tYXJ5Py50aXRsZSxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKS5zb3J0KCksXG5cdFx0XHRcdFx0cGVlclR1cm5zOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCk/LnR1cm5zLmxlbmd0aCxcblx0XHRcdFx0XHRjaGF0QWRkZWRFdmVudHM6IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQpLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFkZGVkVGl0bGU6ICdQZWVyJyxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBbYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSwgcGVlckNoYXRdLnNvcnQoKSxcblx0XHRcdFx0XHRwZWVyVHVybnM6IDAsXG5cdFx0XHRcdFx0Y2hhdEFkZGVkRXZlbnRzOiAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NhdGFsb2ctb25seSBTZXNzaW9uQ2hhdEFkZGVkIGRvZXMgbm90IGNyZWF0ZSBjaGF0IHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oc2Vzc2lvblVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQsXG5cdFx0XHRcdHN1bW1hcnk6IHtcblx0XHRcdFx0XHRyZXNvdXJjZTogcGVlckNoYXQsXG5cdFx0XHRcdFx0dGl0bGU6ICdDYXRhbG9nIG9ubHknLFxuXHRcdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRcdG1vZGlmaWVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRjYXRhbG9nVGl0bGU6IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5maW5kKGNoYXQgPT4gY2hhdC5yZXNvdXJjZSA9PT0gcGVlckNoYXQpPy50aXRsZSxcblx0XHRcdFx0Y2hhdFN0YXRlOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNhdGFsb2dUaXRsZTogJ0NhdGFsb2cgb25seScsXG5cdFx0XHRcdGNoYXRTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVDaGF0IHNocmlua3MgdGhlIGNhdGFsb2cgYW5kIHJlZnVzZXMgdGhlIGRlZmF1bHQgY2hhdCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXG5cdFx0XHRtYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvblVyaSwgYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSk7XG5cdFx0XHRjb25zdCBhZnRlckRlZmF1bHRSZW1vdmFsID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmxlbmd0aDtcblxuXHRcdFx0bWFuYWdlci5yZW1vdmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFmdGVyRGVmYXVsdFJlbW92YWwsXG5cdFx0XHRcdFx0YWZ0ZXJQZWVyUmVtb3ZhbDogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLm1hcChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0cGVlclN0YXRlOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRhZnRlckRlZmF1bHRSZW1vdmFsOiAyLFxuXHRcdFx0XHRcdGFmdGVyUGVlclJlbW92YWw6IFtidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXSxcblx0XHRcdFx0XHRwZWVyU3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXNzaW9uIHRpdGxlIGFuZCBkZWZhdWx0IGNoYXQgdGl0bGUgc3RheSBpbmRlcGVuZGVudCBvbmNlIG11bHRpLWNoYXQnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXG5cdFx0XHQvLyBCZWNvbWluZyBtdWx0aS1jaGF0IHNuYXBzaG90cyB0aGUgc2Vzc2lvbiB0aXRsZSBvbnRvIHRoZSBkZWZhdWx0IGNoYXRcblx0XHRcdC8vIHNvIGl0IHN0b3BzIGluaGVyaXRpbmcgdGhlIHNlc3Npb24gdGl0bGUuXG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQpO1xuXHRcdFx0Y29uc3QgYWZ0ZXJBZGQgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IGRlZmF1bHRDaGF0KT8udGl0bGU7XG5cblx0XHRcdC8vIFJlbmFtZSBlYWNoIGluZGVwZW5kZW50bHkuXG5cdFx0XHRtYW5hZ2VyLnVwZGF0ZUNoYXRUaXRsZShzZXNzaW9uVXJpLCBkZWZhdWx0Q2hhdCwgJ0NoYXQgQScpO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uVXJpLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdTZXNzaW9uIEInIH0pO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFmdGVyQWRkLFxuXHRcdFx0XHRcdHNlc3Npb25UaXRsZTogc3RhdGU/LnRpdGxlLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0VGl0bGU6IHN0YXRlPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gZGVmYXVsdENoYXQpPy50aXRsZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGFmdGVyQWRkOiAnVGVzdCcsXG5cdFx0XHRcdFx0c2Vzc2lvblRpdGxlOiAnU2Vzc2lvbiBCJyxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiAnQ2hhdCBBJyxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRDaGF0IGlzIGlkZW1wb3RlbnQgZm9yIGFuIGV4aXN0aW5nIGNoYXQgVVJJJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IGZpcnN0ID0gbWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBzZWNvbmQgPSBtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdJZ25vcmVkJyB9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVTdW1tYXJ5OiBmaXJzdCA9PT0gc2Vjb25kLFxuXHRcdFx0XHRcdHRpdGxlOiBzZWNvbmQ/LnRpdGxlLFxuXHRcdFx0XHRcdGNoYXRDb3VudDogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmxlbmd0aCxcblx0XHRcdFx0XHRjaGF0QWRkZWRFdmVudHM6IGVudmVsb3Blcy5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0QWRkZWQpLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHNhbWVTdW1tYXJ5OiB0cnVlLFxuXHRcdFx0XHRcdHRpdGxlOiAnUGVlcicsXG5cdFx0XHRcdFx0Y2hhdENvdW50OiAyLFxuXHRcdFx0XHRcdGNoYXRBZGRlZEV2ZW50czogMCxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhZGRDaGF0IGZvciBhbiB1bmtub3duIHNlc3Npb24gaXMgYSBuby1vcCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBzdW1tYXJ5ID0gbWFuYWdlci5hZGRDaGF0KCdjb3BpbG90Oi9taXNzaW5nJywgcGVlckNoYXQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0c3VtbWFyeSxcblx0XHRcdFx0XHRldmVudHM6IGVudmVsb3Blcy5sZW5ndGgsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzdW1tYXJ5OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXZlbnRzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FkZENoYXQgc3VwcG9ydHMgbXVsdGlwbGUgcGVlcnMgYW5kIG9ubHkgc25hcHNob3RzIHRoZSBkZWZhdWx0IHRpdGxlIG9uY2UnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0Y29uc3QgcGVlckNoYXQyID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTInKTtcblxuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblx0XHRcdC8vIFJlbmFtZSB0aGUgZGVmYXVsdCBjaGF0IGF3YXkgZnJvbSB0aGUgc25hcHNob3R0ZWQgc2Vzc2lvbiB0aXRsZS5cblx0XHRcdG1hbmFnZXIudXBkYXRlQ2hhdFRpdGxlKHNlc3Npb25VcmksIGRlZmF1bHRDaGF0LCAnUmVuYW1lZCBEZWZhdWx0Jyk7XG5cdFx0XHQvLyBBZGRpbmcgYSBzZWNvbmQgcGVlciBtdXN0IG5vdCByZS1zbmFwc2hvdCAvIGNsb2JiZXIgdGhlIGRlZmF1bHQgdGl0bGUuXG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQyKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBzdGF0ZT8uY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKS5zb3J0KCksXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogc3RhdGU/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBkZWZhdWx0Q2hhdCk/LnRpdGxlLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlczogW2RlZmF1bHRDaGF0LCBwZWVyQ2hhdCwgcGVlckNoYXQyXS5zb3J0KCksXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUaXRsZTogJ1JlbmFtZWQgRGVmYXVsdCcsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlQ2hhdFRpdGxlIG9uIGEgcGVlciBsZWF2ZXMgdGhlIHNlc3Npb24gYW5kIGRlZmF1bHQgdGl0bGVzIHVudG91Y2hlZCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0bWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvblVyaSwgcGVlckNoYXQsICdQZWVyIFJlbmFtZWQnKTtcblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzZXNzaW9uVGl0bGU6IHN0YXRlPy50aXRsZSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiBzdGF0ZT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IGRlZmF1bHRDaGF0KT8udGl0bGUsXG5cdFx0XHRcdFx0cGVlclRpdGxlOiBzdGF0ZT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IHBlZXJDaGF0KT8udGl0bGUsXG5cdFx0XHRcdFx0cGVlclN0YXRlVGl0bGU6IG1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHBlZXJDaGF0KT8udGl0bGUsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRzZXNzaW9uVGl0bGU6ICdUZXN0Jyxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiAnVGVzdCcsXG5cdFx0XHRcdFx0cGVlclRpdGxlOiAnUGVlciBSZW5hbWVkJyxcblx0XHRcdFx0XHRwZWVyU3RhdGVUaXRsZTogJ1BlZXIgUmVuYW1lZCcsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlQ2hhdCBvZiBhbiB1bmtub3duIGNoYXQgaXMgYSBuby1vcCcsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRtYW5hZ2VyLnJlbW92ZUNoYXQoc2Vzc2lvblVyaSwgYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICduZXZlci1hZGRlZCcpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmxlbmd0aCxcblx0XHRcdFx0XHRyZW1vdmVkRXZlbnRzOiBlbnZlbG9wZXMuZmlsdGVyKGUgPT4gZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5TZXNzaW9uQ2hhdFJlbW92ZWQpLmxlbmd0aCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogMSxcblx0XHRcdFx0XHRyZW1vdmVkRXZlbnRzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUNoYXQgZW1pdHMgU2Vzc2lvbkNoYXRSZW1vdmVkIGZvciBhIHBlZXInLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblxuXHRcdFx0Y29uc3QgZW52ZWxvcGVzOiBBY3Rpb25FbnZlbG9wZVtdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXRFbnZlbG9wZShlID0+IGVudmVsb3Blcy5wdXNoKGUpKSk7XG5cblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZW1vdmVkOiBlbnZlbG9wZXNcblx0XHRcdFx0XHRcdC5maWx0ZXIoZSA9PiBlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLlNlc3Npb25DaGF0UmVtb3ZlZClcblx0XHRcdFx0XHRcdC5tYXAoZSA9PiAoZS5hY3Rpb24gYXMgeyBjaGF0OiBzdHJpbmcgfSkuY2hhdCksXG5cdFx0XHRcdFx0Y2hhdFN0YXRlOiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCksXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRyZW1vdmVkOiBbcGVlckNoYXRdLFxuXHRcdFx0XHRcdGNoYXRTdGF0ZTogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hhc0FjdGl2ZVR1cm4gcmVmbGVjdHMgYSBjaGF0IHR1cm4gbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdFx0Y29uc3QgaWRsZSA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWZ0ZXJTdGFydCA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlckNvbXBsZXRlID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7IGlkbGUsIGFmdGVyU3RhcnQsIGFmdGVyQ29tcGxldGUgfSxcblx0XHRcdFx0eyBpZGxlOiBmYWxzZSwgYWZ0ZXJTdGFydDogdHJ1ZSwgYWZ0ZXJDb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhY3RpdmUtdHVybiBldmVudCBvYnNlcnZlcnMgc2VlIHRoZSB1cGRhdGVkIGFjdGl2ZS10dXJuIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Ly8gT3BlcmF0aW9ucyBhcmUgcmVjb21wdXRlZCBzeW5jaHJvbm91c2x5IGZyb20gdGhlIGFjdGl2ZS10dXJuIGV2ZW50LFxuXHRcdFx0Ly8gc28gaGFzQWN0aXZlVHVybiBtdXN0IGFscmVhZHkgcmVmbGVjdCB0aGUgbGlmZWN5Y2xlIGNoYW5nZSB3aGVuIHRoYXRcblx0XHRcdC8vIGV2ZW50IGZpcmVzIFx1MjAxNCBvdGhlcndpc2Ugb3BlcmF0aW9ucyB3b3VsZCBzdGF5IGRpc2FibGVkIGF0IHR1cm4gZW5kLlxuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblxuXHRcdFx0Y29uc3Qgb2JzZXJ2ZWQ6IHsgYWN0aXZlOiBib29sZWFuOyBoYXNBY3RpdmVUdXJuOiBib29sZWFuIH1bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybihlID0+IHtcblx0XHRcdFx0b2JzZXJ2ZWQucHVzaCh7IGFjdGl2ZTogZS5hY3RpdmUsIGhhc0FjdGl2ZVR1cm46IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKSB9KTtcblx0XHRcdH0pKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihzZXNzaW9uQ2hhdFVyaSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob2JzZXJ2ZWQsIFtcblx0XHRcdFx0eyBhY3RpdmU6IHRydWUsIGhhc0FjdGl2ZVR1cm46IHRydWUgfSxcblx0XHRcdFx0eyBhY3RpdmU6IGZhbHNlLCBoYXNBY3RpdmVUdXJuOiBmYWxzZSB9LFxuXHRcdFx0XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYXNBY3RpdmVUdXJuIHN0YXlzIHRydWUgdW50aWwgYWxsIGNvbmN1cnJlbnQgY2hhdCB0dXJucyBmaW5pc2gnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IGlkbGUgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIFN0YXJ0IGEgdHVybiBvbiB0aGUgZGVmYXVsdCBjaGF0LCB0aGVuIGEgY29uY3VycmVudCB0dXJuIG9uIHRoZSBwZWVyLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1kZWZhdWx0Jyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWZ0ZXJEZWZhdWx0U3RhcnQgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFmdGVyQm90aFN0YXJ0ID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHQvLyBDb21wbGV0aW5nIHRoZSBkZWZhdWx0IGNoYXQgbXVzdCBOT1QgY2xlYXIgd2hpbGUgdGhlIHBlZXIgc3RyZWFtcy5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWZ0ZXJEZWZhdWx0Q29tcGxldGUgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIE9ubHkgb25jZSB0aGUgcGVlciBmaW5pc2hlcyB0b28gZG9lcyB0aGUgc2Vzc2lvbiBnbyBpZGxlLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlckJvdGhDb21wbGV0ZSA9IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBpZGxlLCBhZnRlckRlZmF1bHRTdGFydCwgYWZ0ZXJCb3RoU3RhcnQsIGFmdGVyRGVmYXVsdENvbXBsZXRlLCBhZnRlckJvdGhDb21wbGV0ZSB9LFxuXHRcdFx0XHR7IGlkbGU6IGZhbHNlLCBhZnRlckRlZmF1bHRTdGFydDogdHJ1ZSwgYWZ0ZXJCb3RoU3RhcnQ6IHRydWUsIGFmdGVyRGVmYXVsdENvbXBsZXRlOiB0cnVlLCBhZnRlckJvdGhDb21wbGV0ZTogZmFsc2UgfSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhIHJ1bm5pbmcgcGVlciBjaGF0IHByb21vdGVzIHRoZSBzZXNzaW9uIHN1bW1hcnkgdG8gSW5Qcm9ncmVzcyB3aGlsZSB0aGUgZGVmYXVsdCBjaGF0IGlzIGlkbGUnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IGlkbGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uc3RhdHVzO1xuXG5cdFx0XHQvLyBPbmx5IHRoZSBwZWVyIChzdWIpIGNoYXQgc3RhcnRzIHN0cmVhbWluZzsgdGhlIGRlZmF1bHQgY2hhdCBzdGF5cyBpZGxlLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3Qgd2hpbGVQZWVyUnVucyA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5zdGF0dXM7XG5cblx0XHRcdC8vIE9uY2UgdGhlIHBlZXIgZmluaXNoZXMgdGhlIHNlc3Npb24gZmFsbHMgYmFjayB0byBpZGxlLlxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdGR1cmF0aW9uOiAxMDAwLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhZnRlclBlZXJDb21wbGV0ZSA9IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5zdGF0dXM7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZGxlSGFzSW5Qcm9ncmVzczogKChpZGxlID8/IDApICYgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0XHRcdHdoaWxlUGVlclJ1bnNIYXNJblByb2dyZXNzOiAoKHdoaWxlUGVlclJ1bnMgPz8gMCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0YWZ0ZXJQZWVyQ29tcGxldGVIYXNJblByb2dyZXNzOiAoKGFmdGVyUGVlckNvbXBsZXRlID8/IDApICYgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0U3RpbGxJZGxlOiAoKG1hbmFnZXIuZ2V0Q2hhdFN0YXRlKGRlZmF1bHRDaGF0KT8uc3RhdHVzID8/IFNlc3Npb25TdGF0dXMuSWRsZSkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRsZUhhc0luUHJvZ3Jlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHdoaWxlUGVlclJ1bnNIYXNJblByb2dyZXNzOiB0cnVlLFxuXHRcdFx0XHRcdGFmdGVyUGVlckNvbXBsZXRlSGFzSW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRTdGlsbElkbGU6IHRydWUsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnYSBydW5uaW5nIHBlZXIgY2hhdCBmb3J3YXJkcyBpdHMgb3duIHN0YXR1cyB0byB0aGUgc2Vzc2lvbiBjYXRhbG9nIHNvIGl0cyB0YWIgY2FuIHNob3cgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IGVudmVsb3BlczogQWN0aW9uRW52ZWxvcGVbXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRFbWl0RW52ZWxvcGUoZSA9PiBlbnZlbG9wZXMucHVzaChlKSkpO1xuXG5cdFx0XHRjb25zdCBwZWVyQ2F0YWxvZ1N0YXR1cyA9ICgpID0+IG1hbmFnZXIuZ2V0U2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpPy5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gcGVlckNoYXQpPy5zdGF0dXMgPz8gU2Vzc2lvblN0YXR1cy5JZGxlO1xuXHRcdFx0Y29uc3QgY2hhdFVwZGF0ZXNGb3JQZWVyID0gKCkgPT4gZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRVcGRhdGVkICYmIChlLmFjdGlvbiBhcyB7IGNoYXQ6IHN0cmluZyB9KS5jaGF0ID09PSBwZWVyQ2hhdCkubGVuZ3RoO1xuXG5cdFx0XHRjb25zdCBpZGxlQ2F0YWxvZyA9IHBlZXJDYXRhbG9nU3RhdHVzKCk7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJ1bm5pbmdDYXRhbG9nID0gcGVlckNhdGFsb2dTdGF0dXMoKTtcblx0XHRcdGNvbnN0IHVwZGF0ZXNBZnRlclN0YXJ0ID0gY2hhdFVwZGF0ZXNGb3JQZWVyKCk7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRsZUNhdGFsb2dJblByb2dyZXNzOiAoaWRsZUNhdGFsb2cgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0cnVubmluZ0NhdGFsb2dJblByb2dyZXNzOiAocnVubmluZ0NhdGFsb2cgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0ZmluYWxDYXRhbG9nSW5Qcm9ncmVzczogKHBlZXJDYXRhbG9nU3RhdHVzKCkgJiBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MpID09PSBTZXNzaW9uU3RhdHVzLkluUHJvZ3Jlc3MsXG5cdFx0XHRcdFx0ZW1pdHRlZENoYXRVcGRhdGVPblN0YXJ0OiB1cGRhdGVzQWZ0ZXJTdGFydCA+PSAxLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWRsZUNhdGFsb2dJblByb2dyZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRydW5uaW5nQ2F0YWxvZ0luUHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRcdFx0ZmluYWxDYXRhbG9nSW5Qcm9ncmVzczogZmFsc2UsXG5cdFx0XHRcdFx0ZW1pdHRlZENoYXRVcGRhdGVPblN0YXJ0OiB0cnVlLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2FjdGl2ZS10dXJuIGV2ZW50IGFuZCBhY3RpdmUtc2Vzc2lvbiBjb3VudCBmbGlwIG9uY2UgcGVyIHNlc3Npb24gYWNyb3NzIGNvbmN1cnJlbnQgY2hhdHMnLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0Y29uc3QgZGVmYXVsdENoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IHR1cm5FdmVudHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybihlID0+IHR1cm5FdmVudHMucHVzaChlLmFjdGl2ZSkpKTtcblxuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihkZWZhdWx0Q2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1kZWZhdWx0Jyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYScsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0bWFuYWdlci5kaXNwYXRjaFNlcnZlckFjdGlvbihwZWVyQ2hhdCwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnYicsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWN0aXZlV2hpbGVCb3RoUnVuID0gbWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnM7XG5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24oZGVmYXVsdENoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRkdXJhdGlvbjogMTAwMCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgYWN0aXZlQWZ0ZXJGaXJzdENvbXBsZXRlcyA9IG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zO1xuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR1cm5FdmVudHMsXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVCb3RoUnVuLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyRmlyc3RDb21wbGV0ZXMsXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJCb3RoQ29tcGxldGU6IG1hbmFnZXIucm9vdFN0YXRlLmFjdGl2ZVNlc3Npb25zLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Ly8gRXhhY3RseSBvbmUgdHJ1ZSAoZmlyc3QgY2hhdCBzdGFydHMpIGFuZCBvbmUgZmFsc2UgKGxhc3QgY2hhdCBlbmRzKS5cblx0XHRcdFx0XHR0dXJuRXZlbnRzOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGFjdGl2ZVdoaWxlQm90aFJ1bjogMSxcblx0XHRcdFx0XHRhY3RpdmVBZnRlckZpcnN0Q29tcGxldGVzOiAxLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyQm90aENvbXBsZXRlOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbW92ZUNoYXQgY2xlYXJzIGEgcGVlciBjaGF0IHRoYXQgaXMgcmVtb3ZlZCBtaWQtdHVybicsICgpID0+IHtcblx0XHRcdG1hbmFnZXIuY3JlYXRlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSk7XG5cdFx0XHRjb25zdCBkZWZhdWx0Q2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSk7XG5cdFx0XHRtYW5hZ2VyLmFkZENoYXQoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHsgdGl0bGU6ICdQZWVyJyB9KTtcblxuXHRcdFx0Y29uc3QgdHVybkV2ZW50czogYm9vbGVhbltdID0gW107XG5cdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZENoYW5nZVNlc3Npb25BY3RpdmVUdXJuKGUgPT4gdHVybkV2ZW50cy5wdXNoKGUuYWN0aXZlKSkpO1xuXG5cdFx0XHQvLyBCb3RoIHRoZSBkZWZhdWx0IGNoYXQgYW5kIHRoZSBwZWVyIGNoYXQgc3RhcnQgYSBjb25jdXJyZW50IHR1cm4uXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLWRlZmF1bHQnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdhJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLXBlZXInLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdiJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBhY3RpdmVXaGlsZUJvdGhSdW4gPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIFJlbW92aW5nIHRoZSBwZWVyIG1pZC10dXJuIG11c3Qgbm90IHN0cmFuZCBpdCBpbiB0aGUgYWN0aXZlIHNldDpcblx0XHRcdC8vIHRoZSBzZXNzaW9uIHN0YXlzIGFjdGl2ZSBiZWNhdXNlIHRoZSBkZWZhdWx0IGNoYXQgc3RpbGwgc3RyZWFtcy5cblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cdFx0XHRjb25zdCBhY3RpdmVBZnRlclBlZXJSZW1vdmVkID0gbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpO1xuXG5cdFx0XHQvLyBDb21wbGV0aW5nIHRoZSBkZWZhdWx0IGNoYXQgaXMgbm93IGVub3VnaCB0byBmbGlwIHRoZSBzZXNzaW9uIGlkbGUuXG5cdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKGRlZmF1bHRDaGF0LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybi1kZWZhdWx0Jyxcblx0XHRcdFx0ZHVyYXRpb246IDEwMDAsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR1cm5FdmVudHMsXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVCb3RoUnVuLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyUGVlclJlbW92ZWQsXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJEZWZhdWx0Q29tcGxldGU6IG1hbmFnZXIuaGFzQWN0aXZlVHVybihzZXNzaW9uVXJpKSxcblx0XHRcdFx0XHRhY3RpdmVTZXNzaW9uczogbWFuYWdlci5yb290U3RhdGUuYWN0aXZlU2Vzc2lvbnMsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0dXJuRXZlbnRzOiBbdHJ1ZSwgZmFsc2VdLFxuXHRcdFx0XHRcdGFjdGl2ZVdoaWxlQm90aFJ1bjogdHJ1ZSxcblx0XHRcdFx0XHRhY3RpdmVBZnRlclBlZXJSZW1vdmVkOiB0cnVlLFxuXHRcdFx0XHRcdGFjdGl2ZUFmdGVyRGVmYXVsdENvbXBsZXRlOiBmYWxzZSxcblx0XHRcdFx0XHRhY3RpdmVTZXNzaW9uczogMCxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVDaGF0IGZsaXBzIHRoZSBzZXNzaW9uIGlkbGUgd2hlbiB0aGUgcmVtb3ZlZCBwZWVyIGhlbGQgdGhlIGxhc3QgYWN0aXZlIHR1cm4nLCAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0bWFuYWdlci5hZGRDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7IHRpdGxlOiAnUGVlcicgfSk7XG5cblx0XHRcdGNvbnN0IHR1cm5FdmVudHM6IGJvb2xlYW5bXSA9IFtdO1xuXHRcdFx0ZGlzcG9zYWJsZXMuYWRkKG1hbmFnZXIub25EaWRDaGFuZ2VTZXNzaW9uQWN0aXZlVHVybihlID0+IHR1cm5FdmVudHMucHVzaChlLmFjdGl2ZSkpKTtcblxuXHRcdFx0Ly8gT25seSB0aGUgcGVlciBjaGF0IGhhcyBhbiBhY3RpdmUgdHVybi5cblx0XHRcdG1hbmFnZXIuZGlzcGF0Y2hTZXJ2ZXJBY3Rpb24ocGVlckNoYXQsIHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tcGVlcicsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDEtMDFUMDA6MDA6MDAuMDAwWicsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGFjdGl2ZVdoaWxlUGVlclJ1bnMgPSBtYW5hZ2VyLmhhc0FjdGl2ZVR1cm4oc2Vzc2lvblVyaSk7XG5cblx0XHRcdC8vIFJlbW92aW5nIHRoYXQgcGVlciBpcyB0aGUgbGFzdCBhY3RpdmUgY2hhdCwgc28gdGhlIHNlc3Npb24gbXVzdFxuXHRcdFx0Ly8gZmxpcCBiYWNrIHRvIGlkbGUgaW5zdGVhZCBvZiBzdGF5aW5nIHBlcm1hbmVudGx5IGFjdGl2ZS5cblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0dXJuRXZlbnRzLFxuXHRcdFx0XHRcdGFjdGl2ZVdoaWxlUGVlclJ1bnMsXG5cdFx0XHRcdFx0YWN0aXZlQWZ0ZXJQZWVyUmVtb3ZlZDogbWFuYWdlci5oYXNBY3RpdmVUdXJuKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdGFjdGl2ZVNlc3Npb25zOiBtYW5hZ2VyLnJvb3RTdGF0ZS5hY3RpdmVTZXNzaW9ucyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR1cm5FdmVudHM6IFt0cnVlLCBmYWxzZV0sXG5cdFx0XHRcdFx0YWN0aXZlV2hpbGVQZWVyUnVuczogdHJ1ZSxcblx0XHRcdFx0XHRhY3RpdmVBZnRlclBlZXJSZW1vdmVkOiBmYWxzZSxcblx0XHRcdFx0XHRhY3RpdmVTZXNzaW9uczogMCxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIENoYXJhY3Rlcml6YXRpb24gdGVzdHMgKHRhc2sgQTMpOiBwaW4gZG93biB0aGUgKmN1cnJlbnQqIGNhdGFsb2cgYmVoYXZpb3Jcblx0Ly8gXHUyMDE0IHRoZSBkZWZhdWx0LWNoYXQgcG9pbnRlciBzZXQgdXAgYnkgYF9lbnN1cmVEZWZhdWx0Q2hhdGAsIHJlc3RvcmVkIHBlZXJcblx0Ly8gcmVzb2x1dGlvbiwgYW5kIHRoZSByb2xsZWQtdXAgc2Vzc2lvbiBzdW1tYXJ5IHByb2R1Y2VkIGJ5IHRoZVxuXHQvLyBTZXNzaW9uU3VtbWFyeU5vdGlmaWVyIFx1MjAxNCBzbyB0aGUgdXBjb21pbmcgYHByb3ZpZGVyRGF0YWAgY2hhbmdlIGNhbm5vdFxuXHQvLyBzaWxlbnRseSByZWdyZXNzIHRoZW0uXG5cdHN1aXRlKCdjYXRhbG9nIGNoYXJhY3Rlcml6YXRpb24gKEEzKScsICgpID0+IHtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cblx0XHR0ZXN0KCdfZW5zdXJlRGVmYXVsdENoYXQgc2VlZHMgYSBzaW5nbGUgaW5oZXJpdGluZyBkZWZhdWx0IGNoYXQgYW5kIHBvaW50cyBkZWZhdWx0Q2hhdCBhdCBpdCBvbiBjcmVhdGVTZXNzaW9uJywgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdDogc3RhdGU/LmRlZmF1bHRDaGF0LFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0SXNEZXRlcm1pbmlzdGljOiBzdGF0ZT8uZGVmYXVsdENoYXQgPT09IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlczogc3RhdGU/LmNoYXRzLm1hcChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0Ly8gRW1wdHkgdGl0bGUgPT4gdGhlIGRlZmF1bHQgY2hhdCBpbmhlcml0cyB0aGUgc2Vzc2lvbiB0aXRsZSBmb3IgZGlzcGxheS5cblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiBzdGF0ZT8uY2hhdHNbMF0/LnRpdGxlLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0U3RhdGVQcmVzZW50OiBtYW5hZ2VyLmdldERlZmF1bHRDaGF0U3RhdGUoc2Vzc2lvblVyaSkgIT09IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRlZmF1bHRDaGF0OiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLFxuXHRcdFx0XHRcdGRlZmF1bHRDaGF0SXNEZXRlcm1pbmlzdGljOiB0cnVlLFxuXHRcdFx0XHRcdGNoYXRSZXNvdXJjZXM6IFtidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpXSxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFRpdGxlOiAnJyxcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdFN0YXRlUHJlc2VudDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdfZW5zdXJlRGVmYXVsdENoYXQgc2VlZHMgdGhlIGRlZmF1bHQtY2hhdCBwb2ludGVyIG9uIHJlc3RvcmVTZXNzaW9uIHRvbycsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm5zID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAncDEnLCBjb250ZW50OiAnd29ybGQnIH0gc2F0aXNmaWVzIE1hcmtkb3duUmVzcG9uc2VQYXJ0XSxcblx0XHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgdHVybnMpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGRlZmF1bHRDaGF0OiBzdGF0ZT8uZGVmYXVsdENoYXQsXG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlczogc3RhdGU/LmNoYXRzLm1hcChjID0+IGMucmVzb3VyY2UudG9TdHJpbmcoKSksXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUdXJuczogbWFuYWdlci5nZXREZWZhdWx0Q2hhdFN0YXRlKHNlc3Npb25VcmkpPy50dXJucy5sZW5ndGgsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRkZWZhdWx0Q2hhdDogYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKSxcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBbYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpKV0sXG5cdFx0XHRcdFx0ZGVmYXVsdENoYXRUdXJuczogMSxcblx0XHRcdFx0fSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkgYW5kIHJlc29sdmVDaGF0U3RhdGUgaHlkcmF0ZSBhIHBlZXIgd2l0aG91dCBkaXNwYXRjaGluZyBTZXNzaW9uQ2hhdEFkZGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXG5cdFx0XHRjb25zdCBlbnZlbG9wZXM6IEFjdGlvbkVudmVsb3BlW10gPSBbXTtcblx0XHRcdGRpc3Bvc2FibGVzLmFkZChtYW5hZ2VyLm9uRGlkRW1pdEVudmVsb3BlKGUgPT4gZW52ZWxvcGVzLnB1c2goZSkpKTtcblxuXHRcdFx0Y29uc3QgdHVybnMgPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRpZDogJ3BlZXItdHVybi0xJyxcblx0XHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdyZXN0b3JlZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ3AxJywgY29udGVudDogJ2hpc3RvcnknIH0gc2F0aXNmaWVzIE1hcmtkb3duUmVzcG9uc2VQYXJ0XSxcblx0XHRcdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdFx0Y29uc3QgZHJhZnQgPSB7IHRleHQ6ICd3b3JrIGluIHByb2dyZXNzJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9O1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHtcblx0XHRcdFx0dGl0bGU6ICdSZXN0b3JlZCBQZWVyJyxcblx0XHRcdFx0ZHJhZnQsXG5cdFx0XHRcdHJlc29sdmVyOiBhc3luYyAoKSA9PiAoeyB0dXJucyB9KSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcGVlclN0YXRlID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHRjaGF0UmVzb3VyY2VzOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMubWFwKGMgPT4gYy5yZXNvdXJjZS50b1N0cmluZygpKS5zb3J0KCksXG5cdFx0XHRcdFx0cmVzdG9yZWRUaXRsZTogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCk/LnRpdGxlLFxuXHRcdFx0XHRcdHBlZXJUdXJuczogcGVlclN0YXRlPy50dXJucy5sZW5ndGgsXG5cdFx0XHRcdFx0cGVlckRyYWZ0OiBwZWVyU3RhdGU/LmRyYWZ0Py50ZXh0LFxuXHRcdFx0XHRcdGNoYXRBZGRlZEV2ZW50czogZW52ZWxvcGVzLmZpbHRlcihlID0+IGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuU2Vzc2lvbkNoYXRBZGRlZCkubGVuZ3RoLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0Y2hhdFJlc291cmNlczogW2J1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvblVyaSksIHBlZXJDaGF0XS5zb3J0KCksXG5cdFx0XHRcdFx0cmVzdG9yZWRUaXRsZTogJ1Jlc3RvcmVkIFBlZXInLFxuXHRcdFx0XHRcdHBlZXJUdXJuczogMSxcblx0XHRcdFx0XHRwZWVyRHJhZnQ6ICd3b3JrIGluIHByb2dyZXNzJyxcblx0XHRcdFx0XHRjaGF0QWRkZWRFdmVudHM6IDAsXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVzb2x2ZUNoYXRTdGF0ZSBjb2FsZXNjZXMgcmVzdG9yZWQgcGVlciByZXNvbHV0aW9uIGFuZCBhdG9taWNhbGx5IGluc3RhbGxzIGl0cyBzdGF0ZScsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblxuXHRcdFx0bGV0IHJlc29sdmVyQ2FsbHMgPSAwO1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHtcblx0XHRcdFx0dGl0bGU6ICdSZXN0b3JlZCBQZWVyJyxcblx0XHRcdFx0ZHJhZnQ6IHsgdGV4dDogJ3dvcmsgaW4gcHJvZ3Jlc3MnLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdHJlc29sdmVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZXJDYWxscysrO1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0dXJuczogW3tcblx0XHRcdFx0XHRcdFx0aWQ6ICdwZWVyLXR1cm4tMScsXG5cdFx0XHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3Jlc3RvcmVkJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0XHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHRcdFx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdFx0XHRcdH1dLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGJlZm9yZUh5ZHJhdGlvbiA9IHtcblx0XHRcdFx0c3VtbWFyeTogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCk/LnRpdGxlLFxuXHRcdFx0XHRzdGF0ZTogbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IFtmaXJzdCwgc2Vjb25kXSA9IGF3YWl0IFByb21pc2UuYWxsKFtcblx0XHRcdFx0bWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KSxcblx0XHRcdFx0bWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KSxcblx0XHRcdF0pO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRiZWZvcmVIeWRyYXRpb24sXG5cdFx0XHRcdHNhbWVTdGF0ZTogZmlyc3QgPT09IHNlY29uZCxcblx0XHRcdFx0cmVzb2x2ZXJDYWxscyxcblx0XHRcdFx0YWZ0ZXJIeWRyYXRpb246IHN0YXRlICYmIHsgdGl0bGU6IHN0YXRlLnRpdGxlLCB0dXJuczogc3RhdGUudHVybnMubWFwKHR1cm4gPT4gdHVybi5pZCksIGRyYWZ0OiBzdGF0ZS5kcmFmdD8udGV4dCB9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRiZWZvcmVIeWRyYXRpb246IHsgc3VtbWFyeTogJ1Jlc3RvcmVkIFBlZXInLCBzdGF0ZTogdW5kZWZpbmVkIH0sXG5cdFx0XHRcdHNhbWVTdGF0ZTogdHJ1ZSxcblx0XHRcdFx0cmVzb2x2ZXJDYWxsczogMSxcblx0XHRcdFx0YWZ0ZXJIeWRyYXRpb246IHsgdGl0bGU6ICdSZXN0b3JlZCBQZWVyJywgdHVybnM6IFsncGVlci10dXJuLTEnXSwgZHJhZnQ6ICd3b3JrIGluIHByb2dyZXNzJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXNvbHZlQ2hhdFN0YXRlIHJldHJpZXMgZmFpbGVkIHJlc3RvcmVkIHBlZXIgcmVzb2x1dGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRcdGxldCByZXNvbHZlckNhbGxzID0gMDtcblx0XHRcdG1hbmFnZXIucmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7XG5cdFx0XHRcdHJlc29sdmVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0cmVzb2x2ZXJDYWxscysrO1xuXHRcdFx0XHRcdGlmIChyZXNvbHZlckNhbGxzID09PSAxKSB7XG5cdFx0XHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2hpc3RvcnkgdW5hdmFpbGFibGUnKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHVybnM6IFtdIH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KSwgL2hpc3RvcnkgdW5hdmFpbGFibGUvKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlc29sdmVyQ2FsbHMsXG5cdFx0XHRcdHN0YXRlOiBzdGF0ZSAmJiB7IHRpdGxlOiBzdGF0ZS50aXRsZSwgdHVybnM6IHN0YXRlLnR1cm5zLmxlbmd0aCB9LFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXNvbHZlckNhbGxzOiAyLFxuXHRcdFx0XHRzdGF0ZTogeyB0aXRsZTogJycsIHR1cm5zOiAwIH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdGhlIGxhdGVzdCB1bnJlc29sdmVkIHN1bW1hcnkgd2hlbiByZXNvbHZpbmcgYSByZXN0b3JlZCBwZWVyIGNoYXQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRsZXQgcmVzb2x2ZUhpc3RvcnkhOiAoc3RhdGU6IHsgdHVybnM6IFR1cm5bXSB9KSA9PiB2b2lkO1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHtcblx0XHRcdFx0dGl0bGU6ICdPcmlnaW5hbCB0aXRsZScsXG5cdFx0XHRcdHJlc29sdmVyOiAoKSA9PiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZUhpc3RvcnkgPSByZXNvbHZlOyB9KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXNvbHZpbmcgPSBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpO1xuXHRcdFx0bWFuYWdlci51cGRhdGVDaGF0VGl0bGUoc2Vzc2lvblVyaSwgcGVlckNoYXQsICdVcGRhdGVkIHRpdGxlJyk7XG5cdFx0XHRyZXNvbHZlSGlzdG9yeSh7IHR1cm5zOiBbXSB9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgcmVzb2x2aW5nO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0Y2F0YWxvZ1RpdGxlOiBtYW5hZ2VyLmdldFNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKT8uY2hhdHMuZmluZChjID0+IGMucmVzb3VyY2UgPT09IHBlZXJDaGF0KT8udGl0bGUsXG5cdFx0XHRcdHN0YXRlVGl0bGU6IHN0YXRlPy50aXRsZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y2F0YWxvZ1RpdGxlOiAnVXBkYXRlZCB0aXRsZScsXG5cdFx0XHRcdHN0YXRlVGl0bGU6ICdVcGRhdGVkIHRpdGxlJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW52YWxpZGF0ZXMgYSBwZW5kaW5nIHJlc3RvcmVkIHBlZXIgcmVzb2x2ZXIgYmVmb3JlIHNhbWUtVVJJIHJldXNlJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXHRcdFx0bGV0IHJlc29sdmVIaXN0b3J5ITogKHN0YXRlOiB7IHR1cm5zOiBUdXJuW10gfSkgPT4gdm9pZDtcblx0XHRcdG1hbmFnZXIucmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7XG5cdFx0XHRcdHJlc29sdmVyOiAoKSA9PiBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHsgcmVzb2x2ZUhpc3RvcnkgPSByZXNvbHZlOyB9KSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCByZXNvbHZpbmcgPSBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpO1xuXHRcdFx0bWFuYWdlci5yZW1vdmVDaGF0KHNlc3Npb25VcmksIHBlZXJDaGF0KTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1JlcGxhY2VtZW50JyB9KTtcblx0XHRcdHJlc29sdmVIaXN0b3J5KHsgdHVybnM6IFtdIH0pO1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoKCkgPT4gcmVzb2x2aW5nLCAvaW52YWxpZGF0ZWQvKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHJlcGxhY2VtZW50OiBtYW5hZ2VyLmdldENoYXRTdGF0ZShwZWVyQ2hhdCkgJiYgeyB0aXRsZTogbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpPy50aXRsZSwgdHVybnM6IG1hbmFnZXIuZ2V0Q2hhdFN0YXRlKHBlZXJDaGF0KT8udHVybnMubGVuZ3RoIH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlcGxhY2VtZW50OiB7IHRpdGxlOiAnUmVwbGFjZW1lbnQnLCB0dXJuczogMCB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkgZG9lcyBub3QgcmVwbGFjZSBhbiBhbHJlYWR5LWh5ZHJhdGVkIGNoYXQgVVJJJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5jcmVhdGVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpKTtcblx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1BlZXInIH0pO1xuXG5cdFx0XHRsZXQgcmVzb2x2ZXJDYWxscyA9IDA7XG5cdFx0XHRtYW5hZ2VyLnJlZ2lzdGVyUmVzdG9yZWRDaGF0U3VtbWFyeShzZXNzaW9uVXJpLCBwZWVyQ2hhdCwge1xuXHRcdFx0XHR0aXRsZTogJ0lnbm9yZWQnLFxuXHRcdFx0XHRyZXNvbHZlcjogYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRcdHJlc29sdmVyQ2FsbHMrKztcblx0XHRcdFx0XHRyZXR1cm4geyB0dXJuczogW10gfTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0YXdhaXQgbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmxlbmd0aCxcblx0XHRcdFx0XHR0aXRsZTogbWFuYWdlci5nZXRTZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk/LmNoYXRzLmZpbmQoYyA9PiBjLnJlc291cmNlID09PSBwZWVyQ2hhdCk/LnRpdGxlLFxuXHRcdFx0XHRcdHBlZXJUdXJuczogbWFuYWdlci5nZXRDaGF0U3RhdGUocGVlckNoYXQpPy50dXJucy5sZW5ndGgsXG5cdFx0XHRcdFx0cmVzb2x2ZXJDYWxscyxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNoYXRDb3VudDogMixcblx0XHRcdFx0XHR0aXRsZTogJ1BlZXInLFxuXHRcdFx0XHRcdHBlZXJUdXJuczogMCxcblx0XHRcdFx0XHRyZXNvbHZlckNhbGxzOiAwLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlZ2lzdGVyUmVzdG9yZWRDaGF0U3VtbWFyeSBkb2VzIG5vdCByZWdpc3RlciBhIHBlZXIgZm9yIGFuIHVua25vd24gc2Vzc2lvbicsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHN1bW1hcnkgPSBtYW5hZ2VyLnJlZ2lzdGVyUmVzdG9yZWRDaGF0U3VtbWFyeSgnY29waWxvdDovbWlzc2luZycsIHBlZXJDaGF0LCB7XG5cdFx0XHRcdHJlc29sdmVyOiBhc3luYyAoKSA9PiAoeyB0dXJuczogW10gfSksXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN1bW1hcnksXG5cdFx0XHRcdHN0YXRlOiBhd2FpdCBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRzdW1tYXJ5OiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0YXRlOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ1Nlc3Npb25TdW1tYXJ5Tm90aWZpZXIgcm9sbHMgYSBydW5uaW5nIHBlZXIgY2hhdCB1cCBvbnRvIHRoZSBzZXNzaW9uIHN1bW1hcnkgYW5kIGVtaXRzIG9uZSBjb2FsZXNjZWQgU2Vzc2lvblN1bW1hcnlDaGFuZ2VkJywgKCkgPT4ge1xuXHRcdFx0cmV0dXJuIHJ1bldpdGhGYWtlZFRpbWVycyh7IHVzZUZha2VUaW1lcnM6IHRydWUgfSwgYXN5bmMgKCkgPT4ge1xuXHRcdFx0XHRtYW5hZ2VyLmNyZWF0ZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCkpO1xuXHRcdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHNlc3Npb25VcmksIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uUmVhZHkgfSk7XG5cdFx0XHRcdG1hbmFnZXIuYWRkQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCwgeyB0aXRsZTogJ1BlZXInIH0pO1xuXG5cdFx0XHRcdGNvbnN0IG5vdGlmaWNhdGlvbnM6IElOb3RpZmljYXRpb25bXSA9IFtdO1xuXHRcdFx0XHRkaXNwb3NhYmxlcy5hZGQobWFuYWdlci5vbkRpZEVtaXROb3RpZmljYXRpb24obiA9PiBub3RpZmljYXRpb25zLnB1c2gobikpKTtcblxuXHRcdFx0XHRjb25zdCBzdW1tYXJ5SGFzSW5Qcm9ncmVzcyA9ICgpID0+ICgobWFuYWdlci5nZXRTZXNzaW9uU3VtbWFyeShzZXNzaW9uVXJpKT8uc3RhdHVzID8/IDApICYgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzO1xuXHRcdFx0XHRjb25zdCBpZGxlUm9sbHVwID0gc3VtbWFyeUhhc0luUHJvZ3Jlc3MoKTtcblxuXHRcdFx0XHQvLyBPbmx5IHRoZSBwZWVyIGNoYXQgc3RyZWFtczsgdGhlIGRlZmF1bHQgY2hhdCBzdGF5cyBpZGxlLlxuXHRcdFx0XHRtYW5hZ2VyLmRpc3BhdGNoU2VydmVyQWN0aW9uKHBlZXJDaGF0LCB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQsXG5cdFx0XHRcdFx0dHVybklkOiAndHVybi1wZWVyJyxcblx0XHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2InLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb25zdCBydW5uaW5nUm9sbHVwID0gc3VtbWFyeUhhc0luUHJvZ3Jlc3MoKTtcblxuXHRcdFx0XHRhd2FpdCBuZXcgUHJvbWlzZShyID0+IHNldFRpbWVvdXQociwgMTUwKSk7XG5cblx0XHRcdFx0Y29uc3Qgc3VtbWFyeUNoYW5nZXMgPSBub3RpZmljYXRpb25zLmZpbHRlcihuID0+IG4udHlwZSA9PT0gTm90aWZpY2F0aW9uVHlwZS5TZXNzaW9uU3VtbWFyeUNoYW5nZWQpIGFzIFNlc3Npb25TdW1tYXJ5Q2hhbmdlZFBhcmFtc1tdO1xuXG5cdFx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0aWRsZVJvbGx1cCxcblx0XHRcdFx0XHRcdHJ1bm5pbmdSb2xsdXAsXG5cdFx0XHRcdFx0XHRzdW1tYXJ5Q2hhbmdlZENvdW50OiBzdW1tYXJ5Q2hhbmdlcy5sZW5ndGgsXG5cdFx0XHRcdFx0XHRub3RpZmllZFN0YXR1c0hhc0luUHJvZ3Jlc3M6ICgoc3VtbWFyeUNoYW5nZXNbMF0/LmNoYW5nZXMuc3RhdHVzID8/IDApICYgU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzKSA9PT0gU2Vzc2lvblN0YXR1cy5JblByb2dyZXNzLFxuXHRcdFx0XHRcdFx0bm90aWZpZWRTZXNzaW9uOiBzdW1tYXJ5Q2hhbmdlc1swXT8uc2Vzc2lvbixcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGlkbGVSb2xsdXA6IGZhbHNlLFxuXHRcdFx0XHRcdFx0cnVubmluZ1JvbGx1cDogdHJ1ZSxcblx0XHRcdFx0XHRcdHN1bW1hcnlDaGFuZ2VkQ291bnQ6IDEsXG5cdFx0XHRcdFx0XHRub3RpZmllZFN0YXR1c0hhc0luUHJvZ3Jlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRub3RpZmllZFNlc3Npb246IHNlc3Npb25VcmksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0KTtcblx0XHRcdH0pO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyBFeGVyY2lzZXMgdGhlIG9wYXF1ZSwgYWdlbnQtb3duZWQgYHByb3ZpZGVyRGF0YWAgYmxvYiBzdXBwbGllZCB0byByZXN0b3JlZFxuXHQvLyBwZWVyIHJlc29sdmVycy4gVGhlIFN0YXRlTWFuYWdlciBtdXN0IHBhc3MgdGhyb3VnaCB0aGUgYXV0aG9yaXRhdGl2ZSB2YWx1ZVxuXHQvLyB3aXRob3V0IHBhcnNpbmcgaXQsIGluY2x1ZGluZyBhZnRlciB1cGRhdGVzIGFuZCByZXRyaWVzLlxuXHRzdWl0ZSgncHJvdmlkZXJEYXRhIChHLUIxKScsICgpID0+IHtcblx0XHRjb25zdCBwZWVyQ2hhdCA9IGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCAncGVlci0xJyk7XG5cdFx0Y29uc3QgcGVlckNoYXQyID0gYnVpbGRDaGF0VXJpKHNlc3Npb25VcmksICdwZWVyLTInKTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyBpbml0aWFsIHByb3ZpZGVyRGF0YSB2ZXJiYXRpbSB0byBhIHJlc3RvcmVkIHBlZXIgcmVzb2x2ZXInLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRjb25zdCBibG9iID0gJ3tcInNka1Nlc3Npb25JZFwiOlwiYWJjLTEyM1wiLFwibW9kZWxcIjp7XCJpZFwiOlwieFxcXFxcInlcIn19Jztcblx0XHRcdGxldCByZWNlaXZlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHtcblx0XHRcdFx0cHJvdmlkZXJEYXRhOiBibG9iLFxuXHRcdFx0XHRyZXNvbHZlcjogYXN5bmMgcHJvdmlkZXJEYXRhID0+IHtcblx0XHRcdFx0XHRyZWNlaXZlZCA9IHByb3ZpZGVyRGF0YTtcblx0XHRcdFx0XHRyZXR1cm4geyB0dXJuczogW10gfTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVjZWl2ZWQsIGJsb2IpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncGFzc2VzIHByb3ZpZGVyRGF0YSB1cGRhdGVkIGJlZm9yZSByZXNvbHV0aW9uIHRvIHRoZSByZXNvbHZlcicsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRcdGxldCByZWNlaXZlZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdFx0bWFuYWdlci5yZWdpc3RlclJlc3RvcmVkQ2hhdFN1bW1hcnkoc2Vzc2lvblVyaSwgcGVlckNoYXQsIHtcblx0XHRcdFx0cHJvdmlkZXJEYXRhOiAndjEnLFxuXHRcdFx0XHRyZXNvbHZlcjogYXN5bmMgcHJvdmlkZXJEYXRhID0+IHtcblx0XHRcdFx0XHRyZWNlaXZlZCA9IHByb3ZpZGVyRGF0YTtcblx0XHRcdFx0XHRyZXR1cm4geyB0dXJuczogW10gfTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0bWFuYWdlci51cGRhdGVDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0LCAndjInKTtcblxuXHRcdFx0YXdhaXQgbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlY2VpdmVkLCAndjInKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHJpZXMgcmVzb2x1dGlvbiB3aXRoIGN1cnJlbnQgcHJvdmlkZXJEYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0bWFuYWdlci5yZXN0b3JlU2Vzc2lvbihtYWtlU2Vzc2lvblN1bW1hcnkoKSwgW10pO1xuXHRcdFx0Y29uc3QgcmVjZWl2ZWQ6IEFycmF5PHN0cmluZyB8IHVuZGVmaW5lZD4gPSBbXTtcblx0XHRcdG1hbmFnZXIucmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5KHNlc3Npb25VcmksIHBlZXJDaGF0LCB7XG5cdFx0XHRcdHByb3ZpZGVyRGF0YTogJ3YxJyxcblx0XHRcdFx0cmVzb2x2ZXI6IGFzeW5jIHByb3ZpZGVyRGF0YSA9PiB7XG5cdFx0XHRcdFx0cmVjZWl2ZWQucHVzaChwcm92aWRlckRhdGEpO1xuXHRcdFx0XHRcdGlmIChyZWNlaXZlZC5sZW5ndGggPT09IDEpIHtcblx0XHRcdFx0XHRcdHRocm93IG5ldyBFcnJvcignbWF0ZXJpYWxpemF0aW9uIGZhaWxlZCcpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4geyB0dXJuczogW10gfTtcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cygoKSA9PiBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpLCAvbWF0ZXJpYWxpemF0aW9uIGZhaWxlZC8pO1xuXHRcdFx0bWFuYWdlci51cGRhdGVDaGF0UHJvdmlkZXJEYXRhKHBlZXJDaGF0LCAndjInKTtcblx0XHRcdGF3YWl0IG1hbmFnZXIucmVzb2x2ZUNoYXRTdGF0ZShwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVjZWl2ZWQsIFsndjEnLCAndjInXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZW1vdmVDaGF0IHByZXZlbnRzIGFuIHVucmVzb2x2ZWQgcGVlciByZXNvbHZlciBmcm9tIG9ic2VydmluZyBzdGFsZSBwcm92aWRlckRhdGEnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRtYW5hZ2VyLnJlc3RvcmVTZXNzaW9uKG1ha2VTZXNzaW9uU3VtbWFyeSgpLCBbXSk7XG5cdFx0XHRsZXQgcmVzb2x2ZXJDYWxscyA9IDA7XG5cdFx0XHRtYW5hZ2VyLnJlZ2lzdGVyUmVzdG9yZWRDaGF0U3VtbWFyeShzZXNzaW9uVXJpLCBwZWVyQ2hhdCwge1xuXHRcdFx0XHRwcm92aWRlckRhdGE6ICdibG9iJyxcblx0XHRcdFx0cmVzb2x2ZXI6IGFzeW5jICgpID0+IHtcblx0XHRcdFx0XHRyZXNvbHZlckNhbGxzKys7XG5cdFx0XHRcdFx0cmV0dXJuIHsgdHVybnM6IFtdIH07XG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdG1hbmFnZXIucmVtb3ZlQ2hhdChzZXNzaW9uVXJpLCBwZWVyQ2hhdCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRzdGF0ZTogYXdhaXQgbWFuYWdlci5yZXNvbHZlQ2hhdFN0YXRlKHBlZXJDaGF0KSxcblx0XHRcdFx0cmVzb2x2ZXJDYWxscyxcblx0XHRcdH0sIHtcblx0XHRcdFx0c3RhdGU6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVzb2x2ZXJDYWxsczogMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVtb3ZlU2Vzc2lvbiBwcmV2ZW50cyB1bnJlc29sdmVkIHBlZXIgcmVzb2x2ZXJzIGZyb20gb2JzZXJ2aW5nIHN0YWxlIHByb3ZpZGVyRGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRcdG1hbmFnZXIucmVzdG9yZVNlc3Npb24obWFrZVNlc3Npb25TdW1tYXJ5KCksIFtdKTtcblx0XHRcdGNvbnN0IHJlc29sdmVyQ2FsbHM6IHN0cmluZ1tdID0gW107XG5cdFx0XHRmb3IgKGNvbnN0IGNoYXQgb2YgW3BlZXJDaGF0LCBwZWVyQ2hhdDJdKSB7XG5cdFx0XHRcdG1hbmFnZXIucmVnaXN0ZXJSZXN0b3JlZENoYXRTdW1tYXJ5KHNlc3Npb25VcmksIGNoYXQsIHtcblx0XHRcdFx0XHRwcm92aWRlckRhdGE6IGBibG9iLSR7Y2hhdH1gLFxuXHRcdFx0XHRcdHJlc29sdmVyOiBhc3luYyAoKSA9PiB7XG5cdFx0XHRcdFx0XHRyZXNvbHZlckNhbGxzLnB1c2goY2hhdCk7XG5cdFx0XHRcdFx0XHRyZXR1cm4geyB0dXJuczogW10gfTtcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdG1hbmFnZXIucmVtb3ZlU2Vzc2lvbihzZXNzaW9uVXJpKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHBlZXIxOiBhd2FpdCBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQpLFxuXHRcdFx0XHRcdHBlZXIyOiBhd2FpdCBtYW5hZ2VyLnJlc29sdmVDaGF0U3RhdGUocGVlckNoYXQyKSxcblx0XHRcdFx0XHRyZXNvbHZlckNhbGxzLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0cGVlcjE6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRwZWVyMjogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc29sdmVyQ2FsbHM6IFtdLFxuXHRcdFx0XHR9LFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ1N1YmFnZW50IFVSSSBoZWxwZXJzJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2J1aWxkU3ViYWdlbnRTZXNzaW9uVXJpIGNyZWF0ZXMgY29ycmVjdCBVUkknLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRTdWJhZ2VudFNlc3Npb25VcmkoJ2NvcGlsb3Q6L3Nlc3Npb24tMScsICd0Yy0xJyksXG5cdFx0XHQnY29waWxvdDovc2Vzc2lvbi0xL3N1YmFnZW50L3RjLTEnLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2J1aWxkU3ViYWdlbnRTZXNzaW9uVXJpIHByZXNlcnZlcyBwYXJlbnQgVVJJIHBhdGggc2hhcGUnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0YnVpbGRTdWJhZ2VudFNlc3Npb25VcmkoJ2NvcGlsb3Q6L3Nlc3Npb24tMS8vbmVzdGVkLy4uL2tlcHQnLCAndGMtMScpLFxuXHRcdFx0J2NvcGlsb3Q6L3Nlc3Npb24tMS8vbmVzdGVkLy4uL2tlcHQvc3ViYWdlbnQvdGMtMScsXG5cdFx0KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTdWJhZ2VudFNlc3Npb25VcmkgZXh0cmFjdHMgcGFyZW50IGFuZCB0b29sQ2FsbElkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKCdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvdGMtMScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkICYmIHtcblx0XHRcdHBhcmVudFNlc3Npb246IHBhcnNlZC5wYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHR0b29sQ2FsbElkOiBwYXJzZWQudG9vbENhbGxJZCxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTZXNzaW9uOiAnY29waWxvdDovc2Vzc2lvbi0xJyxcblx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncGFyc2VTdWJhZ2VudFNlc3Npb25VcmkgaGFuZGxlcyBuZXN0ZWQgc3ViYWdlbnQgVVJJcycsICgpID0+IHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSgnY29waWxvdDovc2Vzc2lvbi0xL3N1YmFnZW50L3RjLTEvc3ViYWdlbnQvdGMtMicpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFyc2VkICYmIHtcblx0XHRcdHBhcmVudFNlc3Npb246IHBhcnNlZC5wYXJlbnRTZXNzaW9uLnRvU3RyaW5nKCksXG5cdFx0XHR0b29sQ2FsbElkOiBwYXJzZWQudG9vbENhbGxJZCxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTZXNzaW9uOiAnY29waWxvdDovc2Vzc2lvbi0xL3N1YmFnZW50L3RjLTEnLFxuXHRcdFx0dG9vbENhbGxJZDogJ3RjLTInLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdwYXJzZVN1YmFnZW50U2Vzc2lvblVyaSByZXR1cm5zIHVuZGVmaW5lZCBmb3Igbm9uLXN1YmFnZW50IFVSSXMnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnaXNTdWJhZ2VudFNlc3Npb24gaWRlbnRpZmllcyBzdWJhZ2VudCBVUklzJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChpc1N1YmFnZW50U2Vzc2lvbignY29waWxvdDovc2Vzc2lvbi0xL3N1YmFnZW50L3RjLTEnKSwgdHJ1ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGlzU3ViYWdlbnRTZXNzaW9uKCdjb3BpbG90Oi9zZXNzaW9uLTEnKSwgZmFsc2UpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeCBjcmVhdGVzIHN0YXRlIG1hbmFnZXIgcHJlZml4JywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4KCdjb3BpbG90Oi9zZXNzaW9uLTEnKSxcblx0XHRcdCdjb3BpbG90Oi9zZXNzaW9uLTEvc3ViYWdlbnQvJyxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeCBwcmVzZXJ2ZXMgcGFyZW50IFVSSSBwYXRoIHNoYXBlJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChcblx0XHRcdGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpUHJlZml4KCdjb3BpbG90Oi9zZXNzaW9uLTEvL25lc3RlZC8uLi9rZXB0JyksXG5cdFx0XHQnY29waWxvdDovc2Vzc2lvbi0xLy9uZXN0ZWQvLi4va2VwdC9zdWJhZ2VudC8nLFxuXHRcdCk7XG5cdH0pO1xuXG5cdHN1aXRlKCdtZXJnZVNlc3Npb25XaXRoRGVmYXVsdENoYXQnLCAoKSA9PiB7XG5cdFx0ZnVuY3Rpb24gbWFrZVNlc3Npb25TdGF0ZSh3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nKTogU2Vzc2lvblN0YXRlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHByb3ZpZGVyOiAnY29waWxvdCcsXG5cdFx0XHRcdHRpdGxlOiAnU2Vzc2lvbicsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRsaWZlY3ljbGU6IFNlc3Npb25MaWZlY3ljbGUuUmVhZHksXG5cdFx0XHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdFx0XHRjaGF0czogW10sXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0ZnVuY3Rpb24gbWFrZUNoYXRTdGF0ZSh3b3JraW5nRGlyZWN0b3J5Pzogc3RyaW5nKTogQ2hhdFN0YXRlIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHJlc291cmNlOiAnY29waWxvdDovdGVzdC1zZXNzaW9uL2NoYXQvcGVlcicsXG5cdFx0XHRcdHRpdGxlOiAnUGVlcicsXG5cdFx0XHRcdHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlLFxuXHRcdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3Rvcmllczogd29ya2luZ0RpcmVjdG9yeSA/IFt3b3JraW5nRGlyZWN0b3J5XSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dHVybnM6IFtdLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHR0ZXN0KCdyZXNvbHZlcyB0aGUgcGVyLWNoYXQgd29ya2luZyBkaXJlY3Rvcnkgb3ZlcnJpZGUgb3ZlciB0aGUgc2Vzc2lvbiBkZWZhdWx0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KFxuXHRcdFx0XHRtYWtlU2Vzc2lvblN0YXRlKCdmaWxlOi8vL3Nlc3Npb24td2QnKSxcblx0XHRcdFx0bWFrZUNoYXRTdGF0ZSgnZmlsZTovLy9wZWVyLXdvcmt0cmVlJyksXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZC53b3JraW5nRGlyZWN0b3JpZXM/LlswXSwgJ2ZpbGU6Ly8vcGVlci13b3JrdHJlZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmFsbHMgYmFjayB0byB0aGUgc2Vzc2lvbiB3b3JraW5nIGRpcmVjdG9yeSB3aGVuIHRoZSBjaGF0IGRvZXMgbm90IG92ZXJyaWRlIGl0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KFxuXHRcdFx0XHRtYWtlU2Vzc2lvblN0YXRlKCdmaWxlOi8vL3Nlc3Npb24td2QnKSxcblx0XHRcdFx0bWFrZUNoYXRTdGF0ZSh1bmRlZmluZWQpLFxuXHRcdFx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChtZXJnZWQud29ya2luZ0RpcmVjdG9yaWVzPy5bMF0sICdmaWxlOi8vL3Nlc3Npb24td2QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHNlc3Npb24gd29ya2luZyBkaXJlY3Rvcnkgd2hlbiBubyBjaGF0IHN0YXRlIGlzIGh5ZHJhdGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgbWVyZ2VkID0gbWVyZ2VTZXNzaW9uV2l0aERlZmF1bHRDaGF0KG1ha2VTZXNzaW9uU3RhdGUoJ2ZpbGU6Ly8vc2Vzc2lvbi13ZCcpLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1lcmdlZC53b3JraW5nRGlyZWN0b3JpZXM/LlswXSwgJ2ZpbGU6Ly8vc2Vzc2lvbi13ZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChtZXJnZWQudHVybnMsIFtdKTtcblx0XHR9KTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLHVCQUF1QjtBQUNoQyxTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUywwQkFBMEI7QUFDbkMsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxZQUFZLHdCQUFpRTtBQUN0RixTQUFTLGFBQTZCLGtCQUFrQixnQkFBZ0Isa0JBQWtCLGVBQWUsV0FBVyxjQUFjLHFCQUFxQix5QkFBeUIsK0JBQStCLG1CQUFtQiw2QkFBNkIseUJBQXlCLG1CQUFtQiwyQkFBMkIsaUNBQTBHO0FBRWhiLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsbUJBQW1CLGdDQUFnQztBQUM1RCxTQUFTLHNDQUFzQztBQUUvQyxNQUFNLHlCQUF5QixNQUFNO0FBRXBDLE1BQUk7QUFDSixNQUFJO0FBQ0osUUFBTSxhQUFhLElBQUksS0FBSyxFQUFFLFFBQVEsV0FBVyxNQUFNLGdCQUFnQixDQUFDLEVBQUUsU0FBUztBQUNuRixRQUFNLGlCQUFpQixvQkFBb0IsVUFBVTtBQUVyRCxXQUFTLG1CQUFtQixVQUFtQztBQUM5RCxXQUFPO0FBQUEsTUFDTixVQUFVLFlBQVk7QUFBQSxNQUN0QixVQUFVO0FBQUEsTUFDVixPQUFPO0FBQUEsTUFDUCxRQUFRLGNBQWM7QUFBQSxNQUN0QixZQUFXLG9CQUFJLEtBQUssR0FBRSxZQUFZO0FBQUEsTUFDbEMsYUFBWSxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUFBLE1BQ25DLFNBQVMsRUFBRSxLQUFLLHdC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
