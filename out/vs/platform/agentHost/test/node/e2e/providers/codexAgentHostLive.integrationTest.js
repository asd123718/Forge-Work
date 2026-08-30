import assert from "assert";
import { mkdtempSync, readFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { ActionType } from "../../../../common/state/sessionActions.js";
import { buildDefaultChatUri, ChatInputResponseKind, MessageKind, PendingMessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolResultContentType } from "../../../../common/state/sessionState.js";
import { createRealSession, dispatchTurn, getAcceptedAnswers } from "../harness/agentHostE2ETestHarness.js";
import { getActionEnvelope, isActionNotification, startRealServer, stopServer, TestProtocolClient } from "../../serverIntegrationTestHelpers.js";
import { CODEX_CONFIG, CODEX_SDK_ROOT } from "./codexTestConfiguration.js";
const REAL_CODEX_ENABLED = process.env["AGENT_HOST_REAL_CODEX"] === "1";
(REAL_CODEX_ENABLED && !!CODEX_SDK_ROOT ? suite : suite.skip)("Agent Host E2E \u2014 Codex - steering", function() {
  let server;
  let client;
  const createdSessions = [];
  const tempDirs = [];
  let cleanupClientSeq = 1e4;
  async function chatState(chat) {
    const result = await client.call("subscribe", { channel: chat });
    return result.snapshot.state;
  }
  async function markdownResponse(chat, turnId) {
    const turn = (await chatState(chat)).turns.find((turn2) => turn2.id === turnId);
    return turn?.responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content).join("") ?? "";
  }
  async function cancelActiveTurnIfNeeded(session) {
    const chat = buildDefaultChatUri(session);
    const state = await chatState(chat);
    const turnId = state.activeTurn?.id;
    if (!turnId) {
      return;
    }
    client.dispatch({
      channel: chat,
      clientSeq: cleanupClientSeq++,
      action: {
        type: ActionType.ChatTurnCancelled,
        turnId,
        duration: 0
      }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, ActionType.ChatTurnCancelled) && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      3e4
    );
  }
  setup(async function() {
    this.timeout(6e4);
    server = await startRealServer({ codexSdkRoot: CODEX_CONFIG.codexSdkRoot });
    client = new TestProtocolClient(server.port);
    await client.connect();
  });
  teardown(async function() {
    this.timeout(18e4);
    const cleanupFailures = [];
    for (const session of createdSessions) {
      try {
        await cancelActiveTurnIfNeeded(session);
      } catch (error) {
        cleanupFailures.push(`failed to cancel active turn for ${session}: ${error instanceof Error ? error.message : String(error)}`);
      }
      try {
        await client.call("disposeSession", { channel: session }, 3e4);
      } catch (error) {
        cleanupFailures.push(`failed to dispose ${session}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    createdSessions.length = 0;
    try {
      client.close();
    } catch (error) {
      cleanupFailures.push(`failed to close client: ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await stopServer(server);
    } catch (error) {
      cleanupFailures.push(`failed to stop server: ${error instanceof Error ? error.message : String(error)}`);
    }
    for (const dir of tempDirs) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      } catch (error) {
        cleanupFailures.push(`failed to remove ${dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    tempDirs.length = 0;
    if (cleanupFailures.length > 0) {
      if (this.currentTest?.state === "failed") {
        process.stdout.write(`[agent-host-e2e] Codex live cleanup reported secondary errors:
${cleanupFailures.map((failure) => `[agent-host-e2e] # ${failure}`).join("\n")}
`);
        return;
      }
      throw new Error(`Codex live test cleanup failed:
${cleanupFailures.join("\n")}`);
    }
  });
  test("mid-turn steering clears pending state without getting stuck", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-steer-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "steer-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Count slowly from 1 to 40. Put each number on its own line and think briefly between each.", 1);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/responsePart") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      9e4
    );
    const steerText = "IMPORTANT: also include the exact word PINEAPPLE in your reply.";
    client.dispatch({
      channel: chat,
      clientSeq: 2,
      action: {
        type: ActionType.ChatPendingMessageSet,
        kind: PendingMessageKind.Steering,
        id: "steer-1",
        message: { text: steerText, origin: { kind: MessageKind.User } }
      }
    });
    await client.waitForNotification((n) => {
      if (isActionNotification(n, "chat/turnStarted")) {
        if (getActionEnvelope(n).channel !== chat) {
          return false;
        }
        const action = getActionEnvelope(n).action;
        if (action.message?.text === steerText) {
          return true;
        }
        return false;
      }
      return isActionNotification(n, "chat/pendingMessageRemoved") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.id === "steer-1" && getActionEnvelope(n).action.kind === PendingMessageKind.Steering;
    }, 12e4);
    await client.waitForNotification(
      (n) => isActionNotification(n, "chat/turnComplete") && getActionEnvelope(n).channel === chat && getActionEnvelope(n).action.turnId === turnId,
      12e4
    );
    const snapshot = await chatState(chat);
    assert.strictEqual(snapshot.steeringMessage, void 0);
  });
  test("client tool is registered and invoked end-to-end", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-tool-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "tool-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "tool-client",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call the get_magic_word tool and then tell me the exact magic word it returned.", 2);
    const seen = /* @__PURE__ */ new Set();
    let toolCallId;
    let sawToolCall = false;
    let completed = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "get_magic_word") {
          toolCallId = a.toolCallId;
          sawToolCall = true;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
          completed = true;
          client.dispatch({
            channel: chat,
            clientSeq: nextSeq++,
            action: {
              type: ActionType.ChatToolCallComplete,
              turnId,
              toolCallId: a.toolCallId,
              result: { success: true, pastTenseMessage: "Got the magic word", content: [{ type: ToolResultContentType.Text, text: "XYLOPHONE" }] }
            }
          });
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during client-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      sawToolCall,
      completed,
      responseIncludesResult: (await markdownResponse(chat, turnId)).includes("XYLOPHONE")
    }, {
      sawToolCall: true,
      completed: true,
      responseIncludesResult: true
    });
  });
  test("client tool registered after session creation is still invoked", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-tool2-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "tool-client-2", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: {
        type: ActionType.SessionActiveClientSet,
        activeClient: {
          clientId: "tool-client-2",
          tools: [{
            name: "get_magic_word",
            description: "Returns the secret magic word. Call this when asked for the magic word.",
            inputSchema: { type: "object", properties: {}, required: [] }
          }]
        }
      }
    });
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call the get_magic_word tool and then tell me the exact magic word it returned.", 2);
    const seen = /* @__PURE__ */ new Set();
    let toolCallId;
    let completed = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "get_magic_word") {
          toolCallId = a.toolCallId;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolCallId === toolCallId && !completed) {
          completed = true;
          client.dispatch({
            channel: chat,
            clientSeq: nextSeq++,
            action: {
              type: ActionType.ChatToolCallComplete,
              turnId,
              toolCallId: a.toolCallId,
              result: { success: true, pastTenseMessage: "Got the magic word", content: [{ type: ToolResultContentType.Text, text: "XYLOPHONE" }] }
            }
          });
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during late client-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      completed,
      responseIncludesResult: (await markdownResponse(chat, turnId)).includes("XYLOPHONE")
    }, {
      completed: true,
      responseIncludesResult: true
    });
  });
  test("server tool (listComments) is registered and executed in-process", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-servertool-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "servertool-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, "Call your listComments tool to list existing comments, then tell me exactly how many comments there are.", 1);
    const seen = /* @__PURE__ */ new Set();
    let sawServerToolCall = false;
    let serverToolHadClientContributor = false;
    let serverToolCallId;
    let sawSuccessfulCompletion = false;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallComplete") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const a = getActionEnvelope(n).action;
        if (a.turnId === turnId && a.toolName === "listComments") {
          sawServerToolCall = true;
          serverToolCallId = a.toolCallId;
          serverToolHadClientContributor = a.contributor?.kind === "client";
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallComplete")) {
        const action = getActionEnvelope(n).action;
        if (action.turnId === turnId && action.toolCallId === serverToolCallId) {
          sawSuccessfulCompletion = action.result.success;
        }
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during server-tool test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.deepStrictEqual({
      sawServerToolCall,
      serverToolHadClientContributor,
      sawSuccessfulCompletion,
      responseReportsNoComments: /\b0\b|no comments/i.test(await markdownResponse(chat, turnId))
    }, {
      sawServerToolCall: true,
      serverToolHadClientContributor: false,
      sawSuccessfulCompletion: true,
      responseReportsNoComments: true
    });
  });
  test("file-change approval is surfaced and can be approved", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-fileapprove-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "fileapprove-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: { type: ActionType.SessionConfigChanged, config: { "codex.sandboxMode": "read-only", "codex.approvalPolicy": "on-request" } }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "session/configChanged") && getActionEnvelope(n).channel === session,
      3e4
    );
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, 'Create a new file named hello.txt containing exactly the text "hi" by editing the file (use your apply_patch/file-edit capability, not a shell command).', 2);
    const seen = /* @__PURE__ */ new Set();
    let sawPendingConfirmation = false;
    let sawSuccessfulFileEdit = false;
    let fileEditToolCallId;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/toolCallStart") || isActionNotification(x, "chat/toolCallReady") || isActionNotification(x, "chat/toolCallComplete") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 12e4);
      seen.add(n);
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during file-change approval test");
      }
      if (isActionNotification(n, "chat/toolCallStart")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel === chat && action.turnId === turnId && action.toolName === "file_edit") {
          fileEditToolCallId = action.toolCallId;
        }
        continue;
      }
      if (isActionNotification(n, "chat/toolCallReady")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId || action.toolCallId !== fileEditToolCallId || action.confirmed !== void 0) {
          continue;
        }
        sawPendingConfirmation = true;
        client.dispatch({
          channel: chat,
          clientSeq: nextSeq++,
          action: { type: ActionType.ChatToolCallConfirmed, turnId, toolCallId: action.toolCallId, approved: true, confirmed: ToolCallConfirmationReason.UserAction }
        });
        continue;
      }
      if (isActionNotification(n, "chat/toolCallComplete") || isActionNotification(n, "chat/turnComplete")) {
        const action = getActionEnvelope(n).action;
        if (getActionEnvelope(n).channel !== chat || action.turnId !== turnId) {
          continue;
        }
        if (isActionNotification(n, "chat/toolCallComplete") && action.toolCallId !== fileEditToolCallId) {
          continue;
        }
        if (isActionNotification(n, "chat/toolCallComplete")) {
          sawSuccessfulFileEdit = getActionEnvelope(n).action.result.success;
          continue;
        }
        break;
      }
    }
    assert.deepStrictEqual({
      sawPendingConfirmation,
      sawSuccessfulFileEdit,
      fileContents: readFileSync(join(workingDirectory, "hello.txt"), "utf8")
    }, {
      sawPendingConfirmation: true,
      sawSuccessfulFileEdit: true,
      fileContents: "hi"
    });
  });
  test("Plan mode (Agent Mode control) makes request_user_input reachable end-to-end", async function() {
    this.timeout(18e4);
    const workingDirectory = mkdtempSync(join(tmpdir(), "codex-planmode-"));
    tempDirs.push(workingDirectory);
    const session = await createRealSession(client, CODEX_CONFIG, "planmode-client", createdSessions, URI.file(workingDirectory));
    const chat = buildDefaultChatUri(session);
    client.dispatch({
      channel: session,
      clientSeq: 1,
      action: { type: ActionType.SessionConfigChanged, config: { mode: "plan" } }
    });
    await client.waitForNotification(
      (n) => isActionNotification(n, "session/configChanged") && getActionEnvelope(n).channel === session,
      3e4
    );
    const turnId = generateUuid();
    dispatchTurn(client, session, turnId, 'Use your request_user_input capability to ask me one question: "Which fruit?" with options Apple and Banana. After I answer, reply with the option I chose.', 2);
    const seen = /* @__PURE__ */ new Set();
    let sawInputRequest = false;
    let nextSeq = 3;
    while (true) {
      const n = await client.waitForNotification((x) => !seen.has(x) && (isActionNotification(x, "chat/inputRequested") || isActionNotification(x, "chat/turnComplete") || isActionNotification(x, "chat/error")), 15e4);
      seen.add(n);
      if (getActionEnvelope(n).channel !== chat) {
        continue;
      }
      if (isActionNotification(n, "chat/inputRequested")) {
        sawInputRequest = true;
        const action = getActionEnvelope(n).action;
        client.dispatch({
          channel: chat,
          clientSeq: nextSeq++,
          action: {
            type: ActionType.ChatInputCompleted,
            requestId: action.request.id,
            response: ChatInputResponseKind.Accept,
            answers: getAcceptedAnswers(action.request)
          }
        });
        continue;
      }
      if (isActionNotification(n, "chat/error")) {
        throw new Error("codex reported a turn error during plan-mode request_user_input test");
      }
      if (getActionEnvelope(n).action.turnId !== turnId) {
        continue;
      }
      break;
    }
    assert.ok(sawInputRequest, "switching to Plan mode should make request_user_input surface as chat/inputRequested");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxlMmVcXHByb3ZpZGVyc1xcY29kZXhBZ2VudEhvc3RMaXZlLmludGVncmF0aW9uVGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbi8qKlxuICogTGl2ZSwgbm9uLWRldGVybWluaXN0aWMgQ29kZXggc2NlbmFyaW9zIHRoYXQgZGVwZW5kIG9uIHJlYWwtdGltZSBhcHAtc2VydmVyIGJlaGF2aW9yLlxuICovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IG1rZHRlbXBTeW5jLCByZWFkRmlsZVN5bmMsIHJtU3luYyB9IGZyb20gJ2ZzJztcbmltcG9ydCB7IHRtcGRpciB9IGZyb20gJ29zJztcbmltcG9ydCB7IGpvaW4gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9wYXRoLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHR5cGUgeyBTdWJzY3JpYmVSZXN1bHQgfSBmcm9tICcuLi8uLi8uLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuaW1wb3J0IHsgYnVpbGREZWZhdWx0Q2hhdFVyaSwgQ2hhdElucHV0UmVzcG9uc2VLaW5kLCBNZXNzYWdlS2luZCwgUGVuZGluZ01lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIENoYXRJbnB1dFJlcXVlc3QsIHR5cGUgQ2hhdFN0YXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBjcmVhdGVSZWFsU2Vzc2lvbiwgZGlzcGF0Y2hUdXJuLCBnZXRBY2NlcHRlZEFuc3dlcnMgfSBmcm9tICcuLi9oYXJuZXNzL2FnZW50SG9zdEUyRVRlc3RIYXJuZXNzLmpzJztcbmltcG9ydCB7IGdldEFjdGlvbkVudmVsb3BlLCBpc0FjdGlvbk5vdGlmaWNhdGlvbiwgc3RhcnRSZWFsU2VydmVyLCBzdG9wU2VydmVyLCBUZXN0UHJvdG9jb2xDbGllbnQsIHR5cGUgSVNlcnZlckhhbmRsZSB9IGZyb20gJy4uLy4uL3NlcnZlckludGVncmF0aW9uVGVzdEhlbHBlcnMuanMnO1xuaW1wb3J0IHsgQ09ERVhfQ09ORklHLCBDT0RFWF9TREtfUk9PVCB9IGZyb20gJy4vY29kZXhUZXN0Q29uZmlndXJhdGlvbi5qcyc7XG5cbmNvbnN0IFJFQUxfQ09ERVhfRU5BQkxFRCA9IHByb2Nlc3MuZW52WydBR0VOVF9IT1NUX1JFQUxfQ09ERVgnXSA9PT0gJzEnO1xuXG4vLyBDb2RleC1zcGVjaWZpYyBzdGVlcmluZyBjb3ZlcmFnZS4gU3RlZXJpbmcgaXMgd2lyZWQgdmlhIGB0dXJuL3N0ZWVyYDsgdGhlXG4vLyBhZ2VudCBidWZmZXJzIHRoZSBtZXNzYWdlIGFuZCBwcm9tb3RlcyB0aGUgY29kZXggYHVzZXJNZXNzYWdlYCBlY2hvIGludG8gYVxuLy8gZnJlc2ggdmlzaWJsZSB0dXJuIChjbGVhcmluZyB0aGUgcGVuZGluZyBidWJibGUpLiBUaGVzZSBleGVyY2lzZSByZWFsLXRpbWUsXG4vLyBzdGF0ZWZ1bCBhcHAtc2VydmVyIGJlaGF2aW9ycyAobWlkLXR1cm4gc3RlZXJpbmcsIGxhdGUgdG9vbCByZWdpc3RyYXRpb24sXG4vLyB0cnVuY2F0ZSkgdGhhdCBhcmUgbm90IGRldGVybWluaXN0aWNhbGx5IHJlcHJvZHVjaWJsZSwgc28gdGhleSBydW4gb25seVxuLy8gYWdhaW5zdCB0aGUgbGl2ZSBhcHAtc2VydmVyIChgQUdFTlRfSE9TVF9SRUFMX0NPREVYPTFgKS5cbihSRUFMX0NPREVYX0VOQUJMRUQgJiYgISFDT0RFWF9TREtfUk9PVCA/IHN1aXRlIDogc3VpdGUuc2tpcCkoJ0FnZW50IEhvc3QgRTJFIFx1MjAxNCBDb2RleCAtIHN0ZWVyaW5nJywgZnVuY3Rpb24gKCkge1xuXG5cdGxldCBzZXJ2ZXI6IElTZXJ2ZXJIYW5kbGU7XG5cdGxldCBjbGllbnQ6IFRlc3RQcm90b2NvbENsaWVudDtcblx0Y29uc3QgY3JlYXRlZFNlc3Npb25zOiBzdHJpbmdbXSA9IFtdO1xuXHRjb25zdCB0ZW1wRGlyczogc3RyaW5nW10gPSBbXTtcblx0bGV0IGNsZWFudXBDbGllbnRTZXEgPSAxMF8wMDA7XG5cblx0YXN5bmMgZnVuY3Rpb24gY2hhdFN0YXRlKGNoYXQ6IHN0cmluZyk6IFByb21pc2U8Q2hhdFN0YXRlPiB7XG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgY2xpZW50LmNhbGw8U3Vic2NyaWJlUmVzdWx0Pignc3Vic2NyaWJlJywgeyBjaGFubmVsOiBjaGF0IH0pO1xuXHRcdHJldHVybiByZXN1bHQuc25hcHNob3QhLnN0YXRlIGFzIENoYXRTdGF0ZTtcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIG1hcmtkb3duUmVzcG9uc2UoY2hhdDogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG5cdFx0Y29uc3QgdHVybiA9IChhd2FpdCBjaGF0U3RhdGUoY2hhdCkpLnR1cm5zLmZpbmQodHVybiA9PiB0dXJuLmlkID09PSB0dXJuSWQpO1xuXHRcdHJldHVybiB0dXJuPy5yZXNwb25zZVBhcnRzXG5cdFx0XHQuZmlsdGVyKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKVxuXHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQuY29udGVudClcblx0XHRcdC5qb2luKCcnKSA/PyAnJztcblx0fVxuXG5cdGFzeW5jIGZ1bmN0aW9uIGNhbmNlbEFjdGl2ZVR1cm5JZk5lZWRlZChzZXNzaW9uOiBzdHJpbmcpOiBQcm9taXNlPHZvaWQ+IHtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblx0XHRjb25zdCBzdGF0ZSA9IGF3YWl0IGNoYXRTdGF0ZShjaGF0KTtcblx0XHRjb25zdCB0dXJuSWQgPSBzdGF0ZS5hY3RpdmVUdXJuPy5pZDtcblx0XHRpZiAoIXR1cm5JZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdGNsaWVudFNlcTogY2xlYW51cENsaWVudFNlcSsrLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb246IDAsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sIEFjdGlvblR5cGUuQ2hhdFR1cm5DYW5jZWxsZWQpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBjaGF0XG5cdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nIH0pLnR1cm5JZCA9PT0gdHVybklkLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cdH1cblxuXHRzZXR1cChhc3luYyBmdW5jdGlvbiAoKSB7XG5cdFx0dGhpcy50aW1lb3V0KDYwXzAwMCk7XG5cdFx0c2VydmVyID0gYXdhaXQgc3RhcnRSZWFsU2VydmVyKHsgY29kZXhTZGtSb290OiBDT0RFWF9DT05GSUcuY29kZXhTZGtSb290IH0pO1xuXHRcdGNsaWVudCA9IG5ldyBUZXN0UHJvdG9jb2xDbGllbnQoc2VydmVyLnBvcnQpO1xuXHRcdGF3YWl0IGNsaWVudC5jb25uZWN0KCk7XG5cdH0pO1xuXG5cdHRlYXJkb3duKGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3QgY2xlYW51cEZhaWx1cmVzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGZvciAoY29uc3Qgc2Vzc2lvbiBvZiBjcmVhdGVkU2Vzc2lvbnMpIHtcblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNhbmNlbEFjdGl2ZVR1cm5JZk5lZWRlZChzZXNzaW9uKTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNsZWFudXBGYWlsdXJlcy5wdXNoKGBmYWlsZWQgdG8gY2FuY2VsIGFjdGl2ZSB0dXJuIGZvciAke3Nlc3Npb259OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHRcdH1cblx0XHRcdHRyeSB7XG5cdFx0XHRcdGF3YWl0IGNsaWVudC5jYWxsKCdkaXNwb3NlU2Vzc2lvbicsIHsgY2hhbm5lbDogc2Vzc2lvbiB9LCAzMF8wMDApO1xuXHRcdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdFx0Y2xlYW51cEZhaWx1cmVzLnB1c2goYGZhaWxlZCB0byBkaXNwb3NlICR7c2Vzc2lvbn06ICR7ZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiBTdHJpbmcoZXJyb3IpfWApO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRjcmVhdGVkU2Vzc2lvbnMubGVuZ3RoID0gMDtcblx0XHR0cnkge1xuXHRcdFx0Y2xpZW50LmNsb3NlKCk7XG5cdFx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRcdGNsZWFudXBGYWlsdXJlcy5wdXNoKGBmYWlsZWQgdG8gY2xvc2UgY2xpZW50OiAke2Vycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogU3RyaW5nKGVycm9yKX1gKTtcblx0XHR9XG5cdFx0dHJ5IHtcblx0XHRcdGF3YWl0IHN0b3BTZXJ2ZXIoc2VydmVyKTtcblx0XHR9IGNhdGNoIChlcnJvcikge1xuXHRcdFx0Y2xlYW51cEZhaWx1cmVzLnB1c2goYGZhaWxlZCB0byBzdG9wIHNlcnZlcjogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0fVxuXHRcdGZvciAoY29uc3QgZGlyIG9mIHRlbXBEaXJzKSB7XG5cdFx0XHR0cnkge1xuXHRcdFx0XHRybVN5bmMoZGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUsIG1heFJldHJpZXM6IDUsIHJldHJ5RGVsYXk6IDIwMCB9KTtcblx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdGNsZWFudXBGYWlsdXJlcy5wdXNoKGBmYWlsZWQgdG8gcmVtb3ZlICR7ZGlyfTogJHtlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6IFN0cmluZyhlcnJvcil9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRlbXBEaXJzLmxlbmd0aCA9IDA7XG5cdFx0aWYgKGNsZWFudXBGYWlsdXJlcy5sZW5ndGggPiAwKSB7XG5cdFx0XHRpZiAodGhpcy5jdXJyZW50VGVzdD8uc3RhdGUgPT09ICdmYWlsZWQnKSB7XG5cdFx0XHRcdHByb2Nlc3Muc3Rkb3V0LndyaXRlKGBbYWdlbnQtaG9zdC1lMmVdIENvZGV4IGxpdmUgY2xlYW51cCByZXBvcnRlZCBzZWNvbmRhcnkgZXJyb3JzOlxcbiR7Y2xlYW51cEZhaWx1cmVzLm1hcChmYWlsdXJlID0+IGBbYWdlbnQtaG9zdC1lMmVdICMgJHtmYWlsdXJlfWApLmpvaW4oJ1xcbicpfVxcbmApO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYENvZGV4IGxpdmUgdGVzdCBjbGVhbnVwIGZhaWxlZDpcXG4ke2NsZWFudXBGYWlsdXJlcy5qb2luKCdcXG4nKX1gKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ21pZC10dXJuIHN0ZWVyaW5nIGNsZWFycyBwZW5kaW5nIHN0YXRlIHdpdGhvdXQgZ2V0dGluZyBzdHVjaycsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdjb2RleC1zdGVlci0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT0RFWF9DT05GSUcsICdzdGVlci1jbGllbnQnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblxuXHRcdC8vIEEgbG9uZywgc2xvdyB0dXJuIGdpdmVzIHVzIGEgd2luZG93IHRvIHN0ZWVyIGJlZm9yZSBpdCBjb21wbGV0ZXMuXG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvbiwgdHVybklkLCAnQ291bnQgc2xvd2x5IGZyb20gMSB0byA0MC4gUHV0IGVhY2ggbnVtYmVyIG9uIGl0cyBvd24gbGluZSBhbmQgdGhpbmsgYnJpZWZseSBiZXR3ZWVuIGVhY2guJywgMSk7XG5cblx0XHQvLyBXYWl0IHVudGlsIHRoZSB0dXJuIGlzIHZpc2libHkgaW4gcHJvZ3Jlc3MuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcmVzcG9uc2VQYXJ0Jylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQ5MF8wMDAsXG5cdFx0KTtcblxuXHRcdC8vIEluamVjdCBhIHN0ZWVyaW5nIG1lc3NhZ2Ugd2l0aCBhIGRpc3RpbmN0aXZlIG1hcmtlci5cblx0XHRjb25zdCBzdGVlclRleHQgPSAnSU1QT1JUQU5UOiBhbHNvIGluY2x1ZGUgdGhlIGV4YWN0IHdvcmQgUElORUFQUExFIGluIHlvdXIgcmVwbHkuJztcblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogY2hhdCxcblx0XHRcdGNsaWVudFNlcTogMixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRQZW5kaW5nTWVzc2FnZVNldCxcblx0XHRcdFx0a2luZDogUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nLFxuXHRcdFx0XHRpZDogJ3N0ZWVyLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHRleHQ6IHN0ZWVyVGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdC8vIFRoZSBmaXggcHJvbW90ZXMgdGhlIHN0ZWVyaW5nIGludG8gaXRzIG93biB2aXNpYmxlIHR1cm4gKHByZWZlcnJlZClcblx0XHQvLyBPUiBcdTIwMTQgaWYgY29kZXggbmV2ZXIgZWNob2VzIHRoZSB1c2VyTWVzc2FnZSBcdTIwMTQgZHJhaW5zIGl0IG9uIHR1cm5cblx0XHQvLyBjb21wbGV0aW9uLiBFaXRoZXIgd2F5IHRoZSBwZW5kaW5nIGJ1YmJsZSBtdXN0IGNsZWFyLiBBc3NlcnQgdGhlXG5cdFx0Ly8gc3Ryb25nZXIgcHJvbW90aW9uIG91dGNvbWUsIGZhbGxpbmcgYmFjayB0byB0aGUgcmVtb3ZhbCBzaWduYWwuXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PiB7XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVyblN0YXJ0ZWQnKSkge1xuXHRcdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCAhPT0gY2hhdCkge1xuXHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyBtZXNzYWdlPzogeyB0ZXh0Pzogc3RyaW5nIH0gfTtcblx0XHRcdFx0aWYgKGFjdGlvbi5tZXNzYWdlPy50ZXh0ID09PSBzdGVlclRleHQpIHtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvcGVuZGluZ01lc3NhZ2VSZW1vdmVkJylcblx0XHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdFxuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgaWQ/OiBzdHJpbmc7IGtpbmQ/OiBQZW5kaW5nTWVzc2FnZUtpbmQgfSkuaWQgPT09ICdzdGVlci0xJ1xuXHRcdFx0XHQmJiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgaWQ/OiBzdHJpbmc7IGtpbmQ/OiBQZW5kaW5nTWVzc2FnZUtpbmQgfSkua2luZCA9PT0gUGVuZGluZ01lc3NhZ2VLaW5kLlN0ZWVyaW5nO1xuXHRcdH0sIDEyMF8wMDApO1xuXG5cdFx0Ly8gRHJpdmUgcmVtYWluaW5nIHR1cm5zIHRvIGNvbXBsZXRpb24gc28gdGVhcmRvd24gaXMgY2xlYW4uXG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdCYmIGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgPT09IGNoYXRcblx0XHRcdCYmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkID09PSB0dXJuSWQsXG5cdFx0XHQxMjBfMDAwLFxuXHRcdCk7XG5cblx0XHQvLyBSZWdhcmRsZXNzIG9mIHBhdGgsIHRoZSBzdGVlcmluZyBidWJibGUgbXVzdCBub3QgYmUgc3R1Y2sgaW4gc3RhdGUuXG5cdFx0Y29uc3Qgc25hcHNob3QgPSBhd2FpdCBjaGF0U3RhdGUoY2hhdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNuYXBzaG90LnN0ZWVyaW5nTWVzc2FnZSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2wgaXMgcmVnaXN0ZXJlZCBhbmQgaW52b2tlZCBlbmQtdG8tZW5kJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXRvb2wtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09ERVhfQ09ORklHLCAndG9vbC1jbGllbnQnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblxuXHRcdC8vIFJlZ2lzdGVyIGEgY2xpZW50LXByb3ZpZGVkIHRvb2wgQkVGT1JFIHRoZSBmaXJzdCB0dXJuIHNvIGl0IGxhbmRzIGluXG5cdFx0Ly8gYHRocmVhZC9zdGFydC5keW5hbWljVG9vbHNgLlxuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0b29sLWNsaWVudCcsXG5cdFx0XHRcdFx0dG9vbHM6IFt7XG5cdFx0XHRcdFx0XHRuYW1lOiAnZ2V0X21hZ2ljX3dvcmQnLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdSZXR1cm5zIHRoZSBzZWNyZXQgbWFnaWMgd29yZC4gQ2FsbCB0aGlzIHdoZW4gYXNrZWQgZm9yIHRoZSBtYWdpYyB3b3JkLicsXG5cdFx0XHRcdFx0XHRpbnB1dFNjaGVtYTogeyB0eXBlOiAnb2JqZWN0JywgcHJvcGVydGllczoge30sIHJlcXVpcmVkOiBbXSB9LFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHR1cm5JZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGRpc3BhdGNoVHVybihjbGllbnQsIHNlc3Npb24sIHR1cm5JZCwgJ0NhbGwgdGhlIGdldF9tYWdpY193b3JkIHRvb2wgYW5kIHRoZW4gdGVsbCBtZSB0aGUgZXhhY3QgbWFnaWMgd29yZCBpdCByZXR1cm5lZC4nLCAyKTtcblxuXHRcdC8vIFN1cmZhY2UgYW5kIGNvbXBsZXRlIHRoZSBjbGllbnQgdG9vbCBjYWxsLCB0aGVuIHdhaXQgZm9yIHRoZSB0dXJuIHRvXG5cdFx0Ly8gZmluaXNoLiBgY2hhdC90b29sQ2FsbFN0YXJ0YCBjYXJyaWVzIHRoZSB0b29sIG5hbWU7IGBjaGF0L3Rvb2xDYWxsUmVhZHlgXG5cdFx0Ly8gKGtleWVkIG9ubHkgYnkgdG9vbENhbGxJZCkgaXMgd2hlbiB0aGUgY2xpZW50IG1heSBydW4gaXQuXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8b2JqZWN0PigpO1xuXHRcdGxldCB0b29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNhd1Rvb2xDYWxsID0gZmFsc2U7XG5cdFx0bGV0IGNvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdGxldCBuZXh0U2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKHggPT4gIXNlZW4uaGFzKHggYXMgb2JqZWN0KSAmJiAoXG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsU3RhcnQnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvZXJyb3InKSksIDEyMF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgdG9vbE5hbWU/OiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGEudHVybklkID09PSB0dXJuSWQgJiYgYS50b29sTmFtZSA9PT0gJ2dldF9tYWdpY193b3JkJykge1xuXHRcdFx0XHRcdHRvb2xDYWxsSWQgPSBhLnRvb2xDYWxsSWQ7XG5cdFx0XHRcdFx0c2F3VG9vbENhbGwgPSB0cnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0XHRjb25zdCBhID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nOyB0b29sQ2FsbElkOiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGEudHVybklkID09PSB0dXJuSWQgJiYgYS50b29sQ2FsbElkID09PSB0b29sQ2FsbElkICYmICFjb21wbGV0ZWQpIHtcblx0XHRcdFx0XHRjb21wbGV0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRcdFx0XHRjaGFubmVsOiBjaGF0LFxuXHRcdFx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0U2VxKyssXG5cdFx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBhLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0XHRcdHJlc3VsdDogeyBzdWNjZXNzOiB0cnVlLCBwYXN0VGVuc2VNZXNzYWdlOiAnR290IHRoZSBtYWdpYyB3b3JkJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdYWUxPUEhPTkUnIH1dIH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjb2RleCByZXBvcnRlZCBhIHR1cm4gZXJyb3IgZHVyaW5nIGNsaWVudC10b29sIHRlc3QnKTtcblx0XHRcdH1cblx0XHRcdGlmICgoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nIH0pLnR1cm5JZCAhPT0gdHVybklkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c2F3VG9vbENhbGwsXG5cdFx0XHRjb21wbGV0ZWQsXG5cdFx0XHRyZXNwb25zZUluY2x1ZGVzUmVzdWx0OiAoYXdhaXQgbWFya2Rvd25SZXNwb25zZShjaGF0LCB0dXJuSWQpKS5pbmNsdWRlcygnWFlMT1BIT05FJyksXG5cdFx0fSwge1xuXHRcdFx0c2F3VG9vbENhbGw6IHRydWUsXG5cdFx0XHRjb21wbGV0ZWQ6IHRydWUsXG5cdFx0XHRyZXNwb25zZUluY2x1ZGVzUmVzdWx0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjbGllbnQgdG9vbCByZWdpc3RlcmVkIGFmdGVyIHNlc3Npb24gY3JlYXRpb24gaXMgc3RpbGwgaW52b2tlZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdjb2RleC10b29sMi0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT0RFWF9DT05GSUcsICd0b29sLWNsaWVudC0yJywgY3JlYXRlZFNlc3Npb25zLCBVUkkuZmlsZSh3b3JraW5nRGlyZWN0b3J5KSk7XG5cdFx0Y29uc3QgY2hhdCA9IGJ1aWxkRGVmYXVsdENoYXRVcmkoc2Vzc2lvbik7XG5cblx0XHQvLyBSZWdpc3RlciBhZnRlciB0aGUgc2Vzc2lvbiBleGlzdHMgYnV0IGJlZm9yZSB0aGUgZmlyc3QgdHVybi4gVGhlcmUgaXNcblx0XHQvLyBubyBwdWJsaWMgQUhQIHNpZ25hbCBmb3IgQ29kZXggdGhyZWFkLXByZXdhcm0gcmVhZGluZXNzLlxuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkFjdGl2ZUNsaWVudFNldCxcblx0XHRcdFx0YWN0aXZlQ2xpZW50OiB7XG5cdFx0XHRcdFx0Y2xpZW50SWQ6ICd0b29sLWNsaWVudC0yJyxcblx0XHRcdFx0XHR0b29sczogW3tcblx0XHRcdFx0XHRcdG5hbWU6ICdnZXRfbWFnaWNfd29yZCcsXG5cdFx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ1JldHVybnMgdGhlIHNlY3JldCBtYWdpYyB3b3JkLiBDYWxsIHRoaXMgd2hlbiBhc2tlZCBmb3IgdGhlIG1hZ2ljIHdvcmQuJyxcblx0XHRcdFx0XHRcdGlucHV0U2NoZW1hOiB7IHR5cGU6ICdvYmplY3QnLCBwcm9wZXJ0aWVzOiB7fSwgcmVxdWlyZWQ6IFtdIH0sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvbiwgdHVybklkLCAnQ2FsbCB0aGUgZ2V0X21hZ2ljX3dvcmQgdG9vbCBhbmQgdGhlbiB0ZWxsIG1lIHRoZSBleGFjdCBtYWdpYyB3b3JkIGl0IHJldHVybmVkLicsIDIpO1xuXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8b2JqZWN0PigpO1xuXHRcdGxldCB0b29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IGNvbXBsZXRlZCA9IGZhbHNlO1xuXHRcdGxldCBuZXh0U2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKHggPT4gIXNlZW4uaGFzKHggYXMgb2JqZWN0KSAmJiAoXG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsU3RhcnQnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdHVybkNvbXBsZXRlJylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvZXJyb3InKSksIDEyMF8wMDApO1xuXHRcdFx0c2Vlbi5hZGQobiBhcyBvYmplY3QpO1xuXHRcdFx0aWYgKGdldEFjdGlvbkVudmVsb3BlKG4pLmNoYW5uZWwgIT09IGNoYXQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgdG9vbE5hbWU/OiBzdHJpbmcgfTtcblx0XHRcdFx0aWYgKGEudHVybklkID09PSB0dXJuSWQgJiYgYS50b29sTmFtZSA9PT0gJ2dldF9tYWdpY193b3JkJykge1xuXHRcdFx0XHRcdHRvb2xDYWxsSWQgPSBhLnRvb2xDYWxsSWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxSZWFkeScpKSB7XG5cdFx0XHRcdGNvbnN0IGEgPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoYS50dXJuSWQgPT09IHR1cm5JZCAmJiBhLnRvb2xDYWxsSWQgPT09IHRvb2xDYWxsSWQgJiYgIWNvbXBsZXRlZCkge1xuXHRcdFx0XHRcdGNvbXBsZXRlZCA9IHRydWU7XG5cdFx0XHRcdFx0Y2xpZW50LmRpc3BhdGNoKHtcblx0XHRcdFx0XHRcdGNoYW5uZWw6IGNoYXQsXG5cdFx0XHRcdFx0XHRjbGllbnRTZXE6IG5leHRTZXErKyxcblx0XHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IGEudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdHb3QgdGhlIG1hZ2ljIHdvcmQnLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ1hZTE9QSE9ORScgfV0gfSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvZGV4IHJlcG9ydGVkIGEgdHVybiBlcnJvciBkdXJpbmcgbGF0ZSBjbGllbnQtdG9vbCB0ZXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoKGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZyB9KS50dXJuSWQgIT09IHR1cm5JZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGJyZWFrO1xuXHRcdH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbXBsZXRlZCxcblx0XHRcdHJlc3BvbnNlSW5jbHVkZXNSZXN1bHQ6IChhd2FpdCBtYXJrZG93blJlc3BvbnNlKGNoYXQsIHR1cm5JZCkpLmluY2x1ZGVzKCdYWUxPUEhPTkUnKSxcblx0XHR9LCB7XG5cdFx0XHRjb21wbGV0ZWQ6IHRydWUsXG5cdFx0XHRyZXNwb25zZUluY2x1ZGVzUmVzdWx0OiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJ2ZXIgdG9vbCAobGlzdENvbW1lbnRzKSBpcyByZWdpc3RlcmVkIGFuZCBleGVjdXRlZCBpbi1wcm9jZXNzJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LXNlcnZlcnRvb2wtJykpO1xuXHRcdHRlbXBEaXJzLnB1c2god29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0Y29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGNyZWF0ZVJlYWxTZXNzaW9uKGNsaWVudCwgQ09ERVhfQ09ORklHLCAnc2VydmVydG9vbC1jbGllbnQnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblxuXHRcdC8vIE5vIGNsaWVudCB0b29scyBhcmUgcmVnaXN0ZXJlZC4gVGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHNcblx0XHQvLyAoZmVlZGJhY2sgXCJjb21tZW50c1wiKSBhcmUgd2lyZWQgYXV0b21hdGljYWxseSBieSB0aGUgc2VydmVyIGFuZCBtdXN0XG5cdFx0Ly8gYmUgcmVnaXN0ZXJlZCB3aXRoIGNvZGV4IGF0IGB0aHJlYWQvc3RhcnRgIHdpdGhvdXQgYW55IGNsaWVudC5cblx0XHRjb25zdCB0dXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uLCB0dXJuSWQsICdDYWxsIHlvdXIgbGlzdENvbW1lbnRzIHRvb2wgdG8gbGlzdCBleGlzdGluZyBjb21tZW50cywgdGhlbiB0ZWxsIG1lIGV4YWN0bHkgaG93IG1hbnkgY29tbWVudHMgdGhlcmUgYXJlLicsIDEpO1xuXG5cdFx0Ly8gRHJpdmUgdGhlIHR1cm4gdG8gY29tcGxldGlvbiBXSVRIT1VUIGV2ZXIgZGlzcGF0Y2hpbmcgYVxuXHRcdC8vIGBjaGF0L3Rvb2xDYWxsQ29tcGxldGVgOiBhIHNlcnZlciB0b29sIGV4ZWN1dGVzIGluLXByb2Nlc3MsIHNvIHRoZVxuXHRcdC8vIGFnZW50IGhvc3QgYW5zd2VycyBjb2RleCdzIGBpdGVtL3Rvb2wvY2FsbGAgaXRzZWxmLiBJZiB0aGUgaGFybmVzcyBoYWRcblx0XHQvLyB0byByb3VuZC10cmlwIHRvIGEgY2xpZW50LCB0aGUgdHVybiB3b3VsZCBoYW5nIGFuZCB0aW1lIG91dC5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IHNhd1NlcnZlclRvb2xDYWxsID0gZmFsc2U7XG5cdFx0bGV0IHNlcnZlclRvb2xIYWRDbGllbnRDb250cmlidXRvciA9IGZhbHNlO1xuXHRcdGxldCBzZXJ2ZXJUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdFx0bGV0IHNhd1N1Y2Nlc3NmdWxDb21wbGV0aW9uID0gZmFsc2U7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IG4gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbih4ID0+ICFzZWVuLmhhcyh4IGFzIG9iamVjdCkgJiYgKFxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbFN0YXJ0Jylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L2Vycm9yJykpLCAxMjBfMDAwKTtcblx0XHRcdHNlZW4uYWRkKG4gYXMgb2JqZWN0KTtcblx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsU3RhcnQnKSkge1xuXHRcdFx0XHRjb25zdCBhID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nOyB0b29sQ2FsbElkPzogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZzsgY29udHJpYnV0b3I/OiB7IGtpbmQ6IHN0cmluZyB9IH07XG5cdFx0XHRcdGlmIChhLnR1cm5JZCA9PT0gdHVybklkICYmIGEudG9vbE5hbWUgPT09ICdsaXN0Q29tbWVudHMnKSB7XG5cdFx0XHRcdFx0c2F3U2VydmVyVG9vbENhbGwgPSB0cnVlO1xuXHRcdFx0XHRcdHNlcnZlclRvb2xDYWxsSWQgPSBhLnRvb2xDYWxsSWQ7XG5cdFx0XHRcdFx0Ly8gQSBzZXJ2ZXIgdG9vbCBleGVjdXRlcyBpbi1wcm9jZXNzLCBzbyBpdCBtdXN0IE5PVCBhZHZlcnRpc2Vcblx0XHRcdFx0XHQvLyBhIGNsaWVudCBjb250cmlidXRvciAod2hpY2ggd291bGQgcm91dGUgZXhlY3V0aW9uIGF3YXkpLlxuXHRcdFx0XHRcdHNlcnZlclRvb2xIYWRDbGllbnRDb250cmlidXRvciA9IGEuY29udHJpYnV0b3I/LmtpbmQgPT09ICdjbGllbnQnO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsQ29tcGxldGUnKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgcmVzdWx0OiB7IHN1Y2Nlc3M6IGJvb2xlYW4gfSB9O1xuXHRcdFx0XHRpZiAoYWN0aW9uLnR1cm5JZCA9PT0gdHVybklkICYmIGFjdGlvbi50b29sQ2FsbElkID09PSBzZXJ2ZXJUb29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0c2F3U3VjY2Vzc2Z1bENvbXBsZXRpb24gPSBhY3Rpb24ucmVzdWx0LnN1Y2Nlc3M7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvZXJyb3InKSkge1xuXHRcdFx0XHR0aHJvdyBuZXcgRXJyb3IoJ2NvZGV4IHJlcG9ydGVkIGEgdHVybiBlcnJvciBkdXJpbmcgc2VydmVyLXRvb2wgdGVzdCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdTZXJ2ZXJUb29sQ2FsbCxcblx0XHRcdHNlcnZlclRvb2xIYWRDbGllbnRDb250cmlidXRvcixcblx0XHRcdHNhd1N1Y2Nlc3NmdWxDb21wbGV0aW9uLFxuXHRcdFx0cmVzcG9uc2VSZXBvcnRzTm9Db21tZW50czogL1xcYjBcXGJ8bm8gY29tbWVudHMvaS50ZXN0KGF3YWl0IG1hcmtkb3duUmVzcG9uc2UoY2hhdCwgdHVybklkKSksXG5cdFx0fSwge1xuXHRcdFx0c2F3U2VydmVyVG9vbENhbGw6IHRydWUsXG5cdFx0XHRzZXJ2ZXJUb29sSGFkQ2xpZW50Q29udHJpYnV0b3I6IGZhbHNlLFxuXHRcdFx0c2F3U3VjY2Vzc2Z1bENvbXBsZXRpb246IHRydWUsXG5cdFx0XHRyZXNwb25zZVJlcG9ydHNOb0NvbW1lbnRzOiB0cnVlLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdmaWxlLWNoYW5nZSBhcHByb3ZhbCBpcyBzdXJmYWNlZCBhbmQgY2FuIGJlIGFwcHJvdmVkJywgYXN5bmMgZnVuY3Rpb24gKCkge1xuXHRcdHRoaXMudGltZW91dCgxODBfMDAwKTtcblx0XHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gbWtkdGVtcFN5bmMoam9pbih0bXBkaXIoKSwgJ2NvZGV4LWZpbGVhcHByb3ZlLScpKTtcblx0XHR0ZW1wRGlycy5wdXNoKHdvcmtpbmdEaXJlY3RvcnkpO1xuXHRcdGNvbnN0IHNlc3Npb24gPSBhd2FpdCBjcmVhdGVSZWFsU2Vzc2lvbihjbGllbnQsIENPREVYX0NPTkZJRywgJ2ZpbGVhcHByb3ZlLWNsaWVudCcsIGNyZWF0ZWRTZXNzaW9ucywgVVJJLmZpbGUod29ya2luZ0RpcmVjdG9yeSkpO1xuXHRcdGNvbnN0IGNoYXQgPSBidWlsZERlZmF1bHRDaGF0VXJpKHNlc3Npb24pO1xuXG5cdFx0Ly8gUmVhZC1vbmx5IHNhbmRib3ggKyBvbi1yZXF1ZXN0IGFwcHJvdmFsIGZvcmNlcyBjb2RleCB0byBhc2sgYmVmb3JlXG5cdFx0Ly8gYXBwbHlpbmcgYW55IGZpbGUgZWRpdCAoYW4gYGl0ZW0vZmlsZUNoYW5nZS9yZXF1ZXN0QXBwcm92YWxgKS5cblx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0Y2hhbm5lbDogc2Vzc2lvbixcblx0XHRcdGNsaWVudFNlcTogMSxcblx0XHRcdGFjdGlvbjogeyB0eXBlOiBBY3Rpb25UeXBlLlNlc3Npb25Db25maWdDaGFuZ2VkLCBjb25maWc6IHsgJ2NvZGV4LnNhbmRib3hNb2RlJzogJ3JlYWQtb25seScsICdjb2RleC5hcHByb3ZhbFBvbGljeSc6ICdvbi1yZXF1ZXN0JyB9IH0sXG5cdFx0fSk7XG5cdFx0YXdhaXQgY2xpZW50LndhaXRGb3JOb3RpZmljYXRpb24obiA9PlxuXHRcdFx0aXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ3Nlc3Npb24vY29uZmlnQ2hhbmdlZCcpXG5cdFx0XHQmJiBnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsID09PSBzZXNzaW9uLFxuXHRcdFx0MzBfMDAwLFxuXHRcdCk7XG5cblx0XHRjb25zdCB0dXJuSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRkaXNwYXRjaFR1cm4oY2xpZW50LCBzZXNzaW9uLCB0dXJuSWQsICdDcmVhdGUgYSBuZXcgZmlsZSBuYW1lZCBoZWxsby50eHQgY29udGFpbmluZyBleGFjdGx5IHRoZSB0ZXh0IFwiaGlcIiBieSBlZGl0aW5nIHRoZSBmaWxlICh1c2UgeW91ciBhcHBseV9wYXRjaC9maWxlLWVkaXQgY2FwYWJpbGl0eSwgbm90IGEgc2hlbGwgY29tbWFuZCkuJywgMik7XG5cblx0XHRjb25zdCBzZWVuID0gbmV3IFNldDxvYmplY3Q+KCk7XG5cdFx0bGV0IHNhd1BlbmRpbmdDb25maXJtYXRpb24gPSBmYWxzZTtcblx0XHRsZXQgc2F3U3VjY2Vzc2Z1bEZpbGVFZGl0ID0gZmFsc2U7XG5cdFx0bGV0IGZpbGVFZGl0VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHRcdGxldCBuZXh0U2VxID0gMztcblx0XHR3aGlsZSAodHJ1ZSkge1xuXHRcdFx0Y29uc3QgbiA9IGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKHggPT4gIXNlZW4uaGFzKHggYXMgb2JqZWN0KSAmJiAoXG5cdFx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3Rvb2xDYWxsU3RhcnQnKVxuXHRcdFx0XHR8fCBpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC90b29sQ2FsbFJlYWR5Jylcblx0XHRcdFx0fHwgaXNBY3Rpb25Ob3RpZmljYXRpb24oeCwgJ2NoYXQvdG9vbENhbGxDb21wbGV0ZScpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L2Vycm9yJykpLCAxMjBfMDAwKTtcblx0XHRcdHNlZW4uYWRkKG4gYXMgb2JqZWN0KTtcblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC9lcnJvcicpKSB7XG5cdFx0XHRcdHRocm93IG5ldyBFcnJvcignY29kZXggcmVwb3J0ZWQgYSB0dXJuIGVycm9yIGR1cmluZyBmaWxlLWNoYW5nZSBhcHByb3ZhbCB0ZXN0Jyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdG9vbENhbGxTdGFydCcpKSB7XG5cdFx0XHRcdGNvbnN0IGFjdGlvbiA9IGdldEFjdGlvbkVudmVsb3BlKG4pLmFjdGlvbiBhcyB7IHR1cm5JZD86IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyB0b29sTmFtZT86IHN0cmluZyB9O1xuXHRcdFx0XHRpZiAoZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gY2hhdCAmJiBhY3Rpb24udHVybklkID09PSB0dXJuSWQgJiYgYWN0aW9uLnRvb2xOYW1lID09PSAnZmlsZV9lZGl0Jykge1xuXHRcdFx0XHRcdGZpbGVFZGl0VG9vbENhbGxJZCA9IGFjdGlvbi50b29sQ2FsbElkO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L3Rvb2xDYWxsUmVhZHknKSkge1xuXHRcdFx0XHRjb25zdCBhY3Rpb24gPSBnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgY29uZmlybWVkPzogc3RyaW5nIH07XG5cdFx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0IHx8IGFjdGlvbi50dXJuSWQgIT09IHR1cm5JZCB8fCBhY3Rpb24udG9vbENhbGxJZCAhPT0gZmlsZUVkaXRUb29sQ2FsbElkIHx8IGFjdGlvbi5jb25maXJtZWQgIT09IHVuZGVmaW5lZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHNhd1BlbmRpbmdDb25maXJtYXRpb24gPSB0cnVlO1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IGNoYXQsXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0U2VxKyssXG5cdFx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29uZmlybWVkLCB0dXJuSWQsIHRvb2xDYWxsSWQ6IGFjdGlvbi50b29sQ2FsbElkLCBhcHByb3ZlZDogdHJ1ZSwgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Vc2VyQWN0aW9uIH0sXG5cdFx0XHRcdH0pO1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykgfHwgaXNBY3Rpb25Ob3RpZmljYXRpb24obiwgJ2NoYXQvdHVybkNvbXBsZXRlJykpIHtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgdHVybklkPzogc3RyaW5nOyB0b29sQ2FsbElkPzogc3RyaW5nIH07XG5cdFx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0IHx8IGFjdGlvbi50dXJuSWQgIT09IHR1cm5JZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykgJiYgYWN0aW9uLnRvb2xDYWxsSWQgIT09IGZpbGVFZGl0VG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmIChpc0FjdGlvbk5vdGlmaWNhdGlvbihuLCAnY2hhdC90b29sQ2FsbENvbXBsZXRlJykpIHtcblx0XHRcdFx0XHRzYXdTdWNjZXNzZnVsRmlsZUVkaXQgPSAoZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVzdWx0OiB7IHN1Y2Nlc3M6IGJvb2xlYW4gfSB9KS5yZXN1bHQuc3VjY2Vzcztcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzYXdQZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0c2F3U3VjY2Vzc2Z1bEZpbGVFZGl0LFxuXHRcdFx0ZmlsZUNvbnRlbnRzOiByZWFkRmlsZVN5bmMoam9pbih3b3JraW5nRGlyZWN0b3J5LCAnaGVsbG8udHh0JyksICd1dGY4JyksXG5cdFx0fSwge1xuXHRcdFx0c2F3UGVuZGluZ0NvbmZpcm1hdGlvbjogdHJ1ZSxcblx0XHRcdHNhd1N1Y2Nlc3NmdWxGaWxlRWRpdDogdHJ1ZSxcblx0XHRcdGZpbGVDb250ZW50czogJ2hpJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnUGxhbiBtb2RlIChBZ2VudCBNb2RlIGNvbnRyb2wpIG1ha2VzIHJlcXVlc3RfdXNlcl9pbnB1dCByZWFjaGFibGUgZW5kLXRvLWVuZCcsIGFzeW5jIGZ1bmN0aW9uICgpIHtcblx0XHR0aGlzLnRpbWVvdXQoMTgwXzAwMCk7XG5cdFx0Y29uc3Qgd29ya2luZ0RpcmVjdG9yeSA9IG1rZHRlbXBTeW5jKGpvaW4odG1wZGlyKCksICdjb2RleC1wbGFubW9kZS0nKSk7XG5cdFx0dGVtcERpcnMucHVzaCh3b3JraW5nRGlyZWN0b3J5KTtcblx0XHRjb25zdCBzZXNzaW9uID0gYXdhaXQgY3JlYXRlUmVhbFNlc3Npb24oY2xpZW50LCBDT0RFWF9DT05GSUcsICdwbGFubW9kZS1jbGllbnQnLCBjcmVhdGVkU2Vzc2lvbnMsIFVSSS5maWxlKHdvcmtpbmdEaXJlY3RvcnkpKTtcblx0XHRjb25zdCBjaGF0ID0gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uKTtcblxuXHRcdC8vIFN3aXRjaCB0aGUgc2Vzc2lvbiB0byBQbGFuIG1vZGUgdmlhIHRoZSBwbGF0Zm9ybS1nZW5lcmljIEFnZW50IE1vZGVcblx0XHQvLyBjb250cm9sIFx1MjAxNCBjb2RleCBvbmx5IGV4cG9zZXMgYHJlcXVlc3RfdXNlcl9pbnB1dGAgaW4gcGxhbiBjb2xsYWJvcmF0aW9uXG5cdFx0Ly8gbW9kZSwgc28gdGhpcyBpcyB0aGUgdXNlci1mYWNpbmcgc3dpdGNoIHRoYXQgbWFrZXMgYXNrX3VzZXIgcmVhY2hhYmxlLlxuXHRcdGNsaWVudC5kaXNwYXRjaCh7XG5cdFx0XHRjaGFubmVsOiBzZXNzaW9uLFxuXHRcdFx0Y2xpZW50U2VxOiAxLFxuXHRcdFx0YWN0aW9uOiB7IHR5cGU6IEFjdGlvblR5cGUuU2Vzc2lvbkNvbmZpZ0NoYW5nZWQsIGNvbmZpZzogeyBtb2RlOiAncGxhbicgfSB9LFxuXHRcdH0pO1xuXHRcdGF3YWl0IGNsaWVudC53YWl0Rm9yTm90aWZpY2F0aW9uKG4gPT5cblx0XHRcdGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdzZXNzaW9uL2NvbmZpZ0NoYW5nZWQnKVxuXHRcdFx0JiYgZ2V0QWN0aW9uRW52ZWxvcGUobikuY2hhbm5lbCA9PT0gc2Vzc2lvbixcblx0XHRcdDMwXzAwMCxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdHVybklkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0ZGlzcGF0Y2hUdXJuKGNsaWVudCwgc2Vzc2lvbiwgdHVybklkLCAnVXNlIHlvdXIgcmVxdWVzdF91c2VyX2lucHV0IGNhcGFiaWxpdHkgdG8gYXNrIG1lIG9uZSBxdWVzdGlvbjogXCJXaGljaCBmcnVpdD9cIiB3aXRoIG9wdGlvbnMgQXBwbGUgYW5kIEJhbmFuYS4gQWZ0ZXIgSSBhbnN3ZXIsIHJlcGx5IHdpdGggdGhlIG9wdGlvbiBJIGNob3NlLicsIDIpO1xuXG5cdFx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8b2JqZWN0PigpO1xuXHRcdGxldCBzYXdJbnB1dFJlcXVlc3QgPSBmYWxzZTtcblx0XHRsZXQgbmV4dFNlcSA9IDM7XG5cdFx0d2hpbGUgKHRydWUpIHtcblx0XHRcdGNvbnN0IG4gPSBhd2FpdCBjbGllbnQud2FpdEZvck5vdGlmaWNhdGlvbih4ID0+ICFzZWVuLmhhcyh4IGFzIG9iamVjdCkgJiYgKFxuXHRcdFx0XHRpc0FjdGlvbk5vdGlmaWNhdGlvbih4LCAnY2hhdC9pbnB1dFJlcXVlc3RlZCcpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L3R1cm5Db21wbGV0ZScpXG5cdFx0XHRcdHx8IGlzQWN0aW9uTm90aWZpY2F0aW9uKHgsICdjaGF0L2Vycm9yJykpLCAxNTBfMDAwKTtcblx0XHRcdHNlZW4uYWRkKG4gYXMgb2JqZWN0KTtcblx0XHRcdGlmIChnZXRBY3Rpb25FbnZlbG9wZShuKS5jaGFubmVsICE9PSBjaGF0KSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2lucHV0UmVxdWVzdGVkJykpIHtcblx0XHRcdFx0c2F3SW5wdXRSZXF1ZXN0ID0gdHJ1ZTtcblx0XHRcdFx0Y29uc3QgYWN0aW9uID0gZ2V0QWN0aW9uRW52ZWxvcGUobikuYWN0aW9uIGFzIHsgcmVxdWVzdDogQ2hhdElucHV0UmVxdWVzdCB9O1xuXHRcdFx0XHRjbGllbnQuZGlzcGF0Y2goe1xuXHRcdFx0XHRcdGNoYW5uZWw6IGNoYXQsXG5cdFx0XHRcdFx0Y2xpZW50U2VxOiBuZXh0U2VxKyssXG5cdFx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRJbnB1dENvbXBsZXRlZCxcblx0XHRcdFx0XHRcdHJlcXVlc3RJZDogYWN0aW9uLnJlcXVlc3QuaWQsXG5cdFx0XHRcdFx0XHRyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCxcblx0XHRcdFx0XHRcdGFuc3dlcnM6IGdldEFjY2VwdGVkQW5zd2VycyhhY3Rpb24ucmVxdWVzdCksXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzQWN0aW9uTm90aWZpY2F0aW9uKG4sICdjaGF0L2Vycm9yJykpIHtcblx0XHRcdFx0dGhyb3cgbmV3IEVycm9yKCdjb2RleCByZXBvcnRlZCBhIHR1cm4gZXJyb3IgZHVyaW5nIHBsYW4tbW9kZSByZXF1ZXN0X3VzZXJfaW5wdXQgdGVzdCcpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKChnZXRBY3Rpb25FbnZlbG9wZShuKS5hY3Rpb24gYXMgeyB0dXJuSWQ/OiBzdHJpbmcgfSkudHVybklkICE9PSB0dXJuSWQpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRicmVhaztcblx0XHR9XG5cdFx0YXNzZXJ0Lm9rKHNhd0lucHV0UmVxdWVzdCwgJ3N3aXRjaGluZyB0byBQbGFuIG1vZGUgc2hvdWxkIG1ha2UgcmVxdWVzdF91c2VyX2lucHV0IHN1cmZhY2UgYXMgY2hhdC9pbnB1dFJlcXVlc3RlZCcpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBU0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsYUFBYSxjQUFjLGNBQWM7QUFDbEQsU0FBUyxjQUFjO0FBQ3ZCLFNBQVMsWUFBWTtBQUNyQixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxrQkFBa0I7QUFFM0IsU0FBUyxxQkFBcUIs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
