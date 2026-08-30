import assert from "assert";
import { URI } from "../../../../base/common/uri.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../base/test/common/utils.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { AgentSession } from "../../common/agent.js";
import { MessageAttachmentKind, MessageKind, ResponsePartKind, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { appendSdkToolResultContent, mapSessionEvents } from "../../node/copilot/mapSessionEvents.js";
import { toSessionEvents } from "./copilotTestEvents.js";
suite("mapSessionEvents \u2014 history replay", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  function partKinds(parts) {
    return parts.map((p) => p.kind === ResponsePartKind.Markdown || p.kind === ResponsePartKind.SystemNotification ? { kind: p.kind, content: p.content } : { kind: p.kind });
  }
  test("task_complete with a summary renders as a markdown part, not a tool call", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "Working on it.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "task_complete", arguments: { summary: "Done. All good." } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.Markdown, content: "Working on it." },
      { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Done. All good." }
    ]);
  });
  test("restores Auto model resolution as usage metadata", async () => {
    const autoModeResolved = {
      chosenModel: "claude-opus-4.8",
      reasoningBucket: "high",
      categoryScores: { reasoning: 0.91, code_gen: 0.72 },
      predictedLabel: "needs_reasoning",
      confidence: 0.93,
      candidateModels: ["claude-opus-4.8", "claude-sonnet-4.6"]
    };
    const events = [
      { type: "user.message", id: "turn-before-auto", data: { interactionId: "m0", content: "First prompt" } },
      { type: "assistant.message", data: { messageId: "m1", content: "First response." } },
      // The runtime resolves Auto while building settings, before it persists
      // the user message for the turn that will use the chosen model.
      { type: "session.auto_mode_resolved", data: autoModeResolved },
      { type: "user.message", id: "turn-auto", data: { interactionId: "m1", content: "Solve this problem" } },
      { type: "assistant.message", data: { messageId: "m2", content: "Done." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, usage: turn.usage })), [
      { id: "turn-before-auto", usage: void 0 },
      {
        id: "turn-auto",
        usage: {
          model: "claude-opus-4.8",
          _meta: { autoModeResolved }
        }
      }
    ]);
  });
  test("task_complete without a summary renders nothing", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "All set.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "task_complete", arguments: {} } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.Markdown, content: "All set." }
    ]);
  });
  test("fallback task_complete marks the turn complete", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "finish the task" } },
      { type: "assistant.message", data: { messageId: "m2", content: "All done.", toolRequests: [{ toolCallId: "tc-1", name: "task_complete", arguments: { summary: "Finished." } }] } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "All done." },
        { kind: ResponsePartKind.Markdown, content: "\n\n**Task completed:** Finished." }
      ]
    }]);
  });
  test("a regular tool still renders as a tool call", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo hi" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "hi\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall }
    ]);
  });
  test("resolves relative patch links in restored tool messages", async () => {
    const patch = [
      "*** Begin Patch",
      "*** Update File: src/file.ts",
      "@@",
      "-old",
      "+new",
      "*** End Patch"
    ].join("\n");
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "edit the file" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "apply_patch" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "apply_patch", arguments: patch } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events), URI.file("/workspace"));
    const part = turns[0].responseParts.find((part2) => part2.kind === ResponsePartKind.ToolCall);
    assert.ok(part);
    assert.deepStrictEqual({
      invocationMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.invocationMessage : void 0,
      pastTenseMessage: part.toolCall.status === ToolCallStatus.Completed ? part.toolCall.pastTenseMessage : void 0
    }, {
      invocationMessage: { markdown: "Edit [file.ts](file:///workspace/src/file.ts)" },
      pastTenseMessage: { markdown: "Edit [file.ts](file:///workspace/src/file.ts)" }
    });
  });
  test("restores MCP app data for completed tool calls", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "call an MCP app tool" } },
      {
        type: "assistant.message",
        data: {
          messageId: "m2",
          content: "",
          toolRequests: [{
            toolCallId: "tc-1",
            name: "GitHub-get_me",
            arguments: {},
            type: "function",
            mcpServerName: "GitHub",
            mcpToolName: "get_me"
          }]
        }
      },
      {
        type: "tool.execution_start",
        data: {
          toolCallId: "tc-1",
          toolName: "GitHub-get_me",
          arguments: {},
          mcpServerName: "GitHub",
          mcpToolName: "get_me",
          toolDescription: {
            _meta: {
              ui: {
                resourceUri: "ui://github-mcp-server/get-me"
              }
            }
          }
        }
      },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: { content: '{"login":"octocat"}' }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.deepStrictEqual({
      contributor: part.toolCall.contributor,
      meta: readToolCallMeta(part.toolCall)
    }, {
      contributor: {
        kind: ToolCallContributorKind.MCP,
        customizationId: "mcp-top-level:copilot:test-session:GitHub"
      },
      meta: {
        mcpServerName: "GitHub",
        mcpToolName: "get_me",
        ui: {
          resourceUri: "ui://github-mcp-server/get-me",
          channel: "mcp://copilot/test-session/GitHub"
        }
      }
    });
  });
  test("derives shell tool intention from the description argument on replay", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "ls", description: "List files in the repo root" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "a\nb\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.intention, "List files in the repo root");
  });
  test("maps SDK image content to an embedded resource on replayed tool completion", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "view the image" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "view_image" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "view_image", arguments: { path: "/repo/image.png" } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "Viewed image file successfully.",
            contents: [{ type: "image", data: "iVBORw0KGgo=", mimeType: "image/png" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.deepStrictEqual(part.toolCall.content, [
      { type: ToolResultContentType.Text, text: "Viewed image file successfully." },
      { type: ToolResultContentType.EmbeddedResource, data: "iVBORw0KGgo=", contentType: "image/png" }
    ]);
  });
  test("maps SDK shell_exit content to terminal completion on replayed tool completion", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo hi" } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "hi\n",
            contents: [{ type: "shell_exit", shellId: "0", exitCode: 0, cwd: "/repo", outputPreview: "hi\n" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.deepStrictEqual(part.toolCall.content, [
      { type: ToolResultContentType.Text, text: "hi\n" },
      {
        type: ToolResultContentType.Terminal,
        resource: "agenthost-terminal://shell/test-session/tc-1",
        title: "Run Shell Command",
        isPty: false,
        result: { exitCode: 0, preview: "hi\n" }
      }
    ]);
  });
  test("does not classify read_bash shell_exit metadata as a terminal completion on replay", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "read_bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "read_bash", arguments: { shellId: "build", delay: 0 } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "Build completed\n",
            contents: [{ type: "shell_exit", shellId: "build", exitCode: 0, outputPreview: "Build completed\n" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.deepStrictEqual({
      toolKind: readToolCallMeta(part.toolCall).toolKind,
      pastTenseMessage: part.toolCall.pastTenseMessage,
      content: part.toolCall.content
    }, {
      toolKind: void 0,
      pastTenseMessage: "Read Terminal",
      content: [{ type: ToolResultContentType.Text, text: "Build completed\n" }]
    });
  });
  test("preserves non-zero terminal completion even when SDK tool completion succeeded", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "gti status" } } },
      {
        type: "tool.execution_complete",
        data: {
          toolCallId: "tc-1",
          success: true,
          result: {
            content: "command not found\n",
            contents: [{ type: "shell_exit", shellId: "0", exitCode: 127, cwd: "/repo" }]
          }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const part = turns[0].responseParts[0];
    assert.strictEqual(part.kind, ResponsePartKind.ToolCall);
    assert.strictEqual(part.toolCall.status, ToolCallStatus.Completed);
    if (part.toolCall.status !== ToolCallStatus.Completed) {
      return;
    }
    assert.strictEqual(part.toolCall.success, true);
    assert.deepStrictEqual(part.toolCall.content?.find((content) => content.type === ToolResultContentType.Terminal), {
      type: ToolResultContentType.Terminal,
      resource: "agenthost-terminal://shell/test-session/tc-1",
      title: "Run Shell Command",
      isPty: false,
      result: { exitCode: 127 }
    });
  });
  test("restores best-effort model, fallback agent, and attachments onto user messages", async () => {
    const events = [
      { type: "session.model_change", data: { newModel: "opus-4.7" } },
      { type: "subagent.selected", data: { agentName: "reviewer", agentDisplayName: "Reviewer", tools: null } },
      {
        type: "user.message",
        data: {
          interactionId: "m1",
          content: "hi",
          attachments: [{
            type: "file",
            path: "/tmp/example.ts",
            displayName: "example.ts"
          }]
        }
      },
      { type: "assistant.message", data: { messageId: "m2", content: "hello" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events), {
      model: { id: "fallback-model" },
      agent: { uri: "fallback-agent" }
    });
    assert.deepStrictEqual({
      model: turns[0].message.model,
      agent: turns[0].message.agent,
      attachments: turns[0].message.attachments?.map((a) => ({
        type: a.type,
        uri: a.type === MessageAttachmentKind.Resource ? a.uri : void 0,
        label: a.label
      }))
    }, {
      model: { id: "opus-4.7" },
      agent: { uri: "fallback-agent" },
      attachments: [{
        type: MessageAttachmentKind.Resource,
        uri: "file:///tmp/example.ts",
        label: "example.ts"
      }]
    });
  });
  test("seeds the model from session.start selectedModel when no launch model is supplied", async () => {
    const events = [
      { type: "session.start", data: { selectedModel: "opus-5" } },
      { type: "user.message", data: { interactionId: "m1", content: "hi" } },
      { type: "assistant.message", data: { messageId: "m2", content: "hello" } },
      { type: "user.message", data: { interactionId: "m3", content: "again" } },
      { type: "session.model_change", data: { newModel: "gpt-5" } },
      { type: "user.message", data: { interactionId: "m4", content: "switched" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((t) => t.message.model), [
      { id: "opus-5" },
      { id: "opus-5" },
      { id: "gpt-5" }
    ]);
  });
  test("uses top-level user messages as turn boundaries", async () => {
    const events = [
      { type: "user.message", id: "user-event-1", data: { interactionId: "interaction-1", content: "Investigate this issue" } },
      { type: "assistant.message", id: "initial-round", data: { interactionId: "interaction-1", content: "I found a likely cause.", toolRequests: [] } },
      { type: "assistant.message", id: "tool-round", data: { interactionId: "interaction-2", content: "I will verify it.", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo investigating" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "investigating\n" } } },
      { type: "assistant.message", id: "empty-round", data: { interactionId: "interaction-2", content: "", toolRequests: [], reasoningOpaque: "opaque-reasoning" } },
      { type: "assistant.message", id: "final-round", data: { interactionId: "interaction-2", content: "Investigation complete.", toolRequests: [] } },
      { type: "user.message", id: "user-event-2", data: { interactionId: "interaction-3", content: "Thanks" } },
      { type: "assistant.message", id: "acknowledgement", data: { interactionId: "interaction-3", content: "You are welcome.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [
      {
        id: "user-event-1",
        message: "Investigate this issue",
        state: TurnState.Complete,
        parts: [
          { kind: ResponsePartKind.Markdown, content: "I found a likely cause." },
          { kind: ResponsePartKind.Markdown, content: "I will verify it." },
          { kind: ResponsePartKind.ToolCall },
          { kind: ResponsePartKind.Markdown, content: "Investigation complete." }
        ]
      },
      {
        id: "user-event-2",
        message: "Thanks",
        state: TurnState.Complete,
        parts: [
          { kind: ResponsePartKind.Markdown, content: "You are welcome." }
        ]
      }
    ]);
  });
  test("restores a system notification inside an assistant turn as a response part", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Wait for the background command" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nShell command completed\n</system_notification>",
          kind: { type: "shell_completed", shellId: "shell-a", exitCode: 0, description: "sleep 6" }
        }
      },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "Reading the output now.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      message: { text: "Wait for the background command", origin: { kind: MessageKind.User } },
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.SystemNotification, content: "`sleep 6` completed" },
        { kind: ResponsePartKind.Markdown, content: "Reading the output now." }
      ]
    }]);
  });
  test("restores an idle system notification and resumed response in the preceding turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Start the background agent" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "The background agent is running.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nAgent completed\n</system_notification>",
          kind: { type: "agent_idle", agentId: "agent-a", agentType: "general-purpose" }
        }
      },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-2" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "Reading the background agent result.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      message: { text: "Start the background agent", origin: { kind: MessageKind.User } },
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "The background agent is running." },
        { kind: ResponsePartKind.SystemNotification, content: "Background agent agent-a is complete" },
        { kind: ResponsePartKind.Markdown, content: "Reading the background agent result." }
      ]
    }]);
  });
  test("does not restore a passive notification outside an assistant turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Check for instructions" } },
      { type: "assistant.turn_start", data: { turnId: "0", interactionId: "interaction-1" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "No new instructions.", toolRequests: [] } },
      { type: "assistant.turn_end", data: { turnId: "0" } },
      {
        type: "system.notification",
        id: "notification-event",
        data: {
          content: "<system_notification>\nInstruction discovered\n</system_notification>",
          kind: { type: "instruction_discovered", sourcePath: "AGENTS.md", triggerFile: "src/index.ts", triggerTool: "view", description: "Workspace instructions" }
        }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      parts: [{ kind: ResponsePartKind.Markdown, content: "No new instructions." }]
    }]);
  });
  test("synthetic user messages do not start a new turn", async () => {
    const events = [
      { type: "user.message", id: "user-event-1", data: { interactionId: "interaction-1", content: "Use the skill" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "I will use it.", toolRequests: [] } },
      { type: "user.message", id: "synthetic-event", data: { interactionId: "interaction-2", content: "Injected skill content", source: "skill" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "The skill is complete.", toolRequests: [] } },
      { type: "user.message", id: "user-event-2", data: { interactionId: "interaction-3", content: "Thanks" } },
      { type: "assistant.message", data: { interactionId: "interaction-3", content: "You are welcome.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      parts: partKinds(turn.responseParts)
    })), [
      {
        id: "user-event-1",
        message: "Use the skill",
        parts: [
          { kind: ResponsePartKind.Markdown, content: "I will use it." },
          { kind: ResponsePartKind.Markdown, content: "The skill is complete." }
        ]
      },
      {
        id: "user-event-2",
        message: "Thanks",
        parts: [
          { kind: ResponsePartKind.Markdown, content: "You are welcome." }
        ]
      }
    ]);
  });
  test("strips prompt scaffolding from user message content", async () => {
    const wrapped = 'hi\n <reminder>\nIMPORTANT: ignore this\n</reminder>\n<attachments>\n<attachment id="microsoft/vscode">repo</attachment>\n</attachments>\n<userRequest>\nhi\n</userRequest>\n';
    const events = [
      { type: "user.message", id: "wrapped", data: { interactionId: "interaction-1", content: wrapped } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "Hello.", toolRequests: [] } },
      { type: "user.message", id: "wrapper-only", data: { interactionId: "interaction-2", content: "<userRequest>hi5</userRequest>" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "Hi again.", toolRequests: [] } },
      { type: "user.message", id: "empty-wrapper", data: { interactionId: "interaction-3", content: "/remote <reminder>x</reminder><userRequest></userRequest>" } },
      { type: "assistant.message", data: { interactionId: "interaction-3", content: "Ok remote.", toolRequests: [] } },
      { type: "user.message", id: "plain", data: { interactionId: "interaction-4", content: "just text" } },
      { type: "assistant.message", data: { interactionId: "interaction-4", content: "Ok.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => turn.message.text), ["hi", "hi5", "/remote", "just text"]);
  });
  test("terminal empty assistant message completes a tool-only turn", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Close out the todos" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [{ toolCallId: "tc-1", name: "todo" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "todo", arguments: { status: "done" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      message: turn.message.text,
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      message: "Close out the todos",
      state: TurnState.Complete,
      parts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    }]);
  });
  test("tool-only turn without a terminal assistant message remains cancelled", async () => {
    const events = [
      { type: "user.message", id: "user-event", data: { interactionId: "interaction-1", content: "Run the command" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "", toolRequests: [{ toolCallId: "tc-1", name: "bash" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-1", toolName: "bash", arguments: { command: "echo done" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-1", success: true, result: { content: "done\n" } } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    }]);
  });
  test("abort remains terminal for the turn", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "interaction-1", content: "Wait for the task" } },
      { type: "assistant.message", data: { interactionId: "interaction-1", content: "The task is complete.", toolRequests: [] } },
      { type: "abort", data: { reason: "user initiated" } },
      { type: "assistant.message", data: { interactionId: "interaction-2", content: "Late completion.", toolRequests: [] } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      state: turn.state,
      parts: partKinds(turn.responseParts)
    })), [{
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "The task is complete." },
        { kind: ResponsePartKind.Markdown, content: "Late completion." }
      ]
    }]);
  });
  test("restores a request error as terminal turn state", async () => {
    const events = [
      {
        type: "session.error",
        data: { errorType: "unassociated", message: "Ignore this session diagnostic." }
      },
      {
        type: "user.message",
        id: "user-event",
        timestamp: "2026-07-29T10:00:00.000Z",
        data: { interactionId: "interaction-1", content: "Complete this request" }
      },
      {
        type: "assistant.turn_start",
        data: { turnId: "assistant-turn", interactionId: "interaction-1" }
      },
      {
        type: "assistant.message",
        timestamp: "2026-07-29T10:00:01.000Z",
        data: { interactionId: "interaction-1", content: "Working on it.", toolRequests: [] }
      },
      {
        type: "assistant.turn_end",
        data: { turnId: "assistant-turn", interactionId: "interaction-1" }
      },
      {
        type: "session.error",
        id: "error-event",
        timestamp: "2026-07-29T10:00:02.000Z",
        data: {
          errorType: "quota",
          errorCode: "quota_exceeded",
          message: "No premium requests remain.",
          stack: "Error: No premium requests remain.",
          statusCode: 402,
          providerCallId: "provider-request-id",
          serviceRequestId: "service-request-id"
        }
      },
      {
        type: "assistant.message",
        data: { interactionId: "interaction-1", content: "Late completion.", toolRequests: [] }
      }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({
      id: turn.id,
      state: turn.state,
      duration: turn.duration,
      error: turn.error,
      parts: partKinds(turn.responseParts)
    })), [{
      id: "user-event",
      state: TurnState.Error,
      duration: 2e3,
      error: {
        errorType: "quota",
        message: "No premium requests remain.",
        stack: "Error: No premium requests remain.",
        _meta: {
          chatError: {
            fetchError: {
              type: "quotaExceeded",
              reason: "No premium requests remain.",
              requestId: "provider-request-id",
              serverRequestId: "service-request-id",
              capiError: {
                code: "quota_exceeded",
                message: "No premium requests remain."
              }
            }
          }
        }
      },
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Working on it." },
        { kind: ResponsePartKind.Markdown, content: "Late completion." }
      ]
    }]);
  });
  test("restores turn timing from the SDK event envelopes", async () => {
    const events = [
      { type: "user.message", id: "turn-1", timestamp: "2026-07-29T10:00:00.000Z", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:00:03.500Z", data: { messageId: "m2", content: "First answer." } },
      { type: "user.message", id: "turn-2", timestamp: "2026-07-29T10:05:00.000Z", data: { interactionId: "m3", content: "second" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:05:01.000Z", data: { messageId: "m4", content: "Second answer." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: "2026-07-29T10:00:00.000Z", duration: 3500 },
      { id: "turn-2", startedAt: "2026-07-29T10:05:00.000Z", duration: 1e3 }
    ]);
  });
  test("bounds turn duration by the last event belonging to the turn", async () => {
    const events = [
      { type: "user.message", id: "turn-1", timestamp: "2026-07-29T10:00:00.000Z", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.turn_start", timestamp: "2026-07-29T10:00:00.500Z", data: { turnId: "t1" } },
      { type: "assistant.message", timestamp: "2026-07-29T10:00:03.500Z", data: { messageId: "m2", content: "First answer." } },
      { type: "assistant.turn_end", timestamp: "2026-07-29T10:00:04.000Z", data: { turnId: "t1" } },
      // Ignored by the mapper an hour later: it must not extend the turn.
      { type: "session.unrelated_event", timestamp: "2026-07-29T11:00:00.000Z" }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: "2026-07-29T10:00:00.000Z", duration: 4e3 }
    ]);
  });
  test("leaves turn timing undefined when envelopes carry no usable timestamp", async () => {
    const events = [
      { type: "user.message", id: "turn-1", data: { interactionId: "m1", content: "first" } },
      { type: "assistant.message", timestamp: "not-a-date", data: { messageId: "m2", content: "First answer." } }
    ];
    const { turns } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual(turns.map((turn) => ({ id: turn.id, startedAt: turn.startedAt, duration: turn.duration })), [
      { id: "turn-1", startedAt: void 0, duration: void 0 }
    ]);
  });
});
suite("mapSessionEvents \u2014 subagent routing", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  const session = AgentSession.uri("copilot", "test-session");
  function partKinds(parts) {
    return parts.map((p) => p.kind === ResponsePartKind.Markdown ? { kind: p.kind, content: p.content } : { kind: p.kind });
  }
  test("routes subagent events tagged with envelope agentId into the subagent transcript", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "user.message", agentId: "agent-1", data: { interactionId: "subagent-prompt", content: "Inspect the implementation." } },
      // Inner subagent message + tool call, tagged only with the
      // envelope-level agentId (no data.parentToolCallId).
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "", toolRequests: [{ toolCallId: "tc-inner", name: "bash" }] } },
      { type: "tool.execution_start", agentId: "agent-1", data: { toolCallId: "tc-inner", toolName: "bash", arguments: { command: "ls" } } },
      { type: "tool.execution_complete", agentId: "agent-1", data: { toolCallId: "tc-inner", success: true, result: { content: "a\nb\n" } } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m4", content: "Subagent is done." } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: true } },
      { type: "assistant.message", data: { messageId: "m5", content: "Here is what the subagent found." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.strictEqual(turns.length, 1);
    assert.deepStrictEqual(partKinds(turns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall },
      { kind: ResponsePartKind.Markdown, content: "Here is what the subagent found." }
    ]);
    const subagentTurns = subagentTurnsByToolCallId.get("tc-task");
    assert.ok(subagentTurns, "Expected subagent turns for tc-task");
    assert.strictEqual(subagentTurns.length, 1);
    assert.strictEqual(subagentTurns[0].message.text, "Inspect the implementation.");
    assert.deepStrictEqual(partKinds(subagentTurns[0].responseParts), [
      { kind: ResponsePartKind.ToolCall },
      { kind: ResponsePartKind.Markdown, content: "Subagent is done." }
    ]);
  });
  test("reconstructs subagent content when legacy completion precedes subagent start", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "summarize the service" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "Summarize agent service", agent_type: "explore" } } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: true, result: { content: "Agent started in background." } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore Agent", agentDescription: "Explores" } },
      { type: "user.message", agentId: "agent-1", data: { interactionId: "subagent-prompt", content: "Inspect agentService.ts." } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Summary complete." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const toolCall = turns[0].responseParts.find((part) => part.kind === ResponsePartKind.ToolCall)?.toolCall;
    const subagentContent = toolCall?.status === ToolCallStatus.Completed ? toolCall.content?.find((content) => content.type === ToolResultContentType.Subagent) : void 0;
    assert.deepStrictEqual({
      description: toolCall ? readToolCallMeta(toolCall).subagentDescription : void 0,
      subagentContent,
      childMarkdown: subagentTurnsByToolCallId.get("tc-task")?.flatMap((turn) => turn.responseParts).filter((part) => part.kind === ResponsePartKind.Markdown).map((part) => part.content)
    }, {
      description: "Summarize agent service",
      subagentContent: {
        type: ToolResultContentType.Subagent,
        resource: "copilot:/test-session/subagent/tc-task",
        title: "Explore Agent",
        agentName: "explore",
        description: "Explores"
      },
      childMarkdown: ["Summary complete."]
    });
  });
  test("drops subagent user messages whose agentId cannot be mapped", async () => {
    const events = [
      { type: "user.message", id: "root-message", data: { interactionId: "m1", content: "Continue the task" } },
      { type: "user.message", id: "orphan-subagent-message", agentId: "unknown-agent", data: { interactionId: "m2", content: "Delegated prompt" } },
      { type: "assistant.message", data: { messageId: "m3", content: "Done." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual({
      turns: turns.map((turn) => ({
        id: turn.id,
        message: turn.message.text,
        parts: partKinds(turn.responseParts)
      })),
      subagentTurns: [...subagentTurnsByToolCallId]
    }, {
      turns: [{
        id: "root-message",
        message: "Continue the task",
        parts: [{ kind: ResponsePartKind.Markdown, content: "Done." }]
      }],
      subagentTurns: []
    });
  });
  test("routes subagent skill events into the subagent transcript", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "skill.invoked", agentId: "agent-1", data: { name: "research", path: "/skills/research", content: "" } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: true } },
      { type: "assistant.message", data: { messageId: "m3", content: "The subagent finished." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    assert.deepStrictEqual({
      parentState: turns[0].state,
      parentParts: partKinds(turns[0].responseParts),
      subagentParts: partKinds(subagentTurnsByToolCallId.get("tc-task")?.[0].responseParts ?? [])
    }, {
      parentState: TurnState.Complete,
      parentParts: [
        { kind: ResponsePartKind.ToolCall },
        { kind: ResponsePartKind.Markdown, content: "The subagent finished." }
      ],
      subagentParts: [
        { kind: ResponsePartKind.ToolCall }
      ]
    });
  });
  test("subagent abort marks the subagent turn cancelled", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Partial result." } },
      { type: "abort", agentId: "agent-1", data: { reason: "user initiated" } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: false } },
      { type: "assistant.message", data: { messageId: "m4", content: "The subagent was cancelled." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const subagentTurn = subagentTurnsByToolCallId.get("tc-task")?.[0];
    assert.deepStrictEqual({
      parentState: turns[0].state,
      subagentState: subagentTurn?.state,
      subagentParts: partKinds(subagentTurn?.responseParts ?? [])
    }, {
      parentState: TurnState.Complete,
      subagentState: TurnState.Cancelled,
      subagentParts: [
        { kind: ResponsePartKind.Markdown, content: "Partial result." }
      ]
    });
  });
  test("subagent abort before its first response remains cancelled", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "abort", agentId: "agent-1", data: { reason: "user initiated" } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Late partial result." } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: false } },
      { type: "assistant.message", data: { messageId: "m4", content: "The subagent was cancelled." } }
    ];
    const { subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const subagentTurn = subagentTurnsByToolCallId.get("tc-task")?.[0];
    assert.deepStrictEqual({
      state: subagentTurn?.state,
      parts: partKinds(subagentTurn?.responseParts ?? [])
    }, {
      state: TurnState.Cancelled,
      parts: [
        { kind: ResponsePartKind.Markdown, content: "Late partial result." }
      ]
    });
  });
  test("subagent error marks only the subagent turn errored and remains terminal", async () => {
    const events = [
      { type: "user.message", data: { interactionId: "m1", content: "spawn a subagent" } },
      { type: "assistant.message", data: { messageId: "m2", content: "", toolRequests: [{ toolCallId: "tc-task", name: "task" }] } },
      { type: "tool.execution_start", data: { toolCallId: "tc-task", toolName: "task", arguments: { description: "explore", agentName: "explore" } } },
      { type: "subagent.started", agentId: "agent-1", data: { toolCallId: "tc-task", agentName: "explore", agentDisplayName: "Explore", agentDescription: "Explores" } },
      { type: "assistant.message", agentId: "agent-1", data: { messageId: "m3", content: "Partial result." } },
      { type: "session.error", agentId: "agent-1", data: { errorType: "rate_limit", message: "Subagent rate limited.", statusCode: 429 } },
      { type: "abort", agentId: "agent-1", data: { reason: "cleanup after failure" } },
      { type: "tool.execution_complete", data: { toolCallId: "tc-task", success: false } },
      { type: "assistant.message", data: { messageId: "m4", content: "The subagent failed." } }
    ];
    const { turns, subagentTurnsByToolCallId } = await mapSessionEvents(session, void 0, toSessionEvents(events));
    const subagentTurn = subagentTurnsByToolCallId.get("tc-task")?.[0];
    assert.deepStrictEqual({
      parentState: turns[0].state,
      parentError: turns[0].error,
      subagentState: subagentTurn?.state,
      subagentError: subagentTurn?.error,
      subagentParts: partKinds(subagentTurn?.responseParts ?? [])
    }, {
      parentState: TurnState.Complete,
      parentError: void 0,
      subagentState: TurnState.Error,
      subagentError: {
        errorType: "rate_limit",
        message: "Subagent rate limited.",
        stack: void 0,
        _meta: {
          chatError: {
            fetchError: {
              type: "rateLimited",
              reason: "Subagent rate limited.",
              requestId: "",
              capiError: { code: void 0, message: "Subagent rate limited." }
            }
          }
        }
      },
      subagentParts: [
        { kind: ResponsePartKind.Markdown, content: "Partial result." }
      ]
    });
  });
});
suite("appendSdkToolResultContent", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("folds shell_exit into an existing terminal block instead of adding a second one", () => {
    const content = [
      { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/abc", title: "Bash" }
    ];
    const result = appendSdkToolResultContent(content, [
      { type: "shell_exit", shellId: "0", exitCode: 2, outputPreview: "boom\n", outputTruncated: false }
    ], { session: AgentSession.uri("copilot", "test-session"), toolCallId: "tc-1", title: "Run Shell Command" });
    assert.deepStrictEqual(result, { shellId: "0", result: { exitCode: 2, preview: "boom\n", truncated: false } });
    assert.deepStrictEqual(content, [
      {
        type: ToolResultContentType.Terminal,
        resource: "agenthost-terminal://shell/abc",
        title: "Bash",
        result: { exitCode: 2, preview: "boom\n", truncated: false }
      }
    ]);
  });
  test("ignores a null shell_exit output preview", () => {
    const content = [];
    const result = appendSdkToolResultContent(content, [
      { type: "shell_exit", shellId: "0", exitCode: 7, outputPreview: null, outputTruncated: false }
    ], { session: AgentSession.uri("copilot", "test-session"), toolCallId: "tc-1", title: "Run Shell Command" });
    assert.deepStrictEqual({ result, content }, {
      result: { shellId: "0", result: { exitCode: 7, truncated: false } },
      content: [
        {
          type: ToolResultContentType.Terminal,
          resource: "agenthost-terminal://shell/test-session/tc-1",
          title: "Run Shell Command",
          isPty: false,
          result: { exitCode: 7, truncated: false }
        }
      ]
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxtYXBTZXNzaW9uRXZlbnRzLnRlc3QudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgYXNzZXJ0IGZyb20gJ2Fzc2VydCc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyByZWFkVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIHR5cGUgUmVzcG9uc2VQYXJ0LCB0eXBlIFN0cmluZ09yTWFya2Rvd24sIHR5cGUgVG9vbENhbGxSZXNwb25zZVBhcnQsIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGFwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50LCBtYXBTZXNzaW9uRXZlbnRzIH0gZnJvbSAnLi4vLi4vbm9kZS9jb3BpbG90L21hcFNlc3Npb25FdmVudHMuanMnO1xuaW1wb3J0IHsgdG9TZXNzaW9uRXZlbnRzLCB0eXBlIElTZXNzaW9uRXZlbnQgfSBmcm9tICcuL2NvcGlsb3RUZXN0RXZlbnRzLmpzJztcblxuc3VpdGUoJ21hcFNlc3Npb25FdmVudHMgXHUyMDE0IGhpc3RvcnkgcmVwbGF5JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdGNvbnN0IHNlc3Npb24gPSBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Rlc3Qtc2Vzc2lvbicpO1xuXG5cdGZ1bmN0aW9uIHBhcnRLaW5kcyhwYXJ0czogcmVhZG9ubHkgUmVzcG9uc2VQYXJ0W10pOiBBcnJheTx7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQ7IGNvbnRlbnQ/OiBTdHJpbmdPck1hcmtkb3duIH0+IHtcblx0XHRyZXR1cm4gcGFydHMubWFwKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duIHx8IHAua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24gPyB7IGtpbmQ6IHAua2luZCwgY29udGVudDogcC5jb250ZW50IH0gOiB7IGtpbmQ6IHAua2luZCB9KTtcblx0fVxuXG5cdHRlc3QoJ3Rhc2tfY29tcGxldGUgd2l0aCBhIHN1bW1hcnkgcmVuZGVycyBhcyBhIG1hcmtkb3duIHBhcnQsIG5vdCBhIHRvb2wgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnV29ya2luZyBvbiBpdC4nLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ3Rhc2tfY29tcGxldGUnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAndGFza19jb21wbGV0ZScsIGFyZ3VtZW50czogeyBzdW1tYXJ5OiAnRG9uZS4gQWxsIGdvb2QuJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR1cm5zLmxlbmd0aCwgMSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0S2luZHModHVybnNbMF0ucmVzcG9uc2VQYXJ0cyksIFtcblx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1dvcmtpbmcgb24gaXQuJyB9LFxuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnXFxuXFxuKipUYXNrIGNvbXBsZXRlZDoqKiBEb25lLiBBbGwgZ29vZC4nIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIEF1dG8gbW9kZWwgcmVzb2x1dGlvbiBhcyB1c2FnZSBtZXRhZGF0YScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBhdXRvTW9kZVJlc29sdmVkID0ge1xuXHRcdFx0Y2hvc2VuTW9kZWw6ICdjbGF1ZGUtb3B1cy00LjgnLFxuXHRcdFx0cmVhc29uaW5nQnVja2V0OiAnaGlnaCcsXG5cdFx0XHRjYXRlZ29yeVNjb3JlczogeyByZWFzb25pbmc6IDAuOTEsIGNvZGVfZ2VuOiAwLjcyIH0sXG5cdFx0XHRwcmVkaWN0ZWRMYWJlbDogJ25lZWRzX3JlYXNvbmluZycsXG5cdFx0XHRjb25maWRlbmNlOiAwLjkzLFxuXHRcdFx0Y2FuZGlkYXRlTW9kZWxzOiBbJ2NsYXVkZS1vcHVzLTQuOCcsICdjbGF1ZGUtc29ubmV0LTQuNiddLFxuXHRcdH07XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3R1cm4tYmVmb3JlLWF1dG8nLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMCcsIGNvbnRlbnQ6ICdGaXJzdCBwcm9tcHQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMScsIGNvbnRlbnQ6ICdGaXJzdCByZXNwb25zZS4nIH0gfSxcblx0XHRcdC8vIFRoZSBydW50aW1lIHJlc29sdmVzIEF1dG8gd2hpbGUgYnVpbGRpbmcgc2V0dGluZ3MsIGJlZm9yZSBpdCBwZXJzaXN0c1xuXHRcdFx0Ly8gdGhlIHVzZXIgbWVzc2FnZSBmb3IgdGhlIHR1cm4gdGhhdCB3aWxsIHVzZSB0aGUgY2hvc2VuIG1vZGVsLlxuXHRcdFx0eyB0eXBlOiAnc2Vzc2lvbi5hdXRvX21vZGVfcmVzb2x2ZWQnLCBkYXRhOiBhdXRvTW9kZVJlc29sdmVkIH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3R1cm4tYXV0bycsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ1NvbHZlIHRoaXMgcHJvYmxlbScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ0RvbmUuJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCB1c2FnZTogdHVybi51c2FnZSB9KSksIFtcblx0XHRcdHsgaWQ6ICd0dXJuLWJlZm9yZS1hdXRvJywgdXNhZ2U6IHVuZGVmaW5lZCB9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3R1cm4tYXV0bycsXG5cdFx0XHRcdHVzYWdlOiB7XG5cdFx0XHRcdFx0bW9kZWw6ICdjbGF1ZGUtb3B1cy00LjgnLFxuXHRcdFx0XHRcdF9tZXRhOiB7IGF1dG9Nb2RlUmVzb2x2ZWQgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Rhc2tfY29tcGxldGUgd2l0aG91dCBhIHN1bW1hcnkgcmVuZGVycyBub3RoaW5nJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnaGknIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdBbGwgc2V0LicsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAndGFza19jb21wbGV0ZScgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd0YXNrX2NvbXBsZXRlJywgYXJndW1lbnRzOiB7fSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0dXJucy5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydEtpbmRzKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMpLCBbXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdBbGwgc2V0LicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZmFsbGJhY2sgdGFza19jb21wbGV0ZSBtYXJrcyB0aGUgdHVybiBjb21wbGV0ZScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2ZpbmlzaCB0aGUgdGFzaycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ0FsbCBkb25lLicsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAndGFza19jb21wbGV0ZScsIGFyZ3VtZW50czogeyBzdW1tYXJ5OiAnRmluaXNoZWQuJyB9IH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbe1xuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0FsbCBkb25lLicgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnXFxuXFxuKipUYXNrIGNvbXBsZXRlZDoqKiBGaW5pc2hlZC4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnYSByZWd1bGFyIHRvb2wgc3RpbGwgcmVuZGVycyBhcyBhIHRvb2wgY2FsbCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdiYXNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGknIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdoaVxcbicgfSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyh0dXJuc1swXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc29sdmVzIHJlbGF0aXZlIHBhdGNoIGxpbmtzIGluIHJlc3RvcmVkIHRvb2wgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgcGF0Y2ggPSBbXG5cdFx0XHQnKioqIEJlZ2luIFBhdGNoJyxcblx0XHRcdCcqKiogVXBkYXRlIEZpbGU6IHNyYy9maWxlLnRzJyxcblx0XHRcdCdAQCcsXG5cdFx0XHQnLW9sZCcsXG5cdFx0XHQnK25ldycsXG5cdFx0XHQnKioqIEVuZCBQYXRjaCcsXG5cdFx0XS5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2VkaXQgdGhlIGZpbGUnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ2FwcGx5X3BhdGNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2FwcGx5X3BhdGNoJywgYXJndW1lbnRzOiBwYXRjaCB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCBzdWNjZXNzOiB0cnVlIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpLCBVUkkuZmlsZSgnL3dvcmtzcGFjZScpKTtcblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydCB8IHVuZGVmaW5lZDtcblx0XHRhc3NlcnQub2socGFydCk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogcGFydC50b29sQ2FsbC5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCA/IHBhcnQudG9vbENhbGwuaW52b2NhdGlvbk1lc3NhZ2UgOiB1bmRlZmluZWQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkID8gcGFydC50b29sQ2FsbC5wYXN0VGVuc2VNZXNzYWdlIDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnRWRpdCBbZmlsZS50c10oZmlsZTovLy93b3Jrc3BhY2Uvc3JjL2ZpbGUudHMpJyB9LFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogeyBtYXJrZG93bjogJ0VkaXQgW2ZpbGUudHNdKGZpbGU6Ly8vd29ya3NwYWNlL3NyYy9maWxlLnRzKScgfSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgTUNQIGFwcCBkYXRhIGZvciBjb21wbGV0ZWQgdG9vbCBjYWxscycsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2NhbGwgYW4gTUNQIGFwcCB0b29sJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHRtZXNzYWdlSWQ6ICdtMicsXG5cdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0dG9vbFJlcXVlc3RzOiBbe1xuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdFx0bmFtZTogJ0dpdEh1Yi1nZXRfbWUnLFxuXHRcdFx0XHRcdFx0YXJndW1lbnRzOiB7fSxcblx0XHRcdFx0XHRcdHR5cGU6ICdmdW5jdGlvbicsXG5cdFx0XHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiAnR2l0SHViJyxcblx0XHRcdFx0XHRcdG1jcFRvb2xOYW1lOiAnZ2V0X21lJyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsXG5cdFx0XHRcdGRhdGE6IHtcblx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdFx0dG9vbE5hbWU6ICdHaXRIdWItZ2V0X21lJyxcblx0XHRcdFx0XHRhcmd1bWVudHM6IHt9LFxuXHRcdFx0XHRcdG1jcFNlcnZlck5hbWU6ICdHaXRIdWInLFxuXHRcdFx0XHRcdG1jcFRvb2xOYW1lOiAnZ2V0X21lJyxcblx0XHRcdFx0XHR0b29sRGVzY3JpcHRpb246IHtcblx0XHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2dpdGh1Yi1tY3Atc2VydmVyL2dldC1tZScsXG5cdFx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7IGNvbnRlbnQ6ICd7XCJsb2dpblwiOlwib2N0b2NhdFwifScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0c1swXSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGNvbnRyaWJ1dG9yOiBwYXJ0LnRvb2xDYWxsLmNvbnRyaWJ1dG9yLFxuXHRcdFx0bWV0YTogcmVhZFRvb2xDYWxsTWV0YShwYXJ0LnRvb2xDYWxsKSxcblx0XHR9LCB7XG5cdFx0XHRjb250cmlidXRvcjoge1xuXHRcdFx0XHRraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsXG5cdFx0XHRcdGN1c3RvbWl6YXRpb25JZDogJ21jcC10b3AtbGV2ZWw6Y29waWxvdDp0ZXN0LXNlc3Npb246R2l0SHViJyxcblx0XHRcdH0sXG5cdFx0XHRtZXRhOiB7XG5cdFx0XHRcdG1jcFNlcnZlck5hbWU6ICdHaXRIdWInLFxuXHRcdFx0XHRtY3BUb29sTmFtZTogJ2dldF9tZScsXG5cdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2dpdGh1Yi1tY3Atc2VydmVyL2dldC1tZScsXG5cdFx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3QvdGVzdC1zZXNzaW9uL0dpdEh1YicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkZXJpdmVzIHNoZWxsIHRvb2wgaW50ZW50aW9uIGZyb20gdGhlIGRlc2NyaXB0aW9uIGFyZ3VtZW50IG9uIHJlcGxheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdiYXNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2xzJywgZGVzY3JpcHRpb246ICdMaXN0IGZpbGVzIGluIHRoZSByZXBvIHJvb3QnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdhXFxuYlxcbicgfSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0c1swXSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC50b29sQ2FsbC5pbnRlbnRpb24sICdMaXN0IGZpbGVzIGluIHRoZSByZXBvIHJvb3QnKTtcblx0fSk7XG5cblx0dGVzdCgnbWFwcyBTREsgaW1hZ2UgY29udGVudCB0byBhbiBlbWJlZGRlZCByZXNvdXJjZSBvbiByZXBsYXllZCB0b29sIGNvbXBsZXRpb24nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICd2aWV3IHRoZSBpbWFnZScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLTEnLCBuYW1lOiAndmlld19pbWFnZScgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgdG9vbE5hbWU6ICd2aWV3X2ltYWdlJywgYXJndW1lbnRzOiB7IHBhdGg6ICcvcmVwby9pbWFnZS5wbmcnIH0gfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnVmlld2VkIGltYWdlIGZpbGUgc3VjY2Vzc2Z1bGx5LicsXG5cdFx0XHRcdFx0XHRjb250ZW50czogW3sgdHlwZTogJ2ltYWdlJywgZGF0YTogJ2lWQk9SdzBLR2dvPScsIG1pbWVUeXBlOiAnaW1hZ2UvcG5nJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdIGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnRvb2xDYWxsLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRpZiAocGFydC50b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkgeyByZXR1cm47IH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ1ZpZXdlZCBpbWFnZSBmaWxlIHN1Y2Nlc3NmdWxseS4nIH0sXG5cdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlLCBkYXRhOiAnaVZCT1J3MEtHZ289JywgY29udGVudFR5cGU6ICdpbWFnZS9wbmcnIH0sXG5cdFx0XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ21hcHMgU0RLIHNoZWxsX2V4aXQgY29udGVudCB0byB0ZXJtaW5hbCBjb21wbGV0aW9uIG9uIHJlcGxheWVkIHRvb2wgY29tcGxldGlvbicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdiYXNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2VjaG8gaGknIH0gfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnaGlcXG4nLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFt7IHR5cGU6ICdzaGVsbF9leGl0Jywgc2hlbGxJZDogJzAnLCBleGl0Q29kZTogMCwgY3dkOiAnL3JlcG8nLCBvdXRwdXRQcmV2aWV3OiAnaGlcXG4nIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0Y29uc3QgcGFydCA9IHR1cm5zWzBdLnJlc3BvbnNlUGFydHNbMF0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQ7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQua2luZCwgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCk7XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuc3RhdHVzLCBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpO1xuXHRcdGlmIChwYXJ0LnRvb2xDYWxsLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7IHJldHVybjsgfVxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocGFydC50b29sQ2FsbC5jb250ZW50LCBbXG5cdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGlcXG4nIH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCxcblx0XHRcdFx0cmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC90ZXN0LXNlc3Npb24vdGMtMScsXG5cdFx0XHRcdHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ2hpXFxuJyB9LFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgY2xhc3NpZnkgcmVhZF9iYXNoIHNoZWxsX2V4aXQgbWV0YWRhdGEgYXMgYSB0ZXJtaW5hbCBjb21wbGV0aW9uIG9uIHJlcGxheScsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdyZWFkX2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAncmVhZF9iYXNoJywgYXJndW1lbnRzOiB7IHNoZWxsSWQ6ICdidWlsZCcsIGRlbGF5OiAwIH0gfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnQnVpbGQgY29tcGxldGVkXFxuJyxcblx0XHRcdFx0XHRcdGNvbnRlbnRzOiBbeyB0eXBlOiAnc2hlbGxfZXhpdCcsIHNoZWxsSWQ6ICdidWlsZCcsIGV4aXRDb2RlOiAwLCBvdXRwdXRQcmV2aWV3OiAnQnVpbGQgY29tcGxldGVkXFxuJyB9XSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGNvbnN0IHBhcnQgPSB0dXJuc1swXS5yZXNwb25zZVBhcnRzWzBdIGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0O1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChwYXJ0LnRvb2xDYWxsLnN0YXR1cywgVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKTtcblx0XHRpZiAocGFydC50b29sQ2FsbC5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkgeyByZXR1cm47IH1cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHRvb2xLaW5kOiByZWFkVG9vbENhbGxNZXRhKHBhcnQudG9vbENhbGwpLnRvb2xLaW5kLFxuXHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogcGFydC50b29sQ2FsbC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0Y29udGVudDogcGFydC50b29sQ2FsbC5jb250ZW50LFxuXHRcdH0sIHtcblx0XHRcdHRvb2xLaW5kOiB1bmRlZmluZWQsXG5cdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBUZXJtaW5hbCcsXG5cdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0J1aWxkIGNvbXBsZXRlZFxcbicgfV0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3ByZXNlcnZlcyBub24temVybyB0ZXJtaW5hbCBjb21wbGV0aW9uIGV2ZW4gd2hlbiBTREsgdG9vbCBjb21wbGV0aW9uIHN1Y2NlZWRlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ2hpJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtMScsIG5hbWU6ICdiYXNoJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLTEnLCB0b29sTmFtZTogJ2Jhc2gnLCBhcmd1bWVudHM6IHsgY29tbWFuZDogJ2d0aSBzdGF0dXMnIH0gfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0XHRjb250ZW50OiAnY29tbWFuZCBub3QgZm91bmRcXG4nLFxuXHRcdFx0XHRcdFx0Y29udGVudHM6IFt7IHR5cGU6ICdzaGVsbF9leGl0Jywgc2hlbGxJZDogJzAnLCBleGl0Q29kZTogMTI3LCBjd2Q6ICcvcmVwbycgfV0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRjb25zdCBwYXJ0ID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0c1swXSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydDtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5raW5kLCBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKTtcblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC50b29sQ2FsbC5zdGF0dXMsIFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCk7XG5cdFx0aWYgKHBhcnQudG9vbENhbGwuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHsgcmV0dXJuOyB9XG5cdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHBhcnQudG9vbENhbGwuc3VjY2VzcywgdHJ1ZSk7XG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChwYXJ0LnRvb2xDYWxsLmNvbnRlbnQ/LmZpbmQoY29udGVudCA9PiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCksIHtcblx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCxcblx0XHRcdHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvdGVzdC1zZXNzaW9uL3RjLTEnLFxuXHRcdFx0dGl0bGU6ICdSdW4gU2hlbGwgQ29tbWFuZCcsXG5cdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IDEyNyB9LFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBiZXN0LWVmZm9ydCBtb2RlbCwgZmFsbGJhY2sgYWdlbnQsIGFuZCBhdHRhY2htZW50cyBvbnRvIHVzZXIgbWVzc2FnZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICdzZXNzaW9uLm1vZGVsX2NoYW5nZScsIGRhdGE6IHsgbmV3TW9kZWw6ICdvcHVzLTQuNycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc2VsZWN0ZWQnLCBkYXRhOiB7IGFnZW50TmFtZTogJ3Jldmlld2VyJywgYWdlbnREaXNwbGF5TmFtZTogJ1Jldmlld2VyJywgdG9vbHM6IG51bGwgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAndXNlci5tZXNzYWdlJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGludGVyYWN0aW9uSWQ6ICdtMScsXG5cdFx0XHRcdFx0Y29udGVudDogJ2hpJyxcblx0XHRcdFx0XHRhdHRhY2htZW50czogW3tcblx0XHRcdFx0XHRcdHR5cGU6ICdmaWxlJyxcblx0XHRcdFx0XHRcdHBhdGg6ICcvdG1wL2V4YW1wbGUudHMnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdleGFtcGxlLnRzJyxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fVxuXHRcdFx0fSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdoZWxsbycgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cyksIHtcblx0XHRcdG1vZGVsOiB7IGlkOiAnZmFsbGJhY2stbW9kZWwnIH0sXG5cdFx0XHRhZ2VudDogeyB1cmk6ICdmYWxsYmFjay1hZ2VudCcgfSxcblx0XHR9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0bW9kZWw6IHR1cm5zWzBdLm1lc3NhZ2UubW9kZWwsXG5cdFx0XHRhZ2VudDogdHVybnNbMF0ubWVzc2FnZS5hZ2VudCxcblx0XHRcdGF0dGFjaG1lbnRzOiB0dXJuc1swXS5tZXNzYWdlLmF0dGFjaG1lbnRzPy5tYXAoYSA9PiAoe1xuXHRcdFx0XHR0eXBlOiBhLnR5cGUsXG5cdFx0XHRcdHVyaTogYS50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UgPyBhLnVyaSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0bGFiZWw6IGEubGFiZWwsXG5cdFx0XHR9KSksXG5cdFx0fSwge1xuXHRcdFx0bW9kZWw6IHsgaWQ6ICdvcHVzLTQuNycgfSxcblx0XHRcdGFnZW50OiB7IHVyaTogJ2ZhbGxiYWNrLWFnZW50JyB9LFxuXHRcdFx0YXR0YWNobWVudHM6IFt7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiAnZmlsZTovLy90bXAvZXhhbXBsZS50cycsXG5cdFx0XHRcdGxhYmVsOiAnZXhhbXBsZS50cycsXG5cdFx0XHR9XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc2VlZHMgdGhlIG1vZGVsIGZyb20gc2Vzc2lvbi5zdGFydCBzZWxlY3RlZE1vZGVsIHdoZW4gbm8gbGF1bmNoIG1vZGVsIGlzIHN1cHBsaWVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAnc2Vzc2lvbi5zdGFydCcsIGRhdGE6IHsgc2VsZWN0ZWRNb2RlbDogJ29wdXMtNScgfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnaGknIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdoZWxsbycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTMnLCBjb250ZW50OiAnYWdhaW4nIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Nlc3Npb24ubW9kZWxfY2hhbmdlJywgZGF0YTogeyBuZXdNb2RlbDogJ2dwdC01JyB9IH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtNCcsIGNvbnRlbnQ6ICdzd2l0Y2hlZCcgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodCA9PiB0Lm1lc3NhZ2UubW9kZWwpLCBbXG5cdFx0XHR7IGlkOiAnb3B1cy01JyB9LFxuXHRcdFx0eyBpZDogJ29wdXMtNScgfSxcblx0XHRcdHsgaWQ6ICdncHQtNScgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgndXNlcyB0b3AtbGV2ZWwgdXNlciBtZXNzYWdlcyBhcyB0dXJuIGJvdW5kYXJpZXMnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQtMScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnSW52ZXN0aWdhdGUgdGhpcyBpc3N1ZScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBpZDogJ2luaXRpYWwtcm91bmQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0kgZm91bmQgYSBsaWtlbHkgY2F1c2UuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGlkOiAndG9vbC1yb3VuZCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnSSB3aWxsIHZlcmlmeSBpdC4nLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnZWNobyBpbnZlc3RpZ2F0aW5nJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnaW52ZXN0aWdhdGluZ1xcbicgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGlkOiAnZW1wdHktcm91bmQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW10sIHJlYXNvbmluZ09wYXF1ZTogJ29wYXF1ZS1yZWFzb25pbmcnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgaWQ6ICdmaW5hbC1yb3VuZCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnSW52ZXN0aWdhdGlvbiBjb21wbGV0ZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudC0yJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMycsIGNvbnRlbnQ6ICdUaGFua3MnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgaWQ6ICdhY2tub3dsZWRnZW1lbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0zJywgY29udGVudDogJ1lvdSBhcmUgd2VsY29tZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0bWVzc2FnZTogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFtcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd1c2VyLWV2ZW50LTEnLFxuXHRcdFx0XHRtZXNzYWdlOiAnSW52ZXN0aWdhdGUgdGhpcyBpc3N1ZScsXG5cdFx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnSSBmb3VuZCBhIGxpa2VseSBjYXVzZS4nIH0sXG5cdFx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnSSB3aWxsIHZlcmlmeSBpdC4nIH0sXG5cdFx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnSW52ZXN0aWdhdGlvbiBjb21wbGV0ZS4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQtMicsXG5cdFx0XHRcdG1lc3NhZ2U6ICdUaGFua3MnLFxuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0XHRwYXJ0czogW1xuXHRcdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1lvdSBhcmUgd2VsY29tZS4nIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBhIHN5c3RlbSBub3RpZmljYXRpb24gaW5zaWRlIGFuIGFzc2lzdGFudCB0dXJuIGFzIGEgcmVzcG9uc2UgcGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnV2FpdCBmb3IgdGhlIGJhY2tncm91bmQgY29tbWFuZCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fc3RhcnQnLCBkYXRhOiB7IHR1cm5JZDogJzAnLCBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScgfSB9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnc3lzdGVtLm5vdGlmaWNhdGlvbicsXG5cdFx0XHRcdGlkOiAnbm90aWZpY2F0aW9uLWV2ZW50Jyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGNvbnRlbnQ6ICc8c3lzdGVtX25vdGlmaWNhdGlvbj5cXG5TaGVsbCBjb21tYW5kIGNvbXBsZXRlZFxcbjwvc3lzdGVtX25vdGlmaWNhdGlvbj4nLFxuXHRcdFx0XHRcdGtpbmQ6IHsgdHlwZTogJ3NoZWxsX2NvbXBsZXRlZCcsIHNoZWxsSWQ6ICdzaGVsbC1hJywgZXhpdENvZGU6IDAsIGRlc2NyaXB0aW9uOiAnc2xlZXAgNicgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnUmVhZGluZyB0aGUgb3V0cHV0IG5vdy4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC50dXJuX2VuZCcsIGRhdGE6IHsgdHVybklkOiAnMCcgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UsXG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFt7XG5cdFx0XHRpZDogJ3VzZXItZXZlbnQnLFxuXHRcdFx0bWVzc2FnZTogeyB0ZXh0OiAnV2FpdCBmb3IgdGhlIGJhY2tncm91bmQgY29tbWFuZCcsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLCBjb250ZW50OiAnYHNsZWVwIDZgIGNvbXBsZXRlZCcgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnUmVhZGluZyB0aGUgb3V0cHV0IG5vdy4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYW4gaWRsZSBzeXN0ZW0gbm90aWZpY2F0aW9uIGFuZCByZXN1bWVkIHJlc3BvbnNlIGluIHRoZSBwcmVjZWRpbmcgdHVybicsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnU3RhcnQgdGhlIGJhY2tncm91bmQgYWdlbnQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC50dXJuX3N0YXJ0JywgZGF0YTogeyB0dXJuSWQ6ICcwJywgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdUaGUgYmFja2dyb3VuZCBhZ2VudCBpcyBydW5uaW5nLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgZGF0YTogeyB0dXJuSWQ6ICcwJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzeXN0ZW0ubm90aWZpY2F0aW9uJyxcblx0XHRcdFx0aWQ6ICdub3RpZmljYXRpb24tZXZlbnQnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzxzeXN0ZW1fbm90aWZpY2F0aW9uPlxcbkFnZW50IGNvbXBsZXRlZFxcbjwvc3lzdGVtX25vdGlmaWNhdGlvbj4nLFxuXHRcdFx0XHRcdGtpbmQ6IHsgdHlwZTogJ2FnZW50X2lkbGUnLCBhZ2VudElkOiAnYWdlbnQtYScsIGFnZW50VHlwZTogJ2dlbmVyYWwtcHVycG9zZScgfSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQudHVybl9zdGFydCcsIGRhdGE6IHsgdHVybklkOiAnMCcsIGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnUmVhZGluZyB0aGUgYmFja2dyb3VuZCBhZ2VudCByZXN1bHQuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQudHVybl9lbmQnLCBkYXRhOiB7IHR1cm5JZDogJzAnIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0bWVzc2FnZTogdHVybi5tZXNzYWdlLFxuXHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbe1xuXHRcdFx0aWQ6ICd1c2VyLWV2ZW50Jyxcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogJ1N0YXJ0IHRoZSBiYWNrZ3JvdW5kIGFnZW50Jywgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1RoZSBiYWNrZ3JvdW5kIGFnZW50IGlzIHJ1bm5pbmcuJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLCBjb250ZW50OiAnQmFja2dyb3VuZCBhZ2VudCBhZ2VudC1hIGlzIGNvbXBsZXRlJyB9LFxuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdSZWFkaW5nIHRoZSBiYWNrZ3JvdW5kIGFnZW50IHJlc3VsdC4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgnZG9lcyBub3QgcmVzdG9yZSBhIHBhc3NpdmUgbm90aWZpY2F0aW9uIG91dHNpZGUgYW4gYXNzaXN0YW50IHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0NoZWNrIGZvciBpbnN0cnVjdGlvbnMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC50dXJuX3N0YXJ0JywgZGF0YTogeyB0dXJuSWQ6ICcwJywgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdObyBuZXcgaW5zdHJ1Y3Rpb25zLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgZGF0YTogeyB0dXJuSWQ6ICcwJyB9IH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzeXN0ZW0ubm90aWZpY2F0aW9uJyxcblx0XHRcdFx0aWQ6ICdub3RpZmljYXRpb24tZXZlbnQnLFxuXHRcdFx0XHRkYXRhOiB7XG5cdFx0XHRcdFx0Y29udGVudDogJzxzeXN0ZW1fbm90aWZpY2F0aW9uPlxcbkluc3RydWN0aW9uIGRpc2NvdmVyZWRcXG48L3N5c3RlbV9ub3RpZmljYXRpb24+Jyxcblx0XHRcdFx0XHRraW5kOiB7IHR5cGU6ICdpbnN0cnVjdGlvbl9kaXNjb3ZlcmVkJywgc291cmNlUGF0aDogJ0FHRU5UUy5tZCcsIHRyaWdnZXJGaWxlOiAnc3JjL2luZGV4LnRzJywgdHJpZ2dlclRvb2w6ICd2aWV3JywgZGVzY3JpcHRpb246ICdXb3Jrc3BhY2UgaW5zdHJ1Y3Rpb25zJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiAndXNlci1ldmVudCcsXG5cdFx0XHRwYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ05vIG5ldyBpbnN0cnVjdGlvbnMuJyB9XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N5bnRoZXRpYyB1c2VyIG1lc3NhZ2VzIGRvIG5vdCBzdGFydCBhIG5ldyB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd1c2VyLWV2ZW50LTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ1VzZSB0aGUgc2tpbGwnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdJIHdpbGwgdXNlIGl0LicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICdzeW50aGV0aWMtZXZlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJ0luamVjdGVkIHNraWxsIGNvbnRlbnQnLCBzb3VyY2U6ICdza2lsbCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJ1RoZSBza2lsbCBpcyBjb21wbGV0ZS4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndXNlci1ldmVudC0yJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMycsIGNvbnRlbnQ6ICdUaGFua3MnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMycsIGNvbnRlbnQ6ICdZb3UgYXJlIHdlbGNvbWUuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW1xuXHRcdFx0e1xuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQtMScsXG5cdFx0XHRcdG1lc3NhZ2U6ICdVc2UgdGhlIHNraWxsJyxcblx0XHRcdFx0cGFydHM6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdJIHdpbGwgdXNlIGl0LicgfSxcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdUaGUgc2tpbGwgaXMgY29tcGxldGUuJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0aWQ6ICd1c2VyLWV2ZW50LTInLFxuXHRcdFx0XHRtZXNzYWdlOiAnVGhhbmtzJyxcblx0XHRcdFx0cGFydHM6IFtcblx0XHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdZb3UgYXJlIHdlbGNvbWUuJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnc3RyaXBzIHByb21wdCBzY2FmZm9sZGluZyBmcm9tIHVzZXIgbWVzc2FnZSBjb250ZW50JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IHdyYXBwZWQgPSAnaGlcXG4gPHJlbWluZGVyPlxcbklNUE9SVEFOVDogaWdub3JlIHRoaXNcXG48L3JlbWluZGVyPlxcbjxhdHRhY2htZW50cz5cXG48YXR0YWNobWVudCBpZD1cIm1pY3Jvc29mdC92c2NvZGVcIj5yZXBvPC9hdHRhY2htZW50PlxcbjwvYXR0YWNobWVudHM+XFxuPHVzZXJSZXF1ZXN0PlxcbmhpXFxuPC91c2VyUmVxdWVzdD5cXG4nO1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd3cmFwcGVkJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6IHdyYXBwZWQgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0hlbGxvLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd3cmFwcGVyLW9ubHknLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJzx1c2VyUmVxdWVzdD5oaTU8L3VzZXJSZXF1ZXN0PicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0yJywgY29udGVudDogJ0hpIGFnYWluLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICdlbXB0eS13cmFwcGVyJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMycsIGNvbnRlbnQ6ICcvcmVtb3RlIDxyZW1pbmRlcj54PC9yZW1pbmRlcj48dXNlclJlcXVlc3Q+PC91c2VyUmVxdWVzdD4nIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMycsIGNvbnRlbnQ6ICdPayByZW1vdGUuJywgdG9vbFJlcXVlc3RzOiBbXSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3BsYWluJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tNCcsIGNvbnRlbnQ6ICdqdXN0IHRleHQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tNCcsIGNvbnRlbnQ6ICdPay4nLCB0b29sUmVxdWVzdHM6IFtdIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gdHVybi5tZXNzYWdlLnRleHQpLCBbJ2hpJywgJ2hpNScsICcvcmVtb3RlJywgJ2p1c3QgdGV4dCddKTtcblx0fSk7XG5cblx0dGVzdCgndGVybWluYWwgZW1wdHkgYXNzaXN0YW50IG1lc3NhZ2UgY29tcGxldGVzIGEgdG9vbC1vbmx5IHR1cm4nLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBpZDogJ3VzZXItZXZlbnQnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0Nsb3NlIG91dCB0aGUgdG9kb3MnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ3RvZG8nIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAndG9kbycsIGFyZ3VtZW50czogeyBzdGF0dXM6ICdkb25lJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRtZXNzYWdlOiB0dXJuLm1lc3NhZ2UudGV4dCxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0cGFydHM6IHBhcnRLaW5kcyh0dXJuLnJlc3BvbnNlUGFydHMpLFxuXHRcdH0pKSwgW3tcblx0XHRcdGlkOiAndXNlci1ldmVudCcsXG5cdFx0XHRtZXNzYWdlOiAnQ2xvc2Ugb3V0IHRoZSB0b2RvcycsXG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0cGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgndG9vbC1vbmx5IHR1cm4gd2l0aG91dCBhIHRlcm1pbmFsIGFzc2lzdGFudCBtZXNzYWdlIHJlbWFpbnMgY2FuY2VsbGVkJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd1c2VyLWV2ZW50JywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdSdW4gdGhlIGNvbW1hbmQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy0xJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnZWNobyBkb25lJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtMScsIHN1Y2Nlc3M6IHRydWUsIHJlc3VsdDogeyBjb250ZW50OiAnZG9uZVxcbicgfSB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRzdGF0ZTogdHVybi5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFt7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCB9LFxuXHRcdFx0XSxcblx0XHR9XSk7XG5cdH0pO1xuXG5cdHRlc3QoJ2Fib3J0IHJlbWFpbnMgdGVybWluYWwgZm9yIHRoZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScsIGNvbnRlbnQ6ICdXYWl0IGZvciB0aGUgdGFzaycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ1RoZSB0YXNrIGlzIGNvbXBsZXRlLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdFx0eyB0eXBlOiAnYWJvcnQnLCBkYXRhOiB7IHJlYXNvbjogJ3VzZXIgaW5pdGlhdGVkJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTInLCBjb250ZW50OiAnTGF0ZSBjb21wbGV0aW9uLicsIHRvb2xSZXF1ZXN0czogW10gfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoe1xuXHRcdFx0c3RhdGU6IHR1cm4uc3RhdGUsXG5cdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0fSkpLCBbe1xuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5DYW5jZWxsZWQsXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdUaGUgdGFzayBpcyBjb21wbGV0ZS4nIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0xhdGUgY29tcGxldGlvbi4nIH0sXG5cdFx0XHRdLFxuXHRcdH1dKTtcblx0fSk7XG5cblx0dGVzdCgncmVzdG9yZXMgYSByZXF1ZXN0IGVycm9yIGFzIHRlcm1pbmFsIHR1cm4gc3RhdGUnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdzZXNzaW9uLmVycm9yJyxcblx0XHRcdFx0ZGF0YTogeyBlcnJvclR5cGU6ICd1bmFzc29jaWF0ZWQnLCBtZXNzYWdlOiAnSWdub3JlIHRoaXMgc2Vzc2lvbiBkaWFnbm9zdGljLicgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICd1c2VyLm1lc3NhZ2UnLFxuXHRcdFx0XHRpZDogJ3VzZXItZXZlbnQnLFxuXHRcdFx0XHR0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJywgY29udGVudDogJ0NvbXBsZXRlIHRoaXMgcmVxdWVzdCcgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQudHVybl9zdGFydCcsXG5cdFx0XHRcdGRhdGE6IHsgdHVybklkOiAnYXNzaXN0YW50LXR1cm4nLCBpbnRlcmFjdGlvbklkOiAnaW50ZXJhY3Rpb24tMScgfSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHRcdHRpbWVzdGFtcDogJzIwMjYtMDctMjlUMTA6MDA6MDEuMDAwWicsXG5cdFx0XHRcdGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnV29ya2luZyBvbiBpdC4nLCB0b29sUmVxdWVzdHM6IFtdIH0sXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJyxcblx0XHRcdFx0ZGF0YTogeyB0dXJuSWQ6ICdhc3Npc3RhbnQtdHVybicsIGludGVyYWN0aW9uSWQ6ICdpbnRlcmFjdGlvbi0xJyB9LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogJ3Nlc3Npb24uZXJyb3InLFxuXHRcdFx0XHRpZDogJ2Vycm9yLWV2ZW50Jyxcblx0XHRcdFx0dGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMDowMDowMi4wMDBaJyxcblx0XHRcdFx0ZGF0YToge1xuXHRcdFx0XHRcdGVycm9yVHlwZTogJ3F1b3RhJyxcblx0XHRcdFx0XHRlcnJvckNvZGU6ICdxdW90YV9leGNlZWRlZCcsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ05vIHByZW1pdW0gcmVxdWVzdHMgcmVtYWluLicsXG5cdFx0XHRcdFx0c3RhY2s6ICdFcnJvcjogTm8gcHJlbWl1bSByZXF1ZXN0cyByZW1haW4uJyxcblx0XHRcdFx0XHRzdGF0dXNDb2RlOiA0MDIsXG5cdFx0XHRcdFx0cHJvdmlkZXJDYWxsSWQ6ICdwcm92aWRlci1yZXF1ZXN0LWlkJyxcblx0XHRcdFx0XHRzZXJ2aWNlUmVxdWVzdElkOiAnc2VydmljZS1yZXF1ZXN0LWlkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsXG5cdFx0XHRcdGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ2ludGVyYWN0aW9uLTEnLCBjb250ZW50OiAnTGF0ZSBjb21wbGV0aW9uLicsIHRvb2xSZXF1ZXN0czogW10gfSxcblx0XHRcdH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHN0YXRlOiB0dXJuLnN0YXRlLFxuXHRcdFx0ZHVyYXRpb246IHR1cm4uZHVyYXRpb24sXG5cdFx0XHRlcnJvcjogdHVybi5lcnJvcixcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHModHVybi5yZXNwb25zZVBhcnRzKSxcblx0XHR9KSksIFt7XG5cdFx0XHRpZDogJ3VzZXItZXZlbnQnLFxuXHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5FcnJvcixcblx0XHRcdGR1cmF0aW9uOiAyMDAwLFxuXHRcdFx0ZXJyb3I6IHtcblx0XHRcdFx0ZXJyb3JUeXBlOiAncXVvdGEnLFxuXHRcdFx0XHRtZXNzYWdlOiAnTm8gcHJlbWl1bSByZXF1ZXN0cyByZW1haW4uJyxcblx0XHRcdFx0c3RhY2s6ICdFcnJvcjogTm8gcHJlbWl1bSByZXF1ZXN0cyByZW1haW4uJyxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRjaGF0RXJyb3I6IHtcblx0XHRcdFx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3F1b3RhRXhjZWVkZWQnLFxuXHRcdFx0XHRcdFx0XHRyZWFzb246ICdObyBwcmVtaXVtIHJlcXVlc3RzIHJlbWFpbi4nLFxuXHRcdFx0XHRcdFx0XHRyZXF1ZXN0SWQ6ICdwcm92aWRlci1yZXF1ZXN0LWlkJyxcblx0XHRcdFx0XHRcdFx0c2VydmVyUmVxdWVzdElkOiAnc2VydmljZS1yZXF1ZXN0LWlkJyxcblx0XHRcdFx0XHRcdFx0Y2FwaUVycm9yOiB7XG5cdFx0XHRcdFx0XHRcdFx0Y29kZTogJ3F1b3RhX2V4Y2VlZGVkJyxcblx0XHRcdFx0XHRcdFx0XHRtZXNzYWdlOiAnTm8gcHJlbWl1bSByZXF1ZXN0cyByZW1haW4uJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0XHRwYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdXb3JraW5nIG9uIGl0LicgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnTGF0ZSBjb21wbGV0aW9uLicgfSxcblx0XHRcdF0sXG5cdFx0fV0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyB0dXJuIHRpbWluZyBmcm9tIHRoZSBTREsgZXZlbnQgZW52ZWxvcGVzJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjAwMFonLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAzLjUwMFonLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJ0ZpcnN0IGFuc3dlci4nIH0gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAndHVybi0yJywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMDowNTowMC4wMDBaJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTMnLCBjb250ZW50OiAnc2Vjb25kJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIHRpbWVzdGFtcDogJzIwMjYtMDctMjlUMTA6MDU6MDEuMDAwWicsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTQnLCBjb250ZW50OiAnU2Vjb25kIGFuc3dlci4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucyB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwodHVybnMubWFwKHR1cm4gPT4gKHsgaWQ6IHR1cm4uaWQsIHN0YXJ0ZWRBdDogdHVybi5zdGFydGVkQXQsIGR1cmF0aW9uOiB0dXJuLmR1cmF0aW9uIH0pKSwgW1xuXHRcdFx0eyBpZDogJ3R1cm4tMScsIHN0YXJ0ZWRBdDogJzIwMjYtMDctMjlUMTA6MDA6MDAuMDAwWicsIGR1cmF0aW9uOiAzNTAwIH0sXG5cdFx0XHR7IGlkOiAndHVybi0yJywgc3RhcnRlZEF0OiAnMjAyNi0wNy0yOVQxMDowNTowMC4wMDBaJywgZHVyYXRpb246IDEwMDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnYm91bmRzIHR1cm4gZHVyYXRpb24gYnkgdGhlIGxhc3QgZXZlbnQgYmVsb25naW5nIHRvIHRoZSB0dXJuJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjAwMFonLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fc3RhcnQnLCB0aW1lc3RhbXA6ICcyMDI2LTA3LTI5VDEwOjAwOjAwLjUwMFonLCBkYXRhOiB7IHR1cm5JZDogJ3QxJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIHRpbWVzdGFtcDogJzIwMjYtMDctMjlUMTA6MDA6MDMuNTAwWicsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnRmlyc3QgYW5zd2VyLicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50LnR1cm5fZW5kJywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMDowMDowNC4wMDBaJywgZGF0YTogeyB0dXJuSWQ6ICd0MScgfSB9LFxuXHRcdFx0Ly8gSWdub3JlZCBieSB0aGUgbWFwcGVyIGFuIGhvdXIgbGF0ZXI6IGl0IG11c3Qgbm90IGV4dGVuZCB0aGUgdHVybi5cblx0XHRcdHsgdHlwZTogJ3Nlc3Npb24udW5yZWxhdGVkX2V2ZW50JywgdGltZXN0YW1wOiAnMjAyNi0wNy0yOVQxMTowMDowMC4wMDBaJyB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0dXJucy5tYXAodHVybiA9PiAoeyBpZDogdHVybi5pZCwgc3RhcnRlZEF0OiB0dXJuLnN0YXJ0ZWRBdCwgZHVyYXRpb246IHR1cm4uZHVyYXRpb24gfSkpLCBbXG5cdFx0XHR7IGlkOiAndHVybi0xJywgc3RhcnRlZEF0OiAnMjAyNi0wNy0yOVQxMDowMDowMC4wMDBaJywgZHVyYXRpb246IDQwMDAgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgnbGVhdmVzIHR1cm4gdGltaW5nIHVuZGVmaW5lZCB3aGVuIGVudmVsb3BlcyBjYXJyeSBubyB1c2FibGUgdGltZXN0YW1wJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgaWQ6ICd0dXJuLTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdmaXJzdCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCB0aW1lc3RhbXA6ICdub3QtYS1kYXRlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICdGaXJzdCBhbnN3ZXIuJyB9IH0sXG5cdFx0XTtcblxuXHRcdGNvbnN0IHsgdHVybnMgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHR1cm5zLm1hcCh0dXJuID0+ICh7IGlkOiB0dXJuLmlkLCBzdGFydGVkQXQ6IHR1cm4uc3RhcnRlZEF0LCBkdXJhdGlvbjogdHVybi5kdXJhdGlvbiB9KSksIFtcblx0XHRcdHsgaWQ6ICd0dXJuLTEnLCBzdGFydGVkQXQ6IHVuZGVmaW5lZCwgZHVyYXRpb246IHVuZGVmaW5lZCB9LFxuXHRcdF0pO1xuXHR9KTtcbn0pO1xuXG5zdWl0ZSgnbWFwU2Vzc2lvbkV2ZW50cyBcdTIwMTQgc3ViYWdlbnQgcm91dGluZycsICgpID0+IHtcblxuXHRlbnN1cmVOb0Rpc3Bvc2FibGVzQXJlTGVha2VkSW5UZXN0U3VpdGUoKTtcblxuXHRjb25zdCBzZXNzaW9uID0gQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKTtcblxuXHRmdW5jdGlvbiBwYXJ0S2luZHMocGFydHM6IHJlYWRvbmx5IFJlc3BvbnNlUGFydFtdKTogQXJyYXk8eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kOyBjb250ZW50Pzogc3RyaW5nIH0+IHtcblx0XHRyZXR1cm4gcGFydHMubWFwKHAgPT4gcC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duID8geyBraW5kOiBwLmtpbmQsIGNvbnRlbnQ6IHAuY29udGVudCB9IDogeyBraW5kOiBwLmtpbmQgfSk7XG5cdH1cblxuXHQvLyBUaGUgU0RLIG1pZ3JhdGVkIHN1YmFnZW50IGNvcnJlbGF0aW9uIGZyb20gdGhlIGRlcHJlY2F0ZWRcblx0Ly8gYGRhdGEucGFyZW50VG9vbENhbGxJZGAgdG8gYW4gZW52ZWxvcGUtbGV2ZWwgYGFnZW50SWRgLiBOZXdlciBzZXNzaW9uXG5cdC8vIGxvZ3Mgb25seSBjYXJyeSBgYWdlbnRJZGAsIHNvIHRoZSByZXBsYXkgcGF0aCBtdXN0IHJvdXRlIHRob3NlIGV2ZW50c1xuXHQvLyBpbnRvIHRoZSBzdWJhZ2VudCB0cmFuc2NyaXB0IHJhdGhlciB0aGFuIGxlYWtpbmcgdGhlbSBpbnRvIHRoZSBwYXJlbnQuXG5cdHRlc3QoJ3JvdXRlcyBzdWJhZ2VudCBldmVudHMgdGFnZ2VkIHdpdGggZW52ZWxvcGUgYWdlbnRJZCBpbnRvIHRoZSBzdWJhZ2VudCB0cmFuc2NyaXB0JywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnc3Bhd24gYSBzdWJhZ2VudCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBuYW1lOiAndGFzaycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgdG9vbE5hbWU6ICd0YXNrJywgYXJndW1lbnRzOiB7IGRlc2NyaXB0aW9uOiAnZXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc3RhcnRlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdzdWJhZ2VudC1wcm9tcHQnLCBjb250ZW50OiAnSW5zcGVjdCB0aGUgaW1wbGVtZW50YXRpb24uJyB9IH0sXG5cdFx0XHQvLyBJbm5lciBzdWJhZ2VudCBtZXNzYWdlICsgdG9vbCBjYWxsLCB0YWdnZWQgb25seSB3aXRoIHRoZVxuXHRcdFx0Ly8gZW52ZWxvcGUtbGV2ZWwgYWdlbnRJZCAobm8gZGF0YS5wYXJlbnRUb29sQ2FsbElkKS5cblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20zJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgbmFtZTogJ2Jhc2gnIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy1pbm5lcicsIHRvb2xOYW1lOiAnYmFzaCcsIGFyZ3VtZW50czogeyBjb21tYW5kOiAnbHMnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLWlubmVyJywgc3VjY2VzczogdHJ1ZSwgcmVzdWx0OiB7IGNvbnRlbnQ6ICdhXFxuYlxcbicgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtNCcsIGNvbnRlbnQ6ICdTdWJhZ2VudCBpcyBkb25lLicgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTUnLCBjb250ZW50OiAnSGVyZSBpcyB3aGF0IHRoZSBzdWJhZ2VudCBmb3VuZC4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucywgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblxuXHRcdC8vIFRoZSBwYXJlbnQgdHJhbnNjcmlwdCBtdXN0IGNvbnRhaW4gZXhhY3RseSB0aGUgdXNlciB0dXJuIHdpdGggdGhlXG5cdFx0Ly8gdGFzayB0b29sIGNhbGwgYW5kIHRoZSBmaW5hbCBwYXJlbnQgYXNzaXN0YW50IG1lc3NhZ2UgXHUyMDE0IHRoZVxuXHRcdC8vIHN1YmFnZW50J3MgaW5uZXIgbWVzc2FnZSBtdXN0IE5PVCBhcHBlYXIgYXMgYW4gZXh0cmEgdHVybi5cblx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodHVybnMubGVuZ3RoLCAxKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyh0dXJuc1swXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdIZXJlIGlzIHdoYXQgdGhlIHN1YmFnZW50IGZvdW5kLicgfSxcblx0XHRdKTtcblxuXHRcdC8vIFRoZSBzdWJhZ2VudCdzIGlubmVyIGNvbnRlbnQgaXMgcm91dGVkIHRvIGl0cyBvd24gdHJhbnNjcmlwdCBrZXllZFxuXHRcdC8vIGJ5IHRoZSBwYXJlbnQgdGFzayB0b29sIGNhbGwgaWQuXG5cdFx0Y29uc3Qgc3ViYWdlbnRUdXJucyA9IHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQuZ2V0KCd0Yy10YXNrJyk7XG5cdFx0YXNzZXJ0Lm9rKHN1YmFnZW50VHVybnMsICdFeHBlY3RlZCBzdWJhZ2VudCB0dXJucyBmb3IgdGMtdGFzaycpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJhZ2VudFR1cm5zIS5sZW5ndGgsIDEpO1xuXHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdWJhZ2VudFR1cm5zIVswXS5tZXNzYWdlLnRleHQsICdJbnNwZWN0IHRoZSBpbXBsZW1lbnRhdGlvbi4nKTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHBhcnRLaW5kcyhzdWJhZ2VudFR1cm5zIVswXS5yZXNwb25zZVBhcnRzKSwgW1xuXHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdTdWJhZ2VudCBpcyBkb25lLicgfSxcblx0XHRdKTtcblx0fSk7XG5cblx0dGVzdCgncmVjb25zdHJ1Y3RzIHN1YmFnZW50IGNvbnRlbnQgd2hlbiBsZWdhY3kgY29tcGxldGlvbiBwcmVjZWRlcyBzdWJhZ2VudCBzdGFydCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ3N1bW1hcml6ZSB0aGUgc2VydmljZScgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBuYW1lOiAndGFzaycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgdG9vbE5hbWU6ICd0YXNrJywgYXJndW1lbnRzOiB7IGRlc2NyaXB0aW9uOiAnU3VtbWFyaXplIGFnZW50IHNlcnZpY2UnLCBhZ2VudF90eXBlOiAnZXhwbG9yZScgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBzdWNjZXNzOiB0cnVlLCByZXN1bHQ6IHsgY29udGVudDogJ0FnZW50IHN0YXJ0ZWQgaW4gYmFja2dyb3VuZC4nIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc3RhcnRlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZSBBZ2VudCcsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdzdWJhZ2VudC1wcm9tcHQnLCBjb250ZW50OiAnSW5zcGVjdCBhZ2VudFNlcnZpY2UudHMuJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMycsIGNvbnRlbnQ6ICdTdW1tYXJ5IGNvbXBsZXRlLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXHRcdGNvbnN0IHRvb2xDYWxsID0gdHVybnNbMF0ucmVzcG9uc2VQYXJ0cy5maW5kKChwYXJ0KTogcGFydCBpcyBUb29sQ2FsbFJlc3BvbnNlUGFydCA9PiBwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwpPy50b29sQ2FsbDtcblx0XHRjb25zdCBzdWJhZ2VudENvbnRlbnQgPSB0b29sQ2FsbD8uc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWRcblx0XHRcdD8gdG9vbENhbGwuY29udGVudD8uZmluZChjb250ZW50ID0+IGNvbnRlbnQudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50KVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdGRlc2NyaXB0aW9uOiB0b29sQ2FsbCA/IHJlYWRUb29sQ2FsbE1ldGEodG9vbENhbGwpLnN1YmFnZW50RGVzY3JpcHRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRzdWJhZ2VudENvbnRlbnQsXG5cdFx0XHRjaGlsZE1hcmtkb3duOiBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldCgndGMtdGFzaycpPy5mbGF0TWFwKHR1cm4gPT4gdHVybi5yZXNwb25zZVBhcnRzKVxuXHRcdFx0XHQuZmlsdGVyKHBhcnQgPT4gcGFydC5raW5kID09PSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duKVxuXHRcdFx0XHQubWFwKHBhcnQgPT4gcGFydC5jb250ZW50KSxcblx0XHR9LCB7XG5cdFx0XHRkZXNjcmlwdGlvbjogJ1N1bW1hcml6ZSBhZ2VudCBzZXJ2aWNlJyxcblx0XHRcdHN1YmFnZW50Q29udGVudDoge1xuXHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdHJlc291cmNlOiAnY29waWxvdDovdGVzdC1zZXNzaW9uL3N1YmFnZW50L3RjLXRhc2snLFxuXHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUgQWdlbnQnLFxuXHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJyxcblx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlcycsXG5cdFx0XHR9LFxuXHRcdFx0Y2hpbGRNYXJrZG93bjogWydTdW1tYXJ5IGNvbXBsZXRlLiddLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdkcm9wcyBzdWJhZ2VudCB1c2VyIG1lc3NhZ2VzIHdob3NlIGFnZW50SWQgY2Fubm90IGJlIG1hcHBlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAncm9vdC1tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnQ29udGludWUgdGhlIHRhc2snIH0gfSxcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGlkOiAnb3JwaGFuLXN1YmFnZW50LW1lc3NhZ2UnLCBhZ2VudElkOiAndW5rbm93bi1hZ2VudCcsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20yJywgY29udGVudDogJ0RlbGVnYXRlZCBwcm9tcHQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMycsIGNvbnRlbnQ6ICdEb25lLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHR0dXJuczogdHVybnMubWFwKHR1cm4gPT4gKHtcblx0XHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZS50ZXh0LFxuXHRcdFx0XHRwYXJ0czogcGFydEtpbmRzKHR1cm4ucmVzcG9uc2VQYXJ0cyksXG5cdFx0XHR9KSksXG5cdFx0XHRzdWJhZ2VudFR1cm5zOiBbLi4uc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZF0sXG5cdFx0fSwge1xuXHRcdFx0dHVybnM6IFt7XG5cdFx0XHRcdGlkOiAncm9vdC1tZXNzYWdlJyxcblx0XHRcdFx0bWVzc2FnZTogJ0NvbnRpbnVlIHRoZSB0YXNrJyxcblx0XHRcdFx0cGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGNvbnRlbnQ6ICdEb25lLicgfV0sXG5cdFx0XHR9XSxcblx0XHRcdHN1YmFnZW50VHVybnM6IFtdLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyb3V0ZXMgc3ViYWdlbnQgc2tpbGwgZXZlbnRzIGludG8gdGhlIHN1YmFnZW50IHRyYW5zY3JpcHQnLCBhc3luYyAoKSA9PiB7XG5cdFx0Y29uc3QgZXZlbnRzOiBJU2Vzc2lvbkV2ZW50W10gPSBbXG5cdFx0XHR7IHR5cGU6ICd1c2VyLm1lc3NhZ2UnLCBkYXRhOiB7IGludGVyYWN0aW9uSWQ6ICdtMScsIGNvbnRlbnQ6ICdzcGF3biBhIHN1YmFnZW50JyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTInLCBjb250ZW50OiAnJywgdG9vbFJlcXVlc3RzOiBbeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIG5hbWU6ICd0YXNrJyB9XSB9IH0sXG5cdFx0XHR7IHR5cGU6ICd0b29sLmV4ZWN1dGlvbl9zdGFydCcsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCB0b29sTmFtZTogJ3Rhc2snLCBhcmd1bWVudHM6IHsgZGVzY3JpcHRpb246ICdleHBsb3JlJywgYWdlbnROYW1lOiAnZXhwbG9yZScgfSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdzdWJhZ2VudC5zdGFydGVkJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgYWdlbnROYW1lOiAnZXhwbG9yZScsIGFnZW50RGlzcGxheU5hbWU6ICdFeHBsb3JlJywgYWdlbnREZXNjcmlwdGlvbjogJ0V4cGxvcmVzJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdza2lsbC5pbnZva2VkJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IG5hbWU6ICdyZXNlYXJjaCcsIHBhdGg6ICcvc2tpbGxzL3Jlc2VhcmNoJywgY29udGVudDogJycgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogdHJ1ZSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTMnLCBjb250ZW50OiAnVGhlIHN1YmFnZW50IGZpbmlzaGVkLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRwYXJlbnRTdGF0ZTogdHVybnNbMF0uc3RhdGUsXG5cdFx0XHRwYXJlbnRQYXJ0czogcGFydEtpbmRzKHR1cm5zWzBdLnJlc3BvbnNlUGFydHMpLFxuXHRcdFx0c3ViYWdlbnRQYXJ0czogcGFydEtpbmRzKHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQuZ2V0KCd0Yy10YXNrJyk/LlswXS5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0cGFyZW50UGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsIH0sXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ1RoZSBzdWJhZ2VudCBmaW5pc2hlZC4nIH0sXG5cdFx0XHRdLFxuXHRcdFx0c3ViYWdlbnRQYXJ0czogW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwgfSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3N1YmFnZW50IGFib3J0IG1hcmtzIHRoZSBzdWJhZ2VudCB0dXJuIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ3NwYXduIGEgc3ViYWdlbnQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgbmFtZTogJ3Rhc2snIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHRvb2xOYW1lOiAndGFzaycsIGFyZ3VtZW50czogeyBkZXNjcmlwdGlvbjogJ2V4cGxvcmUnLCBhZ2VudE5hbWU6ICdleHBsb3JlJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3N1YmFnZW50LnN0YXJ0ZWQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20zJywgY29udGVudDogJ1BhcnRpYWwgcmVzdWx0LicgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYWJvcnQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgcmVhc29uOiAndXNlciBpbml0aWF0ZWQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHN1Y2Nlc3M6IGZhbHNlIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtNCcsIGNvbnRlbnQ6ICdUaGUgc3ViYWdlbnQgd2FzIGNhbmNlbGxlZC4nIH0gfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgeyB0dXJucywgc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZCB9ID0gYXdhaXQgbWFwU2Vzc2lvbkV2ZW50cyhzZXNzaW9uLCB1bmRlZmluZWQsIHRvU2Vzc2lvbkV2ZW50cyhldmVudHMpKTtcblx0XHRjb25zdCBzdWJhZ2VudFR1cm4gPSBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkLmdldCgndGMtdGFzaycpPy5bMF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdHBhcmVudFN0YXRlOiB0dXJuc1swXS5zdGF0ZSxcblx0XHRcdHN1YmFnZW50U3RhdGU6IHN1YmFnZW50VHVybj8uc3RhdGUsXG5cdFx0XHRzdWJhZ2VudFBhcnRzOiBwYXJ0S2luZHMoc3ViYWdlbnRUdXJuPy5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0c3ViYWdlbnRTdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHN1YmFnZW50UGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnUGFydGlhbCByZXN1bHQuJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnQgYWJvcnQgYmVmb3JlIGl0cyBmaXJzdCByZXNwb25zZSByZW1haW5zIGNhbmNlbGxlZCcsIGFzeW5jICgpID0+IHtcblx0XHRjb25zdCBldmVudHM6IElTZXNzaW9uRXZlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogJ3VzZXIubWVzc2FnZScsIGRhdGE6IHsgaW50ZXJhY3Rpb25JZDogJ20xJywgY29udGVudDogJ3NwYXduIGEgc3ViYWdlbnQnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMicsIGNvbnRlbnQ6ICcnLCB0b29sUmVxdWVzdHM6IFt7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgbmFtZTogJ3Rhc2snIH1dIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0JywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHRvb2xOYW1lOiAndGFzaycsIGFyZ3VtZW50czogeyBkZXNjcmlwdGlvbjogJ2V4cGxvcmUnLCBhZ2VudE5hbWU6ICdleHBsb3JlJyB9IH0gfSxcblx0XHRcdHsgdHlwZTogJ3N1YmFnZW50LnN0YXJ0ZWQnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBhZ2VudE5hbWU6ICdleHBsb3JlJywgYWdlbnREaXNwbGF5TmFtZTogJ0V4cGxvcmUnLCBhZ2VudERlc2NyaXB0aW9uOiAnRXhwbG9yZXMnIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fib3J0JywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IHJlYXNvbjogJ3VzZXIgaW5pdGlhdGVkJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhc3Npc3RhbnQubWVzc2FnZScsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtMycsIGNvbnRlbnQ6ICdMYXRlIHBhcnRpYWwgcmVzdWx0LicgfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fY29tcGxldGUnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgc3VjY2VzczogZmFsc2UgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ200JywgY29udGVudDogJ1RoZSBzdWJhZ2VudCB3YXMgY2FuY2VsbGVkLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQgfSA9IGF3YWl0IG1hcFNlc3Npb25FdmVudHMoc2Vzc2lvbiwgdW5kZWZpbmVkLCB0b1Nlc3Npb25FdmVudHMoZXZlbnRzKSk7XG5cdFx0Y29uc3Qgc3ViYWdlbnRUdXJuID0gc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZC5nZXQoJ3RjLXRhc2snKT8uWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRzdGF0ZTogc3ViYWdlbnRUdXJuPy5zdGF0ZSxcblx0XHRcdHBhcnRzOiBwYXJ0S2luZHMoc3ViYWdlbnRUdXJuPy5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRzdGF0ZTogVHVyblN0YXRlLkNhbmNlbGxlZCxcblx0XHRcdHBhcnRzOiBbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgY29udGVudDogJ0xhdGUgcGFydGlhbCByZXN1bHQuJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG5cblx0dGVzdCgnc3ViYWdlbnQgZXJyb3IgbWFya3Mgb25seSB0aGUgc3ViYWdlbnQgdHVybiBlcnJvcmVkIGFuZCByZW1haW5zIHRlcm1pbmFsJywgYXN5bmMgKCkgPT4ge1xuXHRcdGNvbnN0IGV2ZW50czogSVNlc3Npb25FdmVudFtdID0gW1xuXHRcdFx0eyB0eXBlOiAndXNlci5tZXNzYWdlJywgZGF0YTogeyBpbnRlcmFjdGlvbklkOiAnbTEnLCBjb250ZW50OiAnc3Bhd24gYSBzdWJhZ2VudCcgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBkYXRhOiB7IG1lc3NhZ2VJZDogJ20yJywgY29udGVudDogJycsIHRvb2xSZXF1ZXN0czogW3sgdG9vbENhbGxJZDogJ3RjLXRhc2snLCBuYW1lOiAndGFzaycgfV0gfSB9LFxuXHRcdFx0eyB0eXBlOiAndG9vbC5leGVjdXRpb25fc3RhcnQnLCBkYXRhOiB7IHRvb2xDYWxsSWQ6ICd0Yy10YXNrJywgdG9vbE5hbWU6ICd0YXNrJywgYXJndW1lbnRzOiB7IGRlc2NyaXB0aW9uOiAnZXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnIH0gfSB9LFxuXHRcdFx0eyB0eXBlOiAnc3ViYWdlbnQuc3RhcnRlZCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBhZ2VudERpc3BsYXlOYW1lOiAnRXhwbG9yZScsIGFnZW50RGVzY3JpcHRpb246ICdFeHBsb3JlcycgfSB9LFxuXHRcdFx0eyB0eXBlOiAnYXNzaXN0YW50Lm1lc3NhZ2UnLCBhZ2VudElkOiAnYWdlbnQtMScsIGRhdGE6IHsgbWVzc2FnZUlkOiAnbTMnLCBjb250ZW50OiAnUGFydGlhbCByZXN1bHQuJyB9IH0sXG5cdFx0XHR7IHR5cGU6ICdzZXNzaW9uLmVycm9yJywgYWdlbnRJZDogJ2FnZW50LTEnLCBkYXRhOiB7IGVycm9yVHlwZTogJ3JhdGVfbGltaXQnLCBtZXNzYWdlOiAnU3ViYWdlbnQgcmF0ZSBsaW1pdGVkLicsIHN0YXR1c0NvZGU6IDQyOSB9IH0sXG5cdFx0XHR7IHR5cGU6ICdhYm9ydCcsIGFnZW50SWQ6ICdhZ2VudC0xJywgZGF0YTogeyByZWFzb246ICdjbGVhbnVwIGFmdGVyIGZhaWx1cmUnIH0gfSxcblx0XHRcdHsgdHlwZTogJ3Rvb2wuZXhlY3V0aW9uX2NvbXBsZXRlJywgZGF0YTogeyB0b29sQ2FsbElkOiAndGMtdGFzaycsIHN1Y2Nlc3M6IGZhbHNlIH0gfSxcblx0XHRcdHsgdHlwZTogJ2Fzc2lzdGFudC5tZXNzYWdlJywgZGF0YTogeyBtZXNzYWdlSWQ6ICdtNCcsIGNvbnRlbnQ6ICdUaGUgc3ViYWdlbnQgZmFpbGVkLicgfSB9LFxuXHRcdF07XG5cblx0XHRjb25zdCB7IHR1cm5zLCBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkIH0gPSBhd2FpdCBtYXBTZXNzaW9uRXZlbnRzKHNlc3Npb24sIHVuZGVmaW5lZCwgdG9TZXNzaW9uRXZlbnRzKGV2ZW50cykpO1xuXHRcdGNvbnN0IHN1YmFnZW50VHVybiA9IHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQuZ2V0KCd0Yy10YXNrJyk/LlswXTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0cGFyZW50U3RhdGU6IHR1cm5zWzBdLnN0YXRlLFxuXHRcdFx0cGFyZW50RXJyb3I6IHR1cm5zWzBdLmVycm9yLFxuXHRcdFx0c3ViYWdlbnRTdGF0ZTogc3ViYWdlbnRUdXJuPy5zdGF0ZSxcblx0XHRcdHN1YmFnZW50RXJyb3I6IHN1YmFnZW50VHVybj8uZXJyb3IsXG5cdFx0XHRzdWJhZ2VudFBhcnRzOiBwYXJ0S2luZHMoc3ViYWdlbnRUdXJuPy5yZXNwb25zZVBhcnRzID8/IFtdKSxcblx0XHR9LCB7XG5cdFx0XHRwYXJlbnRTdGF0ZTogVHVyblN0YXRlLkNvbXBsZXRlLFxuXHRcdFx0cGFyZW50RXJyb3I6IHVuZGVmaW5lZCxcblx0XHRcdHN1YmFnZW50U3RhdGU6IFR1cm5TdGF0ZS5FcnJvcixcblx0XHRcdHN1YmFnZW50RXJyb3I6IHtcblx0XHRcdFx0ZXJyb3JUeXBlOiAncmF0ZV9saW1pdCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdTdWJhZ2VudCByYXRlIGxpbWl0ZWQuJyxcblx0XHRcdFx0c3RhY2s6IHVuZGVmaW5lZCxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRjaGF0RXJyb3I6IHtcblx0XHRcdFx0XHRcdGZldGNoRXJyb3I6IHtcblx0XHRcdFx0XHRcdFx0dHlwZTogJ3JhdGVMaW1pdGVkJyxcblx0XHRcdFx0XHRcdFx0cmVhc29uOiAnU3ViYWdlbnQgcmF0ZSBsaW1pdGVkLicsXG5cdFx0XHRcdFx0XHRcdHJlcXVlc3RJZDogJycsXG5cdFx0XHRcdFx0XHRcdGNhcGlFcnJvcjogeyBjb2RlOiB1bmRlZmluZWQsIG1lc3NhZ2U6ICdTdWJhZ2VudCByYXRlIGxpbWl0ZWQuJyB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSxcblx0XHRcdHN1YmFnZW50UGFydHM6IFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBjb250ZW50OiAnUGFydGlhbCByZXN1bHQuJyB9LFxuXHRcdFx0XSxcblx0XHR9KTtcblx0fSk7XG59KTtcblxuc3VpdGUoJ2FwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50JywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2ZvbGRzIHNoZWxsX2V4aXQgaW50byBhbiBleGlzdGluZyB0ZXJtaW5hbCBibG9jayBpbnN0ZWFkIG9mIGFkZGluZyBhIHNlY29uZCBvbmUnLCAoKSA9PiB7XG5cdFx0Y29uc3QgY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSA9IFtcblx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2FiYycsIHRpdGxlOiAnQmFzaCcgfSxcblx0XHRdO1xuXG5cdFx0Y29uc3QgcmVzdWx0ID0gYXBwZW5kU2RrVG9vbFJlc3VsdENvbnRlbnQoY29udGVudCwgW1xuXHRcdFx0eyB0eXBlOiAnc2hlbGxfZXhpdCcsIHNoZWxsSWQ6ICcwJywgZXhpdENvZGU6IDIsIG91dHB1dFByZXZpZXc6ICdib29tXFxuJywgb3V0cHV0VHJ1bmNhdGVkOiBmYWxzZSB9LFxuXHRcdF0sIHsgc2Vzc2lvbjogQWdlbnRTZXNzaW9uLnVyaSgnY29waWxvdCcsICd0ZXN0LXNlc3Npb24nKSwgdG9vbENhbGxJZDogJ3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJyB9KTtcblxuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7IHNoZWxsSWQ6ICcwJywgcmVzdWx0OiB7IGV4aXRDb2RlOiAyLCBwcmV2aWV3OiAnYm9vbVxcbicsIHRydW5jYXRlZDogZmFsc2UgfSB9KTtcblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGNvbnRlbnQsIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0XHRyZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2FiYycsXG5cdFx0XHRcdHRpdGxlOiAnQmFzaCcsXG5cdFx0XHRcdHJlc3VsdDogeyBleGl0Q29kZTogMiwgcHJldmlldzogJ2Jvb21cXG4nLCB0cnVuY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0XHR9LFxuXHRcdF0pO1xuXHR9KTtcblxuXHR0ZXN0KCdpZ25vcmVzIGEgbnVsbCBzaGVsbF9leGl0IG91dHB1dCBwcmV2aWV3JywgKCkgPT4ge1xuXHRcdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gPSBbXTtcblxuXHRcdGNvbnN0IHJlc3VsdCA9IGFwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50KGNvbnRlbnQsIFtcblx0XHRcdHsgdHlwZTogJ3NoZWxsX2V4aXQnLCBzaGVsbElkOiAnMCcsIGV4aXRDb2RlOiA3LCBvdXRwdXRQcmV2aWV3OiBudWxsLCBvdXRwdXRUcnVuY2F0ZWQ6IGZhbHNlIH0sXG5cdFx0XSwgeyBzZXNzaW9uOiBBZ2VudFNlc3Npb24udXJpKCdjb3BpbG90JywgJ3Rlc3Qtc2Vzc2lvbicpLCB0b29sQ2FsbElkOiAndGMtMScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnIH0pO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7IHJlc3VsdCwgY29udGVudCB9LCB7XG5cdFx0XHRyZXN1bHQ6IHsgc2hlbGxJZDogJzAnLCByZXN1bHQ6IHsgZXhpdENvZGU6IDcsIHRydW5jYXRlZDogZmFsc2UgfSB9LFxuXHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLFxuXHRcdFx0XHRcdHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvdGVzdC1zZXNzaW9uL3RjLTEnLFxuXHRcdFx0XHRcdHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0XHRcdGlzUHR5OiBmYWxzZSxcblx0XHRcdFx0XHRyZXN1bHQ6IHsgZXhpdENvZGU6IDcsIHRydW5jYXRlZDogZmFsc2UgfSxcblx0XHRcdFx0fSxcblx0XHRcdF0sXG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxX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
