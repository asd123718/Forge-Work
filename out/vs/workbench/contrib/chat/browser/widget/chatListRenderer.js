var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __decorateClass = (decorators, target, key, kind) => {
  var result = kind > 1 ? void 0 : kind ? __getOwnPropDesc(target, key) : target;
  for (var i = decorators.length - 1, decorator; i >= 0; i--)
    if (decorator = decorators[i])
      result = (kind ? decorator(target, key, result) : decorator(result)) || result;
  if (kind && result) __defProp(target, key, result);
  return result;
};
var __decorateParam = (index, decorator) => (target, key) => decorator(target, key, index);
import * as dom from "../../../../../base/browser/dom.js";
import { renderFormattedText } from "../../../../../base/browser/formattedTextRenderer.js";
import { StandardKeyboardEvent } from "../../../../../base/browser/keyboardEvent.js";
import { alert } from "../../../../../base/browser/ui/aria/aria.js";
import { getDefaultHoverDelegate } from "../../../../../base/browser/ui/hover/hoverDelegateFactory.js";
import { CachedListVirtualDelegate } from "../../../../../base/browser/ui/list/list.js";
import { coalesce, distinct } from "../../../../../base/common/arrays.js";
import { Codicon } from "../../../../../base/common/codicons.js";
import { toErrorMessage } from "../../../../../base/common/errorMessage.js";
import { canceledName } from "../../../../../base/common/errors.js";
import { Emitter, Event } from "../../../../../base/common/event.js";
import { MarkdownString, escapeMarkdownSyntaxTokens } from "../../../../../base/common/htmlContent.js";
import { Iterable } from "../../../../../base/common/iterator.js";
import { KeyCode } from "../../../../../base/common/keyCodes.js";
import { Disposable, DisposableMap, DisposableStore, MutableDisposable, dispose, toDisposable } from "../../../../../base/common/lifecycle.js";
import { ResourceMap } from "../../../../../base/common/map.js";
import { FileAccess, Schemas } from "../../../../../base/common/network.js";
import { clamp, formatTokenCount } from "../../../../../base/common/numbers.js";
import { ThemeIcon } from "../../../../../base/common/themables.js";
import { URI } from "../../../../../base/common/uri.js";
import { localize } from "../../../../../nls.js";
import { MenuEntryActionViewItem, createActionViewItem } from "../../../../../platform/actions/browser/menuEntryActionViewItem.js";
import { MenuWorkbenchToolBar } from "../../../../../platform/actions/browser/toolbar.js";
import { MenuId, MenuItemAction } from "../../../../../platform/actions/common/actions.js";
import { ICommandService } from "../../../../../platform/commands/common/commands.js";
import { IConfigurationService } from "../../../../../platform/configuration/common/configuration.js";
import { IContextKeyService } from "../../../../../platform/contextkey/common/contextkey.js";
import { IHoverService } from "../../../../../platform/hover/browser/hover.js";
import { IInstantiationService } from "../../../../../platform/instantiation/common/instantiation.js";
import { ServiceCollection } from "../../../../../platform/instantiation/common/serviceCollection.js";
import { ILogService } from "../../../../../platform/log/common/log.js";
import { isDark } from "../../../../../platform/theme/common/theme.js";
import { IThemeService } from "../../../../../platform/theme/common/themeService.js";
import { AccessibilitySignal, IAccessibilitySignalService } from "../../../../../platform/accessibilitySignal/browser/accessibilitySignalService.js";
import { parseRemoteAgentHostSessionTypeAuthority } from "../../../../../platform/agentHost/common/agentHostSessionType.js";
import { isCreateChatTool, isCreateSessionTool, isSendMessageTool } from "../../../../../platform/agentHost/common/openSessionLink.js";
import { IChatEntitlementService } from "../../../../services/chat/common/chatEntitlementService.js";
import { CodiconActionViewItem } from "../../../notebook/browser/view/cellParts/cellActionView.js";
import { annotateSpecialMarkdownContent, extractSubAgentInvocationIdFromText, hasCodeblockUriTag, hasEditCodeblockUriTag } from "../../common/widget/annotations.js";
import { checkModeOption } from "../../common/chat.js";
import { ChatContextKeys } from "../../common/actions/chatContextKeys.js";
import { chatSubcommandLeader } from "../../common/requestParser/chatParserTypes.js";
import { ChatAgentVoteDirection, ChatErrorLevel, ChatRequestQueueKind, IChatService, IChatToolInvocation, isChatFollowup } from "../../common/chatService/chatService.js";
import { ChatPlanReviewData } from "../../common/model/chatProgressTypes/chatPlanReviewData.js";
import { ChatQuestionCarouselData } from "../../common/model/chatProgressTypes/chatQuestionCarouselData.js";
import { localChatSessionType, SessionType } from "../../common/chatSessionsService.js";
import { getChatSessionType } from "../../common/model/chatUri.js";
import { getExplicitFileOrImageAttachmentSummary, isExplicitFileOrImageVariableEntry, isPasteVariableEntry } from "../../common/attachments/chatVariableEntries.js";
import { getStickyScrollTargetItem, isRequestVM, isResponseVM, isPendingDividerVM } from "../../common/model/chatViewModel.js";
import { getNWords } from "../../common/model/chatWordCounter.js";
import { CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, ChatAgentLocation, ChatConfiguration, ChatModeKind, CollapsedToolsDisplayMode, ThinkingDisplayMode } from "../../common/constants.js";
import { formatChatRequestTimestamp, formatChatResponseDetails, formatChatResponseElapsedTime } from "../../common/chatProgressFormatting.js";
import { ClickAnimation } from "../../../../../base/browser/ui/animations/animations.js";
import { ForkConversationActionId } from "../actions/chatForkActions.js";
import { MarkHelpfulActionId } from "../actions/chatTitleActions.js";
import { IChatWidgetService } from "../chat.js";
import { AgentHostSnapshotController } from "../agentSessions/agentHost/agentHostSnapshotController.js";
import { RestoreCheckpointActionId, StartOverActionId } from "../chatEditing/chatEditingActions.js";
import { ChatForkActionViewItem } from "./chatForkActionViewItem.js";
import { ChatRestoreCheckpointActionViewItem } from "./chatRestoreCheckpointActionViewItem.js";
import { ChatAgentHover, getChatAgentHoverOptions } from "./chatAgentHover.js";
import { ChatContentMarkdownRenderer } from "./chatContentMarkdownRenderer.js";
import { ChatAgentCommandContentPart } from "./chatContentParts/chatAgentCommandContentPart.js";
import { ChatAnonymousRateLimitedPart } from "./chatContentParts/chatAnonymousRateLimitedPart.js";
import { ChatAttachmentsContentPart } from "./chatContentParts/chatAttachmentsContentPart.js";
import { ChatAutoModeResolutionContentPart } from "./chatContentParts/chatAutoModeResolutionContentPart.js";
import { ChatCheckpointFileChangesSummaryContentPart } from "./chatContentParts/chatChangesSummaryPart.js";
import { ChatTurnPillsContentPart } from "./chatContentParts/chatTurnPillsPart.js";
import { isChatTurnStatusPillsEnabled } from "./chatTurnPills.js";
import { ChatCodeCitationContentPart } from "./chatContentParts/chatCodeCitationContentPart.js";
import { ChatCollapsibleContentPart } from "./chatContentParts/chatCollapsibleContentPart.js";
import { ChatCommandButtonContentPart } from "./chatContentParts/chatCommandContentPart.js";
import { ChatConfirmationContentPart } from "./chatContentParts/chatConfirmationContentPart.js";
import { DiffEditorPool, EditorPool } from "./chatContentParts/chatContentCodePools.js";
import { InlineTextModelCollection } from "./chatContentParts/chatContentParts.js";
import { ChatElicitationContentPart } from "./chatContentParts/chatElicitationContentPart.js";
import { ChatErrorConfirmationContentPart } from "./chatContentParts/chatErrorConfirmationPart.js";
import { ChatErrorContentPart } from "./chatContentParts/chatErrorContentPart.js";
import { ChatPlanReviewPart } from "./chatContentParts/chatPlanReviewPart.js";
import { ChatQuestionCarouselPart } from "./chatContentParts/chatQuestionCarouselPart.js";
import { ChatExtensionsContentPart } from "./chatContentParts/chatExtensionsContentPart.js";
import { ChatMarkdownContentPart, codeblockHasClosingBackticks } from "./chatContentParts/chatMarkdownContentPart.js";
import { ChatMcpServersInteractionContentPart } from "./chatContentParts/chatMcpServersInteractionContentPart.js";
import { ChatMcpAuthenticationContentPart } from "./chatContentParts/chatMcpAuthenticationContentPart.js";
import { ChatMcpServersStartingContentPart } from "./chatContentParts/chatMcpServersStartingContentPart.js";
import { ChatDisabledClaudeHooksContentPart } from "./chatContentParts/chatDisabledClaudeHooksContentPart.js";
import { ChatMultiDiffContentPart } from "./chatContentParts/chatMultiDiffContentPart.js";
import { ChatProgressContentPart, ChatWorkingProgressContentPart } from "./chatContentParts/chatProgressContentPart.js";
import { ChatPullRequestContentPart } from "./chatContentParts/chatPullRequestContentPart.js";
import { ChatQuotaExceededPart } from "./chatContentParts/chatQuotaExceededPart.js";
import { ChatUsedReferencesListContentPart, CollapsibleListPool } from "./chatContentParts/chatReferencesContentPart.js";
import { ChatRequestOriginPart } from "./chatContentParts/chatRequestOriginPart.js";
import { ChatTaskContentPart } from "./chatContentParts/chatTaskContentPart.js";
import { ChatSystemNotificationContentPart } from "./chatContentParts/chatSystemNotificationContentPart.js";
import { ChatTextEditContentPart } from "./chatContentParts/chatTextEditContentPart.js";
import { ChatThinkingContentPart, getEffectiveThinkingDisplayMode } from "./chatContentParts/chatThinkingContentPart.js";
import { ChatSubagentContentPart } from "./chatContentParts/chatSubagentContentPart.js";
import { ChatTreeContentPart, TreePool } from "./chatContentParts/chatTreeContentPart.js";
import { ChatWorkspaceEditContentPart } from "./chatContentParts/chatWorkspaceEditContentPart.js";
import { ChatExternalEditContentPart } from "./chatContentParts/chatExternalEditContentPart.js";
import { ChatToolInvocationPart } from "./chatContentParts/toolInvocationParts/chatToolInvocationPart.js";
import { ChatMarkdownDecorationsRenderer } from "./chatContentParts/chatMarkdownDecorationsRenderer.js";
import { ChatCodeBlockContentProvider } from "./chatContentParts/codeBlockPart.js";
import { autorun, observableValue } from "../../../../../base/common/observable.js";
import { basename, isEqual } from "../../../../../base/common/resources.js";
import { IAccessibilityService } from "../../../../../platform/accessibility/common/accessibility.js";
import { ITelemetryService } from "../../../../../platform/telemetry/common/telemetry.js";
import { ChatHookContentPart } from "./chatContentParts/chatHookContentPart.js";
import { HookType } from "../../common/promptSyntax/hookTypes.js";
import { IWorkbenchEnvironmentService } from "../../../../services/environment/common/environmentService.js";
import { AccessibilityWorkbenchSettingId } from "../../../accessibility/browser/accessibilityConfiguration.js";
import { isAskQuestionsToolInvocation, isMcpToolInvocation } from "./chatContentParts/toolInvocationParts/chatToolPartUtilities.js";
import { AgentSessionProviders, isAgentHostTarget } from "../agentSessions/agentSessions.js";
const $ = dom.$;
const COPILOT_USERNAME = "GitHub Copilot";
const WORKING_CAUGHT_UP_DEBOUNCE_MS = 750;
const DEFAULT_CHAT_ITEM_HORIZONTAL_PADDING = 40;
function escapeMarkdownLinkLabel(label) {
  return label.replace(/\\/g, "\\\\").replace(/\]/g, "\\]");
}
function buildPlanReviewProgressContent(review, message) {
  const renderedAsUsed = !!review.isUsed;
  const data = renderedAsUsed && !review.data?.rejected ? review.data : void 0;
  const overall = data?.feedbackOverall?.trim();
  const inlineMd = data?.feedbackInlineMarkdown?.trim();
  const feedbackMarkdown = [overall, inlineMd].filter((value) => !!value).join("\n\n") || data?.feedback?.trim();
  const content = new MarkdownString(void 0, { supportThemeIcons: true });
  content.appendText(message);
  if (feedbackMarkdown) {
    content.appendMarkdown("\n\n");
    content.appendMarkdown(feedbackMarkdown);
  }
  if (renderedAsUsed) {
    const reviewContent = review.content.trim();
    const planUri = review.planUri ? URI.revive(review.planUri) : void 0;
    if (reviewContent || planUri) {
      content.appendMarkdown("\n\n");
      if (reviewContent) {
        content.appendMarkdown(reviewContent);
      }
      if (planUri) {
        if (reviewContent) {
          content.appendMarkdown("\n\n");
        }
        const planFileName = basename(planUri);
        const label = planFileName ? localize("chat.planReview.openFullPlanFile", "Open full plan file ({0})", planFileName) : localize("chat.planReview.openFullPlan", "Open full plan file");
        const planWidgetUri = planUri.with({ query: planUri.query ? `${planUri.query}&vscodeLinkType=file` : "vscodeLinkType=file" });
        content.appendMarkdown(`[${escapeMarkdownLinkLabel(label)}](${planWidgetUri.toString(true)})`);
      }
    }
  }
  return content;
}
function shouldScheduleInitialHeightChange(normalizedHeight, allocatedHeight) {
  return typeof allocatedHeight !== "number" || normalizedHeight > allocatedHeight;
}
function getFinalResponseStartIndex(content) {
  let index = content.length - 1;
  while (index >= 0) {
    const part = content[index];
    if (part.kind === "markdownContent" && part.content.value.length) {
      break;
    }
    index--;
  }
  if (index < 0) {
    return void 0;
  }
  while (index > 0 && content[index - 1].kind === "markdownContent") {
    index--;
  }
  return index;
}
function isResponseOutcomeTool(part) {
  return (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && (part.toolSpecificData?.kind === "sessionCreated" || part.toolSpecificData?.kind === "generatedImage");
}
function getFinalResponseStartIndexAfterMovingResponseOutcomeTools(content) {
  const finalResponseStartIndex = getFinalResponseStartIndex(content);
  if (finalResponseStartIndex === void 0) {
    return void 0;
  }
  let movedToolCount = 0;
  for (let index = 0; index < finalResponseStartIndex; index++) {
    if (isResponseOutcomeTool(content[index])) {
      movedToolCount++;
    }
  }
  return finalResponseStartIndex - movedToolCount;
}
function isFinalResponseRendered(content, finalResponseStartIndex) {
  return finalResponseStartIndex !== void 0 && content[finalResponseStartIndex]?.kind === "markdownContent";
}
function moveResponseOutcomeToolsAfterFinalResponse(content) {
  const outcomeTools = content.filter(isResponseOutcomeTool);
  if (outcomeTools.length === 0) {
    return [...content];
  }
  const finalResponseStartIndex = getFinalResponseStartIndexAfterMovingResponseOutcomeTools(content);
  if (finalResponseStartIndex === void 0) {
    return [...content];
  }
  const reordered = content.filter((part) => !isResponseOutcomeTool(part));
  let insertionIndex = finalResponseStartIndex;
  while (reordered[insertionIndex]?.kind === "markdownContent") {
    insertionIndex++;
  }
  reordered.splice(insertionIndex, 0, ...outcomeTools);
  return reordered;
}
function formatCompletedResponseDisclosureLabel(stepCount, elapsedMs) {
  const elapsed = formatChatResponseElapsedTime(elapsedMs);
  if (stepCount === 1) {
    return elapsed ? localize("chat.responseCompletedOneStepIn", "Completed 1 step in {0}", elapsed) : localize("chat.responseCompletedOneStep", "Completed 1 step");
  }
  return elapsed ? localize("chat.responseCompletedStepsIn", "Completed {0} steps in {1}", stepCount, elapsed) : localize("chat.responseCompletedSteps", "Completed {0} steps", stepCount);
}
function getVisibleCompletedResponseItemCount(nodes) {
  let visibleItemCount = 0;
  for (const node of nodes) {
    if (dom.isHTMLElement(node) && (node.hidden || node.style.display === "none")) {
      continue;
    }
    visibleItemCount++;
  }
  return visibleItemCount;
}
function formatResponseTokenStats(modelTotals) {
  if (!modelTotals?.length) {
    return void 0;
  }
  const title = localize("chat.responseTokenStats.title", "Tokens used this turn");
  const markdown = new MarkdownString();
  markdown.appendMarkdown(`**${escapeMarkdownSyntaxTokens(title)}**

`);
  const ariaParts = [title];
  for (const total of modelTotals) {
    const line = total.cachedTokens > 0 ? localize(
      "chat.responseTokenStats.modelLineCached",
      "{0} \u2014 {1} in, {2} out, {3} cached",
      total.model,
      formatTokenCount(total.inputTokens),
      formatTokenCount(total.outputTokens),
      formatTokenCount(total.cachedTokens)
    ) : localize(
      "chat.responseTokenStats.modelLine",
      "{0} \u2014 {1} in, {2} out",
      total.model,
      formatTokenCount(total.inputTokens),
      formatTokenCount(total.outputTokens)
    );
    markdown.appendMarkdown(`${escapeMarkdownSyntaxTokens(line)}

`);
    ariaParts.push(total.cachedTokens > 0 ? localize(
      "chat.responseTokenStats.modelAriaCached",
      "{0}: {1} input tokens, {2} output tokens, {3} cached tokens",
      total.model,
      total.inputTokens,
      total.outputTokens,
      total.cachedTokens
    ) : localize(
      "chat.responseTokenStats.modelAria",
      "{0}: {1} input tokens, {2} output tokens",
      total.model,
      total.inputTokens,
      total.outputTokens
    ));
  }
  const ariaLabel = ariaParts.join(". ");
  return { markdown, markdownNotSupportedFallback: ariaLabel, ariaLabel };
}
function shouldCollapseCompletedResponsePart(part) {
  return part.kind !== "toolInvocation" && part.kind !== "toolInvocationSerialized" || !toolInvocationHasMcpAppData(part);
}
function getCompletedResponseCollapseEndIndex(content, finalResponseStartIndex) {
  for (let index = 0; index < finalResponseStartIndex; index++) {
    if (!shouldCollapseCompletedResponsePart(content[index])) {
      return index;
    }
  }
  return finalResponseStartIndex;
}
function reconcileChatItemHeight(normalizedHeight, currentRenderedHeight, isBeingRendered, allocatedHeight) {
  if (normalizedHeight === currentRenderedHeight) {
    return { nextRenderedHeight: currentRenderedHeight, kind: "none", height: normalizedHeight };
  }
  if (isBeingRendered) {
    return { nextRenderedHeight: currentRenderedHeight, kind: "deferReMeasure", height: normalizedHeight };
  }
  if (typeof currentRenderedHeight === "number") {
    return { nextRenderedHeight: normalizedHeight, kind: "fire", height: normalizedHeight };
  }
  if (!shouldScheduleInitialHeightChange(normalizedHeight, allocatedHeight)) {
    return { nextRenderedHeight: normalizedHeight, kind: "none", height: normalizedHeight };
  }
  return { nextRenderedHeight: normalizedHeight, kind: "scheduleInitial", height: normalizedHeight };
}
function renderChatResponseDetails(container, details, completedAt, elapsedMs, verbose, tokenStatsAriaLabel) {
  dom.clearNode(container);
  container.classList.remove("chat-response-flip-active", "chat-response-flip-down", "chat-response-flip-reset");
  const completion = verbose ? formatChatRequestTimestamp(completedAt) : void 0;
  const elapsed = completion ? formatChatResponseElapsedTime(elapsedMs) : void 0;
  const alternate = completion?.isRelative ? formatChatResponseDetails(elapsed, completion.fullText) : elapsed;
  const responseDetails = formatChatResponseDetails(details, completion?.text);
  let completedAtElement;
  if (completion) {
    const timing = dom.append(container, $("span.chat-response-timing"));
    completedAtElement = dom.append(timing, $("time.chat-response-completed-at", { datetime: completion.dateTime }, completion.text));
    if (alternate) {
      dom.append(timing, $("span.chat-response-alternate", void 0, alternate));
    }
    timing.classList.toggle("has-alternate", !!alternate);
  }
  if (completion && details) {
    dom.append(container, $("span.chat-response-details-separator", { "aria-hidden": "true" }, "\u2022"));
  }
  if (details) {
    dom.append(container, $("span.chat-response-model-details", void 0, details));
  }
  const accessibleTiming = completion ? localize("chatResponseCompletedAt", "Completed {0}", completion.fullText) : void 0;
  const accessibleElapsed = elapsed ? localize("chatResponseElapsed", "Elapsed time {0}", elapsed) : void 0;
  container.ariaLabel = [accessibleTiming, accessibleElapsed, details, tokenStatsAriaLabel].filter(Boolean).join(", ");
  container.classList.toggle("hidden", !responseDetails);
  container.tabIndex = responseDetails ? 0 : -1;
  return completedAtElement;
}
function renderChatRequestTimestamp(container, timestamp) {
  const formatted = formatChatRequestTimestamp(timestamp);
  if (!formatted) {
    return void 0;
  }
  if (!formatted.isRelative) {
    const element2 = dom.append(container, $("time.chat-request-timestamp", {
      datetime: formatted.dateTime,
      "aria-label": localize("chatRequestSentAt", "Sent {0}", formatted.fullText),
      tabindex: 0
    }, formatted.text));
    return { element: element2, hoverText: formatted.fullText };
  }
  const element = dom.append(container, $("span.chat-request-timestamp", {
    "aria-label": localize("chatRequestSentAt", "Sent {0}", formatted.fullText),
    tabindex: 0
  }));
  const timing = dom.append(element, $("span.chat-request-timing.has-alternate"));
  dom.append(timing, $("time.chat-request-relative", { datetime: formatted.dateTime }, formatted.text));
  dom.append(timing, $("time.chat-request-full-date", { datetime: formatted.dateTime }, formatted.fullText));
  return { element };
}
function shouldRenderInitialProgressiveContentImmediately(isComplete, hasMarkdownParts, hasRenderData) {
  return !isComplete && hasMarkdownParts && !hasRenderData;
}
function shouldStartNewCollapsedThinkingGroup(displayMode, existingGroup, incomingGroup) {
  return displayMode === ThinkingDisplayMode.Collapsed && existingGroup !== incomingGroup;
}
function shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning) {
  return collapsedToolsMode === CollapsedToolsDisplayMode.Always || separatedFromReasoning;
}
function shouldShowFileChangesSummaryForSettings(isComplete, isLocalSession, showFileChanges) {
  return isComplete && isLocalSession && showFileChanges;
}
function shouldShowPillsSummaryForSettings(isComplete, isAgentHostSession, turnStatusPills) {
  return isComplete && isAgentHostSession && isChatTurnStatusPillsEnabled(turnStatusPills);
}
function shouldPinToolInvocationToThinking(state, hasConfirmationMessages, hasMcpAppData) {
  return !hasMcpAppData && state !== IChatToolInvocation.StateKind.WaitingForConfirmation && state !== IChatToolInvocation.StateKind.WaitingForPostApproval && state !== IChatToolInvocation.StateKind.WaitingForAuthentication && !hasConfirmationMessages;
}
function toolInvocationHasMcpAppData(toolInvocation) {
  return toolInvocation.toolSpecificData?.kind === "input" && !!toolInvocation.toolSpecificData.mcpAppData;
}
function isGeneratedImageResultOwner(toolInvocation, content) {
  for (let index = content.length - 1; index >= 0; index--) {
    const part = content[index];
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolSpecificData?.kind === "generatedImage") {
      return part.toolCallId === toolInvocation.toolCallId;
    }
  }
  return false;
}
const forceVerboseLayoutTracing = false;
const mostRecentResponseClassName = "chat-most-recent-response";
function shouldHideChatUserIdentity(username, sessionResource, isResponse, isSessionsWindow, isSystemInitiatedRequest) {
  const sessionType = getChatSessionType(sessionResource);
  return username === COPILOT_USERNAME || isResponse && isAgentHostCopilotSessionType(sessionType) || isSessionsWindow || isSystemInitiatedRequest;
}
function isAgentHostCopilotSessionType(sessionType) {
  return sessionType === AgentSessionProviders.AgentHostCopilot || parseRemoteAgentHostSessionTypeAuthority(sessionType, SessionType.CopilotCLI) !== void 0;
}
function upvoteAnimationSettingToEnum(value) {
  switch (value) {
    case "confetti":
      return ClickAnimation.Confetti;
    case "floatingThumbs":
      return ClickAnimation.FloatingIcons;
    case "pulseWave":
      return ClickAnimation.PulseWave;
    case "radiantLines":
      return ClickAnimation.RadiantLines;
    default:
      return void 0;
  }
}
let ChatListItemRenderer = class extends Disposable {
  constructor(editorOptions, rendererOptions, delegate, overflowWidgetsDomNode, viewModel, instantiationService, configService, logService, contextKeyService, themeService, commandService, hoverService, chatWidgetService, chatEntitlementService, chatService, accessibilitySignalService, accessibilityService, environmentService, telemetryService) {
    super();
    this.rendererOptions = rendererOptions;
    this.delegate = delegate;
    this.viewModel = viewModel;
    this.instantiationService = instantiationService;
    this.configService = configService;
    this.logService = logService;
    this.contextKeyService = contextKeyService;
    this.themeService = themeService;
    this.commandService = commandService;
    this.hoverService = hoverService;
    this.chatWidgetService = chatWidgetService;
    this.chatEntitlementService = chatEntitlementService;
    this.chatService = chatService;
    this.accessibilitySignalService = accessibilitySignalService;
    this.accessibilityService = accessibilityService;
    this.environmentService = environmentService;
    this.telemetryService = telemetryService;
    this.codeBlocksByResponseId = /* @__PURE__ */ new Map();
    this.codeBlocksByEditorUri = new ResourceMap();
    this.fileTreesByResponseId = /* @__PURE__ */ new Map();
    this.focusedFileTreesByResponseId = /* @__PURE__ */ new Map();
    this.templateDataByRequestId = /* @__PURE__ */ new Map();
    this.responseTemplateDataByRequestId = /* @__PURE__ */ new Map();
    this.templateDataByRow = /* @__PURE__ */ new WeakMap();
    /** Track pending question carousels by session resource for auto-skip on chat submission */
    this.pendingQuestionCarousels = new ResourceMap();
    this._notifiedQuestionCarousels = /* @__PURE__ */ new Set();
    this.workingProgressConfirmationEndListeners = /* @__PURE__ */ new WeakSet();
    this._onDidClickFollowup = this._register(new Emitter());
    this.onDidClickFollowup = this._onDidClickFollowup.event;
    this._onDidClickRerunWithAgentOrCommandDetection = this._register(new Emitter());
    this.onDidClickRerunWithAgentOrCommandDetection = this._onDidClickRerunWithAgentOrCommandDetection.event;
    this._onDidClickRequest = this._register(new Emitter());
    this.onDidClickRequest = this._onDidClickRequest.event;
    this._onDidRerender = this._register(new Emitter());
    this.onDidRerender = this._onDidRerender.event;
    this._onDidDispose = this._register(new Emitter());
    this.onDidDispose = this._onDidDispose.event;
    this._onDidFocusOutside = this._register(new Emitter());
    this.onDidFocusOutside = this._onDidFocusOutside.event;
    this._onDidChangeItemHeight = this._register(new Emitter());
    this.onDidChangeItemHeight = this._onDidChangeItemHeight.event;
    this._onDidUpdateViewModel = this._register(new Emitter());
    this._currentLayoutWidth = observableValue(this, 0);
    this._isVisible = true;
    this._onDidChangeVisibility = this._register(new Emitter());
    /** Whether we have already logged the incremental-rendering telemetry event for this renderer instance. */
    this._incrementalRenderingTelemetryLogged = false;
    /**
     * Prevents re-announcement of already rendered chat progress
     * by screen readers
     */
    this._announcedToolProgressKeys = /* @__PURE__ */ new Set();
    this.chatContentMarkdownRenderer = this.instantiationService.createInstance(ChatContentMarkdownRenderer);
    this.markdownDecorationsRenderer = this._register(this.instantiationService.createInstance(ChatMarkdownDecorationsRenderer));
    this._editorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._toolEditorPool = this._register(this.instantiationService.createInstance(EditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._diffEditorPool = this._register(this.instantiationService.createInstance(DiffEditorPool, editorOptions, delegate, overflowWidgetsDomNode, true));
    this._treePool = this._register(this.instantiationService.createInstance(TreePool, this._onDidChangeVisibility.event));
    this._contentReferencesListPool = this._register(this.instantiationService.createInstance(CollapsibleListPool, this._onDidChangeVisibility.event, void 0, void 0));
    this._inlineTextModels = this._register(this.instantiationService.createInstance(InlineTextModelCollection));
    this._register(this.instantiationService.createInstance(ChatCodeBlockContentProvider));
    this._register(this.chatService.onDidSubmitRequest((e) => {
      const carousels = this.pendingQuestionCarousels.get(e.chatSessionResource);
      if (carousels) {
        for (const carousel of carousels) {
          carousel.skip();
        }
        carousels.clear();
      }
    }));
    this._register(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(ChatConfiguration.AutoReply) && this.configService.getValue(ChatConfiguration.AutoReply)) {
        for (const [, carousels] of this.pendingQuestionCarousels) {
          for (const carousel of carousels) {
            carousel.skip();
          }
          carousels.clear();
        }
      }
    }));
  }
  set pendingDragController(controller) {
    this._pendingDragController = controller;
  }
  updateOptions(options) {
    this.rendererOptions = { ...this.rendererOptions, ...options };
  }
  get templateId() {
    return ChatListItemRenderer.ID;
  }
  editorsInUse() {
    return Iterable.concat(this._editorPool.inUse(), this._toolEditorPool.inUse());
  }
  traceLayout(method, message) {
    if (forceVerboseLayoutTracing) {
      this.logService.info(`ChatListItemRenderer#${method}: ${message}`);
    } else {
      this.logService.trace(`ChatListItemRenderer#${method}: ${message}`);
    }
  }
  fireItemHeightChange(template, measuredHeight) {
    if (!template.currentElement || !template.rowContainer.isConnected) {
      return;
    }
    const height = measuredHeight ?? template.rowContainer.getBoundingClientRect().height;
    if (height === 0 || !height) {
      return;
    }
    const normalizedHeight = Math.ceil(height);
    const element = template.currentElement;
    const update = reconcileChatItemHeight(
      normalizedHeight,
      element.currentRenderedHeight,
      element === this._elementBeingRendered,
      template.allocatedHeight
    );
    element.currentRenderedHeight = update.nextRenderedHeight;
    if (update.kind === "fire") {
      this._onDidChangeItemHeight.fire({ element, height: update.height });
    } else if (update.kind === "scheduleInitial") {
      const scheduledHeight = update.height;
      dom.scheduleAtNextAnimationFrame(dom.getWindow(template.rowContainer), () => {
        if (template.currentElement !== element || element.currentRenderedHeight !== scheduledHeight) {
          return;
        }
        this._onDidChangeItemHeight.fire({ element, height: scheduledHeight });
      });
    } else if (update.kind === "deferReMeasure") {
      dom.scheduleAtNextAnimationFrame(dom.getWindow(template.rowContainer), () => {
        if (template.currentElement === element && element !== this._elementBeingRendered) {
          this.fireItemHeightChange(template);
        }
      });
    }
  }
  /**
   * Compute a rate to render at in words/s.
   */
  getProgressiveRenderRate(element) {
    let Rate;
    ((Rate2) => {
      Rate2[Rate2["Min"] = 40] = "Min";
      Rate2[Rate2["Max"] = 2e3] = "Max";
    })(Rate || (Rate = {}));
    const minAfterComplete = 80;
    const rate = element.contentUpdateTimings?.impliedWordLoadRate;
    if (element.isComplete) {
      if (typeof rate === "number") {
        return clamp(rate, minAfterComplete, 2e3 /* Max */);
      } else {
        return minAfterComplete;
      }
    }
    if (typeof rate === "number") {
      return clamp(rate, 40 /* Min */, 2e3 /* Max */);
    }
    return 8;
  }
  getCodeBlockInfosForResponse(response) {
    const codeBlocks = this.codeBlocksByResponseId.get(response.id);
    return codeBlocks ?? [];
  }
  updateViewModel(viewModel) {
    this.viewModel = viewModel;
    this._announcedToolProgressKeys.clear();
    this._notifiedQuestionCarousels.clear();
    this.codeBlocksByEditorUri.clear();
    this.codeBlocksByResponseId.clear();
    this.fileTreesByResponseId.clear();
    this.focusedFileTreesByResponseId.clear();
    this.responseTemplateDataByRequestId.clear();
    this.templateDataByRequestId.clear();
    this._onDidUpdateViewModel.fire();
    this._editorPool.clear();
    this._toolEditorPool.clear();
    this._diffEditorPool.clear();
    this._treePool.clear();
    this._contentReferencesListPool.clear();
  }
  getCodeBlockInfoForEditor(uri) {
    return this.codeBlocksByEditorUri.get(uri);
  }
  getFileTreeInfosForResponse(response) {
    const fileTrees = this.fileTreesByResponseId.get(response.id);
    return fileTrees ?? [];
  }
  getLastFocusedFileTreeForResponse(response) {
    const fileTrees = this.fileTreesByResponseId.get(response.id);
    const lastFocusedFileTreeIndex = this.focusedFileTreesByResponseId.get(response.id);
    if (fileTrees?.length && lastFocusedFileTreeIndex !== void 0 && lastFocusedFileTreeIndex < fileTrees.length) {
      return fileTrees[lastFocusedFileTreeIndex];
    }
    return void 0;
  }
  getTemplateDataForRequestId(requestId) {
    if (!requestId) {
      return void 0;
    }
    const templateData = this.templateDataByRequestId.get(requestId);
    if (templateData && templateData.currentElement?.id === requestId) {
      return templateData;
    }
    if (templateData) {
      this.templateDataByRequestId.delete(requestId);
    }
    return void 0;
  }
  setVisible(visible) {
    this._isVisible = visible;
    this._onDidChangeVisibility.fire(visible);
  }
  layout(width) {
    const newWidth = width - (this.rendererOptions.contentHorizontalPadding ?? DEFAULT_CHAT_ITEM_HORIZONTAL_PADDING);
    if (newWidth !== this._currentLayoutWidth.get()) {
      this._currentLayoutWidth.set(newWidth, void 0);
      for (const editor of this._editorPool.inUse()) {
        editor.layout(newWidth);
      }
      for (const toolEditor of this._toolEditorPool.inUse()) {
        toolEditor.layout(newWidth);
      }
      for (const diffEditor of this._diffEditorPool.inUse()) {
        diffEditor.layout(newWidth);
      }
    }
  }
  /**
   * Returns the currently rendered chat item containing the node.
   */
  getElementFromNode(node) {
    let current = node;
    while (current && this.delegate.container.contains(current)) {
      const element = this.templateDataByRow.get(current)?.currentElement;
      if (element) {
        return element;
      }
      current = current.parentElement;
    }
    return void 0;
  }
  renderTemplate(container) {
    const templateDisposables = new DisposableStore();
    const disabledOverlay = dom.append(container, $(".chat-row-disabled-overlay"));
    const rowContainer = dom.append(container, $(".interactive-item-container"));
    if (this.rendererOptions.renderStyle === "compact") {
      rowContainer.classList.add("interactive-item-compact");
    }
    let headerParent = rowContainer;
    let valueParent = rowContainer;
    let detailContainerParent;
    if (this.rendererOptions.renderStyle === "minimal") {
      rowContainer.classList.add("interactive-item-compact");
      rowContainer.classList.add("minimal");
      const lhsContainer = dom.append(rowContainer, $(".column.left"));
      const rhsContainer = dom.append(rowContainer, $(".column.right"));
      headerParent = lhsContainer;
      detailContainerParent = rhsContainer;
      valueParent = rhsContainer;
    }
    const header = dom.append(headerParent, $(".header"));
    const contextKeyService = templateDisposables.add(this.contextKeyService.createScoped(rowContainer));
    const scopedInstantiationService = templateDisposables.add(this.instantiationService.createChild(new ServiceCollection([IContextKeyService, contextKeyService])));
    const requestHover = dom.append(rowContainer, $(".request-hover"));
    let titleToolbar;
    if (this.rendererOptions.noHeader) {
      header.classList.add("hidden");
    } else {
      titleToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, requestHover, MenuId.ChatMessageTitle, {
        menuOptions: {
          shouldForwardArgs: true
        },
        toolbarOptions: {
          shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
        }
      }));
    }
    this.hoverHidden(requestHover);
    const checkpointContainer = dom.append(rowContainer, $(".checkpoint-container"));
    dom.append(checkpointContainer, $(".checkpoint-line-left"));
    const checkpointToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointContainer, MenuId.ChatMessageCheckpoint, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          if (action.item.id === RestoreCheckpointActionId || action.item.id === StartOverActionId) {
            const isStartOver = action.item.id === StartOverActionId;
            const cancelLabel = isStartOver ? localize("chat.startOver.cancelTooltip", "Cancel starting over") : localize("chat.restoreCheckpoint.cancelTooltip", "Cancel restoring this checkpoint");
            const confirmTooltip = isStartOver ? localize("chat.startOver.confirmTooltip", "Confirm starting over and discarding all edits") : localize("chat.restoreCheckpoint.confirmTooltip", "Confirm restoring this checkpoint and discarding later edits");
            return this.instantiationService.createInstance(ChatRestoreCheckpointActionViewItem, action, { hoverDelegate: options.hoverDelegate }, (context) => this.discardEditsActionNeedsConfirmation(context), cancelLabel, confirmTooltip);
          }
          if (action.item.id === ForkConversationActionId) {
            return this.instantiationService.createInstance(ChatForkActionViewItem, action, { hoverDelegate: options.hoverDelegate });
          }
          return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      },
      renderDropdownAsChildElement: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: {
        shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
      }
    }));
    dom.append(checkpointContainer, $(".checkpoint-line-right"));
    const user = dom.append(header, $(".user"));
    const avatarContainer = dom.append(user, $(".avatar-container"));
    const username = dom.append(user, $("h3.username"));
    username.tabIndex = 0;
    const detailContainer = dom.append(detailContainerParent ?? user, $("span.detail-container"));
    const detail = dom.append(detailContainer, $("span.detail"));
    dom.append(detailContainer, $("span.chat-animated-ellipsis"));
    const value = dom.append(valueParent, $(".value"));
    const requestTimestampContainer = dom.append(valueParent, $(".chat-request-timestamp-container"));
    const elementDisposables = templateDisposables.add(new DisposableStore());
    const completedResponseDisclosureDisposables = templateDisposables.add(new DisposableStore());
    const responseTokenStatsHover = templateDisposables.add(new MutableDisposable());
    const footerToolbarContainer = dom.append(rowContainer, $(".chat-footer-toolbar"));
    if (this.rendererOptions.noFooter) {
      footerToolbarContainer.classList.add("hidden");
    }
    const footerToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, footerToolbarContainer, MenuId.ChatMessageFooter, {
      menuOptions: { shouldForwardArgs: true, renderShortTitle: true },
      toolbarOptions: { shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1 },
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction && action.item.id === MarkHelpfulActionId) {
          const animation = upvoteAnimationSettingToEnum(this.configService.getValue("chat.upvoteAnimation"));
          return scopedInstantiationService.createInstance(MenuEntryActionViewItem, action, { ...options, onClickAnimation: animation });
        }
        return createActionViewItem(scopedInstantiationService, action, options);
      }
    }));
    const footerDetailsContainer = dom.append(footerToolbar.getElement(), $(".chat-footer-details"));
    footerDetailsContainer.tabIndex = 0;
    const checkpointRestoreContainer = dom.append(rowContainer, $(".checkpoint-restore-container"));
    dom.append(checkpointRestoreContainer, $(".checkpoint-line-left"));
    const label = dom.append(checkpointRestoreContainer, $("span.checkpoint-label-text"));
    label.textContent = localize("checkpointRestore", "Checkpoint Restored");
    const dot = dom.append(checkpointRestoreContainer, $("span.checkpoint-dot-separator"));
    dot.textContent = "\xB7";
    dot.setAttribute("aria-hidden", "true");
    const checkpointRestoreToolbar = templateDisposables.add(scopedInstantiationService.createInstance(MenuWorkbenchToolBar, checkpointRestoreContainer, MenuId.ChatMessageRestoreCheckpoint, {
      actionViewItemProvider: (action, options) => {
        if (action instanceof MenuItemAction) {
          return this.instantiationService.createInstance(CodiconActionViewItem, action, { hoverDelegate: options.hoverDelegate });
        }
        return void 0;
      },
      renderDropdownAsChildElement: true,
      menuOptions: {
        shouldForwardArgs: true
      },
      toolbarOptions: {
        shouldInlineSubmenu: (submenu) => submenu.actions.length <= 1
      }
    }));
    dom.append(checkpointRestoreContainer, $(".checkpoint-line-right"));
    const agentHover = templateDisposables.add(this.instantiationService.createInstance(ChatAgentHover));
    const hoverContent = () => {
      if (isResponseVM(template.currentElement) && template.currentElement.agent && !template.currentElement.agent.isDefault) {
        agentHover.setAgent(template.currentElement.agent.id);
        return agentHover.domNode;
      }
      return void 0;
    };
    const hoverOptions = getChatAgentHoverOptions(() => isResponseVM(template.currentElement) ? template.currentElement.agent : void 0, this.commandService);
    templateDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), user, hoverContent, hoverOptions));
    templateDisposables.add(dom.addDisposableListener(user, dom.EventType.KEY_DOWN, (e) => {
      const ev = new StandardKeyboardEvent(e);
      if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
        const content = hoverContent();
        if (content) {
          this.hoverService.showInstantHover({ content, target: user, trapFocus: true, actions: hoverOptions.actions }, true);
        }
      } else if (ev.equals(KeyCode.Escape)) {
        this.hoverService.hideHover();
      }
    }));
    const connectionObserver = document.createElement("connection-observer");
    dom.append(container, connectionObserver);
    const template = { header, avatarContainer, requestHover, username, detail, value, requestTimestampContainer, rowContainer, elementDisposables, templateDisposables, contextKeyService, instantiationService: scopedInstantiationService, agentHover, titleToolbar, footerToolbar, footerToolbarContainer, footerDetailsContainer, disabledOverlay, checkpointToolbar, checkpointRestoreToolbar, checkpointContainer, checkpointRestoreContainer, completedResponseDisclosureDisposables, responseTokenStatsHover };
    this.templateDataByRow.set(rowContainer, template);
    templateDisposables.add(this._onDidUpdateViewModel.event(() => {
      if (!template.currentElement || !this.viewModel?.sessionResource || !isEqual(template.currentElement.sessionResource, this.viewModel.sessionResource)) {
        this.clearRenderedParts(template);
      }
    }));
    templateDisposables.add(dom.addDisposableListener(disabledOverlay, dom.EventType.CLICK, (e) => {
      if (!this.viewModel?.editing) {
        return;
      }
      const current = template.currentElement;
      if (!current || current.id === this.viewModel.editing.id) {
        return;
      }
      if (disabledOverlay.classList.contains("disabled")) {
        e.preventDefault();
        e.stopPropagation();
        this._onDidFocusOutside.fire();
      }
    }));
    const resizeObserver = templateDisposables.add(new dom.DisposableResizeObserver("ChatListItemRenderer.itemHeight", (entries) => {
      const entry = entries[0];
      if (entry) {
        this.fireItemHeightChange(template, entry.borderBoxSize.at(0)?.blockSize);
      }
    }));
    const resizeObservation = templateDisposables.add(new MutableDisposable());
    connectionObserver.onDidConnect = () => {
      resizeObservation.value = resizeObserver.observe(rowContainer);
    };
    connectionObserver.onDidDisconnect = () => {
      template.renderedPartsMounted = false;
      resizeObservation.clear();
    };
    if (rowContainer.isConnected) {
      connectionObserver.onDidConnect();
    }
    return template;
  }
  /**
   * Determines whether an action at the given chat item would discard file
   * edits that the user should confirm in-place.
   */
  discardEditsActionNeedsConfirmation(context) {
    if (!isRequestVM(context) && !isResponseVM(context)) {
      return false;
    }
    const requestId = isRequestVM(context) ? context.id : context.requestId;
    const model = this.chatService.getSession(context.sessionResource);
    const session = model?.editingSession;
    if (!model || !(session instanceof AgentHostSnapshotController)) {
      return false;
    }
    const requests = model.getRequests();
    const index = requests.findIndex((request) => request.id === requestId);
    if (index === -1) {
      return false;
    }
    return requests.slice(index).some((request) => session.hasEditsInRequest(request.id));
  }
  renderElement(node, index, templateData, details) {
    templateData.allocatedHeight = details?.height;
    this._elementBeingRendered = node.element;
    try {
      this.renderChatTreeItem(node.element, index, templateData);
    } finally {
      this._elementBeingRendered = void 0;
    }
  }
  /**
   * Dispose the rendered parts in the template, which aren't done in disposeElement
   * so they can be reused when a new render is started.
   */
  clearRenderedParts(templateData) {
    this.removeCompletedResponseDisclosure(templateData);
    if (templateData.renderedParts) {
      dispose(coalesce(templateData.renderedParts));
      templateData.renderedParts = void 0;
      templateData.renderedContent = void 0;
      dom.clearNode(templateData.value);
    } else if (isPendingDividerVM(templateData.currentElement)) {
      dom.clearNode(templateData.value);
    }
    templateData.movedOutToolParts?.dispose();
    templateData.movedOutToolParts = void 0;
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = void 0;
    }
    templateData.footerToolbar.context = void 0;
    templateData.checkpointToolbar.context = void 0;
    templateData.checkpointRestoreToolbar.context = void 0;
    templateData.currentElement = void 0;
    templateData.completedResponseDisclosureOpen = void 0;
    templateData.completedResponseCollapseEndIndex = void 0;
    templateData.wasResponseComplete = void 0;
  }
  renderChatTreeItem(element, index, templateData) {
    if (templateData.currentElement && templateData.currentElement.id !== element.id) {
      this.traceLayout("renderChatTreeItem", `Rendering a different element into the template, index=${index}`);
      const mappedTemplateData = this.templateDataByRequestId.get(templateData.currentElement.id);
      if (mappedTemplateData && mappedTemplateData.currentElement?.id !== templateData.currentElement.id) {
        this.templateDataByRequestId.delete(templateData.currentElement.id);
      }
      this.clearRenderedParts(templateData);
    }
    templateData.currentElement = element;
    this.templateDataByRequestId.set(element.id, templateData);
    templateData.rowContainer.classList.remove("pending-item", "pending-divider", "pending-request", "chat-pending-dragging", "terminal-command-request");
    templateData.dragHandle?.remove();
    templateData.dragHandle = void 0;
    delete templateData.rowContainer.dataset.pendingRequestId;
    delete templateData.rowContainer.dataset.pendingKind;
    if (isPendingDividerVM(element)) {
      this.renderPendingDivider(element, templateData);
      return;
    }
    const kind = isRequestVM(element) ? "request" : isResponseVM(element) ? "response" : isPendingDividerVM(element) ? "pendingDivider" : "welcome";
    this.traceLayout("renderElement", `${kind}, index=${index}`);
    ChatContextKeys.isResponse.bindTo(templateData.contextKeyService).set(isResponseVM(element));
    ChatContextKeys.itemId.bindTo(templateData.contextKeyService).set(element.id);
    ChatContextKeys.isRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element));
    ChatContextKeys.isFirstRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && this.viewModel?.model.getRequests()[0]?.id === element.id);
    ChatContextKeys.isPendingRequest.bindTo(templateData.contextKeyService).set(isRequestVM(element) && !!element.pendingKind);
    ChatContextKeys.responseDetectedAgentCommand.bindTo(templateData.contextKeyService).set(isResponseVM(element) && element.agentOrSlashCommandDetected);
    if (isResponseVM(element)) {
      ChatContextKeys.responseSupportsIssueReporting.bindTo(templateData.contextKeyService).set(!!element.agent?.metadata.supportIssueReporting);
      ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set(element.vote === ChatAgentVoteDirection.Up ? "up" : element.vote === ChatAgentVoteDirection.Down ? "down" : "");
    } else {
      ChatContextKeys.responseVote.bindTo(templateData.contextKeyService).set("");
    }
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = element;
    }
    templateData.footerToolbar.context = element;
    const responseTimingListeners = templateData.elementDisposables.add(new MutableDisposable());
    const updateResponseDetails = () => {
      const details = isResponseVM(element) ? element.result?.details : void 0;
      const tokenStats = isResponseVM(element) ? formatResponseTokenStats(element.model.usage?.modelTotals) : void 0;
      const completedAtElement = renderChatResponseDetails(
        templateData.footerDetailsContainer,
        details,
        isResponseVM(element) ? element.model.completionTimestamp : void 0,
        isResponseVM(element) ? element.model.elapsedMs : void 0,
        isResponseVM(element) && this.configService.getValue(ChatConfiguration.Verbose),
        tokenStats?.ariaLabel
      );
      const tokenStatsHover = templateData.responseTokenStatsHover;
      if (!tokenStats) {
        tokenStatsHover.clear();
      } else if (tokenStatsHover.value) {
        tokenStatsHover.value.update(tokenStats);
      } else {
        tokenStatsHover.value = this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), templateData.footerDetailsContainer, tokenStats);
      }
      if (!completedAtElement) {
        responseTimingListeners.clear();
        return;
      }
      const listeners = new DisposableStore();
      responseTimingListeners.value = listeners;
      let responseTimingBounds;
      listeners.add(dom.addDisposableListener(completedAtElement, dom.EventType.MOUSE_ENTER, (e) => {
        const bounds = completedAtElement.getBoundingClientRect();
        responseTimingBounds = bounds;
        templateData.footerDetailsContainer.classList.add("chat-response-flip-reset");
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
        templateData.footerDetailsContainer.classList.toggle("chat-response-flip-down", e.clientY < bounds.top + bounds.height / 2);
        void templateData.footerDetailsContainer.offsetWidth;
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-reset");
        void templateData.footerDetailsContainer.offsetWidth;
        templateData.footerDetailsContainer.classList.add("chat-response-flip-active");
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.MOUSE_MOVE, (e) => {
        if (responseTimingBounds && (e.clientX < responseTimingBounds.left || e.clientX > responseTimingBounds.right || e.clientY < responseTimingBounds.top || e.clientY > responseTimingBounds.bottom)) {
          responseTimingBounds = void 0;
          templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
        }
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.MOUSE_LEAVE, () => {
        responseTimingBounds = void 0;
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active");
      }));
      listeners.add(dom.addDisposableListener(templateData.footerDetailsContainer, dom.EventType.FOCUS, () => {
        templateData.footerDetailsContainer.classList.remove("chat-response-flip-active", "chat-response-flip-down");
      }));
    };
    updateResponseDetails();
    ChatContextKeys.responseHasError.bindTo(templateData.contextKeyService).set(isResponseVM(element) && !!element.errorDetails);
    const isFiltered = !!(isResponseVM(element) && element.errorDetails?.responseIsFiltered);
    ChatContextKeys.responseIsFiltered.bindTo(templateData.contextKeyService).set(isFiltered);
    const location = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource)?.location;
    templateData.rowContainer.classList.toggle("editing-session", location === ChatAgentLocation.Chat);
    templateData.rowContainer.classList.toggle("interactive-request", isRequestVM(element));
    templateData.rowContainer.classList.toggle("interactive-response", isResponseVM(element));
    const progressMessageAtBottomOfResponse = checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse);
    templateData.rowContainer.classList.toggle("show-detail-progress", isResponseVM(element) && !element.isComplete && !element.progressMessages.length && !progressMessageAtBottomOfResponse);
    templateData.rowContainer.classList.toggle("chat-progress-reservable", isResponseVM(element) && !element.isComplete && !!progressMessageAtBottomOfResponse);
    const updateContainerCheckmarks = () => templateData.rowContainer.classList.toggle("show-checkmarks", !!this.configService.getValue(AccessibilityWorkbenchSettingId.ShowChatCheckmarks));
    updateContainerCheckmarks();
    const updateVerboseDetails = () => templateData.rowContainer.classList.toggle("show-verbose-details", !!this.configService.getValue(ChatConfiguration.Verbose));
    updateVerboseDetails();
    templateData.elementDisposables.add(this.configService.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration(AccessibilityWorkbenchSettingId.ShowChatCheckmarks)) {
        updateContainerCheckmarks();
      }
      if (e.affectsConfiguration(ChatConfiguration.Verbose)) {
        updateVerboseDetails();
        updateResponseDetails();
      }
      if (e.affectsConfiguration(ChatConfiguration.CollapseCompletedResponses) && isResponseVM(element)) {
        this.updateCompletedResponseDisclosure(element, templateData.renderedContent ?? [], templateData, false);
      }
    }));
    if (!this.rendererOptions.noHeader) {
      this.renderAvatar(element, templateData);
    }
    const isSystemInitiatedRequest = isRequestVM(element) && !!element.isSystemInitiated;
    templateData.username.textContent = element.username;
    const hideChatUserIdentity = shouldHideChatUserIdentity(element.username, element.sessionResource, isResponseVM(element), this.environmentService.isSessionsWindow, isSystemInitiatedRequest);
    templateData.username.classList.toggle("hidden", hideChatUserIdentity);
    templateData.avatarContainer.classList.toggle("hidden", hideChatUserIdentity);
    this.hoverHidden(templateData.requestHover);
    dom.clearNode(templateData.detail);
    dom.clearNode(templateData.requestTimestampContainer);
    if (isResponseVM(element)) {
      this.renderDetail(element, templateData);
    }
    templateData.checkpointToolbar.context = element;
    const supportsForkOrRestoration = this.rendererOptions.supportsFork || (this.rendererOptions.restorable ?? true);
    const checkpointEnabled = this.configService.getValue(ChatConfiguration.CheckpointsEnabled) && supportsForkOrRestoration;
    const isPendingRequest = isRequestVM(element) && !!element.pendingKind;
    templateData.checkpointContainer.classList.toggle("hidden", isResponseVM(element) || isPendingRequest || isSystemInitiatedRequest || !checkpointEnabled);
    templateData.footerToolbar.refresh();
    templateData.checkpointToolbar.refresh();
    templateData.checkpointRestoreToolbar.refresh();
    if (isResponseVM(element)) {
      this.responseTemplateDataByRequestId.set(element.requestId, templateData);
      templateData.elementDisposables.add(toDisposable(() => this.responseTemplateDataByRequestId.delete(element.requestId)));
    }
    if (!isPendingRequest) {
      const setGroupHover = (hovered) => {
        const requestId = isRequestVM(element) ? element.id : isResponseVM(element) ? element.requestId : void 0;
        if (!requestId) {
          return;
        }
        const reqData = this.templateDataByRequestId.get(requestId);
        const resData = this.responseTemplateDataByRequestId.get(requestId);
        reqData?.rowContainer.classList.toggle("group-hovered", hovered);
        reqData?.checkpointContainer.classList.toggle("group-hovered", hovered);
        resData?.rowContainer.classList.toggle("group-hovered", hovered);
      };
      const hoverTargets = isResponseVM(element) ? [templateData.value, templateData.footerToolbarContainer] : [templateData.rowContainer];
      const isHoverTarget = (target) => dom.isHTMLElement(target) && hoverTargets.some((hoverTarget) => hoverTarget.contains(target));
      for (const hoverTarget of hoverTargets) {
        templateData.elementDisposables.add(dom.addDisposableListener(hoverTarget, dom.EventType.MOUSE_ENTER, () => setGroupHover(true)));
        templateData.elementDisposables.add(dom.addDisposableListener(hoverTarget, dom.EventType.MOUSE_LEAVE, (e) => {
          if (!isHoverTarget(e.relatedTarget)) {
            setGroupHover(false);
          }
        }));
      }
      templateData.elementDisposables.add(toDisposable(() => setGroupHover(false)));
    }
    const shouldShowRestore = this.viewModel?.model.checkpoint && !this.viewModel?.editing && index === this.delegate.getListLength() - 1 && !isPendingRequest;
    templateData.checkpointRestoreContainer.classList.toggle("hidden", !(shouldShowRestore && checkpointEnabled));
    const editing = element.id === this.viewModel?.editing?.id;
    const isInput = this.configService.getValue("chat.editRequests") === "input";
    templateData.elementDisposables.add(autorun((r) => {
      const shouldBeBlocked = element.shouldBeBlocked.read(r);
      templateData.disabledOverlay.classList.toggle("disabled", shouldBeBlocked && !editing && this.viewModel?.editing !== void 0);
    }));
    templateData.rowContainer.classList.toggle("editing", editing && !isInput);
    templateData.rowContainer.classList.toggle("editing-input", editing && isInput);
    templateData.requestHover.classList.toggle("editing", editing && isInput);
    templateData.requestHover.classList.toggle("hidden", !!this.viewModel?.editing && !editing || isResponseVM(element) || !this.rendererOptions.editable || isSystemInitiatedRequest);
    templateData.requestHover.classList.toggle("expanded", this.configService.getValue("chat.editRequests") === "hover");
    templateData.requestHover.classList.toggle("checkpoints-enabled", checkpointEnabled);
    templateData.elementDisposables.add(dom.addStandardDisposableListener(templateData.rowContainer, dom.EventType.CLICK, (e) => {
      const current = templateData.currentElement;
      if (current && this.viewModel?.editing && current.id !== this.viewModel.editing.id) {
        e.stopPropagation();
        e.preventDefault();
        this._onDidFocusOutside.fire();
      }
    }));
    const rowRoot = templateData.rowContainer.parentElement?.parentElement?.parentElement;
    rowRoot?.classList.toggle("request", isRequestVM(element));
    rowRoot?.classList.toggle("response", isResponseVM(element));
    templateData.rowContainer.classList.toggle(mostRecentResponseClassName, index === this.delegate.getListLength() - 1);
    templateData.rowContainer.classList.toggle("confirmation-message", isRequestVM(element) && !!element.confirmation);
    const isStickyScrollTargetItem = getStickyScrollTargetItem(this.viewModel?.getItems() ?? []) === element;
    const shouldShowHeader = isResponseVM(element) && !this.rendererOptions.noHeader && !isSystemInitiatedRequest;
    templateData.header?.classList.toggle("header-disabled", !shouldShowHeader);
    if (isRequestVM(element) && element.confirmation) {
      this.renderConfirmationAction(element, templateData);
    }
    const incrementalRendering = this.configService.getValue(ChatConfiguration.IncrementalRendering);
    if (isResponseVM(element) && isStickyScrollTargetItem && (!element.isComplete || element.renderData)) {
      this.traceLayout("renderElement", `start progressive render, index=${index}`);
      if (incrementalRendering && !element.renderData) {
        this.logIncrementalRenderingTelemetry();
        this.doIncrementalRender(element, index, templateData);
      } else {
        const timer = templateData.elementDisposables.add(new dom.WindowIntervalTimer());
        const runProgressiveRender = (initial) => {
          try {
            if (this.doNextProgressiveRender(element, index, templateData, !!initial)) {
              timer.cancel();
            }
          } catch (err) {
            timer.cancel();
            this.logService.error(err);
          }
        };
        timer.cancelAndSet(runProgressiveRender, 50, dom.getWindow(templateData.rowContainer));
        runProgressiveRender(true);
      }
    } else {
      if (isResponseVM(element)) {
        if (incrementalRendering) {
          const rate = this.getProgressiveRenderRate(element);
          this._updateMorpherRate(templateData, rate, true);
        }
        this.renderChatResponseBasic(element, index, templateData);
      } else if (isRequestVM(element)) {
        this.renderChatRequest(element, index, templateData);
      }
    }
    templateData.renderedPartsMounted = true;
  }
  renderPendingDivider(element, templateData) {
    templateData.rowContainer.classList.add("pending-item");
    templateData.rowContainer.classList.add("pending-divider");
    templateData.rowContainer.classList.remove("interactive-request", "interactive-response", "pending-request");
    templateData.avatarContainer.classList.add("hidden");
    templateData.username.classList.add("hidden");
    templateData.requestHover.classList.add("hidden");
    templateData.checkpointContainer.classList.add("hidden");
    templateData.checkpointRestoreContainer.classList.add("hidden");
    templateData.footerToolbar.getElement().classList.add("hidden");
    if (templateData.titleToolbar) {
      templateData.titleToolbar.getElement().classList.add("hidden");
    }
    dom.clearNode(templateData.value);
    dom.clearNode(templateData.detail);
    dom.clearNode(templateData.requestTimestampContainer);
    const dividerContent = dom.$(".pending-divider-content");
    const label = dom.append(dividerContent, dom.$("span.pending-divider-label"));
    if (element.dividerKind === ChatRequestQueueKind.Steering) {
      if (element.isSystemInitiated) {
        label.textContent = localize("systemNotificationDivider", "System Notification");
        label.title = localize("systemNotificationDividerTooltip", "System notification will be sent after the next tool call happens");
      } else {
        label.textContent = localize("steeringDivider", "Steering");
        label.title = localize("steeringDividerTooltip", "Steering message will be sent after the next tool call happens");
      }
    } else {
      label.textContent = localize("queuedDivider", "Queued");
      label.title = localize("queuedDividerTooltip", "Queued messages will be sent after the current request completes");
    }
    templateData.value.appendChild(dividerContent);
  }
  renderDetail(element, templateData) {
    dom.clearNode(templateData.detail);
    if (element.agentOrSlashCommandDetected) {
      const msg = element.slashCommand ? localize("usedAgentSlashCommand", "used {0} [[(rerun without)]]", `${chatSubcommandLeader}${element.slashCommand.name}`) : localize("usedAgent", "[[(rerun without)]]");
      dom.reset(templateData.detail, renderFormattedText(msg, {
        actionHandler: {
          disposables: templateData.elementDisposables,
          callback: (content) => {
            this._onDidClickRerunWithAgentOrCommandDetection.fire(element);
          }
        }
      }, $("span.agentOrSlashCommandDetected")));
    } else if (this.rendererOptions.renderStyle !== "minimal" && !element.isComplete && !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
      templateData.detail.textContent = localize("working", "Working");
    }
  }
  renderConfirmationAction(element, templateData) {
    dom.clearNode(templateData.detail);
    if (element.confirmation) {
      dom.append(templateData.detail, $("span.codicon.codicon-check", { "aria-hidden": "true" }));
      dom.append(templateData.detail, $("span.confirmation-text", void 0, localize("chatConfirmationAction", 'Selected "{0}"', element.confirmation)));
      templateData.header?.classList.remove("header-disabled");
      templateData.header?.classList.add("partially-disabled");
    }
  }
  renderAvatar(element, templateData) {
    if (isPendingDividerVM(element)) {
      return;
    }
    let icon;
    if (isResponseVM(element)) {
      icon = this.getAgentIcon(element.agent?.metadata);
    } else if (isRequestVM(element)) {
      icon = element.avatarIcon ?? Codicon.account;
    } else {
      icon = Codicon.account;
    }
    if (icon instanceof URI) {
      const avatarIcon = dom.$("img.icon");
      avatarIcon.src = FileAccess.uriToBrowserUri(icon).toString(true);
      templateData.avatarContainer.replaceChildren(dom.$(".avatar", void 0, avatarIcon));
    } else {
      const avatarIcon = dom.$(ThemeIcon.asCSSSelector(icon));
      templateData.avatarContainer.replaceChildren(dom.$(".avatar.codicon-avatar", void 0, avatarIcon));
    }
  }
  getAgentIcon(agent) {
    if (agent?.themeIcon) {
      return agent.themeIcon;
    } else if (agent?.iconDark && isDark(this.themeService.getColorTheme().type)) {
      return agent.iconDark;
    } else if (agent?.icon) {
      return agent.icon;
    } else {
      return Codicon.chatSparkle;
    }
  }
  renderChatResponseBasic(element, index, templateData) {
    templateData.rowContainer.classList.toggle("chat-response-loading", isResponseVM(element) && !element.isComplete);
    this.finalizeCompletedResponseParts(element, templateData);
    const content = [];
    const isFiltered = !!element.errorDetails?.responseIsFiltered;
    if (!isFiltered) {
      content.push({ kind: "references", references: element.contentReferences });
      const responseContent = annotateSpecialMarkdownContent(element.response.value);
      content.push(...element.isComplete ? moveResponseOutcomeToolsAfterFinalResponse(responseContent) : responseContent);
      if (element.codeCitations.length) {
        content.push({ kind: "codeCitations", citations: element.codeCitations });
      }
    }
    if (element.model.response === element.model.entireResponse && !element.isCanceled && element.errorDetails?.message && element.errorDetails.message !== canceledName) {
      content.push({ kind: "errorDetails", errorDetails: element.errorDetails, isLast: getStickyScrollTargetItem(this.viewModel?.getItems() ?? []) === element });
    }
    const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
    if (fileChangesSummaryPart) {
      content.push(fileChangesSummaryPart);
    }
    const turnPillsPart = this.getChatTurnPillsPart(element);
    if (turnPillsPart) {
      content.push(turnPillsPart);
    }
    const workingProgress = this.shouldShowWorkingProgress(element, content, false, templateData);
    if (workingProgress) {
      content.push(workingProgress);
    }
    const diff = this.diff(templateData.renderedParts ?? [], content, element);
    this.renderChatContentDiff(diff, content, element, index, templateData);
    this.finalizeCompletedResponseParts(element, templateData);
  }
  finalizeCompletedResponseParts(element, templateData) {
    if (!element.isComplete && !element.isCanceled) {
      return;
    }
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinking?.domNode && lastThinking.getIsActive()) {
      lastThinking.finalizeTitleIfDefault();
      lastThinking.markAsInactive();
    }
    this.finalizeAllSubagentParts(templateData, true);
  }
  shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData) {
    if (element.agentOrSlashCommandDetected || this.rendererOptions.renderStyle === "minimal" || element.isComplete || !checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.progressMessageAtBottomOfResponse)) {
      return void 0;
    }
    if (partsToRender.some((part) => part.kind === "planReview" && !part.isUsed)) {
      return void 0;
    }
    if (endsWithActiveSubagentContent(partsToRender)) {
      return void 0;
    }
    if (isResponseVM(element)) {
      const widget = this.chatWidgetService.getWidgetBySessionResource(element.sessionResource);
      if (widget?.inputPart.hasActiveToolConfirmationCarousel) {
        const nonSubagentConfirmationCount = this.getPendingToolConfirmationCount(partsToRender, false);
        if (nonSubagentConfirmationCount > 0) {
          return {
            kind: "working",
            content: new MarkdownString().appendText(this.getConfirmationPendingLabel(nonSubagentConfirmationCount))
          };
        }
        if (this.getPendingToolConfirmationCount(partsToRender, true) > 0) {
          return void 0;
        }
        return {
          kind: "working",
          content: new MarkdownString().appendText(this.getConfirmationPendingLabel(1))
        };
      }
    }
    if (isWaitingForMcpServers(partsToRender)) {
      return void 0;
    }
    const workingParts = getWorkingProgressRelevantParts(partsToRender);
    const lastPart = findLastMeaningfulPart(workingParts);
    const endsWithCompletedQuestion = endsWithCompletedQuestionInteraction(workingParts);
    if (workingParts.some((part) => part.kind === "toolInvocation" && IChatToolInvocation.isStreaming(part))) {
      return void 0;
    }
    if (workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part) && isMcpToolInvocation(part))) {
      return void 0;
    }
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinking && !endsWithCompletedQuestion) {
      return void 0;
    }
    if (lastPart && (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized")) {
      if (lastPart.isAttachedToThinking) {
        return void 0;
      }
      const isEffectivelyHiddenToolInvocation = IChatToolInvocation.isEffectivelyHidden(lastPart);
      const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
      if (!isEffectivelyHiddenToolInvocation && collapsedToolsMode !== CollapsedToolsDisplayMode.Off && this.shouldPinPart(lastPart, isResponseVM(element) ? element : void 0)) {
        return void 0;
      }
    }
    const hasRenderedThinkingPart = (templateData.renderedParts ?? []).some((part) => part instanceof ChatThinkingContentPart);
    const hasEditPillMarkdown = workingParts.some((part) => part.kind === "markdownContent" && this.hasEditCodeblockUri(part));
    if (hasRenderedThinkingPart && hasEditPillMarkdown) {
      return void 0;
    }
    if (!lastPart || lastPart.kind === "references" || lastPart.kind === "markdownContent" && !moreContentAvailable && this.hasBeenCaughtUpLongEnough(element) || (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized") && (IChatToolInvocation.isComplete(lastPart) || IChatToolInvocation.isEffectivelyHidden(lastPart)) || (lastPart.kind === "textEditGroup" || lastPart.kind === "notebookEditGroup") && lastPart.done && !workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part)) || lastPart.kind === "externalEdit" && !workingParts.some((part) => part.kind === "toolInvocation" && !IChatToolInvocation.isComplete(part)) || lastPart.kind === "progressTask" && lastPart.deferred.isSettled || endsWithCompletedQuestion || lastPart.kind === "mcpServersStarting" || lastPart.kind === "mcpAuthenticationRequired" || lastPart.kind === "mcpServersStartingSlow" || lastPart.kind === "disabledClaudeHooks" || lastPart.kind === "hook") {
      return { kind: "working" };
    }
    return void 0;
  }
  getPendingToolConfirmationCount(parts, includeSubagentConfirmations) {
    return parts.filter((part) => {
      if (part.kind !== "toolInvocation") {
        return false;
      }
      const state = part.state.get();
      return state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title && part.presentation !== "hidden" && part.source.type !== "mcp" && isSubagentToolInvocation(part) === includeSubagentConfirmations;
    }).length;
  }
  getConfirmationPendingLabel(count) {
    return count === 1 ? localize("confirmationPending", "1 confirmation pending") : localize("confirmationsPending", "{0} confirmations pending", count);
  }
  removeWorkingProgressContentPart(templateData) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatWorkingProgressContentPart) {
        part.dispose();
        part.domNode?.remove();
        renderedParts.splice(i, 1);
        this.fireItemHeightChange(templateData);
        return;
      }
    }
  }
  updateWorkingProgressForPendingConfirmations(templateData) {
    const originalElement = templateData.currentElement;
    queueMicrotask(() => {
      if (templateData.currentElement !== originalElement) {
        return;
      }
      this.doUpdateWorkingProgressForPendingConfirmations(templateData);
    });
  }
  doUpdateWorkingProgressForPendingConfirmations(templateData) {
    const element = templateData.currentElement;
    if (!isResponseVM(element)) {
      return;
    }
    const pendingConfirmationCount = this.getPendingToolConfirmationCount(element.response.value, false);
    if (pendingConfirmationCount === 0) {
      this.removeWorkingProgressContentPart(templateData);
      return;
    }
    const workingProgressPart = this.getWorkingProgressContentPart(templateData);
    if (workingProgressPart) {
      workingProgressPart.updateWorkingContent(new MarkdownString().appendText(this.getConfirmationPendingLabel(pendingConfirmationCount)));
    }
  }
  getWorkingProgressContentPart(templateData) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatWorkingProgressContentPart) {
        return part;
      }
    }
    return void 0;
  }
  createUpdateWorkingProgressOnConfirmationEnd(toolInvocation, templateData) {
    if (this.workingProgressConfirmationEndListeners.has(toolInvocation)) {
      return void 0;
    }
    this.workingProgressConfirmationEndListeners.add(toolInvocation);
    let wasWaitingForConfirmation = false;
    const disposable = autorun((reader) => {
      const currentState = toolInvocation.state.read(reader);
      const isWaitingForConfirmation = currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation;
      if (wasWaitingForConfirmation && !isWaitingForConfirmation) {
        this.updateWorkingProgressForPendingConfirmations(templateData);
        this.workingProgressConfirmationEndListeners.delete(toolInvocation);
        disposable.dispose();
      }
      wasWaitingForConfirmation = isWaitingForConfirmation;
    });
    return toDisposable(() => {
      this.workingProgressConfirmationEndListeners.delete(toolInvocation);
      disposable.dispose();
    });
  }
  hasBeenCaughtUpLongEnough(element) {
    const lastRenderTime = element.renderData?.lastRenderTime;
    if (typeof lastRenderTime !== "number" || lastRenderTime === 0) {
      return false;
    }
    return Date.now() - lastRenderTime >= WORKING_CAUGHT_UP_DEBOUNCE_MS;
  }
  /**
   * Returns the last part that visually contributes to the response, skipping
   * empty markdown placeholders.
   */
  /**
   * True while we have caught up to streamed markdown but are still within the
   * {@link WORKING_CAUGHT_UP_DEBOUNCE_MS} window before the working indicator
   * should appear. The progressive render loop keeps polling in this state so
   * the indicator can still surface after a genuine pause, instead of being
   * dropped when the loop would otherwise stop (the debounce itself avoids
   * flicker during normal token streaming).
   */
  isWorkingProgressDebouncePending(element, partsToRender) {
    if (element.isComplete) {
      return false;
    }
    if (partsToRender.some((part) => part.kind === "working")) {
      return false;
    }
    return findLastMeaningfulPart(getWorkingProgressRelevantParts(partsToRender))?.kind === "markdownContent" && !this.hasBeenCaughtUpLongEnough(element);
  }
  getChatFileChangesSummaryPart(element) {
    if (this.shouldShowPillsSummary(element) || !this.shouldShowFileChangesSummary(element)) {
      return void 0;
    }
    const sessionType = getChatSessionType(element.sessionResource);
    if (!isAgentHostTarget(sessionType) && !element.model.entireResponse.value.some((part) => part.kind === "textEditGroup" || part.kind === "notebookEditGroup")) {
      return void 0;
    }
    return { kind: "changesSummary", requestId: element.requestId, sessionResource: element.sessionResource };
  }
  getChatTurnPillsPart(element) {
    if (!this.shouldShowPillsSummary(element)) {
      return void 0;
    }
    return {
      kind: "turnPills",
      requestId: element.requestId,
      sessionResource: element.sessionResource,
      isLastTurn: element.session.model.lastRequest?.id === element.requestId
    };
  }
  renderChatRequest(element, index, templateData) {
    templateData.rowContainer.classList.toggle("chat-response-loading", false);
    templateData.rowContainer.classList.toggle("pending-request", !!element.pendingKind);
    templateData.rowContainer.classList.toggle("system-initiated-request", !!element.isSystemInitiated);
    templateData.rowContainer.classList.toggle("terminal-command-request", !element.isSystemInitiated && element.isTerminalCommand);
    if (element.isSystemInitiated) {
      this.renderSystemInitiatedRequest(element, templateData);
      return;
    }
    if (element.pendingKind && this._pendingDragController) {
      templateData.rowContainer.dataset.pendingRequestId = element.id;
      templateData.rowContainer.dataset.pendingKind = element.pendingKind;
      const sameKindCount = (this.viewModel?.model.getPendingRequests() ?? []).filter((p) => p.kind === element.pendingKind).length;
      if (sameKindCount > 1) {
        const handle = dom.$(".chat-pending-drag-handle" + ThemeIcon.asCSSSelector(Codicon.gripper));
        templateData.rowContainer.prepend(handle);
        templateData.dragHandle = handle;
        this._pendingDragController.attachDragHandle(element, handle, templateData.rowContainer, templateData.elementDisposables);
      }
    }
    if (element.id === this.viewModel?.editing?.id) {
      this._onDidRerender.fire(templateData);
    }
    if (this.configService.getValue("chat.editRequests") !== "none" && this.rendererOptions.editable) {
      templateData.elementDisposables.add(dom.addDisposableListener(templateData.rowContainer, dom.EventType.KEY_DOWN, (e) => {
        const ev = new StandardKeyboardEvent(e);
        if (ev.equals(KeyCode.Space) || ev.equals(KeyCode.Enter)) {
          if (this.viewModel?.editing?.id !== element.id) {
            ev.preventDefault();
            ev.stopPropagation();
            this._onDidClickRequest.fire(templateData);
          }
        }
      }));
    }
    let content = [];
    const explicitFileOrImageVariables = element.variables.filter(isExplicitFileOrImageVariableEntry);
    const explicitImageVariables = explicitFileOrImageVariables.filter((variable) => variable.kind === "image");
    const explicitFileOrDirectoryVariables = element.variables.filter((variable) => variable.kind === "file" || variable.kind === "directory" || isPasteVariableEntry(variable));
    const otherVariables = element.variables.filter((variable) => !isExplicitFileOrImageVariableEntry(variable) && !isPasteVariableEntry(variable));
    if (!element.confirmation) {
      const markdown = isChatFollowup(element.message) ? element.message.message : this.markdownDecorationsRenderer.convertParsedRequestToMarkdown(element.sessionResource, element.message);
      const attachmentSummary = !element.messageText.trim() && !explicitFileOrImageVariables.length ? getExplicitFileOrImageAttachmentSummary(element.variables) : void 0;
      const requestMarkdown = markdown.trim() ? markdown : attachmentSummary;
      if (requestMarkdown) {
        content = [{ content: new MarkdownString(requestMarkdown), kind: "markdownContent" }];
      }
      if (this.rendererOptions.renderStyle === "minimal" && !element.isComplete) {
        templateData.value.classList.add("inline-progress");
        templateData.elementDisposables.add(toDisposable(() => templateData.value.classList.remove("inline-progress")));
        content.push({ content: new MarkdownString("<span></span>", { supportHtml: true }), kind: "markdownContent" });
      } else {
        templateData.value.classList.remove("inline-progress");
      }
    }
    dom.clearNode(templateData.value);
    const isFirstRequest = this.viewModel?.model.getRequests()[0]?.id === element.id;
    if (element.origin || this.environmentService.isSessionsWindow && isFirstRequest) {
      const requestOriginPart = this.instantiationService.createInstance(ChatRequestOriginPart, element.sessionResource, element.origin);
      templateData.value.appendChild(requestOriginPart.domNode);
      templateData.elementDisposables.add(requestOriginPart);
    }
    const parts = [];
    const explicitImageAttachmentsPart = explicitImageVariables.length ? this.renderAttachments(explicitImageVariables, element.contentReferences, element.modelId, templateData, element.resolvedModelId) : void 0;
    if (explicitImageAttachmentsPart?.domNode) {
      explicitImageAttachmentsPart.domNode.classList.add("chat-request-attachment-cards", "chat-request-image-attachments");
      templateData.value.appendChild(explicitImageAttachmentsPart.domNode);
      templateData.elementDisposables.add(explicitImageAttachmentsPart);
    }
    const explicitFileAttachmentsPart = explicitFileOrDirectoryVariables.length ? this.renderAttachments(explicitFileOrDirectoryVariables, element.contentReferences, element.modelId, templateData) : void 0;
    if (explicitFileAttachmentsPart?.domNode) {
      explicitFileAttachmentsPart.domNode.classList.add("chat-request-attachment-cards", "chat-request-file-attachments");
      explicitFileAttachmentsPart.domNode.style.display = "flex";
      explicitFileAttachmentsPart.domNode.style.flexDirection = "column";
      explicitFileAttachmentsPart.domNode.style.alignItems = "flex-end";
      explicitFileAttachmentsPart.domNode.style.flexWrap = "nowrap";
      templateData.value.appendChild(explicitFileAttachmentsPart.domNode);
      templateData.elementDisposables.add(explicitFileAttachmentsPart);
    }
    const contentContainer = templateData.value;
    let inlineSlashCommandRendered = false;
    let codeBlockStartIndex = 0;
    content.forEach((data, contentIndex) => {
      const context = {
        element,
        elementIndex: index,
        contentIndex,
        content,
        container: templateData.rowContainer,
        editorPool: this._editorPool,
        diffEditorPool: this._diffEditorPool,
        currentWidth: this._currentLayoutWidth,
        onDidChangeVisibility: this._onDidChangeVisibility.event,
        inlineTextModels: this._inlineTextModels,
        codeBlockStartIndex,
        treeStartIndex: 0
        // no trees in requests
      };
      const newPart = this.renderChatContentPart(data, templateData, context);
      if (newPart) {
        if (this.rendererOptions.renderDetectedCommandsWithRequest && !inlineSlashCommandRendered && element.agentOrSlashCommandDetected && element.slashCommand && data.kind === "markdownContent") {
          if (newPart.domNode) {
            newPart.domNode.style.display = "inline-flex";
          }
          const cmdPart = this.instantiationService.createInstance(ChatAgentCommandContentPart, element.slashCommand, () => this._onDidClickRerunWithAgentOrCommandDetection.fire({ sessionResource: element.sessionResource, requestId: element.id }));
          contentContainer.appendChild(cmdPart.domNode);
          parts.push(cmdPart);
          inlineSlashCommandRendered = true;
        }
        if (newPart.domNode && !newPart.domNode.parentElement) {
          contentContainer.appendChild(newPart.domNode);
        }
        parts.push(newPart);
        codeBlockStartIndex += newPart.codeblocks?.length ?? 0;
      }
    });
    if (templateData.renderedParts) {
      dispose(templateData.renderedParts);
    }
    templateData.renderedParts = parts;
    if (otherVariables.length) {
      const newPart = this.renderAttachments(otherVariables, element.contentReferences, element.modelId, templateData);
      if (newPart.domNode) {
        templateData.value.appendChild(newPart.domNode);
      }
      templateData.elementDisposables.add(newPart);
    }
    if (!element.pendingKind && !element.confirmation && this.rendererOptions.renderStyle !== "minimal" && templateData.value.childElementCount > 0) {
      const timestamp = renderChatRequestTimestamp(templateData.requestTimestampContainer, element.requestTimestamp);
      if (timestamp?.hoverText) {
        templateData.elementDisposables.add(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), timestamp.element, timestamp.hoverText));
      } else if (timestamp) {
        let requestTimingBounds;
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_OVER, (e) => {
          const target = dom.isHTMLElement(e.target) ? e.target.closest(".chat-request-relative") : void 0;
          if (!dom.isHTMLElement(target) || !timestamp.element.contains(target)) {
            return;
          }
          const bounds = target.getBoundingClientRect();
          requestTimingBounds = bounds;
          timestamp.element.classList.add("chat-request-flip-reset");
          timestamp.element.classList.remove("chat-request-flip-active");
          timestamp.element.classList.toggle("chat-request-flip-down", e.clientY < bounds.top + bounds.height / 2);
          void timestamp.element.offsetWidth;
          timestamp.element.classList.remove("chat-request-flip-reset");
          void timestamp.element.offsetWidth;
          timestamp.element.classList.add("chat-request-flip-active");
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_MOVE, (e) => {
          if (requestTimingBounds && (e.clientX < requestTimingBounds.left || e.clientX > requestTimingBounds.right || e.clientY < requestTimingBounds.top || e.clientY > requestTimingBounds.bottom)) {
            requestTimingBounds = void 0;
            timestamp.element.classList.remove("chat-request-flip-active");
          }
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.MOUSE_LEAVE, () => {
          requestTimingBounds = void 0;
          timestamp.element.classList.remove("chat-request-flip-active");
        }));
        templateData.elementDisposables.add(dom.addDisposableListener(timestamp.element, dom.EventType.FOCUS, () => {
          timestamp.element.classList.remove("chat-request-flip-active", "chat-request-flip-down");
        }));
      }
    }
  }
  renderSystemInitiatedRequest(element, templateData) {
    dom.clearNode(templateData.value);
    if (templateData.renderedParts) {
      dispose(templateData.renderedParts);
    }
    templateData.renderedParts = [];
    const label = element.systemInitiatedLabel ?? element.messageText;
    const notificationPart = this.instantiationService.createInstance(
      ChatSystemNotificationContentPart,
      { kind: "systemNotification", content: new MarkdownString(label) },
      this.chatContentMarkdownRenderer
    );
    templateData.elementDisposables.add(notificationPart);
    templateData.value.appendChild(notificationPart.domNode);
  }
  /**
   * Smooth streaming render path — event-driven, rAF-batched.
   *
   * Does a render pass that feeds the full content through
   * `getNextProgressiveRenderContent` → `diff` → `renderChatContentDiff`,
   * where the morpher intercepts markdown appends and schedules
   * rAF-batched re-renders through the standard markdown pipeline.
   *
   * Called on every `renderElement` invocation (which fires each time
   * the model changes). On completion/cancellation the morpher's
   * content is already correctly rendered, so we do a final diff pass
   * (not a destructive re-render) to finalize non-markdown parts like
   * thinking indicators, error details, and code citations.
   */
  doIncrementalRender(element, index, templateData) {
    if (!this._isVisible) {
      return;
    }
    const rate = this.getProgressiveRenderRate(element);
    this._updateMorpherRate(templateData, rate, element.isComplete || element.isCanceled);
    if (element.isCanceled || element.isComplete) {
      element.renderData = void 0;
      templateData.rowContainer.classList.toggle("chat-response-loading", false);
      this.renderChatResponseBasic(element, index, templateData);
      return;
    }
    templateData.rowContainer.classList.toggle("chat-response-loading", true);
    const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
    const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);
    const contentIsAlreadyRendered = partsToRender.every((part) => part === null);
    if (!contentIsAlreadyRendered) {
      this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);
    }
  }
  /**
   * Propagate the stream's word-rate estimate to any active morpher's
   * word buffer so it reveals content at the model's speed.
   */
  _updateMorpherRate(templateData, rate, isComplete) {
    const renderedParts = templateData.renderedParts;
    if (!renderedParts) {
      return;
    }
    for (const part of renderedParts) {
      if (part instanceof ChatMarkdownContentPart) {
        part.updateStreamRate(rate, isComplete);
      }
    }
  }
  logIncrementalRenderingTelemetry() {
    if (this._incrementalRenderingTelemetryLogged) {
      return;
    }
    this._incrementalRenderingTelemetryLogged = true;
    this.telemetryService.publicLog2("chatIncrementalRenderingSettings", {
      animationStyle: this.configService.getValue(ChatConfiguration.IncrementalRenderingStyle) ?? "none",
      buffering: this.configService.getValue(ChatConfiguration.IncrementalRenderingBuffering) ?? "word"
    });
  }
  /**
   *	@returns true if progressive rendering should be considered complete- the element's data is fully rendered or the view is not visible
   */
  doNextProgressiveRender(element, index, templateData, isInRenderElement) {
    if (!this._isVisible) {
      return true;
    }
    if (element.isCanceled) {
      this.traceLayout("doNextProgressiveRender", `canceled, index=${index}`);
      element.renderData = void 0;
      this.renderChatResponseBasic(element, index, templateData);
      return true;
    }
    templateData.rowContainer.classList.toggle("chat-response-loading", true);
    this.traceLayout("doNextProgressiveRender", `START progressive render, index=${index}`);
    const contentForThisTurn = this.getNextProgressiveRenderContent(element, templateData);
    const partsToRender = this.diff(templateData.renderedParts ?? [], contentForThisTurn.content, element);
    const contentIsAlreadyRendered = partsToRender.every((part) => part === null);
    if (contentIsAlreadyRendered) {
      if (contentForThisTurn.moreContentAvailable) {
        this.traceLayout("doNextProgressiveRender", "not rendering any new content this tick, but more available");
        return false;
      } else if (element.isComplete) {
        this.traceLayout("doNextProgressiveRender", `END progressive render, index=${index} and clearing renderData, response is complete`);
        element.renderData = void 0;
        this.renderChatResponseBasic(element, index, templateData);
        return true;
      } else if (this.isWorkingProgressDebouncePending(element, contentForThisTurn.content)) {
        return false;
      } else {
        return true;
      }
    }
    this.traceLayout("doNextProgressiveRender", `doing progressive render, ${partsToRender.length} parts to render`);
    this.renderChatContentDiff(partsToRender, contentForThisTurn.content, element, index, templateData);
    return false;
  }
  renderChatContentDiff(partsToRender, contentForThisTurn, element, elementIndex, templateData) {
    const renderedParts = templateData.renderedParts ?? [];
    templateData.renderedParts = renderedParts;
    templateData.renderedContent = contentForThisTurn;
    const batchedSubagentParts = /* @__PURE__ */ new Set();
    let codeBlockStartIndex = 0;
    let treeStartIndex = 0;
    let displacedWorkingPart;
    const renderParts = () => partsToRender.forEach((partToRender, contentIndex) => {
      if (contentIndex > 0) {
        const prevPart = renderedParts[contentIndex - 1];
        if (prevPart) {
          codeBlockStartIndex += prevPart.codeblocks?.length ?? 0;
          if (prevPart instanceof ChatTreeContentPart) {
            treeStartIndex++;
          }
        }
      }
      const alreadyRenderedPart = templateData.renderedParts?.[contentIndex];
      if (!partToRender) {
        if (!templateData.renderedPartsMounted) {
          alreadyRenderedPart?.onDidRemount?.();
        }
        return;
      }
      if (partToRender.kind === "working" && displacedWorkingPart?.hasSameContent(partToRender, contentForThisTurn.slice(contentIndex + 1), element)) {
        renderedParts[contentIndex] = displacedWorkingPart;
        displacedWorkingPart = void 0;
        return;
      }
      const preserveWorkingPart = alreadyRenderedPart instanceof ChatWorkingProgressContentPart && partToRender.kind !== "working" && contentForThisTurn.slice(contentIndex + 1).some((part) => part.kind === "working");
      if (alreadyRenderedPart) {
        if (partToRender.kind === "thinking" && alreadyRenderedPart instanceof ChatThinkingContentPart) {
          if (!Array.isArray(partToRender.value)) {
            alreadyRenderedPart.updateThinking(partToRender);
          }
          renderedParts[contentIndex] = alreadyRenderedPart;
          return;
        } else if (alreadyRenderedPart instanceof ChatThinkingContentPart && this.shouldPinPart(partToRender, element)) {
          renderedParts[contentIndex] = alreadyRenderedPart;
          return;
        }
        if (partToRender.kind === "markdownContent" && alreadyRenderedPart instanceof ChatMarkdownContentPart && this.configService.getValue(ChatConfiguration.IncrementalRendering)) {
          if (alreadyRenderedPart.tryIncrementalUpdate(partToRender)) {
            renderedParts[contentIndex] = alreadyRenderedPart;
            return;
          }
        }
        if (preserveWorkingPart) {
          displacedWorkingPart = alreadyRenderedPart;
        } else {
          alreadyRenderedPart.dispose();
        }
        if (alreadyRenderedPart.domNode) {
          const thinkingToolWrapper = dom.findParentWithClass(alreadyRenderedPart.domNode, "chat-thinking-tool-wrapper");
          if (thinkingToolWrapper) {
            thinkingToolWrapper.replaceWith(alreadyRenderedPart.domNode);
          }
        }
      }
      const context = {
        element,
        elementIndex,
        content: contentForThisTurn,
        contentIndex,
        container: templateData.rowContainer,
        editorPool: this._editorPool,
        diffEditorPool: this._diffEditorPool,
        currentWidth: this._currentLayoutWidth,
        onDidChangeVisibility: this._onDidChangeVisibility.event,
        inlineTextModels: this._inlineTextModels,
        codeBlockStartIndex,
        treeStartIndex
      };
      const lastThinking = this.getLastThinkingPart(renderedParts);
      if (lastThinking && (partToRender.kind === "toolInvocation" || partToRender.kind === "toolInvocationSerialized" || partToRender.kind === "markdownContent" || partToRender.kind === "textEditGroup" || partToRender.kind === "externalEdit" || partToRender.kind === "hook") && this.shouldPinPart(partToRender, element)) {
        if (alreadyRenderedPart instanceof ChatMarkdownContentPart) {
          lastThinking.removeEditPillByPartId(alreadyRenderedPart.codeblocksPartId);
        }
        const newPart2 = this.renderChatContentPart(partToRender, templateData, context, batchedSubagentParts);
        if (newPart2) {
          renderedParts[contentIndex] = newPart2;
          alreadyRenderedPart?.domNode?.remove();
        }
        return;
      }
      const newPart = this.renderChatContentPart(partToRender, templateData, context, batchedSubagentParts);
      if (newPart) {
        renderedParts[contentIndex] = newPart;
        try {
          if (alreadyRenderedPart?.domNode) {
            if (newPart.domNode) {
              if (preserveWorkingPart) {
                alreadyRenderedPart.domNode.before(newPart.domNode);
              } else {
                alreadyRenderedPart.domNode.replaceWith(newPart.domNode);
              }
            } else {
              if (!preserveWorkingPart) {
                alreadyRenderedPart.domNode.remove();
              }
            }
          } else if (newPart.domNode && !newPart.domNode.parentElement) {
            templateData.value.appendChild(newPart.domNode);
          }
        } catch (err) {
          this.logService.error("ChatListItemRenderer#renderChatContentDiff: error replacing part", err);
        }
      } else {
        alreadyRenderedPart?.domNode?.remove();
      }
    });
    try {
      renderParts();
    } finally {
      for (const subagentPart of batchedSubagentParts) {
        try {
          subagentPart.endToolPresentationBatch();
        } catch (error) {
          this.logService.error("ChatListItemRenderer#renderChatContentDiff: error flushing subagent presentation", error);
        }
      }
    }
    displacedWorkingPart?.dispose();
    displacedWorkingPart?.domNode?.remove();
    for (let i = partsToRender.length; i < renderedParts.length; i++) {
      const part = renderedParts[i];
      if (part) {
        part.dispose();
        part.domNode?.remove();
        delete renderedParts[i];
      }
    }
    const animateCollapse = templateData.wasResponseComplete === false && element.isComplete;
    this.updateCompletedResponseDisclosure(element, contentForThisTurn, templateData, animateCollapse);
    templateData.wasResponseComplete = element.isComplete;
  }
  updateCompletedResponseDisclosure(element, content, templateData, animateCollapse) {
    if (!element.isComplete || !this.configService.getValue(ChatConfiguration.CollapseCompletedResponses)) {
      this.removeCompletedResponseDisclosure(templateData);
      templateData.completedResponseDisclosureOpen = void 0;
      return;
    }
    const responseContent = annotateSpecialMarkdownContent(element.response.value);
    const responseFinalStartIndex = getFinalResponseStartIndexAfterMovingResponseOutcomeTools(responseContent);
    const finalResponseStartIndex = responseFinalStartIndex === void 0 ? void 0 : responseFinalStartIndex + 1;
    if (finalResponseStartIndex === void 0 || !isFinalResponseRendered(content, finalResponseStartIndex) || finalResponseStartIndex === 0 || !content.slice(0, finalResponseStartIndex).some((part) => part.kind !== "references" || part.references.length > 0)) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    const finalResponsePart = templateData.renderedParts?.[finalResponseStartIndex];
    if (!(finalResponsePart instanceof ChatMarkdownContentPart) || !finalResponsePart.isRenderComplete) {
      this.removeCompletedResponseDisclosure(templateData);
      if (finalResponsePart instanceof ChatMarkdownContentPart) {
        templateData.completedResponseDisclosureDisposables.add(Event.once(finalResponsePart.onDidFinishRendering)(() => {
          this.updateCompletedResponseDisclosure(element, content, templateData, false);
        }));
      }
      return;
    }
    const collapseEndIndex = getCompletedResponseCollapseEndIndex(content, finalResponseStartIndex);
    if (collapseEndIndex === 0) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    const collapseEndNode = templateData.renderedParts?.[collapseEndIndex]?.domNode;
    if (!collapseEndNode) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    let existingDisclosure = templateData.completedResponseDisclosure;
    if (existingDisclosure?.contains(collapseEndNode)) {
      this.removeCompletedResponseDisclosure(templateData);
      existingDisclosure = void 0;
    }
    let collapseEndRoot = collapseEndNode;
    while (collapseEndRoot.parentElement && collapseEndRoot.parentElement !== templateData.value) {
      collapseEndRoot = collapseEndRoot.parentElement;
    }
    if (collapseEndRoot.parentElement !== templateData.value) {
      this.removeCompletedResponseDisclosure(templateData);
      return;
    }
    if (existingDisclosure && templateData.completedResponseCollapseEndIndex === collapseEndIndex && existingDisclosure.nextSibling === collapseEndRoot && templateData.renderedParts?.slice(0, collapseEndIndex).every((part) => !part?.domNode || existingDisclosure.contains(part.domNode))) {
      return;
    }
    this.removeCompletedResponseDisclosure(templateData);
    const valueChildren = Array.from(templateData.value.childNodes);
    const nodesToCollapse = valueChildren.slice(0, valueChildren.indexOf(collapseEndRoot));
    const stepCount = getVisibleCompletedResponseItemCount(nodesToCollapse);
    if (stepCount < 2) {
      return;
    }
    const details = document.createElement("details");
    details.classList.add("completed-response-disclosure");
    const summary = details.appendChild(document.createElement("summary"));
    summary.classList.add("completed-response-summary", "chat-used-context-label");
    const button = summary.appendChild($("span.monaco-button.monaco-text-button.monaco-icon-button"));
    const label = button.appendChild($("span.monaco-button-mdlabel"));
    const chevron = button.appendChild($("span.chat-collapsible-hover-chevron", { "aria-hidden": "true" }));
    chevron.classList.add(...ThemeIcon.asClassNameArray(Codicon.chevronRight));
    const disclosureLabel = formatCompletedResponseDisclosureLabel(stepCount, element.model.elapsedMs);
    label.textContent = disclosureLabel;
    const activeElement = dom.getActiveElement();
    const keepOpenForFocus = nodesToCollapse.some((node) => node.contains(activeElement));
    const shouldAnimateInitialCollapse = animateCollapse && !keepOpenForFocus && !this.accessibilityService.isMotionReduced() && templateData.completedResponseDisclosureOpen === void 0;
    if (keepOpenForFocus) {
      templateData.completedResponseDisclosureOpen = true;
    }
    details.open = templateData.completedResponseDisclosureOpen ?? shouldAnimateInitialCollapse;
    const updateExpansionState = () => {
      summary.setAttribute("aria-expanded", String(details.open));
      chevron.classList.toggle("expanded", details.open);
    };
    updateExpansionState();
    templateData.value.insertBefore(details, collapseEndRoot);
    details.append(...nodesToCollapse);
    templateData.completedResponseDisclosure = details;
    templateData.completedResponseCollapseEndIndex = collapseEndIndex;
    templateData.completedResponseDisclosureDisposables.add(dom.addDisposableListener(details, "toggle", () => {
      templateData.completedResponseDisclosureOpen = details.open;
      updateExpansionState();
    }));
    templateData.completedResponseDisclosureDisposables.add(dom.addDisposableListener(summary, dom.EventType.CLICK, () => {
      details.dispatchEvent(new CustomEvent(ChatCollapsibleContentPart.userToggleEvent, { bubbles: true }));
    }));
    if (shouldAnimateInitialCollapse) {
      const targetWindow = dom.getWindow(details);
      const animationFrame = targetWindow.requestAnimationFrame(() => {
        if (templateData.completedResponseDisclosure === details && details.open) {
          details.open = false;
        }
      });
      templateData.completedResponseDisclosureDisposables.add(toDisposable(() => targetWindow.cancelAnimationFrame(animationFrame)));
    }
  }
  removeCompletedResponseDisclosure(templateData) {
    templateData.completedResponseDisclosureDisposables.clear();
    const details = templateData.completedResponseDisclosure;
    if (!details) {
      return;
    }
    while (details.childNodes.length > 1) {
      details.before(details.childNodes[1]);
    }
    details.remove();
    templateData.completedResponseDisclosure = void 0;
    templateData.completedResponseCollapseEndIndex = void 0;
  }
  /**
   * Returns all content parts that should be rendered, and trimmed markdown content. We will diff this with the current rendered set.
   */
  getNextProgressiveRenderContent(element, templateData) {
    const data = this.getDataForProgressiveRender(element);
    const incrementalRendering = this.configService.getValue(ChatConfiguration.IncrementalRendering) === true;
    const responseContent = annotateSpecialMarkdownContent(element.response.value);
    const renderableResponse = element.isComplete ? moveResponseOutcomeToolsAfterFinalResponse(responseContent) : responseContent;
    this.traceLayout("getNextProgressiveRenderContent", `Want to render ${data.numWordsToRender} at ${data.rate} words/s, counting...`);
    let numNeededWords = data.numWordsToRender;
    const partsToRender = [];
    partsToRender.push({ kind: "references", references: element.contentReferences });
    let moreContentAvailable = false;
    for (let i = 0; i < renderableResponse.length; i++) {
      const part = renderableResponse[i];
      if (part.kind === "markdownContent" && !incrementalRendering) {
        const wordCountResult = getNWords(part.content.value, numNeededWords);
        this.traceLayout("getNextProgressiveRenderContent", `  Chunk ${i}: Want to render ${numNeededWords} words and found ${wordCountResult.returnedWordCount} words. Total words in chunk: ${wordCountResult.totalWordCount}`);
        numNeededWords -= wordCountResult.returnedWordCount;
        if (wordCountResult.isFullString) {
          partsToRender.push(part);
          for (const nextPart of renderableResponse.slice(i + 1)) {
            if (nextPart.kind !== "markdownContent") {
              i++;
              partsToRender.push(nextPart);
            } else {
              break;
            }
          }
        } else {
          moreContentAvailable = true;
          partsToRender.push({ ...part, content: new MarkdownString(wordCountResult.value, part.content) });
        }
        if (numNeededWords <= 0) {
          if (renderableResponse.slice(i + 1).some((part2) => part2.kind === "markdownContent")) {
            moreContentAvailable = true;
          }
          break;
        }
      } else {
        partsToRender.push(part);
      }
    }
    const lastWordCount = element.contentUpdateTimings?.lastWordCount ?? 0;
    const newRenderedWordCount = data.numWordsToRender - numNeededWords;
    const bufferWords = lastWordCount - newRenderedWordCount;
    this.traceLayout("getNextProgressiveRenderContent", `Want to render ${data.numWordsToRender} words. Rendering ${newRenderedWordCount} words. Buffer: ${bufferWords} words`);
    if (newRenderedWordCount > 0 && newRenderedWordCount !== element.renderData?.renderedWordCount) {
      element.renderData = { lastRenderTime: Date.now(), renderedWordCount: newRenderedWordCount, renderedParts: partsToRender };
    }
    const workingProgress = this.shouldShowWorkingProgress(element, partsToRender, moreContentAvailable, templateData);
    if (workingProgress) {
      partsToRender.push(workingProgress);
    }
    const fileChangesSummaryPart = this.getChatFileChangesSummaryPart(element);
    if (fileChangesSummaryPart) {
      partsToRender.push(fileChangesSummaryPart);
    }
    const turnPillsPart = this.getChatTurnPillsPart(element);
    if (turnPillsPart) {
      partsToRender.push(turnPillsPart);
    }
    return { content: partsToRender, moreContentAvailable };
  }
  shouldShowFileChangesSummary(element) {
    const sessionType = getChatSessionType(element.sessionResource);
    const isLocalSession = sessionType === localChatSessionType || isAgentHostTarget(sessionType);
    return shouldShowFileChangesSummaryForSettings(
      element.isComplete,
      isLocalSession,
      this.configService.getValue("chat.checkpoints.showFileChanges")
    );
  }
  shouldShowPillsSummary(element) {
    return shouldShowPillsSummaryForSettings(
      element.isComplete,
      isAgentHostTarget(getChatSessionType(element.sessionResource)),
      this.configService.getValue(ChatConfiguration.TurnStatusPills)
    );
  }
  getDataForProgressiveRender(element) {
    const hasMarkdownParts = element.response.value.some((part) => part.kind === "markdownContent" && part.content.value.trim().length > 0);
    if (shouldRenderInitialProgressiveContentImmediately(element.isComplete, hasMarkdownParts, element.renderData !== void 0)) {
      return {
        numWordsToRender: Number.MAX_SAFE_INTEGER,
        rate: Number.MAX_SAFE_INTEGER
      };
    }
    const renderData = element.renderData ?? { lastRenderTime: 0, renderedWordCount: 0 };
    const rate = this.getProgressiveRenderRate(element);
    const numWordsToRender = renderData.lastRenderTime === 0 ? 1 : renderData.renderedWordCount + // Additional words to render beyond what's already rendered
    Math.floor((Date.now() - renderData.lastRenderTime) / 1e3 * rate);
    return {
      numWordsToRender,
      rate
    };
  }
  diff(renderedParts, contentToRender, element) {
    const diff = [];
    for (let i = 0; i < contentToRender.length; i++) {
      const content = contentToRender[i];
      const renderedPart = renderedParts[i];
      if (!renderedPart || !renderedPart.hasSameContent(content, contentToRender.slice(i + 1), element)) {
        diff.push(content);
      } else {
        diff.push(null);
      }
    }
    return diff;
  }
  hasEditCodeblockUri(part) {
    if (part.kind !== "markdownContent") {
      return false;
    }
    return hasEditCodeblockUriTag(part.content.value);
  }
  isCodeblockComplete(part, element) {
    if (part.kind !== "markdownContent") {
      return true;
    }
    return !isResponseVM(element) || element.isComplete || codeblockHasClosingBackticks(part.content.value);
  }
  // todo @justschen initially split up each of the checks to easily see what should be pinned/not pinned, we can probably consolidate this down by a lot once we're more confident in the logic.
  shouldPinPart(part, element) {
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (part.kind === "thinking" || part.kind === "working") {
      return true;
    }
    if (part.kind === "undoStop") {
      return true;
    }
    if (part.kind === "hook") {
      if (part.subAgentInvocationId) {
        return false;
      }
      return part.hookType === HookType.PreToolUse || part.hookType === HookType.PostToolUse;
    }
    if (collapsedToolsMode === CollapsedToolsDisplayMode.Off) {
      return false;
    }
    if (this.hasEditCodeblockUri(part) || part.kind === "textEditGroup" || part.kind === "externalEdit") {
      return true;
    }
    const isMcpTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isMcpToolInvocation(part);
    if (isMcpTool) {
      return false;
    }
    const isMermaidTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolId.toLowerCase().includes("mermaid");
    if (isMermaidTool) {
      return false;
    }
    const isAskQuestionsTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isAskQuestionsToolInvocation(part);
    if (isAskQuestionsTool) {
      return false;
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && isSubagentToolInvocation(part)) {
      return false;
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && (isCreateSessionTool(part.toolId) || isCreateChatTool(part.toolId) || isSendMessageTool(part.toolId))) {
      return false;
    }
    if ((part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && (part.toolId === "image_gen.imagegen" || part.toolSpecificData?.kind === "generatedImage")) {
      return false;
    }
    const isTerminalTool = (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") && part.toolSpecificData?.kind === "terminal";
    const isContributedTerminalToolInvocation = element && (element.sessionResource.scheme !== Schemas.vscodeChatInput && getChatSessionType(element.sessionResource) !== localChatSessionType) && part.kind === "toolInvocationSerialized" && part.toolSpecificData?.kind === "terminal";
    if (isTerminalTool && !isContributedTerminalToolInvocation) {
      if (part.kind === "toolInvocation" && IChatToolInvocation.getConfirmationMessages(part)) {
        return false;
      }
      const terminalToolsInThinking = this.configService.getValue(ChatConfiguration.TerminalToolsInThinking);
      return !!terminalToolsInThinking;
    }
    if (part.kind === "toolInvocation") {
      const state = part.state.get();
      return shouldPinToolInvocationToThinking(state.type, !!IChatToolInvocation.getConfirmationMessages(part), toolInvocationHasMcpAppData(part));
    }
    if (part.kind === "toolInvocationSerialized") {
      return !toolInvocationHasMcpAppData(part);
    }
    return false;
  }
  getLastThinkingPart(renderedParts) {
    if (!renderedParts || renderedParts.length === 0) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatThinkingContentPart && part.getIsActive()) {
        return part;
      }
    }
    return void 0;
  }
  getLastThinkingPartForGroupedItem(context, templateData) {
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    const displayMode = getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService);
    if (lastThinking?.hasReasoningContent() && shouldStartNewCollapsedThinkingGroup(displayMode, "reasoning", "items")) {
      this.finalizeCurrentThinkingPart(context, templateData);
      return { part: void 0, separatedFromReasoning: true };
    }
    return { part: lastThinking, separatedFromReasoning: false };
  }
  /**
   * Determines if a thinking part at the given content index is "look-ahead complete".
   * A thinking part is look-ahead complete if there are subsequent parts that will NOT
   * be pinned to it, meaning we know this thinking part is already done even though
   * the overall response is still in progress.
   */
  isThinkingLookAheadComplete(context, element) {
    if (element?.isComplete) {
      return true;
    }
    for (let i = context.contentIndex + 1; i < context.content.length; i++) {
      const nextPart = context.content[i];
      if (!this.shouldPinPart(nextPart, element)) {
        return true;
      }
    }
    return false;
  }
  getSubagentPart(renderedParts, subAgentInvocationId) {
    if (!renderedParts || renderedParts.length === 0) {
      return void 0;
    }
    for (let i = renderedParts.length - 1; i >= 0; i--) {
      const part = renderedParts[i];
      if (part instanceof ChatSubagentContentPart) {
        if (subAgentInvocationId && part.subAgentInvocationId === subAgentInvocationId) {
          return part;
        }
        if (!subAgentInvocationId && part.getIsActive()) {
          return part;
        }
      }
    }
    return void 0;
  }
  finalizeAllSubagentParts(templateData, force = false) {
    if (!templateData.renderedParts) {
      return;
    }
    for (const part of templateData.renderedParts) {
      if (part instanceof ChatSubagentContentPart && part.getIsActive() && (force || !part.shouldRemainActive()) && (force || !part.hasToolsWaitingForConfirmation)) {
        part.markAsInactive(force);
      }
    }
  }
  handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex, batchedSubagentParts) {
    this.finalizeCurrentThinkingPart(context, templateData);
    const lastSubagent = this.getSubagentPart(templateData.renderedParts, subagentId);
    if (lastSubagent) {
      this.beginSubagentToolPresentationBatch(lastSubagent, batchedSubagentParts);
      this.maybeRouteSubagentToolToCarousel(toolInvocation, lastSubagent, context, templateData, codeBlockStartIndex);
      if (!isParentSubagentTool(toolInvocation)) {
        lastSubagent.appendToolInvocation(toolInvocation, codeBlockStartIndex);
        return this.renderNoContent((other) => (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolCallId === toolInvocation.toolCallId);
      }
      return lastSubagent;
    }
    const subagentPart = this.instantiationService.createInstance(
      ChatSubagentContentPart,
      subagentId,
      toolInvocation,
      context,
      this.chatContentMarkdownRenderer,
      this._contentReferencesListPool,
      this._toolEditorPool,
      () => this._currentLayoutWidth.get(),
      this._announcedToolProgressKeys
    );
    this.beginSubagentToolPresentationBatch(subagentPart, batchedSubagentParts);
    this.maybeRouteSubagentToolToCarousel(toolInvocation, subagentPart, context, templateData, codeBlockStartIndex);
    if (!isParentSubagentTool(toolInvocation)) {
      subagentPart.appendToolInvocation(toolInvocation, codeBlockStartIndex);
    }
    return subagentPart;
  }
  beginSubagentToolPresentationBatch(subagentPart, batchedSubagentParts) {
    if (batchedSubagentParts && !batchedSubagentParts.has(subagentPart)) {
      batchedSubagentParts.add(subagentPart);
      subagentPart.beginToolPresentationBatch();
    }
  }
  /** Routes subagent confirmations to the input carousel and leaves a placeholder inline. */
  maybeRouteSubagentToolToCarousel(toolInvocation, subagentPart, context, templateData, codeBlockStartIndex) {
    if (!this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel)) {
      return;
    }
    if (toolInvocation.kind !== "toolInvocation" || !isResponseVM(context.element)) {
      return;
    }
    if (isParentSubagentTool(toolInvocation) || toolInvocation.presentation === "hidden" || toolInvocation.source.type === "mcp") {
      return;
    }
    if (!!this.viewModel?.editing) {
      return;
    }
    const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
    if (!widget) {
      return;
    }
    const subAgentInvocationId = subagentPart.subAgentInvocationId;
    const agentName = subagentPart.getAgentLabel();
    const revealSubagent = (targetSubAgentId) => {
      const currentTemplateData = this.getTemplateDataForRequestId(context.element.id);
      const currentSubagentPart = this.getSubagentPart(currentTemplateData?.renderedParts, targetSubAgentId) ?? subagentPart;
      const chatResource = currentSubagentPart.getChatResource();
      if (this.environmentService.isSessionsWindow && chatResource) {
        void this.commandService.executeCommand(CHAT_OPEN_AGENT_HOST_CHAT_COMMAND_ID, { chatResource });
      } else {
        currentSubagentPart.domNode.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    };
    const revealSubagentLabel = this.environmentService.isSessionsWindow ? localize("openSubagentChat", "Open {0} Chat", agentName) : void 0;
    const navigateToCarousel = (targetSubAgentId) => {
      widget.inputPart.activateCarouselForSubagent(targetSubAgentId);
    };
    const factory = (tool) => this.instantiationService.createInstance(
      ChatToolInvocationPart,
      tool,
      context,
      this.chatContentMarkdownRenderer,
      this._contentReferencesListPool,
      this._toolEditorPool,
      () => this._currentLayoutWidth.get(),
      this._announcedToolProgressKeys,
      codeBlockStartIndex
    );
    const addToolToCarousel = (tool) => {
      widget.inputPart.addToolToConfirmationCarousel(tool, factory, subAgentInvocationId, agentName, revealSubagent, revealSubagentLabel);
      const listener = this.createUpdateWorkingProgressOnConfirmationEnd(tool, templateData);
      if (listener) {
        templateData.elementDisposables.add(listener);
      }
    };
    const shouldUseCarouselForTool = (tool, state) => this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) && !this.viewModel?.editing && tool.presentation !== "hidden" && tool.source.type !== "mcp" && state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title;
    subagentPart.enableCarouselMode(navigateToCarousel, addToolToCarousel, shouldUseCarouselForTool, widget.inputPart.onDidChangeActiveConfirmationSubagent);
    subagentPart.setConfirmationActive(widget.inputPart.activeConfirmationSubagentId === subAgentInvocationId);
    const toolState = toolInvocation.state.get();
    if (toolState.type === IChatToolInvocation.StateKind.WaitingForConfirmation && toolState.confirmationMessages?.title) {
      addToolToCarousel(toolInvocation);
    }
  }
  finalizeCurrentThinkingPart(context, templateData) {
    const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
    if (!lastThinking) {
      return;
    }
    const style = getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService);
    if (style === ThinkingDisplayMode.CollapsedPreview) {
      lastThinking.collapseContent();
    }
    lastThinking.finalizeTitleIfDefault();
    lastThinking.resetId();
    lastThinking.markAsInactive();
  }
  renderChatContentPart(content, templateData, context, batchedSubagentParts) {
    try {
      if (content.kind === "thinking" && (Array.isArray(content.value) ? content.value.length === 0 : content.value === "")) {
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        lastThinking?.resetId();
        return this.renderNoContent((other) => content.kind === other.kind);
      }
      const isResponseElement = isResponseVM(context.element);
      const shouldPin = this.shouldPinPart(content, isResponseElement ? context.element : void 0);
      if (context.element.isComplete && !shouldPin) {
        const elementTemplateData = this.getTemplateDataForRequestId(context.element.id);
        if (elementTemplateData?.renderedParts) {
          const lastThinking = this.getLastThinkingPart(elementTemplateData.renderedParts);
          if (lastThinking?.getIsActive()) {
            this.finalizeCurrentThinkingPart(context, elementTemplateData);
          }
        }
      }
      const isSubagentContent = (content.kind === "toolInvocation" || content.kind === "toolInvocationSerialized") && isSubagentToolInvocation(content);
      if (context.element.isComplete && !isSubagentContent) {
        const elementTemplateData = this.getTemplateDataForRequestId(context.element.id);
        if (elementTemplateData) {
          this.finalizeAllSubagentParts(elementTemplateData);
        }
      }
      if (content.kind === "treeData") {
        return this.renderTreeData(content, templateData, context);
      } else if (content.kind === "multiDiffData") {
        return this.renderMultiDiffData(content, templateData, context);
      } else if (content.kind === "progressMessage") {
        return this.instantiationService.createInstance(ChatProgressContentPart, content, this.chatContentMarkdownRenderer, context, void 0, void 0, void 0, void 0, content.shimmer);
      } else if (content.kind === "systemNotification") {
        return this.instantiationService.createInstance(ChatSystemNotificationContentPart, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "working") {
        return this.instantiationService.createInstance(ChatWorkingProgressContentPart, content, this.chatContentMarkdownRenderer, context);
      } else if (content.kind === "progressTask" || content.kind === "progressTaskSerialized") {
        return this.renderProgressTask(content, templateData, context);
      } else if (content.kind === "command") {
        return this.instantiationService.createInstance(ChatCommandButtonContentPart, content, context);
      } else if (content.kind === "textEditGroup") {
        return this.renderTextEdit(context, content, templateData);
      } else if (content.kind === "confirmation") {
        return this.renderConfirmation(context, content, templateData);
      } else if (content.kind === "warning") {
        return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Warning, content.content, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "info") {
        return this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Info, content.content, content, this.chatContentMarkdownRenderer);
      } else if (content.kind === "hook") {
        return this.renderHookPart(content, context, templateData, batchedSubagentParts);
      } else if (content.kind === "markdownContent") {
        return this.renderMarkdown(content, templateData, context);
      } else if (content.kind === "references") {
        if (isResponseVM(context.element) && context.element.agent?.isDefault && !context.element.agent.modes.includes(ChatModeKind.Ask)) {
          return this.renderNoContent((other) => other.kind === content.kind);
        }
        return this.renderContentReferencesListData(content, void 0, context, templateData);
      } else if (content.kind === "codeCitations") {
        return this.renderCodeCitations(content, context, templateData);
      } else if (content.kind === "toolInvocation" || content.kind === "toolInvocationSerialized") {
        return this.renderToolInvocation(content, context, templateData, batchedSubagentParts);
      } else if (content.kind === "extensions") {
        return this.renderExtensionsContent(content, context, templateData);
      } else if (content.kind === "pullRequest") {
        return this.renderPullRequestContent(content, context, templateData);
      } else if (content.kind === "undoStop") {
        return this.renderUndoStop(content);
      } else if (content.kind === "errorDetails") {
        return this.renderChatErrorDetails(context, content, templateData);
      } else if (content.kind === "elicitation2" || content.kind === "elicitationSerialized") {
        return this.renderElicitation(context, content, templateData);
      } else if (content.kind === "questionCarousel") {
        return this.renderQuestionCarousel(context, content, templateData);
      } else if (content.kind === "planReview") {
        return this.renderPlanReview(context, content, templateData);
      } else if (content.kind === "changesSummary") {
        return this.renderChangesSummary(content, context, templateData);
      } else if (content.kind === "turnPills") {
        return this.renderTurnPills(content, context);
      } else if (content.kind === "mcpServersStarting") {
        return this.renderMcpServersInteractionRequired(content, context, templateData);
      } else if (content.kind === "mcpAuthenticationRequired") {
        return this.instantiationService.createInstance(ChatMcpAuthenticationContentPart, content);
      } else if (content.kind === "mcpServersStartingSlow") {
        return this.instantiationService.createInstance(ChatMcpServersStartingContentPart, content, {
          onDidFinishStarting: () => this.showWorkingProgressAfterMcp(context, templateData)
        });
      } else if (content.kind === "disabledClaudeHooks") {
        return this.renderDisabledClaudeHooks(content, context);
      } else if (content.kind === "thinking") {
        return this.renderThinkingPart(content, context, templateData);
      } else if (content.kind === "workspaceEdit") {
        return this.instantiationService.createInstance(ChatWorkspaceEditContentPart, content, context, this.chatContentMarkdownRenderer);
      } else if (content.kind === "externalEdit") {
        return this.renderExternalEdit(content, context, templateData);
      } else if (content.kind === "autoModeResolution") {
        return this.instantiationService.createInstance(ChatAutoModeResolutionContentPart, content, context, this.chatContentMarkdownRenderer);
      }
      return this.renderNoContent((other) => content.kind === other.kind);
    } catch (err) {
      alert(`Chat error: ${toErrorMessage(err, false)}`);
      this.logService.error("ChatListItemRenderer#renderChatContentPart: error rendering content", toErrorMessage(err, true));
      const errorPart = this.instantiationService.createInstance(ChatErrorContentPart, ChatErrorLevel.Error, new MarkdownString(localize("renderFailMsg", "Failed to render content") + `: ${toErrorMessage(err, false)}`), content, this.chatContentMarkdownRenderer);
      return {
        dispose: () => errorPart.dispose(),
        domNode: errorPart.domNode,
        hasSameContent: ((other) => content.kind === other.kind)
      };
    }
  }
  showWorkingProgressAfterMcp(context, templateData) {
    const originalElement = context.element;
    const originalRenderedParts = templateData.renderedParts;
    queueMicrotask(() => {
      if (!isResponseVM(originalElement) || templateData.currentElement !== originalElement || originalElement.isComplete || originalElement.isCanceled) {
        return;
      }
      if (!originalRenderedParts || templateData.renderedParts !== originalRenderedParts || originalRenderedParts.some((part) => part instanceof ChatWorkingProgressContentPart)) {
        return;
      }
      this.renderChatResponseBasic(originalElement, context.elementIndex, templateData);
      this.fireItemHeightChange(templateData);
    });
  }
  dispose() {
    this._announcedToolProgressKeys.clear();
    super.dispose();
  }
  renderChatErrorDetails(context, content, templateData) {
    if (!isResponseVM(context.element)) {
      return this.renderNoContent((other) => content.kind === other.kind);
    }
    const isLast = content.isLast;
    if (content.errorDetails.isQuotaExceeded) {
      const renderedError = this.instantiationService.createInstance(ChatQuotaExceededPart, context.element, content, this.chatContentMarkdownRenderer);
      return renderedError;
    } else if (content.errorDetails.isRateLimited && this.chatEntitlementService.anonymous) {
      const renderedError = this.instantiationService.createInstance(ChatAnonymousRateLimitedPart, content);
      return renderedError;
    } else if (content.errorDetails.confirmationButtons && isLast) {
      const level = content.errorDetails.level ?? ChatErrorLevel.Error;
      const errorConfirmation = this.instantiationService.createInstance(ChatErrorConfirmationContentPart, level, new MarkdownString(content.errorDetails.message), content, content.errorDetails.confirmationButtons, this.chatContentMarkdownRenderer, context);
      return errorConfirmation;
    } else {
      const level = content.errorDetails.level ?? ChatErrorLevel.Error;
      return this.instantiationService.createInstance(ChatErrorContentPart, level, new MarkdownString(content.errorDetails.message), content, this.chatContentMarkdownRenderer);
    }
  }
  renderUndoStop(content) {
    return this.renderNoContent((other) => other.kind === content.kind && other.id === content.id);
  }
  renderNoContent(equals) {
    return {
      dispose: () => {
      },
      domNode: void 0,
      hasSameContent: equals
    };
  }
  renderTreeData(content, templateData, context) {
    const data = content.treeData;
    const treePart = this.instantiationService.createInstance(ChatTreeContentPart, data, this._treePool);
    if (isResponseVM(context.element)) {
      const fileTreeFocusInfo = {
        treeDataId: data.uri.toString(),
        treeIndex: context.treeStartIndex,
        focus() {
          treePart.domFocus();
        }
      };
      treePart.addDisposable(treePart.onDidFocus(() => {
        this.focusedFileTreesByResponseId.set(context.element.id, fileTreeFocusInfo.treeIndex);
      }));
      const fileTrees = this.fileTreesByResponseId.get(context.element.id) ?? [];
      fileTrees.push(fileTreeFocusInfo);
      this.fileTreesByResponseId.set(context.element.id, distinct(fileTrees, (v) => v.treeDataId));
      treePart.addDisposable(toDisposable(() => this.fileTreesByResponseId.set(context.element.id, fileTrees.filter((v) => v.treeDataId !== data.uri.toString()))));
    }
    return treePart;
  }
  renderMultiDiffData(content, templateData, context) {
    const multiDiffPart = this.instantiationService.createInstance(ChatMultiDiffContentPart, content, context.element);
    return multiDiffPart;
  }
  renderContentReferencesListData(references, labelOverride, context, templateData) {
    const referencesPart = this.instantiationService.createInstance(ChatUsedReferencesListContentPart, references.references, labelOverride, context, this._contentReferencesListPool, { expandedWhenEmptyResponse: checkModeOption(this.delegate.currentChatMode(), this.rendererOptions.referencesExpandedWhenEmptyResponse) });
    return referencesPart;
  }
  renderCodeCitations(citations, context, templateData) {
    const citationsPart = this.instantiationService.createInstance(ChatCodeCitationContentPart, citations, context);
    return citationsPart;
  }
  handleRenderedCodeblocks(element, part, codeBlockStartIndex) {
    if (!part.addDisposable || part.codeblocksPartId === void 0) {
      return;
    }
    const codeBlocksByResponseId = this.codeBlocksByResponseId.get(element.id) ?? [];
    this.codeBlocksByResponseId.set(element.id, codeBlocksByResponseId);
    part.addDisposable(toDisposable(() => {
      const codeBlocksByResponseId2 = this.codeBlocksByResponseId.get(element.id);
      if (codeBlocksByResponseId2) {
        part.codeblocks?.forEach((info, i) => {
          const codeblock = codeBlocksByResponseId2[codeBlockStartIndex + i];
          if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
            delete codeBlocksByResponseId2[codeBlockStartIndex + i];
          }
        });
      }
    }));
    part.codeblocks?.forEach((info, i) => {
      codeBlocksByResponseId[codeBlockStartIndex + i] = info;
      const uri = info.uri;
      if (uri) {
        this.codeBlocksByEditorUri.set(uri, info);
        part.addDisposable(toDisposable(() => {
          const codeblock = this.codeBlocksByEditorUri.get(uri);
          if (codeblock?.ownerMarkdownPartId === part.codeblocksPartId) {
            this.codeBlocksByEditorUri.delete(uri);
          }
        }));
      }
    });
  }
  renderToolInvocation(toolInvocation, context, templateData, batchedSubagentParts) {
    if (IChatToolInvocation.isComplete(toolInvocation) && IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
      const msg = toolInvocation.pastTenseMessage ?? toolInvocation.invocationMessage;
      const text = typeof msg === "string" ? msg : msg?.value;
      if (!text || text.trim().length === 0) {
        return this.renderNoContent((other) => (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolCallId === toolInvocation.toolCallId);
      }
    }
    if (context.element.isComplete && toolInvocation.toolSpecificData?.kind === "generatedImage" && !isGeneratedImageResultOwner(toolInvocation, context.content)) {
      return this.renderNoContent((other) => (other.kind === "toolInvocation" || other.kind === "toolInvocationSerialized") && other.toolCallId === toolInvocation.toolCallId);
    }
    if (this.configService.getValue("chat.agent.thinking.collapsedTools") === CollapsedToolsDisplayMode.Off) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    const codeBlockStartIndex = context.codeBlockStartIndex;
    let lazilyCreatedPart = void 0;
    const createToolPart = () => {
      lazilyCreatedPart = this.instantiationService.createInstance(ChatToolInvocationPart, toolInvocation, context, this.chatContentMarkdownRenderer, this._contentReferencesListPool, this._toolEditorPool, () => this._currentLayoutWidth.get(), this._announcedToolProgressKeys, codeBlockStartIndex);
      lazilyCreatedPart.addDisposable(lazilyCreatedPart.onDidChangeHeight(() => this.fireItemHeightChange(templateData)));
      this.handleRenderedCodeblocks(context.element, lazilyCreatedPart, codeBlockStartIndex);
      return { domNode: lazilyCreatedPart.domNode, disposable: lazilyCreatedPart, part: lazilyCreatedPart };
    };
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
      const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation) && this.shouldPinPart(toolInvocation, context.element) && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
        const thinkingPart = this.renderThinkingPart({
          kind: "thinking"
        }, context, templateData);
        if (thinkingPart instanceof ChatThinkingContentPart) {
          toolInvocation.isAttachedToThinking = true;
          thinkingPart.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
          this.setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, () => lazilyCreatedPart, createToolPart, context, templateData);
        }
        return thinkingPart;
      }
      if (this.shouldPinPart(toolInvocation, context.element)) {
        if (lastThinking && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
          toolInvocation.isAttachedToThinking = true;
          lastThinking.appendItem(createToolPart, toolInvocation.toolId, toolInvocation, templateData.value);
          this.setupConfirmationTransitionWatcher(toolInvocation, lastThinking, () => lazilyCreatedPart, createToolPart, context, templateData);
          return this.renderNoContent((other, followingContent, element) => lazilyCreatedPart ? lazilyCreatedPart.hasSameContent(other, followingContent, element) : toolInvocation.kind === other.kind);
        }
      } else {
        this.finalizeCurrentThinkingPart(context, templateData);
      }
    }
    const subagentId = getSubagentId(toolInvocation);
    if (subagentId && isResponseVM(context.element) && !IChatToolInvocation.isEffectivelyHidden(toolInvocation)) {
      return this.handleSubagentToolGrouping(toolInvocation, subagentId, context, templateData, codeBlockStartIndex, batchedSubagentParts);
    }
    const { part } = createToolPart();
    if (this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) && toolInvocation.kind === "toolInvocation" && isResponseVM(context.element) && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing) {
      const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
      if (widget) {
        const factory = (tool) => this.instantiationService.createInstance(
          ChatToolInvocationPart,
          tool,
          context,
          this.chatContentMarkdownRenderer,
          this._contentReferencesListPool,
          this._toolEditorPool,
          () => this._currentLayoutWidth.get(),
          this._announcedToolProgressKeys,
          codeBlockStartIndex
        );
        const routePartToCarousel = () => {
          widget.inputPart.addToolToConfirmationCarousel(toolInvocation, factory);
          dom.hide(part.domNode);
          return true;
        };
        let hasScheduledCarouselRoute = false;
        const scheduleRoutePartToCarousel = () => {
          if (hasScheduledCarouselRoute) {
            return;
          }
          hasScheduledCarouselRoute = true;
          part.addDisposable(dom.scheduleAtNextAnimationFrame(dom.getWindow(part.domNode), () => {
            hasScheduledCarouselRoute = false;
            const state = toolInvocation.state.get();
            if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && state.confirmationMessages?.title && toolInvocation.presentation !== "hidden" && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing) {
              routePartToCarousel();
            }
          }));
        };
        part.addDisposable(autorun((reader) => {
          const state = toolInvocation.state.read(reader);
          const isCarouselConfirmation = state.type === IChatToolInvocation.StateKind.WaitingForConfirmation && !!state.confirmationMessages?.title && toolInvocation.presentation !== "hidden" && toolInvocation.source.type !== "mcp" && !this.viewModel?.editing;
          if (isCarouselConfirmation) {
            if (!routePartToCarousel()) {
              dom.hide(part.domNode);
              scheduleRoutePartToCarousel();
            }
          } else if (IChatToolInvocation.isEffectivelyHidden(toolInvocation, reader)) {
            this.updateWorkingProgressForPendingConfirmations(templateData);
            dom.hide(part.domNode);
          } else {
            this.updateWorkingProgressForPendingConfirmations(templateData);
            dom.show(part.domNode);
          }
        }));
      }
    }
    return part;
  }
  // watch for confirmation part transition when tool invocation is streaming
  setupConfirmationTransitionWatcher(toolInvocation, thinkingPart, getCreatedPart, createToolPart, context, templateData) {
    if (toolInvocation.kind !== "toolInvocation") {
      return;
    }
    const moveConfirmationWidgetOutOfThinking = () => {
      const createdPart = getCreatedPart();
      toolInvocation.isAttachedToThinking = false;
      let part;
      if (createdPart?.domNode) {
        part = createdPart;
        const wrapper = createdPart.domNode.parentElement;
        if (wrapper?.classList.contains("chat-thinking-tool-wrapper")) {
          wrapper.remove();
        }
        templateData.value.appendChild(createdPart.domNode);
        thinkingPart.removeMaterializedItem(toolInvocation.toolCallId);
        (templateData.movedOutToolParts ??= new DisposableMap()).set(toolInvocation.toolCallId, createdPart);
      } else {
        thinkingPart.removeLazyItem(toolInvocation.toolId);
        const { domNode, part: createdPart2 } = createToolPart();
        part = createdPart2;
        (templateData.movedOutToolParts ??= new DisposableMap()).set(toolInvocation.toolCallId, createdPart2);
        templateData.value.appendChild(domNode);
      }
      this.finalizeCurrentThinkingPart(context, templateData);
      if (thinkingPart.isEffectivelyEmpty()) {
        thinkingPart.domNode?.remove();
        thinkingPart.dispose();
      }
      return part;
    };
    const isWorkingState = (type) => type === IChatToolInvocation.StateKind.Streaming || type === IChatToolInvocation.StateKind.Executing;
    const tryRouteConfirmationToCarousel = () => {
      if (!this.configService.getValue(ChatConfiguration.ToolConfirmationCarousel) || !isResponseVM(context.element) || this.viewModel?.editing || toolInvocation.presentation === "hidden" || toolInvocation.source.type === "mcp") {
        return false;
      }
      const state = toolInvocation.state.get();
      if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !state.confirmationMessages?.title) {
        return false;
      }
      const widget = this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource);
      if (!widget) {
        return false;
      }
      const part = moveConfirmationWidgetOutOfThinking();
      const factory = (tool) => this.instantiationService.createInstance(
        ChatToolInvocationPart,
        tool,
        context,
        this.chatContentMarkdownRenderer,
        this._contentReferencesListPool,
        this._toolEditorPool,
        () => this._currentLayoutWidth.get(),
        this._announcedToolProgressKeys,
        context.codeBlockStartIndex
      );
      part.addDisposable(autorun((reader) => {
        const currentState2 = toolInvocation.state.read(reader);
        if (currentState2.type === IChatToolInvocation.StateKind.WaitingForConfirmation && currentState2.confirmationMessages?.title) {
          widget.inputPart.addToolToConfirmationCarousel(toolInvocation, factory);
          dom.hide(part.domNode);
        } else if (IChatToolInvocation.isEffectivelyHidden(toolInvocation, reader)) {
          this.updateWorkingProgressForPendingConfirmations(templateData);
          dom.hide(part.domNode);
        } else {
          this.updateWorkingProgressForPendingConfirmations(templateData);
          dom.show(part.domNode);
        }
      }));
      return true;
    };
    const currentState = toolInvocation.state.get();
    if (toolInvocationHasMcpAppData(toolInvocation)) {
      moveConfirmationWidgetOutOfThinking();
      return;
    }
    if (currentState.type === IChatToolInvocation.StateKind.WaitingForConfirmation) {
      if (!tryRouteConfirmationToCarousel()) {
        moveConfirmationWidgetOutOfThinking();
      }
      return;
    }
    if (currentState.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
      moveConfirmationWidgetOutOfThinking();
      return;
    }
    if (!isWorkingState(currentState.type)) {
      return;
    }
    let didMoveToolOut = false;
    const disposable = autorun((reader) => {
      const state = toolInvocation.state.read(reader);
      toolInvocation.toolSpecificDataKind.read(reader);
      if (toolInvocationHasMcpAppData(toolInvocation)) {
        if (didMoveToolOut) {
          return;
        }
        didMoveToolOut = true;
        disposable.dispose();
        moveConfirmationWidgetOutOfThinking();
        return;
      }
      if (state.type === IChatToolInvocation.StateKind.WaitingForConfirmation || state.type === IChatToolInvocation.StateKind.WaitingForPostApproval) {
        if (didMoveToolOut) {
          return;
        }
        didMoveToolOut = true;
        disposable.dispose();
        if (state.type !== IChatToolInvocation.StateKind.WaitingForConfirmation || !tryRouteConfirmationToCarousel()) {
          moveConfirmationWidgetOutOfThinking();
        }
      }
    });
    thinkingPart.addDisposable(disposable);
  }
  renderExtensionsContent(extensionsContent, context, templateData) {
    const part = this.instantiationService.createInstance(ChatExtensionsContentPart, extensionsContent);
    return part;
  }
  renderHookPart(hookPart, context, templateData, batchedSubagentParts) {
    if (!(hookPart.stopReason || hookPart.systemMessage)) {
      return this.renderNoContent((other) => other.kind === "hook" && other.hookType === hookPart.hookType);
    }
    if (hookPart.subAgentInvocationId) {
      const subagentPart = this.getSubagentPart(templateData.renderedParts, hookPart.subAgentInvocationId);
      if (subagentPart) {
        this.beginSubagentToolPresentationBatch(subagentPart, batchedSubagentParts);
        subagentPart.appendHookItem(() => {
          const part2 = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
          return { domNode: part2.domNode, disposable: part2 };
        }, hookPart);
        return this.renderNoContent((other) => other.kind === "hook" && other.hookType === hookPart.hookType && other.subAgentInvocationId === hookPart.subAgentInvocationId);
      }
    }
    const shouldPinToThinking = hookPart.hookType === HookType.PreToolUse || hookPart.hookType === HookType.PostToolUse;
    if (shouldPinToThinking) {
      const hookTitle = hookPart.stopReason ? hookPart.toolDisplayName ? localize("hook.thinking.blocked", "Blocked {0}", hookPart.toolDisplayName) : localize("hook.thinking.blockedGeneric", "Blocked by hook") : hookPart.toolDisplayName ? localize("hook.thinking.warning", "Used {0}, but received a warning", hookPart.toolDisplayName) : localize("hook.thinking.warningGeneric", "Tool call received a warning");
      let { part: thinkingPart } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!thinkingPart) {
        const newThinking = this.renderThinkingPart({ kind: "thinking" }, context, templateData);
        if (newThinking instanceof ChatThinkingContentPart) {
          thinkingPart = newThinking;
        }
      }
      if (thinkingPart) {
        thinkingPart.appendItem(() => {
          const part2 = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
          return { domNode: part2.domNode, disposable: part2 };
        }, hookTitle, void 0, templateData.value);
        return thinkingPart;
      }
    }
    const part = this.instantiationService.createInstance(ChatHookContentPart, hookPart, context);
    return part;
  }
  renderPullRequestContent(pullRequestContent, context, templateData) {
    const part = this.instantiationService.createInstance(ChatPullRequestContentPart, pullRequestContent);
    return part;
  }
  renderProgressTask(task, templateData, context) {
    if (!isResponseVM(context.element)) {
      return;
    }
    this.finalizeCurrentThinkingPart(context, templateData);
    const taskPart = this.instantiationService.createInstance(ChatTaskContentPart, task, this._contentReferencesListPool, this.chatContentMarkdownRenderer, context);
    return taskPart;
  }
  renderConfirmation(context, confirmation, templateData) {
    const part = this.instantiationService.createInstance(ChatConfirmationContentPart, confirmation, context);
    return part;
  }
  renderElicitation(context, elicitation, templateData) {
    if (elicitation.kind === "elicitationSerialized" ? elicitation.isHidden : elicitation.isHidden?.get()) {
      return this.renderNoContent((other) => elicitation.kind === other.kind);
    }
    this.finalizeCurrentThinkingPart(context, templateData);
    const part = this.instantiationService.createInstance(ChatElicitationContentPart, elicitation, context);
    return part;
  }
  renderQuestionCarousel(context, carousel, templateData) {
    this.finalizeCurrentThinkingPart(context, templateData);
    this._notifyOnQuestionCarousel(context, carousel);
    if (!carousel.terminalId && isResponseVM(context.element)) {
      const responseElement = context.element;
      const model = this.chatService.getSession(responseElement.sessionResource);
      const request = model?.getRequests().find((r) => r.id === responseElement.requestId);
      if (request?.terminalExecutionId) {
        carousel.terminalId = request.terminalExecutionId;
        this.logService.trace(`ChatListItemRenderer#renderQuestionCarousel: backfilled terminalId=${carousel.terminalId} for request=${responseElement.requestId}`);
      } else {
        this.logService.trace(`ChatListItemRenderer#renderQuestionCarousel: no terminalExecutionId to backfill for request=${responseElement.requestId}`);
      }
    }
    const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : void 0;
    const shouldAutoFocus = !!widget && dom.isAncestorOfActiveElement(widget.domNode) && widget.getInput() === "";
    const responseId = isResponseVM(context.element) ? context.element.requestId : void 0;
    const carouselKey = carousel.resolveId ?? `${responseId ?? ""}_${context.contentIndex}`;
    const handleSubmit = async (answers, part2) => {
      if (carousel.isUsed) {
        return;
      }
      const answersRecord = answers ? Object.fromEntries(answers) : void 0;
      carousel.data = answersRecord ?? {};
      carousel.isUsed = true;
      if (carousel instanceof ChatQuestionCarouselData) {
        carousel.draftAnswers = void 0;
        carousel.draftCurrentIndex = void 0;
        carousel.completion.complete({ answers: answersRecord });
      }
      if (isResponseVM(context.element) && carousel.resolveId) {
        this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, answersRecord);
      }
      this.removeCarouselFromTracking(context, part2);
      widget?.input.clearQuestionCarousel(void 0, carouselKey);
    };
    const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
    const inputPartHasCarousel = widget?.input.questionCarousel !== void 0;
    if (carousel.isUsed || responseIsComplete) {
      if (responseIsComplete && !carousel.isUsed && isResponseVM(context.element) && carousel.resolveId) {
        carousel.data = {};
        carousel.isUsed = true;
        if (carousel instanceof ChatQuestionCarouselData) {
          carousel.draftAnswers = void 0;
          carousel.draftCurrentIndex = void 0;
          carousel.completion.complete({ answers: void 0 });
        }
        this.chatService.notifyQuestionCarouselAnswer(context.element.requestId, carousel.resolveId, void 0);
        this.pendingQuestionCarousels.get(context.element.sessionResource)?.clear();
      }
      if (inputPartHasCarousel) {
        if (carousel.isUsed) {
          widget?.input.clearQuestionCarousel(void 0, carouselKey);
        } else if (responseIsComplete && responseId) {
          widget?.input.clearQuestionCarousel(responseId);
        }
      }
      const part2 = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
        shouldAutoFocus: false,
        fitContent: this.rendererOptions.questionCarouselFitContent,
        onSubmit: async (answers) => handleSubmit(answers, part2)
      });
      return part2;
    }
    const isEditing = !!this.viewModel?.editing;
    const part = isEditing ? void 0 : widget?.input.renderQuestionCarousel(carousel, context, {
      shouldAutoFocus,
      fitContent: this.rendererOptions.questionCarouselFitContent,
      onSubmit: async (answers) => handleSubmit(answers, part)
    });
    if (!part) {
      const fallbackPart = this.instantiationService.createInstance(ChatQuestionCarouselPart, carousel, context, {
        shouldAutoFocus,
        fitContent: this.rendererOptions.questionCarouselFitContent,
        onSubmit: async (answers) => handleSubmit(answers, fallbackPart)
      });
      return fallbackPart;
    }
    if (isResponseVM(context.element) && carousel.allowSkip && !carousel.isUsed) {
      let carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
      if (!carousels) {
        carousels = /* @__PURE__ */ new Set();
        this.pendingQuestionCarousels.set(context.element.sessionResource, carousels);
      }
      if (!carousels.has(part)) {
        carousels.add(part);
        part.addDisposable({ dispose: () => this.removeCarouselFromTracking(context, part) });
      }
    }
    return this.renderNoContent((other, _followingContent, element) => {
      if (carousel.isUsed || isResponseVM(element) && element.isComplete) {
        return false;
      }
      if (other.kind === "questionCarousel") {
        const otherCarousel = other;
        if (carousel.resolveId && otherCarousel.resolveId) {
          return carousel.resolveId === otherCarousel.resolveId;
        }
        return other === carousel;
      }
      return false;
    });
  }
  _getCarouselStableKey(context, carousel) {
    const requestId = isResponseVM(context.element) ? context.element.requestId : void 0;
    if (!requestId || !carousel.resolveId) {
      return void 0;
    }
    return `${requestId}::${carousel.resolveId}`;
  }
  _notifyOnQuestionCarousel(context, carousel) {
    if (carousel.isUsed) {
      return;
    }
    const stableKey = this._getCarouselStableKey(context, carousel);
    if (stableKey ? this._notifiedQuestionCarousels.has(stableKey) : false) {
      return;
    }
    const questionCount = carousel.questions.length;
    const question = carousel.questions.length > 0 && carousel.questions[0].message ? carousel.questions[0].message : localize("chat.questionCarouselNeedsInputSR", "Chat input required.");
    const stringQuestion = typeof question === "string" ? question : question.value;
    const alertMessage = questionCount === 1 ? localize("chat.questionCarouselAlertOne", "Chat input required (1 question): {0}", stringQuestion) : localize("chat.questionCarouselAlertMany", "Chat input required ({0} questions): {1}", questionCount, stringQuestion);
    this.accessibilityService.alert(alertMessage);
    if (stableKey) {
      this._notifiedQuestionCarousels.add(stableKey);
    }
    const signalMessage = questionCount === 1 ? localize("chat.questionCarouselSignalOne", "Chat needs your input (1 question).") : localize("chat.questionCarouselSignalMany", "Chat needs your input ({0} questions).", questionCount);
    this.accessibilitySignalService.playSignal(AccessibilitySignal.chatUserActionRequired, { allowManyInParallel: true, customAlertMessage: signalMessage });
  }
  renderPlanReview(context, review, templateData) {
    const widget = isResponseVM(context.element) ? this.chatWidgetService.getWidgetBySessionResource(context.element.sessionResource) : void 0;
    const responseId = isResponseVM(context.element) ? context.element.requestId : void 0;
    const reviewKey = review.resolveId ?? `${responseId ?? ""}_${context.contentIndex}`;
    this.finalizeCurrentThinkingPart(context, templateData);
    const handleSubmit = (result) => {
      review.data = result;
      review.isUsed = true;
      if (review instanceof ChatPlanReviewData) {
        review.completion.complete(result);
      }
      widget?.input.clearPlanReview(void 0, reviewKey);
    };
    const responseIsComplete = isResponseVM(context.element) && context.element.isComplete;
    if (responseIsComplete && !review.isUsed) {
      review.isUsed = true;
      if (review instanceof ChatPlanReviewData) {
        review.completion.complete(void 0);
      }
    }
    if (responseIsComplete && responseId) {
      widget?.input.clearPlanReview(responseId);
    }
    const renderProgress = () => {
      const message = this.getPlanReviewProgressMessage(review);
      if (!message) {
        return this.renderNoContent((other) => other.kind === "planReview");
      }
      const renderedAsUsed = !!review.isUsed;
      const isPending = !renderedAsUsed;
      const content = buildPlanReviewProgressContent(review, message);
      const progressPart = this.instantiationService.createInstance(
        ChatProgressContentPart,
        { content },
        this.chatContentMarkdownRenderer,
        context,
        /* forceShowSpinner */
        isPending,
        /* forceShowMessage */
        true,
        /* icon */
        isPending ? void 0 : Codicon.check,
        void 0,
        /* shimmer */
        isPending
      );
      return {
        domNode: progressPart.domNode,
        dispose: () => progressPart.dispose(),
        hasSameContent: (other, _followingContent, _element) => {
          if (other.kind !== "planReview") {
            return false;
          }
          if (!!review.isUsed !== renderedAsUsed) {
            return false;
          }
          if (review.resolveId && other.resolveId) {
            return review.resolveId === other.resolveId;
          }
          return other === review;
        }
      };
    };
    if (review.isUsed) {
      return renderProgress();
    }
    const isEditing = !!this.viewModel?.editing;
    const dockedPart = isEditing ? void 0 : widget?.input.renderPlanReview(review, context, {
      onSubmit: handleSubmit
    });
    if (!dockedPart) {
      const fallbackPart = this.instantiationService.createInstance(ChatPlanReviewPart, review, context, {
        onSubmit: handleSubmit
      });
      return fallbackPart;
    }
    return renderProgress();
  }
  getPlanReviewProgressMessage(review) {
    if (!review.isUsed) {
      return localize("chat.planReview.required", "Plan review required");
    }
    const result = review.data;
    if (!result) {
      return void 0;
    }
    if (result.rejected) {
      return localize("chat.planReview.rejected", "Rejected plan");
    }
    if (result.feedback) {
      return localize("chat.planReview.feedback", "Provided feedback");
    }
    const action = review.actions.find((a) => a.label === result.action);
    if (action?.permissionLevel === "autopilot") {
      return localize("chat.planReview.autopilot", "Started implementation with Autopilot");
    }
    return localize("chat.planReview.approved", "Approved plan");
  }
  removeCarouselFromTracking(context, part) {
    if (isResponseVM(context.element)) {
      const carousels = this.pendingQuestionCarousels.get(context.element.sessionResource);
      if (carousels) {
        carousels.delete(part);
      }
    }
  }
  renderChangesSummary(content, context, templateData) {
    const part = this.instantiationService.createInstance(ChatCheckpointFileChangesSummaryContentPart, content, context);
    return part;
  }
  renderTurnPills(content, context) {
    return this.instantiationService.createInstance(ChatTurnPillsContentPart, content, context);
  }
  renderAttachments(variables, contentReferences, modelId, templateData, resolvedModelId) {
    return this.instantiationService.createInstance(ChatAttachmentsContentPart, {
      variables,
      contentReferences,
      modelId,
      resolvedModelId,
      domNode: void 0
    });
  }
  renderTextEdit(context, chatTextEdit, templateData) {
    const textEditPart = this.instantiationService.createInstance(ChatTextEditContentPart, chatTextEdit, context, this.rendererOptions, this._diffEditorPool, this._currentLayoutWidth.get());
    return textEditPart;
  }
  renderExternalEdit(content, context, templateData) {
    const editPart = this.instantiationService.createInstance(ChatExternalEditContentPart, content, context);
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off && this.shouldPinPart(content, context.element)) {
      const partId = `externalEdit-${content.uri.toString()}-${content.undoStopId ?? ""}`;
      const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
      if (!lastThinking && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
        const thinkingPart = this.renderThinkingPart({ kind: "thinking" }, context, templateData);
        if (thinkingPart instanceof ChatThinkingContentPart) {
          thinkingPart.appendItem(
            () => ({ domNode: editPart.domNode, disposable: editPart }),
            partId,
            content,
            templateData.value,
            editPart.onDidChangeDiff,
            editPart
          );
        }
        return thinkingPart;
      }
      if (lastThinking) {
        lastThinking.appendItem(
          () => ({ domNode: editPart.domNode, disposable: editPart }),
          partId,
          content,
          templateData.value,
          editPart.onDidChangeDiff,
          editPart
        );
        return this.renderNoContent((other) => other.kind === content.kind);
      }
    }
    return editPart;
  }
  renderMarkdown(markdown, templateData, context) {
    const element = context.element;
    const isBlankMarkdown = !markdown.content.value.trim();
    const hasPendingEditCodeblock = isResponseVM(element) && !element.isComplete && hasCodeblockUriTag(markdown.content.value) && !codeblockHasClosingBackticks(markdown.content.value);
    if (!this.hasEditCodeblockUri(markdown) && !isBlankMarkdown && !hasPendingEditCodeblock) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    const fillInIncompleteTokens = isResponseVM(element) && (!element.isComplete || element.isCanceled || element.errorDetails?.responseIsFiltered || element.errorDetails?.responseIsIncomplete || !!element.renderData);
    const codeBlockStartIndex = context.codeBlockStartIndex;
    const markdownPart = templateData.instantiationService.createInstance(ChatMarkdownContentPart, markdown, context, this._editorPool, fillInIncompleteTokens, codeBlockStartIndex, this.chatContentMarkdownRenderer, void 0, this._currentLayoutWidth.get(), { codeBlockRenderOptions: this.rendererOptions.codeBlockRenderOptions });
    markdownPart.addDisposable(markdownPart.onDidChangeHeight(() => this.fireItemHeightChange(templateData)));
    if (isRequestVM(element)) {
      markdownPart.domNode.tabIndex = 0;
      if (this.configService.getValue("chat.editRequests") === "inline" && this.rendererOptions.editable) {
        markdownPart.domNode.classList.add("clickable");
        markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.CLICK, (e) => {
          if (this.viewModel?.editing?.id === element.id) {
            return;
          }
          const clickedElement = e.target;
          if (clickedElement.tagName === "A") {
            return;
          }
          const selection = dom.getWindow(templateData.rowContainer).getSelection();
          if (selection && !selection.isCollapsed && selection.toString().length > 0) {
            return;
          }
          const monacoEditor = dom.findParentWithClass(clickedElement, "monaco-editor");
          if (monacoEditor) {
            const editorPart = Array.from(this.editorsInUse()).find((editor) => editor.element.contains(monacoEditor));
            if (editorPart?.editor.getSelection()?.isEmpty() === false) {
              return;
            }
          }
          e.preventDefault();
          e.stopPropagation();
          this._onDidClickRequest.fire(templateData);
        }));
        markdownPart.addDisposable(this.hoverService.setupManagedHover(getDefaultHoverDelegate("element"), markdownPart.domNode, localize("requestMarkdownPartTitle", "Click to Edit"), { trapFocus: true }));
      }
      markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.FOCUS, () => {
        this.hoverVisible(templateData.requestHover);
      }));
      markdownPart.addDisposable(dom.addDisposableListener(markdownPart.domNode, dom.EventType.BLUR, () => {
        this.hoverHidden(templateData.requestHover);
      }));
    }
    this.handleRenderedCodeblocks(element, markdownPart, codeBlockStartIndex);
    const collapsedToolsMode = this.configService.getValue("chat.agent.thinking.collapsedTools");
    if (isResponseVM(context.element) && collapsedToolsMode !== CollapsedToolsDisplayMode.Off) {
      const isComplete = this.isCodeblockComplete(markdown, context.element);
      const subAgentInvocationId = extractSubAgentInvocationIdFromText(markdown.content.value);
      if (subAgentInvocationId) {
        const subagentPart = this.getSubagentPart(templateData.renderedParts, subAgentInvocationId);
        if (subagentPart && markdownPart?.domNode && isComplete) {
          subagentPart.appendMarkdownItem(
            () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
            markdownPart.codeblocksPartId,
            markdown,
            templateData.value,
            markdownPart
          );
          return this.renderNoContent((other) => other.kind === "markdownContent" && other.content.value === markdown.content.value && extractSubAgentInvocationIdFromText(other.content.value) === subAgentInvocationId);
        }
      }
      const shouldPin = this.shouldPinPart(markdown, context.element);
      if (markdownPart?.domNode && shouldPin && isComplete) {
        const { part: lastThinking, separatedFromReasoning } = this.getLastThinkingPartForGroupedItem(context, templateData);
        if (!lastThinking && shouldCreateGroupedThinkingPart(collapsedToolsMode, separatedFromReasoning)) {
          const thinkingPart = this.renderThinkingPart({
            kind: "thinking"
          }, context, templateData);
          if (thinkingPart instanceof ChatThinkingContentPart) {
            thinkingPart.appendItem(
              () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
              markdownPart.codeblocksPartId,
              markdown,
              templateData.value,
              markdownPart.onDidChangeDiff,
              markdownPart
            );
          }
          return thinkingPart;
        }
        if (lastThinking) {
          lastThinking.appendItem(
            () => ({ domNode: markdownPart.domNode, disposable: markdownPart }),
            markdownPart.codeblocksPartId,
            markdown,
            templateData.value,
            markdownPart.onDidChangeDiff
          );
        }
      } else if (!shouldPin && !isBlankMarkdown && !hasPendingEditCodeblock) {
        this.finalizeCurrentThinkingPart(context, templateData);
      }
    }
    return markdownPart;
  }
  renderThinkingPart(content, context, templateData) {
    if (!content.id) {
      content.id = Date.now().toString();
    }
    const element = isResponseVM(context.element) ? context.element : void 0;
    const streamingCompleted = this.isThinkingLookAheadComplete(context, element);
    const lastThinkingPart = this.getLastThinkingPart(templateData.renderedParts);
    if (lastThinkingPart?.hasGroupedItems() && shouldStartNewCollapsedThinkingGroup(getEffectiveThinkingDisplayMode(this.configService, this.contextKeyService), "items", "reasoning")) {
      this.finalizeCurrentThinkingPart(context, templateData);
    }
    if (Array.isArray(content.value)) {
      if (content.value.length < 1) {
        const lastThinking = this.getLastThinkingPart(templateData.renderedParts);
        lastThinking?.finalizeTitleIfDefault();
        return this.renderNoContent((other) => content.kind === other.kind);
      }
      let lastPart;
      for (const item of content.value) {
        if (item) {
          const lastThinkingPart2 = lastPart instanceof ChatThinkingContentPart && lastPart.getIsActive() ? lastPart : void 0;
          if (lastThinkingPart2) {
            lastThinkingPart2.setupThinkingContainer({ ...content, value: item });
          } else {
            const itemContent = { ...content, value: item };
            const itemPart = templateData.instantiationService.createInstance(ChatThinkingContentPart, itemContent, context, this.chatContentMarkdownRenderer, streamingCompleted);
            lastPart = itemPart;
          }
        }
      }
      return lastPart ?? this.renderNoContent((other) => content.kind === other.kind);
    } else {
      const lastActiveThinking = this.getLastThinkingPart(templateData.renderedParts);
      if (lastActiveThinking) {
        lastActiveThinking.setupThinkingContainer(content);
        return lastActiveThinking;
      } else {
        const part = templateData.instantiationService.createInstance(ChatThinkingContentPart, content, context, this.chatContentMarkdownRenderer, streamingCompleted);
        return part;
      }
    }
  }
  disposeElement(node, index, templateData, details) {
    this.traceLayout("disposeElement", `Disposing element, index=${index}`);
    templateData.elementDisposables.clear();
    if (templateData.currentElement && !this.viewModel?.editing) {
      this.templateDataByRequestId.delete(templateData.currentElement.id);
    }
    const codeBlocks = this.codeBlocksByResponseId.get(node.element.id);
    if (codeBlocks) {
      for (const info of codeBlocks) {
        if (info?.uri) {
          this.codeBlocksByEditorUri.delete(info.uri);
        }
      }
      this.codeBlocksByResponseId.delete(node.element.id);
    }
    this.fileTreesByResponseId.delete(node.element.id);
    this.focusedFileTreesByResponseId.delete(node.element.id);
    if (isRequestVM(node.element) && node.element.id === this.viewModel?.editing?.id && details?.onScroll) {
      this._onDidDispose.fire(templateData);
    }
    if (templateData.titleToolbar) {
      templateData.titleToolbar.context = void 0;
    }
    templateData.footerToolbar.context = void 0;
    templateData.checkpointToolbar.context = void 0;
    templateData.checkpointRestoreToolbar.context = void 0;
    templateData.responseTokenStatsHover.clear();
  }
  renderMcpServersInteractionRequired(content, context, templateData) {
    return this.instantiationService.createInstance(ChatMcpServersInteractionContentPart, content, context);
  }
  renderDisabledClaudeHooks(content, context) {
    return this.instantiationService.createInstance(ChatDisabledClaudeHooksContentPart, context);
  }
  disposeTemplate(templateData) {
    this.clearRenderedParts(templateData);
    templateData.templateDisposables.dispose();
  }
  hoverVisible(requestHover) {
    requestHover.style.opacity = "1";
  }
  hoverHidden(requestHover) {
    requestHover.style.opacity = "0";
  }
};
ChatListItemRenderer.ID = "item";
ChatListItemRenderer = __decorateClass([
  __decorateParam(5, IInstantiationService),
  __decorateParam(6, IConfigurationService),
  __decorateParam(7, ILogService),
  __decorateParam(8, IContextKeyService),
  __decorateParam(9, IThemeService),
  __decorateParam(10, ICommandService),
  __decorateParam(11, IHoverService),
  __decorateParam(12, IChatWidgetService),
  __decorateParam(13, IChatEntitlementService),
  __decorateParam(14, IChatService),
  __decorateParam(15, IAccessibilitySignalService),
  __decorateParam(16, IAccessibilityService),
  __decorateParam(17, IWorkbenchEnvironmentService),
  __decorateParam(18, ITelemetryService)
], ChatListItemRenderer);
class ChatListDelegate extends CachedListVirtualDelegate {
  constructor(defaultElementHeight) {
    super();
    this.defaultElementHeight = defaultElementHeight;
  }
  estimateHeight(element) {
    return element.currentRenderedHeight ?? this.defaultElementHeight;
  }
  getTemplateId(element) {
    return ChatListItemRenderer.ID;
  }
  hasDynamicHeight(element) {
    return true;
  }
  getMeasuredHeight(element) {
    return this.getCachedHeight(element);
  }
}
function isParentSubagentTool(invocation) {
  return invocation.toolSpecificData?.kind === "subagent" && !invocation.subAgentInvocationId;
}
function getSubagentId(invocation) {
  if (isParentSubagentTool(invocation)) {
    return invocation.toolCallId;
  }
  return invocation.subAgentInvocationId;
}
function isSubagentToolInvocation(invocation) {
  return !!getSubagentId(invocation);
}
function getWorkingProgressRelevantParts(parts) {
  return parts.filter((part) => {
    if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
      return !isSubagentToolInvocation(part);
    }
    if (part.kind === "hook") {
      return !part.subAgentInvocationId;
    }
    return part.kind !== "markdownContent" || !extractSubAgentInvocationIdFromText(part.content.value);
  });
}
function endsWithActiveSubagentContent(parts) {
  const lastPart = findLastMeaningfulPart(parts.filter((part) => !isNestedSubagentContent(part)));
  if (!lastPart || lastPart.kind !== "toolInvocation" && lastPart.kind !== "toolInvocationSerialized") {
    return false;
  }
  if (!isParentSubagentTool(lastPart)) {
    return false;
  }
  return lastPart.toolSpecificData?.kind === "subagent" && (lastPart.toolSpecificData.isActive ?? !IChatToolInvocation.isComplete(lastPart));
}
function isNestedSubagentContent(part) {
  if (part.kind === "toolInvocation" || part.kind === "toolInvocationSerialized") {
    return !!part.subAgentInvocationId;
  }
  if (part.kind === "hook") {
    return !!part.subAgentInvocationId;
  }
  return part.kind === "markdownContent" && !!extractSubAgentInvocationIdFromText(part.content.value);
}
function endsWithCompletedQuestionInteraction(parts) {
  const lastPart = findLastMeaningfulPart(parts);
  if (!lastPart) {
    return false;
  }
  if (lastPart.kind === "questionCarousel") {
    return !!lastPart.isUsed;
  }
  return (lastPart.kind === "toolInvocation" || lastPart.kind === "toolInvocationSerialized") && isAskQuestionsToolInvocation(lastPart) && IChatToolInvocation.isComplete(lastPart);
}
function isWaitingForMcpServers(parts) {
  return parts.some((part) => part.kind === "mcpServersStartingSlow" && part.servers.get().length > 0);
}
function findLastMeaningfulPart(parts) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i];
    if (part.kind !== "markdownContent" || part.content.value.trim().length > 0) {
      return part;
    }
  }
  return void 0;
}
export {
  ChatListDelegate,
  ChatListItemRenderer,
  buildPlanReviewProgressContent,
  endsWithActiveSubagentContent,
  endsWithCompletedQuestionInteraction,
  formatCompletedResponseDisclosureLabel,
  formatResponseTokenStats,
  getCompletedResponseCollapseEndIndex,
  getFinalResponseStartIndex,
  getFinalResponseStartIndexAfterMovingResponseOutcomeTools,
  getVisibleCompletedResponseItemCount,
  getWorkingProgressRelevantParts,
  isFinalResponseRendered,
  isWaitingForMcpServers,
  moveResponseOutcomeToolsAfterFinalResponse,
  reconcileChatItemHeight,
  renderChatRequestTimestamp,
  renderChatResponseDetails,
  shouldCollapseCompletedResponsePart,
  shouldCreateGroupedThinkingPart,
  shouldHideChatUserIdentity,
  shouldPinToolInvocationToThinking,
  shouldRenderInitialProgressiveContentImmediately,
  shouldScheduleInitialHeightChange,
  shouldShowFileChangesSummaryForSettings,
  shouldShowPillsSummaryForSettings,
  shouldStartNewCollapsedThinkingGroup
};
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsiQzpcXFByb2plY3RcXEZvcmdlX0R1cGxpY2F0ZTJcXGZvcmdlXFxzcmNcXHZzXFx3b3JrYmVuY2hcXGNvbnRyaWJcXGNoYXRcXGJyb3dzZXJcXHdpZGdldFxcY2hhdExpc3RSZW5kZXJlci50cyJdLAogICJzb3VyY2VzQ29udGVudCI6IFsiLyotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAqICBDb3B5cmlnaHQgKGMpIE1pY3Jvc29mdCBDb3Jwb3JhdGlvbi4gQWxsIHJpZ2h0cyByZXNlcnZlZC5cbiAqICBMaWNlbnNlZCB1bmRlciB0aGUgTUlUIExpY2Vuc2UuIFNlZSBMaWNlbnNlLnR4dCBpbiB0aGUgcHJvamVjdCByb290IGZvciBsaWNlbnNlIGluZm9ybWF0aW9uLlxuICotLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLSovXG5cbmltcG9ydCAqIGFzIGRvbSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZG9tLmpzJztcbmltcG9ydCB7IHJlbmRlckZvcm1hdHRlZFRleHQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvZm9ybWF0dGVkVGV4dFJlbmRlcmVyLmpzJztcbmltcG9ydCB7IFN0YW5kYXJkS2V5Ym9hcmRFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci9rZXlib2FyZEV2ZW50LmpzJztcbmltcG9ydCB7IElBY3Rpb25WaWV3SXRlbU9wdGlvbnMgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvYWN0aW9uYmFyL2FjdGlvblZpZXdJdGVtcy5qcyc7XG5pbXBvcnQgeyBhbGVydCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hcmlhL2FyaWEuanMnO1xuaW1wb3J0IHsgZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvaG92ZXIvaG92ZXJEZWxlZ2F0ZUZhY3RvcnkuanMnO1xuaW1wb3J0IHsgSU1hbmFnZWRIb3ZlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9ob3Zlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBDYWNoZWRMaXN0VmlydHVhbERlbGVnYXRlLCBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9icm93c2VyL3VpL2xpc3QvbGlzdC5qcyc7XG5pbXBvcnQgeyBJVHJlZU5vZGUsIElUcmVlUmVuZGVyZXIgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2Jyb3dzZXIvdWkvdHJlZS90cmVlLmpzJztcbmltcG9ydCB7IElBY3Rpb24gfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9hY3Rpb25zLmpzJztcbmltcG9ydCB7IGNvYWxlc2NlLCBkaXN0aW5jdCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2FycmF5cy5qcyc7XG5pbXBvcnQgeyBDb2RpY29uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vY29kaWNvbnMuanMnO1xuaW1wb3J0IHsgdG9FcnJvck1lc3NhZ2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9lcnJvck1lc3NhZ2UuanMnO1xuaW1wb3J0IHsgY2FuY2VsZWROYW1lIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXJyb3JzLmpzJztcbmltcG9ydCB7IEVtaXR0ZXIsIEV2ZW50IH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vZXZlbnQuanMnO1xuaW1wb3J0IHsgRnV6enlTY29yZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2ZpbHRlcnMuanMnO1xuaW1wb3J0IHsgTWFya2Rvd25TdHJpbmcsIGVzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vaHRtbENvbnRlbnQuanMnO1xuaW1wb3J0IHsgSXRlcmFibGUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9pdGVyYXRvci5qcyc7XG5pbXBvcnQgeyBLZXlDb2RlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24va2V5Q29kZXMuanMnO1xuaW1wb3J0IHsgRGlzcG9zYWJsZSwgRGlzcG9zYWJsZU1hcCwgRGlzcG9zYWJsZVN0b3JlLCBJRGlzcG9zYWJsZSwgTXV0YWJsZURpc3Bvc2FibGUsIGRpc3Bvc2UsIHRvRGlzcG9zYWJsZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL2xpZmVjeWNsZS5qcyc7XG5pbXBvcnQgeyBSZXNvdXJjZU1hcCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL21hcC5qcyc7XG5pbXBvcnQgeyBTY3JvbGxFdmVudCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Njcm9sbGFibGUuanMnO1xuaW1wb3J0IHsgRmlsZUFjY2VzcywgU2NoZW1hcyB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL25ldHdvcmsuanMnO1xuaW1wb3J0IHsgY2xhbXAsIGZvcm1hdFRva2VuQ291bnQgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi9udW1iZXJzLmpzJztcbmltcG9ydCB7IFRoZW1lSWNvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3RoZW1hYmxlcy5qcyc7XG5pbXBvcnQgeyBVUkkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9iYXNlL2NvbW1vbi91cmkuanMnO1xuaW1wb3J0IHsgbG9jYWxpemUgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9ubHMuanMnO1xuaW1wb3J0IHsgTWVudUVudHJ5QWN0aW9uVmlld0l0ZW0sIGNyZWF0ZUFjdGlvblZpZXdJdGVtIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL21lbnVFbnRyeUFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IE1lbnVXb3JrYmVuY2hUb29sQmFyIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWN0aW9ucy9icm93c2VyL3Rvb2xiYXIuanMnO1xuaW1wb3J0IHsgTWVudUlkLCBNZW51SXRlbUFjdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2FjdGlvbnMvY29tbW9uL2FjdGlvbnMuanMnO1xuaW1wb3J0IHsgSUNvbW1hbmRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29tbWFuZHMvY29tbW9uL2NvbW1hbmRzLmpzJztcbmltcG9ydCB7IElDb25maWd1cmF0aW9uU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL2NvbmZpZ3VyYXRpb24vY29tbW9uL2NvbmZpZ3VyYXRpb24uanMnO1xuaW1wb3J0IHsgSUNvbnRleHRLZXlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vY29udGV4dGtleS9jb21tb24vY29udGV4dGtleS5qcyc7XG5pbXBvcnQgeyBJSG92ZXJTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaG92ZXIvYnJvd3Nlci9ob3Zlci5qcyc7XG5pbXBvcnQgeyBJSW5zdGFudGlhdGlvblNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9pbnN0YW50aWF0aW9uL2NvbW1vbi9pbnN0YW50aWF0aW9uLmpzJztcbmltcG9ydCB7IFNlcnZpY2VDb2xsZWN0aW9uIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vaW5zdGFudGlhdGlvbi9jb21tb24vc2VydmljZUNvbGxlY3Rpb24uanMnO1xuaW1wb3J0IHsgSUxvZ1NlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9sb2cvY29tbW9uL2xvZy5qcyc7XG5pbXBvcnQgeyBJTWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL21hcmtkb3duL2Jyb3dzZXIvbWFya2Rvd25SZW5kZXJlci5qcyc7XG5pbXBvcnQgeyBpc0RhcmsgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS90aGVtZS9jb21tb24vdGhlbWUuanMnO1xuaW1wb3J0IHsgSVRoZW1lU2VydmljZSB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL3BsYXRmb3JtL3RoZW1lL2NvbW1vbi90aGVtZVNlcnZpY2UuanMnO1xuaW1wb3J0IHsgQWNjZXNzaWJpbGl0eVNpZ25hbCwgSUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWNjZXNzaWJpbGl0eVNpZ25hbC9icm93c2VyL2FjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLmpzJztcbmltcG9ydCB7IHBhcnNlUmVtb3RlQWdlbnRIb3N0U2Vzc2lvblR5cGVBdXRob3JpdHkgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hZ2VudEhvc3QvY29tbW9uL2FnZW50SG9zdFNlc3Npb25UeXBlLmpzJztcbmltcG9ydCB7IGlzQ3JlYXRlQ2hhdFRvb2wsIGlzQ3JlYXRlU2Vzc2lvblRvb2wsIGlzU2VuZE1lc3NhZ2VUb29sIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vYWdlbnRIb3N0L2NvbW1vbi9vcGVuU2Vzc2lvbkxpbmsuanMnO1xuaW1wb3J0IHsgSUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi9zZXJ2aWNlcy9jaGF0L2NvbW1vbi9jaGF0RW50aXRsZW1lbnRTZXJ2aWNlLmpzJztcbmltcG9ydCB7IENvZGljb25BY3Rpb25WaWV3SXRlbSB9IGZyb20gJy4uLy4uLy4uL25vdGVib29rL2Jyb3dzZXIvdmlldy9jZWxsUGFydHMvY2VsbEFjdGlvblZpZXcuanMnO1xuaW1wb3J0IHsgYW5ub3RhdGVTcGVjaWFsTWFya2Rvd25Db250ZW50LCBleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dCwgaGFzQ29kZWJsb2NrVXJpVGFnLCBoYXNFZGl0Q29kZWJsb2NrVXJpVGFnIH0gZnJvbSAnLi4vLi4vY29tbW9uL3dpZGdldC9hbm5vdGF0aW9ucy5qcyc7XG5pbXBvcnQgeyBjaGVja01vZGVPcHRpb24gfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdC5qcyc7XG5pbXBvcnQgeyBJQ2hhdEFnZW50TWV0YWRhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vcGFydGljaXBhbnRzL2NoYXRBZ2VudHMuanMnO1xuaW1wb3J0IHsgQ2hhdENvbnRleHRLZXlzIH0gZnJvbSAnLi4vLi4vY29tbW9uL2FjdGlvbnMvY2hhdENvbnRleHRLZXlzLmpzJztcbmltcG9ydCB7IElDaGF0UHJvZ3Jlc3NSZXNwb25zZUNvbnRlbnQsIElDaGF0VGV4dEVkaXRHcm91cCB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0TW9kZWwuanMnO1xuaW1wb3J0IHsgY2hhdFN1YmNvbW1hbmRMZWFkZXIgfSBmcm9tICcuLi8uLi9jb21tb24vcmVxdWVzdFBhcnNlci9jaGF0UGFyc2VyVHlwZXMuanMnO1xuaW1wb3J0IHsgQ2hhdEFnZW50Vm90ZURpcmVjdGlvbiwgQ2hhdEVycm9yTGV2ZWwsIENoYXRSZXF1ZXN0UXVldWVLaW5kLCBJQ2hhdENvbmZpcm1hdGlvbiwgSUNoYXRDb250ZW50UmVmZXJlbmNlLCBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdCwgSUNoYXRFbGljaXRhdGlvblJlcXVlc3RTZXJpYWxpemVkLCBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBJQ2hhdEV4dGVybmFsRWRpdCwgSUNoYXRGb2xsb3d1cCwgSUNoYXRIb29rUGFydCwgSUNoYXRNYXJrZG93bkNvbnRlbnQsIElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nLCBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZ1NlcmlhbGl6ZWQsIElDaGF0TXVsdGlEaWZmRGF0YSwgSUNoYXRNdWx0aURpZmZEYXRhU2VyaWFsaXplZCwgSUNoYXRQbGFuUmV2aWV3LCBJQ2hhdFBsYW5SZXZpZXdSZXN1bHQsIElDaGF0UHVsbFJlcXVlc3RDb250ZW50LCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWUsIElDaGF0UXVlc3Rpb25BbnN3ZXJzLCBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwsIElDaGF0U2VydmljZSwgSUNoYXRUYXNrLCBJQ2hhdFRhc2tTZXJpYWxpemVkLCBJQ2hhdFRoaW5raW5nUGFydCwgSUNoYXRUb29sSW52b2NhdGlvbiwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIElDaGF0VHJlZURhdGEsIElDaGF0VW5kb1N0b3AsIElDaGF0VXNhZ2VNb2RlbFRvdGFsLCBpc0NoYXRGb2xsb3d1cCB9IGZyb20gJy4uLy4uL2NvbW1vbi9jaGF0U2VydmljZS9jaGF0U2VydmljZS5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld0RhdGEgfSBmcm9tICcuLi8uLi9jb21tb24vbW9kZWwvY2hhdFByb2dyZXNzVHlwZXMvY2hhdFBsYW5SZXZpZXdEYXRhLmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSB9IGZyb20gJy4uLy4uL2NvbW1vbi9tb2RlbC9jaGF0UHJvZ3Jlc3NUeXBlcy9jaGF0UXVlc3Rpb25DYXJvdXNlbERhdGEuanMnO1xuaW1wb3J0IHsgbG9jYWxDaGF0U2Vzc2lvblR5cGUsIFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NoYXRTZXNzaW9uc1NlcnZpY2UuanMnO1xuaW1wb3J0IHsgZ2V0Q2hhdFNlc3Npb25UeXBlIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRVcmkuanMnO1xuaW1wb3J0IHsgZ2V0RXhwbGljaXRGaWxlT3JJbWFnZUF0dGFjaG1lbnRTdW1tYXJ5LCBJQ2hhdFJlcXVlc3RWYXJpYWJsZUVudHJ5LCBpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5LCBpc1Bhc3RlVmFyaWFibGVFbnRyeSB9IGZyb20gJy4uLy4uL2NvbW1vbi9hdHRhY2htZW50cy9jaGF0VmFyaWFibGVFbnRyaWVzLmpzJztcbmltcG9ydCB7IGdldFN0aWNreVNjcm9sbFRhcmdldEl0ZW0sIElDaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LCBJQ2hhdENvZGVDaXRhdGlvbnMsIElDaGF0RXJyb3JEZXRhaWxzUGFydCwgSUNoYXRSZWZlcmVuY2VzLCBJQ2hhdFJlbmRlcmVyQ29udGVudCwgSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBJQ2hhdFZpZXdNb2RlbCwgSUNoYXRXb3JraW5nUHJvZ3Jlc3MsIGlzUmVxdWVzdFZNLCBpc1Jlc3BvbnNlVk0sIElDaGF0UGVuZGluZ0RpdmlkZXJWaWV3TW9kZWwsIGlzUGVuZGluZ0RpdmlkZXJWTSwgSUNoYXRUdXJuUGlsbHNQYXJ0IH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRWaWV3TW9kZWwuanMnO1xuaW1wb3J0IHsgZ2V0TldvcmRzIH0gZnJvbSAnLi4vLi4vY29tbW9uL21vZGVsL2NoYXRXb3JkQ291bnRlci5qcyc7XG5pbXBvcnQgeyBDSEFUX09QRU5fQUdFTlRfSE9TVF9DSEFUX0NPTU1BTkRfSUQsIENoYXRBZ2VudExvY2F0aW9uLCBDaGF0Q29uZmlndXJhdGlvbiwgQ2hhdE1vZGVLaW5kLCBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlLCBUaGlua2luZ0Rpc3BsYXlNb2RlIH0gZnJvbSAnLi4vLi4vY29tbW9uL2NvbnN0YW50cy5qcyc7XG5pbXBvcnQgeyBmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcCwgZm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscywgZm9ybWF0Q2hhdFJlc3BvbnNlRWxhcHNlZFRpbWUgfSBmcm9tICcuLi8uLi9jb21tb24vY2hhdFByb2dyZXNzRm9ybWF0dGluZy5qcyc7XG5pbXBvcnQgeyBDbGlja0FuaW1hdGlvbiB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvYnJvd3Nlci91aS9hbmltYXRpb25zL2FuaW1hdGlvbnMuanMnO1xuaW1wb3J0IHsgRm9ya0NvbnZlcnNhdGlvbkFjdGlvbklkIH0gZnJvbSAnLi4vYWN0aW9ucy9jaGF0Rm9ya0FjdGlvbnMuanMnO1xuaW1wb3J0IHsgTWFya0hlbHBmdWxBY3Rpb25JZCB9IGZyb20gJy4uL2FjdGlvbnMvY2hhdFRpdGxlQWN0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0VHJlZUl0ZW0sIElDaGF0Q29kZUJsb2NrSW5mbywgSUNoYXRGaWxlVHJlZUluZm8sIElDaGF0TGlzdEl0ZW1SZW5kZXJlck9wdGlvbnMsIElDaGF0V2lkZ2V0U2VydmljZSB9IGZyb20gJy4uL2NoYXQuanMnO1xuaW1wb3J0IHsgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyIH0gZnJvbSAnLi4vYWdlbnRTZXNzaW9ucy9hZ2VudEhvc3QvYWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyLmpzJztcbmltcG9ydCB7IFJlc3RvcmVDaGVja3BvaW50QWN0aW9uSWQsIFN0YXJ0T3ZlckFjdGlvbklkIH0gZnJvbSAnLi4vY2hhdEVkaXRpbmcvY2hhdEVkaXRpbmdBY3Rpb25zLmpzJztcbmltcG9ydCB7IENoYXRGb3JrQWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL2NoYXRGb3JrQWN0aW9uVmlld0l0ZW0uanMnO1xuaW1wb3J0IHsgQ2hhdFJlc3RvcmVDaGVja3BvaW50QWN0aW9uVmlld0l0ZW0gfSBmcm9tICcuL2NoYXRSZXN0b3JlQ2hlY2twb2ludEFjdGlvblZpZXdJdGVtLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudEhvdmVyLCBnZXRDaGF0QWdlbnRIb3Zlck9wdGlvbnMgfSBmcm9tICcuL2NoYXRBZ2VudEhvdmVyLmpzJztcbmltcG9ydCB7IENoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciB9IGZyb20gJy4vY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLmpzJztcbmltcG9ydCB7IENoYXRBZ2VudENvbW1hbmRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEFub255bW91c1JhdGVMaW1pdGVkUGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0QW5vbnltb3VzUmF0ZUxpbWl0ZWRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRBdHRhY2htZW50c0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRBdXRvTW9kZVJlc29sdXRpb25Db250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0QXV0b01vZGVSZXNvbHV0aW9uQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENoZWNrcG9pbnRGaWxlQ2hhbmdlc1N1bW1hcnlDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUdXJuUGlsbHNDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0VHVyblBpbGxzUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0VHVyblN0YXR1c1BpbGxzU2V0dGluZywgaXNDaGF0VHVyblN0YXR1c1BpbGxzRW5hYmxlZCB9IGZyb20gJy4vY2hhdFR1cm5QaWxscy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29kZUNpdGF0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdENvZGVDaXRhdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRDb21tYW5kQnV0dG9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdENvbW1hbmRDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0Q29uZmlybWF0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdENvbmZpcm1hdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IERpZmZFZGl0b3JQb29sLCBFZGl0b3JQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50Q29kZVBvb2xzLmpzJztcbmltcG9ydCB7IElDaGF0Q29udGVudFBhcnQsIElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRDb250ZW50UGFydHMuanMnO1xuaW1wb3J0IHsgQ2hhdEVsaWNpdGF0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEVsaWNpdGF0aW9uQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEVycm9yQ29uZmlybWF0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdEVycm9yQ29uZmlybWF0aW9uUGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0RXJyb3JDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0RXJyb3JDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UGxhblJldmlld1BhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFBsYW5SZXZpZXdQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdEV4dGVuc2lvbnNDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LCBjb2RlYmxvY2tIYXNDbG9zaW5nQmFja3RpY2tzIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRNYXJrZG93bkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRNY3BTZXJ2ZXJzSW50ZXJhY3Rpb25Db250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWNwU2VydmVyc0ludGVyYWN0aW9uQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1jcEF1dGhlbnRpY2F0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdE1jcEF1dGhlbnRpY2F0aW9uQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1jcFNlcnZlcnNTdGFydGluZ0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRNY3BTZXJ2ZXJzU3RhcnRpbmdDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0RGlzYWJsZWRDbGF1ZGVIb29rc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXREaXNhYmxlZENsYXVkZUhvb2tzQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE11bHRpRGlmZkNvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRNdWx0aURpZmZDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UHJvZ3Jlc3NDb250ZW50UGFydCwgQ2hhdFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRQcm9ncmVzc0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRQdWxsUmVxdWVzdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRQdWxsUmVxdWVzdENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRRdW90YUV4Y2VlZGVkUGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0UXVvdGFFeGNlZWRlZFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdENvbGxhcHNpYmxlTGlzdENvbnRlbnRQYXJ0LCBDaGF0VXNlZFJlZmVyZW5jZXNMaXN0Q29udGVudFBhcnQsIENvbGxhcHNpYmxlTGlzdFBvb2wgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFJlZmVyZW5jZXNDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0UmVxdWVzdE9yaWdpblBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFJlcXVlc3RPcmlnaW5QYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUYXNrQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFRhc2tDb250ZW50UGFydC5qcyc7XG5pbXBvcnQgeyBDaGF0U3lzdGVtTm90aWZpY2F0aW9uQ29udGVudFBhcnQgfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvY2hhdFN5c3RlbU5vdGlmaWNhdGlvbkNvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUZXh0RWRpdENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRUZXh0RWRpdENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LCBnZXRFZmZlY3RpdmVUaGlua2luZ0Rpc3BsYXlNb2RlIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRUaGlua2luZ0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRUcmVlQ29udGVudFBhcnQsIFRyZWVQb29sIH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NoYXRUcmVlQ29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFdvcmtzcGFjZUVkaXRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0V29ya3NwYWNlRWRpdENvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRFeHRlcm5hbEVkaXRDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0RXh0ZXJuYWxFZGl0Q29udGVudFBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy90b29sSW52b2NhdGlvblBhcnRzL2NoYXRUb29sSW52b2NhdGlvblBhcnQuanMnO1xuaW1wb3J0IHsgQ2hhdE1hcmtkb3duRGVjb3JhdGlvbnNSZW5kZXJlciB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyLmpzJztcbmltcG9ydCB7IENoYXRFZGl0b3JPcHRpb25zIH0gZnJvbSAnLi9jaGF0T3B0aW9ucy5qcyc7XG5pbXBvcnQgeyBDaGF0Q29kZUJsb2NrQ29udGVudFByb3ZpZGVyLCBDb2RlQmxvY2tQYXJ0IH0gZnJvbSAnLi9jaGF0Q29udGVudFBhcnRzL2NvZGVCbG9ja1BhcnQuanMnO1xuaW1wb3J0IHsgYXV0b3J1biwgb2JzZXJ2YWJsZVZhbHVlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vYmFzZS9jb21tb24vb2JzZXJ2YWJsZS5qcyc7XG5pbXBvcnQgeyBiYXNlbmFtZSwgaXNFcXVhbCB9IGZyb20gJy4uLy4uLy4uLy4uLy4uL2Jhc2UvY29tbW9uL3Jlc291cmNlcy5qcyc7XG5pbXBvcnQgeyBJQWNjZXNzaWJpbGl0eVNlcnZpY2UgfSBmcm9tICcuLi8uLi8uLi8uLi8uLi9wbGF0Zm9ybS9hY2Nlc3NpYmlsaXR5L2NvbW1vbi9hY2Nlc3NpYmlsaXR5LmpzJztcbmltcG9ydCB7IElUZWxlbWV0cnlTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vLi4vcGxhdGZvcm0vdGVsZW1ldHJ5L2NvbW1vbi90ZWxlbWV0cnkuanMnO1xuaW1wb3J0IHsgQ2hhdEhvb2tDb250ZW50UGFydCB9IGZyb20gJy4vY2hhdENvbnRlbnRQYXJ0cy9jaGF0SG9va0NvbnRlbnRQYXJ0LmpzJztcbmltcG9ydCB7IENoYXRQZW5kaW5nRHJhZ0NvbnRyb2xsZXIgfSBmcm9tICcuL2NoYXRQZW5kaW5nRHJhZ0FuZERyb3AuanMnO1xuaW1wb3J0IHsgSG9va1R5cGUgfSBmcm9tICcuLi8uLi9jb21tb24vcHJvbXB0U3ludGF4L2hvb2tUeXBlcy5qcyc7XG5pbXBvcnQgeyBJV29ya2JlbmNoRW52aXJvbm1lbnRTZXJ2aWNlIH0gZnJvbSAnLi4vLi4vLi4vLi4vc2VydmljZXMvZW52aXJvbm1lbnQvY29tbW9uL2Vudmlyb25tZW50U2VydmljZS5qcyc7XG5pbXBvcnQgeyBBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkIH0gZnJvbSAnLi4vLi4vLi4vYWNjZXNzaWJpbGl0eS9icm93c2VyL2FjY2Vzc2liaWxpdHlDb25maWd1cmF0aW9uLmpzJztcbmltcG9ydCB7IGlzQXNrUXVlc3Rpb25zVG9vbEludm9jYXRpb24sIGlzTWNwVG9vbEludm9jYXRpb24gfSBmcm9tICcuL2NoYXRDb250ZW50UGFydHMvdG9vbEludm9jYXRpb25QYXJ0cy9jaGF0VG9vbFBhcnRVdGlsaXRpZXMuanMnO1xuaW1wb3J0IHsgQWdlbnRTZXNzaW9uUHJvdmlkZXJzLCBpc0FnZW50SG9zdFRhcmdldCB9IGZyb20gJy4uL2FnZW50U2Vzc2lvbnMvYWdlbnRTZXNzaW9ucy5qcyc7XG5cbmNvbnN0ICQgPSBkb20uJDtcblxuY29uc3QgQ09QSUxPVF9VU0VSTkFNRSA9ICdHaXRIdWIgQ29waWxvdCc7XG5jb25zdCBXT1JLSU5HX0NBVUdIVF9VUF9ERUJPVU5DRV9NUyA9IDc1MDtcbmNvbnN0IERFRkFVTFRfQ0hBVF9JVEVNX0hPUklaT05UQUxfUEFERElORyA9IDQwO1xuXG5leHBvcnQgaW50ZXJmYWNlIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSB7XG5cdGN1cnJlbnRFbGVtZW50PzogQ2hhdFRyZWVJdGVtO1xuXHQvKipcblx0ICogVGhlIHBhcnRzIHRoYXQgYXJlIGN1cnJlbnRseSByZW5kZXJlZCBpbiB0aGUgdGVtcGxhdGUuIE5vdGUgdGhhdCB0aGVzZSBhcmUgcHVycG9zZWx5IG5vdCBhZGRlZCB0byBlbGVtZW50RGlzcG9zYWJsZXMtXG5cdCAqIHRoZXkgYXJlIGRpc3Bvc2VkIGluIGEgc2VwYXJhdGUgY3ljbGUgYWZ0ZXIgZGlmZmluZyB3aXRoIHRoZSBuZXh0IGNvbnRlbnQgdG8gcmVuZGVyLlxuXHQgKi9cblx0cmVuZGVyZWRQYXJ0cz86IElDaGF0Q29udGVudFBhcnRbXTtcblx0LyoqXG5cdCAqIFRvb2wgcGFydHMgdGhhdCBoYXZlIGJlZW4gbW92ZWQgb3V0IG9mIGEgdGhpbmtpbmcgcGFydCBpbnRvIHRoZSByb3cncyB2YWx1ZVxuXHQgKiBjb250YWluZXIuIFRoZWlyIGxpZmVjeWNsZSBtYXRjaGVzIGByZW5kZXJlZFBhcnRzYCAoY2xlYXJlZCBieVxuXHQgKiBgY2xlYXJSZW5kZXJlZFBhcnRzYCksIG5vdCBgZWxlbWVudERpc3Bvc2FibGVzYCB3aGljaCBpcyBjbGVhcmVkIG9uXG5cdCAqIHZpcnR1YWxpemF0aW9uIHJlY3ljbGUuXG5cdCAqL1xuXHRtb3ZlZE91dFRvb2xQYXJ0cz86IERpc3Bvc2FibGVNYXA8c3RyaW5nLCBJRGlzcG9zYWJsZT47XG5cdC8qKlxuXHQgKiBFbGVtZW50IHVzZWQgdG8gdHJhY2sgd2hldGhlciB0aGUgdGVtcGxhdGUgaXMgbW91bnRlZCBpbiB0aGUgRE9NLlxuXHQgKi9cblx0cmVuZGVyZWRQYXJ0c01vdW50ZWQ/OiBib29sZWFuO1xuXHRyZW5kZXJlZENvbnRlbnQ/OiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50Pjtcblx0Y29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlPzogSFRNTERldGFpbHNFbGVtZW50O1xuXHRjb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXg/OiBudW1iZXI7XG5cdGNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZU9wZW4/OiBib29sZWFuO1xuXHR3YXNSZXNwb25zZUNvbXBsZXRlPzogYm9vbGVhbjtcblx0cmVhZG9ubHkgY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXM6IERpc3Bvc2FibGVTdG9yZTtcblx0LyoqXG5cdCAqIFRva2VuLXVzYWdlIGJyZWFrZG93biBob3ZlciBmb3IgdGhlIHJlc3BvbnNlIGZvb3RlcidzIG1vZGVsL2NyZWRpdHMgc3RhdC5cblx0ICogVGVtcGxhdGUtc2NvcGVkIGJlY2F1c2UgdGhlIGZvY3VzYWJsZSBmb290ZXIgY29udGFpbmVyIGlzIHJldXNlZCBhY3Jvc3Ncblx0ICogZWxlbWVudCByZW5kZXJzLCBhbGxvd2luZyBpdHMgbWFuYWdlZCBob3ZlciB0byBiZSB1cGRhdGVkIGluIHBsYWNlLlxuXHQgKi9cblx0cmVhZG9ubHkgcmVzcG9uc2VUb2tlblN0YXRzSG92ZXI6IE11dGFibGVEaXNwb3NhYmxlPElNYW5hZ2VkSG92ZXI+O1xuXG5cdC8qKiBEcmFnIGhhbmRsZSBlbGVtZW50IGZvciByZW9yZGVyaW5nIHBlbmRpbmcgcmVxdWVzdHMsIGlmIGN1cnJlbnRseSByZW5kZXJlZC4gKi9cblx0ZHJhZ0hhbmRsZT86IEhUTUxFbGVtZW50O1xuXG5cdHJlYWRvbmx5IHJvd0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdC8qKiBIZWlnaHQgYWxsb2NhdGVkIGJ5IHRoZSBsaXN0IGZvciB0aGUgY3VycmVudGx5IHJlbmRlcmVkIHJvdy4gKi9cblx0YWxsb2NhdGVkSGVpZ2h0PzogbnVtYmVyO1xuXHRyZWFkb25seSB0aXRsZVRvb2xiYXI/OiBNZW51V29ya2JlbmNoVG9vbEJhcjtcblx0cmVhZG9ubHkgaGVhZGVyPzogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGZvb3RlclRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBmb290ZXJUb29sYmFyQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZm9vdGVyRGV0YWlsc0NvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IGF2YXRhckNvbnRhaW5lcjogSFRNTEVsZW1lbnQ7XG5cdHJlYWRvbmx5IHVzZXJuYW1lOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGV0YWlsOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgdmFsdWU6IEhUTUxFbGVtZW50O1xuXHRyZWFkb25seSByZXF1ZXN0VGltZXN0YW1wQ29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZTtcblx0cmVhZG9ubHkgaW5zdGFudGlhdGlvblNlcnZpY2U6IElJbnN0YW50aWF0aW9uU2VydmljZTtcblx0cmVhZG9ubHkgdGVtcGxhdGVEaXNwb3NhYmxlczogSURpc3Bvc2FibGU7XG5cdHJlYWRvbmx5IGVsZW1lbnREaXNwb3NhYmxlczogRGlzcG9zYWJsZVN0b3JlO1xuXHRyZWFkb25seSBhZ2VudEhvdmVyOiBDaGF0QWdlbnRIb3Zlcjtcblx0cmVhZG9ubHkgcmVxdWVzdEhvdmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgZGlzYWJsZWRPdmVybGF5OiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hlY2twb2ludFRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjaGVja3BvaW50UmVzdG9yZVRvb2xiYXI6IE1lbnVXb3JrYmVuY2hUb29sQmFyO1xuXHRyZWFkb25seSBjaGVja3BvaW50Q29udGFpbmVyOiBIVE1MRWxlbWVudDtcblx0cmVhZG9ubHkgY2hlY2twb2ludFJlc3RvcmVDb250YWluZXI6IEhUTUxFbGVtZW50O1xufVxuXG5mdW5jdGlvbiBlc2NhcGVNYXJrZG93bkxpbmtMYWJlbChsYWJlbDogc3RyaW5nKTogc3RyaW5nIHtcblx0cmV0dXJuIGxhYmVsLnJlcGxhY2UoL1xcXFwvZywgJ1xcXFxcXFxcJykucmVwbGFjZSgvXFxdL2csICdcXFxcXScpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHJldmlldzogSUNoYXRQbGFuUmV2aWV3LCBtZXNzYWdlOiBzdHJpbmcpOiBNYXJrZG93blN0cmluZyB7XG5cdGNvbnN0IHJlbmRlcmVkQXNVc2VkID0gISFyZXZpZXcuaXNVc2VkO1xuXHRjb25zdCBkYXRhID0gcmVuZGVyZWRBc1VzZWQgJiYgIXJldmlldy5kYXRhPy5yZWplY3RlZCA/IHJldmlldy5kYXRhIDogdW5kZWZpbmVkO1xuXHRjb25zdCBvdmVyYWxsID0gZGF0YT8uZmVlZGJhY2tPdmVyYWxsPy50cmltKCk7XG5cdGNvbnN0IGlubGluZU1kID0gZGF0YT8uZmVlZGJhY2tJbmxpbmVNYXJrZG93bj8udHJpbSgpO1xuXHRjb25zdCBmZWVkYmFja01hcmtkb3duID0gW292ZXJhbGwsIGlubGluZU1kXS5maWx0ZXIodmFsdWUgPT4gISF2YWx1ZSkuam9pbignXFxuXFxuJylcblx0XHR8fCBkYXRhPy5mZWVkYmFjaz8udHJpbSgpO1xuXG5cdGNvbnN0IGNvbnRlbnQgPSBuZXcgTWFya2Rvd25TdHJpbmcodW5kZWZpbmVkLCB7IHN1cHBvcnRUaGVtZUljb25zOiB0cnVlIH0pO1xuXHRjb250ZW50LmFwcGVuZFRleHQobWVzc2FnZSk7XG5cdGlmIChmZWVkYmFja01hcmtkb3duKSB7XG5cdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bihmZWVkYmFja01hcmtkb3duKTtcblx0fVxuXG5cdGlmIChyZW5kZXJlZEFzVXNlZCkge1xuXHRcdGNvbnN0IHJldmlld0NvbnRlbnQgPSByZXZpZXcuY29udGVudC50cmltKCk7XG5cdFx0Y29uc3QgcGxhblVyaSA9IHJldmlldy5wbGFuVXJpID8gVVJJLnJldml2ZShyZXZpZXcucGxhblVyaSkgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKHJldmlld0NvbnRlbnQgfHwgcGxhblVyaSkge1xuXHRcdFx0Y29udGVudC5hcHBlbmRNYXJrZG93bignXFxuXFxuJyk7XG5cdFx0XHRpZiAocmV2aWV3Q29udGVudCkge1xuXHRcdFx0XHRjb250ZW50LmFwcGVuZE1hcmtkb3duKHJldmlld0NvbnRlbnQpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHBsYW5VcmkpIHtcblx0XHRcdFx0aWYgKHJldmlld0NvbnRlbnQpIHtcblx0XHRcdFx0XHRjb250ZW50LmFwcGVuZE1hcmtkb3duKCdcXG5cXG4nKTtcblx0XHRcdFx0fVxuXHRcdFx0XHRjb25zdCBwbGFuRmlsZU5hbWUgPSBiYXNlbmFtZShwbGFuVXJpKTtcblx0XHRcdFx0Y29uc3QgbGFiZWwgPSBwbGFuRmlsZU5hbWVcblx0XHRcdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcub3BlbkZ1bGxQbGFuRmlsZScsIFwiT3BlbiBmdWxsIHBsYW4gZmlsZSAoezB9KVwiLCBwbGFuRmlsZU5hbWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3Lm9wZW5GdWxsUGxhbicsIFwiT3BlbiBmdWxsIHBsYW4gZmlsZVwiKTtcblx0XHRcdFx0Y29uc3QgcGxhbldpZGdldFVyaSA9IHBsYW5Vcmkud2l0aCh7IHF1ZXJ5OiBwbGFuVXJpLnF1ZXJ5ID8gYCR7cGxhblVyaS5xdWVyeX0mdnNjb2RlTGlua1R5cGU9ZmlsZWAgOiAndnNjb2RlTGlua1R5cGU9ZmlsZScgfSk7XG5cdFx0XHRcdGNvbnRlbnQuYXBwZW5kTWFya2Rvd24oYFske2VzY2FwZU1hcmtkb3duTGlua0xhYmVsKGxhYmVsKX1dKCR7cGxhbldpZGdldFVyaS50b1N0cmluZyh0cnVlKX0pYCk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cdHJldHVybiBjb250ZW50O1xufVxuXG5pbnRlcmZhY2UgSUl0ZW1IZWlnaHRDaGFuZ2VQYXJhbXMge1xuXHRlbGVtZW50OiBDaGF0VHJlZUl0ZW07XG5cdGhlaWdodDogbnVtYmVyO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkU2NoZWR1bGVJbml0aWFsSGVpZ2h0Q2hhbmdlKG5vcm1hbGl6ZWRIZWlnaHQ6IG51bWJlciwgYWxsb2NhdGVkSGVpZ2h0OiBudW1iZXIgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIHR5cGVvZiBhbGxvY2F0ZWRIZWlnaHQgIT09ICdudW1iZXInIHx8IG5vcm1hbGl6ZWRIZWlnaHQgPiBhbGxvY2F0ZWRIZWlnaHQ7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRGaW5hbFJlc3BvbnNlU3RhcnRJbmRleChjb250ZW50OiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50Pik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGxldCBpbmRleCA9IGNvbnRlbnQubGVuZ3RoIC0gMTtcblx0d2hpbGUgKGluZGV4ID49IDApIHtcblx0XHRjb25zdCBwYXJ0ID0gY29udGVudFtpbmRleF07XG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgcGFydC5jb250ZW50LnZhbHVlLmxlbmd0aCkge1xuXHRcdFx0YnJlYWs7XG5cdFx0fVxuXHRcdGluZGV4LS07XG5cdH1cblxuXHRpZiAoaW5kZXggPCAwKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdHdoaWxlIChpbmRleCA+IDAgJiYgY29udGVudFtpbmRleCAtIDFdLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0aW5kZXgtLTtcblx0fVxuXHRyZXR1cm4gaW5kZXg7XG59XG5cbmZ1bmN0aW9uIGlzUmVzcG9uc2VPdXRjb21lVG9vbChwYXJ0OiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdCYmIChwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdzZXNzaW9uQ3JlYXRlZCcgfHwgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnZ2VuZXJhdGVkSW1hZ2UnKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4QWZ0ZXJNb3ZpbmdSZXNwb25zZU91dGNvbWVUb29scyhjb250ZW50OiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50Pik6IG51bWJlciB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZpbmFsUmVzcG9uc2VTdGFydEluZGV4ID0gZ2V0RmluYWxSZXNwb25zZVN0YXJ0SW5kZXgoY29udGVudCk7XG5cdGlmIChmaW5hbFJlc3BvbnNlU3RhcnRJbmRleCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGxldCBtb3ZlZFRvb2xDb3VudCA9IDA7XG5cdGZvciAobGV0IGluZGV4ID0gMDsgaW5kZXggPCBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleDsgaW5kZXgrKykge1xuXHRcdGlmIChpc1Jlc3BvbnNlT3V0Y29tZVRvb2woY29udGVudFtpbmRleF0pKSB7XG5cdFx0XHRtb3ZlZFRvb2xDb3VudCsrO1xuXHRcdH1cblx0fVxuXHRyZXR1cm4gZmluYWxSZXNwb25zZVN0YXJ0SW5kZXggLSBtb3ZlZFRvb2xDb3VudDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGlzRmluYWxSZXNwb25zZVJlbmRlcmVkKGNvbnRlbnQ6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQ+LCBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleDogbnVtYmVyIHwgdW5kZWZpbmVkKTogYm9vbGVhbiB7XG5cdHJldHVybiBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleCAhPT0gdW5kZWZpbmVkICYmIGNvbnRlbnRbZmluYWxSZXNwb25zZVN0YXJ0SW5kZXhdPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIG1vdmVSZXNwb25zZU91dGNvbWVUb29sc0FmdGVyRmluYWxSZXNwb25zZShjb250ZW50OiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50Pik6IElDaGF0UmVuZGVyZXJDb250ZW50W10ge1xuXHRjb25zdCBvdXRjb21lVG9vbHMgPSBjb250ZW50LmZpbHRlcihpc1Jlc3BvbnNlT3V0Y29tZVRvb2wpO1xuXHRpZiAob3V0Y29tZVRvb2xzLmxlbmd0aCA9PT0gMCkge1xuXHRcdHJldHVybiBbLi4uY29udGVudF07XG5cdH1cblxuXHRjb25zdCBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleCA9IGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4QWZ0ZXJNb3ZpbmdSZXNwb25zZU91dGNvbWVUb29scyhjb250ZW50KTtcblx0aWYgKGZpbmFsUmVzcG9uc2VTdGFydEluZGV4ID09PSB1bmRlZmluZWQpIHtcblx0XHRyZXR1cm4gWy4uLmNvbnRlbnRdO1xuXHR9XG5cblx0Y29uc3QgcmVvcmRlcmVkID0gY29udGVudC5maWx0ZXIocGFydCA9PiAhaXNSZXNwb25zZU91dGNvbWVUb29sKHBhcnQpKTtcblx0bGV0IGluc2VydGlvbkluZGV4ID0gZmluYWxSZXNwb25zZVN0YXJ0SW5kZXg7XG5cdHdoaWxlIChyZW9yZGVyZWRbaW5zZXJ0aW9uSW5kZXhdPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50Jykge1xuXHRcdGluc2VydGlvbkluZGV4Kys7XG5cdH1cblx0cmVvcmRlcmVkLnNwbGljZShpbnNlcnRpb25JbmRleCwgMCwgLi4ub3V0Y29tZVRvb2xzKTtcblx0cmV0dXJuIHJlb3JkZXJlZDtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdENvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZUxhYmVsKHN0ZXBDb3VudDogbnVtYmVyLCBlbGFwc2VkTXM6IG51bWJlciB8IHVuZGVmaW5lZCk6IHN0cmluZyB7XG5cdGNvbnN0IGVsYXBzZWQgPSBmb3JtYXRDaGF0UmVzcG9uc2VFbGFwc2VkVGltZShlbGFwc2VkTXMpO1xuXHRpZiAoc3RlcENvdW50ID09PSAxKSB7XG5cdFx0cmV0dXJuIGVsYXBzZWRcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucmVzcG9uc2VDb21wbGV0ZWRPbmVTdGVwSW4nLCBcIkNvbXBsZXRlZCAxIHN0ZXAgaW4gezB9XCIsIGVsYXBzZWQpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnJlc3BvbnNlQ29tcGxldGVkT25lU3RlcCcsIFwiQ29tcGxldGVkIDEgc3RlcFwiKTtcblx0fVxuXHRyZXR1cm4gZWxhcHNlZFxuXHRcdD8gbG9jYWxpemUoJ2NoYXQucmVzcG9uc2VDb21wbGV0ZWRTdGVwc0luJywgXCJDb21wbGV0ZWQgezB9IHN0ZXBzIGluIHsxfVwiLCBzdGVwQ291bnQsIGVsYXBzZWQpXG5cdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZXNwb25zZUNvbXBsZXRlZFN0ZXBzJywgXCJDb21wbGV0ZWQgezB9IHN0ZXBzXCIsIHN0ZXBDb3VudCk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBnZXRWaXNpYmxlQ29tcGxldGVkUmVzcG9uc2VJdGVtQ291bnQobm9kZXM6IFJlYWRvbmx5QXJyYXk8Tm9kZT4pOiBudW1iZXIge1xuXHRsZXQgdmlzaWJsZUl0ZW1Db3VudCA9IDA7XG5cdGZvciAoY29uc3Qgbm9kZSBvZiBub2Rlcykge1xuXHRcdGlmIChkb20uaXNIVE1MRWxlbWVudChub2RlKSAmJiAobm9kZS5oaWRkZW4gfHwgbm9kZS5zdHlsZS5kaXNwbGF5ID09PSAnbm9uZScpKSB7XG5cdFx0XHRjb250aW51ZTtcblx0XHR9XG5cdFx0dmlzaWJsZUl0ZW1Db3VudCsrO1xuXHR9XG5cdHJldHVybiB2aXNpYmxlSXRlbUNvdW50O1xufVxuXG4vKipcbiAqIFRva2VuIGNvbnN1bXB0aW9uIHN1bW1hcnkgc2hvd24gd2hlbiBob3ZlcmluZyB0aGUgcmVzcG9uc2UgZm9vdGVyJ3MgbW9kZWwgYW5kXG4gKiBjcmVkaXRzIHN0YXQuIFByb3ZpZGVyIGNhbGwtbGV2ZWwgcmVwb3J0cyBhcmUgYWdncmVnYXRlZCBieSBtb2RlbCBmb3IgdGhlXG4gKiB3aG9sZSB0dXJuLlxuICpcbiAqIFJldHVybnMgYHVuZGVmaW5lZGAgd2hlbiB0aGUgcHJvdmlkZXIgcmVwb3J0ZWQgbm8gdG90YWxzLCBpbiB3aGljaCBjYXNlIG5vXG4gKiBob3ZlciBzaG91bGQgYmUgc2hvd24gYXQgYWxsLiBUaGUgcmVzdWx0IGRvdWJsZXMgYXMgbWFuYWdlZC1ob3ZlciBjb250ZW50IGFuZFxuICogY2FycmllcyBhbiBgYXJpYUxhYmVsYCB3aXRoIGV4YWN0LCB1bmFiYnJldmlhdGVkIGNvdW50cy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIGZvcm1hdFJlc3BvbnNlVG9rZW5TdGF0cyhtb2RlbFRvdGFsczogcmVhZG9ubHkgSUNoYXRVc2FnZU1vZGVsVG90YWxbXSB8IHVuZGVmaW5lZCk6IHsgcmVhZG9ubHkgbWFya2Rvd246IE1hcmtkb3duU3RyaW5nOyByZWFkb25seSBtYXJrZG93bk5vdFN1cHBvcnRlZEZhbGxiYWNrOiBzdHJpbmc7IHJlYWRvbmx5IGFyaWFMYWJlbDogc3RyaW5nIH0gfCB1bmRlZmluZWQge1xuXHRpZiAoIW1vZGVsVG90YWxzPy5sZW5ndGgpIHtcblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Y29uc3QgdGl0bGUgPSBsb2NhbGl6ZSgnY2hhdC5yZXNwb25zZVRva2VuU3RhdHMudGl0bGUnLCBcIlRva2VucyB1c2VkIHRoaXMgdHVyblwiKTtcblx0Y29uc3QgbWFya2Rvd24gPSBuZXcgTWFya2Rvd25TdHJpbmcoKTtcblx0bWFya2Rvd24uYXBwZW5kTWFya2Rvd24oYCoqJHtlc2NhcGVNYXJrZG93blN5bnRheFRva2Vucyh0aXRsZSl9KipcXG5cXG5gKTtcblxuXHRjb25zdCBhcmlhUGFydHM6IHN0cmluZ1tdID0gW3RpdGxlXTtcblx0Zm9yIChjb25zdCB0b3RhbCBvZiBtb2RlbFRvdGFscykge1xuXHRcdC8vIENhY2hlZCB0b2tlbnMgYXJlIHRoZSBwb3J0aW9uIG9mIHRoZSBpbnB1dCBhIHByb3ZpZGVyIHNlcnZlZCBmcm9tIGNhY2hlOyBhXG5cdFx0Ly8gemVybyBpcyBub2lzZSByYXRoZXIgdGhhbiBpbmZvcm1hdGlvbiwgc28gaXQgZ2V0cyBpdHMgb3duIHNob3J0ZXIgcGhyYXNpbmcuXG5cdFx0Y29uc3QgbGluZSA9IHRvdGFsLmNhY2hlZFRva2VucyA+IDBcblx0XHRcdD8gbG9jYWxpemUoJ2NoYXQucmVzcG9uc2VUb2tlblN0YXRzLm1vZGVsTGluZUNhY2hlZCcsIFwiezB9IFx1MjAxNCB7MX0gaW4sIHsyfSBvdXQsIHszfSBjYWNoZWRcIixcblx0XHRcdFx0dG90YWwubW9kZWwsIGZvcm1hdFRva2VuQ291bnQodG90YWwuaW5wdXRUb2tlbnMpLCBmb3JtYXRUb2tlbkNvdW50KHRvdGFsLm91dHB1dFRva2VucyksIGZvcm1hdFRva2VuQ291bnQodG90YWwuY2FjaGVkVG9rZW5zKSlcblx0XHRcdDogbG9jYWxpemUoJ2NoYXQucmVzcG9uc2VUb2tlblN0YXRzLm1vZGVsTGluZScsIFwiezB9IFx1MjAxNCB7MX0gaW4sIHsyfSBvdXRcIixcblx0XHRcdFx0dG90YWwubW9kZWwsIGZvcm1hdFRva2VuQ291bnQodG90YWwuaW5wdXRUb2tlbnMpLCBmb3JtYXRUb2tlbkNvdW50KHRvdGFsLm91dHB1dFRva2VucykpO1xuXHRcdG1hcmtkb3duLmFwcGVuZE1hcmtkb3duKGAke2VzY2FwZU1hcmtkb3duU3ludGF4VG9rZW5zKGxpbmUpfVxcblxcbmApO1xuXG5cdFx0Ly8gU2NyZWVuIHJlYWRlcnMgZ2V0IGV4YWN0IGNvdW50cyBhbmQgc3BlbGxlZC1vdXQgdW5pdHM7IHRoZSB2aXNpYmxlIGxpbmVcblx0XHQvLyBhYmJyZXZpYXRlcyAoZS5nLiBcIjEyS1wiKSB0byBzdGF5IGNvbXBhY3QuXG5cdFx0YXJpYVBhcnRzLnB1c2godG90YWwuY2FjaGVkVG9rZW5zID4gMFxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5yZXNwb25zZVRva2VuU3RhdHMubW9kZWxBcmlhQ2FjaGVkJywgXCJ7MH06IHsxfSBpbnB1dCB0b2tlbnMsIHsyfSBvdXRwdXQgdG9rZW5zLCB7M30gY2FjaGVkIHRva2Vuc1wiLFxuXHRcdFx0XHR0b3RhbC5tb2RlbCwgdG90YWwuaW5wdXRUb2tlbnMsIHRvdGFsLm91dHB1dFRva2VucywgdG90YWwuY2FjaGVkVG9rZW5zKVxuXHRcdFx0OiBsb2NhbGl6ZSgnY2hhdC5yZXNwb25zZVRva2VuU3RhdHMubW9kZWxBcmlhJywgXCJ7MH06IHsxfSBpbnB1dCB0b2tlbnMsIHsyfSBvdXRwdXQgdG9rZW5zXCIsXG5cdFx0XHRcdHRvdGFsLm1vZGVsLCB0b3RhbC5pbnB1dFRva2VucywgdG90YWwub3V0cHV0VG9rZW5zKSk7XG5cdH1cblxuXHRjb25zdCBhcmlhTGFiZWwgPSBhcmlhUGFydHMuam9pbignLiAnKTtcblx0cmV0dXJuIHsgbWFya2Rvd24sIG1hcmtkb3duTm90U3VwcG9ydGVkRmFsbGJhY2s6IGFyaWFMYWJlbCwgYXJpYUxhYmVsIH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRDb2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlUGFydChwYXJ0OiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gKHBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiBwYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB8fCAhdG9vbEludm9jYXRpb25IYXNNY3BBcHBEYXRhKHBhcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KGNvbnRlbnQ6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQ+LCBmaW5hbFJlc3BvbnNlU3RhcnRJbmRleDogbnVtYmVyKTogbnVtYmVyIHtcblx0Zm9yIChsZXQgaW5kZXggPSAwOyBpbmRleCA8IGZpbmFsUmVzcG9uc2VTdGFydEluZGV4OyBpbmRleCsrKSB7XG5cdFx0aWYgKCFzaG91bGRDb2xsYXBzZUNvbXBsZXRlZFJlc3BvbnNlUGFydChjb250ZW50W2luZGV4XSkpIHtcblx0XHRcdHJldHVybiBpbmRleDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZpbmFsUmVzcG9uc2VTdGFydEluZGV4O1xufVxuXG4vKiogSG93IGEgZnJlc2hseSBtZWFzdXJlZCByb3cgaGVpZ2h0IHNob3VsZCBiZSByZWNvbmNpbGVkIGFnYWluc3QgdGhlIHRyZWUncyBrbm93biBoZWlnaHQuICovXG5leHBvcnQgdHlwZSBDaGF0SXRlbUhlaWdodFVwZGF0ZUtpbmQgPSAnbm9uZScgfCAnZmlyZScgfCAnc2NoZWR1bGVJbml0aWFsJyB8ICdkZWZlclJlTWVhc3VyZSc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgSUNoYXRJdGVtSGVpZ2h0VXBkYXRlIHtcblx0LyoqIFZhbHVlIHRvIHN0b3JlIGJhY2sgaW50byB0aGUgZWxlbWVudCdzIGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgLiAqL1xuXHRyZWFkb25seSBuZXh0UmVuZGVyZWRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZDtcblx0LyoqIFdoZXRoZXIvaG93IHRvIG5vdGlmeSB0aGUgdHJlZSBvZiB0aGUgbmV3IGhlaWdodC4gKi9cblx0cmVhZG9ubHkga2luZDogQ2hhdEl0ZW1IZWlnaHRVcGRhdGVLaW5kO1xuXHQvKiogVGhlIGhlaWdodCB0byBub3RpZnkgd2l0aCAobWVhbmluZ2Z1bCB3aGVuIGBraW5kYCBpcyBgZmlyZWAgb3IgYHNjaGVkdWxlSW5pdGlhbGApLiAqL1xuXHRyZWFkb25seSBoZWlnaHQ6IG51bWJlcjtcbn1cblxuLyoqXG4gKiBEZWNpZGUgaG93IGEgZnJlc2hseSBtZWFzdXJlZCwgbm9ybWFsaXplZCByb3cgaGVpZ2h0IHNob3VsZCBiZSByZWNvbmNpbGVkIGFnYWluc3QgdGhlIGhlaWdodFxuICogdGhlIHRyZWUgY3VycmVudGx5IGtub3dzIGFib3V0IChgY3VycmVudFJlbmRlcmVkSGVpZ2h0YCkuXG4gKlxuICogYGlzQmVpbmdSZW5kZXJlZGAgaXMgYHRydWVgIHdoZW4gdGhlIG1lYXN1cmVtZW50IGFycml2ZXMgKnN5bmNocm9ub3VzbHkqIGR1cmluZyB0aGUgdHJlZSdzXG4gKiBgcmVuZGVyRWxlbWVudGAgY2FsbDsgaW4gdGhhdCBjYXNlIHRoZSB0cmVlIG11c3Qgbm90IGJlIG5vdGlmaWVkIHJlLWVudHJhbnRseS5cbiAqXG4gKiBTZWUgaHR0cHM6Ly9naXRodWIuY29tL21pY3Jvc29mdC92c2NvZGUvaXNzdWVzLzMyNjk1Mjogd2hlbiBub3RpZmljYXRpb24gaXMgc3VwcHJlc3NlZCxcbiAqIGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgIG11c3QgcmVtYWluIHVuY2hhbmdlZCBzbyBhbiBpZGVudGljYWwgZGVmZXJyZWQgbWVhc3VyZW1lbnQgaXMgbm90XG4gKiBkZWR1cGxpY2F0ZWQgYmVmb3JlIGl0IHJlYWNoZXMgdGhlIHRyZWUuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZWNvbmNpbGVDaGF0SXRlbUhlaWdodChcblx0bm9ybWFsaXplZEhlaWdodDogbnVtYmVyLFxuXHRjdXJyZW50UmVuZGVyZWRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCxcblx0aXNCZWluZ1JlbmRlcmVkOiBib29sZWFuLFxuXHRhbGxvY2F0ZWRIZWlnaHQ6IG51bWJlciB8IHVuZGVmaW5lZCxcbik6IElDaGF0SXRlbUhlaWdodFVwZGF0ZSB7XG5cdGlmIChub3JtYWxpemVkSGVpZ2h0ID09PSBjdXJyZW50UmVuZGVyZWRIZWlnaHQpIHtcblx0XHRyZXR1cm4geyBuZXh0UmVuZGVyZWRIZWlnaHQ6IGN1cnJlbnRSZW5kZXJlZEhlaWdodCwga2luZDogJ25vbmUnLCBoZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQgfTtcblx0fVxuXG5cdGlmIChpc0JlaW5nUmVuZGVyZWQpIHtcblx0XHQvLyBTdXBwcmVzcyB0aGUgcmUtZW50cmFudCBub3RpZmljYXRpb24gYW5kIERPIE5PVCBhZHZhbmNlIGBjdXJyZW50UmVuZGVyZWRIZWlnaHRgICh0aGUgdHJlZVxuXHRcdC8vIHdhcyBuZXZlciB0b2xkKS4gU2NoZWR1bGUgYSBkZWZlcnJlZCByZS1tZWFzdXJlIHNvIHRoZSBoZWlnaHQgcmVhY2hlcyB0aGUgdHJlZSBvbmNlIHRoaXNcblx0XHQvLyByb3cgaXMgZG9uZSByZW5kZXJpbmcsIGluc3RlYWQgb2YgcmVseWluZyBvbiBhIGxhdGVyIGFzeW5jIG1lYXN1cmVtZW50IHRoYXQgY291bGQgYmVcblx0XHQvLyBkZWR1cGVkIGJ5IHRoZSBcInVuY2hhbmdlZFwiIGNoZWNrIGFib3ZlLlxuXHRcdHJldHVybiB7IG5leHRSZW5kZXJlZEhlaWdodDogY3VycmVudFJlbmRlcmVkSGVpZ2h0LCBraW5kOiAnZGVmZXJSZU1lYXN1cmUnLCBoZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQgfTtcblx0fVxuXG5cdGlmICh0eXBlb2YgY3VycmVudFJlbmRlcmVkSGVpZ2h0ID09PSAnbnVtYmVyJykge1xuXHRcdHJldHVybiB7IG5leHRSZW5kZXJlZEhlaWdodDogbm9ybWFsaXplZEhlaWdodCwga2luZDogJ2ZpcmUnLCBoZWlnaHQ6IG5vcm1hbGl6ZWRIZWlnaHQgfTtcblx0fVxuXG5cdC8vIEZpcnN0IG1lYXN1cmVtZW50cyB0aGF0IGFscmVhZHkgZml0IGFyZSBqdXN0IGluaXRpYWxpemF0aW9uLiBPbmx5IHNjaGVkdWxlIGEgZmlyc3QgdXBkYXRlXG5cdC8vIHdoZW4gdGhlIHJvdyB3b3VsZCBvdGhlcndpc2UgY2xpcCBuZXdseSByZW5kZXJlZCBjb250ZW50LlxuXHRpZiAoIXNob3VsZFNjaGVkdWxlSW5pdGlhbEhlaWdodENoYW5nZShub3JtYWxpemVkSGVpZ2h0LCBhbGxvY2F0ZWRIZWlnaHQpKSB7XG5cdFx0cmV0dXJuIHsgbmV4dFJlbmRlcmVkSGVpZ2h0OiBub3JtYWxpemVkSGVpZ2h0LCBraW5kOiAnbm9uZScsIGhlaWdodDogbm9ybWFsaXplZEhlaWdodCB9O1xuXHR9XG5cblx0cmV0dXJuIHsgbmV4dFJlbmRlcmVkSGVpZ2h0OiBub3JtYWxpemVkSGVpZ2h0LCBraW5kOiAnc2NoZWR1bGVJbml0aWFsJywgaGVpZ2h0OiBub3JtYWxpemVkSGVpZ2h0IH07XG59XG5cbi8qKlxuICogUmVuZGVycyB0aGUgcmVzcG9uc2UgZm9vdGVyOiBjb21wbGV0aW9uIHRpbWVzdGFtcCBhbmQgdGhlIG1vZGVsL2NyZWRpdHMgc3RhdC5cbiAqIGB0b2tlblN0YXRzQXJpYUxhYmVsYCBpcyBmb2xkZWQgaW50byB0aGUgY29udGFpbmVyJ3MgYWNjZXNzaWJsZSBuYW1lIHNvIHRoZVxuICogdG9rZW4gYnJlYWtkb3duIG9mZmVyZWQgb24gaG92ZXIgaXMgYWxzbyBhdmFpbGFibGUgdG8gc2NyZWVuIHJlYWRlcnMuXG4gKi9cbmV4cG9ydCBmdW5jdGlvbiByZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKGNvbnRhaW5lcjogSFRNTEVsZW1lbnQsIGRldGFpbHM6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29tcGxldGVkQXQ6IG51bWJlciB8IHVuZGVmaW5lZCwgZWxhcHNlZE1zOiBudW1iZXIgfCB1bmRlZmluZWQsIHZlcmJvc2U6IGJvb2xlYW4sIHRva2VuU3RhdHNBcmlhTGFiZWw/OiBzdHJpbmcpOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCB7XG5cdGRvbS5jbGVhck5vZGUoY29udGFpbmVyKTtcblx0Y29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVzcG9uc2UtZmxpcC1hY3RpdmUnLCAnY2hhdC1yZXNwb25zZS1mbGlwLWRvd24nLCAnY2hhdC1yZXNwb25zZS1mbGlwLXJlc2V0Jyk7XG5cblx0Y29uc3QgY29tcGxldGlvbiA9IHZlcmJvc2UgPyBmb3JtYXRDaGF0UmVxdWVzdFRpbWVzdGFtcChjb21wbGV0ZWRBdCkgOiB1bmRlZmluZWQ7XG5cdGNvbnN0IGVsYXBzZWQgPSBjb21wbGV0aW9uID8gZm9ybWF0Q2hhdFJlc3BvbnNlRWxhcHNlZFRpbWUoZWxhcHNlZE1zKSA6IHVuZGVmaW5lZDtcblx0Y29uc3QgYWx0ZXJuYXRlID0gY29tcGxldGlvbj8uaXNSZWxhdGl2ZVxuXHRcdD8gZm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscyhlbGFwc2VkLCBjb21wbGV0aW9uLmZ1bGxUZXh0KVxuXHRcdDogZWxhcHNlZDtcblx0Y29uc3QgcmVzcG9uc2VEZXRhaWxzID0gZm9ybWF0Q2hhdFJlc3BvbnNlRGV0YWlscyhkZXRhaWxzLCBjb21wbGV0aW9uPy50ZXh0KTtcblxuXHRsZXQgY29tcGxldGVkQXRFbGVtZW50OiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZDtcblx0aWYgKGNvbXBsZXRpb24pIHtcblx0XHRjb25zdCB0aW1pbmcgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LXJlc3BvbnNlLXRpbWluZycpKTtcblx0XHRjb21wbGV0ZWRBdEVsZW1lbnQgPSBkb20uYXBwZW5kKHRpbWluZywgJCgndGltZS5jaGF0LXJlc3BvbnNlLWNvbXBsZXRlZC1hdCcsIHsgZGF0ZXRpbWU6IGNvbXBsZXRpb24uZGF0ZVRpbWUgfSwgY29tcGxldGlvbi50ZXh0KSk7XG5cdFx0aWYgKGFsdGVybmF0ZSkge1xuXHRcdFx0ZG9tLmFwcGVuZCh0aW1pbmcsICQoJ3NwYW4uY2hhdC1yZXNwb25zZS1hbHRlcm5hdGUnLCB1bmRlZmluZWQsIGFsdGVybmF0ZSkpO1xuXHRcdH1cblx0XHR0aW1pbmcuY2xhc3NMaXN0LnRvZ2dsZSgnaGFzLWFsdGVybmF0ZScsICEhYWx0ZXJuYXRlKTtcblx0fVxuXHRpZiAoY29tcGxldGlvbiAmJiBkZXRhaWxzKSB7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uY2hhdC1yZXNwb25zZS1kZXRhaWxzLXNlcGFyYXRvcicsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0sICdcXHUyMDIyJykpO1xuXHR9XG5cdGlmIChkZXRhaWxzKSB7XG5cdFx0ZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3NwYW4uY2hhdC1yZXNwb25zZS1tb2RlbC1kZXRhaWxzJywgdW5kZWZpbmVkLCBkZXRhaWxzKSk7XG5cdH1cblxuXHRjb25zdCBhY2Nlc3NpYmxlVGltaW5nID0gY29tcGxldGlvblxuXHRcdD8gbG9jYWxpemUoJ2NoYXRSZXNwb25zZUNvbXBsZXRlZEF0JywgXCJDb21wbGV0ZWQgezB9XCIsIGNvbXBsZXRpb24uZnVsbFRleHQpXG5cdFx0OiB1bmRlZmluZWQ7XG5cdGNvbnN0IGFjY2Vzc2libGVFbGFwc2VkID0gZWxhcHNlZFxuXHRcdD8gbG9jYWxpemUoJ2NoYXRSZXNwb25zZUVsYXBzZWQnLCBcIkVsYXBzZWQgdGltZSB7MH1cIiwgZWxhcHNlZClcblx0XHQ6IHVuZGVmaW5lZDtcblx0Y29udGFpbmVyLmFyaWFMYWJlbCA9IFthY2Nlc3NpYmxlVGltaW5nLCBhY2Nlc3NpYmxlRWxhcHNlZCwgZGV0YWlscywgdG9rZW5TdGF0c0FyaWFMYWJlbF0uZmlsdGVyKEJvb2xlYW4pLmpvaW4oJywgJyk7XG5cdGNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAhcmVzcG9uc2VEZXRhaWxzKTtcblx0Y29udGFpbmVyLnRhYkluZGV4ID0gcmVzcG9uc2VEZXRhaWxzID8gMCA6IC0xO1xuXHRyZXR1cm4gY29tcGxldGVkQXRFbGVtZW50O1xufVxuXG5leHBvcnQgZnVuY3Rpb24gcmVuZGVyQ2hhdFJlcXVlc3RUaW1lc3RhbXAoY29udGFpbmVyOiBIVE1MRWxlbWVudCwgdGltZXN0YW1wOiBudW1iZXIgfCB1bmRlZmluZWQpOiB7IHJlYWRvbmx5IGVsZW1lbnQ6IEhUTUxFbGVtZW50OyByZWFkb25seSBob3ZlclRleHQ/OiBzdHJpbmcgfSB8IHVuZGVmaW5lZCB7XG5cdGNvbnN0IGZvcm1hdHRlZCA9IGZvcm1hdENoYXRSZXF1ZXN0VGltZXN0YW1wKHRpbWVzdGFtcCk7XG5cdGlmICghZm9ybWF0dGVkKSB7XG5cdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0fVxuXG5cdGlmICghZm9ybWF0dGVkLmlzUmVsYXRpdmUpIHtcblx0XHRjb25zdCBlbGVtZW50ID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJ3RpbWUuY2hhdC1yZXF1ZXN0LXRpbWVzdGFtcCcsIHtcblx0XHRcdGRhdGV0aW1lOiBmb3JtYXR0ZWQuZGF0ZVRpbWUsXG5cdFx0XHQnYXJpYS1sYWJlbCc6IGxvY2FsaXplKCdjaGF0UmVxdWVzdFNlbnRBdCcsIFwiU2VudCB7MH1cIiwgZm9ybWF0dGVkLmZ1bGxUZXh0KSxcblx0XHRcdHRhYmluZGV4OiAwLFxuXHRcdH0sIGZvcm1hdHRlZC50ZXh0KSk7XG5cdFx0cmV0dXJuIHsgZWxlbWVudCwgaG92ZXJUZXh0OiBmb3JtYXR0ZWQuZnVsbFRleHQgfTtcblx0fVxuXG5cdGNvbnN0IGVsZW1lbnQgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LXJlcXVlc3QtdGltZXN0YW1wJywge1xuXHRcdCdhcmlhLWxhYmVsJzogbG9jYWxpemUoJ2NoYXRSZXF1ZXN0U2VudEF0JywgXCJTZW50IHswfVwiLCBmb3JtYXR0ZWQuZnVsbFRleHQpLFxuXHRcdHRhYmluZGV4OiAwLFxuXHR9KSk7XG5cdGNvbnN0IHRpbWluZyA9IGRvbS5hcHBlbmQoZWxlbWVudCwgJCgnc3Bhbi5jaGF0LXJlcXVlc3QtdGltaW5nLmhhcy1hbHRlcm5hdGUnKSk7XG5cdGRvbS5hcHBlbmQodGltaW5nLCAkKCd0aW1lLmNoYXQtcmVxdWVzdC1yZWxhdGl2ZScsIHsgZGF0ZXRpbWU6IGZvcm1hdHRlZC5kYXRlVGltZSB9LCBmb3JtYXR0ZWQudGV4dCkpO1xuXHRkb20uYXBwZW5kKHRpbWluZywgJCgndGltZS5jaGF0LXJlcXVlc3QtZnVsbC1kYXRlJywgeyBkYXRldGltZTogZm9ybWF0dGVkLmRhdGVUaW1lIH0sIGZvcm1hdHRlZC5mdWxsVGV4dCkpO1xuXHRyZXR1cm4geyBlbGVtZW50IH07XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBzaG91bGRSZW5kZXJJbml0aWFsUHJvZ3Jlc3NpdmVDb250ZW50SW1tZWRpYXRlbHkoaXNDb21wbGV0ZTogYm9vbGVhbiwgaGFzTWFya2Rvd25QYXJ0czogYm9vbGVhbiwgaGFzUmVuZGVyRGF0YTogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRyZXR1cm4gIWlzQ29tcGxldGUgJiYgaGFzTWFya2Rvd25QYXJ0cyAmJiAhaGFzUmVuZGVyRGF0YTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFN0YXJ0TmV3Q29sbGFwc2VkVGhpbmtpbmdHcm91cChkaXNwbGF5TW9kZTogVGhpbmtpbmdEaXNwbGF5TW9kZSwgZXhpc3RpbmdHcm91cDogJ3JlYXNvbmluZycgfCAnaXRlbXMnLCBpbmNvbWluZ0dyb3VwOiAncmVhc29uaW5nJyB8ICdpdGVtcycpOiBib29sZWFuIHtcblx0cmV0dXJuIGRpc3BsYXlNb2RlID09PSBUaGlua2luZ0Rpc3BsYXlNb2RlLkNvbGxhcHNlZCAmJiBleGlzdGluZ0dyb3VwICE9PSBpbmNvbWluZ0dyb3VwO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkQ3JlYXRlR3JvdXBlZFRoaW5raW5nUGFydChjb2xsYXBzZWRUb29sc01vZGU6IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUsIHNlcGFyYXRlZEZyb21SZWFzb25pbmc6IGJvb2xlYW4pOiBib29sZWFuIHtcblx0cmV0dXJuIGNvbGxhcHNlZFRvb2xzTW9kZSA9PT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5BbHdheXMgfHwgc2VwYXJhdGVkRnJvbVJlYXNvbmluZztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNob3dGaWxlQ2hhbmdlc1N1bW1hcnlGb3JTZXR0aW5ncyhpc0NvbXBsZXRlOiBib29sZWFuLCBpc0xvY2FsU2Vzc2lvbjogYm9vbGVhbiwgc2hvd0ZpbGVDaGFuZ2VzOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiBpc0NvbXBsZXRlICYmIGlzTG9jYWxTZXNzaW9uICYmIHNob3dGaWxlQ2hhbmdlcztcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFNob3dQaWxsc1N1bW1hcnlGb3JTZXR0aW5ncyhpc0NvbXBsZXRlOiBib29sZWFuLCBpc0FnZW50SG9zdFNlc3Npb246IGJvb2xlYW4sIHR1cm5TdGF0dXNQaWxsczogQ2hhdFR1cm5TdGF0dXNQaWxsc1NldHRpbmcgfCB1bmRlZmluZWQpOiBib29sZWFuIHtcblx0cmV0dXJuIGlzQ29tcGxldGUgJiYgaXNBZ2VudEhvc3RTZXNzaW9uICYmIGlzQ2hhdFR1cm5TdGF0dXNQaWxsc0VuYWJsZWQodHVyblN0YXR1c1BpbGxzKTtcbn1cblxuZXhwb3J0IGZ1bmN0aW9uIHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhzdGF0ZTogSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQsIGhhc0NvbmZpcm1hdGlvbk1lc3NhZ2VzOiBib29sZWFuLCBoYXNNY3BBcHBEYXRhOiBib29sZWFuKTogYm9vbGVhbiB7XG5cdHJldHVybiAhaGFzTWNwQXBwRGF0YVxuXHRcdCYmIHN0YXRlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uXG5cdFx0JiYgc3RhdGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWxcblx0XHQmJiBzdGF0ZSAhPT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckF1dGhlbnRpY2F0aW9uXG5cdFx0JiYgIWhhc0NvbmZpcm1hdGlvbk1lc3NhZ2VzO1xufVxuXG5mdW5jdGlvbiB0b29sSW52b2NhdGlvbkhhc01jcEFwcERhdGEodG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2lucHV0JyAmJiAhIXRvb2xJbnZvY2F0aW9uLnRvb2xTcGVjaWZpY0RhdGEubWNwQXBwRGF0YTtcbn1cblxuZnVuY3Rpb24gaXNHZW5lcmF0ZWRJbWFnZVJlc3VsdE93bmVyKHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsIGNvbnRlbnQ6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQ+KTogYm9vbGVhbiB7XG5cdGZvciAobGV0IGluZGV4ID0gY29udGVudC5sZW5ndGggLSAxOyBpbmRleCA+PSAwOyBpbmRleC0tKSB7XG5cdFx0Y29uc3QgcGFydCA9IGNvbnRlbnRbaW5kZXhdO1xuXHRcdGlmICgocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIHBhcnQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2dlbmVyYXRlZEltYWdlJykge1xuXHRcdFx0cmV0dXJuIHBhcnQudG9vbENhbGxJZCA9PT0gdG9vbEludm9jYXRpb24udG9vbENhbGxJZDtcblx0XHR9XG5cdH1cblx0cmV0dXJuIGZhbHNlO1xufVxuXG5jb25zdCBmb3JjZVZlcmJvc2VMYXlvdXRUcmFjaW5nID0gZmFsc2Vcblx0Ly8gfHwgQm9vbGVhbihcIlRSVUVcIikgLy8gY2F1c2VzIGEgbGludGVyIHdhcm5pbmcgc28gdGhhdCBpdCBjYW5ub3QgYmUgcHVzaGVkXG5cdDtcblxuZXhwb3J0IGludGVyZmFjZSBJQ2hhdFJlbmRlcmVyRGVsZWdhdGUge1xuXHRjb250YWluZXI6IEhUTUxFbGVtZW50O1xuXHRnZXRMaXN0TGVuZ3RoKCk6IG51bWJlcjtcblx0Y3VycmVudENoYXRNb2RlKCk6IENoYXRNb2RlS2luZDtcblxuXHRyZWFkb25seSBvbkRpZFNjcm9sbD86IEV2ZW50PFNjcm9sbEV2ZW50Pjtcbn1cblxuY29uc3QgbW9zdFJlY2VudFJlc3BvbnNlQ2xhc3NOYW1lID0gJ2NoYXQtbW9zdC1yZWNlbnQtcmVzcG9uc2UnO1xuXG5leHBvcnQgZnVuY3Rpb24gc2hvdWxkSGlkZUNoYXRVc2VySWRlbnRpdHkodXNlcm5hbWU6IHN0cmluZywgc2Vzc2lvblJlc291cmNlOiBVUkksIGlzUmVzcG9uc2U6IGJvb2xlYW4sIGlzU2Vzc2lvbnNXaW5kb3c6IGJvb2xlYW4sIGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRjb25zdCBzZXNzaW9uVHlwZSA9IGdldENoYXRTZXNzaW9uVHlwZShzZXNzaW9uUmVzb3VyY2UpO1xuXHRyZXR1cm4gdXNlcm5hbWUgPT09IENPUElMT1RfVVNFUk5BTUUgfHxcblx0XHQoaXNSZXNwb25zZSAmJiBpc0FnZW50SG9zdENvcGlsb3RTZXNzaW9uVHlwZShzZXNzaW9uVHlwZSkpIHx8XG5cdFx0aXNTZXNzaW9uc1dpbmRvdyB8fFxuXHRcdGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdDtcbn1cblxuZnVuY3Rpb24gaXNBZ2VudEhvc3RDb3BpbG90U2Vzc2lvblR5cGUoc2Vzc2lvblR5cGU6IHN0cmluZyk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gc2Vzc2lvblR5cGUgPT09IEFnZW50U2Vzc2lvblByb3ZpZGVycy5BZ2VudEhvc3RDb3BpbG90IHx8XG5cdFx0cGFyc2VSZW1vdGVBZ2VudEhvc3RTZXNzaW9uVHlwZUF1dGhvcml0eShzZXNzaW9uVHlwZSwgU2Vzc2lvblR5cGUuQ29waWxvdENMSSkgIT09IHVuZGVmaW5lZDtcbn1cblxuZnVuY3Rpb24gdXB2b3RlQW5pbWF0aW9uU2V0dGluZ1RvRW51bSh2YWx1ZTogc3RyaW5nIHwgdW5kZWZpbmVkKTogQ2xpY2tBbmltYXRpb24gfCB1bmRlZmluZWQge1xuXHRzd2l0Y2ggKHZhbHVlKSB7XG5cdFx0Y2FzZSAnY29uZmV0dGknOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uQ29uZmV0dGk7XG5cdFx0Y2FzZSAnZmxvYXRpbmdUaHVtYnMnOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uRmxvYXRpbmdJY29ucztcblx0XHRjYXNlICdwdWxzZVdhdmUnOiByZXR1cm4gQ2xpY2tBbmltYXRpb24uUHVsc2VXYXZlO1xuXHRcdGNhc2UgJ3JhZGlhbnRMaW5lcyc6IHJldHVybiBDbGlja0FuaW1hdGlvbi5SYWRpYW50TGluZXM7XG5cdFx0ZGVmYXVsdDogcmV0dXJuIHVuZGVmaW5lZDtcblx0fVxufVxuXG5leHBvcnQgY2xhc3MgQ2hhdExpc3RJdGVtUmVuZGVyZXIgZXh0ZW5kcyBEaXNwb3NhYmxlIGltcGxlbWVudHMgSVRyZWVSZW5kZXJlcjxDaGF0VHJlZUl0ZW0sIEZ1enp5U2NvcmUsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4ge1xuXHRzdGF0aWMgcmVhZG9ubHkgSUQgPSAnaXRlbSc7XG5cblx0cHJpdmF0ZSByZWFkb25seSBjb2RlQmxvY2tzQnlSZXNwb25zZUlkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0Q29kZUJsb2NrSW5mb1tdPigpO1xuXHRwcml2YXRlIHJlYWRvbmx5IGNvZGVCbG9ja3NCeUVkaXRvclVyaSA9IG5ldyBSZXNvdXJjZU1hcDxJQ2hhdENvZGVCbG9ja0luZm8+KCk7XG5cblx0cHJpdmF0ZSByZWFkb25seSBmaWxlVHJlZXNCeVJlc3BvbnNlSWQgPSBuZXcgTWFwPHN0cmluZywgSUNoYXRGaWxlVHJlZUluZm9bXT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSBmb2N1c2VkRmlsZVRyZWVzQnlSZXNwb25zZUlkID0gbmV3IE1hcDxzdHJpbmcsIG51bWJlcj4oKTtcblxuXHRwcml2YXRlIHJlYWRvbmx5IHRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSByZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkID0gbmV3IE1hcDxzdHJpbmcsIElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB0ZW1wbGF0ZURhdGFCeVJvdyA9IG5ldyBXZWFrTWFwPEhUTUxFbGVtZW50LCBJQ2hhdExpc3RJdGVtVGVtcGxhdGU+KCk7XG5cblx0LyoqIFRyYWNrIHBlbmRpbmcgcXVlc3Rpb24gY2Fyb3VzZWxzIGJ5IHNlc3Npb24gcmVzb3VyY2UgZm9yIGF1dG8tc2tpcCBvbiBjaGF0IHN1Ym1pc3Npb24gKi9cblx0cHJpdmF0ZSByZWFkb25seSBwZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMgPSBuZXcgUmVzb3VyY2VNYXA8U2V0PENoYXRRdWVzdGlvbkNhcm91c2VsUGFydD4+KCk7XG5cdHByaXZhdGUgcmVhZG9ubHkgX25vdGlmaWVkUXVlc3Rpb25DYXJvdXNlbHMgPSBuZXcgU2V0PHN0cmluZz4oKTtcblx0cHJpdmF0ZSByZWFkb25seSB3b3JraW5nUHJvZ3Jlc3NDb25maXJtYXRpb25FbmRMaXN0ZW5lcnMgPSBuZXcgV2Vha1NldDxJQ2hhdFRvb2xJbnZvY2F0aW9uPigpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyOiBJTWFya2Rvd25SZW5kZXJlcjtcblx0cHJpdmF0ZSByZWFkb25seSBtYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXI6IENoYXRNYXJrZG93bkRlY29yYXRpb25zUmVuZGVyZXI7XG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDbGlja0ZvbGxvd3VwID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRGb2xsb3d1cD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tGb2xsb3d1cDogRXZlbnQ8SUNoYXRGb2xsb3d1cD4gPSB0aGlzLl9vbkRpZENsaWNrRm9sbG93dXAuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWRDbGlja1JlcnVuV2l0aEFnZW50T3JDb21tYW5kRGV0ZWN0aW9uID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8eyByZWFkb25seSBzZXNzaW9uUmVzb3VyY2U6IFVSSTsgcmVhZG9ubHkgcmVxdWVzdElkOiBzdHJpbmcgfT4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkQ2xpY2tSZXJ1bldpdGhBZ2VudE9yQ29tbWFuZERldGVjdGlvbiA9IHRoaXMuX29uRGlkQ2xpY2tSZXJ1bldpdGhBZ2VudE9yQ29tbWFuZERldGVjdGlvbi5ldmVudDtcblxuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkQ2xpY2tSZXF1ZXN0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRDbGlja1JlcXVlc3Q6IEV2ZW50PElDaGF0TGlzdEl0ZW1UZW1wbGF0ZT4gPSB0aGlzLl9vbkRpZENsaWNrUmVxdWVzdC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFJlcmVuZGVyID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWRSZXJlbmRlcjogRXZlbnQ8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPiA9IHRoaXMuX29uRGlkUmVyZW5kZXIuZXZlbnQ7XG5cblx0cHJpdmF0ZSByZWFkb25seSBfb25EaWREaXNwb3NlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUNoYXRMaXN0SXRlbVRlbXBsYXRlPigpKTtcblx0cmVhZG9ubHkgb25EaWREaXNwb3NlOiBFdmVudDxJQ2hhdExpc3RJdGVtVGVtcGxhdGU+ID0gdGhpcy5fb25EaWREaXNwb3NlLmV2ZW50O1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX29uRGlkRm9jdXNPdXRzaWRlID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8dm9pZD4oKSk7XG5cdHJlYWRvbmx5IG9uRGlkRm9jdXNPdXRzaWRlOiBFdmVudDx2b2lkPiA9IHRoaXMuX29uRGlkRm9jdXNPdXRzaWRlLmV2ZW50O1xuXG5cdHByb3RlY3RlZCByZWFkb25seSBfb25EaWRDaGFuZ2VJdGVtSGVpZ2h0ID0gdGhpcy5fcmVnaXN0ZXIobmV3IEVtaXR0ZXI8SUl0ZW1IZWlnaHRDaGFuZ2VQYXJhbXM+KCkpO1xuXHRyZWFkb25seSBvbkRpZENoYW5nZUl0ZW1IZWlnaHQ6IEV2ZW50PElJdGVtSGVpZ2h0Q2hhbmdlUGFyYW1zPiA9IHRoaXMuX29uRGlkQ2hhbmdlSXRlbUhlaWdodC5ldmVudDtcblxuXHRwcml2YXRlIHJlYWRvbmx5IF9vbkRpZFVwZGF0ZVZpZXdNb2RlbCA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPHZvaWQ+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2VkaXRvclBvb2w6IEVkaXRvclBvb2w7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3Rvb2xFZGl0b3JQb29sOiBFZGl0b3JQb29sO1xuXHRwcml2YXRlIHJlYWRvbmx5IF9kaWZmRWRpdG9yUG9vbDogRGlmZkVkaXRvclBvb2w7XG5cdHByaXZhdGUgcmVhZG9ubHkgX3RyZWVQb29sOiBUcmVlUG9vbDtcblx0cHJpdmF0ZSByZWFkb25seSBfY29udGVudFJlZmVyZW5jZXNMaXN0UG9vbDogQ29sbGFwc2libGVMaXN0UG9vbDtcblxuXHRwcml2YXRlIF9jdXJyZW50TGF5b3V0V2lkdGggPSBvYnNlcnZhYmxlVmFsdWUodGhpcywgMCk7XG5cdHByaXZhdGUgX2lzVmlzaWJsZSA9IHRydWU7XG5cdHByaXZhdGUgX2VsZW1lbnRCZWluZ1JlbmRlcmVkOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQ7XG5cdHByaXZhdGUgX29uRGlkQ2hhbmdlVmlzaWJpbGl0eSA9IHRoaXMuX3JlZ2lzdGVyKG5ldyBFbWl0dGVyPGJvb2xlYW4+KCkpO1xuXG5cdHByaXZhdGUgcmVhZG9ubHkgX2lubGluZVRleHRNb2RlbHM6IElubGluZVRleHRNb2RlbENvbGxlY3Rpb247XG5cblx0LyoqIFdoZXRoZXIgd2UgaGF2ZSBhbHJlYWR5IGxvZ2dlZCB0aGUgaW5jcmVtZW50YWwtcmVuZGVyaW5nIHRlbGVtZXRyeSBldmVudCBmb3IgdGhpcyByZW5kZXJlciBpbnN0YW5jZS4gKi9cblx0cHJpdmF0ZSBfaW5jcmVtZW50YWxSZW5kZXJpbmdUZWxlbWV0cnlMb2dnZWQgPSBmYWxzZTtcblxuXHQvKipcblx0ICogUHJldmVudHMgcmUtYW5ub3VuY2VtZW50IG9mIGFscmVhZHkgcmVuZGVyZWQgY2hhdCBwcm9ncmVzc1xuXHQgKiBieSBzY3JlZW4gcmVhZGVyc1xuXHQgKi9cblx0cHJpdmF0ZSByZWFkb25seSBfYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyA9IG5ldyBTZXQ8c3RyaW5nPigpO1xuXG5cdGNvbnN0cnVjdG9yKFxuXHRcdGVkaXRvck9wdGlvbnM6IENoYXRFZGl0b3JPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVuZGVyZXJPcHRpb25zOiBJQ2hhdExpc3RJdGVtUmVuZGVyZXJPcHRpb25zLFxuXHRcdHByaXZhdGUgcmVhZG9ubHkgZGVsZWdhdGU6IElDaGF0UmVuZGVyZXJEZWxlZ2F0ZSxcblx0XHRvdmVyZmxvd1dpZGdldHNEb21Ob2RlOiBIVE1MRWxlbWVudCB8IHVuZGVmaW5lZCxcblx0XHRwcml2YXRlIHZpZXdNb2RlbDogSUNoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQsXG5cdFx0QElJbnN0YW50aWF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGluc3RhbnRpYXRpb25TZXJ2aWNlOiBJSW5zdGFudGlhdGlvblNlcnZpY2UsXG5cdFx0QElDb25maWd1cmF0aW9uU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGNvbmZpZ1NlcnZpY2U6IElDb25maWd1cmF0aW9uU2VydmljZSxcblx0XHRASUxvZ1NlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBsb2dTZXJ2aWNlOiBJTG9nU2VydmljZSxcblx0XHRASUNvbnRleHRLZXlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29udGV4dEtleVNlcnZpY2U6IElDb250ZXh0S2V5U2VydmljZSxcblx0XHRASVRoZW1lU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IHRoZW1lU2VydmljZTogSVRoZW1lU2VydmljZSxcblx0XHRASUNvbW1hbmRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY29tbWFuZFNlcnZpY2U6IElDb21tYW5kU2VydmljZSxcblx0XHRASUhvdmVyU2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGhvdmVyU2VydmljZTogSUhvdmVyU2VydmljZSxcblx0XHRASUNoYXRXaWRnZXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFdpZGdldFNlcnZpY2U6IElDaGF0V2lkZ2V0U2VydmljZSxcblx0XHRASUNoYXRFbnRpdGxlbWVudFNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSBjaGF0RW50aXRsZW1lbnRTZXJ2aWNlOiBJQ2hhdEVudGl0bGVtZW50U2VydmljZSxcblx0XHRASUNoYXRTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgY2hhdFNlcnZpY2U6IElDaGF0U2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNpZ25hbFNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2lnbmFsU2VydmljZSxcblx0XHRASUFjY2Vzc2liaWxpdHlTZXJ2aWNlIHByaXZhdGUgcmVhZG9ubHkgYWNjZXNzaWJpbGl0eVNlcnZpY2U6IElBY2Nlc3NpYmlsaXR5U2VydmljZSxcblx0XHRASVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSBwcml2YXRlIHJlYWRvbmx5IGVudmlyb25tZW50U2VydmljZTogSVdvcmtiZW5jaEVudmlyb25tZW50U2VydmljZSxcblx0XHRASVRlbGVtZXRyeVNlcnZpY2UgcHJpdmF0ZSByZWFkb25seSB0ZWxlbWV0cnlTZXJ2aWNlOiBJVGVsZW1ldHJ5U2VydmljZSxcblx0KSB7XG5cdFx0c3VwZXIoKTtcblxuXHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdHRoaXMubWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyKSk7XG5cdFx0dGhpcy5fZWRpdG9yUG9vbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yUG9vbCwgZWRpdG9yT3B0aW9ucywgZGVsZWdhdGUsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRydWUpKTtcblx0XHR0aGlzLl90b29sRWRpdG9yUG9vbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRWRpdG9yUG9vbCwgZWRpdG9yT3B0aW9ucywgZGVsZWdhdGUsIG92ZXJmbG93V2lkZ2V0c0RvbU5vZGUsIHRydWUpKTtcblx0XHR0aGlzLl9kaWZmRWRpdG9yUG9vbCA9IHRoaXMuX3JlZ2lzdGVyKHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoRGlmZkVkaXRvclBvb2wsIGVkaXRvck9wdGlvbnMsIGRlbGVnYXRlLCBvdmVyZmxvd1dpZGdldHNEb21Ob2RlLCB0cnVlKSk7XG5cdFx0dGhpcy5fdHJlZVBvb2wgPSB0aGlzLl9yZWdpc3Rlcih0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFRyZWVQb29sLCB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQpKTtcblx0XHR0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDb2xsYXBzaWJsZUxpc3RQb29sLCB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkKSk7XG5cblx0XHR0aGlzLl9pbmxpbmVUZXh0TW9kZWxzID0gdGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShJbmxpbmVUZXh0TW9kZWxDb2xsZWN0aW9uKSk7XG5cdFx0dGhpcy5fcmVnaXN0ZXIodGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29kZUJsb2NrQ29udGVudFByb3ZpZGVyKSk7XG5cdFx0Ly8gQXV0by1za2lwIHBlbmRpbmcgcXVlc3Rpb24gY2Fyb3VzZWxzIHdoZW4gdXNlciBzdWJtaXRzIGEgbmV3IGNoYXQgbWVzc2FnZVxuXHRcdHRoaXMuX3JlZ2lzdGVyKHRoaXMuY2hhdFNlcnZpY2Uub25EaWRTdWJtaXRSZXF1ZXN0KGUgPT4ge1xuXHRcdFx0Y29uc3QgY2Fyb3VzZWxzID0gdGhpcy5wZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMuZ2V0KGUuY2hhdFNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAoY2Fyb3VzZWxzKSB7XG5cdFx0XHRcdGZvciAoY29uc3QgY2Fyb3VzZWwgb2YgY2Fyb3VzZWxzKSB7XG5cdFx0XHRcdFx0Y2Fyb3VzZWwuc2tpcCgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNhcm91c2Vscy5jbGVhcigpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdC8vIEF1dG8tc2tpcCBhbGwgcGVuZGluZyBxdWVzdGlvbiBjYXJvdXNlbHMgd2hlbiBhdXRvLXJlcGx5IGlzIGVuYWJsZWQgbWlkLXNlc3Npb25cblx0XHR0aGlzLl9yZWdpc3Rlcih0aGlzLmNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5KSAmJiB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uQXV0b1JlcGx5KSkge1xuXHRcdFx0XHRmb3IgKGNvbnN0IFssIGNhcm91c2Vsc10gb2YgdGhpcy5wZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMpIHtcblx0XHRcdFx0XHRmb3IgKGNvbnN0IGNhcm91c2VsIG9mIGNhcm91c2Vscykge1xuXHRcdFx0XHRcdFx0Y2Fyb3VzZWwuc2tpcCgpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjYXJvdXNlbHMuY2xlYXIoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pKTtcblx0fVxuXG5cdHByaXZhdGUgX3BlbmRpbmdEcmFnQ29udHJvbGxlcjogQ2hhdFBlbmRpbmdEcmFnQ29udHJvbGxlciB8IHVuZGVmaW5lZDtcblxuXHRzZXQgcGVuZGluZ0RyYWdDb250cm9sbGVyKGNvbnRyb2xsZXI6IENoYXRQZW5kaW5nRHJhZ0NvbnRyb2xsZXIpIHtcblx0XHR0aGlzLl9wZW5kaW5nRHJhZ0NvbnRyb2xsZXIgPSBjb250cm9sbGVyO1xuXHR9XG5cblx0cHVibGljIHVwZGF0ZU9wdGlvbnMob3B0aW9uczogSUNoYXRMaXN0SXRlbVJlbmRlcmVyT3B0aW9ucyk6IHZvaWQge1xuXHRcdHRoaXMucmVuZGVyZXJPcHRpb25zID0geyAuLi50aGlzLnJlbmRlcmVyT3B0aW9ucywgLi4ub3B0aW9ucyB9O1xuXHR9XG5cblx0Z2V0IHRlbXBsYXRlSWQoKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ2hhdExpc3RJdGVtUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRlZGl0b3JzSW5Vc2UoKTogSXRlcmFibGU8Q29kZUJsb2NrUGFydD4ge1xuXHRcdHJldHVybiBJdGVyYWJsZS5jb25jYXQodGhpcy5fZWRpdG9yUG9vbC5pblVzZSgpLCB0aGlzLl90b29sRWRpdG9yUG9vbC5pblVzZSgpKTtcblx0fVxuXG5cblxuXHRwcml2YXRlIHRyYWNlTGF5b3V0KG1ldGhvZDogc3RyaW5nLCBtZXNzYWdlOiBzdHJpbmcpIHtcblx0XHRpZiAoZm9yY2VWZXJib3NlTGF5b3V0VHJhY2luZykge1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmluZm8oYENoYXRMaXN0SXRlbVJlbmRlcmVyIyR7bWV0aG9kfTogJHttZXNzYWdlfWApO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoYXRMaXN0SXRlbVJlbmRlcmVyIyR7bWV0aG9kfTogJHttZXNzYWdlfWApO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGU6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgbWVhc3VyZWRIZWlnaHQ/OiBudW1iZXIpOiB2b2lkIHtcblx0XHRpZiAoIXRlbXBsYXRlLmN1cnJlbnRFbGVtZW50IHx8ICF0ZW1wbGF0ZS5yb3dDb250YWluZXIuaXNDb25uZWN0ZWQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBoZWlnaHQgPSBtZWFzdXJlZEhlaWdodCA/PyB0ZW1wbGF0ZS5yb3dDb250YWluZXIuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCkuaGVpZ2h0O1xuXHRcdGlmIChoZWlnaHQgPT09IDAgfHwgIWhlaWdodCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG5vcm1hbGl6ZWRIZWlnaHQgPSBNYXRoLmNlaWwoaGVpZ2h0KTtcblx0XHRjb25zdCBlbGVtZW50ID0gdGVtcGxhdGUuY3VycmVudEVsZW1lbnQ7XG5cdFx0Y29uc3QgdXBkYXRlID0gcmVjb25jaWxlQ2hhdEl0ZW1IZWlnaHQoXG5cdFx0XHRub3JtYWxpemVkSGVpZ2h0LFxuXHRcdFx0ZWxlbWVudC5jdXJyZW50UmVuZGVyZWRIZWlnaHQsXG5cdFx0XHRlbGVtZW50ID09PSB0aGlzLl9lbGVtZW50QmVpbmdSZW5kZXJlZCxcblx0XHRcdHRlbXBsYXRlLmFsbG9jYXRlZEhlaWdodCxcblx0XHQpO1xuXHRcdGVsZW1lbnQuY3VycmVudFJlbmRlcmVkSGVpZ2h0ID0gdXBkYXRlLm5leHRSZW5kZXJlZEhlaWdodDtcblxuXHRcdGlmICh1cGRhdGUua2luZCA9PT0gJ2ZpcmUnKSB7XG5cdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZmlyZSh7IGVsZW1lbnQsIGhlaWdodDogdXBkYXRlLmhlaWdodCB9KTtcblx0XHR9IGVsc2UgaWYgKHVwZGF0ZS5raW5kID09PSAnc2NoZWR1bGVJbml0aWFsJykge1xuXHRcdFx0Y29uc3Qgc2NoZWR1bGVkSGVpZ2h0ID0gdXBkYXRlLmhlaWdodDtcblx0XHRcdGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGVtcGxhdGUucm93Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGVtcGxhdGUuY3VycmVudEVsZW1lbnQgIT09IGVsZW1lbnQgfHwgZWxlbWVudC5jdXJyZW50UmVuZGVyZWRIZWlnaHQgIT09IHNjaGVkdWxlZEhlaWdodCkge1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fVxuXHRcdFx0XHR0aGlzLl9vbkRpZENoYW5nZUl0ZW1IZWlnaHQuZmlyZSh7IGVsZW1lbnQsIGhlaWdodDogc2NoZWR1bGVkSGVpZ2h0IH0pO1xuXHRcdFx0fSk7XG5cdFx0fSBlbHNlIGlmICh1cGRhdGUua2luZCA9PT0gJ2RlZmVyUmVNZWFzdXJlJykge1xuXHRcdFx0Ly8gVGhlIG1lYXN1cmVtZW50IGFycml2ZWQgc3luY2hyb25vdXNseSBkdXJpbmcgdGhpcyByb3cncyByZW5kZXIuIFJlLW1lYXN1cmUgb24gdGhlXG5cdFx0XHQvLyBuZXh0IGZyYW1lIChvbmNlIHRoZSByZW5kZXIgcGFzcyBpcyBvdmVyKSBzbyB0aGUgZ3Jvd24gaGVpZ2h0IHJlbGlhYmx5IHJlYWNoZXMgdGhlXG5cdFx0XHQvLyB0cmVlIHdpdGhvdXQgYSByZS1lbnRyYW50IG5vdGlmaWNhdGlvbi5cblx0XHRcdGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3codGVtcGxhdGUucm93Q29udGFpbmVyKSwgKCkgPT4ge1xuXHRcdFx0XHRpZiAodGVtcGxhdGUuY3VycmVudEVsZW1lbnQgPT09IGVsZW1lbnQgJiYgZWxlbWVudCAhPT0gdGhpcy5fZWxlbWVudEJlaW5nUmVuZGVyZWQpIHtcblx0XHRcdFx0XHR0aGlzLmZpcmVJdGVtSGVpZ2h0Q2hhbmdlKHRlbXBsYXRlKTtcblx0XHRcdFx0fVxuXHRcdFx0fSk7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIENvbXB1dGUgYSByYXRlIHRvIHJlbmRlciBhdCBpbiB3b3Jkcy9zLlxuXHQgKi9cblx0cHJpdmF0ZSBnZXRQcm9ncmVzc2l2ZVJlbmRlclJhdGUoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IG51bWJlciB7XG5cdFx0Y29uc3QgZW51bSBSYXRlIHtcblx0XHRcdE1pbiA9IDQwLFxuXHRcdFx0TWF4ID0gMjAwMCxcblx0XHR9XG5cblx0XHRjb25zdCBtaW5BZnRlckNvbXBsZXRlID0gODA7XG5cblx0XHRjb25zdCByYXRlID0gZWxlbWVudC5jb250ZW50VXBkYXRlVGltaW5ncz8uaW1wbGllZFdvcmRMb2FkUmF0ZTtcblx0XHRpZiAoZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRpZiAodHlwZW9mIHJhdGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRcdHJldHVybiBjbGFtcChyYXRlLCBtaW5BZnRlckNvbXBsZXRlLCBSYXRlLk1heCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRyZXR1cm4gbWluQWZ0ZXJDb21wbGV0ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAodHlwZW9mIHJhdGUgPT09ICdudW1iZXInKSB7XG5cdFx0XHRyZXR1cm4gY2xhbXAocmF0ZSwgUmF0ZS5NaW4sIFJhdGUuTWF4KTtcblx0XHR9XG5cblx0XHRyZXR1cm4gODtcblx0fVxuXG5cdGdldENvZGVCbG9ja0luZm9zRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdENvZGVCbG9ja0luZm9bXSB7XG5cdFx0Y29uc3QgY29kZUJsb2NrcyA9IHRoaXMuY29kZUJsb2Nrc0J5UmVzcG9uc2VJZC5nZXQocmVzcG9uc2UuaWQpO1xuXHRcdHJldHVybiBjb2RlQmxvY2tzID8/IFtdO1xuXHR9XG5cblx0dXBkYXRlVmlld01vZGVsKHZpZXdNb2RlbDogSUNoYXRWaWV3TW9kZWwgfCB1bmRlZmluZWQpOiB2b2lkIHtcblx0XHR0aGlzLnZpZXdNb2RlbCA9IHZpZXdNb2RlbDtcblx0XHR0aGlzLl9hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLmNsZWFyKCk7XG5cdFx0dGhpcy5fbm90aWZpZWRRdWVzdGlvbkNhcm91c2Vscy5jbGVhcigpO1xuXHRcdHRoaXMuY29kZUJsb2Nrc0J5RWRpdG9yVXJpLmNsZWFyKCk7XG5cdFx0dGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLmNsZWFyKCk7XG5cdFx0dGhpcy5maWxlVHJlZXNCeVJlc3BvbnNlSWQuY2xlYXIoKTtcblx0XHR0aGlzLmZvY3VzZWRGaWxlVHJlZXNCeVJlc3BvbnNlSWQuY2xlYXIoKTtcblx0XHR0aGlzLnJlc3BvbnNlVGVtcGxhdGVEYXRhQnlSZXF1ZXN0SWQuY2xlYXIoKTtcblx0XHR0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmNsZWFyKCk7XG5cblx0XHQvLyBGaXJlIHRoZSB2aWV3TW9kZWwgdXBkYXRlIGZpcnN0IHNvIHRlbXBsYXRlIGxpc3RlbmVycyBjYW4gZGlzcG9zZVxuXHRcdC8vIHRoZWlyIHJlbmRlcmVkIGNvbnRlbnQgcGFydHMgYW5kIHJlbGVhc2UgcG9vbCBpdGVtcyBiYWNrLiBPbmx5IHRoZW5cblx0XHQvLyBjbGVhciB0aGUgcG9vbHMgc28gYWxsIHJlbGVhc2VkIGl0ZW1zIGFyZSBjYXVnaHQuXG5cdFx0dGhpcy5fb25EaWRVcGRhdGVWaWV3TW9kZWwuZmlyZSgpO1xuXHRcdHRoaXMuX2VkaXRvclBvb2wuY2xlYXIoKTtcblx0XHR0aGlzLl90b29sRWRpdG9yUG9vbC5jbGVhcigpO1xuXHRcdHRoaXMuX2RpZmZFZGl0b3JQb29sLmNsZWFyKCk7XG5cdFx0dGhpcy5fdHJlZVBvb2wuY2xlYXIoKTtcblx0XHR0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLmNsZWFyKCk7XG5cdH1cblxuXHRnZXRDb2RlQmxvY2tJbmZvRm9yRWRpdG9yKHVyaTogVVJJKTogSUNoYXRDb2RlQmxvY2tJbmZvIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5jb2RlQmxvY2tzQnlFZGl0b3JVcmkuZ2V0KHVyaSk7XG5cdH1cblxuXHRnZXRGaWxlVHJlZUluZm9zRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdEZpbGVUcmVlSW5mb1tdIHtcblx0XHRjb25zdCBmaWxlVHJlZXMgPSB0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5nZXQocmVzcG9uc2UuaWQpO1xuXHRcdHJldHVybiBmaWxlVHJlZXMgPz8gW107XG5cdH1cblxuXHRnZXRMYXN0Rm9jdXNlZEZpbGVUcmVlRm9yUmVzcG9uc2UocmVzcG9uc2U6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdEZpbGVUcmVlSW5mbyB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgZmlsZVRyZWVzID0gdGhpcy5maWxlVHJlZXNCeVJlc3BvbnNlSWQuZ2V0KHJlc3BvbnNlLmlkKTtcblx0XHRjb25zdCBsYXN0Rm9jdXNlZEZpbGVUcmVlSW5kZXggPSB0aGlzLmZvY3VzZWRGaWxlVHJlZXNCeVJlc3BvbnNlSWQuZ2V0KHJlc3BvbnNlLmlkKTtcblx0XHRpZiAoZmlsZVRyZWVzPy5sZW5ndGggJiYgbGFzdEZvY3VzZWRGaWxlVHJlZUluZGV4ICE9PSB1bmRlZmluZWQgJiYgbGFzdEZvY3VzZWRGaWxlVHJlZUluZGV4IDwgZmlsZVRyZWVzLmxlbmd0aCkge1xuXHRcdFx0cmV0dXJuIGZpbGVUcmVlc1tsYXN0Rm9jdXNlZEZpbGVUcmVlSW5kZXhdO1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0Z2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKHJlcXVlc3RJZD86IHN0cmluZyk6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKCFyZXF1ZXN0SWQpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdGNvbnN0IHRlbXBsYXRlRGF0YSA9IHRoaXMudGVtcGxhdGVEYXRhQnlSZXF1ZXN0SWQuZ2V0KHJlcXVlc3RJZCk7XG5cdFx0aWYgKHRlbXBsYXRlRGF0YSAmJiB0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQ/LmlkID09PSByZXF1ZXN0SWQpIHtcblx0XHRcdHJldHVybiB0ZW1wbGF0ZURhdGE7XG5cdFx0fVxuXHRcdGlmICh0ZW1wbGF0ZURhdGEpIHtcblx0XHRcdHRoaXMudGVtcGxhdGVEYXRhQnlSZXF1ZXN0SWQuZGVsZXRlKHJlcXVlc3RJZCk7XG5cdFx0fVxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRzZXRWaXNpYmxlKHZpc2libGU6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHR0aGlzLl9pc1Zpc2libGUgPSB2aXNpYmxlO1xuXHRcdHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5maXJlKHZpc2libGUpO1xuXHR9XG5cblx0bGF5b3V0KHdpZHRoOiBudW1iZXIpOiB2b2lkIHtcblx0XHRjb25zdCBuZXdXaWR0aCA9IHdpZHRoIC0gKHRoaXMucmVuZGVyZXJPcHRpb25zLmNvbnRlbnRIb3Jpem9udGFsUGFkZGluZyA/PyBERUZBVUxUX0NIQVRfSVRFTV9IT1JJWk9OVEFMX1BBRERJTkcpO1xuXHRcdGlmIChuZXdXaWR0aCAhPT0gdGhpcy5fY3VycmVudExheW91dFdpZHRoLmdldCgpKSB7XG5cdFx0XHR0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguc2V0KG5ld1dpZHRoLCB1bmRlZmluZWQpO1xuXHRcdFx0Zm9yIChjb25zdCBlZGl0b3Igb2YgdGhpcy5fZWRpdG9yUG9vbC5pblVzZSgpKSB7XG5cdFx0XHRcdGVkaXRvci5sYXlvdXQobmV3V2lkdGgpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCB0b29sRWRpdG9yIG9mIHRoaXMuX3Rvb2xFZGl0b3JQb29sLmluVXNlKCkpIHtcblx0XHRcdFx0dG9vbEVkaXRvci5sYXlvdXQobmV3V2lkdGgpO1xuXHRcdFx0fVxuXHRcdFx0Zm9yIChjb25zdCBkaWZmRWRpdG9yIG9mIHRoaXMuX2RpZmZFZGl0b3JQb29sLmluVXNlKCkpIHtcblx0XHRcdFx0ZGlmZkVkaXRvci5sYXlvdXQobmV3V2lkdGgpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBjdXJyZW50bHkgcmVuZGVyZWQgY2hhdCBpdGVtIGNvbnRhaW5pbmcgdGhlIG5vZGUuXG5cdCAqL1xuXHRnZXRFbGVtZW50RnJvbU5vZGUobm9kZTogSFRNTEVsZW1lbnQpOiBDaGF0VHJlZUl0ZW0gfCB1bmRlZmluZWQge1xuXHRcdGxldCBjdXJyZW50OiBIVE1MRWxlbWVudCB8IG51bGwgPSBub2RlO1xuXHRcdHdoaWxlIChjdXJyZW50ICYmIHRoaXMuZGVsZWdhdGUuY29udGFpbmVyLmNvbnRhaW5zKGN1cnJlbnQpKSB7XG5cdFx0XHRjb25zdCBlbGVtZW50ID0gdGhpcy50ZW1wbGF0ZURhdGFCeVJvdy5nZXQoY3VycmVudCk/LmN1cnJlbnRFbGVtZW50O1xuXHRcdFx0aWYgKGVsZW1lbnQpIHtcblx0XHRcdFx0cmV0dXJuIGVsZW1lbnQ7XG5cdFx0XHR9XG5cdFx0XHRjdXJyZW50ID0gY3VycmVudC5wYXJlbnRFbGVtZW50O1xuXHRcdH1cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cmVuZGVyVGVtcGxhdGUoY29udGFpbmVyOiBIVE1MRWxlbWVudCk6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSB7XG5cdFx0Y29uc3QgdGVtcGxhdGVEaXNwb3NhYmxlcyA9IG5ldyBEaXNwb3NhYmxlU3RvcmUoKTtcblx0XHRjb25zdCBkaXNhYmxlZE92ZXJsYXkgPSBkb20uYXBwZW5kKGNvbnRhaW5lciwgJCgnLmNoYXQtcm93LWRpc2FibGVkLW92ZXJsYXknKSk7XG5cdFx0Y29uc3Qgcm93Q29udGFpbmVyID0gZG9tLmFwcGVuZChjb250YWluZXIsICQoJy5pbnRlcmFjdGl2ZS1pdGVtLWNvbnRhaW5lcicpKTtcblx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdjb21wYWN0Jykge1xuXHRcdFx0cm93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ2ludGVyYWN0aXZlLWl0ZW0tY29tcGFjdCcpO1xuXHRcdH1cblxuXHRcdGxldCBoZWFkZXJQYXJlbnQgPSByb3dDb250YWluZXI7XG5cdFx0bGV0IHZhbHVlUGFyZW50ID0gcm93Q29udGFpbmVyO1xuXHRcdGxldCBkZXRhaWxDb250YWluZXJQYXJlbnQ6IEhUTUxFbGVtZW50IHwgdW5kZWZpbmVkO1xuXG5cdFx0aWYgKHRoaXMucmVuZGVyZXJPcHRpb25zLnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcpIHtcblx0XHRcdHJvd0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdpbnRlcmFjdGl2ZS1pdGVtLWNvbXBhY3QnKTtcblx0XHRcdHJvd0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdtaW5pbWFsJyk7XG5cdFx0XHQvLyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLVxuXHRcdFx0Ly8gIGljb24gfCBkZXRhaWxzXG5cdFx0XHQvLyAgICAgICB8IHJlZmVyZW5jZXNcblx0XHRcdC8vICAgICAgIHwgdmFsdWVcblx0XHRcdC8vIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG5cdFx0XHRjb25zdCBsaHNDb250YWluZXIgPSBkb20uYXBwZW5kKHJvd0NvbnRhaW5lciwgJCgnLmNvbHVtbi5sZWZ0JykpO1xuXHRcdFx0Y29uc3QgcmhzQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3dDb250YWluZXIsICQoJy5jb2x1bW4ucmlnaHQnKSk7XG5cblx0XHRcdGhlYWRlclBhcmVudCA9IGxoc0NvbnRhaW5lcjtcblx0XHRcdGRldGFpbENvbnRhaW5lclBhcmVudCA9IHJoc0NvbnRhaW5lcjtcblx0XHRcdHZhbHVlUGFyZW50ID0gcmhzQ29udGFpbmVyO1xuXHRcdH1cblxuXHRcdGNvbnN0IGhlYWRlciA9IGRvbS5hcHBlbmQoaGVhZGVyUGFyZW50LCAkKCcuaGVhZGVyJykpO1xuXHRcdGNvbnN0IGNvbnRleHRLZXlTZXJ2aWNlID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQodGhpcy5jb250ZXh0S2V5U2VydmljZS5jcmVhdGVTY29wZWQocm93Q29udGFpbmVyKSk7XG5cdFx0Y29uc3Qgc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUNoaWxkKG5ldyBTZXJ2aWNlQ29sbGVjdGlvbihbSUNvbnRleHRLZXlTZXJ2aWNlLCBjb250ZXh0S2V5U2VydmljZV0pKSk7XG5cblx0XHRjb25zdCByZXF1ZXN0SG92ZXIgPSBkb20uYXBwZW5kKHJvd0NvbnRhaW5lciwgJCgnLnJlcXVlc3QtaG92ZXInKSk7XG5cdFx0bGV0IHRpdGxlVG9vbGJhcjogTWVudVdvcmtiZW5jaFRvb2xCYXIgfCB1bmRlZmluZWQ7XG5cdFx0aWYgKHRoaXMucmVuZGVyZXJPcHRpb25zLm5vSGVhZGVyKSB7XG5cdFx0XHRoZWFkZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0fSBlbHNlIHtcblx0XHRcdHRpdGxlVG9vbGJhciA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHNjb3BlZEluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKE1lbnVXb3JrYmVuY2hUb29sQmFyLCByZXF1ZXN0SG92ZXIsIE1lbnVJZC5DaGF0TWVzc2FnZVRpdGxlLCB7XG5cdFx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdFx0c2hvdWxkRm9yd2FyZEFyZ3M6IHRydWVcblx0XHRcdFx0fSxcblx0XHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0XHRzaG91bGRJbmxpbmVTdWJtZW51OiBzdWJtZW51ID0+IHN1Ym1lbnUuYWN0aW9ucy5sZW5ndGggPD0gMVxuXHRcdFx0XHR9LFxuXHRcdFx0fSkpO1xuXHRcdH1cblx0XHR0aGlzLmhvdmVySGlkZGVuKHJlcXVlc3RIb3Zlcik7XG5cblx0XHRjb25zdCBjaGVja3BvaW50Q29udGFpbmVyID0gZG9tLmFwcGVuZChyb3dDb250YWluZXIsICQoJy5jaGVja3BvaW50LWNvbnRhaW5lcicpKTtcblx0XHRkb20uYXBwZW5kKGNoZWNrcG9pbnRDb250YWluZXIsICQoJy5jaGVja3BvaW50LWxpbmUtbGVmdCcpKTtcblxuXHRcdGNvbnN0IGNoZWNrcG9pbnRUb29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGNoZWNrcG9pbnRDb250YWluZXIsIE1lbnVJZC5DaGF0TWVzc2FnZUNoZWNrcG9pbnQsIHtcblx0XHRcdGFjdGlvblZpZXdJdGVtUHJvdmlkZXI6IChhY3Rpb24sIG9wdGlvbnMpID0+IHtcblx0XHRcdFx0aWYgKGFjdGlvbiBpbnN0YW5jZW9mIE1lbnVJdGVtQWN0aW9uKSB7XG5cdFx0XHRcdFx0aWYgKGFjdGlvbi5pdGVtLmlkID09PSBSZXN0b3JlQ2hlY2twb2ludEFjdGlvbklkIHx8IGFjdGlvbi5pdGVtLmlkID09PSBTdGFydE92ZXJBY3Rpb25JZCkge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXNTdGFydE92ZXIgPSBhY3Rpb24uaXRlbS5pZCA9PT0gU3RhcnRPdmVyQWN0aW9uSWQ7XG5cdFx0XHRcdFx0XHRjb25zdCBjYW5jZWxMYWJlbCA9IGlzU3RhcnRPdmVyXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3RhcnRPdmVyLmNhbmNlbFRvb2x0aXAnLCBcIkNhbmNlbCBzdGFydGluZyBvdmVyXCIpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucmVzdG9yZUNoZWNrcG9pbnQuY2FuY2VsVG9vbHRpcCcsIFwiQ2FuY2VsIHJlc3RvcmluZyB0aGlzIGNoZWNrcG9pbnRcIik7XG5cdFx0XHRcdFx0XHRjb25zdCBjb25maXJtVG9vbHRpcCA9IGlzU3RhcnRPdmVyXG5cdFx0XHRcdFx0XHRcdD8gbG9jYWxpemUoJ2NoYXQuc3RhcnRPdmVyLmNvbmZpcm1Ub29sdGlwJywgXCJDb25maXJtIHN0YXJ0aW5nIG92ZXIgYW5kIGRpc2NhcmRpbmcgYWxsIGVkaXRzXCIpXG5cdFx0XHRcdFx0XHRcdDogbG9jYWxpemUoJ2NoYXQucmVzdG9yZUNoZWNrcG9pbnQuY29uZmlybVRvb2x0aXAnLCBcIkNvbmZpcm0gcmVzdG9yaW5nIHRoaXMgY2hlY2twb2ludCBhbmQgZGlzY2FyZGluZyBsYXRlciBlZGl0c1wiKTtcblx0XHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXN0b3JlQ2hlY2twb2ludEFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0sIChjb250ZXh0OiB1bmtub3duKSA9PiB0aGlzLmRpc2NhcmRFZGl0c0FjdGlvbk5lZWRzQ29uZmlybWF0aW9uKGNvbnRleHQpLCBjYW5jZWxMYWJlbCwgY29uZmlybVRvb2x0aXApO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRpZiAoYWN0aW9uLml0ZW0uaWQgPT09IEZvcmtDb252ZXJzYXRpb25BY3Rpb25JZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEZvcmtBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ29kaWNvbkFjdGlvblZpZXdJdGVtLCBhY3Rpb24sIHsgaG92ZXJEZWxlZ2F0ZTogb3B0aW9ucy5ob3ZlckRlbGVnYXRlIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9LFxuXHRcdFx0cmVuZGVyRHJvcGRvd25Bc0NoaWxkRWxlbWVudDogdHJ1ZSxcblx0XHRcdG1lbnVPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZEZvcndhcmRBcmdzOiB0cnVlXG5cdFx0XHR9LFxuXHRcdFx0dG9vbGJhck9wdGlvbnM6IHtcblx0XHRcdFx0c2hvdWxkSW5saW5lU3VibWVudTogc3VibWVudSA9PiBzdWJtZW51LmFjdGlvbnMubGVuZ3RoIDw9IDFcblx0XHRcdH0sXG5cdFx0fSkpO1xuXG5cdFx0ZG9tLmFwcGVuZChjaGVja3BvaW50Q29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1saW5lLXJpZ2h0JykpO1xuXG5cdFx0Y29uc3QgdXNlciA9IGRvbS5hcHBlbmQoaGVhZGVyLCAkKCcudXNlcicpKTtcblx0XHRjb25zdCBhdmF0YXJDb250YWluZXIgPSBkb20uYXBwZW5kKHVzZXIsICQoJy5hdmF0YXItY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IHVzZXJuYW1lID0gZG9tLmFwcGVuZCh1c2VyLCAkKCdoMy51c2VybmFtZScpKTtcblx0XHR1c2VybmFtZS50YWJJbmRleCA9IDA7XG5cdFx0Y29uc3QgZGV0YWlsQ29udGFpbmVyID0gZG9tLmFwcGVuZChkZXRhaWxDb250YWluZXJQYXJlbnQgPz8gdXNlciwgJCgnc3Bhbi5kZXRhaWwtY29udGFpbmVyJykpO1xuXHRcdGNvbnN0IGRldGFpbCA9IGRvbS5hcHBlbmQoZGV0YWlsQ29udGFpbmVyLCAkKCdzcGFuLmRldGFpbCcpKTtcblx0XHRkb20uYXBwZW5kKGRldGFpbENvbnRhaW5lciwgJCgnc3Bhbi5jaGF0LWFuaW1hdGVkLWVsbGlwc2lzJykpO1xuXHRcdGNvbnN0IHZhbHVlID0gZG9tLmFwcGVuZCh2YWx1ZVBhcmVudCwgJCgnLnZhbHVlJykpO1xuXHRcdGNvbnN0IHJlcXVlc3RUaW1lc3RhbXBDb250YWluZXIgPSBkb20uYXBwZW5kKHZhbHVlUGFyZW50LCAkKCcuY2hhdC1yZXF1ZXN0LXRpbWVzdGFtcC1jb250YWluZXInKSk7XG5cdFx0Y29uc3QgZWxlbWVudERpc3Bvc2FibGVzID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IERpc3Bvc2FibGVTdG9yZSgpKTtcblx0XHRjb25zdCBjb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlcyA9IHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKG5ldyBEaXNwb3NhYmxlU3RvcmUoKSk7XG5cdFx0Y29uc3QgcmVzcG9uc2VUb2tlblN0YXRzSG92ZXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChuZXcgTXV0YWJsZURpc3Bvc2FibGU8SU1hbmFnZWRIb3Zlcj4oKSk7XG5cblx0XHRjb25zdCBmb290ZXJUb29sYmFyQ29udGFpbmVyID0gZG9tLmFwcGVuZChyb3dDb250YWluZXIsICQoJy5jaGF0LWZvb3Rlci10b29sYmFyJykpO1xuXHRcdGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5ub0Zvb3Rlcikge1xuXHRcdFx0Zm9vdGVyVG9vbGJhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9XG5cblx0XHRjb25zdCBmb290ZXJUb29sYmFyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoTWVudVdvcmtiZW5jaFRvb2xCYXIsIGZvb3RlclRvb2xiYXJDb250YWluZXIsIE1lbnVJZC5DaGF0TWVzc2FnZUZvb3Rlciwge1xuXHRcdFx0bWVudU9wdGlvbnM6IHsgc2hvdWxkRm9yd2FyZEFyZ3M6IHRydWUsIHJlbmRlclNob3J0VGl0bGU6IHRydWUgfSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7IHNob3VsZElubGluZVN1Ym1lbnU6IHN1Ym1lbnUgPT4gc3VibWVudS5hY3Rpb25zLmxlbmd0aCA8PSAxIH0sXG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uOiBJQWN0aW9uLCBvcHRpb25zOiBJQWN0aW9uVmlld0l0ZW1PcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbiAmJiBhY3Rpb24uaXRlbS5pZCA9PT0gTWFya0hlbHBmdWxBY3Rpb25JZCkge1xuXHRcdFx0XHRcdGNvbnN0IGFuaW1hdGlvbiA9IHVwdm90ZUFuaW1hdGlvblNldHRpbmdUb0VudW0odGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQudXB2b3RlQW5pbWF0aW9uJykpO1xuXHRcdFx0XHRcdHJldHVybiBzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51RW50cnlBY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IC4uLm9wdGlvbnMsIG9uQ2xpY2tBbmltYXRpb246IGFuaW1hdGlvbiB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gY3JlYXRlQWN0aW9uVmlld0l0ZW0oc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsIGFjdGlvbiwgb3B0aW9ucyk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gSW5zZXJ0IHRoZSBkZXRhaWxzIGNvbnRhaW5lciBpbnRvIHRoZSB0b29sYmFyJ3MgaW50ZXJuYWwgZWxlbWVudCBzdHJ1Y3R1cmVcblx0XHRjb25zdCBmb290ZXJEZXRhaWxzQ29udGFpbmVyID0gZG9tLmFwcGVuZChmb290ZXJUb29sYmFyLmdldEVsZW1lbnQoKSwgJCgnLmNoYXQtZm9vdGVyLWRldGFpbHMnKSk7XG5cdFx0Zm9vdGVyRGV0YWlsc0NvbnRhaW5lci50YWJJbmRleCA9IDA7XG5cblx0XHRjb25zdCBjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciA9IGRvbS5hcHBlbmQocm93Q29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1yZXN0b3JlLWNvbnRhaW5lcicpKTtcblx0XHRkb20uYXBwZW5kKGNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLCAkKCcuY2hlY2twb2ludC1saW5lLWxlZnQnKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBkb20uYXBwZW5kKGNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLCAkKCdzcGFuLmNoZWNrcG9pbnQtbGFiZWwtdGV4dCcpKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdjaGVja3BvaW50UmVzdG9yZScsICdDaGVja3BvaW50IFJlc3RvcmVkJyk7XG5cdFx0Y29uc3QgZG90ID0gZG9tLmFwcGVuZChjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciwgJCgnc3Bhbi5jaGVja3BvaW50LWRvdC1zZXBhcmF0b3InKSk7XG5cdFx0ZG90LnRleHRDb250ZW50ID0gJ1xcdTAwQjcnO1xuXHRcdGRvdC5zZXRBdHRyaWJ1dGUoJ2FyaWEtaGlkZGVuJywgJ3RydWUnKTtcblx0XHRjb25zdCBjaGVja3BvaW50UmVzdG9yZVRvb2xiYXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZChzY29wZWRJbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShNZW51V29ya2JlbmNoVG9vbEJhciwgY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIsIE1lbnVJZC5DaGF0TWVzc2FnZVJlc3RvcmVDaGVja3BvaW50LCB7XG5cdFx0XHRhY3Rpb25WaWV3SXRlbVByb3ZpZGVyOiAoYWN0aW9uLCBvcHRpb25zKSA9PiB7XG5cdFx0XHRcdGlmIChhY3Rpb24gaW5zdGFuY2VvZiBNZW51SXRlbUFjdGlvbikge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENvZGljb25BY3Rpb25WaWV3SXRlbSwgYWN0aW9uLCB7IGhvdmVyRGVsZWdhdGU6IG9wdGlvbnMuaG92ZXJEZWxlZ2F0ZSB9KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdFx0fSxcblx0XHRcdHJlbmRlckRyb3Bkb3duQXNDaGlsZEVsZW1lbnQ6IHRydWUsXG5cdFx0XHRtZW51T3B0aW9uczoge1xuXHRcdFx0XHRzaG91bGRGb3J3YXJkQXJnczogdHJ1ZVxuXHRcdFx0fSxcblx0XHRcdHRvb2xiYXJPcHRpb25zOiB7XG5cdFx0XHRcdHNob3VsZElubGluZVN1Ym1lbnU6IHN1Ym1lbnUgPT4gc3VibWVudS5hY3Rpb25zLmxlbmd0aCA8PSAxXG5cdFx0XHR9LFxuXHRcdH0pKTtcblxuXHRcdGRvbS5hcHBlbmQoY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIsICQoJy5jaGVja3BvaW50LWxpbmUtcmlnaHQnKSk7XG5cblxuXHRcdGNvbnN0IGFnZW50SG92ZXIgPSB0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBZ2VudEhvdmVyKSk7XG5cdFx0Y29uc3QgaG92ZXJDb250ZW50ID0gKCkgPT4ge1xuXHRcdFx0aWYgKGlzUmVzcG9uc2VWTSh0ZW1wbGF0ZS5jdXJyZW50RWxlbWVudCkgJiYgdGVtcGxhdGUuY3VycmVudEVsZW1lbnQuYWdlbnQgJiYgIXRlbXBsYXRlLmN1cnJlbnRFbGVtZW50LmFnZW50LmlzRGVmYXVsdCkge1xuXHRcdFx0XHRhZ2VudEhvdmVyLnNldEFnZW50KHRlbXBsYXRlLmN1cnJlbnRFbGVtZW50LmFnZW50LmlkKTtcblx0XHRcdFx0cmV0dXJuIGFnZW50SG92ZXIuZG9tTm9kZTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9O1xuXHRcdGNvbnN0IGhvdmVyT3B0aW9ucyA9IGdldENoYXRBZ2VudEhvdmVyT3B0aW9ucygoKSA9PiBpc1Jlc3BvbnNlVk0odGVtcGxhdGUuY3VycmVudEVsZW1lbnQpID8gdGVtcGxhdGUuY3VycmVudEVsZW1lbnQuYWdlbnQgOiB1bmRlZmluZWQsIHRoaXMuY29tbWFuZFNlcnZpY2UpO1xuXHRcdHRlbXBsYXRlRGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHVzZXIsIGhvdmVyQ29udGVudCwgaG92ZXJPcHRpb25zKSk7XG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih1c2VyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdGNvbnN0IGV2ID0gbmV3IFN0YW5kYXJkS2V5Ym9hcmRFdmVudChlKTtcblx0XHRcdGlmIChldi5lcXVhbHMoS2V5Q29kZS5TcGFjZSkgfHwgZXYuZXF1YWxzKEtleUNvZGUuRW50ZXIpKSB7XG5cdFx0XHRcdGNvbnN0IGNvbnRlbnQgPSBob3ZlckNvbnRlbnQoKTtcblx0XHRcdFx0aWYgKGNvbnRlbnQpIHtcblx0XHRcdFx0XHR0aGlzLmhvdmVyU2VydmljZS5zaG93SW5zdGFudEhvdmVyKHsgY29udGVudCwgdGFyZ2V0OiB1c2VyLCB0cmFwRm9jdXM6IHRydWUsIGFjdGlvbnM6IGhvdmVyT3B0aW9ucy5hY3Rpb25zIH0sIHRydWUpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKGV2LmVxdWFscyhLZXlDb2RlLkVzY2FwZSkpIHtcblx0XHRcdFx0dGhpcy5ob3ZlclNlcnZpY2UuaGlkZUhvdmVyKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IGNvbm5lY3Rpb25PYnNlcnZlciA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ2Nvbm5lY3Rpb24tb2JzZXJ2ZXInKSBhcyBkb20uQ29ubmVjdGlvbk9ic2VydmVyRWxlbWVudDtcblx0XHRkb20uYXBwZW5kKGNvbnRhaW5lciwgY29ubmVjdGlvbk9ic2VydmVyKTtcblx0XHRjb25zdCB0ZW1wbGF0ZTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlID0geyBoZWFkZXIsIGF2YXRhckNvbnRhaW5lciwgcmVxdWVzdEhvdmVyLCB1c2VybmFtZSwgZGV0YWlsLCB2YWx1ZSwgcmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lciwgcm93Q29udGFpbmVyLCBlbGVtZW50RGlzcG9zYWJsZXMsIHRlbXBsYXRlRGlzcG9zYWJsZXMsIGNvbnRleHRLZXlTZXJ2aWNlLCBpbnN0YW50aWF0aW9uU2VydmljZTogc2NvcGVkSW5zdGFudGlhdGlvblNlcnZpY2UsIGFnZW50SG92ZXIsIHRpdGxlVG9vbGJhciwgZm9vdGVyVG9vbGJhciwgZm9vdGVyVG9vbGJhckNvbnRhaW5lciwgZm9vdGVyRGV0YWlsc0NvbnRhaW5lciwgZGlzYWJsZWRPdmVybGF5LCBjaGVja3BvaW50VG9vbGJhciwgY2hlY2twb2ludFJlc3RvcmVUb29sYmFyLCBjaGVja3BvaW50Q29udGFpbmVyLCBjaGVja3BvaW50UmVzdG9yZUNvbnRhaW5lciwgY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXMsIHJlc3BvbnNlVG9rZW5TdGF0c0hvdmVyIH07XG5cdFx0dGhpcy50ZW1wbGF0ZURhdGFCeVJvdy5zZXQocm93Q29udGFpbmVyLCB0ZW1wbGF0ZSk7XG5cblx0XHR0ZW1wbGF0ZURpc3Bvc2FibGVzLmFkZCh0aGlzLl9vbkRpZFVwZGF0ZVZpZXdNb2RlbC5ldmVudCgoKSA9PiB7XG5cdFx0XHRpZiAoIXRlbXBsYXRlLmN1cnJlbnRFbGVtZW50IHx8ICF0aGlzLnZpZXdNb2RlbD8uc2Vzc2lvblJlc291cmNlIHx8ICFpc0VxdWFsKHRlbXBsYXRlLmN1cnJlbnRFbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgdGhpcy52aWV3TW9kZWwuc2Vzc2lvblJlc291cmNlKSkge1xuXHRcdFx0XHR0aGlzLmNsZWFyUmVuZGVyZWRQYXJ0cyh0ZW1wbGF0ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0dGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihkaXNhYmxlZE92ZXJsYXksIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIGUgPT4ge1xuXHRcdFx0aWYgKCF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZykge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHRjb25zdCBjdXJyZW50ID0gdGVtcGxhdGUuY3VycmVudEVsZW1lbnQ7XG5cdFx0XHRpZiAoIWN1cnJlbnQgfHwgY3VycmVudC5pZCA9PT0gdGhpcy52aWV3TW9kZWwuZWRpdGluZy5pZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmIChkaXNhYmxlZE92ZXJsYXkuY2xhc3NMaXN0LmNvbnRhaW5zKCdkaXNhYmxlZCcpKSB7XG5cdFx0XHRcdGUucHJldmVudERlZmF1bHQoKTtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0dGhpcy5fb25EaWRGb2N1c091dHNpZGUuZmlyZSgpO1xuXHRcdFx0fVxuXHRcdH0pKTtcblxuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmVyID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IGRvbS5EaXNwb3NhYmxlUmVzaXplT2JzZXJ2ZXIoJ0NoYXRMaXN0SXRlbVJlbmRlcmVyLml0ZW1IZWlnaHQnLCAoZW50cmllcykgPT4ge1xuXHRcdFx0Y29uc3QgZW50cnkgPSBlbnRyaWVzWzBdO1xuXHRcdFx0aWYgKGVudHJ5KSB7XG5cdFx0XHRcdHRoaXMuZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGUsIGVudHJ5LmJvcmRlckJveFNpemUuYXQoMCk/LmJsb2NrU2l6ZSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXHRcdGNvbnN0IHJlc2l6ZU9ic2VydmF0aW9uID0gdGVtcGxhdGVEaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlPElEaXNwb3NhYmxlPigpKTtcblx0XHRjb25uZWN0aW9uT2JzZXJ2ZXIub25EaWRDb25uZWN0ID0gKCkgPT4ge1xuXHRcdFx0cmVzaXplT2JzZXJ2YXRpb24udmFsdWUgPSByZXNpemVPYnNlcnZlci5vYnNlcnZlKHJvd0NvbnRhaW5lcik7XG5cdFx0fTtcblx0XHRjb25uZWN0aW9uT2JzZXJ2ZXIub25EaWREaXNjb25uZWN0ID0gKCkgPT4ge1xuXHRcdFx0dGVtcGxhdGUucmVuZGVyZWRQYXJ0c01vdW50ZWQgPSBmYWxzZTtcblx0XHRcdHJlc2l6ZU9ic2VydmF0aW9uLmNsZWFyKCk7XG5cdFx0fTtcblx0XHRpZiAocm93Q29udGFpbmVyLmlzQ29ubmVjdGVkKSB7XG5cdFx0XHRjb25uZWN0aW9uT2JzZXJ2ZXIub25EaWRDb25uZWN0KCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRlbXBsYXRlO1xuXHR9XG5cblx0LyoqXG5cdCAqIERldGVybWluZXMgd2hldGhlciBhbiBhY3Rpb24gYXQgdGhlIGdpdmVuIGNoYXQgaXRlbSB3b3VsZCBkaXNjYXJkIGZpbGVcblx0ICogZWRpdHMgdGhhdCB0aGUgdXNlciBzaG91bGQgY29uZmlybSBpbi1wbGFjZS5cblx0ICovXG5cdHByaXZhdGUgZGlzY2FyZEVkaXRzQWN0aW9uTmVlZHNDb25maXJtYXRpb24oY29udGV4dDogdW5rbm93bik6IGJvb2xlYW4ge1xuXHRcdGlmICghaXNSZXF1ZXN0Vk0oY29udGV4dCkgJiYgIWlzUmVzcG9uc2VWTShjb250ZXh0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RJZCA9IGlzUmVxdWVzdFZNKGNvbnRleHQpID8gY29udGV4dC5pZCA6IGNvbnRleHQucmVxdWVzdElkO1xuXHRcdGNvbnN0IG1vZGVsID0gdGhpcy5jaGF0U2VydmljZS5nZXRTZXNzaW9uKGNvbnRleHQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRjb25zdCBzZXNzaW9uID0gbW9kZWw/LmVkaXRpbmdTZXNzaW9uO1xuXHRcdGlmICghbW9kZWwgfHwgIShzZXNzaW9uIGluc3RhbmNlb2YgQWdlbnRIb3N0U25hcHNob3RDb250cm9sbGVyKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlcXVlc3RzID0gbW9kZWwuZ2V0UmVxdWVzdHMoKTtcblx0XHRjb25zdCBpbmRleCA9IHJlcXVlc3RzLmZpbmRJbmRleChyZXF1ZXN0ID0+IHJlcXVlc3QuaWQgPT09IHJlcXVlc3RJZCk7XG5cdFx0aWYgKGluZGV4ID09PSAtMSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdHJldHVybiByZXF1ZXN0cy5zbGljZShpbmRleCkuc29tZShyZXF1ZXN0ID0+IHNlc3Npb24uaGFzRWRpdHNJblJlcXVlc3QocmVxdWVzdC5pZCkpO1xuXHR9XG5cblx0cmVuZGVyRWxlbWVudChub2RlOiBJVHJlZU5vZGU8Q2hhdFRyZWVJdGVtLCBGdXp6eVNjb3JlPiwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGRldGFpbHM/OiBJTGlzdEVsZW1lbnRSZW5kZXJEZXRhaWxzKTogdm9pZCB7XG5cdFx0dGVtcGxhdGVEYXRhLmFsbG9jYXRlZEhlaWdodCA9IGRldGFpbHM/LmhlaWdodDtcblx0XHR0aGlzLl9lbGVtZW50QmVpbmdSZW5kZXJlZCA9IG5vZGUuZWxlbWVudDtcblx0XHR0cnkge1xuXHRcdFx0dGhpcy5yZW5kZXJDaGF0VHJlZUl0ZW0obm9kZS5lbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0dGhpcy5fZWxlbWVudEJlaW5nUmVuZGVyZWQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHR9XG5cblx0LyoqXG5cdCAqIERpc3Bvc2UgdGhlIHJlbmRlcmVkIHBhcnRzIGluIHRoZSB0ZW1wbGF0ZSwgd2hpY2ggYXJlbid0IGRvbmUgaW4gZGlzcG9zZUVsZW1lbnRcblx0ICogc28gdGhleSBjYW4gYmUgcmV1c2VkIHdoZW4gYSBuZXcgcmVuZGVyIGlzIHN0YXJ0ZWQuXG5cdCAqL1xuXHRwcml2YXRlIGNsZWFyUmVuZGVyZWRQYXJ0cyh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRkaXNwb3NlKGNvYWxlc2NlKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA9IHVuZGVmaW5lZDtcblx0XHRcdHRlbXBsYXRlRGF0YS5yZW5kZXJlZENvbnRlbnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0fSBlbHNlIGlmIChpc1BlbmRpbmdEaXZpZGVyVk0odGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50KSkge1xuXHRcdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEudmFsdWUpO1xuXHRcdH1cblxuXHRcdHRlbXBsYXRlRGF0YS5tb3ZlZE91dFRvb2xQYXJ0cz8uZGlzcG9zZSgpO1xuXHRcdHRlbXBsYXRlRGF0YS5tb3ZlZE91dFRvb2xQYXJ0cyA9IHVuZGVmaW5lZDtcblxuXHRcdC8vIFRoaXMgdGVtcGxhdGUgaXRlbSBpcyBubyBsb25nZXIgaW4gdXNlLCBvciBoYXZpbmcgYW5vdGhlciBlbGVtZW50IHJlbmRlcmVkIGludG8gaXQsXG5cdFx0Ly8gY2xlYXIgdGhlIGNvbnRleHQgb24gdG9vbGJhcnMgc28gaXQgZG9lc24ndCByZXRhaW4gdGhlIHZpZXdtb2RlbC5cblx0XHRpZiAodGVtcGxhdGVEYXRhLnRpdGxlVG9vbGJhcikge1xuXHRcdFx0dGVtcGxhdGVEYXRhLnRpdGxlVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50VG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50UmVzdG9yZVRvb2xiYXIuY29udGV4dCA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZU9wZW4gPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlQ29sbGFwc2VFbmRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHR0ZW1wbGF0ZURhdGEud2FzUmVzcG9uc2VDb21wbGV0ZSA9IHVuZGVmaW5lZDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdFRyZWVJdGVtKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50ICYmIHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudC5pZCAhPT0gZWxlbWVudC5pZCkge1xuXHRcdFx0dGhpcy50cmFjZUxheW91dCgncmVuZGVyQ2hhdFRyZWVJdGVtJywgYFJlbmRlcmluZyBhIGRpZmZlcmVudCBlbGVtZW50IGludG8gdGhlIHRlbXBsYXRlLCBpbmRleD0ke2luZGV4fWApO1xuXHRcdFx0Y29uc3QgbWFwcGVkVGVtcGxhdGVEYXRhID0gdGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5nZXQodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmlkKTtcblx0XHRcdGlmIChtYXBwZWRUZW1wbGF0ZURhdGEgJiYgKG1hcHBlZFRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudD8uaWQgIT09IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudC5pZCkpIHtcblx0XHRcdFx0dGhpcy50ZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5kZWxldGUodGVtcGxhdGVEYXRhLmN1cnJlbnRFbGVtZW50LmlkKTtcblx0XHRcdH1cblxuXHRcdFx0dGhpcy5jbGVhclJlbmRlcmVkUGFydHModGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQgPSBlbGVtZW50O1xuXHRcdHRoaXMudGVtcGxhdGVEYXRhQnlSZXF1ZXN0SWQuc2V0KGVsZW1lbnQuaWQsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHQvLyBDbGVhciBwZW5kaW5nLXJlbGF0ZWQgY2xhc3NlcyBhbmQgZHJhZyBoYW5kbGUgZnJvbSBwcmV2aW91cyByZW5kZXJzXG5cdFx0Ly8gRG8gdGhpcyBiZWZvcmUgZWxlbWVudC10eXBlIGNoZWNrcyB0byBlbnN1cmUgZGl2aWRlcnMgYWxzbyBnZXQgY2xlYW5lZCB1cFxuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgncGVuZGluZy1pdGVtJywgJ3BlbmRpbmctZGl2aWRlcicsICdwZW5kaW5nLXJlcXVlc3QnLCAnY2hhdC1wZW5kaW5nLWRyYWdnaW5nJywgJ3Rlcm1pbmFsLWNvbW1hbmQtcmVxdWVzdCcpO1xuXHRcdHRlbXBsYXRlRGF0YS5kcmFnSGFuZGxlPy5yZW1vdmUoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZHJhZ0hhbmRsZSA9IHVuZGVmaW5lZDtcblx0XHRkZWxldGUgdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5kYXRhc2V0LnBlbmRpbmdSZXF1ZXN0SWQ7XG5cdFx0ZGVsZXRlIHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuZGF0YXNldC5wZW5kaW5nS2luZDtcblxuXHRcdC8vIEhhbmRsZSBwZW5kaW5nIGRpdmlkZXIgd2l0aCBzaW1wbGlmaWVkIHJlbmRlcmluZ1xuXHRcdGlmIChpc1BlbmRpbmdEaXZpZGVyVk0oZWxlbWVudCkpIHtcblx0XHRcdHRoaXMucmVuZGVyUGVuZGluZ0RpdmlkZXIoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBraW5kID0gaXNSZXF1ZXN0Vk0oZWxlbWVudCkgPyAncmVxdWVzdCcgOlxuXHRcdFx0aXNSZXNwb25zZVZNKGVsZW1lbnQpID8gJ3Jlc3BvbnNlJyA6XG5cdFx0XHRcdGlzUGVuZGluZ0RpdmlkZXJWTShlbGVtZW50KSA/ICdwZW5kaW5nRGl2aWRlcicgOlxuXHRcdFx0XHRcdCd3ZWxjb21lJztcblx0XHR0aGlzLnRyYWNlTGF5b3V0KCdyZW5kZXJFbGVtZW50JywgYCR7a2luZH0sIGluZGV4PSR7aW5kZXh9YCk7XG5cblx0XHRDaGF0Q29udGV4dEtleXMuaXNSZXNwb25zZS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNSZXNwb25zZVZNKGVsZW1lbnQpKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaXRlbUlkLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChlbGVtZW50LmlkKTtcblx0XHRDaGF0Q29udGV4dEtleXMuaXNSZXF1ZXN0LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1JlcXVlc3RWTShlbGVtZW50KSk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLmlzRmlyc3RSZXF1ZXN0LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1JlcXVlc3RWTShlbGVtZW50KSAmJiB0aGlzLnZpZXdNb2RlbD8ubW9kZWwuZ2V0UmVxdWVzdHMoKVswXT8uaWQgPT09IGVsZW1lbnQuaWQpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5pc1BlbmRpbmdSZXF1ZXN0LmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1JlcXVlc3RWTShlbGVtZW50KSAmJiAhIWVsZW1lbnQucGVuZGluZ0tpbmQpO1xuXHRcdENoYXRDb250ZXh0S2V5cy5yZXNwb25zZURldGVjdGVkQWdlbnRDb21tYW5kLmJpbmRUbyh0ZW1wbGF0ZURhdGEuY29udGV4dEtleVNlcnZpY2UpLnNldChpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5hZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQpO1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdENoYXRDb250ZXh0S2V5cy5yZXNwb25zZVN1cHBvcnRzSXNzdWVSZXBvcnRpbmcuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KCEhZWxlbWVudC5hZ2VudD8ubWV0YWRhdGEuc3VwcG9ydElzc3VlUmVwb3J0aW5nKTtcblx0XHRcdENoYXRDb250ZXh0S2V5cy5yZXNwb25zZVZvdGUuYmluZFRvKHRlbXBsYXRlRGF0YS5jb250ZXh0S2V5U2VydmljZSkuc2V0KGVsZW1lbnQudm90ZSA9PT0gQ2hhdEFnZW50Vm90ZURpcmVjdGlvbi5VcCA/ICd1cCcgOiBlbGVtZW50LnZvdGUgPT09IENoYXRBZ2VudFZvdGVEaXJlY3Rpb24uRG93biA/ICdkb3duJyA6ICcnKTtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlVm90ZS5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoJycpO1xuXHRcdH1cblxuXHRcdGlmICh0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyLmNvbnRleHQgPSBlbGVtZW50O1xuXHRcdH1cblx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyVG9vbGJhci5jb250ZXh0ID0gZWxlbWVudDtcblxuXHRcdGNvbnN0IHJlc3BvbnNlVGltaW5nTGlzdGVuZXJzID0gdGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3IE11dGFibGVEaXNwb3NhYmxlKCkpO1xuXHRcdGNvbnN0IHVwZGF0ZVJlc3BvbnNlRGV0YWlscyA9ICgpID0+IHtcblx0XHRcdGNvbnN0IGRldGFpbHMgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgPyBlbGVtZW50LnJlc3VsdD8uZGV0YWlscyA6IHVuZGVmaW5lZDtcblx0XHRcdC8vIFByb3ZpZGVycyByZXBvcnQgdXNhZ2UgYXN5bmNocm9ub3VzbHksIG9mdGVuIGFmdGVyIHRoZSBmb290ZXIgaGFzIGFscmVhZHlcblx0XHRcdC8vIHJlbmRlcmVkLCBzbyB0aGUgYnJlYWtkb3duIGlzIHJlY29tcHV0ZWQgb24gZXZlcnkgcmVuZGVyIHBhc3MuIFNlc3Npb25zXG5cdFx0XHQvLyB3aG9zZSBwcm92aWRlciByZXBvcnRzIG5vIHRvdGFscyBnZXQgbm8gaG92ZXIgcmF0aGVyIHRoYW4gYW4gZW1wdHkgb25lLlxuXHRcdFx0Y29uc3QgdG9rZW5TdGF0cyA9IGlzUmVzcG9uc2VWTShlbGVtZW50KVxuXHRcdFx0XHQ/IGZvcm1hdFJlc3BvbnNlVG9rZW5TdGF0cyhlbGVtZW50Lm1vZGVsLnVzYWdlPy5tb2RlbFRvdGFscylcblx0XHRcdFx0OiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCBjb21wbGV0ZWRBdEVsZW1lbnQgPSByZW5kZXJDaGF0UmVzcG9uc2VEZXRhaWxzKFxuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lcixcblx0XHRcdFx0ZGV0YWlscyxcblx0XHRcdFx0aXNSZXNwb25zZVZNKGVsZW1lbnQpID8gZWxlbWVudC5tb2RlbC5jb21wbGV0aW9uVGltZXN0YW1wIDogdW5kZWZpbmVkLFxuXHRcdFx0XHRpc1Jlc3BvbnNlVk0oZWxlbWVudCkgPyBlbGVtZW50Lm1vZGVsLmVsYXBzZWRNcyA6IHVuZGVmaW5lZCxcblx0XHRcdFx0aXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5WZXJib3NlKSxcblx0XHRcdFx0dG9rZW5TdGF0cz8uYXJpYUxhYmVsLFxuXHRcdFx0KTtcblx0XHRcdC8vIFRoZSBjb250YWluZXIgKHJhdGhlciB0aGFuIHRoZSBzdGF0IHNwYW4pIGlzIHRoZSBob3ZlciB0YXJnZXQgYmVjYXVzZSBpdFxuXHRcdFx0Ly8gaXMgdGhlIGZvY3VzYWJsZSBlbGVtZW50LCB3aGljaCBrZWVwcyB0aGUgYnJlYWtkb3duIHJlYWNoYWJsZSBieSBrZXlib2FyZFxuXHRcdFx0Ly8gYXMgd2VsbCBhcyBieSBwb2ludGVyLiBJdCBpcyBjcmVhdGVkIG9uY2UgcGVyIHRlbXBsYXRlIGFuZCBzdXJ2aXZlcyB0aGVcblx0XHRcdC8vIHJlLXJlbmRlciBhYm92ZSwgc28gYW4gZXhpc3RpbmcgaG92ZXIgaXMgdXBkYXRlZCBpbiBwbGFjZTogcmVwbGFjaW5nIGl0XG5cdFx0XHQvLyB3b3VsZCByZS1rZXkgdGhlIGhvdmVyIHNlcnZpY2UncyB0YXJnZXQgbWFwIGFuZCBsZWF2ZSB0aGUgY29udGFpbmVyXG5cdFx0XHQvLyB1bnJlZ2lzdGVyZWQgZm9yIGB3b3JrYmVuY2guYWN0aW9uLnNob3dIb3ZlcmAuXG5cdFx0XHRjb25zdCB0b2tlblN0YXRzSG92ZXIgPSB0ZW1wbGF0ZURhdGEucmVzcG9uc2VUb2tlblN0YXRzSG92ZXI7XG5cdFx0XHRpZiAoIXRva2VuU3RhdHMpIHtcblx0XHRcdFx0dG9rZW5TdGF0c0hvdmVyLmNsZWFyKCk7XG5cdFx0XHR9IGVsc2UgaWYgKHRva2VuU3RhdHNIb3Zlci52YWx1ZSkge1xuXHRcdFx0XHR0b2tlblN0YXRzSG92ZXIudmFsdWUudXBkYXRlKHRva2VuU3RhdHMpO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0dG9rZW5TdGF0c0hvdmVyLnZhbHVlID0gdGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgdGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsIHRva2VuU3RhdHMpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKCFjb21wbGV0ZWRBdEVsZW1lbnQpIHtcblx0XHRcdFx0cmVzcG9uc2VUaW1pbmdMaXN0ZW5lcnMuY2xlYXIoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBsaXN0ZW5lcnMgPSBuZXcgRGlzcG9zYWJsZVN0b3JlKCk7XG5cdFx0XHRyZXNwb25zZVRpbWluZ0xpc3RlbmVycy52YWx1ZSA9IGxpc3RlbmVycztcblx0XHRcdGxldCByZXNwb25zZVRpbWluZ0JvdW5kczogRE9NUmVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdGxpc3RlbmVycy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihjb21wbGV0ZWRBdEVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfRU5URVIsIGUgPT4ge1xuXHRcdFx0XHRjb25zdCBib3VuZHMgPSBjb21wbGV0ZWRBdEVsZW1lbnQuZ2V0Qm91bmRpbmdDbGllbnRSZWN0KCk7XG5cdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gYm91bmRzO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXJlc3BvbnNlLWZsaXAtcmVzZXQnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXNwb25zZS1mbGlwLWFjdGl2ZScpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXJlc3BvbnNlLWZsaXAtZG93bicsIGUuY2xpZW50WSA8IGJvdW5kcy50b3AgKyBib3VuZHMuaGVpZ2h0IC8gMik7XG5cdFx0XHRcdHZvaWQgdGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIub2Zmc2V0V2lkdGg7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVzcG9uc2UtZmxpcC1yZXNldCcpO1xuXHRcdFx0XHR2b2lkIHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLm9mZnNldFdpZHRoO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdjaGF0LXJlc3BvbnNlLWZsaXAtYWN0aXZlJyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsIGRvbS5FdmVudFR5cGUuTU9VU0VfTU9WRSwgZSA9PiB7XG5cdFx0XHRcdGlmIChyZXNwb25zZVRpbWluZ0JvdW5kcyAmJiAoZS5jbGllbnRYIDwgcmVzcG9uc2VUaW1pbmdCb3VuZHMubGVmdCB8fCBlLmNsaWVudFggPiByZXNwb25zZVRpbWluZ0JvdW5kcy5yaWdodCB8fCBlLmNsaWVudFkgPCByZXNwb25zZVRpbWluZ0JvdW5kcy50b3AgfHwgZS5jbGllbnRZID4gcmVzcG9uc2VUaW1pbmdCb3VuZHMuYm90dG9tKSkge1xuXHRcdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVzcG9uc2UtZmxpcC1hY3RpdmUnKTtcblx0XHRcdFx0fVxuXHRcdFx0fSkpO1xuXHRcdFx0bGlzdGVuZXJzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKHRlbXBsYXRlRGF0YS5mb290ZXJEZXRhaWxzQ29udGFpbmVyLCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCAoKSA9PiB7XG5cdFx0XHRcdHJlc3BvbnNlVGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZm9vdGVyRGV0YWlsc0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlc3BvbnNlLWZsaXAtYWN0aXZlJyk7XG5cdFx0XHR9KSk7XG5cdFx0XHRsaXN0ZW5lcnMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmZvb3RlckRldGFpbHNDb250YWluZXIuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXNwb25zZS1mbGlwLWFjdGl2ZScsICdjaGF0LXJlc3BvbnNlLWZsaXAtZG93bicpO1xuXHRcdFx0fSkpO1xuXHRcdH07XG5cdFx0dXBkYXRlUmVzcG9uc2VEZXRhaWxzKCk7XG5cblx0XHRDaGF0Q29udGV4dEtleXMucmVzcG9uc2VIYXNFcnJvci5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5lcnJvckRldGFpbHMpO1xuXHRcdGNvbnN0IGlzRmlsdGVyZWQgPSAhIShpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgZWxlbWVudC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNGaWx0ZXJlZCk7XG5cdFx0Q2hhdENvbnRleHRLZXlzLnJlc3BvbnNlSXNGaWx0ZXJlZC5iaW5kVG8odGVtcGxhdGVEYXRhLmNvbnRleHRLZXlTZXJ2aWNlKS5zZXQoaXNGaWx0ZXJlZCk7XG5cblx0XHRjb25zdCBsb2NhdGlvbiA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpPy5sb2NhdGlvbjtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmctc2Vzc2lvbicsIGxvY2F0aW9uID09PSBDaGF0QWdlbnRMb2NhdGlvbi5DaGF0KTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2ludGVyYWN0aXZlLXJlcXVlc3QnLCBpc1JlcXVlc3RWTShlbGVtZW50KSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdpbnRlcmFjdGl2ZS1yZXNwb25zZScsIGlzUmVzcG9uc2VWTShlbGVtZW50KSk7XG5cdFx0Y29uc3QgcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlID0gY2hlY2tNb2RlT3B0aW9uKHRoaXMuZGVsZWdhdGUuY3VycmVudENoYXRNb2RlKCksIHRoaXMucmVuZGVyZXJPcHRpb25zLnByb2dyZXNzTWVzc2FnZUF0Qm90dG9tT2ZSZXNwb25zZSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWRldGFpbC1wcm9ncmVzcycsIGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiAhZWxlbWVudC5pc0NvbXBsZXRlICYmICFlbGVtZW50LnByb2dyZXNzTWVzc2FnZXMubGVuZ3RoICYmICFwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1wcm9ncmVzcy1yZXNlcnZhYmxlJywgaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmICFlbGVtZW50LmlzQ29tcGxldGUgJiYgISFwcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpO1xuXG5cdFx0Ly8gVG9nZ2xlIHNob3ctY2hlY2ttYXJrcyBjbGFzcyBhdCB0aGUgY29udGFpbmVyIGxldmVsIGZvciB0aGUgYWNjZXNzaWJpbGl0eSBzZXR0aW5nLFxuXHRcdC8vIHNvIGNoaWxkIGNvbnRlbnQgcGFydHMgY2FuIHVzZSBDU1MgZGVzY2VuZGFudCBzZWxlY3RvcnMgaW5zdGVhZCBvZiBlYWNoIHN1YnNjcmliaW5nIGluZGl2aWR1YWxseS5cblx0XHRjb25zdCB1cGRhdGVDb250YWluZXJDaGVja21hcmtzID0gKCkgPT4gdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdzaG93LWNoZWNrbWFya3MnLCAhIXRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihBY2Nlc3NpYmlsaXR5V29ya2JlbmNoU2V0dGluZ0lkLlNob3dDaGF0Q2hlY2ttYXJrcykpO1xuXHRcdHVwZGF0ZUNvbnRhaW5lckNoZWNrbWFya3MoKTtcblx0XHRjb25zdCB1cGRhdGVWZXJib3NlRGV0YWlscyA9ICgpID0+IHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnc2hvdy12ZXJib3NlLWRldGFpbHMnLCAhIXRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5WZXJib3NlKSk7XG5cdFx0dXBkYXRlVmVyYm9zZURldGFpbHMoKTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0aGlzLmNvbmZpZ1NlcnZpY2Uub25EaWRDaGFuZ2VDb25maWd1cmF0aW9uKGUgPT4ge1xuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQWNjZXNzaWJpbGl0eVdvcmtiZW5jaFNldHRpbmdJZC5TaG93Q2hhdENoZWNrbWFya3MpKSB7XG5cdFx0XHRcdHVwZGF0ZUNvbnRhaW5lckNoZWNrbWFya3MoKTtcblx0XHRcdH1cblx0XHRcdGlmIChlLmFmZmVjdHNDb25maWd1cmF0aW9uKENoYXRDb25maWd1cmF0aW9uLlZlcmJvc2UpKSB7XG5cdFx0XHRcdHVwZGF0ZVZlcmJvc2VEZXRhaWxzKCk7XG5cdFx0XHRcdHVwZGF0ZVJlc3BvbnNlRGV0YWlscygpO1xuXHRcdFx0fVxuXHRcdFx0aWYgKGUuYWZmZWN0c0NvbmZpZ3VyYXRpb24oQ2hhdENvbmZpZ3VyYXRpb24uQ29sbGFwc2VDb21wbGV0ZWRSZXNwb25zZXMpICYmIGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0XHR0aGlzLnVwZGF0ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZShlbGVtZW50LCB0ZW1wbGF0ZURhdGEucmVuZGVyZWRDb250ZW50ID8/IFtdLCB0ZW1wbGF0ZURhdGEsIGZhbHNlKTtcblx0XHRcdH1cblx0XHR9KSk7XG5cblx0XHRpZiAoIXRoaXMucmVuZGVyZXJPcHRpb25zLm5vSGVhZGVyKSB7XG5cdFx0XHR0aGlzLnJlbmRlckF2YXRhcihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGlzU3lzdGVtSW5pdGlhdGVkUmVxdWVzdCA9IGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZDtcblxuXHRcdHRlbXBsYXRlRGF0YS51c2VybmFtZS50ZXh0Q29udGVudCA9IGVsZW1lbnQudXNlcm5hbWU7XG5cdFx0Y29uc3QgaGlkZUNoYXRVc2VySWRlbnRpdHkgPSBzaG91bGRIaWRlQ2hhdFVzZXJJZGVudGl0eShlbGVtZW50LnVzZXJuYW1lLCBlbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgaXNSZXNwb25zZVZNKGVsZW1lbnQpLCB0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93LCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QpO1xuXHRcdHRlbXBsYXRlRGF0YS51c2VybmFtZS5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoaWRlQ2hhdFVzZXJJZGVudGl0eSk7XG5cdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBoaWRlQ2hhdFVzZXJJZGVudGl0eSk7XG5cblx0XHR0aGlzLmhvdmVySGlkZGVuKHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIpO1xuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmRldGFpbCk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEucmVxdWVzdFRpbWVzdGFtcENvbnRhaW5lcik7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0dGhpcy5yZW5kZXJEZXRhaWwoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFRvb2xiYXIuY29udGV4dCA9IGVsZW1lbnQ7XG5cdFx0Y29uc3Qgc3VwcG9ydHNGb3JrT3JSZXN0b3JhdGlvbiA9IHRoaXMucmVuZGVyZXJPcHRpb25zLnN1cHBvcnRzRm9yayB8fCAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVzdG9yYWJsZSA/PyB0cnVlKTtcblx0XHRjb25zdCBjaGVja3BvaW50RW5hYmxlZCA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxib29sZWFuPihDaGF0Q29uZmlndXJhdGlvbi5DaGVja3BvaW50c0VuYWJsZWQpXG5cdFx0XHQmJiBzdXBwb3J0c0ZvcmtPclJlc3RvcmF0aW9uO1xuXHRcdGNvbnN0IGlzUGVuZGluZ1JlcXVlc3QgPSBpc1JlcXVlc3RWTShlbGVtZW50KSAmJiAhIWVsZW1lbnQucGVuZGluZ0tpbmQ7XG5cblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludENvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgfHwgaXNQZW5kaW5nUmVxdWVzdCB8fCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QgfHwgIShjaGVja3BvaW50RW5hYmxlZCkpO1xuXG5cdFx0Ly8gRm9yY2UgdG9vbGJhcnMgdG8gc3luY2hyb25vdXNseSByZS1ldmFsdWF0ZSBhZnRlciBjb250ZXh0IGtleSBjaGFuZ2VzXG5cdFx0Ly8gdG8gYXZvaWQgc2l6ZSBtZWFzdXJlbWVudCBpc3N1ZXMgZnJvbSB0aGUgZGVib3VuY2VkIG1lbnUgdXBkYXRlLlxuXHRcdHRlbXBsYXRlRGF0YS5mb290ZXJUb29sYmFyLnJlZnJlc2goKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFRvb2xiYXIucmVmcmVzaCgpO1xuXHRcdHRlbXBsYXRlRGF0YS5jaGVja3BvaW50UmVzdG9yZVRvb2xiYXIucmVmcmVzaCgpO1xuXG5cdFx0Ly8gVHJhY2sgcmVzcG9uc2UgdGVtcGxhdGUgZGF0YSBieSByZXF1ZXN0IElEIGZvciBjcm9zcy1yb3cgaG92ZXIgZWZmZWN0c1xuXHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdHRoaXMucmVzcG9uc2VUZW1wbGF0ZURhdGFCeVJlcXVlc3RJZC5zZXQoZWxlbWVudC5yZXF1ZXN0SWQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5yZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmRlbGV0ZShlbGVtZW50LnJlcXVlc3RJZCkpKTtcblx0XHR9XG5cblx0XHQvLyB1bmlmaWVkIGhvdmVyaW5nXG5cdFx0aWYgKCFpc1BlbmRpbmdSZXF1ZXN0KSB7XG5cdFx0XHRjb25zdCBzZXRHcm91cEhvdmVyID0gKGhvdmVyZWQ6IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0Y29uc3QgcmVxdWVzdElkID0gaXNSZXF1ZXN0Vk0oZWxlbWVudCkgPyBlbGVtZW50LmlkIDogaXNSZXNwb25zZVZNKGVsZW1lbnQpID8gZWxlbWVudC5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdGlmICghcmVxdWVzdElkKSB7XG5cdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHR9XG5cdFx0XHRcdGNvbnN0IHJlcURhdGEgPSB0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRjb25zdCByZXNEYXRhID0gdGhpcy5yZXNwb25zZVRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmdldChyZXF1ZXN0SWQpO1xuXHRcdFx0XHRyZXFEYXRhPy5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZ3JvdXAtaG92ZXJlZCcsIGhvdmVyZWQpO1xuXHRcdFx0XHRyZXFEYXRhPy5jaGVja3BvaW50Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2dyb3VwLWhvdmVyZWQnLCBob3ZlcmVkKTtcblx0XHRcdFx0cmVzRGF0YT8ucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2dyb3VwLWhvdmVyZWQnLCBob3ZlcmVkKTtcblx0XHRcdH07XG5cdFx0XHRjb25zdCBob3ZlclRhcmdldHMgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudClcblx0XHRcdFx0PyBbdGVtcGxhdGVEYXRhLnZhbHVlLCB0ZW1wbGF0ZURhdGEuZm9vdGVyVG9vbGJhckNvbnRhaW5lcl1cblx0XHRcdFx0OiBbdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lcl07XG5cdFx0XHRjb25zdCBpc0hvdmVyVGFyZ2V0ID0gKHRhcmdldDogRXZlbnRUYXJnZXQgfCBudWxsKSA9PiBkb20uaXNIVE1MRWxlbWVudCh0YXJnZXQpICYmIGhvdmVyVGFyZ2V0cy5zb21lKGhvdmVyVGFyZ2V0ID0+IGhvdmVyVGFyZ2V0LmNvbnRhaW5zKHRhcmdldCkpO1xuXHRcdFx0Zm9yIChjb25zdCBob3ZlclRhcmdldCBvZiBob3ZlclRhcmdldHMpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihob3ZlclRhcmdldCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9FTlRFUiwgKCkgPT4gc2V0R3JvdXBIb3Zlcih0cnVlKSkpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKGhvdmVyVGFyZ2V0LCBkb20uRXZlbnRUeXBlLk1PVVNFX0xFQVZFLCBlID0+IHtcblx0XHRcdFx0XHRpZiAoIWlzSG92ZXJUYXJnZXQoZS5yZWxhdGVkVGFyZ2V0KSkge1xuXHRcdFx0XHRcdFx0c2V0R3JvdXBIb3ZlcihmYWxzZSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZCh0b0Rpc3Bvc2FibGUoKCkgPT4gc2V0R3JvdXBIb3ZlcihmYWxzZSkpKTtcblx0XHR9XG5cblx0XHQvLyBPbmx5IHNob3cgcmVzdG9yZSBjb250YWluZXIgd2hlbiB3ZSBoYXZlIGEgY2hlY2twb2ludCBhbmQgbm90IGVkaXRpbmcsIGFuZCBub3QgYSBwZW5kaW5nIHJlcXVlc3Rcblx0XHRjb25zdCBzaG91bGRTaG93UmVzdG9yZSA9IHRoaXMudmlld01vZGVsPy5tb2RlbC5jaGVja3BvaW50ICYmICF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiAoaW5kZXggPT09IHRoaXMuZGVsZWdhdGUuZ2V0TGlzdExlbmd0aCgpIC0gMSkgJiYgIWlzUGVuZGluZ1JlcXVlc3Q7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRSZXN0b3JlQ29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2hpZGRlbicsICEoc2hvdWxkU2hvd1Jlc3RvcmUgJiYgY2hlY2twb2ludEVuYWJsZWQpKTtcblxuXHRcdGNvbnN0IGVkaXRpbmcgPSBlbGVtZW50LmlkID09PSB0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQ7XG5cdFx0Y29uc3QgaXNJbnB1dCA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxzdHJpbmc+KCdjaGF0LmVkaXRSZXF1ZXN0cycpID09PSAnaW5wdXQnO1xuXG5cdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoYXV0b3J1bihyID0+IHtcblx0XHRcdGNvbnN0IHNob3VsZEJlQmxvY2tlZCA9IGVsZW1lbnQuc2hvdWxkQmVCbG9ja2VkLnJlYWQocik7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGlzYWJsZWRPdmVybGF5LmNsYXNzTGlzdC50b2dnbGUoJ2Rpc2FibGVkJywgc2hvdWxkQmVCbG9ja2VkICYmICFlZGl0aW5nICYmIHRoaXMudmlld01vZGVsPy5lZGl0aW5nICE9PSB1bmRlZmluZWQpO1xuXHRcdH0pKTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmcnLCBlZGl0aW5nICYmICFpc0lucHV0KTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2VkaXRpbmctaW5wdXQnLCBlZGl0aW5nICYmIGlzSW5wdXQpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZWRpdGluZycsIGVkaXRpbmcgJiYgaXNJbnB1dCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QudG9nZ2xlKCdoaWRkZW4nLCAoISF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJiAhZWRpdGluZykgfHwgaXNSZXNwb25zZVZNKGVsZW1lbnQpIHx8ICF0aGlzLnJlbmRlcmVyT3B0aW9ucy5lZGl0YWJsZSB8fCBpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3QpO1xuXHRcdHRlbXBsYXRlRGF0YS5yZXF1ZXN0SG92ZXIuY2xhc3NMaXN0LnRvZ2dsZSgnZXhwYW5kZWQnLCB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSA9PT0gJ2hvdmVyJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QudG9nZ2xlKCdjaGVja3BvaW50cy1lbmFibGVkJywgY2hlY2twb2ludEVuYWJsZWQpO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGRTdGFuZGFyZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoZSkgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudDtcblx0XHRcdGlmIChjdXJyZW50ICYmIHRoaXMudmlld01vZGVsPy5lZGl0aW5nICYmIGN1cnJlbnQuaWQgIT09IHRoaXMudmlld01vZGVsLmVkaXRpbmcuaWQpIHtcblx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0ZS5wcmV2ZW50RGVmYXVsdCgpO1xuXHRcdFx0XHR0aGlzLl9vbkRpZEZvY3VzT3V0c2lkZS5maXJlKCk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0Ly8gT3ZlcmxheSBjbGljayBsaXN0ZW5lciByZW1vdmVkOiBvdmVybGF5IGlzIG5vbi1pbnRlcmFjdGl2ZSBpbiBjYW5jZWwtb24tYW55LXJvdyBtb2RlLlxuXG5cdFx0Ly8gaGFjayBAam9hb21vcmVub1xuXHRcdGNvbnN0IHJvd1Jvb3QgPSB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ/LnBhcmVudEVsZW1lbnQ7XG5cdFx0cm93Um9vdD8uY2xhc3NMaXN0LnRvZ2dsZSgncmVxdWVzdCcsIGlzUmVxdWVzdFZNKGVsZW1lbnQpKTtcblx0XHRyb3dSb290Py5jbGFzc0xpc3QudG9nZ2xlKCdyZXNwb25zZScsIGlzUmVzcG9uc2VWTShlbGVtZW50KSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKG1vc3RSZWNlbnRSZXNwb25zZUNsYXNzTmFtZSwgaW5kZXggPT09IHRoaXMuZGVsZWdhdGUuZ2V0TGlzdExlbmd0aCgpIC0gMSk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjb25maXJtYXRpb24tbWVzc2FnZScsIGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmICEhZWxlbWVudC5jb25maXJtYXRpb24pO1xuXG5cdFx0Ly8gVGhlIHN0cmVhbWluZy9wcm9ncmVzc2l2ZS1yZW5kZXJpbmcgdGFyZ2V0IGlzIHRoZSBsYXN0IG5vbi1wZW5kaW5nIGl0ZW0sIHNvIHRoZSBhY3RpdmVcblx0XHQvLyByZXNwb25zZSBrZWVwcyByZW5kZXJpbmcgKGFuZCB0aGUgdmlldyBrZWVwcyBmb2xsb3dpbmcgaXQpIGV2ZW4gd2hlbiBxdWV1ZWQgb3Igc3RlZXJpbmdcblx0XHQvLyByb3dzIGFyZSBzaG93biBiZWxvdyBpdC5cblx0XHRjb25zdCBpc1N0aWNreVNjcm9sbFRhcmdldEl0ZW0gPSBnZXRTdGlja3lTY3JvbGxUYXJnZXRJdGVtKHRoaXMudmlld01vZGVsPy5nZXRJdGVtcygpID8/IFtdKSA9PT0gZWxlbWVudDtcblxuXHRcdC8vIFRPRE86IEBqdXN0c2NoZW4gZGVjaWRlIGlmIHdlIHdhbnQgdG8gaGlkZSB0aGUgaGVhZGVyIGZvciByZXF1ZXN0cyBvciBub3Rcblx0XHRjb25zdCBzaG91bGRTaG93SGVhZGVyID0gKGlzUmVzcG9uc2VWTShlbGVtZW50KSAmJiAhdGhpcy5yZW5kZXJlck9wdGlvbnMubm9IZWFkZXIpICYmICFpc1N5c3RlbUluaXRpYXRlZFJlcXVlc3Q7XG5cdFx0dGVtcGxhdGVEYXRhLmhlYWRlcj8uY2xhc3NMaXN0LnRvZ2dsZSgnaGVhZGVyLWRpc2FibGVkJywgIXNob3VsZFNob3dIZWFkZXIpO1xuXG5cdFx0aWYgKGlzUmVxdWVzdFZNKGVsZW1lbnQpICYmIGVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHR0aGlzLnJlbmRlckNvbmZpcm1hdGlvbkFjdGlvbihlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdC8vIERvIGEgcHJvZ3Jlc3NpdmUgcmVuZGVyIGlmXG5cdFx0Ly8gLSBUaGlzIGlzIHRoZSBsYXN0IG5vbi1wZW5kaW5nIHJlc3BvbnNlIGluIHRoZSBsaXN0XG5cdFx0Ly8gLSBBbmQgaXQgaGFzIHNvbWUgY29udGVudFxuXHRcdC8vIC0gQW5kIHRoZSByZXNwb25zZSBpcyBub3QgY29tcGxldGVcblx0XHQvLyAgIC0gT3IsIHdlIHByZXZpb3VzbHkgc3RhcnRlZCBhIHByb2dyZXNzaXZlIHJlbmRlcmluZyBvZiB0aGlzIGVsZW1lbnQgKGlmIHRoZSBlbGVtZW50IGlzIGNvbXBsZXRlLCB3ZSB3aWxsIGZpbmlzaCBwcm9ncmVzc2l2ZSByZW5kZXJpbmcgd2l0aCBhIHZlcnkgZmFzdCByYXRlKVxuXHRcdGNvbnN0IGluY3JlbWVudGFsUmVuZGVyaW5nID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKTtcblx0XHRpZiAoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGlzU3RpY2t5U2Nyb2xsVGFyZ2V0SXRlbSAmJiAoIWVsZW1lbnQuaXNDb21wbGV0ZSB8fCBlbGVtZW50LnJlbmRlckRhdGEpKSB7XG5cdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdyZW5kZXJFbGVtZW50JywgYHN0YXJ0IHByb2dyZXNzaXZlIHJlbmRlciwgaW5kZXg9JHtpbmRleH1gKTtcblxuXHRcdFx0aWYgKGluY3JlbWVudGFsUmVuZGVyaW5nICYmICFlbGVtZW50LnJlbmRlckRhdGEpIHtcblx0XHRcdFx0Ly8gSW5jcmVtZW50YWwgcmVuZGVyaW5nOiBldmVudC1kcml2ZW4gZmxvdywgbm8gdGltZXIuXG5cdFx0XHRcdC8vIHJlbmRlckVsZW1lbnQgaXMgY2FsbGVkIGVhY2ggdGltZSB0aGUgbW9kZWwgY2hhbmdlcywgc29cblx0XHRcdFx0Ly8gdGhpcyBtZXRob2QgcnVucyBvbiBldmVyeSBjb250ZW50IHVwZGF0ZS5cblx0XHRcdFx0dGhpcy5sb2dJbmNyZW1lbnRhbFJlbmRlcmluZ1RlbGVtZXRyeSgpO1xuXHRcdFx0XHR0aGlzLmRvSW5jcmVtZW50YWxSZW5kZXIoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRjb25zdCB0aW1lciA9IHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKG5ldyBkb20uV2luZG93SW50ZXJ2YWxUaW1lcigpKTtcblx0XHRcdFx0Y29uc3QgcnVuUHJvZ3Jlc3NpdmVSZW5kZXIgPSAoaW5pdGlhbD86IGJvb2xlYW4pID0+IHtcblx0XHRcdFx0XHR0cnkge1xuXHRcdFx0XHRcdFx0aWYgKHRoaXMuZG9OZXh0UHJvZ3Jlc3NpdmVSZW5kZXIoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSwgISFpbml0aWFsKSkge1xuXHRcdFx0XHRcdFx0XHR0aW1lci5jYW5jZWwoKTtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHRcdC8vIEtpbGwgdGhlIHRpbWVyIGlmIGFueXRoaW5nIHdlbnQgd3JvbmcsIGF2b2lkIGdldHRpbmcgc3R1Y2sgaW4gYSBuYXN0eSByZW5kZXJpbmcgbG9vcC5cblx0XHRcdFx0XHRcdHRpbWVyLmNhbmNlbCgpO1xuXHRcdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKGVycik7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9O1xuXHRcdFx0XHR0aW1lci5jYW5jZWxBbmRTZXQocnVuUHJvZ3Jlc3NpdmVSZW5kZXIsIDUwLCBkb20uZ2V0V2luZG93KHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIpKTtcblx0XHRcdFx0cnVuUHJvZ3Jlc3NpdmVSZW5kZXIodHJ1ZSk7XG5cdFx0XHR9XG5cdFx0fSBlbHNlIHtcblx0XHRcdGlmIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkpIHtcblx0XHRcdFx0Ly8gV2hlbiBpbmNyZW1lbnRhbCByZW5kZXJpbmcgd2FzIGFjdGl2ZSBkdXJpbmcgdGhpcyByZXNwb25zZSxcblx0XHRcdFx0Ly8gbm90aWZ5IGFueSBhY3RpdmUgbW9ycGhlciB0aGF0IHRoZSBzdHJlYW0gaXMgY29tcGxldGVcblx0XHRcdFx0Ly8gc28gaXQgc3dpdGNoZXMgdG8gYSBmYXN0IGRyYWluIHJhdGUgYmVmb3JlIHdlIHJlbmRlci5cblx0XHRcdFx0aWYgKGluY3JlbWVudGFsUmVuZGVyaW5nKSB7XG5cdFx0XHRcdFx0Y29uc3QgcmF0ZSA9IHRoaXMuZ2V0UHJvZ3Jlc3NpdmVSZW5kZXJSYXRlKGVsZW1lbnQpO1xuXHRcdFx0XHRcdHRoaXMuX3VwZGF0ZU1vcnBoZXJSYXRlKHRlbXBsYXRlRGF0YSwgcmF0ZSwgdHJ1ZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGhpcy5yZW5kZXJDaGF0UmVzcG9uc2VCYXNpYyhlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoaXNSZXF1ZXN0Vk0oZWxlbWVudCkpIHtcblx0XHRcdFx0dGhpcy5yZW5kZXJDaGF0UmVxdWVzdChlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHNNb3VudGVkID0gdHJ1ZTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUGVuZGluZ0RpdmlkZXIoZWxlbWVudDogSUNoYXRQZW5kaW5nRGl2aWRlclZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC5hZGQoJ3BlbmRpbmctaXRlbScpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LmFkZCgncGVuZGluZy1kaXZpZGVyJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QucmVtb3ZlKCdpbnRlcmFjdGl2ZS1yZXF1ZXN0JywgJ2ludGVyYWN0aXZlLXJlc3BvbnNlJywgJ3BlbmRpbmctcmVxdWVzdCcpO1xuXG5cdFx0Ly8gSGlkZSBoZWFkZXIgZWxlbWVudHMgbm90IGFwcGxpY2FibGUgdG8gcGVuZGluZyBkaXZpZGVyXG5cdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEudXNlcm5hbWUuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludENvbnRhaW5lci5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR0ZW1wbGF0ZURhdGEuY2hlY2twb2ludFJlc3RvcmVDb250YWluZXIuY2xhc3NMaXN0LmFkZCgnaGlkZGVuJyk7XG5cdFx0dGVtcGxhdGVEYXRhLmZvb3RlclRvb2xiYXIuZ2V0RWxlbWVudCgpLmNsYXNzTGlzdC5hZGQoJ2hpZGRlbicpO1xuXHRcdGlmICh0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyLmdldEVsZW1lbnQoKS5jbGFzc0xpc3QuYWRkKCdoaWRkZW4nKTtcblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuZGV0YWlsKTtcblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS5yZXF1ZXN0VGltZXN0YW1wQ29udGFpbmVyKTtcblxuXHRcdGNvbnN0IGRpdmlkZXJDb250ZW50ID0gZG9tLiQoJy5wZW5kaW5nLWRpdmlkZXItY29udGVudCcpO1xuXHRcdGNvbnN0IGxhYmVsID0gZG9tLmFwcGVuZChkaXZpZGVyQ29udGVudCwgZG9tLiQoJ3NwYW4ucGVuZGluZy1kaXZpZGVyLWxhYmVsJykpO1xuXG5cdFx0aWYgKGVsZW1lbnQuZGl2aWRlcktpbmQgPT09IENoYXRSZXF1ZXN0UXVldWVLaW5kLlN0ZWVyaW5nKSB7XG5cdFx0XHRpZiAoZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCkge1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzeXN0ZW1Ob3RpZmljYXRpb25EaXZpZGVyJywgXCJTeXN0ZW0gTm90aWZpY2F0aW9uXCIpO1xuXHRcdFx0XHRsYWJlbC50aXRsZSA9IGxvY2FsaXplKCdzeXN0ZW1Ob3RpZmljYXRpb25EaXZpZGVyVG9vbHRpcCcsIFwiU3lzdGVtIG5vdGlmaWNhdGlvbiB3aWxsIGJlIHNlbnQgYWZ0ZXIgdGhlIG5leHQgdG9vbCBjYWxsIGhhcHBlbnNcIik7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGxvY2FsaXplKCdzdGVlcmluZ0RpdmlkZXInLCBcIlN0ZWVyaW5nXCIpO1xuXHRcdFx0XHRsYWJlbC50aXRsZSA9IGxvY2FsaXplKCdzdGVlcmluZ0RpdmlkZXJUb29sdGlwJywgXCJTdGVlcmluZyBtZXNzYWdlIHdpbGwgYmUgc2VudCBhZnRlciB0aGUgbmV4dCB0b29sIGNhbGwgaGFwcGVuc1wiKTtcblx0XHRcdH1cblx0XHR9IGVsc2Uge1xuXHRcdFx0bGFiZWwudGV4dENvbnRlbnQgPSBsb2NhbGl6ZSgncXVldWVkRGl2aWRlcicsIFwiUXVldWVkXCIpO1xuXHRcdFx0bGFiZWwudGl0bGUgPSBsb2NhbGl6ZSgncXVldWVkRGl2aWRlclRvb2x0aXAnLCBcIlF1ZXVlZCBtZXNzYWdlcyB3aWxsIGJlIHNlbnQgYWZ0ZXIgdGhlIGN1cnJlbnQgcmVxdWVzdCBjb21wbGV0ZXNcIik7XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGRpdmlkZXJDb250ZW50KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGV0YWlsKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0ZG9tLmNsZWFyTm9kZSh0ZW1wbGF0ZURhdGEuZGV0YWlsKTtcblxuXHRcdGlmIChlbGVtZW50LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCkge1xuXHRcdFx0Y29uc3QgbXNnID0gZWxlbWVudC5zbGFzaENvbW1hbmQgPyBsb2NhbGl6ZSgndXNlZEFnZW50U2xhc2hDb21tYW5kJywgXCJ1c2VkIHswfSBbWyhyZXJ1biB3aXRob3V0KV1dXCIsIGAke2NoYXRTdWJjb21tYW5kTGVhZGVyfSR7ZWxlbWVudC5zbGFzaENvbW1hbmQubmFtZX1gKSA6IGxvY2FsaXplKCd1c2VkQWdlbnQnLCBcIltbKHJlcnVuIHdpdGhvdXQpXV1cIik7XG5cdFx0XHRkb20ucmVzZXQodGVtcGxhdGVEYXRhLmRldGFpbCwgcmVuZGVyRm9ybWF0dGVkVGV4dChtc2csIHtcblx0XHRcdFx0YWN0aW9uSGFuZGxlcjoge1xuXHRcdFx0XHRcdGRpc3Bvc2FibGVzOiB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLFxuXHRcdFx0XHRcdGNhbGxiYWNrOiAoY29udGVudCkgPT4ge1xuXHRcdFx0XHRcdFx0dGhpcy5fb25EaWRDbGlja1JlcnVuV2l0aEFnZW50T3JDb21tYW5kRGV0ZWN0aW9uLmZpcmUoZWxlbWVudCk7XG5cdFx0XHRcdFx0fSxcblx0XHRcdFx0fVxuXHRcdFx0fSwgJCgnc3Bhbi5hZ2VudE9yU2xhc2hDb21tYW5kRGV0ZWN0ZWQnKSkpO1xuXG5cdFx0fSBlbHNlIGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJTdHlsZSAhPT0gJ21pbmltYWwnICYmICFlbGVtZW50LmlzQ29tcGxldGUgJiYgIWNoZWNrTW9kZU9wdGlvbih0aGlzLmRlbGVnYXRlLmN1cnJlbnRDaGF0TW9kZSgpLCB0aGlzLnJlbmRlcmVyT3B0aW9ucy5wcm9ncmVzc01lc3NhZ2VBdEJvdHRvbU9mUmVzcG9uc2UpKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZGV0YWlsLnRleHRDb250ZW50ID0gbG9jYWxpemUoJ3dvcmtpbmcnLCBcIldvcmtpbmdcIik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJDb25maXJtYXRpb25BY3Rpb24oZWxlbWVudDogSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXHRcdGRvbS5jbGVhck5vZGUodGVtcGxhdGVEYXRhLmRldGFpbCk7XG5cdFx0aWYgKGVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHRkb20uYXBwZW5kKHRlbXBsYXRlRGF0YS5kZXRhaWwsICQoJ3NwYW4uY29kaWNvbi5jb2RpY29uLWNoZWNrJywgeyAnYXJpYS1oaWRkZW4nOiAndHJ1ZScgfSkpO1xuXHRcdFx0ZG9tLmFwcGVuZCh0ZW1wbGF0ZURhdGEuZGV0YWlsLCAkKCdzcGFuLmNvbmZpcm1hdGlvbi10ZXh0JywgdW5kZWZpbmVkLCBsb2NhbGl6ZSgnY2hhdENvbmZpcm1hdGlvbkFjdGlvbicsICdTZWxlY3RlZCBcInswfVwiJywgZWxlbWVudC5jb25maXJtYXRpb24pKSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuaGVhZGVyPy5jbGFzc0xpc3QucmVtb3ZlKCdoZWFkZXItZGlzYWJsZWQnKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5oZWFkZXI/LmNsYXNzTGlzdC5hZGQoJ3BhcnRpYWxseS1kaXNhYmxlZCcpO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQXZhdGFyKGVsZW1lbnQ6IENoYXRUcmVlSXRlbSwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRpZiAoaXNQZW5kaW5nRGl2aWRlclZNKGVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGxldCBpY29uOiBVUkkgfCBUaGVtZUljb247XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0aWNvbiA9IHRoaXMuZ2V0QWdlbnRJY29uKGVsZW1lbnQuYWdlbnQ/Lm1ldGFkYXRhKTtcblx0XHR9IGVsc2UgaWYgKGlzUmVxdWVzdFZNKGVsZW1lbnQpKSB7XG5cdFx0XHRpY29uID0gZWxlbWVudC5hdmF0YXJJY29uID8/IENvZGljb24uYWNjb3VudDtcblx0XHR9IGVsc2Uge1xuXHRcdFx0aWNvbiA9IENvZGljb24uYWNjb3VudDtcblx0XHR9XG5cdFx0aWYgKGljb24gaW5zdGFuY2VvZiBVUkkpIHtcblx0XHRcdGNvbnN0IGF2YXRhckljb24gPSBkb20uJDxIVE1MSW1hZ2VFbGVtZW50PignaW1nLmljb24nKTtcblx0XHRcdGF2YXRhckljb24uc3JjID0gRmlsZUFjY2Vzcy51cmlUb0Jyb3dzZXJVcmkoaWNvbikudG9TdHJpbmcodHJ1ZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuYXZhdGFyQ29udGFpbmVyLnJlcGxhY2VDaGlsZHJlbihkb20uJCgnLmF2YXRhcicsIHVuZGVmaW5lZCwgYXZhdGFySWNvbikpO1xuXHRcdH0gZWxzZSB7XG5cdFx0XHRjb25zdCBhdmF0YXJJY29uID0gZG9tLiQoVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoaWNvbikpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLmF2YXRhckNvbnRhaW5lci5yZXBsYWNlQ2hpbGRyZW4oZG9tLiQoJy5hdmF0YXIuY29kaWNvbi1hdmF0YXInLCB1bmRlZmluZWQsIGF2YXRhckljb24pKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIGdldEFnZW50SWNvbihhZ2VudDogSUNoYXRBZ2VudE1ldGFkYXRhIHwgdW5kZWZpbmVkKTogVVJJIHwgVGhlbWVJY29uIHtcblx0XHRpZiAoYWdlbnQ/LnRoZW1lSWNvbikge1xuXHRcdFx0cmV0dXJuIGFnZW50LnRoZW1lSWNvbjtcblx0XHR9IGVsc2UgaWYgKGFnZW50Py5pY29uRGFyayAmJiBpc0RhcmsodGhpcy50aGVtZVNlcnZpY2UuZ2V0Q29sb3JUaGVtZSgpLnR5cGUpKSB7XG5cdFx0XHRyZXR1cm4gYWdlbnQuaWNvbkRhcms7XG5cdFx0fSBlbHNlIGlmIChhZ2VudD8uaWNvbikge1xuXHRcdFx0cmV0dXJuIGFnZW50Lmljb247XG5cdFx0fSBlbHNlIHtcblx0XHRcdHJldHVybiBDb2RpY29uLmNoYXRTcGFya2xlO1xuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgaW5kZXg6IG51bWJlciwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpIHtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIChpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgIWVsZW1lbnQuaXNDb21wbGV0ZSkpO1xuXG5cdFx0dGhpcy5maW5hbGl6ZUNvbXBsZXRlZFJlc3BvbnNlUGFydHMoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdGNvbnN0IGNvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10gPSBbXTtcblx0XHRjb25zdCBpc0ZpbHRlcmVkID0gISFlbGVtZW50LmVycm9yRGV0YWlscz8ucmVzcG9uc2VJc0ZpbHRlcmVkO1xuXHRcdGlmICghaXNGaWx0ZXJlZCkge1xuXHRcdFx0Ly8gQWx3YXlzIGFkZCB0aGUgcmVmZXJlbmNlcyB0byBhdm9pZCBzaGlmdGluZyB0aGUgY29udGVudCBwYXJ0cyB3aGVuIGEgcmVmZXJlbmNlIGlzIGFkZGVkLCBhbmQgaGF2aW5nIHRvIHJlLWRpZmYgYWxsIHRoZSBjb250ZW50LlxuXHRcdFx0Ly8gVGhlIHBhcnQgd2lsbCBoaWRlIGl0c2VsZiBpZiB0aGUgbGlzdCBpcyBlbXB0eS5cblx0XHRcdGNvbnRlbnQucHVzaCh7IGtpbmQ6ICdyZWZlcmVuY2VzJywgcmVmZXJlbmNlczogZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcyB9KTtcblx0XHRcdGNvbnN0IHJlc3BvbnNlQ29udGVudCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChlbGVtZW50LnJlc3BvbnNlLnZhbHVlKTtcblx0XHRcdGNvbnRlbnQucHVzaCguLi4oZWxlbWVudC5pc0NvbXBsZXRlID8gbW92ZVJlc3BvbnNlT3V0Y29tZVRvb2xzQWZ0ZXJGaW5hbFJlc3BvbnNlKHJlc3BvbnNlQ29udGVudCkgOiByZXNwb25zZUNvbnRlbnQpKTtcblx0XHRcdGlmIChlbGVtZW50LmNvZGVDaXRhdGlvbnMubGVuZ3RoKSB7XG5cdFx0XHRcdGNvbnRlbnQucHVzaCh7IGtpbmQ6ICdjb2RlQ2l0YXRpb25zJywgY2l0YXRpb25zOiBlbGVtZW50LmNvZGVDaXRhdGlvbnMgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQubW9kZWwucmVzcG9uc2UgPT09IGVsZW1lbnQubW9kZWwuZW50aXJlUmVzcG9uc2UgJiYgIWVsZW1lbnQuaXNDYW5jZWxlZCAmJiBlbGVtZW50LmVycm9yRGV0YWlscz8ubWVzc2FnZSAmJiBlbGVtZW50LmVycm9yRGV0YWlscy5tZXNzYWdlICE9PSBjYW5jZWxlZE5hbWUpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh7IGtpbmQ6ICdlcnJvckRldGFpbHMnLCBlcnJvckRldGFpbHM6IGVsZW1lbnQuZXJyb3JEZXRhaWxzLCBpc0xhc3Q6IGdldFN0aWNreVNjcm9sbFRhcmdldEl0ZW0odGhpcy52aWV3TW9kZWw/LmdldEl0ZW1zKCkgPz8gW10pID09PSBlbGVtZW50IH0pO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQgPSB0aGlzLmdldENoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KGVsZW1lbnQpO1xuXHRcdGlmIChmaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KSB7XG5cdFx0XHRjb250ZW50LnB1c2goZmlsZUNoYW5nZXNTdW1tYXJ5UGFydCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHVyblBpbGxzUGFydCA9IHRoaXMuZ2V0Q2hhdFR1cm5QaWxsc1BhcnQoZWxlbWVudCk7XG5cdFx0aWYgKHR1cm5QaWxsc1BhcnQpIHtcblx0XHRcdGNvbnRlbnQucHVzaCh0dXJuUGlsbHNQYXJ0KTtcblx0XHR9XG5cblx0XHRjb25zdCB3b3JraW5nUHJvZ3Jlc3MgPSB0aGlzLnNob3VsZFNob3dXb3JraW5nUHJvZ3Jlc3MoZWxlbWVudCwgY29udGVudCwgZmFsc2UsIHRlbXBsYXRlRGF0YSk7XG5cdFx0aWYgKHdvcmtpbmdQcm9ncmVzcykge1xuXHRcdFx0Y29udGVudC5wdXNoKHdvcmtpbmdQcm9ncmVzcyk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgZGlmZiA9IHRoaXMuZGlmZih0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA/PyBbXSwgY29udGVudCwgZWxlbWVudCk7XG5cdFx0dGhpcy5yZW5kZXJDaGF0Q29udGVudERpZmYoZGlmZiwgY29udGVudCwgZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0dGhpcy5maW5hbGl6ZUNvbXBsZXRlZFJlc3BvbnNlUGFydHMoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0fVxuXG5cdHByaXZhdGUgZmluYWxpemVDb21wbGV0ZWRSZXNwb25zZVBhcnRzKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKCFlbGVtZW50LmlzQ29tcGxldGUgJiYgIWVsZW1lbnQuaXNDYW5jZWxlZCkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBsYXN0VGhpbmtpbmcgPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdGlmIChsYXN0VGhpbmtpbmc/LmRvbU5vZGUgJiYgbGFzdFRoaW5raW5nLmdldElzQWN0aXZlKCkpIHtcblx0XHRcdGxhc3RUaGlua2luZy5maW5hbGl6ZVRpdGxlSWZEZWZhdWx0KCk7XG5cdFx0XHRsYXN0VGhpbmtpbmcubWFya0FzSW5hY3RpdmUoKTtcblx0XHR9XG5cdFx0dGhpcy5maW5hbGl6ZUFsbFN1YmFnZW50UGFydHModGVtcGxhdGVEYXRhLCB0cnVlKTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd1dvcmtpbmdQcm9ncmVzcyhlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsLCBwYXJ0c1RvUmVuZGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdLCBtb3JlQ29udGVudEF2YWlsYWJsZTogYm9vbGVhbiwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdFdvcmtpbmdQcm9ncmVzcyB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKGVsZW1lbnQuYWdlbnRPclNsYXNoQ29tbWFuZERldGVjdGVkIHx8IHRoaXMucmVuZGVyZXJPcHRpb25zLnJlbmRlclN0eWxlID09PSAnbWluaW1hbCcgfHwgZWxlbWVudC5pc0NvbXBsZXRlIHx8ICFjaGVja01vZGVPcHRpb24odGhpcy5kZWxlZ2F0ZS5jdXJyZW50Q2hhdE1vZGUoKSwgdGhpcy5yZW5kZXJlck9wdGlvbnMucHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBzaG93IHdvcmtpbmcgcHJvZ3Jlc3Mgd2hpbGUgYW4gdW5yZXNvbHZlZCBwbGFuIHJldmlldyBpcyBpblxuXHRcdC8vIHRoZSByZXNwb25zZS4gVGhlIHBsYW4gcmV2aWV3IHdpZGdldCBzdXJmYWNlcyBpdHMgb3duIFwiUGxhbiByZXZpZXdcblx0XHQvLyByZXF1aXJlZFwiIHByb2dyZXNzIHJvdyBhbmQgaXMgYmxvY2tpbmcgb24gdXNlciBpbnB1dCwgc28gYSBzZWNvbmRcblx0XHQvLyB3b3JraW5nIGluZGljYXRvciBiZWxvdyBpdCBpcyByZWR1bmRhbnQuIFRoaXMgbXVzdCBydW4gYmVmb3JlIGFueVxuXHRcdC8vIHNldHRpbmdzL21vZGUtZHJpdmVuIGJyYW5jaGVzIHNvIGl0IGFwcGxpZXMgcmVnYXJkbGVzcyBvZlxuXHRcdC8vIHBlcnNpc3RlbnQtcHJvZ3Jlc3MgLyBzaGltbWVyIC8gcHJvZ3Jlc3NNZXNzYWdlQXRCb3R0b21PZlJlc3BvbnNlLlxuXHRcdGlmIChwYXJ0c1RvUmVuZGVyLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICdwbGFuUmV2aWV3JyAmJiAhcGFydC5pc1VzZWQpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGlmIChlbmRzV2l0aEFjdGl2ZVN1YmFnZW50Q29udGVudChwYXJ0c1RvUmVuZGVyKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTaG93IGNvbmZpcm1hdGlvbiBwcm9ncmVzcyB3aGlsZSBhIG5vbi1zdWJhZ2VudCBjb25maXJtYXRpb24gY2Fyb3VzZWwgaXMgYWN0aXZlIGFib3ZlIHRoZSBpbnB1dC5cblx0XHRpZiAoaXNSZXNwb25zZVZNKGVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICh3aWRnZXQ/LmlucHV0UGFydC5oYXNBY3RpdmVUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWwpIHtcblx0XHRcdFx0Y29uc3Qgbm9uU3ViYWdlbnRDb25maXJtYXRpb25Db3VudCA9IHRoaXMuZ2V0UGVuZGluZ1Rvb2xDb25maXJtYXRpb25Db3VudChwYXJ0c1RvUmVuZGVyLCBmYWxzZSk7XG5cdFx0XHRcdGlmIChub25TdWJhZ2VudENvbmZpcm1hdGlvbkNvdW50ID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiB7XG5cdFx0XHRcdFx0XHRraW5kOiAnd29ya2luZycsXG5cdFx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHRoaXMuZ2V0Q29uZmlybWF0aW9uUGVuZGluZ0xhYmVsKG5vblN1YmFnZW50Q29uZmlybWF0aW9uQ291bnQpKVxuXHRcdFx0XHRcdH07XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAodGhpcy5nZXRQZW5kaW5nVG9vbENvbmZpcm1hdGlvbkNvdW50KHBhcnRzVG9SZW5kZXIsIHRydWUpID4gMCkge1xuXHRcdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRcdGtpbmQ6ICd3b3JraW5nJyxcblx0XHRcdFx0XHRjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoKS5hcHBlbmRUZXh0KHRoaXMuZ2V0Q29uZmlybWF0aW9uUGVuZGluZ0xhYmVsKDEpKVxuXHRcdFx0XHR9O1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdGlmIChpc1dhaXRpbmdGb3JNY3BTZXJ2ZXJzKHBhcnRzVG9SZW5kZXIpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdQYXJ0cyA9IGdldFdvcmtpbmdQcm9ncmVzc1JlbGV2YW50UGFydHMocGFydHNUb1JlbmRlcik7XG5cdFx0Y29uc3QgbGFzdFBhcnQgPSBmaW5kTGFzdE1lYW5pbmdmdWxQYXJ0KHdvcmtpbmdQYXJ0cyk7XG5cdFx0Y29uc3QgZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbiA9IGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb25JbnRlcmFjdGlvbih3b3JraW5nUGFydHMpO1xuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyB3b3JraW5nIGlmIGEgc3RyZWFtaW5nIHRvb2wgaW52b2NhdGlvbiBpcyBhbHJlYWR5IHByZXNlbnRcblx0XHRpZiAod29ya2luZ1BhcnRzLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc1N0cmVhbWluZyhwYXJ0KSkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3Qgc2hvdyB3b3JraW5nIHNwaW5uZXIgd2hlbiB0aGVyZSdzIGFuIGluLXByb2dyZXNzIE1DUCB0b29sIC0gTUNQIHRvb2xzIGhhdmUgdGhlaXIgb3duIHByb2dyZXNzIGluZGljYXRvclxuXHRcdGlmICh3b3JraW5nUGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0NvbXBsZXRlKHBhcnQpICYmIGlzTWNwVG9vbEludm9jYXRpb24ocGFydCkpKSB7XG5cdFx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHRcdH1cblxuXHRcdC8vIG5ldmVyIHNob3cgd29ya2luZyBwcm9ncmVzcyB3aGVuIHRoZXJlIGlzIGFuIGFjdGl2ZSB0aGlua2luZyBwaWVjZVxuXHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0aWYgKGxhc3RUaGlua2luZyAmJiAhZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBOZXZlciBzaG93IHdvcmtpbmcgd2hlbiB0aGUgbGFzdCBwYXJ0IGlzIGEgdG9vbCBpbnZvY2F0aW9uIHRoYXQgaXMgYXR0YWNoZWQgdG8gdGhpbmtpbmcsXG5cdFx0Ly8gb3IgKndpbGwgYmUqIGF0dGFjaGVkIHRvIHRoaW5raW5nIGR1cmluZyB0aGUgdXBjb21pbmcgcmVuZGVyIHBhc3Ncblx0XHRpZiAobGFzdFBhcnQgJiYgKGxhc3RQYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgbGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpKSB7XG5cdFx0XHRpZiAobGFzdFBhcnQuaXNBdHRhY2hlZFRvVGhpbmtpbmcpIHtcblx0XHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgaXNFZmZlY3RpdmVseUhpZGRlblRvb2xJbnZvY2F0aW9uID0gSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKGxhc3RQYXJ0KTtcblx0XHRcdGNvbnN0IGNvbGxhcHNlZFRvb2xzTW9kZSA9IHRoaXMuY29uZmlnU2VydmljZS5nZXRWYWx1ZTxDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlPignY2hhdC5hZ2VudC50aGlua2luZy5jb2xsYXBzZWRUb29scycpO1xuXHRcdFx0aWYgKCFpc0VmZmVjdGl2ZWx5SGlkZGVuVG9vbEludm9jYXRpb24gJiYgY29sbGFwc2VkVG9vbHNNb2RlICE9PSBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlLk9mZiAmJiB0aGlzLnNob3VsZFBpblBhcnQobGFzdFBhcnQsIGlzUmVzcG9uc2VWTShlbGVtZW50KSA/IGVsZW1lbnQgOiB1bmRlZmluZWQpKSB7XG5cdFx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgaGFzUmVuZGVyZWRUaGlua2luZ1BhcnQgPSAodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPz8gW10pLnNvbWUocGFydCA9PiBwYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQpO1xuXHRcdGNvbnN0IGhhc0VkaXRQaWxsTWFya2Rvd24gPSB3b3JraW5nUGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgdGhpcy5oYXNFZGl0Q29kZWJsb2NrVXJpKHBhcnQpKTtcblx0XHRpZiAoaGFzUmVuZGVyZWRUaGlua2luZ1BhcnQgJiYgaGFzRWRpdFBpbGxNYXJrZG93bikge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRpZiAoXG5cdFx0XHQhbGFzdFBhcnQgfHxcblx0XHRcdGxhc3RQYXJ0LmtpbmQgPT09ICdyZWZlcmVuY2VzJyB8fFxuXHRcdFx0KGxhc3RQYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmICFtb3JlQ29udGVudEF2YWlsYWJsZSAmJiB0aGlzLmhhc0JlZW5DYXVnaHRVcExvbmdFbm91Z2goZWxlbWVudCkpIHx8XG5cdFx0XHQoKGxhc3RQYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgbGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIChJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUobGFzdFBhcnQpIHx8IElDaGF0VG9vbEludm9jYXRpb24uaXNFZmZlY3RpdmVseUhpZGRlbihsYXN0UGFydCkpKSB8fFxuXHRcdFx0KChsYXN0UGFydC5raW5kID09PSAndGV4dEVkaXRHcm91cCcgfHwgbGFzdFBhcnQua2luZCA9PT0gJ25vdGVib29rRWRpdEdyb3VwJykgJiYgbGFzdFBhcnQuZG9uZSAmJiAhd29ya2luZ1BhcnRzLnNvbWUocGFydCA9PiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShwYXJ0KSkpIHx8XG5cdFx0XHQobGFzdFBhcnQua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcgJiYgIXdvcmtpbmdQYXJ0cy5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUocGFydCkpKSB8fFxuXHRcdFx0KGxhc3RQYXJ0LmtpbmQgPT09ICdwcm9ncmVzc1Rhc2snICYmIGxhc3RQYXJ0LmRlZmVycmVkLmlzU2V0dGxlZCkgfHxcblx0XHRcdGVuZHNXaXRoQ29tcGxldGVkUXVlc3Rpb24gfHxcblx0XHRcdGxhc3RQYXJ0LmtpbmQgPT09ICdtY3BTZXJ2ZXJzU3RhcnRpbmcnIHx8XG5cdFx0XHRsYXN0UGFydC5raW5kID09PSAnbWNwQXV0aGVudGljYXRpb25SZXF1aXJlZCcgfHxcblx0XHRcdGxhc3RQYXJ0LmtpbmQgPT09ICdtY3BTZXJ2ZXJzU3RhcnRpbmdTbG93JyB8fFxuXHRcdFx0bGFzdFBhcnQua2luZCA9PT0gJ2Rpc2FibGVkQ2xhdWRlSG9va3MnIHx8XG5cdFx0XHRsYXN0UGFydC5raW5kID09PSAnaG9vaydcblx0XHQpIHtcblx0XHRcdHJldHVybiB7IGtpbmQ6ICd3b3JraW5nJyB9O1xuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGdldFBlbmRpbmdUb29sQ29uZmlybWF0aW9uQ291bnQocGFydHM6IFJlYWRvbmx5QXJyYXk8SUNoYXRSZW5kZXJlckNvbnRlbnQgfCBJQ2hhdFByb2dyZXNzUmVzcG9uc2VDb250ZW50PiwgaW5jbHVkZVN1YmFnZW50Q29uZmlybWF0aW9uczogYm9vbGVhbik6IG51bWJlciB7XG5cdFx0cmV0dXJuIHBhcnRzLmZpbHRlcihwYXJ0ID0+IHtcblx0XHRcdGlmIChwYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBzdGF0ZSA9IHBhcnQuc3RhdGUuZ2V0KCk7XG5cdFx0XHRyZXR1cm4gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJlxuXHRcdFx0XHQhIXN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSAmJlxuXHRcdFx0XHRwYXJ0LnByZXNlbnRhdGlvbiAhPT0gJ2hpZGRlbicgJiZcblx0XHRcdFx0cGFydC5zb3VyY2UudHlwZSAhPT0gJ21jcCcgJiZcblx0XHRcdFx0KGlzU3ViYWdlbnRUb29sSW52b2NhdGlvbihwYXJ0KSA9PT0gaW5jbHVkZVN1YmFnZW50Q29uZmlybWF0aW9ucyk7XG5cdFx0fSkubGVuZ3RoO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDb25maXJtYXRpb25QZW5kaW5nTGFiZWwoY291bnQ6IG51bWJlcik6IHN0cmluZyB7XG5cdFx0cmV0dXJuIGNvdW50ID09PSAxID9cblx0XHRcdGxvY2FsaXplKCdjb25maXJtYXRpb25QZW5kaW5nJywgXCIxIGNvbmZpcm1hdGlvbiBwZW5kaW5nXCIpIDpcblx0XHRcdGxvY2FsaXplKCdjb25maXJtYXRpb25zUGVuZGluZycsIFwiezB9IGNvbmZpcm1hdGlvbnMgcGVuZGluZ1wiLCBjb3VudCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZVdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWRQYXJ0cyA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzO1xuXHRcdGlmICghcmVuZGVyZWRQYXJ0cykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGZvciAobGV0IGkgPSByZW5kZXJlZFBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KSB7XG5cdFx0XHRcdHBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0XHRwYXJ0LmRvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdFx0XHRyZW5kZXJlZFBhcnRzLnNwbGljZShpLCAxKTtcblx0XHRcdFx0dGhpcy5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdC8vIERlZmVyIG11dGF0aW9uIG9mIGB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0c2AgKHZpYSBgcmVtb3ZlV29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnRgKVxuXHRcdC8vIHRvIGEgbWljcm90YXNrLiBUaGlzIG1ldGhvZCBpcyBpbnZva2VkIGZyb20gdG9vbCBhdXRvcnVucywgd2hpY2ggZmlyZSBzeW5jaHJvbm91c2x5IGluc2lkZVxuXHRcdC8vIGByZW5kZXJDaGF0Q29udGVudERpZmZgIHdoaWxlIHRoZSBhcnJheSBpcyBiZWluZyBpdGVyYXRlZCBcdTIwMTQgc3BsaWNpbmcgaXQgbWlkLXJlbmRlciB3b3VsZFxuXHRcdC8vIG9ycGhhbiBzdWJzZXF1ZW50IHBhcnRzIGFuZCBsZWF2ZSBkZXRhY2hlZCBET00gbm9kZXMgcmVmZXJlbmNlZCBmcm9tIGByZW5kZXJlZFBhcnRzYC5cblx0XHQvLyBDYXB0dXJlIHRoZSBvcmlnaW5hdGluZyBlbGVtZW50IHNvIHdlIGJhaWwgb3V0IGlmIHRoZSB0ZW1wbGF0ZSB3YXMgcmVjeWNsZWQgZm9yIGEgZGlmZmVyZW50IG9uZS5cblx0XHRjb25zdCBvcmlnaW5hbEVsZW1lbnQgPSB0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQ7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudCAhPT0gb3JpZ2luYWxFbGVtZW50KSB7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblx0XHRcdHRoaXMuZG9VcGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSBkb1VwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgZWxlbWVudCA9IHRlbXBsYXRlRGF0YS5jdXJyZW50RWxlbWVudDtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHBlbmRpbmdDb25maXJtYXRpb25Db3VudCA9IHRoaXMuZ2V0UGVuZGluZ1Rvb2xDb25maXJtYXRpb25Db3VudChlbGVtZW50LnJlc3BvbnNlLnZhbHVlLCBmYWxzZSk7XG5cdFx0aWYgKHBlbmRpbmdDb25maXJtYXRpb25Db3VudCA9PT0gMCkge1xuXHRcdFx0dGhpcy5yZW1vdmVXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHdvcmtpbmdQcm9ncmVzc1BhcnQgPSB0aGlzLmdldFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KHRlbXBsYXRlRGF0YSk7XG5cdFx0aWYgKHdvcmtpbmdQcm9ncmVzc1BhcnQpIHtcblx0XHRcdHdvcmtpbmdQcm9ncmVzc1BhcnQudXBkYXRlV29ya2luZ0NvbnRlbnQobmV3IE1hcmtkb3duU3RyaW5nKCkuYXBwZW5kVGV4dCh0aGlzLmdldENvbmZpcm1hdGlvblBlbmRpbmdMYWJlbChwZW5kaW5nQ29uZmlybWF0aW9uQ291bnQpKSk7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBnZXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IENoYXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcmVuZGVyZWRQYXJ0cyA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzO1xuXHRcdGlmICghcmVuZGVyZWRQYXJ0cykge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRmb3IgKGxldCBpID0gcmVuZGVyZWRQYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHJlbmRlcmVkUGFydHNbaV07XG5cdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCkge1xuXHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBjcmVhdGVVcGRhdGVXb3JraW5nUHJvZ3Jlc3NPbkNvbmZpcm1hdGlvbkVuZCh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJRGlzcG9zYWJsZSB8IHVuZGVmaW5lZCB7XG5cdFx0aWYgKHRoaXMud29ya2luZ1Byb2dyZXNzQ29uZmlybWF0aW9uRW5kTGlzdGVuZXJzLmhhcyh0b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0dGhpcy53b3JraW5nUHJvZ3Jlc3NDb25maXJtYXRpb25FbmRMaXN0ZW5lcnMuYWRkKHRvb2xJbnZvY2F0aW9uKTtcblx0XHRsZXQgd2FzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiA9IGZhbHNlO1xuXHRcdGNvbnN0IGRpc3Bvc2FibGUgPSBhdXRvcnVuKHJlYWRlciA9PiB7XG5cdFx0XHRjb25zdCBjdXJyZW50U3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHRjb25zdCBpc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbjtcblx0XHRcdGlmICh3YXNXYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmICFpc1dhaXRpbmdGb3JDb25maXJtYXRpb24pIHtcblx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHR0aGlzLndvcmtpbmdQcm9ncmVzc0NvbmZpcm1hdGlvbkVuZExpc3RlbmVycy5kZWxldGUodG9vbEludm9jYXRpb24pO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdH1cblx0XHRcdHdhc1dhaXRpbmdGb3JDb25maXJtYXRpb24gPSBpc1dhaXRpbmdGb3JDb25maXJtYXRpb247XG5cdFx0fSk7XG5cblx0XHRyZXR1cm4gdG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdHRoaXMud29ya2luZ1Byb2dyZXNzQ29uZmlybWF0aW9uRW5kTGlzdGVuZXJzLmRlbGV0ZSh0b29sSW52b2NhdGlvbik7XG5cdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgaGFzQmVlbkNhdWdodFVwTG9uZ0Vub3VnaChlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0Y29uc3QgbGFzdFJlbmRlclRpbWUgPSBlbGVtZW50LnJlbmRlckRhdGE/Lmxhc3RSZW5kZXJUaW1lO1xuXHRcdGlmICh0eXBlb2YgbGFzdFJlbmRlclRpbWUgIT09ICdudW1iZXInIHx8IGxhc3RSZW5kZXJUaW1lID09PSAwKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiAoRGF0ZS5ub3coKSAtIGxhc3RSZW5kZXJUaW1lKSA+PSBXT1JLSU5HX0NBVUdIVF9VUF9ERUJPVU5DRV9NUztcblx0fVxuXG5cdC8qKlxuXHQgKiBSZXR1cm5zIHRoZSBsYXN0IHBhcnQgdGhhdCB2aXN1YWxseSBjb250cmlidXRlcyB0byB0aGUgcmVzcG9uc2UsIHNraXBwaW5nXG5cdCAqIGVtcHR5IG1hcmtkb3duIHBsYWNlaG9sZGVycy5cblx0ICovXG5cdC8qKlxuXHQgKiBUcnVlIHdoaWxlIHdlIGhhdmUgY2F1Z2h0IHVwIHRvIHN0cmVhbWVkIG1hcmtkb3duIGJ1dCBhcmUgc3RpbGwgd2l0aGluIHRoZVxuXHQgKiB7QGxpbmsgV09SS0lOR19DQVVHSFRfVVBfREVCT1VOQ0VfTVN9IHdpbmRvdyBiZWZvcmUgdGhlIHdvcmtpbmcgaW5kaWNhdG9yXG5cdCAqIHNob3VsZCBhcHBlYXIuIFRoZSBwcm9ncmVzc2l2ZSByZW5kZXIgbG9vcCBrZWVwcyBwb2xsaW5nIGluIHRoaXMgc3RhdGUgc29cblx0ICogdGhlIGluZGljYXRvciBjYW4gc3RpbGwgc3VyZmFjZSBhZnRlciBhIGdlbnVpbmUgcGF1c2UsIGluc3RlYWQgb2YgYmVpbmdcblx0ICogZHJvcHBlZCB3aGVuIHRoZSBsb29wIHdvdWxkIG90aGVyd2lzZSBzdG9wICh0aGUgZGVib3VuY2UgaXRzZWxmIGF2b2lkc1xuXHQgKiBmbGlja2VyIGR1cmluZyBub3JtYWwgdG9rZW4gc3RyZWFtaW5nKS5cblx0ICovXG5cdHByaXZhdGUgaXNXb3JraW5nUHJvZ3Jlc3NEZWJvdW5jZVBlbmRpbmcoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgcGFydHNUb1JlbmRlcjogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IGJvb2xlYW4ge1xuXHRcdGlmIChlbGVtZW50LmlzQ29tcGxldGUpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cdFx0Ly8gVGhlIGluZGljYXRvciBpcyBhbHJlYWR5IHNob3dpbmcsIHNvIHRoZXJlIGlzIG5vdGhpbmcgcGVuZGluZy5cblx0XHRpZiAocGFydHNUb1JlbmRlci5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAnd29ya2luZycpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdC8vIE9ubHkgdGhlIHN0cmVhbWVkLW1hcmtkb3duIFwiY2F1Z2h0IHVwXCIgY2FzZSBpcyBnYXRlZCBiZWhpbmQgdGhlIGRlYm91bmNlLlxuXHRcdHJldHVybiBmaW5kTGFzdE1lYW5pbmdmdWxQYXJ0KGdldFdvcmtpbmdQcm9ncmVzc1JlbGV2YW50UGFydHMocGFydHNUb1JlbmRlcikpPy5raW5kID09PSAnbWFya2Rvd25Db250ZW50JyAmJiAhdGhpcy5oYXNCZWVuQ2F1Z2h0VXBMb25nRW5vdWdoKGVsZW1lbnQpO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRDaGF0RmlsZUNoYW5nZXNTdW1tYXJ5UGFydChlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogSUNoYXRDaGFuZ2VzU3VtbWFyeVBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICh0aGlzLnNob3VsZFNob3dQaWxsc1N1bW1hcnkoZWxlbWVudCkgfHwgIXRoaXMuc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeShlbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0Ly8gQWdlbnQgaG9zdCBzZXNzaW9ucyBjb21wdXRlIHRoZWlyIHBlci10dXJuIGNoYW5nZXMgc2VydmVyLXNpZGUgYW5kXG5cdFx0Ly8gc3VwcGx5IHRoZW0gdmlhIElDaGF0UmVzcG9uc2VGaWxlQ2hhbmdlc1NlcnZpY2U7IHRoZSBzdW1tYXJ5IHBhcnRcblx0XHQvLyByZXNvbHZlcyB0aGVtIGFzeW5jaHJvbm91c2x5IGFuZCBzZWxmLWhpZGVzIHdoZW4gdGhlIHR1cm4gcHJvZHVjZWQgbm9cblx0XHQvLyBlZGl0cy4gT3RoZXIgc2Vzc2lvbnMgc3VyZmFjZSBkaWZmIGRhdGEgdGhyb3VnaCB0aGUgY2hhdCBlZGl0aW5nXG5cdFx0Ly8gc2Vzc2lvbiwgd2hpY2ggb25seSBoYXMgZGF0YSB3aGVuIHRoZSByZXNwb25zZSBjYXJyaWVzIHRleHQvbm90ZWJvb2tcblx0XHQvLyBlZGl0IGdyb3VwcyBcdTIwMTQgc28gc2tpcCB0aGUgc3VtbWFyeSBmb3IgdGhvc2UgdW5sZXNzIHN1Y2ggYSBncm91cCBpc1xuXHRcdC8vIHByZXNlbnQuXG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghaXNBZ2VudEhvc3RUYXJnZXQoc2Vzc2lvblR5cGUpICYmXG5cdFx0XHQhZWxlbWVudC5tb2RlbC5lbnRpcmVSZXNwb25zZS52YWx1ZS5zb21lKHBhcnQgPT4gcGFydC5raW5kID09PSAndGV4dEVkaXRHcm91cCcgfHwgcGFydC5raW5kID09PSAnbm90ZWJvb2tFZGl0R3JvdXAnKSkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBraW5kOiAnY2hhbmdlc1N1bW1hcnknLCByZXF1ZXN0SWQ6IGVsZW1lbnQucmVxdWVzdElkLCBzZXNzaW9uUmVzb3VyY2U6IGVsZW1lbnQuc2Vzc2lvblJlc291cmNlIH07XG5cdH1cblxuXHRwcml2YXRlIGdldENoYXRUdXJuUGlsbHNQYXJ0KGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBJQ2hhdFR1cm5QaWxsc1BhcnQgfCB1bmRlZmluZWQge1xuXHRcdC8vIFRoZSB0dXJuIHN0YXR1cyBwaWxscyBtaXJyb3IgdGhlIGZsb2F0aW5nIHBpbGxzIHNob3duIGFib3ZlIHRoZSBpbnB1dFxuXHRcdC8vIHdoaWxlIHRoZSB0dXJuIHN0cmVhbXMuIFRoZXkgYXJlIG9wdC1pbiBwZXIgcGlsbCwgb25seSBhcHBseSB0byBhZ2VudFxuXHRcdC8vIGhvc3Qgc2Vzc2lvbnMgKHdoaWNoIHN1cHBseSBhdXRob3JpdGF0aXZlIHBlci10dXJuIGNoYW5nZXMgdmlhXG5cdFx0Ly8gSUNoYXRSZXNwb25zZUZpbGVDaGFuZ2VzU2VydmljZSkgYW5kLCBsaWtlIHRoZSBwaWxscyBhYm92ZSB0aGUgaW5wdXQsXG5cdFx0Ly8gYXBwZWFyIG9uY2UgdGhlIHR1cm4gaXMgY29tcGxldGUuXG5cdFx0aWYgKCF0aGlzLnNob3VsZFNob3dQaWxsc1N1bW1hcnkoZWxlbWVudCkpIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHJldHVybiB7XG5cdFx0XHRraW5kOiAndHVyblBpbGxzJyxcblx0XHRcdHJlcXVlc3RJZDogZWxlbWVudC5yZXF1ZXN0SWQsXG5cdFx0XHRzZXNzaW9uUmVzb3VyY2U6IGVsZW1lbnQuc2Vzc2lvblJlc291cmNlLFxuXHRcdFx0aXNMYXN0VHVybjogZWxlbWVudC5zZXNzaW9uLm1vZGVsLmxhc3RSZXF1ZXN0Py5pZCA9PT0gZWxlbWVudC5yZXF1ZXN0SWQsXG5cdFx0fTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ2hhdFJlcXVlc3QoZWxlbWVudDogSUNoYXRSZXF1ZXN0Vmlld01vZGVsLCBpbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSkge1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1yZXNwb25zZS1sb2FkaW5nJywgZmFsc2UpO1xuXHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIuY2xhc3NMaXN0LnRvZ2dsZSgncGVuZGluZy1yZXF1ZXN0JywgISFlbGVtZW50LnBlbmRpbmdLaW5kKTtcblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ3N5c3RlbS1pbml0aWF0ZWQtcmVxdWVzdCcsICEhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCk7XG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCd0ZXJtaW5hbC1jb21tYW5kLXJlcXVlc3QnLCAhZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCAmJiBlbGVtZW50LmlzVGVybWluYWxDb21tYW5kKTtcblxuXHRcdC8vIFN5c3RlbS1pbml0aWF0ZWQgcmVxdWVzdHMgcmVuZGVyIGFzIGNvbXBhY3QgcHJvZ3Jlc3Mtc3R5bGUgbWVzc2FnZXNcblx0XHRpZiAoZWxlbWVudC5pc1N5c3RlbUluaXRpYXRlZCkge1xuXHRcdFx0dGhpcy5yZW5kZXJTeXN0ZW1Jbml0aWF0ZWRSZXF1ZXN0KGVsZW1lbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKGVsZW1lbnQucGVuZGluZ0tpbmQgJiYgdGhpcy5fcGVuZGluZ0RyYWdDb250cm9sbGVyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmRhdGFzZXQucGVuZGluZ1JlcXVlc3RJZCA9IGVsZW1lbnQuaWQ7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmRhdGFzZXQucGVuZGluZ0tpbmQgPSBlbGVtZW50LnBlbmRpbmdLaW5kO1xuXG5cdFx0XHRjb25zdCBzYW1lS2luZENvdW50ID0gKHRoaXMudmlld01vZGVsPy5tb2RlbC5nZXRQZW5kaW5nUmVxdWVzdHMoKSA/PyBbXSkuZmlsdGVyKHAgPT4gcC5raW5kID09PSBlbGVtZW50LnBlbmRpbmdLaW5kKS5sZW5ndGg7XG5cdFx0XHRpZiAoc2FtZUtpbmRDb3VudCA+IDEpIHtcblx0XHRcdFx0Y29uc3QgaGFuZGxlID0gZG9tLiQoJy5jaGF0LXBlbmRpbmctZHJhZy1oYW5kbGUnICsgVGhlbWVJY29uLmFzQ1NTU2VsZWN0b3IoQ29kaWNvbi5ncmlwcGVyKSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIucHJlcGVuZChoYW5kbGUpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEuZHJhZ0hhbmRsZSA9IGhhbmRsZTtcblx0XHRcdFx0dGhpcy5fcGVuZGluZ0RyYWdDb250cm9sbGVyLmF0dGFjaERyYWdIYW5kbGUoZWxlbWVudCwgaGFuZGxlLCB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCB0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5pZCA9PT0gdGhpcy52aWV3TW9kZWw/LmVkaXRpbmc/LmlkKSB7XG5cdFx0XHR0aGlzLl9vbkRpZFJlcmVuZGVyLmZpcmUodGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oJ2NoYXQuZWRpdFJlcXVlc3RzJykgIT09ICdub25lJyAmJiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5lZGl0YWJsZSkge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLCBkb20uRXZlbnRUeXBlLktFWV9ET1dOLCBlID0+IHtcblx0XHRcdFx0Y29uc3QgZXYgPSBuZXcgU3RhbmRhcmRLZXlib2FyZEV2ZW50KGUpO1xuXHRcdFx0XHRpZiAoZXYuZXF1YWxzKEtleUNvZGUuU3BhY2UpIHx8IGV2LmVxdWFscyhLZXlDb2RlLkVudGVyKSkge1xuXHRcdFx0XHRcdGlmICh0aGlzLnZpZXdNb2RlbD8uZWRpdGluZz8uaWQgIT09IGVsZW1lbnQuaWQpIHtcblx0XHRcdFx0XHRcdGV2LnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0XHRldi5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHRcdHRoaXMuX29uRGlkQ2xpY2tSZXF1ZXN0LmZpcmUodGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHRsZXQgY29udGVudDogSUNoYXRSZW5kZXJlckNvbnRlbnRbXSA9IFtdO1xuXHRcdGNvbnN0IGV4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZXMgPSBlbGVtZW50LnZhcmlhYmxlcy5maWx0ZXIoaXNFeHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVFbnRyeSk7XG5cdFx0Y29uc3QgZXhwbGljaXRJbWFnZVZhcmlhYmxlcyA9IGV4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+IHZhcmlhYmxlLmtpbmQgPT09ICdpbWFnZScpO1xuXHRcdGNvbnN0IGV4cGxpY2l0RmlsZU9yRGlyZWN0b3J5VmFyaWFibGVzID0gZWxlbWVudC52YXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+IHZhcmlhYmxlLmtpbmQgPT09ICdmaWxlJyB8fCB2YXJpYWJsZS5raW5kID09PSAnZGlyZWN0b3J5JyB8fCBpc1Bhc3RlVmFyaWFibGVFbnRyeSh2YXJpYWJsZSkpO1xuXHRcdGNvbnN0IG90aGVyVmFyaWFibGVzID0gZWxlbWVudC52YXJpYWJsZXMuZmlsdGVyKHZhcmlhYmxlID0+ICFpc0V4cGxpY2l0RmlsZU9ySW1hZ2VWYXJpYWJsZUVudHJ5KHZhcmlhYmxlKSAmJiAhaXNQYXN0ZVZhcmlhYmxlRW50cnkodmFyaWFibGUpKTtcblx0XHRpZiAoIWVsZW1lbnQuY29uZmlybWF0aW9uKSB7XG5cdFx0XHRjb25zdCBtYXJrZG93biA9IGlzQ2hhdEZvbGxvd3VwKGVsZW1lbnQubWVzc2FnZSkgP1xuXHRcdFx0XHRlbGVtZW50Lm1lc3NhZ2UubWVzc2FnZSA6XG5cdFx0XHRcdHRoaXMubWFya2Rvd25EZWNvcmF0aW9uc1JlbmRlcmVyLmNvbnZlcnRQYXJzZWRSZXF1ZXN0VG9NYXJrZG93bihlbGVtZW50LnNlc3Npb25SZXNvdXJjZSwgZWxlbWVudC5tZXNzYWdlKTtcblx0XHRcdGNvbnN0IGF0dGFjaG1lbnRTdW1tYXJ5ID0gIWVsZW1lbnQubWVzc2FnZVRleHQudHJpbSgpICYmICFleHBsaWNpdEZpbGVPckltYWdlVmFyaWFibGVzLmxlbmd0aCA/IGdldEV4cGxpY2l0RmlsZU9ySW1hZ2VBdHRhY2htZW50U3VtbWFyeShlbGVtZW50LnZhcmlhYmxlcykgOiB1bmRlZmluZWQ7XG5cdFx0XHRjb25zdCByZXF1ZXN0TWFya2Rvd24gPSBtYXJrZG93bi50cmltKCkgPyBtYXJrZG93biA6IGF0dGFjaG1lbnRTdW1tYXJ5O1xuXHRcdFx0aWYgKHJlcXVlc3RNYXJrZG93bikge1xuXHRcdFx0XHRjb250ZW50ID0gW3sgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKHJlcXVlc3RNYXJrZG93biksIGtpbmQ6ICdtYXJrZG93bkNvbnRlbnQnIH1dO1xuXHRcdFx0fVxuXG5cdFx0XHRpZiAodGhpcy5yZW5kZXJlck9wdGlvbnMucmVuZGVyU3R5bGUgPT09ICdtaW5pbWFsJyAmJiAhZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QuYWRkKCdpbmxpbmUtcHJvZ3Jlc3MnKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QucmVtb3ZlKCdpbmxpbmUtcHJvZ3Jlc3MnKSkpO1xuXHRcdFx0XHRjb250ZW50LnB1c2goeyBjb250ZW50OiBuZXcgTWFya2Rvd25TdHJpbmcoJzxzcGFuPjwvc3Bhbj4nLCB7IHN1cHBvcnRIdG1sOiB0cnVlIH0pLCBraW5kOiAnbWFya2Rvd25Db250ZW50JyB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5jbGFzc0xpc3QucmVtb3ZlKCdpbmxpbmUtcHJvZ3Jlc3MnKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0Y29uc3QgaXNGaXJzdFJlcXVlc3QgPSB0aGlzLnZpZXdNb2RlbD8ubW9kZWwuZ2V0UmVxdWVzdHMoKVswXT8uaWQgPT09IGVsZW1lbnQuaWQ7XG5cdFx0aWYgKGVsZW1lbnQub3JpZ2luIHx8ICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmIGlzRmlyc3RSZXF1ZXN0KSkge1xuXHRcdFx0Y29uc3QgcmVxdWVzdE9yaWdpblBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRSZXF1ZXN0T3JpZ2luUGFydCwgZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIGVsZW1lbnQub3JpZ2luKTtcblx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5hcHBlbmRDaGlsZChyZXF1ZXN0T3JpZ2luUGFydC5kb21Ob2RlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHJlcXVlc3RPcmlnaW5QYXJ0KTtcblx0XHR9XG5cdFx0Y29uc3QgcGFydHM6IElDaGF0Q29udGVudFBhcnRbXSA9IFtdO1xuXHRcdGNvbnN0IGV4cGxpY2l0SW1hZ2VBdHRhY2htZW50c1BhcnQgPSBleHBsaWNpdEltYWdlVmFyaWFibGVzLmxlbmd0aCA/IHRoaXMucmVuZGVyQXR0YWNobWVudHMoZXhwbGljaXRJbWFnZVZhcmlhYmxlcywgZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcywgZWxlbWVudC5tb2RlbElkLCB0ZW1wbGF0ZURhdGEsIGVsZW1lbnQucmVzb2x2ZWRNb2RlbElkKSA6IHVuZGVmaW5lZDtcblx0XHRpZiAoZXhwbGljaXRJbWFnZUF0dGFjaG1lbnRzUGFydD8uZG9tTm9kZSkge1xuXHRcdFx0ZXhwbGljaXRJbWFnZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1hdHRhY2htZW50LWNhcmRzJywgJ2NoYXQtcmVxdWVzdC1pbWFnZS1hdHRhY2htZW50cycpO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGV4cGxpY2l0SW1hZ2VBdHRhY2htZW50c1BhcnQuZG9tTm9kZSk7XG5cdFx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChleHBsaWNpdEltYWdlQXR0YWNobWVudHNQYXJ0KTtcblx0XHR9XG5cdFx0Y29uc3QgZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0ID0gZXhwbGljaXRGaWxlT3JEaXJlY3RvcnlWYXJpYWJsZXMubGVuZ3RoID8gdGhpcy5yZW5kZXJBdHRhY2htZW50cyhleHBsaWNpdEZpbGVPckRpcmVjdG9yeVZhcmlhYmxlcywgZWxlbWVudC5jb250ZW50UmVmZXJlbmNlcywgZWxlbWVudC5tb2RlbElkLCB0ZW1wbGF0ZURhdGEpIDogdW5kZWZpbmVkO1xuXHRcdGlmIChleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQ/LmRvbU5vZGUpIHtcblx0XHRcdGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlLmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1hdHRhY2htZW50LWNhcmRzJywgJ2NoYXQtcmVxdWVzdC1maWxlLWF0dGFjaG1lbnRzJyk7XG5cdFx0XHRleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQuZG9tTm9kZS5zdHlsZS5kaXNwbGF5ID0gJ2ZsZXgnO1xuXHRcdFx0ZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0LmRvbU5vZGUuc3R5bGUuZmxleERpcmVjdGlvbiA9ICdjb2x1bW4nO1xuXHRcdFx0ZXhwbGljaXRGaWxlQXR0YWNobWVudHNQYXJ0LmRvbU5vZGUuc3R5bGUuYWxpZ25JdGVtcyA9ICdmbGV4LWVuZCc7XG5cdFx0XHRleHBsaWNpdEZpbGVBdHRhY2htZW50c1BhcnQuZG9tTm9kZS5zdHlsZS5mbGV4V3JhcCA9ICdub3dyYXAnO1xuXHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydC5kb21Ob2RlKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGV4cGxpY2l0RmlsZUF0dGFjaG1lbnRzUGFydCk7XG5cdFx0fVxuXHRcdGNvbnN0IGNvbnRlbnRDb250YWluZXIgPSB0ZW1wbGF0ZURhdGEudmFsdWU7XG5cblx0XHRsZXQgaW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWQgPSBmYWxzZTtcblx0XHRsZXQgY29kZUJsb2NrU3RhcnRJbmRleCA9IDA7XG5cdFx0Y29udGVudC5mb3JFYWNoKChkYXRhLCBjb250ZW50SW5kZXgpID0+IHtcblx0XHRcdGNvbnN0IGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0ID0ge1xuXHRcdFx0XHRlbGVtZW50LFxuXHRcdFx0XHRlbGVtZW50SW5kZXg6IGluZGV4LFxuXHRcdFx0XHRjb250ZW50SW5kZXg6IGNvbnRlbnRJbmRleCxcblx0XHRcdFx0Y29udGVudDogY29udGVudCxcblx0XHRcdFx0Y29udGFpbmVyOiB0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLFxuXHRcdFx0XHRlZGl0b3JQb29sOiB0aGlzLl9lZGl0b3JQb29sLFxuXHRcdFx0XHRkaWZmRWRpdG9yUG9vbDogdGhpcy5fZGlmZkVkaXRvclBvb2wsXG5cdFx0XHRcdGN1cnJlbnRXaWR0aDogdGhpcy5fY3VycmVudExheW91dFdpZHRoLFxuXHRcdFx0XHRvbkRpZENoYW5nZVZpc2liaWxpdHk6IHRoaXMuX29uRGlkQ2hhbmdlVmlzaWJpbGl0eS5ldmVudCxcblx0XHRcdFx0aW5saW5lVGV4dE1vZGVsczogdGhpcy5faW5saW5lVGV4dE1vZGVscyxcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleCxcblx0XHRcdFx0dHJlZVN0YXJ0SW5kZXg6IDAsIC8vIG5vIHRyZWVzIGluIHJlcXVlc3RzXG5cdFx0XHR9O1xuXHRcdFx0Y29uc3QgbmV3UGFydCA9IHRoaXMucmVuZGVyQ2hhdENvbnRlbnRQYXJ0KGRhdGEsIHRlbXBsYXRlRGF0YSwgY29udGV4dCk7XG5cdFx0XHRpZiAobmV3UGFydCkge1xuXG5cdFx0XHRcdGlmICh0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJEZXRlY3RlZENvbW1hbmRzV2l0aFJlcXVlc3Rcblx0XHRcdFx0XHQmJiAhaW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWRcblx0XHRcdFx0XHQmJiBlbGVtZW50LmFnZW50T3JTbGFzaENvbW1hbmREZXRlY3RlZCAmJiBlbGVtZW50LnNsYXNoQ29tbWFuZFxuXHRcdFx0XHRcdCYmIGRhdGEua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgLy8gVE9ETyB0aGlzIGlzIGZpc2h5IGJ1dCBJIGRpZG4ndCBmaW5kIGEgYmV0dGVyIHdheSB0byByZW5kZXIgb24gdGhlIHNhbWUgaW5saW5lIGFzIHRoZSBNRCByZXF1ZXN0IHBhcnRcblx0XHRcdFx0KSB7XG5cdFx0XHRcdFx0aWYgKG5ld1BhcnQuZG9tTm9kZSkge1xuXHRcdFx0XHRcdFx0bmV3UGFydC5kb21Ob2RlLnN0eWxlLmRpc3BsYXkgPSAnaW5saW5lLWZsZXgnO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRjb25zdCBjbWRQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QWdlbnRDb21tYW5kQ29udGVudFBhcnQsIGVsZW1lbnQuc2xhc2hDb21tYW5kLCAoKSA9PiB0aGlzLl9vbkRpZENsaWNrUmVydW5XaXRoQWdlbnRPckNvbW1hbmREZXRlY3Rpb24uZmlyZSh7IHNlc3Npb25SZXNvdXJjZTogZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIHJlcXVlc3RJZDogZWxlbWVudC5pZCB9KSk7XG5cdFx0XHRcdFx0Y29udGVudENvbnRhaW5lci5hcHBlbmRDaGlsZChjbWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdHBhcnRzLnB1c2goY21kUGFydCk7XG5cdFx0XHRcdFx0aW5saW5lU2xhc2hDb21tYW5kUmVuZGVyZWQgPSB0cnVlO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0aWYgKG5ld1BhcnQuZG9tTm9kZSAmJiAhbmV3UGFydC5kb21Ob2RlLnBhcmVudEVsZW1lbnQpIHtcblx0XHRcdFx0XHRjb250ZW50Q29udGFpbmVyLmFwcGVuZENoaWxkKG5ld1BhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdFx0cGFydHMucHVzaChuZXdQYXJ0KTtcblx0XHRcdFx0Y29kZUJsb2NrU3RhcnRJbmRleCArPSBuZXdQYXJ0LmNvZGVibG9ja3M/Lmxlbmd0aCA/PyAwO1xuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRkaXNwb3NlKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPSBwYXJ0cztcblxuXHRcdGlmIChvdGhlclZhcmlhYmxlcy5sZW5ndGgpIHtcblx0XHRcdGNvbnN0IG5ld1BhcnQgPSB0aGlzLnJlbmRlckF0dGFjaG1lbnRzKG90aGVyVmFyaWFibGVzLCBlbGVtZW50LmNvbnRlbnRSZWZlcmVuY2VzLCBlbGVtZW50Lm1vZGVsSWQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRpZiAobmV3UGFydC5kb21Ob2RlKSB7XG5cdFx0XHRcdC8vIHAgaGFzIGEgOmxhc3QtY2hpbGQgcnVsZSBmb3IgbWFyZ2luXG5cdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5hcHBlbmRDaGlsZChuZXdQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0fVxuXHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobmV3UGFydCk7XG5cdFx0fVxuXG5cdFx0aWYgKCFlbGVtZW50LnBlbmRpbmdLaW5kICYmICFlbGVtZW50LmNvbmZpcm1hdGlvbiAmJiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5yZW5kZXJTdHlsZSAhPT0gJ21pbmltYWwnICYmIHRlbXBsYXRlRGF0YS52YWx1ZS5jaGlsZEVsZW1lbnRDb3VudCA+IDApIHtcblx0XHRcdGNvbnN0IHRpbWVzdGFtcCA9IHJlbmRlckNoYXRSZXF1ZXN0VGltZXN0YW1wKHRlbXBsYXRlRGF0YS5yZXF1ZXN0VGltZXN0YW1wQ29udGFpbmVyLCBlbGVtZW50LnJlcXVlc3RUaW1lc3RhbXApO1xuXHRcdFx0aWYgKHRpbWVzdGFtcD8uaG92ZXJUZXh0KSB7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKHRoaXMuaG92ZXJTZXJ2aWNlLnNldHVwTWFuYWdlZEhvdmVyKGdldERlZmF1bHRIb3ZlckRlbGVnYXRlKCdlbGVtZW50JyksIHRpbWVzdGFtcC5lbGVtZW50LCB0aW1lc3RhbXAuaG92ZXJUZXh0KSk7XG5cdFx0XHR9IGVsc2UgaWYgKHRpbWVzdGFtcCkge1xuXHRcdFx0XHRsZXQgcmVxdWVzdFRpbWluZ0JvdW5kczogRE9NUmVjdCB8IHVuZGVmaW5lZDtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aW1lc3RhbXAuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9PVkVSLCBlID0+IHtcblx0XHRcdFx0XHRjb25zdCB0YXJnZXQgPSBkb20uaXNIVE1MRWxlbWVudChlLnRhcmdldCkgPyBlLnRhcmdldC5jbG9zZXN0KCcuY2hhdC1yZXF1ZXN0LXJlbGF0aXZlJykgOiB1bmRlZmluZWQ7XG5cdFx0XHRcdFx0aWYgKCFkb20uaXNIVE1MRWxlbWVudCh0YXJnZXQpIHx8ICF0aW1lc3RhbXAuZWxlbWVudC5jb250YWlucyh0YXJnZXQpKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGNvbnN0IGJvdW5kcyA9IHRhcmdldC5nZXRCb3VuZGluZ0NsaWVudFJlY3QoKTtcblx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gYm91bmRzO1xuXHRcdFx0XHRcdHRpbWVzdGFtcC5lbGVtZW50LmNsYXNzTGlzdC5hZGQoJ2NoYXQtcmVxdWVzdC1mbGlwLXJlc2V0Jyk7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnRvZ2dsZSgnY2hhdC1yZXF1ZXN0LWZsaXAtZG93bicsIGUuY2xpZW50WSA8IGJvdW5kcy50b3AgKyBib3VuZHMuaGVpZ2h0IC8gMik7XG5cdFx0XHRcdFx0dm9pZCB0aW1lc3RhbXAuZWxlbWVudC5vZmZzZXRXaWR0aDtcblx0XHRcdFx0XHR0aW1lc3RhbXAuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlcXVlc3QtZmxpcC1yZXNldCcpO1xuXHRcdFx0XHRcdHZvaWQgdGltZXN0YW1wLmVsZW1lbnQub2Zmc2V0V2lkdGg7XG5cdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LmFkZCgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcih0aW1lc3RhbXAuZWxlbWVudCwgZG9tLkV2ZW50VHlwZS5NT1VTRV9NT1ZFLCBlID0+IHtcblx0XHRcdFx0XHRpZiAocmVxdWVzdFRpbWluZ0JvdW5kcyAmJiAoZS5jbGllbnRYIDwgcmVxdWVzdFRpbWluZ0JvdW5kcy5sZWZ0IHx8IGUuY2xpZW50WCA+IHJlcXVlc3RUaW1pbmdCb3VuZHMucmlnaHQgfHwgZS5jbGllbnRZIDwgcmVxdWVzdFRpbWluZ0JvdW5kcy50b3AgfHwgZS5jbGllbnRZID4gcmVxdWVzdFRpbWluZ0JvdW5kcy5ib3R0b20pKSB7XG5cdFx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdFx0dGltZXN0YW1wLmVsZW1lbnQuY2xhc3NMaXN0LnJlbW92ZSgnY2hhdC1yZXF1ZXN0LWZsaXAtYWN0aXZlJyk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGltZXN0YW1wLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuTU9VU0VfTEVBVkUsICgpID0+IHtcblx0XHRcdFx0XHRyZXF1ZXN0VGltaW5nQm91bmRzID0gdW5kZWZpbmVkO1xuXHRcdFx0XHRcdHRpbWVzdGFtcC5lbGVtZW50LmNsYXNzTGlzdC5yZW1vdmUoJ2NoYXQtcmVxdWVzdC1mbGlwLWFjdGl2ZScpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIodGltZXN0YW1wLmVsZW1lbnQsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0XHR0aW1lc3RhbXAuZWxlbWVudC5jbGFzc0xpc3QucmVtb3ZlKCdjaGF0LXJlcXVlc3QtZmxpcC1hY3RpdmUnLCAnY2hhdC1yZXF1ZXN0LWZsaXAtZG93bicpO1xuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJTeXN0ZW1Jbml0aWF0ZWRSZXF1ZXN0KGVsZW1lbnQ6IElDaGF0UmVxdWVzdFZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpIHtcblx0XHRkb20uY2xlYXJOb2RlKHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0aWYgKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRkaXNwb3NlKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHR9XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPSBbXTtcblxuXHRcdGNvbnN0IGxhYmVsID0gZWxlbWVudC5zeXN0ZW1Jbml0aWF0ZWRMYWJlbCA/PyBlbGVtZW50Lm1lc3NhZ2VUZXh0O1xuXHRcdGNvbnN0IG5vdGlmaWNhdGlvblBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFN5c3RlbU5vdGlmaWNhdGlvbkNvbnRlbnRQYXJ0LFxuXHRcdFx0eyBraW5kOiAnc3lzdGVtTm90aWZpY2F0aW9uJywgY29udGVudDogbmV3IE1hcmtkb3duU3RyaW5nKGxhYmVsKSB9LFxuXHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsXG5cdFx0KTtcblx0XHR0ZW1wbGF0ZURhdGEuZWxlbWVudERpc3Bvc2FibGVzLmFkZChub3RpZmljYXRpb25QYXJ0KTtcblx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuYXBwZW5kQ2hpbGQobm90aWZpY2F0aW9uUGFydC5kb21Ob2RlKTtcblx0fVxuXG5cdC8qKlxuXHQgKiBTbW9vdGggc3RyZWFtaW5nIHJlbmRlciBwYXRoIFx1MjAxNCBldmVudC1kcml2ZW4sIHJBRi1iYXRjaGVkLlxuXHQgKlxuXHQgKiBEb2VzIGEgcmVuZGVyIHBhc3MgdGhhdCBmZWVkcyB0aGUgZnVsbCBjb250ZW50IHRocm91Z2hcblx0ICogYGdldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnRgIFx1MjE5MiBgZGlmZmAgXHUyMTkyIGByZW5kZXJDaGF0Q29udGVudERpZmZgLFxuXHQgKiB3aGVyZSB0aGUgbW9ycGhlciBpbnRlcmNlcHRzIG1hcmtkb3duIGFwcGVuZHMgYW5kIHNjaGVkdWxlc1xuXHQgKiByQUYtYmF0Y2hlZCByZS1yZW5kZXJzIHRocm91Z2ggdGhlIHN0YW5kYXJkIG1hcmtkb3duIHBpcGVsaW5lLlxuXHQgKlxuXHQgKiBDYWxsZWQgb24gZXZlcnkgYHJlbmRlckVsZW1lbnRgIGludm9jYXRpb24gKHdoaWNoIGZpcmVzIGVhY2ggdGltZVxuXHQgKiB0aGUgbW9kZWwgY2hhbmdlcykuIE9uIGNvbXBsZXRpb24vY2FuY2VsbGF0aW9uIHRoZSBtb3JwaGVyJ3Ncblx0ICogY29udGVudCBpcyBhbHJlYWR5IGNvcnJlY3RseSByZW5kZXJlZCwgc28gd2UgZG8gYSBmaW5hbCBkaWZmIHBhc3Ncblx0ICogKG5vdCBhIGRlc3RydWN0aXZlIHJlLXJlbmRlcikgdG8gZmluYWxpemUgbm9uLW1hcmtkb3duIHBhcnRzIGxpa2Vcblx0ICogdGhpbmtpbmcgaW5kaWNhdG9ycywgZXJyb3IgZGV0YWlscywgYW5kIGNvZGUgY2l0YXRpb25zLlxuXHQgKi9cblx0cHJpdmF0ZSBkb0luY3JlbWVudGFsUmVuZGVyKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0aWYgKCF0aGlzLl9pc1Zpc2libGUpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBBbHdheXMgdXBkYXRlIHRoZSB3b3JkIGJ1ZmZlcidzIHJldmVhbCByYXRlLCBpbmNsdWRpbmcgb24gdGhlXG5cdFx0Ly8gY29tcGxldGlvbiBwYXNzIHNvIHRoZSBidWZmZXIgc3dpdGNoZXMgdG8gYSBmYXN0IGRyYWluIHJhdGUuXG5cdFx0Y29uc3QgcmF0ZSA9IHRoaXMuZ2V0UHJvZ3Jlc3NpdmVSZW5kZXJSYXRlKGVsZW1lbnQpO1xuXHRcdHRoaXMuX3VwZGF0ZU1vcnBoZXJSYXRlKHRlbXBsYXRlRGF0YSwgcmF0ZSwgZWxlbWVudC5pc0NvbXBsZXRlIHx8IGVsZW1lbnQuaXNDYW5jZWxlZCk7XG5cblx0XHRpZiAoZWxlbWVudC5pc0NhbmNlbGVkIHx8IGVsZW1lbnQuaXNDb21wbGV0ZSkge1xuXHRcdFx0Ly8gVGhlIG1vcnBoZXIgaGFzIGFscmVhZHkgcmVuZGVyZWQgdGhlIG1hcmtkb3duIGNvbnRlbnRcblx0XHRcdC8vIGNvcnJlY3RseSB0aHJvdWdoIHRoZSBzdGFuZGFyZCBwaXBlbGluZS4gQ2xlYXIgcmVuZGVyRGF0YVxuXHRcdFx0Ly8gYW5kIGRvIGEgZmluYWwgZGlmZiBwYXNzIHRvIHBpY2sgdXAgbm9uLW1hcmtkb3duIHBhcnRzXG5cdFx0XHQvLyAoZXJyb3IgZGV0YWlscywgY29kZSBjaXRhdGlvbnMsIHRoaW5raW5nIGZpbmFsaXphdGlvbilcblx0XHRcdC8vIHdpdGhvdXQgdGVhcmluZyBkb3duIHdoYXQgdGhlIG1vcnBoZXIgYnVpbHQuXG5cdFx0XHRlbGVtZW50LnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIGZhbHNlKTtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lci5jbGFzc0xpc3QudG9nZ2xlKCdjaGF0LXJlc3BvbnNlLWxvYWRpbmcnLCB0cnVlKTtcblxuXHRcdGNvbnN0IGNvbnRlbnRGb3JUaGlzVHVybiA9IHRoaXMuZ2V0TmV4dFByb2dyZXNzaXZlUmVuZGVyQ29udGVudChlbGVtZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdGNvbnN0IHBhcnRzVG9SZW5kZXIgPSB0aGlzLmRpZmYodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMgPz8gW10sIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50LCBlbGVtZW50KTtcblx0XHRjb25zdCBjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQgPSBwYXJ0c1RvUmVuZGVyLmV2ZXJ5KHBhcnQgPT4gcGFydCA9PT0gbnVsbCk7XG5cdFx0aWYgKCFjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQpIHtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdENvbnRlbnREaWZmKHBhcnRzVG9SZW5kZXIsIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50LCBlbGVtZW50LCBpbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHR9XG5cdH1cblxuXHQvKipcblx0ICogUHJvcGFnYXRlIHRoZSBzdHJlYW0ncyB3b3JkLXJhdGUgZXN0aW1hdGUgdG8gYW55IGFjdGl2ZSBtb3JwaGVyJ3Ncblx0ICogd29yZCBidWZmZXIgc28gaXQgcmV2ZWFscyBjb250ZW50IGF0IHRoZSBtb2RlbCdzIHNwZWVkLlxuXHQgKi9cblx0cHJpdmF0ZSBfdXBkYXRlTW9ycGhlclJhdGUodGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIHJhdGU6IG51bWJlciwgaXNDb21wbGV0ZTogYm9vbGVhbik6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkUGFydHMgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cztcblx0XHRpZiAoIXJlbmRlcmVkUGFydHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0Zm9yIChjb25zdCBwYXJ0IG9mIHJlbmRlcmVkUGFydHMpIHtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQpIHtcblx0XHRcdFx0cGFydC51cGRhdGVTdHJlYW1SYXRlKHJhdGUsIGlzQ29tcGxldGUpO1xuXHRcdFx0fVxuXHRcdH1cblx0fVxuXG5cdHByaXZhdGUgbG9nSW5jcmVtZW50YWxSZW5kZXJpbmdUZWxlbWV0cnkoKTogdm9pZCB7XG5cdFx0aWYgKHRoaXMuX2luY3JlbWVudGFsUmVuZGVyaW5nVGVsZW1ldHJ5TG9nZ2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdHRoaXMuX2luY3JlbWVudGFsUmVuZGVyaW5nVGVsZW1ldHJ5TG9nZ2VkID0gdHJ1ZTtcblxuXHRcdHR5cGUgSW5jcmVtZW50YWxSZW5kZXJpbmdTZXR0aW5nc0V2ZW50ID0ge1xuXHRcdFx0YW5pbWF0aW9uU3R5bGU6IHN0cmluZztcblx0XHRcdGJ1ZmZlcmluZzogc3RyaW5nO1xuXHRcdH07XG5cdFx0dHlwZSBJbmNyZW1lbnRhbFJlbmRlcmluZ1NldHRpbmdzQ2xhc3NpZmljYXRpb24gPSB7XG5cdFx0XHRhbmltYXRpb25TdHlsZTogeyBjbGFzc2lmaWNhdGlvbjogJ1N5c3RlbU1ldGFEYXRhJzsgcHVycG9zZTogJ0ZlYXR1cmVJbnNpZ2h0JzsgY29tbWVudDogJ1RoZSBhbmltYXRpb24gc3R5bGUgc2VsZWN0ZWQgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy4nIH07XG5cdFx0XHRidWZmZXJpbmc6IHsgY2xhc3NpZmljYXRpb246ICdTeXN0ZW1NZXRhRGF0YSc7IHB1cnBvc2U6ICdGZWF0dXJlSW5zaWdodCc7IGNvbW1lbnQ6ICdUaGUgYnVmZmVyaW5nIG1vZGUgc2VsZWN0ZWQgZm9yIGluY3JlbWVudGFsIHJlbmRlcmluZy4nIH07XG5cdFx0XHRvd25lcjogJ3B3YW5nMzQ3Jztcblx0XHRcdGNvbW1lbnQ6ICdUcmFja3Mgd2hpY2ggaW5jcmVtZW50YWwgcmVuZGVyaW5nIHNldHRpbmdzIGFyZSBpbiB1c2UuJztcblx0XHR9O1xuXHRcdHRoaXMudGVsZW1ldHJ5U2VydmljZS5wdWJsaWNMb2cyPEluY3JlbWVudGFsUmVuZGVyaW5nU2V0dGluZ3NFdmVudCwgSW5jcmVtZW50YWxSZW5kZXJpbmdTZXR0aW5nc0NsYXNzaWZpY2F0aW9uPignY2hhdEluY3JlbWVudGFsUmVuZGVyaW5nU2V0dGluZ3MnLCB7XG5cdFx0XHRhbmltYXRpb25TdHlsZTogdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPHN0cmluZz4oQ2hhdENvbmZpZ3VyYXRpb24uSW5jcmVtZW50YWxSZW5kZXJpbmdTdHlsZSkgPz8gJ25vbmUnLFxuXHRcdFx0YnVmZmVyaW5nOiB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPihDaGF0Q29uZmlndXJhdGlvbi5JbmNyZW1lbnRhbFJlbmRlcmluZ0J1ZmZlcmluZykgPz8gJ3dvcmQnLFxuXHRcdH0pO1xuXHR9XG5cblx0LyoqXG5cdCAqXHRAcmV0dXJucyB0cnVlIGlmIHByb2dyZXNzaXZlIHJlbmRlcmluZyBzaG91bGQgYmUgY29uc2lkZXJlZCBjb21wbGV0ZS0gdGhlIGVsZW1lbnQncyBkYXRhIGlzIGZ1bGx5IHJlbmRlcmVkIG9yIHRoZSB2aWV3IGlzIG5vdCB2aXNpYmxlXG5cdCAqL1xuXHRwcml2YXRlIGRvTmV4dFByb2dyZXNzaXZlUmVuZGVyKGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBpc0luUmVuZGVyRWxlbWVudDogYm9vbGVhbik6IGJvb2xlYW4ge1xuXHRcdGlmICghdGhpcy5faXNWaXNpYmxlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHRpZiAoZWxlbWVudC5pc0NhbmNlbGVkKSB7XG5cdFx0XHR0aGlzLnRyYWNlTGF5b3V0KCdkb05leHRQcm9ncmVzc2l2ZVJlbmRlcicsIGBjYW5jZWxlZCwgaW5kZXg9JHtpbmRleH1gKTtcblx0XHRcdGVsZW1lbnQucmVuZGVyRGF0YSA9IHVuZGVmaW5lZDtcblx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHR0ZW1wbGF0ZURhdGEucm93Q29udGFpbmVyLmNsYXNzTGlzdC50b2dnbGUoJ2NoYXQtcmVzcG9uc2UtbG9hZGluZycsIHRydWUpO1xuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgYFNUQVJUIHByb2dyZXNzaXZlIHJlbmRlciwgaW5kZXg9JHtpbmRleH1gKTtcblx0XHRjb25zdCBjb250ZW50Rm9yVGhpc1R1cm4gPSB0aGlzLmdldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQoZWxlbWVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRjb25zdCBwYXJ0c1RvUmVuZGVyID0gdGhpcy5kaWZmKHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzID8/IFtdLCBjb250ZW50Rm9yVGhpc1R1cm4uY29udGVudCwgZWxlbWVudCk7XG5cblx0XHRjb25zdCBjb250ZW50SXNBbHJlYWR5UmVuZGVyZWQgPSBwYXJ0c1RvUmVuZGVyLmV2ZXJ5KHBhcnQgPT4gcGFydCA9PT0gbnVsbCk7XG5cdFx0aWYgKGNvbnRlbnRJc0FscmVhZHlSZW5kZXJlZCkge1xuXHRcdFx0aWYgKGNvbnRlbnRGb3JUaGlzVHVybi5tb3JlQ29udGVudEF2YWlsYWJsZSkge1xuXHRcdFx0XHQvLyBUaGUgY29udGVudCB0aGF0IHdlIHdhbnQgdG8gcmVuZGVyIGluIHRoaXMgdHVybiBpcyBhbHJlYWR5IHJlbmRlcmVkLCBidXQgdGhlcmUgaXMgbW9yZSBjb250ZW50IHRvIHJlbmRlciBvbiB0aGUgbmV4dCB0aWNrXG5cdFx0XHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgJ25vdCByZW5kZXJpbmcgYW55IG5ldyBjb250ZW50IHRoaXMgdGljaywgYnV0IG1vcmUgYXZhaWxhYmxlJyk7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH0gZWxzZSBpZiAoZWxlbWVudC5pc0NvbXBsZXRlKSB7XG5cdFx0XHRcdC8vIEFsbCBjb250ZW50IGlzIHJlbmRlcmVkLCBhbmQgcmVzcG9uc2UgaXMgZG9uZSwgc28gZG8gYSBub3JtYWwgcmVuZGVyXG5cdFx0XHRcdHRoaXMudHJhY2VMYXlvdXQoJ2RvTmV4dFByb2dyZXNzaXZlUmVuZGVyJywgYEVORCBwcm9ncmVzc2l2ZSByZW5kZXIsIGluZGV4PSR7aW5kZXh9IGFuZCBjbGVhcmluZyByZW5kZXJEYXRhLCByZXNwb25zZSBpcyBjb21wbGV0ZWApO1xuXHRcdFx0XHRlbGVtZW50LnJlbmRlckRhdGEgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMoZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdHJldHVybiB0cnVlO1xuXHRcdFx0fSBlbHNlIGlmICh0aGlzLmlzV29ya2luZ1Byb2dyZXNzRGVib3VuY2VQZW5kaW5nKGVsZW1lbnQsIGNvbnRlbnRGb3JUaGlzVHVybi5jb250ZW50KSkge1xuXHRcdFx0XHQvLyBDYXVnaHQgdXAgdG8gdGhlIHN0cmVhbWVkIG1hcmtkb3duLCBidXQgc3RpbGwgd2l0aGluIHRoZSB3b3JraW5nXG5cdFx0XHRcdC8vIGluZGljYXRvciBkZWJvdW5jZSB3aW5kb3cuIEtlZXAgdGhlIHJlbmRlciBsb29wIGFsaXZlIHNvIHRoZVxuXHRcdFx0XHQvLyBpbmRpY2F0b3IgY2FuIGFwcGVhciBhZnRlciBhIGdlbnVpbmUgcGF1c2UgaW5zdGVhZCBvZiBiZWluZyBkcm9wcGVkXG5cdFx0XHRcdC8vIHdoZW4gdGhlIGxvb3Agd291bGQgb3RoZXJ3aXNlIHN0b3AgaGVyZS5cblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Ly8gTm90aGluZyBuZXcgdG8gcmVuZGVyLCBzdG9wIHJlbmRlcmluZyB1bnRpbCBuZXh0IG1vZGVsIHVwZGF0ZVxuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBEbyBhbiBhY3R1YWwgcHJvZ3Jlc3NpdmUgcmVuZGVyXG5cdFx0dGhpcy50cmFjZUxheW91dCgnZG9OZXh0UHJvZ3Jlc3NpdmVSZW5kZXInLCBgZG9pbmcgcHJvZ3Jlc3NpdmUgcmVuZGVyLCAke3BhcnRzVG9SZW5kZXIubGVuZ3RofSBwYXJ0cyB0byByZW5kZXJgKTtcblx0XHR0aGlzLnJlbmRlckNoYXRDb250ZW50RGlmZihwYXJ0c1RvUmVuZGVyLCBjb250ZW50Rm9yVGhpc1R1cm4uY29udGVudCwgZWxlbWVudCwgaW5kZXgsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRDb250ZW50RGlmZihwYXJ0c1RvUmVuZGVyOiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50IHwgbnVsbD4sIGNvbnRlbnRGb3JUaGlzVHVybjogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudD4sIGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwsIGVsZW1lbnRJbmRleDogbnVtYmVyLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdGNvbnN0IHJlbmRlcmVkUGFydHMgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA/PyBbXTtcblx0XHR0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyA9IHJlbmRlcmVkUGFydHM7XG5cdFx0dGVtcGxhdGVEYXRhLnJlbmRlcmVkQ29udGVudCA9IGNvbnRlbnRGb3JUaGlzVHVybjtcblx0XHRjb25zdCBiYXRjaGVkU3ViYWdlbnRQYXJ0cyA9IG5ldyBTZXQ8Q2hhdFN1YmFnZW50Q29udGVudFBhcnQ+KCk7XG5cdFx0bGV0IGNvZGVCbG9ja1N0YXJ0SW5kZXggPSAwO1xuXHRcdGxldCB0cmVlU3RhcnRJbmRleCA9IDA7XG5cdFx0bGV0IGRpc3BsYWNlZFdvcmtpbmdQYXJ0OiBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnQgfCB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVuZGVyUGFydHMgPSAoKSA9PiBwYXJ0c1RvUmVuZGVyLmZvckVhY2goKHBhcnRUb1JlbmRlciwgY29udGVudEluZGV4KSA9PiB7XG5cdFx0XHQvLyBBY2N1bXVsYXRlIGNvdW50cyBmcm9tIHRoZSBwYXJ0IHRoYXQgZW5kZWQgdXAgYXQgdGhlIHByZXZpb3VzIGluZGV4XG5cdFx0XHRpZiAoY29udGVudEluZGV4ID4gMCkge1xuXHRcdFx0XHRjb25zdCBwcmV2UGFydCA9IHJlbmRlcmVkUGFydHNbY29udGVudEluZGV4IC0gMV07XG5cdFx0XHRcdGlmIChwcmV2UGFydCkge1xuXHRcdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXggKz0gcHJldlBhcnQuY29kZWJsb2Nrcz8ubGVuZ3RoID8/IDA7XG5cdFx0XHRcdFx0aWYgKHByZXZQYXJ0IGluc3RhbmNlb2YgQ2hhdFRyZWVDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdFx0dHJlZVN0YXJ0SW5kZXgrKztcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgYWxyZWFkeVJlbmRlcmVkUGFydCA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzPy5bY29udGVudEluZGV4XTtcblxuXHRcdFx0aWYgKCFwYXJ0VG9SZW5kZXIpIHtcblx0XHRcdFx0Ly8gbnVsbD1ubyBjaGFuZ2Vcblx0XHRcdFx0aWYgKCF0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0c01vdW50ZWQpIHtcblx0XHRcdFx0XHRhbHJlYWR5UmVuZGVyZWRQYXJ0Py5vbkRpZFJlbW91bnQ/LigpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHBhcnRUb1JlbmRlci5raW5kID09PSAnd29ya2luZycgJiYgZGlzcGxhY2VkV29ya2luZ1BhcnQ/Lmhhc1NhbWVDb250ZW50KHBhcnRUb1JlbmRlciwgY29udGVudEZvclRoaXNUdXJuLnNsaWNlKGNvbnRlbnRJbmRleCArIDEpLCBlbGVtZW50KSkge1xuXHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBkaXNwbGFjZWRXb3JraW5nUGFydDtcblx0XHRcdFx0ZGlzcGxhY2VkV29ya2luZ1BhcnQgPSB1bmRlZmluZWQ7XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Ly8ga2VlcCBleGlzdGluZyB0aGlua2luZyBwYXJ0IGluc3RhbmNlIGR1cmluZyBzdHJlYW1pbmcgYW5kIHVwZGF0ZSBpdCBpbiBwbGFjZVxuXHRcdFx0Y29uc3QgcHJlc2VydmVXb3JraW5nUGFydCA9IGFscmVhZHlSZW5kZXJlZFBhcnQgaW5zdGFuY2VvZiBDaGF0V29ya2luZ1Byb2dyZXNzQ29udGVudFBhcnRcblx0XHRcdFx0JiYgcGFydFRvUmVuZGVyLmtpbmQgIT09ICd3b3JraW5nJ1xuXHRcdFx0XHQmJiBjb250ZW50Rm9yVGhpc1R1cm4uc2xpY2UoY29udGVudEluZGV4ICsgMSkuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ3dvcmtpbmcnKTtcblx0XHRcdGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0KSB7XG5cdFx0XHRcdGlmIChwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ3RoaW5raW5nJyAmJiBhbHJlYWR5UmVuZGVyZWRQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQpIHtcblx0XHRcdFx0XHRpZiAoIUFycmF5LmlzQXJyYXkocGFydFRvUmVuZGVyLnZhbHVlKSkge1xuXHRcdFx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydC51cGRhdGVUaGlua2luZyhwYXJ0VG9SZW5kZXIpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0fSBlbHNlIGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KHBhcnRUb1JlbmRlciwgZWxlbWVudCkpIHtcblx0XHRcdFx0XHQvLyBrZWVwIGV4aXN0aW5nIHRoaW5raW5nIHBhcnQgaWYgd2UgYXJlIHBpbm5pbmcgaXQgKGNvbWJpbmluZyB0b29sIGNhbGxzIGludG8gaXQpXG5cdFx0XHRcdFx0cmVuZGVyZWRQYXJ0c1tjb250ZW50SW5kZXhdID0gYWxyZWFkeVJlbmRlcmVkUGFydDtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblxuXHRcdFx0XHQvLyBJbmNyZW1lbnRhbCByZW5kZXJpbmc6IHRyeSBhbiBpbmNyZW1lbnRhbCBET00gbW9ycGggaW5zdGVhZCBvZlxuXHRcdFx0XHQvLyB0ZWFyaW5nIGRvd24gYW5kIHJlYnVpbGRpbmcgdGhlIGVudGlyZSBtYXJrZG93biBwYXJ0LlxuXHRcdFx0XHRpZiAocGFydFRvUmVuZGVyLmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnXG5cdFx0XHRcdFx0JiYgYWxyZWFkeVJlbmRlcmVkUGFydCBpbnN0YW5jZW9mIENoYXRNYXJrZG93bkNvbnRlbnRQYXJ0XG5cdFx0XHRcdFx0JiYgdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKVxuXHRcdFx0XHQpIHtcblx0XHRcdFx0XHRpZiAoYWxyZWFkeVJlbmRlcmVkUGFydC50cnlJbmNyZW1lbnRhbFVwZGF0ZShwYXJ0VG9SZW5kZXIpKSB7XG5cdFx0XHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChwcmVzZXJ2ZVdvcmtpbmdQYXJ0KSB7XG5cdFx0XHRcdFx0ZGlzcGxhY2VkV29ya2luZ1BhcnQgPSBhbHJlYWR5UmVuZGVyZWRQYXJ0O1xuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdGFscmVhZHlSZW5kZXJlZFBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0Ly8gUmVwbGFjZSBvbGQgRE9NIGZyb20gdGhpbmtpbmcgd3JhcHBlciB0byBwcmV2ZW50IGFjY3VtdWxhdGlvblxuXHRcdFx0XHQvLyBvZiBkdXBsaWNhdGUgZW50cmllcyB3aGVuIHJlLXJlbmRlcmluZyBwaW5uZWQgcGFydHMuXG5cdFx0XHRcdGlmIChhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUpIHtcblx0XHRcdFx0XHRjb25zdCB0aGlua2luZ1Rvb2xXcmFwcGVyID0gZG9tLmZpbmRQYXJlbnRXaXRoQ2xhc3MoYWxyZWFkeVJlbmRlcmVkUGFydC5kb21Ob2RlLCAnY2hhdC10aGlua2luZy10b29sLXdyYXBwZXInKTtcblx0XHRcdFx0XHRpZiAodGhpbmtpbmdUb29sV3JhcHBlcikge1xuXHRcdFx0XHRcdFx0dGhpbmtpbmdUb29sV3JhcHBlci5yZXBsYWNlV2l0aChhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fVxuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCA9IHtcblx0XHRcdFx0ZWxlbWVudCxcblx0XHRcdFx0ZWxlbWVudEluZGV4OiBlbGVtZW50SW5kZXgsXG5cdFx0XHRcdGNvbnRlbnQ6IGNvbnRlbnRGb3JUaGlzVHVybixcblx0XHRcdFx0Y29udGVudEluZGV4OiBjb250ZW50SW5kZXgsXG5cdFx0XHRcdGNvbnRhaW5lcjogdGVtcGxhdGVEYXRhLnJvd0NvbnRhaW5lcixcblx0XHRcdFx0ZWRpdG9yUG9vbDogdGhpcy5fZWRpdG9yUG9vbCxcblx0XHRcdFx0ZGlmZkVkaXRvclBvb2w6IHRoaXMuX2RpZmZFZGl0b3JQb29sLFxuXHRcdFx0XHRjdXJyZW50V2lkdGg6IHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aCxcblx0XHRcdFx0b25EaWRDaGFuZ2VWaXNpYmlsaXR5OiB0aGlzLl9vbkRpZENoYW5nZVZpc2liaWxpdHkuZXZlbnQsXG5cdFx0XHRcdGlubGluZVRleHRNb2RlbHM6IHRoaXMuX2lubGluZVRleHRNb2RlbHMsXG5cdFx0XHRcdGNvZGVCbG9ja1N0YXJ0SW5kZXgsXG5cdFx0XHRcdHRyZWVTdGFydEluZGV4LFxuXHRcdFx0fTtcblxuXHRcdFx0Ly8gY29tYmluZSB0b29sIGludm9jYXRpb25zIGludG8gdGhpbmtpbmcgcGFydCBpZiBuZWVkZWQuIHJlbmRlciB0aGUgdG9vbCwgYnV0IGRvIG5vdCByZXBsYWNlIHRoZSB3b3JraW5nIHNwaW5uZXIgd2l0aCB0aGUgbmV3IHBhcnQncyBkb20gbm9kZSBzaW5jZSBpdCBpcyBhbHJlYWR5IGluc2lkZSB0aGUgdGhpbmtpbmcgcGFydC5cblx0XHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydChyZW5kZXJlZFBhcnRzKTtcblx0XHRcdGlmIChsYXN0VGhpbmtpbmcgJiYgKHBhcnRUb1JlbmRlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnRUb1JlbmRlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJyB8fCBwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgfHwgcGFydFRvUmVuZGVyLmtpbmQgPT09ICd0ZXh0RWRpdEdyb3VwJyB8fCBwYXJ0VG9SZW5kZXIua2luZCA9PT0gJ2V4dGVybmFsRWRpdCcgfHwgcGFydFRvUmVuZGVyLmtpbmQgPT09ICdob29rJykgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KHBhcnRUb1JlbmRlciwgZWxlbWVudCkpIHtcblx0XHRcdFx0aWYgKGFscmVhZHlSZW5kZXJlZFBhcnQgaW5zdGFuY2VvZiBDaGF0TWFya2Rvd25Db250ZW50UGFydCkge1xuXHRcdFx0XHRcdGxhc3RUaGlua2luZy5yZW1vdmVFZGl0UGlsbEJ5UGFydElkKGFscmVhZHlSZW5kZXJlZFBhcnQuY29kZWJsb2Nrc1BhcnRJZCk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRjb25zdCBuZXdQYXJ0ID0gdGhpcy5yZW5kZXJDaGF0Q29udGVudFBhcnQocGFydFRvUmVuZGVyLCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQsIGJhdGNoZWRTdWJhZ2VudFBhcnRzKTtcblx0XHRcdFx0aWYgKG5ld1BhcnQpIHtcblx0XHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBuZXdQYXJ0O1xuXHRcdFx0XHRcdGFscmVhZHlSZW5kZXJlZFBhcnQ/LmRvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybjtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3QgbmV3UGFydCA9IHRoaXMucmVuZGVyQ2hhdENvbnRlbnRQYXJ0KHBhcnRUb1JlbmRlciwgdGVtcGxhdGVEYXRhLCBjb250ZXh0LCBiYXRjaGVkU3ViYWdlbnRQYXJ0cyk7XG5cdFx0XHRpZiAobmV3UGFydCkge1xuXHRcdFx0XHRyZW5kZXJlZFBhcnRzW2NvbnRlbnRJbmRleF0gPSBuZXdQYXJ0O1xuXHRcdFx0XHQvLyBNYXliZSB0aGUgcGFydCBjYW4ndCBiZSByZW5kZXJlZCBpbiB0aGlzIGNvbnRleHQsIGJ1dCB0aGlzIHNob3VsZG4ndCByZWFsbHkgaGFwcGVuXG5cdFx0XHRcdHRyeSB7XG5cdFx0XHRcdFx0aWYgKGFscmVhZHlSZW5kZXJlZFBhcnQ/LmRvbU5vZGUpIHtcblx0XHRcdFx0XHRcdGlmIChuZXdQYXJ0LmRvbU5vZGUpIHtcblx0XHRcdFx0XHRcdFx0aWYgKHByZXNlcnZlV29ya2luZ1BhcnQpIHtcblx0XHRcdFx0XHRcdFx0XHRhbHJlYWR5UmVuZGVyZWRQYXJ0LmRvbU5vZGUuYmVmb3JlKG5ld1BhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdFx0YWxyZWFkeVJlbmRlcmVkUGFydC5kb21Ob2RlLnJlcGxhY2VXaXRoKG5ld1BhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHRcdGlmICghcHJlc2VydmVXb3JraW5nUGFydCkge1xuXHRcdFx0XHRcdFx0XHRcdGFscmVhZHlSZW5kZXJlZFBhcnQuZG9tTm9kZS5yZW1vdmUoKTtcblx0XHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAobmV3UGFydC5kb21Ob2RlICYmICFuZXdQYXJ0LmRvbU5vZGUucGFyZW50RWxlbWVudCkge1xuXHRcdFx0XHRcdFx0Ly8gT25seSBhcHBlbmQgaWYgbm90IGFscmVhZHkgYXR0YWNoZWQgc29tZXdoZXJlIGVsc2UgKGUuZy4gaW5zaWRlIGEgdGhpbmtpbmcgd3JhcHBlcilcblx0XHRcdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZS5hcHBlbmRDaGlsZChuZXdQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UuZXJyb3IoJ0NoYXRMaXN0SXRlbVJlbmRlcmVyI3JlbmRlckNoYXRDb250ZW50RGlmZjogZXJyb3IgcmVwbGFjaW5nIHBhcnQnLCBlcnIpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRhbHJlYWR5UmVuZGVyZWRQYXJ0Py5kb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdH1cblx0XHR9KTtcblx0XHR0cnkge1xuXHRcdFx0cmVuZGVyUGFydHMoKTtcblx0XHR9IGZpbmFsbHkge1xuXHRcdFx0Zm9yIChjb25zdCBzdWJhZ2VudFBhcnQgb2YgYmF0Y2hlZFN1YmFnZW50UGFydHMpIHtcblx0XHRcdFx0dHJ5IHtcblx0XHRcdFx0XHRzdWJhZ2VudFBhcnQuZW5kVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk7XG5cdFx0XHRcdH0gY2F0Y2ggKGVycm9yKSB7XG5cdFx0XHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdDaGF0TGlzdEl0ZW1SZW5kZXJlciNyZW5kZXJDaGF0Q29udGVudERpZmY6IGVycm9yIGZsdXNoaW5nIHN1YmFnZW50IHByZXNlbnRhdGlvbicsIGVycm9yKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblx0XHRkaXNwbGFjZWRXb3JraW5nUGFydD8uZGlzcG9zZSgpO1xuXHRcdGRpc3BsYWNlZFdvcmtpbmdQYXJ0Py5kb21Ob2RlPy5yZW1vdmUoKTtcblxuXHRcdC8vIERlbGV0ZSBwcmV2aW91c2x5IHJlbmRlcmVkIHBhcnRzIHRoYXQgYXJlIHJlbW92ZWRcblx0XHRmb3IgKGxldCBpID0gcGFydHNUb1JlbmRlci5sZW5ndGg7IGkgPCByZW5kZXJlZFBhcnRzLmxlbmd0aDsgaSsrKSB7XG5cdFx0XHRjb25zdCBwYXJ0ID0gcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdGlmIChwYXJ0KSB7XG5cdFx0XHRcdHBhcnQuZGlzcG9zZSgpO1xuXHRcdFx0XHRwYXJ0LmRvbU5vZGU/LnJlbW92ZSgpO1xuXHRcdFx0XHRkZWxldGUgcmVuZGVyZWRQYXJ0c1tpXTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRjb25zdCBhbmltYXRlQ29sbGFwc2UgPSB0ZW1wbGF0ZURhdGEud2FzUmVzcG9uc2VDb21wbGV0ZSA9PT0gZmFsc2UgJiYgZWxlbWVudC5pc0NvbXBsZXRlO1xuXHRcdHRoaXMudXBkYXRlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKGVsZW1lbnQsIGNvbnRlbnRGb3JUaGlzVHVybiwgdGVtcGxhdGVEYXRhLCBhbmltYXRlQ29sbGFwc2UpO1xuXHRcdHRlbXBsYXRlRGF0YS53YXNSZXNwb25zZUNvbXBsZXRlID0gZWxlbWVudC5pc0NvbXBsZXRlO1xuXHR9XG5cblx0cHJpdmF0ZSB1cGRhdGVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgY29udGVudDogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudD4sIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBhbmltYXRlQ29sbGFwc2U6IGJvb2xlYW4pOiB2b2lkIHtcblx0XHRpZiAoIWVsZW1lbnQuaXNDb21wbGV0ZSB8fCAhdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkNvbGxhcHNlQ29tcGxldGVkUmVzcG9uc2VzKSkge1xuXHRcdFx0dGhpcy5yZW1vdmVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUodGVtcGxhdGVEYXRhKTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVPcGVuID0gdW5kZWZpbmVkO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IHJlc3BvbnNlQ29udGVudCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChlbGVtZW50LnJlc3BvbnNlLnZhbHVlKTtcblx0XHRjb25zdCByZXNwb25zZUZpbmFsU3RhcnRJbmRleCA9IGdldEZpbmFsUmVzcG9uc2VTdGFydEluZGV4QWZ0ZXJNb3ZpbmdSZXNwb25zZU91dGNvbWVUb29scyhyZXNwb25zZUNvbnRlbnQpO1xuXHRcdGNvbnN0IGZpbmFsUmVzcG9uc2VTdGFydEluZGV4ID0gcmVzcG9uc2VGaW5hbFN0YXJ0SW5kZXggPT09IHVuZGVmaW5lZCA/IHVuZGVmaW5lZCA6IHJlc3BvbnNlRmluYWxTdGFydEluZGV4ICsgMTtcblx0XHRpZiAoZmluYWxSZXNwb25zZVN0YXJ0SW5kZXggPT09IHVuZGVmaW5lZCB8fCAhaXNGaW5hbFJlc3BvbnNlUmVuZGVyZWQoY29udGVudCwgZmluYWxSZXNwb25zZVN0YXJ0SW5kZXgpIHx8IGZpbmFsUmVzcG9uc2VTdGFydEluZGV4ID09PSAwIHx8ICFjb250ZW50LnNsaWNlKDAsIGZpbmFsUmVzcG9uc2VTdGFydEluZGV4KS5zb21lKHBhcnQgPT4gcGFydC5raW5kICE9PSAncmVmZXJlbmNlcycgfHwgcGFydC5yZWZlcmVuY2VzLmxlbmd0aCA+IDApKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBmaW5hbFJlc3BvbnNlUGFydCA9IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzPy5bZmluYWxSZXNwb25zZVN0YXJ0SW5kZXhdO1xuXHRcdGlmICghKGZpbmFsUmVzcG9uc2VQYXJ0IGluc3RhbmNlb2YgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQpIHx8ICFmaW5hbFJlc3BvbnNlUGFydC5pc1JlbmRlckNvbXBsZXRlKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0aWYgKGZpbmFsUmVzcG9uc2VQYXJ0IGluc3RhbmNlb2YgQ2hhdE1hcmtkb3duQ29udGVudFBhcnQpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZURpc3Bvc2FibGVzLmFkZChFdmVudC5vbmNlKGZpbmFsUmVzcG9uc2VQYXJ0Lm9uRGlkRmluaXNoUmVuZGVyaW5nKSgoKSA9PiB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUoZWxlbWVudCwgY29udGVudCwgdGVtcGxhdGVEYXRhLCBmYWxzZSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdH1cblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2xsYXBzZUVuZEluZGV4ID0gZ2V0Q29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4KGNvbnRlbnQsIGZpbmFsUmVzcG9uc2VTdGFydEluZGV4KTtcblx0XHRpZiAoY29sbGFwc2VFbmRJbmRleCA9PT0gMCkge1xuXHRcdFx0dGhpcy5yZW1vdmVDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmUodGVtcGxhdGVEYXRhKTtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCBjb2xsYXBzZUVuZE5vZGUgPSB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cz8uW2NvbGxhcHNlRW5kSW5kZXhdPy5kb21Ob2RlO1xuXHRcdGlmICghY29sbGFwc2VFbmROb2RlKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGxldCBleGlzdGluZ0Rpc2Nsb3N1cmUgPSB0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlO1xuXHRcdGlmIChleGlzdGluZ0Rpc2Nsb3N1cmU/LmNvbnRhaW5zKGNvbGxhcHNlRW5kTm9kZSkpIHtcblx0XHRcdHRoaXMucmVtb3ZlQ29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRleGlzdGluZ0Rpc2Nsb3N1cmUgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0bGV0IGNvbGxhcHNlRW5kUm9vdCA9IGNvbGxhcHNlRW5kTm9kZTtcblx0XHR3aGlsZSAoY29sbGFwc2VFbmRSb290LnBhcmVudEVsZW1lbnQgJiYgY29sbGFwc2VFbmRSb290LnBhcmVudEVsZW1lbnQgIT09IHRlbXBsYXRlRGF0YS52YWx1ZSkge1xuXHRcdFx0Y29sbGFwc2VFbmRSb290ID0gY29sbGFwc2VFbmRSb290LnBhcmVudEVsZW1lbnQ7XG5cdFx0fVxuXHRcdGlmIChjb2xsYXBzZUVuZFJvb3QucGFyZW50RWxlbWVudCAhPT0gdGVtcGxhdGVEYXRhLnZhbHVlKSB7XG5cdFx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChleGlzdGluZ0Rpc2Nsb3N1cmVcblx0XHRcdCYmIHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXggPT09IGNvbGxhcHNlRW5kSW5kZXhcblx0XHRcdCYmIGV4aXN0aW5nRGlzY2xvc3VyZS5uZXh0U2libGluZyA9PT0gY29sbGFwc2VFbmRSb290XG5cdFx0XHQmJiB0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cz8uc2xpY2UoMCwgY29sbGFwc2VFbmRJbmRleCkuZXZlcnkocGFydCA9PiAhcGFydD8uZG9tTm9kZSB8fCBleGlzdGluZ0Rpc2Nsb3N1cmUuY29udGFpbnMocGFydC5kb21Ob2RlKSlcblx0XHQpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHR0aGlzLnJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdGNvbnN0IHZhbHVlQ2hpbGRyZW4gPSBBcnJheS5mcm9tKHRlbXBsYXRlRGF0YS52YWx1ZS5jaGlsZE5vZGVzKTtcblx0XHRjb25zdCBub2Rlc1RvQ29sbGFwc2UgPSB2YWx1ZUNoaWxkcmVuLnNsaWNlKDAsIHZhbHVlQ2hpbGRyZW4uaW5kZXhPZihjb2xsYXBzZUVuZFJvb3QpKTtcblx0XHRjb25zdCBzdGVwQ291bnQgPSBnZXRWaXNpYmxlQ29tcGxldGVkUmVzcG9uc2VJdGVtQ291bnQobm9kZXNUb0NvbGxhcHNlKTtcblx0XHRpZiAoc3RlcENvdW50IDwgMikge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IGRldGFpbHMgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdkZXRhaWxzJyk7XG5cdFx0ZGV0YWlscy5jbGFzc0xpc3QuYWRkKCdjb21wbGV0ZWQtcmVzcG9uc2UtZGlzY2xvc3VyZScpO1xuXHRcdGNvbnN0IHN1bW1hcnkgPSBkZXRhaWxzLmFwcGVuZENoaWxkKGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoJ3N1bW1hcnknKSk7XG5cdFx0c3VtbWFyeS5jbGFzc0xpc3QuYWRkKCdjb21wbGV0ZWQtcmVzcG9uc2Utc3VtbWFyeScsICdjaGF0LXVzZWQtY29udGV4dC1sYWJlbCcpO1xuXHRcdGNvbnN0IGJ1dHRvbiA9IHN1bW1hcnkuYXBwZW5kQ2hpbGQoJCgnc3Bhbi5tb25hY28tYnV0dG9uLm1vbmFjby10ZXh0LWJ1dHRvbi5tb25hY28taWNvbi1idXR0b24nKSk7XG5cdFx0Y29uc3QgbGFiZWwgPSBidXR0b24uYXBwZW5kQ2hpbGQoJCgnc3Bhbi5tb25hY28tYnV0dG9uLW1kbGFiZWwnKSk7XG5cdFx0Y29uc3QgY2hldnJvbiA9IGJ1dHRvbi5hcHBlbmRDaGlsZCgkKCdzcGFuLmNoYXQtY29sbGFwc2libGUtaG92ZXItY2hldnJvbicsIHsgJ2FyaWEtaGlkZGVuJzogJ3RydWUnIH0pKTtcblx0XHRjaGV2cm9uLmNsYXNzTGlzdC5hZGQoLi4uVGhlbWVJY29uLmFzQ2xhc3NOYW1lQXJyYXkoQ29kaWNvbi5jaGV2cm9uUmlnaHQpKTtcblx0XHRjb25zdCBkaXNjbG9zdXJlTGFiZWwgPSBmb3JtYXRDb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVMYWJlbChzdGVwQ291bnQsIGVsZW1lbnQubW9kZWwuZWxhcHNlZE1zKTtcblx0XHRsYWJlbC50ZXh0Q29udGVudCA9IGRpc2Nsb3N1cmVMYWJlbDtcblxuXHRcdGNvbnN0IGFjdGl2ZUVsZW1lbnQgPSBkb20uZ2V0QWN0aXZlRWxlbWVudCgpO1xuXHRcdGNvbnN0IGtlZXBPcGVuRm9yRm9jdXMgPSBub2Rlc1RvQ29sbGFwc2Uuc29tZShub2RlID0+IG5vZGUuY29udGFpbnMoYWN0aXZlRWxlbWVudCkpO1xuXHRcdGNvbnN0IHNob3VsZEFuaW1hdGVJbml0aWFsQ29sbGFwc2UgPSBhbmltYXRlQ29sbGFwc2Vcblx0XHRcdCYmICFrZWVwT3BlbkZvckZvY3VzXG5cdFx0XHQmJiAhdGhpcy5hY2Nlc3NpYmlsaXR5U2VydmljZS5pc01vdGlvblJlZHVjZWQoKVxuXHRcdFx0JiYgdGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZU9wZW4gPT09IHVuZGVmaW5lZDtcblx0XHRpZiAoa2VlcE9wZW5Gb3JGb2N1cykge1xuXHRcdFx0dGVtcGxhdGVEYXRhLmNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZU9wZW4gPSB0cnVlO1xuXHRcdH1cblx0XHRkZXRhaWxzLm9wZW4gPSB0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlT3BlbiA/PyBzaG91bGRBbmltYXRlSW5pdGlhbENvbGxhcHNlO1xuXHRcdGNvbnN0IHVwZGF0ZUV4cGFuc2lvblN0YXRlID0gKCkgPT4ge1xuXHRcdFx0c3VtbWFyeS5zZXRBdHRyaWJ1dGUoJ2FyaWEtZXhwYW5kZWQnLCBTdHJpbmcoZGV0YWlscy5vcGVuKSk7XG5cdFx0XHRjaGV2cm9uLmNsYXNzTGlzdC50b2dnbGUoJ2V4cGFuZGVkJywgZGV0YWlscy5vcGVuKTtcblx0XHR9O1xuXHRcdHVwZGF0ZUV4cGFuc2lvblN0YXRlKCk7XG5cblx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuaW5zZXJ0QmVmb3JlKGRldGFpbHMsIGNvbGxhcHNlRW5kUm9vdCk7XG5cdFx0ZGV0YWlscy5hcHBlbmQoLi4ubm9kZXNUb0NvbGxhcHNlKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlID0gZGV0YWlscztcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VDb2xsYXBzZUVuZEluZGV4ID0gY29sbGFwc2VFbmRJbmRleDtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlRGlzcG9zYWJsZXMuYWRkKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIoZGV0YWlscywgJ3RvZ2dsZScsICgpID0+IHtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVPcGVuID0gZGV0YWlscy5vcGVuO1xuXHRcdFx0dXBkYXRlRXhwYW5zaW9uU3RhdGUoKTtcblx0XHR9KSk7XG5cblx0XHQvLyBVbmxpa2UgdGhlIGBDaGF0Q29sbGFwc2libGVDb250ZW50UGFydGAtYmFzZWQgY29sbGFwc2libGVzLCB0aGlzIGRpc2Nsb3N1cmUgaXMgYSBwbGFpblxuXHRcdC8vIGA8ZGV0YWlscz5gIGJ1aWx0IGhlcmUsIHNvIGl0IGhhcyB0byBhbm5vdW5jZSB1c2VyIHRvZ2dsZXMgaXRzZWxmLiBXaXRob3V0IHRoZVxuXHRcdC8vIGFubm91bmNlbWVudCBgQ2hhdExpc3RXaWRnZXRgIHRyZWF0cyB0aGUgZXhwYW5zaW9uIGxpa2Ugc3RyZWFtZWQgY29udGVudCBhbmQgYXV0by1zY3JvbGxzXG5cdFx0Ly8gdG8gdGhlIG5ldyBlbmQgb2YgdGhlIHRyYW5zY3JpcHQsIHdoaWNoIHB1c2hlcyB0aGUgc3VtbWFyeSBvZmYgdGhlIHRvcCBvZiB0aGUgdmlld3BvcnRcblx0XHQvLyBpbnN0ZWFkIG9mIGtlZXBpbmcgaXQgYW5jaG9yZWQgYW5kIGdyb3dpbmcgZG93bndhcmRzLlxuXHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlcy5hZGQoZG9tLmFkZERpc3Bvc2FibGVMaXN0ZW5lcihzdW1tYXJ5LCBkb20uRXZlbnRUeXBlLkNMSUNLLCAoKSA9PiB7XG5cdFx0XHRkZXRhaWxzLmRpc3BhdGNoRXZlbnQobmV3IEN1c3RvbUV2ZW50KENoYXRDb2xsYXBzaWJsZUNvbnRlbnRQYXJ0LnVzZXJUb2dnbGVFdmVudCwgeyBidWJibGVzOiB0cnVlIH0pKTtcblx0XHR9KSk7XG5cblx0XHRpZiAoc2hvdWxkQW5pbWF0ZUluaXRpYWxDb2xsYXBzZSkge1xuXHRcdFx0Y29uc3QgdGFyZ2V0V2luZG93ID0gZG9tLmdldFdpbmRvdyhkZXRhaWxzKTtcblx0XHRcdGNvbnN0IGFuaW1hdGlvbkZyYW1lID0gdGFyZ2V0V2luZG93LnJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XG5cdFx0XHRcdGlmICh0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlID09PSBkZXRhaWxzICYmIGRldGFpbHMub3Blbikge1xuXHRcdFx0XHRcdGRldGFpbHMub3BlbiA9IGZhbHNlO1xuXHRcdFx0XHR9XG5cdFx0XHR9KTtcblx0XHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlcy5hZGQodG9EaXNwb3NhYmxlKCgpID0+IHRhcmdldFdpbmRvdy5jYW5jZWxBbmltYXRpb25GcmFtZShhbmltYXRpb25GcmFtZSkpKTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUNvbXBsZXRlZFJlc3BvbnNlRGlzY2xvc3VyZSh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSk6IHZvaWQge1xuXHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZURpc2Nsb3N1cmVEaXNwb3NhYmxlcy5jbGVhcigpO1xuXHRcdGNvbnN0IGRldGFpbHMgPSB0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlO1xuXHRcdGlmICghZGV0YWlscykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdHdoaWxlIChkZXRhaWxzLmNoaWxkTm9kZXMubGVuZ3RoID4gMSkge1xuXHRcdFx0ZGV0YWlscy5iZWZvcmUoZGV0YWlscy5jaGlsZE5vZGVzWzFdKTtcblx0XHR9XG5cdFx0ZGV0YWlscy5yZW1vdmUoKTtcblx0XHR0ZW1wbGF0ZURhdGEuY29tcGxldGVkUmVzcG9uc2VEaXNjbG9zdXJlID0gdW5kZWZpbmVkO1xuXHRcdHRlbXBsYXRlRGF0YS5jb21wbGV0ZWRSZXNwb25zZUNvbGxhcHNlRW5kSW5kZXggPSB1bmRlZmluZWQ7XG5cdH1cblxuXHQvKipcblx0ICogUmV0dXJucyBhbGwgY29udGVudCBwYXJ0cyB0aGF0IHNob3VsZCBiZSByZW5kZXJlZCwgYW5kIHRyaW1tZWQgbWFya2Rvd24gY29udGVudC4gV2Ugd2lsbCBkaWZmIHRoaXMgd2l0aCB0aGUgY3VycmVudCByZW5kZXJlZCBzZXQuXG5cdCAqL1xuXHRwcml2YXRlIGdldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQoZWxlbWVudDogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB7IGNvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W107IG1vcmVDb250ZW50QXZhaWxhYmxlOiBib29sZWFuIH0ge1xuXHRcdGNvbnN0IGRhdGEgPSB0aGlzLmdldERhdGFGb3JQcm9ncmVzc2l2ZVJlbmRlcihlbGVtZW50KTtcblxuXHRcdC8vIFdoZW4gaW5jcmVtZW50YWwgcmVuZGVyaW5nIGlzIGVuYWJsZWQsIHNraXAgd29yZC1jb3VudGluZyBmb3IgbWFya2Rvd24uXG5cdFx0Ly8gVGhlIG1vcnBoZXIncyBvd24gYnVmZmVyICsgckFGIGxvb3AgaXMgdGhlIHNvbGUgcmF0ZSBsaW1pdGVyLlxuXHRcdGNvbnN0IGluY3JlbWVudGFsUmVuZGVyaW5nID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLkluY3JlbWVudGFsUmVuZGVyaW5nKSA9PT0gdHJ1ZTtcblxuXHRcdGNvbnN0IHJlc3BvbnNlQ29udGVudCA9IGFubm90YXRlU3BlY2lhbE1hcmtkb3duQ29udGVudChlbGVtZW50LnJlc3BvbnNlLnZhbHVlKTtcblx0XHRjb25zdCByZW5kZXJhYmxlUmVzcG9uc2UgPSBlbGVtZW50LmlzQ29tcGxldGUgPyBtb3ZlUmVzcG9uc2VPdXRjb21lVG9vbHNBZnRlckZpbmFsUmVzcG9uc2UocmVzcG9uc2VDb250ZW50KSA6IHJlc3BvbnNlQ29udGVudDtcblxuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ2dldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQnLCBgV2FudCB0byByZW5kZXIgJHtkYXRhLm51bVdvcmRzVG9SZW5kZXJ9IGF0ICR7ZGF0YS5yYXRlfSB3b3Jkcy9zLCBjb3VudGluZy4uLmApO1xuXHRcdGxldCBudW1OZWVkZWRXb3JkcyA9IGRhdGEubnVtV29yZHNUb1JlbmRlcjtcblx0XHRjb25zdCBwYXJ0c1RvUmVuZGVyOiBJQ2hhdFJlbmRlcmVyQ29udGVudFtdID0gW107XG5cblx0XHQvLyBBbHdheXMgYWRkIHRoZSByZWZlcmVuY2VzIHRvIGF2b2lkIHNoaWZ0aW5nIHRoZSBjb250ZW50IHBhcnRzIHdoZW4gYSByZWZlcmVuY2UgaXMgYWRkZWQsIGFuZCBoYXZpbmcgdG8gcmUtZGlmZiBhbGwgdGhlIGNvbnRlbnQuXG5cdFx0Ly8gVGhlIHBhcnQgd2lsbCBoaWRlIGl0c2VsZiBpZiB0aGUgbGlzdCBpcyBlbXB0eS5cblx0XHRwYXJ0c1RvUmVuZGVyLnB1c2goeyBraW5kOiAncmVmZXJlbmNlcycsIHJlZmVyZW5jZXM6IGVsZW1lbnQuY29udGVudFJlZmVyZW5jZXMgfSk7XG5cblx0XHRsZXQgbW9yZUNvbnRlbnRBdmFpbGFibGUgPSBmYWxzZTtcblx0XHRmb3IgKGxldCBpID0gMDsgaSA8IHJlbmRlcmFibGVSZXNwb25zZS5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgcGFydCA9IHJlbmRlcmFibGVSZXNwb25zZVtpXTtcblx0XHRcdGlmIChwYXJ0LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnICYmICFpbmNyZW1lbnRhbFJlbmRlcmluZykge1xuXHRcdFx0XHRjb25zdCB3b3JkQ291bnRSZXN1bHQgPSBnZXROV29yZHMocGFydC5jb250ZW50LnZhbHVlLCBudW1OZWVkZWRXb3Jkcyk7XG5cdFx0XHRcdHRoaXMudHJhY2VMYXlvdXQoJ2dldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQnLCBgICBDaHVuayAke2l9OiBXYW50IHRvIHJlbmRlciAke251bU5lZWRlZFdvcmRzfSB3b3JkcyBhbmQgZm91bmQgJHt3b3JkQ291bnRSZXN1bHQucmV0dXJuZWRXb3JkQ291bnR9IHdvcmRzLiBUb3RhbCB3b3JkcyBpbiBjaHVuazogJHt3b3JkQ291bnRSZXN1bHQudG90YWxXb3JkQ291bnR9YCk7XG5cdFx0XHRcdG51bU5lZWRlZFdvcmRzIC09IHdvcmRDb3VudFJlc3VsdC5yZXR1cm5lZFdvcmRDb3VudDtcblxuXHRcdFx0XHRpZiAod29yZENvdW50UmVzdWx0LmlzRnVsbFN0cmluZykge1xuXHRcdFx0XHRcdHBhcnRzVG9SZW5kZXIucHVzaChwYXJ0KTtcblxuXHRcdFx0XHRcdC8vIENvbnN1bWVkIGZ1bGwgbWFya2Rvd24gY2h1bmstIG5lZWQgdG8gZW5zdXJlIHRoYXQgYWxsIGZvbGxvd2luZyBub24tbWFya2Rvd24gcGFydHMgYXJlIHJlbmRlcmVkXG5cdFx0XHRcdFx0Zm9yIChjb25zdCBuZXh0UGFydCBvZiByZW5kZXJhYmxlUmVzcG9uc2Uuc2xpY2UoaSArIDEpKSB7XG5cdFx0XHRcdFx0XHRpZiAobmV4dFBhcnQua2luZCAhPT0gJ21hcmtkb3duQ29udGVudCcpIHtcblx0XHRcdFx0XHRcdFx0aSsrO1xuXHRcdFx0XHRcdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2gobmV4dFBhcnQpO1xuXHRcdFx0XHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0XHRcdFx0YnJlYWs7XG5cdFx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdC8vIE9ubHkgdGFraW5nIHBhcnQgb2YgdGhpcyBtYXJrZG93biBwYXJ0XG5cdFx0XHRcdFx0bW9yZUNvbnRlbnRBdmFpbGFibGUgPSB0cnVlO1xuXHRcdFx0XHRcdHBhcnRzVG9SZW5kZXIucHVzaCh7IC4uLnBhcnQsIGNvbnRlbnQ6IG5ldyBNYXJrZG93blN0cmluZyh3b3JkQ291bnRSZXN1bHQudmFsdWUsIHBhcnQuY29udGVudCkgfSk7XG5cdFx0XHRcdH1cblxuXHRcdFx0XHRpZiAobnVtTmVlZGVkV29yZHMgPD0gMCkge1xuXHRcdFx0XHRcdC8vIENvbGxlY3RlZCBhbGwgd29yZHMgYW5kIGZvbGxvd2luZyBub24tbWFya2Rvd24gcGFydHMgaWYgbmVlZGVkLCBkb25lXG5cdFx0XHRcdFx0aWYgKHJlbmRlcmFibGVSZXNwb25zZS5zbGljZShpICsgMSkuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcpKSB7XG5cdFx0XHRcdFx0XHRtb3JlQ29udGVudEF2YWlsYWJsZSA9IHRydWU7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHRcdGJyZWFrO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2gocGFydCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgbGFzdFdvcmRDb3VudCA9IGVsZW1lbnQuY29udGVudFVwZGF0ZVRpbWluZ3M/Lmxhc3RXb3JkQ291bnQgPz8gMDtcblx0XHRjb25zdCBuZXdSZW5kZXJlZFdvcmRDb3VudCA9IGRhdGEubnVtV29yZHNUb1JlbmRlciAtIG51bU5lZWRlZFdvcmRzO1xuXHRcdGNvbnN0IGJ1ZmZlcldvcmRzID0gbGFzdFdvcmRDb3VudCAtIG5ld1JlbmRlcmVkV29yZENvdW50O1xuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ2dldE5leHRQcm9ncmVzc2l2ZVJlbmRlckNvbnRlbnQnLCBgV2FudCB0byByZW5kZXIgJHtkYXRhLm51bVdvcmRzVG9SZW5kZXJ9IHdvcmRzLiBSZW5kZXJpbmcgJHtuZXdSZW5kZXJlZFdvcmRDb3VudH0gd29yZHMuIEJ1ZmZlcjogJHtidWZmZXJXb3Jkc30gd29yZHNgKTtcblx0XHRpZiAobmV3UmVuZGVyZWRXb3JkQ291bnQgPiAwICYmIG5ld1JlbmRlcmVkV29yZENvdW50ICE9PSBlbGVtZW50LnJlbmRlckRhdGE/LnJlbmRlcmVkV29yZENvdW50KSB7XG5cdFx0XHQvLyBPbmx5IHVwZGF0ZSBsYXN0UmVuZGVyVGltZSB3aGVuIHdlIGFjdHVhbGx5IHJlbmRlciBuZXcgY29udGVudFxuXHRcdFx0ZWxlbWVudC5yZW5kZXJEYXRhID0geyBsYXN0UmVuZGVyVGltZTogRGF0ZS5ub3coKSwgcmVuZGVyZWRXb3JkQ291bnQ6IG5ld1JlbmRlcmVkV29yZENvdW50LCByZW5kZXJlZFBhcnRzOiBwYXJ0c1RvUmVuZGVyIH07XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd29ya2luZ1Byb2dyZXNzID0gdGhpcy5zaG91bGRTaG93V29ya2luZ1Byb2dyZXNzKGVsZW1lbnQsIHBhcnRzVG9SZW5kZXIsIG1vcmVDb250ZW50QXZhaWxhYmxlLCB0ZW1wbGF0ZURhdGEpO1xuXHRcdGlmICh3b3JraW5nUHJvZ3Jlc3MpIHtcblx0XHRcdHBhcnRzVG9SZW5kZXIucHVzaCh3b3JraW5nUHJvZ3Jlc3MpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGZpbGVDaGFuZ2VzU3VtbWFyeVBhcnQgPSB0aGlzLmdldENoYXRGaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KGVsZW1lbnQpO1xuXHRcdGlmIChmaWxlQ2hhbmdlc1N1bW1hcnlQYXJ0KSB7XG5cdFx0XHRwYXJ0c1RvUmVuZGVyLnB1c2goZmlsZUNoYW5nZXNTdW1tYXJ5UGFydCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgdHVyblBpbGxzUGFydCA9IHRoaXMuZ2V0Q2hhdFR1cm5QaWxsc1BhcnQoZWxlbWVudCk7XG5cdFx0aWYgKHR1cm5QaWxsc1BhcnQpIHtcblx0XHRcdHBhcnRzVG9SZW5kZXIucHVzaCh0dXJuUGlsbHNQYXJ0KTtcblx0XHR9XG5cblx0XHRyZXR1cm4geyBjb250ZW50OiBwYXJ0c1RvUmVuZGVyLCBtb3JlQ29udGVudEF2YWlsYWJsZSB9O1xuXHR9XG5cblx0cHJpdmF0ZSBzaG91bGRTaG93RmlsZUNoYW5nZXNTdW1tYXJ5KGVsZW1lbnQ6IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBib29sZWFuIHtcblx0XHQvLyBPbmx5IHNob3cgZmlsZSBjaGFuZ2VzIHN1bW1hcnkgZm9yIGxvY2FsIHNlc3Npb25zIC0gYmFja2dyb3VuZCBzZXNzaW9ucyBhbHJlYWR5IGhhdmUgdGhlaXIgb3duIGZpbGUgY2hhbmdlcyBwYXJ0XG5cdFx0Y29uc3Qgc2Vzc2lvblR5cGUgPSBnZXRDaGF0U2Vzc2lvblR5cGUoZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGNvbnN0IGlzTG9jYWxTZXNzaW9uID0gc2Vzc2lvblR5cGUgPT09IGxvY2FsQ2hhdFNlc3Npb25UeXBlIHx8IGlzQWdlbnRIb3N0VGFyZ2V0KHNlc3Npb25UeXBlKTtcblx0XHRyZXR1cm4gc2hvdWxkU2hvd0ZpbGVDaGFuZ2VzU3VtbWFyeUZvclNldHRpbmdzKFxuXHRcdFx0ZWxlbWVudC5pc0NvbXBsZXRlLFxuXHRcdFx0aXNMb2NhbFNlc3Npb24sXG5cdFx0XHR0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oJ2NoYXQuY2hlY2twb2ludHMuc2hvd0ZpbGVDaGFuZ2VzJyksXG5cdFx0KTtcblx0fVxuXG5cdHByaXZhdGUgc2hvdWxkU2hvd1BpbGxzU3VtbWFyeShlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKTogYm9vbGVhbiB7XG5cdFx0cmV0dXJuIHNob3VsZFNob3dQaWxsc1N1bW1hcnlGb3JTZXR0aW5ncyhcblx0XHRcdGVsZW1lbnQuaXNDb21wbGV0ZSxcblx0XHRcdGlzQWdlbnRIb3N0VGFyZ2V0KGdldENoYXRTZXNzaW9uVHlwZShlbGVtZW50LnNlc3Npb25SZXNvdXJjZSkpLFxuXHRcdFx0dGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENoYXRUdXJuU3RhdHVzUGlsbHNTZXR0aW5nIHwgdW5kZWZpbmVkPihDaGF0Q29uZmlndXJhdGlvbi5UdXJuU3RhdHVzUGlsbHMpLFxuXHRcdCk7XG5cdH1cblxuXHRwcml2YXRlIGdldERhdGFGb3JQcm9ncmVzc2l2ZVJlbmRlcihlbGVtZW50OiBJQ2hhdFJlc3BvbnNlVmlld01vZGVsKSB7XG5cdFx0Y29uc3QgaGFzTWFya2Rvd25QYXJ0cyA9IGVsZW1lbnQucmVzcG9uc2UudmFsdWUuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgcGFydC5jb250ZW50LnZhbHVlLnRyaW0oKS5sZW5ndGggPiAwKTtcblx0XHRpZiAoc2hvdWxkUmVuZGVySW5pdGlhbFByb2dyZXNzaXZlQ29udGVudEltbWVkaWF0ZWx5KGVsZW1lbnQuaXNDb21wbGV0ZSwgaGFzTWFya2Rvd25QYXJ0cywgZWxlbWVudC5yZW5kZXJEYXRhICE9PSB1bmRlZmluZWQpKSB7XG5cdFx0XHQvKipcblx0XHRcdCAqIE5vbmUgb2YgdGhlIG1hcmtkb3duIGluIHRoZSBvbmdvaW5nIHJlc3BvbnNlIGhhcyBiZWVuIHJlbmRlcmVkIHlldCxcblx0XHRcdCAqIHNvIHdlIHNob3VsZCByZW5kZXIgYWxsIGV4aXN0aW5nIHBhcnRzIHdpdGhvdXQgYW5pbWF0aW9uLlxuXHRcdFx0ICovXG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRudW1Xb3Jkc1RvUmVuZGVyOiBOdW1iZXIuTUFYX1NBRkVfSU5URUdFUixcblx0XHRcdFx0cmF0ZTogTnVtYmVyLk1BWF9TQUZFX0lOVEVHRVJcblx0XHRcdH07XG5cdFx0fVxuXG5cdFx0Y29uc3QgcmVuZGVyRGF0YSA9IGVsZW1lbnQucmVuZGVyRGF0YSA/PyB7IGxhc3RSZW5kZXJUaW1lOiAwLCByZW5kZXJlZFdvcmRDb3VudDogMCB9O1xuXG5cdFx0Y29uc3QgcmF0ZSA9IHRoaXMuZ2V0UHJvZ3Jlc3NpdmVSZW5kZXJSYXRlKGVsZW1lbnQpO1xuXHRcdGNvbnN0IG51bVdvcmRzVG9SZW5kZXIgPSByZW5kZXJEYXRhLmxhc3RSZW5kZXJUaW1lID09PSAwID9cblx0XHRcdDEgOlxuXHRcdFx0cmVuZGVyRGF0YS5yZW5kZXJlZFdvcmRDb3VudCArXG5cdFx0XHQvLyBBZGRpdGlvbmFsIHdvcmRzIHRvIHJlbmRlciBiZXlvbmQgd2hhdCdzIGFscmVhZHkgcmVuZGVyZWRcblx0XHRcdE1hdGguZmxvb3IoKERhdGUubm93KCkgLSByZW5kZXJEYXRhLmxhc3RSZW5kZXJUaW1lKSAvIDEwMDAgKiByYXRlKTtcblxuXHRcdHJldHVybiB7XG5cdFx0XHRudW1Xb3Jkc1RvUmVuZGVyLFxuXHRcdFx0cmF0ZVxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIGRpZmYocmVuZGVyZWRQYXJ0czogUmVhZG9ubHlBcnJheTxJQ2hhdENvbnRlbnRQYXJ0PiwgY29udGVudFRvUmVuZGVyOiBSZWFkb25seUFycmF5PElDaGF0UmVuZGVyZXJDb250ZW50PiwgZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogUmVhZG9ubHlBcnJheTxJQ2hhdFJlbmRlcmVyQ29udGVudCB8IG51bGw+IHtcblx0XHRjb25zdCBkaWZmOiAoSUNoYXRSZW5kZXJlckNvbnRlbnQgfCBudWxsKVtdID0gW107XG5cdFx0Zm9yIChsZXQgaSA9IDA7IGkgPCBjb250ZW50VG9SZW5kZXIubGVuZ3RoOyBpKyspIHtcblx0XHRcdGNvbnN0IGNvbnRlbnQgPSBjb250ZW50VG9SZW5kZXJbaV07XG5cdFx0XHRjb25zdCByZW5kZXJlZFBhcnQgPSByZW5kZXJlZFBhcnRzW2ldO1xuXG5cdFx0XHRpZiAoIXJlbmRlcmVkUGFydCB8fCAhcmVuZGVyZWRQYXJ0Lmhhc1NhbWVDb250ZW50KGNvbnRlbnQsIGNvbnRlbnRUb1JlbmRlci5zbGljZShpICsgMSksIGVsZW1lbnQpKSB7XG5cdFx0XHRcdGRpZmYucHVzaChjb250ZW50KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdC8vIG51bGwgLT4gbm8gY2hhbmdlXG5cdFx0XHRcdGRpZmYucHVzaChudWxsKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZGlmZjtcblx0fVxuXG5cdHByaXZhdGUgaGFzRWRpdENvZGVibG9ja1VyaShwYXJ0OiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXHRcdHJldHVybiBoYXNFZGl0Q29kZWJsb2NrVXJpVGFnKHBhcnQuY29udGVudC52YWx1ZSk7XG5cdH1cblxuXHRwcml2YXRlIGlzQ29kZWJsb2NrQ29tcGxldGUocGFydDogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cdFx0cmV0dXJuICFpc1Jlc3BvbnNlVk0oZWxlbWVudCkgfHwgZWxlbWVudC5pc0NvbXBsZXRlIHx8IGNvZGVibG9ja0hhc0Nsb3NpbmdCYWNrdGlja3MocGFydC5jb250ZW50LnZhbHVlKTtcblx0fVxuXG5cdC8vIHRvZG8gQGp1c3RzY2hlbiBpbml0aWFsbHkgc3BsaXQgdXAgZWFjaCBvZiB0aGUgY2hlY2tzIHRvIGVhc2lseSBzZWUgd2hhdCBzaG91bGQgYmUgcGlubmVkL25vdCBwaW5uZWQsIHdlIGNhbiBwcm9iYWJseSBjb25zb2xpZGF0ZSB0aGlzIGRvd24gYnkgYSBsb3Qgb25jZSB3ZSdyZSBtb3JlIGNvbmZpZGVudCBpbiB0aGUgbG9naWMuXG5cdHByaXZhdGUgc2hvdWxkUGluUGFydChwYXJ0OiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgZWxlbWVudD86IElDaGF0UmVzcG9uc2VWaWV3TW9kZWwpOiBib29sZWFuIHtcblx0XHRjb25zdCBjb2xsYXBzZWRUb29sc01vZGUgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Q29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZT4oJ2NoYXQuYWdlbnQudGhpbmtpbmcuY29sbGFwc2VkVG9vbHMnKTtcblxuXHRcdC8vIHRoaW5raW5nIGFuZCB3b3JraW5nIGNvbnRlbnQgYXJlIGFsd2F5cyBwaW5uZWQgKHRoZXkgYXJlIHRoZSB0aGlua2luZyBjb250YWluZXIgaXRzZWxmKVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0aGlua2luZycgfHwgcGFydC5raW5kID09PSAnd29ya2luZycpIHtcblx0XHRcdHJldHVybiB0cnVlO1xuXHRcdH1cblxuXHRcdC8vIHNob3VsZCBub3QgZmluYWxpemUgdGhpbmtpbmdcblx0XHRpZiAocGFydC5raW5kID09PSAndW5kb1N0b3AnKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBvbmx5IHRvb2wgcmVsYXRlZCBob29rcyB3aWxsIGJlIGluc2lkZSB0aGlua2luZyBjb250YWluZXJzLlxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdob29rJykge1xuXHRcdFx0aWYgKHBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuIHBhcnQuaG9va1R5cGUgPT09IEhvb2tUeXBlLlByZVRvb2xVc2UgfHwgcGFydC5ob29rVHlwZSA9PT0gSG9va1R5cGUuUG9zdFRvb2xVc2U7XG5cdFx0fVxuXG5cdFx0aWYgKGNvbGxhcHNlZFRvb2xzTW9kZSA9PT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5PZmYpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBpcyBhbiBlZGl0IHJlbGF0ZWQgcGFydFxuXHRcdGlmICh0aGlzLmhhc0VkaXRDb2RlYmxvY2tVcmkocGFydCkgfHwgcGFydC5raW5kID09PSAndGV4dEVkaXRHcm91cCcgfHwgcGFydC5raW5kID09PSAnZXh0ZXJuYWxFZGl0Jykge1xuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3QgcGluIE1DUCB0b29scyArIGZvciBDTEkgc3BlY2ZpY2lhbGx5LCB3ZSBwYXJzZSB0b29sIG5hbWUgc2luY2UgQ0xJIHRvb2xzIGFyZSBcImV4dGVybmFsXCIgdG9vbHMuXG5cdFx0Y29uc3QgaXNNY3BUb29sID0gKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiBpc01jcFRvb2xJbnZvY2F0aW9uKHBhcnQpO1xuXHRcdGlmIChpc01jcFRvb2wpIHtcblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9XG5cblx0XHQvLyBkb24ndCBwaW4gTWVybWFpZCB0b29scyBzaW5jZSBpdCBoYXMgcmVuZGVyZWQgb3V0cHV0XG5cdFx0Y29uc3QgaXNNZXJtYWlkVG9vbCA9IChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgcGFydC50b29sSWQudG9Mb3dlckNhc2UoKS5pbmNsdWRlcygnbWVybWFpZCcpO1xuXHRcdGlmIChpc01lcm1haWRUb29sKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gZG9uJ3QgcGluIGFzayBxdWVzdGlvbnMgdG9vbCBpbnZvY2F0aW9uc1xuXHRcdGNvbnN0IGlzQXNrUXVlc3Rpb25zVG9vbCA9IChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgaXNBc2tRdWVzdGlvbnNUb29sSW52b2NhdGlvbihwYXJ0KTtcblx0XHRpZiAoaXNBc2tRdWVzdGlvbnNUb29sKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gRG9uJ3QgcGluIHN1YmFnZW50IHRvb2xzIHRvIHRoaW5raW5nIHBhcnRzIC0gdGhleSBoYXZlIHRoZWlyIG93biBncm91cGluZ1xuXHRcdGlmICgocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIGlzU3ViYWdlbnRUb29sSW52b2NhdGlvbihwYXJ0KSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHBpbiBzZXNzaW9uLWNyZWF0ZWQgdG9vbHMgKGNyZWF0ZV9zZXNzaW9uIC8gY3JlYXRlX2NoYXQpIFx1MjAxNCB0aGVpclxuXHRcdC8vIFwiT3BlbiBTZXNzaW9uXCIgYnV0dG9uIG11c3Qgc3RheSB2aXNpYmxlLCBub3QgaGlkZGVuIGluc2lkZSBhIGNvbGxhcHNlZFxuXHRcdC8vIHRoaW5raW5nIGdyb3VwLiBLZXllZCBvbiB0b29sSWQgc28gdGhpcyBob2xkcyB3aGlsZSB0aGUgdG9vbCBzdHJlYW1zIHRvb1xuXHRcdC8vIChiZWZvcmUgYHRvb2xTcGVjaWZpY0RhdGFgIGlzIHNldCBvbiBjb21wbGV0aW9uKS5cblx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSAmJiAoaXNDcmVhdGVTZXNzaW9uVG9vbChwYXJ0LnRvb2xJZCkgfHwgaXNDcmVhdGVDaGF0VG9vbChwYXJ0LnRvb2xJZCkgfHwgaXNTZW5kTWVzc2FnZVRvb2wocGFydC50b29sSWQpKSkge1xuXHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdH1cblxuXHRcdC8vIEdlbmVyYXRlZCBpbWFnZXMgYXJlIGR1cmFibGUgcmVzcG9uc2Ugb3V0Y29tZXMuIEtlZXAgdGhlbSBvdXRzaWRlIHRoaW5raW5nIGZyb20gdGhlXG5cdFx0Ly8gbW9tZW50IHRoZSB0b29sIHN0YXJ0cyBzbyBjb21wbGV0aW9uIGNhbiByZXBsYWNlIHRoZSBjb21wYWN0IHByb2dyZXNzIHJlbmRlcmluZyB3aXRoXG5cdFx0Ly8gdGhlIGZpbmFsIGltYWdlIGluIHBsYWNlIGluc3RlYWQgb2YgbGVhdmluZyBhIG1hdGVyaWFsaXplZCBjb3B5IGluc2lkZSB0aGlua2luZy5cblx0XHRpZiAoKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdFx0JiYgKHBhcnQudG9vbElkID09PSAnaW1hZ2VfZ2VuLmltYWdlZ2VuJyB8fCBwYXJ0LnRvb2xTcGVjaWZpY0RhdGE/LmtpbmQgPT09ICdnZW5lcmF0ZWRJbWFnZScpKSB7XG5cdFx0XHRyZXR1cm4gZmFsc2U7XG5cdFx0fVxuXG5cdFx0Ly8gb25seSBwaW4gdGVybWluYWwgdG9vbHMgYmFzZWQgb24gc2V0dGluZ3Ncblx0XHRjb25zdCBpc1Rlcm1pbmFsVG9vbCA9IChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykgJiYgcGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAndGVybWluYWwnO1xuXHRcdGNvbnN0IGlzQ29udHJpYnV0ZWRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uID0gZWxlbWVudFxuXHRcdFx0JiYgKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlLnNjaGVtZSAhPT0gU2NoZW1hcy52c2NvZGVDaGF0SW5wdXQgJiYgZ2V0Q2hhdFNlc3Npb25UeXBlKGVsZW1lbnQuc2Vzc2lvblJlc291cmNlKSAhPT0gbG9jYWxDaGF0U2Vzc2lvblR5cGUpIC8vIGNvbnRyaWJ1dGVkIHNlc3Npb25zXG5cdFx0XHQmJiBwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnICYmIHBhcnQudG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ3Rlcm1pbmFsJzsgLy8gY29udHJpYnV0ZWQgc2VyaWFsaXplZCB0ZXJtaW5hbCB0b29sIGludm9jYXRpb25zIGRhdGFcblx0XHRpZiAoaXNUZXJtaW5hbFRvb2wgJiYgIWlzQ29udHJpYnV0ZWRUZXJtaW5hbFRvb2xJbnZvY2F0aW9uKSB7XG5cdFx0XHQvLyBkb24ndCBwaW4gdGVybWluYWxzIHdpdGggY29uZmlybWF0aW9uXG5cdFx0XHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nICYmIElDaGF0VG9vbEludm9jYXRpb24uZ2V0Q29uZmlybWF0aW9uTWVzc2FnZXMocGFydCkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Y29uc3QgdGVybWluYWxUb29sc0luVGhpbmtpbmcgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Ym9vbGVhbj4oQ2hhdENvbmZpZ3VyYXRpb24uVGVybWluYWxUb29sc0luVGhpbmtpbmcpO1xuXHRcdFx0cmV0dXJuICEhdGVybWluYWxUb29sc0luVGhpbmtpbmc7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSBwYXJ0LnN0YXRlLmdldCgpO1xuXHRcdFx0cmV0dXJuIHNob3VsZFBpblRvb2xJbnZvY2F0aW9uVG9UaGlua2luZyhzdGF0ZS50eXBlLCAhIUlDaGF0VG9vbEludm9jYXRpb24uZ2V0Q29uZmlybWF0aW9uTWVzc2FnZXMocGFydCksIHRvb2xJbnZvY2F0aW9uSGFzTWNwQXBwRGF0YShwYXJ0KSk7XG5cdFx0fVxuXG5cdFx0aWYgKHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRcdHJldHVybiAhdG9vbEludm9jYXRpb25IYXNNY3BBcHBEYXRhKHBhcnQpO1xuXHRcdH1cblxuXHRcdHJldHVybiBmYWxzZTtcblx0fVxuXG5cdHByaXZhdGUgZ2V0TGFzdFRoaW5raW5nUGFydChyZW5kZXJlZFBhcnRzOiBSZWFkb25seUFycmF5PElDaGF0Q29udGVudFBhcnQ+IHwgdW5kZWZpbmVkKTogQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmVuZGVyZWRQYXJ0cyB8fCByZW5kZXJlZFBhcnRzLmxlbmd0aCA9PT0gMCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cblx0XHQvLyBTZWFyY2ggYmFja3dhcmRzIGZvciB0aGUgbW9zdCByZWNlbnQgYWN0aXZlIHRoaW5raW5nIHBhcnRcblx0XHRmb3IgKGxldCBpID0gcmVuZGVyZWRQYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHJlbmRlcmVkUGFydHNbaV07XG5cdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0ICYmIHBhcnQuZ2V0SXNBY3RpdmUoKSkge1xuXHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gdW5kZWZpbmVkO1xuXHR9XG5cblx0cHJpdmF0ZSBnZXRMYXN0VGhpbmtpbmdQYXJ0Rm9yR3JvdXBlZEl0ZW0oY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogeyBwYXJ0OiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCB8IHVuZGVmaW5lZDsgc2VwYXJhdGVkRnJvbVJlYXNvbmluZzogYm9vbGVhbiB9IHtcblx0XHRjb25zdCBsYXN0VGhpbmtpbmcgPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdGNvbnN0IGRpc3BsYXlNb2RlID0gZ2V0RWZmZWN0aXZlVGhpbmtpbmdEaXNwbGF5TW9kZSh0aGlzLmNvbmZpZ1NlcnZpY2UsIHRoaXMuY29udGV4dEtleVNlcnZpY2UpO1xuXHRcdGlmIChsYXN0VGhpbmtpbmc/Lmhhc1JlYXNvbmluZ0NvbnRlbnQoKSAmJiBzaG91bGRTdGFydE5ld0NvbGxhcHNlZFRoaW5raW5nR3JvdXAoZGlzcGxheU1vZGUsICdyZWFzb25pbmcnLCAnaXRlbXMnKSkge1xuXHRcdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdHJldHVybiB7IHBhcnQ6IHVuZGVmaW5lZCwgc2VwYXJhdGVkRnJvbVJlYXNvbmluZzogdHJ1ZSB9O1xuXHRcdH1cblx0XHRyZXR1cm4geyBwYXJ0OiBsYXN0VGhpbmtpbmcsIHNlcGFyYXRlZEZyb21SZWFzb25pbmc6IGZhbHNlIH07XG5cdH1cblxuXHQvKipcblx0ICogRGV0ZXJtaW5lcyBpZiBhIHRoaW5raW5nIHBhcnQgYXQgdGhlIGdpdmVuIGNvbnRlbnQgaW5kZXggaXMgXCJsb29rLWFoZWFkIGNvbXBsZXRlXCIuXG5cdCAqIEEgdGhpbmtpbmcgcGFydCBpcyBsb29rLWFoZWFkIGNvbXBsZXRlIGlmIHRoZXJlIGFyZSBzdWJzZXF1ZW50IHBhcnRzIHRoYXQgd2lsbCBOT1Rcblx0ICogYmUgcGlubmVkIHRvIGl0LCBtZWFuaW5nIHdlIGtub3cgdGhpcyB0aGlua2luZyBwYXJ0IGlzIGFscmVhZHkgZG9uZSBldmVuIHRob3VnaFxuXHQgKiB0aGUgb3ZlcmFsbCByZXNwb25zZSBpcyBzdGlsbCBpbiBwcm9ncmVzcy5cblx0ICovXG5cdHByaXZhdGUgaXNUaGlua2luZ0xvb2tBaGVhZENvbXBsZXRlKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBlbGVtZW50PzogSUNoYXRSZXNwb25zZVZpZXdNb2RlbCk6IGJvb2xlYW4ge1xuXHRcdC8vIElmIGVsZW1lbnQgaXMgYWxyZWFkeSBjb21wbGV0ZSwgbm8gbmVlZCBmb3IgbG9vay1haGVhZFxuXHRcdGlmIChlbGVtZW50Py5pc0NvbXBsZXRlKSB7XG5cdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHR9XG5cblx0XHQvLyBMb29rIGF0IGFsbCBwYXJ0cyBhZnRlciB0aGUgY3VycmVudCBjb250ZW50IGluZGV4XG5cdFx0Zm9yIChsZXQgaSA9IGNvbnRleHQuY29udGVudEluZGV4ICsgMTsgaSA8IGNvbnRleHQuY29udGVudC5sZW5ndGg7IGkrKykge1xuXHRcdFx0Y29uc3QgbmV4dFBhcnQgPSBjb250ZXh0LmNvbnRlbnRbaV07XG5cdFx0XHQvLyBJZiB0aGVyZSdzIGFueSBwYXJ0IHRoYXQgd291bGQgTk9UIGJlIHBpbm5lZCB0byB0aGUgdGhpbmtpbmcgcGFydCxcblx0XHRcdC8vIHRoZW4gdGhpcyB0aGlua2luZyBwYXJ0IGlzIGFscmVhZHkgY29tcGxldGVcblx0XHRcdGlmICghdGhpcy5zaG91bGRQaW5QYXJ0KG5leHRQYXJ0LCBlbGVtZW50KSkge1xuXHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblxuXHRwcml2YXRlIGdldFN1YmFnZW50UGFydChyZW5kZXJlZFBhcnRzOiBSZWFkb25seUFycmF5PElDaGF0Q29udGVudFBhcnQ+IHwgdW5kZWZpbmVkLCBzdWJBZ2VudEludm9jYXRpb25JZD86IHN0cmluZyk6IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIXJlbmRlcmVkUGFydHMgfHwgcmVuZGVyZWRQYXJ0cy5sZW5ndGggPT09IDApIHtcblx0XHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdFx0fVxuXG5cdFx0Ly8gU2VhcmNoIGJhY2t3YXJkcyBmb3IgdGhlIG1vc3QgcmVjZW50IHN1YmFnZW50IHBhcnRcblx0XHRmb3IgKGxldCBpID0gcmVuZGVyZWRQYXJ0cy5sZW5ndGggLSAxOyBpID49IDA7IGktLSkge1xuXHRcdFx0Y29uc3QgcGFydCA9IHJlbmRlcmVkUGFydHNbaV07XG5cdFx0XHRpZiAocGFydCBpbnN0YW5jZW9mIENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0KSB7XG5cdFx0XHRcdC8vIElmIGxvb2tpbmcgZm9yIGEgc3BlY2lmaWMgSUQsIHJldHVybiB0aGUgcGFydCB3aXRoIHRoYXQgSUQgcmVnYXJkbGVzcyBvZiBhY3RpdmUgc3RhdGVcblx0XHRcdFx0aWYgKHN1YkFnZW50SW52b2NhdGlvbklkICYmIHBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPT09IHN1YkFnZW50SW52b2NhdGlvbklkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0Ly8gSWYgbm8gSUQgc3BlY2lmaWVkLCBvbmx5IHJldHVybiBhY3RpdmUgcGFydHNcblx0XHRcdFx0aWYgKCFzdWJBZ2VudEludm9jYXRpb25JZCAmJiBwYXJ0LmdldElzQWN0aXZlKCkpIHtcblx0XHRcdFx0XHRyZXR1cm4gcGFydDtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiB1bmRlZmluZWQ7XG5cdH1cblxuXHRwcml2YXRlIGZpbmFsaXplQWxsU3ViYWdlbnRQYXJ0cyh0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgZm9yY2U6IGJvb2xlYW4gPSBmYWxzZSk6IHZvaWQge1xuXHRcdGlmICghdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHQvLyBGaW5hbGl6ZSBhbGwgYWN0aXZlIHN1YmFnZW50IHBhcnRzICh0aGVyZSBjYW4gYmUgbXVsdGlwbGUgcGFyYWxsZWwgc3ViYWdlbnRzKVxuXHRcdC8vIFNraXAgc3ViYWdlbnRzIHRoYXQgc3RpbGwgaGF2ZSB0b29scyB3YWl0aW5nIGZvciBjb25maXJtYXRpb25cblx0XHRmb3IgKGNvbnN0IHBhcnQgb2YgdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpIHtcblx0XHRcdGlmIChwYXJ0IGluc3RhbmNlb2YgQ2hhdFN1YmFnZW50Q29udGVudFBhcnQgJiYgcGFydC5nZXRJc0FjdGl2ZSgpICYmIChmb3JjZSB8fCAhcGFydC5zaG91bGRSZW1haW5BY3RpdmUoKSkgJiYgKGZvcmNlIHx8ICFwYXJ0Lmhhc1Rvb2xzV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikpIHtcblx0XHRcdFx0cGFydC5tYXJrQXNJbmFjdGl2ZShmb3JjZSk7XG5cdFx0XHR9XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBoYW5kbGVTdWJhZ2VudFRvb2xHcm91cGluZyh0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLCBzdWJhZ2VudElkOiBzdHJpbmcsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgY29kZUJsb2NrU3RhcnRJbmRleDogbnVtYmVyLCBiYXRjaGVkU3ViYWdlbnRQYXJ0cz86IFNldDxDaGF0U3ViYWdlbnRDb250ZW50UGFydD4pOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHQvLyBGaW5hbGl6ZSBhbnkgYWN0aXZlIHRoaW5raW5nIHBhcnQgc2luY2Ugc3ViYWdlbnQgdG9vbHMgaGF2ZSB0aGVpciBvd24gZ3JvdXBpbmdcblx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0Y29uc3QgbGFzdFN1YmFnZW50ID0gdGhpcy5nZXRTdWJhZ2VudFBhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMsIHN1YmFnZW50SWQpO1xuXHRcdGlmIChsYXN0U3ViYWdlbnQpIHtcblx0XHRcdHRoaXMuYmVnaW5TdWJhZ2VudFRvb2xQcmVzZW50YXRpb25CYXRjaChsYXN0U3ViYWdlbnQsIGJhdGNoZWRTdWJhZ2VudFBhcnRzKTtcblx0XHRcdC8vIEVuYWJsZSBjYXJvdXNlbCBtb2RlIGJlZm9yZSBhcHBlbmRUb29sSW52b2NhdGlvbiBjcmVhdGVzIGFuIGlubGluZSBwYXJ0LlxuXHRcdFx0dGhpcy5tYXliZVJvdXRlU3ViYWdlbnRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbiwgbGFzdFN1YmFnZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEsIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXG5cdFx0XHQvLyBBcHBlbmQgdG8gZXhpc3Rpbmcgc3ViYWdlbnQgcGFydCB3aXRoIG1hdGNoaW5nIElEXG5cdFx0XHQvLyBCdXQgc2tpcCB0aGUgcGFyZW50IHN1YmFnZW50IHRvb2wgaXRzZWxmIC0gd2Ugb25seSB3YW50IGNoaWxkIHRvb2xzXG5cdFx0XHRpZiAoIWlzUGFyZW50U3ViYWdlbnRUb29sKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRsYXN0U3ViYWdlbnQuYXBwZW5kVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb24sIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT5cblx0XHRcdFx0XHQob3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJylcblx0XHRcdFx0XHQmJiBvdGhlci50b29sQ2FsbElkID09PSB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKTtcblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXN0U3ViYWdlbnQ7XG5cdFx0fVxuXG5cdFx0Ly8gQ3JlYXRlIGEgbmV3IHN1YmFnZW50IHBhcnQgLSBpdCB3aWxsIGV4dHJhY3QgZGVzY3JpcHRpb24vYWdlbnROYW1lL3Byb21wdCBhbmQgd2F0Y2ggZm9yIGNvbXBsZXRpb25cblx0XHRjb25zdCBzdWJhZ2VudFBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFN1YmFnZW50Q29udGVudFBhcnQsXG5cdFx0XHRzdWJhZ2VudElkLFxuXHRcdFx0dG9vbEludm9jYXRpb24sXG5cdFx0XHRjb250ZXh0LFxuXHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsXG5cdFx0XHR0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0dGhpcy5fdG9vbEVkaXRvclBvb2wsXG5cdFx0XHQoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHR0aGlzLl9hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLFxuXHRcdCk7XG5cdFx0dGhpcy5iZWdpblN1YmFnZW50VG9vbFByZXNlbnRhdGlvbkJhdGNoKHN1YmFnZW50UGFydCwgYmF0Y2hlZFN1YmFnZW50UGFydHMpO1xuXHRcdC8vIEVuYWJsZSBjYXJvdXNlbCBtb2RlIGJlZm9yZSBhcHBlbmRUb29sSW52b2NhdGlvbiBjcmVhdGVzIGFuIGlubGluZSBwYXJ0LlxuXHRcdHRoaXMubWF5YmVSb3V0ZVN1YmFnZW50VG9vbFRvQ2Fyb3VzZWwodG9vbEludm9jYXRpb24sIHN1YmFnZW50UGFydCwgY29udGV4dCwgdGVtcGxhdGVEYXRhLCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblxuXHRcdC8vIERvbid0IGFwcGVuZCB0aGUgcGFyZW50IHN1YmFnZW50IHRvb2wgaXRzZWxmIC0gaXRzIGRlc2NyaXB0aW9uIGlzIGFscmVhZHkgc2hvd24gaW4gdGhlIHRpdGxlXG5cdFx0Ly8gT25seSBhcHBlbmQgY2hpbGQgdG9vbHMgKHRob3NlIHdpdGggc3ViQWdlbnRJbnZvY2F0aW9uSWQpXG5cdFx0aWYgKCFpc1BhcmVudFN1YmFnZW50VG9vbCh0b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHN1YmFnZW50UGFydC5hcHBlbmRUb29sSW52b2NhdGlvbih0b29sSW52b2NhdGlvbiwgY29kZUJsb2NrU3RhcnRJbmRleCk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHN1YmFnZW50UGFydDtcblx0fVxuXG5cdHByaXZhdGUgYmVnaW5TdWJhZ2VudFRvb2xQcmVzZW50YXRpb25CYXRjaChzdWJhZ2VudFBhcnQ6IENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0LCBiYXRjaGVkU3ViYWdlbnRQYXJ0czogU2V0PENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0PiB8IHVuZGVmaW5lZCk6IHZvaWQge1xuXHRcdGlmIChiYXRjaGVkU3ViYWdlbnRQYXJ0cyAmJiAhYmF0Y2hlZFN1YmFnZW50UGFydHMuaGFzKHN1YmFnZW50UGFydCkpIHtcblx0XHRcdGJhdGNoZWRTdWJhZ2VudFBhcnRzLmFkZChzdWJhZ2VudFBhcnQpO1xuXHRcdFx0c3ViYWdlbnRQYXJ0LmJlZ2luVG9vbFByZXNlbnRhdGlvbkJhdGNoKCk7XG5cdFx0fVxuXHR9XG5cblx0LyoqIFJvdXRlcyBzdWJhZ2VudCBjb25maXJtYXRpb25zIHRvIHRoZSBpbnB1dCBjYXJvdXNlbCBhbmQgbGVhdmVzIGEgcGxhY2Vob2xkZXIgaW5saW5lLiAqL1xuXHRwcml2YXRlIG1heWJlUm91dGVTdWJhZ2VudFRvb2xUb0Nhcm91c2VsKFxuXHRcdHRvb2xJbnZvY2F0aW9uOiBJQ2hhdFRvb2xJbnZvY2F0aW9uIHwgSUNoYXRUb29sSW52b2NhdGlvblNlcmlhbGl6ZWQsXG5cdFx0c3ViYWdlbnRQYXJ0OiBDaGF0U3ViYWdlbnRDb250ZW50UGFydCxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHR0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSxcblx0XHRjb2RlQmxvY2tTdGFydEluZGV4OiBudW1iZXIsXG5cdCk6IHZvaWQge1xuXHRcdGlmICghdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKHRvb2xJbnZvY2F0aW9uLmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicgfHwgIWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXHRcdGlmIChpc1BhcmVudFN1YmFnZW50VG9vbCh0b29sSW52b2NhdGlvbikgfHwgdG9vbEludm9jYXRpb24ucHJlc2VudGF0aW9uID09PSAnaGlkZGVuJyB8fCB0b29sSW52b2NhdGlvbi5zb3VyY2UudHlwZSA9PT0gJ21jcCcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cdFx0aWYgKCEhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdGlmICghd2lkZ2V0KSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3Qgc3ViQWdlbnRJbnZvY2F0aW9uSWQgPSBzdWJhZ2VudFBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdFx0Y29uc3QgYWdlbnROYW1lID0gc3ViYWdlbnRQYXJ0LmdldEFnZW50TGFiZWwoKTtcblxuXHRcdGNvbnN0IHJldmVhbFN1YmFnZW50ID0gKHRhcmdldFN1YkFnZW50SWQ6IHN0cmluZykgPT4ge1xuXHRcdFx0Y29uc3QgY3VycmVudFRlbXBsYXRlRGF0YSA9IHRoaXMuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKGNvbnRleHQuZWxlbWVudC5pZCk7XG5cdFx0XHRjb25zdCBjdXJyZW50U3ViYWdlbnRQYXJ0ID0gdGhpcy5nZXRTdWJhZ2VudFBhcnQoY3VycmVudFRlbXBsYXRlRGF0YT8ucmVuZGVyZWRQYXJ0cywgdGFyZ2V0U3ViQWdlbnRJZCkgPz8gc3ViYWdlbnRQYXJ0O1xuXHRcdFx0Y29uc3QgY2hhdFJlc291cmNlID0gY3VycmVudFN1YmFnZW50UGFydC5nZXRDaGF0UmVzb3VyY2UoKTtcblx0XHRcdGlmICh0aGlzLmVudmlyb25tZW50U2VydmljZS5pc1Nlc3Npb25zV2luZG93ICYmIGNoYXRSZXNvdXJjZSkge1xuXHRcdFx0XHR2b2lkIHRoaXMuY29tbWFuZFNlcnZpY2UuZXhlY3V0ZUNvbW1hbmQoQ0hBVF9PUEVOX0FHRU5UX0hPU1RfQ0hBVF9DT01NQU5EX0lELCB7IGNoYXRSZXNvdXJjZSB9KTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdGN1cnJlbnRTdWJhZ2VudFBhcnQuZG9tTm9kZS5zY3JvbGxJbnRvVmlldyh7IGJlaGF2aW9yOiAnc21vb3RoJywgYmxvY2s6ICdjZW50ZXInIH0pO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3QgcmV2ZWFsU3ViYWdlbnRMYWJlbCA9IHRoaXMuZW52aXJvbm1lbnRTZXJ2aWNlLmlzU2Vzc2lvbnNXaW5kb3dcblx0XHRcdD8gbG9jYWxpemUoJ29wZW5TdWJhZ2VudENoYXQnLCBcIk9wZW4gezB9IENoYXRcIiwgYWdlbnROYW1lKVxuXHRcdFx0OiB1bmRlZmluZWQ7XG5cblx0XHRjb25zdCBuYXZpZ2F0ZVRvQ2Fyb3VzZWwgPSAodGFyZ2V0U3ViQWdlbnRJZDogc3RyaW5nKSA9PiB7XG5cdFx0XHR3aWRnZXQuaW5wdXRQYXJ0LmFjdGl2YXRlQ2Fyb3VzZWxGb3JTdWJhZ2VudCh0YXJnZXRTdWJBZ2VudElkKTtcblx0XHR9O1xuXG5cdFx0Y29uc3QgZmFjdG9yeSA9ICh0b29sOiBJQ2hhdFRvb2xJbnZvY2F0aW9uKSA9PiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbCwgY29udGV4dCxcblx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0dGhpcy5fdG9vbEVkaXRvclBvb2wsICgpID0+IHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aC5nZXQoKSxcblx0XHRcdHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMsXG5cdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4XG5cdFx0KTtcblxuXHRcdGNvbnN0IGFkZFRvb2xUb0Nhcm91c2VsID0gKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24pID0+IHtcblx0XHRcdHdpZGdldC5pbnB1dFBhcnQuYWRkVG9vbFRvQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbCwgZmFjdG9yeSwgc3ViQWdlbnRJbnZvY2F0aW9uSWQsIGFnZW50TmFtZSwgcmV2ZWFsU3ViYWdlbnQsIHJldmVhbFN1YmFnZW50TGFiZWwpO1xuXHRcdFx0Y29uc3QgbGlzdGVuZXIgPSB0aGlzLmNyZWF0ZVVwZGF0ZVdvcmtpbmdQcm9ncmVzc09uQ29uZmlybWF0aW9uRW5kKHRvb2wsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRpZiAobGlzdGVuZXIpIHtcblx0XHRcdFx0dGVtcGxhdGVEYXRhLmVsZW1lbnREaXNwb3NhYmxlcy5hZGQobGlzdGVuZXIpO1xuXHRcdFx0fVxuXHRcdH07XG5cdFx0Y29uc3Qgc2hvdWxkVXNlQ2Fyb3VzZWxGb3JUb29sID0gKHRvb2w6IElDaGF0VG9vbEludm9jYXRpb24sIHN0YXRlOiBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlKSA9PlxuXHRcdFx0dGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgJiZcblx0XHRcdCF0aGlzLnZpZXdNb2RlbD8uZWRpdGluZyAmJlxuXHRcdFx0dG9vbC5wcmVzZW50YXRpb24gIT09ICdoaWRkZW4nICYmXG5cdFx0XHR0b29sLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0c3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJlxuXHRcdFx0ISFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGU7XG5cblx0XHRzdWJhZ2VudFBhcnQuZW5hYmxlQ2Fyb3VzZWxNb2RlKG5hdmlnYXRlVG9DYXJvdXNlbCwgYWRkVG9vbFRvQ2Fyb3VzZWwsIHNob3VsZFVzZUNhcm91c2VsRm9yVG9vbCwgd2lkZ2V0LmlucHV0UGFydC5vbkRpZENoYW5nZUFjdGl2ZUNvbmZpcm1hdGlvblN1YmFnZW50KTtcblx0XHRzdWJhZ2VudFBhcnQuc2V0Q29uZmlybWF0aW9uQWN0aXZlKHdpZGdldC5pbnB1dFBhcnQuYWN0aXZlQ29uZmlybWF0aW9uU3ViYWdlbnRJZCA9PT0gc3ViQWdlbnRJbnZvY2F0aW9uSWQpO1xuXG5cdFx0Y29uc3QgdG9vbFN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUuZ2V0KCk7XG5cdFx0aWYgKHRvb2xTdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmXG5cdFx0XHR0b29sU3RhdGUuY29uZmlybWF0aW9uTWVzc2FnZXM/LnRpdGxlKSB7XG5cdFx0XHRhZGRUb29sVG9DYXJvdXNlbCh0b29sSW52b2NhdGlvbik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSBmaW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0Y29uc3QgbGFzdFRoaW5raW5nID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHRpZiAoIWxhc3RUaGlua2luZykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRjb25zdCBzdHlsZSA9IGdldEVmZmVjdGl2ZVRoaW5raW5nRGlzcGxheU1vZGUodGhpcy5jb25maWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKTtcblx0XHRpZiAoc3R5bGUgPT09IFRoaW5raW5nRGlzcGxheU1vZGUuQ29sbGFwc2VkUHJldmlldykge1xuXHRcdFx0bGFzdFRoaW5raW5nLmNvbGxhcHNlQ29udGVudCgpO1xuXHRcdH1cblx0XHRsYXN0VGhpbmtpbmcuZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXHRcdGxhc3RUaGlua2luZy5yZXNldElkKCk7XG5cdFx0bGFzdFRoaW5raW5nLm1hcmtBc0luYWN0aXZlKCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYXRDb250ZW50UGFydChjb250ZW50OiBJQ2hhdFJlbmRlcmVyQ29udGVudCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBiYXRjaGVkU3ViYWdlbnRQYXJ0cz86IFNldDxDaGF0U3ViYWdlbnRDb250ZW50UGFydD4pOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHR0cnkge1xuXHRcdFx0Ly8gaWYgd2UgZ2V0IGFuIGVtcHR5IHRoaW5raW5nIHBhcnQsIG1hcmsgdGhpbmtpbmcgYXMgZmluaXNoZWRcblx0XHRcdGlmIChjb250ZW50LmtpbmQgPT09ICd0aGlua2luZycgJiYgKEFycmF5LmlzQXJyYXkoY29udGVudC52YWx1ZSkgPyBjb250ZW50LnZhbHVlLmxlbmd0aCA9PT0gMCA6IGNvbnRlbnQudmFsdWUgPT09ICcnKSkge1xuXHRcdFx0XHRjb25zdCBsYXN0VGhpbmtpbmcgPSB0aGlzLmdldExhc3RUaGlua2luZ1BhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMpO1xuXHRcdFx0XHRsYXN0VGhpbmtpbmc/LnJlc2V0SWQoKTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IGNvbnRlbnQua2luZCA9PT0gb3RoZXIua2luZCk7XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IGlzUmVzcG9uc2VFbGVtZW50ID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCk7XG5cdFx0XHRjb25zdCBzaG91bGRQaW4gPSB0aGlzLnNob3VsZFBpblBhcnQoY29udGVudCwgaXNSZXNwb25zZUVsZW1lbnQgPyBjb250ZXh0LmVsZW1lbnQgOiB1bmRlZmluZWQpO1xuXG5cdFx0XHQvLyBGaW5hbGl6ZSB0aGUgYWN0aXZlIHRoaW5raW5nIHBhcnQgZm9yIHRoaXMgZWxlbWVudCB3aGVuIHRoZSByZXNwb25zZSBpcyBjb21wbGV0ZS5cblx0XHRcdC8vIFNjb3BlZCB0byB0aGUgY3VycmVudCBlbGVtZW50J3MgdGVtcGxhdGVEYXRhIHRvIGF2b2lkIGZpbmFsaXppbmcgdGhpbmtpbmcgcGFydHNcblx0XHRcdC8vIGJlbG9uZ2luZyB0byBvdGhlciAoc3RpbGwtc3RyZWFtaW5nKSByZXNwb25zZXMgZHVyaW5nIHNjcm9sbCByZS1yZW5kZXJzLlxuXHRcdFx0aWYgKGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlICYmICFzaG91bGRQaW4pIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudFRlbXBsYXRlRGF0YSA9IHRoaXMuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKGNvbnRleHQuZWxlbWVudC5pZCk7XG5cdFx0XHRcdGlmIChlbGVtZW50VGVtcGxhdGVEYXRhPy5yZW5kZXJlZFBhcnRzKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdFRoaW5raW5nID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KGVsZW1lbnRUZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0XHRcdFx0aWYgKGxhc3RUaGlua2luZz8uZ2V0SXNBY3RpdmUoKSkge1xuXHRcdFx0XHRcdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgZWxlbWVudFRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdC8vIENoZWNrIGlmIHRoaXMgaXMgc3ViYWdlbnQgY29udGVudFxuXHRcdFx0Y29uc3QgaXNTdWJhZ2VudENvbnRlbnQgPSAoY29udGVudC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IGNvbnRlbnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0XHRcdCYmIGlzU3ViYWdlbnRUb29sSW52b2NhdGlvbihjb250ZW50KTtcblxuXHRcdFx0Ly8gRmluYWxpemUgc3ViYWdlbnQgcGFydHMgZm9yIHRoaXMgZWxlbWVudCB3aGVuIHRoZSByZXNwb25zZSBpcyBjb21wbGV0ZS5cblx0XHRcdC8vIE5vdGU6IFdlIGRvbid0IGZpbmFsaXplIHdoZW4gbm9uLXN1YmFnZW50IGNvbnRlbnQgYXJyaXZlcyBiZWNhdXNlIHBhcmFsbGVsIHN1YmFnZW50cyBtYXkgc3RpbGwgYmUgcnVubmluZy5cblx0XHRcdC8vIFNjb3BlZCB0byB0aGUgY3VycmVudCBlbGVtZW50IHRvIGF2b2lkIGZpbmFsaXppbmcgc3ViYWdlbnQgcGFydHMgb24gb3RoZXIgcmVzcG9uc2VzIGR1cmluZyBzY3JvbGwgcmUtcmVuZGVycy5cblx0XHRcdGlmIChjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZSAmJiAhaXNTdWJhZ2VudENvbnRlbnQpIHtcblx0XHRcdFx0Y29uc3QgZWxlbWVudFRlbXBsYXRlRGF0YSA9IHRoaXMuZ2V0VGVtcGxhdGVEYXRhRm9yUmVxdWVzdElkKGNvbnRleHQuZWxlbWVudC5pZCk7XG5cdFx0XHRcdGlmIChlbGVtZW50VGVtcGxhdGVEYXRhKSB7XG5cdFx0XHRcdFx0dGhpcy5maW5hbGl6ZUFsbFN1YmFnZW50UGFydHMoZWxlbWVudFRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0aWYgKGNvbnRlbnQua2luZCA9PT0gJ3RyZWVEYXRhJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUcmVlRGF0YShjb250ZW50LCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdtdWx0aURpZmZEYXRhJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJNdWx0aURpZmZEYXRhKGNvbnRlbnQsIHRlbXBsYXRlRGF0YSwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3Byb2dyZXNzTWVzc2FnZScpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFByb2dyZXNzQ29udGVudFBhcnQsIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBjb250ZXh0LCB1bmRlZmluZWQsIHVuZGVmaW5lZCwgdW5kZWZpbmVkLCB1bmRlZmluZWQsIGNvbnRlbnQuc2hpbW1lcik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3N5c3RlbU5vdGlmaWNhdGlvbicpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFN5c3RlbU5vdGlmaWNhdGlvbkNvbnRlbnRQYXJ0LCBjb250ZW50LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3dvcmtpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRXb3JraW5nUHJvZ3Jlc3NDb250ZW50UGFydCwgY29udGVudCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdwcm9ncmVzc1Rhc2snIHx8IGNvbnRlbnQua2luZCA9PT0gJ3Byb2dyZXNzVGFza1NlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclByb2dyZXNzVGFzayhjb250ZW50LCB0ZW1wbGF0ZURhdGEsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdjb21tYW5kJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29tbWFuZEJ1dHRvbkNvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAndGV4dEVkaXRHcm91cCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVGV4dEVkaXQoY29udGV4dCwgY29udGVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnY29uZmlybWF0aW9uJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJDb25maXJtYXRpb24oY29udGV4dCwgY29udGVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnd2FybmluZycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVycm9yQ29udGVudFBhcnQsIENoYXRFcnJvckxldmVsLldhcm5pbmcsIGNvbnRlbnQuY29udGVudCwgY29udGVudCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdpbmZvJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RXJyb3JDb250ZW50UGFydCwgQ2hhdEVycm9yTGV2ZWwuSW5mbywgY29udGVudC5jb250ZW50LCBjb250ZW50LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2hvb2snKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckhvb2tQYXJ0KGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSwgYmF0Y2hlZFN1YmFnZW50UGFydHMpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdtYXJrZG93bkNvbnRlbnQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck1hcmtkb3duKGNvbnRlbnQsIHRlbXBsYXRlRGF0YSwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3JlZmVyZW5jZXMnKSB7XG5cdFx0XHRcdC8vIE9ubHkgc2hvdyByZWZlcmVuY2VzIGZvciBjaGF0IHBhcnRpY2lwYW50cywgbm90IGFnZW50c1xuXHRcdFx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29udGV4dC5lbGVtZW50LmFnZW50Py5pc0RlZmF1bHQgJiYgIWNvbnRleHQuZWxlbWVudC5hZ2VudC5tb2Rlcy5pbmNsdWRlcyhDaGF0TW9kZUtpbmQuQXNrKSkge1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBvdGhlci5raW5kID09PSBjb250ZW50LmtpbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckNvbnRlbnRSZWZlcmVuY2VzTGlzdERhdGEoY29udGVudCwgdW5kZWZpbmVkLCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdjb2RlQ2l0YXRpb25zJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJDb2RlQ2l0YXRpb25zKGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uJyB8fCBjb250ZW50LmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclRvb2xJbnZvY2F0aW9uKGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSwgYmF0Y2hlZFN1YmFnZW50UGFydHMpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdleHRlbnNpb25zJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJFeHRlbnNpb25zQ29udGVudChjb250ZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdwdWxsUmVxdWVzdCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyUHVsbFJlcXVlc3RDb250ZW50KGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3VuZG9TdG9wJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJVbmRvU3RvcChjb250ZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnZXJyb3JEZXRhaWxzJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJDaGF0RXJyb3JEZXRhaWxzKGNvbnRleHQsIGNvbnRlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2VsaWNpdGF0aW9uMicgfHwgY29udGVudC5raW5kID09PSAnZWxpY2l0YXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJFbGljaXRhdGlvbihjb250ZXh0LCBjb250ZW50LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJRdWVzdGlvbkNhcm91c2VsKGNvbnRleHQsIGNvbnRlbnQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3BsYW5SZXZpZXcnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlclBsYW5SZXZpZXcoY29udGV4dCwgY29udGVudCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnY2hhbmdlc1N1bW1hcnknKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckNoYW5nZXNTdW1tYXJ5KGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3R1cm5QaWxscycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyVHVyblBpbGxzKGNvbnRlbnQsIGNvbnRleHQpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdtY3BTZXJ2ZXJzU3RhcnRpbmcnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck1jcFNlcnZlcnNJbnRlcmFjdGlvblJlcXVpcmVkKGNvbnRlbnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ21jcEF1dGhlbnRpY2F0aW9uUmVxdWlyZWQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNY3BBdXRoZW50aWNhdGlvbkNvbnRlbnRQYXJ0LCBjb250ZW50KTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnbWNwU2VydmVyc1N0YXJ0aW5nU2xvdycpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1jcFNlcnZlcnNTdGFydGluZ0NvbnRlbnRQYXJ0LCBjb250ZW50LCB7XG5cdFx0XHRcdFx0b25EaWRGaW5pc2hTdGFydGluZzogKCkgPT4gdGhpcy5zaG93V29ya2luZ1Byb2dyZXNzQWZ0ZXJNY3AoY29udGV4dCwgdGVtcGxhdGVEYXRhKSxcblx0XHRcdFx0fSk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ2Rpc2FibGVkQ2xhdWRlSG9va3MnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckRpc2FibGVkQ2xhdWRlSG9va3MoY29udGVudCwgY29udGV4dCk7XG5cdFx0XHR9IGVsc2UgaWYgKGNvbnRlbnQua2luZCA9PT0gJ3RoaW5raW5nJykge1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJUaGlua2luZ1BhcnQoY29udGVudCwgY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH0gZWxzZSBpZiAoY29udGVudC5raW5kID09PSAnd29ya3NwYWNlRWRpdCcpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFdvcmtzcGFjZUVkaXRDb250ZW50UGFydCwgY29udGVudCwgY29udGV4dCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdleHRlcm5hbEVkaXQnKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlckV4dGVybmFsRWRpdChjb250ZW50LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fSBlbHNlIGlmIChjb250ZW50LmtpbmQgPT09ICdhdXRvTW9kZVJlc29sdXRpb24nKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRBdXRvTW9kZVJlc29sdXRpb25Db250ZW50UGFydCwgY29udGVudCwgY29udGV4dCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIpO1xuXHRcdFx0fVxuXG5cdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gY29udGVudC5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHR9IGNhdGNoIChlcnIpIHtcblx0XHRcdGFsZXJ0KGBDaGF0IGVycm9yOiAke3RvRXJyb3JNZXNzYWdlKGVyciwgZmFsc2UpfWApO1xuXHRcdFx0dGhpcy5sb2dTZXJ2aWNlLmVycm9yKCdDaGF0TGlzdEl0ZW1SZW5kZXJlciNyZW5kZXJDaGF0Q29udGVudFBhcnQ6IGVycm9yIHJlbmRlcmluZyBjb250ZW50JywgdG9FcnJvck1lc3NhZ2UoZXJyLCB0cnVlKSk7XG5cdFx0XHRjb25zdCBlcnJvclBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFcnJvckNvbnRlbnRQYXJ0LCBDaGF0RXJyb3JMZXZlbC5FcnJvciwgbmV3IE1hcmtkb3duU3RyaW5nKGxvY2FsaXplKCdyZW5kZXJGYWlsTXNnJywgXCJGYWlsZWQgdG8gcmVuZGVyIGNvbnRlbnRcIikgKyBgOiAke3RvRXJyb3JNZXNzYWdlKGVyciwgZmFsc2UpfWApLCBjb250ZW50LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0XHRyZXR1cm4ge1xuXHRcdFx0XHRkaXNwb3NlOiAoKSA9PiBlcnJvclBhcnQuZGlzcG9zZSgpLFxuXHRcdFx0XHRkb21Ob2RlOiBlcnJvclBhcnQuZG9tTm9kZSxcblx0XHRcdFx0aGFzU2FtZUNvbnRlbnQ6IChvdGhlciA9PiBjb250ZW50LmtpbmQgPT09IG90aGVyLmtpbmQpLFxuXHRcdFx0fTtcblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHNob3dXb3JraW5nUHJvZ3Jlc3NBZnRlck1jcChjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiB2b2lkIHtcblx0XHRjb25zdCBvcmlnaW5hbEVsZW1lbnQgPSBjb250ZXh0LmVsZW1lbnQ7XG5cdFx0Y29uc3Qgb3JpZ2luYWxSZW5kZXJlZFBhcnRzID0gdGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHM7XG5cdFx0cXVldWVNaWNyb3Rhc2soKCkgPT4ge1xuXHRcdFx0aWYgKCFpc1Jlc3BvbnNlVk0ob3JpZ2luYWxFbGVtZW50KSB8fCB0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQgIT09IG9yaWdpbmFsRWxlbWVudCB8fCBvcmlnaW5hbEVsZW1lbnQuaXNDb21wbGV0ZSB8fCBvcmlnaW5hbEVsZW1lbnQuaXNDYW5jZWxlZCkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdGlmICghb3JpZ2luYWxSZW5kZXJlZFBhcnRzIHx8IHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzICE9PSBvcmlnaW5hbFJlbmRlcmVkUGFydHMgfHwgb3JpZ2luYWxSZW5kZXJlZFBhcnRzLnNvbWUocGFydCA9PiBwYXJ0IGluc3RhbmNlb2YgQ2hhdFdvcmtpbmdQcm9ncmVzc0NvbnRlbnRQYXJ0KSkge1xuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cblx0XHRcdHRoaXMucmVuZGVyQ2hhdFJlc3BvbnNlQmFzaWMob3JpZ2luYWxFbGVtZW50LCBjb250ZXh0LmVsZW1lbnRJbmRleCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdHRoaXMuZmlyZUl0ZW1IZWlnaHRDaGFuZ2UodGVtcGxhdGVEYXRhKTtcblx0XHR9KTtcblx0fVxuXG5cdG92ZXJyaWRlIGRpc3Bvc2UoKTogdm9pZCB7XG5cdFx0dGhpcy5fYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cy5jbGVhcigpO1xuXHRcdHN1cGVyLmRpc3Bvc2UoKTtcblx0fVxuXG5cblx0cHJpdmF0ZSByZW5kZXJDaGF0RXJyb3JEZXRhaWxzKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBjb250ZW50OiBJQ2hhdEVycm9yRGV0YWlsc1BhcnQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0aWYgKCFpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IGNvbnRlbnQua2luZCA9PT0gb3RoZXIua2luZCk7XG5cdFx0fVxuXG5cdFx0Y29uc3QgaXNMYXN0ID0gY29udGVudC5pc0xhc3Q7XG5cdFx0aWYgKGNvbnRlbnQuZXJyb3JEZXRhaWxzLmlzUXVvdGFFeGNlZWRlZCkge1xuXHRcdFx0Y29uc3QgcmVuZGVyZWRFcnJvciA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFF1b3RhRXhjZWVkZWRQYXJ0LCBjb250ZXh0LmVsZW1lbnQsIGNvbnRlbnQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyKTtcblx0XHRcdHJldHVybiByZW5kZXJlZEVycm9yO1xuXHRcdH0gZWxzZSBpZiAoY29udGVudC5lcnJvckRldGFpbHMuaXNSYXRlTGltaXRlZCAmJiB0aGlzLmNoYXRFbnRpdGxlbWVudFNlcnZpY2UuYW5vbnltb3VzKSB7XG5cdFx0XHRjb25zdCByZW5kZXJlZEVycm9yID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0QW5vbnltb3VzUmF0ZUxpbWl0ZWRQYXJ0LCBjb250ZW50KTtcblx0XHRcdHJldHVybiByZW5kZXJlZEVycm9yO1xuXHRcdH0gZWxzZSBpZiAoY29udGVudC5lcnJvckRldGFpbHMuY29uZmlybWF0aW9uQnV0dG9ucyAmJiBpc0xhc3QpIHtcblx0XHRcdGNvbnN0IGxldmVsID0gY29udGVudC5lcnJvckRldGFpbHMubGV2ZWwgPz8gQ2hhdEVycm9yTGV2ZWwuRXJyb3I7XG5cdFx0XHRjb25zdCBlcnJvckNvbmZpcm1hdGlvbiA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVycm9yQ29uZmlybWF0aW9uQ29udGVudFBhcnQsIGxldmVsLCBuZXcgTWFya2Rvd25TdHJpbmcoY29udGVudC5lcnJvckRldGFpbHMubWVzc2FnZSksIGNvbnRlbnQsIGNvbnRlbnQuZXJyb3JEZXRhaWxzLmNvbmZpcm1hdGlvbkJ1dHRvbnMsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBjb250ZXh0KTtcblx0XHRcdHJldHVybiBlcnJvckNvbmZpcm1hdGlvbjtcblx0XHR9IGVsc2Uge1xuXHRcdFx0Y29uc3QgbGV2ZWwgPSBjb250ZW50LmVycm9yRGV0YWlscy5sZXZlbCA/PyBDaGF0RXJyb3JMZXZlbC5FcnJvcjtcblx0XHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRFcnJvckNvbnRlbnRQYXJ0LCBsZXZlbCwgbmV3IE1hcmtkb3duU3RyaW5nKGNvbnRlbnQuZXJyb3JEZXRhaWxzLm1lc3NhZ2UpLCBjb250ZW50LCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlcik7XG5cdFx0fVxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJVbmRvU3RvcChjb250ZW50OiBJQ2hhdFVuZG9TdG9wKSB7XG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IG90aGVyLmtpbmQgPT09IGNvbnRlbnQua2luZCAmJiBvdGhlci5pZCA9PT0gY29udGVudC5pZCk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlck5vQ29udGVudChlcXVhbHM6IChvdGhlcjogSUNoYXRSZW5kZXJlckNvbnRlbnQsIGZvbGxvd2luZ0NvbnRlbnQ6IElDaGF0UmVuZGVyZXJDb250ZW50W10sIGVsZW1lbnQ6IENoYXRUcmVlSXRlbSkgPT4gYm9vbGVhbik6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdHJldHVybiB7XG5cdFx0XHRkaXNwb3NlOiAoKSA9PiB7IH0sXG5cdFx0XHRkb21Ob2RlOiB1bmRlZmluZWQsXG5cdFx0XHRoYXNTYW1lQ29udGVudDogZXF1YWxzLFxuXHRcdH07XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclRyZWVEYXRhKGNvbnRlbnQ6IElDaGF0VHJlZURhdGEsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdGNvbnN0IGRhdGEgPSBjb250ZW50LnRyZWVEYXRhO1xuXHRcdGNvbnN0IHRyZWVQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VHJlZUNvbnRlbnRQYXJ0LCBkYXRhLCB0aGlzLl90cmVlUG9vbCk7XG5cblx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGZpbGVUcmVlRm9jdXNJbmZvID0ge1xuXHRcdFx0XHR0cmVlRGF0YUlkOiBkYXRhLnVyaS50b1N0cmluZygpLFxuXHRcdFx0XHR0cmVlSW5kZXg6IGNvbnRleHQudHJlZVN0YXJ0SW5kZXgsXG5cdFx0XHRcdGZvY3VzKCkge1xuXHRcdFx0XHRcdHRyZWVQYXJ0LmRvbUZvY3VzKCk7XG5cdFx0XHRcdH1cblx0XHRcdH07XG5cblx0XHRcdC8vIFRPRE9Acm9ibG91cmVucyB0aGVyZSdzIGdvdCB0byBiZSBhIGJldHRlciB3YXkgdG8gbmF2aWdhdGUgdHJlZXNcblx0XHRcdHRyZWVQYXJ0LmFkZERpc3Bvc2FibGUodHJlZVBhcnQub25EaWRGb2N1cygoKSA9PiB7XG5cdFx0XHRcdHRoaXMuZm9jdXNlZEZpbGVUcmVlc0J5UmVzcG9uc2VJZC5zZXQoY29udGV4dC5lbGVtZW50LmlkLCBmaWxlVHJlZUZvY3VzSW5mby50cmVlSW5kZXgpO1xuXHRcdFx0fSkpO1xuXG5cdFx0XHRjb25zdCBmaWxlVHJlZXMgPSB0aGlzLmZpbGVUcmVlc0J5UmVzcG9uc2VJZC5nZXQoY29udGV4dC5lbGVtZW50LmlkKSA/PyBbXTtcblx0XHRcdGZpbGVUcmVlcy5wdXNoKGZpbGVUcmVlRm9jdXNJbmZvKTtcblx0XHRcdHRoaXMuZmlsZVRyZWVzQnlSZXNwb25zZUlkLnNldChjb250ZXh0LmVsZW1lbnQuaWQsIGRpc3RpbmN0KGZpbGVUcmVlcywgKHYpID0+IHYudHJlZURhdGFJZCkpO1xuXHRcdFx0dHJlZVBhcnQuYWRkRGlzcG9zYWJsZSh0b0Rpc3Bvc2FibGUoKCkgPT4gdGhpcy5maWxlVHJlZXNCeVJlc3BvbnNlSWQuc2V0KGNvbnRleHQuZWxlbWVudC5pZCwgZmlsZVRyZWVzLmZpbHRlcih2ID0+IHYudHJlZURhdGFJZCAhPT0gZGF0YS51cmkudG9TdHJpbmcoKSkpKSk7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHRyZWVQYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNdWx0aURpZmZEYXRhKGNvbnRlbnQ6IElDaGF0TXVsdGlEaWZmRGF0YSB8IElDaGF0TXVsdGlEaWZmRGF0YVNlcmlhbGl6ZWQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdGNvbnN0IG11bHRpRGlmZlBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRNdWx0aURpZmZDb250ZW50UGFydCwgY29udGVudCwgY29udGV4dC5lbGVtZW50KTtcblx0XHRyZXR1cm4gbXVsdGlEaWZmUGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29udGVudFJlZmVyZW5jZXNMaXN0RGF0YShyZWZlcmVuY2VzOiBJQ2hhdFJlZmVyZW5jZXMsIGxhYmVsT3ZlcnJpZGU6IHN0cmluZyB8IHVuZGVmaW5lZCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogQ2hhdENvbGxhcHNpYmxlTGlzdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCByZWZlcmVuY2VzUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFVzZWRSZWZlcmVuY2VzTGlzdENvbnRlbnRQYXJ0LCByZWZlcmVuY2VzLnJlZmVyZW5jZXMsIGxhYmVsT3ZlcnJpZGUsIGNvbnRleHQsIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wsIHsgZXhwYW5kZWRXaGVuRW1wdHlSZXNwb25zZTogY2hlY2tNb2RlT3B0aW9uKHRoaXMuZGVsZWdhdGUuY3VycmVudENoYXRNb2RlKCksIHRoaXMucmVuZGVyZXJPcHRpb25zLnJlZmVyZW5jZXNFeHBhbmRlZFdoZW5FbXB0eVJlc3BvbnNlKSB9KTtcblxuXHRcdHJldHVybiByZWZlcmVuY2VzUGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyQ29kZUNpdGF0aW9ucyhjaXRhdGlvbnM6IElDaGF0Q29kZUNpdGF0aW9ucywgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogQ2hhdENvZGVDaXRhdGlvbkNvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBjaXRhdGlvbnNQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29kZUNpdGF0aW9uQ29udGVudFBhcnQsIGNpdGF0aW9ucywgY29udGV4dCk7XG5cdFx0cmV0dXJuIGNpdGF0aW9uc1BhcnQ7XG5cdH1cblxuXHRwcml2YXRlIGhhbmRsZVJlbmRlcmVkQ29kZWJsb2NrcyhlbGVtZW50OiBDaGF0VHJlZUl0ZW0sIHBhcnQ6IElDaGF0Q29udGVudFBhcnQsIGNvZGVCbG9ja1N0YXJ0SW5kZXg6IG51bWJlcik6IHZvaWQge1xuXHRcdGlmICghcGFydC5hZGREaXNwb3NhYmxlIHx8IHBhcnQuY29kZWJsb2Nrc1BhcnRJZCA9PT0gdW5kZWZpbmVkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Y29uc3QgY29kZUJsb2Nrc0J5UmVzcG9uc2VJZCA9IHRoaXMuY29kZUJsb2Nrc0J5UmVzcG9uc2VJZC5nZXQoZWxlbWVudC5pZCkgPz8gW107XG5cdFx0dGhpcy5jb2RlQmxvY2tzQnlSZXNwb25zZUlkLnNldChlbGVtZW50LmlkLCBjb2RlQmxvY2tzQnlSZXNwb25zZUlkKTtcblx0XHRwYXJ0LmFkZERpc3Bvc2FibGUodG9EaXNwb3NhYmxlKCgpID0+IHtcblx0XHRcdGNvbnN0IGNvZGVCbG9ja3NCeVJlc3BvbnNlSWQgPSB0aGlzLmNvZGVCbG9ja3NCeVJlc3BvbnNlSWQuZ2V0KGVsZW1lbnQuaWQpO1xuXHRcdFx0aWYgKGNvZGVCbG9ja3NCeVJlc3BvbnNlSWQpIHtcblx0XHRcdFx0Ly8gT25seSBkZWxldGUgaWYgdGhpcyBpcyBteSBjb2RlIGJsb2NrXG5cdFx0XHRcdHBhcnQuY29kZWJsb2Nrcz8uZm9yRWFjaCgoaW5mbywgaSkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVibG9jayA9IGNvZGVCbG9ja3NCeVJlc3BvbnNlSWRbY29kZUJsb2NrU3RhcnRJbmRleCArIGldO1xuXHRcdFx0XHRcdGlmIChjb2RlYmxvY2s/Lm93bmVyTWFya2Rvd25QYXJ0SWQgPT09IHBhcnQuY29kZWJsb2Nrc1BhcnRJZCkge1xuXHRcdFx0XHRcdFx0ZGVsZXRlIGNvZGVCbG9ja3NCeVJlc3BvbnNlSWRbY29kZUJsb2NrU3RhcnRJbmRleCArIGldO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSk7XG5cdFx0XHR9XG5cdFx0fSkpO1xuXG5cdFx0cGFydC5jb2RlYmxvY2tzPy5mb3JFYWNoKChpbmZvLCBpKSA9PiB7XG5cdFx0XHRjb2RlQmxvY2tzQnlSZXNwb25zZUlkW2NvZGVCbG9ja1N0YXJ0SW5kZXggKyBpXSA9IGluZm87XG5cblx0XHRcdGNvbnN0IHVyaSA9IGluZm8udXJpO1xuXHRcdFx0aWYgKHVyaSkge1xuXHRcdFx0XHR0aGlzLmNvZGVCbG9ja3NCeUVkaXRvclVyaS5zZXQodXJpLCBpbmZvKTtcblx0XHRcdFx0cGFydC5hZGREaXNwb3NhYmxlISh0b0Rpc3Bvc2FibGUoKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IGNvZGVibG9jayA9IHRoaXMuY29kZUJsb2Nrc0J5RWRpdG9yVXJpLmdldCh1cmkpO1xuXHRcdFx0XHRcdGlmIChjb2RlYmxvY2s/Lm93bmVyTWFya2Rvd25QYXJ0SWQgPT09IHBhcnQuY29kZWJsb2Nrc1BhcnRJZCkge1xuXHRcdFx0XHRcdFx0dGhpcy5jb2RlQmxvY2tzQnlFZGl0b3JVcmkuZGVsZXRlKHVyaSk7XG5cdFx0XHRcdFx0fVxuXHRcdFx0XHR9KSk7XG5cdFx0XHR9XG5cdFx0fSk7XG5cblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVG9vbEludm9jYXRpb24odG9vbEludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBiYXRjaGVkU3ViYWdlbnRQYXJ0cz86IFNldDxDaGF0U3ViYWdlbnRDb250ZW50UGFydD4pOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHQvLyBTa2lwIHJlbmRlcmluZyBjb21wbGV0ZWQgdG9vbCBpbnZvY2F0aW9ucyB0aGF0IGFyZSBoaWRkZW4gYW5kIGhhdmUgbm8gbWVhbmluZ2Z1bCBjb250ZW50IC0gaWUsIGF1dG9waWxvdCBcInRhc2sgY29tcGxldGVcIi5cblx0XHQvLyBXZSBpbnRlbnRpb25hbGx5IG9ubHkgc2hvcnQtY2lyY3VpdCB3aGVuIHRoZSBpbnZvY2F0aW9uJ3MgcHJlc2VudGF0aW9uIGlzIGhpZGRlbiwgb3RoZXJ3aXNlIGV4dGVuc2lvbi1jb250cmlidXRlZFxuXHRcdC8vIHRvb2xzIHRoYXQgZG9uJ3Qgc3VwcGx5IGEgYHBhc3RUZW5zZU1lc3NhZ2VgIChwcm9wb3NlZCBBUEkpIGdldCBmaWx0ZXJlZCBvdXQgaW5jb3JyZWN0bHkuXG5cdFx0aWYgKElDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZSh0b29sSW52b2NhdGlvbikgJiYgSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0Y29uc3QgbXNnID0gdG9vbEludm9jYXRpb24ucGFzdFRlbnNlTWVzc2FnZSA/PyB0b29sSW52b2NhdGlvbi5pbnZvY2F0aW9uTWVzc2FnZTtcblx0XHRcdGNvbnN0IHRleHQgPSB0eXBlb2YgbXNnID09PSAnc3RyaW5nJyA/IG1zZyA6IG1zZz8udmFsdWU7XG5cdFx0XHRpZiAoIXRleHQgfHwgdGV4dC50cmltKCkubGVuZ3RoID09PSAwKSB7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudCgob3RoZXIpID0+XG5cdFx0XHRcdFx0KG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgb3RoZXIua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpICYmIG90aGVyLnRvb2xDYWxsSWQgPT09IHRvb2xJbnZvY2F0aW9uLnRvb2xDYWxsSWQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIEEgY29tcGxldGVkIHR1cm4gcmVuZGVycyBhbGwgZ2VuZXJhdGVkIGltYWdlcyBpbiBvbmUgZ2FsbGVyeS4gS2VlcCB0aGUgZ2FsbGVyeSBvbiB0aGVcblx0XHQvLyBmaW5hbCBpbWFnZSB0b29sIGNhbGwgc28gbXVsdGlwbGUgdG9vbCByZXN1bHRzIGNhbm5vdCBiZSBzcGxpdCBiZXR3ZWVuIHRoZSBjb21wbGV0ZWRcblx0XHQvLyByZXNwb25zZSBkaXNjbG9zdXJlIGFuZCB0aGUgZHVyYWJsZSByZXNwb25zZSBvdXRjb21lLlxuXHRcdGlmIChjb250ZXh0LmVsZW1lbnQuaXNDb21wbGV0ZVxuXHRcdFx0JiYgdG9vbEludm9jYXRpb24udG9vbFNwZWNpZmljRGF0YT8ua2luZCA9PT0gJ2dlbmVyYXRlZEltYWdlJ1xuXHRcdFx0JiYgIWlzR2VuZXJhdGVkSW1hZ2VSZXN1bHRPd25lcih0b29sSW52b2NhdGlvbiwgY29udGV4dC5jb250ZW50KSkge1xuXHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+XG5cdFx0XHRcdChvdGhlci5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IG90aGVyLmtpbmQgPT09ICd0b29sSW52b2NhdGlvblNlcmlhbGl6ZWQnKVxuXHRcdFx0XHQmJiBvdGhlci50b29sQ2FsbElkID09PSB0b29sSW52b2NhdGlvbi50b29sQ2FsbElkKTtcblx0XHR9XG5cblx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJykgPT09IENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGUuT2ZmKSB7XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdGNvbnN0IGNvZGVCbG9ja1N0YXJ0SW5kZXggPSBjb250ZXh0LmNvZGVCbG9ja1N0YXJ0SW5kZXg7XG5cblx0XHQvLyBGYWN0b3J5IHRoYXQgY3JlYXRlcyB0aGUgdG9vbCBpbnZvY2F0aW9uIHBhcnQgd2l0aCBhbGwgbmVjZXNzYXJ5IHNldHVwXG5cdFx0bGV0IGxhemlseUNyZWF0ZWRQYXJ0OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0IHwgdW5kZWZpbmVkID0gdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNyZWF0ZVRvb2xQYXJ0ID0gKCk6IHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IENoYXRUb29sSW52b2NhdGlvblBhcnQ7IHBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQgfSA9PiB7XG5cdFx0XHRsYXppbHlDcmVhdGVkUGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbEludm9jYXRpb24sIGNvbnRleHQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLCB0aGlzLl90b29sRWRpdG9yUG9vbCwgKCkgPT4gdGhpcy5fY3VycmVudExheW91dFdpZHRoLmdldCgpLCB0aGlzLl9hbm5vdW5jZWRUb29sUHJvZ3Jlc3NLZXlzLCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHRcdGxhemlseUNyZWF0ZWRQYXJ0LmFkZERpc3Bvc2FibGUobGF6aWx5Q3JlYXRlZFBhcnQub25EaWRDaGFuZ2VIZWlnaHQoKCkgPT4gdGhpcy5maXJlSXRlbUhlaWdodENoYW5nZSh0ZW1wbGF0ZURhdGEpKSk7XG5cdFx0XHR0aGlzLmhhbmRsZVJlbmRlcmVkQ29kZWJsb2Nrcyhjb250ZXh0LmVsZW1lbnQsIGxhemlseUNyZWF0ZWRQYXJ0LCBjb2RlQmxvY2tTdGFydEluZGV4KTtcblx0XHRcdHJldHVybiB7IGRvbU5vZGU6IGxhemlseUNyZWF0ZWRQYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IGxhemlseUNyZWF0ZWRQYXJ0LCBwYXJ0OiBsYXppbHlDcmVhdGVkUGFydCB9O1xuXHRcdH07XG5cblx0XHQvLyBoYW5kbGluZyBmb3Igd2hlbiB3ZSB3YW50IHRvIHB1dCB0b29sIGludm9jYXRpb25zIGluc2lkZSBhIHRoaW5raW5nIHBhcnRcblx0XHRjb25zdCBjb2xsYXBzZWRUb29sc01vZGUgPSB0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8Q29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZT4oJ2NoYXQuYWdlbnQudGhpbmtpbmcuY29sbGFwc2VkVG9vbHMnKTtcblx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY29sbGFwc2VkVG9vbHNNb2RlICE9PSBDb2xsYXBzZWRUb29sc0Rpc3BsYXlNb2RlLk9mZikge1xuXHRcdFx0Y29uc3QgeyBwYXJ0OiBsYXN0VGhpbmtpbmcsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcgfSA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydEZvckdyb3VwZWRJdGVtKGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cblx0XHRcdC8vIGNyZWF0ZSB0aGlua2luZyBwYXJ0IGlmIGl0IGRvZXNuJ3QgZXhpc3QgeWV0XG5cdFx0XHRpZiAoIWxhc3RUaGlua2luZyAmJiAhSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uKSAmJiB0aGlzLnNob3VsZFBpblBhcnQodG9vbEludm9jYXRpb24sIGNvbnRleHQuZWxlbWVudCkgJiYgc2hvdWxkQ3JlYXRlR3JvdXBlZFRoaW5raW5nUGFydChjb2xsYXBzZWRUb29sc01vZGUsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcpKSB7XG5cdFx0XHRcdGNvbnN0IHRoaW5raW5nUGFydCA9IHRoaXMucmVuZGVyVGhpbmtpbmdQYXJ0KHtcblx0XHRcdFx0XHRraW5kOiAndGhpbmtpbmcnLFxuXHRcdFx0XHR9LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0XHRcdGlmICh0aGlua2luZ1BhcnQgaW5zdGFuY2VvZiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdC8vIEFwcGVuZCB1c2luZyBmYWN0b3J5IC0gdGhpbmtpbmcgcGFydCBkZWNpZGVzIHdoZXRoZXIgdG8gcmVuZGVyIGxhemlseVxuXHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLmlzQXR0YWNoZWRUb1RoaW5raW5nID0gdHJ1ZTtcblx0XHRcdFx0XHR0aGlua2luZ1BhcnQuYXBwZW5kSXRlbShjcmVhdGVUb29sUGFydCwgdG9vbEludm9jYXRpb24udG9vbElkLCB0b29sSW52b2NhdGlvbiwgdGVtcGxhdGVEYXRhLnZhbHVlKTtcblx0XHRcdFx0XHR0aGlzLnNldHVwQ29uZmlybWF0aW9uVHJhbnNpdGlvbldhdGNoZXIodG9vbEludm9jYXRpb24sIHRoaW5raW5nUGFydCwgKCkgPT4gbGF6aWx5Q3JlYXRlZFBhcnQsIGNyZWF0ZVRvb2xQYXJ0LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHR9XG5cblx0XHRcdFx0cmV0dXJuIHRoaW5raW5nUGFydDtcblx0XHRcdH1cblxuXHRcdFx0aWYgKHRoaXMuc2hvdWxkUGluUGFydCh0b29sSW52b2NhdGlvbiwgY29udGV4dC5lbGVtZW50KSkge1xuXHRcdFx0XHRpZiAobGFzdFRoaW5raW5nICYmICFJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzRWZmZWN0aXZlbHlIaWRkZW4odG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRcdFx0Ly8gQXBwZW5kIHVzaW5nIGZhY3RvcnkgLSB0aGlua2luZyBwYXJ0IGRlY2lkZXMgd2hldGhlciB0byByZW5kZXIgbGF6aWx5XG5cdFx0XHRcdFx0dG9vbEludm9jYXRpb24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSB0cnVlO1xuXHRcdFx0XHRcdGxhc3RUaGlua2luZy5hcHBlbmRJdGVtKGNyZWF0ZVRvb2xQYXJ0LCB0b29sSW52b2NhdGlvbi50b29sSWQsIHRvb2xJbnZvY2F0aW9uLCB0ZW1wbGF0ZURhdGEudmFsdWUpO1xuXHRcdFx0XHRcdHRoaXMuc2V0dXBDb25maXJtYXRpb25UcmFuc2l0aW9uV2F0Y2hlcih0b29sSW52b2NhdGlvbiwgbGFzdFRoaW5raW5nLCAoKSA9PiBsYXppbHlDcmVhdGVkUGFydCwgY3JlYXRlVG9vbFBhcnQsIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KChvdGhlciwgZm9sbG93aW5nQ29udGVudCwgZWxlbWVudCkgPT4gbGF6aWx5Q3JlYXRlZFBhcnQgP1xuXHRcdFx0XHRcdFx0bGF6aWx5Q3JlYXRlZFBhcnQuaGFzU2FtZUNvbnRlbnQob3RoZXIsIGZvbGxvd2luZ0NvbnRlbnQsIGVsZW1lbnQpIDpcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09IG90aGVyLmtpbmQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdC8vIENoZWNrIGZvciBzdWJhZ2VudCBncm91cGluZyBiZWZvcmUgY3JlYXRpbmcgdG9vbCBwYXJ0IC0gc3ViYWdlbnQgcGFydCBoYW5kbGVzIGxhenkgY3JlYXRpb25cblx0XHRjb25zdCBzdWJhZ2VudElkID0gZ2V0U3ViYWdlbnRJZCh0b29sSW52b2NhdGlvbik7XG5cdFx0aWYgKHN1YmFnZW50SWQgJiYgaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgIUlDaGF0VG9vbEludm9jYXRpb24uaXNFZmZlY3RpdmVseUhpZGRlbih0b29sSW52b2NhdGlvbikpIHtcblx0XHRcdHJldHVybiB0aGlzLmhhbmRsZVN1YmFnZW50VG9vbEdyb3VwaW5nKHRvb2xJbnZvY2F0aW9uLCBzdWJhZ2VudElkLCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEsIGNvZGVCbG9ja1N0YXJ0SW5kZXgsIGJhdGNoZWRTdWJhZ2VudFBhcnRzKTtcblx0XHR9XG5cblx0XHQvLyBGb3IgY2FzZXMgbm90IGhhbmRsZWQgYWJvdmUgKG5vIHRoaW5raW5nIHBhcnQsIG5vIHN1YmFnZW50LCBldGMuKSwgY3JlYXRlIHRoZSBwYXJ0IG5vd1xuXHRcdGNvbnN0IHsgcGFydCB9ID0gY3JlYXRlVG9vbFBhcnQoKTtcblx0XHQvLyBXYXRjaCBmb3IgZnV0dXJlIGNvbmZpcm1hdGlvbiB0cmFuc2l0aW9ucyBhbmQgcm91dGUgdG8gY2Fyb3VzZWxcblx0XHRpZiAodGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgJiZcblx0XHRcdHRvb2xJbnZvY2F0aW9uLmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgJiYgaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiZcblx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJiAhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdGNvbnN0IHdpZGdldCA9IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSk7XG5cdFx0XHRpZiAod2lkZ2V0KSB7XG5cdFx0XHRcdGNvbnN0IGZhY3RvcnkgPSAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0XHRDaGF0VG9vbEludm9jYXRpb25QYXJ0LCB0b29sLCBjb250ZXh0LFxuXHRcdFx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLFxuXHRcdFx0XHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sLCAoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHRcdFx0dGhpcy5fYW5ub3VuY2VkVG9vbFByb2dyZXNzS2V5cyxcblx0XHRcdFx0XHRjb2RlQmxvY2tTdGFydEluZGV4XG5cdFx0XHRcdCk7XG5cdFx0XHRcdGNvbnN0IHJvdXRlUGFydFRvQ2Fyb3VzZWwgPSAoKTogYm9vbGVhbiA9PiB7XG5cdFx0XHRcdFx0d2lkZ2V0LmlucHV0UGFydC5hZGRUb29sVG9Db25maXJtYXRpb25DYXJvdXNlbCh0b29sSW52b2NhdGlvbiwgZmFjdG9yeSk7XG5cdFx0XHRcdFx0ZG9tLmhpZGUocGFydC5kb21Ob2RlKTtcblx0XHRcdFx0XHRyZXR1cm4gdHJ1ZTtcblx0XHRcdFx0fTtcblx0XHRcdFx0bGV0IGhhc1NjaGVkdWxlZENhcm91c2VsUm91dGUgPSBmYWxzZTtcblx0XHRcdFx0Y29uc3Qgc2NoZWR1bGVSb3V0ZVBhcnRUb0Nhcm91c2VsID0gKCkgPT4ge1xuXHRcdFx0XHRcdGlmIChoYXNTY2hlZHVsZWRDYXJvdXNlbFJvdXRlKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0aGFzU2NoZWR1bGVkQ2Fyb3VzZWxSb3V0ZSA9IHRydWU7XG5cdFx0XHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGRvbS5zY2hlZHVsZUF0TmV4dEFuaW1hdGlvbkZyYW1lKGRvbS5nZXRXaW5kb3cocGFydC5kb21Ob2RlKSwgKCkgPT4ge1xuXHRcdFx0XHRcdFx0aGFzU2NoZWR1bGVkQ2Fyb3VzZWxSb3V0ZSA9IGZhbHNlO1xuXHRcdFx0XHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdFx0XHRcdGlmIChzdGF0ZS50eXBlID09PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uICYmIHN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSAmJlxuXHRcdFx0XHRcdFx0XHR0b29sSW52b2NhdGlvbi5wcmVzZW50YXRpb24gIT09ICdoaWRkZW4nICYmXG5cdFx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0XHRcdFx0XHQhdGhpcy52aWV3TW9kZWw/LmVkaXRpbmcpIHtcblx0XHRcdFx0XHRcdFx0cm91dGVQYXJ0VG9DYXJvdXNlbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0pKTtcblx0XHRcdFx0fTtcblx0XHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0XHRjb25zdCBzdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLnJlYWQocmVhZGVyKTtcblx0XHRcdFx0XHRjb25zdCBpc0Nhcm91c2VsQ29uZmlybWF0aW9uID0gc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbiAmJlxuXHRcdFx0XHRcdFx0ISFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUgJiZcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiAhPT0gJ2hpZGRlbicgJiZcblx0XHRcdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnNvdXJjZS50eXBlICE9PSAnbWNwJyAmJlxuXHRcdFx0XHRcdFx0IXRoaXMudmlld01vZGVsPy5lZGl0aW5nO1xuXG5cdFx0XHRcdFx0aWYgKGlzQ2Fyb3VzZWxDb25maXJtYXRpb24pIHtcblx0XHRcdFx0XHRcdGlmICghcm91dGVQYXJ0VG9DYXJvdXNlbCgpKSB7XG5cdFx0XHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdFx0XHRcdHNjaGVkdWxlUm91dGVQYXJ0VG9DYXJvdXNlbCgpO1xuXHRcdFx0XHRcdFx0fVxuXHRcdFx0XHRcdH0gZWxzZSBpZiAoSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0XHRkb20uaGlkZShwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0XHR0aGlzLnVwZGF0ZVdvcmtpbmdQcm9ncmVzc0ZvclBlbmRpbmdDb25maXJtYXRpb25zKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdFx0XHRkb20uc2hvdyhwYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0fSkpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0Ly8gd2F0Y2ggZm9yIGNvbmZpcm1hdGlvbiBwYXJ0IHRyYW5zaXRpb24gd2hlbiB0b29sIGludm9jYXRpb24gaXMgc3RyZWFtaW5nXG5cdHByaXZhdGUgc2V0dXBDb25maXJtYXRpb25UcmFuc2l0aW9uV2F0Y2hlcihcblx0XHR0b29sSW52b2NhdGlvbjogSUNoYXRUb29sSW52b2NhdGlvbiB8IElDaGF0VG9vbEludm9jYXRpb25TZXJpYWxpemVkLFxuXHRcdHRoaW5raW5nUGFydDogQ2hhdFRoaW5raW5nQ29udGVudFBhcnQsXG5cdFx0Z2V0Q3JlYXRlZFBhcnQ6ICgpID0+IENoYXRUb29sSW52b2NhdGlvblBhcnQgfCB1bmRlZmluZWQsXG5cdFx0Y3JlYXRlVG9vbFBhcnQ6ICgpID0+IHsgZG9tTm9kZTogSFRNTEVsZW1lbnQ7IGRpc3Bvc2FibGU6IENoYXRUb29sSW52b2NhdGlvblBhcnQ7IHBhcnQ6IENoYXRUb29sSW52b2NhdGlvblBhcnQgfSxcblx0XHRjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCxcblx0XHR0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZVxuXHQpOiB2b2lkIHtcblx0XHRpZiAodG9vbEludm9jYXRpb24ua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uJykge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGNvbnN0IG1vdmVDb25maXJtYXRpb25XaWRnZXRPdXRPZlRoaW5raW5nID0gKCk6IENoYXRUb29sSW52b2NhdGlvblBhcnQgPT4ge1xuXHRcdFx0Y29uc3QgY3JlYXRlZFBhcnQgPSBnZXRDcmVhdGVkUGFydCgpO1xuXHRcdFx0dG9vbEludm9jYXRpb24uaXNBdHRhY2hlZFRvVGhpbmtpbmcgPSBmYWxzZTtcblx0XHRcdGxldCBwYXJ0OiBDaGF0VG9vbEludm9jYXRpb25QYXJ0O1xuXHRcdFx0aWYgKGNyZWF0ZWRQYXJ0Py5kb21Ob2RlKSB7XG5cdFx0XHRcdHBhcnQgPSBjcmVhdGVkUGFydDtcblx0XHRcdFx0Y29uc3Qgd3JhcHBlciA9IGNyZWF0ZWRQYXJ0LmRvbU5vZGUucGFyZW50RWxlbWVudDtcblx0XHRcdFx0aWYgKHdyYXBwZXI/LmNsYXNzTGlzdC5jb250YWlucygnY2hhdC10aGlua2luZy10b29sLXdyYXBwZXInKSkge1xuXHRcdFx0XHRcdHdyYXBwZXIucmVtb3ZlKCk7XG5cdFx0XHRcdH1cblx0XHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLmFwcGVuZENoaWxkKGNyZWF0ZWRQYXJ0LmRvbU5vZGUpO1xuXHRcdFx0XHQvLyBEZWNyZW1lbnQgdGhpbmtpbmcgcGFydCBjb3VudGVycyBmb3IgdGhlIG1hdGVyaWFsaXplZCBpdGVtIHRoYXQgd2FzIG1vdmVkIG91dC5cblx0XHRcdFx0Ly8gcmVtb3ZlTWF0ZXJpYWxpemVkSXRlbSBkZXRhY2hlcyB0aGUgcGFydCBmcm9tIHRoZSB0aGlua2luZyBwYXJ0J3Mgb3duZXJzaGlwXG5cdFx0XHRcdC8vIHdpdGhvdXQgZGlzcG9zaW5nIGl0LCBzbyB0cmFuc2ZlciBvd25lcnNoaXAgdG8gdGhlIHRlbXBsYXRlJ3MgbW92ZWQtb3V0XG5cdFx0XHRcdC8vIHN0b3JlIHdoaWNoIHNoYXJlcyB0aGUgbGlmZWN5Y2xlIG9mIGByZW5kZXJlZFBhcnRzYC5cblx0XHRcdFx0dGhpbmtpbmdQYXJ0LnJlbW92ZU1hdGVyaWFsaXplZEl0ZW0odG9vbEludm9jYXRpb24udG9vbENhbGxJZCk7XG5cdFx0XHRcdCh0ZW1wbGF0ZURhdGEubW92ZWRPdXRUb29sUGFydHMgPz89IG5ldyBEaXNwb3NhYmxlTWFwKCkpLnNldCh0b29sSW52b2NhdGlvbi50b29sQ2FsbElkLCBjcmVhdGVkUGFydCk7XG5cdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHR0aGlua2luZ1BhcnQucmVtb3ZlTGF6eUl0ZW0odG9vbEludm9jYXRpb24udG9vbElkKTtcblx0XHRcdFx0Y29uc3QgeyBkb21Ob2RlLCBwYXJ0OiBjcmVhdGVkUGFydCB9ID0gY3JlYXRlVG9vbFBhcnQoKTtcblx0XHRcdFx0cGFydCA9IGNyZWF0ZWRQYXJ0O1xuXHRcdFx0XHQodGVtcGxhdGVEYXRhLm1vdmVkT3V0VG9vbFBhcnRzID8/PSBuZXcgRGlzcG9zYWJsZU1hcCgpKS5zZXQodG9vbEludm9jYXRpb24udG9vbENhbGxJZCwgY3JlYXRlZFBhcnQpO1xuXHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUuYXBwZW5kQ2hpbGQoZG9tTm9kZSk7XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0XHQvLyBpZiB0aGUgdGhpbmtpbmcgcGFydCBpcyBub3cgY29tcGxldGVseSBlbXB0eSAobm8gdG9vbHMsIG5vIHRoaW5raW5nIHRleHQpXG5cdFx0XHRpZiAodGhpbmtpbmdQYXJ0LmlzRWZmZWN0aXZlbHlFbXB0eSgpKSB7XG5cdFx0XHRcdHRoaW5raW5nUGFydC5kb21Ob2RlPy5yZW1vdmUoKTtcblx0XHRcdFx0dGhpbmtpbmdQYXJ0LmRpc3Bvc2UoKTtcblx0XHRcdH1cblxuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGlzV29ya2luZ1N0YXRlID0gKHR5cGU6IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kKSA9PlxuXHRcdFx0dHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuU3RyZWFtaW5nIHx8IHR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLkV4ZWN1dGluZztcblxuXHRcdGNvbnN0IHRyeVJvdXRlQ29uZmlybWF0aW9uVG9DYXJvdXNlbCA9ICgpOiBib29sZWFuID0+IHtcblx0XHRcdGlmICghdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPGJvb2xlYW4+KENoYXRDb25maWd1cmF0aW9uLlRvb2xDb25maXJtYXRpb25DYXJvdXNlbCkgfHxcblx0XHRcdFx0IWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpIHx8XG5cdFx0XHRcdHRoaXMudmlld01vZGVsPy5lZGl0aW5nIHx8XG5cdFx0XHRcdHRvb2xJbnZvY2F0aW9uLnByZXNlbnRhdGlvbiA9PT0gJ2hpZGRlbicgfHxcblx0XHRcdFx0dG9vbEludm9jYXRpb24uc291cmNlLnR5cGUgPT09ICdtY3AnKSB7XG5cdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5nZXQoKTtcblx0XHRcdGlmIChzdGF0ZS50eXBlICE9PSBJQ2hhdFRvb2xJbnZvY2F0aW9uLlN0YXRlS2luZC5XYWl0aW5nRm9yQ29uZmlybWF0aW9uIHx8ICFzdGF0ZS5jb25maXJtYXRpb25NZXNzYWdlcz8udGl0bGUpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCB3aWRnZXQgPSB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpO1xuXHRcdFx0aWYgKCF3aWRnZXQpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXG5cdFx0XHRjb25zdCBwYXJ0ID0gbW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdGNvbnN0IGZhY3RvcnkgPSAodG9vbDogSUNoYXRUb29sSW52b2NhdGlvbikgPT4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShcblx0XHRcdFx0Q2hhdFRvb2xJbnZvY2F0aW9uUGFydCwgdG9vbCwgY29udGV4dCxcblx0XHRcdFx0dGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIHRoaXMuX2NvbnRlbnRSZWZlcmVuY2VzTGlzdFBvb2wsXG5cdFx0XHRcdHRoaXMuX3Rvb2xFZGl0b3JQb29sLCAoKSA9PiB0aGlzLl9jdXJyZW50TGF5b3V0V2lkdGguZ2V0KCksXG5cdFx0XHRcdHRoaXMuX2Fubm91bmNlZFRvb2xQcm9ncmVzc0tleXMsXG5cdFx0XHRcdGNvbnRleHQuY29kZUJsb2NrU3RhcnRJbmRleFxuXHRcdFx0KTtcblxuXHRcdFx0cGFydC5hZGREaXNwb3NhYmxlKGF1dG9ydW4ocmVhZGVyID0+IHtcblx0XHRcdFx0Y29uc3QgY3VycmVudFN0YXRlID0gdG9vbEludm9jYXRpb24uc3RhdGUucmVhZChyZWFkZXIpO1xuXHRcdFx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gJiYgY3VycmVudFN0YXRlLmNvbmZpcm1hdGlvbk1lc3NhZ2VzPy50aXRsZSkge1xuXHRcdFx0XHRcdHdpZGdldC5pbnB1dFBhcnQuYWRkVG9vbFRvQ29uZmlybWF0aW9uQ2Fyb3VzZWwodG9vbEludm9jYXRpb24sIGZhY3RvcnkpO1xuXHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH0gZWxzZSBpZiAoSUNoYXRUb29sSW52b2NhdGlvbi5pc0VmZmVjdGl2ZWx5SGlkZGVuKHRvb2xJbnZvY2F0aW9uLCByZWFkZXIpKSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdGRvbS5oaWRlKHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdFx0dGhpcy51cGRhdGVXb3JraW5nUHJvZ3Jlc3NGb3JQZW5kaW5nQ29uZmlybWF0aW9ucyh0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRcdGRvbS5zaG93KHBhcnQuZG9tTm9kZSk7XG5cdFx0XHRcdH1cblx0XHRcdH0pKTtcblxuXHRcdFx0cmV0dXJuIHRydWU7XG5cdFx0fTtcblxuXHRcdGNvbnN0IGN1cnJlbnRTdGF0ZSA9IHRvb2xJbnZvY2F0aW9uLnN0YXRlLmdldCgpO1xuXHRcdGlmICh0b29sSW52b2NhdGlvbkhhc01jcEFwcERhdGEodG9vbEludm9jYXRpb24pKSB7XG5cdFx0XHRtb3ZlQ29uZmlybWF0aW9uV2lkZ2V0T3V0T2ZUaGlua2luZygpO1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblxuXHRcdGlmIChjdXJyZW50U3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvckNvbmZpcm1hdGlvbikge1xuXHRcdFx0aWYgKCF0cnlSb3V0ZUNvbmZpcm1hdGlvblRvQ2Fyb3VzZWwoKSkge1xuXHRcdFx0XHRtb3ZlQ29uZmlybWF0aW9uV2lkZ2V0T3V0T2ZUaGlua2luZygpO1xuXHRcdFx0fVxuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHRpZiAoY3VycmVudFN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JQb3N0QXBwcm92YWwpIHtcblx0XHRcdG1vdmVDb25maXJtYXRpb25XaWRnZXRPdXRPZlRoaW5raW5nKCk7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0aWYgKCFpc1dvcmtpbmdTdGF0ZShjdXJyZW50U3RhdGUudHlwZSkpIHtcblx0XHRcdHJldHVybjtcblx0XHR9XG5cblx0XHRsZXQgZGlkTW92ZVRvb2xPdXQgPSBmYWxzZTtcblx0XHRjb25zdCBkaXNwb3NhYmxlID0gYXV0b3J1bihyZWFkZXIgPT4ge1xuXHRcdFx0Y29uc3Qgc3RhdGUgPSB0b29sSW52b2NhdGlvbi5zdGF0ZS5yZWFkKHJlYWRlcik7XG5cdFx0XHR0b29sSW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhS2luZC5yZWFkKHJlYWRlcik7XG5cdFx0XHRpZiAodG9vbEludm9jYXRpb25IYXNNY3BBcHBEYXRhKHRvb2xJbnZvY2F0aW9uKSkge1xuXHRcdFx0XHRpZiAoZGlkTW92ZVRvb2xPdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlkTW92ZVRvb2xPdXQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0bW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0fVxuXHRcdFx0aWYgKHN0YXRlLnR5cGUgPT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgc3RhdGUudHlwZSA9PT0gSUNoYXRUb29sSW52b2NhdGlvbi5TdGF0ZUtpbmQuV2FpdGluZ0ZvclBvc3RBcHByb3ZhbCkge1xuXHRcdFx0XHRpZiAoZGlkTW92ZVRvb2xPdXQpIHtcblx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdH1cblx0XHRcdFx0ZGlkTW92ZVRvb2xPdXQgPSB0cnVlO1xuXHRcdFx0XHRkaXNwb3NhYmxlLmRpc3Bvc2UoKTtcblx0XHRcdFx0aWYgKHN0YXRlLnR5cGUgIT09IElDaGF0VG9vbEludm9jYXRpb24uU3RhdGVLaW5kLldhaXRpbmdGb3JDb25maXJtYXRpb24gfHwgIXRyeVJvdXRlQ29uZmlybWF0aW9uVG9DYXJvdXNlbCgpKSB7XG5cdFx0XHRcdFx0bW92ZUNvbmZpcm1hdGlvbldpZGdldE91dE9mVGhpbmtpbmcoKTtcblx0XHRcdFx0fVxuXHRcdFx0fVxuXHRcdH0pO1xuXG5cdFx0dGhpbmtpbmdQYXJ0LmFkZERpc3Bvc2FibGUoZGlzcG9zYWJsZSk7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckV4dGVuc2lvbnNDb250ZW50KGV4dGVuc2lvbnNDb250ZW50OiBJQ2hhdEV4dGVuc2lvbnNDb250ZW50LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0RXh0ZW5zaW9uc0NvbnRlbnRQYXJ0LCBleHRlbnNpb25zQ29udGVudCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckhvb2tQYXJ0KGhvb2tQYXJ0OiBJQ2hhdEhvb2tQYXJ0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUsIGJhdGNoZWRTdWJhZ2VudFBhcnRzPzogU2V0PENoYXRTdWJhZ2VudENvbnRlbnRQYXJ0Pik6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdGlmICghKGhvb2tQYXJ0LnN0b3BSZWFzb24gfHwgaG9va1BhcnQuc3lzdGVtTWVzc2FnZSkpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBvdGhlci5raW5kID09PSAnaG9vaycgJiYgb3RoZXIuaG9va1R5cGUgPT09IGhvb2tQYXJ0Lmhvb2tUeXBlKTtcblx0XHR9XG5cblx0XHRpZiAoaG9va1BhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdGNvbnN0IHN1YmFnZW50UGFydCA9IHRoaXMuZ2V0U3ViYWdlbnRQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzLCBob29rUGFydC5zdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0XHRpZiAoc3ViYWdlbnRQYXJ0KSB7XG5cdFx0XHRcdHRoaXMuYmVnaW5TdWJhZ2VudFRvb2xQcmVzZW50YXRpb25CYXRjaChzdWJhZ2VudFBhcnQsIGJhdGNoZWRTdWJhZ2VudFBhcnRzKTtcblx0XHRcdFx0c3ViYWdlbnRQYXJ0LmFwcGVuZEhvb2tJdGVtKCgpID0+IHtcblx0XHRcdFx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0SG9va0NvbnRlbnRQYXJ0LCBob29rUGFydCwgY29udGV4dCk7XG5cdFx0XHRcdFx0cmV0dXJuIHsgZG9tTm9kZTogcGFydC5kb21Ob2RlLCBkaXNwb3NhYmxlOiBwYXJ0IH07XG5cdFx0XHRcdH0sIGhvb2tQYXJ0KTtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IG90aGVyLmtpbmQgPT09ICdob29rJyAmJiBvdGhlci5ob29rVHlwZSA9PT0gaG9va1BhcnQuaG9va1R5cGUgJiYgb3RoZXIuc3ViQWdlbnRJbnZvY2F0aW9uSWQgPT09IGhvb2tQYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHQvLyBPbmx5IHBpbiBwcmVUb29sL3Bvc3RUb29sIGhvb2tzIGludG8gdGhlIHRoaW5raW5nIHBhcnRcblx0XHRjb25zdCBzaG91bGRQaW5Ub1RoaW5raW5nID0gaG9va1BhcnQuaG9va1R5cGUgPT09IEhvb2tUeXBlLlByZVRvb2xVc2UgfHwgaG9va1BhcnQuaG9va1R5cGUgPT09IEhvb2tUeXBlLlBvc3RUb29sVXNlO1xuXHRcdGlmIChzaG91bGRQaW5Ub1RoaW5raW5nKSB7XG5cdFx0XHRjb25zdCBob29rVGl0bGUgPSBob29rUGFydC5zdG9wUmVhc29uXG5cdFx0XHRcdD8gKGhvb2tQYXJ0LnRvb2xEaXNwbGF5TmFtZVxuXHRcdFx0XHRcdD8gbG9jYWxpemUoJ2hvb2sudGhpbmtpbmcuYmxvY2tlZCcsIFwiQmxvY2tlZCB7MH1cIiwgaG9va1BhcnQudG9vbERpc3BsYXlOYW1lKVxuXHRcdFx0XHRcdDogbG9jYWxpemUoJ2hvb2sudGhpbmtpbmcuYmxvY2tlZEdlbmVyaWMnLCBcIkJsb2NrZWQgYnkgaG9va1wiKSlcblx0XHRcdFx0OiAoaG9va1BhcnQudG9vbERpc3BsYXlOYW1lXG5cdFx0XHRcdFx0PyBsb2NhbGl6ZSgnaG9vay50aGlua2luZy53YXJuaW5nJywgXCJVc2VkIHswfSwgYnV0IHJlY2VpdmVkIGEgd2FybmluZ1wiLCBob29rUGFydC50b29sRGlzcGxheU5hbWUpXG5cdFx0XHRcdFx0OiBsb2NhbGl6ZSgnaG9vay50aGlua2luZy53YXJuaW5nR2VuZXJpYycsIFwiVG9vbCBjYWxsIHJlY2VpdmVkIGEgd2FybmluZ1wiKSk7XG5cblx0XHRcdGxldCB7IHBhcnQ6IHRoaW5raW5nUGFydCB9ID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0Rm9yR3JvdXBlZEl0ZW0oY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdGlmICghdGhpbmtpbmdQYXJ0KSB7XG5cdFx0XHRcdC8vIENyZWF0ZSBhIHRoaW5raW5nIHBhcnQgaWYgb25lIGRvZXNuJ3QgZXhpc3QgeWV0IChlLmcuIGhvb2sgYXJyaXZlcyBiZWZvcmUvd2l0aCBpdHMgdG9vbCBpbiB0aGUgc2FtZSB0dXJuKVxuXHRcdFx0XHRjb25zdCBuZXdUaGlua2luZyA9IHRoaXMucmVuZGVyVGhpbmtpbmdQYXJ0KHsga2luZDogJ3RoaW5raW5nJyB9LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdFx0XHRpZiAobmV3VGhpbmtpbmcgaW5zdGFuY2VvZiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdHRoaW5raW5nUGFydCA9IG5ld1RoaW5raW5nO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGlmICh0aGlua2luZ1BhcnQpIHtcblx0XHRcdFx0dGhpbmtpbmdQYXJ0LmFwcGVuZEl0ZW0oKCkgPT4ge1xuXHRcdFx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRIb29rQ29udGVudFBhcnQsIGhvb2tQYXJ0LCBjb250ZXh0KTtcblx0XHRcdFx0XHRyZXR1cm4geyBkb21Ob2RlOiBwYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IHBhcnQgfTtcblx0XHRcdFx0fSwgaG9va1RpdGxlLCB1bmRlZmluZWQsIHRlbXBsYXRlRGF0YS52YWx1ZSk7XG5cdFx0XHRcdHJldHVybiB0aGlua2luZ1BhcnQ7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEhvb2tDb250ZW50UGFydCwgaG9va1BhcnQsIGNvbnRleHQpO1xuXHRcdHJldHVybiBwYXJ0O1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQdWxsUmVxdWVzdENvbnRlbnQocHVsbFJlcXVlc3RDb250ZW50OiBJQ2hhdFB1bGxSZXF1ZXN0Q29udGVudCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB8IHVuZGVmaW5lZCB7XG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdFB1bGxSZXF1ZXN0Q29udGVudFBhcnQsIHB1bGxSZXF1ZXN0Q29udGVudCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlclByb2dyZXNzVGFzayh0YXNrOiBJQ2hhdFRhc2sgfCBJQ2hhdFRhc2tTZXJpYWxpemVkLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQpOiBJQ2hhdENvbnRlbnRQYXJ0IHwgdW5kZWZpbmVkIHtcblx0XHRpZiAoIWlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdGNvbnN0IHRhc2tQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGFza0NvbnRlbnRQYXJ0LCB0YXNrLCB0aGlzLl9jb250ZW50UmVmZXJlbmNlc0xpc3RQb29sLCB0aGlzLmNoYXRDb250ZW50TWFya2Rvd25SZW5kZXJlciwgY29udGV4dCk7XG5cdFx0cmV0dXJuIHRhc2tQYXJ0O1xuXHR9XG5cblxuXHRwcml2YXRlIHJlbmRlckNvbmZpcm1hdGlvbihjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgY29uZmlybWF0aW9uOiBJQ2hhdENvbmZpcm1hdGlvbiwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q29uZmlybWF0aW9uQ29udGVudFBhcnQsIGNvbmZpcm1hdGlvbiwgY29udGV4dCk7XG5cdFx0cmV0dXJuIHBhcnQ7XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckVsaWNpdGF0aW9uKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBlbGljaXRhdGlvbjogSUNoYXRFbGljaXRhdGlvblJlcXVlc3QgfCBJQ2hhdEVsaWNpdGF0aW9uUmVxdWVzdFNlcmlhbGl6ZWQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0aWYgKGVsaWNpdGF0aW9uLmtpbmQgPT09ICdlbGljaXRhdGlvblNlcmlhbGl6ZWQnID8gZWxpY2l0YXRpb24uaXNIaWRkZW4gOiBlbGljaXRhdGlvbi5pc0hpZGRlbj8uZ2V0KCkpIHtcblx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBlbGljaXRhdGlvbi5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHR9XG5cblx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0Y29uc3QgcGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEVsaWNpdGF0aW9uQ29udGVudFBhcnQsIGVsaWNpdGF0aW9uLCBjb250ZXh0KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyUXVlc3Rpb25DYXJvdXNlbChjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgY2Fyb3VzZWw6IElDaGF0UXVlc3Rpb25DYXJvdXNlbCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdHRoaXMuX25vdGlmeU9uUXVlc3Rpb25DYXJvdXNlbChjb250ZXh0LCBjYXJvdXNlbCk7XG5cblx0XHQvLyBCYWNrZmlsbCB0ZXJtaW5hbCBjb3JyZWxhdGlvbiBvbiB0aGUgY2Fyb3VzZWwgZnJvbSB0aGUgb3JpZ2luYXRpbmcgcmVxdWVzdC5cblx0XHQvLyBUaGlzIGtlZXBzIGZvY3VzIGJ1dHRvbiAvIHNlbmRfdG9fdGVybWluYWwgY29ycmVsYXRpb24gd29ya2luZyBldmVuIHdoZW5cblx0XHQvLyBhc2tRdWVzdGlvbnMgY291bGRuJ3Qgc3RhbXAgdGVybWluYWxJZCBkdXJpbmcgdG9vbCBleGVjdXRpb24uXG5cdFx0aWYgKCFjYXJvdXNlbC50ZXJtaW5hbElkICYmIGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpKSB7XG5cdFx0XHRjb25zdCByZXNwb25zZUVsZW1lbnQgPSBjb250ZXh0LmVsZW1lbnQ7XG5cdFx0XHRjb25zdCBtb2RlbCA9IHRoaXMuY2hhdFNlcnZpY2UuZ2V0U2Vzc2lvbihyZXNwb25zZUVsZW1lbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGNvbnN0IHJlcXVlc3QgPSBtb2RlbD8uZ2V0UmVxdWVzdHMoKS5maW5kKHIgPT4gci5pZCA9PT0gcmVzcG9uc2VFbGVtZW50LnJlcXVlc3RJZCk7XG5cdFx0XHRpZiAocmVxdWVzdD8udGVybWluYWxFeGVjdXRpb25JZCkge1xuXHRcdFx0XHRjYXJvdXNlbC50ZXJtaW5hbElkID0gcmVxdWVzdC50ZXJtaW5hbEV4ZWN1dGlvbklkO1xuXHRcdFx0XHR0aGlzLmxvZ1NlcnZpY2UudHJhY2UoYENoYXRMaXN0SXRlbVJlbmRlcmVyI3JlbmRlclF1ZXN0aW9uQ2Fyb3VzZWw6IGJhY2tmaWxsZWQgdGVybWluYWxJZD0ke2Nhcm91c2VsLnRlcm1pbmFsSWR9IGZvciByZXF1ZXN0PSR7cmVzcG9uc2VFbGVtZW50LnJlcXVlc3RJZH1gKTtcblx0XHRcdH0gZWxzZSB7XG5cdFx0XHRcdHRoaXMubG9nU2VydmljZS50cmFjZShgQ2hhdExpc3RJdGVtUmVuZGVyZXIjcmVuZGVyUXVlc3Rpb25DYXJvdXNlbDogbm8gdGVybWluYWxFeGVjdXRpb25JZCB0byBiYWNrZmlsbCBmb3IgcmVxdWVzdD0ke3Jlc3BvbnNlRWxlbWVudC5yZXF1ZXN0SWR9YCk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Y29uc3Qgd2lkZ2V0ID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyB0aGlzLmNoYXRXaWRnZXRTZXJ2aWNlLmdldFdpZGdldEJ5U2Vzc2lvblJlc291cmNlKGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UpIDogdW5kZWZpbmVkO1xuXHRcdC8vIE9ubHkgYXV0by1mb2N1cyBpZiB0aGUgY2hhdCBpbnB1dCBpcyBlbXB0eSBBTkQgZm9jdXMgaXMgYWxyZWFkeSB3aXRoaW4gdGhlIGNoYXQgd2lkZ2V0XG5cdFx0Ly8gVGhpcyBwcmV2ZW50cyBzdGVhbGluZyBmb2N1cyBmcm9tIG90aGVyIFZTIENvZGUgVUkgKGVkaXRvciwgdGVybWluYWwsIGV0Yy4pXG5cdFx0Y29uc3Qgc2hvdWxkQXV0b0ZvY3VzID0gISF3aWRnZXQgJiYgZG9tLmlzQW5jZXN0b3JPZkFjdGl2ZUVsZW1lbnQod2lkZ2V0LmRvbU5vZGUpICYmIHdpZGdldC5nZXRJbnB1dCgpID09PSAnJztcblx0XHRjb25zdCByZXNwb25zZUlkID0gaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgPyBjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkIDogdW5kZWZpbmVkO1xuXHRcdGNvbnN0IGNhcm91c2VsS2V5ID0gY2Fyb3VzZWwucmVzb2x2ZUlkID8/IGAke3Jlc3BvbnNlSWQgPz8gJyd9XyR7Y29udGV4dC5jb250ZW50SW5kZXh9YDtcblxuXHRcdGNvbnN0IGhhbmRsZVN1Ym1pdCA9IGFzeW5jIChhbnN3ZXJzOiBNYXA8c3RyaW5nLCBJQ2hhdFF1ZXN0aW9uQW5zd2VyVmFsdWU+IHwgdW5kZWZpbmVkLCBwYXJ0OiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQpID0+IHtcblx0XHRcdGlmIChjYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0Ly8gVm9pY2UgY2FuIGFuc3dlciB0aGUgc2FtZSBmb3JtLCBzbyBhIHF1ZXVlZCBjbGljayBtYXkgbGFuZCBhZnRlciBpdFxuXHRcdFx0XHQvLyBoYXMgYmVlbiBzdWJtaXR0ZWQuIEFwcGx5aW5nIGl0IHdvdWxkIHJlcGxhY2UgdGhlIHNwb2tlbiBhbnN3ZXIgYW5kXG5cdFx0XHRcdC8vIG5vdGlmeSB0aGUgZXh0ZW5zaW9uIHR3aWNlLlxuXHRcdFx0XHRyZXR1cm47XG5cdFx0XHR9XG5cdFx0XHQvLyBNYXJrIHRoZSBjYXJvdXNlbCBhcyB1c2VkIGFuZCBzdG9yZSB0aGUgYW5zd2Vyc1xuXHRcdFx0Y29uc3QgYW5zd2Vyc1JlY29yZDogSUNoYXRRdWVzdGlvbkFuc3dlcnMgfCB1bmRlZmluZWQgPSBhbnN3ZXJzID8gT2JqZWN0LmZyb21FbnRyaWVzKGFuc3dlcnMpIDogdW5kZWZpbmVkO1xuXHRcdFx0Y2Fyb3VzZWwuZGF0YSA9IGFuc3dlcnNSZWNvcmQgPz8ge307XG5cdFx0XHRjYXJvdXNlbC5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0aWYgKGNhcm91c2VsIGluc3RhbmNlb2YgQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWxEYXRhKSB7XG5cdFx0XHRcdGNhcm91c2VsLmRyYWZ0QW5zd2VycyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0Y2Fyb3VzZWwuZHJhZnRDdXJyZW50SW5kZXggPSB1bmRlZmluZWQ7XG5cdFx0XHRcdGNhcm91c2VsLmNvbXBsZXRpb24uY29tcGxldGUoeyBhbnN3ZXJzOiBhbnN3ZXJzUmVjb3JkIH0pO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBOb3RpZnkgdGhlIGV4dGVuc2lvbiBhYm91dCB0aGUgY2Fyb3VzZWwgYW5zd2VycyB0byByZXNvbHZlIHRoZSBkZWZlcnJlZCBwcm9taXNlXG5cdFx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkgJiYgY2Fyb3VzZWwucmVzb2x2ZUlkKSB7XG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2Uubm90aWZ5UXVlc3Rpb25DYXJvdXNlbEFuc3dlcihjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkLCBjYXJvdXNlbC5yZXNvbHZlSWQsIGFuc3dlcnNSZWNvcmQpO1xuXHRcdFx0fVxuXG5cdFx0XHQvLyBSZW1vdmUgZnJvbSBwZW5kaW5nIGNhcm91c2Vsc1xuXHRcdFx0dGhpcy5yZW1vdmVDYXJvdXNlbEZyb21UcmFja2luZyhjb250ZXh0LCBwYXJ0KTtcblxuXHRcdFx0Ly8gQ2xlYXIgZnJvbSBpbnB1dCBwYXJ0IChjbGVhciBvbmx5IHRoZSBzdWJtaXR0ZWQgY2Fyb3VzZWwgYnkgaXRzIGtleSlcblx0XHRcdHdpZGdldD8uaW5wdXQuY2xlYXJRdWVzdGlvbkNhcm91c2VsKHVuZGVmaW5lZCwgY2Fyb3VzZWxLZXkpO1xuXHRcdH07XG5cblx0XHQvLyBJZiBjYXJvdXNlbCBpcyBhbHJlYWR5IHVzZWQgb3IgcmVzcG9uc2UgaXMgY29tcGxldGUvY2FuY2VsZWQsIHJlbmRlciBzdW1tYXJ5IGlubGluZSBpbiB0aGUgbGlzdFxuXHRcdGNvbnN0IHJlc3BvbnNlSXNDb21wbGV0ZSA9IGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlO1xuXHRcdGNvbnN0IGlucHV0UGFydEhhc0Nhcm91c2VsID0gd2lkZ2V0Py5pbnB1dC5xdWVzdGlvbkNhcm91c2VsICE9PSB1bmRlZmluZWQ7XG5cblx0XHRpZiAoY2Fyb3VzZWwuaXNVc2VkIHx8IHJlc3BvbnNlSXNDb21wbGV0ZSkge1xuXHRcdFx0aWYgKHJlc3BvbnNlSXNDb21wbGV0ZSAmJiAhY2Fyb3VzZWwuaXNVc2VkICYmIGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNhcm91c2VsLnJlc29sdmVJZCkge1xuXHRcdFx0XHRjYXJvdXNlbC5kYXRhID0ge307XG5cdFx0XHRcdGNhcm91c2VsLmlzVXNlZCA9IHRydWU7XG5cdFx0XHRcdGlmIChjYXJvdXNlbCBpbnN0YW5jZW9mIENoYXRRdWVzdGlvbkNhcm91c2VsRGF0YSkge1xuXHRcdFx0XHRcdGNhcm91c2VsLmRyYWZ0QW5zd2VycyA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjYXJvdXNlbC5kcmFmdEN1cnJlbnRJbmRleCA9IHVuZGVmaW5lZDtcblx0XHRcdFx0XHRjYXJvdXNlbC5jb21wbGV0aW9uLmNvbXBsZXRlKHsgYW5zd2VyczogdW5kZWZpbmVkIH0pO1xuXHRcdFx0XHR9XG5cdFx0XHRcdHRoaXMuY2hhdFNlcnZpY2Uubm90aWZ5UXVlc3Rpb25DYXJvdXNlbEFuc3dlcihjb250ZXh0LmVsZW1lbnQucmVxdWVzdElkLCBjYXJvdXNlbC5yZXNvbHZlSWQsIHVuZGVmaW5lZCk7XG5cdFx0XHRcdHRoaXMucGVuZGluZ1F1ZXN0aW9uQ2Fyb3VzZWxzLmdldChjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKT8uY2xlYXIoKTtcblx0XHRcdH1cblxuXHRcdFx0Ly8gQ2xlYXIgdGhlIGNhcm91c2VsIGZyb20gdGhlIGlucHV0IGFyZWEgb25jZSBpdCBoYXMgYmVlbiBhbnN3ZXJlZCBvciB3aGVuIHRoZVxuXHRcdFx0Ly8gd2hvbGUgcmVzcG9uc2UgY29tcGxldGVzLiBgY2Fyb3VzZWwuaXNVc2VkYCBjb3ZlcnMgZXh0ZXJuYWxseSBjb21wbGV0ZWRcblx0XHRcdC8vIGZsb3dzIChmb3IgZXhhbXBsZSwgYSByZW1vdGUgYW5zd2VyIHdpbm5pbmcgb3ZlciB0aGUgbG9jYWwgaW5wdXQgVUkpLlxuXHRcdFx0aWYgKGlucHV0UGFydEhhc0Nhcm91c2VsKSB7XG5cdFx0XHRcdGlmIChjYXJvdXNlbC5pc1VzZWQpIHtcblx0XHRcdFx0XHR3aWRnZXQ/LmlucHV0LmNsZWFyUXVlc3Rpb25DYXJvdXNlbCh1bmRlZmluZWQsIGNhcm91c2VsS2V5KTtcblx0XHRcdFx0fSBlbHNlIGlmIChyZXNwb25zZUlzQ29tcGxldGUgJiYgcmVzcG9uc2VJZCkge1xuXHRcdFx0XHRcdHdpZGdldD8uaW5wdXQuY2xlYXJRdWVzdGlvbkNhcm91c2VsKHJlc3BvbnNlSWQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cblx0XHRcdGNvbnN0IHBhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCwgY2Fyb3VzZWwsIGNvbnRleHQsIHtcblx0XHRcdFx0c2hvdWxkQXV0b0ZvY3VzOiBmYWxzZSxcblx0XHRcdFx0Zml0Q29udGVudDogdGhpcy5yZW5kZXJlck9wdGlvbnMucXVlc3Rpb25DYXJvdXNlbEZpdENvbnRlbnQsXG5cdFx0XHRcdG9uU3VibWl0OiBhc3luYyAoYW5zd2VycykgPT4gaGFuZGxlU3VibWl0KGFuc3dlcnMsIHBhcnQpXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdH1cblxuXHRcdC8vIFJlbmRlciB0aGUgYWN0aXZlIGNhcm91c2VsIGluIHRoZSBpbnB1dCBwYXJ0IChhYm92ZSB0aGUgaW5wdXQgYm94LCBub3Qgd2hpbGUgZWRpdGluZylcblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMudmlld01vZGVsPy5lZGl0aW5nO1xuXHRcdGNvbnN0IHBhcnQgPSBpc0VkaXRpbmcgPyB1bmRlZmluZWQgOiB3aWRnZXQ/LmlucHV0LnJlbmRlclF1ZXN0aW9uQ2Fyb3VzZWwoY2Fyb3VzZWwsIGNvbnRleHQsIHtcblx0XHRcdHNob3VsZEF1dG9Gb2N1cyxcblx0XHRcdGZpdENvbnRlbnQ6IHRoaXMucmVuZGVyZXJPcHRpb25zLnF1ZXN0aW9uQ2Fyb3VzZWxGaXRDb250ZW50LFxuXHRcdFx0b25TdWJtaXQ6IGFzeW5jIChhbnN3ZXJzKSA9PiBoYW5kbGVTdWJtaXQoYW5zd2VycywgcGFydCEpXG5cdFx0fSk7XG5cblx0XHQvLyBJZiB3ZSBjb3VsZG4ndCByZW5kZXIgaW4gdGhlIGlucHV0IHBhcnQsIGZhbGwgYmFjayB0byBpbmxpbmUgcmVuZGVyaW5nXG5cdFx0aWYgKCFwYXJ0KSB7XG5cdFx0XHRjb25zdCBmYWxsYmFja1BhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRRdWVzdGlvbkNhcm91c2VsUGFydCwgY2Fyb3VzZWwsIGNvbnRleHQsIHtcblx0XHRcdFx0c2hvdWxkQXV0b0ZvY3VzLFxuXHRcdFx0XHRmaXRDb250ZW50OiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5xdWVzdGlvbkNhcm91c2VsRml0Q29udGVudCxcblx0XHRcdFx0b25TdWJtaXQ6IGFzeW5jIChhbnN3ZXJzKSA9PiBoYW5kbGVTdWJtaXQoYW5zd2VycywgZmFsbGJhY2tQYXJ0KVxuXHRcdFx0fSk7XG5cdFx0XHRyZXR1cm4gZmFsbGJhY2tQYXJ0O1xuXHRcdH1cblxuXHRcdC8vIFRyYWNrIHRoZSBjYXJvdXNlbCBmb3IgYXV0by1za2lwIHdoZW4gdXNlciBzdWJtaXRzIGEgbmV3IG1lc3NhZ2Vcblx0XHQvLyBPbmx5IGFkZCB0cmFja2luZyBpZiBub3QgYWxyZWFkeSB0cmFja2VkIChwcmV2ZW50cyBkdXBsaWNhdGUgdHJhY2tpbmcgb24gcmUtcmVuZGVyKVxuXHRcdGlmIChpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSAmJiBjYXJvdXNlbC5hbGxvd1NraXAgJiYgIWNhcm91c2VsLmlzVXNlZCkge1xuXHRcdFx0bGV0IGNhcm91c2VscyA9IHRoaXMucGVuZGluZ1F1ZXN0aW9uQ2Fyb3VzZWxzLmdldChjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmICghY2Fyb3VzZWxzKSB7XG5cdFx0XHRcdGNhcm91c2VscyA9IG5ldyBTZXQoKTtcblx0XHRcdFx0dGhpcy5wZW5kaW5nUXVlc3Rpb25DYXJvdXNlbHMuc2V0KGNvbnRleHQuZWxlbWVudC5zZXNzaW9uUmVzb3VyY2UsIGNhcm91c2Vscyk7XG5cdFx0XHR9XG5cdFx0XHRpZiAoIWNhcm91c2Vscy5oYXMocGFydCkpIHtcblx0XHRcdFx0Y2Fyb3VzZWxzLmFkZChwYXJ0KTtcblxuXHRcdFx0XHQvLyBDbGVhbiB1cCB3aGVuIHRoZSBwYXJ0IGlzIGRpc3Bvc2VkXG5cdFx0XHRcdHBhcnQuYWRkRGlzcG9zYWJsZSh7IGRpc3Bvc2U6ICgpID0+IHRoaXMucmVtb3ZlQ2Fyb3VzZWxGcm9tVHJhY2tpbmcoY29udGV4dCwgcGFydCkgfSk7XG5cdFx0XHR9XG5cdFx0fVxuXG5cdFx0Ly8gUmV0dXJuIGEgcGxhY2Vob2xkZXIgdGhhdCB3aWxsIHJlLXJlbmRlciBhcyBhIHN1bW1hcnkgd2hlbiB0aGUgY2Fyb3VzZWwgaXMgdXNlZCBvciByZXNwb25zZSBpcyBjb21wbGV0ZS9zdG9wcGVkXG5cdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KChvdGhlciwgX2ZvbGxvd2luZ0NvbnRlbnQsIGVsZW1lbnQpID0+IHtcblx0XHRcdC8vIFJlLXJlbmRlciAocmV0dXJuIGZhbHNlKSBpZjpcblx0XHRcdC8vIC0gY2Fyb3VzZWwgd2FzIHVzZWQvc3VibWl0dGVkXG5cdFx0XHQvLyAtIHJlc3BvbnNlIGlzIGNvbXBsZXRlIChzdG9wcGVkKVxuXHRcdFx0aWYgKGNhcm91c2VsLmlzVXNlZCB8fCAoaXNSZXNwb25zZVZNKGVsZW1lbnQpICYmIGVsZW1lbnQuaXNDb21wbGV0ZSkpIHtcblx0XHRcdFx0cmV0dXJuIGZhbHNlO1xuXHRcdFx0fVxuXHRcdFx0Ly8gVXNlIHJlc29sdmVJZCBmb3IgY29tcGFyaXNvbiBpbnN0ZWFkIG9mIG9iamVjdCBpZGVudGl0eSB0byBoYW5kbGUgcmUtcmVuZGVyaW5nIGR1cmluZyBzY3JvbGxpbmdcblx0XHRcdGlmIChvdGhlci5raW5kID09PSAncXVlc3Rpb25DYXJvdXNlbCcpIHtcblx0XHRcdFx0Y29uc3Qgb3RoZXJDYXJvdXNlbCA9IG90aGVyIGFzIElDaGF0UXVlc3Rpb25DYXJvdXNlbDtcblx0XHRcdFx0Ly8gQ29tcGFyZSBieSByZXNvbHZlSWQgaWYgYXZhaWxhYmxlLCBvdGhlcndpc2UgZmFsbCBiYWNrIHRvIG9iamVjdCBpZGVudGl0eVxuXHRcdFx0XHRpZiAoY2Fyb3VzZWwucmVzb2x2ZUlkICYmIG90aGVyQ2Fyb3VzZWwucmVzb2x2ZUlkKSB7XG5cdFx0XHRcdFx0cmV0dXJuIGNhcm91c2VsLnJlc29sdmVJZCA9PT0gb3RoZXJDYXJvdXNlbC5yZXNvbHZlSWQ7XG5cdFx0XHRcdH1cblx0XHRcdFx0cmV0dXJuIG90aGVyID09PSBjYXJvdXNlbDtcblx0XHRcdH1cblx0XHRcdHJldHVybiBmYWxzZTtcblx0XHR9KTtcblx0fVxuXG5cdHByaXZhdGUgX2dldENhcm91c2VsU3RhYmxlS2V5KGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBjYXJvdXNlbDogSUNoYXRRdWVzdGlvbkNhcm91c2VsKTogc3RyaW5nIHwgdW5kZWZpbmVkIHtcblx0XHRjb25zdCByZXF1ZXN0SWQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IGNvbnRleHQuZWxlbWVudC5yZXF1ZXN0SWQgOiB1bmRlZmluZWQ7XG5cdFx0aWYgKCFyZXF1ZXN0SWQgfHwgIWNhcm91c2VsLnJlc29sdmVJZCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0cmV0dXJuIGAke3JlcXVlc3RJZH06OiR7Y2Fyb3VzZWwucmVzb2x2ZUlkfWA7XG5cdH1cblxuXHRwcml2YXRlIF9ub3RpZnlPblF1ZXN0aW9uQ2Fyb3VzZWwoY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIGNhcm91c2VsOiBJQ2hhdFF1ZXN0aW9uQ2Fyb3VzZWwpOiB2b2lkIHtcblx0XHRpZiAoY2Fyb3VzZWwuaXNVc2VkKSB7XG5cdFx0XHRyZXR1cm47XG5cdFx0fVxuXG5cdFx0Ly8gT25seSBub3RpZnkgb25jZSBwZXIgY2Fyb3VzZWwgdG8gYXZvaWQgZHVwbGljYXRlIHRvYXN0cyBvbiByZXJlbmRlci5cblx0XHQvLyBVc2UgYSBzdGFibGUga2V5IGJhc2VkIG9uIHJlcXVlc3RJZCArIHJlc29sdmVJZCBpbnN0ZWFkIG9mIG9iamVjdCBpZGVudGl0eS5cblx0XHRjb25zdCBzdGFibGVLZXkgPSB0aGlzLl9nZXRDYXJvdXNlbFN0YWJsZUtleShjb250ZXh0LCBjYXJvdXNlbCk7XG5cdFx0aWYgKHN0YWJsZUtleSA/IHRoaXMuX25vdGlmaWVkUXVlc3Rpb25DYXJvdXNlbHMuaGFzKHN0YWJsZUtleSkgOiBmYWxzZSkge1xuXHRcdFx0cmV0dXJuO1xuXHRcdH1cblx0XHQvLyBBbGVydCBzY3JlZW4gcmVhZGVycyB3aXRoIHRoZSBxdWVzdGlvblxuXHRcdGNvbnN0IHF1ZXN0aW9uQ291bnQgPSBjYXJvdXNlbC5xdWVzdGlvbnMubGVuZ3RoO1xuXHRcdGNvbnN0IHF1ZXN0aW9uID0gY2Fyb3VzZWwucXVlc3Rpb25zLmxlbmd0aCA+IDAgJiYgY2Fyb3VzZWwucXVlc3Rpb25zWzBdLm1lc3NhZ2UgPyBjYXJvdXNlbC5xdWVzdGlvbnNbMF0ubWVzc2FnZSA6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWxOZWVkc0lucHV0U1InLCBcIkNoYXQgaW5wdXQgcmVxdWlyZWQuXCIpO1xuXHRcdGNvbnN0IHN0cmluZ1F1ZXN0aW9uID0gdHlwZW9mIHF1ZXN0aW9uID09PSAnc3RyaW5nJyA/IHF1ZXN0aW9uIDogcXVlc3Rpb24udmFsdWU7XG5cdFx0Y29uc3QgYWxlcnRNZXNzYWdlID0gcXVlc3Rpb25Db3VudCA9PT0gMVxuXHRcdFx0PyBsb2NhbGl6ZSgnY2hhdC5xdWVzdGlvbkNhcm91c2VsQWxlcnRPbmUnLCBcIkNoYXQgaW5wdXQgcmVxdWlyZWQgKDEgcXVlc3Rpb24pOiB7MH1cIiwgc3RyaW5nUXVlc3Rpb24pXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWxBbGVydE1hbnknLCBcIkNoYXQgaW5wdXQgcmVxdWlyZWQgKHswfSBxdWVzdGlvbnMpOiB7MX1cIiwgcXVlc3Rpb25Db3VudCwgc3RyaW5nUXVlc3Rpb24pO1xuXHRcdHRoaXMuYWNjZXNzaWJpbGl0eVNlcnZpY2UuYWxlcnQoYWxlcnRNZXNzYWdlKTtcblx0XHRpZiAoc3RhYmxlS2V5KSB7XG5cdFx0XHR0aGlzLl9ub3RpZmllZFF1ZXN0aW9uQ2Fyb3VzZWxzLmFkZChzdGFibGVLZXkpO1xuXHRcdH1cblxuXHRcdC8vIFBsYXkgYWNjZXNzaWJpbGl0eSBzaWduYWwgcmVnYXJkbGVzcyBvZiBub3RpZmljYXRpb24gc2V0dGluZ1xuXHRcdGNvbnN0IHNpZ25hbE1lc3NhZ2UgPSBxdWVzdGlvbkNvdW50ID09PSAxXG5cdFx0XHQ/IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWxTaWduYWxPbmUnLCBcIkNoYXQgbmVlZHMgeW91ciBpbnB1dCAoMSBxdWVzdGlvbikuXCIpXG5cdFx0XHQ6IGxvY2FsaXplKCdjaGF0LnF1ZXN0aW9uQ2Fyb3VzZWxTaWduYWxNYW55JywgXCJDaGF0IG5lZWRzIHlvdXIgaW5wdXQgKHswfSBxdWVzdGlvbnMpLlwiLCBxdWVzdGlvbkNvdW50KTtcblx0XHR0aGlzLmFjY2Vzc2liaWxpdHlTaWduYWxTZXJ2aWNlLnBsYXlTaWduYWwoQWNjZXNzaWJpbGl0eVNpZ25hbC5jaGF0VXNlckFjdGlvblJlcXVpcmVkLCB7IGFsbG93TWFueUluUGFyYWxsZWw6IHRydWUsIGN1c3RvbUFsZXJ0TWVzc2FnZTogc2lnbmFsTWVzc2FnZSB9KTtcblxuXHRcdC8vIE9TIHRvYXN0IG5vdGlmaWNhdGlvbiBpcyBoYW5kbGVkIGJ5IENoYXRXaW5kb3dOb3RpZmllclxuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJQbGFuUmV2aWV3KGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCByZXZpZXc6IElDaGF0UGxhblJldmlldywgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCB3aWRnZXQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IHRoaXMuY2hhdFdpZGdldFNlcnZpY2UuZ2V0V2lkZ2V0QnlTZXNzaW9uUmVzb3VyY2UoY29udGV4dC5lbGVtZW50LnNlc3Npb25SZXNvdXJjZSkgOiB1bmRlZmluZWQ7XG5cdFx0Y29uc3QgcmVzcG9uc2VJZCA9IGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpID8gY29udGV4dC5lbGVtZW50LnJlcXVlc3RJZCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCByZXZpZXdLZXkgPSByZXZpZXcucmVzb2x2ZUlkID8/IGAke3Jlc3BvbnNlSWQgPz8gJyd9XyR7Y29udGV4dC5jb250ZW50SW5kZXh9YDtcblxuXHRcdC8vIEEgcGVuZGluZyBwbGFuIHJldmlldyBibG9ja3MgdGhlIGFnZW50IG9uIHVzZXIgaW5wdXQsIHNvIHN0b3AgYW55XG5cdFx0Ly8gYWN0aXZlIHRoaW5raW5nIHBhcnQgXHUyMDE0IHBhcml0eSB3aXRoIGVsaWNpdGF0aW9uIC8gcXVlc3Rpb24gY2Fyb3VzZWwuXG5cdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblxuXHRcdGNvbnN0IGhhbmRsZVN1Ym1pdCA9IChyZXN1bHQ6IElDaGF0UGxhblJldmlld1Jlc3VsdCkgPT4ge1xuXHRcdFx0cmV2aWV3LmRhdGEgPSByZXN1bHQ7XG5cdFx0XHRyZXZpZXcuaXNVc2VkID0gdHJ1ZTtcblx0XHRcdGlmIChyZXZpZXcgaW5zdGFuY2VvZiBDaGF0UGxhblJldmlld0RhdGEpIHtcblx0XHRcdFx0cmV2aWV3LmNvbXBsZXRpb24uY29tcGxldGUocmVzdWx0KTtcblx0XHRcdH1cblx0XHRcdHdpZGdldD8uaW5wdXQuY2xlYXJQbGFuUmV2aWV3KHVuZGVmaW5lZCwgcmV2aWV3S2V5KTtcblx0XHR9O1xuXG5cdFx0Ly8gT25jZSB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUgd2l0aG91dCBhIHVzZXIgcmVzcG9uc2UsIG1hcmsgdGhlXG5cdFx0Ly8gcmV2aWV3IGFzIHVzZWQgYW5kIGNsZWFyIGFueSBkb2NrZWQgd2lkZ2V0LiBUaGlzIG1hdGNoZXMgdGhlXG5cdFx0Ly8gbm8tYW5zd2VyIGNhbmNlbGxhdGlvbiBwYXRoIGluIENoYXRUb29sQ29uZmlybWF0aW9uQ2Fyb3VzZWxQYXJ0LlxuXHRcdGNvbnN0IHJlc3BvbnNlSXNDb21wbGV0ZSA9IGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbnRleHQuZWxlbWVudC5pc0NvbXBsZXRlO1xuXHRcdGlmIChyZXNwb25zZUlzQ29tcGxldGUgJiYgIXJldmlldy5pc1VzZWQpIHtcblx0XHRcdHJldmlldy5pc1VzZWQgPSB0cnVlO1xuXHRcdFx0aWYgKHJldmlldyBpbnN0YW5jZW9mIENoYXRQbGFuUmV2aWV3RGF0YSkge1xuXHRcdFx0XHRyZXZpZXcuY29tcGxldGlvbi5jb21wbGV0ZSh1bmRlZmluZWQpO1xuXHRcdFx0fVxuXHRcdH1cblx0XHQvLyBBbHdheXMgY2xlYXIgdGhlIGRvY2tlZCB3aWRnZXQgb25jZSB0aGUgcmVzcG9uc2UgaXMgY29tcGxldGUgXHUyMDE0XG5cdFx0Ly8gYGlzVXNlZGAgbWF5IGFscmVhZHkgYmUgdHJ1ZSBpZiB0aGUgcmVzcG9uc2Ugd2FzIGNhbmNlbGxlZCAoc2VlXG5cdFx0Ly8gYENoYXRSZXNwb25zZU1vZGVsLmNhbmNlbCgpYCBcdTIxOTIgYENoYXRQbGFuUmV2aWV3RGF0YS5kaXNtaXNzKClgKSxcblx0XHQvLyBpbiB3aGljaCBjYXNlIHRoZSBicmFuY2ggYWJvdmUgaXMgc2tpcHBlZCBidXQgdGhlIHdpZGdldCBhYm92ZVxuXHRcdC8vIHRoZSBpbnB1dCBzdGlsbCBuZWVkcyB0byBnby5cblx0XHRpZiAocmVzcG9uc2VJc0NvbXBsZXRlICYmIHJlc3BvbnNlSWQpIHtcblx0XHRcdHdpZGdldD8uaW5wdXQuY2xlYXJQbGFuUmV2aWV3KHJlc3BvbnNlSWQpO1xuXHRcdH1cblxuXHRcdC8vIEJ1aWxkIHRoZSBpbmxpbmUgcHJvZ3Jlc3MgbWVzc2FnZS4gV2hpbGUgcGVuZGluZzogXCJQbGFuIHJldmlld1xuXHRcdC8vIHJlcXVpcmVkXCIgd2l0aCBhIHNwaW5uZXIuIE9uY2UgYW5zd2VyZWQ6IHRoZSBhY3Rpb24gdGhhdCB3YXNcblx0XHQvLyB0YWtlbiAoZS5nLiBcIkFwcHJvdmVkIHBsYW5cIiwgXCJQcm92aWRlZCBmZWVkYmFja1wiKS4gVGhlIGFjdHVhbFxuXHRcdC8vIGZlZWRiYWNrIHRleHQgaXMgcmVuZGVyZWQgYXMgYSBzZXBhcmF0ZSBtYXJrZG93biBibG9jayBiZW5lYXRoXG5cdFx0Ly8gcmF0aGVyIHRoYW4gY29sbGFwc2VkIG9udG8gdGhlIHByb2dyZXNzIGxpbmUuXG5cdFx0Y29uc3QgcmVuZGVyUHJvZ3Jlc3MgPSAoKTogSUNoYXRDb250ZW50UGFydCA9PiB7XG5cdFx0XHRjb25zdCBtZXNzYWdlID0gdGhpcy5nZXRQbGFuUmV2aWV3UHJvZ3Jlc3NNZXNzYWdlKHJldmlldyk7XG5cdFx0XHRpZiAoIW1lc3NhZ2UpIHtcblx0XHRcdFx0cmV0dXJuIHRoaXMucmVuZGVyTm9Db250ZW50KG90aGVyID0+IG90aGVyLmtpbmQgPT09ICdwbGFuUmV2aWV3Jyk7XG5cdFx0XHR9XG5cdFx0XHQvLyBDYXB0dXJlIHRoZSB1c2VkIHN0YXRlIGF0IHJlbmRlciB0aW1lLiBgb3RoZXJgIGFuZCBgcmV2aWV3YFxuXHRcdFx0Ly8gYXJlIHR5cGljYWxseSB0aGUgc2FtZSBtdXRhYmxlIG9iamVjdCwgc28gY29tcGFyaW5nXG5cdFx0XHQvLyBgb3RoZXIuaXNVc2VkYCBhZ2FpbnN0IGByZXZpZXcuaXNVc2VkYCB3b3VsZCBhbHdheXMgbWF0Y2guXG5cdFx0XHQvLyBTbmFwc2hvdHRpbmcgaGVyZSBsZXRzIGBoYXNTYW1lQ29udGVudGAgZGV0ZWN0IHRoZVxuXHRcdFx0Ly8gcGVuZGluZyBcdTIxOTIgdXNlZCB0cmFuc2l0aW9uIGFuZCB0cmlnZ2VyIGEgcmUtcmVuZGVyLlxuXHRcdFx0Y29uc3QgcmVuZGVyZWRBc1VzZWQgPSAhIXJldmlldy5pc1VzZWQ7XG5cdFx0XHRjb25zdCBpc1BlbmRpbmcgPSAhcmVuZGVyZWRBc1VzZWQ7XG5cdFx0XHRjb25zdCBjb250ZW50ID0gYnVpbGRQbGFuUmV2aWV3UHJvZ3Jlc3NDb250ZW50KHJldmlldywgbWVzc2FnZSk7XG5cdFx0XHRjb25zdCBwcm9ncmVzc1BhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKFxuXHRcdFx0XHRDaGF0UHJvZ3Jlc3NDb250ZW50UGFydCxcblx0XHRcdFx0eyBjb250ZW50IH0sXG5cdFx0XHRcdHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLFxuXHRcdFx0XHRjb250ZXh0LFxuXHRcdFx0XHQvKiBmb3JjZVNob3dTcGlubmVyICovIGlzUGVuZGluZyxcblx0XHRcdFx0LyogZm9yY2VTaG93TWVzc2FnZSAqLyB0cnVlLFxuXHRcdFx0XHQvKiBpY29uICovIGlzUGVuZGluZyA/IHVuZGVmaW5lZCA6IENvZGljb24uY2hlY2ssXG5cdFx0XHRcdHVuZGVmaW5lZCxcblx0XHRcdFx0Lyogc2hpbW1lciAqLyBpc1BlbmRpbmcsXG5cdFx0XHQpO1xuXHRcdFx0cmV0dXJuIHtcblx0XHRcdFx0ZG9tTm9kZTogcHJvZ3Jlc3NQYXJ0LmRvbU5vZGUsXG5cdFx0XHRcdGRpc3Bvc2U6ICgpID0+IHByb2dyZXNzUGFydC5kaXNwb3NlKCksXG5cdFx0XHRcdGhhc1NhbWVDb250ZW50OiAob3RoZXIsIF9mb2xsb3dpbmdDb250ZW50LCBfZWxlbWVudCkgPT4ge1xuXHRcdFx0XHRcdGlmIChvdGhlci5raW5kICE9PSAncGxhblJldmlldycpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0Ly8gUmUtcmVuZGVyIHdoZW4gdGhlIHVzZWQgc3RhdGUgZmxpcHMgc28gd2UgdHJhbnNpdGlvblxuXHRcdFx0XHRcdC8vIGZyb20gXCJQbGFuIHJldmlldyByZXF1aXJlZFwiIHRvIHRoZSBmaW5hbCBhY3Rpb24gbGFiZWwuXG5cdFx0XHRcdFx0aWYgKCEhcmV2aWV3LmlzVXNlZCAhPT0gcmVuZGVyZWRBc1VzZWQpIHtcblx0XHRcdFx0XHRcdHJldHVybiBmYWxzZTtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdFx0aWYgKHJldmlldy5yZXNvbHZlSWQgJiYgb3RoZXIucmVzb2x2ZUlkKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm4gcmV2aWV3LnJlc29sdmVJZCA9PT0gb3RoZXIucmVzb2x2ZUlkO1xuXHRcdFx0XHRcdH1cblx0XHRcdFx0XHRyZXR1cm4gb3RoZXIgPT09IHJldmlldztcblx0XHRcdFx0fSxcblx0XHRcdH07XG5cdFx0fTtcblxuXHRcdC8vIElmIHRoZSByZXZpZXcgaGFzIGJlZW4gYW5zd2VyZWQgKG9yIHRoZSByZXNwb25zZSBpcyBjb21wbGV0ZSksIHRoZVxuXHRcdC8vIGRvY2tlZCB3aWRnZXQgaXMgZ29uZS4gUmVuZGVyIG9ubHkgdGhlIGZpbmFsIHByb2dyZXNzIGxpbmUuXG5cdFx0aWYgKHJldmlldy5pc1VzZWQpIHtcblx0XHRcdHJldHVybiByZW5kZXJQcm9ncmVzcygpO1xuXHRcdH1cblxuXHRcdC8vIERvY2sgdGhlIGFjdGl2ZSByZXZpZXcgYWJvdmUgdGhlIGNoYXQgaW5wdXQgKG5vdCB3aGlsZSBlZGl0aW5nKS5cblx0XHRjb25zdCBpc0VkaXRpbmcgPSAhIXRoaXMudmlld01vZGVsPy5lZGl0aW5nO1xuXHRcdGNvbnN0IGRvY2tlZFBhcnQgPSBpc0VkaXRpbmcgPyB1bmRlZmluZWQgOiB3aWRnZXQ/LmlucHV0LnJlbmRlclBsYW5SZXZpZXcocmV2aWV3LCBjb250ZXh0LCB7XG5cdFx0XHRvblN1Ym1pdDogaGFuZGxlU3VibWl0LFxuXHRcdH0pO1xuXG5cdFx0Ly8gSWYgd2UgY291bGRuJ3QgZG9jayAobm8gd2lkZ2V0LCBlZGl0aW5nLCBldGMuKSwgZmFsbCBiYWNrIHRvIGlubGluZSByZW5kZXJpbmcuXG5cdFx0aWYgKCFkb2NrZWRQYXJ0KSB7XG5cdFx0XHRjb25zdCBmYWxsYmFja1BhcnQgPSB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXRQbGFuUmV2aWV3UGFydCwgcmV2aWV3LCBjb250ZXh0LCB7XG5cdFx0XHRcdG9uU3VibWl0OiBoYW5kbGVTdWJtaXQsXG5cdFx0XHR9KTtcblx0XHRcdHJldHVybiBmYWxsYmFja1BhcnQ7XG5cdFx0fVxuXG5cdFx0cmV0dXJuIHJlbmRlclByb2dyZXNzKCk7XG5cdH1cblxuXHRwcml2YXRlIGdldFBsYW5SZXZpZXdQcm9ncmVzc01lc3NhZ2UocmV2aWV3OiBJQ2hhdFBsYW5SZXZpZXcpOiBzdHJpbmcgfCB1bmRlZmluZWQge1xuXHRcdGlmICghcmV2aWV3LmlzVXNlZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmVxdWlyZWQnLCBcIlBsYW4gcmV2aWV3IHJlcXVpcmVkXCIpO1xuXHRcdH1cblx0XHRjb25zdCByZXN1bHQgPSByZXZpZXcuZGF0YTtcblx0XHRpZiAoIXJlc3VsdCkge1xuXHRcdFx0cmV0dXJuIHVuZGVmaW5lZDtcblx0XHR9XG5cdFx0aWYgKHJlc3VsdC5yZWplY3RlZCkge1xuXHRcdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcucmVqZWN0ZWQnLCBcIlJlamVjdGVkIHBsYW5cIik7XG5cdFx0fVxuXHRcdGlmIChyZXN1bHQuZmVlZGJhY2spIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmZlZWRiYWNrJywgXCJQcm92aWRlZCBmZWVkYmFja1wiKTtcblx0XHR9XG5cdFx0Y29uc3QgYWN0aW9uID0gcmV2aWV3LmFjdGlvbnMuZmluZChhID0+IGEubGFiZWwgPT09IHJlc3VsdC5hY3Rpb24pO1xuXHRcdGlmIChhY3Rpb24/LnBlcm1pc3Npb25MZXZlbCA9PT0gJ2F1dG9waWxvdCcpIHtcblx0XHRcdHJldHVybiBsb2NhbGl6ZSgnY2hhdC5wbGFuUmV2aWV3LmF1dG9waWxvdCcsIFwiU3RhcnRlZCBpbXBsZW1lbnRhdGlvbiB3aXRoIEF1dG9waWxvdFwiKTtcblx0XHR9XG5cdFx0cmV0dXJuIGxvY2FsaXplKCdjaGF0LnBsYW5SZXZpZXcuYXBwcm92ZWQnLCBcIkFwcHJvdmVkIHBsYW5cIik7XG5cdH1cblxuXHRwcml2YXRlIHJlbW92ZUNhcm91c2VsRnJvbVRyYWNraW5nKGNvbnRleHQ6IElDaGF0Q29udGVudFBhcnRSZW5kZXJDb250ZXh0LCBwYXJ0OiBDaGF0UXVlc3Rpb25DYXJvdXNlbFBhcnQpOiB2b2lkIHtcblx0XHRpZiAoaXNSZXNwb25zZVZNKGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdGNvbnN0IGNhcm91c2VscyA9IHRoaXMucGVuZGluZ1F1ZXN0aW9uQ2Fyb3VzZWxzLmdldChjb250ZXh0LmVsZW1lbnQuc2Vzc2lvblJlc291cmNlKTtcblx0XHRcdGlmIChjYXJvdXNlbHMpIHtcblx0XHRcdFx0Y2Fyb3VzZWxzLmRlbGV0ZShwYXJ0KTtcblx0XHRcdH1cblx0XHR9XG5cdH1cblxuXHRwcml2YXRlIHJlbmRlckNoYW5nZXNTdW1tYXJ5KGNvbnRlbnQ6IElDaGF0Q2hhbmdlc1N1bW1hcnlQYXJ0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBwYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0Q2hlY2twb2ludEZpbGVDaGFuZ2VzU3VtbWFyeUNvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0KTtcblx0XHRyZXR1cm4gcGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyVHVyblBpbGxzKGNvbnRlbnQ6IElDaGF0VHVyblBpbGxzUGFydCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRyZXR1cm4gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VHVyblBpbGxzQ29udGVudFBhcnQsIGNvbnRlbnQsIGNvbnRleHQpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJBdHRhY2htZW50cyh2YXJpYWJsZXM6IHJlYWRvbmx5IElDaGF0UmVxdWVzdFZhcmlhYmxlRW50cnlbXSwgY29udGVudFJlZmVyZW5jZXM6IFJlYWRvbmx5QXJyYXk8SUNoYXRDb250ZW50UmVmZXJlbmNlPiB8IHVuZGVmaW5lZCwgbW9kZWxJZDogc3RyaW5nIHwgdW5kZWZpbmVkLCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgcmVzb2x2ZWRNb2RlbElkPzogc3RyaW5nKSB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEF0dGFjaG1lbnRzQ29udGVudFBhcnQsIHtcblx0XHRcdHZhcmlhYmxlcyxcblx0XHRcdGNvbnRlbnRSZWZlcmVuY2VzLFxuXHRcdFx0bW9kZWxJZCxcblx0XHRcdHJlc29sdmVkTW9kZWxJZCxcblx0XHRcdGRvbU5vZGU6IHVuZGVmaW5lZFxuXHRcdH0pO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJUZXh0RWRpdChjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgY2hhdFRleHRFZGl0OiBJQ2hhdFRleHRFZGl0R3JvdXAsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0Y29uc3QgdGV4dEVkaXRQYXJ0ID0gdGhpcy5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGV4dEVkaXRDb250ZW50UGFydCwgY2hhdFRleHRFZGl0LCBjb250ZXh0LCB0aGlzLnJlbmRlcmVyT3B0aW9ucywgdGhpcy5fZGlmZkVkaXRvclBvb2wsIHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aC5nZXQoKSk7XG5cdFx0cmV0dXJuIHRleHRFZGl0UGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRXh0ZXJuYWxFZGl0KGNvbnRlbnQ6IElDaGF0RXh0ZXJuYWxFZGl0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBlZGl0UGFydCA9IHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdEV4dGVybmFsRWRpdENvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0KTtcblxuXHRcdC8vIFBpbiB0aGUgcGlsbCBpbnRvIHRoZSBzdXJyb3VuZGluZyB0aGlua2luZyBwYXJ0IHNvIGRpZmYgc3RhdHMgYnViYmxlXG5cdFx0Ly8gdXAgaW50byB0aGUgdGhpbmtpbmcgdGl0bGUuIFRoZSBsaXN0IHJlbmRlcmVyIHBpbm5pbmcgbG9naWMgYWJvdmVcblx0XHQvLyBhbHJlYWR5IHJvdXRlcyBleHRlcm5hbEVkaXQga2luZHMgdGhyb3VnaCB0aGlzIHBhdGguXG5cdFx0Y29uc3QgY29sbGFwc2VkVG9vbHNNb2RlID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJyk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbGxhcHNlZFRvb2xzTW9kZSAhPT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5PZmYgJiYgdGhpcy5zaG91bGRQaW5QYXJ0KGNvbnRlbnQsIGNvbnRleHQuZWxlbWVudCkpIHtcblx0XHRcdC8vIFN0YWJsZSBpZCBwZXIgcGFydCBzbyB0aGUgdGhpbmtpbmcgcGFydCBjYW4gZGVkdXAgaWYgaXQgc2VlcyB1cyB0d2ljZS5cblx0XHRcdGNvbnN0IHBhcnRJZCA9IGBleHRlcm5hbEVkaXQtJHtjb250ZW50LnVyaS50b1N0cmluZygpfS0ke2NvbnRlbnQudW5kb1N0b3BJZCA/PyAnJ31gO1xuXHRcdFx0Y29uc3QgeyBwYXJ0OiBsYXN0VGhpbmtpbmcsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcgfSA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydEZvckdyb3VwZWRJdGVtKGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRpZiAoIWxhc3RUaGlua2luZyAmJiBzaG91bGRDcmVhdGVHcm91cGVkVGhpbmtpbmdQYXJ0KGNvbGxhcHNlZFRvb2xzTW9kZSwgc2VwYXJhdGVkRnJvbVJlYXNvbmluZykpIHtcblx0XHRcdFx0Y29uc3QgdGhpbmtpbmdQYXJ0ID0gdGhpcy5yZW5kZXJUaGlua2luZ1BhcnQoeyBraW5kOiAndGhpbmtpbmcnIH0sIGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdGlmICh0aGlua2luZ1BhcnQgaW5zdGFuY2VvZiBDaGF0VGhpbmtpbmdDb250ZW50UGFydCkge1xuXHRcdFx0XHRcdC8vIE5ldyB0aGlua2luZyBwYXJ0IG93bnMgdGhlIGVkaXQgcGlsbCB2aWEgZWFnZXJEaXNwb3NhYmxlLlxuXHRcdFx0XHRcdC8vIFdlIHJldHVybiB0aGUgdGhpbmtpbmcgcGFydCAobm90IGVkaXRQYXJ0KSBzbyByZW5kZXJlZFBhcnRzXG5cdFx0XHRcdFx0Ly8gc3RvcmVzIHRoZSB0aGlua2luZyBwYXJ0IFx1MjAxNCBubyBkb3VibGUgb3duZXJzaGlwLlxuXHRcdFx0XHRcdHRoaW5raW5nUGFydC5hcHBlbmRJdGVtKFxuXHRcdFx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogZWRpdFBhcnQuZG9tTm9kZSwgZGlzcG9zYWJsZTogZWRpdFBhcnQgfSksXG5cdFx0XHRcdFx0XHRwYXJ0SWQsXG5cdFx0XHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRcdFx0dGVtcGxhdGVEYXRhLnZhbHVlLFxuXHRcdFx0XHRcdFx0ZWRpdFBhcnQub25EaWRDaGFuZ2VEaWZmLFxuXHRcdFx0XHRcdFx0ZWRpdFBhcnQsXG5cdFx0XHRcdFx0KTtcblx0XHRcdFx0fVxuXHRcdFx0XHRyZXR1cm4gdGhpbmtpbmdQYXJ0O1xuXHRcdFx0fVxuXHRcdFx0aWYgKGxhc3RUaGlua2luZykge1xuXHRcdFx0XHQvLyBUaGlua2luZyBwYXJ0IHRha2VzIG93bmVyc2hpcCB2aWEgZWFnZXJEaXNwb3NhYmxlOyB3ZSByZXR1cm5cblx0XHRcdFx0Ly8gYSBuby1jb250ZW50IHNoaW0gc28gcmVuZGVyZWRQYXJ0cyBkb2VzIG5vdCBhbHNvIG93biBlZGl0UGFydFxuXHRcdFx0XHQvLyAodGhhdCB3b3VsZCBkb3VibGUtZGlzcG9zZSkuXG5cdFx0XHRcdGxhc3RUaGlua2luZy5hcHBlbmRJdGVtKFxuXHRcdFx0XHRcdCgpID0+ICh7IGRvbU5vZGU6IGVkaXRQYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IGVkaXRQYXJ0IH0pLFxuXHRcdFx0XHRcdHBhcnRJZCxcblx0XHRcdFx0XHRjb250ZW50LFxuXHRcdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZSxcblx0XHRcdFx0XHRlZGl0UGFydC5vbkRpZENoYW5nZURpZmYsXG5cdFx0XHRcdFx0ZWRpdFBhcnQsXG5cdFx0XHRcdCk7XG5cdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBvdGhlci5raW5kID09PSBjb250ZW50LmtpbmQpO1xuXHRcdFx0fVxuXHRcdH1cblxuXHRcdHJldHVybiBlZGl0UGFydDtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyTWFya2Rvd24obWFya2Rvd246IElDaGF0TWFya2Rvd25Db250ZW50LCB0ZW1wbGF0ZURhdGE6IElDaGF0TGlzdEl0ZW1UZW1wbGF0ZSwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHRjb25zdCBlbGVtZW50ID0gY29udGV4dC5lbGVtZW50O1xuXHRcdGNvbnN0IGlzQmxhbmtNYXJrZG93biA9ICFtYXJrZG93bi5jb250ZW50LnZhbHVlLnRyaW0oKTtcblx0XHQvLyBEb24ndCBmaW5hbGl6ZSB0aGlua2luZyBpZiB0aGUgbWFya2Rvd24gaGFzIGFuIGluY29tcGxldGUgY29kZWJsb2NrIHdpdGggYVxuXHRcdC8vIHZzY29kZV9jb2RlYmxvY2tfdXJpIHRhZyBcdTIwMTQgdGhlIGlzRWRpdCBhbm5vdGF0aW9uIG1heSBub3QgaGF2ZSBhcnJpdmVkIHlldC5cblx0XHQvLyBPbmx5IGNoZWNrIGNvZGVibG9ja3MgdGhhdCBjb250YWluIGEgVVJJIHRhZyB0byBhdm9pZCBjYXRjaGluZyByZWd1bGFyIG5vbi1lZGl0IGNvZGVibG9ja3MuXG5cdFx0Y29uc3QgaGFzUGVuZGluZ0VkaXRDb2RlYmxvY2sgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgIWVsZW1lbnQuaXNDb21wbGV0ZVxuXHRcdFx0JiYgaGFzQ29kZWJsb2NrVXJpVGFnKG1hcmtkb3duLmNvbnRlbnQudmFsdWUpXG5cdFx0XHQmJiAhY29kZWJsb2NrSGFzQ2xvc2luZ0JhY2t0aWNrcyhtYXJrZG93bi5jb250ZW50LnZhbHVlKTtcblx0XHRpZiAoIXRoaXMuaGFzRWRpdENvZGVibG9ja1VyaShtYXJrZG93bikgJiYgIWlzQmxhbmtNYXJrZG93biAmJiAhaGFzUGVuZGluZ0VkaXRDb2RlYmxvY2spIHtcblx0XHRcdHRoaXMuZmluYWxpemVDdXJyZW50VGhpbmtpbmdQYXJ0KGNvbnRleHQsIHRlbXBsYXRlRGF0YSk7XG5cdFx0fVxuXHRcdGNvbnN0IGZpbGxJbkluY29tcGxldGVUb2tlbnMgPSBpc1Jlc3BvbnNlVk0oZWxlbWVudCkgJiYgKCFlbGVtZW50LmlzQ29tcGxldGUgfHwgZWxlbWVudC5pc0NhbmNlbGVkIHx8IGVsZW1lbnQuZXJyb3JEZXRhaWxzPy5yZXNwb25zZUlzRmlsdGVyZWQgfHwgZWxlbWVudC5lcnJvckRldGFpbHM/LnJlc3BvbnNlSXNJbmNvbXBsZXRlIHx8ICEhZWxlbWVudC5yZW5kZXJEYXRhKTtcblx0XHRjb25zdCBjb2RlQmxvY2tTdGFydEluZGV4ID0gY29udGV4dC5jb2RlQmxvY2tTdGFydEluZGV4O1xuXHRcdGNvbnN0IG1hcmtkb3duUGFydCA9IHRlbXBsYXRlRGF0YS5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0TWFya2Rvd25Db250ZW50UGFydCwgbWFya2Rvd24sIGNvbnRleHQsIHRoaXMuX2VkaXRvclBvb2wsIGZpbGxJbkluY29tcGxldGVUb2tlbnMsIGNvZGVCbG9ja1N0YXJ0SW5kZXgsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCB1bmRlZmluZWQsIHRoaXMuX2N1cnJlbnRMYXlvdXRXaWR0aC5nZXQoKSwgeyBjb2RlQmxvY2tSZW5kZXJPcHRpb25zOiB0aGlzLnJlbmRlcmVyT3B0aW9ucy5jb2RlQmxvY2tSZW5kZXJPcHRpb25zIH0pO1xuXHRcdG1hcmtkb3duUGFydC5hZGREaXNwb3NhYmxlKG1hcmtkb3duUGFydC5vbkRpZENoYW5nZUhlaWdodCgoKSA9PiB0aGlzLmZpcmVJdGVtSGVpZ2h0Q2hhbmdlKHRlbXBsYXRlRGF0YSkpKTtcblx0XHRpZiAoaXNSZXF1ZXN0Vk0oZWxlbWVudCkpIHtcblx0XHRcdG1hcmtkb3duUGFydC5kb21Ob2RlLnRhYkluZGV4ID0gMDtcblx0XHRcdGlmICh0aGlzLmNvbmZpZ1NlcnZpY2UuZ2V0VmFsdWU8c3RyaW5nPignY2hhdC5lZGl0UmVxdWVzdHMnKSA9PT0gJ2lubGluZScgJiYgdGhpcy5yZW5kZXJlck9wdGlvbnMuZWRpdGFibGUpIHtcblx0XHRcdFx0bWFya2Rvd25QYXJ0LmRvbU5vZGUuY2xhc3NMaXN0LmFkZCgnY2xpY2thYmxlJyk7XG5cdFx0XHRcdG1hcmtkb3duUGFydC5hZGREaXNwb3NhYmxlKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFya2Rvd25QYXJ0LmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuQ0xJQ0ssIChlOiBNb3VzZUV2ZW50KSA9PiB7XG5cdFx0XHRcdFx0aWYgKHRoaXMudmlld01vZGVsPy5lZGl0aW5nPy5pZCA9PT0gZWxlbWVudC5pZCkge1xuXHRcdFx0XHRcdFx0cmV0dXJuO1xuXHRcdFx0XHRcdH1cblxuXHRcdFx0XHRcdC8vIERvbid0IGhhbmRsZSBjbGlja3Mgb24gbGlua3Ncblx0XHRcdFx0XHRjb25zdCBjbGlja2VkRWxlbWVudCA9IGUudGFyZ2V0IGFzIEhUTUxFbGVtZW50O1xuXHRcdFx0XHRcdGlmIChjbGlja2VkRWxlbWVudC50YWdOYW1lID09PSAnQScpIHtcblx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHQvLyBEb24ndCBoYW5kbGUgaWYgdGhlcmUncyBhIHRleHQgc2VsZWN0aW9uIGluIHRoZSB3aW5kb3dcblx0XHRcdFx0XHRjb25zdCBzZWxlY3Rpb24gPSBkb20uZ2V0V2luZG93KHRlbXBsYXRlRGF0YS5yb3dDb250YWluZXIpLmdldFNlbGVjdGlvbigpO1xuXHRcdFx0XHRcdGlmIChzZWxlY3Rpb24gJiYgIXNlbGVjdGlvbi5pc0NvbGxhcHNlZCAmJiBzZWxlY3Rpb24udG9TdHJpbmcoKS5sZW5ndGggPiAwKSB7XG5cdFx0XHRcdFx0XHRyZXR1cm47XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0Ly8gRG9uJ3QgaGFuZGxlIGlmIHRoZXJlJ3MgYSBzZWxlY3Rpb24gaW4gY29kZSBibG9ja1xuXHRcdFx0XHRcdGNvbnN0IG1vbmFjb0VkaXRvciA9IGRvbS5maW5kUGFyZW50V2l0aENsYXNzKGNsaWNrZWRFbGVtZW50LCAnbW9uYWNvLWVkaXRvcicpO1xuXHRcdFx0XHRcdGlmIChtb25hY29FZGl0b3IpIHtcblx0XHRcdFx0XHRcdGNvbnN0IGVkaXRvclBhcnQgPSBBcnJheS5mcm9tKHRoaXMuZWRpdG9yc0luVXNlKCkpLmZpbmQoZWRpdG9yID0+XG5cdFx0XHRcdFx0XHRcdGVkaXRvci5lbGVtZW50LmNvbnRhaW5zKG1vbmFjb0VkaXRvcikpO1xuXG5cdFx0XHRcdFx0XHRpZiAoZWRpdG9yUGFydD8uZWRpdG9yLmdldFNlbGVjdGlvbigpPy5pc0VtcHR5KCkgPT09IGZhbHNlKSB7XG5cdFx0XHRcdFx0XHRcdHJldHVybjtcblx0XHRcdFx0XHRcdH1cblx0XHRcdFx0XHR9XG5cblx0XHRcdFx0XHRlLnByZXZlbnREZWZhdWx0KCk7XG5cdFx0XHRcdFx0ZS5zdG9wUHJvcGFnYXRpb24oKTtcblx0XHRcdFx0XHR0aGlzLl9vbkRpZENsaWNrUmVxdWVzdC5maXJlKHRlbXBsYXRlRGF0YSk7XG5cdFx0XHRcdH0pKTtcblx0XHRcdFx0bWFya2Rvd25QYXJ0LmFkZERpc3Bvc2FibGUodGhpcy5ob3ZlclNlcnZpY2Uuc2V0dXBNYW5hZ2VkSG92ZXIoZ2V0RGVmYXVsdEhvdmVyRGVsZWdhdGUoJ2VsZW1lbnQnKSwgbWFya2Rvd25QYXJ0LmRvbU5vZGUsIGxvY2FsaXplKCdyZXF1ZXN0TWFya2Rvd25QYXJ0VGl0bGUnLCBcIkNsaWNrIHRvIEVkaXRcIiksIHsgdHJhcEZvY3VzOiB0cnVlIH0pKTtcblx0XHRcdH1cblx0XHRcdG1hcmtkb3duUGFydC5hZGREaXNwb3NhYmxlKGRvbS5hZGREaXNwb3NhYmxlTGlzdGVuZXIobWFya2Rvd25QYXJ0LmRvbU5vZGUsIGRvbS5FdmVudFR5cGUuRk9DVVMsICgpID0+IHtcblx0XHRcdFx0dGhpcy5ob3ZlclZpc2libGUodGVtcGxhdGVEYXRhLnJlcXVlc3RIb3Zlcik7XG5cdFx0XHR9KSk7XG5cdFx0XHRtYXJrZG93blBhcnQuYWRkRGlzcG9zYWJsZShkb20uYWRkRGlzcG9zYWJsZUxpc3RlbmVyKG1hcmtkb3duUGFydC5kb21Ob2RlLCBkb20uRXZlbnRUeXBlLkJMVVIsICgpID0+IHtcblx0XHRcdFx0dGhpcy5ob3ZlckhpZGRlbih0ZW1wbGF0ZURhdGEucmVxdWVzdEhvdmVyKTtcblx0XHRcdH0pKTtcblx0XHR9XG5cblx0XHR0aGlzLmhhbmRsZVJlbmRlcmVkQ29kZWJsb2NrcyhlbGVtZW50LCBtYXJrZG93blBhcnQsIGNvZGVCbG9ja1N0YXJ0SW5kZXgpO1xuXG5cdFx0Y29uc3QgY29sbGFwc2VkVG9vbHNNb2RlID0gdGhpcy5jb25maWdTZXJ2aWNlLmdldFZhbHVlPENvbGxhcHNlZFRvb2xzRGlzcGxheU1vZGU+KCdjaGF0LmFnZW50LnRoaW5raW5nLmNvbGxhcHNlZFRvb2xzJyk7XG5cdFx0aWYgKGlzUmVzcG9uc2VWTShjb250ZXh0LmVsZW1lbnQpICYmIGNvbGxhcHNlZFRvb2xzTW9kZSAhPT0gQ29sbGFwc2VkVG9vbHNEaXNwbGF5TW9kZS5PZmYpIHtcblxuXHRcdFx0Ly8gYXBwZW5kIHRvIHRoaW5raW5nIHBhcnQgd2hlbiB0aGUgY29kZWJsb2NrIGlzIGNvbXBsZXRlXG5cdFx0XHRjb25zdCBpc0NvbXBsZXRlID0gdGhpcy5pc0NvZGVibG9ja0NvbXBsZXRlKG1hcmtkb3duLCBjb250ZXh0LmVsZW1lbnQpO1xuXG5cdFx0XHQvLyBDaGVjayBpZiB0aGlzIG1hcmtkb3duIHNob3VsZCBiZSByb3V0ZWQgdG8gYSBzdWJhZ2VudCBjb250ZW50IHBhcnRcblx0XHRcdGNvbnN0IHN1YkFnZW50SW52b2NhdGlvbklkID0gZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQobWFya2Rvd24uY29udGVudC52YWx1ZSk7XG5cdFx0XHRpZiAoc3ViQWdlbnRJbnZvY2F0aW9uSWQpIHtcblx0XHRcdFx0Y29uc3Qgc3ViYWdlbnRQYXJ0ID0gdGhpcy5nZXRTdWJhZ2VudFBhcnQodGVtcGxhdGVEYXRhLnJlbmRlcmVkUGFydHMsIHN1YkFnZW50SW52b2NhdGlvbklkKTtcblx0XHRcdFx0aWYgKHN1YmFnZW50UGFydCAmJiBtYXJrZG93blBhcnQ/LmRvbU5vZGUgJiYgaXNDb21wbGV0ZSkge1xuXHRcdFx0XHRcdHN1YmFnZW50UGFydC5hcHBlbmRNYXJrZG93bkl0ZW0oXG5cdFx0XHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBtYXJrZG93blBhcnQuZG9tTm9kZSwgZGlzcG9zYWJsZTogbWFya2Rvd25QYXJ0IH0pLFxuXHRcdFx0XHRcdFx0bWFya2Rvd25QYXJ0LmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRtYXJrZG93bixcblx0XHRcdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZSxcblx0XHRcdFx0XHRcdG1hcmtkb3duUGFydCxcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHRcdHJldHVybiB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PlxuXHRcdFx0XHRcdFx0b3RoZXIua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCdcblx0XHRcdFx0XHRcdCYmIG90aGVyLmNvbnRlbnQudmFsdWUgPT09IG1hcmtkb3duLmNvbnRlbnQudmFsdWVcblx0XHRcdFx0XHRcdCYmIGV4dHJhY3RTdWJBZ2VudEludm9jYXRpb25JZEZyb21UZXh0KG90aGVyLmNvbnRlbnQudmFsdWUpID09PSBzdWJBZ2VudEludm9jYXRpb25JZCk7XG5cdFx0XHRcdH1cblx0XHRcdH1cblxuXHRcdFx0Y29uc3Qgc2hvdWxkUGluID0gdGhpcy5zaG91bGRQaW5QYXJ0KG1hcmtkb3duLCBjb250ZXh0LmVsZW1lbnQpO1xuXHRcdFx0aWYgKG1hcmtkb3duUGFydD8uZG9tTm9kZSAmJiBzaG91bGRQaW4gJiYgaXNDb21wbGV0ZSkge1xuXHRcdFx0XHQvLyBjcmVhdGUgdGhpbmtpbmcgcGFydCBpZiBpdCBkb2Vzbid0IGV4aXN0IHlldFxuXHRcdFx0XHRjb25zdCB7IHBhcnQ6IGxhc3RUaGlua2luZywgc2VwYXJhdGVkRnJvbVJlYXNvbmluZyB9ID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0Rm9yR3JvdXBlZEl0ZW0oY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdFx0aWYgKCFsYXN0VGhpbmtpbmcgJiYgc2hvdWxkQ3JlYXRlR3JvdXBlZFRoaW5raW5nUGFydChjb2xsYXBzZWRUb29sc01vZGUsIHNlcGFyYXRlZEZyb21SZWFzb25pbmcpKSB7XG5cdFx0XHRcdFx0Y29uc3QgdGhpbmtpbmdQYXJ0ID0gdGhpcy5yZW5kZXJUaGlua2luZ1BhcnQoe1xuXHRcdFx0XHRcdFx0a2luZDogJ3RoaW5raW5nJyxcblx0XHRcdFx0XHR9LCBjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXG5cdFx0XHRcdFx0aWYgKHRoaW5raW5nUGFydCBpbnN0YW5jZW9mIENoYXRUaGlua2luZ0NvbnRlbnRQYXJ0KSB7XG5cdFx0XHRcdFx0XHQvLyBGYWN0b3J5IHdyYXBwaW5nIGFscmVhZHktY3JlYXRlZCBtYXJrZG93biBwYXJ0XG5cdFx0XHRcdFx0XHR0aGlua2luZ1BhcnQuYXBwZW5kSXRlbShcblx0XHRcdFx0XHRcdFx0KCkgPT4gKHsgZG9tTm9kZTogbWFya2Rvd25QYXJ0LmRvbU5vZGUsIGRpc3Bvc2FibGU6IG1hcmtkb3duUGFydCB9KSxcblx0XHRcdFx0XHRcdFx0bWFya2Rvd25QYXJ0LmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duLFxuXHRcdFx0XHRcdFx0XHR0ZW1wbGF0ZURhdGEudmFsdWUsXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duUGFydC5vbkRpZENoYW5nZURpZmYsXG5cdFx0XHRcdFx0XHRcdG1hcmtkb3duUGFydCxcblx0XHRcdFx0XHRcdCk7XG5cdFx0XHRcdFx0fVxuXG5cdFx0XHRcdFx0cmV0dXJuIHRoaW5raW5nUGFydDtcblx0XHRcdFx0fVxuXG5cdFx0XHRcdGlmIChsYXN0VGhpbmtpbmcpIHtcblx0XHRcdFx0XHQvLyBGYWN0b3J5IHdyYXBwaW5nIGFscmVhZHktY3JlYXRlZCBtYXJrZG93biBwYXJ0LlxuXHRcdFx0XHRcdC8vIE5vIGVhZ2VyRGlzcG9zYWJsZSBuZWVkZWQgaGVyZSBiZWNhdXNlIHRoZSBtYXJrZG93blBhcnQgaXMgcmV0dXJuZWRcblx0XHRcdFx0XHQvLyBmcm9tIHRoaXMgbWV0aG9kIGFuZCB0cmFja2VkIGRpcmVjdGx5IGluIHJlbmRlcmVkUGFydHMsIHNvIGl0IHdpbGxcblx0XHRcdFx0XHQvLyBiZSBkaXNwb3NlZCBieSBjbGVhclJlbmRlcmVkUGFydHMuXG5cdFx0XHRcdFx0bGFzdFRoaW5raW5nLmFwcGVuZEl0ZW0oXG5cdFx0XHRcdFx0XHQoKSA9PiAoeyBkb21Ob2RlOiBtYXJrZG93blBhcnQuZG9tTm9kZSwgZGlzcG9zYWJsZTogbWFya2Rvd25QYXJ0IH0pLFxuXHRcdFx0XHRcdFx0bWFya2Rvd25QYXJ0LmNvZGVibG9ja3NQYXJ0SWQsXG5cdFx0XHRcdFx0XHRtYXJrZG93bixcblx0XHRcdFx0XHRcdHRlbXBsYXRlRGF0YS52YWx1ZSxcblx0XHRcdFx0XHRcdG1hcmtkb3duUGFydC5vbkRpZENoYW5nZURpZmZcblx0XHRcdFx0XHQpO1xuXHRcdFx0XHR9XG5cdFx0XHR9IGVsc2UgaWYgKCFzaG91bGRQaW4gJiYgIWlzQmxhbmtNYXJrZG93biAmJiAhaGFzUGVuZGluZ0VkaXRDb2RlYmxvY2spIHtcblx0XHRcdFx0dGhpcy5maW5hbGl6ZUN1cnJlbnRUaGlua2luZ1BhcnQoY29udGV4dCwgdGVtcGxhdGVEYXRhKTtcblx0XHRcdH1cblx0XHR9XG5cblx0XHRyZXR1cm4gbWFya2Rvd25QYXJ0O1xuXHR9XG5cblx0cmVuZGVyVGhpbmtpbmdQYXJ0KGNvbnRlbnQ6IElDaGF0VGhpbmtpbmdQYXJ0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCwgdGVtcGxhdGVEYXRhOiBJQ2hhdExpc3RJdGVtVGVtcGxhdGUpOiBJQ2hhdENvbnRlbnRQYXJ0IHtcblx0XHQvLyBUT0RPIEBqdXN0c2NoZW4gQGthcnRoaWtuYWRpZzogcmVtb3ZlIHRoaXMgd2hlbiBPU1dFIG1vdmVzIG9mZiBjb21tZW50YXJ5IGNoYW5uZWxcblx0XHRpZiAoIWNvbnRlbnQuaWQpIHtcblx0XHRcdGNvbnRlbnQuaWQgPSBEYXRlLm5vdygpLnRvU3RyaW5nKCk7XG5cdFx0fVxuXG5cdFx0Ly8gRGV0ZXJtaW5lIGlmIHRoaXMgdGhpbmtpbmcgcGFydCBpcyBhbHJlYWR5IGNvbXBsZXRlIGJhc2VkIG9uIGxvb2stYWhlYWRcblx0XHQvLyAoaS5lLiwgdGhlcmUgYXJlIHN1YnNlcXVlbnQgcGFydHMgdGhhdCB3b24ndCBiZSBwaW5uZWQgdG8gdGhpcyB0aGlua2luZyBwYXJ0KVxuXHRcdGNvbnN0IGVsZW1lbnQgPSBpc1Jlc3BvbnNlVk0oY29udGV4dC5lbGVtZW50KSA/IGNvbnRleHQuZWxlbWVudCA6IHVuZGVmaW5lZDtcblx0XHRjb25zdCBzdHJlYW1pbmdDb21wbGV0ZWQgPSB0aGlzLmlzVGhpbmtpbmdMb29rQWhlYWRDb21wbGV0ZShjb250ZXh0LCBlbGVtZW50KTtcblx0XHRjb25zdCBsYXN0VGhpbmtpbmdQYXJ0ID0gdGhpcy5nZXRMYXN0VGhpbmtpbmdQYXJ0KHRlbXBsYXRlRGF0YS5yZW5kZXJlZFBhcnRzKTtcblx0XHRpZiAobGFzdFRoaW5raW5nUGFydD8uaGFzR3JvdXBlZEl0ZW1zKCkgJiYgc2hvdWxkU3RhcnROZXdDb2xsYXBzZWRUaGlua2luZ0dyb3VwKGdldEVmZmVjdGl2ZVRoaW5raW5nRGlzcGxheU1vZGUodGhpcy5jb25maWdTZXJ2aWNlLCB0aGlzLmNvbnRleHRLZXlTZXJ2aWNlKSwgJ2l0ZW1zJywgJ3JlYXNvbmluZycpKSB7XG5cdFx0XHR0aGlzLmZpbmFsaXplQ3VycmVudFRoaW5raW5nUGFydChjb250ZXh0LCB0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdC8vIGlmIGFycmF5LCB3ZSBkbyBhIG5haXZlIHBhcnQgYnkgcGFydCByZW5kZXJpbmcgZm9yIG5vd1xuXHRcdGlmIChBcnJheS5pc0FycmF5KGNvbnRlbnQudmFsdWUpKSB7XG5cdFx0XHRpZiAoY29udGVudC52YWx1ZS5sZW5ndGggPCAxKSB7XG5cdFx0XHRcdGNvbnN0IGxhc3RUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0XHRcdGxhc3RUaGlua2luZz8uZmluYWxpemVUaXRsZUlmRGVmYXVsdCgpO1xuXHRcdFx0XHRyZXR1cm4gdGhpcy5yZW5kZXJOb0NvbnRlbnQob3RoZXIgPT4gY29udGVudC5raW5kID09PSBvdGhlci5raW5kKTtcblx0XHRcdH1cblx0XHRcdGxldCBsYXN0UGFydDogSUNoYXRDb250ZW50UGFydCB8IHVuZGVmaW5lZDtcblx0XHRcdGZvciAoY29uc3QgaXRlbSBvZiBjb250ZW50LnZhbHVlKSB7XG5cdFx0XHRcdGlmIChpdGVtKSB7XG5cdFx0XHRcdFx0Y29uc3QgbGFzdFRoaW5raW5nUGFydCA9IGxhc3RQYXJ0IGluc3RhbmNlb2YgQ2hhdFRoaW5raW5nQ29udGVudFBhcnQgJiYgbGFzdFBhcnQuZ2V0SXNBY3RpdmUoKSA/IGxhc3RQYXJ0IDogdW5kZWZpbmVkO1xuXHRcdFx0XHRcdGlmIChsYXN0VGhpbmtpbmdQYXJ0KSB7XG5cdFx0XHRcdFx0XHRsYXN0VGhpbmtpbmdQYXJ0LnNldHVwVGhpbmtpbmdDb250YWluZXIoeyAuLi5jb250ZW50LCB2YWx1ZTogaXRlbSB9KTtcblx0XHRcdFx0XHR9IGVsc2Uge1xuXHRcdFx0XHRcdFx0Y29uc3QgaXRlbUNvbnRlbnQgPSB7IC4uLmNvbnRlbnQsIHZhbHVlOiBpdGVtIH07XG5cdFx0XHRcdFx0XHRjb25zdCBpdGVtUGFydCA9IHRlbXBsYXRlRGF0YS5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGhpbmtpbmdDb250ZW50UGFydCwgaXRlbUNvbnRlbnQsIGNvbnRleHQsIHRoaXMuY2hhdENvbnRlbnRNYXJrZG93blJlbmRlcmVyLCBzdHJlYW1pbmdDb21wbGV0ZWQpO1xuXHRcdFx0XHRcdFx0bGFzdFBhcnQgPSBpdGVtUGFydDtcblx0XHRcdFx0XHR9XG5cdFx0XHRcdH1cblx0XHRcdH1cblx0XHRcdHJldHVybiBsYXN0UGFydCA/PyB0aGlzLnJlbmRlck5vQ29udGVudChvdGhlciA9PiBjb250ZW50LmtpbmQgPT09IG90aGVyLmtpbmQpO1xuXHRcdFx0Ly8gbm9uLWFycmF5LCBoYW5kbGUgY2FzZSB3aGVyZSB3ZSBhcmUgY3VycmVudGx5IHRoaW5raW5nIHZzLiBzdGFydGluZyBhIG5ldyB0aGlua2luZyBwYXJ0XG5cdFx0fSBlbHNlIHtcblx0XHRcdGNvbnN0IGxhc3RBY3RpdmVUaGlua2luZyA9IHRoaXMuZ2V0TGFzdFRoaW5raW5nUGFydCh0ZW1wbGF0ZURhdGEucmVuZGVyZWRQYXJ0cyk7XG5cdFx0XHRpZiAobGFzdEFjdGl2ZVRoaW5raW5nKSB7XG5cdFx0XHRcdGxhc3RBY3RpdmVUaGlua2luZy5zZXR1cFRoaW5raW5nQ29udGFpbmVyKGNvbnRlbnQpO1xuXHRcdFx0XHRyZXR1cm4gbGFzdEFjdGl2ZVRoaW5raW5nO1xuXHRcdFx0fSBlbHNlIHtcblx0XHRcdFx0Y29uc3QgcGFydCA9IHRlbXBsYXRlRGF0YS5pbnN0YW50aWF0aW9uU2VydmljZS5jcmVhdGVJbnN0YW5jZShDaGF0VGhpbmtpbmdDb250ZW50UGFydCwgY29udGVudCwgY29udGV4dCwgdGhpcy5jaGF0Q29udGVudE1hcmtkb3duUmVuZGVyZXIsIHN0cmVhbWluZ0NvbXBsZXRlZCk7XG5cdFx0XHRcdHJldHVybiBwYXJ0O1xuXHRcdFx0fVxuXG5cdFx0fVxuXHR9XG5cblx0ZGlzcG9zZUVsZW1lbnQobm9kZTogSVRyZWVOb2RlPENoYXRUcmVlSXRlbSwgRnV6enlTY29yZT4sIGluZGV4OiBudW1iZXIsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlLCBkZXRhaWxzPzogSUxpc3RFbGVtZW50UmVuZGVyRGV0YWlscyk6IHZvaWQge1xuXHRcdHRoaXMudHJhY2VMYXlvdXQoJ2Rpc3Bvc2VFbGVtZW50JywgYERpc3Bvc2luZyBlbGVtZW50LCBpbmRleD0ke2luZGV4fWApO1xuXHRcdHRlbXBsYXRlRGF0YS5lbGVtZW50RGlzcG9zYWJsZXMuY2xlYXIoKTtcblxuXHRcdGlmICh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQgJiYgIXRoaXMudmlld01vZGVsPy5lZGl0aW5nKSB7XG5cdFx0XHR0aGlzLnRlbXBsYXRlRGF0YUJ5UmVxdWVzdElkLmRlbGV0ZSh0ZW1wbGF0ZURhdGEuY3VycmVudEVsZW1lbnQuaWQpO1xuXHRcdH1cblxuXHRcdC8vIFRoZXNlIG1hcHMgYXJlIG9ubHkgcmVhZCBmb3IgdGhlIGZvY3VzZWQgcmVzcG9uc2Ugd2hpY2ggaXMgYWx3YXlzIHZpc2libGUsXG5cdFx0Ly8gc28gd2UgY2FuIGNsZWFuIHVwIGVudHJpZXMgZm9yIGVsZW1lbnRzIHRoYXQgbGVhdmUgdGhlIHZpZXdwb3J0LlxuXHRcdGNvbnN0IGNvZGVCbG9ja3MgPSB0aGlzLmNvZGVCbG9ja3NCeVJlc3BvbnNlSWQuZ2V0KG5vZGUuZWxlbWVudC5pZCk7XG5cdFx0aWYgKGNvZGVCbG9ja3MpIHtcblx0XHRcdGZvciAoY29uc3QgaW5mbyBvZiBjb2RlQmxvY2tzKSB7XG5cdFx0XHRcdGlmIChpbmZvPy51cmkpIHtcblx0XHRcdFx0XHR0aGlzLmNvZGVCbG9ja3NCeUVkaXRvclVyaS5kZWxldGUoaW5mby51cmkpO1xuXHRcdFx0XHR9XG5cdFx0XHR9XG5cdFx0XHR0aGlzLmNvZGVCbG9ja3NCeVJlc3BvbnNlSWQuZGVsZXRlKG5vZGUuZWxlbWVudC5pZCk7XG5cdFx0fVxuXHRcdHRoaXMuZmlsZVRyZWVzQnlSZXNwb25zZUlkLmRlbGV0ZShub2RlLmVsZW1lbnQuaWQpO1xuXHRcdHRoaXMuZm9jdXNlZEZpbGVUcmVlc0J5UmVzcG9uc2VJZC5kZWxldGUobm9kZS5lbGVtZW50LmlkKTtcblxuXHRcdGlmIChpc1JlcXVlc3RWTShub2RlLmVsZW1lbnQpICYmIG5vZGUuZWxlbWVudC5pZCA9PT0gdGhpcy52aWV3TW9kZWw/LmVkaXRpbmc/LmlkICYmIGRldGFpbHM/Lm9uU2Nyb2xsKSB7XG5cdFx0XHR0aGlzLl9vbkRpZERpc3Bvc2UuZmlyZSh0ZW1wbGF0ZURhdGEpO1xuXHRcdH1cblxuXHRcdC8vIERvbid0IHJldGFpbiB0aGUgdG9vbGJhciBjb250ZXh0IHdoaWNoIGluY2x1ZGVzIGNoYXQgdmlld21vZGVsc1xuXHRcdGlmICh0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyKSB7XG5cdFx0XHR0ZW1wbGF0ZURhdGEudGl0bGVUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0fVxuXHRcdHRlbXBsYXRlRGF0YS5mb290ZXJUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRUb29sYmFyLmNvbnRleHQgPSB1bmRlZmluZWQ7XG5cdFx0dGVtcGxhdGVEYXRhLmNoZWNrcG9pbnRSZXN0b3JlVG9vbGJhci5jb250ZXh0ID0gdW5kZWZpbmVkO1xuXHRcdC8vIFRoZSBmb290ZXIgaG92ZXIgaXMgdGVtcGxhdGUtc2NvcGVkLCBzbyBpdCBvdXRsaXZlcyB0aGUgZWxlbWVudCB1bmxlc3Ncblx0XHQvLyByZWxlYXNlZCBoZXJlOyBhIHZpcnR1YWxpemVkIHJvdyB3b3VsZCBvdGhlcndpc2Uga2VlcCBzaG93aW5nIChhbmRcblx0XHQvLyByZXRhaW5pbmcpIHRoZSBwcmV2aW91cyBlbGVtZW50J3MgdG9rZW4gYnJlYWtkb3duLlxuXHRcdHRlbXBsYXRlRGF0YS5yZXNwb25zZVRva2VuU3RhdHNIb3Zlci5jbGVhcigpO1xuXHR9XG5cblx0cHJpdmF0ZSByZW5kZXJNY3BTZXJ2ZXJzSW50ZXJhY3Rpb25SZXF1aXJlZChjb250ZW50OiBJQ2hhdE1jcFNlcnZlcnNTdGFydGluZyB8IElDaGF0TWNwU2VydmVyc1N0YXJ0aW5nU2VyaWFsaXplZCwgY29udGV4dDogSUNoYXRDb250ZW50UGFydFJlbmRlckNvbnRleHQsIHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogSUNoYXRDb250ZW50UGFydCB7XG5cdFx0cmV0dXJuIHRoaXMuaW5zdGFudGlhdGlvblNlcnZpY2UuY3JlYXRlSW5zdGFuY2UoQ2hhdE1jcFNlcnZlcnNJbnRlcmFjdGlvbkNvbnRlbnRQYXJ0LCBjb250ZW50LCBjb250ZXh0KTtcblx0fVxuXG5cdHByaXZhdGUgcmVuZGVyRGlzYWJsZWRDbGF1ZGVIb29rcyhjb250ZW50OiBJQ2hhdERpc2FibGVkQ2xhdWRlSG9va3NQYXJ0LCBjb250ZXh0OiBJQ2hhdENvbnRlbnRQYXJ0UmVuZGVyQ29udGV4dCk6IElDaGF0Q29udGVudFBhcnQge1xuXHRcdHJldHVybiB0aGlzLmluc3RhbnRpYXRpb25TZXJ2aWNlLmNyZWF0ZUluc3RhbmNlKENoYXREaXNhYmxlZENsYXVkZUhvb2tzQ29udGVudFBhcnQsIGNvbnRleHQpO1xuXHR9XG5cblx0ZGlzcG9zZVRlbXBsYXRlKHRlbXBsYXRlRGF0YTogSUNoYXRMaXN0SXRlbVRlbXBsYXRlKTogdm9pZCB7XG5cdFx0dGhpcy5jbGVhclJlbmRlcmVkUGFydHModGVtcGxhdGVEYXRhKTtcblx0XHR0ZW1wbGF0ZURhdGEudGVtcGxhdGVEaXNwb3NhYmxlcy5kaXNwb3NlKCk7XG5cdH1cblxuXHRwcml2YXRlIGhvdmVyVmlzaWJsZShyZXF1ZXN0SG92ZXI6IEhUTUxFbGVtZW50KSB7XG5cdFx0cmVxdWVzdEhvdmVyLnN0eWxlLm9wYWNpdHkgPSAnMSc7XG5cdH1cblxuXHRwcml2YXRlIGhvdmVySGlkZGVuKHJlcXVlc3RIb3ZlcjogSFRNTEVsZW1lbnQpIHtcblx0XHRyZXF1ZXN0SG92ZXIuc3R5bGUub3BhY2l0eSA9ICcwJztcblx0fVxuXG59XG5cbmV4cG9ydCBjbGFzcyBDaGF0TGlzdERlbGVnYXRlIGV4dGVuZHMgQ2FjaGVkTGlzdFZpcnR1YWxEZWxlZ2F0ZTxDaGF0VHJlZUl0ZW0+IHtcblx0Y29uc3RydWN0b3IoXG5cdFx0cHJpdmF0ZSByZWFkb25seSBkZWZhdWx0RWxlbWVudEhlaWdodDogbnVtYmVyLFxuXHQpIHtcblx0XHRzdXBlcigpO1xuXHR9XG5cblx0cHJvdGVjdGVkIGVzdGltYXRlSGVpZ2h0KGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IG51bWJlciB7XG5cdFx0Ly8gY3VycmVudFJlbmRlcmVkSGVpZ2h0IGlzIG5vdCBsb2FkLWJlYXJpbmcgaGVyZS0gcHJvYmFibHkgaWYgaXQncyBldmVyIHNldCwgdGhlbiB0aGUgc3VwZXJjbGFzcyBjYWNoZSB3aWxsIGhhdmUgdGhlIGhlaWdodC5cblx0XHRyZXR1cm4gZWxlbWVudC5jdXJyZW50UmVuZGVyZWRIZWlnaHQgPz8gdGhpcy5kZWZhdWx0RWxlbWVudEhlaWdodDtcblx0fVxuXG5cdGdldFRlbXBsYXRlSWQoZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogc3RyaW5nIHtcblx0XHRyZXR1cm4gQ2hhdExpc3RJdGVtUmVuZGVyZXIuSUQ7XG5cdH1cblxuXHRoYXNEeW5hbWljSGVpZ2h0KGVsZW1lbnQ6IENoYXRUcmVlSXRlbSk6IGJvb2xlYW4ge1xuXHRcdHJldHVybiB0cnVlO1xuXHR9XG5cblx0Z2V0TWVhc3VyZWRIZWlnaHQoZWxlbWVudDogQ2hhdFRyZWVJdGVtKTogbnVtYmVyIHwgdW5kZWZpbmVkIHtcblx0XHRyZXR1cm4gdGhpcy5nZXRDYWNoZWRIZWlnaHQoZWxlbWVudCk7XG5cdH1cbn1cblxuLyoqXG4gKiBDaGVjayBpZiBhIHRvb2wgaW52b2NhdGlvbiBpcyB0aGUgcGFyZW50IHN1YmFnZW50IHRvb2wgKHRoZSB0b29sIHRoYXQgc3Bhd25zIGEgc3ViYWdlbnQpLlxuICogQSBwYXJlbnQgc3ViYWdlbnQgdG9vbCBoYXMgc3ViYWdlbnQgdG9vbFNwZWNpZmljRGF0YSBidXQgbm8gc3ViQWdlbnRJbnZvY2F0aW9uSWQuXG4gKi9cbmZ1bmN0aW9uIGlzUGFyZW50U3ViYWdlbnRUb29sKGludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gaW52b2NhdGlvbi50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnICYmICFpbnZvY2F0aW9uLnN1YkFnZW50SW52b2NhdGlvbklkO1xufVxuXG4vKipcbiAqIEdldCB0aGUgc3ViYWdlbnQgaW52b2NhdGlvbiBJRCBmb3IgZ3JvdXBpbmcgdG9vbHMuXG4gKiBGb3IgcGFyZW50IHN1YmFnZW50IHRvb2xzLCB1c2UgdGhlaXIgdG9vbENhbGxJZC5cbiAqIEZvciBjaGlsZCB0b29scywgdXNlIHRoZWlyIHN1YkFnZW50SW52b2NhdGlvbklkLlxuICovXG5mdW5jdGlvbiBnZXRTdWJhZ2VudElkKGludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IHN0cmluZyB8IHVuZGVmaW5lZCB7XG5cdGlmIChpc1BhcmVudFN1YmFnZW50VG9vbChpbnZvY2F0aW9uKSkge1xuXHRcdHJldHVybiBpbnZvY2F0aW9uLnRvb2xDYWxsSWQ7XG5cdH1cblx0cmV0dXJuIGludm9jYXRpb24uc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG59XG5cbi8qKlxuICogQ2hlY2sgaWYgYSB0b29sIGludm9jYXRpb24gaXMgcGFydCBvZiBhIHN1YmFnZW50IChlaXRoZXIgcGFyZW50IG9yIGNoaWxkKS5cbiAqL1xuZnVuY3Rpb24gaXNTdWJhZ2VudFRvb2xJbnZvY2F0aW9uKGludm9jYXRpb246IElDaGF0VG9vbEludm9jYXRpb24gfCBJQ2hhdFRvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gISFnZXRTdWJhZ2VudElkKGludm9jYXRpb24pO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZ2V0V29ya2luZ1Byb2dyZXNzUmVsZXZhbnRQYXJ0cyhwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IElDaGF0UmVuZGVyZXJDb250ZW50W10ge1xuXHRyZXR1cm4gcGFydHMuZmlsdGVyKHBhcnQgPT4ge1xuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgcGFydC5raW5kID09PSAndG9vbEludm9jYXRpb25TZXJpYWxpemVkJykge1xuXHRcdFx0cmV0dXJuICFpc1N1YmFnZW50VG9vbEludm9jYXRpb24ocGFydCk7XG5cdFx0fVxuXHRcdGlmIChwYXJ0LmtpbmQgPT09ICdob29rJykge1xuXHRcdFx0cmV0dXJuICFwYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkO1xuXHRcdH1cblx0XHRyZXR1cm4gcGFydC5raW5kICE9PSAnbWFya2Rvd25Db250ZW50JyB8fCAhZXh0cmFjdFN1YkFnZW50SW52b2NhdGlvbklkRnJvbVRleHQocGFydC5jb250ZW50LnZhbHVlKTtcblx0fSk7XG59XG5cbmV4cG9ydCBmdW5jdGlvbiBlbmRzV2l0aEFjdGl2ZVN1YmFnZW50Q29udGVudChwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IGJvb2xlYW4ge1xuXHRjb25zdCBsYXN0UGFydCA9IGZpbmRMYXN0TWVhbmluZ2Z1bFBhcnQocGFydHMuZmlsdGVyKHBhcnQgPT4gIWlzTmVzdGVkU3ViYWdlbnRDb250ZW50KHBhcnQpKSk7XG5cdGlmICghbGFzdFBhcnQgfHwgKGxhc3RQYXJ0LmtpbmQgIT09ICd0b29sSW52b2NhdGlvbicgJiYgbGFzdFBhcnQua2luZCAhPT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdGlmICghaXNQYXJlbnRTdWJhZ2VudFRvb2wobGFzdFBhcnQpKSB7XG5cdFx0cmV0dXJuIGZhbHNlO1xuXHR9XG5cdHJldHVybiBsYXN0UGFydC50b29sU3BlY2lmaWNEYXRhPy5raW5kID09PSAnc3ViYWdlbnQnXG5cdFx0JiYgKGxhc3RQYXJ0LnRvb2xTcGVjaWZpY0RhdGEuaXNBY3RpdmUgPz8gIUlDaGF0VG9vbEludm9jYXRpb24uaXNDb21wbGV0ZShsYXN0UGFydCkpO1xufVxuXG5mdW5jdGlvbiBpc05lc3RlZFN1YmFnZW50Q29udGVudChwYXJ0OiBJQ2hhdFJlbmRlcmVyQ29udGVudCk6IGJvb2xlYW4ge1xuXHRpZiAocGFydC5raW5kID09PSAndG9vbEludm9jYXRpb24nIHx8IHBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpIHtcblx0XHRyZXR1cm4gISFwYXJ0LnN1YkFnZW50SW52b2NhdGlvbklkO1xuXHR9XG5cdGlmIChwYXJ0LmtpbmQgPT09ICdob29rJykge1xuXHRcdHJldHVybiAhIXBhcnQuc3ViQWdlbnRJbnZvY2F0aW9uSWQ7XG5cdH1cblx0cmV0dXJuIHBhcnQua2luZCA9PT0gJ21hcmtkb3duQ29udGVudCcgJiYgISFleHRyYWN0U3ViQWdlbnRJbnZvY2F0aW9uSWRGcm9tVGV4dChwYXJ0LmNvbnRlbnQudmFsdWUpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gZW5kc1dpdGhDb21wbGV0ZWRRdWVzdGlvbkludGVyYWN0aW9uKHBhcnRzOiByZWFkb25seSBJQ2hhdFJlbmRlcmVyQ29udGVudFtdKTogYm9vbGVhbiB7XG5cdGNvbnN0IGxhc3RQYXJ0ID0gZmluZExhc3RNZWFuaW5nZnVsUGFydChwYXJ0cyk7XG5cdGlmICghbGFzdFBhcnQpIHtcblx0XHRyZXR1cm4gZmFsc2U7XG5cdH1cblx0aWYgKGxhc3RQYXJ0LmtpbmQgPT09ICdxdWVzdGlvbkNhcm91c2VsJykge1xuXHRcdHJldHVybiAhIWxhc3RQYXJ0LmlzVXNlZDtcblx0fVxuXHRyZXR1cm4gKGxhc3RQYXJ0LmtpbmQgPT09ICd0b29sSW52b2NhdGlvbicgfHwgbGFzdFBhcnQua2luZCA9PT0gJ3Rvb2xJbnZvY2F0aW9uU2VyaWFsaXplZCcpXG5cdFx0JiYgaXNBc2tRdWVzdGlvbnNUb29sSW52b2NhdGlvbihsYXN0UGFydClcblx0XHQmJiBJQ2hhdFRvb2xJbnZvY2F0aW9uLmlzQ29tcGxldGUobGFzdFBhcnQpO1xufVxuXG5leHBvcnQgZnVuY3Rpb24gaXNXYWl0aW5nRm9yTWNwU2VydmVycyhwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IGJvb2xlYW4ge1xuXHRyZXR1cm4gcGFydHMuc29tZShwYXJ0ID0+IHBhcnQua2luZCA9PT0gJ21jcFNlcnZlcnNTdGFydGluZ1Nsb3cnICYmIHBhcnQuc2VydmVycy5nZXQoKS5sZW5ndGggPiAwKTtcbn1cblxuZnVuY3Rpb24gZmluZExhc3RNZWFuaW5nZnVsUGFydChwYXJ0czogcmVhZG9ubHkgSUNoYXRSZW5kZXJlckNvbnRlbnRbXSk6IElDaGF0UmVuZGVyZXJDb250ZW50IHwgdW5kZWZpbmVkIHtcblx0Zm9yIChsZXQgaSA9IHBhcnRzLmxlbmd0aCAtIDE7IGkgPj0gMDsgaS0tKSB7XG5cdFx0Y29uc3QgcGFydCA9IHBhcnRzW2ldO1xuXHRcdGlmIChwYXJ0LmtpbmQgIT09ICdtYXJrZG93bkNvbnRlbnQnIHx8IHBhcnQuY29udGVudC52YWx1ZS50cmltKCkubGVuZ3RoID4gMCkge1xuXHRcdFx0cmV0dXJuIHBhcnQ7XG5cdFx0fVxuXHR9XG5cdHJldHVybiB1bmRlZmluZWQ7XG59XG4iXSwKICAibWFw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QUksQ0FBQyxZQUFhLFNBQVMsU0FBUyxvQkFBb0IsU0FBUyxTQUFTLDRCQUE2QjtBQUN0RyxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksQ0FBQyxxQkFBcUIsUUFBUSxHQUFHO0FBQ3BDLFdBQU87QUFBQSxFQUNSO0FBQ0EsU0FBTyxTQUFTLGtCQUFrQixTQUFTLGVBQ3RDLFNBQVMsaUJBQWlCLFlBQVksQ0FBQyxvQkFBb0IsV0FBVyxRQUFRO0FBQ3BGO0FBRUEsU0FBUyx3QkFBd0IsTUFBcUM7QUFDckUsTUFBSSxLQUFLLFNBQVMsb0JBQW9CLEtBQUssU0FBUyw0QkFBNEI7QUFDL0UsV0FBTyxDQUFDLENBQUMsS0FBSztBQUFBLEVBQ2Y7QUFDQSxNQUFJLEtBQUssU0FBUyxRQUFRO0FBQ3pCLFdBQU8sQ0FBQyxDQUFDLEtBQUs7QUFBQSxFQUNmO0FBQ0EsU0FBTyxLQUFLLFNBQVMscUJBQXFCLENBQUMsQ0FBQyxvQ0FBb0MsS0FBSyxRQUFRLEtBQUs7QUFDbkc7QUFFTyxTQUFTLHFDQUFxQyxPQUFpRDtBQUNyRyxRQUFNLFdBQVcsdUJBQXVCLEtBQUs7QUFDN0MsTUFBSSxDQUFDLFVBQVU7QUFDZCxXQUFPO0FBQUEsRUFDUjtBQUNBLE1BQUksU0FBUyxTQUFTLG9CQUFvQjtBQUN6QyxXQUFPLENBQUMsQ0FBQyxTQUFTO0FBQUEsRUFDbkI7QUFDQSxVQUFRLFNBQVMsU0FBUyxvQkFBb0IsU0FBUyxTQUFTLCtCQUM1RCw2QkFBNkIsUUFBUSxLQUNyQyxvQkFBb0IsV0FBVyxRQUFRO0FBQzVDO0FBRU8sU0FBUyx1QkFBdUIsT0FBaUQ7QUFDdkYsU0FBTyxNQUFNLEtBQUssVUFBUSxLQUFLLFNBQVMsNEJBQTRCLEtBQUssUUFBUSxJQUFJLEVBQUUsU0FBUyxDQUFDO0FBQ2xHO0FBRUEsU0FBUyx1QkFBdUIsT0FBMEU7QUFDekcsV0FBUyxJQUFJLE1BQU0sU0FBUyxHQUFHLEtBQUssR0FBRyxLQUFLO0FBQzNDLFVBQU0sT0FBTyxNQUFNLENBQUM7QUFDcEIsUUFBSSxLQUFLLFNBQVMscUJBQXFCLEtBQUssUUFBUSxNQUFNLEtBQUssRUFBRSxTQUFTLEdBQUc7QUFDNUUsYUFBTztBQUFBLElBQ1I7QUFBQSxFQUNEO0FBQ0EsU0FBTztBQUNSOyIsCiAgIm5hbWVzIjogWyJlbGVtZW50IiwgIlJhdGUiLCAibmV3UGFydCIsICJwYXJ0IiwgImNvZGVCbG9ja3NCeVJlc3BvbnNlSWQiLCAiY3JlYXRlZFBhcnQiLCAiY3VycmVudFN0YXRlIiwgImxhc3RUaGlua2luZ1BhcnQiXQp9Cg==
