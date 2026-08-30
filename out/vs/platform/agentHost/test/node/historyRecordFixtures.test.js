import assert from "assert";
import { DisposableStore } from "../../../../base/common/lifecycle.js";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { AgentSession } from "../../common/agent.js";
import { FileEditKind, MessageKind, ResponsePartKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { SessionDatabase } from "../../node/sessionDatabase.js";
import { parseSessionDbUri } from "../../common/sessionDbUri.js";
import { mapSessionEventsToHistoryRecords } from "./historyRecordFixtures.js";
import { mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
import { toSessionEvents } from "./copilotTestEvents.js";
suite("mapSessionEventsToHistoryRecords", () => {
  const disposables = new DisposableStore();
  let db;
  const session = AgentSession.uri("copilot", "test-session");
  teardown(async () => {
    disposables.clear();
    await db?.close();
  });
  ensureNoDisposablesAreLeakedInTestSuite();
  test("maps user and assistant messages", async () => {
    const events = [
      { type: "user.message", data: { messageId: "msg-1", content: "hello" } },
      { type: "assistant.message", data: { messageId: "msg-2", content: "world" } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result[0], {
      session,
      type: "message",
      role: "user",
      messageId: "msg-1",
      content: "hello",
      toolRequests: void 0,
      reasoningOpaque: void 0,
      reasoningText: void 0,
      encryptedContent: void 0,
      parentToolCallId: void 0
    });
    assert.strictEqual(result[1].type, "message");
    assert.strictEqual(result[1].role, "assistant");
  });
  test("maps tool start and complete events", async () => {
    const events = [
      {
        type: "tool.execution_start",
        data: { toolCallId: "tc-1", toolName: "shell", arguments: { command: "echo hi" } }
      },
      {
        type: "tool.execution_complete",
        data: { toolCallId: "tc-1", success: true, result: { content: "hi\n" } }
      }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].type, "tool_start");
    assert.strictEqual(result[1].type, "tool_complete");
    const complete = result[1];
    assert.ok(complete.result.content);
    assert.strictEqual(complete.result.content[0].type, ToolResultContentType.Text);
  });
  test("maps task_complete to a root markdown response part", async () => {
    const events = [
      { type: "user.message", id: "turn-1", data: { messageId: "msg-1", content: "finish this" } },
      { type: "tool.execution_start", data: { toolCallId: "tc-read", toolName: "view", arguments: { path: "/workspace/index.html" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-read", success: true, result: { content: "file contents" } } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task-complete", toolName: "task_complete", arguments: { summary: "Reviewed index.html." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task-complete", success: true, result: { content: "Reviewed index.html." } } }
    ];
    const result = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(result.turns.map((turn) => ({
      message: turn.message,
      state: turn.state,
      parts: turn.responseParts.map((part) => part.kind === ResponsePartKind.ToolCall ? {
        kind: part.kind,
        toolName: part.toolCall.toolName
      } : {
        kind: part.kind,
        content: part.kind === ResponsePartKind.Markdown ? part.content : void 0
      })
    })), [{
      message: { text: "finish this", origin: { kind: MessageKind.User } },
      state: "complete",
      parts: [
        { kind: ResponsePartKind.ToolCall, toolName: "view" },
        { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Reviewed index.html." }
      ]
    }]);
  });
  test("drops orphan task_complete without synthesizing a turn", async () => {
    const events = [
      { type: "tool.execution_start", data: { toolCallId: "tc-task-complete", toolName: "task_complete", arguments: { summary: "Done." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task-complete", success: true, result: { content: "Done." } } }
    ];
    const result = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(result.turns, []);
  });
  test("skips tool_complete without matching tool_start", async () => {
    const events = [
      { type: "tool.execution_complete", data: { toolCallId: "orphan", success: true } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 0);
  });
  test("ignores unknown event types", async () => {
    const events = [
      { type: "some.unknown.event", data: {} },
      { type: "user.message", data: { messageId: "msg-1", content: "test" } }
    ];
    const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
    assert.strictEqual(result.length, 1);
  });
  suite("file edit restoration", () => {
    test("restores file edits from database for edit tools", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-edit",
        filePath: "/workspace/file.ts",
        kind: FileEditKind.Edit,
        beforeContent: new TextEncoder().encode("before"),
        afterContent: new TextEncoder().encode("after"),
        addedLines: 3,
        removedLines: 1
      });
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-edit", toolName: "edit", arguments: { filePath: "/workspace/file.ts" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-edit", success: true, result: { content: "Edited file.ts" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const complete = result[1];
      assert.strictEqual(complete.type, "tool_complete");
      const content = complete.result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 2);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
      assert.strictEqual(content[1].type, ToolResultContentType.FileEdit);
      const fileEdit = content[1];
      const beforeFields = parseSessionDbUri(fileEdit.before.content.uri);
      assert.ok(beforeFields);
      assert.strictEqual(beforeFields.toolCallId, "tc-edit");
      assert.strictEqual(beforeFields.filePath, "/workspace/file.ts");
      assert.strictEqual(beforeFields.part, "before");
      assert.deepStrictEqual(fileEdit.diff, { added: 3, removed: 1 });
    });
    test("handles multiple file edits for one tool call", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      await db.createTurn("turn-1");
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-multi",
        filePath: "/workspace/a.ts",
        kind: FileEditKind.Edit,
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("a"),
        addedLines: void 0,
        removedLines: void 0
      });
      await db.storeFileEdit({
        turnId: "turn-1",
        toolCallId: "tc-multi",
        filePath: "/workspace/b.ts",
        kind: FileEditKind.Edit,
        beforeContent: new Uint8Array(0),
        afterContent: new TextEncoder().encode("b"),
        addedLines: void 0,
        removedLines: void 0
      });
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-multi", toolName: "edit" }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-multi", success: true }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const content = result[1].result.content;
      assert.ok(content);
      const fileEdits = content.filter((c) => c.type === ToolResultContentType.FileEdit);
      assert.strictEqual(fileEdits.length, 2);
    });
    test("works without database (no file edits restored)", async () => {
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "edit", arguments: { filePath: "/workspace/file.ts" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-1", success: true, result: { content: "done" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      const content = result[1].result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 1);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
    });
    test("non-edit tools do not get file edits even if db has data", async () => {
      db = disposables.add(await SessionDatabase.open(":memory:"));
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "shell", arguments: { command: "ls" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-1", success: true, result: { content: "files" } }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, db, events);
      const content = result[1].result.content;
      assert.ok(content);
      assert.strictEqual(content.length, 1);
      assert.strictEqual(content[0].type, ToolResultContentType.Text);
    });
  });
  suite("subagent events", () => {
    test("maps subagent.started event to subagent_started progress event", async () => {
      const events = [
        {
          type: "subagent.started",
          data: {
            toolCallId: "tc-1",
            agentName: "code-reviewer",
            agentDisplayName: "Code Reviewer",
            agentDescription: "Reviews code"
          }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].type, "subagent_started");
      const event = result[0];
      assert.strictEqual(event.toolCallId, "tc-1");
      assert.strictEqual(event.agentName, "code-reviewer");
      assert.strictEqual(event.agentDisplayName, "Code Reviewer");
    });
  });
  suite("skill events", () => {
    test("synthesizes tool start/complete from skill.invoked and filters synthetic skill-injected user messages", async () => {
      const events = [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-skill", toolName: "skill", arguments: { skill: "plan" } }
        },
        {
          type: "tool.execution_complete",
          data: { toolCallId: "tc-skill", success: true }
        },
        {
          type: "skill.invoked",
          id: "evt-42",
          data: { name: "plan", path: "/abs/repo/skills/plan/SKILL.md", content: "" }
        },
        {
          type: "user.message",
          data: { messageId: "msg-skill", content: "<skill content body>", source: "skill-plan" }
        },
        {
          type: "assistant.message",
          data: { messageId: "msg-1", content: "ok" }
        }
      ];
      const result = await mapSessionEventsToHistoryRecords(session, void 0, events);
      assert.deepStrictEqual({
        count: result.length,
        types: result.map((r) => r.type),
        skillStart: result[0],
        skillComplete: result[1],
        assistantRole: result[2].role
      }, {
        count: 3,
        types: ["tool_start", "tool_complete", "message"],
        skillStart: {
          session,
          type: "tool_start",
          toolCallId: "synth-skill-evt-42",
          toolName: "skill",
          displayName: "Read Skill",
          invocationMessage: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" }
        },
        skillComplete: {
          session,
          type: "tool_complete",
          toolCallId: "synth-skill-evt-42",
          result: {
            success: true,
            pastTenseMessage: { markdown: "Read skill [plan](file:///abs/repo/skills/plan/SKILL.md)" }
          }
        },
        assistantRole: "assistant"
      });
    });
  });
  suite("cd-prefix rewriting", () => {
    const cwd = URI.file("/workspace/proj");
    function makeBashEvent(command, toolCallId = "tc-1") {
      return {
        type: "tool.execution_start",
        data: { toolCallId, toolName: "bash", arguments: { command } }
      };
    }
    function getStart(events) {
      return events[0];
    }
    test("strips redundant bash cd prefix matching workingDirectory", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls -la")
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls -la");
    });
    test("leaves command unchanged when cd dir does not match", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /other && ls")
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "cd /other && ls");
    });
    test("leaves command unchanged when no workingDirectory provided", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls")
      ]);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "cd /workspace/proj && ls");
    });
    test("non-shell tools are not rewritten even with matching command field", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "edit", arguments: { command: "cd /workspace/proj && ls" } }
        }
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, '{\n  "command": "cd /workspace/proj && ls"\n}');
    });
    test("handles trailing slash on workingDirectory", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent("cd /workspace/proj && ls")
      ], URI.file("/workspace/proj/"));
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls");
    });
    test("handles quoted directory in cd prefix", async () => {
      const cwdWithSpaces = URI.file("/workspace/my proj");
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        makeBashEvent('cd "/workspace/my proj" && ls')
      ], cwdWithSpaces);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "ls");
    });
    test("rewrites powershell commands too", async () => {
      const result = await mapSessionEventsToHistoryRecords(session, void 0, [
        {
          type: "tool.execution_start",
          data: { toolCallId: "tc-1", toolName: "powershell", arguments: { command: "cd /workspace/proj; dir" } }
        }
      ], cwd);
      const start = getStart(result);
      assert.strictEqual(start.toolInput, "dir");
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxoaXN0b3J5UmVjb3JkRml4dHVyZXMudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IERpc3Bvc2FibGVTdG9yZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi9jb21tb24vYWdlbnQuanMnO1xuaW1wb3J0IHsgRmlsZUVkaXRLaW5kLCBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5pbXBvcnQgeyBTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9ub2RlL3Nlc3Npb25EYXRhYmFzZS5qcyc7XG5pbXBvcnQgeyBwYXJzZVNlc3Npb25EYlVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zZXNzaW9uRGJVcmkuanMnO1xuaW1wb3J0IHsgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMgfSBmcm9tICcuL2hpc3RvcnlSZWNvcmRGaXh0dXJlcy5qcyc7XG5pbXBvcnQgeyBtYXBTZXNzaW9uRXZlbnRzIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L21hcFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgdG9TZXNzaW9uRXZlbnRzLCB0eXBlIElTZXNzaW9uRXZlbnQgfSBmcm9tICcuL2NvcGlsb3RUZXN0RXZlbnRzLmpzJztcblxuc3VpdGUoJ21hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzJywgKCkgPT4ge1xuXG5cdGNvbnN0IGRpc3Bvc2FibGVzID0gbmV3IERpc3Bvc2FibGVTdG9yZSgpO1xuXHRsZXQgZGI6IFNlc3Npb25EYXRhYmFzZSB8IHVuZGVmaW5lZDtcblx0Y29uc3Qgc2Vzc2lvbiA9IEFnZW50U2Vzc2lvbi51cmkoJ2NvcGlsb3QnLCAndGVzdC1zZXNzaW9uJyk7XG5cblx0dGVhcmRvd24oYXN5bmMgKCkgPT4ge1xuXHRcdGRpc3Bvc2FibGVzLmNsZWFyKCk7XG5cdFx0YXdhaXQgZGI/LmNsb3NlKCk7XG5cdH0pO1xuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHQvLyAtLS0tIEJhc2ljIGV2ZW50IG1hcHBpbmcgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHR0ZXN0KCdtYXBzIHVzZXIgYW5kIGFzc2lzdGFudCBtZXNzYWdlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnaGVsbG8nIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtc2ctMicsIGNvbnRlbnQ6ICd3b3JsZCcgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0WzBdLCB7XG5cdFx0XHRzZXNzaW9uLFxuXHRcdFx0dHlwZTogJ21lc3NhZ2UnLFxuXHRcdFx0cm9sZTogJ3VzZXInLFxuXHRcdFx0bWVzc2FnZUlkOiAnbXNnLTEnLFxuXHRcdFx0Y29udGVudDogJ2hlbGxvJyxcblx0XHRcdHRvb2xSZXF1ZXN0czogdW5kZWZpbmVkLFxuXHRcdFx0cmVhc29uaW5nT3BhcXVlOiB1bmRlZmluZWQsXG5cdFx0XHRyZWFzb25pbmdUZXh0OiB1bmRlZmluZWQsXG5cdFx0XHRlbmNyeXB0ZWRDb250ZW50OiB1bmRlZmluZWQsXG5cdFx0XHRwYXJlbnRUb29sQ2FsbElkOiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS50eXBlLCAnbWVzc2FnZScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzFdIGFzIHsgcm9sZTogc3RyaW5nIH0pLnJvbGUsICdhc3Npc3RhbnQnKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyB0b29sIHN0YXJ0IGFuZCBjb21wbGV0ZSBldmVudHMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3NoZWxsJywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdlY2hvIGhpJyB9IH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdoaVxcbicgfSB9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnR5cGUsICd0b29sX3N0YXJ0Jyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFsxXS50eXBlLCAndG9vbF9jb21wbGV0ZScpO1xuXG5cdFx0Y29uc3QgY29tcGxldGUgPSByZXN1bHRbMV0gYXMgeyByZXN1bHQ6IHsgY29udGVudD86IHJlYWRvbmx5IHsgdHlwZTogc3RyaW5nOyB0ZXh0Pzogc3RyaW5nIH1bXSB9IH07XG5cdFx0YXNzZXJ0Lm9rKGNvbXBsZXRlLnJlc3VsdC5jb250ZW50KTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29tcGxldGUucmVzdWx0LmNvbnRlbnRbMF0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpO1xuXHR9KTtcblxuXHR0ZXN0KCdtYXBzIHRhc2tfY29tcGxldGUgdG8gYSByb290IG1hcmtkb3duIHJlc3BvbnNlIHBhcnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3R1cm4tMScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbXNnLTEnLCBjb250ZW50OiAnZmluaXNoIHRoaXMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtcmVhZCcsIHRvb2xOYW1lOiAndmlldycsIGFyZ3VtZW50czogeyBwYXRoOiAnL3dvcmtzcGFjZS9pbmRleC5odG1sJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtcmVhZCcsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnZmlsZSBjb250ZW50cycgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2stY29tcGxldGUnLCB0b29sTmFtZTogJ3Rhc2tfY29tcGxldGUnLCBhcmd1bWVudHM6IHsgc3VtbWFyeTogJ1Jldmlld2VkIGluZGV4Lmh0bWwuJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzay1jb21wbGV0ZScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnUmV2aWV3ZWQgaW5kZXguaHRtbC4nIH0gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LnR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UsXG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiB0dXJuLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsID8ge1xuXHRcdFx0XHRraW5kOiBwYXJ0LmtpbmQsXG5cdFx0XHRcdHRvb2xOYW1lOiBwYXJ0LnRvb2xDYWxsLnRvb2xOYW1lLFxuXHRcdFx0fSA6IHtcblx0XHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0XHRjb250ZW50OiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyBwYXJ0LmNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHR9KSxcblx0XHR9KSksIFt7XG5cdFx0XHRtZXNzYWdlOiB7IHRleHQ6ICdmaW5pc2ggdGhpcycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHN0YXRlOiAnY29tcGxldGUnLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sTmFtZTogJ3ZpZXcnIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1xcblxcbioqVGFzayBjb21wbGV0ZWQ6KiogUmV2aWV3ZWQgaW5kZXguaHRtbC4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZHJvcHMgb3JwaGFuIHRhc2tfY29tcGxldGUgd2l0aG91dCBzeW50aGVzaXppbmcgYSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrLWNvbXBsZXRlJywgdG9vbE5hbWU6ICd0YXNrX2NvbXBsZXRlJywgYXJndW1lbnRzOiB7IHN1bW1hcnk6ICdEb25lLicgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2stY29tcGxldGUnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ0RvbmUuJyB9IH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdC50dXJucywgW10pO1xuXHR9KTtcblxuXHR0ZXN0KCdza2lwcyB0b29sX2NvbXBsZXRlIHdpdGhvdXQgbWF0Y2hpbmcgdG9vbF9zdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAnb3JwaGFuJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMCk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgdW5rbm93biBldmVudCB0eXBlcycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3NvbWUudW5rbm93bi5ldmVudCcsIGRhdGE6IHt9IH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ21zZy0xJywgY29udGVudDogJ3Rlc3QnIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBldmVudHMpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0fSk7XG5cblx0Ly8gLS0tLSBGaWxlIGVkaXQgcmVzdG9yYXRpb24gLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ2ZpbGUgZWRpdCByZXN0b3JhdGlvbicsICgpID0+IHtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGZpbGUgZWRpdHMgZnJvbSBkYXRhYmFzZSBmb3IgZWRpdCB0b29scycsIGFzeW5jICgpID0+IHtcblx0XHRcdGRiID0gZGlzcG9zYWJsZXMuYWRkKGF3YWl0IFNlc3Npb25EYXRhYmFzZS5vcGVuKCc6bWVtb3J5OicpKTtcblx0XHRcdGF3YWl0IGRiLmNyZWF0ZVR1cm4oJ3R1cm4tMScpO1xuXHRcdFx0YXdhaXQgZGIuc3RvcmVGaWxlRWRpdCh7XG5cdFx0XHRcdHR1cm5JZDogJ3R1cm4tMScsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1lZGl0Jyxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2ZpbGUudHMnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdiZWZvcmUnKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2FmdGVyJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IDMsXG5cdFx0XHRcdHJlbW92ZWRMaW5lczogMSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtZWRpdCcsIHRvb2xOYW1lOiAnZWRpdCcsIGFyZ3VtZW50czogeyBmaWxlUGF0aDogJy93b3Jrc3BhY2UvZmlsZS50cycgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1lZGl0Jywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdFZGl0ZWQgZmlsZS50cycgfSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgZGIsIGV2ZW50cyk7XG5cdFx0XHRjb25zdCBjb21wbGV0ZSA9IHJlc3VsdFsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb21wbGV0ZS50eXBlLCAndG9vbF9jb21wbGV0ZScpO1xuXG5cdFx0XHRjb25zdCBjb250ZW50ID0gKGNvbXBsZXRlIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gfSkucmVzdWx0LmNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0XHQvLyBTaG91bGQgaGF2ZSB0ZXh0IGNvbnRlbnQgKyBmaWxlIGVkaXRcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudFswXS50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudFsxXS50eXBlLCBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQpO1xuXG5cdFx0XHQvLyBGaWxlIGVkaXQgVVJJcyBzaG91bGQgYmUgcGFyc2VhYmxlXG5cdFx0XHRjb25zdCBmaWxlRWRpdCA9IGNvbnRlbnRbMV0gYXMgeyBiZWZvcmU6IHsgdXJpOiBhbnk7IGNvbnRlbnQ6IHsgdXJpOiBhbnkgfSB9OyBhZnRlcjogeyB1cmk6IGFueTsgY29udGVudDogeyB1cmk6IGFueSB9IH07IGRpZmY/OiB7IGFkZGVkPzogbnVtYmVyOyByZW1vdmVkPzogbnVtYmVyIH0gfTtcblx0XHRcdGNvbnN0IGJlZm9yZUZpZWxkcyA9IHBhcnNlU2Vzc2lvbkRiVXJpKGZpbGVFZGl0LmJlZm9yZS5jb250ZW50LnVyaSk7XG5cdFx0XHRhc3NlcnQub2soYmVmb3JlRmllbGRzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMudG9vbENhbGxJZCwgJ3RjLWVkaXQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMuZmlsZVBhdGgsICcvd29ya3NwYWNlL2ZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChiZWZvcmVGaWVsZHMucGFydCwgJ2JlZm9yZScpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChmaWxlRWRpdC5kaWZmLCB7IGFkZGVkOiAzLCByZW1vdmVkOiAxIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBtdWx0aXBsZSBmaWxlIGVkaXRzIGZvciBvbmUgdG9vbCBjYWxsJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXHRcdFx0YXdhaXQgZGIuY3JlYXRlVHVybigndHVybi0xJyk7XG5cdFx0XHRhd2FpdCBkYi5zdG9yZUZpbGVFZGl0KHtcblx0XHRcdFx0dHVybklkOiAndHVybi0xJyxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW11bHRpJyxcblx0XHRcdFx0ZmlsZVBhdGg6ICcvd29ya3NwYWNlL2EudHMnLFxuXHRcdFx0XHRraW5kOiBGaWxlRWRpdEtpbmQuRWRpdCxcblx0XHRcdFx0YmVmb3JlQ29udGVudDogbmV3IFVpbnQ4QXJyYXkoMCksXG5cdFx0XHRcdGFmdGVyQ29udGVudDogbmV3IFRleHRFbmNvZGVyKCkuZW5jb2RlKCdhJyksXG5cdFx0XHRcdGFkZGVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdFx0cmVtb3ZlZExpbmVzOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHRcdGF3YWl0IGRiLnN0b3JlRmlsZUVkaXQoe1xuXHRcdFx0XHR0dXJuSWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbXVsdGknLFxuXHRcdFx0XHRmaWxlUGF0aDogJy93b3Jrc3BhY2UvYi50cycsXG5cdFx0XHRcdGtpbmQ6IEZpbGVFZGl0S2luZC5FZGl0LFxuXHRcdFx0XHRiZWZvcmVDb250ZW50OiBuZXcgVWludDhBcnJheSgwKSxcblx0XHRcdFx0YWZ0ZXJDb250ZW50OiBuZXcgVGV4dEVuY29kZXIoKS5lbmNvZGUoJ2InKSxcblx0XHRcdFx0YWRkZWRMaW5lczogdW5kZWZpbmVkLFxuXHRcdFx0XHRyZW1vdmVkTGluZXM6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtbXVsdGknLCB0b29sTmFtZTogJ2VkaXQnIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLW11bHRpJywgc3VjY2VzczogdHJ1ZSB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XTtcblxuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgZGIsIGV2ZW50cyk7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gKHJlc3VsdFsxXSBhcyB7IHJlc3VsdDogeyBjb250ZW50PzogcmVhZG9ubHkgUmVjb3JkPHN0cmluZywgdW5rbm93bj5bXSB9IH0pLnJlc3VsdC5jb250ZW50O1xuXHRcdFx0YXNzZXJ0Lm9rKGNvbnRlbnQpO1xuXHRcdFx0Ly8gVHdvIGZpbGUgZWRpdHMgKG5vIHRleHQgc2luY2UgcmVzdWx0IGhhZCBubyBjb250ZW50KVxuXHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gY29udGVudC5maWx0ZXIoYyA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzLmxlbmd0aCwgMik7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JrcyB3aXRob3V0IGRhdGFiYXNlIChubyBmaWxlIGVkaXRzIHJlc3RvcmVkKScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdlZGl0JywgYXJndW1lbnRzOiB7IGZpbGVQYXRoOiAnL3dvcmtzcGFjZS9maWxlLnRzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ2RvbmUnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAocmVzdWx0WzFdIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gfSkucmVzdWx0LmNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0XHQvLyBPbmx5IHRleHQgY29udGVudCwgbm8gZmlsZSBlZGl0c1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnQubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChjb250ZW50WzBdLnR5cGUsIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1lZGl0IHRvb2xzIGRvIG5vdCBnZXQgZmlsZSBlZGl0cyBldmVuIGlmIGRiIGhhcyBkYXRhJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0ZGIgPSBkaXNwb3NhYmxlcy5hZGQoYXdhaXQgU2Vzc2lvbkRhdGFiYXNlLm9wZW4oJzptZW1vcnk6JykpO1xuXG5cdFx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnc2hlbGwnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2xzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ2ZpbGVzJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCBkYiwgZXZlbnRzKTtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSAocmVzdWx0WzFdIGFzIHsgcmVzdWx0OiB7IGNvbnRlbnQ/OiByZWFkb25seSBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPltdIH0gfSkucmVzdWx0LmNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQub2soY29udGVudCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY29udGVudC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGNvbnRlbnRbMF0udHlwZSwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHQvLyAtLS0tIFN1YmFnZW50IGV2ZW50cyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuXHRzdWl0ZSgnc3ViYWdlbnQgZXZlbnRzJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnbWFwcyBzdWJhZ2VudC5zdGFydGVkIGV2ZW50IHRvIHN1YmFnZW50X3N0YXJ0ZWQgcHJvZ3Jlc3MgZXZlbnQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdzdWJhZ2VudC5zdGFydGVkJyxcblx0XHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0XHRhZ2VudE5hbWU6ICdjb2RlLXJldmlld2VyJyxcblx0XHRcdFx0XHRcdGFnZW50RGlzcGxheU5hbWU6ICdDb2RlIFJldmlld2VyJyxcblx0XHRcdFx0XHRcdGFnZW50RGVzY3JpcHRpb246ICdSZXZpZXdzIGNvZGUnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIGV2ZW50cyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLnR5cGUsICdzdWJhZ2VudF9zdGFydGVkJyk7XG5cdFx0XHRjb25zdCBldmVudCA9IHJlc3VsdFswXSBhcyB7IHR5cGU6IHN0cmluZzsgdG9vbENhbGxJZDogc3RyaW5nOyBhZ2VudE5hbWU6IHN0cmluZzsgYWdlbnREaXNwbGF5TmFtZTogc3RyaW5nIH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQudG9vbENhbGxJZCwgJ3RjLTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChldmVudC5hZ2VudE5hbWUsICdjb2RlLXJldmlld2VyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZXZlbnQuYWdlbnREaXNwbGF5TmFtZSwgJ0NvZGUgUmV2aWV3ZXInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0Ly8gLS0tLSBTa2lsbCBldmVudHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cblx0c3VpdGUoJ3NraWxsIGV2ZW50cycsICgpID0+IHtcblxuXHRcdHRlc3QoJ3N5bnRoZXNpemVzIHRvb2wgc3RhcnQvY29tcGxldGUgZnJvbSBza2lsbC5pbnZva2VkIGFuZCBmaWx0ZXJzIHN5bnRoZXRpYyBza2lsbC1pbmplY3RlZCB1c2VyIG1lc3NhZ2VzJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXNraWxsJywgdG9vbE5hbWU6ICdza2lsbCcsIGFyZ3VtZW50czogeyBza2lsbDogJ3BsYW4nIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsXG5cdFx0XHRcdFx0ZGF0YTogeyB0b29sQ2FsbElkOiAndGMtc2tpbGwnLCBzdWNjZXNzOiB0cnVlIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAnc2tpbGwuaW52b2tlZCcsXG5cdFx0XHRcdFx0aWQ6ICdldnQtNDInLFxuXHRcdFx0XHRcdGRhdGE6IHsgbmFtZTogJ3BsYW4nLCBwYXRoOiAnL2Ficy9yZXBvL3NraWxscy9wbGFuL1NLSUxMLm1kJywgY29udGVudDogJycgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0XHRcdGRhdGE6IHsgbWVzc2FnZUlkOiAnbXNnLXNraWxsJywgY29udGVudDogJzxza2lsbCBjb250ZW50IGJvZHk+Jywgc291cmNlOiAnc2tpbGwtcGxhbicgfSxcblx0XHRcdFx0fSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHRcdFx0ZGF0YTogeyBtZXNzYWdlSWQ6ICdtc2ctMScsIGNvbnRlbnQ6ICdvaycgfSxcblx0XHRcdFx0fSxcblx0XHRcdF07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgZXZlbnRzKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvdW50OiByZXN1bHQubGVuZ3RoLFxuXHRcdFx0XHR0eXBlczogcmVzdWx0Lm1hcChyID0+IHIudHlwZSksXG5cdFx0XHRcdHNraWxsU3RhcnQ6IHJlc3VsdFswXSxcblx0XHRcdFx0c2tpbGxDb21wbGV0ZTogcmVzdWx0WzFdLFxuXHRcdFx0XHRhc3Npc3RhbnRSb2xlOiAocmVzdWx0WzJdIGFzIHsgcm9sZTogc3RyaW5nIH0pLnJvbGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGNvdW50OiAzLFxuXHRcdFx0XHR0eXBlczogWyd0b29sX3N0YXJ0JywgJ3Rvb2xfY29tcGxldGUnLCAnbWVzc2FnZSddLFxuXHRcdFx0XHRza2lsbFN0YXJ0OiB7XG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0XHR0eXBlOiAndG9vbF9zdGFydCcsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3N5bnRoLXNraWxsLWV2dC00MicsXG5cdFx0XHRcdFx0dG9vbE5hbWU6ICdza2lsbCcsXG5cdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSZWFkIFNraWxsJyxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogeyBtYXJrZG93bjogJ1JlYWQgc2tpbGwgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRza2lsbENvbXBsZXRlOiB7XG5cdFx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0XHR0eXBlOiAndG9vbF9jb21wbGV0ZScsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3N5bnRoLXNraWxsLWV2dC00MicsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyBtYXJrZG93bjogJ1JlYWQgc2tpbGwgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpJyB9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdGFzc2lzdGFudFJvbGU6ICdhc3Npc3RhbnQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdC8vIC0tLS0gY2QtcHJlZml4IHJld3JpdGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG5cdHN1aXRlKCdjZC1wcmVmaXggcmV3cml0aW5nJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgY3dkID0gVVJJLmZpbGUoJy93b3Jrc3BhY2UvcHJvaicpO1xuXG5cdFx0ZnVuY3Rpb24gbWFrZUJhc2hFdmVudChjb21tYW5kOiBzdHJpbmcsIHRvb2xDYWxsSWQgPSAndGMtMScpOiBJU2Vzc2lvbkV2ZW50IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZCwgdG9vbE5hbWU6ICdiYXNoJywgYXJndW1lbnRzOiB7IGNvbW1hbmQgfSB9LFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBnZXRTdGFydChldmVudHM6IFJldHVyblR5cGU8dHlwZW9mIG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzPiBleHRlbmRzIFByb21pc2U8aW5mZXIgUj4gPyBSIDogbmV2ZXIpIHtcblx0XHRcdHJldHVybiBldmVudHNbMF0gYXMgeyB0b29sSW5wdXQ6IHN0cmluZyB9O1xuXHRcdH1cblxuXHRcdHRlc3QoJ3N0cmlwcyByZWR1bmRhbnQgYmFzaCBjZCBwcmVmaXggbWF0Y2hpbmcgd29ya2luZ0RpcmVjdG9yeScsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgW1xuXHRcdFx0XHRtYWtlQmFzaEV2ZW50KCdjZCAvd29ya3NwYWNlL3Byb2ogJiYgbHMgLWxhJyksXG5cdFx0XHRdLCBjd2QpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBnZXRTdGFydChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LnRvb2xJbnB1dCwgJ2xzIC1sYScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbGVhdmVzIGNvbW1hbmQgdW5jaGFuZ2VkIHdoZW4gY2QgZGlyIGRvZXMgbm90IG1hdGNoJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBbXG5cdFx0XHRcdG1ha2VCYXNoRXZlbnQoJ2NkIC9vdGhlciAmJiBscycpLFxuXHRcdFx0XSwgY3dkKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZ2V0U3RhcnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50b29sSW5wdXQsICdjZCAvb3RoZXIgJiYgbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2xlYXZlcyBjb21tYW5kIHVuY2hhbmdlZCB3aGVuIG5vIHdvcmtpbmdEaXJlY3RvcnkgcHJvdmlkZWQnLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0bWFrZUJhc2hFdmVudCgnY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzJyksXG5cdFx0XHRdKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZ2V0U3RhcnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50b29sSW5wdXQsICdjZCAvd29ya3NwYWNlL3Byb2ogJiYgbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ25vbi1zaGVsbCB0b29scyBhcmUgbm90IHJld3JpdHRlbiBldmVuIHdpdGggbWF0Y2hpbmcgY29tbWFuZCBmaWVsZCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHNUb0hpc3RvcnlSZWNvcmRzKHNlc3Npb24sIHVuZGVmaW5lZCwgW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jyxcblx0XHRcdFx0XHRkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICdlZGl0JywgYXJndW1lbnRzOiB7IGNvbW1hbmQ6ICdjZCAvd29ya3NwYWNlL3Byb2ogJiYgbHMnIH0gfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sIGN3ZCk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudG9vbElucHV0LCAne1xcbiAgXCJjb21tYW5kXCI6IFwiY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzXCJcXG59Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoYW5kbGVzIHRyYWlsaW5nIHNsYXNoIG9uIHdvcmtpbmdEaXJlY3RvcnknLCBhc3luYyAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0bWFrZUJhc2hFdmVudCgnY2QgL3dvcmtzcGFjZS9wcm9qICYmIGxzJyksXG5cdFx0XHRdLCBVUkkuZmlsZSgnL3dvcmtzcGFjZS9wcm9qLycpKTtcblx0XHRcdGNvbnN0IHN0YXJ0ID0gZ2V0U3RhcnQocmVzdWx0KTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGFydC50b29sSW5wdXQsICdscycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaGFuZGxlcyBxdW90ZWQgZGlyZWN0b3J5IGluIGNkIHByZWZpeCcsIGFzeW5jICgpID0+IHtcblx0XHRcdGNvbnN0IGN3ZFdpdGhTcGFjZXMgPSBVUkkuZmlsZSgnL3dvcmtzcGFjZS9teSBwcm9qJyk7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzVG9IaXN0b3J5UmVjb3JkcyhzZXNzaW9uLCB1bmRlZmluZWQsIFtcblx0XHRcdFx0bWFrZUJhc2hFdmVudCgnY2QgXCIvd29ya3NwYWNlL215IHByb2pcIiAmJiBscycpLFxuXHRcdFx0XSwgY3dkV2l0aFNwYWNlcyk7XG5cdFx0XHRjb25zdCBzdGFydCA9IGdldFN0YXJ0KHJlc3VsdCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhcnQudG9vbElucHV0LCAnbHMnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jld3JpdGVzIHBvd2Vyc2hlbGwgY29tbWFuZHMgdG9vJywgYXN5bmMgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCBbXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLFxuXHRcdFx0XHRcdGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ3Bvd2Vyc2hlbGwnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2NkIC93b3Jrc3BhY2UvcHJvajsgZGlyJyB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdLCBjd2QpO1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBnZXRTdGFydChyZXN1bHQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXJ0LnRvb2xJbnB1dCwgJ2RpcicpO1xuXHRcdH0pO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMsV0FBVztBQUNwQixTQUFTLCtDQUErQztBQUN4RCxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLGNBQWMsYUFBYSxrQkFBa0IsNkJBQTZCO0FBQ25GLFNBQVMsdUJBQXVCO0FBQ2hDLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsd0NBQXdDO0FBQ2pELFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsdUJBQTJDO0FBRXBELE1BQU0sb0NBQW9DLE1BQU07QUFFL0MsUUFBTSxjQUFjLElBQUksZ0JBQWdCO0FBQ3hDLE1BQUk7QUFDSixRQUFNLFVBQVUsYUFBYSxJQUFJLFdBQVcsY0FBYztBQUUxRCxXQUFTLFlBQVk7QUFDcEIsZ0JBQVksTUFBTTtBQUNsQixVQUFNLElBQUksTUFBTTtBQUFBLEVBQ2pCLENBQUM7QUFDRCwwQ0FBd0M7QUFJeEMsT0FBSyxvQ0FBb0MsWUFBWTtBQUNwRCxVQUFNLFNBQTBCO0FBQUEsTUFDL0IsRUFBRSxNQUFNLGdCQUFnQixNQUFNLEVB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
