import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { isString } from "../../../../base/common/types.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { getInvocationMessage, getPastTenseMessage, getShellLanguage, getSubagentMetadata, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, synthesizeSkillToolCall } from "../../node/copilot/copilotToolDisplay.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
function extractSubagentMeta(start) {
  if (!start) {
    return {};
  }
  return {
    subagentDescription: start.subagentDescription,
    subagentAgentName: start.subagentAgentName
  };
}
function buildTurnsFromHistory(messages) {
  const turns = [];
  const subagentsByToolCallId = /* @__PURE__ */ new Map();
  let currentTurn;
  const finalizeTurn = (turn, state) => {
    turns.push({
      id: turn.id,
      message: turn.message,
      responseParts: turn.responseParts,
      usage: void 0,
      state
    });
  };
  const startTurn = (id, text) => ({
    id,
    message: { text, origin: { kind: MessageKind.User } },
    responseParts: [],
    pendingTools: /* @__PURE__ */ new Map()
  });
  for (const msg of messages) {
    if (msg.type === "message" && msg.role === "user") {
      if (currentTurn) {
        finalizeTurn(currentTurn, TurnState.Cancelled);
      }
      currentTurn = startTurn(msg.messageId, msg.content);
    } else if (msg.type === "message" && msg.role === "assistant") {
      if (msg.parentToolCallId) {
        continue;
      }
      if (!currentTurn) {
        currentTurn = startTurn(msg.messageId, "");
      }
      if (msg.reasoningText) {
        currentTurn.responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: generateUuid(),
          content: msg.reasoningText
        });
      }
      if (msg.content) {
        currentTurn.responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: generateUuid(),
          content: msg.content
        });
      }
      if (!msg.toolRequests || msg.toolRequests.length === 0) {
        finalizeTurn(currentTurn, TurnState.Complete);
        currentTurn = void 0;
      }
    } else if (msg.type === "subagent_started") {
      subagentsByToolCallId.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_start") {
      if (msg.parentToolCallId) {
        continue;
      }
      currentTurn?.pendingTools.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_complete") {
      if (msg.parentToolCallId) {
        continue;
      }
      if (currentTurn) {
        const start = currentTurn.pendingTools.get(msg.toolCallId);
        currentTurn.pendingTools.delete(msg.toolCallId);
        const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
        const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
        if (subagentEvent) {
          const parentSessionStr = msg.session.toString();
          contentWithSubagent.push({
            type: ToolResultContentType.Subagent,
            resource: buildSubagentSessionUri(parentSessionStr, msg.toolCallId),
            title: subagentEvent.agentDisplayName,
            agentName: subagentEvent.agentName,
            description: subagentEvent.agentDescription
          });
        }
        const tc = {
          status: ToolCallStatus.Completed,
          toolCallId: msg.toolCallId,
          toolName: start?.toolName ?? "unknown",
          displayName: start?.displayName ?? "Unknown Tool",
          invocationMessage: start?.invocationMessage ?? "Unknown tool",
          toolInput: start?.toolInput,
          success: msg.result.success,
          pastTenseMessage: msg.result.pastTenseMessage,
          content: contentWithSubagent.length > 0 ? contentWithSubagent : void 0,
          error: msg.result.error,
          confirmed: ToolCallConfirmationReason.NotNeeded,
          _meta: {
            toolKind: start?.toolKind,
            language: start?.language,
            ...extractSubagentMeta(start)
          }
        };
        currentTurn.responseParts.push({
          kind: ResponsePartKind.ToolCall,
          toolCall: tc
        });
      }
    }
  }
  if (currentTurn) {
    finalizeTurn(currentTurn, TurnState.Cancelled);
  }
  return turns;
}
function buildSubagentTurnsFromHistory(parentMessages, parentToolCallId, childSessionUri) {
  const innerToolCallIds = /* @__PURE__ */ new Set();
  for (const msg of parentMessages) {
    if ((msg.type === "tool_start" || msg.type === "tool_complete") && msg.parentToolCallId === parentToolCallId) {
      innerToolCallIds.add(msg.toolCallId);
    }
  }
  const subagentsByToolCallId = /* @__PURE__ */ new Map();
  for (const msg of parentMessages) {
    if (msg.type === "subagent_started" && innerToolCallIds.has(msg.toolCallId)) {
      subagentsByToolCallId.set(msg.toolCallId, msg);
    }
  }
  const innerMessages = parentMessages.filter((msg) => {
    if (msg.type === "tool_start" || msg.type === "tool_complete") {
      return msg.parentToolCallId === parentToolCallId;
    }
    if (msg.type === "message") {
      return msg.parentToolCallId === parentToolCallId;
    }
    return false;
  });
  if (innerMessages.length === 0) {
    return [];
  }
  const responseParts = [];
  const pendingTools = /* @__PURE__ */ new Map();
  for (const msg of innerMessages) {
    if (msg.type === "tool_start") {
      pendingTools.set(msg.toolCallId, msg);
    } else if (msg.type === "tool_complete") {
      const start = pendingTools.get(msg.toolCallId);
      pendingTools.delete(msg.toolCallId);
      const subagentEvent = subagentsByToolCallId.get(msg.toolCallId);
      const contentWithSubagent = msg.result.content ? [...msg.result.content] : [];
      if (subagentEvent) {
        contentWithSubagent.push({
          type: ToolResultContentType.Subagent,
          resource: buildSubagentSessionUri(childSessionUri, msg.toolCallId),
          title: subagentEvent.agentDisplayName,
          agentName: subagentEvent.agentName,
          description: subagentEvent.agentDescription
        });
      }
      const tc = {
        status: ToolCallStatus.Completed,
        toolCallId: msg.toolCallId,
        toolName: start?.toolName ?? "unknown",
        displayName: start?.displayName ?? "Unknown Tool",
        invocationMessage: start?.invocationMessage ?? "Unknown tool",
        toolInput: start?.toolInput,
        success: msg.result.success,
        pastTenseMessage: msg.result.pastTenseMessage,
        content: contentWithSubagent.length > 0 ? contentWithSubagent : void 0,
        error: msg.result.error,
        confirmed: ToolCallConfirmationReason.NotNeeded,
        _meta: {
          toolKind: start?.toolKind,
          language: start?.language,
          ...extractSubagentMeta(start)
        }
      };
      responseParts.push({
        kind: ResponsePartKind.ToolCall,
        toolCall: tc
      });
    } else if (msg.type === "message" && msg.role === "assistant") {
      if (msg.reasoningText) {
        responseParts.push({
          kind: ResponsePartKind.Reasoning,
          id: generateUuid(),
          content: msg.reasoningText
        });
      }
      if (msg.content) {
        responseParts.push({
          kind: ResponsePartKind.Markdown,
          id: generateUuid(),
          content: msg.content
        });
      }
    }
  }
  if (responseParts.length === 0) {
    return [];
  }
  return [{
    id: generateUuid(),
    message: { text: "", origin: { kind: MessageKind.User } },
    responseParts,
    usage: void 0,
    state: TurnState.Complete
  }];
}
function tryStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}
function isSyntheticUserMessage(event) {
  if (event.type !== "user.message") {
    return false;
  }
  const source = event.data?.source;
  return !!source && source.toLowerCase() !== "user";
}
async function mapSessionEventsToHistoryRecords(session, db, events, workingDirectory) {
  const result = [];
  const toolInfoByCallId = /* @__PURE__ */ new Map();
  const editToolCallIds = [];
  const parentToolCallIdByAgentId = /* @__PURE__ */ new Map();
  const resolveParentToolCallId = (agentId, deprecatedParentToolCallId) => {
    const mapped = agentId ? parentToolCallIdByAgentId.get(agentId) : void 0;
    return mapped ?? deprecatedParentToolCallId;
  };
  for (const e of events) {
    if (e.type === "subagent.started") {
      const sub = e;
      if (sub.agentId) {
        parentToolCallIdByAgentId.set(sub.agentId, sub.data.toolCallId);
      }
    }
    if (e.type === "tool.execution_start") {
      const d = e.data;
      if (isHiddenTool(d.toolName)) {
        continue;
      }
      const toolArgs = d.arguments !== void 0 ? tryStringify(d.arguments) : void 0;
      let parameters;
      if (toolArgs) {
        try {
          parameters = JSON.parse(toolArgs);
        } catch {
        }
      }
      const rewrittenArgs = stripRedundantCdPrefix(d.toolName, parameters, workingDirectory) ? tryStringify(parameters) : void 0;
      toolInfoByCallId.set(d.toolCallId, { toolName: d.toolName, parameters, rewrittenArgs });
      const command = isString(parameters?.command) ? parameters.command : void 0;
      if (isEditTool(d.toolName, command)) {
        editToolCallIds.push(d.toolCallId);
      }
    }
  }
  let storedEdits;
  if (db && editToolCallIds.length > 0) {
    try {
      const records = await db.getFileEdits(editToolCallIds);
      if (records.length > 0) {
        storedEdits = /* @__PURE__ */ new Map();
        for (const r of records) {
          let list = storedEdits.get(r.toolCallId);
          if (!list) {
            list = [];
            storedEdits.set(r.toolCallId, list);
          }
          list.push(r);
        }
      }
    } catch {
    }
  }
  const sessionUriStr = session.toString();
  for (const e of events) {
    if (e.type === "assistant.message" || e.type === "user.message") {
      if (isSyntheticUserMessage(e)) {
        continue;
      }
      const d = e.data;
      result.push({
        session,
        type: "message",
        role: e.type === "user.message" ? "user" : "assistant",
        messageId: d?.messageId ?? d?.interactionId ?? "",
        content: d?.content ?? "",
        toolRequests: d?.toolRequests?.map((tr) => ({
          toolCallId: tr.toolCallId,
          name: tr.name,
          arguments: tr.arguments !== void 0 ? tryStringify(tr.arguments) : void 0,
          type: tr.type
        })),
        reasoningOpaque: d?.reasoningOpaque,
        reasoningText: d?.reasoningText,
        encryptedContent: d?.encryptedContent,
        parentToolCallId: resolveParentToolCallId(e.agentId, d?.parentToolCallId)
      });
    } else if (e.type === "tool.execution_start") {
      const d = e.data;
      if (isHiddenTool(d.toolName)) {
        continue;
      }
      const info = toolInfoByCallId.get(d.toolCallId);
      const displayName = getToolDisplayName(d.toolName);
      const toolKind = getToolKind(d.toolName, info?.parameters);
      const toolArgs = info?.rewrittenArgs ?? (d.arguments !== void 0 ? tryStringify(d.arguments) : void 0);
      const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(info?.parameters) : void 0;
      result.push({
        session,
        type: "tool_start",
        toolCallId: d.toolCallId,
        toolName: d.toolName,
        displayName,
        invocationMessage: getInvocationMessage(d.toolName, displayName, info?.parameters),
        toolInput: getToolInputString(d.toolName, info?.parameters, toolArgs),
        toolKind,
        language: toolKind === "terminal" ? getShellLanguage(d.toolName) : void 0,
        subagentAgentName: subagentMeta?.agentName,
        subagentDescription: subagentMeta?.description,
        mcpServerName: d.mcpServerName,
        mcpToolName: d.mcpToolName,
        parentToolCallId: resolveParentToolCallId(e.agentId, d.parentToolCallId)
      });
    } else if (e.type === "tool.execution_complete") {
      const d = e.data;
      const info = toolInfoByCallId.get(d.toolCallId);
      if (!info) {
        continue;
      }
      toolInfoByCallId.delete(d.toolCallId);
      const displayName = getToolDisplayName(info.toolName);
      const toolOutput = d.error?.message ?? d.result?.content;
      const content = [];
      if (toolOutput !== void 0) {
        content.push({ type: ToolResultContentType.Text, text: toolOutput });
      }
      const edits = storedEdits?.get(d.toolCallId);
      if (edits) {
        for (const edit of edits) {
          const beforeUri = edit.kind === "rename" && edit.originalPath ? URI.file(edit.originalPath).toString() : URI.file(edit.filePath).toString();
          const afterUri = URI.file(edit.filePath).toString();
          const hasBefore = edit.kind !== "create";
          const hasAfter = edit.kind !== "delete";
          content.push({
            type: ToolResultContentType.FileEdit,
            before: hasBefore ? {
              uri: beforeUri,
              content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, "before") }
            } : void 0,
            after: hasAfter ? {
              uri: afterUri,
              content: { uri: buildSessionDbUri(sessionUriStr, edit.toolCallId, edit.filePath, "after") }
            } : void 0,
            diff: edit.addedLines !== void 0 || edit.removedLines !== void 0 ? { added: edit.addedLines, removed: edit.removedLines } : void 0
          });
        }
      }
      result.push({
        session,
        type: "tool_complete",
        toolCallId: d.toolCallId,
        result: {
          success: d.success,
          pastTenseMessage: getPastTenseMessage(info.toolName, displayName, info.parameters, d.success),
          content: content.length > 0 ? content : void 0,
          error: d.error
        },
        isUserRequested: d.isUserRequested,
        toolTelemetry: d.toolTelemetry !== void 0 ? tryStringify(d.toolTelemetry) : void 0,
        parentToolCallId: resolveParentToolCallId(e.agentId, d.parentToolCallId)
      });
    } else if (e.type === "subagent.started") {
      const d = e.data;
      result.push({
        session,
        type: "subagent_started",
        toolCallId: d.toolCallId,
        agentName: d.agentName,
        agentDisplayName: d.agentDisplayName,
        agentDescription: d.agentDescription
      });
    } else if (e.type === "skill.invoked") {
      const skillEvent = e;
      const synth = synthesizeSkillToolCall(skillEvent.data, skillEvent.id);
      result.push(
        { session, type: "tool_start", toolCallId: synth.toolCallId, toolName: synth.toolName, displayName: synth.displayName, invocationMessage: synth.invocationMessage },
        { session, type: "tool_complete", toolCallId: synth.toolCallId, result: { success: true, pastTenseMessage: synth.pastTenseMessage } }
      );
    }
  }
  return result;
}
export {
  buildSubagentTurnsFromHistory,
  buildTurnsFromHistory,
  mapSessionEventsToHistoryRecords
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFx0ZXN0XFxub2RlXFxoaXN0b3J5UmVjb3JkRml4dHVyZXMudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IHN0cmlwUmVkdW5kYW50Q2RQcmVmaXggfSBmcm9tICcuLi8uLi9jb21tb24vY29tbWFuZExpbmVIZWxwZXJzLmpzJztcbmltcG9ydCB0eXBlIHsgVG9vbEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBJRmlsZUVkaXRSZWNvcmQsIElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VLaW5kLCBSZXNwb25zZVBhcnRLaW5kLCBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbiwgVG9vbENhbGxTdGF0dXMsIFRvb2xSZXN1bHRDb250ZW50VHlwZSwgVHVyblN0YXRlLCBidWlsZFN1YmFnZW50U2Vzc2lvblVyaSwgdHlwZSBNZXNzYWdlLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsIHR5cGUgVG9vbFJlc3VsdENvbnRlbnQsIHR5cGUgVHVybiB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHsgZ2V0SW52b2NhdGlvbk1lc3NhZ2UsIGdldFBhc3RUZW5zZU1lc3NhZ2UsIGdldFNoZWxsTGFuZ3VhZ2UsIGdldFN1YmFnZW50TWV0YWRhdGEsIGdldFRvb2xEaXNwbGF5TmFtZSwgZ2V0VG9vbElucHV0U3RyaW5nLCBnZXRUb29sS2luZCwgaXNFZGl0VG9vbCwgaXNIaWRkZW5Ub29sLCBzeW50aGVzaXplU2tpbGxUb29sQ2FsbCB9IGZyb20gJy4uLy4uL25vZGUvY29waWxvdC9jb3BpbG90VG9vbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcbmltcG9ydCB0eXBlIHsgSVNlc3Npb25FdmVudCwgSVNlc3Npb25FdmVudE1lc3NhZ2UsIElTZXNzaW9uRXZlbnRTa2lsbEludm9rZWQsIElTZXNzaW9uRXZlbnRTdWJhZ2VudFN0YXJ0ZWQsIElTZXNzaW9uRXZlbnRUb29sQ29tcGxldGUsIElTZXNzaW9uRXZlbnRUb29sU3RhcnQgfSBmcm9tICcuL2NvcGlsb3RUZXN0RXZlbnRzLmpzJztcblxuLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cbi8vIEhpc3RvcnktcmVjb3JkIHRlc3QgZml4dHVyZXNcbi8vXG4vLyBGbGF0LCBkZWNsYXJhdGl2ZSBEU0wgdXNlZCBieSBtb2NrIGFnZW50cyBhbmQgdW5pdCB0ZXN0cyB0byBidWlsZCBzZXNzaW9uXG4vLyBoaXN0b3J5IHdpdGhvdXQgbWFudWFsbHkgY29uc3RydWN0aW5nIGBUdXJuW11gLiBSZWNvcmRzIG1pcnJvciB0aGUgd2lyZVxuLy8gc2hhcGUgb2YgYW4gU0RLIGV2ZW50IHN0cmVhbSBcdTIwMTQgYG1lc3NhZ2VgLCBgdG9vbF9zdGFydGAsIGB0b29sX2NvbXBsZXRlYCxcbi8vIGBzdWJhZ2VudF9zdGFydGVkYCBcdTIwMTQgc28gdHJhbnNjcmlwdHMgcmVhZCBsaWtlIHRoZSBwcm90b2NvbCB0aGV5J3JlXG4vLyBlbXVsYXRpbmcuXG4vL1xuLy8gUHJvZHVjdGlvbiBjb2RlIGRvZXMgTk9UIGRlcGVuZCBvbiB0aGlzIG1vZHVsZS4gVGhlIHJlYWxcbi8vIFNESy1ldmVudHMtdG8tVHVybltdIHBpcGVsaW5lIGluIGBub2RlL2NvcGlsb3QvbWFwU2Vzc2lvbkV2ZW50cy50c2AgcnVuc1xuLy8gaW4gYSBzaW5nbGUgcGFzcyB3aXRob3V0IHByb2R1Y2luZyB0aGUgaW50ZXJtZWRpYXRlIHJlY29yZCBzaGFwZS5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbmludGVyZmFjZSBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSBzZXNzaW9uOiBVUkk7XG59XG5cbmludGVyZmFjZSBJSGlzdG9yeU1lc3NhZ2VSZWNvcmQgZXh0ZW5kcyBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSB0eXBlOiAnbWVzc2FnZSc7XG5cdHJlYWRvbmx5IHJvbGU6ICd1c2VyJyB8ICdhc3Npc3RhbnQnO1xuXHRyZWFkb25seSBtZXNzYWdlSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgY29udGVudDogc3RyaW5nO1xuXHRyZWFkb25seSB0b29sUmVxdWVzdHM/OiByZWFkb25seSB7XG5cdFx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRcdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0XHRyZWFkb25seSBhcmd1bWVudHM/OiBzdHJpbmc7XG5cdFx0cmVhZG9ubHkgdHlwZT86ICdmdW5jdGlvbicgfCAnY3VzdG9tJztcblx0fVtdO1xuXHRyZWFkb25seSByZWFzb25pbmdPcGFxdWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlYXNvbmluZ1RleHQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGVuY3J5cHRlZENvbnRlbnQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUhpc3RvcnlUb29sU3RhcnRSZWNvcmQgZXh0ZW5kcyBJSGlzdG9yeVJlY29yZEJhc2Uge1xuXHRyZWFkb25seSB0eXBlOiAndG9vbF9zdGFydCc7XG5cdHJlYWRvbmx5IHRvb2xDYWxsSWQ6IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgZGlzcGxheU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgaW52b2NhdGlvbk1lc3NhZ2U6IFN0cmluZ09yTWFya2Rvd247XG5cdHJlYWRvbmx5IHRvb2xJbnB1dD86IHN0cmluZztcblx0cmVhZG9ubHkgdG9vbEtpbmQ/OiBUb29sS2luZDtcblx0cmVhZG9ubHkgbGFuZ3VhZ2U/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1YmFnZW50QWdlbnROYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBzdWJhZ2VudERlc2NyaXB0aW9uPzogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BUb29sTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgcGFyZW50VG9vbENhbGxJZD86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIElIaXN0b3J5VG9vbENvbXBsZXRlUmVjb3JkIGV4dGVuZHMgSUhpc3RvcnlSZWNvcmRCYXNlIHtcblx0cmVhZG9ubHkgdHlwZTogJ3Rvb2xfY29tcGxldGUnO1xuXHRyZWFkb25seSB0b29sQ2FsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3VsdDoge1xuXHRcdHJlYWRvbmx5IHN1Y2Nlc3M6IGJvb2xlYW47XG5cdFx0cmVhZG9ubHkgcGFzdFRlbnNlTWVzc2FnZTogU3RyaW5nT3JNYXJrZG93bjtcblx0XHRyZWFkb25seSBjb250ZW50PzogVG9vbFJlc3VsdENvbnRlbnRbXTtcblx0XHRyZWFkb25seSBlcnJvcj86IHsgcmVhZG9ubHkgbWVzc2FnZTogc3RyaW5nOyByZWFkb25seSBjb2RlPzogc3RyaW5nIH07XG5cdH07XG5cdHJlYWRvbmx5IGlzVXNlclJlcXVlc3RlZD86IGJvb2xlYW47XG5cdHJlYWRvbmx5IHRvb2xUZWxlbWV0cnk/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmVudFRvb2xDYWxsSWQ/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBJSGlzdG9yeVN1YmFnZW50U3RhcnRlZFJlY29yZCBleHRlbmRzIElIaXN0b3J5UmVjb3JkQmFzZSB7XG5cdHJlYWRvbmx5IHR5cGU6ICdzdWJhZ2VudF9zdGFydGVkJztcblx0cmVhZG9ubHkgdG9vbENhbGxJZDogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudE5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnREaXNwbGF5TmFtZTogc3RyaW5nO1xuXHRyZWFkb25seSBhZ2VudERlc2NyaXB0aW9uPzogc3RyaW5nO1xufVxuXG4vKiogVGVzdCBmaXh0dXJlIHJlY29yZC4gSGFuZC1jb25zdHJ1Y3RlZCBieSB0ZXN0cyB0byBzZWVkIG1vY2sgc2Vzc2lvbiBoaXN0b3JpZXMuICovXG5leHBvcnQgdHlwZSBJSGlzdG9yeVJlY29yZCA9XG5cdHwgSUhpc3RvcnlNZXNzYWdlUmVjb3JkXG5cdHwgSUhpc3RvcnlUb29sU3RhcnRSZWNvcmRcblx0fCBJSGlzdG9yeVRvb2xDb21wbGV0ZVJlY29yZFxuXHR8IElIaXN0b3J5U3ViYWdlbnRTdGFydGVkUmVjb3JkO1xuXG5mdW5jdGlvbiBleHRyYWN0U3ViYWdlbnRNZXRhKHN0YXJ0OiBJSGlzdG9yeVRvb2xTdGFydFJlY29yZCB8IHVuZGVmaW5lZCk6IHsgc3ViYWdlbnREZXNjcmlwdGlvbj86IHN0cmluZzsgc3ViYWdlbnRBZ2VudE5hbWU/OiBzdHJpbmcgfSB7XG5cdGlmICghc3RhcnQpIHtcblx0XHRyZXR1cm4ge307XG5cdH1cblx0cmV0dXJuIHtcblx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiBzdGFydC5zdWJhZ2VudERlc2NyaXB0aW9uLFxuXHRcdHN1YmFnZW50QWdlbnROYW1lOiBzdGFydC5zdWJhZ2VudEFnZW50TmFtZSxcblx0fTtcbn1cblxuLyoqXG4gKiBCdWlsZHMgYSBwYXJlbnQgc2Vzc2lvbidzIHtAbGluayBUdXJufXMgZnJvbSBhIGZsYXQgbGlzdCBvZiBoaXN0b3J5XG4gKiByZWNvcmRzLlxuICpcbiAqIEVhY2ggYHVzZXJgIG1lc3NhZ2Ugc3RhcnRzIGEgbmV3IHR1cm4uIElubmVyIHN1YmFnZW50IHJlY29yZHMgKHRob3NlXG4gKiBjYXJyeWluZyBgcGFyZW50VG9vbENhbGxJZGApIGFyZSBza2lwcGVkIFx1MjAxNCBzZWVcbiAqIHtAbGluayBidWlsZFN1YmFnZW50VHVybnNGcm9tSGlzdG9yeX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFR1cm5zRnJvbUhpc3RvcnkobWVzc2FnZXM6IHJlYWRvbmx5IElIaXN0b3J5UmVjb3JkW10pOiBUdXJuW10ge1xuXHRjb25zdCB0dXJuczogVHVybltdID0gW107XG5cdGNvbnN0IHN1YmFnZW50c0J5VG9vbENhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBJSGlzdG9yeVN1YmFnZW50U3RhcnRlZFJlY29yZD4oKTtcblx0bGV0IGN1cnJlbnRUdXJuOiB7XG5cdFx0aWQ6IHN0cmluZztcblx0XHRtZXNzYWdlOiBNZXNzYWdlO1xuXHRcdHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdO1xuXHRcdHBlbmRpbmdUb29sczogTWFwPHN0cmluZywgSUhpc3RvcnlUb29sU3RhcnRSZWNvcmQ+O1xuXHR9IHwgdW5kZWZpbmVkO1xuXG5cdGNvbnN0IGZpbmFsaXplVHVybiA9ICh0dXJuOiBOb25OdWxsYWJsZTx0eXBlb2YgY3VycmVudFR1cm4+LCBzdGF0ZTogVHVyblN0YXRlKTogdm9pZCA9PiB7XG5cdFx0dHVybnMucHVzaCh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdG1lc3NhZ2U6IHR1cm4ubWVzc2FnZSxcblx0XHRcdHJlc3BvbnNlUGFydHM6IHR1cm4ucmVzcG9uc2VQYXJ0cyxcblx0XHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0XHRzdGF0ZSxcblx0XHR9KTtcblx0fTtcblxuXHRjb25zdCBzdGFydFR1cm4gPSAoaWQ6IHN0cmluZywgdGV4dDogc3RyaW5nKTogTm9uTnVsbGFibGU8dHlwZW9mIGN1cnJlbnRUdXJuPiA9PiAoe1xuXHRcdGlkLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dCwgb3JpZ2luOiB7IGtpbmQ6IE1lc3NhZ2VLaW5kLlVzZXIgfSB9LFxuXHRcdHJlc3BvbnNlUGFydHM6IFtdLFxuXHRcdHBlbmRpbmdUb29sczogbmV3IE1hcCgpLFxuXHR9KTtcblxuXHRmb3IgKGNvbnN0IG1zZyBvZiBtZXNzYWdlcykge1xuXHRcdGlmIChtc2cudHlwZSA9PT0gJ21lc3NhZ2UnICYmIG1zZy5yb2xlID09PSAndXNlcicpIHtcblx0XHRcdGlmIChjdXJyZW50VHVybikge1xuXHRcdFx0XHRmaW5hbGl6ZVR1cm4oY3VycmVudFR1cm4sIFR1cm5TdGF0ZS5DYW5jZWxsZWQpO1xuXHRcdFx0fVxuXHRcdFx0Y3VycmVudFR1cm4gPSBzdGFydFR1cm4obXNnLm1lc3NhZ2VJZCwgbXNnLmNvbnRlbnQpO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICdtZXNzYWdlJyAmJiBtc2cucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcblx0XHRcdGlmIChtc2cucGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGlmICghY3VycmVudFR1cm4pIHtcblx0XHRcdFx0Y3VycmVudFR1cm4gPSBzdGFydFR1cm4obXNnLm1lc3NhZ2VJZCwgJycpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKG1zZy5yZWFzb25pbmdUZXh0KSB7XG5cdFx0XHRcdGN1cnJlbnRUdXJuLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0a2luZDogUmVzcG9uc2VQYXJ0S2luZC5SZWFzb25pbmcsXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG1zZy5yZWFzb25pbmdUZXh0LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmIChtc2cuY29udGVudCkge1xuXHRcdFx0XHRjdXJyZW50VHVybi5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdGNvbnRlbnQ6IG1zZy5jb250ZW50LFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHRcdGlmICghbXNnLnRvb2xSZXF1ZXN0cyB8fCBtc2cudG9vbFJlcXVlc3RzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0XHRmaW5hbGl6ZVR1cm4oY3VycmVudFR1cm4sIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0XHRcdGN1cnJlbnRUdXJuID0gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICdzdWJhZ2VudF9zdGFydGVkJykge1xuXHRcdFx0c3ViYWdlbnRzQnlUb29sQ2FsbElkLnNldChtc2cudG9vbENhbGxJZCwgbXNnKTtcblx0XHR9IGVsc2UgaWYgKG1zZy50eXBlID09PSAndG9vbF9zdGFydCcpIHtcblx0XHRcdGlmIChtc2cucGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGN1cnJlbnRUdXJuPy5wZW5kaW5nVG9vbHMuc2V0KG1zZy50b29sQ2FsbElkLCBtc2cpO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICd0b29sX2NvbXBsZXRlJykge1xuXHRcdFx0aWYgKG1zZy5wYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGN1cnJlbnRUdXJuKSB7XG5cdFx0XHRcdGNvbnN0IHN0YXJ0ID0gY3VycmVudFR1cm4ucGVuZGluZ1Rvb2xzLmdldChtc2cudG9vbENhbGxJZCk7XG5cdFx0XHRcdGN1cnJlbnRUdXJuLnBlbmRpbmdUb29scy5kZWxldGUobXNnLnRvb2xDYWxsSWQpO1xuXG5cdFx0XHRcdGNvbnN0IHN1YmFnZW50RXZlbnQgPSBzdWJhZ2VudHNCeVRvb2xDYWxsSWQuZ2V0KG1zZy50b29sQ2FsbElkKTtcblx0XHRcdFx0Y29uc3QgY29udGVudFdpdGhTdWJhZ2VudCA9IG1zZy5yZXN1bHQuY29udGVudCA/IFsuLi5tc2cucmVzdWx0LmNvbnRlbnRdIDogW107XG5cdFx0XHRcdGlmIChzdWJhZ2VudEV2ZW50KSB7XG5cdFx0XHRcdFx0Y29uc3QgcGFyZW50U2Vzc2lvblN0ciA9IG1zZy5zZXNzaW9uLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29udGVudFdpdGhTdWJhZ2VudC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5TdWJhZ2VudCxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnRTZXNzaW9uU3RyLCBtc2cudG9vbENhbGxJZCksXG5cdFx0XHRcdFx0XHR0aXRsZTogc3ViYWdlbnRFdmVudC5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdFx0YWdlbnROYW1lOiBzdWJhZ2VudEV2ZW50LmFnZW50TmFtZSxcblx0XHRcdFx0XHRcdGRlc2NyaXB0aW9uOiBzdWJhZ2VudEV2ZW50LmFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCB0YzogVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSA9IHtcblx0XHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0XHR0b29sQ2FsbElkOiBtc2cudG9vbENhbGxJZCxcblx0XHRcdFx0XHR0b29sTmFtZTogc3RhcnQ/LnRvb2xOYW1lID8/ICd1bmtub3duJyxcblx0XHRcdFx0XHRkaXNwbGF5TmFtZTogc3RhcnQ/LmRpc3BsYXlOYW1lID8/ICdVbmtub3duIFRvb2wnLFxuXHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBzdGFydD8uaW52b2NhdGlvbk1lc3NhZ2UgPz8gJ1Vua25vd24gdG9vbCcsXG5cdFx0XHRcdFx0dG9vbElucHV0OiBzdGFydD8udG9vbElucHV0LFxuXHRcdFx0XHRcdHN1Y2Nlc3M6IG1zZy5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBtc2cucmVzdWx0LnBhc3RUZW5zZU1lc3NhZ2UsXG5cdFx0XHRcdFx0Y29udGVudDogY29udGVudFdpdGhTdWJhZ2VudC5sZW5ndGggPiAwID8gY29udGVudFdpdGhTdWJhZ2VudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnJvcjogbXNnLnJlc3VsdC5lcnJvcixcblx0XHRcdFx0XHRjb25maXJtZWQ6IFRvb2xDYWxsQ29uZmlybWF0aW9uUmVhc29uLk5vdE5lZWRlZCxcblx0XHRcdFx0XHRfbWV0YToge1xuXHRcdFx0XHRcdFx0dG9vbEtpbmQ6IHN0YXJ0Py50b29sS2luZCxcblx0XHRcdFx0XHRcdGxhbmd1YWdlOiBzdGFydD8ubGFuZ3VhZ2UsXG5cdFx0XHRcdFx0XHQuLi5leHRyYWN0U3ViYWdlbnRNZXRhKHN0YXJ0KSxcblx0XHRcdFx0XHR9LFxuXHRcdFx0XHR9O1xuXHRcdFx0XHRjdXJyZW50VHVybi5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHRjLFxuXHRcdFx0XHR9KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAoY3VycmVudFR1cm4pIHtcblx0XHRmaW5hbGl6ZVR1cm4oY3VycmVudFR1cm4sIFR1cm5TdGF0ZS5DYW5jZWxsZWQpO1xuXHR9XG5cblx0cmV0dXJuIHR1cm5zO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUge0BsaW5rIFR1cm59cyBmb3IgYSBzdWJhZ2VudCBjaGlsZCBzZXNzaW9uIGJ5IGZpbHRlcmluZyB0aGVcbiAqIHBhcmVudCdzIGhpc3RvcnkgZm9yIHJlY29yZHMgY2FycnlpbmcgdGhlIG1hdGNoaW5nIGBwYXJlbnRUb29sQ2FsbElkYC5cbiAqIFJldHVybnMgYSBzaW5nbGUgdHVybiBjb250YWluaW5nIGFsbCBpbm5lciB0b29sIGNhbGxzIGFuZCBhc3Npc3RhbnRcbiAqIG1lc3NhZ2VzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRTdWJhZ2VudFR1cm5zRnJvbUhpc3RvcnkoXG5cdHBhcmVudE1lc3NhZ2VzOiByZWFkb25seSBJSGlzdG9yeVJlY29yZFtdLFxuXHRwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcsXG5cdGNoaWxkU2Vzc2lvblVyaTogc3RyaW5nLFxuKTogVHVybltdIHtcblx0Y29uc3QgaW5uZXJUb29sQ2FsbElkcyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXHRmb3IgKGNvbnN0IG1zZyBvZiBwYXJlbnRNZXNzYWdlcykge1xuXHRcdGlmICgobXNnLnR5cGUgPT09ICd0b29sX3N0YXJ0JyB8fCBtc2cudHlwZSA9PT0gJ3Rvb2xfY29tcGxldGUnKSAmJiBtc2cucGFyZW50VG9vbENhbGxJZCA9PT0gcGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0aW5uZXJUb29sQ2FsbElkcy5hZGQobXNnLnRvb2xDYWxsSWQpO1xuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHN1YmFnZW50c0J5VG9vbENhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBJSGlzdG9yeVN1YmFnZW50U3RhcnRlZFJlY29yZD4oKTtcblx0Zm9yIChjb25zdCBtc2cgb2YgcGFyZW50TWVzc2FnZXMpIHtcblx0XHRpZiAobXNnLnR5cGUgPT09ICdzdWJhZ2VudF9zdGFydGVkJyAmJiBpbm5lclRvb2xDYWxsSWRzLmhhcyhtc2cudG9vbENhbGxJZCkpIHtcblx0XHRcdHN1YmFnZW50c0J5VG9vbENhbGxJZC5zZXQobXNnLnRvb2xDYWxsSWQsIG1zZyk7XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgaW5uZXJNZXNzYWdlcyA9IHBhcmVudE1lc3NhZ2VzLmZpbHRlcihtc2cgPT4ge1xuXHRcdGlmIChtc2cudHlwZSA9PT0gJ3Rvb2xfc3RhcnQnIHx8IG1zZy50eXBlID09PSAndG9vbF9jb21wbGV0ZScpIHtcblx0XHRcdHJldHVybiBtc2cucGFyZW50VG9vbENhbGxJZCA9PT0gcGFyZW50VG9vbENhbGxJZDtcblx0XHR9XG5cdFx0aWYgKG1zZy50eXBlID09PSAnbWVzc2FnZScpIHtcblx0XHRcdHJldHVybiBtc2cucGFyZW50VG9vbENhbGxJZCA9PT0gcGFyZW50VG9vbENhbGxJZDtcblx0XHR9XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9KTtcblxuXHRpZiAoaW5uZXJNZXNzYWdlcy5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblxuXHRjb25zdCByZXNwb25zZVBhcnRzOiBSZXNwb25zZVBhcnRbXSA9IFtdO1xuXHRjb25zdCBwZW5kaW5nVG9vbHMgPSBuZXcgTWFwPHN0cmluZywgSUhpc3RvcnlUb29sU3RhcnRSZWNvcmQ+KCk7XG5cblx0Zm9yIChjb25zdCBtc2cgb2YgaW5uZXJNZXNzYWdlcykge1xuXHRcdGlmIChtc2cudHlwZSA9PT0gJ3Rvb2xfc3RhcnQnKSB7XG5cdFx0XHRwZW5kaW5nVG9vbHMuc2V0KG1zZy50b29sQ2FsbElkLCBtc2cpO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICd0b29sX2NvbXBsZXRlJykge1xuXHRcdFx0Y29uc3Qgc3RhcnQgPSBwZW5kaW5nVG9vbHMuZ2V0KG1zZy50b29sQ2FsbElkKTtcblx0XHRcdHBlbmRpbmdUb29scy5kZWxldGUobXNnLnRvb2xDYWxsSWQpO1xuXG5cdFx0XHRjb25zdCBzdWJhZ2VudEV2ZW50ID0gc3ViYWdlbnRzQnlUb29sQ2FsbElkLmdldChtc2cudG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBjb250ZW50V2l0aFN1YmFnZW50ID0gbXNnLnJlc3VsdC5jb250ZW50ID8gWy4uLm1zZy5yZXN1bHQuY29udGVudF0gOiBbXTtcblx0XHRcdGlmIChzdWJhZ2VudEV2ZW50KSB7XG5cdFx0XHRcdGNvbnRlbnRXaXRoU3ViYWdlbnQucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlN1YmFnZW50LFxuXHRcdFx0XHRcdHJlc291cmNlOiBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShjaGlsZFNlc3Npb25VcmksIG1zZy50b29sQ2FsbElkKSxcblx0XHRcdFx0XHR0aXRsZTogc3ViYWdlbnRFdmVudC5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRcdGFnZW50TmFtZTogc3ViYWdlbnRFdmVudC5hZ2VudE5hbWUsXG5cdFx0XHRcdFx0ZGVzY3JpcHRpb246IHN1YmFnZW50RXZlbnQuYWdlbnREZXNjcmlwdGlvbixcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHRjOiBUb29sQ2FsbENvbXBsZXRlZFN0YXRlID0ge1xuXHRcdFx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHRcdFx0dG9vbENhbGxJZDogbXNnLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBzdGFydD8udG9vbE5hbWUgPz8gJ3Vua25vd24nLFxuXHRcdFx0XHRkaXNwbGF5TmFtZTogc3RhcnQ/LmRpc3BsYXlOYW1lID8/ICdVbmtub3duIFRvb2wnLFxuXHRcdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogc3RhcnQ/Lmludm9jYXRpb25NZXNzYWdlID8/ICdVbmtub3duIHRvb2wnLFxuXHRcdFx0XHR0b29sSW5wdXQ6IHN0YXJ0Py50b29sSW5wdXQsXG5cdFx0XHRcdHN1Y2Nlc3M6IG1zZy5yZXN1bHQuc3VjY2Vzcyxcblx0XHRcdFx0cGFzdFRlbnNlTWVzc2FnZTogbXNnLnJlc3VsdC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0XHRjb250ZW50OiBjb250ZW50V2l0aFN1YmFnZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50V2l0aFN1YmFnZW50IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRlcnJvcjogbXNnLnJlc3VsdC5lcnJvcixcblx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdF9tZXRhOiB7XG5cdFx0XHRcdFx0dG9vbEtpbmQ6IHN0YXJ0Py50b29sS2luZCxcblx0XHRcdFx0XHRsYW5ndWFnZTogc3RhcnQ/Lmxhbmd1YWdlLFxuXHRcdFx0XHRcdC4uLmV4dHJhY3RTdWJhZ2VudE1ldGEoc3RhcnQpLFxuXHRcdFx0XHR9LFxuXHRcdFx0fTtcblx0XHRcdHJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdHRvb2xDYWxsOiB0Yyxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAobXNnLnR5cGUgPT09ICdtZXNzYWdlJyAmJiBtc2cucm9sZSA9PT0gJ2Fzc2lzdGFudCcpIHtcblx0XHRcdGlmIChtc2cucmVhc29uaW5nVGV4dCkge1xuXHRcdFx0XHRyZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLFxuXHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRjb250ZW50OiBtc2cucmVhc29uaW5nVGV4dCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0XHRpZiAobXNnLmNvbnRlbnQpIHtcblx0XHRcdFx0cmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRraW5kOiBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duLFxuXHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRjb250ZW50OiBtc2cuY29udGVudCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0aWYgKHJlc3BvbnNlUGFydHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cblx0cmV0dXJuIFt7XG5cdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdG1lc3NhZ2U6IHsgdGV4dDogJycsIG9yaWdpbjogeyBraW5kOiBNZXNzYWdlS2luZC5Vc2VyIH0gfSxcblx0XHRyZXNwb25zZVBhcnRzLFxuXHRcdHVzYWdlOiB1bmRlZmluZWQsXG5cdFx0c3RhdGU6IFR1cm5TdGF0ZS5Db21wbGV0ZSxcblx0fV07XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTREstZXZlbnRzLXRvLWhpc3RvcnktcmVjb3JkcyAodGVzdCBmaXh0dXJlIGxvYWRlcilcbi8vXG4vLyBUcmFuc2xhdGVzIHJhdyBDb3BpbG90IFNESyBzZXNzaW9uIGV2ZW50cyBpbnRvIGEgZmxhdCBJSGlzdG9yeVJlY29yZFxuLy8gc3RyZWFtLiBUaGlzIGlzIHRoZSB0ZXN0LXNpZGUgZXF1aXZhbGVudCBvZiB0aGUgcHJvZHVjdGlvbiBzaW5nbGUtcGFzc1xuLy8gYG1hcFNlc3Npb25FdmVudHNgICh3aGljaCBnb2VzIGRpcmVjdGx5IHRvIFR1cm5bXSkuIEl0IGV4aXN0cyBzbyBKU09OTFxuLy8gZml4dHVyZXMgY2FwdHVyZWQgZnJvbSByZWFsIGB+Ly5jb3BpbG90L3Nlc3Npb24tc3RhdGUvYCBmaWxlcyBjYW4gYmVcbi8vIGxvYWRlZCBpbnRvIHRoZSB0ZXN0IERTTCB3aXRob3V0IGZvcmNpbmcgdGVzdHMgdG8gYWxzbyBhZG9wdCBUdXJuW10uXG4vLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxuXG5mdW5jdGlvbiB0cnlTdHJpbmdpZnkodmFsdWU6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHR0cnkge1xuXHRcdHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gaXNTeW50aGV0aWNVc2VyTWVzc2FnZShldmVudDogSVNlc3Npb25FdmVudCk6IGJvb2xlYW4ge1xuXHRpZiAoZXZlbnQudHlwZSAhPT0gJ3VzZXIubWVzc2FnZScpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0Y29uc3Qgc291cmNlID0gKGV2ZW50IGFzIElTZXNzaW9uRXZlbnRNZXNzYWdlKS5kYXRhPy5zb3VyY2U7XG5cdHJldHVybiAhIXNvdXJjZSAmJiBzb3VyY2UudG9Mb3dlckNhc2UoKSAhPT0gJ3VzZXInO1xufVxuXG4vKipcbiAqIE1hcHMgcmF3IFNESyBzZXNzaW9uIGV2ZW50cyBpbnRvIGEgZmxhdCBsaXN0IG9mIHtAbGluayBJSGlzdG9yeVJlY29yZH1zLFxuICogcmVzdG9yaW5nIHN0b3JlZCBmaWxlLWVkaXQgbWV0YWRhdGEgZnJvbSB0aGUgc2Vzc2lvbiBkYXRhYmFzZSB3aGVuXG4gKiBhdmFpbGFibGUuIFRlc3QtZml4dHVyZS1vbmx5LlxuICovXG5leHBvcnQgYXN5bmMgZnVuY3Rpb24gbWFwU2Vzc2lvbkV2ZW50c1RvSGlzdG9yeVJlY29yZHMoXG5cdHNlc3Npb246IFVSSSxcblx0ZGI6IElTZXNzaW9uRGF0YWJhc2UgfCB1bmRlZmluZWQsXG5cdGV2ZW50czogcmVhZG9ubHkgSVNlc3Npb25FdmVudFtdLFxuXHR3b3JraW5nRGlyZWN0b3J5PzogVVJJLFxuKTogUHJvbWlzZTxJSGlzdG9yeVJlY29yZFtdPiB7XG5cdGNvbnN0IHJlc3VsdDogSUhpc3RvcnlSZWNvcmRbXSA9IFtdO1xuXHRjb25zdCB0b29sSW5mb0J5Q2FsbElkID0gbmV3IE1hcDxzdHJpbmcsIHsgdG9vbE5hbWU6IHN0cmluZzsgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7IHJld3JpdHRlbkFyZ3M/OiBzdHJpbmcgfT4oKTtcblx0Y29uc3QgZWRpdFRvb2xDYWxsSWRzOiBzdHJpbmdbXSA9IFtdO1xuXG5cdC8vIFRoZSBTREsgdGFncyBzdWItYWdlbnQgZXZlbnRzIHdpdGggYW4gZW52ZWxvcGUtbGV2ZWwgYGFnZW50SWRgICh0aGVcblx0Ly8gYGRhdGEucGFyZW50VG9vbENhbGxJZGAgZmllbGQgaXMgZGVwcmVjYXRlZCkuIGBzdWJhZ2VudC5zdGFydGVkYCBtYXBzIHRoZVxuXHQvLyBzdWItYWdlbnQncyBgYWdlbnRJZGAgdG8gdGhlIHBhcmVudCB0b29sIGNhbGwgaWQ7IHJlc29sdmUgbGF0ZXIgZXZlbnRzXG5cdC8vIHRocm91Z2ggaXQgc28gdGhlIHByb2R1Y2VkIHJlY29yZHMgY2FycnkgdGhlIHJpZ2h0IGBwYXJlbnRUb29sQ2FsbElkYC5cblx0Y29uc3QgcGFyZW50VG9vbENhbGxJZEJ5QWdlbnRJZCA9IG5ldyBNYXA8c3RyaW5nLCBzdHJpbmc+KCk7XG5cdGNvbnN0IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkID0gKGFnZW50SWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgZGVwcmVjYXRlZFBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCA9PiB7XG5cdFx0Y29uc3QgbWFwcGVkID0gYWdlbnRJZCA/IHBhcmVudFRvb2xDYWxsSWRCeUFnZW50SWQuZ2V0KGFnZW50SWQpIDogdW5kZWZpbmVkO1xuXHRcdHJldHVybiBtYXBwZWQgPz8gZGVwcmVjYXRlZFBhcmVudFRvb2xDYWxsSWQ7XG5cdH07XG5cblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdGlmIChlLnR5cGUgPT09ICdzdWJhZ2VudC5zdGFydGVkJykge1xuXHRcdFx0Y29uc3Qgc3ViID0gZSBhcyBJU2Vzc2lvbkV2ZW50U3ViYWdlbnRTdGFydGVkO1xuXHRcdFx0aWYgKHN1Yi5hZ2VudElkKSB7XG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWRCeUFnZW50SWQuc2V0KHN1Yi5hZ2VudElkLCBzdWIuZGF0YS50b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jykge1xuXHRcdFx0Y29uc3QgZCA9IChlIGFzIElTZXNzaW9uRXZlbnRUb29sU3RhcnQpLmRhdGE7XG5cdFx0XHRpZiAoaXNIaWRkZW5Ub29sKGQudG9vbE5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdG9vbEFyZ3MgPSBkLmFyZ3VtZW50cyAhPT0gdW5kZWZpbmVkID8gdHJ5U3RyaW5naWZ5KGQuYXJndW1lbnRzKSA6IHVuZGVmaW5lZDtcblx0XHRcdGxldCBwYXJhbWV0ZXJzOiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiB8IHVuZGVmaW5lZDtcblx0XHRcdGlmICh0b29sQXJncykge1xuXHRcdFx0XHR0cnkgeyBwYXJhbWV0ZXJzID0gSlNPTi5wYXJzZSh0b29sQXJncykgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHRcdFx0fVxuXHRcdFx0Y29uc3QgcmV3cml0dGVuQXJncyA9IHN0cmlwUmVkdW5kYW50Q2RQcmVmaXgoZC50b29sTmFtZSwgcGFyYW1ldGVycywgd29ya2luZ0RpcmVjdG9yeSkgPyB0cnlTdHJpbmdpZnkocGFyYW1ldGVycykgOiB1bmRlZmluZWQ7XG5cdFx0XHR0b29sSW5mb0J5Q2FsbElkLnNldChkLnRvb2xDYWxsSWQsIHsgdG9vbE5hbWU6IGQudG9vbE5hbWUsIHBhcmFtZXRlcnMsIHJld3JpdHRlbkFyZ3MgfSk7XG5cdFx0XHRjb25zdCBjb21tYW5kID0gaXNTdHJpbmcocGFyYW1ldGVycz8uY29tbWFuZCkgPyBwYXJhbWV0ZXJzLmNvbW1hbmQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNFZGl0VG9vbChkLnRvb2xOYW1lLCBjb21tYW5kKSkge1xuXHRcdFx0XHRlZGl0VG9vbENhbGxJZHMucHVzaChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdGxldCBzdG9yZWRFZGl0czogTWFwPHN0cmluZywgSUZpbGVFZGl0UmVjb3JkW10+IHwgdW5kZWZpbmVkO1xuXHRpZiAoZGIgJiYgZWRpdFRvb2xDYWxsSWRzLmxlbmd0aCA+IDApIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVjb3JkcyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhlZGl0VG9vbENhbGxJZHMpO1xuXHRcdFx0aWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzdG9yZWRFZGl0cyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJlY29yZHMpIHtcblx0XHRcdFx0XHRsZXQgbGlzdCA9IHN0b3JlZEVkaXRzLmdldChyLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IFtdO1xuXHRcdFx0XHRcdFx0c3RvcmVkRWRpdHMuc2V0KHIudG9vbENhbGxJZCwgbGlzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRGF0YWJhc2UgbWF5IG5vdCBleGlzdCB5ZXQgXHUyMDE0IHRoYXQncyBmaW5lLlxuXHRcdH1cblx0fVxuXG5cdGNvbnN0IHNlc3Npb25VcmlTdHIgPSBzZXNzaW9uLnRvU3RyaW5nKCk7XG5cblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdGlmIChlLnR5cGUgPT09ICdhc3Npc3RhbnQubWVzc2FnZScgfHwgZS50eXBlID09PSAndXNlci5tZXNzYWdlJykge1xuXHRcdFx0aWYgKGlzU3ludGhldGljVXNlck1lc3NhZ2UoZSkpIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBkID0gKGUgYXMgSVNlc3Npb25FdmVudE1lc3NhZ2UpLmRhdGE7XG5cdFx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRcdHNlc3Npb24sXG5cdFx0XHRcdHR5cGU6ICdtZXNzYWdlJyxcblx0XHRcdFx0cm9sZTogZS50eXBlID09PSAndXNlci5tZXNzYWdlJyA/ICd1c2VyJyA6ICdhc3Npc3RhbnQnLFxuXHRcdFx0XHRtZXNzYWdlSWQ6IGQ/Lm1lc3NhZ2VJZCA/PyBkPy5pbnRlcmFjdGlvbklkID8/ICcnLFxuXHRcdFx0XHRjb250ZW50OiBkPy5jb250ZW50ID8/ICcnLFxuXHRcdFx0XHR0b29sUmVxdWVzdHM6IGQ/LnRvb2xSZXF1ZXN0cz8ubWFwKHRyID0+ICh7XG5cdFx0XHRcdFx0dG9vbENhbGxJZDogdHIudG9vbENhbGxJZCxcblx0XHRcdFx0XHRuYW1lOiB0ci5uYW1lLFxuXHRcdFx0XHRcdGFyZ3VtZW50czogdHIuYXJndW1lbnRzICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkodHIuYXJndW1lbnRzKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHR0eXBlOiB0ci50eXBlLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdHJlYXNvbmluZ09wYXF1ZTogZD8ucmVhc29uaW5nT3BhcXVlLFxuXHRcdFx0XHRyZWFzb25pbmdUZXh0OiBkPy5yZWFzb25pbmdUZXh0LFxuXHRcdFx0XHRlbmNyeXB0ZWRDb250ZW50OiBkPy5lbmNyeXB0ZWRDb250ZW50LFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiByZXNvbHZlUGFyZW50VG9vbENhbGxJZCgoZSBhcyBJU2Vzc2lvbkV2ZW50TWVzc2FnZSkuYWdlbnRJZCwgZD8ucGFyZW50VG9vbENhbGxJZCksXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jykge1xuXHRcdFx0Y29uc3QgZCA9IChlIGFzIElTZXNzaW9uRXZlbnRUb29sU3RhcnQpLmRhdGE7XG5cdFx0XHRpZiAoaXNIaWRkZW5Ub29sKGQudG9vbE5hbWUpKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgaW5mbyA9IHRvb2xJbmZvQnlDYWxsSWQuZ2V0KGQudG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBkaXNwbGF5TmFtZSA9IGdldFRvb2xEaXNwbGF5TmFtZShkLnRvb2xOYW1lKTtcblx0XHRcdGNvbnN0IHRvb2xLaW5kID0gZ2V0VG9vbEtpbmQoZC50b29sTmFtZSwgaW5mbz8ucGFyYW1ldGVycyk7XG5cdFx0XHRjb25zdCB0b29sQXJncyA9IGluZm8/LnJld3JpdHRlbkFyZ3MgPz8gKGQuYXJndW1lbnRzICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkoZC5hcmd1bWVudHMpIDogdW5kZWZpbmVkKTtcblx0XHRcdGNvbnN0IHN1YmFnZW50TWV0YSA9IHRvb2xLaW5kID09PSAnc3ViYWdlbnQnID8gZ2V0U3ViYWdlbnRNZXRhZGF0YShpbmZvPy5wYXJhbWV0ZXJzKSA6IHVuZGVmaW5lZDtcblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0dHlwZTogJ3Rvb2xfc3RhcnQnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBkLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHRvb2xOYW1lOiBkLnRvb2xOYW1lLFxuXHRcdFx0XHRkaXNwbGF5TmFtZSxcblx0XHRcdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGdldEludm9jYXRpb25NZXNzYWdlKGQudG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBpbmZvPy5wYXJhbWV0ZXJzKSxcblx0XHRcdFx0dG9vbElucHV0OiBnZXRUb29sSW5wdXRTdHJpbmcoZC50b29sTmFtZSwgaW5mbz8ucGFyYW1ldGVycywgdG9vbEFyZ3MpLFxuXHRcdFx0XHR0b29sS2luZCxcblx0XHRcdFx0bGFuZ3VhZ2U6IHRvb2xLaW5kID09PSAndGVybWluYWwnID8gZ2V0U2hlbGxMYW5ndWFnZShkLnRvb2xOYW1lKSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3ViYWdlbnRBZ2VudE5hbWU6IHN1YmFnZW50TWV0YT8uYWdlbnROYW1lLFxuXHRcdFx0XHRzdWJhZ2VudERlc2NyaXB0aW9uOiBzdWJhZ2VudE1ldGE/LmRlc2NyaXB0aW9uLFxuXHRcdFx0XHRtY3BTZXJ2ZXJOYW1lOiBkLm1jcFNlcnZlck5hbWUsXG5cdFx0XHRcdG1jcFRvb2xOYW1lOiBkLm1jcFRvb2xOYW1lLFxuXHRcdFx0XHRwYXJlbnRUb29sQ2FsbElkOiByZXNvbHZlUGFyZW50VG9vbENhbGxJZCgoZSBhcyBJU2Vzc2lvbkV2ZW50VG9vbFN0YXJ0KS5hZ2VudElkLCBkLnBhcmVudFRvb2xDYWxsSWQpLFxuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmIChlLnR5cGUgPT09ICd0b29sLmV4ZWN1dGlvbl9jb21wbGV0ZScpIHtcblx0XHRcdGNvbnN0IGQgPSAoZSBhcyBJU2Vzc2lvbkV2ZW50VG9vbENvbXBsZXRlKS5kYXRhO1xuXHRcdFx0Y29uc3QgaW5mbyA9IHRvb2xJbmZvQnlDYWxsSWQuZ2V0KGQudG9vbENhbGxJZCk7XG5cdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0Y29udGludWU7XG5cdFx0XHR9XG5cdFx0XHR0b29sSW5mb0J5Q2FsbElkLmRlbGV0ZShkLnRvb2xDYWxsSWQpO1xuXHRcdFx0Y29uc3QgZGlzcGxheU5hbWUgPSBnZXRUb29sRGlzcGxheU5hbWUoaW5mby50b29sTmFtZSk7XG5cdFx0XHRjb25zdCB0b29sT3V0cHV0ID0gZC5lcnJvcj8ubWVzc2FnZSA/PyBkLnJlc3VsdD8uY29udGVudDtcblx0XHRcdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gPSBbXTtcblx0XHRcdGlmICh0b29sT3V0cHV0ICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0Y29udGVudC5wdXNoKHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQsIHRleHQ6IHRvb2xPdXRwdXQgfSk7XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBlZGl0cyA9IHN0b3JlZEVkaXRzPy5nZXQoZC50b29sQ2FsbElkKTtcblx0XHRcdGlmIChlZGl0cykge1xuXHRcdFx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdFx0XHRjb25zdCBiZWZvcmVVcmkgPSBlZGl0LmtpbmQgPT09ICdyZW5hbWUnICYmIGVkaXQub3JpZ2luYWxQYXRoXG5cdFx0XHRcdFx0XHQ/IFVSSS5maWxlKGVkaXQub3JpZ2luYWxQYXRoKS50b1N0cmluZygpXG5cdFx0XHRcdFx0XHQ6IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRcdFx0Y29uc3QgYWZ0ZXJVcmkgPSBVUkkuZmlsZShlZGl0LmZpbGVQYXRoKS50b1N0cmluZygpO1xuXHRcdFx0XHRcdGNvbnN0IGhhc0JlZm9yZSA9IGVkaXQua2luZCAhPT0gJ2NyZWF0ZSc7XG5cdFx0XHRcdFx0Y29uc3QgaGFzQWZ0ZXIgPSBlZGl0LmtpbmQgIT09ICdkZWxldGUnO1xuXHRcdFx0XHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuRmlsZUVkaXQsXG5cdFx0XHRcdFx0XHRiZWZvcmU6IGhhc0JlZm9yZSA/IHtcblx0XHRcdFx0XHRcdFx0dXJpOiBiZWZvcmVVcmksXG5cdFx0XHRcdFx0XHRcdGNvbnRlbnQ6IHsgdXJpOiBidWlsZFNlc3Npb25EYlVyaShzZXNzaW9uVXJpU3RyLCBlZGl0LnRvb2xDYWxsSWQsIGVkaXQuZmlsZVBhdGgsICdiZWZvcmUnKSB9LFxuXHRcdFx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRcdGFmdGVyOiBoYXNBZnRlciA/IHtcblx0XHRcdFx0XHRcdFx0dXJpOiBhZnRlclVyaSxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHNlc3Npb25VcmlTdHIsIGVkaXQudG9vbENhbGxJZCwgZWRpdC5maWxlUGF0aCwgJ2FmdGVyJykgfSxcblx0XHRcdFx0XHRcdH0gOiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0XHRkaWZmOiAoZWRpdC5hZGRlZExpbmVzICE9PSB1bmRlZmluZWQgfHwgZWRpdC5yZW1vdmVkTGluZXMgIT09IHVuZGVmaW5lZClcblx0XHRcdFx0XHRcdFx0PyB7IGFkZGVkOiBlZGl0LmFkZGVkTGluZXMsIHJlbW92ZWQ6IGVkaXQucmVtb3ZlZExpbmVzIH1cblx0XHRcdFx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJlc3VsdC5wdXNoKHtcblx0XHRcdFx0c2Vzc2lvbixcblx0XHRcdFx0dHlwZTogJ3Rvb2xfY29tcGxldGUnLFxuXHRcdFx0XHR0b29sQ2FsbElkOiBkLnRvb2xDYWxsSWQsXG5cdFx0XHRcdHJlc3VsdDoge1xuXHRcdFx0XHRcdHN1Y2Nlc3M6IGQuc3VjY2Vzcyxcblx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBnZXRQYXN0VGVuc2VNZXNzYWdlKGluZm8udG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBpbmZvLnBhcmFtZXRlcnMsIGQuc3VjY2VzcyksXG5cdFx0XHRcdFx0Y29udGVudDogY29udGVudC5sZW5ndGggPiAwID8gY29udGVudCA6IHVuZGVmaW5lZCxcblx0XHRcdFx0XHRlcnJvcjogZC5lcnJvcixcblx0XHRcdFx0fSxcblx0XHRcdFx0aXNVc2VyUmVxdWVzdGVkOiBkLmlzVXNlclJlcXVlc3RlZCxcblx0XHRcdFx0dG9vbFRlbGVtZXRyeTogZC50b29sVGVsZW1ldHJ5ICE9PSB1bmRlZmluZWQgPyB0cnlTdHJpbmdpZnkoZC50b29sVGVsZW1ldHJ5KSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0cGFyZW50VG9vbENhbGxJZDogcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoKGUgYXMgSVNlc3Npb25FdmVudFRvb2xDb21wbGV0ZSkuYWdlbnRJZCwgZC5wYXJlbnRUb29sQ2FsbElkKSxcblx0XHRcdH0pO1xuXHRcdH0gZWxzZSBpZiAoZS50eXBlID09PSAnc3ViYWdlbnQuc3RhcnRlZCcpIHtcblx0XHRcdGNvbnN0IGQgPSAoZSBhcyBJU2Vzc2lvbkV2ZW50U3ViYWdlbnRTdGFydGVkKS5kYXRhO1xuXHRcdFx0cmVzdWx0LnB1c2goe1xuXHRcdFx0XHRzZXNzaW9uLFxuXHRcdFx0XHR0eXBlOiAnc3ViYWdlbnRfc3RhcnRlZCcsXG5cdFx0XHRcdHRvb2xDYWxsSWQ6IGQudG9vbENhbGxJZCxcblx0XHRcdFx0YWdlbnROYW1lOiBkLmFnZW50TmFtZSxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogZC5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0XHRhZ2VudERlc2NyaXB0aW9uOiBkLmFnZW50RGVzY3JpcHRpb24sXG5cdFx0XHR9KTtcblx0XHR9IGVsc2UgaWYgKGUudHlwZSA9PT0gJ3NraWxsLmludm9rZWQnKSB7XG5cdFx0XHRjb25zdCBza2lsbEV2ZW50ID0gZSBhcyBJU2Vzc2lvbkV2ZW50U2tpbGxJbnZva2VkO1xuXHRcdFx0Y29uc3Qgc3ludGggPSBzeW50aGVzaXplU2tpbGxUb29sQ2FsbChza2lsbEV2ZW50LmRhdGEsIHNraWxsRXZlbnQuaWQpO1xuXHRcdFx0cmVzdWx0LnB1c2goXG5cdFx0XHRcdHsgc2Vzc2lvbiwgdHlwZTogJ3Rvb2xfc3RhcnQnLCB0b29sQ2FsbElkOiBzeW50aC50b29sQ2FsbElkLCB0b29sTmFtZTogc3ludGgudG9vbE5hbWUsIGRpc3BsYXlOYW1lOiBzeW50aC5kaXNwbGF5TmFtZSwgaW52b2NhdGlvbk1lc3NhZ2U6IHN5bnRoLmludm9jYXRpb25NZXNzYWdlIH0sXG5cdFx0XHRcdHsgc2Vzc2lvbiwgdHlwZTogJ3Rvb2xfY29tcGxldGUnLCB0b29sQ2FsbElkOiBzeW50aC50b29sQ2FsbElkLCByZXN1bHQ6IHsgc3VjY2VzczogdHJ1ZSwgcGFzdFRlbnNlTWVzc2FnZTogc3ludGgucGFzdFRlbnNlTWVzc2FnZSB9IH0sXG5cdFx0XHQpO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiByZXN1bHQ7XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFLQSxTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyw4QkFBOEI7QUFHdkMsU0FBUyxhQUFhLGtCQUFrQiw0QkFBNEIsZ0JBQWdCLHVCQUF1QixXQUFXLCtCQUF1SjtBQUM3USxTQUFTLHNCQUFzQixxQkFBcUIsa0JBQWtCLHFCQUFxQixvQkFBb0Isb0JBQW9CLGFBQWEsWUFBWSxjQUFjLCtCQUErQjtBQUN6TSxTQUFTLHlCQUF5QjtBQW1GbEMsU0FBUyxvQkFBb0IsT0FBMEc7QUFDdEksTUFBSSxDQUFDLE9BQU87QUFDWCxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQ0EsU0FBTztBQUFBLElBQ04scUJBQXFCLE1BQU07QUFBQSxJQUMzQixtQkFBbUIsTUFBTTtBQUFBLEVBQzFCO0FBQ0Q7QUFVTyxTQUFTLHNCQUFzQixVQUE2QztBQUNsRixRQUFNLFFBQWdCLENBQUM7QUFDdkIsUUFBTSx3QkFBd0Isb0JBQUksSUFBMkM7QUFDN0UsTUFBSTtBQU9KLFFBQU0sZUFBZSxDQUFDLE1BQXVDLFVBQTJCO0FBQ3ZGLFVBQU0sS0FBSztBQUFBLE1BQ1YsSUFBSSxLQUFLO0FBQUEsTUFDVCxTQUFTLEtBQUs7QUFBQSxNQUNkLGVBQWUsS0FBSztBQUFBLE1BQ3BCLE9BQU87QUFBQSxNQUNQO0FBQUEsSUFDRCxDQUFDO0FBQUEsRUFDRjtBQUVBLFFBQU0sWUFBWSxDQUFDLElBQVksVUFBbUQ7QUFBQSxJQUNqRjtBQUFBLElBQ0EsU0FBUyxFQUFFLE1BQU0sUUFBUSxFQUFFLE1BQU0sWUFBWSxLQUFLLEVB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
