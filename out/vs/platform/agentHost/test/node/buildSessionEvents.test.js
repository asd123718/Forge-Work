import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { generateUuid, isUUID } from "../../../../base/common/uuid.js";
import { AgentSession } from "../../common/agent.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { buildSessionEventLogFromTurns, buildSessionEventsFromTurns, serializeSessionEventsToJsonl } from "../../node/copilot/buildSessionEvents.js";
import { mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
suite("buildSessionEventsFromTurns \u2014 reverse of mapSessionEvents", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  const sessionId = "test-session";
  function markdown(content) {
    return { kind: ResponsePartKind.Markdown, id: "ignored", content };
  }
  function reasoning(content) {
    return { kind: ResponsePartKind.Reasoning, id: "ignored", content };
  }
  function toolCallPart(toolCallId, toolName, toolInput, resultText, opts) {
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Completed,
        toolCallId,
        toolName,
        displayName: toolName,
        invocationMessage: "",
        toolInput,
        success: opts?.success ?? true,
        pastTenseMessage: "",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        content: resultText ? [{ type: ToolResultContentType.Text, text: resultText }] : void 0,
        ...opts?.errorMessage ? { error: { message: opts.errorMessage } } : {}
      }
    };
  }
  function userTurn(id, text, responseParts) {
    return {
      id,
      message: { text, origin: { kind: MessageKind.User } },
      responseParts,
      usage: void 0,
      state: TurnState.Complete
    };
  }
  function subagentToolCallPart(toolCallId, toolName, agentName, description, resultText) {
    return {
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Completed,
        toolCallId,
        toolName,
        displayName: agentName,
        invocationMessage: "",
        toolInput: "",
        success: true,
        pastTenseMessage: "",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        content: [
          { type: ToolResultContentType.Text, text: resultText },
          { type: ToolResultContentType.Subagent, resource: `agent-host-subagent:/${toolCallId}`, title: agentName, agentName, description }
        ]
      }
    };
  }
  function project(turns) {
    return turns.map((turn) => ({
      id: turn.id,
      text: turn.message.text,
      originKind: turn.message.origin.kind,
      state: turn.state,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.Markdown || part.kind === ResponsePartKind.Reasoning ? { kind: part.kind, content: part.content } : { kind: part.kind })
    }));
  }
  test("round-trips text turns (prompt, markdown, reasoning) preserving UUID turn id, order and state", async () => {
    const idA = generateUuid();
    const idB = generateUuid();
    const turns = [
      userTurn(idA, "What is 2+2?", [markdown("It is 4.")]),
      userTurn(idB, "Explain why.", [reasoning("2 plus 2..."), markdown("Because arithmetic.")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("preserves interleaved markdown/reasoning order by splitting assistant messages", async () => {
    const id = generateUuid();
    const turns = [userTurn(id, "q", [markdown("A"), reasoning("R"), markdown("B")])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "assistant.message",
      "assistant.message"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("emits an abort for a cancelled turn so it reconstructs as cancelled with its text", async () => {
    const id = generateUuid();
    const turns = [{
      id,
      message: { text: "stop", origin: { kind: MessageKind.User } },
      responseParts: [markdown("partial answer")],
      usage: void 0,
      state: TurnState.Cancelled
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "abort"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
  test("round-trips a completed tool call interleaved with assistant text preserving order and identity", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [{
      id,
      message: { text: "run it", origin: { kind: MessageKind.User } },
      responseParts: [
        markdown("Let me run the tool."),
        toolCallPart(toolCallId, "bash", JSON.stringify({ command: "ls" }), "file1\nfile2"),
        markdown("Done.")
      ],
      usage: void 0,
      state: TurnState.Complete
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "tool.execution_start",
      "tool.execution_complete",
      "assistant.message"
    ]);
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const projected = reconstructed.map((turn) => ({
      id: turn.id,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.ToolCall ? {
        kind: part.kind,
        toolCallId: part.toolCall.toolCallId,
        toolName: part.toolCall.toolName,
        status: part.toolCall.status,
        success: part.toolCall.success,
        output: part.toolCall.content?.find((c) => c.type === ToolResultContentType.Text)?.text
      } : { kind: part.kind, content: part.content })
    }));
    assert.deepStrictEqual(projected, [{
      id,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Let me run the tool." },
        { kind: ResponsePartKind.ToolCall, toolCallId, toolName: "bash", status: ToolCallStatus.Completed, success: true, output: "file1\nfile2" },
        { kind: ResponsePartKind.Markdown, content: "Done." }
      ]
    }]);
  });
  test("omits array tool input from structured session event arguments", () => {
    const events = buildSessionEventsFromTurns([
      userTurn(generateUuid(), "run it", [toolCallPart(generateUuid(), "tool", '["one", "two"]', "")])
    ], { sessionId });
    const started = events.find((e) => e.type === "tool.execution_start");
    assert.ok(started && started.type === "tool.execution_start");
    assert.strictEqual(started.data.arguments, void 0);
  });
  test("round-trips a failed tool call preserving the error message", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [{
      id,
      message: { text: "run it", origin: { kind: MessageKind.User } },
      responseParts: [toolCallPart(toolCallId, "bash", "{}", "", { success: false, errorMessage: "boom" })],
      usage: void 0,
      state: TurnState.Complete
    }];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const complete = events.find((e) => e.type === "tool.execution_complete");
    assert.ok(complete && complete.type === "tool.execution_complete");
    assert.strictEqual(complete.data.success, false);
    assert.strictEqual(complete.data.error?.message, "boom");
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const toolPart = reconstructed[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
    assert.strictEqual(toolPart.toolCall.success, false);
    assert.strictEqual(toolPart.toolCall.error?.message, "boom");
  });
  test("emits subagent.started for a sub-agent tool call so the name/description survive the round-trip", async () => {
    const id = generateUuid();
    const toolCallId = generateUuid();
    const turns = [userTurn(id, "delegate", [subagentToolCallPart(toolCallId, "bash", "explore", "Explores the codebase", "found it")])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "subagent.started",
      "tool.execution_start",
      "tool.execution_complete"
    ]);
    const started = events.find((e) => e.type === "subagent.started");
    assert.ok(started && started.type === "subagent.started");
    assert.deepStrictEqual(
      { toolCallId: started.data.toolCallId, agentName: started.data.agentName, agentDescription: started.data.agentDescription },
      { toolCallId, agentName: "explore", agentDescription: "Explores the codebase" }
    );
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, events);
    const toolPart = reconstructed[0].responseParts.find((p) => p.kind === ResponsePartKind.ToolCall);
    assert.ok(toolPart && toolPart.kind === ResponsePartKind.ToolCall);
    const subagentContent = toolPart.toolCall.content?.find((c) => c.type === ToolResultContentType.Subagent);
    assert.ok(subagentContent && subagentContent.type === ToolResultContentType.Subagent);
    assert.deepStrictEqual(
      { agentName: subagentContent.agentName, description: subagentContent.description },
      { agentName: "explore", description: "Explores the codebase" }
    );
  });
  test("reuses a UUID turn id as the user.message envelope id, minting UUIDs for non-UUID ids", () => {
    const idA = generateUuid();
    const turns = [
      userTurn(idA, "first", [markdown("r1")]),
      userTurn("not-a-uuid", "second", [markdown("r2")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId, model: "gpt-5" });
    assert.deepStrictEqual(events.map((e) => e.type), [
      "session.start",
      "user.message",
      "assistant.message",
      "user.message",
      "assistant.message"
    ]);
    assert.strictEqual(events[0].parentId, null);
    for (let i = 1; i < events.length; i++) {
      assert.strictEqual(events[i].parentId, events[i - 1].id, `event ${i} must link to its predecessor`);
    }
    const userIds = events.filter((e) => e.type === "user.message").map((e) => e.id);
    assert.strictEqual(userIds[0], idA);
    assert.notStrictEqual(userIds[1], "not-a-uuid");
    assert.ok(events.every((e) => isUUID(e.id)), "all event ids must be UUIDs");
    const start = events[0];
    assert.strictEqual(start.type === "session.start" && start.data.sessionId, sessionId);
    assert.strictEqual(start.type === "session.start" && start.data.selectedModel, "gpt-5");
  });
  test("omits the assistant.message for a turn with no response content", async () => {
    const turns = [userTurn("turn-empty", "just a note", [])];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    assert.deepStrictEqual(events.map((e) => e.type), ["session.start", "user.message"]);
  });
  test("serializes to newline-terminated JSONL whose lines parse back to the same events", () => {
    const turns = [
      userTurn("turn-a", "What is 2+2?", [markdown("It is 4.")]),
      userTurn("turn-b", "Explain.", [reasoning("math"), markdown("Because arithmetic.")])
    ];
    const events = buildSessionEventsFromTurns(turns, { sessionId });
    const jsonl = serializeSessionEventsToJsonl(events);
    assert.ok(jsonl.endsWith("\n"), "jsonl must be newline-terminated");
    const lines = jsonl.split("\n").filter((line) => line.length > 0);
    assert.strictEqual(lines.length, events.length);
    assert.deepStrictEqual(lines.map((line) => JSON.parse(line)), events);
    assert.strictEqual(serializeSessionEventsToJsonl([]), "");
  });
  test("the on-disk JSONL bytes reconstruct the original turns end to end", async () => {
    const turns = [
      userTurn(generateUuid(), "What is 2+2?", [markdown("It is 4.")]),
      userTurn(generateUuid(), "Explain why.", [reasoning("2 plus 2..."), markdown("Because arithmetic.")])
    ];
    const jsonl = buildSessionEventLogFromTurns(turns, { sessionId });
    const parsed = jsonl.split("\n").filter((line) => line.length > 0).map((line) => JSON.parse(line));
    const { turns: reconstructed } = await mapSessionEvents(session, void 0, parsed);
    assert.deepStrictEqual(project(reconstructed), project(turns));
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxidWlsZFNlc3Npb25FdmVudHMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkLCBpc1VVSUQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsU3RhdHVzLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgdHlwZSBSZXNwb25zZVBhcnQsIHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSwgdHlwZSBUdXJuIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZFNlc3Npb25FdmVudExvZ0Zyb21UdXJucywgYnVpbGRTZXNzaW9uRXZlbnRzRnJvbVR1cm5zLCBzZXJpYWxpemVTZXNzaW9uRXZlbnRzVG9Kc29ubCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9idWlsZFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgbWFwU2Vzc2lvbkV2ZW50cyB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9tYXBTZXNzaW9uRXZlbnRzLmpzJztcbmltcG9ydCB0eXBlIHsgU2Vzc2lvbkV2ZW50IH0gZnJvbSAnQGdpdGh1Yi9jb3BpbG90LXNkayc7XG5cbnN1aXRlKCdidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnMgXHUyMDE0IHJldmVyc2Ugb2YgbWFwU2Vzc2lvbkV2ZW50cycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKTtcblx0Y29uc3Qgc2Vzc2lvbklkID0gJ3Rlc3Qtc2Vzc2lvbic7XG5cblx0ZnVuY3Rpb24gbWFya2Rvd24oY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0IHtcblx0XHRyZXR1cm4geyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ2lnbm9yZWQnLCBjb250ZW50IH07XG5cdH1cblxuXHRmdW5jdGlvbiByZWFzb25pbmcoY29udGVudDogc3RyaW5nKTogUmVzcG9uc2VQYXJ0IHtcblx0XHRyZXR1cm4geyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6ICdpZ25vcmVkJywgY29udGVudCB9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdG9vbENhbGxQYXJ0KHRvb2xDYWxsSWQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgdG9vbElucHV0OiBzdHJpbmcsIHJlc3VsdFRleHQ6IHN0cmluZywgb3B0cz86IHsgc3VjY2Vzcz86IGJvb2xlYW47IGVycm9yTWVzc2FnZT86IHN0cmluZyB9KTogUmVzcG9uc2VQYXJ0IHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IHRvb2xOYW1lLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJycsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0c3VjY2Vzczogb3B0cz8uc3VjY2VzcyA/PyB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdGNvbnRlbnQ6IHJlc3VsdFRleHQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogcmVzdWx0VGV4dCB9XSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0Li4uKG9wdHM/LmVycm9yTWVzc2FnZSA/IHsgZXJyb3I6IHsgbWVzc2FnZTogb3B0cy5lcnJvck1lc3NhZ2UgfSB9IDoge30pLFxuXHRcdFx0fSBzYXRpc2ZpZXMgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0XHR9O1xuXHR9XG5cblx0ZnVuY3Rpb24gdXNlclR1cm4oaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nLCByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXSk6IFR1cm4ge1xuXHRcdHJldHVybiB7XG5cdFx0XHRpZCxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0cyxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdH07XG5cdH1cblxuXHRmdW5jdGlvbiBzdWJhZ2VudFRvb2xDYWxsUGFydCh0b29sQ2FsbElkOiBzdHJpbmcsIHRvb2xOYW1lOiBzdHJpbmcsIGFnZW50TmFtZTogc3RyaW5nLCBkZXNjcmlwdGlvbjogc3RyaW5nLCByZXN1bHRUZXh0OiBzdHJpbmcpOiBSZXNwb25zZVBhcnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogYWdlbnROYW1lLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJycsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICcnLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IHJlc3VsdFRleHQgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCwgcmVzb3VyY2U6IGBhZ2VudC1ob3N0LXN1YmFnZW50Oi8ke3Rvb2xDYWxsSWR9YCwgdGl0bGU6IGFnZW50TmFtZSwgYWdlbnROYW1lLCBkZXNjcmlwdGlvbiB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSBzYXRpc2ZpZXMgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0XHR9O1xuXHR9XG5cblx0LyoqXG5cdCAqIFByb2plY3Rpb24gdGhhdCBpZ25vcmVzIG5vbi1kZXRlcm1pbmlzdGljIHJlc3BvbnNlLXBhcnQgaWRzIHNvIHJvdW5kLXRyaXBzXG5cdCAqIGFyZSBjb21wYXJhYmxlLiBUaGUgdHVybiBpZCBpcyBwcmVzZXJ2ZWQgKGEgVVVJRCBpZCByb3VuZC10cmlwcyB0aHJvdWdoIHRoZVxuXHQgKiBldmVudCBsb2cpLCBzbyBpdCBpcyBpbmNsdWRlZC5cblx0ICovXG5cdGZ1bmN0aW9uIHByb2plY3QodHVybnM6IHJlYWRvbmx5IFR1cm5bXSkge1xuXHRcdHJldHVybiB0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHR0ZXh0OiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdG9yaWdpbktpbmQ6IHR1cm4ubWVzc2FnZS5vcmlnaW4ua2luZCxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PlxuXHRcdFx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gfHwgcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ1xuXHRcdFx0XHRcdD8geyBraW5kOiBwYXJ0LmtpbmQsIGNvbnRlbnQ6IHBhcnQuY29udGVudCB9XG5cdFx0XHRcdFx0OiB7IGtpbmQ6IHBhcnQua2luZCB9KSxcblx0XHR9KSk7XG5cdH1cblxuXHR0ZXN0KCdyb3VuZC10cmlwcyB0ZXh0IHR1cm5zIChwcm9tcHQsIG1hcmtkb3duLCByZWFzb25pbmcpIHByZXNlcnZpbmcgVVVJRCB0dXJuIGlkLCBvcmRlciBhbmQgc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaWRBID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgaWRCID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFtcblx0XHRcdHVzZXJUdXJuKGlkQSwgJ1doYXQgaXMgMisyPycsIFttYXJrZG93bignSXQgaXMgNC4nKV0pLFxuXHRcdFx0dXNlclR1cm4oaWRCLCAnRXhwbGFpbiB3aHkuJywgW3JlYXNvbmluZygnMiBwbHVzIDIuLi4nKSwgbWFya2Rvd24oJ0JlY2F1c2UgYXJpdGhtZXRpYy4nKV0pLFxuXHRcdF07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGNvbnN0IHsgdHVybnM6IHJlY29uc3RydWN0ZWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9qZWN0KHJlY29uc3RydWN0ZWQpLCBwcm9qZWN0KHR1cm5zKSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBpbnRlcmxlYXZlZCBtYXJrZG93bi9yZWFzb25pbmcgb3JkZXIgYnkgc3BsaXR0aW5nIGFzc2lzdGFudCBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBpZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbdXNlclR1cm4oaWQsICdxJywgW21hcmtkb3duKCdBJyksIHJlYXNvbmluZygnUicpLCBtYXJrZG93bignQicpXSldO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gYnVpbGRTZXNzaW9uRXZlbnRzRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZCB9KTtcblxuXHRcdC8vIEludGVybGVhdmVkIHJlYXNvbmluZy9tYXJrZG93biBtdXN0IG5vdCBtZXJnZSBpbnRvIG9uZSBhc3Npc3RhbnQubWVzc2FnZVxuXHRcdC8vICh3aGljaCB0aGUgcmV2ZXJzZSBtYXBwZXIgd291bGQgcmVvcmRlciBhcyByZWFzb25pbmctdGhlbi1jb250ZW50KS5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLCBbXG5cdFx0XHQnc2Vzc2lvbi5zdGFydCcsXG5cdFx0XHQndXNlci5tZXNzYWdlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHQnYXNzaXN0YW50Lm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRdKTtcblxuXHRcdGNvbnN0IHsgdHVybnM6IHJlY29uc3RydWN0ZWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocHJvamVjdChyZWNvbnN0cnVjdGVkKSwgcHJvamVjdCh0dXJucykpO1xuXHR9KTtcblxuXHR0ZXN0KCdlbWl0cyBhbiBhYm9ydCBmb3IgYSBjYW5jZWxsZWQgdHVybiBzbyBpdCByZWNvbnN0cnVjdHMgYXMgY2FuY2VsbGVkIHdpdGggaXRzIHRleHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3tcblx0XHRcdGlkLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnc3RvcCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFttYXJrZG93bigncGFydGlhbCBhbnN3ZXInKV0sXG5cdFx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5DYW5jZWxsZWQsXG5cdFx0fV07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Ly8gVGhlIGFib3J0IHRyYWlscyB0aGUgYWxyZWFkeS1mbHVzaGVkIGFzc2lzdGFudCBjb250ZW50LlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFtcblx0XHRcdCdzZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J2Fzc2lzdGFudC5tZXNzYWdlJyxcblx0XHRcdCdhYm9ydCcsXG5cdFx0XSk7XG5cblx0XHRjb25zdCB7IHR1cm5zOiByZWNvbnN0cnVjdGVkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3QocmVjb25zdHJ1Y3RlZCksIHByb2plY3QodHVybnMpKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBjb21wbGV0ZWQgdG9vbCBjYWxsIGludGVybGVhdmVkIHdpdGggYXNzaXN0YW50IHRleHQgcHJlc2VydmluZyBvcmRlciBhbmQgaWRlbnRpdHknLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFt7XG5cdFx0XHRpZCxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFtcblx0XHRcdFx0bWFya2Rvd24oJ0xldCBtZSBydW4gdGhlIHRvb2wuJyksXG5cdFx0XHRcdHRvb2xDYWxsUGFydCh0b29sQ2FsbElkLCAnYmFzaCcsIEpTT04uc3RyaW5naWZ5KHsgY29tbWFuZDogJ2xzJyB9KSwgJ2ZpbGUxXFxuZmlsZTInKSxcblx0XHRcdFx0bWFya2Rvd24oJ0RvbmUuJyksXG5cdFx0XHRdLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fV07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Ly8gVGhlIHRvb2wgY2FsbCBiZWNvbWVzIGEgc3RhcnQgKyBjb21wbGV0ZSBwYWlyLCB3aXRoIGFzc2lzdGFudCB0ZXh0XG5cdFx0Ly8gZmx1c2hlZCBiZWZvcmUgYW5kIGFmdGVyIGl0IGFzIHNlcGFyYXRlIGFzc2lzdGFudC5tZXNzYWdlIGV2ZW50cy5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLCBbXG5cdFx0XHQnc2Vzc2lvbi5zdGFydCcsXG5cdFx0XHQndXNlci5tZXNzYWdlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHQndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0J3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XSk7XG5cblx0XHRjb25zdCB7IHR1cm5zOiByZWNvbnN0cnVjdGVkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRjb25zdCBwcm9qZWN0ZWQgPSByZWNvbnN0cnVjdGVkLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHBhcnRzOiB0dXJuLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsXG5cdFx0XHRcdD8ge1xuXHRcdFx0XHRcdGtpbmQ6IHBhcnQua2luZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQsXG5cdFx0XHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0XHRzdWNjZXNzOiAocGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5zdWNjZXNzLFxuXHRcdFx0XHRcdG91dHB1dDogKHBhcnQudG9vbENhbGwgYXMgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSkuY29udGVudD8uZmluZChjID0+IGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpPy50ZXh0LFxuXHRcdFx0XHR9XG5cdFx0XHRcdDogeyBraW5kOiBwYXJ0LmtpbmQsIGNvbnRlbnQ6IChwYXJ0IGFzIHsgY29udGVudDogc3RyaW5nIH0pLmNvbnRlbnQgfSksXG5cdFx0fSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwcm9qZWN0ZWQsIFt7XG5cdFx0XHRpZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0xldCBtZSBydW4gdGhlIHRvb2wuJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsSWQsIHRvb2xOYW1lOiAnYmFzaCcsIHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLCBzdWNjZXNzOiB0cnVlLCBvdXRwdXQ6ICdmaWxlMVxcbmZpbGUyJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdEb25lLicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdvbWl0cyBhcnJheSB0b29sIGlucHV0IGZyb20gc3RydWN0dXJlZCBzZXNzaW9uIGV2ZW50IGFyZ3VtZW50cycsICgpID0+IHtcblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnMoW1xuXHRcdFx0dXNlclR1cm4oZ2VuZXJhdGVVdWlkKCksICdydW4gaXQnLCBbdG9vbENhbGxQYXJ0KGdlbmVyYXRlVXVpZCgpLCAndG9vbCcsICdbXCJvbmVcIiwgXCJ0d29cIl0nLCAnJyldKSxcblx0XHRdLCB7IHNlc3Npb25JZCB9KTtcblx0XHRjb25zdCBzdGFydGVkID0gZXZlbnRzLmZpbmQoZSA9PiBlLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcpO1xuXG5cdFx0YXNzZXJ0Lm9rKHN0YXJ0ZWQgJiYgc3RhcnRlZC50eXBlID09PSAndG9vbC5leGVjdXRpb25fc3RhcnQnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnRlZC5kYXRhLmFyZ3VtZW50cywgdW5kZWZpbmVkKTtcblx0fSk7XG5cblx0dGVzdCgncm91bmQtdHJpcHMgYSBmYWlsZWQgdG9vbCBjYWxsIHByZXNlcnZpbmcgdGhlIGVycm9yIG1lc3NhZ2UnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFt7XG5cdFx0XHRpZCxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ3J1biBpdCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IFt0b29sQ2FsbFBhcnQodG9vbENhbGxJZCwgJ2Jhc2gnLCAne30nLCAnJywgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3JNZXNzYWdlOiAnYm9vbScgfSldLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0fV07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXHRcdGNvbnN0IGNvbXBsZXRlID0gZXZlbnRzLmZpbmQoZSA9PiBlLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScpO1xuXHRcdGFzc2VydC5vayhjb21wbGV0ZSAmJiBjb21wbGV0ZS50eXBlID09PSAndG9vbC5leGVjdXRpb25fY29tcGxldGUnKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUuZGF0YS5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbXBsZXRlLmRhdGEuZXJyb3I/Lm1lc3NhZ2UsICdib29tJyk7XG5cblx0XHRjb25zdCB7IHR1cm5zOiByZWNvbnN0cnVjdGVkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRjb25zdCB0b29sUGFydCA9IHJlY29uc3RydWN0ZWRbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQub2sodG9vbFBhcnQgJiYgdG9vbFBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b29sUGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5zdWNjZXNzLCBmYWxzZSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKCh0b29sUGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5lcnJvcj8ubWVzc2FnZSwgJ2Jvb20nKTtcblx0fSk7XG5cblx0dGVzdCgnZW1pdHMgc3ViYWdlbnQuc3RhcnRlZCBmb3IgYSBzdWItYWdlbnQgdG9vbCBjYWxsIHNvIHRoZSBuYW1lL2Rlc2NyaXB0aW9uIHN1cnZpdmUgdGhlIHJvdW5kLXRyaXAnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgaWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdHVybnM6IFR1cm5bXSA9IFt1c2VyVHVybihpZCwgJ2RlbGVnYXRlJywgW3N1YmFnZW50VG9vbENhbGxQYXJ0KHRvb2xDYWxsSWQsICdiYXNoJywgJ2V4cGxvcmUnLCAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJywgJ2ZvdW5kIGl0JyldKV07XG5cblx0XHRjb25zdCBldmVudHMgPSBidWlsZFNlc3Npb25FdmVudHNGcm9tVHVybnModHVybnMsIHsgc2Vzc2lvbklkIH0pO1xuXG5cdFx0Ly8gYHN1YmFnZW50LnN0YXJ0ZWRgIHByZWNlZGVzIHRoZSB0b29sIGV4ZWN1dGlvbiBwYWlyIHNvIGEgcmVzdW1lIGFwcGxpZXNcblx0XHQvLyB0aGUgc3ViLWFnZW50IGlkZW50aXR5IHRvIHRoZSBwYXJlbnQgdG9vbCBjYWxsLlxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZXZlbnRzLm1hcChlID0+IGUudHlwZSksIFtcblx0XHRcdCdzZXNzaW9uLnN0YXJ0Jyxcblx0XHRcdCd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0J3N1YmFnZW50LnN0YXJ0ZWQnLFxuXHRcdFx0J3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdCd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XSk7XG5cdFx0Y29uc3Qgc3RhcnRlZCA9IGV2ZW50cy5maW5kKGUgPT4gZS50eXBlID09PSAnc3ViYWdlbnQuc3RhcnRlZCcpO1xuXHRcdGFzc2VydC5vayhzdGFydGVkICYmIHN0YXJ0ZWQudHlwZSA9PT0gJ3N1YmFnZW50LnN0YXJ0ZWQnKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0eyB0b29sQ2FsbElkOiBzdGFydGVkLmRhdGEudG9vbENhbGxJZCwgYWdlbnROYW1lOiBzdGFydGVkLmRhdGEuYWdlbnROYW1lLCBhZ2VudERlc2NyaXB0aW9uOiBzdGFydGVkLmRhdGEuYWdlbnREZXNjcmlwdGlvbiB9LFxuXHRcdFx0eyB0b29sQ2FsbElkLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScgfSxcblx0XHQpO1xuXG5cdFx0Y29uc3QgeyB0dXJuczogcmVjb25zdHJ1Y3RlZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0Y29uc3QgdG9vbFBhcnQgPSByZWNvbnN0cnVjdGVkWzBdLnJlc3BvbnNlUGFydHMuZmluZChwID0+IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0Lm9rKHRvb2xQYXJ0ICYmIHRvb2xQYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpO1xuXHRcdGNvbnN0IHN1YmFnZW50Q29udGVudCA9ICh0b29sUGFydC50b29sQ2FsbCBhcyBUb29sQ2FsbENvbXBsZXRlZFN0YXRlKS5jb250ZW50Py5maW5kKGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpO1xuXHRcdGFzc2VydC5vayhzdWJhZ2VudENvbnRlbnQgJiYgc3ViYWdlbnRDb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdHsgYWdlbnROYW1lOiBzdWJhZ2VudENvbnRlbnQuYWdlbnROYW1lLCBkZXNjcmlwdGlvbjogc3ViYWdlbnRDb250ZW50LmRlc2NyaXB0aW9uIH0sXG5cdFx0XHR7IGFnZW50TmFtZTogJ2V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScgfSxcblx0XHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXVzZXMgYSBVVUlEIHR1cm4gaWQgYXMgdGhlIHVzZXIubWVzc2FnZSBlbnZlbG9wZSBpZCwgbWludGluZyBVVUlEcyBmb3Igbm9uLVVVSUQgaWRzJywgKCkgPT4ge1xuXHRcdGNvbnN0IGlkQSA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybihpZEEsICdmaXJzdCcsIFttYXJrZG93bigncjEnKV0pLFxuXHRcdFx0dXNlclR1cm4oJ25vdC1hLXV1aWQnLCAnc2Vjb25kJywgW21hcmtkb3duKCdyMicpXSksXG5cdFx0XTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQsIG1vZGVsOiAnZ3B0LTUnIH0pO1xuXG5cdFx0Ly8gU2hhcGU6IHNlc3Npb24uc3RhcnQsICh1c2VyLm1lc3NhZ2UsIGFzc2lzdGFudC5tZXNzYWdlKSB4Mi5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLCBbXG5cdFx0XHQnc2Vzc2lvbi5zdGFydCcsXG5cdFx0XHQndXNlci5tZXNzYWdlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHQndXNlci5tZXNzYWdlJyxcblx0XHRcdCdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XSk7XG5cblx0XHQvLyBGaXJzdCBldmVudCByb290cyB0aGUgY2hhaW47IGV2ZXJ5IHN1YnNlcXVlbnQgZXZlbnQgbGlua3MgdG8gaXRzIHByZWRlY2Vzc29yLlxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudHNbMF0ucGFyZW50SWQsIG51bGwpO1xuXHRcdGZvciAobGV0IGkgPSAxOyBpIDwgZXZlbnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnRzW2ldLnBhcmVudElkLCBldmVudHNbaSAtIDFdLmlkLCBgZXZlbnQgJHtpfSBtdXN0IGxpbmsgdG8gaXRzIHByZWRlY2Vzc29yYCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdXNlcklkcyA9IGV2ZW50cy5maWx0ZXIoZSA9PiBlLnR5cGUgPT09ICd1c2VyLm1lc3NhZ2UnKS5tYXAoZSA9PiBlLmlkKTtcblx0XHQvLyBUaGUgVVVJRCBpZCBpcyByZXVzZWQgdmVyYmF0aW07IHRoZSBub24tVVVJRCBpZCBpcyByZXBsYWNlZCB3aXRoIGEgbWludGVkIFVVSUQuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzZXJJZHNbMF0sIGlkQSk7XG5cdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKHVzZXJJZHNbMV0sICdub3QtYS11dWlkJyk7XG5cdFx0YXNzZXJ0Lm9rKGV2ZW50cy5ldmVyeShlID0+IGlzVVVJRChlLmlkKSksICdhbGwgZXZlbnQgaWRzIG11c3QgYmUgVVVJRHMnKTtcblxuXHRcdC8vIHNlc3Npb24uc3RhcnQgY2FycmllcyB0aGUgc2Vzc2lvbiBpZCBhbmQgc2VsZWN0ZWQgbW9kZWwuXG5cdFx0Y29uc3Qgc3RhcnQgPSBldmVudHNbMF07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LnR5cGUgPT09ICdzZXNzaW9uLnN0YXJ0JyAmJiBzdGFydC5kYXRhLnNlc3Npb25JZCwgc2Vzc2lvbklkKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudHlwZSA9PT0gJ3Nlc3Npb24uc3RhcnQnICYmIHN0YXJ0LmRhdGEuc2VsZWN0ZWRNb2RlbCwgJ2dwdC01Jyk7XG5cdH0pO1xuXG5cdHRlc3QoJ29taXRzIHRoZSBhc3Npc3RhbnQubWVzc2FnZSBmb3IgYSB0dXJuIHdpdGggbm8gcmVzcG9uc2UgY29udGVudCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW3VzZXJUdXJuKCd0dXJuLWVtcHR5JywgJ2p1c3QgYSBub3RlJywgW10pXTtcblxuXHRcdGNvbnN0IGV2ZW50cyA9IGJ1aWxkU2Vzc2lvbkV2ZW50c0Zyb21UdXJucyh0dXJucywgeyBzZXNzaW9uSWQgfSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGV2ZW50cy5tYXAoZSA9PiBlLnR5cGUpLCBbJ3Nlc3Npb24uc3RhcnQnLCAndXNlci5tZXNzYWdlJ10pO1xuXHR9KTtcblxuXHR0ZXN0KCdzZXJpYWxpemVzIHRvIG5ld2xpbmUtdGVybWluYXRlZCBKU09OTCB3aG9zZSBsaW5lcyBwYXJzZSBiYWNrIHRvIHRoZSBzYW1lIGV2ZW50cycsICgpID0+IHtcblx0XHRjb25zdCB0dXJuczogVHVybltdID0gW1xuXHRcdFx0dXNlclR1cm4oJ3R1cm4tYScsICdXaGF0IGlzIDIrMj8nLCBbbWFya2Rvd24oJ0l0IGlzIDQuJyldKSxcblx0XHRcdHVzZXJUdXJuKCd0dXJuLWInLCAnRXhwbGFpbi4nLCBbcmVhc29uaW5nKCdtYXRoJyksIG1hcmtkb3duKCdCZWNhdXNlIGFyaXRobWV0aWMuJyldKSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgZXZlbnRzID0gYnVpbGRTZXNzaW9uRXZlbnRzRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZCB9KTtcblx0XHRjb25zdCBqc29ubCA9IHNlcmlhbGl6ZVNlc3Npb25FdmVudHNUb0pzb25sKGV2ZW50cyk7XG5cblx0XHQvLyBPbmUgSlNPTiBvYmplY3QgcGVyIGxpbmUsIHRlcm1pbmF0ZWQgYnkgYSB0cmFpbGluZyBuZXdsaW5lLlxuXHRcdGFzc2VydC5vayhqc29ubC5lbmRzV2l0aCgnXFxuJyksICdqc29ubCBtdXN0IGJlIG5ld2xpbmUtdGVybWluYXRlZCcpO1xuXHRcdGNvbnN0IGxpbmVzID0ganNvbmwuc3BsaXQoJ1xcbicpLmZpbHRlcihsaW5lID0+IGxpbmUubGVuZ3RoID4gMCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGxpbmVzLmxlbmd0aCwgZXZlbnRzLmxlbmd0aCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChsaW5lcy5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpKSwgZXZlbnRzKTtcblxuXHRcdC8vIEVtcHR5IGlucHV0IHNlcmlhbGl6ZXMgdG8gdGhlIGVtcHR5IHN0cmluZy5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplU2Vzc2lvbkV2ZW50c1RvSnNvbmwoW10pLCAnJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ3RoZSBvbi1kaXNrIEpTT05MIGJ5dGVzIHJlY29uc3RydWN0IHRoZSBvcmlnaW5hbCB0dXJucyBlbmQgdG8gZW5kJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXG5cdFx0XHR1c2VyVHVybihnZW5lcmF0ZVV1aWQoKSwgJ1doYXQgaXMgMisyPycsIFttYXJrZG93bignSXQgaXMgNC4nKV0pLFxuXHRcdFx0dXNlclR1cm4oZ2VuZXJhdGVVdWlkKCksICdFeHBsYWluIHdoeS4nLCBbcmVhc29uaW5nKCcyIHBsdXMgMi4uLicpLCBtYXJrZG93bignQmVjYXVzZSBhcml0aG1ldGljLicpXSksXG5cdFx0XTtcblxuXHRcdC8vIEZ1bGwgcGF0aCBhIHJlYWwgaW1wb3J0IHRha2VzOiB0dXJucyAtPiBldmVudHMuanNvbmwgc3RyaW5nIC0+ICh3cml0ZSB0byBkaXNrKSAtPlxuXHRcdC8vIHBhcnNlIGVhY2ggbGluZSAtPiByZWNvbnN0cnVjdCB0dXJucy5cblx0XHRjb25zdCBqc29ubCA9IGJ1aWxkU2Vzc2lvbkV2ZW50TG9nRnJvbVR1cm5zKHR1cm5zLCB7IHNlc3Npb25JZCB9KTtcblx0XHRjb25zdCBwYXJzZWQgPSBqc29ubC5zcGxpdCgnXFxuJykuZmlsdGVyKGxpbmUgPT4gbGluZS5sZW5ndGggPiAwKS5tYXAobGluZSA9PiBKU09OLnBhcnNlKGxpbmUpIGFzIFNlc3Npb25FdmVudCk7XG5cdFx0Y29uc3QgeyB0dXJuczogcmVjb25zdHJ1Y3RlZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHBhcnNlZCk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHByb2plY3QocmVjb25zdHJ1Y3RlZCksIHByb2plY3QodHVybnMpKTtcblx0fSk7XG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLE9BQU8sWUFBWTtBQUNuQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLGNBQWMsY0FBYztBQUNyQyxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGFBQWEsa0JBQWtCLDRCQUE0QixnQkFBZ0IsdUJBQXVCLGlCQUE0RTtBQUN2TCxTQUFTLCtCQUErQiw2QkFBNkIscUNBQXFDO0FBQzFHLFNBQVMsd0JBQXdCO0FBR2pDLE1BQU0sa0VBQTZELE1BQU07QUFFeEUsMENBQXdDO0FBRXhDLFFBQU0sVUFBVSxhQUFhLElBQUksV0FB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
