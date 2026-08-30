import { localize } from "../../../../nls.js";
import {
  ResponsePartKind,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallStatus,
  ToolResultContentType,
  TurnState,
  MessageKind
} from "../../common/state/protocol/state.js";
import { buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { readToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { formatGenericToolInput } from "../../common/streamingToolCallDisplay.js";
import { buildClaudeToolMeta, getClaudeInvocationMessage, getClaudePastTenseMessage, getClaudeToolDisplayName, getClaudeToolInputString } from "./claudeToolDisplay.js";
import { hasClientToolNamePrefix, stripClientToolNamePrefix } from "./clientTools/claudeClientToolMcpServer.js";
function mapSessionMessagesToTurns(messages, session, logService) {
  const builder = new ReplayBuilder(session, logService);
  for (const msg of messages) {
    const parsed = parseSessionMessage(msg);
    if (parsed === void 0) {
      continue;
    }
    builder.consume(parsed);
  }
  return builder.finish();
}
function resolveForkAnchorUuid(messages, turnId) {
  let turnOpen = false;
  let seenTarget = false;
  let lastAssistantUuid;
  for (const msg of messages) {
    const parsed = parseSessionMessage(msg);
    if (parsed === void 0) {
      continue;
    }
    if (parsed.kind === "user-text") {
      if (seenTarget) {
        break;
      }
      turnOpen = true;
      if (parsed.uuid === turnId) {
        seenTarget = true;
      }
    } else if (parsed.kind === "assistant") {
      if (!turnOpen) {
        turnOpen = true;
        if (parsed.uuid === turnId) {
          seenTarget = true;
        }
      }
      if (seenTarget) {
        lastAssistantUuid = parsed.uuid;
      }
    }
  }
  if (!seenTarget) {
    return void 0;
  }
  return lastAssistantUuid;
}
function parseSessionMessage(msg) {
  const timestamp = readTimestamp(msg);
  switch (msg.type) {
    case "user":
      return parseUserMessage(msg, timestamp);
    case "assistant":
      return parseAssistantMessage(msg, timestamp);
    case "system":
      return parseSystemMessage(msg, timestamp);
    default:
      return void 0;
  }
}
function readTimestamp(msg) {
  if (typeof msg.timestamp !== "string") {
    return void 0;
  }
  const timestamp = Date.parse(msg.timestamp);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : void 0;
}
function parseUserMessage(msg, timestamp) {
  const content = readUserContent(msg.message);
  if (content === void 0) {
    return void 0;
  }
  if (isCliEchoContent(content)) {
    return void 0;
  }
  if (typeof content === "string") {
    return { kind: "user-text", uuid: msg.uuid, text: content, timestamp };
  }
  const textBlocks = content.filter((b) => b.type === "text");
  if (textBlocks.length === 0) {
    const results = content.filter((b) => b.type === "tool_result");
    return results.length > 0 ? { kind: "user-tool-results", uuid: msg.uuid, results, timestamp } : void 0;
  }
  return { kind: "user-text", uuid: msg.uuid, text: textBlocks.map((b) => b.text).join("\n"), timestamp };
}
function parseAssistantMessage(msg, timestamp) {
  const blocks = readAssistantBlocks(msg.message);
  if (blocks === void 0 || blocks.length === 0) {
    return void 0;
  }
  return { kind: "assistant", uuid: msg.uuid, blocks, isInner: msg.parent_tool_use_id !== null, timestamp };
}
function parseSystemMessage(msg, timestamp) {
  const subtype = readSystemSubtype(msg.message);
  if (subtype === void 0 || !ALLOWED_SYSTEM_SUBTYPES.has(subtype)) {
    return void 0;
  }
  const text = readSystemText(msg.message) ?? `[${subtype}]`;
  return { kind: "system-notification", uuid: msg.uuid, subtype, text, timestamp };
}
const ALLOWED_SYSTEM_SUBTYPES = /* @__PURE__ */ new Set([
  "compact_boundary",
  "notification"
]);
const CLI_ECHO_MARKER_PATTERN = /^<(command-name|command-message|command-args|local-command-stdout|local-command-stderr|local-command-caveat)>/;
function missingPromptPlaceholder() {
  return localize("claude.replay.missingPrompt", "Message content could not be retrieved");
}
class ReplayBuilder {
  constructor(_session, _logService) {
    this._session = _session;
    this._logService = _logService;
    this._turns = [];
    /**
     * Cross-turn tool-use tracking. Keyed by `tool_use_id`:
     * - `turnId` — the announcing turn (so a late `tool_result` in a
     *   later `user` envelope can attach back to the right turn per M7).
     * - `parsedInput` — the original `tool_use.input`, looked up at
     *   `_attachToolResult` so the past-tense message can include the
     *   original parameters. Mirrors the live mapper's `_toolCallInfo`
     *   pattern but simpler (replay has the full input synchronously on
     *   the `tool_use` block).
     */
    this._toolUses = /* @__PURE__ */ new Map();
    /** Turns opened from a leading assistant envelope because the prompt was missing. Reported once by {@link finish}. */
    this._recoveredPromptlessTurns = 0;
    /** `tool_result` blocks whose announcing `tool_use` was not in the slice. Reported once by {@link finish}. */
    this._orphanToolResults = 0;
  }
  consume(msg) {
    switch (msg.kind) {
      case "user-text":
        this._closeActive();
        this._active = {
          id: msg.uuid,
          userText: msg.text,
          startedAt: msg.timestamp,
          responseParts: [],
          pendingToolUseIds: /* @__PURE__ */ new Set(),
          toolCallParts: /* @__PURE__ */ new Map()
        };
        return;
      case "user-tool-results": {
        let updatesActiveTurn = false;
        for (const block of msg.results) {
          updatesActiveTurn = this._attachToolResult(block) === this._active?.id || updatesActiveTurn;
        }
        if (updatesActiveTurn && this._active && msg.timestamp) {
          this._active.lastResponseAt = msg.timestamp;
        }
        return;
      }
      case "assistant":
        this._consumeAssistant(msg);
        return;
      case "system-notification":
        if (this._active === void 0) {
          return;
        }
        this._active.responseParts.push({
          kind: ResponsePartKind.SystemNotification,
          content: msg.text
        });
        if (msg.timestamp) {
          this._active.lastResponseAt = msg.timestamp;
        }
        return;
    }
  }
  finish() {
    this._closeActive();
    if (this._recoveredPromptlessTurns > 0 || this._orphanToolResults > 0) {
      this._logService.warn(`[claudeReplayMapper] incomplete transcript for ${this._session.toString()}: ${this._recoveredPromptlessTurns} turn(s) recovered without their prompt, ${this._orphanToolResults} orphaned tool_result(s)`);
    }
    return this._turns;
  }
  _consumeAssistant(msg) {
    if (this._active === void 0) {
      if (!msg.isInner) {
        this._recoveredPromptlessTurns++;
      }
      this._active = {
        id: msg.uuid,
        userText: msg.isInner ? "" : missingPromptPlaceholder(),
        startedAt: msg.timestamp,
        responseParts: [],
        pendingToolUseIds: /* @__PURE__ */ new Set(),
        toolCallParts: /* @__PURE__ */ new Map()
      };
    }
    let textPartCounter = 0;
    let reasoningPartCounter = 0;
    for (const block of msg.blocks) {
      if (block.type === "text" && typeof block.text === "string") {
        this._active.responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: `${this._active.id}#${msg.uuid}#text-${textPartCounter++}`,
          content: block.text
        });
      } else if (block.type === "thinking" && typeof block.thinking === "string") {
        this._active.responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: `${this._active.id}#${msg.uuid}#thinking-${reasoningPartCounter++}`,
          content: block.thinking
        });
      } else if (block.type === "tool_use" && typeof block.id === "string" && typeof block.name === "string") {
        this._openToolUse(block.id, stripClientToolNamePrefix(block.name), block.input, hasClientToolNamePrefix(block.name));
      }
    }
    if (msg.timestamp) {
      this._active.lastResponseAt = msg.timestamp;
    }
  }
  _openToolUse(toolUseId, toolName, input, isClientTool) {
    if (this._active === void 0) {
      return;
    }
    const displayName = isClientTool ? toolName : getClaudeToolDisplayName(toolName);
    const parsedInput = input !== null && typeof input === "object" ? input : void 0;
    const meta = isClientTool ? void 0 : buildClaudeToolMeta(toolName);
    const placeholder = {
      status: ToolCallStatus.Cancelled,
      toolCallId: toolUseId,
      toolName,
      displayName,
      invocationMessage: isClientTool ? displayName : getClaudeInvocationMessage(toolName, displayName, parsedInput),
      toolInput: parsedInput !== void 0 ? isClientTool ? formatGenericToolInput(parsedInput) : getClaudeToolInputString(toolName, parsedInput) : typeof input === "string" ? input : input !== void 0 ? safeStringify(input) : void 0,
      reason: ToolCallCancellationReason.Skipped,
      ...meta ? { _meta: meta } : {}
    };
    const part = {
      kind: ResponsePartKind.ToolCall,
      toolCall: placeholder
    };
    this._active.responseParts.push(part);
    this._active.toolCallParts.set(toolUseId, part);
    this._active.pendingToolUseIds.add(toolUseId);
    this._toolUses.set(toolUseId, { turnId: this._active.id, parsedInput, isClientTool });
  }
  _attachToolResult(block) {
    const entry = this._toolUses.get(block.tool_use_id);
    if (entry === void 0) {
      this._orphanToolResults++;
      return void 0;
    }
    const announcingTurnId = entry.turnId;
    const part = this._findToolCallPart(announcingTurnId, block.tool_use_id);
    if (part === void 0) {
      return void 0;
    }
    const isError = block.is_error;
    const previousState = part.toolCall;
    const isSubagent = readToolCallMeta(previousState).toolKind === "subagent";
    const content = extractToolResultContent(block.content) ?? [];
    const resultText = content.filter((c) => c.type === ToolResultContentType.Text).map((c) => c.text).join("\n");
    if (isSubagent) {
      content.push({
        type: ToolResultContentType.Subagent,
        resource: buildSubagentSessionUri(this._session.toString(), previousState.toolCallId),
        title: previousState.displayName
      });
    }
    const completed = {
      status: ToolCallStatus.Completed,
      toolCallId: previousState.toolCallId,
      toolName: previousState.toolName,
      displayName: previousState.displayName,
      invocationMessage: previousState.invocationMessage ?? previousState.displayName,
      toolInput: previousState.status === ToolCallStatus.Streaming ? void 0 : previousState.toolInput,
      confirmed: ToolCallConfirmationReason.NotNeeded,
      success: !isError,
      pastTenseMessage: entry.isClientTool ? previousState.displayName : getClaudePastTenseMessage(previousState.toolName, previousState.displayName, entry.parsedInput, !isError, resultText),
      content: content.length > 0 ? content : void 0,
      ...previousState._meta ? { _meta: previousState._meta } : {}
    };
    part.toolCall = completed;
    if (this._active?.id === announcingTurnId) {
      this._active.pendingToolUseIds.delete(block.tool_use_id);
    }
    return announcingTurnId;
  }
  _findToolCallPart(turnId, toolUseId) {
    if (this._active && this._active.id === turnId) {
      return this._active.toolCallParts.get(toolUseId);
    }
    for (let i = this._turns.length - 1; i >= 0; i--) {
      if (this._turns[i].id !== turnId) {
        continue;
      }
      for (const part of this._turns[i].responseParts) {
        if (part.kind === ResponsePartKind.ToolCall && part.toolCall.toolCallId === toolUseId) {
          return part;
        }
      }
      return void 0;
    }
    return void 0;
  }
  _closeActive() {
    if (this._active === void 0) {
      return;
    }
    const a = this._active;
    const state = a.pendingToolUseIds.size === 0 ? TurnState.Complete : TurnState.Cancelled;
    const startedAt = a.startedAt === void 0 ? void 0 : Date.parse(a.startedAt);
    const endedAt = a.lastResponseAt === void 0 ? void 0 : Date.parse(a.lastResponseAt);
    const duration = startedAt !== void 0 && endedAt !== void 0 && Number.isFinite(startedAt) && Number.isFinite(endedAt) ? Math.max(0, endedAt - startedAt) : void 0;
    const turn = {
      id: a.id,
      startedAt: a.startedAt,
      duration,
      message: { text: a.userText, origin: { kind: MessageKind.User } },
      responseParts: a.responseParts,
      usage: void 0,
      state
    };
    this._turns.push(turn);
    this._active = void 0;
  }
}
function readUserContent(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const content = raw.content;
  if (typeof content === "string") {
    return content.length > 0 ? content : void 0;
  }
  if (!Array.isArray(content) || content.length === 0) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: "text", text: b.text });
    } else if (b.type === "tool_result" && typeof b.tool_use_id === "string") {
      out.push({ type: "tool_result", tool_use_id: b.tool_use_id, content: b.content, is_error: b.is_error === true });
    }
  }
  return out.length > 0 ? out : void 0;
}
function readAssistantBlocks(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const content = raw.content;
  if (!Array.isArray(content)) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (typeof b.type !== "string") {
      continue;
    }
    out.push({
      type: b.type,
      text: typeof b.text === "string" ? b.text : void 0,
      thinking: typeof b.thinking === "string" ? b.thinking : void 0,
      id: typeof b.id === "string" ? b.id : void 0,
      name: typeof b.name === "string" ? b.name : void 0,
      input: b.input
    });
  }
  return out;
}
function readSystemSubtype(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const subtype = raw.subtype;
  return typeof subtype === "string" ? subtype : void 0;
}
function readSystemText(raw) {
  if (raw === null || typeof raw !== "object") {
    return void 0;
  }
  const r = raw;
  if (typeof r.text === "string") {
    return r.text;
  }
  if (typeof r.message === "string") {
    return r.message;
  }
  return void 0;
}
function extractToolResultContent(content) {
  if (typeof content === "string") {
    return content.length > 0 ? [{ type: ToolResultContentType.Text, text: content }] : void 0;
  }
  if (!Array.isArray(content)) {
    return void 0;
  }
  const out = [];
  for (const block of content) {
    if (block === null || typeof block !== "object") {
      continue;
    }
    const b = block;
    if (b.type === "text" && typeof b.text === "string") {
      out.push({ type: ToolResultContentType.Text, text: b.text });
    }
  }
  return out.length > 0 ? out : void 0;
}
function safeStringify(v) {
  try {
    return JSON.stringify(v);
  } catch {
    return void 0;
  }
}
function isCliEchoContent(content) {
  if (typeof content === "string") {
    return CLI_ECHO_MARKER_PATTERN.test(content);
  }
  const firstText = content.find((b) => b.type === "text");
  return firstText !== void 0 && CLI_ECHO_MARKER_PATTERN.test(firstText.text);
}
export {
  mapSessionMessagesToTurns,
  missingPromptPlaceholder,
  resolveForkAnchorUuid
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjbGF1ZGVcXGNsYXVkZVJlcGxheU1hcHBlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB0eXBlIHsgU2Vzc2lvbk1lc3NhZ2UgfSBmcm9tICdAYW50aHJvcGljLWFpL2NsYXVkZS1hZ2VudC1zZGsnO1xuaW1wb3J0IHR5cGUgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHR5cGUgeyBJTG9nU2VydmljZSB9IGZyb20gJy4uLy4uLy4uL2xvZy9jb21tb24vbG9nLmpzJztcbmltcG9ydCB7XG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdFRvb2xDYWxsQ2FuY2VsbGF0aW9uUmVhc29uLFxuXHRUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbixcblx0VG9vbENhbGxTdGF0dXMsXG5cdFRvb2xSZXN1bHRDb250ZW50VHlwZSxcblx0VHVyblN0YXRlLFxuXHRNZXNzYWdlS2luZCxcblx0dHlwZSBSZXNwb25zZVBhcnQsXG5cdHR5cGUgVG9vbENhbGxDYW5jZWxsZWRTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLFxuXHR0eXBlIFRvb2xDYWxsUmVzcG9uc2VQYXJ0LFxuXHR0eXBlIFRvb2xSZXN1bHRDb250ZW50LFxuXHR0eXBlIFR1cm4sXG59IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7IGZvcm1hdEdlbmVyaWNUb29sSW5wdXQgfSBmcm9tICcuLi8uLi9jb21tb24vc3RyZWFtaW5nVG9vbENhbGxEaXNwbGF5LmpzJztcbmltcG9ydCB7IGJ1aWxkQ2xhdWRlVG9vbE1ldGEsIGdldENsYXVkZUludm9jYXRpb25NZXNzYWdlLCBnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlLCBnZXRDbGF1ZGVUb29sRGlzcGxheU5hbWUsIGdldENsYXVkZVRvb2xJbnB1dFN0cmluZyB9IGZyb20gJy4vY2xhdWRlVG9vbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgaGFzQ2xpZW50VG9vbE5hbWVQcmVmaXgsIHN0cmlwQ2xpZW50VG9vbE5hbWVQcmVmaXggfSBmcm9tICcuL2NsaWVudFRvb2xzL2NsYXVkZUNsaWVudFRvb2xNY3BTZXJ2ZXIuanMnO1xuXG4vKipcbiAqIFBoYXNlIDEzIFx1MjAxNCByZXBsYXkgbWFwcGVyLiBSZWR1Y2VzIGEgZmxhdCBgU2Vzc2lvbk1lc3NhZ2VbXWAgKHRoZSBTREsnc1xuICogb24tZGlzayBKU09OTCB0cmFuc2NyaXB0KSBpbnRvIHRoZSBwcm90b2NvbCdzIGBUdXJuW11gIHNoYXBlIHBlclxuICogW0NPTlRFWFQubWQgTTddKC4vQ09OVEVYVC5tZCkuIFB1cmUgZnVuY3Rpb247IG5vIEkvTywgbm8gREkuXG4gKlxuICogRGlzdGluY3QgZnJvbSB0aGUgbGl2ZSBtYXBwZXIgKGBtYXBTREtNZXNzYWdlVG9BZ2VudFNpZ25hbHNgKSBiZWNhdXNlOlxuICogLSBpbnB1dCBzaGFwZSBkaWZmZXJzIChgU2Vzc2lvbk1lc3NhZ2VgIGVudmVsb3BlIHZzIGBTREtNZXNzYWdlYCB1bmlvbiksXG4gKiAtIG91dHB1dCBzaGFwZSBkaWZmZXJzIChgVHVybltdYCB2cyBgQWdlbnRTaWduYWxbXWApLFxuICogLSByZXBsYXkgaGFzIG5vIGAncmVzdWx0J2AgZW52ZWxvcGUgKFNESyBkb2Vzbid0IHBlcnNpc3QgaXQpIGFuZCBub1xuICogICBgJ3N0cmVhbV9ldmVudCdgIGxpZmVjeWNsZSAodGVybWluYWwgc3RhdGVzIG9ubHkpLlxuICpcbiAqIFNoYXJlZCBpbnZhcmlhbnQgd2l0aCB0aGUgbGl2ZSBtYXBwZXI6IHRoZSBgTWFwPHRvb2xfdXNlX2lkLCB0dXJuSWQ+YFxuICogYXR0cmlidXRpb24gcnVsZSBmcm9tIE03IFx1MjAxNCBgdG9vbF9yZXN1bHRgIGxlZ2l0aW1hdGVseSBsYW5kcyBpbiBhIGxhdGVyXG4gKiBgJ3VzZXInYCBlbnZlbG9wZSBhbmQgbXVzdCByZXNvbHZlIGJhY2sgdG8gdGhlIGFubm91bmNpbmcgYHRvb2xfdXNlYCdzXG4gKiB0dXJuLiBUaGlzIG1hcHBlciBidWlsZHMgYW4gZXF1aXZhbGVudCBsb2NhbCBtYXAgZHVyaW5nIGl0cyBzaW5nbGUgcGFzcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1hcFNlc3Npb25NZXNzYWdlc1RvVHVybnMoXG5cdG1lc3NhZ2VzOiByZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdLFxuXHRzZXNzaW9uOiBVUkksXG5cdGxvZ1NlcnZpY2U6IElMb2dTZXJ2aWNlLFxuKTogcmVhZG9ubHkgVHVybltdIHtcblx0Y29uc3QgYnVpbGRlciA9IG5ldyBSZXBsYXlCdWlsZGVyKHNlc3Npb24sIGxvZ1NlcnZpY2UpO1xuXHRmb3IgKGNvbnN0IG1zZyBvZiBtZXNzYWdlcykge1xuXHRcdGNvbnN0IHBhcnNlZCA9IHBhcnNlU2Vzc2lvbk1lc3NhZ2UobXNnKTtcblx0XHRpZiAocGFyc2VkID09PSB1bmRlZmluZWQpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRidWlsZGVyLmNvbnN1bWUocGFyc2VkKTtcblx0fVxuXHRyZXR1cm4gYnVpbGRlci5maW5pc2goKTtcbn1cblxuLyoqXG4gKiBQaGFzZSA2LjUgXHUyMDE0IHRyYW5zbGF0ZSBhIHByb3RvY29sIGB0dXJuSWRgICh0aGUgbGFzdCBLRVBUIHR1cm4gTikgaW50byB0aGVcbiAqIFNESyBlbnZlbG9wZSBgdXVpZGAgdGhhdCBgZm9ya1Nlc3Npb24oeyB1cFRvTWVzc2FnZUlkIH0pYCBhY2NlcHRzXG4gKiAoSU5DTFVTSVZFKS4gUmV0dXJucyB0aGUgYHV1aWRgIG9mIHR1cm4gTidzIGxhc3QgYCdhc3Npc3RhbnQnYCBlbnZlbG9wZSxcbiAqIG9yIGB1bmRlZmluZWRgIHdoZW4gYHR1cm5JZGAgaXMgbm90IGluIHRoZSB0cmFuc2NyaXB0IG9yIHRoZSB0dXJuIGhhcyBub1xuICogYXNzaXN0YW50IGVudmVsb3BlIHlldC4gQWdlbnQgSG9zdCBQcm90b2NvbCByZXF1ZXN0IHR1cm4gSURzIGFyZSBub3QgdmFsaWQgU0RLIGZvcmsgVVVJRHMuXG4gKiBSZXVzZXMge0BsaW5rIHBhcnNlU2Vzc2lvbk1lc3NhZ2V9IHNvIHRoZSB0dXJuLWJvdW5kYXJ5IHJ1bGUgbWF0Y2hlc1xuICoge0BsaW5rIFJlcGxheUJ1aWxkZXJ9OyBhbHdheXMgcmV0dXJucyBhbiBlbnZlbG9wZSBgdXVpZGAsIG5ldmVyIGEgYG1zZ19cdTIwMjZgIGlkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUZvcmtBbmNob3JVdWlkKG1lc3NhZ2VzOiByZWFkb25seSBTZXNzaW9uTWVzc2FnZVtdLCB0dXJuSWQ6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGxldCB0dXJuT3BlbiA9IGZhbHNlO1xuXHRsZXQgc2VlblRhcmdldCA9IGZhbHNlO1xuXHRsZXQgbGFzdEFzc2lzdGFudFV1aWQ6IHN0cmluZyB8IHVuZGVmaW5lZDtcblx0Zm9yIChjb25zdCBtc2cgb2YgbWVzc2FnZXMpIHtcblx0XHRjb25zdCBwYXJzZWQgPSBwYXJzZVNlc3Npb25NZXNzYWdlKG1zZyk7XG5cdFx0aWYgKHBhcnNlZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0aWYgKHBhcnNlZC5raW5kID09PSAndXNlci10ZXh0Jykge1xuXHRcdFx0aWYgKHNlZW5UYXJnZXQpIHtcblx0XHRcdFx0Ly8gRmlyc3QgZ2VudWluZSB1c2VyLXRleHQgYWZ0ZXIgdHVybiBOIHN0YXJ0ZWQgXHUyMTkyIHR1cm4gTiBpcyBvdmVyLlxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdHR1cm5PcGVuID0gdHJ1ZTtcblx0XHRcdGlmIChwYXJzZWQudXVpZCA9PT0gdHVybklkKSB7XG5cdFx0XHRcdHNlZW5UYXJnZXQgPSB0cnVlO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAocGFyc2VkLmtpbmQgPT09ICdhc3Npc3RhbnQnKSB7XG5cdFx0XHRpZiAoIXR1cm5PcGVuKSB7XG5cdFx0XHRcdC8vIE1pcnJvcnMge0BsaW5rIFJlcGxheUJ1aWxkZXIuX2NvbnN1bWVBc3Npc3RhbnR9OiBhbiBhc3Npc3RhbnRcblx0XHRcdFx0Ly8gZW52ZWxvcGUgd2l0aCBubyB0dXJuIG9wZW4gc3RhcnRzIG9uZSBrZXllZCBvbiBpdHMgb3duIHV1aWRcblx0XHRcdFx0Ly8gKHN1YmFnZW50IHRyYW5zY3JpcHQsIG9yIGEgdHJ1bmNhdGVkIHNsaWNlIHRoYXQgbG9zdCBpdHNcblx0XHRcdFx0Ly8gcHJvbXB0KS4gV2l0aG91dCB0aGlzIHRoZSByZXNvbHZlciBjYW4ndCBhbmNob3IgYSBmb3JrIG9uXG5cdFx0XHRcdC8vIHN1Y2ggYSB0dXJuLlxuXHRcdFx0XHR0dXJuT3BlbiA9IHRydWU7XG5cdFx0XHRcdGlmIChwYXJzZWQudXVpZCA9PT0gdHVybklkKSB7XG5cdFx0XHRcdFx0c2VlblRhcmdldCA9IHRydWU7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdGlmIChzZWVuVGFyZ2V0KSB7XG5cdFx0XHRcdGxhc3RBc3Npc3RhbnRVdWlkID0gcGFyc2VkLnV1aWQ7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdC8vICd1c2VyLXRvb2wtcmVzdWx0cycgLyAnc3lzdGVtLW5vdGlmaWNhdGlvbicgbmV2ZXIgZmxpcCB0aGUgdHVybi5cblx0fVxuXHRpZiAoIXNlZW5UYXJnZXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBsYXN0QXNzaXN0YW50VXVpZDtcbn1cblxuLy8gI3JlZ2lvbiBQYXJzZWQgbWVzc2FnZSB1bmlvbiBcdTIwMTQgbmFycm93LWF0LXRoZS1zZWFtIGFkYXB0ZXJcblxuaW50ZXJmYWNlIFVzZXJUZXh0QmxvY2sgeyByZWFkb25seSB0eXBlOiAndGV4dCc7IHJlYWRvbmx5IHRleHQ6IHN0cmluZyB9XG5pbnRlcmZhY2UgVXNlclRvb2xSZXN1bHRCbG9jayB7IHJlYWRvbmx5IHR5cGU6ICd0b29sX3Jlc3VsdCc7IHJlYWRvbmx5IHRvb2xfdXNlX2lkOiBzdHJpbmc7IHJlYWRvbmx5IGNvbnRlbnQ6IHVua25vd247IHJlYWRvbmx5IGlzX2Vycm9yOiBib29sZWFuIH1cbmludGVyZmFjZSBBc3Npc3RhbnRCbG9jayB7IHJlYWRvbmx5IHR5cGU6IHN0cmluZzsgcmVhZG9ubHkgdGV4dD86IHN0cmluZzsgcmVhZG9ubHkgdGhpbmtpbmc/OiBzdHJpbmc7IHJlYWRvbmx5IGlkPzogc3RyaW5nOyByZWFkb25seSBuYW1lPzogc3RyaW5nOyByZWFkb25seSBpbnB1dD86IHVua25vd24gfVxuXG4vKipcbiAqIERpc2NyaW1pbmF0ZWQgdW5pb24gb2YgcmVwbGF5LXJlbGV2YW50IG1lc3NhZ2Ugc2hhcGVzLiBFdmVyeXRoaW5nIHRoYXRcbiAqIHRoZSBtYXBwZXIgYWN0dWFsbHkgY2FyZXMgYWJvdXQgaXMgb25lIG9mIHRoZXNlOyBldmVyeXRoaW5nIGVsc2UgKGhvb2tzLFxuICogQ0xJLWVjaG8gZW50cmllcywgdW5hbGxvd2VkIHN5c3RlbSBzdWJ0eXBlcywgbWFsZm9ybWVkIGVudmVsb3BlcykgcmV0dXJuc1xuICogYHVuZGVmaW5lZGAgZnJvbSB7QGxpbmsgcGFyc2VTZXNzaW9uTWVzc2FnZX0uXG4gKlxuICogVGhlIHNwbGl0IGtlZXBzIFNESyBzaGFwZSBkZXRlY3Rpb24gKHRoaXMgc2VhbSkgc2VwYXJhdGUgZnJvbSB0aGVcbiAqIHN0YXRlZnVsIHJlZHVjdGlvbiAodGhlIHtAbGluayBSZXBsYXlCdWlsZGVyfSkgXHUyMDE0IHNlZSBDT05URVhUIE03LlxuICovXG50eXBlIFBhcnNlZFNlc3Npb25NZXNzYWdlID1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICd1c2VyLXRleHQnOyByZWFkb25seSB1dWlkOiBzdHJpbmc7IHJlYWRvbmx5IHRleHQ6IHN0cmluZzsgcmVhZG9ubHkgdGltZXN0YW1wPzogc3RyaW5nIH1cblx0fCB7IHJlYWRvbmx5IGtpbmQ6ICd1c2VyLXRvb2wtcmVzdWx0cyc7IHJlYWRvbmx5IHV1aWQ6IHN0cmluZzsgcmVhZG9ubHkgcmVzdWx0czogcmVhZG9ubHkgVXNlclRvb2xSZXN1bHRCbG9ja1tdOyByZWFkb25seSB0aW1lc3RhbXA/OiBzdHJpbmcgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ2Fzc2lzdGFudCc7IHJlYWRvbmx5IHV1aWQ6IHN0cmluZzsgcmVhZG9ubHkgYmxvY2tzOiByZWFkb25seSBBc3Npc3RhbnRCbG9ja1tdOyByZWFkb25seSBpc0lubmVyOiBib29sZWFuOyByZWFkb25seSB0aW1lc3RhbXA/OiBzdHJpbmcgfVxuXHR8IHsgcmVhZG9ubHkga2luZDogJ3N5c3RlbS1ub3RpZmljYXRpb24nOyByZWFkb25seSB1dWlkOiBzdHJpbmc7IHJlYWRvbmx5IHN1YnR5cGU6IHN0cmluZzsgcmVhZG9ubHkgdGV4dDogc3RyaW5nOyByZWFkb25seSB0aW1lc3RhbXA/OiBzdHJpbmcgfTtcblxuZnVuY3Rpb24gcGFyc2VTZXNzaW9uTWVzc2FnZShtc2c6IFNlc3Npb25NZXNzYWdlKTogUGFyc2VkU2Vzc2lvbk1lc3NhZ2UgfCB1bmRlZmluZWQge1xuXHRjb25zdCB0aW1lc3RhbXAgPSByZWFkVGltZXN0YW1wKG1zZyk7XG5cdHN3aXRjaCAobXNnLnR5cGUpIHtcblx0XHRjYXNlICd1c2VyJzogcmV0dXJuIHBhcnNlVXNlck1lc3NhZ2UobXNnLCB0aW1lc3RhbXApO1xuXHRcdGNhc2UgJ2Fzc2lzdGFudCc6IHJldHVybiBwYXJzZUFzc2lzdGFudE1lc3NhZ2UobXNnLCB0aW1lc3RhbXApO1xuXHRcdGNhc2UgJ3N5c3RlbSc6IHJldHVybiBwYXJzZVN5c3RlbU1lc3NhZ2UobXNnLCB0aW1lc3RhbXApO1xuXHRcdGRlZmF1bHQ6IHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gcmVhZFRpbWVzdGFtcChtc2c6IFNlc3Npb25NZXNzYWdlICYgeyByZWFkb25seSB0aW1lc3RhbXA/OiB1bmtub3duIH0pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodHlwZW9mIG1zZy50aW1lc3RhbXAgIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0aW1lc3RhbXAgPSBEYXRlLnBhcnNlKG1zZy50aW1lc3RhbXApO1xuXHRyZXR1cm4gTnVtYmVyLmlzRmluaXRlKHRpbWVzdGFtcCkgPyBuZXcgRGF0ZSh0aW1lc3RhbXApLnRvSVNPU3RyaW5nKCkgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHBhcnNlVXNlck1lc3NhZ2UobXNnOiBTZXNzaW9uTWVzc2FnZSwgdGltZXN0YW1wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQYXJzZWRTZXNzaW9uTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGNvbnRlbnQgPSByZWFkVXNlckNvbnRlbnQobXNnLm1lc3NhZ2UpO1xuXHRpZiAoY29udGVudCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoaXNDbGlFY2hvQ29udGVudChjb250ZW50KSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiB7IGtpbmQ6ICd1c2VyLXRleHQnLCB1dWlkOiBtc2cudXVpZCwgdGV4dDogY29udGVudCwgdGltZXN0YW1wIH07XG5cdH1cblx0Y29uc3QgdGV4dEJsb2NrcyA9IGNvbnRlbnQuZmlsdGVyKChiKTogYiBpcyBVc2VyVGV4dEJsb2NrID0+IGIudHlwZSA9PT0gJ3RleHQnKTtcblx0aWYgKHRleHRCbG9ja3MubGVuZ3RoID09PSAwKSB7XG5cdFx0Y29uc3QgcmVzdWx0cyA9IGNvbnRlbnQuZmlsdGVyKChiKTogYiBpcyBVc2VyVG9vbFJlc3VsdEJsb2NrID0+IGIudHlwZSA9PT0gJ3Rvb2xfcmVzdWx0Jyk7XG5cdFx0cmV0dXJuIHJlc3VsdHMubGVuZ3RoID4gMCA/IHsga2luZDogJ3VzZXItdG9vbC1yZXN1bHRzJywgdXVpZDogbXNnLnV1aWQsIHJlc3VsdHMsIHRpbWVzdGFtcCB9IDogdW5kZWZpbmVkO1xuXHR9XG5cdC8vIE1peGVkIG9yIHRleHQtb25seTogdGV4dCB3aW5zIFx1MjAxNCBtYXRjaGVzIHByaW9yIGJlaGF2aW9yIHdoZXJlIHRvb2xfcmVzdWx0c1xuXHQvLyBpbiBhIHRleHQtYmVhcmluZyBlbnZlbG9wZSBhcmUgZHJvcHBlZCAodGhleSBzaG91bGQgYWxyZWFkeSBoYXZlIGJlZW4gZGVsaXZlcmVkKS5cblx0cmV0dXJuIHsga2luZDogJ3VzZXItdGV4dCcsIHV1aWQ6IG1zZy51dWlkLCB0ZXh0OiB0ZXh0QmxvY2tzLm1hcChiID0+IGIudGV4dCkuam9pbignXFxuJyksIHRpbWVzdGFtcCB9O1xufVxuXG5mdW5jdGlvbiBwYXJzZUFzc2lzdGFudE1lc3NhZ2UobXNnOiBTZXNzaW9uTWVzc2FnZSwgdGltZXN0YW1wOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBQYXJzZWRTZXNzaW9uTWVzc2FnZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGJsb2NrcyA9IHJlYWRBc3Npc3RhbnRCbG9ja3MobXNnLm1lc3NhZ2UpO1xuXHRpZiAoYmxvY2tzID09PSB1bmRlZmluZWQgfHwgYmxvY2tzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gU3ViYWdlbnQgdHJhbnNjcmlwdHMgKGZyb20gYGdldFN1YmFnZW50TWVzc2FnZXNgKSBjYXJyeSBhXG5cdC8vIGBwYXJlbnRfdG9vbF91c2VfaWRgIG9uIGV2ZXJ5IGVudmVsb3BlIGFuZCBoYXZlIG5vIHN5bnRoZXRpYyBzcGF3bmluZ1xuXHQvLyB1c2VyIHByb21wdCwgc28gdGhleSBsZWdpdGltYXRlbHkgb3BlbiB3aXRoIGFuIGFzc2lzdGFudCBtZXNzYWdlIFx1MjAxNFxuXHQvLyBgaXNJbm5lcmAgbGV0cyB0aGUgYnVpbGRlciBzeW50aGVzaXplIGEgdHVybiBpbnN0ZWFkIG9mIGRyb3BwaW5nIGl0LlxuXHRyZXR1cm4geyBraW5kOiAnYXNzaXN0YW50JywgdXVpZDogbXNnLnV1aWQsIGJsb2NrcywgaXNJbm5lcjogbXNnLnBhcmVudF90b29sX3VzZV9pZCAhPT0gbnVsbCwgdGltZXN0YW1wIH07XG59XG5cbmZ1bmN0aW9uIHBhcnNlU3lzdGVtTWVzc2FnZShtc2c6IFNlc3Npb25NZXNzYWdlLCB0aW1lc3RhbXA6IHN0cmluZyB8IHVuZGVmaW5lZCk6IFBhcnNlZFNlc3Npb25NZXNzYWdlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3Qgc3VidHlwZSA9IHJlYWRTeXN0ZW1TdWJ0eXBlKG1zZy5tZXNzYWdlKTtcblx0aWYgKHN1YnR5cGUgPT09IHVuZGVmaW5lZCB8fCAhQUxMT1dFRF9TWVNURU1fU1VCVFlQRVMuaGFzKHN1YnR5cGUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0ZXh0ID0gcmVhZFN5c3RlbVRleHQobXNnLm1lc3NhZ2UpID8/IGBbJHtzdWJ0eXBlfV1gO1xuXHRyZXR1cm4geyBraW5kOiAnc3lzdGVtLW5vdGlmaWNhdGlvbicsIHV1aWQ6IG1zZy51dWlkLCBzdWJ0eXBlLCB0ZXh0LCB0aW1lc3RhbXAgfTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEJ1aWxkZXJcblxuLyoqXG4gKiBBbGxvd2xpc3Qgb2YgYHN5c3RlbWAgc3VidHlwZXMgdGhhdCBzdXJ2aXZlIHJlcGxheSBhc1xuICoge0BsaW5rIFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9ufSBwYXJ0cyBvbiB0aGUgYWN0aXZlIHR1cm4uXG4gKiBNaXJyb3JzIENPTlRFWFQgTTcncyB0YWJsZSBcdTIwMTQgYW55dGhpbmcgbm90IGluIHRoaXMgc2V0IGlzIGRyb3BwZWQuXG4gKi9cbmNvbnN0IEFMTE9XRURfU1lTVEVNX1NVQlRZUEVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbXG5cdCdjb21wYWN0X2JvdW5kYXJ5Jyxcblx0J25vdGlmaWNhdGlvbicsXG5dKTtcblxuLyoqXG4gKiBDTEktZWNobyBtYXJrZXJzIHRoZSBDbGF1ZGUgQ29kZSBDTEkgd3JpdGVzIGludG8gdGhlIHRyYW5zY3JpcHQgZm9yXG4gKiByZXBsYXkgZmlkZWxpdHkuIFRoZXkgYXJlIGB0eXBlOiAndXNlcidgIGVudmVsb3BlcyB3aG9zZSBgbWVzc2FnZS5jb250ZW50YFxuICogaXMgYSByYXcgc3RyaW5nIHN0YXJ0aW5nIHdpdGggb25lIG9mIHRoZXNlIHRhZ3MgXHUyMDE0IGA8Y29tbWFuZC1uYW1lPmAgL1xuICogYDxjb21tYW5kLWFyZ3M+YCAoc2xhc2gtY29tbWFuZCBlY2hvZXMgbGlrZSBgL21vZGVsIGNsYXVkZS1vcHVzLTQuN2ApLFxuICogYDxsb2NhbC1jb21tYW5kLXN0ZG91dD5gIC8gYDxsb2NhbC1jb21tYW5kLXN0ZGVycj5gIChlY2hvIG9mIHRoZSBsb2NhbFxuICogaGFuZGxlcidzIG91dHB1dCwgZS5nLiBcIlNldCBtb2RlbCB0byBjbGF1ZGUtb3B1cy00LjdcIiksIGFuZFxuICogYDxsb2NhbC1jb21tYW5kLWNhdmVhdD5gICh0aGUgXCJtZXNzYWdlcyBiZWxvdyB3ZXJlIGdlbmVyYXRlZCB3aGlsZVx1MjAyNlwiXG4gKiBwcmVhbWJsZSkuIFRoZSBlbnRyaWVzIGRvbid0IGNhcnJ5IGBpc1N5bnRoZXRpY2AgLyBgaXNNZXRhYCByZWxpYWJseVxuICogKHRoZSBgL21vZGVsYCBlY2hvIGxhY2tzIGJvdGgsIHZlcmlmaWVkIGVtcGlyaWNhbGx5KSwgc28gdGhlIG9ubHkgcmVsaWFibGVcbiAqIGRpc2NyaW1pbmF0b3IgaXMgdGhlIGNvbnRlbnQgc2hhcGUgaXRzZWxmLiBEcm9wIG9uIHJlcGxheSBzbyB0aGUgd29ya2JlbmNoXG4gKiBkb2Vzbid0IHJlbmRlciB0aGVtIGFzIHVzZXIgdHVybnMuXG4gKi9cbmNvbnN0IENMSV9FQ0hPX01BUktFUl9QQVRURVJOID0gL148KGNvbW1hbmQtbmFtZXxjb21tYW5kLW1lc3NhZ2V8Y29tbWFuZC1hcmdzfGxvY2FsLWNvbW1hbmQtc3Rkb3V0fGxvY2FsLWNvbW1hbmQtc3RkZXJyfGxvY2FsLWNvbW1hbmQtY2F2ZWF0KT4vO1xuXG4vKipcbiAqIFN0YW5kLWluIHByb21wdCBmb3IgYSB0dXJuIHdob3NlIHVzZXIgbWVzc2FnZSBpcyBub3QgcHJlc2VudCBpbiB0aGVcbiAqIHRyYW5zY3JpcHQgc2xpY2Ugd2Ugd2VyZSBoYW5kZWQuIFRoaXMgaGFwcGVucyB3aGVuIHRoZSBTREsgdHJ1bmNhdGVzIGFcbiAqIGxhcmdlIHRyYW5zY3JpcHQgKGl0IHJldHVybnMgb25seSB0aGUgYnl0ZXMgYWZ0ZXIgdGhlIGxhc3QgY29tcGFjdFxuICogYm91bmRhcnkpLCB3aGljaCBjdXRzIHRoZSBvcGVuaW5nIHByb21wdCBvZmYgbWlkLXR1cm4uIFNob3dpbmcgdGhlXG4gKiByZWNvdmVyZWQgYXNzaXN0YW50IGNvbnRlbnQgdW5kZXIgYSBwbGFjZWhvbGRlciBwcm9tcHQgaXMgc3RyaWN0bHkgYmV0dGVyXG4gKiB0aGFuIGRyb3BwaW5nIHRoZSB0dXJuIFx1MjAxNCBkcm9wcGluZyBjYW4gc2lsZW50bHkgZW1wdHkgYW4gZW50aXJlIHNlc3Npb24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtaXNzaW5nUHJvbXB0UGxhY2Vob2xkZXIoKTogc3RyaW5nIHtcblx0cmV0dXJuIGxvY2FsaXplKCdjbGF1ZGUucmVwbGF5Lm1pc3NpbmdQcm9tcHQnLCBcIk1lc3NhZ2UgY29udGVudCBjb3VsZCBub3QgYmUgcmV0cmlldmVkXCIpO1xufVxuXG5pbnRlcmZhY2UgSW5Qcm9ncmVzc1R1cm4ge1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSB1c2VyVGV4dDogc3RyaW5nO1xuXHRyZWFkb25seSBzdGFydGVkQXQ/OiBzdHJpbmc7XG5cdGxhc3RSZXNwb25zZUF0Pzogc3RyaW5nO1xuXHRyZWFkb25seSByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXTtcblx0LyoqXG5cdCAqIGB0b29sX3VzZV9pZGBzIGFubm91bmNlZCBieSBUSElTIHR1cm4uIERyYWluZWQgd2hlbiB0aGUgbWF0Y2hpbmdcblx0ICogYHRvb2xfcmVzdWx0YCBsYW5kcyAod2hpY2ggbWF5IGFycml2ZSBpbiB0aGlzIHR1cm4ncyB1c2VyLXNpZGVcblx0ICogYHRvb2xfcmVzdWx0YCBibG9jayBvciBhIGxhdGVyIHR1cm4ncykuIEF0IHR1cm4gY2xvc2UsIG5vbi1lbXB0eSBcdTIxOTJcblx0ICogdGFpbCBUdXJuIG1hcmtlZCBgQ2FuY2VsbGVkYC5cblx0ICovXG5cdHJlYWRvbmx5IHBlbmRpbmdUb29sVXNlSWRzOiBTZXQ8c3RyaW5nPjtcblx0LyoqXG5cdCAqIFN0YXNoIG9mIGNvbXBsZXRlZCBgVG9vbENhbGxSZXNwb25zZVBhcnRgcyB3YWl0aW5nIG9uIHRoZWlyIHJlc3VsdFxuXHQgKiBjb250ZW50LiBgdG9vbF91c2VgIG9wZW5zIHdpdGggYSBwbGFjZWhvbGRlcjsgdGhlIG1hdGNoaW5nXG5cdCAqIGB0b29sX3Jlc3VsdGAgZmlsbHMgaXQgaW4uIEtleWVkIGJ5IGB0b29sX3VzZV9pZGAuXG5cdCAqL1xuXHRyZWFkb25seSB0b29sQ2FsbFBhcnRzOiBNYXA8c3RyaW5nLCBUb29sQ2FsbFJlc3BvbnNlUGFydD47XG59XG5cbmNsYXNzIFJlcGxheUJ1aWxkZXIge1xuXHRwcml2YXRlIHJlYWRvbmx5IF90dXJuczogVHVybltdID0gW107XG5cdHByaXZhdGUgX2FjdGl2ZTogSW5Qcm9ncmVzc1R1cm4gfCB1bmRlZmluZWQ7XG5cdC8qKlxuXHQgKiBDcm9zcy10dXJuIHRvb2wtdXNlIHRyYWNraW5nLiBLZXllZCBieSBgdG9vbF91c2VfaWRgOlxuXHQgKiAtIGB0dXJuSWRgIFx1MjAxNCB0aGUgYW5ub3VuY2luZyB0dXJuIChzbyBhIGxhdGUgYHRvb2xfcmVzdWx0YCBpbiBhXG5cdCAqICAgbGF0ZXIgYHVzZXJgIGVudmVsb3BlIGNhbiBhdHRhY2ggYmFjayB0byB0aGUgcmlnaHQgdHVybiBwZXIgTTcpLlxuXHQgKiAtIGBwYXJzZWRJbnB1dGAgXHUyMDE0IHRoZSBvcmlnaW5hbCBgdG9vbF91c2UuaW5wdXRgLCBsb29rZWQgdXAgYXRcblx0ICogICBgX2F0dGFjaFRvb2xSZXN1bHRgIHNvIHRoZSBwYXN0LXRlbnNlIG1lc3NhZ2UgY2FuIGluY2x1ZGUgdGhlXG5cdCAqICAgb3JpZ2luYWwgcGFyYW1ldGVycy4gTWlycm9ycyB0aGUgbGl2ZSBtYXBwZXIncyBgX3Rvb2xDYWxsSW5mb2Bcblx0ICogICBwYXR0ZXJuIGJ1dCBzaW1wbGVyIChyZXBsYXkgaGFzIHRoZSBmdWxsIGlucHV0IHN5bmNocm9ub3VzbHkgb25cblx0ICogICB0aGUgYHRvb2xfdXNlYCBibG9jaykuXG5cdCAqL1xuXHRwcml2YXRlIHJlYWRvbmx5IF90b29sVXNlcyA9IG5ldyBNYXA8c3RyaW5nLCB7IHJlYWRvbmx5IHR1cm5JZDogc3RyaW5nOyByZWFkb25seSBwYXJzZWRJbnB1dDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7IHJlYWRvbmx5IGlzQ2xpZW50VG9vbDogYm9vbGVhbiB9PigpO1xuXG5cdC8qKiBUdXJucyBvcGVuZWQgZnJvbSBhIGxlYWRpbmcgYXNzaXN0YW50IGVudmVsb3BlIGJlY2F1c2UgdGhlIHByb21wdCB3YXMgbWlzc2luZy4gUmVwb3J0ZWQgb25jZSBieSB7QGxpbmsgZmluaXNofS4gKi9cblx0cHJpdmF0ZSBfcmVjb3ZlcmVkUHJvbXB0bGVzc1R1cm5zID0gMDtcblxuXHQvKiogYHRvb2xfcmVzdWx0YCBibG9ja3Mgd2hvc2UgYW5ub3VuY2luZyBgdG9vbF91c2VgIHdhcyBub3QgaW4gdGhlIHNsaWNlLiBSZXBvcnRlZCBvbmNlIGJ5IHtAbGluayBmaW5pc2h9LiAqL1xuXHRwcml2YXRlIF9vcnBoYW5Ub29sUmVzdWx0cyA9IDA7XG5cblx0Y29uc3RydWN0b3IocHJpdmF0ZSByZWFkb25seSBfc2Vzc2lvbjogVVJJLCBwcml2YXRlIHJlYWRvbmx5IF9sb2dTZXJ2aWNlOiBJTG9nU2VydmljZSkgeyB9XG5cblx0Y29uc3VtZShtc2c6IFBhcnNlZFNlc3Npb25NZXNzYWdlKTogdm9pZCB7XG5cdFx0c3dpdGNoIChtc2cua2luZCkge1xuXHRcdFx0Y2FzZSAndXNlci10ZXh0Jzpcblx0XHRcdFx0dGhpcy5fY2xvc2VBY3RpdmUoKTtcblx0XHRcdFx0dGhpcy5fYWN0aXZlID0ge1xuXHRcdFx0XHRcdGlkOiBtc2cudXVpZCxcblx0XHRcdFx0XHR1c2VyVGV4dDogbXNnLnRleHQsXG5cdFx0XHRcdFx0c3RhcnRlZEF0OiBtc2cudGltZXN0YW1wLFxuXHRcdFx0XHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdFx0XHRcdHBlbmRpbmdUb29sVXNlSWRzOiBuZXcgU2V0KCksXG5cdFx0XHRcdFx0dG9vbENhbGxQYXJ0czogbmV3IE1hcCgpLFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICd1c2VyLXRvb2wtcmVzdWx0cyc6IHtcblx0XHRcdFx0bGV0IHVwZGF0ZXNBY3RpdmVUdXJuID0gZmFsc2U7XG5cdFx0XHRcdGZvciAoY29uc3QgYmxvY2sgb2YgbXNnLnJlc3VsdHMpIHtcblx0XHRcdFx0XHR1cGRhdGVzQWN0aXZlVHVybiA9IHRoaXMuX2F0dGFjaFRvb2xSZXN1bHQoYmxvY2spID09PSB0aGlzLl9hY3RpdmU/LmlkIHx8IHVwZGF0ZXNBY3RpdmVUdXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICh1cGRhdGVzQWN0aXZlVHVybiAmJiB0aGlzLl9hY3RpdmUgJiYgbXNnLnRpbWVzdGFtcCkge1xuXHRcdFx0XHRcdHRoaXMuX2FjdGl2ZS5sYXN0UmVzcG9uc2VBdCA9IG1zZy50aW1lc3RhbXA7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYXNzaXN0YW50Jzpcblx0XHRcdFx0dGhpcy5fY29uc3VtZUFzc2lzdGFudChtc2cpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHRjYXNlICdzeXN0ZW0tbm90aWZpY2F0aW9uJzpcblx0XHRcdFx0aWYgKHRoaXMuX2FjdGl2ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRcdFx0Ly8gU3lzdGVtIG5vdGlmaWNhdGlvbiBiZWZvcmUgYW55IHVzZXIgbWVzc2FnZSBcdTIwMTQgZHJvcC4gV2l0aG91dCBhbiBhY3RpdmUgdHVybiB0aGVyZSdzIG5vd2hlcmUgdG8gYXR0YWNoLlxuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9hY3RpdmUucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbixcblx0XHRcdFx0XHRjb250ZW50OiBtc2cudGV4dCxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGlmIChtc2cudGltZXN0YW1wKSB7XG5cdFx0XHRcdFx0dGhpcy5fYWN0aXZlLmxhc3RSZXNwb25zZUF0ID0gbXNnLnRpbWVzdGFtcDtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm47XG5cdFx0fVxuXHR9XG5cblx0ZmluaXNoKCk6IHJlYWRvbmx5IFR1cm5bXSB7XG5cdFx0dGhpcy5fY2xvc2VBY3RpdmUoKTtcblx0XHQvLyBPbmUgc3VtbWFyeSBsaW5lIHBlciByZXBsYXkgaW5zdGVhZCBvZiBvbmUgd2FybiBwZXIgZW52ZWxvcGU6IGFcblx0XHQvLyB0cnVuY2F0ZWQgdHJhbnNjcmlwdCBwcm9kdWNlcyB0aGVzZSBieSB0aGUgaHVuZHJlZCwgYW5kIHRoZVxuXHRcdC8vIHBlci1lbnZlbG9wZSBmb3JtIGRyb3duZWQgb3V0IHRoZSBmYWN0IHRoYXQgdGhlIHdob2xlIHNlc3Npb24gaGFkXG5cdFx0Ly8gYmVlbiByZWR1Y2VkIHRvIG5vdGhpbmcuXG5cdFx0aWYgKHRoaXMuX3JlY292ZXJlZFByb21wdGxlc3NUdXJucyA+IDAgfHwgdGhpcy5fb3JwaGFuVG9vbFJlc3VsdHMgPiAwKSB7XG5cdFx0XHR0aGlzLl9sb2dTZXJ2aWNlLndhcm4oYFtjbGF1ZGVSZXBsYXlNYXBwZXJdIGluY29tcGxldGUgdHJhbnNjcmlwdCBmb3IgJHt0aGlzLl9zZXNzaW9uLnRvU3RyaW5nKCl9OiAke3RoaXMuX3JlY292ZXJlZFByb21wdGxlc3NUdXJuc30gdHVybihzKSByZWNvdmVyZWQgd2l0aG91dCB0aGVpciBwcm9tcHQsICR7dGhpcy5fb3JwaGFuVG9vbFJlc3VsdHN9IG9ycGhhbmVkIHRvb2xfcmVzdWx0KHMpYCk7XG5cdFx0fVxuXHRcdHJldHVybiB0aGlzLl90dXJucztcblx0fVxuXG5cdHByaXZhdGUgX2NvbnN1bWVBc3Npc3RhbnQobXNnOiBQYXJzZWRTZXNzaW9uTWVzc2FnZSAmIHsga2luZDogJ2Fzc2lzdGFudCcgfSk6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0Ly8gVHdvIHdheXMgYSB0cmFuc2NyaXB0IGxlZ2l0aW1hdGVseSBvcGVucyB3aXRoIGFuIGFzc2lzdGFudFxuXHRcdFx0Ly8gZW52ZWxvcGU6XG5cdFx0XHQvLyAtIFN1YmFnZW50IHRyYW5zY3JpcHQgKGBpc0lubmVyYCk6IGV2ZXJ5IGVudmVsb3BlIGNhcnJpZXNcblx0XHRcdC8vICAgYHBhcmVudF90b29sX3VzZV9pZGAgYW5kIHRoZSBTREsgb21pdHMgdGhlIHN5bnRoZXRpYyBzcGF3bmluZ1xuXHRcdFx0Ly8gICBwcm9tcHQsIHNvIHRoZXJlIGlzIGdlbnVpbmVseSBubyBwcm9tcHQgdG8gc2hvdy5cblx0XHRcdC8vIC0gVHJ1bmNhdGVkIHBhcmVudCB0cmFuc2NyaXB0OiB0aGUgU0RLIGRyb3BzIGV2ZXJ5dGhpbmcgYmVmb3JlXG5cdFx0XHQvLyAgIHRoZSBsYXN0IGNvbXBhY3QgYm91bmRhcnkgZm9yIHRyYW5zY3JpcHRzIG92ZXIgaXRzIHNpemVcblx0XHRcdC8vICAgdGhyZXNob2xkLCB3aGljaCBjYW4gY3V0IHRoZSBwcm9tcHQgb2ZmIG1pZC10dXJuLlxuXHRcdFx0Ly8gRWl0aGVyIHdheSwgc3ludGhlc2l6ZSBhIHR1cm4gdG8gaG9sZCB0aGUgcmVwbHkuIERyb3BwaW5nIHdvdWxkXG5cdFx0XHQvLyBkaXNjYXJkIHRoZSBhc3Npc3RhbnQgY29udGVudCBcdTIwMTQgYW5kIHdoZW4gdGhlIHRydW5jYXRlZCBzbGljZVxuXHRcdFx0Ly8gY29udGFpbnMgbm8gdXNlciBtZXNzYWdlIGF0IGFsbCAob25lIGxvbmcgYWdlbnRpYyB0dXJuKSwgdGhhdFxuXHRcdFx0Ly8gbWVhbnMgZGlzY2FyZGluZyB0aGUgZW50aXJlIHNlc3Npb24uXG5cdFx0XHRpZiAoIW1zZy5pc0lubmVyKSB7XG5cdFx0XHRcdHRoaXMuX3JlY292ZXJlZFByb21wdGxlc3NUdXJucysrO1xuXHRcdFx0fVxuXHRcdFx0dGhpcy5fYWN0aXZlID0ge1xuXHRcdFx0XHRpZDogbXNnLnV1aWQsXG5cdFx0XHRcdHVzZXJUZXh0OiBtc2cuaXNJbm5lciA/ICcnIDogbWlzc2luZ1Byb21wdFBsYWNlaG9sZGVyKCksXG5cdFx0XHRcdHN0YXJ0ZWRBdDogbXNnLnRpbWVzdGFtcCxcblx0XHRcdFx0cmVzcG9uc2VQYXJ0czogW10sXG5cdFx0XHRcdHBlbmRpbmdUb29sVXNlSWRzOiBuZXcgU2V0KCksXG5cdFx0XHRcdHRvb2xDYWxsUGFydHM6IG5ldyBNYXAoKSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGxldCB0ZXh0UGFydENvdW50ZXIgPSAwO1xuXHRcdGxldCByZWFzb25pbmdQYXJ0Q291bnRlciA9IDA7XG5cdFx0Zm9yIChjb25zdCBibG9jayBvZiBtc2cuYmxvY2tzKSB7XG5cdFx0XHRpZiAoYmxvY2sudHlwZSA9PT0gJ3RleHQnICYmIHR5cGVvZiBibG9jay50ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0XHR0aGlzLl9hY3RpdmUucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdGlkOiBgJHt0aGlzLl9hY3RpdmUuaWR9IyR7bXNnLnV1aWR9I3RleHQtJHt0ZXh0UGFydENvdW50ZXIrK31gLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IGJsb2NrLnRleHQsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChibG9jay50eXBlID09PSAndGhpbmtpbmcnICYmIHR5cGVvZiBibG9jay50aGlua2luZyA9PT0gJ3N0cmluZycpIHtcblx0XHRcdFx0dGhpcy5fYWN0aXZlLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRcdFx0aWQ6IGAke3RoaXMuX2FjdGl2ZS5pZH0jJHttc2cudXVpZH0jdGhpbmtpbmctJHtyZWFzb25pbmdQYXJ0Q291bnRlcisrfWAsXG5cdFx0XHRcdFx0Y29udGVudDogYmxvY2sudGhpbmtpbmcsXG5cdFx0XHRcdH0pO1xuXHRcdFx0fSBlbHNlIGlmIChibG9jay50eXBlID09PSAndG9vbF91c2UnICYmIHR5cGVvZiBibG9jay5pZCA9PT0gJ3N0cmluZycgJiYgdHlwZW9mIGJsb2NrLm5hbWUgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRcdC8vIFN0cmlwIHRoZSBpbi1wcm9jZXNzIE1DUCBzZXJ2ZXIgcHJlZml4IHNvIHRoZSB3b3JrYmVuY2ggcmVzb2x2ZXNcblx0XHRcdFx0Ly8gdGhlIHdvcmtiZW5jaC1yZWdpc3RlcmVkIHRvb2wgYnkgaXRzIHVucHJlZml4ZWQgbmFtZSAobWF0Y2hlcyB0aGVcblx0XHRcdFx0Ly8gbGl2ZSBzdHJlYW0gbWFwcGVyKS4gV2l0aG91dCB0aGlzLCByZXBsYXllZCBjbGllbnQtdG9vbCBjYWxsc1xuXHRcdFx0XHQvLyBmYWxsIGJhY2sgdG8gdGhlIGdlbmVyaWMgXCJSdW4gTUNQIHRvb2xcIiByZW5kZXJpbmcuXG5cdFx0XHRcdHRoaXMuX29wZW5Ub29sVXNlKGJsb2NrLmlkLCBzdHJpcENsaWVudFRvb2xOYW1lUHJlZml4KGJsb2NrLm5hbWUpLCBibG9jay5pbnB1dCwgaGFzQ2xpZW50VG9vbE5hbWVQcmVmaXgoYmxvY2submFtZSkpO1xuXHRcdFx0fVxuXHRcdFx0Ly8gT3RoZXIgYmxvY2sgdHlwZXMgKHNlcnZlcl90b29sX3VzZSwgZXRjLikgYXJlIGRyb3BwZWQgc2lsZW50bHkgcGVyIE03LlxuXHRcdH1cblx0XHRpZiAobXNnLnRpbWVzdGFtcCkge1xuXHRcdFx0dGhpcy5fYWN0aXZlLmxhc3RSZXNwb25zZUF0ID0gbXNnLnRpbWVzdGFtcDtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIF9vcGVuVG9vbFVzZSh0b29sVXNlSWQ6IHN0cmluZywgdG9vbE5hbWU6IHN0cmluZywgaW5wdXQ6IHVua25vd24sIGlzQ2xpZW50VG9vbDogYm9vbGVhbik6IHZvaWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmUgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGlzQ2xpZW50VG9vbCA/IHRvb2xOYW1lIDogZ2V0Q2xhdWRlVG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKTtcblx0XHRjb25zdCBwYXJzZWRJbnB1dCA9IGlucHV0ICE9PSBudWxsICYmIHR5cGVvZiBpbnB1dCA9PT0gJ29iamVjdCcgPyBpbnB1dCBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBtZXRhID0gaXNDbGllbnRUb29sID8gdW5kZWZpbmVkIDogYnVpbGRDbGF1ZGVUb29sTWV0YSh0b29sTmFtZSk7XG5cdFx0Ly8gQnVpbGQgYSBwbGFjZWhvbGRlciBDYW5jZWxsZWQgc3RhdGUgYnkgZGVmYXVsdDsgcmVwbGFjZWQgd2l0aCBDb21wbGV0ZWQgd2hlbiB0aGUgdG9vbF9yZXN1bHQgbGFuZHMuXG5cdFx0Y29uc3QgcGxhY2Vob2xkZXI6IFRvb2xDYWxsQ2FuY2VsbGVkU3RhdGUgPSB7XG5cdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNhbmNlbGxlZCxcblx0XHRcdHRvb2xDYWxsSWQ6IHRvb2xVc2VJZCxcblx0XHRcdHRvb2xOYW1lLFxuXHRcdFx0ZGlzcGxheU5hbWUsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogaXNDbGllbnRUb29sID8gZGlzcGxheU5hbWUgOiBnZXRDbGF1ZGVJbnZvY2F0aW9uTWVzc2FnZSh0b29sTmFtZSwgZGlzcGxheU5hbWUsIHBhcnNlZElucHV0KSxcblx0XHRcdHRvb2xJbnB1dDogcGFyc2VkSW5wdXQgIT09IHVuZGVmaW5lZFxuXHRcdFx0XHQ/IGlzQ2xpZW50VG9vbCA/IGZvcm1hdEdlbmVyaWNUb29sSW5wdXQocGFyc2VkSW5wdXQpIDogZ2V0Q2xhdWRlVG9vbElucHV0U3RyaW5nKHRvb2xOYW1lLCBwYXJzZWRJbnB1dClcblx0XHRcdFx0OiAodHlwZW9mIGlucHV0ID09PSAnc3RyaW5nJyA/IGlucHV0IDogaW5wdXQgIT09IHVuZGVmaW5lZCA/IHNhZmVTdHJpbmdpZnkoaW5wdXQpIDogdW5kZWZpbmVkKSxcblx0XHRcdHJlYXNvbjogVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZCxcblx0XHRcdC4uLihtZXRhID8geyBfbWV0YTogbWV0YSB9IDoge30pLFxuXHRcdH07XG5cdFx0Y29uc3QgcGFydDogVG9vbENhbGxSZXNwb25zZVBhcnQgPSB7XG5cdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsLFxuXHRcdFx0dG9vbENhbGw6IHBsYWNlaG9sZGVyLFxuXHRcdH07XG5cdFx0dGhpcy5fYWN0aXZlLnJlc3BvbnNlUGFydHMucHVzaChwYXJ0KTtcblx0XHR0aGlzLl9hY3RpdmUudG9vbENhbGxQYXJ0cy5zZXQodG9vbFVzZUlkLCBwYXJ0KTtcblx0XHR0aGlzLl9hY3RpdmUucGVuZGluZ1Rvb2xVc2VJZHMuYWRkKHRvb2xVc2VJZCk7XG5cdFx0dGhpcy5fdG9vbFVzZXMuc2V0KHRvb2xVc2VJZCwgeyB0dXJuSWQ6IHRoaXMuX2FjdGl2ZS5pZCwgcGFyc2VkSW5wdXQsIGlzQ2xpZW50VG9vbCB9KTtcblx0fVxuXG5cdHByaXZhdGUgX2F0dGFjaFRvb2xSZXN1bHQoYmxvY2s6IFVzZXJUb29sUmVzdWx0QmxvY2spOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGNvbnN0IGVudHJ5ID0gdGhpcy5fdG9vbFVzZXMuZ2V0KGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHRpZiAoZW50cnkgPT09IHVuZGVmaW5lZCkge1xuXHRcdFx0dGhpcy5fb3JwaGFuVG9vbFJlc3VsdHMrKztcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGFubm91bmNpbmdUdXJuSWQgPSBlbnRyeS50dXJuSWQ7XG5cdFx0Ly8gRmluZCB0aGUgcGFydCBcdTIwMTQgaXQgbGl2ZXMgb24gdGhlIGFubm91bmNpbmcgdHVybiAod2hpY2ggbWF5IGJlIGBfYWN0aXZlYCBvciBvbmUgYWxyZWFkeSBwdXNoZWQgdG8gYF90dXJuc2ApLlxuXHRcdGNvbnN0IHBhcnQgPSB0aGlzLl9maW5kVG9vbENhbGxQYXJ0KGFubm91bmNpbmdUdXJuSWQsIGJsb2NrLnRvb2xfdXNlX2lkKTtcblx0XHRpZiAocGFydCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRjb25zdCBpc0Vycm9yID0gYmxvY2suaXNfZXJyb3I7XG5cdFx0Y29uc3QgcHJldmlvdXNTdGF0ZSA9IHBhcnQudG9vbENhbGw7XG5cdFx0Y29uc3QgaXNTdWJhZ2VudCA9IHJlYWRUb29sQ2FsbE1ldGEocHJldmlvdXNTdGF0ZSkudG9vbEtpbmQgPT09ICdzdWJhZ2VudCc7XG5cdFx0Y29uc3QgY29udGVudDogVG9vbFJlc3VsdENvbnRlbnRbXSA9IGV4dHJhY3RUb29sUmVzdWx0Q29udGVudChibG9jay5jb250ZW50KSA/PyBbXTtcblx0XHRjb25zdCByZXN1bHRUZXh0ID0gY29udGVudFxuXHRcdFx0LmZpbHRlcigoYyk6IGMgaXMgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH0gPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dClcblx0XHRcdC5tYXAoYyA9PiBjLnRleHQpXG5cdFx0XHQuam9pbignXFxuJyk7XG5cdFx0aWYgKGlzU3ViYWdlbnQpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0cmVzb3VyY2U6IGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpKHRoaXMuX3Nlc3Npb24udG9TdHJpbmcoKSwgcHJldmlvdXNTdGF0ZS50b29sQ2FsbElkKSxcblx0XHRcdFx0dGl0bGU6IHByZXZpb3VzU3RhdGUuZGlzcGxheU5hbWUsXG5cdFx0XHR9KTtcblx0XHR9XG5cdFx0Y29uc3QgY29tcGxldGVkOiBUb29sQ2FsbENvbXBsZXRlZFN0YXRlID0ge1xuXHRcdFx0c3RhdHVzOiBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQsXG5cdFx0XHR0b29sQ2FsbElkOiBwcmV2aW91c1N0YXRlLnRvb2xDYWxsSWQsXG5cdFx0XHR0b29sTmFtZTogcHJldmlvdXNTdGF0ZS50b29sTmFtZSxcblx0XHRcdGRpc3BsYXlOYW1lOiBwcmV2aW91c1N0YXRlLmRpc3BsYXlOYW1lLFxuXHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IHByZXZpb3VzU3RhdGUuaW52b2NhdGlvbk1lc3NhZ2UgPz8gcHJldmlvdXNTdGF0ZS5kaXNwbGF5TmFtZSxcblx0XHRcdHRvb2xJbnB1dDogcHJldmlvdXNTdGF0ZS5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHVuZGVmaW5lZCA6IHByZXZpb3VzU3RhdGUudG9vbElucHV0LFxuXHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRzdWNjZXNzOiAhaXNFcnJvcixcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IGVudHJ5LmlzQ2xpZW50VG9vbFxuXHRcdFx0XHQ/IHByZXZpb3VzU3RhdGUuZGlzcGxheU5hbWVcblx0XHRcdFx0OiBnZXRDbGF1ZGVQYXN0VGVuc2VNZXNzYWdlKHByZXZpb3VzU3RhdGUudG9vbE5hbWUsIHByZXZpb3VzU3RhdGUuZGlzcGxheU5hbWUsIGVudHJ5LnBhcnNlZElucHV0LCAhaXNFcnJvciwgcmVzdWx0VGV4dCksXG5cdFx0XHRjb250ZW50OiBjb250ZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0Li4uKHByZXZpb3VzU3RhdGUuX21ldGEgPyB7IF9tZXRhOiBwcmV2aW91c1N0YXRlLl9tZXRhIH0gOiB7fSksXG5cdFx0fTtcblx0XHRwYXJ0LnRvb2xDYWxsID0gY29tcGxldGVkO1xuXHRcdC8vIERyYWluIHBlbmRpbmcgdHJhY2tlciBvbiB0aGUgYW5ub3VuY2luZyB0dXJuIFx1MjAxNCBidXQgb25seSBpZiB0aGF0XG5cdFx0Ly8gdHVybiBpcyBzdGlsbCBpbiBwcm9ncmVzcy4gQ29tbWl0dGVkIHR1cm5zIGhhdmUgdGhlaXIgc3RhdGVcblx0XHQvLyBsb2NrZWQgYXQgY2xvc2UgdGltZSBwZXIgRml4dHVyZSA2YiAoXCJvcnBoYW4gaW4gdHVybiBOIGRvZXNcblx0XHQvLyBOT1QgY2FuY2VsIHR1cm4gTisxXCIpOyBhIGxhdGUtYXJyaXZpbmcgdG9vbF9yZXN1bHQgZm9yIGFcblx0XHQvLyBjb21taXR0ZWQgdHVybiBkb2Vzbid0IHJlLXByb21vdGUgaXQuXG5cdFx0aWYgKHRoaXMuX2FjdGl2ZT8uaWQgPT09IGFubm91bmNpbmdUdXJuSWQpIHtcblx0XHRcdHRoaXMuX2FjdGl2ZS5wZW5kaW5nVG9vbFVzZUlkcy5kZWxldGUoYmxvY2sudG9vbF91c2VfaWQpO1xuXHRcdH1cblx0XHRyZXR1cm4gYW5ub3VuY2luZ1R1cm5JZDtcblx0fVxuXG5cdHByaXZhdGUgX2ZpbmRUb29sQ2FsbFBhcnQodHVybklkOiBzdHJpbmcsIHRvb2xVc2VJZDogc3RyaW5nKTogVG9vbENhbGxSZXNwb25zZVBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLl9hY3RpdmUgJiYgdGhpcy5fYWN0aXZlLmlkID09PSB0dXJuSWQpIHtcblx0XHRcdHJldHVybiB0aGlzLl9hY3RpdmUudG9vbENhbGxQYXJ0cy5nZXQodG9vbFVzZUlkKTtcblx0XHR9XG5cdFx0Ly8gQWxyZWFkeS1jbG9zZWQgdHVybjogc2VhcmNoIGNvbW1pdHRlZCBUdXJucy4gTGluZWFyIHNjYW4gaXMgZmluZSBcdTIwMTQgcmVwbGF5IGlzIG9uZS1zaG90IHBlciBzZXNzaW9uIGFuZCB0dXJucyBhcmUgTyh0ZW5zLWh1bmRyZWRzKS5cblx0XHRmb3IgKGxldCBpID0gdGhpcy5fdHVybnMubGVuZ3RoIC0gMTsgaSA+PSAwOyBpLS0pIHtcblx0XHRcdGlmICh0aGlzLl90dXJuc1tpXS5pZCAhPT0gdHVybklkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHRoaXMuX3R1cm5zW2ldLnJlc3BvbnNlUGFydHMpIHtcblx0XHRcdFx0aWYgKHBhcnQua2luZCA9PT0gUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbCAmJiBwYXJ0LnRvb2xDYWxsLnRvb2xDYWxsSWQgPT09IHRvb2xVc2VJZCkge1xuXHRcdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBfY2xvc2VBY3RpdmUoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2FjdGl2ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGEgPSB0aGlzLl9hY3RpdmU7XG5cdFx0Y29uc3Qgc3RhdGUgPSBhLnBlbmRpbmdUb29sVXNlSWRzLnNpemUgPT09IDAgPyBUdXJuU3RhdGUuQ29tcGxldGUgOiBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdGNvbnN0IHN0YXJ0ZWRBdCA9IGEuc3RhcnRlZEF0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBEYXRlLnBhcnNlKGEuc3RhcnRlZEF0KTtcblx0XHRjb25zdCBlbmRlZEF0ID0gYS5sYXN0UmVzcG9uc2VBdCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogRGF0ZS5wYXJzZShhLmxhc3RSZXNwb25zZUF0KTtcblx0XHRjb25zdCBkdXJhdGlvbiA9IHN0YXJ0ZWRBdCAhPT0gdW5kZWZpbmVkICYmIGVuZGVkQXQgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhcnRlZEF0KSAmJiBOdW1iZXIuaXNGaW5pdGUoZW5kZWRBdClcblx0XHRcdD8gTWF0aC5tYXgoMCwgZW5kZWRBdCAtIHN0YXJ0ZWRBdClcblx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IHR1cm46IFR1cm4gPSB7XG5cdFx0XHRpZDogYS5pZCxcblx0XHRcdHN0YXJ0ZWRBdDogYS5zdGFydGVkQXQsXG5cdFx0XHRkdXJhdGlvbixcblx0XHRcdG1lc3NhZ2U6IHsgdGV4dDogYS51c2VyVGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdFx0cmVzcG9uc2VQYXJ0czogYS5yZXNwb25zZVBhcnRzLFxuXHRcdFx0dXNhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlLFxuXHRcdH07XG5cdFx0dGhpcy5fdHVybnMucHVzaCh0dXJuKTtcblx0XHR0aGlzLl9hY3RpdmUgPSB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLy8gI2VuZHJlZ2lvblxuXG4vLyAjcmVnaW9uIEhlbHBlcnMgXHUyMDE0IG5hcnJvdy1hdC10aGUtc2VhbSBzaGFwZSByZWFkZXJzXG5cbi8qKlxuICogUmV0dXJucyBzdHJpbmcgY29udGVudCAobGVnYWN5IGZvcm0pIG9yIGFuIGFycmF5IG9mIHJlY29nbmlzZWQgdXNlclxuICogYmxvY2tzICh0ZXh0ICsgdG9vbF9yZXN1bHQpLiBBbnl0aGluZyBlbHNlIHJldHVybnMgYHVuZGVmaW5lZGAgYW5kIHRoZVxuICogY2FsbGVyIGRyb3BzIHRoZSBtZXNzYWdlIFx1MjAxNCBtYXRjaGVzIHRoZSBwcm9kdWN0aW9uIGV4dGVuc2lvbidzIHBhcnNlclxuICogc2VtYW50aWNzIHBlciBDT05URVhUIE03IGdsb3NzYXJ5LlxuICovXG5mdW5jdGlvbiByZWFkVXNlckNvbnRlbnQocmF3OiB1bmtub3duKTogc3RyaW5nIHwgUmVhZG9ubHlBcnJheTxVc2VyVGV4dEJsb2NrIHwgVXNlclRvb2xSZXN1bHRCbG9jaz4gfCB1bmRlZmluZWQge1xuXHRpZiAocmF3ID09PSBudWxsIHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBjb250ZW50ID0gKHJhdyBhcyB7IGNvbnRlbnQ/OiB1bmtub3duIH0pLmNvbnRlbnQ7XG5cdGlmICh0eXBlb2YgY29udGVudCA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkgfHwgY29udGVudC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG91dDogKFVzZXJUZXh0QmxvY2sgfCBVc2VyVG9vbFJlc3VsdEJsb2NrKVtdID0gW107XG5cdGZvciAoY29uc3QgYmxvY2sgb2YgY29udGVudCkge1xuXHRcdGlmIChibG9jayA9PT0gbnVsbCB8fCB0eXBlb2YgYmxvY2sgIT09ICdvYmplY3QnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0Y29uc3QgYiA9IGJsb2NrIGFzIHsgdHlwZT86IHVua25vd247IHRleHQ/OiB1bmtub3duOyB0b29sX3VzZV9pZD86IHVua25vd247IGNvbnRlbnQ/OiB1bmtub3duOyBpc19lcnJvcj86IHVua25vd24gfTtcblx0XHRpZiAoYi50eXBlID09PSAndGV4dCcgJiYgdHlwZW9mIGIudGV4dCA9PT0gJ3N0cmluZycpIHtcblx0XHRcdG91dC5wdXNoKHsgdHlwZTogJ3RleHQnLCB0ZXh0OiBiLnRleHQgfSk7XG5cdFx0fSBlbHNlIGlmIChiLnR5cGUgPT09ICd0b29sX3Jlc3VsdCcgJiYgdHlwZW9mIGIudG9vbF91c2VfaWQgPT09ICdzdHJpbmcnKSB7XG5cdFx0XHRvdXQucHVzaCh7IHR5cGU6ICd0b29sX3Jlc3VsdCcsIHRvb2xfdXNlX2lkOiBiLnRvb2xfdXNlX2lkLCBjb250ZW50OiBiLmNvbnRlbnQsIGlzX2Vycm9yOiBiLmlzX2Vycm9yID09PSB0cnVlIH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0Lmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHJlYWRBc3Npc3RhbnRCbG9ja3MocmF3OiB1bmtub3duKTogcmVhZG9ubHkgQXNzaXN0YW50QmxvY2tbXSB8IHVuZGVmaW5lZCB7XG5cdGlmIChyYXcgPT09IG51bGwgfHwgdHlwZW9mIHJhdyAhPT0gJ29iamVjdCcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQgPSAocmF3IGFzIHsgY29udGVudD86IHVua25vd24gfSkuY29udGVudDtcblx0aWYgKCFBcnJheS5pc0FycmF5KGNvbnRlbnQpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBvdXQ6IEFzc2lzdGFudEJsb2NrW10gPSBbXTtcblx0Zm9yIChjb25zdCBibG9jayBvZiBjb250ZW50KSB7XG5cdFx0aWYgKGJsb2NrID09PSBudWxsIHx8IHR5cGVvZiBibG9jayAhPT0gJ29iamVjdCcpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBiID0gYmxvY2sgYXMgeyB0eXBlPzogdW5rbm93bjsgdGV4dD86IHVua25vd247IHRoaW5raW5nPzogdW5rbm93bjsgaWQ/OiB1bmtub3duOyBuYW1lPzogdW5rbm93bjsgaW5wdXQ/OiB1bmtub3duIH07XG5cdFx0aWYgKHR5cGVvZiBiLnR5cGUgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0b3V0LnB1c2goe1xuXHRcdFx0dHlwZTogYi50eXBlLFxuXHRcdFx0dGV4dDogdHlwZW9mIGIudGV4dCA9PT0gJ3N0cmluZycgPyBiLnRleHQgOiB1bmRlZmluZWQsXG5cdFx0XHR0aGlua2luZzogdHlwZW9mIGIudGhpbmtpbmcgPT09ICdzdHJpbmcnID8gYi50aGlua2luZyA6IHVuZGVmaW5lZCxcblx0XHRcdGlkOiB0eXBlb2YgYi5pZCA9PT0gJ3N0cmluZycgPyBiLmlkIDogdW5kZWZpbmVkLFxuXHRcdFx0bmFtZTogdHlwZW9mIGIubmFtZSA9PT0gJ3N0cmluZycgPyBiLm5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRpbnB1dDogYi5pbnB1dCxcblx0XHR9KTtcblx0fVxuXHRyZXR1cm4gb3V0O1xufVxuXG5mdW5jdGlvbiByZWFkU3lzdGVtU3VidHlwZShyYXc6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAocmF3ID09PSBudWxsIHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBzdWJ0eXBlID0gKHJhdyBhcyB7IHN1YnR5cGU/OiB1bmtub3duIH0pLnN1YnR5cGU7XG5cdHJldHVybiB0eXBlb2Ygc3VidHlwZSA9PT0gJ3N0cmluZycgPyBzdWJ0eXBlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiByZWFkU3lzdGVtVGV4dChyYXc6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAocmF3ID09PSBudWxsIHx8IHR5cGVvZiByYXcgIT09ICdvYmplY3QnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByID0gcmF3IGFzIHsgdGV4dD86IHVua25vd247IG1lc3NhZ2U/OiB1bmtub3duIH07XG5cdGlmICh0eXBlb2Ygci50ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiByLnRleHQ7XG5cdH1cblx0aWYgKHR5cGVvZiByLm1lc3NhZ2UgPT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHIubWVzc2FnZTtcblx0fVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIE1pcnJvciBvZiB0aGUgbGl2ZSBtYXBwZXIncyBoZWxwZXIgXHUyMDE0IGtlcHQgaW5saW5lIHNvIHRoZSB0d28gbWFwcGVyc1xuICogZG9uJ3QgeWV0IG5lZWQgYSBzaGFyZWQgbW9kdWxlLiBJZiBhIHRoaXJkIGNvbnN1bWVyIGFwcGVhcnMsIGZhY3RvclxuICogdG8gYGNsYXVkZVRvb2xSZXN1bHRDb250ZW50LnRzYC5cbiAqL1xuZnVuY3Rpb24gZXh0cmFjdFRvb2xSZXN1bHRDb250ZW50KGNvbnRlbnQ6IHVua25vd24pOiB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0OyB0ZXh0OiBzdHJpbmcgfVtdIHwgdW5kZWZpbmVkIHtcblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBjb250ZW50Lmxlbmd0aCA+IDAgPyBbeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogY29udGVudCB9XSA6IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAoIUFycmF5LmlzQXJyYXkoY29udGVudCkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IG91dDogeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDsgdGV4dDogc3RyaW5nIH1bXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIGNvbnRlbnQpIHtcblx0XHRpZiAoYmxvY2sgPT09IG51bGwgfHwgdHlwZW9mIGJsb2NrICE9PSAnb2JqZWN0Jykge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGIgPSBibG9jayBhcyB7IHR5cGU/OiB1bmtub3duOyB0ZXh0PzogdW5rbm93biB9O1xuXHRcdGlmIChiLnR5cGUgPT09ICd0ZXh0JyAmJiB0eXBlb2YgYi50ZXh0ID09PSAnc3RyaW5nJykge1xuXHRcdFx0b3V0LnB1c2goeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dCwgdGV4dDogYi50ZXh0IH0pO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gb3V0Lmxlbmd0aCA+IDAgPyBvdXQgOiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHNhZmVTdHJpbmdpZnkodjogdW5rbm93bik6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIEpTT04uc3RyaW5naWZ5KHYpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogVHJ1ZSB3aGVuIHRoZSBtZXNzYWdlIGNvbnRlbnQgaXMgYSBDTEkgc2xhc2gtY29tbWFuZCBlY2hvIChlLmcuXG4gKiBgPGNvbW1hbmQtbmFtZT4vbW9kZWw8L2NvbW1hbmQtbmFtZT4uLi5gKSB0aGF0IHRoZSBzdWJwcm9jZXNzIHdyaXRlc1xuICogdG8gdGhlIHRyYW5zY3JpcHQgZm9yIHJlc3RvcmUgZmlkZWxpdHkgYnV0IGlzIG5vdCBhIHVzZXItYXV0aG9yZWQgcHJvbXB0LlxuICogQ2hlY2tzIHRoZSBmaXJzdCB0ZXh0IGZyYWdtZW50IG9ubHk7IG1peGVkIG1lc3NhZ2VzIHdoZXJlIHRoZSBmaXJzdFxuICogY29udGVudCBibG9jayBpcyBhIHJlYWwgcHJvbXB0IGFyZSBOT1QgZmlsdGVyZWQuXG4gKi9cbmZ1bmN0aW9uIGlzQ2xpRWNob0NvbnRlbnQoY29udGVudDogc3RyaW5nIHwgUmVhZG9ubHlBcnJheTxVc2VyVGV4dEJsb2NrIHwgVXNlclRvb2xSZXN1bHRCbG9jaz4pOiBib29sZWFuIHtcblx0aWYgKHR5cGVvZiBjb250ZW50ID09PSAnc3RyaW5nJykge1xuXHRcdHJldHVybiBDTElfRUNIT19NQVJLRVJfUEFUVEVSTi50ZXN0KGNvbnRlbnQpO1xuXHR9XG5cdGNvbnN0IGZpcnN0VGV4dCA9IGNvbnRlbnQuZmluZCgoYik6IGIgaXMgVXNlclRleHRCbG9jayA9PiBiLnR5cGUgPT09ICd0ZXh0Jyk7XG5cdHJldHVybiBmaXJzdFRleHQgIT09IHVuZGVmaW5lZCAmJiBDTElfRUNIT19NQVJLRVJfUEFUVEVSTi50ZXN0KGZpcnN0VGV4dC50ZXh0KTtcbn1cblxuLy8gI2VuZHJlZ2lvblxuIl0sCiAgIm1hcHBpbmdzIjogIkFBT0EsU0FBUyxnQkFBZ0I7QUFFekI7QUFBQSxFQUNDO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsRUFDQTtBQUFBLEVBQ0E7QUFBQSxFQUNBO0FBQUEsT0FPTTtBQUNQLFNBQVMsK0JBQStCO0FBQ3hDLFNBQVMsd0JBQXdCO0FBQ2pDLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMscUJBQXFCLDRCQUE0QiwyQkFBMkIsMEJBQTBCLGdDQUFnQztBQUMvSSxTQUFTLHlCQUF5QixpQ0FBaUM7QUFrQjVELFNBQVMsMEJBQ2YsVUFDQSxTQUNBLFlBQ2tCO0FBQ2xCLFFB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
