import assert from "assert";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { SessionConfigKey } from "../../../../common/sessionConfigKeys.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { TerminalClaimKind } from "../../../../common/state/protocol/state.js";
import {
  buildDefaultChatUri,
  MessageKind,
  PendingMessageKind,
  ROOT_STATE_URI,
  SessionStatus
} from "../../../../common/state/sessionState.js";
import { createRealSession } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification } from "../../serverIntegrationTestHelpers.js";
import { conformanceTest } from "./e2eTestContext.js";
function defineStateOperationsTests(context) {
  const { config, createdSessions, tempDirs } = context;
  async function createSession(prefix) {
    const workspace = mkdtempSync(join(tmpdir(), `ahp-state-${prefix}-`));
    tempDirs.push(workspace);
    const clientId = `${prefix}-${config.provider}`;
    const sessionUri = await createRealSession(context.client, config, clientId, createdSessions, URI.file(workspace));
    return { sessionUri, chatUri: buildDefaultChatUri(sessionUri), clientId, workspace };
  }
  async function sessionState(sessionUri) {
    const result = await context.client.call("subscribe", { channel: sessionUri });
    return result.snapshot.state;
  }
  async function chatState(chatUri) {
    const result = await context.client.call("subscribe", { channel: chatUri });
    return result.snapshot.state;
  }
  async function terminalState(terminalUri) {
    const result = await context.client.call("subscribe", { channel: terminalUri });
    return result.snapshot.state;
  }
  function terminalText(state) {
    return state.content.map((part) => part.type === "command" ? part.output : part.value).join("");
  }
  async function dispatchAndWait(channel, clientSeq, action) {
    context.client.clearReceived();
    context.client.dispatch({ channel, clientSeq, action });
    await context.client.waitForNotification(
      (n) => isActionNotification(n, action.type) && getActionEnvelope(n).channel === channel
    );
  }
  function userMessage(text) {
    return { text, origin: { kind: MessageKind.User } };
  }
  async function createTerminal(prefix) {
    const { sessionUri, clientId, workspace } = await createSession(prefix);
    const terminalUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
    await context.client.call("createTerminal", {
      channel: terminalUri,
      claim: { kind: TerminalClaimKind.Client, clientId },
      name: `E2E ${prefix}`,
      cwd: URI.file(workspace).toString(),
      cols: 90,
      rows: 30
    });
    await context.client.call("subscribe", { channel: terminalUri });
    return { sessionUri, terminalUri, clientId, workspace };
  }
  async function disposeTerminal(terminalUri) {
    await context.client.call("disposeTerminal", { channel: terminalUri });
  }
  async function withTerminal(prefix, run) {
    const terminal = await createTerminal(prefix);
    try {
      return await run(terminal);
    } finally {
      await disposeTerminal(terminal.terminalUri);
    }
  }
  conformanceTest(context, "client title change updates session state", async function() {
    const { sessionUri } = await createSession("title-change");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionTitleChanged, title: "Direct AHP Title" });
    assert.strictEqual((await sessionState(sessionUri)).title, "Direct AHP Title");
  });
  conformanceTest(context, "marking a session read sets the read status flag", async function() {
    const { sessionUri } = await createSession("read-set");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });
    assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsRead);
  });
  conformanceTest(context, "marking a session unread clears the read status flag", async function() {
    const { sessionUri } = await createSession("read-clear");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsReadChanged, isRead: true });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsReadChanged, isRead: false });
    assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsRead, 0);
  });
  conformanceTest(context, "archiving a session sets the archived status flag", async function() {
    const { sessionUri } = await createSession("archive-set");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    assert.ok((await sessionState(sessionUri)).status & SessionStatus.IsArchived);
  });
  conformanceTest(context, "unarchiving a session clears the archived status flag", async function() {
    const { sessionUri } = await createSession("archive-clear");
    await dispatchAndWait(sessionUri, 1, { type: ActionType.SessionIsArchivedChanged, isArchived: true });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionIsArchivedChanged, isArchived: false });
    assert.strictEqual((await sessionState(sessionUri)).status & SessionStatus.IsArchived, 0);
  });
  conformanceTest(context, "session config changes merge with existing values", async function() {
    const { sessionUri } = await createSession("config-merge");
    const before = await sessionState(sessionUri);
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.AutoApprove]: "assisted" }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
      ...before.config?.values,
      [SessionConfigKey.AutoApprove]: "assisted"
    });
  });
  conformanceTest(context, "session config replacement drops previous values", async function() {
    const { sessionUri } = await createSession("config-replace");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionConfigChanged,
      config: { [SessionConfigKey.AutoApprove]: "default" },
      replace: true
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).config?.values, {
      [SessionConfigKey.AutoApprove]: "default"
    });
  });
  conformanceTest(context, "active client set adds a session participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-add");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Coverage Client", tools: [] }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, [{
      clientId,
      displayName: "Coverage Client",
      tools: []
    }]);
  });
  conformanceTest(context, "active client set replaces an existing participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-update");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Before", tools: [] }
    });
    await dispatchAndWait(sessionUri, 2, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "After", tools: [] }
    });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients.map((client) => client.displayName), ["After"]);
  });
  conformanceTest(context, "active client removal removes the session participant", async function() {
    const { sessionUri, clientId } = await createSession("active-client-remove");
    await dispatchAndWait(sessionUri, 1, {
      type: ActionType.SessionActiveClientSet,
      activeClient: { clientId, displayName: "Coverage Client", tools: [] }
    });
    await dispatchAndWait(sessionUri, 2, { type: ActionType.SessionActiveClientRemoved, clientId });
    assert.deepStrictEqual((await sessionState(sessionUri)).activeClients, []);
  });
  conformanceTest(context, "draft change stores a user message", async function() {
    const { chatUri } = await createSession("draft-set");
    const draft = userMessage("draft text");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft });
    assert.deepStrictEqual((await chatState(chatUri)).draft, draft);
  });
  conformanceTest(context, "draft change replaces the previous message", async function() {
    const { chatUri } = await createSession("draft-replace");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage("before") });
    await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged, draft: userMessage("after") });
    assert.deepStrictEqual((await chatState(chatUri)).draft, userMessage("after"));
  });
  conformanceTest(context, "clearing a draft removes it from chat state", async function() {
    const { chatUri } = await createSession("draft-clear");
    await dispatchAndWait(chatUri, 1, { type: ActionType.ChatDraftChanged, draft: userMessage("draft") });
    await dispatchAndWait(chatUri, 2, { type: ActionType.ChatDraftChanged });
    assert.strictEqual((await chatState(chatUri)).draft, void 0);
  });
  conformanceTest(context, "a message queued on an idle chat is promoted straight into a turn", async function() {
    const { chatUri } = await createSession("queue-promote");
    context.client.clearReceived();
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatPendingMessageSet,
      kind: PendingMessageKind.Queued,
      id: "queued-1",
      message: userMessage("/rename Queue Promoted")
    });
    const started = await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnStarted") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.queuedMessageId === "queued-1",
      3e4
    );
    const turnId = getActionEnvelope(started).action.turnId;
    await context.client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chatUri && getActionEnvelope(n).action.turnId === turnId,
      6e4
    );
    assert.deepStrictEqual((await chatState(chatUri)).queuedMessages ?? [], []);
  });
  conformanceTest(context, "removing a missing queued message leaves chat state unchanged", async function() {
    const { chatUri } = await createSession("queue-remove-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatPendingMessageRemoved,
      kind: PendingMessageKind.Queued,
      id: "missing"
    });
    assert.strictEqual((await chatState(chatUri)).queuedMessages, void 0);
  });
  conformanceTest(context, "reordering a missing queue leaves chat state unchanged", async function() {
    const { chatUri } = await createSession("queue-reorder-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatQueuedMessagesReordered,
      order: ["missing"]
    });
    assert.strictEqual((await chatState(chatUri)).queuedMessages, void 0);
  });
  conformanceTest(context, "truncating at a missing turn leaves history unchanged", async function() {
    const { chatUri } = await createSession("truncate-missing");
    const before = await chatState(chatUri);
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatTruncated,
      turnId: "missing-turn"
    });
    assert.deepStrictEqual((await chatState(chatUri)).turns, before.turns);
  });
  conformanceTest(context, "cancelling a missing turn leaves the chat idle", async function() {
    const { chatUri } = await createSession("cancel-missing");
    await dispatchAndWait(chatUri, 1, {
      type: ActionType.ChatTurnCancelled,
      turnId: "missing-turn",
      duration: 0
    });
    const state = await chatState(chatUri);
    assert.deepStrictEqual(
      { activeTurn: state.activeTurn, turns: state.turns, status: state.status },
      { activeTurn: void 0, turns: [], status: SessionStatus.Idle }
    );
  });
  conformanceTest(context, "createTerminal exposes requested dimensions cwd and claim", async function() {
    await withTerminal("terminal-create", async ({ terminalUri, clientId, workspace }) => {
      const state = await terminalState(terminalUri);
      assert.deepStrictEqual({
        cwd: state.cwd,
        cols: state.cols,
        rows: state.rows,
        claim: state.claim
      }, {
        cwd: URI.file(workspace).fsPath,
        cols: 90,
        rows: 30,
        claim: { kind: TerminalClaimKind.Client, clientId }
      });
    });
  });
  conformanceTest(context, "terminal resize updates terminal dimensions", async function() {
    await withTerminal("terminal-resize", async ({ terminalUri }) => {
      await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalResized, cols: 120, rows: 40 });
      const state = await terminalState(terminalUri);
      assert.deepStrictEqual({ cols: state.cols, rows: state.rows }, { cols: 120, rows: 40 });
    });
  });
  conformanceTest(context, "terminal title change is broadcast", async function() {
    await withTerminal("terminal-title", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalTitleChanged, title: "Renamed Terminal" }
      });
      const notification = await context.client.waitForNotification(
        (n) => isActionNotification(n, "terminal/titleChanged") && getActionEnvelope(n).channel === terminalUri && getActionEnvelope(n).action.title === "Renamed Terminal"
      );
      assert.strictEqual(getActionEnvelope(notification).action.title, "Renamed Terminal");
    });
  });
  conformanceTest(context, "terminal claim can transfer from the client to the session", async function() {
    await withTerminal("terminal-claim", async ({ sessionUri, terminalUri }) => {
      const claim = { kind: TerminalClaimKind.Session, session: sessionUri };
      await dispatchAndWait(terminalUri, 1, { type: ActionType.TerminalClaimed, claim });
      assert.deepStrictEqual((await terminalState(terminalUri)).claim, claim);
    });
  });
  conformanceTest(context, "terminal input reaches the shell and produces output", async function() {
    await withTerminal("terminal-input", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: 'node -p "40+2"\r' }
      });
      let streamedOutput = "";
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "terminal/data") || getActionEnvelope(n).channel !== terminalUri) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        streamedOutput += action.data;
        return /(?:^|\D)42(?:\D|$)/.test(streamedOutput);
      }, 3e4);
      const output = terminalText(await terminalState(terminalUri));
      assert.match(output, /(?:^|\D)42(?:\D|$)/);
    });
  });
  conformanceTest(context, "clearing a terminal drops the scrollback the client already saw", async function() {
    await withTerminal("terminal-clear", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: `node -p "'CLEAR_'+'MARKER'"\r` }
      });
      let streamedOutput = "";
      await context.client.waitForNotification((n) => {
        if (!isActionNotification(n, "terminal/data") || getActionEnvelope(n).channel !== terminalUri) {
          return false;
        }
        streamedOutput += getActionEnvelope(n).action.data;
        return streamedOutput.includes("CLEAR_MARKER");
      }, 3e4);
      const before = terminalText(await terminalState(terminalUri));
      await dispatchAndWait(terminalUri, 2, { type: ActionType.TerminalCleared });
      const after = terminalText(await terminalState(terminalUri));
      assert.deepStrictEqual({
        markerBeforeClear: before.includes("CLEAR_MARKER"),
        markerAfterClear: after.includes("CLEAR_MARKER")
      }, {
        markerBeforeClear: true,
        markerAfterClear: false
      });
    });
  });
  conformanceTest(context, "a terminal whose shell exits reports its exit code", async function() {
    await withTerminal("terminal-exit", async ({ terminalUri }) => {
      context.client.clearReceived();
      context.client.dispatch({
        channel: terminalUri,
        clientSeq: 1,
        action: { type: ActionType.TerminalInput, data: "exit\r" }
      });
      const exited = await context.client.waitForNotification(
        (n) => isActionNotification(n, "terminal/exited") && getActionEnvelope(n).channel === terminalUri,
        3e4
      );
      const action = getActionEnvelope(exited).action;
      assert.deepStrictEqual({
        reportedExitCode: typeof action.exitCode,
        stateMatchesNotification: (await terminalState(terminalUri)).exitCode === action.exitCode
      }, {
        reportedExitCode: "number",
        stateMatchesNotification: true
      });
    });
  });
  conformanceTest(context, "root state tracks terminals as they appear and disappear", async function() {
    await withTerminal("terminal-root", async ({ clientId, workspace }) => {
      await context.client.call("subscribe", { channel: ROOT_STATE_URI });
      context.client.clearReceived();
      function terminalsIn(n) {
        return getActionEnvelope(n).action.terminals ?? [];
      }
      const observedUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
      let observedCreated = false;
      try {
        await context.client.call("createTerminal", {
          channel: observedUri,
          claim: { kind: TerminalClaimKind.Client, clientId },
          name: "E2E terminal-root-observed",
          cwd: URI.file(workspace).toString(),
          cols: 90,
          rows: 30
        });
        observedCreated = true;
        await context.client.waitForNotification(
          (n) => isActionNotification(n, "root/terminalsChanged") && terminalsIn(n).some((terminal) => terminal.resource === observedUri),
          3e4
        );
        await disposeTerminal(observedUri);
        observedCreated = false;
        await context.client.waitForNotification(
          (n) => isActionNotification(n, "root/terminalsChanged") && !terminalsIn(n).some((terminal) => terminal.resource === observedUri),
          3e4
        );
      } finally {
        if (observedCreated) {
          await disposeTerminal(observedUri);
        }
      }
    });
  });
  conformanceTest(context, "disposeTerminal removes the terminal from root state", async function() {
    const { terminalUri } = await createTerminal("terminal-dispose");
    await disposeTerminal(terminalUri);
    const root = await context.client.call("subscribe", { channel: ROOT_STATE_URI });
    const state = root.snapshot.state;
    assert.strictEqual(state.terminals?.some((terminal) => terminal.resource === terminalUri) ?? false, false);
  });
  conformanceTest(context, "creating a duplicate terminal resource is rejected", async function() {
    await withTerminal("terminal-duplicate", async ({ terminalUri, clientId }) => {
      await assert.rejects(context.client.call("createTerminal", {
        channel: terminalUri,
        claim: { kind: TerminalClaimKind.Client, clientId }
      }));
    });
  });
  conformanceTest(context, "subscribing to an unknown terminal is rejected", async function() {
    await createSession("terminal-unknown");
    const terminalUri = URI.from({ scheme: "agenthost-terminal", authority: "e2e", path: `/${generateUuid()}` }).toString();
    await assert.rejects(context.client.call("subscribe", { channel: terminalUri }));
  });
}
export {
  defineStateOperationsTests
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHN1aXRlc1xcc3RhdGVPcGVyYXRpb25zU3VpdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBta2R0ZW1wU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IFNlc3Npb25Db25maWdLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc2Vzc2lvbkNvbmZpZ0tleXMuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBTdGF0ZUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgdHlwZSB7IFN1YnNjcmliZVJlc3VsdCB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9jb21tYW5kcy5qcyc7XG5pbXBvcnQgeyBUZXJtaW5hbENsYWltS2luZCwgdHlwZSBUZXJtaW5hbENsYWltIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcbmltcG9ydCB7XG5cdGJ1aWxkRGVmYXVsdENoYXRVcmksXG5cdE1lc3NhZ2VLaW5kLFxuXHRQZW5kaW5nTWVzc2FnZUtpbmQsXG5cdFJPT1RfU1RBVEVfVVJJLFxuXHRTZXNzaW9uU3RhdHVzLFxuXHR0eXBlIENoYXRTdGF0ZSxcblx0dHlwZSBNZXNzYWdlLFxuXHR0eXBlIFJvb3RTdGF0ZSxcblx0dHlwZSBTZXNzaW9uU3RhdGUsXG5cdHR5cGUgVGVybWluYWxTdGF0ZSxcbn0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiB9IGZyb20gJy4uL2hhcm5lc3MvYWdlbnRIb3N0RTJFVGVzdEhhcm5lc3MuanMnO1xuaW1wb3J0IHsgZ2V0QWN0aW9uRW52ZWxvcGUsIGlzQWN0aW9uTm90aWZpY2F0aW9uIH0gZnJvbSAnLi4vLi4vc2VydmVySW50ZWdyYXRpb25UZXN0SGVscGVycy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFocE5vdGlmaWNhdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uUHJvdG9jb2wuanMnO1xuaW1wb3J0IHsgY29uZm9ybWFuY2VUZXN0LCB0eXBlIElBZ2VudEhvc3RFMkVUZXN0Q29udGV4dCB9IGZyb20gJy4vZTJlVGVzdENvbnRleHQuanMnO1xuXG5leHBvcnQgZnVuY3Rpb24gZGVmaW5lU3RhdGVPcGVyYXRpb25zVGVzdHMoY29udGV4dDogSUFnZW50SG9zdEUyRVRlc3RDb250ZXh0KTogdm9pZCB7XG5cdGNvbnN0IHsgY29uZmlnLCBjcmVhdGVkU2Vzc2lvbnMsIHRlbXBEaXJzIH0gPSBjb250ZXh0O1xuXG5cdGFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNlc3Npb24ocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHsgc2Vzc2lvblVyaTogc3RyaW5nOyBjaGF0VXJpOiBzdHJpbmc7IGNsaWVudElkOiBzdHJpbmc7IHdvcmtzcGFjZTogc3RyaW5nIH0+IHtcblx0XHRjb25zdCB3b3Jrc3BhY2UgPSBta2R0ZW1wU3luYyhqb2luKHRtcGRpcigpLCBgYWhwLXN0YXRlLSR7cHJlZml4fS1gKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3Jrc3BhY2UpO1xuXHRcdGNvbnN0IGNsaWVudElkID0gYCR7cHJlZml4fS0ke2NvbmZpZy5wcm92aWRlcn1gO1xuXHRcdGNvbnN0IHNlc3Npb25VcmkgPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjb250ZXh0LmNsaWVudCwgY29uZmlnLCBjbGllbnRJZCwgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3Jrc3BhY2UpKTtcblx0XHRyZXR1cm4geyBzZXNzaW9uVXJpLCBjaGF0VXJpOiBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb25VcmkpLCBjbGllbnRJZCwgd29ya3NwYWNlIH07XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaTogc3RyaW5nKTogUHJvbWlzZTxTZXNzaW9uU3RhdGU+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogc2Vzc2lvblVyaSB9KTtcblx0XHRyZXR1cm4gcmVzdWx0LnNuYXBzaG90IS5zdGF0ZSBhcyBTZXNzaW9uU3RhdGU7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiBjaGF0U3RhdGUoY2hhdFVyaTogc3RyaW5nKTogUHJvbWlzZTxDaGF0U3RhdGU+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogY2hhdFVyaSB9KTtcblx0XHRyZXR1cm4gcmVzdWx0LnNuYXBzaG90IS5zdGF0ZSBhcyBDaGF0U3RhdGU7XG5cdH1cblxuXHRhc3luYyBmdW5jdGlvbiB0ZXJtaW5hbFN0YXRlKHRlcm1pbmFsVXJpOiBzdHJpbmcpOiBQcm9taXNlPFRlcm1pbmFsU3RhdGU+IHtcblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdGVybWluYWxVcmkgfSk7XG5cdFx0cmV0dXJuIHJlc3VsdC5zbmFwc2hvdCEuc3RhdGUgYXMgVGVybWluYWxTdGF0ZTtcblx0fVxuXG5cdC8qKiBUaGUgdGVybWluYWwncyB2aXNpYmxlIHRleHQsIGZsYXR0ZW5pbmcgY29tbWFuZCBwYXJ0cyBhbmQgcmF3IG91dHB1dCBhbGlrZS4gKi9cblx0ZnVuY3Rpb24gdGVybWluYWxUZXh0KHN0YXRlOiBUZXJtaW5hbFN0YXRlKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gc3RhdGUuY29udGVudFxuXHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQudHlwZSA9PT0gJ2NvbW1hbmQnID8gcGFydC5vdXRwdXQgOiBwYXJ0LnZhbHVlKVxuXHRcdFx0LmpvaW4oJycpO1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gZGlzcGF0Y2hBbmRXYWl0KGNoYW5uZWw6IHN0cmluZywgY2xpZW50U2VxOiBudW1iZXIsIGFjdGlvbjogU3RhdGVBY3Rpb24pOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goeyBjaGFubmVsLCBjbGllbnRTZXEsIGFjdGlvbiB9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIGFjdGlvbi50eXBlKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhbm5lbCxcblx0XHQpO1xuXHR9XG5cblx0ZnVuY3Rpb24gdXNlck1lc3NhZ2UodGV4dDogc3RyaW5nKTogTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9O1xuXHR9XG5cblx0YXN5bmMgZnVuY3Rpb24gY3JlYXRlVGVybWluYWwocHJlZml4OiBzdHJpbmcpOiBQcm9taXNlPHsgc2Vzc2lvblVyaTogc3RyaW5nOyB0ZXJtaW5hbFVyaTogc3RyaW5nOyBjbGllbnRJZDogc3RyaW5nOyB3b3Jrc3BhY2U6IHN0cmluZyB9PiB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpLCBjbGllbnRJZCwgd29ya3NwYWNlIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKHByZWZpeCk7XG5cdFx0Y29uc3QgdGVybWluYWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC10ZXJtaW5hbCcsIGF1dGhvcml0eTogJ2UyZScsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlVGVybWluYWwnLCB7XG5cdFx0XHRjaGFubmVsOiB0ZXJtaW5hbFVyaSxcblx0XHRcdGNsYWltOiB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLkNsaWVudCwgY2xpZW50SWQgfSxcblx0XHRcdG5hbWU6IGBFMkUgJHtwcmVmaXh9YCxcblx0XHRcdGN3ZDogVVJJLmZpbGUod29ya3NwYWNlKS50b1N0cmluZygpLFxuXHRcdFx0Y29sczogOTAsXG5cdFx0XHRyb3dzOiAzMCxcblx0XHR9KTtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdGVybWluYWxVcmkgfSk7XG5cdFx0cmV0dXJuIHsgc2Vzc2lvblVyaSwgdGVybWluYWxVcmksIGNsaWVudElkLCB3b3Jrc3BhY2UgfTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGRpc3Bvc2VUZXJtaW5hbCh0ZXJtaW5hbFVyaTogc3RyaW5nKTogUHJvbWlzZTx2b2lkPiB7XG5cdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnZGlzcG9zZVRlcm1pbmFsJywgeyBjaGFubmVsOiB0ZXJtaW5hbFVyaSB9KTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIHdpdGhUZXJtaW5hbDxUPihcblx0XHRwcmVmaXg6IHN0cmluZyxcblx0XHRydW46ICh0ZXJtaW5hbDogQXdhaXRlZDxSZXR1cm5UeXBlPHR5cGVvZiBjcmVhdGVUZXJtaW5hbD4+KSA9PiBQcm9taXNlPFQ+LFxuXHQpOiBQcm9taXNlPFQ+IHtcblx0XHRjb25zdCB0ZXJtaW5hbCA9IGF3YWl0IGNyZWF0ZVRlcm1pbmFsKHByZWZpeCk7XG5cdFx0dHJ5IHtcblx0XHRcdHJldHVybiBhd2FpdCBydW4odGVybWluYWwpO1xuXHRcdH0gZmluYWxseSB7XG5cdFx0XHRhd2FpdCBkaXNwb3NlVGVybWluYWwodGVybWluYWwudGVybWluYWxVcmkpO1xuXHRcdH1cblx0fVxuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY2xpZW50IHRpdGxlIGNoYW5nZSB1cGRhdGVzIHNlc3Npb24gc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCd0aXRsZS1jaGFuZ2UnKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvblRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdEaXJlY3QgQUhQIFRpdGxlJyB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS50aXRsZSwgJ0RpcmVjdCBBSFAgVGl0bGUnKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdtYXJraW5nIGEgc2Vzc2lvbiByZWFkIHNldHMgdGhlIHJlYWQgc3RhdHVzIGZsYWcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdyZWFkLXNldCcpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNSZWFkQ2hhbmdlZCwgaXNSZWFkOiB0cnVlIH0pO1xuXG5cdFx0YXNzZXJ0Lm9rKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLnN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdtYXJraW5nIGEgc2Vzc2lvbiB1bnJlYWQgY2xlYXJzIHRoZSByZWFkIHN0YXR1cyBmbGFnJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncmVhZC1jbGVhcicpO1xuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAyLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzUmVhZENoYW5nZWQsIGlzUmVhZDogZmFsc2UgfSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc1JlYWQsIDApO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FyY2hpdmluZyBhIHNlc3Npb24gc2V0cyB0aGUgYXJjaGl2ZWQgc3RhdHVzIGZsYWcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdhcmNoaXZlLXNldCcpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHsgdHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uSXNBcmNoaXZlZENoYW5nZWQsIGlzQXJjaGl2ZWQ6IHRydWUgfSk7XG5cblx0XHRhc3NlcnQub2soKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5Jc0FyY2hpdmVkKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd1bmFyY2hpdmluZyBhIHNlc3Npb24gY2xlYXJzIHRoZSBhcmNoaXZlZCBzdGF0dXMgZmxhZycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2FyY2hpdmUtY2xlYXInKTtcblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwgeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZCwgaXNBcmNoaXZlZDogdHJ1ZSB9KTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAyLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbklzQXJjaGl2ZWRDaGFuZ2VkLCBpc0FyY2hpdmVkOiBmYWxzZSB9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5zdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQsIDApO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ3Nlc3Npb24gY29uZmlnIGNoYW5nZXMgbWVyZ2Ugd2l0aCBleGlzdGluZyB2YWx1ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjb25maWctbWVyZ2UnKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQ29uZmlnQ2hhbmdlZCxcblx0XHRcdGNvbmZpZzogeyBbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdhc3Npc3RlZCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuY29uZmlnPy52YWx1ZXMsIHtcblx0XHRcdC4uLmJlZm9yZS5jb25maWc/LnZhbHVlcyxcblx0XHRcdFtTZXNzaW9uQ29uZmlnS2V5LkF1dG9BcHByb3ZlXTogJ2Fzc2lzdGVkJyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdzZXNzaW9uIGNvbmZpZyByZXBsYWNlbWVudCBkcm9wcyBwcmV2aW91cyB2YWx1ZXMnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBzZXNzaW9uVXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdjb25maWctcmVwbGFjZScpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsXG5cdFx0XHRjb25maWc6IHsgW1Nlc3Npb25Db25maWdLZXkuQXV0b0FwcHJvdmVdOiAnZGVmYXVsdCcgfSxcblx0XHRcdHJlcGxhY2U6IHRydWUsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmNvbmZpZz8udmFsdWVzLCB7XG5cdFx0XHRbU2Vzc2lvbkNvbmZpZ0tleS5BdXRvQXBwcm92ZV06ICdkZWZhdWx0Jyxcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhY3RpdmUgY2xpZW50IHNldCBhZGRzIGEgc2Vzc2lvbiBwYXJ0aWNpcGFudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIGNsaWVudElkIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdhY3RpdmUtY2xpZW50LWFkZCcpO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZCwgZGlzcGxheU5hbWU6ICdDb3ZlcmFnZSBDbGllbnQnLCB0b29sczogW10gfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IHNlc3Npb25TdGF0ZShzZXNzaW9uVXJpKSkuYWN0aXZlQ2xpZW50cywgW3tcblx0XHRcdGNsaWVudElkLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdDb3ZlcmFnZSBDbGllbnQnLFxuXHRcdFx0dG9vbHM6IFtdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhY3RpdmUgY2xpZW50IHNldCByZXBsYWNlcyBhbiBleGlzdGluZyBwYXJ0aWNpcGFudCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHNlc3Npb25VcmksIGNsaWVudElkIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdhY3RpdmUtY2xpZW50LXVwZGF0ZScpO1xuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25BY3RpdmVDbGllbnRTZXQsXG5cdFx0XHRhY3RpdmVDbGllbnQ6IHsgY2xpZW50SWQsIGRpc3BsYXlOYW1lOiAnQmVmb3JlJywgdG9vbHM6IFtdIH0sXG5cdFx0fSk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoc2Vzc2lvblVyaSwgMiwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5TZXNzaW9uQWN0aXZlQ2xpZW50U2V0LFxuXHRcdFx0YWN0aXZlQ2xpZW50OiB7IGNsaWVudElkLCBkaXNwbGF5TmFtZTogJ0FmdGVyJywgdG9vbHM6IFtdIH0sXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBzZXNzaW9uU3RhdGUoc2Vzc2lvblVyaSkpLmFjdGl2ZUNsaWVudHMubWFwKGNsaWVudCA9PiBjbGllbnQuZGlzcGxheU5hbWUpLCBbJ0FmdGVyJ10pO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2FjdGl2ZSBjbGllbnQgcmVtb3ZhbCByZW1vdmVzIHRoZSBzZXNzaW9uIHBhcnRpY2lwYW50JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgc2Vzc2lvblVyaSwgY2xpZW50SWQgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2FjdGl2ZS1jbGllbnQtcmVtb3ZlJyk7XG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KHNlc3Npb25VcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdGFjdGl2ZUNsaWVudDogeyBjbGllbnRJZCwgZGlzcGxheU5hbWU6ICdDb3ZlcmFnZSBDbGllbnQnLCB0b29sczogW10gfSxcblx0XHR9KTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChzZXNzaW9uVXJpLCAyLCB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFJlbW92ZWQsIGNsaWVudElkIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgc2Vzc2lvblN0YXRlKHNlc3Npb25VcmkpKS5hY3RpdmVDbGllbnRzLCBbXSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZHJhZnQgY2hhbmdlIHN0b3JlcyBhIHVzZXIgbWVzc2FnZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2RyYWZ0LXNldCcpO1xuXHRcdGNvbnN0IGRyYWZ0ID0gdXNlck1lc3NhZ2UoJ2RyYWZ0IHRleHQnKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSkpLmRyYWZ0LCBkcmFmdCk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZHJhZnQgY2hhbmdlIHJlcGxhY2VzIHRoZSBwcmV2aW91cyBtZXNzYWdlJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbignZHJhZnQtcmVwbGFjZScpO1xuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQ6IHVzZXJNZXNzYWdlKCdiZWZvcmUnKSB9KTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAyLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQ6IHVzZXJNZXNzYWdlKCdhZnRlcicpIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpKS5kcmFmdCwgdXNlck1lc3NhZ2UoJ2FmdGVyJykpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2NsZWFyaW5nIGEgZHJhZnQgcmVtb3ZlcyBpdCBmcm9tIGNoYXQgc3RhdGUnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdkcmFmdC1jbGVhcicpO1xuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERyYWZ0Q2hhbmdlZCwgZHJhZnQ6IHVzZXJNZXNzYWdlKCdkcmFmdCcpIH0pO1xuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0RHJhZnRDaGFuZ2VkIH0pO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSkpLmRyYWZ0LCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHRjb25mb3JtYW5jZVRlc3QoY29udGV4dCwgJ2EgbWVzc2FnZSBxdWV1ZWQgb24gYW4gaWRsZSBjaGF0IGlzIHByb21vdGVkIHN0cmFpZ2h0IGludG8gYSB0dXJuJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncXVldWUtcHJvbW90ZScpO1xuXHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblxuXHRcdC8vIFF1ZXVlaW5nIGV4aXN0cyB0byBob2xkIHdvcmsgd2hpbGUgYSB0dXJuIGlzIHJ1bm5pbmcuIFdpdGggbm90aGluZ1xuXHRcdC8vIHJ1bm5pbmcgdGhlcmUgaXMgbm90aGluZyB0byB3YWl0IGZvciwgc28gdGhlIGhvc3QgbXVzdCBzdGFydCB0aGVcblx0XHQvLyBtZXNzYWdlIHJhdGhlciB0aGFuIHBhcmsgaXQgXHUyMDE0IG90aGVyd2lzZSBhIHF1ZXVlZCBtZXNzYWdlIG9uIGFuIGlkbGVcblx0XHQvLyBjaGF0IHdvdWxkIG5ldmVyIHJ1biBhdCBhbGwuIGAvcmVuYW1lYCBrZWVwcyB0aGUgcHJvbW90ZWQgdHVybiBpbnNpZGVcblx0XHQvLyB0aGUgaG9zdCdzIGxvY2FsLWNvbW1hbmQgZGlzcGF0Y2hlciwgd2l0aCBubyBzaGVsbCBhbmQgbm8gbW9kZWwuXG5cdFx0YXdhaXQgZGlzcGF0Y2hBbmRXYWl0KGNoYXRVcmksIDEsIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFBlbmRpbmdNZXNzYWdlU2V0LFxuXHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlF1ZXVlZCxcblx0XHRcdGlkOiAncXVldWVkLTEnLFxuXHRcdFx0bWVzc2FnZTogdXNlck1lc3NhZ2UoJy9yZW5hbWUgUXVldWUgUHJvbW90ZWQnKSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0YXJ0ZWQgPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5TdGFydGVkJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRVcmlcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBxdWV1ZWRNZXNzYWdlSWQ/OiBzdHJpbmcgfSkucXVldWVkTWVzc2FnZUlkID09PSAncXVldWVkLTEnLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdFx0Y29uc3QgdHVybklkID0gKGdldEFjdGlvbkVudmVsb3BlKHN0YXJ0ZWQpLmFjdGlvbiBhcyB7IHR1cm5JZDogc3RyaW5nIH0pLnR1cm5JZDtcblx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0VXJpXG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkOiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQ2MF8wMDAsXG5cdFx0KTtcblxuXHRcdC8vIFByb21vdGlvbiBoYXMgdG8gYmUgYXRvbWljIHdpdGggcmVtb3ZhbDogYSBtZXNzYWdlIGxlZnQgaW4gdGhlIHF1ZXVlXG5cdFx0Ly8gYWZ0ZXIgYmVpbmcgc3RhcnRlZCB3b3VsZCBydW4gYSBzZWNvbmQgdGltZSBvbiB0aGUgbmV4dCBpZGxlIGV2ZW50LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGNoYXRTdGF0ZShjaGF0VXJpKSkucXVldWVkTWVzc2FnZXMgPz8gW10sIFtdKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZW1vdmluZyBhIG1pc3NpbmcgcXVldWVkIG1lc3NhZ2UgbGVhdmVzIGNoYXQgc3RhdGUgdW5jaGFuZ2VkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGNvbnN0IHsgY2hhdFVyaSB9ID0gYXdhaXQgY3JlYXRlU2Vzc2lvbigncXVldWUtcmVtb3ZlLW1pc3NpbmcnKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVJlbW92ZWQsXG5cdFx0XHRraW5kOiBQZW5kaW5nTWVzc2FnZUtpbmQuUXVldWVkLFxuXHRcdFx0aWQ6ICdtaXNzaW5nJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpKS5xdWV1ZWRNZXNzYWdlcywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyZW9yZGVyaW5nIGEgbWlzc2luZyBxdWV1ZSBsZWF2ZXMgY2hhdCBzdGF0ZSB1bmNoYW5nZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0Y29uc3QgeyBjaGF0VXJpIH0gPSBhd2FpdCBjcmVhdGVTZXNzaW9uKCdxdWV1ZS1yZW9yZGVyLW1pc3NpbmcnKTtcblxuXHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdChjaGF0VXJpLCAxLCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRRdWV1ZWRNZXNzYWdlc1Jlb3JkZXJlZCxcblx0XHRcdG9yZGVyOiBbJ21pc3NpbmcnXSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgoYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpKS5xdWV1ZWRNZXNzYWdlcywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd0cnVuY2F0aW5nIGF0IGEgbWlzc2luZyB0dXJuIGxlYXZlcyBoaXN0b3J5IHVuY2hhbmdlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ3RydW5jYXRlLW1pc3NpbmcnKTtcblx0XHRjb25zdCBiZWZvcmUgPSBhd2FpdCBjaGF0U3RhdGUoY2hhdFVyaSk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoY2hhdFVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHJ1bmNhdGVkLFxuXHRcdFx0dHVybklkOiAnbWlzc2luZy10dXJuJyxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGF3YWl0IGNoYXRTdGF0ZShjaGF0VXJpKSkudHVybnMsIGJlZm9yZS50dXJucyk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY2FuY2VsbGluZyBhIG1pc3NpbmcgdHVybiBsZWF2ZXMgdGhlIGNoYXQgaWRsZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IGNoYXRVcmkgfSA9IGF3YWl0IGNyZWF0ZVNlc3Npb24oJ2NhbmNlbC1taXNzaW5nJyk7XG5cblx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQoY2hhdFVyaSwgMSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCxcblx0XHRcdHR1cm5JZDogJ21pc3NpbmctdHVybicsXG5cdFx0XHRkdXJhdGlvbjogMCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgY2hhdFN0YXRlKGNoYXRVcmkpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHR7IGFjdGl2ZVR1cm46IHN0YXRlLmFjdGl2ZVR1cm4sIHR1cm5zOiBzdGF0ZS50dXJucywgc3RhdHVzOiBzdGF0ZS5zdGF0dXMgfSxcblx0XHRcdHsgYWN0aXZlVHVybjogdW5kZWZpbmVkLCB0dXJuczogW10sIHN0YXR1czogU2Vzc2lvblN0YXR1cy5JZGxlIH0sXG5cdFx0KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjcmVhdGVUZXJtaW5hbCBleHBvc2VzIHJlcXVlc3RlZCBkaW1lbnNpb25zIGN3ZCBhbmQgY2xhaW0nLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlcm1pbmFsKCd0ZXJtaW5hbC1jcmVhdGUnLCBhc3luYyAoeyB0ZXJtaW5hbFVyaSwgY2xpZW50SWQsIHdvcmtzcGFjZSB9KSA9PiB7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGN3ZDogc3RhdGUuY3dkLFxuXHRcdFx0XHRjb2xzOiBzdGF0ZS5jb2xzLFxuXHRcdFx0XHRyb3dzOiBzdGF0ZS5yb3dzLFxuXHRcdFx0XHRjbGFpbTogc3RhdGUuY2xhaW0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGN3ZDogVVJJLmZpbGUod29ya3NwYWNlKS5mc1BhdGgsXG5cdFx0XHRcdGNvbHM6IDkwLFxuXHRcdFx0XHRyb3dzOiAzMCxcblx0XHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZCB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAndGVybWluYWwgcmVzaXplIHVwZGF0ZXMgdGVybWluYWwgZGltZW5zaW9ucycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLXJlc2l6ZScsIGFzeW5jICh7IHRlcm1pbmFsVXJpIH0pID0+IHtcblx0XHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdCh0ZXJtaW5hbFVyaSwgMSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsUmVzaXplZCwgY29sczogMTIwLCByb3dzOiA0MCB9KTtcblx0XHRcdGNvbnN0IHN0YXRlID0gYXdhaXQgdGVybWluYWxTdGF0ZSh0ZXJtaW5hbFVyaSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgY29sczogc3RhdGUuY29scywgcm93czogc3RhdGUucm93cyB9LCB7IGNvbHM6IDEyMCwgcm93czogNDAgfSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAndGVybWluYWwgdGl0bGUgY2hhbmdlIGlzIGJyb2FkY2FzdCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLXRpdGxlJywgYXN5bmMgKHsgdGVybWluYWxVcmkgfSkgPT4ge1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRjaGFubmVsOiB0ZXJtaW5hbFVyaSxcblx0XHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0XHRhY3Rpb246IHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbFRpdGxlQ2hhbmdlZCwgdGl0bGU6ICdSZW5hbWVkIFRlcm1pbmFsJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Rlcm1pbmFsL3RpdGxlQ2hhbmdlZCcpXG5cdFx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IHRlcm1pbmFsVXJpXG5cdFx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0aXRsZTogc3RyaW5nIH0pLnRpdGxlID09PSAnUmVuYW1lZCBUZXJtaW5hbCcsXG5cdFx0XHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKChnZXRBY3Rpb25FbnZlbG9wZShub3RpZmljYXRpb24pLmFjdGlvbiBhcyB7IHRpdGxlOiBzdHJpbmcgfSkudGl0bGUsICdSZW5hbWVkIFRlcm1pbmFsJyk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAndGVybWluYWwgY2xhaW0gY2FuIHRyYW5zZmVyIGZyb20gdGhlIGNsaWVudCB0byB0aGUgc2Vzc2lvbicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLWNsYWltJywgYXN5bmMgKHsgc2Vzc2lvblVyaSwgdGVybWluYWxVcmkgfSkgPT4ge1xuXHRcdFx0Y29uc3QgY2xhaW06IFRlcm1pbmFsQ2xhaW0gPSB7IGtpbmQ6IFRlcm1pbmFsQ2xhaW1LaW5kLlNlc3Npb24sIHNlc3Npb246IHNlc3Npb25VcmkgfTtcblx0XHRcdGF3YWl0IGRpc3BhdGNoQW5kV2FpdCh0ZXJtaW5hbFVyaSwgMSwgeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsQ2xhaW1lZCwgY2xhaW0gfSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKChhd2FpdCB0ZXJtaW5hbFN0YXRlKHRlcm1pbmFsVXJpKSkuY2xhaW0sIGNsYWltKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICd0ZXJtaW5hbCBpbnB1dCByZWFjaGVzIHRoZSBzaGVsbCBhbmQgcHJvZHVjZXMgb3V0cHV0JywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtaW5wdXQnLCBhc3luYyAoeyB0ZXJtaW5hbFVyaSB9KSA9PiB7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQsIGRhdGE6ICdub2RlIC1wIFwiNDArMlwiXFxyJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRsZXQgc3RyZWFtZWRPdXRwdXQgPSAnJztcblx0XHRcdGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRcdGlmICghaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Rlcm1pbmFsL2RhdGEnKSB8fCBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSB0ZXJtaW5hbFVyaSkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBkYXRhOiBzdHJpbmcgfTtcblx0XHRcdFx0c3RyZWFtZWRPdXRwdXQgKz0gYWN0aW9uLmRhdGE7XG5cdFx0XHRcdHJldHVybiAvKD86XnxcXEQpNDIoPzpcXER8JCkvLnRlc3Qoc3RyZWFtZWRPdXRwdXQpO1xuXHRcdFx0fSwgMzBfMDAwKTtcblx0XHRcdGNvbnN0IG91dHB1dCA9IHRlcm1pbmFsVGV4dChhd2FpdCB0ZXJtaW5hbFN0YXRlKHRlcm1pbmFsVXJpKSk7XG5cdFx0XHRhc3NlcnQubWF0Y2gob3V0cHV0LCAvKD86XnxcXEQpNDIoPzpcXER8JCkvKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdjbGVhcmluZyBhIHRlcm1pbmFsIGRyb3BzIHRoZSBzY3JvbGxiYWNrIHRoZSBjbGllbnQgYWxyZWFkeSBzYXcnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlcm1pbmFsKCd0ZXJtaW5hbC1jbGVhcicsIGFzeW5jICh7IHRlcm1pbmFsVXJpIH0pID0+IHtcblx0XHRcdGNvbnRleHQuY2xpZW50LmNsZWFyUmVjZWl2ZWQoKTtcblx0XHRcdGNvbnRleHQuY2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0Y2hhbm5lbDogdGVybWluYWxVcmksXG5cdFx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuVGVybWluYWxJbnB1dCwgZGF0YTogJ25vZGUgLXAgXCJcXCdDTEVBUl9cXCcrXFwnTUFSS0VSXFwnXCJcXHInIH0sXG5cdFx0XHR9KTtcblx0XHRcdGxldCBzdHJlYW1lZE91dHB1dCA9ICcnO1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbihuID0+IHtcblx0XHRcdFx0aWYgKCFpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAndGVybWluYWwvZGF0YScpIHx8IGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IHRlcm1pbmFsVXJpKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHN0cmVhbWVkT3V0cHV0ICs9IChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyByZWFkb25seSBkYXRhOiBzdHJpbmcgfSkuZGF0YTtcblx0XHRcdFx0cmV0dXJuIHN0cmVhbWVkT3V0cHV0LmluY2x1ZGVzKCdDTEVBUl9NQVJLRVInKTtcblx0XHRcdH0sIDMwXzAwMCk7XG5cdFx0XHRjb25zdCBiZWZvcmUgPSB0ZXJtaW5hbFRleHQoYXdhaXQgdGVybWluYWxTdGF0ZSh0ZXJtaW5hbFVyaSkpO1xuXG5cdFx0XHRhd2FpdCBkaXNwYXRjaEFuZFdhaXQodGVybWluYWxVcmksIDIsIHsgdHlwZTogQWN0aW9uVHlwZS5UZXJtaW5hbENsZWFyZWQgfSk7XG5cblx0XHRcdC8vIFRoZSBzY3JvbGxiYWNrIGxpdmVzIGluIGhvc3Qgc3RhdGUsIG5vdCBqdXN0IGluIHRoZSBjbGllbnQncyB2aWV3LFxuXHRcdFx0Ly8gc28gY2xlYXJpbmcgbXVzdCBkcm9wIGl0IGZvciBldmVyeSBzdWJzY3JpYmVyIGluY2x1ZGluZyBvbmUgdGhhdFxuXHRcdFx0Ly8gc3Vic2NyaWJlcyBsYXRlci5cblx0XHRcdC8vXG5cdFx0XHQvLyBBc3NlcnRpbmcgdGhlIGJ1ZmZlciBpcyAqZW1wdHkqIHdvdWxkIGJlIHdyb25nOiB0aGUgc2hlbGwgaXMgbGl2ZVxuXHRcdFx0Ly8gYW5kIHJlZHJhd3MgaXRzIHByb21wdCBhcyBzb29uIGFzIHRoZSBzY3JlZW4gaXMgY2xlYXJlZCwgc28gYnl0ZXNcblx0XHRcdC8vIGxlZ2l0aW1hdGVseSBhcnJpdmUgYWZ0ZXIgdGhlIGNsZWFyIHJlZHVjZXMuIFdoYXQgaGFzIHRvIGJlIGdvbmVcblx0XHRcdC8vIGlzIHRoZSBvdXRwdXQgdGhlIGNsaWVudCBoYWQgYWxyZWFkeSBhY2N1bXVsYXRlZC5cblx0XHRcdGNvbnN0IGFmdGVyID0gdGVybWluYWxUZXh0KGF3YWl0IHRlcm1pbmFsU3RhdGUodGVybWluYWxVcmkpKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRtYXJrZXJCZWZvcmVDbGVhcjogYmVmb3JlLmluY2x1ZGVzKCdDTEVBUl9NQVJLRVInKSxcblx0XHRcdFx0bWFya2VyQWZ0ZXJDbGVhcjogYWZ0ZXIuaW5jbHVkZXMoJ0NMRUFSX01BUktFUicpLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRtYXJrZXJCZWZvcmVDbGVhcjogdHJ1ZSxcblx0XHRcdFx0bWFya2VyQWZ0ZXJDbGVhcjogZmFsc2UsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdhIHRlcm1pbmFsIHdob3NlIHNoZWxsIGV4aXRzIHJlcG9ydHMgaXRzIGV4aXQgY29kZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCB3aXRoVGVybWluYWwoJ3Rlcm1pbmFsLWV4aXQnLCBhc3luYyAoeyB0ZXJtaW5hbFVyaSB9KSA9PiB7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5jbGVhclJlY2VpdmVkKCk7XG5cdFx0XHRjb250ZXh0LmNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRjbGllbnRTZXE6IDEsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlRlcm1pbmFsSW5wdXQsIGRhdGE6ICdleGl0XFxyJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGV4aXRlZCA9IGF3YWl0IGNvbnRleHQuY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAndGVybWluYWwvZXhpdGVkJykgJiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gdGVybWluYWxVcmksXG5cdFx0XHRcdDMwXzAwMCxcblx0XHRcdCk7XG5cblx0XHRcdC8vIFRoZSBleGl0IGNvZGUgaXRzZWxmIGlzIHRoZSBzaGVsbCdzLCBub3QgdGhlIGhvc3Qncywgc28gb25seSBpdHNcblx0XHRcdC8vIHByZXNlbmNlIGFuZCBpdHMgYXJyaXZhbCBpbiBzdGF0ZSBhcmUgY29udHJhY3R1YWwuXG5cdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShleGl0ZWQpLmFjdGlvbiBhcyB7IGV4aXRDb2RlPzogbnVtYmVyIH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cmVwb3J0ZWRFeGl0Q29kZTogdHlwZW9mIGFjdGlvbi5leGl0Q29kZSxcblx0XHRcdFx0c3RhdGVNYXRjaGVzTm90aWZpY2F0aW9uOiAoYXdhaXQgdGVybWluYWxTdGF0ZSh0ZXJtaW5hbFVyaSkpLmV4aXRDb2RlID09PSBhY3Rpb24uZXhpdENvZGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJlcG9ydGVkRXhpdENvZGU6ICdudW1iZXInLFxuXHRcdFx0XHRzdGF0ZU1hdGNoZXNOb3RpZmljYXRpb246IHRydWUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblx0fSk7XG5cblx0Y29uZm9ybWFuY2VUZXN0KGNvbnRleHQsICdyb290IHN0YXRlIHRyYWNrcyB0ZXJtaW5hbHMgYXMgdGhleSBhcHBlYXIgYW5kIGRpc2FwcGVhcicsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHQvLyBUaGUgZmlyc3QgdGVybWluYWwgYWxzbyBlc3RhYmxpc2hlcyB0aGUgY29ubmVjdGlvbjsgcm9vdCBjYW4gb25seSBiZVxuXHRcdC8vIHN1YnNjcmliZWQgb25jZSB0aGUgY2xpZW50IGhhcyBoYW5kc2hha2VkLlxuXHRcdGF3YWl0IHdpdGhUZXJtaW5hbCgndGVybWluYWwtcm9vdCcsIGFzeW5jICh7IGNsaWVudElkLCB3b3Jrc3BhY2UgfSkgPT4ge1xuXHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbDxTdWJzY3JpYmVSZXN1bHQ+KCdzdWJzY3JpYmUnLCB7IGNoYW5uZWw6IFJPT1RfU1RBVEVfVVJJIH0pO1xuXHRcdFx0Y29udGV4dC5jbGllbnQuY2xlYXJSZWNlaXZlZCgpO1xuXG5cdFx0XHRmdW5jdGlvbiB0ZXJtaW5hbHNJbihuOiBBaHBOb3RpZmljYXRpb24pOiByZWFkb25seSB7IHJlc291cmNlOiBzdHJpbmcgfVtdIHtcblx0XHRcdFx0cmV0dXJuIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0ZXJtaW5hbHM/OiByZWFkb25seSB7IHJlc291cmNlOiBzdHJpbmcgfVtdIH0pLnRlcm1pbmFscyA/PyBbXTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gUm9vdCBpcyBob3cgYSBjbGllbnQgZGlzY292ZXJzIHRlcm1pbmFscyBpdCBkaWQgbm90IGNyZWF0ZSBpdHNlbGYsIHNvXG5cdFx0XHQvLyBpdCBoYXMgdG8gYmUgdG9sZCBvbiBib3RoIGVkZ2VzLCBub3Qgb25seSBvbiBjcmVhdGlvbi5cblx0XHRcdGNvbnN0IG9ic2VydmVkVXJpID0gVVJJLmZyb20oeyBzY2hlbWU6ICdhZ2VudGhvc3QtdGVybWluYWwnLCBhdXRob3JpdHk6ICdlMmUnLCBwYXRoOiBgLyR7Z2VuZXJhdGVVdWlkKCl9YCB9KS50b1N0cmluZygpO1xuXHRcdFx0bGV0IG9ic2VydmVkQ3JlYXRlZCA9IGZhbHNlO1xuXHRcdFx0dHJ5IHtcblx0XHRcdFx0YXdhaXQgY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlVGVybWluYWwnLCB7XG5cdFx0XHRcdFx0Y2hhbm5lbDogb2JzZXJ2ZWRVcmksXG5cdFx0XHRcdFx0Y2xhaW06IHsga2luZDogVGVybWluYWxDbGFpbUtpbmQuQ2xpZW50LCBjbGllbnRJZCB9LFxuXHRcdFx0XHRcdG5hbWU6ICdFMkUgdGVybWluYWwtcm9vdC1vYnNlcnZlZCcsXG5cdFx0XHRcdFx0Y3dkOiBVUkkuZmlsZSh3b3Jrc3BhY2UpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0Y29sczogOTAsXG5cdFx0XHRcdFx0cm93czogMzAsXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRvYnNlcnZlZENyZWF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAncm9vdC90ZXJtaW5hbHNDaGFuZ2VkJylcblx0XHRcdFx0XHQmJiB0ZXJtaW5hbHNJbihuKS5zb21lKHRlcm1pbmFsID0+IHRlcm1pbmFsLnJlc291cmNlID09PSBvYnNlcnZlZFVyaSksXG5cdFx0XHRcdFx0MzBfMDAwLFxuXHRcdFx0XHQpO1xuXG5cdFx0XHRcdGF3YWl0IGRpc3Bvc2VUZXJtaW5hbChvYnNlcnZlZFVyaSk7XG5cdFx0XHRcdG9ic2VydmVkQ3JlYXRlZCA9IGZhbHNlO1xuXHRcdFx0XHRhd2FpdCBjb250ZXh0LmNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAncm9vdC90ZXJtaW5hbHNDaGFuZ2VkJylcblx0XHRcdFx0XHQmJiAhdGVybWluYWxzSW4obikuc29tZSh0ZXJtaW5hbCA9PiB0ZXJtaW5hbC5yZXNvdXJjZSA9PT0gb2JzZXJ2ZWRVcmkpLFxuXHRcdFx0XHRcdDMwXzAwMCxcblx0XHRcdFx0KTtcblx0XHRcdH0gZmluYWxseSB7XG5cdFx0XHRcdGlmIChvYnNlcnZlZENyZWF0ZWQpIHtcblx0XHRcdFx0XHRhd2FpdCBkaXNwb3NlVGVybWluYWwob2JzZXJ2ZWRVcmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnZGlzcG9zZVRlcm1pbmFsIHJlbW92ZXMgdGhlIHRlcm1pbmFsIGZyb20gcm9vdCBzdGF0ZScsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRjb25zdCB7IHRlcm1pbmFsVXJpIH0gPSBhd2FpdCBjcmVhdGVUZXJtaW5hbCgndGVybWluYWwtZGlzcG9zZScpO1xuXG5cdFx0YXdhaXQgZGlzcG9zZVRlcm1pbmFsKHRlcm1pbmFsVXJpKTtcblxuXHRcdGNvbnN0IHJvb3QgPSBhd2FpdCBjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogUk9PVF9TVEFURV9VUkkgfSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSByb290LnNuYXBzaG90IS5zdGF0ZSBhcyBSb290U3RhdGU7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRlcm1pbmFscz8uc29tZSh0ZXJtaW5hbCA9PiB0ZXJtaW5hbC5yZXNvdXJjZSA9PT0gdGVybWluYWxVcmkpID8/IGZhbHNlLCBmYWxzZSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnY3JlYXRpbmcgYSBkdXBsaWNhdGUgdGVybWluYWwgcmVzb3VyY2UgaXMgcmVqZWN0ZWQnLCBhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0YXdhaXQgd2l0aFRlcm1pbmFsKCd0ZXJtaW5hbC1kdXBsaWNhdGUnLCBhc3luYyAoeyB0ZXJtaW5hbFVyaSwgY2xpZW50SWQgfSkgPT4ge1xuXHRcdFx0YXdhaXQgYXNzZXJ0LnJlamVjdHMoY29udGV4dC5jbGllbnQuY2FsbCgnY3JlYXRlVGVybWluYWwnLCB7XG5cdFx0XHRcdGNoYW5uZWw6IHRlcm1pbmFsVXJpLFxuXHRcdFx0XHRjbGFpbTogeyBraW5kOiBUZXJtaW5hbENsYWltS2luZC5DbGllbnQsIGNsaWVudElkIH0sXG5cdFx0XHR9KSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdGNvbmZvcm1hbmNlVGVzdChjb250ZXh0LCAnc3Vic2NyaWJpbmcgdG8gYW4gdW5rbm93biB0ZXJtaW5hbCBpcyByZWplY3RlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHRhd2FpdCBjcmVhdGVTZXNzaW9uKCd0ZXJtaW5hbC11bmtub3duJyk7XG5cdFx0Y29uc3QgdGVybWluYWxVcmkgPSBVUkkuZnJvbSh7IHNjaGVtZTogJ2FnZW50aG9zdC10ZXJtaW5hbCcsIGF1dGhvcml0eTogJ2UyZScsIHBhdGg6IGAvJHtnZW5lcmF0ZVV1aWQoKX1gIH0pLnRvU3RyaW5nKCk7XG5cblx0XHRhd2FpdCBhc3NlcnQucmVqZWN0cyhjb250ZXh0LmNsaWVudC5jYWxsPFN1YnNjcmliZVJlc3VsdD4oJ3N1YnNjcmliZScsIHsgY2hhbm5lbDogdGVybWluYWxVcmkgfSkpO1xuXHR9KTtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxZQUFZO0FB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
