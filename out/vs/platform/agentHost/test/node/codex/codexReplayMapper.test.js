import assert from "assert";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../base/test/common/utils.js";
import { readAgentMessageDelegationMeta } from "../../../common/meta/agentMessageDelegationMeta.js";
import { SessionServerToolName } from "../../../common/serverToolNames.js";
import { replayThreadToTurns } from "../../../node/codex/codexReplayMapper.js";
import { MessageKind, ResponsePartKind, ToolCallStatus, ToolResultContentType, TurnState } from "../../../common/state/sessionState.js";
suite("codexReplayMapper", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("empty thread \u2192 no turns", () => {
    const turns = replayThreadToTurns({ id: "thr", turns: [] });
    assert.deepStrictEqual(turns, []);
  });
  test("thread with one user/agent exchange \u2192 one Turn", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "hi", text_elements: [] }] },
          { type: "agentMessage", id: "a1", text: "hello back", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].id, "turn_a");
    assert.strictEqual(turns[0].message.text, "hi");
    assert.strictEqual(turns[0].state, TurnState.Complete);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.Markdown);
    assert.strictEqual(part.content, "hello back");
  });
  test("restored turn carries its original model on the request and response usage", () => {
    const model = { id: "codex-model:openai:gpt-5.6-sol" };
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "hi", text_elements: [] }] },
          { type: "agentMessage", id: "a1", text: "hello back", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    }, /* @__PURE__ */ new Map([["turn_a", model]]));
    assert.deepStrictEqual({
      messageModel: turns[0].message.model,
      usage: turns[0].usage
    }, {
      messageModel: model,
      usage: { model: model.id }
    });
  });
  test("restores delegated user messages as visible prompts with source provenance", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [{
          type: "userMessage",
          id: "u1",
          content: [{
            type: "text",
            text: "<codex_delegation><source_thread_id>source-thread</source_thread_id><input>Open &lt;the control&gt;.</input></codex_delegation>",
            text_elements: []
          }]
        }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual({
      text: turns[0].message.text,
      delegation: readAgentMessageDelegationMeta(turns[0].message)
    }, {
      text: "Open <the control>.",
      delegation: { sourceThreadId: "source-thread" }
    });
  });
  test("restores create-thread outcomes as one link tool and removes the matching directive", () => {
    const targetThreadId = "019ff590-65e5-7940-943f-d2a8718c358b";
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Create another chat", text_elements: [] }] },
          {
            type: "dynamicToolCall",
            id: "tool-1",
            namespace: "codex_app",
            tool: "create_thread",
            arguments: { prompt: "Remember this word: capybara", target: { type: "projectless" } },
            status: "completed",
            contentItems: [
              { type: "inputText", text: "Script completed" },
              { type: "inputText", text: JSON.stringify({ threadId: targetThreadId, hostId: "local" }) }
            ],
            success: true,
            durationMs: 300
          },
          {
            type: "agentMessage",
            id: "a1",
            text: `Created another chat.

::created-thread{threadId="${targetThreadId}"}`,
            phase: "final_answer",
            memoryCitation: null
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const toolPart = turns[0].responseParts.find((part) => part.kind === ResponsePartKind.ToolCall);
    const markdownPart = turns[0].responseParts.find((part) => part.kind === ResponsePartKind.Markdown);
    const toolCall = toolPart?.kind === ResponsePartKind.ToolCall && toolPart.toolCall.status === ToolCallStatus.Completed ? toolPart.toolCall : void 0;
    assert.deepStrictEqual({
      partKinds: turns[0].responseParts.map((part) => part.kind),
      toolName: toolCall?.toolName,
      toolInput: toolCall?.toolInput,
      toolOutput: toolCall?.content,
      markdown: markdownPart?.kind === ResponsePartKind.Markdown ? markdownPart.content : void 0
    }, {
      partKinds: [ResponsePartKind.ToolCall, ResponsePartKind.Markdown],
      toolName: SessionServerToolName.CreateSession,
      toolInput: JSON.stringify({ prompt: "Remember this word: capybara", target: { type: "projectless" } }, null, 2),
      toolOutput: [{ type: "text", text: `agent-host-session://codex/${targetThreadId}` }],
      markdown: "Created another chat."
    });
  });
  test("restores send-message outcomes as links to the target thread", () => {
    const targetThreadId = "target-thread";
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Send foo", text_elements: [] }] },
          {
            type: "dynamicToolCall",
            id: "tool-1",
            namespace: "codex_app",
            tool: "send_message_to_thread",
            arguments: { threadId: targetThreadId, prompt: "foo" },
            status: "completed",
            contentItems: [{ type: "inputText", text: JSON.stringify({ threadId: targetThreadId }) }],
            success: true,
            durationMs: 300
          },
          { type: "agentMessage", id: "a1", text: "Sent \u201Cfoo\u201D to that chat.", phase: "final_answer", memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const toolPart = turns[0].responseParts.find((part) => part.kind === ResponsePartKind.ToolCall);
    const toolCall = toolPart?.kind === ResponsePartKind.ToolCall && toolPart.toolCall.status === ToolCallStatus.Completed ? toolPart.toolCall : void 0;
    assert.deepStrictEqual({
      toolName: toolCall?.toolName,
      toolOutput: toolCall?.content
    }, {
      toolName: SessionServerToolName.SendMessage,
      toolOutput: [{ type: "text", text: `agent-host-session://codex/${targetThreadId}` }]
    });
  });
  test("restores rollout thread operations when thread/read omits their tool items", () => {
    const targetThreadId = "target-thread";
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn-create",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Create another chat", text_elements: [] }] },
          {
            type: "agentMessage",
            id: "a1",
            text: `Created another chat.

::created-thread{threadId="${targetThreadId}"}`,
            phase: "final_answer",
            memoryCitation: null
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }, {
        id: "turn-send",
        items: [
          { type: "userMessage", id: "u2", content: [{ type: "text", text: "Send foo", text_elements: [] }] },
          { type: "agentMessage", id: "a2", text: "Sent \u201Cfoo\u201D to that chat.", phase: "final_answer", memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    }, void 0, /* @__PURE__ */ new Map([
      ["turn-create", [{
        toolName: SessionServerToolName.CreateSession,
        targetThreadId,
        openLink: `agent-host-session://codex/${targetThreadId}`,
        toolInput: { prompt: "Remember capybara" }
      }]],
      ["turn-send", [{
        toolName: SessionServerToolName.SendMessage,
        targetThreadId,
        openLink: `agent-host-session://codex/${targetThreadId}`,
        toolInput: { prompt: "foo" }
      }]]
    ]));
    assert.deepStrictEqual(turns.map((turn) => ({
      markdown: turn.responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content),
      tools: turn.responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall.toolName)
    })), [{
      markdown: ["Created another chat."],
      tools: [SessionServerToolName.CreateSession]
    }, {
      markdown: ["Sent \u201Cfoo\u201D to that chat."],
      tools: [SessionServerToolName.SendMessage]
    }]);
  });
  test("keeps create and send outcomes to the same target while deduplicating equivalent replay data", () => {
    const targetThreadId = "target-thread";
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn-a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Create and message a chat", text_elements: [] }] },
          {
            type: "dynamicToolCall",
            id: "create-tool",
            namespace: "codex_app",
            tool: "create_thread",
            arguments: { prompt: "Remember capybara" },
            status: "completed",
            contentItems: [{ type: "inputText", text: JSON.stringify({ threadId: targetThreadId }) }],
            success: true,
            durationMs: 100
          },
          {
            type: "dynamicToolCall",
            id: "send-tool",
            namespace: "codex_app",
            tool: "send_message_to_thread",
            arguments: { threadId: targetThreadId, prompt: "foo" },
            status: "completed",
            contentItems: [{ type: "inputText", text: JSON.stringify({ threadId: targetThreadId }) }],
            success: true,
            durationMs: 100
          },
          {
            type: "agentMessage",
            id: "a1",
            text: `Done.

::created-thread{threadId="${targetThreadId}"}`,
            phase: "final_answer",
            memoryCitation: null
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    }, void 0, /* @__PURE__ */ new Map([["turn-a", [{
      toolName: SessionServerToolName.CreateSession,
      targetThreadId,
      openLink: `agent-host-session://codex/${targetThreadId}`,
      toolInput: { prompt: "Remember capybara" }
    }]]]));
    assert.deepStrictEqual({
      tools: turns[0].responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall).map((part) => part.toolCall.toolName),
      markdown: turns[0].responseParts.filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content)
    }, {
      tools: [SessionServerToolName.CreateSession, SessionServerToolName.SendMessage],
      markdown: ["Done."]
    });
  });
  test("uses a directive fallback but leaves directive examples inside code fences unchanged", () => {
    const targetThreadId = "target-thread";
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Create another chat", text_elements: [] }] },
          {
            type: "agentMessage",
            id: "a1",
            text: [
              "Created another chat.",
              "",
              `::created-thread{threadId="${targetThreadId}"}`,
              "",
              "```text",
              '::created-thread{threadId="example-only"}',
              "```typescript",
              '::created-thread{threadId="after-info-string"}',
              "",
              "",
              "",
              '    ::created-thread{threadId="indented-example"}',
              "```",
              "",
              '    ::created-thread{threadId="indented-outside"}'
            ].join("\n"),
            phase: "final_answer",
            memoryCitation: null
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const toolParts = turns[0].responseParts.filter((part) => part.kind === ResponsePartKind.ToolCall);
    const markdownPart = turns[0].responseParts.find((part) => part.kind === ResponsePartKind.Markdown);
    assert.deepStrictEqual({
      toolCount: toolParts.length,
      toolName: toolParts[0]?.kind === ResponsePartKind.ToolCall ? toolParts[0].toolCall.toolName : void 0,
      markdown: markdownPart?.kind === ResponsePartKind.Markdown ? markdownPart.content : void 0
    }, {
      toolCount: 1,
      toolName: SessionServerToolName.CreateSession,
      markdown: [
        "Created another chat.",
        "",
        "```text",
        '::created-thread{threadId="example-only"}',
        "```typescript",
        '::created-thread{threadId="after-info-string"}',
        "",
        "",
        "",
        '    ::created-thread{threadId="indented-example"}',
        "```",
        "",
        '    ::created-thread{threadId="indented-outside"}'
      ].join("\n")
    });
  });
  test("ignores similarly named dynamic tools from other namespaces", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn-a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "Call another tool", text_elements: [] }] },
          {
            type: "dynamicToolCall",
            id: "tool-1",
            namespace: "other_app",
            tool: "send_message_to_thread",
            arguments: { threadId: "target-thread", prompt: "foo" },
            status: "completed",
            contentItems: [{ type: "inputText", text: JSON.stringify({ threadId: "target-thread" }) }],
            success: true,
            durationMs: 100
          },
          { type: "agentMessage", id: "a1", text: "Done.", phase: "final_answer", memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns[0].responseParts.map((part) => part.kind), [ResponsePartKind.Markdown]);
  });
  test("restores turn timing from the persisted codex thread", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [{ type: "userMessage", id: "u1", content: [{ type: "text", text: "hi", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 178506e4,
        completedAt: null,
        durationMs: 4200
      }, {
        id: "turn_b",
        items: [{ type: "userMessage", id: "u2", content: [{ type: "text", text: "again", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: 1785060100,
        completedAt: 1785060103,
        durationMs: null
      }, {
        id: "turn_c",
        items: [{ type: "userMessage", id: "u3", content: [{ type: "text", text: "legacy", text_elements: [] }] }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn_a", startedAt: "2026-07-26T10:00:00.000Z", duration: 4200 },
      { id: "turn_b", startedAt: "2026-07-26T10:01:40.000Z", duration: 3e3 },
      { id: "turn_c", startedAt: void 0, duration: void 0 }
    ]);
  });
  test("failed turn maps to TurnState.Error", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "q", text_elements: [] }] }
        ],
        itemsView: { type: "full" },
        status: "failed",
        error: { message: "oops" },
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns.map((turn) => ({ state: turn.state, error: turn.error })), [{
      state: TurnState.Error,
      error: { errorType: "CodexError", message: "oops" }
    }]);
  });
  test("turn with no recognizable items is dropped", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "plan", id: "p", text: "planning" }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.deepStrictEqual(turns, []);
  });
  test("multi-turn thread preserves order", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [
        {
          id: "t1",
          items: [
            { type: "userMessage", id: "u", content: [{ type: "text", text: "first", text_elements: [] }] },
            { type: "agentMessage", id: "a", text: "one", phase: null, memoryCitation: null }
          ],
          itemsView: { type: "full" },
          status: "completed",
          error: null,
          startedAt: null,
          completedAt: null,
          durationMs: null
        },
        {
          id: "t2",
          items: [
            { type: "userMessage", id: "u2", content: [{ type: "text", text: "second", text_elements: [] }] },
            { type: "agentMessage", id: "a2", text: "two", phase: null, memoryCitation: null }
          ],
          itemsView: { type: "full" },
          status: "completed",
          error: null,
          startedAt: null,
          completedAt: null,
          durationMs: null
        }
      ]
    });
    assert.deepStrictEqual(turns.map((t) => t.id), ["t1", "t2"]);
  });
  test("adjacent agentMessages in a turn are separated so a heading keeps its own line", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "go on", text_elements: [] }] },
          { type: "agentMessage", id: "m1", text: "Consolidating the recommendation and tradeoffs.", phase: null, memoryCitation: null },
          { type: "agentMessage", id: "m2", text: "## Conclusion\n\nDone.", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const joined = turns[0].responseParts.map((part) => part.kind === ResponsePartKind.Markdown ? part.content : "").join("");
    assert.strictEqual(joined, "Consolidating the recommendation and tradeoffs.\n\n## Conclusion\n\nDone.");
  });
  test("commandExecution renders a completed terminal tool call", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "run it", text_elements: [] }] },
          {
            type: "commandExecution",
            id: "c1",
            command: "/bin/zsh -lc 'ls -la'",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "total 0",
            exitCode: 0,
            durationMs: 5
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.deepStrictEqual({
      kind: part.kind,
      toolName: part.toolCall.toolName,
      invocationMessage: part.toolCall.invocationMessage,
      pastTenseMessage: part.toolCall.pastTenseMessage,
      success: part.toolCall.success,
      output: part.toolCall.content?.[0].text
    }, {
      kind: ResponsePartKind.ToolCall,
      toolName: "shell",
      invocationMessage: "ls -la",
      pastTenseMessage: "Ran `ls -la`",
      success: true,
      output: "total 0"
    });
  });
  test("imageGeneration restores its generated image", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "draw it", text_elements: [] }] },
          { type: "imageGeneration", id: "image_1", status: "completed", revisedPrompt: "A watercolor fox", result: "aW1hZ2U=" }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const part = turns[0].responseParts[0];
    assert.deepStrictEqual(part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
      toolName: part.toolCall.toolName,
      displayName: part.toolCall.displayName,
      toolInput: part.toolCall.toolInput,
      success: part.toolCall.success,
      pastTenseMessage: part.toolCall.pastTenseMessage,
      content: part.toolCall.content
    } : void 0, {
      toolName: "image_gen.imagegen",
      displayName: "Generate image",
      toolInput: '{"prompt":"A watercolor fox"}',
      success: true,
      pastTenseMessage: "Generated image",
      content: [{ type: ToolResultContentType.EmbeddedResource, data: "aW1hZ2U=", contentType: "image/png" }]
    });
  });
  test("contextCompaction is restored as a completed /compact turn", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_compact",
        items: [{ type: "contextCompaction", id: "compact_1" }],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    const part = turns[0].responseParts[0];
    assert.deepStrictEqual({
      message: turns[0].message,
      kind: part.kind,
      toolCall: part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.Completed ? {
        status: part.toolCall.status,
        toolName: part.toolCall.toolName,
        displayName: part.toolCall.displayName,
        invocationMessage: part.toolCall.invocationMessage,
        pastTenseMessage: part.toolCall.pastTenseMessage,
        success: part.toolCall.success
      } : void 0
    }, {
      message: { text: "/compact", origin: { kind: MessageKind.User } },
      kind: ResponsePartKind.ToolCall,
      toolCall: {
        status: ToolCallStatus.Completed,
        toolName: "compact",
        displayName: "Compact conversation",
        invocationMessage: "Compacting conversation",
        pastTenseMessage: "Compacted conversation",
        success: true
      }
    });
  });
  test("automatic contextCompaction remains progress within its existing turn", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_auto_compact",
        items: [
          { type: "userMessage", id: "u1", content: [{ type: "text", text: "continue", text_elements: [] }] },
          { type: "contextCompaction", id: "compact_1" },
          { type: "agentMessage", id: "a1", text: "continued", phase: null, memoryCitation: null }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].message.text, "continue");
    assert.deepStrictEqual(turns[0].responseParts.map((part) => part.kind), [
      ResponsePartKind.ToolCall,
      ResponsePartKind.Markdown
    ]);
  });
  test("commandExecution coalesces a sandbox pre-flight with its re-run into one box", () => {
    const turns = replayThreadToTurns({
      id: "thr",
      turns: [{
        id: "turn_a",
        items: [
          { type: "userMessage", id: "u", content: [{ type: "text", text: "curl it", text_elements: [] }] },
          // Pre-flight: same command, no output, success → deferred.
          {
            type: "commandExecution",
            id: "pre",
            command: "curl -s https://example.com",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "",
            exitCode: 0,
            durationMs: 3
          },
          // Escalated re-run: same command, real output.
          {
            type: "commandExecution",
            id: "esc",
            command: "curl -s https://example.com",
            cwd: "/tmp",
            processId: null,
            source: "agent",
            status: "completed",
            commandActions: [],
            aggregatedOutput: "Example Domain",
            exitCode: 0,
            durationMs: 30
          }
        ],
        itemsView: { type: "full" },
        status: "completed",
        error: null,
        startedAt: null,
        completedAt: null,
        durationMs: null
      }]
    });
    assert.strictEqual(turns.length, 1);
    assert.strictEqual(turns[0].responseParts.length, 1);
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.toolCall.content?.[0].text, "Example Domain");
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxjb2RleFxcY29kZXhSZXBsYXlNYXBwZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvdGVzdC9jb21tb24vdXRpbHMuanMnO1xuaW1wb3J0IHsgcmVhZEFnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21ldGEvYWdlbnRNZXNzYWdlRGVsZWdhdGlvbk1ldGEuanMnO1xuaW1wb3J0IHsgU2Vzc2lvblNlcnZlclRvb2xOYW1lIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3NlcnZlclRvb2xOYW1lcy5qcyc7XG5pbXBvcnQgeyByZXBsYXlUaHJlYWRUb1R1cm5zIH0gZnJvbSAnLi4vLi4vLi4vbm9kZS9jb2RleC9jb2RleFJlcGxheU1hcHBlci5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCB0eXBlIE1vZGVsU2VsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3N0YXRlL3Nlc3Npb25TdGF0ZS5qcyc7XG5cbnN1aXRlKCdjb2RleFJlcGxheU1hcHBlcicsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHR0ZXN0KCdlbXB0eSB0aHJlYWQgXHUyMTkyIG5vIHR1cm5zJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7IGlkOiAndGhyJywgdHVybnM6IFtdIH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMsIFtdKTtcblx0fSk7XG5cblx0dGVzdCgndGhyZWFkIHdpdGggb25lIHVzZXIvYWdlbnQgZXhjaGFuZ2UgXHUyMTkyIG9uZSBUdXJuJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2ExJywgdGV4dDogJ2hlbGxvIGJhY2snLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5pZCwgJ3R1cm5fYScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5tZXNzYWdlLnRleHQsICdoaScpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5zdGF0ZSwgVHVyblN0YXRlLkNvbXBsZXRlKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LmtpbmQsIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocGFydCBhcyB7IGNvbnRlbnQ6IHN0cmluZyB9KS5jb250ZW50LCAnaGVsbG8gYmFjaycpO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlZCB0dXJuIGNhcnJpZXMgaXRzIG9yaWdpbmFsIG1vZGVsIG9uIHRoZSByZXF1ZXN0IGFuZCByZXNwb25zZSB1c2FnZScsICgpID0+IHtcblx0XHRjb25zdCBtb2RlbDogTW9kZWxTZWxlY3Rpb24gPSB7IGlkOiAnY29kZXgtbW9kZWw6b3BlbmFpOmdwdC01LjYtc29sJyB9O1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2hpJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2ExJywgdGV4dDogJ2hlbGxvIGJhY2snLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIsIG5ldyBNYXAoW1sndHVybl9hJywgbW9kZWxdXSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRtZXNzYWdlTW9kZWw6IHR1cm5zWzBdLm1lc3NhZ2UubW9kZWwsXG5cdFx0XHR1c2FnZTogdHVybnNbMF0udXNhZ2UsXG5cdFx0fSwge1xuXHRcdFx0bWVzc2FnZU1vZGVsOiBtb2RlbCxcblx0XHRcdHVzYWdlOiB7IG1vZGVsOiBtb2RlbC5pZCB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBkZWxlZ2F0ZWQgdXNlciBtZXNzYWdlcyBhcyB2aXNpYmxlIHByb21wdHMgd2l0aCBzb3VyY2UgcHJvdmVuYW5jZScsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0dHlwZTogJ3VzZXJNZXNzYWdlJyxcblx0XHRcdFx0XHRpZDogJ3UxJyxcblx0XHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdFx0dHlwZTogJ3RleHQnLFxuXHRcdFx0XHRcdFx0dGV4dDogJzxjb2RleF9kZWxlZ2F0aW9uPjxzb3VyY2VfdGhyZWFkX2lkPnNvdXJjZS10aHJlYWQ8L3NvdXJjZV90aHJlYWRfaWQ+PGlucHV0Pk9wZW4gJmx0O3RoZSBjb250cm9sJmd0Oy48L2lucHV0PjwvY29kZXhfZGVsZWdhdGlvbj4nLFxuXHRcdFx0XHRcdFx0dGV4dF9lbGVtZW50czogW10sXG5cdFx0XHRcdFx0fV0sXG5cdFx0XHRcdH1dLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG51bGwsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRleHQ6IHR1cm5zWzBdLm1lc3NhZ2UudGV4dCxcblx0XHRcdGRlbGVnYXRpb246IHJlYWRBZ2VudE1lc3NhZ2VEZWxlZ2F0aW9uTWV0YSh0dXJuc1swXS5tZXNzYWdlKSxcblx0XHR9LCB7XG5cdFx0XHR0ZXh0OiAnT3BlbiA8dGhlIGNvbnRyb2w+LicsXG5cdFx0XHRkZWxlZ2F0aW9uOiB7IHNvdXJjZVRocmVhZElkOiAnc291cmNlLXRocmVhZCcgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgY3JlYXRlLXRocmVhZCBvdXRjb21lcyBhcyBvbmUgbGluayB0b29sIGFuZCByZW1vdmVzIHRoZSBtYXRjaGluZyBkaXJlY3RpdmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdGFyZ2V0VGhyZWFkSWQgPSAnMDE5ZmY1OTAtNjVlNS03OTQwLTk0M2YtZDJhODcxOGMzNThiJztcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdDcmVhdGUgYW5vdGhlciBjaGF0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJyxcblx0XHRcdFx0XHRcdGlkOiAndG9vbC0xJyxcblx0XHRcdFx0XHRcdG5hbWVzcGFjZTogJ2NvZGV4X2FwcCcsXG5cdFx0XHRcdFx0XHR0b29sOiAnY3JlYXRlX3RocmVhZCcsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IHsgcHJvbXB0OiAnUmVtZW1iZXIgdGhpcyB3b3JkOiBjYXB5YmFyYScsIHRhcmdldDogeyB0eXBlOiAncHJvamVjdGxlc3MnIH0gfSxcblx0XHRcdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50SXRlbXM6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogJ1NjcmlwdCBjb21wbGV0ZWQnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6IEpTT04uc3RyaW5naWZ5KHsgdGhyZWFkSWQ6IHRhcmdldFRocmVhZElkLCBob3N0SWQ6ICdsb2NhbCcgfSkgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb25NczogMzAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FnZW50TWVzc2FnZScsXG5cdFx0XHRcdFx0XHRpZDogJ2ExJyxcblx0XHRcdFx0XHRcdHRleHQ6IGBDcmVhdGVkIGFub3RoZXIgY2hhdC5cXG5cXG46OmNyZWF0ZWQtdGhyZWFke3RocmVhZElkPVwiJHt0YXJnZXRUaHJlYWRJZH1cIn1gLFxuXHRcdFx0XHRcdFx0cGhhc2U6ICdmaW5hbF9hbnN3ZXInLFxuXHRcdFx0XHRcdFx0bWVtb3J5Q2l0YXRpb246IG51bGwsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLFxuXHRcdFx0XHRjb21wbGV0ZWRBdDogbnVsbCxcblx0XHRcdFx0ZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGNvbnN0IHRvb2xQYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRjb25zdCBtYXJrZG93blBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbmQocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pO1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gdG9vbFBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgdG9vbFBhcnQudG9vbENhbGwuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyB0b29sUGFydC50b29sQ2FsbCA6IHVuZGVmaW5lZDtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGFydEtpbmRzOiB0dXJuc1swXS5yZXNwb25zZVBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCksXG5cdFx0XHR0b29sTmFtZTogdG9vbENhbGw/LnRvb2xOYW1lLFxuXHRcdFx0dG9vbElucHV0OiB0b29sQ2FsbD8udG9vbElucHV0LFxuXHRcdFx0dG9vbE91dHB1dDogdG9vbENhbGw/LmNvbnRlbnQsXG5cdFx0XHRtYXJrZG93bjogbWFya2Rvd25QYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8gbWFya2Rvd25QYXJ0LmNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0cGFydEtpbmRzOiBbUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bl0sXG5cdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFx0XHR0b29sSW5wdXQ6IEpTT04uc3RyaW5naWZ5KHsgcHJvbXB0OiAnUmVtZW1iZXIgdGhpcyB3b3JkOiBjYXB5YmFyYScsIHRhcmdldDogeyB0eXBlOiAncHJvamVjdGxlc3MnIH0gfSwgbnVsbCwgMiksXG5cdFx0XHR0b29sT3V0cHV0OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6IGBhZ2VudC1ob3N0LXNlc3Npb246Ly9jb2RleC8ke3RhcmdldFRocmVhZElkfWAgfV0sXG5cdFx0XHRtYXJrZG93bjogJ0NyZWF0ZWQgYW5vdGhlciBjaGF0LicsXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHNlbmQtbWVzc2FnZSBvdXRjb21lcyBhcyBsaW5rcyB0byB0aGUgdGFyZ2V0IHRocmVhZCcsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXRUaHJlYWRJZCA9ICd0YXJnZXQtdGhyZWFkJztcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdTZW5kIGZvbycsIHRleHRfZWxlbWVudHM6IFtdIH1dIH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2R5bmFtaWNUb29sQ2FsbCcsXG5cdFx0XHRcdFx0XHRpZDogJ3Rvb2wtMScsXG5cdFx0XHRcdFx0XHRuYW1lc3BhY2U6ICdjb2RleF9hcHAnLFxuXHRcdFx0XHRcdFx0dG9vbDogJ3NlbmRfbWVzc2FnZV90b190aHJlYWQnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiB7IHRocmVhZElkOiB0YXJnZXRUaHJlYWRJZCwgcHJvbXB0OiAnZm9vJyB9LFxuXHRcdFx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRJdGVtczogW3sgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6IEpTT04uc3RyaW5naWZ5KHsgdGhyZWFkSWQ6IHRhcmdldFRocmVhZElkIH0pIH1dLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdGR1cmF0aW9uTXM6IDMwMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnYTEnLCB0ZXh0OiAnU2VudCBcdTIwMUNmb29cdTIwMUQgdG8gdGhhdCBjaGF0LicsIHBoYXNlOiAnZmluYWxfYW5zd2VyJywgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiBudWxsLFxuXHRcdFx0XHRjb21wbGV0ZWRBdDogbnVsbCxcblx0XHRcdFx0ZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGNvbnN0IHRvb2xQYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRjb25zdCB0b29sQ2FsbCA9IHRvb2xQYXJ0Py5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsICYmIHRvb2xQYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gdG9vbFBhcnQudG9vbENhbGwgOiB1bmRlZmluZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xOYW1lOiB0b29sQ2FsbD8udG9vbE5hbWUsXG5cdFx0XHR0b29sT3V0cHV0OiB0b29sQ2FsbD8uY29udGVudCxcblx0XHR9LCB7XG5cdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlLFxuXHRcdFx0dG9vbE91dHB1dDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29kZXgvJHt0YXJnZXRUaHJlYWRJZH1gIH1dLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyByb2xsb3V0IHRocmVhZCBvcGVyYXRpb25zIHdoZW4gdGhyZWFkL3JlYWQgb21pdHMgdGhlaXIgdG9vbCBpdGVtcycsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXRUaHJlYWRJZCA9ICd0YXJnZXQtdGhyZWFkJztcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybi1jcmVhdGUnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0NyZWF0ZSBhbm90aGVyIGNoYXQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdhZ2VudE1lc3NhZ2UnLFxuXHRcdFx0XHRcdFx0aWQ6ICdhMScsXG5cdFx0XHRcdFx0XHR0ZXh0OiBgQ3JlYXRlZCBhbm90aGVyIGNoYXQuXFxuXFxuOjpjcmVhdGVkLXRocmVhZHt0aHJlYWRJZD1cIiR7dGFyZ2V0VGhyZWFkSWR9XCJ9YCxcblx0XHRcdFx0XHRcdHBoYXNlOiAnZmluYWxfYW5zd2VyJyxcblx0XHRcdFx0XHRcdG1lbW9yeUNpdGF0aW9uOiBudWxsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG51bGwsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlkOiAndHVybi1zZW5kJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTInLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdTZW5kIGZvbycsIHRleHRfZWxlbWVudHM6IFtdIH1dIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdhMicsIHRleHQ6ICdTZW50IFx1MjAxQ2Zvb1x1MjAxRCB0byB0aGF0IGNoYXQuJywgcGhhc2U6ICdmaW5hbF9hbnN3ZXInLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG51bGwsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlciwgdW5kZWZpbmVkLCBuZXcgTWFwKFtcblx0XHRcdFsndHVybi1jcmVhdGUnLCBbe1xuXHRcdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFx0XHRcdHRhcmdldFRocmVhZElkLFxuXHRcdFx0XHRvcGVuTGluazogYGFnZW50LWhvc3Qtc2Vzc2lvbjovL2NvZGV4LyR7dGFyZ2V0VGhyZWFkSWR9YCxcblx0XHRcdFx0dG9vbElucHV0OiB7IHByb21wdDogJ1JlbWVtYmVyIGNhcHliYXJhJyB9LFxuXHRcdFx0fV1dLFxuXHRcdFx0Wyd0dXJuLXNlbmQnLCBbe1xuXHRcdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlLFxuXHRcdFx0XHR0YXJnZXRUaHJlYWRJZCxcblx0XHRcdFx0b3Blbkxpbms6IGBhZ2VudC1ob3N0LXNlc3Npb246Ly9jb2RleC8ke3RhcmdldFRocmVhZElkfWAsXG5cdFx0XHRcdHRvb2xJbnB1dDogeyBwcm9tcHQ6ICdmb28nIH0sXG5cdFx0XHR9XV0sXG5cdFx0XSkpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0bWFya2Rvd246IHR1cm4ucmVzcG9uc2VQYXJ0cy5maWx0ZXIocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24pLm1hcChwYXJ0ID0+IHBhcnQuY29udGVudCksXG5cdFx0XHR0b29sczogdHVybi5yZXNwb25zZVBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCkubWFwKHBhcnQgPT4gcGFydC50b29sQ2FsbC50b29sTmFtZSksXG5cdFx0fSkpLCBbe1xuXHRcdFx0bWFya2Rvd246IFsnQ3JlYXRlZCBhbm90aGVyIGNoYXQuJ10sXG5cdFx0XHR0b29sczogW1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5DcmVhdGVTZXNzaW9uXSxcblx0XHR9LCB7XG5cdFx0XHRtYXJrZG93bjogWydTZW50IFx1MjAxQ2Zvb1x1MjAxRCB0byB0aGF0IGNoYXQuJ10sXG5cdFx0XHR0b29sczogW1Nlc3Npb25TZXJ2ZXJUb29sTmFtZS5TZW5kTWVzc2FnZV0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdrZWVwcyBjcmVhdGUgYW5kIHNlbmQgb3V0Y29tZXMgdG8gdGhlIHNhbWUgdGFyZ2V0IHdoaWxlIGRlZHVwbGljYXRpbmcgZXF1aXZhbGVudCByZXBsYXkgZGF0YScsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXRUaHJlYWRJZCA9ICd0YXJnZXQtdGhyZWFkJztcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybi1hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdDcmVhdGUgYW5kIG1lc3NhZ2UgYSBjaGF0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJyxcblx0XHRcdFx0XHRcdGlkOiAnY3JlYXRlLXRvb2wnLFxuXHRcdFx0XHRcdFx0bmFtZXNwYWNlOiAnY29kZXhfYXBwJyxcblx0XHRcdFx0XHRcdHRvb2w6ICdjcmVhdGVfdGhyZWFkJyxcblx0XHRcdFx0XHRcdGFyZ3VtZW50czogeyBwcm9tcHQ6ICdSZW1lbWJlciBjYXB5YmFyYScgfSxcblx0XHRcdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb250ZW50SXRlbXM6IFt7IHR5cGU6ICdpbnB1dFRleHQnLCB0ZXh0OiBKU09OLnN0cmluZ2lmeSh7IHRocmVhZElkOiB0YXJnZXRUaHJlYWRJZCB9KSB9XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRkdXJhdGlvbk1zOiAxMDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJyxcblx0XHRcdFx0XHRcdGlkOiAnc2VuZC10b29sJyxcblx0XHRcdFx0XHRcdG5hbWVzcGFjZTogJ2NvZGV4X2FwcCcsXG5cdFx0XHRcdFx0XHR0b29sOiAnc2VuZF9tZXNzYWdlX3RvX3RocmVhZCcsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IHsgdGhyZWFkSWQ6IHRhcmdldFRocmVhZElkLCBwcm9tcHQ6ICdmb28nIH0sXG5cdFx0XHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRcdFx0Y29udGVudEl0ZW1zOiBbeyB0eXBlOiAnaW5wdXRUZXh0JywgdGV4dDogSlNPTi5zdHJpbmdpZnkoeyB0aHJlYWRJZDogdGFyZ2V0VGhyZWFkSWQgfSkgfV0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdFx0ZHVyYXRpb25NczogMTAwLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0dHlwZTogJ2FnZW50TWVzc2FnZScsXG5cdFx0XHRcdFx0XHRpZDogJ2ExJyxcblx0XHRcdFx0XHRcdHRleHQ6IGBEb25lLlxcblxcbjo6Y3JlYXRlZC10aHJlYWR7dGhyZWFkSWQ9XCIke3RhcmdldFRocmVhZElkfVwifWAsXG5cdFx0XHRcdFx0XHRwaGFzZTogJ2ZpbmFsX2Fuc3dlcicsXG5cdFx0XHRcdFx0XHRtZW1vcnlDaXRhdGlvbjogbnVsbCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG51bGwsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlciwgdW5kZWZpbmVkLCBuZXcgTWFwKFtbJ3R1cm4tYScsIFt7XG5cdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFx0XHR0YXJnZXRUaHJlYWRJZCxcblx0XHRcdG9wZW5MaW5rOiBgYWdlbnQtaG9zdC1zZXNzaW9uOi8vY29kZXgvJHt0YXJnZXRUaHJlYWRJZH1gLFxuXHRcdFx0dG9vbElucHV0OiB7IHByb21wdDogJ1JlbWVtYmVyIGNhcHliYXJhJyB9LFxuXHRcdH1dXV0pKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dG9vbHM6IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNcblx0XHRcdFx0LmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbClcblx0XHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQudG9vbENhbGwudG9vbE5hbWUpLFxuXHRcdFx0bWFya2Rvd246IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNcblx0XHRcdFx0LmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bilcblx0XHRcdFx0Lm1hcChwYXJ0ID0+IHBhcnQuY29udGVudCksXG5cdFx0fSwge1xuXHRcdFx0dG9vbHM6IFtTZXNzaW9uU2VydmVyVG9vbE5hbWUuQ3JlYXRlU2Vzc2lvbiwgU2Vzc2lvblNlcnZlclRvb2xOYW1lLlNlbmRNZXNzYWdlXSxcblx0XHRcdG1hcmtkb3duOiBbJ0RvbmUuJ10sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3VzZXMgYSBkaXJlY3RpdmUgZmFsbGJhY2sgYnV0IGxlYXZlcyBkaXJlY3RpdmUgZXhhbXBsZXMgaW5zaWRlIGNvZGUgZmVuY2VzIHVuY2hhbmdlZCcsICgpID0+IHtcblx0XHRjb25zdCB0YXJnZXRUaHJlYWRJZCA9ICd0YXJnZXQtdGhyZWFkJztcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdDcmVhdGUgYW5vdGhlciBjaGF0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnYWdlbnRNZXNzYWdlJyxcblx0XHRcdFx0XHRcdGlkOiAnYTEnLFxuXHRcdFx0XHRcdFx0dGV4dDogW1xuXHRcdFx0XHRcdFx0XHQnQ3JlYXRlZCBhbm90aGVyIGNoYXQuJyxcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdGA6OmNyZWF0ZWQtdGhyZWFke3RocmVhZElkPVwiJHt0YXJnZXRUaHJlYWRJZH1cIn1gLFxuXHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0J2BgYHRleHQnLFxuXHRcdFx0XHRcdFx0XHQnOjpjcmVhdGVkLXRocmVhZHt0aHJlYWRJZD1cImV4YW1wbGUtb25seVwifScsXG5cdFx0XHRcdFx0XHRcdCdgYGB0eXBlc2NyaXB0Jyxcblx0XHRcdFx0XHRcdFx0Jzo6Y3JlYXRlZC10aHJlYWR7dGhyZWFkSWQ9XCJhZnRlci1pbmZvLXN0cmluZ1wifScsXG5cdFx0XHRcdFx0XHRcdCcnLFxuXHRcdFx0XHRcdFx0XHQnJyxcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdCcgICAgOjpjcmVhdGVkLXRocmVhZHt0aHJlYWRJZD1cImluZGVudGVkLWV4YW1wbGVcIn0nLFxuXHRcdFx0XHRcdFx0XHQnYGBgJyxcblx0XHRcdFx0XHRcdFx0JycsXG5cdFx0XHRcdFx0XHRcdCcgICAgOjpjcmVhdGVkLXRocmVhZHt0aHJlYWRJZD1cImluZGVudGVkLW91dHNpZGVcIn0nLFxuXHRcdFx0XHRcdFx0XS5qb2luKCdcXG4nKSxcblx0XHRcdFx0XHRcdHBoYXNlOiAnZmluYWxfYW5zd2VyJyxcblx0XHRcdFx0XHRcdG1lbW9yeUNpdGF0aW9uOiBudWxsLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IG51bGwsXG5cdFx0XHRcdGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblx0XHRjb25zdCB0b29sUGFydHMgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzLmZpbHRlcihwYXJ0ID0+IHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0Y29uc3QgbWFya2Rvd25QYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0dG9vbENvdW50OiB0b29sUGFydHMubGVuZ3RoLFxuXHRcdFx0dG9vbE5hbWU6IHRvb2xQYXJ0c1swXT8ua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCA/IHRvb2xQYXJ0c1swXS50b29sQ2FsbC50b29sTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdG1hcmtkb3duOiBtYXJrZG93blBhcnQ/LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyBtYXJrZG93blBhcnQuY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHR9LCB7XG5cdFx0XHR0b29sQ291bnQ6IDEsXG5cdFx0XHR0b29sTmFtZTogU2Vzc2lvblNlcnZlclRvb2xOYW1lLkNyZWF0ZVNlc3Npb24sXG5cdFx0XHRtYXJrZG93bjogW1xuXHRcdFx0XHQnQ3JlYXRlZCBhbm90aGVyIGNoYXQuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdgYGB0ZXh0Jyxcblx0XHRcdFx0Jzo6Y3JlYXRlZC10aHJlYWR7dGhyZWFkSWQ9XCJleGFtcGxlLW9ubHlcIn0nLFxuXHRcdFx0XHQnYGBgdHlwZXNjcmlwdCcsXG5cdFx0XHRcdCc6OmNyZWF0ZWQtdGhyZWFke3RocmVhZElkPVwiYWZ0ZXItaW5mby1zdHJpbmdcIn0nLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIDo6Y3JlYXRlZC10aHJlYWR7dGhyZWFkSWQ9XCJpbmRlbnRlZC1leGFtcGxlXCJ9Jyxcblx0XHRcdFx0J2BgYCcsXG5cdFx0XHRcdCcnLFxuXHRcdFx0XHQnICAgIDo6Y3JlYXRlZC10aHJlYWR7dGhyZWFkSWQ9XCJpbmRlbnRlZC1vdXRzaWRlXCJ9Jyxcblx0XHRcdF0uam9pbignXFxuJyksXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2lnbm9yZXMgc2ltaWxhcmx5IG5hbWVkIGR5bmFtaWMgdG9vbHMgZnJvbSBvdGhlciBuYW1lc3BhY2VzJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuLWEnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ0NhbGwgYW5vdGhlciB0b29sJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnZHluYW1pY1Rvb2xDYWxsJyxcblx0XHRcdFx0XHRcdGlkOiAndG9vbC0xJyxcblx0XHRcdFx0XHRcdG5hbWVzcGFjZTogJ290aGVyX2FwcCcsXG5cdFx0XHRcdFx0XHR0b29sOiAnc2VuZF9tZXNzYWdlX3RvX3RocmVhZCcsXG5cdFx0XHRcdFx0XHRhcmd1bWVudHM6IHsgdGhyZWFkSWQ6ICd0YXJnZXQtdGhyZWFkJywgcHJvbXB0OiAnZm9vJyB9LFxuXHRcdFx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRJdGVtczogW3sgdHlwZTogJ2lucHV0VGV4dCcsIHRleHQ6IEpTT04uc3RyaW5naWZ5KHsgdGhyZWFkSWQ6ICd0YXJnZXQtdGhyZWFkJyB9KSB9XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRkdXJhdGlvbk1zOiAxMDAsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2ExJywgdGV4dDogJ0RvbmUuJywgcGhhc2U6ICdmaW5hbF9hbnN3ZXInLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG51bGwsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiBudWxsLFxuXHRcdFx0XHRkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMubWFwKHBhcnQgPT4gcGFydC5raW5kKSwgW1Jlc3BvbnNlUGFydEtpbmQuTWFya2Rvd25dKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgdHVybiB0aW1pbmcgZnJvbSB0aGUgcGVyc2lzdGVkIGNvZGV4IHRocmVhZCcsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFt7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndTEnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdoaScsIHRleHRfZWxlbWVudHM6IFtdIH1dIH1dLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IDE3ODUwNjAwMDAsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiA0MjAwLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRpZDogJ3R1cm5fYicsXG5cdFx0XHRcdGl0ZW1zOiBbeyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UyJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAnYWdhaW4nLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCxcblx0XHRcdFx0c3RhcnRlZEF0OiAxNzg1MDYwMTAwLCBjb21wbGV0ZWRBdDogMTc4NTA2MDEwMywgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH0sIHtcblx0XHRcdFx0aWQ6ICd0dXJuX2MnLFxuXHRcdFx0XHRpdGVtczogW3sgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MycsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2xlZ2FjeScsIHRleHRfZWxlbWVudHM6IFtdIH1dIH1dLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLFxuXHRcdFx0XHRzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCBzdGFydGVkQXQ6IHR1cm4uc3RhcnRlZEF0LCBkdXJhdGlvbjogdHVybi5kdXJhdGlvbiB9KSksIFtcblx0XHRcdHsgaWQ6ICd0dXJuX2EnLCBzdGFydGVkQXQ6ICcyMDI2LTA3LTI2VDEwOjAwOjAwLjAwMFonLCBkdXJhdGlvbjogNDIwMCB9LFxuXHRcdFx0eyBpZDogJ3R1cm5fYicsIHN0YXJ0ZWRBdDogJzIwMjYtMDctMjZUMTA6MDE6NDAuMDAwWicsIGR1cmF0aW9uOiAzMDAwIH0sXG5cdFx0XHR7IGlkOiAndHVybl9jJywgc3RhcnRlZEF0OiB1bmRlZmluZWQsIGR1cmF0aW9uOiB1bmRlZmluZWQgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZmFpbGVkIHR1cm4gbWFwcyB0byBUdXJuU3RhdGUuRXJyb3InLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSByZXBsYXlUaHJlYWRUb1R1cm5zKHtcblx0XHRcdGlkOiAndGhyJyxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UxJywgY29udGVudDogW3sgdHlwZTogJ3RleHQnLCB0ZXh0OiAncScsIHRleHRfZWxlbWVudHM6IFtdIH1dIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnZmFpbGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IHsgbWVzc2FnZTogJ29vcHMnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IHN0YXRlOiB0dXJuLnN0YXRlLCBlcnJvcjogdHVybi5lcnJvciB9KSksIFt7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkVycm9yLFxuXHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAnQ29kZXhFcnJvcicsIG1lc3NhZ2U6ICdvb3BzJyB9LFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndHVybiB3aXRoIG5vIHJlY29nbml6YWJsZSBpdGVtcyBpcyBkcm9wcGVkJywgKCkgPT4ge1xuXHRcdGNvbnN0IHR1cm5zID0gcmVwbGF5VGhyZWFkVG9UdXJucyh7XG5cdFx0XHRpZDogJ3RocicsXG5cdFx0XHR0dXJuczogW3tcblx0XHRcdFx0aWQ6ICd0dXJuX2EnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3BsYW4nLCBpZDogJ3AnLCB0ZXh0OiAncGxhbm5pbmcnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLCBbXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ211bHRpLXR1cm4gdGhyZWFkIHByZXNlcnZlcyBvcmRlcicsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGlkOiAndDEnLFxuXHRcdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2ZpcnN0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHRcdHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnYScsIHRleHQ6ICdvbmUnLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0aWQ6ICd0MicsXG5cdFx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MicsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ3NlY29uZCcsIHRleHRfZWxlbWVudHM6IFtdIH1dIH0sXG5cdFx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ2EyJywgdGV4dDogJ3R3bycsIHBoYXNlOiBudWxsLCBtZW1vcnlDaXRhdGlvbjogbnVsbCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHRcdH0sXG5cdFx0XHRdLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHQgPT4gdC5pZCksIFsndDEnLCAndDInXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2FkamFjZW50IGFnZW50TWVzc2FnZXMgaW4gYSB0dXJuIGFyZSBzZXBhcmF0ZWQgc28gYSBoZWFkaW5nIGtlZXBzIGl0cyBvd24gbGluZScsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2dvIG9uJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdhZ2VudE1lc3NhZ2UnLCBpZDogJ20xJywgdGV4dDogJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHRcdFx0eyB0eXBlOiAnYWdlbnRNZXNzYWdlJywgaWQ6ICdtMicsIHRleHQ6ICcjIyBDb25jbHVzaW9uXFxuXFxuRG9uZS4nLCBwaGFzZTogbnVsbCwgbWVtb3J5Q2l0YXRpb246IG51bGwgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdC8vIEhpc3RvcnkgcmVwbGF5IGVtaXRzIG9uZSBtYXJrZG93bkNvbnRlbnQgcGVyIE1hcmtkb3duIHBhcnQ7IHRoZSBjaGF0XG5cdFx0Ly8gbW9kZWwgY29hbGVzY2VzIGFkamFjZW50IG9uZXMgYnkgcGxhaW4gY29uY2F0ZW5hdGlvbiwgc28gdGhlIGpvaW5lZFxuXHRcdC8vIHRleHQgbXVzdCBrZWVwIGAjIyBDb25jbHVzaW9uYCBhdCB0aGUgc3RhcnQgb2YgYSBsaW5lLlxuXHRcdGNvbnN0IGpvaW5lZCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNcblx0XHRcdC5tYXAocGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24gPyAocGFydCBhcyB7IGNvbnRlbnQ6IHN0cmluZyB9KS5jb250ZW50IDogJycpXG5cdFx0XHQuam9pbignJyk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGpvaW5lZCwgJ0NvbnNvbGlkYXRpbmcgdGhlIHJlY29tbWVuZGF0aW9uIGFuZCB0cmFkZW9mZnMuXFxuXFxuIyMgQ29uY2x1c2lvblxcblxcbkRvbmUuJyk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbW1hbmRFeGVjdXRpb24gcmVuZGVycyBhIGNvbXBsZXRlZCB0ZXJtaW5hbCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSByZXBsYXlUaHJlYWRUb1R1cm5zKHtcblx0XHRcdGlkOiAndGhyJyxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdydW4gaXQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdjMScsXG5cdFx0XHRcdFx0XHRjb21tYW5kOiAnL2Jpbi96c2ggLWxjIFxcJ2xzIC1sYVxcJycsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICd0b3RhbCAwJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDUsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XSxcblx0XHRcdFx0aXRlbXNWaWV3OiB7IHR5cGU6ICdmdWxsJyB9IGFzIG5ldmVyLFxuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZWQnIGFzIG5ldmVyLFxuXHRcdFx0XHRlcnJvcjogbnVsbCwgc3RhcnRlZEF0OiBudWxsLCBjb21wbGV0ZWRBdDogbnVsbCwgZHVyYXRpb25NczogbnVsbCxcblx0XHRcdH1dLFxuXHRcdH0gYXMgbmV2ZXIpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5yZXNwb25zZVBhcnRzLmxlbmd0aCwgMSk7XG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kOyB0b29sQ2FsbDogeyB0b29sTmFtZTogc3RyaW5nOyBpbnZvY2F0aW9uTWVzc2FnZTogc3RyaW5nOyBwYXN0VGVuc2VNZXNzYWdlOiBzdHJpbmc7IHN1Y2Nlc3M6IGJvb2xlYW47IGNvbnRlbnQ/OiB7IHRleHQ6IHN0cmluZyB9W10gfSB9O1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0a2luZDogcGFydC5raW5kLFxuXHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhcnQudG9vbENhbGwucGFzdFRlbnNlTWVzc2FnZSxcblx0XHRcdHN1Y2Nlc3M6IHBhcnQudG9vbENhbGwuc3VjY2Vzcyxcblx0XHRcdG91dHB1dDogcGFydC50b29sQ2FsbC5jb250ZW50Py5bMF0udGV4dCxcblx0XHR9LCB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbE5hbWU6ICdzaGVsbCcsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ2xzIC1sYScsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGBscyAtbGFgJyxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRvdXRwdXQ6ICd0b3RhbCAwJyxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnaW1hZ2VHZW5lcmF0aW9uIHJlc3RvcmVzIGl0cyBnZW5lcmF0ZWQgaW1hZ2UnLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSByZXBsYXlUaHJlYWRUb1R1cm5zKHtcblx0XHRcdGlkOiAndGhyJyxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3R1cm5fYScsXG5cdFx0XHRcdGl0ZW1zOiBbXG5cdFx0XHRcdFx0eyB0eXBlOiAndXNlck1lc3NhZ2UnLCBpZDogJ3UnLCBjb250ZW50OiBbeyB0eXBlOiAndGV4dCcsIHRleHQ6ICdkcmF3IGl0JywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdpbWFnZUdlbmVyYXRpb24nLCBpZDogJ2ltYWdlXzEnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLCByZXZpc2VkUHJvbXB0OiAnQSB3YXRlcmNvbG9yIGZveCcsIHJlc3VsdDogJ2FXMWhaMlU9JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF07XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHtcblx0XHRcdHRvb2xOYW1lOiBwYXJ0LnRvb2xDYWxsLnRvb2xOYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHBhcnQudG9vbENhbGwuZGlzcGxheU5hbWUsXG5cdFx0XHR0b29sSW5wdXQ6IHBhcnQudG9vbENhbGwudG9vbElucHV0LFxuXHRcdFx0c3VjY2VzczogcGFydC50b29sQ2FsbC5zdWNjZXNzLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFydC50b29sQ2FsbC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0Y29udGVudDogcGFydC50b29sQ2FsbC5jb250ZW50LFxuXHRcdH0gOiB1bmRlZmluZWQsIHtcblx0XHRcdHRvb2xOYW1lOiAnaW1hZ2VfZ2VuLmltYWdlZ2VuJyxcblx0XHRcdGRpc3BsYXlOYW1lOiAnR2VuZXJhdGUgaW1hZ2UnLFxuXHRcdFx0dG9vbElucHV0OiAne1wicHJvbXB0XCI6XCJBIHdhdGVyY29sb3IgZm94XCJ9Jyxcblx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnR2VuZXJhdGVkIGltYWdlJyxcblx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlLCBkYXRhOiAnYVcxaFoyVT0nLCBjb250ZW50VHlwZTogJ2ltYWdlL3BuZycgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2NvbnRleHRDb21wYWN0aW9uIGlzIHJlc3RvcmVkIGFzIGEgY29tcGxldGVkIC9jb21wYWN0IHR1cm4nLCAoKSA9PiB7XG5cdFx0Y29uc3QgdHVybnMgPSByZXBsYXlUaHJlYWRUb1R1cm5zKHtcblx0XHRcdGlkOiAndGhyJyxcblx0XHRcdHR1cm5zOiBbe1xuXHRcdFx0XHRpZDogJ3R1cm5fY29tcGFjdCcsXG5cdFx0XHRcdGl0ZW1zOiBbeyB0eXBlOiAnY29udGV4dENvbXBhY3Rpb24nLCBpZDogJ2NvbXBhY3RfMScgfV0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0c1swXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bWVzc2FnZTogdHVybnNbMF0ubWVzc2FnZSxcblx0XHRcdGtpbmQ6IHBhcnQua2luZCxcblx0XHRcdHRvb2xDYWxsOiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgJiYgcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHtcblx0XHRcdFx0c3RhdHVzOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyxcblx0XHRcdFx0dG9vbE5hbWU6IHBhcnQudG9vbENhbGwudG9vbE5hbWUsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBwYXJ0LnRvb2xDYWxsLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFydC50b29sQ2FsbC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0XHRzdWNjZXNzOiBwYXJ0LnRvb2xDYWxsLnN1Y2Nlc3MsXG5cdFx0XHR9IDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJy9jb21wYWN0Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdHRvb2xDYWxsOiB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sTmFtZTogJ2NvbXBhY3QnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0NvbXBhY3QgY29udmVyc2F0aW9uJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDb21wYWN0aW5nIGNvbnZlcnNhdGlvbicsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdDb21wYWN0ZWQgY29udmVyc2F0aW9uJyxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2F1dG9tYXRpYyBjb250ZXh0Q29tcGFjdGlvbiByZW1haW5zIHByb2dyZXNzIHdpdGhpbiBpdHMgZXhpc3RpbmcgdHVybicsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hdXRvX2NvbXBhY3QnLFxuXHRcdFx0XHRpdGVtczogW1xuXHRcdFx0XHRcdHsgdHlwZTogJ3VzZXJNZXNzYWdlJywgaWQ6ICd1MScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2NvbnRpbnVlJywgdGV4dF9lbGVtZW50czogW10gfV0gfSxcblx0XHRcdFx0XHR7IHR5cGU6ICdjb250ZXh0Q29tcGFjdGlvbicsIGlkOiAnY29tcGFjdF8xJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ2FnZW50TWVzc2FnZScsIGlkOiAnYTEnLCB0ZXh0OiAnY29udGludWVkJywgcGhhc2U6IG51bGwsIG1lbW9yeUNpdGF0aW9uOiBudWxsIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdGl0ZW1zVmlldzogeyB0eXBlOiAnZnVsbCcgfSBhcyBuZXZlcixcblx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGVkJyBhcyBuZXZlcixcblx0XHRcdFx0ZXJyb3I6IG51bGwsIHN0YXJ0ZWRBdDogbnVsbCwgY29tcGxldGVkQXQ6IG51bGwsIGR1cmF0aW9uTXM6IG51bGwsXG5cdFx0XHR9XSxcblx0XHR9IGFzIG5ldmVyKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJuc1swXS5tZXNzYWdlLnRleHQsICdjb250aW51ZScpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5tYXAocGFydCA9PiBwYXJ0LmtpbmQpLCBbXG5cdFx0XHRSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0UmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnY29tbWFuZEV4ZWN1dGlvbiBjb2FsZXNjZXMgYSBzYW5kYm94IHByZS1mbGlnaHQgd2l0aCBpdHMgcmUtcnVuIGludG8gb25lIGJveCcsICgpID0+IHtcblx0XHRjb25zdCB0dXJucyA9IHJlcGxheVRocmVhZFRvVHVybnMoe1xuXHRcdFx0aWQ6ICd0aHInLFxuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAndHVybl9hJyxcblx0XHRcdFx0aXRlbXM6IFtcblx0XHRcdFx0XHR7IHR5cGU6ICd1c2VyTWVzc2FnZScsIGlkOiAndScsIGNvbnRlbnQ6IFt7IHR5cGU6ICd0ZXh0JywgdGV4dDogJ2N1cmwgaXQnLCB0ZXh0X2VsZW1lbnRzOiBbXSB9XSB9LFxuXHRcdFx0XHRcdC8vIFByZS1mbGlnaHQ6IHNhbWUgY29tbWFuZCwgbm8gb3V0cHV0LCBzdWNjZXNzIFx1MjE5MiBkZWZlcnJlZC5cblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHR0eXBlOiAnY29tbWFuZEV4ZWN1dGlvbicsIGlkOiAncHJlJyxcblx0XHRcdFx0XHRcdGNvbW1hbmQ6ICdjdXJsIC1zIGh0dHBzOi8vZXhhbXBsZS5jb20nLCBjd2Q6ICcvdG1wJywgcHJvY2Vzc0lkOiBudWxsLFxuXHRcdFx0XHRcdFx0c291cmNlOiAnYWdlbnQnLCBzdGF0dXM6ICdjb21wbGV0ZWQnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZEFjdGlvbnM6IFtdLCBhZ2dyZWdhdGVkT3V0cHV0OiAnJywgZXhpdENvZGU6IDAsIGR1cmF0aW9uTXM6IDMsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHQvLyBFc2NhbGF0ZWQgcmUtcnVuOiBzYW1lIGNvbW1hbmQsIHJlYWwgb3V0cHV0LlxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdHR5cGU6ICdjb21tYW5kRXhlY3V0aW9uJywgaWQ6ICdlc2MnLFxuXHRcdFx0XHRcdFx0Y29tbWFuZDogJ2N1cmwgLXMgaHR0cHM6Ly9leGFtcGxlLmNvbScsIGN3ZDogJy90bXAnLCBwcm9jZXNzSWQ6IG51bGwsXG5cdFx0XHRcdFx0XHRzb3VyY2U6ICdhZ2VudCcsIHN0YXR1czogJ2NvbXBsZXRlZCcsXG5cdFx0XHRcdFx0XHRjb21tYW5kQWN0aW9uczogW10sIGFnZ3JlZ2F0ZWRPdXRwdXQ6ICdFeGFtcGxlIERvbWFpbicsIGV4aXRDb2RlOiAwLCBkdXJhdGlvbk1zOiAzMCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRpdGVtc1ZpZXc6IHsgdHlwZTogJ2Z1bGwnIH0gYXMgbmV2ZXIsXG5cdFx0XHRcdHN0YXR1czogJ2NvbXBsZXRlZCcgYXMgbmV2ZXIsXG5cdFx0XHRcdGVycm9yOiBudWxsLCBzdGFydGVkQXQ6IG51bGwsIGNvbXBsZXRlZEF0OiBudWxsLCBkdXJhdGlvbk1zOiBudWxsLFxuXHRcdFx0fV0sXG5cdFx0fSBhcyBuZXZlcik7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0Ly8gRXhhY3RseSBvbmUgYm94IFx1MjAxNCB0aGUgcHJlLWZsaWdodCBpcyBjb2FsZXNjZWQgYXdheS5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5sZW5ndGgsIDEpO1xuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdIGFzIHsgdG9vbENhbGw6IHsgY29udGVudD86IHsgdGV4dDogc3RyaW5nIH1bXSB9IH07XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuY29udGVudD8uWzBdLnRleHQsICdFeGFtcGxlIERvbWFpbicpO1xuXHR9KTtcbn0pO1xuIl0sCiAgIm1hcHBpbmdzIjogIkFBS0EsT0FBTyxZQUFZO0FBQ25CLFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMsMkJBQTJCO0FBQ3BDLFNBQVMsYUFBYSxrQkFBa0IsZ0JBQWdCLHVCQUF1QixpQkFBc0M7QUFFckgsTUFBTSxxQkFBcUIsTUFBTTtBQUVoQywwQ0FBd0M7QUFFeEMsT0FBSyxnQ0FBMkIsTUFBTTtBQUNyQyxVQUFNLFFBQVEsb0JBQW9CLEVBQUUsSUFBSSxPQUFPLE9BQU8sQ0FBQyxFQUFFLENBQVU7QUFDbkUsV0FBTyxnQkFBZ0IsT0FBTyxDQUFDLENBQUM7QUFBQSxFQUNqQyxDQUFDO0FBRUQsT0FBSyx1REFBa0QsTUFBTTtBQUM1RCxVQUFNLFFBQVEsb0JBQW9CO0FBQUEsTUFDakMsSUFBSTtBQUFBLE1BQ0osT0FBTyxDQUFDO0FBQUEsUUFDUCxJQUFJO0FBQUEsUUFD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
