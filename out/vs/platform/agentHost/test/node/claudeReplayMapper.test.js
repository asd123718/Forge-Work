import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { URI } from "../../../../base/common/uri.js";
import { NullLogService } from "../../../log/common/log.js";
import { ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/protocol/state.js";
import { mapSessionMessagesToTurns, missingPromptPlaceholder, resolveForkAnchorUuid } from "../../node/claude/claudeReplayMapper.js";
suite("claudeReplayMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const logService = new NullLogService();
  const session = URI.parse("claude:/sess-1");
  function makeUser(uuid, text, timestamp) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "text", text }] },
      timestamp
    };
  }
  function makeAssistantText(uuid, text, timestamp) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "text", text }] },
      timestamp
    };
  }
  function makeAssistantToolUse(uuid, toolUseId, name, input = {}, timestamp) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: {
        id: `msg_${uuid}`,
        role: "assistant",
        content: [{ type: "tool_use", id: toolUseId, name, input }]
      },
      timestamp
    };
  }
  function makeUserToolResult(uuid, toolUseId, text, isError = false, timestamp) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: toolUseId, content: text, ...isError ? { is_error: true } : {} }]
      },
      timestamp
    };
  }
  function makeSystem(uuid, subtype, text) {
    return {
      type: "system",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { subtype, ...text !== void 0 ? { text } : {} }
    };
  }
  test("Fixture 1: single text turn", () => {
    const messages = [
      makeUser("u1", "hello"),
      makeAssistantText("a1", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].id, "u1", "Turn.id MUST equal user SessionMessage.uuid");
    assert.strictEqual(turns[0].message.text, "hello");
    assert.strictEqual(turns[0].usage, void 0, "replay never has usage");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.Markdown);
    if (part.kind === ResponsePartKind.Markdown) {
      assert.strictEqual(part.content, "world");
    }
  });
  test("restores turn timing from persisted message timestamps", () => {
    const messages = [
      makeUser("u1", "hello", "2026-07-09T18:00:00.000Z"),
      makeAssistantText("a1", "world", "2026-07-09T18:00:02.500Z")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual({
      startedAt: turns[0].startedAt,
      duration: turns[0].duration
    }, {
      startedAt: "2026-07-09T18:00:00.000Z",
      duration: 2500
    });
  });
  test("leaves turn timing unknown when persisted timestamps are missing or invalid", () => {
    const messages = [
      makeUser("u1", "hello", "invalid"),
      makeAssistantText("a1", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual({
      startedAt: turns[0].startedAt,
      duration: turns[0].duration
    }, {
      startedAt: void 0,
      duration: void 0
    });
  });
  test("Fixture 2: tool_use + tool_result is one Turn with one Completed ToolCall", () => {
    const messages = [
      makeUser("u1", "list files"),
      makeAssistantToolUse("a1", "tu1", "Bash", { command: "ls" }),
      makeUserToolResult("synthetic1", "tu1", "file1.txt\nfile2.txt"),
      makeAssistantText("a2", "two files")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "tool_result MUST NOT start a new turn");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    const toolCallParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.ToolCall);
    assert.strictEqual(toolCallParts.length, 1);
    const toolCall = toolCallParts[0];
    assert.strictEqual(toolCall.kind, ResponsePartKind.ToolCall);
    if (toolCall.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCall.toolCall.status, ToolCallStatus.Completed);
      assert.strictEqual(toolCall.toolCall.toolName, "Bash");
      if (toolCall.toolCall.status === ToolCallStatus.Completed) {
        assert.strictEqual(toolCall.toolCall.success, true);
        assert.deepStrictEqual(toolCall.toolCall.content, [{ type: ToolResultContentType.Text, text: "file1.txt\nfile2.txt" }]);
      }
    }
  });
  test("replay preserves generic semantics for client tools that collide with built-in names", () => {
    const messages = [
      makeUser("u1", "run client tools"),
      makeAssistantToolUse("a1", "tu_bash", "mcp__client__Bash", { command: "echo client" }),
      makeUserToolResult("r1", "tu_bash", "done"),
      makeAssistantToolUse("a2", "tu_task", "mcp__client__Task", { description: "client task" }),
      makeUserToolResult("r2", "tu_task", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const tools = turns[0].responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => {
      assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
      return {
        toolName: part.toolCall.toolName,
        displayName: part.toolCall.displayName,
        meta: part.toolCall._meta,
        invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : void 0,
        toolInput: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.toolInput : void 0,
        pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : void 0,
        hasSubagentContent: part.toolCall.status === ToolCallStatus.Completed && part.toolCall.content?.some((content) => content.type === ToolResultContentType.Subagent)
      };
    });
    assert.deepStrictEqual(tools, [
      {
        toolName: "Bash",
        displayName: "Bash",
        meta: void 0,
        invocationMessage: "Bash",
        toolInput: '{\n  "command": "echo client"\n}',
        pastTenseMessage: "Bash",
        hasSubagentContent: false
      },
      {
        toolName: "Task",
        displayName: "Task",
        meta: void 0,
        invocationMessage: "Task",
        toolInput: '{\n  "description": "client task"\n}',
        pastTenseMessage: "Task",
        hasSubagentContent: false
      }
    ]);
  });
  test("Fixture 3: multi-turn produces ordered Turns", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantText("a1", "reply 1"),
      makeUser("u2", "second"),
      makeAssistantText("a2", "reply 2")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2);
    assert.strictEqual(turns[0].id, "u1");
    assert.strictEqual(turns[1].id, "u2");
  });
  test("Fixture 4: compact_boundary attaches as SystemNotification on the active turn", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantText("a1", "reply 1"),
      makeSystem("s1", "compact_boundary", "context compacted"),
      makeAssistantText("a2", "reply 2")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "compact_boundary is NOT a turn boundary");
    const sysParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.SystemNotification);
    assert.strictEqual(sysParts.length, 1);
  });
  test("Fixture 5: Task / Agent tool_use produces subagent marker", () => {
    const messages = [
      makeUser("u1", "spawn subagent"),
      makeAssistantToolUse("a1", "tu1", "Task", { description: "do thing" }),
      makeUserToolResult("synthetic1", "tu1", "subagent done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const toolCallPart = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolCallPart, "expected a ToolCall part");
    if (toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, "subagent");
      if (toolCallPart.toolCall.status === ToolCallStatus.Completed) {
        const hasSubagentMarker = toolCallPart.toolCall.content?.some((c) => c.type === ToolResultContentType.Subagent);
        assert.strictEqual(hasSubagentMarker, true, "subagent marker block must be present");
      } else {
        assert.fail(`expected Completed status, got ${toolCallPart.toolCall.status}`);
      }
    }
  });
  test("Fixture 5b: Agent tool name also recognised as subagent", () => {
    const messages = [
      makeUser("u1", "spawn subagent"),
      makeAssistantToolUse("a1", "tu1", "Agent", { description: "do thing" }),
      makeUserToolResult("synthetic1", "tu1", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const toolCallPart = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolCallPart && toolCallPart.kind === ResponsePartKind.ToolCall);
    if (toolCallPart.kind === ResponsePartKind.ToolCall) {
      assert.strictEqual(toolCallPart.toolCall._meta?.toolKind, "subagent");
    }
  });
  test("Fixture 6: tail Turn with orphan tool_use is Cancelled", () => {
    const messages = [
      makeUser("u1", "do work"),
      makeAssistantToolUse("a1", "tu-orphan", "Bash", { command: "sleep 100" })
      // no matching tool_result — model crashed mid-turn
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].state, TurnState.Cancelled);
  });
  test("Fixture 6b: orphan in turn N does NOT cancel turn N+1", () => {
    const messages = [
      makeUser("u1", "first"),
      makeAssistantToolUse("a1", "tu-orphan", "Bash", {}),
      // no tool_result for tu-orphan
      makeUser("u2", "second"),
      makeAssistantText("a2", "clean reply")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2);
    assert.strictEqual(turns[0].state, TurnState.Cancelled, "turn 1 has orphan");
    assert.strictEqual(turns[1].state, TurnState.Complete, "turn 2 has no orphan");
  });
  test("late tool results do not extend the active turn duration", () => {
    const messages = [
      makeUser("u1", "first", "2026-07-09T18:00:00.000Z"),
      makeAssistantToolUse("a1", "tu-late", "Bash", {}, "2026-07-09T18:00:01.000Z"),
      makeUser("u2", "second", "2026-07-09T18:00:10.000Z"),
      makeAssistantText("a2", "clean reply", "2026-07-09T18:00:12.000Z"),
      makeUserToolResult("late-result", "tu-late", "done", false, "2026-07-09T18:00:20.000Z")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual(turns.map((turn) => turn.duration), [1e3, 2e3]);
  });
  test("Fixture 7: non-allowlisted system subtypes are dropped", () => {
    const messages = [
      makeUser("u1", "go"),
      makeAssistantText("a1", "reply"),
      makeSystem("s1", "api_retry", "retrying"),
      makeSystem("s2", "hook_started", "hook x")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    const sysParts = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.SystemNotification);
    assert.strictEqual(sysParts.length, 0);
  });
  test("Fixture 9: CLI slash-command echo and local-command-stdout entries are dropped", () => {
    const messages = [
      makeUser("u1", "what model are you"),
      makeAssistantText("a1", "sonnet"),
      {
        type: "user",
        uuid: "echo-1",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<command-name>/model</command-name>\n            <command-message>model</command-message>\n            <command-args>claude-opus-4.7</command-args>" }
      },
      {
        type: "user",
        uuid: "echo-2",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<local-command-stdout>Set model to claude-opus-4.7</local-command-stdout>" }
      },
      makeUser("u2", "how about now"),
      makeAssistantText("a2", "opus")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 2, "CLI-echo user envelopes must NOT start new turns");
    assert.strictEqual(turns[0].id, "u1");
    assert.strictEqual(turns[0].message.text, "what model are you");
    assert.strictEqual(turns[1].id, "u2");
    assert.strictEqual(turns[1].message.text, "how about now");
  });
  test("Fixture 10: prompt-less subagent transcript (inner messages) maps to one turn", () => {
    const parent = "toolu_parent";
    const messages = [
      {
        type: "assistant",
        uuid: "sa1",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa1", role: "assistant", content: [{ type: "thinking", thinking: "planning", signature: "sig" }] }
      },
      {
        type: "assistant",
        uuid: "sa2",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa2", role: "assistant", content: [{ type: "tool_use", id: "tu_inner", name: "Bash", input: { command: "ls" } }] }
      },
      {
        type: "user",
        uuid: "sa3",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { role: "user", content: [{ type: "tool_result", tool_use_id: "tu_inner", content: "file-a.txt\nfile-b.txt" }] }
      },
      {
        type: "assistant",
        uuid: "sa4",
        session_id: "sess-1",
        parent_tool_use_id: parent,
        parent_agent_id: null,
        message: { id: "msg_sa4", role: "assistant", content: [{ type: "text", text: "Done. SUBAGENT_ONLY_MARKER_xyz" }] }
      }
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1, "inner assistant messages must form a single synthesized turn");
    assert.strictEqual(turns[0].id, "sa1", "turn id anchors on the first inner assistant envelope");
    assert.strictEqual(turns[0].message.text, "", "subagent turn has no user prompt");
    assert.strictEqual(turns[0].state, TurnState.Complete, "tool_result drains the pending tool_use");
    const markdown = turns[0].responseParts.filter((p) => p.kind === ResponsePartKind.Markdown);
    assert.ok(
      markdown.some((p) => p.kind === ResponsePartKind.Markdown && p.content.includes("SUBAGENT_ONLY_MARKER_xyz")),
      "the subagent final text (with marker) must survive replay"
    );
    const toolCall = turns[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(
      toolCall && toolCall.kind === ResponsePartKind.ToolCall && toolCall.toolCall.status === ToolCallStatus.Completed,
      "inner Bash tool call must be reconstructed as Completed"
    );
  });
  test("Fixture 10b: top-level assistant before any user message is recovered under a placeholder prompt", () => {
    const messages = [
      makeAssistantText("a1", "promptless reply"),
      makeUser("u1", "hello"),
      makeAssistantText("a2", "world")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, text: turn.message.text })), [
      { id: "a1", text: missingPromptPlaceholder() },
      { id: "u1", text: "hello" }
    ]);
  });
  test("a transcript slice with no user message at all still yields turns", () => {
    const messages = [
      makeAssistantToolUse("a1", "tu1", "Bash", { command: "ls" }),
      makeUserToolResult("r1", "tu1", "file.txt"),
      makeAssistantText("a2", "done")
    ];
    const turns = mapSessionMessagesToTurns(messages, session, logService);
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].message.text, missingPromptPlaceholder());
    assert.strictEqual(turns[0].state, TurnState.Complete);
  });
});
suite("resolveForkAnchorUuid", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  function makeUser(uuid, text) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "text", text }] }
    };
  }
  function makeAssistantText(uuid, text) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "text", text }] }
    };
  }
  function makeAssistantToolUse(uuid, toolUseId, name, input = {}) {
    return {
      type: "assistant",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { id: `msg_${uuid}`, role: "assistant", content: [{ type: "tool_use", id: toolUseId, name, input }] }
    };
  }
  function makeUserToolResult(uuid, toolUseId, text) {
    return {
      type: "user",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { role: "user", content: [{ type: "tool_result", tool_use_id: toolUseId, content: text }] }
    };
  }
  function makeSystem(uuid, subtype, text) {
    return {
      type: "system",
      uuid,
      session_id: "sess-1",
      parent_tool_use_id: null,
      parent_agent_id: null,
      message: { subtype, ...text !== void 0 ? { text } : {} }
    };
  }
  const threeTurns = [
    makeUser("u1", "apple"),
    makeAssistantText("a1", "apple!"),
    makeUser("u2", "banana"),
    makeAssistantText("a2", "banana!"),
    makeUser("u3", "cherry"),
    makeAssistantText("a3", "cherry!")
  ];
  test("fork at turn 0 \u2192 last assistant uuid of turn 0", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u1"), "a1");
  });
  test("fork at turn 1 \u2192 last assistant uuid of turn 1", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u2"), "a2");
  });
  test("fork at the last turn \u2192 last assistant uuid of that turn", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "u3"), "a3");
  });
  test("turn with multiple assistant envelopes \u2192 the LAST one", () => {
    const messages = [
      makeUser("u1", "do a thing"),
      makeAssistantText("a1", "thinking"),
      makeAssistantToolUse("a2", "tool-1", "Read"),
      makeUserToolResult("r1", "tool-1", "file contents"),
      makeUser("u2", "next"),
      makeAssistantText("a3", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a2", "must return the last assistant envelope of the target turn");
  });
  test("user-tool-results between assistants does not flip the turn", () => {
    const messages = [
      makeUser("u1", "go"),
      makeAssistantToolUse("a1", "tool-1", "Read"),
      makeUserToolResult("r1", "tool-1", "contents"),
      makeAssistantText("a2", "done"),
      makeUser("u2", "next"),
      makeAssistantText("a3", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a2", "tool_result envelope must not end the turn");
  });
  test("system-notification mid-turn does not flip the turn", () => {
    const messages = [
      makeUser("u1", "go"),
      makeSystem("s1", "compact_boundary"),
      makeAssistantText("a1", "done"),
      makeUser("u2", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a1", "system notification must not end the turn");
  });
  test("user-only target turn (no assistant) has no valid fork anchor", () => {
    const messages = [
      makeUser("u1", "apple"),
      makeAssistantText("a1", "apple!"),
      makeUser("u2", "unanswered")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u2"), void 0);
  });
  test("turnId not found \u2192 undefined", () => {
    assert.strictEqual(resolveForkAnchorUuid(threeTurns, "nope"), void 0);
  });
  test("a promptless leading turn is anchorable, mirroring the replay builder", () => {
    const messages = [
      makeAssistantText("a1", "promptless reply"),
      makeUser("u1", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "a1"), "a1");
  });
  test("empty transcript \u2192 undefined", () => {
    assert.strictEqual(resolveForkAnchorUuid([], "u1"), void 0);
  });
  test("CLI-echo user envelopes are skipped by the shared parser", () => {
    const messages = [
      makeUser("u1", "what model"),
      {
        type: "user",
        uuid: "echo-1",
        session_id: "sess-1",
        parent_tool_use_id: null,
        parent_agent_id: null,
        message: { role: "user", content: "<command-name>/model</command-name>" }
      },
      makeAssistantText("a1", "opus"),
      makeUser("u2", "next"),
      makeAssistantText("a2", "ok")
    ];
    assert.strictEqual(resolveForkAnchorUuid(messages, "u1"), "a1");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjbGF1ZGVSZXBsYXlNYXBwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgU2Vzc2lvbk1lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IGFzc2VydCBmcm9tICdhc3NlcnQnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTnVsbExvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucywgbWlzc2luZ1Byb21wdFBsYWNlaG9sZGVyLCByZXNvbHZlRm9ya0FuY2hvclV1aWQgfSBmcm9tICcuLi8uLi9ub2RlL2NsYXVkZS9jbGF1ZGVSZXBsYXlNYXBwZXIuanMnO1xuXG5zdWl0ZSgnY2xhdWRlUmVwbGF5TWFwcGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IGxvZ1NlcnZpY2UgPSBuZXcgTnVsbExvZ1NlcnZpY2UoKTtcblx0Y29uc3Qgc2Vzc2lvbiA9IFVSSS5wYXJzZSgnY2xhdWRlOi9zZXNzLTEnKTtcblx0dHlwZSBUaW1lc3RhbXBlZFNlc3Npb25NZXNzYWdlID0gU2Vzc2lvbk1lc3NhZ2UgJiB7IHJlYWRvbmx5IHRpbWVzdGFtcD86IHN0cmluZyB9O1xuXG5cdGZ1bmN0aW9uIG1ha2VVc2VyKHV1aWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCB0aW1lc3RhbXA/OiBzdHJpbmcpOiBUaW1lc3RhbXBlZFNlc3Npb25NZXNzYWdlIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0dXVpZCxcblx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dCB9XSB9LFxuXHRcdFx0dGltZXN0YW1wLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQXNzaXN0YW50VGV4dCh1dWlkOiBzdHJpbmcsIHRleHQ6IHN0cmluZywgdGltZXN0YW1wPzogc3RyaW5nKTogVGltZXN0YW1wZWRTZXNzaW9uTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0dXVpZCxcblx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0bWVzc2FnZTogeyBpZDogYG1zZ18ke3V1aWR9YCwgcm9sZTogJ2Fzc2lzdGFudCcsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dCB9XSB9LFxuXHRcdFx0dGltZXN0YW1wLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlQXNzaXN0YW50VG9vbFVzZSh1dWlkOiBzdHJpbmcsIHRvb2xVc2VJZDogc3RyaW5nLCBuYW1lOiBzdHJpbmcsIGlucHV0OiB1bmtub3duID0ge30sIHRpbWVzdGFtcD86IHN0cmluZyk6IFRpbWVzdGFtcGVkU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnYXNzaXN0YW50Jyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0aWQ6IGBtc2dfJHt1dWlkfWAsXG5cdFx0XHRcdHJvbGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiAndG9vbF91c2UnLCBpZDogdG9vbFVzZUlkLCBuYW1lLCBpbnB1dCB9XSxcblx0XHRcdH0sXG5cdFx0XHR0aW1lc3RhbXAsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VVc2VyVG9vbFJlc3VsdCh1dWlkOiBzdHJpbmcsIHRvb2xVc2VJZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIGlzRXJyb3IgPSBmYWxzZSwgdGltZXN0YW1wPzogc3RyaW5nKTogVGltZXN0YW1wZWRTZXNzaW9uTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICd1c2VyJyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0cm9sZTogJ3VzZXInLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiAndG9vbF9yZXN1bHQnLCB0b29sX3VzZV9pZDogdG9vbFVzZUlkLCBjb250ZW50OiB0ZXh0LCAuLi4oaXNFcnJvciA/IHsgaXNfZXJyb3I6IHRydWUgfSA6IHt9KSB9XSxcblx0XHRcdH0sXG5cdFx0XHR0aW1lc3RhbXAsXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VTeXN0ZW0odXVpZDogc3RyaW5nLCBzdWJ0eXBlOiBzdHJpbmcsIHRleHQ/OiBzdHJpbmcpOiBTZXNzaW9uTWVzc2FnZSB7XG5cdFx0cmV0dXJuIHtcblx0XHRcdHR5cGU6ICdzeXN0ZW0nLFxuXHRcdFx0dXVpZCxcblx0XHRcdHNlc3Npb25faWQ6ICdzZXNzLTEnLFxuXHRcdFx0cGFyZW50X3Rvb2xfdXNlX2lkOiBudWxsLFxuXHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0bWVzc2FnZTogeyBzdWJ0eXBlLCAuLi4odGV4dCAhPT0gdW5kZWZpbmVkID8geyB0ZXh0IH0gOiB7fSkgfSxcblx0XHR9O1xuXHR9XG5cblx0dGVzdCgnRml4dHVyZSAxOiBzaW5nbGUgdGV4dCB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2hlbGxvJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnd29ybGQnKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5pZCwgJ3UxJywgJ1R1cm4uaWQgTVVTVCBlcXVhbCB1c2VyIFNlc3Npb25NZXNzYWdlLnV1aWQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ubWVzc2FnZS50ZXh0LCAnaGVsbG8nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0udXNhZ2UsIHVuZGVmaW5lZCwgJ3JlcGxheSBuZXZlciBoYXMgdXNhZ2UnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0uc3RhdGUsIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0c1swXTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblx0XHRpZiAocGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb250ZW50LCAnd29ybGQnKTtcblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHR1cm4gdGltaW5nIGZyb20gcGVyc2lzdGVkIG1lc3NhZ2UgdGltZXN0YW1wcycsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdoZWxsbycsICcyMDI2LTA3LTA5VDE4OjAwOjAwLjAwMFonKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICd3b3JsZCcsICcyMDI2LTA3LTA5VDE4OjAwOjAyLjUwMFonKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0c3RhcnRlZEF0OiB0dXJuc1swXS5zdGFydGVkQXQsXG5cdFx0XHRkdXJhdGlvbjogdHVybnNbMF0uZHVyYXRpb24sXG5cdFx0fSwge1xuXHRcdFx0c3RhcnRlZEF0OiAnMjAyNi0wNy0wOVQxODowMDowMC4wMDBaJyxcblx0XHRcdGR1cmF0aW9uOiAyXzUwMCxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHR1cm4gdGltaW5nIHVua25vd24gd2hlbiBwZXJzaXN0ZWQgdGltZXN0YW1wcyBhcmUgbWlzc2luZyBvciBpbnZhbGlkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2hlbGxvJywgJ2ludmFsaWQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICd3b3JsZCcpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGFydGVkQXQ6IHR1cm5zWzBdLnN0YXJ0ZWRBdCxcblx0XHRcdGR1cmF0aW9uOiB0dXJuc1swXS5kdXJhdGlvbixcblx0XHR9LCB7XG5cdFx0XHRzdGFydGVkQXQ6IHVuZGVmaW5lZCxcblx0XHRcdGR1cmF0aW9uOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgMjogdG9vbF91c2UgKyB0b29sX3Jlc3VsdCBpcyBvbmUgVHVybiB3aXRoIG9uZSBDb21wbGV0ZWQgVG9vbENhbGwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnbGlzdCBmaWxlcycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2ExJywgJ3R1MScsICdCYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdzeW50aGV0aWMxJywgJ3R1MScsICdmaWxlMS50eHRcXG5maWxlMi50eHQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICd0d28gZmlsZXMnKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEsICd0b29sX3Jlc3VsdCBNVVNUIE5PVCBzdGFydCBhIG5ldyB0dXJuJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUpO1xuXHRcdGNvbnN0IHRvb2xDYWxsUGFydHMgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcihwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsUGFydHMubGVuZ3RoLCAxKTtcblx0XHRjb25zdCB0b29sQ2FsbCA9IHRvb2xDYWxsUGFydHNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsLmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGlmICh0b29sQ2FsbC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodG9vbENhbGwudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsLnRvb2xDYWxsLnRvb2xOYW1lLCAnQmFzaCcpO1xuXHRcdFx0aWYgKHRvb2xDYWxsLnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sQ2FsbC50b29sQ2FsbC5zdWNjZXNzLCB0cnVlKTtcblx0XHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29sQ2FsbC50b29sQ2FsbC5jb250ZW50LCBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2ZpbGUxLnR4dFxcbmZpbGUyLnR4dCcgfV0pO1xuXHRcdFx0fVxuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgncmVwbGF5IHByZXNlcnZlcyBnZW5lcmljIHNlbWFudGljcyBmb3IgY2xpZW50IHRvb2xzIHRoYXQgY29sbGlkZSB3aXRoIGJ1aWx0LWluIG5hbWVzJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ3J1biBjbGllbnQgdG9vbHMnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dV9iYXNoJywgJ21jcF9fY2xpZW50X19CYXNoJywgeyBjb21tYW5kOiAnZWNobyBjbGllbnQnIH0pLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdyMScsICd0dV9iYXNoJywgJ2RvbmUnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMicsICd0dV90YXNrJywgJ21jcF9fY2xpZW50X19UYXNrJywgeyBkZXNjcmlwdGlvbjogJ2NsaWVudCB0YXNrJyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgncjInLCAndHVfdGFzaycsICdkb25lJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cdFx0Y29uc3QgdG9vbHMgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkubWFwKHBhcnQgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0b29sTmFtZTogcGFydC50b29sQ2FsbC50b29sTmFtZSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IHBhcnQudG9vbENhbGwuZGlzcGxheU5hbWUsXG5cdFx0XHRcdG1ldGE6IHBhcnQudG9vbENhbGwuX21ldGEsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0dG9vbElucHV0OiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC50b29sSW5wdXQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBwYXJ0LnRvb2xDYWxsLnBhc3RUZW5zZU1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRcdGhhc1N1YmFnZW50Q29udGVudDogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZFxuXHRcdFx0XHRcdCYmIHBhcnQudG9vbENhbGwuY29udGVudD8uc29tZShjb250ZW50ID0+IGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KSxcblx0XHRcdH07XG5cdFx0fSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0b29scywgW1xuXHRcdFx0e1xuXHRcdFx0XHR0b29sTmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRtZXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQmFzaCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcXG4gIFwiY29tbWFuZFwiOiBcImVjaG8gY2xpZW50XCJcXG59Jyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0Jhc2gnLFxuXHRcdFx0XHRoYXNTdWJhZ2VudENvbnRlbnQ6IGZhbHNlLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dG9vbE5hbWU6ICdUYXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUYXNrJyxcblx0XHRcdFx0bWV0YTogdW5kZWZpbmVkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1Rhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XFxuICBcImRlc2NyaXB0aW9uXCI6IFwiY2xpZW50IHRhc2tcIlxcbn0nLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnVGFzaycsXG5cdFx0XHRcdGhhc1N1YmFnZW50Q29udGVudDogZmFsc2UsXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDM6IG11bHRpLXR1cm4gcHJvZHVjZXMgb3JkZXJlZCBUdXJucycsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdmaXJzdCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3JlcGx5IDEnKSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICdzZWNvbmQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdyZXBseSAyJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0uaWQsICd1MScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1sxXS5pZCwgJ3UyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgNDogY29tcGFjdF9ib3VuZGFyeSBhdHRhY2hlcyBhcyBTeXN0ZW1Ob3RpZmljYXRpb24gb24gdGhlIGFjdGl2ZSB0dXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2ZpcnN0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAncmVwbHkgMScpLFxuXHRcdFx0bWFrZVN5c3RlbSgnczEnLCAnY29tcGFjdF9ib3VuZGFyeScsICdjb250ZXh0IGNvbXBhY3RlZCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ3JlcGx5IDInKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgdHVybnMgPSBtYXBTZXNzaW9uTWVzc2FnZXNUb1R1cm5zKG1lc3NhZ2VzLCBzZXNzaW9uLCBsb2dTZXJ2aWNlKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEsICdjb21wYWN0X2JvdW5kYXJ5IGlzIE5PVCBhIHR1cm4gYm91bmRhcnknKTtcblx0XHRjb25zdCBzeXNQYXJ0cyA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5c1BhcnRzLmxlbmd0aCwgMSk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgNTogVGFzayAvIEFnZW50IHRvb2xfdXNlIHByb2R1Y2VzIHN1YmFnZW50IG1hcmtlcicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdzcGF3biBzdWJhZ2VudCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2ExJywgJ3R1MScsICdUYXNrJywgeyBkZXNjcmlwdGlvbjogJ2RvIHRoaW5nJyB9KSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgnc3ludGhldGljMScsICd0dTEnLCAnc3ViYWdlbnQgZG9uZScpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0Y29uc3QgdG9vbENhbGxQYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbENhbGxQYXJ0LCAnZXhwZWN0ZWQgYSBUb29sQ2FsbCBwYXJ0Jyk7XG5cdFx0aWYgKHRvb2xDYWxsUGFydCAmJiB0b29sQ2FsbFBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsUGFydC50b29sQ2FsbC5fbWV0YT8udG9vbEtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKHRvb2xDYWxsUGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdFx0XHRjb25zdCBoYXNTdWJhZ2VudE1hcmtlciA9IHRvb2xDYWxsUGFydC50b29sQ2FsbC5jb250ZW50Py5zb21lKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGFzU3ViYWdlbnRNYXJrZXIsIHRydWUsICdzdWJhZ2VudCBtYXJrZXIgYmxvY2sgbXVzdCBiZSBwcmVzZW50Jyk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhc3NlcnQuZmFpbChgZXhwZWN0ZWQgQ29tcGxldGVkIHN0YXR1cywgZ290ICR7dG9vbENhbGxQYXJ0LnRvb2xDYWxsLnN0YXR1c31gKTtcblx0XHRcdH1cblx0XHR9XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgNWI6IEFnZW50IHRvb2wgbmFtZSBhbHNvIHJlY29nbmlzZWQgYXMgc3ViYWdlbnQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnc3Bhd24gc3ViYWdlbnQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dTEnLCAnQWdlbnQnLCB7IGRlc2NyaXB0aW9uOiAnZG8gdGhpbmcnIH0pLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdzeW50aGV0aWMxJywgJ3R1MScsICdkb25lJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCB0b29sQ2FsbFBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbmQocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGFzc2VydC5vayh0b29sQ2FsbFBhcnQgJiYgdG9vbENhbGxQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGlmICh0b29sQ2FsbFBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsUGFydC50b29sQ2FsbC5fbWV0YT8udG9vbEtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdH1cblx0fSk7XG5cblx0dGVzdCgnRml4dHVyZSA2OiB0YWlsIFR1cm4gd2l0aCBvcnBoYW4gdG9vbF91c2UgaXMgQ2FuY2VsbGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2RvIHdvcmsnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dS1vcnBoYW4nLCAnQmFzaCcsIHsgY29tbWFuZDogJ3NsZWVwIDEwMCcgfSksXG5cdFx0XHQvLyBubyBtYXRjaGluZyB0b29sX3Jlc3VsdCBcdTIwMTQgbW9kZWwgY3Jhc2hlZCBtaWQtdHVyblxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ2FuY2VsbGVkKTtcblx0fSk7XG5cblx0dGVzdCgnRml4dHVyZSA2Yjogb3JwaGFuIGluIHR1cm4gTiBkb2VzIE5PVCBjYW5jZWwgdHVybiBOKzEnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZmlyc3QnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUb29sVXNlKCdhMScsICd0dS1vcnBoYW4nLCAnQmFzaCcsIHt9KSxcblx0XHRcdC8vIG5vIHRvb2xfcmVzdWx0IGZvciB0dS1vcnBoYW5cblx0XHRcdG1ha2VVc2VyKCd1MicsICdzZWNvbmQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdjbGVhbiByZXBseScpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ2FuY2VsbGVkLCAndHVybiAxIGhhcyBvcnBoYW4nKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMV0uc3RhdGUsIFR1cm5TdGF0ZS5Db21wbGV0ZSwgJ3R1cm4gMiBoYXMgbm8gb3JwaGFuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2xhdGUgdG9vbCByZXN1bHRzIGRvIG5vdCBleHRlbmQgdGhlIGFjdGl2ZSB0dXJuIGR1cmF0aW9uJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ2ZpcnN0JywgJzIwMjYtMDctMDlUMTg6MDA6MDAuMDAwWicpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2ExJywgJ3R1LWxhdGUnLCAnQmFzaCcsIHt9LCAnMjAyNi0wNy0wOVQxODowMDowMS4wMDBaJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnc2Vjb25kJywgJzIwMjYtMDctMDlUMTg6MDA6MTAuMDAwWicpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ2NsZWFuIHJlcGx5JywgJzIwMjYtMDctMDlUMTg6MDA6MTIuMDAwWicpLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdsYXRlLXJlc3VsdCcsICd0dS1sYXRlJywgJ2RvbmUnLCBmYWxzZSwgJzIwMjYtMDctMDlUMTg6MDA6MjAuMDAwWicpLFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiB0dXJuLmR1cmF0aW9uKSwgWzFfMDAwLCAyXzAwMF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDc6IG5vbi1hbGxvd2xpc3RlZCBzeXN0ZW0gc3VidHlwZXMgYXJlIGRyb3BwZWQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZ28nKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdyZXBseScpLFxuXHRcdFx0bWFrZVN5c3RlbSgnczEnLCAnYXBpX3JldHJ5JywgJ3JldHJ5aW5nJyksXG5cdFx0XHRtYWtlU3lzdGVtKCdzMicsICdob29rX3N0YXJ0ZWQnLCAnaG9vayB4JyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRjb25zdCBzeXNQYXJ0cyA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHMuZmlsdGVyKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN5c1BhcnRzLmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgOTogQ0xJIHNsYXNoLWNvbW1hbmQgZWNobyBhbmQgbG9jYWwtY29tbWFuZC1zdGRvdXQgZW50cmllcyBhcmUgZHJvcHBlZCcsICgpID0+IHtcblx0XHQvLyBPbi1kaXNrIHNoYXBlIHZlcmlmaWVkIGVtcGlyaWNhbGx5IChjbGF1ZGUtaGlzdG9yeSBza2lsbCk6XG5cdFx0Ly8gdGhlIGAvbW9kZWxgIGVjaG8gbGFja3MgYGlzU3ludGhldGljYCAvIGBpc01ldGFgLCBjb250ZW50IGlzIGFcblx0XHQvLyByYXcgc3RyaW5nIHN0YXJ0aW5nIHdpdGggYDxjb21tYW5kLW5hbWU+YC4gU2FtZSBmb3IgdGhlXG5cdFx0Ly8gYDxsb2NhbC1jb21tYW5kLXN0ZG91dD5gIHBhaXJlZCBlbnRyeS5cblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICd3aGF0IG1vZGVsIGFyZSB5b3UnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdzb25uZXQnKSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0XHR1dWlkOiAnZWNoby0xJyxcblx0XHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogJzxjb21tYW5kLW5hbWU+L21vZGVsPC9jb21tYW5kLW5hbWU+XFxuICAgICAgICAgICAgPGNvbW1hbmQtbWVzc2FnZT5tb2RlbDwvY29tbWFuZC1tZXNzYWdlPlxcbiAgICAgICAgICAgIDxjb21tYW5kLWFyZ3M+Y2xhdWRlLW9wdXMtNC43PC9jb21tYW5kLWFyZ3M+JyB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0XHR1dWlkOiAnZWNoby0yJyxcblx0XHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogJzxsb2NhbC1jb21tYW5kLXN0ZG91dD5TZXQgbW9kZWwgdG8gY2xhdWRlLW9wdXMtNC43PC9sb2NhbC1jb21tYW5kLXN0ZG91dD4nIH0sXG5cdFx0XHR9LFxuXHRcdFx0bWFrZVVzZXIoJ3UyJywgJ2hvdyBhYm91dCBub3cnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdvcHVzJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAyLCAnQ0xJLWVjaG8gdXNlciBlbnZlbG9wZXMgbXVzdCBOT1Qgc3RhcnQgbmV3IHR1cm5zJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLmlkLCAndTEnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ubWVzc2FnZS50ZXh0LCAnd2hhdCBtb2RlbCBhcmUgeW91Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzFdLmlkLCAndTInKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMV0ubWVzc2FnZS50ZXh0LCAnaG93IGFib3V0IG5vdycpO1xuXHR9KTtcblxuXHR0ZXN0KCdGaXh0dXJlIDEwOiBwcm9tcHQtbGVzcyBzdWJhZ2VudCB0cmFuc2NyaXB0IChpbm5lciBtZXNzYWdlcykgbWFwcyB0byBvbmUgdHVybicsICgpID0+IHtcblx0XHQvLyBBIHN1YmFnZW50IHRyYW5zY3JpcHQgZnJvbSBgZ2V0U3ViYWdlbnRNZXNzYWdlc2AgY2FycmllcyBhXG5cdFx0Ly8gYHBhcmVudF90b29sX3VzZV9pZGAgb24gZXZlcnkgZW52ZWxvcGUgYW5kIGhhcyBOTyBzeW50aGV0aWMgc3Bhd25pbmdcblx0XHQvLyB1c2VyIHByb21wdCwgc28gaXQgb3BlbnMgZGlyZWN0bHkgd2l0aCBhbiBhc3Npc3RhbnQgbWVzc2FnZS4gVGhlXG5cdFx0Ly8gYnVpbGRlciBtdXN0IHN5bnRoZXNpemUgYW4gZW1wdHktcHJvbXB0IHR1cm4gcmF0aGVyIHRoYW4gZHJvcHBpbmcgdGhlXG5cdFx0Ly8gaW5uZXIgYXNzaXN0YW50IGNvbnRlbnQgKHdoaWNoIHdvdWxkIGxvc2UgdGhlIHdob2xlIHRyYW5zY3JpcHQgb25cblx0XHQvLyByZXBsYXkpLiBTaGFwZSBtaXJyb3JzIGEgcmVhbCBjYXB0dXJlZCBzdWJhZ2VudCB0cmFuc2NyaXB0LlxuXHRcdGNvbnN0IHBhcmVudCA9ICd0b29sdV9wYXJlbnQnO1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXNzaXN0YW50JywgdXVpZDogJ3NhMScsIHNlc3Npb25faWQ6ICdzZXNzLTEnLCBwYXJlbnRfdG9vbF91c2VfaWQ6IHBhcmVudCwgcGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0XHRtZXNzYWdlOiB7IGlkOiAnbXNnX3NhMScsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGhpbmtpbmcnLCB0aGlua2luZzogJ3BsYW5uaW5nJywgc2lnbmF0dXJlOiAnc2lnJyB9XSB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ2Fzc2lzdGFudCcsIHV1aWQ6ICdzYTInLCBzZXNzaW9uX2lkOiAnc2Vzcy0xJywgcGFyZW50X3Rvb2xfdXNlX2lkOiBwYXJlbnQsIHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyBpZDogJ21zZ19zYTInLCByb2xlOiAnYXNzaXN0YW50JywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfdXNlJywgaWQ6ICd0dV9pbm5lcicsIG5hbWU6ICdCYXNoJywgaW5wdXQ6IHsgY29tbWFuZDogJ2xzJyB9IH1dIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndXNlcicsIHV1aWQ6ICdzYTMnLCBzZXNzaW9uX2lkOiAnc2Vzcy0xJywgcGFyZW50X3Rvb2xfdXNlX2lkOiBwYXJlbnQsIHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdFx0bWVzc2FnZTogeyByb2xlOiAndXNlcicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0b29sX3Jlc3VsdCcsIHRvb2xfdXNlX2lkOiAndHVfaW5uZXInLCBjb250ZW50OiAnZmlsZS1hLnR4dFxcbmZpbGUtYi50eHQnIH1dIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXNzaXN0YW50JywgdXVpZDogJ3NhNCcsIHNlc3Npb25faWQ6ICdzZXNzLTEnLCBwYXJlbnRfdG9vbF91c2VfaWQ6IHBhcmVudCwgcGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0XHRtZXNzYWdlOiB7IGlkOiAnbXNnX3NhNCcsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdEb25lLiBTVUJBR0VOVF9PTkxZX01BUktFUl94eXonIH1dIH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCB0dXJucyA9IG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMobWVzc2FnZXMsIHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSwgJ2lubmVyIGFzc2lzdGFudCBtZXNzYWdlcyBtdXN0IGZvcm0gYSBzaW5nbGUgc3ludGhlc2l6ZWQgdHVybicpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5pZCwgJ3NhMScsICd0dXJuIGlkIGFuY2hvcnMgb24gdGhlIGZpcnN0IGlubmVyIGFzc2lzdGFudCBlbnZlbG9wZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5tZXNzYWdlLnRleHQsICcnLCAnc3ViYWdlbnQgdHVybiBoYXMgbm8gdXNlciBwcm9tcHQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0uc3RhdGUsIFR1cm5TdGF0ZS5Db21wbGV0ZSwgJ3Rvb2xfcmVzdWx0IGRyYWlucyB0aGUgcGVuZGluZyB0b29sX3VzZScpO1xuXHRcdGNvbnN0IG1hcmtkb3duID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maWx0ZXIocCA9PiBwLmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5vayhtYXJrZG93bi5zb21lKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duICYmIHAuY29udGVudC5pbmNsdWRlcygnU1VCQUdFTlRfT05MWV9NQVJLRVJfeHl6JykpLFxuXHRcdFx0J3RoZSBzdWJhZ2VudCBmaW5hbCB0ZXh0ICh3aXRoIG1hcmtlcikgbXVzdCBzdXJ2aXZlIHJlcGxheScpO1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbENhbGwgJiYgdG9vbENhbGwua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiB0b29sQ2FsbC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdCdpbm5lciBCYXNoIHRvb2wgY2FsbCBtdXN0IGJlIHJlY29uc3RydWN0ZWQgYXMgQ29tcGxldGVkJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ0ZpeHR1cmUgMTBiOiB0b3AtbGV2ZWwgYXNzaXN0YW50IGJlZm9yZSBhbnkgdXNlciBtZXNzYWdlIGlzIHJlY292ZXJlZCB1bmRlciBhIHBsYWNlaG9sZGVyIHByb21wdCcsICgpID0+IHtcblx0XHQvLyBBIHRydW5jYXRlZCB0cmFuc2NyaXB0IHNsaWNlICh0aGUgU0RLIHJldHVybnMgb25seSB0aGUgYnl0ZXMgYWZ0ZXJcblx0XHQvLyB0aGUgbGFzdCBjb21wYWN0IGJvdW5kYXJ5IGZvciBsYXJnZSBzZXNzaW9ucykgY2FuIG9wZW4gbWlkLXR1cm4sXG5cdFx0Ly8gd2l0aCB0aGUgdXNlciBwcm9tcHQgY3V0IG9mZi4gVGhlIHJlcGx5IG11c3Qgc3RpbGwgYmUgcmVjb3ZlcmVkIFx1MjAxNFxuXHRcdC8vIGRyb3BwaW5nIGl0IGVtcHRpZXMgdGhlIHdob2xlIGNoYXQgd2hlbiB0aGUgc2xpY2UgY29udGFpbnMgbm8gdXNlclxuXHRcdC8vIG1lc3NhZ2UgYXQgYWxsLlxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3Byb21wdGxlc3MgcmVwbHknKSxcblx0XHRcdG1ha2VVc2VyKCd1MScsICdoZWxsbycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ3dvcmxkJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCB0ZXh0OiB0dXJuLm1lc3NhZ2UudGV4dCB9KSksIFtcblx0XHRcdHsgaWQ6ICdhMScsIHRleHQ6IG1pc3NpbmdQcm9tcHRQbGFjZWhvbGRlcigpIH0sXG5cdFx0XHR7IGlkOiAndTEnLCB0ZXh0OiAnaGVsbG8nIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2EgdHJhbnNjcmlwdCBzbGljZSB3aXRoIG5vIHVzZXIgbWVzc2FnZSBhdCBhbGwgc3RpbGwgeWllbGRzIHR1cm5zJywgKCkgPT4ge1xuXHRcdC8vIFRoZSByZXBvcnRlZCBmYWlsdXJlIG1vZGU6IGV2ZXJ5IGVudmVsb3BlIGluIHRoZSBzbGljZSBiZWxvbmdlZCB0b1xuXHRcdC8vIG9uZSBsb25nIGFnZW50aWMgdHVybiB3aG9zZSBwcm9tcHQgd2FzIHRydW5jYXRlZCBhd2F5LCBzbyB0aGUgd2hvbGVcblx0XHQvLyBzZXNzaW9uIHJlcGxheWVkIGFzIHplcm8gdHVybnMgYW5kIHRoZSBjaGF0IHJlbmRlcmVkIGVtcHR5LlxuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2ExJywgJ3R1MScsICdCYXNoJywgeyBjb21tYW5kOiAnbHMnIH0pLFxuXHRcdFx0bWFrZVVzZXJUb29sUmVzdWx0KCdyMScsICd0dTEnLCAnZmlsZS50eHQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdkb25lJyksXG5cdFx0XTtcblxuXHRcdGNvbnN0IHR1cm5zID0gbWFwU2Vzc2lvbk1lc3NhZ2VzVG9UdXJucyhtZXNzYWdlcywgc2Vzc2lvbiwgbG9nU2VydmljZSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ubWVzc2FnZS50ZXh0LCBtaXNzaW5nUHJvbXB0UGxhY2Vob2xkZXIoKSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zWzBdLnN0YXRlLCBUdXJuU3RhdGUuQ29tcGxldGUpO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgncmVzb2x2ZUZvcmtBbmNob3JVdWlkJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGZ1bmN0aW9uIG1ha2VVc2VyKHV1aWQ6IHN0cmluZywgdGV4dDogc3RyaW5nKTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAndXNlcicsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0IH1dIH0sXG5cdFx0fTtcblx0fVxuXG5cdGZ1bmN0aW9uIG1ha2VBc3Npc3RhbnRUZXh0KHV1aWQ6IHN0cmluZywgdGV4dDogc3RyaW5nKTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnYXNzaXN0YW50Jyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgaWQ6IGBtc2dfJHt1dWlkfWAsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQgfV0gfSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gbWFrZUFzc2lzdGFudFRvb2xVc2UodXVpZDogc3RyaW5nLCB0b29sVXNlSWQ6IHN0cmluZywgbmFtZTogc3RyaW5nLCBpbnB1dDogdW5rbm93biA9IHt9KTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnYXNzaXN0YW50Jyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgaWQ6IGBtc2dfJHt1dWlkfWAsIHJvbGU6ICdhc3Npc3RhbnQnLCBjb250ZW50OiBbeyB0eXBlOiAndG9vbF91c2UnLCBpZDogdG9vbFVzZUlkLCBuYW1lLCBpbnB1dCB9XSB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlVXNlclRvb2xSZXN1bHQodXVpZDogc3RyaW5nLCB0b29sVXNlSWQ6IHN0cmluZywgdGV4dDogc3RyaW5nKTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAndXNlcicsXG5cdFx0XHR1dWlkLFxuXHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRwYXJlbnRfdG9vbF91c2VfaWQ6IG51bGwsXG5cdFx0XHRwYXJlbnRfYWdlbnRfaWQ6IG51bGwsXG5cdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogW3sgdHlwZTogJ3Rvb2xfcmVzdWx0JywgdG9vbF91c2VfaWQ6IHRvb2xVc2VJZCwgY29udGVudDogdGV4dCB9XSB9LFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBtYWtlU3lzdGVtKHV1aWQ6IHN0cmluZywgc3VidHlwZTogc3RyaW5nLCB0ZXh0Pzogc3RyaW5nKTogU2Vzc2lvbk1lc3NhZ2Uge1xuXHRcdHJldHVybiB7XG5cdFx0XHR0eXBlOiAnc3lzdGVtJyxcblx0XHRcdHV1aWQsXG5cdFx0XHRzZXNzaW9uX2lkOiAnc2Vzcy0xJyxcblx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdHBhcmVudF9hZ2VudF9pZDogbnVsbCxcblx0XHRcdG1lc3NhZ2U6IHsgc3VidHlwZSwgLi4uKHRleHQgIT09IHVuZGVmaW5lZCA/IHsgdGV4dCB9IDoge30pIH0sXG5cdFx0fTtcblx0fVxuXG5cdC8vIDMtdHVybiB0cmFuc2NyaXB0IHNoYXJlZCBieSB0aGUgZm9yay1wb3NpdGlvbiBmaXh0dXJlcy5cblx0Y29uc3QgdGhyZWVUdXJuczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRtYWtlVXNlcigndTEnLCAnYXBwbGUnKSxcblx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAnYXBwbGUhJyksXG5cdFx0bWFrZVVzZXIoJ3UyJywgJ2JhbmFuYScpLFxuXHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdiYW5hbmEhJyksXG5cdFx0bWFrZVVzZXIoJ3UzJywgJ2NoZXJyeScpLFxuXHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMycsICdjaGVycnkhJyksXG5cdF07XG5cblx0dGVzdCgnZm9yayBhdCB0dXJuIDAgXHUyMTkyIGxhc3QgYXNzaXN0YW50IHV1aWQgb2YgdHVybiAwJywgKCkgPT4ge1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQodGhyZWVUdXJucywgJ3UxJyksICdhMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdmb3JrIGF0IHR1cm4gMSBcdTIxOTIgbGFzdCBhc3Npc3RhbnQgdXVpZCBvZiB0dXJuIDEnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZCh0aHJlZVR1cm5zLCAndTInKSwgJ2EyJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2ZvcmsgYXQgdGhlIGxhc3QgdHVybiBcdTIxOTIgbGFzdCBhc3Npc3RhbnQgdXVpZCBvZiB0aGF0IHR1cm4nLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZCh0aHJlZVR1cm5zLCAndTMnKSwgJ2EzJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3R1cm4gd2l0aCBtdWx0aXBsZSBhc3Npc3RhbnQgZW52ZWxvcGVzIFx1MjE5MiB0aGUgTEFTVCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlVXNlcigndTEnLCAnZG8gYSB0aGluZycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ3RoaW5raW5nJyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VG9vbFVzZSgnYTInLCAndG9vbC0xJywgJ1JlYWQnKSxcblx0XHRcdG1ha2VVc2VyVG9vbFJlc3VsdCgncjEnLCAndG9vbC0xJywgJ2ZpbGUgY29udGVudHMnKSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICduZXh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTMnLCAnb2snKSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsICd1MScpLCAnYTInLCAnbXVzdCByZXR1cm4gdGhlIGxhc3QgYXNzaXN0YW50IGVudmVsb3BlIG9mIHRoZSB0YXJnZXQgdHVybicpO1xuXHR9KTtcblxuXHR0ZXN0KCd1c2VyLXRvb2wtcmVzdWx0cyBiZXR3ZWVuIGFzc2lzdGFudHMgZG9lcyBub3QgZmxpcCB0aGUgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdnbycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRvb2xVc2UoJ2ExJywgJ3Rvb2wtMScsICdSZWFkJyksXG5cdFx0XHRtYWtlVXNlclRvb2xSZXN1bHQoJ3IxJywgJ3Rvb2wtMScsICdjb250ZW50cycpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ2RvbmUnKSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICduZXh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTMnLCAnb2snKSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsICd1MScpLCAnYTInLCAndG9vbF9yZXN1bHQgZW52ZWxvcGUgbXVzdCBub3QgZW5kIHRoZSB0dXJuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5c3RlbS1ub3RpZmljYXRpb24gbWlkLXR1cm4gZG9lcyBub3QgZmxpcCB0aGUgdHVybicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdnbycpLFxuXHRcdFx0bWFrZVN5c3RlbSgnczEnLCAnY29tcGFjdF9ib3VuZGFyeScpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ2RvbmUnKSxcblx0XHRcdG1ha2VVc2VyKCd1MicsICduZXh0JyksXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTInLCAnb2snKSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsICd1MScpLCAnYTEnLCAnc3lzdGVtIG5vdGlmaWNhdGlvbiBtdXN0IG5vdCBlbmQgdGhlIHR1cm4nKTtcblx0fSk7XG5cblx0dGVzdCgndXNlci1vbmx5IHRhcmdldCB0dXJuIChubyBhc3Npc3RhbnQpIGhhcyBubyB2YWxpZCBmb3JrIGFuY2hvcicsICgpID0+IHtcblx0XHRjb25zdCBtZXNzYWdlczogU2Vzc2lvbk1lc3NhZ2VbXSA9IFtcblx0XHRcdG1ha2VVc2VyKCd1MScsICdhcHBsZScpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2ExJywgJ2FwcGxlIScpLFxuXHRcdFx0bWFrZVVzZXIoJ3UyJywgJ3VuYW5zd2VyZWQnKSxcblx0XHRdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNvbHZlRm9ya0FuY2hvclV1aWQobWVzc2FnZXMsICd1MicpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCd0dXJuSWQgbm90IGZvdW5kIFx1MjE5MiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZCh0aHJlZVR1cm5zLCAnbm9wZScpLCB1bmRlZmluZWQpO1xuXHR9KTtcblxuXHR0ZXN0KCdhIHByb21wdGxlc3MgbGVhZGluZyB0dXJuIGlzIGFuY2hvcmFibGUsIG1pcnJvcmluZyB0aGUgcmVwbGF5IGJ1aWxkZXInLCAoKSA9PiB7XG5cdFx0Ly8gVGhlIGJ1aWxkZXIgb3BlbnMgYSB0dXJuIGtleWVkIG9uIHRoZSBsZWFkaW5nIGFzc2lzdGFudCBlbnZlbG9wZSB3aGVuXG5cdFx0Ly8gdGhlIHByb21wdCBpcyBtaXNzaW5nIGZyb20gdGhlIHNsaWNlOyB0aGUgcmVzb2x2ZXIgbXVzdCBhZ3JlZSBvciBhXG5cdFx0Ly8gZm9yayBmcm9tIHRoYXQgdHVybiBjYW5ub3QgYmUgYW5jaG9yZWQuXG5cdFx0Y29uc3QgbWVzc2FnZXM6IFNlc3Npb25NZXNzYWdlW10gPSBbXG5cdFx0XHRtYWtlQXNzaXN0YW50VGV4dCgnYTEnLCAncHJvbXB0bGVzcyByZXBseScpLFxuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ25leHQnKSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMicsICdvaycpLFxuXHRcdF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZChtZXNzYWdlcywgJ2ExJyksICdhMScpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbXB0eSB0cmFuc2NyaXB0IFx1MjE5MiB1bmRlZmluZWQnLCAoKSA9PiB7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc29sdmVGb3JrQW5jaG9yVXVpZChbXSwgJ3UxJyksIHVuZGVmaW5lZCk7XG5cdH0pO1xuXG5cdHRlc3QoJ0NMSS1lY2hvIHVzZXIgZW52ZWxvcGVzIGFyZSBza2lwcGVkIGJ5IHRoZSBzaGFyZWQgcGFyc2VyJywgKCkgPT4ge1xuXHRcdGNvbnN0IG1lc3NhZ2VzOiBTZXNzaW9uTWVzc2FnZVtdID0gW1xuXHRcdFx0bWFrZVVzZXIoJ3UxJywgJ3doYXQgbW9kZWwnKSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3VzZXInLFxuXHRcdFx0XHR1dWlkOiAnZWNoby0xJyxcblx0XHRcdFx0c2Vzc2lvbl9pZDogJ3Nlc3MtMScsXG5cdFx0XHRcdHBhcmVudF90b29sX3VzZV9pZDogbnVsbCxcblx0XHRcdFx0cGFyZW50X2FnZW50X2lkOiBudWxsLFxuXHRcdFx0XHRtZXNzYWdlOiB7IHJvbGU6ICd1c2VyJywgY29udGVudDogJzxjb21tYW5kLW5hbWU+L21vZGVsPC9jb21tYW5kLW5hbWU+JyB9LFxuXHRcdFx0fSxcblx0XHRcdG1ha2VBc3Npc3RhbnRUZXh0KCdhMScsICdvcHVzJyksXG5cdFx0XHRtYWtlVXNlcigndTInLCAnbmV4dCcpLFxuXHRcdFx0bWFrZUFzc2lzdGFudFRleHQoJ2EyJywgJ29rJyksXG5cdFx0XTtcblx0XHQvLyBUaGUgQ0xJLWVjaG8gZW52ZWxvcGUgbXVzdCBub3QgYmUgdHJlYXRlZCBhcyB0aGUgc3RhcnQgb2YgYSBuZXcgdHVybixcblx0XHQvLyBzbyB0dXJuIHUxJ3MgYW5jaG9yIGlzIHN0aWxsIGExIChub3QgZWNoby0xLCBub3QgdW5kZWZpbmVkKS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzLCAndTEnKSwgJ2ExJyk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFNQSxPQUFPLFlBQVk7QUFDbkIsU0FBUywrQ0FBK0M7QUFDeEQsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQXNCO0FBQy9CLFNBQVMsa0JBQWtCLGdCQUFnQix1QkFBdUIsaUJBQWlCO0FBQ25GLFNBQVMsMkJBQTJC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
