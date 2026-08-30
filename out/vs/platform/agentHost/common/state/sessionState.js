import { distinct } from "../../../../base/common/arrays.js";
import { decodeBase64, encodeBase64, VSBuffer } from "../../../../base/common/buffer.js";
import { hasKey } from "../../../../base/common/types.js";
import { URI as ResourceURI } from "../../../../base/common/uri.js";
import { readToolCallMeta } from "../meta/agentToolCallMeta.js";
import {
  ResponsePartKind,
  SessionStatus,
  ToolCallStatus,
  SessionLifecycle,
  ToolResultContentType,
  ChatOriginKind,
  ChatInteractivity
} from "./protocol/state.js";
import {
  ChangesetOperationScope,
  ChangesetOperationStatus,
  ChangesetStatus,
  CustomizationLoadStatus,
  CustomizationType,
  MessageAttachmentKind,
  MessageKind,
  PendingMessageKind,
  PolicyState,
  ResponsePartKind as ResponsePartKind2,
  ChatInputAnswerState,
  ChatInputAnswerValueKind,
  ChatInputQuestionKind,
  ChatInputRequestPurpose,
  ChatInputResponseKind,
  ChatInteractivity as ChatInteractivity2,
  ChatOriginKind as ChatOriginKind2,
  SessionLifecycle as SessionLifecycle2,
  SessionStatus as SessionStatus2,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallContributorKind,
  ToolCallRiskAssessmentKind,
  ToolCallRiskAssessmentStatus,
  ToolCallStatus as ToolCallStatus2,
  ToolResultContentType as ToolResultContentType2,
  TurnState
} from "./protocol/state.js";
const MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY = "vscode.chat.hiddenFromTranscript";
const MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX = "<!-- vscode-hidden-from-transcript -->\n";
function readMessageMeta(message) {
  const meta = message._meta;
  return {
    hiddenFromTranscript: meta?.[MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY] === true
  };
}
function isMessageHiddenFromTranscript(message) {
  return readMessageMeta(message).hiddenFromTranscript || message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX);
}
function withMessageHiddenFromTranscript(message, hidden) {
  if (!hidden) {
    return message;
  }
  return {
    ...message,
    text: message.text.startsWith(MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX) ? message.text : MESSAGE_HIDDEN_FROM_TRANSCRIPT_PREFIX + message.text,
    _meta: {
      ...message._meta,
      [MESSAGE_HIDDEN_FROM_TRANSCRIPT_META_KEY]: true
    }
  };
}
function readAccountQuotaSnapshot(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const snapshot = {};
  if (typeof raw["isUnlimitedEntitlement"] === "boolean") {
    snapshot.isUnlimitedEntitlement = raw["isUnlimitedEntitlement"];
  }
  if (typeof raw["entitlementRequests"] === "number") {
    snapshot.entitlementRequests = raw["entitlementRequests"];
  }
  if (typeof raw["usedRequests"] === "number") {
    snapshot.usedRequests = raw["usedRequests"];
  }
  if (typeof raw["remainingPercentage"] === "number") {
    snapshot.remainingPercentage = raw["remainingPercentage"];
  }
  if (typeof raw["overage"] === "number") {
    snapshot.overage = raw["overage"];
  }
  if (typeof raw["overageAllowedWithExhaustedQuota"] === "boolean") {
    snapshot.overageAllowedWithExhaustedQuota = raw["overageAllowedWithExhaustedQuota"];
  }
  if (typeof raw["resetDate"] === "string") {
    snapshot.resetDate = raw["resetDate"];
  }
  return snapshot;
}
function readUsageInfoMeta(usage) {
  const meta = usage?._meta;
  if (!meta) {
    return {};
  }
  const result = {};
  if (typeof meta["cost"] === "number") {
    result.cost = meta["cost"];
  }
  const autoModeResolved = readAutoModeResolvedInfo(meta["autoModeResolved"]);
  if (autoModeResolved) {
    result.autoModeResolved = autoModeResolved;
  }
  const copilotUsage = meta["copilotUsage"];
  if (copilotUsage && typeof copilotUsage === "object" && !Array.isArray(copilotUsage)) {
    const rawUsage = copilotUsage;
    const usage2 = {};
    if (typeof rawUsage["totalNanoAiu"] === "number") {
      usage2.totalNanoAiu = rawUsage["totalNanoAiu"];
    }
    if (typeof rawUsage["sessionTotalNanoAiu"] === "number") {
      usage2.sessionTotalNanoAiu = rawUsage["sessionTotalNanoAiu"];
    }
    result.copilotUsage = usage2;
  }
  const quotaSnapshots = meta["quotaSnapshots"];
  if (quotaSnapshots && typeof quotaSnapshots === "object" && !Array.isArray(quotaSnapshots)) {
    const snapshots = {};
    for (const [quotaType, value] of Object.entries(quotaSnapshots)) {
      snapshots[quotaType] = readAccountQuotaSnapshot(value);
    }
    result.quotaSnapshots = snapshots;
  }
  const contextAttribution = readContextAttribution(meta["contextAttribution"]);
  if (contextAttribution) {
    result.contextAttribution = contextAttribution;
  }
  const turnTokenTotals = readTurnTokenTotals(meta["turnTokenTotals"]);
  if (turnTokenTotals) {
    result.turnTokenTotals = turnTokenTotals;
  }
  return result;
}
function readTurnTokenTotals(value) {
  if (!Array.isArray(value)) {
    return void 0;
  }
  const totals = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const raw = item;
    if (typeof raw["model"] !== "string" || !raw["model"] || !isTokenCount(raw["inputTokens"]) || !isTokenCount(raw["cachedTokens"]) || !isTokenCount(raw["outputTokens"])) {
      continue;
    }
    totals.push({
      model: raw["model"],
      inputTokens: raw["inputTokens"],
      cachedTokens: raw["cachedTokens"],
      outputTokens: raw["outputTokens"]
    });
  }
  return totals.length > 0 ? totals : void 0;
}
function isTokenCount(value) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
function hasReportedUsage(usage) {
  if (!usage) {
    return false;
  }
  if (typeof usage.inputTokens === "number" || typeof usage.outputTokens === "number") {
    return true;
  }
  const meta = readUsageInfoMeta(usage);
  return typeof meta.copilotUsage?.totalNanoAiu === "number" && meta.copilotUsage.totalNanoAiu >= 0 || typeof meta.copilotUsage?.sessionTotalNanoAiu === "number" && meta.copilotUsage.sessionTotalNanoAiu >= 0 || typeof meta.cost === "number" && meta.cost >= 0;
}
function readAutoModeResolvedInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["chosenModel"] !== "string") {
    return void 0;
  }
  const result = { chosenModel: raw["chosenModel"] };
  const reasoningBucket = raw["reasoningBucket"];
  if (reasoningBucket === "low" || reasoningBucket === "medium" || reasoningBucket === "high") {
    result.reasoningBucket = reasoningBucket;
  }
  const categoryScores = raw["categoryScores"];
  if (categoryScores && typeof categoryScores === "object" && !Array.isArray(categoryScores)) {
    const scores = {};
    for (const [category, score] of Object.entries(categoryScores)) {
      if (typeof score === "number") {
        scores[category] = score;
      }
    }
    result.categoryScores = scores;
  }
  if (typeof raw["predictedLabel"] === "string") {
    result.predictedLabel = raw["predictedLabel"];
  }
  if (typeof raw["confidence"] === "number") {
    result.confidence = raw["confidence"];
  }
  if (Array.isArray(raw["candidateModels"]) && raw["candidateModels"].every((candidate) => typeof candidate === "string")) {
    result.candidateModels = raw["candidateModels"];
  }
  return result;
}
function readContextAttribution(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["totalTokens"] !== "number" || !Array.isArray(raw["entries"])) {
    return void 0;
  }
  const entries = [];
  for (const item of raw["entries"]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const entry = item;
    if (typeof entry["kind"] !== "string" || typeof entry["id"] !== "string" || typeof entry["label"] !== "string" || typeof entry["tokens"] !== "number") {
      continue;
    }
    entries.push({
      kind: entry["kind"],
      id: entry["id"],
      label: entry["label"],
      tokens: entry["tokens"],
      parentId: typeof entry["parentId"] === "string" ? entry["parentId"] : void 0,
      attributes: entry["attributes"] && typeof entry["attributes"] === "object" && !Array.isArray(entry["attributes"]) ? filterStringAttributes(entry["attributes"]) : void 0
    });
  }
  const compactionsRaw = raw["compactions"];
  const compactions = compactionsRaw && typeof compactionsRaw === "object" && !Array.isArray(compactionsRaw) && typeof compactionsRaw["count"] === "number" ? { count: compactionsRaw["count"] } : { count: 0 };
  return { totalTokens: raw["totalTokens"], entries, compactions };
}
function filterStringAttributes(raw) {
  const result = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string" || value === void 0) {
      result[key] = value;
    }
  }
  return result;
}
import {
  ChangesetOperationTargetKind
} from "./protocol/commands.js";
import {
  ChatInputAnswerState as ChatInputAnswerState2,
  ChatInputAnswerValueKind as ChatInputAnswerValueKind2,
  ChatInputQuestionKind as ChatInputQuestionKind2,
  ChatInputResponseKind as ChatInputResponseKind2
} from "./protocol/state.js";
var FileEditKind = /* @__PURE__ */ ((FileEditKind2) => {
  FileEditKind2["Edit"] = "edit";
  FileEditKind2["Create"] = "create";
  FileEditKind2["Delete"] = "delete";
  FileEditKind2["Rename"] = "rename";
  return FileEditKind2;
})(FileEditKind || {});
const ROOT_STATE_URI = "ahp-root://";
const AHP_ROOT_SCHEME = "ahp-root";
const AHP_RESOURCE_WATCH_SCHEME = "ahp-resource-watch";
function buildResourceWatchChannelUri(descriptor) {
  const payload = { root: descriptor.root };
  if (descriptor.recursive) {
    payload.recursive = true;
  }
  if (descriptor.excludes && descriptor.excludes.items.length > 0) {
    payload.excludes = [...descriptor.excludes.items];
  }
  if (descriptor.includes && descriptor.includes.items.length > 0) {
    payload.includes = [...descriptor.includes.items];
  }
  const json = encodeBase64(VSBuffer.fromString(JSON.stringify(payload)), false, true);
  return `${AHP_RESOURCE_WATCH_SCHEME}://r/${json}`;
}
function parseResourceWatchChannelUri(uri) {
  let parsed;
  try {
    parsed = ResourceURI.parse(uri);
  } catch {
    return void 0;
  }
  if (parsed.scheme !== AHP_RESOURCE_WATCH_SCHEME) {
    return void 0;
  }
  const encoded = parsed.path.replace(/^\//, "");
  if (!encoded) {
    return void 0;
  }
  try {
    const payload = JSON.parse(decodeBase64(encoded).toString());
    if (typeof payload.root !== "string") {
      return void 0;
    }
    return {
      root: payload.root,
      recursive: payload.recursive === true,
      ...Array.isArray(payload.excludes) ? { excludes: { items: payload.excludes.filter((x) => typeof x === "string") } } : {},
      ...Array.isArray(payload.includes) ? { includes: { items: payload.includes.filter((x) => typeof x === "string") } } : {}
    };
  } catch {
    return void 0;
  }
}
function isAhpResourceWatchChannel(uri) {
  try {
    return ResourceURI.parse(uri).scheme === AHP_RESOURCE_WATCH_SCHEME;
  } catch {
    return false;
  }
}
function isAhpRootChannel(uri) {
  if (uri === ROOT_STATE_URI) {
    return true;
  }
  try {
    return ResourceURI.parse(uri).scheme === AHP_ROOT_SCHEME;
  } catch {
    return false;
  }
}
function customizationId(uri, range) {
  if (!range) {
    return uri;
  }
  const safeUri = uri.replace(/#/g, "%23");
  return `${safeUri}#range=${range.start.line}:${range.start.character}-${range.end.line}:${range.end.character}`;
}
function getToolOutputText(result) {
  if (!result.content || result.content.length === 0) {
    return void 0;
  }
  const textParts = [];
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Text) {
      textParts.push(c);
    }
  }
  if (textParts.length === 0) {
    return void 0;
  }
  return textParts.map((p) => p.text).join("\n");
}
function getInlineToolInput(toolInput) {
  return typeof toolInput === "string" ? toolInput : void 0;
}
function getToolFileEdits(result) {
  if (!result.content || result.content.length === 0) {
    return [];
  }
  const edits = [];
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.FileEdit) {
      edits.push(c);
    }
  }
  return edits;
}
function getToolSubagentContent(result) {
  if (!result.content || result.content.length === 0) {
    return void 0;
  }
  for (const c of result.content) {
    if (hasKey(c, { type: true }) && c.type === ToolResultContentType.Subagent) {
      return c;
    }
  }
  return void 0;
}
const SUBAGENT_URI_SEGMENT = "subagent";
const SUBAGENT_URI_MARKER = `/${SUBAGENT_URI_SEGMENT}/`;
const SUBAGENT_URI_PATH_REGEX = /^(?<parentPath>.+)\/subagent\/(?<toolCallId>.+)$/;
function asResourceUri(uri) {
  return typeof uri === "string" ? ResourceURI.parse(uri) : uri;
}
function getSubagentBasePath(parentSession) {
  const parent = asResourceUri(parentSession);
  const parentPath = parent.path.endsWith("/") ? parent.path.slice(0, -1) : parent.path;
  return { parent, path: `${parentPath}${SUBAGENT_URI_MARKER}` };
}
function buildSubagentSessionUri(parentSession, toolCallId) {
  const { parent, path } = getSubagentBasePath(parentSession);
  return parent.with({ path: `${path}${toolCallId}` }).toString();
}
function parseSubagentSessionUri(uri) {
  const resource = asResourceUri(uri);
  const match = SUBAGENT_URI_PATH_REGEX.exec(resource.path);
  if (!match?.groups) {
    return void 0;
  }
  return {
    parentSession: resource.with({ path: match.groups.parentPath }),
    toolCallId: match.groups.toolCallId
  };
}
function isSubagentSession(uri) {
  return parseSubagentSessionUri(uri) !== void 0;
}
function buildSubagentSessionUriPrefix(parentSession) {
  const { parent, path } = getSubagentBasePath(parentSession);
  return parent.with({ path }).toString();
}
function createRootState() {
  return {
    agents: [],
    activeSessions: 0
  };
}
function createSessionState(summary) {
  const state = {
    provider: summary.provider,
    title: summary.title,
    status: summary.status,
    lifecycle: SessionLifecycle.Creating,
    activeClients: [],
    chats: [],
    defaultChat: void 0
  };
  if (summary.activity !== void 0) {
    state.activity = summary.activity;
  }
  if (summary.project !== void 0) {
    state.project = summary.project;
  }
  if (summary.workingDirectories !== void 0) {
    state.workingDirectories = summary.workingDirectories;
  }
  if (summary.annotations !== void 0) {
    state.annotations = summary.annotations;
  }
  if (summary._meta !== void 0) {
    state._meta = summary._meta;
  }
  return state;
}
function createChatState(summary) {
  return {
    resource: summary.resource,
    title: summary.title,
    status: summary.status,
    activity: summary.activity,
    modifiedAt: summary.modifiedAt,
    origin: summary.origin,
    interactivity: summary.interactivity,
    workingDirectories: summary.workingDirectories,
    turns: [],
    activeTurn: void 0
  };
}
function createDefaultChatSummary(session, chatUri) {
  const summary = {
    resource: chatUri,
    title: session.title,
    status: session.status,
    modifiedAt: session.modifiedAt,
    origin: { kind: ChatOriginKind.User }
  };
  if (session.activity !== void 0) {
    summary.activity = session.activity;
  }
  return summary;
}
const STATUS_ACTIVITY_MASK = (1 << 5) - 1;
function hasAutoApprovedPendingConfirmation(state) {
  return !!state.activeTurn?.responseParts.some(
    (part) => part.kind === ResponsePartKind.ToolCall && part.toolCall.status === ToolCallStatus.PendingConfirmation && readToolCallMeta(part.toolCall).autoApproveBySetting === true
  );
}
function chatAwaitsUserInput(state) {
  return !!state.activeTurn?.responseParts.some((part) => {
    if (part.kind === ResponsePartKind.InputRequest) {
      return part.response === void 0;
    }
    if (part.kind !== ResponsePartKind.ToolCall) {
      return false;
    }
    const status = part.toolCall.status;
    if (status === ToolCallStatus.PendingResultConfirmation || status === ToolCallStatus.AuthRequired) {
      return true;
    }
    return status === ToolCallStatus.PendingConfirmation && readToolCallMeta(part.toolCall).autoApproveBySetting !== true;
  });
}
function chatSummaryStatus(state) {
  const status = state.status;
  if ((status & SessionStatus.InputNeeded) !== SessionStatus.InputNeeded) {
    return status;
  }
  if (hasAutoApprovedPendingConfirmation(state) && !chatAwaitsUserInput(state)) {
    return status & ~STATUS_ACTIVITY_MASK | SessionStatus.InProgress;
  }
  return status;
}
function chatSummaryFromState(state) {
  const summary = {
    resource: state.resource,
    title: state.title,
    status: chatSummaryStatus(state),
    modifiedAt: state.modifiedAt
  };
  if (state.activity !== void 0) {
    summary.activity = state.activity;
  }
  if (state.origin !== void 0) {
    summary.origin = state.origin;
  }
  if (state.interactivity !== void 0) {
    summary.interactivity = state.interactivity;
  }
  if (state.workingDirectories !== void 0) {
    summary.workingDirectories = state.workingDirectories;
  }
  return summary;
}
function effectiveChatInteractivity(interactivity, sessionArchived) {
  if (interactivity === ChatInteractivity.Hidden) {
    return ChatInteractivity.Hidden;
  }
  if (sessionArchived) {
    return ChatInteractivity.ReadOnly;
  }
  return interactivity ?? ChatInteractivity.Full;
}
function isChatReadOnly(interactivity, sessionArchived) {
  return effectiveChatInteractivity(interactivity, sessionArchived) === ChatInteractivity.ReadOnly;
}
function createActiveTurn(id, message, startedAt) {
  return {
    id,
    startedAt,
    message,
    responseParts: [],
    usage: void 0
  };
}
var StateComponents = /* @__PURE__ */ ((StateComponents2) => {
  StateComponents2[StateComponents2["Root"] = 0] = "Root";
  StateComponents2[StateComponents2["Session"] = 1] = "Session";
  StateComponents2[StateComponents2["Chat"] = 2] = "Chat";
  StateComponents2[StateComponents2["Terminal"] = 3] = "Terminal";
  StateComponents2[StateComponents2["Changeset"] = 4] = "Changeset";
  StateComponents2[StateComponents2["Annotations"] = 5] = "Annotations";
  return StateComponents2;
})(StateComponents || {});
const AHP_CHAT_SCHEME = "ahp-chat";
const DEFAULT_CHAT_ID = "default";
function buildChatUri(sessionUri, chatId) {
  const session = typeof sessionUri === "string" ? sessionUri : sessionUri.toString();
  const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
  return `${AHP_CHAT_SCHEME}://${chatId}/${encoded}`;
}
function buildDefaultChatUri(sessionUri) {
  return buildChatUri(sessionUri, DEFAULT_CHAT_ID);
}
const SUBAGENT_CHAT_ID = "subagent";
function isSubagentChatUri(uri) {
  const parsed = typeof uri === "string" ? ResourceURI.parse(uri) : uri;
  return parsed.scheme === AHP_CHAT_SCHEME && parsed.authority === SUBAGENT_CHAT_ID;
}
function buildSubagentChatUri(sessionUri, toolCallId) {
  const session = typeof sessionUri === "string" ? sessionUri : sessionUri.toString();
  const encoded = encodeBase64(VSBuffer.fromString(session), false, true);
  return `${AHP_CHAT_SCHEME}://${SUBAGENT_CHAT_ID}/${encoded}/${encodeURIComponent(toolCallId)}`;
}
function parseChatUri(uri) {
  let parsed;
  try {
    parsed = typeof uri === "string" ? ResourceURI.parse(uri) : uri;
  } catch {
    return void 0;
  }
  if (parsed.scheme !== AHP_CHAT_SCHEME || !parsed.authority) {
    return void 0;
  }
  const encoded = parsed.path.replace(/^\//, "");
  if (!encoded) {
    return void 0;
  }
  try {
    if (parsed.authority === SUBAGENT_CHAT_ID) {
      const [sessionPart, ...toolCallIdParts] = encoded.split("/");
      const toolCallId = toolCallIdParts.join("/");
      if (!sessionPart || !toolCallId) {
        return void 0;
      }
      return { session: decodeBase64(sessionPart).toString(), chatId: `${SUBAGENT_CHAT_ID}/${decodeURIComponent(toolCallId)}` };
    }
    return { session: decodeBase64(encoded).toString(), chatId: parsed.authority };
  } catch {
    return void 0;
  }
}
function parseDefaultChatUri(uri) {
  return parseChatUri(uri)?.session;
}
function parseRequiredSessionUriFromChatUri(uri) {
  const session = parseDefaultChatUri(uri);
  if (session === void 0) {
    throw new Error(`Malformed AHP chat URI: ${typeof uri === "string" ? uri : uri.toString()}`);
  }
  return session;
}
function isDefaultChatUri(uri) {
  return parseChatUri(uri)?.chatId === DEFAULT_CHAT_ID;
}
function resolveChatUri(session, chat) {
  return isDefaultChatUri(chat) ? session : chat;
}
function chatStorageUri(chatChannel) {
  const parsed = parseChatUri(chatChannel);
  if (!parsed) {
    return void 0;
  }
  return resolveChatUri(ResourceURI.parse(parsed.session), ResourceURI.parse(chatChannel.toString()));
}
function isAhpChatChannel(uri) {
  try {
    return ResourceURI.parse(uri).scheme === AHP_CHAT_SCHEME;
  } catch {
    return false;
  }
}
function mergeSessionWithDefaultChat(session, chat) {
  return {
    ...session,
    workingDirectories: chat?.workingDirectories ?? session.workingDirectories,
    turns: chat?.turns ?? [],
    activeTurn: chat?.activeTurn,
    steeringMessage: chat?.steeringMessage,
    queuedMessages: chat?.queuedMessages,
    draft: chat?.draft
  };
}
function getActiveTurn(chat) {
  return chat?.activeTurn;
}
function getDefaultChat(session) {
  if (session.defaultChat !== void 0) {
    const match = session.chats.find((c) => c.resource === session.defaultChat);
    if (match) {
      return match;
    }
  }
  return session.chats[0];
}
const SESSION_META_GIT_KEY = "git";
const SESSION_META_GITHUB_KEY = "github";
const SESSION_META_SOURCE_CONTROL_KEY = "vscode.sourceControl";
const SESSION_META_PROMPT_CACHE_KEY = "vscode.promptCache";
const SESSION_META_MULTI_ROOT_KEY = "multiRoot";
const SESSION_META_EXTERNAL_KEY = "vscode.external";
const MAX_WORKSPACE_FILE_LENGTH = 4096;
function readSessionMultiRootMetadata(meta) {
  return validateSessionMultiRootMetadata(meta?.[SESSION_META_MULTI_ROOT_KEY]);
}
function parseSessionMultiRootMetadata(value) {
  if (!value) {
    return void 0;
  }
  try {
    return validateSessionMultiRootMetadata(JSON.parse(value));
  } catch {
    return void 0;
  }
}
function withSessionMultiRootMetadata(meta, multiRoot) {
  const next = { ...meta };
  if (multiRoot) {
    next[SESSION_META_MULTI_ROOT_KEY] = multiRoot;
  } else {
    delete next[SESSION_META_MULTI_ROOT_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function validateSessionMultiRootMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw.workspaceFile !== "string" || raw.workspaceFile.length === 0 || raw.workspaceFile.length > MAX_WORKSPACE_FILE_LENGTH) {
    return void 0;
  }
  try {
    if (!ResourceURI.parse(raw.workspaceFile, true).scheme) {
      return void 0;
    }
  } catch {
    return void 0;
  }
  return { workspaceFile: raw.workspaceFile };
}
function readSessionPromptCacheState(meta) {
  const value = meta?.[SESSION_META_PROMPT_CACHE_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  return typeof raw["modelId"] === "string" && typeof raw["cacheExpiresAt"] === "string" ? { modelId: raw["modelId"], cacheExpiresAt: raw["cacheExpiresAt"] } : void 0;
}
function withSessionPromptCacheState(meta, promptCache) {
  const next = { ...meta };
  if (promptCache) {
    next[SESSION_META_PROMPT_CACHE_KEY] = promptCache;
  } else {
    delete next[SESSION_META_PROMPT_CACHE_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
var SessionSourceControlOutcome = /* @__PURE__ */ ((SessionSourceControlOutcome2) => {
  SessionSourceControlOutcome2["Merge"] = "merge";
  SessionSourceControlOutcome2["PullRequest"] = "pullRequest";
  return SessionSourceControlOutcome2;
})(SessionSourceControlOutcome || {});
function readSessionSourceControlState(meta) {
  const value = meta?.[SESSION_META_SOURCE_CONTROL_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  let merge;
  const rawMerge = raw["merge"];
  if (rawMerge && typeof rawMerge === "object" && !Array.isArray(rawMerge)) {
    const commit = rawMerge["commit"];
    merge = typeof commit === "string" && commit.length > 0 ? { commit } : void 0;
  }
  const rawLatestOutcome = raw["latestOutcome"];
  const latestOutcome = rawLatestOutcome === "merge" /* Merge */ || rawLatestOutcome === "pullRequest" /* PullRequest */ ? rawLatestOutcome : void 0;
  if (!merge && (!latestOutcome || latestOutcome === "merge" /* Merge */)) {
    return void 0;
  }
  return { merge, latestOutcome };
}
function withSessionSourceControlState(meta, state) {
  const next = { ...meta };
  if (state) {
    next[SESSION_META_SOURCE_CONTROL_KEY] = state;
  } else {
    delete next[SESSION_META_SOURCE_CONTROL_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function hasSessionPullRequestForBranch(gitHubState, branchName) {
  if (!gitHubState?.pullRequestUrls?.length) {
    return false;
  }
  return gitHubState.pullRequestBranchName === void 0 || gitHubState.pullRequestBranchName === branchName;
}
function getSessionRelatedPullRequestUrls(gitHubState) {
  const pullRequestUrls = gitHubState?.pullRequestUrls ?? [];
  const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
  const initialUrls = new Set(initialPullRequestUrls?.map((url) => url.toLowerCase()) ?? []);
  const associatedUrls = new Set(gitHubState?.associatedPullRequestUrls?.map((url) => url.toLowerCase()) ?? []);
  return pullRequestUrls.filter((url) => !initialUrls.has(url.toLowerCase()) || associatedUrls.has(url.toLowerCase()));
}
const MAX_SESSION_PULL_REQUEST_REFERENCES = 10;
function normalizeSessionPullRequestUrls(urls) {
  const normalizedUrls = urls.map((url) => {
    const match = /^https:\/\/(?<host>[^/]+)\/(?<owner>[^/]+)\/(?<repo>[^/]+)\/pull\/(?<number>\d+)\/?$/.exec(url);
    const groups = match?.groups;
    return groups ? `https://${groups["host"].toLowerCase()}/${groups["owner"]}/${groups["repo"]}/pull/${groups["number"]}` : url;
  });
  return distinct(normalizedUrls, (url) => url.toLowerCase()).slice(0, MAX_SESSION_PULL_REQUEST_REFERENCES);
}
function withMostRecentSessionPullRequest(gitHubState, pullRequestUrl, branchName) {
  const pullRequestUrls = normalizeSessionPullRequestUrls([
    pullRequestUrl,
    ...gitHubState?.pullRequestUrls ?? []
  ]);
  return {
    pullRequestUrls,
    pullRequestBranchName: branchName
  };
}
function withMostRecentRelatedSessionPullRequest(gitHubState, pullRequestUrl, branchName) {
  const next = withMostRecentSessionPullRequest(gitHubState, pullRequestUrl, branchName);
  const promotedUrl = normalizeSessionPullRequestUrls([pullRequestUrl])[0]?.toLowerCase();
  const initialPullRequestUrls = gitHubState?.initialPullRequestUrls;
  const associatedPullRequestUrls = normalizeSessionPullRequestUrls([
    pullRequestUrl,
    ...gitHubState?.associatedPullRequestUrls ?? []
  ]);
  return {
    ...next,
    associatedPullRequestUrls,
    ...initialPullRequestUrls !== void 0 ? {
      initialPullRequestUrls: initialPullRequestUrls.filter((url) => url.toLowerCase() !== promotedUrl)
    } : {}
  };
}
function withInitialSessionPullRequest(gitHubState, pullRequestUrl) {
  return {
    initialPullRequestUrls: normalizeSessionPullRequestUrls([
      ...pullRequestUrl ? [pullRequestUrl] : [],
      ...gitHubState?.initialPullRequestUrls ?? []
    ])
  };
}
function withMostRecentReferencedSessionPullRequest(gitHubState, pullRequestUrl) {
  const associatedPullRequestUrls = normalizeSessionPullRequestUrls([
    pullRequestUrl,
    ...gitHubState?.associatedPullRequestUrls ?? []
  ]);
  return {
    associatedPullRequestUrls
  };
}
function readSessionGitState(meta) {
  const value = meta?.[SESSION_META_GIT_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const result = {};
  if (typeof raw["hasGitHubRemote"] === "boolean") {
    result.hasGitHubRemote = raw["hasGitHubRemote"];
  }
  if (typeof raw["branchName"] === "string") {
    result.branchName = raw["branchName"];
  }
  if (typeof raw["baseBranchName"] === "string") {
    result.baseBranchName = raw["baseBranchName"];
  }
  if (typeof raw["upstreamBranchName"] === "string") {
    result.upstreamBranchName = raw["upstreamBranchName"];
  }
  if (typeof raw["incomingChanges"] === "number") {
    result.incomingChanges = raw["incomingChanges"];
  }
  if (typeof raw["outgoingChanges"] === "number") {
    result.outgoingChanges = raw["outgoingChanges"];
  }
  if (typeof raw["uncommittedChanges"] === "number") {
    result.uncommittedChanges = raw["uncommittedChanges"];
  }
  if (typeof raw["hasBaseBranchChanges"] === "boolean") {
    result.hasBaseBranchChanges = raw["hasBaseBranchChanges"];
  }
  if (typeof raw["githubOwner"] === "string") {
    result.githubOwner = raw["githubOwner"];
  }
  if (typeof raw["githubHeadOwner"] === "string") {
    result.githubHeadOwner = raw["githubHeadOwner"];
  }
  if (typeof raw["githubRepo"] === "string") {
    result.githubRepo = raw["githubRepo"];
  }
  return result;
}
function withSessionGitState(meta, gitState) {
  const next = { ...meta };
  if (gitState !== void 0) {
    next[SESSION_META_GIT_KEY] = gitState;
  } else {
    delete next[SESSION_META_GIT_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function readSessionGitHubState(meta) {
  const value = meta?.[SESSION_META_GITHUB_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  const result = {};
  if (typeof raw["owner"] === "string") {
    result.owner = raw["owner"];
  }
  if (typeof raw["repo"] === "string") {
    result.repo = raw["repo"];
  }
  const pullRequestUrls = Array.isArray(raw["pullRequestUrls"]) ? raw["pullRequestUrls"].filter((url) => typeof url === "string") : typeof raw["pullRequestUrl"] === "string" ? [raw["pullRequestUrl"]] : [];
  if (pullRequestUrls.length > 0) {
    result.pullRequestUrls = normalizeSessionPullRequestUrls(pullRequestUrls);
  }
  if (Array.isArray(raw["initialPullRequestUrls"])) {
    result.initialPullRequestUrls = normalizeSessionPullRequestUrls(raw["initialPullRequestUrls"].filter((url) => typeof url === "string"));
  }
  if (Array.isArray(raw["associatedPullRequestUrls"])) {
    const associatedPullRequestUrls = normalizeSessionPullRequestUrls(raw["associatedPullRequestUrls"].filter((url) => typeof url === "string"));
    if (associatedPullRequestUrls.length > 0) {
      result.associatedPullRequestUrls = associatedPullRequestUrls;
    }
  }
  if (Array.isArray(raw["issueUrls"])) {
    result.issueUrls = raw["issueUrls"].filter((url) => typeof url === "string");
  }
  if (typeof raw["pullRequestBranchName"] === "string") {
    result.pullRequestBranchName = raw["pullRequestBranchName"];
  }
  return result;
}
function withSessionGitHubState(meta, gitHubState) {
  const next = { ...meta };
  if (gitHubState !== void 0) {
    next[SESSION_META_GITHUB_KEY] = gitHubState;
  } else {
    delete next[SESSION_META_GITHUB_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
const SESSION_META_SPAWN_DEPTH_KEY = "agentHost/sessionSpawnDepth";
function readSessionSpawnDepth(meta) {
  const value = meta?.[SESSION_META_SPAWN_DEPTH_KEY];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function withSessionSpawnDepth(meta, depth) {
  return { ...meta, [SESSION_META_SPAWN_DEPTH_KEY]: depth };
}
const SESSION_META_WORKSPACELESS_KEY = "workspaceless";
const AH_META_WORKSPACELESS_DB_KEY = "agentHost.workspaceless";
const AH_META_IS_ARCHIVED_DB_KEY = "isArchived";
const AH_META_IS_DONE_DB_KEY = "isDone";
const AH_META_IS_READ_DB_KEY = "isRead";
function withSessionStatusFlag(status, flag, set) {
  return set ? status | flag : status & ~flag;
}
function isSessionStatusRead(status) {
  return status !== void 0 && (status & SessionStatus.IsRead) !== 0;
}
function isSessionStatusArchived(status) {
  return status !== void 0 && (status & SessionStatus.IsArchived) !== 0;
}
function readSessionWorkspaceless(meta) {
  return meta?.[SESSION_META_WORKSPACELESS_KEY] === true;
}
function withSessionWorkspaceless(meta, workspaceless) {
  const next = { ...meta };
  if (workspaceless) {
    next[SESSION_META_WORKSPACELESS_KEY] = true;
  } else {
    delete next[SESSION_META_WORKSPACELESS_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function readSessionExternal(meta) {
  return meta?.[SESSION_META_EXTERNAL_KEY] === true;
}
function withSessionExternal(meta, external) {
  const next = { ...meta };
  if (external) {
    next[SESSION_META_EXTERNAL_KEY] = true;
  } else {
    delete next[SESSION_META_EXTERNAL_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
const SESSION_META_EHCLI_ADOPTABLE_KEY = "ehcliAdoptable";
function readSessionEhcliAdoptable(meta) {
  return meta?.[SESSION_META_EHCLI_ADOPTABLE_KEY] === true;
}
function withSessionEhcliAdoptable(meta) {
  return { ...meta, [SESSION_META_EHCLI_ADOPTABLE_KEY]: true };
}
const ROOT_META_HOST_BUILD_KEY = "hostBuild";
function hostBuildInfoFromProduct(productService) {
  return {
    version: productService.version,
    commit: productService.commit,
    date: productService.date,
    quality: productService.quality
  };
}
function readHostBuildInfo(state) {
  const meta = state?._meta;
  const value = meta?.[ROOT_META_HOST_BUILD_KEY];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return void 0;
  }
  const raw = value;
  if (typeof raw["version"] !== "string") {
    return void 0;
  }
  const result = {
    version: raw["version"]
  };
  if (typeof raw["commit"] === "string") {
    result.commit = raw["commit"];
  }
  if (typeof raw["date"] === "string") {
    result.date = raw["date"];
  }
  if (typeof raw["quality"] === "string") {
    result.quality = raw["quality"];
  }
  return result;
}
function withHostBuildInfo(meta, buildInfo) {
  const next = { ...meta };
  if (buildInfo !== void 0) {
    next[ROOT_META_HOST_BUILD_KEY] = buildInfo;
  } else {
    delete next[ROOT_META_HOST_BUILD_KEY];
  }
  return Object.keys(next).length > 0 ? next : void 0;
}
function formatHostBuildInfo(info) {
  const details = [];
  if (info.commit) {
    details.push(`commit ${info.commit}`);
  }
  if (info.date) {
    details.push(info.date);
  }
  if (info.quality) {
    details.push(info.quality);
  }
  return details.length > 0 ? `${info.version} (${details.join(", ")})` : info.version;
}
export {
  AHP_CHAT_SCHEME,
  AHP_RESOURCE_WATCH_SCHEME,
  AHP_ROOT_SCHEME,
  AH_META_IS_ARCHIVED_DB_KEY,
  AH_META_IS_DONE_DB_KEY,
  AH_META_IS_READ_DB_KEY,
  AH_META_WORKSPACELESS_DB_KEY,
  ChangesetOperationScope,
  ChangesetOperationStatus,
  ChangesetOperationTargetKind,
  ChangesetStatus,
  ChatInputAnswerState2 as ChatInputAnswerState,
  ChatInputAnswerValueKind2 as ChatInputAnswerValueKind,
  ChatInputQuestionKind2 as ChatInputQuestionKind,
  ChatInputRequestPurpose,
  ChatInputResponseKind2 as ChatInputResponseKind,
  ChatInteractivity2 as ChatInteractivity,
  ChatOriginKind2 as ChatOriginKind,
  CustomizationLoadStatus,
  CustomizationType,
  DEFAULT_CHAT_ID,
  FileEditKind,
  MAX_SESSION_PULL_REQUEST_REFERENCES,
  MessageAttachmentKind,
  MessageKind,
  PendingMessageKind,
  PolicyState,
  ROOT_META_HOST_BUILD_KEY,
  ROOT_STATE_URI,
  ResponsePartKind2 as ResponsePartKind,
  SESSION_META_EHCLI_ADOPTABLE_KEY,
  SESSION_META_EXTERNAL_KEY,
  SESSION_META_GITHUB_KEY,
  SESSION_META_GIT_KEY,
  SESSION_META_MULTI_ROOT_KEY,
  SESSION_META_PROMPT_CACHE_KEY,
  SESSION_META_SOURCE_CONTROL_KEY,
  SESSION_META_SPAWN_DEPTH_KEY,
  SESSION_META_WORKSPACELESS_KEY,
  ChatInputAnswerState as SessionInputAnswerState,
  ChatInputAnswerValueKind as SessionInputAnswerValueKind,
  ChatInputQuestionKind as SessionInputQuestionKind,
  ChatInputResponseKind as SessionInputResponseKind,
  SessionLifecycle2 as SessionLifecycle,
  SessionSourceControlOutcome,
  SessionStatus2 as SessionStatus,
  StateComponents,
  ToolCallCancellationReason,
  ToolCallConfirmationReason,
  ToolCallContributorKind,
  ToolCallRiskAssessmentKind,
  ToolCallRiskAssessmentStatus,
  ToolCallStatus2 as ToolCallStatus,
  ToolResultContentType2 as ToolResultContentType,
  TurnState,
  buildChatUri,
  buildDefaultChatUri,
  buildResourceWatchChannelUri,
  buildSubagentChatUri,
  buildSubagentSessionUri,
  buildSubagentSessionUriPrefix,
  chatStorageUri,
  chatSummaryFromState,
  createActiveTurn,
  createChatState,
  createDefaultChatSummary,
  createRootState,
  createSessionState,
  customizationId,
  effectiveChatInteractivity,
  formatHostBuildInfo,
  getActiveTurn,
  getDefaultChat,
  getInlineToolInput,
  getSessionRelatedPullRequestUrls,
  getToolFileEdits,
  getToolOutputText,
  getToolSubagentContent,
  hasReportedUsage,
  hasSessionPullRequestForBranch,
  hostBuildInfoFromProduct,
  isAhpChatChannel,
  isAhpResourceWatchChannel,
  isAhpRootChannel,
  isChatReadOnly,
  isDefaultChatUri,
  isMessageHiddenFromTranscript,
  isSessionStatusArchived,
  isSessionStatusRead,
  isSubagentChatUri,
  isSubagentSession,
  mergeSessionWithDefaultChat,
  parseChatUri,
  parseDefaultChatUri,
  parseRequiredSessionUriFromChatUri,
  parseResourceWatchChannelUri,
  parseSessionMultiRootMetadata,
  parseSubagentSessionUri,
  readHostBuildInfo,
  readSessionEhcliAdoptable,
  readSessionExternal,
  readSessionGitHubState,
  readSessionGitState,
  readSessionMultiRootMetadata,
  readSessionPromptCacheState,
  readSessionSourceControlState,
  readSessionSpawnDepth,
  readSessionWorkspaceless,
  readUsageInfoMeta,
  resolveChatUri,
  withHostBuildInfo,
  withInitialSessionPullRequest,
  withMessageHiddenFromTranscript,
  withMostRecentReferencedSessionPullRequest,
  withMostRecentRelatedSessionPullRequest,
  withMostRecentSessionPullRequest,
  withSessionEhcliAdoptable,
  withSessionExternal,
  withSessionGitHubState,
  withSessionGitState,
  withSessionMultiRootMetadata,
  withSessionPromptCacheState,
  withSessionSourceControlState,
  withSessionSpawnDepth,
  withSessionStatusFlag,
  withSessionWorkspaceless
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFxwbGF0Zm9ybVxcYWdlbnRIb3N0XFxjb21tb25cXHN0YXRlXFxzZXNzaW9uU3RhdGUudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbIi8qLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gKiAgQ29weXJpZ2h0IChjKSBNaWNyb3NvZnQgQ29ycG9yYXRpb24uIEFsbCByaWdodHMgcmVzZXJ2ZWQuXG4gKiAgTGljZW5zZWQgdW5kZXIgdGhlIE1JVCBMaWNlbnNlLiBTZWUgTGljZW5zZS50eHQgaW4gdGhlIHByb2plY3Qgcm9vdCBmb3IgbGljZW5zZSBpbmZvcm1hdGlvbi5cbiAqLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0qL1xuXG4vLyBJbW11dGFibGUgc3RhdGUgdHlwZXMgZm9yIHRoZSBzZXNzaW9ucyBwcm9jZXNzIHByb3RvY29sLlxuLy8gU2VlIHByb3RvY29sLm1kIGZvciB0aGUgZnVsbCBkZXNpZ24gcmF0aW9uYWxlLlxuLy9cbi8vIE1vc3QgdHlwZXMgYXJlIGltcG9ydGVkIGZyb20gdGhlIGF1dG8tZ2VuZXJhdGVkIHByb3RvY29sIGxheWVyXG4vLyAoc3luY2VkIGZyb20gdGhlIGFnZW50LWhvc3QtcHJvdG9jb2wgcmVwbykuIFRoaXMgZmlsZSBhZGRzIFZTIENvZGUtc3BlY2lmaWNcbi8vIGhlbHBlcnMgYW5kIHJlLWV4cG9ydHMuXG5cbmltcG9ydCB7IGRpc3RpbmN0IH0gZnJvbSAnLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vYXJyYXlzLmpzJztcbmltcG9ydCB7IGRlY29kZUJhc2U2NCwgZW5jb2RlQmFzZTY0LCBWU0J1ZmZlciB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIHR5cGUgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IFVSSSBhcyBSZXNvdXJjZVVSSSB9IGZyb20gJy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3VyaS5qcyc7XG5pbXBvcnQgdHlwZSB7IElQcm9kdWN0U2VydmljZSB9IGZyb20gJy4uLy4uLy4uL3Byb2R1Y3QvY29tbW9uL3Byb2R1Y3RTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHJlYWRUb29sQ2FsbE1ldGEgfSBmcm9tICcuLi9tZXRhL2FnZW50VG9vbENhbGxNZXRhLmpzJztcbmltcG9ydCB7XG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdFNlc3Npb25TdGF0dXMsXG5cdFRvb2xDYWxsU3RhdHVzLFxuXHRTZXNzaW9uTGlmZWN5Y2xlLFxuXHRUZXJtaW5hbFN0YXRlLFxuXHRUb29sUmVzdWx0Q29udGVudFR5cGUsXG5cdFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnQsXG5cdENoYXRPcmlnaW5LaW5kLFxuXHRDaGF0SW50ZXJhY3Rpdml0eSxcblx0dHlwZSBBY3RpdmVUdXJuLFxuXHR0eXBlIENoYW5nZXNldFN0YXRlLFxuXHR0eXBlIENoYXRTdGF0ZSxcblx0dHlwZSBDaGF0U3VtbWFyeSxcblx0dHlwZSBQZW5kaW5nTWVzc2FnZSxcblx0dHlwZSBUdXJuLFxuXHR0eXBlIEFubm90YXRpb25zU3RhdGUsXG5cdHR5cGUgVVJJIGFzIFByb3RvY29sVVJJLFxuXHR0eXBlIFJvb3RTdGF0ZSxcblx0dHlwZSBTZXNzaW9uU3RhdGUsXG5cdHR5cGUgU2Vzc2lvblN1bW1hcnksXG5cdHR5cGUgVGV4dFJhbmdlLFxuXHR0eXBlIFRvb2xDYWxsQ2FuY2VsbGVkU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxDb21wbGV0ZWRTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFJlc3VsdCxcblx0dHlwZSBUb29sQ2FsbFN0YXRlLFxuXHR0eXBlIFRvb2xJbnB1dCxcblx0dHlwZSBUb29sUmVzdWx0Q29udGVudCxcblx0dHlwZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50LFxuXHR0eXBlIFRvb2xSZXN1bHRUZXh0Q29udGVudCxcblx0dHlwZSBVc2FnZUluZm8sXG5cdHR5cGUgTWVzc2FnZSxcbn0gZnJvbSAnLi9wcm90b2NvbC9zdGF0ZS5qcyc7XG5cbi8vIFJlLWV4cG9ydCBldmVyeXRoaW5nIGZyb20gdGhlIHByb3RvY29sIHN0YXRlIG1vZHVsZVxuZXhwb3J0IHtcblx0Q2hhbmdlc2V0T3BlcmF0aW9uU2NvcGUsIENoYW5nZXNldE9wZXJhdGlvblN0YXR1cywgQ2hhbmdlc2V0U3RhdHVzLCBDdXN0b21pemF0aW9uTG9hZFN0YXR1cyxcblx0Q3VzdG9taXphdGlvblR5cGUsIE1lc3NhZ2VBdHRhY2htZW50S2luZCwgTWVzc2FnZUtpbmQsXG5cdFBlbmRpbmdNZXNzYWdlS2luZCxcblx0UG9saWN5U3RhdGUsXG5cdFJlc3BvbnNlUGFydEtpbmQsXG5cdENoYXRJbnB1dEFuc3dlclN0YXRlIGFzIFNlc3Npb25JbnB1dEFuc3dlclN0YXRlLFxuXHRDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQgYXMgU2Vzc2lvbklucHV0QW5zd2VyVmFsdWVLaW5kLFxuXHRDaGF0SW5wdXRRdWVzdGlvbktpbmQgYXMgU2Vzc2lvbklucHV0UXVlc3Rpb25LaW5kLFxuXHRDaGF0SW5wdXRSZXF1ZXN0UHVycG9zZSxcblx0Q2hhdElucHV0UmVzcG9uc2VLaW5kIGFzIFNlc3Npb25JbnB1dFJlc3BvbnNlS2luZCxcblx0Q2hhdEludGVyYWN0aXZpdHksXG5cdENoYXRPcmlnaW5LaW5kLFxuXHRTZXNzaW9uTGlmZWN5Y2xlLFxuXHRTZXNzaW9uU3RhdHVzLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb25maXJtYXRpb25SZWFzb24sIFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLCBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50S2luZCwgVG9vbENhbGxSaXNrQXNzZXNzbWVudFN0YXR1cywgVG9vbENhbGxTdGF0dXMsXG5cdFRvb2xSZXN1bHRDb250ZW50VHlwZSxcblx0VHVyblN0YXRlLCB0eXBlIEFjdGl2ZVR1cm4sIHR5cGUgQWdlbnRDdXN0b21pemF0aW9uLCB0eXBlIEFnZW50Q2FwYWJpbGl0aWVzLCB0eXBlIEFnZW50SW5mbywgdHlwZSBBZ2VudFNlbGVjdGlvbiwgdHlwZSBBbm5vdGF0aW9uLCB0eXBlIEFubm90YXRpb25FbnRyeSwgdHlwZSBBbm5vdGF0aW9uc1N0YXRlLCB0eXBlIEFubm90YXRpb25zU3VtbWFyeSwgdHlwZSBDaGFuZ2VzZXQsIHR5cGUgQ2hhbmdlc2V0RmlsZSxcblx0dHlwZSBDaGFuZ2VzZXRPcGVyYXRpb24sIHR5cGUgQ2hhbmdlc2V0U3RhdGUsIHR5cGUgQ2hhdFN0YXRlLCB0eXBlIENoYXRTdW1tYXJ5LCB0eXBlIENoYXRPcmlnaW4sIHR5cGUgQ2hpbGRDdXN0b21pemF0aW9uLCB0eXBlIENsaWVudFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgQ29uZmlnUHJvcGVydHlTY2hlbWEsXG5cdHR5cGUgQ29uZmlnU2NoZW1hLFxuXHR0eXBlIENvbnRlbnRSZWYsIHR5cGUgQ3VzdG9taXphdGlvbiwgdHlwZSBDdXN0b21pemF0aW9uRGVncmFkZWRTdGF0ZSxcblx0dHlwZSBDdXN0b21pemF0aW9uRXJyb3JTdGF0ZSwgdHlwZSBDdXN0b21pemF0aW9uTG9hZGVkU3RhdGUsIHR5cGUgQ3VzdG9taXphdGlvbkxvYWRpbmdTdGF0ZSwgdHlwZSBDdXN0b21pemF0aW9uTG9hZFN0YXRlLCB0eXBlIERpcmVjdG9yeUN1c3RvbWl6YXRpb24sIHR5cGUgRXJyb3JJbmZvLCB0eXBlIEhvb2tDdXN0b21pemF0aW9uLCB0eXBlIEZpbGVFZGl0IGFzIElTZXNzaW9uRmlsZURpZmYsIHR5cGUgVG9vbFJlc3VsdEVtYmVkZGVkUmVzb3VyY2VDb250ZW50IGFzIElUb29sUmVzdWx0QmluYXJ5Q29udGVudCwgdHlwZSBNYXJrZG93blJlc3BvbnNlUGFydCwgdHlwZSBNY3BTZXJ2ZXJDdXN0b21pemF0aW9uLCB0eXBlIE1lc3NhZ2VBdHRhY2htZW50LFxuXHR0eXBlIE1lc3NhZ2VSZXNvdXJjZUF0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUVtYmVkZGVkUmVzb3VyY2VBdHRhY2htZW50LCB0eXBlIE1lc3NhZ2VBbm5vdGF0aW9uc0F0dGFjaG1lbnQsIHR5cGUgTWVzc2FnZUNoYXRBdHRhY2htZW50LCB0eXBlIE1vZGVsU2VsZWN0aW9uLCB0eXBlIFBlbmRpbmdNZXNzYWdlLCB0eXBlIFBsdWdpbkN1c3RvbWl6YXRpb24sIHR5cGUgUHJvamVjdEluZm8sIHR5cGUgUHJvbXB0Q3VzdG9taXphdGlvbiwgdHlwZSBSZWFzb25pbmdSZXNwb25zZVBhcnQsXG5cdHR5cGUgUmVzcG9uc2VQYXJ0LFxuXHR0eXBlIFJvb3RTdGF0ZSwgdHlwZSBSdWxlQ3VzdG9taXphdGlvbiwgdHlwZSBTZXNzaW9uQWN0aXZlQ2xpZW50LFxuXHR0eXBlIFNlc3Npb25Db25maWdTdGF0ZSwgdHlwZSBDaGF0SW5wdXRBbnN3ZXIgYXMgU2Vzc2lvbklucHV0QW5zd2VyLFxuXHR0eXBlIENoYXRJbnB1dE9wdGlvbiBhcyBTZXNzaW9uSW5wdXRPcHRpb24sIHR5cGUgQ2hhdElucHV0UXVlc3Rpb24gYXMgU2Vzc2lvbklucHV0UXVlc3Rpb24sIHR5cGUgQ2hhdElucHV0UmVxdWVzdCBhcyBTZXNzaW9uSW5wdXRSZXF1ZXN0LCB0eXBlIFNlc3Npb25Nb2RlbEluZm8sXG5cdHR5cGUgU2Vzc2lvblN0YXRlLFxuXHR0eXBlIFNlc3Npb25TdW1tYXJ5LCB0eXBlIFNraWxsQ3VzdG9taXphdGlvbiwgdHlwZSBTbmFwc2hvdCwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRlcm1pbmFsU3RhdGUsIHR5cGUgVGV4dFJhbmdlLFxuXHR0eXBlIFRvb2xBbm5vdGF0aW9ucyxcblx0dHlwZSBUb29sQ2FsbENhbmNlbGxlZFN0YXRlLFxuXHR0eXBlIFRvb2xDYWxsQ29tcGxldGVkU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxQZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxSZXNwb25zZVBhcnQsXG5cdHR5cGUgVG9vbENhbGxSZXN1bHQsXG5cdHR5cGUgVG9vbENhbGxSaXNrQXNzZXNzbWVudCxcblx0dHlwZSBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50Q29tcGxldGVTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50TG9hZGluZ1N0YXRlLFxuXHR0eXBlIFRvb2xDYWxsUnVubmluZ1N0YXRlLFxuXHR0eXBlIFRvb2xDYWxsU3RhdGUsXG5cdHR5cGUgVG9vbENhbGxTdHJlYW1pbmdTdGF0ZSxcblx0dHlwZSBUb29sQ2FsbENvbnRyaWJ1dG9yLFxuXHR0eXBlIFRvb2xEZWZpbml0aW9uLCB0eXBlIFRvb2xJbnB1dCwgdHlwZSBUb29sUmVzdWx0Q29udGVudCxcblx0dHlwZSBUb29sUmVzdWx0RmlsZUVkaXRDb250ZW50LFxuXHR0eXBlIFRlcm1pbmFsQ29tbWFuZFJlc3VsdCxcblx0dHlwZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50LFxuXHR0eXBlIFRvb2xSZXN1bHRUZXJtaW5hbENvbnRlbnQsXG5cdHR5cGUgVG9vbFJlc3VsdFRleHRDb250ZW50LFxuXHR0eXBlIFR1cm4sIHR5cGUgVVJJLCB0eXBlIFVzYWdlSW5mbyxcblx0dHlwZSBNZXNzYWdlXG59IGZyb20gJy4vcHJvdG9jb2wvc3RhdGUuanMnO1xuXG4vKipcbiAqIFdlbGwta25vd24ga2V5cyB0aGF0IG1heSBhcHBlYXIgb24ge0BsaW5rIFVzYWdlSW5mby5fbWV0YX0uXG4gKiBDbGllbnRzIE1BWSByZWFkIHRoZXNlIHRvIHByb3ZpZGUgZW5oYW5jZWQgVUkgKGUuZy4gY3JlZGl0IGNvc3QgZGlzcGxheSkuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgVXNhZ2VJbmZvTWV0YSB7XG5cdC8qKiBQZXItdHVybiBjcmVkaXQgY29zdCByZXBvcnRlZCBieSB0aGUgYmFja2VuZC4gKi9cblx0Y29zdD86IG51bWJlcjtcblx0LyoqIFRoZSBjb25jcmV0ZSBtb2RlbCBzZWxlY3RlZCBieSBDb3BpbG90IEF1dG8gYW5kIHRoZSByb3V0aW5nIGV4cGxhbmF0aW9uLiAqL1xuXHRhdXRvTW9kZVJlc29sdmVkPzogSUF1dG9Nb2RlUmVzb2x2ZWRJbmZvO1xuXHQvKiogQ29waWxvdC1zcGVjaWZpYyB1c2FnZSBicmVha2Rvd24sIGluY2x1ZGluZyBuYW5vLUFJVSB0b3RhbHMuICovXG5cdGNvcGlsb3RVc2FnZT86IHtcblx0XHQvKiogVGhpcyB0dXJuJ3MgbmFuby1BSVUgY29zdC4gKi9cblx0XHR0b3RhbE5hbm9BaXU/OiBudW1iZXI7XG5cdFx0LyoqXG5cdFx0ICogVGhlIHdob2xlIHNlc3Npb24ncyBhY2N1bXVsYXRlZCBuYW5vLUFJVSBjb3N0LCBhcyByZXBvcnRlZCBieSB0aGVcblx0XHQgKiBiYWNrZW5kIHJhdGhlciB0aGFuIHN1bW1lZCBmcm9tIHRoZSB0dXJucy4gQ2xpZW50cyBTSE9VTEQgcHJlZmVyIHRoaXNcblx0XHQgKiBvdmVyIGFkZGluZyB1cCBwZXItdHVybiB0b3RhbHM6IGl0IGlzIGF1dGhvcml0YXRpdmUsIGFuZCBpdCBhbHNvXG5cdFx0ICogY292ZXJzIHdvcmsgYmlsbGVkIG91dHNpZGUgYW55IHR1cm4gKGUuZy4gYW4gb3V0LW9mLXR1cm4gY29tcGFjdGlvbikuXG5cdFx0ICovXG5cdFx0c2Vzc2lvblRvdGFsTmFub0FpdT86IG51bWJlcjtcblx0XHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xuXHR9O1xuXHQvKipcblx0ICogUGVyLWNhdGVnb3J5IGFjY291bnQgcXVvdGEgc25hcHNob3RzIHJlcG9ydGVkIGJ5IHRoZSBiYWNrZW5kIG9uIHRoZVxuXHQgKiBtb2RlbC1jYWxsIHVzYWdlIGV2ZW50LCBrZXllZCBieSBxdW90YSB0eXBlIChlLmcuIGBjaGF0YCxcblx0ICogYHByZW1pdW1faW50ZXJhY3Rpb25zYCkuIENsaWVudHMgTUFZIHVzZSB0aGVzZSB0byBrZWVwIHRoZSBhY2NvdW50IHF1b3RhXG5cdCAqIFVJIGN1cnJlbnQgd2l0aG91dCBhIHNlcGFyYXRlIHF1b3RhIGZldGNoLlxuXHQgKi9cblx0cXVvdGFTbmFwc2hvdHM/OiB7XG5cdFx0W3F1b3RhVHlwZTogc3RyaW5nXToge1xuXHRcdFx0cmVhZG9ubHkgaXNVbmxpbWl0ZWRFbnRpdGxlbWVudD86IGJvb2xlYW47XG5cdFx0XHRyZWFkb25seSBlbnRpdGxlbWVudFJlcXVlc3RzPzogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgdXNlZFJlcXVlc3RzPzogbnVtYmVyO1xuXHRcdFx0cmVhZG9ubHkgcmVtYWluaW5nUGVyY2VudGFnZT86IG51bWJlcjtcblx0XHRcdHJlYWRvbmx5IG92ZXJhZ2U/OiBudW1iZXI7XG5cdFx0XHRyZWFkb25seSBvdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YT86IGJvb2xlYW47XG5cdFx0XHQvKiogSVNPIDg2MDEgZGF0ZSB3aGVuIHRoZSBxdW90YSByZXNldHMsIGlmIGFwcGxpY2FibGUuICovXG5cdFx0XHRyZWFkb25seSByZXNldERhdGU/OiBzdHJpbmc7XG5cdFx0fSB8IHVuZGVmaW5lZDtcblx0fTtcblx0LyoqXG5cdCAqIFBlci1zb3VyY2UgY29udGV4dC13aW5kb3cgYXR0cmlidXRpb24gYnJlYWtkb3duIHJlcG9ydGVkIGJ5IHRoZSBTREsnc1xuXHQgKiBgc2Vzc2lvbi5ycGMubWV0YWRhdGEuZ2V0Q29udGV4dEF0dHJpYnV0aW9uKClgLiBQb3B1bGF0ZWQgYXN5bmNocm9ub3VzbHlcblx0ICogYWZ0ZXIgZWFjaCB1c2FnZSBldmVudCBhbmQgcGlwZWQgdG8gdGhlIGNvbnRleHQtdXNhZ2Ugd2lkZ2V0IGFzXG5cdCAqIGBwcm9tcHRUb2tlbkRldGFpbHNgLlxuXHQgKi9cblx0Y29udGV4dEF0dHJpYnV0aW9uPzogSUNvbnRleHRBdHRyaWJ1dGlvbkRhdGE7XG5cdC8qKlxuXHQgKiBQZXItbW9kZWwgdG9rZW4gdG90YWxzIGFjY3VtdWxhdGVkIGFjcm9zcyBldmVyeSBtb2RlbCBjYWxsIGluIHRoZSB0dXJuLFxuXHQgKiBpbmNsdWRpbmcgY2FsbHMgbWFkZSBieSBzdWJhZ2VudHMgYW5kIHRoZSBzdW1tYXJpemF0aW9uIGNhbGwgYSBjb21wYWN0aW9uXG5cdCAqIHBlcmZvcm1zLiBVbmxpa2Uge0BsaW5rIFVzYWdlSW5mby5pbnB1dFRva2Vuc30sIHdoaWNoIGRlc2NyaWJlcyBvbmx5IHRoZVxuXHQgKiBtb3N0IHJlY2VudCBtb2RlbCBjYWxsLCB0aGVzZSBhcmUgd2hvbGUtdHVybiBzdW1zLCBzbyBjbGllbnRzIGNhbiByZXBvcnRcblx0ICogd2hhdCBhIGNvbXBsZXRlZCB0dXJuIGNvbnN1bWVkIGluIGFnZ3JlZ2F0ZS5cblx0ICovXG5cdHR1cm5Ub2tlblRvdGFscz86IHJlYWRvbmx5IElUdXJuVG9rZW5Ub3RhbFtdO1xuXHRba2V5OiBzdHJpbmddOiB1bmtub3duO1xufVxuXG5jb25zdCBNRVNTQUdFX0hJRERFTl9GUk9NX1RSQU5TQ1JJUFRfTUVUQV9LRVkgPSAndnNjb2RlLmNoYXQuaGlkZGVuRnJvbVRyYW5zY3JpcHQnO1xuY29uc3QgTUVTU0FHRV9ISURERU5fRlJPTV9UUkFOU0NSSVBUX1BSRUZJWCA9ICc8IS0tIHZzY29kZS1oaWRkZW4tZnJvbS10cmFuc2NyaXB0IC0tPlxcbic7XG5cbmZ1bmN0aW9uIHJlYWRNZXNzYWdlTWV0YShtZXNzYWdlOiBNZXNzYWdlKTogeyByZWFkb25seSBoaWRkZW5Gcm9tVHJhbnNjcmlwdDogYm9vbGVhbiB9IHtcblx0Y29uc3QgbWV0YSA9IG1lc3NhZ2UuX21ldGE7XG5cdHJldHVybiB7XG5cdFx0aGlkZGVuRnJvbVRyYW5zY3JpcHQ6IG1ldGE/LltNRVNTQUdFX0hJRERFTl9GUk9NX1RSQU5TQ1JJUFRfTUVUQV9LRVldID09PSB0cnVlLFxuXHR9O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNNZXNzYWdlSGlkZGVuRnJvbVRyYW5zY3JpcHQobWVzc2FnZTogTWVzc2FnZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcmVhZE1lc3NhZ2VNZXRhKG1lc3NhZ2UpLmhpZGRlbkZyb21UcmFuc2NyaXB0XG5cdFx0fHwgbWVzc2FnZS50ZXh0LnN0YXJ0c1dpdGgoTUVTU0FHRV9ISURERU5fRlJPTV9UUkFOU0NSSVBUX1BSRUZJWCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB3aXRoTWVzc2FnZUhpZGRlbkZyb21UcmFuc2NyaXB0KG1lc3NhZ2U6IE1lc3NhZ2UsIGhpZGRlbjogYm9vbGVhbiB8IHVuZGVmaW5lZCk6IE1lc3NhZ2Uge1xuXHRpZiAoIWhpZGRlbikge1xuXHRcdHJldHVybiBtZXNzYWdlO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0Li4ubWVzc2FnZSxcblx0XHR0ZXh0OiBtZXNzYWdlLnRleHQuc3RhcnRzV2l0aChNRVNTQUdFX0hJRERFTl9GUk9NX1RSQU5TQ1JJUFRfUFJFRklYKSA/IG1lc3NhZ2UudGV4dCA6IE1FU1NBR0VfSElEREVOX0ZST01fVFJBTlNDUklQVF9QUkVGSVggKyBtZXNzYWdlLnRleHQsXG5cdFx0X21ldGE6IHtcblx0XHRcdC4uLm1lc3NhZ2UuX21ldGEsXG5cdFx0XHRbTUVTU0FHRV9ISURERU5fRlJPTV9UUkFOU0NSSVBUX01FVEFfS0VZXTogdHJ1ZSxcblx0XHR9LFxuXHR9O1xufVxuXG4vKiogV2hvbGUtdHVybiB0b2tlbiBjb25zdW1wdGlvbiBhdHRyaWJ1dGVkIHRvIGEgc2luZ2xlIG1vZGVsLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVHVyblRva2VuVG90YWwge1xuXHRyZWFkb25seSBtb2RlbDogc3RyaW5nO1xuXHRyZWFkb25seSBpbnB1dFRva2VuczogbnVtYmVyO1xuXHRyZWFkb25seSBjYWNoZWRUb2tlbnM6IG51bWJlcjtcblx0cmVhZG9ubHkgb3V0cHV0VG9rZW5zOiBudW1iZXI7XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUF1dG9Nb2RlUmVzb2x2ZWRJbmZvIHtcblx0cmVhZG9ubHkgY2hvc2VuTW9kZWw6IHN0cmluZztcblx0cmVhZG9ubHkgcmVhc29uaW5nQnVja2V0PzogJ2xvdycgfCAnbWVkaXVtJyB8ICdoaWdoJztcblx0cmVhZG9ubHkgY2F0ZWdvcnlTY29yZXM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBudW1iZXIgfCB1bmRlZmluZWQ+Pjtcblx0cmVhZG9ubHkgcHJlZGljdGVkTGFiZWw/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNvbmZpZGVuY2U/OiBudW1iZXI7XG5cdHJlYWRvbmx5IGNhbmRpZGF0ZU1vZGVscz86IHJlYWRvbmx5IHN0cmluZ1tdO1xufVxuXG4vKipcbiAqIE1pcnJvcnMgdGhlIFNESydzIGBTZXNzaW9uQ29udGV4dEF0dHJpYnV0aW9uYCBzaGFwZSBcdTIwMTQgYSBmbGF0IGxpc3Qgb2ZcbiAqIHBlci1zb3VyY2UgZW50cmllcyBkZXNjcmliaW5nIHdoYXQgb2NjdXBpZXMgdGhlIHNlc3Npb24ncyBjb250ZXh0IHdpbmRvdy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQ29udGV4dEF0dHJpYnV0aW9uRGF0YSB7XG5cdHJlYWRvbmx5IHRvdGFsVG9rZW5zOiBudW1iZXI7XG5cdHJlYWRvbmx5IGVudHJpZXM6IHJlYWRvbmx5IElDb250ZXh0QXR0cmlidXRpb25FbnRyeVtdO1xuXHRyZWFkb25seSBjb21wYWN0aW9uczogeyByZWFkb25seSBjb3VudDogbnVtYmVyIH07XG59XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNvbnRleHRBdHRyaWJ1dGlvbkVudHJ5IHtcblx0cmVhZG9ubHkga2luZDogc3RyaW5nO1xuXHRyZWFkb25seSBpZDogc3RyaW5nO1xuXHRyZWFkb25seSBsYWJlbDogc3RyaW5nO1xuXHRyZWFkb25seSB0b2tlbnM6IG51bWJlcjtcblx0cmVhZG9ubHkgcGFyZW50SWQ/OiBzdHJpbmc7XG5cdHJlYWRvbmx5IGF0dHJpYnV0ZXM/OiBSZWFkb25seTxSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCB1bmRlZmluZWQ+Pjtcbn1cblxudHlwZSBBY2NvdW50UXVvdGFTbmFwc2hvdCA9IE5vbk51bGxhYmxlPE5vbk51bGxhYmxlPFVzYWdlSW5mb01ldGFbJ3F1b3RhU25hcHNob3RzJ10+W3N0cmluZ10+O1xuXG5mdW5jdGlvbiByZWFkQWNjb3VudFF1b3RhU25hcHNob3QodmFsdWU6IHVua25vd24pOiBBY2NvdW50UXVvdGFTbmFwc2hvdCB8IHVuZGVmaW5lZCB7XG5cdGlmICghdmFsdWUgfHwgdHlwZW9mIHZhbHVlICE9PSAnb2JqZWN0JyB8fCBBcnJheS5pc0FycmF5KHZhbHVlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmF3ID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGNvbnN0IHNuYXBzaG90OiBNdXRhYmxlPEFjY291bnRRdW90YVNuYXBzaG90PiA9IHt9O1xuXHRpZiAodHlwZW9mIHJhd1snaXNVbmxpbWl0ZWRFbnRpdGxlbWVudCddID09PSAnYm9vbGVhbicpIHsgc25hcHNob3QuaXNVbmxpbWl0ZWRFbnRpdGxlbWVudCA9IHJhd1snaXNVbmxpbWl0ZWRFbnRpdGxlbWVudCddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydlbnRpdGxlbWVudFJlcXVlc3RzJ10gPT09ICdudW1iZXInKSB7IHNuYXBzaG90LmVudGl0bGVtZW50UmVxdWVzdHMgPSByYXdbJ2VudGl0bGVtZW50UmVxdWVzdHMnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1sndXNlZFJlcXVlc3RzJ10gPT09ICdudW1iZXInKSB7IHNuYXBzaG90LnVzZWRSZXF1ZXN0cyA9IHJhd1sndXNlZFJlcXVlc3RzJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ3JlbWFpbmluZ1BlcmNlbnRhZ2UnXSA9PT0gJ251bWJlcicpIHsgc25hcHNob3QucmVtYWluaW5nUGVyY2VudGFnZSA9IHJhd1sncmVtYWluaW5nUGVyY2VudGFnZSddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydvdmVyYWdlJ10gPT09ICdudW1iZXInKSB7IHNuYXBzaG90Lm92ZXJhZ2UgPSByYXdbJ292ZXJhZ2UnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snb3ZlcmFnZUFsbG93ZWRXaXRoRXhoYXVzdGVkUXVvdGEnXSA9PT0gJ2Jvb2xlYW4nKSB7IHNuYXBzaG90Lm92ZXJhZ2VBbGxvd2VkV2l0aEV4aGF1c3RlZFF1b3RhID0gcmF3WydvdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydyZXNldERhdGUnXSA9PT0gJ3N0cmluZycpIHsgc25hcHNob3QucmVzZXREYXRlID0gcmF3WydyZXNldERhdGUnXTsgfVxuXHRyZXR1cm4gc25hcHNob3Q7XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHdlbGwta25vd24ge0BsaW5rIFVzYWdlSW5mb01ldGF9IGtleXMgZnJvbSBhIHVzYWdlIHJlcG9ydCdzIG9wZW5cbiAqIGBfbWV0YWAgYmFnLCBpZ25vcmluZyB1bnJlbGF0ZWQgcHJvdmlkZXItc3BlY2lmaWMga2V5cyBhbmQgdmFsaWRhdGluZyBlYWNoXG4gKiBmaWVsZCdzIHR5cGUuIEFsd2F5cyByZWFkIHtAbGluayBVc2FnZUluZm8uX21ldGF9IHRocm91Z2ggdGhpcyBoZWxwZXIgcmF0aGVyXG4gKiB0aGFuIGNhc3RpbmcgdGhlIGJhZyB0byB7QGxpbmsgVXNhZ2VJbmZvTWV0YX0sIHNvIGEgbWFsZm9ybWVkIG9yIHBhcnRpYWwgYmFnXG4gKiBkZWdyYWRlcyB0byBhYnNlbnQgZmllbGRzIGluc3RlYWQgb2YgcHJvZHVjaW5nIHZhbHVlcyBvZiB0aGUgd3JvbmcgcnVudGltZVxuICogdHlwZS4gUmV0dXJucyBhbiBlbXB0eSBvYmplY3Qgd2hlbiB0aGUgYmFnIGlzIGFic2VudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQpOiBVc2FnZUluZm9NZXRhIHtcblx0Y29uc3QgbWV0YSA9IHVzYWdlPy5fbWV0YTtcblx0aWYgKCFtZXRhKSB7XG5cdFx0cmV0dXJuIHt9O1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogTXV0YWJsZTxVc2FnZUluZm9NZXRhPiA9IHt9O1xuXHRpZiAodHlwZW9mIG1ldGFbJ2Nvc3QnXSA9PT0gJ251bWJlcicpIHsgcmVzdWx0LmNvc3QgPSBtZXRhWydjb3N0J107IH1cblx0Y29uc3QgYXV0b01vZGVSZXNvbHZlZCA9IHJlYWRBdXRvTW9kZVJlc29sdmVkSW5mbyhtZXRhWydhdXRvTW9kZVJlc29sdmVkJ10pO1xuXHRpZiAoYXV0b01vZGVSZXNvbHZlZCkgeyByZXN1bHQuYXV0b01vZGVSZXNvbHZlZCA9IGF1dG9Nb2RlUmVzb2x2ZWQ7IH1cblx0Y29uc3QgY29waWxvdFVzYWdlID0gbWV0YVsnY29waWxvdFVzYWdlJ107XG5cdGlmIChjb3BpbG90VXNhZ2UgJiYgdHlwZW9mIGNvcGlsb3RVc2FnZSA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoY29waWxvdFVzYWdlKSkge1xuXHRcdGNvbnN0IHJhd1VzYWdlID0gY29waWxvdFVzYWdlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRcdGNvbnN0IHVzYWdlOiBNdXRhYmxlPE5vbk51bGxhYmxlPFVzYWdlSW5mb01ldGFbJ2NvcGlsb3RVc2FnZSddPj4gPSB7fTtcblx0XHRpZiAodHlwZW9mIHJhd1VzYWdlWyd0b3RhbE5hbm9BaXUnXSA9PT0gJ251bWJlcicpIHsgdXNhZ2UudG90YWxOYW5vQWl1ID0gcmF3VXNhZ2VbJ3RvdGFsTmFub0FpdSddOyB9XG5cdFx0aWYgKHR5cGVvZiByYXdVc2FnZVsnc2Vzc2lvblRvdGFsTmFub0FpdSddID09PSAnbnVtYmVyJykgeyB1c2FnZS5zZXNzaW9uVG90YWxOYW5vQWl1ID0gcmF3VXNhZ2VbJ3Nlc3Npb25Ub3RhbE5hbm9BaXUnXTsgfVxuXHRcdHJlc3VsdC5jb3BpbG90VXNhZ2UgPSB1c2FnZTtcblx0fVxuXHRjb25zdCBxdW90YVNuYXBzaG90cyA9IG1ldGFbJ3F1b3RhU25hcHNob3RzJ107XG5cdGlmIChxdW90YVNuYXBzaG90cyAmJiB0eXBlb2YgcXVvdGFTbmFwc2hvdHMgPT09ICdvYmplY3QnICYmICFBcnJheS5pc0FycmF5KHF1b3RhU25hcHNob3RzKSkge1xuXHRcdGNvbnN0IHNuYXBzaG90czogTXV0YWJsZTxOb25OdWxsYWJsZTxVc2FnZUluZm9NZXRhWydxdW90YVNuYXBzaG90cyddPj4gPSB7fTtcblx0XHRmb3IgKGNvbnN0IFtxdW90YVR5cGUsIHZhbHVlXSBvZiBPYmplY3QuZW50cmllcyhxdW90YVNuYXBzaG90cyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdHNuYXBzaG90c1txdW90YVR5cGVdID0gcmVhZEFjY291bnRRdW90YVNuYXBzaG90KHZhbHVlKTtcblx0XHR9XG5cdFx0cmVzdWx0LnF1b3RhU25hcHNob3RzID0gc25hcHNob3RzO1xuXHR9XG5cdGNvbnN0IGNvbnRleHRBdHRyaWJ1dGlvbiA9IHJlYWRDb250ZXh0QXR0cmlidXRpb24obWV0YVsnY29udGV4dEF0dHJpYnV0aW9uJ10pO1xuXHRpZiAoY29udGV4dEF0dHJpYnV0aW9uKSB7XG5cdFx0cmVzdWx0LmNvbnRleHRBdHRyaWJ1dGlvbiA9IGNvbnRleHRBdHRyaWJ1dGlvbjtcblx0fVxuXHRjb25zdCB0dXJuVG9rZW5Ub3RhbHMgPSByZWFkVHVyblRva2VuVG90YWxzKG1ldGFbJ3R1cm5Ub2tlblRvdGFscyddKTtcblx0aWYgKHR1cm5Ub2tlblRvdGFscykge1xuXHRcdHJlc3VsdC50dXJuVG9rZW5Ub3RhbHMgPSB0dXJuVG9rZW5Ub3RhbHM7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZWFkcyB3aG9sZS10dXJuIHBlci1tb2RlbCB0b2tlbiB0b3RhbHMsIGRyb3BwaW5nIHJvd3MgdGhhdCBhcmUgbm90IGZ1bGx5XG4gKiBmb3JtZWQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiBubyB1c2FibGUgcm93IHN1cnZpdmVzLCBzbyBjYWxsZXJzIGNhbiB0cmVhdFxuICogXCJhYnNlbnRcIiBhbmQgXCJwcmVzZW50IGJ1dCBtZWFuaW5nbGVzc1wiIGlkZW50aWNhbGx5LlxuICovXG5mdW5jdGlvbiByZWFkVHVyblRva2VuVG90YWxzKHZhbHVlOiB1bmtub3duKTogcmVhZG9ubHkgSVR1cm5Ub2tlblRvdGFsW10gfCB1bmRlZmluZWQge1xuXHRpZiAoIUFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB0b3RhbHM6IElUdXJuVG9rZW5Ub3RhbFtdID0gW107XG5cdGZvciAoY29uc3QgaXRlbSBvZiB2YWx1ZSkge1xuXHRcdGlmICghaXRlbSB8fCB0eXBlb2YgaXRlbSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheShpdGVtKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHJhdyA9IGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0aWYgKHR5cGVvZiByYXdbJ21vZGVsJ10gIT09ICdzdHJpbmcnIHx8ICFyYXdbJ21vZGVsJ11cblx0XHRcdHx8ICFpc1Rva2VuQ291bnQocmF3WydpbnB1dFRva2VucyddKVxuXHRcdFx0fHwgIWlzVG9rZW5Db3VudChyYXdbJ2NhY2hlZFRva2VucyddKVxuXHRcdFx0fHwgIWlzVG9rZW5Db3VudChyYXdbJ291dHB1dFRva2VucyddKVxuXHRcdCkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdHRvdGFscy5wdXNoKHtcblx0XHRcdG1vZGVsOiByYXdbJ21vZGVsJ10sXG5cdFx0XHRpbnB1dFRva2VuczogcmF3WydpbnB1dFRva2VucyddLFxuXHRcdFx0Y2FjaGVkVG9rZW5zOiByYXdbJ2NhY2hlZFRva2VucyddLFxuXHRcdFx0b3V0cHV0VG9rZW5zOiByYXdbJ291dHB1dFRva2VucyddLFxuXHRcdH0pO1xuXHR9XG5cdHJldHVybiB0b3RhbHMubGVuZ3RoID4gMCA/IHRvdGFscyA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gaXNUb2tlbkNvdW50KHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzU2FmZUludGVnZXIodmFsdWUpICYmIHZhbHVlID49IDA7XG59XG5cbi8qKlxuICogV2hldGhlciBhIHVzYWdlIHJlcG9ydCBhY3R1YWxseSByZWNvcmRzIGNvbnN1bXB0aW9uLCBhcyBvcHBvc2VkIHRvIG1lcmVseVxuICogZXhpc3RpbmcuXG4gKlxuICogQSB0dXJuIGNhbiBjYXJyeSBhIHRva2VuLWxlc3Mge0BsaW5rIFVzYWdlSW5mb30gdGhhdCBleGlzdHMgb25seSB0byBob2xkXG4gKiByb3V0aW5nIG1ldGFkYXRhIFx1MjAxNCBub3RhYmx5IGEgQ29waWxvdCBBdXRvIHR1cm4gcmVzdG9yZWQgZnJvbSB0aGUgZXZlbnQgbG9nLFxuICogd2hpY2gga2VlcHMgYF9tZXRhLmF1dG9Nb2RlUmVzb2x2ZWRgIGV2ZW4gdGhvdWdoIHRoZSB1c2FnZSBldmVudCBpdHNlbGYgaXNcbiAqIGVwaGVtZXJhbCBhbmQgd2FzIG5ldmVyIHBlcnNpc3RlZC4gQ2FsbGVycyB0aGF0IGFzayBcImRvZXMgdGhpcyB0dXJuIGhhdmVcbiAqIHVzYWdlP1wiIGFsbW9zdCBhbHdheXMgbWVhbiBcImRvZXMgaXQgaGF2ZSBudW1iZXJzIHRvIHNob3dcIiwgc28gcm91dGUgdGhhdFxuICogcXVlc3Rpb24gdGhyb3VnaCBoZXJlIHJhdGhlciB0aGFuIHRlc3RpbmcgdGhlIG9iamVjdCBmb3IgdHJ1dGhpbmVzcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGhhc1JlcG9ydGVkVXNhZ2UodXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIXVzYWdlKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICh0eXBlb2YgdXNhZ2UuaW5wdXRUb2tlbnMgPT09ICdudW1iZXInIHx8IHR5cGVvZiB1c2FnZS5vdXRwdXRUb2tlbnMgPT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuIHRydWU7XG5cdH1cblx0Y29uc3QgbWV0YSA9IHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKTtcblx0Ly8gTmVnYXRpdmUgdG90YWxzIGFyZSB0cmVhdGVkIGFzIGFic2VudCwgbWF0Y2hpbmcgaG93IGNyZWRpdHMgYXJlIHJlYWQgZm9yIGRpc3BsYXkuXG5cdHJldHVybiAodHlwZW9mIG1ldGEuY29waWxvdFVzYWdlPy50b3RhbE5hbm9BaXUgPT09ICdudW1iZXInICYmIG1ldGEuY29waWxvdFVzYWdlLnRvdGFsTmFub0FpdSA+PSAwKVxuXHRcdC8vIEEgcmVwb3J0IGNhbiBjYXJyeSBvbmx5IHRoZSBzZXNzaW9uIHRvdGFsIFx1MjAxNCBhIGNvbXBhY3Rpb24gYmlsbGVkIHdoaWxlIG5vIHR1cm5cblx0XHQvLyB3YXMgYWN0aXZlIGFkdmFuY2VzIGl0IHdpdGhvdXQgYW55IHBlci1ldmVudCBiaWxsaW5nIHBheWxvYWQgXHUyMDE0IGFuZCB0aGF0IGlzXG5cdFx0Ly8gc3RpbGwgY29uc3VtcHRpb24gd29ydGggc2hvd2luZy5cblx0XHR8fCAodHlwZW9mIG1ldGEuY29waWxvdFVzYWdlPy5zZXNzaW9uVG90YWxOYW5vQWl1ID09PSAnbnVtYmVyJyAmJiBtZXRhLmNvcGlsb3RVc2FnZS5zZXNzaW9uVG90YWxOYW5vQWl1ID49IDApXG5cdFx0fHwgKHR5cGVvZiBtZXRhLmNvc3QgPT09ICdudW1iZXInICYmIG1ldGEuY29zdCA+PSAwKTtcbn1cblxuZnVuY3Rpb24gcmVhZEF1dG9Nb2RlUmVzb2x2ZWRJbmZvKHZhbHVlOiB1bmtub3duKTogSUF1dG9Nb2RlUmVzb2x2ZWRJbmZvIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0aWYgKHR5cGVvZiByYXdbJ2Nob3Nlbk1vZGVsJ10gIT09ICdzdHJpbmcnKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByZXN1bHQ6IE11dGFibGU8SUF1dG9Nb2RlUmVzb2x2ZWRJbmZvPiA9IHsgY2hvc2VuTW9kZWw6IHJhd1snY2hvc2VuTW9kZWwnXSB9O1xuXHRjb25zdCByZWFzb25pbmdCdWNrZXQgPSByYXdbJ3JlYXNvbmluZ0J1Y2tldCddO1xuXHRpZiAocmVhc29uaW5nQnVja2V0ID09PSAnbG93JyB8fCByZWFzb25pbmdCdWNrZXQgPT09ICdtZWRpdW0nIHx8IHJlYXNvbmluZ0J1Y2tldCA9PT0gJ2hpZ2gnKSB7XG5cdFx0cmVzdWx0LnJlYXNvbmluZ0J1Y2tldCA9IHJlYXNvbmluZ0J1Y2tldDtcblx0fVxuXHRjb25zdCBjYXRlZ29yeVNjb3JlcyA9IHJhd1snY2F0ZWdvcnlTY29yZXMnXTtcblx0aWYgKGNhdGVnb3J5U2NvcmVzICYmIHR5cGVvZiBjYXRlZ29yeVNjb3JlcyA9PT0gJ29iamVjdCcgJiYgIUFycmF5LmlzQXJyYXkoY2F0ZWdvcnlTY29yZXMpKSB7XG5cdFx0Y29uc3Qgc2NvcmVzOiBSZWNvcmQ8c3RyaW5nLCBudW1iZXI+ID0ge307XG5cdFx0Zm9yIChjb25zdCBbY2F0ZWdvcnksIHNjb3JlXSBvZiBPYmplY3QuZW50cmllcyhjYXRlZ29yeVNjb3JlcyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPikpIHtcblx0XHRcdGlmICh0eXBlb2Ygc2NvcmUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHNjb3Jlc1tjYXRlZ29yeV0gPSBzY29yZTtcblx0XHRcdH1cblx0XHR9XG5cdFx0cmVzdWx0LmNhdGVnb3J5U2NvcmVzID0gc2NvcmVzO1xuXHR9XG5cdGlmICh0eXBlb2YgcmF3WydwcmVkaWN0ZWRMYWJlbCddID09PSAnc3RyaW5nJykgeyByZXN1bHQucHJlZGljdGVkTGFiZWwgPSByYXdbJ3ByZWRpY3RlZExhYmVsJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2NvbmZpZGVuY2UnXSA9PT0gJ251bWJlcicpIHsgcmVzdWx0LmNvbmZpZGVuY2UgPSByYXdbJ2NvbmZpZGVuY2UnXTsgfVxuXHRpZiAoQXJyYXkuaXNBcnJheShyYXdbJ2NhbmRpZGF0ZU1vZGVscyddKSAmJiByYXdbJ2NhbmRpZGF0ZU1vZGVscyddLmV2ZXJ5KGNhbmRpZGF0ZSA9PiB0eXBlb2YgY2FuZGlkYXRlID09PSAnc3RyaW5nJykpIHtcblx0XHRyZXN1bHQuY2FuZGlkYXRlTW9kZWxzID0gcmF3WydjYW5kaWRhdGVNb2RlbHMnXTtcblx0fVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG5mdW5jdGlvbiByZWFkQ29udGV4dEF0dHJpYnV0aW9uKHZhbHVlOiB1bmtub3duKTogSUNvbnRleHRBdHRyaWJ1dGlvbkRhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRpZiAodHlwZW9mIHJhd1sndG90YWxUb2tlbnMnXSAhPT0gJ251bWJlcicgfHwgIUFycmF5LmlzQXJyYXkocmF3WydlbnRyaWVzJ10pKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBlbnRyaWVzOiBJQ29udGV4dEF0dHJpYnV0aW9uRW50cnlbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGl0ZW0gb2YgcmF3WydlbnRyaWVzJ10pIHtcblx0XHRpZiAoIWl0ZW0gfHwgdHlwZW9mIGl0ZW0gIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkoaXRlbSkpIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBlbnRyeSA9IGl0ZW0gYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdFx0aWYgKHR5cGVvZiBlbnRyeVsna2luZCddICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgZW50cnlbJ2lkJ10gIT09ICdzdHJpbmcnXG5cdFx0XHR8fCB0eXBlb2YgZW50cnlbJ2xhYmVsJ10gIT09ICdzdHJpbmcnIHx8IHR5cGVvZiBlbnRyeVsndG9rZW5zJ10gIT09ICdudW1iZXInKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0ZW50cmllcy5wdXNoKHtcblx0XHRcdGtpbmQ6IGVudHJ5WydraW5kJ10sXG5cdFx0XHRpZDogZW50cnlbJ2lkJ10sXG5cdFx0XHRsYWJlbDogZW50cnlbJ2xhYmVsJ10sXG5cdFx0XHR0b2tlbnM6IGVudHJ5Wyd0b2tlbnMnXSxcblx0XHRcdHBhcmVudElkOiB0eXBlb2YgZW50cnlbJ3BhcmVudElkJ10gPT09ICdzdHJpbmcnID8gZW50cnlbJ3BhcmVudElkJ10gOiB1bmRlZmluZWQsXG5cdFx0XHRhdHRyaWJ1dGVzOiBlbnRyeVsnYXR0cmlidXRlcyddICYmIHR5cGVvZiBlbnRyeVsnYXR0cmlidXRlcyddID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShlbnRyeVsnYXR0cmlidXRlcyddKVxuXHRcdFx0XHQ/IGZpbHRlclN0cmluZ0F0dHJpYnV0ZXMoZW50cnlbJ2F0dHJpYnV0ZXMnXSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilcblx0XHRcdFx0OiB1bmRlZmluZWQsXG5cdFx0fSk7XG5cdH1cblx0Y29uc3QgY29tcGFjdGlvbnNSYXcgPSByYXdbJ2NvbXBhY3Rpb25zJ107XG5cdGNvbnN0IGNvbXBhY3Rpb25zID0gY29tcGFjdGlvbnNSYXcgJiYgdHlwZW9mIGNvbXBhY3Rpb25zUmF3ID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShjb21wYWN0aW9uc1Jhdylcblx0XHQmJiB0eXBlb2YgKGNvbXBhY3Rpb25zUmF3IGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+KVsnY291bnQnXSA9PT0gJ251bWJlcidcblx0XHQ/IHsgY291bnQ6IChjb21wYWN0aW9uc1JhdyBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPilbJ2NvdW50J10gYXMgbnVtYmVyIH1cblx0XHQ6IHsgY291bnQ6IDAgfTtcblx0cmV0dXJuIHsgdG90YWxUb2tlbnM6IHJhd1sndG90YWxUb2tlbnMnXSBhcyBudW1iZXIsIGVudHJpZXMsIGNvbXBhY3Rpb25zIH07XG59XG5cbmZ1bmN0aW9uIGZpbHRlclN0cmluZ0F0dHJpYnV0ZXMocmF3OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPik6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4ge1xuXHRjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IHVuZGVmaW5lZD4gPSB7fTtcblx0Zm9yIChjb25zdCBba2V5LCB2YWx1ZV0gb2YgT2JqZWN0LmVudHJpZXMocmF3KSkge1xuXHRcdGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJlc3VsdFtrZXldID0gdmFsdWU7XG5cdFx0fVxuXHR9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbmV4cG9ydCB7XG5cdENoYW5nZXNldE9wZXJhdGlvblRhcmdldEtpbmQsIHR5cGUgQ2hhbmdlc2V0T3BlcmF0aW9uRm9sbG93VXAsIHR5cGUgQ2hhbmdlc2V0T3BlcmF0aW9uVGFyZ2V0XG59IGZyb20gJy4vcHJvdG9jb2wvY29tbWFuZHMuanMnO1xuXG4vLyBDYW5vbmljYWwgY2hhdC1pbnB1dCB0eXBlIG5hbWVzICh0aGUgcHJvdG9jb2wgcmVuYW1lZCB0aGUgZm9ybWVyXG4vLyBgU2Vzc2lvbklucHV0KmAgdHlwZXMgdG8gYENoYXRJbnB1dCpgIHdoZW4gaW5wdXQgcmVxdWVzdHMgbW92ZWQgb250byB0aGVcbi8vIGNoYXQgY2hhbm5lbCkuIFJlLWV4cG9ydGVkIGhlcmUgc28gY29uc3VtZXJzIGNhbiBpbXBvcnQgdGhlbSBmcm9tIHRoZSBnbHVlXG4vLyBsYXllciBhbG9uZ3NpZGUgdGhlIGxlZ2FjeSBgU2Vzc2lvbklucHV0KmAgYWxpYXNlcyBhYm92ZS5cbmV4cG9ydCB7XG5cdENoYXRJbnB1dEFuc3dlclN0YXRlLFxuXHRDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQsXG5cdENoYXRJbnB1dFF1ZXN0aW9uS2luZCxcblx0Q2hhdElucHV0UmVzcG9uc2VLaW5kLFxuXHR0eXBlIENoYXRJbnB1dEFuc3dlcixcblx0dHlwZSBDaGF0SW5wdXRPcHRpb24sXG5cdHR5cGUgQ2hhdElucHV0UXVlc3Rpb24sXG5cdHR5cGUgQ2hhdElucHV0UmVxdWVzdCxcblx0dHlwZSBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQsXG59IGZyb20gJy4vcHJvdG9jb2wvc3RhdGUuanMnO1xuXG4vLyAtLS0tIEZpbGUgZWRpdCBraW5kIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFRoZSBraW5kIG9mIGZpbGUgZWRpdCBvcGVyYXRpb24uIERlcml2ZWQgZnJvbSB0aGUgcHJlc2VuY2UvYWJzZW5jZSBvZlxuICogYGJlZm9yZWAvYGFmdGVyYCBpbiB7QGxpbmsgVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudH0uXG4gKi9cbmV4cG9ydCBjb25zdCBlbnVtIEZpbGVFZGl0S2luZCB7XG5cdC8qKiBDb250ZW50IGVkaXQgKHNhbWUgZmlsZSBVUkksIGRpZmZlcmVudCBjb250ZW50KS4gKi9cblx0RWRpdCA9ICdlZGl0Jyxcblx0LyoqIEZpbGUgY3JlYXRpb24gKG5vIGJlZm9yZSBzdGF0ZSkuICovXG5cdENyZWF0ZSA9ICdjcmVhdGUnLFxuXHQvKiogRmlsZSBkZWxldGlvbiAobm8gYWZ0ZXIgc3RhdGUpLiAqL1xuXHREZWxldGUgPSAnZGVsZXRlJyxcblx0LyoqIEZpbGUgcmVuYW1lL21vdmUgKGRpZmZlcmVudCBiZWZvcmUgYW5kIGFmdGVyIFVSSXMpLiAqL1xuXHRSZW5hbWUgPSAncmVuYW1lJyxcbn1cblxuLy8gLS0tLSBXZWxsLWtub3duIFVSSXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqIFVSSSBmb3IgdGhlIHJvb3Qgc3RhdGUgc3Vic2NyaXB0aW9uLiAqL1xuZXhwb3J0IGNvbnN0IFJPT1RfU1RBVEVfVVJJID0gJ2FocC1yb290Oi8vJztcblxuLyoqIFNjaGVtZSB1c2VkIGJ5IHtAbGluayBST09UX1NUQVRFX1VSSX0uICovXG5leHBvcnQgY29uc3QgQUhQX1JPT1RfU0NIRU1FID0gJ2FocC1yb290JztcblxuLyoqIFNjaGVtZSB1c2VkIGJ5IHJlc291cmNlLXdhdGNoIGNoYW5uZWwgVVJJcyAoYGFocC1yZXNvdXJjZS13YXRjaDovPGVuY29kZWQ+YCkuICovXG5leHBvcnQgY29uc3QgQUhQX1JFU09VUkNFX1dBVENIX1NDSEVNRSA9ICdhaHAtcmVzb3VyY2Utd2F0Y2gnO1xuXG4vKipcbiAqIEVuY29kZSBhIHJlc291cmNlLXdhdGNoIGRlc2NyaXB0b3IgaW50byBpdHMgY2Fub25pY2FsIGNoYW5uZWwgVVJJLiBUaGVcbiAqIGRlc2NyaXB0b3IgaXMgc2VyaWFsaXNlZCBpbnRvIHRoZSBVUkkgcGF0aCBzbyB0aGUgcmVjZWl2ZXIgY2FuIHJlY292ZXJcbiAqIHRoZSB3YXRjaCBwYXJhbWV0ZXJzIHdpdGhvdXQgYW55IHNlcnZlci1zaWRlIGJvb2trZWVwaW5nIFx1MjAxNCBzdWJzY3JpYmUgaXNcbiAqIHRoZSBvbmx5IHBvaW50IHdoZXJlIHN0YXRlIGlzIG1hdGVyaWFsaXNlZCAoYW4gYElGaWxlU2VydmljZWAgd2F0Y2hlclxuICogaXMgYXR0YWNoZWQgb24gdGhlIGZpcnN0IHN1YnNjcmliZXIgYW5kIGhlbGQgdGhyb3VnaCBhIGdyYWNlIHdpbmRvd1xuICogYWZ0ZXIgdGhlIGxhc3QgZHJvcHMpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRSZXNvdXJjZVdhdGNoQ2hhbm5lbFVyaShkZXNjcmlwdG9yOiB7XG5cdHJlYWRvbmx5IHJvb3Q6IHN0cmluZztcblx0cmVhZG9ubHkgcmVjdXJzaXZlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgZXhjbHVkZXM/OiB7IGl0ZW1zOiByZWFkb25seSBzdHJpbmdbXSB9O1xuXHRyZWFkb25seSBpbmNsdWRlcz86IHsgaXRlbXM6IHJlYWRvbmx5IHN0cmluZ1tdIH07XG59KTogc3RyaW5nIHtcblx0Y29uc3QgcGF5bG9hZDogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSB7IHJvb3Q6IGRlc2NyaXB0b3Iucm9vdCB9O1xuXHRpZiAoZGVzY3JpcHRvci5yZWN1cnNpdmUpIHsgcGF5bG9hZC5yZWN1cnNpdmUgPSB0cnVlOyB9XG5cdGlmIChkZXNjcmlwdG9yLmV4Y2x1ZGVzICYmIGRlc2NyaXB0b3IuZXhjbHVkZXMuaXRlbXMubGVuZ3RoID4gMCkge1xuXHRcdHBheWxvYWQuZXhjbHVkZXMgPSBbLi4uZGVzY3JpcHRvci5leGNsdWRlcy5pdGVtc107XG5cdH1cblx0aWYgKGRlc2NyaXB0b3IuaW5jbHVkZXMgJiYgZGVzY3JpcHRvci5pbmNsdWRlcy5pdGVtcy5sZW5ndGggPiAwKSB7XG5cdFx0cGF5bG9hZC5pbmNsdWRlcyA9IFsuLi5kZXNjcmlwdG9yLmluY2x1ZGVzLml0ZW1zXTtcblx0fVxuXG5cdGNvbnN0IGpzb24gPSBlbmNvZGVCYXNlNjQoVlNCdWZmZXIuZnJvbVN0cmluZyhKU09OLnN0cmluZ2lmeShwYXlsb2FkKSksIGZhbHNlLCB0cnVlKTtcblx0cmV0dXJuIGAke0FIUF9SRVNPVVJDRV9XQVRDSF9TQ0hFTUV9Oi8vci8ke2pzb259YDtcbn1cblxuLyoqXG4gKiBJbnZlcnNlIG9mIHtAbGluayBidWlsZFJlc291cmNlV2F0Y2hDaGFubmVsVXJpfS4gUmV0dXJucyBgdW5kZWZpbmVkYCBpZlxuICogYHVyaWAgaXMgbm90IGEgd2VsbC1mb3JtZWQgYGFocC1yZXNvdXJjZS13YXRjaDpgIFVSSSBcdTIwMTQgY2FsbGVycyBzaG91bGRcbiAqIHN1cmZhY2UgdGhhdCBhcyBhIG5vdC1mb3VuZCBlcnJvciB0byB0aGUgY2xpZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VSZXNvdXJjZVdhdGNoQ2hhbm5lbFVyaSh1cmk6IHN0cmluZyk6IHtcblx0cm9vdDogc3RyaW5nO1xuXHRyZWN1cnNpdmU6IGJvb2xlYW47XG5cdGV4Y2x1ZGVzPzogeyBpdGVtczogc3RyaW5nW10gfTtcblx0aW5jbHVkZXM/OiB7IGl0ZW1zOiBzdHJpbmdbXSB9O1xufSB8IHVuZGVmaW5lZCB7XG5cdGxldCBwYXJzZWQ6IFJlc291cmNlVVJJO1xuXHR0cnkge1xuXHRcdHBhcnNlZCA9IFJlc291cmNlVVJJLnBhcnNlKHVyaSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHBhcnNlZC5zY2hlbWUgIT09IEFIUF9SRVNPVVJDRV9XQVRDSF9TQ0hFTUUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGVuY29kZWQgPSBwYXJzZWQucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpO1xuXHRpZiAoIWVuY29kZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGF5bG9hZCA9IEpTT04ucGFyc2UoZGVjb2RlQmFzZTY0KGVuY29kZWQpLnRvU3RyaW5nKCkpIGFzIHsgcm9vdD86IHVua25vd247IHJlY3Vyc2l2ZT86IHVua25vd247IGV4Y2x1ZGVzPzogdW5rbm93bjsgaW5jbHVkZXM/OiB1bmtub3duIH07XG5cdFx0aWYgKHR5cGVvZiBwYXlsb2FkLnJvb3QgIT09ICdzdHJpbmcnKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdHJldHVybiB7XG5cdFx0XHRyb290OiBwYXlsb2FkLnJvb3QsXG5cdFx0XHRyZWN1cnNpdmU6IHBheWxvYWQucmVjdXJzaXZlID09PSB0cnVlLFxuXHRcdFx0Li4uKEFycmF5LmlzQXJyYXkocGF5bG9hZC5leGNsdWRlcykgPyB7IGV4Y2x1ZGVzOiB7IGl0ZW1zOiBwYXlsb2FkLmV4Y2x1ZGVzLmZpbHRlcigoeCk6IHggaXMgc3RyaW5nID0+IHR5cGVvZiB4ID09PSAnc3RyaW5nJykgfSB9IDoge30pLFxuXHRcdFx0Li4uKEFycmF5LmlzQXJyYXkocGF5bG9hZC5pbmNsdWRlcykgPyB7IGluY2x1ZGVzOiB7IGl0ZW1zOiBwYXlsb2FkLmluY2x1ZGVzLmZpbHRlcigoeCk6IHggaXMgc3RyaW5nID0+IHR5cGVvZiB4ID09PSAnc3RyaW5nJykgfSB9IDoge30pLFxuXHRcdH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqIFJldHVybnMgYHRydWVgIHdoZW4gYHVyaWAgaWRlbnRpZmllcyBhIHJlc291cmNlLXdhdGNoIGNoYW5uZWwuICovXG5leHBvcnQgZnVuY3Rpb24gaXNBaHBSZXNvdXJjZVdhdGNoQ2hhbm5lbCh1cmk6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHR0cnkge1xuXHRcdHJldHVybiBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpLnNjaGVtZSA9PT0gQUhQX1JFU09VUkNFX1dBVENIX1NDSEVNRTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG59XG5cbi8qKlxuICogUmV0dXJucyBgdHJ1ZWAgd2hlbiBgdXJpYCBpZGVudGlmaWVzIHRoZSByb290IGNoYW5uZWwsIHJlZ2FyZGxlc3Mgb2ZcbiAqIHdoZXRoZXIgdGhlIGNhbGxlciBwYXNzZXMgdGhlIGNhbm9uaWNhbCB3aXJlIGZvcm0gKGAnYWhwLXJvb3Q6Ly8nYCkgb3IgYVxuICogdmFyaWFudCB0aGF0IGhhcyBiZWVuIHJvdW5kLXRyaXBwZWQgdGhyb3VnaCB0aGUgd29ya2JlbmNoIHtAbGluayBVUkl9IGNsYXNzXG4gKiAod2hpY2ggbm9ybWFsaXplcyB0aGUgYXV0aG9yaXR5LWxlc3MgZm9ybSB0byBgJ2FocC1yb290OidgKS4gQWx3YXlzIHByZWZlclxuICogdGhpcyBoZWxwZXIgb3ZlciBhIGRpcmVjdCBgPT09IFJPT1RfU1RBVEVfVVJJYCBjb21wYXJpc29uIHNvIHRoZSB0d29cbiAqIHNwZWxsaW5ncyBzdGF5IGludGVyY2hhbmdlYWJsZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzQWhwUm9vdENoYW5uZWwodXJpOiBzdHJpbmcpOiBib29sZWFuIHtcblx0aWYgKHVyaSA9PT0gUk9PVF9TVEFURV9VUkkpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHR0cnkge1xuXHRcdHJldHVybiBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpLnNjaGVtZSA9PT0gQUhQX1JPT1RfU0NIRU1FO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cbn1cblxuLyoqXG4gKiBNaW50cyBhIHNlc3Npb24tdW5pcXVlIG9wYXF1ZSBpZCBmb3IgYSBjdXN0b21pemF0aW9uLCBkZXJpdmVkIGZyb20gaXRzXG4gKiBzb3VyY2UgVVJJIGFuZCAod2hlbiBwcmVzZW50KSBpdHMgYHJhbmdlYCB3aXRoaW4gdGhlIHNvdXJjZS4gUGx1Z2lucyBNQVlcbiAqIGRlY2xhcmUgbXVsdGlwbGUgY2hpbGRyZW4gKGUuZy4gTUNQIHNlcnZlcnMsIGhvb2tzKSBpbnNpZGUgdGhlIHNhbWVcbiAqIG1hbmlmZXN0IGZpbGU7IGluY2x1ZGluZyB0aGUgcmFuZ2UgZGlzYW1iaWd1YXRlcyB0aGVtIHdpdGhvdXQgYW4gZXh0cmFcbiAqIG1hcHBpbmcgdGFibGUuXG4gKlxuICogVGhlIHJhbmdlIGlzIGFwcGVuZGVkIGFzIGEgcmVzZXJ2ZWQgYCNyYW5nZT1gIHF1ZXJ5LXN0eWxlIHN1ZmZpeDsgYW55XG4gKiBleGlzdGluZyBgI2AgaW4gdGhlIFVSSSBpcyBwZXJjZW50LWVuY29kZWQgZmlyc3Qgc28gYSBzb3VyY2UgVVJJIHRoYXRcbiAqIGFscmVhZHkgY29udGFpbnMgYSBmcmFnbWVudCBjYW5ub3QgY29sbGlkZSB3aXRoIGEgcmFuZ2VkIGlkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY3VzdG9taXphdGlvbklkKHVyaTogc3RyaW5nLCByYW5nZT86IFRleHRSYW5nZSk6IHN0cmluZyB7XG5cdGlmICghcmFuZ2UpIHtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cdGNvbnN0IHNhZmVVcmkgPSB1cmkucmVwbGFjZSgvIy9nLCAnJTIzJyk7XG5cdHJldHVybiBgJHtzYWZlVXJpfSNyYW5nZT0ke3JhbmdlLnN0YXJ0LmxpbmV9OiR7cmFuZ2Uuc3RhcnQuY2hhcmFjdGVyfS0ke3JhbmdlLmVuZC5saW5lfToke3JhbmdlLmVuZC5jaGFyYWN0ZXJ9YDtcbn1cblxuLy8gLS0tLSBWUyBDb2RlLXNwZWNpZmljIGRlcml2ZWQgdHlwZXMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBBIHRvb2wgY2FsbCBpbiBhIHRlcm1pbmFsIHN0YXRlLCBzdG9yZWQgaW4gY29tcGxldGVkIHR1cm5zLlxuICovXG5leHBvcnQgdHlwZSBJQ29tcGxldGVkVG9vbENhbGwgPSBUb29sQ2FsbENvbXBsZXRlZFN0YXRlIHwgVG9vbENhbGxDYW5jZWxsZWRTdGF0ZTtcblxuLyoqXG4gKiBEZXJpdmVkIHN0YXR1cyB0eXBlIGZvciB0aGUgdG9vbCBjYWxsIGxpZmVjeWNsZS5cbiAqL1xuZXhwb3J0IHR5cGUgVG9vbENhbGxTdGF0dXNTdHJpbmcgPSBUb29sQ2FsbFN0YXRlWydzdGF0dXMnXTtcblxuLy8gLS0tLSBUb29sIG91dHB1dCBoZWxwZXIgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuLyoqXG4gKiBFeHRyYWN0cyBhIHBsYWluLXRleHQgdG9vbCBvdXRwdXQgc3RyaW5nIGZyb20gYSB0b29sIGNhbGwgcmVzdWx0J3MgYGNvbnRlbnRgXG4gKiBhcnJheS4gSm9pbnMgYWxsIHRleHQtdHlwZSBjb250ZW50IHBhcnRzIGludG8gYSBzaW5nbGUgc3RyaW5nLlxuICpcbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlcmUgYXJlIG5vIHRleHQgY29udGVudCBwYXJ0cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldFRvb2xPdXRwdXRUZXh0KHJlc3VsdDogVG9vbENhbGxSZXN1bHQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlc3VsdC5jb250ZW50IHx8IHJlc3VsdC5jb250ZW50Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB0ZXh0UGFydHM6IFRvb2xSZXN1bHRUZXh0Q29udGVudFtdID0gW107XG5cdGZvciAoY29uc3QgYyBvZiByZXN1bHQuY29udGVudCkge1xuXHRcdGlmIChoYXNLZXkoYywgeyB0eXBlOiB0cnVlIH0pICYmIGMudHlwZSA9PT0gVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQpIHtcblx0XHRcdHRleHRQYXJ0cy5wdXNoKGMpO1xuXHRcdH1cblx0fVxuXHRpZiAodGV4dFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHRleHRQYXJ0cy5tYXAocCA9PiBwLnRleHQpLmpvaW4oJ1xcbicpO1xufVxuXG4vKiogUmV0dXJucyBpbmxpbmUgdG9vbCBpbnB1dCwgbGVhdmluZyByZWZlcmVuY2VkIGNvbnRlbnQgdG8gYXN5bmNocm9ub3VzIGNvbnN1bWVycy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRJbmxpbmVUb29sSW5wdXQodG9vbElucHV0OiBUb29sSW5wdXQgfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gdHlwZW9mIHRvb2xJbnB1dCA9PT0gJ3N0cmluZycgPyB0b29sSW5wdXQgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgZmlsZSBlZGl0IGNvbnRlbnQgZW50cmllcyBmcm9tIGEgdG9vbCBjYWxsIHJlc3VsdCdzIGBjb250ZW50YCBhcnJheS5cbiAqIFJldHVybnMgYW4gZW1wdHkgYXJyYXkgaWYgdGhlcmUgYXJlIG5vIGZpbGUgZWRpdCBjb250ZW50IHBhcnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9vbEZpbGVFZGl0cyhyZXN1bHQ6IFRvb2xDYWxsUmVzdWx0KTogVG9vbFJlc3VsdEZpbGVFZGl0Q29udGVudFtdIHtcblx0aWYgKCFyZXN1bHQuY29udGVudCB8fCByZXN1bHQuY29udGVudC5sZW5ndGggPT09IDApIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgZWRpdHM6IFRvb2xSZXN1bHRGaWxlRWRpdENvbnRlbnRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGMgb2YgcmVzdWx0LmNvbnRlbnQpIHtcblx0XHRpZiAoaGFzS2V5KGMsIHsgdHlwZTogdHJ1ZSB9KSAmJiBjLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5GaWxlRWRpdCkge1xuXHRcdFx0ZWRpdHMucHVzaChjKTtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGVkaXRzO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSBmaXJzdCBzdWJhZ2VudCBjb250ZW50IGVudHJ5IGZyb20gYSB0b29sIGNhbGwncyBgY29udGVudGAgYXJyYXkuXG4gKiBXb3JrcyB3aXRoIGJvdGggY29tcGxldGVkIHRvb2wgY2FsbCByZXN1bHRzIGFuZCBydW5uaW5nIHRvb2wgY2FsbCBzdGF0ZXMuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZXJlIGFyZSBubyBzdWJhZ2VudCBjb250ZW50IHBhcnRzLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0VG9vbFN1YmFnZW50Q29udGVudChyZXN1bHQ6IHsgY29udGVudD86IHJlYWRvbmx5IFRvb2xSZXN1bHRDb250ZW50W10gfSk6IFRvb2xSZXN1bHRTdWJhZ2VudENvbnRlbnQgfCB1bmRlZmluZWQge1xuXHRpZiAoIXJlc3VsdC5jb250ZW50IHx8IHJlc3VsdC5jb250ZW50Lmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Zm9yIChjb25zdCBjIG9mIHJlc3VsdC5jb250ZW50KSB7XG5cdFx0aWYgKGhhc0tleShjLCB7IHR5cGU6IHRydWUgfSkgJiYgYy50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuU3ViYWdlbnQpIHtcblx0XHRcdHJldHVybiBjIGFzIFRvb2xSZXN1bHRTdWJhZ2VudENvbnRlbnQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8vIC0tLS0gU3ViYWdlbnQgVVJJIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbmNvbnN0IFNVQkFHRU5UX1VSSV9TRUdNRU5UID0gJ3N1YmFnZW50JztcbmNvbnN0IFNVQkFHRU5UX1VSSV9NQVJLRVIgPSBgLyR7U1VCQUdFTlRfVVJJX1NFR01FTlR9L2A7XG5jb25zdCBTVUJBR0VOVF9VUklfUEFUSF9SRUdFWCA9IC9eKD88cGFyZW50UGF0aD4uKylcXC9zdWJhZ2VudFxcLyg/PHRvb2xDYWxsSWQ+LispJC87XG5cbmZ1bmN0aW9uIGFzUmVzb3VyY2VVcmkodXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogUmVzb3VyY2VVUkkge1xuXHRyZXR1cm4gdHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpIDogdXJpO1xufVxuXG5mdW5jdGlvbiBnZXRTdWJhZ2VudEJhc2VQYXRoKHBhcmVudFNlc3Npb246IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkkpOiB7IHBhcmVudDogUmVzb3VyY2VVUkk7IHBhdGg6IHN0cmluZyB9IHtcblx0Y29uc3QgcGFyZW50ID0gYXNSZXNvdXJjZVVyaShwYXJlbnRTZXNzaW9uKTtcblx0Y29uc3QgcGFyZW50UGF0aCA9IHBhcmVudC5wYXRoLmVuZHNXaXRoKCcvJykgPyBwYXJlbnQucGF0aC5zbGljZSgwLCAtMSkgOiBwYXJlbnQucGF0aDtcblx0cmV0dXJuIHsgcGFyZW50LCBwYXRoOiBgJHtwYXJlbnRQYXRofSR7U1VCQUdFTlRfVVJJX01BUktFUn1gIH07XG59XG5cbi8qKlxuICogQnVpbGRzIGEgc3ViYWdlbnQgc2Vzc2lvbiBVUkkgZnJvbSBhIHBhcmVudCBzZXNzaW9uIFVSSSBhbmQgdG9vbCBjYWxsIElELlxuICogQ29udmVudGlvbjogYHtwYXJlbnRTZXNzaW9uVXJpfS9zdWJhZ2VudC97dG9vbENhbGxJZH1gXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN1YmFnZW50U2Vzc2lvblVyaShwYXJlbnRTZXNzaW9uOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJLCB0b29sQ2FsbElkOiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCB7IHBhcmVudCwgcGF0aCB9ID0gZ2V0U3ViYWdlbnRCYXNlUGF0aChwYXJlbnRTZXNzaW9uKTtcblx0cmV0dXJuIHBhcmVudC53aXRoKHsgcGF0aDogYCR7cGF0aH0ke3Rvb2xDYWxsSWR9YCB9KS50b1N0cmluZygpO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIHN1YmFnZW50IHNlc3Npb24gVVJJIGludG8gaXRzIHBhcmVudCBzZXNzaW9uIFVSSSBhbmQgdG9vbCBjYWxsIElELlxuICogUmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGUgVVJJIGRvZXMgbm90IGZvbGxvdyB0aGUgc3ViYWdlbnQgY29udmVudGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlU3ViYWdlbnRTZXNzaW9uVXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHsgcGFyZW50U2Vzc2lvbjogUmVzb3VyY2VVUkk7IHRvb2xDYWxsSWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVzb3VyY2UgPSBhc1Jlc291cmNlVXJpKHVyaSk7XG5cdGNvbnN0IG1hdGNoID0gU1VCQUdFTlRfVVJJX1BBVEhfUkVHRVguZXhlYyhyZXNvdXJjZS5wYXRoKTtcblx0aWYgKCFtYXRjaD8uZ3JvdXBzKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdHBhcmVudFNlc3Npb246IHJlc291cmNlLndpdGgoeyBwYXRoOiBtYXRjaC5ncm91cHMucGFyZW50UGF0aCB9KSxcblx0XHR0b29sQ2FsbElkOiBtYXRjaC5ncm91cHMudG9vbENhbGxJZCxcblx0fTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHdoZXRoZXIgYSBzZXNzaW9uIFVSSSByZXByZXNlbnRzIGEgc3ViYWdlbnQgc2Vzc2lvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzU3ViYWdlbnRTZXNzaW9uKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFyc2VTdWJhZ2VudFNlc3Npb25VcmkodXJpKSAhPT0gdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEJ1aWxkcyB0aGUgc3RyaW5nIHByZWZpeCB1c2VkIGJ5IHRoZSBzdGF0ZSBtYW5hZ2VyIGZvciBjYWNoZWQgc3ViYWdlbnQgc2Vzc2lvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBidWlsZFN1YmFnZW50U2Vzc2lvblVyaVByZWZpeChwYXJlbnRTZXNzaW9uOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogc3RyaW5nIHtcblx0Y29uc3QgeyBwYXJlbnQsIHBhdGggfSA9IGdldFN1YmFnZW50QmFzZVBhdGgocGFyZW50U2Vzc2lvbik7XG5cdHJldHVybiBwYXJlbnQud2l0aCh7IHBhdGggfSkudG9TdHJpbmcoKTtcbn1cblxuLy8gLS0tLSBGYWN0b3J5IGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZVJvb3RTdGF0ZSgpOiBSb290U3RhdGUge1xuXHRyZXR1cm4ge1xuXHRcdGFnZW50czogW10sXG5cdFx0YWN0aXZlU2Vzc2lvbnM6IDAsXG5cdH07XG59XG5cbi8qKlxuICogQ3JlYXRlcyB0aGUgaW5pdGlhbCBmbGF0IHtAbGluayBTZXNzaW9uU3RhdGV9IGZvciBhIHNlc3Npb24gZnJvbSBpdHNcbiAqIHJvb3QtY2hhbm5lbCB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9IGNhdGFsb2cgZW50cnkuIFNlc3Npb24gbWV0YWRhdGFcbiAqICh7QGxpbmsgU2Vzc2lvbk1ldGFkYXRhfSkgXHUyMDE0IGFuZCB0aGUgc2hhcmVkIGBfbWV0YWAgYmFnIFx1MjAxNCBhcmUgaW5saW5lZCBkaXJlY3RseVxuICogb250byB0aGUgc3RhdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVTZXNzaW9uU3RhdGUoc3VtbWFyeTogU2Vzc2lvblN1bW1hcnkpOiBTZXNzaW9uU3RhdGUge1xuXHRjb25zdCBzdGF0ZTogU2Vzc2lvblN0YXRlID0ge1xuXHRcdHByb3ZpZGVyOiBzdW1tYXJ5LnByb3ZpZGVyLFxuXHRcdHRpdGxlOiBzdW1tYXJ5LnRpdGxlLFxuXHRcdHN0YXR1czogc3VtbWFyeS5zdGF0dXMsXG5cdFx0bGlmZWN5Y2xlOiBTZXNzaW9uTGlmZWN5Y2xlLkNyZWF0aW5nLFxuXHRcdGFjdGl2ZUNsaWVudHM6IFtdLFxuXHRcdGNoYXRzOiBbXSxcblx0XHRkZWZhdWx0Q2hhdDogdW5kZWZpbmVkLFxuXHR9O1xuXHRpZiAoc3VtbWFyeS5hY3Rpdml0eSAhPT0gdW5kZWZpbmVkKSB7IHN0YXRlLmFjdGl2aXR5ID0gc3VtbWFyeS5hY3Rpdml0eTsgfVxuXHRpZiAoc3VtbWFyeS5wcm9qZWN0ICE9PSB1bmRlZmluZWQpIHsgc3RhdGUucHJvamVjdCA9IHN1bW1hcnkucHJvamVjdDsgfVxuXHRpZiAoc3VtbWFyeS53b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZCkgeyBzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMgPSBzdW1tYXJ5LndvcmtpbmdEaXJlY3RvcmllczsgfVxuXHRpZiAoc3VtbWFyeS5hbm5vdGF0aW9ucyAhPT0gdW5kZWZpbmVkKSB7IHN0YXRlLmFubm90YXRpb25zID0gc3VtbWFyeS5hbm5vdGF0aW9uczsgfVxuXHRpZiAoc3VtbWFyeS5fbWV0YSAhPT0gdW5kZWZpbmVkKSB7IHN0YXRlLl9tZXRhID0gc3VtbWFyeS5fbWV0YTsgfVxuXHRyZXR1cm4gc3RhdGU7XG59XG5cbi8qKlxuICogQ3JlYXRlcyBhbiBlbXB0eSB7QGxpbmsgQ2hhdFN0YXRlfSBmb3IgYSBjaGF0LiBUaGUgc3VtbWFyeSBmaWVsZHMgYXJlXG4gKiBkZW5vcm1hbGl6ZWQgb250byB0aGUgY2hhdCBzdGF0ZSBwZXIgdGhlIHByb3RvY29sIGNvbnRyYWN0OyBjYWxsZXJzIHBhc3NcbiAqIHRoZSBjaGF0J3MgY2F0YWxvZyBzdW1tYXJ5IGFuZCB0aGlzIHNlZWRzIGFuIGVtcHR5IGNvbnZlcnNhdGlvbi5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUNoYXRTdGF0ZShzdW1tYXJ5OiBDaGF0U3VtbWFyeSk6IENoYXRTdGF0ZSB7XG5cdHJldHVybiB7XG5cdFx0cmVzb3VyY2U6IHN1bW1hcnkucmVzb3VyY2UsXG5cdFx0dGl0bGU6IHN1bW1hcnkudGl0bGUsXG5cdFx0c3RhdHVzOiBzdW1tYXJ5LnN0YXR1cyxcblx0XHRhY3Rpdml0eTogc3VtbWFyeS5hY3Rpdml0eSxcblx0XHRtb2RpZmllZEF0OiBzdW1tYXJ5Lm1vZGlmaWVkQXQsXG5cdFx0b3JpZ2luOiBzdW1tYXJ5Lm9yaWdpbixcblx0XHRpbnRlcmFjdGl2aXR5OiBzdW1tYXJ5LmludGVyYWN0aXZpdHksXG5cdFx0d29ya2luZ0RpcmVjdG9yaWVzOiBzdW1tYXJ5LndvcmtpbmdEaXJlY3Rvcmllcyxcblx0XHR0dXJuczogW10sXG5cdFx0YWN0aXZlVHVybjogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vKipcbiAqIERlcml2ZXMgdGhlIGRlZmF1bHQtY2hhdCB7QGxpbmsgQ2hhdFN1bW1hcnl9IGZvciBhIHNlc3Npb24gZnJvbSBpdHNcbiAqIHtAbGluayBTZXNzaW9uU3VtbWFyeX0uIFRoZSBkZWZhdWx0IGNoYXQgaW5oZXJpdHMgdGhlIHNlc3Npb24ncyB0aXRsZSxcbiAqIHN0YXR1cywgYWN0aXZpdHkgYW5kIHdvcmtpbmcgZGlyZWN0b3J5LCBhbmQgaXMgbWFya2VkIGFzIGFcbiAqIHtAbGluayBDaGF0T3JpZ2luS2luZC5Vc2VyIHwgdXNlci1vcmlnaW5hdGVkfSBjaGF0LiBCb3RoIHRoZSBzZXNzaW9uIGFuZFxuICogY2hhdCBgbW9kaWZpZWRBdGAgYXJlIElTTy04NjAxIHN0cmluZ3MsIHNvIGl0IGlzIGNhcnJpZWQgb3ZlciBkaXJlY3RseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZURlZmF1bHRDaGF0U3VtbWFyeShzZXNzaW9uOiBTZXNzaW9uU3VtbWFyeSwgY2hhdFVyaTogUHJvdG9jb2xVUkkpOiBDaGF0U3VtbWFyeSB7XG5cdGNvbnN0IHN1bW1hcnk6IENoYXRTdW1tYXJ5ID0ge1xuXHRcdHJlc291cmNlOiBjaGF0VXJpLFxuXHRcdHRpdGxlOiBzZXNzaW9uLnRpdGxlLFxuXHRcdHN0YXR1czogc2Vzc2lvbi5zdGF0dXMsXG5cdFx0bW9kaWZpZWRBdDogc2Vzc2lvbi5tb2RpZmllZEF0LFxuXHRcdG9yaWdpbjogeyBraW5kOiBDaGF0T3JpZ2luS2luZC5Vc2VyIH0sXG5cdH07XG5cdGlmIChzZXNzaW9uLmFjdGl2aXR5ICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5hY3Rpdml0eSA9IHNlc3Npb24uYWN0aXZpdHk7IH1cblx0Ly8gYHdvcmtpbmdEaXJlY3Rvcmllc2AgaXMgZGVsaWJlcmF0ZWx5IE5PVCBjb3BpZWQ6IHBlciB0aGUgcHJvdG9jb2wgaXQgaXMgYVxuXHQvLyBwZXItY2hhdCBTVUJTRVQgb3ZlcnJpZGUgYW5kLCB3aGVuIGFic2VudCwgdGhlIGNoYXQgaW5oZXJpdHMgdGhlIHNlc3Npb24nc1xuXHQvLyBmdWxsIHNldCBvZiB3b3JraW5nIGRpcmVjdG9yaWVzIChzZWUgYG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdGApLlxuXHQvLyBTZWVkaW5nIGl0IGhlcmUgd291bGQgZGVub3JtYWxpemUgdGhlIHNlc3Npb24gZGVmYXVsdCBvbnRvIGV2ZXJ5IGNoYXQgYXMgYVxuXHQvLyBmYWtlIG92ZXJyaWRlLCB3aGljaCB0aGVuIGdvZXMgc3RhbGUgd2hlbiB0aGUgc2Vzc2lvbidzIHdvcmtpbmdcblx0Ly8gZGlyZWN0b3JpZXMgYXJlIHJlc29sdmVkIGxhdGVyIChlLmcuIGEgd29ya3RyZWUgcmVzb2x2ZWQgYXRcblx0Ly8gbWF0ZXJpYWxpemF0aW9uKS5cblx0cmV0dXJuIHN1bW1hcnk7XG59XG5cbi8qKiBBY3Rpdml0eSBiaXRzICgwLTQpIG9mIHtAbGluayBTZXNzaW9uU3RhdHVzfTsgdGhlIGhpZ2ggYml0cyBjYXJyeSBvcnRob2dvbmFsIGZsYWdzIChJc1JlYWQgLyBJc0FyY2hpdmVkKS4gKi9cbmNvbnN0IFNUQVRVU19BQ1RJVklUWV9NQVNLID0gKDEgPDwgNSkgLSAxO1xuXG4vKiogV2hldGhlciB0aGUgYWN0aXZlIHR1cm4gaGFzIGEgYFBlbmRpbmdDb25maXJtYXRpb25gIHRvb2wgY2FsbCBhdXRvLWFwcHJvdmVkIGJ5IHRoZSBzZXNzaW9uJ3MgYnlwYXNzIHNldHRpbmcuICovXG5mdW5jdGlvbiBoYXNBdXRvQXBwcm92ZWRQZW5kaW5nQ29uZmlybWF0aW9uKHN0YXRlOiBDaGF0U3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuICEhc3RhdGUuYWN0aXZlVHVybj8ucmVzcG9uc2VQYXJ0cy5zb21lKHBhcnQgPT5cblx0XHRwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuVG9vbENhbGxcblx0XHQmJiBwYXJ0LnRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdCYmIHJlYWRUb29sQ2FsbE1ldGEocGFydC50b29sQ2FsbCkuYXV0b0FwcHJvdmVCeVNldHRpbmcgPT09IHRydWUsXG5cdCk7XG59XG5cbi8qKiBXaGV0aGVyIHRoZSBjaGF0IGlzIGdlbnVpbmVseSBibG9ja2VkIG9uIHVzZXIgaW5wdXQgKGFuIG9wZW4gaW5wdXQgcmVxdWVzdCwgYW4gYXV0aC1yZXF1aXJlZCB0b29sLCBvciBhIG5vbi1hdXRvLWFwcHJvdmVkIGNvbmZpcm1hdGlvbiBnYXRlKS4gKi9cbmZ1bmN0aW9uIGNoYXRBd2FpdHNVc2VySW5wdXQoc3RhdGU6IENoYXRTdGF0ZSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFzdGF0ZS5hY3RpdmVUdXJuPy5yZXNwb25zZVBhcnRzLnNvbWUocGFydCA9PiB7XG5cdFx0Ly8gQW4gb3BlbiBlbGljaXRhdGlvbiBhbHdheXMgYXdhaXRzIHRoZSB1c2VyIHVudGlsIGl0IGlzIGFuc3dlcmVkLlxuXHRcdGlmIChwYXJ0LmtpbmQgPT09IFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0KSB7XG5cdFx0XHRyZXR1cm4gcGFydC5yZXNwb25zZSA9PT0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHRpZiAocGFydC5raW5kICE9PSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdGNvbnN0IHN0YXR1cyA9IHBhcnQudG9vbENhbGwuc3RhdHVzO1xuXHRcdC8vIFJlc3VsdC1jb25maXJtYXRpb24gYW5kIGF1dGgtcmVxdWlyZWQgZ2F0ZXMgYWx3YXlzIHJlcXVpcmUgdGhlIHVzZXI7IGFcblx0XHQvLyBwYXJhbWV0ZXItY29uZmlybWF0aW9uIGdhdGUgb25seSB3aGVuIGl0IHdhcyBub3QgYXV0by1hcHByb3ZlZC5cblx0XHRpZiAoc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nUmVzdWx0Q29uZmlybWF0aW9uIHx8IHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQXV0aFJlcXVpcmVkKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuIHN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUGVuZGluZ0NvbmZpcm1hdGlvblxuXHRcdFx0JiYgcmVhZFRvb2xDYWxsTWV0YShwYXJ0LnRvb2xDYWxsKS5hdXRvQXBwcm92ZUJ5U2V0dGluZyAhPT0gdHJ1ZTtcblx0fSk7XG59XG5cbi8qKlxuICogUHJvamVjdHMgYSBjaGF0J3Mgc3RhdHVzIGZvciBzZXNzaW9uLXN1bW1hcnkgYWdncmVnYXRpb24sIGRlbW90aW5nIGFuXG4gKiBgSW5wdXROZWVkZWRgIGJhY2sgdG8gYEluUHJvZ3Jlc3NgIG9ubHkgd2hlbiBpdCBpcyBjYXVzZWQgc29sZWx5IGJ5IGFuXG4gKiBhdXRvLWFwcHJvdmVkIGNvbmZpcm1hdGlvbiBcdTIwMTQgb3RoZXJ3aXNlIGEgc2Vzc2lvbiB3aXRoIGJ5cGFzcyBhcHByb3ZhbHMgZmxhc2hlc1xuICogXCJpbnB1dCBuZWVkZWRcIiBpbiB0aGUgc2Vzc2lvbnMgbGlzdCB3aGlsZSBhbiBhdXRvLWFwcHJvdmVkIHRvb2wgcnVucy5cbiAqL1xuZnVuY3Rpb24gY2hhdFN1bW1hcnlTdGF0dXMoc3RhdGU6IENoYXRTdGF0ZSk6IFNlc3Npb25TdGF0dXMge1xuXHRjb25zdCBzdGF0dXMgPSBzdGF0ZS5zdGF0dXM7XG5cdGlmICgoc3RhdHVzICYgU2Vzc2lvblN0YXR1cy5JbnB1dE5lZWRlZCkgIT09IFNlc3Npb25TdGF0dXMuSW5wdXROZWVkZWQpIHtcblx0XHRyZXR1cm4gc3RhdHVzO1xuXHR9XG5cdC8vIE9ubHkgZGVtb3RlIHdoZW4gd2UgY2FuIHBvc2l0aXZlbHkgYXR0cmlidXRlIHRoZSBJbnB1dE5lZWRlZCB0byBhblxuXHQvLyBhdXRvLWFwcHJvdmVkIGNvbmZpcm1hdGlvbiB3aXRoIG5vIGdlbnVpbmUgYmxvY2tlciBwcmVzZW50OyBvdGhlcndpc2UgKGUuZy5cblx0Ly8gYSByZXN0b3JlZCBzdW1tYXJ5IHdob3NlIGFjdGl2ZVR1cm4gaXMgbm90IGxvYWRlZCkgcHJlc2VydmUgdGhlIHN0YXR1cy5cblx0aWYgKGhhc0F1dG9BcHByb3ZlZFBlbmRpbmdDb25maXJtYXRpb24oc3RhdGUpICYmICFjaGF0QXdhaXRzVXNlcklucHV0KHN0YXRlKSkge1xuXHRcdHJldHVybiAoc3RhdHVzICYgflNUQVRVU19BQ1RJVklUWV9NQVNLKSB8IFNlc3Npb25TdGF0dXMuSW5Qcm9ncmVzcztcblx0fVxuXHRyZXR1cm4gc3RhdHVzO1xufVxuXG4vKipcbiAqIERlcml2ZXMgYSB7QGxpbmsgQ2hhdFN1bW1hcnl9IGZyb20gYSBmdWxseS1wb3B1bGF0ZWQge0BsaW5rIENoYXRTdGF0ZX0gYnlcbiAqIHByb2plY3Rpbmcgb3V0IHRoZSBkZW5vcm1hbGl6ZWQgc3VtbWFyeSBmaWVsZHMuIFVzZWQgdG8ga2VlcCB0aGUgcGFyZW50XG4gKiBzZXNzaW9uJ3MgYGNoYXRzYCBjYXRhbG9nIGluIHN5bmMgd2l0aCBhIGNoYXQncyBkZW5vcm1hbGl6ZWQgc3RhdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGF0U3VtbWFyeUZyb21TdGF0ZShzdGF0ZTogQ2hhdFN0YXRlKTogQ2hhdFN1bW1hcnkge1xuXHRjb25zdCBzdW1tYXJ5OiBDaGF0U3VtbWFyeSA9IHtcblx0XHRyZXNvdXJjZTogc3RhdGUucmVzb3VyY2UsXG5cdFx0dGl0bGU6IHN0YXRlLnRpdGxlLFxuXHRcdHN0YXR1czogY2hhdFN1bW1hcnlTdGF0dXMoc3RhdGUpLFxuXHRcdG1vZGlmaWVkQXQ6IHN0YXRlLm1vZGlmaWVkQXQsXG5cdH07XG5cdGlmIChzdGF0ZS5hY3Rpdml0eSAhPT0gdW5kZWZpbmVkKSB7IHN1bW1hcnkuYWN0aXZpdHkgPSBzdGF0ZS5hY3Rpdml0eTsgfVxuXHRpZiAoc3RhdGUub3JpZ2luICE9PSB1bmRlZmluZWQpIHsgc3VtbWFyeS5vcmlnaW4gPSBzdGF0ZS5vcmlnaW47IH1cblx0aWYgKHN0YXRlLmludGVyYWN0aXZpdHkgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LmludGVyYWN0aXZpdHkgPSBzdGF0ZS5pbnRlcmFjdGl2aXR5OyB9XG5cdGlmIChzdGF0ZS53b3JraW5nRGlyZWN0b3JpZXMgIT09IHVuZGVmaW5lZCkgeyBzdW1tYXJ5LndvcmtpbmdEaXJlY3RvcmllcyA9IHN0YXRlLndvcmtpbmdEaXJlY3RvcmllczsgfVxuXHRyZXR1cm4gc3VtbWFyeTtcbn1cblxuLyoqXG4gKiBUaGUgZWZmZWN0aXZlIGludGVyYWN0aXZpdHkgb2YgYSBjaGF0IGdpdmVuIGl0cyBzZXNzaW9uJ3MgYXJjaGl2ZWQgc3RhdGUuXG4gKlxuICogYGludGVyYWN0aXZpdHlgIGlzIHRoZSBnZW5lcmFsIHJlYWQtb25seSBtZWNoYW5pc20gKGUuZy4gc3ViYWdlbnQgd29ya2VyXG4gKiBjaGF0cyBhcmUgYFJlYWRPbmx5YCkuIEFuIGFyY2hpdmVkIHNlc3Npb24gaXMgcmVhZC1vbmx5IHRvbywgc28gaXRzXG4gKiBpbnRlcmFjdGl2ZSBjaGF0cyBhcmUgZG93bmdyYWRlZCB0byBgUmVhZE9ubHlgLiBgSGlkZGVuYCBjaGF0cyBzdGF5IGhpZGRlbiBcdTIwMTRcbiAqIGFyY2hpdmluZyBvbmx5IGRvd25ncmFkZXMgYEZ1bGxgIGNoYXRzLiBBYnNlbnQgaW50ZXJhY3Rpdml0eSBkZWZhdWx0cyB0b1xuICogYEZ1bGxgIGZvciBiYWNrd2FyZCBjb21wYXRpYmlsaXR5LlxuICpcbiAqIFRoZSBob3N0IHVzZXMgdGhpcyB0byBlbmZvcmNlIHJlYWQtb25seSB0dXJucyBvZmYgYSBzaW5nbGUgc2lnbmFsXG4gKiAoe0BsaW5rIGlzQ2hhdFJlYWRPbmx5fSkgcmF0aGVyIHRoYW4gc3BlY2lhbC1jYXNpbmcgYXJjaGl2ZWQ7IHRoZSBzYW1lIHJ1bGVcbiAqIGlzIG1pcnJvcmVkIGNsaWVudC1zaWRlIHRvIGhpZGUgdGhlIGNvbXBvc2VyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZWZmZWN0aXZlQ2hhdEludGVyYWN0aXZpdHkoaW50ZXJhY3Rpdml0eTogQ2hhdEludGVyYWN0aXZpdHkgfCB1bmRlZmluZWQsIHNlc3Npb25BcmNoaXZlZDogYm9vbGVhbik6IENoYXRJbnRlcmFjdGl2aXR5IHtcblx0aWYgKGludGVyYWN0aXZpdHkgPT09IENoYXRJbnRlcmFjdGl2aXR5LkhpZGRlbikge1xuXHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5IaWRkZW47XG5cdH1cblx0aWYgKHNlc3Npb25BcmNoaXZlZCkge1xuXHRcdHJldHVybiBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seTtcblx0fVxuXHRyZXR1cm4gaW50ZXJhY3Rpdml0eSA/PyBDaGF0SW50ZXJhY3Rpdml0eS5GdWxsO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgYSBjaGF0IHJlamVjdHMgdXNlci1kaXNwYXRjaGVkIHR1cm5zLCBnaXZlbiBpdHMgb3duIGludGVyYWN0aXZpdHkgYW5kXG4gKiBpdHMgc2Vzc2lvbidzIGFyY2hpdmVkIHN0YXRlLiBgdHJ1ZWAgZm9yIGBSZWFkT25seWAgY2hhdHMgKGluY2x1ZGluZyBhcmNoaXZlZFxuICogc2Vzc2lvbnMnIGludGVyYWN0aXZlIGNoYXRzKS4gU2VlIHtAbGluayBlZmZlY3RpdmVDaGF0SW50ZXJhY3Rpdml0eX0uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0NoYXRSZWFkT25seShpbnRlcmFjdGl2aXR5OiBDaGF0SW50ZXJhY3Rpdml0eSB8IHVuZGVmaW5lZCwgc2Vzc2lvbkFyY2hpdmVkOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBlZmZlY3RpdmVDaGF0SW50ZXJhY3Rpdml0eShpbnRlcmFjdGl2aXR5LCBzZXNzaW9uQXJjaGl2ZWQpID09PSBDaGF0SW50ZXJhY3Rpdml0eS5SZWFkT25seTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUFjdGl2ZVR1cm4oaWQ6IHN0cmluZywgbWVzc2FnZTogTWVzc2FnZSwgc3RhcnRlZEF0OiBzdHJpbmcpOiBBY3RpdmVUdXJuIHtcblx0cmV0dXJuIHtcblx0XHRpZCxcblx0XHRzdGFydGVkQXQsXG5cdFx0bWVzc2FnZSxcblx0XHRyZXNwb25zZVBhcnRzOiBbXSxcblx0XHR1c2FnZTogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG5leHBvcnQgY29uc3QgZW51bSBTdGF0ZUNvbXBvbmVudHMge1xuXHRSb290LFxuXHRTZXNzaW9uLFxuXHRDaGF0LFxuXHRUZXJtaW5hbCxcblx0Q2hhbmdlc2V0LFxuXHRBbm5vdGF0aW9ucyxcbn1cblxuZXhwb3J0IHR5cGUgQ29tcG9uZW50VG9TdGF0ZSA9IHtcblx0W1N0YXRlQ29tcG9uZW50cy5Sb290XTogUm9vdFN0YXRlO1xuXHRbU3RhdGVDb21wb25lbnRzLlNlc3Npb25dOiBTZXNzaW9uU3RhdGU7XG5cdFtTdGF0ZUNvbXBvbmVudHMuQ2hhdF06IENoYXRTdGF0ZTtcblx0W1N0YXRlQ29tcG9uZW50cy5UZXJtaW5hbF06IFRlcm1pbmFsU3RhdGU7XG5cdFtTdGF0ZUNvbXBvbmVudHMuQ2hhbmdlc2V0XTogQ2hhbmdlc2V0U3RhdGU7XG5cdFtTdGF0ZUNvbXBvbmVudHMuQW5ub3RhdGlvbnNdOiBBbm5vdGF0aW9uc1N0YXRlO1xufTtcblxuLy8gLS0tLSBEZWZhdWx0IGNoYXQgVVJJIGhlbHBlcnMgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKiogU2NoZW1lIHVzZWQgYnkgY2hhdCBjaGFubmVsIFVSSXMgKGBhaHAtY2hhdDovLy4uLmApLiAqL1xuZXhwb3J0IGNvbnN0IEFIUF9DSEFUX1NDSEVNRSA9ICdhaHAtY2hhdCc7XG5cbi8qKiBDaGF0IGlkIG9mIHRoZSBkZWZhdWx0IGNoYXQgdGhhdCBldmVyeSBzZXNzaW9uIG93bnMuICovXG5leHBvcnQgY29uc3QgREVGQVVMVF9DSEFUX0lEID0gJ2RlZmF1bHQnO1xuXG4vKipcbiAqIERlcml2ZXMgdGhlIGRldGVybWluaXN0aWMgY2hhbm5lbCBVUkkgZm9yIGEgY2hhdCB3aXRoaW4gYSBzZXNzaW9uLiBFdmVyeSBjaGF0XG4gKiBcdTIwMTQgdGhlIGRlZmF1bHQgY2hhdCBhbmQgYW55IGFkZGl0aW9uYWwgcGVlciBjaGF0cyBcdTIwMTQgZW5jb2RlcyBpdHMgb3duaW5nIHNlc3Npb25cbiAqIFVSSSBpbnRvIHRoZSBwYXRoIHNvIHByb2R1Y2VycyBhbmQgY29uc3VtZXJzIGNhbiByZWNvdmVyIHRoZSBzZXNzaW9uIHdpdGhvdXQgYVxuICogbG9va3VwIHRhYmxlIChzZWUge0BsaW5rIHBhcnNlQ2hhdFVyaX0pLiBUaGUgY2hhdCBpZCBpcyBjYXJyaWVkIGluIHRoZSBVUklcbiAqIGF1dGhvcml0eS5cbiAqXG4gKiBgYWhwLWNoYXQ6Ly88Y2hhdElkPi88YmFzZTY0KHNlc3Npb25VcmkpPmBcbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJLCBjaGF0SWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlc3Npb24gPSB0eXBlb2Ygc2Vzc2lvblVyaSA9PT0gJ3N0cmluZycgPyBzZXNzaW9uVXJpIDogc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRjb25zdCBlbmNvZGVkID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoc2Vzc2lvbiksIGZhbHNlLCB0cnVlKTtcblx0cmV0dXJuIGAke0FIUF9DSEFUX1NDSEVNRX06Ly8ke2NoYXRJZH0vJHtlbmNvZGVkfWA7XG59XG5cbi8qKlxuICogRGVyaXZlcyB0aGUgZGV0ZXJtaW5pc3RpYyBkZWZhdWx0LWNoYXQgY2hhbm5lbCBVUkkgZm9yIGEgc2Vzc2lvbi4gV2hpbGUgdGhlXG4gKiBwcm90b2NvbCBhbGxvd3MgYSBzZXNzaW9uIHRvIGNvbnRhaW4gbWFueSBjaGF0cywgZXZlcnkgc2Vzc2lvbiBhbHdheXMgb3ducyBhXG4gKiBkZWZhdWx0IGNoYXQgd2hvc2UgVVJJIGlzIGRlcml2ZWQgZnJvbSB0aGUgb3duaW5nIHNlc3Npb24gVVJJIHNvIHByb2R1Y2VycyBhbmRcbiAqIGNvbnN1bWVycyBjYW4gY29tcHV0ZSBpdCB3aXRob3V0IGEgbG9va3VwIHRhYmxlLlxuICpcbiAqIFRoZSBzZXNzaW9uIFVSSSBpcyBlbmNvZGVkIGludG8gdGhlIHBhdGggc28ge0BsaW5rIHBhcnNlQ2hhdFVyaX0gY2FuIHJlY292ZXJcbiAqIGl0LlxuICovXG5leHBvcnQgZnVuY3Rpb24gYnVpbGREZWZhdWx0Q2hhdFVyaShzZXNzaW9uVXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogc3RyaW5nIHtcblx0cmV0dXJuIGJ1aWxkQ2hhdFVyaShzZXNzaW9uVXJpLCBERUZBVUxUX0NIQVRfSUQpO1xufVxuXG5jb25zdCBTVUJBR0VOVF9DSEFUX0lEID0gJ3N1YmFnZW50JztcblxuZXhwb3J0IGZ1bmN0aW9uIGlzU3ViYWdlbnRDaGF0VXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IGJvb2xlYW4ge1xuXHRjb25zdCBwYXJzZWQgPSB0eXBlb2YgdXJpID09PSAnc3RyaW5nJyA/IFJlc291cmNlVVJJLnBhcnNlKHVyaSkgOiB1cmk7XG5cdHJldHVybiBwYXJzZWQuc2NoZW1lID09PSBBSFBfQ0hBVF9TQ0hFTUUgJiYgcGFyc2VkLmF1dGhvcml0eSA9PT0gU1VCQUdFTlRfQ0hBVF9JRDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGJ1aWxkU3ViYWdlbnRDaGF0VXJpKHNlc3Npb25Vcmk6IFByb3RvY29sVVJJIHwgUmVzb3VyY2VVUkksIHRvb2xDYWxsSWQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdGNvbnN0IHNlc3Npb24gPSB0eXBlb2Ygc2Vzc2lvblVyaSA9PT0gJ3N0cmluZycgPyBzZXNzaW9uVXJpIDogc2Vzc2lvblVyaS50b1N0cmluZygpO1xuXHRjb25zdCBlbmNvZGVkID0gZW5jb2RlQmFzZTY0KFZTQnVmZmVyLmZyb21TdHJpbmcoc2Vzc2lvbiksIGZhbHNlLCB0cnVlKTtcblx0cmV0dXJuIGAke0FIUF9DSEFUX1NDSEVNRX06Ly8ke1NVQkFHRU5UX0NIQVRfSUR9LyR7ZW5jb2RlZH0vJHtlbmNvZGVVUklDb21wb25lbnQodG9vbENhbGxJZCl9YDtcbn1cblxuLyoqXG4gKiBJbnZlcnNlIG9mIHtAbGluayBidWlsZENoYXRVcml9OiByZWNvdmVycyB0aGUgb3duaW5nIHNlc3Npb24gVVJJIGFuZCBjaGF0IGlkXG4gKiBmcm9tIGFueSBjaGF0IGNoYW5uZWwgVVJJLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gYHVyaWAgaXMgbm90IGEgd2VsbC1mb3JtZWRcbiAqIGNoYXQgVVJJLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcGFyc2VDaGF0VXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHsgc2Vzc2lvbjogc3RyaW5nOyBjaGF0SWQ6IHN0cmluZyB9IHwgdW5kZWZpbmVkIHtcblx0bGV0IHBhcnNlZDogUmVzb3VyY2VVUkk7XG5cdHRyeSB7XG5cdFx0cGFyc2VkID0gdHlwZW9mIHVyaSA9PT0gJ3N0cmluZycgPyBSZXNvdXJjZVVSSS5wYXJzZSh1cmkpIDogdXJpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmIChwYXJzZWQuc2NoZW1lICE9PSBBSFBfQ0hBVF9TQ0hFTUUgfHwgIXBhcnNlZC5hdXRob3JpdHkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGVuY29kZWQgPSBwYXJzZWQucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpO1xuXHRpZiAoIWVuY29kZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0aWYgKHBhcnNlZC5hdXRob3JpdHkgPT09IFNVQkFHRU5UX0NIQVRfSUQpIHtcblx0XHRcdGNvbnN0IFtzZXNzaW9uUGFydCwgLi4udG9vbENhbGxJZFBhcnRzXSA9IGVuY29kZWQuc3BsaXQoJy8nKTtcblx0XHRcdGNvbnN0IHRvb2xDYWxsSWQgPSB0b29sQ2FsbElkUGFydHMuam9pbignLycpO1xuXHRcdFx0aWYgKCFzZXNzaW9uUGFydCB8fCAhdG9vbENhbGxJZCkge1xuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHsgc2Vzc2lvbjogZGVjb2RlQmFzZTY0KHNlc3Npb25QYXJ0KS50b1N0cmluZygpLCBjaGF0SWQ6IGAke1NVQkFHRU5UX0NIQVRfSUR9LyR7ZGVjb2RlVVJJQ29tcG9uZW50KHRvb2xDYWxsSWQpfWAgfTtcblx0XHR9XG5cdFx0cmV0dXJuIHsgc2Vzc2lvbjogZGVjb2RlQmFzZTY0KGVuY29kZWQpLnRvU3RyaW5nKCksIGNoYXRJZDogcGFyc2VkLmF1dGhvcml0eSB9O1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG59XG5cbi8qKlxuICogSW52ZXJzZSBvZiB7QGxpbmsgYnVpbGREZWZhdWx0Q2hhdFVyaX06IHJlY292ZXJzIHRoZSBvd25pbmcgc2Vzc2lvbiBVUkkgZnJvbSBhXG4gKiBjaGF0IGNoYW5uZWwgVVJJLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gYHVyaWAgaXMgbm90IGEgd2VsbC1mb3JtZWQgY2hhdCBVUkkuXG4gKiBBY2NlcHRzIGFueSBjaGF0IFVSSSAoZGVmYXVsdCBvciBhZGRpdGlvbmFsKSBzbyBjYWxsZXJzIHRoYXQgb25seSBuZWVkIHRoZVxuICogcGFyZW50IHNlc3Npb24gY2FuIHVzZSBpdCB1bmlmb3JtbHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZURlZmF1bHRDaGF0VXJpKHVyaTogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdHJldHVybiBwYXJzZUNoYXRVcmkodXJpKT8uc2Vzc2lvbjtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHBhcnNlUmVxdWlyZWRTZXNzaW9uVXJpRnJvbUNoYXRVcmkodXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogc3RyaW5nIHtcblx0Y29uc3Qgc2Vzc2lvbiA9IHBhcnNlRGVmYXVsdENoYXRVcmkodXJpKTtcblx0aWYgKHNlc3Npb24gPT09IHVuZGVmaW5lZCkge1xuXHRcdHRocm93IG5ldyBFcnJvcihgTWFsZm9ybWVkIEFIUCBjaGF0IFVSSTogJHt0eXBlb2YgdXJpID09PSAnc3RyaW5nJyA/IHVyaSA6IHVyaS50b1N0cmluZygpfWApO1xuXHR9XG5cdHJldHVybiBzZXNzaW9uO1xufVxuXG4vKiogUmV0dXJucyBgdHJ1ZWAgd2hlbiBgdXJpYCBpcyB0aGUgZGVmYXVsdCBjaGF0IG9mIGl0cyBzZXNzaW9uLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGlzRGVmYXVsdENoYXRVcmkodXJpOiBQcm90b2NvbFVSSSB8IFJlc291cmNlVVJJKTogYm9vbGVhbiB7XG5cdHJldHVybiBwYXJzZUNoYXRVcmkodXJpKT8uY2hhdElkID09PSBERUZBVUxUX0NIQVRfSUQ7XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgYSBmZWF0dXJlLWxldmVsIGAoc2Vzc2lvbiwgY2hhdClgIHBhaXIgdG8gdGhlIHNpbmdsZSBjaGF0IFVSSSB1c2VkIGJ5XG4gKiB0aGUgYWdlbnQgc2Vzc2lvbi9jaGF0IHN1cmZhY2UuIEEgc2Vzc2lvbiBhbHdheXMgb3ducyBhIERFRkFVTFQgY2hhdCBhZGRyZXNzZWRcbiAqIGJ5IHRoZSBzZXNzaW9uIFVSSSBpdHNlbGY7IGFkZGl0aW9uYWwgKHBlZXIpIGNoYXRzIGFyZSBhZGRyZXNzZWQgYnkgdGhlaXIgb3duXG4gKiBjaGF0IGNoYW5uZWwgVVJJcy4gVGhpcyBpcyB0aGUgb25lIHBsYWNlIGRlZmF1bHQtY2hhdCByZXNvbHV0aW9uIGxpdmVzIHNvXG4gKiBhZ2VudHMgbmV2ZXIgcmUtZGVyaXZlIFwiaXMgdGhpcyB0aGUgZGVmYXVsdCBjaGF0P1wiLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVzb2x2ZUNoYXRVcmkoc2Vzc2lvbjogUmVzb3VyY2VVUkksIGNoYXQ6IFJlc291cmNlVVJJKTogUmVzb3VyY2VVUkkge1xuXHRyZXR1cm4gaXNEZWZhdWx0Q2hhdFVyaShjaGF0KSA/IHNlc3Npb24gOiBjaGF0O1xufVxuXG4vKipcbiAqIFJlc29sdmVzIHRoZSBVUkkgYSBjaGF0J3MgcGVyc2lzdGVkIGRhdGEgaXMgc3RvcmVkIHVuZGVyIFx1MjAxNCB0aGUgc2FtZVxuICoge0BsaW5rIHJlc29sdmVDaGF0VXJpfSBydWxlIGFwcGxpZWQgdG8gYSBjaGF0IGNoYW5uZWwgVVJJIGFsb25lLCByZWNvdmVyaW5nXG4gKiB0aGUgb3duaW5nIHNlc3Npb24gZnJvbSB0aGUgY2hhbm5lbC4gQWdlbnRzIGtleSB0aGVpciBwZXItc2Vzc2lvbiBkYXRhYmFzZVxuICogYW5kIGRhdGEgZGlyZWN0b3J5IGJ5IHRoaXMgdmFsdWUsIHNvIGFueXRoaW5nIHJlYWRpbmcgb3Igd3JpdGluZyB0aGF0IHN0b3JhZ2VcbiAqIGZyb20gb3V0c2lkZSB0aGUgYWdlbnQgbXVzdCBkZXJpdmUgaXQgdGhlIHNhbWUgd2F5LiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW5cbiAqIGBjaGF0Q2hhbm5lbGAgaXMgbm90IGEgcGFyc2VhYmxlIGNoYXQgY2hhbm5lbCBVUkkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBjaGF0U3RvcmFnZVVyaShjaGF0Q2hhbm5lbDogUHJvdG9jb2xVUkkgfCBSZXNvdXJjZVVSSSk6IFJlc291cmNlVVJJIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcGFyc2VkID0gcGFyc2VDaGF0VXJpKGNoYXRDaGFubmVsKTtcblx0aWYgKCFwYXJzZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiByZXNvbHZlQ2hhdFVyaShSZXNvdXJjZVVSSS5wYXJzZShwYXJzZWQuc2Vzc2lvbiksIFJlc291cmNlVVJJLnBhcnNlKGNoYXRDaGFubmVsLnRvU3RyaW5nKCkpKTtcbn1cblxuLyoqIFJldHVybnMgYHRydWVgIHdoZW4gYHVyaWAgaWRlbnRpZmllcyBhIGNoYXQgY2hhbm5lbC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc0FocENoYXRDaGFubmVsKHVyaTogc3RyaW5nKTogYm9vbGVhbiB7XG5cdHRyeSB7XG5cdFx0cmV0dXJuIFJlc291cmNlVVJJLnBhcnNlKHVyaSkuc2NoZW1lID09PSBBSFBfQ0hBVF9TQ0hFTUU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxufVxuXG4vLyAtLS0tIFNlc3Npb24gKyBkZWZhdWx0LWNoYXQgY29tcG9zaXRlIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogQSBzaW5nbGUgY2hhdCdzIGVmZmVjdGl2ZSBzZXNzaW9uIGNvbnRleHQ6IHRoZSBzaGFyZWQge0BsaW5rIFNlc3Npb25TdGF0ZX1cbiAqICh3b3JraW5nIGRpcmVjdG9yaWVzLCBhY3RpdmUgY2xpZW50cywgY29uZmlnLCBjdXN0b21pemF0aW9ucy9NQ1Agc2NvcGUsIFx1MjAyNilcbiAqIHJlc29sdmVkIGZvciBvbmUgY2hhdCBhbmQgbWVyZ2VkIHdpdGggdGhhdCBjaGF0J3MgY29udmVyc2F0aW9uIGNvbnRlbnRzLlxuICpcbiAqIFRoZSBwcm90b2NvbCBtb3ZlZCB0dXJucyBhbmQgcGVuZGluZyBzdGF0ZSBvZmYgdGhlIHNlc3Npb24gYW5kIG9udG8gYVxuICogcGVyLWNoYXQgY2hhbm5lbCwgYW5kIGxldHMgYSBjaGF0IG92ZXJyaWRlIHRoZSBzZXNzaW9uJ3Mgd29ya2luZyBkaXJlY3Rvcmllc1xuICogd2l0aCBhIHN1YnNldCAoZS5nLiB7QGxpbmsgQ2hhdFN0YXRlLndvcmtpbmdEaXJlY3Rvcmllc30pLiBUaGlzIGNvbXBvc2l0ZVxuICogcmVjb21iaW5lcyB0aGUgc2Vzc2lvbiB3aXRoIG9uZSBvZiBpdHMgY2hhdHMgXHUyMDE0IGRlZmF1bHQgb3IgcGVlciBcdTIwMTQgc28gY29uc3VtZXJzXG4gKiByZWFkIHRoZSBjaGF0J3MgZWZmZWN0aXZlIGNvbnRleHQgYW5kIGNvbnZlcnNhdGlvbiB0aHJvdWdoIG9uZSBvYmplY3Qgd2l0aG91dFxuICogd2Fsa2luZyBiYWNrIHRvIHRoZSBzZXNzaW9uIHRvIHJlLWRlcml2ZSBzaGFyZWQgc3RhdGUuIFRoZVxuICoge0BsaW5rIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0LndvcmtpbmdEaXJlY3Rvcmllc30gY2FycnkgdGhlIGNoYXQncyAqZWZmZWN0aXZlKlxuICogd29ya2luZyBkaXJlY3RvcmllcyAoaXRzIG93biBzdWJzZXQgb3ZlcnJpZGUgd2hlbiBwcmVzZW50LCBlbHNlIHRoZSBzZXNzaW9uJ3NcbiAqIGZ1bGwgc2V0KS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdCBleHRlbmRzIFNlc3Npb25TdGF0ZSB7XG5cdC8qKiBDb21wbGV0ZWQgdHVybnMgb2YgdGhpcyBjaGF0LiAqL1xuXHR0dXJuczogVHVybltdO1xuXHQvKiogQ3VycmVudGx5IGluLXByb2dyZXNzIHR1cm4gb2YgdGhpcyBjaGF0LiAqL1xuXHRhY3RpdmVUdXJuPzogQWN0aXZlVHVybjtcblx0LyoqIFN0ZWVyaW5nIG1lc3NhZ2UgcGVuZGluZyBvbiB0aGlzIGNoYXQuICovXG5cdHN0ZWVyaW5nTWVzc2FnZT86IFBlbmRpbmdNZXNzYWdlO1xuXHQvKiogUXVldWVkIG1lc3NhZ2VzIHBlbmRpbmcgb24gdGhpcyBjaGF0LiAqL1xuXHRxdWV1ZWRNZXNzYWdlcz86IFBlbmRpbmdNZXNzYWdlW107XG5cdC8qKiBEcmFmdCBpbnB1dCBvZiB0aGlzIGNoYXQuICovXG5cdGRyYWZ0PzogTWVzc2FnZTtcbn1cblxuLyoqXG4gKiBQcm9qZWN0cyBhIHtAbGluayBTZXNzaW9uU3RhdGV9IGFuZCBvbmUgb2YgaXRzIHtAbGluayBDaGF0U3RhdGUgfCBjaGF0c31cbiAqIChkZWZhdWx0IG9yIHBlZXIpIGludG8gdGhhdCBjaGF0J3Mge0BsaW5rIElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHwgZWZmZWN0aXZlXG4gKiBzZXNzaW9uIGNvbnRleHR9LiBQZXItY2hhdCBvdmVycmlkZXMgKHRoZSB3b3JraW5nLWRpcmVjdG9yaWVzIHN1YnNldCkgYXJlXG4gKiBsYXllcmVkIG92ZXIgdGhlIHNlc3Npb24gZGVmYXVsdHMsIGFuZCB0aGUgY29udmVyc2F0aW9uIGZpZWxkcyBhcmUgdGFrZW4gZnJvbVxuICogdGhlIGNoYXQuIFdoZW4gdGhlIGNoYXQgc3RhdGUgaXMgYWJzZW50IChlLmcuIG5vdCB5ZXQgaHlkcmF0ZWQpIHRoZVxuICogY29udmVyc2F0aW9uIGZpZWxkcyBkZWZhdWx0IHRvIGVtcHR5IGFuZCB0aGUgc2Vzc2lvbiBkZWZhdWx0cyBhcHBseS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIG1lcmdlU2Vzc2lvbldpdGhEZWZhdWx0Q2hhdChzZXNzaW9uOiBTZXNzaW9uU3RhdGUsIGNoYXQ6IENoYXRTdGF0ZSB8IHVuZGVmaW5lZCk6IElTZXNzaW9uV2l0aERlZmF1bHRDaGF0IHtcblx0cmV0dXJuIHtcblx0XHQuLi5zZXNzaW9uLFxuXHRcdHdvcmtpbmdEaXJlY3RvcmllczogY2hhdD8ud29ya2luZ0RpcmVjdG9yaWVzID8/IHNlc3Npb24ud29ya2luZ0RpcmVjdG9yaWVzLFxuXHRcdHR1cm5zOiBjaGF0Py50dXJucyA/PyBbXSxcblx0XHRhY3RpdmVUdXJuOiBjaGF0Py5hY3RpdmVUdXJuLFxuXHRcdHN0ZWVyaW5nTWVzc2FnZTogY2hhdD8uc3RlZXJpbmdNZXNzYWdlLFxuXHRcdHF1ZXVlZE1lc3NhZ2VzOiBjaGF0Py5xdWV1ZWRNZXNzYWdlcyxcblx0XHRkcmFmdDogY2hhdD8uZHJhZnQsXG5cdH07XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGFjdGl2ZSB0dXJuIG9mIGEgc2Vzc2lvbidzIGRlZmF1bHQgY2hhdCwgaWYgYW55LlxuICovXG5leHBvcnQgZnVuY3Rpb24gZ2V0QWN0aXZlVHVybihjaGF0OiBDaGF0U3RhdGUgfCB1bmRlZmluZWQpOiBBY3RpdmVUdXJuIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIGNoYXQ/LmFjdGl2ZVR1cm47XG59XG5cbi8qKlxuICogUmVzb2x2ZXMgdGhlIGRlZmF1bHQgY2hhdCdzIGNhdGFsb2cgc3VtbWFyeSBmcm9tIGEgc2Vzc2lvbiwgaWYgcHJlc2VudC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGdldERlZmF1bHRDaGF0KHNlc3Npb246IFNlc3Npb25TdGF0ZSk6IENoYXRTdW1tYXJ5IHwgdW5kZWZpbmVkIHtcblx0aWYgKHNlc3Npb24uZGVmYXVsdENoYXQgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IG1hdGNoID0gc2Vzc2lvbi5jaGF0cy5maW5kKGMgPT4gYy5yZXNvdXJjZSA9PT0gc2Vzc2lvbi5kZWZhdWx0Q2hhdCk7XG5cdFx0aWYgKG1hdGNoKSB7XG5cdFx0XHRyZXR1cm4gbWF0Y2g7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBzZXNzaW9uLmNoYXRzWzBdO1xufVxuXG4vLyAtLS0tIFNlc3Npb25NZXRhIGFjY2Vzc29ycyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cbi8qKlxuICogVlMgQ29kZS1zaWRlIGFsaWFzIGZvciB0aGUgcHJvdG9jb2wncyBvcGVuIGBfbWV0YWAgcHJvcGVydHkgYmFnIG9uXG4gKiB7QGxpbmsgU2Vzc2lvblN0YXRlfS4gS2V5cyBTSE9VTEQgYmUgbmFtZXNwYWNlZCAoZS5nLiBgZ2l0YCwgYHZzY29kZS5mb29gKVxuICogdG8gYXZvaWQgY29sbGlzaW9uczsgdmFsdWVzIE1VU1QgYmUgSlNPTi1zZXJpYWxpemFibGUuXG4gKi9cbmV4cG9ydCB0eXBlIFNlc3Npb25NZXRhID0gUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cbi8qKlxuICogVlMgQ29kZS1zaWRlIGFsaWFzIGZvciB0aGUgcHJvdG9jb2wncyBvcGVuIGBfbWV0YWAgcHJvcGVydHkgYmFnIG9uXG4gKiB7QGxpbmsgU2Vzc2lvblN1bW1hcnl9LiBLZXlzIFNIT1VMRCBiZSBuYW1lc3BhY2VkIChlLmcuIGBnaXRgLCBgdnNjb2RlLmZvb2ApXG4gKiB0byBhdm9pZCBjb2xsaXNpb25zOyB2YWx1ZXMgTVVTVCBiZSBKU09OLXNlcmlhbGl6YWJsZS5cbiAqL1xuZXhwb3J0IHR5cGUgU2Vzc2lvblN1bW1hcnlNZXRhID0gUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cbi8qKlxuICogUmVzZXJ2ZWQga2V5IHVuZGVyIHtAbGluayBTZXNzaW9uTWV0YX0gZm9yIHRoZSB3ZWxsLWtub3duIGdpdC1zdGF0ZVxuICogcGF5bG9hZC4gVmFsdWUgYXQgdGhpcyBrZXksIHdoZW4gcHJlc2VudCwgTVVTVCBiZSBzaGFwZWQgbGlrZVxuICoge0BsaW5rIElTZXNzaW9uR2l0U3RhdGV9LiBUaGlzIGlzIGEgVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uIGxheWVyZWRcbiAqIG9uIHRvcCBvZiB0aGUgcHJvdG9jb2wncyBnZW5lcmljIGBfbWV0YWAgYmFnIFx1MjAxNCB0aGUgcHJvdG9jb2wgaXRzZWxmIGRvZXNcbiAqIG5vdCBrbm93IGFib3V0IGdpdCBzdGF0ZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNFU1NJT05fTUVUQV9HSVRfS0VZID0gJ2dpdCc7XG5cbi8qKlxuICogUmVzZXJ2ZWQga2V5IHVuZGVyIHtAbGluayBTZXNzaW9uTWV0YX0gZm9yIHRoZSB3ZWxsLWtub3duIEdpdEh1Yi1zdGF0ZVxuICogcGF5bG9hZC4gVmFsdWUgYXQgdGhpcyBrZXksIHdoZW4gcHJlc2VudCwgTVVTVCBiZSBzaGFwZWQgbGlrZVxuICoge0BsaW5rIElTZXNzaW9uR2l0SHViU3RhdGV9LiBUaGlzIGlzIGEgVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uIGxheWVyZWRcbiAqIG9uIHRvcCBvZiB0aGUgcHJvdG9jb2wncyBnZW5lcmljIGBfbWV0YWAgYmFnIFx1MjAxNCB0aGUgcHJvdG9jb2wgaXRzZWxmIGRvZXNcbiAqIG5vdCBrbm93IGFib3V0IEdpdEh1YiBzdGF0ZS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNFU1NJT05fTUVUQV9HSVRIVUJfS0VZID0gJ2dpdGh1Yic7XG5cbi8qKiBSZXNlcnZlZCBrZXkgZm9yIGR1cmFibGUgc291cmNlLWNvbnRyb2wgd29ya2Zsb3cgcHJvdmVuYW5jZS4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfU09VUkNFX0NPTlRST0xfS0VZID0gJ3ZzY29kZS5zb3VyY2VDb250cm9sJztcblxuZXhwb3J0IGNvbnN0IFNFU1NJT05fTUVUQV9QUk9NUFRfQ0FDSEVfS0VZID0gJ3ZzY29kZS5wcm9tcHRDYWNoZSc7XG5cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfTVVMVElfUk9PVF9LRVkgPSAnbXVsdGlSb290JztcblxuLyoqIFJlc2VydmVkIGtleSBmb3Igd2hldGhlciBhIHNlc3Npb24gd2FzIGZpcnN0IGRpc2NvdmVyZWQgaW4gYSBwcm92aWRlci1uYXRpdmUgY2F0YWxvZy4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfRVhURVJOQUxfS0VZID0gJ3ZzY29kZS5leHRlcm5hbCc7XG5cbmNvbnN0IE1BWF9XT1JLU1BBQ0VfRklMRV9MRU5HVEggPSA0MDk2O1xuXG4vKiogTXVsdGktcm9vdCB3b3Jrc3BhY2UgcHJvdmVuYW5jZSBhdHRhY2hlZCBieSB0aGUgY3JlYXRpbmcgY2xpZW50LiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhIHtcblx0cmVhZG9ubHkgd29ya3NwYWNlRmlsZTogc3RyaW5nO1xufVxuXG4vKiogUmVhZHMgdmFsaWRhdGVkIG11bHRpLXJvb3Qgd29ya3NwYWNlIHByb3ZlbmFuY2UgZnJvbSBzZXNzaW9uIG1ldGFkYXRhLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEobWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQpOiBJU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIHZhbGlkYXRlU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKG1ldGE/LltTRVNTSU9OX01FVEFfTVVMVElfUk9PVF9LRVldKTtcbn1cblxuLyoqIFBhcnNlcyB2YWxpZGF0ZWQgbXVsdGktcm9vdCB3b3Jrc3BhY2UgcHJvdmVuYW5jZSBmcm9tIGl0cyBwZXJzaXN0ZWQgSlNPTiByZXByZXNlbnRhdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZVNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSVNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICghdmFsdWUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0cmV0dXJuIHZhbGlkYXRlU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhKEpTT04ucGFyc2UodmFsdWUpKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKiogUmV0dXJucyBzZXNzaW9uIG1ldGFkYXRhIHdpdGggdGhlIG11bHRpLXJvb3Qgd29ya3NwYWNlIHByb3ZlbmFuY2UgdXBkYXRlZCBvciByZW1vdmVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEobWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQsIG11bHRpUm9vdDogSVNlc3Npb25NdWx0aVJvb3RNZXRhZGF0YSB8IHVuZGVmaW5lZCk6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV4dDogU2Vzc2lvbk1ldGEgPSB7IC4uLm1ldGEgfTtcblx0aWYgKG11bHRpUm9vdCkge1xuXHRcdG5leHRbU0VTU0lPTl9NRVRBX01VTFRJX1JPT1RfS0VZXSA9IG11bHRpUm9vdDtcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtTRVNTSU9OX01FVEFfTVVMVElfUk9PVF9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVTZXNzaW9uTXVsdGlSb290TWV0YWRhdGEodmFsdWU6IHVua25vd24pOiBJU2Vzc2lvbk11bHRpUm9vdE1ldGFkYXRhIHwgdW5kZWZpbmVkIHtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0aWYgKHR5cGVvZiByYXcud29ya3NwYWNlRmlsZSAhPT0gJ3N0cmluZycgfHwgcmF3LndvcmtzcGFjZUZpbGUubGVuZ3RoID09PSAwIHx8IHJhdy53b3Jrc3BhY2VGaWxlLmxlbmd0aCA+IE1BWF9XT1JLU1BBQ0VfRklMRV9MRU5HVEgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHRyeSB7XG5cdFx0aWYgKCFSZXNvdXJjZVVSSS5wYXJzZShyYXcud29ya3NwYWNlRmlsZSwgdHJ1ZSkuc2NoZW1lKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4geyB3b3Jrc3BhY2VGaWxlOiByYXcud29ya3NwYWNlRmlsZSB9O1xufVxuXG4vKiogTGF0ZXN0IGtub3duIHByb21wdC1jYWNoZSBzdGF0ZSBmb3IgdGhlIG1vZGVsIGFjdGl2ZSBpbiBhbiBhZ2VudCBzZXNzaW9uLiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvblByb21wdENhY2hlU3RhdGUge1xuXHRyZWFkb25seSBtb2RlbElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhY2hlRXhwaXJlc0F0OiBzdHJpbmc7XG59XG5cbi8qKiBSZWFkcyB0aGUgbGF0ZXN0IGtub3duIHByb21wdC1jYWNoZSBzdGF0ZSBmcm9tIHNlc3Npb24gbWV0YWRhdGEuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkKTogSVNlc3Npb25Qcm9tcHRDYWNoZVN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSBtZXRhPy5bU0VTU0lPTl9NRVRBX1BST01QVF9DQUNIRV9LRVldO1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRyZXR1cm4gdHlwZW9mIHJhd1snbW9kZWxJZCddID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcmF3WydjYWNoZUV4cGlyZXNBdCddID09PSAnc3RyaW5nJ1xuXHRcdD8geyBtb2RlbElkOiByYXdbJ21vZGVsSWQnXSwgY2FjaGVFeHBpcmVzQXQ6IHJhd1snY2FjaGVFeHBpcmVzQXQnXSB9XG5cdFx0OiB1bmRlZmluZWQ7XG59XG5cbi8qKiBSZXR1cm5zIHNlc3Npb24gbWV0YWRhdGEgd2l0aCB0aGUgcHJvbXB0LWNhY2hlIHNsb3QgdXBkYXRlZCBvciByZW1vdmVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZShtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCwgcHJvbXB0Q2FjaGU6IElTZXNzaW9uUHJvbXB0Q2FjaGVTdGF0ZSB8IHVuZGVmaW5lZCk6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV4dDogU2Vzc2lvbk1ldGEgPSB7IC4uLm1ldGEgfTtcblx0aWYgKHByb21wdENhY2hlKSB7XG5cdFx0bmV4dFtTRVNTSU9OX01FVEFfUFJPTVBUX0NBQ0hFX0tFWV0gPSBwcm9tcHRDYWNoZTtcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtTRVNTSU9OX01FVEFfUFJPTVBUX0NBQ0hFX0tFWV07XG5cdH1cblx0cmV0dXJuIE9iamVjdC5rZXlzKG5leHQpLmxlbmd0aCA+IDAgPyBuZXh0IDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEdpdCBzdGF0ZSBvZiBhIHNlc3Npb24ncyB3b3JraW5nIGRpcmVjdG9yeSwgY2FycmllZCB1bmRlclxuICoge0BsaW5rIFNlc3Npb25NZXRhfSBhdCB7QGxpbmsgU0VTU0lPTl9NRVRBX0dJVF9LRVl9LiBVc2VkIGJ5IGNsaWVudHMgdG9cbiAqIGRyaXZlIHNvdXJjZS1jb250cm9sIGFmZm9yZGFuY2VzIChlLmcuIFBSL21lcmdlIGJ1dHRvbnMgaW4gdGhlIEFnZW50c1xuICogYXBwKS5cbiAqXG4gKiBBbGwgZmllbGRzIGFyZSBvcHRpb25hbCBcdTIwMTQgYWdlbnRzIHRoYXQgZG8gbm90IHRyYWNrIGEgcGFydGljdWxhciBmaWVsZFxuICogc2hvdWxkIG9taXQgaXQgcmF0aGVyIHRoYW4gc2VuZCBhIHBsYWNlaG9sZGVyLCBzbyBjbGllbnRzIGNhbiBkaXN0aW5ndWlzaFxuICogXCJ1bmtub3duXCIgZnJvbSBcImtub3duIHRvIGJlIHplcm9cIi5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJU2Vzc2lvbkdpdFN0YXRlIHtcblx0LyoqIFdoZXRoZXIgdGhlIHdvcmtpbmcgZGlyZWN0b3J5IGhhcyBhIGBnaXRodWIuY29tYCBnaXQgcmVtb3RlLiAqL1xuXHRyZWFkb25seSBoYXNHaXRIdWJSZW1vdGU/OiBib29sZWFuO1xuXHQvKiogQ3VycmVudCBicmFuY2ggbmFtZS4gKi9cblx0cmVhZG9ubHkgYnJhbmNoTmFtZT86IHN0cmluZztcblx0LyoqIEJhc2UgYnJhbmNoIHRoZSB3b3JrIHRhcmdldHMgKGUuZy4gYG1haW5gKS4gKi9cblx0cmVhZG9ubHkgYmFzZUJyYW5jaE5hbWU/OiBzdHJpbmc7XG5cdC8qKiBVcHN0cmVhbSB0cmFja2luZyBicmFuY2ggKGUuZy4gYG9yaWdpbi9mZWF0dXJlYCkuICovXG5cdHJlYWRvbmx5IHVwc3RyZWFtQnJhbmNoTmFtZT86IHN0cmluZztcblx0LyoqIE51bWJlciBvZiBjb21taXRzIHRoZSB1cHN0cmVhbSBicmFuY2ggaGFzIGFoZWFkIG9mIHRoZSBsb2NhbCBicmFuY2guICovXG5cdHJlYWRvbmx5IGluY29taW5nQ2hhbmdlcz86IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBjb21taXRzIHRoZSBsb2NhbCBicmFuY2ggaGFzIGFoZWFkIG9mIHRoZSB1cHN0cmVhbSBicmFuY2guICovXG5cdHJlYWRvbmx5IG91dGdvaW5nQ2hhbmdlcz86IG51bWJlcjtcblx0LyoqIE51bWJlciBvZiBmaWxlcyB3aXRoIHVuY29tbWl0dGVkIGNoYW5nZXMuICovXG5cdHJlYWRvbmx5IHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcblx0LyoqIFdoZXRoZXIgdGhlIGN1cnJlbnQgYnJhbmNoIGhhcyBjb21taXRzIG5vdCBjb250YWluZWQgaW4gaXRzIGxvY2FsIGJhc2UgYnJhbmNoLiAqL1xuXHRyZWFkb25seSBoYXNCYXNlQnJhbmNoQ2hhbmdlcz86IGJvb2xlYW47XG5cdC8qKiBHaXRIdWIgcmVwb3NpdG9yeSBvd25lciBwYXJzZWQgZnJvbSB0aGUgd29ya2luZyBjb3B5J3MgR2l0SHViIHJlbW90ZSAocHJlZmVycmluZyBgb3JpZ2luYCwgZmFsbGluZyBiYWNrIHRvIHRoZSBmaXJzdCBHaXRIdWIgcmVtb3RlKS4gKi9cblx0cmVhZG9ubHkgZ2l0aHViT3duZXI/OiBzdHJpbmc7XG5cdC8qKiBHaXRIdWIgb3duZXIgcGFyc2VkIGZyb20gdGhlIGN1cnJlbnQgYnJhbmNoJ3MgdXBzdHJlYW0gb3IgcHVzaCByZW1vdGUuICovXG5cdHJlYWRvbmx5IGdpdGh1YkhlYWRPd25lcj86IHN0cmluZztcblx0LyoqIEdpdEh1YiByZXBvc2l0b3J5IG5hbWUgcGFyc2VkIGZyb20gdGhlIHdvcmtpbmcgY29weSdzIEdpdEh1YiByZW1vdGUgKHByZWZlcnJpbmcgYG9yaWdpbmAsIGZhbGxpbmcgYmFjayB0byB0aGUgZmlyc3QgR2l0SHViIHJlbW90ZSkuICovXG5cdHJlYWRvbmx5IGdpdGh1YlJlcG8/OiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjb25zdCBlbnVtIFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZSB7XG5cdE1lcmdlID0gJ21lcmdlJyxcblx0UHVsbFJlcXVlc3QgPSAncHVsbFJlcXVlc3QnLFxufVxuXG4vKiogRHVyYWJsZSBzb3VyY2UtY29udHJvbCB3b3JrZmxvdyBwcm92ZW5hbmNlIGZvciBhIHNlc3Npb24uICovXG5leHBvcnQgaW50ZXJmYWNlIElTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlIHtcblx0cmVhZG9ubHkgbWVyZ2U/OiB7XG5cdFx0LyoqIFJlc3VsdGluZyB0YXJnZXQtYnJhbmNoIEhFQUQgYWZ0ZXIgdGhlIG1vc3QgcmVjZW50IHN1Y2Nlc3NmdWwgbWVyZ2UuICovXG5cdFx0cmVhZG9ubHkgY29tbWl0OiBzdHJpbmc7XG5cdH07XG5cdHJlYWRvbmx5IGxhdGVzdE91dGNvbWU/OiBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWU7XG59XG5cbi8qKiBSZWFkcyB2YWxpZGF0ZWQgc291cmNlLWNvbnRyb2wgd29ya2Zsb3cgcHJvdmVuYW5jZSBmcm9tIHNlc3Npb24gbWV0YWRhdGEuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGUobWV0YTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQpOiBJU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhbHVlID0gbWV0YT8uW1NFU1NJT05fTUVUQV9TT1VSQ0VfQ09OVFJPTF9LRVldO1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgcmF3ID0gdmFsdWUgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj47XG5cdGxldCBtZXJnZTogSVNlc3Npb25Tb3VyY2VDb250cm9sU3RhdGVbJ21lcmdlJ107XG5cdGNvbnN0IHJhd01lcmdlID0gcmF3WydtZXJnZSddO1xuXHRpZiAocmF3TWVyZ2UgJiYgdHlwZW9mIHJhd01lcmdlID09PSAnb2JqZWN0JyAmJiAhQXJyYXkuaXNBcnJheShyYXdNZXJnZSkpIHtcblx0XHRjb25zdCBjb21taXQgPSAocmF3TWVyZ2UgYXMgUmVjb3JkPHN0cmluZywgdW5rbm93bj4pWydjb21taXQnXTtcblx0XHRtZXJnZSA9IHR5cGVvZiBjb21taXQgPT09ICdzdHJpbmcnICYmIGNvbW1pdC5sZW5ndGggPiAwID8geyBjb21taXQgfSA6IHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHJhd0xhdGVzdE91dGNvbWUgPSByYXdbJ2xhdGVzdE91dGNvbWUnXTtcblx0Y29uc3QgbGF0ZXN0T3V0Y29tZSA9IHJhd0xhdGVzdE91dGNvbWUgPT09IFNlc3Npb25Tb3VyY2VDb250cm9sT3V0Y29tZS5NZXJnZSB8fCByYXdMYXRlc3RPdXRjb21lID09PSBTZXNzaW9uU291cmNlQ29udHJvbE91dGNvbWUuUHVsbFJlcXVlc3Rcblx0XHQ/IHJhd0xhdGVzdE91dGNvbWVcblx0XHQ6IHVuZGVmaW5lZDtcblx0aWYgKCFtZXJnZSAmJiAoIWxhdGVzdE91dGNvbWUgfHwgbGF0ZXN0T3V0Y29tZSA9PT0gU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lLk1lcmdlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgbWVyZ2UsIGxhdGVzdE91dGNvbWUgfTtcbn1cblxuLyoqIFJldHVybnMgc2Vzc2lvbiBtZXRhZGF0YSB3aXRoIHNvdXJjZS1jb250cm9sIHdvcmtmbG93IHByb3ZlbmFuY2UgdXBkYXRlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvblNvdXJjZUNvbnRyb2xTdGF0ZShtZXRhOiBTZXNzaW9uTWV0YSB8IHVuZGVmaW5lZCwgc3RhdGU6IElTZXNzaW9uU291cmNlQ29udHJvbFN0YXRlIHwgdW5kZWZpbmVkKTogU2Vzc2lvbk1ldGEgfCB1bmRlZmluZWQge1xuXHRjb25zdCBuZXh0OiBTZXNzaW9uTWV0YSA9IHsgLi4ubWV0YSB9O1xuXHRpZiAoc3RhdGUpIHtcblx0XHRuZXh0W1NFU1NJT05fTUVUQV9TT1VSQ0VfQ09OVFJPTF9LRVldID0gc3RhdGU7XG5cdH0gZWxzZSB7XG5cdFx0ZGVsZXRlIG5leHRbU0VTU0lPTl9NRVRBX1NPVVJDRV9DT05UUk9MX0tFWV07XG5cdH1cblx0cmV0dXJuIE9iamVjdC5rZXlzKG5leHQpLmxlbmd0aCA+IDAgPyBuZXh0IDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEdpdEh1YiBzdGF0ZSBvZiBhIHNlc3Npb24sIGNhcnJpZWQgdW5kZXIge0BsaW5rIFNlc3Npb25NZXRhfSBhdFxuICoge0BsaW5rIFNFU1NJT05fTUVUQV9HSVRIVUJfS0VZfS4gVXNlZCBieSBjbGllbnRzIHRvIGRyaXZlIEdpdEh1Yi1zcGVjaWZpY1xuICogYWZmb3JkYW5jZXMgKGUuZy4gUFIvbWVyZ2UgYnV0dG9ucyBpbiB0aGUgQWdlbnRzIGFwcCkuXG4gKlxuICogQWxsIGZpZWxkcyBhcmUgb3B0aW9uYWwgXHUyMDE0IGFnZW50cyB0aGF0IGRvIG5vdCB0cmFjayBhIHBhcnRpY3VsYXIgZmllbGRcbiAqIHNob3VsZCBvbWl0IGl0IHJhdGhlciB0aGFuIHNlbmQgYSBwbGFjZWhvbGRlciwgc28gY2xpZW50cyBjYW4gZGlzdGluZ3Vpc2hcbiAqIFwidW5rbm93blwiIGZyb20gXCJrbm93biB0byBiZSB6ZXJvXCIuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSVNlc3Npb25HaXRIdWJTdGF0ZSB7XG5cdC8qKiBUaGUgb3duZXIgb2YgdGhlIEdpdEh1YiByZXBvc2l0b3J5LiAqL1xuXHRyZWFkb25seSBvd25lcj86IHN0cmluZztcblx0LyoqIFRoZSBuYW1lIG9mIHRoZSBHaXRIdWIgcmVwb3NpdG9yeS4gKi9cblx0cmVhZG9ubHkgcmVwbz86IHN0cmluZztcblx0LyoqIEdpdEh1YiBwdWxsIHJlcXVlc3QgVVJMcyBmb3VuZCBmb3IgdGhlIHNlc3Npb24ncyBjaGVja291dHMsIG1vc3QgcmVjZW50IGZpcnN0LiAqL1xuXHRyZWFkb25seSBwdWxsUmVxdWVzdFVybHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIFB1bGwgcmVxdWVzdHMgdGhhdCBwcmVkYXRlIGEgZm9sZGVyLWlzb2xhdGVkIHNlc3Npb24uIEFuIGVtcHR5IGFycmF5IGlzIGEgY2FwdHVyZWQgYmFzZWxpbmUuICovXG5cdHJlYWRvbmx5IGluaXRpYWxQdWxsUmVxdWVzdFVybHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0LyoqIFB1bGwgcmVxdWVzdHMgZXhwbGljaXRseSBhc3NvY2lhdGVkIHRocm91Z2ggdXNlciBpbnRlbnQsIG1vc3QgcmVjZW50IGZpcnN0LiAqL1xuXHRyZWFkb25seSBhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBVUkxzIG9mIHRoZSBHaXRIdWIgaXNzdWVzIHJlZmVyZW5jZWQgYnkgdGhlIHNlc3Npb24ncyB1c2VyIG1lc3NhZ2VzLCBpblxuXHQgKiBvcmRlciBvZiBmaXJzdCBhcHBlYXJhbmNlLlxuXHQgKi9cblx0cmVhZG9ubHkgaXNzdWVVcmxzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdC8qKlxuXHQgKiBUaGUgbmFtZSBvZiB0aGUgYnJhbmNoIHRoZSBtb3N0IHJlY2VudCB7QGxpbmsgcHVsbFJlcXVlc3RVcmxzfSBlbnRyeSB3YXMgZm91bmQgKG9yIGNyZWF0ZWQpIGZvci5cblx0ICogQSBwdWxsIHJlcXVlc3QgYWx3YXlzIHJlbGF0ZXMgdG8gYSBicmFuY2g6IHdoZW4gdGhlIHdvcmtpbmcgY29weSBzd2l0Y2hlc1xuXHQgKiB0byBhIGRpZmZlcmVudCBicmFuY2ggdGhlIGhvc3Qga2VlcHMgcmVwb3J0aW5nIHRoZSBrbm93biBwdWxsIHJlcXVlc3QgYnV0XG5cdCAqIHJlc3VtZXMgbG9va2luZyBmb3Igb25lIHRoYXQgYmVsb25ncyB0byB0aGUgbmV3bHkgY2hlY2tlZCBvdXQgYnJhbmNoLlxuXHQgKi9cblx0cmVhZG9ubHkgcHVsbFJlcXVlc3RCcmFuY2hOYW1lPzogc3RyaW5nO1xufVxuXG4vKipcbiAqIFdoZXRoZXIgdGhlIGtub3duIHB1bGwgcmVxdWVzdCBvZiBgZ2l0SHViU3RhdGVgIGJlbG9uZ3MgdG8gYGJyYW5jaE5hbWVgLlxuICpcbiAqIFN0YXRlIHBlcnNpc3RlZCBiZWZvcmUgcHVsbCByZXF1ZXN0cyB3ZXJlIHRyYWNrZWQgcGVyIGJyYW5jaCBoYXMgbm9cbiAqIHtAbGluayBJU2Vzc2lvbkdpdEh1YlN0YXRlLnB1bGxSZXF1ZXN0QnJhbmNoTmFtZX07IHN1Y2ggYSBwdWxsIHJlcXVlc3QgaXNcbiAqIG9wdGltaXN0aWNhbGx5IHRyZWF0ZWQgYXMgYmVsb25naW5nIHRvIHRoZSBnaXZlbiBicmFuY2ggc28gZXhpc3Rpbmcgc2Vzc2lvbnNcbiAqIGtlZXAgdGhlaXIgcHVsbCByZXF1ZXN0IGFmZm9yZGFuY2VzIHVudGlsIHRoZSBob3N0IGhhcyB2ZXJpZmllZCB3aGljaCBicmFuY2hcbiAqIGl0IGFjdHVhbGx5IGJlbG9uZ3MgdG8uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBoYXNTZXNzaW9uUHVsbFJlcXVlc3RGb3JCcmFuY2goZ2l0SHViU3RhdGU6IElTZXNzaW9uR2l0SHViU3RhdGUgfCB1bmRlZmluZWQsIGJyYW5jaE5hbWU6IHN0cmluZyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRpZiAoIWdpdEh1YlN0YXRlPy5wdWxsUmVxdWVzdFVybHM/Lmxlbmd0aCkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRyZXR1cm4gZ2l0SHViU3RhdGUucHVsbFJlcXVlc3RCcmFuY2hOYW1lID09PSB1bmRlZmluZWQgfHwgZ2l0SHViU3RhdGUucHVsbFJlcXVlc3RCcmFuY2hOYW1lID09PSBicmFuY2hOYW1lO1xufVxuXG4vKiogUmV0dXJucyBwdWxsIHJlcXVlc3RzIHJlbGF0ZWQgdG8gdGhlIHNlc3Npb24gcmF0aGVyIHRoYW4gaW5oZXJpdGVkIGZyb20gaXRzIGZvbGRlciBjaGVja291dC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBnZXRTZXNzaW9uUmVsYXRlZFB1bGxSZXF1ZXN0VXJscyhnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCk6IHJlYWRvbmx5IHN0cmluZ1tdIHtcblx0Y29uc3QgcHVsbFJlcXVlc3RVcmxzID0gZ2l0SHViU3RhdGU/LnB1bGxSZXF1ZXN0VXJscyA/PyBbXTtcblx0Y29uc3QgaW5pdGlhbFB1bGxSZXF1ZXN0VXJscyA9IGdpdEh1YlN0YXRlPy5pbml0aWFsUHVsbFJlcXVlc3RVcmxzO1xuXHRjb25zdCBpbml0aWFsVXJscyA9IG5ldyBTZXQoaW5pdGlhbFB1bGxSZXF1ZXN0VXJscz8ubWFwKHVybCA9PiB1cmwudG9Mb3dlckNhc2UoKSkgPz8gW10pO1xuXHRjb25zdCBhc3NvY2lhdGVkVXJscyA9IG5ldyBTZXQoZ2l0SHViU3RhdGU/LmFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHM/Lm1hcCh1cmwgPT4gdXJsLnRvTG93ZXJDYXNlKCkpID8/IFtdKTtcblx0cmV0dXJuIHB1bGxSZXF1ZXN0VXJscy5maWx0ZXIodXJsID0+ICFpbml0aWFsVXJscy5oYXModXJsLnRvTG93ZXJDYXNlKCkpIHx8IGFzc29jaWF0ZWRVcmxzLmhhcyh1cmwudG9Mb3dlckNhc2UoKSkpO1xufVxuXG4vKiogTWF4aW11bSBwdWxsIHJlcXVlc3RzIHJldGFpbmVkIGZvciBhIHNlc3Npb24uICovXG5leHBvcnQgY29uc3QgTUFYX1NFU1NJT05fUFVMTF9SRVFVRVNUX1JFRkVSRU5DRVMgPSAxMDtcblxuZnVuY3Rpb24gbm9ybWFsaXplU2Vzc2lvblB1bGxSZXF1ZXN0VXJscyh1cmxzOiByZWFkb25seSBzdHJpbmdbXSk6IHN0cmluZ1tdIHtcblx0Y29uc3Qgbm9ybWFsaXplZFVybHMgPSB1cmxzLm1hcCh1cmwgPT4ge1xuXHRcdGNvbnN0IG1hdGNoID0gL15odHRwczpcXC9cXC8oPzxob3N0PlteL10rKVxcLyg/PG93bmVyPlteL10rKVxcLyg/PHJlcG8+W14vXSspXFwvcHVsbFxcLyg/PG51bWJlcj5cXGQrKVxcLz8kLy5leGVjKHVybCk7XG5cdFx0Y29uc3QgZ3JvdXBzID0gbWF0Y2g/Lmdyb3Vwcztcblx0XHRyZXR1cm4gZ3JvdXBzXG5cdFx0XHQ/IGBodHRwczovLyR7Z3JvdXBzWydob3N0J10udG9Mb3dlckNhc2UoKX0vJHtncm91cHNbJ293bmVyJ119LyR7Z3JvdXBzWydyZXBvJ119L3B1bGwvJHtncm91cHNbJ251bWJlciddfWBcblx0XHRcdDogdXJsO1xuXHR9KTtcblx0cmV0dXJuIGRpc3RpbmN0KG5vcm1hbGl6ZWRVcmxzLCB1cmwgPT4gdXJsLnRvTG93ZXJDYXNlKCkpLnNsaWNlKDAsIE1BWF9TRVNTSU9OX1BVTExfUkVRVUVTVF9SRUZFUkVOQ0VTKTtcbn1cblxuLyoqIFJldHVybnMgR2l0SHViIHN0YXRlIHdpdGggYHB1bGxSZXF1ZXN0VXJsYCBtb3ZlZCB0byB0aGUgZnJvbnQgb2YgaXRzIGJvdW5kZWQgaGlzdG9yeS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoTW9zdFJlY2VudFNlc3Npb25QdWxsUmVxdWVzdChnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCwgcHVsbFJlcXVlc3RVcmw6IHN0cmluZywgYnJhbmNoTmFtZTogc3RyaW5nKTogSVNlc3Npb25HaXRIdWJTdGF0ZSB7XG5cdGNvbnN0IHB1bGxSZXF1ZXN0VXJscyA9IG5vcm1hbGl6ZVNlc3Npb25QdWxsUmVxdWVzdFVybHMoW1xuXHRcdHB1bGxSZXF1ZXN0VXJsLFxuXHRcdC4uLihnaXRIdWJTdGF0ZT8ucHVsbFJlcXVlc3RVcmxzID8/IFtdKVxuXHRdKTtcblxuXHRyZXR1cm4ge1xuXHRcdHB1bGxSZXF1ZXN0VXJscyxcblx0XHRwdWxsUmVxdWVzdEJyYW5jaE5hbWU6IGJyYW5jaE5hbWUsXG5cdH07XG59XG5cbi8qKiBSZXR1cm5zIHN0YXRlIHRoYXQgcHJvbW90ZXMgYSBwdWxsIHJlcXVlc3QgZnJvbSB0aGUgZm9sZGVyIGJhc2VsaW5lIGludG8gdGhlIHNlc3Npb24uICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aE1vc3RSZWNlbnRSZWxhdGVkU2Vzc2lvblB1bGxSZXF1ZXN0KGdpdEh1YlN0YXRlOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkLCBwdWxsUmVxdWVzdFVybDogc3RyaW5nLCBicmFuY2hOYW1lOiBzdHJpbmcpOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHtcblx0Y29uc3QgbmV4dCA9IHdpdGhNb3N0UmVjZW50U2Vzc2lvblB1bGxSZXF1ZXN0KGdpdEh1YlN0YXRlLCBwdWxsUmVxdWVzdFVybCwgYnJhbmNoTmFtZSk7XG5cdGNvbnN0IHByb21vdGVkVXJsID0gbm9ybWFsaXplU2Vzc2lvblB1bGxSZXF1ZXN0VXJscyhbcHVsbFJlcXVlc3RVcmxdKVswXT8udG9Mb3dlckNhc2UoKTtcblx0Y29uc3QgaW5pdGlhbFB1bGxSZXF1ZXN0VXJscyA9IGdpdEh1YlN0YXRlPy5pbml0aWFsUHVsbFJlcXVlc3RVcmxzO1xuXHRjb25zdCBhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzID0gbm9ybWFsaXplU2Vzc2lvblB1bGxSZXF1ZXN0VXJscyhbXG5cdFx0cHVsbFJlcXVlc3RVcmwsXG5cdFx0Li4uKGdpdEh1YlN0YXRlPy5hc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzID8/IFtdKVxuXHRdKTtcblx0cmV0dXJuIHtcblx0XHQuLi5uZXh0LFxuXHRcdGFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHMsXG5cdFx0Li4uKGluaXRpYWxQdWxsUmVxdWVzdFVybHMgIT09IHVuZGVmaW5lZCA/IHtcblx0XHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM6IGluaXRpYWxQdWxsUmVxdWVzdFVybHMuZmlsdGVyKHVybCA9PiB1cmwudG9Mb3dlckNhc2UoKSAhPT0gcHJvbW90ZWRVcmwpXG5cdFx0fSA6IHt9KSxcblx0fTtcbn1cblxuLyoqIFJldHVybnMgc3RhdGUgdGhhdCByZWNvcmRzIGEgcHVsbCByZXF1ZXN0IGluIHRoZSBmb2xkZXItc2Vzc2lvbiBiYXNlbGluZS4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoSW5pdGlhbFNlc3Npb25QdWxsUmVxdWVzdChnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCwgcHVsbFJlcXVlc3RVcmw/OiBzdHJpbmcpOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHtcblx0cmV0dXJuIHtcblx0XHRpbml0aWFsUHVsbFJlcXVlc3RVcmxzOiBub3JtYWxpemVTZXNzaW9uUHVsbFJlcXVlc3RVcmxzKFtcblx0XHRcdC4uLihwdWxsUmVxdWVzdFVybCA/IFtwdWxsUmVxdWVzdFVybF0gOiBbXSksXG5cdFx0XHQuLi4oZ2l0SHViU3RhdGU/LmluaXRpYWxQdWxsUmVxdWVzdFVybHMgPz8gW10pXG5cdFx0XSlcblx0fTtcbn1cblxuLyoqIFJldHVybnMgc3RhdGUgdGhhdCByZWNvcmRzIGEgdXNlci1yZWZlcmVuY2VkIHB1bGwgcmVxdWVzdCB3aXRob3V0IGNoYW5naW5nIGNoZWNrb3V0IFBSIHN0YXRlLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhNb3N0UmVjZW50UmVmZXJlbmNlZFNlc3Npb25QdWxsUmVxdWVzdChnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCwgcHVsbFJlcXVlc3RVcmw6IHN0cmluZyk6IElTZXNzaW9uR2l0SHViU3RhdGUge1xuXHRjb25zdCBhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzID0gbm9ybWFsaXplU2Vzc2lvblB1bGxSZXF1ZXN0VXJscyhbXG5cdFx0cHVsbFJlcXVlc3RVcmwsXG5cdFx0Li4uKGdpdEh1YlN0YXRlPy5hc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzID8/IFtdKVxuXHRdKTtcblx0cmV0dXJuIHtcblx0XHRhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzLFxuXHR9O1xufVxuXG4vKipcbiAqIFJlYWRzIHRoZSB3ZWxsLWtub3duIGdpdC1zdGF0ZSBwYXlsb2FkIGZyb20ge0BsaW5rIFNlc3Npb25NZXRhfSwgaWZcbiAqIHByZXNlbnQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWV0YSBiYWcgaXMgYWJzZW50IG9yIHRoZSB2YWx1ZSBhdFxuICogdGhlIGdpdCBrZXkgaXMgbm90IGEgcGxhaW4gb2JqZWN0IChlLmcuIGFuIGFycmF5IG9yIGEgcHJpbWl0aXZlKS5cbiAqIEluZGl2aWR1YWwgZmllbGRzIHdpdGggd3JvbmcgdHlwZXMgYXJlIHNpbGVudGx5IGRyb3BwZWQgc28gcGFydGlhbCBzdGF0ZVxuICogc3RpbGwgcHJvcGFnYXRlcy5cbiAqXG4gKiBVbmxpa2UgdGhlIG90aGVyIHR5cGVkIHJlYWRlcnMsIHRoaXMgdGFrZXMgdGhlIHJhdyB7QGxpbmsgU2Vzc2lvbk1ldGF9IHZhbHVlXG4gKiByYXRoZXIgdGhhbiBpdHMgcGFyZW50IHtAbGluayBTZXNzaW9uU3RhdGV9OiB0aGUgc2Vzc2lvbnMgcHJvdmlkZXIgc3RvcmVzIGFuZFxuICogcmVhZHMgYSBkZXRhY2hlZCBtZXRhIHNuYXBzaG90IHdpdGhvdXQgcmV0YWluaW5nIHRoZSBvd25pbmcgc3RhdGUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWFkU2Vzc2lvbkdpdFN0YXRlKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkKTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHZhbHVlID0gbWV0YT8uW1NFU1NJT05fTUVUQV9HSVRfS0VZXTtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0Y29uc3QgcmVzdWx0OiB7XG5cdFx0aGFzR2l0SHViUmVtb3RlPzogYm9vbGVhbjtcblx0XHRicmFuY2hOYW1lPzogc3RyaW5nO1xuXHRcdGJhc2VCcmFuY2hOYW1lPzogc3RyaW5nO1xuXHRcdHVwc3RyZWFtQnJhbmNoTmFtZT86IHN0cmluZztcblx0XHRpbmNvbWluZ0NoYW5nZXM/OiBudW1iZXI7XG5cdFx0b3V0Z29pbmdDaGFuZ2VzPzogbnVtYmVyO1xuXHRcdHVuY29tbWl0dGVkQ2hhbmdlcz86IG51bWJlcjtcblx0XHRoYXNCYXNlQnJhbmNoQ2hhbmdlcz86IGJvb2xlYW47XG5cdFx0Z2l0aHViT3duZXI/OiBzdHJpbmc7XG5cdFx0Z2l0aHViSGVhZE93bmVyPzogc3RyaW5nO1xuXHRcdGdpdGh1YlJlcG8/OiBzdHJpbmc7XG5cdH0gPSB7fTtcblx0aWYgKHR5cGVvZiByYXdbJ2hhc0dpdEh1YlJlbW90ZSddID09PSAnYm9vbGVhbicpIHsgcmVzdWx0Lmhhc0dpdEh1YlJlbW90ZSA9IHJhd1snaGFzR2l0SHViUmVtb3RlJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2JyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LmJyYW5jaE5hbWUgPSByYXdbJ2JyYW5jaE5hbWUnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snYmFzZUJyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LmJhc2VCcmFuY2hOYW1lID0gcmF3WydiYXNlQnJhbmNoTmFtZSddOyB9XG5cdGlmICh0eXBlb2YgcmF3Wyd1cHN0cmVhbUJyYW5jaE5hbWUnXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnVwc3RyZWFtQnJhbmNoTmFtZSA9IHJhd1sndXBzdHJlYW1CcmFuY2hOYW1lJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2luY29taW5nQ2hhbmdlcyddID09PSAnbnVtYmVyJykgeyByZXN1bHQuaW5jb21pbmdDaGFuZ2VzID0gcmF3WydpbmNvbWluZ0NoYW5nZXMnXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snb3V0Z29pbmdDaGFuZ2VzJ10gPT09ICdudW1iZXInKSB7IHJlc3VsdC5vdXRnb2luZ0NoYW5nZXMgPSByYXdbJ291dGdvaW5nQ2hhbmdlcyddOyB9XG5cdGlmICh0eXBlb2YgcmF3Wyd1bmNvbW1pdHRlZENoYW5nZXMnXSA9PT0gJ251bWJlcicpIHsgcmVzdWx0LnVuY29tbWl0dGVkQ2hhbmdlcyA9IHJhd1sndW5jb21taXR0ZWRDaGFuZ2VzJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2hhc0Jhc2VCcmFuY2hDaGFuZ2VzJ10gPT09ICdib29sZWFuJykgeyByZXN1bHQuaGFzQmFzZUJyYW5jaENoYW5nZXMgPSByYXdbJ2hhc0Jhc2VCcmFuY2hDaGFuZ2VzJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ2dpdGh1Yk93bmVyJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJPd25lciA9IHJhd1snZ2l0aHViT3duZXInXTsgfVxuXHRpZiAodHlwZW9mIHJhd1snZ2l0aHViSGVhZE93bmVyJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJIZWFkT3duZXIgPSByYXdbJ2dpdGh1YkhlYWRPd25lciddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydnaXRodWJSZXBvJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5naXRodWJSZXBvID0gcmF3WydnaXRodWJSZXBvJ107IH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIGEgbmV3IHtAbGluayBTZXNzaW9uTWV0YX0gd2l0aCB0aGUgZ2l0LXN0YXRlIHBheWxvYWQgc2V0IHRvXG4gKiBgZ2l0U3RhdGVgLCBvciB3aXRoIHRoZSBnaXQgc2xvdCByZW1vdmVkIGlmIGBnaXRTdGF0ZWAgaXMgYHVuZGVmaW5lZGAuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIGlmIHRoZSByZXN1bHQgd291bGQgYmUgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvbkdpdFN0YXRlKG1ldGE6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkLCBnaXRTdGF0ZTogSVNlc3Npb25HaXRTdGF0ZSB8IHVuZGVmaW5lZCk6IFNlc3Npb25NZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV4dDogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gPSB7IC4uLm1ldGEgfTtcblx0aWYgKGdpdFN0YXRlICE9PSB1bmRlZmluZWQpIHtcblx0XHRuZXh0W1NFU1NJT05fTUVUQV9HSVRfS0VZXSA9IGdpdFN0YXRlO1xuXHR9IGVsc2Uge1xuXHRcdGRlbGV0ZSBuZXh0W1NFU1NJT05fTUVUQV9HSVRfS0VZXTtcblx0fVxuXHRyZXR1cm4gT2JqZWN0LmtleXMobmV4dCkubGVuZ3RoID4gMCA/IG5leHQgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHdlbGwta25vd24gR2l0SHViIHN0YXRlIHBheWxvYWQgZnJvbSB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSwgaWZcbiAqIHByZXNlbnQuIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWV0YSBiYWcgaXMgYWJzZW50IG9yIHRoZSB2YWx1ZSBhdCB0aGVcbiAqIEdpdEh1YiBrZXkgaXMgbm90IGEgcGxhaW4gb2JqZWN0IChlLmcuIGFuIGFycmF5IG9yIGEgcHJpbWl0aXZlKS5cbiAqIEluZGl2aWR1YWwgZmllbGRzIHdpdGggd3JvbmcgdHlwZXMgYXJlIHNpbGVudGx5IGRyb3BwZWQgc28gcGFydGlhbCBzdGF0ZVxuICogc3RpbGwgcHJvcGFnYXRlcy5cbiAqXG4gKiBVbmxpa2UgdGhlIG90aGVyIHR5cGVkIHJlYWRlcnMsIHRoaXMgdGFrZXMgdGhlIHJhdyB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfVxuICogdmFsdWUgcmF0aGVyIHRoYW4gaXRzIHBhcmVudCB7QGxpbmsgU2Vzc2lvblN0YXRlfTogdGhlIHNlc3Npb25zIHByb3ZpZGVyIHN0b3JlcyBhbmRcbiAqIHJlYWRzIGEgZGV0YWNoZWQgbWV0YSBzbmFwc2hvdCB3aXRob3V0IHJldGFpbmluZyB0aGUgb3duaW5nIHN0YXRlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25HaXRIdWJTdGF0ZShtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQpOiBJU2Vzc2lvbkdpdEh1YlN0YXRlIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdmFsdWUgPSBtZXRhPy5bU0VTU0lPTl9NRVRBX0dJVEhVQl9LRVldO1xuXHRpZiAoIXZhbHVlIHx8IHR5cGVvZiB2YWx1ZSAhPT0gJ29iamVjdCcgfHwgQXJyYXkuaXNBcnJheSh2YWx1ZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJhdyA9IHZhbHVlIGFzIFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXHRjb25zdCByZXN1bHQ6IHtcblx0XHRvd25lcj86IHN0cmluZztcblx0XHRyZXBvPzogc3RyaW5nO1xuXHRcdHB1bGxSZXF1ZXN0VXJscz86IHJlYWRvbmx5IHN0cmluZ1tdO1xuXHRcdGluaXRpYWxQdWxsUmVxdWVzdFVybHM/OiByZWFkb25seSBzdHJpbmdbXTtcblx0XHRhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0aXNzdWVVcmxzPzogcmVhZG9ubHkgc3RyaW5nW107XG5cdFx0cHVsbFJlcXVlc3RCcmFuY2hOYW1lPzogc3RyaW5nO1xuXHR9ID0ge307XG5cblx0aWYgKHR5cGVvZiByYXdbJ293bmVyJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5vd25lciA9IHJhd1snb3duZXInXTsgfVxuXHRpZiAodHlwZW9mIHJhd1sncmVwbyddID09PSAnc3RyaW5nJykgeyByZXN1bHQucmVwbyA9IHJhd1sncmVwbyddOyB9XG5cdGNvbnN0IHB1bGxSZXF1ZXN0VXJscyA9IEFycmF5LmlzQXJyYXkocmF3WydwdWxsUmVxdWVzdFVybHMnXSlcblx0XHQ/IHJhd1sncHVsbFJlcXVlc3RVcmxzJ10uZmlsdGVyKCh1cmwpOiB1cmwgaXMgc3RyaW5nID0+IHR5cGVvZiB1cmwgPT09ICdzdHJpbmcnKVxuXHRcdDogdHlwZW9mIHJhd1sncHVsbFJlcXVlc3RVcmwnXSA9PT0gJ3N0cmluZydcblx0XHRcdD8gW3Jhd1sncHVsbFJlcXVlc3RVcmwnXV1cblx0XHRcdDogW107XG5cdGlmIChwdWxsUmVxdWVzdFVybHMubGVuZ3RoID4gMCkge1xuXHRcdHJlc3VsdC5wdWxsUmVxdWVzdFVybHMgPSBub3JtYWxpemVTZXNzaW9uUHVsbFJlcXVlc3RVcmxzKHB1bGxSZXF1ZXN0VXJscyk7XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkocmF3Wydpbml0aWFsUHVsbFJlcXVlc3RVcmxzJ10pKSB7XG5cdFx0cmVzdWx0LmluaXRpYWxQdWxsUmVxdWVzdFVybHMgPSBub3JtYWxpemVTZXNzaW9uUHVsbFJlcXVlc3RVcmxzKHJhd1snaW5pdGlhbFB1bGxSZXF1ZXN0VXJscyddLmZpbHRlcigodXJsKTogdXJsIGlzIHN0cmluZyA9PiB0eXBlb2YgdXJsID09PSAnc3RyaW5nJykpO1xuXHR9XG5cdGlmIChBcnJheS5pc0FycmF5KHJhd1snYXNzb2NpYXRlZFB1bGxSZXF1ZXN0VXJscyddKSkge1xuXHRcdGNvbnN0IGFzc29jaWF0ZWRQdWxsUmVxdWVzdFVybHMgPSBub3JtYWxpemVTZXNzaW9uUHVsbFJlcXVlc3RVcmxzKHJhd1snYXNzb2NpYXRlZFB1bGxSZXF1ZXN0VXJscyddLmZpbHRlcigodXJsKTogdXJsIGlzIHN0cmluZyA9PiB0eXBlb2YgdXJsID09PSAnc3RyaW5nJykpO1xuXHRcdGlmIChhc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzLmxlbmd0aCA+IDApIHtcblx0XHRcdHJlc3VsdC5hc3NvY2lhdGVkUHVsbFJlcXVlc3RVcmxzID0gYXNzb2NpYXRlZFB1bGxSZXF1ZXN0VXJscztcblx0XHR9XG5cdH1cblx0aWYgKEFycmF5LmlzQXJyYXkocmF3Wydpc3N1ZVVybHMnXSkpIHsgcmVzdWx0Lmlzc3VlVXJscyA9IHJhd1snaXNzdWVVcmxzJ10uZmlsdGVyKCh1cmwpOiB1cmwgaXMgc3RyaW5nID0+IHR5cGVvZiB1cmwgPT09ICdzdHJpbmcnKTsgfVxuXHRpZiAodHlwZW9mIHJhd1sncHVsbFJlcXVlc3RCcmFuY2hOYW1lJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5wdWxsUmVxdWVzdEJyYW5jaE5hbWUgPSByYXdbJ3B1bGxSZXF1ZXN0QnJhbmNoTmFtZSddOyB9XG5cdHJldHVybiByZXN1bHQ7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSB3aXRoIHRoZSBHaXRIdWItc3RhdGUgcGF5bG9hZCBzZXQgdG9cbiAqIGBnaXRIdWJTdGF0ZWAsIG9yIHdpdGggdGhlIEdpdEh1YiBzbG90IHJlbW92ZWQgaWYgYGdpdEh1YlN0YXRlYCBpcyBgdW5kZWZpbmVkYC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgaWYgdGhlIHJlc3VsdCB3b3VsZCBiZSBlbXB0eS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXNzaW9uR2l0SHViU3RhdGUobWV0YTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkLCBnaXRIdWJTdGF0ZTogSVNlc3Npb25HaXRIdWJTdGF0ZSB8IHVuZGVmaW5lZCk6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0geyAuLi5tZXRhIH07XG5cdGlmIChnaXRIdWJTdGF0ZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0bmV4dFtTRVNTSU9OX01FVEFfR0lUSFVCX0tFWV0gPSBnaXRIdWJTdGF0ZTtcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtTRVNTSU9OX01FVEFfR0lUSFVCX0tFWV07XG5cdH1cblx0cmV0dXJuIE9iamVjdC5rZXlzKG5leHQpLmxlbmd0aCA+IDAgPyBuZXh0IDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSByZWNvcmRpbmcgaG93IGRlZXBseSBhIHNlc3Npb25cbiAqIHdhcyBzcGF3bmVkIHZpYSB0aGUgYGNyZWF0ZV9zZXNzaW9uYCBob3N0IHRvb2wgKDAgZm9yIGEgdG9wLWxldmVsLCB1c2VyLWNyZWF0ZWRcbiAqIHNlc3Npb24pLiBVc2VkIHRvIGJvdW5kIHJlY3Vyc2l2ZSBzZXNzaW9uIGNyZWF0aW9uLiBWUyBDb2RlLXNwZWNpZmljIGNvbnZlbnRpb25cbiAqIGxheWVyZWQgb24gdG9wIG9mIHRoZSBwcm90b2NvbCdzIGdlbmVyaWMgYF9tZXRhYCBiYWcuXG4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfU1BBV05fREVQVEhfS0VZID0gJ2FnZW50SG9zdC9zZXNzaW9uU3Bhd25EZXB0aCc7XG5cbi8qKlxuICogUmVhZHMgdGhlIGBjcmVhdGVfc2Vzc2lvbmAgc3Bhd24gZGVwdGggZnJvbSBhIHtAbGluayBTZXNzaW9uU3VtbWFyeU1ldGF9IGJhZyxcbiAqIHJldHVybmluZyBgMGAgd2hlbiB0aGUga2V5IGlzIGFic2VudCBvciBub3QgYSBmaW5pdGUgbnVtYmVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25TcGF3bkRlcHRoKG1ldGE6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCk6IG51bWJlciB7XG5cdGNvbnN0IHZhbHVlID0gbWV0YT8uW1NFU1NJT05fTUVUQV9TUEFXTl9ERVBUSF9LRVldO1xuXHRyZXR1cm4gdHlwZW9mIHZhbHVlID09PSAnbnVtYmVyJyAmJiBOdW1iZXIuaXNGaW5pdGUodmFsdWUpID8gdmFsdWUgOiAwO1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcge0BsaW5rIFNlc3Npb25TdW1tYXJ5TWV0YX0gd2l0aCB0aGUgYGNyZWF0ZV9zZXNzaW9uYCBzcGF3biBkZXB0aFxuICogc2V0IHRvIGBkZXB0aGAsIHByZXNlcnZpbmcgYW55IG90aGVyIGtleXMgaW4gdGhlIGJhZy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXNzaW9uU3Bhd25EZXB0aChtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQsIGRlcHRoOiBudW1iZXIpOiBTZXNzaW9uU3VtbWFyeU1ldGEge1xuXHRyZXR1cm4geyAuLi5tZXRhLCBbU0VTU0lPTl9NRVRBX1NQQVdOX0RFUFRIX0tFWV06IGRlcHRoIH07XG59XG5cbi8qKlxuICogUmVzZXJ2ZWQga2V5IHVuZGVyIHtAbGluayBTZXNzaW9uU3VtbWFyeU1ldGF9IG1hcmtpbmcgYSBzZXNzaW9uIGFzXG4gKiB3b3Jrc3BhY2UtbGVzczogYSBzZXNzaW9uIHdpdGggbm8gd29ya3NwYWNlL2ZvbGRlciBiaW5kaW5nIChzdXJmYWNlZCBpbiB0aGVcbiAqIFVJIGFzIGEgXCJRdWljayBDaGF0XCIpLiBDYXJyaWVkIG9uIHRoZSBzdW1tYXJ5IGJhZyAobm90IHRoZSBmdWxsIHN0YXRlKSBzb1xuICogY2xpZW50cyBjYW4gZ3JvdXAvc3R5bGUgc3VjaCBzZXNzaW9ucyBpbiBzZXNzaW9uIGxpc3RzIHdpdGhvdXQgc3Vic2NyaWJpbmcgdG9cbiAqIGZ1bGwgc2Vzc2lvbiBzdGF0ZS4gVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uIGxheWVyZWQgb24gdGhlIHByb3RvY29sJ3NcbiAqIGdlbmVyaWMgYF9tZXRhYCBiYWcuXG4gKi9cbmV4cG9ydCBjb25zdCBTRVNTSU9OX01FVEFfV09SS1NQQUNFTEVTU19LRVkgPSAnd29ya3NwYWNlbGVzcyc7XG5cbi8qKlxuICogU2Vzc2lvbi1kYXRhYmFzZSBtZXRhZGF0YSBrZXkgcmVjb3JkaW5nIHdoZXRoZXIgYSBzZXNzaW9uIGlzIHdvcmtzcGFjZS1sZXNzIChhXG4gKiB3b3Jrc3BhY2UtbGVzcyBjaGF0KS4gT3duZWQgYnkgdGhlIEFIIHNlcnZpY2U6IGBBZ2VudFNlcnZpY2VgIHdyaXRlcyBpdCBjZW50cmFsbHkgYXRcbiAqIGNyZWF0ZS9tYXRlcmlhbGl6ZSBhbmQgb3ZlcmxheXMgaXQgb250byBldmVyeSBhZ2VudCdzIHN1bW1hcnkgYF9tZXRhYCBpblxuICogYGxpc3RTZXNzaW9uc2A7IGFnZW50cyBvbmx5IHJlYWQgaXQgKGUuZy4gdG8gcGljayB0aGUgd29ya3NwYWNlLWxlc3Mgc3lzdGVtIHByb21wdFxuICogb24gcmVzdW1lKSBhbmQgbmV2ZXIgcGVyc2lzdCBpdCB0aGVtc2VsdmVzLlxuICovXG5leHBvcnQgY29uc3QgQUhfTUVUQV9XT1JLU1BBQ0VMRVNTX0RCX0tFWSA9ICdhZ2VudEhvc3Qud29ya3NwYWNlbGVzcyc7XG5cbi8qKlxuICogU2Vzc2lvbi1kYXRhYmFzZSBtZXRhZGF0YSBrZXkgcmVjb3JkaW5nIHdoZXRoZXIgYSBzZXNzaW9uIGlzIGFyY2hpdmVkLiBXcml0dGVuIGJ5XG4gKiB0aGUgQUggb3JjaGVzdHJhdG9yIChgQWdlbnRTaWRlRWZmZWN0c2Agb24gYFNlc3Npb25Jc0FyY2hpdmVkQ2hhbmdlZGApIGFuZCByZWFkIGJ5XG4gKiBib3RoIHRoZSBvcmNoZXN0cmF0b3IgKGBBZ2VudFNlcnZpY2VgIHJlc3RvcmUvbGlzdCkgYW5kIGFnZW50cyAoZS5nLiBgQ29waWxvdEFnZW50YFxuICogZGVjaWRlcyB3aGV0aGVyIHRvIHJlY3JlYXRlIGEgbWlzc2luZyB3b3JrdHJlZSB2cy4gcmVzdW1lIHJlYWQtb25seSBmb3IgaGlzdG9yeSkuXG4gKiB7QGxpbmsgQUhfTUVUQV9JU19ET05FX0RCX0tFWX0gaXMgdGhlIGxlZ2FjeSBuYW1lIGtlcHQgZm9yIHNlc3Npb25zIHBlcnNpc3RlZCBiZWZvcmVcbiAqIHRoZSByZW5hbWU7IHJlYWRlcnMgZmFsbCBiYWNrIHRvIGl0IHdoZW4ge0BsaW5rIEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZfSBpcyBhYnNlbnQuXG4gKi9cbmV4cG9ydCBjb25zdCBBSF9NRVRBX0lTX0FSQ0hJVkVEX0RCX0tFWSA9ICdpc0FyY2hpdmVkJztcblxuLyoqIExlZ2FjeSBtZXRhZGF0YSBrZXkgZm9yIHRoZSBhcmNoaXZlZCBmbGFnOyBzZWUge0BsaW5rIEFIX01FVEFfSVNfQVJDSElWRURfREJfS0VZfS4gKi9cbmV4cG9ydCBjb25zdCBBSF9NRVRBX0lTX0RPTkVfREJfS0VZID0gJ2lzRG9uZSc7XG5cbi8qKlxuICogU2Vzc2lvbi1kYXRhYmFzZSBtZXRhZGF0YSBrZXkgcmVjb3JkaW5nIHdoZXRoZXIgYSBzZXNzaW9uIGhhcyBiZWVuIHJlYWQuIFRoaXMgaXNcbiAqIHRoZSBvbmx5IGR1cmFibGUgcmVwcmVzZW50YXRpb24gb2YgcmVhZCBzdGF0ZTsgdGhlIGluLW1lbW9yeSB0cnV0aCBpc1xuICoge0BsaW5rIFNlc3Npb25TdGF0dXMuSXNSZWFkfS4gVGhlIGhvc3Qgb3ducyBpdCBcdTIwMTQgbm8gYWdlbnQgU0RLIHRyYWNrcyByZWFkIHN0YXRlLlxuICovXG5leHBvcnQgY29uc3QgQUhfTUVUQV9JU19SRUFEX0RCX0tFWSA9ICdpc1JlYWQnO1xuXG4vKiogUmV0dXJucyBgc3RhdHVzYCB3aXRoIGBmbGFnYCBzZXQgb3IgY2xlYXJlZC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvblN0YXR1c0ZsYWcoc3RhdHVzOiBTZXNzaW9uU3RhdHVzLCBmbGFnOiBTZXNzaW9uU3RhdHVzLCBzZXQ6IGJvb2xlYW4pOiBTZXNzaW9uU3RhdHVzIHtcblx0cmV0dXJuIHNldCA/IChzdGF0dXMgfCBmbGFnKSA6IChzdGF0dXMgJiB+ZmxhZyk7XG59XG5cbi8qKiBXaGV0aGVyIHRoZSB7QGxpbmsgU2Vzc2lvblN0YXR1cy5Jc1JlYWR9IGZsYWcgYml0IGlzIHNldC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1Nlc3Npb25TdGF0dXNSZWFkKHN0YXR1czogU2Vzc2lvblN0YXR1cyB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc3RhdHVzICE9PSB1bmRlZmluZWQgJiYgKHN0YXR1cyAmIFNlc3Npb25TdGF0dXMuSXNSZWFkKSAhPT0gMDtcbn1cblxuLyoqIFdoZXRoZXIgdGhlIHtAbGluayBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWR9IGZsYWcgYml0IGlzIHNldC4gKi9cbmV4cG9ydCBmdW5jdGlvbiBpc1Nlc3Npb25TdGF0dXNBcmNoaXZlZChzdGF0dXM6IFNlc3Npb25TdGF0dXMgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHN0YXR1cyAhPT0gdW5kZWZpbmVkICYmIChzdGF0dXMgJiBTZXNzaW9uU3RhdHVzLklzQXJjaGl2ZWQpICE9PSAwO1xufVxuXG4vKipcbiAqIFJlYWRzIHRoZSB3b3Jrc3BhY2UtbGVzcyBtYXJrZXIgZnJvbSB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfS4gUmV0dXJuc1xuICogYHRydWVgIG9ubHkgd2hlbiB0aGUgd2VsbC1rbm93biBrZXkgaXMgcHJlc2VudCBhbmQgc2V0IHRvIGJvb2xlYW4gYHRydWVgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25Xb3Jrc3BhY2VsZXNzKG1ldGE6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gbWV0YT8uW1NFU1NJT05fTUVUQV9XT1JLU1BBQ0VMRVNTX0tFWV0gPT09IHRydWU7XG59XG5cbi8qKlxuICogUmV0dXJucyBhIG5ldyB7QGxpbmsgU2Vzc2lvblN1bW1hcnlNZXRhfSB3aXRoIHRoZSB3b3Jrc3BhY2UtbGVzcyBtYXJrZXIgc2V0LFxuICogb3Igd2l0aCB0aGUgc2xvdCByZW1vdmVkIHdoZW4gYHdvcmtzcGFjZWxlc3NgIGlzIGBmYWxzZWAuIFJldHVybnMgYHVuZGVmaW5lZGBcbiAqIGlmIHRoZSByZXN1bHQgd291bGQgYmUgZW1wdHkuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvbldvcmtzcGFjZWxlc3MobWV0YTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkLCB3b3Jrc3BhY2VsZXNzOiBib29sZWFuKTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbmV4dDogeyBba2V5OiBzdHJpbmddOiB1bmtub3duIH0gPSB7IC4uLm1ldGEgfTtcblx0aWYgKHdvcmtzcGFjZWxlc3MpIHtcblx0XHRuZXh0W1NFU1NJT05fTUVUQV9XT1JLU1BBQ0VMRVNTX0tFWV0gPSB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdGRlbGV0ZSBuZXh0W1NFU1NJT05fTUVUQV9XT1JLU1BBQ0VMRVNTX0tFWV07XG5cdH1cblx0cmV0dXJuIE9iamVjdC5rZXlzKG5leHQpLmxlbmd0aCA+IDAgPyBuZXh0IDogdW5kZWZpbmVkO1xufVxuXG4vKiogV2hldGhlciB0aGUgc2Vzc2lvbiB3YXMgZmlyc3QgZGlzY292ZXJlZCBpbiBhIHByb3ZpZGVyLW5hdGl2ZSBjYXRhbG9nLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJlYWRTZXNzaW9uRXh0ZXJuYWwobWV0YTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBtZXRhPy5bU0VTU0lPTl9NRVRBX0VYVEVSTkFMX0tFWV0gPT09IHRydWU7XG59XG5cbi8qKiBSZXR1cm5zIGEgY29weSBvZiBgbWV0YWAgd2l0aCB0aGUgZXh0ZXJuYWwtc2Vzc2lvbiBwcm92ZW5hbmNlIG1hcmtlciB1cGRhdGVkLiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHdpdGhTZXNzaW9uRXh0ZXJuYWwobWV0YTogU2Vzc2lvblN1bW1hcnlNZXRhIHwgdW5kZWZpbmVkLCBleHRlcm5hbDogYm9vbGVhbik6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0geyAuLi5tZXRhIH07XG5cdGlmIChleHRlcm5hbCkge1xuXHRcdG5leHRbU0VTU0lPTl9NRVRBX0VYVEVSTkFMX0tFWV0gPSB0cnVlO1xuXHR9IGVsc2Uge1xuXHRcdGRlbGV0ZSBuZXh0W1NFU1NJT05fTUVUQV9FWFRFUk5BTF9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBgX21ldGFgIGtleSBtYXJraW5nIGEgc2Vzc2lvbiBhcyBhbiB1bi1hZG9wdGVkIGxlZ2FjeSBDb3BpbG90IENMSSBzZXNzaW9uXG4gKiBzdXJmYWNlZCAob25seSB1bmRlciB0aGUgbWlncmF0ZSBzZXR0aW5nKSBhcyBhZG9wdGFibGUuIENsaWVudHMgcmVhZCBpdCB0b1xuICogYXZvaWQgcGFzc2l2ZWx5IHN1YnNjcmliaW5nIHRvIFx1MjAxNCBhbmQgdGhlcmVieSBtaWdyYXRpbmcgXHUyMDE0IHRoZSBzZXNzaW9uIGJlZm9yZVxuICogdGhlIHVzZXIgb3BlbnMgaXQuIENsZWFyZWQgaW1wbGljaXRseSBvbmNlIHRoZSBzZXNzaW9uIGlzIGFkb3B0ZWQgKGl0IG5vXG4gKiBsb25nZXIgc3VyZmFjZXMgYXMgYWRvcHRhYmxlKS5cbiAqL1xuZXhwb3J0IGNvbnN0IFNFU1NJT05fTUVUQV9FSENMSV9BRE9QVEFCTEVfS0VZID0gJ2VoY2xpQWRvcHRhYmxlJztcblxuLyoqIFdoZXRoZXIgdGhlIHNlc3Npb24gaXMgYW4gdW4tYWRvcHRlZCBsZWdhY3kgQ29waWxvdCBDTEkgc2Vzc2lvbiBzdXJmYWNlZCBhcyBhZG9wdGFibGUuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZFNlc3Npb25FaGNsaUFkb3B0YWJsZShtZXRhOiBTZXNzaW9uU3VtbWFyeU1ldGEgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIG1ldGE/LltTRVNTSU9OX01FVEFfRUhDTElfQURPUFRBQkxFX0tFWV0gPT09IHRydWU7XG59XG5cbi8qKiBSZXR1cm5zIGEgbmV3IHtAbGluayBTZXNzaW9uU3VtbWFyeU1ldGF9IHdpdGggdGhlIGFkb3B0YWJsZS1sZWdhY3kgbWFya2VyIHNldC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB3aXRoU2Vzc2lvbkVoY2xpQWRvcHRhYmxlKG1ldGE6IFNlc3Npb25TdW1tYXJ5TWV0YSB8IHVuZGVmaW5lZCk6IFNlc3Npb25TdW1tYXJ5TWV0YSB7XG5cdHJldHVybiB7IC4uLm1ldGEsIFtTRVNTSU9OX01FVEFfRUhDTElfQURPUFRBQkxFX0tFWV06IHRydWUgfTtcbn1cblxuLy8gLS0tLSBSb290U3RhdGUgX21ldGEgYWNjZXNzb3JzIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXG4vKipcbiAqIFZTIENvZGUtc2lkZSBhbGlhcyBmb3IgdGhlIHByb3RvY29sJ3Mgb3BlbiBgX21ldGFgIHByb3BlcnR5IGJhZyBvblxuICoge0BsaW5rIFJvb3RTdGF0ZX0uIEtleXMgU0hPVUxEIGJlIG5hbWVzcGFjZWQgdG8gYXZvaWQgY29sbGlzaW9uczsgdmFsdWVzIE1VU1RcbiAqIGJlIEpTT04tc2VyaWFsaXphYmxlLlxuICovXG5leHBvcnQgdHlwZSBSb290TWV0YSA9IFJlY29yZDxzdHJpbmcsIHVua25vd24+O1xuXG4vKipcbiAqIFJlc2VydmVkIGtleSB1bmRlciB7QGxpbmsgUm9vdE1ldGF9IGZvciB0aGUgd2VsbC1rbm93biBob3N0LWJ1aWxkIHBheWxvYWQuXG4gKiBWYWx1ZSBhdCB0aGlzIGtleSwgd2hlbiBwcmVzZW50LCBNVVNUIGJlIHNoYXBlZCBsaWtlIHtAbGluayBJSG9zdEJ1aWxkSW5mb30uXG4gKiBUaGlzIGlzIGEgVlMgQ29kZS1zcGVjaWZpYyBjb252ZW50aW9uIGxheWVyZWQgb24gdG9wIG9mIHRoZSBwcm90b2NvbCdzXG4gKiBnZW5lcmljIGBfbWV0YWAgYmFnIFx1MjAxNCB0aGUgcHJvdG9jb2wgaXRzZWxmIGRvZXMgbm90IGtub3cgYWJvdXQgYnVpbGQgaW5mby5cbiAqL1xuZXhwb3J0IGNvbnN0IFJPT1RfTUVUQV9IT1NUX0JVSUxEX0tFWSA9ICdob3N0QnVpbGQnO1xuXG4vKipcbiAqIEJ1aWxkIGluZm9ybWF0aW9uIGFib3V0IHRoZSBwcm9ncmFtIGhvc3RpbmcgdGhlIGFnZW50IGhvc3QgKHRoZSBWUyBDb2RlIENMSSksXG4gKiBjYXJyaWVkIHVuZGVyIHtAbGluayBSb290TWV0YX0gYXQge0BsaW5rIFJPT1RfTUVUQV9IT1NUX0JVSUxEX0tFWX0uIExldHMgYVxuICogY2xpZW50IHNlZSB3aGljaCBidWlsZCBpcyBob3N0aW5nIGl0IFx1MjAxNCB1c2VmdWwgd2hlbiBpbnNwZWN0aW5nIHRoZSBvdXRwdXQgb2YgYVxuICogcmVtb3RlIGFnZW50IGhvc3QuXG4gKlxuICogQWxsIGZpZWxkcyBleGNlcHQge0BsaW5rIHZlcnNpb259IGFyZSBvcHRpb25hbCBcdTIwMTQgYSBidWlsZCB0aGF0IGRvZXMgbm90IHRyYWNrXG4gKiBhIHBhcnRpY3VsYXIgZmllbGQgc2hvdWxkIG9taXQgaXQuXG4gKi9cbmV4cG9ydCBpbnRlcmZhY2UgSUhvc3RCdWlsZEluZm8ge1xuXHQvKiogUHJvZHVjdCB2ZXJzaW9uIChlLmcuIGAxLjk2LjBgKS4gKi9cblx0cmVhZG9ubHkgdmVyc2lvbjogc3RyaW5nO1xuXHQvKiogQ29tbWl0IFNIQSBvZiB0aGUgYnVpbGQsIGlmIGtub3duLiAqL1xuXHRyZWFkb25seSBjb21taXQ/OiBzdHJpbmc7XG5cdC8qKiBCdWlsZCBkYXRlIChJU08gODYwMSksIGlmIGtub3duLiAqL1xuXHRyZWFkb25seSBkYXRlPzogc3RyaW5nO1xuXHQvKiogUmVsZWFzZSBxdWFsaXR5IChlLmcuIGBzdGFibGVgLCBgaW5zaWRlcmApLCBpZiBrbm93bi4gKi9cblx0cmVhZG9ubHkgcXVhbGl0eT86IHN0cmluZztcbn1cblxuLyoqXG4gKiBEZXJpdmVzIHtAbGluayBJSG9zdEJ1aWxkSW5mb30gZnJvbSB0aGUgaG9zdCdzIHtAbGluayBJUHJvZHVjdFNlcnZpY2V9LlxuICovXG5leHBvcnQgZnVuY3Rpb24gaG9zdEJ1aWxkSW5mb0Zyb21Qcm9kdWN0KHByb2R1Y3RTZXJ2aWNlOiBJUHJvZHVjdFNlcnZpY2UpOiBJSG9zdEJ1aWxkSW5mbyB7XG5cdHJldHVybiB7XG5cdFx0dmVyc2lvbjogcHJvZHVjdFNlcnZpY2UudmVyc2lvbixcblx0XHRjb21taXQ6IHByb2R1Y3RTZXJ2aWNlLmNvbW1pdCxcblx0XHRkYXRlOiBwcm9kdWN0U2VydmljZS5kYXRlLFxuXHRcdHF1YWxpdHk6IHByb2R1Y3RTZXJ2aWNlLnF1YWxpdHksXG5cdH07XG59XG5cbi8qKlxuICogUmVhZHMgdGhlIHdlbGwta25vd24gaG9zdC1idWlsZCBwYXlsb2FkIGZyb20ge0BsaW5rIFJvb3RNZXRhfSwgaWYgcHJlc2VudC5cbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWV0YSBiYWcgaXMgYWJzZW50IG9yIHRoZSB2YWx1ZSBhdCB0aGUgaG9zdC1idWlsZFxuICoga2V5IGlzIG5vdCBhIHBsYWluIG9iamVjdCB3aXRoIGEgc3RyaW5nIGB2ZXJzaW9uYC4gT3B0aW9uYWwgZmllbGRzIHdpdGggd3JvbmdcbiAqIHR5cGVzIGFyZSBzaWxlbnRseSBkcm9wcGVkLlxuICovXG5leHBvcnQgZnVuY3Rpb24gcmVhZEhvc3RCdWlsZEluZm8oc3RhdGU6IFJvb3RTdGF0ZSB8IHVuZGVmaW5lZCk6IElIb3N0QnVpbGRJbmZvIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWV0YSA9IHN0YXRlPy5fbWV0YTtcblx0Y29uc3QgdmFsdWUgPSBtZXRhPy5bUk9PVF9NRVRBX0hPU1RfQlVJTERfS0VZXTtcblx0aWYgKCF2YWx1ZSB8fCB0eXBlb2YgdmFsdWUgIT09ICdvYmplY3QnIHx8IEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCByYXcgPSB2YWx1ZSBhcyBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPjtcblx0aWYgKHR5cGVvZiByYXdbJ3ZlcnNpb24nXSAhPT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IHJlc3VsdDogeyB2ZXJzaW9uOiBzdHJpbmc7IGNvbW1pdD86IHN0cmluZzsgZGF0ZT86IHN0cmluZzsgcXVhbGl0eT86IHN0cmluZyB9ID0ge1xuXHRcdHZlcnNpb246IHJhd1sndmVyc2lvbiddLFxuXHR9O1xuXHRpZiAodHlwZW9mIHJhd1snY29tbWl0J10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5jb21taXQgPSByYXdbJ2NvbW1pdCddOyB9XG5cdGlmICh0eXBlb2YgcmF3WydkYXRlJ10gPT09ICdzdHJpbmcnKSB7IHJlc3VsdC5kYXRlID0gcmF3WydkYXRlJ107IH1cblx0aWYgKHR5cGVvZiByYXdbJ3F1YWxpdHknXSA9PT0gJ3N0cmluZycpIHsgcmVzdWx0LnF1YWxpdHkgPSByYXdbJ3F1YWxpdHknXTsgfVxuXHRyZXR1cm4gcmVzdWx0O1xufVxuXG4vKipcbiAqIFJldHVybnMgYSBuZXcge0BsaW5rIFJvb3RNZXRhfSB3aXRoIHRoZSBob3N0LWJ1aWxkIHBheWxvYWQgc2V0IHRvXG4gKiBgYnVpbGRJbmZvYCwgb3Igd2l0aCB0aGUgc2xvdCByZW1vdmVkIGlmIGBidWlsZEluZm9gIGlzIGB1bmRlZmluZWRgLiBSZXR1cm5zXG4gKiBgdW5kZWZpbmVkYCBpZiB0aGUgcmVzdWx0IHdvdWxkIGJlIGVtcHR5LlxuICovXG5leHBvcnQgZnVuY3Rpb24gd2l0aEhvc3RCdWlsZEluZm8obWV0YTogUm9vdE1ldGEgfCB1bmRlZmluZWQsIGJ1aWxkSW5mbzogSUhvc3RCdWlsZEluZm8gfCB1bmRlZmluZWQpOiBSb290TWV0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG5leHQ6IHsgW2tleTogc3RyaW5nXTogdW5rbm93biB9ID0geyAuLi5tZXRhIH07XG5cdGlmIChidWlsZEluZm8gIT09IHVuZGVmaW5lZCkge1xuXHRcdG5leHRbUk9PVF9NRVRBX0hPU1RfQlVJTERfS0VZXSA9IGJ1aWxkSW5mbztcblx0fSBlbHNlIHtcblx0XHRkZWxldGUgbmV4dFtST09UX01FVEFfSE9TVF9CVUlMRF9LRVldO1xuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhuZXh0KS5sZW5ndGggPiAwID8gbmV4dCA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBGb3JtYXRzIHtAbGluayBJSG9zdEJ1aWxkSW5mb30gYXMgYSBzaG9ydCBzaW5nbGUtbGluZSBodW1hbi1yZWFkYWJsZSBzdHJpbmcsXG4gKiBlLmcuIGAxLjk2LjAgKGNvbW1pdCBhYmMxMjM0LCAyMDI0LTAxLTAyVDAzOjA0OjA1WiwgaW5zaWRlcilgLlxuICovXG5leHBvcnQgZnVuY3Rpb24gZm9ybWF0SG9zdEJ1aWxkSW5mbyhpbmZvOiBJSG9zdEJ1aWxkSW5mbyk6IHN0cmluZyB7XG5cdGNvbnN0IGRldGFpbHM6IHN0cmluZ1tdID0gW107XG5cdGlmIChpbmZvLmNvbW1pdCkgeyBkZXRhaWxzLnB1c2goYGNvbW1pdCAke2luZm8uY29tbWl0fWApOyB9XG5cdGlmIChpbmZvLmRhdGUpIHsgZGV0YWlscy5wdXNoKGluZm8uZGF0ZSk7IH1cblx0aWYgKGluZm8ucXVhbGl0eSkgeyBkZXRhaWxzLnB1c2goaW5mby5xdWFsaXR5KTsgfVxuXHRyZXR1cm4gZGV0YWlscy5sZW5ndGggPiAwID8gYCR7aW5mby52ZXJzaW9ufSAoJHtkZXRhaWxzLmpvaW4oJywgJyl9KWAgOiBpbmZvLnZlcnNpb247XG59XG4iXSwKICAibWFwcGluZ3MiOiAiQUFZQSxTQUFTLGdCQUFnQjtBQUN6QixTQUFTLGNBQWMsY0FBYyxnQkFBZ0I7QUFDckQsU0FBUyxjQUE0QjtBQUNyQyxTQUFTLE9BQU8sbUJBQW1CO0FBRW5DLFNBQVMsd0JBQXdCO0FBQ2pDO0FBQUEsRUFDQztBQUFBLEVBQ0E7QUFBQSxF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bkQsTUFBSSxjQUFjLFFBQVc7QUFDNUIsU0FBSyx3QkFBd0IsSUFBSTtBQUFBLEVBQ2xDLE9BQU87QUFDTixXQUFPLEtBQUssd0JBQXdCO0FBQUEsRUFDckM7QUFDQSxTQUFPLE9BQU8sS0FBSyxJQUFJLEVBQUUsU0FBUyxJQUFJLE9BQU87QUFDOUM7QUFNTyxTQUFTLG9CQUFvQixNQUE4QjtBQUNqRSxRQUFNLFVBQW9CLENBQUM7QUFDM0IsTUFBSSxLQUFLLFFBQVE7QUFBRSxZQUFRLEtBQUssVUFBVSxLQUFLLE1BQU0sRUFBRTtBQUFBLEVBQUc7QUFDMUQsTUFBSSxLQUFLLE1BQU07QUFBRSxZQUFRLEtBQUssS0FBSyxJQUFJO0FBQUEsRUFBRztBQUMxQyxNQUFJLEtBQUssU0FBUztBQUFFLFlBQVEsS0FBSyxLQUFLLE9BQU87QUFBQSxFQUFHO0FBQ2hELFNBQU8sUUFBUSxTQUFTLElBQUksR0FBRyxLQUFLLE9BQU8sS0FBSyxRQUFRLEtBQUssSUFBSSxDQUFDLE1BQU0sS0FBSztBQUM5RTsiLAogICJuYW1lcyI6IFsiUmVzcG9uc2VQYXJ0S2luZCIsICJDaGF0SW50ZXJhY3Rpdml0eSIsICJDaGF0T3JpZ2luS2luZCIsICJTZXNzaW9uTGlmZWN5Y2xlIiwgIlNlc3Npb25TdGF0dXMiLCAiVG9vbENhbGxTdGF0dXMiLCAiVG9vbFJlc3VsdENvbnRlbnRUeXBlIiwgInVzYWdlIiwgIkNoYXRJbnB1dEFuc3dlclN0YXRlIiwgIkNoYXRJbnB1dEFuc3dlclZhbHVlS2luZCIsICJDaGF0SW5wdXRRdWVzdGlvbktpbmQiLCAiQ2hhdElucHV0UmVzcG9uc2VLaW5kIiwgIkZpbGVFZGl0S2luZCIsICJTdGF0ZUNvbXBvbmVudHMiLCAiU2Vzc2lvblNvdXJjZUNvbnRyb2xPdXRjb21lIl0KfQo=
