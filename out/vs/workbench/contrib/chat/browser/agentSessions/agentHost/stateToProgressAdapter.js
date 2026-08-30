import { decodeBase64 } from "../../../../../../base/common/buffer.js";
import { Codicon } from "../../../../../../base/common/codicons.js";
import { escapeMarkdownLinkLabel, MarkdownString } from "../../../../../../base/common/htmlContent.js";
import { escapeIcons } from "../../../../../../base/common/iconLabels.js";
import { rewriteMarkdownLinks as rewriteMarkdownSource } from "../../../../../../base/common/markdownLinks.js";
import { Schemas } from "../../../../../../base/common/network.js";
import { posix, win32 } from "../../../../../../base/common/path.js";
import { URI } from "../../../../../../base/common/uri.js";
import { generateUuid } from "../../../../../../base/common/uuid.js";
import { buildSubagentChatUri, isMessageHiddenFromTranscript, MessageKind, ToolCallCancellationReason, ToolCallContributorKind, ToolCallRiskAssessmentStatus, ToolCallStatus, TurnState, ResponsePartKind, getInlineToolInput, getToolFileEdits, getToolOutputText, getToolSubagentContent, hasReportedUsage, readUsageInfoMeta, ChatInputAnswerState, ChatInputAnswerValueKind, ChatInputQuestionKind, ChatInputResponseKind, FileEditKind, ToolResultContentType } from "../../../../../../platform/agentHost/common/state/sessionState.js";
import { getToolKind } from "../../../../../../platform/agentHost/common/state/sessionReducers.js";
import { readToolCallMeta } from "../../../../../../platform/agentHost/common/meta/agentToolCallMeta.js";
import { getChatErrorDetailsFromMeta } from "../../../common/chatErrorMessages.js";
import { AGENT_HOST_SCHEME, toAgentHostUri } from "../../../../../../platform/agentHost/common/agentHostUri.js";
import { AgentHostElementAttachmentDisplayKind, getElementAttachmentCorrelationId } from "../../../../../../platform/agentHost/common/meta/agentElementAttachments.js";
import { AgentHostAutoReplyAnswer } from "../../../../../../platform/agentHost/common/agentHostSchema.js";
import { getAgentFeedbackAttachmentMetadata, isAgentFeedbackAnnotationsAttachment, isAgentFeedbackAttachment } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAttachments.js";
import { getBrowserViewAttachmentMetadata, isBrowserViewAttachment } from "../../../../../../platform/agentHost/common/meta/browserViewAttachments.js";
import { readAgentMessageDelegationMeta } from "../../../../../../platform/agentHost/common/meta/agentMessageDelegationMeta.js";
import { AgentSystemNotificationKind, AgentSystemNotificationSeverity, readAgentSystemNotificationMeta } from "../../../../../../platform/agentHost/common/meta/agentSystemNotificationMeta.js";
import { isViewUnreviewedCommentsTool, isAddCommentTool } from "../../../../../../platform/agentHost/common/meta/agentFeedbackAnnotations.js";
import { isCreateChatTool, isCreateSessionTool, isSendMessageTool, parseOpenSessionLinkChatId, parseOpenSessionLinkUri } from "../../../../../../platform/agentHost/common/openSessionLink.js";
import { parsePartialToolInputForDisplay } from "../../../../../../platform/agentHost/common/partialToolInput.js";
import { MessageAttachmentKind } from "../../../../../../platform/agentHost/common/state/protocol/state.js";
import { normalizeFileEdit } from "../../../../../../platform/agentHost/common/fileEditDiff.js";
import { AgentSession } from "../../../../../../platform/agentHost/common/agentService.js";
import product from "../../../../../../platform/product/common/product.js";
import { ConfigureAutomationToolReferenceName } from "../../../common/automations/automationService.js";
import { formatCopilotCredits, ElicitationState, ToolConfirmKind, AgentFeedbackReviewCommandId } from "../../../common/chatService/chatService.js";
import { isTerminalCommandPrompt } from "../../../common/chatSessionsService.js";
import { ChatToolInvocation } from "../../../common/model/chatProgressTypes/chatToolInvocation.js";
import { ChatPlanReviewData } from "../../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { ChatRequestOriginKind } from "../../../common/chatRequestOrigin.js";
import { AgentHostCompletionReferenceKind, restoreChatTranscriptContextVariableEntry, restorePasteVariableEntryFromAttachment, toAgentHostCompletionVariableEntryFromMetadata } from "../../../common/attachments/chatVariableEntries.js";
import { ToolDataSource, ToolInvocationPresentation } from "../../../common/tools/languageModelToolsService.js";
import { basename } from "../../../../../../base/common/resources.js";
import { hasKey } from "../../../../../../base/common/types.js";
import { localize } from "../../../../../../nls.js";
import { isSessionReferenceTrajectoryAttachment, restoreSessionReferenceVariableEntryFromAttachment } from "./agentHostSessionReferenceAttachment.js";
import { restoreChatReferenceVariableEntryFromAttachment } from "./agentHostChatReferenceAttachment.js";
const BOOLEAN_TRUE_OPTION_ID = "true";
const BOOLEAN_FALSE_OPTION_ID = "false";
const agentHostAskUserToolNames = /* @__PURE__ */ new Set(["ask_user", "AskUserQuestion", "request_user_input"]);
const imageGenerationToolName = "image_gen.imagegen";
function isAgentHostAskUserTool(toolName) {
  return agentHostAskUserToolNames.has(toolName);
}
function shouldHideCompletedAgentHostAskUserTool(toolCall) {
  if (!isAgentHostAskUserTool(toolCall.toolName)) {
    return false;
  }
  if (toolCall.status === ToolCallStatus.Completed) {
    return toolCall.success;
  }
  return toolCall.status === ToolCallStatus.Cancelled && toolCall.reason === ToolCallCancellationReason.Skipped;
}
function makeAhpTerminalToolSessionId(terminalUri, session) {
  return JSON.stringify({ terminal: terminalUri, session: session.toString() });
}
function parseAhpTerminalToolSessionId(id) {
  try {
    const parsed = JSON.parse(id);
    if (typeof parsed?.terminal === "string" && typeof parsed?.session === "string") {
      return parsed;
    }
  } catch {
  }
  return void 0;
}
function convertProtocolAnswer(answer) {
  if (answer.state !== ChatInputAnswerState.Submitted) {
    return void 0;
  }
  switch (answer.value.kind) {
    case ChatInputAnswerValueKind.Text:
      return answer.value.value;
    case ChatInputAnswerValueKind.Number:
    case ChatInputAnswerValueKind.Boolean:
      return String(answer.value.value);
    case ChatInputAnswerValueKind.Selected:
      return {
        selectedValue: answer.value.value,
        freeformValue: answer.value.freeformValues?.[0]
      };
    case ChatInputAnswerValueKind.SelectedMany:
      return {
        selectedValues: answer.value.value,
        freeformValue: answer.value.freeformValues?.[0]
      };
  }
}
function convertProtocolAnswers(raw) {
  if (!raw) {
    return void 0;
  }
  const answers = {};
  for (const [questionId, answer] of Object.entries(raw)) {
    const converted = convertProtocolAnswer(answer);
    if (converted !== void 0) {
      answers[questionId] = converted;
    }
  }
  return Object.keys(answers).length > 0 ? answers : void 0;
}
function containsAutomaticReplyAnswer(raw) {
  return Object.values(raw ?? {}).some(
    (answer) => answer.state === ChatInputAnswerState.Submitted && answer.value.kind === ChatInputAnswerValueKind.Text && answer.value.value === AgentHostAutoReplyAnswer
  );
}
function getPlanReviewAction(planReview, actionId) {
  return actionId ? planReview.actions.find((action) => action.id === actionId) : void 0;
}
function convertProtocolPlanReviewResult(planReview, response, answers) {
  if (response === ChatInputResponseKind.Decline) {
    return { rejected: true };
  }
  if (response !== ChatInputResponseKind.Accept) {
    return void 0;
  }
  const answer = answers?.[planReview.answerQuestionId];
  if (!answer || answer.state === ChatInputAnswerState.Skipped) {
    return void 0;
  }
  const value = answer.value;
  if (value.kind === ChatInputAnswerValueKind.Text) {
    const feedback2 = value.value.trim();
    return feedback2 ? { rejected: false, feedback: feedback2, feedbackOverall: feedback2 } : void 0;
  }
  if (value.kind !== ChatInputAnswerValueKind.Selected) {
    return void 0;
  }
  const action = getPlanReviewAction(planReview, value.value);
  const feedback = value.freeformValues?.find((v) => v.trim().length > 0)?.trim();
  return {
    rejected: false,
    action: action?.label ?? value.value,
    actionId: action?.id ?? value.value,
    ...feedback ? { feedback, feedbackOverall: feedback } : {}
  };
}
function createInputRequestCarousel(inputReq, connectionAuthority) {
  const questions = (inputReq.questions ?? []).map((question) => {
    let title = question.title;
    let message = question.message;
    if (!title) {
      const endOfLine = question.message.indexOf("\n");
      title = endOfLine === -1 ? question.message : question.message.substring(0, endOfLine).trim();
      message = endOfLine === -1 ? "" : question.message.substring(endOfLine + 1).trim();
    }
    const detailedMessage = new MarkdownString(message, { isTrusted: false });
    switch (question.kind) {
      case ChatInputQuestionKind.SingleSelect:
        return {
          id: question.id,
          type: "singleSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: question.allowFreeformInput ?? true,
          options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.id }))
        };
      case ChatInputQuestionKind.MultiSelect:
        return {
          id: question.id,
          type: "multiSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: question.allowFreeformInput ?? true,
          options: question.options.map((option) => ({ id: option.id, label: option.label, value: option.id }))
        };
      case ChatInputQuestionKind.Boolean:
        return {
          id: question.id,
          type: "singleSelect",
          title,
          detailedMessage,
          required: question.required,
          allowFreeformInput: false,
          defaultValue: question.defaultValue === void 0 ? void 0 : String(question.defaultValue),
          options: [
            { id: BOOLEAN_TRUE_OPTION_ID, label: localize("chat.inputRequest.boolean.true", "True"), value: BOOLEAN_TRUE_OPTION_ID },
            { id: BOOLEAN_FALSE_OPTION_ID, label: localize("chat.inputRequest.boolean.false", "False"), value: BOOLEAN_FALSE_OPTION_ID }
          ]
        };
      case ChatInputQuestionKind.Text:
        return {
          id: question.id,
          type: "text",
          title,
          detailedMessage,
          required: question.required,
          defaultValue: question.defaultValue
        };
      default:
        return {
          id: question.id,
          type: "text",
          title,
          detailedMessage,
          required: question.required
        };
    }
  });
  if (questions.length === 0) {
    questions.push({
      id: "answer",
      type: "text",
      title: inputReq.message ?? "",
      required: true
    });
  }
  const carousel = new ChatQuestionCarouselData(
    questions,
    true,
    inputReq.id,
    void 0,
    void 0,
    inputReq.message ? rawMarkdownToString(inputReq.message, connectionAuthority) : void 0
  );
  carousel.answerPresentation = "conversation";
  return carousel;
}
function createInputRequestPlanReview(inputReq, planReview) {
  return new ChatPlanReviewData(
    planReview.title,
    planReview.content,
    planReview.actions.map((action) => ({
      id: action.id,
      label: action.label,
      ...action.description ? { description: action.description } : {},
      ...action.default ? { default: true } : {},
      ...action.permissionLevel ? { permissionLevel: action.permissionLevel } : {}
    })),
    planReview.canProvideFeedback,
    planReview.planUri ? URI.parse(planReview.planUri).toJSON() : void 0,
    inputReq.id
  );
}
function getUrlInputRequestPresentation(inputReq, url) {
  let authority = url;
  try {
    authority = URI.parse(url).authority || url;
  } catch {
  }
  const message = new MarkdownString();
  if (inputReq.message) {
    message.appendText(inputReq.message);
    message.appendMarkdown("\n\n");
  }
  message.appendMarkdown(localize("agentHost.elicit.url.instruction", "Open this URL?"));
  message.appendCodeblock("", url);
  return { authority, message };
}
function inputRequestResponsePartToProgress(part, connectionAuthority) {
  const inputReq = part.request;
  const planReview = inputReq.planReview;
  if (planReview) {
    const review = createInputRequestPlanReview(inputReq, planReview);
    review.data = part.response === void 0 ? void 0 : convertProtocolPlanReviewResult(planReview, part.response, inputReq.answers);
    review.isUsed = true;
    return review;
  }
  if (inputReq.url) {
    const presentation = getUrlInputRequestPresentation(inputReq, inputReq.url);
    return {
      kind: "elicitationSerialized",
      title: localize("agentHost.elicit.url.title", "Authorization Required"),
      message: presentation.message,
      subtitle: "",
      source: void 0,
      state: part.response === ChatInputResponseKind.Accept ? ElicitationState.Accepted : ElicitationState.Rejected,
      isHidden: false
    };
  }
  const carousel = createInputRequestCarousel(inputReq, connectionAuthority);
  const answers = part.response === ChatInputResponseKind.Accept ? convertProtocolAnswers(inputReq.answers) : void 0;
  carousel.data = answers ?? {};
  carousel.isUsed = true;
  carousel.autoReply = containsAutomaticReplyAnswer(inputReq.answers);
  carousel.answeredExternally = part.response === ChatInputResponseKind.Accept && (carousel.autoReply || !answers);
  return carousel;
}
function getSubagentTaskDescription(tc) {
  const v = readToolCallMeta(tc).subagentDescription;
  return v && v.length > 0 ? v : void 0;
}
function getSubagentAgentName(tc) {
  const v = readToolCallMeta(tc).subagentAgentName;
  return v && v.length > 0 ? v : void 0;
}
function getSubagentChatResource(tc, subagentContent, sessionResource) {
  return readToolCallMeta(tc).subagentChatUri ?? subagentContent?.resource ?? buildSubagentChatUri(sessionResource.toString(), tc.toolCallId);
}
function getMcpAppData(tc, _sessionResource) {
  if (tc.contributor?.kind !== ToolCallContributorKind.MCP) {
    return void 0;
  }
  const ui = readToolCallMeta(tc).ui;
  if (!ui) {
    return void 0;
  }
  const resourceUri = ui.resourceUri;
  const channelValue = ui.channel;
  if (channelValue === void 0) {
    return void 0;
  }
  return {
    kind: "agentHost",
    resourceUri,
    serverId: tc.contributor.customizationId,
    channel: channelValue
  };
}
function getToolRawInput(tc) {
  const toolInput = tc.status === ToolCallStatus.Streaming ? void 0 : getInlineToolInput(tc.toolInput);
  try {
    return toolInput ? JSON.parse(toolInput) : {};
  } catch {
    return { input: toolInput };
  }
}
function buildMcpAppToolInputData(tc, sessionResource, existingRawInput) {
  const mcpAppData = getMcpAppData(tc, sessionResource);
  if (!mcpAppData) {
    return void 0;
  }
  return {
    kind: "input",
    rawInput: existingRawInput ?? getToolRawInput(tc),
    mcpAppData
  };
}
function isSameMcpAppData(a, b) {
  if (a?.kind !== b?.kind || a?.resourceUri !== b?.resourceUri) {
    return false;
  }
  if (a?.kind === "agentHost" && b?.kind === "agentHost") {
    return a.serverId === b.serverId && a.channel === b.channel;
  }
  if (a?.kind === "local" && b?.kind === "local") {
    return a.serverDefinitionId === b.serverDefinitionId && a.collectionId === b.collectionId;
  }
  return a === b;
}
const SUBAGENT_TOOL_NAMES = /* @__PURE__ */ new Set(["task"]);
function isSubagentToolName(toolName) {
  return SUBAGENT_TOOL_NAMES.has(toolName);
}
function systemNotificationToChatPart(content, connectionAuthority, _meta) {
  if (!content) {
    return void 0;
  }
  const value = stringOrMarkdownToString(content, connectionAuthority);
  const markdown = typeof value === "string" ? new MarkdownString(value) : value;
  const meta = readAgentSystemNotificationMeta({ _meta });
  return meta.kind === AgentSystemNotificationKind.WorktreeCreationFailure && meta.severity === AgentSystemNotificationSeverity.Warning ? { kind: "warning", content: markdown } : { kind: "systemNotification", content: markdown };
}
function isSubagentTool(tc) {
  return getToolKind(tc) === "subagent" || isSubagentToolName(tc.toolName);
}
function shouldObserveSubagentChat(tc) {
  const hasSubagentContent = (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) && getToolSubagentContent(tc) !== void 0;
  if (tc.status === ToolCallStatus.Running) {
    return isSubagentTool(tc) || hasSubagentContent;
  }
  return tc.status === ToolCallStatus.Completed && (hasSubagentContent || tc.success && isSubagentTool(tc));
}
function getTerminalContentUri(content) {
  return getTerminalContent(content)?.resource;
}
function getTerminalContent(content) {
  return content?.find(isToolResultTerminalContent);
}
function formatTurnResponseDetails(model, billedModelId, usage) {
  if (!model) {
    return void 0;
  }
  const displayName = formatTurnModelName(model, billedModelId);
  const credits = usageInfoToChatUsage(usage)?.copilotCredits;
  if (credits !== void 0) {
    const formatted = formatCopilotCredits(credits);
    const creditDetails = formatted === "1" ? localize("agentHost.responseDetails.credit", "{0} credit", formatted) : localize("agentHost.responseDetails.credits", "{0} credits", formatted);
    return [displayName, creditDetails].join(" \u2022 ");
  }
  return [displayName, model.pricing].filter(Boolean).join(" \xB7 ");
}
function usageInfoToAutoModeResolution(usage, resolvedModelName) {
  const resolution = readUsageInfoMeta(usage).autoModeResolved;
  if (!resolution || typeof resolution.confidence !== "number" || !Number.isFinite(resolution.confidence)) {
    return void 0;
  }
  const predictedLabel = resolution.predictedLabel;
  if (predictedLabel !== "needs_reasoning" && predictedLabel !== "no_reasoning" && predictedLabel !== "fallback") {
    return void 0;
  }
  return {
    kind: "autoModeResolution",
    resolvedModel: resolution.chosenModel,
    resolvedModelName: resolvedModelName ?? resolution.chosenModel,
    predictedLabel,
    confidence: Math.max(0, Math.min(1, resolution.confidence))
  };
}
function formatTurnModelName(model, billedModelId) {
  if (billedModelId) {
    return localize("agentHost.responseDetails.resolvedModel", "{0} ({1})", model.name, billedModelId);
  }
  return model.name;
}
function usageInfoToChatUsage(usage, modelDisplayNameResolver) {
  if (!hasReportedUsage(usage)) {
    return void 0;
  }
  const turnTokenTotals = readUsageInfoMeta(usage).turnTokenTotals;
  return {
    kind: "usage",
    promptTokens: usage?.inputTokens ?? 0,
    completionTokens: usage?.outputTokens ?? 0,
    copilotCredits: getCopilotCredits(usage),
    sessionCopilotCredits: getSessionCopilotCredits(usage),
    promptTokenDetails: contextAttributionToPromptTokenDetails(usage),
    modelTotals: turnTokenTotals?.map((total) => ({
      ...total,
      model: modelDisplayNameResolver?.(total.model) ?? total.model
    }))
  };
}
function getSessionCopilotCredits(usage) {
  const sessionTotalNanoAiu = readUsageInfoMeta(usage).copilotUsage?.sessionTotalNanoAiu;
  return typeof sessionTotalNanoAiu === "number" && sessionTotalNanoAiu >= 0 ? sessionTotalNanoAiu / 1e9 : void 0;
}
function getCopilotCredits(usage) {
  const meta = readUsageInfoMeta(usage);
  const totalNanoAiu = meta?.copilotUsage?.totalNanoAiu;
  if (typeof totalNanoAiu === "number" && totalNanoAiu >= 0) {
    return totalNanoAiu / 1e9;
  }
  const cost = meta?.cost;
  return typeof cost === "number" && cost >= 0 ? cost : void 0;
}
function kindToCategory(kind) {
  switch (kind) {
    case "system":
    case "toolDefinition":
      return localize("contextAttribution.category.system", "System");
    case "tool":
    case "skill":
    case "subagent":
    case "mcpServer":
    case "plugin":
      return localize("contextAttribution.category.userContext", "User Context");
    default:
      return localize("contextAttribution.category.userContext", "User Context");
  }
}
function kindToAggregateLabel(kind) {
  switch (kind) {
    case "tool":
      return localize("contextAttribution.label.toolResults", "Tool Results");
    case "toolDefinition":
      return localize("contextAttribution.label.toolDefinitions", "Tool Definitions");
    case "skill":
      return localize("contextAttribution.label.skills", "Skills");
    case "subagent":
      return localize("contextAttribution.label.subAgents", "Sub-agents");
    case "mcpServer":
      return localize("contextAttribution.label.mcpTools", "MCP Tools");
    case "plugin":
      return localize("contextAttribution.label.plugins", "Plugins");
    default:
      return kind;
  }
}
function contextAttributionToPromptTokenDetails(usage) {
  const meta = readUsageInfoMeta(usage);
  const attribution = meta?.contextAttribution;
  if (!attribution || attribution.totalTokens <= 0 || attribution.entries.length === 0) {
    return void 0;
  }
  const details = [];
  const parentIds = /* @__PURE__ */ new Set();
  for (const entry of attribution.entries) {
    if (entry.parentId) {
      parentIds.add(entry.parentId);
    }
  }
  const kindTokens = /* @__PURE__ */ new Map();
  let accountedTokens = 0;
  for (const entry of attribution.entries) {
    if (entry.kind === "system") {
      if (parentIds.has(entry.id)) {
        continue;
      }
      accountedTokens += entry.tokens;
      const percentageOfPrompt = Math.round(entry.tokens / attribution.totalTokens * 100);
      if (percentageOfPrompt > 0) {
        details.push({
          category: kindToCategory("system"),
          label: entry.label,
          percentageOfPrompt
        });
      }
    } else {
      kindTokens.set(entry.kind, (kindTokens.get(entry.kind) ?? 0) + entry.tokens);
    }
  }
  for (const [kind, tokens] of kindTokens) {
    accountedTokens += tokens;
    const percentageOfPrompt = Math.round(tokens / attribution.totalTokens * 100);
    if (percentageOfPrompt <= 0) {
      continue;
    }
    const category = kindToCategory(kind);
    const label = kindToAggregateLabel(kind);
    details.push({ category, label, percentageOfPrompt });
  }
  const messageTokens = Math.max(0, attribution.totalTokens - accountedTokens);
  if (messageTokens > 0) {
    const percentageOfPrompt = Math.round(messageTokens / attribution.totalTokens * 100);
    if (percentageOfPrompt > 0) {
      details.push({
        category: localize("contextAttribution.category.userContext", "User Context"),
        label: localize("contextAttribution.label.messages", "Messages"),
        percentageOfPrompt
      });
    }
  }
  return details.length > 0 ? details : void 0;
}
function mapAccountQuotaSnapshot(snapshot) {
  const unlimited = snapshot.isUnlimitedEntitlement ?? false;
  const entitlement = typeof snapshot.entitlementRequests === "number" ? snapshot.entitlementRequests : void 0;
  if (!unlimited && entitlement === 0) {
    return void 0;
  }
  if (typeof snapshot.remainingPercentage !== "number") {
    return void 0;
  }
  const used = typeof snapshot.usedRequests === "number" ? snapshot.usedRequests : void 0;
  const resetAt = snapshot.resetDate ? Date.parse(snapshot.resetDate) : NaN;
  return {
    percentRemaining: Math.min(100, Math.max(0, snapshot.remainingPercentage)),
    unlimited,
    entitlement: !unlimited && entitlement !== void 0 && entitlement >= 0 ? entitlement : void 0,
    quotaRemaining: !unlimited && entitlement !== void 0 && used !== void 0 ? Math.max(0, entitlement - used) : void 0,
    resetAt: Number.isFinite(resetAt) ? resetAt : void 0
  };
}
function usageInfoToQuotas(usage) {
  const meta = readUsageInfoMeta(usage);
  const snapshots = meta?.quotaSnapshots;
  if (!snapshots) {
    return void 0;
  }
  const update = {};
  let hasAny = false;
  const chat = snapshots["chat"] && mapAccountQuotaSnapshot(snapshots["chat"]);
  if (chat) {
    update.chat = chat;
    hasAny = true;
  }
  const completions = snapshots["completions"] && mapAccountQuotaSnapshot(snapshots["completions"]);
  if (completions) {
    update.completions = completions;
    hasAny = true;
  }
  const premiumRaw = snapshots["premium_interactions"];
  const premiumChat = premiumRaw && mapAccountQuotaSnapshot(premiumRaw);
  if (premiumChat) {
    update.premiumChat = premiumChat;
    hasAny = true;
  }
  if (premiumRaw) {
    update.additionalUsageEnabled = premiumRaw.overageAllowedWithExhaustedQuota ?? false;
    update.additionalUsageCount = typeof premiumRaw.overage === "number" ? premiumRaw.overage : 0;
    hasAny = true;
  }
  const resetDate = premiumRaw?.resetDate ?? snapshots["chat"]?.resetDate;
  if (resetDate) {
    update.resetDate = resetDate;
  }
  return hasAny ? update : void 0;
}
function turnsToHistory(backendSession, turns, participantId, connectionAuthority, lookup, errorContext, terminalCommandPrefix) {
  const history = [];
  for (const turn of turns) {
    const rawModelId = turn.usage?.model;
    const modelId = lookup?.toLanguageModelId(rawModelId);
    const details = lookup?.toResponseDetails(rawModelId, turn.usage);
    const variableData = messageToVariableData(turn.message, connectionAuthority);
    const origin = messageToRequestOrigin(backendSession, turn.message, participantId);
    const isSystemInitiated = turn.message.origin.kind === MessageKind.SystemNotification;
    const isTerminalRequest = isTerminalCommandPrompt(turn.message.text, terminalCommandPrefix);
    history.push({
      id: turn.id,
      type: "request",
      prompt: turn.message.text,
      participant: participantId,
      modelId,
      ...turn.startedAt !== void 0 && Number.isFinite(Date.parse(turn.startedAt)) ? { timestamp: Date.parse(turn.startedAt) } : {},
      variableData,
      ...isMessageHiddenFromTranscript(turn.message) ? { isHidden: true } : {},
      ...isSystemInitiated ? {
        isSystemInitiated: true
      } : {},
      ...isTerminalRequest ? {
        isTerminalRequest: true
      } : {},
      ...origin ? { origin } : {}
    });
    const parts = [];
    const autoModeResolution = lookup?.toAutoModeResolution?.(turn.usage);
    if (autoModeResolution) {
      parts.push(autoModeResolution);
    }
    const usage = usageInfoToChatUsage(turn.usage, lookup?.toModelDisplayName);
    if (usage) {
      parts.push(usage);
    }
    for (const rp of turn.responseParts) {
      switch (rp.kind) {
        case ResponsePartKind.Markdown:
          if (rp.content) {
            parts.push({ kind: "markdownContent", content: new MarkdownString(rp.content) });
          }
          break;
        case ResponsePartKind.ToolCall: {
          const tc = rp.toolCall;
          const fileEditParts = completedToolCallToEditParts(tc, connectionAuthority);
          const serialized = completedToolCallToSerialized(tc, void 0, backendSession, connectionAuthority);
          if (fileEditParts.length > 0) {
            serialized.presentation = ToolInvocationPresentation.Hidden;
          }
          parts.push(serialized);
          parts.push(...fileEditParts);
          break;
        }
        case ResponsePartKind.Reasoning:
          if (rp.content) {
            parts.push({ kind: "thinking", value: rp.content, id: rp.id });
          }
          break;
        case ResponsePartKind.SystemNotification:
          {
            const progress = systemNotificationToChatPart(rp.content, connectionAuthority, rp._meta);
            if (progress) {
              parts.push(progress);
            }
          }
          break;
        case ResponsePartKind.ContentRef:
          break;
        case ResponsePartKind.InputRequest: {
          parts.push(inputRequestResponsePartToProgress(rp, connectionAuthority));
          break;
        }
      }
    }
    let errorDetails;
    if (turn.state === TurnState.Error && turn.error) {
      errorDetails = getChatErrorDetailsFromMeta(turn.error, errorContext) ?? { message: `Error: (${turn.error.errorType}) ${turn.error.message}` };
    }
    const startedAt = turn.startedAt === void 0 ? void 0 : Date.parse(turn.startedAt);
    const completedAt = startedAt !== void 0 && Number.isFinite(startedAt) && typeof turn.duration === "number" && Number.isFinite(turn.duration) && turn.duration >= 0 ? startedAt + turn.duration : void 0;
    history.push({ type: "response", parts, participant: participantId, details, elapsedMs: turn.duration, completedAt, ...errorDetails ? { errorDetails } : {} });
  }
  return history;
}
function messageToRequestOrigin(backendSession, message, participantId) {
  const delegation = readAgentMessageDelegationMeta(message);
  if (!delegation || delegation.sourceThreadId === AgentSession.id(backendSession)) {
    return void 0;
  }
  return {
    kind: ChatRequestOriginKind.Delegation,
    sourceSessionResource: AgentSession.uri(participantId, delegation.sourceThreadId)
  };
}
function messageToVariableData(message, connectionAuthority) {
  return messageAttachmentsToVariableData(message.attachments, connectionAuthority, message.text);
}
function messageAttachmentsToVariableData(attachments, connectionAuthority, messageText) {
  if (!attachments?.length) {
    return void 0;
  }
  const variables = [];
  const aggregatedFeedback = aggregateAgentFeedbackAttachments(attachments, connectionAuthority);
  if (aggregatedFeedback) {
    variables.push(aggregatedFeedback);
  }
  const consumedAttachments = /* @__PURE__ */ new Set();
  for (const a of attachments) {
    if (aggregatedFeedback && isAgentFeedbackMessageAttachment(a) || consumedAttachments.has(a)) {
      continue;
    }
    const element = restoreElementVariableEntry(a, a.type === MessageAttachmentKind.Simple ? a.modelRepresentation : void 0);
    if (element) {
      const correlationId = getElementAttachmentCorrelationId(a);
      const imageAttachment = correlationId ? attachments.find((candidate) => candidate.displayKind === "image" && getElementAttachmentCorrelationId(candidate) === correlationId) : void 0;
      const image = imageAttachment ? messageAttachmentToVariableEntry(imageAttachment, connectionAuthority) : void 0;
      if (imageAttachment && image?.kind === "image") {
        consumedAttachments.add(imageAttachment);
      }
      variables.push(image?.kind === "image" ? { ...element, imageData: image.value instanceof Uint8Array || URI.isUri(image.value) ? image.value : void 0, imageMimeType: image.mimeType } : element);
      continue;
    }
    const v = messageAttachmentToVariableEntry(a, connectionAuthority, messageText);
    if (v) {
      variables.push(v);
    }
  }
  return variables.length > 0 ? { variables } : void 0;
}
function isAgentFeedbackMessageAttachment(attachment) {
  return isAgentFeedbackAnnotationsAttachment(attachment) || isAgentFeedbackAttachment(attachment);
}
function aggregateAgentFeedbackAttachments(attachments, connectionAuthority) {
  const feedbackAttachments = attachments.filter(isAgentFeedbackMessageAttachment);
  if (feedbackAttachments.length === 0 || feedbackAttachments.length === 1 && isAgentFeedbackAttachment(feedbackAttachments[0])) {
    return void 0;
  }
  let sessionResource;
  let annotationsResource;
  const feedbackItems = /* @__PURE__ */ new Map();
  for (const attachment of feedbackAttachments) {
    if (attachment.type === MessageAttachmentKind.Annotations) {
      annotationsResource ??= attachment.resource;
    }
    const metadata = getAgentFeedbackAttachmentMetadata(attachment);
    if (!metadata) {
      continue;
    }
    sessionResource ??= metadata.sessionResource;
    for (const item of metadata.feedbackItems) {
      feedbackItems.set(item.id, {
        id: item.id,
        text: item.text,
        resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
        range: textRangeToIRange(item.range),
        ...item.replies?.length ? { replies: item.replies } : {}
      });
    }
  }
  const firstAttachment = feedbackAttachments[0];
  if (feedbackItems.size === 0 || !sessionResource) {
    return {
      kind: "generic",
      id: generateUuid(),
      name: firstAttachment.label,
      value: firstAttachment.type === MessageAttachmentKind.Simple ? firstAttachment.modelRepresentation || firstAttachment.label : firstAttachment.label,
      _meta: firstAttachment._meta
    };
  }
  return {
    kind: "agentFeedback",
    id: generateUuid(),
    name: feedbackItems.size === 1 ? localize("agentFeedback.one", "1 comment") : localize("agentFeedback.many", "{0} comments", feedbackItems.size),
    value: firstAttachment.type === MessageAttachmentKind.Simple ? firstAttachment.modelRepresentation || firstAttachment.label : firstAttachment.label,
    sessionResource: URI.parse(sessionResource),
    annotationsResource: annotationsResource ? URI.parse(annotationsResource) : void 0,
    feedbackItems: [...feedbackItems.values()],
    _meta: firstAttachment._meta
  };
}
function messageAttachmentToVariableEntry(attachment, connectionAuthority, messageText) {
  if (isAgentFeedbackAttachment(attachment)) {
    const metadata = getAgentFeedbackAttachmentMetadata(attachment);
    if (metadata) {
      return {
        kind: "agentFeedback",
        id: generateUuid(),
        name: attachment.label,
        value: attachment.modelRepresentation || attachment.label,
        sessionResource: URI.parse(metadata.sessionResource),
        feedbackItems: metadata.feedbackItems.map((item) => ({
          id: item.id,
          text: item.text,
          resourceUri: toAgentHostUri(URI.parse(item.resourceUri), connectionAuthority),
          range: textRangeToIRange(item.range)
        })),
        _meta: attachment._meta
      };
    }
  }
  if (attachment.type === MessageAttachmentKind.Resource) {
    if (isSessionReferenceTrajectoryAttachment(attachment)) {
      return void 0;
    }
    const uri = toAgentHostUri(URI.parse(attachment.uri), connectionAuthority);
    const name = attachment.label;
    const id = uri.toString() + (attachment.selection ? `:${attachment.selection.range.start.line}-${attachment.selection.range.end.line}` : "");
    const _meta = attachment._meta;
    if (attachment.displayKind === "directory") {
      return { kind: "directory", id, name, value: uri, _meta };
    }
    if (attachment.displayKind === "image") {
      return {
        kind: "image",
        id,
        name,
        value: uri,
        isURL: true,
        references: [{ kind: "reference", reference: uri }],
        _meta
      };
    }
    if (attachment.selection) {
      return {
        kind: "file",
        id,
        name,
        value: { uri, range: textRangeToIRange(attachment.selection.range) },
        _meta
      };
    }
    return { kind: "file", id, name, value: uri, _meta };
  }
  if (attachment.type === MessageAttachmentKind.EmbeddedResource) {
    if (!attachment.contentType.startsWith("image/")) {
      return {
        kind: "generic",
        id: generateUuid(),
        name: attachment.label,
        value: decodeBase64(attachment.data).buffer,
        _meta: attachment._meta
      };
    }
    return {
      kind: "image",
      id: generateUuid(),
      name: attachment.label || "image",
      value: decodeBase64(attachment.data).buffer,
      mimeType: attachment.contentType,
      isURL: false,
      _meta: attachment._meta
    };
  }
  if (attachment.type === MessageAttachmentKind.Chat) {
    return restoreChatReferenceVariableEntryFromAttachment(attachment, messageText);
  }
  const agentHostCompletionKind = getAgentHostCompletionKind(attachment);
  if (agentHostCompletionKind !== void 0) {
    return toAgentHostCompletionVariableEntryFromMetadata(agentHostCompletionKind, attachment.label, attachment._meta);
  }
  const modelRepresentation = attachment.type === MessageAttachmentKind.Simple ? attachment.modelRepresentation : void 0;
  if (isBrowserViewAttachment(attachment) && modelRepresentation !== void 0) {
    const metadata = getBrowserViewAttachmentMetadata(attachment);
    if (metadata) {
      return {
        kind: "browserView",
        id: metadata.browserUri,
        name: attachment.label,
        value: URI.parse(metadata.browserUri),
        browserId: metadata.browserId,
        modelDescription: modelRepresentation,
        _meta: attachment._meta
      };
    }
  }
  if (attachment.type === MessageAttachmentKind.Simple && modelRepresentation !== void 0) {
    const transcriptContextEntry = restoreChatTranscriptContextVariableEntry(attachment.label, modelRepresentation, attachment._meta);
    if (transcriptContextEntry) {
      return transcriptContextEntry;
    }
  }
  if (attachment.displayKind === "workspace" && modelRepresentation !== void 0) {
    return {
      kind: "workspace",
      id: attachment.label,
      name: attachment.label,
      value: modelRepresentation,
      _meta: attachment._meta
    };
  }
  if (attachment.type === MessageAttachmentKind.Simple) {
    const sessionReferenceEntry = restoreSessionReferenceVariableEntryFromAttachment(attachment);
    if (sessionReferenceEntry) {
      return sessionReferenceEntry;
    }
  }
  const pasteEntry = restorePasteVariableEntryFromAttachment({
    label: attachment.label,
    displayKind: attachment.displayKind,
    modelRepresentation,
    _meta: attachment._meta
  });
  if (pasteEntry) {
    return pasteEntry;
  }
  return {
    kind: "generic",
    id: generateUuid(),
    name: attachment.label,
    value: modelRepresentation || attachment.label,
    _meta: attachment._meta
  };
}
function restoreElementVariableEntry(attachment, modelRepresentation) {
  if (attachment.displayKind !== AgentHostElementAttachmentDisplayKind || modelRepresentation === void 0) {
    return void 0;
  }
  const fullName = /^Element:\s*(?<name>.+)$/m.exec(modelRepresentation)?.groups?.name;
  return {
    kind: "element",
    id: generateUuid(),
    name: attachment.label,
    ...fullName ? { fullName } : {},
    icon: Codicon.layout,
    value: modelRepresentation,
    _meta: attachment._meta
  };
}
function getAgentHostCompletionKind(attachment) {
  if (attachment.type !== MessageAttachmentKind.Simple) {
    return void 0;
  }
  switch (attachment.displayKind) {
    case "command":
      return AgentHostCompletionReferenceKind.Command;
    case "skill":
      return AgentHostCompletionReferenceKind.Skill;
  }
  return void 0;
}
function textRangeToIRange(range) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1
  };
}
function activeTurnToProgress(sessionResource, activeTurn, connectionAuthority, mcpServerAuthority = sessionResource.authority, toolInvocationOptions, lookup) {
  const parts = [];
  const usage = usageInfoToChatUsage(activeTurn.usage, lookup?.toModelDisplayName);
  if (usage) {
    parts.push(usage);
  }
  for (const rp of activeTurn.responseParts) {
    switch (rp.kind) {
      case ResponsePartKind.Markdown:
        if (rp.content) {
          parts.push({ kind: "markdownContent", content: new MarkdownString(rp.content) });
        }
        break;
      case ResponsePartKind.Reasoning:
        if (rp.content) {
          parts.push({ kind: "thinking", value: rp.content, id: rp.id });
        }
        break;
      case ResponsePartKind.ToolCall: {
        const tc = rp.toolCall;
        const isOtherClientToolCall = tc.contributor?.kind === ToolCallContributorKind.Client && toolInvocationOptions && tc.contributor.clientId !== toolInvocationOptions.currentClientId;
        if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Cancelled) {
          parts.push(completedToolCallToSerialized(tc, void 0, sessionResource, connectionAuthority));
        } else if (tc.status === ToolCallStatus.Streaming && !isOtherClientToolCall) {
          parts.push(toolCallStateToStreamingInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority));
        } else if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.AuthRequired || tc.status === ToolCallStatus.Streaming || tc.status === ToolCallStatus.PendingConfirmation) {
          parts.push(toolCallStateToInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority, toolInvocationOptions));
        }
        break;
      }
      case ResponsePartKind.SystemNotification:
        {
          const progress = systemNotificationToChatPart(rp.content, connectionAuthority, rp._meta);
          if (progress) {
            parts.push(progress);
          }
        }
        break;
      case ResponsePartKind.ContentRef:
        break;
    }
  }
  return parts;
}
function getTerminalInput(tc) {
  const toolInput = tc.status === ToolCallStatus.Streaming ? void 0 : getInlineToolInput(tc.toolInput);
  if (toolInput) {
    try {
      return JSON.parse(toolInput).command || toolInput;
    } catch {
      return toolInput;
    }
  }
  return void 0;
}
function getTerminalOutput(tc) {
  if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
    return void 0;
  }
  const terminalContent = getTerminalContent(tc.content);
  const terminalResult = getTerminalCommandResult(tc);
  const fallbackText = tc.content?.find(isToolResultTextContent)?.text;
  let text = terminalResult?.truncated === true && fallbackText !== void 0 ? stripLegacyTerminalExitMarkers(fallbackText) : terminalResult?.preview;
  const hasRetainedNonPtySnapshot = terminalContent?.isPty === false && text !== void 0;
  if (text === void 0 && terminalContent?.isPty !== false) {
    text = fallbackText === void 0 ? void 0 : stripLegacyTerminalExitMarkers(fallbackText);
  }
  if (text === void 0 || !text && !hasRetainedNonPtySnapshot && terminalResult?.truncated !== true) {
    return void 0;
  }
  return {
    text: text.replace(/\r?\n/g, "\r\n"),
    ...terminalResult?.truncated !== void 0 ? { truncated: terminalResult.truncated } : {}
  };
}
function stripLegacyTerminalExitMarkers(text) {
  return text.replace(/<shellId:[^>\r\n]*completed with exit code -?\d+>\s*$/i, "");
}
function isToolResultTextContent(content) {
  return content.type === ToolResultContentType.Text;
}
function getTerminalCommandState(tc, fallbackSuccess) {
  const terminalResult = tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running ? getTerminalCommandResult(tc) : void 0;
  if (terminalResult?.exitCode !== void 0) {
    return { exitCode: terminalResult.exitCode };
  }
  if ((tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) && getTerminalContent(tc.content)?.isPty === false) {
    return fallbackSuccess === false ? { exitCode: 1 } : void 0;
  }
  return fallbackSuccess === void 0 ? void 0 : { exitCode: fallbackSuccess ? 0 : 1 };
}
function isToolResultTerminalContent(content) {
  return content.type === ToolResultContentType.Terminal;
}
function getTerminalCommandResult(tc) {
  const result = tc.content?.find(isToolResultTerminalContent)?.result;
  if (result) {
    return result;
  }
  return tc.content?.find((c) => c.type === "terminalComplete");
}
function getTerminalLanguage(tc) {
  return tc.toolName === "powershell" ? "powershell" : "shellscript";
}
function isTerminalToolCall(tc, existingKind) {
  if (existingKind === "terminal") {
    return true;
  }
  if (getToolKind(tc) === "terminal" && getTerminalInput(tc) !== void 0) {
    return true;
  }
  if (tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed) {
    return !!getTerminalContentUri(tc.content);
  }
  return false;
}
function buildTerminalToolSpecificData(tc, sessionResource, existing) {
  const terminalContent = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed ? getTerminalContent(tc.content) : void 0;
  const terminalContentUri = terminalContent?.resource;
  const nextCommand = getTerminalInput(tc);
  const commandLine = nextCommand ? { ...existing?.commandLine, original: nextCommand } : existing?.commandLine ?? { original: "" };
  const nextOutput = getTerminalOutput(tc);
  return {
    ...existing,
    kind: "terminal",
    commandLine,
    intention: tc.intention ?? existing?.intention,
    language: existing?.language ?? getTerminalLanguage(tc),
    autoApproveRuleResolvable: readToolCallMeta(tc).autoApproveRuleResolvable ?? existing?.autoApproveRuleResolvable,
    terminalToolSessionId: terminalContentUri ? makeAhpTerminalToolSessionId(terminalContentUri, sessionResource) : existing?.terminalToolSessionId,
    terminalCommandUri: terminalContentUri ? URI.parse(terminalContentUri) : existing?.terminalCommandUri,
    isPty: terminalContent?.isPty ?? existing?.isPty,
    terminalCommandOutput: nextOutput ?? existing?.terminalCommandOutput
  };
}
function getToolInputOutputDetails(tc, isError, errorString, includeMcpOutput, connectionAuthority) {
  const toolInput = tc.status === ToolCallStatus.Streaming ? void 0 : getInlineToolInput(tc.toolInput);
  if (!toolInput) {
    return void 0;
  }
  const output = [];
  if (tc.status === ToolCallStatus.Completed || tc.status === ToolCallStatus.Running) {
    for (const block of tc.content ?? []) {
      switch (block.type) {
        case ToolResultContentType.Text:
          output.push({ type: "embed", value: block.text, isText: true, mimeType: "text/plain" });
          break;
        case ToolResultContentType.EmbeddedResource:
          output.push({ type: "embed", value: block.data, mimeType: block.contentType });
          break;
        case ToolResultContentType.Resource:
          output.push({ type: "ref", uri: wrapResourceUri(block.uri, connectionAuthority), mimeType: block.contentType });
          break;
      }
    }
  }
  if (output.length === 0 && errorString) {
    output.push({ type: "embed", value: errorString, isText: true, mimeType: "text/plain" });
  }
  return {
    input: toolInput,
    inputLanguage: "json",
    output,
    isError,
    mcpOutput: includeMcpOutput ? toMcpCallToolResult(tc, isError, connectionAuthority) : void 0
  };
}
function toMcpCallToolResult(tc, isError, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Completed && tc.status !== ToolCallStatus.Running) {
    return void 0;
  }
  const content = [];
  for (const block of tc.content ?? []) {
    const mcpBlock = toMcpContentBlock(block, connectionAuthority);
    if (mcpBlock) {
      content.push(mcpBlock);
    }
  }
  if (content.length === 0 && !isError) {
    return void 0;
  }
  return { content, isError: isError || void 0 };
}
function toMcpContentBlock(block, connectionAuthority) {
  switch (block.type) {
    case ToolResultContentType.Text:
      return { type: "text", text: block.text };
    case ToolResultContentType.EmbeddedResource: {
      if (block.contentType.startsWith("image/")) {
        return { type: "image", data: block.data, mimeType: block.contentType };
      }
      if (block.contentType.startsWith("audio/")) {
        return { type: "audio", data: block.data, mimeType: block.contentType };
      }
      return {
        type: "resource",
        resource: {
          uri: `data:${block.contentType};base64,${block.data}`,
          mimeType: block.contentType,
          blob: block.data
        }
      };
    }
    case ToolResultContentType.Resource: {
      const wrapped = wrapResourceUri(block.uri, connectionAuthority);
      return {
        type: "resource_link",
        name: basename(wrapped) || wrapped.toString(),
        uri: wrapped.toString(),
        mimeType: block.contentType
      };
    }
    default:
      return void 0;
  }
}
function wrapResourceUri(uri, connectionAuthority) {
  return toAgentHostUri(URI.parse(uri), connectionAuthority);
}
function getToolErrorString(tc) {
  if (tc.status === ToolCallStatus.Completed) {
    return tc.error?.message;
  }
  if (tc.status === ToolCallStatus.Cancelled) {
    return typeof tc.reasonMessage === "string" ? tc.reasonMessage : tc.reasonMessage?.markdown;
  }
  return void 0;
}
function buildSessionCreatedToolData(tc) {
  if (tc.status !== ToolCallStatus.Completed || !tc.success) {
    return void 0;
  }
  const isSend = isSendMessageTool(tc.toolName);
  if (!isCreateSessionTool(tc.toolName) && !isCreateChatTool(tc.toolName) && !isSend) {
    return void 0;
  }
  const output = getToolOutputText(tc);
  const match = output?.match(/agent-host-session:\/\/[^\s)<>;"']+/);
  const openLink = match?.[0];
  const backend = openLink ? parseOpenSessionLinkUri(openLink) : void 0;
  if (!openLink || !backend) {
    return void 0;
  }
  const isChat = isCreateChatTool(tc.toolName) || isSend && !!parseOpenSessionLinkChatId(openLink);
  const label = createSessionTitleFromArgs(getInlineToolInput(tc.toolInput)) ?? (backend.path.replace(/^\//, "") || backend.toString());
  return { kind: "sessionCreated", openLink, label, isChat };
}
function buildGeneratedImageToolData(tc) {
  if (tc.status !== ToolCallStatus.Completed || !tc.success || tc.toolName !== imageGenerationToolName) {
    return void 0;
  }
  const hasImage = tc.content?.some((block) => block.type === ToolResultContentType.EmbeddedResource && block.contentType.startsWith("image/") && block.data.length > 0);
  return hasImage ? { kind: "generatedImage" } : void 0;
}
function buildAutomationConfiguredToolData(tc) {
  if (tc.status !== ToolCallStatus.Completed || !tc.success || tc.toolName !== ConfigureAutomationToolReferenceName) {
    return void 0;
  }
  const output = getToolOutputText(tc);
  if (!output) {
    return void 0;
  }
  try {
    const parsed = JSON.parse(output);
    const operation = parsed.status === "created" || parsed.status === "updated" ? parsed.status : void 0;
    if (!operation || typeof parsed.automation?.id !== "string" || typeof parsed.automation.name !== "string") {
      return void 0;
    }
    return {
      kind: "automationConfigured",
      automationId: parsed.automation.id,
      automationName: parsed.automation.name,
      operation
    };
  } catch {
    return void 0;
  }
}
function createSessionTitleFromArgs(toolInput) {
  if (!toolInput) {
    return void 0;
  }
  try {
    const args = JSON.parse(toolInput);
    const text = typeof args.prompt === "string" ? args.prompt : typeof args.message === "string" ? args.message : void 0;
    if (text === void 0) {
      return void 0;
    }
    const firstLine = text.trim().split("\n")[0].trim();
    if (!firstLine) {
      return void 0;
    }
    return firstLine.length > 60 ? `${firstLine.slice(0, 57)}\u2026` : firstLine;
  } catch {
    return void 0;
  }
}
function completedToolCallConfirmedReason(tc) {
  if (tc.status === ToolCallStatus.Completed) {
    return { type: ToolConfirmKind.ConfirmationNotNeeded };
  }
  return { type: tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied };
}
function completedToolCallToSerialized(tc, subAgentInvocationId, sessionResource, connectionAuthority) {
  const isTerminal = isTerminalToolCall(tc);
  const isSuccess = tc.status === ToolCallStatus.Completed && tc.success;
  let invocationMsg = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;
  const subagentContent = tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : void 0;
  const isSubagent = subagentContent || isSubagentTool(tc);
  if (isSubagent && tc.status === ToolCallStatus.Completed) {
    const resultText = getToolOutputText(tc);
    const pastTenseMsg2 = isSuccess ? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg : invocationMsg;
    return {
      kind: "toolInvocationSerialized",
      toolCallId: tc.toolCallId,
      toolId: tc.toolName,
      source: ToolDataSource.Internal,
      invocationMessage: invocationMsg,
      originMessage: void 0,
      pastTenseMessage: pastTenseMsg2,
      isConfirmed: completedToolCallConfirmedReason(tc),
      isComplete: true,
      presentation: void 0,
      subAgentInvocationId,
      toolSpecificData: {
        kind: "subagent",
        description: getSubagentTaskDescription(tc) ?? tc.displayName,
        agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
        result: resultText,
        chatResource: getSubagentChatResource(tc, subagentContent, sessionResource)
      }
    };
  }
  let toolSpecificData;
  if (isTerminal) {
    toolSpecificData = {
      ...buildTerminalToolSpecificData(tc, sessionResource),
      terminalCommandState: getTerminalCommandState(tc, isSuccess)
    };
  } else if (getToolKind(tc) === "search") {
    toolSpecificData = { kind: "search" };
  } else {
    toolSpecificData = buildSessionCreatedToolData(tc) ?? buildGeneratedImageToolData(tc) ?? buildAutomationConfiguredToolData(tc);
    if (!toolSpecificData) {
      toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
    }
  }
  let pastTenseMsg = isSuccess ? stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority) ?? invocationMsg : invocationMsg;
  if (isAddCommentTool(tc.toolName)) {
    const ref = addCommentReference(tc);
    if (ref) {
      invocationMsg = ref;
      pastTenseMsg = ref;
    }
  }
  const resultDetails = (!toolSpecificData || toolSpecificData.kind === "generatedImage" || toolSpecificData.kind === "input" && toolSpecificData.mcpAppData) && (tc.status !== ToolCallStatus.Completed || getToolFileEdits(tc).length === 0) ? getToolInputOutputDetails(tc, !isSuccess, getToolErrorString(tc), !!(toolSpecificData?.kind === "input" && toolSpecificData.mcpAppData), connectionAuthority) : void 0;
  return {
    kind: "toolInvocationSerialized",
    toolCallId: tc.toolCallId,
    toolId: tc.toolName,
    source: ToolDataSource.Internal,
    invocationMessage: invocationMsg,
    originMessage: void 0,
    pastTenseMessage: isTerminal ? void 0 : pastTenseMsg,
    isConfirmed: completedToolCallConfirmedReason(tc),
    isComplete: true,
    presentation: shouldHideCompletedAgentHostAskUserTool(tc) ? ToolInvocationPresentation.HiddenAfterComplete : void 0,
    subAgentInvocationId,
    toolSpecificData,
    resultDetails
  };
}
function completedToolCallToEditParts(tc, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Completed) {
    return [];
  }
  const fileEdits = getToolFileEdits(tc);
  if (fileEdits.length === 0) {
    return [];
  }
  const parts = [];
  for (const edit of fileEdits) {
    const part = fileEditToExternalEdit(edit, tc.toolCallId, connectionAuthority);
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}
function fileEditToExternalEdit(edit, undoStopId, connectionAuthority) {
  const normalized = normalizeFileEdit(edit);
  if (!normalized) {
    return void 0;
  }
  const diff = edit.diff && (edit.diff.added !== void 0 || edit.diff.removed !== void 0) ? { added: edit.diff.added ?? 0, removed: edit.diff.removed ?? 0 } : void 0;
  return {
    kind: "externalEdit",
    uri: toAgentHostUri(normalized.resource, connectionAuthority),
    editKind: normalized.kind,
    originalUri: normalized.kind === FileEditKind.Rename && normalized.beforeUri ? toAgentHostUri(normalized.beforeUri, connectionAuthority) : void 0,
    beforeContentUri: normalized.beforeContentUri ? toAgentHostUri(normalized.beforeContentUri, connectionAuthority) : void 0,
    afterContentUri: normalized.afterContentUri ? toAgentHostUri(normalized.afterContentUri, connectionAuthority) : void 0,
    diff,
    undoStopId
  };
}
const EXTERNAL_LINK_SCHEMES = /* @__PURE__ */ new Set([
  "http",
  "https",
  "mailto",
  "ws",
  "wss",
  "ftp",
  "ftps",
  "data",
  "blob",
  "javascript",
  "command",
  "vscode",
  "vscode-insiders",
  Schemas.vscodeBrowser,
  "copilot-skill",
  product.urlProtocol,
  AGENT_HOST_SCHEME
]);
function rewriteMarkdownLinks(markdown, connectionAuthority) {
  return rewriteMarkdownSource(markdown, {
    rewriteLink: (token) => rewriteLinkTokenRaw(token, connectionAuthority)
  });
}
function rewriteLinkTokenRaw(token, connectionAuthority) {
  let parsed;
  try {
    parsed = URI.parse(token.href, true);
  } catch {
    return void 0;
  }
  const scheme = parsed.scheme.toLowerCase();
  if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
    return void 0;
  }
  let agentHostUri = toAgentHostUri(parsed, connectionAuthority);
  const isSkill = isSkillFileUri(parsed);
  if (isSkill && !agentHostUri.query.includes("vscodeLinkType=")) {
    const existing = agentHostUri.query;
    agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : "vscodeLinkType=skill" });
  }
  const prefix = token.type === "image" ? "![" : "[";
  const text = isSkill || token.type === "image" ? escapeMarkdownLinkLabel(token.text ?? "") : "";
  return `${prefix}${text}](${agentHostUri.toString()})`;
}
function isSkillFileUri(uri) {
  const name = basename(uri);
  return name.toLowerCase() === "skill.md";
}
function rawMarkdownToString(content, connectionAuthority) {
  const rewritten = connectionAuthority ? rewriteMarkdownLinks(content, connectionAuthority) : content;
  return new MarkdownString(rewritten);
}
function parseAbsoluteFileLinkTarget(href) {
  const fragmentIndex = href.indexOf("#");
  const rawPath = fragmentIndex >= 0 ? href.substring(0, fragmentIndex) : href;
  if (rawPath.includes("?")) {
    return void 0;
  }
  const existingFragment = fragmentIndex >= 0 ? href.substring(fragmentIndex + 1) : "";
  const parsedPath = existingFragment ? { path: rawPath } : parseFileLocation(rawPath);
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(parsedPath.path);
  } catch {
    return void 0;
  }
  const absolutePath = decodedPath;
  const isWindowsPath = win32.isAbsolute(absolutePath);
  if (!posix.isAbsolute(absolutePath) && !isWindowsPath) {
    return void 0;
  }
  const selectionFragment = formatLocationFragment(parsedPath);
  const normalizedPath = isWindowsPath ? absolutePath.replaceAll("\\", "/") : absolutePath;
  return URI.file(normalizedPath).with({ fragment: existingFragment || selectionFragment });
}
function parseFileLocation(path) {
  const match = /^(?<path>.+?):(?<line>[1-9]\d*)(?::(?<column>[1-9]\d*))?$/.exec(path);
  if (!match?.groups) {
    return { path };
  }
  const line = Number(match.groups.line);
  const column = match.groups.column ? Number(match.groups.column) : void 0;
  if (!Number.isSafeInteger(line) || column !== void 0 && !Number.isSafeInteger(column)) {
    return { path };
  }
  return { path: match.groups.path, line, column };
}
function formatLocationFragment(location) {
  if (location.line === void 0) {
    return "";
  }
  return `L${location.line}${location.column !== void 0 && location.column !== 1 ? `,${location.column}` : ""}`;
}
function normalizeFileUriSelection(uri, href) {
  if (uri.scheme.toLowerCase() !== Schemas.file || uri.query || uri.fragment) {
    return uri;
  }
  const parsedPath = parseFileLocation(href);
  if (parsedPath.line === void 0) {
    return uri;
  }
  const fragment = formatLocationFragment(parsedPath);
  const suffixLength = href.length - parsedPath.path.length;
  return uri.with({ path: uri.path.substring(0, uri.path.length - suffixLength), fragment });
}
function rewriteAgentHostLinkTarget(href, connectionAuthority) {
  let parsed = parseAbsoluteFileLinkTarget(href);
  if (!parsed) {
    try {
      parsed = URI.parse(href, true);
    } catch {
      return href;
    }
    const scheme = parsed.scheme.toLowerCase();
    if (!scheme || EXTERNAL_LINK_SCHEMES.has(scheme)) {
      return href;
    }
    parsed = normalizeFileUriSelection(parsed.with({ scheme }), href);
    if (!parsed.path.startsWith("/")) {
      return href;
    }
  }
  let agentHostUri;
  try {
    agentHostUri = toAgentHostUri(parsed, connectionAuthority);
  } catch {
    return href;
  }
  if (isSkillFileUri(parsed) && !agentHostUri.query.includes("vscodeLinkType=")) {
    const existing = agentHostUri.query;
    agentHostUri = agentHostUri.with({ query: existing ? `${existing}&vscodeLinkType=skill` : "vscodeLinkType=skill" });
  }
  return agentHostUri.toString();
}
function stringOrMarkdownToString(value, connectionAuthority) {
  if (value === void 0) {
    return void 0;
  }
  if (typeof value === "string") {
    return value;
  }
  return rawMarkdownToString(value.markdown, connectionAuthority);
}
const ADD_COMMENT_PREVIEW_LENGTH = 40;
function addCommentPreview(text) {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > ADD_COMMENT_PREVIEW_LENGTH ? `${singleLine.slice(0, ADD_COMMENT_PREVIEW_LENGTH)}\u2026` : singleLine;
}
function isPositiveInteger(value) {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}
function isOneBasedRange(value) {
  const range = value;
  return !!range && typeof range === "object" && isPositiveInteger(range.startLineNumber) && isPositiveInteger(range.startColumn) && isPositiveInteger(range.endLineNumber) && isPositiveInteger(range.endColumn);
}
function addCommentReference(tc) {
  if (tc.status === ToolCallStatus.Streaming || !tc.toolInput) {
    return void 0;
  }
  const toolInput = getInlineToolInput(tc.toolInput);
  if (!toolInput) {
    return void 0;
  }
  let args;
  try {
    args = JSON.parse(toolInput);
  } catch {
    return void 0;
  }
  if (typeof args.resourceUri !== "string" || typeof args.text !== "string" || !isOneBasedRange(args.range)) {
    return void 0;
  }
  const preview = escapeIcons(escapeMarkdownLinkLabel(addCommentPreview(args.text)));
  const commandArgs = encodeURIComponent(JSON.stringify([args.resourceUri, args.range]));
  const link = `command:${AgentFeedbackReviewCommandId.RevealAt}?${commandArgs}`;
  return new MarkdownString(`[addComment "${preview}"](${link})`, {
    isTrusted: { enabledCommands: [AgentFeedbackReviewCommandId.RevealAt] },
    supportThemeIcons: true
  });
}
function toolCallStateToInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority, mcpServerAuthority = sessionResource.authority, options) {
  const toolData = {
    id: tc.toolName,
    source: ToolDataSource.Internal,
    displayName: tc.displayName,
    modelDescription: tc.toolName
  };
  if (tc.contributor?.kind === ToolCallContributorKind.Client && options && tc.contributor.clientId !== options.currentClientId) {
    const invocation2 = new ChatToolInvocation(void 0, toolData, tc.toolCallId, subAgentInvocationId, void 0);
    invocation2.invocationMessage = localize("agentHost.otherClientTool.running", "Running {0} on another client...", tc.displayName);
    invocation2.otherClientToolCall = {
      cancel: () => options.cancelOtherClientToolCall(tc)
    };
    return invocation2;
  }
  if (tc.status === ToolCallStatus.PendingConfirmation) {
    const confirmationMessages = toolCallConfirmationMessages(tc, connectionAuthority);
    let toolSpecificData;
    const pendingEdits = tc.edits?.items;
    if (isViewUnreviewedCommentsTool(tc.toolName)) {
      toolSpecificData = {
        kind: "agentFeedbackReviewConfirmation",
        options: [localize("agentFeedback.reveal", "Reveal Selected")]
      };
    } else if (pendingEdits?.length) {
      const wrap = (uri) => connectionAuthority ? toAgentHostUri(uri, connectionAuthority) : uri;
      const mapped = mapFileEdits(pendingEdits, tc.toolCallId);
      toolSpecificData = {
        kind: "modifiedFilesConfirmation",
        options: ["Allow"],
        modifiedFiles: mapped.map((edit) => {
          const resource = wrap(edit.resource);
          const originalResource = edit.originalResource ? wrap(edit.originalResource) : void 0;
          const modifiedContent = edit.afterContentUri ? wrap(edit.afterContentUri) : void 0;
          const originalContent = edit.beforeContentUri ? wrap(edit.beforeContentUri) : void 0;
          return {
            uri: resource,
            editKind: edit.kind,
            originalUri: originalResource,
            modifiedContentUri: modifiedContent,
            originalContentUri: originalContent,
            insertions: edit.diff?.added,
            deletions: edit.diff?.removed,
            title: basename(edit.resource),
            description: edit.resource.path
          };
        })
      };
    } else if (getToolKind(tc) === "terminal" && getInlineToolInput(tc.toolInput)) {
      toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
    } else {
      const toolInput = getInlineToolInput(tc.toolInput);
      if (toolInput) {
        let rawInput;
        try {
          rawInput = JSON.parse(toolInput);
        } catch {
          rawInput = { input: toolInput };
        }
        toolSpecificData = { kind: "input", rawInput };
      }
    }
    return new ChatToolInvocation(
      {
        invocationMessage: stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
        confirmationMessages,
        presentation: ToolInvocationPresentation.HiddenAfterComplete,
        toolSpecificData
      },
      toolData,
      tc.toolCallId,
      subAgentInvocationId,
      void 0
    );
  }
  const invocation = new ChatToolInvocation(void 0, toolData, tc.toolCallId, subAgentInvocationId, void 0);
  invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? tc.displayName;
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.invocationMessage = localize("agentHost.askUser.waiting", "Waiting for answer...");
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (tc.status === ToolCallStatus.AuthRequired) {
    invocation.setAuthenticationRequired(toolCallAuthenticationServer(tc, mcpServerAuthority));
  }
  if (isAddCommentTool(tc.toolName)) {
    invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
  }
  if (isTerminalToolCall(tc)) {
    invocation.toolSpecificData = buildTerminalToolSpecificData(tc, sessionResource);
  } else if (isSubagentTool(tc)) {
    const subagentContent = tc.status === ToolCallStatus.Running || tc.status === ToolCallStatus.Completed ? getToolSubagentContent(tc) : void 0;
    invocation.toolSpecificData = {
      kind: "subagent",
      description: getSubagentTaskDescription(tc),
      agentName: subagentContent?.agentName ?? getSubagentAgentName(tc),
      chatResource: getSubagentChatResource(tc, subagentContent, sessionResource)
    };
  } else if (getToolKind(tc) === "search") {
    invocation.toolSpecificData = { kind: "search" };
  } else if (tc.status !== ToolCallStatus.Streaming) {
    invocation.toolSpecificData = buildMcpAppToolInputData(tc, sessionResource);
  }
  return invocation;
}
function toolCallConfirmationMessages(tc, connectionAuthority) {
  const riskAssessment = tc.riskAssessment;
  let approvalReason;
  if (riskAssessment?.status === ToolCallRiskAssessmentStatus.Loading) {
    approvalReason = { status: "loading" };
  } else if (riskAssessment?.status === ToolCallRiskAssessmentStatus.Complete) {
    approvalReason = {
      status: "complete",
      explanation: stringOrMarkdownToString(riskAssessment.reason, connectionAuthority),
      safety: riskAssessment.safety
    };
  }
  return {
    title: isViewUnreviewedCommentsTool(tc.toolName) ? localize("agentFeedback.reviewTitle", "Reveal unreviewed comments?") : stringOrMarkdownToString(tc.confirmationTitle, connectionAuthority) ?? tc.displayName,
    message: isViewUnreviewedCommentsTool(tc.toolName) ? localize("agentFeedback.reviewMessage", "Choose which comments to reveal to the agent. Unchecked comments stay hidden.") : stringOrMarkdownToString(tc.invocationMessage, connectionAuthority),
    approvalReason,
    ...tc.options ? { customOptions: tc.options } : {}
  };
}
function toolCallAuthenticationServer(tc, sessionAuthority) {
  const metadata = readToolCallMeta(tc);
  return {
    id: `${sessionAuthority}/${tc.contributor.customizationId}`,
    name: tc.auth.resource.resource_name ?? metadata.mcpServerName ?? tc.displayName,
    resource: tc.auth.resource.resource,
    oauthClient: tc.auth.oauthClient,
    authorizationServers: tc.auth.resource.authorization_servers,
    supportedScopes: tc.auth.resource.scopes_supported,
    requiredScopes: tc.auth.requiredScopes,
    reason: tc.auth.reason
  };
}
function toolCallStateToStreamingInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority, mcpServerAuthority) {
  const invocation = ChatToolInvocation.createStreaming({
    toolCallId: tc.toolCallId,
    toolId: tc.toolName,
    toolData: {
      id: tc.toolName,
      source: ToolDataSource.Internal,
      displayName: tc.displayName,
      modelDescription: tc.toolName
    },
    subagentInvocationId: subAgentInvocationId
  });
  updateStreamingToolInvocation(invocation, tc, connectionAuthority ?? "");
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.invocationMessage = localize("agentHost.askUser.asking", "Asking a question...");
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (sessionResource && isSubagentTool(tc)) {
    invocation.toolSpecificData = toolCallStateToInvocation(tc, subAgentInvocationId, sessionResource, connectionAuthority ?? "", mcpServerAuthority).toolSpecificData;
  }
  return invocation;
}
function getStreamingToolInputForDisplay(tc) {
  if (tc.status !== ToolCallStatus.Streaming || !tc.partialInput) {
    return void 0;
  }
  return parsePartialToolInputForDisplay(tc.partialInput) ?? tc.partialInput;
}
function updateStreamingToolInvocation(existing, tc, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Streaming) {
    return void 0;
  }
  if (getToolKind(tc) === "read") {
    existing.updatePartialInput(void 0);
    existing.updateStreamingMessage(localize("agentHost.streaming.readingFile", "Reading file"));
    return void 0;
  }
  const partialInput = getStreamingToolInputForDisplay(tc);
  if (partialInput !== void 0) {
    existing.updatePartialInput(partialInput);
  }
  const invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority);
  if (invocationMessage) {
    existing.updateStreamingMessage(invocationMessage);
  }
  return partialInput;
}
function toolCallStateToPreparedInvocation(tc, sessionResource, connectionAuthority, mcpServerAuthority = sessionResource.authority, options) {
  const built = toolCallStateToInvocation(tc, void 0, sessionResource, connectionAuthority, mcpServerAuthority, options);
  return {
    invocationMessage: built.invocationMessage,
    pastTenseMessage: built.pastTenseMessage,
    confirmationMessages: built.confirmationMessages,
    presentation: built.presentation,
    toolSpecificData: built.toolSpecificData
  };
}
function updateRunningToolSpecificData(existing, tc, sessionResource, connectionAuthority) {
  if (tc.status !== ToolCallStatus.Running) {
    return;
  }
  existing.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? existing.invocationMessage;
  if (isAgentHostAskUserTool(tc.toolName)) {
    existing.invocationMessage = localize("agentHost.askUser.waiting", "Waiting for answer...");
    existing.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (isAddCommentTool(tc.toolName)) {
    existing.invocationMessage = addCommentReference(tc) ?? existing.invocationMessage;
  }
  const subagentContent = getToolSubagentContent(tc);
  if (subagentContent) {
    existing.toolSpecificData = {
      kind: "subagent",
      isActive: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.isActive : void 0,
      description: getSubagentTaskDescription(tc),
      agentName: subagentContent.agentName,
      credits: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.credits : void 0,
      modelName: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.modelName : void 0,
      startedAt: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.startedAt : void 0,
      duration: existing.toolSpecificData?.kind === "subagent" ? existing.toolSpecificData.duration : void 0,
      chatResource: subagentContent.resource
    };
    existing.notifyToolSpecificDataChanged();
    return;
  }
  if (existing.toolSpecificData?.kind === "subagent") {
    const description = getSubagentTaskDescription(tc) ?? existing.toolSpecificData.description;
    const agentName = getSubagentAgentName(tc) ?? existing.toolSpecificData.agentName;
    if (description !== existing.toolSpecificData.description || agentName !== existing.toolSpecificData.agentName) {
      existing.toolSpecificData = { ...existing.toolSpecificData, description, agentName };
      existing.notifyToolSpecificDataChanged();
    }
    return;
  }
  const existingInput = existing.toolSpecificData?.kind === "input" ? existing.toolSpecificData : void 0;
  const nextInput = buildMcpAppToolInputData(tc, sessionResource, existingInput?.rawInput);
  if (nextInput) {
    if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, nextInput.mcpAppData)) {
      existing.toolSpecificData = nextInput;
      existing.notifyToolSpecificDataChanged();
    }
    return;
  }
  const existingTerminal = existing.toolSpecificData?.kind === "terminal" ? existing.toolSpecificData : void 0;
  if (isTerminalToolCall(tc, existing.toolSpecificData?.kind)) {
    const next = buildTerminalToolSpecificData(tc, sessionResource, existingTerminal);
    const outputChanged = next.terminalCommandOutput?.text !== existingTerminal?.terminalCommandOutput?.text;
    const commandChanged = next.commandLine.original !== existingTerminal?.commandLine.original;
    if (!existingTerminal || outputChanged || commandChanged) {
      existing.toolSpecificData = next;
      existing.notifyToolSpecificDataChanged();
    }
  }
}
function finalizeToolInvocation(invocation, tc, backendSession, connectionAuthority) {
  const isCompleted = tc.status === ToolCallStatus.Completed;
  const isCancelled = tc.status === ToolCallStatus.Cancelled;
  const isTerminal = isTerminalToolCall(tc, invocation.toolSpecificData?.kind);
  if ((isCompleted || isCancelled) && hasKey(tc, { invocationMessage: true })) {
    invocation.invocationMessage = stringOrMarkdownToString(tc.invocationMessage, connectionAuthority) ?? invocation.invocationMessage;
  }
  if (isAddCommentTool(tc.toolName)) {
    invocation.invocationMessage = addCommentReference(tc) ?? invocation.invocationMessage;
  }
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.presentation = ToolInvocationPresentation.HiddenAfterComplete;
  }
  if (isCompleted) {
    const subagentContent = getToolSubagentContent(tc);
    if (subagentContent) {
      const resultText = getToolOutputText(tc);
      invocation.toolSpecificData = {
        kind: "subagent",
        isActive: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.isActive : void 0,
        description: getSubagentTaskDescription(tc),
        agentName: subagentContent.agentName,
        result: resultText,
        credits: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.credits : void 0,
        modelName: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.modelName : void 0,
        startedAt: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.startedAt : void 0,
        duration: invocation.toolSpecificData?.kind === "subagent" ? invocation.toolSpecificData.duration : void 0,
        chatResource: getSubagentChatResource(tc, subagentContent, backendSession)
      };
    } else if (invocation.toolSpecificData?.kind === "subagent") {
      invocation.toolSpecificData = {
        kind: "subagent",
        isActive: invocation.toolSpecificData.isActive,
        description: getSubagentTaskDescription(tc) ?? invocation.toolSpecificData.description,
        agentName: getSubagentAgentName(tc) ?? invocation.toolSpecificData.agentName,
        result: getToolOutputText(tc),
        credits: invocation.toolSpecificData.credits,
        modelName: invocation.toolSpecificData.modelName,
        startedAt: invocation.toolSpecificData.startedAt,
        duration: invocation.toolSpecificData.duration,
        chatResource: invocation.toolSpecificData.chatResource ?? getSubagentChatResource(tc, void 0, backendSession)
      };
    }
  }
  if (isTerminal && (isCompleted || isCancelled)) {
    const existing = invocation.toolSpecificData?.kind === "terminal" ? invocation.toolSpecificData : void 0;
    invocation.presentation = void 0;
    invocation.toolSpecificData = {
      ...buildTerminalToolSpecificData(tc, backendSession, existing),
      terminalCommandState: getTerminalCommandState(tc, isCompleted && tc.success)
    };
  } else if (isCompleted && tc.pastTenseMessage) {
    invocation.pastTenseMessage = stringOrMarkdownToString(tc.pastTenseMessage, connectionAuthority);
  }
  if (isCompleted && isAddCommentTool(tc.toolName)) {
    invocation.pastTenseMessage = addCommentReference(tc) ?? invocation.pastTenseMessage;
  }
  if (isCompleted) {
    const resultToolSpecificData = buildSessionCreatedToolData(tc) ?? buildGeneratedImageToolData(tc) ?? buildAutomationConfiguredToolData(tc);
    if (resultToolSpecificData) {
      invocation.presentation = void 0;
      invocation.toolSpecificData = resultToolSpecificData;
      invocation.notifyToolSpecificDataChanged();
    }
  }
  if (isCompleted) {
    const mcpAppInput = buildMcpAppToolInputData(
      tc,
      backendSession,
      invocation.toolSpecificData?.kind === "input" ? invocation.toolSpecificData.rawInput : void 0
    );
    if (mcpAppInput) {
      const existingInput = invocation.toolSpecificData?.kind === "input" ? invocation.toolSpecificData : void 0;
      invocation.toolSpecificData = mcpAppInput;
      if (!existingInput || !isSameMcpAppData(existingInput.mcpAppData, mcpAppInput.mcpAppData)) {
        invocation.notifyToolSpecificDataChanged();
      }
    }
  }
  const isFailure = isCompleted && !tc.success || isCancelled;
  const errorMessage = isCompleted ? tc.error?.message : isCancelled ? tc.reasonMessage : void 0;
  const errorString = typeof errorMessage === "string" ? errorMessage : errorMessage?.markdown;
  const fileEdits = isCompleted ? fileEditsToExternalEdits(tc) : [];
  if (isAgentHostAskUserTool(tc.toolName)) {
    invocation.presentation = shouldHideCompletedAgentHostAskUserTool(tc) ? ToolInvocationPresentation.HiddenAfterComplete : void 0;
  }
  if (fileEdits.length > 0 && !isFailure) {
    invocation.presentation = ToolInvocationPresentation.Hidden;
  }
  const hasMcpAppData = invocation.toolSpecificData?.kind === "input" && !!invocation.toolSpecificData.mcpAppData;
  const resultDetails = !isTerminal && invocation.toolSpecificData?.kind !== "subagent" && invocation.toolSpecificData?.kind !== "sessionCreated" && getToolKind(tc) !== "search" && fileEdits.length === 0 ? getToolInputOutputDetails(tc, isFailure, errorString, hasMcpAppData, connectionAuthority) : void 0;
  const result = isFailure || resultDetails ? { content: [], toolResultError: isFailure ? errorString : void 0, toolResultDetails: resultDetails } : void 0;
  const cancelledFromStreaming = isCancelled && invocation.cancelFromStreaming(
    tc.reason === ToolCallCancellationReason.Skipped ? ToolConfirmKind.Skipped : ToolConfirmKind.Denied,
    tc.reasonMessage ? stringOrMarkdownToString(tc.reasonMessage, connectionAuthority) : void 0
  );
  if (!cancelledFromStreaming) {
    invocation.didExecuteTool(result);
  }
  return fileEdits;
}
function fileEditsToExternalEdits(tc) {
  if (tc.status !== ToolCallStatus.Completed) {
    return [];
  }
  const edits = getToolFileEdits(tc);
  if (edits.length === 0) {
    return [];
  }
  return mapFileEdits(edits, tc.toolCallId);
}
function mapFileEdits(items, undoStopId) {
  const result = [];
  for (const edit of items) {
    const normalized = normalizeFileEdit(edit);
    if (!normalized) {
      continue;
    }
    result.push({
      kind: normalized.kind,
      resource: normalized.resource,
      originalResource: normalized.kind === FileEditKind.Rename ? normalized.beforeUri : void 0,
      beforeContentUri: normalized.beforeContentUri,
      afterContentUri: normalized.afterContentUri,
      undoStopId,
      diff: edit.diff
    });
  }
  return result;
}
export {
  BOOLEAN_FALSE_OPTION_ID,
  BOOLEAN_TRUE_OPTION_ID,
  activeTurnToProgress,
  completedToolCallToEditParts,
  completedToolCallToSerialized,
  containsAutomaticReplyAnswer,
  convertProtocolAnswers,
  convertProtocolPlanReviewResult,
  createInputRequestCarousel,
  createInputRequestPlanReview,
  fileEditsToExternalEdits,
  finalizeToolInvocation,
  formatTurnResponseDetails,
  getTerminalContent,
  getUrlInputRequestPresentation,
  inputRequestResponsePartToProgress,
  isSubagentTool,
  isSubagentToolName,
  makeAhpTerminalToolSessionId,
  messageAttachmentsToVariableData,
  messageToRequestOrigin,
  messageToVariableData,
  parseAhpTerminalToolSessionId,
  rawMarkdownToString,
  rewriteAgentHostLinkTarget,
  rewriteMarkdownLinks,
  shouldObserveSubagentChat,
  stringOrMarkdownToString,
  systemNotificationToChatPart,
  toolCallAuthenticationServer,
  toolCallConfirmationMessages,
  toolCallStateToInvocation,
  toolCallStateToPreparedInvocation,
  toolCallStateToStreamingInvocation,
  turnsToHistory,
  updateRunningToolSpecificData,
  updateStreamingToolInvocation,
  usageInfoToAutoModeResolution,
  usageInfoToChatUsage,
  usageInfoToQuotas
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXGFnZW50U2Vzc2lvbnNcXGFnZW50SG9zdFxcc3RhdGVUb1Byb2dyZXNzQWRhcHRlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCB7IGRlY29kZUJhc2U2NCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2J1ZmZlci5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwsIElNYXJrZG93blN0cmluZywgTWFya2Rvd25TdHJpbmcgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9odG1sQ29udGVudC5qcyc7XG5pbXBvcnQgeyBlc2NhcGVJY29ucyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ljb25MYWJlbHMuanMnO1xuaW1wb3J0IHsgdHlwZSBUb2tlbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9tYXJrZWQvbWFya2VkLmpzJztcbmltcG9ydCB7IHJld3JpdGVNYXJrZG93bkxpbmtzIGFzIHJld3JpdGVNYXJrZG93blNvdXJjZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcmtkb3duTGlua3MuanMnO1xuaW1wb3J0IHsgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgcG9zaXgsIHdpbjMyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vcGF0aC5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgZ2VuZXJhdGVVdWlkIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vdXVpZC5qcyc7XG5pbXBvcnQgeyBidWlsZFN1YmFnZW50Q2hhdFVyaSwgaXNNZXNzYWdlSGlkZGVuRnJvbVRyYW5zY3JpcHQsIE1lc3NhZ2VLaW5kLCBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbiwgVG9vbENhbGxDb250cmlidXRvcktpbmQsIFRvb2xDYWxsUmlza0Fzc2Vzc21lbnRTdGF0dXMsIFRvb2xDYWxsU3RhdHVzLCBUdXJuU3RhdGUsIFJlc3BvbnNlUGFydEtpbmQsIGdldElubGluZVRvb2xJbnB1dCwgZ2V0VG9vbEZpbGVFZGl0cywgZ2V0VG9vbE91dHB1dFRleHQsIGdldFRvb2xTdWJhZ2VudENvbnRlbnQsIGhhc1JlcG9ydGVkVXNhZ2UsIHJlYWRVc2FnZUluZm9NZXRhLCBDaGF0SW5wdXRBbnN3ZXJTdGF0ZSwgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLCBDaGF0SW5wdXRRdWVzdGlvbktpbmQsIENoYXRJbnB1dFJlc3BvbnNlS2luZCwgdHlwZSBBY3RpdmVUdXJuLCB0eXBlIENoYXRJbnB1dEFuc3dlciwgdHlwZSBDaGF0SW5wdXRSZXF1ZXN0LCB0eXBlIElDb21wbGV0ZWRUb29sQ2FsbCwgdHlwZSBJbnB1dFJlcXVlc3RSZXNwb25zZVBhcnQsIHR5cGUgTWVzc2FnZSwgdHlwZSBUZXJtaW5hbENvbW1hbmRSZXN1bHQsIHR5cGUgVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUsIHR5cGUgVG9vbENhbGxTdGF0ZSwgdHlwZSBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50LCB0eXBlIFR1cm4sIEZpbGVFZGl0S2luZCwgVG9vbFJlc3VsdENvbnRlbnRUeXBlLCB0eXBlIFRvb2xSZXN1bHRDb250ZW50LCB0eXBlIFVzYWdlSW5mbywgdHlwZSBVc2FnZUluZm9NZXRhIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uU3RhdGUuanMnO1xuaW1wb3J0IHR5cGUgeyBDaGF0SW5wdXRSZXF1ZXN0V2l0aFBsYW5SZXZpZXcsIElBZ2VudEhvc3RQbGFuUmV2aWV3IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9hZ2VudEhvc3RQbGFuUmV2aWV3LmpzJztcbmltcG9ydCB7IGdldFRvb2xLaW5kIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9zdGF0ZS9zZXNzaW9uUmVkdWNlcnMuanMnO1xuaW1wb3J0IHsgcmVhZFRvb2xDYWxsTWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudFRvb2xDYWxsTWV0YS5qcyc7XG5pbXBvcnQgeyBnZXRDaGF0RXJyb3JEZXRhaWxzRnJvbU1ldGEsIElDaGF0RXJyb3JDb250ZXh0IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRFcnJvck1lc3NhZ2VzLmpzJztcbmltcG9ydCB7IEFHRU5UX0hPU1RfU0NIRU1FLCB0b0FnZW50SG9zdFVyaSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vYWdlbnRIb3N0VXJpLmpzJztcbmltcG9ydCB7IEFnZW50SG9zdEVsZW1lbnRBdHRhY2htZW50RGlzcGxheUtpbmQsIGdldEVsZW1lbnRBdHRhY2htZW50Q29ycmVsYXRpb25JZCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudEVsZW1lbnRBdHRhY2htZW50cy5qcyc7XG5pbXBvcnQgeyBBZ2VudEhvc3RBdXRvUmVwbHlBbnN3ZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNjaGVtYS5qcyc7XG5pbXBvcnQgeyBnZXRBZ2VudEZlZWRiYWNrQXR0YWNobWVudE1ldGFkYXRhLCBpc0FnZW50RmVlZGJhY2tBbm5vdGF0aW9uc0F0dGFjaG1lbnQsIGlzQWdlbnRGZWVkYmFja0F0dGFjaG1lbnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IGdldEJyb3dzZXJWaWV3QXR0YWNobWVudE1ldGFkYXRhLCBpc0Jyb3dzZXJWaWV3QXR0YWNobWVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9icm93c2VyVmlld0F0dGFjaG1lbnRzLmpzJztcbmltcG9ydCB7IHJlYWRBZ2VudE1lc3NhZ2VEZWxlZ2F0aW9uTWV0YSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vbWV0YS9hZ2VudE1lc3NhZ2VEZWxlZ2F0aW9uTWV0YS5qcyc7XG5pbXBvcnQgeyBBZ2VudFN5c3RlbU5vdGlmaWNhdGlvbktpbmQsIEFnZW50U3lzdGVtTm90aWZpY2F0aW9uU2V2ZXJpdHksIHJlYWRBZ2VudFN5c3RlbU5vdGlmaWNhdGlvbk1ldGEgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25NZXRhLmpzJztcbmltcG9ydCB7IGlzVmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2wsIGlzQWRkQ29tbWVudFRvb2wgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL21ldGEvYWdlbnRGZWVkYmFja0Fubm90YXRpb25zLmpzJztcbmltcG9ydCB7IGlzQ3JlYXRlQ2hhdFRvb2wsIGlzQ3JlYXRlU2Vzc2lvblRvb2wsIGlzU2VuZE1lc3NhZ2VUb29sLCBwYXJzZU9wZW5TZXNzaW9uTGlua0NoYXRJZCwgcGFyc2VPcGVuU2Vzc2lvbkxpbmtVcmkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL29wZW5TZXNzaW9uTGluay5qcyc7XG5pbXBvcnQgeyBwYXJzZVBhcnRpYWxUb29sSW5wdXRGb3JEaXNwbGF5IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9wYXJ0aWFsVG9vbElucHV0LmpzJztcbmltcG9ydCB7IE1lc3NhZ2VBdHRhY2htZW50S2luZCwgdHlwZSBGaWxlRWRpdCwgdHlwZSBNZXNzYWdlQXR0YWNobWVudCwgdHlwZSBTdHJpbmdPck1hcmtkb3duLCB0eXBlIFRleHRSYW5nZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FnZW50SG9zdC9jb21tb24vc3RhdGUvcHJvdG9jb2wvc3RhdGUuanMnO1xuaW1wb3J0IHsgbm9ybWFsaXplRmlsZUVkaXQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2ZpbGVFZGl0RGlmZi5qcyc7XG5pbXBvcnQgeyBBZ2VudFNlc3Npb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50U2VydmljZS5qcyc7XG5pbXBvcnQgcHJvZHVjdCBmcm9tICcuLi8uLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9wcm9kdWN0L2NvbW1vbi9wcm9kdWN0LmpzJztcbmltcG9ydCB7IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sUmVmZXJlbmNlTmFtZSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9hdXRvbWF0aW9ucy9hdXRvbWF0aW9uU2VydmljZS5qcyc7XG5pbXBvcnQgeyBmb3JtYXRDb3BpbG90Q3JlZGl0cywgRWxpY2l0YXRpb25TdGF0ZSwgdHlwZSBDaGF0RXh0ZXJuYWxFZGl0S2luZCwgdHlwZSBDaGF0TWNwQXBwRGF0YSwgdHlwZSBJQ2hhdEFnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb25EYXRhLCB0eXBlIElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhLCB0eXBlIElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydCwgdHlwZSBJQ2hhdEV4dGVybmFsRWRpdCwgdHlwZSBJQ2hhdEdlbmVyYXRlZEltYWdlRGF0YSwgdHlwZSBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXIsIHR5cGUgSUNoYXRNb2RpZmllZEZpbGVzQ29uZmlybWF0aW9uRGF0YSwgdHlwZSBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIHR5cGUgSUNoYXRQcm9ncmVzcywgdHlwZSBJQ2hhdFF1ZXN0aW9uLCB0eXBlIElDaGF0UXVlc3Rpb25BbnN3ZXJWYWx1ZSwgdHlwZSBJQ2hhdFF1ZXN0aW9uQW5zd2VycywgdHlwZSBJQ2hhdFJlc3BvbnNlRXJyb3JEZXRhaWxzLCB0eXBlIElDaGF0U2VhcmNoVG9vbEludm9jYXRpb25EYXRhLCB0eXBlIElDaGF0U2Vzc2lvbkNyZWF0ZWREYXRhLCB0eXBlIElDaGF0VGVybWluYWxUb29sSW52b2NhdGlvbkRhdGEsIHR5cGUgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSwgdHlwZSBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgdHlwZSBJQ2hhdFVzYWdlLCB0eXBlIElDaGF0VXNhZ2VQcm9tcHRUb2tlbkRldGFpbCwgVG9vbENvbmZpcm1LaW5kLCBBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXJ2aWNlL2NoYXRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IGlzVGVybWluYWxDb21tYW5kUHJvbXB0LCB0eXBlIElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgdHlwZSBJUXVvdGFTbmFwc2hvdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3NlcnZpY2VzL2NoYXQvY29tbW9uL2NoYXRFbnRpdGxlbWVudFNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL21vZGVsL2NoYXRQcm9ncmVzc1R5cGVzL2NoYXRUb29sSW52b2NhdGlvbi5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld0RhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFBsYW5SZXZpZXdEYXRhLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgdHlwZSBJQ2hhdFJlcXVlc3RWYXJpYWJsZURhdGEgfSBmcm9tICcuLi8uLi8uLi9jb21tb24vbW9kZWwvY2hhdE1vZGVsLmpzJztcbmltcG9ydCB7IENoYXRSZXF1ZXN0T3JpZ2luS2luZCwgdHlwZSBJQ2hhdFJlcXVlc3RPcmlnaW4gfSBmcm9tICcuLi8uLi8uLi9jb21tb24vY2hhdFJlcXVlc3RPcmlnaW4uanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0Q29tcGxldGlvblJlZmVyZW5jZUtpbmQsIHJlc3RvcmVDaGF0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5LCByZXN0b3JlUGFzdGVWYXJpYWJsZUVudHJ5RnJvbUF0dGFjaG1lbnQsIHRvQWdlbnRIb3N0Q29tcGxldGlvblZhcmlhYmxlRW50cnlGcm9tTWV0YWRhdGEsIHR5cGUgSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5LCB0eXBlIElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnksIHR5cGUgSUVsZW1lbnRWYXJpYWJsZUVudHJ5IH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL2F0dGFjaG1lbnRzL2NoYXRWYXJpYWJsZUVudHJpZXMuanMnO1xuaW1wb3J0IHsgdHlwZSBJVG9vbENvbmZpcm1hdGlvbk1lc3NhZ2VzLCB0eXBlIElUb29sRGF0YSwgdHlwZSBJUHJlcGFyZWRUb29sSW52b2NhdGlvbiwgdHlwZSBJVG9vbFJlc3VsdCwgdHlwZSBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscywgVG9vbERhdGFTb3VyY2UsIFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uIH0gZnJvbSAnLi4vLi4vLi4vY29tbW9uL3Rvb2xzL2xhbmd1YWdlTW9kZWxUb29sc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgTUNQIH0gZnJvbSAnLi4vLi4vLi4vLi4vbWNwL2NvbW1vbi9tb2RlbENvbnRleHRQcm90b2NvbC5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBoYXNLZXksIHR5cGUgTXV0YWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3R5cGVzLmpzJztcbmltcG9ydCB7IGxvY2FsaXplIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vbmxzLmpzJztcbmltcG9ydCB0eXBlIHsgSVJhbmdlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vLi4vZWRpdG9yL2NvbW1vbi9jb3JlL3JhbmdlLmpzJztcbmltcG9ydCB7IGlzU2Vzc2lvblJlZmVyZW5jZVRyYWplY3RvcnlBdHRhY2htZW50LCByZXN0b3JlU2Vzc2lvblJlZmVyZW5jZVZhcmlhYmxlRW50cnlGcm9tQXR0YWNobWVudCB9IGZyb20gJy4vYWdlbnRIb3N0U2Vzc2lvblJlZmVyZW5jZUF0dGFjaG1lbnQuanMnO1xuaW1wb3J0IHsgcmVzdG9yZUNoYXRSZWZlcmVuY2VWYXJpYWJsZUVudHJ5RnJvbUF0dGFjaG1lbnQgfSBmcm9tICcuL2FnZW50SG9zdENoYXRSZWZlcmVuY2VBdHRhY2htZW50LmpzJztcblxuZXhwb3J0IGNvbnN0IEJPT0xFQU5fVFJVRV9PUFRJT05fSUQgPSAndHJ1ZSc7XG5leHBvcnQgY29uc3QgQk9PTEVBTl9GQUxTRV9PUFRJT05fSUQgPSAnZmFsc2UnO1xuXG5jb25zdCBhZ2VudEhvc3RBc2tVc2VyVG9vbE5hbWVzID0gbmV3IFNldChbJ2Fza191c2VyJywgJ0Fza1VzZXJRdWVzdGlvbicsICdyZXF1ZXN0X3VzZXJfaW5wdXQnXSk7XG5jb25zdCBpbWFnZUdlbmVyYXRpb25Ub29sTmFtZSA9ICdpbWFnZV9nZW4uaW1hZ2VnZW4nO1xuXG5mdW5jdGlvbiBpc0FnZW50SG9zdEFza1VzZXJUb29sKHRvb2xOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcblx0cmV0dXJuIGFnZW50SG9zdEFza1VzZXJUb29sTmFtZXMuaGFzKHRvb2xOYW1lKTtcbn1cblxuZnVuY3Rpb24gc2hvdWxkSGlkZUNvbXBsZXRlZEFnZW50SG9zdEFza1VzZXJUb29sKHRvb2xDYWxsOiBUb29sQ2FsbFN0YXRlKTogYm9vbGVhbiB7XG5cdGlmICghaXNBZ2VudEhvc3RBc2tVc2VyVG9vbCh0b29sQ2FsbC50b29sTmFtZSkpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0cmV0dXJuIHRvb2xDYWxsLnN1Y2Nlc3M7XG5cdH1cblx0cmV0dXJuIHRvb2xDYWxsLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkICYmIHRvb2xDYWxsLnJlYXNvbiA9PT0gVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZDtcbn1cblxuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zIHtcblx0cmVhZG9ubHkgY3VycmVudENsaWVudElkOiBzdHJpbmc7XG5cdHJlYWRvbmx5IGNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGw6ICh0b29sQ2FsbDogVG9vbENhbGxTdGF0ZSkgPT4gdm9pZDtcbn1cblxuLyoqXG4gKiBDb25zdHJ1Y3RzIGEgdGVybWluYWwgdG9vbCBzZXNzaW9uIElEIGZyb20gYSB0ZXJtaW5hbCBVUkkgYW5kIGJhY2tlbmQgc2Vzc2lvbi5cbiAqIFRoZSBJRCBpcyBhIEpTT04gc3RyaW5nIGNvbnRhaW5pbmcgYm90aCBzbyBjb25zdW1lcnMgY2FuIHBhcnNlIG91dCBlaXRoZXIuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtYWtlQWhwVGVybWluYWxUb29sU2Vzc2lvbklkKHRlcm1pbmFsVXJpOiBzdHJpbmcsIHNlc3Npb246IFVSSSk6IHN0cmluZyB7XG5cdHJldHVybiBKU09OLnN0cmluZ2lmeSh7IHRlcm1pbmFsOiB0ZXJtaW5hbFVyaSwgc2Vzc2lvbjogc2Vzc2lvbi50b1N0cmluZygpIH0pO1xufVxuXG4vKipcbiAqIFBhcnNlcyBhIHRlcm1pbmFsIHRvb2wgc2Vzc2lvbiBJRCBiYWNrIGludG8gaXRzIHRlcm1pbmFsIGFuZCBzZXNzaW9uIFVSSXMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBwYXJzZUFocFRlcm1pbmFsVG9vbFNlc3Npb25JZChpZDogc3RyaW5nKTogeyB0ZXJtaW5hbDogc3RyaW5nOyBzZXNzaW9uOiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdHRyeSB7XG5cdFx0Y29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShpZCk7XG5cdFx0aWYgKHR5cGVvZiBwYXJzZWQ/LnRlcm1pbmFsID09PSAnc3RyaW5nJyAmJiB0eXBlb2YgcGFyc2VkPy5zZXNzaW9uID09PSAnc3RyaW5nJykge1xuXHRcdFx0cmV0dXJuIHBhcnNlZDtcblx0XHR9XG5cdH0gY2F0Y2ggeyAvKiBub3QgYW4gQUhQIHRlcm1pbmFsIHNlc3Npb24gSUQgKi8gfVxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBjb252ZXJ0UHJvdG9jb2xBbnN3ZXIoYW5zd2VyOiBDaGF0SW5wdXRBbnN3ZXIpOiBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUgfCB1bmRlZmluZWQge1xuXHRpZiAoYW5zd2VyLnN0YXRlICE9PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5TdWJtaXR0ZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHN3aXRjaCAoYW5zd2VyLnZhbHVlLmtpbmQpIHtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5UZXh0OlxuXHRcdFx0cmV0dXJuIGFuc3dlci52YWx1ZS52YWx1ZTtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5OdW1iZXI6XG5cdFx0Y2FzZSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuQm9vbGVhbjpcblx0XHRcdHJldHVybiBTdHJpbmcoYW5zd2VyLnZhbHVlLnZhbHVlKTtcblx0XHRjYXNlIENoYXRJbnB1dEFuc3dlclZhbHVlS2luZC5TZWxlY3RlZDpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlbGVjdGVkVmFsdWU6IGFuc3dlci52YWx1ZS52YWx1ZSxcblx0XHRcdFx0ZnJlZWZvcm1WYWx1ZTogYW5zd2VyLnZhbHVlLmZyZWVmb3JtVmFsdWVzPy5bMF0sXG5cdFx0XHR9O1xuXHRcdGNhc2UgQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkTWFueTpcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHNlbGVjdGVkVmFsdWVzOiBhbnN3ZXIudmFsdWUudmFsdWUsXG5cdFx0XHRcdGZyZWVmb3JtVmFsdWU6IGFuc3dlci52YWx1ZS5mcmVlZm9ybVZhbHVlcz8uWzBdLFxuXHRcdFx0fTtcblx0fVxufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFByb3RvY29sQW5zd2VycyhyYXc6IFJlY29yZDxzdHJpbmcsIENoYXRJbnB1dEFuc3dlcj4gfCB1bmRlZmluZWQpOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyB8IHVuZGVmaW5lZCB7XG5cdGlmICghcmF3KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBhbnN3ZXJzOiBJQ2hhdFF1ZXN0aW9uQW5zd2VycyA9IHt9O1xuXHRmb3IgKGNvbnN0IFtxdWVzdGlvbklkLCBhbnN3ZXJdIG9mIE9iamVjdC5lbnRyaWVzKHJhdykpIHtcblx0XHRjb25zdCBjb252ZXJ0ZWQgPSBjb252ZXJ0UHJvdG9jb2xBbnN3ZXIoYW5zd2VyKTtcblx0XHRpZiAoY29udmVydGVkICE9PSB1bmRlZmluZWQpIHtcblx0XHRcdGFuc3dlcnNbcXVlc3Rpb25JZF0gPSBjb252ZXJ0ZWQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiBPYmplY3Qua2V5cyhhbnN3ZXJzKS5sZW5ndGggPiAwID8gYW5zd2VycyA6IHVuZGVmaW5lZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNvbnRhaW5zQXV0b21hdGljUmVwbHlBbnN3ZXIocmF3OiBSZWNvcmQ8c3RyaW5nLCBDaGF0SW5wdXRBbnN3ZXI+IHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBPYmplY3QudmFsdWVzKHJhdyA/PyB7fSkuc29tZShhbnN3ZXIgPT5cblx0XHRhbnN3ZXIuc3RhdGUgPT09IENoYXRJbnB1dEFuc3dlclN0YXRlLlN1Ym1pdHRlZFxuXHRcdCYmIGFuc3dlci52YWx1ZS5raW5kID09PSBDaGF0SW5wdXRBbnN3ZXJWYWx1ZUtpbmQuVGV4dFxuXHRcdCYmIGFuc3dlci52YWx1ZS52YWx1ZSA9PT0gQWdlbnRIb3N0QXV0b1JlcGx5QW5zd2VyXG5cdCk7XG59XG5cbmZ1bmN0aW9uIGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldzogSUFnZW50SG9zdFBsYW5SZXZpZXcsIGFjdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQpIHtcblx0cmV0dXJuIGFjdGlvbklkID8gcGxhblJldmlldy5hY3Rpb25zLmZpbmQoYWN0aW9uID0+IGFjdGlvbi5pZCA9PT0gYWN0aW9uSWQpIDogdW5kZWZpbmVkO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldywgcmVzcG9uc2U6IENoYXRJbnB1dFJlc3BvbnNlS2luZCwgYW5zd2VyczogUmVjb3JkPHN0cmluZywgQ2hhdElucHV0QW5zd2VyPiB8IHVuZGVmaW5lZCk6IElDaGF0UGxhblJldmlld1Jlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGlmIChyZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkRlY2xpbmUpIHtcblx0XHRyZXR1cm4geyByZWplY3RlZDogdHJ1ZSB9O1xuXHR9XG5cdGlmIChyZXNwb25zZSAhPT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBhbnN3ZXIgPSBhbnN3ZXJzPy5bcGxhblJldmlldy5hbnN3ZXJRdWVzdGlvbklkXTtcblx0aWYgKCFhbnN3ZXIgfHwgYW5zd2VyLnN0YXRlID09PSBDaGF0SW5wdXRBbnN3ZXJTdGF0ZS5Ta2lwcGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHZhbHVlID0gYW5zd2VyLnZhbHVlO1xuXHRpZiAodmFsdWUua2luZCA9PT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlRleHQpIHtcblx0XHRjb25zdCBmZWVkYmFjayA9IHZhbHVlLnZhbHVlLnRyaW0oKTtcblx0XHRyZXR1cm4gZmVlZGJhY2sgPyB7IHJlamVjdGVkOiBmYWxzZSwgZmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogZmVlZGJhY2sgfSA6IHVuZGVmaW5lZDtcblx0fVxuXHRpZiAodmFsdWUua2luZCAhPT0gQ2hhdElucHV0QW5zd2VyVmFsdWVLaW5kLlNlbGVjdGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGFjdGlvbiA9IGdldFBsYW5SZXZpZXdBY3Rpb24ocGxhblJldmlldywgdmFsdWUudmFsdWUpO1xuXHRjb25zdCBmZWVkYmFjayA9IHZhbHVlLmZyZWVmb3JtVmFsdWVzPy5maW5kKHYgPT4gdi50cmltKCkubGVuZ3RoID4gMCk/LnRyaW0oKTtcblx0cmV0dXJuIHtcblx0XHRyZWplY3RlZDogZmFsc2UsXG5cdFx0YWN0aW9uOiBhY3Rpb24/LmxhYmVsID8/IHZhbHVlLnZhbHVlLFxuXHRcdGFjdGlvbklkOiBhY3Rpb24/LmlkID8/IHZhbHVlLnZhbHVlLFxuXHRcdC4uLihmZWVkYmFjayA/IHsgZmVlZGJhY2ssIGZlZWRiYWNrT3ZlcmFsbDogZmVlZGJhY2sgfSA6IHt9KSxcblx0fTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGNyZWF0ZUlucHV0UmVxdWVzdENhcm91c2VsKGlucHV0UmVxOiBDaGF0SW5wdXRSZXF1ZXN0LCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBDaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEge1xuXHRjb25zdCBxdWVzdGlvbnM6IElDaGF0UXVlc3Rpb25bXSA9IChpbnB1dFJlcS5xdWVzdGlvbnMgPz8gW10pLm1hcCgocXVlc3Rpb24pOiBJQ2hhdFF1ZXN0aW9uID0+IHtcblx0XHRsZXQgdGl0bGUgPSBxdWVzdGlvbi50aXRsZTtcblx0XHRsZXQgbWVzc2FnZSA9IHF1ZXN0aW9uLm1lc3NhZ2U7XG5cdFx0aWYgKCF0aXRsZSkge1xuXHRcdFx0Y29uc3QgZW5kT2ZMaW5lID0gcXVlc3Rpb24ubWVzc2FnZS5pbmRleE9mKCdcXG4nKTtcblx0XHRcdHRpdGxlID0gZW5kT2ZMaW5lID09PSAtMSA/IHF1ZXN0aW9uLm1lc3NhZ2UgOiBxdWVzdGlvbi5tZXNzYWdlLnN1YnN0cmluZygwLCBlbmRPZkxpbmUpLnRyaW0oKTtcblx0XHRcdG1lc3NhZ2UgPSBlbmRPZkxpbmUgPT09IC0xID8gJycgOiBxdWVzdGlvbi5tZXNzYWdlLnN1YnN0cmluZyhlbmRPZkxpbmUgKyAxKS50cmltKCk7XG5cdFx0fVxuXHRcdGNvbnN0IGRldGFpbGVkTWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZyhtZXNzYWdlLCB7IGlzVHJ1c3RlZDogZmFsc2UgfSk7XG5cblx0XHRzd2l0Y2ggKHF1ZXN0aW9uLmtpbmQpIHtcblx0XHRcdGNhc2UgQ2hhdElucHV0UXVlc3Rpb25LaW5kLlNpbmdsZVNlbGVjdDpcblx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRpZDogcXVlc3Rpb24uaWQsXG5cdFx0XHRcdFx0dHlwZTogJ3NpbmdsZVNlbGVjdCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGV0YWlsZWRNZXNzYWdlLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBxdWVzdGlvbi5yZXF1aXJlZCxcblx0XHRcdFx0XHRhbGxvd0ZyZWVmb3JtSW5wdXQ6IHF1ZXN0aW9uLmFsbG93RnJlZWZvcm1JbnB1dCA/PyB0cnVlLFxuXHRcdFx0XHRcdG9wdGlvbnM6IHF1ZXN0aW9uLm9wdGlvbnMubWFwKG9wdGlvbiA9PiAoeyBpZDogb3B0aW9uLmlkLCBsYWJlbDogb3B0aW9uLmxhYmVsLCB2YWx1ZTogb3B0aW9uLmlkIH0pKSxcblx0XHRcdFx0fTtcblx0XHRcdGNhc2UgQ2hhdElucHV0UXVlc3Rpb25LaW5kLk11bHRpU2VsZWN0OlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAnbXVsdGlTZWxlY3QnLFxuXHRcdFx0XHRcdHRpdGxlLFxuXHRcdFx0XHRcdGRldGFpbGVkTWVzc2FnZSxcblx0XHRcdFx0XHRyZXF1aXJlZDogcXVlc3Rpb24ucmVxdWlyZWQsXG5cdFx0XHRcdFx0YWxsb3dGcmVlZm9ybUlucHV0OiBxdWVzdGlvbi5hbGxvd0ZyZWVmb3JtSW5wdXQgPz8gdHJ1ZSxcblx0XHRcdFx0XHRvcHRpb25zOiBxdWVzdGlvbi5vcHRpb25zLm1hcChvcHRpb24gPT4gKHsgaWQ6IG9wdGlvbi5pZCwgbGFiZWw6IG9wdGlvbi5sYWJlbCwgdmFsdWU6IG9wdGlvbi5pZCB9KSksXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5Cb29sZWFuOlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAnc2luZ2xlU2VsZWN0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2UsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHF1ZXN0aW9uLnJlcXVpcmVkLFxuXHRcdFx0XHRcdGFsbG93RnJlZWZvcm1JbnB1dDogZmFsc2UsXG5cdFx0XHRcdFx0ZGVmYXVsdFZhbHVlOiBxdWVzdGlvbi5kZWZhdWx0VmFsdWUgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IFN0cmluZyhxdWVzdGlvbi5kZWZhdWx0VmFsdWUpLFxuXHRcdFx0XHRcdG9wdGlvbnM6IFtcblx0XHRcdFx0XHRcdHsgaWQ6IEJPT0xFQU5fVFJVRV9PUFRJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5pbnB1dFJlcXVlc3QuYm9vbGVhbi50cnVlJywgXCJUcnVlXCIpLCB2YWx1ZTogQk9PTEVBTl9UUlVFX09QVElPTl9JRCB9LFxuXHRcdFx0XHRcdFx0eyBpZDogQk9PTEVBTl9GQUxTRV9PUFRJT05fSUQsIGxhYmVsOiBsb2NhbGl6ZSgnY2hhdC5pbnB1dFJlcXVlc3QuYm9vbGVhbi5mYWxzZScsIFwiRmFsc2VcIiksIHZhbHVlOiBCT09MRUFOX0ZBTFNFX09QVElPTl9JRCB9LFxuXHRcdFx0XHRcdF0sXG5cdFx0XHRcdH07XG5cdFx0XHRjYXNlIENoYXRJbnB1dFF1ZXN0aW9uS2luZC5UZXh0OlxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGlkOiBxdWVzdGlvbi5pZCxcblx0XHRcdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHRcdFx0dGl0bGUsXG5cdFx0XHRcdFx0ZGV0YWlsZWRNZXNzYWdlLFxuXHRcdFx0XHRcdHJlcXVpcmVkOiBxdWVzdGlvbi5yZXF1aXJlZCxcblx0XHRcdFx0XHRkZWZhdWx0VmFsdWU6IHF1ZXN0aW9uLmRlZmF1bHRWYWx1ZSxcblx0XHRcdFx0fTtcblx0XHRcdGRlZmF1bHQ6XG5cdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0aWQ6IHF1ZXN0aW9uLmlkLFxuXHRcdFx0XHRcdHR5cGU6ICd0ZXh0Jyxcblx0XHRcdFx0XHR0aXRsZSxcblx0XHRcdFx0XHRkZXRhaWxlZE1lc3NhZ2UsXG5cdFx0XHRcdFx0cmVxdWlyZWQ6IHF1ZXN0aW9uLnJlcXVpcmVkLFxuXHRcdFx0XHR9O1xuXHRcdH1cblx0fSk7XG5cblx0aWYgKHF1ZXN0aW9ucy5sZW5ndGggPT09IDApIHtcblx0XHRxdWVzdGlvbnMucHVzaCh7XG5cdFx0XHRpZDogJ2Fuc3dlcicsXG5cdFx0XHR0eXBlOiAndGV4dCcsXG5cdFx0XHR0aXRsZTogaW5wdXRSZXEubWVzc2FnZSA/PyAnJyxcblx0XHRcdHJlcXVpcmVkOiB0cnVlLFxuXHRcdH0pO1xuXHR9XG5cblx0Y29uc3QgY2Fyb3VzZWwgPSBuZXcgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKFxuXHRcdHF1ZXN0aW9ucyxcblx0XHR0cnVlLFxuXHRcdGlucHV0UmVxLmlkLFxuXHRcdHVuZGVmaW5lZCxcblx0XHR1bmRlZmluZWQsXG5cdFx0aW5wdXRSZXEubWVzc2FnZSA/IHJhd01hcmtkb3duVG9TdHJpbmcoaW5wdXRSZXEubWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdCk7XG5cdGNhcm91c2VsLmFuc3dlclByZXNlbnRhdGlvbiA9ICdjb252ZXJzYXRpb24nO1xuXHRyZXR1cm4gY2Fyb3VzZWw7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBjcmVhdGVJbnB1dFJlcXVlc3RQbGFuUmV2aWV3KGlucHV0UmVxOiBDaGF0SW5wdXRSZXF1ZXN0LCBwbGFuUmV2aWV3OiBJQWdlbnRIb3N0UGxhblJldmlldyk6IENoYXRQbGFuUmV2aWV3RGF0YSB7XG5cdHJldHVybiBuZXcgQ2hhdFBsYW5SZXZpZXdEYXRhKFxuXHRcdHBsYW5SZXZpZXcudGl0bGUsXG5cdFx0cGxhblJldmlldy5jb250ZW50LFxuXHRcdHBsYW5SZXZpZXcuYWN0aW9ucy5tYXAoYWN0aW9uID0+ICh7XG5cdFx0XHRpZDogYWN0aW9uLmlkLFxuXHRcdFx0bGFiZWw6IGFjdGlvbi5sYWJlbCxcblx0XHRcdC4uLihhY3Rpb24uZGVzY3JpcHRpb24gPyB7IGRlc2NyaXB0aW9uOiBhY3Rpb24uZGVzY3JpcHRpb24gfSA6IHt9KSxcblx0XHRcdC4uLihhY3Rpb24uZGVmYXVsdCA/IHsgZGVmYXVsdDogdHJ1ZSB9IDoge30pLFxuXHRcdFx0Li4uKGFjdGlvbi5wZXJtaXNzaW9uTGV2ZWwgPyB7IHBlcm1pc3Npb25MZXZlbDogYWN0aW9uLnBlcm1pc3Npb25MZXZlbCB9IDoge30pLFxuXHRcdH0pKSxcblx0XHRwbGFuUmV2aWV3LmNhblByb3ZpZGVGZWVkYmFjayxcblx0XHRwbGFuUmV2aWV3LnBsYW5VcmkgPyBVUkkucGFyc2UocGxhblJldmlldy5wbGFuVXJpKS50b0pTT04oKSA6IHVuZGVmaW5lZCxcblx0XHRpbnB1dFJlcS5pZCxcblx0KTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcTogQ2hhdElucHV0UmVxdWVzdCwgdXJsOiBzdHJpbmcpOiB7IGF1dGhvcml0eTogc3RyaW5nOyBtZXNzYWdlOiBNYXJrZG93blN0cmluZyB9IHtcblx0bGV0IGF1dGhvcml0eSA9IHVybDtcblx0dHJ5IHtcblx0XHRhdXRob3JpdHkgPSBVUkkucGFyc2UodXJsKS5hdXRob3JpdHkgfHwgdXJsO1xuXHR9IGNhdGNoIHtcblx0XHQvLyBGYWxsIGJhY2sgdG8gdGhlIHJhdyBVUkwgc3RyaW5nLlxuXHR9XG5cblx0Y29uc3QgbWVzc2FnZSA9IG5ldyBNYXJrZG93blN0cmluZygpO1xuXHRpZiAoaW5wdXRSZXEubWVzc2FnZSkge1xuXHRcdG1lc3NhZ2UuYXBwZW5kVGV4dChpbnB1dFJlcS5tZXNzYWdlKTtcblx0XHRtZXNzYWdlLmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0fVxuXHRtZXNzYWdlLmFwcGVuZE1hcmtkb3duKGxvY2FsaXplKCdhZ2VudEhvc3QuZWxpY2l0LnVybC5pbnN0cnVjdGlvbicsIFwiT3BlbiB0aGlzIFVSTD9cIikpO1xuXHRtZXNzYWdlLmFwcGVuZENvZGVibG9jaygnJywgdXJsKTtcblx0cmV0dXJuIHsgYXV0aG9yaXR5LCBtZXNzYWdlIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBpbnB1dFJlcXVlc3RSZXNwb25zZVBhcnRUb1Byb2dyZXNzKHBhcnQ6IElucHV0UmVxdWVzdFJlc3BvbnNlUGFydCwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRQcm9ncmVzcyB7XG5cdGNvbnN0IGlucHV0UmVxID0gcGFydC5yZXF1ZXN0O1xuXHRjb25zdCBwbGFuUmV2aWV3ID0gKGlucHV0UmVxIGFzIENoYXRJbnB1dFJlcXVlc3RXaXRoUGxhblJldmlldykucGxhblJldmlldztcblx0aWYgKHBsYW5SZXZpZXcpIHtcblx0XHRjb25zdCByZXZpZXcgPSBjcmVhdGVJbnB1dFJlcXVlc3RQbGFuUmV2aWV3KGlucHV0UmVxLCBwbGFuUmV2aWV3KTtcblx0XHRyZXZpZXcuZGF0YSA9IHBhcnQucmVzcG9uc2UgPT09IHVuZGVmaW5lZFxuXHRcdFx0PyB1bmRlZmluZWRcblx0XHRcdDogY29udmVydFByb3RvY29sUGxhblJldmlld1Jlc3VsdChwbGFuUmV2aWV3LCBwYXJ0LnJlc3BvbnNlLCBpbnB1dFJlcS5hbnN3ZXJzKTtcblx0XHRyZXZpZXcuaXNVc2VkID0gdHJ1ZTtcblx0XHRyZXR1cm4gcmV2aWV3O1xuXHR9XG5cblx0aWYgKGlucHV0UmVxLnVybCkge1xuXHRcdGNvbnN0IHByZXNlbnRhdGlvbiA9IGdldFVybElucHV0UmVxdWVzdFByZXNlbnRhdGlvbihpbnB1dFJlcSwgaW5wdXRSZXEudXJsKTtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2VsaWNpdGF0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0aXRsZTogbG9jYWxpemUoJ2FnZW50SG9zdC5lbGljaXQudXJsLnRpdGxlJywgXCJBdXRob3JpemF0aW9uIFJlcXVpcmVkXCIpLFxuXHRcdFx0bWVzc2FnZTogcHJlc2VudGF0aW9uLm1lc3NhZ2UsXG5cdFx0XHRzdWJ0aXRsZTogJycsXG5cdFx0XHRzb3VyY2U6IHVuZGVmaW5lZCxcblx0XHRcdHN0YXRlOiBwYXJ0LnJlc3BvbnNlID09PSBDaGF0SW5wdXRSZXNwb25zZUtpbmQuQWNjZXB0ID8gRWxpY2l0YXRpb25TdGF0ZS5BY2NlcHRlZCA6IEVsaWNpdGF0aW9uU3RhdGUuUmVqZWN0ZWQsXG5cdFx0XHRpc0hpZGRlbjogZmFsc2UsXG5cdFx0fTtcblx0fVxuXG5cdGNvbnN0IGNhcm91c2VsID0gY3JlYXRlSW5wdXRSZXF1ZXN0Q2Fyb3VzZWwoaW5wdXRSZXEsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRjb25zdCBhbnN3ZXJzID0gcGFydC5yZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdFxuXHRcdD8gY29udmVydFByb3RvY29sQW5zd2VycyhpbnB1dFJlcS5hbnN3ZXJzKVxuXHRcdDogdW5kZWZpbmVkO1xuXHRjYXJvdXNlbC5kYXRhID0gYW5zd2VycyA/PyB7fTtcblx0Y2Fyb3VzZWwuaXNVc2VkID0gdHJ1ZTtcblx0Y2Fyb3VzZWwuYXV0b1JlcGx5ID0gY29udGFpbnNBdXRvbWF0aWNSZXBseUFuc3dlcihpbnB1dFJlcS5hbnN3ZXJzKTtcblx0Y2Fyb3VzZWwuYW5zd2VyZWRFeHRlcm5hbGx5ID0gcGFydC5yZXNwb25zZSA9PT0gQ2hhdElucHV0UmVzcG9uc2VLaW5kLkFjY2VwdCAmJiAoY2Fyb3VzZWwuYXV0b1JlcGx5IHx8ICFhbnN3ZXJzKTtcblx0cmV0dXJuIGNhcm91c2VsO1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSB0YXNrIGRlc2NyaXB0aW9uIGZyb20gYF9tZXRhLnN1YmFnZW50RGVzY3JpcHRpb25gLCB3aGljaCBpc1xuICogcG9wdWxhdGVkIGZyb20gdGhlIHRvb2wncyBhcmd1bWVudHMgYXQgYHRvb2xfc3RhcnRgIHRpbWUgYnkgdGhlIGV2ZW50XG4gKiBtYXBwZXIuIFRoaXMgaXMgdGhlIHNob3J0IHRhc2sgZGVzY3JpcHRpb24gKGUuZy4sIFwiRmluZCByZWxhdGVkIGZpbGVzXCIpLFxuICogTk9UIHRoZSBhZ2VudCdzIG93biBkZXNjcmlwdGlvbi5cbiAqL1xuZnVuY3Rpb24gZ2V0U3ViYWdlbnRUYXNrRGVzY3JpcHRpb24odGM6IFRvb2xDYWxsU3RhdGUpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRjb25zdCB2ID0gcmVhZFRvb2xDYWxsTWV0YSh0Yykuc3ViYWdlbnREZXNjcmlwdGlvbjtcblx0cmV0dXJuIHYgJiYgdi5sZW5ndGggPiAwID8gdiA6IHVuZGVmaW5lZDtcbn1cblxuLyoqXG4gKiBFeHRyYWN0cyB0aGUgYWdlbnQgbmFtZSBmcm9tIGBfbWV0YS5zdWJhZ2VudEFnZW50TmFtZWAuXG4gKi9cbmZ1bmN0aW9uIGdldFN1YmFnZW50QWdlbnROYW1lKHRjOiBUb29sQ2FsbFN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdiA9IHJlYWRUb29sQ2FsbE1ldGEodGMpLnN1YmFnZW50QWdlbnROYW1lO1xuXHRyZXR1cm4gdiAmJiB2Lmxlbmd0aCA+IDAgPyB2IDogdW5kZWZpbmVkO1xufVxuXG4vKiogVGhlIHN1YmFnZW50IGNoYXQgcmVzb3VyY2UgZm9yIGEgc3ViYWdlbnQtc3Bhd25pbmcgdG9vbCBjYWxsOiBwcmVmZXIgdGhlIGhvc3Qtc3RhbXBlZCBgX21ldGEuc3ViYWdlbnRDaGF0VXJpYCwgdGhlbiBhIGRpc2NvdmVyeSBibG9jaywgdGhlbiBhIGRlcml2ZWQgZmFsbGJhY2suICovXG5mdW5jdGlvbiBnZXRTdWJhZ2VudENoYXRSZXNvdXJjZSh0YzogVG9vbENhbGxTdGF0ZSwgc3ViYWdlbnRDb250ZW50OiBUb29sUmVzdWx0U3ViYWdlbnRDb250ZW50IHwgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2U6IFVSSSk6IHN0cmluZyB7XG5cdHJldHVybiByZWFkVG9vbENhbGxNZXRhKHRjKS5zdWJhZ2VudENoYXRVcmkgPz8gc3ViYWdlbnRDb250ZW50Py5yZXNvdXJjZSA/PyBidWlsZFN1YmFnZW50Q2hhdFVyaShzZXNzaW9uUmVzb3VyY2UudG9TdHJpbmcoKSwgdGMudG9vbENhbGxJZCk7XG59XG5cbi8qKlxuICogUmV0dXJucyBNQ1AgQXBwIHJlbmRlciBkYXRhIGZvciBhIHRvb2wgY2FsbCB3aGVuIGl0IGlzIGFuIE1DUCBjYWxsXG4gKiB3aXRoIGFuIGBfbWV0YS51aS5yZXNvdXJjZVVyaWAgYW5kIGEga25vd24gQUhQIGBtY3A6Ly9gIGBjaGFubmVsYC5cbiAqIFVzZWQgYnkgYm90aCBsaXZlIGFuZCBzZXJpYWxpemVkIGFkYXB0ZXJzIHRvIHBvcHVsYXRlXG4gKiBgSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YS5tY3BBcHBEYXRhYCBzbyB0aGUgY2hhdCByZW5kZXJlciBtb3VudHNcbiAqIGEgYENoYXRNY3BBcHBTdWJQYXJ0YCBvdmVyIHRoZSB0b29sLlxuICpcbiAqIFRvb2wgY2FsbHMgcHJvZHVjZWQgYnkgYW4gYWdlbnQgaG9zdCBhbHdheXMgcm91dGUgdGhyb3VnaCB0aGUgQUhQXG4gKiBgbWNwOi8vYCBzaWRlIGNoYW5uZWwgKGFuZCBuZXZlciB0aHJvdWdoIHtAbGluayBJTWNwU2VydmljZX0pLCBzb1xuICogdGhlIHJldHVybmVkIGRhdGEgaXMgYWx3YXlzIGBraW5kOiAnYWdlbnRIb3N0J2AuIFRoZSBjdXN0b21pemF0aW9uXG4gKiBpZCBkb3VibGVzIGFzIGEgc3RhYmxlIHBlci1zZXNzaW9uIGBzZXJ2ZXJJZGAgZm9yIHdlYnZpZXcgb3JpZ2luXG4gKiBzY29waW5nIFx1MjAxNCB0d28gc2Vzc2lvbnMgZXhwb3NpbmcgdGhlIHNhbWUgdXBzdHJlYW0gTUNQIHNlcnZlciB0aGVyZWZvcmVcbiAqIGdldCBkaXN0aW5jdCB3ZWJ2aWV3IG9yaWdpbnMgKGFzc3VtaW5nIGRpc3RpbmN0IGN1c3RvbWl6YXRpb24gaWRzKS5cbiAqL1xuZnVuY3Rpb24gZ2V0TWNwQXBwRGF0YSh0YzogVG9vbENhbGxTdGF0ZSwgX3Nlc3Npb25SZXNvdXJjZTogVVJJKTogQ2hhdE1jcEFwcERhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuY29udHJpYnV0b3I/LmtpbmQgIT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLk1DUCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdWkgPSByZWFkVG9vbENhbGxNZXRhKHRjKS51aTtcblx0aWYgKCF1aSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcmVzb3VyY2VVcmkgPSB1aS5yZXNvdXJjZVVyaTtcblx0Y29uc3QgY2hhbm5lbFZhbHVlID0gdWkuY2hhbm5lbDtcblx0aWYgKGNoYW5uZWxWYWx1ZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0Ly8gTm8gY2hhbm5lbCB5ZXQgXHUyMDE0IHRoZSBBcHAncyBzdWItUlBDcyB3b3VsZCBoYXZlIG5vd2hlcmUgdG8gZ28uXG5cdFx0Ly8gU2tpcCBtb3VudGluZyB1bnRpbCB0aGUgY3VzdG9taXphdGlvbiByZWFjaGVzIFJlYWR5IGFuZCB0aGVcblx0XHQvLyBwcm9kdWNlciByZS1lbWl0cyB3aXRoIHRoZSBjaGFubmVsIHBvcHVsYXRlZC5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2FnZW50SG9zdCcsXG5cdFx0cmVzb3VyY2VVcmksXG5cdFx0c2VydmVySWQ6IHRjLmNvbnRyaWJ1dG9yLmN1c3RvbWl6YXRpb25JZCxcblx0XHRjaGFubmVsOiBjaGFubmVsVmFsdWUsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xSYXdJbnB1dCh0YzogVG9vbENhbGxTdGF0ZSk6IHVua25vd24ge1xuXHRjb25zdCB0b29sSW5wdXQgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyA/IHVuZGVmaW5lZCA6IGdldElubGluZVRvb2xJbnB1dCh0Yy50b29sSW5wdXQpO1xuXHR0cnkge1xuXHRcdHJldHVybiB0b29sSW5wdXQgPyBKU09OLnBhcnNlKHRvb2xJbnB1dCkgOiB7fTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHsgaW5wdXQ6IHRvb2xJbnB1dCB9O1xuXHR9XG59XG5cbmZ1bmN0aW9uIGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0YzogVG9vbENhbGxTdGF0ZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGV4aXN0aW5nUmF3SW5wdXQ/OiB1bmtub3duKTogSUNoYXRUb29sSW5wdXRJbnZvY2F0aW9uRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1jcEFwcERhdGEgPSBnZXRNY3BBcHBEYXRhKHRjLCBzZXNzaW9uUmVzb3VyY2UpO1xuXHRpZiAoIW1jcEFwcERhdGEpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2lucHV0Jyxcblx0XHRyYXdJbnB1dDogZXhpc3RpbmdSYXdJbnB1dCA/PyBnZXRUb29sUmF3SW5wdXQodGMpLFxuXHRcdG1jcEFwcERhdGEsXG5cdH07XG59XG5cbmZ1bmN0aW9uIGlzU2FtZU1jcEFwcERhdGEoYTogQ2hhdE1jcEFwcERhdGEgfCB1bmRlZmluZWQsIGI6IENoYXRNY3BBcHBEYXRhIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdGlmIChhPy5raW5kICE9PSBiPy5raW5kIHx8IGE/LnJlc291cmNlVXJpICE9PSBiPy5yZXNvdXJjZVVyaSkge1xuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXHRpZiAoYT8ua2luZCA9PT0gJ2FnZW50SG9zdCcgJiYgYj8ua2luZCA9PT0gJ2FnZW50SG9zdCcpIHtcblx0XHRyZXR1cm4gYS5zZXJ2ZXJJZCA9PT0gYi5zZXJ2ZXJJZCAmJiBhLmNoYW5uZWwgPT09IGIuY2hhbm5lbDtcblx0fVxuXHRpZiAoYT8ua2luZCA9PT0gJ2xvY2FsJyAmJiBiPy5raW5kID09PSAnbG9jYWwnKSB7XG5cdFx0cmV0dXJuIGEuc2VydmVyRGVmaW5pdGlvbklkID09PSBiLnNlcnZlckRlZmluaXRpb25JZCAmJiBhLmNvbGxlY3Rpb25JZCA9PT0gYi5jb2xsZWN0aW9uSWQ7XG5cdH1cblx0cmV0dXJuIGEgPT09IGI7XG59XG5cbi8qKlxuICogS25vd24gdG9vbCBuYW1lcyB0aGF0IHNwYXduIHN1YmFnZW50IHNlc3Npb25zLiBVc2VkIGFzIGEgY2xpZW50LXNpZGVcbiAqIGZhbGxiYWNrIHdoZW4gdGhlIHNlcnZlciBoYXNuJ3Qgc2V0IGBfbWV0YS50b29sS2luZGAgKGUuZy4gc2Vzc2lvbnNcbiAqIHJlc3RvcmVkIGJ5IGFuIG9sZGVyIHNlcnZlciB2ZXJzaW9uIHRoYXQgZGlkbid0IGNhcnJ5IGBfbWV0YWApLlxuICovXG5jb25zdCBTVUJBR0VOVF9UT09MX05BTUVTOiBSZWFkb25seVNldDxzdHJpbmc+ID0gbmV3IFNldChbJ3Rhc2snXSk7XG5cbmV4cG9ydCBmdW5jdGlvbiBpc1N1YmFnZW50VG9vbE5hbWUodG9vbE5hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gU1VCQUdFTlRfVE9PTF9OQU1FUy5oYXModG9vbE5hbWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChjb250ZW50OiBTdHJpbmdPck1hcmtkb3duIHwgdW5kZWZpbmVkLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIF9tZXRhPzogUmVjb3JkPHN0cmluZywgdW5rbm93bj4pOiBJQ2hhdFByb2dyZXNzIHwgdW5kZWZpbmVkIHtcblx0aWYgKCFjb250ZW50KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCB2YWx1ZSA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyhjb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0Y29uc3QgbWFya2Rvd24gPSB0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnID8gbmV3IE1hcmtkb3duU3RyaW5nKHZhbHVlKSA6IHZhbHVlO1xuXHRjb25zdCBtZXRhID0gcmVhZEFnZW50U3lzdGVtTm90aWZpY2F0aW9uTWV0YSh7IF9tZXRhIH0pO1xuXHRyZXR1cm4gbWV0YS5raW5kID09PSBBZ2VudFN5c3RlbU5vdGlmaWNhdGlvbktpbmQuV29ya3RyZWVDcmVhdGlvbkZhaWx1cmUgJiYgbWV0YS5zZXZlcml0eSA9PT0gQWdlbnRTeXN0ZW1Ob3RpZmljYXRpb25TZXZlcml0eS5XYXJuaW5nXG5cdFx0PyB7IGtpbmQ6ICd3YXJuaW5nJywgY29udGVudDogbWFya2Rvd24gfVxuXHRcdDogeyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogbWFya2Rvd24gfTtcbn1cblxuLyoqXG4gKiBSZXR1cm5zIHRydWUgaWYgdGhpcyB0b29sIGNhbGwgc3Bhd25zIGEgc3ViYWdlbnQgc2Vzc2lvbiwgZWl0aGVyIGJlY2F1c2VcbiAqIHRoZSBzZXJ2ZXIgcmVwb3J0ZWQgYF9tZXRhLnRvb2xLaW5kID09PSAnc3ViYWdlbnQnYCBvciBiZWNhdXNlIHRoZSB0b29sXG4gKiBuYW1lIGlzIGluIHRoZSBrbm93biBmYWxsYmFjayBzZXQgKG9sZGVyIHNuYXBzaG90cyB3aXRob3V0IGBfbWV0YWApLlxuICovXG5leHBvcnQgZnVuY3Rpb24gaXNTdWJhZ2VudFRvb2wodGM6IFRvb2xDYWxsU3RhdGUpOiBib29sZWFuIHtcblx0cmV0dXJuIGdldFRvb2xLaW5kKHRjKSA9PT0gJ3N1YmFnZW50JyB8fCBpc1N1YmFnZW50VG9vbE5hbWUodGMudG9vbE5hbWUpO1xufVxuXG4vKiogUmV0dXJucyB3aGV0aGVyIHRoZSB0b29sIGNhbGwgY2FuIGhhdmUgYSBjaGlsZCBjaGF0IHdvcnRoIG9ic2VydmluZy4gKi9cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRPYnNlcnZlU3ViYWdlbnRDaGF0KHRjOiBUb29sQ2FsbFN0YXRlKTogYm9vbGVhbiB7XG5cdGNvbnN0IGhhc1N1YmFnZW50Q29udGVudCA9ICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpXG5cdFx0JiYgZ2V0VG9vbFN1YmFnZW50Q29udGVudCh0YykgIT09IHVuZGVmaW5lZDtcblx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZykge1xuXHRcdHJldHVybiBpc1N1YmFnZW50VG9vbCh0YykgfHwgaGFzU3ViYWdlbnRDb250ZW50O1xuXHR9XG5cdHJldHVybiB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZFxuXHRcdCYmIChoYXNTdWJhZ2VudENvbnRlbnQgfHwgKHRjLnN1Y2Nlc3MgJiYgaXNTdWJhZ2VudFRvb2wodGMpKSk7XG59XG5cbi8qKlxuICogRmluZHMgYSB0ZXJtaW5hbCBjb250ZW50IGJsb2NrIGluIGEgdG9vbCBjYWxsJ3MgY29udGVudCBhcnJheS5cbiAqIFJldHVybnMgdGhlIHRlcm1pbmFsIFVSSSBpZiBmb3VuZC5cbiAqL1xuZnVuY3Rpb24gZ2V0VGVybWluYWxDb250ZW50VXJpKGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50W10gfCB1bmRlZmluZWQpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gZ2V0VGVybWluYWxDb250ZW50KGNvbnRlbnQpPy5yZXNvdXJjZTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldFRlcm1pbmFsQ29udGVudChjb250ZW50OiBUb29sUmVzdWx0Q29udGVudFtdIHwgdW5kZWZpbmVkKTogRXh0cmFjdDxUb29sUmVzdWx0Q29udGVudCwgeyB0eXBlOiBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWwgfT4gfCB1bmRlZmluZWQge1xuXHRyZXR1cm4gY29udGVudD8uZmluZChpc1Rvb2xSZXN1bHRUZXJtaW5hbENvbnRlbnQpO1xufVxuXG4vKipcbiAqIFJlc29sdmVzIGEgcmF3IHBlci10dXJuIG1vZGVsIGlkIChhcyBpdCBhcHBlYXJzIG9uIGBVc2FnZUluZm8ubW9kZWxgKSBpbnRvXG4gKiB0aGUgY2hhdCBsYXllcidzIG5hbWVzcGFjZWQgbGFuZ3VhZ2UtbW9kZWwgaWQgYW5kIGEgaHVtYW4tcmVhZGFibGUgZGlzcGxheVxuICogZGV0YWlscy4gQm90aCBoYWx2ZXMgYXJlIGluZGVwZW5kZW50OiB0aGUgaWQgZmxvd3Mgb250byByZXF1ZXN0IGhpc3RvcnlcbiAqIGl0ZW1zIChzbyB0aGUgaW5wdXQgcGlja2VyIHNob3dzIHRoZSBtb2RlbCB0aGF0IHJhbiksIHdoaWxlIHRoZSBkZXRhaWxzXG4gKiBmbG93IG9udG8gcmVzcG9uc2UgaGlzdG9yeSBpdGVtcyAoc28gdGhlIHJlc3BvbnNlIGZvb3RlciBzaG93cyB0aGUgbW9kZWxcbiAqIGFuZCBhbnkgdXNhZ2UgbWV0YWRhdGEpLlxuICovXG5leHBvcnQgaW50ZXJmYWNlIFR1cm5Nb2RlbExvb2t1cCB7XG5cdC8qKiBSZXR1cm5zIHRoZSBjaGF0LWxheWVyIG5hbWVzcGFjZWQgbW9kZWwgaWQgZm9yIGEgcmF3IEFIUCBtb2RlbCBpZC4gKi9cblx0dG9MYW5ndWFnZU1vZGVsSWQocmF3TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogUmV0dXJucyB0aGUgcmVnaXN0ZXJlZCBkaXNwbGF5IG5hbWUgZm9yIGEgcmF3IEFIUCBtb2RlbCBpZC4gKi9cblx0dG9Nb2RlbERpc3BsYXlOYW1lPyhyYXdNb2RlbElkOiBzdHJpbmcpOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdC8qKiBSZXR1cm5zIHRoZSBodW1hbi1yZWFkYWJsZSByZXNwb25zZSBkZXRhaWxzLCBvciB1bmRlZmluZWQgaWYgdW5rbm93bi4gKi9cblx0dG9SZXNwb25zZURldGFpbHMocmF3TW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkKTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXHQvKiogUmV0dXJucyB0aGUgQXV0byBtb2RlbCByb3V0aW5nIHBhcnQgY2FycmllZCBieSB0aGlzIHVzYWdlIHJlcG9ydCwgaWYgYW55LiAqL1xuXHR0b0F1dG9Nb2RlUmVzb2x1dGlvbj8odXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IElDaGF0QXV0b01vZGVSZXNvbHV0aW9uUGFydCB8IHVuZGVmaW5lZDtcbn1cblxuLyoqIE1pbmltYWwgbW9kZWwgbWV0YWRhdGEgbmVlZGVkIHRvIHJlbmRlciBhIHR1cm4ncyByZXNwb25zZSBmb290ZXIgKGtlcHQgc21hbGwgZm9yIHVuaXQgdGVzdGluZykuICovXG5leHBvcnQgaW50ZXJmYWNlIElUdXJuUmVzcG9uc2VNb2RlbCB7XG5cdHJlYWRvbmx5IG5hbWU6IHN0cmluZztcblx0cmVhZG9ubHkgcHJpY2luZz86IHN0cmluZztcbn1cblxuLyoqXG4gKiBGb3JtYXRzIGEgdHVybidzIHJlc3BvbnNlIGZvb3RlcjogdGhlIG1vZGVsIGRpc3BsYXkgbmFtZSBwbHVzIHVzYWdlIG1ldGFkYXRhIChjcmVkaXRzIG9yIHByaWNpbmcpLlxuICogYG1vZGVsYCBpcyB0aGUgcmVzb2x2ZWQgbW9kZWw7IGBiaWxsZWRNb2RlbElkYCBpcyB0aGUgdHVybidzIGB1c2FnZS5tb2RlbGAgd2hlbiBpdCBkaWRuJ3QgcmVzb2x2ZSB0byBhXG4gKiByZWdpc3RlcmVkIG1vZGVsIChlLmcuIGFuIFwiQXV0b1wiIHBpY2sgYmlsbGVkIGFzIGByYXB0b3ItbWluaWApLCBzaG93biBpbmxpbmUgYXMgYEF1dG8gKHJhcHRvci1taW5pKWAuXG4gKiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIG1vZGVsIGlzIHVua25vd24uXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBmb3JtYXRUdXJuUmVzcG9uc2VEZXRhaWxzKFxuXHRtb2RlbDogSVR1cm5SZXNwb25zZU1vZGVsIHwgdW5kZWZpbmVkLFxuXHRiaWxsZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQsXG5cdHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQsXG4pOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAoIW1vZGVsKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBkaXNwbGF5TmFtZSA9IGZvcm1hdFR1cm5Nb2RlbE5hbWUobW9kZWwsIGJpbGxlZE1vZGVsSWQpO1xuXHRjb25zdCBjcmVkaXRzID0gdXNhZ2VJbmZvVG9DaGF0VXNhZ2UodXNhZ2UpPy5jb3BpbG90Q3JlZGl0cztcblx0aWYgKGNyZWRpdHMgIT09IHVuZGVmaW5lZCkge1xuXHRcdGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdENvcGlsb3RDcmVkaXRzKGNyZWRpdHMpO1xuXHRcdGNvbnN0IGNyZWRpdERldGFpbHMgPSBmb3JtYXR0ZWQgPT09ICcxJ1xuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRIb3N0LnJlc3BvbnNlRGV0YWlscy5jcmVkaXQnLCBcInswfSBjcmVkaXRcIiwgZm9ybWF0dGVkKVxuXHRcdFx0OiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnJlc3BvbnNlRGV0YWlscy5jcmVkaXRzJywgXCJ7MH0gY3JlZGl0c1wiLCBmb3JtYXR0ZWQpO1xuXHRcdHJldHVybiBbZGlzcGxheU5hbWUsIGNyZWRpdERldGFpbHNdLmpvaW4oJyBcdTIwMjIgJyk7XG5cdH1cblx0cmV0dXJuIFtkaXNwbGF5TmFtZSwgbW9kZWwucHJpY2luZ10uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJyBcdTAwQjcgJyk7XG59XG5cbi8qKiBDb252ZXJ0cyBhbiBhZ2VudC1ob3N0IEF1dG8gcm91dGluZyByZXN1bHQgaW50byB0aGUgc2hhcmVkIGNoYXQgVUkgcGFydC4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1c2FnZUluZm9Ub0F1dG9Nb2RlUmVzb2x1dGlvbih1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkLCByZXNvbHZlZE1vZGVsTmFtZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogSUNoYXRBdXRvTW9kZVJlc29sdXRpb25QYXJ0IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgcmVzb2x1dGlvbiA9IHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKS5hdXRvTW9kZVJlc29sdmVkO1xuXHRpZiAoIXJlc29sdXRpb24gfHwgdHlwZW9mIHJlc29sdXRpb24uY29uZmlkZW5jZSAhPT0gJ251bWJlcicgfHwgIU51bWJlci5pc0Zpbml0ZShyZXNvbHV0aW9uLmNvbmZpZGVuY2UpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwcmVkaWN0ZWRMYWJlbCA9IHJlc29sdXRpb24ucHJlZGljdGVkTGFiZWw7XG5cdGlmIChwcmVkaWN0ZWRMYWJlbCAhPT0gJ25lZWRzX3JlYXNvbmluZycgJiYgcHJlZGljdGVkTGFiZWwgIT09ICdub19yZWFzb25pbmcnICYmIHByZWRpY3RlZExhYmVsICE9PSAnZmFsbGJhY2snKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRyZXR1cm4ge1xuXHRcdGtpbmQ6ICdhdXRvTW9kZVJlc29sdXRpb24nLFxuXHRcdHJlc29sdmVkTW9kZWw6IHJlc29sdXRpb24uY2hvc2VuTW9kZWwsXG5cdFx0cmVzb2x2ZWRNb2RlbE5hbWU6IHJlc29sdmVkTW9kZWxOYW1lID8/IHJlc29sdXRpb24uY2hvc2VuTW9kZWwsXG5cdFx0cHJlZGljdGVkTGFiZWwsXG5cdFx0Y29uZmlkZW5jZTogTWF0aC5tYXgoMCwgTWF0aC5taW4oMSwgcmVzb2x1dGlvbi5jb25maWRlbmNlKSksXG5cdH07XG59XG5cbi8qKiBBcHBlbmRzIHRoZSBiaWxsZWQgbW9kZWwgaWQgKGUuZy4gYEF1dG8gKHJhcHRvci1taW5pKWApIHdoZW4gb25lIGlzIHN1cHBsaWVkLiAqL1xuZnVuY3Rpb24gZm9ybWF0VHVybk1vZGVsTmFtZShtb2RlbDogSVR1cm5SZXNwb25zZU1vZGVsLCBiaWxsZWRNb2RlbElkOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBzdHJpbmcge1xuXHRpZiAoYmlsbGVkTW9kZWxJZCkge1xuXHRcdHJldHVybiBsb2NhbGl6ZSgnYWdlbnRIb3N0LnJlc3BvbnNlRGV0YWlscy5yZXNvbHZlZE1vZGVsJywgXCJ7MH0gKHsxfSlcIiwgbW9kZWwubmFtZSwgYmlsbGVkTW9kZWxJZCk7XG5cdH1cblx0cmV0dXJuIG1vZGVsLm5hbWU7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB1c2FnZUluZm9Ub0NoYXRVc2FnZSh1c2FnZTogVXNhZ2VJbmZvIHwgdW5kZWZpbmVkLCBtb2RlbERpc3BsYXlOYW1lUmVzb2x2ZXI/OiAocmF3TW9kZWxJZDogc3RyaW5nKSA9PiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJQ2hhdFVzYWdlIHwgdW5kZWZpbmVkIHtcblx0Ly8gU2hhcmVkIHdpdGggdGhlIGhvc3QncyByZXN0b3JlIHBhdGgsIHNvIFwidGhpcyB0dXJuIGhhcyB1c2FnZSB3b3J0aFxuXHQvLyBzaG93aW5nXCIgY2Fubm90IGRyaWZ0IGJldHdlZW4gdGhlIHR3by5cblx0aWYgKCFoYXNSZXBvcnRlZFVzYWdlKHVzYWdlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdHVyblRva2VuVG90YWxzID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLnR1cm5Ub2tlblRvdGFscztcblx0cmV0dXJuIHtcblx0XHRraW5kOiAndXNhZ2UnLFxuXHRcdHByb21wdFRva2VuczogdXNhZ2U/LmlucHV0VG9rZW5zID8/IDAsXG5cdFx0Y29tcGxldGlvblRva2VuczogdXNhZ2U/Lm91dHB1dFRva2VucyA/PyAwLFxuXHRcdGNvcGlsb3RDcmVkaXRzOiBnZXRDb3BpbG90Q3JlZGl0cyh1c2FnZSksXG5cdFx0c2Vzc2lvbkNvcGlsb3RDcmVkaXRzOiBnZXRTZXNzaW9uQ29waWxvdENyZWRpdHModXNhZ2UpLFxuXHRcdHByb21wdFRva2VuRGV0YWlsczogY29udGV4dEF0dHJpYnV0aW9uVG9Qcm9tcHRUb2tlbkRldGFpbHModXNhZ2UpLFxuXHRcdG1vZGVsVG90YWxzOiB0dXJuVG9rZW5Ub3RhbHM/Lm1hcCh0b3RhbCA9PiAoe1xuXHRcdFx0Li4udG90YWwsXG5cdFx0XHRtb2RlbDogbW9kZWxEaXNwbGF5TmFtZVJlc29sdmVyPy4odG90YWwubW9kZWwpID8/IHRvdGFsLm1vZGVsLFxuXHRcdH0pKSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0U2Vzc2lvbkNvcGlsb3RDcmVkaXRzKHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBzZXNzaW9uVG90YWxOYW5vQWl1ID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpLmNvcGlsb3RVc2FnZT8uc2Vzc2lvblRvdGFsTmFub0FpdTtcblx0cmV0dXJuIHR5cGVvZiBzZXNzaW9uVG90YWxOYW5vQWl1ID09PSAnbnVtYmVyJyAmJiBzZXNzaW9uVG90YWxOYW5vQWl1ID49IDBcblx0XHQ/IHNlc3Npb25Ub3RhbE5hbm9BaXUgLyAxXzAwMF8wMDBfMDAwXG5cdFx0OiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIGdldENvcGlsb3RDcmVkaXRzKHVzYWdlOiBVc2FnZUluZm8gfCB1bmRlZmluZWQpOiBudW1iZXIgfCB1bmRlZmluZWQge1xuXHRjb25zdCBtZXRhID0gcmVhZFVzYWdlSW5mb01ldGEodXNhZ2UpO1xuXHRjb25zdCB0b3RhbE5hbm9BaXUgPSBtZXRhPy5jb3BpbG90VXNhZ2U/LnRvdGFsTmFub0FpdTtcblx0aWYgKHR5cGVvZiB0b3RhbE5hbm9BaXUgPT09ICdudW1iZXInICYmIHRvdGFsTmFub0FpdSA+PSAwKSB7XG5cdFx0cmV0dXJuIHRvdGFsTmFub0FpdSAvIDFfMDAwXzAwMF8wMDA7XG5cdH1cblx0Y29uc3QgY29zdCA9IG1ldGE/LmNvc3Q7XG5cdHJldHVybiB0eXBlb2YgY29zdCA9PT0gJ251bWJlcicgJiYgY29zdCA+PSAwXG5cdFx0PyBjb3N0XG5cdFx0OiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogTWFwcyBTREsgYGtpbmRgIHZhbHVlcyB0byBkaXNwbGF5IGNhdGVnb3JpZXMgdXNlZCBieSB0aGUgY29udGV4dC11c2FnZVxuICogd2lkZ2V0LiBDYXRlZ29yaWVzIGZvbGxvdyB0aGUgbG9jYWwgYWdlbnQncyBlc3RhYmxpc2hlZCBncm91cGluZ1xuICogKFwiU3lzdGVtXCIgZm9yIGluZnJhc3RydWN0dXJlLCBcIlVzZXIgQ29udGV4dFwiIGZvciBjb252ZXJzYXRpb24gY29udGVudCkuXG4gKi9cbmZ1bmN0aW9uIGtpbmRUb0NhdGVnb3J5KGtpbmQ6IHN0cmluZyk6IHN0cmluZyB7XG5cdHN3aXRjaCAoa2luZCkge1xuXHRcdGNhc2UgJ3N5c3RlbSc6XG5cdFx0Y2FzZSAndG9vbERlZmluaXRpb24nOlxuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjb250ZXh0QXR0cmlidXRpb24uY2F0ZWdvcnkuc3lzdGVtJywgXCJTeXN0ZW1cIik7XG5cdFx0Y2FzZSAndG9vbCc6XG5cdFx0Y2FzZSAnc2tpbGwnOlxuXHRcdGNhc2UgJ3N1YmFnZW50Jzpcblx0XHRjYXNlICdtY3BTZXJ2ZXInOlxuXHRcdGNhc2UgJ3BsdWdpbic6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5jYXRlZ29yeS51c2VyQ29udGV4dCcsIFwiVXNlciBDb250ZXh0XCIpO1xuXHRcdGRlZmF1bHQ6XG5cdFx0XHRyZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5jYXRlZ29yeS51c2VyQ29udGV4dCcsIFwiVXNlciBDb250ZXh0XCIpO1xuXHR9XG59XG5cbi8qKlxuICogSHVtYW4tcmVhZGFibGUgbGFiZWxzIGZvciBhZ2dyZWdhdGVkIGBraW5kYCBncm91cHMuIEVudHJpZXMgb2Yga2luZFxuICogYHN5c3RlbWAgYXJlIHNob3duIGluZGl2aWR1YWxseSAodGhleSBhcmUgYWxyZWFkeSBhZ2dyZWdhdGVkIHJvbGx1cHMpO1xuICogb3RoZXIga2luZHMgYXJlIHN1bW1lZCBpbnRvIGEgc2luZ2xlIHJvdyBwZXIga2luZC5cbiAqL1xuZnVuY3Rpb24ga2luZFRvQWdncmVnYXRlTGFiZWwoa2luZDogc3RyaW5nKTogc3RyaW5nIHtcblx0c3dpdGNoIChraW5kKSB7XG5cdFx0Y2FzZSAndG9vbCc6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLnRvb2xSZXN1bHRzJywgXCJUb29sIFJlc3VsdHNcIik7XG5cdFx0Y2FzZSAndG9vbERlZmluaXRpb24nOiByZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5sYWJlbC50b29sRGVmaW5pdGlvbnMnLCBcIlRvb2wgRGVmaW5pdGlvbnNcIik7XG5cdFx0Y2FzZSAnc2tpbGwnOiByZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5sYWJlbC5za2lsbHMnLCBcIlNraWxsc1wiKTtcblx0XHRjYXNlICdzdWJhZ2VudCc6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLnN1YkFnZW50cycsIFwiU3ViLWFnZW50c1wiKTtcblx0XHRjYXNlICdtY3BTZXJ2ZXInOiByZXR1cm4gbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5sYWJlbC5tY3BUb29scycsIFwiTUNQIFRvb2xzXCIpO1xuXHRcdGNhc2UgJ3BsdWdpbic6IHJldHVybiBsb2NhbGl6ZSgnY29udGV4dEF0dHJpYnV0aW9uLmxhYmVsLnBsdWdpbnMnLCBcIlBsdWdpbnNcIik7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIGtpbmQ7XG5cdH1cbn1cblxuLyoqXG4gKiBDb252ZXJ0cyB0aGUgU0RLJ3MgZmxhdCBgY29udGV4dEF0dHJpYnV0aW9uLmVudHJpZXNbXWAgaW50byB0aGVcbiAqIGBwcm9tcHRUb2tlbkRldGFpbHNgIGFycmF5IGNvbnN1bWVkIGJ5IHRoZSBjb250ZXh0LXVzYWdlIHdpZGdldC5cbiAqXG4gKiBFbnRyaWVzIG9mIGBraW5kOiBcInN5c3RlbVwiYCBhcmUgZW1pdHRlZCBpbmRpdmlkdWFsbHkgKHRoZXkgYXJlIGFscmVhZHlcbiAqIGhpZ2gtbGV2ZWwgcm9sbHVwcyBsaWtlIFwiU3lzdGVtIHByb21wdFwiKSB1bmxlc3MgdGhleSBhcmUgYSBwYXJlbnQgb2ZcbiAqIGB0b29sRGVmaW5pdGlvbmAgZW50cmllcyBcdTIwMTQgaW4gdGhhdCBjYXNlIHRoZSByb2xsdXAgaXMgc2tpcHBlZCBhbmQgdGhlXG4gKiBpbmRpdmlkdWFsIGB0b29sRGVmaW5pdGlvbmAgZW50cmllcyBhcmUgYWdncmVnYXRlZCBpbnRvIHRoZWlyIG93biByb3cuXG4gKiBBbGwgb3RoZXIga2luZHMgYXJlICoqYWdncmVnYXRlZCBpbnRvIG9uZSByb3cgcGVyIGtpbmQqKiAoZS5nLiBhbGxcbiAqIGBtY3BTZXJ2ZXJgIGVudHJpZXMgYmVjb21lIGEgc2luZ2xlIFwiTUNQIFRvb2xzXCIgbGluZSkgdG8gbWF0Y2ggdGhlXG4gKiBDTEkncyBgL2NvbnRleHRgIHN1bW1hcnkgdmlldy5cbiAqIEFueSByZW1haW5pbmcgdG9rZW5zIG5vdCBjb3ZlcmVkIGJ5IGVudHJpZXMgYXJlIHJlcG9ydGVkIGFzIFwiTWVzc2FnZXNcIlxuICogKGNvbnZlcnNhdGlvbiBoaXN0b3J5OiB1c2VyL2Fzc2lzdGFudCBtZXNzYWdlcyBhbmQgdG9vbCByZXN1bHRzKS5cbiAqL1xuZnVuY3Rpb24gY29udGV4dEF0dHJpYnV0aW9uVG9Qcm9tcHRUb2tlbkRldGFpbHModXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IElDaGF0VXNhZ2VQcm9tcHRUb2tlbkRldGFpbFtdIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgbWV0YSA9IHJlYWRVc2FnZUluZm9NZXRhKHVzYWdlKTtcblx0Y29uc3QgYXR0cmlidXRpb24gPSBtZXRhPy5jb250ZXh0QXR0cmlidXRpb247XG5cdGlmICghYXR0cmlidXRpb24gfHwgYXR0cmlidXRpb24udG90YWxUb2tlbnMgPD0gMCB8fCBhdHRyaWJ1dGlvbi5lbnRyaWVzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZGV0YWlsczogSUNoYXRVc2FnZVByb21wdFRva2VuRGV0YWlsW10gPSBbXTtcblxuXHQvLyBJZGVudGlmeSBzeXN0ZW0gZW50cmllcyB0aGF0IGFyZSBwYXJlbnRzIG9mIG90aGVyIGVudHJpZXMuXG5cdC8vIFRoZXNlIHJvbGx1cHMgYXJlIHNraXBwZWQgYmVjYXVzZSB0aGVpciBjaGlsZHJlbiBhcmUgYWdncmVnYXRlZFxuXHQvLyBkaXJlY3RseSBpbnRvIHRoZWlyIG93biByb3dzIHRvIGF2b2lkIGRvdWJsZS1jb3VudGluZy5cblx0Y29uc3QgcGFyZW50SWRzID0gbmV3IFNldDxzdHJpbmc+KCk7XG5cdGZvciAoY29uc3QgZW50cnkgb2YgYXR0cmlidXRpb24uZW50cmllcykge1xuXHRcdGlmIChlbnRyeS5wYXJlbnRJZCkge1xuXHRcdFx0cGFyZW50SWRzLmFkZChlbnRyeS5wYXJlbnRJZCk7XG5cdFx0fVxuXHR9XG5cblx0Ly8gQWNjdW11bGF0ZSB0b2tlbnMgcGVyIGFnZ3JlZ2F0ZWQga2luZFxuXHRjb25zdCBraW5kVG9rZW5zID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblx0Ly8gVHJhY2sgdG9rZW5zIGFjY291bnRlZCBmb3IgYnkgdG9wLWxldmVsIGVudHJpZXMgKHN5c3RlbSByb2xsdXBzICsgYWdncmVnYXRlZCBraW5kcylcblx0bGV0IGFjY291bnRlZFRva2VucyA9IDA7XG5cblx0Zm9yIChjb25zdCBlbnRyeSBvZiBhdHRyaWJ1dGlvbi5lbnRyaWVzKSB7XG5cdFx0aWYgKGVudHJ5LmtpbmQgPT09ICdzeXN0ZW0nKSB7XG5cdFx0XHRpZiAocGFyZW50SWRzLmhhcyhlbnRyeS5pZCkpIHtcblx0XHRcdFx0Ly8gVGhpcyBzeXN0ZW0gZW50cnkgaXMgYSByb2xsdXAgcGFyZW50IHdob3NlIGNoaWxkcmVuIGFyZVxuXHRcdFx0XHQvLyBhZ2dyZWdhdGVkIHNlcGFyYXRlbHkgXHUyMDE0IHNraXAgdG8gYXZvaWQgZG91YmxlLWNvdW50aW5nLlxuXHRcdFx0XHRjb250aW51ZTtcblx0XHRcdH1cblx0XHRcdC8vIFN5c3RlbSBlbnRyaWVzIGFyZSBzaG93biBpbmRpdmlkdWFsbHkgKGFscmVhZHkgaGlnaC1sZXZlbCByb2xsdXBzKVxuXHRcdFx0YWNjb3VudGVkVG9rZW5zICs9IGVudHJ5LnRva2Vucztcblx0XHRcdGNvbnN0IHBlcmNlbnRhZ2VPZlByb21wdCA9IE1hdGgucm91bmQoKGVudHJ5LnRva2VucyAvIGF0dHJpYnV0aW9uLnRvdGFsVG9rZW5zKSAqIDEwMCk7XG5cdFx0XHRpZiAocGVyY2VudGFnZU9mUHJvbXB0ID4gMCkge1xuXHRcdFx0XHRkZXRhaWxzLnB1c2goe1xuXHRcdFx0XHRcdGNhdGVnb3J5OiBraW5kVG9DYXRlZ29yeSgnc3lzdGVtJyksXG5cdFx0XHRcdFx0bGFiZWw6IGVudHJ5LmxhYmVsLFxuXHRcdFx0XHRcdHBlcmNlbnRhZ2VPZlByb21wdCxcblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdC8vIEFnZ3JlZ2F0ZSBhbGwgb3RoZXIga2luZHMgKGluY2x1ZGluZyB0b29sRGVmaW5pdGlvbikgaW50byBvbmUgcm93IHBlciBraW5kXG5cdFx0XHRraW5kVG9rZW5zLnNldChlbnRyeS5raW5kLCAoa2luZFRva2Vucy5nZXQoZW50cnkua2luZCkgPz8gMCkgKyBlbnRyeS50b2tlbnMpO1xuXHRcdH1cblx0fVxuXG5cdC8vIEVtaXQgYWdncmVnYXRlZCByb3dzXG5cdGZvciAoY29uc3QgW2tpbmQsIHRva2Vuc10gb2Yga2luZFRva2Vucykge1xuXHRcdGFjY291bnRlZFRva2VucyArPSB0b2tlbnM7XG5cdFx0Y29uc3QgcGVyY2VudGFnZU9mUHJvbXB0ID0gTWF0aC5yb3VuZCgodG9rZW5zIC8gYXR0cmlidXRpb24udG90YWxUb2tlbnMpICogMTAwKTtcblx0XHRpZiAocGVyY2VudGFnZU9mUHJvbXB0IDw9IDApIHtcblx0XHRcdGNvbnRpbnVlO1xuXHRcdH1cblx0XHRjb25zdCBjYXRlZ29yeSA9IGtpbmRUb0NhdGVnb3J5KGtpbmQpO1xuXHRcdGNvbnN0IGxhYmVsID0ga2luZFRvQWdncmVnYXRlTGFiZWwoa2luZCk7XG5cdFx0ZGV0YWlscy5wdXNoKHsgY2F0ZWdvcnksIGxhYmVsLCBwZXJjZW50YWdlT2ZQcm9tcHQgfSk7XG5cdH1cblxuXHQvLyBUaGUgcmVtYWluZGVyIGlzIGNvbnZlcnNhdGlvbiBtZXNzYWdlcyAodXNlci9hc3Npc3RhbnQgdHVybnMsIHRvb2wgcmVzdWx0cylcblx0Ly8gbm90IGF0dHJpYnV0ZWQgdG8gYW55IHNwZWNpZmljIGVudHJ5IGJ5IHRoZSBTREsuXG5cdGNvbnN0IG1lc3NhZ2VUb2tlbnMgPSBNYXRoLm1heCgwLCBhdHRyaWJ1dGlvbi50b3RhbFRva2VucyAtIGFjY291bnRlZFRva2Vucyk7XG5cdGlmIChtZXNzYWdlVG9rZW5zID4gMCkge1xuXHRcdGNvbnN0IHBlcmNlbnRhZ2VPZlByb21wdCA9IE1hdGgucm91bmQoKG1lc3NhZ2VUb2tlbnMgLyBhdHRyaWJ1dGlvbi50b3RhbFRva2VucykgKiAxMDApO1xuXHRcdGlmIChwZXJjZW50YWdlT2ZQcm9tcHQgPiAwKSB7XG5cdFx0XHRkZXRhaWxzLnB1c2goe1xuXHRcdFx0XHRjYXRlZ29yeTogbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5jYXRlZ29yeS51c2VyQ29udGV4dCcsIFwiVXNlciBDb250ZXh0XCIpLFxuXHRcdFx0XHRsYWJlbDogbG9jYWxpemUoJ2NvbnRleHRBdHRyaWJ1dGlvbi5sYWJlbC5tZXNzYWdlcycsIFwiTWVzc2FnZXNcIiksXG5cdFx0XHRcdHBlcmNlbnRhZ2VPZlByb21wdCxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXG5cdHJldHVybiBkZXRhaWxzLmxlbmd0aCA+IDAgPyBkZXRhaWxzIDogdW5kZWZpbmVkO1xufVxuXG4vKipcbiAqIEEgcGFydGlhbCBxdW90YSB1cGRhdGUgZGVyaXZlZCBmcm9tIGEgdXNhZ2UgcmVwb3J0J3MgYF9tZXRhLnF1b3RhU25hcHNob3RzYC4gU3RydWN0dXJhbGx5IGFcbiAqIHN1YnNldCBvZiB0aGUgZW50aXRsZW1lbnQgc2VydmljZSdzIHF1b3RhIHN0YXRlLCBzbyBjYWxsZXJzIG1lcmdlIGl0IG9udG8gdGhlIGV4aXN0aW5nIHF1b3Rhcy5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJQWdlbnRIb3N0UXVvdGFVcGRhdGUge1xuXHRyZWFkb25seSBjaGF0PzogSVF1b3RhU25hcHNob3Q7XG5cdHJlYWRvbmx5IGNvbXBsZXRpb25zPzogSVF1b3RhU25hcHNob3Q7XG5cdHJlYWRvbmx5IHByZW1pdW1DaGF0PzogSVF1b3RhU25hcHNob3Q7XG5cdHJlYWRvbmx5IGFkZGl0aW9uYWxVc2FnZUVuYWJsZWQ/OiBib29sZWFuO1xuXHRyZWFkb25seSBhZGRpdGlvbmFsVXNhZ2VDb3VudD86IG51bWJlcjtcblx0cmVhZG9ubHkgcmVzZXREYXRlPzogc3RyaW5nO1xufVxuXG50eXBlIEFjY291bnRRdW90YVNuYXBzaG90ID0gTm9uTnVsbGFibGU8Tm9uTnVsbGFibGU8VXNhZ2VJbmZvTWV0YVsncXVvdGFTbmFwc2hvdHMnXT5bc3RyaW5nXT47XG5cbmZ1bmN0aW9uIG1hcEFjY291bnRRdW90YVNuYXBzaG90KHNuYXBzaG90OiBBY2NvdW50UXVvdGFTbmFwc2hvdCk6IElRdW90YVNuYXBzaG90IHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdW5saW1pdGVkID0gc25hcHNob3QuaXNVbmxpbWl0ZWRFbnRpdGxlbWVudCA/PyBmYWxzZTtcblx0Y29uc3QgZW50aXRsZW1lbnQgPSB0eXBlb2Ygc25hcHNob3QuZW50aXRsZW1lbnRSZXF1ZXN0cyA9PT0gJ251bWJlcicgPyBzbmFwc2hvdC5lbnRpdGxlbWVudFJlcXVlc3RzIDogdW5kZWZpbmVkO1xuXG5cdC8vIFNraXAgY2F0ZWdvcmllcyB3aXRoIG5vIGFsbG9jYXRlZCBlbnRpdGxlbWVudCAoZS5nLiBmcmVlLXRpZXIgcHJlbWl1bSB3aXRoIDAgY3JlZGl0cyksXG5cdC8vIG1pcnJvcmluZyBgcGFyc2VRdW90YXNgIHNvIHdlIGRvbid0IHN1cmZhY2UgYW4gZW1wdHkgcHJlbWl1bSBidWNrZXQuXG5cdGlmICghdW5saW1pdGVkICYmIGVudGl0bGVtZW50ID09PSAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIGByZW1haW5pbmdQZXJjZW50YWdlYCBpcyByZXF1aXJlZCB0byBleHByZXNzIGEgdXNhYmxlIHNuYXBzaG90LiBUcmVhdCBpdHMgYWJzZW5jZSBhc1xuXHQvLyBcIm5vIGRhdGFcIiBhbmQgc2tpcCB0aGUgY2F0ZWdvcnkgcmF0aGVyIHRoYW4gZGVmYXVsdGluZyB0byAwLCB3aGljaCB3b3VsZCBvdGhlcndpc2Vcblx0Ly8gbWFzcXVlcmFkZSBhcyBhbiBleGhhdXN0ZWQgcXVvdGEgKG1hdGNoaW5nIGBwYXJzZVF1b3Rhc2AsIHdoZXJlIGBwZXJjZW50X3JlbWFpbmluZ2AgaXMgcmVxdWlyZWQpLlxuXHRpZiAodHlwZW9mIHNuYXBzaG90LnJlbWFpbmluZ1BlcmNlbnRhZ2UgIT09ICdudW1iZXInKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHVzZWQgPSB0eXBlb2Ygc25hcHNob3QudXNlZFJlcXVlc3RzID09PSAnbnVtYmVyJyA/IHNuYXBzaG90LnVzZWRSZXF1ZXN0cyA6IHVuZGVmaW5lZDtcblx0Y29uc3QgcmVzZXRBdCA9IHNuYXBzaG90LnJlc2V0RGF0ZSA/IERhdGUucGFyc2Uoc25hcHNob3QucmVzZXREYXRlKSA6IE5hTjtcblx0cmV0dXJuIHtcblx0XHRwZXJjZW50UmVtYWluaW5nOiBNYXRoLm1pbigxMDAsIE1hdGgubWF4KDAsIHNuYXBzaG90LnJlbWFpbmluZ1BlcmNlbnRhZ2UpKSxcblx0XHR1bmxpbWl0ZWQsXG5cdFx0ZW50aXRsZW1lbnQ6ICF1bmxpbWl0ZWQgJiYgZW50aXRsZW1lbnQgIT09IHVuZGVmaW5lZCAmJiBlbnRpdGxlbWVudCA+PSAwID8gZW50aXRsZW1lbnQgOiB1bmRlZmluZWQsXG5cdFx0cXVvdGFSZW1haW5pbmc6ICF1bmxpbWl0ZWQgJiYgZW50aXRsZW1lbnQgIT09IHVuZGVmaW5lZCAmJiB1c2VkICE9PSB1bmRlZmluZWQgPyBNYXRoLm1heCgwLCBlbnRpdGxlbWVudCAtIHVzZWQpIDogdW5kZWZpbmVkLFxuXHRcdHJlc2V0QXQ6IE51bWJlci5pc0Zpbml0ZShyZXNldEF0KSA/IHJlc2V0QXQgOiB1bmRlZmluZWQsXG5cdH07XG59XG5cbi8qKlxuICogTWFwcyB0aGUgcGVyLWNhdGVnb3J5IHF1b3RhIHNuYXBzaG90cyBjYXJyaWVkIG9uIGEgdXNhZ2UgcmVwb3J0J3MgYF9tZXRhLnF1b3RhU25hcHNob3RzYFxuICogKHJlcG9ydGVkIGJ5IHRoZSBtb2RlbC1jYWxsIHVzYWdlIGV2ZW50KSBpbnRvIGEgcGFydGlhbCBxdW90YSB1cGRhdGUgZm9yIHRoZSBlbnRpdGxlbWVudFxuICogc2VydmljZS4gUmV0dXJucyBgdW5kZWZpbmVkYCB3aGVuIG5vIHVzYWJsZSBzbmFwc2hvdCBpcyBwcmVzZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdXNhZ2VJbmZvVG9RdW90YXModXNhZ2U6IFVzYWdlSW5mbyB8IHVuZGVmaW5lZCk6IElBZ2VudEhvc3RRdW90YVVwZGF0ZSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IG1ldGEgPSByZWFkVXNhZ2VJbmZvTWV0YSh1c2FnZSk7XG5cdGNvbnN0IHNuYXBzaG90cyA9IG1ldGE/LnF1b3RhU25hcHNob3RzO1xuXHRpZiAoIXNuYXBzaG90cykge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCB1cGRhdGU6IE11dGFibGU8SUFnZW50SG9zdFF1b3RhVXBkYXRlPiA9IHt9O1xuXHRsZXQgaGFzQW55ID0gZmFsc2U7XG5cblx0Y29uc3QgY2hhdCA9IHNuYXBzaG90c1snY2hhdCddICYmIG1hcEFjY291bnRRdW90YVNuYXBzaG90KHNuYXBzaG90c1snY2hhdCddKTtcblx0aWYgKGNoYXQpIHtcblx0XHR1cGRhdGUuY2hhdCA9IGNoYXQ7XG5cdFx0aGFzQW55ID0gdHJ1ZTtcblx0fVxuXHRjb25zdCBjb21wbGV0aW9ucyA9IHNuYXBzaG90c1snY29tcGxldGlvbnMnXSAmJiBtYXBBY2NvdW50UXVvdGFTbmFwc2hvdChzbmFwc2hvdHNbJ2NvbXBsZXRpb25zJ10pO1xuXHRpZiAoY29tcGxldGlvbnMpIHtcblx0XHR1cGRhdGUuY29tcGxldGlvbnMgPSBjb21wbGV0aW9ucztcblx0XHRoYXNBbnkgPSB0cnVlO1xuXHR9XG5cdGNvbnN0IHByZW1pdW1SYXcgPSBzbmFwc2hvdHNbJ3ByZW1pdW1faW50ZXJhY3Rpb25zJ107XG5cdGNvbnN0IHByZW1pdW1DaGF0ID0gcHJlbWl1bVJhdyAmJiBtYXBBY2NvdW50UXVvdGFTbmFwc2hvdChwcmVtaXVtUmF3KTtcblx0aWYgKHByZW1pdW1DaGF0KSB7XG5cdFx0dXBkYXRlLnByZW1pdW1DaGF0ID0gcHJlbWl1bUNoYXQ7XG5cdFx0aGFzQW55ID0gdHJ1ZTtcblx0fVxuXHRpZiAocHJlbWl1bVJhdykge1xuXHRcdHVwZGF0ZS5hZGRpdGlvbmFsVXNhZ2VFbmFibGVkID0gcHJlbWl1bVJhdy5vdmVyYWdlQWxsb3dlZFdpdGhFeGhhdXN0ZWRRdW90YSA/PyBmYWxzZTtcblx0XHR1cGRhdGUuYWRkaXRpb25hbFVzYWdlQ291bnQgPSB0eXBlb2YgcHJlbWl1bVJhdy5vdmVyYWdlID09PSAnbnVtYmVyJyA/IHByZW1pdW1SYXcub3ZlcmFnZSA6IDA7XG5cdFx0aGFzQW55ID0gdHJ1ZTtcblx0fVxuXG5cdGNvbnN0IHJlc2V0RGF0ZSA9IHByZW1pdW1SYXc/LnJlc2V0RGF0ZSA/PyBzbmFwc2hvdHNbJ2NoYXQnXT8ucmVzZXREYXRlO1xuXHRpZiAocmVzZXREYXRlKSB7XG5cdFx0dXBkYXRlLnJlc2V0RGF0ZSA9IHJlc2V0RGF0ZTtcblx0fVxuXG5cdHJldHVybiBoYXNBbnkgPyB1cGRhdGUgOiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQ29udmVydHMgY29tcGxldGVkIHR1cm5zIGZyb20gdGhlIHByb3RvY29sIHN0YXRlIGludG8gc2Vzc2lvbiBoaXN0b3J5IGl0ZW1zLlxuICpcbiAqIFBlciB0dXJuLCBwcmVmZXJzIGB0dXJuLnVzYWdlPy5tb2RlbGAgc28gZWFjaCByZXF1ZXN0L3Jlc3BvbnNlIHBhaXIgc2hvd3NcbiAqIHRoZSBtb2RlbCB0aGF0IGFjdHVhbGx5IHJhbiwgZXZlbiBpZiB0aGUgdXNlciBjaGFuZ2VkIG1vZGVscyBtaWQtc2Vzc2lvbi5cbiAqIFRoZSBgbG9va3VwYCBjYWxsYmFjayBpcyByZXNwb25zaWJsZSBmb3IgYW55IHNlc3Npb24tbGV2ZWwgZmFsbGJhY2sgKGUuZy5cbiAqIGBzdW1tYXJ5Lm1vZGVsPy5pZGAgd2hlbiB1c2FnZSBoYXNuJ3QgcmVwb3J0ZWQgYSBtb2RlbCB5ZXQpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdHVybnNUb0hpc3RvcnkoYmFja2VuZFNlc3Npb246IFVSSSwgdHVybnM6IHJlYWRvbmx5IFR1cm5bXSwgcGFydGljaXBhbnRJZDogc3RyaW5nLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIGxvb2t1cD86IFR1cm5Nb2RlbExvb2t1cCwgZXJyb3JDb250ZXh0PzogSUNoYXRFcnJvckNvbnRleHQsIHRlcm1pbmFsQ29tbWFuZFByZWZpeD86IHN0cmluZyk6IElDaGF0U2Vzc2lvbkhpc3RvcnlJdGVtW10ge1xuXHRjb25zdCBoaXN0b3J5OiBJQ2hhdFNlc3Npb25IaXN0b3J5SXRlbVtdID0gW107XG5cdGZvciAoY29uc3QgdHVybiBvZiB0dXJucykge1xuXHRcdGNvbnN0IHJhd01vZGVsSWQgPSB0dXJuLnVzYWdlPy5tb2RlbDtcblx0XHRjb25zdCBtb2RlbElkID0gbG9va3VwPy50b0xhbmd1YWdlTW9kZWxJZChyYXdNb2RlbElkKTtcblx0XHRjb25zdCBkZXRhaWxzID0gbG9va3VwPy50b1Jlc3BvbnNlRGV0YWlscyhyYXdNb2RlbElkLCB0dXJuLnVzYWdlKTtcblxuXHRcdC8vIFJlcXVlc3Rcblx0XHRjb25zdCB2YXJpYWJsZURhdGEgPSBtZXNzYWdlVG9WYXJpYWJsZURhdGEodHVybi5tZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRjb25zdCBvcmlnaW4gPSBtZXNzYWdlVG9SZXF1ZXN0T3JpZ2luKGJhY2tlbmRTZXNzaW9uLCB0dXJuLm1lc3NhZ2UsIHBhcnRpY2lwYW50SWQpO1xuXHRcdGNvbnN0IGlzU3lzdGVtSW5pdGlhdGVkID0gdHVybi5tZXNzYWdlLm9yaWdpbi5raW5kID09PSBNZXNzYWdlS2luZC5TeXN0ZW1Ob3RpZmljYXRpb247XG5cdFx0Ly8gQSBtZXNzYWdlIHJ1bnMgYXMgYSB0ZXJtaW5hbCBjb21tYW5kIHdoZW4gaXQgc3RhcnRzIHdpdGggdGhlIGhvc3Qnc1xuXHRcdC8vIGFkdmVydGlzZWQgcHJlZml4IGFuZCBoYXMgYSBub24tZW1wdHkgY29tbWFuZCBhZnRlciBpdCAobWlycm9yaW5nIHRoZVxuXHRcdC8vIGhvc3Qtc2lkZSBiYW5nIHBhcnNlciwgd2hlcmUgYSBsb25lIGAhYCBpcyBmb3J3YXJkZWQgdG8gdGhlIGFnZW50KS5cblx0XHRjb25zdCBpc1Rlcm1pbmFsUmVxdWVzdCA9IGlzVGVybWluYWxDb21tYW5kUHJvbXB0KHR1cm4ubWVzc2FnZS50ZXh0LCB0ZXJtaW5hbENvbW1hbmRQcmVmaXgpO1xuXHRcdGhpc3RvcnkucHVzaCh7XG5cdFx0XHRpZDogdHVybi5pZCxcblx0XHRcdHR5cGU6ICdyZXF1ZXN0Jyxcblx0XHRcdHByb21wdDogdHVybi5tZXNzYWdlLnRleHQsXG5cdFx0XHRwYXJ0aWNpcGFudDogcGFydGljaXBhbnRJZCxcblx0XHRcdG1vZGVsSWQsXG5cdFx0XHQuLi4odHVybi5zdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoRGF0ZS5wYXJzZSh0dXJuLnN0YXJ0ZWRBdCkpID8geyB0aW1lc3RhbXA6IERhdGUucGFyc2UodHVybi5zdGFydGVkQXQpIH0gOiB7fSksXG5cdFx0XHR2YXJpYWJsZURhdGEsXG5cdFx0XHQuLi4oaXNNZXNzYWdlSGlkZGVuRnJvbVRyYW5zY3JpcHQodHVybi5tZXNzYWdlKSA/IHsgaXNIaWRkZW46IHRydWUgfSA6IHt9KSxcblx0XHRcdC4uLihpc1N5c3RlbUluaXRpYXRlZCA/IHtcblx0XHRcdFx0aXNTeXN0ZW1Jbml0aWF0ZWQ6IHRydWUsXG5cdFx0XHR9IDoge30pLFxuXHRcdFx0Li4uKGlzVGVybWluYWxSZXF1ZXN0ID8ge1xuXHRcdFx0XHRpc1Rlcm1pbmFsUmVxdWVzdDogdHJ1ZSxcblx0XHRcdH0gOiB7fSksXG5cdFx0XHQuLi4ob3JpZ2luID8geyBvcmlnaW4gfSA6IHt9KSxcblx0XHR9KTtcblxuXHRcdC8vIFJlc3BvbnNlIHBhcnRzIFx1MjAxNCBpdGVyYXRlIHRoZSB1bmlmaWVkIHJlc3BvbnNlUGFydHMgYXJyYXlcblx0XHRjb25zdCBwYXJ0czogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cdFx0Y29uc3QgYXV0b01vZGVSZXNvbHV0aW9uID0gbG9va3VwPy50b0F1dG9Nb2RlUmVzb2x1dGlvbj8uKHR1cm4udXNhZ2UpO1xuXHRcdGlmIChhdXRvTW9kZVJlc29sdXRpb24pIHtcblx0XHRcdHBhcnRzLnB1c2goYXV0b01vZGVSZXNvbHV0aW9uKTtcblx0XHR9XG5cblx0XHRjb25zdCB1c2FnZSA9IHVzYWdlSW5mb1RvQ2hhdFVzYWdlKHR1cm4udXNhZ2UsIGxvb2t1cD8udG9Nb2RlbERpc3BsYXlOYW1lKTtcblx0XHRpZiAodXNhZ2UpIHtcblx0XHRcdHBhcnRzLnB1c2godXNhZ2UpO1xuXHRcdH1cblxuXHRcdGZvciAoY29uc3QgcnAgb2YgdHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0XHRzd2l0Y2ggKHJwLmtpbmQpIHtcblx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLk1hcmtkb3duOlxuXHRcdFx0XHRcdGlmIChycC5jb250ZW50KSB7XG5cdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHsga2luZDogJ21hcmtkb3duQ29udGVudCcsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyhycC5jb250ZW50KSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgUmVzcG9uc2VQYXJ0S2luZC5Ub29sQ2FsbDoge1xuXHRcdFx0XHRcdGNvbnN0IHRjID0gcnAudG9vbENhbGwgYXMgSUNvbXBsZXRlZFRvb2xDYWxsO1xuXHRcdFx0XHRcdGNvbnN0IGZpbGVFZGl0UGFydHMgPSBjb21wbGV0ZWRUb29sQ2FsbFRvRWRpdFBhcnRzKHRjLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRcdFx0XHRjb25zdCBzZXJpYWxpemVkID0gY29tcGxldGVkVG9vbENhbGxUb1NlcmlhbGl6ZWQodGMsIHVuZGVmaW5lZCwgYmFja2VuZFNlc3Npb24sIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0XHRcdGlmIChmaWxlRWRpdFBhcnRzLmxlbmd0aCA+IDApIHtcblx0XHRcdFx0XHRcdHNlcmlhbGl6ZWQucHJlc2VudGF0aW9uID0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRwYXJ0cy5wdXNoKHNlcmlhbGl6ZWQpO1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goLi4uZmlsZUVkaXRQYXJ0cyk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlJlYXNvbmluZzpcblx0XHRcdFx0XHRpZiAocnAuY29udGVudCkge1xuXHRcdFx0XHRcdFx0cGFydHMucHVzaCh7IGtpbmQ6ICd0aGlua2luZycsIHZhbHVlOiBycC5jb250ZW50LCBpZDogcnAuaWQgfSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuU3lzdGVtTm90aWZpY2F0aW9uOlxuXHRcdFx0XHRcdHtcblx0XHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzID0gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChycC5jb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5LCBycC5fbWV0YSk7XG5cdFx0XHRcdFx0XHRpZiAocHJvZ3Jlc3MpIHtcblx0XHRcdFx0XHRcdFx0cGFydHMucHVzaChwcm9ncmVzcyk7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuQ29udGVudFJlZjpcblx0XHRcdFx0XHQvLyBDb250ZW50IHJlZmVyZW5jZXMgYXJlIG5vdCByZXN0b3JlZCBpbnRvIGhpc3Rvcnk7XG5cdFx0XHRcdFx0Ly8gdGhleSBhcmUgaGFuZGxlZCBzZXBhcmF0ZWx5IGJ5IHRoZSBjb250ZW50IHByb3ZpZGVyLlxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuSW5wdXRSZXF1ZXN0OiB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChpbnB1dFJlcXVlc3RSZXNwb25zZVBhcnRUb1Byb2dyZXNzKHJwLCBjb25uZWN0aW9uQXV0aG9yaXR5KSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBFcnJvciBkZXRhaWxzIGZvciBmYWlsZWQgdHVybnMuIFN1cmZhY2VkIGFzIHRoZSByZXNwb25zZSdzXG5cdFx0Ly8gYGVycm9yRGV0YWlsc2AgKHJhdGhlciB0aGFuIGlubGluZSBtYXJrZG93bikgc28gdGhlIGNoYXQgcmVuZGVycyBhXG5cdFx0Ly8gcHJvcGVyIGVycm9yIFx1MjAxNCBpbmNsdWRpbmcgdGhlIHF1b3RhLWV4Y2VlZGVkIHVwZ3JhZGUgYWZmb3JkYW5jZSBcdTIwMTRcblx0XHQvLyBjb25zaXN0ZW50bHkgd2l0aCB0aGUgbGl2ZSBhZ2VudCByZXN1bHQuXG5cdFx0bGV0IGVycm9yRGV0YWlsczogSUNoYXRSZXNwb25zZUVycm9yRGV0YWlscyB8IHVuZGVmaW5lZDtcblx0XHRpZiAodHVybi5zdGF0ZSA9PT0gVHVyblN0YXRlLkVycm9yICYmIHR1cm4uZXJyb3IpIHtcblx0XHRcdGVycm9yRGV0YWlscyA9IGdldENoYXRFcnJvckRldGFpbHNGcm9tTWV0YSh0dXJuLmVycm9yLCBlcnJvckNvbnRleHQpXG5cdFx0XHRcdD8/IHsgbWVzc2FnZTogYEVycm9yOiAoJHt0dXJuLmVycm9yLmVycm9yVHlwZX0pICR7dHVybi5lcnJvci5tZXNzYWdlfWAgfTtcblx0XHR9XG5cblx0XHRjb25zdCBzdGFydGVkQXQgPSB0dXJuLnN0YXJ0ZWRBdCA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogRGF0ZS5wYXJzZSh0dXJuLnN0YXJ0ZWRBdCk7XG5cdFx0Y29uc3QgY29tcGxldGVkQXQgPSBzdGFydGVkQXQgIT09IHVuZGVmaW5lZCAmJiBOdW1iZXIuaXNGaW5pdGUoc3RhcnRlZEF0KSAmJiB0eXBlb2YgdHVybi5kdXJhdGlvbiA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzRmluaXRlKHR1cm4uZHVyYXRpb24pICYmIHR1cm4uZHVyYXRpb24gPj0gMFxuXHRcdFx0PyBzdGFydGVkQXQgKyB0dXJuLmR1cmF0aW9uXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRoaXN0b3J5LnB1c2goeyB0eXBlOiAncmVzcG9uc2UnLCBwYXJ0cywgcGFydGljaXBhbnQ6IHBhcnRpY2lwYW50SWQsIGRldGFpbHMsIGVsYXBzZWRNczogdHVybi5kdXJhdGlvbiwgY29tcGxldGVkQXQsIC4uLihlcnJvckRldGFpbHMgPyB7IGVycm9yRGV0YWlscyB9IDoge30pIH0pO1xuXHR9XG5cdHJldHVybiBoaXN0b3J5O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gbWVzc2FnZVRvUmVxdWVzdE9yaWdpbihiYWNrZW5kU2Vzc2lvbjogVVJJLCBtZXNzYWdlOiBNZXNzYWdlLCBwYXJ0aWNpcGFudElkOiBzdHJpbmcpOiBJQ2hhdFJlcXVlc3RPcmlnaW4gfCB1bmRlZmluZWQge1xuXHRjb25zdCBkZWxlZ2F0aW9uID0gcmVhZEFnZW50TWVzc2FnZURlbGVnYXRpb25NZXRhKG1lc3NhZ2UpO1xuXHRpZiAoIWRlbGVnYXRpb24gfHwgZGVsZWdhdGlvbi5zb3VyY2VUaHJlYWRJZCA9PT0gQWdlbnRTZXNzaW9uLmlkKGJhY2tlbmRTZXNzaW9uKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiBDaGF0UmVxdWVzdE9yaWdpbktpbmQuRGVsZWdhdGlvbixcblx0XHRzb3VyY2VTZXNzaW9uUmVzb3VyY2U6IEFnZW50U2Vzc2lvbi51cmkocGFydGljaXBhbnRJZCwgZGVsZWdhdGlvbi5zb3VyY2VUaHJlYWRJZCksXG5cdH07XG59XG5cbi8qKlxuICogQ29udmVydHMgYSB0dXJuJ3MgcGVyc2lzdGVkIHtAbGluayBNZXNzYWdlfSBpbnRvIHRoZSBjaGF0LWxheWVyXG4gKiB7QGxpbmsgSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhfSBzaGFwZSBzbyBhdHRhY2htZW50cyBzdXJ2aXZlIGFcbiAqIGhpc3RvcnkgcmVwbGF5IChhbmQgcGVuZGluZy9zZXJ2ZXItaW5pdGlhdGVkIHR1cm4gc3ludGhlc2lzKS4gUmV0dXJuc1xuICogYHVuZGVmaW5lZGAgd2hlbiB0aGUgbWVzc2FnZSBoYXMgbm8gY29udmVydGlibGUgYXR0YWNobWVudHMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBtZXNzYWdlVG9WYXJpYWJsZURhdGEobWVzc2FnZTogTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVEYXRhIHwgdW5kZWZpbmVkIHtcblx0cmV0dXJuIG1lc3NhZ2VBdHRhY2htZW50c1RvVmFyaWFibGVEYXRhKG1lc3NhZ2UuYXR0YWNobWVudHMsIGNvbm5lY3Rpb25BdXRob3JpdHksIG1lc3NhZ2UudGV4dCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBtZXNzYWdlQXR0YWNobWVudHNUb1ZhcmlhYmxlRGF0YShhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSB8IHVuZGVmaW5lZCwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLCBtZXNzYWdlVGV4dD86IHN0cmluZyk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRGF0YSB8IHVuZGVmaW5lZCB7XG5cdGlmICghYXR0YWNobWVudHM/Lmxlbmd0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdmFyaWFibGVzOiBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5W10gPSBbXTtcblx0Y29uc3QgYWdncmVnYXRlZEZlZWRiYWNrID0gYWdncmVnYXRlQWdlbnRGZWVkYmFja0F0dGFjaG1lbnRzKGF0dGFjaG1lbnRzLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0aWYgKGFnZ3JlZ2F0ZWRGZWVkYmFjaykge1xuXHRcdHZhcmlhYmxlcy5wdXNoKGFnZ3JlZ2F0ZWRGZWVkYmFjayk7XG5cdH1cblx0Y29uc3QgY29uc3VtZWRBdHRhY2htZW50cyA9IG5ldyBTZXQ8TWVzc2FnZUF0dGFjaG1lbnQ+KCk7XG5cdGZvciAoY29uc3QgYSBvZiBhdHRhY2htZW50cykge1xuXHRcdGlmICgoYWdncmVnYXRlZEZlZWRiYWNrICYmIGlzQWdlbnRGZWVkYmFja01lc3NhZ2VBdHRhY2htZW50KGEpKSB8fCBjb25zdW1lZEF0dGFjaG1lbnRzLmhhcyhhKSkge1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IGVsZW1lbnQgPSByZXN0b3JlRWxlbWVudFZhcmlhYmxlRW50cnkoYSwgYS50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlID8gYS5tb2RlbFJlcHJlc2VudGF0aW9uIDogdW5kZWZpbmVkKTtcblx0XHRpZiAoZWxlbWVudCkge1xuXHRcdFx0Y29uc3QgY29ycmVsYXRpb25JZCA9IGdldEVsZW1lbnRBdHRhY2htZW50Q29ycmVsYXRpb25JZChhKTtcblx0XHRcdGNvbnN0IGltYWdlQXR0YWNobWVudCA9IGNvcnJlbGF0aW9uSWRcblx0XHRcdFx0PyBhdHRhY2htZW50cy5maW5kKGNhbmRpZGF0ZSA9PiBjYW5kaWRhdGUuZGlzcGxheUtpbmQgPT09ICdpbWFnZScgJiYgZ2V0RWxlbWVudEF0dGFjaG1lbnRDb3JyZWxhdGlvbklkKGNhbmRpZGF0ZSkgPT09IGNvcnJlbGF0aW9uSWQpXG5cdFx0XHRcdDogdW5kZWZpbmVkO1xuXHRcdFx0Y29uc3QgaW1hZ2UgPSBpbWFnZUF0dGFjaG1lbnQgPyBtZXNzYWdlQXR0YWNobWVudFRvVmFyaWFibGVFbnRyeShpbWFnZUF0dGFjaG1lbnQsIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkO1xuXHRcdFx0aWYgKGltYWdlQXR0YWNobWVudCAmJiBpbWFnZT8ua2luZCA9PT0gJ2ltYWdlJykge1xuXHRcdFx0XHRjb25zdW1lZEF0dGFjaG1lbnRzLmFkZChpbWFnZUF0dGFjaG1lbnQpO1xuXHRcdFx0fVxuXHRcdFx0dmFyaWFibGVzLnB1c2goaW1hZ2U/LmtpbmQgPT09ICdpbWFnZSdcblx0XHRcdFx0PyB7IC4uLmVsZW1lbnQsIGltYWdlRGF0YTogaW1hZ2UudmFsdWUgaW5zdGFuY2VvZiBVaW50OEFycmF5IHx8IFVSSS5pc1VyaShpbWFnZS52YWx1ZSkgPyBpbWFnZS52YWx1ZSA6IHVuZGVmaW5lZCwgaW1hZ2VNaW1lVHlwZTogaW1hZ2UubWltZVR5cGUgfVxuXHRcdFx0XHQ6IGVsZW1lbnQpO1xuXHRcdFx0Y29udGludWU7XG5cdFx0fVxuXHRcdGNvbnN0IHYgPSBtZXNzYWdlQXR0YWNobWVudFRvVmFyaWFibGVFbnRyeShhLCBjb25uZWN0aW9uQXV0aG9yaXR5LCBtZXNzYWdlVGV4dCk7XG5cdFx0aWYgKHYpIHtcblx0XHRcdHZhcmlhYmxlcy5wdXNoKHYpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gdmFyaWFibGVzLmxlbmd0aCA+IDAgPyB7IHZhcmlhYmxlcyB9IDogdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBpc0FnZW50RmVlZGJhY2tNZXNzYWdlQXR0YWNobWVudChhdHRhY2htZW50OiBNZXNzYWdlQXR0YWNobWVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaXNBZ2VudEZlZWRiYWNrQW5ub3RhdGlvbnNBdHRhY2htZW50KGF0dGFjaG1lbnQpIHx8IGlzQWdlbnRGZWVkYmFja0F0dGFjaG1lbnQoYXR0YWNobWVudCk7XG59XG5cbmZ1bmN0aW9uIGFnZ3JlZ2F0ZUFnZW50RmVlZGJhY2tBdHRhY2htZW50cyhhdHRhY2htZW50czogcmVhZG9ubHkgTWVzc2FnZUF0dGFjaG1lbnRbXSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRSZXF1ZXN0VmFyaWFibGVFbnRyeSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZlZWRiYWNrQXR0YWNobWVudHMgPSBhdHRhY2htZW50cy5maWx0ZXIoaXNBZ2VudEZlZWRiYWNrTWVzc2FnZUF0dGFjaG1lbnQpO1xuXHRpZiAoZmVlZGJhY2tBdHRhY2htZW50cy5sZW5ndGggPT09IDAgfHwgKGZlZWRiYWNrQXR0YWNobWVudHMubGVuZ3RoID09PSAxICYmIGlzQWdlbnRGZWVkYmFja0F0dGFjaG1lbnQoZmVlZGJhY2tBdHRhY2htZW50c1swXSkpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgc2Vzc2lvblJlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGxldCBhbm5vdGF0aW9uc1Jlc291cmNlOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG5cdGNvbnN0IGZlZWRiYWNrSXRlbXMgPSBuZXcgTWFwPHN0cmluZywgSUFnZW50RmVlZGJhY2tWYXJpYWJsZUVudHJ5WydmZWVkYmFja0l0ZW1zJ11bbnVtYmVyXT4oKTtcblx0Zm9yIChjb25zdCBhdHRhY2htZW50IG9mIGZlZWRiYWNrQXR0YWNobWVudHMpIHtcblx0XHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuQW5ub3RhdGlvbnMpIHtcblx0XHRcdGFubm90YXRpb25zUmVzb3VyY2UgPz89IGF0dGFjaG1lbnQucmVzb3VyY2U7XG5cdFx0fVxuXHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0QWdlbnRGZWVkYmFja0F0dGFjaG1lbnRNZXRhZGF0YShhdHRhY2htZW50KTtcblx0XHRpZiAoIW1ldGFkYXRhKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0c2Vzc2lvblJlc291cmNlID8/PSBtZXRhZGF0YS5zZXNzaW9uUmVzb3VyY2U7XG5cdFx0Zm9yIChjb25zdCBpdGVtIG9mIG1ldGFkYXRhLmZlZWRiYWNrSXRlbXMpIHtcblx0XHRcdGZlZWRiYWNrSXRlbXMuc2V0KGl0ZW0uaWQsIHtcblx0XHRcdFx0aWQ6IGl0ZW0uaWQsXG5cdFx0XHRcdHRleHQ6IGl0ZW0udGV4dCxcblx0XHRcdFx0cmVzb3VyY2VVcmk6IHRvQWdlbnRIb3N0VXJpKFVSSS5wYXJzZShpdGVtLnJlc291cmNlVXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSksXG5cdFx0XHRcdHJhbmdlOiB0ZXh0UmFuZ2VUb0lSYW5nZShpdGVtLnJhbmdlKSxcblx0XHRcdFx0Li4uKGl0ZW0ucmVwbGllcz8ubGVuZ3RoID8geyByZXBsaWVzOiBpdGVtLnJlcGxpZXMgfSA6IHt9KSxcblx0XHRcdH0pO1xuXHRcdH1cblx0fVxuXHRjb25zdCBmaXJzdEF0dGFjaG1lbnQgPSBmZWVkYmFja0F0dGFjaG1lbnRzWzBdO1xuXHRpZiAoZmVlZGJhY2tJdGVtcy5zaXplID09PSAwIHx8ICFzZXNzaW9uUmVzb3VyY2UpIHtcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0bmFtZTogZmlyc3RBdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0dmFsdWU6IGZpcnN0QXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlXG5cdFx0XHRcdD8gZmlyc3RBdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24gfHwgZmlyc3RBdHRhY2htZW50LmxhYmVsXG5cdFx0XHRcdDogZmlyc3RBdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0X21ldGE6IGZpcnN0QXR0YWNobWVudC5fbWV0YSxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2FnZW50RmVlZGJhY2snLFxuXHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRuYW1lOiBmZWVkYmFja0l0ZW1zLnNpemUgPT09IDFcblx0XHRcdD8gbG9jYWxpemUoJ2FnZW50RmVlZGJhY2sub25lJywgXCIxIGNvbW1lbnRcIilcblx0XHRcdDogbG9jYWxpemUoJ2FnZW50RmVlZGJhY2subWFueScsIFwiezB9IGNvbW1lbnRzXCIsIGZlZWRiYWNrSXRlbXMuc2l6ZSksXG5cdFx0dmFsdWU6IGZpcnN0QXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlXG5cdFx0XHQ/IGZpcnN0QXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uIHx8IGZpcnN0QXR0YWNobWVudC5sYWJlbFxuXHRcdFx0OiBmaXJzdEF0dGFjaG1lbnQubGFiZWwsXG5cdFx0c2Vzc2lvblJlc291cmNlOiBVUkkucGFyc2Uoc2Vzc2lvblJlc291cmNlKSxcblx0XHRhbm5vdGF0aW9uc1Jlc291cmNlOiBhbm5vdGF0aW9uc1Jlc291cmNlID8gVVJJLnBhcnNlKGFubm90YXRpb25zUmVzb3VyY2UpIDogdW5kZWZpbmVkLFxuXHRcdGZlZWRiYWNrSXRlbXM6IFsuLi5mZWVkYmFja0l0ZW1zLnZhbHVlcygpXSxcblx0XHRfbWV0YTogZmlyc3RBdHRhY2htZW50Ll9tZXRhLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBtZXNzYWdlQXR0YWNobWVudFRvVmFyaWFibGVFbnRyeShhdHRhY2htZW50OiBNZXNzYWdlQXR0YWNobWVudCwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLCBtZXNzYWdlVGV4dD86IHN0cmluZyk6IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRpZiAoaXNBZ2VudEZlZWRiYWNrQXR0YWNobWVudChhdHRhY2htZW50KSkge1xuXHRcdGNvbnN0IG1ldGFkYXRhID0gZ2V0QWdlbnRGZWVkYmFja0F0dGFjaG1lbnRNZXRhZGF0YShhdHRhY2htZW50KTtcblx0XHRpZiAobWV0YWRhdGEpIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdhZ2VudEZlZWRiYWNrJyxcblx0XHRcdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdFx0XHRuYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0XHR2YWx1ZTogYXR0YWNobWVudC5tb2RlbFJlcHJlc2VudGF0aW9uIHx8IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHRcdHNlc3Npb25SZXNvdXJjZTogVVJJLnBhcnNlKG1ldGFkYXRhLnNlc3Npb25SZXNvdXJjZSksXG5cdFx0XHRcdGZlZWRiYWNrSXRlbXM6IG1ldGFkYXRhLmZlZWRiYWNrSXRlbXMubWFwKGl0ZW0gPT4gKHtcblx0XHRcdFx0XHRpZDogaXRlbS5pZCxcblx0XHRcdFx0XHR0ZXh0OiBpdGVtLnRleHQsXG5cdFx0XHRcdFx0cmVzb3VyY2VVcmk6IHRvQWdlbnRIb3N0VXJpKFVSSS5wYXJzZShpdGVtLnJlc291cmNlVXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSksXG5cdFx0XHRcdFx0cmFuZ2U6IHRleHRSYW5nZVRvSVJhbmdlKGl0ZW0ucmFuZ2UpLFxuXHRcdFx0XHR9KSksXG5cdFx0XHRcdF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuUmVzb3VyY2UpIHtcblx0XHRpZiAoaXNTZXNzaW9uUmVmZXJlbmNlVHJhamVjdG9yeUF0dGFjaG1lbnQoYXR0YWNobWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHVyaSA9IHRvQWdlbnRIb3N0VXJpKFVSSS5wYXJzZShhdHRhY2htZW50LnVyaSksIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdGNvbnN0IG5hbWUgPSBhdHRhY2htZW50LmxhYmVsO1xuXHRcdGNvbnN0IGlkID0gdXJpLnRvU3RyaW5nKCkgKyAoYXR0YWNobWVudC5zZWxlY3Rpb25cblx0XHRcdD8gYDoke2F0dGFjaG1lbnQuc2VsZWN0aW9uLnJhbmdlLnN0YXJ0LmxpbmV9LSR7YXR0YWNobWVudC5zZWxlY3Rpb24ucmFuZ2UuZW5kLmxpbmV9YFxuXHRcdFx0OiAnJyk7XG5cdFx0Y29uc3QgX21ldGEgPSBhdHRhY2htZW50Ll9tZXRhO1xuXG5cdFx0aWYgKGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICdkaXJlY3RvcnknKSB7XG5cdFx0XHRyZXR1cm4geyBraW5kOiAnZGlyZWN0b3J5JywgaWQsIG5hbWUsIHZhbHVlOiB1cmksIF9tZXRhIH07XG5cdFx0fVxuXHRcdGlmIChhdHRhY2htZW50LmRpc3BsYXlLaW5kID09PSAnaW1hZ2UnKSB7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRraW5kOiAnaW1hZ2UnLFxuXHRcdFx0XHRpZCxcblx0XHRcdFx0bmFtZSxcblx0XHRcdFx0dmFsdWU6IHVyaSxcblx0XHRcdFx0aXNVUkw6IHRydWUsXG5cdFx0XHRcdHJlZmVyZW5jZXM6IFt7IGtpbmQ6ICdyZWZlcmVuY2UnLCByZWZlcmVuY2U6IHVyaSB9XSxcblx0XHRcdFx0X21ldGEsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRpZiAoYXR0YWNobWVudC5zZWxlY3Rpb24pIHtcblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdGtpbmQ6ICdmaWxlJyxcblx0XHRcdFx0aWQsXG5cdFx0XHRcdG5hbWUsXG5cdFx0XHRcdHZhbHVlOiB7IHVyaSwgcmFuZ2U6IHRleHRSYW5nZVRvSVJhbmdlKGF0dGFjaG1lbnQuc2VsZWN0aW9uLnJhbmdlKSB9LFxuXHRcdFx0XHRfbWV0YSxcblx0XHRcdH07XG5cdFx0fVxuXHRcdHJldHVybiB7IGtpbmQ6ICdmaWxlJywgaWQsIG5hbWUsIHZhbHVlOiB1cmksIF9tZXRhIH07XG5cdH1cblxuXHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuRW1iZWRkZWRSZXNvdXJjZSkge1xuXHRcdGlmICghYXR0YWNobWVudC5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2dlbmVyaWMnLFxuXHRcdFx0XHRpZDogZ2VuZXJhdGVVdWlkKCksXG5cdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHRcdHZhbHVlOiBkZWNvZGVCYXNlNjQoYXR0YWNobWVudC5kYXRhKS5idWZmZXIsXG5cdFx0XHRcdF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhLFxuXHRcdFx0fTtcblx0XHR9XG5cblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ2ltYWdlJyxcblx0XHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwgfHwgJ2ltYWdlJyxcblx0XHRcdHZhbHVlOiBkZWNvZGVCYXNlNjQoYXR0YWNobWVudC5kYXRhKS5idWZmZXIsXG5cdFx0XHRtaW1lVHlwZTogYXR0YWNobWVudC5jb250ZW50VHlwZSxcblx0XHRcdGlzVVJMOiBmYWxzZSxcblx0XHRcdF9tZXRhOiBhdHRhY2htZW50Ll9tZXRhLFxuXHRcdH07XG5cdH1cblxuXHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuQ2hhdCkge1xuXHRcdHJldHVybiByZXN0b3JlQ2hhdFJlZmVyZW5jZVZhcmlhYmxlRW50cnlGcm9tQXR0YWNobWVudChhdHRhY2htZW50LCBtZXNzYWdlVGV4dCk7XG5cdH1cblxuXHRjb25zdCBhZ2VudEhvc3RDb21wbGV0aW9uS2luZCA9IGdldEFnZW50SG9zdENvbXBsZXRpb25LaW5kKGF0dGFjaG1lbnQpO1xuXHRpZiAoYWdlbnRIb3N0Q29tcGxldGlvbktpbmQgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB0b0FnZW50SG9zdENvbXBsZXRpb25WYXJpYWJsZUVudHJ5RnJvbU1ldGFkYXRhKGFnZW50SG9zdENvbXBsZXRpb25LaW5kLCBhdHRhY2htZW50LmxhYmVsLCBhdHRhY2htZW50Ll9tZXRhKTtcblx0fVxuXG5cdGNvbnN0IG1vZGVsUmVwcmVzZW50YXRpb24gPSBhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgPyBhdHRhY2htZW50Lm1vZGVsUmVwcmVzZW50YXRpb24gOiB1bmRlZmluZWQ7XG5cdGlmIChpc0Jyb3dzZXJWaWV3QXR0YWNobWVudChhdHRhY2htZW50KSAmJiBtb2RlbFJlcHJlc2VudGF0aW9uICE9PSB1bmRlZmluZWQpIHtcblx0XHRjb25zdCBtZXRhZGF0YSA9IGdldEJyb3dzZXJWaWV3QXR0YWNobWVudE1ldGFkYXRhKGF0dGFjaG1lbnQpO1xuXHRcdGlmIChtZXRhZGF0YSkge1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0a2luZDogJ2Jyb3dzZXJWaWV3Jyxcblx0XHRcdFx0aWQ6IG1ldGFkYXRhLmJyb3dzZXJVcmksXG5cdFx0XHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0XHRcdHZhbHVlOiBVUkkucGFyc2UobWV0YWRhdGEuYnJvd3NlclVyaSksXG5cdFx0XHRcdGJyb3dzZXJJZDogbWV0YWRhdGEuYnJvd3NlcklkLFxuXHRcdFx0XHRtb2RlbERlc2NyaXB0aW9uOiBtb2RlbFJlcHJlc2VudGF0aW9uLFxuXHRcdFx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0XHRcdH07XG5cdFx0fVxuXHR9XG5cdGlmIChhdHRhY2htZW50LnR5cGUgPT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUgJiYgbW9kZWxSZXByZXNlbnRhdGlvbiAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0Y29uc3QgdHJhbnNjcmlwdENvbnRleHRFbnRyeSA9IHJlc3RvcmVDaGF0VHJhbnNjcmlwdENvbnRleHRWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQubGFiZWwsIG1vZGVsUmVwcmVzZW50YXRpb24sIGF0dGFjaG1lbnQuX21ldGEpO1xuXHRcdGlmICh0cmFuc2NyaXB0Q29udGV4dEVudHJ5KSB7XG5cdFx0XHRyZXR1cm4gdHJhbnNjcmlwdENvbnRleHRFbnRyeTtcblx0XHR9XG5cdH1cblx0aWYgKGF0dGFjaG1lbnQuZGlzcGxheUtpbmQgPT09ICd3b3Jrc3BhY2UnICYmIG1vZGVsUmVwcmVzZW50YXRpb24gIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnd29ya3NwYWNlJyxcblx0XHRcdGlkOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdFx0bmFtZTogYXR0YWNobWVudC5sYWJlbCxcblx0XHRcdHZhbHVlOiBtb2RlbFJlcHJlc2VudGF0aW9uLFxuXHRcdFx0X21ldGE6IGF0dGFjaG1lbnQuX21ldGEsXG5cdFx0fTtcblx0fVxuXHRpZiAoYXR0YWNobWVudC50eXBlID09PSBNZXNzYWdlQXR0YWNobWVudEtpbmQuU2ltcGxlKSB7XG5cdFx0Y29uc3Qgc2Vzc2lvblJlZmVyZW5jZUVudHJ5ID0gcmVzdG9yZVNlc3Npb25SZWZlcmVuY2VWYXJpYWJsZUVudHJ5RnJvbUF0dGFjaG1lbnQoYXR0YWNobWVudCk7XG5cdFx0aWYgKHNlc3Npb25SZWZlcmVuY2VFbnRyeSkge1xuXHRcdFx0cmV0dXJuIHNlc3Npb25SZWZlcmVuY2VFbnRyeTtcblx0XHR9XG5cdH1cblx0Y29uc3QgcGFzdGVFbnRyeSA9IHJlc3RvcmVQYXN0ZVZhcmlhYmxlRW50cnlGcm9tQXR0YWNobWVudCh7XG5cdFx0bGFiZWw6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0ZGlzcGxheUtpbmQ6IGF0dGFjaG1lbnQuZGlzcGxheUtpbmQsXG5cdFx0bW9kZWxSZXByZXNlbnRhdGlvbixcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fSk7XG5cdGlmIChwYXN0ZUVudHJ5KSB7XG5cdFx0cmV0dXJuIHBhc3RlRW50cnk7XG5cdH1cblx0cmV0dXJuIHtcblx0XHRraW5kOiAnZ2VuZXJpYycsXG5cdFx0aWQ6IGdlbmVyYXRlVXVpZCgpLFxuXHRcdG5hbWU6IGF0dGFjaG1lbnQubGFiZWwsXG5cdFx0dmFsdWU6IG1vZGVsUmVwcmVzZW50YXRpb24gfHwgYXR0YWNobWVudC5sYWJlbCxcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gcmVzdG9yZUVsZW1lbnRWYXJpYWJsZUVudHJ5KGF0dGFjaG1lbnQ6IE1lc3NhZ2VBdHRhY2htZW50LCBtb2RlbFJlcHJlc2VudGF0aW9uOiBzdHJpbmcgfCB1bmRlZmluZWQpOiBJRWxlbWVudFZhcmlhYmxlRW50cnkgfCB1bmRlZmluZWQge1xuXHRpZiAoYXR0YWNobWVudC5kaXNwbGF5S2luZCAhPT0gQWdlbnRIb3N0RWxlbWVudEF0dGFjaG1lbnREaXNwbGF5S2luZCB8fCBtb2RlbFJlcHJlc2VudGF0aW9uID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGZ1bGxOYW1lID0gL15FbGVtZW50OlxccyooPzxuYW1lPi4rKSQvbS5leGVjKG1vZGVsUmVwcmVzZW50YXRpb24pPy5ncm91cHM/Lm5hbWU7XG5cdHJldHVybiB7XG5cdFx0a2luZDogJ2VsZW1lbnQnLFxuXHRcdGlkOiBnZW5lcmF0ZVV1aWQoKSxcblx0XHRuYW1lOiBhdHRhY2htZW50LmxhYmVsLFxuXHRcdC4uLihmdWxsTmFtZSA/IHsgZnVsbE5hbWUgfSA6IHt9KSxcblx0XHRpY29uOiBDb2RpY29uLmxheW91dCxcblx0XHR2YWx1ZTogbW9kZWxSZXByZXNlbnRhdGlvbixcblx0XHRfbWV0YTogYXR0YWNobWVudC5fbWV0YSxcblx0fTtcbn1cblxuZnVuY3Rpb24gZ2V0QWdlbnRIb3N0Q29tcGxldGlvbktpbmQoYXR0YWNobWVudDogTWVzc2FnZUF0dGFjaG1lbnQpOiBBZ2VudEhvc3RDb21wbGV0aW9uUmVmZXJlbmNlS2luZCB8IHVuZGVmaW5lZCB7XG5cdGlmIChhdHRhY2htZW50LnR5cGUgIT09IE1lc3NhZ2VBdHRhY2htZW50S2luZC5TaW1wbGUpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHN3aXRjaCAoYXR0YWNobWVudC5kaXNwbGF5S2luZCkge1xuXHRcdGNhc2UgJ2NvbW1hbmQnOlxuXHRcdFx0cmV0dXJuIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLkNvbW1hbmQ7XG5cdFx0Y2FzZSAnc2tpbGwnOlxuXHRcdFx0cmV0dXJuIEFnZW50SG9zdENvbXBsZXRpb25SZWZlcmVuY2VLaW5kLlNraWxsO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbmZ1bmN0aW9uIHRleHRSYW5nZVRvSVJhbmdlKHJhbmdlOiBUZXh0UmFuZ2UpOiBJUmFuZ2Uge1xuXHRyZXR1cm4ge1xuXHRcdHN0YXJ0TGluZU51bWJlcjogcmFuZ2Uuc3RhcnQubGluZSArIDEsXG5cdFx0c3RhcnRDb2x1bW46IHJhbmdlLnN0YXJ0LmNoYXJhY3RlciArIDEsXG5cdFx0ZW5kTGluZU51bWJlcjogcmFuZ2UuZW5kLmxpbmUgKyAxLFxuXHRcdGVuZENvbHVtbjogcmFuZ2UuZW5kLmNoYXJhY3RlciArIDEsXG5cdH07XG59XG5cbi8qKlxuICogQ29udmVydHMgYW4gYWN0aXZlIChpbi1wcm9ncmVzcykgdHVybidzIGFjY3VtdWxhdGVkIHN0YXRlIGludG8gcHJvZ3Jlc3NcbiAqIGl0ZW1zIHN1aXRhYmxlIGZvciByZXBsYXlpbmcgaW50byB0aGUgY2hhdCBVSSB3aGVuIHJlY29ubmVjdGluZyB0byBhXG4gKiBzZXNzaW9uIHRoYXQgaXMgbWlkLXR1cm4uXG4gKlxuICogUmV0dXJucyBzZXJpYWxpemVkIHByb2dyZXNzIGl0ZW1zIGZvciBjb250ZW50IGFscmVhZHkgcmVjZWl2ZWQgKHRleHQsXG4gKiByZWFzb25pbmcsIGNvbXBsZXRlZCB0b29sIGNhbGxzKSBhbmQgbGl2ZSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufVxuICogb2JqZWN0cyBmb3IgcnVubmluZyB0b29sIGNhbGxzIGFuZCBwZW5kaW5nIGNvbmZpcm1hdGlvbnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiBhY3RpdmVUdXJuVG9Qcm9ncmVzcyhzZXNzaW9uUmVzb3VyY2U6IFVSSSwgYWN0aXZlVHVybjogQWN0aXZlVHVybiwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nLCBtY3BTZXJ2ZXJBdXRob3JpdHkgPSBzZXNzaW9uUmVzb3VyY2UuYXV0aG9yaXR5LCB0b29sSW52b2NhdGlvbk9wdGlvbnM/OiBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zLCBsb29rdXA/OiBUdXJuTW9kZWxMb29rdXApOiBJQ2hhdFByb2dyZXNzW10ge1xuXHRjb25zdCBwYXJ0czogSUNoYXRQcm9ncmVzc1tdID0gW107XG5cdGNvbnN0IHVzYWdlID0gdXNhZ2VJbmZvVG9DaGF0VXNhZ2UoYWN0aXZlVHVybi51c2FnZSwgbG9va3VwPy50b01vZGVsRGlzcGxheU5hbWUpO1xuXHRpZiAodXNhZ2UpIHtcblx0XHRwYXJ0cy5wdXNoKHVzYWdlKTtcblx0fVxuXG5cdGZvciAoY29uc3QgcnAgb2YgYWN0aXZlVHVybi5yZXNwb25zZVBhcnRzKSB7XG5cdFx0c3dpdGNoIChycC5raW5kKSB7XG5cdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuTWFya2Rvd246XG5cdFx0XHRcdGlmIChycC5jb250ZW50KSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaCh7IGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnLCBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcocnAuY29udGVudCkgfSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuUmVhc29uaW5nOlxuXHRcdFx0XHRpZiAocnAuY29udGVudCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goeyBraW5kOiAndGhpbmtpbmcnLCB2YWx1ZTogcnAuY29udGVudCwgaWQ6IHJwLmlkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlRvb2xDYWxsOiB7XG5cdFx0XHRcdGNvbnN0IHRjID0gcnAudG9vbENhbGw7XG5cdFx0XHRcdGNvbnN0IGlzT3RoZXJDbGllbnRUb29sQ2FsbCA9IHRjLmNvbnRyaWJ1dG9yPy5raW5kID09PSBUb29sQ2FsbENvbnRyaWJ1dG9yS2luZC5DbGllbnRcblx0XHRcdFx0XHQmJiB0b29sSW52b2NhdGlvbk9wdGlvbnNcblx0XHRcdFx0XHQmJiB0Yy5jb250cmlidXRvci5jbGllbnRJZCAhPT0gdG9vbEludm9jYXRpb25PcHRpb25zLmN1cnJlbnRDbGllbnRJZDtcblx0XHRcdFx0aWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ2FuY2VsbGVkKSB7XG5cdFx0XHRcdFx0cGFydHMucHVzaChjb21wbGV0ZWRUb29sQ2FsbFRvU2VyaWFsaXplZCh0YyBhcyBJQ29tcGxldGVkVG9vbENhbGwsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgJiYgIWlzT3RoZXJDbGllbnRUb29sQ2FsbCkge1xuXHRcdFx0XHRcdHBhcnRzLnB1c2godG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih0YywgdW5kZWZpbmVkLCBzZXNzaW9uUmVzb3VyY2UsIGNvbm5lY3Rpb25BdXRob3JpdHksIG1jcFNlcnZlckF1dGhvcml0eSkpO1xuXHRcdFx0XHR9IGVsc2UgaWYgKHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuUnVubmluZyB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZyB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlBlbmRpbmdDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRwYXJ0cy5wdXNoKHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5LCBtY3BTZXJ2ZXJBdXRob3JpdHksIHRvb2xJbnZvY2F0aW9uT3B0aW9ucykpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGJyZWFrO1xuXHRcdFx0fVxuXHRcdFx0Y2FzZSBSZXNwb25zZVBhcnRLaW5kLlN5c3RlbU5vdGlmaWNhdGlvbjpcblx0XHRcdFx0e1xuXHRcdFx0XHRcdGNvbnN0IHByb2dyZXNzID0gc3lzdGVtTm90aWZpY2F0aW9uVG9DaGF0UGFydChycC5jb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5LCBycC5fbWV0YSk7XG5cdFx0XHRcdFx0aWYgKHByb2dyZXNzKSB7XG5cdFx0XHRcdFx0XHRwYXJ0cy5wdXNoKHByb2dyZXNzKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdFx0YnJlYWs7XG5cdFx0XHRjYXNlIFJlc3BvbnNlUGFydEtpbmQuQ29udGVudFJlZjpcblx0XHRcdFx0YnJlYWs7XG5cdFx0fVxuXHR9XG5cblx0cmV0dXJuIHBhcnRzO1xufVxuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbElucHV0KHRjOiBUb29sQ2FsbFN0YXRlKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdG9vbElucHV0ID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgPyB1bmRlZmluZWQgOiBnZXRJbmxpbmVUb29sSW5wdXQodGMudG9vbElucHV0KTtcblx0aWYgKHRvb2xJbnB1dCkge1xuXHRcdHRyeSB7XG5cdFx0XHRyZXR1cm4gSlNPTi5wYXJzZSh0b29sSW5wdXQpLmNvbW1hbmQgfHwgdG9vbElucHV0O1xuXHRcdH0gY2F0Y2gge1xuXHRcdFx0cmV0dXJuIHRvb2xJbnB1dDtcblx0XHR9XG5cdH1cblxuXHRyZXR1cm4gdW5kZWZpbmVkO1xufVxuXG5mdW5jdGlvbiBnZXRUZXJtaW5hbE91dHB1dCh0YzogVG9vbENhbGxTdGF0ZSkge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgJiYgdGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9IGdldFRlcm1pbmFsQ29udGVudCh0Yy5jb250ZW50KTtcblx0Y29uc3QgdGVybWluYWxSZXN1bHQgPSBnZXRUZXJtaW5hbENvbW1hbmRSZXN1bHQodGMpO1xuXHRjb25zdCBmYWxsYmFja1RleHQgPSB0Yy5jb250ZW50Py5maW5kKGlzVG9vbFJlc3VsdFRleHRDb250ZW50KT8udGV4dDtcblxuXHQvLyBBIHRydW5jYXRlZCBwcmV2aWV3IG9taXRzIHRoZSBjb21wbGV0aW9uIHRleHQgdGhhdCB0ZWxscyB0aGUgdXNlciB3aGVyZSB0aGUgZnVsbCBvdXRwdXQgd2FzIHNhdmVkLlxuXHQvLyBUT0RPOiBVc2UgYW4gU0RLIEFQSSBmb3IgdGhlIGxhcmdlLW91dHB1dCBmaWxlIHBhdGggaW5zdGVhZCBvZiByZWx5aW5nIG9uIHRoZSB0b29sIGNvbXBsZXRpb24gZGlzcGxheSB0ZXh0LlxuXHRsZXQgdGV4dCA9IHRlcm1pbmFsUmVzdWx0Py50cnVuY2F0ZWQgPT09IHRydWUgJiYgZmFsbGJhY2tUZXh0ICE9PSB1bmRlZmluZWRcblx0XHQ/IHN0cmlwTGVnYWN5VGVybWluYWxFeGl0TWFya2VycyhmYWxsYmFja1RleHQpXG5cdFx0OiB0ZXJtaW5hbFJlc3VsdD8ucHJldmlldztcblx0Y29uc3QgaGFzUmV0YWluZWROb25QdHlTbmFwc2hvdCA9IHRlcm1pbmFsQ29udGVudD8uaXNQdHkgPT09IGZhbHNlICYmIHRleHQgIT09IHVuZGVmaW5lZDtcblx0aWYgKHRleHQgPT09IHVuZGVmaW5lZCAmJiB0ZXJtaW5hbENvbnRlbnQ/LmlzUHR5ICE9PSBmYWxzZSkge1xuXHRcdHRleHQgPSBmYWxsYmFja1RleHQgPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHN0cmlwTGVnYWN5VGVybWluYWxFeGl0TWFya2VycyhmYWxsYmFja1RleHQpO1xuXHR9XG5cdGlmICh0ZXh0ID09PSB1bmRlZmluZWQgfHwgKCF0ZXh0ICYmICFoYXNSZXRhaW5lZE5vblB0eVNuYXBzaG90ICYmIHRlcm1pbmFsUmVzdWx0Py50cnVuY2F0ZWQgIT09IHRydWUpKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHJldHVybiB7XG5cdFx0dGV4dDogdGV4dC5yZXBsYWNlKC9cXHI/XFxuL2csICdcXHJcXG4nKSxcblx0XHQuLi4odGVybWluYWxSZXN1bHQ/LnRydW5jYXRlZCAhPT0gdW5kZWZpbmVkID8geyB0cnVuY2F0ZWQ6IHRlcm1pbmFsUmVzdWx0LnRydW5jYXRlZCB9IDoge30pLFxuXHR9O1xufVxuXG5mdW5jdGlvbiBzdHJpcExlZ2FjeVRlcm1pbmFsRXhpdE1hcmtlcnModGV4dDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIHRleHQucmVwbGFjZSgvPHNoZWxsSWQ6W14+XFxyXFxuXSpjb21wbGV0ZWQgd2l0aCBleGl0IGNvZGUgLT9cXGQrPlxccyokL2ksICcnKTtcbn1cblxuZnVuY3Rpb24gaXNUb29sUmVzdWx0VGV4dENvbnRlbnQoY29udGVudDogVG9vbFJlc3VsdENvbnRlbnQpOiBjb250ZW50IGlzIEV4dHJhY3Q8VG9vbFJlc3VsdENvbnRlbnQsIHsgdHlwZTogVG9vbFJlc3VsdENvbnRlbnRUeXBlLlRleHQgfT4ge1xuXHRyZXR1cm4gY29udGVudC50eXBlID09PSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDtcbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxDb21tYW5kU3RhdGUodGM6IFRvb2xDYWxsU3RhdGUsIGZhbGxiYWNrU3VjY2Vzcz86IGJvb2xlYW4pOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhWyd0ZXJtaW5hbENvbW1hbmRTdGF0ZSddIHwgdW5kZWZpbmVkIHtcblx0Y29uc3QgdGVybWluYWxSZXN1bHQgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmdcblx0XHQ/IGdldFRlcm1pbmFsQ29tbWFuZFJlc3VsdCh0Yylcblx0XHQ6IHVuZGVmaW5lZDtcblx0aWYgKHRlcm1pbmFsUmVzdWx0Py5leGl0Q29kZSAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHsgZXhpdENvZGU6IHRlcm1pbmFsUmVzdWx0LmV4aXRDb2RlIH07XG5cdH1cblx0aWYgKCh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpICYmIGdldFRlcm1pbmFsQ29udGVudCh0Yy5jb250ZW50KT8uaXNQdHkgPT09IGZhbHNlKSB7XG5cdFx0Ly8gQSBmYWlsZWQgU0RLIHNoZWxsIGNhbGwgZG9lcyBub3QgYWx3YXlzIGluY2x1ZGUgc2hlbGxfZXhpdCBjb250ZW50LlxuXHRcdC8vIFByZXNlcnZlIHRoYXQgZmFpbHVyZSBmb3IgZGVjb3JhdGlvbi9jb21wbGV0aW9uIHN0YXRlIHdpdGhvdXRcblx0XHQvLyBmYWJyaWNhdGluZyBhIHN1Y2Nlc3NmdWwgcHJvY2VzcyBleGl0IHdoZW4gbm9uZSB3YXMgcmVwb3J0ZWQuXG5cdFx0cmV0dXJuIGZhbGxiYWNrU3VjY2VzcyA9PT0gZmFsc2UgPyB7IGV4aXRDb2RlOiAxIH0gOiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIGZhbGxiYWNrU3VjY2VzcyA9PT0gdW5kZWZpbmVkID8gdW5kZWZpbmVkIDogeyBleGl0Q29kZTogZmFsbGJhY2tTdWNjZXNzID8gMCA6IDEgfTtcbn1cblxuZnVuY3Rpb24gaXNUb29sUmVzdWx0VGVybWluYWxDb250ZW50KGNvbnRlbnQ6IFRvb2xSZXN1bHRDb250ZW50KTogY29udGVudCBpcyBFeHRyYWN0PFRvb2xSZXN1bHRDb250ZW50LCB7IHR5cGU6IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbCB9PiB7XG5cdHJldHVybiBjb250ZW50LnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXJtaW5hbDtcbn1cblxuLyoqXG4gKiBTaGFwZSBvZiB0aGUgYHRlcm1pbmFsQ29tcGxldGVgIHRvb2wgcmVzdWx0IGJsb2NrIHRoYXQgQUhQIDAuNy4wIHJlbW92ZWRcbiAqIChpdHMgZGF0YSBtb3ZlZCBvbnRvIHRoZSB0ZXJtaW5hbCBibG9jayBhcyBgcmVzdWx0YCkuIE9sZCBwZXJzaXN0ZWQgdHVybnNcbiAqIG1heSBzdGlsbCBjYXJyeSBpdCwgc28gY29tcGxldGlvbiBkYXRhIGZhbGxzIGJhY2sgdG8gaXQuXG4gKi9cbmludGVyZmFjZSBJTGVnYWN5VGVybWluYWxDb21wbGV0ZUNvbnRlbnQge1xuXHR0eXBlOiAndGVybWluYWxDb21wbGV0ZSc7XG5cdGV4aXRDb2RlPzogbnVtYmVyO1xuXHRwcmV2aWV3Pzogc3RyaW5nO1xuXHR0cnVuY2F0ZWQ/OiBib29sZWFuO1xufVxuXG4vKipcbiAqIENvbXBsZXRpb24gZGF0YSBmb3IgYSB0ZXJtaW5hbC1zdHlsZSB0b29sIGNhbGw6IHRoZSB0ZXJtaW5hbCBibG9jaydzXG4gKiBgcmVzdWx0YCwgZmFsbGluZyBiYWNrIHRvIGEgbGVnYWN5IGB0ZXJtaW5hbENvbXBsZXRlYCBibG9jay5cbiAqL1xuZnVuY3Rpb24gZ2V0VGVybWluYWxDb21tYW5kUmVzdWx0KHRjOiB7IGNvbnRlbnQ/OiBUb29sUmVzdWx0Q29udGVudFtdIH0pOiBUZXJtaW5hbENvbW1hbmRSZXN1bHQgfCB1bmRlZmluZWQge1xuXHRjb25zdCByZXN1bHQgPSB0Yy5jb250ZW50Py5maW5kKGlzVG9vbFJlc3VsdFRlcm1pbmFsQ29udGVudCk/LnJlc3VsdDtcblx0aWYgKHJlc3VsdCkge1xuXHRcdHJldHVybiByZXN1bHQ7XG5cdH1cblx0cmV0dXJuIHRjLmNvbnRlbnQ/LmZpbmQoYyA9PiAoYyBhcyB7IHR5cGU6IHN0cmluZyB9KS50eXBlID09PSAndGVybWluYWxDb21wbGV0ZScpIGFzIElMZWdhY3lUZXJtaW5hbENvbXBsZXRlQ29udGVudCB8IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gZ2V0VGVybWluYWxMYW5ndWFnZSh0YzogVG9vbENhbGxTdGF0ZSkge1xuXHRyZXR1cm4gdGMudG9vbE5hbWUgPT09ICdwb3dlcnNoZWxsJyA/ICdwb3dlcnNoZWxsJyA6ICdzaGVsbHNjcmlwdCc7XG59XG5cbi8qKlxuICogVHJ1ZSBpZiB0aGlzIHRvb2wgY2FsbCBzaG91bGQgcmVuZGVyIGFzIGEgdGVybWluYWwgcGlsbCBpbiB0aGUgY2hhdCBVSS5cbiAqXG4gKiBDb21iaW5lcyB0aHJlZSBzaWduYWxzIHNvIHRoZSB3b3JrYmVuY2ggcmVuZGVycyBjb25zaXN0ZW50bHkgYWNyb3NzIGV2ZXJ5XG4gKiBzdGFnZSBvZiB0aGUgdG9vbCBsaWZlY3ljbGU6XG4gKlxuICogMS4gYGV4aXN0aW5nS2luZCA9PT0gJ3Rlcm1pbmFsJ2AgXHUyMDE0IHByZXNlcnZlIHRoZSBwcmlvciByZW5kZXIgZGVjaXNpb24gc28gYVxuICogICAgdG9vbCBhbHJlYWR5IHNldCB1cCBhcyB0ZXJtaW5hbCBzdGF5cyB0ZXJtaW5hbCBhY3Jvc3Mgc25hcHNob3RzLlxuICogMi4gYGdldFRvb2xLaW5kKHRjKSA9PT0gJ3Rlcm1pbmFsJ2Agd2l0aCBhIGNvbW1hbmQgYXZhaWxhYmxlIFx1MjAxNCB0aGVcbiAqICAgIGFsd2F5cy1hdmFpbGFibGUgYF9tZXRhLnRvb2xLaW5kYCBmbGFnIHNldCBieSB0aGUgZXZlbnQgbWFwcGVyIGZvclxuICogICAgYnVpbHQtaW4gYGJhc2hgL2Bwb3dlcnNoZWxsYCBTREsgdG9vbHMgdGhhdCBuZXZlciBlbWl0IGFcbiAqICAgIHtAbGluayBUb29sUmVzdWx0Q29udGVudFR5cGUuVGVybWluYWx9IGNvbnRlbnQgYmxvY2suIFdlIG9ubHkgcmVuZGVyIHRoZVxuICogICAgdGVybWluYWwgcGlsbCBvbmNlIHdlIGFjdHVhbGx5IGhhdmUgdGhlIGNvbW1hbmQgKGBnZXRUZXJtaW5hbElucHV0YCk6XG4gKiAgICByZW5kZXJpbmcgYSB0ZXJtaW5hbCBwaWxsIHdpdGggYW4gZW1wdHkgY29tbWFuZCBsaW5lIGxvb2tzIGJyb2tlbiwgc29cbiAqICAgIHVudGlsIHRoZSBjb21tYW5kIGFycml2ZXMgd2UgZmFsbCBiYWNrIHRvIHRoZSBnZW5lcmljIHRvb2wgd2lkZ2V0XG4gKiAgICAodGhlIGBpbnZvY2F0aW9uTWVzc2FnZWApLlxuICogMy4gQSBgVGVybWluYWxgIGNvbnRlbnQgYmxvY2sgaW4gYHRjLmNvbnRlbnRgIChSdW5uaW5nL0NvbXBsZXRlZCBvbmx5KSBcdTIwMTRcbiAqICAgIHRoZSBBSFAtc2lkZSBzaWduYWwgZm9yIHRoZSBjdXN0b20gdGVybWluYWwgdG9vbCAoYGFnZW50aG9zdC10ZXJtaW5hbDpgXG4gKiAgICBVUklzKS5cbiAqXG4gKiBXaXRob3V0ICgxKSB0aGUgbGl2ZSBpbnZvY2F0aW9uIHdvdWxkIHJhY2UgYWdhaW5zdCB0aGUgYXN5bmMgYXJyaXZhbCBvZiB0aGVcbiAqIFRlcm1pbmFsIGJsb2NrIHZpYSBgb25EaWRBc3NvY2lhdGVUZXJtaW5hbGAuXG4gKi9cbmZ1bmN0aW9uIGlzVGVybWluYWxUb29sQ2FsbCh0YzogVG9vbENhbGxTdGF0ZSwgZXhpc3RpbmdLaW5kPzogc3RyaW5nKTogYm9vbGVhbiB7XG5cdGlmIChleGlzdGluZ0tpbmQgPT09ICd0ZXJtaW5hbCcpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAoZ2V0VG9vbEtpbmQodGMpID09PSAndGVybWluYWwnICYmIGdldFRlcm1pbmFsSW5wdXQodGMpICE9PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gdHJ1ZTtcblx0fVxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nIHx8IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0cmV0dXJuICEhZ2V0VGVybWluYWxDb250ZW50VXJpKHRjLmNvbnRlbnQpO1xuXHR9XG5cdHJldHVybiBmYWxzZTtcbn1cblxuLyoqXG4gKiBCdWlsZCBhbiB7QGxpbmsgSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YX0gcGF5bG9hZCBmcm9tIGEgdG9vbC1jYWxsXG4gKiBzdGF0ZS4gU2luZ2xlIHNvdXJjZSBvZiB0cnV0aCBmb3IgdGhlIGZpdmUgcGxhY2VzIHRoYXQgbmVlZCB0byAocmUpY29tcHV0ZVxuICogdGhlIHRlcm1pbmFsIHBheWxvYWQ6IHBlbmRpbmcgY29uZmlybWF0aW9uLCBsaXZlIGNyZWF0ZSwgc3RyZWFtaW5nIHJlZnJlc2gsXG4gKiBmaW5hbGl6ZSwgYW5kIGhpc3RvcnkgcmVwbGF5LlxuICpcbiAqIEVhY2ggZmllbGQgZmFsbHMgYmFjayB0byBgZXhpc3RpbmdgIHNvIGNhbGxlcnMgY2FuIHJlLWNhbGwgb24gbGF0ZXJcbiAqIHNuYXBzaG90cyB3aXRob3V0IGxvc2luZyB2YWx1ZXMgdGhhdCBhcnJpdmVkIGVhcmxpZXIuIFRoaXMgaXMgY3JpdGljYWwgZm9yXG4gKiB0aGUgQUhQIGZpZWxkcyBgdGVybWluYWxUb29sU2Vzc2lvbklkYCAvIGB0ZXJtaW5hbENvbW1hbmRVcmlgLCB3aGljaFxuICogYF9yZXZpdmVUZXJtaW5hbElmTmVlZGVkYCBwb3B1bGF0ZXMgYXN5bmNocm9ub3VzbHkgb25jZSBhIFRlcm1pbmFsIGNvbnRlbnRcbiAqIGJsb2NrIGFycml2ZXMgXHUyMDE0IHJlZnJlc2hpbmcgZnJvbSBgdGNgIGFsb25lIHdvdWxkIGNsb2JiZXIgdGhlbSB3aGVuZXZlciB0aGVcbiAqIGJsb2NrIGhhc24ndCBsYW5kZWQgeWV0LlxuICpcbiAqIENvbXBsZXRpb24tb25seSBmaWVsZHMgKGUuZy4gYHRlcm1pbmFsQ29tbWFuZFN0YXRlYCkgYXJlIGxheWVyZWQgb24gdG9wIGJ5XG4gKiB0aGUgY2FsbGVyOyB0aGUgaGVscGVyIGlzIHN0YXR1cy1hZ25vc3RpYy5cbiAqL1xuZnVuY3Rpb24gYnVpbGRUZXJtaW5hbFRvb2xTcGVjaWZpY0RhdGEoXG5cdHRjOiBUb29sQ2FsbFN0YXRlLFxuXHRzZXNzaW9uUmVzb3VyY2U6IFVSSSxcblx0ZXhpc3Rpbmc/OiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhLFxuKTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB7XG5cdGNvbnN0IHRlcm1pbmFsQ29udGVudCA9ICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpXG5cdFx0PyBnZXRUZXJtaW5hbENvbnRlbnQodGMuY29udGVudClcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgdGVybWluYWxDb250ZW50VXJpID0gdGVybWluYWxDb250ZW50Py5yZXNvdXJjZTtcblx0Y29uc3QgbmV4dENvbW1hbmQgPSBnZXRUZXJtaW5hbElucHV0KHRjKTtcblx0Y29uc3QgY29tbWFuZExpbmUgPSBuZXh0Q29tbWFuZFxuXHRcdD8geyAuLi5leGlzdGluZz8uY29tbWFuZExpbmUsIG9yaWdpbmFsOiBuZXh0Q29tbWFuZCB9XG5cdFx0OiBleGlzdGluZz8uY29tbWFuZExpbmUgPz8geyBvcmlnaW5hbDogJycgfTtcblx0Y29uc3QgbmV4dE91dHB1dCA9IGdldFRlcm1pbmFsT3V0cHV0KHRjKTtcblx0Ly8gU3ByZWFkIGBleGlzdGluZ2Agc28gYW55IGZpZWxkIHNldCBieSBhIHByaW9yIHBhc3MgKG5vdGFibHkgdGhlXG5cdC8vIGFzeW5jLXBvcHVsYXRlZCBBSFAgZmllbGRzIGFuZCBhbnl0aGluZyB3ZSBkb24ndCBleHBsaWNpdGx5IGhhbmRsZSlcblx0Ly8gaXMgcHJlc2VydmVkIHVubGVzcyB3ZSBoYXZlIGEgZnJlc2ggdmFsdWUgdG8gb3ZlcnJpZGUgaXQgd2l0aC5cblx0cmV0dXJuIHtcblx0XHQuLi5leGlzdGluZyxcblx0XHRraW5kOiAndGVybWluYWwnLFxuXHRcdGNvbW1hbmRMaW5lLFxuXHRcdGludGVudGlvbjogdGMuaW50ZW50aW9uID8/IGV4aXN0aW5nPy5pbnRlbnRpb24sXG5cdFx0bGFuZ3VhZ2U6IGV4aXN0aW5nPy5sYW5ndWFnZSA/PyBnZXRUZXJtaW5hbExhbmd1YWdlKHRjKSxcblx0XHRhdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlOiByZWFkVG9vbENhbGxNZXRhKHRjKS5hdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlID8/IGV4aXN0aW5nPy5hdXRvQXBwcm92ZVJ1bGVSZXNvbHZhYmxlLFxuXHRcdHRlcm1pbmFsVG9vbFNlc3Npb25JZDogdGVybWluYWxDb250ZW50VXJpXG5cdFx0XHQ/IG1ha2VBaHBUZXJtaW5hbFRvb2xTZXNzaW9uSWQodGVybWluYWxDb250ZW50VXJpLCBzZXNzaW9uUmVzb3VyY2UpXG5cdFx0XHQ6IGV4aXN0aW5nPy50ZXJtaW5hbFRvb2xTZXNzaW9uSWQsXG5cdFx0dGVybWluYWxDb21tYW5kVXJpOiB0ZXJtaW5hbENvbnRlbnRVcmkgPyBVUkkucGFyc2UodGVybWluYWxDb250ZW50VXJpKSA6IGV4aXN0aW5nPy50ZXJtaW5hbENvbW1hbmRVcmksXG5cdFx0aXNQdHk6IHRlcm1pbmFsQ29udGVudD8uaXNQdHkgPz8gZXhpc3Rpbmc/LmlzUHR5LFxuXHRcdHRlcm1pbmFsQ29tbWFuZE91dHB1dDogbmV4dE91dHB1dCA/PyBleGlzdGluZz8udGVybWluYWxDb21tYW5kT3V0cHV0LFxuXHR9O1xufVxuXG5mdW5jdGlvbiBnZXRUb29sSW5wdXRPdXRwdXREZXRhaWxzKHRjOiBUb29sQ2FsbFN0YXRlLCBpc0Vycm9yOiBib29sZWFuLCBlcnJvclN0cmluZzogc3RyaW5nIHwgdW5kZWZpbmVkLCBpbmNsdWRlTWNwT3V0cHV0OiBib29sZWFuLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJVG9vbFJlc3VsdElucHV0T3V0cHV0RGV0YWlscyB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IHRvb2xJbnB1dCA9IHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nID8gdW5kZWZpbmVkIDogZ2V0SW5saW5lVG9vbElucHV0KHRjLnRvb2xJbnB1dCk7XG5cdGlmICghdG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IG91dHB1dDogSVRvb2xSZXN1bHRJbnB1dE91dHB1dERldGFpbHNbJ291dHB1dCddID0gW107XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRmb3IgKGNvbnN0IGJsb2NrIG9mIHRjLmNvbnRlbnQgPz8gW10pIHtcblx0XHRcdHN3aXRjaCAoYmxvY2sudHlwZSkge1xuXHRcdFx0XHRjYXNlIFRvb2xSZXN1bHRDb250ZW50VHlwZS5UZXh0OlxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ2VtYmVkJywgdmFsdWU6IGJsb2NrLnRleHQsIGlzVGV4dDogdHJ1ZSwgbWltZVR5cGU6ICd0ZXh0L3BsYWluJyB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdFx0Y2FzZSBUb29sUmVzdWx0Q29udGVudFR5cGUuRW1iZWRkZWRSZXNvdXJjZTpcblx0XHRcdFx0XHRvdXRwdXQucHVzaCh7IHR5cGU6ICdlbWJlZCcsIHZhbHVlOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfSk7XG5cdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdGNhc2UgVG9vbFJlc3VsdENvbnRlbnRUeXBlLlJlc291cmNlOlxuXHRcdFx0XHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ3JlZicsIHVyaTogd3JhcFJlc291cmNlVXJpKGJsb2NrLnVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSksIG1pbWVUeXBlOiBibG9jay5jb250ZW50VHlwZSB9KTtcblx0XHRcdFx0XHRicmVhaztcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRpZiAob3V0cHV0Lmxlbmd0aCA9PT0gMCAmJiBlcnJvclN0cmluZykge1xuXHRcdG91dHB1dC5wdXNoKHsgdHlwZTogJ2VtYmVkJywgdmFsdWU6IGVycm9yU3RyaW5nLCBpc1RleHQ6IHRydWUsIG1pbWVUeXBlOiAndGV4dC9wbGFpbicgfSk7XG5cdH1cblxuXHRyZXR1cm4ge1xuXHRcdGlucHV0OiB0b29sSW5wdXQsXG5cdFx0aW5wdXRMYW5ndWFnZTogJ2pzb24nLFxuXHRcdG91dHB1dCxcblx0XHRpc0Vycm9yLFxuXHRcdG1jcE91dHB1dDogaW5jbHVkZU1jcE91dHB1dCA/IHRvTWNwQ2FsbFRvb2xSZXN1bHQodGMsIGlzRXJyb3IsIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIG1pbmltYWwge0BsaW5rIE1DUC5DYWxsVG9vbFJlc3VsdH0gZnJvbSBhbiBhZ2VudC1ob3N0IHRvb2wgY2FsbCdzXG4gKiBjb250ZW50IGJsb2NrcyBzbyB0aGUgY2hhdCBNQ1AgQXBwIHdlYnZpZXcgY2FuIHJlY2VpdmUgYVxuICogYHVpL25vdGlmaWNhdGlvbnMvdG9vbC1yZXN1bHRgIG5vdGlmaWNhdGlvbiB3aXRoIHRoZSByZWFsIHRvb2wgb3V0cHV0XG4gKiAoc2VlIHtAbGluayBjaGF0TWNwQXBwTW9kZWx9KS4gQWdlbnQtaG9zdCB0b29sIGNvbXBsZXRpb25zIG9ubHkgY2Fycnkgb3VyXG4gKiBvd24gYWJzdHJhY3RlZCBjb250ZW50IHNoYXBlICh0aGUgcmF3IE1DUCByZXN1bHQgaXMgY29uc3VtZWQgYnkgdGhlXG4gKiBDb3BpbG90IENMSSdzIE1DUCBob3N0IGFuZCBuZXZlciBzdXJmYWNlcyBiYWNrIG92ZXIgdGhlIEFIUCksIHNvIHdlXG4gKiB0cmFuc2xhdGUgZWFjaCBBSFAgY29udGVudCBibG9jayBpbnRvIHRoZSBjbG9zZXN0IE1DUCBjb250ZW50IGJsb2NrOlxuICogIC0gYFRleHRgIFx1MjE5MiBgTUNQLlRleHRDb250ZW50YFxuICogIC0gYEVtYmVkZGVkUmVzb3VyY2VgIHdpdGggYW4gaW1hZ2UvYXVkaW8gTUlNRSBcdTIxOTIgYEltYWdlQ29udGVudGAvYEF1ZGlvQ29udGVudGBcbiAqICAtIGBFbWJlZGRlZFJlc291cmNlYCAob3RoZXIpIFx1MjE5MiBgRW1iZWRkZWRSZXNvdXJjZWAgd3JhcHBpbmcgYSBzeW50aGV0aWNcbiAqICAgIGBkYXRhOmAgVVJJIHNvIE1DUCdzIHJlc291cmNlIHNoYXBlIGlzIGhvbm9yZWRcbiAqICAtIGBSZXNvdXJjZWAgKGNvbnRlbnQgcmVmKSBcdTIxOTIgYFJlc291cmNlTGlua2AgdG8gdGhlIHJlZmVyZW5jZWQgVVJJXG4gKi9cbmZ1bmN0aW9uIHRvTWNwQ2FsbFRvb2xSZXN1bHQodGM6IFRvb2xDYWxsU3RhdGUsIGlzRXJyb3I6IGJvb2xlYW4sIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IE1DUC5DYWxsVG9vbFJlc3VsdCB8IHVuZGVmaW5lZCB7XG5cdGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCAmJiB0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGNvbnRlbnQ6IE1DUC5Db250ZW50QmxvY2tbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGJsb2NrIG9mIHRjLmNvbnRlbnQgPz8gW10pIHtcblx0XHRjb25zdCBtY3BCbG9jayA9IHRvTWNwQ29udGVudEJsb2NrKGJsb2NrLCBjb25uZWN0aW9uQXV0aG9yaXR5KTtcblx0XHRpZiAobWNwQmxvY2spIHtcblx0XHRcdGNvbnRlbnQucHVzaChtY3BCbG9jayk7XG5cdFx0fVxuXHR9XG5cdGlmIChjb250ZW50Lmxlbmd0aCA9PT0gMCAmJiAhaXNFcnJvcikge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0cmV0dXJuIHsgY29udGVudCwgaXNFcnJvcjogaXNFcnJvciB8fCB1bmRlZmluZWQgfTtcbn1cblxuZnVuY3Rpb24gdG9NY3BDb250ZW50QmxvY2soYmxvY2s6IFRvb2xSZXN1bHRDb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBNQ1AuQ29udGVudEJsb2NrIHwgdW5kZWZpbmVkIHtcblx0c3dpdGNoIChibG9jay50eXBlKSB7XG5cdFx0Y2FzZSBUb29sUmVzdWx0Q29udGVudFR5cGUuVGV4dDpcblx0XHRcdHJldHVybiB7IHR5cGU6ICd0ZXh0JywgdGV4dDogYmxvY2sudGV4dCB9O1xuXHRcdGNhc2UgVG9vbFJlc3VsdENvbnRlbnRUeXBlLkVtYmVkZGVkUmVzb3VyY2U6IHtcblx0XHRcdGlmIChibG9jay5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdpbWFnZS8nKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnaW1hZ2UnLCBkYXRhOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfTtcblx0XHRcdH1cblx0XHRcdGlmIChibG9jay5jb250ZW50VHlwZS5zdGFydHNXaXRoKCdhdWRpby8nKSkge1xuXHRcdFx0XHRyZXR1cm4geyB0eXBlOiAnYXVkaW8nLCBkYXRhOiBibG9jay5kYXRhLCBtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUgfTtcblx0XHRcdH1cblx0XHRcdHJldHVybiB7XG5cdFx0XHRcdHR5cGU6ICdyZXNvdXJjZScsXG5cdFx0XHRcdHJlc291cmNlOiB7XG5cdFx0XHRcdFx0dXJpOiBgZGF0YToke2Jsb2NrLmNvbnRlbnRUeXBlfTtiYXNlNjQsJHtibG9jay5kYXRhfWAsXG5cdFx0XHRcdFx0bWltZVR5cGU6IGJsb2NrLmNvbnRlbnRUeXBlLFxuXHRcdFx0XHRcdGJsb2I6IGJsb2NrLmRhdGEsXG5cdFx0XHRcdH0sXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRjYXNlIFRvb2xSZXN1bHRDb250ZW50VHlwZS5SZXNvdXJjZToge1xuXHRcdFx0Y29uc3Qgd3JhcHBlZCA9IHdyYXBSZXNvdXJjZVVyaShibG9jay51cmksIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0dHlwZTogJ3Jlc291cmNlX2xpbmsnLFxuXHRcdFx0XHRuYW1lOiBiYXNlbmFtZSh3cmFwcGVkKSB8fCB3cmFwcGVkLnRvU3RyaW5nKCksXG5cdFx0XHRcdHVyaTogd3JhcHBlZC50b1N0cmluZygpLFxuXHRcdFx0XHRtaW1lVHlwZTogYmxvY2suY29udGVudFR5cGUsXG5cdFx0XHR9O1xuXHRcdH1cblx0XHRkZWZhdWx0OlxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG4vKipcbiAqIFdyYXBzIGEgdG9vbC1yZXN1bHQgcmVzb3VyY2UgVVJJIChzdHJpbmcpIHZpYSB7QGxpbmsgdG9BZ2VudEhvc3RVcml9IHNvIGl0XG4gKiByZXNvbHZlcyB0aHJvdWdoIHRoZSBhZ2VudCBob3N0IGZpbGVzeXN0ZW0gcHJvdmlkZXIgb24gdGhlIGNsaWVudC4gVGhlXG4gKiB1bmRlcmx5aW5nIGhlbHBlciBoYXMgYSBmYXN0LXBhdGggdGhhdCByZXR1cm5zIHRoZSBVUkkgdW5jaGFuZ2VkIHdoZW4gaXQnc1xuICogYWxyZWFkeSBhIGxvY2FsIGBmaWxlOi8vYCByZXNvdXJjZSwgc28gdGhlIHdyYXAgaXMgc2FmZSBmb3IgYWxsIGNhc2VzLlxuICovXG5mdW5jdGlvbiB3cmFwUmVzb3VyY2VVcmkodXJpOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IFVSSSB7XG5cdHJldHVybiB0b0FnZW50SG9zdFVyaShVUkkucGFyc2UodXJpKSwgY29ubmVjdGlvbkF1dGhvcml0eSk7XG59XG5cbmZ1bmN0aW9uIGdldFRvb2xFcnJvclN0cmluZyh0YzogVG9vbENhbGxTdGF0ZSk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdHJldHVybiB0Yy5lcnJvcj8ubWVzc2FnZTtcblx0fVxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQpIHtcblx0XHRyZXR1cm4gdHlwZW9mIHRjLnJlYXNvbk1lc3NhZ2UgPT09ICdzdHJpbmcnID8gdGMucmVhc29uTWVzc2FnZSA6IHRjLnJlYXNvbk1lc3NhZ2U/Lm1hcmtkb3duO1xuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG5cbi8qKlxuICogQnVpbGRzIHRoZSBgc2Vzc2lvbkNyZWF0ZWRgIHRvb2wtc3BlY2lmaWMgZGF0YSBmb3IgYSBjb21wbGV0ZWQsIHN1Y2Nlc3NmdWxcbiAqIHNlc3Npb24tY29vcmRpbmF0aW9uIHRvb2wgY2FsbCBieSByZWNvdmVyaW5nIGl0cyBvcGVuLXNlc3Npb24gbGluay5cbiAqL1xuZnVuY3Rpb24gYnVpbGRTZXNzaW9uQ3JlYXRlZFRvb2xEYXRhKHRjOiBUb29sQ2FsbFN0YXRlKTogSUNoYXRTZXNzaW9uQ3JlYXRlZERhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgIXRjLnN1Y2Nlc3MpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGNvbnN0IGlzU2VuZCA9IGlzU2VuZE1lc3NhZ2VUb29sKHRjLnRvb2xOYW1lKTtcblx0aWYgKCFpc0NyZWF0ZVNlc3Npb25Ub29sKHRjLnRvb2xOYW1lKSAmJiAhaXNDcmVhdGVDaGF0VG9vbCh0Yy50b29sTmFtZSkgJiYgIWlzU2VuZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0cHV0ID0gZ2V0VG9vbE91dHB1dFRleHQodGMpO1xuXHRjb25zdCBtYXRjaCA9IG91dHB1dD8ubWF0Y2goL2FnZW50LWhvc3Qtc2Vzc2lvbjpcXC9cXC9bXlxccyk8PjtcIiddKy8pO1xuXHRjb25zdCBvcGVuTGluayA9IG1hdGNoPy5bMF07XG5cdGNvbnN0IGJhY2tlbmQgPSBvcGVuTGluayA/IHBhcnNlT3BlblNlc3Npb25MaW5rVXJpKG9wZW5MaW5rKSA6IHVuZGVmaW5lZDtcblx0aWYgKCFvcGVuTGluayB8fCAhYmFja2VuZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Ly8gQSBjaGF0LXNjb3BlZCBsaW5rIChjcmVhdGVfY2hhdCwgb3Igc2VuZF9tZXNzYWdlIHRhcmdldGluZyBhIHNwZWNpZmljIGNoYXQpXG5cdC8vIHNob3dzIHRoZSBjb252ZXJzYXRpb24gaWNvbjsgYSBzZXNzaW9uLXNjb3BlZCBsaW5rIHNob3dzIHRoZSBhZ2VudCBpY29uLlxuXHRjb25zdCBpc0NoYXQgPSBpc0NyZWF0ZUNoYXRUb29sKHRjLnRvb2xOYW1lKSB8fCAoaXNTZW5kICYmICEhcGFyc2VPcGVuU2Vzc2lvbkxpbmtDaGF0SWQob3BlbkxpbmspKTtcblx0Y29uc3QgbGFiZWwgPSBjcmVhdGVTZXNzaW9uVGl0bGVGcm9tQXJncyhnZXRJbmxpbmVUb29sSW5wdXQodGMudG9vbElucHV0KSkgPz8gKGJhY2tlbmQucGF0aC5yZXBsYWNlKC9eXFwvLywgJycpIHx8IGJhY2tlbmQudG9TdHJpbmcoKSk7XG5cdHJldHVybiB7IGtpbmQ6ICdzZXNzaW9uQ3JlYXRlZCcsIG9wZW5MaW5rLCBsYWJlbCwgaXNDaGF0IH07XG59XG5cbmZ1bmN0aW9uIGJ1aWxkR2VuZXJhdGVkSW1hZ2VUb29sRGF0YSh0YzogVG9vbENhbGxTdGF0ZSk6IElDaGF0R2VuZXJhdGVkSW1hZ2VEYXRhIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkIHx8ICF0Yy5zdWNjZXNzIHx8IHRjLnRvb2xOYW1lICE9PSBpbWFnZUdlbmVyYXRpb25Ub29sTmFtZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgaGFzSW1hZ2UgPSB0Yy5jb250ZW50Py5zb21lKGJsb2NrID0+IGJsb2NrLnR5cGUgPT09IFRvb2xSZXN1bHRDb250ZW50VHlwZS5FbWJlZGRlZFJlc291cmNlXG5cdFx0JiYgYmxvY2suY29udGVudFR5cGUuc3RhcnRzV2l0aCgnaW1hZ2UvJylcblx0XHQmJiBibG9jay5kYXRhLmxlbmd0aCA+IDApO1xuXHRyZXR1cm4gaGFzSW1hZ2UgPyB7IGtpbmQ6ICdnZW5lcmF0ZWRJbWFnZScgfSA6IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gYnVpbGRBdXRvbWF0aW9uQ29uZmlndXJlZFRvb2xEYXRhKHRjOiBUb29sQ2FsbFN0YXRlKTogSUNoYXRBdXRvbWF0aW9uQ29uZmlndXJlZERhdGEgfCB1bmRlZmluZWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgfHwgIXRjLnN1Y2Nlc3MgfHwgdGMudG9vbE5hbWUgIT09IENvbmZpZ3VyZUF1dG9tYXRpb25Ub29sUmVmZXJlbmNlTmFtZSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgb3V0cHV0ID0gZ2V0VG9vbE91dHB1dFRleHQodGMpO1xuXHRpZiAoIW91dHB1dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0dHJ5IHtcblx0XHRjb25zdCBwYXJzZWQgPSBKU09OLnBhcnNlKG91dHB1dCkgYXMgeyBzdGF0dXM/OiB1bmtub3duOyBhdXRvbWF0aW9uPzogeyBpZD86IHVua25vd247IG5hbWU/OiB1bmtub3duIH0gfTtcblx0XHRjb25zdCBvcGVyYXRpb24gPSBwYXJzZWQuc3RhdHVzID09PSAnY3JlYXRlZCcgfHwgcGFyc2VkLnN0YXR1cyA9PT0gJ3VwZGF0ZWQnID8gcGFyc2VkLnN0YXR1cyA6IHVuZGVmaW5lZDtcblx0XHRpZiAoIW9wZXJhdGlvbiB8fCB0eXBlb2YgcGFyc2VkLmF1dG9tYXRpb24/LmlkICE9PSAnc3RyaW5nJyB8fCB0eXBlb2YgcGFyc2VkLmF1dG9tYXRpb24ubmFtZSAhPT0gJ3N0cmluZycpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAnYXV0b21hdGlvbkNvbmZpZ3VyZWQnLFxuXHRcdFx0YXV0b21hdGlvbklkOiBwYXJzZWQuYXV0b21hdGlvbi5pZCxcblx0XHRcdGF1dG9tYXRpb25OYW1lOiBwYXJzZWQuYXV0b21hdGlvbi5uYW1lLFxuXHRcdFx0b3BlcmF0aW9uLFxuXHRcdH07XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuLyoqXG4gKiBEZXJpdmVzIGEgdGl0bGUgZm9yIHRoZSBcIk9wZW4gU2Vzc2lvblwiIGJ1dHRvbiBmcm9tIGEgc2Vzc2lvbiB0b29sJ3MgYXJndW1lbnRzIFx1MjAxNFxuICogdGhlIGBwcm9tcHRgIChjcmVhdGVfc2Vzc2lvbi9jcmVhdGVfY2hhdCkgb3IgYG1lc3NhZ2VgIChzZW5kX21lc3NhZ2UpIGl0IHdhc1xuICogc3RhcnRlZCB3aXRoLCB0cmltbWVkIHRvIG9uZSBsaW5lLlxuICovXG5mdW5jdGlvbiBjcmVhdGVTZXNzaW9uVGl0bGVGcm9tQXJncyh0b29sSW5wdXQ6IHN0cmluZyB8IHVuZGVmaW5lZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmICghdG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHR0cnkge1xuXHRcdGNvbnN0IGFyZ3MgPSBKU09OLnBhcnNlKHRvb2xJbnB1dCkgYXMgeyBwcm9tcHQ/OiB1bmtub3duOyBtZXNzYWdlPzogdW5rbm93biB9O1xuXHRcdGNvbnN0IHRleHQgPSB0eXBlb2YgYXJncy5wcm9tcHQgPT09ICdzdHJpbmcnID8gYXJncy5wcm9tcHQgOiAodHlwZW9mIGFyZ3MubWVzc2FnZSA9PT0gJ3N0cmluZycgPyBhcmdzLm1lc3NhZ2UgOiB1bmRlZmluZWQpO1xuXHRcdGlmICh0ZXh0ID09PSB1bmRlZmluZWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IGZpcnN0TGluZSA9IHRleHQudHJpbSgpLnNwbGl0KCdcXG4nKVswXS50cmltKCk7XG5cdFx0aWYgKCFmaXJzdExpbmUpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiBmaXJzdExpbmUubGVuZ3RoID4gNjAgPyBgJHtmaXJzdExpbmUuc2xpY2UoMCwgNTcpfVx1MjAyNmAgOiBmaXJzdExpbmU7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cbn1cblxuZnVuY3Rpb24gY29tcGxldGVkVG9vbENhbGxDb25maXJtZWRSZWFzb24odGM6IElDb21wbGV0ZWRUb29sQ2FsbCk6IE5vbk51bGxhYmxlPElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkWydpc0NvbmZpcm1lZCddPiB7XG5cdGlmICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCkge1xuXHRcdHJldHVybiB7IHR5cGU6IFRvb2xDb25maXJtS2luZC5Db25maXJtYXRpb25Ob3ROZWVkZWQgfTtcblx0fVxuXG5cdHJldHVybiB7IHR5cGU6IHRjLnJlYXNvbiA9PT0gVG9vbENhbGxDYW5jZWxsYXRpb25SZWFzb24uU2tpcHBlZCA/IFRvb2xDb25maXJtS2luZC5Ta2lwcGVkIDogVG9vbENvbmZpcm1LaW5kLkRlbmllZCB9O1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgY29tcGxldGVkIHRvb2wgY2FsbCBmcm9tIHRoZSBwcm90b2NvbCBzdGF0ZSBpbnRvIGEgc2VyaWFsaXplZFxuICogdG9vbCBpbnZvY2F0aW9uIHN1aXRhYmxlIGZvciBoaXN0b3J5IHJlcGxheS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGNvbXBsZXRlZFRvb2xDYWxsVG9TZXJpYWxpemVkKHRjOiBJQ29tcGxldGVkVG9vbENhbGwsIHN1YkFnZW50SW52b2NhdGlvbklkOiBzdHJpbmcgfCB1bmRlZmluZWQsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCB7XG5cdGNvbnN0IGlzVGVybWluYWwgPSBpc1Rlcm1pbmFsVG9vbENhbGwodGMpO1xuXHRjb25zdCBpc1N1Y2Nlc3MgPSB0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCAmJiB0Yy5zdWNjZXNzO1xuXHRsZXQgaW52b2NhdGlvbk1zZyA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5pbnZvY2F0aW9uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gdGMuZGlzcGxheU5hbWU7XG5cblx0Ly8gQ2hlY2sgZm9yIHN1YmFnZW50IGNvbnRlbnRcblx0Y29uc3Qgc3ViYWdlbnRDb250ZW50ID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQgPyBnZXRUb29sU3ViYWdlbnRDb250ZW50KHRjKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgaXNTdWJhZ2VudCA9IHN1YmFnZW50Q29udGVudCB8fCBpc1N1YmFnZW50VG9vbCh0Yyk7XG5cdGlmIChpc1N1YmFnZW50ICYmIHRjLnN0YXR1cyA9PT0gVG9vbENhbGxTdGF0dXMuQ29tcGxldGVkKSB7XG5cdFx0Y29uc3QgcmVzdWx0VGV4dCA9IGdldFRvb2xPdXRwdXRUZXh0KHRjKTtcblx0XHRjb25zdCBwYXN0VGVuc2VNc2cgPSBpc1N1Y2Nlc3Ncblx0XHRcdD8gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnBhc3RUZW5zZU1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpID8/IGludm9jYXRpb25Nc2dcblx0XHRcdDogaW52b2NhdGlvbk1zZztcblx0XHRyZXR1cm4ge1xuXHRcdFx0a2luZDogJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcsXG5cdFx0XHR0b29sQ2FsbElkOiB0Yy50b29sQ2FsbElkLFxuXHRcdFx0dG9vbElkOiB0Yy50b29sTmFtZSxcblx0XHRcdHNvdXJjZTogVG9vbERhdGFTb3VyY2UuSW50ZXJuYWwsXG5cdFx0XHRpbnZvY2F0aW9uTWVzc2FnZTogaW52b2NhdGlvbk1zZyxcblx0XHRcdG9yaWdpbk1lc3NhZ2U6IHVuZGVmaW5lZCxcblx0XHRcdHBhc3RUZW5zZU1lc3NhZ2U6IHBhc3RUZW5zZU1zZyxcblx0XHRcdGlzQ29uZmlybWVkOiBjb21wbGV0ZWRUb29sQ2FsbENvbmZpcm1lZFJlYXNvbih0YyksXG5cdFx0XHRpc0NvbXBsZXRlOiB0cnVlLFxuXHRcdFx0cHJlc2VudGF0aW9uOiB1bmRlZmluZWQsXG5cdFx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0XHR0b29sU3BlY2lmaWNEYXRhOiB7XG5cdFx0XHRcdGtpbmQ6ICdzdWJhZ2VudCcsXG5cdFx0XHRcdGRlc2NyaXB0aW9uOiBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YykgPz8gdGMuZGlzcGxheU5hbWUsXG5cdFx0XHRcdGFnZW50TmFtZTogc3ViYWdlbnRDb250ZW50Py5hZ2VudE5hbWUgPz8gZ2V0U3ViYWdlbnRBZ2VudE5hbWUodGMpLFxuXHRcdFx0XHRyZXN1bHQ6IHJlc3VsdFRleHQsXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogZ2V0U3ViYWdlbnRDaGF0UmVzb3VyY2UodGMsIHN1YmFnZW50Q29udGVudCwgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdH0sXG5cdFx0fTtcblx0fVxuXG5cdGxldCB0b29sU3BlY2lmaWNEYXRhOiBJQ2hhdFRlcm1pbmFsVG9vbEludm9jYXRpb25EYXRhIHwgSUNoYXRTZWFyY2hUb29sSW52b2NhdGlvbkRhdGEgfCBJQ2hhdFRvb2xJbnB1dEludm9jYXRpb25EYXRhIHwgSUNoYXRTZXNzaW9uQ3JlYXRlZERhdGEgfCBJQ2hhdEdlbmVyYXRlZEltYWdlRGF0YSB8IElDaGF0QXV0b21hdGlvbkNvbmZpZ3VyZWREYXRhIHwgdW5kZWZpbmVkO1xuXHRpZiAoaXNUZXJtaW5hbCkge1xuXHRcdHRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHQuLi5idWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiBnZXRUZXJtaW5hbENvbW1hbmRTdGF0ZSh0YywgaXNTdWNjZXNzKSxcblx0XHR9O1xuXHR9IGVsc2UgaWYgKGdldFRvb2xLaW5kKHRjKSA9PT0gJ3NlYXJjaCcpIHtcblx0XHR0b29sU3BlY2lmaWNEYXRhID0geyBraW5kOiAnc2VhcmNoJyB9O1xuXHR9IGVsc2Uge1xuXHRcdHRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZFNlc3Npb25DcmVhdGVkVG9vbERhdGEodGMpID8/IGJ1aWxkR2VuZXJhdGVkSW1hZ2VUb29sRGF0YSh0YykgPz8gYnVpbGRBdXRvbWF0aW9uQ29uZmlndXJlZFRvb2xEYXRhKHRjKTtcblx0XHRpZiAoIXRvb2xTcGVjaWZpY0RhdGEpIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZE1jcEFwcFRvb2xJbnB1dERhdGEodGMsIHNlc3Npb25SZXNvdXJjZSk7XG5cdFx0fVxuXHR9XG5cblx0bGV0IHBhc3RUZW5zZU1zZyA9IGlzU3VjY2Vzc1xuXHRcdD8gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnBhc3RUZW5zZU1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpID8/IGludm9jYXRpb25Nc2dcblx0XHQ6IGludm9jYXRpb25Nc2c7XG5cdC8vIFRvb2xzIHRoYXQgcmVuZGVyIGEgYmVzcG9rZSwgY2xpZW50LWF1dGhvcmVkIG1lc3NhZ2Ugb3ZlcnJpZGUgYm90aCB0aGVcblx0Ly8gaW52b2NhdGlvbiBhbmQgcGFzdC10ZW5zZSB0ZXh0IGhlcmUuIEFkZCBuZXcgcGVyLXRvb2wgY2FzZXMgYWxvbmdzaWRlLlxuXHRpZiAoaXNBZGRDb21tZW50VG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRjb25zdCByZWYgPSBhZGRDb21tZW50UmVmZXJlbmNlKHRjKTtcblx0XHRpZiAocmVmKSB7XG5cdFx0XHRpbnZvY2F0aW9uTXNnID0gcmVmO1xuXHRcdFx0cGFzdFRlbnNlTXNnID0gcmVmO1xuXHRcdH1cblx0fVxuXHRjb25zdCByZXN1bHREZXRhaWxzID0gKCF0b29sU3BlY2lmaWNEYXRhIHx8IHRvb2xTcGVjaWZpY0RhdGEua2luZCA9PT0gJ2dlbmVyYXRlZEltYWdlJyB8fCB0b29sU3BlY2lmaWNEYXRhLmtpbmQgPT09ICdpbnB1dCcgJiYgdG9vbFNwZWNpZmljRGF0YS5tY3BBcHBEYXRhKVxuXHRcdCYmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLkNvbXBsZXRlZCB8fCBnZXRUb29sRmlsZUVkaXRzKHRjKS5sZW5ndGggPT09IDApXG5cdFx0PyBnZXRUb29sSW5wdXRPdXRwdXREZXRhaWxzKHRjLCAhaXNTdWNjZXNzLCBnZXRUb29sRXJyb3JTdHJpbmcodGMpLCAhISh0b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnICYmIHRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YSksIGNvbm5lY3Rpb25BdXRob3JpdHkpXG5cdFx0OiB1bmRlZmluZWQ7XG5cblx0cmV0dXJuIHtcblx0XHRraW5kOiAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyxcblx0XHR0b29sQ2FsbElkOiB0Yy50b29sQ2FsbElkLFxuXHRcdHRvb2xJZDogdGMudG9vbE5hbWUsXG5cdFx0c291cmNlOiBUb29sRGF0YVNvdXJjZS5JbnRlcm5hbCxcblx0XHRpbnZvY2F0aW9uTWVzc2FnZTogaW52b2NhdGlvbk1zZyxcblx0XHRvcmlnaW5NZXNzYWdlOiB1bmRlZmluZWQsXG5cdFx0cGFzdFRlbnNlTWVzc2FnZTogaXNUZXJtaW5hbCA/IHVuZGVmaW5lZCA6IHBhc3RUZW5zZU1zZyxcblx0XHRpc0NvbmZpcm1lZDogY29tcGxldGVkVG9vbENhbGxDb25maXJtZWRSZWFzb24odGMpLFxuXHRcdGlzQ29tcGxldGU6IHRydWUsXG5cdFx0cHJlc2VudGF0aW9uOiBzaG91bGRIaWRlQ29tcGxldGVkQWdlbnRIb3N0QXNrVXNlclRvb2wodGMpID8gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZSA6IHVuZGVmaW5lZCxcblx0XHRzdWJBZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdFx0dG9vbFNwZWNpZmljRGF0YSxcblx0XHRyZXN1bHREZXRhaWxzLFxuXHR9O1xufVxuXG4vKipcbiAqIEJ1aWxkcyB7QGxpbmsgSUNoYXRFeHRlcm5hbEVkaXR9IHByb2dyZXNzIHBhcnRzIGZvciBhIGNvbXBsZXRlZCB0b29sIGNhbGxcbiAqIHRoYXQgcHJvZHVjZWQgZmlsZSBlZGl0cy4gUmV0dXJucyBhbiBlbXB0eSBhcnJheSBpZiB0aGUgdG9vbCBjYWxsIGhhcyBub1xuICogZWRpdHMuIEVhY2ggZW1pdHRlZCBwYXJ0IGNhcnJpZXMgdGhlIFVSSSwgZWRpdCBraW5kLCBiZWZvcmUvYWZ0ZXIgY29udGVudFxuICogVVJJcywgYW5kIHRoZSBkaWZmIHN0YXRzIGFscmVhZHkga25vd24gZnJvbSB0aGUgYWdlbnQgaG9zdCBwcm90b2NvbCBcdTIwMTRcbiAqIGRvd25zdHJlYW0gcmVuZGVyaW5nIGNhbiBwcm9kdWNlIGEgc3RhdGljIFwiZWRpdCBwaWxsXCIgd2l0aG91dCByZS1kZXJpdmluZ1xuICogYW55IG9mIHRoaXMgZnJvbSBhbiBlZGl0aW5nIHNlc3Npb24uXG4gKlxuICogYGNvbm5lY3Rpb25BdXRob3JpdHlgIGlzIHJlcXVpcmVkIHNvIGFsbCBlbWl0dGVkIFVSSXMgYXJlIHdyYXBwZWQgdmlhXG4gKiB7QGxpbmsgdG9BZ2VudEhvc3RVcml9OyBvdGhlcndpc2UgdGhlIGNoYXQgc2Vzc2lvbiB3b3VsZCByZWNlaXZlIHJhd1xuICogcmVtb3RlIFVSSXMgdGhhdCBpdHMgZmlsZSBzeXN0ZW0gcHJvdmlkZXJzIGNhbm5vdCByZXNvbHZlLlxuICovXG5leHBvcnQgZnVuY3Rpb24gY29tcGxldGVkVG9vbENhbGxUb0VkaXRQYXJ0cyh0YzogSUNvbXBsZXRlZFRvb2xDYWxsLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdFByb2dyZXNzW10ge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgZmlsZUVkaXRzID0gZ2V0VG9vbEZpbGVFZGl0cyh0Yyk7XG5cdGlmIChmaWxlRWRpdHMubGVuZ3RoID09PSAwKSB7XG5cdFx0cmV0dXJuIFtdO1xuXHR9XG5cdGNvbnN0IHBhcnRzOiBJQ2hhdFByb2dyZXNzW10gPSBbXTtcblx0Zm9yIChjb25zdCBlZGl0IG9mIGZpbGVFZGl0cykge1xuXHRcdGNvbnN0IHBhcnQgPSBmaWxlRWRpdFRvRXh0ZXJuYWxFZGl0KGVkaXQsIHRjLnRvb2xDYWxsSWQsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRcdGlmIChwYXJ0KSB7XG5cdFx0XHRwYXJ0cy5wdXNoKHBhcnQpO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gcGFydHM7XG59XG5cbi8qKlxuICogVHJhbnNsYXRlcyBhIHNpbmdsZSBwcm90b2NvbCB7QGxpbmsgRmlsZUVkaXR9IHJlY29yZCBpbnRvIHRoZVxuICoge0BsaW5rIElDaGF0RXh0ZXJuYWxFZGl0fSBwcm9ncmVzcyBwYXJ0IHJlbmRlcmVkIGFzIGFuIGVkaXQgcGlsbC4gQWxsXG4gKiBVUklzIGFyZSB3cmFwcGVkIHRocm91Z2gge0BsaW5rIHRvQWdlbnRIb3N0VXJpfSBzbyB0aGF0IHJlbW90ZS1yZXNvdXJjZVxuICogbG9va3VwcyByZXNvbHZlIHRocm91Z2ggdGhlIGFnZW50IGhvc3QgZmlsZSBzeXN0ZW0gcHJvdmlkZXIuXG4gKi9cbmZ1bmN0aW9uIGZpbGVFZGl0VG9FeHRlcm5hbEVkaXQoZWRpdDogRmlsZUVkaXQsIHVuZG9TdG9wSWQ6IHN0cmluZywgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSUNoYXRFeHRlcm5hbEVkaXQgfCB1bmRlZmluZWQge1xuXHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplRmlsZUVkaXQoZWRpdCk7XG5cdGlmICghbm9ybWFsaXplZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgZGlmZiA9IGVkaXQuZGlmZiAmJiAoZWRpdC5kaWZmLmFkZGVkICE9PSB1bmRlZmluZWQgfHwgZWRpdC5kaWZmLnJlbW92ZWQgIT09IHVuZGVmaW5lZClcblx0XHQ/IHsgYWRkZWQ6IGVkaXQuZGlmZi5hZGRlZCA/PyAwLCByZW1vdmVkOiBlZGl0LmRpZmYucmVtb3ZlZCA/PyAwIH1cblx0XHQ6IHVuZGVmaW5lZDtcblx0cmV0dXJuIHtcblx0XHRraW5kOiAnZXh0ZXJuYWxFZGl0Jyxcblx0XHR1cmk6IHRvQWdlbnRIb3N0VXJpKG5vcm1hbGl6ZWQucmVzb3VyY2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdGVkaXRLaW5kOiBub3JtYWxpemVkLmtpbmQgYXMgQ2hhdEV4dGVybmFsRWRpdEtpbmQsXG5cdFx0b3JpZ2luYWxVcmk6IG5vcm1hbGl6ZWQua2luZCA9PT0gRmlsZUVkaXRLaW5kLlJlbmFtZSAmJiBub3JtYWxpemVkLmJlZm9yZVVyaSA/IHRvQWdlbnRIb3N0VXJpKG5vcm1hbGl6ZWQuYmVmb3JlVXJpLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA6IHVuZGVmaW5lZCxcblx0XHRiZWZvcmVDb250ZW50VXJpOiBub3JtYWxpemVkLmJlZm9yZUNvbnRlbnRVcmkgPyB0b0FnZW50SG9zdFVyaShub3JtYWxpemVkLmJlZm9yZUNvbnRlbnRVcmksIGNvbm5lY3Rpb25BdXRob3JpdHkpIDogdW5kZWZpbmVkLFxuXHRcdGFmdGVyQ29udGVudFVyaTogbm9ybWFsaXplZC5hZnRlckNvbnRlbnRVcmkgPyB0b0FnZW50SG9zdFVyaShub3JtYWxpemVkLmFmdGVyQ29udGVudFVyaSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdFx0ZGlmZixcblx0XHR1bmRvU3RvcElkLFxuXHR9O1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSBsaXZlIHtAbGluayBDaGF0VG9vbEludm9jYXRpb259IGZyb20gdGhlIHByb3RvY29sJ3MgdG9vbC1jYWxsXG4gKiBzdGF0ZS4gVXNlZCBkdXJpbmcgYWN0aXZlIHR1cm5zIHRvIHJlcHJlc2VudCBydW5uaW5nIHRvb2wgY2FsbHMgaW4gdGhlIFVJLlxuICovXG4vKipcbiAqIFVSSSBzY2hlbWVzIHRoYXQgc2hvdWxkIE5PVCBiZSByZXdyaXR0ZW4gd2hlbiB0aGV5IGFwcGVhciBpbnNpZGUgbWFya2Rvd25cbiAqIGxpbmtzIHJlY2VpdmVkIGZyb20gYSByZW1vdGUgYWdlbnQgaG9zdC4gVGhlc2UgYXJlIGxpbmtzIHRoYXQgYXJlXG4gKiBtZWFuaW5nZnVsIG91dHNpZGUgdGhlIGFnZW50IGhvc3QncyB3b3Jrc3BhY2UgKGUuZy4gd2ViIGxpbmtzLCBWUyBDb2RlXG4gKiBjb21tYW5kcykgb3IgYXJlIGFscmVhZHkgd3JhcHBlZCBpbiB0aGUgYWdlbnQtaG9zdCBzY2hlbWUuXG4gKi9cbmNvbnN0IEVYVEVSTkFMX0xJTktfU0NIRU1FUzogUmVhZG9ubHlTZXQ8c3RyaW5nPiA9IG5ldyBTZXQoW1xuXHQnaHR0cCcsXG5cdCdodHRwcycsXG5cdCdtYWlsdG8nLFxuXHQnd3MnLFxuXHQnd3NzJyxcblx0J2Z0cCcsXG5cdCdmdHBzJyxcblx0J2RhdGEnLFxuXHQnYmxvYicsXG5cdCdqYXZhc2NyaXB0Jyxcblx0J2NvbW1hbmQnLFxuXHQndnNjb2RlJyxcblx0J3ZzY29kZS1pbnNpZGVycycsXG5cdFNjaGVtYXMudnNjb2RlQnJvd3Nlcixcblx0J2NvcGlsb3Qtc2tpbGwnLFxuXHRwcm9kdWN0LnVybFByb3RvY29sLFxuXHRBR0VOVF9IT1NUX1NDSEVNRSxcbl0pO1xuXG4vKipcbiAqIFJld3JpdGVzIGlubGluZSBtYXJrZG93biBsaW5rIFVSSXMgc28gdGhhdCBub24tZXh0ZXJuYWwgc2NoZW1lcyBhcmUgd3JhcHBlZFxuICogaW4gdGhlIGB2c2NvZGUtYWdlbnQtaG9zdDovL2Agc2NoZW1lLCBtaXJyb3Jpbmcge0BsaW5rIHRvQWdlbnRIb3N0VXJpfS5cbiAqIFRoaXMgYWxsb3dzIGxpbmtzIGluIG1hcmtkb3duIGNvbnRlbnQgc3RyZWFtZWQgZnJvbSBhIHJlbW90ZSBhZ2VudCBob3N0XG4gKiAoZS5nLiBgZmlsZTovLy8uLi5gIG9yIGBhZ2VudGhvc3QtY29udGVudDovLy8uLi5gKSB0byByZXNvbHZlIGNvcnJlY3RseSBvblxuICogdGhlIGNsaWVudCB0aHJvdWdoIHRoZSBhZ2VudCBob3N0IGZpbGVzeXN0ZW0gcHJvdmlkZXIuXG4gKlxuICogTGlua3Mgd2l0aCBleHRlcm5hbCBzY2hlbWVzIChodHRwLCBodHRwcywgbWFpbHRvLCBjb21tYW5kLCBldGMuKSBhbmRcbiAqIHJlbGF0aXZlL2FuY2hvci1vbmx5IGxpbmtzIHdpdGhvdXQgYSBzY2hlbWUgYXJlIHByZXNlcnZlZCBhcy1pcy4gVGhlXG4gKiBtYXJrZG93biBpcyBwYXJzZWQgd2l0aCBtYXJrZWQgYW5kIGVhY2ggYGxpbmtgIC8gYGltYWdlYCB0b2tlbiBpc1xuICogcmV3cml0dGVuIGluZGl2aWR1YWxseSwgc28gbGluay1sb29raW5nIHRleHQgaW5zaWRlIGNvZGUgc3BhbnMgb3IgZmVuY2VkXG4gKiBjb2RlIGJsb2NrcyBpcyB1bnRvdWNoZWQgKG1hcmtlZCBlbWl0cyB0aG9zZSBhcyBgY29kZWAvYGNvZGVzcGFuYCB0b2tlbnNcbiAqIHdpdGggbm8gbmVzdGVkIGxpbmsgdG9rZW5zKS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJld3JpdGVNYXJrZG93bkxpbmtzKG1hcmtkb3duOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB7XG5cdHJldHVybiByZXdyaXRlTWFya2Rvd25Tb3VyY2UobWFya2Rvd24sIHtcblx0XHRyZXdyaXRlTGluazogdG9rZW4gPT4gcmV3cml0ZUxpbmtUb2tlblJhdyh0b2tlbiwgY29ubmVjdGlvbkF1dGhvcml0eSksXG5cdH0pO1xufVxuXG4vKipcbiAqIENvbXB1dGVzIHRoZSByZXdyaXR0ZW4gYHJhd2Agc3RyaW5nIGZvciBhIHNpbmdsZSBsaW5rIG9yIGltYWdlIHRva2VuLFxuICogb3IgcmV0dXJucyBgdW5kZWZpbmVkYCBpZiB0aGUgdG9rZW4gc2hvdWxkIGJlIGxlZnQgYWxvbmUgKGV4dGVybmFsXG4gKiBzY2hlbWUgb3IgdW5wYXJzZWFibGUgVVJJKS5cbiAqXG4gKiBUaGUgb3V0cHV0IGNvbGxhcHNlcyB0byB0aGUgY2Fub25pY2FsIGlubGluZSBmb3JtIGBbXShuZXdIcmVmKWAgKG9yXG4gKiBgIVtdKG5ld0hyZWYpYCBmb3IgaW1hZ2VzKSBcdTIwMTQgdGhlIGNoYXQgcmVuZGVyZXIgaGFzIHJpY2hlciBoYW5kbGluZyBmb3JcbiAqIGVtcHR5LXRleHQgYWdlbnQtaG9zdCBsaW5rcyAocmVuZGVyaW5nIHRoZW0gYXMgYSBmaWxlIHdpZGdldCksIHNvXG4gKiBwcmVzZXJ2aW5nIHRoZSBvcmlnaW5hbCBsYWJlbCBpc24ndCB1c2VmdWwgZm9yIG1vc3QgbGlua3MuIFRoZSBvbmVcbiAqIGV4Y2VwdGlvbiBpcyBza2lsbCBsaW5rcyAoVVJJcyB3aG9zZSBiYXNlbmFtZSBpcyBgU0tJTEwubWRgKSwgd2hlcmUgdGhlXG4gKiBza2lsbCBuYW1lIGlzIHByZXNlcnZlZCBhcyB0aGUgbGFiZWwgc28gdGhlIHNraWxsIHBpbGwgcmVuZGVyZXIgY2FuXG4gKiBkaXNwbGF5IGl0IGluc3RlYWQgb2YgdGhlIGFsd2F5cy1pZGVudGljYWwgYFNLSUxMLm1kYCBiYXNlbmFtZS4gVGhpc1xuICogYWxzbyBtZWFucyBhdXRvbGlua3MgKGA8dXJsPmApIGFuZCByZWZlcmVuY2Utc3R5bGUgbGlua3NcbiAqIChgW3RleHRdW3JlZl1gKSBhcmUgbm9ybWFsaXplZCBpbnRvIHRoZSBpbmxpbmUgZm9ybS5cbiAqL1xuZnVuY3Rpb24gcmV3cml0ZUxpbmtUb2tlblJhdyh0b2tlbjogVG9rZW5zLkxpbmsgfCBUb2tlbnMuSW1hZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGxldCBwYXJzZWQ6IFVSSTtcblx0dHJ5IHtcblx0XHRwYXJzZWQgPSBVUkkucGFyc2UodG9rZW4uaHJlZiwgdHJ1ZSk7XG5cdH0gY2F0Y2gge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3Qgc2NoZW1lID0gcGFyc2VkLnNjaGVtZS50b0xvd2VyQ2FzZSgpO1xuXHRpZiAoIXNjaGVtZSB8fCBFWFRFUk5BTF9MSU5LX1NDSEVNRVMuaGFzKHNjaGVtZSkpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGxldCBhZ2VudEhvc3RVcmkgPSB0b0FnZW50SG9zdFVyaShwYXJzZWQsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRjb25zdCBpc1NraWxsID0gaXNTa2lsbEZpbGVVcmkocGFyc2VkKTtcblx0Ly8gVlMtQ29kZS1zcGVjaWZpYzogbGlua3MgcG9pbnRpbmcgYXQgYSBgU0tJTEwubWRgIGZpbGUgYXJlIHJlbmRlcmVkIGFzIGFcblx0Ly8gcmljaCBza2lsbCBwaWxsIHJhdGhlciB0aGFuIGEgcGxhaW4gbWFya2Rvd24gbGluay4gVGhlIGNoYXQgcmVuZGVyZXInc1xuXHQvLyBpbmxpbmUgYW5jaG9yIHdpZGdldCBrZXlzIG9mZiB0aGUgYHZzY29kZUxpbmtUeXBlYCBxdWVyeSBwYXJhbWV0ZXIgKHNlZVxuXHQvLyBgY2hhdElubGluZUFuY2hvcldpZGdldC50c2ApLCBzbyB3ZSB0YWcgdGhlIFVSSSBoZXJlIG9uIHRoZSBjbGllbnQgc2lkZVxuXHQvLyByYXRoZXIgdGhhbiBhdCB0aGUgYWdlbnQgaG9zdC4gV2UgZG8gdGhpcyB3aGV0aGVyIG9yIG5vdCB0aGUgbGluayBjYW1lXG5cdC8vIGluIHByZS10YWdnZWQgc28gb2xkZXIgc2Vzc2lvbnMgYW5kIG90aGVyIGFnZW50IHByb3ZpZGVycyBhbHNvIGJlbmVmaXQuXG5cdGlmIChpc1NraWxsICYmICFhZ2VudEhvc3RVcmkucXVlcnkuaW5jbHVkZXMoJ3ZzY29kZUxpbmtUeXBlPScpKSB7XG5cdFx0Y29uc3QgZXhpc3RpbmcgPSBhZ2VudEhvc3RVcmkucXVlcnk7XG5cdFx0YWdlbnRIb3N0VXJpID0gYWdlbnRIb3N0VXJpLndpdGgoeyBxdWVyeTogZXhpc3RpbmcgPyBgJHtleGlzdGluZ30mdnNjb2RlTGlua1R5cGU9c2tpbGxgIDogJ3ZzY29kZUxpbmtUeXBlPXNraWxsJyB9KTtcblx0fVxuXHRjb25zdCBwcmVmaXggPSB0b2tlbi50eXBlID09PSAnaW1hZ2UnID8gJyFbJyA6ICdbJztcblx0Ly8gUHJlc2VydmUgdGhlIGxhYmVsIGZvciBza2lsbCBsaW5rcyAoc28gdGhlIHNraWxsIHBpbGwgcmVuZGVyZXIgY2FuIHNob3dcblx0Ly8gdGhlIHNraWxsIG5hbWUpIGFuZCBmb3IgaW1hZ2UgYWx0IHRleHQgKGFjY2Vzc2liaWxpdHkgXHUyMDE0IHRoZSBpbmxpbmVcblx0Ly8gYW5jaG9yIHdpZGdldCBvbmx5IGFwcGxpZXMgdG8gbGlua3MsIG5vdCBpbWFnZXMpLiBGb3IgYWxsIG90aGVyXG5cdC8vIGFnZW50LWhvc3QgbGlua3MsIGxlYXZlIHRoZSB0ZXh0IGVtcHR5IHNvIHRoZSBjaGF0IHJlbmRlcmVyJ3MgaW5saW5lXG5cdC8vIGFuY2hvciB3aWRnZXQgdGFrZXMgb3ZlciB3aXRoIGl0cyByaWNoIGZpbGUtd2lkZ2V0IHJlbmRlcmluZy5cblx0Ly8gRXNjYXBlIG9ubHkgdGhlIGNoYXJhY3RlcnMgdGhhdCB3b3VsZCBicmVhayBvdXQgb2YgbWFya2Rvd24gbGluayB0ZXh0XG5cdC8vIHN5bnRheCAoYFxcYCBhbmQgYF1gKTsgYSBmdWxsIG1hcmtkb3duIGVzY2FwZSB3b3VsZCBsZWF2ZSB2aXNpYmxlXG5cdC8vIGJhY2tzbGFzaGVzIGluIHRoZSBza2lsbCBwaWxsIHdoaWNoIGV4dHJhY3RzIHRleHQgd2l0aG91dCByZS1wYXJzaW5nLlxuXHRjb25zdCB0ZXh0ID0gaXNTa2lsbCB8fCB0b2tlbi50eXBlID09PSAnaW1hZ2UnID8gZXNjYXBlTWFya2Rvd25MaW5rTGFiZWwodG9rZW4udGV4dCA/PyAnJykgOiAnJztcblx0cmV0dXJuIGAke3ByZWZpeH0ke3RleHR9XSgke2FnZW50SG9zdFVyaS50b1N0cmluZygpfSlgO1xufVxuXG4vKipcbiAqIFJldHVybnMgdHJ1ZSB3aGVuIHRoZSBVUkkncyBiYXNlbmFtZSBpcyBgU0tJTEwubWRgIChjYXNlLWluc2Vuc2l0aXZlKS5cbiAqIFVzZWQgdG8gdGFnIHNraWxsIGxpbmtzIHNvIHRoZSBjaGF0IHJlbmRlcmVyIHNob3dzIHRoZSByaWNoIHNraWxsIHBpbGxcbiAqIGluc3RlYWQgb2YgYSBwbGFpbiBtYXJrZG93biBhbmNob3IuXG4gKi9cbmZ1bmN0aW9uIGlzU2tpbGxGaWxlVXJpKHVyaTogVVJJKTogYm9vbGVhbiB7XG5cdGNvbnN0IG5hbWUgPSBiYXNlbmFtZSh1cmkpO1xuXHRyZXR1cm4gbmFtZS50b0xvd2VyQ2FzZSgpID09PSAnc2tpbGwubWQnO1xufVxuXG4vKipcbiAqIFdyYXBzIGEgcmF3IG1hcmtkb3duIHN0cmluZyBpbnRvIGFuIHtAbGluayBJTWFya2Rvd25TdHJpbmd9LCByZXdyaXRpbmdcbiAqIGxpbmsgVVJJcyB0aHJvdWdoIHtAbGluayByZXdyaXRlTWFya2Rvd25MaW5rc30gd2hlbiBhIGNvbm5lY3Rpb24gYXV0aG9yaXR5XG4gKiBpcyBwcm92aWRlZC5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHJhd01hcmtkb3duVG9TdHJpbmcoY29udGVudDogc3RyaW5nLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBNYXJrZG93blN0cmluZyB7XG5cdGNvbnN0IHJld3JpdHRlbiA9IGNvbm5lY3Rpb25BdXRob3JpdHkgPyByZXdyaXRlTWFya2Rvd25MaW5rcyhjb250ZW50LCBjb25uZWN0aW9uQXV0aG9yaXR5KSA6IGNvbnRlbnQ7XG5cdHJldHVybiBuZXcgTWFya2Rvd25TdHJpbmcocmV3cml0dGVuKTtcbn1cblxuZnVuY3Rpb24gcGFyc2VBYnNvbHV0ZUZpbGVMaW5rVGFyZ2V0KGhyZWY6IHN0cmluZyk6IFVSSSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZyYWdtZW50SW5kZXggPSBocmVmLmluZGV4T2YoJyMnKTtcblx0Y29uc3QgcmF3UGF0aCA9IGZyYWdtZW50SW5kZXggPj0gMCA/IGhyZWYuc3Vic3RyaW5nKDAsIGZyYWdtZW50SW5kZXgpIDogaHJlZjtcblx0aWYgKHJhd1BhdGguaW5jbHVkZXMoJz8nKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBleGlzdGluZ0ZyYWdtZW50ID0gZnJhZ21lbnRJbmRleCA+PSAwID8gaHJlZi5zdWJzdHJpbmcoZnJhZ21lbnRJbmRleCArIDEpIDogJyc7XG5cdGNvbnN0IHBhcnNlZFBhdGggPSBleGlzdGluZ0ZyYWdtZW50ID8geyBwYXRoOiByYXdQYXRoIH0gOiBwYXJzZUZpbGVMb2NhdGlvbihyYXdQYXRoKTtcblx0bGV0IGRlY29kZWRQYXRoOiBzdHJpbmc7XG5cdHRyeSB7XG5cdFx0ZGVjb2RlZFBhdGggPSBkZWNvZGVVUklDb21wb25lbnQocGFyc2VkUGF0aC5wYXRoKTtcblx0fSBjYXRjaCB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGNvbnN0IGFic29sdXRlUGF0aCA9IGRlY29kZWRQYXRoO1xuXHRjb25zdCBpc1dpbmRvd3NQYXRoID0gd2luMzIuaXNBYnNvbHV0ZShhYnNvbHV0ZVBhdGgpO1xuXHRpZiAoIXBvc2l4LmlzQWJzb2x1dGUoYWJzb2x1dGVQYXRoKSAmJiAhaXNXaW5kb3dzUGF0aCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRjb25zdCBzZWxlY3Rpb25GcmFnbWVudCA9IGZvcm1hdExvY2F0aW9uRnJhZ21lbnQocGFyc2VkUGF0aCk7XG5cdGNvbnN0IG5vcm1hbGl6ZWRQYXRoID0gaXNXaW5kb3dzUGF0aCA/IGFic29sdXRlUGF0aC5yZXBsYWNlQWxsKCdcXFxcJywgJy8nKSA6IGFic29sdXRlUGF0aDtcblx0cmV0dXJuIFVSSS5maWxlKG5vcm1hbGl6ZWRQYXRoKS53aXRoKHsgZnJhZ21lbnQ6IGV4aXN0aW5nRnJhZ21lbnQgfHwgc2VsZWN0aW9uRnJhZ21lbnQgfSk7XG59XG5cbmludGVyZmFjZSBJRmlsZUxvY2F0aW9uIHtcblx0cmVhZG9ubHkgcGF0aDogc3RyaW5nO1xuXHRyZWFkb25seSBsaW5lPzogbnVtYmVyO1xuXHRyZWFkb25seSBjb2x1bW4/OiBudW1iZXI7XG59XG5cbmZ1bmN0aW9uIHBhcnNlRmlsZUxvY2F0aW9uKHBhdGg6IHN0cmluZyk6IElGaWxlTG9jYXRpb24ge1xuXHRjb25zdCBtYXRjaCA9IC9eKD88cGF0aD4uKz8pOig/PGxpbmU+WzEtOV1cXGQqKSg/OjooPzxjb2x1bW4+WzEtOV1cXGQqKSk/JC8uZXhlYyhwYXRoKTtcblx0aWYgKCFtYXRjaD8uZ3JvdXBzKSB7XG5cdFx0cmV0dXJuIHsgcGF0aCB9O1xuXHR9XG5cdGNvbnN0IGxpbmUgPSBOdW1iZXIobWF0Y2guZ3JvdXBzLmxpbmUpO1xuXHRjb25zdCBjb2x1bW4gPSBtYXRjaC5ncm91cHMuY29sdW1uID8gTnVtYmVyKG1hdGNoLmdyb3Vwcy5jb2x1bW4pIDogdW5kZWZpbmVkO1xuXHRpZiAoXG5cdFx0IU51bWJlci5pc1NhZmVJbnRlZ2VyKGxpbmUpXG5cdFx0fHwgY29sdW1uICE9PSB1bmRlZmluZWQgJiYgIU51bWJlci5pc1NhZmVJbnRlZ2VyKGNvbHVtbilcblx0KSB7XG5cdFx0cmV0dXJuIHsgcGF0aCB9O1xuXHR9XG5cdHJldHVybiB7IHBhdGg6IG1hdGNoLmdyb3Vwcy5wYXRoLCBsaW5lLCBjb2x1bW4gfTtcbn1cblxuZnVuY3Rpb24gZm9ybWF0TG9jYXRpb25GcmFnbWVudChsb2NhdGlvbjogSUZpbGVMb2NhdGlvbik6IHN0cmluZyB7XG5cdGlmIChsb2NhdGlvbi5saW5lID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gJyc7XG5cdH1cblx0cmV0dXJuIGBMJHtsb2NhdGlvbi5saW5lfSR7bG9jYXRpb24uY29sdW1uICE9PSB1bmRlZmluZWQgJiYgbG9jYXRpb24uY29sdW1uICE9PSAxID8gYCwke2xvY2F0aW9uLmNvbHVtbn1gIDogJyd9YDtcbn1cblxuZnVuY3Rpb24gbm9ybWFsaXplRmlsZVVyaVNlbGVjdGlvbih1cmk6IFVSSSwgaHJlZjogc3RyaW5nKTogVVJJIHtcblx0aWYgKHVyaS5zY2hlbWUudG9Mb3dlckNhc2UoKSAhPT0gU2NoZW1hcy5maWxlIHx8IHVyaS5xdWVyeSB8fCB1cmkuZnJhZ21lbnQpIHtcblx0XHRyZXR1cm4gdXJpO1xuXHR9XG5cdGNvbnN0IHBhcnNlZFBhdGggPSBwYXJzZUZpbGVMb2NhdGlvbihocmVmKTtcblx0aWYgKHBhcnNlZFBhdGgubGluZSA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVyaTtcblx0fVxuXHRjb25zdCBmcmFnbWVudCA9IGZvcm1hdExvY2F0aW9uRnJhZ21lbnQocGFyc2VkUGF0aCk7XG5cdGNvbnN0IHN1ZmZpeExlbmd0aCA9IGhyZWYubGVuZ3RoIC0gcGFyc2VkUGF0aC5wYXRoLmxlbmd0aDtcblx0cmV0dXJuIHVyaS53aXRoKHsgcGF0aDogdXJpLnBhdGguc3Vic3RyaW5nKDAsIHVyaS5wYXRoLmxlbmd0aCAtIHN1ZmZpeExlbmd0aCksIGZyYWdtZW50IH0pO1xufVxuXG4vKiogV3JhcHMgYW4gYWJzb2x1dGUgcGF0aCBvciBpbnRlcm5hbCBVUkkgdGFyZ2V0IGZvciB0aGUgb3duaW5nIEFnZW50IEhvc3QgY29ubmVjdGlvbi4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZXdyaXRlQWdlbnRIb3N0TGlua1RhcmdldChocmVmOiBzdHJpbmcsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHN0cmluZyB7XG5cdGxldCBwYXJzZWQgPSBwYXJzZUFic29sdXRlRmlsZUxpbmtUYXJnZXQoaHJlZik7XG5cdGlmICghcGFyc2VkKSB7XG5cdFx0dHJ5IHtcblx0XHRcdHBhcnNlZCA9IFVSSS5wYXJzZShocmVmLCB0cnVlKTtcblx0XHR9IGNhdGNoIHtcblx0XHRcdHJldHVybiBocmVmO1xuXHRcdH1cblx0XHRjb25zdCBzY2hlbWUgPSBwYXJzZWQuc2NoZW1lLnRvTG93ZXJDYXNlKCk7XG5cdFx0aWYgKCFzY2hlbWUgfHwgRVhURVJOQUxfTElOS19TQ0hFTUVTLmhhcyhzY2hlbWUpKSB7XG5cdFx0XHRyZXR1cm4gaHJlZjtcblx0XHR9XG5cdFx0cGFyc2VkID0gbm9ybWFsaXplRmlsZVVyaVNlbGVjdGlvbihwYXJzZWQud2l0aCh7IHNjaGVtZSB9KSwgaHJlZik7XG5cdFx0aWYgKCFwYXJzZWQucGF0aC5zdGFydHNXaXRoKCcvJykpIHtcblx0XHRcdHJldHVybiBocmVmO1xuXHRcdH1cblx0fVxuXG5cdGxldCBhZ2VudEhvc3RVcmk6IFVSSTtcblx0dHJ5IHtcblx0XHRhZ2VudEhvc3RVcmkgPSB0b0FnZW50SG9zdFVyaShwYXJzZWQsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gaHJlZjtcblx0fVxuXHRpZiAoaXNTa2lsbEZpbGVVcmkocGFyc2VkKSAmJiAhYWdlbnRIb3N0VXJpLnF1ZXJ5LmluY2x1ZGVzKCd2c2NvZGVMaW5rVHlwZT0nKSkge1xuXHRcdGNvbnN0IGV4aXN0aW5nID0gYWdlbnRIb3N0VXJpLnF1ZXJ5O1xuXHRcdGFnZW50SG9zdFVyaSA9IGFnZW50SG9zdFVyaS53aXRoKHsgcXVlcnk6IGV4aXN0aW5nID8gYCR7ZXhpc3Rpbmd9JnZzY29kZUxpbmtUeXBlPXNraWxsYCA6ICd2c2NvZGVMaW5rVHlwZT1za2lsbCcgfSk7XG5cdH1cblx0cmV0dXJuIGFnZW50SG9zdFVyaS50b1N0cmluZygpO1xufVxuXG4vKipcbiAqIENvbnZlcnRzIGEgcHJvdG9jb2wgYFN0cmluZ09yTWFya2Rvd25gIHZhbHVlIHRvIGEgY2hhdC1sYXllciBgSU1hcmtkb3duU3RyaW5nYC5cbiAqXG4gKiBXaGVuIGBjb25uZWN0aW9uQXV0aG9yaXR5YCBpcyBwcm92aWRlZCwgbWFya2Rvd24gbGluayBVUklzIGFyZSByZXdyaXR0ZW5cbiAqIHRocm91Z2gge0BsaW5rIHJld3JpdGVNYXJrZG93bkxpbmtzfSBzbyB0aGF0IHJlbW90ZSByZXNvdXJjZXMgcmVzb2x2ZVxuICogdGhyb3VnaCB0aGUgYWdlbnQgaG9zdCBmaWxlc3lzdGVtIHByb3ZpZGVyLlxuICovXG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHZhbHVlOiBTdHJpbmdPck1hcmtkb3duLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmc7XG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHZhbHVlOiBTdHJpbmdPck1hcmtkb3duIHwgdW5kZWZpbmVkLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQ7XG5leHBvcnQgZnVuY3Rpb24gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHZhbHVlOiBTdHJpbmdPck1hcmtkb3duIHwgdW5kZWZpbmVkLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBzdHJpbmcgfCBJTWFya2Rvd25TdHJpbmcgfCB1bmRlZmluZWQge1xuXHRpZiAodmFsdWUgPT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0aWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcblx0XHRyZXR1cm4gdmFsdWU7XG5cdH1cblx0cmV0dXJuIHJhd01hcmtkb3duVG9TdHJpbmcodmFsdWUubWFya2Rvd24sIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xufVxuXG4vKipcbiAqIE51bWJlciBvZiBjb21tZW50LWJvZHkgY2hhcmFjdGVycyBzaG93biBpbmxpbmUgaW4gdGhlIHtAbGluayBhZGRDb21tZW50UmVmZXJlbmNlfVxuICogcGlsbCBiZWZvcmUgaXQgaXMgdHJ1bmNhdGVkIHdpdGggYW4gZWxsaXBzaXMuXG4gKi9cbmNvbnN0IEFERF9DT01NRU5UX1BSRVZJRVdfTEVOR1RIID0gNDA7XG5cbi8qKlxuICogQnVpbGRzIHRoZSBpbmxpbmUgcHJldmlldyBvZiBhbiBgYWRkQ29tbWVudGAgY29tbWVudCBib2R5OiB3aGl0ZXNwYWNlIGlzXG4gKiBjb2xsYXBzZWQgdG8gc2luZ2xlIHNwYWNlcyBhbmQgdGhlIHRleHQgaXMgdHJ1bmNhdGVkIHRvXG4gKiB7QGxpbmsgQUREX0NPTU1FTlRfUFJFVklFV19MRU5HVEh9IGNoYXJhY3RlcnMgd2l0aCBhIHRyYWlsaW5nIGVsbGlwc2lzLlxuICovXG5mdW5jdGlvbiBhZGRDb21tZW50UHJldmlldyh0ZXh0OiBzdHJpbmcpOiBzdHJpbmcge1xuXHRjb25zdCBzaW5nbGVMaW5lID0gdGV4dC5yZXBsYWNlKC9cXHMrL2csICcgJykudHJpbSgpO1xuXHRyZXR1cm4gc2luZ2xlTGluZS5sZW5ndGggPiBBRERfQ09NTUVOVF9QUkVWSUVXX0xFTkdUSFxuXHRcdD8gYCR7c2luZ2xlTGluZS5zbGljZSgwLCBBRERfQ09NTUVOVF9QUkVWSUVXX0xFTkdUSCl9XHUyMDI2YFxuXHRcdDogc2luZ2xlTGluZTtcbn1cblxuLyoqIFdoZXRoZXIge0BsaW5rIHZhbHVlfSBpcyBhIHBvc2l0aXZlIDEtYmFzZWQgbGluZS9jb2x1bW4gY29vcmRpbmF0ZS4gKi9cbmZ1bmN0aW9uIGlzUG9zaXRpdmVJbnRlZ2VyKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgbnVtYmVyIHtcblx0cmV0dXJuIHR5cGVvZiB2YWx1ZSA9PT0gJ251bWJlcicgJiYgTnVtYmVyLmlzSW50ZWdlcih2YWx1ZSkgJiYgdmFsdWUgPj0gMTtcbn1cblxuLyoqXG4gKiBXaGV0aGVyIHtAbGluayB2YWx1ZX0gaXMgYSB2YWxpZCAxLWJhc2VkIGVkaXRvciByYW5nZTogZXZlcnkgY29vcmRpbmF0ZSBtdXN0XG4gKiBiZSBhbiBpbnRlZ2VyID49IDEsIHNpbmNlIHRoZSByYW5nZSBpcyBsYXRlciB1c2VkIGZvciBlZGl0b3Igc2VsZWN0aW9uIGFuZFxuICogcmV2ZWFsLiBJbnZhbGlkIGlucHV0IGlzIHRyZWF0ZWQgYXMgdW5wYXJzZWFibGUgc28gdGhlIFVJIGZhbGxzIGJhY2sgdG8gdGhlXG4gKiBzZXJ2ZXItYXV0aG9yZWQgbWVzc2FnZS5cbiAqL1xuZnVuY3Rpb24gaXNPbmVCYXNlZFJhbmdlKHZhbHVlOiB1bmtub3duKTogdmFsdWUgaXMgSVJhbmdlIHtcblx0Y29uc3QgcmFuZ2UgPSB2YWx1ZSBhcyBJUmFuZ2UgfCB1bmRlZmluZWQ7XG5cdHJldHVybiAhIXJhbmdlICYmIHR5cGVvZiByYW5nZSA9PT0gJ29iamVjdCdcblx0XHQmJiBpc1Bvc2l0aXZlSW50ZWdlcihyYW5nZS5zdGFydExpbmVOdW1iZXIpXG5cdFx0JiYgaXNQb3NpdGl2ZUludGVnZXIocmFuZ2Uuc3RhcnRDb2x1bW4pXG5cdFx0JiYgaXNQb3NpdGl2ZUludGVnZXIocmFuZ2UuZW5kTGluZU51bWJlcilcblx0XHQmJiBpc1Bvc2l0aXZlSW50ZWdlcihyYW5nZS5lbmRDb2x1bW4pO1xufVxuXG4vKipcbiAqIEJ1aWxkcyBhIHJpY2gsIGNsaWNrYWJsZSByZWZlcmVuY2UgZm9yIHRoZSBhZ2VudCBob3N0IGBhZGRDb21tZW50YCBmZWVkYmFja1xuICogdG9vbCBjYWxsIFx1MjAxNCB0aGUgdG9vbCBuYW1lIGFuZCB0aGUgZmlyc3RcbiAqIHtAbGluayBBRERfQ09NTUVOVF9QUkVWSUVXX0xFTkdUSH0gY2hhcmFjdGVycyBvZiB0aGUgY29tbWVudCBib2R5IGluIHF1b3Rlcy5cbiAqIENsaWNraW5nIGl0IHJ1bnMge0BsaW5rIEFnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQuUmV2ZWFsQXR9IHRvIG9wZW4gdGhlXG4gKiBmaWxlIGFuZCByZXZlYWwgdGhlIGNvbW1lbnQgKGFnZW50IGZlZWRiYWNrKSBpbiB0aGUgZWRpdG9yLlxuICpcbiAqIE9ubHkgY2FsbCB0aGlzIGZvciB0aGUgYGFkZENvbW1lbnRgIHRvb2wgKGdhdGUgY2FsbCBzaXRlcyB3aXRoXG4gKiB7QGxpbmsgaXNBZGRDb21tZW50VG9vbH0pLiBSZXR1cm5zIGB1bmRlZmluZWRgIHdoZW4gdGhlIGFyZ3VtZW50cyBjYW4ndCBiZVxuICogcGFyc2VkLCBzbyB0aGUgY2FsbGVyIGZhbGxzIGJhY2sgdG8gdGhlIHNlcnZlci1hdXRob3JlZCBtZXNzYWdlLlxuICovXG5mdW5jdGlvbiBhZGRDb21tZW50UmVmZXJlbmNlKHRjOiBUb29sQ2FsbFN0YXRlKTogSU1hcmtkb3duU3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0Ly8gYHRvb2xJbnB1dGAgaXMgYWJzZW50IHdoaWxlIHBhcmFtZXRlcnMgYXJlIHN0aWxsIHN0cmVhbWluZzsgZXZlcnkgb3RoZXJcblx0Ly8gc3RhdGUgY2FycmllcyBpdCAoc2VlIGBUb29sQ2FsbFBhcmFtZXRlckZpZWxkc2ApLlxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcgfHwgIXRjLnRvb2xJbnB1dCkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgdG9vbElucHV0ID0gZ2V0SW5saW5lVG9vbElucHV0KHRjLnRvb2xJbnB1dCk7XG5cdGlmICghdG9vbElucHV0KSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRsZXQgYXJnczogeyByZXNvdXJjZVVyaT86IHVua25vd247IHJhbmdlPzogdW5rbm93bjsgdGV4dD86IHVua25vd24gfTtcblx0dHJ5IHtcblx0XHRhcmdzID0gSlNPTi5wYXJzZSh0b29sSW5wdXQpO1xuXHR9IGNhdGNoIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdGlmICh0eXBlb2YgYXJncy5yZXNvdXJjZVVyaSAhPT0gJ3N0cmluZycgfHwgdHlwZW9mIGFyZ3MudGV4dCAhPT0gJ3N0cmluZycgfHwgIWlzT25lQmFzZWRSYW5nZShhcmdzLnJhbmdlKSkge1xuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblx0Y29uc3QgcHJldmlldyA9IGVzY2FwZUljb25zKGVzY2FwZU1hcmtkb3duTGlua0xhYmVsKGFkZENvbW1lbnRQcmV2aWV3KGFyZ3MudGV4dCkpKTtcblx0Ly8gVGhlIGNvbW1hbmQgcmVzb2x2ZXMgdGhlIG93bmluZyBzZXNzaW9uIGZyb20gdGhlIGZpbGUgcmVzb3VyY2UsIHNvIHRoZVxuXHQvLyBsaW5rIG9ubHkgbmVlZHMgdGhlIHJlc291cmNlIGFuZCByYW5nZSAoYm90aCBrbm93biBoZXJlKS5cblx0Y29uc3QgY29tbWFuZEFyZ3MgPSBlbmNvZGVVUklDb21wb25lbnQoSlNPTi5zdHJpbmdpZnkoW2FyZ3MucmVzb3VyY2VVcmksIGFyZ3MucmFuZ2VdKSk7XG5cdGNvbnN0IGxpbmsgPSBgY29tbWFuZDoke0FnZW50RmVlZGJhY2tSZXZpZXdDb21tYW5kSWQuUmV2ZWFsQXR9PyR7Y29tbWFuZEFyZ3N9YDtcblx0cmV0dXJuIG5ldyBNYXJrZG93blN0cmluZyhgW2FkZENvbW1lbnQgXCIke3ByZXZpZXd9XCJdKCR7bGlua30pYCwge1xuXHRcdGlzVHJ1c3RlZDogeyBlbmFibGVkQ29tbWFuZHM6IFtBZ2VudEZlZWRiYWNrUmV2aWV3Q29tbWFuZElkLlJldmVhbEF0XSB9LFxuXHRcdHN1cHBvcnRUaGVtZUljb25zOiB0cnVlLFxuXHR9KTtcbn1cblxuLyoqXG4gKiBDcmVhdGVzIGEgbGl2ZSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSBmcm9tIHRoZSBwcm90b2NvbCdzIHRvb2wtY2FsbFxuICogc3RhdGUuIFVzZWQgZHVyaW5nIGFjdGl2ZSB0dXJucyB0byByZXByZXNlbnQgcnVubmluZyB0b29sIGNhbGxzIGluIHRoZSBVSS5cbiAqXG4gKiBAcGFyYW0gY29ubmVjdGlvbkF1dGhvcml0eSBTYW5pdGl6ZWQgY29ubmVjdGlvbiBpZGVudGlmaWVyIHVzZWQgd2hlblxuICogICB3cmFwcGluZyByZW1vdGUgZmlsZSBVUklzIGludG8gYHZzY29kZS1hZ2VudC1ob3N0OmAgVVJJcy4gT21pdCB0byBza2lwXG4gKiAgIFVSSSB3cmFwcGluZyAoZS5nLiBpbiB0ZXN0cyB0aGF0IGRvbid0IGV4ZXJjaXNlIHRoZSBjb25maXJtYXRpb24gVUkpLlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9vbENhbGxTdGF0ZVRvSW52b2NhdGlvbih0YzogVG9vbENhbGxTdGF0ZSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZywgbWNwU2VydmVyQXV0aG9yaXR5ID0gc2Vzc2lvblJlc291cmNlLmF1dGhvcml0eSwgb3B0aW9ucz86IElBZ2VudEhvc3RUb29sSW52b2NhdGlvbk9wdGlvbnMpOiBDaGF0VG9vbEludm9jYXRpb24ge1xuXHRjb25zdCB0b29sRGF0YTogSVRvb2xEYXRhID0ge1xuXHRcdGlkOiB0Yy50b29sTmFtZSxcblx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdGRpc3BsYXlOYW1lOiB0Yy5kaXNwbGF5TmFtZSxcblx0XHRtb2RlbERlc2NyaXB0aW9uOiB0Yy50b29sTmFtZSxcblx0fTtcblxuXHRpZiAodGMuY29udHJpYnV0b3I/LmtpbmQgPT09IFRvb2xDYWxsQ29udHJpYnV0b3JLaW5kLkNsaWVudCAmJiBvcHRpb25zICYmIHRjLmNvbnRyaWJ1dG9yLmNsaWVudElkICE9PSBvcHRpb25zLmN1cnJlbnRDbGllbnRJZCkge1xuXHRcdGNvbnN0IGludm9jYXRpb24gPSBuZXcgQ2hhdFRvb2xJbnZvY2F0aW9uKHVuZGVmaW5lZCwgdG9vbERhdGEsIHRjLnRvb2xDYWxsSWQsIHN1YkFnZW50SW52b2NhdGlvbklkLCB1bmRlZmluZWQpO1xuXHRcdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0Lm90aGVyQ2xpZW50VG9vbC5ydW5uaW5nJywgXCJSdW5uaW5nIHswfSBvbiBhbm90aGVyIGNsaWVudC4uLlwiLCB0Yy5kaXNwbGF5TmFtZSk7XG5cdFx0aW52b2NhdGlvbi5vdGhlckNsaWVudFRvb2xDYWxsID0ge1xuXHRcdFx0Y2FuY2VsOiAoKSA9PiBvcHRpb25zLmNhbmNlbE90aGVyQ2xpZW50VG9vbENhbGwodGMpLFxuXHRcdH07XG5cdFx0cmV0dXJuIGludm9jYXRpb247XG5cdH1cblxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5QZW5kaW5nQ29uZmlybWF0aW9uKSB7XG5cdFx0Ly8gVG9vbCBuZWVkcyBjb25maXJtYXRpb24gXHUyMDE0IGNyZWF0ZSB3aXRoIGNvbmZpcm1hdGlvbiBtZXNzYWdlcy5cblx0XHQvLyAoU3ViYWdlbnQtc3Bhd25pbmcgdG9vbHMgbmV2ZXIgcmVhY2ggdGhpcyBzdGF0ZSBpbiBwcm9kdWN0aW9uOiB0aGVcblx0XHQvLyBDb3BpbG90IFNESydzIGB0YXNrYCB0b29sIGRvZXNuJ3QgcmVxdWVzdCBwZXJtaXNzaW9uLCBhbmQgdGhlIGV2ZW50XG5cdFx0Ly8gbWFwcGVyIGF1dG8tZW1pdHMgYHRvb2xfcmVhZHlgIHdpdGggYGNvbmZpcm1lZDogTm90TmVlZGVkYCBwYWlyZWRcblx0XHQvLyB3aXRoIGB0b29sX3N0YXJ0YC4gU28gbm8gc3BlY2lhbC1jYXNlIGZvciBzdWJhZ2VudHMgaXMgbmVlZGVkIGhlcmUuKVxuXHRcdGNvbnN0IGNvbmZpcm1hdGlvbk1lc3NhZ2VzID0gdG9vbENhbGxDb25maXJtYXRpb25NZXNzYWdlcyh0YywgY29ubmVjdGlvbkF1dGhvcml0eSk7XG5cblx0XHRsZXQgdG9vbFNwZWNpZmljRGF0YTogSUNoYXRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uRGF0YSB8IElDaGF0VG9vbElucHV0SW52b2NhdGlvbkRhdGEgfCBJQ2hhdE1vZGlmaWVkRmlsZXNDb25maXJtYXRpb25EYXRhIHwgSUNoYXRBZ2VudEZlZWRiYWNrUmV2aWV3Q29uZmlybWF0aW9uRGF0YSB8IHVuZGVmaW5lZDtcblx0XHRjb25zdCBwZW5kaW5nRWRpdHMgPSB0Yy5lZGl0cz8uaXRlbXM7XG5cdFx0aWYgKGlzVmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0XHQvLyBUaGUgYWdlbnQgaG9zdCBzdXJmYWNlcyB0aGlzIHNlcnZlciB0b29sIGFzIGEgY29uZmlybWF0aW9uIChpdCBpc1xuXHRcdFx0Ly8gZXhjbHVkZWQgZnJvbSBhdXRvLWFwcHJvdmUpLiBSZW5kZXIgYSBjdXN0b20gY29uZmlybWF0aW9uIHRoYXQgbGV0c1xuXHRcdFx0Ly8gdGhlIHVzZXIgcGljayB3aGljaCB1bnJldmlld2VkIGNvbW1lbnRzIHRvIHJldmVhbDsgdGhlIHJlbmRlcmVyXG5cdFx0XHQvLyBmZXRjaGVzIHRoZSBjb21tZW50cyBhbmQgYXBwbGllcyB0aGUgc2VsZWN0aW9uIHZpYSBmZWVkYmFja1xuXHRcdFx0Ly8gY29tbWFuZHMsIHNvIHRoaXMgbGF5ZXIgY2FycmllcyBvbmx5IHRoZSBidXR0b24gbGFiZWxzLlxuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ2FnZW50RmVlZGJhY2tSZXZpZXdDb25maXJtYXRpb24nLFxuXHRcdFx0XHRvcHRpb25zOiBbbG9jYWxpemUoJ2FnZW50RmVlZGJhY2sucmV2ZWFsJywgXCJSZXZlYWwgU2VsZWN0ZWRcIildLFxuXHRcdFx0fTtcblx0XHR9IGVsc2UgaWYgKHBlbmRpbmdFZGl0cz8ubGVuZ3RoKSB7XG5cdFx0XHRjb25zdCB3cmFwID0gKHVyaTogVVJJKSA9PiBjb25uZWN0aW9uQXV0aG9yaXR5ID8gdG9BZ2VudEhvc3RVcmkodXJpLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA6IHVyaTtcblx0XHRcdGNvbnN0IG1hcHBlZCA9IG1hcEZpbGVFZGl0cyhwZW5kaW5nRWRpdHMsIHRjLnRvb2xDYWxsSWQpO1xuXHRcdFx0dG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ21vZGlmaWVkRmlsZXNDb25maXJtYXRpb24nLFxuXHRcdFx0XHRvcHRpb25zOiBbJ0FsbG93J10sXG5cdFx0XHRcdG1vZGlmaWVkRmlsZXM6IG1hcHBlZC5tYXAoZWRpdCA9PiB7XG5cdFx0XHRcdFx0Y29uc3QgcmVzb3VyY2UgPSB3cmFwKGVkaXQucmVzb3VyY2UpO1xuXHRcdFx0XHRcdGNvbnN0IG9yaWdpbmFsUmVzb3VyY2UgPSBlZGl0Lm9yaWdpbmFsUmVzb3VyY2UgPyB3cmFwKGVkaXQub3JpZ2luYWxSZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0Y29uc3QgbW9kaWZpZWRDb250ZW50ID0gZWRpdC5hZnRlckNvbnRlbnRVcmkgPyB3cmFwKGVkaXQuYWZ0ZXJDb250ZW50VXJpKSA6IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjb25zdCBvcmlnaW5hbENvbnRlbnQgPSBlZGl0LmJlZm9yZUNvbnRlbnRVcmkgPyB3cmFwKGVkaXQuYmVmb3JlQ29udGVudFVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0XHRcdHVyaTogcmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRlZGl0S2luZDogZWRpdC5raW5kIGFzIENoYXRFeHRlcm5hbEVkaXRLaW5kLFxuXHRcdFx0XHRcdFx0b3JpZ2luYWxVcmk6IG9yaWdpbmFsUmVzb3VyY2UsXG5cdFx0XHRcdFx0XHRtb2RpZmllZENvbnRlbnRVcmk6IG1vZGlmaWVkQ29udGVudCxcblx0XHRcdFx0XHRcdG9yaWdpbmFsQ29udGVudFVyaTogb3JpZ2luYWxDb250ZW50LFxuXHRcdFx0XHRcdFx0aW5zZXJ0aW9uczogZWRpdC5kaWZmPy5hZGRlZCxcblx0XHRcdFx0XHRcdGRlbGV0aW9uczogZWRpdC5kaWZmPy5yZW1vdmVkLFxuXHRcdFx0XHRcdFx0dGl0bGU6IGJhc2VuYW1lKGVkaXQucmVzb3VyY2UpLFxuXHRcdFx0XHRcdFx0ZGVzY3JpcHRpb246IGVkaXQucmVzb3VyY2UucGF0aCxcblx0XHRcdFx0XHR9O1xuXHRcdFx0XHR9KSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChnZXRUb29sS2luZCh0YykgPT09ICd0ZXJtaW5hbCcgJiYgZ2V0SW5saW5lVG9vbElucHV0KHRjLnRvb2xJbnB1dCkpIHtcblx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgdG9vbElucHV0ID0gZ2V0SW5saW5lVG9vbElucHV0KHRjLnRvb2xJbnB1dCk7XG5cdFx0XHRpZiAodG9vbElucHV0KSB7XG5cdFx0XHRcdGxldCByYXdJbnB1dDogdW5rbm93bjtcblx0XHRcdFx0dHJ5IHsgcmF3SW5wdXQgPSBKU09OLnBhcnNlKHRvb2xJbnB1dCk7IH0gY2F0Y2ggeyByYXdJbnB1dCA9IHsgaW5wdXQ6IHRvb2xJbnB1dCB9OyB9XG5cdFx0XHRcdHRvb2xTcGVjaWZpY0RhdGEgPSB7IGtpbmQ6ICdpbnB1dCcsIHJhd0lucHV0IH07XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0cmV0dXJuIG5ldyBDaGF0VG9vbEludm9jYXRpb24oXG5cdFx0XHR7XG5cdFx0XHRcdGludm9jYXRpb25NZXNzYWdlOiBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdFx0XHRjb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRcdFx0cHJlc2VudGF0aW9uOiBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlLFxuXHRcdFx0XHR0b29sU3BlY2lmaWNEYXRhLFxuXHRcdFx0fSxcblx0XHRcdHRvb2xEYXRhLFxuXHRcdFx0dGMudG9vbENhbGxJZCxcblx0XHRcdHN1YkFnZW50SW52b2NhdGlvbklkLFxuXHRcdFx0dW5kZWZpbmVkLFxuXHRcdCk7XG5cdH1cblxuXHRjb25zdCBpbnZvY2F0aW9uID0gbmV3IENoYXRUb29sSW52b2NhdGlvbih1bmRlZmluZWQsIHRvb2xEYXRhLCB0Yy50b29sQ2FsbElkLCBzdWJBZ2VudEludm9jYXRpb25JZCwgdW5kZWZpbmVkKTtcblx0aW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5pbnZvY2F0aW9uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gdGMuZGlzcGxheU5hbWU7XG5cdGlmIChpc0FnZW50SG9zdEFza1VzZXJUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmFza1VzZXIud2FpdGluZycsIFwiV2FpdGluZyBmb3IgYW5zd2VyLi4uXCIpO1xuXHRcdGludm9jYXRpb24ucHJlc2VudGF0aW9uID0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZTtcblx0fVxuXHRpZiAodGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5BdXRoUmVxdWlyZWQpIHtcblx0XHRpbnZvY2F0aW9uLnNldEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQodG9vbENhbGxBdXRoZW50aWNhdGlvblNlcnZlcih0YywgbWNwU2VydmVyQXV0aG9yaXR5KSk7XG5cdH1cblxuXHQvLyBUb29scyB0aGF0IHJlbmRlciBhIGJlc3Bva2UsIGNsaWVudC1hdXRob3JlZCBpbnZvY2F0aW9uIG1lc3NhZ2Ugb3ZlcnJpZGVcblx0Ly8gdGhlIHNlcnZlciB0ZXh0IGhlcmUuIEFkZCBuZXcgcGVyLXRvb2wgY2FzZXMgYWxvbmdzaWRlIHRoaXMgYnJhbmNoLlxuXHRpZiAoaXNBZGRDb21tZW50VG9vbCh0Yy50b29sTmFtZSkpIHtcblx0XHRpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlID0gYWRkQ29tbWVudFJlZmVyZW5jZSh0YykgPz8gaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0fVxuXG5cdGlmIChpc1Rlcm1pbmFsVG9vbENhbGwodGMpKSB7XG5cdFx0Ly8gU2V0IHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgZWFnZXJseSBzbyB0aGUgcmVuZGVyZXIgc2hvd3MgYVxuXHRcdC8vIHRlcm1pbmFsIHBpbGwgKGV4cGFuZGFibGUgY29tbWFuZCArIG91dHB1dCBhcmVhKSBmcm9tIHRoZSBzdGFydCxcblx0XHQvLyBpbnN0ZWFkIG9mIGZhbGxpbmcgYmFjayB0byB0aGUgZ2VuZXJpYyB0b29sIHdpZGdldCB0aGF0IG9ubHlcblx0XHQvLyBzdXJmYWNlcyB0aGUgZmlyc3QgbGluZSBvZiB0aGUgY29tbWFuZCB2aWEgdGhlIGludm9jYXRpb24gbWVzc2FnZS5cblx0XHQvLyBGb3IgdGhlIFNESydzIGJ1aWx0LWluIGBiYXNoYC9gcG93ZXJzaGVsbGAgdG9vbHMgdGhlcmUncyBub1xuXHRcdC8vIFRlcm1pbmFsIGNvbnRlbnQgYmxvY2sgKHRoZXkgcnVuIG91dHNpZGUgQUhQJ3MgdGVybWluYWwgaW5mcmEpLFxuXHRcdC8vIHNvIHRoZSBBSFAtdGVybWluYWwgZmllbGRzIChgdGVybWluYWxUb29sU2Vzc2lvbklkYCxcblx0XHQvLyBgdGVybWluYWxDb21tYW5kVXJpYCkgc3RheSB1bmRlZmluZWQgXHUyMDE0IHRoZSByZW5kZXJlciB0cmVhdHMgdGhpc1xuXHRcdC8vIGFzIGEgZGlzcGxheS1vbmx5IHRlcm1pbmFsIHRoYXQgc3RpbGwgc3VyZmFjZXMgY29tbWFuZCArIG91dHB1dC5cblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSBidWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKTtcblx0fSBlbHNlIGlmIChpc1N1YmFnZW50VG9vbCh0YykpIHtcblx0XHQvLyBTdWJhZ2VudC1zcGF3bmluZyB0b29sOiBzZXQgc3ViYWdlbnQgdG9vbFNwZWNpZmljRGF0YSBlYWdlcmx5IHNvIHRoZVxuXHRcdC8vIHJlbmRlcmVyIGdyb3VwcyBpdCBjb3JyZWN0bHkgZnJvbSB0aGUgc3RhcnQgKGJlZm9yZSBjaGlsZCBjb250ZW50XG5cdFx0Ly8gYXJyaXZlcykuIEFnZW50IG1ldGFkYXRhIGNvbWVzIGZyb20gYF9tZXRhYCAoc2V0IGJ5IHRoZSBldmVudFxuXHRcdC8vIG1hcHBlciBmcm9tIHRoZSB0b29sJ3MgYXJndW1lbnRzKSBhbmQgaXMgbGF0ZXIgcmVmaW5lZCBieSB0aGVcblx0XHQvLyBTdWJhZ2VudCBjb250ZW50IGJsb2NrIHZpYSBgdXBkYXRlUnVubmluZ1Rvb2xTcGVjaWZpY0RhdGFgLlxuXHRcdGNvbnN0IHN1YmFnZW50Q29udGVudCA9ICh0Yy5zdGF0dXMgPT09IFRvb2xDYWxsU3RhdHVzLlJ1bm5pbmcgfHwgdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpXG5cdFx0XHQ/IGdldFRvb2xTdWJhZ2VudENvbnRlbnQodGMpXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0ZGVzY3JpcHRpb246IGdldFN1YmFnZW50VGFza0Rlc2NyaXB0aW9uKHRjKSxcblx0XHRcdGFnZW50TmFtZTogc3ViYWdlbnRDb250ZW50Py5hZ2VudE5hbWUgPz8gZ2V0U3ViYWdlbnRBZ2VudE5hbWUodGMpLFxuXHRcdFx0Y2hhdFJlc291cmNlOiBnZXRTdWJhZ2VudENoYXRSZXNvdXJjZSh0Yywgc3ViYWdlbnRDb250ZW50LCBzZXNzaW9uUmVzb3VyY2UpLFxuXHRcdH07XG5cdH0gZWxzZSBpZiAoZ2V0VG9vbEtpbmQodGMpID09PSAnc2VhcmNoJykge1xuXHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHsga2luZDogJ3NlYXJjaCcgfTtcblx0fSBlbHNlIGlmICh0Yy5zdGF0dXMgIT09IFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZykge1xuXHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0Yywgc2Vzc2lvblJlc291cmNlKTtcblx0fVxuXG5cdHJldHVybiBpbnZvY2F0aW9uO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdG9vbENhbGxDb25maXJtYXRpb25NZXNzYWdlcyh0YzogVG9vbENhbGxQZW5kaW5nQ29uZmlybWF0aW9uU3RhdGUsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXMge1xuXHRjb25zdCByaXNrQXNzZXNzbWVudCA9IHRjLnJpc2tBc3Nlc3NtZW50O1xuXHRsZXQgYXBwcm92YWxSZWFzb246IElUb29sQ29uZmlybWF0aW9uTWVzc2FnZXNbJ2FwcHJvdmFsUmVhc29uJ107XG5cdGlmIChyaXNrQXNzZXNzbWVudD8uc3RhdHVzID09PSBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkxvYWRpbmcpIHtcblx0XHRhcHByb3ZhbFJlYXNvbiA9IHsgc3RhdHVzOiAnbG9hZGluZycgfTtcblx0fSBlbHNlIGlmIChyaXNrQXNzZXNzbWVudD8uc3RhdHVzID09PSBUb29sQ2FsbFJpc2tBc3Nlc3NtZW50U3RhdHVzLkNvbXBsZXRlKSB7XG5cdFx0YXBwcm92YWxSZWFzb24gPSB7XG5cdFx0XHRzdGF0dXM6ICdjb21wbGV0ZScsXG5cdFx0XHRleHBsYW5hdGlvbjogc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHJpc2tBc3Nlc3NtZW50LnJlYXNvbiwgY29ubmVjdGlvbkF1dGhvcml0eSksXG5cdFx0XHRzYWZldHk6IHJpc2tBc3Nlc3NtZW50LnNhZmV0eSxcblx0XHR9O1xuXHR9XG5cdHJldHVybiB7XG5cdFx0dGl0bGU6IGlzVmlld1VucmV2aWV3ZWRDb21tZW50c1Rvb2wodGMudG9vbE5hbWUpXG5cdFx0XHQ/IGxvY2FsaXplKCdhZ2VudEZlZWRiYWNrLnJldmlld1RpdGxlJywgXCJSZXZlYWwgdW5yZXZpZXdlZCBjb21tZW50cz9cIilcblx0XHRcdDogc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmNvbmZpcm1hdGlvblRpdGxlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA/PyB0Yy5kaXNwbGF5TmFtZSxcblx0XHRtZXNzYWdlOiBpc1ZpZXdVbnJldmlld2VkQ29tbWVudHNUb29sKHRjLnRvb2xOYW1lKVxuXHRcdFx0PyBsb2NhbGl6ZSgnYWdlbnRGZWVkYmFjay5yZXZpZXdNZXNzYWdlJywgXCJDaG9vc2Ugd2hpY2ggY29tbWVudHMgdG8gcmV2ZWFsIHRvIHRoZSBhZ2VudC4gVW5jaGVja2VkIGNvbW1lbnRzIHN0YXkgaGlkZGVuLlwiKVxuXHRcdFx0OiBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpLFxuXHRcdGFwcHJvdmFsUmVhc29uLFxuXHRcdC4uLih0Yy5vcHRpb25zID8geyBjdXN0b21PcHRpb25zOiB0Yy5vcHRpb25zIH0gOiB7fSksXG5cdH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiB0b29sQ2FsbEF1dGhlbnRpY2F0aW9uU2VydmVyKHRjOiBUb29sQ2FsbFN0YXRlICYgeyBzdGF0dXM6IFRvb2xDYWxsU3RhdHVzLkF1dGhSZXF1aXJlZCB9LCBzZXNzaW9uQXV0aG9yaXR5OiBzdHJpbmcpOiBJQ2hhdE1jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWRTZXJ2ZXIge1xuXHRjb25zdCBtZXRhZGF0YSA9IHJlYWRUb29sQ2FsbE1ldGEodGMpO1xuXHRyZXR1cm4ge1xuXHRcdGlkOiBgJHtzZXNzaW9uQXV0aG9yaXR5fS8ke3RjLmNvbnRyaWJ1dG9yLmN1c3RvbWl6YXRpb25JZH1gLFxuXHRcdG5hbWU6IHRjLmF1dGgucmVzb3VyY2UucmVzb3VyY2VfbmFtZSA/PyBtZXRhZGF0YS5tY3BTZXJ2ZXJOYW1lID8/IHRjLmRpc3BsYXlOYW1lLFxuXHRcdHJlc291cmNlOiB0Yy5hdXRoLnJlc291cmNlLnJlc291cmNlLFxuXHRcdG9hdXRoQ2xpZW50OiB0Yy5hdXRoLm9hdXRoQ2xpZW50LFxuXHRcdGF1dGhvcml6YXRpb25TZXJ2ZXJzOiB0Yy5hdXRoLnJlc291cmNlLmF1dGhvcml6YXRpb25fc2VydmVycyxcblx0XHRzdXBwb3J0ZWRTY29wZXM6IHRjLmF1dGgucmVzb3VyY2Uuc2NvcGVzX3N1cHBvcnRlZCxcblx0XHRyZXF1aXJlZFNjb3BlczogdGMuYXV0aC5yZXF1aXJlZFNjb3Blcyxcblx0XHRyZWFzb246IHRjLmF1dGgucmVhc29uLFxuXHR9O1xufVxuXG4vKipcbiAqIENyZWF0ZXMgYSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9ufSBpbiB0aGUgbmF0aXZlIHN0cmVhbWluZyBzdGF0ZSBmb3IgYVxuICogdG9vbCBjYWxsIHRoYXQgaXMgc3RpbGwgc3RyZWFtaW5nIGl0cyBhcmd1bWVudHMgKEFIUFxuICoge0BsaW5rIFRvb2xDYWxsU3RhdHVzLlN0cmVhbWluZ30pLiBUaGUgaW52b2NhdGlvbiBpcyBsYXRlciBkcml2ZW4gb3V0IG9mIHRoZVxuICogc3RyZWFtaW5nIHN0YXRlIHZpYSB7QGxpbmsgQ2hhdFRvb2xJbnZvY2F0aW9uLnRyYW5zaXRpb25Gcm9tU3RyZWFtaW5nfSBvbmNlXG4gKiB0aGUgdG9vbCByZWFjaGVzIGNvbmZpcm1hdGlvbi9ydW5uaW5nLCBzbyBhIHNpbmdsZSBjYXJkIHJlcHJlc2VudHMgdGhlIHdob2xlXG4gKiBsaWZlY3ljbGUgaW5zdGVhZCBvZiBhIHNldHRsZWQgcGxhY2Vob2xkZXIgcGx1cyBhIHJlcGxhY2VtZW50LlxuICovXG5leHBvcnQgZnVuY3Rpb24gdG9vbENhbGxTdGF0ZVRvU3RyZWFtaW5nSW52b2NhdGlvbih0YzogVG9vbENhbGxTdGF0ZSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlPzogVVJJLCBjb25uZWN0aW9uQXV0aG9yaXR5Pzogc3RyaW5nLCBtY3BTZXJ2ZXJBdXRob3JpdHk/OiBzdHJpbmcpOiBDaGF0VG9vbEludm9jYXRpb24ge1xuXHRjb25zdCBpbnZvY2F0aW9uID0gQ2hhdFRvb2xJbnZvY2F0aW9uLmNyZWF0ZVN0cmVhbWluZyh7XG5cdFx0dG9vbENhbGxJZDogdGMudG9vbENhbGxJZCxcblx0XHR0b29sSWQ6IHRjLnRvb2xOYW1lLFxuXHRcdHRvb2xEYXRhOiB7XG5cdFx0XHRpZDogdGMudG9vbE5hbWUsXG5cdFx0XHRzb3VyY2U6IFRvb2xEYXRhU291cmNlLkludGVybmFsLFxuXHRcdFx0ZGlzcGxheU5hbWU6IHRjLmRpc3BsYXlOYW1lLFxuXHRcdFx0bW9kZWxEZXNjcmlwdGlvbjogdGMudG9vbE5hbWUsXG5cdFx0fSxcblx0XHRzdWJhZ2VudEludm9jYXRpb25JZDogc3ViQWdlbnRJbnZvY2F0aW9uSWQsXG5cdH0pO1xuXHR1cGRhdGVTdHJlYW1pbmdUb29sSW52b2NhdGlvbihpbnZvY2F0aW9uLCB0YywgY29ubmVjdGlvbkF1dGhvcml0eSA/PyAnJyk7XG5cdGlmIChpc0FnZW50SG9zdEFza1VzZXJUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmFza1VzZXIuYXNraW5nJywgXCJBc2tpbmcgYSBxdWVzdGlvbi4uLlwiKTtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGU7XG5cdH1cblx0aWYgKHNlc3Npb25SZXNvdXJjZSAmJiBpc1N1YmFnZW50VG9vbCh0YykpIHtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uKHRjLCBzdWJBZ2VudEludm9jYXRpb25JZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5ID8/ICcnLCBtY3BTZXJ2ZXJBdXRob3JpdHkpLnRvb2xTcGVjaWZpY0RhdGE7XG5cdH1cblx0cmV0dXJuIGludm9jYXRpb247XG59XG5cbmZ1bmN0aW9uIGdldFN0cmVhbWluZ1Rvb2xJbnB1dEZvckRpc3BsYXkodGM6IFRvb2xDYWxsU3RhdGUpOiB1bmtub3duIHwgdW5kZWZpbmVkIHtcblx0aWYgKHRjLnN0YXR1cyAhPT0gVG9vbENhbGxTdGF0dXMuU3RyZWFtaW5nIHx8ICF0Yy5wYXJ0aWFsSW5wdXQpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdHJldHVybiBwYXJzZVBhcnRpYWxUb29sSW5wdXRGb3JEaXNwbGF5KHRjLnBhcnRpYWxJbnB1dCkgPz8gdGMucGFydGlhbElucHV0O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gdXBkYXRlU3RyZWFtaW5nVG9vbEludm9jYXRpb24oZXhpc3Rpbmc6IENoYXRUb29sSW52b2NhdGlvbiwgdGM6IFRvb2xDYWxsU3RhdGUsIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHVua25vd24gfCB1bmRlZmluZWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5TdHJlYW1pbmcpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cdC8vIFBhcnRpYWwgcmVhZCBwYXRocyByZW5kZXIgYXMgbWlzbGVhZGluZyBmaWxlIGxpbmtzLCBzbyB3YWl0IGZvciB0aGUgY29tcGxldGUgaW5wdXQuXG5cdGlmIChnZXRUb29sS2luZCh0YykgPT09ICdyZWFkJykge1xuXHRcdGV4aXN0aW5nLnVwZGF0ZVBhcnRpYWxJbnB1dCh1bmRlZmluZWQpO1xuXHRcdGV4aXN0aW5nLnVwZGF0ZVN0cmVhbWluZ01lc3NhZ2UobG9jYWxpemUoJ2FnZW50SG9zdC5zdHJlYW1pbmcucmVhZGluZ0ZpbGUnLCBcIlJlYWRpbmcgZmlsZVwiKSk7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXHRjb25zdCBwYXJ0aWFsSW5wdXQgPSBnZXRTdHJlYW1pbmdUb29sSW5wdXRGb3JEaXNwbGF5KHRjKTtcblx0aWYgKHBhcnRpYWxJbnB1dCAhPT0gdW5kZWZpbmVkKSB7XG5cdFx0ZXhpc3RpbmcudXBkYXRlUGFydGlhbElucHV0KHBhcnRpYWxJbnB1dCk7XG5cdH1cblx0Y29uc3QgaW52b2NhdGlvbk1lc3NhZ2UgPSBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMuaW52b2NhdGlvbk1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHRpZiAoaW52b2NhdGlvbk1lc3NhZ2UpIHtcblx0XHRleGlzdGluZy51cGRhdGVTdHJlYW1pbmdNZXNzYWdlKGludm9jYXRpb25NZXNzYWdlKTtcblx0fVxuXHRyZXR1cm4gcGFydGlhbElucHV0O1xufVxuXG4vKipcbiAqIEV4dHJhY3RzIHRoZSB7QGxpbmsgSVByZXBhcmVkVG9vbEludm9jYXRpb259IGRpc3BsYXkgZmllbGRzIGZvciBhIHRvb2wtY2FsbFxuICogc3RhdGUsIHJldXNpbmcge0BsaW5rIHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb259IHNvIHRoZSBjb25maXJtYXRpb24sXG4gKiB0ZXJtaW5hbCwgYW5kIG90aGVyIGB0b29sU3BlY2lmaWNEYXRhYCBsb2dpYyBzdGF5cyBpbiBvbmUgcGxhY2UuIFVzZWQgdG9cbiAqIHRyYW5zaXRpb24gYSBzdHJlYW1pbmcgaW52b2NhdGlvbiBpbnRvIGl0cyBjb25maXJtYXRpb24vcnVubmluZyBwcmVzZW50YXRpb25cbiAqIHdpdGhvdXQgYWxsb2NhdGluZyBhIHNlY29uZCB2aXNpYmxlIGNhcmQuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB0b29sQ2FsbFN0YXRlVG9QcmVwYXJlZEludm9jYXRpb24odGM6IFRvb2xDYWxsU3RhdGUsIHNlc3Npb25SZXNvdXJjZTogVVJJLCBjb25uZWN0aW9uQXV0aG9yaXR5OiBzdHJpbmcsIG1jcFNlcnZlckF1dGhvcml0eSA9IHNlc3Npb25SZXNvdXJjZS5hdXRob3JpdHksIG9wdGlvbnM/OiBJQWdlbnRIb3N0VG9vbEludm9jYXRpb25PcHRpb25zKTogSVByZXBhcmVkVG9vbEludm9jYXRpb24ge1xuXHRjb25zdCBidWlsdCA9IHRvb2xDYWxsU3RhdGVUb0ludm9jYXRpb24odGMsIHVuZGVmaW5lZCwgc2Vzc2lvblJlc291cmNlLCBjb25uZWN0aW9uQXV0aG9yaXR5LCBtY3BTZXJ2ZXJBdXRob3JpdHksIG9wdGlvbnMpO1xuXHRyZXR1cm4ge1xuXHRcdGludm9jYXRpb25NZXNzYWdlOiBidWlsdC5pbnZvY2F0aW9uTWVzc2FnZSxcblx0XHRwYXN0VGVuc2VNZXNzYWdlOiBidWlsdC5wYXN0VGVuc2VNZXNzYWdlLFxuXHRcdGNvbmZpcm1hdGlvbk1lc3NhZ2VzOiBidWlsdC5jb25maXJtYXRpb25NZXNzYWdlcyxcblx0XHRwcmVzZW50YXRpb246IGJ1aWx0LnByZXNlbnRhdGlvbixcblx0XHR0b29sU3BlY2lmaWNEYXRhOiBidWlsdC50b29sU3BlY2lmaWNEYXRhLFxuXHR9O1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgYSBydW5uaW5nIHRvb2wgaW52b2NhdGlvbidzIGB0b29sU3BlY2lmaWNEYXRhYCBiYXNlZCBvbiB0aGVcbiAqIHByb3RvY29sIHRvb2wgY2FsbCBzdGF0ZS4gSGFuZGxlcyB0ZXJtaW5hbCBhbmQgc3ViYWdlbnQgY29udGVudCBkZXRlY3Rpb24uXG4gKlxuICogQ2FsbGVkIGZyb20gdGhlIHNlc3Npb24gaGFuZGxlciB3aGVuIGEgdG9vbCB0cmFuc2l0aW9ucyB0byBSdW5uaW5nIHN0YXRlXG4gKiB0byBzZXQgdGhlIGluaXRpYWwgYHRvb2xTcGVjaWZpY0RhdGFgLCBvciB3aGVuIGNvbnRlbnQgY2hhbmdlcyBhcnJpdmUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiB1cGRhdGVSdW5uaW5nVG9vbFNwZWNpZmljRGF0YShleGlzdGluZzogQ2hhdFRvb2xJbnZvY2F0aW9uLCB0YzogVG9vbENhbGxTdGF0ZSwgc2Vzc2lvblJlc291cmNlOiBVUkksIGNvbm5lY3Rpb25BdXRob3JpdHk6IHN0cmluZyk6IHZvaWQge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5SdW5uaW5nKSB7XG5cdFx0cmV0dXJuO1xuXHR9XG5cdGV4aXN0aW5nLmludm9jYXRpb25NZXNzYWdlID0gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLmludm9jYXRpb25NZXNzYWdlLCBjb25uZWN0aW9uQXV0aG9yaXR5KSA/PyBleGlzdGluZy5pbnZvY2F0aW9uTWVzc2FnZTtcblx0aWYgKGlzQWdlbnRIb3N0QXNrVXNlclRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0ZXhpc3RpbmcuaW52b2NhdGlvbk1lc3NhZ2UgPSBsb2NhbGl6ZSgnYWdlbnRIb3N0LmFza1VzZXIud2FpdGluZycsIFwiV2FpdGluZyBmb3IgYW5zd2VyLi4uXCIpO1xuXHRcdGV4aXN0aW5nLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbkFmdGVyQ29tcGxldGU7XG5cdH1cblx0aWYgKGlzQWRkQ29tbWVudFRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0ZXhpc3RpbmcuaW52b2NhdGlvbk1lc3NhZ2UgPSBhZGRDb21tZW50UmVmZXJlbmNlKHRjKSA/PyBleGlzdGluZy5pbnZvY2F0aW9uTWVzc2FnZTtcblx0fVxuXG5cblx0Y29uc3Qgc3ViYWdlbnRDb250ZW50ID0gZ2V0VG9vbFN1YmFnZW50Q29udGVudCh0Yyk7XG5cdGlmIChzdWJhZ2VudENvbnRlbnQpIHtcblx0XHRleGlzdGluZy50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdGlzQWN0aXZlOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSA6IHVuZGVmaW5lZCxcblx0XHRcdGRlc2NyaXB0aW9uOiBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YyksXG5cdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudC5hZ2VudE5hbWUsXG5cdFx0XHRjcmVkaXRzOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5jcmVkaXRzIDogdW5kZWZpbmVkLFxuXHRcdFx0bW9kZWxOYW1lOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5tb2RlbE5hbWUgOiB1bmRlZmluZWQsXG5cdFx0XHRzdGFydGVkQXQ6IGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhLnN0YXJ0ZWRBdCA6IHVuZGVmaW5lZCxcblx0XHRcdGR1cmF0aW9uOiBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5kdXJhdGlvbiA6IHVuZGVmaW5lZCxcblx0XHRcdGNoYXRSZXNvdXJjZTogc3ViYWdlbnRDb250ZW50LnJlc291cmNlLFxuXHRcdH07XG5cdFx0Ly8gdG9vbFNwZWNpZmljRGF0YSBpcyBhIHBsYWluIHByb3BlcnR5IFx1MjAxNCBub3RpZnkgc3RhdGUgb2JzZXJ2ZXJzXG5cdFx0Ly8gc28gQ2hhdFN1YmFnZW50Q29udGVudFBhcnQgcmUtcmVhZHMgdGhlIHVwZGF0ZWQgbWV0YWRhdGEuXG5cdFx0ZXhpc3Rpbmcubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZWZyZXNoIHN1YmFnZW50IG1ldGFkYXRhIGZyb20gYF9tZXRhYCAoc2V0IGJ5IHRoZSBldmVudCBtYXBwZXIgZnJvbVxuXHQvLyB0aGUgdG9vbCdzIGFyZ3VtZW50cykgaW4gY2FzZSBpdCBhcnJpdmVkIGFmdGVyIGludm9jYXRpb24gY3JlYXRpb24uXG5cdGlmIChleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnKSB7XG5cdFx0Y29uc3QgZGVzY3JpcHRpb24gPSBnZXRTdWJhZ2VudFRhc2tEZXNjcmlwdGlvbih0YykgPz8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5kZXNjcmlwdGlvbjtcblx0XHRjb25zdCBhZ2VudE5hbWUgPSBnZXRTdWJhZ2VudEFnZW50TmFtZSh0YykgPz8gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWU7XG5cdFx0aWYgKGRlc2NyaXB0aW9uICE9PSBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhLmRlc2NyaXB0aW9uIHx8IGFnZW50TmFtZSAhPT0gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSB7IC4uLmV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEsIGRlc2NyaXB0aW9uLCBhZ2VudE5hbWUgfTtcblx0XHRcdGV4aXN0aW5nLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0fVxuXHRcdHJldHVybjtcblx0fVxuXG5cdC8vIE1vdW50IHRoZSBNQ1AgQXBwIG9uY2UgdGhlIHRvb2wgc3RhcnRzIHJ1bm5pbmcuIFRoZSBjaGFubmVsIGlzIHByZXNlbnRcblx0Ly8gaW4gYF9tZXRhLnVpYCBmcm9tIHRoZSBmaXJzdCB0b29sIHN0YXRlIChhIHRvb2wgY2Fubm90IHN0YXJ0IHVudGlsIGl0c1xuXHQvLyBNQ1Agc2VydmVyIGlzIFJlYWR5KSwgYnV0IGNvbmZpcm1hdGlvbi1nYXRlZCB0b29scyBhcmUgY3JlYXRlZCB3aXRob3V0XG5cdC8vIGBtY3BBcHBEYXRhYCAoc2VlIGB0b29sQ2FsbFN0YXRlVG9JbnZvY2F0aW9uYCksIHNvIHRoaXMgaXMgd2hlcmUgdGhlIEFwcFxuXHQvLyBmaXJzdCBhcHBlYXJzIGZvciB0aGVtLiBgYnVpbGRNY3BBcHBUb29sSW5wdXREYXRhYCByZXR1cm5zIGB1bmRlZmluZWRgXG5cdC8vIGZvciBub24tTUNQIHRvb2xzIChzZWFyY2gsIHRlcm1pbmFsLCBcdTIwMjYpLCBzbyB0aG9zZSBmYWxsIHRocm91Z2ggdG8gdGhlXG5cdC8vIGhhbmRsaW5nIGJlbG93LlxuXHRjb25zdCBleGlzdGluZ0lucHV0ID0gZXhpc3RpbmcudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyA/IGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IG5leHRJbnB1dCA9IGJ1aWxkTWNwQXBwVG9vbElucHV0RGF0YSh0Yywgc2Vzc2lvblJlc291cmNlLCBleGlzdGluZ0lucHV0Py5yYXdJbnB1dCk7XG5cdGlmIChuZXh0SW5wdXQpIHtcblx0XHRpZiAoIWV4aXN0aW5nSW5wdXQgfHwgIWlzU2FtZU1jcEFwcERhdGEoZXhpc3RpbmdJbnB1dC5tY3BBcHBEYXRhLCBuZXh0SW5wdXQubWNwQXBwRGF0YSkpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSBuZXh0SW5wdXQ7XG5cdFx0XHRleGlzdGluZy5ub3RpZnlUb29sU3BlY2lmaWNEYXRhQ2hhbmdlZCgpO1xuXHRcdH1cblx0XHRyZXR1cm47XG5cdH1cblxuXHQvLyBSZWZyZXNoIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgYXMgc3RyZWFtaW5nIHRleHQgY29udGVudCBhcnJpdmVzXG5cdC8vIChvciB3aGVuIHRlcm1pbmFsIHRvb2xTcGVjaWZpY0RhdGEgd2FzIG5vdCBzZXQgdXAtZnJvbnQgYmVjYXVzZSB0aGVcblx0Ly8gdG9vbCB0cmFuc2l0aW9uZWQgdGhyb3VnaCB0aGUgU3RyZWFtaW5nIHN0YXRlIGJlZm9yZSByZWFjaGluZ1xuXHQvLyBSdW5uaW5nKS4gUHJlc2VydmVzIEFIUC10ZXJtaW5hbCBmaWVsZHMgKGB0ZXJtaW5hbFRvb2xTZXNzaW9uSWRgLFxuXHQvLyBgdGVybWluYWxDb21tYW5kVXJpYCwgYHRlcm1pbmFsQ29tbWFuZElkYCkgdGhhdCBgX3Jldml2ZVRlcm1pbmFsSWZOZWVkZWRgXG5cdC8vIGluIHRoZSBzZXNzaW9uIGhhbmRsZXIgcG9wdWxhdGVzIHdoZW4gYSBUZXJtaW5hbFxuXHQvLyBjb250ZW50IGJsb2NrIGlzIHByZXNlbnQuXG5cdGNvbnN0IGV4aXN0aW5nVGVybWluYWwgPSBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnXG5cdFx0PyBleGlzdGluZy50b29sU3BlY2lmaWNEYXRhXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGlmIChpc1Rlcm1pbmFsVG9vbENhbGwodGMsIGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQpKSB7XG5cdFx0Y29uc3QgbmV4dCA9IGJ1aWxkVGVybWluYWxUb29sU3BlY2lmaWNEYXRhKHRjLCBzZXNzaW9uUmVzb3VyY2UsIGV4aXN0aW5nVGVybWluYWwpO1xuXHRcdGNvbnN0IG91dHB1dENoYW5nZWQgPSBuZXh0LnRlcm1pbmFsQ29tbWFuZE91dHB1dD8udGV4dCAhPT0gZXhpc3RpbmdUZXJtaW5hbD8udGVybWluYWxDb21tYW5kT3V0cHV0Py50ZXh0O1xuXHRcdGNvbnN0IGNvbW1hbmRDaGFuZ2VkID0gbmV4dC5jb21tYW5kTGluZS5vcmlnaW5hbCAhPT0gZXhpc3RpbmdUZXJtaW5hbD8uY29tbWFuZExpbmUub3JpZ2luYWw7XG5cdFx0aWYgKCFleGlzdGluZ1Rlcm1pbmFsIHx8IG91dHB1dENoYW5nZWQgfHwgY29tbWFuZENoYW5nZWQpIHtcblx0XHRcdGV4aXN0aW5nLnRvb2xTcGVjaWZpY0RhdGEgPSBuZXh0O1xuXHRcdFx0ZXhpc3Rpbmcubm90aWZ5VG9vbFNwZWNpZmljRGF0YUNoYW5nZWQoKTtcblx0XHR9XG5cdH1cbn1cblxuLyoqXG4gKiBEYXRhIHJldHVybmVkIGJ5IHtAbGluayBmaW5hbGl6ZVRvb2xJbnZvY2F0aW9ufSBkZXNjcmliaW5nIGZpbGUgZWRpdHNcbiAqIHRoYXQgc2hvdWxkIGJlIHJvdXRlZCB0aHJvdWdoIHRoZSBlZGl0aW5nIHNlc3Npb24ncyBleHRlcm5hbCBlZGl0cyBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGludGVyZmFjZSBJVG9vbENhbGxGaWxlRWRpdCB7XG5cdC8qKiBUaGUga2luZCBvZiBmaWxlIG9wZXJhdGlvbi4gKi9cblx0cmVhZG9ubHkga2luZDogRmlsZUVkaXRLaW5kO1xuXHQvKiogVGhlIHByaW1hcnkgZmlsZSBVUkkgKGFmdGVyLVVSSSBmb3IgZWRpdHMvY3JlYXRlcy9yZW5hbWVzLCBiZWZvcmUtVVJJIGZvciBkZWxldGVzKS4gKi9cblx0cmVhZG9ubHkgcmVzb3VyY2U6IFVSSTtcblx0LyoqIEZvciByZW5hbWVzLCB0aGUgb3JpZ2luYWwgZmlsZSBVUkkgYmVmb3JlIHRoZSBtb3ZlLiAqL1xuXHRyZWFkb25seSBvcmlnaW5hbFJlc291cmNlPzogVVJJO1xuXHQvKiogVVJJIHRvIHJlYWQgdGhlIGJlZm9yZS1zbmFwc2hvdCBjb250ZW50IGZyb20uIEFic2VudCBmb3IgY3JlYXRlcy4gKi9cblx0cmVhZG9ubHkgYmVmb3JlQ29udGVudFVyaT86IFVSSTtcblx0LyoqIFVSSSB0byByZWFkIHRoZSBhZnRlci1jb250ZW50IGZyb20uIEFic2VudCBmb3IgZGVsZXRlcy4gKi9cblx0cmVhZG9ubHkgYWZ0ZXJDb250ZW50VXJpPzogVVJJO1xuXHQvKiogVW5kbyBzdG9wIElEIGZvciBncm91cGluZyBlZGl0cy4gKi9cblx0cmVhZG9ubHkgdW5kb1N0b3BJZDogc3RyaW5nO1xuXHQvKiogT3B0aW9uYWwgZGlmZiBkaXNwbGF5IG1ldGFkYXRhLiAqL1xuXHRyZWFkb25seSBkaWZmPzogeyBhZGRlZD86IG51bWJlcjsgcmVtb3ZlZD86IG51bWJlciB9O1xufVxuXG4vKipcbiAqIFVwZGF0ZXMgYSBsaXZlIHtAbGluayBDaGF0VG9vbEludm9jYXRpb259IHdpdGggY29tcGxldGlvbiBkYXRhIGZyb20gdGhlXG4gKiBwcm90b2NvbCdzIHRvb2wtY2FsbCBzdGF0ZSwgdHJhbnNpdGlvbmluZyBpdCB0byB0aGUgY29tcGxldGVkIHN0YXRlLlxuICpcbiAqIFJldHVybnMgZmlsZSBlZGl0cyB0aGF0IHRoZSBjYWxsZXIgc2hvdWxkIHJvdXRlIHRocm91Z2ggdGhlIGVkaXRpbmdcbiAqIHNlc3Npb24ncyBleHRlcm5hbCBlZGl0cyBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbmFsaXplVG9vbEludm9jYXRpb24oaW52b2NhdGlvbjogQ2hhdFRvb2xJbnZvY2F0aW9uLCB0YzogVG9vbENhbGxTdGF0ZSwgYmFja2VuZFNlc3Npb246IFVSSSwgY29ubmVjdGlvbkF1dGhvcml0eTogc3RyaW5nKTogSVRvb2xDYWxsRmlsZUVkaXRbXSB7XG5cdGNvbnN0IGlzQ29tcGxldGVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQ7XG5cdGNvbnN0IGlzQ2FuY2VsbGVkID0gdGMuc3RhdHVzID09PSBUb29sQ2FsbFN0YXR1cy5DYW5jZWxsZWQ7XG5cdGNvbnN0IGlzVGVybWluYWwgPSBpc1Rlcm1pbmFsVG9vbENhbGwodGMsIGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCk7XG5cblx0aWYgKChpc0NvbXBsZXRlZCB8fCBpc0NhbmNlbGxlZCkgJiYgaGFzS2V5KHRjLCB7IGludm9jYXRpb25NZXNzYWdlOiB0cnVlIH0pKSB7XG5cdFx0aW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZSA9IHN0cmluZ09yTWFya2Rvd25Ub1N0cmluZyh0Yy5pbnZvY2F0aW9uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgPz8gaW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0fVxuXHQvLyBUb29scyB0aGF0IHJlbmRlciBhIGJlc3Bva2UsIGNsaWVudC1hdXRob3JlZCBtZXNzYWdlIG92ZXJyaWRlIHRoZVxuXHQvLyBpbnZvY2F0aW9uIHRleHQgaGVyZS4gQWRkIG5ldyBwZXItdG9vbCBjYXNlcyBhbG9uZ3NpZGUgdGhpcyBicmFuY2guXG5cdGlmIChpc0FkZENvbW1lbnRUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24uaW52b2NhdGlvbk1lc3NhZ2UgPSBhZGRDb21tZW50UmVmZXJlbmNlKHRjKSA/PyBpbnZvY2F0aW9uLmludm9jYXRpb25NZXNzYWdlO1xuXHR9XG5cdGlmIChpc0FnZW50SG9zdEFza1VzZXJUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24ucHJlc2VudGF0aW9uID0gVG9vbEludm9jYXRpb25QcmVzZW50YXRpb24uSGlkZGVuQWZ0ZXJDb21wbGV0ZTtcblx0fVxuXG5cdC8vIENoZWNrIGZvciBzdWJhZ2VudCBjb250ZW50IFx1MjAxNCBzZXQgdG9vbFNwZWNpZmljRGF0YSBzbyB0aGUgVUkgcmVuZGVycyBhIHN1YmFnZW50IHdpZGdldFxuXHRpZiAoaXNDb21wbGV0ZWQpIHtcblx0XHRjb25zdCBzdWJhZ2VudENvbnRlbnQgPSBnZXRUb29sU3ViYWdlbnRDb250ZW50KHRjKTtcblx0XHRpZiAoc3ViYWdlbnRDb250ZW50KSB7XG5cdFx0XHRjb25zdCByZXN1bHRUZXh0ID0gZ2V0VG9vbE91dHB1dFRleHQodGMpO1xuXHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0ge1xuXHRcdFx0XHRraW5kOiAnc3ViYWdlbnQnLFxuXHRcdFx0XHRpc0FjdGl2ZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmlzQWN0aXZlIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkZXNjcmlwdGlvbjogZ2V0U3ViYWdlbnRUYXNrRGVzY3JpcHRpb24odGMpLFxuXHRcdFx0XHRhZ2VudE5hbWU6IHN1YmFnZW50Q29udGVudC5hZ2VudE5hbWUsXG5cdFx0XHRcdHJlc3VsdDogcmVzdWx0VGV4dCxcblx0XHRcdFx0Y3JlZGl0czogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNyZWRpdHMgOiB1bmRlZmluZWQsXG5cdFx0XHRcdG1vZGVsTmFtZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLm1vZGVsTmFtZSA6IHVuZGVmaW5lZCxcblx0XHRcdFx0c3RhcnRlZEF0OiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcgPyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuc3RhcnRlZEF0IDogdW5kZWZpbmVkLFxuXHRcdFx0XHRkdXJhdGlvbjogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmR1cmF0aW9uIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRjaGF0UmVzb3VyY2U6IGdldFN1YmFnZW50Q2hhdFJlc291cmNlKHRjLCBzdWJhZ2VudENvbnRlbnQsIGJhY2tlbmRTZXNzaW9uKSxcblx0XHRcdH07XG5cdFx0fSBlbHNlIGlmIChpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzdWJhZ2VudCcpIHtcblx0XHRcdC8vIFN1YmFnZW50LXNwYXduaW5nIHRvb2wgdGhhdCBjb21wbGV0ZWQgd2l0aG91dCBhIFN1YmFnZW50IGNvbnRlbnRcblx0XHRcdC8vIGJsb2NrLiBSZWZyZXNoIG1ldGFkYXRhICsgY2FycnkgdGhlIHRvb2wncyBvdXRwdXQgYXMgdGhlIHJlc3VsdC5cblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHtcblx0XHRcdFx0a2luZDogJ3N1YmFnZW50Jyxcblx0XHRcdFx0aXNBY3RpdmU6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5pc0FjdGl2ZSxcblx0XHRcdFx0ZGVzY3JpcHRpb246IGdldFN1YmFnZW50VGFza0Rlc2NyaXB0aW9uKHRjKSA/PyBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZGVzY3JpcHRpb24sXG5cdFx0XHRcdGFnZW50TmFtZTogZ2V0U3ViYWdlbnRBZ2VudE5hbWUodGMpID8/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5hZ2VudE5hbWUsXG5cdFx0XHRcdHJlc3VsdDogZ2V0VG9vbE91dHB1dFRleHQodGMpLFxuXHRcdFx0XHRjcmVkaXRzOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuY3JlZGl0cyxcblx0XHRcdFx0bW9kZWxOYW1lOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubW9kZWxOYW1lLFxuXHRcdFx0XHRzdGFydGVkQXQ6IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YS5zdGFydGVkQXQsXG5cdFx0XHRcdGR1cmF0aW9uOiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEuZHVyYXRpb24sXG5cdFx0XHRcdGNoYXRSZXNvdXJjZTogaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLmNoYXRSZXNvdXJjZSA/PyBnZXRTdWJhZ2VudENoYXRSZXNvdXJjZSh0YywgdW5kZWZpbmVkLCBiYWNrZW5kU2Vzc2lvbiksXG5cdFx0XHR9O1xuXHRcdH1cblx0fVxuXG5cdGlmIChpc1Rlcm1pbmFsICYmIChpc0NvbXBsZXRlZCB8fCBpc0NhbmNlbGxlZCkpIHtcblx0XHRjb25zdCBleGlzdGluZyA9IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJyA/IGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA6IHVuZGVmaW5lZDtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEgPSB7XG5cdFx0XHQuLi5idWlsZFRlcm1pbmFsVG9vbFNwZWNpZmljRGF0YSh0YywgYmFja2VuZFNlc3Npb24sIGV4aXN0aW5nKSxcblx0XHRcdHRlcm1pbmFsQ29tbWFuZFN0YXRlOiBnZXRUZXJtaW5hbENvbW1hbmRTdGF0ZSh0YywgaXNDb21wbGV0ZWQgJiYgdGMuc3VjY2VzcyksXG5cdFx0fTtcblx0fSBlbHNlIGlmIChpc0NvbXBsZXRlZCAmJiB0Yy5wYXN0VGVuc2VNZXNzYWdlKSB7XG5cdFx0aW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID0gc3RyaW5nT3JNYXJrZG93blRvU3RyaW5nKHRjLnBhc3RUZW5zZU1lc3NhZ2UsIGNvbm5lY3Rpb25BdXRob3JpdHkpO1xuXHR9XG5cdC8vIFRvb2xzIHRoYXQgcmVuZGVyIGEgYmVzcG9rZSwgY2xpZW50LWF1dGhvcmVkIG1lc3NhZ2Ugb3ZlcnJpZGUgdGhlXG5cdC8vIHBhc3QtdGVuc2UgdGV4dCBoZXJlLiBBZGQgbmV3IHBlci10b29sIGNhc2VzIGFsb25nc2lkZSB0aGlzIGJyYW5jaC5cblx0aWYgKGlzQ29tcGxldGVkICYmIGlzQWRkQ29tbWVudFRvb2wodGMudG9vbE5hbWUpKSB7XG5cdFx0aW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlID0gYWRkQ29tbWVudFJlZmVyZW5jZSh0YykgPz8gaW52b2NhdGlvbi5wYXN0VGVuc2VNZXNzYWdlO1xuXHR9XG5cblx0aWYgKGlzQ29tcGxldGVkKSB7XG5cdFx0Y29uc3QgcmVzdWx0VG9vbFNwZWNpZmljRGF0YSA9IGJ1aWxkU2Vzc2lvbkNyZWF0ZWRUb29sRGF0YSh0YykgPz8gYnVpbGRHZW5lcmF0ZWRJbWFnZVRvb2xEYXRhKHRjKSA/PyBidWlsZEF1dG9tYXRpb25Db25maWd1cmVkVG9vbERhdGEodGMpO1xuXHRcdGlmIChyZXN1bHRUb29sU3BlY2lmaWNEYXRhKSB7XG5cdFx0XHQvLyBUaGUgdG9vbCByZXF1aXJlZCBjb25maXJtYXRpb24sIHNvIGl0IHdhcyBjcmVhdGVkIHdpdGhcblx0XHRcdC8vIGBIaWRkZW5BZnRlckNvbXBsZXRlYDsgY2xlYXIgaXQgc28gdGhlIHJlc3VsdCBwaWxsIHN0YXlzIHZpc2libGUuXG5cdFx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IHVuZGVmaW5lZDtcblx0XHRcdGludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YSA9IHJlc3VsdFRvb2xTcGVjaWZpY0RhdGE7XG5cdFx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0fVxuXHR9XG5cblx0aWYgKGlzQ29tcGxldGVkKSB7XG5cdFx0Y29uc3QgbWNwQXBwSW5wdXQgPSBidWlsZE1jcEFwcFRvb2xJbnB1dERhdGEoXG5cdFx0XHR0Yyxcblx0XHRcdGJhY2tlbmRTZXNzaW9uLFxuXHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhLnJhd0lucHV0IDogdW5kZWZpbmVkLFxuXHRcdCk7XG5cdFx0aWYgKG1jcEFwcElucHV0KSB7XG5cdFx0XHRjb25zdCBleGlzdGluZ0lucHV0ID0gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnaW5wdXQnID8gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhIDogdW5kZWZpbmVkO1xuXHRcdFx0aW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhID0gbWNwQXBwSW5wdXQ7XG5cdFx0XHRpZiAoIWV4aXN0aW5nSW5wdXQgfHwgIWlzU2FtZU1jcEFwcERhdGEoZXhpc3RpbmdJbnB1dC5tY3BBcHBEYXRhLCBtY3BBcHBJbnB1dC5tY3BBcHBEYXRhKSkge1xuXHRcdFx0XHRpbnZvY2F0aW9uLm5vdGlmeVRvb2xTcGVjaWZpY0RhdGFDaGFuZ2VkKCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0Y29uc3QgaXNGYWlsdXJlID0gKGlzQ29tcGxldGVkICYmICF0Yy5zdWNjZXNzKSB8fCBpc0NhbmNlbGxlZDtcblx0Y29uc3QgZXJyb3JNZXNzYWdlID0gaXNDb21wbGV0ZWQgPyB0Yy5lcnJvcj8ubWVzc2FnZSA6IChpc0NhbmNlbGxlZCA/IHRjLnJlYXNvbk1lc3NhZ2UgOiB1bmRlZmluZWQpO1xuXHRjb25zdCBlcnJvclN0cmluZyA9IHR5cGVvZiBlcnJvck1lc3NhZ2UgPT09ICdzdHJpbmcnID8gZXJyb3JNZXNzYWdlIDogZXJyb3JNZXNzYWdlPy5tYXJrZG93bjtcblx0Y29uc3QgZmlsZUVkaXRzID0gaXNDb21wbGV0ZWQgPyBmaWxlRWRpdHNUb0V4dGVybmFsRWRpdHModGMpIDogW107XG5cdGlmIChpc0FnZW50SG9zdEFza1VzZXJUb29sKHRjLnRvb2xOYW1lKSkge1xuXHRcdGludm9jYXRpb24ucHJlc2VudGF0aW9uID0gc2hvdWxkSGlkZUNvbXBsZXRlZEFnZW50SG9zdEFza1VzZXJUb29sKHRjKVxuXHRcdFx0PyBUb29sSW52b2NhdGlvblByZXNlbnRhdGlvbi5IaWRkZW5BZnRlckNvbXBsZXRlXG5cdFx0XHQ6IHVuZGVmaW5lZDtcblx0fVxuXG5cdC8vIEhpZGUgdGhlIHRvb2wgd2lkZ2V0IHdoZW4gZmlsZSBlZGl0cyBhcmUgc2hvd24gc2VwYXJhdGVseSB2aWEgb25GaWxlRWRpdHNcblx0aWYgKGZpbGVFZGl0cy5sZW5ndGggPiAwICYmICFpc0ZhaWx1cmUpIHtcblx0XHRpbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9IFRvb2xJbnZvY2F0aW9uUHJlc2VudGF0aW9uLkhpZGRlbjtcblx0fVxuXG5cdGNvbnN0IGhhc01jcEFwcERhdGEgPSBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdpbnB1dCcgJiYgISFpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YTtcblx0Ly8gVGhlIGdlbmVyaWMgcmF3IGlucHV0L291dHB1dCBkZXRhaWxzICh0aGUgZXhwYW5kYWJsZSBKU09OIGJsb2IpIGFyZVxuXHQvLyBzdXBwcmVzc2VkIGZvciB0b29sIGtpbmRzIHRoYXQgcmVuZGVyIHRoZWlyIG93biBiZXNwb2tlIFVJIFx1MjAxNCB0aGUgc3ViYWdlbnRcblx0Ly8gY2FyZCBhbmQgdGhlIGBzZXNzaW9uQ3JlYXRlZGAgXCJPcGVuIFNlc3Npb25cIiBwaWxsIFx1MjAxNCBzbyB3ZSBkb24ndCBkdXBsaWNhdGVcblx0Ly8gdGhlIHJlc3VsdCB1bmRlcm5lYXRoIHRoZW0uIFNlYXJjaCByZXN1bHRzIGFuZCBzZXBhcmF0ZWx5LXJlbmRlcmVkIGZpbGVcblx0Ly8gZWRpdHMgYXJlIGxpa2V3aXNlIGV4Y2x1ZGVkLlxuXHRjb25zdCByZXN1bHREZXRhaWxzID0gIWlzVGVybWluYWxcblx0XHQmJiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgIT09ICdzdWJhZ2VudCdcblx0XHQmJiBpbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgIT09ICdzZXNzaW9uQ3JlYXRlZCdcblx0XHQmJiBnZXRUb29sS2luZCh0YykgIT09ICdzZWFyY2gnXG5cdFx0JiYgZmlsZUVkaXRzLmxlbmd0aCA9PT0gMFxuXHRcdD8gZ2V0VG9vbElucHV0T3V0cHV0RGV0YWlscyh0YywgaXNGYWlsdXJlLCBlcnJvclN0cmluZywgaGFzTWNwQXBwRGF0YSwgY29ubmVjdGlvbkF1dGhvcml0eSlcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29uc3QgcmVzdWx0OiBJVG9vbFJlc3VsdCB8IHVuZGVmaW5lZCA9IGlzRmFpbHVyZSB8fCByZXN1bHREZXRhaWxzXG5cdFx0PyB7IGNvbnRlbnQ6IFtdLCB0b29sUmVzdWx0RXJyb3I6IGlzRmFpbHVyZSA/IGVycm9yU3RyaW5nIDogdW5kZWZpbmVkLCB0b29sUmVzdWx0RGV0YWlsczogcmVzdWx0RGV0YWlscyB9XG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGNhbmNlbGxlZEZyb21TdHJlYW1pbmcgPSBpc0NhbmNlbGxlZCAmJiBpbnZvY2F0aW9uLmNhbmNlbEZyb21TdHJlYW1pbmcoXG5cdFx0dGMucmVhc29uID09PSBUb29sQ2FsbENhbmNlbGxhdGlvblJlYXNvbi5Ta2lwcGVkID8gVG9vbENvbmZpcm1LaW5kLlNraXBwZWQgOiBUb29sQ29uZmlybUtpbmQuRGVuaWVkLFxuXHRcdHRjLnJlYXNvbk1lc3NhZ2UgPyBzdHJpbmdPck1hcmtkb3duVG9TdHJpbmcodGMucmVhc29uTWVzc2FnZSwgY29ubmVjdGlvbkF1dGhvcml0eSkgOiB1bmRlZmluZWQsXG5cdCk7XG5cdGlmICghY2FuY2VsbGVkRnJvbVN0cmVhbWluZykge1xuXHRcdGludm9jYXRpb24uZGlkRXhlY3V0ZVRvb2wocmVzdWx0KTtcblx0fVxuXG5cdHJldHVybiBmaWxlRWRpdHM7XG59XG5cbi8qKlxuICogRXh0cmFjdHMgZmlsZSBlZGl0IGNvbnRlbnQgZW50cmllcyBmcm9tIGEgY29tcGxldGVkIHRvb2wgY2FsbCBhbmRcbiAqIGNvbnZlcnRzIHRoZW0gdG8ge0BsaW5rIElUb29sQ2FsbEZpbGVFZGl0fSBkYXRhIGZvciByb3V0aW5nIHRocm91Z2hcbiAqIHRoZSBlZGl0aW5nIHNlc3Npb24ncyBleHRlcm5hbCBlZGl0cyBwaXBlbGluZS5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZpbGVFZGl0c1RvRXh0ZXJuYWxFZGl0cyh0YzogVG9vbENhbGxTdGF0ZSk6IElUb29sQ2FsbEZpbGVFZGl0W10ge1xuXHRpZiAodGMuc3RhdHVzICE9PSBUb29sQ2FsbFN0YXR1cy5Db21wbGV0ZWQpIHtcblx0XHRyZXR1cm4gW107XG5cdH1cblx0Y29uc3QgZWRpdHMgPSBnZXRUb29sRmlsZUVkaXRzKHRjKTtcblx0aWYgKGVkaXRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbXTtcblx0fVxuXHRyZXR1cm4gbWFwRmlsZUVkaXRzKGVkaXRzLCB0Yy50b29sQ2FsbElkKTtcbn1cblxuLyoqXG4gKiBUcmFuc2xhdGVzIGEgbGlzdCBvZiB7QGxpbmsgRmlsZUVkaXR9IHJlY29yZHMgaW50byB7QGxpbmsgSVRvb2xDYWxsRmlsZUVkaXR9XG4gKiBlbnRyaWVzIHN1aXRhYmxlIGZvciB0aGUgZXh0ZXJuYWwgZWRpdHMgcGlwZWxpbmUgb3IgdGhlIGNoYXQgbW9kaWZpZWQtZmlsZXNcbiAqIGNvbmZpcm1hdGlvbiBVSS4gU2hhcmVkIGJldHdlZW4gY29tcGxldGVkIHRvb2wgZWRpdHMgYW5kIHBlbmRpbmcgd3JpdGVcbiAqIGNvbmZpcm1hdGlvbnMuXG4gKi9cbmZ1bmN0aW9uIG1hcEZpbGVFZGl0cyhpdGVtczogcmVhZG9ubHkgRmlsZUVkaXRbXSwgdW5kb1N0b3BJZDogc3RyaW5nKTogSVRvb2xDYWxsRmlsZUVkaXRbXSB7XG5cdGNvbnN0IHJlc3VsdDogSVRvb2xDYWxsRmlsZUVkaXRbXSA9IFtdO1xuXHRmb3IgKGNvbnN0IGVkaXQgb2YgaXRlbXMpIHtcblx0XHRjb25zdCBub3JtYWxpemVkID0gbm9ybWFsaXplRmlsZUVkaXQoZWRpdCk7XG5cdFx0aWYgKCFub3JtYWxpemVkKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cblx0XHRyZXN1bHQucHVzaCh7XG5cdFx0XHRraW5kOiBub3JtYWxpemVkLmtpbmQsXG5cdFx0XHRyZXNvdXJjZTogbm9ybWFsaXplZC5yZXNvdXJjZSxcblx0XHRcdG9yaWdpbmFsUmVzb3VyY2U6IG5vcm1hbGl6ZWQua2luZCA9PT0gRmlsZUVkaXRLaW5kLlJlbmFtZSA/IG5vcm1hbGl6ZWQuYmVmb3JlVXJpIDogdW5kZWZpbmVkLFxuXHRcdFx0YmVmb3JlQ29udGVudFVyaTogbm9ybWFsaXplZC5iZWZvcmVDb250ZW50VXJpLFxuXHRcdFx0YWZ0ZXJDb250ZW50VXJpOiBub3JtYWxpemVkLmFmdGVyQ29udGVudFVyaSxcblx0XHRcdHVuZG9TdG9wSWQsXG5cdFx0XHRkaWZmOiBlZGl0LmRpZmYsXG5cdFx0fSk7XG5cdH1cblx0cmV0dXJuIHJlc3VsdDtcbn1cbiJdLAogICJtYXBwaW5ncyI6ICJBQUtBLFNBQVMsb0JBQW9CO0FBQzdCLFNBQVMsZUFBZTtBQUN4QixTQUFTLHlCQUEwQyxzQkFBc0I7QUFDekUsU0FBUyxtQkFBbUI7QUFFNUIsU0FBUyx3QkFBd0IsNkJBQTZCO0FBQzlELFNBQVMsZUFBZTtBQUN4QixTQUFTLE9BQU8sYUFBYTtBQUM3QixTQUFTLFdBQVc7QUFDcEIsU0FBUyxvQkFBb0I7QUFDN0IsU0FBUyxzQkFBc0IsK0JBQStCLGFBQWEsNEJBQTRCLHlCQUF5Qiw4QkFBOEIsZ0JBQWdCLFdBQVcsa0JBQWtCLG9CQUFvQixrQkFBa0IsbUJBQW1CLHdCQUF3QixrQkFBa0IsbUJBQW1CLHNCQUFzQiwwQkFBMEIsdUJBQXVCLHVCQUE2UixjQUFjLDZCQUF5RjtBQUU1d0IsU0FBUyxtQkFBbUI7QUFDNUIsU0FBUyx3QkFBd0I7QUFDakMsU0FBUyxtQ0FBc0Q7QUFDL0QsU0FBUyxtQkFBbUIsc0JBQXNCO0FBQ2xELFNBQVMsdUNBQXVDLHlDQUF5QztBQUN6RixTQUFTLGdDQUFnQztBQUN6QyxTQUFTLG9DQUFvQyxzQ0FBc0MsaUNBQWlDO0FBQ3BILFNBQVMsa0NBQWtDLCtCQUErQjtBQUMxRSxTQUFTLHNDQUFzQztBQUMvQyxTQUFTLDZCQUE2QixpQ0FBaUMsdUNBQXVDO0FBQzlHLFNBQVMsOEJBQThCLHdCQUF3QjtBQUMvRCxTQUFTLGtCQUFrQixxQkFBcUIsbUJBQW1CLDRCQUE0QiwrQkFBK0I7QUFDOUgsU0FBUyx1Q0FBdUM7QUFDaEQsU0FBUyw2QkFBMkc7QUFDcEgsU0FBUyx5QkFBeUI7QUFDbEMsU0FBUyxvQkFBb0I7QUFD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QUNBLE1BQUksQ0FBQyx3QkFBd0I7QUFDNUIsZUFBVyxlQUFlLE1BQU07QUFBQSxFQUNqQztBQUVBLFNBQU87QUFDUjtBQU9PLFNBQVMseUJBQXlCLElBQXdDO0FBQ2hGLE1BQUksR0FBRyxXQUFXLGVBQWUsV0FBVztBQUMzQyxXQUFPLENBQUM7QUFBQSxFQUNUO0FBQ0EsUUFBTSxRQUFRLGlCQUFpQixFQUFFO0FBQ2pDLE1BQUksTUFBTSxXQUFXLEdBQUc7QUFDdkIsV0FBTyxDQUFDO0FBQUEsRUFDVDtBQUNBLFNBQU8sYUFBYSxPQUFPLEdBQUcsVUFBVTtBQUN6QztBQVFBLFNBQVMsYUFBYSxPQUE0QixZQUF5QztBQUMxRixRQUFNLFNBQThCLENBQUM7QUFDckMsYUFBVyxRQUFRLE9BQU87QUFDekIsVUFBTSxhQUFhLGtCQUFrQixJQUFJO0FBQ3pDLFFBQUksQ0FBQyxZQUFZO0FBQ2hCO0FBQUEsSUFDRDtBQUVBLFdBQU8sS0FBSztBQUFBLE1BQ1gsTUFBTSxXQUFXO0FBQUEsTUFDakIsVUFBVSxXQUFXO0FBQUEsTUFDckIsa0JBQWtCLFdBQVcsU0FBUyxhQUFhLFNBQVMsV0FBVyxZQUFZO0FBQUEsTUFDbkYsa0JBQWtCLFdBQVc7QUFBQSxNQUM3QixpQkFBaUIsV0FBVztBQUFBLE1BQzVCO0FBQUEsTUFDQSxNQUFNLEtBQUs7QUFBQSxJQUNaLENBQUM7QUFBQSxFQUNGO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJmZWVkYmFjayIsICJwYXN0VGVuc2VNc2ciLCAiaW52b2NhdGlvbiJdCn0K
