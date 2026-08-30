import { decodeBase64 } from "../../../../base/common/buffer.js";
import { Schemas } from "../../../../base/common/network.js";
import { basename, isAbsolute, join } from "../../../../base/common/path.js";
import { isString } from "../../../../base/common/types.js";
import { URI } from "../../../../base/common/uri.js";
import { generateUuid } from "../../../../base/common/uuid.js";
import { AgentSession } from "../../common/agent.js";
import { stripRedundantCdPrefix } from "../../common/commandLineHelpers.js";
import { toToolCallMeta } from "../../common/meta/agentToolCallMeta.js";
import { MessageAttachmentKind } from "../../common/state/protocol/state.js";
import { MessageKind, ResponsePartKind, ToolCallConfirmationReason, ToolCallContributorKind, ToolCallStatus, ToolResultContentType, TurnState, buildSubagentSessionUri } from "../../common/state/sessionState.js";
import { buildNonPtyShellTerminalUri } from "./copilotNonPtyShellTerminals.js";
import { getInvocationMessage, getPastTenseMessage, getShellIntention, getShellLanguage, getSubagentMetadata, getTaskCompleteMarkdown, getToolDisplayName, getToolInputString, getToolKind, isEditTool, isHiddenTool, isTaskCompleteTool, synthesizeSkillToolCall } from "./copilotToolDisplay.js";
import { buildSessionDbUri } from "../../common/sessionDbUri.js";
import { getMediaMime } from "../../../../base/common/mime.js";
import { buildCopilotSystemNotification } from "./copilotSystemNotification.js";
import { buildChatErrorInfoFromCopilotSdkFields } from "./copilotSdkChatError.js";
import { buildMcpChannel, buildMcpTopLevelCustomizationId } from "../shared/mcpCustomizationController.js";
import { readSimpleAttachmentDisplayKindFromMimeType } from "./copilotAttachmentUtils.js";
function tryStringify(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return void 0;
  }
}
function resolveToolDisplayPath(path, workingDirectory) {
  return isAbsolute(path) || !workingDirectory || workingDirectory.scheme !== Schemas.file ? path : join(workingDirectory.fsPath, path);
}
function isSyntheticUserMessage(event) {
  if (event.type !== "user.message") {
    return false;
  }
  const source = event.data.source;
  return !!source && source.toLowerCase() !== "user";
}
function stripPromptScaffolding(text) {
  const withoutAux = text.replace(/<reminder>[\s\S]*?<\/reminder>\s*/g, "").replace(/<attachments>[\s\S]*?<\/attachments>\s*/g, "").replace(/<context>[\s\S]*?<\/context>\s*/g, "").replace(/<current_datetime>[\s\S]*?<\/current_datetime>\s*/g, "").replace(/<pr_metadata[^>]*\/?>\s*/g, "");
  const withoutRequest = withoutAux.replace(/<userRequest>[\s\S]*?<\/userRequest>\s*/g, "").replace(/<user_query>[\s\S]*?<\/user_query>\s*/g, "").trim();
  if (withoutRequest) {
    return withoutRequest;
  }
  const inner = withoutAux.match(/<userRequest>([\s\S]*?)<\/userRequest>/) ?? withoutAux.match(/<user_query>([\s\S]*?)<\/user_query>/);
  return inner ? inner[1].trim() : withoutAux.trim();
}
function appendSdkToolResultContent(content, sdkContents, terminal) {
  let shellExit;
  for (const sdkContent of sdkContents ?? []) {
    switch (sdkContent.type) {
      case "image":
        content.push({
          type: ToolResultContentType.EmbeddedResource,
          data: sdkContent.data,
          contentType: sdkContent.mimeType
        });
        break;
      case "shell_exit": {
        const result = {
          exitCode: sdkContent.exitCode,
          ...typeof sdkContent.outputPreview === "string" ? { preview: sdkContent.outputPreview } : {},
          ...sdkContent.outputTruncated !== void 0 ? { truncated: sdkContent.outputTruncated } : {}
        };
        shellExit = { shellId: sdkContent.shellId, result };
        const terminalIndex = content.findIndex((c) => c.type === ToolResultContentType.Terminal);
        if (terminalIndex !== -1) {
          const terminalBlock = content[terminalIndex];
          content[terminalIndex] = { ...terminalBlock, result };
        } else if (terminal) {
          content.push({
            type: ToolResultContentType.Terminal,
            resource: buildNonPtyShellTerminalUri(terminal.session, terminal.toolCallId),
            title: terminal.title,
            isPty: false,
            result
          });
        }
        break;
      }
    }
  }
  return shellExit;
}
function newTurnBuilder(id, text, options) {
  const message = {
    text,
    origin: { kind: options?.origin ?? MessageKind.User },
    ...options?.attachments?.length ? { attachments: options.attachments } : {},
    ...options?.model ? { model: options.model } : {},
    ...options?.agent ? { agent: options.agent } : {}
  };
  return { id, message, startedAt: options?.startedAt, lastEventAt: options?.startedAt, responseParts: [], usage: void 0, error: void 0, pendingTools: /* @__PURE__ */ new Map() };
}
function readEventTimestamp(event) {
  const timestamp = event.timestamp;
  return isString(timestamp) && Number.isFinite(Date.parse(timestamp)) ? timestamp : void 0;
}
function readStringProperty(source, key) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return void 0;
  }
  const value = source[key];
  return typeof value === "string" && value.length > 0 ? value : void 0;
}
function readMcpUiResourceUri(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return void 0;
  }
  const toolDescription = source["toolDescription"];
  if (!toolDescription || typeof toolDescription !== "object" || Array.isArray(toolDescription)) {
    return void 0;
  }
  const meta = toolDescription["_meta"];
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return void 0;
  }
  const ui = meta["ui"];
  if (!ui || typeof ui !== "object" || Array.isArray(ui)) {
    return void 0;
  }
  return readStringProperty(ui, "resourceUri");
}
function makeToolStartInfo(toolName, rawArguments, parentToolCallId, workingDirectory, source) {
  if (isHiddenTool(toolName)) {
    return void 0;
  }
  const rawArgs = rawArguments !== void 0 ? tryStringify(rawArguments) : void 0;
  let parameters;
  if (rawArgs) {
    try {
      parameters = JSON.parse(rawArgs);
    } catch {
    }
  }
  const cleaned = stripRedundantCdPrefix(toolName, parameters, workingDirectory) ? tryStringify(parameters) : void 0;
  const toolArgs = cleaned ?? rawArgs;
  const toolKind = getToolKind(toolName, parameters);
  const subagentMeta = toolKind === "subagent" ? getSubagentMetadata(parameters) : void 0;
  const displayName = getToolDisplayName(toolName);
  return {
    toolName,
    displayName,
    invocationMessage: getInvocationMessage(toolName, displayName, parameters, (path) => resolveToolDisplayPath(path, workingDirectory)),
    toolInput: getToolInputString(toolName, parameters, toolArgs),
    toolKind,
    language: toolKind === "terminal" ? getShellLanguage(toolName) : void 0,
    intention: getShellIntention(toolName, parameters),
    subagentAgentName: subagentMeta?.agentName,
    subagentDescription: subagentMeta?.description,
    parameters,
    parentToolCallId,
    mcpServerName: readStringProperty(source, "mcpServerName"),
    mcpToolName: readStringProperty(source, "mcpToolName"),
    mcpUiResourceUri: readMcpUiResourceUri(source)
  };
}
function finalizeTurn(builder, state) {
  const startedAtMs = builder.startedAt === void 0 ? void 0 : Date.parse(builder.startedAt);
  const endedAtMs = builder.lastEventAt === void 0 ? void 0 : Date.parse(builder.lastEventAt);
  const duration = startedAtMs !== void 0 && endedAtMs !== void 0 && Number.isFinite(startedAtMs) && Number.isFinite(endedAtMs) ? Math.max(0, endedAtMs - startedAtMs) : void 0;
  return {
    id: builder.id,
    ...builder.startedAt !== void 0 ? { startedAt: builder.startedAt } : {},
    ...duration !== void 0 ? { duration } : {},
    message: builder.message,
    responseParts: builder.responseParts,
    usage: builder.usage,
    state,
    ...builder.error ? { error: builder.error } : {}
  };
}
async function mapSessionEvents(session, db, events, options = void 0) {
  const workingDirectory = options instanceof URI ? options : options?.workingDirectory;
  let currentModel = options instanceof URI ? void 0 : options?.model;
  let currentAgent = options instanceof URI ? void 0 : options?.agent;
  const toolInfoByCallId = /* @__PURE__ */ new Map();
  const editToolCallIds = [];
  const completionsByCallId = /* @__PURE__ */ new Map();
  const subagentInfoByToolCallId = /* @__PURE__ */ new Map();
  const parentToolCallIdByAgentId = /* @__PURE__ */ new Map();
  const resolveParentToolCallId = (agentId, deprecatedParentToolCallId) => {
    const mapped = agentId ? parentToolCallIdByAgentId.get(agentId) : void 0;
    return mapped ?? deprecatedParentToolCallId;
  };
  for (const e of events) {
    if (e.type === "subagent.started") {
      subagentInfoByToolCallId.set(e.data.toolCallId, {
        agentName: e.data.agentName,
        agentDisplayName: e.data.agentDisplayName,
        agentDescription: e.data.agentDescription
      });
      if (e.agentId) {
        parentToolCallIdByAgentId.set(e.agentId, e.data.toolCallId);
      }
    }
    if (e.type === "tool.execution_complete") {
      completionsByCallId.set(e.data.toolCallId, e.data);
    }
    if (e.type === "tool.execution_start") {
      const d = e.data;
      const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
      const info = makeToolStartInfo(d.toolName, d.arguments, parentToolCallId, workingDirectory, d);
      if (!info) {
        continue;
      }
      toolInfoByCallId.set(d.toolCallId, info);
      const command = isString(info.parameters?.command) ? info.parameters.command : void 0;
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
  const providerId = session.scheme;
  const rawSessionId = AgentSession.id(session);
  const turns = [];
  const subagentBuilders = /* @__PURE__ */ new Map();
  const subagentTurnStates = /* @__PURE__ */ new Map();
  const terminatedSubagentTurns = /* @__PURE__ */ new Set();
  const subagentTurns = /* @__PURE__ */ new Map();
  let parentBuilder;
  let parentTurnState = TurnState.Cancelled;
  let parentTurnTerminated = false;
  let rootAssistantTurnActive = false;
  let pendingAutoModeResolved;
  let currentEventTimestamp;
  const touch = (builder) => {
    if (builder && currentEventTimestamp !== void 0) {
      builder.lastEventAt = currentEventTimestamp;
    }
  };
  const flushParent = () => {
    if (!parentBuilder) {
      return;
    }
    turns.push(finalizeTurn(parentBuilder, parentTurnState));
    parentBuilder = void 0;
    parentTurnState = TurnState.Cancelled;
    parentTurnTerminated = false;
  };
  const flushSubagent = (parentToolCallId) => {
    const builder = subagentBuilders.get(parentToolCallId);
    if (!builder) {
      subagentTurnStates.delete(parentToolCallId);
      return;
    }
    subagentBuilders.delete(parentToolCallId);
    const state = subagentTurnStates.get(parentToolCallId) ?? TurnState.Complete;
    subagentTurnStates.delete(parentToolCallId);
    terminatedSubagentTurns.delete(parentToolCallId);
    if (builder.responseParts.length === 0 && !builder.error) {
      return;
    }
    const list = subagentTurns.get(parentToolCallId) ?? [];
    list.push(finalizeTurn(builder, state));
    subagentTurns.set(parentToolCallId, list);
  };
  const ensureSubagentBuilder = (parentToolCallId) => {
    let builder = subagentBuilders.get(parentToolCallId);
    if (!builder) {
      builder = newTurnBuilder(generateUuid(), "", { startedAt: currentEventTimestamp });
      subagentBuilders.set(parentToolCallId, builder);
      if (!subagentTurnStates.has(parentToolCallId)) {
        subagentTurnStates.set(parentToolCallId, TurnState.Complete);
      }
    }
    touch(builder);
    return builder;
  };
  const targetBuilderFor = (parentToolCallId) => {
    if (parentToolCallId) {
      return ensureSubagentBuilder(parentToolCallId);
    }
    touch(parentBuilder);
    return parentBuilder;
  };
  for (const e of events) {
    currentEventTimestamp = readEventTimestamp(e);
    switch (e.type) {
      case "assistant.turn_start":
        if (!e.agentId) {
          rootAssistantTurnActive = true;
          touch(parentBuilder);
        }
        break;
      case "assistant.turn_end":
        if (!e.agentId) {
          rootAssistantTurnActive = false;
          touch(parentBuilder);
        }
        break;
      case "session.start": {
        if (!e.agentId && e.data.selectedModel) {
          currentModel = { id: e.data.selectedModel };
        }
        break;
      }
      case "session.model_change": {
        currentModel = { id: e.data.newModel };
        break;
      }
      case "session.auto_mode_resolved": {
        if (!e.agentId) {
          pendingAutoModeResolved = e.data;
        }
        break;
      }
      case "subagent.deselected": {
        if (!e.agentId) {
          currentAgent = void 0;
        }
        break;
      }
      case "user.message": {
        if (isSyntheticUserMessage(e)) {
          continue;
        }
        const d = e.data;
        const messageId = d.interactionId ?? "";
        const content = stripPromptScaffolding(d.content ?? "");
        const attachments = sdkAttachmentsToProtocol(d.attachments);
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        if (e.agentId && !parentToolCallId) {
          continue;
        }
        if (parentToolCallId) {
          const builder = ensureSubagentBuilder(parentToolCallId);
          builder.message = {
            ...builder.message,
            text: content,
            ...attachments?.length ? { attachments } : {}
          };
        } else {
          flushParent();
          const turnId = e.id ?? messageId;
          parentBuilder = newTurnBuilder(turnId, content, { attachments, model: currentModel, agent: currentAgent, startedAt: currentEventTimestamp });
          if (pendingAutoModeResolved) {
            parentBuilder.usage = {
              model: pendingAutoModeResolved.chosenModel,
              _meta: { autoModeResolved: pendingAutoModeResolved }
            };
            pendingAutoModeResolved = void 0;
          }
        }
        break;
      }
      case "assistant.message": {
        const d = e.data;
        const messageId = d.messageId ?? d.interactionId ?? "";
        const content = d.content ?? "";
        const reasoningText = d.reasoningText;
        const hasToolRequests = !!d.toolRequests && d.toolRequests.length > 0;
        const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
        if (!content && !reasoningText && !hasToolRequests) {
          if (!parentToolCallId && parentBuilder && !parentTurnTerminated) {
            parentTurnState = TurnState.Complete;
            touch(parentBuilder);
          }
          break;
        }
        const fallbackTurnId = e.id ?? messageId;
        const builder = targetBuilderFor(parentToolCallId) ?? (parentBuilder = newTurnBuilder(fallbackTurnId, "", { startedAt: currentEventTimestamp }));
        if (reasoningText) {
          builder.responseParts.push({
            kind: ResponsePartKind.Reasoning,
            id: generateUuid(),
            content: reasoningText
          });
        }
        if (content) {
          builder.responseParts.push({
            kind: ResponsePartKind.Markdown,
            id: generateUuid(),
            content
          });
        }
        if (!parentToolCallId && builder === parentBuilder && !parentTurnTerminated) {
          parentTurnState = hasToolRequests ? TurnState.Cancelled : TurnState.Complete;
        }
        if (d.toolRequests?.length) {
          appendFallbackToolRequests(builder, d.toolRequests, parentToolCallId);
        }
        break;
      }
      case "system.notification": {
        const notification = buildCopilotSystemNotification(e);
        if (!notification) {
          break;
        }
        if (parentBuilder && (rootAssistantTurnActive || notification.startsTurn)) {
          parentBuilder.responseParts.push({
            kind: ResponsePartKind.SystemNotification,
            content: notification.messageText
          });
          touch(parentBuilder);
        }
        break;
      }
      case "session.error": {
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        if (e.agentId) {
          if (!parentToolCallId || terminatedSubagentTurns.has(parentToolCallId)) {
            break;
          }
          const builder = ensureSubagentBuilder(parentToolCallId);
          subagentTurnStates.set(parentToolCallId, TurnState.Error);
          terminatedSubagentTurns.add(parentToolCallId);
          builder.error = buildChatErrorInfoFromCopilotSdkFields(e.data);
          touch(builder);
          break;
        }
        if (parentBuilder && !parentTurnTerminated) {
          rootAssistantTurnActive = false;
          parentTurnState = TurnState.Error;
          parentTurnTerminated = true;
          parentBuilder.error = buildChatErrorInfoFromCopilotSdkFields(e.data);
          touch(parentBuilder);
        }
        break;
      }
      case "subagent.started": {
        break;
      }
      case "tool.execution_start": {
        const parentToolCallId = resolveParentToolCallId(e.agentId, e.data.parentToolCallId);
        if (!parentToolCallId && parentBuilder && !parentTurnTerminated) {
          parentTurnState = TurnState.Cancelled;
          touch(parentBuilder);
        }
        break;
      }
      case "tool.execution_complete": {
        const d = e.data;
        const info = toolInfoByCallId.get(d.toolCallId);
        if (!info) {
          continue;
        }
        toolInfoByCallId.delete(d.toolCallId);
        const parentToolCallId = resolveParentToolCallId(e.agentId, d.parentToolCallId);
        if (isTaskCompleteTool(info.toolName)) {
          const builder2 = targetBuilderFor(parentToolCallId);
          if (!builder2) {
            continue;
          }
          const summary = getTaskCompleteMarkdown(info.parameters, d.error?.message ?? d.result?.content);
          if (summary) {
            builder2.responseParts.push({
              kind: ResponsePartKind.Markdown,
              id: generateUuid(),
              content: summary
            });
          }
          if (!parentToolCallId && d.success && builder2 === parentBuilder && !parentTurnTerminated) {
            parentTurnState = TurnState.Complete;
          }
          continue;
        }
        const builder = targetBuilderFor(parentToolCallId);
        if (!builder) {
          continue;
        }
        const completedPart = makeCompletedToolCallPart(d, info, sessionUriStr, providerId, rawSessionId, storedEdits, subagentInfoByToolCallId.get(d.toolCallId), workingDirectory);
        builder.responseParts.push(completedPart);
        if (!parentToolCallId && subagentInfoByToolCallId.has(d.toolCallId)) {
          flushSubagent(d.toolCallId);
        }
        break;
      }
      case "skill.invoked": {
        const synth = synthesizeSkillToolCall(e.data, e.id);
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        const builder = targetBuilderFor(parentToolCallId) ?? (parentBuilder = newTurnBuilder(generateUuid(), "", { startedAt: currentEventTimestamp }));
        if (!parentToolCallId && builder === parentBuilder) {
          parentTurnState = TurnState.Cancelled;
        }
        builder.responseParts.push({
          kind: ResponsePartKind.ToolCall,
          toolCall: {
            status: ToolCallStatus.Completed,
            toolCallId: synth.toolCallId,
            toolName: synth.toolName,
            displayName: synth.displayName,
            invocationMessage: synth.invocationMessage,
            success: true,
            pastTenseMessage: synth.pastTenseMessage,
            confirmed: ToolCallConfirmationReason.NotNeeded
          }
        });
        break;
      }
      case "abort": {
        const parentToolCallId = resolveParentToolCallId(e.agentId, void 0);
        if (parentToolCallId) {
          if (!terminatedSubagentTurns.has(parentToolCallId)) {
            subagentTurnStates.set(parentToolCallId, TurnState.Cancelled);
          }
        } else {
          rootAssistantTurnActive = false;
          if (parentBuilder && !parentTurnTerminated) {
            parentTurnState = TurnState.Cancelled;
            parentTurnTerminated = true;
            touch(parentBuilder);
          }
        }
        break;
      }
      default:
        break;
    }
  }
  flushParent();
  for (const parentToolCallId of [...subagentBuilders.keys()]) {
    flushSubagent(parentToolCallId);
  }
  return { turns, subagentTurnsByToolCallId: subagentTurns };
  function appendFallbackToolRequests(builder, toolRequests, parentToolCallId) {
    for (const request of toolRequests) {
      const completion = completionsByCallId.get(request.toolCallId);
      if (completion && toolInfoByCallId.has(request.toolCallId)) {
        continue;
      }
      const info = toolInfoByCallId.get(request.toolCallId) ?? makeToolStartInfo(request.name, request.arguments, parentToolCallId, workingDirectory, request);
      if (!info) {
        continue;
      }
      if (isTaskCompleteTool(info.toolName)) {
        const summary = getTaskCompleteMarkdown(info.parameters, completion?.error?.message ?? completion?.result?.content);
        if (summary) {
          builder.responseParts.push({
            kind: ResponsePartKind.Markdown,
            id: generateUuid(),
            content: summary
          });
        }
        if (!parentToolCallId && completion?.success && builder === parentBuilder && !parentTurnTerminated) {
          parentTurnState = TurnState.Complete;
        }
        continue;
      }
      builder.responseParts.push(makeCompletedToolCallPart(
        completion ?? { toolCallId: request.toolCallId, success: true },
        info,
        sessionUriStr,
        providerId,
        rawSessionId,
        storedEdits,
        subagentInfoByToolCallId.get(request.toolCallId),
        workingDirectory
      ));
    }
  }
}
function sdkAttachmentsToProtocol(attachments) {
  if (!attachments?.length) {
    return void 0;
  }
  const out = [];
  for (const a of attachments) {
    const converted = sdkAttachmentToProtocol(a);
    if (converted) {
      out.push(converted);
    }
  }
  return out.length > 0 ? out : void 0;
}
function sdkAttachmentToProtocol(attachment) {
  switch (attachment.type) {
    case "file": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.path).toString(),
        label: attachment.displayName || basename(attachment.path),
        displayKind: getMediaMime(attachment.path)?.startsWith("image/") ? "image" : "document"
      };
    }
    case "directory": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.path).toString(),
        label: attachment.displayName || basename(attachment.path),
        displayKind: "directory"
      };
    }
    case "selection": {
      return {
        type: MessageAttachmentKind.Resource,
        uri: URI.file(attachment.filePath).toString(),
        label: attachment.displayName,
        displayKind: "selection",
        selection: { range: attachment.selection }
      };
    }
    case "blob": {
      if (typeof attachment.data !== "string") {
        return void 0;
      }
      const simpleDisplayKind = readSimpleAttachmentDisplayKindFromMimeType(attachment.mimeType);
      if (attachment.mimeType.startsWith("text/plain") || simpleDisplayKind !== void 0) {
        return {
          type: MessageAttachmentKind.Simple,
          label: attachment.displayName ?? "attachment",
          modelRepresentation: decodeBase64(attachment.data ?? "").toString(),
          ...simpleDisplayKind !== void 0 ? { displayKind: simpleDisplayKind } : {}
        };
      }
      const displayKind = attachment.mimeType.startsWith("image/") ? "image" : void 0;
      return {
        type: MessageAttachmentKind.EmbeddedResource,
        label: attachment.displayName ?? "attachment",
        data: attachment.data ?? "",
        contentType: attachment.mimeType,
        displayKind
      };
    }
    default:
      return void 0;
  }
}
function makeCompletedToolCallPart(d, info, sessionUriStr, providerId, rawSessionId, storedEdits, subagent, workingDirectory) {
  const toolOutput = d.error?.message ?? d.result?.content;
  const content = [];
  if (toolOutput !== void 0) {
    content.push({ type: ToolResultContentType.Text, text: toolOutput });
  }
  appendSdkToolResultContent(
    content,
    d.result?.contents,
    info.toolKind === "terminal" ? { session: sessionUriStr, toolCallId: d.toolCallId, title: info.displayName } : void 0
  );
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
  if (subagent) {
    content.push({
      type: ToolResultContentType.Subagent,
      resource: buildSubagentSessionUri(sessionUriStr, d.toolCallId),
      title: subagent.agentDisplayName,
      agentName: subagent.agentName,
      description: subagent.agentDescription
    });
  }
  const mcpServerName = info.mcpServerName ?? readStringProperty(d, "mcpServerName");
  const mcpToolName = info.mcpToolName ?? readStringProperty(d, "mcpToolName");
  const mcpUiResourceUri = info.mcpUiResourceUri ?? readMcpUiResourceUri(d);
  const mcpUi = mcpUiResourceUri ? {
    resourceUri: mcpUiResourceUri,
    ...mcpServerName ? { channel: buildMcpChannel(providerId, rawSessionId, mcpServerName) } : {}
  } : void 0;
  const tc = {
    status: ToolCallStatus.Completed,
    toolCallId: d.toolCallId,
    toolName: info.toolName,
    displayName: info.displayName,
    intention: info.intention,
    ...mcpServerName ? { contributor: { kind: ToolCallContributorKind.MCP, customizationId: buildMcpTopLevelCustomizationId(providerId, rawSessionId, mcpServerName) } } : {},
    invocationMessage: info.invocationMessage,
    toolInput: info.toolInput,
    success: d.success,
    pastTenseMessage: getPastTenseMessage(info.toolName, info.displayName, info.parameters, d.success, d.success ? toolOutput : void 0, (path) => resolveToolDisplayPath(path, workingDirectory)),
    content: content.length > 0 ? content : void 0,
    error: d.error,
    confirmed: ToolCallConfirmationReason.NotNeeded,
    _meta: toToolCallMeta({
      toolKind: info.toolKind,
      language: info.language,
      subagentDescription: info.subagentDescription,
      subagentAgentName: info.subagentAgentName,
      mcpServerName,
      mcpToolName,
      ui: mcpUi
    })
  };
  return { kind: ResponsePartKind.ToolCall, toolCall: tc };
}
export {
  appendSdkToolResultContent,
  mapSessionEvents
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxub2RlXFxjb3BpbG90XFxtYXBTZXNzaW9uRXZlbnRzLnRzIl0sCiAgInNvdXJjZXNDb250ZW50IjogWyIvKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuICogIENvcHlyaWdodCAoYykgTWljcm9zb2Z0IENvcnBvcmF0aW9uLiBBbGwgcmlnaHRzIHJlc2VydmVkLlxuICogIExpY2Vuc2VkIHVuZGVyIHRoZSBNSVQgTGljZW5zZS4gU2VlIExpY2Vuc2UudHh0IGluIHRoZSBwcm9qZWN0IHJvb3QgZm9yIGxpY2Vuc2UgaW5mb3JtYXRpb24uXG4gKi0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tKi9cblxuaW1wb3J0IHR5cGUgeyBBc3Npc3RhbnRNZXNzYWdlVG9vbFJlcXVlc3QsIEF0dGFjaG1lbnQsIFNlc3Npb25FdmVudCwgVG9vbEV4ZWN1dGlvbkNvbXBsZXRlQ29udGVudCwgVG9vbEV4ZWN1dGlvbkNvbXBsZXRlQ29udGVudFNoZWxsRXhpdCwgVG9vbEV4ZWN1dGlvbkNvbXBsZXRlRGF0YSB9IGZyb20gJ0BnaXRodWIvY29waWxvdC1zZGsnO1xuaW1wb3J0IHsgZGVjb2RlQmFzZTY0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYnVmZmVyLmpzJztcbmltcG9ydCB7IFNjaGVtYXMgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9uZXR3b3JrLmpzJztcbmltcG9ydCB7IGJhc2VuYW1lLCBpc0Fic29sdXRlLCBqb2luIH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBpc1N0cmluZyB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgeyBnZW5lcmF0ZVV1aWQgfSBmcm9tICcuLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91dWlkLmpzJztcbmltcG9ydCB7IEFnZW50U2Vzc2lvbiB9IGZyb20gJy4uLy4uL2NvbW1vbi9hZ2VudC5qcyc7XG5pbXBvcnQgeyBzdHJpcFJlZHVuZGFudENkUHJlZml4IH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbW1hbmRMaW5lSGVscGVycy5qcyc7XG5pbXBvcnQgeyB0b1Rvb2xDYWxsTWV0YSwgdHlwZSBJVG9vbENhbGxVaU1ldGEsIHR5cGUgVG9vbEtpbmQgfSBmcm9tICcuLi8uLi9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBJRmlsZUVkaXRSZWNvcmQsIElTZXNzaW9uRGF0YWJhc2UgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRhdGFTZXJ2aWNlLmpzJztcbmltcG9ydCB7IE1lc3NhZ2VBdHRhY2htZW50S2luZCwgdHlwZSBNZXNzYWdlQXR0YWNobWVudCB9IGZyb20gJy4uLy4uL2NvbW1vbi9zdGF0ZS9wcm90b2NvbC9zdGF0ZS5qcyc7XG5pbXBvcnQgeyBNZXNzYWdlS2luZCwgUmVzcG9uc2VQYXJ0S2luZCwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFN0YXR1cywgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCBUdXJuU3RhdGUsIGJ1aWxkU3ViYWdlbnRTZXNzaW9uVXJpLCB0eXBlIEFnZW50U2VsZWN0aW9uLCB0eXBlIEVycm9ySW5mbywgdHlwZSBNZXNzYWdlLCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFJlc3BvbnNlUGFydCwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRlcm1pbmFsQ29tbWFuZFJlc3VsdCwgdHlwZSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlLCB0eXBlIFRvb2xSZXN1bHRDb250ZW50LCB0eXBlIFRvb2xSZXN1bHRUZXJtaW5hbENvbnRlbnQsIHR5cGUgVHVybiwgdHlwZSBVc2FnZUluZm8gfSBmcm9tICcuLi8uLi9jb21tb24vc3RhdGUvc2Vzc2lvblN0YXRlLmpzJztcbmltcG9ydCB7IGJ1aWxkTm9uUHR5U2hlbGxUZXJtaW5hbFVyaSB9IGZyb20gJy4vY29waWxvdE5vblB0eVNoZWxsVGVybWluYWxzLmpzJztcbmltcG9ydCB7IGdldEludm9jYXRpb25NZXNzYWdlLCBnZXRQYXN0VGVuc2VNZXNzYWdlLCBnZXRTaGVsbEludGVudGlvbiwgZ2V0U2hlbGxMYW5ndWFnZSwgZ2V0U3ViYWdlbnRNZXRhZGF0YSwgZ2V0VGFza0NvbXBsZXRlTWFya2Rvd24sIGdldFRvb2xEaXNwbGF5TmFtZSwgZ2V0VG9vbElucHV0U3RyaW5nLCBnZXRUb29sS2luZCwgaXNFZGl0VG9vbCwgaXNIaWRkZW5Ub29sLCBpc1Rhc2tDb21wbGV0ZVRvb2wsIHN5bnRoZXNpemVTa2lsbFRvb2xDYWxsIH0gZnJvbSAnLi9jb3BpbG90VG9vbERpc3BsYXkuanMnO1xuaW1wb3J0IHsgYnVpbGRTZXNzaW9uRGJVcmkgfSBmcm9tICcuLi8uLi9jb21tb24vc2Vzc2lvbkRiVXJpLmpzJztcbmltcG9ydCB7IGdldE1lZGlhTWltZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21pbWUuanMnO1xuaW1wb3J0IHsgYnVpbGRDb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uIH0gZnJvbSAnLi9jb3BpbG90U3lzdGVtTm90aWZpY2F0aW9uLmpzJztcbmltcG9ydCB7IGJ1aWxkQ2hhdEVycm9ySW5mb0Zyb21Db3BpbG90U2RrRmllbGRzIH0gZnJvbSAnLi9jb3BpbG90U2RrQ2hhdEVycm9yLmpzJztcbmltcG9ydCB7IGJ1aWxkTWNwQ2hhbm5lbCwgYnVpbGRNY3BUb3BMZXZlbEN1c3RvbWl6YXRpb25JZCB9IGZyb20gJy4uL3NoYXJlZC9tY3BDdXN0b21pemF0aW9uQ29udHJvbGxlci5qcyc7XG5pbXBvcnQgeyByZWFkU2ltcGxlQXR0YWNobWVudERpc3BsYXlLaW5kRnJvbU1pbWVUeXBlIH0gZnJvbSAnLi9jb3BpbG90QXR0YWNobWVudFV0aWxzLmpzJztcblxuZnVuY3Rpb24gdHJ5U3RyaW5naWZ5KHZhbHVlOiB1bmtub3duKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0dHJ5IHtcblx0XHRyZXR1cm4gSlNPTi5zdHJpbmdpZnkodmFsdWUpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbmZ1bmN0aW9uIHJlc29sdmVUb29sRGlzcGxheVBhdGgocGF0aDogc3RyaW5nLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRyZXR1cm4gaXNBYnNvbHV0ZShwYXRoKSB8fCAhd29ya2luZ0RpcmVjdG9yeSB8fCB3b3JraW5nRGlyZWN0b3J5LnNjaGVtZSAhPT0gU2NoZW1hcy5maWxlXG5cdFx0PyBwYXRoXG5cdFx0OiBqb2luKHdvcmtpbmdEaXJlY3RvcnkuZnNQYXRoLCBwYXRoKTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhlIGV2ZW50IGlzIGEgU0RLLWluamVjdGVkIGB1c2VyLm1lc3NhZ2VgIHRoYXQgc2hvdWxkIG5vdFxuICogYmUgc2hvd24gdG8gdGhlIHVzZXIgKGUuZy4gc2tpbGwtY29udGVudCBpbmplY3Rpb24pLlxuICpcbiAqIFRoZSBTREsgbWFya3MgdGhlc2UgdmlhIGEgbm9uLWAndXNlcidgIGBzb3VyY2VgIGZpZWxkLiBPbGRlciBzZXNzaW9uc1xuICogcGVyc2lzdGVkIGJlZm9yZSBgc291cmNlYCBleGlzdGVkIHdpbGwgbm90IGJlIGZpbHRlcmVkOyB0aGF0IGlzIGFjY2VwdGVkXG4gKiBsZWFrYWdlIHJhdGhlciB0aGFuIGd1ZXNzZWQtYXQgY29udGVudCBzbmlmZmluZy5cbiAqL1xuZnVuY3Rpb24gaXNTeW50aGV0aWNVc2VyTWVzc2FnZShldmVudDogU2Vzc2lvbkV2ZW50KTogYm9vbGVhbiB7XG5cdGlmIChldmVudC50eXBlICE9PSAndXNlci5tZXNzYWdlJykge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRjb25zdCBzb3VyY2UgPSBldmVudC5kYXRhLnNvdXJjZTtcblx0cmV0dXJuICEhc291cmNlICYmIHNvdXJjZS50b0xvd2VyQ2FzZSgpICE9PSAndXNlcic7XG59XG5cbi8qKlxuICogUmVjb3ZlcnMgdGhlIHRleHQgdGhlIHVzZXIgYWN0dWFsbHkgdHlwZWQgZnJvbSBhIHBlcnNpc3RlZCBgdXNlci5tZXNzYWdlYFxuICogYGNvbnRlbnRgLiBUaGUgY2hhdCBjbGllbnQgcmVuZGVycyB0aGUgcmF3IHByb21wdCBmaXJzdCwgdGhlbiBhcHBlbmRzXG4gKiBgPHJlbWluZGVyPmAgLyBgPGF0dGFjaG1lbnRzPmAgLyBgPGNvbnRleHQ+YCBhbmQgKGZvciBzb21lIGNsaWVudHMpIGFcbiAqIGA8dXNlclJlcXVlc3Q+YCBlY2hvLiBSZW1vdmluZyB0aG9zZSBibG9ja3Mgbm9ybWFsbHkgbGVhdmVzIHRoZSBsZWFkaW5nIHJhd1xuICogcHJvbXB0IChtYXRjaGluZyB0aGUgZXh0ZW5zaW9uLXNpZGUgYHN0cmlwUmVtaW5kZXJzYCBzYW5pdGl6ZXIpLiBXaGVuIHJlbW92YWxcbiAqIGxlYXZlcyBub3RoaW5nIFx1MjAxNCBjb250ZW50IHRoYXQgaXMgb25seSBhIGA8dXNlclJlcXVlc3Q+YCB3cmFwcGVyIFx1MjAxNCB3ZSBmYWxsXG4gKiBiYWNrIHRvIHRoZSB3cmFwcGVyJ3MgaW5uZXIgdGV4dCBzbyB0aGUgbWVzc2FnZSBpcyBub3QgbG9zdC5cbiAqL1xuZnVuY3Rpb24gc3RyaXBQcm9tcHRTY2FmZm9sZGluZyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB3aXRob3V0QXV4ID0gdGV4dFxuXHRcdC5yZXBsYWNlKC88cmVtaW5kZXI+W1xcc1xcU10qPzxcXC9yZW1pbmRlcj5cXHMqL2csICcnKVxuXHRcdC5yZXBsYWNlKC88YXR0YWNobWVudHM+W1xcc1xcU10qPzxcXC9hdHRhY2htZW50cz5cXHMqL2csICcnKVxuXHRcdC5yZXBsYWNlKC88Y29udGV4dD5bXFxzXFxTXSo/PFxcL2NvbnRleHQ+XFxzKi9nLCAnJylcblx0XHQucmVwbGFjZSgvPGN1cnJlbnRfZGF0ZXRpbWU+W1xcc1xcU10qPzxcXC9jdXJyZW50X2RhdGV0aW1lPlxccyovZywgJycpXG5cdFx0LnJlcGxhY2UoLzxwcl9tZXRhZGF0YVtePl0qXFwvPz5cXHMqL2csICcnKTtcblx0Y29uc3Qgd2l0aG91dFJlcXVlc3QgPSB3aXRob3V0QXV4XG5cdFx0LnJlcGxhY2UoLzx1c2VyUmVxdWVzdD5bXFxzXFxTXSo/PFxcL3VzZXJSZXF1ZXN0PlxccyovZywgJycpXG5cdFx0LnJlcGxhY2UoLzx1c2VyX3F1ZXJ5PltcXHNcXFNdKj88XFwvdXNlcl9xdWVyeT5cXHMqL2csICcnKVxuXHRcdC50cmltKCk7XG5cdGlmICh3aXRob3V0UmVxdWVzdCkge1xuXHRcdHJldHVybiB3aXRob3V0UmVxdWVzdDtcblx0fVxuXHRjb25zdCBpbm5lciA9IHdpdGhvdXRBdXgubWF0Y2goLzx1c2VyUmVxdWVzdD4oW1xcc1xcU10qPyk8XFwvdXNlclJlcXVlc3Q+LykgPz8gd2l0aG91dEF1eC5tYXRjaCgvPHVzZXJfcXVlcnk+KFtcXHNcXFNdKj8pPFxcL3VzZXJfcXVlcnk+Lyk7XG5cdHJldHVybiBpbm5lciA/IGlubmVyWzFdLnRyaW0oKSA6IHdpdGhvdXRBdXgudHJpbSgpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIFNESyBgdG9vbC5leGVjdXRpb25fY29tcGxldGVgIGltYWdlIGFuZCBzaGVsbCByZXN1bHQgYmxvY2tzIGludG9cbiAqIEFIUCB0b29sIHJlc3VsdCBjb250ZW50LiBBIGBzaGVsbF9leGl0YCBibG9jayBiZWNvbWVzIHtAbGluayBUZXJtaW5hbENvbW1hbmRSZXN1bHR9IGRhdGEgb25cbiAqIHRoZSB0b29sIGNhbGwncyB0ZXJtaW5hbCBjb250ZW50IGJsb2NrOyB3aGVuIG5vIHRlcm1pbmFsIGJsb2NrIGV4aXN0cyB5ZXRcbiAqIChlLmcuIGhpc3RvcnkgcmVwbGF5LCB3aGVyZSBubyBsaXZlIGNoYW5uZWwgc3Vydml2ZXMpIGFuZCBgdGVybWluYWxgIGlzXG4gKiBwcm92aWRlZCwgYSBub24tcHR5IHRlcm1pbmFsIGJsb2NrIGlzIHN5bnRoZXNpemVkIHNvIHRoZSBvdXRjb21lIHN0aWxsXG4gKiByZW5kZXJzIGZyb20gYHJlc3VsdC5wcmV2aWV3YC4gUmV0dXJucyB0aGUgYHNoZWxsX2V4aXRgIG91dGNvbWUsIGlmIGFueSwgc29cbiAqIHRoZSBsaXZlIHBhdGggY2FuIHNldHRsZSB0aGUgbm9uLXB0eSBvdXRwdXQgY2hhbm5lbCBmcm9tIGl0LlxuICovXG5leHBvcnQgaW50ZXJmYWNlIElTZGtTaGVsbEV4aXQge1xuXHRyZWFkb25seSBzaGVsbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IHJlc3VsdDogVGVybWluYWxDb21tYW5kUmVzdWx0O1xufVxuXG50eXBlIFNka1Rvb2xFeGVjdXRpb25Db21wbGV0ZUNvbnRlbnQgPSBFeGNsdWRlPFRvb2xFeGVjdXRpb25Db21wbGV0ZUNvbnRlbnQsIFRvb2xFeGVjdXRpb25Db21wbGV0ZUNvbnRlbnRTaGVsbEV4aXQ+IHwgKE9taXQ8VG9vbEV4ZWN1dGlvbkNvbXBsZXRlQ29udGVudFNoZWxsRXhpdCwgJ291dHB1dFByZXZpZXcnPiAmIHtcblx0cmVhZG9ubHkgb3V0cHV0UHJldmlldz86IHN0cmluZyB8IG51bGw7XG59KTtcblxuZXhwb3J0IGZ1bmN0aW9uIGFwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50KGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10sIHNka0NvbnRlbnRzOiByZWFkb25seSBTZGtUb29sRXhlY3V0aW9uQ29tcGxldGVDb250ZW50W10gfCB1bmRlZmluZWQsIHRlcm1pbmFsPzogeyBzZXNzaW9uOiBVUkkgfCBzdHJpbmc7IHRvb2xDYWxsSWQ6IHN0cmluZzsgdGl0bGU6IHN0cmluZyB9KTogSVNka1NoZWxsRXhpdCB8IHVuZGVmaW5lZCB7XG5cdGxldCBzaGVsbEV4aXQ6IElTZGtTaGVsbEV4aXQgfCB1bmRlZmluZWQ7XG5cdGZvciAoY29uc3Qgc2RrQ29udGVudCBvZiBzZGtDb250ZW50cyA/PyBbXSkge1xuXHRcdHN3aXRjaCAoc2RrQ29udGVudC50eXBlKSB7XG5cdFx0XHRjYXNlICdpbWFnZSc6XG5cdFx0XHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2UsXG5cdFx0XHRcdFx0ZGF0YTogc2RrQ29udGVudC5kYXRhLFxuXHRcdFx0XHRcdGNvbnRlbnRUeXBlOiBzZGtDb250ZW50Lm1pbWVUeXBlLFxuXHRcdFx0XHR9KTtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlICdzaGVsbF9leGl0Jzoge1xuXHRcdFx0XHRjb25zdCByZXN1bHQ6IFRlcm1pbmFsQ29tbWFuZFJlc3VsdCA9IHtcblx0XHRcdFx0XHRleGl0Q29kZTogc2RrQ29udGVudC5leGl0Q29kZSxcblx0XHRcdFx0XHQuLi4odHlwZW9mIHNka0NvbnRlbnQub3V0cHV0UHJldmlldyA9PT0gJ3N0cmluZycgPyB7IHByZXZpZXc6IHNka0NvbnRlbnQub3V0cHV0UHJldmlldyB9IDoge30pLFxuXHRcdFx0XHRcdC4uLihzZGtDb250ZW50Lm91dHB1dFRydW5jYXRlZCAhPT0gdW5kZWZpbmVkID8geyB0cnVuY2F0ZWQ6IHNka0NvbnRlbnQub3V0cHV0VHJ1bmNhdGVkIH0gOiB7fSksXG5cdFx0XHRcdH07XG5cdFx0XHRcdHNoZWxsRXhpdCA9IHsgc2hlbGxJZDogc2RrQ29udGVudC5zaGVsbElkLCByZXN1bHQgfTtcblx0XHRcdFx0Y29uc3QgdGVybWluYWxJbmRleCA9IGNvbnRlbnQuZmluZEluZGV4KGMgPT4gYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwpO1xuXHRcdFx0XHRpZiAodGVybWluYWxJbmRleCAhPT0gLTEpIHtcblx0XHRcdFx0XHRjb25zdCB0ZXJtaW5hbEJsb2NrID0gY29udGVudFt0ZXJtaW5hbEluZGV4XSBhcyBUb29sUmVzdWx0VGVybWluYWxDb250ZW50O1xuXHRcdFx0XHRcdGNvbnRlbnRbdGVybWluYWxJbmRleF0gPSB7IC4uLnRlcm1pbmFsQmxvY2ssIHJlc3VsdCB9O1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRlcm1pbmFsKSB7XG5cdFx0XHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0XHRcdHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCxcblx0XHRcdFx0XHRcdHJlc291cmNlOiBidWlsZE5vblB0eVNoZWxsVGVybWluYWxVcmkodGVybWluYWwuc2Vzc2lvbiwgdGVybWluYWwudG9vbENhbGxJZCksXG5cdFx0XHRcdFx0XHR0aXRsZTogdGVybWluYWwudGl0bGUsXG5cdFx0XHRcdFx0XHRpc1B0eTogZmFsc2UsXG5cdFx0XHRcdFx0XHRyZXN1bHQsXG5cdFx0XHRcdFx0fSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzaGVsbEV4aXQ7XG59XG5cbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG4vLyBTaW5nbGUtcGFzcyB0dXJuIGJ1aWxkZXJcbi8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbi8qKiBQZXItdG9vbC1jYWxsIGluZm8gY2FwdHVyZWQgZnJvbSBgdG9vbC5leGVjdXRpb25fc3RhcnRgIGFuZCByZXVzZWQgYXQgYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYC4gKi9cbmludGVyZmFjZSBJVG9vbFN0YXJ0SW5mbyB7XG5cdHJlYWRvbmx5IHRvb2xOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGRpc3BsYXlOYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGludm9jYXRpb25NZXNzYWdlOiBTdHJpbmdPck1hcmtkb3duO1xuXHRyZWFkb25seSB0b29sSW5wdXQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHRvb2xLaW5kPzogVG9vbEtpbmQ7XG5cdHJlYWRvbmx5IGxhbmd1YWdlPzogc3RyaW5nO1xuXHQvKiogSW50ZW50aW9uICh3aHkgdGhlIGNvbW1hbmQgcnVucykgZm9yIHNoZWxsIHRvb2xzLCBmcm9tIHRoZWlyIGBkZXNjcmlwdGlvbmAgYXJndW1lbnQuICovXG5cdHJlYWRvbmx5IGludGVudGlvbj86IHN0cmluZztcblx0cmVhZG9ubHkgc3ViYWdlbnRBZ2VudE5hbWU/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHN1YmFnZW50RGVzY3JpcHRpb24/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IHBhcmFtZXRlcnM6IFJlY29yZDxzdHJpbmcsIHVua25vd24+IHwgdW5kZWZpbmVkO1xuXHRyZWFkb25seSBwYXJlbnRUb29sQ2FsbElkPzogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BTZXJ2ZXJOYW1lPzogc3RyaW5nO1xuXHRyZWFkb25seSBtY3BUb29sTmFtZT86IHN0cmluZztcblx0cmVhZG9ubHkgbWNwVWlSZXNvdXJjZVVyaT86IHN0cmluZztcbn1cblxuLyoqIFN1YmFnZW50IG1ldGFkYXRhIHNlZW4gdmlhIGBzdWJhZ2VudC5zdGFydGVkYCwgYXBwbGllZCB0byB0aGUgcGFyZW50IHRvb2wgY2FsbCdzIGNvbnRlbnQgYXQgYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYC4gKi9cbmludGVyZmFjZSBJU3ViYWdlbnRJbmZvIHtcblx0cmVhZG9ubHkgYWdlbnROYW1lOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGFnZW50RGlzcGxheU5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgYWdlbnREZXNjcmlwdGlvbj86IHN0cmluZztcbn1cblxuLyoqXG4gKiBNdXRhYmxlIHBlci10dXJuIHN0YXRlIHVzZWQgd2hpbGUgaXRlcmF0aW5nIGV2ZW50cy4gVGhlIHBhcmVudCBzZXNzaW9uXG4gKiBoYXMgb25lIGJ1aWxkZXI7IGVhY2ggc3ViYWdlbnQgdHVybiAob25lIHBlciBgcGFyZW50VG9vbENhbGxJZGApIGhhcyBpdHNcbiAqIG93biBidWlsZGVyIHNvIGlubmVyIGV2ZW50cyByb3V0ZSB0aGVyZSBkaXJlY3RseS5cbiAqL1xuaW50ZXJmYWNlIElUdXJuQnVpbGRlciB7XG5cdGlkOiBzdHJpbmc7XG5cdG1lc3NhZ2U6IE1lc3NhZ2U7XG5cdC8qKiBJU08gODYwMSB0aW1lc3RhbXAgb2YgdGhlIFNESyBldmVudCB0aGF0IG9wZW5lZCB0aGlzIHR1cm4sIHdoZW4ga25vd24uICovXG5cdHN0YXJ0ZWRBdDogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogSVNPIDg2MDEgdGltZXN0YW1wIG9mIHRoZSBtb3N0IHJlY2VudCBTREsgZXZlbnQgdGhhdCBiZWxvbmdlZCB0byB0aGlzIHR1cm4uICovXG5cdGxhc3RFdmVudEF0OiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdHJlYWRvbmx5IHJlc3BvbnNlUGFydHM6IFJlc3BvbnNlUGFydFtdO1xuXHR1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkO1xuXHRlcnJvcjogRXJyb3JJbmZvIHwgdW5kZWZpbmVkO1xuXHQvKiogVG9vbCBzdGFydHMgc2VlbiBidXQgbm90IHlldCBjb21wbGV0ZWQgaW4gdGhpcyB0dXJuLCBrZXllZCBieSB0b29sQ2FsbElkLiAqL1xuXHRyZWFkb25seSBwZW5kaW5nVG9vbHM6IE1hcDxzdHJpbmcsIElUb29sU3RhcnRJbmZvPjtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJTWFwU2Vzc2lvbkV2ZW50c09wdGlvbnMge1xuXHRyZWFkb25seSB3b3JraW5nRGlyZWN0b3J5PzogVVJJO1xuXHRyZWFkb25seSBtb2RlbD86IE1vZGVsU2VsZWN0aW9uO1xuXHRyZWFkb25seSBhZ2VudD86IEFnZW50U2VsZWN0aW9uO1xufVxuXG5mdW5jdGlvbiBuZXdUdXJuQnVpbGRlcihpZDogc3RyaW5nLCB0ZXh0OiBzdHJpbmcsIG9wdGlvbnM/OiB7IGF0dGFjaG1lbnRzPzogTWVzc2FnZUF0dGFjaG1lbnRbXTsgbW9kZWw/OiBNb2RlbFNlbGVjdGlvbjsgYWdlbnQ/OiBBZ2VudFNlbGVjdGlvbjsgb3JpZ2luPzogTWVzc2FnZUtpbmQ7IHN0YXJ0ZWRBdD86IHN0cmluZyB9KTogSVR1cm5CdWlsZGVyIHtcblx0Y29uc3QgbWVzc2FnZTogTWVzc2FnZSA9IHtcblx0XHR0ZXh0LFxuXHRcdG9yaWdpbjogeyBraW5kOiBvcHRpb25zPy5vcmlnaW4gPz8gTWVzc2FnZUtpbmQuVXNlciB9LFxuXHRcdC4uLihvcHRpb25zPy5hdHRhY2htZW50cz8ubGVuZ3RoID8geyBhdHRhY2htZW50czogb3B0aW9ucy5hdHRhY2htZW50cyB9IDoge30pLFxuXHRcdC4uLihvcHRpb25zPy5tb2RlbCA/IHsgbW9kZWw6IG9wdGlvbnMubW9kZWwgfSA6IHt9KSxcblx0XHQuLi4ob3B0aW9ucz8uYWdlbnQgPyB7IGFnZW50OiBvcHRpb25zLmFnZW50IH0gOiB7fSksXG5cdH07XG5cdHJldHVybiB7IGlkLCBtZXNzYWdlLCBzdGFydGVkQXQ6IG9wdGlvbnM/LnN0YXJ0ZWRBdCwgbGFzdEV2ZW50QXQ6IG9wdGlvbnM/LnN0YXJ0ZWRBdCwgcmVzcG9uc2VQYXJ0czogW10sIHVzYWdlOiB1bmRlZmluZWQsIGVycm9yOiB1bmRlZmluZWQsIHBlbmRpbmdUb29sczogbmV3IE1hcCgpIH07XG59XG5cbi8qKiBSZWFkcyB0aGUgU0RLIGVudmVsb3BlJ3MgSVNPIDg2MDEgYHRpbWVzdGFtcGAsIG9yIGB1bmRlZmluZWRgIHdoZW4gbWlzc2luZyBvciB1bnBhcnNlYWJsZS4gKi9cbmZ1bmN0aW9uIHJlYWRFdmVudFRpbWVzdGFtcChldmVudDogU2Vzc2lvbkV2ZW50KTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGltZXN0YW1wOiB1bmtub3duID0gZXZlbnQudGltZXN0YW1wO1xuXHRyZXR1cm4gaXNTdHJpbmcodGltZXN0YW1wKSAmJiBOdW1iZXIuaXNGaW5pdGUoRGF0ZS5wYXJzZSh0aW1lc3RhbXApKSA/IHRpbWVzdGFtcCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gcmVhZFN0cmluZ1Byb3BlcnR5KHNvdXJjZTogdW5rbm93biwga2V5OiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNvdXJjZSB8fCB0eXBlb2Ygc291cmNlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHZhbHVlID0gKHNvdXJjZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilba2V5XTtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgJiYgdmFsdWUubGVuZ3RoID4gMCA/IHZhbHVlIDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiByZWFkTWNwVWlSZXNvdXJjZVVyaShzb3VyY2U6IHVua25vd24pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXNvdXJjZSB8fCB0eXBlb2Ygc291cmNlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHNvdXJjZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHRvb2xEZXNjcmlwdGlvbiA9IChzb3VyY2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWyd0b29sRGVzY3JpcHRpb24nXTtcblx0aWYgKCF0b29sRGVzY3JpcHRpb24gfHwgdHlwZW9mIHRvb2xEZXNjcmlwdGlvbiAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh0b29sRGVzY3JpcHRpb24pKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBtZXRhID0gKHRvb2xEZXNjcmlwdGlvbiBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ19tZXRhJ107XG5cdGlmICghbWV0YSB8fCB0eXBlb2YgbWV0YSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShtZXRhKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdWkgPSAobWV0YSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ3VpJ107XG5cdGlmICghdWkgfHwgdHlwZW9mIHVpICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHVpKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHJlYWRTdHJpbmdQcm9wZXJ0eSh1aSwgJ3Jlc291cmNlVXJpJyk7XG59XG5cbmZ1bmN0aW9uIG1ha2VUb29sU3RhcnRJbmZvKHRvb2xOYW1lOiBzdHJpbmcsIHJhd0FyZ3VtZW50czogdW5rbm93biwgcGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB3b3JraW5nRGlyZWN0b3J5OiBVUkkgfCB1bmRlZmluZWQsIHNvdXJjZTogdW5rbm93bik6IElUb29sU3RhcnRJbmZvIHwgdW5kZWZpbmVkIHtcblx0aWYgKGlzSGlkZGVuVG9vbCh0b29sTmFtZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhd0FyZ3MgPSByYXdBcmd1bWVudHMgIT09IHVuZGVmaW5lZCA/IHRyeVN0cmluZ2lmeShyYXdBcmd1bWVudHMpIDogdW5kZWZpbmVkO1xuXHRsZXQgcGFyYW1ldGVyczogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gfCB1bmRlZmluZWQ7XG5cdGlmIChyYXdBcmdzKSB7XG5cdFx0dHJ5IHsgcGFyYW1ldGVycyA9IEpTT04ucGFyc2UocmF3QXJncykgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47IH0gY2F0Y2ggeyAvKiBpZ25vcmUgKi8gfVxuXHR9XG5cdC8vIHN0cmlwUmVkdW5kYW50Q2RQcmVmaXggbXV0YXRlcyBgcGFyYW1ldGVyc2AgYW5kIHNpZ25hbHMgdmlhIGl0c1xuXHQvLyByZXR1cm4gdmFsdWUuIFdlIHJlLXN0cmluZ2lmeSBvbmx5IHdoZW4gaXQgY2hhbmdlZCBzb21ldGhpbmcgc29cblx0Ly8gYGdldFRvb2xJbnB1dFN0cmluZ2Agc2VlcyB0aGUgY2xlYW5lZCBjb21tYW5kIGxpbmUuXG5cdGNvbnN0IGNsZWFuZWQgPSBzdHJpcFJlZHVuZGFudENkUHJlZml4KHRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB3b3JraW5nRGlyZWN0b3J5KSA/IHRyeVN0cmluZ2lmeShwYXJhbWV0ZXJzKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgdG9vbEFyZ3MgPSBjbGVhbmVkID8/IHJhd0FyZ3M7XG5cdGNvbnN0IHRvb2xLaW5kID0gZ2V0VG9vbEtpbmQodG9vbE5hbWUsIHBhcmFtZXRlcnMpO1xuXHRjb25zdCBzdWJhZ2VudE1ldGEgPSB0b29sS2luZCA9PT0gJ3N1YmFnZW50JyA/IGdldFN1YmFnZW50TWV0YWRhdGEocGFyYW1ldGVycykgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGRpc3BsYXlOYW1lID0gZ2V0VG9vbERpc3BsYXlOYW1lKHRvb2xOYW1lKTtcblx0cmV0dXJuIHtcblx0XHR0b29sTmFtZSxcblx0XHRkaXNwbGF5TmFtZSxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogZ2V0SW52b2NhdGlvbk1lc3NhZ2UodG9vbE5hbWUsIGRpc3BsYXlOYW1lLCBwYXJhbWV0ZXJzLCBwYXRoID0+IHJlc29sdmVUb29sRGlzcGxheVBhdGgocGF0aCwgd29ya2luZ0RpcmVjdG9yeSkpLFxuXHRcdHRvb2xJbnB1dDogZ2V0VG9vbElucHV0U3RyaW5nKHRvb2xOYW1lLCBwYXJhbWV0ZXJzLCB0b29sQXJncyksXG5cdFx0dG9vbEtpbmQsXG5cdFx0bGFuZ3VhZ2U6IHRvb2xLaW5kID09PSAndGVybWluYWwnID8gZ2V0U2hlbGxMYW5ndWFnZSh0b29sTmFtZSkgOiB1bmRlZmluZWQsXG5cdFx0aW50ZW50aW9uOiBnZXRTaGVsbEludGVudGlvbih0b29sTmFtZSwgcGFyYW1ldGVycyksXG5cdFx0c3ViYWdlbnRBZ2VudE5hbWU6IHN1YmFnZW50TWV0YT8uYWdlbnROYW1lLFxuXHRcdHN1YmFnZW50RGVzY3JpcHRpb246IHN1YmFnZW50TWV0YT8uZGVzY3JpcHRpb24sXG5cdFx0cGFyYW1ldGVycyxcblx0XHRwYXJlbnRUb29sQ2FsbElkLFxuXHRcdG1jcFNlcnZlck5hbWU6IHJlYWRTdHJpbmdQcm9wZXJ0eShzb3VyY2UsICdtY3BTZXJ2ZXJOYW1lJyksXG5cdFx0bWNwVG9vbE5hbWU6IHJlYWRTdHJpbmdQcm9wZXJ0eShzb3VyY2UsICdtY3BUb29sTmFtZScpLFxuXHRcdG1jcFVpUmVzb3VyY2VVcmk6IHJlYWRNY3BVaVJlc291cmNlVXJpKHNvdXJjZSksXG5cdH07XG59XG5cbi8qKiBTZWFscyBhIHR1cm4gYnVpbGRlciBpbnRvIGEge0BsaW5rIFR1cm59LCBkZXJpdmluZyBgZHVyYXRpb25gIGZyb20gaXRzIGZpcnN0IGFuZCBsYXN0IGV2ZW50IHRpbWVzdGFtcHMuICovXG5mdW5jdGlvbiBmaW5hbGl6ZVR1cm4oYnVpbGRlcjogSVR1cm5CdWlsZGVyLCBzdGF0ZTogVHVyblN0YXRlKTogVHVybiB7XG5cdGNvbnN0IHN0YXJ0ZWRBdE1zID0gYnVpbGRlci5zdGFydGVkQXQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IERhdGUucGFyc2UoYnVpbGRlci5zdGFydGVkQXQpO1xuXHRjb25zdCBlbmRlZEF0TXMgPSBidWlsZGVyLmxhc3RFdmVudEF0ID09PSB1bmRlZmluZWQgPyB1bmRlZmluZWQgOiBEYXRlLnBhcnNlKGJ1aWxkZXIubGFzdEV2ZW50QXQpO1xuXHRjb25zdCBkdXJhdGlvbiA9IHN0YXJ0ZWRBdE1zICE9PSB1bmRlZmluZWQgJiYgZW5kZWRBdE1zICE9PSB1bmRlZmluZWQgJiYgTnVtYmVyLmlzRmluaXRlKHN0YXJ0ZWRBdE1zKSAmJiBOdW1iZXIuaXNGaW5pdGUoZW5kZWRBdE1zKVxuXHRcdD8gTWF0aC5tYXgoMCwgZW5kZWRBdE1zIC0gc3RhcnRlZEF0TXMpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdHJldHVybiB7XG5cdFx0aWQ6IGJ1aWxkZXIuaWQsXG5cdFx0Li4uKGJ1aWxkZXIuc3RhcnRlZEF0ICE9PSB1bmRlZmluZWQgPyB7IHN0YXJ0ZWRBdDogYnVpbGRlci5zdGFydGVkQXQgfSA6IHt9KSxcblx0XHQuLi4oZHVyYXRpb24gIT09IHVuZGVmaW5lZCA/IHsgZHVyYXRpb24gfSA6IHt9KSxcblx0XHRtZXNzYWdlOiBidWlsZGVyLm1lc3NhZ2UsXG5cdFx0cmVzcG9uc2VQYXJ0czogYnVpbGRlci5yZXNwb25zZVBhcnRzLFxuXHRcdHVzYWdlOiBidWlsZGVyLnVzYWdlLFxuXHRcdHN0YXRlLFxuXHRcdC4uLihidWlsZGVyLmVycm9yID8geyBlcnJvcjogYnVpbGRlci5lcnJvciB9IDoge30pLFxuXHR9O1xufVxuXG4vKipcbiAqIE1hcHMgcmF3IFNESyBzZXNzaW9uIGV2ZW50cyBkaXJlY3RseSBpbnRvIGFnZW50LXByb3RvY29sIHtAbGluayBUdXJufXNcbiAqIGZvciB0aGUgcGFyZW50IHNlc3Npb24gYW5kIGFueSBzdWJhZ2VudCBjaGlsZCBzZXNzaW9ucywgcmVzdG9yaW5nIHN0b3JlZFxuICogZmlsZS1lZGl0IG1ldGFkYXRhIGZyb20gdGhlIHNlc3Npb24gZGF0YWJhc2Ugd2hlbiBhdmFpbGFibGUuXG4gKlxuICogU3ViYWdlbnQgaW5uZXIgZXZlbnRzIGFyZSByb3V0ZWQgdG8gcGVyLWBwYXJlbnRUb29sQ2FsbElkYCB0dXJuIGJ1aWxkZXJzXG4gKiBzbyB0aGV5IGFwcGVhciB1bmRlciB0aGVpciBvd24gc2Vzc2lvbiB2aWV3IHJhdGhlciB0aGFuIHBvbGx1dGluZyB0aGVcbiAqIHBhcmVudCB0cmFuc2NyaXB0LiBFYWNoIHN1YmFnZW50J3MgdG9vbCBjYWxscyBhcmUgcmV0dXJuZWQgdmlhXG4gKiB7QGxpbmsgbWFwU2Vzc2lvbkV2ZW50c1RvVHVybnMuc3ViYWdlbnRUdXJuc0J5VG9vbENhbGxJZH0gc28gY2FsbGVycyBjYW5cbiAqIGV4cG9zZSBgZ2V0U3ViYWdlbnRNZXNzYWdlc2AgY2hlYXBseS5cbiAqXG4gKiBJZiBgd29ya2luZ0RpcmVjdG9yeWAgaXMgcHJvdmlkZWQsIHJlZHVuZGFudCBgY2QgPHdvcmtpbmdEaXJlY3Rvcnk+ICYmYFxuICogKG9yIFBvd2VyU2hlbGwgZXF1aXZhbGVudCkgcHJlZml4ZXMgYXJlIHN0cmlwcGVkIGZyb20gc2hlbGwgdG9vbFxuICogY29tbWFuZHMgc28gY2xpZW50cyBzZWUgdGhlIHNpbXBsaWZpZWQgZm9ybS5cbiAqL1xuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1hcFNlc3Npb25FdmVudHMoXG5cdHNlc3Npb246IFVSSSxcblx0ZGI6IElTZXNzaW9uRGF0YWJhc2UgfCB1bmRlZmluZWQsXG5cdGV2ZW50czogcmVhZG9ubHkgU2Vzc2lvbkV2ZW50W10sXG5cdG9wdGlvbnM6IFVSSSB8IElNYXBTZXNzaW9uRXZlbnRzT3B0aW9ucyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZCxcbik6IFByb21pc2U8eyB0dXJuczogVHVybltdOyBzdWJhZ2VudFR1cm5zQnlUb29sQ2FsbElkOiBSZWFkb25seU1hcDxzdHJpbmcsIFR1cm5bXT4gfT4ge1xuXHRjb25zdCB3b3JraW5nRGlyZWN0b3J5ID0gb3B0aW9ucyBpbnN0YW5jZW9mIFVSSSA/IG9wdGlvbnMgOiBvcHRpb25zPy53b3JraW5nRGlyZWN0b3J5O1xuXHRsZXQgY3VycmVudE1vZGVsID0gb3B0aW9ucyBpbnN0YW5jZW9mIFVSSSA/IHVuZGVmaW5lZCA6IG9wdGlvbnM/Lm1vZGVsO1xuXHRsZXQgY3VycmVudEFnZW50ID0gb3B0aW9ucyBpbnN0YW5jZW9mIFVSSSA/IHVuZGVmaW5lZCA6IG9wdGlvbnM/LmFnZW50O1xuXHQvLyBGaXJzdCBwYXNzOiBjb2xsZWN0IHRvb2wtYXJnIGluZm8gYW5kIGlkZW50aWZ5IGVkaXQgdG9vbCBjYWxscyBzbyB3ZVxuXHQvLyBjYW4gYmF0Y2gtbG9hZCB0aGVpciBzdG9yZWQgZmlsZSBlZGl0cyBiZWZvcmUgdGhlIHNlY29uZCBwYXNzIG5lZWRzXG5cdC8vIHRoZW0gYXQgYHRvb2wuZXhlY3V0aW9uX2NvbXBsZXRlYCB0aW1lLiBXZSBhbHNvIGJ1aWxkIHRoZVxuXHQvLyBgYWdlbnRJZGAgLT4gcGFyZW50IHRvb2wgY2FsbCBpZCBtYXAgaGVyZSBzbyB0aGUgc2Vjb25kIHBhc3MgY2FuIHJvdXRlXG5cdC8vIHN1Yi1hZ2VudCBldmVudHMgd2l0aG91dCBkZXBlbmRpbmcgb24gZXZlbnQgb3JkZXJpbmcuXG5cdGNvbnN0IHRvb2xJbmZvQnlDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSVRvb2xTdGFydEluZm8+KCk7XG5cdGNvbnN0IGVkaXRUb29sQ2FsbElkczogc3RyaW5nW10gPSBbXTtcblx0Y29uc3QgY29tcGxldGlvbnNCeUNhbGxJZCA9IG5ldyBNYXA8c3RyaW5nLCBUb29sRXhlY3V0aW9uQ29tcGxldGVEYXRhPigpO1xuXHRjb25zdCBzdWJhZ2VudEluZm9CeVRvb2xDYWxsSWQgPSBuZXcgTWFwPHN0cmluZywgSVN1YmFnZW50SW5mbz4oKTtcblxuXHQvLyBUaGUgU0RLIHRhZ3MgZXZlbnRzIHRoYXQgb3JpZ2luYXRlIGZyb20gYSBzdWItYWdlbnQgd2l0aCBhblxuXHQvLyBlbnZlbG9wZS1sZXZlbCBgYWdlbnRJZGAgKHRoZSBkZXByZWNhdGVkIGBkYXRhLnBhcmVudFRvb2xDYWxsSWRgIGlzIG5vXG5cdC8vIGxvbmdlciBwb3B1bGF0ZWQpLiBgc3ViYWdlbnQuc3RhcnRlZGAgY2FycmllcyBib3RoIHRoZSBzdWItYWdlbnQnc1xuXHQvLyBgYWdlbnRJZGAgYW5kIHRoZSBwYXJlbnQgdG9vbCBjYWxsIGlkIGl0IHdhcyBzcGF3bmVkIGZyb20sIHNvIHdlIG1hcFxuXHQvLyBvbmUgdG8gdGhlIG90aGVyIGFuZCByZXNvbHZlIGV2ZXJ5IGxhdGVyIHN1Yi1hZ2VudCBldmVudCB0aHJvdWdoIGl0LlxuXHRjb25zdCBwYXJlbnRUb29sQ2FsbElkQnlBZ2VudElkID0gbmV3IE1hcDxzdHJpbmcsIHN0cmluZz4oKTtcblx0Y29uc3QgcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQgPSAoYWdlbnRJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkID0+IHtcblx0XHRjb25zdCBtYXBwZWQgPSBhZ2VudElkID8gcGFyZW50VG9vbENhbGxJZEJ5QWdlbnRJZC5nZXQoYWdlbnRJZCkgOiB1bmRlZmluZWQ7XG5cdFx0cmV0dXJuIG1hcHBlZCA/PyBkZXByZWNhdGVkUGFyZW50VG9vbENhbGxJZDtcblx0fTtcblxuXHRmb3IgKGNvbnN0IGUgb2YgZXZlbnRzKSB7XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3N1YmFnZW50LnN0YXJ0ZWQnKSB7XG5cdFx0XHRzdWJhZ2VudEluZm9CeVRvb2xDYWxsSWQuc2V0KGUuZGF0YS50b29sQ2FsbElkLCB7XG5cdFx0XHRcdGFnZW50TmFtZTogZS5kYXRhLmFnZW50TmFtZSxcblx0XHRcdFx0YWdlbnREaXNwbGF5TmFtZTogZS5kYXRhLmFnZW50RGlzcGxheU5hbWUsXG5cdFx0XHRcdGFnZW50RGVzY3JpcHRpb246IGUuZGF0YS5hZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0fSk7XG5cdFx0XHRpZiAoZS5hZ2VudElkKSB7XG5cdFx0XHRcdHBhcmVudFRvb2xDYWxsSWRCeUFnZW50SWQuc2V0KGUuYWdlbnRJZCwgZS5kYXRhLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHRpZiAoZS50eXBlID09PSAndG9vbC5leGVjdXRpb25fY29tcGxldGUnKSB7XG5cdFx0XHRjb21wbGV0aW9uc0J5Q2FsbElkLnNldChlLmRhdGEudG9vbENhbGxJZCwgZS5kYXRhKTtcblx0XHR9XG5cdFx0aWYgKGUudHlwZSA9PT0gJ3Rvb2wuZXhlY3V0aW9uX3N0YXJ0Jykge1xuXHRcdFx0Y29uc3QgZCA9IGUuZGF0YTtcblx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIGQucGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRjb25zdCBpbmZvID0gbWFrZVRvb2xTdGFydEluZm8oZC50b29sTmFtZSwgZC5hcmd1bWVudHMsIHBhcmVudFRvb2xDYWxsSWQsIHdvcmtpbmdEaXJlY3RvcnksIGQpO1xuXHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0dG9vbEluZm9CeUNhbGxJZC5zZXQoZC50b29sQ2FsbElkLCBpbmZvKTtcblx0XHRcdGNvbnN0IGNvbW1hbmQgPSBpc1N0cmluZyhpbmZvLnBhcmFtZXRlcnM/LmNvbW1hbmQpID8gaW5mby5wYXJhbWV0ZXJzLmNvbW1hbmQgOiB1bmRlZmluZWQ7XG5cdFx0XHRpZiAoaXNFZGl0VG9vbChkLnRvb2xOYW1lLCBjb21tYW5kKSkge1xuXHRcdFx0XHRlZGl0VG9vbENhbGxJZHMucHVzaChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8vIFByZS1sb2FkIHN0b3JlZCBmaWxlLWVkaXQgbWV0YWRhdGEgZm9yIGFsbCBlZGl0IHRvb2wgY2FsbHMuXG5cdGxldCBzdG9yZWRFZGl0czogTWFwPHN0cmluZywgSUZpbGVFZGl0UmVjb3JkW10+IHwgdW5kZWZpbmVkO1xuXHRpZiAoZGIgJiYgZWRpdFRvb2xDYWxsSWRzLmxlbmd0aCA+IDApIHtcblx0XHR0cnkge1xuXHRcdFx0Y29uc3QgcmVjb3JkcyA9IGF3YWl0IGRiLmdldEZpbGVFZGl0cyhlZGl0VG9vbENhbGxJZHMpO1xuXHRcdFx0aWYgKHJlY29yZHMubGVuZ3RoID4gMCkge1xuXHRcdFx0XHRzdG9yZWRFZGl0cyA9IG5ldyBNYXAoKTtcblx0XHRcdFx0Zm9yIChjb25zdCByIG9mIHJlY29yZHMpIHtcblx0XHRcdFx0XHRsZXQgbGlzdCA9IHN0b3JlZEVkaXRzLmdldChyLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghbGlzdCkge1xuXHRcdFx0XHRcdFx0bGlzdCA9IFtdO1xuXHRcdFx0XHRcdFx0c3RvcmVkRWRpdHMuc2V0KHIudG9vbENhbGxJZCwgbGlzdCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGxpc3QucHVzaChyKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0gY2F0Y2gge1xuXHRcdFx0Ly8gRGF0YWJhc2UgbWF5IG5vdCBleGlzdCB5ZXQgZm9yIG5ldyBzZXNzaW9ucyBcdTIwMTQgdGhhdCdzIGZpbmUuXG5cdFx0fVxuXHR9XG5cblx0Y29uc3Qgc2Vzc2lvblVyaVN0ciA9IHNlc3Npb24udG9TdHJpbmcoKTtcblx0Y29uc3QgcHJvdmlkZXJJZCA9IHNlc3Npb24uc2NoZW1lO1xuXHRjb25zdCByYXdTZXNzaW9uSWQgPSBBZ2VudFNlc3Npb24uaWQoc2Vzc2lvbik7XG5cdGNvbnN0IHR1cm5zOiBUdXJuW10gPSBbXTtcblxuXHQvLyBTdWJhZ2VudCBzdGF0ZS4gRWFjaCBzdWJhZ2VudCBoYXMgaXRzIG93biBhY3RpdmUgdHVybiBidWlsZGVyOyBvbmx5XG5cdC8vIHRoZSBtb3N0IHJlY2VudCB0dXJuIHBlciBzdWJhZ2VudCBpcyBidWlsdCAoc3ViYWdlbnRzIGN1cnJlbnRseSBlbWl0XG5cdC8vIGF0IG1vc3Qgb25lIHR1cm4gcGVyIGludm9jYXRpb24pLlxuXHRjb25zdCBzdWJhZ2VudEJ1aWxkZXJzID0gbmV3IE1hcDxzdHJpbmcsIElUdXJuQnVpbGRlcj4oKTtcblx0Y29uc3Qgc3ViYWdlbnRUdXJuU3RhdGVzID0gbmV3IE1hcDxzdHJpbmcsIFR1cm5TdGF0ZT4oKTtcblx0Y29uc3QgdGVybWluYXRlZFN1YmFnZW50VHVybnMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0Y29uc3Qgc3ViYWdlbnRUdXJucyA9IG5ldyBNYXA8c3RyaW5nLCBUdXJuW10+KCk7XG5cdGxldCBwYXJlbnRCdWlsZGVyOiBJVHVybkJ1aWxkZXIgfCB1bmRlZmluZWQ7XG5cdGxldCBwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRsZXQgcGFyZW50VHVyblRlcm1pbmF0ZWQgPSBmYWxzZTtcblx0bGV0IHJvb3RBc3Npc3RhbnRUdXJuQWN0aXZlID0gZmFsc2U7XG5cdGxldCBwZW5kaW5nQXV0b01vZGVSZXNvbHZlZDogRXh0cmFjdDxTZXNzaW9uRXZlbnQsIHsgdHlwZTogJ3Nlc3Npb24uYXV0b19tb2RlX3Jlc29sdmVkJyB9PlsnZGF0YSddIHwgdW5kZWZpbmVkO1xuXG5cdC8qKiBFbnZlbG9wZSB0aW1lc3RhbXAgb2YgdGhlIGV2ZW50IGN1cnJlbnRseSBiZWluZyBwcm9jZXNzZWQuICovXG5cdGxldCBjdXJyZW50RXZlbnRUaW1lc3RhbXA6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuXHQvKiogUmVjb3JkcyB0aGUgY3VycmVudCBldmVudCBhcyBiZWxvbmdpbmcgdG8gYGJ1aWxkZXJgLCBzbyBpdCBib3VuZHMgdGhhdCB0dXJuJ3MgZHVyYXRpb24uICovXG5cdGNvbnN0IHRvdWNoID0gKGJ1aWxkZXI6IElUdXJuQnVpbGRlciB8IHVuZGVmaW5lZCk6IHZvaWQgPT4ge1xuXHRcdGlmIChidWlsZGVyICYmIGN1cnJlbnRFdmVudFRpbWVzdGFtcCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRidWlsZGVyLmxhc3RFdmVudEF0ID0gY3VycmVudEV2ZW50VGltZXN0YW1wO1xuXHRcdH1cblx0fTtcblxuXHRjb25zdCBmbHVzaFBhcmVudCA9ICgpOiB2b2lkID0+IHtcblx0XHRpZiAoIXBhcmVudEJ1aWxkZXIpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0dHVybnMucHVzaChmaW5hbGl6ZVR1cm4ocGFyZW50QnVpbGRlciwgcGFyZW50VHVyblN0YXRlKSk7XG5cdFx0cGFyZW50QnVpbGRlciA9IHVuZGVmaW5lZDtcblx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdHBhcmVudFR1cm5UZXJtaW5hdGVkID0gZmFsc2U7XG5cdH07XG5cblx0Y29uc3QgZmx1c2hTdWJhZ2VudCA9IChwYXJlbnRUb29sQ2FsbElkOiBzdHJpbmcpOiB2b2lkID0+IHtcblx0XHRjb25zdCBidWlsZGVyID0gc3ViYWdlbnRCdWlsZGVycy5nZXQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0aWYgKCFidWlsZGVyKSB7XG5cdFx0XHRzdWJhZ2VudFR1cm5TdGF0ZXMuZGVsZXRlKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRzdWJhZ2VudEJ1aWxkZXJzLmRlbGV0ZShwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRjb25zdCBzdGF0ZSA9IHN1YmFnZW50VHVyblN0YXRlcy5nZXQocGFyZW50VG9vbENhbGxJZCkgPz8gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdHN1YmFnZW50VHVyblN0YXRlcy5kZWxldGUocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0dGVybWluYXRlZFN1YmFnZW50VHVybnMuZGVsZXRlKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdGlmIChidWlsZGVyLnJlc3BvbnNlUGFydHMubGVuZ3RoID09PSAwICYmICFidWlsZGVyLmVycm9yKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGNvbnN0IGxpc3QgPSBzdWJhZ2VudFR1cm5zLmdldChwYXJlbnRUb29sQ2FsbElkKSA/PyBbXTtcblx0XHRsaXN0LnB1c2goZmluYWxpemVUdXJuKGJ1aWxkZXIsIHN0YXRlKSk7XG5cdFx0c3ViYWdlbnRUdXJucy5zZXQocGFyZW50VG9vbENhbGxJZCwgbGlzdCk7XG5cdH07XG5cblx0Y29uc3QgZW5zdXJlU3ViYWdlbnRCdWlsZGVyID0gKHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyk6IElUdXJuQnVpbGRlciA9PiB7XG5cdFx0bGV0IGJ1aWxkZXIgPSBzdWJhZ2VudEJ1aWxkZXJzLmdldChwYXJlbnRUb29sQ2FsbElkKTtcblx0XHRpZiAoIWJ1aWxkZXIpIHtcblx0XHRcdGJ1aWxkZXIgPSBuZXdUdXJuQnVpbGRlcihnZW5lcmF0ZVV1aWQoKSwgJycsIHsgc3RhcnRlZEF0OiBjdXJyZW50RXZlbnRUaW1lc3RhbXAgfSk7XG5cdFx0XHRzdWJhZ2VudEJ1aWxkZXJzLnNldChwYXJlbnRUb29sQ2FsbElkLCBidWlsZGVyKTtcblx0XHRcdGlmICghc3ViYWdlbnRUdXJuU3RhdGVzLmhhcyhwYXJlbnRUb29sQ2FsbElkKSkge1xuXHRcdFx0XHRzdWJhZ2VudFR1cm5TdGF0ZXMuc2V0KHBhcmVudFRvb2xDYWxsSWQsIFR1cm5TdGF0ZS5Db21wbGV0ZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHRcdHRvdWNoKGJ1aWxkZXIpO1xuXHRcdHJldHVybiBidWlsZGVyO1xuXHR9O1xuXG5cdGNvbnN0IHRhcmdldEJ1aWxkZXJGb3IgPSAocGFyZW50VG9vbENhbGxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVR1cm5CdWlsZGVyIHwgdW5kZWZpbmVkID0+IHtcblx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0cmV0dXJuIGVuc3VyZVN1YmFnZW50QnVpbGRlcihwYXJlbnRUb29sQ2FsbElkKTtcblx0XHR9XG5cdFx0dG91Y2gocGFyZW50QnVpbGRlcik7XG5cdFx0cmV0dXJuIHBhcmVudEJ1aWxkZXI7XG5cdH07XG5cblx0Zm9yIChjb25zdCBlIG9mIGV2ZW50cykge1xuXHRcdGN1cnJlbnRFdmVudFRpbWVzdGFtcCA9IHJlYWRFdmVudFRpbWVzdGFtcChlKTtcblx0XHRzd2l0Y2ggKGUudHlwZSkge1xuXHRcdFx0Y2FzZSAnYXNzaXN0YW50LnR1cm5fc3RhcnQnOlxuXHRcdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHRcdHJvb3RBc3Npc3RhbnRUdXJuQWN0aXZlID0gdHJ1ZTtcblx0XHRcdFx0XHR0b3VjaChwYXJlbnRCdWlsZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ2Fzc2lzdGFudC50dXJuX2VuZCc6XG5cdFx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdFx0cm9vdEFzc2lzdGFudFR1cm5BY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0XHR0b3VjaChwYXJlbnRCdWlsZGVyKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdGNhc2UgJ3Nlc3Npb24uc3RhcnQnOiB7XG5cdFx0XHRcdC8vIFJlc3RvcmUgdGhlIGluaXRpYWwgbW9kZWw7IGxhdGVyIG1vZGVsLWNoYW5nZSBldmVudHMgdGFrZSBwcmVjZWRlbmNlLlxuXHRcdFx0XHRpZiAoIWUuYWdlbnRJZCAmJiBlLmRhdGEuc2VsZWN0ZWRNb2RlbCkge1xuXHRcdFx0XHRcdGN1cnJlbnRNb2RlbCA9IHsgaWQ6IGUuZGF0YS5zZWxlY3RlZE1vZGVsIH07XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzZXNzaW9uLm1vZGVsX2NoYW5nZSc6IHtcblx0XHRcdFx0Y3VycmVudE1vZGVsID0geyBpZDogZS5kYXRhLm5ld01vZGVsIH07XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2Vzc2lvbi5hdXRvX21vZGVfcmVzb2x2ZWQnOiB7XG5cdFx0XHRcdGlmICghZS5hZ2VudElkKSB7XG5cdFx0XHRcdFx0cGVuZGluZ0F1dG9Nb2RlUmVzb2x2ZWQgPSBlLmRhdGE7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzdWJhZ2VudC5kZXNlbGVjdGVkJzoge1xuXHRcdFx0XHRpZiAoIWUuYWdlbnRJZCkge1xuXHRcdFx0XHRcdGN1cnJlbnRBZ2VudCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0fVxuXHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHRcdGNhc2UgJ3VzZXIubWVzc2FnZSc6IHtcblx0XHRcdFx0aWYgKGlzU3ludGhldGljVXNlck1lc3NhZ2UoZSkpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBkID0gZS5kYXRhO1xuXHRcdFx0XHRjb25zdCBtZXNzYWdlSWQgPSBkLmludGVyYWN0aW9uSWQgPz8gJyc7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBzdHJpcFByb21wdFNjYWZmb2xkaW5nKGQuY29udGVudCA/PyAnJyk7XG5cdFx0XHRcdGNvbnN0IGF0dGFjaG1lbnRzID0gc2RrQXR0YWNobWVudHNUb1Byb3RvY29sKGQuYXR0YWNobWVudHMpO1xuXHRcdFx0XHQvLyBVc2VyIG1lc3NhZ2VzIGNhcnJ5IG5vIGRlcHJlY2F0ZWQgYHBhcmVudFRvb2xDYWxsSWRgOyByb3V0ZVxuXHRcdFx0XHQvLyBzdWItYWdlbnQgdXNlciBtZXNzYWdlcyBieSB0aGUgZW52ZWxvcGUgYGFnZW50SWRgIG9ubHkuXG5cdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChlLmFnZW50SWQgJiYgIXBhcmVudFRvb2xDYWxsSWQpIHtcblx0XHRcdFx0XHRjb250aW51ZTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAocGFyZW50VG9vbENhbGxJZCkge1xuXHRcdFx0XHRcdGNvbnN0IGJ1aWxkZXIgPSBlbnN1cmVTdWJhZ2VudEJ1aWxkZXIocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0YnVpbGRlci5tZXNzYWdlID0ge1xuXHRcdFx0XHRcdFx0Li4uYnVpbGRlci5tZXNzYWdlLFxuXHRcdFx0XHRcdFx0dGV4dDogY29udGVudCxcblx0XHRcdFx0XHRcdC4uLihhdHRhY2htZW50cz8ubGVuZ3RoID8geyBhdHRhY2htZW50cyB9IDoge30pLFxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0Ly8gQSBuZXcgdG9wLWxldmVsIHVzZXIgbWVzc2FnZSBzdGFydHMgYSBuZXcgcGFyZW50IHR1cm4uXG5cdFx0XHRcdFx0Ly8gVXNlIHRoZSBTREsgZW52ZWxvcGUgaWQgKHRoZSBzYW1lIHZhbHVlXG5cdFx0XHRcdFx0Ly8gYHNldFR1cm5FdmVudElkYCByZWNvcmRzIGFzIGBldmVudF9pZGApIHNvIHRoZSByZXN0b3JlZFxuXHRcdFx0XHRcdC8vIHR1cm4gaWQgcm91bmQtdHJpcHMgYmFjayB0byB0aGUgU0RLIGJvdW5kYXJ5IGlkIHRoYXRcblx0XHRcdFx0XHQvLyBmb3JrIC8gdHJ1bmNhdGUgUlBDcyBvcGVyYXRlIG9uLlxuXHRcdFx0XHRcdGZsdXNoUGFyZW50KCk7XG5cdFx0XHRcdFx0Y29uc3QgdHVybklkID0gZS5pZCA/PyBtZXNzYWdlSWQ7XG5cdFx0XHRcdFx0cGFyZW50QnVpbGRlciA9IG5ld1R1cm5CdWlsZGVyKHR1cm5JZCwgY29udGVudCwgeyBhdHRhY2htZW50cywgbW9kZWw6IGN1cnJlbnRNb2RlbCwgYWdlbnQ6IGN1cnJlbnRBZ2VudCwgc3RhcnRlZEF0OiBjdXJyZW50RXZlbnRUaW1lc3RhbXAgfSk7XG5cdFx0XHRcdFx0aWYgKHBlbmRpbmdBdXRvTW9kZVJlc29sdmVkKSB7XG5cdFx0XHRcdFx0XHRwYXJlbnRCdWlsZGVyLnVzYWdlID0ge1xuXHRcdFx0XHRcdFx0XHRtb2RlbDogcGVuZGluZ0F1dG9Nb2RlUmVzb2x2ZWQuY2hvc2VuTW9kZWwsXG5cdFx0XHRcdFx0XHRcdF9tZXRhOiB7IGF1dG9Nb2RlUmVzb2x2ZWQ6IHBlbmRpbmdBdXRvTW9kZVJlc29sdmVkIH0sXG5cdFx0XHRcdFx0XHR9O1xuXHRcdFx0XHRcdFx0cGVuZGluZ0F1dG9Nb2RlUmVzb2x2ZWQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYXNzaXN0YW50Lm1lc3NhZ2UnOiB7XG5cdFx0XHRcdGNvbnN0IGQgPSBlLmRhdGE7XG5cdFx0XHRcdGNvbnN0IG1lc3NhZ2VJZCA9IGQubWVzc2FnZUlkID8/IGQuaW50ZXJhY3Rpb25JZCA/PyAnJztcblx0XHRcdFx0Y29uc3QgY29udGVudCA9IGQuY29udGVudCA/PyAnJztcblx0XHRcdFx0Y29uc3QgcmVhc29uaW5nVGV4dCA9IGQucmVhc29uaW5nVGV4dDtcblx0XHRcdFx0Y29uc3QgaGFzVG9vbFJlcXVlc3RzID0gISFkLnRvb2xSZXF1ZXN0cyAmJiBkLnRvb2xSZXF1ZXN0cy5sZW5ndGggPiAwO1xuXHRcdFx0XHRjb25zdCBwYXJlbnRUb29sQ2FsbElkID0gcmVzb2x2ZVBhcmVudFRvb2xDYWxsSWQoZS5hZ2VudElkLCBkLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIWNvbnRlbnQgJiYgIXJlYXNvbmluZ1RleHQgJiYgIWhhc1Rvb2xSZXF1ZXN0cykge1xuXHRcdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiBwYXJlbnRCdWlsZGVyICYmICFwYXJlbnRUdXJuVGVybWluYXRlZCkge1xuXHRcdFx0XHRcdFx0cGFyZW50VHVyblN0YXRlID0gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdFx0XHRcdFx0dG91Y2gocGFyZW50QnVpbGRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHRcdC8vIFdoZW4gdGhpcyBpcyB0aGUgZmlyc3QgZXZlbnQgaW4gYSB0dXJuIChubyBwYXJlbnQgYnVpbGRlclxuXHRcdFx0XHQvLyB5ZXQpLCBzZWVkIHRoZSBidWlsZGVyIHdpdGggdGhlIFNESyBlbnZlbG9wZSBpZCBzbyB0aGVcblx0XHRcdFx0Ly8gdHVybiBpZCBtYXRjaGVzIGB0dXJucy5ldmVudF9pZGAgZm9yIGZvcmsvdHJ1bmNhdGVcblx0XHRcdFx0Ly8gbG9va3Vwcy4gU2VlIHRoZSBtYXRjaGluZyBub3RlIGluIHRoZSBgdXNlci5tZXNzYWdlYFxuXHRcdFx0XHQvLyBicmFuY2ggYWJvdmUuXG5cdFx0XHRcdGNvbnN0IGZhbGxiYWNrVHVybklkID0gZS5pZCA/PyBtZXNzYWdlSWQ7XG5cdFx0XHRcdGNvbnN0IGJ1aWxkZXIgPSB0YXJnZXRCdWlsZGVyRm9yKHBhcmVudFRvb2xDYWxsSWQpXG5cdFx0XHRcdFx0Pz8gKHBhcmVudEJ1aWxkZXIgPSBuZXdUdXJuQnVpbGRlcihmYWxsYmFja1R1cm5JZCwgJycsIHsgc3RhcnRlZEF0OiBjdXJyZW50RXZlbnRUaW1lc3RhbXAgfSkpO1xuXHRcdFx0XHRpZiAocmVhc29uaW5nVGV4dCkge1xuXHRcdFx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nLFxuXHRcdFx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRcdFx0Y29udGVudDogcmVhc29uaW5nVGV4dCxcblx0XHRcdFx0XHR9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRpZiAoY29udGVudCkge1xuXHRcdFx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiBidWlsZGVyID09PSBwYXJlbnRCdWlsZGVyICYmICFwYXJlbnRUdXJuVGVybWluYXRlZCkge1xuXHRcdFx0XHRcdHBhcmVudFR1cm5TdGF0ZSA9IGhhc1Rvb2xSZXF1ZXN0cyA/IFR1cm5TdGF0ZS5DYW5jZWxsZWQgOiBUdXJuU3RhdGUuQ29tcGxldGU7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKGQudG9vbFJlcXVlc3RzPy5sZW5ndGgpIHtcblx0XHRcdFx0XHRhcHBlbmRGYWxsYmFja1Rvb2xSZXF1ZXN0cyhidWlsZGVyLCBkLnRvb2xSZXF1ZXN0cywgcGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdzeXN0ZW0ubm90aWZpY2F0aW9uJzoge1xuXHRcdFx0XHRjb25zdCBub3RpZmljYXRpb24gPSBidWlsZENvcGlsb3RTeXN0ZW1Ob3RpZmljYXRpb24oZSk7XG5cdFx0XHRcdGlmICghbm90aWZpY2F0aW9uKSB7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcmVudEJ1aWxkZXIgJiYgKHJvb3RBc3Npc3RhbnRUdXJuQWN0aXZlIHx8IG5vdGlmaWNhdGlvbi5zdGFydHNUdXJuKSkge1xuXHRcdFx0XHRcdHBhcmVudEJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uLFxuXHRcdFx0XHRcdFx0Y29udGVudDogbm90aWZpY2F0aW9uLm1lc3NhZ2VUZXh0LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc2Vzc2lvbi5lcnJvcic6IHtcblx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKGUuYWdlbnRJZCwgdW5kZWZpbmVkKTtcblx0XHRcdFx0aWYgKGUuYWdlbnRJZCkge1xuXHRcdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCB8fCB0ZXJtaW5hdGVkU3ViYWdlbnRUdXJucy5oYXMocGFyZW50VG9vbENhbGxJZCkpIHtcblx0XHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBidWlsZGVyID0gZW5zdXJlU3ViYWdlbnRCdWlsZGVyKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdHN1YmFnZW50VHVyblN0YXRlcy5zZXQocGFyZW50VG9vbENhbGxJZCwgVHVyblN0YXRlLkVycm9yKTtcblx0XHRcdFx0XHR0ZXJtaW5hdGVkU3ViYWdlbnRUdXJucy5hZGQocGFyZW50VG9vbENhbGxJZCk7XG5cdFx0XHRcdFx0YnVpbGRlci5lcnJvciA9IGJ1aWxkQ2hhdEVycm9ySW5mb0Zyb21Db3BpbG90U2RrRmllbGRzKGUuZGF0YSk7XG5cdFx0XHRcdFx0dG91Y2goYnVpbGRlcik7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0aWYgKHBhcmVudEJ1aWxkZXIgJiYgIXBhcmVudFR1cm5UZXJtaW5hdGVkKSB7XG5cdFx0XHRcdFx0cm9vdEFzc2lzdGFudFR1cm5BY3RpdmUgPSBmYWxzZTtcblx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuRXJyb3I7XG5cdFx0XHRcdFx0cGFyZW50VHVyblRlcm1pbmF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdHBhcmVudEJ1aWxkZXIuZXJyb3IgPSBidWlsZENoYXRFcnJvckluZm9Gcm9tQ29waWxvdFNka0ZpZWxkcyhlLmRhdGEpO1xuXHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnc3ViYWdlbnQuc3RhcnRlZCc6IHtcblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICd0b29sLmV4ZWN1dGlvbl9zdGFydCc6IHtcblx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKGUuYWdlbnRJZCwgZS5kYXRhLnBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgcGFyZW50QnVpbGRlciAmJiAhcGFyZW50VHVyblRlcm1pbmF0ZWQpIHtcblx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdFx0XHRcdHRvdWNoKHBhcmVudEJ1aWxkZXIpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAndG9vbC5leGVjdXRpb25fY29tcGxldGUnOiB7XG5cdFx0XHRcdGNvbnN0IGQgPSBlLmRhdGE7XG5cdFx0XHRcdGNvbnN0IGluZm8gPSB0b29sSW5mb0J5Q2FsbElkLmdldChkLnRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIWluZm8pIHtcblx0XHRcdFx0XHQvLyBPcnBoYW4gY29tcGxldGUgKG5vIG1hdGNoaW5nIHN0YXJ0KSwgb3IgaGlkZGVuIHRvb2wuXG5cdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdH1cblx0XHRcdFx0dG9vbEluZm9CeUNhbGxJZC5kZWxldGUoZC50b29sQ2FsbElkKTtcblx0XHRcdFx0Y29uc3QgcGFyZW50VG9vbENhbGxJZCA9IHJlc29sdmVQYXJlbnRUb29sQ2FsbElkKGUuYWdlbnRJZCwgZC5wYXJlbnRUb29sQ2FsbElkKTtcblx0XHRcdFx0aWYgKGlzVGFza0NvbXBsZXRlVG9vbChpbmZvLnRvb2xOYW1lKSkge1xuXHRcdFx0XHRcdGNvbnN0IGJ1aWxkZXIgPSB0YXJnZXRCdWlsZGVyRm9yKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRcdGlmICghYnVpbGRlcikge1xuXHRcdFx0XHRcdFx0Y29udGludWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IHN1bW1hcnkgPSBnZXRUYXNrQ29tcGxldGVNYXJrZG93bihpbmZvLnBhcmFtZXRlcnMsIGQuZXJyb3I/Lm1lc3NhZ2UgPz8gZC5yZXN1bHQ/LmNvbnRlbnQpO1xuXHRcdFx0XHRcdGlmIChzdW1tYXJ5KSB7XG5cdFx0XHRcdFx0XHRidWlsZGVyLnJlc3BvbnNlUGFydHMucHVzaCh7XG5cdFx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdFx0XHRcdFx0Y29udGVudDogc3VtbWFyeSxcblx0XHRcdFx0XHRcdH0pO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgZC5zdWNjZXNzICYmIGJ1aWxkZXIgPT09IHBhcmVudEJ1aWxkZXIgJiYgIXBhcmVudFR1cm5UZXJtaW5hdGVkKSB7XG5cdFx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ29tcGxldGU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGJ1aWxkZXIgPSB0YXJnZXRCdWlsZGVyRm9yKHBhcmVudFRvb2xDYWxsSWQpO1xuXHRcdFx0XHRpZiAoIWJ1aWxkZXIpIHtcblx0XHRcdFx0XHQvLyBObyBhY3RpdmUgdHVybiB0byBhdHRhY2ggdGhpcyBjb21wbGV0aW9uIHRvLlxuXHRcdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IGNvbXBsZXRlZFBhcnQgPSBtYWtlQ29tcGxldGVkVG9vbENhbGxQYXJ0KGQsIGluZm8sIHNlc3Npb25VcmlTdHIsIHByb3ZpZGVySWQsIHJhd1Nlc3Npb25JZCwgc3RvcmVkRWRpdHMsIHN1YmFnZW50SW5mb0J5VG9vbENhbGxJZC5nZXQoZC50b29sQ2FsbElkKSwgd29ya2luZ0RpcmVjdG9yeSk7XG5cdFx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKGNvbXBsZXRlZFBhcnQpO1xuXHRcdFx0XHQvLyBXaGVuIGEgcGFyZW50IHRvb2wgY2FsbCB0aGF0IHNwYXduZWQgYSBzdWJhZ2VudCBjb21wbGV0ZXMsXG5cdFx0XHRcdC8vIGZsdXNoIHRoZSBzdWJhZ2VudCdzIGFjY3VtdWxhdGVkIHR1cm4uXG5cdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiBzdWJhZ2VudEluZm9CeVRvb2xDYWxsSWQuaGFzKGQudG9vbENhbGxJZCkpIHtcblx0XHRcdFx0XHRmbHVzaFN1YmFnZW50KGQudG9vbENhbGxJZCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHR9XG5cdFx0XHRjYXNlICdza2lsbC5pbnZva2VkJzoge1xuXHRcdFx0XHRjb25zdCBzeW50aCA9IHN5bnRoZXNpemVTa2lsbFRvb2xDYWxsKGUuZGF0YSwgZS5pZCk7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGNvbnN0IGJ1aWxkZXIgPSB0YXJnZXRCdWlsZGVyRm9yKHBhcmVudFRvb2xDYWxsSWQpXG5cdFx0XHRcdFx0Pz8gKHBhcmVudEJ1aWxkZXIgPSBuZXdUdXJuQnVpbGRlcihnZW5lcmF0ZVV1aWQoKSwgJycsIHsgc3RhcnRlZEF0OiBjdXJyZW50RXZlbnRUaW1lc3RhbXAgfSkpO1xuXHRcdFx0XHRpZiAoIXBhcmVudFRvb2xDYWxsSWQgJiYgYnVpbGRlciA9PT0gcGFyZW50QnVpbGRlcikge1xuXHRcdFx0XHRcdHBhcmVudFR1cm5TdGF0ZSA9IFR1cm5TdGF0ZS5DYW5jZWxsZWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnVpbGRlci5yZXNwb25zZVBhcnRzLnB1c2goe1xuXHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsXG5cdFx0XHRcdFx0dG9vbENhbGw6IHtcblx0XHRcdFx0XHRcdHN0YXR1czogVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkLFxuXHRcdFx0XHRcdFx0dG9vbENhbGxJZDogc3ludGgudG9vbENhbGxJZCxcblx0XHRcdFx0XHRcdHRvb2xOYW1lOiBzeW50aC50b29sTmFtZSxcblx0XHRcdFx0XHRcdGRpc3BsYXlOYW1lOiBzeW50aC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBzeW50aC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRcdFx0XHRcdHN1Y2Nlc3M6IHRydWUsXG5cdFx0XHRcdFx0XHRwYXN0VGVuc2VNZXNzYWdlOiBzeW50aC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdFx0XHRcdFx0Y29uZmlybWVkOiBUb29sQ2FsbENvbmZpcm1hdGlvblJlYXNvbi5Ob3ROZWVkZWQsXG5cdFx0XHRcdFx0fSBzYXRpc2ZpZXMgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0XHRcdFx0fSk7XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSAnYWJvcnQnOiB7XG5cdFx0XHRcdGNvbnN0IHBhcmVudFRvb2xDYWxsSWQgPSByZXNvbHZlUGFyZW50VG9vbENhbGxJZChlLmFnZW50SWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdGlmIChwYXJlbnRUb29sQ2FsbElkKSB7XG5cdFx0XHRcdFx0aWYgKCF0ZXJtaW5hdGVkU3ViYWdlbnRUdXJucy5oYXMocGFyZW50VG9vbENhbGxJZCkpIHtcblx0XHRcdFx0XHRcdHN1YmFnZW50VHVyblN0YXRlcy5zZXQocGFyZW50VG9vbENhbGxJZCwgVHVyblN0YXRlLkNhbmNlbGxlZCk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdHJvb3RBc3Npc3RhbnRUdXJuQWN0aXZlID0gZmFsc2U7XG5cdFx0XHRcdFx0aWYgKHBhcmVudEJ1aWxkZXIgJiYgIXBhcmVudFR1cm5UZXJtaW5hdGVkKSB7XG5cdFx0XHRcdFx0XHRwYXJlbnRUdXJuU3RhdGUgPSBUdXJuU3RhdGUuQ2FuY2VsbGVkO1xuXHRcdFx0XHRcdFx0cGFyZW50VHVyblRlcm1pbmF0ZWQgPSB0cnVlO1xuXHRcdFx0XHRcdFx0dG91Y2gocGFyZW50QnVpbGRlcik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0ZGVmYXVsdDpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0Zmx1c2hQYXJlbnQoKTtcblx0Zm9yIChjb25zdCBwYXJlbnRUb29sQ2FsbElkIG9mIFsuLi5zdWJhZ2VudEJ1aWxkZXJzLmtleXMoKV0pIHtcblx0XHRmbHVzaFN1YmFnZW50KHBhcmVudFRvb2xDYWxsSWQpO1xuXHR9XG5cblx0cmV0dXJuIHsgdHVybnMsIHN1YmFnZW50VHVybnNCeVRvb2xDYWxsSWQ6IHN1YmFnZW50VHVybnMgfTtcblxuXHRmdW5jdGlvbiBhcHBlbmRGYWxsYmFja1Rvb2xSZXF1ZXN0cyhidWlsZGVyOiBJVHVybkJ1aWxkZXIsIHRvb2xSZXF1ZXN0czogcmVhZG9ubHkgQXNzaXN0YW50TWVzc2FnZVRvb2xSZXF1ZXN0W10sIHBhcmVudFRvb2xDYWxsSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGZvciAoY29uc3QgcmVxdWVzdCBvZiB0b29sUmVxdWVzdHMpIHtcblx0XHRcdGNvbnN0IGNvbXBsZXRpb24gPSBjb21wbGV0aW9uc0J5Q2FsbElkLmdldChyZXF1ZXN0LnRvb2xDYWxsSWQpO1xuXHRcdFx0aWYgKGNvbXBsZXRpb24gJiYgdG9vbEluZm9CeUNhbGxJZC5oYXMocmVxdWVzdC50b29sQ2FsbElkKSkge1xuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGluZm8gPSB0b29sSW5mb0J5Q2FsbElkLmdldChyZXF1ZXN0LnRvb2xDYWxsSWQpXG5cdFx0XHRcdD8/IG1ha2VUb29sU3RhcnRJbmZvKHJlcXVlc3QubmFtZSwgcmVxdWVzdC5hcmd1bWVudHMsIHBhcmVudFRvb2xDYWxsSWQsIHdvcmtpbmdEaXJlY3RvcnksIHJlcXVlc3QpO1xuXHRcdFx0aWYgKCFpbmZvKSB7XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGlzVGFza0NvbXBsZXRlVG9vbChpbmZvLnRvb2xOYW1lKSkge1xuXHRcdFx0XHRjb25zdCBzdW1tYXJ5ID0gZ2V0VGFza0NvbXBsZXRlTWFya2Rvd24oaW5mby5wYXJhbWV0ZXJzLCBjb21wbGV0aW9uPy5lcnJvcj8ubWVzc2FnZSA/PyBjb21wbGV0aW9uPy5yZXN1bHQ/LmNvbnRlbnQpO1xuXHRcdFx0XHRpZiAoc3VtbWFyeSkge1xuXHRcdFx0XHRcdGJ1aWxkZXIucmVzcG9uc2VQYXJ0cy5wdXNoKHtcblx0XHRcdFx0XHRcdGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd24sXG5cdFx0XHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdFx0XHRjb250ZW50OiBzdW1tYXJ5LFxuXHRcdFx0XHRcdH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGlmICghcGFyZW50VG9vbENhbGxJZCAmJiBjb21wbGV0aW9uPy5zdWNjZXNzICYmIGJ1aWxkZXIgPT09IHBhcmVudEJ1aWxkZXIgJiYgIXBhcmVudFR1cm5UZXJtaW5hdGVkKSB7XG5cdFx0XHRcdFx0cGFyZW50VHVyblN0YXRlID0gVHVyblN0YXRlLkNvbXBsZXRlO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnRpbnVlO1xuXHRcdFx0fVxuXHRcdFx0YnVpbGRlci5yZXNwb25zZVBhcnRzLnB1c2gobWFrZUNvbXBsZXRlZFRvb2xDYWxsUGFydChcblx0XHRcdFx0Y29tcGxldGlvbiA/PyB7IHRvb2xDYWxsSWQ6IHJlcXVlc3QudG9vbENhbGxJZCwgc3VjY2VzczogdHJ1ZSB9LFxuXHRcdFx0XHRpbmZvLFxuXHRcdFx0XHRzZXNzaW9uVXJpU3RyLFxuXHRcdFx0XHRwcm92aWRlcklkLFxuXHRcdFx0XHRyYXdTZXNzaW9uSWQsXG5cdFx0XHRcdHN0b3JlZEVkaXRzLFxuXHRcdFx0XHRzdWJhZ2VudEluZm9CeVRvb2xDYWxsSWQuZ2V0KHJlcXVlc3QudG9vbENhbGxJZCksXG5cdFx0XHRcdHdvcmtpbmdEaXJlY3RvcnksXG5cdFx0XHQpKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBUcmFuc2xhdGVzIHRoZSBTREsncyBgVXNlck1lc3NhZ2VBdHRhY2htZW50W11gIHBheWxvYWQgYmFjayBpbnRvIHRoZVxuICogYWdlbnQtcHJvdG9jb2wge0BsaW5rIE1lc3NhZ2VBdHRhY2htZW50fSBzaGFwZS4gVGV4dCBibG9iIGF0dGFjaG1lbnRzXG4gKiBzdXJmYWNlIGFzIHtAbGluayBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlfTsgb3RoZXIgYmxvYnMgc3VyZmFjZSBhc1xuICogaW5saW5lIHtAbGluayBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZX0gcGF5bG9hZHMuXG4gKiBGaWxlL2RpcmVjdG9yeS9zZWxlY3Rpb24gdmFyaWFudHMgcmVjb25zdHJ1Y3QgbG9jYWwgYFJlc291cmNlYFxuICogYXR0YWNobWVudHMuIFdlIGRvbid0IHRyeSB0byByZS1saW5rIHRoZXNlIHRvIHRoZSBvbi1kaXNrIHNuYXBzaG90c1xuICogcHJvZHVjZWQgYnkgdGhlIGFnZW50IGhvc3QncyBhdHRhY2htZW50IHJld3JpdGVyIFx1MjAxNCB0aGUgU0RLIGtlZXBzIGFcbiAqIGNvcHkgb2YgdGhlIGJ5dGVzIC8gcGF0aHMgaXQgYWN0dWFsbHkgc2F3IG9uIHNlbmQsIHdoaWNoIGlzIHRoZVxuICogYXV0aG9yaXRhdGl2ZSByZWNvcmQgZm9yIHJlcGxheS5cbiAqL1xuZnVuY3Rpb24gc2RrQXR0YWNobWVudHNUb1Byb3RvY29sKFxuXHRhdHRhY2htZW50czogcmVhZG9ubHkgQXR0YWNobWVudFtdIHwgdW5kZWZpbmVkLFxuKTogTWVzc2FnZUF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZCB7XG5cdGlmICghYXR0YWNobWVudHM/Lmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0OiBNZXNzYWdlQXR0YWNobWVudFtdID0gW107XG5cdGZvciAoY29uc3QgYSBvZiBhdHRhY2htZW50cykge1xuXHRcdGNvbnN0IGNvbnZlcnRlZCA9IHNka0F0dGFjaG1lbnRUb1Byb3RvY29sKGEpO1xuXHRcdGlmIChjb252ZXJ0ZWQpIHtcblx0XHRcdG91dC5wdXNoKGNvbnZlcnRlZCk7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBvdXQubGVuZ3RoID4gMCA/IG91dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gc2RrQXR0YWNobWVudFRvUHJvdG9jb2woXG5cdGF0dGFjaG1lbnQ6IEF0dGFjaG1lbnQsXG4pOiBNZXNzYWdlQXR0YWNobWVudCB8IHVuZGVmaW5lZCB7XG5cdHN3aXRjaCAoYXR0YWNobWVudC50eXBlKSB7XG5cdFx0Y2FzZSAnZmlsZSc6IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZShhdHRhY2htZW50LnBhdGgpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBhdHRhY2htZW50LmRpc3BsYXlOYW1lIHx8IGJhc2VuYW1lKGF0dGFjaG1lbnQucGF0aCksXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiBnZXRNZWRpYU1pbWUoYXR0YWNobWVudC5wYXRoKT8uc3RhcnRzV2l0aCgnaW1hZ2UvJykgPyAnaW1hZ2UnIDogJ2RvY3VtZW50Jyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ2RpcmVjdG9yeSc6IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZShhdHRhY2htZW50LnBhdGgpLnRvU3RyaW5nKCksXG5cdFx0XHRcdGxhYmVsOiBhdHRhY2htZW50LmRpc3BsYXlOYW1lIHx8IGJhc2VuYW1lKGF0dGFjaG1lbnQucGF0aCksXG5cdFx0XHRcdGRpc3BsYXlLaW5kOiAnZGlyZWN0b3J5Jyxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGNhc2UgJ3NlbGVjdGlvbic6IHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6IE1lc3NhZ2VBdHRhY2htZW50S2luZC5SZXNvdXJjZSxcblx0XHRcdFx0dXJpOiBVUkkuZmlsZShhdHRhY2htZW50LmZpbGVQYXRoKS50b1N0cmluZygpLFxuXHRcdFx0XHRsYWJlbDogYXR0YWNobWVudC5kaXNwbGF5TmFtZSxcblx0XHRcdFx0ZGlzcGxheUtpbmQ6ICdzZWxlY3Rpb24nLFxuXHRcdFx0XHRzZWxlY3Rpb246IHsgcmFuZ2U6IGF0dGFjaG1lbnQuc2VsZWN0aW9uISB9LFxuXHRcdFx0fTtcblx0XHR9XG5cdFx0Y2FzZSAnYmxvYic6IHtcblx0XHRcdGlmICh0eXBlb2YgYXR0YWNobWVudC5kYXRhICE9PSAnc3RyaW5nJykge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3Qgc2ltcGxlRGlzcGxheUtpbmQgPSByZWFkU2ltcGxlQXR0YWNobWVudERpc3BsYXlLaW5kRnJvbU1pbWVUeXBlKGF0dGFjaG1lbnQubWltZVR5cGUpO1xuXHRcdFx0aWYgKGF0dGFjaG1lbnQubWltZVR5cGUuc3RhcnRzV2l0aCgndGV4dC9wbGFpbicpIHx8IHNpbXBsZURpc3BsYXlLaW5kICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlLFxuXHRcdFx0XHRcdGxhYmVsOiBhdHRhY2htZW50LmRpc3BsYXlOYW1lID8/ICdhdHRhY2htZW50Jyxcblx0XHRcdFx0XHRtb2RlbFJlcHJlc2VudGF0aW9uOiBkZWNvZGVCYXNlNjQoYXR0YWNobWVudC5kYXRhID8/ICcnKS50b1N0cmluZygpLFxuXHRcdFx0XHRcdC4uLihzaW1wbGVEaXNwbGF5S2luZCAhPT0gdW5kZWZpbmVkID8geyBkaXNwbGF5S2luZDogc2ltcGxlRGlzcGxheUtpbmQgfSA6IHt9KSxcblx0XHRcdFx0fTtcblx0XHRcdH1cblx0XHRcdGNvbnN0IGRpc3BsYXlLaW5kID0gYXR0YWNobWVudC5taW1lVHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSA/ICdpbWFnZScgOiB1bmRlZmluZWQ7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHR0eXBlOiBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSxcblx0XHRcdFx0bGFiZWw6IGF0dGFjaG1lbnQuZGlzcGxheU5hbWUgPz8gJ2F0dGFjaG1lbnQnLFxuXHRcdFx0XHRkYXRhOiBhdHRhY2htZW50LmRhdGEgPz8gJycsXG5cdFx0XHRcdGNvbnRlbnRUeXBlOiBhdHRhY2htZW50Lm1pbWVUeXBlLFxuXHRcdFx0XHRkaXNwbGF5S2luZCxcblx0XHRcdH07XG5cdFx0fVxuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogQnVpbGRzIGEge0BsaW5rIFRvb2xDYWxsQ29tcGxldGVkU3RhdGV9LXNoYXBlZCByZXNwb25zZSBwYXJ0IGZyb20gYW5cbiAqIFNESyBgdG9vbC5leGVjdXRpb25fY29tcGxldGVgIGV2ZW50LiBSZXN0b3JlcyBmaWxlLWVkaXQgY29udGVudFxuICogcmVmZXJlbmNlcyBmcm9tIGBzdG9yZWRFZGl0c2AgYW5kIG1lcmdlcyBzdWJhZ2VudCBtZXRhZGF0YSB3aGVuIHRoZVxuICogdG9vbCBjYWxsIHNwYXduZWQgYSBjaGlsZCBzZXNzaW9uLlxuICovXG5mdW5jdGlvbiBtYWtlQ29tcGxldGVkVG9vbENhbGxQYXJ0KFxuXHRkOiBUb29sRXhlY3V0aW9uQ29tcGxldGVEYXRhLFxuXHRpbmZvOiBJVG9vbFN0YXJ0SW5mbyxcblx0c2Vzc2lvblVyaVN0cjogc3RyaW5nLFxuXHRwcm92aWRlcklkOiBzdHJpbmcsXG5cdHJhd1Nlc3Npb25JZDogc3RyaW5nLFxuXHRzdG9yZWRFZGl0czogTWFwPHN0cmluZywgSUZpbGVFZGl0UmVjb3JkW10+IHwgdW5kZWZpbmVkLFxuXHRzdWJhZ2VudDogSVN1YmFnZW50SW5mbyB8IHVuZGVmaW5lZCxcblx0d29ya2luZ0RpcmVjdG9yeTogVVJJIHwgdW5kZWZpbmVkLFxuKTogUmVzcG9uc2VQYXJ0IHtcblx0Y29uc3QgdG9vbE91dHB1dCA9IGQuZXJyb3I/Lm1lc3NhZ2UgPz8gZC5yZXN1bHQ/LmNvbnRlbnQ7XG5cdGNvbnN0IGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gPSBbXTtcblx0aWYgKHRvb2xPdXRwdXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnRlbnQucHVzaCh7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0LCB0ZXh0OiB0b29sT3V0cHV0IH0pO1xuXHR9XG5cdGFwcGVuZFNka1Rvb2xSZXN1bHRDb250ZW50KFxuXHRcdGNvbnRlbnQsXG5cdFx0ZC5yZXN1bHQ/LmNvbnRlbnRzLFxuXHRcdGluZm8udG9vbEtpbmQgPT09ICd0ZXJtaW5hbCcgPyB7IHNlc3Npb246IHNlc3Npb25VcmlTdHIsIHRvb2xDYWxsSWQ6IGQudG9vbENhbGxJZCwgdGl0bGU6IGluZm8uZGlzcGxheU5hbWUgfSA6IHVuZGVmaW5lZCxcblx0KTtcblxuXHQvLyBSZXN0b3JlIGZpbGUgZWRpdCBjb250ZW50IHJlZmVyZW5jZXMgZnJvbSB0aGUgZGF0YWJhc2UuXG5cdGNvbnN0IGVkaXRzID0gc3RvcmVkRWRpdHM/LmdldChkLnRvb2xDYWxsSWQpO1xuXHRpZiAoZWRpdHMpIHtcblx0XHRmb3IgKGNvbnN0IGVkaXQgb2YgZWRpdHMpIHtcblx0XHRcdGNvbnN0IGJlZm9yZVVyaSA9IGVkaXQua2luZCA9PT0gJ3JlbmFtZScgJiYgZWRpdC5vcmlnaW5hbFBhdGhcblx0XHRcdFx0PyBVUkkuZmlsZShlZGl0Lm9yaWdpbmFsUGF0aCkudG9TdHJpbmcoKVxuXHRcdFx0XHQ6IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBhZnRlclVyaSA9IFVSSS5maWxlKGVkaXQuZmlsZVBhdGgpLnRvU3RyaW5nKCk7XG5cdFx0XHRjb25zdCBoYXNCZWZvcmUgPSBlZGl0LmtpbmQgIT09ICdjcmVhdGUnO1xuXHRcdFx0Y29uc3QgaGFzQWZ0ZXIgPSBlZGl0LmtpbmQgIT09ICdkZWxldGUnO1xuXHRcdFx0Y29udGVudC5wdXNoKHtcblx0XHRcdFx0dHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLkZpbGVFZGl0LFxuXHRcdFx0XHRiZWZvcmU6IGhhc0JlZm9yZSA/IHtcblx0XHRcdFx0XHR1cmk6IGJlZm9yZVVyaSxcblx0XHRcdFx0XHRjb250ZW50OiB7IHVyaTogYnVpbGRTZXNzaW9uRGJVcmkoc2Vzc2lvblVyaVN0ciwgZWRpdC50b29sQ2FsbElkLCBlZGl0LmZpbGVQYXRoLCAnYmVmb3JlJykgfSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0YWZ0ZXI6IGhhc0FmdGVyID8ge1xuXHRcdFx0XHRcdHVyaTogYWZ0ZXJVcmksXG5cdFx0XHRcdFx0Y29udGVudDogeyB1cmk6IGJ1aWxkU2Vzc2lvbkRiVXJpKHNlc3Npb25VcmlTdHIsIGVkaXQudG9vbENhbGxJZCwgZWRpdC5maWxlUGF0aCwgJ2FmdGVyJykgfSxcblx0XHRcdFx0fSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0ZGlmZjogKGVkaXQuYWRkZWRMaW5lcyAhPT0gdW5kZWZpbmVkIHx8IGVkaXQucmVtb3ZlZExpbmVzICE9PSB1bmRlZmluZWQpXG5cdFx0XHRcdFx0PyB7IGFkZGVkOiBlZGl0LmFkZGVkTGluZXMsIHJlbW92ZWQ6IGVkaXQucmVtb3ZlZExpbmVzIH1cblx0XHRcdFx0XHQ6IHVuZGVmaW5lZCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdGlmIChzdWJhZ2VudCkge1xuXHRcdGNvbnRlbnQucHVzaCh7XG5cdFx0XHR0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQsXG5cdFx0XHRyZXNvdXJjZTogYnVpbGRTdWJhZ2VudFNlc3Npb25Vcmkoc2Vzc2lvblVyaVN0ciwgZC50b29sQ2FsbElkKSxcblx0XHRcdHRpdGxlOiBzdWJhZ2VudC5hZ2VudERpc3BsYXlOYW1lLFxuXHRcdFx0YWdlbnROYW1lOiBzdWJhZ2VudC5hZ2VudE5hbWUsXG5cdFx0XHRkZXNjcmlwdGlvbjogc3ViYWdlbnQuYWdlbnREZXNjcmlwdGlvbixcblx0XHR9KTtcblx0fVxuXG5cdGNvbnN0IG1jcFNlcnZlck5hbWUgPSBpbmZvLm1jcFNlcnZlck5hbWUgPz8gcmVhZFN0cmluZ1Byb3BlcnR5KGQsICdtY3BTZXJ2ZXJOYW1lJyk7XG5cdGNvbnN0IG1jcFRvb2xOYW1lID0gaW5mby5tY3BUb29sTmFtZSA/PyByZWFkU3RyaW5nUHJvcGVydHkoZCwgJ21jcFRvb2xOYW1lJyk7XG5cdGNvbnN0IG1jcFVpUmVzb3VyY2VVcmkgPSBpbmZvLm1jcFVpUmVzb3VyY2VVcmkgPz8gcmVhZE1jcFVpUmVzb3VyY2VVcmkoZCk7XG5cdGNvbnN0IG1jcFVpOiBJVG9vbENhbGxVaU1ldGEgfCB1bmRlZmluZWQgPSBtY3BVaVJlc291cmNlVXJpXG5cdFx0PyB7XG5cdFx0XHRyZXNvdXJjZVVyaTogbWNwVWlSZXNvdXJjZVVyaSxcblx0XHRcdC4uLihtY3BTZXJ2ZXJOYW1lID8geyBjaGFubmVsOiBidWlsZE1jcENoYW5uZWwocHJvdmlkZXJJZCwgcmF3U2Vzc2lvbklkLCBtY3BTZXJ2ZXJOYW1lKSB9IDoge30pLFxuXHRcdH1cblx0XHQ6IHVuZGVmaW5lZDtcblxuXHRjb25zdCB0YzogVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSA9IHtcblx0XHRzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCxcblx0XHR0b29sQ2FsbElkOiBkLnRvb2xDYWxsSWQsXG5cdFx0dG9vbE5hbWU6IGluZm8udG9vbE5hbWUsXG5cdFx0ZGlzcGxheU5hbWU6IGluZm8uZGlzcGxheU5hbWUsXG5cdFx0aW50ZW50aW9uOiBpbmZvLmludGVudGlvbixcblx0XHQuLi4obWNwU2VydmVyTmFtZSA/IHsgY29udHJpYnV0b3I6IHsga2luZDogVG9vbENhbGxDb250cmlidXRvcktpbmQuTUNQLCBjdXN0b21pemF0aW9uSWQ6IGJ1aWxkTWNwVG9wTGV2ZWxDdXN0b21pemF0aW9uSWQocHJvdmlkZXJJZCwgcmF3U2Vzc2lvbklkLCBtY3BTZXJ2ZXJOYW1lKSB9IH0gOiB7fSksXG5cdFx0aW52b2NhdGlvbk1lc3NhZ2U6IGluZm8uaW52b2NhdGlvbk1lc3NhZ2UsXG5cdFx0dG9vbElucHV0OiBpbmZvLnRvb2xJbnB1dCxcblx0XHRzdWNjZXNzOiBkLnN1Y2Nlc3MsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogZ2V0UGFzdFRlbnNlTWVzc2FnZShpbmZvLnRvb2xOYW1lLCBpbmZvLmRpc3BsYXlOYW1lLCBpbmZvLnBhcmFtZXRlcnMsIGQuc3VjY2VzcywgZC5zdWNjZXNzID8gdG9vbE91dHB1dCA6IHVuZGVmaW5lZCwgcGF0aCA9PiByZXNvbHZlVG9vbERpc3BsYXlQYXRoKHBhdGgsIHdvcmtpbmdEaXJlY3RvcnkpKSxcblx0XHRjb250ZW50OiBjb250ZW50Lmxlbmd0aCA+IDAgPyBjb250ZW50IDogdW5kZWZpbmVkLFxuXHRcdGVycm9yOiBkLmVycm9yLFxuXHRcdGNvbmZpcm1lZDogVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24uTm90TmVlZGVkLFxuXHRcdF9tZXRhOiB0b1Rvb2xDYWxsTWV0YSh7XG5cdFx0XHR0b29sS2luZDogaW5mby50b29sS2luZCxcblx0XHRcdGxhbmd1YWdlOiBpbmZvLmxhbmd1YWdlLFxuXHRcdFx0c3ViYWdlbnREZXNjcmlwdGlvbjogaW5mby5zdWJhZ2VudERlc2NyaXB0aW9uLFxuXHRcdFx0c3ViYWdlbnRBZ2VudE5hbWU6IGluZm8uc3ViYWdlbnRBZ2VudE5hbWUsXG5cdFx0XHRtY3BTZXJ2ZXJOYW1lLFxuXHRcdFx0bWNwVG9vbE5hbWUsXG5cdFx0XHR1aTogbWNwVWksXG5cdFx0fSksXG5cdH07XG5cdHJldHVybiB7IGtpbmQ6IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGwsIHRvb2xDYWxsOiB0YyB9O1xufVxuIl0sCiAgIm1hcHBpbmdzIjogIkFBTUEsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxlQUFlO0FBQ3hCLFNBQVMsVUFBVSxZQUFZLFlBQVk7QUFDM0MsU0FBUyxnQkFBZ0I7QUFDekIsU0FBUyxXQUFXO0FBQ3BCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsOEJBQThCO0FBQ3ZDLFNBQVMsc0JBQTJEO0FBRXBFLFNBQVMsNkJBQXFEO0FBQzlELFNBQVMsYUFBYSxrQkFBa0IsNEJBQTRCLHlCQUF5QixnQkFBZ0IsdUJBQXVCLFdBQVcsK0JBQTZSO0FBQzVhLFNBQVMsbUNBQW1DO0FBQzVDLFNBQVMsc0JBQXNCLHFCQUFxQixtQkFBbUIsa0JBQWtCLHFCQUFxQix5QkFBeUIsb0JBQW9CLG9CQUFvQixhQUFhLFlBQVksY0FBYyxvQkFBb0IsK0JBQStCO0FBQ3pRLFNBQVMseUJBQXlCO0FBQ2xDLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsc0NBQXNDO0FBQy9DLFNBQVMsOENBQThDO0FBQ3ZELFNBQVMsaUJBQWlCLHVDQUF1QztBQUNqRSxTQUFTLG1EQUFtRDtBQUU1RCxTQUFTLGFBQWEsT0FBb0M7QUFDekQsTUFBSTtBQUNILFdBQU8sS0FBSyxVQUFVLEtBQUs7QUFBQSxFQUM1QixRQUFRO0FBQ1AsV0FBTztBQUFBLEVBQ1I7QUFDRDtBQUVBLFNBQVMsdUJBQXVCLE1BQWMsa0JBQTJDO0FBQ3hGLFNBQU8sV0FBVyxJQUFJLEtBQUssQ0FBQyxvQkFBb0IsaUJBQWlCLFdBQVcsUUFBUSxPQUNqRixPQUNBLEtBQUssaUJBQWlCLFFBQVEsSUFBSTtBQUN0QztBQVVBLFNBQVMsdUJBQXVCLE9BQThCO0FBQzdELE1BQUksTUFBTSxTQUFTLGdCQUFnQjtBQUNsQyxXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sU0FBUyxNQUFNLEtBQUs7QUFDMUIsU0FBTyxDQUFDLENBQUMsVUFBVSxPQUFPLFlBQVksTUFBTTtBQUM3QztBQVdBLFNBQVMsdUJBQXVCLE1BQXNCO0FBQ3JELFFBQU0sYUFBYSxLQUNqQixRQUFRLHNDQUFzQyxFQUFFLEVBQ2hELFFBQVEsNENBQTRDLEVBQUUsRUFDdEQsUUFBUSxvQ0FBb0MsRUFBRSxFQUM5QyxRQUFRLHNEQUFzRCxFQUFFLEVBQ2hFLFFBQVEsNkJBQTZCLEVBQUU7QUFDekMsUUFBTSxpQkFBaUIsV0FDckIsUUFBUSw0Q0FBNEMsRUFBRSxFQUN0RCxRQUFRLDBDQUEwQyxFQUFFLEVBQ3BELEtBQUs7QUFDUCxNQUFJLGdCQUFnQjtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUNBLFFBQU0sUUFBUSxXQUFXLE1BQU0sd0NBQXdDLEtBQUssV0FBVyxNQUFNLHNDQUFzQztBQUNuSSxTQUFPLFFBQVEsTUFBTSxDQUFDLEVBQUUsS0FBSyxJQUFJLFdBQVcsS0FBSztBQUNsRDtBQW9CTyxTQUFTLDJCQUEyQixTQUE4QixhQUFxRSxVQUFvRztBQUNqUCxNQUFJO0FBQ0osYUFBVyxjQUFjLGVBQWUsQ0FBQyxHQUFHO0FBQzNDLFlBQVEsV0FBVyxNQUFNO0FBQUEsTUFDeEIsS0FBSztBQUNKLGdCQUFRLEtBQUs7QUFBQSxVQUNaLE1BQU0sc0JBQXNCO0FBQUEsVUFDNUIsTUFBTSxXQUFXO0FBQUEsVUFDakIsYUFBYSxXQUFXO0FBQUEsUUFDekIsQ0FBQztBQUNEO0FBQUEsTUFDRCxLQUFLLGNBQWM7QUFDbEIsY0FBTSxTQUFnQztBQUFBLFVBQ3JDLFVBQVUsV0FBVztBQUFBLFVBQ3JCLEdBQUksT0FBTyxXQUFXLGtCQUFrQixXQUFXLEVBQUUsU0FBUyxXQUFXLGNBQWMsSUFBSSxDQUFDO0FBQUEsVUFDNUYsR0FBSSxXQUFXLG9CQUFvQixTQUFZLEVBQUUsV0FBVyxXQUFXLGdCQUFnQixJQUFJLENBQUM7QUFBQSxRQUM3RjtBQUNBLG9CQUFZLEVBQUUsU0FBUyxXQUFXLFNBQVMsT0FBTztBQUNsRCxjQUFNLGdCQUFnQixRQUFRLFVBQVUsT0FBSyxFQUFFLFNBQVMsc0JBQXNCLFFBQVE7QUFDdEYsWUFBSSxrQkFBa0IsSUFBSTtBQUN6QixnQkFBTSxnQkFBZ0IsUUFBUSxhQUFhO0FBQzNDLGtCQUFRLGFBQWEsSUFBSSxFQUFFLEdBQUcsZUFBZSxPQUFPO0FBQUEsUUFDckQsV0FBVyxVQUFVO0FBQ3BCLGtCQUFRLEtBQUs7QUFBQSxZQUNaLE1BQU0sc0JBQXNCO0FBQUEsWUFDNUIsVUFBVSw0QkFBNEIsU0FBUyxTQUFTLFNBQVMsVUFBVTtBQUFBLFlBQzNFLE9BQU8sU0FBUztBQUFBLFlBQ2hCLE9BQU87QUFBQSxZQUNQO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUNBO0FBQUEsTUFDRDtBQUFBLElBQ0Q7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSO0FBeURBLFNBQVMsZUFBZSxJQUFZLE1BQWMsU0FBeUo7QUFDMU0sUUFBTSxVQUFtQjtBQUFBLElBQ3hCO0FBQUEsSUFDQSxRQUFRLEVBQUUsTUFBTSxTQUFTLFVBQVUsWUFBWSxLQUFLO0FBQUEsSUFDcEQsR0FBSSxTQUFTLGFBQWEsU0FBUyxFQUFFLGFBQWEsUUFBUSxZQUFZLElBQUksQ0FBQztBQUFBLElBQzNFLEdBQUksU0FBUyxRQUFRLEVBQUUsT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDO0FBQUEsSUFDakQsR0FBSSxTQUFTLFFBQVEsRUFBRSxPQUFPLFFBQVEsTUFBTSxJQUFJLENBQUM7QUFBQSxFQUNsRDtBQUNBLFNBQU8sRUFBRSxJQUFJLFNBQVMsV0FBVyxTQUFTLFdBQVcsYUFBYSxTQUFTLFdBQVcsZUFBZSxDQUFDLEdBQUcsT0FBTyxRQUFXLE9BQU8sUUFBVyxjQUFjLG9CQUFJLElBQUksRUFBRTtBQUN0SztBQUdBLFNBQVMsbUJBQW1CLE9BQXlDO0FBQ3BFLFFBQU0sWUFBcUIsTUFBTTtBQUNqQyxTQUFPLFNBQVMsU0FBUyxLQUFLLE9BQU8sU0FBUyxLQUFLLE1BQU0sU0FBUyxDQUFDLElBQUksWUFBWTtBQUNwRjtBQUVBLFNBQVMsbUJBQW1CLFFBQWlCLEtBQWlDO0FBQzdFLE1BQUksQ0FBQyxVQUFVLE9BQU8sV0FBVyxZQUFZLE1BQU0sUUFBUSxNQUFNLEdBQUc7QUFDbkUsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLFFBQVMsT0FBbUMsR0FBRztBQUNyRCxTQUFPLE9BQU8sVUFBVSxZQUFZLE1BQU0sU0FBUyxJQUFJLFFBQVE7QUFDaEU7QUFFQSxTQUFTLHFCQUFxQixRQUFxQztBQUNsRSxNQUFJLENBQUMsVUFBVSxPQUFPLFdBQVcsWUFBWSxNQUFNLFFBQVEsTUFBTSxHQUFHO0FBQ25FLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxrQkFBbUIsT0FBbUMsaUJBQWlCO0FBQzdFLE1BQUksQ0FBQyxtQkFBbUIsT0FBTyxvQkFBb0IsWUFBWSxNQUFNLFFBQVEsZUFBZSxHQUFHO0FBQzlGLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxPQUFRLGdCQUE0QyxPQUFPO0FBQ2pFLE1BQUksQ0FBQyxRQUFRLE9BQU8sU0FBUyxZQUFZLE1BQU0sUUFBUSxJQUFJLEdBQUc7QUFDN0QsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLEtBQU0sS0FBaUMsSUFBSTtBQUNqRCxNQUFJLENBQUMsTUFBTSxPQUFPLE9BQU8sWUFBWSxNQUFNLFFBQVEsRUFBRSxHQUFHO0FBQ3ZELFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxtQkFBbUIsSUFBSSxhQUFhO0FBQzVDO0FBRUEsU0FBUyxrQkFBa0IsVUFBa0IsY0FBdUIsa0JBQXNDLGtCQUFtQyxRQUE2QztBQUN6TCxNQUFJLGFBQWEsUUFBUSxHQUFHO0FBQzNCLFdBQU87QUFBQSxFQUNSO0FBQ0EsUUFBTSxVQUFVLGlCQUFpQixTQUFZLGFBQWEsWUFBWSxJQUFJO0FBQzFFLE1BQUk7QUFDSixNQUFJLFNBQVM7QUFDWixRQUFJO0FBQUUsbUJBQWEsS0FBSyxNQUFNLE9BQU87QUFBQSxJQUE4QixRQUFRO0FBQUEsSUFBZTtBQUFBLEVBQzNGO0FBSUEsUUFBTSxVQUFVLHVCQUF1QixVQUFVLFlBQVksZ0JBQWdCLElBQUksYUFBYSxVQUFVLElBQUk7QUFDNUcsUUFBTSxXQUFXLFdBQVc7QUFDNUIsUUFBTSxXQUFXLFlBQVksVUFBVSxVQUFVO0FBQ2pELFFBQU0sZUFBZSxhQUFhLGFBQWEsb0JBQW9CLFVBQVUsSUFBSTtBQUNqRixRQUFNLGNBQWMsbUJBQW1CLFFBQVE7QUFDL0MsU0FBTztBQUFBLElBQ047QUFBQSxJQUNBO0FBQUEsSUFDQSxtQkFBbUIscUJBQXFCLFVBQVUsYUFBYSxZQUFZLFVBQVEsdUJBQXVCLE1BQU0sZ0JBQWdCLENBQUM7QUFBQSxJQUNqSSxXQUFXLG1CQUFtQixVQUFVLFlBQVksUUFBUTtBQUFBLElBQzVEO0FBQUEsSUFDQSxVQUFVLGFBQWEsYUFBYSxpQkFBaUIsUUFBUSxJQUFJO0FBQUEsSUFDakUsV0FBVyxrQkFBa0IsVUFBVSxVQUFVO0FBQUEsSUFDakQsbUJBQW1CLGNBQWM7QUFBQSxJQUNqQyxxQkFBcUIsY0FBYztBQUFBLElBQ25DO0FBQUEsSUFDQTtBQUFBLElBQ0EsZUFBZSxtQkFBbUIsUUFBUSxlQUFlO0FBQUEsSUFDekQsYUFBYSxtQkFBbUIsUUFBUSxhQUFhO0FBQUEsSUFDckQsa0JBQWtCLHFCQUFxQixNQUFNO0FBQUEsRUFDOUM7QUFDRDtBQUdBLFNBQVMsYUFBYSxTQUF1QixPQUF3QjtBQUNwRSxRQUFNLGNBQWMsUUFBUSxjQUFjLFNBQVksU0FBWSxLQUFLLE1BQU0sUUFBUSxTQUFTO0FBQzlGLFFBQU0sWUFBWSxRQUFRLGdCQUFnQixTQUFZLFNBQVksS0FBSyxNQUFNLFFBQVEsV0FBVztBQUNoRyxRQUFNLFdBQVcsZ0JBQWdCLFVBQWEsY0FBYyxVQUFhLE9BQU8sU0FBUyxXQUFXLEtBQUssT0FBTyxTQUFTLFNBQVMsSUFDL0gsS0FBSyxJQUFJLEdBQUcsWUFBWSxXQUFXLElBQ25DO0FBQ0gsU0FBTztBQUFBLElBQ04sSUFBSSxRQUFRO0FBQUEsSUFDWixHQUFJLFFBQVEsY0FBYyxTQUFZLEVBQUUsV0FBVyxRQUFRLFVBQVUsSUFBSSxDQUFDO0FBQUEsSUFDMUUsR0FBSSxhQUFhLFNBQVksRUFBRSxTQUFTLElBQUksQ0FBQztBQUFBLElBQzdDLFNBQVMsUUFBUTtBQUFBLElBQ2pCLGVBQWUsUUFBUTtBQUFBLElBQ3ZCLE9BQU8sUUFBUTtBQUFBLElBQ2Y7QUFBQSxJQUNBLEdBQUksUUFBUSxRQUFRLEVBQUUsT0FBTyxRQUFRLE1BQU0sSUFBSSxDQUFDO0FBQUEsRUFDakQ7QUFDRDtBQWlCQSxlQUFzQixpQkFDckIsU0FDQSxJQUNBLFFBQ0EsVUFBc0QsUUFDK0I7QUFDckYsUUFBTSxtQkFBbUIsbUJBQW1CLE1BQU0sVUFBVSxTQUFTO0FBQ3JFLE1BQUksZUFBZSxtQkFBbUIsTUFBTSxTQUFZLFNBQVM7QUFDakUsTUFBSSxlQUFlLG1CQUFtQixNQUFNLFNBQVksU0FBUztBQU1qRSxRQUFNLG1CQUFtQixvQkFBSSxJQUE0QjtBQUN6RCxRQUFNLGtCQUE0QixDQUFDO0FBQ25DLFFBQU0sc0JBQXNCLG9CQUFJLElBQXVDO0FBQ3ZFLFFBQU0sMkJBQTJCLG9CQUFJLElBQTJCO0FBT2hFLFFBQU0sNEJBQTRCLG9CQUFJLElBQW9CO0FBQzFELFFBQU0sMEJBQTBCLENBQUMsU0FBNkIsK0JBQXVFO0FBQ3BJLFVBQU0sU0FBUyxVQUFVLDBCQUEwQixJQUFJLE9BQU8sSUFBSTtBQUNsRSxXQUFPLFVBQVU7QUFBQSxFQUNsQjtBQUVBLGFBQVcsS0FBSyxRQUFRO0FBQ3ZCLFFBQUksRUFBRSxTQUFTLG9CQUFvQjtBQUNsQywrQkFBeUIsSUFBSSxFQUFFLEtBQUssWUFBWTtBQUFBLFFBQy9DLFdBQVcsRUFBRSxLQUFLO0FBQUEsUUFDbEIsa0JBQWtCLEVBQUUsS0FBSztBQUFBLFFBQ3pCLGtCQUFrQixFQUFFLEtBQUs7QUFBQSxNQUMxQixDQUFDO0FBQ0QsVUFBSSxFQUFFLFNBQVM7QUFDZCxrQ0FBMEIsSUFBSSxFQUFFLFNBQVMsRUFBRSxLQUFLLFVBQVU7QUFBQSxNQUMzRDtBQUFBLElBQ0Q7QUFDQSxRQUFJLEVBQUUsU0FBUywyQkFBMkI7QUFDekMsMEJBQW9CLElBQUksRUFBRSxLQUFLLFlBQVksRUFBRSxJQUFJO0FBQUEsSUFDbEQ7QUFDQSxRQUFJLEVBQUUsU0FBUyx3QkFBd0I7QUFDdEMsWUFBTSxJQUFJLEVBQUU7QUFDWixZQUFNLG1CQUFtQix3QkFBd0IsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCO0FBQzlFLFlBQU0sT0FBTyxrQkFBa0IsRUFBRSxVQUFVLEVBQUUsV0FBVyxrQkFBa0Isa0JBQWtCLENBQUM7QUFDN0YsVUFBSSxDQUFDLE1BQU07QUFDVjtBQUFBLE1BQ0Q7QUFDQSx1QkFBaUIsSUFBSSxFQUFFLFlBQVksSUFBSTtBQUN2QyxZQUFNLFVBQVUsU0FBUyxLQUFLLFlBQVksT0FBTyxJQUFJLEtBQUssV0FBVyxVQUFVO0FBQy9FLFVBQUksV0FBVyxFQUFFLFVBQVUsT0FBTyxHQUFHO0FBQ3BDLHdCQUFnQixLQUFLLEVBQUUsVUFBVTtBQUFBLE1BQ2xDO0FBQUEsSUFDRDtBQUFBLEVBQ0Q7QUFHQSxNQUFJO0FBQ0osTUFBSSxNQUFNLGdCQUFnQixTQUFTLEdBQUc7QUFDckMsUUFBSTtBQUNILFlBQU0sVUFBVSxNQUFNLEdBQUcsYUFBYSxlQUFlO0FBQ3JELFVBQUksUUFBUSxTQUFTLEdBQUc7QUFDdkIsc0JBQWMsb0JBQUksSUFBSTtBQUN0QixtQkFBVyxLQUFLLFNBQVM7QUFDeEIsY0FBSSxPQUFPLFlBQVksSUFBSSxFQUFFLFVBQVU7QUFDdkMsY0FBSSxDQUFDLE1BQU07QUFDVixtQkFBTyxDQUFDO0FBQ1Isd0JBQVksSUFBSSxFQUFFLFlBQVksSUFBSTtBQUFBLFVBQ25DO0FBQ0EsZUFBSyxLQUFLLENBQUM7QUFBQSxRQUNaO0FBQUEsTUFDRDtBQUFBLElBQ0QsUUFBUTtBQUFBLElBRVI7QUFBQSxFQUNEO0FBRUEsUUFBTSxnQkFBZ0IsUUFBUSxTQUFTO0FBQ3ZDLFFBQU0sYUFBYSxRQUFRO0FBQzNCLFFBQU0sZUFBZSxhQUFhLEdBQUcsT0FBTztBQUM1QyxRQUFNLFFBQWdCLENBQUM7QUFLdkIsUUFBTSxtQkFBbUIsb0JBQUksSUFBMEI7QUFDdkQsUUFBTSxxQkFBcUIsb0JBQUksSUFBdUI7QUFDdEQsUUFBTSwwQkFBMEIsb0JBQUksSUFBWTtBQUNoRCxRQUFNLGdCQUFnQixvQkFBSSxJQUFvQjtBQUM5QyxNQUFJO0FBQ0osTUFBSSxrQkFBa0IsVUFBVTtBQUNoQyxNQUFJLHVCQUF1QjtBQUMzQixNQUFJLDBCQUEwQjtBQUM5QixNQUFJO0FBR0osTUFBSTtBQUdKLFFBQU0sUUFBUSxDQUFDLFlBQTRDO0FBQzFELFFBQUksV0FBVywwQkFBMEIsUUFBVztBQUNuRCxjQUFRLGNBQWM7QUFBQSxJQUN2QjtBQUFBLEVBQ0Q7QUFFQSxRQUFNLGNBQWMsTUFBWTtBQUMvQixRQUFJLENBQUMsZUFBZTtBQUNuQjtBQUFBLElBQ0Q7QUFDQSxVQUFNLEtBQUssYUFBYSxlQUFlLGVBQWUsQ0FBQztBQUN2RCxvQkFBZ0I7QUFDaEIsc0JBQWtCLFVBQVU7QUFDNUIsMkJBQXVCO0FBQUEsRUFDeEI7QUFFQSxRQUFNLGdCQUFnQixDQUFDLHFCQUFtQztBQUN6RCxVQUFNLFVBQVUsaUJBQWlCLElBQUksZ0JBQWdCO0FBQ3JELFFBQUksQ0FBQyxTQUFTO0FBQ2IseUJBQW1CLE9BQU8sZ0JBQWdCO0FBQzFDO0FBQUEsSUFDRDtBQUNBLHFCQUFpQixPQUFPLGdCQUFnQjtBQUN4QyxVQUFNLFFBQVEsbUJBQW1CLElBQUksZ0JBQWdCLEtBQUssVUFBVTtBQUNwRSx1QkFBbUIsT0FBTyxnQkFBZ0I7QUFDMUMsNEJBQXdCLE9BQU8sZ0JBQWdCO0FBQy9DLFFBQUksUUFBUSxjQUFjLFdBQVcsS0FBSyxDQUFDLFFBQVEsT0FBTztBQUN6RDtBQUFBLElBQ0Q7QUFDQSxVQUFNLE9BQU8sY0FBYyxJQUFJLGdCQUFnQixLQUFLLENBQUM7QUFDckQsU0FBSyxLQUFLLGFBQWEsU0FBUyxLQUFLLENBQUM7QUFDdEMsa0JBQWMsSUFBSSxrQkFBa0IsSUFBSTtBQUFBLEVBQ3pDO0FBRUEsUUFBTSx3QkFBd0IsQ0FBQyxxQkFBMkM7QUFDekUsUUFBSSxVQUFVLGlCQUFpQixJQUFJLGdCQUFnQjtBQUNuRCxRQUFJLENBQUMsU0FBUztBQUNiLGdCQUFVLGVBQWUsYUFBYSxHQUFHLElBQUksRUFBRSxXQUFXLHNCQUFzQixDQUFDO0FBQ2pGLHVCQUFpQixJQUFJLGtCQUFrQixPQUFPO0FBQzlDLFVBQUksQ0FBQyxtQkFBbUIsSUFBSSxnQkFBZ0IsR0FBRztBQUM5QywyQkFBbUIsSUFBSSxrQkFBa0IsVUFBVSxRQUFRO0FBQUEsTUFDNUQ7QUFBQSxJQUNEO0FBQ0EsVUFBTSxPQUFPO0FBQ2IsV0FBTztBQUFBLEVBQ1I7QUFFQSxRQUFNLG1CQUFtQixDQUFDLHFCQUFtRTtBQUM1RixRQUFJLGtCQUFrQjtBQUNyQixhQUFPLHNCQUFzQixnQkFBZ0I7QUFBQSxJQUM5QztBQUNBLFVBQU0sYUFBYTtBQUNuQixXQUFPO0FBQUEsRUFDUjtBQUVBLGFBQVcsS0FBSyxRQUFRO0FBQ3ZCLDRCQUF3QixtQkFBbUIsQ0FBQztBQUM1QyxZQUFRLEVBQUUsTUFBTTtBQUFBLE1BQ2YsS0FBSztBQUNKLFlBQUksQ0FBQyxFQUFFLFNBQVM7QUFDZixvQ0FBMEI7QUFDMUIsZ0JBQU0sYUFBYTtBQUFBLFFBQ3BCO0FBQ0E7QUFBQSxNQUNELEtBQUs7QUFDSixZQUFJLENBQUMsRUFBRSxTQUFTO0FBQ2Ysb0NBQTBCO0FBQzFCLGdCQUFNLGFBQWE7QUFBQSxRQUNwQjtBQUNBO0FBQUEsTUFDRCxLQUFLLGlCQUFpQjtBQUVyQixZQUFJLENBQUMsRUFBRSxXQUFXLEVBQUUsS0FBSyxlQUFlO0FBQ3ZDLHlCQUFlLEVBQUUsSUFBSSxFQUFFLEtBQUssY0FBYztBQUFBLFFBQzNDO0FBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLHdCQUF3QjtBQUM1Qix1QkFBZSxFQUFFLElBQUksRUFBRSxLQUFLLFNBQVM7QUFDckM7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLDhCQUE4QjtBQUNsQyxZQUFJLENBQUMsRUFBRSxTQUFTO0FBQ2Ysb0NBQTBCLEVBQUU7QUFBQSxRQUM3QjtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyx1QkFBdUI7QUFDM0IsWUFBSSxDQUFDLEVBQUUsU0FBUztBQUNmLHlCQUFlO0FBQUEsUUFDaEI7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssZ0JBQWdCO0FBQ3BCLFlBQUksdUJBQXVCLENBQUMsR0FBRztBQUM5QjtBQUFBLFFBQ0Q7QUFDQSxjQUFNLElBQUksRUFBRTtBQUNaLGNBQU0sWUFBWSxFQUFFLGlCQUFpQjtBQUNyQyxjQUFNLFVBQVUsdUJBQXVCLEVBQUUsV0FBVyxFQUFFO0FBQ3RELGNBQU0sY0FBYyx5QkFBeUIsRUFBRSxXQUFXO0FBRzFELGNBQU0sbUJBQW1CLHdCQUF3QixFQUFFLFNBQVMsTUFBUztBQUNyRSxZQUFJLEVBQUUsV0FBVyxDQUFDLGtCQUFrQjtBQUNuQztBQUFBLFFBQ0Q7QUFDQSxZQUFJLGtCQUFrQjtBQUNyQixnQkFBTSxVQUFVLHNCQUFzQixnQkFBZ0I7QUFDdEQsa0JBQVEsVUFBVTtBQUFBLFlBQ2pCLEdBQUcsUUFBUTtBQUFBLFlBQ1gsTUFBTTtBQUFBLFlBQ04sR0FBSSxhQUFhLFNBQVMsRUFBRSxZQUFZLElBQUksQ0FBQztBQUFBLFVBQzlDO0FBQUEsUUFDRCxPQUFPO0FBTU4sc0JBQVk7QUFDWixnQkFBTSxTQUFTLEVBQUUsTUFBTTtBQUN2QiwwQkFBZ0IsZUFBZSxRQUFRLFNBQVMsRUFBRSxhQUFhLE9BQU8sY0FBYyxPQUFPLGNBQWMsV0FBVyxzQkFBc0IsQ0FBQztBQUMzSSxjQUFJLHlCQUF5QjtBQUM1QiwwQkFBYyxRQUFRO0FBQUEsY0FDckIsT0FBTyx3QkFBd0I7QUFBQSxjQUMvQixPQUFPLEVBQUUsa0JBQWtCLHdCQUF3QjtBQUFBLFlBQ3BEO0FBQ0Esc0NBQTBCO0FBQUEsVUFDM0I7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQSxLQUFLLHFCQUFxQjtBQUN6QixjQUFNLElBQUksRUFBRTtBQUNaLGNBQU0sWUFBWSxFQUFFLGFBQWEsRUFBRSxpQkFBaUI7QUFDcEQsY0FBTSxVQUFVLEVBQUUsV0FBVztBQUM3QixjQUFNLGdCQUFnQixFQUFFO0FBQ3hCLGNBQU0sa0JBQWtCLENBQUMsQ0FBQyxFQUFFLGdCQUFnQixFQUFFLGFBQWEsU0FBUztBQUNwRSxjQUFNLG1CQUFtQix3QkFBd0IsRUFBRSxTQUFTLEVBQUUsZ0JBQWdCO0FBQzlFLFlBQUksQ0FBQyxXQUFXLENBQUMsaUJBQWlCLENBQUMsaUJBQWlCO0FBQ25ELGNBQUksQ0FBQyxvQkFBb0IsaUJBQWlCLENBQUMsc0JBQXNCO0FBQ2hFLDhCQUFrQixVQUFVO0FBQzVCLGtCQUFNLGFBQWE7QUFBQSxVQUNwQjtBQUNBO0FBQUEsUUFDRDtBQU1BLGNBQU0saUJBQWlCLEVBQUUsTUFBTTtBQUMvQixjQUFNLFVBQVUsaUJBQWlCLGdCQUFnQixNQUM1QyxnQkFBZ0IsZUFBZSxnQkFBZ0IsSUFBSSxFQUFFLFdBQVcsc0JBQXNCLENBQUM7QUFDNUYsWUFBSSxlQUFlO0FBQ2xCLGtCQUFRLGNBQWMsS0FBSztBQUFBLFlBQzFCLE1BQU0saUJBQWlCO0FBQUEsWUFDdkIsSUFBSSxhQUFhO0FBQUEsWUFDakIsU0FBUztBQUFBLFVBQ1YsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxZQUFJLFNBQVM7QUFDWixrQkFBUSxjQUFjLEtBQUs7QUFBQSxZQUMxQixNQUFNLGlCQUFpQjtBQUFBLFlBQ3ZCLElBQUksYUFBYTtBQUFBLFlBQ2pCO0FBQUEsVUFDRCxDQUFDO0FBQUEsUUFDRjtBQUNBLFlBQUksQ0FBQyxvQkFBb0IsWUFBWSxpQkFBaUIsQ0FBQyxzQkFBc0I7QUFDNUUsNEJBQWtCLGtCQUFrQixVQUFVLFlBQVksVUFBVTtBQUFBLFFBQ3JFO0FBQ0EsWUFBSSxFQUFFLGNBQWMsUUFBUTtBQUMzQixxQ0FBMkIsU0FBUyxFQUFFLGNBQWMsZ0JBQWdCO0FBQUEsUUFDckU7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssdUJBQXVCO0FBQzNCLGNBQU0sZUFBZSwrQkFBK0IsQ0FBQztBQUNyRCxZQUFJLENBQUMsY0FBYztBQUNsQjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLGtCQUFrQiwyQkFBMkIsYUFBYSxhQUFhO0FBQzFFLHdCQUFjLGNBQWMsS0FBSztBQUFBLFlBQ2hDLE1BQU0saUJBQWlCO0FBQUEsWUFDdkIsU0FBUyxhQUFhO0FBQUEsVUFDdkIsQ0FBQztBQUNELGdCQUFNLGFBQWE7QUFBQSxRQUNwQjtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxpQkFBaUI7QUFDckIsY0FBTSxtQkFBbUIsd0JBQXdCLEVBQUUsU0FBUyxNQUFTO0FBQ3JFLFlBQUksRUFBRSxTQUFTO0FBQ2QsY0FBSSxDQUFDLG9CQUFvQix3QkFBd0IsSUFBSSxnQkFBZ0IsR0FBRztBQUN2RTtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxVQUFVLHNCQUFzQixnQkFBZ0I7QUFDdEQsNkJBQW1CLElBQUksa0JBQWtCLFVBQVUsS0FBSztBQUN4RCxrQ0FBd0IsSUFBSSxnQkFBZ0I7QUFDNUMsa0JBQVEsUUFBUSx1Q0FBdUMsRUFBRSxJQUFJO0FBQzdELGdCQUFNLE9BQU87QUFDYjtBQUFBLFFBQ0Q7QUFDQSxZQUFJLGlCQUFpQixDQUFDLHNCQUFzQjtBQUMzQyxvQ0FBMEI7QUFDMUIsNEJBQWtCLFVBQVU7QUFDNUIsaUNBQXVCO0FBQ3ZCLHdCQUFjLFFBQVEsdUNBQXVDLEVBQUUsSUFBSTtBQUNuRSxnQkFBTSxhQUFhO0FBQUEsUUFDcEI7QUFDQTtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssb0JBQW9CO0FBQ3hCO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyx3QkFBd0I7QUFDNUIsY0FBTSxtQkFBbUIsd0JBQXdCLEVBQUUsU0FBUyxFQUFFLEtBQUssZ0JBQWdCO0FBQ25GLFlBQUksQ0FBQyxvQkFBb0IsaUJBQWlCLENBQUMsc0JBQXNCO0FBQ2hFLDRCQUFrQixVQUFVO0FBQzVCLGdCQUFNLGFBQWE7QUFBQSxRQUNwQjtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSywyQkFBMkI7QUFDL0IsY0FBTSxJQUFJLEVBQUU7QUFDWixjQUFNLE9BQU8saUJBQWlCLElBQUksRUFBRSxVQUFVO0FBQzlDLFlBQUksQ0FBQyxNQUFNO0FBRVY7QUFBQSxRQUNEO0FBQ0EseUJBQWlCLE9BQU8sRUFBRSxVQUFVO0FBQ3BDLGNBQU0sbUJBQW1CLHdCQUF3QixFQUFFLFNBQVMsRUFBRSxnQkFBZ0I7QUFDOUUsWUFBSSxtQkFBbUIsS0FBSyxRQUFRLEdBQUc7QUFDdEMsZ0JBQU1BLFdBQVUsaUJBQWlCLGdCQUFnQjtBQUNqRCxjQUFJLENBQUNBLFVBQVM7QUFDYjtBQUFBLFVBQ0Q7QUFDQSxnQkFBTSxVQUFVLHdCQUF3QixLQUFLLFlBQVksRUFBRSxPQUFPLFdBQVcsRUFBRSxRQUFRLE9BQU87QUFDOUYsY0FBSSxTQUFTO0FBQ1osWUFBQUEsU0FBUSxjQUFjLEtBQUs7QUFBQSxjQUMxQixNQUFNLGlCQUFpQjtBQUFBLGNBQ3ZCLElBQUksYUFBYTtBQUFBLGNBQ2pCLFNBQVM7QUFBQSxZQUNWLENBQUM7QUFBQSxVQUNGO0FBQ0EsY0FBSSxDQUFDLG9CQUFvQixFQUFFLFdBQVdBLGFBQVksaUJBQWlCLENBQUMsc0JBQXNCO0FBQ3pGLDhCQUFrQixVQUFVO0FBQUEsVUFDN0I7QUFDQTtBQUFBLFFBQ0Q7QUFDQSxjQUFNLFVBQVUsaUJBQWlCLGdCQUFnQjtBQUNqRCxZQUFJLENBQUMsU0FBUztBQUViO0FBQUEsUUFDRDtBQUNBLGNBQU0sZ0JBQWdCLDBCQUEwQixHQUFHLE1BQU0sZUFBZSxZQUFZLGNBQWMsYUFBYSx5QkFBeUIsSUFBSSxFQUFFLFVBQVUsR0FBRyxnQkFBZ0I7QUFDM0ssZ0JBQVEsY0FBYyxLQUFLLGFBQWE7QUFHeEMsWUFBSSxDQUFDLG9CQUFvQix5QkFBeUIsSUFBSSxFQUFFLFVBQVUsR0FBRztBQUNwRSx3QkFBYyxFQUFFLFVBQVU7QUFBQSxRQUMzQjtBQUNBO0FBQUEsTUFDRDtBQUFBLE1BQ0EsS0FBSyxpQkFBaUI7QUFDckIsY0FBTSxRQUFRLHdCQUF3QixFQUFFLE1BQU0sRUFBRSxFQUFFO0FBQ2xELGNBQU0sbUJBQW1CLHdCQUF3QixFQUFFLFNBQVMsTUFBUztBQUNyRSxjQUFNLFVBQVUsaUJBQWlCLGdCQUFnQixNQUM1QyxnQkFBZ0IsZUFBZSxhQUFhLEdBQUcsSUFBSSxFQUFFLFdBQVcsc0JBQXNCLENBQUM7QUFDNUYsWUFBSSxDQUFDLG9CQUFvQixZQUFZLGVBQWU7QUFDbkQsNEJBQWtCLFVBQVU7QUFBQSxRQUM3QjtBQUNBLGdCQUFRLGNBQWMsS0FBSztBQUFBLFVBQzFCLE1BQU0saUJBQWlCO0FBQUEsVUFDdkIsVUFBVTtBQUFBLFlBQ1QsUUFBUSxlQUFlO0FBQUEsWUFDdkIsWUFBWSxNQUFNO0FBQUEsWUFDbEIsVUFBVSxNQUFNO0FBQUEsWUFDaEIsYUFBYSxNQUFNO0FBQUEsWUFDbkIsbUJBQW1CLE1BQU07QUFBQSxZQUN6QixTQUFTO0FBQUEsWUFDVCxrQkFBa0IsTUFBTTtBQUFBLFlBQ3hCLFdBQVcsMkJBQTJCO0FBQUEsVUFDdkM7QUFBQSxRQUNELENBQUM7QUFDRDtBQUFBLE1BQ0Q7QUFBQSxNQUNBLEtBQUssU0FBUztBQUNiLGNBQU0sbUJBQW1CLHdCQUF3QixFQUFFLFNBQVMsTUFBUztBQUNyRSxZQUFJLGtCQUFrQjtBQUNyQixjQUFJLENBQUMsd0JBQXdCLElBQUksZ0JBQWdCLEdBQUc7QUFDbkQsK0JBQW1CLElBQUksa0JBQWtCLFVBQVUsU0FBUztBQUFBLFVBQzdEO0FBQUEsUUFDRCxPQUFPO0FBQ04sb0NBQTBCO0FBQzFCLGNBQUksaUJBQWlCLENBQUMsc0JBQXNCO0FBQzNDLDhCQUFrQixVQUFVO0FBQzVCLG1DQUF1QjtBQUN2QixrQkFBTSxhQUFhO0FBQUEsVUFDcEI7QUFBQSxRQUNEO0FBQ0E7QUFBQSxNQUNEO0FBQUEsTUFDQTtBQUNDO0FBQUEsSUFDRjtBQUFBLEVBQ0Q7QUFFQSxjQUFZO0FBQ1osYUFBVyxvQkFBb0IsQ0FBQyxHQUFHLGlCQUFpQixLQUFLLENBQUMsR0FBRztBQUM1RCxrQkFBYyxnQkFBZ0I7QUFBQSxFQUMvQjtBQUVBLFNBQU8sRUFBRSxPQUFPLDJCQUEyQixjQUFjO0FBRXpELFdBQVMsMkJBQTJCLFNBQXVCLGNBQXNELGtCQUE0QztBQUM1SixlQUFXLFdBQVcsY0FBYztBQUNuQyxZQUFNLGFBQWEsb0JBQW9CLElBQUksUUFBUSxVQUFVO0FBQzdELFVBQUksY0FBYyxpQkFBaUIsSUFBSSxRQUFRLFVBQVUsR0FBRztBQUMzRDtBQUFBLE1BQ0Q7QUFDQSxZQUFNLE9BQU8saUJBQWlCLElBQUksUUFBUSxVQUFVLEtBQ2hELGtCQUFrQixRQUFRLE1BQU0sUUFBUSxXQUFXLGtCQUFrQixrQkFBa0IsT0FBTztBQUNsRyxVQUFJLENBQUMsTUFBTTtBQUNWO0FBQUEsTUFDRDtBQUNBLFVBQUksbUJBQW1CLEtBQUssUUFBUSxHQUFHO0FBQ3RDLGNBQU0sVUFBVSx3QkFBd0IsS0FBSyxZQUFZLFlBQVksT0FBTyxXQUFXLFlBQVksUUFBUSxPQUFPO0FBQ2xILFlBQUksU0FBUztBQUNaLGtCQUFRLGNBQWMsS0FBSztBQUFBLFlBQzFCLE1BQU0saUJBQWlCO0FBQUEsWUFDdkIsSUFBSSxhQUFhO0FBQUEsWUFDakIsU0FBUztBQUFBLFVBQ1YsQ0FBQztBQUFBLFFBQ0Y7QUFDQSxZQUFJLENBQUMsb0JBQW9CLFlBQVksV0FBVyxZQUFZLGlCQUFpQixDQUFDLHNCQUFzQjtBQUNuRyw0QkFBa0IsVUFBVTtBQUFBLFFBQzdCO0FBQ0E7QUFBQSxNQUNEO0FBQ0EsY0FBUSxjQUFjLEtBQUs7QUFBQSxRQUMxQixjQUFjLEVBQUUsWUFBWSxRQUFRLFlBQVksU0FBUyxLQUFLO0FBQUEsUUFDOUQ7QUFBQSxRQUNBO0FBQUEsUUFDQTtBQUFBLFFBQ0E7QUFBQSxRQUNBO0FBQUEsUUFDQSx5QkFBeUIsSUFBSSxRQUFRLFVBQVU7QUFBQSxRQUMvQztBQUFBLE1BQ0QsQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBQ0Q7QUFhQSxTQUFTLHlCQUNSLGFBQ2tDO0FBQ2xDLE1BQUksQ0FBQyxhQUFhLFFBQVE7QUFDekIsV0FBTztBQUFBLEVBQ1I7QUFDQSxRQUFNLE1BQTJCLENBQUM7QUFDbEMsYUFBVyxLQUFLLGFBQWE7QUFDNUIsVUFBTSxZQUFZLHdCQUF3QixDQUFDO0FBQzNDLFFBQUksV0FBVztBQUNkLFVBQUksS0FBSyxTQUFTO0FBQUEsSUFDbkI7QUFBQSxFQUNEO0FBQ0EsU0FBTyxJQUFJLFNBQVMsSUFBSSxNQUFNO0FBQy9CO0FBRUEsU0FBUyx3QkFDUixZQUNnQztBQUNoQyxVQUFRLFdBQVcsTUFBTTtBQUFBLElBQ3hCLEtBQUssUUFBUTtBQUNaLGFBQU87QUFBQSxRQUNOLE1BQU0sc0JBQXNCO0FBQUEsUUFDNUIsS0FBSyxJQUFJLEtBQUssV0FBVyxJQUFJLEVBQUUsU0FBUztBQUFBLFFBQ3hDLE9BQU8sV0FBVyxlQUFlLFNBQVMsV0FBVyxJQUFJO0FBQUEsUUFDekQsYUFBYSxhQUFhLFdBQVcsSUFBSSxHQUFHLFdBQVcsUUFBUSxJQUFJLFVBQVU7QUFBQSxNQUM5RTtBQUFBLElBQ0Q7QUFBQSxJQUNBLEtBQUssYUFBYTtBQUNqQixhQUFPO0FBQUEsUUFDTixNQUFNLHNCQUFzQjtBQUFBLFFBQzVCLEtBQUssSUFBSSxLQUFLLFdBQVcsSUFBSSxFQUFFLFNBQVM7QUFBQSxRQUN4QyxPQUFPLFdBQVcsZUFBZSxTQUFTLFdBQVcsSUFBSTtBQUFBLFFBQ3pELGFBQWE7QUFBQSxNQUNkO0FBQUEsSUFDRDtBQUFBLElBQ0EsS0FBSyxhQUFhO0FBQ2pCLGFBQU87QUFBQSxRQUNOLE1BQU0sc0JBQXNCO0FBQUEsUUFDNUIsS0FBSyxJQUFJLEtBQUssV0FBVyxRQUFRLEVBQUUsU0FBUztBQUFBLFFBQzVDLE9BQU8sV0FBVztBQUFBLFFBQ2xCLGFBQWE7QUFBQSxRQUNiLFdBQVcsRUFBRSxPQUFPLFdBQVcsVUFBVztBQUFBLE1BQzNDO0FBQUEsSUFDRDtBQUFBLElBQ0EsS0FBSyxRQUFRO0FBQ1osVUFBSSxPQUFPLFdBQVcsU0FBUyxVQUFVO0FBQ3hDLGVBQU87QUFBQSxNQUNSO0FBQ0EsWUFBTSxvQkFBb0IsNENBQTRDLFdBQVcsUUFBUTtBQUN6RixVQUFJLFdBQVcsU0FBUyxXQUFXLFlBQVksS0FBSyxzQkFBc0IsUUFBVztBQUNwRixlQUFPO0FBQUEsVUFDTixNQUFNLHNCQUFzQjtBQUFBLFVBQzVCLE9BQU8sV0FBVyxlQUFlO0FBQUEsVUFDakMscUJBQXFCLGFBQWEsV0FBVyxRQUFRLEVBQUUsRUFBRSxTQUFTO0FBQUEsVUFDbEUsR0FBSSxzQkFBc0IsU0FBWSxFQUFFLGFBQWEsa0JBQWtCLElBQUksQ0FBQztBQUFBLFFBQzdFO0FBQUEsTUFDRDtBQUNBLFlBQU0sY0FBYyxXQUFXLFNBQVMsV0FBVyxRQUFRLElBQUksVUFBVTtBQUN6RSxhQUFPO0FBQUEsUUFDTixNQUFNLHNCQUFzQjtBQUFBLFFBQzVCLE9BQU8sV0FBVyxlQUFlO0FBQUEsUUFDakMsTUFBTSxXQUFXLFFBQVE7QUFBQSxRQUN6QixhQUFhLFdBQVc7QUFBQSxRQUN4QjtBQUFBLE1BQ0Q7QUFBQSxJQUNEO0FBQUEsSUFDQTtBQUNDLGFBQU87QUFBQSxFQUNUO0FBQ0Q7QUFRQSxTQUFTLDBCQUNSLEdBQ0EsTUFDQSxlQUNBLFlBQ0EsY0FDQSxhQUNBLFVBQ0Esa0JBQ2U7QUFDZixRQUFNLGFBQWEsRUFBRSxPQUFPLFdBQVcsRUFBRSxRQUFRO0FBQ2pELFFBQU0sVUFBK0IsQ0FBQztBQUN0QyxNQUFJLGVBQWUsUUFBVztBQUM3QixZQUFRLEtBQUssRUFBRSxNQUFNLHNCQUFzQixNQUFNLE1BQU0sV0FBVyxDQUFDO0FBQUEsRUFDcEU7QUFDQTtBQUFBLElBQ0M7QUFBQSxJQUNBLEVBQUUsUUFBUTtBQUFBLElBQ1YsS0FBSyxhQUFhLGFBQWEsRUFBRSxTQUFTLGVBQWUsWUFBWSxFQUFFLFlBQVksT0FBTyxLQUFLLFlBQVksSUFBSTtBQUFBLEVBQ2hIO0FBR0EsUUFBTSxRQUFRLGFBQWEsSUFBSSxFQUFFLFVBQVU7QUFDM0MsTUFBSSxPQUFPO0FBQ1YsZUFBVyxRQUFRLE9BQU87QUFDekIsWUFBTSxZQUFZLEtBQUssU0FBUyxZQUFZLEtBQUssZUFDOUMsSUFBSSxLQUFLLEtBQUssWUFBWSxFQUFFLFNBQVMsSUFDckMsSUFBSSxLQUFLLEtBQUssUUFBUSxFQUFFLFNBQVM7QUFDcEMsWUFBTSxXQUFXLElBQUksS0FBSyxLQUFLLFFBQVEsRUFBRSxTQUFTO0FBQ2xELFlBQU0sWUFBWSxLQUFLLFNBQVM7QUFDaEMsWUFBTSxXQUFXLEtBQUssU0FBUztBQUMvQixjQUFRLEtBQUs7QUFBQSxRQUNaLE1BQU0sc0JBQXNCO0FBQUEsUUFDNUIsUUFBUSxZQUFZO0FBQUEsVUFDbkIsS0FBSztBQUFBLFVBQ0wsU0FBUyxFQUFFLEtBQUssa0JBQWtCLGVBQWUsS0FBSyxZQUFZLEtBQUssVUFBVSxRQUFRLEVBQUU7QUFBQSxRQUM1RixJQUFJO0FBQUEsUUFDSixPQUFPLFdBQVc7QUFBQSxVQUNqQixLQUFLO0FBQUEsVUFDTCxTQUFTLEVBQUUsS0FBSyxrQkFBa0IsZUFBZSxLQUFLLFlBQVksS0FBSyxVQUFVLE9BQU8sRUFBRTtBQUFBLFFBQzNGLElBQUk7QUFBQSxRQUNKLE1BQU8sS0FBSyxlQUFlLFVBQWEsS0FBSyxpQkFBaUIsU0FDM0QsRUFBRSxPQUFPLEtBQUssWUFBWSxTQUFTLEtBQUssYUFBYSxJQUNyRDtBQUFBLE1BQ0osQ0FBQztBQUFBLElBQ0Y7QUFBQSxFQUNEO0FBRUEsTUFBSSxVQUFVO0FBQ2IsWUFBUSxLQUFLO0FBQUEsTUFDWixNQUFNLHNCQUFzQjtBQUFBLE1BQzVCLFVBQVUsd0JBQXdCLGVBQWUsRUFBRSxVQUFVO0FBQUEsTUFDN0QsT0FBTyxTQUFTO0FBQUEsTUFDaEIsV0FBVyxTQUFTO0FBQUEsTUFDcEIsYUFBYSxTQUFTO0FBQUEsSUFDdkIsQ0FBQztBQUFBLEVBQ0Y7QUFFQSxRQUFNLGdCQUFnQixLQUFLLGlCQUFpQixtQkFBbUIsR0FBRyxlQUFlO0FBQ2pGLFFBQU0sY0FBYyxLQUFLLGVBQWUsbUJBQW1CLEdBQUcsYUFBYTtBQUMzRSxRQUFNLG1CQUFtQixLQUFLLG9CQUFvQixxQkFBcUIsQ0FBQztBQUN4RSxRQUFNLFFBQXFDLG1CQUN4QztBQUFBLElBQ0QsYUFBYTtBQUFBLElBQ2IsR0FBSSxnQkFBZ0IsRUFBRSxTQUFTLGdCQUFnQixZQUFZLGNBQWMsYUFBYSxFQUFFLElBQUksQ0FBQztBQUFBLEVBQzlGLElBQ0U7QUFFSCxRQUFNLEtBQTZCO0FBQUEsSUFDbEMsUUFBUSxlQUFlO0FBQUEsSUFDdkIsWUFBWSxFQUFFO0FBQUEsSUFDZCxVQUFVLEtBQUs7QUFBQSxJQUNmLGFBQWEsS0FBSztBQUFBLElBQ2xCLFdBQVcsS0FBSztBQUFBLElBQ2hCLEdBQUksZ0JBQWdCLEVBQUUsYUFBYSxFQUFFLE1BQU0sd0JBQXdCLEtBQUssaUJBQWlCLGdDQUFnQyxZQUFZLGNBQWMsYUFBYSxFQUFFLEVBQUUsSUFBSSxDQUFDO0FBQUEsSUFDekssbUJBQW1CLEtBQUs7QUFBQSxJQUN4QixXQUFXLEtBQUs7QUFBQSxJQUNoQixTQUFTLEVBQUU7QUFBQSxJQUNYLGtCQUFrQixvQkFBb0IsS0FBSyxVQUFVLEtBQUssYUFBYSxLQUFLLFlBQVksRUFBRSxTQUFTLEVBQUUsVUFBVSxhQUFhLFFBQVcsVUFBUSx1QkFBdUIsTUFBTSxnQkFBZ0IsQ0FBQztBQUFBLElBQzdMLFNBQVMsUUFBUSxTQUFTLElBQUksVUFBVTtBQUFBLElBQ3hDLE9BQU8sRUFBRTtBQUFBLElBQ1QsV0FBVywyQkFBMkI7QUFBQSxJQUN0QyxPQUFPLGVBQWU7QUFBQSxNQUNyQixVQUFVLEtBQUs7QUFBQSxNQUNmLFVBQVUsS0FBSztBQUFBLE1BQ2YscUJBQXFCLEtBQUs7QUFBQSxNQUMxQixtQkFBbUIsS0FBSztBQUFBLE1BQ3hCO0FBQUEsTUFDQTtBQUFBLE1BQ0EsSUFBSTtBQUFBLElBQ0wsQ0FBQztBQUFBLEVBQ0Y7QUFDQSxTQUFPLEVBQUUsTUFBTSxpQkFBaUIsVUFBVSxVQUFVLEdBQUc7QUFDeEQ7IiwKICAibmFtZXMiOiBbImJ1aWxkZXIiXQp9Cg==
