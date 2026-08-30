import assert from "assert";
import * as sinon from "sinon";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { STREAMING_TOOL_DISPLAY_INTERVAL_MS } from "../../common/streamingToolCallDisplay.js";
import { ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/protocol/state.js";
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from "../../node/claude/claudeMapSessionEvents.js";
import { CLAUDE_USER_DECLINED_MESSAGE } from "../../node/claude/claudeToolDenial.js";
import { encodeForwardedChatError, PROXY_ERROR_PREFIX } from "../../node/shared/proxyChatError.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import {
  makeAssistantMessage,
  makeContentBlockStartText,
  makeContentBlockStartThinking,
  makeContentBlockStartToolUse,
  makeContentBlockStop,
  makeInputJsonDelta,
  makeMessageStart,
  makeMessageStop,
  makeResultError,
  makeResultSuccess,
  makeStreamEvent,
  makeTextDelta,
  makeThinkingDelta,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
suite("claudeMapSessionEvents \u2014 direct mapper tests", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const SESSION = URI.parse("agent-session://test/abc");
  const SESSION_STR = SESSION.toString();
  const SESSION_ID = "sid-1";
  const TURN_ID = "turn-1";
  let clock;
  teardown(() => {
    clock?.restore();
    clock = void 0;
  });
  class CapturingLogService extends NullLogService {
    constructor() {
      super(...arguments);
      this.warns = [];
    }
    warn(message, ...args) {
      this.warns.push([message, ...args.map((a) => String(a))].join(" "));
    }
  }
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("message_start emits no signals", () => {
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeMessageStart()),
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r()
    );
    assert.deepStrictEqual(signals, []);
  });
  test("error_during_execution result emits a ChatError carrying duration and _meta", () => {
    const marker = encodeForwardedChatError({ fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded", message: "You have exceeded your monthly quota" } } });
    const signals = mapSDKMessageToAgentSignals(
      makeResultError(SESSION_ID, [`CAPI request failed: 402 Payment Required \u2014 quota ${marker}`]),
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r(),
      void 0,
      123
    );
    const errorSignal = signals.find((s) => s.kind === "action" && s.action.type === ActionType.ChatError);
    assert.ok(errorSignal && errorSignal.kind === "action" && errorSignal.action.type === ActionType.ChatError);
    assert.strictEqual(errorSignal.action.duration, 123);
    const error = errorSignal.action.error;
    const meta = error._meta;
    assert.strictEqual(meta?.chatError?.fetchError?.type, "quotaExceeded");
    assert.ok(!error.message.includes(PROXY_ERROR_PREFIX), "proxy marker should be stripped from the human-readable message");
  });
  test("successful result is_error with a proxy marker emits a ChatError carrying _meta", () => {
    const marker = encodeForwardedChatError({ fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded" } } });
    const result = makeResultSuccess(SESSION_ID);
    const signals = mapSDKMessageToAgentSignals(
      { ...result, is_error: true, result: `quota ${marker}` },
      SESSION,
      TURN_ID,
      new ClaudeMapperState(),
      new NullLogService(),
      r()
    );
    const errorSignal = signals.find((s) => s.kind === "action" && s.action.type === ActionType.ChatError);
    assert.ok(errorSignal && errorSignal.kind === "action" && errorSignal.action.type === ActionType.ChatError);
    const meta = errorSignal.action.error._meta;
    assert.strictEqual(meta?.chatError?.fetchError?.type, "quotaExceeded");
  });
  test("text content block: start emits ChatResponsePart, deltas emit ChatDelta", () => {
    const out = [];
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    const push = (msgs) => out.push(...msgs);
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart()), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "Hello, ")), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "world!")), SESSION, TURN_ID, state, log, resolver));
    push(mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver));
    assert.strictEqual(out.length, 3);
    const start = out[0];
    assert.ok(start.kind === "action" && start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(start.resource.toString(), SESSION_STR);
    assert.strictEqual(start.action.turnId, TURN_ID);
    assert.strictEqual(start.action.part.kind, ResponsePartKind.Markdown);
    const partId = start.action.part.id;
    assert.ok(partId.length > 0);
    assert.deepStrictEqual(out.slice(1), [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatDelta,
          turnId: TURN_ID,
          partId,
          content: "Hello, "
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatDelta,
          turnId: TURN_ID,
          partId,
          content: "world!"
        }
      }
    ]);
  });
  test("thinking content block: start emits Reasoning part, deltas emit ChatReasoning", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const startSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(startSignals.length, 1);
    const start = startSignals[0];
    assert.ok(start.kind === "action" && start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(start.action.part.kind, ResponsePartKind.Reasoning);
    const partId = start.action.part.id;
    const deltaSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeThinkingDelta(0, "pondering")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(deltaSignals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatReasoning,
        turnId: TURN_ID,
        partId,
        content: "pondering"
      }
    }]);
  });
  test("Test 8 \u2014 content_block_start tool_use emits ChatToolCallStart with displayName", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallStart,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        toolName: "Read",
        displayName: "Read file",
        _meta: { toolKind: "read" }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 8b \u2014 content_block_start for an mcp__client__* tool sets the Client contributor", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const CLIENT_ID = "client-abc";
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_c", "mcp__client__problems")),
      SESSION,
      TURN_ID,
      state,
      log,
      r(),
      () => CLIENT_ID
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallStart,
        turnId: TURN_ID,
        toolCallId: "tu_c",
        toolName: "problems",
        displayName: "problems",
        contributor: { kind: ToolCallContributorKind.Client, clientId: CLIENT_ID }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 10b \u2014 a tool denied by the user maps to result.error.code = denied", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_d", "Bash")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_d", CLAUDE_USER_DECLINED_MESSAGE, { isError: true }),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const signal = signals[0];
    if (signal.kind !== "action" || signal.action.type !== ActionType.ChatToolCallComplete) {
      throw new Error(`expected a ChatToolCallComplete action, got ${signal.kind}`);
    }
    assert.strictEqual(signal.action.result.success, false);
    assert.deepStrictEqual(signal.action.result.error, { message: CLAUDE_USER_DECLINED_MESSAGE, code: "denied" });
  });
  test("Test 9 \u2014 input_json_delta emits ChatToolCallDelta scoped to the open tool_use block", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_pa')),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        content: '{"file_pa'
      }
    }]);
  });
  test("file-edit input deltas emit compact rich invocation messages", () => {
    clock = sinon.useFakeTimers({ toFake: ["performance"] });
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_write", "Write")), SESSION, TURN_ID, state, log, resolver);
    const first = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_path":"/src/new.ts","content":"one\\ntwo')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    clock.tick(STREAMING_TOOL_DISPLAY_INTERVAL_MS);
    const second = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '\\nthree\\nfour\\nfive"')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    assert.deepStrictEqual([...first, ...second], [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_write",
          content: "",
          invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (2 lines)" }
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_write",
          content: "",
          invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (5 lines)" }
        }
      }
    ]);
  });
  test("content_block_stop flushes the final rich file-edit message held back by the throttle", () => {
    clock = sinon.useFakeTimers({ toFake: ["performance"] });
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_write", "Write")), SESSION, TURN_ID, state, log, resolver);
    const first = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"file_path":"/src/new.ts","content":"one')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    const withinInterval = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '\\ntwo"}')),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    const stopped = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStop(0)),
      SESSION,
      TURN_ID,
      state,
      log,
      resolver
    );
    assert.deepStrictEqual({
      first: first.map((signal) => signal.kind === "action" ? signal.action : void 0),
      withinInterval,
      stopped: stopped.map((signal) => signal.kind === "action" ? signal.action : void 0)
    }, {
      first: [{
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        content: "",
        invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (1 line)" }
      }],
      withinInterval: [],
      stopped: [{
        type: ActionType.ChatToolCallDelta,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        content: "",
        invocationMessage: { markdown: "Creating [new.ts](file:///src/new.ts) (2 lines)" }
      }, {
        type: ActionType.ChatToolCallReady,
        turnId: TURN_ID,
        toolCallId: "tu_write",
        invocationMessage: { markdown: "Edit [new.ts](file:///src/new.ts)" },
        toolInput: '{\n  "file_path": "/src/new.ts",\n  "content": "one\\ntwo"\n}',
        confirmed: ToolCallConfirmationReason.NotNeeded
      }]
    });
  });
  test("client tools with Claude built-in names preserve client semantics throughout the lifecycle", () => {
    const state = new ClaudeMapperState();
    const resolver = r();
    const start = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_client_write", "mcp__client__Write")),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver,
      () => "client-1"
    );
    const delta = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"value":"client input"}')),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver
    );
    const ready = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStop(0)),
      SESSION,
      TURN_ID,
      state,
      new NullLogService(),
      resolver
    );
    const complete = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_client_write", "done"),
      SESSION,
      "turn-2-irrelevant",
      state,
      new NullLogService(),
      resolver
    );
    assert.deepStrictEqual([...start, ...delta, ...ready, ...complete], [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallStart,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          toolName: "Write",
          displayName: "Write",
          contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" }
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallDelta,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          content: '{"value":"client input"}'
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallReady,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          invocationMessage: "Write",
          toolInput: '{\n  "value": "client input"\n}',
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      },
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatToolCallComplete,
          turnId: TURN_ID,
          toolCallId: "tu_client_write",
          result: {
            success: true,
            pastTenseMessage: "Write",
            content: [{ type: ToolResultContentType.Text, text: "done" }]
          }
        }
      }
    ]);
  });
  test("Test 9.5 \u2014 content_block_stop emits ChatToolCallReady so auto-allowed tools leave Streaming", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_b", "Bash")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeInputJsonDelta(0, '{"command":"git status"}')), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallReady,
        turnId: TURN_ID,
        toolCallId: "tu_b",
        invocationMessage: { markdown: "Running `git status`" },
        toolInput: "git status",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: { toolKind: "terminal" }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 10 \u2014 synthetic user tool_result emits ChatToolCallComplete with the originating turnId", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_1", "Read")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStop(0)), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_1", "file contents"),
      SESSION,
      "turn-2-irrelevant",
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, [{
      kind: "action",
      resource: SESSION,
      action: {
        type: ActionType.ChatToolCallComplete,
        turnId: TURN_ID,
        toolCallId: "tu_1",
        result: {
          success: true,
          pastTenseMessage: "Read file",
          content: [{ type: ToolResultContentType.Text, text: "file contents" }]
        }
      }
    }]);
    assert.deepStrictEqual(log.warns, []);
  });
  test("Test 11 \u2014 tool_result for unknown tool_use_id emits no signal and warns", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "unknown-id", "orphan content"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.strictEqual(log.warns.length, 1);
    assert.ok(log.warns[0].includes("tool_result for unknown tool_use_id unknown-id"));
  });
  test("tool_result with is_error: true reports success=false", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_err", "Bash")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_err", "permission denied", { isError: true }),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(signals.length, 1);
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.strictEqual(complete.action.result.success, false);
    assert.strictEqual(complete.action.result.error?.code, void 0);
  });
  test("tool_result content as TextBlock array unwraps to ToolResultTextContent[]", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_2", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_2", [
        { type: "text", text: "first" },
        { type: "text", text: "second" }
      ]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "first" },
      { type: ToolResultContentType.Text, text: "second" }
    ]);
  });
  test("Phase 8 \u2014 cached file edit is appended to ChatToolCallComplete.result.content", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_edit", "Write")), SESSION, TURN_ID, state, log, resolver);
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/a", content: { uri: "session-db://abc/before" } },
      after: { uri: "file:///tmp/a", content: { uri: "session-db://abc/after" } },
      diff: { added: 3, removed: 1 }
    };
    state.cacheFileEdit("tu_edit", fileEdit);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_edit", "wrote file"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "wrote file" },
      fileEdit
    ]);
  });
  test("Phase 8 \u2014 no cached edit leaves content text-only (no regression)", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "tu_read", "Read")), SESSION, TURN_ID, state, log, resolver);
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, "tu_read", "file contents"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const complete = signals[0];
    assert.ok(complete.kind === "action" && complete.action.type === ActionType.ChatToolCallComplete);
    assert.deepStrictEqual(complete.action.result.content, [
      { type: ToolResultContentType.Text, text: "file contents" }
    ]);
  });
  test("Phase 8 \u2014 takeFileEdit returns undefined on cache miss and consumes on hit", () => {
    const state = new ClaudeMapperState();
    assert.strictEqual(state.takeFileEdit("absent"), void 0);
    const fileEdit = {
      type: ToolResultContentType.FileEdit,
      before: { uri: "file:///tmp/x", content: { uri: "session-db://x/before" } },
      after: { uri: "file:///tmp/x", content: { uri: "session-db://x/after" } },
      diff: void 0
    };
    state.cacheFileEdit("tu_x", fileEdit);
    assert.strictEqual(state.takeFileEdit("tu_x"), fileEdit);
    assert.strictEqual(state.takeFileEdit("tu_x"), void 0);
  });
  test("canonical assistant envelope drops tool_use blocks silently (partial stream owns ChatToolCallStart)", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeAssistantMessage(SESSION_ID, [
        { type: "text", text: "final", citations: null },
        { type: "tool_use", id: "tu_a", name: "Bash", input: {} }
      ]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.deepStrictEqual(log.warns, []);
  });
  test("canonical assistant envelope without tool_use emits nothing and does not warn", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const signals = mapSDKMessageToAgentSignals(
      makeAssistantMessage(SESSION_ID, [{ type: "text", text: "final answer", citations: null }]),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(signals, []);
    assert.deepStrictEqual(log.warns, []);
  });
  test("result success emits ChatUsage (with model); ChatTurnComplete now lives on the pipeline, not the mapper", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.usage.input_tokens = 12;
    result.usage.output_tokens = 34;
    result.usage.cache_read_input_tokens = 5;
    result.modelUsage = {
      "claude-test": {
        inputTokens: 12,
        outputTokens: 34,
        cacheReadInputTokens: 5,
        cacheCreationInputTokens: 0,
        webSearchRequests: 0,
        costUSD: 0,
        contextWindow: 2e5,
        maxOutputTokens: 8192
      }
    };
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.deepStrictEqual(signals, [
      {
        kind: "action",
        resource: SESSION,
        action: {
          type: ActionType.ChatUsage,
          turnId: TURN_ID,
          usage: {
            inputTokens: 12,
            outputTokens: 34,
            cacheReadTokens: 5,
            model: "claude-test"
          }
        }
      }
    ]);
  });
  test("result success does not derive credits from total_cost_usd", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.total_cost_usd = 0.1234;
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.strictEqual(signals.length, 1);
    const usage = signals[0];
    assert.ok(usage.kind === "action" && usage.action.type === ActionType.ChatUsage);
    assert.strictEqual(usage.action.usage._meta, void 0);
  });
  test("result success without modelUsage omits the model field on ChatUsage", () => {
    const result = makeResultSuccess(SESSION_ID);
    result.modelUsage = {};
    const signals = mapSDKMessageToAgentSignals(result, SESSION, TURN_ID, new ClaudeMapperState(), new NullLogService(), r());
    assert.strictEqual(signals.length, 1);
    const usage = signals[0];
    assert.ok(usage.kind === "action" && usage.action.type === ActionType.ChatUsage);
    assert.strictEqual(usage.action.usage.model, void 0);
  });
  test("result drains pending tool_use entries that never received a tool_result and warns once per orphan", () => {
    const log = new CapturingLogService();
    const state = new ClaudeMapperState();
    const TOOL_USE_ID = "toolu_orphan_1";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, TOOL_USE_ID, "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    const resultSignals = mapSDKMessageToAgentSignals(
      makeResultSuccess(SESSION_ID),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.strictEqual(resultSignals.length, 1);
    assert.strictEqual(log.warns.length, 1);
    assert.ok(log.warns[0].includes(TOOL_USE_ID), `expected warn to mention orphan id, got: ${log.warns[0]}`);
    assert.ok(log.warns[0].includes("Read"), `expected warn to mention tool name, got: ${log.warns[0]}`);
    const lateSignals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, TOOL_USE_ID, "late content"),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(lateSignals, []);
    assert.strictEqual(log.warns.length, 2);
    assert.ok(log.warns[1].includes(`tool_result for unknown tool_use_id ${TOOL_USE_ID}`));
  });
  test("message_stop and unknown stream events emit nothing", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const stop = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeMessageStop()),
      SESSION,
      TURN_ID,
      state,
      log,
      r()
    );
    assert.deepStrictEqual(stop, []);
  });
  test("multi-block ordering: text @0 then thinking @1 keep distinct part ids and route deltas correctly", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    const text0 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver);
    const think1 = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(1)), SESSION, TURN_ID, state, log, resolver);
    const text0Start = text0[0];
    const think1Start = think1[0];
    assert.ok(text0Start.kind === "action" && text0Start.action.type === ActionType.ChatResponsePart);
    assert.ok(think1Start.kind === "action" && think1Start.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(text0Start.action.part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(think1Start.action.part.kind, ResponsePartKind.Reasoning);
    const textPartId = text0Start.action.part.id;
    const thinkPartId = think1Start.action.part.id;
    assert.notStrictEqual(textPartId, thinkPartId);
    const dText = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "A")), SESSION, TURN_ID, state, log, resolver);
    const dThink = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(1, "B")), SESSION, TURN_ID, state, log, resolver);
    assert.ok(dText[0].kind === "action" && dText[0].action.type === ActionType.ChatDelta);
    assert.strictEqual(dText[0].action.partId, textPartId);
    assert.ok(dThink[0].kind === "action" && dThink[0].action.type === ActionType.ChatReasoning);
    assert.strictEqual(dThink[0].action.partId, thinkPartId);
  });
  test("two SDK messages within one turn at the same content-block index produce distinct part ids", () => {
    const log = new NullLogService();
    const state = new ClaudeMapperState();
    const resolver = r();
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart("msg_a")), SESSION, TURN_ID, state, log, resolver);
    const thinkStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartThinking(0)), SESSION, TURN_ID, state, log, resolver);
    const thinkDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeThinkingDelta(0, "plan")), SESSION, TURN_ID, state, log, resolver);
    mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeMessageStart("msg_b")), SESSION, TURN_ID, state, log, resolver);
    const textStart = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeContentBlockStartText(0)), SESSION, TURN_ID, state, log, resolver);
    const textDelta = mapSDKMessageToAgentSignals(makeStreamEvent(SESSION_ID, makeTextDelta(0, "done")), SESSION, TURN_ID, state, log, resolver);
    const thinkStartSignal = thinkStart[0];
    const textStartSignal = textStart[0];
    assert.ok(thinkStartSignal.kind === "action" && thinkStartSignal.action.type === ActionType.ChatResponsePart);
    assert.ok(textStartSignal.kind === "action" && textStartSignal.action.type === ActionType.ChatResponsePart);
    assert.strictEqual(thinkStartSignal.action.part.kind, ResponsePartKind.Reasoning);
    assert.strictEqual(textStartSignal.action.part.kind, ResponsePartKind.Markdown);
    const thinkPartId = thinkStartSignal.action.part.id;
    const textPartId = textStartSignal.action.part.id;
    assert.notStrictEqual(thinkPartId, textPartId, "text@0 in second message must not collide with thinking@0 in first message");
    const thinkDeltaSignal = thinkDelta[0];
    const textDeltaSignal = textDelta[0];
    assert.ok(thinkDeltaSignal.kind === "action" && thinkDeltaSignal.action.type === ActionType.ChatReasoning);
    assert.strictEqual(thinkDeltaSignal.action.partId, thinkPartId);
    assert.ok(textDeltaSignal.kind === "action" && textDeltaSignal.action.type === ActionType.ChatDelta);
    assert.strictEqual(textDeltaSignal.action.partId, textPartId);
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgKiBhcyBzaW5vbiBmcm9tICdzaW5vbic7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRTaWduYWwgfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZVBhcnRLaW5kLCBUb29sUmVzdWx0Q29udGVudFR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IFNUUkVBTUlOR19UT09MX0RJU1BMQVlfSU5URVJWQUxfTVMgfSBmcm9tICcuLi8uLi9jb21tb24vc3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5LmpzJztcbmltcG9ydCB7IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVNYXBwZXJTdGF0ZSwgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlTWFwU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBDTEFVREVfVVNFUl9ERUNMSU5FRF9NRVNTQUdFIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlVG9vbERlbmlhbC5qcyc7XG5pbXBvcnQgeyBlbmNvZGVGb3J3YXJkZWRDaGF0RXJyb3IsIFBST1hZX0VSUk9SX1BSRUZJWCB9IGZyb20gJy4uLy4uL25vZGUvc2hhcmVkL3Byb3h5Q2hhdEVycm9yLmpzJztcbmltcG9ydCB7IFN1YmFnZW50UmVnaXN0cnkgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVTdWJhZ2VudFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7XG5cdG1ha2VBc3Npc3RhbnRNZXNzYWdlLFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0LFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUaGlua2luZyxcblx0bWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSxcblx0bWFrZUNvbnRlbnRCbG9ja1N0b3AsXG5cdG1ha2VJbnB1dEpzb25EZWx0YSxcblx0bWFrZU1lc3NhZ2VTdGFydCxcblx0bWFrZU1lc3NhZ2VTdG9wLFxuXHRtYWtlUmVzdWx0RXJyb3IsXG5cdG1ha2VSZXN1bHRTdWNjZXNzLFxuXHRtYWtlU3RyZWFtRXZlbnQsXG5cdG1ha2VUZXh0RGVsdGEsXG5cdG1ha2VUaGlua2luZ0RlbHRhLFxuXHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlLFxufSBmcm9tICcuL2NsYXVkZU1hcFNlc3Npb25FdmVudHNUZXN0VXRpbHMuanMnO1xuXG4vKipcbiAqIERpcmVjdCB1bml0IHRlc3RzIGZvciB7QGxpbmsgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzfS5cbiAqXG4gKiBUaGUgbWFwcGVyIHRha2VzIGEgcGVyLXNlc3Npb24ge0BsaW5rIENsYXVkZU1hcHBlclN0YXRlfSBhbmQgaXNcbiAqIGV4ZXJjaXNlZCBoZXJlIGFzIGEgc3RhbmQtYWxvbmUgZnVuY3Rpb24uIFRoZSBpbnRlZ3JhdGVkXG4gKiBgY2xhdWRlQWdlbnQudGVzdC50c2Agc3VpdGUgc3RpbGwgZHJpdmVzIHRoZSBtYXBwZXIgZW5kLXRvLWVuZFxuICogYWxvbmdzaWRlIHRoZSBTREsgZW52ZWxvcGUgcGx1bWJpbmcuXG4gKi9cbnN1aXRlKCdjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzIFx1MjAxNCBkaXJlY3QgbWFwcGVyIHRlc3RzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgU0VTU0lPTiA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvYWJjJyk7XG5cdGNvbnN0IFNFU1NJT05fU1RSID0gU0VTU0lPTi50b1N0cmluZygpO1xuXHRjb25zdCBTRVNTSU9OX0lEID0gJ3NpZC0xJztcblx0Y29uc3QgVFVSTl9JRCA9ICd0dXJuLTEnO1xuXHRsZXQgY2xvY2s6IHNpbm9uLlNpbm9uRmFrZVRpbWVycyB8IHVuZGVmaW5lZDtcblxuXHR0ZWFyZG93bigoKSA9PiB7XG5cdFx0Y2xvY2s/LnJlc3RvcmUoKTtcblx0XHRjbG9jayA9IHVuZGVmaW5lZDtcblx0fSk7XG5cblx0LyoqXG5cdCAqIENhcHR1cmVzIGB3YXJuYCBjYWxscyBzbyBkZWZlbnNlLWluLWRlcHRoIHRlc3RzIGNhbiBhc3NlcnQgdGhlXG5cdCAqIG1hcHBlciBsb2dnZWQgdGhlIGRyb3BwZWQgZGlhZ25vc3RpYy5cblx0ICovXG5cdGNsYXNzIENhcHR1cmluZ0xvZ1NlcnZpY2UgZXh0ZW5kcyBOdWxsTG9nU2VydmljZSB7XG5cdFx0cmVhZG9ubHkgd2FybnM6IHN0cmluZ1tdID0gW107XG5cdFx0b3ZlcnJpZGUgd2FybihtZXNzYWdlOiBzdHJpbmcsIC4uLmFyZ3M6IHVua25vd25bXSk6IHZvaWQge1xuXHRcdFx0dGhpcy53YXJucy5wdXNoKFttZXNzYWdlLCAuLi5hcmdzLm1hcChhID0+IFN0cmluZyhhKSldLmpvaW4oJyAnKSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIEZyZXNoIHJlYWwge0BsaW5rIFN1YmFnZW50UmVnaXN0cnl9IHNvIHRoZSBwZXItdGVzdCByZWdpc3RyeSBjYW5cblx0ICogcmVjb3JkIHN1YmFnZW50IHN0YXRlIHdyaXRlcyB0aGUgbWFwcGVyIG1ha2VzIChQaGFzZSAxMjogc3Bhd25pbmdcblx0ICogZW50cmllcywgaW5uZXItdG9vbFx1MjE5MnBhcmVudCBlZGdlcywgZXRjKS4gVGVzdHMgdGhhdCBkb24ndCB0b3VjaFxuXHQgKiBzdWJhZ2VudCBwYXRocyBzaW1wbHkgcGFzcyBgcigpYCB0aHJvdWdoIHRvIHNhdGlzZnkgdGhlIG1hcHBlclxuXHQgKiBzaWduYXR1cmUuXG5cdCAqL1xuXHRmdW5jdGlvbiByKCk6IFN1YmFnZW50UmVnaXN0cnkge1xuXHRcdHJldHVybiBkaXNwb3NhYmxlcy5hZGQobmV3IFN1YmFnZW50UmVnaXN0cnkoKSk7XG5cdH1cblxuXHR0ZXN0KCdtZXNzYWdlX3N0YXJ0IGVtaXRzIG5vIHNpZ25hbHMnLCAoKSA9PiB7XG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlTWVzc2FnZVN0YXJ0KCkpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnZXJyb3JfZHVyaW5nX2V4ZWN1dGlvbiByZXN1bHQgZW1pdHMgYSBDaGF0RXJyb3IgY2FycnlpbmcgZHVyYXRpb24gYW5kIF9tZXRhJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1hcmtlciA9IGVuY29kZUZvcndhcmRlZENoYXRFcnJvcih7IGZldGNoRXJyb3I6IHsgdHlwZTogJ3F1b3RhRXhjZWVkZWQnLCBjYXBpRXJyb3I6IHsgY29kZTogJ3F1b3RhX2V4Y2VlZGVkJywgbWVzc2FnZTogJ1lvdSBoYXZlIGV4Y2VlZGVkIHlvdXIgbW9udGhseSBxdW90YScgfSB9IH0pO1xuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlUmVzdWx0RXJyb3IoU0VTU0lPTl9JRCwgW2BDQVBJIHJlcXVlc3QgZmFpbGVkOiA0MDIgUGF5bWVudCBSZXF1aXJlZCBcXHUyMDE0IHF1b3RhICR7bWFya2VyfWBdKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0bmV3IENsYXVkZU1hcHBlclN0YXRlKCksXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHIoKSxcblx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdDEyMyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgZXJyb3JTaWduYWwgPSBzaWduYWxzLmZpbmQocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nICYmIHMuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRhc3NlcnQub2soZXJyb3JTaWduYWwgJiYgZXJyb3JTaWduYWwua2luZCA9PT0gJ2FjdGlvbicgJiYgZXJyb3JTaWduYWwuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdEVycm9yKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXJyb3JTaWduYWwuYWN0aW9uLmR1cmF0aW9uLCAxMjMpO1xuXHRcdGNvbnN0IGVycm9yID0gZXJyb3JTaWduYWwuYWN0aW9uLmVycm9yO1xuXHRcdGNvbnN0IG1ldGEgPSBlcnJvci5fbWV0YSBhcyB7IGNoYXRFcnJvcj86IHsgZmV0Y2hFcnJvcj86IHsgdHlwZT86IHN0cmluZyB9IH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YT8uY2hhdEVycm9yPy5mZXRjaEVycm9yPy50eXBlLCAncXVvdGFFeGNlZWRlZCcpO1xuXHRcdGFzc2VydC5vayghZXJyb3IubWVzc2FnZS5pbmNsdWRlcyhQUk9YWV9FUlJPUl9QUkVGSVgpLCAncHJveHkgbWFya2VyIHNob3VsZCBiZSBzdHJpcHBlZCBmcm9tIHRoZSBodW1hbi1yZWFkYWJsZSBtZXNzYWdlJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1Y2Nlc3NmdWwgcmVzdWx0IGlzX2Vycm9yIHdpdGggYSBwcm94eSBtYXJrZXIgZW1pdHMgYSBDaGF0RXJyb3IgY2FycnlpbmcgX21ldGEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWFya2VyID0gZW5jb2RlRm9yd2FyZGVkQ2hhdEVycm9yKHsgZmV0Y2hFcnJvcjogeyB0eXBlOiAncXVvdGFFeGNlZWRlZCcsIGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnIH0gfSB9KTtcblx0XHRjb25zdCByZXN1bHQgPSBtYWtlUmVzdWx0U3VjY2VzcyhTRVNTSU9OX0lEKTtcblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0eyAuLi5yZXN1bHQsIGlzX2Vycm9yOiB0cnVlLCByZXN1bHQ6IGBxdW90YSAke21hcmtlcn1gIH0sXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGVycm9yU2lnbmFsID0gc2lnbmFscy5maW5kKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyAmJiBzLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcik7XG5cdFx0YXNzZXJ0Lm9rKGVycm9yU2lnbmFsICYmIGVycm9yU2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIGVycm9yU2lnbmFsLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRFcnJvcik7XG5cdFx0Y29uc3QgbWV0YSA9IGVycm9yU2lnbmFsLmFjdGlvbi5lcnJvci5fbWV0YSBhcyB7IGNoYXRFcnJvcj86IHsgZmV0Y2hFcnJvcj86IHsgdHlwZT86IHN0cmluZyB9IH0gfSB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobWV0YT8uY2hhdEVycm9yPy5mZXRjaEVycm9yPy50eXBlLCAncXVvdGFFeGNlZWRlZCcpO1xuXHR9KTtcblxuXHR0ZXN0KCd0ZXh0IGNvbnRlbnQgYmxvY2s6IHN0YXJ0IGVtaXRzIENoYXRSZXNwb25zZVBhcnQsIGRlbHRhcyBlbWl0IENoYXREZWx0YScsICgpID0+IHtcblx0XHRjb25zdCBvdXQ6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXHRcdGNvbnN0IHB1c2ggPSAobXNnczogQWdlbnRTaWduYWxbXSkgPT4gb3V0LnB1c2goLi4ubXNncyk7XG5cblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZU1lc3NhZ2VTdGFydCgpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpKTtcblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKSk7XG5cdFx0cHVzaChtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUZXh0RGVsdGEoMCwgJ0hlbGxvLCAnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKSk7XG5cdFx0cHVzaChtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUZXh0RGVsdGEoMCwgJ3dvcmxkIScpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpKTtcblx0XHRwdXNoKG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcikpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG91dC5sZW5ndGgsIDMpO1xuXHRcdGNvbnN0IHN0YXJ0ID0gb3V0WzBdO1xuXHRcdGFzc2VydC5vayhzdGFydC5raW5kID09PSAnYWN0aW9uJyAmJiBzdGFydC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQucmVzb3VyY2UudG9TdHJpbmcoKSwgU0VTU0lPTl9TVFIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC5hY3Rpb24udHVybklkLCBUVVJOX0lEKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQuYWN0aW9uLnBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bik7XG5cdFx0Y29uc3QgcGFydElkID0gc3RhcnQuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0YXNzZXJ0Lm9rKHBhcnRJZC5sZW5ndGggPiAwKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwob3V0LnNsaWNlKDEpLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RGVsdGEsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHBhcnRJZCxcblx0XHRcdFx0XHRjb250ZW50OiAnSGVsbG8sICcsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHRwYXJ0SWQsXG5cdFx0XHRcdFx0Y29udGVudDogJ3dvcmxkIScsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCd0aGlua2luZyBjb250ZW50IGJsb2NrOiBzdGFydCBlbWl0cyBSZWFzb25pbmcgcGFydCwgZGVsdGFzIGVtaXQgQ2hhdFJlYXNvbmluZycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzdGFydFNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGhpbmtpbmcoMCkpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydFNpZ25hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBzdGFydCA9IHN0YXJ0U2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2soc3RhcnQua2luZCA9PT0gJ2FjdGlvbicgJiYgc3RhcnQuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LmFjdGlvbi5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nKTtcblx0XHRjb25zdCBwYXJ0SWQgPSBzdGFydC5hY3Rpb24ucGFydC5pZDtcblxuXHRcdGNvbnN0IGRlbHRhU2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlVGhpbmtpbmdEZWx0YSgwLCAncG9uZGVyaW5nJykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGVsdGFTaWduYWxzLCBbe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZWFzb25pbmcsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0cGFydElkLFxuXHRcdFx0XHRjb250ZW50OiAncG9uZGVyaW5nJyxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIFBoYXNlIDcgXHUwMEE3My4zIHRvb2xfdXNlIC8gdG9vbF9yZXN1bHQgXHUyMDE0IFRlc3RzIDgvOS8xMC8xMVxuXG5cdHRlc3QoJ1Rlc3QgOCBcdTIwMTQgY29udGVudF9ibG9ja19zdGFydCB0b29sX3VzZSBlbWl0cyBDaGF0VG9vbENhbGxTdGFydCB3aXRoIGRpc3BsYXlOYW1lJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBDYXB0dXJpbmdMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblxuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV8xJywgJ1JlYWQnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFt7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1XzEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ1JlYWQnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1JlYWQgZmlsZScsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAncmVhZCcgfSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLndhcm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgOGIgXHUyMDE0IGNvbnRlbnRfYmxvY2tfc3RhcnQgZm9yIGFuIG1jcF9fY2xpZW50X18qIHRvb2wgc2V0cyB0aGUgQ2xpZW50IGNvbnRyaWJ1dG9yJywgKCkgPT4ge1xuXHRcdC8vIFJlZ3Jlc3Npb246IHRoZSBtYXBwZXIgdXNlZCB0byBlbWl0IGFuIGludmFsaWQgYHRvb2xDbGllbnRJZGAgZmllbGRcblx0XHQvLyBvbiB0aGUgQ2hhdFRvb2xDYWxsU3RhcnQgYWN0aW9uLiBCZWNhdXNlIHRoZSBzcHJlYWQgYnlwYXNzZWRcblx0XHQvLyBUeXBlU2NyaXB0J3MgZXhjZXNzLXByb3BlcnR5IGNoZWNrIGFuZCB0aGUgcmVkdWNlciByZWFkc1xuXHRcdC8vIGBhY3Rpb24uY29udHJpYnV0b3JgLCB0aGUgY29udHJpYnV0b3IgY2FtZSB0aHJvdWdoIGFzIGB1bmRlZmluZWRgLFxuXHRcdC8vIHNvIHRoZSB3b3JrYmVuY2ggcm91dGVkIGNsaWVudCB0b29scyB0byB0aGUgc2VydmVyLXRvb2wgcGF0aCBhbmRcblx0XHQvLyBuZXZlciBleGVjdXRlZCB0aGVtIFx1MjAxNCB0aGUgaW4tcHJvY2VzcyBNQ1AgaGFuZGxlciBodW5nIGZvcmV2ZXIuXG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IENMSUVOVF9JRCA9ICdjbGllbnQtYWJjJztcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfYycsICdtY3BfX2NsaWVudF9fcHJvYmxlbXMnKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdFx0KCkgPT4gQ0xJRU5UX0lELFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFt7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X2MnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Byb2JsZW1zJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdwcm9ibGVtcycsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IENMSUVOVF9JRCB9LFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cud2FybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnVGVzdCAxMGIgXHUyMDE0IGEgdG9vbCBkZW5pZWQgYnkgdGhlIHVzZXIgbWFwcyB0byByZXN1bHQuZXJyb3IuY29kZSA9IGRlbmllZCcsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV9kJywgJ0Jhc2gnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDApKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3R1X2QnLCBDTEFVREVfVVNFUl9ERUNMSU5FRF9NRVNTQUdFLCB7IGlzRXJyb3I6IHRydWUgfSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBzaWduYWwgPSBzaWduYWxzWzBdO1xuXHRcdGlmIChzaWduYWwua2luZCAhPT0gJ2FjdGlvbicgfHwgc2lnbmFsLmFjdGlvbi50eXBlICE9PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKSB7XG5cdFx0XHR0aHJvdyBuZXcgRXJyb3IoYGV4cGVjdGVkIGEgQ2hhdFRvb2xDYWxsQ29tcGxldGUgYWN0aW9uLCBnb3QgJHtzaWduYWwua2luZH1gKTtcblx0XHR9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZ25hbC5hY3Rpb24ucmVzdWx0LnN1Y2Nlc3MsIGZhbHNlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbC5hY3Rpb24ucmVzdWx0LmVycm9yLCB7IG1lc3NhZ2U6IENMQVVERV9VU0VSX0RFQ0xJTkVEX01FU1NBR0UsIGNvZGU6ICdkZW5pZWQnIH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IDkgXHUyMDE0IGlucHV0X2pzb25fZGVsdGEgZW1pdHMgQ2hhdFRvb2xDYWxsRGVsdGEgc2NvcGVkIHRvIHRoZSBvcGVuIHRvb2xfdXNlIGJsb2NrJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHQvLyBPcGVuIHRoZSBibG9jayBmaXJzdCBzbyB0aGUgcGVyLW1lc3NhZ2UgbWFwIGtub3dzIGFib3V0IGluZGV4IDAuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV8xJywgJ1JlYWQnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUlucHV0SnNvbkRlbHRhKDAsICd7XCJmaWxlX3BhJykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV8xJyxcblx0XHRcdFx0Y29udGVudDogJ3tcImZpbGVfcGEnLFxuXHRcdFx0fSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZpbGUtZWRpdCBpbnB1dCBkZWx0YXMgZW1pdCBjb21wYWN0IHJpY2ggaW52b2NhdGlvbiBtZXNzYWdlcycsICgpID0+IHtcblx0XHRjbG9jayA9IHNpbm9uLnVzZUZha2VUaW1lcnMoeyB0b0Zha2U6IFsncGVyZm9ybWFuY2UnXSB9KTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfd3JpdGUnLCAnV3JpdGUnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IGZpcnN0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VJbnB1dEpzb25EZWx0YSgwLCAne1wiZmlsZV9wYXRoXCI6XCIvc3JjL25ldy50c1wiLFwiY29udGVudFwiOlwib25lXFxcXG50d28nKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblx0XHRjbG9jay50aWNrKFNUUkVBTUlOR19UT09MX0RJU1BMQVlfSU5URVJWQUxfTVMpO1xuXHRcdGNvbnN0IHNlY29uZCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlSW5wdXRKc29uRGVsdGEoMCwgJ1xcXFxudGhyZWVcXFxcbmZvdXJcXFxcbmZpdmVcIicpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyZXNvbHZlcixcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChbLi4uZmlyc3QsIC4uLnNlY29uZF0sIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndHVfd3JpdGUnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRpbmcgW25ldy50c10oZmlsZTovLy9zcmMvbmV3LnRzKSAoMiBsaW5lcyknIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV93cml0ZScsXG5cdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdDcmVhdGluZyBbbmV3LnRzXShmaWxlOi8vL3NyYy9uZXcudHMpICg1IGxpbmVzKScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRlbnRfYmxvY2tfc3RvcCBmbHVzaGVzIHRoZSBmaW5hbCByaWNoIGZpbGUtZWRpdCBtZXNzYWdlIGhlbGQgYmFjayBieSB0aGUgdGhyb3R0bGUnLCAoKSA9PiB7XG5cdFx0Y2xvY2sgPSBzaW5vbi51c2VGYWtlVGltZXJzKHsgdG9GYWtlOiBbJ3BlcmZvcm1hbmNlJ10gfSk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCByZXNvbHZlciA9IHIoKTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X3dyaXRlJywgJ1dyaXRlJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBmaXJzdCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlSW5wdXRKc29uRGVsdGEoMCwgJ3tcImZpbGVfcGF0aFwiOlwiL3NyYy9uZXcudHNcIixcImNvbnRlbnRcIjpcIm9uZScpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyZXNvbHZlcixcblx0XHQpO1xuXHRcdGNvbnN0IHdpdGhpbkludGVydmFsID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VJbnB1dEpzb25EZWx0YSgwLCAnXFxcXG50d29cIn0nKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblx0XHRjb25zdCBzdG9wcGVkID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdG9wKDApKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyZXNvbHZlcixcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRmaXJzdDogZmlyc3QubWFwKHNpZ25hbCA9PiBzaWduYWwua2luZCA9PT0gJ2FjdGlvbicgPyBzaWduYWwuYWN0aW9uIDogdW5kZWZpbmVkKSxcblx0XHRcdHdpdGhpbkludGVydmFsLFxuXHRcdFx0c3RvcHBlZDogc3RvcHBlZC5tYXAoc2lnbmFsID0+IHNpZ25hbC5raW5kID09PSAnYWN0aW9uJyA/IHNpZ25hbC5hY3Rpb24gOiB1bmRlZmluZWQpLFxuXHRcdH0sIHtcblx0XHRcdGZpcnN0OiBbe1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV93cml0ZScsXG5cdFx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ0NyZWF0aW5nIFtuZXcudHNdKGZpbGU6Ly8vc3JjL25ldy50cykgKDEgbGluZSknIH0sXG5cdFx0XHR9XSxcblx0XHRcdHdpdGhpbkludGVydmFsOiBbXSxcblx0XHRcdHN0b3BwZWQ6IFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X3dyaXRlJyxcblx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnQ3JlYXRpbmcgW25ldy50c10oZmlsZTovLy9zcmMvbmV3LnRzKSAoMiBsaW5lcyknIH0sXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X3dyaXRlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdFZGl0IFtuZXcudHNdKGZpbGU6Ly8vc3JjL25ldy50cyknIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcXG4gIFwiZmlsZV9wYXRoXCI6IFwiL3NyYy9uZXcudHNcIixcXG4gIFwiY29udGVudFwiOiBcIm9uZVxcXFxudHdvXCJcXG59Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnY2xpZW50IHRvb2xzIHdpdGggQ2xhdWRlIGJ1aWx0LWluIG5hbWVzIHByZXNlcnZlIGNsaWVudCBzZW1hbnRpY3MgdGhyb3VnaG91dCB0aGUgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cdFx0Y29uc3Qgc3RhcnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfY2xpZW50X3dyaXRlJywgJ21jcF9fY2xpZW50X19Xcml0ZScpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHJlc29sdmVyLFxuXHRcdFx0KCkgPT4gJ2NsaWVudC0xJyxcblx0XHQpO1xuXG5cdFx0Y29uc3QgZGVsdGEgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUlucHV0SnNvbkRlbHRhKDAsICd7XCJ2YWx1ZVwiOlwiY2xpZW50IGlucHV0XCJ9JykpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdG5ldyBOdWxsTG9nU2VydmljZSgpLFxuXHRcdFx0cmVzb2x2ZXIsXG5cdFx0KTtcblx0XHRjb25zdCByZWFkeSA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RvcCgwKSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bmV3IE51bGxMb2dTZXJ2aWNlKCksXG5cdFx0XHRyZXNvbHZlcixcblx0XHQpO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCAndHVfY2xpZW50X3dyaXRlJywgJ2RvbmUnKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHQndHVybi0yLWlycmVsZXZhbnQnLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRuZXcgTnVsbExvZ1NlcnZpY2UoKSxcblx0XHRcdHJlc29sdmVyLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFsuLi5zdGFydCwgLi4uZGVsdGEsIC4uLnJlYWR5LCAuLi5jb21wbGV0ZV0sIFtcblx0XHRcdHtcblx0XHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndHVfY2xpZW50X3dyaXRlJyxcblx0XHRcdFx0XHR0b29sTmFtZTogJ1dyaXRlJyxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1dyaXRlJyxcblx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsRGVsdGEsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV9jbGllbnRfd3JpdGUnLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICd7XCJ2YWx1ZVwiOlwiY2xpZW50IGlucHV0XCJ9Jyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQ6IFRVUk5fSUQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X2NsaWVudF93cml0ZScsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdXcml0ZScsXG5cdFx0XHRcdFx0dG9vbElucHV0OiAne1xcbiAgXCJ2YWx1ZVwiOiBcImNsaWVudCBpbnB1dFwiXFxufScsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0dV9jbGllbnRfd3JpdGUnLFxuXHRcdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdXcml0ZScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2RvbmUnIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IDkuNSBcdTIwMTQgY29udGVudF9ibG9ja19zdG9wIGVtaXRzIENoYXRUb29sQ2FsbFJlYWR5IHNvIGF1dG8tYWxsb3dlZCB0b29scyBsZWF2ZSBTdHJlYW1pbmcnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0Ly8gRHJpdmUgYSBCYXNoIHRvb2xfdXNlIHRocm91Z2ggc3RhcnQgXHUyMTkyIGlucHV0IGRlbHRhcyBcdTIxOTIgc3RvcC4gVGhlXG5cdFx0Ly8gZml4OiBgY29udGVudF9ibG9ja19zdG9wYCBtdXN0IGVtaXQgYENoYXRUb29sQ2FsbFJlYWR5YCB3aXRoXG5cdFx0Ly8gYGNvbmZpcm1lZDogTm90TmVlZGVkYCwgdGhlIHBhcnNlZCBpbnB1dCBhcyBgdG9vbElucHV0YCwgdGhlXG5cdFx0Ly8gcmljaCBgaW52b2NhdGlvbk1lc3NhZ2VgLCBhbmQgYF9tZXRhLnRvb2xLaW5kYCBcdTIwMTQgb3RoZXJ3aXNlIGFuXG5cdFx0Ly8gYXV0by1hbGxvd2VkIHRvb2wgKFNESyBza2lwcyBgY2FuVXNlVG9vbGApIHN0YXlzIGluIFN0cmVhbWluZ1xuXHRcdC8vIGFuZCB0aGUgcmVkdWNlciBkcm9wcyB0aGUgc3Vic2VxdWVudCBDb21wbGV0ZS5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X2InLCAnQmFzaCcpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUlucHV0SnNvbkRlbHRhKDAsICd7XCJjb21tYW5kXCI6XCJnaXQgc3RhdHVzXCJ9JykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0b3AoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFt7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBTRVNTSU9OLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogVFVSTl9JRCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3R1X2InLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ1J1bm5pbmcgYGdpdCBzdGF0dXNgJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdnaXQgc3RhdHVzJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHR9LFxuXHRcdH1dKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy53YXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdUZXN0IDEwIFx1MjAxNCBzeW50aGV0aWMgdXNlciB0b29sX3Jlc3VsdCBlbWl0cyBDaGF0VG9vbENhbGxDb21wbGV0ZSB3aXRoIHRoZSBvcmlnaW5hdGluZyB0dXJuSWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0Ly8gRHJpdmUgdGhlIHRvb2xfdXNlIHRocm91Z2ggc3RhdGUsIHNpbXVsYXRpbmcgdGhlIG11bHRpLW1lc3NhZ2Vcblx0XHQvLyBmbG93OiB0aGUgdG9vbF91c2UgbGFuZHMgb24gVFVSTl9JRCwgY29udGVudF9ibG9ja19zdG9wIGRyYWluc1xuXHRcdC8vIHRoZSBwZXItbWVzc2FnZSBtYXAsIHRoZW4gYSBzeW50aGV0aWMgdXNlciBtZXNzYWdlIGluIHRoZSBuZXh0XG5cdFx0Ly8gKHNlcGFyYXRlKSB0dXJuIGNhcnJpZXMgdGhlIHRvb2xfcmVzdWx0LiBDcm9zcy1tZXNzYWdlIGxvb2t1cFxuXHRcdC8vIG11c3QgcmVjb3ZlciB0aGUgb3JpZ2luYWwgdHVybklkLlxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndHVfMScsICdSZWFkJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RvcCgwKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0dV8xJywgJ2ZpbGUgY29udGVudHMnKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHQndHVybi0yLWlycmVsZXZhbnQnLFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc2lnbmFscywgW3tcblx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0cmVzb3VyY2U6IFNFU1NJT04sXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndHVfMScsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JlYWQgZmlsZScsXG5cdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlIGNvbnRlbnRzJyB9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fV0pO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwobG9nLndhcm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ1Rlc3QgMTEgXHUyMDE0IHRvb2xfcmVzdWx0IGZvciB1bmtub3duIHRvb2xfdXNlX2lkIGVtaXRzIG5vIHNpZ25hbCBhbmQgd2FybnMnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCAndW5rbm93bi1pZCcsICdvcnBoYW4gY29udGVudCcpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZy53YXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMF0uaW5jbHVkZXMoJ3Rvb2xfcmVzdWx0IGZvciB1bmtub3duIHRvb2xfdXNlX2lkIHVua25vd24taWQnKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rvb2xfcmVzdWx0IHdpdGggaXNfZXJyb3I6IHRydWUgcmVwb3J0cyBzdWNjZXNzPWZhbHNlJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X2VycicsICdCYXNoJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0TWVzc2FnZShTRVNTSU9OX0lELCAndHVfZXJyJywgJ3Blcm1pc3Npb24gZGVuaWVkJywgeyBpc0Vycm9yOiB0cnVlIH0pLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZ25hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBjb21wbGV0ZSA9IHNpZ25hbHNbMF07XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlLmtpbmQgPT09ICdhY3Rpb24nICYmIGNvbXBsZXRlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUuYWN0aW9uLnJlc3VsdC5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0Ly8gQSBnZW51aW5lIGZhaWx1cmUgd2hvc2UgbWVzc2FnZSBpcyBub3Qgb25lIG9mIHRoZSBrbm93biBkZW55IHN0cmluZ3Ncblx0XHQvLyBtdXN0IE5PVCBiZSBjbGFzc2lmaWVkIGFzIGEgY2FuY2VsbGF0aW9uOiBubyBgZXJyb3IuY29kZWAgaXMgc2V0LCBzb1xuXHRcdC8vIHRlbGVtZXRyeSByZXBvcnRzIGBlcnJvcmAgcmF0aGVyIHRoYW4gYHVzZXJDYW5jZWxsZWRgLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS5hY3Rpb24ucmVzdWx0LmVycm9yPy5jb2RlLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0b29sX3Jlc3VsdCBjb250ZW50IGFzIFRleHRCbG9jayBhcnJheSB1bndyYXBzIHRvIFRvb2xSZXN1bHRUZXh0Q29udGVudFtdJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1XzInLCAnUmVhZCcpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3R1XzInLCBbXG5cdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZmlyc3QnIH0sXG5cdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnc2Vjb25kJyB9LFxuXHRcdFx0XSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRjb25zdCBjb21wbGV0ZSA9IHNpZ25hbHNbMF07XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlLmtpbmQgPT09ICdhY3Rpb24nICYmIGNvbXBsZXRlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbXBsZXRlLmFjdGlvbi5yZXN1bHQuY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZpcnN0JyB9LFxuXHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ3NlY29uZCcgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdC8vICNyZWdpb24gUGhhc2UgOCBcdTIwMTQgZmlsZS1lZGl0IGNhY2hlXG5cblx0dGVzdCgnUGhhc2UgOCBcdTIwMTQgY2FjaGVkIGZpbGUgZWRpdCBpcyBhcHBlbmRlZCB0byBDaGF0VG9vbENhbGxDb21wbGV0ZS5yZXN1bHQuY29udGVudCcsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IHJlc29sdmVyID0gcigpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsICd0dV9lZGl0JywgJ1dyaXRlJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCBmaWxlRWRpdCA9IHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCBhcyBjb25zdCxcblx0XHRcdGJlZm9yZTogeyB1cmk6ICdmaWxlOi8vL3RtcC9hJywgY29udGVudDogeyB1cmk6ICdzZXNzaW9uLWRiOi8vYWJjL2JlZm9yZScgfSB9LFxuXHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy90bXAvYScsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovL2FiYy9hZnRlcicgfSB9LFxuXHRcdFx0ZGlmZjogeyBhZGRlZDogMywgcmVtb3ZlZDogMSB9LFxuXHRcdH07XG5cdFx0c3RhdGUuY2FjaGVGaWxlRWRpdCgndHVfZWRpdCcsIGZpbGVFZGl0KTtcblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0dV9lZGl0JywgJ3dyb3RlIGZpbGUnKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGNvbXBsZXRlID0gc2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2soY29tcGxldGUua2luZCA9PT0gJ2FjdGlvbicgJiYgY29tcGxldGUuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoY29tcGxldGUuYWN0aW9uLnJlc3VsdC5jb250ZW50LCBbXG5cdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnd3JvdGUgZmlsZScgfSxcblx0XHRcdGZpbGVFZGl0LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4IFx1MjAxNCBubyBjYWNoZWQgZWRpdCBsZWF2ZXMgY29udGVudCB0ZXh0LW9ubHkgKG5vIHJlZ3Jlc3Npb24pJywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMCwgJ3R1X3JlYWQnLCAnUmVhZCcpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgJ3R1X3JlYWQnLCAnZmlsZSBjb250ZW50cycpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgY29tcGxldGUgPSBzaWduYWxzWzBdO1xuXHRcdGFzc2VydC5vayhjb21wbGV0ZS5raW5kID09PSAnYWN0aW9uJyAmJiBjb21wbGV0ZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChjb21wbGV0ZS5hY3Rpb24ucmVzdWx0LmNvbnRlbnQsIFtcblx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmaWxlIGNvbnRlbnRzJyB9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdQaGFzZSA4IFx1MjAxNCB0YWtlRmlsZUVkaXQgcmV0dXJucyB1bmRlZmluZWQgb24gY2FjaGUgbWlzcyBhbmQgY29uc3VtZXMgb24gaGl0JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudGFrZUZpbGVFZGl0KCdhYnNlbnQnKSwgdW5kZWZpbmVkKTtcblxuXHRcdGNvbnN0IGZpbGVFZGl0ID0ge1xuXHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0IGFzIGNvbnN0LFxuXHRcdFx0YmVmb3JlOiB7IHVyaTogJ2ZpbGU6Ly8vdG1wL3gnLCBjb250ZW50OiB7IHVyaTogJ3Nlc3Npb24tZGI6Ly94L2JlZm9yZScgfSB9LFxuXHRcdFx0YWZ0ZXI6IHsgdXJpOiAnZmlsZTovLy90bXAveCcsIGNvbnRlbnQ6IHsgdXJpOiAnc2Vzc2lvbi1kYjovL3gvYWZ0ZXInIH0gfSxcblx0XHRcdGRpZmY6IHVuZGVmaW5lZCxcblx0XHR9O1xuXHRcdHN0YXRlLmNhY2hlRmlsZUVkaXQoJ3R1X3gnLCBmaWxlRWRpdCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnRha2VGaWxlRWRpdCgndHVfeCcpLCBmaWxlRWRpdCk7XG5cdFx0Ly8gU2Vjb25kIHRha2UgaXMgYSBtaXNzIFx1MjAxNCB0aGUgZW50cnkgd2FzIGNvbnN1bWVkLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50YWtlRmlsZUVkaXQoJ3R1X3gnKSwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0Ly8gI2VuZHJlZ2lvblxuXG5cdHRlc3QoJ2Nhbm9uaWNhbCBhc3Npc3RhbnQgZW52ZWxvcGUgZHJvcHMgdG9vbF91c2UgYmxvY2tzIHNpbGVudGx5IChwYXJ0aWFsIHN0cmVhbSBvd25zIENoYXRUb29sQ2FsbFN0YXJ0KScsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgQ2FwdHVyaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlQXNzaXN0YW50TWVzc2FnZShTRVNTSU9OX0lELCBbXG5cdFx0XHRcdHsgdHlwZTogJ3RleHQnLCB0ZXh0OiAnZmluYWwnLCBjaXRhdGlvbnM6IG51bGwgfSxcblx0XHRcdFx0eyB0eXBlOiAndG9vbF91c2UnLCBpZDogJ3R1X2EnLCBuYW1lOiAnQmFzaCcsIGlucHV0OiB7fSB9LFxuXHRcdFx0XSksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHNpZ25hbHMsIFtdKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxvZy53YXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdjYW5vbmljYWwgYXNzaXN0YW50IGVudmVsb3BlIHdpdGhvdXQgdG9vbF91c2UgZW1pdHMgbm90aGluZyBhbmQgZG9lcyBub3Qgd2FybicsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgQ2FwdHVyaW5nTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cblxuXHRcdGNvbnN0IHNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlQXNzaXN0YW50TWVzc2FnZShTRVNTSU9OX0lELCBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdmaW5hbCBhbnN3ZXInLCBjaXRhdGlvbnM6IG51bGwgfV0pLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbXSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsb2cud2FybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdWx0IHN1Y2Nlc3MgZW1pdHMgQ2hhdFVzYWdlICh3aXRoIG1vZGVsKTsgQ2hhdFR1cm5Db21wbGV0ZSBub3cgbGl2ZXMgb24gdGhlIHBpcGVsaW5lLCBub3QgdGhlIG1hcHBlcicsICgpID0+IHtcblx0XHRjb25zdCByZXN1bHQgPSBtYWtlUmVzdWx0U3VjY2VzcyhTRVNTSU9OX0lEKTtcblx0XHRyZXN1bHQudXNhZ2UuaW5wdXRfdG9rZW5zID0gMTI7XG5cdFx0cmVzdWx0LnVzYWdlLm91dHB1dF90b2tlbnMgPSAzNDtcblx0XHRyZXN1bHQudXNhZ2UuY2FjaGVfcmVhZF9pbnB1dF90b2tlbnMgPSA1O1xuXHRcdHJlc3VsdC5tb2RlbFVzYWdlID0ge1xuXHRcdFx0J2NsYXVkZS10ZXN0Jzoge1xuXHRcdFx0XHRpbnB1dFRva2VuczogMTIsXG5cdFx0XHRcdG91dHB1dFRva2VuczogMzQsXG5cdFx0XHRcdGNhY2hlUmVhZElucHV0VG9rZW5zOiA1LFxuXHRcdFx0XHRjYWNoZUNyZWF0aW9uSW5wdXRUb2tlbnM6IDAsXG5cdFx0XHRcdHdlYlNlYXJjaFJlcXVlc3RzOiAwLFxuXHRcdFx0XHRjb3N0VVNEOiAwLFxuXHRcdFx0XHRjb250ZXh0V2luZG93OiAyMDBfMDAwLFxuXHRcdFx0XHRtYXhPdXRwdXRUb2tlbnM6IDgxOTIsXG5cdFx0XHR9LFxuXHRcdH07XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKHJlc3VsdCwgU0VTU0lPTiwgVFVSTl9JRCwgbmV3IENsYXVkZU1hcHBlclN0YXRlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpLCByKCkpO1xuXG5cdFx0Ly8gUGlwZWxpbmUgKFBoYXNlIDkgcmVmYWN0b3IpIG93bnMgdGhlIHByb3RvY29sLVR1cm4gYm91bmRhcnk7IGl0XG5cdFx0Ly8gZmlyZXMgQ2hhdFR1cm5Db21wbGV0ZSB2aWEgYG9uVHVybkNvbXBsZXRlYCBvbmx5IG9uIHRoZSBGSU5BTFxuXHRcdC8vIHJlc3VsdCBvZiBhIHR1cm4gKGludGVybWVkaWF0ZSByZXN1bHRzIGR1cmluZyBzdGVlcmluZyBwcmVlbXB0IGRvXG5cdFx0Ly8gTk9UIGNsb3NlIHRoZSBwcm90b2NvbCBUdXJuKS4gVGhlIG1hcHBlciB0aGVyZWZvcmUgZW1pdHMgb25seVxuXHRcdC8vIENoYXRVc2FnZSBmb3IgYHJlc3VsdGAgbWVzc2FnZXMuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzaWduYWxzLCBbXG5cdFx0XHR7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogU0VTU0lPTixcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VXNhZ2UsXG5cdFx0XHRcdFx0dHVybklkOiBUVVJOX0lELFxuXHRcdFx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdFx0XHRpbnB1dFRva2VuczogMTIsXG5cdFx0XHRcdFx0XHRvdXRwdXRUb2tlbnM6IDM0LFxuXHRcdFx0XHRcdFx0Y2FjaGVSZWFkVG9rZW5zOiA1LFxuXHRcdFx0XHRcdFx0bW9kZWw6ICdjbGF1ZGUtdGVzdCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VsdCBzdWNjZXNzIGRvZXMgbm90IGRlcml2ZSBjcmVkaXRzIGZyb20gdG90YWxfY29zdF91c2QnLCAoKSA9PiB7XG5cdFx0Ly8gUGVyLXR1cm4gY3JlZGl0cyBjb21lIGZyb20gQ0FQSSBgY29waWxvdF91c2FnZWAgdmlhIHRoZSBwcm94eSwgbm90XG5cdFx0Ly8gZnJvbSB0aGUgU0RLJ3MgQW50aHJvcGljLWxpc3QtcHJpY2UgYHRvdGFsX2Nvc3RfdXNkYC4gVGhlIG1hcHBlclxuXHRcdC8vIG11c3QgbmV2ZXIgYXR0YWNoIGEgYF9tZXRhLmNvc3RgIChpdCB3b3VsZCBtaXNsYWJlbCBVU0QgYXMgY3JlZGl0cykuXG5cdFx0Y29uc3QgcmVzdWx0ID0gbWFrZVJlc3VsdFN1Y2Nlc3MoU0VTU0lPTl9JRCk7XG5cdFx0cmVzdWx0LnRvdGFsX2Nvc3RfdXNkID0gMC4xMjM0O1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhyZXN1bHQsIFNFU1NJT04sIFRVUk5fSUQsIG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpLCBuZXcgTnVsbExvZ1NlcnZpY2UoKSwgcigpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzaWduYWxzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgdXNhZ2UgPSBzaWduYWxzWzBdO1xuXHRcdGFzc2VydC5vayh1c2FnZS5raW5kID09PSAnYWN0aW9uJyAmJiB1c2FnZS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VXNhZ2UpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2FnZS5hY3Rpb24udXNhZ2UuX21ldGEsIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3VsdCBzdWNjZXNzIHdpdGhvdXQgbW9kZWxVc2FnZSBvbWl0cyB0aGUgbW9kZWwgZmllbGQgb24gQ2hhdFVzYWdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlc3VsdCA9IG1ha2VSZXN1bHRTdWNjZXNzKFNFU1NJT05fSUQpO1xuXHRcdHJlc3VsdC5tb2RlbFVzYWdlID0ge307XG5cblx0XHRjb25zdCBzaWduYWxzID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKHJlc3VsdCwgU0VTU0lPTiwgVFVSTl9JRCwgbmV3IENsYXVkZU1hcHBlclN0YXRlKCksIG5ldyBOdWxsTG9nU2VydmljZSgpLCByKCkpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNpZ25hbHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB1c2FnZSA9IHNpZ25hbHNbMF07XG5cdFx0YXNzZXJ0Lm9rKHVzYWdlLmtpbmQgPT09ICdhY3Rpb24nICYmIHVzYWdlLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRVc2FnZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzYWdlLmFjdGlvbi51c2FnZS5tb2RlbCwgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdWx0IGRyYWlucyBwZW5kaW5nIHRvb2xfdXNlIGVudHJpZXMgdGhhdCBuZXZlciByZWNlaXZlZCBhIHRvb2xfcmVzdWx0IGFuZCB3YXJucyBvbmNlIHBlciBvcnBoYW4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgbG9nID0gbmV3IENhcHR1cmluZ0xvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cdFx0Y29uc3QgVE9PTF9VU0VfSUQgPSAndG9vbHVfb3JwaGFuXzEnO1xuXG5cdFx0Ly8gT3BlbiBhIHRvb2xfdXNlIGJsb2NrIHRoYXQgd2lsbCBuZXZlciBiZSBwYWlyZWQgd2l0aCBhIHRvb2xfcmVzdWx0LlxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFRPT0xfVVNFX0lELCAnUmVhZCcpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblxuXHRcdC8vIFR1cm4gZW5kcyB3aXRoIG5vIHRvb2xfcmVzdWx0IGZvciB0aGUgdG9vbF91c2UuXG5cdFx0Y29uc3QgcmVzdWx0U2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VSZXN1bHRTdWNjZXNzKFNFU1NJT05fSUQpLFxuXHRcdFx0U0VTU0lPTixcblx0XHRcdFRVUk5fSUQsXG5cdFx0XHRzdGF0ZSxcblx0XHRcdGxvZyxcblx0XHRcdHIoKSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFNpZ25hbHMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwobG9nLndhcm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0Lm9rKGxvZy53YXJuc1swXS5pbmNsdWRlcyhUT09MX1VTRV9JRCksIGBleHBlY3RlZCB3YXJuIHRvIG1lbnRpb24gb3JwaGFuIGlkLCBnb3Q6ICR7bG9nLndhcm5zWzBdfWApO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMF0uaW5jbHVkZXMoJ1JlYWQnKSwgYGV4cGVjdGVkIHdhcm4gdG8gbWVudGlvbiB0b29sIG5hbWUsIGdvdDogJHtsb2cud2FybnNbMF19YCk7XG5cblx0XHQvLyBBIGxhdGUtYXJyaXZpbmcgdG9vbF9yZXN1bHQgZm9yIHRoZSBvcnBoYW4gbXVzdCBub3cgYmUgdHJlYXRlZFxuXHRcdC8vIGFzIHVua25vd24gXHUyMDE0IHByb3ZpbmcgdGhlIGNyb3NzLW1lc3NhZ2Ugc3RhdGUgd2FzIGFjdHVhbGx5IGNsZWFyZWQuXG5cdFx0Y29uc3QgbGF0ZVNpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsIFRPT0xfVVNFX0lELCAnbGF0ZSBjb250ZW50JyksXG5cdFx0XHRTRVNTSU9OLFxuXHRcdFx0VFVSTl9JRCxcblx0XHRcdHN0YXRlLFxuXHRcdFx0bG9nLFxuXHRcdFx0cigpLFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGxhdGVTaWduYWxzLCBbXSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxvZy53YXJucy5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5vayhsb2cud2FybnNbMV0uaW5jbHVkZXMoYHRvb2xfcmVzdWx0IGZvciB1bmtub3duIHRvb2xfdXNlX2lkICR7VE9PTF9VU0VfSUR9YCkpO1xuXHR9KTtcblxuXG5cdHRlc3QoJ21lc3NhZ2Vfc3RvcCBhbmQgdW5rbm93biBzdHJlYW0gZXZlbnRzIGVtaXQgbm90aGluZycsICgpID0+IHtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXG5cblx0XHRjb25zdCBzdG9wID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0bWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VNZXNzYWdlU3RvcCgpKSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0c3RhdGUsXG5cdFx0XHRsb2csXG5cdFx0XHRyKCksXG5cdFx0KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHN0b3AsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgnbXVsdGktYmxvY2sgb3JkZXJpbmc6IHRleHQgQDAgdGhlbiB0aGlua2luZyBAMSBrZWVwIGRpc3RpbmN0IHBhcnQgaWRzIGFuZCByb3V0ZSBkZWx0YXMgY29ycmVjdGx5JywgKCkgPT4ge1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHRjb25zdCB0ZXh0MCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblx0XHRjb25zdCB0aGluazEgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRoaW5raW5nKDEpKSwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVzb2x2ZXIpO1xuXG5cdFx0Y29uc3QgdGV4dDBTdGFydCA9IHRleHQwWzBdO1xuXHRcdGNvbnN0IHRoaW5rMVN0YXJ0ID0gdGhpbmsxWzBdO1xuXHRcdGFzc2VydC5vayh0ZXh0MFN0YXJ0LmtpbmQgPT09ICdhY3Rpb24nICYmIHRleHQwU3RhcnQuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCk7XG5cdFx0YXNzZXJ0Lm9rKHRoaW5rMVN0YXJ0LmtpbmQgPT09ICdhY3Rpb24nICYmIHRoaW5rMVN0YXJ0LmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXh0MFN0YXJ0LmFjdGlvbi5wYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0aGluazFTdGFydC5hY3Rpb24ucGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZyk7XG5cdFx0Y29uc3QgdGV4dFBhcnRJZCA9IHRleHQwU3RhcnQuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0Y29uc3QgdGhpbmtQYXJ0SWQgPSB0aGluazFTdGFydC5hY3Rpb24ucGFydC5pZDtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGV4dFBhcnRJZCwgdGhpbmtQYXJ0SWQpO1xuXG5cdFx0Y29uc3QgZFRleHQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUZXh0RGVsdGEoMCwgJ0EnKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblx0XHRjb25zdCBkVGhpbmsgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VUaGlua2luZ0RlbHRhKDEsICdCJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRhc3NlcnQub2soZFRleHRbMF0ua2luZCA9PT0gJ2FjdGlvbicgJiYgZFRleHRbMF0uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdERlbHRhKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZFRleHRbMF0uYWN0aW9uLnBhcnRJZCwgdGV4dFBhcnRJZCk7XG5cdFx0YXNzZXJ0Lm9rKGRUaGlua1swXS5raW5kID09PSAnYWN0aW9uJyAmJiBkVGhpbmtbMF0uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRUaGlua1swXS5hY3Rpb24ucGFydElkLCB0aGlua1BhcnRJZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R3byBTREsgbWVzc2FnZXMgd2l0aGluIG9uZSB0dXJuIGF0IHRoZSBzYW1lIGNvbnRlbnQtYmxvY2sgaW5kZXggcHJvZHVjZSBkaXN0aW5jdCBwYXJ0IGlkcycsICgpID0+IHtcblx0XHQvLyBSZWdyZXNzaW9uOiBwcmUtdG9vbCBtZXNzYWdlIGhhZCB0aGlua2luZ0AwOyBwb3N0LXRvb2wtcmVzdWx0XG5cdFx0Ly8gbWVzc2FnZSBoYXMgdGV4dEAwLiBTYW1lIHR1cm5JZCwgc2FtZSBjb250ZW50LWJsb2NrIGluZGV4LlxuXHRcdC8vIFRoZSBBbnRocm9waWMgU0RLIHJlc2V0cyBgZXZlbnQuaW5kZXhgIG9uIGVhY2ggbWVzc2FnZV9zdGFydCxcblx0XHQvLyBzbyB0aGUgcGFydCBpZCBtdXN0IGluY2x1ZGUgdGhlIFNESyBtZXNzYWdlIGlkIHRvIGF2b2lkXG5cdFx0Ly8gY29sbGlzaW9uIHdpdGggdGhlIGVhcmxpZXIgUmVhc29uaW5nIHBhcnQgKHdoaWNoIHdvdWxkIGNhdXNlXG5cdFx0Ly8gdGhlIHJlZHVjZXIgdG8gZHJvcCB0aGUgbmV3IE1hcmtkb3duIHBhcnQgYXMgYSBkdXBsaWNhdGUpLlxuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgcmVzb2x2ZXIgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VNZXNzYWdlU3RhcnQoJ21zZ19hJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgdGhpbmtTdGFydCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGhpbmtpbmcoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgdGhpbmtEZWx0YSA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZVRoaW5raW5nRGVsdGEoMCwgJ3BsYW4nKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZU1lc3NhZ2VTdGFydCgnbXNnX2InKSksIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlc29sdmVyKTtcblx0XHRjb25zdCB0ZXh0U3RhcnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMobWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRleHQoMCkpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cdFx0Y29uc3QgdGV4dERlbHRhID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlVGV4dERlbHRhKDAsICdkb25lJykpLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZXNvbHZlcik7XG5cblx0XHRjb25zdCB0aGlua1N0YXJ0U2lnbmFsID0gdGhpbmtTdGFydFswXTtcblx0XHRjb25zdCB0ZXh0U3RhcnRTaWduYWwgPSB0ZXh0U3RhcnRbMF07XG5cdFx0YXNzZXJ0Lm9rKHRoaW5rU3RhcnRTaWduYWwua2luZCA9PT0gJ2FjdGlvbicgJiYgdGhpbmtTdGFydFNpZ25hbC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQub2sodGV4dFN0YXJ0U2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIHRleHRTdGFydFNpZ25hbC5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0UmVzcG9uc2VQYXJ0KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpbmtTdGFydFNpZ25hbC5hY3Rpb24ucGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHRTdGFydFNpZ25hbC5hY3Rpb24ucGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRjb25zdCB0aGlua1BhcnRJZCA9IHRoaW5rU3RhcnRTaWduYWwuYWN0aW9uLnBhcnQuaWQ7XG5cdFx0Y29uc3QgdGV4dFBhcnRJZCA9IHRleHRTdGFydFNpZ25hbC5hY3Rpb24ucGFydC5pZDtcblx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwodGhpbmtQYXJ0SWQsIHRleHRQYXJ0SWQsICd0ZXh0QDAgaW4gc2Vjb25kIG1lc3NhZ2UgbXVzdCBub3QgY29sbGlkZSB3aXRoIHRoaW5raW5nQDAgaW4gZmlyc3QgbWVzc2FnZScpO1xuXG5cdFx0Y29uc3QgdGhpbmtEZWx0YVNpZ25hbCA9IHRoaW5rRGVsdGFbMF07XG5cdFx0Y29uc3QgdGV4dERlbHRhU2lnbmFsID0gdGV4dERlbHRhWzBdO1xuXHRcdGFzc2VydC5vayh0aGlua0RlbHRhU2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nICYmIHRoaW5rRGVsdGFTaWduYWwuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5rRGVsdGFTaWduYWwuYWN0aW9uLnBhcnRJZCwgdGhpbmtQYXJ0SWQpO1xuXHRcdGFzc2VydC5vayh0ZXh0RGVsdGFTaWduYWwua2luZCA9PT0gJ2FjdGlvbicgJiYgdGV4dERlbHRhU2lnbmFsLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXREZWx0YSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRleHREZWx0YVNpZ25hbC5hY3Rpb24ucGFydElkLCB0ZXh0UGFydElkKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixZQUFZLFdBQVc7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0JBQXNCO0FBRS9CLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCLDZCQUE2QjtBQUN4RCxTQUFTLDBDQUEwQztBQUNuRCxTQUFTLDRCQUE0QiwrQkFBK0I7QUFDcEUsU0FBUyxtQkFBbUIsbUNBQW1DO0FBQy9ELFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsMEJBQTBCLDBCQUEwQjtBQUM3RCxTQUFTLHdCQUF3QjtBQUNqQztBQUFBLEVBQ0M7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FDTTtBQVVQLE1BQU0scURBQWdELE1BQU07QUFFM0QsUUFBTSxjQUFjLHdDQUF3QztBQUU1RCxRQUFNLFVBQVUsSUFBSSxNQUFNLDBCQUEwQjtBQUNwRCxRQUFNLGNBQWMsUUFBUSxTQUFTO0FBQ3JDLFFBQU0sYUFBYTtBQUNuQixRQUFNLFVBQVU7QUFDaEIsTUFBSTtBQUVKLFdBQVMsTUFBTTtBQUNkLFdBQU8sUUFBUTtBQUNmLFlBQVE7QUFBQSxFQUNULENBQUM7QUFBQSxFQU1ELE1BQU0sNEJBQTRCLGVBQWU7QUFBQSxJQUFqRDtBQUFBO0FBQ0MsV0FBUyxRQUFrQixDQUFDO0FB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
