import { generateUuid } from "../../../../base/common/uuid.js";
import { toCodexReasoningMeta } from "../../common/meta/codexReasoningMeta.js";
import { localize } from "../../../../nls.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolResultContentType, TurnState } from "../../common/state/sessionState.js";
import { extractForwardedErrorInfo } from "../shared/proxyChatError.js";
import { getServerToolDisplay } from "../shared/serverToolGroups.js";
import { getWriteFileToolDisplay } from "./codexWriteFileTool.js";
import { ActiveClientToolSet } from "../activeClientState.js";
import { toAgentMessageDelegationMeta } from "../../common/meta/agentMessageDelegationMeta.js";
import { parseCodexDelegation } from "./codexDelegation.js";
import { unwrapShellInvocation } from "./codexShellCommand.js";
function createCodexSessionMapState(serverToolNames = /* @__PURE__ */ new Set(), clientToolSet = new ActiveClientToolSet()) {
  return {
    itemToPartId: /* @__PURE__ */ new Map(),
    itemToToolCall: /* @__PURE__ */ new Map(),
    itemToReasoningPartId: /* @__PURE__ */ new Map(),
    currentTurnId: void 0,
    turnDiffToolCall: void 0,
    clientToolSet,
    serverToolNames,
    mcpCustomizationIds: /* @__PURE__ */ new Map(),
    declinedToolCalls: /* @__PURE__ */ new Set(),
    deferredResponseActions: [],
    pendingPreflight: void 0,
    agentMessagePartCount: 0
  };
}
function resetCodexTurnMapState(state) {
  state.itemToPartId.clear();
  state.itemToToolCall.clear();
  state.itemToReasoningPartId.clear();
  state.declinedToolCalls.clear();
  state.deferredResponseActions.length = 0;
  state.pendingPreflight = void 0;
  state.turnDiffToolCall = void 0;
  state.agentMessagePartCount = 0;
}
function finalizeCodexTurnMapState(state, unresolvedToolMessage) {
  const preflightFlush = flushPendingPreflight(state);
  const orphanedToolCallActions = completeOrphanedToolCalls(state, unresolvedToolMessage);
  const turnDiffActions = completeTurnDiffToolCall(state, false, unresolvedToolMessage);
  const deferredResponseActions = flushDeferredResponseActions(state);
  resetCodexTurnMapState(state);
  return [...preflightFlush, ...orphanedToolCallActions, ...turnDiffActions, ...deferredResponseActions];
}
function completeTurnDiffToolCall(state, success, message) {
  const entry = state.turnDiffToolCall;
  state.turnDiffToolCall = void 0;
  if (!entry) {
    return [];
  }
  return [{
    type: ActionType.ChatToolCallComplete,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    result: {
      success,
      pastTenseMessage: success ? "Updated files" : "File updates stopped",
      content: [...entry.content],
      ...success ? {} : { error: { message } }
    }
  }];
}
function flushPendingPreflight(state) {
  const pending = state.pendingPreflight;
  if (!pending) {
    return [];
  }
  state.pendingPreflight = void 0;
  return pending.completion;
}
function deferResponseWhileToolCallIsOpen(state, actions) {
  if (!hasOpenCommandExecution(state) && !state.pendingPreflight) {
    return actions;
  }
  state.deferredResponseActions.push(...actions);
  return [];
}
function flushDeferredResponseActions(state) {
  if (hasOpenCommandExecution(state) || state.pendingPreflight || state.deferredResponseActions.length === 0) {
    return [];
  }
  return state.deferredResponseActions.splice(0);
}
function hasOpenCommandExecution(state) {
  return [...state.itemToToolCall.values()].some((entry) => entry.toolName === "shell");
}
function completeOrphanedToolCalls(state, errorMessage) {
  const orphanedToolCalls = [...state.itemToToolCall.values()];
  state.itemToToolCall.clear();
  return orphanedToolCalls.map((entry) => ({
    type: ActionType.ChatToolCallComplete,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    result: {
      success: false,
      pastTenseMessage: `Stopped ${entry.toolName}`,
      content: entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : void 0,
      error: { message: errorMessage }
    }
  }));
}
function extractUserInputText(content) {
  const collected = [];
  for (const c of content) {
    if (c.type === "text") {
      collected.push(c.text);
    }
  }
  return collected.join("\n\n");
}
function reasoningKey(itemId, kind, index) {
  return `${itemId}:${kind}:${index}`;
}
function ensureReasoningPart(state, turnId, key) {
  const existing = state.itemToReasoningPartId.get(key);
  if (existing) {
    return { partId: existing, actions: [] };
  }
  const partId = generateUuid();
  state.itemToReasoningPartId.set(key, partId);
  return {
    partId,
    actions: [{
      type: ActionType.ChatResponsePart,
      turnId,
      part: { kind: ResponsePartKind.Reasoning, id: partId, content: "" }
    }]
  };
}
function describeWebSearch(query, action) {
  if (action?.type === "search") {
    return action.queries?.join(", ") ?? action.query ?? query;
  }
  if (action?.type === "openPage") {
    return action.url ?? query;
  }
  if (action?.type === "findInPage") {
    return [action.pattern, action.url].filter(Boolean).join(" in ") || query;
  }
  return query;
}
function webSearchInvocationMessage(query) {
  return localize("codex.webSearch.inProgress", "Searching the web for {0}", query);
}
function webSearchPastTenseMessage(query) {
  return localize("codex.webSearch.completed", "Searched the web for {0}", query);
}
function describeFileChange(changes) {
  return changes.map((change) => {
    const kind = change.kind.type === "update" && change.kind.move_path ? `rename from ${change.kind.move_path}` : change.kind.type;
    return `${kind}: ${change.path}`;
  }).join("\n");
}
function fileChangeOutput(changes) {
  return changes.map((change) => `${describeFileChange([change])}
${change.diff}`.trim()).join("\n\n");
}
function codexCompactionLabels() {
  return {
    displayName: localize("codex.compaction.displayName", "Compact conversation"),
    invocationMessage: localize("codex.compaction.inProgress", "Compacting conversation"),
    pastTenseMessage: localize("codex.compaction.completed", "Compacted conversation")
  };
}
function codexImageGenerationLabels(status) {
  return {
    displayName: localize("codex.imageGeneration.displayName", "Generate image"),
    invocationMessage: localize("codex.imageGeneration.inProgress", "Generating image"),
    pastTenseMessage: localize("codex.imageGeneration.completed", "Generated image"),
    failedMessage: localize("codex.imageGeneration.failed", "Failed to generate image"),
    errorMessage: localize("codex.imageGeneration.error", "Image generation {0}", status ?? "")
  };
}
function jsonValueToText(value) {
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}
function toolInputText(value) {
  return JSON.stringify(value, null, 2);
}
function dynamicToolOutput(contentItems) {
  return contentItems?.map((item) => item.type === "inputText" ? item.text : item.type === "inputImage" ? item.imageUrl : item.audioUrl).join("\n") ?? "";
}
function mcpToolOutput(result, errorMessage) {
  if (errorMessage) {
    return errorMessage;
  }
  if (!result) {
    return "";
  }
  const content = result.content.map(jsonValueToText).join("\n");
  const structuredContent = result.structuredContent !== null ? jsonValueToText(result.structuredContent) : "";
  return [content, structuredContent].filter(Boolean).join("\n");
}
function collabAgentToolLabels(tool) {
  switch (tool) {
    case "spawnAgent":
      return { displayName: "Spawn agent", present: "Spawning agent", past: "Spawned agent" };
    case "sendInput":
      return { displayName: "Send input to agent", present: "Sending input to agent", past: "Sent input to agent" };
    case "resumeAgent":
      return { displayName: "Resume agent", present: "Resuming agent", past: "Resumed agent" };
    case "wait":
      return { displayName: "Wait for agents", present: "Waiting for agents", past: "Finished waiting" };
    case "closeAgent":
      return { displayName: "Close agent", present: "Closing agent", past: "Closed agent" };
    default:
      return { displayName: tool, present: tool, past: tool };
  }
}
function collabAgentStateSummary(state) {
  switch (state.status) {
    case "completed":
      return state.message ? `Completed \u2014 ${state.message}` : "Completed";
    case "errored":
      return state.message ? `Errored \u2014 ${state.message}` : "Errored";
    case "running":
      return state.message ? `Running \u2014 ${state.message}` : "Running";
    case "interrupted":
      return state.message ? `Interrupted \u2014 ${state.message}` : "Interrupted";
    case "pendingInit":
      return "Pending init";
    case "shutdown":
      return "Shutdown";
    case "notFound":
      return "Not found";
    default:
      return state.status;
  }
}
function collabAgentResultOutput(receiverThreadIds, agentsStates) {
  const seen = /* @__PURE__ */ new Set();
  const states = [];
  for (const id of receiverThreadIds) {
    const state = agentsStates[id];
    if (state) {
      states.push(state);
      seen.add(id);
    }
  }
  for (const id of Object.keys(agentsStates).sort()) {
    if (seen.has(id)) {
      continue;
    }
    const state = agentsStates[id];
    if (state) {
      states.push(state);
    }
  }
  if (states.length === 0) {
    return "";
  }
  if (states.length === 1) {
    return collabAgentStateSummary(states[0]);
  }
  return states.map((state, index) => `Agent ${index + 1}: ${collabAgentStateSummary(state)}`).join("\n");
}
function mapTurnStarted(state, params, fallbackUserText) {
  state.currentTurnId = params.turn.id;
  resetCodexTurnMapState(state);
  let userText = fallbackUserText;
  const first = params.turn.items?.[0];
  if (first && first.type === "userMessage") {
    const collected = extractUserInputText(first.content);
    if (collected.length > 0) {
      userText = collected;
    }
  }
  const delegation = parseCodexDelegation(userText);
  return [
    {
      type: ActionType.ChatTurnStarted,
      turnId: params.turn.id,
      startedAt: typeof params.turn.startedAt === "number" ? new Date(params.turn.startedAt * 1e3).toISOString() : (/* @__PURE__ */ new Date()).toISOString(),
      message: {
        text: delegation?.input ?? userText,
        origin: { kind: MessageKind.User },
        ...delegation ? { _meta: toAgentMessageDelegationMeta({ sourceThreadId: delegation.sourceThreadId }) } : {}
      }
    }
  ];
}
function mapReasoningSummaryPartAdded(state, params) {
  return deferResponseWhileToolCallIsOpen(state, ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "summary", params.summaryIndex)).actions);
}
function mapReasoningSummaryTextDelta(state, params) {
  const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "summary", params.summaryIndex));
  return deferResponseWhileToolCallIsOpen(state, [
    ...ensured.actions,
    { type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta, _meta: toCodexReasoningMeta("summary") }
  ]);
}
function mapReasoningTextDelta(state, params) {
  const ensured = ensureReasoningPart(state, params.turnId, reasoningKey(params.itemId, "text", params.contentIndex));
  return deferResponseWhileToolCallIsOpen(state, [
    ...ensured.actions,
    { type: ActionType.ChatReasoning, turnId: params.turnId, partId: ensured.partId, content: params.delta, _meta: toCodexReasoningMeta("text") }
  ]);
}
function clearReasoningForItem(state, itemId) {
  for (const key of [...state.itemToReasoningPartId.keys()]) {
    if (key.startsWith(`${itemId}:`)) {
      state.itemToReasoningPartId.delete(key);
    }
  }
}
function mapTokenUsageUpdated(params, modelId) {
  const last = params.tokenUsage.last;
  return [{
    type: ActionType.ChatUsage,
    turnId: params.turnId,
    usage: {
      inputTokens: last.inputTokens,
      outputTokens: last.outputTokens,
      ...modelId ? { model: modelId } : {},
      cacheReadTokens: last.cachedInputTokens,
      _meta: {
        reasoningOutputTokens: last.reasoningOutputTokens,
        modelContextWindow: params.tokenUsage.modelContextWindow
      }
    }
  }];
}
function mapItemStarted(state, params) {
  if (params.item.type === "commandExecution") {
    const pending = state.pendingPreflight;
    if (pending && pending.turnId === params.turnId && pending.command === unwrapShellInvocation(params.item.command ?? "")) {
      state.pendingPreflight = void 0;
      state.itemToToolCall.set(params.item.id, {
        toolCallId: pending.toolCallId,
        turnId: params.turnId,
        toolName: "shell",
        output: ""
      });
      return [];
    }
  }
  const flushed = flushPendingPreflight(state);
  const deferredResponseActions = flushDeferredResponseActions(state);
  const body = mapItemStartedBody(state, params);
  const orderedBody = params.item.type === "agentMessage" ? deferResponseWhileToolCallIsOpen(state, body) : body;
  return [...flushed, ...deferredResponseActions, ...orderedBody];
}
function mapItemStartedBody(state, params) {
  if (params.item.type === "agentMessage") {
    const partId = generateUuid();
    state.itemToPartId.set(params.item.id, partId);
    const separator = state.agentMessagePartCount > 0 ? "\n\n" : "";
    state.agentMessagePartCount++;
    return [
      {
        type: ActionType.ChatResponsePart,
        turnId: params.turnId,
        part: {
          kind: ResponsePartKind.Markdown,
          id: partId,
          content: separator + (params.item.text ?? "")
        }
      }
    ];
  }
  if (params.item.type === "commandExecution") {
    const toolCallId = generateUuid();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "shell",
      output: ""
    });
    const command = unwrapShellInvocation(params.item.command ?? "");
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "shell",
        displayName: "Run shell command",
        _meta: toToolCallMeta({ toolKind: "terminal" })
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: command
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: command,
        toolInput: command,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta({ toolKind: "terminal" })
      }
    ];
  }
  if (params.item.type === "webSearch") {
    const toolCallId = generateUuid();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "web_search",
      output: ""
    });
    const query = describeWebSearch(params.item.query, params.item.action);
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "web_search",
        displayName: "Web search",
        _meta: toToolCallMeta({ toolKind: "search" })
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: query
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: webSearchInvocationMessage(query),
        toolInput: query,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: toToolCallMeta({ toolKind: "search" })
      }
    ];
  }
  if (params.item.type === "imageGeneration") {
    const toolCallId = generateUuid();
    const labels = codexImageGenerationLabels();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "image_gen.imagegen",
      output: ""
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "image_gen.imagegen",
        displayName: labels.displayName
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: labels.invocationMessage,
        toolInput: JSON.stringify({ prompt: params.item.revisedPrompt ?? labels.displayName }),
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  if (params.item.type === "fileChange") {
    return mapFileChangeStarted(state, params.turnId, params.item.id, params.item.changes);
  }
  if (params.item.type === "mcpToolCall") {
    const toolCallId = generateUuid();
    const toolName = `${params.item.server}.${params.item.tool}`;
    const toolInput = toolInputText(params.item.arguments);
    const customizationId = state.mcpCustomizationIds.get(params.item.server);
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output: ""
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: params.item.tool,
        ...customizationId ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId } } : {}
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: `Calling ${toolName}`,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  if (params.item.type === "dynamicToolCall") {
    const toolCallId = generateUuid();
    const toolName = params.item.namespace ? `${params.item.namespace}.${params.item.tool}` : params.item.tool;
    const toolInput = toolInputText(params.item.arguments);
    const output = dynamicToolOutput(params.item.contentItems);
    const isServerTool = params.item.namespace === null && state.serverToolNames.has(params.item.tool);
    const ownerClientId = isServerTool ? void 0 : state.clientToolSet.ownerOf(params.item.tool);
    const serverDisplay = getServerToolDisplay(params.item.tool, params.item.arguments) ?? getWriteFileToolDisplay(params.item.tool, params.item.arguments);
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: serverDisplay?.displayName ?? params.item.tool,
        ...ownerClientId ? { contributor: { kind: ToolCallContributorKind.Client, clientId: ownerClientId } } : {}
      },
      {
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: serverDisplay?.invocationMessage ?? `Calling ${toolName}`,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      },
      ...output ? [{
        type: ActionType.ChatToolCallContentChanged,
        turnId: params.turnId,
        toolCallId,
        content: [{ type: ToolResultContentType.Text, text: output }]
      }] : []
    ];
  }
  if (params.item.type === "collabAgentToolCall") {
    const toolCallId = generateUuid();
    const labels = collabAgentToolLabels(params.item.tool);
    const toolName = `codex.${params.item.tool}`;
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName,
      output: ""
    });
    if (params.item.tool === "spawnAgent") {
      return [
        {
          type: ActionType.ChatToolCallStart,
          turnId: params.turnId,
          toolCallId,
          toolName,
          displayName: labels.displayName
        },
        {
          type: ActionType.ChatToolCallReady,
          turnId: params.turnId,
          toolCallId,
          invocationMessage: labels.present,
          confirmed: ToolCallConfirmationReason.NotNeeded
        }
      ];
    }
    const inputParts = [];
    if (params.item.prompt) {
      inputParts.push(params.item.prompt);
    }
    if (params.item.model) {
      inputParts.push(`Model: ${params.item.model}`);
    }
    const toolInput = inputParts.join("\n\n");
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName,
        displayName: labels.displayName
      },
      ...toolInput ? [{
        type: ActionType.ChatToolCallDelta,
        turnId: params.turnId,
        toolCallId,
        content: toolInput
      }] : [],
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: labels.present,
        toolInput,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  if (params.item.type === "contextCompaction") {
    const toolCallId = generateUuid();
    const labels = codexCompactionLabels();
    state.itemToToolCall.set(params.item.id, {
      toolCallId,
      turnId: params.turnId,
      toolName: "compact",
      output: ""
    });
    return [
      {
        type: ActionType.ChatToolCallStart,
        turnId: params.turnId,
        toolCallId,
        toolName: "compact",
        displayName: labels.displayName
      },
      {
        type: ActionType.ChatToolCallReady,
        turnId: params.turnId,
        toolCallId,
        invocationMessage: labels.invocationMessage,
        confirmed: ToolCallConfirmationReason.NotNeeded
      }
    ];
  }
  return [];
}
function mapFileChangeStarted(state, turnId, itemId, changes) {
  if (state.itemToToolCall.has(itemId)) {
    return [];
  }
  const toolCallId = generateUuid();
  const output = fileChangeOutput(changes);
  state.itemToToolCall.set(itemId, {
    toolCallId,
    turnId,
    toolName: "file_edit",
    output
  });
  const summary = describeFileChange(changes) || "Apply file changes";
  return [
    {
      type: ActionType.ChatToolCallStart,
      turnId,
      toolCallId,
      toolName: "file_edit",
      displayName: "Apply file changes"
    },
    {
      type: ActionType.ChatToolCallDelta,
      turnId,
      toolCallId,
      content: summary
    },
    {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId,
      invocationMessage: summary,
      toolInput: summary,
      confirmed: ToolCallConfirmationReason.NotNeeded
    },
    ...output ? [{
      type: ActionType.ChatToolCallContentChanged,
      turnId,
      toolCallId,
      content: [{ type: ToolResultContentType.Text, text: output }]
    }] : []
  ];
}
function mapCommandExecutionOutputDelta(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output += params.delta;
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapFileChangePatchUpdated(state, params, fileEdits = [], previewUnavailable) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output = fileChangeOutput(params.changes);
  const unavailableText = previewUnavailable?.trim();
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [
      ...entry.output ? [{ type: ToolResultContentType.Text, text: entry.output }] : [],
      ...unavailableText ? [{ type: ToolResultContentType.Text, text: unavailableText }] : [],
      ...fileEdits
    ]
  }];
}
function mapTurnDiffUpdated(state, turnId, toolCallId, fileEdits) {
  if (fileEdits.length === 0) {
    return [];
  }
  const isNew = state.turnDiffToolCall?.turnId !== turnId;
  state.turnDiffToolCall = { turnId, toolCallId, content: fileEdits };
  return [
    ...isNew ? [{
      type: ActionType.ChatToolCallStart,
      turnId,
      toolCallId,
      toolName: "turn_diff",
      displayName: "Writing files"
    }, {
      type: ActionType.ChatToolCallReady,
      turnId,
      toolCallId,
      invocationMessage: "Writing files",
      confirmed: ToolCallConfirmationReason.NotNeeded
    }] : [],
    {
      type: ActionType.ChatToolCallContentChanged,
      turnId,
      toolCallId,
      content: [...fileEdits]
    }
  ];
}
function mapFileChangeOutputDelta(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output += params.delta;
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapMcpToolCallProgress(state, params) {
  const entry = state.itemToToolCall.get(params.itemId);
  if (!entry) {
    return [];
  }
  entry.output = [entry.output, params.message].filter(Boolean).join("\n");
  return [{
    type: ActionType.ChatToolCallContentChanged,
    turnId: entry.turnId,
    toolCallId: entry.toolCallId,
    content: [{ type: ToolResultContentType.Text, text: entry.output }]
  }];
}
function mapAgentMessageDelta(state, params) {
  const partId = state.itemToPartId.get(params.itemId);
  if (!partId) {
    return [];
  }
  return deferResponseWhileToolCallIsOpen(state, [
    {
      type: ActionType.ChatDelta,
      turnId: params.turnId,
      partId,
      content: params.delta
    }
  ]);
}
function mapItemCompleted(state, params, fileEdits = []) {
  if (params.item.type === "agentMessage") {
    state.itemToPartId.delete(params.item.id);
    return [];
  }
  if (params.item.type === "reasoning") {
    clearReasoningForItem(state, params.item.id);
    return [];
  }
  const entry = state.itemToToolCall.get(params.item.id);
  if (!entry) {
    return [];
  }
  state.itemToToolCall.delete(params.item.id);
  const declined = state.declinedToolCalls.delete(entry.toolCallId);
  if (params.item.type === "contextCompaction") {
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success: true,
        pastTenseMessage: codexCompactionLabels().pastTenseMessage
      }
    }];
  }
  if (params.item.type === "commandExecution") {
    const success = params.item.status === "completed" && (params.item.exitCode === 0 || params.item.exitCode === null);
    const output = params.item.aggregatedOutput ?? entry.output;
    const command = unwrapShellInvocation(params.item.command ?? "");
    const exit = params.item.exitCode;
    const pastTense = success ? `Ran \`${command}\`` : exit !== null ? `Ran \`${command}\` (exit ${exit})` : `Ran \`${command}\` (failed)`;
    const completion = [
      {
        type: ActionType.ChatToolCallComplete,
        turnId: entry.turnId,
        toolCallId: entry.toolCallId,
        result: {
          success,
          pastTenseMessage: pastTense,
          content: output || fileEdits.length > 0 ? [
            ...output ? [{ type: ToolResultContentType.Text, text: output }] : [],
            ...fileEdits
          ] : void 0,
          error: success ? void 0 : {
            message: exit !== null ? `Exit code ${exit}` : "Command failed",
            ...declined ? { code: "denied" } : {}
          }
        }
      }
    ];
    if (success && !output && fileEdits.length === 0 && !declined) {
      const flushed = flushPendingPreflight(state);
      state.pendingPreflight = { toolCallId: entry.toolCallId, turnId: entry.turnId, command, completion };
      return [...flushed, ...flushDeferredResponseActions(state)];
    }
    return [...flushPendingPreflight(state), ...completion, ...flushDeferredResponseActions(state)];
  }
  if (params.item.type === "webSearch") {
    const query = describeWebSearch(params.item.query, params.item.action);
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success: true,
        pastTenseMessage: webSearchPastTenseMessage(query)
      }
    }];
  }
  if (params.item.type === "imageGeneration") {
    const success = params.item.status === "completed" && params.item.result.length > 0;
    const labels = codexImageGenerationLabels(params.item.status);
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: success ? labels.pastTenseMessage : labels.failedMessage,
        content: success ? [{
          type: ToolResultContentType.EmbeddedResource,
          data: params.item.result,
          contentType: "image/png"
        }] : void 0,
        ...success ? {} : { error: { message: labels.errorMessage } }
      }
    }];
  }
  if (params.item.type === "fileChange") {
    const output = fileChangeOutput(params.item.changes) || entry.output;
    const success = params.item.status === "completed";
    const summary = describeFileChange(params.item.changes) || "Apply file changes";
    const content = [
      ...output ? [{ type: ToolResultContentType.Text, text: output }] : [],
      ...fileEdits
    ];
    const result = {
      success,
      pastTenseMessage: success ? summary : "Failed to apply file changes",
      content: content.length > 0 ? content : void 0,
      ...success ? {} : { error: { message: `Patch ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
    };
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result
    }];
  }
  if (params.item.type === "mcpToolCall") {
    const success = params.item.status === "completed" && !params.item.error;
    const output = mcpToolOutput(params.item.result, params.item.error?.message) || entry.output;
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`,
        content,
        ...success ? {} : { error: { message: params.item.error?.message ?? `MCP tool ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  if (params.item.type === "dynamicToolCall") {
    const success = params.item.success === true || params.item.status === "completed";
    const output = dynamicToolOutput(params.item.contentItems) || entry.output;
    const content = [
      ...output ? [{ type: ToolResultContentType.Text, text: output }] : [],
      ...fileEdits
    ];
    const serverDisplay = success ? getServerToolDisplay(entry.toolName, params.item.arguments, { text: output, success }) ?? getWriteFileToolDisplay(entry.toolName, params.item.arguments, { text: output, success }) : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: serverDisplay?.pastTenseMessage ?? serverDisplay?.invocationMessage ?? (success ? `Called ${entry.toolName}` : `Failed to call ${entry.toolName}`),
        content: content.length > 0 ? content : void 0,
        ...success ? {} : { error: { message: `Dynamic tool ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  if (params.item.type === "collabAgentToolCall") {
    const labels = collabAgentToolLabels(params.item.tool);
    const success = params.item.status === "completed";
    const output = collabAgentResultOutput(params.item.receiverThreadIds, params.item.agentsStates) || entry.output;
    const content = output ? [{ type: ToolResultContentType.Text, text: output }] : void 0;
    return [{
      type: ActionType.ChatToolCallComplete,
      turnId: entry.turnId,
      toolCallId: entry.toolCallId,
      result: {
        success,
        pastTenseMessage: success ? labels.past : `${labels.displayName} failed`,
        content,
        ...success ? {} : { error: { message: `Collab agent ${params.item.status}`, ...declined ? { code: "denied" } : {} } }
      }
    }];
  }
  return [];
}
function mapTurnCompleted(state, params, fallbackDuration) {
  state.currentTurnId = void 0;
  state.itemToPartId.clear();
  state.itemToReasoningPartId.clear();
  const recoveredToolCallActions = [];
  for (const item of params.turn.items) {
    if (item.type === "commandExecution" && (item.exitCode !== null || item.status !== "completed") && state.itemToToolCall.has(item.id)) {
      recoveredToolCallActions.push(...mapItemCompleted(state, {
        threadId: params.threadId,
        turnId: params.turn.id,
        item,
        completedAtMs: typeof params.turn.completedAt === "number" ? params.turn.completedAt * 1e3 : 0
      }));
    }
  }
  const preflightFlush = flushPendingPreflight(state);
  const turnId = params.turn.id;
  const status = params.turn.status;
  const turnDiffActions = completeTurnDiffToolCall(state, status === "completed", status === "interrupted" ? "Turn interrupted while updating files" : "Turn failed while updating files");
  const duration = typeof params.turn.durationMs === "number" && Number.isFinite(params.turn.durationMs) && params.turn.durationMs >= 0 ? params.turn.durationMs : typeof params.turn.startedAt === "number" && typeof params.turn.completedAt === "number" ? Math.max(0, (params.turn.completedAt - params.turn.startedAt) * 1e3) : typeof fallbackDuration === "number" && Number.isFinite(fallbackDuration) ? Math.max(0, fallbackDuration) : 0;
  const orphanedToolCallActions = completeOrphanedToolCalls(state, status === "interrupted" ? "Turn interrupted before the tool completed" : "Turn completed before the tool reported completion");
  const deferredResponseActions = flushDeferredResponseActions(state);
  if (status === "failed" && params.turn.error) {
    return [
      ...recoveredToolCallActions,
      ...preflightFlush,
      ...orphanedToolCallActions,
      ...turnDiffActions,
      ...deferredResponseActions,
      {
        type: ActionType.ChatError,
        turnId,
        duration,
        error: mapCodexTurnError(params.turn.error)
      },
      {
        type: ActionType.ChatTurnComplete,
        turnId,
        duration
      }
    ];
  }
  if (status === "interrupted") {
    return [...recoveredToolCallActions, ...preflightFlush, ...orphanedToolCallActions, ...turnDiffActions, ...deferredResponseActions, { type: ActionType.ChatTurnCancelled, turnId, duration }];
  }
  return [...recoveredToolCallActions, ...preflightFlush, ...orphanedToolCallActions, ...turnDiffActions, ...deferredResponseActions, { type: ActionType.ChatTurnComplete, turnId, duration }];
}
function mapCodexTurnError(error) {
  return {
    errorType: "CodexError",
    ...extractForwardedErrorInfo(error.message || "Codex turn failed"),
    ...error.additionalDetails ? { stack: error.additionalDetails } : {}
  };
}
function mapErrorNotification(params, turnId, duration) {
  if (params.willRetry) {
    return [{
      type: ActionType.ChatActivityChanged,
      activity: localize("codex.retrying", "Codex connection interrupted; retrying...")
    }];
  }
  return [
    { type: ActionType.ChatActivityChanged, activity: void 0 },
    {
      type: ActionType.ChatError,
      turnId,
      duration,
      error: mapCodexTurnError(params.error)
    }
  ];
}
function turnStateFromStatus(status) {
  switch (status) {
    case "completed":
      return TurnState.Complete;
    case "interrupted":
      return TurnState.Cancelled;
    case "failed":
      return TurnState.Error;
    default:
      return TurnState.Complete;
  }
}
export {
  clearReasoningForItem,
  codexCompactionLabels,
  codexImageGenerationLabels,
  createCodexSessionMapState,
  describeFileChange,
  describeWebSearch,
  extractUserInputText,
  fileChangeOutput,
  finalizeCodexTurnMapState,
  mapAgentMessageDelta,
  mapCodexTurnError,
  mapCommandExecutionOutputDelta,
  mapErrorNotification,
  mapFileChangeOutputDelta,
  mapFileChangePatchUpdated,
  mapFileChangeStarted,
  mapItemCompleted,
  mapItemStarted,
  mapMcpToolCallProgress,
  mapReasoningSummaryPartAdded,
  mapReasoningSummaryTextDelta,
  mapReasoningTextDelta,
  mapTokenUsageUpdated,
  mapTurnCompleted,
  mapTurnDiffUpdated,
  mapTurnStarted,
  resetCodexTurnMapState,
  turnStateFromStatus,
  webSearchInvocationMessage,
  webSearchPastTenseMessage
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb2RleFxcY29kZXhNYXBBcHBTZXJ2ZXJFdmVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IHRvQ29kZXhSZWFzb25pbmdNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvY29kZXhSZWFzb25pbmdNZXRhLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB7IHRvVG9vbENhbGxNZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRUb29sQ2FsbE1ldGEuanMnO1xuaW1wb3J0IHsgQWN0aW9uVHlwZSwgdHlwZSBTZXNzaW9uQWN0aW9uLCB0eXBlIENoYXRBY3Rpb24gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWVzc2FnZUtpbmQsIFJlc3BvbnNlUGFydEtpbmQsIFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIHR5cGUgRXJyb3JJbmZvLCB0eXBlIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8gfSBmcm9tICcuLi9zaGFyZWQvcHJveHlDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHsgZ2V0U2VydmVyVG9vbERpc3BsYXkgfSBmcm9tICcuLi9zaGFyZWQvc2VydmVyVG9vbEdyb3Vwcy5qcyc7XG5pbXBvcnQgeyBnZXRXcml0ZUZpbGVUb29sRGlzcGxheSB9IGZyb20gJy4vY29kZXhXcml0ZUZpbGVUb29sLmpzJztcbmltcG9ydCB7IEFjdGl2ZUNsaWVudFRvb2xTZXQgfSBmcm9tICcuLi9hY3RpdmVDbGllbnRTdGF0ZS5qcyc7XG5pbXBvcnQgeyB0b0FnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhIH0gZnJvbSAnLi4vLi4vY29tbW9uL21ldGEvYWdlbnRNZXNzYWdlRGVsZWdhdGlvbk1ldGEuanMnO1xuaW1wb3J0IHsgcGFyc2VDb2RleERlbGVnYXRpb24gfSBmcm9tICcuL2NvZGV4RGVsZWdhdGlvbi5qcyc7XG5pbXBvcnQgeyB1bndyYXBTaGVsbEludm9jYXRpb24gfSBmcm9tICcuL2NvZGV4U2hlbGxDb21tYW5kLmpzJztcbmltcG9ydCB0eXBlIHsgQWdlbnRNZXNzYWdlRGVsdGFOb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9BZ2VudE1lc3NhZ2VEZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IENvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0NvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VPdXRwdXREZWx0YU5vdGlmaWNhdGlvbiB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVDaGFuZ2VPdXRwdXREZWx0YU5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9GaWxlQ2hhbmdlUGF0Y2hVcGRhdGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgRmlsZVVwZGF0ZUNoYW5nZSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0ZpbGVVcGRhdGVDaGFuZ2UuanMnO1xuaW1wb3J0IHR5cGUgeyBJdGVtQ29tcGxldGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbUNvbXBsZXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEl0ZW1TdGFydGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBNY3BUb29sQ2FsbFByb2dyZXNzTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwVG9vbENhbGxQcm9ncmVzc05vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IE1jcFRvb2xDYWxsUmVzdWx0IH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvTWNwVG9vbENhbGxSZXN1bHQuanMnO1xuaW1wb3J0IHR5cGUgeyBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUmVhc29uaW5nU3VtbWFyeVBhcnRBZGRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFJlYXNvbmluZ1N1bW1hcnlUZXh0RGVsdGFOb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9SZWFzb25pbmdTdW1tYXJ5VGV4dERlbHRhTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgUmVhc29uaW5nVGV4dERlbHRhTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvUmVhc29uaW5nVGV4dERlbHRhTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVGhyZWFkVG9rZW5Vc2FnZVVwZGF0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UaHJlYWRUb2tlblVzYWdlVXBkYXRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IFR1cm5Db21wbGV0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuQ29tcGxldGVkTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB0eXBlIHsgVHVybkVycm9yIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvVHVybkVycm9yLmpzJztcbmltcG9ydCB0eXBlIHsgVHVyblN0YXJ0ZWROb3RpZmljYXRpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9UdXJuU3RhcnRlZE5vdGlmaWNhdGlvbi5qcyc7XG5pbXBvcnQgdHlwZSB7IEVycm9yTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvRXJyb3JOb3RpZmljYXRpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBVc2VySW5wdXQgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Vc2VySW5wdXQuanMnO1xuaW1wb3J0IHR5cGUgeyBXZWJTZWFyY2hBY3Rpb24gfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9XZWJTZWFyY2hBY3Rpb24uanMnO1xuaW1wb3J0IHR5cGUgeyBEeW5hbWljVG9vbENhbGxPdXRwdXRDb250ZW50SXRlbSB9IGZyb20gJy4vcHJvdG9jb2wvZ2VuZXJhdGVkL3YyL0R5bmFtaWNUb29sQ2FsbE91dHB1dENvbnRlbnRJdGVtLmpzJztcbmltcG9ydCB0eXBlIHsgSnNvblZhbHVlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvc2VyZGVfanNvbi9Kc29uVmFsdWUuanMnO1xuaW1wb3J0IHR5cGUgeyBDb2xsYWJBZ2VudFRvb2wgfSBmcm9tICcuL3Byb3RvY29sL2dlbmVyYXRlZC92Mi9Db2xsYWJBZ2VudFRvb2wuanMnO1xuaW1wb3J0IHR5cGUgeyBDb2xsYWJBZ2VudFN0YXRlIH0gZnJvbSAnLi9wcm90b2NvbC9nZW5lcmF0ZWQvdjIvQ29sbGFiQWdlbnRTdGF0ZS5qcyc7XG5cbi8qKlxuICogUGVyLXNlc3Npb24gbXV0YWJsZSBzdGF0ZSBoZWxkIGJ5IHRoZSBtYXBwZXIuIENhcnJpZXMgdGhlIGJvb2trZWVwaW5nXG4gKiBuZWVkZWQgdG8gZ2x1ZSBjb2RleCdzIGl0ZW0tc3RyZWFtIChlYWNoIGBhZ2VudE1lc3NhZ2VgIGl0ZW0gaGFzIGl0c1xuICogb3duIGlkKSB0byB0aGUgYWdlbnQgaG9zdCBwcm90b2NvbCAoZWFjaCBtYXJrZG93biBwYXJ0IGhhcyBpdHMgb3duIGlkKS5cbiAqXG4gKiBQaGFzZSAyIHRyYWNrcyBvbmx5IGBpdGVtSWQgXHUyMTkyIHBhcnRJZGAgZm9yIGFnZW50IG1lc3NhZ2VzLiBQaGFzZSA0XG4gKiBleHRlbmRzIHRoaXMgd2l0aCB0b29sLWNhbGwgY29ycmVsYXRpb247IFBoYXNlIDYgYWRkcyByZWFzb25pbmcgcGFydHMuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4U2Vzc2lvbk1hcFN0YXRlIHtcblx0LyoqIFN0YWJsZSBjb2RleCBgaXRlbUlkYCBcdTIxOTIgb3VyIG1hcmtkb3duIHJlc3BvbnNlIHBhcnQgaWQuICovXG5cdHJlYWRvbmx5IGl0ZW1Ub1BhcnRJZDogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0LyoqXG5cdCAqIFN0YWJsZSBjb2RleCBgaXRlbUlkYCBcdTIxOTIgdG9vbC1jYWxsIGJvb2trZWVwaW5nLiBQaGFzZSA0IHRyYWNrc1xuXHQgKiBgY29tbWFuZEV4ZWN1dGlvbmAgaGVyZSBzbyBjb21wbGV0aW9uL2FwcHJvdmFsIGhhbmRsZXJzIGNhbiBmaW5kXG5cdCAqIHRoZSByaWdodCB0b29sQ2FsbElkL3R1cm5JZCBmb3IgZWFjaCBpdGVtLlxuXHQgKi9cblx0cmVhZG9ubHkgaXRlbVRvVG9vbENhbGw6IE1hcDxzdHJpbmcsIElDb2RleFRvb2xDYWxsRW50cnk+O1xuXHQvKiogU3RhYmxlIGNvZGV4IHJlYXNvbmluZyBpdGVtL2luZGV4IFx1MjE5MiBvdXIgcmVhc29uaW5nIHJlc3BvbnNlIHBhcnQgaWQuICovXG5cdHJlYWRvbmx5IGl0ZW1Ub1JlYXNvbmluZ1BhcnRJZDogTWFwPHN0cmluZywgc3RyaW5nPjtcblx0LyoqIEN1cnJlbnQgdHVybiBpZCAocGVyIGB0dXJuL3N0YXJ0ZWRgKS4gKi9cblx0Y3VycmVudFR1cm5JZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogU3ludGhldGljIGxpdmUgZmlsZS1lZGl0IGNhbGwgZmVkIGJ5IENvZGV4J3MgY3VtdWxhdGl2ZSB0dXJuIGRpZmYuICovXG5cdHR1cm5EaWZmVG9vbENhbGw6IHsgcmVhZG9ubHkgdHVybklkOiBzdHJpbmc7IHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZzsgY29udGVudDogcmVhZG9ubHkgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdIH0gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBMaXZlIHJlZ2lzdHJ5IG9mIHRoZSBzZXNzaW9uJ3MgY2xpZW50LXByb3ZpZGVkIChgZHluYW1pY1Rvb2xzYCkgdG9vbHMsXG5cdCAqIGtleWVkIGJ5IGNvbnRyaWJ1dGluZyB3b3JrYmVuY2ggY2xpZW50LiBBIGBkeW5hbWljVG9vbENhbGxgIHRvb2wtY2FsbFxuXHQgKiBzdGFydCBpcyBzdGFtcGVkIHdpdGggdGhlIG93bmluZyBjbGllbnQgKHNvIHRoZSB3b3JrYmVuY2ggcm91dGVzXG5cdCAqIGV4ZWN1dGlvbiBiYWNrIHRvIGl0KSByZXNvbHZlZCB2aWEge0BsaW5rIEFjdGl2ZUNsaWVudFRvb2xTZXQub3duZXJPZn0uXG5cdCAqL1xuXHRjbGllbnRUb29sU2V0OiBBY3RpdmVDbGllbnRUb29sU2V0O1xuXHQvKipcblx0ICogTmFtZXMgb2YgdGhlIGFnZW50IGhvc3QncyBzZXJ2ZXIgdG9vbHMgKGV4ZWN1dGVkIGluLXByb2Nlc3MpLiBBXG5cdCAqIGBkeW5hbWljVG9vbENhbGxgIGZvciBvbmUgb2YgdGhlc2Ugb21pdHMgdGhlIGBDbGllbnRgIGNvbnRyaWJ1dG9yIHNvIHRoZVxuXHQgKiB3b3JrYmVuY2ggZG9lcyBub3QgdHJ5IHRvIHJvdXRlIGV4ZWN1dGlvbiB0byBhIGNsaWVudCBcdTIwMTQgdGhlIGFnZW50IGhvc3Rcblx0ICogYW5zd2VycyB0aGUgYGl0ZW0vdG9vbC9jYWxsYCBkaXJlY3RseS5cblx0ICovXG5cdHNlcnZlclRvb2xOYW1lczogUmVhZG9ubHlTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIFNlcnZlciBuYW1lIFx1MjE5MiBjdXN0b21pemF0aW9uIGlkIGZvciB0aGUgc2Vzc2lvbidzIE1DUCBzZXJ2ZXJzLCB1c2VkIHRvXG5cdCAqIHN0YW1wIHRoZSB7QGxpbmsgVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQfSBjb250cmlidXRvciBvbiBgbWNwVG9vbENhbGxgXG5cdCAqIHN0YXJ0cyBzbyBjbGllbnRzIGNhbiBjb3JyZWxhdGUgdGhlIGNhbGwgd2l0aCBpdHMgb3JpZ2luYXRpbmcgc2VydmVyXG5cdCAqIGN1c3RvbWl6YXRpb24uIE93bmVkIGFuZCBwb3B1bGF0ZWQgYnkgdGhlIGFnZW50IChtaXJyb3JzXG5cdCAqIHtAbGluayBjbGllbnRUb29sU2V0fSk7IGVtcHR5IHVudGlsIHRoZSBhZ2VudCBmaXJzdCBhcHBsaWVzIHRoZSBpbnZlbnRvcnkuXG5cdCAqL1xuXHRyZWFkb25seSBtY3BDdXN0b21pemF0aW9uSWRzOiBNYXA8c3RyaW5nLCBzdHJpbmc+O1xuXHQvKipcblx0ICogVG9vbCBjYWxsIGlkcyB0aGUgaG9zdCBkZWNsaW5lZCBhdCB0aGUgYXBwcm92YWwgcHJvbXB0LiBDb2RleCByZXBvcnRzIHRoZVxuXHQgKiByZXN1bHRpbmcgYGl0ZW0vY29tcGxldGVkYCBhcyBhIGdlbmVyaWMgZmFpbHVyZSwgc28gdGhlIGNvbXBsZXRpb24gaGFuZGxlclxuXHQgKiBjb25zdWx0cyB0aGlzIHNldCB0byBlbWl0IGEgYHVzZXJDYW5jZWxsZWRgIChgZXJyb3IuY29kZSA9ICdkZW5pZWQnYClcblx0ICogcmVzdWx0IGluc3RlYWQuIERyYWluZWQgb24gY29tcGxldGlvbiBhbmQgY2xlYXJlZCBwZXIgdHVybi5cblx0ICovXG5cdHJlYWRvbmx5IGRlY2xpbmVkVG9vbENhbGxzOiBTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIEFzc2lzdGFudCByZXNwb25zZSBhY3Rpb25zIHJlY2VpdmVkIHdoaWxlIGEgdG9vbCBjYWxsIGlzIHN0aWxsIG9wZW4uIENvZGV4XG5cdCAqIGNhbiBwdWJsaXNoIHRoZSBmb2xsb3dpbmcgcmVzcG9uc2UgaXRlbSBiZWZvcmUgdGhlIHByZWNlZGluZyB0b29sIGl0ZW1cblx0ICogY29tcGxldGlvbiBub3RpZmljYXRpb24sIGVzcGVjaWFsbHkgd2hlbiByZXBsYXkgcmV0dXJucyB0aGUgbmV4dCBtb2RlbFxuXHQgKiByZXNwb25zZSBpbW1lZGlhdGVseS4gS2VlcCB0aGUgQUhQIGxpZmVjeWNsZSBvcmRlcmVkIGJ5IHJlbGVhc2luZyB0aGVzZVxuXHQgKiBhY3Rpb25zIG9ubHkgYWZ0ZXIgZXZlcnkgcHJlY2VkaW5nIHRvb2wgY2FsbCBoYXMgY29tcGxldGVkLlxuXHQgKi9cblx0cmVhZG9ubHkgZGVmZXJyZWRSZXNwb25zZUFjdGlvbnM6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXTtcblx0LyoqXG5cdCAqIEEgYGNvbW1hbmRFeGVjdXRpb25gIHRoYXQgY29tcGxldGVkIHN1Y2Nlc3NmdWxseSB3aXRoIE5PIG91dHB1dCBpc1xuXHQgKiBwb3RlbnRpYWxseSBhIHNhbmRib3ggcHJlLWZsaWdodC4gV2hlbiBDb2RleCBydW5zIGEgbmV0d29yayAob3Igb3RoZXJ3aXNlXG5cdCAqIGVzY2FsYXRlZCkgY29tbWFuZCB1bmRlciBgb24tcmVxdWVzdGAgKyBgd29ya3NwYWNlLXdyaXRlYCBpdCBmaXJzdCBhdHRlbXB0c1xuXHQgKiBpdCBpbnNpZGUgdGhlIHNhbmRib3ggXHUyMDE0IHdoaWNoIGNvbXBsZXRlcyBpbnN0YW50bHkgd2l0aCBubyBvdXRwdXQgYmVjYXVzZVxuXHQgKiB0aGUgc2FuZGJveCBibG9ja2VkIGl0IFx1MjAxNCB0aGVuIHJlLXJ1bnMgdGhlIFNBTUUgY29tbWFuZCBhcyBhIHNlcGFyYXRlXG5cdCAqIGBjb21tYW5kRXhlY3V0aW9uYCBpdGVtIGd1YXJkZWQgYnkgYW4gYXBwcm92YWwgcmVxdWVzdC4gUmVuZGVyaW5nIGJvdGhcblx0ICogaXRlbXMgZHJhd3MgdGhlIGNvbW1hbmQgYm94IHR3aWNlLiBUbyBjb2FsZXNjZSB0aGVtIHdlIGRlZmVyIHRoZVxuXHQgKiBwcmUtZmxpZ2h0J3MgY29tcGxldGlvbiBoZXJlOiBpZiB0aGUgbmV4dCBgY29tbWFuZEV4ZWN1dGlvbmAgaW4gdGhlIHR1cm5cblx0ICogcmUtcnVucyB0aGUgc2FtZSBjb21tYW5kIGl0IHJldXNlcyB0aGlzIChzdGlsbC1vcGVuKSB0b29sIGNhbGwgZm9yIGEgc2luZ2xlXG5cdCAqIGJveDsgb3RoZXJ3aXNlIHRoZSBkZWZlcnJlZCBjb21wbGV0aW9uIGlzIGZsdXNoZWQgKG9uIHRoZSBuZXh0IGl0ZW0gb3IgYXRcblx0ICogdHVybiBlbmQpIHNvIGEgZ2VudWluZWx5IG91dHB1dC1sZXNzIGNvbW1hbmQgc3RpbGwgZmluYWxpemVzLlxuXHQgKi9cblx0cGVuZGluZ1ByZWZsaWdodDogSUNvZGV4UGVuZGluZ1ByZWZsaWdodCB8IHVuZGVmaW5lZDtcblx0LyoqXG5cdCAqIENvdW50IG9mIGBhZ2VudE1lc3NhZ2VgIG1hcmtkb3duIHBhcnRzIHN0YXJ0ZWQgaW4gdGhlIGN1cnJlbnQgdHVybi4gUmVzZXRcblx0ICogcGVyIHR1cm4gYnkge0BsaW5rIHJlc2V0Q29kZXhUdXJuTWFwU3RhdGV9OyBzZWUge0BsaW5rIG1hcEl0ZW1TdGFydGVkQm9keX0uXG5cdCAqL1xuXHRhZ2VudE1lc3NhZ2VQYXJ0Q291bnQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBBIGRlZmVycmVkIGBjb21tYW5kRXhlY3V0aW9uYCBjb21wbGV0aW9uIGhlbGQgYmFjayB0byBjb2FsZXNjZSBhIHNhbmRib3hcbiAqIHByZS1mbGlnaHQgd2l0aCBpdHMgYXBwcm92YWwtZ3VhcmRlZCByZS1ydW4uIFNlZVxuICoge0BsaW5rIElDb2RleFNlc3Npb25NYXBTdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0fS5cbiAqL1xuaW50ZXJmYWNlIElDb2RleFBlbmRpbmdQcmVmbGlnaHQge1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nO1xuXHQvKiogVW53cmFwcGVkIGNvbW1hbmQgdGV4dCwgdXNlZCB0byBtYXRjaCB0aGUgcmUtcnVuLiAqL1xuXHRyZWFkb25seSBjb21tYW5kOiBzdHJpbmc7XG5cdC8qKiBUaGUgYENoYXRUb29sQ2FsbENvbXBsZXRlYCBhY3Rpb24gdG8gZW1pdCBpZiB0aGUgcHJlLWZsaWdodCBpcyBub3QgcmV1c2VkLiAqL1xuXHRyZWFkb25seSBjb21wbGV0aW9uOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW107XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvZGV4VG9vbENhbGxFbnRyeSB7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdHVybklkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdG91dHB1dDogc3RyaW5nO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY3JlYXRlQ29kZXhTZXNzaW9uTWFwU3RhdGUoc2VydmVyVG9vbE5hbWVzOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldCgpLCBjbGllbnRUb29sU2V0OiBBY3RpdmVDbGllbnRUb29sU2V0ID0gbmV3IEFjdGl2ZUNsaWVudFRvb2xTZXQoKSk6IElDb2RleFNlc3Npb25NYXBTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0aXRlbVRvUGFydElkOiBuZXcgTWFwKCksXG5cdFx0aXRlbVRvVG9vbENhbGw6IG5ldyBNYXAoKSxcblx0XHRpdGVtVG9SZWFzb25pbmdQYXJ0SWQ6IG5ldyBNYXAoKSxcblx0XHRjdXJyZW50VHVybklkOiB1bmRlZmluZWQsXG5cdFx0dHVybkRpZmZUb29sQ2FsbDogdW5kZWZpbmVkLFxuXHRcdGNsaWVudFRvb2xTZXQsXG5cdFx0c2VydmVyVG9vbE5hbWVzLFxuXHRcdG1jcEN1c3RvbWl6YXRpb25JZHM6IG5ldyBNYXAoKSxcblx0XHRkZWNsaW5lZFRvb2xDYWxsczogbmV3IFNldCgpLFxuXHRcdGRlZmVycmVkUmVzcG9uc2VBY3Rpb25zOiBbXSxcblx0XHRwZW5kaW5nUHJlZmxpZ2h0OiB1bmRlZmluZWQsXG5cdFx0YWdlbnRNZXNzYWdlUGFydENvdW50OiAwLFxuXHR9O1xufVxuXG4vKipcbiAqIENsZWFyIHRoZSBwZXItdHVybiBib29ra2VlcGluZyBtYXBzIHNvIHN0cmVhbWVkIHBhcnRzLCB0b29sLWNhbGxzLCBhbmRcbiAqIHJlYXNvbmluZyBwYXJ0cyBmcm9tIGEgZmluaXNoZWQgKG9yIHByZWVtcHRlZCkgdHVybiBkb24ndCBibGVlZCBpbnRvIHRoZVxuICogbmV4dCBvbmUuIERvZXMgTk9UIHRvdWNoIHtAbGluayBJQ29kZXhTZXNzaW9uTWFwU3RhdGUuY3VycmVudFR1cm5JZH0sXG4gKiB3aGljaCB0cmFja3MgdGhlIGNvZGV4IGFwcC1zZXJ2ZXIgdHVybiBpZCBhbmQgaXMgb3duZWQgYnkgdGhlXG4gKiB0dXJuL3N0YXJ0ZWQgKyB0dXJuL2NvbXBsZXRlZCBoYW5kbGVycy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSk6IHZvaWQge1xuXHRzdGF0ZS5pdGVtVG9QYXJ0SWQuY2xlYXIoKTtcblx0c3RhdGUuaXRlbVRvVG9vbENhbGwuY2xlYXIoKTtcblx0c3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLmNsZWFyKCk7XG5cdHN0YXRlLmRlY2xpbmVkVG9vbENhbGxzLmNsZWFyKCk7XG5cdHN0YXRlLmRlZmVycmVkUmVzcG9uc2VBY3Rpb25zLmxlbmd0aCA9IDA7XG5cdHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgPSB1bmRlZmluZWQ7XG5cdHN0YXRlLnR1cm5EaWZmVG9vbENhbGwgPSB1bmRlZmluZWQ7XG5cdHN0YXRlLmFnZW50TWVzc2FnZVBhcnRDb3VudCA9IDA7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaW5hbGl6ZUNvZGV4VHVybk1hcFN0YXRlKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsIHVucmVzb2x2ZWRUb29sTWVzc2FnZTogc3RyaW5nKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0Y29uc3QgcHJlZmxpZ2h0Rmx1c2ggPSBmbHVzaFBlbmRpbmdQcmVmbGlnaHQoc3RhdGUpO1xuXHRjb25zdCBvcnBoYW5lZFRvb2xDYWxsQWN0aW9ucyA9IGNvbXBsZXRlT3JwaGFuZWRUb29sQ2FsbHMoc3RhdGUsIHVucmVzb2x2ZWRUb29sTWVzc2FnZSk7XG5cdGNvbnN0IHR1cm5EaWZmQWN0aW9ucyA9IGNvbXBsZXRlVHVybkRpZmZUb29sQ2FsbChzdGF0ZSwgZmFsc2UsIHVucmVzb2x2ZWRUb29sTWVzc2FnZSk7XG5cdGNvbnN0IGRlZmVycmVkUmVzcG9uc2VBY3Rpb25zID0gZmx1c2hEZWZlcnJlZFJlc3BvbnNlQWN0aW9ucyhzdGF0ZSk7XG5cdHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc3RhdGUpO1xuXHRyZXR1cm4gWy4uLnByZWZsaWdodEZsdXNoLCAuLi5vcnBoYW5lZFRvb2xDYWxsQWN0aW9ucywgLi4udHVybkRpZmZBY3Rpb25zLCAuLi5kZWZlcnJlZFJlc3BvbnNlQWN0aW9uc107XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlVHVybkRpZmZUb29sQ2FsbChzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLCBzdWNjZXNzOiBib29sZWFuLCBtZXNzYWdlOiBzdHJpbmcpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnRyeSA9IHN0YXRlLnR1cm5EaWZmVG9vbENhbGw7XG5cdHN0YXRlLnR1cm5EaWZmVG9vbENhbGwgPSB1bmRlZmluZWQ7XG5cdGlmICghZW50cnkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0cmV0dXJuIFt7XG5cdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdHJlc3VsdDoge1xuXHRcdFx0c3VjY2Vzcyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHN1Y2Nlc3MgPyAnVXBkYXRlZCBmaWxlcycgOiAnRmlsZSB1cGRhdGVzIHN0b3BwZWQnLFxuXHRcdFx0Y29udGVudDogWy4uLmVudHJ5LmNvbnRlbnRdLFxuXHRcdFx0Li4uKHN1Y2Nlc3MgPyB7fSA6IHsgZXJyb3I6IHsgbWVzc2FnZSB9IH0pLFxuXHRcdH0sXG5cdH1dO1xufVxuXG4vKipcbiAqIEVtaXQgYW5kIGNsZWFyIGFueSBkZWZlcnJlZCBzYW5kYm94IHByZS1mbGlnaHQgY29tcGxldGlvbiAoc2VlXG4gKiB7QGxpbmsgSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLnBlbmRpbmdQcmVmbGlnaHR9KS4gUmV0dXJucyBgW11gIHdoZW4gbm90aGluZyBpc1xuICogcGVuZGluZywgc28gY2FsbGVycyBjYW4gdW5jb25kaXRpb25hbGx5IHByZXBlbmQgdGhlIHJlc3VsdC5cbiAqL1xuZnVuY3Rpb24gZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBwZW5kaW5nID0gc3RhdGUucGVuZGluZ1ByZWZsaWdodDtcblx0aWYgKCFwZW5kaW5nKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgPSB1bmRlZmluZWQ7XG5cdHJldHVybiBwZW5kaW5nLmNvbXBsZXRpb247XG59XG5cbmZ1bmN0aW9uIGRlZmVyUmVzcG9uc2VXaGlsZVRvb2xDYWxsSXNPcGVuKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsIGFjdGlvbnM6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSk6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGlmICghaGFzT3BlbkNvbW1hbmRFeGVjdXRpb24oc3RhdGUpICYmICFzdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0KSB7XG5cdFx0cmV0dXJuIGFjdGlvbnM7XG5cdH1cblx0c3RhdGUuZGVmZXJyZWRSZXNwb25zZUFjdGlvbnMucHVzaCguLi5hY3Rpb25zKTtcblx0cmV0dXJuIFtdO1xufVxuXG5mdW5jdGlvbiBmbHVzaERlZmVycmVkUmVzcG9uc2VBY3Rpb25zKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRpZiAoaGFzT3BlbkNvbW1hbmRFeGVjdXRpb24oc3RhdGUpIHx8IHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgfHwgc3RhdGUuZGVmZXJyZWRSZXNwb25zZUFjdGlvbnMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHJldHVybiBzdGF0ZS5kZWZlcnJlZFJlc3BvbnNlQWN0aW9ucy5zcGxpY2UoMCk7XG59XG5cbmZ1bmN0aW9uIGhhc09wZW5Db21tYW5kRXhlY3V0aW9uKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuIFsuLi5zdGF0ZS5pdGVtVG9Ub29sQ2FsbC52YWx1ZXMoKV0uc29tZShlbnRyeSA9PiBlbnRyeS50b29sTmFtZSA9PT0gJ3NoZWxsJyk7XG59XG5cbmZ1bmN0aW9uIGNvbXBsZXRlT3JwaGFuZWRUb29sQ2FsbHMoc3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSwgZXJyb3JNZXNzYWdlOiBzdHJpbmcpOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBvcnBoYW5lZFRvb2xDYWxscyA9IFsuLi5zdGF0ZS5pdGVtVG9Ub29sQ2FsbC52YWx1ZXMoKV07XG5cdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmNsZWFyKCk7XG5cdHJldHVybiBvcnBoYW5lZFRvb2xDYWxscy5tYXAoZW50cnkgPT4gKHtcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0cmVzdWx0OiB7XG5cdFx0XHRzdWNjZXNzOiBmYWxzZSxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGBTdG9wcGVkICR7ZW50cnkudG9vbE5hbWV9YCxcblx0XHRcdGNvbnRlbnQ6IGVudHJ5Lm91dHB1dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IGFzIGNvbnN0LCB0ZXh0OiBlbnRyeS5vdXRwdXQgfV0gOiB1bmRlZmluZWQsXG5cdFx0XHRlcnJvcjogeyBtZXNzYWdlOiBlcnJvck1lc3NhZ2UgfSxcblx0XHR9LFxuXHR9KSk7XG59XG5cbi8qKlxuICogQ29sbGVjdCB0aGUgcGxhaW4tdGV4dCBwb3J0aW9ucyBvZiBhIGNvZGV4IGB1c2VyTWVzc2FnZWAgaXRlbSdzXG4gKiBgY29udGVudGAgKGFuIGFycmF5IG9mIHtAbGluayBVc2VySW5wdXR9KS4gTm9uLXRleHQgaW5wdXRzIChpbWFnZXMsXG4gKiBza2lsbHMsIG1lbnRpb25zKSBhcmUgaWdub3JlZC4gTXVsdGlwbGUgdGV4dCBwYXJ0cyBhcmUgam9pbmVkIHdpdGggYVxuICogYmxhbmsgbGluZSwgbWlycm9yaW5nIHtAbGluayBtYXBUdXJuU3RhcnRlZH0ncyByZWNvbnN0cnVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGV4dHJhY3RVc2VySW5wdXRUZXh0KGNvbnRlbnQ6IHJlYWRvbmx5IFVzZXJJbnB1dFtdKTogc3RyaW5nIHtcblx0Y29uc3QgY29sbGVjdGVkOiBzdHJpbmdbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGMgb2YgY29udGVudCkge1xuXHRcdGlmIChjLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0Y29sbGVjdGVkLnB1c2goYy50ZXh0KTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGNvbGxlY3RlZC5qb2luKCdcXG5cXG4nKTtcbn1cblxuZnVuY3Rpb24gcmVhc29uaW5nS2V5KGl0ZW1JZDogc3RyaW5nLCBraW5kOiAnc3VtbWFyeScgfCAndGV4dCcsIGluZGV4OiBudW1iZXIpOiBzdHJpbmcge1xuXHRyZXR1cm4gYCR7aXRlbUlkfToke2tpbmR9OiR7aW5kZXh9YDtcbn1cblxuZnVuY3Rpb24gZW5zdXJlUmVhc29uaW5nUGFydChzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLCB0dXJuSWQ6IHN0cmluZywga2V5OiBzdHJpbmcpOiB7IHJlYWRvbmx5IHBhcnRJZDogc3RyaW5nOyByZWFkb25seSBhY3Rpb25zOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10gfSB7XG5cdGNvbnN0IGV4aXN0aW5nID0gc3RhdGUuaXRlbVRvUmVhc29uaW5nUGFydElkLmdldChrZXkpO1xuXHRpZiAoZXhpc3RpbmcpIHtcblx0XHRyZXR1cm4geyBwYXJ0SWQ6IGV4aXN0aW5nLCBhY3Rpb25zOiBbXSB9O1xuXHR9XG5cdGNvbnN0IHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuc2V0KGtleSwgcGFydElkKTtcblx0cmV0dXJuIHtcblx0XHRwYXJ0SWQsXG5cdFx0YWN0aW9uczogW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHBhcnQ6IHsga2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsIGlkOiBwYXJ0SWQsIGNvbnRlbnQ6ICcnIH0sXG5cdFx0fV0sXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBkZXNjcmliZVdlYlNlYXJjaChxdWVyeTogc3RyaW5nLCBhY3Rpb246IFdlYlNlYXJjaEFjdGlvbiB8IG51bGwpOiBzdHJpbmcge1xuXHRpZiAoYWN0aW9uPy50eXBlID09PSAnc2VhcmNoJykge1xuXHRcdHJldHVybiBhY3Rpb24ucXVlcmllcz8uam9pbignLCAnKSA/PyBhY3Rpb24ucXVlcnkgPz8gcXVlcnk7XG5cdH1cblx0aWYgKGFjdGlvbj8udHlwZSA9PT0gJ29wZW5QYWdlJykge1xuXHRcdHJldHVybiBhY3Rpb24udXJsID8/IHF1ZXJ5O1xuXHR9XG5cdGlmIChhY3Rpb24/LnR5cGUgPT09ICdmaW5kSW5QYWdlJykge1xuXHRcdHJldHVybiBbYWN0aW9uLnBhdHRlcm4sIGFjdGlvbi51cmxdLmZpbHRlcihCb29sZWFuKS5qb2luKCcgaW4gJykgfHwgcXVlcnk7XG5cdH1cblx0cmV0dXJuIHF1ZXJ5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2ViU2VhcmNoSW52b2NhdGlvbk1lc3NhZ2UocXVlcnk6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiBsb2NhbGl6ZSgnY29kZXgud2ViU2VhcmNoLmluUHJvZ3Jlc3MnLCBcIlNlYXJjaGluZyB0aGUgd2ViIGZvciB7MH1cIiwgcXVlcnkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gd2ViU2VhcmNoUGFzdFRlbnNlTWVzc2FnZShxdWVyeTogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxvY2FsaXplKCdjb2RleC53ZWJTZWFyY2guY29tcGxldGVkJywgXCJTZWFyY2hlZCB0aGUgd2ViIGZvciB7MH1cIiwgcXVlcnkpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZGVzY3JpYmVGaWxlQ2hhbmdlKGNoYW5nZXM6IHJlYWRvbmx5IEZpbGVVcGRhdGVDaGFuZ2VbXSk6IHN0cmluZyB7XG5cdHJldHVybiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4ge1xuXHRcdGNvbnN0IGtpbmQgPSBjaGFuZ2Uua2luZC50eXBlID09PSAndXBkYXRlJyAmJiBjaGFuZ2Uua2luZC5tb3ZlX3BhdGhcblx0XHRcdD8gYHJlbmFtZSBmcm9tICR7Y2hhbmdlLmtpbmQubW92ZV9wYXRofWBcblx0XHRcdDogY2hhbmdlLmtpbmQudHlwZTtcblx0XHRyZXR1cm4gYCR7a2luZH06ICR7Y2hhbmdlLnBhdGh9YDtcblx0fSkuam9pbignXFxuJyk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBmaWxlQ2hhbmdlT3V0cHV0KGNoYW5nZXM6IHJlYWRvbmx5IEZpbGVVcGRhdGVDaGFuZ2VbXSk6IHN0cmluZyB7XG5cdHJldHVybiBjaGFuZ2VzLm1hcChjaGFuZ2UgPT4gYCR7ZGVzY3JpYmVGaWxlQ2hhbmdlKFtjaGFuZ2VdKX1cXG4ke2NoYW5nZS5kaWZmfWAudHJpbSgpKS5qb2luKCdcXG5cXG4nKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvZGV4Q29tcGFjdGlvbkxhYmVscygpOiB7IHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGludm9jYXRpb25NZXNzYWdlOiBzdHJpbmc7IHJlYWRvbmx5IHBhc3RUZW5zZU1lc3NhZ2U6IHN0cmluZyB9IHtcblx0cmV0dXJuIHtcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2NvZGV4LmNvbXBhY3Rpb24uZGlzcGxheU5hbWUnLCBcIkNvbXBhY3QgY29udmVyc2F0aW9uXCIpLFxuXHRcdGludm9jYXRpb25NZXNzYWdlOiBsb2NhbGl6ZSgnY29kZXguY29tcGFjdGlvbi5pblByb2dyZXNzJywgXCJDb21wYWN0aW5nIGNvbnZlcnNhdGlvblwiKSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnY29kZXguY29tcGFjdGlvbi5jb21wbGV0ZWQnLCBcIkNvbXBhY3RlZCBjb252ZXJzYXRpb25cIiksXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjb2RleEltYWdlR2VuZXJhdGlvbkxhYmVscyhzdGF0dXM/OiBzdHJpbmcpOiB7IHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7IHJlYWRvbmx5IGludm9jYXRpb25NZXNzYWdlOiBzdHJpbmc7IHJlYWRvbmx5IHBhc3RUZW5zZU1lc3NhZ2U6IHN0cmluZzsgcmVhZG9ubHkgZmFpbGVkTWVzc2FnZTogc3RyaW5nOyByZWFkb25seSBlcnJvck1lc3NhZ2U6IHN0cmluZyB9IHtcblx0cmV0dXJuIHtcblx0XHRkaXNwbGF5TmFtZTogbG9jYWxpemUoJ2NvZGV4LmltYWdlR2VuZXJhdGlvbi5kaXNwbGF5TmFtZScsIFwiR2VuZXJhdGUgaW1hZ2VcIiksXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxvY2FsaXplKCdjb2RleC5pbWFnZUdlbmVyYXRpb24uaW5Qcm9ncmVzcycsIFwiR2VuZXJhdGluZyBpbWFnZVwiKSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiBsb2NhbGl6ZSgnY29kZXguaW1hZ2VHZW5lcmF0aW9uLmNvbXBsZXRlZCcsIFwiR2VuZXJhdGVkIGltYWdlXCIpLFxuXHRcdGZhaWxlZE1lc3NhZ2U6IGxvY2FsaXplKCdjb2RleC5pbWFnZUdlbmVyYXRpb24uZmFpbGVkJywgXCJGYWlsZWQgdG8gZ2VuZXJhdGUgaW1hZ2VcIiksXG5cdFx0ZXJyb3JNZXNzYWdlOiBsb2NhbGl6ZSgnY29kZXguaW1hZ2VHZW5lcmF0aW9uLmVycm9yJywgXCJJbWFnZSBnZW5lcmF0aW9uIHswfVwiLCBzdGF0dXMgPz8gJycpLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBqc29uVmFsdWVUb1RleHQodmFsdWU6IEpzb25WYWx1ZSk6IHN0cmluZyB7XG5cdHJldHVybiB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gdmFsdWUgOiBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgMik7XG59XG5cbmZ1bmN0aW9uIHRvb2xJbnB1dFRleHQodmFsdWU6IEpzb25WYWx1ZSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSwgbnVsbCwgMik7XG59XG5cbmZ1bmN0aW9uIGR5bmFtaWNUb29sT3V0cHV0KGNvbnRlbnRJdGVtczogcmVhZG9ubHkgRHluYW1pY1Rvb2xDYWxsT3V0cHV0Q29udGVudEl0ZW1bXSB8IG51bGwpOiBzdHJpbmcge1xuXHRyZXR1cm4gY29udGVudEl0ZW1zPy5tYXAoaXRlbSA9PiBpdGVtLnR5cGUgPT09ICdpbnB1dFRleHQnID8gaXRlbS50ZXh0IDogaXRlbS50eXBlID09PSAnaW5wdXRJbWFnZScgPyBpdGVtLmltYWdlVXJsIDogaXRlbS5hdWRpb1VybCkuam9pbignXFxuJykgPz8gJyc7XG59XG5cbmZ1bmN0aW9uIG1jcFRvb2xPdXRwdXQocmVzdWx0OiBNY3BUb29sQ2FsbFJlc3VsdCB8IG51bGwsIGVycm9yTWVzc2FnZT86IHN0cmluZyk6IHN0cmluZyB7XG5cdGlmIChlcnJvck1lc3NhZ2UpIHtcblx0XHRyZXR1cm4gZXJyb3JNZXNzYWdlO1xuXHR9XG5cdGlmICghcmVzdWx0KSB7XG5cdFx0cmV0dXJuICcnO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQgPSByZXN1bHQuY29udGVudC5tYXAoanNvblZhbHVlVG9UZXh0KS5qb2luKCdcXG4nKTtcblx0Y29uc3Qgc3RydWN0dXJlZENvbnRlbnQgPSByZXN1bHQuc3RydWN0dXJlZENvbnRlbnQgIT09IG51bGwgPyBqc29uVmFsdWVUb1RleHQocmVzdWx0LnN0cnVjdHVyZWRDb250ZW50KSA6ICcnO1xuXHRyZXR1cm4gW2NvbnRlbnQsIHN0cnVjdHVyZWRDb250ZW50XS5maWx0ZXIoQm9vbGVhbikuam9pbignXFxuJyk7XG59XG5cbi8qKlxuICogSHVtYW4gbGFiZWxzIGZvciBhIENvZGV4IGNvbGxhYi1hZ2VudCAoc3ViYWdlbnQpIHRvb2wgY2FsbCwgbWlycm9yaW5nIHRoZVxuICogcmVmZXJlbmNlIGNsaWVudCdzIHBocmFzaW5nLiBDb2RleCBzdXJmYWNlcyBzdWJhZ2VudCBvcmNoZXN0cmF0aW9uIGFzXG4gKiBgY29sbGFiQWdlbnRUb29sQ2FsbGAgaXRlbXMgb24gdGhlIHBhcmVudCB0aHJlYWQsIGJ1dCBlYWNoIHNwYXduZWQgYWdlbnRcbiAqIGFsc28gcnVucyBhcyBpdHMgb3duIGNoaWxkIHRocmVhZCB0aGF0IGVtaXRzIGEgZnVsbCBgdHVybi8qYCArIGBpdGVtLypgXG4gKiBldmVudCBzdHJlYW0uIFRoZSBob3N0ICh7QGxpbmsgQ29kZXhBZ2VudH0pIHJlbmRlcnMgdGhhdCBjaGlsZCBzdHJlYW0gaW4gYVxuICogcmVhZC1vbmx5IGNoaWxkIGNvbnZlcnNhdGlvbiBhbmQgYXR0YWNoZXMgYSBkaXNjb3ZlcnkgYmxvY2sgdG8gdGhlIHBhcmVudFxuICogYHNwYXduQWdlbnRgIHRvb2wgY2FsbDsgdGhlIGxpZmVjeWNsZSBjb2xsYWIgdG9vbHMgKGB3YWl0YCwgYGNsb3NlQWdlbnRgLFxuICogYHNlbmRJbnB1dGAsIFx1MjAyNikgcmVuZGVyIGFzIHBsYWluIHRvb2wgY2FsbHMgaW4gdGhlIHBhcmVudCBjb252ZXJzYXRpb24uXG4gKi9cbmZ1bmN0aW9uIGNvbGxhYkFnZW50VG9vbExhYmVscyh0b29sOiBDb2xsYWJBZ2VudFRvb2wpOiB7IHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7IHJlYWRvbmx5IHByZXNlbnQ6IHN0cmluZzsgcmVhZG9ubHkgcGFzdDogc3RyaW5nIH0ge1xuXHRzd2l0Y2ggKHRvb2wpIHtcblx0XHRjYXNlICdzcGF3bkFnZW50JzogcmV0dXJuIHsgZGlzcGxheU5hbWU6ICdTcGF3biBhZ2VudCcsIHByZXNlbnQ6ICdTcGF3bmluZyBhZ2VudCcsIHBhc3Q6ICdTcGF3bmVkIGFnZW50JyB9O1xuXHRcdGNhc2UgJ3NlbmRJbnB1dCc6IHJldHVybiB7IGRpc3BsYXlOYW1lOiAnU2VuZCBpbnB1dCB0byBhZ2VudCcsIHByZXNlbnQ6ICdTZW5kaW5nIGlucHV0IHRvIGFnZW50JywgcGFzdDogJ1NlbnQgaW5wdXQgdG8gYWdlbnQnIH07XG5cdFx0Y2FzZSAncmVzdW1lQWdlbnQnOiByZXR1cm4geyBkaXNwbGF5TmFtZTogJ1Jlc3VtZSBhZ2VudCcsIHByZXNlbnQ6ICdSZXN1bWluZyBhZ2VudCcsIHBhc3Q6ICdSZXN1bWVkIGFnZW50JyB9O1xuXHRcdGNhc2UgJ3dhaXQnOiByZXR1cm4geyBkaXNwbGF5TmFtZTogJ1dhaXQgZm9yIGFnZW50cycsIHByZXNlbnQ6ICdXYWl0aW5nIGZvciBhZ2VudHMnLCBwYXN0OiAnRmluaXNoZWQgd2FpdGluZycgfTtcblx0XHRjYXNlICdjbG9zZUFnZW50JzogcmV0dXJuIHsgZGlzcGxheU5hbWU6ICdDbG9zZSBhZ2VudCcsIHByZXNlbnQ6ICdDbG9zaW5nIGFnZW50JywgcGFzdDogJ0Nsb3NlZCBhZ2VudCcgfTtcblx0XHRkZWZhdWx0OiByZXR1cm4geyBkaXNwbGF5TmFtZTogdG9vbCwgcHJlc2VudDogdG9vbCwgcGFzdDogdG9vbCB9O1xuXHR9XG59XG5cbi8qKiBPbmUtbGluZSBzdW1tYXJ5IG9mIGEgc3Bhd25lZCBhZ2VudCdzIHN0YXRlIFx1MjAxNCB0aGUgc3ViYWdlbnQncyByZXN1bHQuICovXG5mdW5jdGlvbiBjb2xsYWJBZ2VudFN0YXRlU3VtbWFyeShzdGF0ZTogQ29sbGFiQWdlbnRTdGF0ZSk6IHN0cmluZyB7XG5cdHN3aXRjaCAoc3RhdGUuc3RhdHVzKSB7XG5cdFx0Y2FzZSAnY29tcGxldGVkJzogcmV0dXJuIHN0YXRlLm1lc3NhZ2UgPyBgQ29tcGxldGVkIFx1MjAxNCAke3N0YXRlLm1lc3NhZ2V9YCA6ICdDb21wbGV0ZWQnO1xuXHRcdGNhc2UgJ2Vycm9yZWQnOiByZXR1cm4gc3RhdGUubWVzc2FnZSA/IGBFcnJvcmVkIFx1MjAxNCAke3N0YXRlLm1lc3NhZ2V9YCA6ICdFcnJvcmVkJztcblx0XHRjYXNlICdydW5uaW5nJzogcmV0dXJuIHN0YXRlLm1lc3NhZ2UgPyBgUnVubmluZyBcdTIwMTQgJHtzdGF0ZS5tZXNzYWdlfWAgOiAnUnVubmluZyc7XG5cdFx0Y2FzZSAnaW50ZXJydXB0ZWQnOiByZXR1cm4gc3RhdGUubWVzc2FnZSA/IGBJbnRlcnJ1cHRlZCBcdTIwMTQgJHtzdGF0ZS5tZXNzYWdlfWAgOiAnSW50ZXJydXB0ZWQnO1xuXHRcdGNhc2UgJ3BlbmRpbmdJbml0JzogcmV0dXJuICdQZW5kaW5nIGluaXQnO1xuXHRcdGNhc2UgJ3NodXRkb3duJzogcmV0dXJuICdTaHV0ZG93bic7XG5cdFx0Y2FzZSAnbm90Rm91bmQnOiByZXR1cm4gJ05vdCBmb3VuZCc7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHN0YXRlLnN0YXR1cztcblx0fVxufVxuXG4vKipcbiAqIFJlbmRlciB0aGUgcGVyLWFnZW50IHJlc3VsdCBibG9jayBmb3IgYSBjb21wbGV0ZWQgY29sbGFiIHRvb2wgY2FsbC4gUHJlZmVyc1xuICogdGhlIHJlY2VpdmVyIG9yZGVyLCB0aGVuIGFwcGVuZHMgYW55IG90aGVyIGFnZW50cyBwcmVzZW50IGluIGBhZ2VudHNTdGF0ZXNgLlxuICogVGhlIGNvbXBsZXRlZCBtZXNzYWdlIGNhcnJpZXMgdGhlIHN1YmFnZW50J3MgYWN0dWFsIG91dHB1dC5cbiAqL1xuZnVuY3Rpb24gY29sbGFiQWdlbnRSZXN1bHRPdXRwdXQocmVjZWl2ZXJUaHJlYWRJZHM6IHJlYWRvbmx5IHN0cmluZ1tdLCBhZ2VudHNTdGF0ZXM6IHsgcmVhZG9ubHkgW2tleTogc3RyaW5nXTogQ29sbGFiQWdlbnRTdGF0ZSB8IHVuZGVmaW5lZCB9KTogc3RyaW5nIHtcblx0Y29uc3Qgc2VlbiA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRjb25zdCBzdGF0ZXM6IENvbGxhYkFnZW50U3RhdGVbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGlkIG9mIHJlY2VpdmVyVGhyZWFkSWRzKSB7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhZ2VudHNTdGF0ZXNbaWRdO1xuXHRcdGlmIChzdGF0ZSkge1xuXHRcdFx0c3RhdGVzLnB1c2goc3RhdGUpO1xuXHRcdFx0c2Vlbi5hZGQoaWQpO1xuXHRcdH1cblx0fVxuXHRmb3IgKGNvbnN0IGlkIG9mIE9iamVjdC5rZXlzKGFnZW50c1N0YXRlcykuc29ydCgpKSB7XG5cdFx0aWYgKHNlZW4uaGFzKGlkKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXRlID0gYWdlbnRzU3RhdGVzW2lkXTtcblx0XHRpZiAoc3RhdGUpIHtcblx0XHRcdHN0YXRlcy5wdXNoKHN0YXRlKTtcblx0XHR9XG5cdH1cblx0aWYgKHN0YXRlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0aWYgKHN0YXRlcy5sZW5ndGggPT09IDEpIHtcblx0XHRyZXR1cm4gY29sbGFiQWdlbnRTdGF0ZVN1bW1hcnkoc3RhdGVzWzBdKTtcblx0fVxuXHRyZXR1cm4gc3RhdGVzLm1hcCgoc3RhdGUsIGluZGV4KSA9PiBgQWdlbnQgJHtpbmRleCArIDF9OiAke2NvbGxhYkFnZW50U3RhdGVTdW1tYXJ5KHN0YXRlKX1gKS5qb2luKCdcXG4nKTtcbn1cblxuLyoqXG4gKiBUcmFuc2xhdGUgYHR1cm4vc3RhcnRlZGAgaW50byBhIGBDaGF0VHVyblN0YXJ0ZWRgIGFjdGlvbi5cbiAqXG4gKiBDb2RleCdzIGB0dXJuL3N0YXJ0ZWQudHVybi5pdGVtc1swXWAgU0hPVUxEIGJlIHRoZSB1c2VyTWVzc2FnZSB0aGF0XG4gKiBraWNrZWQgb2ZmIHRoZSB0dXJuOyB3ZSByZWNvbnN0cnVjdCB0aGUgdXNlciBtZXNzYWdlIGZyb20gaXQuIElmXG4gKiBjb2RleCBkaWRuJ3QgaW5jbHVkZSBpdGVtcyAoaXQgbWF5IG5vdCksIHdlIHN5bnRoZXNpemUgYW4gZW1wdHkgdXNlclxuICogbWVzc2FnZSBzbyB0aGUgYWdlbnQgaG9zdCBjYW4gc3RpbGwgY3JlYXRlIHRoZSB0dXJuIHNoZWxsIFx1MjAxNCB0aGUgYWN0dWFsXG4gKiBwcm9tcHQgdGV4dCB3YXMgc2VudCB2aWEgYHR1cm4vc3RhcnRgIGFuZCBpcyBhbHJlYWR5IGtub3duIGJ5IHRoZSBob3N0XG4gKiB2aWEgdGhlIHByaW9yIGBzZW5kTWVzc2FnZWAgY2FsbC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcFR1cm5TdGFydGVkKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IFR1cm5TdGFydGVkTm90aWZpY2F0aW9uLFxuXHRmYWxsYmFja1VzZXJUZXh0OiBzdHJpbmcsXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRzdGF0ZS5jdXJyZW50VHVybklkID0gcGFyYW1zLnR1cm4uaWQ7XG5cdHJlc2V0Q29kZXhUdXJuTWFwU3RhdGUoc3RhdGUpO1xuXHRsZXQgdXNlclRleHQgPSBmYWxsYmFja1VzZXJUZXh0O1xuXHRjb25zdCBmaXJzdCA9IHBhcmFtcy50dXJuLml0ZW1zPy5bMF07XG5cdGlmIChmaXJzdCAmJiBmaXJzdC50eXBlID09PSAndXNlck1lc3NhZ2UnKSB7XG5cdFx0Y29uc3QgY29sbGVjdGVkID0gZXh0cmFjdFVzZXJJbnB1dFRleHQoZmlyc3QuY29udGVudCk7XG5cdFx0aWYgKGNvbGxlY3RlZC5sZW5ndGggPiAwKSB7XG5cdFx0XHR1c2VyVGV4dCA9IGNvbGxlY3RlZDtcblx0XHR9XG5cdH1cblx0Y29uc3QgZGVsZWdhdGlvbiA9IHBhcnNlQ29kZXhEZWxlZ2F0aW9uKHVzZXJUZXh0KTtcblx0cmV0dXJuIFtcblx0XHR7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuU3RhcnRlZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm4uaWQsXG5cdFx0XHRzdGFydGVkQXQ6IHR5cGVvZiBwYXJhbXMudHVybi5zdGFydGVkQXQgPT09ICdudW1iZXInID8gbmV3IERhdGUocGFyYW1zLnR1cm4uc3RhcnRlZEF0ICogMTAwMCkudG9JU09TdHJpbmcoKSA6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcblx0XHRcdG1lc3NhZ2U6IHtcblx0XHRcdFx0dGV4dDogZGVsZWdhdGlvbj8uaW5wdXQgPz8gdXNlclRleHQsXG5cdFx0XHRcdG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0sXG5cdFx0XHRcdC4uLihkZWxlZ2F0aW9uID8geyBfbWV0YTogdG9BZ2VudE1lc3NhZ2VEZWxlZ2F0aW9uTWV0YSh7IHNvdXJjZVRocmVhZElkOiBkZWxlZ2F0aW9uLnNvdXJjZVRocmVhZElkIH0pIH0gOiB7fSksXG5cdFx0XHR9LFxuXHRcdH0sXG5cdF07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBSZWFzb25pbmdTdW1tYXJ5UGFydEFkZGVkKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IFJlYXNvbmluZ1N1bW1hcnlQYXJ0QWRkZWROb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRyZXR1cm4gZGVmZXJSZXNwb25zZVdoaWxlVG9vbENhbGxJc09wZW4oc3RhdGUsIGVuc3VyZVJlYXNvbmluZ1BhcnQoc3RhdGUsIHBhcmFtcy50dXJuSWQsIHJlYXNvbmluZ0tleShwYXJhbXMuaXRlbUlkLCAnc3VtbWFyeScsIHBhcmFtcy5zdW1tYXJ5SW5kZXgpKS5hY3Rpb25zKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcFJlYXNvbmluZ1N1bW1hcnlUZXh0RGVsdGEoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogUmVhc29uaW5nU3VtbWFyeVRleHREZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGVuc3VyZWQgPSBlbnN1cmVSZWFzb25pbmdQYXJ0KHN0YXRlLCBwYXJhbXMudHVybklkLCByZWFzb25pbmdLZXkocGFyYW1zLml0ZW1JZCwgJ3N1bW1hcnknLCBwYXJhbXMuc3VtbWFyeUluZGV4KSk7XG5cdHJldHVybiBkZWZlclJlc3BvbnNlV2hpbGVUb29sQ2FsbElzT3BlbihzdGF0ZSwgW1xuXHRcdC4uLmVuc3VyZWQuYWN0aW9ucyxcblx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZywgdHVybklkOiBwYXJhbXMudHVybklkLCBwYXJ0SWQ6IGVuc3VyZWQucGFydElkLCBjb250ZW50OiBwYXJhbXMuZGVsdGEsIF9tZXRhOiB0b0NvZGV4UmVhc29uaW5nTWV0YSgnc3VtbWFyeScpIH0sXG5cdF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFwUmVhc29uaW5nVGV4dERlbHRhKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IFJlYXNvbmluZ1RleHREZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGVuc3VyZWQgPSBlbnN1cmVSZWFzb25pbmdQYXJ0KHN0YXRlLCBwYXJhbXMudHVybklkLCByZWFzb25pbmdLZXkocGFyYW1zLml0ZW1JZCwgJ3RleHQnLCBwYXJhbXMuY29udGVudEluZGV4KSk7XG5cdHJldHVybiBkZWZlclJlc3BvbnNlV2hpbGVUb29sQ2FsbElzT3BlbihzdGF0ZSwgW1xuXHRcdC4uLmVuc3VyZWQuYWN0aW9ucyxcblx0XHR7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZywgdHVybklkOiBwYXJhbXMudHVybklkLCBwYXJ0SWQ6IGVuc3VyZWQucGFydElkLCBjb250ZW50OiBwYXJhbXMuZGVsdGEsIF9tZXRhOiB0b0NvZGV4UmVhc29uaW5nTWV0YSgndGV4dCcpIH0sXG5cdF0pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY2xlYXJSZWFzb25pbmdGb3JJdGVtKHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsIGl0ZW1JZDogc3RyaW5nKTogdm9pZCB7XG5cdGZvciAoY29uc3Qga2V5IG9mIFsuLi5zdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQua2V5cygpXSkge1xuXHRcdGlmIChrZXkuc3RhcnRzV2l0aChgJHtpdGVtSWR9OmApKSB7XG5cdFx0XHRzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuZGVsZXRlKGtleSk7XG5cdFx0fVxuXHR9XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBUb2tlblVzYWdlVXBkYXRlZChwYXJhbXM6IFRocmVhZFRva2VuVXNhZ2VVcGRhdGVkTm90aWZpY2F0aW9uLCBtb2RlbElkPzogc3RyaW5nKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0Y29uc3QgbGFzdCA9IHBhcmFtcy50b2tlblVzYWdlLmxhc3Q7XG5cdHJldHVybiBbe1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFVzYWdlLFxuXHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHR1c2FnZToge1xuXHRcdFx0aW5wdXRUb2tlbnM6IGxhc3QuaW5wdXRUb2tlbnMsXG5cdFx0XHRvdXRwdXRUb2tlbnM6IGxhc3Qub3V0cHV0VG9rZW5zLFxuXHRcdFx0Li4uKG1vZGVsSWQgPyB7IG1vZGVsOiBtb2RlbElkIH0gOiB7fSksXG5cdFx0XHRjYWNoZVJlYWRUb2tlbnM6IGxhc3QuY2FjaGVkSW5wdXRUb2tlbnMsXG5cdFx0XHRfbWV0YToge1xuXHRcdFx0XHRyZWFzb25pbmdPdXRwdXRUb2tlbnM6IGxhc3QucmVhc29uaW5nT3V0cHV0VG9rZW5zLFxuXHRcdFx0XHRtb2RlbENvbnRleHRXaW5kb3c6IHBhcmFtcy50b2tlblVzYWdlLm1vZGVsQ29udGV4dFdpbmRvdyxcblx0XHRcdH0sXG5cdFx0fSxcblx0fV07XG59XG5cbi8qKlxuICogYGl0ZW0vc3RhcnRlZGAgZm9yIGFuIGBhZ2VudE1lc3NhZ2VgIGJlY29tZXMgYSBgQ2hhdFJlc3BvbnNlUGFydGBcbiAqIGFjdGlvbiB3aXRoIGFuIGVtcHR5IGBNYXJrZG93blJlc3BvbnNlUGFydGAgc2hlbGwuIFN1YnNlcXVlbnRcbiAqIGBpdGVtL2FnZW50TWVzc2FnZS9kZWx0YWAgbm90aWZpY2F0aW9ucyBhcHBlbmQgdG8gdGhhdCBwYXJ0LlxuICpcbiAqIE90aGVyIGl0ZW0gdHlwZXMgYXJlIGlnbm9yZWQgaW4gUGhhc2UgMiBcdTIwMTQgdGhleSdsbCBiZSBwaWNrZWQgdXAgYnlcbiAqIFBoYXNlIDYncyB0b29sLWNhbGwgbWFwcGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwSXRlbVN0YXJ0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogSXRlbVN0YXJ0ZWROb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHQvLyBDb2FsZXNjZSBhIHNhbmRib3ggcHJlLWZsaWdodCB3aXRoIGl0cyBhcHByb3ZhbC1ndWFyZGVkIHJlLXJ1bjogaWYgdGhlXG5cdC8vIGltbWVkaWF0ZWx5LXByZWNlZGluZyBjb21tYW5kRXhlY3V0aW9uIGluIHRoaXMgdHVybiByYW4gdGhlIHNhbWUgY29tbWFuZFxuXHQvLyBhbmQgY29tcGxldGVkIHdpdGggbm8gb3V0cHV0IChkZWZlcnJlZCBhcyBhIHBlbmRpbmcgcHJlLWZsaWdodCksIHJldXNlIGl0c1xuXHQvLyBzdGlsbC1vcGVuIHRvb2wgY2FsbCBpbnN0ZWFkIG9mIG9wZW5pbmcgYSBzZWNvbmQgYm94LiBUaGUgZXNjYWxhdGlvbidzXG5cdC8vIGByZXF1ZXN0QXBwcm92YWxgIC8gYGl0ZW0vY29tcGxldGVkYCB0aGVuIGRyaXZlIHRoYXQgYm94IHRvIGl0cyBmaW5hbFxuXHQvLyBzdGF0ZSwgc28gbm90aGluZyBuZXcgaXMgZW1pdHRlZCBoZXJlLlxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2NvbW1hbmRFeGVjdXRpb24nKSB7XG5cdFx0Y29uc3QgcGVuZGluZyA9IHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQ7XG5cdFx0aWYgKHBlbmRpbmcgJiYgcGVuZGluZy50dXJuSWQgPT09IHBhcmFtcy50dXJuSWQgJiYgcGVuZGluZy5jb21tYW5kID09PSB1bndyYXBTaGVsbEludm9jYXRpb24ocGFyYW1zLml0ZW0uY29tbWFuZCA/PyAnJykpIHtcblx0XHRcdHN0YXRlLnBlbmRpbmdQcmVmbGlnaHQgPSB1bmRlZmluZWQ7XG5cdFx0XHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zZXQocGFyYW1zLml0ZW0uaWQsIHtcblx0XHRcdFx0dG9vbENhbGxJZDogcGVuZGluZy50b29sQ2FsbElkLFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiAnc2hlbGwnLFxuXHRcdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gW107XG5cdFx0fVxuXHR9XG5cdC8vIEFueSBvdGhlciBpdGVtIHN1cGVyc2VkZXMgYSBkZWZlcnJlZCBwcmUtZmxpZ2h0OiBmaW5hbGl6ZSBpdCBmaXJzdCBzbyBhXG5cdC8vIGdlbnVpbmVseSBvdXRwdXQtbGVzcyBjb21tYW5kIHN0aWxsIHJlbmRlcnMgcHJvbXB0bHkgYXMgYSBzaW5nbGUgYm94LlxuXHRjb25zdCBmbHVzaGVkID0gZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlKTtcblx0Y29uc3QgZGVmZXJyZWRSZXNwb25zZUFjdGlvbnMgPSBmbHVzaERlZmVycmVkUmVzcG9uc2VBY3Rpb25zKHN0YXRlKTtcblx0Y29uc3QgYm9keSA9IG1hcEl0ZW1TdGFydGVkQm9keShzdGF0ZSwgcGFyYW1zKTtcblx0Y29uc3Qgb3JkZXJlZEJvZHkgPSBwYXJhbXMuaXRlbS50eXBlID09PSAnYWdlbnRNZXNzYWdlJ1xuXHRcdD8gZGVmZXJSZXNwb25zZVdoaWxlVG9vbENhbGxJc09wZW4oc3RhdGUsIGJvZHkpXG5cdFx0OiBib2R5O1xuXHRyZXR1cm4gWy4uLmZsdXNoZWQsIC4uLmRlZmVycmVkUmVzcG9uc2VBY3Rpb25zLCAuLi5vcmRlcmVkQm9keV07XG59XG5cbmZ1bmN0aW9uIG1hcEl0ZW1TdGFydGVkQm9keShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBJdGVtU3RhcnRlZE5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnYWdlbnRNZXNzYWdlJykge1xuXHRcdGNvbnN0IHBhcnRJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHN0YXRlLml0ZW1Ub1BhcnRJZC5zZXQocGFyYW1zLml0ZW0uaWQsIHBhcnRJZCk7XG5cdFx0Ly8gU2VwYXJhdGUgY29uc2VjdXRpdmUgYWdlbnQgbWVzc2FnZXMgc28gdGhlIGNoYXQgbW9kZWwncyBzZXBhcmF0b3ItbGVzc1xuXHRcdC8vIG1hcmtkb3duIGNvYWxlc2NpbmcgZG9lc24ndCBnbHVlIGEgZm9sbG93aW5nIGhlYWRpbmcgb250byB0aGUgcHJpb3IgbGluZS5cblx0XHRjb25zdCBzZXBhcmF0b3IgPSBzdGF0ZS5hZ2VudE1lc3NhZ2VQYXJ0Q291bnQgPiAwID8gJ1xcblxcbicgOiAnJztcblx0XHRzdGF0ZS5hZ2VudE1lc3NhZ2VQYXJ0Q291bnQrKztcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRSZXNwb25zZVBhcnQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0cGFydDoge1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0aWQ6IHBhcnRJZCxcblx0XHRcdFx0XHRjb250ZW50OiBzZXBhcmF0b3IgKyAocGFyYW1zLml0ZW0udGV4dCA/PyAnJyksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdjb21tYW5kRXhlY3V0aW9uJykge1xuXHRcdC8vIFBoYXNlIDQ6IHN1cmZhY2Ugc2hlbGwgY29tbWFuZHMgYXMgdG9vbCBjYWxscy4gV2UgYWxsb2NhdGUgYVxuXHRcdC8vIGZyZXNoIHRvb2xDYWxsSWQ7IHRoZSBgY29tbWFuZEV4ZWN1dGlvbmAgaXRlbSBpZCBvbmx5XG5cdFx0Ly8gZGlzYW1iaWd1YXRlcyB0aGUgY29kZXggc2lkZS5cblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0c3RhdGUuaXRlbVRvVG9vbENhbGwuc2V0KHBhcmFtcy5pdGVtLmlkLCB7XG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0dG9vbE5hbWU6ICdzaGVsbCcsXG5cdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB1bndyYXBTaGVsbEludm9jYXRpb24ocGFyYW1zLml0ZW0uY29tbWFuZCA/PyAnJyk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogJ3NoZWxsJyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6ICdSdW4gc2hlbGwgY29tbWFuZCcsXG5cdFx0XHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh7IHRvb2xLaW5kOiAndGVybWluYWwnIH0pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiBjb21tYW5kLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogY29tbWFuZCxcblx0XHRcdFx0dG9vbElucHV0OiBjb21tYW5kLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKHsgdG9vbEtpbmQ6ICd0ZXJtaW5hbCcgfSksXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICd3ZWJTZWFyY2gnKSB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lOiAnd2ViX3NlYXJjaCcsXG5cdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdH0pO1xuXHRcdGNvbnN0IHF1ZXJ5ID0gZGVzY3JpYmVXZWJTZWFyY2gocGFyYW1zLml0ZW0ucXVlcnksIHBhcmFtcy5pdGVtLmFjdGlvbik7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogJ3dlYl9zZWFyY2gnLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogJ1dlYiBzZWFyY2gnLFxuXHRcdFx0XHRfbWV0YTogdG9Ub29sQ2FsbE1ldGEoeyB0b29sS2luZDogJ3NlYXJjaCcgfSksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGNvbnRlbnQ6IHF1ZXJ5LFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogd2ViU2VhcmNoSW52b2NhdGlvbk1lc3NhZ2UocXVlcnkpLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHF1ZXJ5LFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0X21ldGE6IHRvVG9vbENhbGxNZXRhKHsgdG9vbEtpbmQ6ICdzZWFyY2gnIH0pLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnaW1hZ2VHZW5lcmF0aW9uJykge1xuXHRcdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0XHRjb25zdCBsYWJlbHMgPSBjb2RleEltYWdlR2VuZXJhdGlvbkxhYmVscygpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lOiAnaW1hZ2VfZ2VuLmltYWdlZ2VuJyxcblx0XHRcdG91dHB1dDogJycsXG5cdFx0fSk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZTogJ2ltYWdlX2dlbi5pbWFnZWdlbicsXG5cdFx0XHRcdGRpc3BsYXlOYW1lOiBsYWJlbHMuZGlzcGxheU5hbWUsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBsYWJlbHMuaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdHRvb2xJbnB1dDogSlNPTi5zdHJpbmdpZnkoeyBwcm9tcHQ6IHBhcmFtcy5pdGVtLnJldmlzZWRQcm9tcHQgPz8gbGFiZWxzLmRpc3BsYXlOYW1lIH0pLFxuXHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdH0sXG5cdFx0XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2ZpbGVDaGFuZ2UnKSB7XG5cdFx0cmV0dXJuIG1hcEZpbGVDaGFuZ2VTdGFydGVkKHN0YXRlLCBwYXJhbXMudHVybklkLCBwYXJhbXMuaXRlbS5pZCwgcGFyYW1zLml0ZW0uY2hhbmdlcyk7XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdtY3BUb29sQ2FsbCcpIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgdG9vbE5hbWUgPSBgJHtwYXJhbXMuaXRlbS5zZXJ2ZXJ9LiR7cGFyYW1zLml0ZW0udG9vbH1gO1xuXHRcdGNvbnN0IHRvb2xJbnB1dCA9IHRvb2xJbnB1dFRleHQocGFyYW1zLml0ZW0uYXJndW1lbnRzKTtcblx0XHRjb25zdCBjdXN0b21pemF0aW9uSWQgPSBzdGF0ZS5tY3BDdXN0b21pemF0aW9uSWRzLmdldChwYXJhbXMuaXRlbS5zZXJ2ZXIpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0b3V0cHV0OiAnJyxcblx0XHR9KTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogcGFyYW1zLml0ZW0udG9vbCxcblx0XHRcdFx0Li4uKGN1c3RvbWl6YXRpb25JZCA/IHsgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiB0b29sSW5wdXQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBgQ2FsbGluZyAke3Rvb2xOYW1lfWAsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdkeW5hbWljVG9vbENhbGwnKSB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IHRvb2xOYW1lID0gcGFyYW1zLml0ZW0ubmFtZXNwYWNlID8gYCR7cGFyYW1zLml0ZW0ubmFtZXNwYWNlfS4ke3BhcmFtcy5pdGVtLnRvb2x9YCA6IHBhcmFtcy5pdGVtLnRvb2w7XG5cdFx0Y29uc3QgdG9vbElucHV0ID0gdG9vbElucHV0VGV4dChwYXJhbXMuaXRlbS5hcmd1bWVudHMpO1xuXHRcdGNvbnN0IG91dHB1dCA9IGR5bmFtaWNUb29sT3V0cHV0KHBhcmFtcy5pdGVtLmNvbnRlbnRJdGVtcyk7XG5cdFx0Ly8gU2VydmVyIHRvb2xzIChyZWdpc3RlcmVkIHVuZGVyIHRoZWlyIGJhcmUgbmFtZSkgZXhlY3V0ZSBpbi1wcm9jZXNzLCBzb1xuXHRcdC8vIHRoZXkgY2Fycnkgbm8gYENsaWVudGAgY29udHJpYnV0b3I7IG9ubHkgY2xpZW50LXByb3ZpZGVkIHRvb2xzIHJvdXRlXG5cdFx0Ly8gZXhlY3V0aW9uIGJhY2sgdG8gdGhlIG93bmluZyB3b3JrYmVuY2ggY2xpZW50LlxuXHRcdGNvbnN0IGlzU2VydmVyVG9vbCA9IHBhcmFtcy5pdGVtLm5hbWVzcGFjZSA9PT0gbnVsbCAmJiBzdGF0ZS5zZXJ2ZXJUb29sTmFtZXMuaGFzKHBhcmFtcy5pdGVtLnRvb2wpO1xuXHRcdGNvbnN0IG93bmVyQ2xpZW50SWQgPSBpc1NlcnZlclRvb2wgPyB1bmRlZmluZWQgOiBzdGF0ZS5jbGllbnRUb29sU2V0Lm93bmVyT2YocGFyYW1zLml0ZW0udG9vbCk7XG5cdFx0Y29uc3Qgc2VydmVyRGlzcGxheSA9IGdldFNlcnZlclRvb2xEaXNwbGF5KHBhcmFtcy5pdGVtLnRvb2wsIHBhcmFtcy5pdGVtLmFyZ3VtZW50cykgPz8gZ2V0V3JpdGVGaWxlVG9vbERpc3BsYXkocGFyYW1zLml0ZW0udG9vbCwgcGFyYW1zLml0ZW0uYXJndW1lbnRzKTtcblx0XHRzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5zZXQocGFyYW1zLml0ZW0uaWQsIHtcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHR0b29sTmFtZSxcblx0XHRcdG91dHB1dCxcblx0XHR9KTtcblx0XHRyZXR1cm4gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogc2VydmVyRGlzcGxheT8uZGlzcGxheU5hbWUgPz8gcGFyYW1zLml0ZW0udG9vbCxcblx0XHRcdFx0Li4uKG93bmVyQ2xpZW50SWQgPyB7IGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IG93bmVyQ2xpZW50SWQgfSB9IDoge30pLFxuXHRcdFx0fSxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiB0b29sSW5wdXQsXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBzZXJ2ZXJEaXNwbGF5Py5pbnZvY2F0aW9uTWVzc2FnZSA/PyBgQ2FsbGluZyAke3Rvb2xOYW1lfWAsXG5cdFx0XHRcdHRvb2xJbnB1dCxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9LFxuXHRcdFx0Li4uKG91dHB1dCA/IFt7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IG91dHB1dCB9XSxcblx0XHRcdH0gc2F0aXNmaWVzIFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uXSA6IFtdKSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29sbGFiQWdlbnRUb29sQ2FsbCcpIHtcblx0XHRjb25zdCB0b29sQ2FsbElkID0gZ2VuZXJhdGVVdWlkKCk7XG5cdFx0Y29uc3QgbGFiZWxzID0gY29sbGFiQWdlbnRUb29sTGFiZWxzKHBhcmFtcy5pdGVtLnRvb2wpO1xuXHRcdGNvbnN0IHRvb2xOYW1lID0gYGNvZGV4LiR7cGFyYW1zLml0ZW0udG9vbH1gO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0b3V0cHV0OiAnJyxcblx0XHR9KTtcblx0XHQvLyBgc3Bhd25BZ2VudGAgb3BlbnMgYSByZWFkLW9ubHkgY2hpbGQgY29udmVyc2F0aW9uIGZvciB0aGUgY2hpbGQgdGhyZWFkXG5cdFx0Ly8gKHRoZSBob3N0IGF0dGFjaGVzIHRoZSBzdWJhZ2VudC1kaXNjb3ZlcnkgYmxvY2sgdG8gVEhJUyB0b29sIGNhbGwgb25cblx0XHQvLyBgc3ViYWdlbnRfc3RhcnRlZGApLCBzbyB3ZSBkZWxpYmVyYXRlbHkgZG8gTk9UIGR1bXAgdGhlIHJhdyBwcm9tcHRcblx0XHQvLyBpbnRvIHRoZSB0b29sIGJveCBcdTIwMTQgaXQgd291bGQgZHVwbGljYXRlIHRoZSBjaGlsZCBjb252ZXJzYXRpb24ncyBmaXJzdFxuXHRcdC8vIHVzZXIgbWVzc2FnZSBhbmQgYmxvdyBvdXQgdGhlIHRvb2wtY2FsbCB3aWR0aC4gVGhlIG90aGVyIGNvbGxhYiB0b29sc1xuXHRcdC8vIChgc2VuZElucHV0YCwgYHdhaXRgLCBgY2xvc2VBZ2VudGAsIFx1MjAyNikgYXJlIGxpZmVjeWNsZSBvcHMgd2l0aCBubyBjaGlsZFxuXHRcdC8vIGNvbnZlcnNhdGlvbiwgc28gdGhleSBrZWVwIGEgY29tcGFjdCBwcm9tcHQvbW9kZWwgc3VtbWFyeS5cblx0XHRpZiAocGFyYW1zLml0ZW0udG9vbCA9PT0gJ3NwYXduQWdlbnQnKSB7XG5cdFx0XHRyZXR1cm4gW1xuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogbGFiZWxzLmRpc3BsYXlOYW1lLFxuXHRcdFx0XHR9LFxuXHRcdFx0XHR7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQ6IHBhcmFtcy50dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogbGFiZWxzLnByZXNlbnQsXG5cdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdH0sXG5cdFx0XHRdO1xuXHRcdH1cblx0XHRjb25zdCBpbnB1dFBhcnRzOiBzdHJpbmdbXSA9IFtdO1xuXHRcdGlmIChwYXJhbXMuaXRlbS5wcm9tcHQpIHtcblx0XHRcdGlucHV0UGFydHMucHVzaChwYXJhbXMuaXRlbS5wcm9tcHQpO1xuXHRcdH1cblx0XHRpZiAocGFyYW1zLml0ZW0ubW9kZWwpIHtcblx0XHRcdGlucHV0UGFydHMucHVzaChgTW9kZWw6ICR7cGFyYW1zLml0ZW0ubW9kZWx9YCk7XG5cdFx0fVxuXHRcdGNvbnN0IHRvb2xJbnB1dCA9IGlucHV0UGFydHMuam9pbignXFxuXFxuJyk7XG5cdFx0cmV0dXJuIFtcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxTdGFydCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHR0b29sTmFtZSxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxhYmVscy5kaXNwbGF5TmFtZSxcblx0XHRcdH0sXG5cdFx0XHQuLi4odG9vbElucHV0ID8gW3tcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0XHRjb250ZW50OiB0b29sSW5wdXQsXG5cdFx0XHR9IHNhdGlzZmllcyBTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbl0gOiBbXSksXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxhYmVscy5wcmVzZW50LFxuXHRcdFx0XHR0b29sSW5wdXQsXG5cdFx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdFx0fSxcblx0XHRdO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29udGV4dENvbXBhY3Rpb24nKSB7XG5cdFx0Y29uc3QgdG9vbENhbGxJZCA9IGdlbmVyYXRlVXVpZCgpO1xuXHRcdGNvbnN0IGxhYmVscyA9IGNvZGV4Q29tcGFjdGlvbkxhYmVscygpO1xuXHRcdHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLnNldChwYXJhbXMuaXRlbS5pZCwge1xuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdHRvb2xOYW1lOiAnY29tcGFjdCcsXG5cdFx0XHRvdXRwdXQ6ICcnLFxuXHRcdH0pO1xuXHRcdHJldHVybiBbXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0dG9vbE5hbWU6ICdjb21wYWN0Jyxcblx0XHRcdFx0ZGlzcGxheU5hbWU6IGxhYmVscy5kaXNwbGF5TmFtZSxcblx0XHRcdH0sXG5cdFx0XHR7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsUmVhZHksXG5cdFx0XHRcdHR1cm5JZDogcGFyYW1zLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGxhYmVscy5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0cmV0dXJuIFtdO1xufVxuXG4vKipcbiAqIFN0YXJ0cyB0aGUgZmlsZS1lZGl0IHRvb2wgY2FsbCBvbiB0aGUgZmlyc3Qgc3RydWN0dXJlZCBwYXRjaCBzbmFwc2hvdC4gQ29kZXhcbiAqIGVtaXRzIGBmaWxlQ2hhbmdlL3BhdGNoVXBkYXRlZGAgd2hpbGUgdG9vbCBhcmd1bWVudHMgYXJlIHN0aWxsIHN0cmVhbWluZyxcbiAqIGJlZm9yZSB0aGUgbm9ybWFsIGBpdGVtL3N0YXJ0ZWRgOyB0aGUgbGF0ZXIgc3RhcnQgbm90aWZpY2F0aW9uIHRoZXJlZm9yZVxuICogYmVjb21lcyBhbiBpZGVtcG90ZW50IG5vLW9wLlxuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwRmlsZUNoYW5nZVN0YXJ0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHR1cm5JZDogc3RyaW5nLFxuXHRpdGVtSWQ6IHN0cmluZyxcblx0Y2hhbmdlczogcmVhZG9ubHkgRmlsZVVwZGF0ZUNoYW5nZVtdLFxuKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0aWYgKHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmhhcyhpdGVtSWQpKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHRvb2xDYWxsSWQgPSBnZW5lcmF0ZVV1aWQoKTtcblx0Y29uc3Qgb3V0cHV0ID0gZmlsZUNoYW5nZU91dHB1dChjaGFuZ2VzKTtcblx0c3RhdGUuaXRlbVRvVG9vbENhbGwuc2V0KGl0ZW1JZCwge1xuXHRcdHRvb2xDYWxsSWQsXG5cdFx0dHVybklkLFxuXHRcdHRvb2xOYW1lOiAnZmlsZV9lZGl0Jyxcblx0XHRvdXRwdXQsXG5cdH0pO1xuXHRjb25zdCBzdW1tYXJ5ID0gZGVzY3JpYmVGaWxlQ2hhbmdlKGNoYW5nZXMpIHx8ICdBcHBseSBmaWxlIGNoYW5nZXMnO1xuXHRyZXR1cm4gW1xuXHRcdHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0dG9vbE5hbWU6ICdmaWxlX2VkaXQnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdBcHBseSBmaWxlIGNoYW5nZXMnLFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRjb250ZW50OiBzdW1tYXJ5LFxuXHRcdH0sXG5cdFx0e1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdHR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3VtbWFyeSxcblx0XHRcdHRvb2xJbnB1dDogc3VtbWFyeSxcblx0XHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdH0sXG5cdFx0Li4uKG91dHB1dCA/IFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGNvbnRlbnQ6IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiBvdXRwdXQgfV0sXG5cdFx0fSBzYXRpc2ZpZXMgU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb25dIDogW10pLFxuXHRdO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWFwQ29tbWFuZEV4ZWN1dGlvbk91dHB1dERlbHRhKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IENvbW1hbmRFeGVjdXRpb25PdXRwdXREZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IGVudHJ5ID0gc3RhdGUuaXRlbVRvVG9vbENhbGwuZ2V0KHBhcmFtcy5pdGVtSWQpO1xuXHRpZiAoIWVudHJ5KSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGVudHJ5Lm91dHB1dCArPSBwYXJhbXMuZGVsdGE7XG5cdHJldHVybiBbe1xuXHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsXG5cdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRjb250ZW50OiBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogZW50cnkub3V0cHV0IH1dLFxuXHR9XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEZpbGVDaGFuZ2VQYXRjaFVwZGF0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogRmlsZUNoYW5nZVBhdGNoVXBkYXRlZE5vdGlmaWNhdGlvbixcblx0ZmlsZUVkaXRzOiByZWFkb25seSBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50W10gPSBbXSxcblx0cHJldmlld1VuYXZhaWxhYmxlPzogc3RyaW5nLFxuKTogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIHtcblx0Y29uc3QgZW50cnkgPSBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5nZXQocGFyYW1zLml0ZW1JZCk7XG5cdGlmICghZW50cnkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0ZW50cnkub3V0cHV0ID0gZmlsZUNoYW5nZU91dHB1dChwYXJhbXMuY2hhbmdlcyk7XG5cdGNvbnN0IHVuYXZhaWxhYmxlVGV4dCA9IHByZXZpZXdVbmF2YWlsYWJsZT8udHJpbSgpO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogW1xuXHRcdFx0Li4uKGVudHJ5Lm91dHB1dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IGFzIGNvbnN0LCB0ZXh0OiBlbnRyeS5vdXRwdXQgfV0gOiBbXSksXG5cdFx0XHQuLi4odW5hdmFpbGFibGVUZXh0ID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQgYXMgY29uc3QsIHRleHQ6IHVuYXZhaWxhYmxlVGV4dCB9XSA6IFtdKSxcblx0XHRcdC4uLmZpbGVFZGl0cyxcblx0XHRdLFxuXHR9XTtcbn1cblxuLyoqIE1hcHMgY3VtdWxhdGl2ZSB0dXJuIGRpZmZzLCBpbmNsdWRpbmcgc2hlbGwtd3JpdHRlbiBmaWxlcywgaW50byBsaXZlIGZpbGUgZWRpdHMuICovXG5leHBvcnQgZnVuY3Rpb24gbWFwVHVybkRpZmZVcGRhdGVkKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0dG9vbENhbGxJZDogc3RyaW5nLFxuXHRmaWxlRWRpdHM6IHJlYWRvbmx5IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSxcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGlmIChmaWxlRWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IGlzTmV3ID0gc3RhdGUudHVybkRpZmZUb29sQ2FsbD8udHVybklkICE9PSB0dXJuSWQ7XG5cdHN0YXRlLnR1cm5EaWZmVG9vbENhbGwgPSB7IHR1cm5JZCwgdG9vbENhbGxJZCwgY29udGVudDogZmlsZUVkaXRzIH07XG5cdHJldHVybiBbXG5cdFx0Li4uKGlzTmV3ID8gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0dG9vbE5hbWU6ICd0dXJuX2RpZmYnLFxuXHRcdFx0ZGlzcGxheU5hbWU6ICdXcml0aW5nIGZpbGVzJyxcblx0XHR9LCB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFJlYWR5LFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGludm9jYXRpb25NZXNzYWdlOiAnV3JpdGluZyBmaWxlcycsXG5cdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHR9XSBzYXRpc2ZpZXMgKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdIDogW10pLFxuXHRcdHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29udGVudENoYW5nZWQsXG5cdFx0XHR0dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkLFxuXHRcdFx0Y29udGVudDogWy4uLmZpbGVFZGl0c10sXG5cdFx0fSxcblx0XTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1hcEZpbGVDaGFuZ2VPdXRwdXREZWx0YShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBGaWxlQ2hhbmdlT3V0cHV0RGVsdGFOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChwYXJhbXMuaXRlbUlkKTtcblx0aWYgKCFlbnRyeSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRlbnRyeS5vdXRwdXQgKz0gcGFyYW1zLmRlbHRhO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGVudHJ5Lm91dHB1dCB9XSxcblx0fV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBNY3BUb29sQ2FsbFByb2dyZXNzKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IE1jcFRvb2xDYWxsUHJvZ3Jlc3NOb3RpZmljYXRpb24sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChwYXJhbXMuaXRlbUlkKTtcblx0aWYgKCFlbnRyeSkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRlbnRyeS5vdXRwdXQgPSBbZW50cnkub3V0cHV0LCBwYXJhbXMubWVzc2FnZV0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJ1xcbicpO1xuXHRyZXR1cm4gW3tcblx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbnRlbnRDaGFuZ2VkLFxuXHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0Y29udGVudDogW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGVudHJ5Lm91dHB1dCB9XSxcblx0fV07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtYXBBZ2VudE1lc3NhZ2VEZWx0YShcblx0c3RhdGU6IElDb2RleFNlc3Npb25NYXBTdGF0ZSxcblx0cGFyYW1zOiBBZ2VudE1lc3NhZ2VEZWx0YU5vdGlmaWNhdGlvbixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdGNvbnN0IHBhcnRJZCA9IHN0YXRlLml0ZW1Ub1BhcnRJZC5nZXQocGFyYW1zLml0ZW1JZCk7XG5cdGlmICghcGFydElkKSB7XG5cdFx0Ly8gR290IGEgZGVsdGEgYmVmb3JlIHdlIHNhdyB0aGUgY29ycmVzcG9uZGluZyBgaXRlbS9zdGFydGVkYC5cblx0XHQvLyBEcm9wIGl0IFx1MjAxNCBQaGFzZSAyIGlzIGJlc3QtZWZmb3J0IGFuZCB0aGUgbG9zdCB0ZXh0IGlzIHJlcGxhY2VkXG5cdFx0Ly8gd2hlbiBgaXRlbS9jb21wbGV0ZWRgIGFycml2ZXMgd2l0aCB0aGUgZnVsbCBgdGV4dGAgZmllbGQuXG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdHJldHVybiBkZWZlclJlc3BvbnNlV2hpbGVUb29sQ2FsbElzT3BlbihzdGF0ZSwgW1xuXHRcdHtcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLFxuXHRcdFx0dHVybklkOiBwYXJhbXMudHVybklkLFxuXHRcdFx0cGFydElkLFxuXHRcdFx0Y29udGVudDogcGFyYW1zLmRlbHRhLFxuXHRcdH0sXG5cdF0pO1xufVxuXG4vKipcbiAqIGBpdGVtL2NvbXBsZXRlZGAgZm9yIGFuIGBhZ2VudE1lc3NhZ2VgIFx1MjAxNCB0aGUgcGFydCBpcyBmaW5hbGl6ZWQgc2VydmVyXG4gKiBzaWRlLiBGb3IgUGhhc2UgMiB3ZSBkb24ndCBuZWVkIHRvIGVtaXQgYW4gZXh0cmEgYWN0aW9uOiB0aGUgZGVsdGFzXG4gKiBhbHJlYWR5IHVwZGF0ZWQgdGhlIHBhcnQncyBjb250ZW50LiBXZSBqdXN0IGRyb3AgdGhlIG1hcHBpbmcgc28gdGhlXG4gKiBtZW1vcnkgcHJlc3N1cmUgc3RheXMgYm91bmRlZC5cbiAqXG4gKiBGb3IgYGNvbW1hbmRFeGVjdXRpb25gLCBlbWl0IGEgc3ludGhldGljIGBDaGF0VG9vbENhbGxSZWFkeWBcbiAqIChhdXRvLWNvbmZpcm1lZDsgdGhlIGNvZGV4IHNlcnZlciBhbHJlYWR5IGRlY2lkZWQgdG8gcnVuIHRoZSBjb21tYW5kXG4gKiBcdTIwMTQgYW55IGhvc3Qtc2lkZSBhcHByb3ZhbCB3YXMgc2V0dGxlZCB2aWEgdGhlIGByZXF1ZXN0QXBwcm92YWxgXG4gKiBzZXJ2ZXItcmVxdWVzdCBoYW5kbGVyIGJlZm9yZSB3ZSBnb3QgaGVyZSkgZm9sbG93ZWQgYnkgYVxuICogYENoYXRUb29sQ2FsbENvbXBsZXRlYCBjYXJyeWluZyB0aGUgYWdncmVnYXRlZCBvdXRwdXQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBJdGVtQ29tcGxldGVkKFxuXHRzdGF0ZTogSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLFxuXHRwYXJhbXM6IEl0ZW1Db21wbGV0ZWROb3RpZmljYXRpb24sXG5cdGZpbGVFZGl0czogcmVhZG9ubHkgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdID0gW10sXG4pOiAoU2Vzc2lvbkFjdGlvbiB8IENoYXRBY3Rpb24pW10ge1xuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2FnZW50TWVzc2FnZScpIHtcblx0XHRzdGF0ZS5pdGVtVG9QYXJ0SWQuZGVsZXRlKHBhcmFtcy5pdGVtLmlkKTtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdyZWFzb25pbmcnKSB7XG5cdFx0Y2xlYXJSZWFzb25pbmdGb3JJdGVtKHN0YXRlLCBwYXJhbXMuaXRlbS5pZCk7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdC8vIEV2ZXJ5IHJlbWFpbmluZyBpdGVtIHR5cGUgaXMgYSB0b29sIGNhbGwuIFJlc29sdmUgdGhlIHRyYWNrZWQgZW50cnkgYW5kXG5cdC8vIGRyYWluIHRoZSBob3N0LWRlY2xpbmUgZmxhZyBoZXJlLCBvbmNlLCBzbyBhbGwgY29tcGxldGlvbiBwYXRocyB0cmVhdCBhXG5cdC8vIGRlY2xpbmVkIHRvb2wgdW5pZm9ybWx5IChyZXBvcnRlZCBhcyBgdXNlckNhbmNlbGxlZGAgdmlhXG5cdC8vIGBlcnJvci5jb2RlID0gJ2RlbmllZCdgKSBpbnN0ZWFkIG9mIGRlcGVuZGluZyBvbiB3aGljaCB0b29sIHR5cGUgY29tcGxldGVkLlxuXHRjb25zdCBlbnRyeSA9IHN0YXRlLml0ZW1Ub1Rvb2xDYWxsLmdldChwYXJhbXMuaXRlbS5pZCk7XG5cdGlmICghZW50cnkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0c3RhdGUuaXRlbVRvVG9vbENhbGwuZGVsZXRlKHBhcmFtcy5pdGVtLmlkKTtcblx0Y29uc3QgZGVjbGluZWQgPSBzdGF0ZS5kZWNsaW5lZFRvb2xDYWxscy5kZWxldGUoZW50cnkudG9vbENhbGxJZCk7XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29udGV4dENvbXBhY3Rpb24nKSB7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGNvZGV4Q29tcGFjdGlvbkxhYmVscygpLnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHR9LFxuXHRcdH1dO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29tbWFuZEV4ZWN1dGlvbicpIHtcblx0XHRjb25zdCBzdWNjZXNzID0gcGFyYW1zLml0ZW0uc3RhdHVzID09PSAnY29tcGxldGVkJyAmJiAocGFyYW1zLml0ZW0uZXhpdENvZGUgPT09IDAgfHwgcGFyYW1zLml0ZW0uZXhpdENvZGUgPT09IG51bGwpO1xuXHRcdGNvbnN0IG91dHB1dCA9IHBhcmFtcy5pdGVtLmFnZ3JlZ2F0ZWRPdXRwdXQgPz8gZW50cnkub3V0cHV0O1xuXHRcdGNvbnN0IGNvbW1hbmQgPSB1bndyYXBTaGVsbEludm9jYXRpb24ocGFyYW1zLml0ZW0uY29tbWFuZCA/PyAnJyk7XG5cdFx0Y29uc3QgZXhpdCA9IHBhcmFtcy5pdGVtLmV4aXRDb2RlO1xuXHRcdGNvbnN0IHBhc3RUZW5zZSA9IHN1Y2Nlc3Ncblx0XHRcdD8gYFJhbiBcXGAke2NvbW1hbmR9XFxgYFxuXHRcdFx0OiBleGl0ICE9PSBudWxsXG5cdFx0XHRcdD8gYFJhbiBcXGAke2NvbW1hbmR9XFxgIChleGl0ICR7ZXhpdH0pYFxuXHRcdFx0XHQ6IGBSYW4gXFxgJHtjb21tYW5kfVxcYCAoZmFpbGVkKWA7XG5cdFx0Y29uc3QgY29tcGxldGlvbjogKFNlc3Npb25BY3Rpb24gfCBDaGF0QWN0aW9uKVtdID0gW1xuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdFx0c3VjY2Vzcyxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBwYXN0VGVuc2UsXG5cdFx0XHRcdFx0Y29udGVudDogb3V0cHV0IHx8IGZpbGVFZGl0cy5sZW5ndGggPiAwXG5cdFx0XHRcdFx0XHQ/IFtcblx0XHRcdFx0XHRcdFx0Li4uKG91dHB1dCA/IFt7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0IGFzIGNvbnN0LCB0ZXh0OiBvdXRwdXQgfV0gOiBbXSksXG5cdFx0XHRcdFx0XHRcdC4uLmZpbGVFZGl0cyxcblx0XHRcdFx0XHRcdF1cblx0XHRcdFx0XHRcdDogdW5kZWZpbmVkLFxuXHRcdFx0XHRcdGVycm9yOiBzdWNjZXNzID8gdW5kZWZpbmVkIDoge1xuXHRcdFx0XHRcdFx0bWVzc2FnZTogZXhpdCAhPT0gbnVsbCA/IGBFeGl0IGNvZGUgJHtleGl0fWAgOiAnQ29tbWFuZCBmYWlsZWQnLFxuXHRcdFx0XHRcdFx0Li4uKGRlY2xpbmVkID8geyBjb2RlOiAnZGVuaWVkJyB9IDoge30pLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdF07XG5cdFx0Ly8gQSBzdWNjZXNzZnVsIGNvbW1hbmQgdGhhdCBwcm9kdWNlZCBOTyBvdXRwdXQgbWF5IGJlIGEgc2FuZGJveFxuXHRcdC8vIHByZS1mbGlnaHQgdGhhdCBDb2RleCB3aWxsIGltbWVkaWF0ZWx5IHJlLXJ1biB1bmRlciBhbiBhcHByb3ZhbCBwcm9tcHRcblx0XHQvLyAoc2FtZSBjb21tYW5kLCBuZXcgaXRlbSkuIERlZmVyIGl0cyBjb21wbGV0aW9uIHNvIHRoZSByZS1ydW4gY2FuIHJldXNlXG5cdFx0Ly8gdGhpcyBib3g7IGlmIG5vIHJlLXJ1biBhcnJpdmVzLCBpdCBpcyBmbHVzaGVkIG9uIHRoZSBuZXh0IGl0ZW0gb3IgYXRcblx0XHQvLyB0dXJuIGVuZCAoc2VlIG1hcEl0ZW1TdGFydGVkIC8gbWFwVHVybkNvbXBsZXRlZCkuXG5cdFx0aWYgKHN1Y2Nlc3MgJiYgIW91dHB1dCAmJiBmaWxlRWRpdHMubGVuZ3RoID09PSAwICYmICFkZWNsaW5lZCkge1xuXHRcdFx0Y29uc3QgZmx1c2hlZCA9IGZsdXNoUGVuZGluZ1ByZWZsaWdodChzdGF0ZSk7XG5cdFx0XHRzdGF0ZS5wZW5kaW5nUHJlZmxpZ2h0ID0geyB0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLCB0dXJuSWQ6IGVudHJ5LnR1cm5JZCwgY29tbWFuZCwgY29tcGxldGlvbiB9O1xuXHRcdFx0cmV0dXJuIFsuLi5mbHVzaGVkLCAuLi5mbHVzaERlZmVycmVkUmVzcG9uc2VBY3Rpb25zKHN0YXRlKV07XG5cdFx0fVxuXHRcdHJldHVybiBbLi4uZmx1c2hQZW5kaW5nUHJlZmxpZ2h0KHN0YXRlKSwgLi4uY29tcGxldGlvbiwgLi4uZmx1c2hEZWZlcnJlZFJlc3BvbnNlQWN0aW9ucyhzdGF0ZSldO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnd2ViU2VhcmNoJykge1xuXHRcdGNvbnN0IHF1ZXJ5ID0gZGVzY3JpYmVXZWJTZWFyY2gocGFyYW1zLml0ZW0ucXVlcnksIHBhcmFtcy5pdGVtLmFjdGlvbik7XG5cdFx0cmV0dXJuIFt7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlLFxuXHRcdFx0dHVybklkOiBlbnRyeS50dXJuSWQsXG5cdFx0XHR0b29sQ2FsbElkOiBlbnRyeS50b29sQ2FsbElkLFxuXHRcdFx0cmVzdWx0OiB7XG5cdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHdlYlNlYXJjaFBhc3RUZW5zZU1lc3NhZ2UocXVlcnkpLFxuXHRcdFx0fSxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2ltYWdlR2VuZXJhdGlvbicpIHtcblx0XHRjb25zdCBzdWNjZXNzID0gcGFyYW1zLml0ZW0uc3RhdHVzID09PSAnY29tcGxldGVkJyAmJiBwYXJhbXMuaXRlbS5yZXN1bHQubGVuZ3RoID4gMDtcblx0XHRjb25zdCBsYWJlbHMgPSBjb2RleEltYWdlR2VuZXJhdGlvbkxhYmVscyhwYXJhbXMuaXRlbS5zdGF0dXMpO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdWNjZXNzLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBzdWNjZXNzID8gbGFiZWxzLnBhc3RUZW5zZU1lc3NhZ2UgOiBsYWJlbHMuZmFpbGVkTWVzc2FnZSxcblx0XHRcdFx0Y29udGVudDogc3VjY2VzcyA/IFt7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdFx0ZGF0YTogcGFyYW1zLml0ZW0ucmVzdWx0LFxuXHRcdFx0XHRcdGNvbnRlbnRUeXBlOiAnaW1hZ2UvcG5nJyxcblx0XHRcdFx0fV0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdC4uLihzdWNjZXNzID8ge30gOiB7IGVycm9yOiB7IG1lc3NhZ2U6IGxhYmVscy5lcnJvck1lc3NhZ2UgfSB9KSxcblx0XHRcdH0sXG5cdFx0fV07XG5cdH1cblx0aWYgKHBhcmFtcy5pdGVtLnR5cGUgPT09ICdmaWxlQ2hhbmdlJykge1xuXHRcdGNvbnN0IG91dHB1dCA9IGZpbGVDaGFuZ2VPdXRwdXQocGFyYW1zLml0ZW0uY2hhbmdlcykgfHwgZW50cnkub3V0cHV0O1xuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBwYXJhbXMuaXRlbS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBkZXNjcmliZUZpbGVDaGFuZ2UocGFyYW1zLml0ZW0uY2hhbmdlcykgfHwgJ0FwcGx5IGZpbGUgY2hhbmdlcyc7XG5cdFx0Y29uc3QgY29udGVudCA9IFtcblx0XHRcdC4uLihvdXRwdXQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCBhcyBjb25zdCwgdGV4dDogb3V0cHV0IH1dIDogW10pLFxuXHRcdFx0Li4uZmlsZUVkaXRzLFxuXHRcdF07XG5cdFx0Y29uc3QgcmVzdWx0ID0ge1xuXHRcdFx0c3VjY2Vzcyxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHN1Y2Nlc3MgPyBzdW1tYXJ5IDogJ0ZhaWxlZCB0byBhcHBseSBmaWxlIGNoYW5nZXMnLFxuXHRcdFx0Y29udGVudDogY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdC4uLihzdWNjZXNzID8ge30gOiB7IGVycm9yOiB7IG1lc3NhZ2U6IGBQYXRjaCAke3BhcmFtcy5pdGVtLnN0YXR1c31gLCAuLi4oZGVjbGluZWQgPyB7IGNvZGU6ICdkZW5pZWQnIH0gOiB7fSkgfSB9KSxcblx0XHR9O1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdCxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ21jcFRvb2xDYWxsJykge1xuXHRcdGNvbnN0IHN1Y2Nlc3MgPSBwYXJhbXMuaXRlbS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnICYmICFwYXJhbXMuaXRlbS5lcnJvcjtcblx0XHRjb25zdCBvdXRwdXQgPSBtY3BUb29sT3V0cHV0KHBhcmFtcy5pdGVtLnJlc3VsdCwgcGFyYW1zLml0ZW0uZXJyb3I/Lm1lc3NhZ2UpIHx8IGVudHJ5Lm91dHB1dDtcblx0XHRjb25zdCBjb250ZW50ID0gb3V0cHV0ID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQgYXMgY29uc3QsIHRleHQ6IG91dHB1dCB9XSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2Vzcyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc3VjY2VzcyA/IGBDYWxsZWQgJHtlbnRyeS50b29sTmFtZX1gIDogYEZhaWxlZCB0byBjYWxsICR7ZW50cnkudG9vbE5hbWV9YCxcblx0XHRcdFx0Y29udGVudCxcblx0XHRcdFx0Li4uKHN1Y2Nlc3MgPyB7fSA6IHsgZXJyb3I6IHsgbWVzc2FnZTogcGFyYW1zLml0ZW0uZXJyb3I/Lm1lc3NhZ2UgPz8gYE1DUCB0b29sICR7cGFyYW1zLml0ZW0uc3RhdHVzfWAsIC4uLihkZWNsaW5lZCA/IHsgY29kZTogJ2RlbmllZCcgfSA6IHt9KSB9IH0pLFxuXHRcdFx0fSxcblx0XHR9XTtcblx0fVxuXHRpZiAocGFyYW1zLml0ZW0udHlwZSA9PT0gJ2R5bmFtaWNUb29sQ2FsbCcpIHtcblx0XHRjb25zdCBzdWNjZXNzID0gcGFyYW1zLml0ZW0uc3VjY2VzcyA9PT0gdHJ1ZSB8fCBwYXJhbXMuaXRlbS5zdGF0dXMgPT09ICdjb21wbGV0ZWQnO1xuXHRcdGNvbnN0IG91dHB1dCA9IGR5bmFtaWNUb29sT3V0cHV0KHBhcmFtcy5pdGVtLmNvbnRlbnRJdGVtcykgfHwgZW50cnkub3V0cHV0O1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBbXG5cdFx0XHQuLi4ob3V0cHV0ID8gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQgYXMgY29uc3QsIHRleHQ6IG91dHB1dCB9XSA6IFtdKSxcblx0XHRcdC4uLmZpbGVFZGl0cyxcblx0XHRdO1xuXHRcdGNvbnN0IHNlcnZlckRpc3BsYXkgPSBzdWNjZXNzID8gKGdldFNlcnZlclRvb2xEaXNwbGF5KGVudHJ5LnRvb2xOYW1lLCBwYXJhbXMuaXRlbS5hcmd1bWVudHMsIHsgdGV4dDogb3V0cHV0LCBzdWNjZXNzIH0pID8/IGdldFdyaXRlRmlsZVRvb2xEaXNwbGF5KGVudHJ5LnRvb2xOYW1lLCBwYXJhbXMuaXRlbS5hcmd1bWVudHMsIHsgdGV4dDogb3V0cHV0LCBzdWNjZXNzIH0pKSA6IHVuZGVmaW5lZDtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsQ29tcGxldGUsXG5cdFx0XHR0dXJuSWQ6IGVudHJ5LnR1cm5JZCxcblx0XHRcdHRvb2xDYWxsSWQ6IGVudHJ5LnRvb2xDYWxsSWQsXG5cdFx0XHRyZXN1bHQ6IHtcblx0XHRcdFx0c3VjY2Vzcyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogc2VydmVyRGlzcGxheT8ucGFzdFRlbnNlTWVzc2FnZSA/PyBzZXJ2ZXJEaXNwbGF5Py5pbnZvY2F0aW9uTWVzc2FnZSA/PyAoc3VjY2VzcyA/IGBDYWxsZWQgJHtlbnRyeS50b29sTmFtZX1gIDogYEZhaWxlZCB0byBjYWxsICR7ZW50cnkudG9vbE5hbWV9YCksXG5cdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnQubGVuZ3RoID4gMCA/IGNvbnRlbnQgOiB1bmRlZmluZWQsXG5cdFx0XHRcdC4uLihzdWNjZXNzID8ge30gOiB7IGVycm9yOiB7IG1lc3NhZ2U6IGBEeW5hbWljIHRvb2wgJHtwYXJhbXMuaXRlbS5zdGF0dXN9YCwgLi4uKGRlY2xpbmVkID8geyBjb2RlOiAnZGVuaWVkJyB9IDoge30pIH0gfSksXG5cdFx0XHR9LFxuXHRcdH1dO1xuXHR9XG5cdGlmIChwYXJhbXMuaXRlbS50eXBlID09PSAnY29sbGFiQWdlbnRUb29sQ2FsbCcpIHtcblx0XHRjb25zdCBsYWJlbHMgPSBjb2xsYWJBZ2VudFRvb2xMYWJlbHMocGFyYW1zLml0ZW0udG9vbCk7XG5cdFx0Y29uc3Qgc3VjY2VzcyA9IHBhcmFtcy5pdGVtLnN0YXR1cyA9PT0gJ2NvbXBsZXRlZCc7XG5cdFx0Y29uc3Qgb3V0cHV0ID0gY29sbGFiQWdlbnRSZXN1bHRPdXRwdXQocGFyYW1zLml0ZW0ucmVjZWl2ZXJUaHJlYWRJZHMsIHBhcmFtcy5pdGVtLmFnZW50c1N0YXRlcykgfHwgZW50cnkub3V0cHV0O1xuXHRcdGNvbnN0IGNvbnRlbnQgPSBvdXRwdXQgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCBhcyBjb25zdCwgdGV4dDogb3V0cHV0IH1dIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBbe1xuXHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdHR1cm5JZDogZW50cnkudHVybklkLFxuXHRcdFx0dG9vbENhbGxJZDogZW50cnkudG9vbENhbGxJZCxcblx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRzdWNjZXNzLFxuXHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBzdWNjZXNzID8gbGFiZWxzLnBhc3QgOiBgJHtsYWJlbHMuZGlzcGxheU5hbWV9IGZhaWxlZGAsXG5cdFx0XHRcdGNvbnRlbnQsXG5cdFx0XHRcdC4uLihzdWNjZXNzID8ge30gOiB7IGVycm9yOiB7IG1lc3NhZ2U6IGBDb2xsYWIgYWdlbnQgJHtwYXJhbXMuaXRlbS5zdGF0dXN9YCwgLi4uKGRlY2xpbmVkID8geyBjb2RlOiAnZGVuaWVkJyB9IDoge30pIH0gfSksXG5cdFx0XHR9LFxuXHRcdH1dO1xuXHR9XG5cdHJldHVybiBbXTtcbn1cblxuLyoqXG4gKiBgdHVybi9jb21wbGV0ZWRgIHRyYW5zbGF0ZXMgdG8gZWl0aGVyIGEgbm9ybWFsIGNvbXBsZXRlIHNpZ25hbCBvciwgd2hlblxuICogdGhlIHR1cm4gZW5kZWQgd2l0aCBgc3RhdHVzOiAnZmFpbGVkJ2AsIGFuIGVycm9yIGZvbGxvd2VkIGJ5IHRoZVxuICogY29tcGxldGUgc2lnbmFsIHNvIGNvbnN1bWVycyBjYW4gcmVhY3QgdG8gYm90aC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcFR1cm5Db21wbGV0ZWQoXG5cdHN0YXRlOiBJQ29kZXhTZXNzaW9uTWFwU3RhdGUsXG5cdHBhcmFtczogVHVybkNvbXBsZXRlZE5vdGlmaWNhdGlvbixcblx0ZmFsbGJhY2tEdXJhdGlvbj86IG51bWJlcixcbik6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSB7XG5cdHN0YXRlLmN1cnJlbnRUdXJuSWQgPSB1bmRlZmluZWQ7XG5cdHN0YXRlLml0ZW1Ub1BhcnRJZC5jbGVhcigpO1xuXHRzdGF0ZS5pdGVtVG9SZWFzb25pbmdQYXJ0SWQuY2xlYXIoKTtcblx0Ly8gV2hlbiBhIGZ1bGwgdHVybiBpdGVtIHBhZ2UgaXMgYXZhaWxhYmxlIChmb3IgZXhhbXBsZSBkdXJpbmcgcmVwbGF5KSwgdXNlXG5cdC8vIGl0IHRvIHJlY29uY2lsZSB0cmFja2VkIHRvb2xzIGJlZm9yZSBoYW5kbGluZyBnZW51aW5lbHkgdW5yZXNvbHZlZCBjYWxscy5cblx0Ly8gTGl2ZSBub3RpZmljYXRpb25zIG5vcm1hbGx5IHVzZSBgaXRlbXNWaWV3OiAnbm90TG9hZGVkJ2AgYW5kIGVtcHR5IGl0ZW1zLlxuXHRjb25zdCByZWNvdmVyZWRUb29sQ2FsbEFjdGlvbnM6IChTZXNzaW9uQWN0aW9uIHwgQ2hhdEFjdGlvbilbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgcGFyYW1zLnR1cm4uaXRlbXMpIHtcblx0XHRpZiAoaXRlbS50eXBlID09PSAnY29tbWFuZEV4ZWN1dGlvbicgJiYgKGl0ZW0uZXhpdENvZGUgIT09IG51bGwgfHwgaXRlbS5zdGF0dXMgIT09ICdjb21wbGV0ZWQnKSAmJiBzdGF0ZS5pdGVtVG9Ub29sQ2FsbC5oYXMoaXRlbS5pZCkpIHtcblx0XHRcdHJlY292ZXJlZFRvb2xDYWxsQWN0aW9ucy5wdXNoKC4uLm1hcEl0ZW1Db21wbGV0ZWQoc3RhdGUsIHtcblx0XHRcdFx0dGhyZWFkSWQ6IHBhcmFtcy50aHJlYWRJZCxcblx0XHRcdFx0dHVybklkOiBwYXJhbXMudHVybi5pZCxcblx0XHRcdFx0aXRlbSxcblx0XHRcdFx0Y29tcGxldGVkQXRNczogdHlwZW9mIHBhcmFtcy50dXJuLmNvbXBsZXRlZEF0ID09PSAnbnVtYmVyJyA/IHBhcmFtcy50dXJuLmNvbXBsZXRlZEF0ICogMTAwMCA6IDAsXG5cdFx0XHR9KSk7XG5cdFx0fVxuXHR9XG5cdC8vIEZpbmFsaXplIGFueSBjb21tYW5kIHdob3NlIGNvbXBsZXRpb24gd2FzIGRlZmVycmVkIHRvIGNvYWxlc2NlIGEgcG9zc2libGVcblx0Ly8gc2FuZGJveCBwcmUtZmxpZ2h0IChzZWUgSUNvZGV4U2Vzc2lvbk1hcFN0YXRlLnBlbmRpbmdQcmVmbGlnaHQpIFx1MjAxNCBpdCB3YXNcblx0Ly8gbmV2ZXIgcmV1c2VkLCBzbyBpdCBpcyBhIGdlbnVpbmUgb3V0cHV0LWxlc3MgY29tbWFuZCBhbmQgbXVzdCBjb21wbGV0ZS5cblx0Y29uc3QgcHJlZmxpZ2h0Rmx1c2ggPSBmbHVzaFBlbmRpbmdQcmVmbGlnaHQoc3RhdGUpO1xuXHRjb25zdCB0dXJuSWQgPSBwYXJhbXMudHVybi5pZDtcblx0Y29uc3Qgc3RhdHVzID0gcGFyYW1zLnR1cm4uc3RhdHVzO1xuXHRjb25zdCB0dXJuRGlmZkFjdGlvbnMgPSBjb21wbGV0ZVR1cm5EaWZmVG9vbENhbGwoc3RhdGUsIHN0YXR1cyA9PT0gJ2NvbXBsZXRlZCcsIHN0YXR1cyA9PT0gJ2ludGVycnVwdGVkJyA/ICdUdXJuIGludGVycnVwdGVkIHdoaWxlIHVwZGF0aW5nIGZpbGVzJyA6ICdUdXJuIGZhaWxlZCB3aGlsZSB1cGRhdGluZyBmaWxlcycpO1xuXHRjb25zdCBkdXJhdGlvbiA9IHR5cGVvZiBwYXJhbXMudHVybi5kdXJhdGlvbk1zID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUocGFyYW1zLnR1cm4uZHVyYXRpb25NcykgJiYgcGFyYW1zLnR1cm4uZHVyYXRpb25NcyA+PSAwXG5cdFx0PyBwYXJhbXMudHVybi5kdXJhdGlvbk1zXG5cdFx0OiB0eXBlb2YgcGFyYW1zLnR1cm4uc3RhcnRlZEF0ID09PSAnbnVtYmVyJyAmJiB0eXBlb2YgcGFyYW1zLnR1cm4uY29tcGxldGVkQXQgPT09ICdudW1iZXInXG5cdFx0XHQ/IE1hdGgubWF4KDAsIChwYXJhbXMudHVybi5jb21wbGV0ZWRBdCAtIHBhcmFtcy50dXJuLnN0YXJ0ZWRBdCkgKiAxMDAwKVxuXHRcdFx0OiB0eXBlb2YgZmFsbGJhY2tEdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKGZhbGxiYWNrRHVyYXRpb24pXG5cdFx0XHRcdD8gTWF0aC5tYXgoMCwgZmFsbGJhY2tEdXJhdGlvbilcblx0XHRcdFx0OiAwO1xuXHRjb25zdCBvcnBoYW5lZFRvb2xDYWxsQWN0aW9ucyA9IGNvbXBsZXRlT3JwaGFuZWRUb29sQ2FsbHMoc3RhdGUsIHN0YXR1cyA9PT0gJ2ludGVycnVwdGVkJyA/ICdUdXJuIGludGVycnVwdGVkIGJlZm9yZSB0aGUgdG9vbCBjb21wbGV0ZWQnIDogJ1R1cm4gY29tcGxldGVkIGJlZm9yZSB0aGUgdG9vbCByZXBvcnRlZCBjb21wbGV0aW9uJyk7XG5cdGNvbnN0IGRlZmVycmVkUmVzcG9uc2VBY3Rpb25zID0gZmx1c2hEZWZlcnJlZFJlc3BvbnNlQWN0aW9ucyhzdGF0ZSk7XG5cdGlmIChzdGF0dXMgPT09ICdmYWlsZWQnICYmIHBhcmFtcy50dXJuLmVycm9yKSB7XG5cdFx0cmV0dXJuIFtcblx0XHRcdC4uLnJlY292ZXJlZFRvb2xDYWxsQWN0aW9ucyxcblx0XHRcdC4uLnByZWZsaWdodEZsdXNoLFxuXHRcdFx0Li4ub3JwaGFuZWRUb29sQ2FsbEFjdGlvbnMsXG5cdFx0XHQuLi50dXJuRGlmZkFjdGlvbnMsXG5cdFx0XHQuLi5kZWZlcnJlZFJlc3BvbnNlQWN0aW9ucyxcblx0XHRcdHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0RXJyb3IsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHRcdGVycm9yOiBtYXBDb2RleFR1cm5FcnJvcihwYXJhbXMudHVybi5lcnJvciksXG5cdFx0XHR9LFxuXHRcdFx0e1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUdXJuQ29tcGxldGUsXG5cdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0ZHVyYXRpb24sXG5cdFx0XHR9LFxuXHRcdF07XG5cdH1cblx0aWYgKHN0YXR1cyA9PT0gJ2ludGVycnVwdGVkJykge1xuXHRcdHJldHVybiBbLi4ucmVjb3ZlcmVkVG9vbENhbGxBY3Rpb25zLCAuLi5wcmVmbGlnaHRGbHVzaCwgLi4ub3JwaGFuZWRUb29sQ2FsbEFjdGlvbnMsIC4uLnR1cm5EaWZmQWN0aW9ucywgLi4uZGVmZXJyZWRSZXNwb25zZUFjdGlvbnMsIHsgdHlwZTogQWN0aW9uVHlwZS5DaGF0VHVybkNhbmNlbGxlZCwgdHVybklkLCBkdXJhdGlvbiB9XTtcblx0fVxuXHRyZXR1cm4gWy4uLnJlY292ZXJlZFRvb2xDYWxsQWN0aW9ucywgLi4ucHJlZmxpZ2h0Rmx1c2gsIC4uLm9ycGhhbmVkVG9vbENhbGxBY3Rpb25zLCAuLi50dXJuRGlmZkFjdGlvbnMsIC4uLmRlZmVycmVkUmVzcG9uc2VBY3Rpb25zLCB7IHR5cGU6IEFjdGlvblR5cGUuQ2hhdFR1cm5Db21wbGV0ZSwgdHVybklkLCBkdXJhdGlvbiB9XTtcbn1cblxuLyoqIE1hcHMgQ29kZXgncyBwZXJzaXN0ZWQgdHVybiBlcnJvciBpbnRvIHRoZSBzYW1lIHByb3RvY29sIHNoYXBlIHVzZWQgbGl2ZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYXBDb2RleFR1cm5FcnJvcihlcnJvcjogVHVybkVycm9yKTogRXJyb3JJbmZvIHtcblx0cmV0dXJuIHtcblx0XHRlcnJvclR5cGU6ICdDb2RleEVycm9yJyxcblx0XHQuLi5leHRyYWN0Rm9yd2FyZGVkRXJyb3JJbmZvKGVycm9yLm1lc3NhZ2UgfHwgJ0NvZGV4IHR1cm4gZmFpbGVkJyksXG5cdFx0Li4uKGVycm9yLmFkZGl0aW9uYWxEZXRhaWxzID8geyBzdGFjazogZXJyb3IuYWRkaXRpb25hbERldGFpbHMgfSA6IHt9KSxcblx0fTtcbn1cblxuLyoqIE1hcHMgYSBsaXZlIGFwcC1zZXJ2ZXIgZXJyb3Igbm90aWZpY2F0aW9uIGludG8gdmlzaWJsZSByZXRyeSBvciBmYWlsdXJlIFVJLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcEVycm9yTm90aWZpY2F0aW9uKHBhcmFtczogRXJyb3JOb3RpZmljYXRpb24sIHR1cm5JZDogc3RyaW5nLCBkdXJhdGlvbjogbnVtYmVyKTogQ2hhdEFjdGlvbltdIHtcblx0aWYgKHBhcmFtcy53aWxsUmV0cnkpIHtcblx0XHRyZXR1cm4gW3tcblx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEFjdGl2aXR5Q2hhbmdlZCxcblx0XHRcdGFjdGl2aXR5OiBsb2NhbGl6ZSgnY29kZXgucmV0cnlpbmcnLCBcIkNvZGV4IGNvbm5lY3Rpb24gaW50ZXJydXB0ZWQ7IHJldHJ5aW5nLi4uXCIpLFxuXHRcdH1dO1xuXHR9XG5cdHJldHVybiBbXG5cdFx0eyB0eXBlOiBBY3Rpb25UeXBlLkNoYXRBY3Rpdml0eUNoYW5nZWQsIGFjdGl2aXR5OiB1bmRlZmluZWQgfSxcblx0XHR7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRFcnJvcixcblx0XHRcdHR1cm5JZCxcblx0XHRcdGR1cmF0aW9uLFxuXHRcdFx0ZXJyb3I6IG1hcENvZGV4VHVybkVycm9yKHBhcmFtcy5lcnJvciksXG5cdFx0fSxcblx0XTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhIHtAbGluayBUdXJuU3RhdGV9IGZyb20gYSBjb2RleCBgVHVybi5zdGF0dXNgLiBNb3N0bHkgdXNlZnVsXG4gKiBmb3IgcmVwbGF5IChQaGFzZSAzKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHR1cm5TdGF0ZUZyb21TdGF0dXMoc3RhdHVzOiBzdHJpbmcpOiBUdXJuU3RhdGUge1xuXHRzd2l0Y2ggKHN0YXR1cykge1xuXHRcdGNhc2UgJ2NvbXBsZXRlZCc6XG5cdFx0XHRyZXR1cm4gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdGNhc2UgJ2ludGVycnVwdGVkJzpcblx0XHRcdHJldHVybiBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdGNhc2UgJ2ZhaWxlZCc6XG5cdFx0XHRyZXR1cm4gVHVyblN0YXRlLkVycm9yO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHR9XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLG9CQUFvQjtBQUM3QixTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLHNCQUFzQjtBQUMvQixTQUFTLGtCQUF1RDtBQUNoRSxTQUFTLGFBQWEsa0JBQWtCLDRCQUE0Qix5QkFBeUIsdUJBQXVCLGlCQUFpRTtBQUNyTCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLCtCQUErQjtBQUN4QyxTQUFTLDJCQUEyQjtBQUNwQyxTQUFTLG9DQUFvQztBQUM3QyxTQUFTLDRCQUE0QjtBQUNyQyxTQUFTLDZCQUE2QjtBQStIL0IsU0FB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
