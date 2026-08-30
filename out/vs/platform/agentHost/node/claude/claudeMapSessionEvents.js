import { LogLevel } from "../../../log/common/log.js";
import { ActionType } from "../../common/state/sessionActions.js";
import { ResponsePartKind, ToolResultContentType } from "../../common/state/sessionState.js";
import { extractForwardedErrorInfo } from "../shared/proxyChatError.js";
import { buildTopLevelSubagentReadyAction, emitInnerAssistantSignals, mapSubagentSystemMessage, SUBAGENT_SPAWNING_TOOL_NAMES, tagWithParent } from "./claudeSubagentSignals.js";
import { stripClientToolNamePrefix, hasClientToolNamePrefix } from "./clientTools/claudeClientToolMcpServer.js";
import { buildClaudeToolMeta, getClaudePastTenseMessage, getClaudeToolDisplayName, isClaudeFileEditTool } from "./claudeToolDisplay.js";
import { claudeToolDenialCode } from "./claudeToolDenial.js";
import { ClaudeToolCallRegistry } from "./claudeToolCallRegistry.js";
import { ToolCallConfirmationReason, ToolCallContributorKind } from "../../common/state/protocol/state.js";
class ClaudeMapperState {
  constructor() {
    this._activeToolBlocks = /* @__PURE__ */ new Map();
    /**
     * Phase 8.5 — cross-message tool-call attribution + input
     * accumulation + computed start-info, encapsulated as its own
     * collaborator class so it can be unit-tested independently.
     * Public so mapper functions can call its lifecycle methods
     * directly without forwarding through this class.
     */
    this.toolCalls = new ClaudeToolCallRegistry();
    /**
     * Phase 8 — file-edit content pre-staged by
     * `ClaudeAgentSession._observeUserMessage` and consumed by
     * {@link mapUserMessage} when the matching `tool_result` arrives.
     * Keyed by SDK `tool_use_id`. The session's `_processMessages` loop
     * awaits the after-snapshot before invoking the synchronous mapper,
     * so by the time `takeFileEdit` is called the entry is always
     * populated for tracked file-edit tools.
     */
    this._completedFileEdits = /* @__PURE__ */ new Map();
  }
  /**
   * Reset per-message state. Called on `message_start`. Cross-message
   * tool-call tracking is deliberately NOT cleared here — the
   * `tool_result` for a `tool_use` arrives in a later message.
   */
  resetMessage(messageId) {
    this._activeToolBlocks.clear();
    this._currentMessageId = messageId;
  }
  getCurrentMessageId() {
    return this._currentMessageId;
  }
  /**
   * Open a tool block at the given content-block index. Seeds both
   * scopes; the per-message map gets drained on `content_block_stop`,
   * the cross-message maps survive until the matching `tool_result`.
   */
  startToolBlock(index, toolUseId, toolName, turnId, isClientTool = false) {
    this._activeToolBlocks.set(index, { toolUseId, toolName, isClientTool });
    this.toolCalls.begin(toolUseId, toolName, turnId, isClientTool);
  }
  getActiveToolBlock(index) {
    return this._activeToolBlocks.get(index);
  }
  endToolBlock(index) {
    this._activeToolBlocks.delete(index);
  }
  /**
   * Phase 8.5 — forward an `input_json_delta.partial_json` chunk
   * to the registry. Resolves the index → `tool_use_id` mapping
   * locally (the registry is keyed by id, not by index) and is a
   * no-op when the index is unknown.
   */
  appendToolBlockInputDelta(index, partialJson) {
    const tracked = this._activeToolBlocks.get(index);
    if (!tracked) {
      return;
    }
    this.toolCalls.appendInputDelta(tracked.toolUseId, partialJson);
  }
  /**
   * Phase 8.5 — forward the `content_block_stop` signal to the
   * registry, which parses the buffer and stashes the computed
   * start-info.
   */
  finalizeToolBlock(index) {
    const tracked = this._activeToolBlocks.get(index);
    if (!tracked) {
      return;
    }
    this.toolCalls.finalize(tracked.toolUseId);
  }
  /**
   * Cross-message lookup for `tool_result` handling. Returns
   * `undefined` if the `tool_use_id` is unknown (defense-in-depth
   * against transport drift / replay).
   */
  lookupToolCall(toolUseId) {
    const entry = this.toolCalls.lookup(toolUseId);
    return entry ? { turnId: entry.turnId, toolName: entry.toolName, isClientTool: entry.isClientTool } : void 0;
  }
  /** Drain cross-message tracking once a `tool_result` is delivered. */
  completeToolCall(toolUseId) {
    this.toolCalls.complete(toolUseId);
  }
  /**
   * Phase 8 — stash a {@link ToolResultFileEditContent} produced by
   * `ClaudeAgentSession._observeUserMessage` so the synchronous mapper
   * can append it to the matching `ChatToolCallComplete` action.
   */
  cacheFileEdit(toolUseId, content) {
    this._completedFileEdits.set(toolUseId, content);
  }
  /**
   * Phase 8 — consume and remove the cached file edit for this
   * `tool_use_id`. Returns `undefined` for non-file-edit tools or for
   * file-edit tools where snapshotting was skipped (e.g. denied before
   * the SDK ran the tool, or no actual file change occurred).
   */
  takeFileEdit(toolUseId) {
    const content = this._completedFileEdits.get(toolUseId);
    if (content) {
      this._completedFileEdits.delete(toolUseId);
    }
    return content;
  }
  /**
   * Drop any cross-message tracking that is still pending at the end
   * of a turn. A `tool_use` whose `tool_result` never arrives — model
   * misbehavior, transport drop, future cancellation — would otherwise
   * survive in the maps for the lifetime of the session and accumulate
   * across turns. Called from {@link mapResult} on every `result`
   * envelope; warns once per orphan to surface the protocol break.
   *
   * Phase 12 subagent state lives on {@link SubagentRegistry}, not
   * here; the mapper drives that drain via
   * `registry.drainForegroundSpawns()` from {@link mapResult}.
   */
  clearPendingToolCalls(logService) {
    this.toolCalls.clearPending(logService);
  }
}
function fileEditToolDelta(chat, turnId, toolCallId, invocationMessage) {
  return {
    kind: "action",
    resource: chat,
    action: {
      type: ActionType.ChatToolCallDelta,
      turnId,
      toolCallId,
      content: "",
      invocationMessage
    }
  };
}
function mapSDKMessageToAgentSignals(message, chat, turnId, state, logService, registry, clientToolOwner, turnDuration) {
  if (logService.getLevel() <= LogLevel.Trace) {
    try {
      const snippet = JSON.stringify(message, (k, v) => typeof v === "string" && v.length > 200 ? v.slice(0, 200) + "\u2026" : v);
      logService.trace(`[claudeMapSessionEvents] SDK message type=${message.type}: ${snippet?.slice(0, 2e3) ?? "<unserializable>"}`);
    } catch {
      logService.trace(`[claudeMapSessionEvents] SDK message type=${message.type} (unserializable)`);
    }
  }
  switch (message.type) {
    case "stream_event":
      return tagWithParent(
        mapStreamEvent(message.event, chat, turnId, state, logService, message.parent_tool_use_id, registry, clientToolOwner),
        chat,
        message.parent_tool_use_id,
        registry
      );
    case "result":
      return mapResult(message, chat, turnId, turnDuration, state, logService, registry);
    case "assistant":
      return tagWithParent(
        mapAssistantCanonical(message, chat, turnId, state, message.parent_tool_use_id, registry, clientToolOwner),
        chat,
        message.parent_tool_use_id,
        registry
      );
    case "user":
      return tagWithParent(
        mapUserMessage(message, chat, state, logService, registry),
        chat,
        message.parent_tool_use_id,
        registry
      );
    default:
      if (message.type === "system") {
        return mapSubagentSystemMessage(message, chat, registry);
      }
      return [];
  }
}
function mapAssistantCanonical(message, chat, turnId, state, parentToolUseId, registry, clientToolOwner) {
  if (parentToolUseId === null) {
    const top = [];
    for (const block of message.message.content) {
      if (block.type !== "tool_use" || !SUBAGENT_SPAWNING_TOOL_NAMES.has(block.name)) {
        continue;
      }
      top.push(buildTopLevelSubagentReadyAction(block, chat, turnId, registry));
    }
    return top;
  }
  return emitInnerAssistantSignals(message, chat, turnId, state, parentToolUseId, registry, clientToolOwner);
}
function mapUserMessage(message, chat, state, logService, registry) {
  const content = message.message.content;
  if (!Array.isArray(content)) {
    return [];
  }
  const signals = [];
  for (const block of content) {
    if (block.type !== "tool_result") {
      continue;
    }
    const tracked = state.lookupToolCall(block.tool_use_id);
    if (!tracked) {
      logService.warn(`[claudeMapSessionEvents] tool_result for unknown tool_use_id ${block.tool_use_id}`);
      continue;
    }
    const isError = block.is_error === true;
    const content2 = extractToolResultContent(block.content) ?? [];
    const fileEdit = state.takeFileEdit(block.tool_use_id);
    if (fileEdit) {
      content2.push(fileEdit);
    }
    const info = state.toolCalls.lookup(block.tool_use_id)?.info;
    const resultText = content2.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("\n");
    const pastTenseMessage = info ? info.isClientTool ? info.displayName : getClaudePastTenseMessage(info.toolName, info.displayName, info.parsedInput, !isError, resultText) : tracked.isClientTool ? tracked.toolName : `${getClaudeToolDisplayName(tracked.toolName)} finished`;
    const denialCode = isError ? claudeToolDenialCode(resultText) : void 0;
    signals.push({
      kind: "action",
      resource: chat,
      action: {
        type: ActionType.ChatToolCallComplete,
        turnId: tracked.turnId,
        toolCallId: block.tool_use_id,
        result: {
          success: !isError,
          pastTenseMessage,
          content: content2.length > 0 ? content2 : void 0,
          ...denialCode ? { error: { message: resultText, code: denialCode } } : {}
        }
      }
    });
    state.completeToolCall(block.tool_use_id);
    const spawn = registry.getSpawn(block.tool_use_id);
    if (spawn && !spawn.background && spawn.markCompleted()) {
      signals.push({
        kind: "subagent_completed",
        chat,
        toolCallId: block.tool_use_id
      });
      registry.removeSpawn(block.tool_use_id);
    }
  }
  return signals;
}
function extractToolResultContent(content) {
  if (typeof content === "string") {
    return [{ type: ToolResultContentType.Text, text: content }];
  }
  if (!Array.isArray(content)) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (isToolResultTextBlock(block)) {
      out.push({ type: ToolResultContentType.Text, text: block.text });
    }
  }
  return out.length > 0 ? out : void 0;
}
function isToolResultTextBlock(block) {
  if (block === null || typeof block !== "object") {
    return false;
  }
  const candidate = block;
  return candidate.type === "text" && typeof candidate.text === "string";
}
function mapResult(message, session, turnId, turnDuration, state, logService, registry) {
  const signals = [];
  if (message.subtype === "success") {
    const modelKey = Object.keys(message.modelUsage)[0];
    signals.push({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.ChatUsage,
        turnId,
        usage: {
          inputTokens: message.usage.input_tokens,
          outputTokens: message.usage.output_tokens,
          cacheReadTokens: message.usage.cache_read_input_tokens,
          ...modelKey ? { model: modelKey } : {}
        }
      }
    });
  }
  const errorText = getResultErrorText(message);
  if (errorText !== void 0) {
    signals.push({
      kind: "action",
      resource: session,
      action: {
        type: ActionType.ChatError,
        turnId,
        duration: typeof turnDuration === "number" && Number.isFinite(turnDuration) ? Math.max(0, turnDuration) : 0,
        error: {
          errorType: message.subtype,
          ...extractForwardedErrorInfo(errorText)
        }
      }
    });
  }
  state.clearPendingToolCalls(logService);
  for (const orphan of registry.drainForegroundSpawns()) {
    logService.warn(`[claudeMapSessionEvents] turn ended with pending subagent-spawning tool_use ${orphan.toolUseId} (agentId=${orphan.agentId ?? "<unresolved>"}); dropping cross-message state`);
  }
  return signals;
}
function getResultErrorText(message) {
  if (message.subtype === "success") {
    return message.is_error ? message.result : void 0;
  }
  if (message.subtype === "error_during_execution") {
    return message.errors?.join("\n");
  }
  return void 0;
}
function mapStreamEvent(event, chat, turnId, state, logService, parentToolUseId, registry, clientToolOwner) {
  switch (event.type) {
    case "message_start":
      state.resetMessage(event.message.id);
      return [];
    case "content_block_start": {
      const block = event.content_block;
      if (block.type === "text") {
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatResponsePart,
            turnId,
            part: {
              kind: ResponsePartKind.Markdown,
              id: makeContentBlockPartId(turnId, state, event.index, logService),
              content: ""
            }
          }
        }];
      }
      if (block.type === "thinking") {
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatResponsePart,
            turnId,
            part: {
              kind: ResponsePartKind.Reasoning,
              id: makeContentBlockPartId(turnId, state, event.index, logService),
              content: ""
            }
          }
        }];
      }
      if (block.type === "tool_use") {
        const toolName = stripClientToolNamePrefix(block.name);
        const isClientTool = hasClientToolNamePrefix(block.name);
        state.startToolBlock(event.index, block.id, toolName, turnId, isClientTool);
        const isSubagentSpawn = !isClientTool && SUBAGENT_SPAWNING_TOOL_NAMES.has(toolName);
        if (parentToolUseId === null) {
          if (isSubagentSpawn) {
            registry.recordSpawn(block.id);
          }
        } else {
          registry.noteInnerTool(block.id, parentToolUseId);
        }
        const meta = isClientTool ? void 0 : buildClaudeToolMeta(toolName);
        const toolClientId = isClientTool ? clientToolOwner?.(toolName) : void 0;
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatToolCallStart,
            turnId,
            toolCallId: block.id,
            toolName,
            displayName: isClientTool ? toolName : getClaudeToolDisplayName(toolName),
            ...toolClientId ? { contributor: { kind: ToolCallContributorKind.Client, clientId: toolClientId } } : {},
            ...meta ? { _meta: meta } : {}
          }
        }];
      }
      return [];
    }
    case "content_block_delta": {
      if (event.delta.type === "text_delta") {
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatDelta,
            turnId,
            partId: makeContentBlockPartId(turnId, state, event.index, logService),
            content: event.delta.text
          }
        }];
      }
      if (event.delta.type === "thinking_delta") {
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatReasoning,
            turnId,
            partId: makeContentBlockPartId(turnId, state, event.index, logService),
            content: event.delta.thinking
          }
        }];
      }
      if (event.delta.type === "input_json_delta") {
        const tracked = state.getActiveToolBlock(event.index);
        if (!tracked) {
          logService.warn(`[claudeMapSessionEvents] input_json_delta for unknown content-block index ${event.index}`);
          return [];
        }
        state.appendToolBlockInputDelta(event.index, event.delta.partial_json);
        if (!tracked.isClientTool && isClaudeFileEditTool(tracked.toolName)) {
          const update = state.toolCalls.streamingInputUpdate(tracked.toolUseId);
          if (!update) {
            return [];
          }
          return [fileEditToolDelta(chat, turnId, tracked.toolUseId, update.invocationMessage)];
        }
        return [{
          kind: "action",
          resource: chat,
          action: {
            type: ActionType.ChatToolCallDelta,
            turnId,
            toolCallId: tracked.toolUseId,
            content: event.delta.partial_json
          }
        }];
      }
      return [];
    }
    case "content_block_stop": {
      const tracked = state.getActiveToolBlock(event.index);
      const finalStreamingUpdate = tracked && !tracked.isClientTool && isClaudeFileEditTool(tracked.toolName) ? state.toolCalls.streamingInputUpdate(tracked.toolUseId, true) : void 0;
      state.finalizeToolBlock(event.index);
      state.endToolBlock(event.index);
      if (!tracked) {
        return [];
      }
      const entry = state.toolCalls.lookup(tracked.toolUseId);
      const info = entry?.info;
      if (!info) {
        return [];
      }
      const meta = tracked.isClientTool ? void 0 : buildClaudeToolMeta(tracked.toolName);
      const signals = [];
      if (finalStreamingUpdate) {
        signals.push(fileEditToolDelta(chat, turnId, tracked.toolUseId, finalStreamingUpdate.invocationMessage));
      }
      signals.push({
        kind: "action",
        resource: chat,
        action: {
          type: ActionType.ChatToolCallReady,
          turnId,
          toolCallId: tracked.toolUseId,
          invocationMessage: info.invocationMessage,
          ...info.toolInput !== void 0 ? { toolInput: info.toolInput } : {},
          confirmed: ToolCallConfirmationReason.NotNeeded,
          ...meta ? { _meta: meta } : {}
        }
      });
      return signals;
    }
    case "message_delta":
    case "message_stop":
      return [];
    default:
      return [];
  }
}
function makeContentBlockPartId(turnId, state, index, logService) {
  const messageId = state.getCurrentMessageId();
  if (messageId === void 0) {
    logService.warn(`[claudeMapSessionEvents] content block at index ${index} arrived before message_start; using turn-scoped id`);
    return `${turnId}#${index}`;
  }
  return `${turnId}#${messageId}#${index}`;
}
export {
  ClaudeMapperState,
  mapSDKMessageToAgentSignals
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZU1hcFNlc3Npb25FdmVudHMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgdHlwZSB7IFNES01lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgTG9nTGV2ZWwsIHR5cGUgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgdHlwZSB7IEFnZW50U2lnbmFsIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FnZW50LmpzJztcbmltcG9ydCB7IEFjdGlvblR5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvbkFjdGlvbnMuanMnO1xuaW1wb3J0IHsgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFRvb2xSZXN1bHRDb250ZW50LCB0eXBlIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8gfSBmcm9tICcuLi9zaGFyZWQvcHJveHlDaGF0RXJyb3IuanMnO1xuaW1wb3J0IHsgYnVpbGRUb3BMZXZlbFN1YmFnZW50UmVhZHlBY3Rpb24sIGVtaXRJbm5lckFzc2lzdGFudFNpZ25hbHMsIG1hcFN1YmFnZW50U3lzdGVtTWVzc2FnZSwgU1VCQUdFTlRfU1BBV05JTkdfVE9PTF9OQU1FUywgdGFnV2l0aFBhcmVudCB9IGZyb20gJy4vY2xhdWRlU3ViYWdlbnRTaWduYWxzLmpzJztcbmltcG9ydCB0eXBlIHsgU3ViYWdlbnRSZWdpc3RyeSB9IGZyb20gJy4vY2xhdWRlU3ViYWdlbnRSZWdpc3RyeS5qcyc7XG5pbXBvcnQgeyBzdHJpcENsaWVudFRvb2xOYW1lUHJlZml4LCBoYXNDbGllbnRUb29sTmFtZVByZWZpeCB9IGZyb20gJy4vY2xpZW50VG9vbHMvY2xhdWRlQ2xpZW50VG9vbE1jcFNlcnZlci5qcyc7XG5pbXBvcnQgeyBidWlsZENsYXVkZVRvb2xNZXRhLCBnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlLCBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUsIGlzQ2xhdWRlRmlsZUVkaXRUb29sIH0gZnJvbSAnLi9jbGF1ZGVUb29sRGlzcGxheS5qcyc7XG5pbXBvcnQgeyBjbGF1ZGVUb29sRGVuaWFsQ29kZSB9IGZyb20gJy4vY2xhdWRlVG9vbERlbmlhbC5qcyc7XG5pbXBvcnQgeyBDbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5IH0gZnJvbSAnLi9jbGF1ZGVUb29sQ2FsbFJlZ2lzdHJ5LmpzJztcbmltcG9ydCB7IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLCBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZCwgdHlwZSBTdHJpbmdPck1hcmtkb3duIH0gZnJvbSAnLi4vLi4vY29tbW9uL3N0YXRlL3Byb3RvY29sL3N0YXRlLmpzJztcblxuLyoqXG4gKiBDcm9zcy1jYWxsIHN0YXRlIGZvciB7QGxpbmsgbWFwU0RLTWVzc2FnZVRvQWdlbnRTaWduYWxzfS4gT25lIGluc3RhbmNlXG4gKiBsaXZlcyBwZXIge0BsaW5rIENsYXVkZUFnZW50U2Vzc2lvbn0gYW5kIGlzIHRocmVhZGVkIHRocm91Z2ggZXZlcnlcbiAqIG1hcHBlciBpbnZvY2F0aW9uIGZvciB0aGF0IHNlc3Npb24ncyBsaWZldGltZS5cbiAqXG4gKiBUaHJlZSBzY29wZXM6XG4gKlxuICogLSAqKlBlci1tZXNzYWdlKiogKGBhY3RpdmVUb29sQmxvY2tzYCwgYGN1cnJlbnRNZXNzYWdlSWRgKTogbWlycm9yXG4gKiAgIHRoZSBTREsncyBwZXItbWVzc2FnZSBgQmV0YVJhd0NvbnRlbnRCbG9ja1N0YXJ0RXZlbnQuaW5kZXhgXG4gKiAgIG5hbWVzcGFjZS4gUmVzZXQgb24gZXZlcnkgYG1lc3NhZ2Vfc3RhcnRgLiBgYWN0aXZlVG9vbEJsb2Nrc2AgbGV0c1xuICogICBgaW5wdXRfanNvbl9kZWx0YWAgbG9vayB1cCB0aGUgdG9vbCBibG9jayB0aGF0IG93bnMgdGhlIGN1cnJlbnRcbiAqICAgaW5kZXguIGBjdXJyZW50TWVzc2FnZUlkYCBxdWFsaWZpZXMgdGV4dC90aGlua2luZyBwYXJ0IGlkcyBzbyBhXG4gKiAgIGxhdGVyIG1lc3NhZ2UgaW4gdGhlIHNhbWUgdHVybiBkb2VzIG5vdCBjb2xsaWRlIHdpdGggYW4gZWFybGllclxuICogICBtZXNzYWdlIHRoYXQgdXNlZCB0aGUgc2FtZSBgaW5kZXhgIGZvciBhIGRpZmZlcmVudCBibG9jayBraW5kXG4gKiAgIChlLmcuIHR1cm4gb25lOiBgdGhpbmtpbmdAMGA7IHR1cm4gdHdvIGFmdGVyIGB0b29sX3Jlc3VsdGA6XG4gKiAgIGB0ZXh0QDBgKS5cbiAqIC0gKipDcm9zcy1tZXNzYWdlKiogKGB0b29sQ2FsbFR1cm5JZHNgLCBgdG9vbENhbGxOYW1lc2ApOiBhIGB0b29sX3VzZWBcbiAqICAgbGFuZHMgaW4gb25lIGFzc2lzdGFudCBtZXNzYWdlLCB0aGUgbWF0Y2hpbmcgYHRvb2xfcmVzdWx0YCBhcnJpdmVzXG4gKiAgIGluIGEgbGF0ZXIgc3ludGhldGljIGB1c2VyYCBtZXNzYWdlLiBLZXllZCBieSB0aGUgU0RLJ3MgZ2xvYmFsbHktXG4gKiAgIHVuaXF1ZSBgYmxvY2suaWRgIHNvIHJlLXVzZSBvZiBgaW5kZXhgIGJldHdlZW4gbWVzc2FnZXMgaXMgaGFybWxlc3MuXG4gKiAgIERyYWluZWQgb24gYHRvb2xfcmVzdWx0YCAoaGFwcHkgcGF0aCkgb3Igb24gdGhlIHR1cm4ncyBgcmVzdWx0YFxuICogICBlbnZlbG9wZSBhcyBhIGRlZmVuc2UtaW4tZGVwdGggZmFsbGJhY2sgc28gYW4gU0RLIHRoYXQgbmV2ZXJcbiAqICAgZGVsaXZlcnMgYHRvb2xfcmVzdWx0YCBjYW5ub3QgbGVhayBlbnRyaWVzIGFjcm9zcyB0dXJucy5cbiAqXG4gKiBFbmNhcHN1bGF0ZWQgYXMgYSBjbGFzcyAodnMuIGEgcGxhaW4gaW50ZXJmYWNlKSBzbyB0aGUgbWFwcycgbXV0YXRvcnNcbiAqIGFyZSBub3QgcGFydCBvZiB0aGUgcHVibGljIHN1cmZhY2UgXHUyMDE0IFBoYXNlIDYuMSdzIGxlc3NvbiBcdTIwMTQgYW5kIHRoZVxuICogbGlmZWN5Y2xlIGludmFyaWFudHMgbGl2ZSBiZWhpbmQgbmFtZWQgbWV0aG9kcy5cbiAqL1xuZXhwb3J0IGNsYXNzIENsYXVkZU1hcHBlclN0YXRlIHtcblx0cHJpdmF0ZSByZWFkb25seSBfYWN0aXZlVG9vbEJsb2NrcyA9IG5ldyBNYXA8bnVtYmVyLCB7IHRvb2xVc2VJZDogc3RyaW5nOyB0b29sTmFtZTogc3RyaW5nOyBpc0NsaWVudFRvb2w6IGJvb2xlYW4gfT4oKTtcblx0LyoqXG5cdCAqIFBoYXNlIDguNSBcdTIwMTQgY3Jvc3MtbWVzc2FnZSB0b29sLWNhbGwgYXR0cmlidXRpb24gKyBpbnB1dFxuXHQgKiBhY2N1bXVsYXRpb24gKyBjb21wdXRlZCBzdGFydC1pbmZvLCBlbmNhcHN1bGF0ZWQgYXMgaXRzIG93blxuXHQgKiBjb2xsYWJvcmF0b3IgY2xhc3Mgc28gaXQgY2FuIGJlIHVuaXQtdGVzdGVkIGluZGVwZW5kZW50bHkuXG5cdCAqIFB1YmxpYyBzbyBtYXBwZXIgZnVuY3Rpb25zIGNhbiBjYWxsIGl0cyBsaWZlY3ljbGUgbWV0aG9kc1xuXHQgKiBkaXJlY3RseSB3aXRob3V0IGZvcndhcmRpbmcgdGhyb3VnaCB0aGlzIGNsYXNzLlxuXHQgKi9cblx0cmVhZG9ubHkgdG9vbENhbGxzID0gbmV3IENsYXVkZVRvb2xDYWxsUmVnaXN0cnkoKTtcblx0cHJpdmF0ZSBfY3VycmVudE1lc3NhZ2VJZDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5cdC8qKlxuXHQgKiBQaGFzZSA4IFx1MjAxNCBmaWxlLWVkaXQgY29udGVudCBwcmUtc3RhZ2VkIGJ5XG5cdCAqIGBDbGF1ZGVBZ2VudFNlc3Npb24uX29ic2VydmVVc2VyTWVzc2FnZWAgYW5kIGNvbnN1bWVkIGJ5XG5cdCAqIHtAbGluayBtYXBVc2VyTWVzc2FnZX0gd2hlbiB0aGUgbWF0Y2hpbmcgYHRvb2xfcmVzdWx0YCBhcnJpdmVzLlxuXHQgKiBLZXllZCBieSBTREsgYHRvb2xfdXNlX2lkYC4gVGhlIHNlc3Npb24ncyBgX3Byb2Nlc3NNZXNzYWdlc2AgbG9vcFxuXHQgKiBhd2FpdHMgdGhlIGFmdGVyLXNuYXBzaG90IGJlZm9yZSBpbnZva2luZyB0aGUgc3luY2hyb25vdXMgbWFwcGVyLFxuXHQgKiBzbyBieSB0aGUgdGltZSBgdGFrZUZpbGVFZGl0YCBpcyBjYWxsZWQgdGhlIGVudHJ5IGlzIGFsd2F5c1xuXHQgKiBwb3B1bGF0ZWQgZm9yIHRyYWNrZWQgZmlsZS1lZGl0IHRvb2xzLlxuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfY29tcGxldGVkRmlsZUVkaXRzID0gbmV3IE1hcDxzdHJpbmcsIFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQ+KCk7XG5cblx0LyoqXG5cdCAqIFJlc2V0IHBlci1tZXNzYWdlIHN0YXRlLiBDYWxsZWQgb24gYG1lc3NhZ2Vfc3RhcnRgLiBDcm9zcy1tZXNzYWdlXG5cdCAqIHRvb2wtY2FsbCB0cmFja2luZyBpcyBkZWxpYmVyYXRlbHkgTk9UIGNsZWFyZWQgaGVyZSBcdTIwMTQgdGhlXG5cdCAqIGB0b29sX3Jlc3VsdGAgZm9yIGEgYHRvb2xfdXNlYCBhcnJpdmVzIGluIGEgbGF0ZXIgbWVzc2FnZS5cblx0ICovXG5cdHJlc2V0TWVzc2FnZShtZXNzYWdlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMuX2FjdGl2ZVRvb2xCbG9ja3MuY2xlYXIoKTtcblx0XHR0aGlzLl9jdXJyZW50TWVzc2FnZUlkID0gbWVzc2FnZUlkO1xuXHR9XG5cblx0Z2V0Q3VycmVudE1lc3NhZ2VJZCgpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdHJldHVybiB0aGlzLl9jdXJyZW50TWVzc2FnZUlkO1xuXHR9XG5cblx0LyoqXG5cdCAqIE9wZW4gYSB0b29sIGJsb2NrIGF0IHRoZSBnaXZlbiBjb250ZW50LWJsb2NrIGluZGV4LiBTZWVkcyBib3RoXG5cdCAqIHNjb3BlczsgdGhlIHBlci1tZXNzYWdlIG1hcCBnZXRzIGRyYWluZWQgb24gYGNvbnRlbnRfYmxvY2tfc3RvcGAsXG5cdCAqIHRoZSBjcm9zcy1tZXNzYWdlIG1hcHMgc3Vydml2ZSB1bnRpbCB0aGUgbWF0Y2hpbmcgYHRvb2xfcmVzdWx0YC5cblx0ICovXG5cdHN0YXJ0VG9vbEJsb2NrKGluZGV4OiBudW1iZXIsIHRvb2xVc2VJZDogc3RyaW5nLCB0b29sTmFtZTogc3RyaW5nLCB0dXJuSWQ6IHN0cmluZywgaXNDbGllbnRUb29sID0gZmFsc2UpOiB2b2lkIHtcblx0XHR0aGlzLl9hY3RpdmVUb29sQmxvY2tzLnNldChpbmRleCwgeyB0b29sVXNlSWQsIHRvb2xOYW1lLCBpc0NsaWVudFRvb2wgfSk7XG5cdFx0dGhpcy50b29sQ2FsbHMuYmVnaW4odG9vbFVzZUlkLCB0b29sTmFtZSwgdHVybklkLCBpc0NsaWVudFRvb2wpO1xuXHR9XG5cblx0Z2V0QWN0aXZlVG9vbEJsb2NrKGluZGV4OiBudW1iZXIpOiB7IHRvb2xVc2VJZDogc3RyaW5nOyB0b29sTmFtZTogc3RyaW5nOyBpc0NsaWVudFRvb2w6IGJvb2xlYW4gfSB8IHVuZGVmaW5lZCB7XG5cdFx0cmV0dXJuIHRoaXMuX2FjdGl2ZVRvb2xCbG9ja3MuZ2V0KGluZGV4KTtcblx0fVxuXG5cdGVuZFRvb2xCbG9jayhpbmRleDogbnVtYmVyKTogdm9pZCB7XG5cdFx0dGhpcy5fYWN0aXZlVG9vbEJsb2Nrcy5kZWxldGUoaW5kZXgpO1xuXHR9XG5cblx0LyoqXG5cdCAqIFBoYXNlIDguNSBcdTIwMTQgZm9yd2FyZCBhbiBgaW5wdXRfanNvbl9kZWx0YS5wYXJ0aWFsX2pzb25gIGNodW5rXG5cdCAqIHRvIHRoZSByZWdpc3RyeS4gUmVzb2x2ZXMgdGhlIGluZGV4IFx1MjE5MiBgdG9vbF91c2VfaWRgIG1hcHBpbmdcblx0ICogbG9jYWxseSAodGhlIHJlZ2lzdHJ5IGlzIGtleWVkIGJ5IGlkLCBub3QgYnkgaW5kZXgpIGFuZCBpcyBhXG5cdCAqIG5vLW9wIHdoZW4gdGhlIGluZGV4IGlzIHVua25vd24uXG5cdCAqL1xuXHRhcHBlbmRUb29sQmxvY2tJbnB1dERlbHRhKGluZGV4OiBudW1iZXIsIHBhcnRpYWxKc29uOiBzdHJpbmcpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbEJsb2Nrcy5nZXQoaW5kZXgpO1xuXHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvb2xDYWxscy5hcHBlbmRJbnB1dERlbHRhKHRyYWNrZWQudG9vbFVzZUlkLCBwYXJ0aWFsSnNvbik7XG5cdH1cblxuXHQvKipcblx0ICogUGhhc2UgOC41IFx1MjAxNCBmb3J3YXJkIHRoZSBgY29udGVudF9ibG9ja19zdG9wYCBzaWduYWwgdG8gdGhlXG5cdCAqIHJlZ2lzdHJ5LCB3aGljaCBwYXJzZXMgdGhlIGJ1ZmZlciBhbmQgc3Rhc2hlcyB0aGUgY29tcHV0ZWRcblx0ICogc3RhcnQtaW5mby5cblx0ICovXG5cdGZpbmFsaXplVG9vbEJsb2NrKGluZGV4OiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCB0cmFja2VkID0gdGhpcy5fYWN0aXZlVG9vbEJsb2Nrcy5nZXQoaW5kZXgpO1xuXHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHR0aGlzLnRvb2xDYWxscy5maW5hbGl6ZSh0cmFja2VkLnRvb2xVc2VJZCk7XG5cdH1cblxuXHQvKipcblx0ICogQ3Jvc3MtbWVzc2FnZSBsb29rdXAgZm9yIGB0b29sX3Jlc3VsdGAgaGFuZGxpbmcuIFJldHVybnNcblx0ICogYHVuZGVmaW5lZGAgaWYgdGhlIGB0b29sX3VzZV9pZGAgaXMgdW5rbm93biAoZGVmZW5zZS1pbi1kZXB0aFxuXHQgKiBhZ2FpbnN0IHRyYW5zcG9ydCBkcmlmdCAvIHJlcGxheSkuXG5cdCAqL1xuXHRsb29rdXBUb29sQ2FsbCh0b29sVXNlSWQ6IHN0cmluZyk6IHsgdHVybklkOiBzdHJpbmc7IHRvb2xOYW1lOiBzdHJpbmc7IGlzQ2xpZW50VG9vbDogYm9vbGVhbiB9IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBlbnRyeSA9IHRoaXMudG9vbENhbGxzLmxvb2t1cCh0b29sVXNlSWQpO1xuXHRcdHJldHVybiBlbnRyeSA/IHsgdHVybklkOiBlbnRyeS50dXJuSWQsIHRvb2xOYW1lOiBlbnRyeS50b29sTmFtZSwgaXNDbGllbnRUb29sOiBlbnRyeS5pc0NsaWVudFRvb2wgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8qKiBEcmFpbiBjcm9zcy1tZXNzYWdlIHRyYWNraW5nIG9uY2UgYSBgdG9vbF9yZXN1bHRgIGlzIGRlbGl2ZXJlZC4gKi9cblx0Y29tcGxldGVUb29sQ2FsbCh0b29sVXNlSWQ6IHN0cmluZyk6IHZvaWQge1xuXHRcdHRoaXMudG9vbENhbGxzLmNvbXBsZXRlKHRvb2xVc2VJZCk7XG5cdH1cblxuXHQvKipcblx0ICogUGhhc2UgOCBcdTIwMTQgc3Rhc2ggYSB7QGxpbmsgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudH0gcHJvZHVjZWQgYnlcblx0ICogYENsYXVkZUFnZW50U2Vzc2lvbi5fb2JzZXJ2ZVVzZXJNZXNzYWdlYCBzbyB0aGUgc3luY2hyb25vdXMgbWFwcGVyXG5cdCAqIGNhbiBhcHBlbmQgaXQgdG8gdGhlIG1hdGNoaW5nIGBDaGF0VG9vbENhbGxDb21wbGV0ZWAgYWN0aW9uLlxuXHQgKi9cblx0Y2FjaGVGaWxlRWRpdCh0b29sVXNlSWQ6IHN0cmluZywgY29udGVudDogVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCk6IHZvaWQge1xuXHRcdHRoaXMuX2NvbXBsZXRlZEZpbGVFZGl0cy5zZXQodG9vbFVzZUlkLCBjb250ZW50KTtcblx0fVxuXG5cdC8qKlxuXHQgKiBQaGFzZSA4IFx1MjAxNCBjb25zdW1lIGFuZCByZW1vdmUgdGhlIGNhY2hlZCBmaWxlIGVkaXQgZm9yIHRoaXNcblx0ICogYHRvb2xfdXNlX2lkYC4gUmV0dXJucyBgdW5kZWZpbmVkYCBmb3Igbm9uLWZpbGUtZWRpdCB0b29scyBvciBmb3Jcblx0ICogZmlsZS1lZGl0IHRvb2xzIHdoZXJlIHNuYXBzaG90dGluZyB3YXMgc2tpcHBlZCAoZS5nLiBkZW5pZWQgYmVmb3JlXG5cdCAqIHRoZSBTREsgcmFuIHRoZSB0b29sLCBvciBubyBhY3R1YWwgZmlsZSBjaGFuZ2Ugb2NjdXJyZWQpLlxuXHQgKi9cblx0dGFrZUZpbGVFZGl0KHRvb2xVc2VJZDogc3RyaW5nKTogVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgY29udGVudCA9IHRoaXMuX2NvbXBsZXRlZEZpbGVFZGl0cy5nZXQodG9vbFVzZUlkKTtcblx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0dGhpcy5fY29tcGxldGVkRmlsZUVkaXRzLmRlbGV0ZSh0b29sVXNlSWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gY29udGVudDtcblx0fVxuXG5cdC8qKlxuXHQgKiBEcm9wIGFueSBjcm9zcy1tZXNzYWdlIHRyYWNraW5nIHRoYXQgaXMgc3RpbGwgcGVuZGluZyBhdCB0aGUgZW5kXG5cdCAqIG9mIGEgdHVybi4gQSBgdG9vbF91c2VgIHdob3NlIGB0b29sX3Jlc3VsdGAgbmV2ZXIgYXJyaXZlcyBcdTIwMTQgbW9kZWxcblx0ICogbWlzYmVoYXZpb3IsIHRyYW5zcG9ydCBkcm9wLCBmdXR1cmUgY2FuY2VsbGF0aW9uIFx1MjAxNCB3b3VsZCBvdGhlcndpc2Vcblx0ICogc3Vydml2ZSBpbiB0aGUgbWFwcyBmb3IgdGhlIGxpZmV0aW1lIG9mIHRoZSBzZXNzaW9uIGFuZCBhY2N1bXVsYXRlXG5cdCAqIGFjcm9zcyB0dXJucy4gQ2FsbGVkIGZyb20ge0BsaW5rIG1hcFJlc3VsdH0gb24gZXZlcnkgYHJlc3VsdGBcblx0ICogZW52ZWxvcGU7IHdhcm5zIG9uY2UgcGVyIG9ycGhhbiB0byBzdXJmYWNlIHRoZSBwcm90b2NvbCBicmVhay5cblx0ICpcblx0ICogUGhhc2UgMTIgc3ViYWdlbnQgc3RhdGUgbGl2ZXMgb24ge0BsaW5rIFN1YmFnZW50UmVnaXN0cnl9LCBub3Rcblx0ICogaGVyZTsgdGhlIG1hcHBlciBkcml2ZXMgdGhhdCBkcmFpbiB2aWFcblx0ICogYHJlZ2lzdHJ5LmRyYWluRm9yZWdyb3VuZFNwYXducygpYCBmcm9tIHtAbGluayBtYXBSZXN1bHR9LlxuXHQgKi9cblx0Y2xlYXJQZW5kaW5nVG9vbENhbGxzKGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlKTogdm9pZCB7XG5cdFx0dGhpcy50b29sQ2FsbHMuY2xlYXJQZW5kaW5nKGxvZ1NlcnZpY2UpO1xuXHR9XG59XG5cbmZ1bmN0aW9uIGZpbGVFZGl0VG9vbERlbHRhKGNoYXQ6IFVSSSwgdHVybklkOiBzdHJpbmcsIHRvb2xDYWxsSWQ6IHN0cmluZywgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd24pOiBBZ2VudFNpZ25hbCB7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0cmVzb3VyY2U6IGNoYXQsXG5cdFx0YWN0aW9uOiB7XG5cdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhLFxuXHRcdFx0dHVybklkLFxuXHRcdFx0dG9vbENhbGxJZCxcblx0XHRcdGNvbnRlbnQ6ICcnLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0fSxcblx0fTtcbn1cblxuLyoqXG4gKiBNYXAgb25lIFNESyBtZXNzYWdlIHRvIHplcm8gb3IgbW9yZSBhZ2VudCBzaWduYWxzLlxuICpcbiAqIFN0YXRlZnVsIHZpYSB7QGxpbmsgQ2xhdWRlTWFwcGVyU3RhdGV9IGFzIG9mIFBoYXNlIDc6IHBlci1ibG9jayB0b29sXG4gKiB0cmFja2luZyBpcyBwZXItbWVzc2FnZSwgY3Jvc3MtYmxvY2sgYHRvb2xfdXNlYCBcdTIxOTIgYHRvb2xfcmVzdWx0YFxuICogbGlua2FnZSBpcyBjcm9zcy1tZXNzYWdlLiBDYWxsZXJzIE1VU1QgdGhyZWFkIG9uZSBzaGFyZWQgc3RhdGVcbiAqIGluc3RhbmNlIHRocm91Z2ggZXZlcnkgaW52b2NhdGlvbiBmb3IgYSBnaXZlbiBzZXNzaW9uLlxuICpcbiAqIFBoYXNlIDYgZW1pc3Npb25zICh0ZXh0IC8gdGhpbmtpbmcgLyB1c2FnZSAvIHR1cm4gY29tcGxldGUpIGFyZVxuICogdW5jaGFuZ2VkIGFuZCBzdGF0ZWxlc3MuIFBoYXNlIDcgYWRkczpcbiAqXG4gKiAtIHtAbGluayBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbFN0YXJ0fSBvblxuICogICBgY29udGVudF9ibG9ja19zdGFydGAgd2l0aCBhIGB0b29sX3VzZWAgYmxvY2suXG4gKiAtIHtAbGluayBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbERlbHRhfSBvbiBgY29udGVudF9ibG9ja19kZWx0YWBcbiAqICAgd2l0aCBhbiBgaW5wdXRfanNvbl9kZWx0YWAuXG4gKiAtIHtAbGluayBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlfSBvbiBhIHN5bnRoZXRpYyBgdXNlcmBcbiAqICAgbWVzc2FnZSB3aG9zZSBgbWVzc2FnZS5jb250ZW50YCBpbmNsdWRlcyBhIGB0b29sX3Jlc3VsdGAgYmxvY2sgXHUyMDE0XG4gKiAgIHRoZSBvcmlnaW5hdGluZyBgdHVybklkYCBpcyByZWNvdmVyZWQgZnJvbSB7QGxpbmsgQ2xhdWRlTWFwcGVyU3RhdGV9XG4gKiAgIHNvIHRoZSBhY3Rpb24gbGFuZHMgb24gdGhlIGNvcnJlY3QgdHVybiBldmVuIHdoZW4gdGhlIHJlc3VsdFxuICogICBhcnJpdmVzIGluIGEgbGF0ZXIgbWVzc2FnZS5cbiAqXG4gKiBSZWR1Y2VyIG9yZGVyaW5nIGludmFyaWFudDogYENoYXRSZXNwb25zZVBhcnRgIE1VU1QgcHJlY2VkZSB0aGVcbiAqIGZpcnN0IGBDaGF0RGVsdGFgIC8gYENoYXRSZWFzb25pbmdgIGZvciB0aGF0IHBhcnQgaWQgKHNlZVxuICogYGFjdGlvbnMudHM6MjMzLCA1NDBgKS4gVGhlIHNhbWUgaG9sZHMgZm9yIHRvb2wgY2FsbHNcbiAqIChgQ2hhdFRvb2xDYWxsU3RhcnRgIHByZWNlZGVzIGBDaGF0VG9vbENhbGxEZWx0YWAgYW5kXG4gKiBgQ2hhdFRvb2xDYWxsQ29tcGxldGVgKS4gVGhlIFNESyBwcm90b2NvbCBvcmRlcnNcbiAqIGBjb250ZW50X2Jsb2NrX3N0YXJ0YCBiZWZvcmUgYW55IGRlbHRhIGF0IHRoZSBzYW1lIGluZGV4LCBhbmRcbiAqIGB0b29sX3Jlc3VsdGAgY2Fubm90IGFycml2ZSBiZWZvcmUgaXRzIG1hdGNoaW5nIGB0b29sX3VzZWAsIHNvIHRoZVxuICogaW52YXJpYW50IGhvbGRzIGJ5IGNvbnN0cnVjdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcFNES01lc3NhZ2VUb0FnZW50U2lnbmFscyhcblx0bWVzc2FnZTogU0RLTWVzc2FnZSxcblx0Y2hhdDogVVJJLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0c3RhdGU6IENsYXVkZU1hcHBlclN0YXRlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cmVnaXN0cnk6IFN1YmFnZW50UmVnaXN0cnksXG5cdGNsaWVudFRvb2xPd25lcj86ICh0b29sTmFtZTogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHR1cm5EdXJhdGlvbj86IG51bWJlcixcbik6IEFnZW50U2lnbmFsW10ge1xuXHRpZiAobG9nU2VydmljZS5nZXRMZXZlbCgpIDw9IExvZ0xldmVsLlRyYWNlKSB7XG5cdFx0dHJ5IHtcblx0XHRcdGNvbnN0IHNuaXBwZXQgPSBKU09OLnN0cmluZ2lmeShtZXNzYWdlLCAoaywgdikgPT4gdHlwZW9mIHYgPT09ICdzdHJpbmcnICYmIHYubGVuZ3RoID4gMjAwID8gdi5zbGljZSgwLCAyMDApICsgJ1x1MjAyNicgOiB2KTtcblx0XHRcdGxvZ1NlcnZpY2UudHJhY2UoYFtjbGF1ZGVNYXBTZXNzaW9uRXZlbnRzXSBTREsgbWVzc2FnZSB0eXBlPSR7bWVzc2FnZS50eXBlfTogJHtzbmlwcGV0Py5zbGljZSgwLCAyMDAwKSA/PyAnPHVuc2VyaWFsaXphYmxlPid9YCk7XG5cdFx0fSBjYXRjaCB7XG5cdFx0XHRsb2dTZXJ2aWNlLnRyYWNlKGBbY2xhdWRlTWFwU2Vzc2lvbkV2ZW50c10gU0RLIG1lc3NhZ2UgdHlwZT0ke21lc3NhZ2UudHlwZX0gKHVuc2VyaWFsaXphYmxlKWApO1xuXHRcdH1cblx0fVxuXHRzd2l0Y2ggKG1lc3NhZ2UudHlwZSkge1xuXHRcdGNhc2UgJ3N0cmVhbV9ldmVudCc6XG5cdFx0XHRyZXR1cm4gdGFnV2l0aFBhcmVudChcblx0XHRcdFx0bWFwU3RyZWFtRXZlbnQobWVzc2FnZS5ldmVudCwgY2hhdCwgdHVybklkLCBzdGF0ZSwgbG9nU2VydmljZSwgbWVzc2FnZS5wYXJlbnRfdG9vbF91c2VfaWQsIHJlZ2lzdHJ5LCBjbGllbnRUb29sT3duZXIpLFxuXHRcdFx0XHRjaGF0LFxuXHRcdFx0XHRtZXNzYWdlLnBhcmVudF90b29sX3VzZV9pZCxcblx0XHRcdFx0cmVnaXN0cnksXG5cdFx0XHQpO1xuXHRcdGNhc2UgJ3Jlc3VsdCc6XG5cdFx0XHRyZXR1cm4gbWFwUmVzdWx0KG1lc3NhZ2UsIGNoYXQsIHR1cm5JZCwgdHVybkR1cmF0aW9uLCBzdGF0ZSwgbG9nU2VydmljZSwgcmVnaXN0cnkpO1xuXHRcdGNhc2UgJ2Fzc2lzdGFudCc6XG5cdFx0XHRyZXR1cm4gdGFnV2l0aFBhcmVudChcblx0XHRcdFx0bWFwQXNzaXN0YW50Q2Fub25pY2FsKG1lc3NhZ2UsIGNoYXQsIHR1cm5JZCwgc3RhdGUsIG1lc3NhZ2UucGFyZW50X3Rvb2xfdXNlX2lkLCByZWdpc3RyeSwgY2xpZW50VG9vbE93bmVyKSxcblx0XHRcdFx0Y2hhdCxcblx0XHRcdFx0bWVzc2FnZS5wYXJlbnRfdG9vbF91c2VfaWQsXG5cdFx0XHRcdHJlZ2lzdHJ5LFxuXHRcdFx0KTtcblx0XHRjYXNlICd1c2VyJzpcblx0XHRcdHJldHVybiB0YWdXaXRoUGFyZW50KFxuXHRcdFx0XHRtYXBVc2VyTWVzc2FnZShtZXNzYWdlLCBjaGF0LCBzdGF0ZSwgbG9nU2VydmljZSwgcmVnaXN0cnkpLFxuXHRcdFx0XHRjaGF0LFxuXHRcdFx0XHRtZXNzYWdlLnBhcmVudF90b29sX3VzZV9pZCxcblx0XHRcdFx0cmVnaXN0cnksXG5cdFx0XHQpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHQvLyBQaGFzZSAxMiBzdGVwIDcgXHUyMDE0IHN5c3RlbSBzdWJ0eXBlcyBmb3Igc3ViYWdlbnQgdGFzayBkaXNjcmltaW5hdGlvbi5cblx0XHRcdGlmIChtZXNzYWdlLnR5cGUgPT09ICdzeXN0ZW0nKSB7XG5cdFx0XHRcdHJldHVybiBtYXBTdWJhZ2VudFN5c3RlbU1lc3NhZ2UobWVzc2FnZSwgY2hhdCwgcmVnaXN0cnkpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHR9XG59XG5cbi8qKlxuICogSGFuZGxlIHRoZSBjYW5vbmljYWwge0BsaW5rIFNES0Fzc2lzdGFudE1lc3NhZ2V9IChgdHlwZTogJ2Fzc2lzdGFudCdgKS5cbiAqXG4gKiAqKlRvcC1sZXZlbCAoYHBhcmVudF90b29sX3VzZV9pZCA9PT0gbnVsbGApKio6IHRoZSBTREsgZGVsaXZlcmVkIGVhY2hcbiAqIGJsb2NrIHZpYSBgc3RyZWFtX2V2ZW50YCBwYXJ0aWFscyBhbmQgYG1hcFN0cmVhbUV2ZW50YCBlbWl0dGVkIHRoZVxuICogbWF0Y2hpbmcgc2lnbmFscywgc28gbW9zdCBibG9ja3MgaGVyZSBhcmUgbm8tb3BzLiAqKkV4Y2VwdGlvbioqOiBmb3JcbiAqIFRhc2svQWdlbnQgdG9vbF91c2UgYmxvY2tzIHdlIHN5bnRoZXNpc2UgYSBgQ2hhdFRvb2xDYWxsUmVhZHlgXG4gKiAodmlhIHtAbGluayBidWlsZFRvcExldmVsU3ViYWdlbnRSZWFkeUFjdGlvbn0pIGJlY2F1c2UgdGhlIFNESyBza2lwc1xuICogYGNhblVzZVRvb2xgIGZvciB0aGVtIGFuZCB0aGUgcGFyZW50IHRvb2wgd291bGQgb3RoZXJ3aXNlIHN0YXkgaW5cbiAqIGBTdHJlYW1pbmdgIFx1MjAxNCBzZWUgdGhhdCBmdW5jdGlvbidzIEpTRG9jLlxuICpcbiAqICoqSW5uZXIgc3ViYWdlbnQgY29udGV4dCAoYHBhcmVudF90b29sX3VzZV9pZCAhPT0gbnVsbGApKio6IGVtcGlyaWNhbGx5XG4gKiB0aGUgU0RLIGRvZXMgTk9UIGRlbGl2ZXIgaW5uZXIgY29udGVudCB2aWEgYHN0cmVhbV9ldmVudGAgXHUyMDE0IG9ubHkgdmlhXG4gKiBjYW5vbmljYWwgYGFzc2lzdGFudGAgYW5kIGB1c2VyYCBtZXNzYWdlcywgZXZlbiB3aXRoXG4gKiBgT3B0aW9ucy5mb3J3YXJkU3ViYWdlbnRUZXh0OiB0cnVlYC4gRGVsZWdhdGVkIHRvXG4gKiB7QGxpbmsgZW1pdElubmVyQXNzaXN0YW50U2lnbmFsc30gd2hpY2ggZW1pdHMgb25lIHNpZ25hbCBwZXIgY29udGVudFxuICogYmxvY2suIGB0YWdXaXRoUGFyZW50YCB0aGVuIHN0YW1wcyBldmVyeSBlbWl0dGVkIGFjdGlvbiB3aXRoIHRoZVxuICogZW52ZWxvcGUncyBgcGFyZW50X3Rvb2xfdXNlX2lkYCBzbyBgQWdlbnRTaWRlRWZmZWN0c2Agcm91dGVzIHRoZW0gdG9cbiAqIHRoZSBzdWJhZ2VudCBzZXNzaW9uLlxuICovXG5mdW5jdGlvbiBtYXBBc3Npc3RhbnRDYW5vbmljYWwoXG5cdG1lc3NhZ2U6IEV4dHJhY3Q8U0RLTWVzc2FnZSwgeyB0eXBlOiAnYXNzaXN0YW50JyB9Pixcblx0Y2hhdDogVVJJLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0c3RhdGU6IENsYXVkZU1hcHBlclN0YXRlLFxuXHRwYXJlbnRUb29sVXNlSWQ6IHN0cmluZyB8IG51bGwsXG5cdHJlZ2lzdHJ5OiBTdWJhZ2VudFJlZ2lzdHJ5LFxuXHRjbGllbnRUb29sT3duZXI/OiAodG9vbE5hbWU6IHN0cmluZykgPT4gc3RyaW5nIHwgdW5kZWZpbmVkLFxuKTogQWdlbnRTaWduYWxbXSB7XG5cdGlmIChwYXJlbnRUb29sVXNlSWQgPT09IG51bGwpIHtcblx0XHRjb25zdCB0b3A6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIG1lc3NhZ2UubWVzc2FnZS5jb250ZW50KSB7XG5cdFx0XHRpZiAoYmxvY2sudHlwZSAhPT0gJ3Rvb2xfdXNlJyB8fCAhU1VCQUdFTlRfU1BBV05JTkdfVE9PTF9OQU1FUy5oYXMoYmxvY2submFtZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0b3AucHVzaChidWlsZFRvcExldmVsU3ViYWdlbnRSZWFkeUFjdGlvbihibG9jaywgY2hhdCwgdHVybklkLCByZWdpc3RyeSkpO1xuXHRcdH1cblx0XHRyZXR1cm4gdG9wO1xuXHR9XG5cdHJldHVybiBlbWl0SW5uZXJBc3Npc3RhbnRTaWduYWxzKG1lc3NhZ2UsIGNoYXQsIHR1cm5JZCwgc3RhdGUsIHBhcmVudFRvb2xVc2VJZCwgcmVnaXN0cnksIGNsaWVudFRvb2xPd25lcik7XG59XG5cbi8qKlxuICogSGFuZGxlIHN5bnRoZXRpYyBgdXNlcmAgbWVzc2FnZXMgd2hvc2UgYG1lc3NhZ2UuY29udGVudGAgY2Fycmllc1xuICogYHRvb2xfcmVzdWx0YCBibG9ja3MuIFRoZSBTREsgZGVsaXZlcnMgdGhlc2UgYXMgdGhlIHJlc3BvbnNlIHRvIGFcbiAqIHByaW9yIGB0b29sX3VzZWAuIFBlciBQaGFzZSA3IFMzLjMuNCwgZWFjaCBzdWNoIGJsb2NrIGVtaXRzIGFcbiAqIHtAbGluayBBY3Rpb25UeXBlLkNoYXRUb29sQ2FsbENvbXBsZXRlfSBhY3Rpb24gdGFyZ2V0aW5nIHRoZSB0dXJuXG4gKiB0aGF0IG93bmVkIHRoZSBvcmlnaW5hbCBgdG9vbF91c2VgLlxuICpcbiAqIENyb3NzLW1lc3NhZ2UgbGlua2FnZSBpcyB2aWEge0BsaW5rIENsYXVkZU1hcHBlclN0YXRlLmxvb2t1cFRvb2xDYWxsfTtcbiAqIHVua25vd24gYHRvb2xfdXNlX2lkYHMgd2FybiBhbmQgZHJvcCAoZGVmZW5zZS1pbi1kZXB0aCwgbWlycm9ycyB0aGVcbiAqIFBoYXNlIDcgcGxhbiBTMy4zLjUgZGlyZWN0aXZlKS5cbiAqL1xuZnVuY3Rpb24gbWFwVXNlck1lc3NhZ2UoXG5cdG1lc3NhZ2U6IEV4dHJhY3Q8U0RLTWVzc2FnZSwgeyB0eXBlOiAndXNlcicgfT4sXG5cdGNoYXQ6IFVSSSxcblx0c3RhdGU6IENsYXVkZU1hcHBlclN0YXRlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cmVnaXN0cnk6IFN1YmFnZW50UmVnaXN0cnksXG4pOiBBZ2VudFNpZ25hbFtdIHtcblx0Y29uc3QgY29udGVudCA9IG1lc3NhZ2UubWVzc2FnZS5jb250ZW50O1xuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCBzaWduYWxzOiBBZ2VudFNpZ25hbFtdID0gW107XG5cdGZvciAoY29uc3QgYmxvY2sgb2YgY29udGVudCkge1xuXHRcdGlmIChibG9jay50eXBlICE9PSAndG9vbF9yZXN1bHQnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgdHJhY2tlZCA9IHN0YXRlLmxvb2t1cFRvb2xDYWxsKGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHRpZiAoIXRyYWNrZWQpIHtcblx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW2NsYXVkZU1hcFNlc3Npb25FdmVudHNdIHRvb2xfcmVzdWx0IGZvciB1bmtub3duIHRvb2xfdXNlX2lkICR7YmxvY2sudG9vbF91c2VfaWR9YCk7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgaXNFcnJvciA9IGJsb2NrLmlzX2Vycm9yID09PSB0cnVlO1xuXHRcdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gPSBleHRyYWN0VG9vbFJlc3VsdENvbnRlbnQoYmxvY2suY29udGVudCkgPz8gW107XG5cdFx0Y29uc3QgZmlsZUVkaXQgPSBzdGF0ZS50YWtlRmlsZUVkaXQoYmxvY2sudG9vbF91c2VfaWQpO1xuXHRcdGlmIChmaWxlRWRpdCkge1xuXHRcdFx0Y29udGVudC5wdXNoKGZpbGVFZGl0KTtcblx0XHR9XG5cdFx0Y29uc3QgaW5mbyA9IHN0YXRlLnRvb2xDYWxscy5sb29rdXAoYmxvY2sudG9vbF91c2VfaWQpPy5pbmZvO1xuXHRcdGNvbnN0IHJlc3VsdFRleHQgPSBjb250ZW50XG5cdFx0XHQuZmlsdGVyKChjKTogYyBpcyB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0OyB0ZXh0OiBzdHJpbmcgfSA9PiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0KVxuXHRcdFx0Lm1hcChjID0+IGMudGV4dClcblx0XHRcdC5qb2luKCdcXG4nKTtcblx0XHRjb25zdCBwYXN0VGVuc2VNZXNzYWdlOiBTdHJpbmdPck1hcmtkb3duID0gaW5mb1xuXHRcdFx0PyBpbmZvLmlzQ2xpZW50VG9vbFxuXHRcdFx0XHQ/IGluZm8uZGlzcGxheU5hbWVcblx0XHRcdFx0OiBnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlKGluZm8udG9vbE5hbWUsIGluZm8uZGlzcGxheU5hbWUsIGluZm8ucGFyc2VkSW5wdXQsICFpc0Vycm9yLCByZXN1bHRUZXh0KVxuXHRcdFx0OiB0cmFja2VkLmlzQ2xpZW50VG9vbFxuXHRcdFx0XHQ/IHRyYWNrZWQudG9vbE5hbWVcblx0XHRcdFx0OiBgJHtnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUodHJhY2tlZC50b29sTmFtZSl9IGZpbmlzaGVkYDtcblx0XHQvLyBBIGRlbmllZC9jYW5jZWxsZWQgdG9vbCBzdXJmYWNlcyBhcyBhbiBgaXNfZXJyb3JgIHJlc3VsdCB3aG9zZSBjb250ZW50XG5cdFx0Ly8gaXMgdGhlIGRlbnkgYG1lc3NhZ2VgIHdlIHJldHVybmVkIGZyb20gYGNhblVzZVRvb2xgOyBjbGFzc2lmeSBpdCBzbyB0aGVcblx0XHQvLyB0ZWxlbWV0cnkgcmVwb3J0cyBgdXNlckNhbmNlbGxlZGAgcmF0aGVyIHRoYW4gYSBnZW5lcmljIGVycm9yLlxuXHRcdGNvbnN0IGRlbmlhbENvZGUgPSBpc0Vycm9yID8gY2xhdWRlVG9vbERlbmlhbENvZGUocmVzdWx0VGV4dCkgOiB1bmRlZmluZWQ7XG5cdFx0c2lnbmFscy5wdXNoKHtcblx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0cmVzb3VyY2U6IGNoYXQsXG5cdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxDb21wbGV0ZSxcblx0XHRcdFx0dHVybklkOiB0cmFja2VkLnR1cm5JZCxcblx0XHRcdFx0dG9vbENhbGxJZDogYmxvY2sudG9vbF91c2VfaWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6ICFpc0Vycm9yLFxuXHRcdFx0XHRcdHBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHRcdFx0Y29udGVudDogY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHQuLi4oZGVuaWFsQ29kZSA/IHsgZXJyb3I6IHsgbWVzc2FnZTogcmVzdWx0VGV4dCwgY29kZTogZGVuaWFsQ29kZSB9IH0gOiB7fSksXG5cdFx0XHRcdH0sXG5cdFx0XHR9LFxuXHRcdH0pO1xuXHRcdHN0YXRlLmNvbXBsZXRlVG9vbENhbGwoYmxvY2sudG9vbF91c2VfaWQpO1xuXHRcdC8vIFBoYXNlIDEyIFx1MjAxNCBmb3JlZ3JvdW5kIHN1YmFnZW50IGNvbXBsZXRpb24uIEEgdG9vbF9yZXN1bHQgZm9yIGFcblx0XHQvLyBrbm93biBzcGF3bmluZyBUYXNrL0FnZW50IHRvb2xfdXNlIGZpcmVzIGBzdWJhZ2VudF9jb21wbGV0ZWRgXG5cdFx0Ly8gVU5MRVNTIHRoZSBzcGF3bmluZyBlbnRyeSBoYXMgYmVlbiBmbGFnZ2VkIGJhY2tncm91bmQsIGluIHdoaWNoXG5cdFx0Ly8gY2FzZSBjb21wbGV0aW9uIGlzIGRlZmVycmVkIHRvIGEgbGF0ZXIgYHRhc2tfbm90aWZpY2F0aW9uYC5cblx0XHRjb25zdCBzcGF3biA9IHJlZ2lzdHJ5LmdldFNwYXduKGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHRpZiAoc3Bhd24gJiYgIXNwYXduLmJhY2tncm91bmQgJiYgc3Bhd24ubWFya0NvbXBsZXRlZCgpKSB7XG5cdFx0XHRzaWduYWxzLnB1c2goe1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnRfY29tcGxldGVkJyxcblx0XHRcdFx0Y2hhdCxcblx0XHRcdFx0dG9vbENhbGxJZDogYmxvY2sudG9vbF91c2VfaWQsXG5cdFx0XHR9KTtcblx0XHRcdHJlZ2lzdHJ5LnJlbW92ZVNwYXduKGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIHNpZ25hbHM7XG59XG5cbi8qKlxuICogUHJvamVjdCB0aGUgU0RLJ3MgYFRvb2xSZXN1bHRCbG9ja1BhcmFtLmNvbnRlbnRgIGludG8gdGhlIHByb3RvY29sJ3NcbiAqIHRleHQgY29udGVudCBzaGFwZS4gVGhlIFNESyBhY2NlcHRzIGVpdGhlciBhIGJhcmUgc3RyaW5nIChsZWdhY3lcbiAqIHNoYXBlKSBvciBhbiBhcnJheSBvZiB0eXBlZCBibG9ja3M7IG5vbi10ZXh0IGJsb2NrcyBhcmUgZHJvcHBlZFxuICogaGVyZS4gUGhhc2UgOCBmaWxlLWVkaXQgY29udGVudCBpcyBhcHBlbmRlZCBzZXBhcmF0ZWx5IGJ5XG4gKiB7QGxpbmsgbWFwVXNlck1lc3NhZ2V9IGZyb20ge0BsaW5rIENsYXVkZU1hcHBlclN0YXRlLnRha2VGaWxlRWRpdH0uXG4gKi9cbmZ1bmN0aW9uIGV4dHJhY3RUb29sUmVzdWx0Q29udGVudChjb250ZW50OiB1bmtub3duKTogeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH1bXSB8IHVuZGVmaW5lZCB7XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gW3sgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGNvbnRlbnQgfV07XG5cdH1cblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvdXQ6IHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQ7IHRleHQ6IHN0cmluZyB9W10gPSBbXTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBjb250ZW50KSB7XG5cdFx0aWYgKGlzVG9vbFJlc3VsdFRleHRCbG9jayhibG9jaykpIHtcblx0XHRcdG91dC5wdXNoKHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IGJsb2NrLnRleHQgfSk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBvdXQubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNUb29sUmVzdWx0VGV4dEJsb2NrKGJsb2NrOiB1bmtub3duKTogYmxvY2sgaXMgeyB0eXBlOiAndGV4dCc7IHRleHQ6IHN0cmluZyB9IHtcblx0aWYgKGJsb2NrID09PSBudWxsIHx8IHR5cGVvZiBibG9jayAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3QgY2FuZGlkYXRlID0gYmxvY2sgYXMgeyB0eXBlPzogdW5rbm93bjsgdGV4dD86IHVua25vd24gfTtcblx0cmV0dXJuIGNhbmRpZGF0ZS50eXBlID09PSAndGV4dCcgJiYgdHlwZW9mIGNhbmRpZGF0ZS50ZXh0ID09PSAnc3RyaW5nJztcbn1cblxuZnVuY3Rpb24gbWFwUmVzdWx0KFxuXHRtZXNzYWdlOiBFeHRyYWN0PFNES01lc3NhZ2UsIHsgdHlwZTogJ3Jlc3VsdCcgfT4sXG5cdHNlc3Npb246IFVSSSxcblx0dHVybklkOiBzdHJpbmcsXG5cdHR1cm5EdXJhdGlvbjogbnVtYmVyIHwgdW5kZWZpbmVkLFxuXHRzdGF0ZTogQ2xhdWRlTWFwcGVyU3RhdGUsXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuXHRyZWdpc3RyeTogU3ViYWdlbnRSZWdpc3RyeSxcbik6IEFnZW50U2lnbmFsW10ge1xuXHRjb25zdCBzaWduYWxzOiBBZ2VudFNpZ25hbFtdID0gW107XG5cdGlmIChtZXNzYWdlLnN1YnR5cGUgPT09ICdzdWNjZXNzJykge1xuXHRcdC8vIGBtb2RlbFVzYWdlYCBpcyBrZXllZCBieSBtb2RlbCBuYW1lOyBwaWNrIHRoZSBmaXJzdCBrZXkgYXMgdGhlXG5cdFx0Ly8gcmVwb3J0ZWQgbW9kZWwuIFBoYXNlIDYgdHVybnMgYXJlIHNpbmdsZS1tb2RlbDsgbXVsdGktbW9kZWxcblx0XHQvLyBhdHRyaWJ1dGlvbiBpcyBhIFBoYXNlIDcrIGNvbmNlcm4uXG5cdFx0Y29uc3QgbW9kZWxLZXkgPSBPYmplY3Qua2V5cyhtZXNzYWdlLm1vZGVsVXNhZ2UpWzBdO1xuXHRcdC8vIFBlci10dXJuIGNyZWRpdHMgYXJlIGRlbGliZXJhdGVseSBOT1QgZGVyaXZlZCBmcm9tXG5cdFx0Ly8gYHRvdGFsX2Nvc3RfdXNkYDogdGhhdCBpcyB0aGUgU0RLJ3MgQW50aHJvcGljLWxpc3QtcHJpY2UgVVNEXG5cdFx0Ly8gZXN0aW1hdGUsIG5vdCB3aGF0IENBUEkgYWN0dWFsbHkgYmlsbHMuIFJlYWwgQ29waWxvdCBjcmVkaXRzIGNvbWVcblx0XHQvLyBmcm9tIENBUEkncyBgY29waWxvdF91c2FnZS50b3RhbF9uYW5vX2FpdWAsIHdoaWNoIHRoZSBwcm94eVxuXHRcdC8vIGNhcHR1cmVzIGFuZCBgQ2xhdWRlQWdlbnRTZXNzaW9uYCBhdHRhY2hlcyB0byB0aGlzIGFjdGlvbiBhc1xuXHRcdC8vIGBfbWV0YS5jb3BpbG90VXNhZ2UudG90YWxOYW5vQWl1YCAodGhlIGtleSB0aGUgd29ya2JlbmNoIHJlYWRzKS5cblx0XHRzaWduYWxzLnB1c2goe1xuXHRcdFx0a2luZDogJ2FjdGlvbicsXG5cdFx0XHRyZXNvdXJjZTogc2Vzc2lvbixcblx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHR0eXBlOiBBY3Rpb25UeXBlLkNoYXRVc2FnZSxcblx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHR1c2FnZToge1xuXHRcdFx0XHRcdGlucHV0VG9rZW5zOiBtZXNzYWdlLnVzYWdlLmlucHV0X3Rva2Vucyxcblx0XHRcdFx0XHRvdXRwdXRUb2tlbnM6IG1lc3NhZ2UudXNhZ2Uub3V0cHV0X3Rva2Vucyxcblx0XHRcdFx0XHRjYWNoZVJlYWRUb2tlbnM6IG1lc3NhZ2UudXNhZ2UuY2FjaGVfcmVhZF9pbnB1dF90b2tlbnMsXG5cdFx0XHRcdFx0Li4uKG1vZGVsS2V5ID8geyBtb2RlbDogbW9kZWxLZXkgfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblxuXHQvLyBTdXJmYWNlIGV4ZWN1dGlvbiBlcnJvcnMgKGUuZy4gYW4gdXBzdHJlYW0gQ0FQSSBmYWlsdXJlIHJlbGF5ZWQgYnkgdGhlXG5cdC8vIHByb3h5KSBhcyBhIENoYXRFcnJvciBzbyB0aGUgdHVybiByZW5kZXJzIGFuIGVycm9yIGluc3RlYWQgb2Zcblx0Ly8gY29tcGxldGluZyBlbXB0eS4gTWlycm9ycyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzXG5cdC8vIGBoYW5kbGVSZXN1bHRNZXNzYWdlYC4gVGhlIHByb3h5IGVtYmVkcyBhIGBWU0NPREVfUFJPWFlfRVJST1JgIG1hcmtlciBpblxuXHQvLyB0aGUgZXJyb3IgdGV4dCwgd2hpY2ggd2UgZGVjb2RlIGludG8gYF9tZXRhYCBmb3IgcmljaCwgbG9jYWxpemVkXG5cdC8vIG1lc3NhZ2luZyAocmF0ZSBsaW1pdCwgcXVvdGEgKyB1cGdyYWRlIGFmZm9yZGFuY2UsIGV0Yy4pLlxuXHRjb25zdCBlcnJvclRleHQgPSBnZXRSZXN1bHRFcnJvclRleHQobWVzc2FnZSk7XG5cdGlmIChlcnJvclRleHQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHNpZ25hbHMucHVzaCh7XG5cdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdHJlc291cmNlOiBzZXNzaW9uLFxuXHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdEVycm9yLFxuXHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdGR1cmF0aW9uOiB0eXBlb2YgdHVybkR1cmF0aW9uID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodHVybkR1cmF0aW9uKSA/IE1hdGgubWF4KDAsIHR1cm5EdXJhdGlvbikgOiAwLFxuXHRcdFx0XHRlcnJvcjoge1xuXHRcdFx0XHRcdGVycm9yVHlwZTogbWVzc2FnZS5zdWJ0eXBlLFxuXHRcdFx0XHRcdC4uLmV4dHJhY3RGb3J3YXJkZWRFcnJvckluZm8oZXJyb3JUZXh0KSxcblx0XHRcdFx0fSxcblx0XHRcdH0sXG5cdFx0fSk7XG5cdH1cblx0Ly8gYENoYXRUdXJuQ29tcGxldGVgIGlzIGVtaXR0ZWQgYnkgdGhlIHNlc3Npb24gdmlhXG5cdC8vIGBDbGF1ZGVTZGtQaXBlbGluZS5vblR1cm5Db21wbGV0ZWAsIE5PVCBoZXJlLiBUaGUgcGlwZWxpbmUga25vd3Ncblx0Ly8gd2hlbiB0aGUgcHJvdG9jb2wgVHVybiBpcyB0cnVseSBkb25lIChxdWV1ZSBmdWxseSBkcmFpbmVkIHZzIGFuXG5cdC8vIGludGVybWVkaWF0ZSByZXN1bHQgZHVyaW5nIGEgc3RlZXJpbmcgcHJlZW1wdCBcdTIwMTQgQ09OVEVYVC5tZCBNMTApO1xuXHQvLyB0aGUgbWFwcGVyIGRvZXMgbm90IGhhdmUgdGhhdCBzdGF0ZS5cblx0c3RhdGUuY2xlYXJQZW5kaW5nVG9vbENhbGxzKGxvZ1NlcnZpY2UpO1xuXHQvLyBQaGFzZSAxMiBcdTIwMTQgZHJhaW4gb3JwaGFuZWQgc3ViYWdlbnQtc3Bhd25pbmcgZW50cmllcyAoZm9yZWdyb3VuZFxuXHQvLyBvbmx5OyBiYWNrZ3JvdW5kIGVudHJpZXMgc3Vydml2ZSBhY3Jvc3MgdHVybnMgYnkgZGVzaWduKS4gVGhlXG5cdC8vIHJlZ2lzdHJ5IG93bnMgdGhpcyBzdGF0ZTsgdGhlIG1hcHBlciBkcml2ZXMgdGhlIGRyYWluIGF0IHR1cm4gZW5kLlxuXHRmb3IgKGNvbnN0IG9ycGhhbiBvZiByZWdpc3RyeS5kcmFpbkZvcmVncm91bmRTcGF3bnMoKSkge1xuXHRcdGxvZ1NlcnZpY2Uud2FybihgW2NsYXVkZU1hcFNlc3Npb25FdmVudHNdIHR1cm4gZW5kZWQgd2l0aCBwZW5kaW5nIHN1YmFnZW50LXNwYXduaW5nIHRvb2xfdXNlICR7b3JwaGFuLnRvb2xVc2VJZH0gKGFnZW50SWQ9JHtvcnBoYW4uYWdlbnRJZCA/PyAnPHVucmVzb2x2ZWQ+J30pOyBkcm9wcGluZyBjcm9zcy1tZXNzYWdlIHN0YXRlYCk7XG5cdH1cblx0cmV0dXJuIHNpZ25hbHM7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgdGhlIGVycm9yIHRleHQgZnJvbSBhbiBTREsgcmVzdWx0IG1lc3NhZ2UgZm9yIHRoZSBlcnJvciBzdWJ0eXBlc1xuICogdGhlIHByb3h5IGNhbiByZWxheS4gTWlycm9ycyB0aGUgQ29waWxvdCBDaGF0IGV4dGVuc2lvbidzXG4gKiBgZ2V0UmVzdWx0RXJyb3JUZXh0YC5cbiAqL1xuZnVuY3Rpb24gZ2V0UmVzdWx0RXJyb3JUZXh0KG1lc3NhZ2U6IEV4dHJhY3Q8U0RLTWVzc2FnZSwgeyB0eXBlOiAncmVzdWx0JyB9Pik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChtZXNzYWdlLnN1YnR5cGUgPT09ICdzdWNjZXNzJykge1xuXHRcdHJldHVybiBtZXNzYWdlLmlzX2Vycm9yID8gbWVzc2FnZS5yZXN1bHQgOiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKG1lc3NhZ2Uuc3VidHlwZSA9PT0gJ2Vycm9yX2R1cmluZ19leGVjdXRpb24nKSB7XG5cdFx0cmV0dXJuIG1lc3NhZ2UuZXJyb3JzPy5qb2luKCdcXG4nKTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBtYXBTdHJlYW1FdmVudChcblx0ZXZlbnQ6IEV4dHJhY3Q8U0RLTWVzc2FnZSwgeyB0eXBlOiAnc3RyZWFtX2V2ZW50JyB9PlsnZXZlbnQnXSxcblx0Y2hhdDogVVJJLFxuXHR0dXJuSWQ6IHN0cmluZyxcblx0c3RhdGU6IENsYXVkZU1hcHBlclN0YXRlLFxuXHRsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0cGFyZW50VG9vbFVzZUlkOiBzdHJpbmcgfCBudWxsLFxuXHRyZWdpc3RyeTogU3ViYWdlbnRSZWdpc3RyeSxcblx0Y2xpZW50VG9vbE93bmVyOiAoKHRvb2xOYW1lOiBzdHJpbmcpID0+IHN0cmluZyB8IHVuZGVmaW5lZCkgfCB1bmRlZmluZWQsXG4pOiBBZ2VudFNpZ25hbFtdIHtcblx0c3dpdGNoIChldmVudC50eXBlKSB7XG5cdFx0Y2FzZSAnbWVzc2FnZV9zdGFydCc6XG5cdFx0XHRzdGF0ZS5yZXNldE1lc3NhZ2UoZXZlbnQubWVzc2FnZS5pZCk7XG5cdFx0XHRyZXR1cm4gW107XG5cblx0XHRjYXNlICdjb250ZW50X2Jsb2NrX3N0YXJ0Jzoge1xuXHRcdFx0Y29uc3QgYmxvY2sgPSBldmVudC5jb250ZW50X2Jsb2NrO1xuXHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0ZXh0Jykge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5NYXJrZG93bixcblx0XHRcdFx0XHRcdFx0aWQ6IG1ha2VDb250ZW50QmxvY2tQYXJ0SWQodHVybklkLCBzdGF0ZSwgZXZlbnQuaW5kZXgsIGxvZ1NlcnZpY2UpLFxuXHRcdFx0XHRcdFx0XHRjb250ZW50OiAnJyxcblx0XHRcdFx0XHRcdH0sXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlc3BvbnNlUGFydCxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHBhcnQ6IHtcblx0XHRcdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRcdFx0XHRcdGlkOiBtYWtlQ29udGVudEJsb2NrUGFydElkKHR1cm5JZCwgc3RhdGUsIGV2ZW50LmluZGV4LCBsb2dTZXJ2aWNlKSxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogJycsXG5cdFx0XHRcdFx0XHR9LFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGJsb2NrLnR5cGUgPT09ICd0b29sX3VzZScpIHtcblx0XHRcdFx0Ly8gUGhhc2UgMTAgXHUyMDE0IHN0cmlwIHRoZSBTREsncyBgbWNwX188c2VydmVyPl9fYCBwcmVmaXggZm9yXG5cdFx0XHRcdC8vIG91ciBpbi1wcm9jZXNzIGNsaWVudC10b29sIE1DUCBzZXJ2ZXIuIFRoZSBTREsgc3VyZmFjZXNcblx0XHRcdFx0Ly8gaW4tcHJvY2VzcyBNQ1AgdG9vbHMgdG8gdGhlIG1vZGVsIHdpdGggdGhhdCBwcmVmaXgsIGJ1dFxuXHRcdFx0XHQvLyB0aGUgd29ya2JlbmNoJ3MgcmVnaXN0ZXJlZCBjbGllbnQtdG9vbCBsaXN0IChhbmQgdGhlXG5cdFx0XHRcdC8vIE1DUCBoYW5kbGVyJ3MgY2xvc3VyZSkgdXNlIHRoZSB1bnByZWZpeGVkIG5hbWUuIFdpdGhvdXRcblx0XHRcdFx0Ly8gbm9ybWFsaXppbmcgYXQgdGhlIHNlYW0sIGBDaGF0VG9vbENhbGxSZWFkeWAgL1xuXHRcdFx0XHQvLyBgQ2hhdFRvb2xDYWxsQ29tcGxldGVgIHdvdWxkIGNhcnJ5IHRoZSBwcmVmaXhlZCBuYW1lXG5cdFx0XHRcdC8vIGFuZCB0aGUgd29ya2JlbmNoIHdvdWxkIG5ldmVyIHJlY29nbml6ZSB0aGVtIGFzIGNsaWVudFxuXHRcdFx0XHQvLyB0b29scy4gU0RLLW93bmVkIHRvb2xzIChSZWFkLCBXcml0ZSwgQmFzaCwgZXRjLikgYW5kXG5cdFx0XHRcdC8vIHN1YmFnZW50IHNwYXduIHRvb2xzIHBhc3MgdGhyb3VnaCB1bmNoYW5nZWQgYmVjYXVzZVxuXHRcdFx0XHQvLyB0aGV5IGRvbid0IGNhcnJ5IHRoZSBwcmVmaXguXG5cdFx0XHRcdGNvbnN0IHRvb2xOYW1lID0gc3RyaXBDbGllbnRUb29sTmFtZVByZWZpeChibG9jay5uYW1lKTtcblx0XHRcdFx0Y29uc3QgaXNDbGllbnRUb29sID0gaGFzQ2xpZW50VG9vbE5hbWVQcmVmaXgoYmxvY2submFtZSk7XG5cdFx0XHRcdHN0YXRlLnN0YXJ0VG9vbEJsb2NrKGV2ZW50LmluZGV4LCBibG9jay5pZCwgdG9vbE5hbWUsIHR1cm5JZCwgaXNDbGllbnRUb29sKTtcblx0XHRcdFx0Ly8gUGhhc2UgMTIgXHUyMDE0IHN1YmFnZW50IGNvcnJlbGF0aW9uIGJvb2trZWVwaW5nLiBFaXRoZXIgdGhpc1xuXHRcdFx0XHQvLyB0b29sX3VzZSBpcyBhdCB0aGUgdG9wIGxldmVsIGFuZCAoaWYgVGFzay9BZ2VudCkgc3Bhd25zIGFcblx0XHRcdFx0Ly8gbmV3IHN1YmFnZW50LCBvciBpdCBpcyBpbm5lciBhbmQgd2UgcmVjb3JkIGl0cyBlZGdlIHRvIHRoZVxuXHRcdFx0XHQvLyBwYXJlbnQuIFRoZXkgYXJlIG11dHVhbGx5IGV4Y2x1c2l2ZSAoYSBUYXNrIGNhbGwgaW5zaWRlIGFcblx0XHRcdFx0Ly8gc3ViYWdlbnQgaXMgaXRzZWxmIGFuIGlubmVyIHRvb2xfdXNlOyB0aGUgcmVzb2x2ZXIgY2hhaW5cblx0XHRcdFx0Ly8gaGFuZGxlcyBuZXN0ZWQgc3Bhd25zIGJ5IGZvbGxvd2luZyB0aGUgcGFyZW50IGNoYWluKS5cblx0XHRcdFx0Ly8gR2F0ZWQgb24gYCFpc0NsaWVudFRvb2xgIHNvIGEgd29ya2JlbmNoIHRvb2wgbmFtZWQgYFRhc2tgIC9cblx0XHRcdFx0Ly8gYEFnZW50YCBjYW5ub3QgaW1wZXJzb25hdGUgdGhlIFNESydzIHN1YmFnZW50LXNwYXduIHRvb2xzLlxuXHRcdFx0XHRjb25zdCBpc1N1YmFnZW50U3Bhd24gPSAhaXNDbGllbnRUb29sICYmIFNVQkFHRU5UX1NQQVdOSU5HX1RPT0xfTkFNRVMuaGFzKHRvb2xOYW1lKTtcblx0XHRcdFx0aWYgKHBhcmVudFRvb2xVc2VJZCA9PT0gbnVsbCkge1xuXHRcdFx0XHRcdGlmIChpc1N1YmFnZW50U3Bhd24pIHtcblx0XHRcdFx0XHRcdHJlZ2lzdHJ5LnJlY29yZFNwYXduKGJsb2NrLmlkKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0cmVnaXN0cnkubm90ZUlubmVyVG9vbChibG9jay5pZCwgcGFyZW50VG9vbFVzZUlkKTtcblx0XHRcdFx0fVxuXHRcdFx0XHQvLyBQaGFzZSA4LjUgXHUyMDE0IGBfbWV0YS50b29sS2luZGAgZHJpdmVzIHRoZSB3b3JrYmVuY2gncyB0ZXJtaW5hbCAvXG5cdFx0XHRcdC8vIHNlYXJjaCAvIHN1YmFnZW50IHJlbmRlcmVycy4gU2luZ2xlIHdyaXRlIGF0IHRoZSB0b29sLW9wZW5cblx0XHRcdFx0Ly8gc2VhbTsgdGhlIHJlZHVjZXIgY2FycmllcyBgX21ldGFgIGZvcndhcmQgdG8gYWxsIHN1YnNlcXVlbnRcblx0XHRcdFx0Ly8gc3RhdGUgdHJhbnNpdGlvbnMgKEQ2KS4gU3ViYWdlbnQgbWV0YSBmcm9tIFBoYXNlIDEyIGlzIG5vd1xuXHRcdFx0XHQvLyBwcm9kdWNlZCBieSBgYnVpbGRDbGF1ZGVUb29sTWV0YWAgYmVjYXVzZVxuXHRcdFx0XHQvLyBgZ2V0Q2xhdWRlVG9vbEtpbmQoJ1Rhc2snKSA9PT0gJ3N1YmFnZW50J2AuXG5cdFx0XHRcdGNvbnN0IG1ldGEgPSBpc0NsaWVudFRvb2wgPyB1bmRlZmluZWQgOiBidWlsZENsYXVkZVRvb2xNZXRhKHRvb2xOYW1lKTtcblx0XHRcdFx0Y29uc3QgdG9vbENsaWVudElkID0gaXNDbGllbnRUb29sID8gY2xpZW50VG9vbE93bmVyPy4odG9vbE5hbWUpIDogdW5kZWZpbmVkO1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFRvb2xDYWxsU3RhcnQsXG5cdFx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0XHR0b29sQ2FsbElkOiBibG9jay5pZCxcblx0XHRcdFx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0XHRcdFx0ZGlzcGxheU5hbWU6IGlzQ2xpZW50VG9vbCA/IHRvb2xOYW1lIDogZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKSxcblx0XHRcdFx0XHRcdC4uLih0b29sQ2xpZW50SWQgPyB7IGNvbnRyaWJ1dG9yOiB7IGtpbmQ6IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCwgY2xpZW50SWQ6IHRvb2xDbGllbnRJZCB9IH0gOiB7fSksXG5cdFx0XHRcdFx0XHQuLi4obWV0YSA/IHsgX21ldGE6IG1ldGEgfSA6IHt9KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBbXTtcblx0XHR9XG5cblx0XHRjYXNlICdjb250ZW50X2Jsb2NrX2RlbHRhJzoge1xuXHRcdFx0aWYgKGV2ZW50LmRlbHRhLnR5cGUgPT09ICd0ZXh0X2RlbHRhJykge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdERlbHRhLFxuXHRcdFx0XHRcdFx0dHVybklkLFxuXHRcdFx0XHRcdFx0cGFydElkOiBtYWtlQ29udGVudEJsb2NrUGFydElkKHR1cm5JZCwgc3RhdGUsIGV2ZW50LmluZGV4LCBsb2dTZXJ2aWNlKSxcblx0XHRcdFx0XHRcdGNvbnRlbnQ6IGV2ZW50LmRlbHRhLnRleHQsXG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fV07XG5cdFx0XHR9XG5cdFx0XHRpZiAoZXZlbnQuZGVsdGEudHlwZSA9PT0gJ3RoaW5raW5nX2RlbHRhJykge1xuXHRcdFx0XHRyZXR1cm4gW3tcblx0XHRcdFx0XHRraW5kOiAnYWN0aW9uJyxcblx0XHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0XHRhY3Rpb246IHtcblx0XHRcdFx0XHRcdHR5cGU6IEFjdGlvblR5cGUuQ2hhdFJlYXNvbmluZyxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHBhcnRJZDogbWFrZUNvbnRlbnRCbG9ja1BhcnRJZCh0dXJuSWQsIHN0YXRlLCBldmVudC5pbmRleCwgbG9nU2VydmljZSksXG5cdFx0XHRcdFx0XHRjb250ZW50OiBldmVudC5kZWx0YS50aGlua2luZyxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9XTtcblx0XHRcdH1cblx0XHRcdGlmIChldmVudC5kZWx0YS50eXBlID09PSAnaW5wdXRfanNvbl9kZWx0YScpIHtcblx0XHRcdFx0Y29uc3QgdHJhY2tlZCA9IHN0YXRlLmdldEFjdGl2ZVRvb2xCbG9jayhldmVudC5pbmRleCk7XG5cdFx0XHRcdGlmICghdHJhY2tlZCkge1xuXHRcdFx0XHRcdGxvZ1NlcnZpY2Uud2FybihgW2NsYXVkZU1hcFNlc3Npb25FdmVudHNdIGlucHV0X2pzb25fZGVsdGEgZm9yIHVua25vd24gY29udGVudC1ibG9jayBpbmRleCAke2V2ZW50LmluZGV4fWApO1xuXHRcdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdFx0fVxuXHRcdFx0XHRzdGF0ZS5hcHBlbmRUb29sQmxvY2tJbnB1dERlbHRhKGV2ZW50LmluZGV4LCBldmVudC5kZWx0YS5wYXJ0aWFsX2pzb24pO1xuXHRcdFx0XHRpZiAoIXRyYWNrZWQuaXNDbGllbnRUb29sICYmIGlzQ2xhdWRlRmlsZUVkaXRUb29sKHRyYWNrZWQudG9vbE5hbWUpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdXBkYXRlID0gc3RhdGUudG9vbENhbGxzLnN0cmVhbWluZ0lucHV0VXBkYXRlKHRyYWNrZWQudG9vbFVzZUlkKTtcblx0XHRcdFx0XHRpZiAoIXVwZGF0ZSkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gW2ZpbGVFZGl0VG9vbERlbHRhKGNoYXQsIHR1cm5JZCwgdHJhY2tlZC50b29sVXNlSWQsIHVwZGF0ZS5pbnZvY2F0aW9uTWVzc2FnZSldO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiBbe1xuXHRcdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRcdHJlc291cmNlOiBjaGF0LFxuXHRcdFx0XHRcdGFjdGlvbjoge1xuXHRcdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxEZWx0YSxcblx0XHRcdFx0XHRcdHR1cm5JZCxcblx0XHRcdFx0XHRcdHRvb2xDYWxsSWQ6IHRyYWNrZWQudG9vbFVzZUlkLFxuXHRcdFx0XHRcdFx0Y29udGVudDogZXZlbnQuZGVsdGEucGFydGlhbF9qc29uLFxuXHRcdFx0XHRcdH0sXG5cdFx0XHRcdH1dO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIFtdO1xuXHRcdH1cblxuXHRcdGNhc2UgJ2NvbnRlbnRfYmxvY2tfc3RvcCc6IHtcblx0XHRcdGNvbnN0IHRyYWNrZWQgPSBzdGF0ZS5nZXRBY3RpdmVUb29sQmxvY2soZXZlbnQuaW5kZXgpO1xuXHRcdFx0Y29uc3QgZmluYWxTdHJlYW1pbmdVcGRhdGUgPSB0cmFja2VkICYmICF0cmFja2VkLmlzQ2xpZW50VG9vbCAmJiBpc0NsYXVkZUZpbGVFZGl0VG9vbCh0cmFja2VkLnRvb2xOYW1lKVxuXHRcdFx0XHQ/IHN0YXRlLnRvb2xDYWxscy5zdHJlYW1pbmdJbnB1dFVwZGF0ZSh0cmFja2VkLnRvb2xVc2VJZCwgdHJ1ZSlcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRzdGF0ZS5maW5hbGl6ZVRvb2xCbG9jayhldmVudC5pbmRleCk7XG5cdFx0XHRzdGF0ZS5lbmRUb29sQmxvY2soZXZlbnQuaW5kZXgpO1xuXHRcdFx0aWYgKCF0cmFja2VkKSB7XG5cdFx0XHRcdHJldHVybiBbXTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGVudHJ5ID0gc3RhdGUudG9vbENhbGxzLmxvb2t1cCh0cmFja2VkLnRvb2xVc2VJZCk7XG5cdFx0XHRjb25zdCBpbmZvID0gZW50cnk/LmluZm87XG5cdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0cmV0dXJuIFtdO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgbWV0YSA9IHRyYWNrZWQuaXNDbGllbnRUb29sID8gdW5kZWZpbmVkIDogYnVpbGRDbGF1ZGVUb29sTWV0YSh0cmFja2VkLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHNpZ25hbHM6IEFnZW50U2lnbmFsW10gPSBbXTtcblx0XHRcdGlmIChmaW5hbFN0cmVhbWluZ1VwZGF0ZSkge1xuXHRcdFx0XHRzaWduYWxzLnB1c2goZmlsZUVkaXRUb29sRGVsdGEoY2hhdCwgdHVybklkLCB0cmFja2VkLnRvb2xVc2VJZCwgZmluYWxTdHJlYW1pbmdVcGRhdGUuaW52b2NhdGlvbk1lc3NhZ2UpKTtcblx0XHRcdH1cblx0XHRcdHNpZ25hbHMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6ICdhY3Rpb24nLFxuXHRcdFx0XHRyZXNvdXJjZTogY2hhdCxcblx0XHRcdFx0YWN0aW9uOiB7XG5cdFx0XHRcdFx0dHlwZTogQWN0aW9uVHlwZS5DaGF0VG9vbENhbGxSZWFkeSxcblx0XHRcdFx0XHR0dXJuSWQsXG5cdFx0XHRcdFx0dG9vbENhbGxJZDogdHJhY2tlZC50b29sVXNlSWQsXG5cdFx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGluZm8uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0XHRcdFx0Li4uKGluZm8udG9vbElucHV0ICE9PSB1bmRlZmluZWQgPyB7IHRvb2xJbnB1dDogaW5mby50b29sSW5wdXQgfSA6IHt9KSxcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0XHQuLi4obWV0YSA/IHsgX21ldGE6IG1ldGEgfSA6IHt9KSxcblx0XHRcdFx0fSxcblx0XHRcdH0pO1xuXHRcdFx0cmV0dXJuIHNpZ25hbHM7XG5cdFx0fVxuXG5cdFx0Y2FzZSAnbWVzc2FnZV9kZWx0YSc6XG5cdFx0Y2FzZSAnbWVzc2FnZV9zdG9wJzpcblx0XHRcdHJldHVybiBbXTtcblxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gW107XG5cdH1cbn1cblxuLyoqXG4gKiBCdWlsZCB0aGUge0BsaW5rIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd259L3tAbGluayBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZ31cbiAqIGlkIGZvciBhIHRleHQgb3IgdGhpbmtpbmcgY29udGVudCBibG9jay4gUXVhbGlmeWluZyB3aXRoIHRoZSBTREsnc1xuICogcGVyLW1lc3NhZ2UgaWQgaXMgcmVxdWlyZWQ6IGEgc2luZ2xlIHR1cm4gY2FuIHNwYW4gbXVsdGlwbGUgU0RLXG4gKiBtZXNzYWdlcyAoZS5nLiBhc3Npc3RhbnQgbWVzc2FnZSBcdTIxOTIgdG9vbF91c2UgXHUyMTkyIHRvb2xfcmVzdWx0IFx1MjE5MiBhc3Npc3RhbnRcbiAqIG1lc3NhZ2UpIGFuZCBgZXZlbnQuaW5kZXhgIHJlc2V0cyB0byAwIG9uIGVhY2ggbmV3IGBtZXNzYWdlX3N0YXJ0YC5cbiAqIFdpdGhvdXQgdGhlIG1lc3NhZ2UtaWQgcXVhbGlmaWVyLCBhIGB0ZXh0QDBgIGJsb2NrIGluIHRoZSBzZWNvbmRcbiAqIG1lc3NhZ2UgY29sbGlkZXMgd2l0aCBhIGB0aGlua2luZ0AwYCBibG9jayBpbiB0aGUgZmlyc3QgYW5kIHRoZVxuICogcmVkdWNlciB0cmVhdHMgaXQgYXMgYSBkdXBsaWNhdGUsIGRyb3BwaW5nIHRoZSBmb2xsb3ctdXAgdGV4dC5cbiAqXG4gKiBJZiBgY3VycmVudE1lc3NhZ2VJZGAgaXMgbWlzc2luZyB3ZSBmYWxsIGJhY2sgdG8gdGhlIGxlZ2FjeVxuICogYCR7dHVybklkfSMke2luZGV4fWAgZm9ybSBhbmQgd2FybiBcdTIwMTQgdGhlIFNESyBwcm90b2NvbCBndWFyYW50ZWVzXG4gKiBgbWVzc2FnZV9zdGFydGAgcHJlY2VkZXMgYW55IGNvbnRlbnQgYmxvY2ssIHNvIHRoZSBhYnNlbmNlIGlzIGEgcmVhbFxuICogYnVnLCBub3QgYSB0cmFuc3BvcnQgcmVvcmRlci5cbiAqL1xuZnVuY3Rpb24gbWFrZUNvbnRlbnRCbG9ja1BhcnRJZChcblx0dHVybklkOiBzdHJpbmcsXG5cdHN0YXRlOiBDbGF1ZGVNYXBwZXJTdGF0ZSxcblx0aW5kZXg6IG51bWJlcixcblx0bG9nU2VydmljZTogSUxvZ1NlcnZpY2UsXG4pOiBzdHJpbmcge1xuXHRjb25zdCBtZXNzYWdlSWQgPSBzdGF0ZS5nZXRDdXJyZW50TWVzc2FnZUlkKCk7XG5cdGlmIChtZXNzYWdlSWQgPT09IHVuZGVmaW5lZCkge1xuXHRcdGxvZ1NlcnZpY2Uud2FybihgW2NsYXVkZU1hcFNlc3Npb25FdmVudHNdIGNvbnRlbnQgYmxvY2sgYXQgaW5kZXggJHtpbmRleH0gYXJyaXZlZCBiZWZvcmUgbWVzc2FnZV9zdGFydDsgdXNpbmcgdHVybi1zY29wZWQgaWRgKTtcblx0XHRyZXR1cm4gYCR7dHVybklkfSMke2luZGV4fWA7XG5cdH1cblx0cmV0dXJuIGAke3R1cm5JZH0jJHttZXNzYWdlSWR9IyR7aW5kZXh9YDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQU9BLFNBQVMsZ0JBQWtDO0FBRTNDLFNBQVMsa0JBQWtCO0FBQzNCLFNBQVMsa0JBQWtCLDZCQUFxRjtBQUNoSCxTQUFTLGlDQUFpQztBQUMxQyxTQUFTLGtDQUFrQywyQkFBMkIsMEJBQTBCLDhCQUE4QixxQkFBcUI7QUFFbkosU0FBUywyQkFBMkIsK0JBQStCO0FBQ25FLFNBQVMscUJBQXFCLDJCQUEyQiwwQkFBMEIsNEJBQTRCO0FBQy9HLFNBQVMsNEJBQTRCO0FBQ3JDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsNEJBQTRCLCtCQUFzRDtBQThCcEYsTUFBTSxrQkFBa0I7QUFBQSxFQUF4QjtBQUNOLFNBQWlCLG9CQUFvQixvQkFBSSxJQUE0RTtBQVFySDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBLFNBQVMsWUFBWSxJQUFJLHVCQUF1QjtBQVloRDtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxTQUFpQixzQkFBc0Isb0JBQUksSUFBdUM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQSxFQU9sRixhQUFhLFdBQXlCO0FBQ3JDLFNBQUssa0JBQWtCLE1BQU07QUFDN0IsU0FBSyxvQkFBb0I7QUFBQSxFQUMxQjtBQUFBLEVBRUEsc0JBQTBDO0FBQ3pDLFdBQU8sS0FBSztBQUFBLEVBQ2I7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUEsRUFPQSxlQUFlLE9BQWUsV0FBbUIsVUFBa0IsUUFBZ0IsZUFBZSxPQUFhO0FBQzlHLFNBQUssa0JBQWtC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QUFBLE1BQ0Y7QUFDQSxhQUFPLENBQUM7QUFBQSxJQUNUO0FBQUEsSUFFQSxLQUFLLHNCQUFzQjtBQUMxQixZQUFNLFVBQVUsTUFBTSxtQkFBbUIsTUFBTSxLQUFLO0FBQ3BELFlBQU0sdUJBQXVCLFdBQVcsQ0FBQyxRQUFRLGdCQUFnQixxQkFBcUIsUUFBUSxRQUFRLElBQ25HLE1BQU0sVUFBVSxxQkFBcUIsUUFBUSxXQUFXLElBQUksSUFDNUQ7QUFDSCxZQUFNLGtCQUFrQixNQUFNLEtBQUs7QUFDbkMsWUFBTSxhQUFhLE1BQU0sS0FBSztBQUM5QixVQUFJLENBQUMsU0FBUztBQUNiLGVBQU8sQ0FBQztBQUFBLE1BQ1Q7QUFDQSxZQUFNLFFBQVEsTUFBTSxVQUFVLE9BQU8sUUFBUSxTQUFTO0FBQ3RELFlBQU0sT0FBTyxPQUFPO0FBQ3BCLFVBQUksQ0FBQyxNQUFNO0FBQ1YsZUFBTyxDQUFDO0FBQUEsTUFDVDtBQUNBLFlBQU0sT0FBTyxRQUFRLGVBQWUsU0FBWSxvQkFBb0IsUUFBUSxRQUFRO0FBQ3BGLFlBQU0sVUFBeUIsQ0FBQztBQUNoQyxVQUFJLHNCQUFzQjtBQUN6QixnQkFBUSxLQUFLLGtCQUFrQixNQUFNLFFBQVEsUUFBUSxXQUFXLHFCQUFxQixpQkFBaUIsQ0FBQztBQUFBLE1BQ3hHO0FBQ0EsY0FBUSxLQUFLO0FBQUEsUUFDWixNQUFNO0FBQUEsUUFDTixVQUFVO0FBQUEsUUFDVixRQUFRO0FBQUEsVUFDUCxNQUFNLFdBQVc7QUFBQSxVQUNqQjtBQUFBLFVBQ0EsWUFBWSxRQUFRO0FBQUEsVUFDcEIsbUJBQW1CLEtBQUs7QUFBQSxVQUN4QixHQUFJLEtBQUssY0FBYyxTQUFZLEVBQUUsV0FBVyxLQUFLLFVBQVUsSUFBSSxDQUFDO0FBQUEsVUFDcEUsV0FBVywyQkFBMkI7QUFBQSxVQUN0QyxHQUFJLE9BQU8sRUFBRSxPQUFPLEtBQUssSUFBSSxDQUFDO0FBQUEsUUFDL0I7QUFBQSxNQUNELENBQUM7QUFDRCxhQUFPO0FBQUEsSUFDUjtBQUFBLElBRUEsS0FBSztBQUFBLElBQ0wsS0FBSztBQUNKLGFBQU8sQ0FBQztBQUFBLElBRVQ7QUFDQyxhQUFPLENBQUM7QUFBQSxFQUNWO0FBQ0Q7QUFpQkEsU0FBUyx1QkFDUixRQUNBLE9BQ0EsT0FDQSxZQUNTO0FBQ1QsUUFBTSxZQUFZLE1BQU0sb0JBQW9CO0FBQzVDLE1BQUksY0FBYyxRQUFXO0FBQzVCLGVBQVcsS0FBSyxtREFBbUQsS0FBSyxxREFBcUQ7QUFDN0gsV0FBTyxHQUFHLE1BQU0sSUFBSSxLQUFLO0FBQUEsRUFDMUI7QUFDQSxTQUFPLEdBQUcsTUFBTSxJQUFJLFNBQVMsSUFBSSxLQUFLO0FBQ3ZDOyIsCiAgIm5hbWVzIjogWyJjb250ZW50Il0KfQo=
