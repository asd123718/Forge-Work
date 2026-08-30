import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { readAgentMessageDelegationMeta } from "../../../common/meta/agentMessageDelegationMeta.js";
import { LIVE_PREVIEW_UNAVAILABLE_MESSAGE } from "../../../node/codex/codexFileEditObserver.js";
import { createCodexSessionMapState, extractUserInputText, finalizeCodexTurnMapState, mapAgentMessageDelta, mapCommandExecutionOutputDelta, mapErrorNotification, mapFileChangePatchUpdated, mapFileChangeStarted, mapItemCompleted, mapItemStarted, mapMcpToolCallProgress, mapReasoningSummaryPartAdded, mapReasoningSummaryTextDelta, mapReasoningTextDelta, mapTokenUsageUpdated, mapTurnCompleted, mapTurnDiffUpdated, mapTurnStarted, resetCodexTurnMapState, turnStateFromStatus } from "../../../node/codex/codexMapAppServerEvents.js";
import { ActionType } from "../../../common/state/sessionActions.js";
import { chatReducer } from "../../../common/state/protocol/reducers.js";
import { ChatOriginKind, MessageKind, ResponsePartKind, SessionStatus, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from "../../../common/state/sessionState.js";
import { ActiveClientToolSet } from "../../../node/activeClientState.js";
function markdownPartContent(action) {
  return action?.type === ActionType.ChatResponsePart && action.part.kind === ResponsePartKind.Markdown ? action.part.content : void 0;
}
suite("codexMapAppServerEvents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("error notification surfaces retry activity and terminal failure", () => {
    const error = { message: "request timed out", codexErrorInfo: null, additionalDetails: null };
    assert.deepStrictEqual({
      retrying: mapErrorNotification({ threadId: "thr_1", turnId: "app_turn", error, willRetry: true }, "host_turn", 100),
      failed: mapErrorNotification({ threadId: "thr_1", turnId: "app_turn", error, willRetry: false }, "host_turn", 200)
    }, {
      retrying: [{ type: ActionType.ChatActivityChanged, activity: "Codex connection interrupted; retrying..." }],
      failed: [
        { type: ActionType.ChatActivityChanged, activity: void 0 },
        { type: ActionType.ChatError, turnId: "host_turn", duration: 200, error: { errorType: "CodexError", message: "request timed out" } }
      ]
    });
  });
  test("turn/started emits ChatTurnStarted with user message text", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnStarted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [{
          type: "userMessage",
          id: "item_user",
          clientId: null,
          content: [{ type: "text", text: "hello", text_elements: [] }]
        }],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: 1752012321,
        completedAt: null,
        durationMs: null
      }
    }, "fallback");
    assert.strictEqual(state.currentTurnId, "turn_a");
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatTurnStarted,
      turnId: "turn_a",
      startedAt: "2025-07-08T22:05:21.000Z",
      message: { text: "hello", origin: { kind: MessageKind.User } }
    }]);
  });
  test("turn/started falls back to provided text when items has no userMessage", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnStarted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_b",
        items: [],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, "the prompt");
    assert.strictEqual(actions[0].message.text, "the prompt");
  });
  test("turn/started exposes a delegated prompt without its private envelope", () => {
    const actions = mapTurnStarted(createCodexSessionMapState(), {
      threadId: "thr_1",
      turn: {
        id: "turn_delegated",
        items: [{
          type: "userMessage",
          id: "item_user",
          clientId: null,
          content: [{
            type: "text",
            text: "<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Review &lt;this&gt;</input></codex_delegation>",
            text_elements: []
          }]
        }],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, "");
    const action = actions[0];
    assert.strictEqual(action.type, ActionType.ChatTurnStarted);
    if (action.type !== ActionType.ChatTurnStarted) {
      return;
    }
    assert.deepStrictEqual({
      text: action.message.text,
      delegation: readAgentMessageDelegationMeta(action.message)
    }, {
      text: "Review <this>",
      delegation: { sourceThreadId: "source-thread" }
    });
  });
  test("turn/started uses a current timestamp when Codex omits startedAt", () => {
    const before = (/* @__PURE__ */ new Date()).toISOString();
    const actions = mapTurnStarted(createCodexSessionMapState(), {
      threadId: "thr_1",
      turn: {
        id: "turn_c",
        items: [],
        itemsView: { type: "full" },
        status: "inProgress",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, "prompt");
    const startedAt = actions[0].type === ActionType.ChatTurnStarted ? actions[0].startedAt : void 0;
    assert.ok(typeof startedAt === "string" && startedAt >= before && startedAt <= (/* @__PURE__ */ new Date()).toISOString());
  });
  test("item/started for agentMessage seeds a markdown part", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(actions.length, 1);
    const a = actions[0];
    assert.strictEqual(a.type, ActionType.ChatResponsePart);
    assert.strictEqual(a.turnId, "turn_a");
    assert.strictEqual(a.part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(typeof a.part.id, "string");
    assert.ok(a.part.id.length > 0);
    assert.strictEqual(state.itemToPartId.get("item_x"), a.part.id);
  });
  test("item/started for non-agentMessage item is ignored (Phase 2)", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: { type: "plan", id: "item_p", text: "plan text" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.deepStrictEqual(actions, []);
    assert.strictEqual(state.itemToPartId.size, 0);
  });
  test("item/agentMessage/delta emits ChatDelta for known itemId", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const partId = state.itemToPartId.get("item_x");
    const actions = mapAgentMessageDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "item_x",
      delta: "chunk"
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatDelta,
      turnId: "turn_a",
      partId,
      content: "chunk"
    }]);
  });
  test("item/agentMessage/delta for unknown itemId is dropped", () => {
    const state = createCodexSessionMapState();
    const actions = mapAgentMessageDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "unknown",
      delta: "orphan"
    });
    assert.deepStrictEqual(actions, []);
  });
  test("item/reasoning summary events seed a reasoning part and stream deltas", () => {
    const state = createCodexSessionMapState();
    const start = mapReasoningSummaryPartAdded(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_1",
      summaryIndex: 0
    });
    const partId = state.itemToReasoningPartId.get("rs_1:summary:0");
    const delta = mapReasoningSummaryTextDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_1",
      summaryIndex: 0,
      delta: "thinking"
    });
    assert.deepStrictEqual({
      start: start.map((action) => action.type),
      partKind: start[0]?.type === ActionType.ChatResponsePart ? start[0].part.kind : void 0,
      delta
    }, {
      start: [ActionType.ChatResponsePart],
      partKind: ResponsePartKind.Reasoning,
      delta: [{ type: ActionType.ChatReasoning, turnId: "turn_a", partId, content: "thinking", _meta: { codexReasoningKind: "summary" } }]
    });
  });
  test("item/reasoning text delta creates a reasoning part when start was missed", () => {
    const state = createCodexSessionMapState();
    const actions = mapReasoningTextDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "rs_2",
      contentIndex: 1,
      delta: "raw thought"
    });
    const partId = state.itemToReasoningPartId.get("rs_2:text:1");
    assert.deepStrictEqual({
      types: actions.map((action) => action.type),
      partKind: actions[0]?.type === ActionType.ChatResponsePart ? actions[0].part.kind : void 0,
      delta: actions[1]
    }, {
      types: [ActionType.ChatResponsePart, ActionType.ChatReasoning],
      partKind: ResponsePartKind.Reasoning,
      delta: { type: ActionType.ChatReasoning, turnId: "turn_a", partId, content: "raw thought", _meta: { codexReasoningKind: "text" } }
    });
  });
  test("thread/tokenUsage/updated emits ChatUsage for the turn", () => {
    const actions = mapTokenUsageUpdated({
      threadId: "thr_1",
      turnId: "turn_a",
      tokenUsage: {
        last: { inputTokens: 10, cachedInputTokens: 4, cacheWriteInputTokens: 0, outputTokens: 6, reasoningOutputTokens: 2, totalTokens: 16 },
        total: { inputTokens: 100, cachedInputTokens: 40, cacheWriteInputTokens: 0, outputTokens: 60, reasoningOutputTokens: 20, totalTokens: 160 },
        modelContextWindow: 2e5
      }
    }, "codex-model:openai:gpt-5.6-sol");
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatUsage,
      turnId: "turn_a",
      usage: {
        inputTokens: 10,
        outputTokens: 6,
        model: "codex-model:openai:gpt-5.6-sol",
        cacheReadTokens: 4,
        _meta: { reasoningOutputTokens: 2, modelContextWindow: 2e5 }
      }
    }]);
  });
  test("contextCompaction item maps to visible running and completed progress", () => {
    const state = createCodexSessionMapState();
    const started = mapItemStarted(state, {
      item: { type: "contextCompaction", id: "compact_1" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("compact_1")?.toolCallId;
    const completed = mapItemCompleted(state, {
      item: { type: "contextCompaction", id: "compact_1" },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 1
    });
    assert.deepStrictEqual({ started, completed, remaining: state.itemToToolCall.size }, {
      started: [
        { type: ActionType.ChatToolCallStart, turnId: "turn_a", toolCallId, toolName: "compact", displayName: "Compact conversation" },
        { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Compacting conversation", confirmed: ToolCallConfirmationReason.NotNeeded }
      ],
      completed: [{
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: { success: true, pastTenseMessage: "Compacted conversation" }
      }],
      remaining: 0
    });
  });
  test("item/completed for agentMessage clears the mapping", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: { type: "agentMessage", id: "item_x", text: "", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(state.itemToPartId.size, 1);
    mapItemCompleted(state, {
      item: { type: "agentMessage", id: "item_x", text: "final", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.strictEqual(state.itemToPartId.size, 0);
  });
  test("second agentMessage in a turn is seeded with a leading block separator", () => {
    const state = createCodexSessionMapState();
    const first = mapItemStarted(state, {
      item: { type: "agentMessage", id: "m1", text: "Consolidating the recommendation and tradeoffs.", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const second = mapItemStarted(state, {
      item: { type: "agentMessage", id: "m2", text: "## Conclusion", phase: null, memoryCitation: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.deepStrictEqual({
      first: markdownPartContent(first[0]),
      second: markdownPartContent(second[0])
    }, {
      first: "Consolidating the recommendation and tradeoffs.",
      second: "\n\n## Conclusion"
    });
  });
  test("agentMessage block separator counter resets per turn", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, { item: { type: "agentMessage", id: "m1", text: "a", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 });
    mapItemStarted(state, { item: { type: "agentMessage", id: "m2", text: "b", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 });
    resetCodexTurnMapState(state);
    const firstOfNextTurn = mapItemStarted(state, { item: { type: "agentMessage", id: "m3", text: "c", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_b", startedAtMs: 0 });
    assert.strictEqual(markdownPartContent(firstOfNextTurn[0]), "c");
  });
  test("adjacent agentMessages keep a Markdown heading on its own line after coalescing", () => {
    const state = createCodexSessionMapState();
    let chat = {
      resource: "ahp-chat://test",
      title: "Test",
      status: SessionStatus.Idle,
      modifiedAt: (/* @__PURE__ */ new Date(0)).toISOString(),
      origin: { kind: ChatOriginKind.User },
      turns: [],
      activeTurn: void 0
    };
    const apply = (actions) => {
      for (const action of actions) {
        chat = chatReducer(chat, action);
      }
    };
    apply(mapTurnStarted(state, {
      threadId: "thr_1",
      turn: { id: "turn_a", items: [], itemsView: { type: "full" }, status: "inProgress", error: null, startedAt: null, completedAt: null, durationMs: null }
    }, "prompt"));
    apply(mapItemStarted(state, { item: { type: "agentMessage", id: "m1", text: "", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 }));
    apply(mapAgentMessageDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "m1", delta: "Consolidating the recommendation and tradeoffs." }));
    apply(mapItemStarted(state, { item: { type: "agentMessage", id: "m2", text: "", phase: null, memoryCitation: null }, threadId: "thr_1", turnId: "turn_a", startedAtMs: 0 }));
    apply(mapAgentMessageDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "m2", delta: "## Conclusion\n\nDone." }));
    const joined = (chat.activeTurn?.responseParts ?? []).map((part) => part.kind === ResponsePartKind.Markdown ? part.content : "").join("");
    assert.strictEqual(joined, "Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.");
  });
  test("item/started for commandExecution emits ChatToolCallStart + Delta + Ready and registers tool-call entry", () => {
    const state = createCodexSessionMapState();
    const actions = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "ls -la",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.strictEqual(actions.length, 3);
    const start = actions[0];
    const delta = actions[1];
    const ready = actions[2];
    assert.strictEqual(start.type, ActionType.ChatToolCallStart);
    assert.strictEqual(delta.type, ActionType.ChatToolCallDelta);
    assert.strictEqual(ready.type, ActionType.ChatToolCallReady);
    const entry = state.itemToToolCall.get("cmd_1");
    assert.ok(entry);
    assert.strictEqual(entry.toolCallId, start.toolCallId);
    assert.strictEqual(entry.turnId, "turn_a");
    assert.strictEqual(delta.content, "ls -la");
    assert.strictEqual(ready.confirmed, ToolCallConfirmationReason.NotNeeded);
    assert.deepStrictEqual(start._meta, { toolKind: "terminal" });
  });
  test("commandExecution unwraps the OS shell wrapper for display (start + completed)", () => {
    const state = createCodexSessionMapState();
    const started = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_wrap",
        command: "/bin/zsh -lc 'touch ~/foo'",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const delta = started[1];
    const ready = started[2];
    const deferred = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_wrap",
        command: "/bin/zsh -lc 'touch ~/foo'",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 4
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const flushed = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    const complete = flushed[0];
    assert.deepStrictEqual({
      deferred,
      delta: delta.content,
      invocationMessage: ready.invocationMessage,
      toolInput: ready.toolInput,
      pastTenseMessage: complete.result.pastTenseMessage
    }, {
      deferred: [],
      delta: "touch ~/foo",
      invocationMessage: "touch ~/foo",
      toolInput: "touch ~/foo",
      pastTenseMessage: "Ran `touch ~/foo`"
    });
  });
  test("commandExecution coalesces a sandbox pre-flight with its approved re-run into one box", () => {
    const state = createCodexSessionMapState();
    const preStarted = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_preflight",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_preflight").toolCallId;
    const preCompleted = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_preflight",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 4
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const escStarted = mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_escalated",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const escCompleted = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_escalated",
        command: "curl -s https://example.com",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "Example Domain",
        exitCode: 0,
        durationMs: 40
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const startCount = (actions) => actions.filter((a) => a.type === ActionType.ChatToolCallStart).length;
    assert.deepStrictEqual({
      // exactly one box opened (pre-flight's), escalation reuses it
      starts: startCount(preStarted) + startCount(escStarted),
      // pre-flight completion deferred, escalation start emits nothing
      preCompleted,
      escStarted,
      // single completion carries the escalation's real output
      escComplete: escCompleted[0]
    }, {
      starts: 1,
      preCompleted: [],
      escStarted: [],
      escComplete: {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Ran `curl -s https://example.com`",
          content: [{ type: ToolResultContentType.Text, text: "Example Domain" }],
          error: void 0
        }
      }
    });
  });
  test("item/commandExecution/outputDelta streams running tool content", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_output",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_output").toolCallId;
    const first = mapCommandExecutionOutputDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "cmd_output", delta: "hi" });
    const second = mapCommandExecutionOutputDelta(state, { threadId: "thr_1", turnId: "turn_a", itemId: "cmd_output", delta: "\n" });
    assert.deepStrictEqual({ first, second }, {
      first: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "hi" }] }],
      second: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "hi\n" }] }]
    });
  });
  test("item/completed for commandExecution emits ChatToolCallComplete with aggregated output", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_2",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_2").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_2",
        command: "echo hi",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "hi\n",
        exitCode: 0,
        durationMs: 12
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.strictEqual(actions.length, 1);
    const complete = actions[0];
    assert.strictEqual(complete.type, ActionType.ChatToolCallComplete);
    assert.strictEqual(complete.toolCallId, toolCallId);
    assert.strictEqual(complete.result.success, true);
    assert.deepStrictEqual(complete.result.content, [{ type: ToolResultContentType.Text, text: "hi\n" }]);
    assert.strictEqual(state.itemToToolCall.size, 0);
  });
  test("shell-written file edits remain attached to command completion", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_write",
        command: "Set-Content app.ts value",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/app.ts", content: { uri: "session-db:///before" } },
      after: { uri: "file:///tmp/app.ts", content: { uri: "session-db:///after" } },
      diff: { added: 1, removed: 1 }
    };
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_write",
        command: "Set-Content app.ts value",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 1
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    }, [fileEdit]);
    assert.strictEqual(actions[0].type, ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(actions[0].result.content, [fileEdit]);
  });
  test("turn diff updates stream a synthetic native file edit lifecycle", () => {
    const state = createCodexSessionMapState();
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/app.ts", content: { uri: "session-db:///before" } },
      after: { uri: "file:///tmp/app.ts", content: { uri: "session-db:///after" } },
      diff: { added: 2, removed: 1 }
    };
    const first = mapTurnDiffUpdated(state, "turn_a", "turn_diff_call", [fileEdit]);
    const second = mapTurnDiffUpdated(state, "turn_a", "turn_diff_call", [fileEdit]);
    assert.deepStrictEqual(first.map((action) => action.type), [ActionType.ChatToolCallStart, ActionType.ChatToolCallReady, ActionType.ChatToolCallContentChanged]);
    assert.deepStrictEqual(second, [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId: "turn_diff_call", content: [fileEdit] }]);
  });
  test("item/completed for commandExecution with non-zero exit reports failure", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_3",
        command: "false",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_3",
        command: "false",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 1,
        durationMs: 3
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.message, "Exit code 1");
  });
  test("webSearch item maps to search tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "webSearch",
        id: "web_1",
        query: "vscode tests",
        action: { type: "search", query: "vscode tests", queries: null }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("web_1").toolCallId;
    const completeActions = mapItemCompleted(state, {
      item: {
        type: "webSearch",
        id: "web_1",
        query: "vscode tests",
        action: { type: "search", query: "vscode tests", queries: null }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      startMeta: startActions[0]?.type === ActionType.ChatToolCallStart ? startActions[0]._meta : void 0,
      delta: startActions[1],
      ready: startActions[2],
      complete: completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      startMeta: { toolKind: "search" },
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "vscode tests" },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Searching the web for vscode tests", toolInput: "vscode tests", confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: "search" } },
      complete: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Searched the web for vscode tests" } }],
      remainingToolCalls: 0
    });
  });
  test("imageGeneration item maps to an image tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: { type: "imageGeneration", id: "image_1", status: "in_progress", revisedPrompt: null, result: "" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("image_1").toolCallId;
    const completeActions = mapItemCompleted(state, {
      item: { type: "imageGeneration", id: "image_1", status: "completed", revisedPrompt: "A watercolor fox", result: "aW1hZ2U=" },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      start: startActions,
      complete: completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      start: [{
        type: ActionType.ChatToolCallStart,
        turnId: "turn_a",
        toolCallId,
        toolName: "image_gen.imagegen",
        displayName: "Generate image"
      }, {
        type: ActionType.ChatToolCallReady,
        turnId: "turn_a",
        toolCallId,
        invocationMessage: "Generating image",
        toolInput: '{"prompt":"Generate image"}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      }],
      complete: [{
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Generated image",
          content: [{ type: ToolResultContentType.EmbeddedResource, data: "aW1hZ2U=", contentType: "image/png" }]
        }
      }],
      remainingToolCalls: 0
    });
  });
  test("fileChange item maps to file edit tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const changes = [{ path: "src/a.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-old\n+new" }];
    const startActions = mapItemStarted(state, {
      item: { type: "fileChange", id: "file_1", changes, status: "inProgress" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("file_1").toolCallId;
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///src/a.ts", content: { uri: "session-db:///before" } },
      after: { uri: "file:///src/a.ts", content: { uri: "session-db:///after" } },
      diff: { added: 1, removed: 1 }
    };
    const patchActions = mapFileChangePatchUpdated(state, { threadId: "thr_1", turnId: "turn_a", itemId: "file_1", changes: [{ path: "src/b.ts", kind: { type: "add" }, diff: "+hello" }] }, [fileEdit]);
    const completeActions = mapItemCompleted(state, {
      item: { type: "fileChange", id: "file_1", changes, status: "completed" },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    }, [fileEdit]);
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      initialContent: startActions[3],
      patchActions,
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady, ActionType.ChatToolCallContentChanged],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "update: src/a.ts" },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "update: src/a.ts", toolInput: "update: src/a.ts", confirmed: ToolCallConfirmationReason.NotNeeded },
      initialContent: { type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "update: src/a.ts\n@@ -1 +1 @@\n-old\n+new" }] },
      patchActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "add: src/b.ts\n+hello" }, fileEdit] }],
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "update: src/a.ts", content: [{ type: ToolResultContentType.Text, text: "update: src/a.ts\n@@ -1 +1 @@\n-old\n+new" }, fileEdit] } }],
      remainingToolCalls: 0
    });
  });
  test("streaming patch starts the file tool call before item/started", () => {
    const state = createCodexSessionMapState();
    const changes = [{ path: "src/live.ts", kind: { type: "add" }, diff: "first line\n" }];
    const startActions = mapFileChangeStarted(state, "turn_a", "file_live", changes);
    const patchActions = mapFileChangePatchUpdated(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "file_live",
      changes: [...changes]
    });
    const duplicateStart = mapItemStarted(state, {
      item: { type: "fileChange", id: "file_live", changes, status: "inProgress" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      patchTypes: patchActions.map((action) => action.type),
      duplicateStart
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady, ActionType.ChatToolCallContentChanged],
      patchTypes: [ActionType.ChatToolCallContentChanged],
      duplicateStart: []
    });
  });
  test("keeps the tool card and surfaces a live-preview-unavailable notice without a guessed file edit", () => {
    const state = createCodexSessionMapState();
    const changes = [{ path: "src/bad.ts", kind: { type: "update", move_path: null }, diff: "@@ -1 +1 @@\n-missing\n+new" }];
    mapFileChangeStarted(state, "turn_a", "file_bad", changes);
    const toolCallId = state.itemToToolCall.get("file_bad").toolCallId;
    const patchActions = mapFileChangePatchUpdated(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "file_bad",
      changes: [...changes]
    }, [], LIVE_PREVIEW_UNAVAILABLE_MESSAGE);
    assert.deepStrictEqual(patchActions, [{
      type: ActionType.ChatToolCallContentChanged,
      turnId: "turn_a",
      toolCallId,
      content: [
        { type: ToolResultContentType.Text, text: "update: src/bad.ts\n@@ -1 +1 @@\n-missing\n+new" },
        { type: ToolResultContentType.Text, text: LIVE_PREVIEW_UNAVAILABLE_MESSAGE }
      ]
    }]);
  });
  test("mcpToolCall item maps to tool call lifecycle with progress", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: { type: "mcpToolCall", id: "mcp_1", server: "github", tool: "search", status: "inProgress", arguments: { query: "vscode" }, mcpAppResourceUri: void 0, pluginId: null, result: null, error: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("mcp_1").toolCallId;
    const progressActions = mapMcpToolCallProgress(state, { threadId: "thr_1", turnId: "turn_a", itemId: "mcp_1", message: "Searching" });
    const completeActions = mapItemCompleted(state, {
      item: { type: "mcpToolCall", id: "mcp_1", server: "github", tool: "search", status: "completed", arguments: { query: "vscode" }, mcpAppResourceUri: void 0, pluginId: null, result: { content: ["done"], structuredContent: { count: 1 }, _meta: null }, error: null, durationMs: 5 },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      progressActions,
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: '{\n  "query": "vscode"\n}' },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Calling github.search", toolInput: '{\n  "query": "vscode"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
      progressActions: [{ type: ActionType.ChatToolCallContentChanged, turnId: "turn_a", toolCallId, content: [{ type: ToolResultContentType.Text, text: "Searching" }] }],
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Called github.search", content: [{ type: ToolResultContentType.Text, text: 'done\n{\n  "count": 1\n}' }] } }],
      remainingToolCalls: 0
    });
  });
  test("mcpToolCall start carries an MCP contributor when the server has a customization", () => {
    const state = createCodexSessionMapState();
    state.mcpCustomizationIds.set("github", "cust-gh");
    const startActions = mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_c",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    if (start.type !== ActionType.ChatToolCallStart) {
      throw new Error("expected a ChatToolCallStart action");
    }
    assert.deepStrictEqual(start.contributor, { kind: ToolCallContributorKind.MCP, customizationId: "cust-gh" });
  });
  test("mcpToolCall start carries no contributor when the server has no customization", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_n",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    if (start.type !== ActionType.ChatToolCallStart) {
      throw new Error("expected a ChatToolCallStart action");
    }
    assert.strictEqual(start.contributor, void 0);
  });
  test("a host-declined commandExecution reports result.error.code = denied", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_d",
        command: "rm file",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const entry = state.itemToToolCall.get("cmd_d");
    if (!entry) {
      throw new Error("expected a tracked tool call");
    }
    state.declinedToolCalls.add(entry.toolCallId);
    const actions = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_d",
        command: "rm file",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "failed",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: 1
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    if (complete.type !== ActionType.ChatToolCallComplete) {
      throw new Error("expected a ChatToolCallComplete action");
    }
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.code, "denied");
  });
  test("a host-declined mcpToolCall reports result.error.code = denied", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_d",
        server: "github",
        tool: "search",
        status: "inProgress",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const entry = state.itemToToolCall.get("mcp_d");
    if (!entry) {
      throw new Error("expected a tracked tool call");
    }
    state.declinedToolCalls.add(entry.toolCallId);
    const actions = mapItemCompleted(state, {
      item: {
        type: "mcpToolCall",
        id: "mcp_d",
        server: "github",
        tool: "search",
        status: "failed",
        arguments: {},
        mcpAppResourceUri: void 0,
        pluginId: null,
        result: null,
        error: null,
        durationMs: 1
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    const complete = actions[0];
    if (complete.type !== ActionType.ChatToolCallComplete) {
      throw new Error("expected a ChatToolCallComplete action");
    }
    assert.strictEqual(complete.result.success, false);
    assert.strictEqual(complete.result.error?.code, "denied");
  });
  test("collabAgentToolCall spawnAgent start renders compactly (no prompt dump \u2014 the child conversation shows it)", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_1",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: [],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_1").toolCallId;
    assert.deepStrictEqual({
      actions: startActions,
      entryToolName: state.itemToToolCall.get("collab_1").toolName
    }, {
      actions: [
        { type: ActionType.ChatToolCallStart, turnId: "turn_a", toolCallId, toolName: "codex.spawnAgent", displayName: "Spawn agent" },
        { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Spawning agent", confirmed: ToolCallConfirmationReason.NotNeeded }
      ],
      entryToolName: "codex.spawnAgent"
    });
  });
  test("collabAgentToolCall sendInput start still carries the prompt (only spawnAgent is compacted)", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_si",
        tool: "sendInput",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Also check the CHANGELOG",
        model: null,
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_si").toolCallId;
    assert.deepStrictEqual(startActions, [
      { type: ActionType.ChatToolCallStart, turnId: "turn_a", toolCallId, toolName: "codex.sendInput", displayName: "Send input to agent" },
      { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: "Also check the CHANGELOG" },
      { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Sending input to agent", toolInput: "Also check the CHANGELOG", confirmed: ToolCallConfirmationReason.NotNeeded }
    ]);
  });
  test("collabAgentToolCall spawnAgent completed renders the subagent result as tool output", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_2",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_2").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_2",
        tool: "spawnAgent",
        status: "completed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Investigate the failing test",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: { sub_1: { status: "completed", message: "Found the bug in foo.ts" } }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({ actions, remainingToolCalls: state.itemToToolCall.size }, {
      actions: [{
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Spawned agent",
          content: [{ type: ToolResultContentType.Text, text: "Completed \u2014 Found the bug in foo.ts" }]
        }
      }],
      remainingToolCalls: 0
    });
  });
  test("collabAgentToolCall wait aggregates results from multiple subagents", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_wait",
        tool: "wait",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1", "sub_2"],
        prompt: null,
        model: null,
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_wait").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_wait",
        tool: "wait",
        status: "completed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1", "sub_2"],
        prompt: null,
        model: null,
        reasoningEffort: null,
        agentsStates: {
          sub_1: { status: "completed", message: "Migration finished" },
          sub_2: { status: "running", message: "Still analysing" }
        }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatToolCallComplete,
      turnId: "turn_a",
      toolCallId,
      result: {
        success: true,
        pastTenseMessage: "Finished waiting",
        content: [{ type: ToolResultContentType.Text, text: "Agent 1: Completed \u2014 Migration finished\nAgent 2: Running \u2014 Still analysing" }]
      }
    }]);
  });
  test("collabAgentToolCall failure reports the errored subagent state", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_fail",
        tool: "spawnAgent",
        status: "inProgress",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Refactor the parser",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: {}
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("collab_fail").toolCallId;
    const actions = mapItemCompleted(state, {
      item: {
        type: "collabAgentToolCall",
        id: "collab_fail",
        tool: "spawnAgent",
        status: "failed",
        senderThreadId: "thr_1",
        receiverThreadIds: ["sub_1"],
        prompt: "Refactor the parser",
        model: "gpt-5.5",
        reasoningEffort: null,
        agentsStates: { sub_1: { status: "errored", message: "Model unavailable" } }
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual(actions, [{
      type: ActionType.ChatToolCallComplete,
      turnId: "turn_a",
      toolCallId,
      result: {
        success: false,
        pastTenseMessage: "Spawn agent failed",
        content: [{ type: ToolResultContentType.Text, text: "Errored \u2014 Model unavailable" }],
        error: { message: "Collab agent failed" }
      }
    }]);
  });
  test("dynamicToolCall item carries a Client contributor when a client owns the tool", () => {
    const toolSet = new ActiveClientToolSet();
    toolSet.set("win-7", [{ name: "get_magic_word" }]);
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(), toolSet);
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_2", namespace: null, tool: "get_magic_word", arguments: {}, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    assert.deepStrictEqual({
      type: start.type,
      toolName: start.toolName,
      contributor: start.contributor
    }, {
      type: ActionType.ChatToolCallStart,
      toolName: "get_magic_word",
      contributor: { kind: ToolCallContributorKind.Client, clientId: "win-7" }
    });
  });
  test("dynamicToolCall item omits the Client contributor for a server tool", () => {
    const toolSet = new ActiveClientToolSet();
    toolSet.set("win-7", [{ name: "get_magic_word" }]);
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(["addComment"]), toolSet);
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_3", namespace: null, tool: "addComment", arguments: {}, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    assert.deepStrictEqual({
      type: start.type,
      toolName: start.toolName,
      contributor: start.contributor
    }, {
      type: ActionType.ChatToolCallStart,
      toolName: "addComment",
      contributor: void 0
    });
  });
  test("dynamicToolCall item omits the Client contributor for write_file", () => {
    const toolSet = new ActiveClientToolSet();
    toolSet.set("win-7", [{ name: "get_magic_word" }]);
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(["write_file"]), toolSet);
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_write", namespace: null, tool: "write_file", arguments: { path: "game.js", contents: "full" }, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const start = startActions[0];
    assert.deepStrictEqual({
      type: start.type,
      toolName: start.toolName,
      displayName: start.displayName,
      contributor: start.contributor
    }, {
      type: ActionType.ChatToolCallStart,
      toolName: "write_file",
      displayName: "Write File",
      contributor: void 0
    });
  });
  test("write_file dynamicToolCall complete includes FileEdit snapshots for live preview", () => {
    const state = createCodexSessionMapState(/* @__PURE__ */ new Set(["write_file"]));
    mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_write", namespace: null, tool: "write_file", arguments: { path: "game.js", contents: "full" }, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("dyn_write").toolCallId;
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///workspace/game.js", content: { uri: "session-db:///before" } },
      after: { uri: "file:///workspace/game.js", content: { uri: "session-db:///after" } },
      diff: { added: 12, removed: 0 }
    };
    const completeActions = mapItemCompleted(state, {
      item: { type: "dynamicToolCall", id: "dyn_write", namespace: null, tool: "write_file", arguments: { path: "game.js", contents: "full" }, status: "completed", contentItems: [{ type: "inputText", text: "Wrote game.js (4 characters)." }], success: true, durationMs: 5 },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    }, [fileEdit]);
    assert.deepStrictEqual(completeActions, [{
      type: ActionType.ChatToolCallComplete,
      turnId: "turn_a",
      toolCallId,
      result: {
        success: true,
        pastTenseMessage: "Wrote `game.js`",
        content: [
          { type: ToolResultContentType.Text, text: "Wrote game.js (4 characters)." },
          fileEdit
        ]
      }
    }]);
  });
  test("dynamicToolCall item maps to tool call lifecycle", () => {
    const state = createCodexSessionMapState();
    const startActions = mapItemStarted(state, {
      item: { type: "dynamicToolCall", id: "dyn_1", namespace: "client", tool: "lookup", arguments: { symbol: "A" }, status: "inProgress", contentItems: null, success: null, durationMs: null },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("dyn_1").toolCallId;
    const completeActions = mapItemCompleted(state, {
      item: { type: "dynamicToolCall", id: "dyn_1", namespace: "client", tool: "lookup", arguments: { symbol: "A" }, status: "completed", contentItems: [{ type: "inputText", text: "Found A" }, { type: "inputImage", imageUrl: "https://example.test/a.png" }], success: true, durationMs: 5 },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 0
    });
    assert.deepStrictEqual({
      startTypes: startActions.map((action) => action.type),
      delta: startActions[1],
      ready: startActions[2],
      completeActions,
      remainingToolCalls: state.itemToToolCall.size
    }, {
      startTypes: [ActionType.ChatToolCallStart, ActionType.ChatToolCallDelta, ActionType.ChatToolCallReady],
      delta: { type: ActionType.ChatToolCallDelta, turnId: "turn_a", toolCallId, content: '{\n  "symbol": "A"\n}' },
      ready: { type: ActionType.ChatToolCallReady, turnId: "turn_a", toolCallId, invocationMessage: "Calling client.lookup", toolInput: '{\n  "symbol": "A"\n}', confirmed: ToolCallConfirmationReason.NotNeeded },
      completeActions: [{ type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId, result: { success: true, pastTenseMessage: "Called client.lookup", content: [{ type: ToolResultContentType.Text, text: "Found A\nhttps://example.test/a.png" }] } }],
      remainingToolCalls: 0
    });
  });
  test("turn/completed with status=completed emits ChatTurnComplete", () => {
    const state = createCodexSessionMapState();
    state.currentTurnId = "turn_a";
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 1752012321,
        completedAt: 17520123235e-1,
        durationMs: 2500
      }
    });
    assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 2500 }]);
    assert.strictEqual(state.currentTurnId, void 0);
  });
  test("turn/completed does not infer dropped command success without an exit status", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "node -e writeFile()",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_1").toolCallId;
    const responseStarted = mapItemStarted(state, {
      item: { type: "agentMessage", id: "msg_1", text: "" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 1
    });
    const responseDelta = mapAgentMessageDelta(state, {
      threadId: "thr_1",
      turnId: "turn_a",
      itemId: "msg_1",
      delta: "done"
    });
    assert.deepStrictEqual({ responseStarted, responseDelta }, { responseStarted: [], responseDelta: [] });
    const partId = state.itemToPartId.get("msg_1");
    const notification = {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [{
          type: "commandExecution",
          id: "cmd_1",
          command: "node -e writeFile()",
          cwd: "/tmp",
          processId: null,
          source: "agent",
          status: "completed",
          commandActions: [],
          aggregatedOutput: "",
          exitCode: null,
          durationMs: 2
        }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: 3
      }
    };
    const actions = mapTurnCompleted(state, notification);
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: { success: false, pastTenseMessage: "Stopped shell", content: void 0, error: { message: "Turn completed before the tool reported completion" } }
      },
      { type: ActionType.ChatResponsePart, turnId: "turn_a", part: { kind: ResponsePartKind.Markdown, id: partId, content: "" } },
      { type: ActionType.ChatDelta, turnId: "turn_a", partId, content: "done" },
      { type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 3 }
    ]);
  });
  test("turn/completed recovers a command result with an observed exit status", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "node -e writeFile()",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_1").toolCallId;
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [{
          type: "commandExecution",
          id: "cmd_1",
          command: "node -e writeFile()",
          cwd: "/tmp",
          processId: null,
          source: "agent",
          status: "completed",
          commandActions: [],
          aggregatedOutput: "done",
          exitCode: 0,
          durationMs: 2
        }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: 3
      }
    });
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Ran `node -e writeFile()`",
          content: [{ type: ToolResultContentType.Text, text: "done" }],
          error: void 0
        }
      },
      { type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 3 }
    ]);
  });
  test("turn/completed does not recover a non-command tool through the pure mapper", () => {
    const state = createCodexSessionMapState();
    state.itemToToolCall.set("tool_1", { toolCallId: "tc_1", turnId: "turn_a", toolName: "web_search", output: "" });
    const responseStarted = mapItemStarted(state, {
      item: { type: "agentMessage", id: "msg_1", text: "" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 1
    });
    const partId = state.itemToPartId.get("msg_1");
    assert.deepStrictEqual(responseStarted, [
      { type: ActionType.ChatResponsePart, turnId: "turn_a", part: { kind: ResponsePartKind.Markdown, id: partId, content: "" } }
    ]);
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [{ type: "webSearch", id: "tool_1", query: "query", action: { type: "search", query: "query" } }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: 3
      }
    });
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId: "tc_1",
        result: { success: false, pastTenseMessage: "Stopped web_search", content: void 0, error: { message: "Turn completed before the tool reported completion" } }
      },
      { type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 3 }
    ]);
  });
  test("superseding a pending pre-flight releases its deferred response before the next response", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "node -e writeFile()",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_1").toolCallId;
    const firstResponse = mapItemStarted(state, {
      item: { type: "agentMessage", id: "msg_1", text: "" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 1
    });
    assert.deepStrictEqual(firstResponse, []);
    const firstPartId = state.itemToPartId.get("msg_1");
    const completed = mapItemCompleted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "node -e writeFile()",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "completed",
        commandActions: [],
        aggregatedOutput: "",
        exitCode: 0,
        durationMs: 2
      },
      threadId: "thr_1",
      turnId: "turn_a",
      completedAtMs: 2
    });
    assert.deepStrictEqual(completed, []);
    const nextResponse = mapItemStarted(state, {
      item: { type: "agentMessage", id: "msg_2", text: "" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 3
    });
    const secondPartId = state.itemToPartId.get("msg_2");
    assert.deepStrictEqual(nextResponse, [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: true,
          pastTenseMessage: "Ran `node -e writeFile()`",
          content: void 0,
          error: void 0
        }
      },
      { type: ActionType.ChatResponsePart, turnId: "turn_a", part: { kind: ResponsePartKind.Markdown, id: firstPartId, content: "" } },
      { type: ActionType.ChatResponsePart, turnId: "turn_a", part: { kind: ResponsePartKind.Markdown, id: secondPartId, content: "\n\n" } }
    ]);
  });
  test("steering finalization completes open commands before deferred response actions", () => {
    const state = createCodexSessionMapState();
    mapItemStarted(state, {
      item: {
        type: "commandExecution",
        id: "cmd_1",
        command: "node -e writeFile()",
        cwd: "/tmp",
        processId: null,
        source: "agent",
        status: "inProgress",
        commandActions: [],
        aggregatedOutput: null,
        exitCode: null,
        durationMs: null
      },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 0
    });
    const toolCallId = state.itemToToolCall.get("cmd_1").toolCallId;
    assert.deepStrictEqual(mapItemStarted(state, {
      item: { type: "agentMessage", id: "msg_1", text: "done" },
      threadId: "thr_1",
      turnId: "turn_a",
      startedAtMs: 1
    }), []);
    const partId = state.itemToPartId.get("msg_1");
    const actions = finalizeCodexTurnMapState(state, "Turn was superseded by a steering message before the tool reported completion");
    assert.deepStrictEqual(actions, [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: "turn_a",
        toolCallId,
        result: {
          success: false,
          pastTenseMessage: "Stopped shell",
          content: void 0,
          error: { message: "Turn was superseded by a steering message before the tool reported completion" }
        }
      },
      { type: ActionType.ChatResponsePart, turnId: "turn_a", part: { kind: ResponsePartKind.Markdown, id: partId, content: "done" } }
    ]);
    assert.deepStrictEqual({
      toolCalls: state.itemToToolCall.size,
      deferredResponses: state.deferredResponseActions.length,
      pendingPreflight: state.pendingPreflight
    }, {
      toolCalls: 0,
      deferredResponses: 0,
      pendingPreflight: void 0
    });
  });
  test("turn/completed completes orphaned tool calls before completing the turn", () => {
    const state = createCodexSessionMapState();
    state.itemToToolCall.set("cmd_1", { toolCallId: "tc_1", turnId: "turn_a", toolName: "shell", output: "partial output" });
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    }, 321);
    const completeAction = actions[1];
    const { duration: completeDuration, ...completeRest } = completeAction;
    assert.deepStrictEqual({ actions: [actions[0], completeRest], remainingToolCalls: state.itemToToolCall.size }, {
      actions: [
        { type: ActionType.ChatToolCallComplete, turnId: "turn_a", toolCallId: "tc_1", result: { success: false, pastTenseMessage: "Stopped shell", content: [{ type: ToolResultContentType.Text, text: "partial output" }], error: { message: "Turn completed before the tool reported completion" } } },
        { type: ActionType.ChatTurnComplete, turnId: "turn_a" }
      ],
      remainingToolCalls: 0
    });
    assert.strictEqual(completeDuration, 321);
  });
  test("turn/completed with status=failed emits ChatError + ChatTurnComplete", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "failed",
        error: { message: "boom" },
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    assert.deepStrictEqual(actions, [
      { type: ActionType.ChatError, turnId: "turn_a", duration: 0, error: { errorType: "CodexError", message: "boom" } },
      { type: ActionType.ChatTurnComplete, turnId: "turn_a", duration: 0 }
    ]);
  });
  test("turn/completed with status=interrupted emits ChatTurnCancelled", () => {
    const state = createCodexSessionMapState();
    const actions = mapTurnCompleted(state, {
      threadId: "thr_1",
      turn: {
        id: "turn_a",
        items: [],
        itemsView: { type: "full" },
        status: "interrupted",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }
    });
    assert.deepStrictEqual(actions, [{ type: ActionType.ChatTurnCancelled, turnId: "turn_a", duration: 0 }]);
  });
  test("turnStateFromStatus maps strings correctly", () => {
    assert.strictEqual(turnStateFromStatus("completed"), TurnState.Complete);
    assert.strictEqual(turnStateFromStatus("interrupted"), TurnState.Cancelled);
    assert.strictEqual(turnStateFromStatus("failed"), TurnState.Error);
    assert.strictEqual(turnStateFromStatus("weird"), TurnState.Complete);
  });
  test("extractUserInputText joins text inputs and ignores non-text", () => {
    assert.strictEqual(
      extractUserInputText([
        { type: "text", text: "first", text_elements: [] },
        { type: "image", url: "http://x/y.png" },
        { type: "text", text: "second", text_elements: [] },
        { type: "mention", name: "foo", path: "/foo" }
      ]),
      "first\n\nsecond"
    );
    assert.strictEqual(extractUserInputText([]), "");
    assert.strictEqual(extractUserInputText([{ type: "image", url: "http://x/y.png" }]), "");
  });
  test("resetCodexTurnMapState clears item maps but preserves currentTurnId", () => {
    const state = createCodexSessionMapState();
    state.currentTurnId = "turn_a";
    state.itemToPartId.set("i1", "p1");
    state.itemToToolCall.set("i2", { toolCallId: "tc", turnId: "turn_a", toolName: "shell", output: "" });
    state.itemToReasoningPartId.set("i3", "r1");
    state.declinedToolCalls.add("tc-stale");
    resetCodexTurnMapState(state);
    assert.deepStrictEqual({
      currentTurnId: state.currentTurnId,
      parts: state.itemToPartId.size,
      toolCalls: state.itemToToolCall.size,
      reasoning: state.itemToReasoningPartId.size,
      declined: state.declinedToolCalls.size
    }, { currentTurnId: "turn_a", parts: 0, toolCalls: 0, reasoning: 0, declined: 0 });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhNYXBBcHBTZXJ2ZXJFdmVudHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVhZEFnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21ldGEvYWdlbnRNZXNzYWdlRGVsZWdhdGlvbk1ldGEuanMnO1xuaW1wb3J0IHsgTElWRV9QUkVWSUVXX1VOQVZBSUxBQkxFX01FU1NBR0UgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4RmlsZUVkaXRPYnNlcnZlci5qcyc7XG5pbXBvcnQgeyBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSwgZXh0cmFjdFVzZXJJbnB1dFRleHQsIGZpbmFsaXplQ29kZXhUdXJuTWFwU3RhdGUsIG1hcEFnZW50TWVzc2FnZURlbHRhLCBtYXBDb21tYW5kRXhlY3V0aW9uT3V0cHV0RGVsdGEsIG1hcEVycm9yTm90aWZpY2F0aW9uLCBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkLCBtYXBGaWxlQ2hhbmdlU3RhcnRlZCwgbWFwSXRlbUNvbXBsZXRlZCwgbWFwSXRlbVN0YXJ0ZWQsIG1hcE1jcFRvb2xDYWxsUHJvZ3Jlc3MsIG1hcFJlYXNvbmluZ1N1bW1hcnlQYXJ0QWRkZWQsIG1hcFJlYXNvbmluZ1N1bW1hcnlUZXh0RGVsdGEsIG1hcFJlYXNvbmluZ1RleHREZWx0YSwgbWFwVG9rZW5Vc2FnZVVwZGF0ZWQsIG1hcFR1cm5Db21wbGV0ZWQsIG1hcFR1cm5EaWZmVXBkYXRlZCwgbWFwVHVyblN0YXJ0ZWQsIHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUsIHR1cm5TdGF0ZUZyb21TdGF0dXMgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2NvZGV4L2NvZGV4TWFwQXBwU2VydmVyRXZlbnRzLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUsIHR5cGUgQ2hhdEFjdGlvbiwgdHlwZSBTZXNzaW9uQWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25BY3Rpb25zLmpzJztcbmltcG9ydCB7IGNoYXRSZWR1Y2VyIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3JlZHVjZXJzLmpzJztcbmltcG9ydCB7IENoYXRPcmlnaW5LaW5kLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgU2Vzc2lvblN0YXR1cywgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgdHlwZSBDaGF0U3RhdGUgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi8uLi8uLi9ub2RlL2FjdGl2ZUNsaWVudFN0YXRlLmpzJztcblxuLyoqIEV4dHJhY3RzIHRoZSBjb250ZW50IG9mIGEgTWFya2Rvd24gcmVzcG9uc2UgcGFydCBlbWl0dGVkIGJ5IGEgbWFwcGVyIGFjdGlvbi4gKi9cbmZ1bmN0aW9uIG1hcmtkb3duUGFydENvbnRlbnQoYWN0aW9uOiBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbiB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBhY3Rpb24/LnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCAmJiBhY3Rpb24ucGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duXG5cdFx0PyBhY3Rpb24ucGFydC5jb250ZW50XG5cdFx0OiB1bmRlZmluZWQ7XG59XG5cbnN1aXRlKCdjb2RleE1hcEFwcFNlcnZlckV2ZW50cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlcnJvciBub3RpZmljYXRpb24gc3VyZmFjZXMgcmV0cnkgYWN0aXZpdHkgYW5kIHRlcm1pbmFsIGZhaWx1cmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgZXJyb3IgPSB7IG1lc3NhZ2U6ICdyZXF1ZXN0IHRpbWVkIG91dCcsIGNvZGV4RXJyb3JJbmZvOiBudWxsLCBhZGRpdGlvbmFsRGV0YWlsczogbnVsbCB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cmV0cnlpbmc6IG1hcEVycm9yTm90aWZpY2F0aW9uKHsgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ2FwcF90dXJuJywgZXJyb3IsIHdpbGxSZXRyeTogdHJ1ZSB9LCAnaG9zdF90dXJuJywgMTAwKSxcblx0XHRcdGZhaWxlZDogbWFwRXJyb3JOb3RpZmljYXRpb24oeyB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAnYXBwX3R1cm4nLCBlcnJvciwgd2lsbFJldHJ5OiBmYWxzZSB9LCAnaG9zdF90dXJuJywgMjAwKSxcblx0XHR9LCB7XG5cdFx0XHRyZXRyeWluZzogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0QWN0aXZpdHlDaGFuZ2VkLCBhY3Rpdml0eTogJ0NvZGV4IGNvbm5lY3Rpb24gaW50ZXJydXB0ZWQ7IHJldHJ5aW5nLi4uJyB9XSxcblx0XHRcdGZhaWxlZDogW1xuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEFjdGl2aXR5Q2hhbmdlZCwgYWN0aXZpdHk6IHVuZGVmaW5lZCB9LFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICdob3N0X3R1cm4nLCBkdXJhdGlvbjogMjAwLCBlcnJvcjogeyBlcnJvclR5cGU6ICdDb2RleEVycm9yJywgbWVzc2FnZTogJ3JlcXVlc3QgdGltZWQgb3V0JyB9IH0sXG5cdFx0XHRdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuL3N0YXJ0ZWQgZW1pdHMgQ2hhdFR1cm5TdGFydGVkIHdpdGggdXNlciBtZXNzYWdlIHRleHQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRpZDogJ2l0ZW1fdXNlcicsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6IG51bGwsXG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnaGVsbG8nLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSxcblx0XHRcdFx0fV0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDFfNzUyXzAxMl8zMjEsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSxcblx0XHR9LCAnZmFsbGJhY2snKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuY3VycmVudFR1cm5JZCwgJ3R1cm5fYScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5TdGFydGVkLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDctMDhUMjI6MDU6MjEuMDAwWicsXG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdoZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4vc3RhcnRlZCBmYWxscyBiYWNrIHRvIHByb3ZpZGVkIHRleHQgd2hlbiBpdGVtcyBoYXMgbm8gdXNlck1lc3NhZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9iJyxcblx0XHRcdFx0aXRlbXM6IFtdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLFxuXHRcdFx0XHRjb21wbGV0ZWRBdDogbnVsbCxcblx0XHRcdFx0ZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSwgJ3RoZSBwcm9tcHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGFjdGlvbnNbMF0gYXMgeyBtZXNzYWdlOiB7IHRleHQ6IHN0cmluZyB9IH0pLm1lc3NhZ2UudGV4dCwgJ3RoZSBwcm9tcHQnKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9zdGFydGVkIGV4cG9zZXMgYSBkZWxlZ2F0ZWQgcHJvbXB0IHdpdGhvdXQgaXRzIHByaXZhdGUgZW52ZWxvcGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5TdGFydGVkKGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCksIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fZGVsZWdhdGVkJyxcblx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRpZDogJ2l0ZW1fdXNlcicsXG5cdFx0XHRcdFx0Y2xpZW50SWQ6IG51bGwsXG5cdFx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHRcdHRleHQ6ICc8Y29kZXhfZGVsZWdhdGlvbj48c291cmNlX3RocmVhZF9pZD5zb3VyY2UtdGhyZWFkPC9zb3VyY2VfdGhyZWFkX2lkPjxpbnB1dD5SZXZpZXcgJmx0O3RoaXMmZ3Q7PC9pbnB1dD48L2NvZGV4X2RlbGVnYXRpb24+Jyxcblx0XHRcdFx0XHRcdHRleHRfZWxlbWVudHM6IFtdLFxuXHRcdFx0XHRcdH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG51bGwsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9LFxuXHRcdH0sICcnKTtcblx0XHRjb25zdCBhY3Rpb24gPSBhY3Rpb25zWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb24udHlwZSwgQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQpO1xuXHRcdGlmIChhY3Rpb24udHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0ZXh0OiBhY3Rpb24ubWVzc2FnZS50ZXh0LFxuXHRcdFx0ZGVsZWdhdGlvbjogcmVhZEFnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhKGFjdGlvbi5tZXNzYWdlKSxcblx0XHR9LCB7XG5cdFx0XHR0ZXh0OiAnUmV2aWV3IDx0aGlzPicsXG5cdFx0XHRkZWxlZ2F0aW9uOiB7IHNvdXJjZVRocmVhZElkOiAnc291cmNlLXRocmVhZCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9zdGFydGVkIHVzZXMgYSBjdXJyZW50IHRpbWVzdGFtcCB3aGVuIENvZGV4IG9taXRzIHN0YXJ0ZWRBdCcsICgpID0+IHtcblx0XHRjb25zdCBiZWZvcmUgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5TdGFydGVkKGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCksIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYycsXG5cdFx0XHRcdGl0ZW1zOiBbXSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG51bGwsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9LFxuXHRcdH0sICdwcm9tcHQnKTtcblxuXHRcdGNvbnN0IHN0YXJ0ZWRBdCA9IGFjdGlvbnNbMF0udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VHVyblN0YXJ0ZWQgPyBhY3Rpb25zWzBdLnN0YXJ0ZWRBdCA6IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2sodHlwZW9mIHN0YXJ0ZWRBdCA9PT0gJ3N0cmluZycgJiYgc3RhcnRlZEF0ID49IGJlZm9yZSAmJiBzdGFydGVkQXQgPD0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9zdGFydGVkIGZvciBhZ2VudE1lc3NhZ2Ugc2VlZHMgYSBtYXJrZG93biBwYXJ0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnaXRlbV94JywgdGV4dDogJycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0c3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGFjdGlvbnMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBhID0gYWN0aW9uc1swXSBhcyB7IHR5cGU6IEFjdGlvblR5cGU7IHR1cm5JZDogc3RyaW5nOyBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQ7IGlkOiBzdHJpbmc7IGNvbnRlbnQ6IHN0cmluZyB9IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGEudHlwZSwgQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS50dXJuSWQsICd0dXJuX2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYS5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0eXBlb2YgYS5wYXJ0LmlkLCAnc3RyaW5nJyk7XG5cdFx0YXNzZXJ0Lm9rKGEucGFydC5pZC5sZW5ndGggPiAwKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaXRlbVRvUGFydElkLmdldCgnaXRlbV94JyksIGEucGFydC5pZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vc3RhcnRlZCBmb3Igbm9uLWFnZW50TWVzc2FnZSBpdGVtIGlzIGlnbm9yZWQgKFBoYXNlIDIpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ3BsYW4nLCBpZDogJ2l0ZW1fcCcsIHRleHQ6ICdwbGFuIHRleHQnIH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHRzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFtdKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaXRlbVRvUGFydElkLnNpemUsIDApO1xuXHR9KTtcblxuXHR0ZXN0KCdpdGVtL2FnZW50TWVzc2FnZS9kZWx0YSBlbWl0cyBDaGF0RGVsdGEgZm9yIGtub3duIGl0ZW1JZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnaXRlbV94JywgdGV4dDogJycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ2l0ZW1feCcpITtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwQWdlbnRNZXNzYWdlRGVsdGEoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdGl0ZW1JZDogJ2l0ZW1feCcsXG5cdFx0XHRkZWx0YTogJ2NodW5rJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXREZWx0YSxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHRwYXJ0SWQsXG5cdFx0XHRjb250ZW50OiAnY2h1bmsnLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9hZ2VudE1lc3NhZ2UvZGVsdGEgZm9yIHVua25vd24gaXRlbUlkIGlzIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBBZ2VudE1lc3NhZ2VEZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3Vua25vd24nLCBkZWx0YTogJ29ycGhhbicsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vcmVhc29uaW5nIHN1bW1hcnkgZXZlbnRzIHNlZWQgYSByZWFzb25pbmcgcGFydCBhbmQgc3RyZWFtIGRlbHRhcycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAncnNfMScsIHN1bW1hcnlJbmRleDogMCxcblx0XHR9KTtcblx0XHRjb25zdCBwYXJ0SWQgPSBzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuZ2V0KCdyc18xOnN1bW1hcnk6MCcpO1xuXHRcdGNvbnN0IGRlbHRhID0gbWFwUmVhc29uaW5nU3VtbWFyeVRleHREZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3JzXzEnLCBzdW1tYXJ5SW5kZXg6IDAsIGRlbHRhOiAndGhpbmtpbmcnLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnQ6IHN0YXJ0Lm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0cGFydEtpbmQ6IHN0YXJ0WzBdPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgPyBzdGFydFswXS5wYXJ0LmtpbmQgOiB1bmRlZmluZWQsXG5cdFx0XHRkZWx0YSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydDogW0FjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydF0sXG5cdFx0XHRwYXJ0S2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRkZWx0YTogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0SWQsIGNvbnRlbnQ6ICd0aGlua2luZycsIF9tZXRhOiB7IGNvZGV4UmVhc29uaW5nS2luZDogJ3N1bW1hcnknIH0gfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vcmVhc29uaW5nIHRleHQgZGVsdGEgY3JlYXRlcyBhIHJlYXNvbmluZyBwYXJ0IHdoZW4gc3RhcnQgd2FzIG1pc3NlZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFJlYXNvbmluZ1RleHREZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ3JzXzInLCBjb250ZW50SW5kZXg6IDEsIGRlbHRhOiAncmF3IHRob3VnaHQnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5nZXQoJ3JzXzI6dGV4dDoxJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0eXBlczogYWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSxcblx0XHRcdHBhcnRLaW5kOiBhY3Rpb25zWzBdPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQgPyBhY3Rpb25zWzBdLnBhcnQua2luZCA6IHVuZGVmaW5lZCxcblx0XHRcdGRlbHRhOiBhY3Rpb25zWzFdLFxuXHRcdH0sIHtcblx0XHRcdHR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmddLFxuXHRcdFx0cGFydEtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLFxuXHRcdFx0ZGVsdGE6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVhc29uaW5nLCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0SWQsIGNvbnRlbnQ6ICdyYXcgdGhvdWdodCcsIF9tZXRhOiB7IGNvZGV4UmVhc29uaW5nS2luZDogJ3RleHQnIH0gfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWFkL3Rva2VuVXNhZ2UvdXBkYXRlZCBlbWl0cyBDaGF0VXNhZ2UgZm9yIHRoZSB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUb2tlblVzYWdlVXBkYXRlZCh7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHR0b2tlblVzYWdlOiB7XG5cdFx0XHRcdGxhc3Q6IHsgaW5wdXRUb2tlbnM6IDEwLCBjYWNoZWRJbnB1dFRva2VuczogNCwgY2FjaGVXcml0ZUlucHV0VG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDYsIHJlYXNvbmluZ091dHB1dFRva2VuczogMiwgdG90YWxUb2tlbnM6IDE2IH0sXG5cdFx0XHRcdHRvdGFsOiB7IGlucHV0VG9rZW5zOiAxMDAsIGNhY2hlZElucHV0VG9rZW5zOiA0MCwgY2FjaGVXcml0ZUlucHV0VG9rZW5zOiAwLCBvdXRwdXRUb2tlbnM6IDYwLCByZWFzb25pbmdPdXRwdXRUb2tlbnM6IDIwLCB0b3RhbFRva2VuczogMTYwIH0sXG5cdFx0XHRcdG1vZGVsQ29udGV4dFdpbmRvdzogMjAwMDAwLFxuXHRcdFx0fSxcblx0XHR9LCAnY29kZXgtbW9kZWw6b3BlbmFpOmdwdC01LjYtc29sJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0aW5wdXRUb2tlbnM6IDEwLFxuXHRcdFx0XHRvdXRwdXRUb2tlbnM6IDYsXG5cdFx0XHRcdG1vZGVsOiAnY29kZXgtbW9kZWw6b3BlbmFpOmdwdC01LjYtc29sJyxcblx0XHRcdFx0Y2FjaGVSZWFkVG9rZW5zOiA0LFxuXHRcdFx0XHRfbWV0YTogeyByZWFzb25pbmdPdXRwdXRUb2tlbnM6IDIsIG1vZGVsQ29udGV4dFdpbmRvdzogMjAwMDAwIH0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnY29udGV4dENvbXBhY3Rpb24gaXRlbSBtYXBzIHRvIHZpc2libGUgcnVubmluZyBhbmQgY29tcGxldGVkIHByb2dyZXNzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydGVkID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2NvbnRleHRDb21wYWN0aW9uJywgaWQ6ICdjb21wYWN0XzEnIH0sXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29tcGFjdF8xJyk/LnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgY29tcGxldGVkID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnY29udGV4dENvbXBhY3Rpb24nLCBpZDogJ2NvbXBhY3RfMScgfSxcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAxLFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHN0YXJ0ZWQsIGNvbXBsZXRlZCwgcmVtYWluaW5nOiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zaXplIH0sIHtcblx0XHRcdHN0YXJ0ZWQ6IFtcblx0XHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCB0b29sTmFtZTogJ2NvbXBhY3QnLCBkaXNwbGF5TmFtZTogJ0NvbXBhY3QgY29udmVyc2F0aW9uJyB9LFxuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnQ29tcGFjdGluZyBjb252ZXJzYXRpb24nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9LFxuXHRcdFx0XSxcblx0XHRcdGNvbXBsZXRlZDogW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdDb21wYWN0ZWQgY29udmVyc2F0aW9uJyB9LFxuXHRcdFx0fV0sXG5cdFx0XHRyZW1haW5pbmc6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2l0ZW0vY29tcGxldGVkIGZvciBhZ2VudE1lc3NhZ2UgY2xlYXJzIHRoZSBtYXBwaW5nJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdpdGVtX3gnLCB0ZXh0OiAnJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLml0ZW1Ub1BhcnRJZC5zaXplLCAxKTtcblx0XHRtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2l0ZW1feCcsIHRleHQ6ICdmaW5hbCcsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLml0ZW1Ub1BhcnRJZC5zaXplLCAwKTtcblx0fSk7XG5cblx0dGVzdCgnc2Vjb25kIGFnZW50TWVzc2FnZSBpbiBhIHR1cm4gaXMgc2VlZGVkIHdpdGggYSBsZWFkaW5nIGJsb2NrIHNlcGFyYXRvcicsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgZmlyc3QgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMScsIHRleHQ6ICdDb25zb2xpZGF0aW5nIHRoZSByZWNvbW1lbmRhdGlvbiBhbmQgdHJhZGVvZmZzLicsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ20yJywgdGV4dDogJyMjIENvbmNsdXNpb24nLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0OiBtYXJrZG93blBhcnRDb250ZW50KGZpcnN0WzBdKSxcblx0XHRcdHNlY29uZDogbWFya2Rvd25QYXJ0Q29udGVudChzZWNvbmRbMF0pLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0OiAnQ29uc29saWRhdGluZyB0aGUgcmVjb21tZW5kYXRpb24gYW5kIHRyYWRlb2Zmcy4nLFxuXHRcdFx0c2Vjb25kOiAnXFxuXFxuIyMgQ29uY2x1c2lvbicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FnZW50TWVzc2FnZSBibG9jayBzZXBhcmF0b3IgY291bnRlciByZXNldHMgcGVyIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7IGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbTEnLCB0ZXh0OiAnYScsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LCB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAgfSk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHsgaXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMicsIHRleHQ6ICdiJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sIHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCB9KTtcblx0XHQvLyBBIG5ldyB0dXJuIHJlc2V0cyB0aGUgY291bnRlciwgc28gaXRzIGZpcnN0IGFnZW50TWVzc2FnZSBpcyB1bnNlZWRlZC5cblx0XHRyZXNldENvZGV4VHVybk1hcFN0YXRlKHN0YXRlKTtcblx0XHRjb25zdCBmaXJzdE9mTmV4dFR1cm4gPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwgeyBpdGVtOiB7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ20zJywgdGV4dDogJ2MnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSwgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYicsIHN0YXJ0ZWRBdE1zOiAwIH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChtYXJrZG93blBhcnRDb250ZW50KGZpcnN0T2ZOZXh0VHVyblswXSksICdjJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkamFjZW50IGFnZW50TWVzc2FnZXMga2VlcCBhIE1hcmtkb3duIGhlYWRpbmcgb24gaXRzIG93biBsaW5lIGFmdGVyIGNvYWxlc2NpbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGxldCBjaGF0OiBDaGF0U3RhdGUgPSB7XG5cdFx0XHRyZXNvdXJjZTogJ2FocC1jaGF0Oi8vdGVzdCcsXG5cdFx0XHR0aXRsZTogJ1Rlc3QnLFxuXHRcdFx0c3RhdHVzOiBTZXNzaW9uU3RhdHVzLklkbGUsXG5cdFx0XHRtb2RpZmllZEF0OiBuZXcgRGF0ZSgwKS50b0lTT1N0cmluZygpLFxuXHRcdFx0b3JpZ2luOiB7IGtpbmQ6IENoYXRPcmlnaW5LaW5kLlVzZXIgfSxcblx0XHRcdHR1cm5zOiBbXSxcblx0XHRcdGFjdGl2ZVR1cm46IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdGNvbnN0IGFwcGx5ID0gKGFjdGlvbnM6IHJlYWRvbmx5IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSkgPT4ge1xuXHRcdFx0Zm9yIChjb25zdCBhY3Rpb24gb2YgYWN0aW9ucykge1xuXHRcdFx0XHRjaGF0ID0gY2hhdFJlZHVjZXIoY2hhdCwgYWN0aW9uIGFzIENoYXRBY3Rpb24pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0YXBwbHkobWFwVHVyblN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjogeyBpZDogJ3R1cm5fYScsIGl0ZW1zOiBbXSwgaXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlciwgZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwgfSxcblx0XHR9LCAncHJvbXB0JykpO1xuXHRcdC8vIFByZWFtYmxlIG1lc3NhZ2UsIHRoZW4gdGhlIGZpbmFsLWFuc3dlciBtZXNzYWdlOyB0d28gZGlzdGluY3QgaXRlbXMuXG5cdFx0YXBwbHkobWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHsgaXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMScsIHRleHQ6ICcnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSwgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwIH0pKTtcblx0XHRhcHBseShtYXBBZ2VudE1lc3NhZ2VEZWx0YShzdGF0ZSwgeyB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAnbTEnLCBkZWx0YTogJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuJyB9KSk7XG5cdFx0YXBwbHkobWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHsgaXRlbTogeyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMicsIHRleHQ6ICcnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSwgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwIH0pKTtcblx0XHRhcHBseShtYXBBZ2VudE1lc3NhZ2VEZWx0YShzdGF0ZSwgeyB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAnbTInLCBkZWx0YTogJyMjIENvbmNsdXNpb25cXG5cXG5Eb25lLicgfSkpO1xuXG5cdFx0Ly8gQWRqYWNlbnQgbWFya2Rvd24gcGFydHMgYXJlIGNvYWxlc2NlZCBieSBwbGFpbiBjb25jYXRlbmF0aW9uLCBzbyB0aGVcblx0XHQvLyBqb2luZWQgdGV4dCBtdXN0IGtlZXAgYCMjIENvbmNsdXNpb25gIGF0IHRoZSBzdGFydCBvZiBhIGxpbmUuXG5cdFx0Y29uc3Qgam9pbmVkID0gKGNoYXQuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cyA/PyBbXSlcblx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyBwYXJ0LmNvbnRlbnQgOiAnJylcblx0XHRcdC5qb2luKCcnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoam9pbmVkLCAnQ29uc29saWRhdGluZyB0aGUgcmVjb21tZW5kYXRpb24gYW5kIHRyYWRlb2Zmcy5cXG5cXG4jIyBDb25jbHVzaW9uXFxuXFxuRG9uZS4nKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9zdGFydGVkIGZvciBjb21tYW5kRXhlY3V0aW9uIGVtaXRzIENoYXRUb29sQ2FsbFN0YXJ0ICsgRGVsdGEgKyBSZWFkeSBhbmQgcmVnaXN0ZXJzIHRvb2wtY2FsbCBlbnRyeScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfMScsXG5cdFx0XHRcdGNvbW1hbmQ6ICdscyAtbGEnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsXG5cdFx0XHRcdGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gYWN0aW9uc1swXTtcblx0XHRjb25zdCBkZWx0YSA9IGFjdGlvbnNbMV07XG5cdFx0Y29uc3QgcmVhZHkgPSBhY3Rpb25zWzJdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50eXBlLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGVsdGEudHlwZSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlYWR5LnR5cGUsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpO1xuXHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfMScpO1xuXHRcdGFzc2VydC5vayhlbnRyeSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5IS50b29sQ2FsbElkLCAoc3RhcnQgYXMgeyB0b29sQ2FsbElkOiBzdHJpbmcgfSkudG9vbENhbGxJZCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGVudHJ5IS50dXJuSWQsICd0dXJuX2EnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGRlbHRhIGFzIHsgY29udGVudDogc3RyaW5nIH0pLmNvbnRlbnQsICdscyAtbGEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlYWR5IGFzIHsgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiB9KS5jb25maXJtZWQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCgoc3RhcnQgYXMgeyBfbWV0YT86IFJlY29yZDxzdHJpbmcsIHVua25vd24+IH0pLl9tZXRhLCB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb21tYW5kRXhlY3V0aW9uIHVud3JhcHMgdGhlIE9TIHNoZWxsIHdyYXBwZXIgZm9yIGRpc3BsYXkgKHN0YXJ0ICsgY29tcGxldGVkKScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRlZCA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfd3JhcCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICcvYmluL3pzaCAtbGMgXFwndG91Y2ggfi9mb29cXCcnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsXG5cdFx0XHRcdGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBkZWx0YSA9IHN0YXJ0ZWRbMV0gYXMgeyBjb250ZW50OiBzdHJpbmcgfTtcblx0XHRjb25zdCByZWFkeSA9IHN0YXJ0ZWRbMl0gYXMgeyBpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nOyB0b29sSW5wdXQ6IHN0cmluZyB9O1xuXHRcdC8vIEEgc3VjY2Vzc2Z1bCBuby1vdXRwdXQgY29tbWFuZCBpcyBkZWZlcnJlZCB0byBjb2FsZXNjZSBhIHBvc3NpYmxlXG5cdFx0Ly8gc2FuZGJveCBwcmUtZmxpZ2h0IHJlLXJ1bjsgd2l0aCBubyByZS1ydW4gaXQgZmx1c2hlcyBhdCB0dXJuIGVuZC5cblx0XHRjb25zdCBkZWZlcnJlZCA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF93cmFwJyxcblx0XHRcdFx0Y29tbWFuZDogJy9iaW4venNoIC1sYyBcXCd0b3VjaCB+L2Zvb1xcJycsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnJyxcblx0XHRcdFx0ZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDQsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZmx1c2hlZCA9IG1hcFR1cm5Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXSwgaXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSBhcyBuZXZlcik7XG5cdFx0Y29uc3QgY29tcGxldGUgPSBmbHVzaGVkWzBdIGFzIHsgcmVzdWx0OiB7IHBhc3RUZW5zZU1lc3NhZ2U6IHN0cmluZyB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRkZWZlcnJlZCxcblx0XHRcdGRlbHRhOiBkZWx0YS5jb250ZW50LFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHJlYWR5Lmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0dG9vbElucHV0OiByZWFkeS50b29sSW5wdXQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBjb21wbGV0ZS5yZXN1bHQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHR9LCB7XG5cdFx0XHRkZWZlcnJlZDogW10sXG5cdFx0XHRkZWx0YTogJ3RvdWNoIH4vZm9vJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAndG91Y2ggfi9mb28nLFxuXHRcdFx0dG9vbElucHV0OiAndG91Y2ggfi9mb28nLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBgdG91Y2ggfi9mb29gJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWFuZEV4ZWN1dGlvbiBjb2FsZXNjZXMgYSBzYW5kYm94IHByZS1mbGlnaHQgd2l0aCBpdHMgYXBwcm92ZWQgcmUtcnVuIGludG8gb25lIGJveCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Ly8gUHJlLWZsaWdodDogY29kZXggcnVucyB0aGUgY29tbWFuZCBpbiB0aGUgc2FuZGJveCBmaXJzdDsgaXQgcHJvZHVjZXNcblx0XHQvLyBubyBvdXRwdXQgYW5kIGNvbXBsZXRlcyBzdWNjZXNzZnVsbHkuXG5cdFx0Y29uc3QgcHJlU3RhcnRlZCA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfcHJlZmxpZ2h0Jyxcblx0XHRcdFx0Y29tbWFuZDogJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogbnVsbCwgZXhpdENvZGU6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NtZF9wcmVmbGlnaHQnKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBwcmVDb21wbGV0ZWQgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfcHJlZmxpZ2h0Jyxcblx0XHRcdFx0Y29tbWFuZDogJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDQsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Ly8gRXNjYWxhdGlvbjogc2FtZSBjb21tYW5kIHJlLXJ1biB1bmRlciBhbiBhcHByb3ZhbCBwcm9tcHQsIG5ldyBpdGVtIGlkLlxuXHRcdGNvbnN0IGVzY1N0YXJ0ZWQgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX2VzY2FsYXRlZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBlc2NDb21wbGV0ZWQgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfZXNjYWxhdGVkJyxcblx0XHRcdFx0Y29tbWFuZDogJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnRXhhbXBsZSBEb21haW4nLCBleGl0Q29kZTogMCwgZHVyYXRpb25NczogNDAsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhcnRDb3VudCA9IChhY3Rpb25zOiByZWFkb25seSB1bmtub3duW10pID0+IGFjdGlvbnMuZmlsdGVyKGEgPT4gKGEgYXMgeyB0eXBlOiBBY3Rpb25UeXBlIH0pLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQpLmxlbmd0aDtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdC8vIGV4YWN0bHkgb25lIGJveCBvcGVuZWQgKHByZS1mbGlnaHQncyksIGVzY2FsYXRpb24gcmV1c2VzIGl0XG5cdFx0XHRzdGFydHM6IHN0YXJ0Q291bnQocHJlU3RhcnRlZCkgKyBzdGFydENvdW50KGVzY1N0YXJ0ZWQpLFxuXHRcdFx0Ly8gcHJlLWZsaWdodCBjb21wbGV0aW9uIGRlZmVycmVkLCBlc2NhbGF0aW9uIHN0YXJ0IGVtaXRzIG5vdGhpbmdcblx0XHRcdHByZUNvbXBsZXRlZCxcblx0XHRcdGVzY1N0YXJ0ZWQsXG5cdFx0XHQvLyBzaW5nbGUgY29tcGxldGlvbiBjYXJyaWVzIHRoZSBlc2NhbGF0aW9uJ3MgcmVhbCBvdXRwdXRcblx0XHRcdGVzY0NvbXBsZXRlOiBlc2NDb21wbGV0ZWRbMF0sXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRzOiAxLFxuXHRcdFx0cHJlQ29tcGxldGVkOiBbXSxcblx0XHRcdGVzY1N0YXJ0ZWQ6IFtdLFxuXHRcdFx0ZXNjQ29tcGxldGU6IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGBjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb21gJyxcblx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0V4YW1wbGUgRG9tYWluJyB9XSxcblx0XHRcdFx0XHRlcnJvcjogdW5kZWZpbmVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9jb21tYW5kRXhlY3V0aW9uL291dHB1dERlbHRhIHN0cmVhbXMgcnVubmluZyB0b29sIGNvbnRlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfb3V0cHV0Jyxcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGknLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsXG5cdFx0XHRcdGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfb3V0cHV0JykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgZmlyc3QgPSBtYXBDb21tYW5kRXhlY3V0aW9uT3V0cHV0RGVsdGEoc3RhdGUsIHsgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ2NtZF9vdXRwdXQnLCBkZWx0YTogJ2hpJyB9KTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYXBDb21tYW5kRXhlY3V0aW9uT3V0cHV0RGVsdGEoc3RhdGUsIHsgdGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ2NtZF9vdXRwdXQnLCBkZWx0YTogJ1xcbicgfSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGZpcnN0LCBzZWNvbmQgfSwge1xuXHRcdFx0Zmlyc3Q6IFt7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGknIH1dIH1dLFxuXHRcdFx0c2Vjb25kOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpXFxuJyB9XSB9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9jb21wbGV0ZWQgZm9yIGNvbW1hbmRFeGVjdXRpb24gZW1pdHMgQ2hhdFRvb2xDYWxsQ29tcGxldGUgd2l0aCBhZ2dyZWdhdGVkIG91dHB1dCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8yJyxcblx0XHRcdFx0Y29tbWFuZDogJ2VjaG8gaGknLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsXG5cdFx0XHRcdGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfMicpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfMicsXG5cdFx0XHRcdGNvbW1hbmQ6ICdlY2hvIGhpJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICdoaVxcbicsXG5cdFx0XHRcdGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiAxMixcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoYWN0aW9ucy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gYWN0aW9uc1swXSBhcyB7IHR5cGU6IEFjdGlvblR5cGU7IHRvb2xDYWxsSWQ6IHN0cmluZzsgcmVzdWx0OiB7IHN1Y2Nlc3M6IGJvb2xlYW47IGNvbnRlbnQ/OiB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZTsgdGV4dDogc3RyaW5nIH1bXSB9IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnR5cGUsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS50b29sQ2FsbElkLCB0b29sQ2FsbElkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUucmVzdWx0LnN1Y2Nlc3MsIHRydWUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGUucmVzdWx0LmNvbnRlbnQsIFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGlcXG4nIH1dKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3NoZWxsLXdyaXR0ZW4gZmlsZSBlZGl0cyByZW1haW4gYXR0YWNoZWQgdG8gY29tbWFuZCBjb21wbGV0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX3dyaXRlJywgY29tbWFuZDogJ1NldC1Db250ZW50IGFwcC50cyB2YWx1ZScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsIGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogbnVsbCwgZXhpdENvZGU6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGZpbGVFZGl0ID0ge1xuXHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL2FwcC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9iZWZvcmUnIH0gfSxcblx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL2FwcC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9hZnRlcicgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMSwgcmVtb3ZlZDogMSB9LFxuXHRcdH0gYXMgY29uc3Q7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF93cml0ZScsIGNvbW1hbmQ6ICdTZXQtQ29udGVudCBhcHAudHMgdmFsdWUnLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsIGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJycsIGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiAxLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0sIFtmaWxlRWRpdF0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChhY3Rpb25zWzBdLnR5cGUsIEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoKGFjdGlvbnNbMF0gYXMgeyByZXN1bHQ6IHsgY29udGVudDogdW5rbm93bltdIH0gfSkucmVzdWx0LmNvbnRlbnQsIFtmaWxlRWRpdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuIGRpZmYgdXBkYXRlcyBzdHJlYW0gYSBzeW50aGV0aWMgbmF0aXZlIGZpbGUgZWRpdCBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGZpbGVFZGl0ID0ge1xuXHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL2FwcC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9iZWZvcmUnIH0gfSxcblx0XHRcdGFmdGVyOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL2FwcC50cycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9hZnRlcicgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMiwgcmVtb3ZlZDogMSB9LFxuXHRcdH0gYXMgY29uc3Q7XG5cdFx0Y29uc3QgZmlyc3QgPSBtYXBUdXJuRGlmZlVwZGF0ZWQoc3RhdGUsICd0dXJuX2EnLCAndHVybl9kaWZmX2NhbGwnLCBbZmlsZUVkaXRdKTtcblx0XHRjb25zdCBzZWNvbmQgPSBtYXBUdXJuRGlmZlVwZGF0ZWQoc3RhdGUsICd0dXJuX2EnLCAndHVybl9kaWZmX2NhbGwnLCBbZmlsZUVkaXRdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0Lm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLCBbQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2Vjb25kLCBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkOiAndHVybl9kaWZmX2NhbGwnLCBjb250ZW50OiBbZmlsZUVkaXRdIH1dKTtcblx0fSk7XG5cblx0dGVzdCgnaXRlbS9jb21wbGV0ZWQgZm9yIGNvbW1hbmRFeGVjdXRpb24gd2l0aCBub24temVybyBleGl0IHJlcG9ydHMgZmFpbHVyZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8zJyxcblx0XHRcdFx0Y29tbWFuZDogJ2ZhbHNlJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8zJyxcblx0XHRcdFx0Y29tbWFuZDogJ2ZhbHNlJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICcnLFxuXHRcdFx0XHRleGl0Q29kZTogMSwgZHVyYXRpb25NczogMyxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF0gYXMgeyByZXN1bHQ6IHsgc3VjY2VzczogYm9vbGVhbjsgZXJyb3I/OiB7IG1lc3NhZ2U6IHN0cmluZyB9IH0gfTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUucmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUucmVzdWx0LmVycm9yPy5tZXNzYWdlLCAnRXhpdCBjb2RlIDEnKTtcblx0fSk7XG5cblx0dGVzdCgnd2ViU2VhcmNoIGl0ZW0gbWFwcyB0byBzZWFyY2ggdG9vbCBjYWxsIGxpZmVjeWNsZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ3dlYlNlYXJjaCcsIGlkOiAnd2ViXzEnLCBxdWVyeTogJ3ZzY29kZSB0ZXN0cycsXG5cdFx0XHRcdGFjdGlvbjogeyB0eXBlOiAnc2VhcmNoJywgcXVlcnk6ICd2c2NvZGUgdGVzdHMnLCBxdWVyaWVzOiBudWxsIH0sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ3dlYl8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgY29tcGxldGVBY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnd2ViU2VhcmNoJywgaWQ6ICd3ZWJfMScsIHF1ZXJ5OiAndnNjb2RlIHRlc3RzJyxcblx0XHRcdFx0YWN0aW9uOiB7IHR5cGU6ICdzZWFyY2gnLCBxdWVyeTogJ3ZzY29kZSB0ZXN0cycsIHF1ZXJpZXM6IG51bGwgfSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0VHlwZXM6IHN0YXJ0QWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSxcblx0XHRcdHN0YXJ0TWV0YTogc3RhcnRBY3Rpb25zWzBdPy50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0ID8gc3RhcnRBY3Rpb25zWzBdLl9tZXRhIDogdW5kZWZpbmVkLFxuXHRcdFx0ZGVsdGE6IHN0YXJ0QWN0aW9uc1sxXSxcblx0XHRcdHJlYWR5OiBzdGFydEFjdGlvbnNbMl0sXG5cdFx0XHRjb21wbGV0ZTogY29tcGxldGVBY3Rpb25zLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zaXplLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0VHlwZXM6IFtBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5XSxcblx0XHRcdHN0YXJ0TWV0YTogeyB0b29sS2luZDogJ3NlYXJjaCcgfSxcblx0XHRcdGRlbHRhOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6ICd2c2NvZGUgdGVzdHMnIH0sXG5cdFx0XHRyZWFkeTogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1NlYXJjaGluZyB0aGUgd2ViIGZvciB2c2NvZGUgdGVzdHMnLCB0b29sSW5wdXQ6ICd2c2NvZGUgdGVzdHMnLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0gfSxcblx0XHRcdGNvbXBsZXRlOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ1NlYXJjaGVkIHRoZSB3ZWIgZm9yIHZzY29kZSB0ZXN0cycgfSB9XSxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW1hZ2VHZW5lcmF0aW9uIGl0ZW0gbWFwcyB0byBhbiBpbWFnZSB0b29sIGNhbGwgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnaW1hZ2VHZW5lcmF0aW9uJywgaWQ6ICdpbWFnZV8xJywgc3RhdHVzOiAnaW5fcHJvZ3Jlc3MnLCByZXZpc2VkUHJvbXB0OiBudWxsLCByZXN1bHQ6ICcnIH0sXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnaW1hZ2VfMScpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2ltYWdlR2VuZXJhdGlvbicsIGlkOiAnaW1hZ2VfMScsIHN0YXR1czogJ2NvbXBsZXRlZCcsIHJldmlzZWRQcm9tcHQ6ICdBIHdhdGVyY29sb3IgZm94JywgcmVzdWx0OiAnYVcxaFoyVT0nIH0sXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0OiBzdGFydEFjdGlvbnMsXG5cdFx0XHRjb21wbGV0ZTogY29tcGxldGVBY3Rpb25zLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zaXplLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0OiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogJ2ltYWdlX2dlbi5pbWFnZWdlbicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnR2VuZXJhdGUgaW1hZ2UnLFxuXHRcdFx0fSwge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0dlbmVyYXRpbmcgaW1hZ2UnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJwcm9tcHRcIjpcIkdlbmVyYXRlIGltYWdlXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9XSxcblx0XHRcdGNvbXBsZXRlOiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdHZW5lcmF0ZWQgaW1hZ2UnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlLCBkYXRhOiAnYVcxaFoyVT0nLCBjb250ZW50VHlwZTogJ2ltYWdlL3BuZycgfV0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9XSxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnZmlsZUNoYW5nZSBpdGVtIG1hcHMgdG8gZmlsZSBlZGl0IHRvb2wgY2FsbCBsaWZlY3ljbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBbeyBwYXRoOiAnc3JjL2EudHMnLCBraW5kOiB7IHR5cGU6ICd1cGRhdGUnLCBtb3ZlX3BhdGg6IG51bGwgfSwgZGlmZjogJ0BAIC0xICsxIEBAXFxuLW9sZFxcbituZXcnIH1dIGFzIGNvbnN0O1xuXHRcdGNvbnN0IHN0YXJ0QWN0aW9ucyA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdmaWxlQ2hhbmdlJywgaWQ6ICdmaWxlXzEnLCBjaGFuZ2VzLCBzdGF0dXM6ICdpblByb2dyZXNzJyB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2ZpbGVfMScpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGZpbGVFZGl0ID0ge1xuXHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vc3JjL2EudHMnLCBjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6Ly8vYmVmb3JlJyB9IH0sXG5cdFx0XHRhZnRlcjogeyB1cmk6ICdmaWxlOi8vL3NyYy9hLnRzJywgY29udGVudDogeyB1cmk6ICdzZXNzaW9uLWRiOi8vL2FmdGVyJyB9IH0sXG5cdFx0XHRkaWZmOiB7IGFkZGVkOiAxLCByZW1vdmVkOiAxIH0sXG5cdFx0fSBhcyBjb25zdDtcblx0XHRjb25zdCBwYXRjaEFjdGlvbnMgPSBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHN0YXRlLCB7IHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBpdGVtSWQ6ICdmaWxlXzEnLCBjaGFuZ2VzOiBbeyBwYXRoOiAnc3JjL2IudHMnLCBraW5kOiB7IHR5cGU6ICdhZGQnIH0sIGRpZmY6ICcraGVsbG8nIH1dIH0sIFtmaWxlRWRpdF0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2ZpbGVDaGFuZ2UnLCBpZDogJ2ZpbGVfMScsIGNoYW5nZXMsIHN0YXR1czogJ2NvbXBsZXRlZCcgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0sIFtmaWxlRWRpdF0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRUeXBlczogc3RhcnRBY3Rpb25zLm1hcChhY3Rpb24gPT4gYWN0aW9uLnR5cGUpLFxuXHRcdFx0ZGVsdGE6IHN0YXJ0QWN0aW9uc1sxXSxcblx0XHRcdHJlYWR5OiBzdGFydEFjdGlvbnNbMl0sXG5cdFx0XHRpbml0aWFsQ29udGVudDogc3RhcnRBY3Rpb25zWzNdLFxuXHRcdFx0cGF0Y2hBY3Rpb25zLFxuXHRcdFx0Y29tcGxldGVBY3Rpb25zLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zaXplLFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0VHlwZXM6IFtBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXSxcblx0XHRcdGRlbHRhOiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6ICd1cGRhdGU6IHNyYy9hLnRzJyB9LFxuXHRcdFx0cmVhZHk6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICd1cGRhdGU6IHNyYy9hLnRzJywgdG9vbElucHV0OiAndXBkYXRlOiBzcmMvYS50cycsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRpbml0aWFsQ29udGVudDogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3VwZGF0ZTogc3JjL2EudHNcXG5AQCAtMSArMSBAQFxcbi1vbGRcXG4rbmV3JyB9XSB9LFxuXHRcdFx0cGF0Y2hBY3Rpb25zOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2FkZDogc3JjL2IudHNcXG4raGVsbG8nIH0sIGZpbGVFZGl0XSB9XSxcblx0XHRcdGNvbXBsZXRlQWN0aW9uczogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICd1cGRhdGU6IHNyYy9hLnRzJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICd1cGRhdGU6IHNyYy9hLnRzXFxuQEAgLTEgKzEgQEBcXG4tb2xkXFxuK25ldycgfSwgZmlsZUVkaXRdIH0gfV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0cmVhbWluZyBwYXRjaCBzdGFydHMgdGhlIGZpbGUgdG9vbCBjYWxsIGJlZm9yZSBpdGVtL3N0YXJ0ZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGNoYW5nZXMgPSBbeyBwYXRoOiAnc3JjL2xpdmUudHMnLCBraW5kOiB7IHR5cGU6ICdhZGQnIH0sIGRpZmY6ICdmaXJzdCBsaW5lXFxuJyB9XSBhcyBjb25zdDtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBGaWxlQ2hhbmdlU3RhcnRlZChzdGF0ZSwgJ3R1cm5fYScsICdmaWxlX2xpdmUnLCBjaGFuZ2VzKTtcblx0XHRjb25zdCBwYXRjaEFjdGlvbnMgPSBtYXBGaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAnZmlsZV9saXZlJywgY2hhbmdlczogWy4uLmNoYW5nZXNdLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGR1cGxpY2F0ZVN0YXJ0ID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2ZpbGVDaGFuZ2UnLCBpZDogJ2ZpbGVfbGl2ZScsIGNoYW5nZXMsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHN0YXJ0VHlwZXM6IHN0YXJ0QWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSxcblx0XHRcdHBhdGNoVHlwZXM6IHBhdGNoQWN0aW9ucy5tYXAoYWN0aW9uID0+IGFjdGlvbi50eXBlKSxcblx0XHRcdGR1cGxpY2F0ZVN0YXJ0LFxuXHRcdH0sIHtcblx0XHRcdHN0YXJ0VHlwZXM6IFtBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LCBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXSxcblx0XHRcdHBhdGNoVHlwZXM6IFtBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXSxcblx0XHRcdGR1cGxpY2F0ZVN0YXJ0OiBbXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgna2VlcHMgdGhlIHRvb2wgY2FyZCBhbmQgc3VyZmFjZXMgYSBsaXZlLXByZXZpZXctdW5hdmFpbGFibGUgbm90aWNlIHdpdGhvdXQgYSBndWVzc2VkIGZpbGUgZWRpdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgY2hhbmdlcyA9IFt7IHBhdGg6ICdzcmMvYmFkLnRzJywga2luZDogeyB0eXBlOiAndXBkYXRlJywgbW92ZV9wYXRoOiBudWxsIH0sIGRpZmY6ICdAQCAtMSArMSBAQFxcbi1taXNzaW5nXFxuK25ldycgfV0gYXMgY29uc3Q7XG5cdFx0bWFwRmlsZUNoYW5nZVN0YXJ0ZWQoc3RhdGUsICd0dXJuX2EnLCAnZmlsZV9iYWQnLCBjaGFuZ2VzKTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdmaWxlX2JhZCcpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IHBhdGNoQWN0aW9ucyA9IG1hcEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBpdGVtSWQ6ICdmaWxlX2JhZCcsIGNoYW5nZXM6IFsuLi5jaGFuZ2VzXSxcblx0XHR9LCBbXSwgTElWRV9QUkVWSUVXX1VOQVZBSUxBQkxFX01FU1NBR0UpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGF0Y2hBY3Rpb25zLCBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb250ZW50Q2hhbmdlZCxcblx0XHRcdHR1cm5JZDogJ3R1cm5fYScsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAndXBkYXRlOiBzcmMvYmFkLnRzXFxuQEAgLTEgKzEgQEBcXG4tbWlzc2luZ1xcbituZXcnIH0sXG5cdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IExJVkVfUFJFVklFV19VTkFWQUlMQUJMRV9NRVNTQUdFIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnbWNwVG9vbENhbGwgaXRlbSBtYXBzIHRvIHRvb2wgY2FsbCBsaWZlY3ljbGUgd2l0aCBwcm9ncmVzcycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfMScsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLCBzdGF0dXM6ICdpblByb2dyZXNzJywgYXJndW1lbnRzOiB7IHF1ZXJ5OiAndnNjb2RlJyB9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLCBwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ21jcF8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NBY3Rpb25zID0gbWFwTWNwVG9vbENhbGxQcm9ncmVzcyhzdGF0ZSwgeyB0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgaXRlbUlkOiAnbWNwXzEnLCBtZXNzYWdlOiAnU2VhcmNoaW5nJyB9KTtcblx0XHRjb25zdCBjb21wbGV0ZUFjdGlvbnMgPSBtYXBJdGVtQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdtY3BUb29sQ2FsbCcsIGlkOiAnbWNwXzEnLCBzZXJ2ZXI6ICdnaXRodWInLCB0b29sOiAnc2VhcmNoJywgc3RhdHVzOiAnY29tcGxldGVkJywgYXJndW1lbnRzOiB7IHF1ZXJ5OiAndnNjb2RlJyB9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLCBwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiB7IGNvbnRlbnQ6IFsnZG9uZSddLCBzdHJ1Y3R1cmVkQ29udGVudDogeyBjb3VudDogMSB9LCBfbWV0YTogbnVsbCB9LCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogNSB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydFR5cGVzOiBzdGFydEFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udHlwZSksXG5cdFx0XHRkZWx0YTogc3RhcnRBY3Rpb25zWzFdLFxuXHRcdFx0cmVhZHk6IHN0YXJ0QWN0aW9uc1syXSxcblx0XHRcdHByb2dyZXNzQWN0aW9ucyxcblx0XHRcdGNvbXBsZXRlQWN0aW9ucyxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydFR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeV0sXG5cdFx0XHRkZWx0YTogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiAne1xcbiAgXCJxdWVyeVwiOiBcInZzY29kZVwiXFxufScgfSxcblx0XHRcdHJlYWR5OiB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnQ2FsbGluZyBnaXRodWIuc2VhcmNoJywgdG9vbElucHV0OiAne1xcbiAgXCJxdWVyeVwiOiBcInZzY29kZVwiXFxufScsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRwcm9ncmVzc0FjdGlvbnM6IFt7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnU2VhcmNoaW5nJyB9XSB9XSxcblx0XHRcdGNvbXBsZXRlQWN0aW9uczogW3sgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgcmVzdWx0OiB7IHN1Y2Nlc3M6IHRydWUsIHBhc3RUZW5zZU1lc3NhZ2U6ICdDYWxsZWQgZ2l0aHViLnNlYXJjaCcsIGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZG9uZVxcbntcXG4gIFwiY291bnRcIjogMVxcbn0nIH1dIH0gfV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21jcFRvb2xDYWxsIHN0YXJ0IGNhcnJpZXMgYW4gTUNQIGNvbnRyaWJ1dG9yIHdoZW4gdGhlIHNlcnZlciBoYXMgYSBjdXN0b21pemF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRzdGF0ZS5tY3BDdXN0b21pemF0aW9uSWRzLnNldCgnZ2l0aHViJywgJ2N1c3QtZ2gnKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnbWNwVG9vbENhbGwnLCBpZDogJ21jcF9jJywgc2VydmVyOiAnZ2l0aHViJywgdG9vbDogJ3NlYXJjaCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBhcmd1bWVudHM6IHt9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBzdGFydEFjdGlvbnNbMF07XG5cdFx0aWYgKHN0YXJ0LnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxTdGFydCBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFydC5jb250cmlidXRvciwgeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2N1c3QtZ2gnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdtY3BUb29sQ2FsbCBzdGFydCBjYXJyaWVzIG5vIGNvbnRyaWJ1dG9yIHdoZW4gdGhlIHNlcnZlciBoYXMgbm8gY3VzdG9taXphdGlvbicsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Ly8gbWNwQ3VzdG9taXphdGlvbklkcyBpcyBlbXB0eTogdGhlIGFnZW50IGhhcyBub3QgYXBwbGllZCBhbiBNQ1Bcblx0XHQvLyBpbnZlbnRvcnkgeWV0LCBzbyB0aGUgc3RhcnQgbXVzdCBub3Qgc3RhbXAgYSAoYm9ndXMpIE1DUCBjb250cmlidXRvciBcdTIwMTRcblx0XHQvLyB0aGUgdG9vbCB0aGVuIHJlcG9ydHMgdGhlIGRlZmF1bHQgYGFnZW50SG9zdGAgc291cmNlLlxuXHRcdGNvbnN0IHN0YXJ0QWN0aW9ucyA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdtY3BUb29sQ2FsbCcsIGlkOiAnbWNwX24nLCBzZXJ2ZXI6ICdnaXRodWInLCB0b29sOiAnc2VhcmNoJyxcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycsIGFyZ3VtZW50czoge30sIG1jcEFwcFJlc291cmNlVXJpOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBsdWdpbklkOiBudWxsLCByZXN1bHQ6IG51bGwsIGVycm9yOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBzdGFydCA9IHN0YXJ0QWN0aW9uc1swXTtcblx0XHRpZiAoc3RhcnQudHlwZSAhPT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdleHBlY3RlZCBhIENoYXRUb29sQ2FsbFN0YXJ0IGFjdGlvbicpO1xuXHRcdH1cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQuY29udHJpYnV0b3IsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgaG9zdC1kZWNsaW5lZCBjb21tYW5kRXhlY3V0aW9uIHJlcG9ydHMgcmVzdWx0LmVycm9yLmNvZGUgPSBkZW5pZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjbWRfZCcsXG5cdFx0XHRcdGNvbW1hbmQ6ICdybSBmaWxlJywgY3dkOiAnL3RtcCcsIHByb2Nlc3NJZDogbnVsbCxcblx0XHRcdFx0c291cmNlOiAnYWdlbnQnIGFzIG5ldmVyLCBzdGF0dXM6ICdpblByb2dyZXNzJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgZW50cnkgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NtZF9kJyk7XG5cdFx0aWYgKCFlbnRyeSkge1xuXHRcdFx0dGhyb3cgbmV3IEVycm9yKCdleHBlY3RlZCBhIHRyYWNrZWQgdG9vbCBjYWxsJyk7XG5cdFx0fVxuXHRcdC8vIFRoZSBob3N0IGRlY2xpbmVkIHRoZSBhcHByb3ZhbCAocmVjb3JkZWQgYnkgcmVzcG9uZFRvUGVybWlzc2lvblJlcXVlc3QpLlxuXHRcdHN0YXRlLmRlY2xpbmVkVG9vbENhbGxzLmFkZChlbnRyeS50b29sQ2FsbElkKTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kX2QnLFxuXHRcdFx0XHRjb21tYW5kOiAncm0gZmlsZScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnZmFpbGVkJyBhcyBuZXZlcixcblx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiBudWxsLFxuXHRcdFx0XHRleGl0Q29kZTogbnVsbCwgZHVyYXRpb25NczogMSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF07XG5cdFx0aWYgKGNvbXBsZXRlLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxDb21wbGV0ZSBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5lcnJvcj8uY29kZSwgJ2RlbmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIGhvc3QtZGVjbGluZWQgbWNwVG9vbENhbGwgcmVwb3J0cyByZXN1bHQuZXJyb3IuY29kZSA9IGRlbmllZCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfZCcsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgYXJndW1lbnRzOiB7fSwgbWNwQXBwUmVzb3VyY2VVcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGx1Z2luSWQ6IG51bGwsIHJlc3VsdDogbnVsbCwgZXJyb3I6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdtY3BfZCcpO1xuXHRcdGlmICghZW50cnkpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSB0cmFja2VkIHRvb2wgY2FsbCcpO1xuXHRcdH1cblx0XHQvLyBUaGUgaG9zdCBkZWNsaW5lZCB0aGUgYXBwcm92YWwgKHJlY29yZGVkIGJ5IHJlc3BvbmRUb1Blcm1pc3Npb25SZXF1ZXN0KS5cblx0XHQvLyBUaGUgZGVjbGluZSBpcyBkcmFpbmVkIG9uY2UgaW4gdGhlIHNoYXJlZCBjb21wbGV0aW9uIHByb2xvZ3VlLCBzbyBhXG5cdFx0Ly8gbm9uLWNvbW1hbmQgdG9vbCB0eXBlIGlzIGNsYXNzaWZpZWQgYXMgYSBkZW5pYWwganVzdCBsaWtlIGEgY29tbWFuZC5cblx0XHRzdGF0ZS5kZWNsaW5lZFRvb2xDYWxscy5hZGQoZW50cnkudG9vbENhbGxJZCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ21jcFRvb2xDYWxsJywgaWQ6ICdtY3BfZCcsIHNlcnZlcjogJ2dpdGh1YicsIHRvb2w6ICdzZWFyY2gnLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLCBhcmd1bWVudHM6IHt9LCBtY3BBcHBSZXNvdXJjZVVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRwbHVnaW5JZDogbnVsbCwgcmVzdWx0OiBudWxsLCBlcnJvcjogbnVsbCwgZHVyYXRpb25NczogMSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IGFjdGlvbnNbMF07XG5cdFx0aWYgKGNvbXBsZXRlLnR5cGUgIT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpIHtcblx0XHRcdHRocm93IG5ldyBFcnJvcignZXhwZWN0ZWQgYSBDaGF0VG9vbENhbGxDb21wbGV0ZSBhY3Rpb24nKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLnJlc3VsdC5lcnJvcj8uY29kZSwgJ2RlbmllZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIHNwYXduQWdlbnQgc3RhcnQgcmVuZGVycyBjb21wYWN0bHkgKG5vIHByb21wdCBkdW1wIFx1MjAxNCB0aGUgY2hpbGQgY29udmVyc2F0aW9uIHNob3dzIGl0KScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl8xJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgc2VuZGVyVGhyZWFkSWQ6ICd0aHJfMScsIHJlY2VpdmVyVGhyZWFkSWRzOiBbXSxcblx0XHRcdFx0cHJvbXB0OiAnSW52ZXN0aWdhdGUgdGhlIGZhaWxpbmcgdGVzdCcsIG1vZGVsOiAnZ3B0LTUuNScsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzEnKSEudG9vbENhbGxJZDtcblx0XHQvLyBzcGF3bkFnZW50IG9wZW5zIGEgcmVhZC1vbmx5IGNoaWxkIGNvbnZlcnNhdGlvbiAodGhlIGhvc3QgYXR0YWNoZXNcblx0XHQvLyB0aGUgc3ViYWdlbnQtZGlzY292ZXJ5IGJsb2NrIHRvIHRoaXMgdG9vbCBjYWxsKSwgc28gdGhlIHJhdyBwcm9tcHRcblx0XHQvLyBpcyBkZWxpYmVyYXRlbHkgTk9UIGR1bXBlZCBpbnRvIHRoZSB0b29sIGJveC5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFjdGlvbnM6IHN0YXJ0QWN0aW9ucyxcblx0XHRcdGVudHJ5VG9vbE5hbWU6IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzEnKSEudG9vbE5hbWUsXG5cdFx0fSwge1xuXHRcdFx0YWN0aW9uczogW1xuXHRcdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnY29kZXguc3Bhd25BZ2VudCcsIGRpc3BsYXlOYW1lOiAnU3Bhd24gYWdlbnQnIH0sXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICdTcGF3bmluZyBhZ2VudCcsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XHRdLFxuXHRcdFx0ZW50cnlUb29sTmFtZTogJ2NvZGV4LnNwYXduQWdlbnQnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIHNlbmRJbnB1dCBzdGFydCBzdGlsbCBjYXJyaWVzIHRoZSBwcm9tcHQgKG9ubHkgc3Bhd25BZ2VudCBpcyBjb21wYWN0ZWQpJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiX3NpJywgdG9vbDogJ3NlbmRJbnB1dCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnQWxzbyBjaGVjayB0aGUgQ0hBTkdFTE9HJywgbW9kZWw6IG51bGwsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiX3NpJykhLnRvb2xDYWxsSWQ7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGFydEFjdGlvbnMsIFtcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgdG9vbE5hbWU6ICdjb2RleC5zZW5kSW5wdXQnLCBkaXNwbGF5TmFtZTogJ1NlbmQgaW5wdXQgdG8gYWdlbnQnIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGNvbnRlbnQ6ICdBbHNvIGNoZWNrIHRoZSBDSEFOR0VMT0cnIH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsIGludm9jYXRpb25NZXNzYWdlOiAnU2VuZGluZyBpbnB1dCB0byBhZ2VudCcsIHRvb2xJbnB1dDogJ0Fsc28gY2hlY2sgdGhlIENIQU5HRUxPRycsIGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhYkFnZW50VG9vbENhbGwgc3Bhd25BZ2VudCBjb21wbGV0ZWQgcmVuZGVycyB0aGUgc3ViYWdlbnQgcmVzdWx0IGFzIHRvb2wgb3V0cHV0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiXzInLCB0b29sOiAnc3Bhd25BZ2VudCcsXG5cdFx0XHRcdHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnSW52ZXN0aWdhdGUgdGhlIGZhaWxpbmcgdGVzdCcsIG1vZGVsOiAnZ3B0LTUuNScsXG5cdFx0XHRcdHJlYXNvbmluZ0VmZm9ydDogbnVsbCwgYWdlbnRzU3RhdGVzOiB7fSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldCgnY29sbGFiXzInKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29sbGFiQWdlbnRUb29sQ2FsbCcsIGlkOiAnY29sbGFiXzInLCB0b29sOiAnc3Bhd25BZ2VudCcsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsIHNlbmRlclRocmVhZElkOiAndGhyXzEnLCByZWNlaXZlclRocmVhZElkczogWydzdWJfMSddLFxuXHRcdFx0XHRwcm9tcHQ6ICdJbnZlc3RpZ2F0ZSB0aGUgZmFpbGluZyB0ZXN0JywgbW9kZWw6ICdncHQtNS41Jyxcblx0XHRcdFx0cmVhc29uaW5nRWZmb3J0OiBudWxsLFxuXHRcdFx0XHRhZ2VudHNTdGF0ZXM6IHsgc3ViXzE6IHsgc3RhdHVzOiAnY29tcGxldGVkJywgbWVzc2FnZTogJ0ZvdW5kIHRoZSBidWcgaW4gZm9vLnRzJyB9IH0sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IGFjdGlvbnMsIHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSB9LCB7XG5cdFx0XHRhY3Rpb25zOiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdTcGF3bmVkIGFnZW50Jyxcblx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0NvbXBsZXRlZCBcdTIwMTQgRm91bmQgdGhlIGJ1ZyBpbiBmb28udHMnIH1dLFxuXHRcdFx0XHR9LFxuXHRcdFx0fV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbGxhYkFnZW50VG9vbENhbGwgd2FpdCBhZ2dyZWdhdGVzIHJlc3VsdHMgZnJvbSBtdWx0aXBsZSBzdWJhZ2VudHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7XG5cdFx0XHRcdHR5cGU6ICdjb2xsYWJBZ2VudFRvb2xDYWxsJywgaWQ6ICdjb2xsYWJfd2FpdCcsIHRvb2w6ICd3YWl0Jyxcblx0XHRcdFx0c3RhdHVzOiAnaW5Qcm9ncmVzcycsIHNlbmRlclRocmVhZElkOiAndGhyXzEnLCByZWNlaXZlclRocmVhZElkczogWydzdWJfMScsICdzdWJfMiddLFxuXHRcdFx0XHRwcm9tcHQ6IG51bGwsIG1vZGVsOiBudWxsLCByZWFzb25pbmdFZmZvcnQ6IG51bGwsIGFnZW50c1N0YXRlczoge30sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NvbGxhYl93YWl0JykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl93YWl0JywgdG9vbDogJ3dhaXQnLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnLCAnc3ViXzInXSxcblx0XHRcdFx0cHJvbXB0OiBudWxsLCBtb2RlbDogbnVsbCwgcmVhc29uaW5nRWZmb3J0OiBudWxsLFxuXHRcdFx0XHRhZ2VudHNTdGF0ZXM6IHtcblx0XHRcdFx0XHRzdWJfMTogeyBzdGF0dXM6ICdjb21wbGV0ZWQnLCBtZXNzYWdlOiAnTWlncmF0aW9uIGZpbmlzaGVkJyB9LFxuXHRcdFx0XHRcdHN1Yl8yOiB7IHN0YXR1czogJ3J1bm5pbmcnLCBtZXNzYWdlOiAnU3RpbGwgYW5hbHlzaW5nJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0ZpbmlzaGVkIHdhaXRpbmcnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0FnZW50IDE6IENvbXBsZXRlZCBcdTIwMTQgTWlncmF0aW9uIGZpbmlzaGVkXFxuQWdlbnQgMjogUnVubmluZyBcdTIwMTQgU3RpbGwgYW5hbHlzaW5nJyB9XSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdjb2xsYWJBZ2VudFRvb2xDYWxsIGZhaWx1cmUgcmVwb3J0cyB0aGUgZXJyb3JlZCBzdWJhZ2VudCBzdGF0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl9mYWlsJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdpblByb2dyZXNzJywgc2VuZGVyVGhyZWFkSWQ6ICd0aHJfMScsIHJlY2VpdmVyVGhyZWFkSWRzOiBbJ3N1Yl8xJ10sXG5cdFx0XHRcdHByb21wdDogJ1JlZmFjdG9yIHRoZSBwYXJzZXInLCBtb2RlbDogJ2dwdC01LjUnLCByZWFzb25pbmdFZmZvcnQ6IG51bGwsIGFnZW50c1N0YXRlczoge30sXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NvbGxhYl9mYWlsJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbGxhYkFnZW50VG9vbENhbGwnLCBpZDogJ2NvbGxhYl9mYWlsJywgdG9vbDogJ3NwYXduQWdlbnQnLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnLCBzZW5kZXJUaHJlYWRJZDogJ3Rocl8xJywgcmVjZWl2ZXJUaHJlYWRJZHM6IFsnc3ViXzEnXSxcblx0XHRcdFx0cHJvbXB0OiAnUmVmYWN0b3IgdGhlIHBhcnNlcicsIG1vZGVsOiAnZ3B0LTUuNScsIHJlYXNvbmluZ0VmZm9ydDogbnVsbCxcblx0XHRcdFx0YWdlbnRzU3RhdGVzOiB7IHN1Yl8xOiB7IHN0YXR1czogJ2Vycm9yZWQnLCBtZXNzYWdlOiAnTW9kZWwgdW5hdmFpbGFibGUnIH0gfSxcblx0XHRcdH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgY29tcGxldGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnU3Bhd24gYWdlbnQgZmFpbGVkJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdFcnJvcmVkIFx1MjAxNCBNb2RlbCB1bmF2YWlsYWJsZScgfV0sXG5cdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICdDb2xsYWIgYWdlbnQgZmFpbGVkJyB9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2R5bmFtaWNUb29sQ2FsbCBpdGVtIGNhcnJpZXMgYSBDbGllbnQgY29udHJpYnV0b3Igd2hlbiBhIGNsaWVudCBvd25zIHRoZSB0b29sJywgKCkgPT4ge1xuXHRcdGNvbnN0IHRvb2xTZXQgPSBuZXcgQWN0aXZlQ2xpZW50VG9vbFNldCgpO1xuXHRcdHRvb2xTZXQuc2V0KCd3aW4tNycsIFt7IG5hbWU6ICdnZXRfbWFnaWNfd29yZCcgfV0pO1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUobmV3IFNldCgpLCB0b29sU2V0KTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMicsIG5hbWVzcGFjZTogbnVsbCwgdG9vbDogJ2dldF9tYWdpY193b3JkJywgYXJndW1lbnRzOiB7fSwgc3RhdHVzOiAnaW5Qcm9ncmVzcycsIGNvbnRlbnRJdGVtczogbnVsbCwgc3VjY2VzczogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gc3RhcnRBY3Rpb25zWzBdIGFzIHsgdHlwZTogQWN0aW9uVHlwZTsgdG9vbE5hbWU6IHN0cmluZzsgY29udHJpYnV0b3I/OiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kOyBjbGllbnRJZDogc3RyaW5nIH0gfTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHR5cGU6IHN0YXJ0LnR5cGUsXG5cdFx0XHR0b29sTmFtZTogc3RhcnQudG9vbE5hbWUsXG5cdFx0XHRjb250cmlidXRvcjogc3RhcnQuY29udHJpYnV0b3IsXG5cdFx0fSwge1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdHRvb2xOYW1lOiAnZ2V0X21hZ2ljX3dvcmQnLFxuXHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ3dpbi03JyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkeW5hbWljVG9vbENhbGwgaXRlbSBvbWl0cyB0aGUgQ2xpZW50IGNvbnRyaWJ1dG9yIGZvciBhIHNlcnZlciB0b29sJywgKCkgPT4ge1xuXHRcdC8vIEEgc2VydmVyIHRvb2wgaXMgcmVnaXN0ZXJlZCB1bmRlciBpdHMgYmFyZSBuYW1lIGFuZCBleGVjdXRlc1xuXHRcdC8vIGluLXByb2Nlc3MsIHNvIGl0IG11c3Qgbm90IGNhcnJ5IGEgQ2xpZW50IGNvbnRyaWJ1dG9yIGV2ZW4gd2hlbiBhXG5cdFx0Ly8gd29ya2JlbmNoIGNsaWVudCBvd25zIHRoZSAob3RoZXIpIGNsaWVudCB0b29scy5cblx0XHRjb25zdCB0b29sU2V0ID0gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKTtcblx0XHR0b29sU2V0LnNldCgnd2luLTcnLCBbeyBuYW1lOiAnZ2V0X21hZ2ljX3dvcmQnIH1dKTtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKG5ldyBTZXQoWydhZGRDb21tZW50J10pLCB0b29sU2V0KTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMycsIG5hbWVzcGFjZTogbnVsbCwgdG9vbDogJ2FkZENvbW1lbnQnLCBhcmd1bWVudHM6IHt9LCBzdGF0dXM6ICdpblByb2dyZXNzJywgY29udGVudEl0ZW1zOiBudWxsLCBzdWNjZXNzOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsIH0gYXMgbmV2ZXIsXG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJywgdHVybklkOiAndHVybl9hJywgc3RhcnRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBzdGFydEFjdGlvbnNbMF0gYXMgeyB0eXBlOiBBY3Rpb25UeXBlOyB0b29sTmFtZTogc3RyaW5nOyBjb250cmlidXRvcj86IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQ7IGNsaWVudElkOiBzdHJpbmcgfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dHlwZTogc3RhcnQudHlwZSxcblx0XHRcdHRvb2xOYW1lOiBzdGFydC50b29sTmFtZSxcblx0XHRcdGNvbnRyaWJ1dG9yOiBzdGFydC5jb250cmlidXRvcixcblx0XHR9LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0dG9vbE5hbWU6ICdhZGRDb21tZW50Jyxcblx0XHRcdGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2R5bmFtaWNUb29sQ2FsbCBpdGVtIG9taXRzIHRoZSBDbGllbnQgY29udHJpYnV0b3IgZm9yIHdyaXRlX2ZpbGUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdG9vbFNldCA9IG5ldyBBY3RpdmVDbGllbnRUb29sU2V0KCk7XG5cdFx0dG9vbFNldC5zZXQoJ3dpbi03JywgW3sgbmFtZTogJ2dldF9tYWdpY193b3JkJyB9XSk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZShuZXcgU2V0KFsnd3JpdGVfZmlsZSddKSwgdG9vbFNldCk7XG5cdFx0Y29uc3Qgc3RhcnRBY3Rpb25zID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2R5bmFtaWNUb29sQ2FsbCcsIGlkOiAnZHluX3dyaXRlJywgbmFtZXNwYWNlOiBudWxsLCB0b29sOiAnd3JpdGVfZmlsZScsIGFyZ3VtZW50czogeyBwYXRoOiAnZ2FtZS5qcycsIGNvbnRlbnRzOiAnZnVsbCcgfSwgc3RhdHVzOiAnaW5Qcm9ncmVzcycsIGNvbnRlbnRJdGVtczogbnVsbCwgc3VjY2VzczogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHN0YXJ0ID0gc3RhcnRBY3Rpb25zWzBdIGFzIHsgdHlwZTogQWN0aW9uVHlwZTsgdG9vbE5hbWU6IHN0cmluZzsgZGlzcGxheU5hbWU/OiBzdHJpbmc7IGNvbnRyaWJ1dG9yPzogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZDsgY2xpZW50SWQ6IHN0cmluZyB9IH07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0eXBlOiBzdGFydC50eXBlLFxuXHRcdFx0dG9vbE5hbWU6IHN0YXJ0LnRvb2xOYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHN0YXJ0LmRpc3BsYXlOYW1lLFxuXHRcdFx0Y29udHJpYnV0b3I6IHN0YXJ0LmNvbnRyaWJ1dG9yLFxuXHRcdH0sIHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0b29sTmFtZTogJ3dyaXRlX2ZpbGUnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdXcml0ZSBGaWxlJyxcblx0XHRcdGNvbnRyaWJ1dG9yOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3dyaXRlX2ZpbGUgZHluYW1pY1Rvb2xDYWxsIGNvbXBsZXRlIGluY2x1ZGVzIEZpbGVFZGl0IHNuYXBzaG90cyBmb3IgbGl2ZSBwcmV2aWV3JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUobmV3IFNldChbJ3dyaXRlX2ZpbGUnXSkpO1xuXHRcdG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdkeW5hbWljVG9vbENhbGwnLCBpZDogJ2R5bl93cml0ZScsIG5hbWVzcGFjZTogbnVsbCwgdG9vbDogJ3dyaXRlX2ZpbGUnLCBhcmd1bWVudHM6IHsgcGF0aDogJ2dhbWUuanMnLCBjb250ZW50czogJ2Z1bGwnIH0sIHN0YXR1czogJ2luUHJvZ3Jlc3MnLCBjb250ZW50SXRlbXM6IG51bGwsIHN1Y2Nlc3M6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdkeW5fd3JpdGUnKSEudG9vbENhbGxJZDtcblx0XHRjb25zdCBmaWxlRWRpdCA9IHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCxcblx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZS9nYW1lLmpzJywgY29udGVudDogeyB1cmk6ICdzZXNzaW9uLWRiOi8vL2JlZm9yZScgfSB9LFxuXHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy93b3Jrc3BhY2UvZ2FtZS5qcycsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovLy9hZnRlcicgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMTIsIHJlbW92ZWQ6IDAgfSxcblx0XHR9IGFzIGNvbnN0O1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9ucyA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2R5bmFtaWNUb29sQ2FsbCcsIGlkOiAnZHluX3dyaXRlJywgbmFtZXNwYWNlOiBudWxsLCB0b29sOiAnd3JpdGVfZmlsZScsIGFyZ3VtZW50czogeyBwYXRoOiAnZ2FtZS5qcycsIGNvbnRlbnRzOiAnZnVsbCcgfSwgc3RhdHVzOiAnY29tcGxldGVkJywgY29udGVudEl0ZW1zOiBbeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogJ1dyb3RlIGdhbWUuanMgKDQgY2hhcmFjdGVycykuJyB9XSwgc3VjY2VzczogdHJ1ZSwgZHVyYXRpb25NczogNSB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSwgW2ZpbGVFZGl0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0ZUFjdGlvbnMsIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0dHVybklkOiAndHVybl9hJyxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1dyb3RlIGBnYW1lLmpzYCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnV3JvdGUgZ2FtZS5qcyAoNCBjaGFyYWN0ZXJzKS4nIH0sXG5cdFx0XHRcdFx0ZmlsZUVkaXQsXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZHluYW1pY1Rvb2xDYWxsIGl0ZW0gbWFwcyB0byB0b29sIGNhbGwgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRjb25zdCBzdGFydEFjdGlvbnMgPSBtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMScsIG5hbWVzcGFjZTogJ2NsaWVudCcsIHRvb2w6ICdsb29rdXAnLCBhcmd1bWVudHM6IHsgc3ltYm9sOiAnQScgfSwgc3RhdHVzOiAnaW5Qcm9ncmVzcycsIGNvbnRlbnRJdGVtczogbnVsbCwgc3VjY2VzczogbnVsbCwgZHVyYXRpb25NczogbnVsbCB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2R5bl8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgY29tcGxldGVBY3Rpb25zID0gbWFwSXRlbUNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbTogeyB0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJywgaWQ6ICdkeW5fMScsIG5hbWVzcGFjZTogJ2NsaWVudCcsIHRvb2w6ICdsb29rdXAnLCBhcmd1bWVudHM6IHsgc3ltYm9sOiAnQScgfSwgc3RhdHVzOiAnY29tcGxldGVkJywgY29udGVudEl0ZW1zOiBbeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogJ0ZvdW5kIEEnIH0sIHsgdHlwZTogJ2lucHV0SW1hZ2UnLCBpbWFnZVVybDogJ2h0dHBzOi8vZXhhbXBsZS50ZXN0L2EucG5nJyB9XSwgc3VjY2VzczogdHJ1ZSwgZHVyYXRpb25NczogNSB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGNvbXBsZXRlZEF0TXM6IDAsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydFR5cGVzOiBzdGFydEFjdGlvbnMubWFwKGFjdGlvbiA9PiBhY3Rpb24udHlwZSksXG5cdFx0XHRkZWx0YTogc3RhcnRBY3Rpb25zWzFdLFxuXHRcdFx0cmVhZHk6IHN0YXJ0QWN0aW9uc1syXSxcblx0XHRcdGNvbXBsZXRlQWN0aW9ucyxcblx0XHRcdHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSxcblx0XHR9LCB7XG5cdFx0XHRzdGFydFR5cGVzOiBbQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSwgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeV0sXG5cdFx0XHRkZWx0YTogeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCBjb250ZW50OiAne1xcbiAgXCJzeW1ib2xcIjogXCJBXCJcXG59JyB9LFxuXHRcdFx0cmVhZHk6IHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCwgaW52b2NhdGlvbk1lc3NhZ2U6ICdDYWxsaW5nIGNsaWVudC5sb29rdXAnLCB0b29sSW5wdXQ6ICd7XFxuICBcInN5bWJvbFwiOiBcIkFcIlxcbn0nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9LFxuXHRcdFx0Y29tcGxldGVBY3Rpb25zOiBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogJ0NhbGxlZCBjbGllbnQubG9va3VwJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdGb3VuZCBBXFxuaHR0cHM6Ly9leGFtcGxlLnRlc3QvYS5wbmcnIH1dIH0gfV0sXG5cdFx0XHRyZW1haW5pbmdUb29sQ2FsbHM6IDAsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4vY29tcGxldGVkIHdpdGggc3RhdHVzPWNvbXBsZXRlZCBlbWl0cyBDaGF0VHVybkNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRzdGF0ZS5jdXJyZW50VHVybklkID0gJ3R1cm5fYSc7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXSwgaXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiAxXzc1Ml8wMTJfMzIxLCBjb21wbGV0ZWRBdDogMV83NTJfMDEyXzMyMy41LCBkdXJhdGlvbk1zOiAyNTAwLFxuXHRcdFx0fSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGFjdGlvbnMsIFt7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgZHVyYXRpb246IDI1MDAgfV0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS5jdXJyZW50VHVybklkLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuL2NvbXBsZXRlZCBkb2VzIG5vdCBpbmZlciBkcm9wcGVkIGNvbW1hbmQgc3VjY2VzcyB3aXRob3V0IGFuIGV4aXQgc3RhdHVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoKTtcblx0XHRtYXBJdGVtU3RhcnRlZChzdGF0ZSwge1xuXHRcdFx0aXRlbToge1xuXHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzEnLCBjb21tYW5kOiAnbm9kZSAtZSB3cml0ZUZpbGUoKScsIGN3ZDogJy90bXAnLFxuXHRcdFx0XHRwcm9jZXNzSWQ6IG51bGwsIHNvdXJjZTogJ2FnZW50JyBhcyBuZXZlciwgc3RhdHVzOiAnaW5Qcm9ncmVzcycgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogbnVsbCwgZXhpdENvZGU6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAwLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NtZF8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgcmVzcG9uc2VTdGFydGVkID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbXNnXzEnLCB0ZXh0OiAnJyB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHJlc3BvbnNlRGVsdGEgPSBtYXBBZ2VudE1lc3NhZ2VEZWx0YShzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIGl0ZW1JZDogJ21zZ18xJywgZGVsdGE6ICdkb25lJyxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgcmVzcG9uc2VTdGFydGVkLCByZXNwb25zZURlbHRhIH0sIHsgcmVzcG9uc2VTdGFydGVkOiBbXSwgcmVzcG9uc2VEZWx0YTogW10gfSk7XG5cblx0XHRjb25zdCBwYXJ0SWQgPSBzdGF0ZS5pdGVtVG9QYXJ0SWQuZ2V0KCdtc2dfMScpITtcblx0XHRjb25zdCBub3RpZmljYXRpb24gPSB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzEnLCBjb21tYW5kOiAnbm9kZSAtZSB3cml0ZUZpbGUoKScsIGN3ZDogJy90bXAnLFxuXHRcdFx0XHRcdHByb2Nlc3NJZDogbnVsbCwgc291cmNlOiAnYWdlbnQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBjb21tYW5kQWN0aW9uczogW10sXG5cdFx0XHRcdFx0YWdncmVnYXRlZE91dHB1dDogJycsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiAyLFxuXHRcdFx0XHR9IGFzIG5ldmVyXSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogMyxcblx0XHRcdH0sXG5cdFx0fTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwVHVybkNvbXBsZXRlZChzdGF0ZSwgbm90aWZpY2F0aW9uKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucywgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnLCB0b29sQ2FsbElkLFxuXHRcdFx0XHRyZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTdG9wcGVkIHNoZWxsJywgY29udGVudDogdW5kZWZpbmVkLCBlcnJvcjogeyBtZXNzYWdlOiAnVHVybiBjb21wbGV0ZWQgYmVmb3JlIHRoZSB0b29sIHJlcG9ydGVkIGNvbXBsZXRpb24nIH0gfSxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybl9hJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogcGFydElkLCBjb250ZW50OiAnJyB9IH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0SWQsIGNvbnRlbnQ6ICdkb25lJyB9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIGR1cmF0aW9uOiAzIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4vY29tcGxldGVkIHJlY292ZXJzIGEgY29tbWFuZCByZXN1bHQgd2l0aCBhbiBvYnNlcnZlZCBleGl0IHN0YXR1cycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8xJywgY29tbWFuZDogJ25vZGUgLWUgd3JpdGVGaWxlKCknLCBjd2Q6ICcvdG1wJyxcblx0XHRcdFx0cHJvY2Vzc0lkOiBudWxsLCBzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfMScpIS50b29sQ2FsbElkO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW3tcblx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAnY21kXzEnLCBjb21tYW5kOiAnbm9kZSAtZSB3cml0ZUZpbGUoKScsIGN3ZDogJy90bXAnLFxuXHRcdFx0XHRcdHByb2Nlc3NJZDogbnVsbCwgc291cmNlOiAnYWdlbnQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBjb21tYW5kQWN0aW9uczogW10sXG5cdFx0XHRcdFx0YWdncmVnYXRlZE91dHB1dDogJ2RvbmUnLCBleGl0Q29kZTogMCwgZHVyYXRpb25NczogMixcblx0XHRcdFx0fSBhcyBuZXZlcl0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBgbm9kZSAtZSB3cml0ZUZpbGUoKWAnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnZG9uZScgfV0sXG5cdFx0XHRcdFx0ZXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgZHVyYXRpb246IDMgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9jb21wbGV0ZWQgZG9lcyBub3QgcmVjb3ZlciBhIG5vbi1jb21tYW5kIHRvb2wgdGhyb3VnaCB0aGUgcHVyZSBtYXBwZXInLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldCgndG9vbF8xJywgeyB0b29sQ2FsbElkOiAndGNfMScsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xOYW1lOiAnd2ViX3NlYXJjaCcsIG91dHB1dDogJycgfSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VTdGFydGVkID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbXNnXzEnLCB0ZXh0OiAnJyB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAxLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ21zZ18xJykhO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcG9uc2VTdGFydGVkLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybl9hJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogcGFydElkLCBjb250ZW50OiAnJyB9IH0sXG5cdFx0XSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gbWFwVHVybkNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFt7IHR5cGU6ICd3ZWJTZWFyY2gnLCBpZDogJ3Rvb2xfMScsIHF1ZXJ5OiAncXVlcnknLCBhY3Rpb246IHsgdHlwZTogJ3NlYXJjaCcsIHF1ZXJ5OiAncXVlcnknIH0gfSBhcyBuZXZlcl0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IDMsXG5cdFx0XHR9LFxuXHRcdH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQ6ICd0Y18xJyxcblx0XHRcdFx0cmVzdWx0OiB7IHN1Y2Nlc3M6IGZhbHNlLCBwYXN0VGVuc2VNZXNzYWdlOiAnU3RvcHBlZCB3ZWJfc2VhcmNoJywgY29udGVudDogdW5kZWZpbmVkLCBlcnJvcjogeyBtZXNzYWdlOiAnVHVybiBjb21wbGV0ZWQgYmVmb3JlIHRoZSB0b29sIHJlcG9ydGVkIGNvbXBsZXRpb24nIH0gfSxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgZHVyYXRpb246IDMgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3VwZXJzZWRpbmcgYSBwZW5kaW5nIHByZS1mbGlnaHQgcmVsZWFzZXMgaXRzIGRlZmVycmVkIHJlc3BvbnNlIGJlZm9yZSB0aGUgbmV4dCByZXNwb25zZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8xJywgY29tbWFuZDogJ25vZGUgLWUgd3JpdGVGaWxlKCknLCBjd2Q6ICcvdG1wJyxcblx0XHRcdFx0cHJvY2Vzc0lkOiBudWxsLCBzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblxuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQoJ2NtZF8xJykhLnRvb2xDYWxsSWQ7XG5cdFx0Y29uc3QgZmlyc3RSZXNwb25zZSA9IG1hcEl0ZW1TdGFydGVkKHN0YXRlLCB7XG5cdFx0XHRpdGVtOiB7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ21zZ18xJywgdGV4dDogJycgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMSxcblx0XHR9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGZpcnN0UmVzcG9uc2UsIFtdKTtcblx0XHRjb25zdCBmaXJzdFBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ21zZ18xJykhO1xuXHRcdGNvbnN0IGNvbXBsZXRlZCA9IG1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8xJywgY29tbWFuZDogJ25vZGUgLWUgd3JpdGVGaWxlKCknLCBjd2Q6ICcvdG1wJyxcblx0XHRcdFx0cHJvY2Vzc0lkOiBudWxsLCBzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGNvbW1hbmRBY3Rpb25zOiBbXSwgYWdncmVnYXRlZE91dHB1dDogJycsIGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiAyLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBjb21wbGV0ZWRBdE1zOiAyLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGVkLCBbXSk7XG5cdFx0Y29uc3QgbmV4dFJlc3BvbnNlID0gbWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbXNnXzInLCB0ZXh0OiAnJyB9IGFzIG5ldmVyLFxuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsIHR1cm5JZDogJ3R1cm5fYScsIHN0YXJ0ZWRBdE1zOiAzLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHNlY29uZFBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ21zZ18yJykhO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChuZXh0UmVzcG9uc2UsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGBub2RlIC1lIHdyaXRlRmlsZSgpYCcsXG5cdFx0XHRcdFx0Y29udGVudDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVycm9yOiB1bmRlZmluZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsIHR1cm5JZDogJ3R1cm5fYScsIHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6IGZpcnN0UGFydElkLCBjb250ZW50OiAnJyB9IH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCwgdHVybklkOiAndHVybl9hJywgcGFydDogeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogc2Vjb25kUGFydElkLCBjb250ZW50OiAnXFxuXFxuJyB9IH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N0ZWVyaW5nIGZpbmFsaXphdGlvbiBjb21wbGV0ZXMgb3BlbiBjb21tYW5kcyBiZWZvcmUgZGVmZXJyZWQgcmVzcG9uc2UgYWN0aW9ucycsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0bWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHtcblx0XHRcdFx0dHlwZTogJ2NvbW1hbmRFeGVjdXRpb24nLCBpZDogJ2NtZF8xJywgY29tbWFuZDogJ25vZGUgLWUgd3JpdGVGaWxlKCknLCBjd2Q6ICcvdG1wJyxcblx0XHRcdFx0cHJvY2Vzc0lkOiBudWxsLCBzb3VyY2U6ICdhZ2VudCcgYXMgbmV2ZXIsIHN0YXR1czogJ2luUHJvZ3Jlc3MnIGFzIG5ldmVyLFxuXHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6IG51bGwsIGV4aXRDb2RlOiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMCxcblx0XHR9KTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KCdjbWRfMScpIS50b29sQ2FsbElkO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobWFwSXRlbVN0YXJ0ZWQoc3RhdGUsIHtcblx0XHRcdGl0ZW06IHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnbXNnXzEnLCB0ZXh0OiAnZG9uZScgfSBhcyBuZXZlcixcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLCB0dXJuSWQ6ICd0dXJuX2EnLCBzdGFydGVkQXRNczogMSxcblx0XHR9KSwgW10pO1xuXHRcdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQoJ21zZ18xJykhO1xuXG5cdFx0Y29uc3QgYWN0aW9ucyA9IGZpbmFsaXplQ29kZXhUdXJuTWFwU3RhdGUoc3RhdGUsICdUdXJuIHdhcyBzdXBlcnNlZGVkIGJ5IGEgc3RlZXJpbmcgbWVzc2FnZSBiZWZvcmUgdGhlIHRvb2wgcmVwb3J0ZWQgY29tcGxldGlvbicpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdTdG9wcGVkIHNoZWxsJyxcblx0XHRcdFx0XHRjb250ZW50OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ1R1cm4gd2FzIHN1cGVyc2VkZWQgYnkgYSBzdGVlcmluZyBtZXNzYWdlIGJlZm9yZSB0aGUgdG9vbCByZXBvcnRlZCBjb21wbGV0aW9uJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0LCB0dXJuSWQ6ICd0dXJuX2EnLCBwYXJ0OiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiBwYXJ0SWQsIGNvbnRlbnQ6ICdkb25lJyB9IH0sXG5cdFx0XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0b29sQ2FsbHM6IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNpemUsXG5cdFx0XHRkZWZlcnJlZFJlc3BvbnNlczogc3RhdGUuZGVmZXJyZWRSZXNwb25zZUFjdGlvbnMubGVuZ3RoLFxuXHRcdFx0cGVuZGluZ1ByZWZsaWdodDogc3RhdGUucGVuZGluZ1ByZWZsaWdodCxcblx0XHR9LCB7XG5cdFx0XHR0b29sQ2FsbHM6IDAsXG5cdFx0XHRkZWZlcnJlZFJlc3BvbnNlczogMCxcblx0XHRcdHBlbmRpbmdQcmVmbGlnaHQ6IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9jb21wbGV0ZWQgY29tcGxldGVzIG9ycGhhbmVkIHRvb2wgY2FsbHMgYmVmb3JlIGNvbXBsZXRpbmcgdGhlIHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldCgnY21kXzEnLCB7IHRvb2xDYWxsSWQ6ICd0Y18xJywgdHVybklkOiAndHVybl9hJywgdG9vbE5hbWU6ICdzaGVsbCcsIG91dHB1dDogJ3BhcnRpYWwgb3V0cHV0JyB9KTtcblx0XHRjb25zdCBhY3Rpb25zID0gbWFwVHVybkNvbXBsZXRlZChzdGF0ZSwge1xuXHRcdFx0dGhyZWFkSWQ6ICd0aHJfMScsXG5cdFx0XHR0dXJuOiB7XG5cdFx0XHRcdGlkOiAndHVybl9hJywgaXRlbXM6IFtdLCBpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fSxcblx0XHR9LCAzMjEpO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9uID0gYWN0aW9uc1sxXSBhcyB7IHR5cGU6IEFjdGlvblR5cGU7IHR1cm5JZDogc3RyaW5nOyBkdXJhdGlvbjogbnVtYmVyIH07XG5cdFx0Y29uc3QgeyBkdXJhdGlvbjogY29tcGxldGVEdXJhdGlvbiwgLi4uY29tcGxldGVSZXN0IH0gPSBjb21wbGV0ZUFjdGlvbjtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgYWN0aW9uczogW2FjdGlvbnNbMF0sIGNvbXBsZXRlUmVzdF0sIHJlbWFpbmluZ1Rvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSB9LCB7XG5cdFx0XHRhY3Rpb25zOiBbXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgdG9vbENhbGxJZDogJ3RjXzEnLCByZXN1bHQ6IHsgc3VjY2VzczogZmFsc2UsIHBhc3RUZW5zZU1lc3NhZ2U6ICdTdG9wcGVkIHNoZWxsJywgY29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdwYXJ0aWFsIG91dHB1dCcgfV0sIGVycm9yOiB7IG1lc3NhZ2U6ICdUdXJuIGNvbXBsZXRlZCBiZWZvcmUgdGhlIHRvb2wgcmVwb3J0ZWQgY29tcGxldGlvbicgfSB9IH0sXG5cdFx0XHRcdHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNvbXBsZXRlLCB0dXJuSWQ6ICd0dXJuX2EnIH0sXG5cdFx0XHRdLFxuXHRcdFx0cmVtYWluaW5nVG9vbENhbGxzOiAwLFxuXHRcdH0pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZUR1cmF0aW9uLCAzMjEpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuL2NvbXBsZXRlZCB3aXRoIHN0YXR1cz1mYWlsZWQgZW1pdHMgQ2hhdEVycm9yICsgQ2hhdFR1cm5Db21wbGV0ZScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IGNyZWF0ZUNvZGV4U2Vzc2lvbk1hcFN0YXRlKCk7XG5cdFx0Y29uc3QgYWN0aW9ucyA9IG1hcFR1cm5Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdHRocmVhZElkOiAndGhyXzEnLFxuXHRcdFx0dHVybjoge1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsIGl0ZW1zOiBbXSwgaXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdmYWlsZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAnYm9vbScgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLCB0dXJuSWQ6ICd0dXJuX2EnLCBkdXJhdGlvbjogMCwgZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhFcnJvcicsIG1lc3NhZ2U6ICdib29tJyB9IH0sXG5cdFx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkOiAndHVybl9hJywgZHVyYXRpb246IDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndHVybi9jb21wbGV0ZWQgd2l0aCBzdGF0dXM9aW50ZXJydXB0ZWQgZW1pdHMgQ2hhdFR1cm5DYW5jZWxsZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdGNvbnN0IGFjdGlvbnMgPSBtYXBUdXJuQ29tcGxldGVkKHN0YXRlLCB7XG5cdFx0XHR0aHJlYWRJZDogJ3Rocl8xJyxcblx0XHRcdHR1cm46IHtcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLCBpdGVtczogW10sIGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnaW50ZXJydXB0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChhY3Rpb25zLCBbeyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ2FuY2VsbGVkLCB0dXJuSWQ6ICd0dXJuX2EnLCBkdXJhdGlvbjogMCB9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm5TdGF0ZUZyb21TdGF0dXMgbWFwcyBzdHJpbmdzIGNvcnJlY3RseScsICgpID0+IHtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVyblN0YXRlRnJvbVN0YXR1cygnY29tcGxldGVkJyksIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5TdGF0ZUZyb21TdGF0dXMoJ2ludGVycnVwdGVkJyksIFR1cm5TdGF0ZS5DYW5jZWxsZWQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuU3RhdGVGcm9tU3RhdHVzKCdmYWlsZWQnKSwgVHVyblN0YXRlLkVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVyblN0YXRlRnJvbVN0YXR1cygnd2VpcmQnKSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0fSk7XG5cblx0dGVzdCgnZXh0cmFjdFVzZXJJbnB1dFRleHQgam9pbnMgdGV4dCBpbnB1dHMgYW5kIGlnbm9yZXMgbm9uLXRleHQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKFxuXHRcdFx0ZXh0cmFjdFVzZXJJbnB1dFRleHQoW1xuXHRcdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpcnN0JywgdGV4dF9lbGVtZW50czogW10gfSxcblx0XHRcdFx0eyB0eXBlOiAnaW1hZ2UnLCB1cmw6ICdodHRwOi8veC95LnBuZycgfSxcblx0XHRcdFx0eyB0eXBlOiAndGV4dCcsIHRleHQ6ICdzZWNvbmQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9LFxuXHRcdFx0XHR7IHR5cGU6ICdtZW50aW9uJywgbmFtZTogJ2ZvbycsIHBhdGg6ICcvZm9vJyB9LFxuXHRcdFx0XSksXG5cdFx0XHQnZmlyc3RcXG5cXG5zZWNvbmQnLFxuXHRcdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGV4dHJhY3RVc2VySW5wdXRUZXh0KFtdKSwgJycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChleHRyYWN0VXNlcklucHV0VGV4dChbeyB0eXBlOiAnaW1hZ2UnLCB1cmw6ICdodHRwOi8veC95LnBuZycgfV0pLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc2V0Q29kZXhUdXJuTWFwU3RhdGUgY2xlYXJzIGl0ZW0gbWFwcyBidXQgcHJlc2VydmVzIGN1cnJlbnRUdXJuSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBjcmVhdGVDb2RleFNlc3Npb25NYXBTdGF0ZSgpO1xuXHRcdHN0YXRlLmN1cnJlbnRUdXJuSWQgPSAndHVybl9hJztcblx0XHRzdGF0ZS5pdGVtVG9QYXJ0SWQuc2V0KCdpMScsICdwMScpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldCgnaTInLCB7IHRvb2xDYWxsSWQ6ICd0YycsIHR1cm5JZDogJ3R1cm5fYScsIHRvb2xOYW1lOiAnc2hlbGwnLCBvdXRwdXQ6ICcnIH0pO1xuXHRcdHN0YXRlLml0ZW1Ub1JlYXNvbmluZ1BhcnRJZC5zZXQoJ2kzJywgJ3IxJyk7XG5cdFx0c3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuYWRkKCd0Yy1zdGFsZScpO1xuXHRcdHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc3RhdGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0Y3VycmVudFR1cm5JZDogc3RhdGUuY3VycmVudFR1cm5JZCxcblx0XHRcdHBhcnRzOiBzdGF0ZS5pdGVtVG9QYXJ0SWQuc2l6ZSxcblx0XHRcdHRvb2xDYWxsczogc3RhdGUuaXRlbVRvVG9vbENhbGwuc2l6ZSxcblx0XHRcdHJlYXNvbmluZzogc3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLnNpemUsXG5cdFx0XHRkZWNsaW5lZDogc3RhdGUuZGVjbGluZWRUb29sQ2FsbHMuc2l6ZSxcblx0XHR9LCB7IGN1cnJlbnRUdXJuSWQ6ICd0dXJuX2EnLCBwYXJ0czogMCwgdG9vbENhbGxzOiAwLCByZWFzb25pbmc6IDAsIGRlY2xpbmVkOiAwIH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsNEJBQTRCLHNCQUFzQiwyQkFBMkIsc0JBQXNCLGdDQUFnQyxzQkFBc0IsMkJBQTJCLHNCQUFzQixrQkFBa0IsZ0JBQWdCLHdCQUF3Qiw4QkFBOEIsOEJBQThCLHVCQUF1QixzQkFBc0Isa0JBQWtCLG9CQUFvQixnQkFBZ0Isd0JBQXdCLDJCQUEyQjtBQUMvZCxTQUFTLGtCQUF1RDtBQUNoRSxTQUFTLG1CQUFtQjtBQUM1QixTQUFTLGdCQUFnQixhQUFhLGtCQUFrQixlQUFlLDRCQUE0Qix5QkFBeUIsdUJBQXVCLGlCQUFpQztBQUNwTCxTQUFTLDJCQUEyQjtBQUdwQyxTQUFTLG9CQUFvQixRQUFvRTtBQUNoRyxTQUFPLFFBQVEsU0FBUyxXQUFXLG9CQUFvQixPQUFPLEtBQUssU0FBUyxpQkFBaUIsV0FDMUYsT0FBTyxLQUFLLFVBQ1o7QUFDSjtBQUVBLE1BQU0sMkJBQTJCLE1BQU07QUFFdEMsMENBQXdDO0FBRXhDLE9BQUssbUVBQW1FLE1BQU07QUFDN0UsVUFBTSxRQUFRLEVBQUUsU0FBUyxxQkFBcUIsZ0JBQWdCLE1BQU0sbUJBQW1CLEtBQUs7QUFDNUYsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixVQUFVLHFCQUFxQixFQUFFLFVBQVUsU0FBUyxRQUFRLFlBQVksT0FBTyxXQUFXLEtBQUssR0FBRyxhQUFhLEdBQUc7QUFBQSxNQUNsSCxRQUFRLHFCQUFxQixFQUFFLFVBQVUsU0FBUyxRQUFRLFlBQVksT0FBTyxXQUFXLE1BQU0sR0FBRyxhQUFhLEdBQUc7QUFBQSxJQUNsSCxHQUFHO0FBQUEsTUFDRixVQUFVLENBQUMsRUFBRSxNQUFNLFdBQVcscUJBQXFCLFVBQVUsNENBQTRDLENBQUM7QUFBQSxNQUMxRyxRQUFRO0FBQUEsUUFDUCxFQUFFLE1BQU0sV0FBVyxxQkFBcUIsVUFBVSxPQUFVO0FBQUEsUUFDNUQsRUFBRSxNQUFNLFdBQVcsV0FBVyxRQUFRLGFBQWEsVUFBVSxLQUFLLE9BQU8sRUFBRSxXQUFXLGNBQWMsU0FBUyxvQkFBb0IsRUFBRTtBQUFBLE1BQ3BJO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw2REFBNkQsTUFBTTtBQUN2RSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sVUFBVSxlQUFlLE9BQU87QUFBQSxNQUNyQyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLENBQUM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLElBQUk7QUFBQSxVQUNKLFVBQVU7QUFBQSxVQUNWLFNBQVMsQ0FBQyxFQUFFLE1BQU0sUUFBUSxNQUFNLFNBQVMsZUFBZSxDQUFDLEVBQUUsQ0FBQztBQUFBLFFBQzdELENBQUM7QUFBQSxRQUNELFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUMxQixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFDUCxXQUFXO0FBQUEsUUFDWCxhQUFhO0FBQUEsUUFDYixZQUFZO0FBQUEsTUFDYjtBQUFBLElBQ0QsR0FBRyxVQUFVO0FBQ2IsV0FBTyxZQUFZLE1BQU0sZUFBZSxRQUFRO0FBQ2hELFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFFBQVE7QUFBQSxNQUNSLFdBQVc7QUFBQSxNQUNYLFNBQVMsRUFBRSxNQUFNLFNBQVMsUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVBQUU7QUFBQSxJQUM5RCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDBFQUEwRSxNQUFNO0FBQ3BGLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLGVBQWUsT0FBTztBQUFBLE1BQ3JDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sQ0FBQztBQUFBLFFBQ1IsV0FBVyxFQUFFLE1BQU0sT0FBTztBQUFBLFFBQzFCLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxRQUNYLGFBQWE7QUFBQSxRQUNiLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxHQUFHLFlBQVk7QUFDZixXQUFPLFlBQWEsUUFBUSxDQUFDLEVBQW9DLFFBQVEsTUFBTSxZQUFZO0FBQUEsRUFDNUYsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxVQUFVLGVBQWUsMkJBQTJCLEdBQUc7QUFBQSxNQUM1RCxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLENBQUM7QUFBQSxVQUNQLE1BQU07QUFBQSxVQUNOLElBQUk7QUFBQSxVQUNKLFVBQVU7QUFBQSxVQUNWLFNBQVMsQ0FBQztBQUFBLFlBQ1QsTUFBTTtBQUFBLFlBQ04sTUFBTTtBQUFBLFlBQ04sZUFBZSxDQUFDO0FBQUEsVUFDakIsQ0FBQztBQUFBLFFBQ0YsQ0FBQztBQUFBLFFBQ0QsV0FBVyxFQUFFLE1BQU0sT0FBTztBQUFBLFFBQzFCLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxRQUNYLGFBQWE7QUFBQSxRQUNiLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxHQUFHLEVBQUU7QUFDTCxVQUFNLFNBQVMsUUFBUSxDQUFDO0FBQ3hCLFdBQU8sWUFBWSxPQUFPLE1BQU0sV0FBVyxlQUFlO0FBQzFELFFBQUksT0FBTyxTQUFTLFdBQVcsaUJBQWlCO0FBQy9DO0FBQUEsSUFDRDtBQUNBLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsTUFBTSxPQUFPLFFBQVE7QUFBQSxNQUNyQixZQUFZLCtCQUErQixPQUFPLE9BQU87QUFBQSxJQUMxRCxHQUFHO0FBQUEsTUFDRixNQUFNO0FBQUEsTUFDTixZQUFZLEVBQUUsZ0JBQWdCLGdCQUFnQjtBQUFBLElBQy9DLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sVUFBUyxvQkFBSSxLQUFLLEdBQUUsWUFBWTtBQUN0QyxVQUFNLFVBQVUsZUFBZSwyQkFBMkIsR0FBRztBQUFBLE1BQzVELFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sQ0FBQztBQUFBLFFBQ1IsV0FBVyxFQUFFLE1BQU0sT0FBTztBQUFBLFFBQzFCLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUNQLFdBQVc7QUFBQSxRQUNYLGFBQWE7QUFBQSxRQUNiLFlBQVk7QUFBQSxNQUNiO0FBQUEsSUFDRCxHQUFHLFFBQVE7QUFFWCxVQUFNLFlBQVksUUFBUSxDQUFDLEVBQUUsU0FBUyxXQUFXLGtCQUFrQixRQUFRLENBQUMsRUFBRSxZQUFZO0FBQzFGLFdBQU8sR0FBRyxPQUFPLGNBQWMsWUFBWSxhQUFhLFVBQVUsY0FBYSxvQkFBSSxLQUFLLEdBQUUsWUFBWSxDQUFDO0FBQUEsRUFDeEcsQ0FBQztBQUVELE9BQUssdURBQXVELE1BQU07QUFDakUsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLFVBQVUsZUFBZSxPQUFPO0FBQUEsTUFDckMsTUFBTSxFQUFFLE1BQU0sZ0JBQWdCLElBQUksVUFBVSxNQUFNLElBQUksT0FBTyxNQUFNLGdCQUFnQixLQUFLO0FBQUEsTUFDeEYsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQ1IsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUNELFdBQU8sWUFBWSxRQUFRLFFBQVEsQ0FBQztBQUNwQyxVQUFNLElBQUksUUFBUSxDQUFDO0FBQ25CLFdBQU8sWUFBWSxFQUFFLE1BQU0sV0FBVyxnQkFBZ0I7QUFDdEQsV0FBTyxZQUFZLEVBQUUsUUFBUSxRQUFRO0FBQ3JDLFdBQU8sWUFBWSxFQUFFLEtBQUssTUFBTSxpQkFBaUIsUUFBUTtBQUN6RCxXQUFPLFlBQVksT0FBTyxFQUFFLEtBQUssSUFBSSxRQUFRO0FBQzdDLFdBQU8sR0FBRyxFQUFFLEtBQUssR0FBRyxTQUFTLENBQUM7QUFDOUIsV0FBTyxZQUFZLE1BQU0sYUFBYSxJQUFJLFFBQVEsR0FBRyxFQUFFLEtBQUssRUFBRTtBQUFBLEVBQy9ELENBQUM7QUFFRCxPQUFLLCtEQUErRCxNQUFNO0FBQ3pFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLGVBQWUsT0FBTztBQUFBLE1BQ3JDLE1BQU0sRUFBRSxNQUFNLFFBQVEsSUFBSSxVQUFVLE1BQU0sWUFBWTtBQUFBLE1BQ3RELFVBQVU7QUFBQSxNQUNWLFFBQVE7QUFBQSxNQUNSLGFBQWE7QUFBQSxJQUNkLENBQUM7QUFDRCxXQUFPLGdCQUFnQixTQUFTLENBQUMsQ0FBQztBQUNsQyxXQUFPLFlBQVksTUFBTSxhQUFhLE1BQU0sQ0FBQztBQUFBLEVBQzlDLENBQUM7QUFFRCxPQUFLLDREQUE0RCxNQUFNO0FBQ3RFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLFVBQVUsTUFBTSxJQUFJLE9BQU8sTUFBTSxnQkFBZ0IsS0FBSztBQUFBLE1BQ3hGLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sYUFBYSxJQUFJLFFBQVE7QUFDOUMsVUFBTSxVQUFVLHFCQUFxQixPQUFPO0FBQUEsTUFDM0MsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQ1IsUUFBUTtBQUFBLE1BQ1IsT0FBTztBQUFBLElBQ1IsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFFBQVE7QUFBQSxNQUNSO0FBQUEsTUFDQSxTQUFTO0FBQUEsSUFDVixDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLHlEQUF5RCxNQUFNO0FBQ25FLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLHFCQUFxQixPQUFPO0FBQUEsTUFDM0MsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsUUFBUTtBQUFBLE1BQVcsT0FBTztBQUFBLElBQ2hFLENBQUM7QUFDRCxXQUFPLGdCQUFnQixTQUFTLENBQUMsQ0FBQztBQUFBLEVBQ25DLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxRQUFRLDZCQUE2QixPQUFPO0FBQUEsTUFDakQsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsUUFBUTtBQUFBLE1BQVEsY0FBYztBQUFBLElBQ3BFLENBQUM7QUFDRCxVQUFNLFNBQVMsTUFBTSxzQkFBc0IsSUFBSSxnQkFBZ0I7QUFDL0QsVUFBTSxRQUFRLDZCQUE2QixPQUFPO0FBQUEsTUFDakQsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsUUFBUTtBQUFBLE1BQVEsY0FBYztBQUFBLE1BQUcsT0FBTztBQUFBLElBQzlFLENBQUM7QUFDRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sTUFBTSxJQUFJLFlBQVUsT0FBTyxJQUFJO0FBQUEsTUFDdEMsVUFBVSxNQUFNLENBQUMsR0FBRyxTQUFTLFdBQVcsbUJBQW1CLE1BQU0sQ0FBQyxFQUFFLEtBQUssT0FBTztBQUFBLE1BQ2hGO0FBQUEsSUFDRCxHQUFHO0FBQUEsTUFDRixPQUFPLENBQUMsV0FBVyxnQkFBZ0I7QUFBQSxNQUNuQyxVQUFVLGlCQUFpQjtBQUFBLE1BQzNCLE9BQU8sQ0FBQyxFQUFFLE1BQU0sV0FBVyxlQUFlLFFBQVEsVUFBVSxRQUFRLFNBQVMsWUFBWSxPQUFPLEVBQUUsb0JBQW9CLFVBQVUsRUFBRSxDQUFDO0FBQUEsSUFDcEksQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssNEVBQTRFLE1BQU07QUFDdEYsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLFVBQVUsc0JBQXNCLE9BQU87QUFBQSxNQUM1QyxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxRQUFRO0FBQUEsTUFBUSxjQUFjO0FBQUEsTUFBRyxPQUFPO0FBQUEsSUFDOUUsQ0FBQztBQUNELFVBQU0sU0FBUyxNQUFNLHNCQUFzQixJQUFJLGFBQWE7QUFDNUQsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixPQUFPLFFBQVEsSUFBSSxZQUFVLE9BQU8sSUFBSTtBQUFBLE1BQ3hDLFVBQVUsUUFBUSxDQUFDLEdBQUcsU0FBUyxXQUFXLG1CQUFtQixRQUFRLENBQUMsRUFBRSxLQUFLLE9BQU87QUFBQSxNQUNwRixPQUFPLFFBQVEsQ0FBQztBQUFBLElBQ2pCLEdBQUc7QUFBQSxNQUNGLE9BQU8sQ0FBQyxXQUFXLGtCQUFrQixXQUFXLGFBQWE7QUFBQSxNQUM3RCxVQUFVLGlCQUFpQjtBQUFBLE1BQzNCLE9BQU8sRUFBRSxNQUFNLFdBQVcsZUFBZSxRQUFRLFVBQVUsUUFBUSxTQUFTLGVBQWUsT0FBTyxFQUFFLG9CQUFvQixPQUFPLEVBQUU7QUFBQSxJQUNsSSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSywwREFBMEQsTUFBTTtBQUNwRSxVQUFNLFVBQVUscUJBQXFCO0FBQUEsTUFDcEMsVUFBVTtBQUFBLE1BQ1YsUUFBUTtBQUFBLE1BQ1IsWUFBWTtBQUFBLFFBQ1gsTUFBTSxFQUFFLGFBQWEsSUFBSSxtQkFBbUIsR0FBRyx1QkFBdUIsR0FBRyxjQUFjLEdBQUcsdUJBQXVCLEdBQUcsYUFBYSxHQUFHO0FBQUEsUUFDcEksT0FBTyxFQUFFLGFBQWEsS0FBSyxtQkFBbUIsSUFBSSx1QkFBdUIsR0FBRyxjQUFjLElBQUksdUJBQXVCLElBQUksYUFBYSxJQUFJO0FBQUEsUUFDMUksb0JBQW9CO0FBQUEsTUFDckI7QUFBQSxJQUNELEdBQUcsZ0NBQWdDO0FBQ25DLFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQztBQUFBLE1BQ2hDLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFFBQVE7QUFBQSxNQUNSLE9BQU87QUFBQSxRQUNOLGFBQWE7QUFBQSxRQUNiLGNBQWM7QUFBQSxRQUNkLE9BQU87QUFBQSxRQUNQLGlCQUFpQjtBQUFBLFFBQ2pCLE9BQU8sRUFBRSx1QkFBdUIsR0FBRyxvQkFBb0IsSUFBTztBQUFBLE1BQy9EO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLGVBQWUsT0FBTztBQUFBLE1BQ3JDLE1BQU0sRUFBRSxNQUFNLHFCQUFxQixJQUFJLFlBQVk7QUFBQSxNQUNuRCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxXQUFXLEdBQUc7QUFDMUQsVUFBTSxZQUFZLGlCQUFpQixPQUFPO0FBQUEsTUFDekMsTUFBTSxFQUFFLE1BQU0scUJBQXFCLElBQUksWUFBWTtBQUFBLE1BQ25ELFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBRUQsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLFdBQVcsV0FBVyxNQUFNLGVBQWUsS0FBSyxHQUFHO0FBQUEsTUFDcEYsU0FBUztBQUFBLFFBQ1IsRUFBRSxNQUFNLFdBQVcsbUJBQW1CLFFBQVEsVUFBVSxZQUFZLFVBQVUsV0FBVyxhQUFhLHVCQUF1QjtBQUFBLFFBQzdILEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxtQkFBbUIsMkJBQTJCLFdBQVcsMkJBQTJCLFVBQVU7QUFBQSxNQUNuSztBQUFBLE1BQ0EsV0FBVyxDQUFDO0FBQUEsUUFDWCxNQUFNLFdBQVc7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0EsUUFBUSxFQUFFLFNBQVMsTUFBTSxrQkFBa0IseUJBQXlCO0FBQUEsTUFDckUsQ0FBQztBQUFBLE1BQ0QsV0FBVztBQUFBLElBQ1osQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssc0RBQXNELE1BQU07QUFDaEUsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxtQkFBZSxPQUFPO0FBQUEsTUFDckIsTUFBTSxFQUFFLE1BQU0sZ0JBQWdCLElBQUksVUFBVSxNQUFNLElBQUksT0FBTyxNQUFNLGdCQUFnQixLQUFLO0FBQUEsTUFDeEYsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxXQUFPLFlBQVksTUFBTSxhQUFhLE1BQU0sQ0FBQztBQUM3QyxxQkFBaUIsT0FBTztBQUFBLE1BQ3ZCLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLFVBQVUsTUFBTSxTQUFTLE9BQU8sTUFBTSxnQkFBZ0IsS0FBSztBQUFBLE1BQzdGLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxZQUFZLE1BQU0sYUFBYSxNQUFNLENBQUM7QUFBQSxFQUM5QyxDQUFDO0FBRUQsT0FBSywwRUFBMEUsTUFBTTtBQUNwRixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sUUFBUSxlQUFlLE9BQU87QUFBQSxNQUNuQyxNQUFNLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLE1BQU0sbURBQW1ELE9BQU8sTUFBTSxnQkFBZ0IsS0FBSztBQUFBLE1BQ25JLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLGVBQWUsT0FBTztBQUFBLE1BQ3BDLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLE1BQU0sTUFBTSxpQkFBaUIsT0FBTyxNQUFNLGdCQUFnQixLQUFLO0FBQUEsTUFDakcsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE9BQU8sb0JBQW9CLE1BQU0sQ0FBQyxDQUFDO0FBQUEsTUFDbkMsUUFBUSxvQkFBb0IsT0FBTyxDQUFDLENBQUM7QUFBQSxJQUN0QyxHQUFHO0FBQUEsTUFDRixPQUFPO0FBQUEsTUFDUCxRQUFRO0FBQUEsSUFDVCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx3REFBd0QsTUFBTTtBQUNsRSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLE1BQU0sS0FBSyxPQUFPLE1BQU0sZ0JBQWdCLEtBQUssR0FBRyxVQUFVLFNBQVMsUUFBUSxVQUFVLGFBQWEsRUFBRSxDQUFDO0FBQ3JLLG1CQUFlLE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxNQUFNLE1BQU0sS0FBSyxPQUFPLE1BQU0sZ0JBQWdCLEtBQUssR0FBRyxVQUFVLFNBQVMsUUFBUSxVQUFVLGFBQWEsRUFBRSxDQUFDO0FBRXJLLDJCQUF1QixLQUFLO0FBQzVCLFVBQU0sa0JBQWtCLGVBQWUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLE1BQU0sTUFBTSxLQUFLLE9BQU8sTUFBTSxnQkFBZ0IsS0FBSyxHQUFHLFVBQVUsU0FBUyxRQUFRLFVBQVUsYUFBYSxFQUFFLENBQUM7QUFDN0wsV0FBTyxZQUFZLG9CQUFvQixnQkFBZ0IsQ0FBQyxDQUFDLEdBQUcsR0FBRztBQUFBLEVBQ2hFLENBQUM7QUFFRCxPQUFLLG1GQUFtRixNQUFNO0FBQzdGLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsUUFBSSxPQUFrQjtBQUFBLE1BQ3JCLFVBQVU7QUFBQSxNQUNWLE9BQU87QUFBQSxNQUNQLFFBQVEsY0FBYztBQUFBLE1BQ3RCLGFBQVksb0JBQUksS0FBSyxDQUFDLEdBQUUsWUFBWTtBQUFBLE1BQ3BDLFFBQVEsRUFBRSxNQUFNLGVBQWUsS0FBSztBQUFBLE1BQ3BDLE9BQU8sQ0FBQztBQUFBLE1BQ1IsWUFBWTtBQUFBLElBQ2I7QUFDQSxVQUFNLFFBQVEsQ0FBQyxZQUFxRDtBQUNuRSxpQkFBVyxVQUFVLFNBQVM7QUFDN0IsZUFBTyxZQUFZLE1BQU0sTUFBb0I7QUFBQSxNQUM5QztBQUFBLElBQ0Q7QUFDQSxVQUFNLGVBQWUsT0FBTztBQUFBLE1BQzNCLFVBQVU7QUFBQSxNQUNWLE1BQU0sRUFBRSxJQUFJLFVBQVUsT0FBTyxDQUFDLEdBQUcsV0FBVyxFQUFFLE1BQU0sT0FBTyxHQUFZLFFBQVEsY0FBdUIsT0FBTyxNQUFNLFdBQVcsTUFBTSxhQUFhLE1BQU0sWUFBWSxLQUFLO0FBQUEsSUFDekssR0FBRyxRQUFRLENBQUM7QUFFWixVQUFNLGVBQWUsT0FBTyxFQUFFLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLE1BQU0sTUFBTSxJQUFJLE9BQU8sTUFBTSxnQkFBZ0IsS0FBSyxHQUFHLFVBQVUsU0FBUyxRQUFRLFVBQVUsYUFBYSxFQUFFLENBQUMsQ0FBQztBQUMzSyxVQUFNLHFCQUFxQixPQUFPLEVBQUUsVUFBVSxTQUFTLFFBQVEsVUFBVSxRQUFRLE1BQU0sT0FBTyxrREFBa0QsQ0FBQyxDQUFDO0FBQ2xKLFVBQU0sZUFBZSxPQUFPLEVBQUUsTUFBTSxFQUFFLE1BQU0sZ0JBQWdCLElBQUksTUFBTSxNQUFNLElBQUksT0FBTyxNQUFNLGdCQUFnQixLQUFLLEdBQUcsVUFBVSxTQUFTLFFBQVEsVUFBVSxhQUFhLEVBQUUsQ0FBQyxDQUFDO0FBQzNLLFVBQU0scUJBQXFCLE9BQU8sRUFBRSxVQUFVLFNBQVMsUUFBUSxVQUFVLFFBQVEsTUFBTSxPQUFPLHlCQUF5QixDQUFDLENBQUM7QUFJekgsVUFBTSxVQUFVLEtBQUssWUFBWSxpQkFBaUIsQ0FBQyxHQUNqRCxJQUFJLFVBQVEsS0FBSyxTQUFTLGlCQUFpQixXQUFXLEtBQUssVUFBVSxFQUFFLEVBQ3ZFLEtBQUssRUFBRTtBQUNULFdBQU8sWUFBWSxRQUFRLDJFQUEyRTtBQUFBLEVBQ3ZHLENBQUM7QUFFRCxPQUFLLDJHQUEyRyxNQUFNO0FBQ3JILFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLGVBQWUsT0FBTztBQUFBLE1BQ3JDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQVUsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQzNDLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbEMsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQ3RDLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxXQUFPLFlBQVksUUFBUSxRQUFRLENBQUM7QUFDcEMsVUFBTSxRQUFRLFFBQVEsQ0FBQztBQUN2QixVQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ3ZCLFVBQU0sUUFBUSxRQUFRLENBQUM7QUFDdkIsV0FBTyxZQUFZLE1BQU0sTUFBTSxXQUFXLGlCQUFpQjtBQUMzRCxXQUFPLFlBQVksTUFBTSxNQUFNLFdBQVcsaUJBQWlCO0FBQzNELFdBQU8sWUFBWSxNQUFNLE1BQU0sV0FBVyxpQkFBaUI7QUFDM0QsVUFBTSxRQUFRLE1BQU0sZUFBZSxJQUFJLE9BQU87QUFDOUMsV0FBTyxHQUFHLEtBQUs7QUFDZixXQUFPLFlBQVksTUFBTyxZQUFhLE1BQWlDLFVBQVU7QUFDbEYsV0FBTyxZQUFZLE1BQU8sUUFBUSxRQUFRO0FBQzFDLFdBQU8sWUFBYSxNQUE4QixTQUFTLFFBQVE7QUFDbkUsV0FBTyxZQUFhLE1BQW9ELFdBQVcsMkJBQTJCLFNBQVM7QUFDdkgsV0FBTyxnQkFBaUIsTUFBOEMsT0FBTyxFQUFFLFVBQVUsV0FBVyxDQUFDO0FBQUEsRUFDdEcsQ0FBQztBQUVELE9BQUssaUZBQWlGLE1BQU07QUFDM0YsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLFVBQVUsZUFBZSxPQUFPO0FBQUEsTUFDckMsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQW9CLElBQUk7QUFBQSxRQUM5QixTQUFTO0FBQUEsUUFBZ0MsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQ2pFLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbEMsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQ3RDLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLFFBQVEsUUFBUSxDQUFDO0FBQ3ZCLFVBQU0sUUFBUSxRQUFRLENBQUM7QUFHdkIsVUFBTSxXQUFXLGlCQUFpQixPQUFPO0FBQUEsTUFDeEMsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQW9CLElBQUk7QUFBQSxRQUM5QixTQUFTO0FBQUEsUUFBZ0MsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQ2pFLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbEMsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQ3RDLFVBQVU7QUFBQSxRQUFHLFlBQVk7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsZUFBZTtBQUFBLElBQ3JELENBQUM7QUFDRCxVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLENBQUM7QUFBQSxRQUFHLFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUNyQyxRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFBTSxXQUFXO0FBQUEsUUFBTSxhQUFhO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDOUQ7QUFBQSxJQUNELENBQVU7QUFDVixVQUFNLFdBQVcsUUFBUSxDQUFDO0FBQzFCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEI7QUFBQSxNQUNBLE9BQU8sTUFBTTtBQUFBLE1BQ2IsbUJBQW1CLE1BQU07QUFBQSxNQUN6QixXQUFXLE1BQU07QUFBQSxNQUNqQixrQkFBa0IsU0FBUyxPQUFPO0FBQUEsSUFDbkMsR0FBRztBQUFBLE1BQ0YsVUFBVSxDQUFDO0FBQUEsTUFDWCxPQUFPO0FBQUEsTUFDUCxtQkFBbUI7QUFBQSxNQUNuQixXQUFXO0FBQUEsTUFDWCxrQkFBa0I7QUFBQSxJQUNuQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RkFBeUYsTUFBTTtBQUNuRyxVQUFNLFFBQVEsMkJBQTJCO0FBR3pDLFVBQU0sYUFBYSxlQUFlLE9BQU87QUFBQSxNQUN4QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUErQixLQUFLO0FBQUEsUUFBUSxXQUFXO0FBQUEsUUFDaEUsUUFBUTtBQUFBLFFBQWtCLFFBQVE7QUFBQSxRQUNsQyxnQkFBZ0IsQ0FBQztBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFBTSxVQUFVO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDekU7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLGVBQWUsRUFBRztBQUM5RCxVQUFNLGVBQWUsaUJBQWlCLE9BQU87QUFBQSxNQUM1QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUErQixLQUFLO0FBQUEsUUFBUSxXQUFXO0FBQUEsUUFDaEUsUUFBUTtBQUFBLFFBQWtCLFFBQVE7QUFBQSxRQUNsQyxnQkFBZ0IsQ0FBQztBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFBSSxVQUFVO0FBQUEsUUFBRyxZQUFZO0FBQUEsTUFDcEU7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBRUQsVUFBTSxhQUFhLGVBQWUsT0FBTztBQUFBLE1BQ3hDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQStCLEtBQUs7QUFBQSxRQUFRLFdBQVc7QUFBQSxRQUNoRSxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ2xDLGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUN6RTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGVBQWUsaUJBQWlCLE9BQU87QUFBQSxNQUM1QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUErQixLQUFLO0FBQUEsUUFBUSxXQUFXO0FBQUEsUUFDaEUsUUFBUTtBQUFBLFFBQWtCLFFBQVE7QUFBQSxRQUNsQyxnQkFBZ0IsQ0FBQztBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFBa0IsVUFBVTtBQUFBLFFBQUcsWUFBWTtBQUFBLE1BQ2xGO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsQ0FBQztBQUNELFVBQU0sYUFBYSxDQUFDLFlBQWdDLFFBQVEsT0FBTyxPQUFNLEVBQTJCLFNBQVMsV0FBVyxpQkFBaUIsRUFBRTtBQUMzSSxXQUFPLGdCQUFnQjtBQUFBO0FBQUEsTUFFdEIsUUFBUSxXQUFXLFVBQVUsSUFBSSxXQUFXLFVBQVU7QUFBQTtBQUFBLE1BRXREO0FBQUEsTUFDQTtBQUFBO0FBQUEsTUFFQSxhQUFhLGFBQWEsQ0FBQztBQUFBLElBQzVCLEdBQUc7QUFBQSxNQUNGLFFBQVE7QUFBQSxNQUNSLGNBQWMsQ0FBQztBQUFBLE1BQ2YsWUFBWSxDQUFDO0FBQUEsTUFDYixhQUFhO0FBQUEsUUFDWixNQUFNLFdBQVc7QUFBQSxRQUNqQixRQUFRO0FBQUEsUUFDUjtBQUFBLFFBQ0EsUUFBUTtBQUFBLFVBQ1AsU0FBUztBQUFBLFVBQ1Qsa0JBQWtCO0FBQUEsVUFDbEIsU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGlCQUFpQixDQUFDO0FBQUEsVUFDdEUsT0FBTztBQUFBLFFBQ1I7QUFBQSxNQUNEO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUFXLEtBQUs7QUFBQSxRQUFRLFdBQVc7QUFBQSxRQUM1QyxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ2xDLGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUN0QyxVQUFVO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDN0I7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLFlBQVksRUFBRztBQUMzRCxVQUFNLFFBQVEsK0JBQStCLE9BQU8sRUFBRSxVQUFVLFNBQVMsUUFBUSxVQUFVLFFBQVEsY0FBYyxPQUFPLEtBQUssQ0FBQztBQUM5SCxVQUFNLFNBQVMsK0JBQStCLE9BQU8sRUFBRSxVQUFVLFNBQVMsUUFBUSxVQUFVLFFBQVEsY0FBYyxPQUFPLEtBQUssQ0FBQztBQUMvSCxXQUFPLGdCQUFnQixFQUFFLE9BQU8sT0FBTyxHQUFHO0FBQUEsTUFDekMsT0FBTyxDQUFDLEVBQUUsTUFBTSxXQUFXLDRCQUE0QixRQUFRLFVBQVUsWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sS0FBSyxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ2xKLFFBQVEsQ0FBQyxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsUUFBUSxVQUFVLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLE9BQU8sQ0FBQyxFQUFFLENBQUM7QUFBQSxJQUN0SixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx5RkFBeUYsTUFBTTtBQUNuRyxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUFXLEtBQUs7QUFBQSxRQUFRLFdBQVc7QUFBQSxRQUM1QyxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ2xDLGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUN0QyxVQUFVO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDN0I7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLE9BQU8sRUFBRztBQUN0RCxVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQzlCLFNBQVM7QUFBQSxRQUFXLEtBQUs7QUFBQSxRQUFRLFdBQVc7QUFBQSxRQUM1QyxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ2xDLGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUN0QyxVQUFVO0FBQUEsUUFBRyxZQUFZO0FBQUEsTUFDMUI7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxZQUFZLFFBQVEsUUFBUSxDQUFDO0FBQ3BDLFVBQU0sV0FBVyxRQUFRLENBQUM7QUFDMUIsV0FBTyxZQUFZLFNBQVMsTUFBTSxXQUFXLG9CQUFvQjtBQUNqRSxXQUFPLFlBQVksU0FBUyxZQUFZLFVBQVU7QUFDbEQsV0FBTyxZQUFZLFNBQVMsT0FBTyxTQUFTLElBQUk7QUFDaEQsV0FBTyxnQkFBZ0IsU0FBUyxPQUFPLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSxPQUFPLENBQUMsQ0FBQztBQUNwRyxXQUFPLFlBQVksTUFBTSxlQUFlLE1BQU0sQ0FBQztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFBYSxTQUFTO0FBQUEsUUFBNEIsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQ3hHLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFBdUIsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQU0sVUFBVTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQ2xJO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsUUFBUSxFQUFFLEtBQUssc0JBQXNCLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixFQUFFO0FBQUEsTUFDOUUsT0FBTyxFQUFFLEtBQUssc0JBQXNCLFNBQVMsRUFBRSxLQUFLLHNCQUFzQixFQUFFO0FBQUEsTUFDNUUsTUFBTSxFQUFFLE9BQU8sR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUM5QjtBQUNBLFVBQU0sVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFBYSxTQUFTO0FBQUEsUUFBNEIsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQ3hHLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFBc0IsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQUksVUFBVTtBQUFBLFFBQUcsWUFBWTtBQUFBLE1BQzVIO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNiLFdBQU8sWUFBWSxRQUFRLENBQUMsRUFBRSxNQUFNLFdBQVcsb0JBQW9CO0FBQ25FLFdBQU8sZ0JBQWlCLFFBQVEsQ0FBQyxFQUF5QyxPQUFPLFNBQVMsQ0FBQyxRQUFRLENBQUM7QUFBQSxFQUNyRyxDQUFDO0FBRUQsT0FBSyxtRUFBbUUsTUFBTTtBQUM3RSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsUUFBUSxFQUFFLEtBQUssc0JBQXNCLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixFQUFFO0FBQUEsTUFDOUUsT0FBTyxFQUFFLEtBQUssc0JBQXNCLFNBQVMsRUFBRSxLQUFLLHNCQUFzQixFQUFFO0FBQUEsTUFDNUUsTUFBTSxFQUFFLE9BQU8sR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUM5QjtBQUNBLFVBQU0sUUFBUSxtQkFBbUIsT0FBTyxVQUFVLGtCQUFrQixDQUFDLFFBQVEsQ0FBQztBQUM5RSxVQUFNLFNBQVMsbUJBQW1CLE9BQU8sVUFBVSxrQkFBa0IsQ0FBQyxRQUFRLENBQUM7QUFDL0UsV0FBTyxnQkFBZ0IsTUFBTSxJQUFJLFlBQVUsT0FBTyxJQUFJLEdBQUcsQ0FBQyxXQUFXLG1CQUFtQixXQUFXLG1CQUFtQixXQUFXLDBCQUEwQixDQUFDO0FBQzVKLFdBQU8sZ0JBQWdCLFFBQVEsQ0FBQyxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsUUFBUSxVQUFVLFlBQVksa0JBQWtCLFNBQVMsQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO0FBQUEsRUFDdEosQ0FBQztBQUVELE9BQUssMEVBQTBFLE1BQU07QUFDcEYsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxtQkFBZSxPQUFPO0FBQUEsTUFDckIsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQW9CLElBQUk7QUFBQSxRQUM5QixTQUFTO0FBQUEsUUFBUyxLQUFLO0FBQUEsUUFBUSxXQUFXO0FBQUEsUUFDMUMsUUFBUTtBQUFBLFFBQWtCLFFBQVE7QUFBQSxRQUNsQyxnQkFBZ0IsQ0FBQztBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFDdEMsVUFBVTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQVMsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQzFDLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbEMsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQ3RDLFVBQVU7QUFBQSxRQUFHLFlBQVk7QUFBQSxNQUMxQjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsZUFBZTtBQUFBLElBQ3JELENBQUM7QUFDRCxVQUFNLFdBQVcsUUFBUSxDQUFDO0FBQzFCLFdBQU8sWUFBWSxTQUFTLE9BQU8sU0FBUyxLQUFLO0FBQ2pELFdBQU8sWUFBWSxTQUFTLE9BQU8sT0FBTyxTQUFTLGFBQWE7QUFBQSxFQUNqRSxDQUFDO0FBRUQsT0FBSyxxREFBcUQsTUFBTTtBQUMvRCxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sZUFBZSxlQUFlLE9BQU87QUFBQSxNQUMxQyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBYSxJQUFJO0FBQUEsUUFBUyxPQUFPO0FBQUEsUUFDdkMsUUFBUSxFQUFFLE1BQU0sVUFBVSxPQUFPLGdCQUFnQixTQUFTLEtBQUs7QUFBQSxNQUNoRTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksT0FBTyxFQUFHO0FBQ3RELFVBQU0sa0JBQWtCLGlCQUFpQixPQUFPO0FBQUEsTUFDL0MsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQWEsSUFBSTtBQUFBLFFBQVMsT0FBTztBQUFBLFFBQ3ZDLFFBQVEsRUFBRSxNQUFNLFVBQVUsT0FBTyxnQkFBZ0IsU0FBUyxLQUFLO0FBQUEsTUFDaEU7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLGFBQWEsSUFBSSxZQUFVLE9BQU8sSUFBSTtBQUFBLE1BQ2xELFdBQVcsYUFBYSxDQUFDLEdBQUcsU0FBUyxXQUFXLG9CQUFvQixhQUFhLENBQUMsRUFBRSxRQUFRO0FBQUEsTUFDNUYsT0FBTyxhQUFhLENBQUM7QUFBQSxNQUNyQixPQUFPLGFBQWEsQ0FBQztBQUFBLE1BQ3JCLFVBQVU7QUFBQSxNQUNWLG9CQUFvQixNQUFNLGVBQWU7QUFBQSxJQUMxQyxHQUFHO0FBQUEsTUFDRixZQUFZLENBQUMsV0FBVyxtQkFBbUIsV0FBVyxtQkFBbUIsV0FBVyxpQkFBaUI7QUFBQSxNQUNyRyxXQUFXLEVBQUUsVUFBVSxTQUFTO0FBQUEsTUFDaEMsT0FBTyxFQUFFLE1BQU0sV0FBVyxtQkFBbUIsUUFBUSxVQUFVLFlBQVksU0FBUyxlQUFlO0FBQUEsTUFDbkcsT0FBTyxFQUFFLE1BQU0sV0FBVyxtQkFBbUIsUUFBUSxVQUFVLFlBQVksbUJBQW1CLHNDQUFzQyxXQUFXLGdCQUFnQixXQUFXLDJCQUEyQixXQUFXLE9BQU8sRUFBRSxVQUFVLFNBQVMsRUFBRTtBQUFBLE1BQzlPLFVBQVUsQ0FBQyxFQUFFLE1BQU0sV0FBVyxzQkFBc0IsUUFBUSxVQUFVLFlBQVksUUFBUSxFQUFFLFNBQVMsTUFBTSxrQkFBa0Isb0NBQW9DLEVBQUUsQ0FBQztBQUFBLE1BQ3BLLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDZEQUE2RCxNQUFNO0FBQ3ZFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixJQUFJLFdBQVcsUUFBUSxlQUFlLGVBQWUsTUFBTSxRQUFRLEdBQUc7QUFBQSxNQUN2RyxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxTQUFTLEVBQUc7QUFDeEQsVUFBTSxrQkFBa0IsaUJBQWlCLE9BQU87QUFBQSxNQUMvQyxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsSUFBSSxXQUFXLFFBQVEsYUFBYSxlQUFlLG9CQUFvQixRQUFRLFdBQVc7QUFBQSxNQUMzSCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsQ0FBQztBQUNELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsT0FBTztBQUFBLE1BQ1AsVUFBVTtBQUFBLE1BQ1Ysb0JBQW9CLE1BQU0sZUFBZTtBQUFBLElBQzFDLEdBQUc7QUFBQSxNQUNGLE9BQU8sQ0FBQztBQUFBLFFBQ1AsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUTtBQUFBLFFBQ1I7QUFBQSxRQUNBLFVBQVU7QUFBQSxRQUNWLGFBQWE7QUFBQSxNQUNkLEdBQUc7QUFBQSxRQUNGLE1BQU0sV0FBVztBQUFBLFFBQ2pCLFFBQVE7QUFBQSxRQUNSO0FBQUEsUUFDQSxtQkFBbUI7QUFBQSxRQUNuQixXQUFXO0FBQUEsUUFDWCxXQUFXLDJCQUEyQjtBQUFBLE1BQ3ZDLENBQUM7QUFBQSxNQUNELFVBQVUsQ0FBQztBQUFBLFFBQ1YsTUFBTSxXQUFXO0FBQUEsUUFDakIsUUFBUTtBQUFBLFFBQ1I7QUFBQSxRQUNBLFFBQVE7QUFBQSxVQUNQLFNBQVM7QUFBQSxVQUNULGtCQUFrQjtBQUFBLFVBQ2xCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLGtCQUFrQixNQUFNLFlBQVksYUFBYSxZQUFZLENBQUM7QUFBQSxRQUN2RztBQUFBLE1BQ0QsQ0FBQztBQUFBLE1BQ0Qsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUsseURBQXlELE1BQU07QUFDbkUsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLFVBQVUsQ0FBQyxFQUFFLE1BQU0sWUFBWSxNQUFNLEVBQUUsTUFBTSxVQUFVLFdBQVcsS0FBSyxHQUFHLE1BQU0sMEJBQTBCLENBQUM7QUFDakgsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU0sRUFBRSxNQUFNLGNBQWMsSUFBSSxVQUFVLFNBQVMsUUFBUSxhQUFhO0FBQUEsTUFDeEUsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksUUFBUSxFQUFHO0FBQ3ZELFVBQU0sV0FBVztBQUFBLE1BQ2hCLE1BQU0sc0JBQXNCO0FBQUEsTUFDNUIsUUFBUSxFQUFFLEtBQUssb0JBQW9CLFNBQVMsRUFBRSxLQUFLLHVCQUF1QixFQUFFO0FBQUEsTUFDNUUsT0FBTyxFQUFFLEtBQUssb0JBQW9CLFNBQVMsRUFBRSxLQUFLLHNCQUFzQixFQUFFO0FBQUEsTUFDMUUsTUFBTSxFQUFFLE9BQU8sR0FBRyxTQUFTLEVBQUU7QUFBQSxJQUM5QjtBQUNBLFVBQU0sZUFBZSwwQkFBMEIsT0FBTyxFQUFFLFVBQVUsU0FBUyxRQUFRLFVBQVUsUUFBUSxVQUFVLFNBQVMsQ0FBQyxFQUFFLE1BQU0sWUFBWSxNQUFNLEVBQUUsTUFBTSxNQUFNLEdBQUcsTUFBTSxTQUFTLENBQUMsRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDO0FBQ25NLFVBQU0sa0JBQWtCLGlCQUFpQixPQUFPO0FBQUEsTUFDL0MsTUFBTSxFQUFFLE1BQU0sY0FBYyxJQUFJLFVBQVUsU0FBUyxRQUFRLFlBQVk7QUFBQSxNQUN2RSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNiLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxhQUFhLElBQUksWUFBVSxPQUFPLElBQUk7QUFBQSxNQUNsRCxPQUFPLGFBQWEsQ0FBQztBQUFBLE1BQ3JCLE9BQU8sYUFBYSxDQUFDO0FBQUEsTUFDckIsZ0JBQWdCLGFBQWEsQ0FBQztBQUFBLE1BQzlCO0FBQUEsTUFDQTtBQUFBLE1BQ0Esb0JBQW9CLE1BQU0sZUFBZTtBQUFBLElBQzFDLEdBQUc7QUFBQSxNQUNGLFlBQVksQ0FBQyxXQUFXLG1CQUFtQixXQUFXLG1CQUFtQixXQUFXLG1CQUFtQixXQUFXLDBCQUEwQjtBQUFBLE1BQzVJLE9BQU8sRUFBRSxNQUFNLFdBQVcsbUJBQW1CLFFBQVEsVUFBVSxZQUFZLFNBQVMsbUJBQW1CO0FBQUEsTUFDdkcsT0FBTyxFQUFFLE1BQU0sV0FBVyxtQkFBbUIsUUFBUSxVQUFVLFlBQVksbUJBQW1CLG9CQUFvQixXQUFXLG9CQUFvQixXQUFXLDJCQUEyQixVQUFVO0FBQUEsTUFDak0sZ0JBQWdCLEVBQUUsTUFBTSxXQUFXLDRCQUE0QixRQUFRLFVBQVUsWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sNENBQTRDLENBQUMsRUFBRTtBQUFBLE1BQ2hNLGNBQWMsQ0FBQyxFQUFFLE1BQU0sV0FBVyw0QkFBNEIsUUFBUSxVQUFVLFlBQVksU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLHdCQUF3QixHQUFHLFFBQVEsRUFBRSxDQUFDO0FBQUEsTUFDdEwsaUJBQWlCLENBQUMsRUFBRSxNQUFNLFdBQVcsc0JBQXNCLFFBQVEsVUFBVSxZQUFZLFFBQVEsRUFBRSxTQUFTLE1BQU0sa0JBQWtCLG9CQUFvQixTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sNENBQTRDLEdBQUcsUUFBUSxFQUFFLEVBQUUsQ0FBQztBQUFBLE1BQ3hRLG9CQUFvQjtBQUFBLElBQ3JCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLGlFQUFpRSxNQUFNO0FBQzNFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxVQUFVLENBQUMsRUFBRSxNQUFNLGVBQWUsTUFBTSxFQUFFLE1BQU0sTUFBTSxHQUFHLE1BQU0sZUFBZSxDQUFDO0FBQ3JGLFVBQU0sZUFBZSxxQkFBcUIsT0FBTyxVQUFVLGFBQWEsT0FBTztBQUMvRSxVQUFNLGVBQWUsMEJBQTBCLE9BQU87QUFBQSxNQUNyRCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxRQUFRO0FBQUEsTUFBYSxTQUFTLENBQUMsR0FBRyxPQUFPO0FBQUEsSUFDL0UsQ0FBQztBQUNELFVBQU0saUJBQWlCLGVBQWUsT0FBTztBQUFBLE1BQzVDLE1BQU0sRUFBRSxNQUFNLGNBQWMsSUFBSSxhQUFhLFNBQVMsUUFBUSxhQUFhO0FBQUEsTUFDM0UsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFFRCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFlBQVksYUFBYSxJQUFJLFlBQVUsT0FBTyxJQUFJO0FBQUEsTUFDbEQsWUFBWSxhQUFhLElBQUksWUFBVSxPQUFPLElBQUk7QUFBQSxNQUNsRDtBQUFBLElBQ0QsR0FBRztBQUFBLE1BQ0YsWUFBWSxDQUFDLFdBQVcsbUJBQW1CLFdBQVcsbUJBQW1CLFdBQVcsbUJBQW1CLFdBQVcsMEJBQTBCO0FBQUEsTUFDNUksWUFBWSxDQUFDLFdBQVcsMEJBQTBCO0FBQUEsTUFDbEQsZ0JBQWdCLENBQUM7QUFBQSxJQUNsQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrR0FBa0csTUFBTTtBQUM1RyxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sVUFBVSxDQUFDLEVBQUUsTUFBTSxjQUFjLE1BQU0sRUFBRSxNQUFNLFVBQVUsV0FBVyxLQUFLLEdBQUcsTUFBTSw4QkFBOEIsQ0FBQztBQUN2SCx5QkFBcUIsT0FBTyxVQUFVLFlBQVksT0FBTztBQUN6RCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksVUFBVSxFQUFHO0FBQ3pELFVBQU0sZUFBZSwwQkFBMEIsT0FBTztBQUFBLE1BQ3JELFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLFFBQVE7QUFBQSxNQUFZLFNBQVMsQ0FBQyxHQUFHLE9BQU87QUFBQSxJQUM5RSxHQUFHLENBQUMsR0FBRyxnQ0FBZ0M7QUFDdkMsV0FBTyxnQkFBZ0IsY0FBYyxDQUFDO0FBQUEsTUFDckMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUNBLFNBQVM7QUFBQSxRQUNSLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGtEQUFrRDtBQUFBLFFBQzVGLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGlDQUFpQztBQUFBLE1BQzVFO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLDhEQUE4RCxNQUFNO0FBQ3hFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU0sRUFBRSxNQUFNLGVBQWUsSUFBSSxTQUFTLFFBQVEsVUFBVSxNQUFNLFVBQVUsUUFBUSxjQUFjLFdBQVcsRUFBRSxPQUFPLFNBQVMsR0FBRyxtQkFBbUIsUUFBVyxVQUFVLE1BQU0sUUFBUSxNQUFNLE9BQU8sTUFBTSxZQUFZLEtBQUs7QUFBQSxNQUM1TixVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxPQUFPLEVBQUc7QUFDdEQsVUFBTSxrQkFBa0IsdUJBQXVCLE9BQU8sRUFBRSxVQUFVLFNBQVMsUUFBUSxVQUFVLFFBQVEsU0FBUyxTQUFTLFlBQVksQ0FBQztBQUNwSSxVQUFNLGtCQUFrQixpQkFBaUIsT0FBTztBQUFBLE1BQy9DLE1BQU0sRUFBRSxNQUFNLGVBQWUsSUFBSSxTQUFTLFFBQVEsVUFBVSxNQUFNLFVBQVUsUUFBUSxhQUFhLFdBQVcsRUFBRSxPQUFPLFNBQVMsR0FBRyxtQkFBbUIsUUFBVyxVQUFVLE1BQU0sUUFBUSxFQUFFLFNBQVMsQ0FBQyxNQUFNLEdBQUcsbUJBQW1CLEVBQUUsT0FBTyxFQUFFLEdBQUcsT0FBTyxLQUFLLEdBQUcsT0FBTyxNQUFNLFlBQVksRUFBRTtBQUFBLE1BQ3ZSLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixZQUFZLGFBQWEsSUFBSSxZQUFVLE9BQU8sSUFBSTtBQUFBLE1BQ2xELE9BQU8sYUFBYSxDQUFDO0FBQUEsTUFDckIsT0FBTyxhQUFhLENBQUM7QUFBQSxNQUNyQjtBQUFBLE1BQ0E7QUFBQSxNQUNBLG9CQUFvQixNQUFNLGVBQWU7QUFBQSxJQUMxQyxHQUFHO0FBQUEsTUFDRixZQUFZLENBQUMsV0FBVyxtQkFBbUIsV0FBVyxtQkFBbUIsV0FBVyxpQkFBaUI7QUFBQSxNQUNyRyxPQUFPLEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxTQUFTLDRCQUE0QjtBQUFBLE1BQ2hILE9BQU8sRUFBRSxNQUFNLFdBQVcsbUJBQW1CLFFBQVEsVUFBVSxZQUFZLG1CQUFtQix5QkFBeUIsV0FBVyw2QkFBNkIsV0FBVywyQkFBMkIsVUFBVTtBQUFBLE1BQy9NLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxXQUFXLDRCQUE0QixRQUFRLFVBQVUsWUFBWSxTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sWUFBWSxDQUFDLEVBQUUsQ0FBQztBQUFBLE1BQ25LLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxXQUFXLHNCQUFzQixRQUFRLFVBQVUsWUFBWSxRQUFRLEVBQUUsU0FBUyxNQUFNLGtCQUFrQix3QkFBd0IsU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLDJCQUEyQixDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDalAsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLG9CQUFvQixJQUFJLFVBQVUsU0FBUztBQUNqRCxVQUFNLGVBQWUsZUFBZSxPQUFPO0FBQUEsTUFDMUMsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQWUsSUFBSTtBQUFBLFFBQVMsUUFBUTtBQUFBLFFBQVUsTUFBTTtBQUFBLFFBQzFELFFBQVE7QUFBQSxRQUFjLFdBQVcsQ0FBQztBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFDeEQsVUFBVTtBQUFBLFFBQU0sUUFBUTtBQUFBLFFBQU0sT0FBTztBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQ3hEO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sUUFBUSxhQUFhLENBQUM7QUFDNUIsUUFBSSxNQUFNLFNBQVMsV0FBVyxtQkFBbUI7QUFDaEQsWUFBTSxJQUFJLE1BQU0scUNBQXFDO0FBQUEsSUFDdEQ7QUFDQSxXQUFPLGdCQUFnQixNQUFNLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixLQUFLLGlCQUFpQixVQUFVLENBQUM7QUFBQSxFQUM1RyxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLFFBQVEsMkJBQTJCO0FBSXpDLFVBQU0sZUFBZSxlQUFlLE9BQU87QUFBQSxNQUMxQyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBZSxJQUFJO0FBQUEsUUFBUyxRQUFRO0FBQUEsUUFBVSxNQUFNO0FBQUEsUUFDMUQsUUFBUTtBQUFBLFFBQWMsV0FBVyxDQUFDO0FBQUEsUUFBRyxtQkFBbUI7QUFBQSxRQUN4RCxVQUFVO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBTSxPQUFPO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDeEQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxRQUFRLGFBQWEsQ0FBQztBQUM1QixRQUFJLE1BQU0sU0FBUyxXQUFXLG1CQUFtQjtBQUNoRCxZQUFNLElBQUksTUFBTSxxQ0FBcUM7QUFBQSxJQUN0RDtBQUNBLFdBQU8sWUFBWSxNQUFNLGFBQWEsTUFBUztBQUFBLEVBQ2hELENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBQ2pGLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFDOUIsU0FBUztBQUFBLFFBQVcsS0FBSztBQUFBLFFBQVEsV0FBVztBQUFBLFFBQzVDLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbEMsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQ3RDLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUM3QjtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLFFBQVEsTUFBTSxlQUFlLElBQUksT0FBTztBQUM5QyxRQUFJLENBQUMsT0FBTztBQUNYLFlBQU0sSUFBSSxNQUFNLDhCQUE4QjtBQUFBLElBQy9DO0FBRUEsVUFBTSxrQkFBa0IsSUFBSSxNQUFNLFVBQVU7QUFDNUMsVUFBTSxVQUFVLGlCQUFpQixPQUFPO0FBQUEsTUFDdkMsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQW9CLElBQUk7QUFBQSxRQUM5QixTQUFTO0FBQUEsUUFBVyxLQUFLO0FBQUEsUUFBUSxXQUFXO0FBQUEsUUFDNUMsUUFBUTtBQUFBLFFBQWtCLFFBQVE7QUFBQSxRQUNsQyxnQkFBZ0IsQ0FBQztBQUFBLFFBQUcsa0JBQWtCO0FBQUEsUUFDdEMsVUFBVTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQzdCO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsQ0FBQztBQUNELFVBQU0sV0FBVyxRQUFRLENBQUM7QUFDMUIsUUFBSSxTQUFTLFNBQVMsV0FBVyxzQkFBc0I7QUFDdEQsWUFBTSxJQUFJLE1BQU0sd0NBQXdDO0FBQUEsSUFDekQ7QUFDQSxXQUFPLFlBQVksU0FBUyxPQUFPLFNBQVMsS0FBSztBQUNqRCxXQUFPLFlBQVksU0FBUyxPQUFPLE9BQU8sTUFBTSxRQUFRO0FBQUEsRUFDekQsQ0FBQztBQUVELE9BQUssa0VBQWtFLE1BQU07QUFDNUUsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxtQkFBZSxPQUFPO0FBQUEsTUFDckIsTUFBTTtBQUFBLFFBQ0wsTUFBTTtBQUFBLFFBQWUsSUFBSTtBQUFBLFFBQVMsUUFBUTtBQUFBLFFBQVUsTUFBTTtBQUFBLFFBQzFELFFBQVE7QUFBQSxRQUFjLFdBQVcsQ0FBQztBQUFBLFFBQUcsbUJBQW1CO0FBQUEsUUFDeEQsVUFBVTtBQUFBLFFBQU0sUUFBUTtBQUFBLFFBQU0sT0FBTztBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQ3hEO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sUUFBUSxNQUFNLGVBQWUsSUFBSSxPQUFPO0FBQzlDLFFBQUksQ0FBQyxPQUFPO0FBQ1gsWUFBTSxJQUFJLE1BQU0sOEJBQThCO0FBQUEsSUFDL0M7QUFJQSxVQUFNLGtCQUFrQixJQUFJLE1BQU0sVUFBVTtBQUM1QyxVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBZSxJQUFJO0FBQUEsUUFBUyxRQUFRO0FBQUEsUUFBVSxNQUFNO0FBQUEsUUFDMUQsUUFBUTtBQUFBLFFBQVUsV0FBVyxDQUFDO0FBQUEsUUFBRyxtQkFBbUI7QUFBQSxRQUNwRCxVQUFVO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBTSxPQUFPO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDeEQ7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsVUFBTSxXQUFXLFFBQVEsQ0FBQztBQUMxQixRQUFJLFNBQVMsU0FBUyxXQUFXLHNCQUFzQjtBQUN0RCxZQUFNLElBQUksTUFBTSx3Q0FBd0M7QUFBQSxJQUN6RDtBQUNBLFdBQU8sWUFBWSxTQUFTLE9BQU8sU0FBUyxLQUFLO0FBQ2pELFdBQU8sWUFBWSxTQUFTLE9BQU8sT0FBTyxNQUFNLFFBQVE7QUFBQSxFQUN6RCxDQUFDO0FBRUQsT0FBSyxrSEFBNkcsTUFBTTtBQUN2SCxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sZUFBZSxlQUFlLE9BQU87QUFBQSxNQUMxQyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBdUIsSUFBSTtBQUFBLFFBQVksTUFBTTtBQUFBLFFBQ25ELFFBQVE7QUFBQSxRQUFjLGdCQUFnQjtBQUFBLFFBQVMsbUJBQW1CLENBQUM7QUFBQSxRQUNuRSxRQUFRO0FBQUEsUUFBZ0MsT0FBTztBQUFBLFFBQy9DLGlCQUFpQjtBQUFBLFFBQU0sY0FBYyxDQUFDO0FBQUEsTUFDdkM7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLFVBQVUsRUFBRztBQUl6RCxXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLFNBQVM7QUFBQSxNQUNULGVBQWUsTUFBTSxlQUFlLElBQUksVUFBVSxFQUFHO0FBQUEsSUFDdEQsR0FBRztBQUFBLE1BQ0YsU0FBUztBQUFBLFFBQ1IsRUFBRSxNQUFNLFdBQVcsbUJBQW1CLFFBQVEsVUFBVSxZQUFZLFVBQVUsb0JBQW9CLGFBQWEsY0FBYztBQUFBLFFBQzdILEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxtQkFBbUIsa0JBQWtCLFdBQVcsMkJBQTJCLFVBQVU7QUFBQSxNQUMxSjtBQUFBLE1BQ0EsZUFBZTtBQUFBLElBQ2hCLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLCtGQUErRixNQUFNO0FBQ3pHLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUF1QixJQUFJO0FBQUEsUUFBYSxNQUFNO0FBQUEsUUFDcEQsUUFBUTtBQUFBLFFBQWMsZ0JBQWdCO0FBQUEsUUFBUyxtQkFBbUIsQ0FBQyxPQUFPO0FBQUEsUUFDMUUsUUFBUTtBQUFBLFFBQTRCLE9BQU87QUFBQSxRQUMzQyxpQkFBaUI7QUFBQSxRQUFNLGNBQWMsQ0FBQztBQUFBLE1BQ3ZDO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxXQUFXLEVBQUc7QUFDMUQsV0FBTyxnQkFBZ0IsY0FBYztBQUFBLE1BQ3BDLEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxVQUFVLG1CQUFtQixhQUFhLHNCQUFzQjtBQUFBLE1BQ3BJLEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxTQUFTLDJCQUEyQjtBQUFBLE1BQ3hHLEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxtQkFBbUIsMEJBQTBCLFdBQVcsNEJBQTRCLFdBQVcsMkJBQTJCLFVBQVU7QUFBQSxJQUN6TSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1RkFBdUYsTUFBTTtBQUNqRyxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBdUIsSUFBSTtBQUFBLFFBQVksTUFBTTtBQUFBLFFBQ25ELFFBQVE7QUFBQSxRQUFjLGdCQUFnQjtBQUFBLFFBQVMsbUJBQW1CLENBQUMsT0FBTztBQUFBLFFBQzFFLFFBQVE7QUFBQSxRQUFnQyxPQUFPO0FBQUEsUUFDL0MsaUJBQWlCO0FBQUEsUUFBTSxjQUFjLENBQUM7QUFBQSxNQUN2QztBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksVUFBVSxFQUFHO0FBQ3pELFVBQU0sVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUF1QixJQUFJO0FBQUEsUUFBWSxNQUFNO0FBQUEsUUFDbkQsUUFBUTtBQUFBLFFBQWEsZ0JBQWdCO0FBQUEsUUFBUyxtQkFBbUIsQ0FBQyxPQUFPO0FBQUEsUUFDekUsUUFBUTtBQUFBLFFBQWdDLE9BQU87QUFBQSxRQUMvQyxpQkFBaUI7QUFBQSxRQUNqQixjQUFjLEVBQUUsT0FBTyxFQUFFLFFBQVEsYUFBYSxTQUFTLDBCQUEwQixFQUFFO0FBQUEsTUFDcEY7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsRUFBRSxTQUFTLG9CQUFvQixNQUFNLGVBQWUsS0FBSyxHQUFHO0FBQUEsTUFDbEYsU0FBUyxDQUFDO0FBQUEsUUFDVCxNQUFNLFdBQVc7QUFBQSxRQUFzQixRQUFRO0FBQUEsUUFBVTtBQUFBLFFBQ3pELFFBQVE7QUFBQSxVQUNQLFNBQVM7QUFBQSxVQUNULGtCQUFrQjtBQUFBLFVBQ2xCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSwyQ0FBc0MsQ0FBQztBQUFBLFFBQzVGO0FBQUEsTUFDRCxDQUFDO0FBQUEsTUFDRCxvQkFBb0I7QUFBQSxJQUNyQixDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBdUIsSUFBSTtBQUFBLFFBQWUsTUFBTTtBQUFBLFFBQ3RELFFBQVE7QUFBQSxRQUFjLGdCQUFnQjtBQUFBLFFBQVMsbUJBQW1CLENBQUMsU0FBUyxPQUFPO0FBQUEsUUFDbkYsUUFBUTtBQUFBLFFBQU0sT0FBTztBQUFBLFFBQU0saUJBQWlCO0FBQUEsUUFBTSxjQUFjLENBQUM7QUFBQSxNQUNsRTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksYUFBYSxFQUFHO0FBQzVELFVBQU0sVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ3ZDLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUF1QixJQUFJO0FBQUEsUUFBZSxNQUFNO0FBQUEsUUFDdEQsUUFBUTtBQUFBLFFBQWEsZ0JBQWdCO0FBQUEsUUFBUyxtQkFBbUIsQ0FBQyxTQUFTLE9BQU87QUFBQSxRQUNsRixRQUFRO0FBQUEsUUFBTSxPQUFPO0FBQUEsUUFBTSxpQkFBaUI7QUFBQSxRQUM1QyxjQUFjO0FBQUEsVUFDYixPQUFPLEVBQUUsUUFBUSxhQUFhLFNBQVMscUJBQXFCO0FBQUEsVUFDNUQsT0FBTyxFQUFFLFFBQVEsV0FBVyxTQUFTLGtCQUFrQjtBQUFBLFFBQ3hEO0FBQUEsTUFDRDtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsZUFBZTtBQUFBLElBQ3JELENBQUM7QUFDRCxXQUFPLGdCQUFnQixTQUFTLENBQUM7QUFBQSxNQUNoQyxNQUFNLFdBQVc7QUFBQSxNQUFzQixRQUFRO0FBQUEsTUFBVTtBQUFBLE1BQ3pELFFBQVE7QUFBQSxRQUNQLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sc0JBQXNCLE1BQU0sTUFBTSx3RkFBOEUsQ0FBQztBQUFBLE1BQ3BJO0FBQUEsSUFDRCxDQUFDLENBQUM7QUFBQSxFQUNILENBQUM7QUFFRCxPQUFLLGtFQUFrRSxNQUFNO0FBQzVFLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUF1QixJQUFJO0FBQUEsUUFBZSxNQUFNO0FBQUEsUUFDdEQsUUFBUTtBQUFBLFFBQWMsZ0JBQWdCO0FBQUEsUUFBUyxtQkFBbUIsQ0FBQyxPQUFPO0FBQUEsUUFDMUUsUUFBUTtBQUFBLFFBQXVCLE9BQU87QUFBQSxRQUFXLGlCQUFpQjtBQUFBLFFBQU0sY0FBYyxDQUFDO0FBQUEsTUFDeEY7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLGFBQWEsRUFBRztBQUM1RCxVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBdUIsSUFBSTtBQUFBLFFBQWUsTUFBTTtBQUFBLFFBQ3RELFFBQVE7QUFBQSxRQUFVLGdCQUFnQjtBQUFBLFFBQVMsbUJBQW1CLENBQUMsT0FBTztBQUFBLFFBQ3RFLFFBQVE7QUFBQSxRQUF1QixPQUFPO0FBQUEsUUFBVyxpQkFBaUI7QUFBQSxRQUNsRSxjQUFjLEVBQUUsT0FBTyxFQUFFLFFBQVEsV0FBVyxTQUFTLG9CQUFvQixFQUFFO0FBQUEsTUFDNUU7QUFBQSxNQUNBLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGVBQWU7QUFBQSxJQUNyRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDO0FBQUEsTUFDaEMsTUFBTSxXQUFXO0FBQUEsTUFBc0IsUUFBUTtBQUFBLE1BQVU7QUFBQSxNQUN6RCxRQUFRO0FBQUEsUUFDUCxTQUFTO0FBQUEsUUFDVCxrQkFBa0I7QUFBQSxRQUNsQixTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sbUNBQThCLENBQUM7QUFBQSxRQUNuRixPQUFPLEVBQUUsU0FBUyxzQkFBc0I7QUFBQSxNQUN6QztBQUFBLElBQ0QsQ0FBQyxDQUFDO0FBQUEsRUFDSCxDQUFDO0FBRUQsT0FBSyxpRkFBaUYsTUFBTTtBQUMzRixVQUFNLFVBQVUsSUFBSSxvQkFBb0I7QUFDeEMsWUFBUSxJQUFJLFNBQVMsQ0FBQyxFQUFFLE1BQU0saUJBQWlCLENBQUMsQ0FBQztBQUNqRCxVQUFNLFFBQVEsMkJBQTJCLG9CQUFJLElBQUksR0FBRyxPQUFPO0FBQzNELFVBQU0sZUFBZSxlQUFlLE9BQU87QUFBQSxNQUMxQyxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsSUFBSSxTQUFTLFdBQVcsTUFBTSxNQUFNLGtCQUFrQixXQUFXLENBQUMsR0FBRyxRQUFRLGNBQWMsY0FBYyxNQUFNLFNBQVMsTUFBTSxZQUFZLEtBQUs7QUFBQSxNQUNoTCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sUUFBUSxhQUFhLENBQUM7QUFDNUIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixNQUFNLE1BQU07QUFBQSxNQUNaLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLGFBQWEsTUFBTTtBQUFBLElBQ3BCLEdBQUc7QUFBQSxNQUNGLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFVBQVU7QUFBQSxNQUNWLGFBQWEsRUFBRSxNQUFNLHdCQUF3QixRQUFRLFVBQVUsUUFBUTtBQUFBLElBQ3hFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHVFQUF1RSxNQUFNO0FBSWpGLFVBQU0sVUFBVSxJQUFJLG9CQUFvQjtBQUN4QyxZQUFRLElBQUksU0FBUyxDQUFDLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2pELFVBQU0sUUFBUSwyQkFBMkIsb0JBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLE9BQU87QUFDekUsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixJQUFJLFNBQVMsV0FBVyxNQUFNLE1BQU0sY0FBYyxXQUFXLENBQUMsR0FBRyxRQUFRLGNBQWMsY0FBYyxNQUFNLFNBQVMsTUFBTSxZQUFZLEtBQUs7QUFBQSxNQUM1SyxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sUUFBUSxhQUFhLENBQUM7QUFDNUIsV0FBTyxnQkFBZ0I7QUFBQSxNQUN0QixNQUFNLE1BQU07QUFBQSxNQUNaLFVBQVUsTUFBTTtBQUFBLE1BQ2hCLGFBQWEsTUFBTTtBQUFBLElBQ3BCLEdBQUc7QUFBQSxNQUNGLE1BQU0sV0FBVztBQUFBLE1BQ2pCLFVBQVU7QUFBQSxNQUNWLGFBQWE7QUFBQSxJQUNkLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLG9FQUFvRSxNQUFNO0FBQzlFLFVBQU0sVUFBVSxJQUFJLG9CQUFvQjtBQUN4QyxZQUFRLElBQUksU0FBUyxDQUFDLEVBQUUsTUFBTSxpQkFBaUIsQ0FBQyxDQUFDO0FBQ2pELFVBQU0sUUFBUSwyQkFBMkIsb0JBQUksSUFBSSxDQUFDLFlBQVksQ0FBQyxHQUFHLE9BQU87QUFDekUsVUFBTSxlQUFlLGVBQWUsT0FBTztBQUFBLE1BQzFDLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixJQUFJLGFBQWEsV0FBVyxNQUFNLE1BQU0sY0FBYyxXQUFXLEVBQUUsTUFBTSxXQUFXLFVBQVUsT0FBTyxHQUFHLFFBQVEsY0FBYyxjQUFjLE1BQU0sU0FBUyxNQUFNLFlBQVksS0FBSztBQUFBLE1BQ25OLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxRQUFRLGFBQWEsQ0FBQztBQUM1QixXQUFPLGdCQUFnQjtBQUFBLE1BQ3RCLE1BQU0sTUFBTTtBQUFBLE1BQ1osVUFBVSxNQUFNO0FBQUEsTUFDaEIsYUFBYSxNQUFNO0FBQUEsTUFDbkIsYUFBYSxNQUFNO0FBQUEsSUFDcEIsR0FBRztBQUFBLE1BQ0YsTUFBTSxXQUFXO0FBQUEsTUFDakIsVUFBVTtBQUFBLE1BQ1YsYUFBYTtBQUFBLE1BQ2IsYUFBYTtBQUFBLElBQ2QsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssb0ZBQW9GLE1BQU07QUFDOUYsVUFBTSxRQUFRLDJCQUEyQixvQkFBSSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDaEUsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixJQUFJLGFBQWEsV0FBVyxNQUFNLE1BQU0sY0FBYyxXQUFXLEVBQUUsTUFBTSxXQUFXLFVBQVUsT0FBTyxHQUFHLFFBQVEsY0FBYyxjQUFjLE1BQU0sU0FBUyxNQUFNLFlBQVksS0FBSztBQUFBLE1BQ25OLFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxhQUFhLE1BQU0sZUFBZSxJQUFJLFdBQVcsRUFBRztBQUMxRCxVQUFNLFdBQVc7QUFBQSxNQUNoQixNQUFNLHNCQUFzQjtBQUFBLE1BQzVCLFFBQVEsRUFBRSxLQUFLLDZCQUE2QixTQUFTLEVBQUUsS0FBSyx1QkFBdUIsRUFBRTtBQUFBLE1BQ3JGLE9BQU8sRUFBRSxLQUFLLDZCQUE2QixTQUFTLEVBQUUsS0FBSyxzQkFBc0IsRUFBRTtBQUFBLE1BQ25GLE1BQU0sRUFBRSxPQUFPLElBQUksU0FBUyxFQUFFO0FBQUEsSUFDL0I7QUFDQSxVQUFNLGtCQUFrQixpQkFBaUIsT0FBTztBQUFBLE1BQy9DLE1BQU0sRUFBRSxNQUFNLG1CQUFtQixJQUFJLGFBQWEsV0FBVyxNQUFNLE1BQU0sY0FBYyxXQUFXLEVBQUUsTUFBTSxXQUFXLFVBQVUsT0FBTyxHQUFHLFFBQVEsYUFBYSxjQUFjLENBQUMsRUFBRSxNQUFNLGFBQWEsTUFBTSxnQ0FBZ0MsQ0FBQyxHQUFHLFNBQVMsTUFBTSxZQUFZLEVBQUU7QUFBQSxNQUN6USxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsR0FBRyxDQUFDLFFBQVEsQ0FBQztBQUNiLFdBQU8sZ0JBQWdCLGlCQUFpQixDQUFDO0FBQUEsTUFDeEMsTUFBTSxXQUFXO0FBQUEsTUFDakIsUUFBUTtBQUFBLE1BQ1I7QUFBQSxNQUNBLFFBQVE7QUFBQSxRQUNQLFNBQVM7QUFBQSxRQUNULGtCQUFrQjtBQUFBLFFBQ2xCLFNBQVM7QUFBQSxVQUNSLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLGdDQUFnQztBQUFBLFVBQzFFO0FBQUEsUUFDRDtBQUFBLE1BQ0Q7QUFBQSxJQUNELENBQUMsQ0FBQztBQUFBLEVBQ0gsQ0FBQztBQUVELE9BQUssb0RBQW9ELE1BQU07QUFDOUQsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLGVBQWUsZUFBZSxPQUFPO0FBQUEsTUFDMUMsTUFBTSxFQUFFLE1BQU0sbUJBQW1CLElBQUksU0FBUyxXQUFXLFVBQVUsTUFBTSxVQUFVLFdBQVcsRUFBRSxRQUFRLElBQUksR0FBRyxRQUFRLGNBQWMsY0FBYyxNQUFNLFNBQVMsTUFBTSxZQUFZLEtBQUs7QUFBQSxNQUN6TCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxPQUFPLEVBQUc7QUFDdEQsVUFBTSxrQkFBa0IsaUJBQWlCLE9BQU87QUFBQSxNQUMvQyxNQUFNLEVBQUUsTUFBTSxtQkFBbUIsSUFBSSxTQUFTLFdBQVcsVUFBVSxNQUFNLFVBQVUsV0FBVyxFQUFFLFFBQVEsSUFBSSxHQUFHLFFBQVEsYUFBYSxjQUFjLENBQUMsRUFBRSxNQUFNLGFBQWEsTUFBTSxVQUFVLEdBQUcsRUFBRSxNQUFNLGNBQWMsVUFBVSw2QkFBNkIsQ0FBQyxHQUFHLFNBQVMsTUFBTSxZQUFZLEVBQUU7QUFBQSxNQUN6UixVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxlQUFlO0FBQUEsSUFDckQsQ0FBQztBQUNELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsWUFBWSxhQUFhLElBQUksWUFBVSxPQUFPLElBQUk7QUFBQSxNQUNsRCxPQUFPLGFBQWEsQ0FBQztBQUFBLE1BQ3JCLE9BQU8sYUFBYSxDQUFDO0FBQUEsTUFDckI7QUFBQSxNQUNBLG9CQUFvQixNQUFNLGVBQWU7QUFBQSxJQUMxQyxHQUFHO0FBQUEsTUFDRixZQUFZLENBQUMsV0FBVyxtQkFBbUIsV0FBVyxtQkFBbUIsV0FBVyxpQkFBaUI7QUFBQSxNQUNyRyxPQUFPLEVBQUUsTUFBTSxXQUFXLG1CQUFtQixRQUFRLFVBQVUsWUFBWSxTQUFTLHdCQUF3QjtBQUFBLE1BQzVHLE9BQU8sRUFBRSxNQUFNLFdBQVcsbUJBQW1CLFFBQVEsVUFBVSxZQUFZLG1CQUFtQix5QkFBeUIsV0FBVyx5QkFBeUIsV0FBVywyQkFBMkIsVUFBVTtBQUFBLE1BQzNNLGlCQUFpQixDQUFDLEVBQUUsTUFBTSxXQUFXLHNCQUFzQixRQUFRLFVBQVUsWUFBWSxRQUFRLEVBQUUsU0FBUyxNQUFNLGtCQUFrQix3QkFBd0IsU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLHNDQUFzQyxDQUFDLEVBQUUsRUFBRSxDQUFDO0FBQUEsTUFDNVAsb0JBQW9CO0FBQUEsSUFDckIsQ0FBQztBQUFBLEVBQ0YsQ0FBQztBQUVELE9BQUssK0RBQStELE1BQU07QUFDekUsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLGdCQUFnQjtBQUN0QixVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFDSixPQUFPLENBQUM7QUFBQSxRQUFHLFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUNyQyxRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFBTSxXQUFXO0FBQUEsUUFBZSxhQUFhO0FBQUEsUUFBaUIsWUFBWTtBQUFBLE1BQ2xGO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsU0FBUyxDQUFDLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixRQUFRLFVBQVUsVUFBVSxLQUFLLENBQUMsQ0FBQztBQUN6RyxXQUFPLFlBQVksTUFBTSxlQUFlLE1BQVM7QUFBQSxFQUNsRCxDQUFDO0FBRUQsT0FBSyxnRkFBZ0YsTUFBTTtBQUMxRixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQVMsU0FBUztBQUFBLFFBQXVCLEtBQUs7QUFBQSxRQUM1RSxXQUFXO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUN6RTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksT0FBTyxFQUFHO0FBQ3RELFVBQU0sa0JBQWtCLGVBQWUsT0FBTztBQUFBLE1BQzdDLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLFNBQVMsTUFBTSxHQUFHO0FBQUEsTUFDcEQsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGdCQUFnQixxQkFBcUIsT0FBTztBQUFBLE1BQ2pELFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLFFBQVE7QUFBQSxNQUFTLE9BQU87QUFBQSxJQUM5RCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsRUFBRSxpQkFBaUIsY0FBYyxHQUFHLEVBQUUsaUJBQWlCLENBQUMsR0FBRyxlQUFlLENBQUMsRUFBRSxDQUFDO0FBRXJHLFVBQU0sU0FBUyxNQUFNLGFBQWEsSUFBSSxPQUFPO0FBQzdDLFVBQU0sZUFBZTtBQUFBLE1BQ3BCLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUNKLE9BQU8sQ0FBQztBQUFBLFVBQ1AsTUFBTTtBQUFBLFVBQW9CLElBQUk7QUFBQSxVQUFTLFNBQVM7QUFBQSxVQUF1QixLQUFLO0FBQUEsVUFDNUUsV0FBVztBQUFBLFVBQU0sUUFBUTtBQUFBLFVBQVMsUUFBUTtBQUFBLFVBQWEsZ0JBQWdCLENBQUM7QUFBQSxVQUN4RSxrQkFBa0I7QUFBQSxVQUFJLFVBQVU7QUFBQSxVQUFNLFlBQVk7QUFBQSxRQUNuRCxDQUFVO0FBQUEsUUFDVixXQUFXLEVBQUUsTUFBTSxPQUFPO0FBQUEsUUFDMUIsUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQU0sV0FBVztBQUFBLFFBQU0sYUFBYTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQzlEO0FBQUEsSUFDRDtBQUNBLFVBQU0sVUFBVSxpQkFBaUIsT0FBTyxZQUFZO0FBRXBELFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFBc0IsUUFBUTtBQUFBLFFBQVU7QUFBQSxRQUN6RCxRQUFRLEVBQUUsU0FBUyxPQUFPLGtCQUFrQixpQkFBaUIsU0FBUyxRQUFXLE9BQU8sRUFBRSxTQUFTLHFEQUFxRCxFQUFFO0FBQUEsTUFDM0o7QUFBQSxNQUNBLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxRQUFRLFNBQVMsR0FBRyxFQUFFO0FBQUEsTUFDMUgsRUFBRSxNQUFNLFdBQVcsV0FBVyxRQUFRLFVBQVUsUUFBUSxTQUFTLE9BQU87QUFBQSxNQUN4RSxFQUFFLE1BQU0sV0FBVyxrQkFBa0IsUUFBUSxVQUFVLFVBQVUsRUFBRTtBQUFBLElBQ3BFLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLHlFQUF5RSxNQUFNO0FBQ25GLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsbUJBQWUsT0FBTztBQUFBLE1BQ3JCLE1BQU07QUFBQSxRQUNMLE1BQU07QUFBQSxRQUFvQixJQUFJO0FBQUEsUUFBUyxTQUFTO0FBQUEsUUFBdUIsS0FBSztBQUFBLFFBQzVFLFdBQVc7QUFBQSxRQUFNLFFBQVE7QUFBQSxRQUFrQixRQUFRO0FBQUEsUUFDbkQsZ0JBQWdCLENBQUM7QUFBQSxRQUFHLGtCQUFrQjtBQUFBLFFBQU0sVUFBVTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQ3pFO0FBQUEsTUFDQSxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sYUFBYSxNQUFNLGVBQWUsSUFBSSxPQUFPLEVBQUc7QUFDdEQsVUFBTSxVQUFVLGlCQUFpQixPQUFPO0FBQUEsTUFDdkMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxDQUFDO0FBQUEsVUFDUCxNQUFNO0FBQUEsVUFBb0IsSUFBSTtBQUFBLFVBQVMsU0FBUztBQUFBLFVBQXVCLEtBQUs7QUFBQSxVQUM1RSxXQUFXO0FBQUEsVUFBTSxRQUFRO0FBQUEsVUFBUyxRQUFRO0FBQUEsVUFBYSxnQkFBZ0IsQ0FBQztBQUFBLFVBQ3hFLGtCQUFrQjtBQUFBLFVBQVEsVUFBVTtBQUFBLFVBQUcsWUFBWTtBQUFBLFFBQ3BELENBQVU7QUFBQSxRQUNWLFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUMxQixRQUFRO0FBQUEsUUFDUixPQUFPO0FBQUEsUUFBTSxXQUFXO0FBQUEsUUFBTSxhQUFhO0FBQUEsUUFBTSxZQUFZO0FBQUEsTUFDOUQ7QUFBQSxJQUNELENBQUM7QUFFRCxXQUFPLGdCQUFnQixTQUFTO0FBQUEsTUFDL0I7QUFBQSxRQUNDLE1BQU0sV0FBVztBQUFBLFFBQXNCLFFBQVE7QUFBQSxRQUFVO0FBQUEsUUFDekQsUUFBUTtBQUFBLFVBQ1AsU0FBUztBQUFBLFVBQ1Qsa0JBQWtCO0FBQUEsVUFDbEIsU0FBUyxDQUFDLEVBQUUsTUFBTSxzQkFBc0IsTUFBTSxNQUFNLE9BQU8sQ0FBQztBQUFBLFVBQzVELE9BQU87QUFBQSxRQUNSO0FBQUEsTUFDRDtBQUFBLE1BQ0EsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsVUFBVSxVQUFVLEVBQUU7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw4RUFBOEUsTUFBTTtBQUN4RixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sZUFBZSxJQUFJLFVBQVUsRUFBRSxZQUFZLFFBQVEsUUFBUSxVQUFVLFVBQVUsY0FBYyxRQUFRLEdBQUcsQ0FBQztBQUMvRyxVQUFNLGtCQUFrQixlQUFlLE9BQU87QUFBQSxNQUM3QyxNQUFNLEVBQUUsTUFBTSxnQkFBZ0IsSUFBSSxTQUFTLE1BQU0sR0FBRztBQUFBLE1BQ3BELFVBQVU7QUFBQSxNQUFTLFFBQVE7QUFBQSxNQUFVLGFBQWE7QUFBQSxJQUNuRCxDQUFDO0FBQ0QsVUFBTSxTQUFTLE1BQU0sYUFBYSxJQUFJLE9BQU87QUFDN0MsV0FBTyxnQkFBZ0IsaUJBQWlCO0FBQUEsTUFDdkMsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsVUFBVSxNQUFNLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxJQUFJLFFBQVEsU0FBUyxHQUFHLEVBQUU7QUFBQSxJQUMzSCxDQUFDO0FBRUQsVUFBTSxVQUFVLGlCQUFpQixPQUFPO0FBQUEsTUFDdkMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQ0osT0FBTyxDQUFDLEVBQUUsTUFBTSxhQUFhLElBQUksVUFBVSxPQUFPLFNBQVMsUUFBUSxFQUFFLE1BQU0sVUFBVSxPQUFPLFFBQVEsRUFBRSxDQUFVO0FBQUEsUUFDaEgsV0FBVyxFQUFFLE1BQU0sT0FBTztBQUFBLFFBQzFCLFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUFNLFdBQVc7QUFBQSxRQUFNLGFBQWE7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUM5RDtBQUFBLElBQ0QsQ0FBQztBQUVELFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFBc0IsUUFBUTtBQUFBLFFBQVUsWUFBWTtBQUFBLFFBQ3JFLFFBQVEsRUFBRSxTQUFTLE9BQU8sa0JBQWtCLHNCQUFzQixTQUFTLFFBQVcsT0FBTyxFQUFFLFNBQVMscURBQXFELEVBQUU7QUFBQSxNQUNoSztBQUFBLE1BQ0EsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsVUFBVSxVQUFVLEVBQUU7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyw0RkFBNEYsTUFBTTtBQUN0RyxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQVMsU0FBUztBQUFBLFFBQXVCLEtBQUs7QUFBQSxRQUM1RSxXQUFXO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUN6RTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFFRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksT0FBTyxFQUFHO0FBQ3RELFVBQU0sZ0JBQWdCLGVBQWUsT0FBTztBQUFBLE1BQzNDLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLFNBQVMsTUFBTSxHQUFHO0FBQUEsTUFDcEQsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxXQUFPLGdCQUFnQixlQUFlLENBQUMsQ0FBQztBQUN4QyxVQUFNLGNBQWMsTUFBTSxhQUFhLElBQUksT0FBTztBQUNsRCxVQUFNLFlBQVksaUJBQWlCLE9BQU87QUFBQSxNQUN6QyxNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQVMsU0FBUztBQUFBLFFBQXVCLEtBQUs7QUFBQSxRQUM1RSxXQUFXO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFJLFVBQVU7QUFBQSxRQUFHLFlBQVk7QUFBQSxNQUNwRTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsZUFBZTtBQUFBLElBQ3JELENBQUM7QUFDRCxXQUFPLGdCQUFnQixXQUFXLENBQUMsQ0FBQztBQUNwQyxVQUFNLGVBQWUsZUFBZSxPQUFPO0FBQUEsTUFDMUMsTUFBTSxFQUFFLE1BQU0sZ0JBQWdCLElBQUksU0FBUyxNQUFNLEdBQUc7QUFBQSxNQUNwRCxVQUFVO0FBQUEsTUFBUyxRQUFRO0FBQUEsTUFBVSxhQUFhO0FBQUEsSUFDbkQsQ0FBQztBQUNELFVBQU0sZUFBZSxNQUFNLGFBQWEsSUFBSSxPQUFPO0FBRW5ELFdBQU8sZ0JBQWdCLGNBQWM7QUFBQSxNQUNwQztBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFBc0IsUUFBUTtBQUFBLFFBQVU7QUFBQSxRQUN6RCxRQUFRO0FBQUEsVUFDUCxTQUFTO0FBQUEsVUFDVCxrQkFBa0I7QUFBQSxVQUNsQixTQUFTO0FBQUEsVUFDVCxPQUFPO0FBQUEsUUFDUjtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxhQUFhLFNBQVMsR0FBRyxFQUFFO0FBQUEsTUFDL0gsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsVUFBVSxNQUFNLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxJQUFJLGNBQWMsU0FBUyxPQUFPLEVBQUU7QUFBQSxJQUNySSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRkFBa0YsTUFBTTtBQUM1RixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLG1CQUFlLE9BQU87QUFBQSxNQUNyQixNQUFNO0FBQUEsUUFDTCxNQUFNO0FBQUEsUUFBb0IsSUFBSTtBQUFBLFFBQVMsU0FBUztBQUFBLFFBQXVCLEtBQUs7QUFBQSxRQUM1RSxXQUFXO0FBQUEsUUFBTSxRQUFRO0FBQUEsUUFBa0IsUUFBUTtBQUFBLFFBQ25ELGdCQUFnQixDQUFDO0FBQUEsUUFBRyxrQkFBa0I7QUFBQSxRQUFNLFVBQVU7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUN6RTtBQUFBLE1BQ0EsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUM7QUFDRCxVQUFNLGFBQWEsTUFBTSxlQUFlLElBQUksT0FBTyxFQUFHO0FBQ3RELFdBQU8sZ0JBQWdCLGVBQWUsT0FBTztBQUFBLE1BQzVDLE1BQU0sRUFBRSxNQUFNLGdCQUFnQixJQUFJLFNBQVMsTUFBTSxPQUFPO0FBQUEsTUFDeEQsVUFBVTtBQUFBLE1BQVMsUUFBUTtBQUFBLE1BQVUsYUFBYTtBQUFBLElBQ25ELENBQUMsR0FBRyxDQUFDLENBQUM7QUFDTixVQUFNLFNBQVMsTUFBTSxhQUFhLElBQUksT0FBTztBQUU3QyxVQUFNLFVBQVUsMEJBQTBCLE9BQU8sK0VBQStFO0FBRWhJLFdBQU8sZ0JBQWdCLFNBQVM7QUFBQSxNQUMvQjtBQUFBLFFBQ0MsTUFBTSxXQUFXO0FBQUEsUUFBc0IsUUFBUTtBQUFBLFFBQVU7QUFBQSxRQUN6RCxRQUFRO0FBQUEsVUFDUCxTQUFTO0FBQUEsVUFDVCxrQkFBa0I7QUFBQSxVQUNsQixTQUFTO0FBQUEsVUFDVCxPQUFPLEVBQUUsU0FBUyxnRkFBZ0Y7QUFBQSxRQUNuRztBQUFBLE1BQ0Q7QUFBQSxNQUNBLEVBQUUsTUFBTSxXQUFXLGtCQUFrQixRQUFRLFVBQVUsTUFBTSxFQUFFLE1BQU0saUJBQWlCLFVBQVUsSUFBSSxRQUFRLFNBQVMsT0FBTyxFQUFFO0FBQUEsSUFDL0gsQ0FBQztBQUNELFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsV0FBVyxNQUFNLGVBQWU7QUFBQSxNQUNoQyxtQkFBbUIsTUFBTSx3QkFBd0I7QUFBQSxNQUNqRCxrQkFBa0IsTUFBTTtBQUFBLElBQ3pCLEdBQUc7QUFBQSxNQUNGLFdBQVc7QUFBQSxNQUNYLG1CQUFtQjtBQUFBLE1BQ25CLGtCQUFrQjtBQUFBLElBQ25CLENBQUM7QUFBQSxFQUNGLENBQUM7QUFFRCxPQUFLLDJFQUEyRSxNQUFNO0FBQ3JGLFVBQU0sUUFBUSwyQkFBMkI7QUFDekMsVUFBTSxlQUFlLElBQUksU0FBUyxFQUFFLFlBQVksUUFBUSxRQUFRLFVBQVUsVUFBVSxTQUFTLFFBQVEsaUJBQWlCLENBQUM7QUFDdkgsVUFBTSxVQUFVLGlCQUFpQixPQUFPO0FBQUEsTUFDdkMsVUFBVTtBQUFBLE1BQ1YsTUFBTTtBQUFBLFFBQ0wsSUFBSTtBQUFBLFFBQVUsT0FBTyxDQUFDO0FBQUEsUUFBRyxXQUFXLEVBQUUsTUFBTSxPQUFPO0FBQUEsUUFDbkQsUUFBUTtBQUFBLFFBQ1IsT0FBTztBQUFBLFFBQU0sV0FBVztBQUFBLFFBQU0sYUFBYTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQzlEO0FBQUEsSUFDRCxHQUFHLEdBQUc7QUFDTixVQUFNLGlCQUFpQixRQUFRLENBQUM7QUFDaEMsVUFBTSxFQUFFLFVBQVUsa0JBQWtCLEdBQUcsYUFBYSxJQUFJO0FBQ3hELFdBQU8sZ0JBQWdCLEVBQUUsU0FBUyxDQUFDLFFBQVEsQ0FBQyxHQUFHLFlBQVksR0FBRyxvQkFBb0IsTUFBTSxlQUFlLEtBQUssR0FBRztBQUFBLE1BQzlHLFNBQVM7QUFBQSxRQUNSLEVBQUUsTUFBTSxXQUFXLHNCQUFzQixRQUFRLFVBQVUsWUFBWSxRQUFRLFFBQVEsRUFBRSxTQUFTLE9BQU8sa0JBQWtCLGlCQUFpQixTQUFTLENBQUMsRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0saUJBQWlCLENBQUMsR0FBRyxPQUFPLEVBQUUsU0FBUyxxREFBcUQsRUFBRSxFQUFFO0FBQUEsUUFDaFMsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsU0FBUztBQUFBLE1BQ3ZEO0FBQUEsTUFDQSxvQkFBb0I7QUFBQSxJQUNyQixDQUFDO0FBQ0QsV0FBTyxZQUFZLGtCQUFrQixHQUFHO0FBQUEsRUFDekMsQ0FBQztBQUVELE9BQUssd0VBQXdFLE1BQU07QUFDbEYsVUFBTSxRQUFRLDJCQUEyQjtBQUN6QyxVQUFNLFVBQVUsaUJBQWlCLE9BQU87QUFBQSxNQUN2QyxVQUFVO0FBQUEsTUFDVixNQUFNO0FBQUEsUUFDTCxJQUFJO0FBQUEsUUFBVSxPQUFPLENBQUM7QUFBQSxRQUFHLFdBQVcsRUFBRSxNQUFNLE9BQU87QUFBQSxRQUNuRCxRQUFRO0FBQUEsUUFDUixPQUFPLEVBQUUsU0FBUyxPQUFPO0FBQUEsUUFDekIsV0FBVztBQUFBLFFBQU0sYUFBYTtBQUFBLFFBQU0sWUFBWTtBQUFBLE1BQ2pEO0FBQUEsSUFDRCxDQUFDO0FBQ0QsV0FBTyxnQkFBZ0IsU0FBUztBQUFBLE1BQy9CLEVBQUUsTUFBTSxXQUFXLFdBQVcsUUFBUSxVQUFVLFVBQVUsR0FBRyxPQUFPLEVBQUUsV0FBVyxjQUFjLFNBQVMsT0FBTyxFQUFFO0FBQUEsTUFDakgsRUFBRSxNQUFNLFdBQVcsa0JBQWtCLFFBQVEsVUFBVSxVQUFVLEVBQUU7QUFBQSxJQUNwRSxDQUFDO0FBQUEsRUFDRixDQUFDO0FBRUQsT0FBSyxrRUFBa0UsTUFBTTtBQUM1RSxVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sVUFBVSxpQkFBaUIsT0FBTztBQUFBLE1BQ3ZDLFVBQVU7QUFBQSxNQUNWLE1BQU07QUFBQSxRQUNMLElBQUk7QUFBQSxRQUFVLE9BQU8sQ0FBQztBQUFBLFFBQUcsV0FBVyxFQUFFLE1BQU0sT0FBTztBQUFBLFFBQ25ELFFBQVE7QUFBQSxRQUNSLE9BQU87QUFBQSxRQUFNLFdBQVc7QUFBQSxRQUFNLGFBQWE7QUFBQSxRQUFNLFlBQVk7QUFBQSxNQUM5RDtBQUFBLElBQ0QsQ0FBQztBQUNELFdBQU8sZ0JBQWdCLFNBQVMsQ0FBQyxFQUFFLE1BQU0sV0FBVyxtQkFBbUIsUUFBUSxVQUFVLFVBQVUsRUFBRSxDQUFDLENBQUM7QUFBQSxFQUN4RyxDQUFDO0FBRUQsT0FBSyw4Q0FBOEMsTUFBTTtBQUN4RCxXQUFPLFlBQVksb0JBQW9CLFdBQVcsR0FBRyxVQUFVLFFBQVE7QUFDdkUsV0FBTyxZQUFZLG9CQUFvQixhQUFhLEdBQUcsVUFBVSxTQUFTO0FBQzFFLFdBQU8sWUFBWSxvQkFBb0IsUUFBUSxHQUFHLFVBQVUsS0FBSztBQUNqRSxXQUFPLFlBQVksb0JBQW9CLE9BQU8sR0FBRyxVQUFVLFFBQVE7QUFBQSxFQUNwRSxDQUFDO0FBRUQsT0FBSywrREFBK0QsTUFBTTtBQUN6RSxXQUFPO0FBQUEsTUFDTixxQkFBcUI7QUFBQSxRQUNwQixFQUFFLE1BQU0sUUFBUSxNQUFNLFNBQVMsZUFBZSxDQUFDLEVBQUU7QUFBQSxRQUNqRCxFQUFFLE1BQU0sU0FBUyxLQUFLLGlCQUFpQjtBQUFBLFFBQ3ZDLEVBQUUsTUFBTSxRQUFRLE1BQU0sVUFBVSxlQUFlLENBQUMsRUFBRTtBQUFBLFFBQ2xELEVBQUUsTUFBTSxXQUFXLE1BQU0sT0FBTyxNQUFNLE9BQU87QUFBQSxNQUM5QyxDQUFDO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFDQSxXQUFPLFlBQVkscUJBQXFCLENBQUMsQ0FBQyxHQUFHLEVBQUU7QUFDL0MsV0FBTyxZQUFZLHFCQUFxQixDQUFDLEVBQUUsTUFBTSxTQUFTLEtBQUssaUJBQWlCLENBQUMsQ0FBQyxHQUFHLEVBQUU7QUFBQSxFQUN4RixDQUFDO0FBRUQsT0FBSyx1RUFBdUUsTUFBTTtBQUNqRixVQUFNLFFBQVEsMkJBQTJCO0FBQ3pDLFVBQU0sZ0JBQWdCO0FBQ3RCLFVBQU0sYUFBYSxJQUFJLE1BQU0sSUFBSTtBQUNqQyxVQUFNLGVBQWUsSUFBSSxNQUFNLEVBQUUsWUFBWSxNQUFNLFFBQVEsVUFBVSxVQUFVLFNBQVMsUUFBUSxHQUFHLENBQUM7QUFDcEcsVUFBTSxzQkFBc0IsSUFBSSxNQUFNLElBQUk7QUFDMUMsVUFBTSxrQkFBa0IsSUFBSSxVQUFVO0FBQ3RDLDJCQUF1QixLQUFLO0FBQzVCLFdBQU8sZ0JBQWdCO0FBQUEsTUFDdEIsZUFBZSxNQUFNO0FBQUEsTUFDckIsT0FBTyxNQUFNLGFBQWE7QUFBQSxNQUMxQixXQUFXLE1BQU0sZUFBZTtBQUFBLE1BQ2hDLFdBQVcsTUFBTSxzQkFBc0I7QUFBQSxNQUN2QyxVQUFVLE1BQU0sa0JBQWtCO0FBQUEsSUFDbkMsR0FBRyxFQUFFLGVBQWUsVUFBVSxPQUFPLEdBQUcsV0FBVyxHQUFHLFdBQVcsR0FBRyxVQUFVLEVBQUUsQ0FBQztBQUFBLEVBQ2xGLENBQUM7QUFDRixDQUFDOyIsCiAgIm5hbWVzIjogW10KfQo=
