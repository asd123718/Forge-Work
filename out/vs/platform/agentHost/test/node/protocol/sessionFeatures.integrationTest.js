import assert from "assert";
import { timeout } from "../../../../../base/common/async.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { PROTOCOL_VERSION } from "../../../common/state/protocol/version/registry.js";
import { MessageKind, PendingMessageKind, ResponsePartKind, ROOT_STATE_URI } from "../../../common/state/sessionState.js";
import { MOCK_AUTO_TITLE } from "../mockAgent.js";
import {
  createAndSubscribeSession,
  defaultChatChannel,
  dispatchTurnStarted,
  fetchSessionWithChat,
  getAgentHostE2ETestTimeout,
  getActionEnvelope,
  isActionNotification,
  nextSessionUri,
  startServer,
  stopServer,
  TestProtocolClient
} from "../serverIntegrationTestHelpers.js";
suite("Protocol WebSocket \u2014 Session Features", function() {
  let server;
  let client;
  suiteSetup(async function() {
    this.timeout(getAgentHostE2ETestTimeout(15e3, 6e4));
    server = await startServer();
  });
  suiteTeardown(async function() {
    this.timeout(getAgentHostE2ETestTimeout(2e4, 5e4));
    await stopServer(server);
  });
  setup(async function() {
    this.timeout(1e4);
    client = new TestProtocolClient(server.port);
    await client.connect();
  });
  teardown(function() {
    client.close();
  });
  test("client titleChanged updates session state snapshot", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-titleChanged");
    client.notify("dispatchAction", {
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: "session/titleChanged",
        title: "My Custom Title"
      }
    });
    const titleNotif = await client.waitForNotification((n) => isActionNotification(n, "session/titleChanged"));
    const titleAction = getActionEnvelope(titleNotif).action;
    assert.strictEqual(titleAction.title, "My Custom Title");
    const snapshot = await client.call("subscribe", { channel: sessionUri });
    const state = snapshot.snapshot.state;
    assert.strictEqual(state.title, "My Custom Title");
  });
  test("agent-generated titleChanged is broadcast", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-agent-title");
    dispatchTurnStarted(client, sessionUri, "turn-title", "with-title", 1);
    const titleNotif = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/titleChanged")) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return action.title === MOCK_AUTO_TITLE;
    });
    const titleAction = getActionEnvelope(titleNotif).action;
    assert.strictEqual(titleAction.title, MOCK_AUTO_TITLE);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    const snapshot = await client.call("subscribe", { channel: sessionUri });
    const state = snapshot.snapshot.state;
    assert.strictEqual(state.title, MOCK_AUTO_TITLE);
  });
  test("first turn immediately sets title to user message", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-immediate-title");
    const before = await client.call("subscribe", { channel: sessionUri });
    assert.strictEqual(before.snapshot.state.title, "");
    dispatchTurnStarted(client, sessionUri, "turn-immediate", "Fix the login bug", 1);
    const titleNotif = await client.waitForNotification((n) => isActionNotification(n, "session/titleChanged"));
    const titleAction = getActionEnvelope(titleNotif).action;
    assert.strictEqual(titleAction.title, "Fix the login bug");
    const result = await client.call("listSessions", { channel: ROOT_STATE_URI });
    const session = result.items.find((s) => s.resource === sessionUri);
    assert.ok(session, "session should appear in listSessions");
    assert.strictEqual(session.title, "Fix the login bug");
  });
  test("renamed session title persists across listSessions", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-title-list");
    client.notify("dispatchAction", {
      channel: sessionUri,
      clientSeq: 1,
      action: {
        type: "session/titleChanged",
        title: "Persisted Title"
      }
    });
    await client.waitForNotification((n) => {
      if (!isActionNotification(n, "session/titleChanged")) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return action.title === "Persisted Title";
    });
    let session;
    for (let i = 0; i < 20; i++) {
      const result = await client.call("listSessions", { channel: ROOT_STATE_URI });
      session = result.items.find((s) => s.resource === sessionUri);
      if (session?.title === "Persisted Title") {
        break;
      }
      await timeout(100);
    }
    assert.ok(session, "session should appear in listSessions");
    assert.strictEqual(session.title, "Persisted Title");
  });
  test("message model flows through turn dispatch and subscribe", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-message-model");
    client.dispatch({
      channel: defaultChatChannel(sessionUri),
      clientSeq: 1,
      action: {
        type: ActionType.ChatTurnStarted,
        turnId: "turn-model",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: { text: "hello", origin: { kind: MessageKind.User }, model: { id: "mock-model" } }
      }
    });
    const turnStartedNotif = await client.waitForNotification((n) => isActionNotification(n, "chat/turnStarted"));
    const turnStartedAction = getActionEnvelope(turnStartedNotif).action;
    assert.deepStrictEqual(turnStartedAction.message.model, { id: "mock-model" });
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.deepStrictEqual(state.turns.at(-1)?.message.model, { id: "mock-model" });
  });
  test("reasoning events produce reasoning response parts and append actions", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-reasoning");
    dispatchTurnStarted(client, sessionUri, "turn-reasoning", "with-reasoning", 1);
    const reasoningPart = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/responsePart")) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return action.part.kind === ResponsePartKind.Reasoning;
    });
    const reasoningAction = getActionEnvelope(reasoningPart).action;
    assert.strictEqual(reasoningAction.part.kind, ResponsePartKind.Reasoning);
    const appendNotif = await client.waitForNotification((n) => isActionNotification(n, "chat/reasoning"));
    const appendAction = getActionEnvelope(appendNotif).action;
    assert.strictEqual(appendAction.type, "chat/reasoning");
    if (appendAction.type === "chat/reasoning") {
      assert.strictEqual(appendAction.content, " about this...");
    }
    const mdPart = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/responsePart")) {
        return false;
      }
      const action = getActionEnvelope(n).action;
      return action.part.kind === ResponsePartKind.Markdown;
    });
    assert.ok(mdPart);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
  });
  test("queued message is auto-consumed when session is idle", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-queue-idle");
    client.clearReceived();
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 1,
      action: {
        type: "chat/pendingMessageSet",
        kind: PendingMessageKind.Queued,
        id: "q-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      }
    });
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnStarted"));
    await client.waitForNotification((n) => isActionNotification(n, "chat/responsePart"));
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.ok(state.turns.length >= 1);
    assert.strictEqual(state.turns[state.turns.length - 1].message.text, "hello");
    assert.ok(!state.queuedMessages?.length, "queued messages should be empty after consumption");
  });
  test("queued message waits for in-progress turn to complete", async function() {
    this.timeout(15e3);
    const sessionUri = await createAndSubscribeSession(client, "test-queue-wait");
    dispatchTurnStarted(client, sessionUri, "turn-first", "hello", 1);
    await client.waitForNotification((n) => isActionNotification(n, "chat/responsePart"));
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 2,
      action: {
        type: "chat/pendingMessageSet",
        kind: PendingMessageKind.Queued,
        id: "q-wait-1",
        message: { text: "hello", origin: { kind: MessageKind.User } }
      }
    });
    const firstComplete = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/turnComplete")) {
        return false;
      }
      return getActionEnvelope(n).action.turnId === "turn-first";
    });
    const firstSeq = getActionEnvelope(firstComplete).serverSeq;
    const secondComplete = await client.waitForNotification((n) => {
      if (!isActionNotification(n, "chat/turnComplete")) {
        return false;
      }
      const envelope = getActionEnvelope(n);
      return envelope.action.turnId !== "turn-first" && envelope.serverSeq > firstSeq;
    });
    assert.ok(secondComplete, "should receive a second turnComplete from the queued message");
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.ok(state.turns.length >= 2, `expected >= 2 turns but got ${state.turns.length}`);
  });
  test("steering message is set and consumed by agent", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-steering");
    dispatchTurnStarted(client, sessionUri, "turn-steer", "hello", 1);
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 2,
      action: {
        type: "chat/pendingMessageSet",
        kind: PendingMessageKind.Steering,
        id: "steer-1",
        message: { text: "Please be concise", origin: { kind: MessageKind.User } }
      }
    });
    const setNotif = await client.waitForNotification((n) => isActionNotification(n, "chat/pendingMessageSet"));
    assert.ok(setNotif, "should see pendingMessageSet action");
    const removedNotif = await client.waitForNotification((n) => isActionNotification(n, "chat/pendingMessageRemoved"));
    assert.ok(removedNotif, "should see pendingMessageRemoved after agent consumes steering");
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.ok(!state.steeringMessage, "steering message should be cleared after consumption");
  });
  test("truncate session removes turns after specified turn", async function() {
    this.timeout(15e3);
    const sessionUri = await createAndSubscribeSession(client, "test-truncate");
    dispatchTurnStarted(client, sessionUri, "turn-t1", "hello", 1);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-t1");
    client.clearReceived();
    dispatchTurnStarted(client, sessionUri, "turn-t2", "hello", 2);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-t2");
    let state = await fetchSessionWithChat(client, sessionUri);
    assert.strictEqual(state.turns.length, 2);
    client.clearReceived();
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 3,
      action: { type: "chat/truncated", turnId: "turn-t1" }
    });
    await client.waitForNotification((n) => isActionNotification(n, "chat/truncated"));
    state = await fetchSessionWithChat(client, sessionUri);
    assert.strictEqual(state.turns.length, 1);
    assert.strictEqual(state.turns[0].id, "turn-t1");
  });
  test("truncate all turns clears session history", async function() {
    this.timeout(15e3);
    const sessionUri = await createAndSubscribeSession(client, "test-truncate-all");
    dispatchTurnStarted(client, sessionUri, "turn-ta1", "hello", 1);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    client.clearReceived();
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 2,
      action: { type: "chat/truncated" }
    });
    await client.waitForNotification((n) => isActionNotification(n, "chat/truncated"));
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.strictEqual(state.turns.length, 0);
  });
  test("new turn after truncation works correctly", async function() {
    this.timeout(15e3);
    const sessionUri = await createAndSubscribeSession(client, "test-truncate-resume");
    dispatchTurnStarted(client, sessionUri, "turn-tr1", "hello", 1);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-tr1");
    client.clearReceived();
    dispatchTurnStarted(client, sessionUri, "turn-tr2", "hello", 2);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-tr2");
    client.clearReceived();
    client.notify("dispatchAction", {
      channel: defaultChatChannel(sessionUri),
      clientSeq: 3,
      action: { type: "chat/truncated", turnId: "turn-tr1" }
    });
    await client.waitForNotification((n) => isActionNotification(n, "chat/truncated"));
    dispatchTurnStarted(client, sessionUri, "turn-tr3", "hello", 4);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete"));
    const state = await fetchSessionWithChat(client, sessionUri);
    assert.strictEqual(state.turns.length, 2);
    assert.strictEqual(state.turns[0].id, "turn-tr1");
    assert.strictEqual(state.turns[1].id, "turn-tr3");
  });
  test("fork creates a new session with source history", async function() {
    this.timeout(15e3);
    const sessionUri = await createAndSubscribeSession(client, "test-fork");
    dispatchTurnStarted(client, sessionUri, "turn-f1", "hello", 1);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-f1");
    client.clearReceived();
    dispatchTurnStarted(client, sessionUri, "turn-f2", "hello", 2);
    await client.waitForNotification((n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).action.turnId === "turn-f2");
    client.clearReceived();
    const forkedSessionUri = nextSessionUri();
    await client.call("createSession", {
      channel: forkedSessionUri,
      provider: "mock",
      fork: { session: sessionUri, turnId: "turn-f1" }
    });
    const addedNotif = await client.waitForNotification(
      (n) => n.method === "root/sessionAdded"
    );
    const addedSession = addedNotif.params;
    const state = await fetchSessionWithChat(client, addedSession.summary.resource);
    assert.strictEqual(state.lifecycle, "ready");
    assert.strictEqual(state.turns.length, 1, "forked session should have 1 turn");
    const sourceState = await fetchSessionWithChat(client, sessionUri);
    assert.strictEqual(sourceState.turns.length, 2);
  });
  test("fork with invalid turn ID returns error", async function() {
    this.timeout(1e4);
    const sessionUri = await createAndSubscribeSession(client, "test-fork-invalid");
    let gotError = false;
    try {
      await client.call("createSession", {
        channel: nextSessionUri(),
        provider: "mock",
        fork: { session: sessionUri, turnId: "nonexistent-turn" }
      });
    } catch {
      gotError = true;
    }
    assert.ok(gotError, "should get error for invalid fork turn ID");
  });
  test("fork with invalid source session returns error", async function() {
    this.timeout(1e4);
    await client.call("initialize", { channel: ROOT_STATE_URI, protocolVersions: [PROTOCOL_VERSION], clientId: "test-fork-no-source" });
    let gotError = false;
    try {
      await client.call("createSession", {
        channel: nextSessionUri(),
        provider: "mock",
        fork: { session: "mock://nonexistent-session", turnId: "turn-1" }
      });
    } catch {
      gotError = true;
    }
    assert.ok(gotError, "should get error for invalid fork source session");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxwcm90b2NvbFxcc2Vzc2lvbkZlYXR1cmVzLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IHRpbWVvdXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hc3luYy5qcyc7XG5pbXBvcnQgeyBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBJUmVzcG9uc2VQYXJ0QWN0aW9uLCB0eXBlIElUdXJuU3RhcnRlZEFjdGlvbiwgdHlwZSBTZXNzaW9uQWRkZWRQYXJhbXMsIHR5cGUgSVRpdGxlQ2hhbmdlZEFjdGlvbiB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBQUk9UT0NPTF9WRVJTSU9OIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3ZlcnNpb24vcmVnaXN0cnkuanMnO1xuaW1wb3J0IHR5cGUgeyBMaXN0U2Vzc2lvbnNSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblByb3RvY29sLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBQZW5kaW5nTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFJPT1RfU1RBVEVfVVJJLCB0eXBlIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBNT0NLX0FVVE9fVElUTEUgfSBmcm9tICcuLi9tb2NrQWdlbnQuanMnO1xuaW1wb3J0IHtcblx0Y3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbixcblx0ZGVmYXVsdENoYXRDaGFubmVsLFxuXHRkaXNwYXRjaFR1cm5TdGFydGVkLFxuXHRmZXRjaFNlc3Npb25XaXRoQ2hhdCxcblx0Z2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQsXG5cdGdldEFjdGlvbkVudmVsb3BlLFxuXHRpc0FjdGlvbk5vdGlmaWNhdGlvbixcblx0SVNlcnZlckhhbmRsZSxcblx0bmV4dFNlc3Npb25VcmksXG5cdHN0YXJ0U2VydmVyLFxuXHRzdG9wU2VydmVyLFxuXHRUZXN0UHJvdG9jb2xDbGllbnQsXG59IGZyb20gJy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuXG5zdWl0ZSgnUHJvdG9jb2wgV2ViU29ja2V0IFx1MjAxNCBTZXNzaW9uIEZlYXR1cmVzJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBzZXJ2ZXI6IElTZXJ2ZXJIYW5kbGU7XG5cdGxldCBjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudDtcblxuXHRzdWl0ZVNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQoMTVfMDAwLCA2MF8wMDApKTtcblx0XHRzZXJ2ZXIgPSBhd2FpdCBzdGFydFNlcnZlcigpO1xuXHR9KTtcblxuXHRzdWl0ZVRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoZ2V0QWdlbnRIb3N0RTJFVGVzdFRpbWVvdXQoMjBfMDAwLCA1MF8wMDApKTtcblx0XHRhd2FpdCBzdG9wU2VydmVyKHNlcnZlcik7XG5cdH0pO1xuXG5cdHNldHVwKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblx0XHRjbGllbnQgPSBuZXcgVGVzdFByb3RvY29sQ2xpZW50KHNlcnZlci5wb3J0KTtcblx0XHRhd2FpdCBjbGllbnQuY29ubmVjdCgpO1xuXHR9KTtcblxuXHR0ZWFyZG93bihmdW5jdGlvbiAoKSB7XG5cdFx0Y2xpZW50LmNsb3NlKCk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiByZW5hbWUgLyB0aXRsZSAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdjbGllbnQgdGl0bGVDaGFuZ2VkIHVwZGF0ZXMgc2Vzc2lvbiBzdGF0ZSBzbmFwc2hvdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVBbmRTdWJzY3JpYmVTZXNzaW9uKGNsaWVudCwgJ3Rlc3QtdGl0bGVDaGFuZ2VkJyk7XG5cblx0XHRjbGllbnQubm90aWZ5KCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6IHNlc3Npb25VcmksXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogJ3Nlc3Npb24vdGl0bGVDaGFuZ2VkJyxcblx0XHRcdFx0dGl0bGU6ICdNeSBDdXN0b20gVGl0bGUnLFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRpdGxlTm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL3RpdGxlQ2hhbmdlZCcpKTtcblx0XHRjb25zdCB0aXRsZUFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKHRpdGxlTm90aWYpLmFjdGlvbiBhcyBJVGl0bGVDaGFuZ2VkQWN0aW9uO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aXRsZUFjdGlvbi50aXRsZSwgJ015IEN1c3RvbSBUaXRsZScpO1xuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBzbmFwc2hvdC5zbmFwc2hvdCEuc3RhdGUgYXMgSVNlc3Npb25XaXRoRGVmYXVsdENoYXQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRpdGxlLCAnTXkgQ3VzdG9tIFRpdGxlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50LWdlbmVyYXRlZCB0aXRsZUNoYW5nZWQgaXMgYnJvYWRjYXN0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZUFuZFN1YnNjcmliZVNlc3Npb24oY2xpZW50LCAndGVzdC1hZ2VudC10aXRsZScpO1xuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi10aXRsZScsICd3aXRoLXRpdGxlJywgMSk7XG5cblx0XHQvLyBUaGUgZmlyc3QgdGl0bGVDaGFuZ2VkIGlzIHRoZSBpbW1lZGlhdGUgZmFsbGJhY2sgKHVzZXIgbWVzc2FnZSB0ZXh0KS5cblx0XHQvLyBXYWl0IGZvciB0aGUgYWdlbnQtZ2VuZXJhdGVkIHRpdGxlIHdoaWNoIGFycml2ZXMgc2Vjb25kLlxuXHRcdGNvbnN0IHRpdGxlTm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vdGl0bGVDaGFuZ2VkJykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElUaXRsZUNoYW5nZWRBY3Rpb247XG5cdFx0XHRyZXR1cm4gYWN0aW9uLnRpdGxlID09PSBNT0NLX0FVVE9fVElUTEU7XG5cdFx0fSk7XG5cdFx0Y29uc3QgdGl0bGVBY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZSh0aXRsZU5vdGlmKS5hY3Rpb24gYXMgSVRpdGxlQ2hhbmdlZEFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGl0bGVBY3Rpb24udGl0bGUsIE1PQ0tfQVVUT19USVRMRSk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKTtcblxuXHRcdGNvbnN0IHNuYXBzaG90ID0gYXdhaXQgY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBzZXNzaW9uVXJpIH0pO1xuXHRcdGNvbnN0IHN0YXRlID0gc25hcHNob3Quc25hcHNob3QhLnN0YXRlIGFzIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50aXRsZSwgTU9DS19BVVRPX1RJVExFKTtcblx0fSk7XG5cblx0dGVzdCgnZmlyc3QgdHVybiBpbW1lZGlhdGVseSBzZXRzIHRpdGxlIHRvIHVzZXIgbWVzc2FnZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTBfMDAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVBbmRTdWJzY3JpYmVTZXNzaW9uKGNsaWVudCwgJ3Rlc3QtaW1tZWRpYXRlLXRpdGxlJyk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIHNlc3Npb24gc3RhcnRzIHdpdGggdGhlIGRlZmF1bHQgcGxhY2Vob2xkZXIgdGl0bGVcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBjbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IHNlc3Npb25VcmkgfSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChiZWZvcmUuc25hcHNob3QhLnN0YXRlIGFzIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0KS50aXRsZSwgJycpO1xuXG5cdFx0Ly8gU2VuZCBmaXJzdCB0dXJuIFx1MjAxNCBzaWRlIGVmZmVjdHMgc2hvdWxkIGRpc3BhdGNoIGFuIGltbWVkaWF0ZSB0aXRsZUNoYW5nZWRcblx0XHQvLyB3aXRoIHRoZSB1c2VyJ3MgbWVzc2FnZSB0ZXh0IGJlZm9yZSB0aGUgYWdlbnQgcHJvZHVjZXMgaXRzIG93biB0aXRsZS5cblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4taW1tZWRpYXRlJywgJ0ZpeCB0aGUgbG9naW4gYnVnJywgMSk7XG5cblx0XHQvLyBUaGUgZmlyc3QgdGl0bGVDaGFuZ2VkIHNob3VsZCBjYXJyeSB0aGUgdXNlciBtZXNzYWdlIHRleHRcblx0XHRjb25zdCB0aXRsZU5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnc2Vzc2lvbi90aXRsZUNoYW5nZWQnKSk7XG5cdFx0Y29uc3QgdGl0bGVBY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZSh0aXRsZU5vdGlmKS5hY3Rpb24gYXMgSVRpdGxlQ2hhbmdlZEFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGl0bGVBY3Rpb24udGl0bGUsICdGaXggdGhlIGxvZ2luIGJ1ZycpO1xuXG5cdFx0Ly8gbGlzdFNlc3Npb25zIHNob3VsZCBhbHNvIHJlZmxlY3QgdGhlIHVwZGF0ZWQgdGl0bGVcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjbGllbnQuY2FsbDxMaXN0U2Vzc2lvbnNSZXN1bHQ+KCdsaXN0U2Vzc2lvbnMnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdGNvbnN0IHNlc3Npb24gPSByZXN1bHQuaXRlbXMuZmluZChzID0+IHMucmVzb3VyY2UgPT09IHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5vayhzZXNzaW9uLCAnc2Vzc2lvbiBzaG91bGQgYXBwZWFyIGluIGxpc3RTZXNzaW9ucycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnRpdGxlLCAnRml4IHRoZSBsb2dpbiBidWcnKTtcblx0fSk7XG5cblx0dGVzdCgncmVuYW1lZCBzZXNzaW9uIHRpdGxlIHBlcnNpc3RzIGFjcm9zcyBsaXN0U2Vzc2lvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjbGllbnQsICd0ZXN0LXRpdGxlLWxpc3QnKTtcblxuXHRcdGNsaWVudC5ub3RpZnkoJ2Rpc3BhdGNoQWN0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvblVyaSxcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiAnc2Vzc2lvbi90aXRsZUNoYW5nZWQnLFxuXHRcdFx0XHR0aXRsZTogJ1BlcnNpc3RlZCBUaXRsZScsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL3RpdGxlQ2hhbmdlZCcpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJVGl0bGVDaGFuZ2VkQWN0aW9uO1xuXHRcdFx0cmV0dXJuIGFjdGlvbi50aXRsZSA9PT0gJ1BlcnNpc3RlZCBUaXRsZSc7XG5cdFx0fSk7XG5cblx0XHQvLyBQb2xsIGxpc3RTZXNzaW9ucyB1bnRpbCB0aGUgcGVyc2lzdGVkIHRpdGxlIGFwcGVhcnMgKGFzeW5jIERCIHdyaXRlKVxuXHRcdGxldCBzZXNzaW9uOiB7IHRpdGxlOiBzdHJpbmcgfSB8IHVuZGVmaW5lZDtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IDIwOyBpKyspIHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IGNsaWVudC5jYWxsPExpc3RTZXNzaW9uc1Jlc3VsdD4oJ2xpc3RTZXNzaW9ucycsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0XHRzZXNzaW9uID0gcmVzdWx0Lml0ZW1zLmZpbmQocyA9PiBzLnJlc291cmNlID09PSBzZXNzaW9uVXJpKTtcblx0XHRcdGlmIChzZXNzaW9uPy50aXRsZSA9PT0gJ1BlcnNpc3RlZCBUaXRsZScpIHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRhd2FpdCB0aW1lb3V0KDEwMCk7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhzZXNzaW9uLCAnc2Vzc2lvbiBzaG91bGQgYXBwZWFyIGluIGxpc3RTZXNzaW9ucycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXNzaW9uLnRpdGxlLCAnUGVyc2lzdGVkIFRpdGxlJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gU2Vzc2lvbiBtb2RlbCAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ21lc3NhZ2UgbW9kZWwgZmxvd3MgdGhyb3VnaCB0dXJuIGRpc3BhdGNoIGFuZCBzdWJzY3JpYmUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjbGllbnQsICd0ZXN0LW1lc3NhZ2UtbW9kZWwnKTtcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogZGVmYXVsdENoYXRDaGFubmVsKHNlc3Npb25VcmkpLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLW1vZGVsJyxcblx0XHRcdFx0c3RhcnRlZEF0OiAnMjAyNS0wMS0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LCBtb2RlbDogeyBpZDogJ21vY2stbW9kZWwnIH0gfSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCB0dXJuU3RhcnRlZE5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuU3RhcnRlZCcpKTtcblx0XHRjb25zdCB0dXJuU3RhcnRlZEFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKHR1cm5TdGFydGVkTm90aWYpLmFjdGlvbiBhcyBJVHVyblN0YXJ0ZWRBY3Rpb247XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJuU3RhcnRlZEFjdGlvbi5tZXNzYWdlLm1vZGVsLCB7IGlkOiAnbW9jay1tb2RlbCcgfSk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0YXRlLnR1cm5zLmF0KC0xKT8ubWVzc2FnZS5tb2RlbCwgeyBpZDogJ21vY2stbW9kZWwnIH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFJlYXNvbmluZyBldmVudHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgncmVhc29uaW5nIGV2ZW50cyBwcm9kdWNlIHJlYXNvbmluZyByZXNwb25zZSBwYXJ0cyBhbmQgYXBwZW5kIGFjdGlvbnMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjbGllbnQsICd0ZXN0LXJlYXNvbmluZycpO1xuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1yZWFzb25pbmcnLCAnd2l0aC1yZWFzb25pbmcnLCAxKTtcblxuXHRcdC8vIFRoZSBmaXJzdCByZWFzb25pbmcgZXZlbnQgcHJvZHVjZXMgYSByZXNwb25zZVBhcnQgd2l0aCBraW5kIFJlYXNvbmluZ1xuXHRcdGNvbnN0IHJlYXNvbmluZ1BhcnQgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIElSZXNwb25zZVBhcnRBY3Rpb247XG5cdFx0XHRyZXR1cm4gYWN0aW9uLnBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmc7XG5cdFx0fSk7XG5cdFx0Y29uc3QgcmVhc29uaW5nQWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUocmVhc29uaW5nUGFydCkuYWN0aW9uIGFzIElSZXNwb25zZVBhcnRBY3Rpb247XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYXNvbmluZ0FjdGlvbi5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKTtcblxuXHRcdC8vIFRoZSBzZWNvbmQgcmVhc29uaW5nIGNodW5rIHByb2R1Y2VzIGEgY2hhdC9yZWFzb25pbmcgYXBwZW5kIGFjdGlvblxuXHRcdGNvbnN0IGFwcGVuZE5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9yZWFzb25pbmcnKSk7XG5cdFx0Y29uc3QgYXBwZW5kQWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUoYXBwZW5kTm90aWYpLmFjdGlvbjtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYXBwZW5kQWN0aW9uLnR5cGUsICdjaGF0L3JlYXNvbmluZycpO1xuXHRcdGlmIChhcHBlbmRBY3Rpb24udHlwZSA9PT0gJ2NoYXQvcmVhc29uaW5nJykge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFwcGVuZEFjdGlvbi5jb250ZW50LCAnIGFib3V0IHRoaXMuLi4nKTtcblx0XHR9XG5cblx0XHQvLyBUaGVuIHRoZSBtYXJrZG93biByZXNwb25zZSBwYXJ0XG5cdFx0Y29uc3QgbWRQYXJ0ID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Jlc3BvbnNlUGFydCcpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyBJUmVzcG9uc2VQYXJ0QWN0aW9uO1xuXHRcdFx0cmV0dXJuIGFjdGlvbi5wYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd247XG5cdFx0fSk7XG5cdFx0YXNzZXJ0Lm9rKG1kUGFydCk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBRdWV1ZWQgbWVzc2FnZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ3F1ZXVlZCBtZXNzYWdlIGlzIGF1dG8tY29uc3VtZWQgd2hlbiBzZXNzaW9uIGlzIGlkbGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjbGllbnQsICd0ZXN0LXF1ZXVlLWlkbGUnKTtcblx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Ly8gUXVldWUgYSBtZXNzYWdlIHdoZW4gdGhlIHNlc3Npb24gaXMgaWRsZSBcdTIwMTQgc2VydmVyIHNob3VsZCBpbW1lZGlhdGVseSBjb25zdW1lIGl0XG5cdFx0Y2xpZW50Lm5vdGlmeSgnZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBkZWZhdWx0Q2hhdENoYW5uZWwoc2Vzc2lvblVyaSksXG5cdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogJ2NoYXQvcGVuZGluZ01lc3NhZ2VTZXQnLFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3EtMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ2hlbGxvJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIFRoZSBzZXJ2ZXIgc2hvdWxkIGF1dG8tY29uc3VtZSB0aGUgcXVldWVkIG1lc3NhZ2UgYW5kIHN0YXJ0IGEgdHVyblxuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVyblN0YXJ0ZWQnKSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9yZXNwb25zZVBhcnQnKSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKSk7XG5cblx0XHQvLyBWZXJpZnkgdGhlIHR1cm4gd2FzIGNyZWF0ZWQgZnJvbSB0aGUgcXVldWVkIG1lc3NhZ2Vcblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0Lm9rKHN0YXRlLnR1cm5zLmxlbmd0aCA+PSAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHVybnNbc3RhdGUudHVybnMubGVuZ3RoIC0gMV0ubWVzc2FnZS50ZXh0LCAnaGVsbG8nKTtcblx0XHQvLyBRdWV1ZSBzaG91bGQgYmUgZW1wdHkgYWZ0ZXIgY29uc3VtcHRpb25cblx0XHRhc3NlcnQub2soIXN0YXRlLnF1ZXVlZE1lc3NhZ2VzPy5sZW5ndGgsICdxdWV1ZWQgbWVzc2FnZXMgc2hvdWxkIGJlIGVtcHR5IGFmdGVyIGNvbnN1bXB0aW9uJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3F1ZXVlZCBtZXNzYWdlIHdhaXRzIGZvciBpbi1wcm9ncmVzcyB0dXJuIHRvIGNvbXBsZXRlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxNV8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZUFuZFN1YnNjcmliZVNlc3Npb24oY2xpZW50LCAndGVzdC1xdWV1ZS13YWl0Jyk7XG5cblx0XHQvLyBTdGFydCBhIHR1cm4gZmlyc3Rcblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tZmlyc3QnLCAnaGVsbG8nLCAxKTtcblxuXHRcdC8vIFdhaXQgZm9yIHRoZSBmaXJzdCB0dXJuJ3MgcmVzcG9uc2UgdG8gY29uZmlybSBpdCBpcyBpbiBwcm9ncmVzc1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0JykpO1xuXG5cdFx0Ly8gUXVldWUgYSBtZXNzYWdlIHdoaWxlIHRoZSB0dXJuIGlzIGluIHByb2dyZXNzXG5cdFx0Y2xpZW50Lm5vdGlmeSgnZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBkZWZhdWx0Q2hhdENoYW5uZWwoc2Vzc2lvblVyaSksXG5cdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogJ2NoYXQvcGVuZGluZ01lc3NhZ2VTZXQnLFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0XHRpZDogJ3Etd2FpdC0xJyxcblx0XHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnaGVsbG8nLCBvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9IH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Ly8gRmlyc3QgdHVybiBzaG91bGQgY29tcGxldGVcblx0XHRjb25zdCBmaXJzdENvbXBsZXRlID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdHJldHVybiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi1maXJzdCc7XG5cdFx0fSk7XG5cdFx0Y29uc3QgZmlyc3RTZXEgPSBnZXRBY3Rpb25FbnZlbG9wZShmaXJzdENvbXBsZXRlKS5zZXJ2ZXJTZXE7XG5cblx0XHQvLyBUaGUgcXVldWVkIG1lc3NhZ2UncyB0dXJuIHNob3VsZCBjb21wbGV0ZSBBRlRFUiB0aGUgZmlyc3QgdHVyblxuXHRcdGNvbnN0IHNlY29uZENvbXBsZXRlID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoIWlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudmVsb3BlID0gZ2V0QWN0aW9uRW52ZWxvcGUobik7XG5cdFx0XHRyZXR1cm4gKGVudmVsb3BlLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCAhPT0gJ3R1cm4tZmlyc3QnXG5cdFx0XHRcdCYmIGVudmVsb3BlLnNlcnZlclNlcSA+IGZpcnN0U2VxO1xuXHRcdH0pO1xuXHRcdGFzc2VydC5vayhzZWNvbmRDb21wbGV0ZSwgJ3Nob3VsZCByZWNlaXZlIGEgc2Vjb25kIHR1cm5Db21wbGV0ZSBmcm9tIHRoZSBxdWV1ZWQgbWVzc2FnZScpO1xuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjbGllbnQsIHNlc3Npb25VcmkpO1xuXHRcdGFzc2VydC5vayhzdGF0ZS50dXJucy5sZW5ndGggPj0gMiwgYGV4cGVjdGVkID49IDIgdHVybnMgYnV0IGdvdCAke3N0YXRlLnR1cm5zLmxlbmd0aH1gKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTdGVlcmluZyBtZXNzYWdlcyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0dGVzdCgnc3RlZXJpbmcgbWVzc2FnZSBpcyBzZXQgYW5kIGNvbnN1bWVkIGJ5IGFnZW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZUFuZFN1YnNjcmliZVNlc3Npb24oY2xpZW50LCAndGVzdC1zdGVlcmluZycpO1xuXG5cdFx0Ly8gU3RhcnQgYSB0dXJuIGZpcnN0XG5cdFx0ZGlzcGF0Y2hUdXJuU3RhcnRlZChjbGllbnQsIHNlc3Npb25VcmksICd0dXJuLXN0ZWVyJywgJ2hlbGxvJywgMSk7XG5cblx0XHQvLyBTZXQgYSBzdGVlcmluZyBtZXNzYWdlIHdoaWxlIHRoZSB0dXJuIGlzIGluIHByb2dyZXNzXG5cdFx0Y2xpZW50Lm5vdGlmeSgnZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBkZWZhdWx0Q2hhdENoYW5uZWwoc2Vzc2lvblVyaSksXG5cdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogJ2NoYXQvcGVuZGluZ01lc3NhZ2VTZXQnLFxuXHRcdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuU3RlZXJpbmcsXG5cdFx0XHRcdGlkOiAnc3RlZXItMScsXG5cdFx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ1BsZWFzZSBiZSBjb25jaXNlJywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIFRoZSBzdGVlcmluZyBtZXNzYWdlIHNob3VsZCBiZSBzZXQgaW4gc3RhdGUgaW5pdGlhbGx5XG5cdFx0Y29uc3Qgc2V0Tm90aWYgPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3BlbmRpbmdNZXNzYWdlU2V0JykpO1xuXHRcdGFzc2VydC5vayhzZXROb3RpZiwgJ3Nob3VsZCBzZWUgcGVuZGluZ01lc3NhZ2VTZXQgYWN0aW9uJyk7XG5cblx0XHQvLyBUaGUgbW9jayBhZ2VudCBjb25zdW1lcyBzdGVlcmluZyBhbmQgZmlyZXMgc3RlZXJpbmdfY29uc3VtZWQsXG5cdFx0Ly8gd2hpY2ggY2F1c2VzIHRoZSBzZXJ2ZXIgdG8gZGlzcGF0Y2ggcGVuZGluZ01lc3NhZ2VSZW1vdmVkXG5cdFx0Y29uc3QgcmVtb3ZlZE5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9wZW5kaW5nTWVzc2FnZVJlbW92ZWQnKSk7XG5cdFx0YXNzZXJ0Lm9rKHJlbW92ZWROb3RpZiwgJ3Nob3VsZCBzZWUgcGVuZGluZ01lc3NhZ2VSZW1vdmVkIGFmdGVyIGFnZW50IGNvbnN1bWVzIHN0ZWVyaW5nJyk7XG5cblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKTtcblxuXHRcdC8vIFN0ZWVyaW5nIHNob3VsZCBiZSBjbGVhcmVkIGZyb20gc3RhdGVcblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0Lm9rKCFzdGF0ZS5zdGVlcmluZ01lc3NhZ2UsICdzdGVlcmluZyBtZXNzYWdlIHNob3VsZCBiZSBjbGVhcmVkIGFmdGVyIGNvbnN1bXB0aW9uJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gVHJ1bmNhdGlvbiAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ3RydW5jYXRlIHNlc3Npb24gcmVtb3ZlcyB0dXJucyBhZnRlciBzcGVjaWZpZWQgdHVybicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTVfMDAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVBbmRTdWJzY3JpYmVTZXNzaW9uKGNsaWVudCwgJ3Rlc3QtdHJ1bmNhdGUnKTtcblxuXHRcdC8vIENyZWF0ZSB0d28gdHVybnNcblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tdDEnLCAnaGVsbG8nLCAxKTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpICYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09ICd0dXJuLXQxJyk7XG5cblx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi10MicsICdoZWxsbycsIDIpO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgJiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gJ3R1cm4tdDInKTtcblxuXHRcdC8vIFZlcmlmeSAyIHR1cm5zIGV4aXN0XG5cdFx0bGV0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHVybnMubGVuZ3RoLCAyKTtcblxuXHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHQvLyBUcnVuY2F0ZToga2VlcCBvbmx5IHR1cm4tdDFcblx0XHRjbGllbnQubm90aWZ5KCdkaXNwYXRjaEFjdGlvbicsIHtcblx0XHRcdGNoYW5uZWw6IGRlZmF1bHRDaGF0Q2hhbm5lbChzZXNzaW9uVXJpKSxcblx0XHRcdGNsaWVudFNlcTogMyxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiAnY2hhdC90cnVuY2F0ZWQnLCB0dXJuSWQ6ICd0dXJuLXQxJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90cnVuY2F0ZWQnKSk7XG5cblx0XHRzdGF0ZSA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnR1cm5zWzBdLmlkLCAndHVybi10MScpO1xuXHR9KTtcblxuXHR0ZXN0KCd0cnVuY2F0ZSBhbGwgdHVybnMgY2xlYXJzIHNlc3Npb24gaGlzdG9yeScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTVfMDAwKTtcblxuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVBbmRTdWJzY3JpYmVTZXNzaW9uKGNsaWVudCwgJ3Rlc3QtdHJ1bmNhdGUtYWxsJyk7XG5cblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tdGExJywgJ2hlbGxvJywgMSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKSk7XG5cblx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0Ly8gVHJ1bmNhdGUgYWxsIChubyB0dXJuSWQpXG5cdFx0Y2xpZW50Lm5vdGlmeSgnZGlzcGF0Y2hBY3Rpb24nLCB7XG5cdFx0XHRjaGFubmVsOiBkZWZhdWx0Q2hhdENoYW5uZWwoc2Vzc2lvblVyaSksXG5cdFx0XHRjbGllbnRTZXE6IDIsXG5cdFx0XHRhY3Rpb246IHsgdHlwZTogJ2NoYXQvdHJ1bmNhdGVkJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90cnVuY2F0ZWQnKSk7XG5cblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGZldGNoU2Vzc2lvbldpdGhDaGF0KGNsaWVudCwgc2Vzc2lvblVyaSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnR1cm5zLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ25ldyB0dXJuIGFmdGVyIHRydW5jYXRpb24gd29ya3MgY29ycmVjdGx5JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxNV8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZUFuZFN1YnNjcmliZVNlc3Npb24oY2xpZW50LCAndGVzdC10cnVuY2F0ZS1yZXN1bWUnKTtcblxuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi10cjEnLCAnaGVsbG8nLCAxKTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpICYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09ICd0dXJuLXRyMScpO1xuXG5cdFx0Y2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tdHIyJywgJ2hlbGxvJywgMik7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90dXJuQ29tcGxldGUnKSAmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSAndHVybi10cjInKTtcblxuXHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHQvLyBUcnVuY2F0ZSB0byB0dXJuLXRyMVxuXHRcdGNsaWVudC5ub3RpZnkoJ2Rpc3BhdGNoQWN0aW9uJywge1xuXHRcdFx0Y2hhbm5lbDogZGVmYXVsdENoYXRDaGFubmVsKHNlc3Npb25VcmkpLFxuXHRcdFx0Y2xpZW50U2VxOiAzLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6ICdjaGF0L3RydW5jYXRlZCcsIHR1cm5JZDogJ3R1cm4tdHIxJyB9LFxuXHRcdH0pO1xuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiBpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90cnVuY2F0ZWQnKSk7XG5cblx0XHQvLyBTZW5kIGEgbmV3IHR1cm4gYWZ0ZXIgdHJ1bmNhdGlvblxuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi10cjMnLCAnaGVsbG8nLCA0KTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpKTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHVybnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHVybnNbMF0uaWQsICd0dXJuLXRyMScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50dXJuc1sxXS5pZCwgJ3R1cm4tdHIzJyk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gRm9yayAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHRlc3QoJ2ZvcmsgY3JlYXRlcyBhIG5ldyBzZXNzaW9uIHdpdGggc291cmNlIGhpc3RvcnknLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDE1XzAwMCk7XG5cblx0XHRjb25zdCBzZXNzaW9uVXJpID0gYXdhaXQgY3JlYXRlQW5kU3Vic2NyaWJlU2Vzc2lvbihjbGllbnQsICd0ZXN0LWZvcmsnKTtcblxuXHRcdC8vIENyZWF0ZSB0d28gdHVybnNcblx0XHRkaXNwYXRjaFR1cm5TdGFydGVkKGNsaWVudCwgc2Vzc2lvblVyaSwgJ3R1cm4tZjEnLCAnaGVsbG8nLCAxKTtcblx0XHRhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpICYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ6IHN0cmluZyB9KS50dXJuSWQgPT09ICd0dXJuLWYxJyk7XG5cblx0XHRjbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdGRpc3BhdGNoVHVyblN0YXJ0ZWQoY2xpZW50LCBzZXNzaW9uVXJpLCAndHVybi1mMicsICdoZWxsbycsIDIpO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykgJiYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZCA9PT0gJ3R1cm4tZjInKTtcblxuXHRcdGNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cblx0XHQvLyBGb3JrIGF0IHR1cm4tZjEgKGtlZXAgdHVybnMgdXAgdG8gYW5kIGluY2x1ZGluZyB0dXJuLWYxKVxuXHRcdGNvbnN0IGZvcmtlZFNlc3Npb25VcmkgPSBuZXh0U2Vzc2lvblVyaSgpO1xuXHRcdGF3YWl0IGNsaWVudC5jYWxsKCdjcmVhdGVTZXNzaW9uJywge1xuXHRcdFx0Y2hhbm5lbDogZm9ya2VkU2Vzc2lvblVyaSxcblx0XHRcdHByb3ZpZGVyOiAnbW9jaycsXG5cdFx0XHRmb3JrOiB7IHNlc3Npb246IHNlc3Npb25VcmksIHR1cm5JZDogJ3R1cm4tZjEnIH0sXG5cdFx0fSk7XG5cblx0XHRjb25zdCBhZGRlZE5vdGlmID0gYXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0bi5tZXRob2QgPT09ICdyb290L3Nlc3Npb25BZGRlZCdcblx0XHQpO1xuXHRcdGNvbnN0IGFkZGVkU2Vzc2lvbiA9IGFkZGVkTm90aWYucGFyYW1zIGFzIFNlc3Npb25BZGRlZFBhcmFtcztcblxuXHRcdC8vIFN1YnNjcmliZSBcdTIwMTQgZm9ya2VkIHNlc3Npb24gc2hvdWxkIGhhdmUgMSB0dXJuXG5cdFx0Y29uc3Qgc3RhdGUgPSBhd2FpdCBmZXRjaFNlc3Npb25XaXRoQ2hhdChjbGllbnQsIGFkZGVkU2Vzc2lvbi5zdW1tYXJ5LnJlc291cmNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUubGlmZWN5Y2xlLCAncmVhZHknKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHVybnMubGVuZ3RoLCAxLCAnZm9ya2VkIHNlc3Npb24gc2hvdWxkIGhhdmUgMSB0dXJuJyk7XG5cblx0XHQvLyBTb3VyY2Ugc2Vzc2lvbiBzaG91bGQgYmUgdW5hZmZlY3RlZFxuXHRcdGNvbnN0IHNvdXJjZVN0YXRlID0gYXdhaXQgZmV0Y2hTZXNzaW9uV2l0aENoYXQoY2xpZW50LCBzZXNzaW9uVXJpKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc291cmNlU3RhdGUudHVybnMubGVuZ3RoLCAyKTtcblx0fSk7XG5cblx0dGVzdCgnZm9yayB3aXRoIGludmFsaWQgdHVybiBJRCByZXR1cm5zIGVycm9yJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxMF8wMDApO1xuXG5cdFx0Y29uc3Qgc2Vzc2lvblVyaSA9IGF3YWl0IGNyZWF0ZUFuZFN1YnNjcmliZVNlc3Npb24oY2xpZW50LCAndGVzdC1mb3JrLWludmFsaWQnKTtcblxuXHRcdGxldCBnb3RFcnJvciA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdFx0Y2hhbm5lbDogbmV4dFNlc3Npb25VcmkoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0Zm9yazogeyBzZXNzaW9uOiBzZXNzaW9uVXJpLCB0dXJuSWQ6ICdub25leGlzdGVudC10dXJuJyB9LFxuXHRcdFx0fSk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRnb3RFcnJvciA9IHRydWU7XG5cdFx0fVxuXHRcdGFzc2VydC5vayhnb3RFcnJvciwgJ3Nob3VsZCBnZXQgZXJyb3IgZm9yIGludmFsaWQgZm9yayB0dXJuIElEJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Zvcmsgd2l0aCBpbnZhbGlkIHNvdXJjZSBzZXNzaW9uIHJldHVybnMgZXJyb3InLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDEwXzAwMCk7XG5cblx0XHRhd2FpdCBjbGllbnQuY2FsbCgnaW5pdGlhbGl6ZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkksIHByb3RvY29sVmVyc2lvbnM6IFtQUk9UT0NPTF9WRVJTSU9OXSwgY2xpZW50SWQ6ICd0ZXN0LWZvcmstbm8tc291cmNlJyB9KTtcblxuXHRcdGxldCBnb3RFcnJvciA9IGZhbHNlO1xuXHRcdHRyeSB7XG5cdFx0XHRhd2FpdCBjbGllbnQuY2FsbCgnY3JlYXRlU2Vzc2lvbicsIHtcblx0XHRcdFx0Y2hhbm5lbDogbmV4dFNlc3Npb25VcmkoKSxcblx0XHRcdFx0cHJvdmlkZXI6ICdtb2NrJyxcblx0XHRcdFx0Zm9yazogeyBzZXNzaW9uOiAnbW9jazovL25vbmV4aXN0ZW50LXNlc3Npb24nLCB0dXJuSWQ6ICd0dXJuLTEnIH0sXG5cdFx0XHR9KTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdGdvdEVycm9yID0gdHJ1ZTtcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKGdvdEVycm9yLCAnc2hvdWxkIGdldCBlcnJvciBmb3IgaW52YWxpZCBmb3JrIHNvdXJjZSBzZXNzaW9uJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBRXhCLFNBQVMsa0JBQXdIO0FBQ2pJLFNBQVMsd0JBQXdCO0FBRWpDLFNBQVMsYUFBYSxvQkFBb0Isa0JBQWtCLHNCQUFvRDtBQUNoSCxTQUFTLHVCQUF1QjtBQUNoQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUVBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQUVQLE1BQU0sOENBQXlDLFdBQVk7QUFFMUQsTUFBSTtBQUNKLE1BQUk7QUFFSixhQUFXLGlCQUFrQjtBQUM1QixTQUFLLFFBQVEsMkJBQTJCLE1BQVEsR0FBTSxDQUFDO0FBQ3ZELGFBQVMsTUFBTSxZQUFZO0FBQUEsRUFDNUIsQ0FBQztBQUVELGdCQUFjLGlCQUFrQjtBQUMvQixTQUFLLFFBQVEsMkJBQTJCLEtBQVEsR0FBTSxDQUFDO0FBQ3ZELFVBQU0sV0FBVyxNQUFNO0FBQUEsRUFDeEIsQ0FBQztBQUVELFFBQU0saUJBQWtCO0FBQ3ZCLFNBQUssUUFBUSxHQUFNO0FBQ25CLGFBQVMsSUFBSSxtQkFBbUIsT0FBTyxJQUFJO0FBQzNDLFVBQU0sT0FBTyxRQUFRO0FBQUEsRUFDdEIsQ0FBQztBQUVELFdBQVMsV0FBWTtBQUNwQixXQUFPLE1BQU07QUFBQSxFQUNkLENBQUM7QUFJRCxPQUFLLHNEQUFzRCxpQkFBa0I7QUFDNUUsU0FBSyxRQUFRLEdBQU07QUFFbkIsVUFBTSxhQUFhLE1BQU0sMEJBQTBCLFFBQVEsbUJBQW1CO0FBRTlFLFdBQU8sT0FBTyxrQkFBa0I7QUFBQSxN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
