import assert from "assert";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { autorun } from "../../../../../../base/common/observable.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { URI } from "../../../../../../base/common/uri.js";
import { MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { ensureNoDisposablesAreLeakedInTestSuite } from "../../../../../../base/test/common/utils.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { toAgentMessageDelegationMeta } from "../../../../../../platform/agentHost/common/meta/agentMessageDelegationMeta.js";
import { AgentSystemNotificationKind, AgentSystemNotificationSeverity, toAgentSystemNotificationMeta } from "../../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js";
import { McpAuthRequiredReason } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { fromAgentHostUri, toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { buildSubagentChatUri, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, MessageAttachmentKind, MessageKind, ToolCallContributorKind, ToolCallRiskAssessmentKind, ToolCallRiskAssessmentStatus, ToolCallStatus, ToolCallConfirmationReason, ToolResultContentType, TurnState, ResponsePartKind, readUsageInfoMeta, withMessageHiddenFromTranscript, ToolCallCancellationReason } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { ChatTranscriptContextAttachmentDisplayKind, toChatTranscriptContextAttachmentMeta } from "../../../common/attachments/chatVariableEntries.js";
import { ChatRequestOriginKind } from "../../../common/chatRequestOrigin.js";
import { IChatToolInvocation, ToolConfirmKind } from "../../../common/chatService/chatService.js";
import { isToolResultInputOutputDetails, ToolDataSource, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { turnsToHistory as rawTurnsToHistory, activeTurnToProgress as rawActiveTurnToProgress, completedToolCallToSerialized, containsAutomaticReplyAnswer, createInputRequestCarousel, messageAttachmentsToVariableData, shouldObserveSubagentChat, toolCallStateToInvocation as rawToolCallStateToInvocation, toolCallStateToPreparedInvocation as rawToolCallStateToPreparedInvocation, toolCallStateToStreamingInvocation, finalizeToolInvocation as rawFinalizeToolInvocation, updateRunningToolSpecificData as rawUpdateRunningToolSpecificData, updateStreamingToolInvocation, usageInfoToAutoModeResolution, usageInfoToChatUsage, usageInfoToQuotas, formatTurnResponseDetails, rewriteAgentHostLinkTarget, rewriteMarkdownLinks } from "../../../browser/agentSessions/agentHost/stateToProgressAdapter.js";
function createToolCallState(overrides) {
  return {
    toolCallId: "tc-1",
    toolName: "test_tool",
    displayName: "Test Tool",
    invocationMessage: "Running test tool...",
    status: ToolCallStatus.Running,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    ...overrides
  };
}
function createCompletedToolCall(overrides) {
  return {
    status: ToolCallStatus.Completed,
    toolCallId: "tc-1",
    toolName: "test_tool",
    displayName: "Test Tool",
    invocationMessage: "Running test tool...",
    success: true,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    pastTenseMessage: "Ran test tool",
    ...overrides
  };
}
function createTurn(overrides) {
  return {
    id: "turn-1",
    message: { text: "Hello", origin: { kind: MessageKind.User } },
    responseParts: [],
    usage: void 0,
    state: TurnState.Complete,
    ...overrides
  };
}
function getSerializedTerminalData(serialized) {
  const toolSpecificData = serialized.toolSpecificData;
  assert.strictEqual(toolSpecificData?.kind, "terminal");
  assert.ok(toolSpecificData && hasKey(toolSpecificData, { commandLine: true }));
  return toolSpecificData;
}
function message(text, kind = MessageKind.User) {
  return { text, origin: { kind } };
}
function toolCallStateToInvocation(tc, subAgentInvocationId, options) {
  return rawToolCallStateToInvocation(tc, subAgentInvocationId, URI.file("/"), "local", void 0, options);
}
function toolCallStateToPreparedInvocation(tc) {
  return rawToolCallStateToPreparedInvocation(tc, URI.file("/"), "local");
}
function finalizeToolInvocation(invocation, tc) {
  return rawFinalizeToolInvocation(invocation, tc, URI.file("/"), "local");
}
function turnsToHistory(backendSession, turns, participantId, lookup) {
  return rawTurnsToHistory(backendSession, turns, participantId, "local", lookup);
}
function makeLookup(prefix, displayNames, fallbackRawModelId) {
  const resolveRaw = (raw) => raw ?? fallbackRawModelId;
  return {
    toLanguageModelId: (raw) => {
      const r = resolveRaw(raw);
      return r ? `${prefix}${r}` : void 0;
    },
    toModelDisplayName: (raw) => displayNames[raw],
    toResponseDetails: (raw) => {
      const r = resolveRaw(raw);
      return r ? displayNames[r] : void 0;
    },
    toAutoModeResolution: (usage) => {
      const raw = readUsageInfoMeta(usage).autoModeResolved?.chosenModel;
      return usageInfoToAutoModeResolution(usage, raw ? displayNames[raw] : void 0);
    }
  };
}
function activeTurnToProgress(sessionResource, activeTurn, connectionAuthority, options) {
  return rawActiveTurnToProgress(sessionResource, activeTurn, connectionAuthority || "local", void 0, options);
}
function updateRunningToolSpecificData(existing, tc) {
  return rawUpdateRunningToolSpecificData(existing, tc, URI.file("/"), "local");
}
function assertInputOutputDetails(details) {
  assert.ok(isToolResultInputOutputDetails(details));
}
suite("stateToProgressAdapter", () => {
  ensureNoDisposablesAreLeakedInTestSuite();
  test("detects the canonical automatic reply answer", () => {
    assert.deepStrictEqual([
      containsAutomaticReplyAnswer({
        question: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: AgentHostAutoReplyAnswer }
        }
      }),
      containsAutomaticReplyAnswer({
        question: {
          state: ChatInputAnswerState.Submitted,
          value: { kind: ChatInputAnswerValueKind.Text, value: "User answer" }
        }
      })
    ], [true, false]);
  });
  test("restores transcript context attachments as their first-class kind", () => {
    const original = {
      kind: "transcriptContext",
      id: "pr",
      name: "#42 Improve sessions",
      fullName: "#42 Improve sessions",
      icon: Codicon.gitPullRequest,
      tooltip: "Pull request #42 by @author",
      value: '{"number":42}',
      uri: URI.parse("https://github.com/owner/repo/pull/42")
    };
    const restored = messageAttachmentsToVariableData([{
      type: MessageAttachmentKind.Simple,
      label: original.name,
      displayKind: ChatTranscriptContextAttachmentDisplayKind,
      modelRepresentation: original.value,
      _meta: toChatTranscriptContextAttachmentMeta(original)
    }], "local")?.variables[0];
    assert.deepStrictEqual(restored && {
      kind: restored.kind,
      name: restored.name,
      fullName: restored.fullName,
      icon: restored.icon?.id,
      value: restored.value,
      uri: restored.kind === "transcriptContext" ? restored.uri.toString() : void 0,
      tooltip: restored.kind === "transcriptContext" ? restored.tooltip : void 0
    }, {
      kind: "transcriptContext",
      name: "#42 Improve sessions",
      fullName: "#42 Improve sessions",
      icon: "git-pull-request",
      value: '{"number":42}',
      uri: "https://github.com/owner/repo/pull/42",
      tooltip: "Pull request #42 by @author"
    });
  });
  test("restores legacy transcript context attachments without a display kind", () => {
    const restored = messageAttachmentsToVariableData([{
      type: MessageAttachmentKind.Simple,
      label: "#42 Improve sessions",
      modelRepresentation: '{"number":42}',
      _meta: {
        "vscode.chat.transcriptContext": {
          label: "#42 Improve sessions",
          iconId: "git-pull-request",
          tooltip: "Pull request #42 by @author",
          uri: "https://github.com/owner/repo/pull/42"
        }
      }
    }], "local")?.variables[0];
    assert.deepStrictEqual(restored && {
      kind: restored.kind,
      name: restored.name,
      icon: restored.icon?.id,
      value: restored.value,
      uri: restored.kind === "transcriptContext" ? restored.uri.toString() : void 0
    }, {
      kind: "transcriptContext",
      name: "#42 Improve sessions",
      icon: "git-pull-request",
      value: '{"number":42}',
      uri: "https://github.com/owner/repo/pull/42"
    });
  });
  suite("rewriteAgentHostLinkTarget", () => {
    test("supports absolute paths and file URIs with validated locations", () => {
      const unwrap = (href) => fromAgentHostUri(URI.parse(rewriteAgentHostLinkTarget(href, "my-host"))).toString();
      assert.deepStrictEqual(
        [
          unwrap("C:\\remote\\windows.ts:42"),
          unwrap("\\\\server\\share\\unc.ts:42"),
          unwrap("FILE:///remote/upper.ts:42"),
          unwrap("/remote/zero.ts:0"),
          unwrap("/remote/zero-column.ts:42:0"),
          unwrap("/remote/numeric-segment.ts:42:name.ts"),
          unwrap("/remote/scientific.ts:1e2"),
          unwrap("/remote/encoded%3A42"),
          unwrap("/remote/encoded%3A42:10"),
          unwrap("file:///remote/encoded%3A42"),
          unwrap("file:///remote/encoded%3A42:10"),
          unwrap("file:///remote/queried.ts?rev=1:42"),
          unwrap("/remote/range.ts:42-48")
        ],
        [
          URI.file("C:/remote/windows.ts").with({ fragment: "L42" }).toString(),
          URI.file("//server/share/unc.ts").with({ fragment: "L42" }).toString(),
          URI.file("/remote/upper.ts").with({ fragment: "L42" }).toString(),
          URI.file("/remote/zero.ts:0").toString(),
          URI.file("/remote/zero-column.ts:42:0").toString(),
          URI.file("/remote/numeric-segment.ts:42:name.ts").toString(),
          URI.file("/remote/scientific.ts:1e2").toString(),
          URI.file("/remote/encoded:42").toString(),
          URI.file("/remote/encoded:42").with({ fragment: "L10" }).toString(),
          URI.file("/remote/encoded:42").toString(),
          URI.file("/remote/encoded:42").with({ fragment: "L10" }).toString(),
          URI.file("/remote/queried.ts").with({ query: "rev=1:42" }).toString(),
          URI.file("/remote/range.ts:42-48").toString()
        ]
      );
    });
    test("preserves client-handled link schemes", () => {
      assert.deepStrictEqual(
        [
          rewriteAgentHostLinkTarget("vscode-browser://example.com", "my-host"),
          rewriteAgentHostLinkTarget("copilot-skill:/plan", "my-host"),
          rewriteAgentHostLinkTarget("C:relative", "my-host"),
          rewriteAgentHostLinkTarget("git:foo", "my-host"),
          rewriteAgentHostLinkTarget("urn:isbn:123", "my-host")
        ],
        [
          "vscode-browser://example.com",
          "copilot-skill:/plan",
          "C:relative",
          "git:foo",
          "urn:isbn:123"
        ]
      );
    });
  });
  suite("turnsToHistory", () => {
    test("empty turns produces empty history", () => {
      const result = turnsToHistory(URI.file("/"), [], "p");
      assert.deepStrictEqual(result, []);
    });
    test("single turn produces request + response pair", () => {
      const turn = createTurn({
        message: message("Do something"),
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: createCompletedToolCall() }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history.length, 2);
      assert.strictEqual(history[0].type, "request");
      assert.strictEqual(history[0].prompt, "Do something");
      assert.strictEqual(history[0].participant, "participant-1");
      assert.strictEqual(history[1].type, "response");
      assert.strictEqual(history[1].participant, "participant-1");
      assert.strictEqual(history[1].parts.length, 1);
      const serialized = history[1].parts[0];
      assert.strictEqual(serialized.kind, "toolInvocationSerialized");
      assert.strictEqual(serialized.toolCallId, "tc-1");
      assert.strictEqual(serialized.toolId, "test_tool");
      assert.strictEqual(serialized.isComplete, true);
    });
    test("system-initiated turn preserves compact request label", () => {
      const turn = createTurn({
        message: message("`sleep 6` completed", MessageKind.SystemNotification)
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history[0].type, "request");
      if (history[0].type !== "request") {
        return;
      }
      assert.strictEqual(history[0].isSystemInitiated, true);
      assert.strictEqual(history[0].prompt, "`sleep 6` completed");
      assert.strictEqual(history[0].systemInitiatedLabel, void 0);
    });
    test("hidden turn remains hidden when restored from protocol history", () => {
      const turn = createTurn({
        message: withMessageHiddenFromTranscript(message("Inspect this pull request"), true)
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.deepStrictEqual(history[0], {
        id: turn.id,
        type: "request",
        prompt: "<!-- vscode-hidden-from-transcript -->\nInspect this pull request",
        participant: "participant-1",
        modelId: void 0,
        variableData: void 0,
        isHidden: true
      });
    });
    test("delegated turn retains a source session link without exposing provider metadata", () => {
      const turn = createTurn({
        message: {
          text: "Review this",
          origin: { kind: MessageKind.User },
          _meta: toAgentMessageDelegationMeta({ sourceThreadId: "source-thread" })
        }
      });
      const history = turnsToHistory(URI.parse("codex:/child-thread"), [turn], "agent-host-codex");
      assert.deepStrictEqual(history[0], {
        id: turn.id,
        type: "request",
        prompt: "Review this",
        participant: "agent-host-codex",
        modelId: void 0,
        variableData: void 0,
        origin: {
          kind: ChatRequestOriginKind.Delegation,
          sourceSessionResource: URI.parse("agent-host-codex:/source-thread")
        }
      });
    });
    test("thread coordination tools restore deterministic target-session chips", () => {
      const createLink = "agent-host-session://codex/created-thread";
      const sendLink = "agent-host-session://codex/target-thread";
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolCallId: "create",
            toolName: "create_session",
            toolInput: JSON.stringify({ prompt: "Remember this word: capybara" }),
            content: [{ type: ToolResultContentType.Text, text: createLink }]
          })
        }, {
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolCallId: "send",
            toolName: "send_message",
            toolInput: JSON.stringify({ prompt: "foo" }),
            content: [{ type: ToolResultContentType.Text, text: sendLink }]
          })
        }]
      });
      const history = turnsToHistory(URI.parse("codex:/source-thread"), [turn], "agent-host-codex");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(response.parts.map((part) => part.kind === "toolInvocationSerialized" ? part.toolSpecificData : void 0), [{
        kind: "sessionCreated",
        openLink: createLink,
        label: "Remember this word: capybara",
        isChat: false
      }, {
        kind: "sessionCreated",
        openLink: sendLink,
        label: "foo",
        isChat: false
      }]);
    });
    test("system notification response part restores as system notification", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.SystemNotification, content: "Shell command completed" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const progress = response.parts[0];
      assert.strictEqual(progress.kind, "systemNotification");
      if (progress.kind !== "systemNotification") {
        return;
      }
      assert.strictEqual(progress.content.value, "Shell command completed");
    });
    test("worktree failure notification restores as warning", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.SystemNotification,
          content: "Worktree creation failed",
          _meta: toAgentSystemNotificationMeta({
            kind: AgentSystemNotificationKind.WorktreeCreationFailure,
            severity: AgentSystemNotificationSeverity.Warning
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(response.parts[0], {
        kind: "warning",
        content: new MarkdownString("Worktree creation failed")
      });
    });
    test("reasoning response part restores as thinking progress carrying its id", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.Reasoning, id: "r-1", content: "Let me think about this..." }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const thinking = response.parts[0];
      assert.strictEqual(thinking.kind, "thinking");
      assert.strictEqual(thinking.value, "Let me think about this...");
      assert.strictEqual(thinking.id, "r-1");
    });
    test("generic completed tool call in history includes input/output details", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"query":"terminal activation"}',
            content: [{ type: ToolResultContentType.Text, text: "Use shell integration." }]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.input, '{"query":"terminal activation"}');
      assert.strictEqual(details.inputLanguage, "json");
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "Use shell integration.", isText: true, mimeType: "text/plain" }]);
      assert.strictEqual(details.isError, false);
    });
    test("restores an answered ask-user interaction as a hidden tool plus conversational summary", () => {
      const turn = createTurn({
        responseParts: [
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({ toolName: "ask_user" })
          },
          {
            kind: ResponsePartKind.InputRequest,
            request: {
              id: "input-1",
              questions: [{
                id: "q1",
                kind: ChatInputQuestionKind.SingleSelect,
                message: "What should we work on?",
                required: true,
                options: [
                  { id: "fix", label: "Fix a bug" },
                  { id: "feature", label: "Implement a feature" }
                ]
              }],
              answers: {
                q1: {
                  state: ChatInputAnswerState.Submitted,
                  value: { kind: ChatInputAnswerValueKind.Selected, value: "fix" }
                }
              }
            },
            response: ChatInputResponseKind.Accept
          }
        ]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const parts = history[1].type === "response" ? history[1].parts : [];
      const tool = parts[0];
      const carousel = parts[1];
      assert.deepStrictEqual({
        toolPresentation: tool.presentation,
        carouselKind: carousel.kind,
        answerPresentation: carousel.kind === "questionCarousel" ? carousel.answerPresentation : void 0,
        answer: carousel.kind === "questionCarousel" ? carousel.data?.q1 : void 0
      }, {
        toolPresentation: ToolInvocationPresentation.HiddenAfterComplete,
        carouselKind: "questionCarousel",
        answerPresentation: "conversation",
        answer: { selectedValue: "fix", freeformValue: void 0 }
      });
    });
    test("generic failed tool call in history uses error text as output", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"url":"https://example.com"}',
            success: false,
            error: { message: "request timed out" }
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.isError, true);
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "request timed out", isText: true, mimeType: "text/plain" }]);
    });
    test("failed MCP App tool call in history remains confirmed", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolName: "GitHub-create_pull_request",
            toolInput: '{"owner":"microsoft","repo":"vscode"}',
            success: false,
            error: { message: "The pull request form is awaiting submission." },
            contributor: { kind: ToolCallContributorKind.MCP, customizationId: "github-customization" },
            _meta: {
              ui: {
                resourceUri: "ui://github-mcp-server/pr-write",
                channel: "mcp://copilot/session/GitHub"
              }
            }
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.deepStrictEqual({
        isConfirmed: serialized.isConfirmed,
        toolSpecificData: serialized.toolSpecificData
      }, {
        isConfirmed: { type: ToolConfirmKind.ConfirmationNotNeeded },
        toolSpecificData: {
          kind: "input",
          rawInput: { owner: "microsoft", repo: "vscode" },
          mcpAppData: {
            kind: "agentHost",
            resourceUri: "ui://github-mcp-server/pr-write",
            serverId: "github-customization",
            channel: "mcp://copilot/session/GitHub"
          }
        }
      });
    });
    test("generic completed tool call maps embedded resources and resource refs", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: '{"image":"diagram"}',
            content: [
              { type: ToolResultContentType.EmbeddedResource, data: "aW1hZ2U=", contentType: "image/png" },
              { type: ToolResultContentType.Resource, uri: "agenthost-content:///session/result.txt", contentType: "text/plain" }
            ]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assertInputOutputDetails(details);
      assert.strictEqual(details.output.length, 2);
      assert.deepStrictEqual(details.output[0], { type: "embed", value: "aW1hZ2U=", mimeType: "image/png" });
      assert.strictEqual(details.output[1].type, "ref");
      assert.strictEqual(details.output[1].uri.scheme, "vscode-agent-host");
      assert.strictEqual(details.output[1].uri.authority, "local");
      assert.strictEqual(details.output[1].uri.path, "/session/result.txt");
      assert.strictEqual(details.output[1].mimeType, "text/plain");
    });
    test("per-turn model id and display name flow from usage.model", () => {
      const turn1 = createTurn({
        id: "turn-1",
        message: message("first"),
        usage: { model: "gpt-5" }
      });
      const turn2 = createTurn({
        id: "turn-2",
        message: message("second"),
        usage: { model: "opus-4.7" }
      });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5": "GPT-5", "opus-4.7": "Claude Opus 4.7" });
      const history = turnsToHistory(URI.file("/"), [turn1, turn2], "p", lookup);
      assert.deepStrictEqual(
        history.map((h) => h.type === "request" ? { type: h.type, modelId: h.modelId } : { type: h.type, details: h.details }),
        [
          { type: "request", modelId: "agent-host-copilot:gpt-5" },
          { type: "response", details: "GPT-5" },
          { type: "request", modelId: "agent-host-copilot:opus-4.7" },
          { type: "response", details: "Claude Opus 4.7" }
        ]
      );
    });
    test("restores Auto model routing with the shared chat UI part", () => {
      const turn = createTurn({
        usage: {
          model: "gpt-5.4-mini",
          _meta: {
            autoModeResolved: {
              chosenModel: "gpt-5.4-mini",
              predictedLabel: "no_reasoning",
              confidence: 0.98
            }
          }
        }
      });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5.4-mini": "GPT-5.4 mini" });
      const history = turnsToHistory(URI.file("/"), [turn], "p", lookup);
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(response.parts, [{
        kind: "autoModeResolution",
        resolvedModel: "gpt-5.4-mini",
        resolvedModelName: "GPT-5.4 mini",
        predictedLabel: "no_reasoning",
        confidence: 0.98
      }]);
    });
    test("falls back to session-level model when turn has no usage.model", () => {
      const turn = createTurn({ message: message("first") });
      const lookup = makeLookup("agent-host-copilot:", { "gpt-5": "GPT-5" }, "gpt-5");
      const history = turnsToHistory(URI.file("/"), [turn], "p", lookup);
      assert.deepStrictEqual(
        history.map((h) => h.type === "request" ? { type: h.type, modelId: h.modelId } : { type: h.type, details: h.details }),
        [
          { type: "request", modelId: "agent-host-copilot:gpt-5" },
          { type: "response", details: "GPT-5" }
        ]
      );
    });
    test("maps turn usage to chat usage progress for restored history", () => {
      const turn = createTurn({
        usage: {
          inputTokens: 1200,
          outputTokens: 300,
          model: "gpt-5",
          _meta: {
            turnTokenTotals: [{ model: "gpt-5", inputTokens: 1200, cachedTokens: 400, outputTokens: 300 }]
          }
        },
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "md-1", content: "Done" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p", makeLookup("agent-host-copilot:", { "gpt-5": "GPT-5" }));
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(
        response.parts.map((part) => part.kind === "usage" ? { kind: part.kind, promptTokens: part.promptTokens, completionTokens: part.completionTokens, modelTotals: part.modelTotals } : { kind: part.kind }),
        [
          {
            kind: "usage",
            promptTokens: 1200,
            completionTokens: 300,
            modelTotals: [{ model: "GPT-5", inputTokens: 1200, cachedTokens: 400, outputTokens: 300 }]
          },
          { kind: "markdownContent" }
        ]
      );
    });
    test("request history includes restored model id", () => {
      const turn = createTurn({
        message: message("Use restored model"),
        startedAt: "2025-07-08T22:05:21.000Z",
        duration: 2500
      });
      const lookup = makeLookup("agent-host-copilot:", {}, "gpt-5");
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1", lookup);
      assert.deepStrictEqual(history[0], {
        id: turn.id,
        type: "request",
        prompt: "Use restored model",
        participant: "participant-1",
        modelId: "agent-host-copilot:gpt-5",
        timestamp: 1752012321e3,
        variableData: void 0
      });
      assert.deepStrictEqual(history[1].type === "response" ? {
        elapsedMs: history[1].elapsedMs,
        completedAt: history[1].completedAt
      } : void 0, {
        elapsedMs: 2500,
        completedAt: 1752012323500
      });
    });
    test("request history omits invalid restored timestamp", () => {
      const turn = createTurn({ startedAt: "invalid" });
      const history = turnsToHistory(URI.file("/"), [turn], "participant-1");
      assert.strictEqual(history[0].type === "request" ? history[0].timestamp : void 0, void 0);
    });
    test("terminal tool call in history has correct terminal data", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: "echo hello",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t1", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "hello" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      assert.strictEqual(serialized.resultDetails, void 0);
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "echo hello");
      assert.strictEqual(termData.terminalCommandOutput.text, "hello");
      assert.strictEqual(termData.terminalCommandState.exitCode, 0);
    });
    test("image generation in history is marked as a durable image outcome", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolName: "image_gen.imagegen",
            toolInput: '{"prompt":"Draw a fox"}',
            content: [{ type: ToolResultContentType.EmbeddedResource, data: "aW1hZ2U=", contentType: "image/png" }]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const details = serialized.resultDetails;
      assert.deepStrictEqual({
        toolSpecificData: serialized.toolSpecificData,
        input: isToolResultInputOutputDetails(details) ? details.input : void 0,
        output: isToolResultInputOutputDetails(details) ? details.output : void 0
      }, {
        toolSpecificData: { kind: "generatedImage" },
        input: '{"prompt":"Draw a fox"}',
        output: [{ type: "embed", value: "aW1hZ2U=", mimeType: "image/png" }]
      });
    });
    test("terminal tool call in history carries autoApproveRuleResolvable only when stamped", () => {
      const turn = createTurn({
        responseParts: [
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({
              toolCallId: "tc-marked",
              toolInput: "my-custom-script",
              _meta: { toolKind: "terminal", autoApproveRuleResolvable: true },
              content: [{ type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///marked", title: "Terminal" }],
              success: true
            })
          },
          {
            kind: ResponsePartKind.ToolCall,
            toolCall: createCompletedToolCall({
              toolCallId: "tc-unmarked",
              toolInput: "echo hello",
              content: [{ type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///unmarked", title: "Terminal" }],
              success: true
            })
          }
        ]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.deepStrictEqual(
        response.parts.map((part) => getSerializedTerminalData(part).autoApproveRuleResolvable),
        [true, void 0],
        "flag is copied from tool call meta and absent otherwise"
      );
    });
    test("terminal tool call in history carries the LM intention", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            intention: "List files in the repo root",
            toolInput: "ls",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///intent", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "a\nb" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.intention, "List files in the repo root");
    });
    test("terminal tool call in history does not set pastTenseMessage (avoids duplicate render)", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "terminal" },
            toolInput: "echo hi",
            pastTenseMessage: "Ran echo hi",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///past", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "hi" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      assert.strictEqual(serialized.pastTenseMessage, void 0);
    });
    test("terminal tool call (by toolKind only) in history does not set pastTenseMessage", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "terminal" },
            toolInput: "echo hi",
            pastTenseMessage: "Ran echo hi",
            content: [
              { type: ToolResultContentType.Text, text: "hi" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      assert.strictEqual(serialized.pastTenseMessage, void 0);
    });
    test("subagent tool call in history has correct subagent data", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
            content: [
              { type: ToolResultContentType.Text, text: "Agent result" },
              { type: ToolResultContentType.Subagent, resource: "copilot://session/subagent/tc-1", title: "Explore", agentName: "explore", description: "Explores the codebase" }
            ],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "subagent");
      assert.strictEqual(serialized.resultDetails, void 0);
      if (serialized.toolSpecificData.kind === "subagent") {
        assert.strictEqual(serialized.toolSpecificData.agentName, "explore");
        assert.strictEqual(serialized.toolSpecificData.description, "Find related files");
        assert.strictEqual(serialized.toolSpecificData.result, "Agent result");
        assert.strictEqual(serialized.toolSpecificData.chatResource, "copilot://session/subagent/tc-1");
      }
    });
    test("subagent tool without content falls back to toolKind meta", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolName: "task",
            displayName: "Task",
            _meta: { toolKind: "subagent" },
            content: [{ type: ToolResultContentType.Text, text: "Result text" }],
            success: true
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "subagent");
      assert.strictEqual(serialized.resultDetails, void 0);
      if (serialized.toolSpecificData.kind === "subagent") {
        assert.strictEqual(serialized.toolSpecificData.description, "Task");
        assert.strictEqual(serialized.toolSpecificData.result, "Result text");
      }
    });
    test("turn with responseText produces markdown content in history", () => {
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.Markdown, id: "md-1", content: "Hello world" }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      assert.strictEqual(history.length, 2);
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.parts.length, 1);
      assert.strictEqual(response.parts[0].kind, "markdownContent");
      assert.strictEqual(response.parts[0].content.value, "Hello world");
    });
    test("markdown links in response content stay raw until rendering", () => {
      const content = "See [local](file:///a/b.ts), [external](https://example.com) and [rel](./foo.md).";
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.Markdown,
          id: "md-links",
          content
        }]
      });
      const history = rawTurnsToHistory(URI.file("/"), [turn], "p", "my-host");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const part = response.parts[0];
      assert.strictEqual(part.content.value, content);
    });
    test("markdown link syntax inside fenced code blocks is preserved verbatim", () => {
      const input = [
        "Use [real](file:///a.ts) directly.",
        "",
        "```md",
        "[fake](file:///b.ts)",
        "```",
        "",
        "And then [another](file:///c.ts)."
      ].join("\n");
      const value = rewriteMarkdownLinks(input, "my-host");
      assert.ok(value.includes("[](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)"));
      assert.ok(value.includes("[](vscode-agent-host://my-host/c.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)"));
      assert.ok(value.includes("[fake](file:///b.ts)"));
      assert.ok(!value.includes("[fake](vscode-agent-host"));
    });
    test("markdown link syntax inside inline code spans is preserved verbatim", () => {
      const input = "Real [one](file:///a.ts) and literal `[two](file:///b.ts)` here.";
      const value = rewriteMarkdownLinks(input, "my-host");
      assert.strictEqual(
        value,
        "Real [](vscode-agent-host://my-host/a.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0) and literal `[two](file:///b.ts)` here."
      );
    });
    test("preserves label and tags vscodeLinkType=skill for SKILL.md links", () => {
      const value = rewriteMarkdownLinks("Loaded [plan](file:///abs/repo/skills/plan/SKILL.md) and [other](file:///abs/repo/foo.ts).", "my-host");
      assert.strictEqual(
        value,
        "Loaded [plan](vscode-agent-host://my-host/abs/repo/skills/plan/SKILL.md?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0%26vscodeLinkType%3Dskill) and [](vscode-agent-host://my-host/abs/repo/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)."
      );
    });
    test("preserves alt text for image tokens", () => {
      const value = rewriteMarkdownLinks("See ![diagram](file:///a/b.png).", "my-host");
      assert.strictEqual(value, "See ![diagram](vscode-agent-host://my-host/a/b.png?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0).");
    });
    test("error turn produces error details in history", () => {
      const turn = createTurn({
        state: TurnState.Error,
        error: { errorType: "test", message: "boom" }
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.errorDetails?.message, "Error: (test) boom");
      assert.ok(!response.parts.some((p) => p.kind === "markdownContent" && p.content.value.includes("boom")), "Error should not be duplicated as a markdown part");
    });
    test("forwarded quota error turn produces quota-exceeded error details", () => {
      const turn = createTurn({
        state: TurnState.Error,
        error: {
          errorType: "quota",
          message: "raw",
          _meta: { chatError: { fetchError: { type: "quotaExceeded", capiError: { code: "quota_exceeded" } } } }
        }
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      assert.strictEqual(response.errorDetails?.isQuotaExceeded, true);
    });
    test("failed tool in history has exitCode 1", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            toolInput: "bad-command",
            content: [
              { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t2", title: "Terminal" },
              { type: ToolResultContentType.Text, text: "error" }
            ],
            success: false
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState.exitCode, 1);
    });
    test("search tool in history keeps search rendering without generic details", () => {
      const turn = createTurn({
        responseParts: [{
          kind: ResponsePartKind.ToolCall,
          toolCall: createCompletedToolCall({
            _meta: { toolKind: "search" },
            toolInput: '{"query":"activation"}',
            content: [{ type: ToolResultContentType.Text, text: "found results" }]
          })
        }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "search");
      assert.strictEqual(serialized.resultDetails, void 0);
    });
  });
  suite("toolCallStateToInvocation", () => {
    test("creates ChatToolInvocation for running tool", () => {
      const tc = createToolCallState({
        toolCallId: "tc-42",
        toolName: "my_tool",
        displayName: "My Tool",
        invocationMessage: "Doing stuff",
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolCallId, "tc-42");
      assert.strictEqual(invocation.toolId, "my_tool");
      assert.strictEqual(invocation.source, ToolDataSource.Internal);
    });
    test("renders ask-user tools as waiting progress that hides after completion", () => {
      const toolNames = ["ask_user", "AskUserQuestion", "request_user_input"];
      const live = toolNames.map((toolName) => {
        const invocation = toolCallStateToInvocation(createToolCallState({ toolName }));
        return {
          message: invocation.invocationMessage,
          presentation: invocation.presentation
        };
      });
      const restored = completedToolCallToSerialized(createCompletedToolCall({ toolName: "ask_user" }), void 0, URI.file("/"), "local");
      const failed = completedToolCallToSerialized(createCompletedToolCall({ toolName: "ask_user", success: false }), void 0, URI.file("/"), "local");
      assert.deepStrictEqual({ live, restoredPresentation: restored.presentation, failedPresentation: failed.presentation }, {
        live: toolNames.map(() => ({
          message: "Waiting for answer...",
          presentation: ToolInvocationPresentation.HiddenAfterComplete
        })),
        restoredPresentation: ToolInvocationPresentation.HiddenAfterComplete,
        failedPresentation: void 0
      });
    });
    test("marks Agent Host input requests for conversational answer rendering", () => {
      const carousel = createInputRequestCarousel({
        id: "input-1",
        questions: [{
          id: "q1",
          kind: ChatInputQuestionKind.SingleSelect,
          message: "Choose one",
          required: true,
          options: [{ id: "a", label: "Option A" }]
        }]
      }, "local");
      assert.strictEqual(carousel.answerPresentation, "conversation");
    });
    test("attaches automation result data to live and restored configureAutomation calls", () => {
      const content = [{
        type: ToolResultContentType.Text,
        text: JSON.stringify({
          status: "created",
          automation: { id: "automation-1", name: "Morning review" }
        })
      }];
      const completed = createCompletedToolCall({
        toolCallId: "automation-call",
        toolName: "configureAutomation",
        content
      });
      const restored = completedToolCallToSerialized(completed, void 0, URI.file("/"), "local");
      const live = toolCallStateToInvocation(createToolCallState({
        toolCallId: "automation-call",
        toolName: "configureAutomation"
      }));
      finalizeToolInvocation(live, completed);
      assert.deepStrictEqual({
        restored: restored.toolSpecificData,
        live: live.toolSpecificData
      }, {
        restored: {
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        },
        live: {
          kind: "automationConfigured",
          automationId: "automation-1",
          automationName: "Morning review",
          operation: "created"
        }
      });
    });
    test("represents another client tool without surfacing its confirmation", () => {
      const toolCall = {
        toolCallId: "tc-other-client",
        toolName: "run_task",
        displayName: "Run Task",
        invocationMessage: "Run task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?",
        status: ToolCallStatus.PendingConfirmation,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      let cancelledToolCallId;
      const invocation = toolCallStateToInvocation(toolCall, void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: (toolCall2) => cancelledToolCallId = toolCall2.toolCallId
      });
      invocation.otherClientToolCall?.cancel();
      assert.deepStrictEqual({
        message: invocation.invocationMessage,
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall,
        cancelledToolCallId
      }, {
        message: "Running Run Task on another client...",
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true,
        cancelledToolCallId: "tc-other-client"
      });
    });
    test("creates authentication-required invocation for an MCP tool call", () => {
      const invocation = rawToolCallStateToInvocation({
        ...createToolCallState(),
        status: ToolCallStatus.AuthRequired,
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "mcp-1" },
        auth: {
          reason: McpAuthRequiredReason.InsufficientScope,
          oauthClient: {
            clientId: "configured-client-id",
            clientSecret: "configured-client-secret"
          },
          resource: {
            resource: "https://mcp.example.com",
            resource_name: "Example MCP",
            authorization_servers: ["https://auth.example.com"],
            scopes_supported: ["repo"]
          },
          requiredScopes: ["repo"]
        }
      }, void 0, URI.parse("agent-host-copilot://backend/session"), "remote", "frontend");
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.WaitingForAuthentication);
      if (state.type !== IChatToolInvocation.StateKind.WaitingForAuthentication) {
        assert.fail("Expected authentication-required state");
      }
      const { cancel, ...stateWithoutCancel } = state;
      assert.strictEqual(typeof cancel, "function");
      assert.deepStrictEqual(stateWithoutCancel, {
        type: IChatToolInvocation.StateKind.WaitingForAuthentication,
        confirmed: { type: ToolConfirmKind.ConfirmationNotNeeded, reason: void 0 },
        parameters: void 0,
        confirmationMessages: void 0,
        server: {
          id: "frontend/mcp-1",
          name: "Example MCP",
          resource: "https://mcp.example.com",
          oauthClient: {
            clientId: "configured-client-id",
            clientSecret: "configured-client-secret"
          },
          authorizationServers: ["https://auth.example.com"],
          supportedScopes: ["repo"],
          requiredScopes: ["repo"],
          reason: McpAuthRequiredReason.InsufficientScope
        }
      });
      invocation.setAuthenticationResolved();
      assert.strictEqual(invocation.state.get().type, IChatToolInvocation.StateKind.Executing);
    });
    test("sets terminal toolSpecificData when content has terminal block", () => {
      const tc = createToolCallState({
        toolInput: "ls -la",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t3", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "ls -la");
    });
    test("sets terminal toolSpecificData for built-in bash via _meta.toolKind (no Terminal content block)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        displayName: "Run Shell Command",
        toolInput: "ls -la\nwc -l",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.commandLine.original, "ls -la\nwc -l");
      assert.strictEqual(termData.language, "shellscript");
      assert.strictEqual(termData.terminalToolSessionId, void 0, "no AHP terminal session for built-in bash");
      assert.strictEqual(termData.terminalCommandUri, void 0, "no AHP terminal URI for built-in bash");
    });
    test("built-in bash terminal toolSpecificData picks up streaming text output (running)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "echo hi",
        _meta: { toolKind: "terminal" },
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Text, text: "hi\n" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
    test("does not render terminal pill for terminal toolKind without a command (falls back to invocationMessage)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        invocationMessage: "Running shell command",
        _meta: { toolKind: "terminal" },
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData, void 0, "no terminal pill without a command");
      assert.strictEqual(invocation.invocationMessage, "Running shell command");
    });
    test("sets subagent toolSpecificData from _meta for subagent toolKind", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Review code", subagentAgentName: "code-reviewer" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "subagent");
      if (invocation.toolSpecificData.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.description, "Review code");
        assert.strictEqual(invocation.toolSpecificData.agentName, "code-reviewer");
      }
    });
    test("sets MCP App toolSpecificData for running MCP tool calls", () => {
      const invocation = toolCallStateToInvocation(createToolCallState({
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: {
          ui: {
            resourceUri: "ui://docs/app",
            channel: "mcp://copilot/test-session-1/docs"
          }
        }
      }));
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "input",
        rawInput: { topic: "metadata" },
        mcpAppData: {
          kind: "agentHost",
          resourceUri: "ui://docs/app",
          serverId: "docs-customization",
          channel: "mcp://copilot/test-session-1/docs"
        }
      });
    });
    test("does not set MCP App toolSpecificData for a streaming MCP tool call", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        status: ToolCallStatus.Streaming,
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: {
          ui: {
            resourceUri: "ui://docs/app",
            channel: "mcp://copilot/test-session-1/docs"
          }
        }
      });
      assert.strictEqual(invocation.toolSpecificData, void 0);
    });
    test("synthesizes subagent chatResource from the tool call id when no discovery content block is present", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Map aux bar + editor part creation" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.chatResource, buildSubagentChatUri(URI.file("/").toString(), "tc-1"));
      }
    });
    test("observes only failed subagent tools that produced a child chat", () => {
      const subagentContent = {
        type: ToolResultContentType.Subagent,
        resource: "ahp-chat://subagent/session/tc-1",
        title: "Explore",
        agentName: "explore",
        description: "Explores the codebase"
      };
      assert.deepStrictEqual({
        running: shouldObserveSubagentChat(createToolCallState({ toolName: "task" })),
        completed: shouldObserveSubagentChat(createCompletedToolCall({ toolName: "task" })),
        failedWithoutChild: shouldObserveSubagentChat(createCompletedToolCall({ toolName: "task", success: false })),
        failedWithChild: shouldObserveSubagentChat(createCompletedToolCall({ toolName: "task", success: false, content: [subagentContent] }))
      }, {
        running: true,
        completed: true,
        failedWithoutChild: false,
        failedWithChild: true
      });
    });
    test("prefers the host-stamped _meta.subagentChatUri over a discovery content block resource", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentChatUri: "ahp-chat://subagent/stamped/tc-1" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "ahp-chat://subagent/discovery/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.chatResource, "ahp-chat://subagent/stamped/tc-1");
      }
    });
    test("passes subAgentInvocationId to ChatToolInvocation", () => {
      const tc = createToolCallState({});
      const invocation = toolCallStateToInvocation(tc, "parent-tc-42");
      assert.strictEqual(invocation.subAgentInvocationId, "parent-tc-42");
    });
  });
  suite("addComment reference", () => {
    const commentRange = { startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 5 };
    function addCommentInput(text) {
      return JSON.stringify({ resourceUri: "file:///workspace/a.ts", range: commentRange, text });
    }
    function markdown(message2) {
      assert.ok(message2 && typeof message2 !== "string", "expected a markdown reference");
      return message2;
    }
    test("renders tool name, truncated quoted preview and a reveal command link", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("This comment is quite long and should be truncated") });
      const message2 = markdown(toolCallStateToInvocation(tc).invocationMessage);
      assert.deepStrictEqual(
        {
          value: message2.value,
          supportThemeIcons: message2.supportThemeIcons,
          isTrusted: message2.isTrusted
        },
        {
          value: `[addComment "This comment is quite long and should be\u2026"](command:_agentFeedbackReview.revealAt?${encodeURIComponent(JSON.stringify(["file:///workspace/a.ts", commentRange]))})`,
          supportThemeIcons: true,
          isTrusted: { enabledCommands: ["_agentFeedbackReview.revealAt"] }
        }
      );
    });
    test("does not truncate a short comment", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("Short note") });
      const message2 = markdown(toolCallStateToInvocation(tc).invocationMessage);
      assert.ok(message2.value.includes('addComment "Short note"'), message2.value);
      assert.ok(!message2.value.includes("\u2026"), message2.value);
    });
    test("sets the same reference as the past-tense message on completion", () => {
      const running = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: addCommentInput("Short note") });
      const invocation = toolCallStateToInvocation(running);
      const completed = createCompletedToolCall({ toolName: "addComment", toolInput: addCommentInput("Short note"), pastTenseMessage: "Added comment" });
      finalizeToolInvocation(invocation, completed);
      assert.strictEqual(markdown(invocation.pastTenseMessage).value, markdown(invocation.invocationMessage).value);
    });
    test("falls back to the server message when the input cannot be parsed", () => {
      const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: "not json" });
      assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, "Adding comment");
    });
    test("falls back to the server message when the range is not a valid 1-based range", () => {
      for (const range of [
        { startLineNumber: 0, startColumn: 1, endLineNumber: 1, endColumn: 1 },
        { startLineNumber: 1, startColumn: 1.5, endLineNumber: 1, endColumn: 2 },
        { startLineNumber: -1, startColumn: 1, endLineNumber: 1, endColumn: 1 }
      ]) {
        const tc = createToolCallState({ toolName: "addComment", invocationMessage: "Adding comment", toolInput: JSON.stringify({ resourceUri: "file:///workspace/a.ts", range, text: "hi" }) });
        assert.strictEqual(toolCallStateToInvocation(tc).invocationMessage, "Adding comment", JSON.stringify(range));
      }
    });
  });
  suite("streaming tool invocations (#314858)", () => {
    test("toolCallStateToStreamingInvocation starts in the native Streaming state", () => {
      const tc = {
        toolCallId: "tc-stream",
        toolName: "bash",
        displayName: "Bash",
        status: ToolCallStatus.Streaming,
        partialInput: '{"command":"npm test","description":"Run',
        invocationMessage: "Running npm test"
      };
      const invocation = toolCallStateToStreamingInvocation(tc, void 0);
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.Streaming);
      if (state.type !== IChatToolInvocation.StateKind.Streaming) {
        return;
      }
      assert.deepStrictEqual({
        toolCallId: invocation.toolCallId,
        toolId: invocation.toolId,
        partialInput: state.partialInput.get(),
        streamingMessage: state.streamingMessage.get(),
        isComplete: IChatToolInvocation.isComplete(invocation)
      }, {
        toolCallId: "tc-stream",
        toolId: "bash",
        partialInput: { command: "npm test", description: "Run" },
        streamingMessage: "Running npm test",
        isComplete: false
      });
    });
    test("toolCallStateToStreamingInvocation defers partial input display for read tools", () => {
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-read-stream",
        toolName: "view",
        displayName: "Read",
        status: ToolCallStatus.Streaming,
        partialInput: '{"path":"/repo/part',
        invocationMessage: { markdown: "Reading [part](file:///repo/part)" },
        _meta: { toolKind: "read" }
      }, void 0);
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.Streaming);
      if (state.type !== IChatToolInvocation.StateKind.Streaming) {
        return;
      }
      assert.deepStrictEqual({
        invocationMessage: invocation.invocationMessage,
        partialInput: state.partialInput.get(),
        streamingMessage: state.streamingMessage.get()
      }, {
        invocationMessage: "Read",
        partialInput: void 0,
        streamingMessage: "Reading file"
      });
    });
    test("updateStreamingToolInvocation clears edit progress when a legacy tool resolves to read", () => {
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-legacy-read-stream",
        toolName: "str_replace_editor",
        displayName: "Edit File",
        status: ToolCallStatus.Streaming,
        partialInput: '{"path":"/repo/part',
        invocationMessage: { markdown: "Editing [part](file:///repo/part)" }
      }, void 0);
      const state = invocation.state.get();
      assert.strictEqual(state.type, IChatToolInvocation.StateKind.Streaming);
      if (state.type !== IChatToolInvocation.StateKind.Streaming) {
        return;
      }
      const beforeStreamingMessage = state.streamingMessage.get();
      const before = {
        partialInput: state.partialInput.get(),
        streamingMessage: typeof beforeStreamingMessage === "string" ? beforeStreamingMessage : beforeStreamingMessage?.value
      };
      updateStreamingToolInvocation(invocation, {
        toolCallId: "tc-legacy-read-stream",
        toolName: "str_replace_editor",
        displayName: "Edit File",
        status: ToolCallStatus.Streaming,
        partialInput: '{"command":"view","path":"/repo/part',
        invocationMessage: { markdown: "Reading [part](file:///repo/part)" },
        _meta: { toolKind: "read" }
      }, "");
      assert.deepStrictEqual({
        before,
        after: {
          partialInput: state.partialInput.get(),
          streamingMessage: state.streamingMessage.get()
        }
      }, {
        before: {
          partialInput: { path: "/repo/part" },
          streamingMessage: "Editing [part](file:///repo/part)"
        },
        after: {
          partialInput: void 0,
          streamingMessage: "Reading file"
        }
      });
    });
    test("toolCallStateToStreamingInvocation preserves subagent metadata before ready", () => {
      const sessionResource = URI.parse("copilotcli:/session-1");
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-subagent",
        toolName: "task",
        displayName: "Delegate Task",
        status: ToolCallStatus.Streaming,
        _meta: {
          toolKind: "subagent",
          subagentDescription: "Review current branch",
          subagentAgentName: "code-review",
          subagentChatUri: buildSubagentChatUri(sessionResource.toString(), "tc-subagent")
        }
      }, void 0, sessionResource, "");
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "subagent",
        description: "Review current branch",
        agentName: "code-review",
        chatResource: buildSubagentChatUri(sessionResource.toString(), "tc-subagent")
      });
    });
    test("finalizeToolInvocation preserves cancellation from streaming", () => {
      const invocation = toolCallStateToStreamingInvocation({
        toolCallId: "tc-cancelled",
        toolName: "client_tool",
        displayName: "Client Tool",
        status: ToolCallStatus.Streaming
      }, void 0);
      finalizeToolInvocation(invocation, {
        toolCallId: "tc-cancelled",
        toolName: "client_tool",
        displayName: "Client Tool",
        status: ToolCallStatus.Cancelled,
        invocationMessage: "Running client tool",
        reason: ToolCallCancellationReason.Denied,
        reasonMessage: "Denied by the server"
      });
      assert.deepStrictEqual(invocation.state.get(), {
        type: IChatToolInvocation.StateKind.Cancelled,
        reason: ToolConfirmKind.Denied,
        reasonMessage: "Denied by the server",
        parameters: void 0,
        confirmationMessages: void 0
      });
    });
    test("transitionFromStreaming with a pending terminal prepared invocation yields a single terminal confirmation card", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-term", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      const pending = {
        toolCallId: "tc-term",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Running `rm -rf build`",
        toolInput: "rm -rf build",
        status: ToolCallStatus.PendingConfirmation,
        _meta: { toolKind: "terminal" },
        confirmationTitle: "Run command?"
      };
      const prepared = toolCallStateToPreparedInvocation(pending);
      assert.strictEqual(prepared.confirmationMessages?.title, "Run command?");
      assert.strictEqual(prepared.toolSpecificData?.kind, "terminal");
      streaming.transitionFromStreaming(prepared, void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
      assert.strictEqual(streaming.toolSpecificData?.kind, "terminal");
    });
    test("transitionFromStreaming with a non-confirmation prepared invocation goes straight to Executing", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-run", toolName: "read_file", displayName: "Read File", status: ToolCallStatus.Streaming }, void 0);
      const running = { toolCallId: "tc-run", toolName: "read_file", displayName: "Read File", invocationMessage: "Reading file", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded };
      const prepared = toolCallStateToPreparedInvocation(running);
      assert.strictEqual(prepared.confirmationMessages, void 0);
      streaming.transitionFromStreaming(prepared, void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.Executing);
    });
    test("requestConfirmation re-arms confirmation from Executing (Copilot Running \u2192 PendingConfirmation)", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-term", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      const running = { toolCallId: "tc-term", toolName: "bash", displayName: "Bash", invocationMessage: "Running command", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded, _meta: { toolKind: "terminal" } };
      streaming.transitionFromStreaming(toolCallStateToPreparedInvocation(running), void 0, void 0);
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.Executing);
      const pending = { toolCallId: "tc-term", toolName: "bash", displayName: "Bash", invocationMessage: "Running `rm -rf build`", toolInput: "rm -rf build", status: ToolCallStatus.PendingConfirmation, _meta: { toolKind: "terminal" }, confirmationTitle: "Run command?" };
      streaming.requestConfirmation(toolCallStateToPreparedInvocation(pending));
      assert.strictEqual(streaming.state.get().type, IChatToolInvocation.StateKind.WaitingForConfirmation);
      assert.strictEqual(streaming.toolSpecificData?.kind, "terminal");
    });
    test("a same-state pending refresh replaces the visible terminal command without replacing its gate", () => {
      const first = {
        toolCallId: "tc-term",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Running `npm config get registry`",
        toolInput: "npm config get registry",
        status: ToolCallStatus.PendingConfirmation,
        _meta: { toolKind: "terminal" },
        confirmationTitle: "Run command?"
      };
      const invocation = toolCallStateToInvocation(first);
      const initialState = invocation.state.get();
      assert.strictEqual(initialState.type, IChatToolInvocation.StateKind.WaitingForConfirmation);
      const initialGate = initialState.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? initialState.confirm : void 0;
      const refreshed = {
        ...first,
        invocationMessage: "Running `npm install --registry=https://registry.npmjs.org`",
        toolInput: "npm install --registry=https://registry.npmjs.org"
      };
      invocation.updatePreparedInvocation(toolCallStateToPreparedInvocation(refreshed), invocation.parameters);
      const state = invocation.state.get();
      const terminalData = invocation.toolSpecificData;
      assert.ok(terminalData?.kind === "terminal" && hasKey(terminalData, { commandLine: true }));
      assert.deepStrictEqual({
        command: terminalData.commandLine.original,
        gatePreserved: state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirm === initialGate
      }, {
        command: "npm install --registry=https://registry.npmjs.org",
        gatePreserved: true
      });
    });
    test("requestConfirmation no-ops on a completed invocation", () => {
      const streaming = toolCallStateToStreamingInvocation({ toolCallId: "tc-done", toolName: "bash", displayName: "Bash", status: ToolCallStatus.Streaming }, void 0);
      streaming.transitionFromStreaming(toolCallStateToPreparedInvocation({ toolCallId: "tc-done", toolName: "bash", displayName: "Bash", invocationMessage: "run", status: ToolCallStatus.Running, confirmed: ToolCallConfirmationReason.NotNeeded }), void 0, void 0);
      streaming.didExecuteTool(void 0);
      assert.strictEqual(IChatToolInvocation.isComplete(streaming), true);
      const pending = { toolCallId: "tc-done", toolName: "bash", displayName: "Bash", invocationMessage: "confirm", status: ToolCallStatus.PendingConfirmation, confirmationTitle: "Confirm?" };
      streaming.requestConfirmation(toolCallStateToPreparedInvocation(pending));
      assert.strictEqual(IChatToolInvocation.isComplete(streaming), true, "completed invocation is not re-armed");
    });
  });
  suite("finalizeToolInvocation", () => {
    test("rewrites markdown links in pastTenseMessage through the agent host scheme", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      rawFinalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "view_file",
        displayName: "View File",
        invocationMessage: "Reading file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: { markdown: "Read [foo.ts](file:///path/to/foo.ts)" }
      }, URI.file("/"), "ssh__macbook-air");
      assert.ok(invocation.pastTenseMessage);
      assert.strictEqual(typeof invocation.pastTenseMessage, "object");
      const value = invocation.pastTenseMessage.value;
      assert.strictEqual(value, "Read [](vscode-agent-host://ssh__macbook-air/path/to/foo.ts?_ah%3DeyJzY2hlbWUiOiJmaWxlIn0)");
    });
    test("finalizes pty terminal tool with compatibility output and exit code", () => {
      const tc = createToolCallState({
        toolInput: "echo hi",
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t4", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: "echo hi",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran echo hi",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t4", title: "Terminal" },
          { type: ToolResultContentType.Text, text: "output text" }
        ]
      });
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "output text");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("normalizes plain-text line endings for the detached terminal", () => {
      const tc = createToolCallState({
        toolInput: "grep -n foo",
        status: ToolCallStatus.Running,
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t5", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: "grep -n foo",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran grep -n foo",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///t5", title: "Terminal" },
          { type: ToolResultContentType.Text, text: "line1\nline2\r\nline3\n" }
        ]
      });
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandOutput?.text, "line1\r\nline2\r\nline3\r\n");
    });
    test("finalizes generic tool with input/output details", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        toolInput: '{"path":"README.md"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: '{"path":"README.md"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Read README",
        content: [{ type: ToolResultContentType.Text, text: "# VS Code" }]
      });
      const details = IChatToolInvocation.resultDetails(invocation);
      assertInputOutputDetails(details);
      assert.strictEqual(details.input, '{"path":"README.md"}');
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "# VS Code", isText: true, mimeType: "text/plain" }]);
      assert.strictEqual(details.isError, false);
    });
    test("finalizes failed tool with error message", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        toolInput: '{"operation":"slow"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        toolInput: '{"operation":"slow"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: false,
        pastTenseMessage: "Failed",
        error: { message: "timeout" }
      });
      const details = IChatToolInvocation.resultDetails(invocation);
      assertInputOutputDetails(details);
      assert.strictEqual(details.isError, true);
      assert.deepStrictEqual(details.output, [{ type: "embed", value: "timeout", isText: true, mimeType: "text/plain" }]);
    });
    test("returns file edits from completed tool call with FileEdit content", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Edited file",
        toolInput: JSON.stringify({ path: "/home/user/file.ts" }),
        content: [{
          type: ToolResultContentType.FileEdit,
          before: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///session/snap/before" }
          },
          after: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///session/snap/after" }
          }
        }]
      });
      assert.strictEqual(fileEdits.length, 1);
      assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, "/"), "/home/user/file.ts");
      assert.strictEqual(fileEdits[0].beforeContentUri?.toString(), URI.parse("agenthost-content:///session/snap/before").toString());
      assert.strictEqual(fileEdits[0].afterContentUri?.toString(), URI.parse("agenthost-content:///session/snap/after").toString());
      assert.ok(fileEdits[0].undoStopId);
      assert.strictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("does not hide presentation when tool with file edits fails", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: false,
        pastTenseMessage: "Failed to edit",
        error: { message: "write error" },
        content: [{
          type: ToolResultContentType.FileEdit,
          after: {
            uri: URI.file("/home/user/file.ts").toString(),
            content: { uri: "agenthost-content:///snap/after" }
          }
        }]
      });
      assert.notStrictEqual(invocation.presentation, ToolInvocationPresentation.Hidden);
    });
    test("returns empty file edits for cancelled tool call", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Cancelled,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        reason: ToolCallCancellationReason.Denied,
        reasonMessage: "User cancelled"
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("finalized search tool keeps search rendering without generic details", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        _meta: { toolKind: "search" },
        toolInput: '{"query":"terminal"}'
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "search",
        displayName: "Search",
        invocationMessage: "Searching...",
        _meta: { toolKind: "search" },
        toolInput: '{"query":"terminal"}',
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Searched",
        content: [{ type: ToolResultContentType.Text, text: "result" }]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "search");
      assert.strictEqual(IChatToolInvocation.resultDetails(invocation), void 0);
    });
    test("returns empty file edits when tool has no FileEdit content", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran test tool",
        content: [{ type: ToolResultContentType.Text, text: "output" }]
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("returns empty file edits when FileEdit has no before or after", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "edit_file",
        displayName: "Edit File",
        invocationMessage: "Editing file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Edited",
        toolInput: JSON.stringify({ content: "no path field" }),
        content: [{
          type: ToolResultContentType.FileEdit
        }]
      });
      assert.strictEqual(fileEdits.length, 0);
    });
    test("returns file edit for create (only after present)", () => {
      const tc = createToolCallState({ status: ToolCallStatus.Running });
      const invocation = toolCallStateToInvocation(tc);
      const fileEdits = finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "create_file",
        displayName: "Create File",
        invocationMessage: "Creating file...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Created file",
        content: [{
          type: ToolResultContentType.FileEdit,
          after: {
            uri: URI.file("/home/user/new-file.ts").toString(),
            content: { uri: "agenthost-content:///snap/after" }
          }
        }]
      });
      assert.strictEqual(fileEdits.length, 1);
      assert.strictEqual(fileEdits[0].kind, "create");
      assert.strictEqual(fileEdits[0].resource.fsPath.replace(/\\/g, "/"), "/home/user/new-file.ts");
      assert.strictEqual(fileEdits[0].beforeContentUri, void 0);
      assert.ok(fileEdits[0].afterContentUri);
    });
    test("preserves subagent credits when finalizing", () => {
      const tc = createToolCallState({
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.credits = 2.5;
        invocation.toolSpecificData.isActive = true;
      }
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "run_subagent",
        displayName: "Run Subagent",
        invocationMessage: "Running subagent...",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran subagent",
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }, {
          type: ToolResultContentType.Text,
          text: "Subagent result"
        }]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.deepStrictEqual({
          credits: invocation.toolSpecificData.credits,
          isActive: invocation.toolSpecificData.isActive
        }, {
          credits: 2.5,
          isActive: true
        });
      }
    });
  });
  suite("activeTurnToProgress", () => {
    function createActiveTurnState(responseParts) {
      return {
        id: "turn-active",
        startedAt: "2025-01-01T00:00:00.000Z",
        message: message("Do things"),
        responseParts: responseParts ?? [],
        usage: void 0
      };
    }
    test("empty active turn produces empty progress", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState(), void 0);
      assert.deepStrictEqual(result, []);
    });
    test("includes usage progress from active turn usage", () => {
      const activeTurn = createActiveTurnState();
      activeTurn.usage = { inputTokens: 1e3, outputTokens: 250 };
      const result = activeTurnToProgress(URI.file("/"), activeTurn, void 0);
      const usage = result[0];
      assert.deepStrictEqual(
        { kind: usage.kind, promptTokens: usage.promptTokens, completionTokens: usage.completionTokens },
        { kind: "usage", promptTokens: 1e3, completionTokens: 250 }
      );
    });
    test("produces markdown content for streamed text", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Hello world" }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "markdownContent");
      assert.strictEqual(result[0].content.value, "Hello world");
    });
    test("produces system notification for system notification response part", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.SystemNotification, content: "Shell command completed" }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "systemNotification");
      if (result[0].kind !== "systemNotification") {
        return;
      }
      assert.strictEqual(result[0].content.value, "Shell command completed");
    });
    test("produces warning for active worktree failure notification", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([{
        kind: ResponsePartKind.SystemNotification,
        content: "Worktree creation failed",
        _meta: toAgentSystemNotificationMeta({
          kind: AgentSystemNotificationKind.WorktreeCreationFailure,
          severity: AgentSystemNotificationSeverity.Warning
        })
      }]), void 0);
      assert.deepStrictEqual(result[0], {
        kind: "warning",
        content: new MarkdownString("Worktree creation failed")
      });
    });
    test("produces thinking progress for reasoning", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Let me think about this..." }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[0].id, "r-1");
    });
    test("reasoning comes before streamed text when ordered that way", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Hmm..." },
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Result text" }
      ]), void 0);
      assert.strictEqual(result.length, 2);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[1].kind, "markdownContent");
    });
    test("serializes completed tool calls", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: "tc-done",
            toolName: "test_tool",
            displayName: "Test Tool",
            invocationMessage: "Ran test",
            confirmed: ToolCallConfirmationReason.NotNeeded,
            success: true,
            pastTenseMessage: "Ran test tool"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      assert.strictEqual(result[0].kind, "toolInvocationSerialized");
    });
    test("creates live invocations for running tool calls", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: createToolCallState({
            toolCallId: "tc-running",
            status: ToolCallStatus.Running
          })
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      const invocation = result[0];
      assert.strictEqual(invocation.toolCallId, "tc-running");
    });
    test("hydrates another client tool without a confirmation invocation", () => {
      const toolCall = {
        toolCallId: "tc-other-client",
        toolName: "run_task",
        displayName: "Run Task",
        invocationMessage: "Run task",
        toolInput: '{"task":"build"}',
        confirmationTitle: "Allow Run Task?",
        status: ToolCallStatus.PendingConfirmation,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.ToolCall, toolCall }
      ]), void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: () => {
        }
      });
      const invocation = result[0];
      assert.deepStrictEqual({
        kind: invocation.kind,
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall
      }, {
        kind: "toolInvocation",
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true
      });
    });
    test("hydrates another client streaming tool with its cancel affordance", () => {
      const toolCall = {
        toolCallId: "tc-other-client-streaming",
        toolName: "run_task",
        displayName: "Run Task",
        status: ToolCallStatus.Streaming,
        contributor: { kind: ToolCallContributorKind.Client, clientId: "owner-client" }
      };
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.ToolCall, toolCall }
      ]), void 0, {
        currentClientId: "viewer-client",
        cancelOtherClientToolCall: () => {
        }
      });
      const invocation = result[0];
      assert.deepStrictEqual({
        state: invocation.state.get().type,
        hasOtherClientData: !!invocation.otherClientToolCall
      }, {
        state: IChatToolInvocation.StateKind.Executing,
        hasOtherClientData: true
      });
    });
    test("creates confirmation invocations for pending tool confirmations", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            toolCallId: "tc-pending",
            toolName: "bash",
            displayName: "Bash",
            invocationMessage: "Run command",
            status: ToolCallStatus.PendingConfirmation,
            confirmationTitle: "Run command",
            riskAssessment: {
              kind: ToolCallRiskAssessmentKind.Judge,
              status: ToolCallRiskAssessmentStatus.Complete,
              reason: "The command removes a project file.",
              safety: 0.15
            },
            toolInput: "echo hello"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 1);
      const invocation = result[0];
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "input");
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "complete",
        explanation: "The command removes a project file.",
        safety: 0.15
      });
    });
    test("creates loading confirmation invocations while judgement is pending", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-judging",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Run command",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Run command",
        riskAssessment: {
          kind: ToolCallRiskAssessmentKind.Judge,
          status: ToolCallRiskAssessmentStatus.Loading
        },
        toolInput: "echo hello"
      });
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "loading"
      });
    });
    test("updates a rendered confirmation when asynchronous judgement completes", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-judging",
        toolName: "bash",
        displayName: "Bash",
        invocationMessage: "Run command",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Run command",
        riskAssessment: {
          kind: ToolCallRiskAssessmentKind.Judge,
          status: ToolCallRiskAssessmentStatus.Loading
        },
        toolInput: "echo hello"
      });
      invocation.updateConfirmationMessages({
        title: "Run command",
        message: "Run command",
        approvalReason: {
          status: "complete",
          explanation: "This command modifies protected files.",
          safety: 0.1
        }
      });
      const state = invocation.state.get();
      assert.deepStrictEqual(state.type === IChatToolInvocation.StateKind.WaitingForConfirmation ? state.confirmationMessages?.approvalReason : void 0, {
        status: "complete",
        explanation: "This command modifies protected files.",
        safety: 0.1
      });
    });
    test("preserves create metadata and proposed content for pending file confirmations", () => {
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-create",
        toolName: "write",
        displayName: "Write",
        invocationMessage: "Creating package.json",
        status: ToolCallStatus.PendingConfirmation,
        confirmationTitle: "Create file?",
        edits: {
          items: [{
            after: {
              uri: "file:///workspace/package.json",
              content: { uri: "pending-edit-content://session/tc-create/package.json" }
            }
          }]
        }
      });
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "modifiedFilesConfirmation",
        options: ["Allow"],
        modifiedFiles: [{
          uri: URI.file("/workspace/package.json"),
          editKind: "create",
          originalUri: void 0,
          modifiedContentUri: toAgentHostUri(URI.parse("pending-edit-content://session/tc-create/package.json"), "local"),
          originalContentUri: void 0,
          insertions: void 0,
          deletions: void 0,
          title: "package.json",
          description: "/workspace/package.json"
        }]
      });
    });
    test("includes all parts in correct order", () => {
      const result = activeTurnToProgress(URI.file("/"), createActiveTurnState([
        { kind: ResponsePartKind.Reasoning, id: "r-1", content: "Thinking..." },
        { kind: ResponsePartKind.Markdown, id: "md-1", content: "Output so far" },
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: createToolCallState({
            toolCallId: "tc-1",
            status: ToolCallStatus.Running
          })
        },
        {
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            toolCallId: "tc-2",
            toolName: "test_tool",
            displayName: "Test Tool",
            invocationMessage: "Confirm",
            status: ToolCallStatus.PendingConfirmation,
            confirmationTitle: "Confirm"
          }
        }
      ]), void 0);
      assert.strictEqual(result.length, 4);
      assert.strictEqual(result[0].kind, "thinking");
      assert.strictEqual(result[1].kind, "markdownContent");
    });
  });
  suite("terminal content blocks", () => {
    test("completed tool call with terminal content block sets terminalCommandUri", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///abc123", title: "Terminal", isPty: false }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.ok(serialized.toolSpecificData);
      assert.strictEqual(serialized.toolSpecificData.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/abc123");
    });
    test("terminal content block skips bookkeeping text output", () => {
      const tc = createCompletedToolCall({
        _meta: {
          toolKind: "terminal"
        },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///abc123", title: "Terminal", isPty: false },
          { type: ToolResultContentType.Text, text: "text-output" }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = serialized.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("uses tool completion text for truncated SDK shell output", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "cat large-output.txt",
        content: [
          // TODO: Prefer shell_exit once the SDK exposes the saved output file path as structured data.
          { type: ToolResultContentType.Text, text: "Output too large to read at once (25 KB). Saved to: /tmp/output.txt\nUse view with view_range to examine portions of the output.<shellId: 104 completed with exit code -1>" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 0, preview: "preview only\n", truncated: true } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.deepStrictEqual({
        output: termData.terminalCommandOutput,
        state: termData.terminalCommandState
      }, {
        output: {
          text: "Output too large to read at once (25 KB). Saved to: /tmp/output.txt\r\nUse view with view_range to examine portions of the output.",
          truncated: true
        },
        state: { exitCode: 0 }
      });
    });
    test("preserves an explicitly empty non-PTY retained completion snapshot", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "true",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 0, preview: "" } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.deepStrictEqual(termData.terminalCommandOutput, { text: "" });
    });
    test("does not store an explicitly empty PTY completion preview when isPty is omitted", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "true",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///pty-empty", title: "Run Shell Command", result: { exitCode: 0, preview: "" } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("does not use text content when a terminal block owns the output", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "ehco hi",
        content: [
          { type: ToolResultContentType.Text, text: "bash: line 1: ehco: command not found\n<shellId: 104 completed with exit code 127>" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 127 } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
      assert.strictEqual(termData.terminalCommandOutput, void 0);
    });
    test("reads legacy terminalComplete blocks from old persisted state", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          // Removed from the protocol in AHP 0.7.0; may linger in old persisted turns.
          { type: "terminalComplete", exitCode: 127, preview: "legacy preview\n" }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      const termData = getSerializedTerminalData(serialized);
      assert.strictEqual(termData.terminalCommandOutput?.text, "legacy preview\r\n");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 127);
    });
    test("keeps zero terminal completion exit code as success for completed SDK shell tool history", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 0 } }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
    });
    test("does not fall back to tool success when terminal completion has no exit code", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "pwd",
        content: [
          { type: ToolResultContentType.Text, text: "/repo\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: {} }
        ],
        success: true
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState, void 0);
    });
    test("uses failed tool state when an output-only terminal has no shell exit", () => {
      const tc = createCompletedToolCall({
        _meta: { toolKind: "terminal" },
        toolInput: "eci hi",
        content: [
          { type: ToolResultContentType.Text, text: "/bin/bash: eci: command not found\n" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false }
        ],
        success: false
      });
      const turn = createTurn({
        responseParts: [{ kind: ResponsePartKind.ToolCall, toolCall: tc }]
      });
      const history = turnsToHistory(URI.file("/"), [turn], "p");
      const response = history[1];
      assert.strictEqual(response.type, "response");
      if (response.type !== "response") {
        return;
      }
      const serialized = response.parts[0];
      assert.strictEqual(serialized.toolSpecificData?.kind, "terminal");
      const termData = serialized.toolSpecificData;
      assert.deepStrictEqual(termData.terminalCommandState, { exitCode: 1 });
    });
    test("running tool call with terminal content block sets terminalCommandUri", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "npm test",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///running-term", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/running-term");
    });
    test("finalize preserves terminal URI from content block", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "echo hello",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///final-term", title: "Terminal" }
        ]
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        _meta: { toolKind: "terminal" },
        toolInput: "echo hello",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran echo hello",
        content: [
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal:///final-term", title: "Terminal" }
        ]
      });
      assert.ok(invocation.toolSpecificData);
      assert.strictEqual(invocation.toolSpecificData.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.ok(termData.terminalCommandUri);
      assert.strictEqual(termData.terminalCommandUri.toString(), "agenthost-terminal:/final-term");
      assert.strictEqual(termData.terminalCommandState?.exitCode, 0);
    });
    test("finalize uses terminal completion exit code over SDK tool success", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "terminal" },
        toolInput: "false",
        status: ToolCallStatus.Running
      });
      const invocation = toolCallStateToInvocation(tc);
      finalizeToolInvocation(invocation, {
        status: ToolCallStatus.Completed,
        toolCallId: "tc-1",
        toolName: "bash",
        displayName: "Run Shell Command",
        invocationMessage: "Running shell command",
        _meta: { toolKind: "terminal" },
        toolInput: "false",
        confirmed: ToolCallConfirmationReason.NotNeeded,
        success: true,
        pastTenseMessage: "Ran false",
        content: [
          { type: ToolResultContentType.Text, text: "" },
          { type: ToolResultContentType.Terminal, resource: "agenthost-terminal://shell/copilotNonPtyShells/tc-1", title: "Run Shell Command", isPty: false, result: { exitCode: 1 } }
        ]
      });
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalCommandState?.exitCode, 1);
    });
  });
  suite("updateRunningToolSpecificData", () => {
    test("sets subagent toolSpecificData from content and notifies state observers", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      let stateChanged = false;
      const disposable = autorun((r) => {
        invocation.state.read(r);
        stateChanged = true;
      });
      stateChanged = false;
      const before = invocation.toolSpecificData;
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(stateChanged, true, "state observers should be notified");
      assert.notStrictEqual(invocation.toolSpecificData, before, "toolSpecificData should be replaced");
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.agentName, "explore");
        assert.strictEqual(invocation.toolSpecificData.description, "Find related files");
      }
      disposable.dispose();
    });
    test("preserves subagent credits when refreshing toolSpecificData from content", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.credits = 1.5;
      }
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.credits, 1.5, "credits should survive a toolSpecificData refresh");
      }
    });
    test("preserves subagent model name when refreshing toolSpecificData from content", () => {
      const tc = createToolCallState({
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        invocation.toolSpecificData.modelName = "Claude Sonnet 4";
      }
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        _meta: { toolKind: "subagent", subagentDescription: "Find related files" },
        content: [{
          type: ToolResultContentType.Subagent,
          resource: "copilot://session/subagent/tc-1",
          title: "Explore",
          agentName: "explore",
          description: "Explores the codebase"
        }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "subagent");
      if (invocation.toolSpecificData?.kind === "subagent") {
        assert.strictEqual(invocation.toolSpecificData.modelName, "Claude Sonnet 4", "model name should survive a toolSpecificData refresh");
      }
    });
    test("mounts MCP App toolSpecificData when a confirmed MCP tool starts running", () => {
      const meta = {
        ui: {
          resourceUri: "ui://docs/app",
          channel: "mcp://copilot/test-session-1/docs"
        }
      };
      const invocation = toolCallStateToInvocation({
        toolCallId: "tc-1",
        toolName: "test_tool",
        displayName: "Test Tool",
        invocationMessage: "Running test tool...",
        status: ToolCallStatus.PendingConfirmation,
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: meta
      });
      assert.deepStrictEqual(invocation.toolSpecificData, { kind: "input", rawInput: { topic: "metadata" } });
      let stateChanged = false;
      const disposable = autorun((r) => {
        invocation.state.read(r);
        stateChanged = true;
      });
      stateChanged = false;
      updateRunningToolSpecificData(invocation, createToolCallState({
        toolInput: '{"topic":"metadata"}',
        contributor: { kind: ToolCallContributorKind.MCP, customizationId: "docs-customization" },
        _meta: meta
      }));
      assert.strictEqual(stateChanged, true, "state observers should be notified");
      assert.deepStrictEqual(invocation.toolSpecificData, {
        kind: "input",
        rawInput: { topic: "metadata" },
        mcpAppData: {
          kind: "agentHost",
          resourceUri: "ui://docs/app",
          serverId: "docs-customization",
          channel: "mcp://copilot/test-session-1/docs"
        }
      });
      disposable.dispose();
    });
    test("does not notify when no subagent content is present", () => {
      const tc = createToolCallState({});
      const invocation = toolCallStateToInvocation(tc);
      const originalData = invocation.toolSpecificData;
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running
      };
      updateRunningToolSpecificData(invocation, runningTc);
      assert.strictEqual(invocation.toolSpecificData, originalData, "toolSpecificData should not change");
    });
    test("refreshes terminal output as text content streams (built-in bash)", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "sleep 1; echo hi",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      assert.strictEqual(invocation.toolSpecificData?.kind, "terminal");
      assert.strictEqual(invocation.toolSpecificData.terminalCommandOutput, void 0);
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        content: [{ type: ToolResultContentType.Text, text: "hi\n" }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.kind, "terminal");
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
    test("preserves AHP terminal fields (terminalToolSessionId, terminalCommandUri) when refreshing output", () => {
      const tc = createToolCallState({
        toolName: "bash",
        toolInput: "echo hi",
        _meta: { toolKind: "terminal" }
      });
      const invocation = toolCallStateToInvocation(tc);
      const reviveUri = URI.parse("agenthost-terminal:///t9");
      invocation.toolSpecificData = {
        kind: "terminal",
        commandLine: { original: "echo hi" },
        language: "shellscript",
        terminalToolSessionId: "session-id-from-revive",
        terminalCommandUri: reviveUri,
        terminalCommandId: "cmd-id-from-revive"
      };
      const runningTc = {
        ...tc,
        status: ToolCallStatus.Running,
        content: [{ type: ToolResultContentType.Text, text: "hi\n" }]
      };
      updateRunningToolSpecificData(invocation, runningTc);
      const termData = invocation.toolSpecificData;
      assert.strictEqual(termData.terminalToolSessionId, "session-id-from-revive");
      assert.strictEqual(termData.terminalCommandUri, reviveUri);
      assert.strictEqual(termData.terminalCommandId, "cmd-id-from-revive");
      assert.strictEqual(termData.terminalCommandOutput?.text, "hi\r\n");
    });
  });
  suite("usageInfoToQuotas", () => {
    test("returns undefined when no quota snapshots present", () => {
      assert.strictEqual(usageInfoToQuotas(void 0), void 0);
      assert.strictEqual(usageInfoToQuotas({ inputTokens: 10 }), void 0);
      assert.strictEqual(usageInfoToQuotas({ _meta: { cost: 1 } }), void 0);
    });
    test("maps premium and chat snapshots, deriving additional usage and reset date", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            premium_interactions: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 300,
              usedRequests: 75,
              remainingPercentage: 75,
              overage: 1.5,
              overageAllowedWithExhaustedQuota: true,
              resetDate: "2026-07-01T00:00:00.000Z"
            },
            chat: {
              isUnlimitedEntitlement: true,
              entitlementRequests: -1,
              usedRequests: 10,
              remainingPercentage: 100
            }
          }
        }
      });
      assert.deepStrictEqual(result, {
        premiumChat: {
          percentRemaining: 75,
          unlimited: false,
          entitlement: 300,
          quotaRemaining: 225,
          resetAt: Date.parse("2026-07-01T00:00:00.000Z")
        },
        chat: {
          percentRemaining: 100,
          unlimited: true,
          entitlement: void 0,
          quotaRemaining: void 0,
          resetAt: void 0
        },
        additionalUsageEnabled: true,
        additionalUsageCount: 1.5,
        resetDate: "2026-07-01T00:00:00.000Z"
      });
    });
    test("skips categories with no allocated entitlement", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            premium_interactions: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 0,
              usedRequests: 0,
              remainingPercentage: 0,
              overage: 0,
              overageAllowedWithExhaustedQuota: false
            }
          }
        }
      });
      assert.deepStrictEqual(result, {
        additionalUsageEnabled: false,
        additionalUsageCount: 0
      });
    });
    test("skips a category whose remainingPercentage is missing", () => {
      const result = usageInfoToQuotas({
        _meta: {
          quotaSnapshots: {
            chat: {
              isUnlimitedEntitlement: false,
              entitlementRequests: 100,
              usedRequests: 10
              // remainingPercentage intentionally absent — must not masquerade as exhausted (0%).
            }
          }
        }
      });
      assert.strictEqual(result, void 0);
    });
  });
  suite("formatTurnResponseDetails", () => {
    const auto = { name: "Auto" };
    test("appends the billed model id when one is supplied", () => {
      const result = {
        resolvedModel: formatTurnResponseDetails(auto, "raptor-mini", void 0),
        withPricing: formatTurnResponseDetails({ ...auto, pricing: "0x" }, "raptor-mini", void 0),
        withCredits: formatTurnResponseDetails(auto, "raptor-mini", { _meta: { cost: 2 } }),
        oneCredit: formatTurnResponseDetails(auto, "raptor-mini", { _meta: { cost: 1 } }),
        noBilledModel: formatTurnResponseDetails(auto, void 0, void 0)
      };
      assert.deepStrictEqual(result, {
        resolvedModel: "Auto (raptor-mini)",
        withPricing: "Auto (raptor-mini) \xB7 0x",
        withCredits: "Auto (raptor-mini) \u2022 2 credits",
        oneCredit: "Auto (raptor-mini) \u2022 1 credit",
        noBilledModel: "Auto"
      });
    });
    test("uses the registered model name as-is without a billed id, undefined when unknown", () => {
      const sonnet = { name: "Claude Sonnet 4.5", pricing: "1x" };
      const result = {
        concrete: formatTurnResponseDetails(sonnet, void 0, void 0),
        concreteWithCredits: formatTurnResponseDetails(sonnet, void 0, { _meta: { cost: 2 } }),
        unknown: formatTurnResponseDetails(void 0, "raptor-mini", { _meta: { cost: 2 } })
      };
      assert.deepStrictEqual(result, {
        concrete: "Claude Sonnet 4.5 \xB7 1x",
        concreteWithCredits: "Claude Sonnet 4.5 \u2022 2 credits",
        unknown: void 0
      });
    });
  });
  suite("usageInfoToChatUsage", () => {
    test("carries whole-turn per-model token totals and resolves display names", () => {
      const turnTokenTotals = [{ model: "claude-opus-4.8", inputTokens: 110, cachedTokens: 4, outputTokens: 220 }];
      assert.deepStrictEqual(usageInfoToChatUsage(
        { inputTokens: 30, outputTokens: 40, _meta: { turnTokenTotals } },
        (model) => model === "claude-opus-4.8" ? "Claude Opus 4.8" : void 0
      ), {
        kind: "usage",
        promptTokens: 30,
        completionTokens: 40,
        copilotCredits: void 0,
        sessionCopilotCredits: void 0,
        promptTokenDetails: void 0,
        modelTotals: [{ ...turnTokenTotals[0], model: "Claude Opus 4.8" }]
      });
    });
    test("reports no totals when the provider did not supply any", () => {
      assert.strictEqual(usageInfoToChatUsage({ inputTokens: 30, outputTokens: 40 })?.modelTotals, void 0);
    });
  });
});
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXHRlc3RcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXHN0YXRlVG9Qcm9ncmVzc0FkYXB0ZXIudGVzdC50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCBhc3NlcnQgZnJvbSAnYXNzZXJ0JztcbmltcG9ydCB7IENvZGljb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9jb2RpY29ucy5qcyc7XG5pbXBvcnQgeyBhdXRvcnVuIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBoYXNLZXkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi90eXBlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcsIHR5cGUgSU1hcmtkb3duU3RyaW5nIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgZW5zdXJlTm9EaXNwb3NhYmxlc0FyZUxlYWtlZEluVGVzdFN1aXRlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS90ZXN0L2NvbW1vbi91dGlscy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyB0b0FnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9tZXRhL2FnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhLmpzJztcbmltcG9ydCB7IEFnZW50U3lzdGVtTm90aWZpY2F0aW9uS2luZCwgQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25TZXZlcml0eSwgdG9BZ2VudFN5c3RlbU5vdGlmaWNhdGlvbk1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25NZXRhLmpzJztcbmltcG9ydCB7IE1jcEF1dGhSZXF1aXJlZFJlYXNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgZnJvbUFnZW50SG9zdFVyaSwgdG9BZ2VudEhvc3RVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFVyaS5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50Q2hhdFVyaSwgQ2hhdElucHV0QW5zd2VyU3RhdGUsIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZCwgQ2hhdElucHV0UXVlc3Rpb25LaW5kLCBDaGF0SW5wdXRSZXNwb25zZUtpbmQsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZCwgVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cywgVG9vbENhbGxTdGF0dXMsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sUmVzdWx0Q29udGVudFR5cGUsIFR1cm5TdGF0ZSwgUmVzcG9uc2VQYXJ0S2luZCwgcmVhZFVzYWdlSW5mb01ldGEsIHdpdGhNZXNzYWdlSGlkZGVuRnJvbVRyYW5zY3JpcHQsIHR5cGUgQWN0aXZlVHVybiwgdHlwZSBJQ29tcGxldGVkVG9vbENhbGwsIHR5cGUgVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUsIHR5cGUgVG9vbENhbGxSdW5uaW5nU3RhdGUsIHR5cGUgVHVybiwgdHlwZSBUb29sQ2FsbFJlc3BvbnNlUGFydCwgVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24sIHR5cGUgTWVzc2FnZSwgdHlwZSBUb29sUmVzdWx0Q29udGVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IENoYXRUcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnREaXNwbGF5S2luZCwgSUNoYXRSZXF1ZXN0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LCB0b0NoYXRUcmFuc2NyaXB0Q29udGV4dEF0dGFjaG1lbnRNZXRhIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgQ2hhdFJlcXVlc3RPcmlnaW5LaW5kIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRSZXF1ZXN0T3JpZ2luLmpzJztcbmltcG9ydCB7IElDaGF0VG9vbEludm9jYXRpb24sIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBUb29sQ29uZmlybUtpbmQsIHR5cGUgSUNoYXRNYXJrZG93bkNvbnRlbnQsIHR5cGUgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSwgdHlwZSBJQ2hhdFRoaW5raW5nUGFydCwgdHlwZSBJQ2hhdFVzYWdlIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgdHlwZSBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHVybnNUb0hpc3RvcnkgYXMgcmF3VHVybnNUb0hpc3RvcnksIGFjdGl2ZVR1cm5Ub1Byb2dyZXNzIGFzIHJhd0FjdGl2ZVR1cm5Ub1Byb2dyZXNzLCBjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZCwgY29udGFpbnNBdXRvbWF0aWNSZXBseUFuc3dlciwgY3JlYXRlSW5wdXRSZXF1ZXN0Q2Fyb3VzZWwsIG1lc3NhZ2VBdHRhY2htZW50c1RvVmFyaWFibGVEYXRhLCBzaG91bGRPYnNlcnZlU3ViYWdlbnRDaGF0LCB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uIGFzIHJhd1Rvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24sIHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbiBhcyByYXdUb29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24sIHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24sIGZpbmFsaXplVG9vbEludm9jYXRpb24gYXMgcmF3RmluYWxpemVUb29sSW52b2NhdGlvbiwgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEgYXMgcmF3VXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEsIHVwZGF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uLCB1c2FnZUluZm9Ub0F1dG9Nb2RlUmVzb2x1dGlvbiwgdXNhZ2VJbmZvVG9DaGF0VXNhZ2UsIHVzYWdlSW5mb1RvUXVvdGFzLCBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzLCByZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldCwgcmV3cml0ZU1hcmtkb3duTGlua3MsIHR5cGUgVHVybk1vZGVsTG9va3VwIH0gZnJvbSAnLi4vLi4vLi4vYnJvd3Nlci9hZ2VudFNlc3Npb25zL2FnZW50SG9zdC9zdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyLmpzJztcblxuLy8gLS0tLSBIZWxwZXIgZmFjdG9yaWVzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZnVuY3Rpb24gY3JlYXRlVG9vbENhbGxTdGF0ZShvdmVycmlkZXM/OiBQYXJ0aWFsPFRvb2xDYWxsUnVubmluZ1N0YXRlPik6IFRvb2xDYWxsUnVubmluZ1N0YXRlIHtcblx0cmV0dXJuIHtcblx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdGVzdCB0b29sLi4uJyxcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbChvdmVycmlkZXM/OiBQYXJ0aWFsPElDb21wbGV0ZWRUb29sQ2FsbD4pOiBJQ29tcGxldGVkVG9vbENhbGwge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiB0ZXN0IHRvb2wnLFxuXHRcdC4uLm92ZXJyaWRlcyxcblx0fSBhcyBJQ29tcGxldGVkVG9vbENhbGw7XG59XG5cbmZ1bmN0aW9uIGNyZWF0ZVR1cm4ob3ZlcnJpZGVzPzogUGFydGlhbDxUdXJuPik6IFR1cm4ge1xuXHRyZXR1cm4ge1xuXHRcdGlkOiAndHVybi0xJyxcblx0XHRtZXNzYWdlOiB7IHRleHQ6ICdIZWxsbycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHRcdHN0YXRlOiBUdXJuU3RhdGUuQ29tcGxldGUsXG5cdFx0Li4ub3ZlcnJpZGVzLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHNlcmlhbGl6ZWQ6IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkKTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB7XG5cdGNvbnN0IHRvb2xTcGVjaWZpY0RhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE7XG5cdGFzc2VydC5zdHJpY3RFcXVhbCh0b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0YXNzZXJ0Lm9rKHRvb2xTcGVjaWZpY0RhdGEgJiYgaGFzS2V5KHRvb2xTcGVjaWZpY0RhdGEsIHsgY29tbWFuZExpbmU6IHRydWUgfSkpO1xuXHRyZXR1cm4gdG9vbFNwZWNpZmljRGF0YTtcbn1cblxuZnVuY3Rpb24gbWVzc2FnZSh0ZXh0OiBzdHJpbmcsIGtpbmQgPSBNZXNzYWdlS2luZC5Vc2VyKTogTWVzc2FnZSB7XG5cdHJldHVybiB7IHRleHQsIG9yaWdpbjogeyBraW5kIH0gfTtcbn1cblxuZnVuY3Rpb24gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YzogUGFyYW1ldGVyczx0eXBlb2YgcmF3VG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbj5bMF0sIHN1YkFnZW50SW52b2NhdGlvbklkPzogc3RyaW5nLCBvcHRpb25zPzogUGFyYW1ldGVyczx0eXBlb2YgcmF3VG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbj5bNV0pIHtcblx0cmV0dXJuIHJhd1Rvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMsIHN1YkFnZW50SW52b2NhdGlvbklkLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnLCB1bmRlZmluZWQsIG9wdGlvbnMpO1xufVxuXG5mdW5jdGlvbiB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGM6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1Rvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbj5bMF0pIHtcblx0cmV0dXJuIHJhd1Rvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbih0YywgVVJJLmZpbGUoJy8nKSwgJ2xvY2FsJyk7XG59XG5cbmZ1bmN0aW9uIGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbjogUGFyYW1ldGVyczx0eXBlb2YgcmF3RmluYWxpemVUb29sSW52b2NhdGlvbj5bMF0sIHRjOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdGaW5hbGl6ZVRvb2xJbnZvY2F0aW9uPlsxXSkge1xuXHRyZXR1cm4gcmF3RmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB0YywgVVJJLmZpbGUoJy8nKSwgJ2xvY2FsJyk7XG59XG5cbmZ1bmN0aW9uIHR1cm5zVG9IaXN0b3J5KGJhY2tlbmRTZXNzaW9uOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdUdXJuc1RvSGlzdG9yeT5bMF0sIHR1cm5zOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdUdXJuc1RvSGlzdG9yeT5bMV0sIHBhcnRpY2lwYW50SWQ6IFBhcmFtZXRlcnM8dHlwZW9mIHJhd1R1cm5zVG9IaXN0b3J5PlsyXSwgbG9va3VwPzogUGFyYW1ldGVyczx0eXBlb2YgcmF3VHVybnNUb0hpc3Rvcnk+WzRdKSB7XG5cdHJldHVybiByYXdUdXJuc1RvSGlzdG9yeShiYWNrZW5kU2Vzc2lvbiwgdHVybnMsIHBhcnRpY2lwYW50SWQsICdsb2NhbCcsIGxvb2t1cCk7XG59XG5cbi8qKlxuICogQnVpbGRzIGEgZmFrZSB7QGxpbmsgVHVybk1vZGVsTG9va3VwfSB0aGF0IG5hbWVzcGFjZXMgaWRzIHdpdGggYSBmaXhlZFxuICogcHJlZml4IGFuZCByZXR1cm5zIGRpc3BsYXkgbmFtZXMgZnJvbSBhIHN0YXRpYyBtYXAuIGBmYWxsYmFja1Jhd01vZGVsSWRgXG4gKiBtaXJyb3JzIHRoZSByZWFsIGhhbmRsZXIncyBcInVzZSBzdW1tYXJ5Lm1vZGVsIHdoZW4gdXNhZ2UgaGFzbid0IHJlcG9ydGVkXG4gKiB5ZXRcIiBiZWhhdmlvci5cbiAqL1xuZnVuY3Rpb24gbWFrZUxvb2t1cChwcmVmaXg6IHN0cmluZywgZGlzcGxheU5hbWVzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LCBmYWxsYmFja1Jhd01vZGVsSWQ/OiBzdHJpbmcpOiBUdXJuTW9kZWxMb29rdXAge1xuXHRjb25zdCByZXNvbHZlUmF3ID0gKHJhdzogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHJhdyA/PyBmYWxsYmFja1Jhd01vZGVsSWQ7XG5cdHJldHVybiB7XG5cdFx0dG9MYW5ndWFnZU1vZGVsSWQ6IChyYXcpID0+IHtcblx0XHRcdGNvbnN0IHIgPSByZXNvbHZlUmF3KHJhdyk7XG5cdFx0XHRyZXR1cm4gciA/IGAke3ByZWZpeH0ke3J9YCA6IHVuZGVmaW5lZDtcblx0XHR9LFxuXHRcdHRvTW9kZWxEaXNwbGF5TmFtZTogcmF3ID0+IGRpc3BsYXlOYW1lc1tyYXddLFxuXHRcdHRvUmVzcG9uc2VEZXRhaWxzOiAocmF3KSA9PiB7XG5cdFx0XHRjb25zdCByID0gcmVzb2x2ZVJhdyhyYXcpO1xuXHRcdFx0cmV0dXJuIHIgPyBkaXNwbGF5TmFtZXNbcl0gOiB1bmRlZmluZWQ7XG5cdFx0fSxcblx0XHR0b0F1dG9Nb2RlUmVzb2x1dGlvbjogdXNhZ2UgPT4ge1xuXHRcdFx0Y29uc3QgcmF3ID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmF1dG9Nb2RlUmVzb2x2ZWQ/LmNob3Nlbk1vZGVsO1xuXHRcdFx0cmV0dXJuIHVzYWdlSW5mb1RvQXV0b01vZGVSZXNvbHV0aW9uKHVzYWdlLCByYXcgPyBkaXNwbGF5TmFtZXNbcmF3XSA6IHVuZGVmaW5lZCk7XG5cdFx0fSxcblx0fTtcbn1cblxuZnVuY3Rpb24gYWN0aXZlVHVyblRvUHJvZ3Jlc3Moc2Vzc2lvblJlc291cmNlOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdBY3RpdmVUdXJuVG9Qcm9ncmVzcz5bMF0sIGFjdGl2ZVR1cm46IFBhcmFtZXRlcnM8dHlwZW9mIHJhd0FjdGl2ZVR1cm5Ub1Byb2dyZXNzPlsxXSwgY29ubmVjdGlvbkF1dGhvcml0eT86IFBhcmFtZXRlcnM8dHlwZW9mIHJhd0FjdGl2ZVR1cm5Ub1Byb2dyZXNzPlsyXSwgb3B0aW9ucz86IFBhcmFtZXRlcnM8dHlwZW9mIHJhd0FjdGl2ZVR1cm5Ub1Byb2dyZXNzPls0XSkge1xuXHRyZXR1cm4gcmF3QWN0aXZlVHVyblRvUHJvZ3Jlc3Moc2Vzc2lvblJlc291cmNlLCBhY3RpdmVUdXJuLCBjb25uZWN0aW9uQXV0aG9yaXR5IHx8ICdsb2NhbCcsIHVuZGVmaW5lZCwgb3B0aW9ucyk7XG59XG5cbmZ1bmN0aW9uIHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGV4aXN0aW5nOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdVcGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YT5bMF0sIHRjOiBQYXJhbWV0ZXJzPHR5cGVvZiByYXdVcGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YT5bMV0pIHtcblx0cmV0dXJuIHJhd1VwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGV4aXN0aW5nLCB0YywgVVJJLmZpbGUoJy8nKSwgJ2xvY2FsJyk7XG59XG5cbmZ1bmN0aW9uIGFzc2VydElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzOiB1bmtub3duKTogYXNzZXJ0cyBkZXRhaWxzIGlzIElUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzIHtcblx0YXNzZXJ0Lm9rKGlzVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKSk7XG59XG5cbi8vIC0tLS0gVGVzdHMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbnN1aXRlKCdzdGF0ZVRvUHJvZ3Jlc3NBZGFwdGVyJywgKCkgPT4ge1xuXG5cdGVuc3VyZU5vRGlzcG9zYWJsZXNBcmVMZWFrZWRJblRlc3RTdWl0ZSgpO1xuXG5cdHRlc3QoJ2RldGVjdHMgdGhlIGNhbm9uaWNhbCBhdXRvbWF0aWMgcmVwbHkgYW5zd2VyJywgKCkgPT4ge1xuXHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoW1xuXHRcdFx0Y29udGFpbnNBdXRvbWF0aWNSZXBseUFuc3dlcih7XG5cdFx0XHRcdHF1ZXN0aW9uOiB7XG5cdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHR2YWx1ZTogeyBraW5kOiBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dCwgdmFsdWU6IEFnZW50SG9zdEF1dG9SZXBseUFuc3dlciB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XHRjb250YWluc0F1dG9tYXRpY1JlcGx5QW5zd2VyKHtcblx0XHRcdFx0cXVlc3Rpb246IHtcblx0XHRcdFx0XHRzdGF0ZTogQ2hhdElucHV0QW5zd2VyU3RhdGUuU3VibWl0dGVkLFxuXHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0LCB2YWx1ZTogJ1VzZXIgYW5zd2VyJyB9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSksXG5cdFx0XSwgW3RydWUsIGZhbHNlXSk7XG5cdH0pO1xuXG5cdHRlc3QoJ3Jlc3RvcmVzIHRyYW5zY3JpcHQgY29udGV4dCBhdHRhY2htZW50cyBhcyB0aGVpciBmaXJzdC1jbGFzcyBraW5kJywgKCkgPT4ge1xuXHRcdGNvbnN0IG9yaWdpbmFsOiBJQ2hhdFJlcXVlc3RUcmFuc2NyaXB0Q29udGV4dFZhcmlhYmxlRW50cnkgPSB7XG5cdFx0XHRraW5kOiAndHJhbnNjcmlwdENvbnRleHQnLFxuXHRcdFx0aWQ6ICdwcicsXG5cdFx0XHRuYW1lOiAnIzQyIEltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0ZnVsbE5hbWU6ICcjNDIgSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRpY29uOiBDb2RpY29uLmdpdFB1bGxSZXF1ZXN0LFxuXHRcdFx0dG9vbHRpcDogJ1B1bGwgcmVxdWVzdCAjNDIgYnkgQGF1dGhvcicsXG5cdFx0XHR2YWx1ZTogJ3tcIm51bWJlclwiOjQyfScsXG5cdFx0XHR1cmk6IFVSSS5wYXJzZSgnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicpLFxuXHRcdH07XG5cblx0XHRjb25zdCByZXN0b3JlZCA9IG1lc3NhZ2VBdHRhY2htZW50c1RvVmFyaWFibGVEYXRhKFt7XG5cdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0bGFiZWw6IG9yaWdpbmFsLm5hbWUsXG5cdFx0XHRkaXNwbGF5S2luZDogQ2hhdFRyYW5zY3JpcHRDb250ZXh0QXR0YWNobWVudERpc3BsYXlLaW5kLFxuXHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogb3JpZ2luYWwudmFsdWUsXG5cdFx0XHRfbWV0YTogdG9DaGF0VHJhbnNjcmlwdENvbnRleHRBdHRhY2htZW50TWV0YShvcmlnaW5hbCksXG5cdFx0fV0sICdsb2NhbCcpPy52YXJpYWJsZXNbMF07XG5cblx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3RvcmVkICYmIHtcblx0XHRcdGtpbmQ6IHJlc3RvcmVkLmtpbmQsXG5cdFx0XHRuYW1lOiByZXN0b3JlZC5uYW1lLFxuXHRcdFx0ZnVsbE5hbWU6IHJlc3RvcmVkLmZ1bGxOYW1lLFxuXHRcdFx0aWNvbjogcmVzdG9yZWQuaWNvbj8uaWQsXG5cdFx0XHR2YWx1ZTogcmVzdG9yZWQudmFsdWUsXG5cdFx0XHR1cmk6IHJlc3RvcmVkLmtpbmQgPT09ICd0cmFuc2NyaXB0Q29udGV4dCcgPyByZXN0b3JlZC51cmkudG9TdHJpbmcoKSA6IHVuZGVmaW5lZCxcblx0XHRcdHRvb2x0aXA6IHJlc3RvcmVkLmtpbmQgPT09ICd0cmFuc2NyaXB0Q29udGV4dCcgPyByZXN0b3JlZC50b29sdGlwIDogdW5kZWZpbmVkLFxuXHRcdH0sIHtcblx0XHRcdGtpbmQ6ICd0cmFuc2NyaXB0Q29udGV4dCcsXG5cdFx0XHRuYW1lOiAnIzQyIEltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0ZnVsbE5hbWU6ICcjNDIgSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRpY29uOiAnZ2l0LXB1bGwtcmVxdWVzdCcsXG5cdFx0XHR2YWx1ZTogJ3tcIm51bWJlclwiOjQyfScsXG5cdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHRcdHRvb2x0aXA6ICdQdWxsIHJlcXVlc3QgIzQyIGJ5IEBhdXRob3InLFxuXHRcdH0pO1xuXHR9KTtcblxuXHR0ZXN0KCdyZXN0b3JlcyBsZWdhY3kgdHJhbnNjcmlwdCBjb250ZXh0IGF0dGFjaG1lbnRzIHdpdGhvdXQgYSBkaXNwbGF5IGtpbmQnLCAoKSA9PiB7XG5cdFx0Y29uc3QgcmVzdG9yZWQgPSBtZXNzYWdlQXR0YWNobWVudHNUb1ZhcmlhYmxlRGF0YShbe1xuXHRcdFx0dHlwZTogTWVzc2FnZUF0dGFjaG1lbnRLaW5kLlNpbXBsZSxcblx0XHRcdGxhYmVsOiAnIzQyIEltcHJvdmUgc2Vzc2lvbnMnLFxuXHRcdFx0bW9kZWxSZXByZXNlbnRhdGlvbjogJ3tcIm51bWJlclwiOjQyfScsXG5cdFx0XHRfbWV0YToge1xuXHRcdFx0XHQndnNjb2RlLmNoYXQudHJhbnNjcmlwdENvbnRleHQnOiB7XG5cdFx0XHRcdFx0bGFiZWw6ICcjNDIgSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRcdFx0aWNvbklkOiAnZ2l0LXB1bGwtcmVxdWVzdCcsXG5cdFx0XHRcdFx0dG9vbHRpcDogJ1B1bGwgcmVxdWVzdCAjNDIgYnkgQGF1dGhvcicsXG5cdFx0XHRcdFx0dXJpOiAnaHR0cHM6Ly9naXRodWIuY29tL293bmVyL3JlcG8vcHVsbC80MicsXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH1dLCAnbG9jYWwnKT8udmFyaWFibGVzWzBdO1xuXG5cdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN0b3JlZCAmJiB7XG5cdFx0XHRraW5kOiByZXN0b3JlZC5raW5kLFxuXHRcdFx0bmFtZTogcmVzdG9yZWQubmFtZSxcblx0XHRcdGljb246IHJlc3RvcmVkLmljb24/LmlkLFxuXHRcdFx0dmFsdWU6IHJlc3RvcmVkLnZhbHVlLFxuXHRcdFx0dXJpOiByZXN0b3JlZC5raW5kID09PSAndHJhbnNjcmlwdENvbnRleHQnID8gcmVzdG9yZWQudXJpLnRvU3RyaW5nKCkgOiB1bmRlZmluZWQsXG5cdFx0fSwge1xuXHRcdFx0a2luZDogJ3RyYW5zY3JpcHRDb250ZXh0Jyxcblx0XHRcdG5hbWU6ICcjNDIgSW1wcm92ZSBzZXNzaW9ucycsXG5cdFx0XHRpY29uOiAnZ2l0LXB1bGwtcmVxdWVzdCcsXG5cdFx0XHR2YWx1ZTogJ3tcIm51bWJlclwiOjQyfScsXG5cdFx0XHR1cmk6ICdodHRwczovL2dpdGh1Yi5jb20vb3duZXIvcmVwby9wdWxsLzQyJyxcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3Jld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0JywgKCkgPT4ge1xuXHRcdHRlc3QoJ3N1cHBvcnRzIGFic29sdXRlIHBhdGhzIGFuZCBmaWxlIFVSSXMgd2l0aCB2YWxpZGF0ZWQgbG9jYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdW53cmFwID0gKGhyZWY6IHN0cmluZykgPT4gZnJvbUFnZW50SG9zdFVyaShVUkkucGFyc2UocmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoaHJlZiwgJ215LWhvc3QnKSkpLnRvU3RyaW5nKCk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0dW53cmFwKCdDOlxcXFxyZW1vdGVcXFxcd2luZG93cy50czo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnXFxcXFxcXFxzZXJ2ZXJcXFxcc2hhcmVcXFxcdW5jLnRzOjQyJyksXG5cdFx0XHRcdFx0dW53cmFwKCdGSUxFOi8vL3JlbW90ZS91cHBlci50czo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS96ZXJvLnRzOjAnKSxcblx0XHRcdFx0XHR1bndyYXAoJy9yZW1vdGUvemVyby1jb2x1bW4udHM6NDI6MCcpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9udW1lcmljLXNlZ21lbnQudHM6NDI6bmFtZS50cycpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9zY2llbnRpZmljLnRzOjFlMicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9lbmNvZGVkJTNBNDInKSxcblx0XHRcdFx0XHR1bndyYXAoJy9yZW1vdGUvZW5jb2RlZCUzQTQyOjEwJyksXG5cdFx0XHRcdFx0dW53cmFwKCdmaWxlOi8vL3JlbW90ZS9lbmNvZGVkJTNBNDInKSxcblx0XHRcdFx0XHR1bndyYXAoJ2ZpbGU6Ly8vcmVtb3RlL2VuY29kZWQlM0E0MjoxMCcpLFxuXHRcdFx0XHRcdHVud3JhcCgnZmlsZTovLy9yZW1vdGUvcXVlcmllZC50cz9yZXY9MTo0MicpLFxuXHRcdFx0XHRcdHVud3JhcCgnL3JlbW90ZS9yYW5nZS50czo0Mi00OCcpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0VVJJLmZpbGUoJ0M6L3JlbW90ZS93aW5kb3dzLnRzJykud2l0aCh7IGZyYWdtZW50OiAnTDQyJyB9KS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvL3NlcnZlci9zaGFyZS91bmMudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvdXBwZXIudHMnKS53aXRoKHsgZnJhZ21lbnQ6ICdMNDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvemVyby50czowJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS96ZXJvLWNvbHVtbi50czo0MjowJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS9udW1lcmljLXNlZ21lbnQudHM6NDI6bmFtZS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvc2NpZW50aWZpYy50czoxZTInKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvcmVtb3RlL2VuY29kZWQ6NDInKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFVSSS5maWxlKCcvcmVtb3RlL2VuY29kZWQ6NDInKS53aXRoKHsgZnJhZ21lbnQ6ICdMMTAnIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvZW5jb2RlZDo0MicpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvZW5jb2RlZDo0MicpLndpdGgoeyBmcmFnbWVudDogJ0wxMCcgfSkudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRVUkkuZmlsZSgnL3JlbW90ZS9xdWVyaWVkLnRzJykud2l0aCh7IHF1ZXJ5OiAncmV2PTE6NDInIH0pLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0VVJJLmZpbGUoJy9yZW1vdGUvcmFuZ2UudHM6NDItNDgnKS50b1N0cmluZygpLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBjbGllbnQtaGFuZGxlZCBsaW5rIHNjaGVtZXMnLCAoKSA9PiB7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0cmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoJ3ZzY29kZS1icm93c2VyOi8vZXhhbXBsZS5jb20nLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRcdHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KCdjb3BpbG90LXNraWxsOi9wbGFuJywgJ215LWhvc3QnKSxcblx0XHRcdFx0XHRyZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldCgnQzpyZWxhdGl2ZScsICdteS1ob3N0JyksXG5cdFx0XHRcdFx0cmV3cml0ZUFnZW50SG9zdExpbmtUYXJnZXQoJ2dpdDpmb28nLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRcdHJld3JpdGVBZ2VudEhvc3RMaW5rVGFyZ2V0KCd1cm46aXNibjoxMjMnLCAnbXktaG9zdCcpLFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRbXG5cdFx0XHRcdFx0J3ZzY29kZS1icm93c2VyOi8vZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdCdjb3BpbG90LXNraWxsOi9wbGFuJyxcblx0XHRcdFx0XHQnQzpyZWxhdGl2ZScsXG5cdFx0XHRcdFx0J2dpdDpmb28nLFxuXHRcdFx0XHRcdCd1cm46aXNibjoxMjMnLFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ3R1cm5zVG9IaXN0b3J5JywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnZW1wdHkgdHVybnMgcHJvZHVjZXMgZW1wdHkgaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFtdLCAncCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIFtdKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NpbmdsZSB0dXJuIHByb2R1Y2VzIHJlcXVlc3QgKyByZXNwb25zZSBwYWlyJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlKCdEbyBzb21ldGhpbmcnKSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKCkgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5Lmxlbmd0aCwgMik7XG5cblx0XHRcdC8vIFJlcXVlc3Rcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5wcm9tcHQsICdEbyBzb21ldGhpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnBhcnRpY2lwYW50LCAncGFydGljaXBhbnQtMScpO1xuXG5cdFx0XHQvLyBSZXNwb25zZVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnlbMV0udHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVsxXS5wYXJ0aWNpcGFudCwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzFdLnBhcnRzLmxlbmd0aCwgMSk7XG5cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSBoaXN0b3J5WzFdLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQua2luZCwgJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbENhbGxJZCwgJ3RjLTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xJZCwgJ3Rlc3RfdG9vbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQuaXNDb21wbGV0ZSwgdHJ1ZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeXN0ZW0taW5pdGlhdGVkIHR1cm4gcHJlc2VydmVzIGNvbXBhY3QgcmVxdWVzdCBsYWJlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSgnYHNsZWVwIDZgIGNvbXBsZXRlZCcsIE1lc3NhZ2VLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbiksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUsICdyZXF1ZXN0Jyk7XG5cdFx0XHRpZiAoaGlzdG9yeVswXS50eXBlICE9PSAncmVxdWVzdCcpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5pc1N5c3RlbUluaXRpYXRlZCwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5wcm9tcHQsICdgc2xlZXAgNmAgY29tcGxldGVkJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaGlzdG9yeVswXS5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2hpZGRlbiB0dXJuIHJlbWFpbnMgaGlkZGVuIHdoZW4gcmVzdG9yZWQgZnJvbSBwcm90b2NvbCBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRtZXNzYWdlOiB3aXRoTWVzc2FnZUhpZGRlbkZyb21UcmFuc2NyaXB0KG1lc3NhZ2UoJ0luc3BlY3QgdGhpcyBwdWxsIHJlcXVlc3QnKSwgdHJ1ZSksXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoaXN0b3J5WzBdLCB7XG5cdFx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRcdHByb21wdDogJzwhLS0gdnNjb2RlLWhpZGRlbi1mcm9tLXRyYW5zY3JpcHQgLS0+XFxuSW5zcGVjdCB0aGlzIHB1bGwgcmVxdWVzdCcsXG5cdFx0XHRcdHBhcnRpY2lwYW50OiAncGFydGljaXBhbnQtMScsXG5cdFx0XHRcdG1vZGVsSWQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0dmFyaWFibGVEYXRhOiB1bmRlZmluZWQsXG5cdFx0XHRcdGlzSGlkZGVuOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkZWxlZ2F0ZWQgdHVybiByZXRhaW5zIGEgc291cmNlIHNlc3Npb24gbGluayB3aXRob3V0IGV4cG9zaW5nIHByb3ZpZGVyIG1ldGFkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRtZXNzYWdlOiB7XG5cdFx0XHRcdFx0dGV4dDogJ1JldmlldyB0aGlzJyxcblx0XHRcdFx0XHRvcmlnaW46IHsga2luZDogTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdFx0XHRcdF9tZXRhOiB0b0FnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhKHsgc291cmNlVGhyZWFkSWQ6ICdzb3VyY2UtdGhyZWFkJyB9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLnBhcnNlKCdjb2RleDovY2hpbGQtdGhyZWFkJyksIFt0dXJuXSwgJ2FnZW50LWhvc3QtY29kZXgnKTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChoaXN0b3J5WzBdLCB7XG5cdFx0XHRcdGlkOiB0dXJuLmlkLFxuXHRcdFx0XHR0eXBlOiAncmVxdWVzdCcsXG5cdFx0XHRcdHByb21wdDogJ1JldmlldyB0aGlzJyxcblx0XHRcdFx0cGFydGljaXBhbnQ6ICdhZ2VudC1ob3N0LWNvZGV4Jyxcblx0XHRcdFx0bW9kZWxJZDogdW5kZWZpbmVkLFxuXHRcdFx0XHR2YXJpYWJsZURhdGE6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3JpZ2luOiB7XG5cdFx0XHRcdFx0a2luZDogQ2hhdFJlcXVlc3RPcmlnaW5LaW5kLkRlbGVnYXRpb24sXG5cdFx0XHRcdFx0c291cmNlU2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29kZXg6L3NvdXJjZS10aHJlYWQnKSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGhyZWFkIGNvb3JkaW5hdGlvbiB0b29scyByZXN0b3JlIGRldGVybWluaXN0aWMgdGFyZ2V0LXNlc3Npb24gY2hpcHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjcmVhdGVMaW5rID0gJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvZGV4L2NyZWF0ZWQtdGhyZWFkJztcblx0XHRcdGNvbnN0IHNlbmRMaW5rID0gJ2FnZW50LWhvc3Qtc2Vzc2lvbjovL2NvZGV4L3RhcmdldC10aHJlYWQnO1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdjcmVhdGUnLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICdjcmVhdGVfc2Vzc2lvbicsXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6IEpTT04uc3RyaW5naWZ5KHsgcHJvbXB0OiAnUmVtZW1iZXIgdGhpcyB3b3JkOiBjYXB5YmFyYScgfSksXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogY3JlYXRlTGluayB9XSxcblx0XHRcdFx0XHR9KSxcblx0XHRcdFx0fSwge1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICdzZW5kJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAnc2VuZF9tZXNzYWdlJyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyBwcm9tcHQ6ICdmb28nIH0pLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IHNlbmRMaW5rIH1dLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLnBhcnNlKCdjb2RleDovc291cmNlLXRocmVhZCcpLCBbdHVybl0sICdhZ2VudC1ob3N0LWNvZGV4Jyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcgPyBwYXJ0LnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQpLCBbe1xuXHRcdFx0XHRraW5kOiAnc2Vzc2lvbkNyZWF0ZWQnLFxuXHRcdFx0XHRvcGVuTGluazogY3JlYXRlTGluayxcblx0XHRcdFx0bGFiZWw6ICdSZW1lbWJlciB0aGlzIHdvcmQ6IGNhcHliYXJhJyxcblx0XHRcdFx0aXNDaGF0OiBmYWxzZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0a2luZDogJ3Nlc3Npb25DcmVhdGVkJyxcblx0XHRcdFx0b3Blbkxpbms6IHNlbmRMaW5rLFxuXHRcdFx0XHRsYWJlbDogJ2ZvbycsXG5cdFx0XHRcdGlzQ2hhdDogZmFsc2UsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzeXN0ZW0gbm90aWZpY2F0aW9uIHJlc3BvbnNlIHBhcnQgcmVzdG9yZXMgYXMgc3lzdGVtIG5vdGlmaWNhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sIGNvbnRlbnQ6ICdTaGVsbCBjb21tYW5kIGNvbXBsZXRlZCcgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3QgcHJvZ3Jlc3MgPSByZXNwb25zZS5wYXJ0c1swXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcm9ncmVzcy5raW5kLCAnc3lzdGVtTm90aWZpY2F0aW9uJyk7XG5cdFx0XHRpZiAocHJvZ3Jlc3Mua2luZCAhPT0gJ3N5c3RlbU5vdGlmaWNhdGlvbicpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJvZ3Jlc3MuY29udGVudC52YWx1ZSwgJ1NoZWxsIGNvbW1hbmQgY29tcGxldGVkJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd3b3JrdHJlZSBmYWlsdXJlIG5vdGlmaWNhdGlvbiByZXN0b3JlcyBhcyB3YXJuaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdGNvbnRlbnQ6ICdXb3JrdHJlZSBjcmVhdGlvbiBmYWlsZWQnLFxuXHRcdFx0XHRcdF9tZXRhOiB0b0FnZW50U3lzdGVtTm90aWZpY2F0aW9uTWV0YSh7XG5cdFx0XHRcdFx0XHRraW5kOiBBZ2VudFN5c3RlbU5vdGlmaWNhdGlvbktpbmQuV29ya3RyZWVDcmVhdGlvbkZhaWx1cmUsXG5cdFx0XHRcdFx0XHRzZXZlcml0eTogQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25TZXZlcml0eS5XYXJuaW5nLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncGFydGljaXBhbnQtMScpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3BvbnNlLnBhcnRzWzBdLCB7XG5cdFx0XHRcdGtpbmQ6ICd3YXJuaW5nJyxcblx0XHRcdFx0Y29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKCdXb3JrdHJlZSBjcmVhdGlvbiBmYWlsZWQnKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhc29uaW5nIHJlc3BvbnNlIHBhcnQgcmVzdG9yZXMgYXMgdGhpbmtpbmcgcHJvZ3Jlc3MgY2FycnlpbmcgaXRzIGlkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZywgaWQ6ICdyLTEnLCBjb250ZW50OiAnTGV0IG1lIHRoaW5rIGFib3V0IHRoaXMuLi4nIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwYXJ0aWNpcGFudC0xJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHRoaW5raW5nID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUaGlua2luZ1BhcnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpbmtpbmcua2luZCwgJ3RoaW5raW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGhpbmtpbmcudmFsdWUsICdMZXQgbWUgdGhpbmsgYWJvdXQgdGhpcy4uLicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRoaW5raW5nLmlkLCAnci0xJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW5lcmljIGNvbXBsZXRlZCB0b29sIGNhbGwgaW4gaGlzdG9yeSBpbmNsdWRlcyBpbnB1dC9vdXRwdXQgZGV0YWlscycsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcInRlcm1pbmFsIGFjdGl2YXRpb25cIn0nLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdVc2Ugc2hlbGwgaW50ZWdyYXRpb24uJyB9XSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gc2VyaWFsaXplZC5yZXN1bHREZXRhaWxzO1xuXG5cdFx0XHRhc3NlcnRJbnB1dE91dHB1dERldGFpbHMoZGV0YWlscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5pbnB1dCwgJ3tcInF1ZXJ5XCI6XCJ0ZXJtaW5hbCBhY3RpdmF0aW9uXCJ9Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5pbnB1dExhbmd1YWdlLCAnanNvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dCwgW3sgdHlwZTogJ2VtYmVkJywgdmFsdWU6ICdVc2Ugc2hlbGwgaW50ZWdyYXRpb24uJywgaXNUZXh0OiB0cnVlLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nIH1dKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlzRXJyb3IsIGZhbHNlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Jlc3RvcmVzIGFuIGFuc3dlcmVkIGFzay11c2VyIGludGVyYWN0aW9uIGFzIGEgaGlkZGVuIHRvb2wgcGx1cyBjb252ZXJzYXRpb25hbCBzdW1tYXJ5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7IHRvb2xOYW1lOiAnYXNrX3VzZXInIH0pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5JbnB1dFJlcXVlc3QsXG5cdFx0XHRcdFx0XHRyZXF1ZXN0OiB7XG5cdFx0XHRcdFx0XHRcdGlkOiAnaW5wdXQtMScsXG5cdFx0XHRcdFx0XHRcdHF1ZXN0aW9uczogW3tcblx0XHRcdFx0XHRcdFx0XHRpZDogJ3ExJyxcblx0XHRcdFx0XHRcdFx0XHRraW5kOiBDaGF0SW5wdXRRdWVzdGlvbktpbmQuU2luZ2xlU2VsZWN0LFxuXHRcdFx0XHRcdFx0XHRcdG1lc3NhZ2U6ICdXaGF0IHNob3VsZCB3ZSB3b3JrIG9uPycsXG5cdFx0XHRcdFx0XHRcdFx0cmVxdWlyZWQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdFx0b3B0aW9uczogW1xuXHRcdFx0XHRcdFx0XHRcdFx0eyBpZDogJ2ZpeCcsIGxhYmVsOiAnRml4IGEgYnVnJyB9LFxuXHRcdFx0XHRcdFx0XHRcdFx0eyBpZDogJ2ZlYXR1cmUnLCBsYWJlbDogJ0ltcGxlbWVudCBhIGZlYXR1cmUnIH0sXG5cdFx0XHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdFx0fV0sXG5cdFx0XHRcdFx0XHRcdGFuc3dlcnM6IHtcblx0XHRcdFx0XHRcdFx0XHRxMToge1xuXHRcdFx0XHRcdFx0XHRcdFx0c3RhdGU6IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZCxcblx0XHRcdFx0XHRcdFx0XHRcdHZhbHVlOiB7IGtpbmQ6IENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZCwgdmFsdWU6ICdmaXgnIH0sXG5cdFx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRyZXNwb25zZTogQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcGFydHMgPSBoaXN0b3J5WzFdLnR5cGUgPT09ICdyZXNwb25zZScgPyBoaXN0b3J5WzFdLnBhcnRzIDogW107XG5cdFx0XHRjb25zdCB0b29sID0gcGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IHBhcnRzWzFdO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9vbFByZXNlbnRhdGlvbjogdG9vbC5wcmVzZW50YXRpb24sXG5cdFx0XHRcdGNhcm91c2VsS2luZDogY2Fyb3VzZWwua2luZCxcblx0XHRcdFx0YW5zd2VyUHJlc2VudGF0aW9uOiBjYXJvdXNlbC5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcgPyBjYXJvdXNlbC5hbnN3ZXJQcmVzZW50YXRpb24gOiB1bmRlZmluZWQsXG5cdFx0XHRcdGFuc3dlcjogY2Fyb3VzZWwua2luZCA9PT0gJ3F1ZXN0aW9uQ2Fyb3VzZWwnID8gY2Fyb3VzZWwuZGF0YT8ucTEgOiB1bmRlZmluZWQsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvb2xQcmVzZW50YXRpb246IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGUsXG5cdFx0XHRcdGNhcm91c2VsS2luZDogJ3F1ZXN0aW9uQ2Fyb3VzZWwnLFxuXHRcdFx0XHRhbnN3ZXJQcmVzZW50YXRpb246ICdjb252ZXJzYXRpb24nLFxuXHRcdFx0XHRhbnN3ZXI6IHsgc2VsZWN0ZWRWYWx1ZTogJ2ZpeCcsIGZyZWVmb3JtVmFsdWU6IHVuZGVmaW5lZCB9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdnZW5lcmljIGZhaWxlZCB0b29sIGNhbGwgaW4gaGlzdG9yeSB1c2VzIGVycm9yIHRleHQgYXMgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ1cmxcIjpcImh0dHBzOi8vZXhhbXBsZS5jb21cIn0nLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdFx0XHRlcnJvcjogeyBtZXNzYWdlOiAncmVxdWVzdCB0aW1lZCBvdXQnIH0sXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscztcblxuXHRcdFx0YXNzZXJ0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMuaXNFcnJvciwgdHJ1ZSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0LCBbeyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogJ3JlcXVlc3QgdGltZWQgb3V0JywgaXNUZXh0OiB0cnVlLCBtaW1lVHlwZTogJ3RleHQvcGxhaW4nIH1dKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCBNQ1AgQXBwIHRvb2wgY2FsbCBpbiBoaXN0b3J5IHJlbWFpbnMgY29uZmlybWVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ0dpdEh1Yi1jcmVhdGVfcHVsbF9yZXF1ZXN0Jyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcIm93bmVyXCI6XCJtaWNyb3NvZnRcIixcInJlcG9cIjpcInZzY29kZVwifScsXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICdUaGUgcHVsbCByZXF1ZXN0IGZvcm0gaXMgYXdhaXRpbmcgc3VibWlzc2lvbi4nIH0sXG5cdFx0XHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2dpdGh1Yi1jdXN0b21pemF0aW9uJyB9LFxuXHRcdFx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRcdFx0dWk6IHtcblx0XHRcdFx0XHRcdFx0XHRyZXNvdXJjZVVyaTogJ3VpOi8vZ2l0aHViLW1jcC1zZXJ2ZXIvcHItd3JpdGUnLFxuXHRcdFx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Nlc3Npb24vR2l0SHViJyxcblx0XHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGlzQ29uZmlybWVkOiBzZXJpYWxpemVkLmlzQ29uZmlybWVkLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhOiBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGlzQ29uZmlybWVkOiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfSxcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdFx0cmF3SW5wdXQ6IHsgb3duZXI6ICdtaWNyb3NvZnQnLCByZXBvOiAndnNjb2RlJyB9LFxuXHRcdFx0XHRcdG1jcEFwcERhdGE6IHtcblx0XHRcdFx0XHRcdGtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2dpdGh1Yi1tY3Atc2VydmVyL3ByLXdyaXRlJyxcblx0XHRcdFx0XHRcdHNlcnZlcklkOiAnZ2l0aHViLWN1c3RvbWl6YXRpb24nLFxuXHRcdFx0XHRcdFx0Y2hhbm5lbDogJ21jcDovL2NvcGlsb3Qvc2Vzc2lvbi9HaXRIdWInLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2dlbmVyaWMgY29tcGxldGVkIHRvb2wgY2FsbCBtYXBzIGVtYmVkZGVkIHJlc291cmNlcyBhbmQgcmVzb3VyY2UgcmVmcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1wiaW1hZ2VcIjpcImRpYWdyYW1cIn0nLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlLCBkYXRhOiAnYVcxaFoyVT0nLCBjb250ZW50VHlwZTogJ2ltYWdlL3BuZycgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuUmVzb3VyY2UsIHVyaTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3Nlc3Npb24vcmVzdWx0LnR4dCcsIGNvbnRlbnRUeXBlOiAndGV4dC9wbGFpbicgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgZGV0YWlscyA9IHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscztcblxuXHRcdFx0YXNzZXJ0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0Lmxlbmd0aCwgMik7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0WzBdLCB7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAnYVcxaFoyVT0nLCBtaW1lVHlwZTogJ2ltYWdlL3BuZycgfSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXRbMV0udHlwZSwgJ3JlZicpO1xuXHRcdFx0Ly8gUmVzb3VyY2UgVVJJIGlzIHdyYXBwZWQgdmlhIHRvQWdlbnRIb3N0VXJpIHNvIGl0IHJlc29sdmVzIHRocm91Z2ggdGhlXG5cdFx0XHQvLyBhZ2VudCBob3N0IGZpbGVzeXN0ZW0gcHJvdmlkZXIgb24gdGhlIGNsaWVudCB3aGVuIHRoZSBzZXNzaW9uIGlzIGJhY2tlZFxuXHRcdFx0Ly8gYnkgYSByZW1vdGUgYWdlbnQgaG9zdC5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dFsxXS51cmkuc2NoZW1lLCAndnNjb2RlLWFnZW50LWhvc3QnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dFsxXS51cmkuYXV0aG9yaXR5LCAnbG9jYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dFsxXS51cmkucGF0aCwgJy9zZXNzaW9uL3Jlc3VsdC50eHQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLm91dHB1dFsxXS5taW1lVHlwZSwgJ3RleHQvcGxhaW4nKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Blci10dXJuIG1vZGVsIGlkIGFuZCBkaXNwbGF5IG5hbWUgZmxvdyBmcm9tIHVzYWdlLm1vZGVsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybjEgPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0aWQ6ICd0dXJuLTEnLFxuXHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlKCdmaXJzdCcpLFxuXHRcdFx0XHR1c2FnZTogeyBtb2RlbDogJ2dwdC01JyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCB0dXJuMiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRpZDogJ3R1cm4tMicsXG5cdFx0XHRcdG1lc3NhZ2U6IG1lc3NhZ2UoJ3NlY29uZCcpLFxuXHRcdFx0XHR1c2FnZTogeyBtb2RlbDogJ29wdXMtNC43JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGxvb2t1cCA9IG1ha2VMb29rdXAoJ2FnZW50LWhvc3QtY29waWxvdDonLCB7ICdncHQtNSc6ICdHUFQtNScsICdvcHVzLTQuNyc6ICdDbGF1ZGUgT3B1cyA0LjcnIH0pO1xuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuMSwgdHVybjJdLCAncCcsIGxvb2t1cCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGhpc3RvcnkubWFwKGggPT4gaC50eXBlID09PSAncmVxdWVzdCdcblx0XHRcdFx0XHQ/IHsgdHlwZTogaC50eXBlLCBtb2RlbElkOiBoLm1vZGVsSWQgfVxuXHRcdFx0XHRcdDogeyB0eXBlOiBoLnR5cGUsIGRldGFpbHM6IGguZGV0YWlscyB9KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBtb2RlbElkOiAnYWdlbnQtaG9zdC1jb3BpbG90OmdwdC01JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgZGV0YWlsczogJ0dQVC01JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBtb2RlbElkOiAnYWdlbnQtaG9zdC1jb3BpbG90Om9wdXMtNC43JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgZGV0YWlsczogJ0NsYXVkZSBPcHVzIDQuNycgfSxcblx0XHRcdFx0XSxcblx0XHRcdCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXN0b3JlcyBBdXRvIG1vZGVsIHJvdXRpbmcgd2l0aCB0aGUgc2hhcmVkIGNoYXQgVUkgcGFydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0dXNhZ2U6IHtcblx0XHRcdFx0XHRtb2RlbDogJ2dwdC01LjQtbWluaScsXG5cdFx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRcdGF1dG9Nb2RlUmVzb2x2ZWQ6IHtcblx0XHRcdFx0XHRcdFx0Y2hvc2VuTW9kZWw6ICdncHQtNS40LW1pbmknLFxuXHRcdFx0XHRcdFx0XHRwcmVkaWN0ZWRMYWJlbDogJ25vX3JlYXNvbmluZycsXG5cdFx0XHRcdFx0XHRcdGNvbmZpZGVuY2U6IDAuOTgsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGxvb2t1cCA9IG1ha2VMb29rdXAoJ2FnZW50LWhvc3QtY29waWxvdDonLCB7ICdncHQtNS40LW1pbmknOiAnR1BULTUuNCBtaW5pJyB9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnLCBsb29rdXApO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzcG9uc2UucGFydHMsIFt7XG5cdFx0XHRcdGtpbmQ6ICdhdXRvTW9kZVJlc29sdXRpb24nLFxuXHRcdFx0XHRyZXNvbHZlZE1vZGVsOiAnZ3B0LTUuNC1taW5pJyxcblx0XHRcdFx0cmVzb2x2ZWRNb2RlbE5hbWU6ICdHUFQtNS40IG1pbmknLFxuXHRcdFx0XHRwcmVkaWN0ZWRMYWJlbDogJ25vX3JlYXNvbmluZycsXG5cdFx0XHRcdGNvbmZpZGVuY2U6IDAuOTgsXG5cdFx0XHR9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmYWxscyBiYWNrIHRvIHNlc3Npb24tbGV2ZWwgbW9kZWwgd2hlbiB0dXJuIGhhcyBubyB1c2FnZS5tb2RlbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHsgbWVzc2FnZTogbWVzc2FnZSgnZmlyc3QnKSB9KTtcblx0XHRcdGNvbnN0IGxvb2t1cCA9IG1ha2VMb29rdXAoJ2FnZW50LWhvc3QtY29waWxvdDonLCB7ICdncHQtNSc6ICdHUFQtNScgfSwgJ2dwdC01Jyk7XG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcsIGxvb2t1cCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdGhpc3RvcnkubWFwKGggPT4gaC50eXBlID09PSAncmVxdWVzdCdcblx0XHRcdFx0XHQ/IHsgdHlwZTogaC50eXBlLCBtb2RlbElkOiBoLm1vZGVsSWQgfVxuXHRcdFx0XHRcdDogeyB0eXBlOiBoLnR5cGUsIGRldGFpbHM6IGguZGV0YWlscyB9KSxcblx0XHRcdFx0W1xuXHRcdFx0XHRcdHsgdHlwZTogJ3JlcXVlc3QnLCBtb2RlbElkOiAnYWdlbnQtaG9zdC1jb3BpbG90OmdwdC01JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogJ3Jlc3BvbnNlJywgZGV0YWlsczogJ0dQVC01JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcHMgdHVybiB1c2FnZSB0byBjaGF0IHVzYWdlIHByb2dyZXNzIGZvciByZXN0b3JlZCBoaXN0b3J5JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdGlucHV0VG9rZW5zOiAxMjAwLFxuXHRcdFx0XHRcdG91dHB1dFRva2VuczogMzAwLFxuXHRcdFx0XHRcdG1vZGVsOiAnZ3B0LTUnLFxuXHRcdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0XHR0dXJuVG9rZW5Ub3RhbHM6IFt7IG1vZGVsOiAnZ3B0LTUnLCBpbnB1dFRva2VuczogMTIwMCwgY2FjaGVkVG9rZW5zOiA0MDAsIG91dHB1dFRva2VuczogMzAwIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sIGlkOiAnbWQtMScsIGNvbnRlbnQ6ICdEb25lJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcsIG1ha2VMb29rdXAoJ2FnZW50LWhvc3QtY29waWxvdDonLCB7ICdncHQtNSc6ICdHUFQtNScgfSkpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHJlc3BvbnNlLnBhcnRzLm1hcChwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3VzYWdlJ1xuXHRcdFx0XHRcdD8geyBraW5kOiBwYXJ0LmtpbmQsIHByb21wdFRva2VuczogcGFydC5wcm9tcHRUb2tlbnMsIGNvbXBsZXRpb25Ub2tlbnM6IHBhcnQuY29tcGxldGlvblRva2VucywgbW9kZWxUb3RhbHM6IHBhcnQubW9kZWxUb3RhbHMgfVxuXHRcdFx0XHRcdDogeyBraW5kOiBwYXJ0LmtpbmQgfSksXG5cdFx0XHRcdFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRcdFx0cHJvbXB0VG9rZW5zOiAxMjAwLFxuXHRcdFx0XHRcdFx0Y29tcGxldGlvblRva2VuczogMzAwLFxuXHRcdFx0XHRcdFx0bW9kZWxUb3RhbHM6IFt7IG1vZGVsOiAnR1BULTUnLCBpbnB1dFRva2VuczogMTIwMCwgY2FjaGVkVG9rZW5zOiA0MDAsIG91dHB1dFRva2VuczogMzAwIH1dLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0eyBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcXVlc3QgaGlzdG9yeSBpbmNsdWRlcyByZXN0b3JlZCBtb2RlbCBpZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0bWVzc2FnZTogbWVzc2FnZSgnVXNlIHJlc3RvcmVkIG1vZGVsJyksXG5cdFx0XHRcdHN0YXJ0ZWRBdDogJzIwMjUtMDctMDhUMjI6MDU6MjEuMDAwWicsXG5cdFx0XHRcdGR1cmF0aW9uOiAyXzUwMCxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBsb29rdXAgPSBtYWtlTG9va3VwKCdhZ2VudC1ob3N0LWNvcGlsb3Q6Jywge30sICdncHQtNScpO1xuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3BhcnRpY2lwYW50LTEnLCBsb29rdXApO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhpc3RvcnlbMF0sIHtcblx0XHRcdFx0aWQ6IHR1cm4uaWQsXG5cdFx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdFx0cHJvbXB0OiAnVXNlIHJlc3RvcmVkIG1vZGVsJyxcblx0XHRcdFx0cGFydGljaXBhbnQ6ICdwYXJ0aWNpcGFudC0xJyxcblx0XHRcdFx0bW9kZWxJZDogJ2FnZW50LWhvc3QtY29waWxvdDpncHQtNScsXG5cdFx0XHRcdHRpbWVzdGFtcDogMV83NTJfMDEyXzMyMV8wMDAsXG5cdFx0XHRcdHZhcmlhYmxlRGF0YTogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGhpc3RvcnlbMV0udHlwZSA9PT0gJ3Jlc3BvbnNlJyA/IHtcblx0XHRcdFx0ZWxhcHNlZE1zOiBoaXN0b3J5WzFdLmVsYXBzZWRNcyxcblx0XHRcdFx0Y29tcGxldGVkQXQ6IGhpc3RvcnlbMV0uY29tcGxldGVkQXQsXG5cdFx0XHR9IDogdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGVsYXBzZWRNczogMl81MDAsXG5cdFx0XHRcdGNvbXBsZXRlZEF0OiAxXzc1Ml8wMTJfMzIzXzUwMCxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdCBoaXN0b3J5IG9taXRzIGludmFsaWQgcmVzdG9yZWQgdGltZXN0YW1wJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oeyBzdGFydGVkQXQ6ICdpbnZhbGlkJyB9KTtcblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwYXJ0aWNpcGFudC0xJyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChoaXN0b3J5WzBdLnR5cGUgPT09ICdyZXF1ZXN0JyA/IGhpc3RvcnlbMF0udGltZXN0YW1wIDogdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgdG9vbCBjYWxsIGluIGhpc3RvcnkgaGFzIGNvcnJlY3QgdGVybWluYWwgZGF0YScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy90MScsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoZWxsbycgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IHN0cmluZyB9OyB0ZXJtaW5hbENvbW1hbmRPdXRwdXQ6IHsgdGV4dDogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZFN0YXRlOiB7IGV4aXRDb2RlOiBudW1iZXIgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsLCAnZWNobyBoZWxsbycpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dC50ZXh0LCAnaGVsbG8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbWFnZSBnZW5lcmF0aW9uIGluIGhpc3RvcnkgaXMgbWFya2VkIGFzIGEgZHVyYWJsZSBpbWFnZSBvdXRjb21lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAnaW1hZ2VfZ2VuLmltYWdlZ2VuJyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ3tcInByb21wdFwiOlwiRHJhdyBhIGZveFwifScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZSwgZGF0YTogJ2FXMWhaMlU9JywgY29udGVudFR5cGU6ICdpbWFnZS9wbmcnIH1dLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCBkZXRhaWxzID0gc2VyaWFsaXplZC5yZXN1bHREZXRhaWxzO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0XHRpbnB1dDogaXNUb29sUmVzdWx0SW5wdXRPdXRwdXREZXRhaWxzKGRldGFpbHMpID8gZGV0YWlscy5pbnB1dCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0b3V0cHV0OiBpc1Rvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHMoZGV0YWlscykgPyBkZXRhaWxzLm91dHB1dCA6IHVuZGVmaW5lZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0dG9vbFNwZWNpZmljRGF0YTogeyBraW5kOiAnZ2VuZXJhdGVkSW1hZ2UnIH0sXG5cdFx0XHRcdGlucHV0OiAne1wicHJvbXB0XCI6XCJEcmF3IGEgZm94XCJ9Jyxcblx0XHRcdFx0b3V0cHV0OiBbeyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogJ2FXMWhaMlU9JywgbWltZVR5cGU6ICdpbWFnZS9wbmcnIH1dLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0ZXJtaW5hbCB0b29sIGNhbGwgaW4gaGlzdG9yeSBjYXJyaWVzIGF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUgb25seSB3aGVuIHN0YW1wZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtcblx0XHRcdFx0XHR7XG5cdFx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtbWFya2VkJyxcblx0XHRcdFx0XHRcdFx0dG9vbElucHV0OiAnbXktY3VzdG9tLXNjcmlwdCcsXG5cdFx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnLCBhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiB0cnVlIH0sXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vbWFya2VkJywgdGl0bGU6ICdUZXJtaW5hbCcgfV0sXG5cdFx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHR9KVxuXHRcdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnQsXG5cdFx0XHRcdFx0e1xuXHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXVubWFya2VkJyxcblx0XHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoZWxsbycsXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdW5tYXJrZWQnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9XSxcblx0XHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdH0pXG5cdFx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKFxuXHRcdFx0XHRyZXNwb25zZS5wYXJ0cy5tYXAocGFydCA9PiBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHBhcnQgYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQpLmF1dG9BcHByb3ZlUnVsZVJlc29sdmFibGUpLFxuXHRcdFx0XHRbdHJ1ZSwgdW5kZWZpbmVkXSxcblx0XHRcdFx0J2ZsYWcgaXMgY29waWVkIGZyb20gdG9vbCBjYWxsIG1ldGEgYW5kIGFic2VudCBvdGhlcndpc2UnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rlcm1pbmFsIHRvb2wgY2FsbCBpbiBoaXN0b3J5IGNhcnJpZXMgdGhlIExNIGludGVudGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0aW50ZW50aW9uOiAnTGlzdCBmaWxlcyBpbiB0aGUgcmVwbyByb290Jyxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ2xzJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL2ludGVudCcsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdhXFxuYicgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyBpbnRlbnRpb24/OiBzdHJpbmcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5pbnRlbnRpb24sICdMaXN0IGZpbGVzIGluIHRoZSByZXBvIHJvb3QnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Rlcm1pbmFsIHRvb2wgY2FsbCBpbiBoaXN0b3J5IGRvZXMgbm90IHNldCBwYXN0VGVuc2VNZXNzYWdlIChhdm9pZHMgZHVwbGljYXRlIHJlbmRlciknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdFx0XHR0b29sSW5wdXQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZWNobyBoaScsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9wYXN0JywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0fSlcblx0XHRcdFx0fSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC5wYXN0VGVuc2VNZXNzYWdlLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgdG9vbCBjYWxsIChieSB0b29sS2luZCBvbmx5KSBpbiBoaXN0b3J5IGRvZXMgbm90IHNldCBwYXN0VGVuc2VNZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmFuIGVjaG8gaGknLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnaGknIH0sXG5cdFx0XHRcdFx0XHRdLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnBhc3RUZW5zZU1lc3NhZ2UsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzdWJhZ2VudCB0b29sIGNhbGwgaW4gaGlzdG9yeSBoYXMgY29ycmVjdCBzdWJhZ2VudCBkYXRhJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ0FnZW50IHJlc3VsdCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsIHJlc291cmNlOiAnY29waWxvdDovL3Nlc3Npb24vc3ViYWdlbnQvdGMtMScsIHRpdGxlOiAnRXhwbG9yZScsIGFnZW50TmFtZTogJ2V4cGxvcmUnLCBkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScgfSxcblx0XHRcdFx0XHRcdF0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmFnZW50TmFtZSwgJ2V4cGxvcmUnKTtcblx0XHRcdFx0Ly8gZGVzY3JpcHRpb24gaXMgdGhlIFRBU0sgZGVzY3JpcHRpb24gZnJvbSBfbWV0YSwgbm90IHRoZSBhZ2VudCBkZXNjcmlwdGlvblxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnRmluZCByZWxhdGVkIGZpbGVzJyk7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEucmVzdWx0LCAnQWdlbnQgcmVzdWx0Jyk7XG5cdFx0XHRcdC8vIFRoZSBzdWJhZ2VudCBjaGF0IHJlc291cmNlIGlzIGNhcnJpZWQgc28gdGhlIFVJIGNhbiBvZmZlciBcIk9wZW4gY2hhdFwiLlxuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmNoYXRSZXNvdXJjZSwgJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N1YmFnZW50IHRvb2wgd2l0aG91dCBjb250ZW50IGZhbGxzIGJhY2sgdG8gdG9vbEtpbmQgbWV0YScsICgpID0+IHtcblx0XHRcdC8vIFRoaXMgaGFwcGVucyB3aGVuIHRoZSBpbi1tZW1vcnkgc3RhdGUgbG9zdCBzdWJhZ2VudCBjb250ZW50XG5cdFx0XHQvLyAoZS5nLiB0b29sX2NvbXBsZXRlIG92ZXJ3cm90ZSBpdCBiZWZvcmUgdGhlIG1lcmdlIGZpeClcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3tcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICd0YXNrJyxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGFzaycsXG5cdFx0XHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50JyB9LFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdSZXN1bHQgdGV4dCcgfV0sXG5cdFx0XHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQucmVzdWx0RGV0YWlscywgdW5kZWZpbmVkKTtcblx0XHRcdGlmIChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnVGFzaycpO1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLnJlc3VsdCwgJ1Jlc3VsdCB0ZXh0Jyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0dXJuIHdpdGggcmVzcG9uc2VUZXh0IHByb2R1Y2VzIG1hcmtkb3duIGNvbnRlbnQgaW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtZC0xJywgY29udGVudDogJ0hlbGxvIHdvcmxkJyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGhpc3RvcnkubGVuZ3RoLCAyKTtcblxuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UucGFydHMubGVuZ3RoLCAxKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5wYXJ0c1swXS5raW5kLCAnbWFya2Rvd25Db250ZW50Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50KS5jb250ZW50LnZhbHVlLCAnSGVsbG8gd29ybGQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtkb3duIGxpbmtzIGluIHJlc3BvbnNlIGNvbnRlbnQgc3RheSByYXcgdW50aWwgcmVuZGVyaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgY29udGVudCA9ICdTZWUgW2xvY2FsXShmaWxlOi8vL2EvYi50cyksIFtleHRlcm5hbF0oaHR0cHM6Ly9leGFtcGxlLmNvbSkgYW5kIFtyZWxdKC4vZm9vLm1kKS4nO1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0aWQ6ICdtZC1saW5rcycsXG5cdFx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHJhd1R1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnLCAnbXktaG9zdCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQ7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocGFydC5jb250ZW50LnZhbHVlLCBjb250ZW50KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtkb3duIGxpbmsgc3ludGF4IGluc2lkZSBmZW5jZWQgY29kZSBibG9ja3MgaXMgcHJlc2VydmVkIHZlcmJhdGltJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSBbXG5cdFx0XHRcdCdVc2UgW3JlYWxdKGZpbGU6Ly8vYS50cykgZGlyZWN0bHkuJyxcblx0XHRcdFx0JycsXG5cdFx0XHRcdCdgYGBtZCcsXG5cdFx0XHRcdCdbZmFrZV0oZmlsZTovLy9iLnRzKScsXG5cdFx0XHRcdCdgYGAnLFxuXHRcdFx0XHQnJyxcblx0XHRcdFx0J0FuZCB0aGVuIFthbm90aGVyXShmaWxlOi8vL2MudHMpLicsXG5cdFx0XHRdLmpvaW4oJ1xcbicpO1xuXHRcdFx0Y29uc3QgdmFsdWUgPSByZXdyaXRlTWFya2Rvd25MaW5rcyhpbnB1dCwgJ215LWhvc3QnKTtcblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnW10odnNjb2RlLWFnZW50LWhvc3Q6Ly9teS1ob3N0L2EudHM/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjApJykpO1xuXHRcdFx0YXNzZXJ0Lm9rKHZhbHVlLmluY2x1ZGVzKCdbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYy50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCknKSk7XG5cdFx0XHQvLyBUaGUgbGluayBpbnNpZGUgdGhlIGZlbmNlZCBjb2RlIGJsb2NrIG11c3QgTk9UIGJlIHJld3JpdHRlbi5cblx0XHRcdGFzc2VydC5vayh2YWx1ZS5pbmNsdWRlcygnW2Zha2VdKGZpbGU6Ly8vYi50cyknKSk7XG5cdFx0XHRhc3NlcnQub2soIXZhbHVlLmluY2x1ZGVzKCdbZmFrZV0odnNjb2RlLWFnZW50LWhvc3QnKSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXJrZG93biBsaW5rIHN5bnRheCBpbnNpZGUgaW5saW5lIGNvZGUgc3BhbnMgaXMgcHJlc2VydmVkIHZlcmJhdGltJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW5wdXQgPSAnUmVhbCBbb25lXShmaWxlOi8vL2EudHMpIGFuZCBsaXRlcmFsIGBbdHdvXShmaWxlOi8vL2IudHMpYCBoZXJlLic7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKGlucHV0LCAnbXktaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLFxuXHRcdFx0XHQnUmVhbCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYS50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCkgYW5kIGxpdGVyYWwgYFt0d29dKGZpbGU6Ly8vYi50cylgIGhlcmUuJ1xuXHRcdFx0KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBsYWJlbCBhbmQgdGFncyB2c2NvZGVMaW5rVHlwZT1za2lsbCBmb3IgU0tJTEwubWQgbGlua3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKCdMb2FkZWQgW3BsYW5dKGZpbGU6Ly8vYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQpIGFuZCBbb3RoZXJdKGZpbGU6Ly8vYWJzL3JlcG8vZm9vLnRzKS4nLCAnbXktaG9zdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHZhbHVlLFxuXHRcdFx0XHQnTG9hZGVkIFtwbGFuXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYWJzL3JlcG8vc2tpbGxzL3BsYW4vU0tJTEwubWQ/X2FoJTNEZXlKelkyaGxiV1VpT2lKbWFXeGxJbjAlMjZ2c2NvZGVMaW5rVHlwZSUzRHNraWxsKSAnICtcblx0XHRcdFx0J2FuZCBbXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYWJzL3JlcG8vZm9vLnRzP19haCUzRGV5SnpZMmhsYldVaU9pSm1hV3hsSW4wKS4nXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGFsdCB0ZXh0IGZvciBpbWFnZSB0b2tlbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB2YWx1ZSA9IHJld3JpdGVNYXJrZG93bkxpbmtzKCdTZWUgIVtkaWFncmFtXShmaWxlOi8vL2EvYi5wbmcpLicsICdteS1ob3N0Jyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdTZWUgIVtkaWFncmFtXSh2c2NvZGUtYWdlbnQtaG9zdDovL215LWhvc3QvYS9iLnBuZz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCkuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdlcnJvciB0dXJuIHByb2R1Y2VzIGVycm9yIGRldGFpbHMgaW4gaGlzdG9yeScsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0c3RhdGU6IFR1cm5TdGF0ZS5FcnJvcixcblx0XHRcdFx0ZXJyb3I6IHsgZXJyb3JUeXBlOiAndGVzdCcsIG1lc3NhZ2U6ICdib29tJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS5lcnJvckRldGFpbHM/Lm1lc3NhZ2UsICdFcnJvcjogKHRlc3QpIGJvb20nKTtcblx0XHRcdGFzc2VydC5vayghcmVzcG9uc2UucGFydHMuc29tZShwID0+IHAua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgKHAgYXMgSUNoYXRNYXJrZG93bkNvbnRlbnQpLmNvbnRlbnQudmFsdWUuaW5jbHVkZXMoJ2Jvb20nKSksICdFcnJvciBzaG91bGQgbm90IGJlIGR1cGxpY2F0ZWQgYXMgYSBtYXJrZG93biBwYXJ0Jyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmb3J3YXJkZWQgcXVvdGEgZXJyb3IgdHVybiBwcm9kdWNlcyBxdW90YS1leGNlZWRlZCBlcnJvciBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRzdGF0ZTogVHVyblN0YXRlLkVycm9yLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGVycm9yVHlwZTogJ3F1b3RhJyxcblx0XHRcdFx0XHRtZXNzYWdlOiAncmF3Jyxcblx0XHRcdFx0XHRfbWV0YTogeyBjaGF0RXJyb3I6IHsgZmV0Y2hFcnJvcjogeyB0eXBlOiAncXVvdGFFeGNlZWRlZCcsIGNhcGlFcnJvcjogeyBjb2RlOiAncXVvdGFfZXhjZWVkZWQnIH0gfSB9IH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLmVycm9yRGV0YWlscz8uaXNRdW90YUV4Y2VlZGVkLCB0cnVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhaWxlZCB0b29sIGluIGhpc3RvcnkgaGFzIGV4aXRDb2RlIDEnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ2JhZC1jb21tYW5kJyxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3QyJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2Vycm9yJyB9LFxuXHRcdFx0XHRcdFx0XSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0XHRcdH0pXG5cdFx0XHRcdH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblxuXHRcdFx0YXNzZXJ0Lm9rKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZTogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZS5leGl0Q29kZSwgMSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZWFyY2ggdG9vbCBpbiBoaXN0b3J5IGtlZXBzIHNlYXJjaCByZW5kZXJpbmcgd2l0aG91dCBnZW5lcmljIGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRcdFx0XHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcImFjdGl2YXRpb25cIn0nLFxuXHRcdFx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdmb3VuZCByZXN1bHRzJyB9XSxcblx0XHRcdFx0XHR9KVxuXHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzZWFyY2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnJlc3VsdERldGFpbHMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uJywgKCkgPT4ge1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBDaGF0VG9vbEludm9jYXRpb24gZm9yIHJ1bm5pbmcgdG9vbCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy00MicsXG5cdFx0XHRcdHRvb2xOYW1lOiAnbXlfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnTXkgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRG9pbmcgc3R1ZmYnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbENhbGxJZCwgJ3RjLTQyJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sSWQsICdteV90b29sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zb3VyY2UsIFRvb2xEYXRhU291cmNlLkludGVybmFsKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlbmRlcnMgYXNrLXVzZXIgdG9vbHMgYXMgd2FpdGluZyBwcm9ncmVzcyB0aGF0IGhpZGVzIGFmdGVyIGNvbXBsZXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sTmFtZXMgPSBbJ2Fza191c2VyJywgJ0Fza1VzZXJRdWVzdGlvbicsICdyZXF1ZXN0X3VzZXJfaW5wdXQnXTtcblx0XHRcdGNvbnN0IGxpdmUgPSB0b29sTmFtZXMubWFwKHRvb2xOYW1lID0+IHtcblx0XHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24oY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHRvb2xOYW1lIH0pKTtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRtZXNzYWdlOiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogaW52b2NhdGlvbi5wcmVzZW50YXRpb24sXG5cdFx0XHRcdH07XG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IHJlc3RvcmVkID0gY29tcGxldGVkVG9vbENhbGxUb1NlcmlhbGl6ZWQoY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoeyB0b29sTmFtZTogJ2Fza191c2VyJyB9KSwgdW5kZWZpbmVkLCBVUkkuZmlsZSgnLycpLCAnbG9jYWwnKTtcblx0XHRcdGNvbnN0IGZhaWxlZCA9IGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkKGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHsgdG9vbE5hbWU6ICdhc2tfdXNlcicsIHN1Y2Nlc3M6IGZhbHNlIH0pLCB1bmRlZmluZWQsIFVSSS5maWxlKCcvJyksICdsb2NhbCcpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHsgbGl2ZSwgcmVzdG9yZWRQcmVzZW50YXRpb246IHJlc3RvcmVkLnByZXNlbnRhdGlvbiwgZmFpbGVkUHJlc2VudGF0aW9uOiBmYWlsZWQucHJlc2VudGF0aW9uIH0sIHtcblx0XHRcdFx0bGl2ZTogdG9vbE5hbWVzLm1hcCgoKSA9PiAoe1xuXHRcdFx0XHRcdG1lc3NhZ2U6ICdXYWl0aW5nIGZvciBhbnN3ZXIuLi4nLFxuXHRcdFx0XHRcdHByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSxcblx0XHRcdFx0fSkpLFxuXHRcdFx0XHRyZXN0b3JlZFByZXNlbnRhdGlvbjogVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSxcblx0XHRcdFx0ZmFpbGVkUHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ21hcmtzIEFnZW50IEhvc3QgaW5wdXQgcmVxdWVzdHMgZm9yIGNvbnZlcnNhdGlvbmFsIGFuc3dlciByZW5kZXJpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjYXJvdXNlbCA9IGNyZWF0ZUlucHV0UmVxdWVzdENhcm91c2VsKHtcblx0XHRcdFx0aWQ6ICdpbnB1dC0xJyxcblx0XHRcdFx0cXVlc3Rpb25zOiBbe1xuXHRcdFx0XHRcdGlkOiAncTEnLFxuXHRcdFx0XHRcdGtpbmQ6IENoYXRJbnB1dFF1ZXN0aW9uS2luZC5TaW5nbGVTZWxlY3QsXG5cdFx0XHRcdFx0bWVzc2FnZTogJ0Nob29zZSBvbmUnLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFt7IGlkOiAnYScsIGxhYmVsOiAnT3B0aW9uIEEnIH1dLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0sICdsb2NhbCcpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoY2Fyb3VzZWwuYW5zd2VyUHJlc2VudGF0aW9uLCAnY29udmVyc2F0aW9uJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdhdHRhY2hlcyBhdXRvbWF0aW9uIHJlc3VsdCBkYXRhIHRvIGxpdmUgYW5kIHJlc3RvcmVkIGNvbmZpZ3VyZUF1dG9tYXRpb24gY2FsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdID0gW3tcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsXG5cdFx0XHRcdHRleHQ6IEpTT04uc3RyaW5naWZ5KHtcblx0XHRcdFx0XHRzdGF0dXM6ICdjcmVhdGVkJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uOiB7IGlkOiAnYXV0b21hdGlvbi0xJywgbmFtZTogJ01vcm5pbmcgcmV2aWV3JyB9LFxuXHRcdFx0XHR9KSxcblx0XHRcdH1dO1xuXHRcdFx0Y29uc3QgY29tcGxldGVkID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAnYXV0b21hdGlvbi1jYWxsJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdjb25maWd1cmVBdXRvbWF0aW9uJyxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgcmVzdG9yZWQgPSBjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZChjb21wbGV0ZWQsIHVuZGVmaW5lZCwgVVJJLmZpbGUoJy8nKSwgJ2xvY2FsJyk7XG5cdFx0XHRjb25zdCBsaXZlID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ2F1dG9tYXRpb24tY2FsbCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAnY29uZmlndXJlQXV0b21hdGlvbicsXG5cdFx0XHR9KSk7XG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGxpdmUsIGNvbXBsZXRlZCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRyZXN0b3JlZDogcmVzdG9yZWQudG9vbFNwZWNpZmljRGF0YSxcblx0XHRcdFx0bGl2ZTogbGl2ZS50b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fSwge1xuXHRcdFx0XHRyZXN0b3JlZDoge1xuXHRcdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdFx0bGl2ZToge1xuXHRcdFx0XHRcdGtpbmQ6ICdhdXRvbWF0aW9uQ29uZmlndXJlZCcsXG5cdFx0XHRcdFx0YXV0b21hdGlvbklkOiAnYXV0b21hdGlvbi0xJyxcblx0XHRcdFx0XHRhdXRvbWF0aW9uTmFtZTogJ01vcm5pbmcgcmV2aWV3Jyxcblx0XHRcdFx0XHRvcGVyYXRpb246ICdjcmVhdGVkJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVwcmVzZW50cyBhbm90aGVyIGNsaWVudCB0b29sIHdpdGhvdXQgc3VyZmFjaW5nIGl0cyBjb25maXJtYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbDogVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1vdGhlci1jbGllbnQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3J1bl90YXNrJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gVGFzaycsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIHRhc2snLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0YXNrXCI6XCJidWlsZFwifScsXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQWxsb3cgUnVuIFRhc2s/Jyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnQsIGNsaWVudElkOiAnb3duZXItY2xpZW50JyB9LFxuXHRcdFx0fTtcblx0XHRcdGxldCBjYW5jZWxsZWRUb29sQ2FsbElkOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRvb2xDYWxsLCB1bmRlZmluZWQsIHtcblx0XHRcdFx0Y3VycmVudENsaWVudElkOiAndmlld2VyLWNsaWVudCcsXG5cdFx0XHRcdGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6IHRvb2xDYWxsID0+IGNhbmNlbGxlZFRvb2xDYWxsSWQgPSB0b29sQ2FsbC50b29sQ2FsbElkLFxuXHRcdFx0fSk7XG5cdFx0XHRpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGw/LmNhbmNlbCgpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0bWVzc2FnZTogaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0c3RhdGU6IGludm9jYXRpb24uc3RhdGUuZ2V0KCkudHlwZSxcblx0XHRcdFx0aGFzT3RoZXJDbGllbnREYXRhOiAhIWludm9jYXRpb24ub3RoZXJDbGllbnRUb29sQ2FsbCxcblx0XHRcdFx0Y2FuY2VsbGVkVG9vbENhbGxJZCxcblx0XHRcdH0sIHtcblx0XHRcdFx0bWVzc2FnZTogJ1J1bm5pbmcgUnVuIFRhc2sgb24gYW5vdGhlciBjbGllbnQuLi4nLFxuXHRcdFx0XHRzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuRXhlY3V0aW5nLFxuXHRcdFx0XHRoYXNPdGhlckNsaWVudERhdGE6IHRydWUsXG5cdFx0XHRcdGNhbmNlbGxlZFRvb2xDYWxsSWQ6ICd0Yy1vdGhlci1jbGllbnQnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdjcmVhdGVzIGF1dGhlbnRpY2F0aW9uLXJlcXVpcmVkIGludm9jYXRpb24gZm9yIGFuIE1DUCB0b29sIGNhbGwnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcmF3VG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdC4uLmNyZWF0ZVRvb2xDYWxsU3RhdGUoKSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnbWNwLTEnIH0sXG5cdFx0XHRcdGF1dGg6IHtcblx0XHRcdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5JbnN1ZmZpY2llbnRTY29wZSxcblx0XHRcdFx0XHRvYXV0aENsaWVudDoge1xuXHRcdFx0XHRcdFx0Y2xpZW50SWQ6ICdjb25maWd1cmVkLWNsaWVudC1pZCcsXG5cdFx0XHRcdFx0XHRjbGllbnRTZWNyZXQ6ICdjb25maWd1cmVkLWNsaWVudC1zZWNyZXQnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVzb3VyY2U6IHtcblx0XHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdFx0cmVzb3VyY2VfbmFtZTogJ0V4YW1wbGUgTUNQJyxcblx0XHRcdFx0XHRcdGF1dGhvcml6YXRpb25fc2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0XHRcdHNjb3Blc19zdXBwb3J0ZWQ6IFsncmVwbyddLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0cmVxdWlyZWRTY29wZXM6IFsncmVwbyddLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSwgdW5kZWZpbmVkLCBVUkkucGFyc2UoJ2FnZW50LWhvc3QtY29waWxvdDovL2JhY2tlbmQvc2Vzc2lvbicpLCAncmVtb3RlJywgJ2Zyb250ZW5kJyk7XG5cblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQXV0aGVudGljYXRpb24pO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JBdXRoZW50aWNhdGlvbikge1xuXHRcdFx0XHRhc3NlcnQuZmFpbCgnRXhwZWN0ZWQgYXV0aGVudGljYXRpb24tcmVxdWlyZWQgc3RhdGUnKTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IHsgY2FuY2VsLCAuLi5zdGF0ZVdpdGhvdXRDYW5jZWwgfSA9IHN0YXRlO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBjYW5jZWwsICdmdW5jdGlvbicpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChzdGF0ZVdpdGhvdXRDYW5jZWwsIHtcblx0XHRcdFx0dHlwZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uLFxuXHRcdFx0XHRjb25maXJtZWQ6IHsgdHlwZTogVG9vbENvbmZpcm1LaW5kLkNvbmZpcm1hdGlvbk5vdE5lZWRlZCwgcmVhc29uOiB1bmRlZmluZWQgfSxcblx0XHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0XHRzZXJ2ZXI6IHtcblx0XHRcdFx0XHRpZDogJ2Zyb250ZW5kL21jcC0xJyxcblx0XHRcdFx0XHRuYW1lOiAnRXhhbXBsZSBNQ1AnLFxuXHRcdFx0XHRcdHJlc291cmNlOiAnaHR0cHM6Ly9tY3AuZXhhbXBsZS5jb20nLFxuXHRcdFx0XHRcdG9hdXRoQ2xpZW50OiB7XG5cdFx0XHRcdFx0XHRjbGllbnRJZDogJ2NvbmZpZ3VyZWQtY2xpZW50LWlkJyxcblx0XHRcdFx0XHRcdGNsaWVudFNlY3JldDogJ2NvbmZpZ3VyZWQtY2xpZW50LXNlY3JldCcsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRhdXRob3JpemF0aW9uU2VydmVyczogWydodHRwczovL2F1dGguZXhhbXBsZS5jb20nXSxcblx0XHRcdFx0XHRzdXBwb3J0ZWRTY29wZXM6IFsncmVwbyddLFxuXHRcdFx0XHRcdHJlcXVpcmVkU2NvcGVzOiBbJ3JlcG8nXSxcblx0XHRcdFx0XHRyZWFzb246IE1jcEF1dGhSZXF1aXJlZFJlYXNvbi5JbnN1ZmZpY2llbnRTY29wZSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0aW52b2NhdGlvbi5zZXRBdXRoZW50aWNhdGlvblJlc29sdmVkKCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2V0cyB0ZXJtaW5hbCB0b29sU3BlY2lmaWNEYXRhIHdoZW4gY29udGVudCBoYXMgdGVybWluYWwgYmxvY2snLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICdscyAtbGEnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3QzJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLmNvbW1hbmRMaW5lLm9yaWdpbmFsLCAnbHMgLWxhJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgZm9yIGJ1aWx0LWluIGJhc2ggdmlhIF9tZXRhLnRvb2xLaW5kIChubyBUZXJtaW5hbCBjb250ZW50IGJsb2NrKScsICgpID0+IHtcblx0XHRcdC8vIFRoZSBTREsncyBidWlsdC1pbiBiYXNoIHRvb2wgKHVzZWQgd2hlbiB0aGUgQ3VzdG9tIFRlcm1pbmFsIHRvb2xcblx0XHRcdC8vIGlzIGRpc2FibGVkKSBydW5zIG91dHNpZGUgQUhQJ3MgdGVybWluYWwgaW5mcmEgYW5kIGRvZXMgbm90IGVtaXRcblx0XHRcdC8vIGEgVGVybWluYWwgY29udGVudCBibG9jay4gVGhlIHRlcm1pbmFsIHBpbGwgbXVzdCBzdGlsbCByZW5kZXIgc29cblx0XHRcdC8vIHRoZSB1c2VyIGNhbiBleHBhbmQgdGhlIGZ1bGwgbXVsdGktbGluZSBjb21tYW5kIGFuZCBvdXRwdXQuXG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBTaGVsbCBDb21tYW5kJyxcblx0XHRcdFx0dG9vbElucHV0OiAnbHMgLWxhXFxud2MgLWwnLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgY29tbWFuZExpbmU6IHsgb3JpZ2luYWw6IHN0cmluZyB9OyBsYW5ndWFnZT86IHN0cmluZzsgdGVybWluYWxUb29sU2Vzc2lvbklkPzogc3RyaW5nOyB0ZXJtaW5hbENvbW1hbmRVcmk/OiBVUkkgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCwgJ2xzIC1sYVxcbndjIC1sJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEubGFuZ3VhZ2UsICdzaGVsbHNjcmlwdCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCwgdW5kZWZpbmVkLCAnbm8gQUhQIHRlcm1pbmFsIHNlc3Npb24gZm9yIGJ1aWx0LWluIGJhc2gnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmksIHVuZGVmaW5lZCwgJ25vIEFIUCB0ZXJtaW5hbCBVUkkgZm9yIGJ1aWx0LWluIGJhc2gnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2J1aWx0LWluIGJhc2ggdGVybWluYWwgdG9vbFNwZWNpZmljRGF0YSBwaWNrcyB1cCBzdHJlYW1pbmcgdGV4dCBvdXRwdXQgKHJ1bm5pbmcpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoaVxcbicgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kT3V0cHV0PzogeyB0ZXh0OiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCwgJ2hpXFxyXFxuJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCByZW5kZXIgdGVybWluYWwgcGlsbCBmb3IgdGVybWluYWwgdG9vbEtpbmQgd2l0aG91dCBhIGNvbW1hbmQgKGZhbGxzIGJhY2sgdG8gaW52b2NhdGlvbk1lc3NhZ2UpJywgKCkgPT4ge1xuXHRcdFx0Ly8gVGhlIGJ1aWx0LWluIGJhc2ggdG9vbCBhZHZlcnRpc2VzIGBfbWV0YS50b29sS2luZCA9PT0gJ3Rlcm1pbmFsJ2Bcblx0XHRcdC8vIGZyb20gdGhlIHRvb2wtb3BlbiBzZWFtLCBidXQgdGhlIGNvbW1hbmQgb25seSBhcnJpdmVzIG9uY2UgdGhlXG5cdFx0XHQvLyB0b29sIGlucHV0IGhhcyBzdHJlYW1lZCBpbi4gVW50aWwgdGhlbiB0aGVyZSBpcyBub3RoaW5nIHRvIHNob3cgaW5cblx0XHRcdC8vIHRoZSB0ZXJtaW5hbCBwaWxsLCBzbyB3ZSBtdXN0IGZhbGwgYmFjayB0byB0aGUgZ2VuZXJpYyB0b29sIHdpZGdldFxuXHRcdFx0Ly8gKHRoZSBgaW52b2NhdGlvbk1lc3NhZ2VgKSByYXRoZXIgdGhhbiByZW5kZXJpbmcgYW4gZW1wdHkgY29tbWFuZC5cblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBzaGVsbCBjb21tYW5kJyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHVuZGVmaW5lZCwgJ25vIHRlcm1pbmFsIHBpbGwgd2l0aG91dCBhIGNvbW1hbmQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLCAnUnVubmluZyBzaGVsbCBjb21tYW5kJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBfbWV0YSBmb3Igc3ViYWdlbnQgdG9vbEtpbmQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ1JldmlldyBjb2RlJywgc3ViYWdlbnRBZ2VudE5hbWU6ICdjb2RlLXJldmlld2VyJyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAnc3ViYWdlbnQnKTtcblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uLCAnUmV2aWV3IGNvZGUnKTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUsICdjb2RlLXJldmlld2VyJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdzZXRzIE1DUCBBcHAgdG9vbFNwZWNpZmljRGF0YSBmb3IgcnVubmluZyBNQ1AgdG9vbCBjYWxscycsICgpID0+IHtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJ0b3BpY1wiOlwibWV0YWRhdGFcIn0nLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2RvY3MtY3VzdG9taXphdGlvbicgfSxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdpbnB1dCcsXG5cdFx0XHRcdHJhd0lucHV0OiB7IHRvcGljOiAnbWV0YWRhdGEnIH0sXG5cdFx0XHRcdG1jcEFwcERhdGE6IHtcblx0XHRcdFx0XHRraW5kOiAnYWdlbnRIb3N0Jyxcblx0XHRcdFx0XHRyZXNvdXJjZVVyaTogJ3VpOi8vZG9jcy9hcHAnLFxuXHRcdFx0XHRcdHNlcnZlcklkOiAnZG9jcy1jdXN0b21pemF0aW9uJyxcblx0XHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC90ZXN0LXNlc3Npb24tMS9kb2NzJyxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3Qgc2V0IE1DUCBBcHAgdG9vbFNwZWNpZmljRGF0YSBmb3IgYSBzdHJlYW1pbmcgTUNQIHRvb2wgY2FsbCcsICgpID0+IHtcblx0XHRcdC8vIEEgYFN0cmVhbWluZ2AgY2FsbCBpcyBjcmVhdGVkIGluIHRoZSBVSSdzIGBFeGVjdXRpbmdgIHN0YXRlIGJlZm9yZVxuXHRcdFx0Ly8gaXQgbWF5IHRyYW5zaXRpb24gdG8gY29uZmlybWF0aW9uLCBzbyB0aGUgQXBwIG11c3Qgbm90IG1vdW50IHlldC5cblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLFxuXHRcdFx0XHRjb250cmlidXRvcjogeyBraW5kOiBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5NQ1AsIGN1c3RvbWl6YXRpb25JZDogJ2RvY3MtY3VzdG9taXphdGlvbicgfSxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR1aToge1xuXHRcdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3N5bnRoZXNpemVzIHN1YmFnZW50IGNoYXRSZXNvdXJjZSBmcm9tIHRoZSB0b29sIGNhbGwgaWQgd2hlbiBubyBkaXNjb3ZlcnkgY29udGVudCBibG9jayBpcyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0Ly8gQSBiYWNrZ3JvdW5kIHN1YmFnZW50J3MgYHN1YmFnZW50X3N0YXJ0ZWRgIGNhbiBhcnJpdmUgYWZ0ZXIgaXRzXG5cdFx0XHQvLyBzcGF3bmluZyB0b29sIGNhbGwgaGFzIGFscmVhZHkgY29tcGxldGVkLCBzbyB0aGUgcnVubmluZy1vbmx5XG5cdFx0XHQvLyBkaXNjb3ZlcnkgY29udGVudCB1cGRhdGUgaXMgZHJvcHBlZCBhbmQgdGhlIGNoaWxkIGNoYXQgcmVzb3VyY2Vcblx0XHRcdC8vIG5ldmVyIGxhbmRzIG9uIHRoZSB0b29sIGNhbGwuIFRoZSBjaGF0IHJlc291cmNlIG11c3Qgc3RpbGwgYmVcblx0XHRcdC8vIGRlcml2YWJsZSBmcm9tIHRoZSBzZXNzaW9uICsgdG9vbCBjYWxsIGlkIHNvIHRoZSBpbmxpbmUgc3ViYWdlbnRcblx0XHRcdC8vIHBpbGwgcmVtYWlucyBsaW5rYWJsZS5cblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnTWFwIGF1eCBiYXIgKyBlZGl0b3IgcGFydCBjcmVhdGlvbicgfSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnc3ViYWdlbnQnKTtcblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5jaGF0UmVzb3VyY2UsIGJ1aWxkU3ViYWdlbnRDaGF0VXJpKFVSSS5maWxlKCcvJykudG9TdHJpbmcoKSwgJ3RjLTEnKSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdvYnNlcnZlcyBvbmx5IGZhaWxlZCBzdWJhZ2VudCB0b29scyB0aGF0IHByb2R1Y2VkIGEgY2hpbGQgY2hhdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHN1YmFnZW50Q29udGVudDogVG9vbFJlc3VsdENvbnRlbnQgPSB7XG5cdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0cmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L3Nlc3Npb24vdGMtMScsXG5cdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScsXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0cnVubmluZzogc2hvdWxkT2JzZXJ2ZVN1YmFnZW50Q2hhdChjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICd0YXNrJyB9KSksXG5cdFx0XHRcdGNvbXBsZXRlZDogc2hvdWxkT2JzZXJ2ZVN1YmFnZW50Q2hhdChjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7IHRvb2xOYW1lOiAndGFzaycgfSkpLFxuXHRcdFx0XHRmYWlsZWRXaXRob3V0Q2hpbGQ6IHNob3VsZE9ic2VydmVTdWJhZ2VudENoYXQoY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoeyB0b29sTmFtZTogJ3Rhc2snLCBzdWNjZXNzOiBmYWxzZSB9KSksXG5cdFx0XHRcdGZhaWxlZFdpdGhDaGlsZDogc2hvdWxkT2JzZXJ2ZVN1YmFnZW50Q2hhdChjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7IHRvb2xOYW1lOiAndGFzaycsIHN1Y2Nlc3M6IGZhbHNlLCBjb250ZW50OiBbc3ViYWdlbnRDb250ZW50XSB9KSksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHJ1bm5pbmc6IHRydWUsXG5cdFx0XHRcdGNvbXBsZXRlZDogdHJ1ZSxcblx0XHRcdFx0ZmFpbGVkV2l0aG91dENoaWxkOiBmYWxzZSxcblx0XHRcdFx0ZmFpbGVkV2l0aENoaWxkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdwcmVmZXJzIHRoZSBob3N0LXN0YW1wZWQgX21ldGEuc3ViYWdlbnRDaGF0VXJpIG92ZXIgYSBkaXNjb3ZlcnkgY29udGVudCBibG9jayByZXNvdXJjZScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudENoYXRVcmk6ICdhaHAtY2hhdDovL3N1YmFnZW50L3N0YW1wZWQvdGMtMScgfSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdhaHAtY2hhdDovL3N1YmFnZW50L2Rpc2NvdmVyeS90Yy0xJyxcblx0XHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY2hhdFJlc291cmNlLCAnYWhwLWNoYXQ6Ly9zdWJhZ2VudC9zdGFtcGVkL3RjLTEnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Bhc3NlcyBzdWJBZ2VudEludm9jYXRpb25JZCB0byBDaGF0VG9vbEludm9jYXRpb24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe30pO1xuXG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YywgJ3BhcmVudC10Yy00MicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWQsICdwYXJlbnQtdGMtNDInKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FkZENvbW1lbnQgcmVmZXJlbmNlJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgY29tbWVudFJhbmdlID0geyBzdGFydExpbmVOdW1iZXI6IDMsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAzLCBlbmRDb2x1bW46IDUgfTtcblxuXHRcdGZ1bmN0aW9uIGFkZENvbW1lbnRJbnB1dCh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRcdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHsgcmVzb3VyY2VVcmk6ICdmaWxlOi8vL3dvcmtzcGFjZS9hLnRzJywgcmFuZ2U6IGNvbW1lbnRSYW5nZSwgdGV4dCB9KTtcblx0XHR9XG5cblx0XHRmdW5jdGlvbiBtYXJrZG93bihtZXNzYWdlOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQpOiBJTWFya2Rvd25TdHJpbmcge1xuXHRcdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UgJiYgdHlwZW9mIG1lc3NhZ2UgIT09ICdzdHJpbmcnLCAnZXhwZWN0ZWQgYSBtYXJrZG93biByZWZlcmVuY2UnKTtcblx0XHRcdHJldHVybiBtZXNzYWdlO1xuXHRcdH1cblxuXHRcdHRlc3QoJ3JlbmRlcnMgdG9vbCBuYW1lLCB0cnVuY2F0ZWQgcXVvdGVkIHByZXZpZXcgYW5kIGEgcmV2ZWFsIGNvbW1hbmQgbGluaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHRvb2xOYW1lOiAnYWRkQ29tbWVudCcsIGludm9jYXRpb25NZXNzYWdlOiAnQWRkaW5nIGNvbW1lbnQnLCB0b29sSW5wdXQ6IGFkZENvbW1lbnRJbnB1dCgnVGhpcyBjb21tZW50IGlzIHF1aXRlIGxvbmcgYW5kIHNob3VsZCBiZSB0cnVuY2F0ZWQnKSB9KTtcblx0XHRcdGNvbnN0IG1lc3NhZ2UgPSBtYXJrZG93bih0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKS5pbnZvY2F0aW9uTWVzc2FnZSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoXG5cdFx0XHRcdHtcblx0XHRcdFx0XHR2YWx1ZTogbWVzc2FnZS52YWx1ZSxcblx0XHRcdFx0XHRzdXBwb3J0VGhlbWVJY29uczogbWVzc2FnZS5zdXBwb3J0VGhlbWVJY29ucyxcblx0XHRcdFx0XHRpc1RydXN0ZWQ6IG1lc3NhZ2UuaXNUcnVzdGVkLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dmFsdWU6IGBbYWRkQ29tbWVudCBcIlRoaXMgY29tbWVudCBpcyBxdWl0ZSBsb25nIGFuZCBzaG91bGQgYmVcdTIwMjZcIl0oY29tbWFuZDpfYWdlbnRGZWVkYmFja1Jldmlldy5yZXZlYWxBdD8ke2VuY29kZVVSSUNvbXBvbmVudChKU09OLnN0cmluZ2lmeShbJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHMnLCBjb21tZW50UmFuZ2VdKSl9KWAsXG5cdFx0XHRcdFx0c3VwcG9ydFRoZW1lSWNvbnM6IHRydWUsXG5cdFx0XHRcdFx0aXNUcnVzdGVkOiB7IGVuYWJsZWRDb21tYW5kczogWydfYWdlbnRGZWVkYmFja1Jldmlldy5yZXZlYWxBdCddIH0sXG5cdFx0XHRcdH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdHJ1bmNhdGUgYSBzaG9ydCBjb21tZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogYWRkQ29tbWVudElucHV0KCdTaG9ydCBub3RlJykgfSk7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gbWFya2Rvd24odG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YykuaW52b2NhdGlvbk1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0Lm9rKG1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ2FkZENvbW1lbnQgXCJTaG9ydCBub3RlXCInKSwgbWVzc2FnZS52YWx1ZSk7XG5cdFx0XHRhc3NlcnQub2soIW1lc3NhZ2UudmFsdWUuaW5jbHVkZXMoJ1x1MjAyNicpLCBtZXNzYWdlLnZhbHVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NldHMgdGhlIHNhbWUgcmVmZXJlbmNlIGFzIHRoZSBwYXN0LXRlbnNlIG1lc3NhZ2Ugb24gY29tcGxldGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJ1bm5pbmcgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogYWRkQ29tbWVudElucHV0KCdTaG9ydCBub3RlJykgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihydW5uaW5nKTtcblx0XHRcdGNvbnN0IGNvbXBsZXRlZCA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgdG9vbElucHV0OiBhZGRDb21tZW50SW5wdXQoJ1Nob3J0IG5vdGUnKSwgcGFzdFRlbnNlTWVzc2FnZTogJ0FkZGVkIGNvbW1lbnQnIH0pO1xuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCBjb21wbGV0ZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKG1hcmtkb3duKGludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSkudmFsdWUsIG1hcmtkb3duKGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UpLnZhbHVlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHNlcnZlciBtZXNzYWdlIHdoZW4gdGhlIGlucHV0IGNhbm5vdCBiZSBwYXJzZWQnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyB0b29sTmFtZTogJ2FkZENvbW1lbnQnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ0FkZGluZyBjb21tZW50JywgdG9vbElucHV0OiAnbm90IGpzb24nIH0pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpLmludm9jYXRpb25NZXNzYWdlLCAnQWRkaW5nIGNvbW1lbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZhbGxzIGJhY2sgdG8gdGhlIHNlcnZlciBtZXNzYWdlIHdoZW4gdGhlIHJhbmdlIGlzIG5vdCBhIHZhbGlkIDEtYmFzZWQgcmFuZ2UnLCAoKSA9PiB7XG5cdFx0XHRmb3IgKGNvbnN0IHJhbmdlIG9mIFtcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDAsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdFx0eyBzdGFydExpbmVOdW1iZXI6IDEsIHN0YXJ0Q29sdW1uOiAxLjUsIGVuZExpbmVOdW1iZXI6IDEsIGVuZENvbHVtbjogMiB9LFxuXHRcdFx0XHR7IHN0YXJ0TGluZU51bWJlcjogLTEsIHN0YXJ0Q29sdW1uOiAxLCBlbmRMaW5lTnVtYmVyOiAxLCBlbmRDb2x1bW46IDEgfSxcblx0XHRcdF0pIHtcblx0XHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgdG9vbE5hbWU6ICdhZGRDb21tZW50JywgaW52b2NhdGlvbk1lc3NhZ2U6ICdBZGRpbmcgY29tbWVudCcsIHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyByZXNvdXJjZVVyaTogJ2ZpbGU6Ly8vd29ya3NwYWNlL2EudHMnLCByYW5nZSwgdGV4dDogJ2hpJyB9KSB9KTtcblx0XHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpLmludm9jYXRpb25NZXNzYWdlLCAnQWRkaW5nIGNvbW1lbnQnLCBKU09OLnN0cmluZ2lmeShyYW5nZSkpO1xuXHRcdFx0fVxuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgnc3RyZWFtaW5nIHRvb2wgaW52b2NhdGlvbnMgKCMzMTQ4NTgpJywgKCkgPT4ge1xuXG5cdFx0dHlwZSBBbnlUb29sQ2FsbFN0YXRlID0gUGFyYW1ldGVyczx0eXBlb2YgcmF3VG9vbENhbGxTdGF0ZVRvUHJlcGFyZWRJbnZvY2F0aW9uPlswXTtcblxuXHRcdHRlc3QoJ3Rvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24gc3RhcnRzIGluIHRoZSBuYXRpdmUgU3RyZWFtaW5nIHN0YXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGM6IEFueVRvb2xDYWxsU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdHJlYW0nLFxuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0cGFydGlhbElucHV0OiAne1wiY29tbWFuZFwiOlwibnBtIHRlc3RcIixcImRlc2NyaXB0aW9uXCI6XCJSdW4nLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgbnBtIHRlc3QnLFxuXHRcdFx0fTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHRjLCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0YXRlLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZyk7XG5cdFx0XHRpZiAoc3RhdGUudHlwZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHR0b29sQ2FsbElkOiBpbnZvY2F0aW9uLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xJZDogaW52b2NhdGlvbi50b29sSWQsXG5cdFx0XHRcdHBhcnRpYWxJbnB1dDogc3RhdGUucGFydGlhbElucHV0LmdldCgpLFxuXHRcdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiBzdGF0ZS5zdHJlYW1pbmdNZXNzYWdlLmdldCgpLFxuXHRcdFx0XHRpc0NvbXBsZXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUoaW52b2NhdGlvbiksXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1zdHJlYW0nLFxuXHRcdFx0XHR0b29sSWQ6ICdiYXNoJyxcblx0XHRcdFx0cGFydGlhbElucHV0OiB7IGNvbW1hbmQ6ICducG0gdGVzdCcsIGRlc2NyaXB0aW9uOiAnUnVuJyB9LFxuXHRcdFx0XHRzdHJlYW1pbmdNZXNzYWdlOiAnUnVubmluZyBucG0gdGVzdCcsXG5cdFx0XHRcdGlzQ29tcGxldGU6IGZhbHNlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uIGRlZmVycyBwYXJ0aWFsIGlucHV0IGRpc3BsYXkgZm9yIHJlYWQgdG9vbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1yZWFkLXN0cmVhbScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndmlldycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUmVhZCcsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nLFxuXHRcdFx0XHRwYXJ0aWFsSW5wdXQ6ICd7XCJwYXRoXCI6XCIvcmVwby9wYXJ0Jyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHsgbWFya2Rvd246ICdSZWFkaW5nIFtwYXJ0XShmaWxlOi8vL3JlcG8vcGFydCknIH0sXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAncmVhZCcgfSxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGUudHlwZSwgSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpIHtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlLFxuXHRcdFx0XHRwYXJ0aWFsSW5wdXQ6IHN0YXRlLnBhcnRpYWxJbnB1dC5nZXQoKSxcblx0XHRcdFx0c3RyZWFtaW5nTWVzc2FnZTogc3RhdGUuc3RyZWFtaW5nTWVzc2FnZS5nZXQoKSxcblx0XHRcdH0sIHtcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSZWFkJyxcblx0XHRcdFx0cGFydGlhbElucHV0OiB1bmRlZmluZWQsXG5cdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd1cGRhdGVTdHJlYW1pbmdUb29sSW52b2NhdGlvbiBjbGVhcnMgZWRpdCBwcm9ncmVzcyB3aGVuIGEgbGVnYWN5IHRvb2wgcmVzb2x2ZXMgdG8gcmVhZCcsICgpID0+IHtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxlZ2FjeS1yZWFkLXN0cmVhbScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnc3RyX3JlcGxhY2VfZWRpdG9yJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0cGFydGlhbElucHV0OiAne1wicGF0aFwiOlwiL3JlcG8vcGFydCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnRWRpdGluZyBbcGFydF0oZmlsZTovLy9yZXBvL3BhcnQpJyB9LFxuXHRcdFx0fSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5TdHJlYW1pbmcpO1xuXHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLlN0cmVhbWluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBiZWZvcmVTdHJlYW1pbmdNZXNzYWdlID0gc3RhdGUuc3RyZWFtaW5nTWVzc2FnZS5nZXQoKTtcblx0XHRcdGNvbnN0IGJlZm9yZSA9IHtcblx0XHRcdFx0cGFydGlhbElucHV0OiBzdGF0ZS5wYXJ0aWFsSW5wdXQuZ2V0KCksXG5cdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6IHR5cGVvZiBiZWZvcmVTdHJlYW1pbmdNZXNzYWdlID09PSAnc3RyaW5nJyA/IGJlZm9yZVN0cmVhbWluZ01lc3NhZ2UgOiBiZWZvcmVTdHJlYW1pbmdNZXNzYWdlPy52YWx1ZSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVN0cmVhbWluZ1Rvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWxlZ2FjeS1yZWFkLXN0cmVhbScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnc3RyX3JlcGxhY2VfZWRpdG9yJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0cGFydGlhbElucHV0OiAne1wiY29tbWFuZFwiOlwidmlld1wiLFwicGF0aFwiOlwiL3JlcG8vcGFydCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiB7IG1hcmtkb3duOiAnUmVhZGluZyBbcGFydF0oZmlsZTovLy9yZXBvL3BhcnQpJyB9LFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3JlYWQnIH0sXG5cdFx0XHR9LCAnJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRiZWZvcmUsXG5cdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0cGFydGlhbElucHV0OiBzdGF0ZS5wYXJ0aWFsSW5wdXQuZ2V0KCksXG5cdFx0XHRcdFx0c3RyZWFtaW5nTWVzc2FnZTogc3RhdGUuc3RyZWFtaW5nTWVzc2FnZS5nZXQoKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHtcblx0XHRcdFx0YmVmb3JlOiB7XG5cdFx0XHRcdFx0cGFydGlhbElucHV0OiB7IHBhdGg6ICcvcmVwby9wYXJ0JyB9LFxuXHRcdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6ICdFZGl0aW5nIFtwYXJ0XShmaWxlOi8vL3JlcG8vcGFydCknLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdHBhcnRpYWxJbnB1dDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHN0cmVhbWluZ01lc3NhZ2U6ICdSZWFkaW5nIGZpbGUnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uIHByZXNlcnZlcyBzdWJhZ2VudCBtZXRhZGF0YSBiZWZvcmUgcmVhZHknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzZXNzaW9uUmVzb3VyY2UgPSBVUkkucGFyc2UoJ2NvcGlsb3RjbGk6L3Nlc3Npb24tMScpO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtc3ViYWdlbnQnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0RlbGVnYXRlIFRhc2snLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHR0b29sS2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiAnUmV2aWV3IGN1cnJlbnQgYnJhbmNoJyxcblx0XHRcdFx0XHRzdWJhZ2VudEFnZW50TmFtZTogJ2NvZGUtcmV2aWV3Jyxcblx0XHRcdFx0XHRzdWJhZ2VudENoYXRVcmk6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCAndGMtc3ViYWdlbnQnKSxcblx0XHRcdFx0fSxcblx0XHRcdH0sIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCAnJyk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiAnUmV2aWV3IGN1cnJlbnQgYnJhbmNoJyxcblx0XHRcdFx0YWdlbnROYW1lOiAnY29kZS1yZXZpZXcnLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6IGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25SZXNvdXJjZS50b1N0cmluZygpLCAndGMtc3ViYWdlbnQnKSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVUb29sSW52b2NhdGlvbiBwcmVzZXJ2ZXMgY2FuY2VsbGF0aW9uIGZyb20gc3RyZWFtaW5nJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb1N0cmVhbWluZ0ludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtY2FuY2VsbGVkJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdjbGllbnRfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQ2xpZW50IFRvb2wnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdH0sIHVuZGVmaW5lZCk7XG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLWNhbmNlbGxlZCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAnY2xpZW50X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0NsaWVudCBUb29sJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjbGllbnQgdG9vbCcsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uRGVuaWVkLFxuXHRcdFx0XHRyZWFzb25NZXNzYWdlOiAnRGVuaWVkIGJ5IHRoZSBzZXJ2ZXInLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi5zdGF0ZS5nZXQoKSwge1xuXHRcdFx0XHR0eXBlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5DYW5jZWxsZWQsXG5cdFx0XHRcdHJlYXNvbjogVG9vbENvbmZpcm1LaW5kLkRlbmllZCxcblx0XHRcdFx0cmVhc29uTWVzc2FnZTogJ0RlbmllZCBieSB0aGUgc2VydmVyJyxcblx0XHRcdFx0cGFyYW1ldGVyczogdW5kZWZpbmVkLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlczogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCd0cmFuc2l0aW9uRnJvbVN0cmVhbWluZyB3aXRoIGEgcGVuZGluZyB0ZXJtaW5hbCBwcmVwYXJlZCBpbnZvY2F0aW9uIHlpZWxkcyBhIHNpbmdsZSB0ZXJtaW5hbCBjb25maXJtYXRpb24gY2FyZCcsICgpID0+IHtcblx0XHRcdC8vIEEgdGVybWluYWwgY29tbWFuZCBzdHJlYW1lZCBpdHMgYXJncywgdGhlbiByZXF1ZXN0ZWQgY29uZmlybWF0aW9uLlxuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSwgdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHBlbmRpbmc6IEFueVRvb2xDYWxsU3RhdGUgPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdCYXNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBybSAtcmYgYnVpbGRgJyxcblx0XHRcdFx0dG9vbElucHV0OiAncm0gLXJmIGJ1aWxkJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kPycsXG5cdFx0XHR9O1xuXG5cdFx0XHRjb25zdCBwcmVwYXJlZCA9IHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihwZW5kaW5nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZC5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUsICdSdW4gY29tbWFuZD8nKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChwcmVwYXJlZC50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblxuXHRcdFx0c3RyZWFtaW5nLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nKHByZXBhcmVkLCB1bmRlZmluZWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyZWFtaW5nLnN0YXRlLmdldCgpLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3RyYW5zaXRpb25Gcm9tU3RyZWFtaW5nIHdpdGggYSBub24tY29uZmlybWF0aW9uIHByZXBhcmVkIGludm9jYXRpb24gZ29lcyBzdHJhaWdodCB0byBFeGVjdXRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzdHJlYW1pbmcgPSB0b29sQ2FsbFN0YXRlVG9TdHJlYW1pbmdJbnZvY2F0aW9uKHsgdG9vbENhbGxJZDogJ3RjLXJ1bicsIHRvb2xOYW1lOiAncmVhZF9maWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB9LCB1bmRlZmluZWQpO1xuXHRcdFx0Y29uc3QgcnVubmluZzogQW55VG9vbENhbGxTdGF0ZSA9IHsgdG9vbENhbGxJZDogJ3RjLXJ1bicsIHRvb2xOYW1lOiAncmVhZF9maWxlJywgZGlzcGxheU5hbWU6ICdSZWFkIEZpbGUnLCBpbnZvY2F0aW9uTWVzc2FnZTogJ1JlYWRpbmcgZmlsZScsIHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZywgY29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQgfTtcblxuXHRcdFx0Y29uc3QgcHJlcGFyZWQgPSB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24ocnVubmluZyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocHJlcGFyZWQuY29uZmlybWF0aW9uTWVzc2FnZXMsIHVuZGVmaW5lZCk7XG5cblx0XHRcdHN0cmVhbWluZy50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyhwcmVwYXJlZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVxdWVzdENvbmZpcm1hdGlvbiByZS1hcm1zIGNvbmZpcm1hdGlvbiBmcm9tIEV4ZWN1dGluZyAoQ29waWxvdCBSdW5uaW5nIFx1MjE5MiBQZW5kaW5nQ29uZmlybWF0aW9uKScsICgpID0+IHtcblx0XHRcdC8vIFJlYWwgQ29waWxvdCBmbG93OiBvblRvb2xTdGFydCByZWFkaWVzIHRoZSB0b29sIChSdW5uaW5nL0V4ZWN1dGluZylcblx0XHRcdC8vIGJlZm9yZSB0aGUgcGVybWlzc2lvbiBjYWxsYmFjayBib3VuY2VzIGl0IHRvIFBlbmRpbmdDb25maXJtYXRpb24uXG5cdFx0XHQvLyByZXF1ZXN0Q29uZmlybWF0aW9uIG11c3QgbW92ZSB0aGUgU0FNRSBpbnZvY2F0aW9uIGJhY2sgdG9cblx0XHRcdC8vIFdhaXRpbmdGb3JDb25maXJtYXRpb24gc28gYSBzaW5nbGUgY2FyZCBzcGFucyB0aGUgbGlmZWN5Y2xlLlxuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSwgdW5kZWZpbmVkKTtcblxuXHRcdFx0Ly8gU3RyZWFtaW5nIFx1MjE5MiBSdW5uaW5nIChjb25maXJtZWQ6IG5vdC1uZWVkZWQpIFx1MjE5MiBFeGVjdXRpbmcuXG5cdFx0XHRjb25zdCBydW5uaW5nOiBBbnlUb29sQ2FsbFN0YXRlID0geyB0b29sQ2FsbElkOiAndGMtdGVybScsIHRvb2xOYW1lOiAnYmFzaCcsIGRpc3BsYXlOYW1lOiAnQmFzaCcsIGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBjb21tYW5kJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCwgX21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSB9O1xuXHRcdFx0c3RyZWFtaW5nLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihydW5uaW5nKSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy5zdGF0ZS5nZXQoKS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcpO1xuXG5cdFx0XHQvLyBSdW5uaW5nIFx1MjE5MiBQZW5kaW5nQ29uZmlybWF0aW9uIHZpYSB0aGUgcGVybWlzc2lvbiBjYWxsYmFjay5cblx0XHRcdGNvbnN0IHBlbmRpbmc6IEFueVRvb2xDYWxsU3RhdGUgPSB7IHRvb2xDYWxsSWQ6ICd0Yy10ZXJtJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgaW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBybSAtcmYgYnVpbGRgJywgdG9vbElucHV0OiAncm0gLXJmIGJ1aWxkJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLCBfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LCBjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kPycgfTtcblx0XHRcdHN0cmVhbWluZy5yZXF1ZXN0Q29uZmlybWF0aW9uKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihwZW5kaW5nKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RyZWFtaW5nLnN0YXRlLmdldCgpLnR5cGUsIElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHN0cmVhbWluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAndGVybWluYWwnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2Egc2FtZS1zdGF0ZSBwZW5kaW5nIHJlZnJlc2ggcmVwbGFjZXMgdGhlIHZpc2libGUgdGVybWluYWwgY29tbWFuZCB3aXRob3V0IHJlcGxhY2luZyBpdHMgZ2F0ZScsICgpID0+IHtcblx0XHRcdGNvbnN0IGZpcnN0OiBBbnlUb29sQ2FsbFN0YXRlID0ge1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtdGVybScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQmFzaCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyBgbnBtIGNvbmZpZyBnZXQgcmVnaXN0cnlgJyxcblx0XHRcdFx0dG9vbElucHV0OiAnbnBtIGNvbmZpZyBnZXQgcmVnaXN0cnknLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGNvbW1hbmQ/Jyxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbihmaXJzdCk7XG5cdFx0XHRjb25zdCBpbml0aWFsU3RhdGUgPSBpbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGluaXRpYWxTdGF0ZS50eXBlLCBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uKTtcblx0XHRcdGNvbnN0IGluaXRpYWxHYXRlID0gaW5pdGlhbFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gPyBpbml0aWFsU3RhdGUuY29uZmlybSA6IHVuZGVmaW5lZDtcblxuXHRcdFx0Y29uc3QgcmVmcmVzaGVkOiBBbnlUb29sQ2FsbFN0YXRlID0ge1xuXHRcdFx0XHQuLi5maXJzdCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIGBucG0gaW5zdGFsbCAtLXJlZ2lzdHJ5PWh0dHBzOi8vcmVnaXN0cnkubnBtanMub3JnYCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ25wbSBpbnN0YWxsIC0tcmVnaXN0cnk9aHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcnLFxuXHRcdFx0fTtcblx0XHRcdGludm9jYXRpb24udXBkYXRlUHJlcGFyZWRJbnZvY2F0aW9uKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihyZWZyZXNoZWQpLCBpbnZvY2F0aW9uLnBhcmFtZXRlcnMpO1xuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0XHRjb25zdCB0ZXJtaW5hbERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRhc3NlcnQub2sodGVybWluYWxEYXRhPy5raW5kID09PSAndGVybWluYWwnICYmIGhhc0tleSh0ZXJtaW5hbERhdGEsIHsgY29tbWFuZExpbmU6IHRydWUgfSkpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdGNvbW1hbmQ6IHRlcm1pbmFsRGF0YS5jb21tYW5kTGluZS5vcmlnaW5hbCxcblx0XHRcdFx0Z2F0ZVByZXNlcnZlZDogc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJiBzdGF0ZS5jb25maXJtID09PSBpbml0aWFsR2F0ZSxcblx0XHRcdH0sIHtcblx0XHRcdFx0Y29tbWFuZDogJ25wbSBpbnN0YWxsIC0tcmVnaXN0cnk9aHR0cHM6Ly9yZWdpc3RyeS5ucG1qcy5vcmcnLFxuXHRcdFx0XHRnYXRlUHJlc2VydmVkOiB0cnVlLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXF1ZXN0Q29uZmlybWF0aW9uIG5vLW9wcyBvbiBhIGNvbXBsZXRlZCBpbnZvY2F0aW9uJywgKCkgPT4ge1xuXHRcdFx0Y29uc3Qgc3RyZWFtaW5nID0gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih7IHRvb2xDYWxsSWQ6ICd0Yy1kb25lJywgdG9vbE5hbWU6ICdiYXNoJywgZGlzcGxheU5hbWU6ICdCYXNoJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfSwgdW5kZWZpbmVkKTtcblx0XHRcdHN0cmVhbWluZy50cmFuc2l0aW9uRnJvbVN0cmVhbWluZyh0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24oeyB0b29sQ2FsbElkOiAndGMtZG9uZScsIHRvb2xOYW1lOiAnYmFzaCcsIGRpc3BsYXlOYW1lOiAnQmFzaCcsIGludm9jYXRpb25NZXNzYWdlOiAncnVuJywgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLCBjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCB9KSwgdW5kZWZpbmVkLCB1bmRlZmluZWQpO1xuXHRcdFx0c3RyZWFtaW5nLmRpZEV4ZWN1dGVUb29sKHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHN0cmVhbWluZyksIHRydWUpO1xuXG5cdFx0XHRjb25zdCBwZW5kaW5nOiBBbnlUb29sQ2FsbFN0YXRlID0geyB0b29sQ2FsbElkOiAndGMtZG9uZScsIHRvb2xOYW1lOiAnYmFzaCcsIGRpc3BsYXlOYW1lOiAnQmFzaCcsIGludm9jYXRpb25NZXNzYWdlOiAnY29uZmlybScsIHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbiwgY29uZmlybWF0aW9uVGl0bGU6ICdDb25maXJtPycgfTtcblx0XHRcdHN0cmVhbWluZy5yZXF1ZXN0Q29uZmlybWF0aW9uKHRvb2xDYWxsU3RhdGVUb1ByZXBhcmVkSW52b2NhdGlvbihwZW5kaW5nKSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHN0cmVhbWluZyksIHRydWUsICdjb21wbGV0ZWQgaW52b2NhdGlvbiBpcyBub3QgcmUtYXJtZWQnKTtcblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2ZpbmFsaXplVG9vbEludm9jYXRpb24nLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXdyaXRlcyBtYXJrZG93biBsaW5rcyBpbiBwYXN0VGVuc2VNZXNzYWdlIHRocm91Z2ggdGhlIGFnZW50IGhvc3Qgc2NoZW1lJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRyYXdGaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICd2aWV3X2ZpbGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1ZpZXcgRmlsZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUmVhZGluZyBmaWxlLi4uJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHsgbWFya2Rvd246ICdSZWFkIFtmb28udHNdKGZpbGU6Ly8vcGF0aC90by9mb28udHMpJyB9LFxuXHRcdFx0fSBhcyBJQ29tcGxldGVkVG9vbENhbGwsIFVSSS5maWxlKCcvJyksICdzc2hfX21hY2Jvb2stYWlyJyk7XG5cblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHR5cGVvZiBpbnZvY2F0aW9uLnBhc3RUZW5zZU1lc3NhZ2UsICdvYmplY3QnKTtcblx0XHRcdGNvbnN0IHZhbHVlID0gKGludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSBhcyB7IHZhbHVlOiBzdHJpbmcgfSkudmFsdWU7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodmFsdWUsICdSZWFkIFtdKHZzY29kZS1hZ2VudC1ob3N0Oi8vc3NoX19tYWNib29rLWFpci9wYXRoL3RvL2Zvby50cz9fYWglM0RleUp6WTJobGJXVWlPaUptYVd4bEluMCknKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplcyBwdHkgdGVybWluYWwgdG9vbCB3aXRoIGNvbXBhdGliaWxpdHkgb3V0cHV0IGFuZCBleGl0IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sSW5wdXQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3Q0JywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdlY2hvIGhpJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZWNobyBoaScsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdDQnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdvdXRwdXQgdGV4dCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdvdXRwdXQgdGV4dCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZSwgMCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKGludm9jYXRpb24pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnbm9ybWFsaXplcyBwbGFpbi10ZXh0IGxpbmUgZW5kaW5ncyBmb3IgdGhlIGRldGFjaGVkIHRlcm1pbmFsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbElucHV0OiAnZ3JlcCAtbiBmb28nLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vdDUnLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2dyZXAgLW4gZm9vJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZ3JlcCAtbiBmb28nLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3Q1JywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnbGluZTFcXG5saW5lMlxcclxcbmxpbmUzXFxuJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kT3V0cHV0PzogeyB0ZXh0OiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCwgJ2xpbmUxXFxyXFxubGluZTJcXHJcXG5saW5lM1xcclxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVzIGdlbmVyaWMgdG9vbCB3aXRoIGlucHV0L291dHB1dCBkZXRhaWxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJwYXRoXCI6XCJSRUFETUUubWRcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInBhdGhcIjpcIlJFQURNRS5tZFwifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnUmVhZCBSRUFETUUnLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJyMgVlMgQ29kZScgfV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgZGV0YWlscyA9IElDaGF0VG9vbEludm9jYXRpb24ucmVzdWx0RGV0YWlscyhpbnZvY2F0aW9uKTtcblx0XHRcdGFzc2VydElucHV0T3V0cHV0RGV0YWlscyhkZXRhaWxzKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChkZXRhaWxzLmlucHV0LCAne1wicGF0aFwiOlwiUkVBRE1FLm1kXCJ9Jyk7XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGRldGFpbHMub3V0cHV0LCBbeyB0eXBlOiAnZW1iZWQnLCB2YWx1ZTogJyMgVlMgQ29kZScsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9XSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5pc0Vycm9yLCBmYWxzZSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZXMgZmFpbGVkIHRvb2wgd2l0aCBlcnJvciBtZXNzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJvcGVyYXRpb25cIjpcInNsb3dcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcIm9wZXJhdGlvblwiOlwic2xvd1wifScsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0ZhaWxlZCcsXG5cdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICd0aW1lb3V0JyB9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGRldGFpbHMgPSBJQ2hhdFRvb2xJbnZvY2F0aW9uLnJlc3VsdERldGFpbHMoaW52b2NhdGlvbik7XG5cdFx0XHRhc3NlcnRJbnB1dE91dHB1dERldGFpbHMoZGV0YWlscyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZGV0YWlscy5pc0Vycm9yLCB0cnVlKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoZGV0YWlscy5vdXRwdXQsIFt7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiAndGltZW91dCcsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9XSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZpbGUgZWRpdHMgZnJvbSBjb21wbGV0ZWQgdG9vbCBjYWxsIHdpdGggRmlsZUVkaXQgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyB9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnZWRpdF9maWxlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdFZGl0IEZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0VkaXRpbmcgZmlsZS4uLicsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiAnRWRpdGVkIGZpbGUnLFxuXHRcdFx0XHR0b29sSW5wdXQ6IEpTT04uc3RyaW5naWZ5KHsgcGF0aDogJy9ob21lL3VzZXIvZmlsZS50cycgfSksXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdGJlZm9yZToge1xuXHRcdFx0XHRcdFx0dXJpOiBVUkkuZmlsZSgnL2hvbWUvdXNlci9maWxlLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc2Vzc2lvbi9zbmFwL2JlZm9yZScgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvaG9tZS91c2VyL2ZpbGUudHMnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdFx0Y29udGVudDogeyB1cmk6ICdhZ2VudGhvc3QtY29udGVudDovLy9zZXNzaW9uL3NuYXAvYWZ0ZXInIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0cy5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0c1swXS5yZXNvdXJjZS5mc1BhdGgucmVwbGFjZSgvXFxcXC9nLCAnLycpLCAnL2hvbWUvdXNlci9maWxlLnRzJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzWzBdLmJlZm9yZUNvbnRlbnRVcmk/LnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc2Vzc2lvbi9zbmFwL2JlZm9yZScpLnRvU3RyaW5nKCkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0c1swXS5hZnRlckNvbnRlbnRVcmk/LnRvU3RyaW5nKCksIFVSSS5wYXJzZSgnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc2Vzc2lvbi9zbmFwL2FmdGVyJykudG9TdHJpbmcoKSk7XG5cdFx0XHRhc3NlcnQub2soZmlsZUVkaXRzWzBdLnVuZG9TdG9wSWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24ucHJlc2VudGF0aW9uLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW4pO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKElDaGF0VG9vbEludm9jYXRpb24ucmVzdWx0RGV0YWlscyhpbnZvY2F0aW9uKSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGhpZGUgcHJlc2VudGF0aW9uIHdoZW4gdG9vbCB3aXRoIGZpbGUgZWRpdHMgZmFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXRfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nIGZpbGUuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogZmFsc2UsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdGYWlsZWQgdG8gZWRpdCcsXG5cdFx0XHRcdGVycm9yOiB7IG1lc3NhZ2U6ICd3cml0ZSBlcnJvcicgfSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0YWZ0ZXI6IHtcblx0XHRcdFx0XHRcdHVyaTogVVJJLmZpbGUoJy9ob21lL3VzZXIvZmlsZS50cycpLnRvU3RyaW5nKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ2FnZW50aG9zdC1jb250ZW50Oi8vL3NuYXAvYWZ0ZXInIH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0Lm5vdFN0cmljdEVxdWFsKGludm9jYXRpb24ucHJlc2VudGF0aW9uLCBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW4pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmaWxlIGVkaXRzIGZvciBjYW5jZWxsZWQgdG9vbCBjYWxsJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdlZGl0X2ZpbGUnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ0VkaXQgRmlsZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnRWRpdGluZyBmaWxlLi4uJyxcblx0XHRcdFx0cmVhc29uOiBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5EZW5pZWQsXG5cdFx0XHRcdHJlYXNvbk1lc3NhZ2U6ICdVc2VyIGNhbmNlbGxlZCcsXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGZpbGVFZGl0cy5sZW5ndGgsIDApO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZmluYWxpemVkIHNlYXJjaCB0b29sIGtlZXBzIHNlYXJjaCByZW5kZXJpbmcgd2l0aG91dCBnZW5lcmljIGRldGFpbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc2VhcmNoJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICd7XCJxdWVyeVwiOlwidGVybWluYWxcIn0nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3NlYXJjaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnU2VhcmNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdTZWFyY2hpbmcuLi4nLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3NlYXJjaCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAne1wicXVlcnlcIjpcInRlcm1pbmFsXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdTZWFyY2hlZCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAncmVzdWx0JyB9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnc2VhcmNoJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoSUNoYXRUb29sSW52b2NhdGlvbi5yZXN1bHREZXRhaWxzKGludm9jYXRpb24pLCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmV0dXJucyBlbXB0eSBmaWxlIGVkaXRzIHdoZW4gdG9vbCBoYXMgbm8gRmlsZUVkaXQgY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7IHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyB9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0Y29uc3QgZmlsZUVkaXRzID0gZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAndGVzdF90b29sJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgdGVzdCB0b29sLi4uJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gdGVzdCB0b29sJyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdvdXRwdXQnIH1dLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHMubGVuZ3RoLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JldHVybnMgZW1wdHkgZmlsZSBlZGl0cyB3aGVuIEZpbGVFZGl0IGhhcyBubyBiZWZvcmUgb3IgYWZ0ZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGNvbnN0IGZpbGVFZGl0cyA9IGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ2VkaXRfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnRWRpdCBGaWxlJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdFZGl0aW5nIGZpbGUuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0VkaXRlZCcsXG5cdFx0XHRcdHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyBjb250ZW50OiAnbm8gcGF0aCBmaWVsZCcgfSksXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzLmxlbmd0aCwgMCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIGZpbGUgZWRpdCBmb3IgY3JlYXRlIChvbmx5IGFmdGVyIHByZXNlbnQpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHsgc3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXG5cdFx0XHRjb25zdCBmaWxlRWRpdHMgPSBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9uKGludm9jYXRpb24sIHtcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdjcmVhdGVfZmlsZScsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQ3JlYXRlIEZpbGUnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ0NyZWF0aW5nIGZpbGUuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ0NyZWF0ZWQgZmlsZScsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRcdGFmdGVyOiB7XG5cdFx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvaG9tZS91c2VyL25ldy1maWxlLnRzJykudG9TdHJpbmcoKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiAnYWdlbnRob3N0LWNvbnRlbnQ6Ly8vc25hcC9hZnRlcicgfSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzLmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoZmlsZUVkaXRzWzBdLmtpbmQsICdjcmVhdGUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHNbMF0ucmVzb3VyY2UuZnNQYXRoLnJlcGxhY2UoL1xcXFwvZywgJy8nKSwgJy9ob21lL3VzZXIvbmV3LWZpbGUudHMnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChmaWxlRWRpdHNbMF0uYmVmb3JlQ29udGVudFVyaSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5vayhmaWxlRWRpdHNbMF0uYWZ0ZXJDb250ZW50VXJpKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBzdWJhZ2VudCBjcmVkaXRzIHdoZW4gZmluYWxpemluZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIHN1YmFnZW50RGVzY3JpcHRpb246ICdGaW5kIHJlbGF0ZWQgZmlsZXMnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyA9IDIuNTtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlID0gdHJ1ZTtcblx0XHRcdH1cblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuX3N1YmFnZW50Jyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gU3ViYWdlbnQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgc3ViYWdlbnQuLi4nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBzdWJhZ2VudCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LFxuXHRcdFx0XHRcdHJlc291cmNlOiAnY29waWxvdDovL3Nlc3Npb24vc3ViYWdlbnQvdGMtMScsXG5cdFx0XHRcdFx0dGl0bGU6ICdFeHBsb3JlJyxcblx0XHRcdFx0XHRhZ2VudE5hbWU6ICdleHBsb3JlJyxcblx0XHRcdFx0XHRkZXNjcmlwdGlvbjogJ0V4cGxvcmVzIHRoZSBjb2RlYmFzZScsXG5cdFx0XHRcdH0sIHtcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCxcblx0XHRcdFx0XHR0ZXh0OiAnU3ViYWdlbnQgcmVzdWx0Jyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9IGFzIElDb21wbGV0ZWRUb29sQ2FsbCk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHtcblx0XHRcdFx0XHRjcmVkaXRzOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyxcblx0XHRcdFx0XHRpc0FjdGl2ZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlLFxuXHRcdFx0XHR9LCB7XG5cdFx0XHRcdFx0Y3JlZGl0czogMi41LFxuXHRcdFx0XHRcdGlzQWN0aXZlOiB0cnVlLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9KTtcblx0fSk7XG5cblx0c3VpdGUoJ2FjdGl2ZVR1cm5Ub1Byb2dyZXNzJywgKCkgPT4ge1xuXG5cdFx0ZnVuY3Rpb24gY3JlYXRlQWN0aXZlVHVyblN0YXRlKHJlc3BvbnNlUGFydHM/OiBBY3RpdmVUdXJuWydyZXNwb25zZVBhcnRzJ10pOiBBY3RpdmVUdXJuIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGlkOiAndHVybi1hY3RpdmUnLFxuXHRcdFx0XHRzdGFydGVkQXQ6ICcyMDI1LTAxLTAxVDAwOjAwOjAwLjAwMFonLFxuXHRcdFx0XHRtZXNzYWdlOiBtZXNzYWdlKCdEbyB0aGluZ3MnKSxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogcmVzcG9uc2VQYXJ0cyA/PyBbXSxcblx0XHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0dGVzdCgnZW1wdHkgYWN0aXZlIHR1cm4gcHJvZHVjZXMgZW1wdHkgcHJvZ3Jlc3MnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCBbXSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdpbmNsdWRlcyB1c2FnZSBwcm9ncmVzcyBmcm9tIGFjdGl2ZSB0dXJuIHVzYWdlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgYWN0aXZlVHVybiA9IGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZSgpO1xuXHRcdFx0YWN0aXZlVHVybi51c2FnZSA9IHsgaW5wdXRUb2tlbnM6IDEwMDAsIG91dHB1dFRva2VuczogMjUwIH07XG5cblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGFjdGl2ZVR1cm4sIHVuZGVmaW5lZCk7XG5cdFx0XHRjb25zdCB1c2FnZSA9IHJlc3VsdFswXSBhcyBJQ2hhdFVzYWdlO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChcblx0XHRcdFx0eyBraW5kOiB1c2FnZS5raW5kLCBwcm9tcHRUb2tlbnM6IHVzYWdlLnByb21wdFRva2VucywgY29tcGxldGlvblRva2VuczogdXNhZ2UuY29tcGxldGlvblRva2VucyB9LFxuXHRcdFx0XHR7IGtpbmQ6ICd1c2FnZScsIHByb21wdFRva2VuczogMTAwMCwgY29tcGxldGlvblRva2VuczogMjUwIH0sXG5cdFx0XHQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJvZHVjZXMgbWFya2Rvd24gY29udGVudCBmb3Igc3RyZWFtZWQgdGV4dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93biwgaWQ6ICdtZC0xJywgY29udGVudDogJ0hlbGxvIHdvcmxkJyB9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmtpbmQsICdtYXJrZG93bkNvbnRlbnQnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElDaGF0TWFya2Rvd25Db250ZW50KS5jb250ZW50LnZhbHVlLCAnSGVsbG8gd29ybGQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y2VzIHN5c3RlbSBub3RpZmljYXRpb24gZm9yIHN5c3RlbSBub3RpZmljYXRpb24gcmVzcG9uc2UgcGFydCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5TeXN0ZW1Ob3RpZmljYXRpb24sIGNvbnRlbnQ6ICdTaGVsbCBjb21tYW5kIGNvbXBsZXRlZCcgfSxcblx0XHRcdF0pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5raW5kLCAnc3lzdGVtTm90aWZpY2F0aW9uJyk7XG5cdFx0XHRpZiAocmVzdWx0WzBdLmtpbmQgIT09ICdzeXN0ZW1Ob3RpZmljYXRpb24nKSB7IHJldHVybjsgfVxuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5jb250ZW50LnZhbHVlLCAnU2hlbGwgY29tbWFuZCBjb21wbGV0ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y2VzIHdhcm5pbmcgZm9yIGFjdGl2ZSB3b3JrdHJlZSBmYWlsdXJlIG5vdGlmaWNhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbe1xuXHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbixcblx0XHRcdFx0Y29udGVudDogJ1dvcmt0cmVlIGNyZWF0aW9uIGZhaWxlZCcsXG5cdFx0XHRcdF9tZXRhOiB0b0FnZW50U3lzdGVtTm90aWZpY2F0aW9uTWV0YSh7XG5cdFx0XHRcdFx0a2luZDogQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25LaW5kLldvcmt0cmVlQ3JlYXRpb25GYWlsdXJlLFxuXHRcdFx0XHRcdHNldmVyaXR5OiBBZ2VudFN5c3RlbU5vdGlmaWNhdGlvblNldmVyaXR5Lldhcm5pbmcsXG5cdFx0XHRcdH0pLFxuXHRcdFx0fV0pLCB1bmRlZmluZWQpO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdFswXSwge1xuXHRcdFx0XHRraW5kOiAnd2FybmluZycsXG5cdFx0XHRcdGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZygnV29ya3RyZWUgY3JlYXRpb24gZmFpbGVkJyksXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3Byb2R1Y2VzIHRoaW5raW5nIHByb2dyZXNzIGZvciByZWFzb25pbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLCBpZDogJ3ItMScsIGNvbnRlbnQ6ICdMZXQgbWUgdGhpbmsgYWJvdXQgdGhpcy4uLicgfSxcblx0XHRcdF0pLCB1bmRlZmluZWQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5raW5kLCAndGhpbmtpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCgocmVzdWx0WzBdIGFzIElDaGF0VGhpbmtpbmdQYXJ0KS5pZCwgJ3ItMScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVhc29uaW5nIGNvbWVzIGJlZm9yZSBzdHJlYW1lZCB0ZXh0IHdoZW4gb3JkZXJlZCB0aGF0IHdheScsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IGFjdGl2ZVR1cm5Ub1Byb2dyZXNzKFVSSS5maWxlKCcvJyksIGNyZWF0ZUFjdGl2ZVR1cm5TdGF0ZShbXG5cdFx0XHRcdHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiAnci0xJywgY29udGVudDogJ0htbS4uLicgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21kLTEnLCBjb250ZW50OiAnUmVzdWx0IHRleHQnIH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAyKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMF0ua2luZCwgJ3RoaW5raW5nJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzFdLmtpbmQsICdtYXJrZG93bkNvbnRlbnQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3NlcmlhbGl6ZXMgY29tcGxldGVkIHRvb2wgY2FsbHMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiAndGMtZG9uZScsXG5cdFx0XHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1JhbiB0ZXN0Jyxcblx0XHRcdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gdGVzdCB0b29sJyxcblx0XHRcdFx0XHR9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0Wyd0b29sQ2FsbCddLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0WzBdLmtpbmQsICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZXMgbGl2ZSBpbnZvY2F0aW9ucyBmb3IgcnVubmluZyB0b29sIGNhbGxzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLXJ1bm5pbmcnLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzdWx0Lmxlbmd0aCwgMSk7XG5cdFx0XHQvLyBMaXZlIENoYXRUb29sSW52b2NhdGlvbiAtIGNoZWNrIGl0IGhhcyB0aGUgcmlnaHQgdG9vbENhbGxJZFxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHJlc3VsdFswXSBhcyB7IHRvb2xDYWxsSWQ/OiBzdHJpbmc7IGtpbmQ/OiBzdHJpbmcgfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xDYWxsSWQsICd0Yy1ydW5uaW5nJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdoeWRyYXRlcyBhbm90aGVyIGNsaWVudCB0b29sIHdpdGhvdXQgYSBjb25maXJtYXRpb24gaW52b2NhdGlvbicsICgpID0+IHtcblx0XHRcdGNvbnN0IHRvb2xDYWxsOiBUb29sQ2FsbFBlbmRpbmdDb25maXJtYXRpb25TdGF0ZSA9IHtcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLW90aGVyLWNsaWVudCcsXG5cdFx0XHRcdHRvb2xOYW1lOiAncnVuX3Rhc2snLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1J1biBUYXNrJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gdGFzaycsXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRhc2tcIjpcImJ1aWxkXCJ9Jyxcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdBbGxvdyBSdW4gVGFzaz8nLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6ICdvd25lci1jbGllbnQnIH0sXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbCB9LFxuXHRcdFx0XSksIHVuZGVmaW5lZCwge1xuXHRcdFx0XHRjdXJyZW50Q2xpZW50SWQ6ICd2aWV3ZXItY2xpZW50Jyxcblx0XHRcdFx0Y2FuY2VsT3RoZXJDbGllbnRUb29sQ2FsbDogKCkgPT4geyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gcmVzdWx0WzBdIGFzIElDaGF0VG9vbEludm9jYXRpb247XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoe1xuXHRcdFx0XHRraW5kOiBpbnZvY2F0aW9uLmtpbmQsXG5cdFx0XHRcdHN0YXRlOiBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHRcdGhhc090aGVyQ2xpZW50RGF0YTogISFpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdGtpbmQ6ICd0b29sSW52b2NhdGlvbicsXG5cdFx0XHRcdHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGhhc090aGVyQ2xpZW50RGF0YTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaHlkcmF0ZXMgYW5vdGhlciBjbGllbnQgc3RyZWFtaW5nIHRvb2wgd2l0aCBpdHMgY2FuY2VsIGFmZm9yZGFuY2UnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0b29sQ2FsbDogVG9vbENhbGxSZXNwb25zZVBhcnRbJ3Rvb2xDYWxsJ10gPSB7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1vdGhlci1jbGllbnQtc3RyZWFtaW5nJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdydW5fdGFzaycsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFRhc2snLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuQ2xpZW50LCBjbGllbnRJZDogJ293bmVyLWNsaWVudCcgfSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsIH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkLCB7XG5cdFx0XHRcdGN1cnJlbnRDbGllbnRJZDogJ3ZpZXdlci1jbGllbnQnLFxuXHRcdFx0XHRjYW5jZWxPdGhlckNsaWVudFRvb2xDYWxsOiAoKSA9PiB7IH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSByZXN1bHRbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdHN0YXRlOiBpbnZvY2F0aW9uLnN0YXRlLmdldCgpLnR5cGUsXG5cdFx0XHRcdGhhc090aGVyQ2xpZW50RGF0YTogISFpbnZvY2F0aW9uLm90aGVyQ2xpZW50VG9vbENhbGwsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5FeGVjdXRpbmcsXG5cdFx0XHRcdGhhc090aGVyQ2xpZW50RGF0YTogdHJ1ZSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnY3JlYXRlcyBjb25maXJtYXRpb24gaW52b2NhdGlvbnMgZm9yIHBlbmRpbmcgdG9vbCBjb25maXJtYXRpb25zJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gYWN0aXZlVHVyblRvUHJvZ3Jlc3MoVVJJLmZpbGUoJy8nKSwgY3JlYXRlQWN0aXZlVHVyblN0YXRlKFtcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1wZW5kaW5nJyxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdFx0XHRkaXNwbGF5TmFtZTogJ0Jhc2gnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ1J1biBjb21tYW5kJyxcblx0XHRcdFx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMuQ29tcGxldGUsXG5cdFx0XHRcdFx0XHRcdHJlYXNvbjogJ1RoZSBjb21tYW5kIHJlbW92ZXMgYSBwcm9qZWN0IGZpbGUuJyxcblx0XHRcdFx0XHRcdFx0c2FmZXR5OiAwLjE1LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHRdKSwgdW5kZWZpbmVkKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQubGVuZ3RoLCAxKTtcblx0XHRcdC8vIFBlbmRpbmdDb25maXJtYXRpb24gdG9vbHMgaGF2ZSBpbnB1dC1zdHlsZSBzcGVjaWZpYyBkYXRhIChubyB0ZXJtaW5hbCBjb250ZW50IHlldClcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSByZXN1bHRbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvbjtcblx0XHRcdGFzc2VydC5vayhpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5raW5kLCAnaW5wdXQnKTtcblx0XHRcdGNvbnN0IHN0YXRlID0gaW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA/IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hcHByb3ZhbFJlYXNvbiA6IHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZScsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnVGhlIGNvbW1hbmQgcmVtb3ZlcyBhIHByb2plY3QgZmlsZS4nLFxuXHRcdFx0XHRzYWZldHk6IDAuMTUsXG5cdFx0XHR9KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2NyZWF0ZXMgbG9hZGluZyBjb25maXJtYXRpb24gaW52b2NhdGlvbnMgd2hpbGUganVkZ2VtZW50IGlzIHBlbmRpbmcnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1qdWRnaW5nJyxcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdCYXNoJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0Y29uZmlybWF0aW9uVGl0bGU6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdHJpc2tBc3Nlc3NtZW50OiB7XG5cdFx0XHRcdFx0a2luZDogVG9vbENhbGxSaXNrQXNzZXNzbWVudEtpbmQuSnVkZ2UsXG5cdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkxvYWRpbmcsXG5cdFx0XHRcdH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA/IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hcHByb3ZhbFJlYXNvbiA6IHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdGF0dXM6ICdsb2FkaW5nJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXBkYXRlcyBhIHJlbmRlcmVkIGNvbmZpcm1hdGlvbiB3aGVuIGFzeW5jaHJvbm91cyBqdWRnZW1lbnQgY29tcGxldGVzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24oe1xuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtanVkZ2luZycsXG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnQmFzaCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVuIGNvbW1hbmQnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnUnVuIGNvbW1hbmQnLFxuXHRcdFx0XHRyaXNrQXNzZXNzbWVudDoge1xuXHRcdFx0XHRcdGtpbmQ6IFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRLaW5kLkp1ZGdlLFxuXHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cy5Mb2FkaW5nLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdlY2hvIGhlbGxvJyxcblx0XHRcdH0pO1xuXG5cdFx0XHRpbnZvY2F0aW9uLnVwZGF0ZUNvbmZpcm1hdGlvbk1lc3NhZ2VzKHtcblx0XHRcdFx0dGl0bGU6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdG1lc3NhZ2U6ICdSdW4gY29tbWFuZCcsXG5cdFx0XHRcdGFwcHJvdmFsUmVhc29uOiB7XG5cdFx0XHRcdFx0c3RhdHVzOiAnY29tcGxldGUnLFxuXHRcdFx0XHRcdGV4cGxhbmF0aW9uOiAnVGhpcyBjb21tYW5kIG1vZGlmaWVzIHByb3RlY3RlZCBmaWxlcy4nLFxuXHRcdFx0XHRcdHNhZmV0eTogMC4xLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBzdGF0ZSA9IGludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA/IHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy5hcHByb3ZhbFJlYXNvbiA6IHVuZGVmaW5lZCwge1xuXHRcdFx0XHRzdGF0dXM6ICdjb21wbGV0ZScsXG5cdFx0XHRcdGV4cGxhbmF0aW9uOiAnVGhpcyBjb21tYW5kIG1vZGlmaWVzIHByb3RlY3RlZCBmaWxlcy4nLFxuXHRcdFx0XHRzYWZldHk6IDAuMSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGNyZWF0ZSBtZXRhZGF0YSBhbmQgcHJvcG9zZWQgY29udGVudCBmb3IgcGVuZGluZyBmaWxlIGNvbmZpcm1hdGlvbnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy1jcmVhdGUnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3dyaXRlJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdXcml0ZScsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnQ3JlYXRpbmcgcGFja2FnZS5qc29uJyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uLFxuXHRcdFx0XHRjb25maXJtYXRpb25UaXRsZTogJ0NyZWF0ZSBmaWxlPycsXG5cdFx0XHRcdGVkaXRzOiB7XG5cdFx0XHRcdFx0aXRlbXM6IFt7XG5cdFx0XHRcdFx0XHRhZnRlcjoge1xuXHRcdFx0XHRcdFx0XHR1cmk6ICdmaWxlOi8vL3dvcmtzcGFjZS9wYWNrYWdlLmpzb24nLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogJ3BlbmRpbmctZWRpdC1jb250ZW50Oi8vc2Vzc2lvbi90Yy1jcmVhdGUvcGFja2FnZS5qc29uJyB9LFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9XSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwge1xuXHRcdFx0XHRraW5kOiAnbW9kaWZpZWRGaWxlc0NvbmZpcm1hdGlvbicsXG5cdFx0XHRcdG9wdGlvbnM6IFsnQWxsb3cnXSxcblx0XHRcdFx0bW9kaWZpZWRGaWxlczogW3tcblx0XHRcdFx0XHR1cmk6IFVSSS5maWxlKCcvd29ya3NwYWNlL3BhY2thZ2UuanNvbicpLFxuXHRcdFx0XHRcdGVkaXRLaW5kOiAnY3JlYXRlJyxcblx0XHRcdFx0XHRvcmlnaW5hbFVyaTogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdG1vZGlmaWVkQ29udGVudFVyaTogdG9BZ2VudEhvc3RVcmkoVVJJLnBhcnNlKCdwZW5kaW5nLWVkaXQtY29udGVudDovL3Nlc3Npb24vdGMtY3JlYXRlL3BhY2thZ2UuanNvbicpLCAnbG9jYWwnKSxcblx0XHRcdFx0XHRvcmlnaW5hbENvbnRlbnRVcmk6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRpbnNlcnRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0ZGVsZXRpb25zOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0dGl0bGU6ICdwYWNrYWdlLmpzb24nLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnL3dvcmtzcGFjZS9wYWNrYWdlLmpzb24nLFxuXHRcdFx0XHR9XSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnaW5jbHVkZXMgYWxsIHBhcnRzIGluIGNvcnJlY3Qgb3JkZXInLCAoKSA9PiB7XG5cdFx0XHRjb25zdCByZXN1bHQgPSBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhVUkkuZmlsZSgnLycpLCBjcmVhdGVBY3RpdmVUdXJuU3RhdGUoW1xuXHRcdFx0XHR7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLCBpZDogJ3ItMScsIGNvbnRlbnQ6ICdUaGlua2luZy4uLicgfSxcblx0XHRcdFx0eyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLCBpZDogJ21kLTEnLCBjb250ZW50OiAnT3V0cHV0IHNvIGZhcicgfSxcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRcdH0pLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCxcblx0XHRcdFx0XHR0b29sQ2FsbDoge1xuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTInLFxuXHRcdFx0XHRcdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6ICdUZXN0IFRvb2wnLFxuXHRcdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdDb25maXJtJyxcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvbixcblx0XHRcdFx0XHRcdGNvbmZpcm1hdGlvblRpdGxlOiAnQ29uZmlybScsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fSxcblx0XHRcdF0pLCB1bmRlZmluZWQpO1xuXHRcdFx0Ly8gcmVhc29uaW5nICsgdGV4dCArIHRvb2wgY2FsbCArIHBlbmRpbmcgY29uZmlybWF0aW9uID0gNCBpdGVtc1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdC5sZW5ndGgsIDQpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3VsdFswXS5raW5kLCAndGhpbmtpbmcnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHRbMV0ua2luZCwgJ21hcmtkb3duQ29udGVudCcpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndGVybWluYWwgY29udGVudCBibG9ja3MnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdjb21wbGV0ZWQgdG9vbCBjYWxsIHdpdGggdGVybWluYWwgY29udGVudCBibG9jayBzZXRzIHRlcm1pbmFsQ29tbWFuZFVyaScsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICducG0gdGVzdCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vYWJjMTIzJywgdGl0bGU6ICdUZXJtaW5hbCcsIGlzUHR5OiBmYWxzZSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5vayhzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGNvbnN0IHRlcm1EYXRhID0gc2VyaWFsaXplZC50b29sU3BlY2lmaWNEYXRhIGFzIHsga2luZDogJ3Rlcm1pbmFsJzsgdGVybWluYWxDb21tYW5kVXJpPzogeyB0b1N0cmluZygpOiBzdHJpbmcgfSB9O1xuXHRcdFx0YXNzZXJ0Lm9rKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kVXJpLnRvU3RyaW5nKCksICdhZ2VudGhvc3QtdGVybWluYWw6L2FiYzEyMycpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndGVybWluYWwgY29udGVudCBibG9jayBza2lwcyBib29ra2VlcGluZyB0ZXh0IG91dHB1dCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHRvb2xLaW5kOiAndGVybWluYWwnLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICducG0gdGVzdCcsXG5cdFx0XHRcdGNvbnRlbnQ6IFtcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly8vYWJjMTIzJywgdGl0bGU6ICdUZXJtaW5hbCcsIGlzUHR5OiBmYWxzZSB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICd0ZXh0LW91dHB1dCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFVyaT86IHsgdG9TdHJpbmcoKTogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH0gfTtcblx0XHRcdC8vIFRlcm1pbmFsIGNvbnRlbnQgYmxvY2sgVVJJIHNob3VsZCBiZSBzZXRcblx0XHRcdGFzc2VydC5vayh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgdG9vbCBjb21wbGV0aW9uIHRleHQgZm9yIHRydW5jYXRlZCBTREsgc2hlbGwgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2NhdCBsYXJnZS1vdXRwdXQudHh0Jyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdC8vIFRPRE86IFByZWZlciBzaGVsbF9leGl0IG9uY2UgdGhlIFNESyBleHBvc2VzIHRoZSBzYXZlZCBvdXRwdXQgZmlsZSBwYXRoIGFzIHN0cnVjdHVyZWQgZGF0YS5cblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiAnT3V0cHV0IHRvbyBsYXJnZSB0byByZWFkIGF0IG9uY2UgKDI1IEtCKS4gU2F2ZWQgdG86IC90bXAvb3V0cHV0LnR4dFxcblVzZSB2aWV3IHdpdGggdmlld19yYW5nZSB0byBleGFtaW5lIHBvcnRpb25zIG9mIHRoZSBvdXRwdXQuPHNoZWxsSWQ6IDEwNCBjb21wbGV0ZWQgd2l0aCBleGl0IGNvZGUgLTE+JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2NvcGlsb3ROb25QdHlTaGVsbHMvdGMtMScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCBpc1B0eTogZmFsc2UsIHJlc3VsdDogeyBleGl0Q29kZTogMCwgcHJldmlldzogJ3ByZXZpZXcgb25seVxcbicsIHRydW5jYXRlZDogdHJ1ZSB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHNlcmlhbGl6ZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh7XG5cdFx0XHRcdG91dHB1dDogdGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0LFxuXHRcdFx0XHRzdGF0ZTogdGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGUsXG5cdFx0XHR9LCB7XG5cdFx0XHRcdG91dHB1dDoge1xuXHRcdFx0XHRcdHRleHQ6ICdPdXRwdXQgdG9vIGxhcmdlIHRvIHJlYWQgYXQgb25jZSAoMjUgS0IpLiBTYXZlZCB0bzogL3RtcC9vdXRwdXQudHh0XFxyXFxuVXNlIHZpZXcgd2l0aCB2aWV3X3JhbmdlIHRvIGV4YW1pbmUgcG9ydGlvbnMgb2YgdGhlIG91dHB1dC4nLFxuXHRcdFx0XHRcdHRydW5jYXRlZDogdHJ1ZSxcblx0XHRcdFx0fSxcblx0XHRcdFx0c3RhdGU6IHsgZXhpdENvZGU6IDAgfSxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIGFuIGV4cGxpY2l0bHkgZW1wdHkgbm9uLVBUWSByZXRhaW5lZCBjb21wbGV0aW9uIHNuYXBzaG90JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3RydWUnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vc2hlbGwvY29waWxvdE5vblB0eVNoZWxscy90Yy0xJywgdGl0bGU6ICdSdW4gU2hlbGwgQ29tbWFuZCcsIGlzUHR5OiBmYWxzZSwgcmVzdWx0OiB7IGV4aXRDb2RlOiAwLCBwcmV2aWV3OiAnJyB9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBnZXRTZXJpYWxpemVkVGVybWluYWxEYXRhKHNlcmlhbGl6ZWQpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQsIHsgdGV4dDogJycgfSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdkb2VzIG5vdCBzdG9yZSBhbiBleHBsaWNpdGx5IGVtcHR5IFBUWSBjb21wbGV0aW9uIHByZXZpZXcgd2hlbiBpc1B0eSBpcyBvbWl0dGVkJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3RydWUnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3B0eS1lbXB0eScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCByZXN1bHQ6IHsgZXhpdENvZGU6IDAsIHByZXZpZXc6ICcnIH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kT3V0cHV0LCB1bmRlZmluZWQpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnZG9lcyBub3QgdXNlIHRleHQgY29udGVudCB3aGVuIGEgdGVybWluYWwgYmxvY2sgb3ducyB0aGUgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVDb21wbGV0ZWRUb29sQ2FsbCh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VoY28gaGknLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2Jhc2g6IGxpbmUgMTogZWhjbzogY29tbWFuZCBub3QgZm91bmRcXG48c2hlbGxJZDogMTA0IGNvbXBsZXRlZCB3aXRoIGV4aXQgY29kZSAxMjc+JyB9LFxuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovL3NoZWxsL2NvcGlsb3ROb25QdHlTaGVsbHMvdGMtMScsIHRpdGxlOiAnUnVuIFNoZWxsIENvbW1hbmQnLCBpc1B0eTogZmFsc2UsIHJlc3VsdDogeyBleGl0Q29kZTogMTI3IH0gfSxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAxMjcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZE91dHB1dCwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlYWRzIGxlZ2FjeSB0ZXJtaW5hbENvbXBsZXRlIGJsb2NrcyBmcm9tIG9sZCBwZXJzaXN0ZWQgc3RhdGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHQvLyBSZW1vdmVkIGZyb20gdGhlIHByb3RvY29sIGluIEFIUCAwLjcuMDsgbWF5IGxpbmdlciBpbiBvbGQgcGVyc2lzdGVkIHR1cm5zLlxuXHRcdFx0XHRcdHsgdHlwZTogJ3Rlcm1pbmFsQ29tcGxldGUnLCBleGl0Q29kZTogMTI3LCBwcmV2aWV3OiAnbGVnYWN5IHByZXZpZXdcXG4nIH0gYXMgdW5rbm93biBhcyBUb29sUmVzdWx0Q29udGVudCxcblx0XHRcdFx0XSxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCB0dXJuID0gY3JlYXRlVHVybih7XG5cdFx0XHRcdHJlc3BvbnNlUGFydHM6IFt7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9IGFzIFRvb2xDYWxsUmVzcG9uc2VQYXJ0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRjb25zdCBoaXN0b3J5ID0gdHVybnNUb0hpc3RvcnkoVVJJLmZpbGUoJy8nKSwgW3R1cm5dLCAncCcpO1xuXHRcdFx0Y29uc3QgcmVzcG9uc2UgPSBoaXN0b3J5WzFdO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHJlc3BvbnNlLnR5cGUsICdyZXNwb25zZScpO1xuXHRcdFx0aWYgKHJlc3BvbnNlLnR5cGUgIT09ICdyZXNwb25zZScpIHsgcmV0dXJuOyB9XG5cdFx0XHRjb25zdCBzZXJpYWxpemVkID0gcmVzcG9uc2UucGFydHNbMF0gYXMgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQ7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGdldFNlcmlhbGl6ZWRUZXJtaW5hbERhdGEoc2VyaWFsaXplZCk7XG5cdFx0XHQvLyBUaGUgbGVnYWN5IGJsb2NrJ3MgY29tcGxldGlvbiBkYXRhIGlzIHByZXNlcnZlZCBpbnN0ZWFkIG9mXG5cdFx0XHQvLyBkZWdyYWRpbmcgdG8gdGhlIFRleHQgZmFsbGJhY2sgYW5kIHRoZSB0b29sIHN1Y2Nlc3MgZmxhZy5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdsZWdhY3kgcHJldmlld1xcclxcbicpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlPy5leGl0Q29kZSwgMTI3KTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2tlZXBzIHplcm8gdGVybWluYWwgY29tcGxldGlvbiBleGl0IGNvZGUgYXMgc3VjY2VzcyBmb3IgY29tcGxldGVkIFNESyBzaGVsbCB0b29sIGhpc3RvcnknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHsgZXhpdENvZGU6IDAgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0XHRzdWNjZXNzOiB0cnVlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IGZhbGwgYmFjayB0byB0b29sIHN1Y2Nlc3Mgd2hlbiB0ZXJtaW5hbCBjb21wbGV0aW9uIGhhcyBubyBleGl0IGNvZGUnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZUNvbXBsZXRlZFRvb2xDYWxsKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAncHdkJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICcvcmVwb1xcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHt9IH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgdHVybiA9IGNyZWF0ZVR1cm4oe1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzOiBbeyBraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLCB0b29sQ2FsbDogdGMgfSBhcyBUb29sQ2FsbFJlc3BvbnNlUGFydF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaGlzdG9yeSA9IHR1cm5zVG9IaXN0b3J5KFVSSS5maWxlKCcvJyksIFt0dXJuXSwgJ3AnKTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlID0gaGlzdG9yeVsxXTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXNwb25zZS50eXBlLCAncmVzcG9uc2UnKTtcblx0XHRcdGlmIChyZXNwb25zZS50eXBlICE9PSAncmVzcG9uc2UnKSB7IHJldHVybjsgfVxuXHRcdFx0Y29uc3Qgc2VyaWFsaXplZCA9IHJlc3BvbnNlLnBhcnRzWzBdIGFzIElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IHNlcmlhbGl6ZWQudG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRTdGF0ZSwgdW5kZWZpbmVkKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3VzZXMgZmFpbGVkIHRvb2wgc3RhdGUgd2hlbiBhbiBvdXRwdXQtb25seSB0ZXJtaW5hbCBoYXMgbm8gc2hlbGwgZXhpdCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlQ29tcGxldGVkVG9vbENhbGwoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3Rlcm1pbmFsJyB9LFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdlY2kgaGknLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJy9iaW4vYmFzaDogZWNpOiBjb21tYW5kIG5vdCBmb3VuZFxcbicgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHRcdHN1Y2Nlc3M6IGZhbHNlLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IHR1cm4gPSBjcmVhdGVUdXJuKHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW3sga2luZDogUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCwgdG9vbENhbGw6IHRjIH0gYXMgVG9vbENhbGxSZXNwb25zZVBhcnRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGNvbnN0IGhpc3RvcnkgPSB0dXJuc1RvSGlzdG9yeShVUkkuZmlsZSgnLycpLCBbdHVybl0sICdwJyk7XG5cdFx0XHRjb25zdCByZXNwb25zZSA9IGhpc3RvcnlbMV07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwocmVzcG9uc2UudHlwZSwgJ3Jlc3BvbnNlJyk7XG5cdFx0XHRpZiAocmVzcG9uc2UudHlwZSAhPT0gJ3Jlc3BvbnNlJykgeyByZXR1cm47IH1cblx0XHRcdGNvbnN0IHNlcmlhbGl6ZWQgPSByZXNwb25zZS5wYXJ0c1swXSBhcyBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZDtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBzZXJpYWxpemVkLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFN0YXRlLCB7IGV4aXRDb2RlOiAxIH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncnVubmluZyB0b29sIGNhbGwgd2l0aCB0ZXJtaW5hbCBjb250ZW50IGJsb2NrIHNldHMgdGVybWluYWxDb21tYW5kVXJpJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnbnBtIHRlc3QnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3J1bm5pbmctdGVybScsIHRpdGxlOiAnVGVybWluYWwnIH0sXG5cdFx0XHRcdF0sXG5cdFx0XHR9KTtcblxuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0Lm9rKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRVcmk/OiB7IHRvU3RyaW5nKCk6IHN0cmluZyB9IH07XG5cdFx0XHRhc3NlcnQub2sodGVybURhdGEudGVybWluYWxDb21tYW5kVXJpKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkudG9TdHJpbmcoKSwgJ2FnZW50aG9zdC10ZXJtaW5hbDovcnVubmluZy10ZXJtJyk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdmaW5hbGl6ZSBwcmVzZXJ2ZXMgdGVybWluYWwgVVJJIGZyb20gY29udGVudCBibG9jaycsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwsIHJlc291cmNlOiAnYWdlbnRob3N0LXRlcm1pbmFsOi8vL2ZpbmFsLXRlcm0nLCB0aXRsZTogJ1Rlcm1pbmFsJyB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cblx0XHRcdGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbiwge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogJ3RjLTEnLFxuXHRcdFx0XHR0b29sTmFtZTogJ3Rlc3RfdG9vbCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnVGVzdCBUb29sJyxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6ICdSdW5uaW5nIHRlc3QgdG9vbC4uLicsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2VjaG8gaGVsbG8nLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0c3VjY2VzczogdHJ1ZSxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogJ1JhbiBlY2hvIGhlbGxvJyxcblx0XHRcdFx0Y29udGVudDogW1xuXHRcdFx0XHRcdHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRlcm1pbmFsLCByZXNvdXJjZTogJ2FnZW50aG9zdC10ZXJtaW5hbDovLy9maW5hbC10ZXJtJywgdGl0bGU6ICdUZXJtaW5hbCcgfSxcblx0XHRcdFx0XSxcblx0XHRcdH0pO1xuXG5cdFx0XHRhc3NlcnQub2soaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZFVyaT86IHsgdG9TdHJpbmcoKTogc3RyaW5nIH07IHRlcm1pbmFsQ29tbWFuZFN0YXRlPzogeyBleGl0Q29kZTogbnVtYmVyIH0gfTtcblx0XHRcdGFzc2VydC5vayh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmkpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsQ29tbWFuZFVyaS50b1N0cmluZygpLCAnYWdlbnRob3N0LXRlcm1pbmFsOi9maW5hbC10ZXJtJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAwKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2ZpbmFsaXplIHVzZXMgdGVybWluYWwgY29tcGxldGlvbiBleGl0IGNvZGUgb3ZlciBTREsgdG9vbCBzdWNjZXNzJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdFx0dG9vbElucHV0OiAnZmFsc2UnLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblxuXHRcdFx0ZmluYWxpemVUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB7XG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHR0b29sQ2FsbElkOiAndGMtMScsXG5cdFx0XHRcdHRvb2xOYW1lOiAnYmFzaCcsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiAnUnVuIFNoZWxsIENvbW1hbmQnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogJ1J1bm5pbmcgc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ2ZhbHNlJyxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6ICdSYW4gZmFsc2UnLFxuXHRcdFx0XHRjb250ZW50OiBbXG5cdFx0XHRcdFx0eyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJycgfSxcblx0XHRcdFx0XHR7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCwgcmVzb3VyY2U6ICdhZ2VudGhvc3QtdGVybWluYWw6Ly9zaGVsbC9jb3BpbG90Tm9uUHR5U2hlbGxzL3RjLTEnLCB0aXRsZTogJ1J1biBTaGVsbCBDb21tYW5kJywgaXNQdHk6IGZhbHNlLCByZXN1bHQ6IHsgZXhpdENvZGU6IDEgfSB9LFxuXHRcdFx0XHRdLFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICd0ZXJtaW5hbCcpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMgeyBraW5kOiAndGVybWluYWwnOyB0ZXJtaW5hbENvbW1hbmRTdGF0ZT86IHsgZXhpdENvZGU6IG51bWJlciB9IH07XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kU3RhdGU/LmV4aXRDb2RlLCAxKTtcblx0XHR9KTtcblxuXHR9KTtcblxuXHRzdWl0ZSgndXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGEnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdzZXRzIHN1YmFnZW50IHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBjb250ZW50IGFuZCBub3RpZmllcyBzdGF0ZSBvYnNlcnZlcnMnLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cblx0XHRcdC8vIFNpbXVsYXRlIHN1YmFnZW50IGNvbnRlbnQgYXJyaXZpbmcgdmlhIENoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkXG5cdFx0XHRjb25zdCBydW5uaW5nVGM6IFRvb2xDYWxsUnVubmluZ1N0YXRlID0ge1xuXHRcdFx0XHQuLi50Yyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRfbWV0YTogeyB0b29sS2luZDogJ3N1YmFnZW50Jywgc3ViYWdlbnREZXNjcmlwdGlvbjogJ0ZpbmQgcmVsYXRlZCBmaWxlcycgfSxcblx0XHRcdFx0Y29udGVudDogW3tcblx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRcdFx0cmVzb3VyY2U6ICdjb3BpbG90Oi8vc2Vzc2lvbi9zdWJhZ2VudC90Yy0xJyxcblx0XHRcdFx0XHR0aXRsZTogJ0V4cGxvcmUnLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogJ2V4cGxvcmUnLFxuXHRcdFx0XHRcdGRlc2NyaXB0aW9uOiAnRXhwbG9yZXMgdGhlIGNvZGViYXNlJyxcblx0XHRcdFx0fV0sXG5cdFx0XHR9O1xuXG5cdFx0XHRsZXQgc3RhdGVDaGFuZ2VkID0gZmFsc2U7XG5cdFx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bihyID0+IHtcblx0XHRcdFx0aW52b2NhdGlvbi5zdGF0ZS5yZWFkKHIpO1xuXHRcdFx0XHRzdGF0ZUNoYW5nZWQgPSB0cnVlO1xuXHRcdFx0fSk7XG5cdFx0XHRzdGF0ZUNoYW5nZWQgPSBmYWxzZTsgLy8gcmVzZXQgYWZ0ZXIgaW5pdGlhbCByZWFkXG5cdFx0XHRjb25zdCBiZWZvcmUgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChzdGF0ZUNoYW5nZWQsIHRydWUsICdzdGF0ZSBvYnNlcnZlcnMgc2hvdWxkIGJlIG5vdGlmaWVkJyk7XG5cdFx0XHRhc3NlcnQubm90U3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCBiZWZvcmUsICd0b29sU3BlY2lmaWNEYXRhIHNob3VsZCBiZSByZXBsYWNlZCcpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3N1YmFnZW50Jyk7XG5cdFx0XHRpZiAoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuYWdlbnROYW1lLCAnZXhwbG9yZScpO1xuXHRcdFx0XHQvLyBkZXNjcmlwdGlvbiBpcyB0aGUgVEFTSyBkZXNjcmlwdGlvbiBmcm9tIF9tZXRhLCBub3QgdGhlIGFnZW50IGRlc2NyaXB0aW9uXG5cdFx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24sICdGaW5kIHJlbGF0ZWQgZmlsZXMnKTtcblx0XHRcdH1cblx0XHRcdGRpc3Bvc2FibGUuZGlzcG9zZSgpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIHN1YmFnZW50IGNyZWRpdHMgd2hlbiByZWZyZXNoaW5nIHRvb2xTcGVjaWZpY0RhdGEgZnJvbSBjb250ZW50JywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICdzdWJhZ2VudCcsIHN1YmFnZW50RGVzY3JpcHRpb246ICdGaW5kIHJlbGF0ZWQgZmlsZXMnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXG5cdFx0XHQvLyBTaW11bGF0ZSB0aGUgc2Vzc2lvbiBoYW5kbGVyIGhhdmluZyByZWNvcmRlZCB0aGlzIHN1YmFnZW50J3MgY3JlZGl0cy5cblx0XHRcdGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgPSAxLjU7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnLFxuXHRcdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMsIDEuNSwgJ2NyZWRpdHMgc2hvdWxkIHN1cnZpdmUgYSB0b29sU3BlY2lmaWNEYXRhIHJlZnJlc2gnKTtcblx0XHRcdH1cblx0XHR9KTtcblxuXHRcdHRlc3QoJ3ByZXNlcnZlcyBzdWJhZ2VudCBtb2RlbCBuYW1lIHdoZW4gcmVmcmVzaGluZyB0b29sU3BlY2lmaWNEYXRhIGZyb20gY29udGVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7XG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kLCAnc3ViYWdlbnQnKTtcblxuXHRcdFx0Ly8gU2ltdWxhdGUgdGhlIHNlc3Npb24gaGFuZGxlciBoYXZpbmcgcmVjb3JkZWQgdGhpcyBzdWJhZ2VudCdzIG1vZGVsLlxuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lID0gJ0NsYXVkZSBTb25uZXQgNCc7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAnc3ViYWdlbnQnLCBzdWJhZ2VudERlc2NyaXB0aW9uOiAnRmluZCByZWxhdGVkIGZpbGVzJyB9LFxuXHRcdFx0XHRjb250ZW50OiBbe1xuXHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0XHRyZXNvdXJjZTogJ2NvcGlsb3Q6Ly9zZXNzaW9uL3N1YmFnZW50L3RjLTEnLFxuXHRcdFx0XHRcdHRpdGxlOiAnRXhwbG9yZScsXG5cdFx0XHRcdFx0YWdlbnROYW1lOiAnZXhwbG9yZScsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246ICdFeHBsb3JlcyB0aGUgY29kZWJhc2UnLFxuXHRcdFx0XHR9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQsICdzdWJhZ2VudCcpO1xuXHRcdFx0aWYgKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3N1YmFnZW50Jykge1xuXHRcdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSwgJ0NsYXVkZSBTb25uZXQgNCcsICdtb2RlbCBuYW1lIHNob3VsZCBzdXJ2aXZlIGEgdG9vbFNwZWNpZmljRGF0YSByZWZyZXNoJyk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtb3VudHMgTUNQIEFwcCB0b29sU3BlY2lmaWNEYXRhIHdoZW4gYSBjb25maXJtZWQgTUNQIHRvb2wgc3RhcnRzIHJ1bm5pbmcnLCAoKSA9PiB7XG5cdFx0XHQvLyBUaGUgTUNQIEFwcCBjaGFubmVsIGlzIHByZXNlbnQgaW4gYF9tZXRhLnVpYCBmcm9tIHRoZSBmaXJzdCB0b29sXG5cdFx0XHQvLyBzdGF0ZSAoYSB0b29sIGNhbm5vdCBzdGFydCB1bnRpbCBpdHMgc2VydmVyIGlzIFJlYWR5KSwgYnV0IHRoZSBBcHBcblx0XHRcdC8vIGlzIG9ubHkgbW91bnRlZCBvbmNlIHRoZSB0b29sIGxlYXZlcyBjb25maXJtYXRpb24gYW5kIHN0YXJ0c1xuXHRcdFx0Ly8gcnVubmluZy5cblx0XHRcdGNvbnN0IG1ldGEgPSB7XG5cdFx0XHRcdHVpOiB7XG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6ICd1aTovL2RvY3MvYXBwJyxcblx0XHRcdFx0XHRjaGFubmVsOiAnbWNwOi8vY29waWxvdC90ZXN0LXNlc3Npb24tMS9kb2NzJyxcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih7XG5cdFx0XHRcdHRvb2xDYWxsSWQ6ICd0Yy0xJyxcblx0XHRcdFx0dG9vbE5hbWU6ICd0ZXN0X3Rvb2wnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1Rlc3QgVG9vbCcsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnUnVubmluZyB0ZXN0IHRvb2wuLi4nLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24sXG5cdFx0XHRcdHRvb2xJbnB1dDogJ3tcInRvcGljXCI6XCJtZXRhZGF0YVwifScsXG5cdFx0XHRcdGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCwgY3VzdG9taXphdGlvbklkOiAnZG9jcy1jdXN0b21pemF0aW9uJyB9LFxuXHRcdFx0XHRfbWV0YTogbWV0YSxcblx0XHRcdH0pO1xuXHRcdFx0Ly8gQ29uZmlybWF0aW9uIHN0YXRlIGNhcnJpZXMgdGhlIHJhdyBpbnB1dCBidXQgZG9lcyBub3QgbW91bnQgdGhlIEFwcC5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwoaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLCB7IGtpbmQ6ICdpbnB1dCcsIHJhd0lucHV0OiB7IHRvcGljOiAnbWV0YWRhdGEnIH0gfSk7XG5cblx0XHRcdGxldCBzdGF0ZUNoYW5nZWQgPSBmYWxzZTtcblx0XHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRvcnVuKHIgPT4ge1xuXHRcdFx0XHRpbnZvY2F0aW9uLnN0YXRlLnJlYWQocik7XG5cdFx0XHRcdHN0YXRlQ2hhbmdlZCA9IHRydWU7XG5cdFx0XHR9KTtcblx0XHRcdHN0YXRlQ2hhbmdlZCA9IGZhbHNlO1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbElucHV0OiAne1widG9waWNcIjpcIm1ldGFkYXRhXCJ9Jyxcblx0XHRcdFx0Y29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6ICdkb2NzLWN1c3RvbWl6YXRpb24nIH0sXG5cdFx0XHRcdF9tZXRhOiBtZXRhLFxuXHRcdFx0fSkpO1xuXG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoc3RhdGVDaGFuZ2VkLCB0cnVlLCAnc3RhdGUgb2JzZXJ2ZXJzIHNob3VsZCBiZSBub3RpZmllZCcpO1xuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEsIHtcblx0XHRcdFx0a2luZDogJ2lucHV0Jyxcblx0XHRcdFx0cmF3SW5wdXQ6IHsgdG9waWM6ICdtZXRhZGF0YScgfSxcblx0XHRcdFx0bWNwQXBwRGF0YToge1xuXHRcdFx0XHRcdGtpbmQ6ICdhZ2VudEhvc3QnLFxuXHRcdFx0XHRcdHJlc291cmNlVXJpOiAndWk6Ly9kb2NzL2FwcCcsXG5cdFx0XHRcdFx0c2VydmVySWQ6ICdkb2NzLWN1c3RvbWl6YXRpb24nLFxuXHRcdFx0XHRcdGNoYW5uZWw6ICdtY3A6Ly9jb3BpbG90L3Rlc3Qtc2Vzc2lvbi0xL2RvY3MnLFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ2RvZXMgbm90IG5vdGlmeSB3aGVuIG5vIHN1YmFnZW50IGNvbnRlbnQgaXMgcHJlc2VudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHRjID0gY3JlYXRlVG9vbENhbGxTdGF0ZSh7fSk7XG5cdFx0XHRjb25zdCBpbnZvY2F0aW9uID0gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0Yyk7XG5cdFx0XHRjb25zdCBvcmlnaW5hbERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE7XG5cblx0XHRcdGNvbnN0IHJ1bm5pbmdUYzogVG9vbENhbGxSdW5uaW5nU3RhdGUgPSB7XG5cdFx0XHRcdC4uLnRjLFxuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcsXG5cdFx0XHR9O1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBydW5uaW5nVGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSwgb3JpZ2luYWxEYXRhLCAndG9vbFNwZWNpZmljRGF0YSBzaG91bGQgbm90IGNoYW5nZScpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncmVmcmVzaGVzIHRlcm1pbmFsIG91dHB1dCBhcyB0ZXh0IGNvbnRlbnQgc3RyZWFtcyAoYnVpbHQtaW4gYmFzaCknLCAoKSA9PiB7XG5cdFx0XHRjb25zdCB0YyA9IGNyZWF0ZVRvb2xDYWxsU3RhdGUoe1xuXHRcdFx0XHR0b29sTmFtZTogJ2Jhc2gnLFxuXHRcdFx0XHR0b29sSW5wdXQ6ICdzbGVlcCAxOyBlY2hvIGhpJyxcblx0XHRcdFx0X21ldGE6IHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSxcblx0XHRcdH0pO1xuXHRcdFx0Y29uc3QgaW52b2NhdGlvbiA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMpO1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCwgJ3Rlcm1pbmFsJyk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwoKGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH0gfSkudGVybWluYWxDb21tYW5kT3V0cHV0LCB1bmRlZmluZWQpO1xuXG5cdFx0XHRjb25zdCBydW5uaW5nVGM6IFRvb2xDYWxsUnVubmluZ1N0YXRlID0ge1xuXHRcdFx0XHQuLi50Yyxcblx0XHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nLFxuXHRcdFx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogJ2hpXFxuJyB9XSxcblx0XHRcdH07XG5cblx0XHRcdHVwZGF0ZVJ1bm5pbmdUb29sU3BlY2lmaWNEYXRhKGludm9jYXRpb24sIHJ1bm5pbmdUYyk7XG5cdFx0XHRjb25zdCB0ZXJtRGF0YSA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSBhcyB7IGtpbmQ6ICd0ZXJtaW5hbCc7IHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH0gfTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS5raW5kLCAndGVybWluYWwnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdoaVxcclxcbicpO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgncHJlc2VydmVzIEFIUCB0ZXJtaW5hbCBmaWVsZHMgKHRlcm1pbmFsVG9vbFNlc3Npb25JZCwgdGVybWluYWxDb21tYW5kVXJpKSB3aGVuIHJlZnJlc2hpbmcgb3V0cHV0JywgKCkgPT4ge1xuXHRcdFx0Ly8gU2ltdWxhdGVzIHRoZSByYWNlIHdoZXJlIGBfcmV2aXZlVGVybWluYWxJZk5lZWRlZGAgaGFzIHBvcHVsYXRlZFxuXHRcdFx0Ly8gQUhQIHRlcm1pbmFsIGZpZWxkcyBhbmQgYSBzdWJzZXF1ZW50IGNvbnRlbnQgY2hhbmdlIHRyaWdnZXJzXG5cdFx0XHQvLyBgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGFgLiBUaGUgYXN5bmMtcG9wdWxhdGVkIGZpZWxkc1xuXHRcdFx0Ly8gbXVzdCBzdXJ2aXZlIHRoZSByZWZyZXNoLlxuXHRcdFx0Y29uc3QgdGMgPSBjcmVhdGVUb29sQ2FsbFN0YXRlKHtcblx0XHRcdFx0dG9vbE5hbWU6ICdiYXNoJyxcblx0XHRcdFx0dG9vbElucHV0OiAnZWNobyBoaScsXG5cdFx0XHRcdF9tZXRhOiB7IHRvb2xLaW5kOiAndGVybWluYWwnIH0sXG5cdFx0XHR9KTtcblx0XHRcdGNvbnN0IGludm9jYXRpb24gPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjKTtcblx0XHRcdGNvbnN0IHJldml2ZVVyaSA9IFVSSS5wYXJzZSgnYWdlbnRob3N0LXRlcm1pbmFsOi8vL3Q5Jyk7XG5cdFx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRcdGtpbmQ6ICd0ZXJtaW5hbCcsXG5cdFx0XHRcdGNvbW1hbmRMaW5lOiB7IG9yaWdpbmFsOiAnZWNobyBoaScgfSxcblx0XHRcdFx0bGFuZ3VhZ2U6ICdzaGVsbHNjcmlwdCcsXG5cdFx0XHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogJ3Nlc3Npb24taWQtZnJvbS1yZXZpdmUnLFxuXHRcdFx0XHR0ZXJtaW5hbENvbW1hbmRVcmk6IHJldml2ZVVyaSxcblx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQ6ICdjbWQtaWQtZnJvbS1yZXZpdmUnLFxuXHRcdFx0fTtcblxuXHRcdFx0Y29uc3QgcnVubmluZ1RjOiBUb29sQ2FsbFJ1bm5pbmdTdGF0ZSA9IHtcblx0XHRcdFx0Li4udGMsXG5cdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuUnVubmluZyxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6ICdoaVxcbicgfV0sXG5cdFx0XHR9O1xuXG5cdFx0XHR1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShpbnZvY2F0aW9uLCBydW5uaW5nVGMpO1xuXHRcdFx0Y29uc3QgdGVybURhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgYXMge1xuXHRcdFx0XHRraW5kOiAndGVybWluYWwnO1xuXHRcdFx0XHR0ZXJtaW5hbFRvb2xTZXNzaW9uSWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZFVyaT86IFVSSTtcblx0XHRcdFx0dGVybWluYWxDb21tYW5kSWQ/OiBzdHJpbmc7XG5cdFx0XHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dD86IHsgdGV4dDogc3RyaW5nIH07XG5cdFx0XHR9O1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHRlcm1EYXRhLnRlcm1pbmFsVG9vbFNlc3Npb25JZCwgJ3Nlc3Npb24taWQtZnJvbS1yZXZpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRVcmksIHJldml2ZVVyaSk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodGVybURhdGEudGVybWluYWxDb21tYW5kSWQsICdjbWQtaWQtZnJvbS1yZXZpdmUnKTtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh0ZXJtRGF0YS50ZXJtaW5hbENvbW1hbmRPdXRwdXQ/LnRleHQsICdoaVxcclxcbicpO1xuXHRcdH0pO1xuXHR9KTtcblxuXHRzdWl0ZSgndXNhZ2VJbmZvVG9RdW90YXMnLCAoKSA9PiB7XG5cblx0XHR0ZXN0KCdyZXR1cm5zIHVuZGVmaW5lZCB3aGVuIG5vIHF1b3RhIHNuYXBzaG90cyBwcmVzZW50JywgKCkgPT4ge1xuXHRcdFx0YXNzZXJ0LnN0cmljdEVxdWFsKHVzYWdlSW5mb1RvUXVvdGFzKHVuZGVmaW5lZCksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VJbmZvVG9RdW90YXMoeyBpbnB1dFRva2VuczogMTAgfSksIHVuZGVmaW5lZCk7XG5cdFx0XHRhc3NlcnQuc3RyaWN0RXF1YWwodXNhZ2VJbmZvVG9RdW90YXMoeyBfbWV0YTogeyBjb3N0OiAxIH0gfSksIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdtYXBzIHByZW1pdW0gYW5kIGNoYXQgc25hcHNob3RzLCBkZXJpdmluZyBhZGRpdGlvbmFsIHVzYWdlIGFuZCByZXNldCBkYXRlJywgKCkgPT4ge1xuXHRcdFx0Y29uc3QgcmVzdWx0ID0gdXNhZ2VJbmZvVG9RdW90YXMoe1xuXHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdHF1b3RhU25hcHNob3RzOiB7XG5cdFx0XHRcdFx0XHRwcmVtaXVtX2ludGVyYWN0aW9uczoge1xuXHRcdFx0XHRcdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRSZXF1ZXN0czogMzAwLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDc1LFxuXHRcdFx0XHRcdFx0XHRyZW1haW5pbmdQZXJjZW50YWdlOiA3NSxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZTogMS41LFxuXHRcdFx0XHRcdFx0XHRvdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YTogdHJ1ZSxcblx0XHRcdFx0XHRcdFx0cmVzZXREYXRlOiAnMjAyNi0wNy0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0XHRjaGF0OiB7XG5cdFx0XHRcdFx0XHRcdGlzVW5saW1pdGVkRW50aXRsZW1lbnQ6IHRydWUsXG5cdFx0XHRcdFx0XHRcdGVudGl0bGVtZW50UmVxdWVzdHM6IC0xLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDEwLFxuXHRcdFx0XHRcdFx0XHRyZW1haW5pbmdQZXJjZW50YWdlOiAxMDAsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9KTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0cHJlbWl1bUNoYXQ6IHtcblx0XHRcdFx0XHRwZXJjZW50UmVtYWluaW5nOiA3NSxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IGZhbHNlLFxuXHRcdFx0XHRcdGVudGl0bGVtZW50OiAzMDAsXG5cdFx0XHRcdFx0cXVvdGFSZW1haW5pbmc6IDIyNSxcblx0XHRcdFx0XHRyZXNldEF0OiBEYXRlLnBhcnNlKCcyMDI2LTA3LTAxVDAwOjAwOjAwLjAwMFonKSxcblx0XHRcdFx0fSxcblx0XHRcdFx0Y2hhdDoge1xuXHRcdFx0XHRcdHBlcmNlbnRSZW1haW5pbmc6IDEwMCxcblx0XHRcdFx0XHR1bmxpbWl0ZWQ6IHRydWUsXG5cdFx0XHRcdFx0ZW50aXRsZW1lbnQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRxdW90YVJlbWFpbmluZzogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdHJlc2V0QXQ6IHVuZGVmaW5lZCxcblx0XHRcdFx0fSxcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogdHJ1ZSxcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlQ291bnQ6IDEuNSxcblx0XHRcdFx0cmVzZXREYXRlOiAnMjAyNi0wNy0wMVQwMDowMDowMC4wMDBaJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgnc2tpcHMgY2F0ZWdvcmllcyB3aXRoIG5vIGFsbG9jYXRlZCBlbnRpdGxlbWVudCcsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHVzYWdlSW5mb1RvUXVvdGFzKHtcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRxdW90YVNuYXBzaG90czoge1xuXHRcdFx0XHRcdFx0cHJlbWl1bV9pbnRlcmFjdGlvbnM6IHtcblx0XHRcdFx0XHRcdFx0aXNVbmxpbWl0ZWRFbnRpdGxlbWVudDogZmFsc2UsXG5cdFx0XHRcdFx0XHRcdGVudGl0bGVtZW50UmVxdWVzdHM6IDAsXG5cdFx0XHRcdFx0XHRcdHVzZWRSZXF1ZXN0czogMCxcblx0XHRcdFx0XHRcdFx0cmVtYWluaW5nUGVyY2VudGFnZTogMCxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZTogMCxcblx0XHRcdFx0XHRcdFx0b3ZlcmFnZUFsbG93ZWRXaXRoRXhoYXVzdGVkUXVvdGE6IGZhbHNlLFxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdC8vIFRoZSAwLWVudGl0bGVtZW50IHByZW1pdW0gc25hcHNob3QgaXMgc2tpcHBlZCwgYnV0IGFkZGl0aW9uYWwtdXNhZ2UgZmllbGRzIGFyZSBzdGlsbCBkZXJpdmVkLlxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbChyZXN1bHQsIHtcblx0XHRcdFx0YWRkaXRpb25hbFVzYWdlRW5hYmxlZDogZmFsc2UsXG5cdFx0XHRcdGFkZGl0aW9uYWxVc2FnZUNvdW50OiAwLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cblx0XHR0ZXN0KCdza2lwcyBhIGNhdGVnb3J5IHdob3NlIHJlbWFpbmluZ1BlcmNlbnRhZ2UgaXMgbWlzc2luZycsICgpID0+IHtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHVzYWdlSW5mb1RvUXVvdGFzKHtcblx0XHRcdFx0X21ldGE6IHtcblx0XHRcdFx0XHRxdW90YVNuYXBzaG90czoge1xuXHRcdFx0XHRcdFx0Y2hhdDoge1xuXHRcdFx0XHRcdFx0XHRpc1VubGltaXRlZEVudGl0bGVtZW50OiBmYWxzZSxcblx0XHRcdFx0XHRcdFx0ZW50aXRsZW1lbnRSZXF1ZXN0czogMTAwLFxuXHRcdFx0XHRcdFx0XHR1c2VkUmVxdWVzdHM6IDEwLFxuXHRcdFx0XHRcdFx0XHQvLyByZW1haW5pbmdQZXJjZW50YWdlIGludGVudGlvbmFsbHkgYWJzZW50IFx1MjAxNCBtdXN0IG5vdCBtYXNxdWVyYWRlIGFzIGV4aGF1c3RlZCAoMCUpLlxuXHRcdFx0XHRcdFx0fSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9LFxuXHRcdFx0fSk7XG5cblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbChyZXN1bHQsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCdmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzJywgKCkgPT4ge1xuXG5cdFx0Y29uc3QgYXV0byA9IHsgbmFtZTogJ0F1dG8nIH07XG5cblx0XHR0ZXN0KCdhcHBlbmRzIHRoZSBiaWxsZWQgbW9kZWwgaWQgd2hlbiBvbmUgaXMgc3VwcGxpZWQnLCAoKSA9PiB7XG5cdFx0XHQvLyBBIHBpY2sgd2hvc2UgYmlsbGVkIG1vZGVsIGlzIHVucmVnaXN0ZXJlZCAoZS5nLiBcIkF1dG9cIiBiaWxsZWQgYXMgXCJyYXB0b3ItbWluaVwiKSBzaG93cyBcIkF1dG8gKHJhcHRvci1taW5pKVwiLlxuXHRcdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0XHRyZXNvbHZlZE1vZGVsOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sICdyYXB0b3ItbWluaScsIHVuZGVmaW5lZCksXG5cdFx0XHRcdHdpdGhQcmljaW5nOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHsgLi4uYXV0bywgcHJpY2luZzogJzB4JyB9LCAncmFwdG9yLW1pbmknLCB1bmRlZmluZWQpLFxuXHRcdFx0XHR3aXRoQ3JlZGl0czogZm9ybWF0VHVyblJlc3BvbnNlRGV0YWlscyhhdXRvLCAncmFwdG9yLW1pbmknLCB7IF9tZXRhOiB7IGNvc3Q6IDIgfSB9KSxcblx0XHRcdFx0b25lQ3JlZGl0OiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sICdyYXB0b3ItbWluaScsIHsgX21ldGE6IHsgY29zdDogMSB9IH0pLFxuXHRcdFx0XHRub0JpbGxlZE1vZGVsOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKGF1dG8sIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSxcblx0XHRcdH07XG5cblx0XHRcdGFzc2VydC5kZWVwU3RyaWN0RXF1YWwocmVzdWx0LCB7XG5cdFx0XHRcdHJlc29sdmVkTW9kZWw6ICdBdXRvIChyYXB0b3ItbWluaSknLFxuXHRcdFx0XHR3aXRoUHJpY2luZzogJ0F1dG8gKHJhcHRvci1taW5pKSBcdTAwQjcgMHgnLFxuXHRcdFx0XHR3aXRoQ3JlZGl0czogJ0F1dG8gKHJhcHRvci1taW5pKSBcdTIwMjIgMiBjcmVkaXRzJyxcblx0XHRcdFx0b25lQ3JlZGl0OiAnQXV0byAocmFwdG9yLW1pbmkpIFx1MjAyMiAxIGNyZWRpdCcsXG5cdFx0XHRcdG5vQmlsbGVkTW9kZWw6ICdBdXRvJyxcblx0XHRcdH0pO1xuXHRcdH0pO1xuXG5cdFx0dGVzdCgndXNlcyB0aGUgcmVnaXN0ZXJlZCBtb2RlbCBuYW1lIGFzLWlzIHdpdGhvdXQgYSBiaWxsZWQgaWQsIHVuZGVmaW5lZCB3aGVuIHVua25vd24nLCAoKSA9PiB7XG5cdFx0XHRjb25zdCBzb25uZXQgPSB7IG5hbWU6ICdDbGF1ZGUgU29ubmV0IDQuNScsIHByaWNpbmc6ICcxeCcgfTtcblx0XHRcdGNvbnN0IHJlc3VsdCA9IHtcblx0XHRcdFx0Y29uY3JldGU6IGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMoc29ubmV0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCksXG5cdFx0XHRcdGNvbmNyZXRlV2l0aENyZWRpdHM6IGZvcm1hdFR1cm5SZXNwb25zZURldGFpbHMoc29ubmV0LCB1bmRlZmluZWQsIHsgX21ldGE6IHsgY29zdDogMiB9IH0pLFxuXHRcdFx0XHR1bmtub3duOiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKHVuZGVmaW5lZCwgJ3JhcHRvci1taW5pJywgeyBfbWV0YTogeyBjb3N0OiAyIH0gfSksXG5cdFx0XHR9O1xuXG5cdFx0XHRhc3NlcnQuZGVlcFN0cmljdEVxdWFsKHJlc3VsdCwge1xuXHRcdFx0XHRjb25jcmV0ZTogJ0NsYXVkZSBTb25uZXQgNC41IFx1MDBCNyAxeCcsXG5cdFx0XHRcdGNvbmNyZXRlV2l0aENyZWRpdHM6ICdDbGF1ZGUgU29ubmV0IDQuNSBcdTIwMjIgMiBjcmVkaXRzJyxcblx0XHRcdFx0dW5rbm93bjogdW5kZWZpbmVkLFxuXHRcdFx0fSk7XG5cdFx0fSk7XG5cdH0pO1xuXG5cdHN1aXRlKCd1c2FnZUluZm9Ub0NoYXRVc2FnZScsICgpID0+IHtcblx0XHR0ZXN0KCdjYXJyaWVzIHdob2xlLXR1cm4gcGVyLW1vZGVsIHRva2VuIHRvdGFscyBhbmQgcmVzb2x2ZXMgZGlzcGxheSBuYW1lcycsICgpID0+IHtcblx0XHRcdGNvbnN0IHR1cm5Ub2tlblRvdGFscyA9IFt7IG1vZGVsOiAnY2xhdWRlLW9wdXMtNC44JywgaW5wdXRUb2tlbnM6IDExMCwgY2FjaGVkVG9rZW5zOiA0LCBvdXRwdXRUb2tlbnM6IDIyMCB9XTtcblxuXHRcdFx0YXNzZXJ0LmRlZXBTdHJpY3RFcXVhbCh1c2FnZUluZm9Ub0NoYXRVc2FnZShcblx0XHRcdFx0eyBpbnB1dFRva2VuczogMzAsIG91dHB1dFRva2VuczogNDAsIF9tZXRhOiB7IHR1cm5Ub2tlblRvdGFscyB9IH0sXG5cdFx0XHRcdG1vZGVsID0+IG1vZGVsID09PSAnY2xhdWRlLW9wdXMtNC44JyA/ICdDbGF1ZGUgT3B1cyA0LjgnIDogdW5kZWZpbmVkLFxuXHRcdFx0KSwge1xuXHRcdFx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdFx0XHRwcm9tcHRUb2tlbnM6IDMwLFxuXHRcdFx0XHRjb21wbGV0aW9uVG9rZW5zOiA0MCxcblx0XHRcdFx0Y29waWxvdENyZWRpdHM6IHVuZGVmaW5lZCxcblx0XHRcdFx0c2Vzc2lvbkNvcGlsb3RDcmVkaXRzOiB1bmRlZmluZWQsXG5cdFx0XHRcdHByb21wdFRva2VuRGV0YWlsczogdW5kZWZpbmVkLFxuXHRcdFx0XHRtb2RlbFRvdGFsczogW3sgLi4udHVyblRva2VuVG90YWxzWzBdLCBtb2RlbDogJ0NsYXVkZSBPcHVzIDQuOCcgfV0sXG5cdFx0XHR9IHNhdGlzZmllcyBJQ2hhdFVzYWdlKTtcblx0XHR9KTtcblxuXHRcdHRlc3QoJ3JlcG9ydHMgbm8gdG90YWxzIHdoZW4gdGhlIHByb3ZpZGVyIGRpZCBub3Qgc3VwcGx5IGFueScsICgpID0+IHtcblx0XHRcdGFzc2VydC5zdHJpY3RFcXVhbCh1c2FnZUluZm9Ub0NoYXRVc2FnZSh7IGlucHV0VG9rZW5zOiAzMCwgb3V0cHV0VG9rZW5zOiA0MCB9KT8ubW9kZWxUb3RhbHMsIHVuZGVmaW5lZCk7XG5cdFx0fSk7XG5cdH0pO1xufSk7XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxPQUFPLFlBQVk7QUFDbkIsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsZUFBZTtBQUN4QixTQUFTLGNBQWM7QUFDdkIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsc0JBQTRDO0FBQ3JELFNBQVMsK0NBQStDO0FBQ3hELFNBQVMsZ0NBQWdDO0FBQ3pDLFNBQVMsb0NBQW9DO0FBQzdDLFNBQVMsNkJBQTZCLGlDQUFpQyxxQ0FBcUM7QUFDNUcsU0FBUyw2QkFBNkI7QUFDdEMsU0FBUyxrQkFBa0Isc0JBQXNCO0FBQ2pELFNBQVMsc0JBQXNCLHNCQUFzQiwwQkFBMEIsdUJBQXVCLHVCQUF1Qix1QkFBdUIsYUFBYSx5QkFBeUIsNEJBQTRCLDhCQUE4QixnQkFBZ0IsNEJBQTRCLHVCQUF1QixXQUFXLGtCQUFrQixtQkFBbUIsaUNBQW1MLGtDQUF3RTtBQUNsbUIsU0FBUyw0Q0FBd0YsNkNBQTZDO0FBQzlJLFNBQVMsNkJBQTZCO0FBQ3RDLFNBQVMscUJBQW9ELHVCQUFpSTtBQUM5TCxTQUFTLGdDQUFvRSxn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
