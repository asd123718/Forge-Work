import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { NullLogService } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/sessionState.js";
import { ClaudeMapperState, mapSDKMessageToAgentSignals } from "../../node/claude/claudeMapSessionEvents.js";
import { SubagentRegistry } from "../../node/claude/claudeSubagentRegistry.js";
import { buildTopLevelSubagentReadyAction, mapSubagentSystemMessage } from "../../node/claude/claudeSubagentSignals.js";
import {
  makeAssistantMessage,
  makeContentBlockStartText,
  makeContentBlockStartToolUse,
  makeStreamEvent,
  makeUserToolResultMessage
} from "./claudeMapSessionEventsTestUtils.js";
suite("claudeSubagentSignals \u2014 Phase 12 emission", () => {
  const disposables = ensureNoDisposablesAreLeakedInTestSuite();
  const SESSION = URI.parse("agent-session://test/abc");
  const SESSION_ID = "sid-1";
  const TURN_ID = "turn-1";
  function r() {
    return disposables.add(new SubagentRegistry());
  }
  test("top-level Task tool_use records a spawn; non-subagent tools do not", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_agent", "Agent")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(2, "toolu_read", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      task: registry.getSpawn("toolu_task")?.toolUseId,
      agent: registry.getSpawn("toolu_agent")?.toolUseId,
      read: registry.getSpawn("toolu_read")
    }, {
      task: "toolu_task",
      agent: "toolu_agent",
      read: void 0
    });
  });
  test("top-level Task ChatToolCallStart carries _meta.toolKind=subagent so the workbench renders the subagent UI", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const taskSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const readSignals = mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_read", "Read")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const taskAction = taskSignals[0];
    const readAction = readSignals[0];
    assert.ok(taskAction.kind === "action" && taskAction.action.type === ActionType.ChatToolCallStart, "Task signal is ChatToolCallStart");
    assert.ok(readAction.kind === "action" && readAction.action.type === ActionType.ChatToolCallStart, "Read signal is ChatToolCallStart");
    assert.deepStrictEqual({
      taskMeta: taskAction.action._meta,
      readMeta: readAction.action._meta
    }, {
      taskMeta: { toolKind: "subagent" },
      readMeta: { toolKind: "read" }
    });
  });
  test("top-level canonical assistant for Task emits ChatToolCallReady with confirmed:NotNeeded + _meta.subagentDescription/AgentName AND records metadata onto the spawn", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, "toolu_top_task", "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const canonical = makeAssistantMessage(SESSION_ID, [{
      type: "tool_use",
      id: "toolu_top_task",
      name: "Task",
      input: { description: "Count TS files", subagent_type: "Explore", prompt: "Count how many TS files..." }
    }]);
    const out = mapSDKMessageToAgentSignals(canonical, SESSION, TURN_ID, state, log, registry);
    const ready = out.find((s) => s.kind === "action" && s.action.type === ActionType.ChatToolCallReady);
    assert.ok(ready && ready.kind === "action" && ready.action.type === ActionType.ChatToolCallReady, "Ready emitted");
    const spawn = registry.getSpawn("toolu_top_task");
    assert.deepStrictEqual({
      toolCallId: ready.action.toolCallId,
      invocationMessage: ready.action.invocationMessage,
      confirmed: ready.action.confirmed,
      meta: ready.action._meta,
      parentToolCallId: ready.parentToolCallId,
      spawnSubagentType: spawn?.subagentType,
      spawnDescription: spawn?.description
    }, {
      toolCallId: "toolu_top_task",
      invocationMessage: "Count TS files",
      confirmed: ToolCallConfirmationReason.NotNeeded,
      meta: {
        toolKind: "subagent",
        subagentDescription: "Count TS files",
        subagentAgentName: "Explore"
      },
      parentToolCallId: void 0,
      spawnSubagentType: "Explore",
      spawnDescription: "Count TS files"
    });
  });
  test("inner subagent message: prepends subagent_started exactly once, tags emitted action with parentToolCallId, records inner-tool\u2192parent edge", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_parent";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
    innerText.parent_tool_use_id = PARENT;
    const first = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);
    const innerToolUse = makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(1, "toolu_inner", "Read"));
    innerToolUse.parent_tool_use_id = PARENT;
    const second = mapSDKMessageToAgentSignals(innerToolUse, SESSION, TURN_ID, state, log, registry);
    assert.deepStrictEqual({
      firstKinds: first.map((s) => s.kind),
      firstStartedToolCallId: first[0]?.kind === "subagent_started" ? first[0].toolCallId : null,
      firstActionParent: first.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null),
      secondKinds: second.map((s) => s.kind),
      secondActionParent: second.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null),
      innerToolParentSpawnId: registry.getParentSpawn("toolu_inner")?.toolUseId
    }, {
      firstKinds: ["subagent_started", "action"],
      firstStartedToolCallId: PARENT,
      firstActionParent: [PARENT],
      secondKinds: ["action"],
      secondActionParent: [PARENT],
      innerToolParentSpawnId: PARENT
    });
  });
  test("inner emission with unknown parent_tool_use_id (no spawn recorded) does NOT prepend subagent_started \u2014 tagging still applies", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const innerText = makeStreamEvent(SESSION_ID, makeContentBlockStartText(0));
    innerText.parent_tool_use_id = "toolu_unknown";
    const out = mapSDKMessageToAgentSignals(innerText, SESSION, TURN_ID, state, log, registry);
    assert.deepStrictEqual({
      kinds: out.map((s) => s.kind),
      actionParents: out.filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null)
    }, {
      kinds: ["action"],
      actionParents: ["toolu_unknown"]
    });
  });
  test("inner subagent canonical assistant message emits text/thinking/tool_use signals + tags them with parentToolCallId, lets the matching tool_result complete", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_parent_inner";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerAssistant = makeAssistantMessage(SESSION_ID, [
      { type: "text", text: "looking up files", citations: null },
      { type: "tool_use", id: "toolu_inner_glob", name: "Glob", input: { pattern: "**/*.ts" } }
    ]);
    innerAssistant.parent_tool_use_id = PARENT;
    const fromAssistant = mapSDKMessageToAgentSignals(innerAssistant, SESSION, TURN_ID, state, log, registry);
    const innerToolResult = makeUserToolResultMessage(SESSION_ID, "toolu_inner_glob", "a.ts\nb.ts");
    innerToolResult.parent_tool_use_id = PARENT;
    const fromToolResult = mapSDKMessageToAgentSignals(innerToolResult, SESSION, TURN_ID, state, log, registry);
    const kinds = fromAssistant.map((s) => s.kind);
    const allParentIds = [...fromAssistant, ...fromToolResult].filter((s) => s.kind === "action").map((s) => s.kind === "action" ? s.parentToolCallId : null);
    const completeAction = fromToolResult.find((s) => s.kind === "action" && s.action.type === ActionType.ChatToolCallComplete);
    const completePastTense = completeAction?.kind === "action" && completeAction.action.type === ActionType.ChatToolCallComplete ? completeAction.action.result.pastTenseMessage : void 0;
    assert.deepStrictEqual({
      fromAssistantKinds: kinds,
      toolUseEdge: registry.getParentSpawn("toolu_inner_glob")?.toolUseId,
      fromToolResultHasComplete: completeAction !== void 0,
      everyActionTaggedWithParent: allParentIds.every((p) => p === PARENT),
      // D6 parity: inner-tool past-tense must use the rich helper
      // (seeded by `seedParsedInput` at start time), not fall back to
      // the generic "{displayName} finished" — replay always renders
      // rich text, so a generic live message would silently diverge.
      completePastTense
    }, {
      fromAssistantKinds: ["subagent_started", "action", "action", "action"],
      toolUseEdge: PARENT,
      fromToolResultHasComplete: true,
      everyActionTaggedWithParent: true,
      completePastTense: { markdown: "Find files matching `**/*.ts`" }
    });
  });
  test("inner client tools preserve client ownership and generic input across the lifecycle", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const parentToolCallId = "toolu_parent_client";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, parentToolCallId, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const innerAssistant = makeAssistantMessage(SESSION_ID, [
      { type: "tool_use", id: "toolu_inner_client", name: "mcp__client__Bash", input: { command: "echo client" } }
    ]);
    innerAssistant.parent_tool_use_id = parentToolCallId;
    const fromAssistant = mapSDKMessageToAgentSignals(innerAssistant, SESSION, TURN_ID, state, log, registry, () => "client-1");
    const innerToolResult = makeUserToolResultMessage(SESSION_ID, "toolu_inner_client", "done");
    innerToolResult.parent_tool_use_id = parentToolCallId;
    const fromResult = mapSDKMessageToAgentSignals(innerToolResult, SESSION, TURN_ID, state, log, registry);
    const actions = [...fromAssistant, ...fromResult].filter((signal) => signal.kind === "action").map((signal) => signal.kind === "action" ? signal.action : void 0);
    assert.deepStrictEqual(actions.map((action) => {
      switch (action?.type) {
        case ActionType.ChatToolCallStart:
          return {
            type: action.type,
            toolName: action.toolName,
            displayName: action.displayName,
            contributor: action.contributor,
            meta: action._meta
          };
        case ActionType.ChatToolCallReady:
          return {
            type: action.type,
            invocationMessage: action.invocationMessage,
            toolInput: action.toolInput
          };
        case ActionType.ChatToolCallComplete:
          return {
            type: action.type,
            pastTenseMessage: action.result.pastTenseMessage
          };
        default:
          return void 0;
      }
    }).filter((item) => item !== void 0), [
      {
        type: ActionType.ChatToolCallStart,
        toolName: "Bash",
        displayName: "Bash",
        contributor: { kind: ToolCallContributorKind.Client, clientId: "client-1" },
        meta: void 0
      },
      {
        type: ActionType.ChatToolCallReady,
        invocationMessage: "Bash",
        toolInput: '{\n  "command": "echo client"\n}'
      },
      {
        type: ActionType.ChatToolCallComplete,
        pastTenseMessage: "Bash"
      }
    ]);
  });
  test("foreground subagent completion: tool_result for a Task spawn emits ChatToolCallComplete AND IAgentSubagentCompletedSignal, then clears the spawn from the registry", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_fg_task";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const signals = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, PARENT, "done"),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      kinds: signals.map((s) => s.kind),
      completedToolCallId: signals.find((s) => s.kind === "subagent_completed")?.toolCallId,
      spawnCleared: registry.getSpawn(PARENT)
    }, {
      kinds: ["action", "subagent_completed"],
      completedToolCallId: PARENT,
      spawnCleared: void 0
    });
  });
  test("background subagent completion: task_started then tool_result yields NO completion; later task_notification fires it", () => {
    const state = new ClaudeMapperState();
    const log = new NullLogService();
    const registry = r();
    const PARENT = "toolu_bg_task";
    mapSDKMessageToAgentSignals(
      makeStreamEvent(SESSION_ID, makeContentBlockStartToolUse(0, PARENT, "Task")),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_started", task_id: "t1", tool_use_id: PARENT, description: "bg" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const afterToolResult = mapSDKMessageToAgentSignals(
      makeUserToolResultMessage(SESSION_ID, PARENT, "tool returned"),
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const isBackgroundAfterToolResult = registry.getSpawn(PARENT)?.background;
    const afterNotification = mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_notification", task_id: "t1", tool_use_id: PARENT, status: "completed", output_file: "o", summary: "s" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    const afterNotificationAgain = mapSDKMessageToAgentSignals(
      { type: "system", subtype: "task_notification", task_id: "t1", tool_use_id: PARENT, status: "completed", output_file: "o", summary: "s" },
      SESSION,
      TURN_ID,
      state,
      log,
      registry
    );
    assert.deepStrictEqual({
      afterToolResultKinds: afterToolResult.map((s) => s.kind),
      isBackgroundAfterToolResult,
      afterNotificationKinds: afterNotification.map((s) => s.kind),
      completedToolCallId: afterNotification.find((s) => s.kind === "subagent_completed")?.toolCallId,
      afterNotificationAgainKinds: afterNotificationAgain.map((s) => s.kind),
      spawnClearedAfterNotification: registry.getSpawn(PARENT)
    }, {
      afterToolResultKinds: ["action"],
      isBackgroundAfterToolResult: true,
      afterNotificationKinds: ["subagent_completed"],
      completedToolCallId: PARENT,
      afterNotificationAgainKinds: [],
      spawnClearedAfterNotification: void 0
    });
  });
  test("buildTopLevelSubagentReadyAction omits _meta description/agentName when input fields are missing or wrong-typed; still records the spawn", () => {
    const registry = r();
    const malformed = buildTopLevelSubagentReadyAction(
      { type: "tool_use", id: "toolu_bad", name: "Task", input: { description: 42, subagent_type: null } },
      SESSION,
      TURN_ID,
      registry
    );
    assert.ok(malformed.kind === "action" && malformed.action.type === ActionType.ChatToolCallReady);
    const spawn = registry.getSpawn("toolu_bad");
    assert.deepStrictEqual({
      meta: malformed.action._meta,
      invocationMessage: malformed.action.invocationMessage,
      spawnRecorded: spawn?.toolUseId,
      spawnSubagentType: spawn?.subagentType,
      spawnDescription: spawn?.description
    }, {
      meta: { toolKind: "subagent" },
      invocationMessage: "Run subagent task",
      spawnRecorded: "toolu_bad",
      spawnSubagentType: void 0,
      spawnDescription: void 0
    });
  });
  test("mapSubagentSystemMessage ignores task_notification with non-terminal status, missing tool_use_id, or unknown spawn", () => {
    const registry = r();
    registry.recordSpawn("toolu_known");
    const inProgress = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", tool_use_id: "toolu_known", status: "in_progress" }, SESSION, registry);
    const missingId = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", status: "completed" }, SESSION, registry);
    const unknownEntry = mapSubagentSystemMessage({ type: "system", subtype: "task_notification", task_id: "t", tool_use_id: "toolu_unknown", status: "completed" }, SESSION, registry);
    assert.deepStrictEqual({
      inProgressKinds: inProgress.map((s) => s.kind),
      missingIdKinds: missingId.map((s) => s.kind),
      unknownEntryKinds: unknownEntry.map((s) => s.kind)
    }, {
      inProgressKinds: [],
      missingIdKinds: [],
      unknownEntryKinds: []
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVTdWJhZ2VudFNpZ25hbHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB0eXBlIHsgU0RLTWVzc2FnZSB9IGZyb20gJ0BhbnRocm9waWMtYWkvY2xhdWRlLWFnZW50LXNkayc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBOdWxsTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVNYXBwZXJTdGF0ZSwgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlTWFwU2Vzc2lvbkV2ZW50cy5qcyc7XG5pbXBvcnQgeyBTdWJhZ2VudFJlZ2lzdHJ5IH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBidWlsZFRvcExldmVsU3ViYWdlbnRSZWFkeUFjdGlvbiwgbWFwU3ViYWdlbnRTeXN0ZW1NZXNzYWdlIH0gZnJvbSAnLi4vLi4vbm9kZS9jbGF1ZGUvY2xhdWRlU3ViYWdlbnRTaWduYWxzLmpzJztcbmltcG9ydCB7XG5cdG1ha2VBc3Npc3RhbnRNZXNzYWdlLFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0LFxuXHRtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlLFxuXHRtYWtlU3RyZWFtRXZlbnQsXG5cdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UsXG59IGZyb20gJy4vY2xhdWRlTWFwU2Vzc2lvbkV2ZW50c1Rlc3RVdGlscy5qcyc7XG5cbi8qKlxuICogRGlyZWN0IHRlc3RzIGZvciBQaGFzZSAxMiBzdWJhZ2VudCBzaWduYWwgZW1pc3Npb24uXG4gKlxuICogRHJpdmVzIGBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHNgIGVuZC10by1lbmQgZm9yIHRoZSBpbnRlZ3JhdGVkXG4gKiBwYXRocywgYW5kIHRoZSB0d28gbmV3bHktZXhwb3J0ZWQgYGNsYXVkZVN1YmFnZW50U2lnbmFsc2AgZnVuY3Rpb25zXG4gKiBkaXJlY3RseSBmb3IgdGhlaXIgY29udHJhY3QtbGV2ZWwgYXNzZXJ0aW9ucy4gVXNlcyBhIGZyZXNoIHJlYWxcbiAqIHtAbGluayBTdWJhZ2VudFJlZ2lzdHJ5fSBwZXIgdGVzdCBzbyBzdWJhZ2VudCBzdGF0ZSBpcyB2aXNpYmxlXG4gKiBhY3Jvc3MgbWFwcGVyIGludm9jYXRpb25zIGFuZCBhc3NlcnRhYmxlIGRpcmVjdGx5IG9uIHRoZSBzcGF3biByZWNvcmQuXG4gKi9cbnN1aXRlKCdjbGF1ZGVTdWJhZ2VudFNpZ25hbHMgXHUyMDE0IFBoYXNlIDEyIGVtaXNzaW9uJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlKCk7XG5cblx0Y29uc3QgU0VTU0lPTiA9IFVSSS5wYXJzZSgnYWdlbnQtc2Vzc2lvbjovL3Rlc3QvYWJjJyk7XG5cdGNvbnN0IFNFU1NJT05fSUQgPSAnc2lkLTEnO1xuXHRjb25zdCBUVVJOX0lEID0gJ3R1cm4tMSc7XG5cblx0ZnVuY3Rpb24gcigpOiBTdWJhZ2VudFJlZ2lzdHJ5IHtcblx0XHRyZXR1cm4gZGlzcG9zYWJsZXMuYWRkKG5ldyBTdWJhZ2VudFJlZ2lzdHJ5KCkpO1xuXHR9XG5cblx0dGVzdCgndG9wLWxldmVsIFRhc2sgdG9vbF91c2UgcmVjb3JkcyBhIHNwYXduOyBub24tc3ViYWdlbnQgdG9vbHMgZG8gbm90JywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndG9vbHVfdGFzaycsICdUYXNrJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgxLCAndG9vbHVfYWdlbnQnLCAnQWdlbnQnKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDIsICd0b29sdV9yZWFkJywgJ1JlYWQnKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0YXNrOiByZWdpc3RyeS5nZXRTcGF3bigndG9vbHVfdGFzaycpPy50b29sVXNlSWQsXG5cdFx0XHRhZ2VudDogcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X2FnZW50Jyk/LnRvb2xVc2VJZCxcblx0XHRcdHJlYWQ6IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9yZWFkJyksXG5cdFx0fSwge1xuXHRcdFx0dGFzazogJ3Rvb2x1X3Rhc2snLFxuXHRcdFx0YWdlbnQ6ICd0b29sdV9hZ2VudCcsXG5cdFx0XHRyZWFkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcC1sZXZlbCBUYXNrIENoYXRUb29sQ2FsbFN0YXJ0IGNhcnJpZXMgX21ldGEudG9vbEtpbmQ9c3ViYWdlbnQgc28gdGhlIHdvcmtiZW5jaCByZW5kZXJzIHRoZSBzdWJhZ2VudCBVSScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXG5cdFx0Y29uc3QgdGFza1NpZ25hbHMgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndG9vbHVfdGFzaycsICdUYXNrJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblx0XHRjb25zdCByZWFkU2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDEsICd0b29sdV9yZWFkJywgJ1JlYWQnKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgdGFza0FjdGlvbiA9IHRhc2tTaWduYWxzWzBdO1xuXHRcdGNvbnN0IHJlYWRBY3Rpb24gPSByZWFkU2lnbmFsc1swXTtcblx0XHRhc3NlcnQub2sodGFza0FjdGlvbi5raW5kID09PSAnYWN0aW9uJyAmJiB0YXNrQWN0aW9uLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCAnVGFzayBzaWduYWwgaXMgQ2hhdFRvb2xDYWxsU3RhcnQnKTtcblx0XHRhc3NlcnQub2socmVhZEFjdGlvbi5raW5kID09PSAnYWN0aW9uJyAmJiByZWFkQWN0aW9uLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LCAnUmVhZCBzaWduYWwgaXMgQ2hhdFRvb2xDYWxsU3RhcnQnKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dGFza01ldGE6IHRhc2tBY3Rpb24uYWN0aW9uLl9tZXRhLFxuXHRcdFx0cmVhZE1ldGE6IHJlYWRBY3Rpb24uYWN0aW9uLl9tZXRhLFxuXHRcdH0sIHtcblx0XHRcdHRhc2tNZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRyZWFkTWV0YTogeyB0b29sS2luZDogJ3JlYWQnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RvcC1sZXZlbCBjYW5vbmljYWwgYXNzaXN0YW50IGZvciBUYXNrIGVtaXRzIENoYXRUb29sQ2FsbFJlYWR5IHdpdGggY29uZmlybWVkOk5vdE5lZWRlZCArIF9tZXRhLnN1YmFnZW50RGVzY3JpcHRpb24vQWdlbnROYW1lIEFORCByZWNvcmRzIG1ldGFkYXRhIG9udG8gdGhlIHNwYXduJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCAndG9vbHVfdG9wX3Rhc2snLCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRjb25zdCBjYW5vbmljYWwgPSBtYWtlQXNzaXN0YW50TWVzc2FnZShTRVNTSU9OX0lELCBbe1xuXHRcdFx0dHlwZTogJ3Rvb2xfdXNlJyxcblx0XHRcdGlkOiAndG9vbHVfdG9wX3Rhc2snLFxuXHRcdFx0bmFtZTogJ1Rhc2snLFxuXHRcdFx0aW5wdXQ6IHsgZGVzY3JpcHRpb246ICdDb3VudCBUUyBmaWxlcycsIHN1YmFnZW50X3R5cGU6ICdFeHBsb3JlJywgcHJvbXB0OiAnQ291bnQgaG93IG1hbnkgVFMgZmlsZXMuLi4nIH0sXG5cdFx0fV0pO1xuXHRcdGNvbnN0IG91dCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhjYW5vbmljYWwsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5KTtcblxuXHRcdGNvbnN0IHJlYWR5ID0gb3V0LmZpbmQocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nICYmIHMuYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHkpO1xuXHRcdGFzc2VydC5vayhyZWFkeSAmJiByZWFkeS5raW5kID09PSAnYWN0aW9uJyAmJiByZWFkeS5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSwgJ1JlYWR5IGVtaXR0ZWQnKTtcblxuXHRcdGNvbnN0IHNwYXduID0gcmVnaXN0cnkuZ2V0U3Bhd24oJ3Rvb2x1X3RvcF90YXNrJyk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0b29sQ2FsbElkOiByZWFkeS5hY3Rpb24udG9vbENhbGxJZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiByZWFkeS5hY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRjb25maXJtZWQ6IHJlYWR5LmFjdGlvbi5jb25maXJtZWQsXG5cdFx0XHRtZXRhOiByZWFkeS5hY3Rpb24uX21ldGEsXG5cdFx0XHRwYXJlbnRUb29sQ2FsbElkOiByZWFkeS5wYXJlbnRUb29sQ2FsbElkLFxuXHRcdFx0c3Bhd25TdWJhZ2VudFR5cGU6IHNwYXduPy5zdWJhZ2VudFR5cGUsXG5cdFx0XHRzcGF3bkRlc2NyaXB0aW9uOiBzcGF3bj8uZGVzY3JpcHRpb24sXG5cdFx0fSwge1xuXHRcdFx0dG9vbENhbGxJZDogJ3Rvb2x1X3RvcF90YXNrJyxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQ291bnQgVFMgZmlsZXMnLFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRtZXRhOiB7XG5cdFx0XHRcdHRvb2xLaW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiAnQ291bnQgVFMgZmlsZXMnLFxuXHRcdFx0XHRzdWJhZ2VudEFnZW50TmFtZTogJ0V4cGxvcmUnLFxuXHRcdFx0fSxcblx0XHRcdHBhcmVudFRvb2xDYWxsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdHNwYXduU3ViYWdlbnRUeXBlOiAnRXhwbG9yZScsXG5cdFx0XHRzcGF3bkRlc2NyaXB0aW9uOiAnQ291bnQgVFMgZmlsZXMnLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpbm5lciBzdWJhZ2VudCBtZXNzYWdlOiBwcmVwZW5kcyBzdWJhZ2VudF9zdGFydGVkIGV4YWN0bHkgb25jZSwgdGFncyBlbWl0dGVkIGFjdGlvbiB3aXRoIHBhcmVudFRvb2xDYWxsSWQsIHJlY29yZHMgaW5uZXItdG9vbFx1MjE5MnBhcmVudCBlZGdlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cdFx0Y29uc3QgUEFSRU5UID0gJ3Rvb2x1X3BhcmVudCc7XG5cblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCBQQVJFTlQsICdUYXNrJykpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGlubmVyVGV4dCA9IG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUZXh0KDApKTtcblx0XHRpbm5lclRleHQucGFyZW50X3Rvb2xfdXNlX2lkID0gUEFSRU5UO1xuXHRcdGNvbnN0IGZpcnN0ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKGlubmVyVGV4dCwgU0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnkpO1xuXG5cdFx0Y29uc3QgaW5uZXJUb29sVXNlID0gbWFrZVN0cmVhbUV2ZW50KFNFU1NJT05fSUQsIG1ha2VDb250ZW50QmxvY2tTdGFydFRvb2xVc2UoMSwgJ3Rvb2x1X2lubmVyJywgJ1JlYWQnKSk7XG5cdFx0aW5uZXJUb29sVXNlLnBhcmVudF90b29sX3VzZV9pZCA9IFBBUkVOVDtcblx0XHRjb25zdCBzZWNvbmQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJUb29sVXNlLCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGZpcnN0S2luZHM6IGZpcnN0Lm1hcChzID0+IHMua2luZCksXG5cdFx0XHRmaXJzdFN0YXJ0ZWRUb29sQ2FsbElkOiBmaXJzdFswXT8ua2luZCA9PT0gJ3N1YmFnZW50X3N0YXJ0ZWQnID8gZmlyc3RbMF0udG9vbENhbGxJZCA6IG51bGwsXG5cdFx0XHRmaXJzdEFjdGlvblBhcmVudDogZmlyc3QuZmlsdGVyKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJykubWFwKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyA/IHMucGFyZW50VG9vbENhbGxJZCA6IG51bGwpLFxuXHRcdFx0c2Vjb25kS2luZHM6IHNlY29uZC5tYXAocyA9PiBzLmtpbmQpLFxuXHRcdFx0c2Vjb25kQWN0aW9uUGFyZW50OiBzZWNvbmQuZmlsdGVyKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJykubWFwKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyA/IHMucGFyZW50VG9vbENhbGxJZCA6IG51bGwpLFxuXHRcdFx0aW5uZXJUb29sUGFyZW50U3Bhd25JZDogcmVnaXN0cnkuZ2V0UGFyZW50U3Bhd24oJ3Rvb2x1X2lubmVyJyk/LnRvb2xVc2VJZCxcblx0XHR9LCB7XG5cdFx0XHRmaXJzdEtpbmRzOiBbJ3N1YmFnZW50X3N0YXJ0ZWQnLCAnYWN0aW9uJ10sXG5cdFx0XHRmaXJzdFN0YXJ0ZWRUb29sQ2FsbElkOiBQQVJFTlQsXG5cdFx0XHRmaXJzdEFjdGlvblBhcmVudDogW1BBUkVOVF0sXG5cdFx0XHRzZWNvbmRLaW5kczogWydhY3Rpb24nXSxcblx0XHRcdHNlY29uZEFjdGlvblBhcmVudDogW1BBUkVOVF0sXG5cdFx0XHRpbm5lclRvb2xQYXJlbnRTcGF3bklkOiBQQVJFTlQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubmVyIGVtaXNzaW9uIHdpdGggdW5rbm93biBwYXJlbnRfdG9vbF91c2VfaWQgKG5vIHNwYXduIHJlY29yZGVkKSBkb2VzIE5PVCBwcmVwZW5kIHN1YmFnZW50X3N0YXJ0ZWQgXHUyMDE0IHRhZ2dpbmcgc3RpbGwgYXBwbGllcycsICgpID0+IHtcblx0XHQvLyBOZXcgbW9kZWw6IFwibm8gc3Bhd24gbWVhbnMgbm8gYW5ub3VuY2VtZW50XCIuIElmIHRoZSByZWdpc3RyeVxuXHRcdC8vIGhhcyBuZXZlciBzZWVuIHRoZSBwYXJlbnQgKGFuZCB0aHVzIGhhcyBubyBtZXRhZGF0YSksIGVtaXR0aW5nXG5cdFx0Ly8gYSBzdWJhZ2VudF9zdGFydGVkIHdvdWxkIGJlIGx5aW5nIGFib3V0IGEgc2Vzc2lvbiB0aGF0IG5ldmVyXG5cdFx0Ly8gZXhpc3RlZC4gVGhlIGFjdGlvbiBpcyBzdGlsbCB0YWdnZWQgd2l0aCBwYXJlbnRUb29sQ2FsbElkIHNvXG5cdFx0Ly8gQWdlbnRTaWRlRWZmZWN0cyBjYW4gcm91dGUgaXQgKG9yIGJ1ZmZlciAvIGRyb3ApLlxuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cblx0XHRjb25zdCBpbm5lclRleHQgPSBtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VGV4dCgwKSk7XG5cdFx0aW5uZXJUZXh0LnBhcmVudF90b29sX3VzZV9pZCA9ICd0b29sdV91bmtub3duJztcblx0XHRjb25zdCBvdXQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJUZXh0LCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGtpbmRzOiBvdXQubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGFjdGlvblBhcmVudHM6IG91dC5maWx0ZXIocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAocyA9PiBzLmtpbmQgPT09ICdhY3Rpb24nID8gcy5wYXJlbnRUb29sQ2FsbElkIDogbnVsbCksXG5cdFx0fSwge1xuXHRcdFx0a2luZHM6IFsnYWN0aW9uJ10sXG5cdFx0XHRhY3Rpb25QYXJlbnRzOiBbJ3Rvb2x1X3Vua25vd24nXSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW5uZXIgc3ViYWdlbnQgY2Fub25pY2FsIGFzc2lzdGFudCBtZXNzYWdlIGVtaXRzIHRleHQvdGhpbmtpbmcvdG9vbF91c2Ugc2lnbmFscyArIHRhZ3MgdGhlbSB3aXRoIHBhcmVudFRvb2xDYWxsSWQsIGxldHMgdGhlIG1hdGNoaW5nIHRvb2xfcmVzdWx0IGNvbXBsZXRlJywgKCkgPT4ge1xuXHRcdC8vIEVtcGlyaWNhbGx5IHRoZSBTREsgZGVsaXZlcnMgaW5uZXIgY29udGVudCB2aWEgY2Fub25pY2FsIG1lc3NhZ2VzLFxuXHRcdC8vIG5vdCBwYXJ0aWFscyBcdTIwMTQgdGhpcyBleGVyY2lzZXMgdGhhdCBpbnRlZ3JhdGlvbiBwYXRoIGVuZC10by1lbmQuXG5cdFx0Y29uc3Qgc3RhdGUgPSBuZXcgQ2xhdWRlTWFwcGVyU3RhdGUoKTtcblx0XHRjb25zdCBsb2cgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRjb25zdCBQQVJFTlQgPSAndG9vbHVfcGFyZW50X2lubmVyJztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgaW5uZXJBc3Npc3RhbnQgPSBtYWtlQXNzaXN0YW50TWVzc2FnZShTRVNTSU9OX0lELCBbXG5cdFx0XHR7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2xvb2tpbmcgdXAgZmlsZXMnLCBjaXRhdGlvbnM6IG51bGwgfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV9pbm5lcl9nbG9iJywgbmFtZTogJ0dsb2InLCBpbnB1dDogeyBwYXR0ZXJuOiAnKiovKi50cycgfSB9LFxuXHRcdF0pO1xuXHRcdGlubmVyQXNzaXN0YW50LnBhcmVudF90b29sX3VzZV9pZCA9IFBBUkVOVDtcblx0XHRjb25zdCBmcm9tQXNzaXN0YW50ID0gbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKGlubmVyQXNzaXN0YW50LCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRjb25zdCBpbm5lclRvb2xSZXN1bHQgPSBtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0b29sdV9pbm5lcl9nbG9iJywgJ2EudHNcXG5iLnRzJyk7XG5cdFx0aW5uZXJUb29sUmVzdWx0LnBhcmVudF90b29sX3VzZV9pZCA9IFBBUkVOVDtcblx0XHRjb25zdCBmcm9tVG9vbFJlc3VsdCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhpbm5lclRvb2xSZXN1bHQsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5KTtcblxuXHRcdGNvbnN0IGtpbmRzID0gZnJvbUFzc2lzdGFudC5tYXAocyA9PiBzLmtpbmQpO1xuXHRcdGNvbnN0IGFsbFBhcmVudElkcyA9IFsuLi5mcm9tQXNzaXN0YW50LCAuLi5mcm9tVG9vbFJlc3VsdF0uZmlsdGVyKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJykubWFwKHMgPT4gcy5raW5kID09PSAnYWN0aW9uJyA/IHMucGFyZW50VG9vbENhbGxJZCA6IG51bGwpO1xuXHRcdGNvbnN0IGNvbXBsZXRlQWN0aW9uID0gZnJvbVRvb2xSZXN1bHQuZmluZChzID0+IHMua2luZCA9PT0gJ2FjdGlvbicgJiYgcy5hY3Rpb24udHlwZSA9PT0gQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSk7XG5cdFx0Y29uc3QgY29tcGxldGVQYXN0VGVuc2UgPSBjb21wbGV0ZUFjdGlvbj8ua2luZCA9PT0gJ2FjdGlvbicgJiYgY29tcGxldGVBY3Rpb24uYWN0aW9uLnR5cGUgPT09IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGVcblx0XHRcdD8gY29tcGxldGVBY3Rpb24uYWN0aW9uLnJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0ZnJvbUFzc2lzdGFudEtpbmRzOiBraW5kcyxcblx0XHRcdHRvb2xVc2VFZGdlOiByZWdpc3RyeS5nZXRQYXJlbnRTcGF3bigndG9vbHVfaW5uZXJfZ2xvYicpPy50b29sVXNlSWQsXG5cdFx0XHRmcm9tVG9vbFJlc3VsdEhhc0NvbXBsZXRlOiBjb21wbGV0ZUFjdGlvbiAhPT0gdW5kZWZpbmVkLFxuXHRcdFx0ZXZlcnlBY3Rpb25UYWdnZWRXaXRoUGFyZW50OiBhbGxQYXJlbnRJZHMuZXZlcnkocCA9PiBwID09PSBQQVJFTlQpLFxuXHRcdFx0Ly8gRDYgcGFyaXR5OiBpbm5lci10b29sIHBhc3QtdGVuc2UgbXVzdCB1c2UgdGhlIHJpY2ggaGVscGVyXG5cdFx0XHQvLyAoc2VlZGVkIGJ5IGBzZWVkUGFyc2VkSW5wdXRgIGF0IHN0YXJ0IHRpbWUpLCBub3QgZmFsbCBiYWNrIHRvXG5cdFx0XHQvLyB0aGUgZ2VuZXJpYyBcIntkaXNwbGF5TmFtZX0gZmluaXNoZWRcIiBcdTIwMTQgcmVwbGF5IGFsd2F5cyByZW5kZXJzXG5cdFx0XHQvLyByaWNoIHRleHQsIHNvIGEgZ2VuZXJpYyBsaXZlIG1lc3NhZ2Ugd291bGQgc2lsZW50bHkgZGl2ZXJnZS5cblx0XHRcdGNvbXBsZXRlUGFzdFRlbnNlLFxuXHRcdH0sIHtcblx0XHRcdGZyb21Bc3Npc3RhbnRLaW5kczogWydzdWJhZ2VudF9zdGFydGVkJywgJ2FjdGlvbicsICdhY3Rpb24nLCAnYWN0aW9uJ10sXG5cdFx0XHR0b29sVXNlRWRnZTogUEFSRU5ULFxuXHRcdFx0ZnJvbVRvb2xSZXN1bHRIYXNDb21wbGV0ZTogdHJ1ZSxcblx0XHRcdGV2ZXJ5QWN0aW9uVGFnZ2VkV2l0aFBhcmVudDogdHJ1ZSxcblx0XHRcdGNvbXBsZXRlUGFzdFRlbnNlOiB7IG1hcmtkb3duOiAnRmluZCBmaWxlcyBtYXRjaGluZyBgKiovKi50c2AnIH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lubmVyIGNsaWVudCB0b29scyBwcmVzZXJ2ZSBjbGllbnQgb3duZXJzaGlwIGFuZCBnZW5lcmljIGlucHV0IGFjcm9zcyB0aGUgbGlmZWN5Y2xlJywgKCkgPT4ge1xuXHRcdGNvbnN0IHN0YXRlID0gbmV3IENsYXVkZU1hcHBlclN0YXRlKCk7XG5cdFx0Y29uc3QgbG9nID0gbmV3IE51bGxMb2dTZXJ2aWNlKCk7XG5cdFx0Y29uc3QgcmVnaXN0cnkgPSByKCk7XG5cdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9ICd0b29sdV9wYXJlbnRfY2xpZW50Jztcblx0XHRtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHRtYWtlU3RyZWFtRXZlbnQoU0VTU0lPTl9JRCwgbWFrZUNvbnRlbnRCbG9ja1N0YXJ0VG9vbFVzZSgwLCBwYXJlbnRUb29sQ2FsbElkLCAnVGFzaycpKSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRjb25zdCBpbm5lckFzc2lzdGFudCA9IG1ha2VBc3Npc3RhbnRNZXNzYWdlKFNFU1NJT05fSUQsIFtcblx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV9pbm5lcl9jbGllbnQnLCBuYW1lOiAnbWNwX19jbGllbnRfX0Jhc2gnLCBpbnB1dDogeyBjb21tYW5kOiAnZWNobyBjbGllbnQnIH0gfSxcblx0XHRdKTtcblx0XHRpbm5lckFzc2lzdGFudC5wYXJlbnRfdG9vbF91c2VfaWQgPSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdGNvbnN0IGZyb21Bc3Npc3RhbnQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJBc3Npc3RhbnQsIFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LCAoKSA9PiAnY2xpZW50LTEnKTtcblx0XHRjb25zdCBpbm5lclRvb2xSZXN1bHQgPSBtYWtlVXNlclRvb2xSZXN1bHRNZXNzYWdlKFNFU1NJT05fSUQsICd0b29sdV9pbm5lcl9jbGllbnQnLCAnZG9uZScpO1xuXHRcdGlubmVyVG9vbFJlc3VsdC5wYXJlbnRfdG9vbF91c2VfaWQgPSBwYXJlbnRUb29sQ2FsbElkO1xuXHRcdGNvbnN0IGZyb21SZXN1bHQgPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoaW5uZXJUb29sUmVzdWx0LCBTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSk7XG5cblx0XHRjb25zdCBhY3Rpb25zID0gWy4uLmZyb21Bc3Npc3RhbnQsIC4uLmZyb21SZXN1bHRdLmZpbHRlcihzaWduYWwgPT4gc2lnbmFsLmtpbmQgPT09ICdhY3Rpb24nKS5tYXAoc2lnbmFsID0+IHNpZ25hbC5raW5kID09PSAnYWN0aW9uJyA/IHNpZ25hbC5hY3Rpb24gOiB1bmRlZmluZWQpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoYWN0aW9ucy5tYXAoYWN0aW9uID0+IHtcblx0XHRcdHN3aXRjaCAoYWN0aW9uPy50eXBlKSB7XG5cdFx0XHRcdGNhc2UgQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydDpcblx0XHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdFx0dHlwZTogYWN0aW9uLnR5cGUsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogYWN0aW9uLnRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGFjdGlvbi5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGNvbnRyaWJ1dG9yOiBhY3Rpb24uY29udHJpYnV0b3IsXG5cdFx0XHRcdFx0XHRtZXRhOiBhY3Rpb24uX21ldGEsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5OlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBhY3Rpb24uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IGFjdGlvbi50b29sSW5wdXQsXG5cdFx0XHRcdFx0fTtcblx0XHRcdFx0Y2FzZSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlOlxuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHR0eXBlOiBhY3Rpb24udHlwZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGFjdGlvbi5yZXN1bHQucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHRkZWZhdWx0OlxuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fSkuZmlsdGVyKGl0ZW0gPT4gaXRlbSAhPT0gdW5kZWZpbmVkKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0b29sTmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnY2xpZW50LTEnIH0sXG5cdFx0XHRcdG1ldGE6IHVuZGVmaW5lZCxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQmFzaCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcXG4gIFwiY29tbWFuZFwiOiBcImVjaG8gY2xpZW50XCJcXG59Jyxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdCYXNoJyxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmVncm91bmQgc3ViYWdlbnQgY29tcGxldGlvbjogdG9vbF9yZXN1bHQgZm9yIGEgVGFzayBzcGF3biBlbWl0cyBDaGF0VG9vbENhbGxDb21wbGV0ZSBBTkQgSUFnZW50U3ViYWdlbnRDb21wbGV0ZWRTaWduYWwsIHRoZW4gY2xlYXJzIHRoZSBzcGF3biBmcm9tIHRoZSByZWdpc3RyeScsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IFBBUkVOVCA9ICd0b29sdV9mZ190YXNrJztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3Qgc2lnbmFscyA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgUEFSRU5ULCAnZG9uZScpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZHM6IHNpZ25hbHMubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IHNpZ25hbHMuZmluZChzID0+IHMua2luZCA9PT0gJ3N1YmFnZW50X2NvbXBsZXRlZCcpPy50b29sQ2FsbElkLFxuXHRcdFx0c3Bhd25DbGVhcmVkOiByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpLFxuXHRcdH0sIHtcblx0XHRcdGtpbmRzOiBbJ2FjdGlvbicsICdzdWJhZ2VudF9jb21wbGV0ZWQnXSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IFBBUkVOVCxcblx0XHRcdHNwYXduQ2xlYXJlZDogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdiYWNrZ3JvdW5kIHN1YmFnZW50IGNvbXBsZXRpb246IHRhc2tfc3RhcnRlZCB0aGVuIHRvb2xfcmVzdWx0IHlpZWxkcyBOTyBjb21wbGV0aW9uOyBsYXRlciB0YXNrX25vdGlmaWNhdGlvbiBmaXJlcyBpdCcsICgpID0+IHtcblx0XHRjb25zdCBzdGF0ZSA9IG5ldyBDbGF1ZGVNYXBwZXJTdGF0ZSgpO1xuXHRcdGNvbnN0IGxvZyA9IG5ldyBOdWxsTG9nU2VydmljZSgpO1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdGNvbnN0IFBBUkVOVCA9ICd0b29sdV9iZ190YXNrJztcblxuXHRcdG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VTdHJlYW1FdmVudChTRVNTSU9OX0lELCBtYWtlQ29udGVudEJsb2NrU3RhcnRUb29sVXNlKDAsIFBBUkVOVCwgJ1Rhc2snKSksXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0bWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzKFxuXHRcdFx0eyB0eXBlOiAnc3lzdGVtJywgc3VidHlwZTogJ3Rhc2tfc3RhcnRlZCcsIHRhc2tfaWQ6ICd0MScsIHRvb2xfdXNlX2lkOiBQQVJFTlQsIGRlc2NyaXB0aW9uOiAnYmcnIH0gYXMgdW5rbm93biBhcyBTREtNZXNzYWdlLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGNvbnN0IGFmdGVyVG9vbFJlc3VsdCA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdE1lc3NhZ2UoU0VTU0lPTl9JRCwgUEFSRU5ULCAndG9vbCByZXR1cm5lZCcpLFxuXHRcdFx0U0VTU0lPTiwgVFVSTl9JRCwgc3RhdGUsIGxvZywgcmVnaXN0cnksXG5cdFx0KTtcblx0XHRjb25zdCBpc0JhY2tncm91bmRBZnRlclRvb2xSZXN1bHQgPSByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpPy5iYWNrZ3JvdW5kO1xuXG5cdFx0Y29uc3QgYWZ0ZXJOb3RpZmljYXRpb24gPSBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHMoXG5cdFx0XHR7IHR5cGU6ICdzeXN0ZW0nLCBzdWJ0eXBlOiAndGFza19ub3RpZmljYXRpb24nLCB0YXNrX2lkOiAndDEnLCB0b29sX3VzZV9pZDogUEFSRU5ULCBzdGF0dXM6ICdjb21wbGV0ZWQnLCBvdXRwdXRfZmlsZTogJ28nLCBzdW1tYXJ5OiAncycgfSBhcyB1bmtub3duIGFzIFNES01lc3NhZ2UsXG5cdFx0XHRTRVNTSU9OLCBUVVJOX0lELCBzdGF0ZSwgbG9nLCByZWdpc3RyeSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgYWZ0ZXJOb3RpZmljYXRpb25BZ2FpbiA9IG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0XHRcdHsgdHlwZTogJ3N5c3RlbScsIHN1YnR5cGU6ICd0YXNrX25vdGlmaWNhdGlvbicsIHRhc2tfaWQ6ICd0MScsIHRvb2xfdXNlX2lkOiBQQVJFTlQsIHN0YXR1czogJ2NvbXBsZXRlZCcsIG91dHB1dF9maWxlOiAnbycsIHN1bW1hcnk6ICdzJyB9IGFzIHVua25vd24gYXMgU0RLTWVzc2FnZSxcblx0XHRcdFNFU1NJT04sIFRVUk5fSUQsIHN0YXRlLCBsb2csIHJlZ2lzdHJ5LFxuXHRcdCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGFmdGVyVG9vbFJlc3VsdEtpbmRzOiBhZnRlclRvb2xSZXN1bHQubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdGlzQmFja2dyb3VuZEFmdGVyVG9vbFJlc3VsdCxcblx0XHRcdGFmdGVyTm90aWZpY2F0aW9uS2luZHM6IGFmdGVyTm90aWZpY2F0aW9uLm1hcChzID0+IHMua2luZCksXG5cdFx0XHRjb21wbGV0ZWRUb29sQ2FsbElkOiBhZnRlck5vdGlmaWNhdGlvbi5maW5kKHMgPT4gcy5raW5kID09PSAnc3ViYWdlbnRfY29tcGxldGVkJyk/LnRvb2xDYWxsSWQsXG5cdFx0XHRhZnRlck5vdGlmaWNhdGlvbkFnYWluS2luZHM6IGFmdGVyTm90aWZpY2F0aW9uQWdhaW4ubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdHNwYXduQ2xlYXJlZEFmdGVyTm90aWZpY2F0aW9uOiByZWdpc3RyeS5nZXRTcGF3bihQQVJFTlQpLFxuXHRcdH0sIHtcblx0XHRcdGFmdGVyVG9vbFJlc3VsdEtpbmRzOiBbJ2FjdGlvbiddLFxuXHRcdFx0aXNCYWNrZ3JvdW5kQWZ0ZXJUb29sUmVzdWx0OiB0cnVlLFxuXHRcdFx0YWZ0ZXJOb3RpZmljYXRpb25LaW5kczogWydzdWJhZ2VudF9jb21wbGV0ZWQnXSxcblx0XHRcdGNvbXBsZXRlZFRvb2xDYWxsSWQ6IFBBUkVOVCxcblx0XHRcdGFmdGVyTm90aWZpY2F0aW9uQWdhaW5LaW5kczogW10sXG5cdFx0XHRzcGF3bkNsZWFyZWRBZnRlck5vdGlmaWNhdGlvbjogdW5kZWZpbmVkLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjcmVnaW9uIGZvY3VzZWQgY29udHJhY3QgdGVzdHMgb24gdGhlIGV4dHJhY3RlZCBleHBvcnRzXG5cblx0dGVzdCgnYnVpbGRUb3BMZXZlbFN1YmFnZW50UmVhZHlBY3Rpb24gb21pdHMgX21ldGEgZGVzY3JpcHRpb24vYWdlbnROYW1lIHdoZW4gaW5wdXQgZmllbGRzIGFyZSBtaXNzaW5nIG9yIHdyb25nLXR5cGVkOyBzdGlsbCByZWNvcmRzIHRoZSBzcGF3bicsICgpID0+IHtcblx0XHRjb25zdCByZWdpc3RyeSA9IHIoKTtcblx0XHRjb25zdCBtYWxmb3JtZWQgPSBidWlsZFRvcExldmVsU3ViYWdlbnRSZWFkeUFjdGlvbihcblx0XHRcdHsgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0b29sdV9iYWQnLCBuYW1lOiAnVGFzaycsIGlucHV0OiB7IGRlc2NyaXB0aW9uOiA0Miwgc3ViYWdlbnRfdHlwZTogbnVsbCB9IGFzIHVua25vd24gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfSxcblx0XHRcdFNFU1NJT04sXG5cdFx0XHRUVVJOX0lELFxuXHRcdFx0cmVnaXN0cnksXG5cdFx0KTtcblxuXHRcdGFzc2VydC5vayhtYWxmb3JtZWQua2luZCA9PT0gJ2FjdGlvbicgJiYgbWFsZm9ybWVkLmFjdGlvbi50eXBlID09PSBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5KTtcblx0XHRjb25zdCBzcGF3biA9IHJlZ2lzdHJ5LmdldFNwYXduKCd0b29sdV9iYWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdG1ldGE6IG1hbGZvcm1lZC5hY3Rpb24uX21ldGEsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbWFsZm9ybWVkLmFjdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHNwYXduUmVjb3JkZWQ6IHNwYXduPy50b29sVXNlSWQsXG5cdFx0XHRzcGF3blN1YmFnZW50VHlwZTogc3Bhd24/LnN1YmFnZW50VHlwZSxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246IHNwYXduPy5kZXNjcmlwdGlvbixcblx0XHR9LCB7XG5cdFx0XHRtZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnIH0sXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1biBzdWJhZ2VudCB0YXNrJyxcblx0XHRcdHNwYXduUmVjb3JkZWQ6ICd0b29sdV9iYWQnLFxuXHRcdFx0c3Bhd25TdWJhZ2VudFR5cGU6IHVuZGVmaW5lZCxcblx0XHRcdHNwYXduRGVzY3JpcHRpb246IHVuZGVmaW5lZCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbWFwU3ViYWdlbnRTeXN0ZW1NZXNzYWdlIGlnbm9yZXMgdGFza19ub3RpZmljYXRpb24gd2l0aCBub24tdGVybWluYWwgc3RhdHVzLCBtaXNzaW5nIHRvb2xfdXNlX2lkLCBvciB1bmtub3duIHNwYXduJywgKCkgPT4ge1xuXHRcdGNvbnN0IHJlZ2lzdHJ5ID0gcigpO1xuXHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKCd0b29sdV9rbm93bicpO1xuXG5cdFx0Y29uc3QgaW5Qcm9ncmVzcyA9IG1hcFN1YmFnZW50U3lzdGVtTWVzc2FnZSh7IHR5cGU6ICdzeXN0ZW0nLCBzdWJ0eXBlOiAndGFza19ub3RpZmljYXRpb24nLCB0YXNrX2lkOiAndCcsIHRvb2xfdXNlX2lkOiAndG9vbHVfa25vd24nLCBzdGF0dXM6ICdpbl9wcm9ncmVzcycgfSBhcyB1bmtub3duIGFzIFNES01lc3NhZ2UgJiB7IHR5cGU6ICdzeXN0ZW0nIH0sIFNFU1NJT04sIHJlZ2lzdHJ5KTtcblx0XHRjb25zdCBtaXNzaW5nSWQgPSBtYXBTdWJhZ2VudFN5c3RlbU1lc3NhZ2UoeyB0eXBlOiAnc3lzdGVtJywgc3VidHlwZTogJ3Rhc2tfbm90aWZpY2F0aW9uJywgdGFza19pZDogJ3QnLCBzdGF0dXM6ICdjb21wbGV0ZWQnIH0gYXMgdW5rbm93biBhcyBTREtNZXNzYWdlICYgeyB0eXBlOiAnc3lzdGVtJyB9LCBTRVNTSU9OLCByZWdpc3RyeSk7XG5cdFx0Y29uc3QgdW5rbm93bkVudHJ5ID0gbWFwU3ViYWdlbnRTeXN0ZW1NZXNzYWdlKHsgdHlwZTogJ3N5c3RlbScsIHN1YnR5cGU6ICd0YXNrX25vdGlmaWNhdGlvbicsIHRhc2tfaWQ6ICd0JywgdG9vbF91c2VfaWQ6ICd0b29sdV91bmtub3duJywgc3RhdHVzOiAnY29tcGxldGVkJyB9IGFzIHVua25vd24gYXMgU0RLTWVzc2FnZSAmIHsgdHlwZTogJ3N5c3RlbScgfSwgU0VTU0lPTiwgcmVnaXN0cnkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpblByb2dyZXNzS2luZHM6IGluUHJvZ3Jlc3MubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdG1pc3NpbmdJZEtpbmRzOiBtaXNzaW5nSWQubWFwKHMgPT4gcy5raW5kKSxcblx0XHRcdHVua25vd25FbnRyeUtpbmRzOiB1bmtub3duRW50cnkubWFwKHMgPT4gcy5raW5kKSxcblx0XHR9LCB7XG5cdFx0XHRpblByb2dyZXNzS2luZHM6IFtdLFxuXHRcdFx0bWlzc2luZ0lkS2luZHM6IFtdLFxuXHRcdFx0dW5rbm93bkVudHJ5S2luZHM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAjZW5kcmVnaW9uXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUVuQixTQUFTLFdBQVc7QUFDcEIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxzQkFBc0I7QUFDL0IsU0FBUyxrQkFBa0I7QUFDM0IsU0FBUyw0QkFBNEIsK0JBQStCO0FBQ3BFLFNBQVMsbUJBQW1CLG1DQUFtQztBQUMvRCxTQUFTLHdCQUF3QjtBQUNqQyxTQUFTLGtDQUFrQyxnQ0FBZ0M7QUFDM0U7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLE9BQ007QUFXUCxNQUFNLGtEQUE2QyxNQUFNO0FBRXhELFFBQU0sY0FBYyx3Q0FBd0M7QUFFNUQsUUFBTSxVQUFVLElBQUks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
